"""PDF 上传与入库进度接口"""
import logging
import os
import shutil
import uuid

from fastapi import APIRouter, HTTPException, File, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.services.ingestion import DocumentIngestionService
from app.core.config import settings
from app.core.exceptions import IngestionError, PDFParseError, DuplicateFileError
from app.services.progress import create_task, update_progress, mark_success, mark_error, get_progress
from app.database import get_db_session, UploadedFile, ParentDocument

logger = logging.getLogger(__name__)
router = APIRouter()


class UploadResponse(BaseModel):
    message: str
    filename: str
    task_id: str | None = None


def process_and_ingest_document(file_path: str, original_filename: str, task_id: str | None = None):
    logger.info(f"⏳ 后台任务开始：处理文件 {original_filename}")

    def on_progress(step: str, pct: int):
        if task_id:
            update_progress(task_id, step, pct)

    try:
        if task_id:
            update_progress(task_id, "启动解析引擎...", 10)
        ingestion_service = DocumentIngestionService()
        ingestion_service.run_pipeline(
            pdf_path=file_path,
            original_filename=original_filename,
            page_range=None,
            progress_callback=on_progress,
        )
        logger.info(f"✅ 后台任务完成：文件 {original_filename} 已成功入库。")
        if task_id:
            mark_success(task_id)
    except DuplicateFileError:
        logger.info(f"⏭️ 文件 {original_filename} 已存在，跳过入库。")
        if task_id:
            mark_error(task_id, "文件已存在")
    except PDFParseError as e:
        logger.error(f"❌ PDF 解析失败 [{original_filename}]: {e}", exc_info=True)
        if task_id:
            mark_error(task_id, f"PDF解析失败: {e}")
    except IngestionError as e:
        logger.error(f"❌ 入库失败 [{original_filename}]: {e}", exc_info=True)
        if task_id:
            mark_error(task_id, f"入库失败: {e}")
    except Exception as e:
        logger.error(f"❌ 未知错误 [{original_filename}]: {e}", exc_info=True)
        if task_id:
            mark_error(task_id, str(e))


@router.post("/upload", response_model=UploadResponse, summary="上传财报 PDF 并入库")
async def upload_document(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="只支持上传 PDF 文件")

    logger.info(f"📥 接收到文件上传请求: {file.filename}")

    raw_dir = settings.RAW_DATA_PATH
    os.makedirs(raw_dir, exist_ok=True)

    safe_filename = f"{uuid.uuid4().hex}.pdf"
    file_path = os.path.join(raw_dir, safe_filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error(f"文件保存失败: {str(e)}")
        raise HTTPException(status_code=500, detail="文件保存失败")
    finally:
        await file.close()

    task_id = uuid.uuid4().hex[:12]
    create_task(task_id, file.filename)
    background_tasks.add_task(process_and_ingest_document, file_path, file.filename, task_id)

    return UploadResponse(
        message="文件上传成功，系统正在后台解析入库。",
        filename=file.filename,
        task_id=task_id,
    )


@router.get("/upload/progress/{task_id}", summary="查询入库进度")
def get_upload_progress(task_id: str):
    progress = get_progress(task_id)
    if progress is None:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    return progress


# ==========================================
# 文件列表 & PDF 原文查看
# ==========================================

@router.get("/files", summary="列出已入库的 PDF 文件")
def list_files():
    """返回所有已入库的 PDF 文件元信息"""
    with get_db_session() as db:
        records = (
            db.query(UploadedFile)
            .order_by(UploadedFile.upload_time.desc())
            .all()
        )
        return [
            {
                "file_hash": r.file_hash,
                "file_name": r.file_name,
                "upload_time": r.upload_time.isoformat() if r.upload_time else None,
                "file_size": os.path.getsize(r.file_path) if r.file_path and os.path.exists(r.file_path) else 0,
            }
            for r in records
        ]


@router.get("/files/{file_hash}/view", summary="在线查看 PDF 原文")
def view_pdf(file_hash: str):
    """通过文件 hash 返回 PDF 文件流，浏览器可直接渲染"""
    with get_db_session() as db:
        record = db.query(UploadedFile).filter(UploadedFile.file_hash == file_hash).first()
        if not record:
            raise HTTPException(status_code=404, detail="文件不存在")
        if not record.file_path or not os.path.exists(record.file_path):
            raise HTTPException(status_code=404, detail="文件已被删除或路径无效")
        return FileResponse(record.file_path, media_type="application/pdf")


@router.delete("/files/{file_hash}", summary="删除已入库的 PDF 及全部关联数据")
def delete_file(file_hash: str):
    """级联删除 PostgreSQL 父块、Milvus 向量、磁盘文件、元数据记录"""
    logger.info(f"🗑️ 收到删除请求: file_hash={file_hash}")

    with get_db_session() as db:
        record = db.query(UploadedFile).filter(UploadedFile.file_hash == file_hash).first()
        if not record:
            raise HTTPException(status_code=404, detail="文件不存在")
        file_name = record.file_name
        file_path = record.file_path

        # 1. 删除 PostgreSQL 父块
        deleted_pg = 0
        try:
            deleted_pg = (
                db.query(ParentDocument)
                .filter(ParentDocument.meta_data["file_hash"].astext == file_hash)
                .delete(synchronize_session=False)
            )
            db.commit()
            logger.info(f"📦 已删除 {deleted_pg} 条父块记录")
        except Exception as e:
            db.rollback()
            logger.warning(f"⚠️ PostgreSQL 清理失败: {e}")

        # 2. 删除 Milvus 向量
        deleted_mv = 0
        try:
            from pymilvus import connections, Collection
            from app.core.config import settings as s
            connections.connect(alias="default", host=s.MILVUS_HOST, port=s.MILVUS_PORT)
            col = Collection(s.COLLECTION_NAME)
            col.load()
            expr = f'metadata["file_hash"] == "{file_hash}"'
            result = col.query(expr=expr, output_fields=["chunk_id"])
            chunk_ids = [r["chunk_id"] for r in result]
            if chunk_ids:
                deleted_mv = len(chunk_ids)
                col.delete(expr=f'chunk_id in {chunk_ids}')
                col.flush()
            logger.info(f"🧠 已删除 {deleted_mv} 条 Milvus 向量")
        except Exception as e:
            logger.warning(f"⚠️ Milvus 清理失败: {e}")

        # 3. 删除磁盘文件
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"💾 已删除磁盘文件: {file_path}")
            except Exception as e:
                logger.warning(f"⚠️ 磁盘文件删除失败: {e}")

        # 4. 删除元数据记录
        try:
            db.delete(record)
            db.commit()
            logger.info(f"✅ 文件 [{file_name}] 删除完成")
        except Exception as e:
            db.rollback()
            logger.warning(f"⚠️ 元数据记录删除失败: {e}")

    return {
        "status": "deleted",
        "file_name": file_name,
        "deleted_pg_chunks": deleted_pg,
        "deleted_mv_chunks": deleted_mv,
    }

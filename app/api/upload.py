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
from app.database import get_db_session, UploadedFile

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

"""PDF 上传与入库进度接口"""
import logging
import os
import shutil
import uuid

from fastapi import APIRouter, HTTPException, File, UploadFile, BackgroundTasks
from pydantic import BaseModel
from app.services.ingestion import DocumentIngestionService
from app.core.config import settings
from app.core.exceptions import IngestionError, PDFParseError, DuplicateFileError
from app.services.progress import create_task, update_progress, mark_success, mark_error, get_progress

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

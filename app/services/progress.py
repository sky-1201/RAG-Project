"""
文档入库进度追踪器（内存存储）。

前端可通过轮询 GET /api/v1/upload/progress/{task_id} 获取实时进度。
"""
import time
import threading
from typing import Dict, Optional

# 线程安全的进度存储
_lock = threading.Lock()
_tasks: Dict[str, dict] = {}

# 自动清理 1 小时前的任务
_MAX_AGE_SECONDS = 3600


def create_task(task_id: str, filename: str) -> None:
    with _lock:
        _tasks[task_id] = {
            "task_id": task_id,
            "filename": filename,
            "status": "pending",
            "step": "等待处理...",
            "progress_pct": 0,
            "created_at": time.time(),
        }


def update_progress(task_id: str, step: str, progress_pct: int = 0) -> None:
    with _lock:
        if task_id in _tasks:
            _tasks[task_id]["status"] = "running"
            _tasks[task_id]["step"] = step
            _tasks[task_id]["progress_pct"] = progress_pct


def mark_success(task_id: str) -> None:
    with _lock:
        if task_id in _tasks:
            _tasks[task_id]["status"] = "success"
            _tasks[task_id]["step"] = "入库完成"
            _tasks[task_id]["progress_pct"] = 100


def mark_error(task_id: str, error: str) -> None:
    with _lock:
        if task_id in _tasks:
            _tasks[task_id]["status"] = "error"
            _tasks[task_id]["error"] = error


def get_progress(task_id: str) -> Optional[dict]:
    with _lock:
        task = _tasks.get(task_id)
        if task is None:
            return None
        # 清理过期任务
        if time.time() - task["created_at"] > _MAX_AGE_SECONDS:
            del _tasks[task_id]
            return None
        return dict(task)

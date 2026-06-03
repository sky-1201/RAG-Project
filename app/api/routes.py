"""
启动命令:
  后端:   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
  数据库: docker compose up -d postgres-v2 standalone-v2 etcd-v2 minio-v2
  全部:   docker compose up -d

面板入口:
  React 前端:  http://localhost:5173 (dev) / http://localhost:8502 (Docker)
  API 文档:    http://localhost:8000/docs
  Milvus Attu: http://localhost:8002
  pgAdmin:     http://localhost:5050  (admin@rag.com / admin)
"""

from fastapi import APIRouter
from app.api.chat import router as chat_router
from app.api.upload import router as upload_router
from app.api.conversations import router as conversations_router

router = APIRouter()
router.include_router(chat_router)
router.include_router(upload_router)
router.include_router(conversations_router)

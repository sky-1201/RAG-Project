import app.core.logger  # 第一行导入，确保全局日志初始化立即生效
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.auth import AuthMiddleware
from app.api.routes import router
from app.database import init_db

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    description="基于版面分析与 Agentic 架构的智能金融投研 RAG 系统",
    version="1.0.0"
)

# CORS 中间件（开发/生产通过 .env 中的 CORS_ORIGINS 控制）
cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 鉴权中间件
app.add_middleware(AuthMiddleware)

# 挂载业务路由
app.include_router(router, prefix="/api/v1")

# 独立的 Health 端点（绕过 /api/v1 前缀和鉴权中间件）
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.APP_NAME}


@app.on_event("startup")
async def startup_event():
    logger.info("🚀 FastAPI 后端服务已启动！")
    logger.info(f"📚 接口文档地址: http://{settings.API_HOST}:{settings.API_PORT}/docs")
    logger.info("⏳ 正在初始化 PostgreSQL 表结构...")
    init_db()

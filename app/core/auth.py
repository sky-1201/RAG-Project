"""
API 鉴权中间件：校验请求 Header 中的 Authorization Bearer token。
"""
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.config import settings

logger = logging.getLogger(__name__)

# 不需要鉴权的路径前缀
_PUBLIC_PREFIXES = ("/health", "/docs", "/openapi.json", "/redoc")


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 公开端点直接放行
        path = request.url.path.rstrip("/")
        if any(path == pfx or path.startswith(pfx + "/") or path.startswith(pfx + "?") for pfx in _PUBLIC_PREFIXES):
            return await call_next(request)

        # 校验 Authorization Header
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "缺少认证令牌"})

        token = auth[len("Bearer "):]
        if token != settings.API_SECRET_KEY:
            return JSONResponse(status_code=403, content={"detail": "认证令牌无效"})

        return await call_next(request)

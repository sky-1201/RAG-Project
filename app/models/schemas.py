from pydantic import BaseModel, Field
from typing import Optional

class HistoryMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    """前端发给后端的聊天请求模型"""
    query: str = Field(..., description="用户的提问内容", min_length=1, max_length=1000)
    history: Optional[list[HistoryMessage]] = Field(default=[], description="对话历史")

class ChatResponse(BaseModel):
    """标准同步响应模型（备用）"""
    answer: str
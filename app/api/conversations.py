"""对话历史 CRUD 接口"""
import logging
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database import get_db_session, Conversation

logger = logging.getLogger(__name__)
router = APIRouter()


class ConversationCreate(BaseModel):
    title: str = "新对话"
    messages: list = []

class ConversationUpdate(BaseModel):
    title: str | None = None
    messages: list | None = None


@router.get("/conversations", summary="获取对话列表")
def list_conversations(limit: int = 20, offset: int = 0):
    """返回对话摘要列表（分页），按更新时间倒序"""
    with get_db_session() as db:
        total = db.query(Conversation).count()
        rows = (
            db.query(Conversation)
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
        return {
            "items": [
                {
                    "id": c.id,
                    "title": c.title,
                    "message_count": len(c.messages or []),
                    "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                }
                for c in rows
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }


@router.get("/conversations/{conv_id}", summary="获取对话详情")
def get_conversation(conv_id: str):
    with get_db_session() as db:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if not conv:
            raise HTTPException(status_code=404, detail="对话不存在")
        return {
            "id": conv.id,
            "title": conv.title,
            "messages": conv.messages,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        }


@router.post("/conversations", summary="创建/保存对话")
def save_conversation(body: ConversationCreate):
    conv_id = uuid.uuid4().hex
    with get_db_session() as db:
        conv = Conversation(
            id=conv_id,
            title=body.title,
            messages=body.messages,
        )
        db.add(conv)
        db.commit()
    return {"id": conv_id, "title": body.title}


@router.put("/conversations/{conv_id}", summary="更新对话")
def update_conversation(conv_id: str, body: ConversationUpdate):
    with get_db_session() as db:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if not conv:
            raise HTTPException(status_code=404, detail="对话不存在")
        if body.title is not None:
            conv.title = body.title
        if body.messages is not None:
            conv.messages = body.messages
        db.commit()
    return {"id": conv_id, "status": "updated"}


@router.delete("/conversations/{conv_id}", summary="删除对话")
def delete_conversation(conv_id: str):
    with get_db_session() as db:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if not conv:
            raise HTTPException(status_code=404, detail="对话不存在")
        db.delete(conv)
        db.commit()
    return {"status": "deleted"}

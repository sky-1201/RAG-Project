"""Agentic RAG 流式问答接口"""
import json
import logging

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest
from app.core.dependencies import get_agent_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat/stream", summary="Agentic RAG 流式问答接口")
async def chat_stream_endpoint(request: ChatRequest):
    logger.info(f"🌐 API 接收到流式请求: {request.query}")

    agent_service = get_agent_service()

    # 拼接完整对话上下文：system prompt + 历史消息 + 当前问题
    messages = [("system", agent_service.system_prompt)]
    for msg in (request.history or []):
        role = "user" if msg.role == "user" else "assistant"
        messages.append((role, msg.content))
    messages.append(("user", request.query))

    async def event_generator():
        full_response = ""  # 累积 AI 的完整回答，用于流结束后写入长期记忆
        try:
            async for event in agent_service.agent_executor.astream_events(
                    {"messages": messages},
                    version="v2"
            ):
                kind = event["event"]

                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"].content
                    if chunk:
                        full_response += chunk
                        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

                elif kind == "on_tool_start":
                    tool_name = event["name"]
                    logger.info(f"🛠️ Agent 调用工具: {tool_name}")
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name})}\n\n"

                elif kind == "on_tool_end":
                    tool_name = event["name"]
                    logger.info(f"✅ 工具调用完成: {tool_name}")
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name})}\n\n"

            # ==========================================
            # 流结束：异步写入长期记忆（静默失败，不影响对话）
            # ==========================================
            if full_response.strip():
                try:
                    from app.core.dependencies import get_memory_service
                    memory_svc = get_memory_service()
                    memory_svc.store_episode(
                        query=request.query,
                        answer=full_response.strip(),
                    )
                except Exception as mem_err:
                    logger.warning(f"🧠 长期记忆写入失败（不影响对话）: {mem_err}")

            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"❌ 流式输出异常: {str(e)}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': '服务器内部推理错误'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

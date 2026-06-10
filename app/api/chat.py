"""Agentic RAG 流式问答接口"""
import json
import logging
import re

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest
from app.core.dependencies import get_agent_service
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _parse_sources(output_text: str) -> list[dict]:
    """
    从检索工具的输出中提取引用来源信息。
    工具输出格式: --- 证据 N [来源: 文件名, 相关度: 0.95, 页码: 42, hash: abc123] ---

    返回去重后的来源列表，附带页码、文件哈希和原文片段预览。
    """
    # 按证据块拆分
    blocks = re.split(r'--- 证据 \d+ \[(.*?)\] ---', output_text)
    # blocks[0] = 前言（无效），之后交替: metadata, content, metadata, content...
    sources = []
    _dedup_keys: list[str] = []
    for i in range(1, len(blocks), 2):
        meta_str = blocks[i]
        content = blocks[i + 1].strip() if i + 1 < len(blocks) else ""

        file_match = re.search(r'来源:\s*(.*?)(?:,\s*相关度|$)', meta_str)
        score_match = re.search(r'相关度:\s*([\d.]+)', meta_str)
        page_match = re.search(r'页码:\s*(\d+)', meta_str)
        hash_match = re.search(r'hash:\s*(\w+)', meta_str)

        file_name = file_match.group(1).strip() if file_match else "未知文件"
        page_num = int(page_match.group(1)) if page_match else 1
        # 按 (文件名 + 页码) 去重：同文件同页只保留第一条，不同页码各自展示
        dedup_key = f"{file_name}|{page_num}"
        if any(k == dedup_key for k in _dedup_keys):
            continue
        _dedup_keys.append(dedup_key)
        sources.append({
            "file": file_name,
            "score": score_match.group(1) if score_match else "N/A",
            "page_number": page_num,
            "file_hash": hash_match.group(1) if hash_match else "",
            "snippet": content[:200] if content else "",
        })
    return sources


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
                    version="v2",
                    config={"recursion_limit": settings.AGENT_MAX_STEPS},
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

                    # 🆕 检索工具执行完毕 → 从输出中提取引用来源，推送给前端
                    if tool_name == "financial_retriever_tool":
                        output = event["data"].get("output", "")
                        output_text = output.content if hasattr(output, "content") else str(output)
                        sources = _parse_sources(output_text)
                        if sources:
                            logger.info(f"📎 提取到 {len(sources)} 个引用来源: {[s['file'] for s in sources]}")
                            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name})}\n\n"

            # ==========================================
            # 流结束：异步写入长期记忆（静默失败，不影响对话）
            # ==========================================
            if full_response.strip():
                try:
                    import asyncio
                    from app.core.dependencies import get_memory_service
                    memory_svc = get_memory_service()
                    # fire-and-forget：扔到线程池执行，不阻塞 SSE 流结束
                    asyncio.create_task(
                        asyncio.to_thread(
                            memory_svc.store_episode,
                            query=request.query,
                            answer=full_response.strip(),
                        )
                    )
                except Exception as mem_err:
                    logger.warning(f"🧠 长期记忆写入失败（不影响对话）: {mem_err}")

            yield "data: [DONE]\n\n"

        except RecursionError:
            logger.error(
                f"🛑 Agent 达到最大步数限制 ({settings.AGENT_MAX_STEPS})，任务可能过于复杂或陷入循环。"
            )
            yield f"data: {json.dumps({'type': 'error', 'message': f'Agent 推理步数超过了上限 ({settings.AGENT_MAX_STEPS} 步)，请简化问题后重试。'})}\n\n"

        except Exception as e:
            logger.error(f"❌ 流式输出异常: {str(e)}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': '服务器内部推理错误'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

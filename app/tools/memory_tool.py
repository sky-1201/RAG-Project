"""
Agent 长期记忆检索工具。

当用户引用之前对话中的信息（"上次那个"、"你刚才说过"、"之前聊过"），
Agent 调用此工具从 Milvus 语义检索历史 Q&A 片段。
"""
import logging
from langchain_core.tools import tool
from app.core.dependencies import get_memory_service

logger = logging.getLogger(__name__)


@tool
def memory_retriever_tool(query: str) -> str:
    """
    当你需要回顾之前与用户的对话、查找历史记忆时，调用此工具。
    适用场景：
    - 用户说"上次提到的那个数据"、"刚才我们聊过的"、"之前分析过的公司"
    - 用户引用之前对话中出现过的信息但你没有在当前上下文中看到
    - 用户问"你还记得吗"、"之前你给的结论是什么"

    输入参数：
    - query: 用于搜索记忆的关键词或问题，例如"深信服毛利率"、"上次分析的网络安全公司"

    返回：与 query 语义相关的历史对话片段。如果没有找到相关记忆，会返回空结果。
    """

    logger.info(f"🧠 Agent 调用记忆检索工具 | 搜索: {query}")

    try:
        memory_service = get_memory_service()
        results = memory_service.search_memories(query)

        if not results:
            return "（长期记忆库中没有找到与该问题相关的历史记录。）"

        parts = []
        for i, r in enumerate(results):
            parts.append(f"--- 历史记忆 {i + 1} [相关度: {r.get('score', 'N/A')}] ---\n{r.get('text', '')}\n")

        return "\n".join(parts)

    except Exception as e:
        logger.error(f"❌ 记忆检索工具执行失败: {str(e)}", exc_info=True)
        return "记忆检索系统发生内部错误，请告知用户你无法获取历史记忆，但仍可基于当前上下文回答。"

import logging
from langchain_core.tools import tool
from app.core.dependencies import get_retrieval_service

logger = logging.getLogger(__name__)


@tool
def financial_retriever_tool(query: str, company: str = None, year: str = None) -> str:
    """
    当你需要查询真实客观的上市公司的财务数据、业务情况、联系人等信息时，必须优先调用此工具。
    输入参数：
    - query: 具体的查询问题，例如"研发费用是多少？"、"联系人及联系方式是什么？"
    - company: 公司名称，例如"深信服"（可选，用户未指定时严禁自行猜测）
    - year: 年份，例如"2025"（可选。⚠️ 极度重要警告：如果用户提问中没有明确说出具体的年份，你必须将此参数保留为空(null/None)，绝对不允许使用默认值或自行猜测年份！）

    返回：
    包含上下文片段的纯文本，请仔细阅读返回的文本以提取事实。
    """

    logger.info(f"🛠️ Agent 决定调用检索工具 | 搜索词: {query} | 公司: {company} | 年份: {year}")

    try:
        retrieval_service = get_retrieval_service()
        docs = retrieval_service.run_pipeline(query=query, company=company, year=year)

        if not docs:
            return "数据库中未检索到相关财报信息。请告知用户没有查到，不要自行编造。"

        context_parts = []
        for i, d in enumerate(docs):
            source = d.metadata.get("source", "未知文件")
            score = d.metadata.get("rerank_score", "N/A")
            page = d.metadata.get("page_number", "")
            file_hash = d.metadata.get("file_hash", "")
            context_parts.append(
                f"--- 证据 {i + 1} [来源: {source}, 相关度: {score}"
                + (f", 页码: {page}" if page else "")
                + (f", hash: {file_hash}" if file_hash else "")
                + f"] ---\n{d.page_content}\n"
            )

        return "\n".join(context_parts)

    except Exception as e:
        logger.error(f"❌ 检索工具执行失败: {str(e)}", exc_info=True)
        return "检索系统发生内部错误，请稍后重试。"

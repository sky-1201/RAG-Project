import logging
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from app.core.config import settings
from app.prompts.loader import load_prompt
from app.tools.finance_repl import python_repl_tool
from app.tools.retriever_tool import financial_retriever_tool
from app.tools.memory_tool import memory_retriever_tool

logger = logging.getLogger(__name__)


class FinancialAgentService:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.DASHSCOPE_API_KEY,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            temperature=settings.LLM_TEMPERATURE,
            streaming=True
        )
        self.tools = [financial_retriever_tool, python_repl_tool, memory_retriever_tool]

        # 从 YAML 模板加载 system prompt（修改模板后重启即可生效）
        prompt_config = load_prompt("financial_agent")
        self.system_prompt = prompt_config["system_prompt"].strip()

        self.agent_executor = create_react_agent(self.llm, self.tools)

    def chat(self, query: str, history: list[dict] | None = None) -> str:
        """同步接口（供评测脚本使用），支持多轮对话历史。"""
        logger.info("=" * 50)
        logger.info(f"👤 用户提问: {query}")

        messages = [("system", self.system_prompt)]
        for msg in (history or []):
            role = "user" if msg.get("role") == "user" else "assistant"
            messages.append((role, msg.get("content", "")))
        messages.append(("user", query))

        try:
            response = self.agent_executor.invoke(
                {"messages": messages},
                config={"recursion_limit": settings.AGENT_MAX_STEPS},
            )
            return response["messages"][-1].content
        except RecursionError:
            logger.error(
                f"🛑 Agent 达到最大步数限制 ({settings.AGENT_MAX_STEPS})，任务可能过于复杂。"
            )
            return f"分析任务过于复杂，超过了推理步数上限 ({settings.AGENT_MAX_STEPS} 步)。请简化问题后重试。"
        except Exception as e:
            logger.error(f"❌ Agent 崩溃: {str(e)}", exc_info=True)
            return "分析系统遇到内部错误，请稍后重试。"
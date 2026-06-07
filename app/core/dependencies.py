"""
统一的服务依赖管理中心。

所有服务通过 factory 函数获取，支持：
- 生产环境：惰性单例 (functools.lru_cache)
- 测试环境：通过 setter 注入 mock
"""
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

# ==========================================
# 可替换的服务实例（测试注入点）
# ==========================================
_retrieval_service = None
_agent_service = None
_memory_service = None


# ---------- RetrievalService ----------

def get_retrieval_service():
    """
    获取 RetrievalService 的单例实例。
    测试时可通过 set_retrieval_service(mock) 注入。
    """
    global _retrieval_service
    if _retrieval_service is not None:
        return _retrieval_service

    from app.services.retrieval import RetrievalService
    _retrieval_service = RetrievalService()
    logger.info("🔌 RetrievalService 单例已创建")
    return _retrieval_service


def set_retrieval_service(service):
    """注入自定义 RetrievalService（测试用）"""
    global _retrieval_service
    _retrieval_service = service


# ---------- FinancialAgentService ----------

def get_agent_service():
    """
    获取 FinancialAgentService 的单例实例。
    测试时可通过 set_agent_service(mock) 注入。
    """
    global _agent_service
    if _agent_service is not None:
        return _agent_service

    from app.services.agent import FinancialAgentService
    _agent_service = FinancialAgentService()
    logger.info("🤖 FinancialAgentService 单例已创建")
    return _agent_service


def set_agent_service(service):
    """注入自定义 FinancialAgentService（测试用）"""
    global _agent_service
    _agent_service = service


# ---------- MemoryService ----------

def get_memory_service():
    """
    获取 MemoryService 的单例实例。
    测试时可通过 set_memory_service(mock) 注入。
    """
    global _memory_service
    if _memory_service is not None:
        return _memory_service

    from app.services.memory import MemoryService
    _memory_service = MemoryService()
    logger.info("🧠 MemoryService 单例已创建")
    return _memory_service


def set_memory_service(service):
    """注入自定义 MemoryService（测试用）"""
    global _memory_service
    _memory_service = service

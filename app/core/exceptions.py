"""
业务自定义异常层级。

所有自定义异常继承 FinanceRAGError，便于统一捕获和日志分级：
- 可恢复 (Recoverable): 可自动重试或降级
- 不可恢复 (Fatal): 需要人工介入
"""


class FinanceRAGError(Exception):
    """所有业务异常的基础类。"""


# ==========================================
# 入库相关异常
# ==========================================

class IngestionError(FinanceRAGError):
    """文档入库流程失败。"""


class DuplicateFileError(IngestionError):
    """文件已入库（MD5 重复），非致命。"""


class PDFParseError(IngestionError):
    """PDF 解析失败。"""


class EmbeddingAPIError(IngestionError):
    """Embedding API 调用失败，可重试。"""


class MilvusInsertError(IngestionError):
    """Milvus 向量写入失败，触发补偿回滚。"""


# ==========================================
# 检索相关异常
# ==========================================

class RetrievalError(FinanceRAGError):
    """检索流程失败。"""


class RerankError(RetrievalError):
    """Rerank 调用失败，可降级跳过。"""


class ParentFetchError(RetrievalError):
    """PostgreSQL 父块查询失败。"""


# ==========================================
# Agent / 模型相关异常
# ==========================================

class ModelAPIError(FinanceRAGError):
    """LLM API 调用失败（网络超时、限流等）。"""


class ToolExecutionError(FinanceRAGError):
    """Agent 工具执行异常。"""


# ==========================================
# 数据库相关异常
# ==========================================

class DatabaseError(FinanceRAGError):
    """数据库连接或查询失败。"""

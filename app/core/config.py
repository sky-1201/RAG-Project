import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
import os
from dotenv import load_dotenv

# 加载 .env 文件（如果有的话）
load_dotenv()


class Settings(BaseSettings):
    # --- 基础配置 ---
    APP_NAME: str = "Financial_Agentic_RAG"
    DEBUG: bool = True
    API_SECRET_KEY: str = "finance-rag-dev-key"  # 生产环境请在 .env 中覆盖

    # --- 模型 API 配置 ---
    DASHSCOPE_API_KEY: str  # 必须在 .env 中配置，否则启动报错
    EMBEDDING_MODEL: str = "text-embedding-v4"  # 阿里最新的大模型嵌入 API
    EMBEDDING_DIM: int = 1024                    # text-embedding-v4 输出维度
    LLM_MODEL: str = "qwen3.7-max"                  # Agent 推理模型
    RERANK_MODEL: str = "gte-rerank-v2"          # Rerank 重排序模型
    """
    # --- Milvus 向量库配置 (Docker Standalone 模式) ---本地后端模式
    MILVUS_HOST: str = "127.0.0.1"
    MILVUS_PORT: str = "19531"
    COLLECTION_NAME: str = "finance_reports_v3"
    """

    # --- Milvus 向量库配置 ---
    # 优先从环境变量读取，如果没有，再默认使用本地的 127.0.0.1
    MILVUS_HOST: str = os.getenv("MILVUS_HOST", "127.0.0.1")
    MILVUS_PORT: str = os.getenv("MILVUS_PORT", "19530")  # 注意：这里默认最好也填原生的 19530
    COLLECTION_NAME: str = os.getenv("COLLECTION_NAME", "finance_reports_v3")

    # --- Chunking 策略配置
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50

    # --- PDF 解析配置
    PDF_BATCH_PAGES: int = 30          # Docling 每批解析页数
    EMBEDDING_BATCH_SIZE: int = 10     # Embedding API 每批文本数
    EMBEDDING_MAX_TEXT_LENGTH: int = 8000  # 单条文本 Embedding 截断长度
    EMBEDDING_RETRY_TIMES: int = 3     # API 调用失败重试次数

    # --- 元数据 LLM 兜底提取（文件名解析失败时自动触发）
    METADATA_LLM_ENABLED: bool = True       # 是否启用 LLM 从正文提取公司名/年份
    METADATA_LLM_MODEL: str = "qwen-turbo"  # 用便宜的模型即可（只需提取两个字段）
    METADATA_LLM_PREVIEW_CHARS: int = 2000  # 取 PDF 前 N 个字符送给 LLM

    # --- 双路检索配置
    HYBRID_DENSE_LIMIT: int = 60       # Dense 召回候选数
    HYBRID_SPARSE_LIMIT: int = 40      # Sparse 召回候选数
    HYBRID_RRF_K: int = 60             # RRF 融合参数
    HYBRID_TOP_K: int = 15             # 融合后保留子块数
    RERANK_TOP_N: int = 5              # Rerank 后保留父块数

    # --- Agent 配置
    LLM_TEMPERATURE: float = 0.01
    AGENT_MAX_STEPS: int = 10              # Agent 最大执行步数（防止无限循环）
    MEMORY_ENABLED: bool = True             # 是否启用长期记忆（跨对话语义检索）
    MEMORY_COLLECTION_NAME: str = "long_term_memories"
    MEMORY_SEARCH_TOP_K: int = 3            # 记忆召回数量

    API_HOST: str = "127.0.0.1"
    API_PORT: int = 8000

    # --- CORS 跨域配置（部署时改为服务器域名）---
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8502"

    # --- 路径配置 ---
    RAW_DATA_PATH: str = "data/raw"
    PROCESSED_DATA_PATH: str = "data/processed"

    # Pydantic V2 读取环境变量的标准写法
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


# 实例化单例，整个项目都可以 import 这个 settings
settings = Settings()

# 全局日志配置 (放到 config 里统一管理)
logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
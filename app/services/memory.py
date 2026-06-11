"""
Agent 长期记忆服务。

每轮对话结束后自动将 Q&A 对存入 Milvus + PostgreSQL，
后续对话中 Agent 可通过 memory_retriever_tool 语义检索历史记忆。

存储架构（复用现有基础设施）：
- Milvus (long_term_memories): Dense(1024维) + Sparse(BM25) 双向量，用于语义检索
- PostgreSQL (long_term_memories 表): 存储原文，用于回填完整内容
"""
import logging
import uuid
from typing import Optional

import jieba
from langchain_community.embeddings import DashScopeEmbeddings
from pymilvus import (
    connections,
    utility,
    Collection,
    CollectionSchema,
    FieldSchema,
    DataType,
)
from pymilvus.model.sparse import BM25EmbeddingFunction

from app.core.config import settings
from app.database import get_db_session, LongTermMemory
from app.services.hybrid_search import HybridSearchEngine

logger = logging.getLogger(__name__)


class MemoryService:
    """长期记忆服务：存储对话片段，支持跨对话语义检索。"""

    def __init__(self):
        self._collection: Optional[Collection] = None
        self._engine: Optional[HybridSearchEngine] = None

        # 复用 Embedding 模型（与检索共用同一 API）
        self.embeddings = DashScopeEmbeddings(
            model=settings.EMBEDDING_MODEL,
            dashscope_api_key=settings.DASHSCOPE_API_KEY,
        )

        # 连接 Milvus（带重试，生产环境 Milvus 启动较慢需要更多次重试）
        for attempt in range(1, 8):
            try:
                connections.connect(
                    alias="default",
                    host=settings.MILVUS_HOST,
                    port=settings.MILVUS_PORT,
                )
                logger.info("🧠 MemoryService: Milvus 连接成功")
                break
            except Exception:
                if attempt < 7:
                    import time as _t; _t.sleep(2)
                else:
                    logger.warning("⚠️ MemoryService: Milvus 连接失败，长期记忆功能不可用")

    # ==========================================
    # 内部：Milvus Collection 惰性初始化
    # ==========================================

    def _get_collection(self) -> Collection:
        """获取记忆 Collection，不存在则自动创建（与 ingestion 建表逻辑一致）。"""
        if self._collection is not None:
            return self._collection

        collection_name = settings.MEMORY_COLLECTION_NAME

        if not utility.has_collection(collection_name):
            logger.info(f"🧠 创建长期记忆向量表: {collection_name}")

            fields = [
                FieldSchema(name="chunk_id", dtype=DataType.VARCHAR, is_primary=True, max_length=65535),
                FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
                FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=settings.EMBEDDING_DIM),
                FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),
                FieldSchema(name="metadata", dtype=DataType.JSON),
            ]
            schema = CollectionSchema(fields, "Agent Long-Term Memory Store", enable_dynamic_field=True)
            collection = Collection(collection_name, schema)

            # Dense 向量索引
            collection.create_index("dense_vector", {
                "index_type": "AUTOINDEX",
                "metric_type": "L2",
                "params": {},
            })

            # Sparse 向量索引
            collection.create_index("sparse_vector", {
                "index_type": "SPARSE_INVERTED_INDEX",
                "metric_type": "IP",
                "params": {"drop_ratio_build": 0.2},
            })

            logger.info("✅ 长期记忆向量表及双路索引创建完成！")
        else:
            collection = Collection(collection_name)

        collection.load()
        self._collection = collection
        return self._collection

    def _get_engine(self) -> HybridSearchEngine:
        """惰性获取双路检索引擎（复用于记忆检索）。"""
        if self._engine is None:
            self._engine = HybridSearchEngine()
        return self._engine

    # ==========================================
    # 公开方法
    # ==========================================

    def store_episode(
        self,
        query: str,
        answer: str,
        metadata: Optional[dict] = None,
    ) -> bool:
        """
        将一轮 Q&A 存入长期记忆（Milvus 向量 + PostgreSQL 原文）。

        调用时机：每轮对话 SSE 流结束后，异步写入。
        失败不影响对话体验，仅记录 warning 日志。
        """
        if not settings.MEMORY_ENABLED:
            return False

        memory_text = f"[用户问题] {query}\n[AI回答] {answer}"
        meta = dict(metadata or {})
        memory_id = uuid.uuid4().hex

        try:
            # --- 分支 1：写入 PostgreSQL 存储原文 ---
            with get_db_session() as db:
                record = LongTermMemory(
                    id=memory_id,
                    user_query=query,
                    assistant_answer=answer,
                    memory_text=memory_text,
                    meta_data=meta,
                )
                db.add(record)
                db.commit()
                logger.debug(f"🧠 长期记忆已写入 PostgreSQL: {memory_id[:12]}")

            # --- 分支 2：写入 Milvus 存储向量 ---
            collection = self._get_collection()

            # 截断超长文本（Embedding API 有限制）
            trunc_text = memory_text[:settings.EMBEDDING_MAX_TEXT_LENGTH]

            # Dense 向量（云端 API）
            dense_vec = self.embeddings.embed_query(trunc_text)

            # Sparse 向量（本地 BM25）
            analyzer = BM25EmbeddingFunction(analyzer=jieba.lcut)
            analyzer.fit([trunc_text])
            sparse_matrix = analyzer.encode_documents([trunc_text])
            sparse_dict = {
                int(k): float(v)
                for k, v in zip(sparse_matrix.indices, sparse_matrix.data)
            }

            collection.insert([
                [memory_id],       # chunk_id
                [trunc_text],       # text
                [dense_vec],        # dense_vector
                [sparse_dict],      # sparse_vector
                [meta],             # metadata
            ])
            collection.flush()
            logger.debug(f"🧠 长期记忆已写入 Milvus: {memory_id[:12]}")

            return True

        except Exception as e:
            # 静默失败 — 记忆存储是辅助功能，不影响核心对话
            logger.warning(f"⚠️ 长期记忆存储失败: {e}")
            return False

    def search_memories(self, query: str, top_k: Optional[int] = None) -> list[dict]:
        """
        语义检索历史记忆（双路召回 + RRF 融合）。

        返回格式: [{"text": str, "metadata": dict, "score": float}, ...]
        """
        if top_k is None:
            top_k = settings.MEMORY_SEARCH_TOP_K

        try:
            collection = self._get_collection()
            engine = self._get_engine()

            # 生成查询 Dense 向量
            query_dense_vec = self.embeddings.embed_query(
                query[:settings.EMBEDDING_MAX_TEXT_LENGTH]
            )

            # 复用双路检索引擎
            results = engine.execute_search(
                query=query,
                query_dense_vec=query_dense_vec,
                collection=collection,
                expr=None,  # 记忆检索不做元数据过滤
                top_k=top_k,
            )

            return results

        except Exception as e:
            logger.warning(f"⚠️ 记忆检索失败: {e}")
            return []

import logging
import dashscope
from typing import List, Optional
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_core.documents import Document
from app.core.config import settings
from app.core.exceptions import RetrievalError, RerankError, ParentFetchError, ModelAPIError
from app.services.hybrid_search import HybridSearchEngine

from pymilvus import connections, Collection
from app.database import get_db_session, ParentDocument

logger = logging.getLogger(__name__)


class RetrievalService:
    def __init__(self):
        dashscope.api_key = settings.DASHSCOPE_API_KEY

        self.embeddings = DashScopeEmbeddings(
            model=settings.EMBEDDING_MODEL,
            dashscope_api_key=settings.DASHSCOPE_API_KEY
        )

        # Milvus 连接重试（生产环境 Milvus 启动慢，延长重试窗口）
        for attempt in range(1, 8):
            try:
                connections.connect(
                    alias="default",
                    host=settings.MILVUS_HOST,
                    port=settings.MILVUS_PORT
                )
                logger.info("🔌 底层原生 PyMilvus 连接激活成功！")
                break
            except Exception as e:
                if attempt < 7:
                    logger.info(f"⏳ Milvus 连接重试 {attempt}/7 ...")
                    import time as _t; _t.sleep(2)
                else:
                    logger.warning(f"⚠️ PyMilvus 连接复用提示: {e}")

        self.collection = Collection(settings.COLLECTION_NAME)
        self.collection.load()
        logger.info("📦 Milvus 数据表已成功加载到内存，随时可以检索。")

        #  实例化全新的双路检索引擎
        self.hybrid_engine = HybridSearchEngine()

    def _fetch_parent_chunks(self, child_docs: list) -> list:
        """从 PostgreSQL 中极速提取完整父块 (此方法极为优秀，原样保留)"""
        if not child_docs:
            return []

        parent_ids = list(set([
            doc.metadata.get("parent_id")
            for doc in child_docs
            if doc.metadata.get("parent_id")
        ]))

        if not parent_ids:
            logger.warning("⚠️ 命中的子块中没有找到 parent_id！")
            return []

        logger.info(f"🔗 正在从 PostgreSQL 中提取 {len(parent_ids)} 个完整父块...")
        parent_docs = []
        with get_db_session() as db:
            try:
                records = db.query(ParentDocument).filter(ParentDocument.id.in_(parent_ids)).all()
                for record in records:
                    parent_docs.append(Document(
                        page_content=record.content,
                        metadata=record.meta_data or {}
                    ))
                logger.info(f"✅ 成功提取 {len(parent_docs)} 个父块，即将送入 Reranker 重排！")
            except Exception as e:
                raise ParentFetchError(f"PostgreSQL 父块查询失败: {e}") from e

        return parent_docs

    def _rerank_documents(self, query: str, docs: List[Document], top_n: int = 3) -> List[Document]:
        """大模型重排序 (此方法原样保留)"""
        if not docs:
            return []

        logger.info(f"⚖️ 开始对 {len(docs)} 个完整父块进行 Rerank 重排序...")
        doc_texts = [doc.page_content for doc in docs]

        try:
            response = dashscope.TextReRank.call(
                model=settings.RERANK_MODEL,
                query=query,
                documents=doc_texts,
                top_n=top_n,
                return_documents=False
            )

            if response.status_code == 200:
                reranked_docs = []
                for result in response.output.results:
                    original_index = result.index
                    score = result.relevance_score
                    doc = docs[original_index]
                    doc.metadata["rerank_score"] = score
                    reranked_docs.append(doc)

                logger.info(f"✅ Rerank 完成！提取 Top {top_n}。")
                return reranked_docs

            # 403 = 模型未开通，降级跳过
            if response.status_code == 403:
                logger.warning("⚠️ Rerank 模型未开通，跳过精排，使用默认排序。")
                return docs[:top_n]

            # 其他错误码：抛出可恢复异常
            raise RerankError(
                f"Rerank API 返回 {response.status_code}: {response.message}"
            )

        except RerankError:
            raise
        except Exception as e:
            raise RerankError(f"Rerank 调用异常: {e}") from e

    def run_pipeline(self, query: str, company: Optional[str] = None, year: Optional[str] = None,
                     final_top_n: int = None) -> List[Document]:
        if final_top_n is None:
            final_top_n = settings.RERANK_TOP_N
        try:
            # =======================================================
            #  阶段 1：生成过滤表达式与 Dense 向量
            # =======================================================
            expr_parts = ['metadata["doc_level"] == "child"']
            if company:
                expr_parts.append(f'metadata["company"] == "{company}"')
            if year:
                expr_parts.append(f'metadata["year"] == "{year}"')
            expr = " and ".join(expr_parts)

            # 调用大模型生成查询的 Dense 向量
            query_dense_vec = self.embeddings.embed_query(query)

            # =======================================================
            #  阶段 2：Milvus 底层双路原生召回 + RRF 融合
            # =======================================================
            self.collection.load()  # 确保最新数据都在内存中
            logger.info(f"👉 执行 Milvus 底层原生双路召回与 RRF 融合 | 表达式: {expr}")

            hybrid_results = self.hybrid_engine.execute_search(
                query=query,
                query_dense_vec=query_dense_vec,
                collection=self.collection,
                expr=expr,
                top_k=settings.HYBRID_TOP_K
            )

            # 转换回 LangChain 认的 Document 格式
            top_fused_docs = [Document(page_content=d["text"], metadata=d["metadata"]) for d in hybrid_results]

            if not top_fused_docs:
                logger.warning("⚠️ 底层双路召回未找到任何匹配子块！")
                return []

            # =======================================================
            #  阶段 3：顺藤摸瓜找完整父块
            # =======================================================
            logger.info("👉 阶段 3：基于最优子块，提取完整父块...")
            parent_docs = self._fetch_parent_chunks(top_fused_docs)

            # =======================================================
            #  阶段 4：大模型重排
            # =======================================================
            logger.info("👉 阶段 4：大模型终极重排...")
            final_docs = self._rerank_documents(query, parent_docs, top_n=final_top_n)

            return final_docs

        except RerankError:
            # Rerank 失败已记录，返回未排序的 Top-N
            logger.warning("⚠️ Rerank 失败，使用默认排序返回结果。")
            return parent_docs[:final_top_n]
        except ParentFetchError:
            # 父块查询失败，返回子块文本作为兜底
            logger.warning("⚠️ 父块查询失败，以子块文本作为兜底。")
            return top_fused_docs[:final_top_n]
        except RetrievalError:
            raise
        except Exception as e:
            raise RetrievalError(f"检索 Pipeline 崩溃: {e}") from e
"""
检索服务单元测试（Mock 外部依赖，不连接真实数据库）。
运行: docker exec finance-rag-backend-v2 pytest tests/ -v
"""
import pytest
from unittest.mock import patch, MagicMock
from langchain_core.documents import Document

from app.services.retrieval import RetrievalService


class TestRetrievalService:
    """检索 Pipeline — 用 Mock 隔离 Milvus / PostgreSQL / API"""

    @pytest.fixture
    def mock_retrieval(self, mocker):
        """
        创建一个 RetrievalService，它的 Milvus 连接、Embedding、
        HybridSearch、PostgreSQL 全部被 Mock，不依赖真实数据库。
        """
        # Mock Milvus 连接
        mocker.patch("app.services.retrieval.connections.connect")
        mocker.patch("app.services.retrieval.Collection", autospec=True)

        # Mock Embedding API
        mocker.patch.object(
            RetrievalService, "__init__",
            lambda self: None
        )

        # 手动构造 service 实例并注入 mock 属性
        service = RetrievalService.__new__(RetrievalService)

        # Mock embeddings: 返回假的 1024 维向量
        mock_embeddings = MagicMock()
        mock_embeddings.embed_query.return_value = [0.1] * 1024
        service.embeddings = mock_embeddings

        # Mock hybrid engine: 返回假检索结果
        mock_engine = MagicMock()
        mock_engine.execute_search.return_value = [
            {
                "text": "2025年上半年营业收入为30.09亿元",
                "metadata": {"parent_id": "p1", "company": "深信服", "year": "2025"},
                "score": 0.95,
            },
            {
                "text": "研发费用为9.82亿元",
                "metadata": {"parent_id": "p2", "company": "深信服", "year": "2025"},
                "score": 0.88,
            },
        ]
        service.hybrid_engine = mock_engine

        # Mock collection
        service.collection = MagicMock()

        # Mock rerank: 直接返回传入的 docs（跳过实际 Rerank 调用）
        mocker.patch.object(
            service, "_rerank_documents",
            side_effect=lambda query, docs, top_n=3: docs[:top_n]
        )

        return service

    def test_run_pipeline_returns_docs(self, mock_retrieval):
        """正常流程：检索返回结果"""
        mock_fetch = MagicMock(return_value=[
            Document(page_content="深信服2025年上半年营收30.09亿元...", metadata={"source": "深信服2025.pdf"})
        ])
        mock_retrieval._fetch_parent_chunks = mock_fetch

        docs = mock_retrieval.run_pipeline(query="营收是多少？")

        assert len(docs) > 0, "应该有检索结果返回"
        assert all(isinstance(d, Document) for d in docs)

    def test_run_pipeline_no_results(self, mock_retrieval):
        """空结果：双路召回没找到匹配"""
        mock_retrieval.hybrid_engine.execute_search.return_value = []

        docs = mock_retrieval.run_pipeline(query="火星基地财务报告")

        assert docs == [], "无匹配时应返回空列表"

    def test_run_pipeline_with_filters(self, mock_retrieval):
        """带年份/公司过滤"""
        mock_retrieval._fetch_parent_chunks = MagicMock(return_value=[Document("test")])

        docs = mock_retrieval.run_pipeline(
            query="营收",
            company="深信服",
            year="2025"
        )

        # 验证 hybrid engine 的 expr 参数包含过滤条件
        call_kwargs = mock_retrieval.hybrid_engine.execute_search.call_args
        expr = call_kwargs[1]["expr"]
        assert 'metadata["company"] == "深信服"' in expr
        assert 'metadata["year"] == "2025"' in expr

    def test_fetch_parent_chunks_empty(self, mock_retrieval):
        """空子块列表返回空结果"""
        with patch("app.services.retrieval.get_db_session"):
            docs = mock_retrieval._fetch_parent_chunks([])
            assert docs == []

    def test_fetch_parent_chunks_no_parent_ids(self, mock_retrieval):
        """子块没有 parent_id 时返回空"""
        bad_docs = [Document(page_content="test", metadata={"no_parent": True})]
        with patch("app.services.retrieval.get_db_session"):
            docs = mock_retrieval._fetch_parent_chunks(bad_docs)
            assert docs == []

    def test_rerank_handles_empty(self, mock_retrieval):
        """Rerank 空列表返回空"""
        result = mock_retrieval._rerank_documents("query", [])
        assert result == []

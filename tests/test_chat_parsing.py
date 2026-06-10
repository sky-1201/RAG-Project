"""
来源引用解析测试 — _parse_sources()。
验证从 retriever_tool 输出中提取文件、页码、hash、snippet 的正确性。

运行: docker compose exec backend-v2 pytest tests/test_chat_parsing.py -v
"""
import pytest
from app.api.chat import _parse_sources


def _make_evidence(file_name: str, score: float, page: int = 42, hash_val: str = "abc123", content: str = "报告期内公司实现营业收入30.09亿元。") -> str:
    """构造一条完整证据块（模拟 retriever_tool 输出）"""
    return (
        f"--- 证据 1 [来源: {file_name}, 相关度: {score}, 页码: {page}, hash: {hash_val}] ---\n"
        f"{content}\n"
    )


class TestBasicParsing:
    """单条证据 — 字段提取"""

    def test_single_evidence_all_fields(self):
        output = _make_evidence(
            "深信服2025年年度报告.pdf", 0.95, page=42, hash_val="abc123",
            content="报告期内公司实现营业收入3,009,349,430.42元。"
        )
        sources = _parse_sources(output)

        assert len(sources) == 1
        s = sources[0]
        assert s["file"] == "深信服2025年年度报告.pdf"
        assert s["score"] == "0.95"
        assert s["page_number"] == 42
        assert s["file_hash"] == "abc123"
        assert "营业收入" in s["snippet"]

    def test_evidence_without_page_and_hash(self):
        """旧格式：无页码和 hash — 不崩溃"""
        output = "--- 证据 1 [来源: old_report.pdf, 相关度: 0.80] ---\n旧报告内容...\n"
        sources = _parse_sources(output)

        assert len(sources) == 1
        assert sources[0]["file"] == "old_report.pdf"
        assert sources[0]["page_number"] == 1  # 默认值
        assert sources[0]["file_hash"] == ""    # 默认值

    def test_snippet_truncation(self):
        """snippet 应截断到 200 字"""
        long_content = "X" * 500
        output = _make_evidence("f.pdf", 0.9, content=long_content)
        sources = _parse_sources(output)

        assert len(sources[0]["snippet"]) <= 200


class TestMultipleEvidences:
    """多条证据 — 全量展示（不去重）"""

    def test_multiple_evidences_same_file(self):
        """同一份 PDF 的不同页面，各自独立展示"""
        output = (
            _make_evidence("深信服2025年报.pdf", 0.95, page=7, hash_val="h1",
                           content="营业收入30.09亿元")
            + _make_evidence("深信服2025年报.pdf", 0.88, page=42, hash_val="h1",
                             content="研发费用9.82亿元").replace("证据 1", "证据 2")
            + _make_evidence("深信服2025年报.pdf", 0.82, page=105, hash_val="h1",
                             content="毛利率62.09%").replace("证据 1", "证据 3")
        )
        sources = _parse_sources(output)

        # 同文件不去重，3 条证据全部展示
        assert len(sources) == 3
        assert sources[0]["page_number"] == 7
        assert sources[1]["page_number"] == 42
        assert sources[2]["page_number"] == 105

    def test_multiple_evidences_different_files(self):
        """不同文件的证据块"""
        output = (
            _make_evidence("A公司2025年报.pdf", 0.95, page=10, hash_val="hA",
                           content="A公司营收50亿")
            + _make_evidence("B公司2025年报.pdf", 0.90, page=20, hash_val="hB",
                           content="B公司营收30亿").replace("证据 1", "证据 2")
        )
        sources = _parse_sources(output)

        assert len(sources) == 2
        assert sources[0]["file"] == "A公司2025年报.pdf"
        assert sources[1]["file"] == "B公司2025年报.pdf"

    def test_empty_input(self):
        """空输入 → 空列表"""
        assert _parse_sources("") == []

    def test_no_evidence_blocks(self):
        """无证据标记的普通文本 → 空列表"""
        assert _parse_sources("这是一段没有证据标记的普通回复") == []

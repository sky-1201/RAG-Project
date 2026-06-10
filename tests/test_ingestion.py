"""
文档入库服务核心函数单元测试。
运行: docker exec finance-rag-backend-v2 pytest tests/ -v
"""
import pytest
from app.services.ingestion import DocumentIngestionService


class TestExtractMetadata:
    """文件名解析 — _extract_metadata()"""

    def setup_method(self):
        self.service = DocumentIngestionService()

    @pytest.mark.parametrize("filename,expected_company,expected_year", [
        # 标准中文命名
        ("深信服2025年半年度报告.pdf", "深信服", "2025"),
        ("深信服2024年年度报告.pdf", "深信服", "2024"),
        ("贵州茅台2023年年度报告.pdf", "贵州茅台", "2023"),
        # 含冒号/下划线分隔
        ("深信服：2025年半年度报告.pdf", "深信服", "2025"),
        ("深信服_2025_年报.pdf", "深信服", "2025"),
        # 全英文命名
        ("Tesla_2025_Annual_Report.pdf", "Tesla", "2025"),
        ("Microsoft 2024 10-K.pdf", "Microsoft", "2024"),
        # 无年份 → 无法解析公司名，返回"未知"
        ("公司介绍文档.pdf", "未知", "未知"),
        ("Financial_Report.pdf", "未知", "未知"),
        # 年份在最开头 → 公司名匹配到空字符串（被清洗后为空）
        ("2025深信服科技年报.pdf", "", "2025"),
    ])
    def test_extract_metadata(self, filename, expected_company, expected_year):
        result = self.service._extract_metadata(filename)

        assert result["company"] == expected_company, (
            f"文件名「{filename}」的公司名应为「{expected_company}」，实际为「{result['company']}」"
        )
        assert result["year"] == expected_year, (
            f"文件名「{filename}」的年份应为「{expected_year}」，实际为「{result['year']}」"
        )
        assert result["source"] == filename


class TestCalculateMD5:
    """文件哈希计算 — _calculate_md5()"""

    def setup_method(self):
        self.service = DocumentIngestionService()

    def test_same_content_same_hash(self, tmp_path):
        """相同内容 → 相同哈希"""
        f1 = tmp_path / "a.pdf"
        f2 = tmp_path / "b.pdf"
        f1.write_bytes(b"hello finance rag")
        f2.write_bytes(b"hello finance rag")

        assert self.service._calculate_md5(str(f1)) == self.service._calculate_md5(str(f2))

    def test_different_content_different_hash(self, tmp_path):
        """不同内容 → 不同哈希"""
        f1 = tmp_path / "a.pdf"
        f2 = tmp_path / "b.pdf"
        f1.write_bytes(b"hello finance rag")
        f2.write_bytes(b"different content")

        assert self.service._calculate_md5(str(f1)) != self.service._calculate_md5(str(f2))

    def test_deterministic(self, tmp_path):
        """同一个文件两次计算结果一致"""
        f = tmp_path / "test.pdf"
        f.write_bytes(b"some pdf content here")

        h1 = self.service._calculate_md5(str(f))
        h2 = self.service._calculate_md5(str(f))
        assert h1 == h2

    def test_empty_file(self, tmp_path):
        """空文件也能正常计算"""
        f = tmp_path / "empty.pdf"
        f.write_bytes(b"")

        result = self.service._calculate_md5(str(f))
        # 空文件的 MD5 是 d41d8cd98f00b204e9800998ecf8427e
        assert result == "d41d8cd98f00b204e9800998ecf8427e"

    def test_large_file(self, tmp_path):
        """大文件（模拟 4KB+）仍能正确计算"""
        f = tmp_path / "large.pdf"
        # 写入 10KB 数据，超过 4KB 分块大小
        f.write_bytes(b"x" * 10240)

        result = self.service._calculate_md5(str(f))
        assert len(result) == 32  # MD5 总是 32 个十六进制字符


class TestFindPageNumber:
    """文本 → 页码匹配 — _find_page_number()"""

    def setup_method(self):
        self.service = DocumentIngestionService()
        # 模拟 pypdf 提取的逐页文本
        self.page_texts = {
            1: "深信服科技股份有限公司 2025年年度报告 目录",
            2: "第一章 公司简介 深信服成立于...",
            3: "第二章 财务数据 营业收入30.09亿元",
            4: "第三章 研发投入 研发费用9.82亿元同比增长",
            5: "第四章 风险提示 市场风险政策风险",
        }

    def test_exact_match(self):
        """chunk 文本在某一页精确出现 → 返回该页码"""
        chunk = "研发费用9.82亿元同比增长"
        page = self.service._find_page_number(chunk, self.page_texts)
        assert page == 4

    def test_partial_match(self):
        """chunk 前半段精确匹配，函数截取前 300 字搜索"""
        chunk = "营业收入30.09亿元，较上年同期增长..."
        page = self.service._find_page_number(chunk, self.page_texts)
        assert page == 3

    def test_fuzzy_fallback(self):
        """精确匹配失败时用字符重叠度打分"""
        chunk = "深信服营业收入达到30多个亿"
        # 精确不匹配，但第3页字符重叠度最高
        page = self.service._find_page_number(chunk, self.page_texts)
        assert page == 3

    def test_empty_chunk_returns_page_1(self):
        """空文本 → 默认返回第 1 页"""
        page = self.service._find_page_number("", self.page_texts)
        assert page == 1

    def test_empty_page_texts(self):
        """所有页文本为空 → 返回第 1 页（不崩溃）"""
        page = self.service._find_page_number("some chunk", {1: "", 2: ""})
        assert page == 1

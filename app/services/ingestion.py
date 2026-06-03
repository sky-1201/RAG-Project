import logging
from pathlib import Path
from typing import Optional, Tuple, Callable, List
import re
import uuid
import hashlib

# LangChain 相关
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_core.documents import Document

# Milvus 原生包
from pymilvus import connections, utility
from pymilvus import CollectionSchema, FieldSchema, DataType, Collection
import jieba
from pymilvus.model.sparse import BM25EmbeddingFunction

# 自定义组件
from app.core.config import settings
from docling.document_converter import DocumentConverter

# 引入 Postgres 数据库连接和表模型
from app.database import get_db_session, ParentDocument, UploadedFile
from app.core.exceptions import (
    IngestionError, DuplicateFileError, PDFParseError,
    EmbeddingAPIError, MilvusInsertError,
)
from pypdf import PdfReader

logger = logging.getLogger(__name__)


class DocumentIngestionService:
    def __init__(self):
        # 1. 初始化 PDF 解析器
        self.converter = DocumentConverter()

        # 2. 初始化 Embedding 模型 (阿里通义千问)
        self.embeddings = DashScopeEmbeddings(
            model=settings.EMBEDDING_MODEL,
            dashscope_api_key=settings.DASHSCOPE_API_KEY
        )

        # 3. 初始化切分器
        self.parent_splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=[("#", "H1"), ("##", "H2"), ("###", "H3")],
            strip_headers=False
        )

        # 保留一个物理兜底（比如按 40000 切），确保极个别变态文本也能安全落盘
        self.parent_fallback_splitter = RecursiveCharacterTextSplitter(
            chunk_size=40000,
            chunk_overlap=1000
        )

        self.child_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP
        )

    def _calculate_md5(self, file_path: str) -> str:
        """极速计算文件的 MD5 指纹"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            # 每次读取 4096 字节，防止遇到几个 G 的文件撑爆内存
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    def _extract_metadata(self, file_name: str) -> dict:
        """从文件名提取年份和公司名"""
        year_match = re.search(r'(20\d{2})', file_name)
        company_match = re.search(r'^(.*?)(?:20\d{2})', file_name)

        # 获取原始匹配的字符串
        raw_company = company_match.group(1) if company_match else "未知"

        clean_company = raw_company.strip(" ：:_- \t")

        return {
            "year": year_match.group(1) if year_match else "未知",
            "company": clean_company,  # 存入清洗后的干净名称
            "source": file_name
        }

    def run_pipeline(self, pdf_path: str, original_filename: str = None,
                     page_range: Optional[Tuple[int, int]] = None,
                     progress_callback: callable = None):
        """完整的端到端入库流程 (带哈希去重)。progress_callback(step, pct) 用于推送进度。"""
        def _progress(step: str, pct: int):
            logger.info(f"📊 [{pct}%] {step}")
            if progress_callback:
                progress_callback(step, pct)

        try:
            path = Path(pdf_path)
            display_name = original_filename if original_filename else path.name

            # ==========================================
            # 物理级指纹查重 (Hash Fingerprinting)
            # ==========================================
            _progress("正在计算文件指纹并查重...", 5)
            file_md5 = self._calculate_md5(pdf_path)

            with get_db_session() as db:
                # 去数据库里查一查这个指纹有没有登记过
                existing_file = db.query(UploadedFile).filter(UploadedFile.file_hash == file_md5).first()
                if existing_file:
                    logger.warning(f"🚫 拦截重复文件！【{display_name}】(MD5: {file_md5}) 已于 {existing_file.upload_time} 入库。")
                    logger.warning("已自动跳过解析与向量化，防止数据库污染与 Token 浪费！")
                    return {"status": "skipped", "message": "文件已存在，无需重复入库"}

            # ==========================================
            # A. 解析 PDF (Docling) -  内存保护：分块流式解析
            # ==========================================
            logger.info(f"Step 1: 启动内存安全模式 Parsing PDF {display_name}...")
            _progress(f"正在解析 PDF ({display_name})...", 15)

            md_text = ""

            try:
                # 1. 先用极其轻量的 pypdf 看一下总页数
                reader = PdfReader(path)
                total_pages = len(reader.pages)
                logger.info(f"📄 检测到该文件共有 {total_pages} 页，准备切片解析...")

                # 2. 每 N 页为一个批次，防止内存爆炸
                batch_pages = settings.PDF_BATCH_PAGES

                # 如果用户没有指定页码，我们就自己按批次循环
                if page_range is None:
                    for start_page in range(1, total_pages + 1, batch_pages):
                        end_page = min(start_page + batch_pages - 1, total_pages)
                        logger.info(f"⏳ 正在解析批次: 第 {start_page} ~ {end_page} 页...")

                        #  Docling 只处理这几十页
                        doc_result = self.converter.convert(path, page_range=(start_page, end_page))
                        # 把这部分转成 Markdown 拼接到总文本里
                        md_text += doc_result.document.export_to_markdown() + "\n\n"

                else:
                    # 如果用户本来就指定了小范围，就按用户的来
                    doc_result = self.converter.convert(path, page_range=page_range)
                    md_text = doc_result.document.export_to_markdown()

            except Exception as e:
                logger.warning(f"⚠️ 分块解析失败，尝试退回全量解析: {e}")
                try:
                    doc_result = self.converter.convert(path)
                    md_text = doc_result.document.export_to_markdown()
                except Exception as full_error:
                    raise PDFParseError(f"PDF 解析完全失败: {full_error}") from full_error

            logger.info("✅ PDF 全部解析完毕，准备进行文本切分...")
            _progress("PDF 解析完成，正在切分文本...", 35)

            # ==========================================
            # B. 父子块切分与 Metadata 组装
            # ==========================================
            logger.info("Step 2: Parent and Child splitting...")
            parent_docs = self.parent_splitter.split_text(md_text)

            # 物理兜底，防止出现极端巨大的单一块
            safe_parent_docs = []
            for doc in parent_docs:
                if len(doc.page_content) > 40000:
                    safe_parent_docs.extend(self.parent_fallback_splitter.split_documents([doc]))
                else:
                    safe_parent_docs.append(doc)

            file_meta = self._extract_metadata(display_name)

            child_docs = []

            # 为父块分配 parent_id，并切出子块
            for p_doc in safe_parent_docs:
                parent_id = str(uuid.uuid4())
                p_doc.metadata.update(file_meta)
                p_doc.metadata["parent_id"] = parent_id
                p_doc.metadata["doc_level"] = "parent"

                # 切分子块
                child_chunks = self.child_splitter.split_documents([p_doc])
                for c_doc in child_chunks:
                    c_doc.metadata.update(file_meta)  # 确保子块也有年份等基础信息
                    c_doc.metadata["parent_id"] = parent_id
                    c_doc.metadata["doc_level"] = "child"
                    child_docs.append(c_doc)

            # ==========================================
            _progress(f"文档切分完成 ({len(child_docs)} 个子块)", 45)

            # C. 双库落盘：父块 -> PostgreSQL | 子块 -> Milvus
            # ==========================================
            logger.info("Step 3: Executing Compute & Storage Decoupling Pipeline...")

            # ----------------------------------------------------
            #  分支 1：将父块存入 PostgreSQL 存储层
            # ----------------------------------------------------
            logger.info("📦 开始将完整父块写入 PostgreSQL 存储层...")
            inserted_parent_ids = []  # 准备一个列表,记录哪些父块写入了 PostgreSQL
            with get_db_session() as db:
                try:
                    postgres_records = []
                    for p_doc in safe_parent_docs:
                        record = ParentDocument(
                            id=p_doc.metadata["parent_id"],
                            content=p_doc.page_content,
                            meta_data=p_doc.metadata
                        )
                        postgres_records.append(record)
                        inserted_parent_ids.append(p_doc.metadata["parent_id"])  #  记下 ID

                    db.add_all(postgres_records)
                    db.commit()
                    logger.info(f"✅ 成功将 {len(postgres_records)} 个超级父块安全落盘至 PostgreSQL！")
                except Exception as e:
                    db.rollback()
                    raise IngestionError(f"PostgreSQL 写入失败: {e}") from e

            # ----------------------------------------------------
            #  分支 2：将子块及其向量存入 Milvus 计算层
            # ----------------------------------------------------
            logger.info(f"🧠 开始处理子块及其向量...")

            try:
                connections.connect(
                    alias="default",
                    host=settings.MILVUS_HOST,
                    port=settings.MILVUS_PORT
                )
            except Exception as e:
                logger.warning(f"⚠️ PyMilvus 连接复用提示: {e}")

            collection_name = settings.COLLECTION_NAME

            if not utility.has_collection(collection_name):
                logger.info(f" Collection '{collection_name}' 不存在，正在创建双路检索表结构...")

                # 1. 定义表结构
                fields = [
                    FieldSchema(name="chunk_id", dtype=DataType.VARCHAR, is_primary=True, max_length=65535),
                    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
                    # 密集向量
                    FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=settings.EMBEDDING_DIM),
                    # 稀疏向量列 (自动处理不定长词频)
                    FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),
                    FieldSchema(name="metadata", dtype=DataType.JSON)
                ]
                schema = CollectionSchema(fields, "Financial RAG Document Store (Hybrid Search)",
                                          enable_dynamic_field=True)
                collection = Collection(collection_name, schema)

                # ==========================================
                # 为两路向量分别建立专属索引
                # ==========================================

                # 2. 为密集向量建索引
                logger.info("⚙️ 正在创建 Dense 密集向量索引...")
                dense_index_params = {
                    "index_type": "AUTOINDEX",  # 也可以用 "HNSW"
                    "metric_type": "L2",  # L2 或 COSINE
                    "params": {}
                }
                collection.create_index("dense_vector", dense_index_params)

                # 3. 为稀疏向量建专用的倒排索引
                logger.info("⚙️ 正在创建 Sparse 稀疏向量专用倒排索引...")
                sparse_index_params = {
                    "index_type": "SPARSE_INVERTED_INDEX",  # 稀疏向量只能用这个索引类型
                    "metric_type": "IP",  #  稀疏向量的匹配只能用内积 (Inner Product)
                    "params": {"drop_ratio_build": 0.2}  # 丢弃 20% 低频无意义的词，可大幅节省内存
                }
                collection.create_index("sparse_vector", sparse_index_params)

                logger.info("🎉 表结构和双路向量索引全部创建完成！")
            else:
                collection = Collection(collection_name)

            # --- 对子块进行真实的 Embedding ---
            _progress(f"正在生成 {len(child_docs)} 个子块向量...", 55)
            logger.info(f"⏳ 正在向 API 请求 {len(child_docs)} 个子块向量...")
            child_texts = [doc.page_content for doc in child_docs]

            # 必须为每个子块生成唯一的主键 chunk_id
            child_ids = [str(uuid.uuid4()) for _ in child_docs]

            # 【第 1 路】：请求云端 API 生成密集向量 (Dense Vector)
            child_embeddings = []
            batch_size = settings.EMBEDDING_BATCH_SIZE

            for i in range(0, len(child_texts), batch_size):
                batch_texts = child_texts[i:i + batch_size]
                logger.info(f"   进度: {i + 1} ~ {min(i + batch_size, len(child_texts))} / {len(child_texts)}")
                batch_texts_for_embed = [t[:settings.EMBEDDING_MAX_TEXT_LENGTH] for t in batch_texts]

                # 带重试的 API 调用
                last_error = None
                for attempt in range(1, settings.EMBEDDING_RETRY_TIMES + 1):
                    try:
                        batch_embeddings = self.embeddings.embed_documents(batch_texts_for_embed)
                        child_embeddings.extend(batch_embeddings)
                        break
                    except Exception as e:
                        last_error = e
                        if attempt < settings.EMBEDDING_RETRY_TIMES:
                            logger.warning(f"⚠️ Embedding API 第 {attempt} 次失败，重试中: {e}")
                            import time as _time
                            _time.sleep(2 ** attempt)  # 指数退避
                        else:
                            raise EmbeddingAPIError(
                                f"Embedding API 重试 {settings.EMBEDDING_RETRY_TIMES} 次后仍失败: {last_error}"
                            ) from last_error

            _progress("密集向量生成完毕，正在计算稀疏向量...", 75)
            # 【第 2 路】：在本地极速生成稀疏向量 (Sparse Vector)
            logger.info(f" 正在本地计算 {len(child_docs)} 个子块的 BM25 稀疏向量...")
            analyzer = BM25EmbeddingFunction(analyzer=jieba.lcut)
            # 拟合当前文档的词频
            analyzer.fit(child_texts)
            # 编码出稀疏矩阵 (包含词的 ID 和权重)
            sparse_embeddings = analyzer.encode_documents(child_texts)

            # 组装并原生插入 Milvus（必须与你上面的 FieldSchema 顺序和数量严格一致！）
            milvus_insert_data = [
                child_ids,  # 第1列: chunk_id (主键)
                child_texts,  # 第2列: text
                child_embeddings,  # 第3列: dense_vector
                sparse_embeddings,  # 第4列: sparse_vector
                [doc.metadata for doc in child_docs]  # 第5列: metadata
            ]

            _progress("双路向量生成完毕，正在写入 Milvus...", 90)
            logger.info("📦 正在向 Milvus 双路向量库写入数据...")
            try:
                collection.insert(milvus_insert_data)
                collection.flush()
            except Exception as e:
                raise MilvusInsertError(f"Milvus 写入失败: {e}") from e

            logger.info("✅ 双库解耦入库完成！计算(Milvus)与存储(Postgres)彻底分离。")
            # 所有步骤都成功后，将文件指纹存入
            with get_db_session() as db:
                try:
                    new_upload = UploadedFile(file_hash=file_md5, file_name=display_name)
                    db.add(new_upload)
                    db.commit()
                    logger.info(f"✅ 文件指纹 {file_md5} 已登记，未来将自动拦截该文件的重复上传。")
                except Exception as e:
                    db.rollback()
                    logger.warning(f"⚠️ 指纹登记跳过 (文件可能已入库): {str(e)}")

            return {"status": "success", "message": "入库闭环执行成功！"}

        # 保证分布式双库的一致性
        except IngestionError:
            raise
        except PDFParseError:
            raise
        except Exception as e:
            # 企业级分布式事务补偿机制 (Rollback Orphan Data)
            if 'inserted_parent_ids' in locals() and inserted_parent_ids:
                logger.warning("⚠️ 检测到后续流程(API/Milvus)崩溃，正在触发补偿事务...")
                logger.warning(f"🧹 正在从 PostgreSQL 擦除 {len(inserted_parent_ids)} 条父块数据，以保证双库一致性！")
                with get_db_session() as db_rollback:
                    try:
                        db_rollback.query(ParentDocument).filter(
                            ParentDocument.id.in_(inserted_parent_ids)
                        ).delete(synchronize_session=False)
                        db_rollback.commit()
                        logger.info("✅ 补偿回滚成功！环境已恢复至入库前的纯净状态。")
                    except Exception as rollback_err:
                        logger.error(f"❌ 补偿回滚也失败了: {rollback_err}")
                        raise IngestionError(f"入库失败且补偿回滚异常: {e}") from e
            raise IngestionError(f"入库 Pipeline 崩溃: {e}") from e




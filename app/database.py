import logging
import os
import time
from contextlib import contextmanager
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.sql import func

# 🌟 加载 .env 文件
load_dotenv()

# 从环境变量中动态读取密码和地址
# 兼容两种命名规范：项目自定义 (PG_*) 和 Zeabur 平台注入 (POSTGRES_*)
PG_USER = os.getenv("PG_USER") or os.getenv("POSTGRES_USER") or "rag_user"
PG_PASSWORD = os.getenv("PG_PASSWORD") or os.getenv("POSTGRES_PASSWORD") or "rag_password"
PG_HOST = os.getenv("PG_HOST") or os.getenv("POSTGRES_HOST") or "127.0.0.1"
PG_PORT = os.getenv("PG_PORT") or os.getenv("POSTGRES_PORT") or "5432"
PG_DB = os.getenv("PG_DB") or os.getenv("POSTGRES_DB") or os.getenv("POSTGRES_DATABASE") or "rag_db"

# 动态拼接数据库连接字符串
SQLALCHEMY_DATABASE_URL = f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DB}"

# 创建引擎 (连接池配置)
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,  # 每次借出前先 ping 一下，防止使用已断开的连接
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ==========================================
# 🌟 统一的 DB Session 管理
# ==========================================

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI 依赖注入专用：在请求生命周期内管理 session。
    用法: db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """
    后台任务 / 非请求上下文专用：通过 context manager 管理 session。
    用法: with get_db_session() as db: ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 对话历史表
class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False, default="新对话")
    messages = Column("messages", JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

# 定义父块的数据库表
class ParentDocument(Base):
    __tablename__ = "parent_documents_v3"
    id = Column(String, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    meta_data = Column("metadata", JSONB)

# Agent 长期记忆表（跨对话语义检索）
class LongTermMemory(Base):
    __tablename__ = "long_term_memories"
    id = Column(String, primary_key=True, index=True)
    user_query = Column(Text, nullable=False)
    assistant_answer = Column(Text, nullable=False)
    memory_text = Column(Text, nullable=False)  # "Q: ...\nA: ..." 拼接后用于向量化
    meta_data = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# 文件上传去重登记表
class UploadedFile(Base):
    __tablename__ = "uploaded_files_v3"

    # 将文件的 MD5 哈希值作为主键（绝对唯一）
    file_hash = Column(String, primary_key=True, index=True)
    # 记录文件名，方便以后查看
    file_name = Column(String, nullable=False)
    # 文件在磁盘上的存储路径（如 data/raw/a1b2c3.pdf）
    file_path = Column(String, nullable=True)
    # 自动记录上传的时间
    upload_time = Column(DateTime(timezone=True), server_default=func.now())

def init_db(retries: int = 5, delay: float = 2.0):
    """初始化数据库表结构，PostgreSQL 启动未完成时自动重试。"""
    logger = logging.getLogger(__name__)

    print(f"⏳ 正在连接 PostgreSQL ({PG_HOST}:{PG_PORT}) 并初始化表结构...")
    for attempt in range(1, retries + 1):
        try:
            Base.metadata.create_all(bind=engine)
            print("✅ 数据库表结构初始化完成！")
            return
        except Exception as e:
            if attempt < retries:
                print(f"⏳ Postgres 尚未就绪，第 {attempt}/{retries} 次重试 (等待 {delay}s)...")
                time.sleep(delay)
            else:
                print(f"❌ 连接失败，请检查 Docker 是否启动以及账号密码是否正确。报错信息: {e}")
                logger.error(f"PostgreSQL init failed after {retries} attempts: {e}")

if __name__ == "__main__":
    init_db()
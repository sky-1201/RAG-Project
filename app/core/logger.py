import logging
import sys
from pathlib import Path
from app.core.config import settings


def setup_global_logger() -> None:
    """
    配置企业级全局日志系统。
    将日志同时输出到控制台（标准输出）和本地 logs/app.log 文件中。
    """
    try:
        # 1. 确保日志目录存在 (利用 pathlib，优雅且跨平台)
        log_dir = Path("logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "app.log"

        # 2. 根据 config 中的 DEBUG 开关决定日志级别
        log_level = logging.DEBUG if settings.DEBUG else logging.INFO

        # 3. 定义企业级高可读性日志格式
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s:[%(filename)s:%(lineno)d] - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

        # 4. 配置控制台 Handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)

        # 5. 配置文件 Handler (必须指定 utf-8，否则财报里的中文会乱码)
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)

        # 6. 获取根 Logger (Root Logger)
        root_logger = logging.getLogger()
        root_logger.setLevel(log_level)

        # 清理可能存在的默认 Handler，防止日志重复打印
        if root_logger.hasHandlers():
            root_logger.handlers.clear()

        # 挂载我们自定义的 Handlers
        root_logger.addHandler(console_handler)
        root_logger.addHandler(file_handler)

        # 7. 降噪处理：屏蔽一些底层第三方库过于啰嗦的 DEBUG/INFO 日志
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)
        logging.getLogger("openai").setLevel(logging.WARNING)
        logging.getLogger("urllib3").setLevel(logging.WARNING)
        logging.getLogger("watchfiles").setLevel(logging.WARNING)
        logging.getLogger("docling").setLevel(logging.INFO)

        logging.info("✅ 全局日志系统初始化完成。")

    except Exception as e:
        print(f"❌ 初始化全局日志系统失败: {str(e)}")


# 模块被导入时，自动执行初始化
setup_global_logger()
"""
Prompt 模板加载器。
从 YAML 文件加载 prompt，支持未来按场景切换模板。
"""
import logging
from pathlib import Path
from functools import lru_cache

import yaml

logger = logging.getLogger(__name__)

# 模板相对于项目根目录的路径
PROMPTS_DIR = Path(__file__).resolve().parent


@lru_cache(maxsize=8)
def load_prompt(name: str) -> dict:
    """
    加载指定名称的 prompt 模板，结果会被缓存。

    用法:
        from app.prompts.loader import load_prompt

        prompt = load_prompt("financial_agent")
        system_prompt = prompt["system_prompt"]
    """
    file_path = PROMPTS_DIR / f"{name}.yaml"
    if not file_path.exists():
        logger.error(f"Prompt 模板不存在: {file_path}")
        raise FileNotFoundError(f"Prompt 模板不存在: {name}")

    with open(file_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    logger.info(f"✅ 已加载 Prompt 模板: {name}")
    return data

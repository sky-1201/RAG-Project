import sys
import io
import logging
import concurrent.futures
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# 执行超时（秒）
_MAX_EXEC_SECONDS = 10

# 受限的 __builtins__：只允许安全的数值计算和基础操作
_SAFE_BUILTINS = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "print": print,
    "range": range,
    "round": round,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
    "True": True,
    "False": False,
    "None": None,
    # 安全导入仅允许的模块
    "__import__": lambda name, *args, **kwargs: (
        __import__(name) if name in {"math", "json", "datetime", "collections", "itertools", "decimal"}
        else (_ for _ in ()).throw(ImportError(f"禁止导入模块: {name}"))
    ),
}


def _run_code(code: str, output_buffer: io.StringIO) -> str | None:
    """在受限沙盒中执行代码，捕获 stdout。"""
    old_stdout = sys.stdout
    sys.stdout = output_buffer
    try:
        exec(code, {"__builtins__": _SAFE_BUILTINS}, {})
        return None  # success
    finally:
        sys.stdout = old_stdout


@tool
def python_repl_tool(code: str) -> str:
    """
    一个 Python 解释器工具。当你需要进行任何财务数据的数学计算（如加减乘除、毛利率、同比增长等）时，必须使用此工具。
    输入必须是合法的 Python 代码（仅限 math/json/datetime/collections/itertools/decimal 模块）。
    注意：为了让我看到执行结果，你必须在代码的最后使用 print() 将结果打印出来。
    """
    logger.info("=" * 40)
    logger.info(f"🤖 触发 Agent 工具: 正在执行大模型生成的 Python 代码 👇\n{code}")
    logger.info("=" * 40)

    output_buffer = io.StringIO()

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_run_code, code, output_buffer)
            error = future.result(timeout=_MAX_EXEC_SECONDS)
    except concurrent.futures.TimeoutError:
        logger.error(f"⏱️ 代码执行超时（>{_MAX_EXEC_SECONDS}s），已强制终止。")
        return f"❌ 代码执行超时（>{_MAX_EXEC_SECONDS} 秒）。请检查是否存在死循环或过于复杂的计算，简化后重试。"
    except Exception as e:
        error_msg = f"❌ 代码执行出错: {type(e).__name__}: {str(e)}"
        logger.error(error_msg)
        return error_msg

    if error is not None:
        return str(error)

    output = output_buffer.getvalue().strip()
    logger.info(f"✅ 工具执行成功，返回结果: {output}")
    return output if output else "代码执行成功，但没有使用 print() 输出结果。请修改代码并重试。"

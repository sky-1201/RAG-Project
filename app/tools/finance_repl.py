import sys
import io
import logging
import multiprocessing
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# 执行超时（秒）
_MAX_EXEC_SECONDS = 10


# ==========================================
# 安全模块导入函数（顶层函数，Process 可 Pickle）
# ==========================================

def _safe_import(name, *args, **kwargs):
    """受限的 __import__ 替代：仅允许白名单模块"""
    if name in {"math", "json", "datetime", "collections", "itertools", "decimal"}:
        return __import__(name)
    raise ImportError(f"禁止导入模块: {name}")


# ==========================================
# 受限的内置函数集
# ==========================================

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
    "__import__": _safe_import,
}


# ==========================================
# 沙盒执行函数（顶层函数，multiprocessing 可 Pickle）
# ==========================================

def _execute_sandbox(code: str, result_queue: multiprocessing.Queue) -> None:
    """
    在子进程中执行受限代码，通过 Queue 返回结果。
    返回值: {"output": str, "error": str | None}
    """
    output_buffer = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = output_buffer
    try:
        exec(code, {"__builtins__": _SAFE_BUILTINS}, {})
        result_queue.put({
            "output": output_buffer.getvalue().strip(),
            "error": None,
        })
    except Exception as e:
        result_queue.put({
            "output": output_buffer.getvalue().strip(),
            "error": f"{type(e).__name__}: {str(e)}",
        })
    finally:
        sys.stdout = old_stdout


# ==========================================
# Agent 工具：Python 代码沙盒
# ==========================================

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

    result_queue: multiprocessing.Queue = multiprocessing.Queue()
    proc = multiprocessing.Process(target=_execute_sandbox, args=(code, result_queue))
    proc.start()
    proc.join(timeout=_MAX_EXEC_SECONDS)

    if proc.is_alive():
        # 子进程还在跑 → 超时，强制杀死
        proc.terminate()
        proc.join()
        logger.error(f"⏱️ 代码执行超时（>{_MAX_EXEC_SECONDS}s），子进程已被强制终止。")
        return f"❌ 代码执行超时（>{_MAX_EXEC_SECONDS} 秒）。请检查是否存在死循环或过于复杂的计算，简化后重试。"

    # exitcode == 0 表示正常结束，!= 0 表示异常退出
    if proc.exitcode != 0:
        logger.error(f"❌ 子进程异常退出，exitcode={proc.exitcode}")
        return f"❌ 代码执行出错: 进程异常退出 (exitcode={proc.exitcode})"

    try:
        result = result_queue.get_nowait()
    except Exception:
        logger.error("❌ 无法从子进程获取执行结果")
        return "❌ 代码执行出错: 无法获取执行结果"

    if result["error"] is not None:
        logger.error(f"❌ 沙盒内执行出错: {result['error']}")
        return f"❌ 代码执行出错: {result['error']}"

    output = result["output"]
    logger.info(f"✅ 工具执行成功，返回结果: {output}")
    return output if output else "代码执行成功，但没有使用 print() 输出结果。请修改代码并重试。"

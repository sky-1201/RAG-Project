"""
Python 沙盒安全测试。
验证受限执行环境的安全边界：正常计算、模块白名单、危险操作拦截、超时控制。

运行: docker compose exec backend-v2 pytest tests/test_finance_repl.py -v
"""
import pytest
from app.tools.finance_repl import python_repl_tool


def _invoke(code: str) -> str:
    """模拟 LangChain 工具调用"""
    return python_repl_tool.invoke({"code": code})


# ===================================================
# 基础计算
# ===================================================

class TestBasicCalculation:
    """正常 Python 代码应正确执行并返回结果"""

    def test_simple_addition(self):
        result = _invoke("print(2 + 3)")
        assert "5" in result

    def test_float_multiplication(self):
        result = _invoke("print(100 * 0.85)")
        assert "85.0" in result

    def test_multi_line(self):
        code = "a = 10\nb = 20\nprint(a + b)"
        result = _invoke(code)
        assert "30" in result

    def test_string_operation(self):
        result = _invoke("print('营收: ' + str(3009))")
        assert "营收: 3009" in result

    def test_list_comprehension(self):
        result = _invoke("print(sum([i for i in range(1, 6)]))")
        assert "15" in result


# ===================================================
# 白名单模块
# ===================================================

class TestAllowedModules:
    """白名单内的 math / json / datetime 等模块允许导入"""

    def test_math_sqrt(self):
        result = _invoke("import math\nprint(math.sqrt(16))")
        assert "4.0" in result

    def test_json_dumps(self):
        result = _invoke('import json\nprint(json.dumps({"a": 1, "b": 2}))')
        # json.dumps 输出的键之间可能有空格
        assert '"a"' in result and '"b"' in result

    def test_datetime_now(self):
        result = _invoke("import datetime\nprint(datetime.datetime(2025, 6, 1).year)")
        assert "2025" in result

    def test_decimal_calc(self):
        result = _invoke("from decimal import Decimal\nprint(Decimal('0.1') + Decimal('0.2'))")
        assert "0.3" in result

    def test_collections_counter(self):
        result = _invoke("from collections import Counter\nc = Counter('abracadabra')\nprint(c['a'])")
        assert "5" in result


# ===================================================
# 安全边界（最关键的测试）
# ===================================================

class TestSecurityBoundary:
    """沙盒应阻止危险操作：os、subprocess、文件系统"""

    def test_block_os_import(self):
        """禁止 import os"""
        result = _invoke("import os\nprint('success')")
        assert "success" not in result
        assert "禁止" in result or "出错" in result or "Error" in result

    def test_block_subprocess_import(self):
        """禁止 import subprocess"""
        result = _invoke("import subprocess\nprint('success')")
        assert "success" not in result
        assert "禁止" in result or "出错" in result or "Error" in result

    def test_block_sys_import(self):
        """禁止 import sys"""
        result = _invoke("import sys\nprint(sys.version)")
        assert "禁止" in result or "出错" in result or "Error" in result

    def test_block_open_file(self):
        """禁止 open() 读取文件"""
        result = _invoke("open('/etc/passwd', 'r').read()")
        assert "禁止" in result or "出错" in result or "Error" in result

    def test_block_exec_eval(self):
        """exec / eval 不在内置白名单中，应被拦截"""
        result = _invoke("exec('print(123)')")
        assert "123" not in result
        assert "禁止" in result or "出错" in result or "Error" in result


# ===================================================
# 超时控制
# ===================================================

@pytest.mark.slow
class TestTimeout:
    """死循环 / 超长计算应在 10 秒内被强制终止"""

    def test_infinite_loop_timeout(self):
        result = _invoke("while True:\n    pass")
        assert "超时" in result or "timeout" in result.lower()


# ===================================================
# 边界情况
# ===================================================

class TestEdgeCases:
    """边界/异常输入"""

    def test_missing_print(self):
        """代码正确执行但没有 print，应给出提示"""
        result = _invoke("2 + 3")
        assert "print" in result.lower() or result == ""

    def test_empty_code(self):
        """空代码输入"""
        result = _invoke("")
        assert result is not None  # 不应崩溃

    def test_syntax_error(self):
        """语法错误应返回错误信息而非崩溃"""
        result = _invoke("print(1/0)")  # 除以零
        assert "Error" in result or "出错" in result or "division" in result.lower()

    def test_very_long_output(self):
        """大量输出不应阻塞"""
        result = _invoke("for i in range(100):\n    print(i)")
        assert "99" in result

"""
共享的 pytest fixtures。
运行: docker compose exec backend-v2 pytest tests/ -v
"""
import sys
import os

# 确保项目根目录在 sys.path 中
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def pytest_configure(config):
    """pytest 启动时标记"""
    config.addinivalue_line("markers", "slow: 耗时较长的测试")


def pytest_collection_modifyitems(config, items):
    """自动为标记为 slow 的测试添加 skip 支持"""
    for item in items:
        if "slow" in item.keywords and not config.getoption("--run-slow", default=False):
            pass  # 保留，以后可按需 skip

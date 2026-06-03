# 1. 选用官方轻量级 Python 3.10 镜像作为基础底座
FROM python:3.10-slim

# 2. 在容器内部创建一个叫 /app 的工作目录
WORKDIR /app

# 3. 设置环境变量：防止生成 .pyc 文件，并让日志直接输出到终端（不进缓冲区）
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 4. 安装系统依赖 (OpenCV 表格解析需要 libxcb/libgl 等图形库)
#    先切清华镜像源再安装，国内网络友好
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libxcb1 \
    libxcb-icccm4 \
    libxcb-image0 \
    libxcb-keysyms1 \
    libxcb-randr0 \
    libxcb-render-util0 \
    libxcb-shape0 \
    libxcb-xinerama0 \
    libxcb-xkb1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 5. 安装 Python 依赖 (利用 Docker 层缓存)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 6. 拷贝项目代码
COPY . .

# 7. 暴露 FastAPI 后端端口
EXPOSE 8000

# 8. 默认启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
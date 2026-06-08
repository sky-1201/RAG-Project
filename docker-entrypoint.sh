#!/bin/bash
# 容器启动时自动安�?OpenCV 缺失的系统库（python:3.10-slim 不含图形库）
set -e

# 如果 libxcb 已存在则跳过安装
if ldconfig -p 2>/dev/null | grep -q libxcb.so.1; then
    echo "�?系统依赖已存在，跳过安装"
else
    echo "🔧 安装系统依赖（libxcb/OpenGL�?.."
    # 切清华镜像，避开 deb.debian.org 的网络限�?
    sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends \
        libxcb1 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 \
        libxcb-randr0 libxcb-render-util0 libxcb-shape0 \
        libxcb-xinerama0 libxcb-xkb1 libgl1 libglib2.0-0
    echo "�?系统依赖就绪"
fi

exec "$@"

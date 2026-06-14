# ==========================================
# Stage 1: 构建 React 应用
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# 安装依赖 (利用 Docker 层缓存，国内镜像加速)
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

# API 密钥：构建时从外部注入，避免硬编码到源码中
ARG VITE_API_KEY=finance-rag-dev-key
ENV VITE_API_KEY=$VITE_API_KEY

# 拷贝源码并构建
COPY . .
RUN npm run build

# ==========================================
# Stage 2: Nginx 静态文件服务
# ==========================================
FROM nginx:1.27-alpine

# 补充 .mjs MIME 类型（PDF.js worker 需要）
RUN sed -i 's/js;/js mjs;/' /etc/nginx/mime.types

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置（API 代理到后端）
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

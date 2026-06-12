# 📈 Finance-RAG — 金融投研 Agentic RAG 系统

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](#)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-green)](#)
[![Milvus](https://img.shields.io/badge/Milvus-2.4-blueviolet)](#)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agent-orange)](#)
[![React](https://img.shields.io/badge/React-18-61dafb)](#)
[![Tests](https://img.shields.io/badge/tests-53_passed-brightgreen)](#)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF)](https://github.com/sky-1201/RAG-Project/actions)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](#)

面向金融财报场景的 **Agentic RAG 系统**。从 AI 生成的答案出发，可逐级追溯至原始 PDF 的精确页码——让每一条结论都可核查。

**🌐 在线体验**：[http://47.121.141.8](http://47.121.141.8) | **代码仓库**：[GitHub](https://github.com/sky-1201/RAG-Project)

---

## ✨ 核心特性

### 🔗 端到端溯源闭环

> "这个数据从哪里来的？" → 鼠标悬浮来源标签，预览命中片段 → 点击跳转 PDF 原文，自动定位到对应页码 → 黄色高亮卡片标注命中内容。

每条 Agent 回答的引用来源均附带**页码 + 原文片段**。检索 → 追溯 → 核查，一条完整的闭环链路。

### 🧠 ReAct Agent + 进程级代码沙盒

基于 **LangGraph** 的 ReAct 范式智能体，LLM 自主完成「意图识别 → 工具选择 → 观察 → 回答」推理循环。

Python 代码执行运行在 **multiprocessing 子进程**中，与主进程完全隔离：
- **10 秒超时自动 terminate** —— 死循环杀得掉
- **模块白名单** —— `import os` / `open()` / `exec()` 全部拦截
- 5 项安全边界测试覆盖，确保沙盒不被绕开

### 📊 双路召回 + RRF 融合 + Rerank 重排

自研 `HybridSearchEngine`，在 Milvus 底层 C++ 并行召回与融合：

```
Dense (1024d 语义向量) ─┐
                         ├→ RRF 倒数排序融合 → gte-rerank-v2 精排 → Top-5
Sparse (BM25 中文分词) ──┘
```

语义泛化 + 关键词精准兼顾，金融专有名词召回率显著提升。

### 📦 Parent-Child 存储解耦

完整语义段落（Parent）存 PostgreSQL 保障阅读连贯性，细粒度子块（Child）向量化入 Milvus 保障检索精度。检索命中子块后回填父块上下文，从根本上解决语义截断。

### 💾 三层记忆体系

- **上下文窗口** — 当前对话上下文
- **对话持久化** — PostgreSQL JSONB，侧边栏切换历史对话
- **长期记忆** — Q&A 向量化存入 Milvus，跨对话语义检索

### 🎨 产品级交互

- **Markdown 渲染** — 表格/代码/列表原生排版，表格带斑马条纹
- **暗色模式** — 一键切换，localStorage 持久化
- **对话自动标题** — qwen-turbo 根据首轮问答生成 10 字摘要
- **对话重命名** — 双击侧边栏标题即可编辑
- **文件管理** — 上传/删除/预览 PDF，显示大小与入库日期
- **📱 移动端响应式** — 桌面侧边栏常驻 + 移动端汉堡菜单浮层

---

## 🛡️ 工程质量

| 维度 | 说明 |
|:---|:---|
| **测试** | **53 项**单元测试，覆盖沙盒安全 / 来源解析 / 入库逻辑 / 检索管道 |
| **CI/CD** | GitHub Actions 自动测试 + 自动部署，push release → 全绿绿色 ✅ · 部署上线 |
| **事务补偿** | Milvus 写入失败 → PostgreSQL 自动回滚孤块 |
| **异常体系** | 三级异常（可恢复 / 不可恢复 / 致命），精准降级 |
| **沙盒安全** | multiprocessing 子进程隔离，supervisor 可强制 terminate |
| **MD5 去重** | 防止重复上传浪费 Token |
| **SSE 流式** | Agent 工具调用状态实时推送前端 |

---

## 🛠 技术栈

| 层级 | 选型 |
|:---|:---|
| Agent 编排 | LangGraph (ReAct), LangChain |
| 大模型 | Qwen-Max / qwen-turbo / text-embedding-v4 (1024d) / gte-rerank-v2 |
| 向量数据库 | Milvus 2.4 (HNSW + SPARSE_INVERTED_INDEX) |
| 关系型数据库 | PostgreSQL 15 (SQLAlchemy ORM, JSONB) |
| 文档解析 | Docling + pypdf (页码追踪) |
| 后端 | FastAPI · Pydantic V2 · SSE · multiprocessing |
| 前端 | React 18 · TypeScript · Zustand · Shadcn/ui · Tailwind · react-pdf · react-markdown |
| 部署 | Docker Compose (8 服务) · 阿里云 ECS · **GitHub Actions CI/CD** |

---

## 🏗 系统架构

```
PDF 上传 → Docling 版面解析 → pypdf 页码追踪 → 父子块切分
         → Parent ⇢ PostgreSQL / Child + 双向量 ⇢ Milvus

用户提问 → ReAct Agent
         → memory_retriever_tool    ← 长期记忆
         → financial_retriever_tool ← 双路召回 + RRF + Rerank
         → python_repl_tool         ← 进程沙盒计算
         → SSE 流式输出 + 来源引用（文件、页码、原文片段）
```

---

## 🚀 快速启动

```bash
# 1. 配置
cp .env.example .env  # 编辑填入 DASHSCOPE_API_KEY

# 2. 启动
docker compose up -d

# 3. 访问
#    前端: http://localhost:8502
#    API 文档: http://localhost:8000/docs

# 4. 测试
docker compose exec backend-v2 pytest tests/ -v
```

| 服务 | 地址 | 说明 |
|:---|:---|:---|
| 前端 | http://localhost:8502 | React SPA |
| API 文档 | http://localhost:8000/docs | Swagger |
| Attu (Milvus) | http://localhost:8002 | 向量数据面板 |
| pgAdmin | http://localhost:5050 | PostgreSQL 面板 (admin@rag.com / admin) |

---

## 📁 项目结构

```
.
├── app/
│   ├── api/            # FastAPI 路由
│   ├── core/           # 配置 / 鉴权 / 异常 / 日志
│   ├── prompts/        # YAML Prompt 模板
│   ├── services/       # ingestion, retrieval, hybrid_search, memory
│   └── tools/          # Agent 工具 (沙盒 / 检索 / 记忆)
├── frontend-react/     # React SPA
├── tests/              # 53 项 pytest 用例
├── .github/workflows/  # CI/CD 自动测试 + 自动部署
├── docker-compose.yml  # 8 服务编排
└── Dockerfile
```

---

> 📌 建议上传 `公司名+年份+报告类型.pdf` 格式的财报文件（如 `深信服2025年半年度报告.pdf`），系统将自动提取年份与公司信息。

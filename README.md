# 📈 Finance-RAG: 企业级金融投研 Agentic RAG 系统

![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-green)
![Milvus](https://img.shields.io/badge/Milvus-2.4-blueviolet)
![LangGraph](https://img.shields.io/badge/LangGraph-Agent-orange)
![React](https://img.shields.io/badge/React-18-61dafb)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

面向金融财报、研报场景的 **Agentic RAG 系统**，解决大模型在垂直领域中 **语义截断、专有名词召回率低、财务计算幻觉** 三大痛点。

---

## ✨ 核心亮点

### 1. Parent-Child 存储解耦
抛弃单一向量切分方案。完整语义段落（Parent）存 PostgreSQL，细粒度子块（Child）向量化入 Milvus。**检索命中子块，LLM 阅读父块** — 从根本上解决上下文截断问题。

### 2. 双路召回 + RRF 融合 + Reranker 重排
自研 `HybridSearchEngine`：Dense (1024 维语义向量) + Sparse (BM25 中文分词关键词) 双路并行召回 → RRF 倒数排序融合 → gte-rerank-v2 精排。**语义泛化 + 关键词精准兼顾**，金融专有名词召回率显著提升。

### 3. ReAct Agent + Python 代码沙盒
基于 LangGraph 的 ReAct 范式智能体，LLM 自主完成 **意图识别 → 工具选择 → 观察 → 回答** 的推理循环。针对财务计算幻觉，封装受限 Python REPL 沙盒（10 秒超时、模块白名单），**让 LLM 写代码算而非心算**，确保数字 100% 准确。

### 4. Agent 长短期记忆
三层记忆体系协同：**短期记忆**（当前对话上下文窗口）、**对话持久化**（PostgreSQL JSONB）、**长期记忆**（Q&A 片段向量化存入 Milvus，跨对话语义检索）。用户说"上次那个公司"，Agent 自动检索记忆库找回历史事实。

### 5. LLM 元数据兜底提取
文件名解析失败时（如 `123.pdf`），自动用 qwen-turbo 从 PDF 正文前几页提取公司名与年份。三层降级：正则解析 → LLM 提取 → 保留"未知"，零成本的路径优先，昂贵操作为兜底。

### 6. 检索源引用可视化
Agent 调用的财报来源实时推送到前端，用户可看到每条回答引用了哪些 PDF 文件及其相关度分数 — 金融场景下可追溯、可核查。

### 7. 分布式事务补偿与生产级工程
- **MD5 指纹去重** — 防止重复入库
- **Milvus 写入失败 → PostgreSQL 自动回滚** — 保证双库强一致性
- **Agent 步数上限** (recursion_limit=10) — 防止无限循环耗尽 token
- **三级异常体系** — 区分可恢复/不可恢复错误，精准降级
- **SSE 流式输出** — 实时展示 LLM 生成过程 + 工具调用状态
- **LLM-as-a-Judge 评测** — 准确性 + 无幻觉性双维度自动打分

---

## 🛠 技术栈

| 层级 | 技术选型 |
|------|---------|
| **Agent 编排** | LangGraph (ReAct), LangChain |
| **大模型** | Qwen-Max (推理), text-embedding-v4 (向量), gte-rerank-v2 (重排) |
| **向量数据库** | Milvus 2.4 (HNSW + SPARSE_INVERTED_INDEX 双索引) |
| **关系型数据库** | PostgreSQL 15 (SQLAlchemy ORM, JSONB) |
| **文档解析** | Docling (版面分析), pypdf |
| **后端** | FastAPI (异步), Pydantic V2, SSE |
| **前端** | React 18, TypeScript, Zustand, Shadcn/ui, Tailwind |
| **部署** | Docker Compose 一键启动 7 个服务 |

---

## 🏗 系统架构

```
用户上传 PDF
  → Docling 版面解析 → Markdown
  → 父子块切分 + LLM 元数据兜底提取
  → 双库落盘: Parent → PostgreSQL / Child + 双向量 → Milvus
  → MD5 指纹登记 (去重)

用户提问
  → LangGraph ReAct Agent
  → 调 memory_retriever_tool    ← 长期记忆检索
  → 调 financial_retriever_tool ← 双路召回 + RRF + Rerank
  → 调 python_repl_tool         ← 沙盒精确计算
  → SSE 流式输出回答 + 检索来源引用
  → 自动写入长期记忆
```

---

## 🚀 快速启动

### 1. 环境准备
安装 Docker Desktop。

### 2. 配置
```bash
cp .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY
# 申请地址: https://bailian.console.aliyun.com/
```

### 3. 一键启动
```bash
docker compose up -d
```

### 4. 访问
| 服务 | 地址 |
|------|------|
| React 前端 | http://localhost:8502 |
| API 文档 (Swagger) | http://localhost:8000/docs |
| Milvus 管理面板 (Attu) | http://localhost:8002 |
| pgAdmin | http://localhost:5050 (admin@rag.com / admin) |

> 📌 建议上传 `公司名+年份+报告类型.pdf` 格式的文件（如 `深信服2025年半年度报告.pdf`），以便系统自动提取年份与公司信息。命名不规范时，LLM 会自动从正文中提取。

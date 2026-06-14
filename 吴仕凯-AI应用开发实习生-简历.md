# 吴仕凯 - AI应用开发实习生

::: left

icon:info 男 / 2003.12 / 广东汕尾

icon:email 1309098402@qq.com

icon:phone 18927910405

:::

::: right



:::

## 教育背景

:::left
**东莞理工学院 - 计算机科学与技术（本科）**
:::
:::right
**2023.09 - 预计 2027.07**
:::

奖项证书：CET-4、校三等奖学金、C1D驾驶证

在校经历：担任学院羽毛球队队长、新闻媒体中心成员、班级心理委员

## 项目经历

### 智能财报分析系统 — Agentic RAG | 核心开发
`Python` `FastAPI` `LangGraph` `React` `Typescript` `Milvus 2.4` `PostgreSQL` `Docker Compose`

GitHub: github.com/sky-1201/RAG-Project  |  在线演示: http://47.121.141.8

- **项目描述**：面向金融财报场景的端到端 Agentic RAG 系统，支持上传超长 PDF（300+页）并可精准问答与页码级溯源，已部署在线演示。

- **核心工作**：
  - **Parent-Child 存储解耦**：父块入 PostgreSQL 保上下文完整，子块双向量化入 Milvus 保检索精度，命中子块后回填父块解决语义截断。MD5 去重 + Milvus 写入失败自动回滚 PostgreSQL，保障双库一致性。
  - **Dense + Sparse 双路融合检索**：语义向量（1024 维）与 BM25 中文分词双路并行召回，Milvus 内置 RRF 倒排融合后经 Rerank 精排，取 Top-5 送入 LLM。语义泛化与关键词精准互补。
  - **ReAct Agent 与多进程安全沙盒**：基于 LangGraph 构建 ReAct Agent，配备检索 / 代码执行 / 记忆三类工具。沙盒采用 multiprocessing 子进程隔离、模块白名单、替换 builtins、10s 超时强制终止。
  - **SSE 流式与端到端溯源**：检索结果携带文件、页码、原文片段，前端可悬浮预览命中片段 → 点击跳转 PDF 精确定位页码 → 黄色卡片高亮命中内容。移动端 PDF 按需渲染 Canvas，避免内存溢出。
  - **工程化实践**：53 项 pytest 单测覆盖安全沙盒、检索管道与入库逻辑；GitHub Actions CI/CD 自动测试与部署；数据库启动失败自动重试；Docling 分批流式解析防内存溢出；入库进度实时轮询。

### 多智能体反洗钱风控系统 | 核心开发
`Python` `FastAPI` `LangGraph` `Celery` `Redis` `Neo4j` `MySQL` `Streamlit` `Docker`

GitHub: github.com/sky-1201/Fraud-detective

- **项目描述**：基于 Kaggle PaySim 仿真交易数据集，模拟银行反洗钱业务全流程——雷达扫描 → 探员侦查 → 专家定性 → 结案报告。

- **核心工作**：
  - **三节点 Agent 流水线**：Investigator（图谱侦查）→ Analyst（风险打分）→ Reporter（结案报告）顺序编排，TypedDict 约束节点间数据传递，Analyst 强制输出结构化的风险判决书。
  - **Celery 异步解耦**：LangGraph 推理任务投递至 Celery Worker 离线执行，API 即时返回任务 ID，前端轮询获取结果。分离长耗时阻塞计算与 HTTP 响应，支撑高并发场景。
  - **MySQL + Neo4j 异库协同**：MySQL 双向流水聚合筛选高频交易账户锁定嫌疑人，Neo4j 执行 2 度资金链路穿透 → LLM 总结网络特征（归集/打散/中转）。手写 Cypher 模板规避 Text2Cypher 语法幻觉。

## 专业能力

- **前后端开发**：Python + FastAPI 技术栈，熟悉异步编程、SSE 流式响应、SQLAlchemy ORM 与 PostgreSQL 数据建模；了解 React 与 TypeScript 基础。
- **大模型应用**：熟练使用 LangChain 与 LangGraph 框架，熟悉 RAG 全链路、Agent 工具定义与编排、Pydantic 结构化输出约束及 LLM-as-a-Judge 评测。
- **数据与工程**：Milvus / Neo4j / MySQL / PostgreSQL 多数据库协同，Celery + Redis 异步任务，Docker Compose 容器化部署与 CI/CD 流水线。
- **工具**：Git 版本控制，熟练使用 Claude Code（熟悉 Skills 功能与原理）/ Cursor / Trae 等 AI 编程工具辅助开发，熟悉 Linux 基础命令与服务器部署。

#终端运行： python evals/evaluate_rag.py

import sys
import os
import datetime

# 🌟 寻址魔法：将项目根目录强制加入 Python 的环境变量中
# 这样脚本在 evals 文件夹下运行时，依然能认得外层的 app 模块
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(PROJECT_ROOT)

import pandas as pd
import json
import logging
from tqdm import tqdm
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from app.services.agent import FinancialAgentService
from app.core.config import settings

# 关闭不必要的繁杂日志
logging.getLogger("httpx").setLevel(logging.WARNING)


class RAGEvaluator:
    def __init__(self):
        print("⏳ 正在初始化 RAG 评测流水线...")
        self.agent = FinancialAgentService()

        self.judge_llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.DASHSCOPE_API_KEY,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            temperature=0.0
        )

        self.eval_prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个严苛的金融投研 RAG 系统评测专家。
            你需要对比【用户问题】、【人工给出的标准答案】以及【AI 系统的实际回答】。

            请你从以下两个维度给出 0 到 10 的整数评分：
            # 将 prompt 中的第一条要求修改为：
            1. 准确性 (Accuracy): AI 的回答是否涵盖了标准答案中的核心事实？(10分全覆盖，0分完全答错。注意：如果 AI 结合上下文给出了比标准答案更丰富、且没有矛盾的正确扩展信息，不仅不能扣分，反而应该给满分！)
            2. 无幻觉性 (Faithfulness): AI 的回答中，是否没有编造标准答案以外的虚假数据？(10分全无幻觉，0分满篇胡编)
            
            严格要求：你的输出必须是一个合法的 JSON 格式，如下所示，不要输出任何其他废话：
            {{"accuracy": 8, "faithfulness": 10, "reason": "理由简述"}}"""),
            ("user", "【用户问题】: {question}\n\n【标准答案】: {ground_truth}\n\n【AI 实际回答】: {ai_answer}")
        ])

        self.eval_chain = self.eval_prompt | self.judge_llm
        print("✅ 评测流水线准备就绪！")

    def run_evaluation(self, csv_path: str, output_path: str):
        print(f"📄 正在读取测试集: {csv_path}")
        try:
            df = pd.read_csv(csv_path, encoding='utf-8')
        except UnicodeDecodeError:
            print("⚠️ 检测到 Windows Excel 默认 GBK 编码，已自动切换解码模式...")
            df = pd.read_csv(csv_path, encoding='gbk')

        # 清洗表头
        df.columns = df.columns.str.strip().str.lower()

        if 'question' not in df.columns or 'ground_truth' not in df.columns:
            print(f"❌ 严重错误: CSV 的表头不对！Pandas 实际读到的表头是: {list(df.columns)}")
            print("👉 请确保第一行的 A 列叫 'question'，B 列叫 'ground_truth'")
            return

        results = []
        total_accuracy = 0
        total_faithfulness = 0

        print(f"🚀 开始跑批自动化评测，共 {len(df)} 道测试题...")

        for index, row in tqdm(df.iterrows(), total=len(df)):
            question = row['question']
            ground_truth = row['ground_truth']

            try:
                ai_answer = self.agent.chat(question)

                judge_response = self.eval_chain.invoke({
                    "question": question,
                    "ground_truth": ground_truth,
                    "ai_answer": ai_answer
                })

                score_dict = json.loads(judge_response.content.replace("```json", "").replace("```", "").strip())

                acc = score_dict.get("accuracy", 0)
                faith = score_dict.get("faithfulness", 0)

                total_accuracy += acc
                total_faithfulness += faith

                results.append({
                    "question": question,
                    "ground_truth": ground_truth,
                    "ai_answer": ai_answer,
                    "accuracy_score": acc,
                    "faithfulness_score": faith,
                    "judge_reason": score_dict.get("reason", "")
                })

            except Exception as e:
                print(f"\n❌ 第 {index + 1} 题评测出错: {str(e)}")

        report_df = pd.DataFrame(results)
        report_df.to_csv(output_path, index=False, encoding='utf-8-sig')

        print("\n" + "=" * 40)
        print("🎯 自动化评测报告总结")
        print("=" * 40)
        print(f"总测试题数: {len(df)}")
        print(f"平均准确性 (Accuracy): {total_accuracy / len(df):.2f} / 10")
        print(f"平均无幻觉性 (Faithfulness): {total_faithfulness / len(df):.2f} / 10")
        print(f"👉 详细分析报告已保存至: {output_path}")


if __name__ == "__main__":
    # 获取 evals 文件夹的绝对路径
    current_dir = os.path.dirname(os.path.abspath(__file__))
    input_csv = os.path.join(current_dir, "eval_dataset.csv")

    # 🌟 1. 定义专属的报告文件夹路径
    reports_dir = os.path.join(current_dir, "reports")

    # 🌟 2. 架构师级防御：如果 reports 文件夹不存在，自动创建它！
    os.makedirs(reports_dir, exist_ok=True)

    # 3. 生成带时间戳的报告，并将其放入 reports 文件夹中
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_csv = os.path.join(reports_dir, f"eval_report_{timestamp}.csv")

    evaluator = RAGEvaluator()
    evaluator.run_evaluation(input_csv, output_csv)
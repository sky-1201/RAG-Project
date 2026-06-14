import { useChatStore } from '@/store/chatStore'
import { BarChart3, Upload, FileSearch, Calculator } from 'lucide-react'

/** 数据工作站初态 — 功能导向布局，用户一眼知道能做什么 */
export function EmptyState() {
  const { sendMessage, isLoading } = useChatStore()

  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      {/* 主视觉区 */}
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10">
        <BarChart3 className="h-7 w-7 text-primary" />
      </div>

      <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">
        智能财报分析系统
      </h2>
      <p className="mb-10 text-sm text-muted-foreground text-center max-w-md leading-relaxed">
        Agent 自主检索 · 代码沙盒计算 · 双路语义召回
      </p>

      {/* 能力卡片 — 三列网格 */}
      <div className="grid gap-3 w-full max-w-lg mb-10 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 text-center">
          <FileSearch className="h-5 w-5 text-primary mx-auto mb-2" />
          <h3 className="text-xs font-medium mb-0.5">语义检索</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            跨文件双路召回
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <Calculator className="h-5 w-5 text-primary mx-auto mb-2" />
          <h3 className="text-xs font-medium mb-0.5">沙盒计算</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Python 实时运算
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <Upload className="h-5 w-5 text-primary mx-auto mb-2" />
          <h3 className="text-xs font-medium mb-0.5">PDF 解析</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            上传即查，来源可溯源
          </p>
        </div>
      </div>

      {/* 快捷提问入口 */}
      <div className="w-full max-w-lg">
        <p className="text-xs text-muted-foreground mb-3 text-center font-medium tracking-wide uppercase">
          试试这样问
        </p>
        <div className="grid gap-2">
          <Suggestion text="深信服公司的联系人是谁？股权结构是怎么样的？" />
          <Suggestion text="比亚迪2025年比上年营收同比增长多少？" />
          <Suggestion text="比亚迪公司的员工结构和薪资待遇怎么样？" />
        </div>
      </div>
    </div>
  )
}

function Suggestion({ text }: { text: string }) {
  const { sendMessage, isLoading } = useChatStore()

  return (
    <button
      onClick={() => !isLoading && sendMessage(text)}
      disabled={isLoading}
      className="group relative w-full rounded-lg border bg-card px-4 py-3 text-left text-sm leading-relaxed transition-all hover:border-primary/30 hover:bg-secondary/50 hover:shadow-sm disabled:opacity-50"
    >
      <span className="text-foreground/80 group-hover:text-foreground transition-colors">
        {text}
      </span>
    </button>
  )
}

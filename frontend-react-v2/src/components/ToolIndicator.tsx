import { cn } from '@/lib/utils'
import { Brain, Code, Database, Loader2 } from 'lucide-react'
import { Separator } from '@/components/ui/separator'

interface ToolIndicatorProps {
  currentTool: string
}

/**
 * Agent 工具调用指示器 — 终端状态行风格
 * 模拟 Bloomberg 终端底部状态栏的倒计时感
 */
const TOOL_CONFIG: Record<string, { icon: typeof Brain; label: string }> = {
  financial_retriever_tool: {
    icon: Database,
    label: '正在检索 Milvus 知识库',
  },
  python_repl_tool: {
    icon: Code,
    label: '正在执行 Python 代码计算',
  },
  memory_retriever_tool: {
    icon: Brain,
    label: '正在检索长期记忆',
  },
}

export function ToolIndicator({ currentTool }: ToolIndicatorProps) {
  const config = TOOL_CONFIG[currentTool]

  return (
    <div className="mx-auto max-w-[720px] px-4 py-3 animate-in fade-in">
      <div className="flex items-center gap-2.5 rounded-md bg-card border px-4 py-2.5">
        {/* 状态指示灯 */}
        {config ? (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}

        {/* 工具名称 + 状态文字 */}
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          {config ? (
            <>
              <config.icon className="h-3.5 w-3.5" />
              <span>{config.label}</span>
            </>
          ) : (
            <span>Agent 思考中...</span>
          )}
        </div>

        <Separator orientation="vertical" className="h-3 mx-1" />

        {/* 动画进度条 */}
        <span className="flex gap-1">
          <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-pulse-dot" />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-pulse-dot [animation-delay:0.2s]" />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-pulse-dot [animation-delay:0.4s]" />
        </span>
      </div>
    </div>
  )
}

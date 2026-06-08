import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Brain, Code, Loader2 } from 'lucide-react'

interface ToolIndicatorProps {
  currentTool: string
}

const TOOL_CONFIG: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  financial_retriever_tool: {
    icon: Brain,
    label: '正在检索 Milvus 知识库...',
    color: 'text-blue-500 border-blue-200 bg-blue-50',
  },
  python_repl_tool: {
    icon: Code,
    label: '正在执行 Python 代码计算...',
    color: 'text-amber-500 border-amber-200 bg-amber-50',
  },
  memory_retriever_tool: {
    icon: Brain,
    label: '正在检索长期记忆...',
    color: 'text-purple-500 border-purple-200 bg-purple-50',
  },
}

export function ToolIndicator({ currentTool }: ToolIndicatorProps) {
  const config = TOOL_CONFIG[currentTool]

  if (!config) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Agent 思考中...</span>
      </div>
    )
  }

  const Icon = config.icon

  return (
    <div className="flex items-center justify-center px-4 py-3">
      <Badge
        variant="outline"
        className={cn('flex items-center gap-2 px-4 py-2 text-xs font-normal', config.color)}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{config.label}</span>
        <span className="flex gap-1 ml-1">
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot [animation-delay:0.2s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot [animation-delay:0.4s]" />
        </span>
      </Badge>
    </div>
  )
}

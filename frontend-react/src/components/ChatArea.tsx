import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChatStore } from '@/store/chatStore'
import { ChatMessage } from '@/components/ChatMessage'
import { ChatInput } from '@/components/ChatInput'
import { ToolIndicator } from '@/components/ToolIndicator'
import { Bot, Sparkles } from 'lucide-react'

export function ChatArea() {
  const { messages, isLoading, currentTool } = useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentTool])

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* 顶部标题栏 */}
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">智能金融投研 Agent</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" title="后端已连接" />
          <span className="text-xs text-muted-foreground">qwen-max</span>
        </div>
      </header>

      {/* 聊天消息区 */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl">
          {!hasMessages ? (
            /* 空状态 */
            <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-2 text-xl font-semibold">Finance-RAG 智能投研助手</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                基于 Docling 版面分析 + Milvus 混合检索 + Qwen 代码执行构建。
                <br />
                上传财报 PDF 后，即可开始提问。
              </p>
              <div className="mt-8 grid gap-2 text-sm text-muted-foreground">
                <Suggestion text="计算2025年深信服的毛利率" />
                <Suggestion text="深信服2025年上半年营收同比增长多少？" />
                <Suggestion text="深信服成本控制方面采取了什么措施？" />
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {/* Agent 工具调用指示器 */}
              {isLoading && currentTool && (
                <ToolIndicator currentTool={currentTool} />
              )}
            </>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* 底部输入框 */}
      <ChatInput />
    </div>
  )
}

/** 快捷提问建议 */
function Suggestion({ text }: { text: string }) {
  const { sendMessage, isLoading } = useChatStore()
  return (
    <button
      onClick={() => !isLoading && sendMessage(text)}
      disabled={isLoading}
      className="rounded-lg border bg-card px-4 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
    >
      {text}
    </button>
  )
}

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChatStore } from '@/store/chatStore'
import { ChatMessage } from '@/components/ChatMessage'
import { ChatInput } from '@/components/ChatInput'
import { ToolIndicator } from '@/components/ToolIndicator'
import { Button } from '@/components/ui/button'
import { Bot, Sparkles, Sun, Moon } from 'lucide-react'

/** 暗色模式切换：读写 <html> 的 dark class + localStorage 持久化 */
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return document.documentElement.classList.contains('dark')
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  // 页面加载时从 localStorage 恢复
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') setDark(true)
    else if (saved === 'light') setDark(false)
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) setDark(true)
  }, [])

  return { dark, toggle: () => setDark((d) => !d) }
}

export function ChatArea() {
  const { messages, isLoading, currentTool } = useChatStore()
  const { dark, toggle } = useDarkMode()
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
          <h1 className="text-base font-semibold">智能财报分析系统</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggle}
            title={dark ? '切换浅色模式' : '切换暗色模式'}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
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
              <h2 className="mb-2 text-xl font-semibold">智能财报分析系统</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Agent 自主检索 · 代码沙盒计算 · 双路语义召回
                <br />
                上传财报 PDF，像和研究员对话一样分析数据。
              </p>
              <div className="mt-8 grid gap-2 text-sm text-muted-foreground">
                <Suggestion text="2025年深信服的营收是多少？" />
                <Suggestion text="深信服2025年上半年营收同比增长多少？" />
                <Suggestion text="深信服公司的联系人是谁？" />
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isStreaming={isLoading && i === messages.length - 1 && msg.role === 'assistant'}
                />
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

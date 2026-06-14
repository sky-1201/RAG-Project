import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/store/chatStore'
import { ChatMessage } from '@/components/ChatMessage'
import { ChatInput } from '@/components/ChatInput'
import { ToolIndicator } from '@/components/ToolIndicator'
import { EmptyState } from '@/components/EmptyState'
import { BarChart3, Sun, Moon } from 'lucide-react'

/** 暗色模式切换 — 与 index.html 中的内联脚本保持一致的判断逻辑 */
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    // 与 index.html 内联脚本保持同步：直接从 localStorage 读取，避免多次渲染后不一致
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') return true
    if (saved === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
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

  return { dark, toggle: () => setDark((d) => !d) }
}

export function ChatArea() {
  const { messages, isLoading, currentTool } = useChatStore()
  const { dark, toggle } = useDarkMode()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentTool])

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* 顶部栏 — 极简：仅标题 + 暗色切换 */}
      <header className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <div className="flex items-center gap-2.5 select-none">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            智能财报分析系统
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={toggle}
            title={dark ? '切换浅色模式' : '切换暗色模式'}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* 消息区 */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-[720px] px-4">
          {!hasMessages ? (
            <EmptyState />
          ) : (
            <div className="py-4">
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
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* 底部输入框 */}
      <ChatInput />
    </div>
  )
}

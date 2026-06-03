import { useRef, useCallback, type KeyboardEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/store/chatStore'

export function ChatInput() {
  const { sendMessage, stopGeneration, isLoading } = useChatStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return

      const query = textarea.value.trim()
      if (!query || isLoading) return

      textarea.value = ''
      // 重置高度
      textarea.style.height = 'auto'

      sendMessage(query)
    },
    [sendMessage, isLoading]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter 发送（Shift+Enter 换行）
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // 自适应高度
    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
  }, [])

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t bg-background px-4 py-3"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea
          ref={textareaRef}
          placeholder="输入您的问题，例如：计算2025年深信服的毛利率"
          rows={1}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          className={cn(
            'min-h-[44px] max-h-[200px] resize-none',
            'text-sm leading-relaxed'
          )}
          disabled={isLoading}
          autoFocus
        />

        {isLoading ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={stopGeneration}
            className="shrink-0"
            title="停止生成"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="shrink-0"
            disabled={isLoading}
            title="发送消息"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
        Enter 发送 · Shift + Enter 换行 · 回答由 AI 生成，请核实关键财务数据
      </p>
    </form>
  )
}

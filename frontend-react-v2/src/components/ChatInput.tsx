import { useRef, useCallback, type KeyboardEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Square, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/store/chatStore'

export function ChatInput() {
  const { sendMessage, stopGeneration, isLoading, messages } = useChatStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasMessages = messages.length > 0

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return

      const query = textarea.value.trim()
      if (!query || isLoading) return

      textarea.value = ''
      textarea.style.height = 'auto'

      sendMessage(query)
    },
    [sendMessage, isLoading]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

  return (
    <div
      className={cn(
        'border-t bg-background px-4',
        // 有消息时贴底，无消息时居中浮动
        hasMessages ? 'py-3' : 'py-3'
      )}
    >
      <div className="mx-auto flex max-w-[720px] items-end gap-2">
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            placeholder="例如：2024年比亚迪公司的营收是多少"
            rows={1}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            className={cn(
              'min-h-[44px] max-h-[200px] resize-none pr-10',
              'text-sm leading-relaxed',
              'border-border focus-visible:border-primary/50',
              'transition-colors'
            )}
            disabled={isLoading}
            autoFocus
          />
          {/* 字符计数 / PDF 提示 — 右下角微标 */}
          {!hasMessages && (
            <div className="absolute right-2 bottom-1.5 text-[10px] text-muted-foreground/50 pointer-events-none">
              <FileText className="h-3 w-3 inline mr-0.5 -mt-0.5" />
              PDF 上传后提问更精准
            </div>
          )}
        </div>

        {isLoading ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={stopGeneration}
            className="shrink-0 border-danger/30 text-danger hover:bg-danger/5 hover:border-danger"
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

      <p className="mx-auto mt-2 max-w-[720px] text-center text-[11px] text-muted-foreground/70">
        Enter 发送 · Shift + Enter 换行 · 回答由 AI 生成，请核实关键财务数据
      </p>
    </div>
  )
}

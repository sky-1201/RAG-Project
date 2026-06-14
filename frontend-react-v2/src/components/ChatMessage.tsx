import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { Message } from '@/types'
import { Bot, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { SourceTag } from '@/components/SourceTag'

interface ChatMessageProps {
  message: Message
  isStreaming?: boolean
}

/** 自定义 Markdown 渲染组件 — 账本式表格 */
const mdComponents: Components = {
  // --- 表格：账本风格，数字右对齐 ---
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border">
      <table className="min-w-full text-xs tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/70">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap border-b">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5 border-t text-left [tr:nth-child(even)_&]:bg-muted/20">
      {children}
    </td>
  ),

  // --- 代码 ---
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-muted/70 p-3 font-mono text-xs">{children}</pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className || '')
    return isBlock ? (
      <code className={cn('text-xs font-mono', className)} {...props}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" {...props}>{children}</code>
    )
  },

  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="text-primary underline decoration-primary/30 hover:decoration-primary transition-colors">
      {children}
    </a>
  ),

  ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
  h1: ({ children }) => <h1 className="my-2 text-base font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="my-2 text-sm font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="my-1.5 text-xs font-bold first:mt-0">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/30 pl-3 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const useMarkdown = !isUser && !isStreaming && !!message.content

  return (
    <div
      className={cn(
        'flex gap-3 py-3 animate-in fade-in slide-in-from-bottom-2',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* 头像 */}
      <Avatar
        className={cn(
          'h-8 w-8 shrink-0',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground ring-1 ring-border'
        )}
      >
        <AvatarFallback>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      {/* 消息气泡 */}
      <div
        className={cn(
          'max-w-[85%] lg:max-w-[75%] rounded-lg px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-card border text-foreground shadow-sm'
        )}
      >
        {/* 内容 */}
        {useMarkdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {message.content}
          </ReactMarkdown>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {message.content || (!isUser ? '▌' : '')}
          </div>
        )}

        {/* 来源标签 — 荧光笔贴纸 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-border/60">
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((s, i) => (
                <SourceTag key={`src-${i}-${s.page_number || 0}`} source={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

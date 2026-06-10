import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { Message, SourceInfo } from '@/types'
import { Bot, User, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { useChatStore } from '@/store/chatStore'

interface ChatMessageProps {
  message: Message
  /** 流式生成中时标记为 true，此时用纯文本渲染避免半截 markdown 格式错乱 */
  isStreaming?: boolean
}

/** 自定义 markdown 元素样式（不依赖 @tailwindcss/typography） */
const mdComponents: Components = {
  // --- 表格（金融数据最重要的格式） ---
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border-2 border-gray-400">
      <table className="min-w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b-2 border-gray-400 bg-muted/60">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-gray-300 last:border-r-0">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5 border-t border-gray-300 [tr:nth-child(even)_&]:bg-muted/30">{children}</td>
  ),

  // --- 代码 ---
  // 代码块：外层 <pre> 负责背景和间距，内层 <code> 仅保留字体
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded bg-muted p-2.5">{children}</pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className || '')
    return isBlock ? (
      <code className={cn('text-xs font-mono', className)} {...props}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...props}>{children}</code>
    )
  },

  // --- 链接 ---
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="text-primary underline hover:opacity-80">
      {children}
    </a>
  ),

  // --- 列表 ---
  ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-4">{children}</ol>,

  // --- 段落 ---
  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,

  // --- 标题 ---
  h1: ({ children }) => <h1 className="my-2 text-lg font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="my-2 text-base font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="my-1.5 text-sm font-bold first:mt-0">{children}</h3>,

  // --- 引用 ---
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/30 pl-3 italic text-muted-foreground">
      {children}
    </blockquote>
  ),

  // --- 分割线 ---
  hr: () => <hr className="my-3 border-border" />,
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === 'user'
  // 流式生成中的最后一条 assistant 消息用纯文本渲染，完成后自动切换为 Markdown
  const useMarkdown = !isUser && !isStreaming && message.content

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-4 animate-in fade-in slide-in-from-bottom-2',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <Avatar className={cn('h-8 w-8 shrink-0', isUser ? 'bg-primary' : 'bg-muted')}>
        <AvatarFallback className={isUser ? 'text-primary-foreground' : 'text-foreground'}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          'max-w-[95%] lg:max-w-[80%] rounded-lg px-3 lg:px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {/* 消息内容 */}
        {useMarkdown ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={mdComponents}
          >
            {message.content}
          </ReactMarkdown>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {message.content || (isUser ? '' : '▌')}
          </div>
        )}

        {/* 引用来源（仅非空的 assistant 消息展示） */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-border/50 pt-2">
            <span className="text-xs text-muted-foreground">📎 参考来源：</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
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

/** 来源标签：悬浮预览命中片段，点击打开 PDF 原文并跳转到对应页码 */
function SourceTag({ source }: { source: SourceInfo }) {
  const openPdfViewer = useChatStore((s) => s.openPdfViewer)

  return (
    <span
      className="group relative inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground border cursor-pointer hover:border-primary/50 hover:text-primary transition-colors"
      onClick={(e) => {
        e.stopPropagation()
        if (source.file_hash) {
          openPdfViewer(source.file_hash, source.file, source.page_number || 1, source.snippet || '')
        }
      }}
    >
      <FileText className="h-3 w-3" />
      {source.file}
      {source.page_number ? ` · P${source.page_number}` : ''}

      {/* 悬浮预览卡片（向上弹出，避免底部超视口导致页面跳动） */}
      {source.snippet && (
        <span className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 w-80 rounded-lg border-2 border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600 p-3 text-xs leading-relaxed text-foreground shadow-xl">
          <span className="line-clamp-6">{source.snippet}</span>
        </span>
      )}
    </span>
  )
}

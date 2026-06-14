import type { SourceInfo } from '@/types'
import { useChatStore } from '@/store/chatStore'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 来源标签 — 「荧光笔贴纸」形态
 * 悬浮预览命中原文片段，点击打开 PDF 原文并跳转到对应页码
 */
export function SourceTag({ source }: { source: SourceInfo }) {
  const openPdfViewer = useChatStore((s) => s.openPdfViewer)

  return (
    <span
      className={cn(
        'group relative inline-flex items-center gap-1 rounded-sm px-2 py-0.5',
        'text-xs cursor-pointer transition-all select-none',
        // 荧光笔色板
        'bg-highlighter-light text-highlighter-fg',
        'border border-highlighter-border/40',
        'hover:border-highlighter-border hover:bg-highlighter-light/80',
        'shadow-sm'
      )}
      onClick={(e) => {
        e.stopPropagation()
        if (source.file_hash) {
          openPdfViewer(
            source.file_hash,
            source.file,
            source.page_number || 1,
            source.snippet || ''
          )
        }
      }}
    >
      <FileText className="h-3 w-3 shrink-0 opacity-70" />
      <span className="truncate max-w-[120px]">
        {source.file}
      </span>
      {source.page_number && (
        <span className="opacity-60 font-mono text-[10px]">
          P{source.page_number}
        </span>
      )}

      {/* 悬浮预览卡片 — 向上弹出，模拟荧光笔划过的报告段落 */}
      {source.snippet && (
        <span className={cn(
          'pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block z-50',
          'w-72 rounded-md border border-highlighter-border/60',
          'bg-highlighter-light dark:bg-highlighter-light',
          'p-3 text-xs leading-relaxed text-highlighter-fg',
          'shadow-lg',
          'animate-in fade-in slide-in-from-bottom-1'
        )}>
          {/* 报告原文片段预览 */}
          <span className="block text-[11px] leading-relaxed line-clamp-6 font-sans">
            {source.snippet}
          </span>
          {/* 底部标注 */}
          <span className="block mt-2 text-[10px] opacity-60 font-mono">
            {source.file} · P{source.page_number}
          </span>
        </span>
      )}
    </span>
  )
}

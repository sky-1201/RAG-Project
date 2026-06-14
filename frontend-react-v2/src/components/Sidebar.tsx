import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileUpload } from '@/components/FileUpload'
import { useChatStore } from '@/store/chatStore'
import {
  listConversations,
  getConversation,
  deleteConversation,
  updateConversation,
  deleteFile,
  listFiles,
  type ConversationSummary,
  type FileInfo,
} from '@/services/api'
import {
  Plus,
  Trash2,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  X,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onCollapse,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
  collapsed?: boolean
  onCollapse?: () => void
}) {
  const { messages, clearMessages, setMessages, setConversationId, currentConversationId, openPdfViewer } =
    useChatStore()
  const [isOnline, setIsOnline] = useState(false)
  const [convs, setConvs] = useState<ConversationSummary[]>([])
  const [loadingConvId, setLoadingConvId] = useState<string | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ hash: string; name: string } | null>(null)

  // 检测后端
  useEffect(() => {
    const check = () => {
      fetch('/health', { signal: AbortSignal.timeout(3000) })
        .then((r) => setIsOnline(r.ok))
        .catch(() => setIsOnline(false))
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  // 加载对话列表
  const refreshConvList = useCallback(async () => {
    try {
      const data = await listConversations()
      setConvs(data)
    } catch { /* 后端不可用 */ }
  }, [])

  useEffect(() => { refreshConvList() }, [refreshConvList])

  useEffect(() => {
    if (messages.length > 0 && currentConversationId) refreshConvList()
  }, [messages.length, currentConversationId, refreshConvList])

  // 加载文件列表
  const refreshFileList = useCallback(async () => {
    try {
      setFiles(await listFiles())
    } catch { /* 后端不可用 */ }
  }, [])

  useEffect(() => { refreshFileList() }, [refreshFileList])

  const uploadStatus = useChatStore((s) => s.uploadStatus)
  useEffect(() => {
    if (uploadStatus === 'success') refreshFileList()
  }, [uploadStatus, refreshFileList])

  // 加载历史对话
  const handleLoadConv = async (id: string) => {
    setLoadingConvId(id)
    try {
      const detail = await getConversation(id)
      setConversationId(id)
      setMessages(
        detail.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
          sources: (m as any).sources || undefined,
        }))
      )
    } catch { /* 静默处理 */ } finally {
      setLoadingConvId(null)
    }
  }

  const handleNewConv = () => {
    clearMessages()
    refreshConvList()
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id)
      if (currentConversationId === id) clearMessages()
      refreshConvList()
      toast.success('对话已删除')
    } catch { /* ignore */ }
  }

  // 重命名
  const startRename = (id: string, title: string) => {
    setEditingId(id)
    setEditTitle(title)
  }
  const saveRename = async () => {
    if (!editingId) return
    const title = editTitle.trim()
    if (title) {
      try {
        await updateConversation(editingId, { title })
        refreshConvList()
      } catch { /* ignore */ }
    }
    setEditingId(null)
    setEditTitle('')
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    const { hash } = deleteTarget
    setDeleteTarget(null)
    try {
      await deleteFile(hash)
      refreshFileList()
      toast.success('文件已删除')
    } catch { /* ignore */ }
  }

  // 格式化时间
  const fmtTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      <aside
        className={cn(
          'flex h-full flex-col border-r bg-card transition-all duration-300',
          'hidden lg:flex',
          collapsed ? 'lg:w-0 lg:overflow-hidden lg:border-r-0' : 'lg:w-[280px]',
          'lg:relative',
          mobileOpen ? 'fixed inset-y-0 left-0 z-40 flex w-[280px] shadow-2xl' : ''
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2.5 select-none">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm tracking-tight">智能财报分析</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="hidden lg:flex h-7 w-7" onClick={onCollapse} title="收起侧边栏">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {onMobileClose && (
              <Button variant="ghost" size="icon" className="lg:hidden h-7 w-7" onClick={onMobileClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <Separator />

        {/* 新建对话按钮 */}
        <div className="px-3 py-2.5">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-sm font-normal"
            onClick={handleNewConv}
          >
            <Plus className="h-4 w-4" />
            新建对话
          </Button>
        </div>

        <Separator />

        {/* Tab 切换 */}
        <div className="px-3 pt-2.5">
          <div className="flex rounded-md bg-muted p-0.5">
            <button
              className={cn(
                'flex-1 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'chat'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('chat')}
            >
              对话
            </button>
            <button
              className={cn(
                'flex-1 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'files'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('files')}
            >
              知识库
            </button>
          </div>
        </div>

        {/* Tab 内容 */}
        <ScrollArea className="flex-1 px-3 pt-2">
          {activeTab === 'chat' ? (
            <div className="space-y-0.5 pb-2">
              {convs.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  暂无对话历史
                </p>
              ) : (
                convs.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'group relative flex items-center rounded-md transition-colors hover:bg-accent/70',
                      currentConversationId === c.id && 'bg-accent/80'
                    )}
                  >
                    <div
                      className="flex flex-1 items-center gap-2.5 rounded-md pl-3 pr-1 py-2 cursor-pointer min-w-0"
                      onClick={() => handleLoadConv(c.id)}
                    >
                      {loadingConvId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      )}

                      <div className="flex-1 min-w-0">
                        {editingId === c.id ? (
                          <input
                            className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-xs outline-none"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename()
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            onBlur={saveRename}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className="block truncate text-xs select-none leading-tight"
                            title="双击重命名"
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              startRename(c.id, c.title)
                            }}
                          >
                            {c.title}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/70 leading-tight">
                          {fmtTime(c.updated_at)}
                          {c.message_count > 0 && ` · ${c.message_count} 条消息`}
                        </span>
                      </div>
                    </div>

                    {/* Hover 删除按钮 */}
                    <button
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center rounded text-muted-foreground hover:text-danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(c.id)
                      }}
                      title="删除对话"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="py-1">
              <FileUpload />
              {files.length > 0 && (
                <div className="mt-3 space-y-0.5">
                  {files.map((f) => (
                    <div
                      key={f.file_hash}
                      className="group flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-accent/70 cursor-pointer"
                      onClick={() => openPdfViewer(f.file_hash, f.file_name, 1)}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-xs leading-tight">{f.file_name}</div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">
                          {(f.file_size / 1024 / 1024).toFixed(1)} MB
                          {f.upload_time && ` · ${new Date(f.upload_time).toLocaleDateString('zh-CN')}`}
                        </div>
                      </div>
                      <span
                        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center rounded text-muted-foreground hover:text-danger"
                        title="删除此文件"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget({ hash: f.file_hash, name: f.file_name })
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                建议上传「公司名+年份+报告类型.pdf」
                <br />
                系统自动提取年份与公司信息。
              </p>
            </div>
          )}
        </ScrollArea>

        <Separator />

        {/* 连接状态 — 终端风格 */}
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                isOnline ? 'bg-success animate-status-blink' : 'bg-danger'
              )}
            />
            <span className="text-xs text-muted-foreground font-mono">
              {isOnline ? 'Backend OK' : 'Backend Offline'}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground/70 font-mono">
            qwen-max · Milvus 2.4
          </p>
        </div>
      </aside>

      {/* 删除文件确认弹窗 */}
      {deleteTarget != null && (
        <DeleteFileDialog
          fileName={deleteTarget.name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}

/** 删除文件确认弹窗 */
function DeleteFileDialog({
  fileName,
  onConfirm,
  onCancel,
}: {
  fileName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-[340px] rounded-lg bg-card p-6 shadow-xl border mx-4 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-sm mb-1.5">确认删除</h3>
        <p className="text-sm text-muted-foreground mb-1">
          确定要删除「{fileName}」吗？
        </p>
        <p className="text-xs text-muted-foreground mb-5">
          此操作将清除该文件的所有向量数据和原文，不可恢复。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            确认删除
          </Button>
        </div>
      </div>
    </div>
  )
}

/** 桌面端侧边栏展开按钮 */
export function SidebarToggle({ visible, onExpand }: { visible: boolean; onExpand: () => void }) {
  if (!visible) return null
  return (
    <Button
      variant="ghost"
      size="icon"
      className="fixed left-3 top-3 z-50 h-8 w-8 hidden lg:flex bg-card border shadow-sm"
      onClick={onExpand}
      title="展开侧边栏"
    >
      <ChevronRight className="h-4 w-4" />
    </Button>
  )
}

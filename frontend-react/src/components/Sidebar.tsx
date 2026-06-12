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
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const [editTitle, setEditTitle] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<{ hash: string; name: string } | null>(null)

  // 检测后端 — 轻量 HEAD 请求，不触发 Agent
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
    } catch {
      // 后端不可用
    }
  }, [])

  useEffect(() => {
    refreshConvList()
  }, [refreshConvList])

  // 有新消息或切换对话后刷新列表
  useEffect(() => {
    if (messages.length > 0 && currentConversationId) {
      refreshConvList()
    }
  }, [messages.length, currentConversationId, refreshConvList])

  // 加载已入库文件列表
  const refreshFileList = useCallback(async () => {
    try {
      const data = await listFiles()
      setFiles(data)
    } catch {
      // 后端不可用
    }
  }, [])

  useEffect(() => {
    refreshFileList()
  }, [refreshFileList])

  // 上传完成后自动刷新文件列表
  const uploadStatus = useChatStore((s) => s.uploadStatus)
  useEffect(() => {
    if (uploadStatus === 'success') {
      refreshFileList()
    }
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
    } catch {
      // 加载失败静默处理
    } finally {
      setLoadingConvId(null)
    }
  }

  // 新对话
  const handleNewConv = () => {
    clearMessages()
    refreshConvList()
  }

  // 删除对话
  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id)
      if (currentConversationId === id) {
        clearMessages()
      }
      refreshConvList()
    } catch {
      // ignore
    }
  }

  // 确认删除文件
  // 对话重命名
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
    setEditTitle("")
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    const { hash } = deleteTarget
    setDeleteTarget(null)
    try {
      await deleteFile(hash)
      refreshFileList()
    } catch {
      // ignore
    }
  }

  const convTitle =
    messages.length > 0
      ? messages.find((m) => m.role === 'user')?.content.slice(0, 30) || '新对话'
      : '新对话'

  return (
    <>
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-card transition-all duration-300',
        // 桌面端：常驻侧边栏，可折叠
        'hidden lg:flex',
        collapsed ? 'lg:w-0 lg:overflow-hidden lg:border-r-0' : 'lg:w-80',
        // 移动端：fixed 浮层，从左滑入
        'lg:relative',
        mobileOpen ? 'fixed inset-y-0 left-0 z-40 flex w-80 shadow-2xl' : ''
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">智能财报分析</span>
        </div>
        {/* 桌面端：折叠按钮 */}
        <Button variant="ghost" size="icon" className="hidden lg:flex h-7 w-7" onClick={onCollapse}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {/* 移动端：关闭按钮 */}
        {onMobileClose && (
          <Button variant="ghost" size="icon" className="lg:hidden h-7 w-7" onClick={onMobileClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Separator />

      {/* 新建对话 */}
      <div className="px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-sm"
          onClick={handleNewConv}
        >
          <Plus className="h-4 w-4" />
          新建对话
        </Button>
      </div>

      {/* 对话历史列表 */}
      <ScrollArea className="flex-1 px-3">
        {convs.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">暂无对话历史</p>
        ) : (
          <div className="space-y-1 pb-2">
            {convs.map((c) => (
              <div
                key={c.id}
                className="group relative flex items-center rounded-md transition-colors hover:bg-accent"
              >
                <div
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-md pl-3 py-2 cursor-pointer min-w-0',
                    currentConversationId === c.id && 'bg-accent'
                  )}
                  onClick={() => handleLoadConv(c.id)}
                >
                  {loadingConvId === c.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {editingId === c.id ? (
                    <input
                      className="flex-1 min-w-0 rounded border border-primary bg-background px-1 py-0.5 text-xs outline-none"
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
                      className="truncate text-xs flex-1 select-none"
                      title="双击重命名"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startRename(c.id, c.title)
                      }}
                    >
                      {c.title}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      {/* Tab 切换：当前对话 / 知识库 */}
      <div className="mt-1 px-3">
          <div className="flex rounded-md bg-muted p-0.5">
            <button
              className={cn(
                'flex-1 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'chat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('chat')}
            >
              💬 对话
            </button>
            <button
              className={cn(
                'flex-1 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'files' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('files')}
            >
              📚 知识库
            </button>
          </div>
        </div>

      {/* Tab 内容 */}
      {activeTab === 'chat' ? (
        <>
          {/* 当前对话 */}
          {currentConversationId && (
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 rounded-md bg-accent/50 px-3 py-2">
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs">{convTitle}</span>
                <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(currentConversationId)} title="删除此对话">
                  <Trash2 className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={handleNewConv} title="新建对话">
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            </div>
          )}
          {!currentConversationId && messages.length > 0 && (
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 rounded-md bg-accent/50 px-3 py-2">
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs">{convTitle}</span>
                <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0"
                  onClick={handleNewConv}>
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="px-3 py-3">
          <FileUpload />
          {files.length > 0 && (
            <div className="mt-3 space-y-1 max-h-40 overflow-auto">
              {files.map((f) => (
                <div key={f.file_hash}
                  className="group flex items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent cursor-pointer"
                  onClick={() => openPdfViewer(f.file_hash, f.file_name, 1)}>
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{f.file_name}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {f.file_size > 0 ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB` : ''}
                      {f.file_size > 0 && f.upload_time ? ' · ' : ''}
                      {f.upload_time ? new Date(f.upload_time).toLocaleDateString('zh-CN') : ''}
                    </div>
                  </div>
                  <span className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
                    title="删除此文件"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget({ hash: f.file_hash, name: f.file_name }) }}>
                    <Trash2 className="h-3 w-3" />
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            建议上传「公司名+年份+报告类型.pdf」格式，系统自动提取年份与公司信息。
          </p>
        </div>
      )}

      <Separator />

      {/* 连接状态 */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('h-2 w-2 rounded-full', isOnline ? 'bg-emerald-500' : 'bg-red-400')} />
          <span className="text-muted-foreground">{isOnline ? '后端已连接' : '后端未连接'}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Model: qwen-max · Milvus 2.4</p>
      </div>
    </aside>

      {/* 删除文件确认弹窗 */}
      {deleteTarget != null && (
        <DeleteFileDialog
          fileName={deleteTarget!.name}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-80 rounded-xl bg-background p-6 shadow-xl border mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-2">⚠️ 确认删除</h3>
        <p className="text-sm text-muted-foreground mb-2">
          确定要删除「{fileName}」吗？
        </p>
        <p className="text-xs text-muted-foreground mb-4">
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

/** 侧边栏展开按钮（桌面端，折叠后显示） */
export function SidebarToggle({ visible, onExpand }: { visible: boolean; onExpand: () => void }) {
  if (!visible) return null
  return (
    <Button
      variant="ghost"
      size="icon"
      className="fixed left-3 top-3 z-50 h-8 w-8 hidden lg:flex"
      onClick={onExpand}
    >
      <ChevronRight className="h-4 w-4" />
    </Button>
  )
}

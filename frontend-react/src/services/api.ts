import type { ChatStreamCallbacks, UploadResponse } from '@/types'

const API_BASE = '/api/v1'
// 构建时从环境变量注入，回退值为本地开发默认值
const API_KEY = import.meta.env.VITE_API_KEY || 'finance-rag-dev-key'

export function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${API_KEY}` }
}

/**
 * SSE 流式发送聊天消息。
 * 后端 API: POST /api/v1/chat/stream
 *
 * SSE 事件格式 (v2 结构化协议):
 * - data: {"type": "chunk", "content": "文本"}    → LLM 输出的文本块
 * - data: {"type": "tool_start", "tool": "..."}   → Agent 开始调用工具
 * - data: {"type": "tool_end",   "tool": "..."}   → Agent 工具调用完成
 * - data: {"type": "sources", "sources": [...]}   → 检索工具返回的引用来源
 * - data: {"type": "error", "message": "..."}     → 服务端错误
 * - data: [DONE]                                   → 流结束
 */

export async function sendChatMessage(
  query: string,
  history: { role: string; content: string }[],
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ query, history }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status} ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('浏览器不支持 ReadableStream')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''

      for (const event of events) {
        const lines = event.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const dataStr = line.slice(6)

          if (dataStr === '[DONE]') {
            callbacks.onDone()
            return
          }

          try {
            const data = JSON.parse(dataStr)

            switch (data.type) {
              case 'chunk':
                callbacks.onChunk(data.content)
                break
              case 'tool_start':
                callbacks.onToolStart(data.tool)
                break
              case 'tool_end':
                callbacks.onToolEnd(data.tool)
                break
              case 'sources':
                callbacks.onSources(data.sources ?? [])
                break
              case 'error':
                callbacks.onError(new Error(data.message))
                break
            }
          } catch {
            // 非 JSON 行，忽略
          }
        }
      }
    }
    callbacks.onDone()
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      callbacks.onDone()
      return
    }
    callbacks.onError(err as Error)
  } finally {
    reader.releaseLock()
  }
}

/**
 * 上传 PDF 文件到知识库。
 * 后端 API: POST /api/v1/upload
 */
export async function uploadPDF(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: authHeader(),
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || '上传失败')
  }

  return response.json()
}

// ==========================================
// 对话历史 CRUD
// ==========================================

export interface ConversationSummary {
  id: string
  title: string
  message_count: number
  updated_at: string
}

export interface ConversationDetail {
  id: string
  title: string
  messages: { id: string; role: string; content: string; timestamp: number }[]
  updated_at: string
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${API_BASE}/conversations?limit=50`, { headers: authHeader() })
  if (!res.ok) throw new Error('获取对话列表失败')
  const data = await res.json()
  return data.items ?? data  // 兼容新旧格式
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, { headers: authHeader() })
  if (!res.ok) throw new Error('对话不存在')
  return res.json()
}

export async function saveConversation(
  title: string,
  messages: { id: string; role: string; content: string; timestamp: number }[]
): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ title, messages }),
  })
  if (!res.ok) throw new Error('保存失败')
  return res.json()
}

export async function updateConversation(
  id: string,
  data: { title?: string; messages?: { id: string; role: string; content: string; timestamp: number }[] }
): Promise<void> {
  await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(data),
  })
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE', headers: authHeader() })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`删除失败: ${res.status} ${msg}`)
  }
}

// ==========================================
// 入库进度查询
// ==========================================

export interface TaskProgress {
  task_id: string
  filename: string
  status: 'pending' | 'running' | 'success' | 'error'
  step: string
  progress_pct: number
  error?: string
}

export async function getUploadProgress(taskId: string): Promise<TaskProgress> {
  const res = await fetch(`${API_BASE}/upload/progress/${taskId}`, { headers: authHeader() })
  if (!res.ok) throw new Error('获取进度失败')
  return res.json()
}

// ==========================================
// 文件列表 & PDF 原文查看
// ==========================================

export interface FileInfo {
  file_hash: string
  file_name: string
  upload_time: string
  file_size: number
}

export async function listFiles(): Promise<FileInfo[]> {
  const res = await fetch(`${API_BASE}/files`, { headers: authHeader() })
  if (!res.ok) throw new Error('获取文件列表失败')
  return res.json()
}

/** 删除已入库的 PDF 文件及其全部关联数据 */
export async function deleteFile(fileHash: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/files/${fileHash}`, { method: 'DELETE', headers: authHeader() })
  if (!res.ok) throw new Error('删除失败')
  return res.json()
}

/** 返回 PDF 原文查看的完整 URL（可直接作为 <iframe> src 或链接） */
export function getFileViewUrl(fileHash: string): string {
  return `${API_BASE}/files/${fileHash}/view`
}

/** 自动生成对话标题（qwen-turbo 低成本模型） */
export async function autoTitle(convId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/conversations/${convId}/auto-title`, {
      method: 'POST',
      headers: authHeader(),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.title || null
  } catch {
    return null
  }
}

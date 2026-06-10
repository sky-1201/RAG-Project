import { create } from 'zustand'
import { sendChatMessage, saveConversation, updateConversation, autoTitle } from '@/services/api'
import type { Message, UploadStatus, SourceInfo } from '@/types'

interface ChatState {
  messages: Message[]
  isLoading: boolean
  currentTool: string | null
  abortController: AbortController | null
  currentConversationId: string | null

  // Upload state
  uploadStatus: UploadStatus
  lastUploadFilename: string | null

  // PDF viewer state
  pdfViewer: { isOpen: boolean; fileHash: string; fileName: string; pageNumber: number; snippet: string }
  openPdfViewer: (fileHash: string, fileName: string, pageNumber: number, snippet?: string) => void
  closePdfViewer: () => void

  // Actions
  sendMessage: (query: string) => Promise<void>
  stopGeneration: () => void
  clearMessages: () => void
  setMessages: (msgs: Message[]) => void
  setConversationId: (id: string | null) => void
  persistConversation: () => Promise<void>
  setUploadStatus: (status: UploadStatus, filename?: string) => void
}

/** 生成 UUID v4（兼容非 HTTPS 环境，crypto.randomUUID 仅 secure context 可用） */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function createMessage(role: 'user' | 'assistant', content = ''): Message {
  return {
    id: uuidv4(),
    role,
    content,
    timestamp: Date.now(),
  }
}

function getTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return '新对话'
  return firstUser.content.slice(0, 50)
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  currentTool: null,
  abortController: null,
  currentConversationId: null,
  uploadStatus: 'idle',
  lastUploadFilename: null,
  pdfViewer: { isOpen: false, fileHash: '', fileName: '', pageNumber: 1, snippet: '' },

  openPdfViewer: (fileHash, fileName, pageNumber, snippet = '') =>
    set({ pdfViewer: { isOpen: true, fileHash, fileName, pageNumber, snippet } }),

  closePdfViewer: () =>
    set({ pdfViewer: { isOpen: false, fileHash: '', fileName: '', pageNumber: 1, snippet: '' } }),

  sendMessage: async (query: string) => {
    const { messages, abortController: oldAbort } = get()

    if (oldAbort) oldAbort.abort()

    const abortController = new AbortController()
    const userMsg = createMessage('user', query)
    const assistantMsg = createMessage('assistant', '')

    set({
      messages: [...messages, userMsg, assistantMsg],
      isLoading: true,
      currentTool: null,
      abortController,
    })

    // 取最后 10 条作为历史上下文（不含当前正在拼的 user + assistant）
    const history = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }))

    await sendChatMessage(
      query,
      history,
      {
        onChunk: (chunk: string) => {
          const { messages: current } = get()
          const updated = [...current]
          const lastIdx = updated.length - 1
          if (updated[lastIdx]?.role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + chunk,
            }
            set({ messages: updated })
          }
        },

        onToolStart: (tool: string) => set({ currentTool: tool }),

        onToolEnd: (_tool: string) => {
          setTimeout(() => {
            set((state) =>
              state.currentTool === _tool ? { currentTool: null } : {}
            )
          }, 400)
        },

        onSources: (sources: SourceInfo[]) => {
          // 把引用来源绑定到当前 assistant 消息上
          const { messages: current } = get()
          const updated = [...current]
          const lastIdx = updated.length - 1
          if (updated[lastIdx]?.role === 'assistant') {
            updated[lastIdx] = { ...updated[lastIdx], sources }
            set({ messages: updated })
          }
        },

        onDone: () => {
          setTimeout(() => {
            set({ isLoading: false, currentTool: null, abortController: null })
            // 回答完成后自动保存
            get().persistConversation()
          }, 300)
        },

        onError: (error: Error) => {
          const { messages: current } = get()
          const updated = [...current]
          const lastIdx = updated.length - 1
          if (updated[lastIdx]?.role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content:
                updated[lastIdx].content +
                `\n\n> ⚠️ **系统提示**: ${error.message}`,
            }
          }
          set({
            messages: updated,
            isLoading: false,
            currentTool: null,
            abortController: null,
          })
        },
      },
      abortController.signal
    )
  },

  stopGeneration: () => {
    const { abortController } = get()
    if (abortController) {
      abortController.abort()
      set({ isLoading: false, currentTool: null, abortController: null })
    }
  },

  clearMessages: () => {
    set({
      messages: [],
      isLoading: false,
      currentTool: null,
      currentConversationId: null,
    })
  },

  setMessages: (msgs: Message[]) => set({ messages: msgs }),
  setConversationId: (id: string | null) => set({ currentConversationId: id }),

  persistConversation: async () => {
    const { messages, currentConversationId } = get()
    if (messages.length === 0) return

    const title = getTitle(messages)
    const isFirstExchange = !currentConversationId

    try {
      if (currentConversationId) {
        await updateConversation(currentConversationId, { title, messages })
      } else {
        const result = await saveConversation(title, messages)
        set({ currentConversationId: result.id })
      }

      // 新对话的首轮问答结束后，用 qwen-turbo 自动生成简短标题
      if (isFirstExchange) {
        const id = currentConversationId || get().currentConversationId
        if (id) {
          autoTitle(id).catch(() => {})
        }
      }
    } catch {
      // 静默失败，不影响聊天体验
      console.warn('对话保存失败')
    }
  },

  setUploadStatus: (status: UploadStatus, filename?: string) => {
    set({
      uploadStatus: status,
      lastUploadFilename: filename ?? get().lastUploadFilename,
    })
  },
}))

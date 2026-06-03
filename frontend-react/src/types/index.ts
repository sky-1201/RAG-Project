export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ChatStreamCallbacks {
  /** LLM 输出的文本块 */
  onChunk: (content: string) => void
  /** Agent 开始调用工具，tool 为 "financial_retriever_tool" | "python_repl_tool" */
  onToolStart: (tool: string) => void
  /** Agent 工具调用完成 */
  onToolEnd: (tool: string) => void
  /** 流正常结束 */
  onDone: () => void
  /** 流异常 */
  onError: (error: Error) => void
}

export interface UploadResponse {
  message: string
  filename: string
  task_id?: string
}

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

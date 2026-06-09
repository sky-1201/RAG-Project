export interface SourceInfo {
  file: string
  score: string
  /** 命中文字所在的 PDF 页码 */
  page_number?: number
  /** 文件的 MD5 hash，用于 PDF 查看 API */
  file_hash?: string
  /** 命中片段的原文预览（前 200 字） */
  snippet?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** 检索引用的文件来源（仅 assistant 消息有值） */
  sources?: SourceInfo[]
}

export interface ChatStreamCallbacks {
  /** LLM 输出的文本块 */
  onChunk: (content: string) => void
  /** Agent 开始调用工具，tool 为 "financial_retriever_tool" | "python_repl_tool" */
  onToolStart: (tool: string) => void
  /** Agent 工具调用完成 */
  onToolEnd: (tool: string) => void
  /** 检索工具返回的引用来源 */
  onSources: (sources: SourceInfo[]) => void
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

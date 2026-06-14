export interface SourceInfo {
  file: string
  score: string
  page_number?: number
  file_hash?: string
  snippet?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sources?: SourceInfo[]
}

export interface ChatStreamCallbacks {
  onChunk: (content: string) => void
  onToolStart: (tool: string) => void
  onToolEnd: (tool: string) => void
  onSources: (sources: SourceInfo[]) => void
  onDone: () => void
  onError: (error: Error) => void
}

export interface UploadResponse {
  message: string
  filename: string
  task_id?: string
}

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

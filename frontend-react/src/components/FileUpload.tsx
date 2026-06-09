import { useState, useEffect, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { uploadPDF, getUploadProgress } from '@/services/api'
import { useChatStore } from '@/store/chatStore'
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function FileUpload() {
  const { uploadStatus, setUploadStatus, lastUploadFilename } = useChatStore()
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [progress, setProgress] = useState({ step: '', pct: 0 })

  // 轮询入库进度
  useEffect(() => {
    if (!taskId || uploadStatus !== 'uploading') return
    const interval = setInterval(async () => {
      try {
        const p = await getUploadProgress(taskId)
        setProgress({ step: p.step, pct: p.progress_pct })
        if (p.status === 'success') {
          setUploadStatus('success', p.filename)
          toast.success('入库完成！', { description: '文件已成功解析入库，现在可以提问了。' })
          setTaskId(null)
        } else if (p.status === 'error') {
          setUploadStatus('error')
          toast.error('入库失败', { description: p.error || '未知错误' })
          setTaskId(null)
        }
      } catch {
        // 后端暂时不可用，继续轮询
      }
    }, 1500)
    return () => clearInterval(interval)
  }, [taskId, uploadStatus, setUploadStatus])

  const handleUpload = useCallback(async () => {
    if (!selectedFile || uploadStatus === 'uploading') return

    setUploadStatus('uploading')
    setProgress({ step: '正在上传...', pct: 0 })

    try {
      const result = await uploadPDF(selectedFile)
      if (result.task_id) {
        setTaskId(result.task_id)
        setProgress({ step: '上传完成，等待处理...', pct: 5 })
      } else {
        setUploadStatus('success', result.filename)
        toast.success('上传成功！')
      }
      setSelectedFile(null)
    } catch (err) {
      setUploadStatus('error')
      toast.error('上传失败', {
        description: (err as Error).message || '请检查后端是否已启动',
      })
    }
  }, [selectedFile, uploadStatus, setUploadStatus])

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.pdf')) {
        toast.warning('仅支持 PDF 文件')
        return
      }
      setSelectedFile(file)
      setUploadStatus('idle')
      setTaskId(null)
      setProgress({ step: '', pct: 0 })
    },
    [setUploadStatus]
  )

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFileSelect(file)
    },
    [handleFileSelect]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFileSelect(file)
      // 重置 input 值，否则选择同一个文件不会触发 onChange
      e.target.value = ''
    },
    [handleFileSelect]
  )

  return (
    <div className="space-y-3">
      {/* 拖拽/点击上传区域 */}
      <Card
        className={cn(
          'cursor-pointer transition-colors',
          isDragOver && 'border-primary bg-primary/5'
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById('pdf-upload-input')?.click()}
      >
        <CardContent className="flex flex-col items-center gap-2 px-4 py-6">
          {uploadStatus === 'uploading' ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">{progress.step || '处理中...'}</p>
              {/* 进度条 */}
              {progress.pct > 0 && (
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">上传 PDF 财报</p>
              <p className="text-xs text-muted-foreground">
                拖拽文件到此处或点击选择
              </p>
            </>
          )}
          <input
            id="pdf-upload-input"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleInputChange}
          />
        </CardContent>
      </Card>

      {/* 已选文件信息 */}
      {selectedFile && (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="flex-1 truncate text-sm">{selectedFile.name}</span>
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleUpload()
            }}
            disabled={uploadStatus === 'uploading'}
          >
            开始入库
          </Button>
        </div>
      )}

      {/* 上次上传成功提示 */}
      {uploadStatus === 'success' && !selectedFile && lastUploadFilename && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{lastUploadFilename} 已入库</span>
        </div>
      )}

      {/* 上传失败提示 */}
      {uploadStatus === 'error' && !selectedFile && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>入库失败，请检查后端日志后重试</span>
        </div>
      )}
    </div>
  )
}

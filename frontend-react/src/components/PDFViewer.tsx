import { useEffect, useMemo, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useChatStore } from '@/store/chatStore'
import { getFileViewUrl, authHeader } from '@/services/api'
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// 从本地 node_modules 加载 pdfjs worker，避免国内 CDN 不可达
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export function PDFViewer() {
  const pdfViewer = useChatStore((s) => s.pdfViewer)
  const closePdfViewer = useChatStore((s) => s.closePdfViewer)

  const [numPages, setNumPages] = useState(0)
  const [pageNumber, setPageNumber] = useState(pdfViewer.pageNumber || 1)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [loading, setLoading] = useState(false)

  // 每次打开切换文件时，带鉴权请求 PDF 数据
  useEffect(() => {
    if (!pdfViewer.isOpen || !pdfViewer.fileHash) return
    setLoading(true)
    setPdfData(null)
    fetch(getFileViewUrl(pdfViewer.fileHash), { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error(`PDF 加载失败: ${res.status}`)
        return res.arrayBuffer()
      })
      .then((buf) => setPdfData(new Uint8Array(buf)))
      .catch((err) => {
        console.error('PDF 加载失败:', err)
        setPdfData(null)
      })
      .finally(() => setLoading(false))
  }, [pdfViewer.isOpen, pdfViewer.fileHash])

  useEffect(() => {
    setPageNumber(pdfViewer.pageNumber || 1)
  }, [pdfViewer.pageNumber])

  // 缓存文件对象，避免每次渲染创建新引用导致 ArrayBuffer 被重复 detach
  const fileObj = useMemo(() => {
    return pdfData ? { data: pdfData } : null
  }, [pdfData])

  if (!pdfViewer.isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closePdfViewer}>
      <div
        className="relative flex h-[90vh] w-[70vw] flex-col rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <h2 className="text-sm font-semibold truncate pr-4">{pdfViewer.fileName}</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closePdfViewer}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* PDF 页面 */}
        <div className="flex-1 overflow-auto bg-muted/30 flex justify-center">
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {fileObj && (
            <Document
              file={fileObj}
              key={pdfViewer.fileHash}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              className="py-4"
            >
              <Page
                pageNumber={pageNumber}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                width={Math.min(window.innerWidth * 0.65, 900)}
              />
            </Document>
          )}
          {!loading && !fileObj && (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              PDF 加载失败，请检查文件是否存在。
            </div>
          )}
        </div>

        {/* 底部翻页 */}
        <div className="flex items-center justify-center gap-4 border-t px-4 py-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一页
          </Button>
          <span className="text-xs text-muted-foreground min-w-[80px] text-center">
            {pageNumber} / {numPages || '—'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageNumber((p) => Math.min(numPages || p, p + 1))}
            disabled={pageNumber >= numPages}
          >
            下一页
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  )
}

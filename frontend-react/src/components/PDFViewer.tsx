import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useChatStore } from '@/store/chatStore'
import { getFileViewUrl, authHeader } from '@/services/api'
import { X, Loader2 } from 'lucide-react'
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
  const [currentPage, setCurrentPage] = useState(pdfViewer.pageNumber || 1)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [loading, setLoading] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const lastScrolledPage = useRef(0)

  // 每次打开切换文件时，带鉴权请求 PDF 数据
  useEffect(() => {
    if (!pdfViewer.isOpen || !pdfViewer.fileHash) return
    setLoading(true)
    setPdfData(null)
    setNumPages(0)
    lastScrolledPage.current = 0
    pageRefs.current.clear()
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

  // 记录每页 DOM 的 ref
  const setPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(pageNum, el)
    }
  }, [])

  // 当目标页码或页面总数就绪后，滚动到目标页
  useEffect(() => {
    const targetPage = pdfViewer.pageNumber || 1
    if (numPages === 0 || lastScrolledPage.current === targetPage) return
    // 等待所有页面的 ref 注册完毕
    const tryScroll = () => {
      const el = pageRefs.current.get(targetPage)
      if (el) {
        lastScrolledPage.current = targetPage
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (pageRefs.current.size < numPages) {
        // 页面还在渲染中，稍后重试
        setTimeout(tryScroll, 150)
      }
    }
    // 给 react-pdf 一点时间渲染首屏
    const timer = setTimeout(tryScroll, 200)
    return () => clearTimeout(timer)
  }, [numPages, pdfViewer.pageNumber])

  // 滚动时检测当前可见页码
  const handleScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const containerTop = container.scrollTop
    const containerHeight = container.clientHeight
    const containerCenter = containerTop + containerHeight / 3  // 上 1/3 处算"当前页"

    let closestPage = 1
    let closestDist = Infinity
    pageRefs.current.forEach((el, page) => {
      const dist = Math.abs(el.offsetTop - containerCenter)
      if (dist < closestDist) {
        closestDist = dist
        closestPage = page
      }
    })
    setCurrentPage(closestPage)
  }, [])

  // 缓存文件对象，避免每次渲染创建新引用
  const fileObj = useMemo(() => {
    return pdfData ? { data: pdfData } : null
  }, [pdfData])

  if (!pdfViewer.isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closePdfViewer}>
      <div
        className="relative flex h-[90vh] w-[70vw] lg:w-[70vw] max-sm:h-screen max-sm:w-screen max-sm:rounded-none flex-col rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <h2 className="text-sm font-semibold truncate pr-4">
            {pdfViewer.fileName}
            {numPages > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                第 {currentPage} / {numPages} 页
              </span>
            )}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closePdfViewer}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* PDF 全页滚动区域 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto bg-muted/30"
          onScroll={handleScroll}
        >
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {fileObj && (
            <Document
              file={fileObj}
              key={pdfViewer.fileHash}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              className="flex flex-col items-center py-4 gap-4"
            >
              {Array.from({ length: numPages }, (_, i) => {
                const pageNum = i + 1
                const isHighlighted = pdfViewer.snippet && pageNum === pdfViewer.pageNumber
                return (
                <div
                  key={pageNum}
                  ref={(el) => setPageRef(pageNum, el)}
                  className="shadow-md bg-white relative"
                >
                  {isHighlighted && (
                    <div className="mx-auto mb-2 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-sm"
                         style={{ width: Math.min(window.innerWidth * (window.innerWidth < 1024 ? 0.95 : 0.65), 900) }}>
                      <div className="flex items-start gap-2">
                        <span className="text-amber-600 text-sm shrink-0 mt-0.5">🔍</span>
                        <div>
                          <div className="text-xs font-semibold text-amber-700 mb-1">命中内容</div>
                          <div className="text-xs text-amber-800 leading-relaxed line-clamp-4">
                            {pdfViewer.snippet}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <Page
                    pageNumber={pageNum}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    width={Math.min(window.innerWidth * (window.innerWidth < 1024 ? 0.95 : 0.65), 900)}
                  />
                </div>
                )
              })}
            </Document>
          )}
          {!loading && !fileObj && (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              PDF 加载失败，请检查文件是否存在。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

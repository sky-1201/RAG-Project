import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useChatStore } from '@/store/chatStore'
import { getFileViewUrl, authHeader } from '@/services/api'
import { X, Loader2, ChevronUp, ChevronDown, PanelRightClose } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/**
 * PDF 原文查看器 — 右侧滑入面板
 * 桌面端 50% 宽，移动端全屏
 * 保持聊天区可见，支持边看原文边对话
 */
export function PDFViewer() {
  const pdfViewer = useChatStore((s) => s.pdfViewer)
  const closePdfViewer = useChatStore((s) => s.closePdfViewer)

  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(pdfViewer.pageNumber || 1)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [loading, setLoading] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const lastScrolledPage = useRef(0)
  const [containerWidth, setContainerWidth] = useState(0)

  // 测量面板容器宽度，以此计算 PDF 页面渲染尺寸
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // 减去面板内部 padding (px-4 * 2 = 32px) + 滚动条预留
        setContainerWidth(entry.contentRect.width - 40)
      }
    })
    observer.observe(panel)
    return () => observer.disconnect()
  }, [pdfViewer.isOpen])

  // 加载 PDF 文件
  useEffect(() => {
    if (!pdfViewer.isOpen || !pdfViewer.fileHash) return
    setLoading(true)
    setPdfData(null)
    setNumPages(0)
    setIsClosing(false)
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

  const setPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNum, el)
  }, [])

  // 以容器实际宽度计算 PDF 页面尺寸，上限 840px
  const pageWidth = containerWidth > 0
    ? Math.min(containerWidth, 840)
    : Math.min(window.innerWidth * (window.innerWidth < 1024 ? 0.92 : 0.46), 840)

  // 滚动到目标页（有高亮片段时）
  useEffect(() => {
    const targetPage = pdfViewer.pageNumber || 1
    if (numPages === 0 || lastScrolledPage.current === targetPage) return
    const container = scrollRef.current
    if (!container) return
    lastScrolledPage.current = targetPage

    const estHeight = pageWidth * 1.414 + 32
    container.scrollTo({ top: (targetPage - 1) * estHeight, behavior: 'instant' as ScrollBehavior })

    const tryAlign = () => {
      const el = pageRefs.current.get(targetPage)
      if (el && el.getBoundingClientRect().height > 150) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        setTimeout(tryAlign, 200)
      }
    }
    setTimeout(tryAlign, 400)
  }, [numPages, pdfViewer.pageNumber, pageWidth])

  // 滚动检测当前页码
  const handleScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const containerCenter = container.scrollTop + container.clientHeight / 3
    let closestPage = 1,
      closestDist = Infinity
    pageRefs.current.forEach((el, page) => {
      const dist = Math.abs(el.offsetTop - containerCenter)
      if (dist < closestDist) {
        closestDist = dist
        closestPage = page
      }
    })
    setCurrentPage(closestPage)
  }, [])

  const fileObj = useMemo(() => (pdfData ? { data: pdfData } : null), [pdfData])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      closePdfViewer()
      setIsClosing(false)
    }, 200)
  }

  if (!pdfViewer.isOpen && !isClosing) return null

  return (
    <>
      {/* 遮罩层 — 轻量半透明 */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/20 backdrop-blur-sm',
          'transition-opacity duration-200',
          isClosing ? 'opacity-0' : 'opacity-100'
        )}
        onClick={handleClose}
      />

      {/* 面板 */}
      <div
        ref={panelRef}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col bg-card shadow-2xl border-l',
          'w-full lg:w-[50vw] xl:w-[44vw] max-w-[720px]',
          'transition-transform duration-300 ease-out',
          isClosing ? 'translate-x-full' : 'translate-x-0'
        )}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <h2 className="text-sm font-semibold truncate pr-4 flex-1 min-w-0">
            {pdfViewer.fileName}
            {numPages > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground font-mono">
                {currentPage} / {numPages}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClose}
              title="关闭面板"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClose}
              title="关闭"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF 内容区 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto bg-muted/20"
          onScroll={handleScroll}
        >
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                const isMobile = window.innerWidth < 640
                const inRange =
                  !isMobile || isHighlighted || Math.abs(pageNum - currentPage) <= 2

                if (!inRange) {
                  return (
                    <div key={pageNum}>
                      <div
                        ref={(el) => setPageRef(pageNum, el)}
                        style={{ width: pageWidth, height: pageWidth * 1.414 }}
                      />
                    </div>
                  )
                }

                const nearViewport = Math.abs(pageNum - currentPage) <= 3

                return (
                  <div key={pageNum}>
                    {/* 高亮标注卡片 — 荧光笔风格 */}
                    {isHighlighted && (
                      <div
                        className="mx-auto mb-2 rounded-md border-2 border-highlighter-border bg-highlighter-light px-4 py-3 shadow-sm"
                        style={{ width: pageWidth }}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-highlighter text-sm shrink-0 mt-0.5">🔍</span>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-highlighter-fg mb-1">
                              命中内容
                            </div>
                            <div className="text-xs text-highlighter-fg/80 leading-relaxed line-clamp-5">
                              {pdfViewer.snippet}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div
                      ref={(el) => setPageRef(pageNum, el)}
                      className="shadow-md bg-white"
                    >
                      <Page
                        pageNumber={pageNum}
                        renderTextLayer={nearViewport}
                        renderAnnotationLayer={nearViewport}
                        width={pageWidth}
                      />
                    </div>
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

        {/* 底部导航条 */}
        {numPages > 1 && (
          <div className="flex items-center justify-center gap-3 border-t px-4 py-2 shrink-0 bg-card">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage <= 1}
              onClick={() => {
                const newPage = currentPage - 1
                setCurrentPage(newPage)
                const el = pageRefs.current.get(newPage)
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>

            <span className="text-xs text-muted-foreground font-mono min-w-[60px] text-center">
              {currentPage} / {numPages}
            </span>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={currentPage >= numPages}
              onClick={() => {
                const newPage = currentPage + 1
                setCurrentPage(newPage)
                const el = pageRefs.current.get(newPage)
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>

            {/* 输入页码跳转 */}
            <form
              className="flex items-center gap-1 ml-2"
              onSubmit={(e) => {
                e.preventDefault()
                const input = (e.target as HTMLFormElement).querySelector('input')
                if (!input) return
                const p = parseInt(input.value, 10)
                if (p >= 1 && p <= numPages) {
                  // 重置 lastScrolledPage 以触发 scroll-to-page effect（移动端懒渲染时目标页可能未挂载，需走两步定位流程）
                  lastScrolledPage.current = 0
                  setCurrentPage(p)
                  input.value = ''
                }
              }}
            >
              <input
                type="number"
                min={1}
                max={numPages}
                placeholder="#"
                className="w-10 h-6 rounded border border-input bg-background text-center text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </form>
          </div>
        )}
      </div>
    </>
  )
}

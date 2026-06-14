import { useState } from 'react'
import { Sidebar, SidebarToggle } from '@/components/Sidebar'
import { ChatArea } from '@/components/ChatArea'
import { PDFViewer } from '@/components/PDFViewer'
import { Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 桌面端：侧边栏折叠后的展开按钮 */}
      <SidebarToggle visible={sidebarCollapsed} onExpand={() => setSidebarCollapsed(false)} />

      {/* 移动端：汉堡菜单按钮 */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-3 top-3 z-20 h-9 w-9 lg:hidden bg-card/80 backdrop-blur-sm border shadow-sm"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* 移动端：侧边栏遮罩 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden animate-in fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(true)}
      />

      {/* 主聊天区 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatArea />
      </main>

      {/* PDF 原文查看器 — 右侧滑入面板 */}
      <PDFViewer />

      {/* Toast 通知 */}
      <Toaster
        position="top-center"
        richColors
        closeButton
        duration={4000}
      />
    </div>
  )
}

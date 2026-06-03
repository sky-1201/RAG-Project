import { Sidebar, SidebarToggle } from '@/components/Sidebar'
import { ChatArea } from '@/components/ChatArea'
import { Toaster } from 'sonner'

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 侧边栏折叠时的展开按钮 */}
      <SidebarToggle />

      {/* 侧边栏 */}
      <Sidebar />

      {/* 主聊天区 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatArea />
      </main>

      {/* Toast 通知 (文件上传反馈) */}
      <Toaster
        position="top-center"
        richColors
        closeButton
      />
    </div>
  )
}

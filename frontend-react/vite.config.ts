import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',  // Docker 容器内需要监听所有网卡，否则外部无法访问
    // Windows Docker 挂载不传递 inotify 文件事件，必须用轮询模式检测文件变化
    watch: { usePolling: true },
    proxy: {
      '/api': {
        // Docker 模式通过 BACKEND_URL 环境变量指向后端容器名
        target: process.env.BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

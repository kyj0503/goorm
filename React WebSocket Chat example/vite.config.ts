import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window'
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080', // 백엔드 API 서버 주소
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: 'http://localhost:8080', // 백엔드 WebSocket 서버 주소
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
})

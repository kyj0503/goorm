import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window'
  },
  base: '/simple-chat/',
  server: {
    proxy: {
      '/api': {
        target: 'http://3.37.229.220:8080',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'http://3.37.229.220:8080',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/signals': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      },
      '/research': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      },
      '/performance': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      },
      '/positions': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      },
      '/research_status': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      },
      '/trade_history': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      }
    }
  }
})

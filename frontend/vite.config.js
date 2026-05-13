import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url))
  }
},
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

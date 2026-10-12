import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),
    tailwindcss(),
  ],
  envDir: '../',  // Also load .env from parent dir (VITE_API_BASE_URL, Supabase vars, etc.)
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

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const worker = process.env.SOSYSTEM_WORKER_URL ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      // Local development talks to `wrangler dev` so cookies, D1 and the
      // encrypted key store behave exactly as they do in production.
      '/api': { target: worker, changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
  },
})

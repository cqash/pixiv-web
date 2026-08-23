import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// dev 联调：API 路径代理到本地中继后端，浏览器视角始终同源，无需 CORS。
const API_PREFIXES = ['/auth', '/relay', '/img', '/sync', '/recover', '/healthz', '/admin']
const target = 'http://localhost:8080'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target, changeOrigin: true }]),
    ),
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
})

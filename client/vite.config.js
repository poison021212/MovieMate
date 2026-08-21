import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    }
  },
  server: {
    // Listen on IPv4 + IPv6 so http://127.0.0.1:5173 works on Windows
    host: true,
    proxy: {
      '/api': 'http://localhost:1337',
      '/uploads': 'http://localhost:1337',
    },
  },
})
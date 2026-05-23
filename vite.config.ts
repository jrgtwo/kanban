import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Preferred port — Vite auto-increments if it's already in use
    // because strictPort defaults to false.
    port: 5273,
    strictPort: false,
    host: true,
  },
})

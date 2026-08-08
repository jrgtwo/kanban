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
    /**
     * Fixed ports, and **`strictPort: true` on purpose**.
     *
     * These used to drift: `strictPort` defaults to false, so with several
     * projects running Vite silently took the next free port. Two things broke
     * because of it. The bookmark stopped working, obviously. Less obviously,
     * back when state lived in IndexedDB, **the port was part of the origin** —
     * `localhost:7473` and `localhost:7474` are different origins with
     * different IndexedDB stores, so starting on a shifted port showed an empty
     * board and looked like data loss. That trap is gone now that data lives in
     * SQLite behind the API, but silent drift is still worth refusing: failing
     * to bind tells you a port is taken, where succeeding on another one does
     * not.
     *
     * 7473/7474 rather than 5173/5273 — far from the default Vite range, so a
     * sibling project is unlikely to want them.
     */
    port: Number(process.env.WEB_PORT ?? 7473),
    strictPort: true,
    host: true,
    proxy: {
      // The API is its own process (`npm run dev:api`), so it keeps running
      // independently of the front end and hosting it later is a deploy rather
      // than a rewrite. Proxying keeps the browser on one origin, so there is
      // no CORS to configure and no origin to get wrong.
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? 7474}`,
        changeOrigin: true,
      },
    },
  },
})

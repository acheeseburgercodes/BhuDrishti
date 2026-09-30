import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = fileURLToPath(new URL('../shared', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': `${shared}/src`, '@shared-fixtures': `${shared}/fixtures` } },
  server: { port: 5173, host: '0.0.0.0', fs: { allow: ['..'] } },
  build: {
    // No manualChunks: a forced maplibre chunk absorbed shared CommonJS helpers, which made
    // the entry (and so the landing page) preload all of MapLibre. Rollup's automatic
    // splitting keeps MapLibre inside the lazily loaded portal/map chunks.
    chunkSizeWarningLimit: 1200,
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'] },
})

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
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { maplibre: ['maplibre-gl'] } } },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.{js,jsx}'] },
})

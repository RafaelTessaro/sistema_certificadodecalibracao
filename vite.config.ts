/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Em desenvolvimento (`npm run dev`) o Vite repassa /api para o servidor local (porta 4850).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: `http://localhost:${process.env.PORTA ?? 4850}`, changeOrigin: false },
    },
  },
  build: {
    // recharts + motion + as telas formam o bloco principal (uso em rede local);
    // as páginas menos usadas são carregadas sob demanda
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
  },
})

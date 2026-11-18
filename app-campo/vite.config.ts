import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// App BC Calibração (celular). A interface vai DENTRO do APK (webDir: dist): o app abre no cliente, sem servidor.
// O shared/ do sistema entra por caminho relativo ('../../../shared/…'), sem alias: o mesmo código roda aqui, no Node
// (testes do núcleo no vitest da raiz) e no servidor.
// A versão do app é a do package.json (a mesma do sistema e do versionName do Android, android/app/build.gradle).
const versao = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  define: { 'import.meta.env.VITE_VERSAO_APP': JSON.stringify(process.env.BC_APP_VERSAO || versao) },
  server: { fs: { allow: ['..'] } },
  build: {
    // WebView do Android 10 atualizado (Chrome 111+): ES2022 sem transpilar demais
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0,
  },
})

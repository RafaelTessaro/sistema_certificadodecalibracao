// Regras de arquitetura do app do celular, conferidas pelo vitest da raiz:
// - o núcleo (app-campo/src/nucleo) é TypeScript puro: nunca importa @capacitor (roda no Node, nos testes e no e2e do
//   servidor), nem o alias '#shared' (o Vite do app não o conhece: o shared/ entra por caminho relativo), nem node:
//   (roda no WebView) — só os arquivos de teste e os ajudantes de teste (nucleo/testes/) usam node:;
// - nada em app-campo/src usa fetch nem XMLHttpRequest: todo HTTP sai pelo CapacitorHttp.request com prazos
//   (plataforma/http.ts); o interceptador de fetch do Capacitor ignora prazos e o AbortSignal.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))
const NUCLEO = fileURLToPath(new URL('.', import.meta.url))

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : []
  })
}

/** O código sem os comentários (para os comentários poderem falar de fetch e de @capacitor). */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

const importacoes = (codigo: string) =>
  [
    ...semComentarios(codigo).matchAll(
      /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g,
    ),
  ].map((m) => m[1] ?? m[2] ?? m[3])

describe('arquitetura do app do celular', () => {
  it('o núcleo não importa @capacitor, #shared nem node: (fora dos testes)', () => {
    const lista = arquivos(NUCLEO)
    expect(lista.length).toBeGreaterThan(10)
    const problemas: string[] = []
    for (const arquivo of lista) {
      if (arquivo === fileURLToPath(import.meta.url)) continue
      const rel = relative(NUCLEO, arquivo)
      const ehTeste = /\.test\.ts$/.test(rel) || rel.startsWith('testes')
      for (const mod of importacoes(readFileSync(arquivo, 'utf8'))) {
        if (mod.startsWith('@capacitor') || mod.startsWith('#shared')) problemas.push(`${rel}: ${mod}`)
        if (!ehTeste && (mod.startsWith('node:') || mod === 'react' || mod.startsWith('react-dom')))
          problemas.push(`${rel}: ${mod}`)
        if (!ehTeste && mod.startsWith('.') && /exemplos|server\//.test(mod)) problemas.push(`${rel}: ${mod}`)
      }
    }
    expect(problemas).toEqual([])
  })

  it('nada em app-campo/src usa fetch nem XMLHttpRequest (só o CapacitorHttp.request, com prazos)', () => {
    const problemas: string[] = []
    for (const arquivo of arquivos(SRC)) {
      if (arquivo === fileURLToPath(import.meta.url)) continue
      const codigo = semComentarios(readFileSync(arquivo, 'utf8'))
      if (/(^|[^\w$])fetch\s*\(|\.fetch\b|\bXMLHttpRequest\b|navigator\.sendBeacon/.test(codigo))
        problemas.push(relative(SRC, arquivo))
    }
    expect(problemas).toEqual([])
  })

  it('a conferência acima pega um fetch de verdade (e ignora os comentários)', () => {
    expect(/(^|[^\w$])fetch\s*\(/.test(semComentarios("const r = await fetch('/x')"))).toBe(true)
    expect(/(^|[^\w$])fetch\s*\(/.test(semComentarios('// nunca use fetch(url)'))).toBe(false)
    expect(importacoes("import { X } from '@capacitor/core'\nimport type { Y } from '#shared/tipos.ts'")).toEqual([
      '@capacitor/core',
      '#shared/tipos.ts',
    ])
  })
})

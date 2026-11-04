// Content-Security-Policy da interface: só os scripts do próprio sistema (os arquivos dele e o script do tema embutido
// no index.html, pelo hash). Vale também para o que a página abre pelo endereço local (blob:): uma página com nome de
// documento escolhida no campo de arquivo não roda script com a sessão de quem abriu (2ª barreira; a 1ª é o campo).

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { criarApp, hashesDosScriptsEmbutidos } from './app.ts'

const INDEX = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')
const TEMA = /<script>([\s\S]*?)<\/script>/.exec(INDEX)![1]
const hashTema = `'sha256-${createHash('sha256').update(TEMA).digest('base64')}'`

const pastas: string[] = []
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true })
})

async function servir(index: string | null) {
  const pastaDados = mkdtempSync(join(tmpdir(), 'bcf-csp-'))
  pastas.push(pastaDados)
  let pastaEstatica = join(pastaDados, 'sem-interface')
  if (index !== null) {
    pastaEstatica = mkdtempSync(join(tmpdir(), 'bcf-csp-ui-'))
    pastas.push(pastaEstatica)
    writeFileSync(join(pastaEstatica, 'index.html'), index)
  }
  const { app } = await criarApp({ pastaDados, arquivoBanco: ':memory:', pastaEstatica })
  const pedir = (url: string) =>
    app.inject({ method: 'GET', url, remoteAddress: '192.168.0.40', headers: { host: '192.168.0.10:4850' } })
  return { app, pedir }
}

describe('Content-Security-Policy', () => {
  it('o script do tema pelo hash (com as quebras de linha que o navegador lê: CRLF vira LF)', () => {
    expect(hashesDosScriptsEmbutidos(INDEX)).toEqual([hashTema])
    expect(hashesDosScriptsEmbutidos(INDEX.replace(/\n/g, '\r\n'))).toEqual([hashTema])
    // Os carregados de arquivo (src=) valem por 'self'
    expect(hashesDosScriptsEmbutidos('<script type="module" crossorigin src="./assets/index-1.js"></script>')).toEqual([])
  })

  it('a interface sai com a política: scripts só do sistema, sem <base> de fora e sem moldura de outro site', async () => {
    const { app, pedir } = await servir(INDEX)
    try {
      const r = await pedir('/')
      expect(r.statusCode).toBe(200)
      expect(r.headers['content-security-policy']).toBe(`script-src 'self' ${hashTema}; base-uri 'self'; frame-ancestors 'self'`)
      // A API (JSON e os PDFs, que abrem no leitor do navegador) fica sem ela
      expect((await pedir('/api/saude')).headers['content-security-policy']).toBeUndefined()
    } finally {
      await app.close()
    }
  })

  it('a interface com o tema mudado (ou sem ele) leva o hash do index.html servido', async () => {
    const outro = INDEX.replace('Aplica o tema salvo', 'Aplica o tema guardado')
    const { app, pedir } = await servir(outro)
    try {
      const csp = String((await pedir('/')).headers['content-security-policy'])
      expect(csp).not.toContain(hashTema)
      expect(csp).toContain(hashesDosScriptsEmbutidos(outro)[0])
    } finally {
      await app.close()
    }
  })

  it('sem a interface compilada, a página de aviso também sai com a política (nenhum script embutido)', async () => {
    const { app, pedir } = await servir(null)
    try {
      expect((await pedir('/')).headers['content-security-policy']).toBe(
        "script-src 'self'; base-uri 'self'; frame-ancestors 'self'",
      )
    } finally {
      await app.close()
    }
  })
})

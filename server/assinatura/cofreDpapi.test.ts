// O DPAPI de verdade, pelo Windows PowerShell 5.1 e o protecao-windows.ps1 do instalador: só no Windows (no CI, o job
// "dpapi-windows" de .github/workflows/instalador-windows.yml). Fora dele, os testes são pulados (cofre.test.ts cobre o
// mesmo código com um PowerShell falso).

import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { arquivoPki, raizesTeste, SENHA } from './__fixtures__/pki.ts'
import {
  abrirCofre,
  arquivoDoCofre,
  arquivoDoSegredo,
  caminhoScriptProtecao,
  entropiaDoCofre,
  ErroCofre,
  gravarCofre,
  MSG_NAO_ABRE,
  powershellDoWindows,
  protetorDoServidor,
  protetorDpapi,
} from './cofre.ts'
import { abrirPfx } from './pfx.ts'

describe.runIf(process.platform === 'win32')('DPAPI (escopo da máquina) pelo Windows PowerShell 5.1', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'bcf-dpapi-'))
  afterAll(() => rmSync(pasta, { recursive: true, force: true }))
  const protetor = protetorDpapi()

  it('o powershell.exe do Windows e o script do instalador existem', () => {
    expect(existsSync(powershellDoWindows())).toBe(true)
    expect(caminhoScriptProtecao()).toMatch(/instalador[\\/]ferramentas[\\/]protecao-windows\.ps1$/)
  })

  it('protege e abre com a mesma entropia; com outra entropia, não abre', { timeout: 60_000 }, async () => {
    const segredo = randomBytes(1200)
    const inicio = Date.now()
    const cifrado = await protetor.proteger(segredo, entropiaDoCofre('a'.repeat(64)))
    const ms = Date.now() - inicio
    console.log(`DPAPI pelo PowerShell: ${ms} ms para proteger`)
    expect(cifrado.length).toBeGreaterThan(segredo.length)
    expect(cifrado.includes(segredo.subarray(0, 64))).toBe(false)
    expect((await protetor.abrir(cifrado, entropiaDoCofre('a'.repeat(64)))).equals(segredo)).toBe(true)
    const erro = await protetor.abrir(cifrado, entropiaDoCofre('b'.repeat(64))).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroCofre)
    expect(erro.message).toBe(MSG_NAO_ABRE)
  })

  it('o cofre inteiro: nada da chave em claro no disco, reabre e assina', { timeout: 60_000 }, async () => {
    const a1 = abrirPfx(arquivoPki('ecnpj-aes.pfx'), SENHA, { raizes: raizesTeste() })
    await gravarCofre(pasta, protetor, a1, { instaladoEm: new Date().toISOString(), instaladoPor: 'CI' })
    const texto = readFileSync(arquivoDoCofre(pasta), 'utf8')
    const pkcs8 = a1.chave.export({ format: 'der', type: 'pkcs8' }) as Buffer
    expect(Buffer.from(texto).includes(pkcs8)).toBe(false)
    expect(texto).not.toContain(pkcs8.toString('base64').slice(0, 40))
    expect(texto).not.toContain(SENHA)
    expect(JSON.parse(texto).protecao).toBe('dpapi-maquina')
    const r = await abrirCofre(pasta, protetor)
    expect(r.situacao).toBe('aberto')
    if (r.situacao === 'aberto') expect(r.a1.dados.sha256).toBe(a1.dados.sha256)
  })

  it(
    'o protetor do servidor: sem o segredo de fora da pasta de dados, a cópia não abre, nem neste computador',
    { timeout: 60_000 },
    async () => {
      const dados = join(pasta, 'BC Calibracao', 'dados')
      const a1 = abrirPfx(arquivoPki('ecnpj-aes.pfx'), SENHA, { raizes: raizesTeste() })
      await gravarCofre(dados, protetorDoServidor(dados), a1, { instaladoEm: new Date().toISOString(), instaladoPor: 'CI' })
      expect(readFileSync(arquivoDoSegredo(dados))).toHaveLength(32)
      expect((await abrirCofre(dados, protetorDoServidor(dados))).situacao).toBe('aberto')
      // O DPAPI do mesmo computador só com a entropia pública (o que qualquer conta daqui faria): não abre
      expect(await abrirCofre(dados, protetorDpapi())).toMatchObject({ situacao: 'nao-abre', motivo: MSG_NAO_ABRE })
      // A cópia da pasta "dados" em outro lugar (sem o segredo): não abre
      const copia = join(pasta, 'copia', 'dados')
      mkdirSync(copia, { recursive: true })
      copyFileSync(arquivoDoCofre(dados), arquivoDoCofre(copia))
      expect(await abrirCofre(copia, protetorDoServidor(copia))).toMatchObject({ situacao: 'nao-abre', motivo: MSG_NAO_ABRE })
    },
  )
})

// O servidor conta o dia pelo horário de Brasília em qualquer computador (server/fuso.mjs, carregado primeiro por
// server/iniciar.mjs): a "DATA DE EMISSÃO" do certificado e a linha "emitido em …, às … (horário de Brasília)" nunca
// saem com dias diferentes, nem num servidor com o fuso em UTC às 22h daqui.

import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const rodar = (tz: string) =>
  spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "await import('./server/fuso.mjs'); const d = new Date('2026-11-11T01:42:00Z'); console.log(process.env.TZ, d.getDate(), d.getHours())",
    ],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
  ).stdout.trim()

describe('o fuso do servidor', () => {
  it('sem fuso configurado (ou em UTC por padrão), o dia é o de Brasília: 01:42 UTC do dia 11 é 22:42 do dia 10', () => {
    expect(rodar('')).toBe('America/Sao_Paulo 10 22')
  })

  it('quem configurou outro fuso (TZ) fica com ele', () => {
    expect(rodar('UTC')).toBe('UTC 11 1')
  })

  it('o inicializador carrega o fuso antes de tudo', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(new URL('./iniciar.mjs', import.meta.url), 'utf8')
    const imports = [...fonte.matchAll(/^import .*$/gm)].map((m) => m[0])
    expect(imports[0]).toBe("import './fuso.mjs'")
  })
})

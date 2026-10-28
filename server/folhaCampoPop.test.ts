// A folha de campo leva o código e a revisão do POP vigente (o gerador do PDF põe no rodapé de toda página).
// Cada teste gera PDFs de verdade (alguns segundos cada, mais com a máquina ocupada): prazo de 30 s.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarAppComLogin, POP_TESTE, type AppComLogin } from './auxiliaresTeste.ts'
import type { DadosFolhaCampo } from './pdf/folhaCampo.ts'

const { recebidos } = vi.hoisted(() => ({ recebidos: [] as DadosFolhaCampo[] }))
vi.mock('./pdf/folhaCampo.ts', async (original) => {
  const m = await original<typeof import('./pdf/folhaCampo.ts')>()
  return {
    ...m,
    gerarFolhaCampoPdf: async (d: DadosFolhaCampo) => {
      recebidos.push(d)
      return m.gerarFolhaCampoPdf(d)
    },
  }
})

let t: AppComLogin
afterEach(async () => {
  recebidos.length = 0
  await t.fechar()
})

const folhaEmBranco = (chave: string) => t.chamar('GET', `/api/folha-campo?chave=${chave}`, { cookie: t.cookieComum })

describe('POP na folha de campo', () => {
  it('a folha sai com o código e a revisão do POP vigente; uma revisão nova vale para as próximas folhas', async () => {
    t = await criarAppComLogin()
    const r = await folhaEmBranco('folha-pop-0001')
    expect(r.statusCode, r.body).toBe(200)
    expect(recebidos.map((d) => d.procedimento)).toEqual([`${POP_TESTE.codigo} rev. 00`])
    const nova = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { ...POP_TESTE, revisao: '01', data: '2026-10-28' },
    })
    expect(nova.statusCode).toBe(201)
    await folhaEmBranco('folha-pop-0002')
    expect(recebidos.map((d) => d.procedimento)).toEqual([`${POP_TESTE.codigo} rev. 00`, `${POP_TESTE.codigo} rev. 01`])
  }, 30_000)

  it('sem POP registrado, a folha sai sem a referência', async () => {
    t = await criarAppComLogin({ semPop: true })
    expect((await folhaEmBranco('folha-pop-0003')).statusCode).toBe(200)
    expect(recebidos.map((d) => d.procedimento)).toEqual([''])
  }, 30_000)
})

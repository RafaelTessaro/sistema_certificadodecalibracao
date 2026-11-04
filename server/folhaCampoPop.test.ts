// A folha de campo leva o código e a revisão do POP (o gerador do PDF põe no rodapé de toda página): a avulsa, o
// vigente; a de uma calibração em andamento, o que o certificado dela vai citar.
// Cada teste gera PDFs de verdade (alguns segundos cada, mais com a máquina ocupada): prazo de 30 s.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cenarioCalibracao, criarAppComLogin, POP_TESTE, type AppComLogin } from './auxiliaresTeste.ts'
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

  it('folha de uma calibração em andamento: o POP que o certificado vai citar (o da data da calibração)', async () => {
    t = await criarAppComLogin()
    const c = await cenarioCalibracao(t)
    const nova = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { ...POP_TESTE, revisao: '01', data: '2026-10-28' },
    })
    expect(nova.statusCode).toBe(201)
    // Calibração de antes da rev. 01 (digitada depois da visita): a folha e o certificado com a 00
    const pronta = await c.calibracaoPronta()
    const r = await t.chamar('PUT', `/api/calibracoes/${pronta.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...pronta, dataCalibracao: '2026-10-20', versao: pronta.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const k = r.json().calibracao
    expect((await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })).statusCode).toBe(200)
    expect(recebidos.map((d) => d.procedimento)).toEqual([`${POP_TESTE.codigo} rev. 00`])
    // Folha nova com a data de hoje: a 01 (e o certificado passa a citar a da folha nova)
    const hoje = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...k, dataCalibracao: '2026-10-30', versao: k.versao },
    })
    expect(hoje.statusCode, hoje.body).toBe(200)
    const folhaNova = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo?nova=folha-nova-0001`, {
      cookie: t.cookieAdmin,
    })
    expect(folhaNova.statusCode, folhaNova.body).toBe(200)
    expect(recebidos.map((d) => d.procedimento)).toEqual([`${POP_TESTE.codigo} rev. 00`, `${POP_TESTE.codigo} rev. 01`])
    const emitida = await c.emitir(hoje.json().calibracao)
    expect(emitida.statusCode, emitida.body).toBe(200)
    expect(emitida.json().calibracao.emissao.textos.procedimento).toBe(`${POP_TESTE.codigo} rev. 01`)
  }, 30_000)

  it('sem POP registrado, a folha sai sem a referência', async () => {
    t = await criarAppComLogin({ semPop: true })
    expect((await folhaEmBranco('folha-pop-0003')).statusCode).toBe(200)
    expect(recebidos.map((d) => d.procedimento)).toEqual([''])
  }, 30_000)
})

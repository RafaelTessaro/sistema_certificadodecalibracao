// A folha de campo leva o código e a revisão do POP (o gerador do PDF põe no rodapé de toda página): a avulsa e a
// primeira impressão da folha de uma calibração em andamento (e a folha nova), o vigente na impressão (a folha vai a
// campo agora; o rascunho nasce com a data do dia em que foi criado). O certificado cita o da folha; se na data da
// calibração valia outra revisão, a tela avisa para conferir a data (sem impedir a emissão).
// Cada teste gera PDFs de verdade (alguns segundos cada, mais com a máquina ocupada): prazo de 30 s.

import { spawnSync } from 'node:child_process'
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

/** O texto do PDF (pdftotext, do poppler-utils; sem ele, a conferência pelo texto fica de fora). */
const temPdftotext = !spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error
const textoDoPdf = (pdf: Buffer) =>
  spawnSync('pdftotext', ['-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 }).stdout.toString('utf8')

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

  it('folha de uma calibração em andamento: o POP vigente na impressão (a folha vai a campo agora)', async () => {
    t = await criarAppComLogin()
    const c = await cenarioCalibracao(t)
    const nova = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { ...POP_TESTE, revisao: '01', data: '2026-10-28' },
    })
    expect(nova.statusCode).toBe(201)
    // Calibração com a data de antes da rev. 01 (o rascunho nasce com o dia em que foi criado): a folha impressa
    // agora sai com a vigente, e a tela avisa para conferir a data
    const pronta = await c.calibracaoPronta()
    const r = await t.chamar('PUT', `/api/calibracoes/${pronta.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...pronta, dataCalibracao: '2026-10-20', versao: pronta.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const k = r.json().calibracao
    const folha = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(folha.statusCode).toBe(200)
    expect(recebidos.map((d) => d.procedimento)).toEqual([`${POP_TESTE.codigo} rev. 01`])
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.pop.revisao).toBe('01')
    expect(detalhe.avisos).toEqual([
      `A folha de campo ${folha.headers['x-folha-campo']} saiu com o ${POP_TESTE.codigo} rev. 01, mas em 20/10/2026 ainda valia a rev. 00. Confira a data da calibração.`,
    ])
    // Folha nova com a data de hoje: a 01 (e o certificado cita a da folha nova)
    const hoje = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...detalhe.calibracao, dataCalibracao: '2026-10-30', versao: detalhe.calibracao.versao },
    })
    expect(hoje.statusCode, hoje.body).toBe(200)
    expect(hoje.json().avisos).toEqual([])
    const folhaNova = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo?nova=folha-nova-0001`, {
      cookie: t.cookieAdmin,
    })
    expect(folhaNova.statusCode, folhaNova.body).toBe(200)
    expect(recebidos.map((d) => d.procedimento)).toEqual([`${POP_TESTE.codigo} rev. 01`, `${POP_TESTE.codigo} rev. 01`])
    const emitida = await c.emitir(hoje.json().calibracao)
    expect(emitida.statusCode, emitida.body).toBe(200)
    expect(emitida.json().calibracao.emissao.textos.procedimento).toBe(`${POP_TESTE.codigo} rev. 01`)
  }, 30_000)

  it('rascunho criado antes de uma revisão nova do POP e folha impressa depois: a folha e o certificado com a nova', async () => {
    t = await criarAppComLogin()
    const repo = t.ctx.repo
    const c = await cenarioCalibracao(t)
    try {
      // 20/10: o rascunho nasce com a data do dia
      repo.agora = () => new Date('2026-10-20T13:00:00Z')
      const k0 = await c.calibracaoPronta()
      expect(k0.dataCalibracao).toBe('2026-10-20')
      // 28/10: a rev. 01 passa a valer
      repo.agora = () => new Date('2026-10-28T13:00:00Z')
      const nova = await t.chamar('POST', '/api/pop', {
        cookie: t.cookieAdmin,
        payload: { ...POP_TESTE, revisao: '01', data: '2026-10-28' },
      })
      expect(nova.statusCode, nova.body).toBe(201)
      // 04/11: a folha é impressa para a visita do dia, com a rev. 01
      repo.agora = () => new Date('2026-11-04T12:00:00Z')
      const folha = await t.chamar('GET', `/api/calibracoes/${k0.id}/folha-campo`, { cookie: t.cookieAdmin })
      expect(folha.statusCode, folha.body).toBe(200)
      expect(recebidos.map((d) => d.procedimento)).toEqual([`${POP_TESTE.codigo} rev. 01`])
      // A data corrigida para a da visita: sem aviso; o certificado cita a rev. 01 (no PDF também)
      const det = (await t.chamar('GET', `/api/calibracoes/${k0.id}`, { cookie: t.cookieAdmin })).json()
      const corrigida = await t.chamar('PUT', `/api/calibracoes/${k0.id}`, {
        cookie: t.cookieAdmin,
        payload: { ...det.calibracao, dataCalibracao: '2026-11-04', versao: det.calibracao.versao },
      })
      expect(corrigida.statusCode, corrigida.body).toBe(200)
      expect(corrigida.json().avisos).toEqual([])
      const emitida = await c.emitir(corrigida.json().calibracao)
      expect(emitida.statusCode, emitida.body).toBe(200)
      const k = emitida.json().calibracao
      expect(k.emissao.pop.revisao).toBe('01')
      expect(k.emissao.textos.procedimento).toBe(`${POP_TESTE.codigo} rev. 01`)
      if (temPdftotext) {
        const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
        const texto = textoDoPdf(pdf.rawPayload)
        expect(texto).toContain(`${POP_TESTE.codigo} rev. 01`)
        expect(texto).not.toContain(`${POP_TESTE.codigo} rev. 00`)
      }
    } finally {
      repo.agora = () => new Date()
    }
  }, 30_000)

  it('folha que já saiu com a revisão antiga e data da calibração depois da nova: aviso, sem impedir a emissão', async () => {
    t = await criarAppComLogin()
    const repo = t.ctx.repo
    const c = await cenarioCalibracao(t)
    try {
      // 25/10: rascunho e folha impressos com a rev. 00 (a vigente)
      repo.agora = () => new Date('2026-10-25T13:00:00Z')
      const k0 = await c.calibracaoPronta()
      const folha = await t.chamar('GET', `/api/calibracoes/${k0.id}/folha-campo`, { cookie: t.cookieAdmin })
      expect(folha.statusCode, folha.body).toBe(200)
      expect(recebidos.map((d) => d.procedimento)).toEqual([`${POP_TESTE.codigo} rev. 00`])
      // 28/10: a rev. 01; a visita (com a folha de antes) em 04/11
      repo.agora = () => new Date('2026-10-28T13:00:00Z')
      const nova = await t.chamar('POST', '/api/pop', {
        cookie: t.cookieAdmin,
        payload: { ...POP_TESTE, revisao: '01', data: '2026-10-28' },
      })
      expect(nova.statusCode, nova.body).toBe(201)
      repo.agora = () => new Date('2026-11-04T12:00:00Z')
      const det = (await t.chamar('GET', `/api/calibracoes/${k0.id}`, { cookie: t.cookieAdmin })).json()
      expect(det.avisos).toEqual([])
      const corrigida = await t.chamar('PUT', `/api/calibracoes/${k0.id}`, {
        cookie: t.cookieAdmin,
        payload: { ...det.calibracao, dataCalibracao: '2026-11-04', versao: det.calibracao.versao },
      })
      expect(corrigida.statusCode, corrigida.body).toBe(200)
      const aviso = `A folha de campo ${folha.headers['x-folha-campo']} saiu com o ${POP_TESTE.codigo} rev. 00, mas em 04/11/2026 já valia a rev. 01. Confira a data da calibração.`
      expect(corrigida.json().avisos).toEqual([aviso])
      expect(corrigida.json().pendencias).toEqual([])
      expect((await t.chamar('GET', `/api/calibracoes/${k0.id}`, { cookie: t.cookieAdmin })).json().avisos).toEqual([aviso])
      // O certificado cita a revisão impressa no papel que foi a campo; a emissão não é impedida
      const emitida = await c.emitir(corrigida.json().calibracao)
      expect(emitida.statusCode, emitida.body).toBe(200)
      expect(emitida.json().calibracao.emissao.textos.procedimento).toBe(`${POP_TESTE.codigo} rev. 00`)
      // Emitido: sem avisos
      expect((await t.chamar('GET', `/api/calibracoes/${k0.id}`, { cookie: t.cookieAdmin })).json().avisos).toEqual([])
    } finally {
      repo.agora = () => new Date()
    }
  }, 30_000)

  it('sem POP registrado, a folha sai sem a referência', async () => {
    t = await criarAppComLogin({ semPop: true })
    expect((await folhaEmBranco('folha-pop-0003')).statusCode).toBe(200)
    expect(recebidos.map((d) => d.procedimento)).toEqual([''])
  }, 30_000)
})

// O certificado cita a revisão do POP usada na calibração (ISO/IEC 17025, 7.8.2.1: o método usado), não a vigente
// na emissão: a impressa na folha de campo da calibração; sem folha, a última registrada com data até a da
// calibração (antes de todas, a mais antiga: a trazida das configurações tem a data da atualização). A revisão do
// certificado é a mesma visita: sai com o POP do original. A revisão do POP com data no futuro é recusada.
// Alguns testes geram a folha de campo em PDF (alguns segundos cada): prazo de 30 s.

import { afterEach, describe, expect, it } from 'vitest'
import { hojeLocalIso } from '#shared/dominio.ts'
import type { Calibracao, VersaoPop } from '#shared/tipos.ts'
import { cenarioCalibracao, criarAppComLogin, POP_TESTE, type AppComLogin } from './auxiliaresTeste.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>
afterEach(async () => {
  await t?.fechar()
})

async function iniciar(opcoes: { semPop?: boolean } = {}) {
  t = await criarAppComLogin(opcoes)
  c = await cenarioCalibracao(t)
}

const texto = (revisao: string) => `${POP_TESTE.codigo} rev. ${revisao}`

async function registrarPop(revisao: string, data: string) {
  const r = await t.chamar('POST', '/api/pop', {
    cookie: t.cookieAdmin,
    payload: { codigo: POP_TESTE.codigo, revisao, data },
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().versao as VersaoPop
}

const detalhe = async (k: Calibracao) => (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()

async function prontaEm(data: string) {
  const k = await c.calibracaoPronta()
  const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
    cookie: t.cookieAdmin,
    payload: { ...k, dataCalibracao: data, versao: k.versao },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().calibracao as Calibracao
}

async function emitir(k: Calibracao) {
  const r = await c.emitir((await detalhe(k)).calibracao)
  expect(r.statusCode, r.body).toBe(200)
  return r.json().calibracao as Calibracao
}

async function revisar(k: Calibracao) {
  const r = await t.chamar('POST', `/api/calibracoes/${k.id}/revisar`, {
    cookie: t.cookieAdmin,
    payload: { motivo: 'Corrigir o endereço do cliente' },
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().calibracao as Calibracao
}

describe('POP do certificado: o usado na calibração', () => {
  it('o da folha de campo: a revisão registrada depois da impressão não vale para a calibração', async () => {
    await iniciar()
    const v0 = t.ctx.repo.popVigente()!
    const k = await c.calibracaoPronta()
    const folha = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(folha.statusCode, folha.body).toBe(200)
    // A rev. 01 entra antes da emissão, com data de hoje (a da calibração)
    const v1 = await registrarPop('01', hojeLocalIso())
    const aberta = await detalhe(k)
    expect(aberta.pop).toMatchObject({ id: v0.id, revisao: '00' })
    expect(aberta.pendencias).toEqual([])
    const e = await emitir(k)
    expect(e.emissao?.textos.procedimento).toBe(texto('00'))
    expect(e.emissao?.pop).toMatchObject({ id: v0.id, revisao: '00' })
    // Uma calibração sem folha, do mesmo dia, já sai com a 01
    const outra = await c.emitido()
    expect(outra.emissao?.pop).toMatchObject({ id: v1.id, revisao: '01' })
    expect(outra.emissao?.textos.procedimento).toBe(texto('01'))
  }, 30_000)

  it('a folha avulsa ligada depois: o POP impresso nela', async () => {
    await iniciar()
    const v0 = t.ctx.repo.popVigente()!
    const avulsa = await t.chamar('GET', `/api/folha-campo?chave=avulsa-pop-0001`, { cookie: t.cookieAdmin })
    expect(avulsa.statusCode, avulsa.body).toBe(200)
    await registrarPop('01', hojeLocalIso())
    const k = await c.calibracaoPronta()
    const ligada = await t.chamar('PUT', `/api/calibracoes/${k.id}/folha-campo`, {
      cookie: t.cookieAdmin,
      payload: { numero: avulsa.headers['x-folha-campo'] },
    })
    expect(ligada.statusCode, ligada.body).toBe(200)
    expect((await emitir(k)).emissao?.pop).toMatchObject({ id: v0.id, revisao: '00' })
  }, 30_000)

  it('sem folha: a última revisão com data até a da calibração; antes de todas, a mais antiga', async () => {
    await iniciar({ semPop: true })
    const v0 = await registrarPop('00', '2026-06-01')
    const v1 = await registrarPop('01', '2026-10-28')
    const antes = await prontaEm('2026-10-20')
    expect((await detalhe(antes)).pop).toMatchObject({ id: v0.id })
    const e0 = await emitir(antes)
    expect(e0.emissao?.textos.procedimento).toBe(texto('00'))
    expect(e0.emissao?.pop).toMatchObject({ id: v0.id })
    // No dia da revisão nova: ela
    expect((await emitir(await prontaEm('2026-10-28'))).emissao?.pop).toMatchObject({ id: v1.id })
    // Antes de todas (o POP trazido das configurações tem a data da atualização): a mais antiga, sem pendência
    const antiga = await prontaEm('2026-03-02')
    expect((await detalhe(antiga)).pendencias).toEqual([])
    expect((await emitir(antiga)).emissao?.pop).toMatchObject({ id: v0.id })
  })

  it('revisão do certificado: o POP do original, mesmo com uma revisão nova registrada depois', async () => {
    await iniciar()
    const v0 = t.ctx.repo.popVigente()!
    const original = await c.emitido()
    expect(original.emissao?.pop).toMatchObject({ id: v0.id })
    await registrarPop('01', hojeLocalIso())
    const rev = await revisar(original)
    expect((await detalhe(rev)).pop).toMatchObject({ id: v0.id, revisao: '00' })
    const r1 = await emitir(rev)
    expect(r1.numero).toBe(`${original.numero}-R1`)
    expect(r1.emissao?.textos.procedimento).toBe(texto('00'))
    expect(r1.emissao?.pop).toMatchObject({ id: v0.id, codigo: POP_TESTE.codigo, revisao: '00' })
    // A revisão da revisão também
    const r2 = await emitir(await revisar(r1))
    expect(r2.emissao?.textos.procedimento).toBe(texto('00'))
    expect(r2.emissao?.pop?.id).toBe(v0.id)
  })

  it('revisão com a folha avulsa de uma visita nova ligada a ela: o POP impresso nessa folha', async () => {
    await iniciar()
    const original = await c.emitido()
    const v1 = await registrarPop('01', hojeLocalIso())
    const avulsa = await t.chamar('GET', `/api/folha-campo?chave=avulsa-pop-0002`, { cookie: t.cookieAdmin })
    expect(avulsa.statusCode, avulsa.body).toBe(200)
    const rev = await revisar(original)
    const ligada = await t.chamar('PUT', `/api/calibracoes/${rev.id}/folha-campo`, {
      cookie: t.cookieAdmin,
      payload: { numero: avulsa.headers['x-folha-campo'], confirmar: true },
    })
    expect(ligada.statusCode, ligada.body).toBe(200)
    expect((await detalhe(rev)).pop).toMatchObject({ id: v1.id, revisao: '01' })
    expect((await emitir(rev)).emissao?.textos.procedimento).toBe(texto('01'))
  }, 30_000)

  it('revisão de um certificado emitido antes das revisões do POP: o procedimento que saiu nele', async () => {
    await iniciar()
    const original = await c.emitido()
    // Como a versão 1.0.1 gravava: só o texto das configurações, sem a revisão do POP
    const { pop: _pop, ...semPop } = original.emissao!
    const legado = { ...original, emissao: { ...semPop, textos: { ...semPop.textos, procedimento: 'IT-CAL-07 rev. 3' } } }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(legado), original.id)
    const rev = await revisar(original)
    const aberta = await detalhe(rev)
    expect(aberta.pendencias).toEqual([])
    expect(aberta.pop).toBeNull()
    const emitida = await emitir(rev)
    expect(emitida.emissao?.textos.procedimento).toBe('IT-CAL-07 rev. 3')
    expect(emitida.emissao?.pop ?? null).toBeNull()
  })

  it('a revisão do POP com data no futuro é recusada', async () => {
    await iniciar()
    const r = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { codigo: POP_TESTE.codigo, revisao: '01', data: '2099-12-31' },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().erro).toBe('A data da revisão do POP não pode ser no futuro.')
    expect(t.ctx.repo.popVigente()).toMatchObject({ revisao: '00' })
    // Hoje vale
    expect((await registrarPop('01', hojeLocalIso())).revisao).toBe('01')
  })
})

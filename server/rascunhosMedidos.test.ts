// Atualização para a 1.0.3: a calibração em andamento já medida antes das regras do POP (marcada pela migração 14)
// sai com os mínimos como avisos, sem refazer a visita; a calibração nova, com os mesmos dados, segue as regras. A
// balança que não pesa corretamente e a leitura fora do esperado continuam pendências, e a marca é só do servidor.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Calibracao, CalibracaoInput } from '#shared/tipos.ts'
import { cenarioCalibracao, criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { pendenciasDa } from './certificados.ts'
import { migrar } from './db.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>

beforeEach(async () => {
  t = await criarAppComLogin()
  c = await cenarioCalibracao(t)
})
afterEach(async () => {
  await t.fechar()
})

/** Espaços finos e inseparáveis dos números → espaço comum (para comparar textos). */
const sem = (x: string) => x.replace(/[   ]/g, ' ')

async function salvar(k: Calibracao, mudar: (k: CalibracaoInput) => CalibracaoInput) {
  const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
    cookie: t.cookieAdmin,
    payload: { ...mudar(k), versao: k.versao },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as { calibracao: Calibracao; pendencias: string[] }
}
const detalhe = async (k: Pick<Calibracao, 'id'>) =>
  (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json() as {
    calibracao: Calibracao
    pendencias: string[]
  }

/** Como muitas calibrações da 1.0.2: 3 leituras a 15 kg, 4 pontos (sem o de 20 kg) e sem o retorno ao zero. */
const comoNa102 = (k: CalibracaoInput): CalibracaoInput => ({
  ...k,
  repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15.01, 15] }],
  indicacao: { ...k.indicacao, retornoZero: null, pontos: k.indicacao.pontos.filter((p) => p.carga !== 20) },
})
const MINIMOS = [
  'Erro de indicação: 4 pontos lidos; o POP pede no mínimo 5, contando o zero (7.7).',
  'Repetibilidade a 15,00 kg: 3 leituras; o mínimo é 5 (POP, Tabela 4; 3 só com carga ≥ 100 kg).',
  'Erro de indicação: registre o retorno ao zero, a indicação sem carga depois de retirar toda a carga (POP 7.7).',
]

/** A atualização: o banco volta para a versão de antes da migração 14 e o servidor aplica o que falta. */
function atualizar() {
  t.ctx.db.exec('PRAGMA user_version = 13')
  migrar(t.ctx.db)
}

/** Calibração com os dados da 1.0.2, medida antes da atualização (já marcada por ela). */
async function medidaAntes() {
  const { calibracao, pendencias } = await salvar(await c.calibracaoPronta(), comoNa102)
  // Antes da migração, o código novo a bloqueava (os mínimos viravam pendência)
  expect(pendencias.map(sem)).toEqual(MINIMOS)
  atualizar()
  return (await detalhe(calibracao)).calibracao
}

describe('calibração em andamento já medida antes das regras do POP', () => {
  it('emite com os mínimos como avisos; a calibração nova, com os mesmos dados, não', async () => {
    const k = await medidaAntes()
    expect(k.minimosComoAviso).toBe(true)
    expect(pendenciasDa(t.ctx, k)).toEqual([])
    expect((await detalhe(k)).pendencias).toEqual([])
    const r = await c.emitir(k)
    expect(r.statusCode, r.body).toBe(200)
    // A calibração nova segue as regras
    const nova = await salvar(await c.calibracaoPronta(), comoNa102)
    expect(nova.calibracao.minimosComoAviso).toBeUndefined()
    expect(nova.pendencias.map(sem)).toEqual(MINIMOS)
    expect((await c.emitir(nova.calibracao)).statusCode).toBe(409)
  })

  it('a balança que não pesa corretamente e a leitura fora do esperado continuam pendências (409)', async () => {
    const k = await medidaAntes()
    const naoPesa = await salvar(k, (x) => ({
      ...x,
      indicacao: { ...x.indicacao, pontos: x.indicacao.pontos.map((p) => (p.carga === 30 ? { ...p, crescente: 30.1 } : p)) },
    }))
    expect(naoPesa.pendencias.map(sem)).toEqual([
      'Erro de indicação, ponto de 30,00 kg: erro de +0,100 kg, maior que o EMA em serviço (±0,04 kg); a balança não pesa corretamente e não é calibrada (POP 7.8).',
    ])
    expect((await c.emitir(naoPesa.calibracao)).statusCode).toBe(409)
    const digitada = await salvar(naoPesa.calibracao, (x) => ({
      ...x,
      repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 1501, 15] }],
      indicacao: k.indicacao,
    }))
    expect(digitada.pendencias.map(sem)).toEqual([
      'Repetibilidade a 15,00 kg: leitura 1501,00 fora do esperado; confira a digitação.',
    ])
    expect((await c.emitir(digitada.calibracao)).statusCode).toBe(409)
  })

  it('a marca é do servidor: o PUT não a tira nem a põe, e a cópia para uma calibração nova não a leva', async () => {
    const k = await medidaAntes()
    const tirada = await salvar(k, (x) => ({ ...x, minimosComoAviso: false }))
    expect(tirada.calibracao.minimosComoAviso).toBe(true)
    expect(tirada.pendencias).toEqual([])
    const nova = await salvar(await c.calibracaoPronta(), (x) => ({ ...comoNa102(x), minimosComoAviso: true }))
    expect(nova.calibracao.minimosComoAviso).toBeUndefined()
    expect(nova.pendencias.map(sem)).toEqual(MINIMOS)
    // "Recalibrar" (o POST com os dados de uma calibração marcada) também começa sem ela
    const { calibracao: copia } = await c.criar('/api/calibracoes', { ...k, id: undefined, versao: undefined })
    expect((copia as Calibracao).minimosComoAviso).toBeUndefined()
  })

  it('a revisão do certificado dela também mantém os mínimos como avisos (é a mesma visita)', async () => {
    const r = await c.emitir(await medidaAntes())
    expect(r.statusCode, r.body).toBe(200)
    const emitida = r.json().calibracao as Calibracao
    const rev = (await c.criar(`/api/calibracoes/${emitida.id}/revisar`, { motivo: 'Corrigir o endereço do cliente' }))
      .calibracao as Calibracao
    expect(rev.minimosComoAviso).toBe(true)
    expect((await detalhe(rev)).pendencias).toEqual([])
    const r1 = await c.emitir(rev)
    expect(r1.statusCode, r1.body).toBe(200)
    // A revisão de uma calibração nova não ganha a marca
    const outra = (await c.emitido()) as Calibracao
    const revNova = (await c.criar(`/api/calibracoes/${outra.id}/revisar`, { motivo: 'Corrigir o endereço do cliente' }))
      .calibracao as Calibracao
    expect(revNova.minimosComoAviso).toBeUndefined()
  })
})

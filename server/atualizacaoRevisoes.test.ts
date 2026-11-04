// Registros de antes da 1.0.3 abertos depois da atualização, pela API:
// - o rascunho gravado sem `opcoes.conveccao` (1.0.1) e emitido sem regravar sai com as regras do POP, e a revisão
//   dele também as segue (não vira "legado");
// - a revisão aberta na 1.0.1/1.0.2 (sem `padroesCongelados`) ganha, pela migração 15, os padrões da emissão original:
//   não trava com o padrão desativado ou recalibrado depois e cita o certificado do padrão da época.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calculoLegado } from '#shared/dominio.ts'
import type { Calibracao, Padrao } from '#shared/tipos.ts'
import { criarAppComLogin, cenarioCalibracao, type AppComLogin } from './auxiliaresTeste.ts'
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

/** Grava os dados da calibração direto no banco (como uma versão anterior os deixou), sem subir a versão. */
const gravarComo = (k: Calibracao | Record<string, unknown>) =>
  t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(k), String(k.id))

const detalhe = async (id: string) => (await t.chamar('GET', `/api/calibracoes/${id}`, { cookie: t.cookieAdmin })).json()

describe('rascunho da 1.0.1 (opções sem a convecção) emitido sem regravar', () => {
  it('o certificado sai com as regras do POP e as opções completas; a revisão dele também as segue', async () => {
    const k = await c.calibracaoPronta()
    // Como a 1.0.1 gravava: as opções sem a convecção (só o PUT as completa, e a tela só grava o que muda)
    const { conveccao: _c, ...opcoes } = k.opcoes
    gravarComo({ ...k, opcoes })
    const r = await c.emitir(k)
    expect(r.statusCode).toBe(200)
    const emitida = r.json().calibracao as Calibracao
    expect(emitida.emissao?.regrasDoPop).toBe(true)
    expect(emitida.opcoes.conveccao).toBe('NAO_CONSIDERAR')
    expect(calculoLegado(emitida)).toBe(false)

    const { calibracao: rev } = (await c.criar(`/api/calibracoes/${emitida.id}/revisar`, {
      motivo: 'Corrigir a leitura de 30 kg',
    })) as { calibracao: Calibracao }
    expect(rev.calculoLegado).toBeUndefined()
    expect(rev.regrasDoPop).toBe(true)

    // A balança que não pesa corretamente (erro de 0,1 kg em 30 kg; EMA em serviço de ±0,04 kg) não sai na revisão
    const s = await t.chamar('PUT', `/api/calibracoes/${rev.id}`, {
      cookie: t.cookieAdmin,
      payload: {
        ...rev,
        indicacao: {
          ...rev.indicacao,
          pontos: rev.indicacao.pontos.map((p) => (p.carga === 30 ? { ...p, crescente: 30.1, decrescente: 30.1 } : p)),
        },
      },
    })
    expect(s.statusCode).toBe(200)
    expect((s.json().pendencias as string[]).join('\n')).toMatch(/não pesa corretamente/)
    const e = await c.emitir(s.json().calibracao)
    expect(e.statusCode).toBe(409)
  })

  it('o certificado já emitido assim (sem a convecção, com as regras do POP) não é legado; o de antes delas, sim', async () => {
    const emitida = await c.emitido()
    const { conveccao: _c, ...opcoes } = emitida.opcoes
    // Emitido pela 1.0.3 com as opções sem a convecção: a revisão nasce com as regras do POP
    gravarComo({ ...emitida, opcoes })
    const { calibracao: rev } = (await c.criar(`/api/calibracoes/${emitida.id}/revisar`, { motivo: 'Endereço' })) as {
      calibracao: Calibracao
    }
    expect(rev.calculoLegado).toBeUndefined()
    expect(rev.regrasDoPop).toBe(true)

    // Emitido antes da classe I (1.0.1: sem a convecção e sem `regrasDoPop`): legado, como sempre
    const antigo = await c.emitido()
    const { regrasDoPop: _r, ...emissao } = antigo.emissao!
    const { conveccao: _c2, ...opcoesAntigas } = antigo.opcoes
    gravarComo({ ...antigo, opcoes: opcoesAntigas, emissao })
    const { calibracao: revAntiga } = (await c.criar(`/api/calibracoes/${antigo.id}/revisar`, { motivo: 'Endereço' })) as {
      calibracao: Calibracao
    }
    expect(revAntiga.calculoLegado).toBe(true)
    expect(revAntiga.regrasDoPop).toBeUndefined()
  })
})

describe('migração 15: a revisão aberta antes da 1.0.3 (sem os padrões congelados)', () => {
  /** Revisão de um certificado emitido, gravada como na 1.0.2: sem `padroesCongelados`. */
  async function revisaoComoNa102(original: Calibracao, motivo = 'Corrigir o endereço') {
    const { calibracao: rev } = (await c.criar(`/api/calibracoes/${original.id}/revisar`, { motivo })) as {
      calibracao: Calibracao
    }
    expect(rev.padroesCongelados?.map((p) => p.id)).toEqual(original.emissao!.padroes.map((p) => p.id))
    const { padroesCongelados: _p, ...comoNa102 } = rev
    gravarComo(comoNa102)
    return rev
  }
  /**
   * O banco volta à versão 14 e sobe até a 15 (a atualização para a 1.0.4, só a migração 15: a 16, que marca a descida
   * das calibrações já medidas, tem os testes dela em db.test.ts).
   */
  const atualizar = () => {
    t.ctx.db.exec('PRAGMA user_version = 14')
    migrar(t.ctx.db, 15)
  }
  const obterPadrao = (id: string) => t.ctx.repo.obterPadrao(id) as Padrao

  it('o padrão desativado depois: sem a migração, a pendência e 409; com ela, os padrões da emissão e emite', async () => {
    const original = await c.emitido()
    const rev = await revisaoComoNa102(original)
    // O jogo é desativado depois (vendido)
    const d = await t.chamar('PUT', `/api/padroes/${c.pesos.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...obterPadrao(c.pesos.id), ativo: false },
    })
    expect(d.statusCode).toBe(200)
    const antes = await detalhe(rev.id)
    expect(antes.pendencias).toContain(
      'O padrão JP-01 está desativado: tire-o desta calibração (etapa Padrões e ambiente) ou reative-o em Padrões.',
    )

    atualizar()
    const depois = await detalhe(rev.id)
    expect(depois.calibracao.padroesCongelados).toEqual(original.emissao!.padroes)
    expect(depois.calibracao.versao).toBe(antes.calibracao.versao)
    expect(depois.pendencias).toEqual([])
    expect((await c.emitir(depois.calibracao)).statusCode).toBe(200)
  })

  it('o padrão recalibrado depois: a revisão cita o certificado da época e não pede outro padrão', async () => {
    const original = await c.emitido()
    const jogo = obterPadrao(c.pesos.id)
    const rev = await revisaoComoNa102(original)
    // Recalibrado depois da calibração original (outro certificado, data posterior)
    const dia = original.dataCalibracao
    const depoisDela = `${Number(dia.slice(0, 4)) + 1}${dia.slice(4)}`
    const r = await t.chamar('PUT', `/api/padroes/${jogo.id}`, {
      cookie: t.cookieAdmin,
      payload: {
        ...jogo,
        certificado: 'LAB-0789/2027',
        dataCalibracao: depoisDela,
        validade: `${Number(dia.slice(0, 4)) + 2}${dia.slice(4)}`,
      },
    })
    expect(r.statusCode).toBe(200)
    // Recalibrado na 1.0.1/1.0.2: o cadastro sem a versão de antes (`versoesAnteriores` veio depois)
    const linha = t.ctx.db.prepare('SELECT dados FROM padroes WHERE id = ?').get(jogo.id) as { dados: string }
    const { versoesAnteriores: _v, ...semVersoes } = JSON.parse(linha.dados) as Padrao
    t.ctx.db.prepare('UPDATE padroes SET dados = ? WHERE id = ?').run(JSON.stringify(semVersoes), jogo.id)
    const antes = await detalhe(rev.id)
    expect((antes.pendencias as string[]).some((p) => /foi calibrado em .*, depois desta calibração/.test(p))).toBe(true)
    expect(antes.padroes.find((p: Padrao) => p.id === jogo.id).certificado).toBe('LAB-0789/2027')

    atualizar()
    const depois = await detalhe(rev.id)
    expect(depois.pendencias).toEqual([])
    expect(depois.padroes.find((p: Padrao) => p.id === jogo.id).certificado).toBe(jogo.certificado)
  })

  it('só as revisões abertas sem os padrões; o registro de atividades diz quais; pode ser repetida', async () => {
    const a = await c.emitido()
    const b = await c.emitido()
    const revA = await revisaoComoNa102(a)
    // A revisão criada nesta versão (com os padrões congelados) e o certificado emitido ficam como estão
    const { calibracao: revB } = (await c.criar(`/api/calibracoes/${b.id}/revisar`, { motivo: 'Outra' })) as {
      calibracao: Calibracao
    }
    const linhaDe = (id: string) =>
      t.ctx.db.prepare('SELECT dados, versao FROM calibracoes WHERE id = ?').get(id) as { dados: string; versao: number }
    const antesB = linhaDe(revB.id)
    const antesA = linhaDe(revA.id)
    atualizar()
    expect(linhaDe(revB.id)).toEqual(antesB)
    expect(linhaDe(revA.id).versao).toBe(antesA.versao)
    expect(JSON.parse(linhaDe(revA.id).dados).padroesCongelados).toEqual(a.emissao!.padroes)
    const registros = () =>
      (
        t.ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'SISTEMA_ATUALIZADO'").all() as Array<{ detalhe: string }>
      ).map((x) => x.detalhe)
    expect(registros()).toEqual([
      `A revisão aberta antes desta versão passa a usar os padrões da emissão do certificado revisado (o certificado e as correções da época). Certificado: ${a.numero}.`,
    ])
    // De novo: nada muda, nada é registrado
    const depois = linhaDe(revA.id)
    atualizar()
    expect(linhaDe(revA.id)).toEqual(depois)
    expect(registros()).toHaveLength(1)
  })
})

import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import type { CalibracaoInput } from '#shared/tipos.ts'
import { exemploRodoviaria } from '../../../server/pdf/exemplosCertificado.ts'
import { mudarEnsaioDaAba } from './indicacao'

/** Rodoviária com substituição, ajuste interno e o "como encontrado" igual ao ensaio final (mesmas leituras). */
function comAjuste(): { k: CalibracaoInput; d: ReturnType<typeof exemploRodoviaria> } {
  const d = exemploRodoviaria()
  const k: CalibracaoInput = {
    ...d.calibracao,
    ajuste: { ...d.calibracao.ajuste, realizado: 'INTERNO' },
    comoEncontrado: { ...structuredClone(d.calibracao.indicacao), retornoZero: null },
  }
  return { k, d }
}

describe('mudarEnsaioDaAba', () => {
  it('o retorno ao zero de cada aba vai para o ensaio dela (como na folha de campo, uma célula por coluna)', () => {
    const { k } = comAjuste()
    const antes = mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, retornoZero: 20 }))
    expect(antes.comoEncontrado?.retornoZero).toBe(20)
    expect(antes.indicacao.retornoZero).toBe(k.indicacao.retornoZero)
    const depois = mudarEnsaioDaAba(k, 'depois', (e) => ({ ...e, retornoZero: -20 }))
    expect(depois.indicacao.retornoZero).toBe(-20)
    expect(depois.comoEncontrado?.retornoZero).toBeNull()
  })

  it('cada aba tem o seu método de carregamento', () => {
    const { k } = comAjuste()
    const r = mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, metodo: 'CONTINUO' }))
    expect(r.comoEncontrado?.metodo).toBe('CONTINUO')
    expect(r.indicacao.metodo).toBe(k.indicacao.metodo)
  })

  it('sem o "como encontrado" (não houve ajuste), muda o ensaio final', () => {
    const { k } = comAjuste()
    const r = mudarEnsaioDaAba({ ...k, comoEncontrado: null }, 'antes', (e) => ({ ...e, retornoZero: 40 }))
    expect(r.indicacao.retornoZero).toBe(40)
    expect(r.comoEncontrado).toBeNull()
  })

  it('com substituição, o retorno ao zero "como encontrado" entra na incerteza desse ensaio', () => {
    const { k, d } = comAjuste()
    const { balanca, padroes } = d.emissao
    const maior = (x: CalibracaoInput) => {
      const r = calcularCalibracao(x, balanca, padroes).comoEncontrado!
      const p = r.pontos.reduce((a, b) => (b.carga > a.carga ? b : a))
      return p.crescente!
    }
    const sem = maior(k)
    const com = maior(mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, retornoZero: 20 })))
    expect(sem.uTempo).toBe(0)
    expect(com.uTempo).toBeGreaterThan(0)
    expect(com.U).toBeGreaterThan(sem.U)
  })
})

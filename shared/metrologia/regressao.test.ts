// Não regressão: com as opções de sempre (sem empuxo MEDIDO, sem convecção e sem os campos novos), o motor dá
// exatamente os números de antes da classe I, em 400 entradas sorteadas de todas as classes (ver o __fixtures__).

import { describe, expect, it } from 'vitest'
import { calcular } from './calculo.ts'
import { entradasDeRegressao, impressaoDigital, impressoesDoMotor, textoEstavel } from './__fixtures__/regressaoMotor.ts'
import gravadas from './__fixtures__/regressaoMotor.json' with { type: 'json' }

/** Entradas que mudaram de propósito depois (a leitura decrescente nas múltiplas faixas), com a impressão nova. */
const faixaDescida = gravadas.faixaDescida.impressoes as Record<string, string>

describe('motor sem os campos da classe I', () => {
  it('as 400 entradas sorteadas dão os mesmos resultados do motor de antes (commit ee52e4a)', () => {
    const hoje = impressoesDoMotor(calcular)
    expect(hoje).toHaveLength(gravadas.impressoes.length)
    const esperadas = gravadas.impressoes.map((h, i) => faixaDescida[String(i)] ?? h)
    const diferentes = hoje.flatMap((h, i) => (h === esperadas[i] ? [] : [i]))
    expect(diferentes, 'entradas com resultado diferente do de antes').toEqual([])
  })

  it('as que mudaram de propósito são só de múltiplas faixas com descida sem descarregar (R76-1 4.10)', () => {
    const entradas = entradasDeRegressao()
    const indices = Object.keys(faixaDescida).map(Number)
    expect(indices.length).toBeGreaterThan(0)
    for (const i of indices) {
      expect(entradas[i].instrumento.tipoFaixas, `entrada ${i}`).toBe('MULTIPLAS_FAIXAS')
      expect(['CRESCENTE_DECRESCENTE', 'DECRESCENTE'], `entrada ${i}`).toContain(entradas[i].indicacao.metodo)
      expect(faixaDescida[String(i)]).not.toBe(gravadas.impressoes[i])
    }
  })

  it('as entradas cobrem todas as classes e opções, e a impressão digital muda com qualquer número', () => {
    const entradas = entradasDeRegressao()
    expect(new Set(entradas.map((e) => e.instrumento.classe))).toEqual(new Set(['I', 'II', 'III', 'IIII', '']))
    expect(new Set(entradas.map((e) => e.opcoes.empuxo))).toEqual(new Set(['AJUSTADO', 'NAO_AJUSTADO', 'DELTA_T', 'NENHUM']))
    expect(entradas.some((e) => e.indicacao.substituicao.ativa)).toBe(true)
    const r = calcular(entradas[0])
    const p = r.pontos.find((x) => x.crescente)!
    const mexido = {
      ...r,
      pontos: r.pontos.map((x) => (x === p ? { ...x, crescente: { ...x.crescente!, U: x.crescente!.U * 1.0001 } } : x)),
    }
    expect(impressaoDigital(textoEstavel(mexido))).not.toBe(impressaoDigital(textoEstavel(r)))
  })
})

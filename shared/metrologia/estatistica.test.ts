import { describe, expect, it } from 'vitest'
import {
  desvioPadrao,
  distribuicaoT,
  fatorAbrangencia,
  media,
  P_95_45,
  quantilNormal,
  quantilT,
  TABELA_G2,
} from './estatistica.ts'

describe('média e desvio-padrão', () => {
  it('calcula a repetibilidade do exemplo de 30 kg (doc §9.2)', () => {
    const leituras = [15000, 15005, 15000, 15000, 15005, 15000]
    expect(media(leituras)).toBeCloseTo(15001.6667, 4)
    expect(desvioPadrao(leituras)).toBeCloseTo(2.581989, 6)
  })

  it('é exata com leituras iguais e indefinida com poucos valores', () => {
    expect(desvioPadrao([10, 10, 10])).toBe(0)
    expect(media([])).toBeNaN()
    expect(desvioPadrao([5])).toBeNaN()
  })
})

describe('quantil da t de Student', () => {
  it('reproduz a Tabela G.2 do GUM a 95,45 % (ν = 1…20, 25, 30, 50, 100) com tolerância de 0,01', () => {
    const linhas = TABELA_G2.filter(([nu]) => nu <= 20 || [25, 30, 50, 100].includes(nu))
    expect(linhas).toHaveLength(24)
    for (const [nu, k] of linhas) expect(Math.abs(quantilT(P_95_45, nu) - k), `ν = ${nu}`).toBeLessThanOrEqual(0.01)
  })

  it('reproduz os k do exemplo de 30 kg (doc §9.6, t exato)', () => {
    expect(quantilT(P_95_45, 8)).toBeCloseTo(2.36642, 5)
    expect(quantilT(P_95_45, 14)).toBeCloseTo(2.19529, 5)
    expect(quantilT(P_95_45, 19)).toBeCloseTo(2.1405, 4)
    expect(quantilT(P_95_45, 105)).toBeCloseTo(2.02409, 5)
  })

  it('é a inversa da distribuição, simétrica e tende à normal', () => {
    for (const nu of [3, 7.5, 40, 900]) expect(distribuicaoT(quantilT(0.9, nu), nu)).toBeCloseTo(0.9, 12)
    expect(quantilT(0.1, 5)).toBeCloseTo(-quantilT(0.9, 5), 12)
    expect(quantilT(0.5, 5)).toBe(0)
    expect(quantilT(0.975, Infinity)).toBeCloseTo(1.959964, 6)
    expect(quantilNormal(P_95_45)).toBeCloseTo(2, 5)
    // continuidade na troca para Cornish-Fisher (ν > 1000)
    expect(Math.abs(quantilT(P_95_45, 1000) - quantilT(P_95_45, 1001))).toBeLessThan(1e-5)
    expect(quantilT(P_95_45, 1e6)).toBeCloseTo(2, 4)
  })
})

describe('fator de abrangência', () => {
  it('T_EXATO trunca ν e usa k = 2 com ν infinito', () => {
    expect(fatorAbrangencia(8.613, 'T_EXATO')).toBeCloseTo(2.36642, 5)
    expect(fatorAbrangencia(Infinity, 'T_EXATO')).toBe(2)
  })

  it('TABELA usa a linha imediatamente inferior da G.2 (convenção do H2)', () => {
    expect(fatorAbrangencia(6.53, 'TABELA')).toBe(2.52)
    expect(fatorAbrangencia(28.02, 'TABELA')).toBe(2.11)
    expect(fatorAbrangencia(43.86, 'TABELA')).toBe(2.06)
    expect(fatorAbrangencia(90, 'TABELA')).toBe(2.05)
    expect(fatorAbrangencia(172, 'TABELA')).toBe(2.025)
    expect(fatorAbrangencia(Infinity, 'TABELA')).toBe(2)
  })

  it('K2 é sempre 2', () => {
    expect(fatorAbrangencia(3, 'K2')).toBe(2)
  })
})

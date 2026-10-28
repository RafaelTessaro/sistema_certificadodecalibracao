// Convecção dos pesos (cg-18 v4.0, Tabela F2.1) e aclimatação (Tabela F1.3). Busca por degrau, para cima, sem
// interpolar; decisão conservadora da empresa (D3): nenhum ΔT registrado fica abaixo da coluna de 1 K.

import { describe, expect, it } from 'vitest'
import {
  conveccaoRelevante,
  DELTA_T_ACLIMATADO,
  deltaMConveccaoMg,
  deltaTAposAclimatacao,
  F13_DEGRAUS,
  F21_DELTA_T,
  TABELA_F13,
  TABELA_F21,
} from './conveccao.ts'

describe('Δm_conv (Tabela F2.1)', () => {
  it('as peças do H1 a 2 K', () => {
    expect(deltaMConveccaoMg(0.2, 2)).toBe(0.14)
    expect(deltaMConveccaoMg(0.02, 2)).toBe(0.02)
    expect(deltaMConveccaoMg(0.1, 2)).toBe(0.08)
    expect(deltaMConveccaoMg(0.05, 2)).toBe(0.05)
  })

  it('degrau para cima: linha de massa ≥ m e coluna de |ΔT| ≥ ΔT', () => {
    expect(deltaMConveccaoMg(0.15, 2.5)).toBe(0.19) // linha 0,2 kg, coluna 3 K
    expect(deltaMConveccaoMg(0.2, 0.4)).toBe(0.08) // coluna 1 K
    expect(deltaMConveccaoMg(0.005, 0.3)).toBe(0.01) // abaixo de 10 g → linha de 10 g
    expect(deltaMConveccaoMg(0.2, -2)).toBe(0.14) // o sinal não importa
    expect(deltaMConveccaoMg(0.2, 1.0000000001)).toBe(0.08) // ruído do binário não sobe de coluna
    expect(deltaMConveccaoMg(50, 20)).toBe(113.23)
  })

  it('D3: |ΔT| de 0,0 °C (ou quase) usa a coluna de 1 K, nunca zero', () => {
    expect(DELTA_T_ACLIMATADO).toBeLessThan(0)
    expect(deltaMConveccaoMg(0.2, 0)).toBe(0.08)
    expect(deltaMConveccaoMg(0.2, 0.04)).toBe(0.08)
    expect(deltaMConveccaoMg(0.1, -0)).toBe(0.05)
  })

  it('massa nula dá zero; fora da tabela (acima de 50 kg ou de 20 K) dá null', () => {
    expect(deltaMConveccaoMg(0, 2)).toBe(0)
    expect(deltaMConveccaoMg(60, 1)).toBeNull()
    expect(deltaMConveccaoMg(0.1, 25)).toBeNull()
  })

  it('a tabela tem 12 linhas crescentes e 8 colunas crescentes em ΔT', () => {
    expect(TABELA_F21).toHaveLength(12)
    expect(F21_DELTA_T).toEqual([1, 2, 3, 5, 7, 10, 15, 20])
    for (const [, linha] of TABELA_F21) {
      expect(linha).toHaveLength(8)
      for (let i = 1; i < linha.length; i++) expect(linha[i]).toBeGreaterThanOrEqual(linha[i - 1])
    }
    for (let i = 1; i < TABELA_F21.length; i++) expect(TABELA_F21[i][0]).toBeGreaterThan(TABELA_F21[i - 1][0])
  })
})

describe('ΔT após a aclimatação (Tabela F1.3, pesos cobertos)', () => {
  it('só desce de degrau quando o tempo inteiro dele já passou', () => {
    // pela F1.2 daria 5 K (exemplo da guia); a F1.3 é mais lenta
    expect(deltaTAposAclimatacao(1, 10, 56.1)).toBe(7)
    expect(deltaTAposAclimatacao(0.2, 10, 60)).toBe(5)
    expect(deltaTAposAclimatacao(0.2, 10, 120)).toBe(2)
    expect(deltaTAposAclimatacao(0.2, 10, 200)).toBe(1)
    expect(deltaTAposAclimatacao(0.1, 5, 30)).toBe(3)
    expect(deltaTAposAclimatacao(0.1, 5, 90)).toBe(1)
    expect(deltaTAposAclimatacao(0.02, 3, 15)).toBe(2)
  })

  it('começa no menor degrau ≥ ΔT0 e nunca fica abaixo de 1 K (D3: 0 também vira 1 K)', () => {
    expect(deltaTAposAclimatacao(0.2, 0.5, 0)).toBe(1)
    expect(deltaTAposAclimatacao(0.2, 0, 0)).toBe(1)
    expect(deltaTAposAclimatacao(0.2, 0, 10_000)).toBe(1)
    expect(deltaTAposAclimatacao(0.2, 6, 0)).toBe(7)
    expect(deltaTAposAclimatacao(0.2, -6, 0)).toBe(7) // pesos que chegam mais frios
    expect(deltaTAposAclimatacao(0.2, 10, 0)).toBe(10)
  })

  it('acima de 20 K fica fora da tabela (ΔT0 de volta); acima de 50 kg usa a linha de 50 kg', () => {
    expect(deltaTAposAclimatacao(0.2, 25, 500)).toBe(25)
    expect(deltaMConveccaoMg(0.2, deltaTAposAclimatacao(0.2, 25, 500))).toBeNull()
    expect(deltaTAposAclimatacao(80, 10, 226.9)).toBe(7)
  })

  it('POP 7.4: de 5 °C a 1 °C, 100 g leva 1 h 20 min e 200 g 1 h 50 min (com os pesos cobertos)', () => {
    expect(deltaTAposAclimatacao(0.1, 5, 78.6)).toBe(2)
    expect(deltaTAposAclimatacao(0.1, 5, 78.7)).toBe(1)
    expect(deltaTAposAclimatacao(0.2, 5, 110.6)).toBe(1)
    expect(TABELA_F13).toHaveLength(12)
    expect(F13_DEGRAUS).toEqual([20, 15, 10, 7, 5, 3, 2, 1])
  })
})

describe('classes em que a convecção entra (só F1 ou melhor)', () => {
  it('E1, E2, F1 e classe desconhecida entram; F2 e M não', () => {
    for (const c of ['E1', 'E2', 'F1', '', undefined] as const) expect(conveccaoRelevante(c)).toBe(true)
    for (const c of ['F2', 'M1', 'M1-2', 'M2', 'M2-3', 'M3'] as const) expect(conveccaoRelevante(c)).toBe(false)
  })
})

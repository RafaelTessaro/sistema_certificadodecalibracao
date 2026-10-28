// Densidade do ar e empuxo com a densidade do ar medida (cg-18 v4.0, Anexo A e 7.1.2.2). Valores esperados
// refeitos à parte (scripts da especificação da classe I e conferência independente em Python).

import { describe, expect, it } from 'vitest'
import {
  correcaoEmpuxoRelativa,
  densidadeAr,
  densidadeArValida,
  INCERTEZA_AR_MEDIDO,
  incertezaRelativaDensidadeAr,
  incertezaRelativaDensidadeArLocal,
  incertezaRelativaEmpuxoMedido,
  linhaTabelaE1,
  RHO_0,
  RHO_C,
  TABELA_E1,
} from './ar.ts'

const relativo = (real: number, esperado: number) => Math.abs(real - esperado) / Math.abs(esperado)

describe('densidade do ar (A1.1-1)', () => {
  it('ar de referência, exemplo H1 e Rio Claro (612 m)', () => {
    expect(densidadeAr(20, 50, 1013.25)).toBeCloseTo(1.199294, 6)
    // O H1 imprime 1,173 (ar seco); a fórmula com 50 % UR dá 1,167 3
    expect(densidadeAr(21, 50, 990)).toBeCloseTo(1.167347, 6)
    expect(densidadeAr(21, 0, 990)).toBeCloseTo(1.1729, 4)
    expect(densidadeAr(23, 60, 941.5)).toBeCloseTo(1.100448, 6)
  })

  it('faixa de validade: 15–27 °C, 20–80 % UR, 600–1 100 hPa (inclusive)', () => {
    expect(densidadeArValida(28, 60, 941.5)).toBe(false)
    expect(densidadeArValida(23, 60, 941.5)).toBe(true)
    expect(densidadeArValida(15, 20, 600)).toBe(true)
    expect(densidadeArValida(27, 80, 1100)).toBe(true)
    expect(densidadeArValida(23, 85, 941.5)).toBe(false)
    expect(densidadeArValida(23, 15, 941.5)).toBe(false)
    expect(densidadeArValida(23, 60, 1101)).toBe(false)
    expect(densidadeArValida(14.9, 60, 941.5)).toBe(false)
  })

  it('incerteza relativa pelas medições (A3-1) e pela variação do local (A3-2)', () => {
    // H1, situação B: u(p) = 0,5 hPa, u(t) = 0,2 K, u(UR) = 1 %
    expect(relativo(incertezaRelativaDensidadeAr(0.5, 0.2, 1), 9.776e-4)).toBeLessThan(1e-3)
    // Constantes do sistema (situação B)
    const { pressaoHpa, temperaturaK, umidadePct } = INCERTEZA_AR_MEDIDO
    expect(relativo(incertezaRelativaDensidadeAr(pressaoHpa, temperaturaK, umidadePct), 2.874e-3)).toBeLessThan(1e-3)
    expect(relativo(incertezaRelativaDensidadeArLocal(0), 1.0344e-2)).toBeLessThan(1e-4)
    expect(relativo(incertezaRelativaDensidadeArLocal(5), 1.1843e-2)).toBeLessThan(1e-4)
    expect(relativo(incertezaRelativaDensidadeArLocal(10), 1.5492e-2)).toBeLessThan(1e-4)
  })
})

describe('empuxo com a densidade do ar medida (7.1.2-4 e 7.1.2-5a)', () => {
  it('correção relativa δm_B/m_N = −(ρa − ρ0)(1/ρ − 1/ρc)', () => {
    expect(relativo(correcaoEmpuxoRelativa(1.173, 7950), 2.1226e-8)).toBeLessThan(1e-4)
    expect(relativo(correcaoEmpuxoRelativa(1.1, 8400), -5.9524e-7)).toBeLessThan(1e-4)
    expect(correcaoEmpuxoRelativa(RHO_0, RHO_C)).toBeCloseTo(0, 15)
    // ar mais leve que o de referência e peso menos denso que 8 000 kg/m³: a massa convencional sobe
    expect(correcaoEmpuxoRelativa(1.1, 7950)).toBeGreaterThan(0)
  })

  it('incerteza relativa (H1: 3,203e-8 publicado com ρa = 1,173)', () => {
    expect(relativo(incertezaRelativaEmpuxoMedido(1.173, 0.014, 7950, 70), 3.1865e-8)).toBeLessThan(1e-4)
    expect(relativo(incertezaRelativaEmpuxoMedido(1.173, 0.014, 7950, 70), 3.203e-8)).toBeLessThan(0.01)
    // Peso de 8 000 kg/m³ no ar de referência: nada a corrigir e nenhuma incerteza
    expect(incertezaRelativaEmpuxoMedido(RHO_0, 0.02, RHO_C, 70)).toBe(0)
  })

  it('Tabela E1: densidades e incertezas padrão dos materiais', () => {
    expect(TABELA_E1.find((m) => m.material === 'Aço inoxidável')).toEqual({ material: 'Aço inoxidável', rho: 7950, u: 70 })
    expect(TABELA_E1).toHaveLength(8)
  })

  it('a linha da Tabela E1 pelo material digitado no cadastro do padrão', () => {
    expect(linhaTabelaE1('Aço inoxidável')?.rho).toBe(7950)
    expect(linhaTabelaE1('aco inox')?.u).toBe(70)
    expect(linhaTabelaE1('Latão cromado')).toEqual({ material: 'Latão / bronze', rho: 8400, u: 85 })
    expect(linhaTabelaE1('Bronze')?.rho).toBe(8400)
    expect(linhaTabelaE1('Ferro fundido')?.material).toBe('Ferro fundido cinzento')
    expect(linhaTabelaE1('Ferro fundido branco')?.u).toBe(200)
    expect(linhaTabelaE1('Ferro')?.rho).toBe(7800)
    expect(linhaTabelaE1('Alumínio')?.rho).toBe(2700)
    expect(linhaTabelaE1('Aço')).toBeNull()
    expect(linhaTabelaE1('')).toBeNull()
  })
})

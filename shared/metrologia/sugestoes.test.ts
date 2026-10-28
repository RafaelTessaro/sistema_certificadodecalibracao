import { describe, expect, it } from 'vitest'
import { cargaExcentricidade, posicoesExcentricidade, repetibilidadeSugerida, sugerirPontos } from './sugestoes.ts'

describe('sugerirPontos', () => {
  it('30 kg / 5 g, classe III: 0/25/50/75/100 % mais 500e e 2000e', () => {
    expect(sugerirPontos({ classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30000, e: 5, d: 5 }] })).toEqual([
      0, 2500, 7500, 10000, 15000, 22500, 30000,
    ])
    expect(sugerirPontos({ classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30, e: 0.005, d: 0.005 }] })).toEqual([
      0, 2.5, 7.5, 10, 15, 22.5, 30,
    ])
  })

  it('60 t / 20 kg, classe III (em kg e em t)', () => {
    expect(sugerirPontos({ classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 60000, e: 20, d: 20 }] })).toEqual([
      0, 10000, 15000, 30000, 40000, 45000, 60000,
    ])
    expect(sugerirPontos({ classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 60, e: 0.02, d: 0.02 }] })).toEqual([
      0, 10, 15, 30, 40, 45, 60,
    ])
  })

  it('sem classe só os percentuais; valores redondos múltiplos de e', () => {
    expect(sugerirPontos({ classe: '', tipoFaixas: 'UNICA', faixas: [{ max: 30000, e: 5, d: 5 }] })).toEqual([
      0, 7500, 15000, 22500, 30000,
    ])
    expect(sugerirPontos({ classe: '', tipoFaixas: 'UNICA', faixas: [{ max: 1500, e: 0.5, d: 0.5 }] })).toEqual([
      0, 375, 750, 1100, 1500,
    ])
  })

  it('multi-intervalo: mudanças de EMA de cada faixa parcial, sem duplicados', () => {
    const pontos = sugerirPontos({
      classe: 'III',
      tipoFaixas: 'MULTI_INTERVALO',
      faixas: [
        { max: 2000, e: 1, d: 1 },
        { max: 5000, e: 2, d: 2 },
        { max: 15000, e: 10, d: 10 },
      ],
    })
    expect(pontos).toEqual([0, 500, 2000, 3750, 4000, 7500, 11000, 15000])
  })
})

describe('cargaExcentricidade (DOQ-CGCRE-097 10.4.1)', () => {
  it('Max/3 até 500 kg, Max/5 até 3000 kg, Max/10 acima, em valor redondo', () => {
    expect(cargaExcentricidade(30, 'kg')).toBe(10)
    expect(cargaExcentricidade(30000, 'g')).toBe(10000)
    expect(cargaExcentricidade(60, 't')).toBe(6)
    expect(cargaExcentricidade(60000, 'kg')).toBe(6000)
    expect(cargaExcentricidade(1500, 'kg')).toBe(300)
    expect(cargaExcentricidade(220, 'g')).toBe(75)
  })
})

describe('posicoesExcentricidade', () => {
  it('rótulos por receptor', () => {
    expect(posicoesExcentricidade('RETANGULAR')).toEqual([
      'Centro',
      'Frente esquerda',
      'Trás esquerda',
      'Trás direita',
      'Frente direita',
    ])
    expect(posicoesExcentricidade('CIRCULAR')).toHaveLength(5)
    expect(posicoesExcentricidade('CIRCULAR')[0]).toBe('Centro')
    expect(posicoesExcentricidade('APOIOS', 6)).toEqual(['Apoio 1', 'Apoio 2', 'Apoio 3', 'Apoio 4', 'Apoio 5', 'Apoio 6'])
    expect(posicoesExcentricidade('TANQUE', 3)).toEqual(['Apoio 1', 'Apoio 2', 'Apoio 3'])
    expect(posicoesExcentricidade('RODOVIARIA', 8)).toEqual([
      'Início (ida)',
      'Meio (ida)',
      'Fim (ida)',
      'Início (volta)',
      'Meio (volta)',
      'Fim (volta)',
    ])
    expect(posicoesExcentricidade('GANCHO')).toEqual([])
  })
})

describe('repetibilidadeSugerida', () => {
  it('~0,5·Max com 5 leituras, ou 3 quando a carga é de 100 kg ou mais', () => {
    expect(repetibilidadeSugerida(30, 'kg')).toEqual({ carga: 15, leituras: 5 })
    expect(repetibilidadeSugerida(30000, 'g')).toEqual({ carga: 15000, leituras: 5 })
    expect(repetibilidadeSugerida(60000, 'kg')).toEqual({ carga: 30000, leituras: 3 })
    expect(repetibilidadeSugerida(200, 'kg')).toEqual({ carga: 100, leituras: 3 })
  })
})

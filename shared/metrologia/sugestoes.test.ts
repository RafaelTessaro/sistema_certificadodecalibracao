import { describe, expect, it } from 'vitest'
import {
  cargaExcentricidade,
  faixasSemRepetibilidade,
  fracaoExcentricidade,
  posicoesExcentricidade,
  referenciasExcentricidade,
  repetibilidadeSugerida,
  repetibilidadesSugeridas,
  sugerirPontos,
} from './sugestoes.ts'

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

describe('cargaExcentricidade (DOQ-CGCRE-097, 10.4)', () => {
  it('Max/3 até 500 kg, Max/5 até 3000 kg, Max/10 acima, em valor redondo', () => {
    expect(cargaExcentricidade(30, 'kg')).toBe(10)
    expect(cargaExcentricidade(30000, 'g')).toBe(10000)
    expect(cargaExcentricidade(60, 't')).toBe(6)
    expect(cargaExcentricidade(60000, 'kg')).toBe(6000)
    expect(cargaExcentricidade(1500, 'kg')).toBe(300)
    expect(cargaExcentricidade(220, 'g')).toBe(75)
    expect(cargaExcentricidade(0, 'kg')).toBe(0)
  })

  it('arredonda PARA CIMA: nunca abaixo da fração (a regra de antes dava 150, 100, 150, 1000 g e 10 t)', () => {
    expect(cargaExcentricidade(500, 'kg')).toBe(200) // mínimo 166,7 kg
    expect(cargaExcentricidade(600, 'kg')).toBe(150) // mínimo 120 kg
    expect(cargaExcentricidade(800, 'kg')).toBe(200) // mínimo 160 kg
    expect(cargaExcentricidade(3200, 'g')).toBe(1500) // mínimo 1 066,7 g
    expect(cargaExcentricidade(120, 't')).toBe(15) // mínimo 12 t
    expect(cargaExcentricidade(120_000, 'kg')).toBe(15_000)
    // Varredura: a sugerida nunca fica abaixo do mínimo nem passa de 1,5 × o mínimo + o passo
    for (const max of [1.5, 3, 6, 15, 30, 60, 100, 150, 220, 300, 333, 500, 501, 750, 1000, 2500, 3000, 3200, 10_000, 80_000]) {
      const { minimo } = fracaoExcentricidade(max, 'kg')
      const c = cargaExcentricidade(max, 'kg')
      expect(c, `Max ${max} kg`).toBeGreaterThanOrEqual(minimo * (1 - 1e-12))
      expect(c, `Max ${max} kg`).toBeLessThanOrEqual(max)
    }
  })

  it('fração do DOQ-CGCRE-097, 10.4 pela capacidade em kg (qualquer unidade)', () => {
    expect(fracaoExcentricidade(500, 'kg')).toEqual({ divisor: 3, minimo: 500 / 3 })
    expect(fracaoExcentricidade(501, 'kg').divisor).toBe(5)
    expect(fracaoExcentricidade(3000, 'kg')).toEqual({ divisor: 5, minimo: 600 })
    expect(fracaoExcentricidade(3.2, 't')).toEqual({ divisor: 10, minimo: 0.32 })
    expect(fracaoExcentricidade(3200, 'g').divisor).toBe(3)
  })
})

describe('referenciasExcentricidade', () => {
  it('receptor comum: a posição 1 (o centro) é a referência de todas', () => {
    expect(referenciasExcentricidade(5)).toEqual([0, 0, 0, 0, 0])
    expect(referenciasExcentricidade(0)).toEqual([])
  })

  it('carga rolante: o meio de cada passagem (ida e volta), como no cg-18 H3', () => {
    expect(referenciasExcentricidade(6, true)).toEqual([1, 1, 1, 4, 4, 4])
    expect(referenciasExcentricidade(3, true)).toEqual([1, 1, 1])
    // Número de posições fora do padrão: uma passagem só, com a referência no meio
    expect(referenciasExcentricidade(5, true)).toEqual([2, 2, 2, 2, 2])
    expect(referenciasExcentricidade(1, true)).toEqual([0])
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

// cg-18 H2: multi-intervalo 12 000 g / 2 g, 30 000 g / 5 g, 60 000 g / 10 g
const H2 = {
  tipoFaixas: 'MULTI_INTERVALO' as const,
  faixas: [
    { max: 12000, e: 2, d: 2 },
    { max: 30000, e: 5, d: 5 },
    { max: 60000, e: 10, d: 10 },
  ],
}

describe('repetibilidadesSugeridas (DOQ-CGCRE-097, 10.3)', () => {
  it('faixa única (ou todas com o mesmo d): um ensaio de ~0,5·Max', () => {
    expect(repetibilidadesSugeridas({ tipoFaixas: 'UNICA', faixas: [{ max: 30, e: 0.005, d: 0.005 }] }, 'kg')).toEqual([
      { carga: 15, leituras: 5 },
    ])
    expect(
      repetibilidadesSugeridas(
        {
          tipoFaixas: 'MULTIPLAS_FAIXAS',
          faixas: [
            { max: 15, e: 0.005, d: 0.005 },
            { max: 30, e: 0.01, d: 0.005 },
          ],
        },
        'kg',
      ),
    ).toEqual([{ carga: 15, leituras: 5 }])
  })

  it('multi-intervalo: um por intervalo, logo abaixo de cada Max_i (o H2 usa 10 000 g e 25 000 g)', () => {
    expect(repetibilidadesSugeridas(H2, 'g').map((x) => x.carga)).toEqual([10000, 25000, 50000])
    // 6/15/33 kg: 5 kg, 14 kg e, no último, ~Max/2 (16,5 kg cai nele)
    expect(
      repetibilidadesSugeridas(
        {
          tipoFaixas: 'MULTI_INTERVALO',
          faixas: [
            { max: 6, e: 0.002, d: 0.002 },
            { max: 15, e: 0.005, d: 0.005 },
            { max: 33, e: 0.01, d: 0.01 },
          ],
        },
        'kg',
      ),
    ).toEqual([
      { carga: 5, leituras: 5 },
      { carga: 14, leituras: 5 },
      { carga: 16.5, leituras: 5 },
    ])
  })

  it('múltiplas faixas: cada carga sugerida fica dentro da sua faixa', () => {
    const faixas = [
      { max: 3, e: 0.001, d: 0.001 },
      { max: 3.5, e: 0.002, d: 0.002 },
      { max: 6, e: 0.005, d: 0.005 },
    ]
    const cargas = repetibilidadesSugeridas({ tipoFaixas: 'MULTIPLAS_FAIXAS', faixas }, 'kg').map((x) => x.carga)
    expect(cargas).toHaveLength(3)
    cargas.forEach((c, i) => {
      expect(c).toBeGreaterThan(i ? faixas[i - 1].max : 0)
      expect(c).toBeLessThanOrEqual(faixas[i].max)
    })
  })
})

describe('faixasSemRepetibilidade', () => {
  it('aponta o intervalo de d diferente sem ensaio (o H2 faz só nos dois primeiros)', () => {
    expect(faixasSemRepetibilidade(H2, [10000, 25000])).toEqual([
      { faixa: { max: 60000, e: 10, d: 10 }, inferior: 30000, sugerida: 50000 },
    ])
    expect(faixasSemRepetibilidade(H2, [10000, 25000, 50000])).toEqual([])
    // Um ensaio só, no meio: faltam o primeiro e o último
    expect(faixasSemRepetibilidade(H2, [30000]).map((x) => x.faixa.d)).toEqual([2, 10])
  })

  it('faixa única: nunca falta (o ensaio de sempre basta)', () => {
    expect(faixasSemRepetibilidade({ tipoFaixas: 'UNICA', faixas: [{ max: 30, e: 0.01, d: 0.01 }] }, [])).toEqual([])
  })
})

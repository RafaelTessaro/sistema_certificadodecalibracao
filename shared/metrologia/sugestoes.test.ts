import { describe, expect, it } from 'vitest'
import {
  cargaExcentricidade,
  excentricidadeAbaixoDoMinimo,
  faixasSemRepetibilidade,
  minimoExcentricidade,
  ondeFaltaRepetibilidade,
  posicoesExcentricidade,
  repetibilidadeSugerida,
  repetibilidadesSugeridas,
  sugerirPontos,
} from './sugestoes.ts'
import { serieDaClasseAtende } from './pesos.ts'

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

  it('Min, quando marcada, entra entre as cargas (POP 7.7); sem duplicar, e só abaixo de Max', () => {
    const plataforma = { classe: 'III' as const, tipoFaixas: 'UNICA' as const, faixas: [{ max: 300, e: 0.05, d: 0.05 }] }
    expect(sugerirPontos(plataforma)).toEqual([0, 25, 75, 100, 150, 225, 300])
    expect(sugerirPontos({ ...plataforma, min: 1 })).toEqual([0, 1, 25, 75, 100, 150, 225, 300])
    // Igual a uma carga já sugerida: uma vez só
    expect(sugerirPontos({ ...plataforma, min: 25 })).toEqual([0, 25, 75, 100, 150, 225, 300])
    expect(sugerirPontos({ ...plataforma, min: 0 })).toEqual([0, 25, 75, 100, 150, 225, 300])
    expect(
      sugerirPontos({
        classe: 'III',
        tipoFaixas: 'MULTI_INTERVALO',
        faixas: [
          { max: 6, e: 0.002, d: 0.002 },
          { max: 15, e: 0.005, d: 0.005 },
          { max: 33, e: 0.01, d: 0.01 },
        ],
        min: 0.04,
      }),
    ).toContain(0.04)
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

  it('classe I: 25, 50 e 75 % de Max em múltiplos de 10 g, montáveis só com peças de 10 g ou mais (POP 6.1)', () => {
    const classeI = (max: number, e: number, unidade?: 'g' | 'mg' | 'kg', min?: number) =>
      sugerirPontos({ classe: 'I', tipoFaixas: 'UNICA', faixas: [{ max, e, d: e / 10 }], unidade, min })
    // 220 g × 0,1 mg (e = 1 mg): 55 g e 165 g pediriam uma peça de 5 g → 60 g (50 + 10) e 160 g (100 + 50 + 10;
    // 170 g = 100 + 50 + 20 passaria de 1/3 do EMA com os pesos E2, ver o teste seguinte)
    expect(classeI(220, 0.001, 'g', 0.01)).toEqual([0, 0.01, 50, 60, 110, 160, 200, 220])
    // 620 g: 310 g = 200 + 100 + 10 (0,52 mg > 0,5 mg) → 300 g; 470 g nem os vizinhos atendem com E2: fica o mais
    // próximo (a folha avisa, com o jogo previsto)
    expect(classeI(620, 0.001, 'g')).toEqual([0, 50, 160, 200, 300, 470, 620])
    // A mesma balança em mg e em kg: as mesmas cargas
    expect(classeI(220_000, 1, 'mg')).toEqual([0, 50_000, 60_000, 110_000, 160_000, 200_000, 220_000])
    expect(classeI(0.22, 0.000001, 'kg')).toEqual([0, 0.05, 0.06, 0.11, 0.16, 0.2, 0.22])
    // Toda carga sugerida (fora a Min, Max e as mudanças de EMA) é múltiplo de 10 g
    for (const p of classeI(220, 0.001, 'g').filter((x) => x > 0 && x < 220 && x !== 50 && x !== 200))
      expect(p % 10, `${p} g`).toBe(0)
    // Max abaixo de 40 g (microbalança): os percentuais de sempre; sem a unidade, também
    expect(classeI(6.1, 0.00001, 'g')).toEqual([0, 0.5, 1.5, 2, 3.05, 4.6, 6.1])
    expect(classeI(220, 0.001)).toEqual([0, 50, 55, 110, 165, 200, 220])
    // Nas outras classes, nada muda
    expect(sugerirPontos({ classe: 'II', tipoFaixas: 'UNICA', faixas: [{ max: 220, e: 0.01, d: 0.001 }], unidade: 'g' })).toEqual(
      [0, 50, 55, 110, 165, 200, 220],
    )
  })

  it('classe I: entre os múltiplos de 10 g mais próximos, o que atende a 6.1 do POP (Σ EMA ≤ 1/3 do EMA; R76 3.7.1)', () => {
    const b220 = {
      classe: 'I' as const,
      tipoFaixas: 'UNICA' as const,
      faixas: [{ max: 220, e: 0.001, d: 0.0001 }],
      unidade: 'g' as const,
    }
    // E2 (R 111-1): 100 g 0,16 mg; 50 g 0,10 mg; 20 g 0,080 mg; 10 g 0,060 mg. EMA OIML inicial em 160 000 e e
    // 170 000 e: 1 mg, 1/3 = 0,333 mg. 170 g = 100 + 50 + 20 dá 0,34 mg; 160 g = 100 + 50 + 10, 0,32 mg
    expect(serieDaClasseAtende(170, b220, 'E2')).toBe(false)
    expect(serieDaClasseAtende(160, b220, 'E2')).toBe(true)
    expect(serieDaClasseAtende(170, b220, 'E1')).toBe(true)
    // No empate (165 g fica a 5 g de 160 g e de 170 g), o mais próximo de sempre (170 g) só fica se atender
    const conferidas: number[] = []
    const comE1 = sugerirPontos(b220, (c) => (conferidas.push(c), serieDaClasseAtende(c, b220, 'E1')))
    expect(comE1).toEqual([0, 50, 60, 110, 170, 200, 220])
    expect(conferidas).toEqual([60, 110, 170])
    // Quem confere diz que não: o seguinte mais próximo que atende (no empate, o menor), até 10 % de Max
    expect(sugerirPontos(b220, (c) => c !== 170)).toEqual([0, 50, 60, 110, 160, 200, 220])
    expect(sugerirPontos(b220, (c) => c !== 170 && c !== 160)).toEqual([0, 50, 60, 110, 150, 200, 220])
    expect(sugerirPontos(b220, (c) => c === 180 || c < 150)).toEqual([0, 50, 60, 110, 180, 200, 220])
    // Nenhum atende (até 10 % de Max): o mais próximo, como antes
    expect(sugerirPontos(b220, (c) => c < 140)).toEqual([0, 50, 60, 110, 170, 200, 220])
    // Quem confere não sabe (null: os pesos não fecham a carga, peça sem classe): a série E2
    expect(sugerirPontos(b220, () => null)).toEqual([0, 50, 60, 110, 160, 200, 220])
    // Nas outras classes, quem confere nem é chamado
    const outras: number[] = []
    sugerirPontos({ ...b220, classe: 'II', faixas: [{ max: 220, e: 0.01, d: 0.001 }] }, (c) => (outras.push(c), false))
    expect(outras).toEqual([])
  })
})

describe('cargaExcentricidade (DOQ-CGCRE-097 10.4.1; POP 7.10)', () => {
  it('1/3 de Max até 500 kg, 1/5 de Max até 3000 kg, 1/10 de Max acima, em valor redondo', () => {
    expect(cargaExcentricidade(30, 'kg')).toBe(10)
    expect(cargaExcentricidade(30000, 'g')).toBe(10000)
    expect(cargaExcentricidade(60, 't')).toBe(6)
    expect(cargaExcentricidade(60000, 'kg')).toBe(6000)
    expect(cargaExcentricidade(1500, 'kg')).toBe(300)
    expect(cargaExcentricidade(220, 'g')).toBe(75)
  })

  it('mínimo da Tabela 5 do POP e a carga copiada abaixo dele (o arredondamento antigo, para o mais próximo)', () => {
    expect(minimoExcentricidade(600, 'kg')).toEqual({ minimo: 120, fracao: '1/5 de Max' })
    expect(minimoExcentricidade(80_000, 'kg')).toEqual({ minimo: 8000, fracao: '1/10 de Max' })
    expect(minimoExcentricidade(500_000, 'g')).toEqual({ minimo: 500_000 / 3, fracao: '1/3 de Max' })
    expect(minimoExcentricidade(0, 'kg')).toEqual({ minimo: 0, fracao: '' })
    const casos: Array<[number, number, boolean]> = [
      [600, 100, true],
      [600, 120, false],
      [200, 65, true],
      [200, 200 / 3, false],
      [32, 10, true],
      [20, 6.5, true],
      [20, 7, false],
      [80_000, 7500, true],
      [80_000, 0, false],
    ]
    for (const [max, carga, abaixo] of casos)
      expect(excentricidadeAbaixoDoMinimo(carga, max, 'kg'), `${carga} de ${max} kg`).toBe(abaixo)
  })

  it('o valor redondo nunca fica abaixo do mínimo da Tabela 5 (arredonda para cima)', () => {
    const casos: Array<[number, number, number]> = [
      // Max (kg), carga sugerida, mínimo
      [20, 7, 20 / 3],
      [33, 15, 11],
      [50, 20, 50 / 3],
      [200, 70, 200 / 3],
      [500, 200, 500 / 3],
      [600, 150, 120],
      [3000, 600, 600],
      [80000, 8000, 8000],
    ]
    for (const [max, carga, minimo] of casos) {
      expect(cargaExcentricidade(max, 'kg'), `Max ${max} kg`).toBe(carga)
      expect(cargaExcentricidade(max, 'kg')).toBeGreaterThanOrEqual(minimo)
    }
    // Nunca acima de Max
    expect(cargaExcentricidade(0.3, 'kg')).toBeLessThanOrEqual(0.3)
  })

  it('classe I: uma peça só, a menor da série 1-2-5 de no mínimo 1/3 de Max (POP 7.11)', () => {
    // 220 g: 1/3 = 73,3 g → 100 g (não 75 g = 50 + 20 + 5 g)
    expect(cargaExcentricidade(220, 'g', 'I')).toBe(100)
    expect(cargaExcentricidade(220, 'g', 'II')).toBe(75)
    expect(cargaExcentricidade(220, 'g')).toBe(75)
    for (const [max, carga] of [
      [200, 100],
      [120, 50],
      [62, 50],
      [320, 200],
      [510, 200],
      [1000, 500],
      [2200, 1000],
    ] as const) {
      expect(cargaExcentricidade(max, 'g', 'I'), `Max ${max} g`).toBe(carga)
      expect(carga).toBeGreaterThanOrEqual(max / 3)
    }
    // Em mg e em kg, a mesma série
    expect(cargaExcentricidade(5100, 'mg', 'I')).toBe(2000)
    expect(cargaExcentricidade(6.2, 'kg', 'I')).toBe(5)
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

describe('repetibilidadesSugeridas (POP 7.9)', () => {
  it('faixa única: um ensaio, a ~0,5·Max', () => {
    expect(repetibilidadesSugeridas({ tipoFaixas: 'UNICA', faixas: [{ max: 300, e: 0.05, d: 0.05 }] }, 'kg')).toEqual([
      { carga: 150, leituras: 3 },
    ])
  })

  it('multi-intervalo: um por intervalo; nos de baixo, logo abaixo do Max deles; no de cima, ~0,5·Max acima de Max₁', () => {
    const balcao = {
      tipoFaixas: 'MULTI_INTERVALO' as const,
      faixas: [
        { max: 6, e: 0.002, d: 0.002 },
        { max: 15, e: 0.005, d: 0.005 },
        { max: 33, e: 0.01, d: 0.01 },
      ],
    }
    expect(repetibilidadesSugeridas(balcao, 'kg')).toEqual([
      { carga: 4.8, leituras: 5 },
      { carga: 12, leituras: 5 },
      { carga: 16.5, leituras: 5 },
    ])
  })

  it('múltiplas faixas: o de cima não coincide com o Max da faixa de baixo (15/30 kg → 12 kg e 25 kg)', () => {
    expect(
      repetibilidadesSugeridas(
        {
          tipoFaixas: 'MULTIPLAS_FAIXAS',
          faixas: [
            { max: 15, e: 0.005, d: 0.005 },
            { max: 30, e: 0.01, d: 0.01 },
          ],
        },
        'kg',
      ),
    ).toEqual([
      { carga: 12, leituras: 5 },
      { carga: 25, leituras: 5 },
    ])
  })

  it('classe I: 10 leituras com uma peça só (POP, Tabela 4), entre metade de Max e Max', () => {
    const unica = (max: number) =>
      repetibilidadesSugeridas({ tipoFaixas: 'UNICA', faixas: [{ max, e: 0.001, d: 0.0001 }], classe: 'I' }, 'g')
    expect(unica(220)).toEqual([{ carga: 200, leituras: 10 }])
    expect(unica(200)).toEqual([{ carga: 100, leituras: 10 }])
    expect(unica(120)).toEqual([{ carga: 100, leituras: 10 }])
    expect(unica(510)).toEqual([{ carga: 500, leituras: 10 }])
    // 450 g: nenhuma peça da série entre 225 g e 450 g; fica a carga de sempre (~metade de Max)
    expect(unica(450)).toEqual([{ carga: 225, leituras: 10 }])
    // Dupla faixa (82/220 g): no intervalo de baixo, a maior peça que cabe nele; no de cima, acima do Max de baixo
    const faixas = [
      { max: 82, e: 0.001, d: 0.00001 },
      { max: 220, e: 0.001, d: 0.0001 },
    ]
    for (const tipoFaixas of ['MULTI_INTERVALO', 'MULTIPLAS_FAIXAS'] as const)
      expect(repetibilidadesSugeridas({ tipoFaixas, faixas, classe: 'I' }, 'g')).toEqual([
        { carga: 50, leituras: 10 },
        { carga: 200, leituras: 10 },
      ])
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

describe('faixasSemRepetibilidade (POP 7.9: um ensaio em cada intervalo ou faixa de d diferente)', () => {
  const multi = {
    tipoFaixas: 'MULTI_INTERVALO' as const,
    faixas: [
      { max: 15, e: 0.01, d: 0.01 },
      { max: 6, e: 0.002, d: 0.002 },
      { max: 33, e: 0.01, d: 0.01 },
    ],
  }
  it('o ensaio cobre o intervalo que comporta a carga; um d repetido conta uma vez (o de maior Max)', () => {
    // 6 kg (d = 2 g) e 15/33 kg (d = 10 g): o de 16,5 kg cobre o d de 10 g
    expect(faixasSemRepetibilidade(multi, [16.5])).toEqual([{ max: 6, e: 0.002, d: 0.002 }])
    expect(faixasSemRepetibilidade(multi, [16.5, 4.8])).toEqual([])
    expect(faixasSemRepetibilidade(multi, [4.8])).toEqual([{ max: 33, e: 0.01, d: 0.01 }])
    expect(faixasSemRepetibilidade(multi, [0])).toHaveLength(2)
    // Faixa única: nunca
    expect(faixasSemRepetibilidade({ tipoFaixas: 'UNICA', faixas: multi.faixas }, [1])).toEqual([])
  })

  it('o texto do aviso: intervalo ou faixa, no singular ou no plural', () => {
    expect(ondeFaltaRepetibilidade('MULTI_INTERVALO', ['até 6 kg'])).toEqual({ onde: 'no intervalo até 6 kg', nome: 'intervalo' })
    expect(ondeFaltaRepetibilidade('MULTI_INTERVALO', ['até 6 kg', 'até 15 kg', 'até 33 kg']).onde).toBe(
      'nos intervalos até 6 kg, até 15 kg e até 33 kg',
    )
    expect(ondeFaltaRepetibilidade('MULTIPLAS_FAIXAS', ['até 6 kg'])).toEqual({ onde: 'na faixa até 6 kg', nome: 'faixa' })
    expect(ondeFaltaRepetibilidade('MULTIPLAS_FAIXAS', ['até 6 kg', 'até 15 kg']).onde).toBe('nas faixas até 6 kg e até 15 kg')
  })
})

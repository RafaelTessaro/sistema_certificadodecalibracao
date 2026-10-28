// EURAMET cg-18 v4.0, Apêndice H1: balança analítica 220 g, d = 0,1 mg, pesos E2 pelo certificado (ρ = 7 950 ±
// 70 kg/m³). Situação A (sem ajuste logo antes) e B (logo após o ajuste interno), com o empuxo estimado (5c/5d/5e)
// e com a densidade do ar medida (5a), com e sem a convecção a ΔT = 2 K. Os valores esperados são os do motor,
// refeitos à parte; onde a guia imprimiu errado, vale o valor corrigido (ver as notas de cada cenário).

import { describe, expect, it } from 'vitest'
import type { OpcoesCalculo } from '../tipos.ts'
import { calcular } from './calculo.ts'
import type { ArCalculo, EntradaCalculo, Orcamento, PecaCalculo, TermicaCalculo } from './tipos.ts'

const peca = (nominal: number, correcao: number, U: number, ema: number): PecaCalculo => ({
  nominal,
  correcao,
  incerteza: U,
  k: 2,
  ema,
  usarCertificado: true,
  quantidade: 1,
  classe: 'E2',
  densidade: 7950,
  uDensidade: 70,
})
const P50 = peca(50, 0, 0.00003, 0.0001)
const P100 = peca(100, -0.0001, 0.00005, 0.00016)
const P200 = peca(200, 0.0001, 0.0001, 0.0003)
const P20 = peca(20, 0, 0.000024, 0.00008)

const OPCOES: OpcoesCalculo = {
  empuxo: 'NAO_AJUSTADO',
  deltaTLocal: 0,
  deriva: 'KD',
  kD: 1.25,
  excentricidade: true,
  metodoK: 'T_EXATO',
  zeroAprovado: false,
  histerese: 'SEPARADO',
  divisaoTeste: 0,
}
const LEITURAS = {
  A: [0, 50.0004, 100.0006, 150.0009, 220.0014],
  B: [0, 50.0, 99.9998, 149.9999, 220.0],
}
const CARGAS: Array<[number, PecaCalculo[]]> = [
  [0, []],
  [50, [P50]],
  [100, [P100]],
  [150, [P100, P50]],
  [220, [P200, P20]],
]

function entrada(
  situacao: 'A' | 'B',
  opcoes: Partial<OpcoesCalculo>,
  extra: { ar?: ArCalculo | null; termica?: TermicaCalculo | null } = {},
): EntradaCalculo {
  return {
    instrumento: { unidade: 'g', classe: 'I', tipoFaixas: 'UNICA', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] },
    opcoes: { ...OPCOES, ...opcoes },
    repetibilidade: [{ id: 'r', carga: 100, leituras: [100.0006, 100.0003, 100.0005, 100.0004, 100.0005] }],
    excentricidade: {
      aplicavel: true,
      carga: 100,
      metodo: 1,
      posicoes: [100.0006, 100.0004, 100.0005, 100.0007, 100.0005].map((leitura, i) => ({
        rotulo: `P${i + 1}`,
        leitura,
        referencia: null,
      })),
    },
    indicacao: {
      metodo: 'DESCONTINUO',
      retornoZero: null,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: CARGAS.map(([carga, pecas], i) => ({
        id: String(carga),
        carga,
        pecas,
        crescente: LEITURAS[situacao][i],
        decrescente: null,
        nivelSubstituicao: 0,
      })),
    },
    conformidade: { solicitada: false, criterio: 'OIML_INICIAL', toleranciaCliente: 0, regra: 'SIMPLES' },
    ...extra,
  }
}

const AR_H1 = (ajustadaAntes: boolean): ArCalculo => ({ temperatura: 21, umidade: 50, pressao: 990, ajustadaAntes })
const DOIS_KELVIN: TermicaCalculo = { deltaT: 2, aclimatacao: null }

/** Tolerâncias: u 1 % ou 1,01 µg; ν 3 % ou ±1,01; k ±0,021; U 1,2 % ou 10,1 µg. */
function conferir(real: number, esperado: number, rel: number, abs: number, rotulo: string) {
  expect(Math.abs(real - esperado), `${rotulo}: obtido ${real}, esperado ${esperado}`).toBeLessThanOrEqual(
    Math.max(abs, rel * Math.abs(esperado)),
  )
}

interface Esperado {
  uMref: number[]
  U: number[]
  uConveccao?: number[]
  nuEff?: number[]
  k?: number[]
}

function cenario(e: EntradaCalculo, esp: Esperado): Orcamento[] {
  const r = calcular(e)
  const orcs = r.pontos.map((p) => p.crescente!)
  orcs.forEach((o, i) => {
    const c = CARGAS[i][0]
    conferir(o.uReferencia, esp.uMref[i], 0.01, 1.01e-6, `${c} g u(m_ref)`)
    conferir(o.U, esp.U[i], 0.012, 1.01e-5, `${c} g U`)
    if (esp.uConveccao) conferir(o.uConveccao, esp.uConveccao[i], 0.01, 1.01e-6, `${c} g u(δm_conv)`)
    if (esp.nuEff) conferir(o.nuEff, esp.nuEff[i], 0.03, 1.01, `${c} g ν_eff`)
    if (esp.k) conferir(o.k, esp.k[i], 0, 0.021, `${c} g k`)
  })
  return orcs
}

describe('cg-18 H1: balança 220 g × 0,1 mg com pesos E2', () => {
  it('1. situação A, empuxo 5d (a guia imprime u(m_ref) a 150 g = 0,001 332: erro dela)', () => {
    const orcs = cenario(entrada('A', { empuxo: 'NAO_AJUSTADO' }), {
      uMref: [0, 0.000448, 0.00089, 0.001338, 0.001963],
      U: [0.00034, 0.00093, 0.0018, 0.00269, 0.00394],
      k: [2.87, 2, 2, 2, 2],
    })
    expect(orcs.every((o) => o.uConveccao === 0 && o.correcaoEmpuxo === 0)).toBe(true)
  })

  it('2. situação A, empuxo 5e com ΔT do local de 5 K', () => {
    cenario(entrada('A', { empuxo: 'DELTA_T', deltaTLocal: 5 }), {
      uMref: [0, 0.000107, 0.000205, 0.000312, 0.000459],
      U: [0.00034, 0.00035, 0.0005, 0.00069, 0.00098],
      nuEff: [4, 17, 85, 338, 1377],
    })
  })

  it('3. situação B, empuxo 5c (EMA de 100 g E2 = 0,16 mg pela R 111:2004; a guia usou 0,15)', () => {
    cenario(entrada('B', { empuxo: 'AJUSTADO' }), {
      uMref: [0, 0.00003, 0.00005, 0.00008, 0.000122],
      U: [0.00034, 0.00032, 0.00033, 0.00036, 0.00044],
    })
  })

  it('4. situação A, densidade do ar medida (A3-2 com 5 K) e convecção a 2 K', () => {
    const e = entrada(
      'A',
      { empuxo: 'MEDIDO', deltaTLocal: 5, conveccao: 'CALCULAR' },
      { ar: AR_H1(false), termica: DOIS_KELVIN },
    )
    const orcs = cenario(e, {
      uMref: [0, 0.000039, 0.000064, 0.000103, 0.000143],
      U: [0.00034, 0.00033, 0.00033, 0.00038, 0.00046],
      uConveccao: [0, 0.000029, 0.000046, 0.000075, 0.000092],
      nuEff: [4.5, 6, 11, 25, 62],
      k: [2.87, 2.52, 2.25, 2.11, 2.04],
    })
    // u(δm_B): ρa = 1,1673 pela A1.1-1 (a guia usou 1,173): 8,3 µg a 220 g contra 7 µg publicados
    const publicado = [0, 0.000002, 0.000003, 0.000005, 0.000007]
    orcs.forEach((o, i) => conferir(o.uEmpuxo, publicado[i], 0, 2e-6, `${CARGAS[i][0]} g u(δm_B)`))
    // A correção δm_B vai para o valor de referência: E muda menos que d/2 em relação ao publicado
    const r = calcular(e)
    expect(r.ar?.densidade).toBeCloseTo(1.1673, 4)
    expect(r.ar?.valida).toBe(true)
    ;[0, 0.0004, 0.0007, 0.001, 0.0013].forEach((E, i) => conferir(orcs[i].erro, E, 0, 0.00005, `${CARGAS[i][0]} g E`))
    expect(orcs[4].correcaoEmpuxo).toBeGreaterThan(0)
    // m_ref = Σ(m_N + δm_c) + δm_B (limpo do ruído em 12 algarismos)
    expect(orcs[4].referencia).toBeCloseTo(220.0001 + orcs[4].correcaoEmpuxo, 9)
    expect(r.pontos[4].texto.erroCrescente).toBe('0,00129')
    expect(r.pendencias).toEqual([])
  })

  it('5. situação B, densidade do ar medida (A3-1 com as incertezas do sistema), sem convecção', () => {
    const orcs = cenario(entrada('B', { empuxo: 'MEDIDO', deltaTLocal: 5 }, { ar: AR_H1(true) }), {
      uMref: [0, 0.000026, 0.000044, 0.0000704, 0.000109],
      U: [0.00034, 0.00032, 0.00033, 0.00036, 0.00043],
    })
    expect(orcs.every((o) => o.uConveccao === 0)).toBe(true)
  })

  it('6. situação B, densidade do ar medida e convecção a 2 K (a guia dividiu u_conv por √3 duas vezes)', () => {
    cenario(
      entrada('B', { empuxo: 'MEDIDO', deltaTLocal: 5, conveccao: 'CALCULAR' }, { ar: AR_H1(true), termica: DOIS_KELVIN }),
      {
        uMref: [0, 0.000039, 0.000064, 0.000103, 0.000143],
        U: [0.00034, 0.00033, 0.00033, 0.00038, 0.00046],
        uConveccao: [0, 0.000029, 0.000046, 0.000075, 0.000092],
      },
    )
  })
})

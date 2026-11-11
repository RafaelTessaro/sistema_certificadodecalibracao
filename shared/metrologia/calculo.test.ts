import { describe, expect, it } from 'vitest'
import type { OpcoesCalculo } from '../tipos.ts'
import { calcular, cargaDaDescida, cargaDaFaixaDecrescente, leituraImplausivel } from './calculo.ts'
import { pesosMinimosSubstituicao } from './sugestoes.ts'
import type { EntradaCalculo, Orcamento, PecaCalculo, PontoCalculo, ResultadoCalculo } from './tipos.ts'

const OPCOES: OpcoesCalculo = {
  empuxo: 'NAO_AJUSTADO',
  deltaTLocal: 0,
  deriva: 'EMA',
  kD: 1,
  excentricidade: true,
  metodoK: 'T_EXATO',
  zeroAprovado: false,
  histerese: 'SEPARADO',
  divisaoTeste: 0,
}

/** Erro relativo (absoluto quando o esperado é 0) dentro da tolerância. */
function perto(real: number, esperado: number, tolerancia: number, rotulo: string) {
  const erro = esperado === 0 ? Math.abs(real) : Math.abs(real - esperado) / Math.abs(esperado)
  expect(erro, `${rotulo}: obtido ${real}, esperado ${esperado}`).toBeLessThanOrEqual(tolerancia)
}

const orc = (o: Orcamento | null): Orcamento => {
  expect(o).not.toBeNull()
  return o as Orcamento
}

const ponto = (
  id: string,
  carga: number,
  pecas: PecaCalculo[],
  crescente: number | null,
  decrescente: number | null = null,
  nivel = 0,
): PontoCalculo => ({
  id,
  carga,
  pecas,
  crescente,
  decrescente,
  nivelSubstituicao: nivel,
})

const posicoes = (leituras: Array<number | null>, referencias: Array<number | null> = []) =>
  leituras.map((leitura, i) => ({ rotulo: `P${i + 1}`, leitura, referencia: referencias[i] ?? null }))

// ---- Exemplo de 30 kg (doc 02, §9): classe III, Max = 30 kg, d = e = 5 g, pesos M1 pelo certificado ----

const certificado = (nominal: number, correcao: number, U: number, ema: number): PecaCalculo => ({
  nominal,
  correcao,
  incerteza: U,
  k: 2,
  ema,
  usarCertificado: true,
  quantidade: 1,
})
const P5A = certificado(5000, 0.035, 0.08, 0.25)
const P5B = certificado(5000, -0.02, 0.08, 0.25)
const P5C = certificado(5000, 0.06, 0.08, 0.25)
const P5D = certificado(5000, -0.045, 0.08, 0.25)
const P10A = certificado(10000, 0.12, 0.16, 0.5)

function exemplo30kg(
  opcoes: Partial<OpcoesCalculo> = {},
  conformidade: Partial<EntradaCalculo['conformidade']> = {},
): EntradaCalculo {
  return {
    instrumento: { unidade: 'g', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30000, e: 5, d: 5 }] },
    opcoes: { ...OPCOES, ...opcoes },
    repetibilidade: [{ id: 'r1', carga: 15000, leituras: [15000, 15005, 15000, 15000, 15005, 15000] }],
    excentricidade: { aplicavel: true, carga: 10000, metodo: 1, posicoes: posicoes([10000, 10005, 10000, 9995, 10005]) },
    indicacao: {
      metodo: 'CRESCENTE_DECRESCENTE',
      retornoZero: 0,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: [
        ponto('0', 0, [], 0, 0),
        ponto('5', 5000, [P5A], 5000, 5005),
        ponto('10', 10000, [P5A, P5B], 10005, 10005),
        ponto('15', 15000, [P5A, P5B, P5C], 15005, 15010),
        ponto('20', 20000, [P5A, P5B, P5C, P5D], 20005, 20010),
        ponto('30', 30000, [P5A, P5B, P5C, P5D, P10A], 30010, 30010),
      ],
    },
    conformidade: { solicitada: false, criterio: 'OIML_INICIAL', toleranciaCliente: 0, regra: 'SIMPLES', ...conformidade },
  }
}

describe('exemplo de 30 kg (doc §9)', () => {
  it('carga crescente reproduz o vetor de teste do §9.12', () => {
    const esperado = [
      { mref: 0, E: 0, uI: 2.95804, umref: 0, uE: 2.95804, nu: 8.613, k: 2.36642, U: 6.99996 },
      { mref: 5000.035, E: -0.035, uI: 3.36959, umref: 0.16952, uE: 3.37386, nu: 14.577, k: 2.19529, U: 7.4066 },
      { mref: 10000.015, E: 4.985, uI: 3.59427, umref: 0.33903, uE: 3.61022, nu: 19.111, k: 2.1405, U: 7.72766 },
      { mref: 15000.075, E: 4.925, uI: 3.94005, umref: 0.50855, uE: 3.97273, nu: 28.023, k: 2.09333, U: 8.31623 },
      { mref: 20000.03, E: 4.97, uI: 4.37845, umref: 0.67806, uE: 4.43064, nu: 43.353, k: 2.05983, U: 9.12639 },
      { mref: 30000.15, E: 9.85, uI: 5.44021, umref: 1.01709, uE: 5.53447, nu: 105.549, k: 2.02409, U: 11.20227 },
    ]
    const r = calcular(exemplo30kg())
    expect(r.pendencias).toEqual([])
    r.pontos.forEach((p, i) => {
      const o = orc(p.crescente)
      const e = esperado[i]
      expect(o.referencia).toBe(e.mref)
      expect(o.erro).toBe(e.E)
      perto(o.uIndicacao, e.uI, 1e-4, `u(I) ${p.id}`)
      perto(o.uReferencia, e.umref, 1e-4, `u(m_ref) ${p.id}`)
      perto(o.uCombinada, e.uE, 1e-4, `u(E) ${p.id}`)
      perto(o.nuEff, e.nu, 1e-4, `ν_eff ${p.id}`)
      perto(o.k, e.k, 1e-3, `k ${p.id}`)
      perto(o.U, e.U, 1e-4, `U ${p.id}`)
    })
    // componentes do ponto de 10 kg (§9.6, conta detalhada)
    const dez = orc(r.pontos[2].crescente)
    perto(dez.uDig0, 1.4434, 1e-4, 'u(dig0)')
    perto(dez.uDigL, 1.4434, 1e-4, 'u(digL)')
    perto(dez.uRep, 2.582, 1e-4, 'u(rep)')
    perto(dez.uEcc, 1.4441, 1e-4, 'u(ecc)')
    perto(dez.uMassa, 0.08, 1e-4, 'u(δm_c)')
    perto(dez.uDeriva, 0.2887, 1e-4, 'u(δm_D)')
    perto(dez.uEmpuxo, 0.1588, 1e-3, 'u(δm_B)')
    // zero: só d0 e s
    const zero = orc(r.pontos[0].crescente)
    expect([zero.uDigL, zero.uEcc, zero.uMassa]).toEqual([0, 0, 0])
    expect(r.maiorU).toBeCloseTo(11.2023, 4)
  })

  it('carga decrescente (§9.6)', () => {
    const esperado = [
      { E: 4.965, uE: 3.374, nu: 14, U: 7.4069 },
      { E: 4.985, uE: 3.6102, nu: 19, U: 7.7277 },
      { E: 9.925, uE: 3.9731, nu: 28, U: 8.317 },
      { E: 9.97, uE: 4.4311, nu: 43, U: 9.1274 },
      { E: 9.85, uE: 5.5345, nu: 105, U: 11.2023 },
    ]
    const r = calcular(exemplo30kg())
    r.pontos.slice(1).forEach((p, i) => {
      const o = orc(p.decrescente)
      expect(o.erro).toBe(esperado[i].E)
      perto(o.uCombinada, esperado[i].uE, 1e-4, `u(E)↓ ${p.id}`)
      expect(Math.floor(o.nuEff)).toBe(esperado[i].nu)
      perto(o.U, esperado[i].U, 1e-4, `U↓ ${p.id}`)
    })
  })

  it('textos do certificado (§9.7)', () => {
    const r = calcular(exemplo30kg())
    const t = r.pontos.map((p) => p.texto)
    expect(t.map((x) => x.erroCrescente)).toEqual(['0,0', '0,0', '5,0', '4,9', '5,0', '10'])
    expect(t.map((x) => x.erroDecrescente)).toEqual(['0,0', '5,0', '5,0', '9,9', '10,0', '10'])
    expect(t.map((x) => x.U)).toEqual(['7,0', '7,4', '7,7', '8,3', '9,1', '11'])
    expect(t.map((x) => x.k)).toEqual(['2,37', '2,20', '2,14', '2,09', '2,06', '2,02'])
    expect(t.map((x) => x.nuEff)).toEqual(['8', '14', '19', '28', '43', '105'])
    expect(t.map((x) => x.crescente)).toEqual(['0', '5000', '10 005', '15 005', '20 005', '30 010'])
    expect(t.map((x) => x.carga)).toEqual(['0', '5000', '10 000', '15 000', '20 000', '30 000'])
    expect(t[1].referencia).toBe('5000,0')
    expect(t.map((x) => x.erroMedio)).toEqual(['', '', '', '', '', ''])
  })

  it('variante MEDIA: indicação média e histerese |I↓ − I↑|/√12 (§9.8)', () => {
    const esperado = [
      { I: 0, E: 0, uE: 2.958, nu: 8, k: 2.3664, U: 7.0, texto: ['0,0', '7,0'] },
      { I: 5002.5, E: 2.465, uE: 3.6697, nu: 20, k: 2.133, U: 7.8276, texto: ['2,5', '7,8'] },
      { I: 10005, E: 4.985, uE: 3.6102, nu: 19, k: 2.1405, U: 7.7277, texto: ['5,0', '7,7'] },
      { I: 15007.5, E: 7.425, uE: 4.227, nu: 35, k: 2.074, U: 8.7668, texto: ['7,4', '8,8'] },
      { I: 20007.5, E: 7.47, uE: 4.66, nu: 53, k: 2.0483, U: 9.5451, texto: ['7,5', '9,5'] },
      { I: 30010, E: 9.85, uE: 5.5345, nu: 105, k: 2.0241, U: 11.2023, texto: ['10', '11'] },
    ]
    const r = calcular(exemplo30kg({ histerese: 'MEDIA' }))
    r.pontos.forEach((p, i) => {
      const o = orc(p.media)
      const e = esperado[i]
      expect(o.indicacao).toBe(e.I)
      expect(o.erro).toBe(e.E)
      perto(o.uCombinada, e.uE, 1e-4, `u(E) média ${p.id}`)
      expect(Math.floor(o.nuEff)).toBe(e.nu)
      perto(o.k, e.k, 1e-3, `k média ${p.id}`)
      perto(o.U, e.U, 1e-4, `U média ${p.id}`)
      expect([p.texto.erroMedio, p.texto.U]).toEqual(e.texto)
    })
    perto(orc(r.pontos[1].media).uHist, 1.4434, 1e-4, 'u(hist) 5 kg')
    expect(orc(r.pontos[2].media).uHist).toBe(0)
  })

  it('MEDIA com uma só leitura usa essa leitura, sem histerese', () => {
    const entrada = exemplo30kg({ histerese: 'MEDIA' })
    entrada.indicacao.pontos[1].decrescente = null
    const o = orc(calcular(entrada).pontos[1].media)
    expect(o.indicacao).toBe(5000)
    expect(o.uHist).toBe(0)
  })

  it('conformidade com os valores como reportados (ilustração do §9.9)', () => {
    const simplesOiml = calcular(exemplo30kg({}, { solicitada: true, criterio: 'OIML_INICIAL', regra: 'SIMPLES' }))
    expect(simplesOiml.pontos.map((p) => p.conformidade)).toEqual([
      'CONFORME',
      'CONFORME',
      'CONFORME',
      'NAO_CONFORME',
      'NAO_CONFORME',
      'NAO_CONFORME',
    ])
    expect(simplesOiml.conformidade).toBe('NAO_CONFORME')
    expect(simplesOiml.pontos.map((p) => p.ema)).toEqual([2.5, 5, 5, 7.5, 7.5, 7.5])
    expect(simplesOiml.pontos[3].texto.ema).toBe('7,5')

    const simplesBr = calcular(exemplo30kg({}, { solicitada: true, criterio: 'PORTARIA_VERIFICACAO', regra: 'SIMPLES' }))
    expect(simplesBr.conformidade).toBe('CONFORME')

    const banda = calcular(exemplo30kg({}, { solicitada: true, criterio: 'PORTARIA_SERVICO', regra: 'BANDA_GUARDA' }))
    expect(banda.pontos.map((p) => p.conformidade)).toEqual([
      'CONFORME',
      'CONFORME',
      'CONFORME',
      'CONFORME',
      'CONFORME',
      'NAO_CONFORME',
    ])
    expect(banda.conformidade).toBe('NAO_CONFORME')

    const bandaOiml = calcular(exemplo30kg({}, { solicitada: true, criterio: 'OIML_SERVICO', regra: 'BANDA_GUARDA' }))
    expect(bandaOiml.pontos[0].conformidade).toBe('NAO_CONFORME')

    const cliente = calcular(
      exemplo30kg({}, { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 25, regra: 'BANDA_GUARDA' }),
    )
    expect(cliente.conformidade).toBe('CONFORME')

    const semPedido = calcular(exemplo30kg())
    expect(semPedido.conformidade).toBeNull()
    expect(semPedido.pontos.every((p) => p.ema === null && p.conformidade === null && p.texto.ema === '')).toBe(true)
  })

  it('opções: k pela tabela, k = 2, sem excentricidade, zero aprovado, divisão de teste', () => {
    const tabela = orc(calcular(exemplo30kg({ metodoK: 'TABELA' })).pontos[3].crescente)
    expect(tabela.k).toBe(2.11)
    perto(tabela.U, 8.3825, 1e-4, 'U tabela 15 kg')

    const k2 = orc(calcular(exemplo30kg({ metodoK: 'K2' })).pontos[2].crescente)
    perto(k2.U, 7.2204, 1e-4, 'U k=2 10 kg')

    const semEcc = orc(calcular(exemplo30kg({ excentricidade: false })).pontos[5].crescente)
    expect(semEcc.uEcc).toBe(0)

    const aprovado = orc(calcular(exemplo30kg({ zeroAprovado: true })).pontos[0].crescente)
    perto(aprovado.uDig0, 5 / (4 * Math.sqrt(3)), 1e-12, 'u(dig0) aprovado')

    const teste = calcular(exemplo30kg({ divisaoTeste: 1 }))
    perto(orc(teste.pontos[2].crescente).uDigL, 1 / Math.sqrt(12), 1e-12, 'u(digL) com d_T')
    perto(orc(teste.pontos[2].crescente).uDig0, 1 / Math.sqrt(12), 1e-12, 'u(dig0) com d_T')
    expect(teste.avisos.some((a) => a.mensagem.includes('resolução aumentada'))).toBe(true)
  })
})

// ---- H2/A da cg-18 (doc §10.1): multi-intervalo 12/30/60 kg, d = 2/5/10 g, pesos F2 pelo nominal ----

describe('cg-18 H2, situação A (colunas 0 a 40 kg)', () => {
  // Pesos pelo nominal (u = mpe/√3) e deriva D = mpe/2. A deriva entra como `deriva: 'KD'` com kD = 0,5 e
  // U = mpe na peça: D = kD·U = mpe/2. Com usarCertificado = false o U não entra em u(δm_c) (que fica mpe/√3).
  const f2 = (nominal: number, mpe: number, quantidade = 1): PecaCalculo => ({
    nominal,
    correcao: 0,
    incerteza: mpe,
    k: 2,
    ema: mpe,
    usarCertificado: false,
    quantidade,
  })
  const entrada: EntradaCalculo = {
    instrumento: {
      unidade: 'g',
      classe: 'III',
      tipoFaixas: 'MULTI_INTERVALO',
      faixas: [
        { max: 12000, e: 2, d: 2 },
        { max: 30000, e: 5, d: 5 },
        { max: 60000, e: 10, d: 10 },
      ],
    },
    opcoes: { ...OPCOES, deriva: 'KD', kD: 0.5, metodoK: 'TABELA' },
    repetibilidade: [
      { id: 'r10', carga: 10000, leituras: [9998, 10000, 9998, 10000, 10000] },
      { id: 'r25', carga: 25000, leituras: [24995, 25000, 24995, 24995, 25000] },
    ],
    excentricidade: { aplicavel: true, carga: 20000, metodo: 1, posicoes: posicoes([20000, 20005, 20000, 19995, 20000]) },
    indicacao: {
      metodo: 'DESCONTINUO',
      retornoZero: null,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: [
        ponto('0', 0, [], 0),
        ponto('10', 10000, [f2(10000, 0.16)], 10000),
        ponto('20', 20000, [f2(20000, 0.3)], 19995),
        ponto('40', 40000, [f2(20000, 0.3, 2)], 39990),
      ],
    },
    conformidade: { solicitada: false, criterio: 'OIML_INICIAL', toleranciaCliente: 0, regra: 'SIMPLES' },
  }
  const publicado = [
    { E: 0, uDigL: 0, uEcc: 0, uI: 1.238, uMassa: 0, uDeriva: 0, uEmpuxo: 0, uRef: 0, uE: 1.238, nu: 6, k: 2.52, U: 3.12 },
    {
      E: 0,
      uDigL: 0.577,
      uEcc: 0.722,
      uI: 1.545,
      uMassa: 0.092,
      uDeriva: 0.046,
      uEmpuxo: 0.11,
      uRef: 0.151,
      uE: 1.552,
      nu: 16,
      k: 2.17,
      U: 3.369,
    },
    {
      E: -5,
      uDigL: 1.443,
      uEcc: 1.443,
      uI: 3.464,
      uMassa: 0.173,
      uDeriva: 0.087,
      uEmpuxo: 0.217,
      uRef: 0.29,
      uE: 3.476,
      nu: 10,
      k: 2.28,
      U: 7.926,
    },
    {
      E: -10,
      uDigL: 2.887,
      uEcc: 2.887,
      uI: 4.95,
      uMassa: 0.346,
      uDeriva: 0.173,
      uEmpuxo: 0.433,
      uRef: 0.581,
      uE: 4.984,
      nu: 43,
      k: 2.06,
      U: 10.266,
    },
  ]

  it('reproduz os valores publicados (0,5 %)', () => {
    const r = calcular(entrada)
    expect(r.repetibilidade.map((x) => Number(x.s.toFixed(3)))).toEqual([1.095, 2.739])
    r.pontos.forEach((p, i) => {
      const o = orc(p.crescente)
      const e = publicado[i]
      expect(o.erro).toBe(e.E)
      // os componentes publicados têm 3 casas: tolerância de 0,5 % ou meia unidade da última casa
      const componente = (real: number, esperado: number, rotulo: string) =>
        expect(Math.abs(real - esperado), `${rotulo} ${p.id}: ${real} ≠ ${esperado}`).toBeLessThanOrEqual(
          Math.max(0.005 * esperado, 0.0005),
        )
      componente(o.uDigL, e.uDigL, 'u(digL)')
      componente(o.uEcc, e.uEcc, 'u(ecc)')
      componente(o.uMassa, e.uMassa, 'u(δm_c)')
      componente(o.uDeriva, e.uDeriva, 'u(δm_D)')
      componente(o.uEmpuxo, e.uEmpuxo, 'u(δm_B)')
      perto(o.uIndicacao, e.uI, 0.005, `u(I) ${p.id}`)
      perto(o.uReferencia, e.uRef, 0.005, `u(m_ref) ${p.id}`)
      perto(o.uCombinada, e.uE, 0.005, `u(E) ${p.id}`)
      expect(Math.floor(o.nuEff), `ν_eff ${p.id}`).toBe(e.nu)
      expect(o.k, `k ${p.id}`).toBe(e.k)
      perto(o.U, e.U, 0.005, `U ${p.id}`)
    })
  })
})

// ---- H3/A da cg-18 (doc §10.2): rodoviária 30 t, d = 10 kg (d_T = 1 kg), substituição ----------------

describe('cg-18 H3, situação A (cargas de substituição)', () => {
  const m1 = (quantidade: number): PecaCalculo => ({
    nominal: 1000,
    correcao: 0,
    incerteza: 0,
    k: 2,
    ema: 0.05,
    usarCertificado: false,
    quantidade,
  })
  const entrada = (): EntradaCalculo => ({
    instrumento: { unidade: 'kg', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30000, e: 10, d: 10 }] },
    opcoes: { ...OPCOES, divisaoTeste: 1 },
    // s = 6,753 kg (ν = 5); o H3 publica 6,74 kg
    repetibilidade: [{ id: 'r', carga: 10000, leituras: [9996, 10004, 9993, 10007, 9993, 10007] }],
    excentricidade: { aplicavel: true, carga: 10420, metodo: 1, posicoes: posicoes([10420, 10425, 10435, 10410, 10420]) },
    indicacao: {
      metodo: 'CONTINUO',
      retornoZero: 4,
      substituicao: {
        ativa: true,
        pecas: [m1(10)],
        etapas: [
          { leituraPadroes: 10010, leituraSubstituicao: 10010 },
          { leituraPadroes: 20018, leituraSubstituicao: 20028 },
        ],
      },
      pontos: [
        ponto('0', 0, [], 0),
        ponto('5000', 5000, [m1(5)], 5002),
        ponto('10000', 10000, [m1(10)], 10010),
        ponto('15000', 15000, [m1(5)], 15015, null, 1),
        ponto('20000', 20000, [m1(10)], 20018, null, 1),
        ponto('25010', 25010, [m1(5)], 25035, null, 2),
        ponto('30010', 30010, [m1(10)], 30040, null, 2),
      ],
    },
    conformidade: { solicitada: false, criterio: 'OIML_INICIAL', toleranciaCliente: 0, regra: 'SIMPLES' },
  })

  it('u(L_sub) = 11,28 e 19,02; u(E) a 15 000 kg = 14,60 (1 %)', () => {
    const r = calcular(entrada())
    expect(r.pendencias).toEqual([])
    const p = Object.fromEntries(r.pontos.map((x) => [x.id, orc(x.crescente)]))
    perto(p['15000'].uSubstituicao, 11.28, 0.01, 'u(L_sub1)')
    perto(p['20000'].uSubstituicao, 11.28, 0.01, 'u(L_sub1) a 20 t')
    perto(p['25010'].uSubstituicao, 19.02, 0.01, 'u(L_sub1 + L_sub2)')
    perto(p['15000'].uCombinada, 14.6, 0.01, 'u(E) 15 000')
    // demais colunas publicadas
    const uE = { '0': 6.75, '5000': 7.08, '10000': 7.98, '20000': 15.64, '25010': 22.79, '30010': 23.85 }
    for (const [id, v] of Object.entries(uE)) perto(p[id].uCombinada, v, 0.01, `u(E) ${id}`)
    const uI = { '0': 6.75, '5000': 7.08, '10000': 7.97, '15000': 9.27, '20000': 10.82, '25010': 12.54, '30010': 14.38 }
    for (const [id, v] of Object.entries(uI)) perto(p[id].uIndicacao, v, 0.01, `u(I) ${id}`)
    perto(p['15000'].uReferencia, 0.22, 0.01, 'u(m_ref,k) 15 000')
    perto(p['10000'].uReferencia, 0.44, 0.01, 'u(m_ref) 10 000')
    // L_T e erros
    expect(r.pontos.map((x) => x.referencia)).toEqual([0, 5000, 10000, 15000, 20000, 25010, 30010])
    expect(Object.values(p).map((o) => o.erro)).toEqual([0, 2, 10, 15, 18, 25, 30])
    // termo de tempo |E0|/(Max·√3) e ν_eff só com a repetibilidade direta
    perto(p['5000'].uTempo, (5002 * 4) / (30000 * Math.sqrt(3)), 1e-12, 'u(tempo)')
    expect(p['0'].uTempo).toBe(0)
    perto(p['15000'].nuEff, p['15000'].uCombinada ** 4 / (p['15000'].uRep ** 4 / 5), 1e-12, 'ν_eff 15 000')
    expect(r.erroRetornoZero).toBe(4)
  })

  it('pesos padrão por etapa abaixo da massa mínima com substituição (regra da empresa, fora do POP): aviso', () => {
    // Os milhares com espaço fino, como no certificado: comparados com espaço comum
    const minimoSub = (r: ReturnType<typeof calcular>) =>
      r.avisos
        .filter((a) => a.mensagem.startsWith('Cargas de substituição com'))
        .map((a) => ({ ...a, mensagem: a.mensagem.replace(/[\u00A0\u2009\u202F]/g, ' ') }))
    // 10 000 kg por etapa com Max de 30 t: acima dos 5000 kg exigidos
    expect(minimoSub(calcular(entrada()))).toEqual([])
    const poucos = entrada()
    poucos.indicacao.substituicao.pecas = [m1(4)]
    const r = calcular(poucos)
    expect(minimoSub(r)).toEqual([
      {
        nivel: 'atencao',
        mensagem:
          'Cargas de substituição com 4000 kg de pesos padrão em cada etapa: para Max de 30 000 kg, o mínimo é 5000 kg (regra da empresa).',
      },
    ])
    // O POP-CAL-01 não cobre as rodoviárias: o aviso não remete a ele (a Tabela 7 do POP é a da etiqueta)
    expect(r.avisos.map((a) => a.mensagem).join(' ')).not.toMatch(/Tabela 7|POP 7\.12/)
    expect(pesosMinimosSubstituicao(999)).toBe(0)
    expect([1000, 5000, 5001, 30_000, 60_000, 80_000, 80_001].map(pesosMinimosSubstituicao)).toEqual([
      1000, 1000, 5000, 5000, 10_000, 15_000, 20_000,
    ])
  })

  it('com substituição, o retorno ao zero entra na incerteza (I·|E0|/(Max·√3)); sem ele anotado, o termo some', () => {
    const maiorU = (retornoZero: number | null) => {
      const e = entrada()
      e.indicacao.retornoZero = retornoZero
      const r = calcular(e)
      return { r, p: orc(r.pontos.find((x) => x.id === '30010')!.crescente) }
    }
    const sem = maiorU(null)
    const com = maiorU(4)
    const maior = maiorU(-40)
    expect(sem.p.uTempo).toBe(0)
    expect(sem.r.erroRetornoZero).toBeNull()
    perto(com.p.uTempo, (30040 * 4) / (30000 * Math.sqrt(3)), 1e-12, 'u(tempo) 4 kg (indicação 30 040)')
    // O sinal não importa; quanto maior o retorno, maior a incerteza
    perto(maior.p.uTempo, (30040 * 40) / (30000 * Math.sqrt(3)), 1e-12, 'u(tempo) −40 kg')
    expect(com.p.U).toBeGreaterThan(sem.p.U)
    expect(maior.p.U).toBeGreaterThan(com.p.U)
    // Sem substituição, o retorno ao zero não entra no orçamento
    const e = entrada()
    e.indicacao.substituicao.ativa = false
    e.indicacao.pontos = e.indicacao.pontos.filter((x) => x.nivelSubstituicao === 0)
    expect(calcular(e).pontos.every((x) => orc(x.crescente).uTempo === 0)).toBe(true)
  })

  it('substituição sem as leituras de uma etapa vira pendência do ponto', () => {
    const e = entrada()
    e.indicacao.substituicao.etapas[1].leituraSubstituicao = null
    const r = calcular(e)
    expect(r.pontos.find((x) => x.id === '25010')?.crescente).toBeNull()
    expect(r.pontos.find((x) => x.id === '15000')?.crescente).not.toBeNull()
    expect(r.pendencias.some((x) => x.includes('etapa 2'))).toBe(true)
  })
})

// ---- Regras do motor ----------------------------------------------------------------------------

describe('regras do cálculo', () => {
  it('pendências: sem leituras de indicação, sem repetibilidade e excentricidade sem leituras', () => {
    const e = exemplo30kg()
    e.repetibilidade = [{ id: 'r', carga: 15000, leituras: [15000, null] }]
    e.excentricidade.posicoes = posicoes([null, null, null, null, null])
    e.indicacao.pontos = e.indicacao.pontos.map((p) => ({ ...p, crescente: null, decrescente: null }))
    const r = calcular(e)
    expect(r.pendencias).toHaveLength(3)
    expect(r.pendencias.join(' ')).toMatch(/Repetibilidade/)
    expect(r.pendencias.join(' ')).toMatch(/nenhuma leitura/)
    expect(r.pendencias.join(' ')).toMatch(/Excentricidade/)
    expect(r.repetibilidade[0]).toMatchObject({ n: 1, s: 0, nu: 0 })
    expect(r.pontos.every((p) => p.crescente === null && p.texto.U === '')).toBe(true)
  })

  it('instrumento sem faixas', () => {
    const e = exemplo30kg()
    e.instrumento.faixas = []
    const r = calcular(e)
    expect(r.pontos).toEqual([])
    expect(r.pendencias[0]).toMatch(/Instrumento/)
  })

  it('repetibilidade: ignora leituras nulas e usa o maior s dos dois ensaios que envolvem a carga', () => {
    const e = exemplo30kg()
    e.repetibilidade = [
      { id: 'a', carga: 5000, leituras: [5000, 5005, 5000, null, 5005, 5000] },
      { id: 'b', carga: 15000, leituras: [15000, 15000, 15000, 15000, 15000] },
      { id: 'c', carga: 30000, leituras: [30000, 30010, 30000, 30010, 30000] },
    ]
    const r = calcular(e)
    expect(r.repetibilidade[0]).toMatchObject({ n: 5, nu: 4, amplitude: 5, media: 5002 })
    const s = r.repetibilidade.map((x) => x.s)
    expect(orc(r.pontos[0].crescente).uRep).toBe(s[0]) // abaixo de todos: o primeiro
    expect(orc(r.pontos[2].crescente).uRep).toBe(s[0]) // entre 5 e 15 kg: o maior dos dois
    expect(orc(r.pontos[3].crescente).uRep).toBe(0) // exatamente no ensaio de 15 kg (s = 0)
    expect(orc(r.pontos[3].crescente).nuEff).toBe(Infinity)
    expect(orc(r.pontos[4].crescente).uRep).toBe(s[2]) // entre 15 e 30 kg
    expect(orc(r.pontos[5].crescente).uRep).toBe(s[2])
  })

  it('excentricidade: métodos 3 e 4', () => {
    const e = exemplo30kg()
    e.excentricidade = {
      aplicavel: true,
      carga: 10000,
      metodo: 3,
      posicoes: posicoes([10000, 10010, 10000, 10005, 10000], [0, 5, 0, -5, 0]),
    }
    const m3 = calcular(e).excentricidade
    expect(m3.desvios).toEqual([0, 5, 0, 10, 0])
    expect(m3).toMatchObject({ maiorDesvio: 10, posicaoMaior: 3 })
    perto(m3.incertezaRelativa, 10 / (2 * 10000 * Math.sqrt(3)), 1e-12, 'u_rel ecc')

    e.excentricidade = { aplicavel: true, carga: 10000, metodo: 4, posicoes: posicoes([0, 5, -5, 0, 0], [null, 0, 0, 5, null]) }
    expect(calcular(e).excentricidade.desvios).toEqual([0, 5, -5, -5, 0])
  })

  it('excentricidade não aplicável fica fora do orçamento', () => {
    const e = exemplo30kg()
    e.excentricidade = { aplicavel: false, carga: 0, metodo: 1, posicoes: [] }
    const r = calcular(e)
    expect(r.excentricidade).toMatchObject({ aplicavel: false, incertezaRelativa: 0 })
    expect(orc(r.pontos[5].crescente).uEcc).toBe(0)
    expect(r.pendencias).toEqual([])
  })

  it('múltiplas faixas: d da menor faixa que comporta a carga', () => {
    const e = exemplo30kg()
    e.instrumento = {
      unidade: 'g',
      classe: 'III',
      tipoFaixas: 'MULTIPLAS_FAIXAS',
      faixas: [
        { max: 15000, e: 2, d: 2 },
        { max: 30000, e: 5, d: 5 },
      ],
    }
    const r = calcular(e)
    perto(orc(r.pontos[3].crescente).uDigL, 2 / Math.sqrt(12), 1e-12, 'd a 15 kg')
    perto(orc(r.pontos[4].crescente).uDigL, 5 / Math.sqrt(12), 1e-12, 'd a 20 kg')
    perto(orc(r.pontos[0].crescente).uDig0, 2 / Math.sqrt(12), 1e-12, 'd0')
  })

  it('empuxo (5c, 5d, 5e) e deriva kD·U com pesos pequenos (cg-18 H1, 50 g E2)', () => {
    const pecaE2: PecaCalculo = {
      nominal: 50,
      correcao: 0,
      incerteza: 0.00003,
      k: 2,
      ema: 0.0001,
      usarCertificado: true,
      quantidade: 1,
    }
    const entrada = (opcoes: Partial<OpcoesCalculo>): EntradaCalculo => ({
      instrumento: { unidade: 'g', classe: 'I', tipoFaixas: 'UNICA', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] },
      opcoes: { ...OPCOES, deriva: 'KD', kD: 1.25, ...opcoes },
      repetibilidade: [{ id: 'r', carga: 100, leituras: [100, 100.0001, 100, 100.0002, 100.0001] }],
      excentricidade: { aplicavel: false, carga: 0, metodo: 1, posicoes: [] },
      indicacao: {
        metodo: 'DESCONTINUO',
        retornoZero: null,
        substituicao: { ativa: false, pecas: [], etapas: [] },
        pontos: [ponto('50', 50, [pecaE2], 50.0001)],
      },
      conformidade: { solicitada: false, criterio: 'OIML_INICIAL', toleranciaCliente: 0, regra: 'SIMPLES' },
    })
    const nao = orc(calcular(entrada({ empuxo: 'NAO_AJUSTADO' })).pontos[0].crescente)
    perto(nao.uMassa, 0.000015, 1e-9, 'u(δm_c)')
    perto(nao.uDeriva, 0.000022, 0.02, 'u(δm_D) kD = 1,25')
    perto(nao.uEmpuxo, 0.000447, 0.002, 'u(δm_B) 5d')
    expect(nao.erro).toBe(0.0001)
    perto(
      orc(calcular(entrada({ empuxo: 'DELTA_T', deltaTLocal: 5 })).pontos[0].crescente).uEmpuxo,
      0.000103,
      0.005,
      'u(δm_B) 5e',
    )
    perto(orc(calcular(entrada({ empuxo: 'AJUSTADO' })).pontos[0].crescente).uEmpuxo, 0.0001 / (4 * Math.sqrt(3)), 1e-9, '5c')
    expect(orc(calcular(entrada({ empuxo: 'NENHUM' })).pontos[0].crescente).uEmpuxo).toBe(0)
    // D = EMA quando o critério é EMA, ou quando a peça não tem U
    perto(orc(calcular(entrada({ deriva: 'EMA' })).pontos[0].crescente).uDeriva, 0.0001 / Math.sqrt(3), 1e-9, 'D = EMA')
  })

  it('avisos: poucos pontos, faixa parcial, leitura implausível, carga sem padrões, classe dos pesos e U < d', () => {
    const m2 = (nominal: number, ema: number): PecaCalculo => ({
      nominal,
      correcao: 0,
      incerteza: 0,
      k: 2,
      ema,
      usarCertificado: false,
      quantidade: 1,
    })
    const e = exemplo30kg({ excentricidade: false })
    e.repetibilidade = [{ id: 'r', carga: 15000, leituras: [15000, 15000, 15000] }]
    e.indicacao.pontos = [
      ponto('0', 0, [], 0),
      ponto('5', 5000, [], 50000),
      ponto('25', 25000, [m2(20000, 3), m2(5000, 0.8)], 25000),
    ]
    const r = calcular(e)
    const texto = r.avisos.map((a) => `${a.nivel}: ${a.mensagem}`).join('\n')
    expect(texto).toMatch(/atencao: Repetibilidade a 15\u00a0000 g: 3 leitura\(s\); o mínimo é 5/)
    expect(texto).toMatch(/atencao: Erro de indicação com 3 ponto\(s\)/)
    expect(texto).toMatch(/atencao: A maior carga ensaiada \(25\u00a0000 g\) é menor que 90 %/)
    expect(texto).toMatch(/erro: Leitura\(s\) mais de 10 % fora da carga.*50\u00a0000 em 5000 g/)
    expect(texto).toMatch(/atencao: Carga sem padrões em 5000 g/)
    expect(texto).toMatch(/atencao: Classe dos pesos insuficiente em 25\u00a0000 g/)
    // s = 0 de só 3 leituras (o mínimo é 5): suspeito, com destaque
    expect(texto).toMatch(/atencao: U menor que a divisão em 0 g; 5000 g: resultado suspeito/)
    // a referência do ponto sem padrões é a carga digitada
    expect(r.pontos[1].referencia).toBe(5000)
  })

  it('avisos de excentricidade e de repetibilidade com carga ≥ 100 kg', () => {
    const e = exemplo30kg()
    e.excentricidade.carga = 2000
    const r = calcular(e)
    expect(r.avisos).toContainEqual({
      nivel: 'atencao',
      mensagem:
        'Carga de excentricidade (2000 g) abaixo do mínimo da Tabela 5 do POP (1/3 de Max, com Max de 30\u00a0000 g): use ≥ 10\u00a0000 g.',
    })
    e.excentricidade.carga = 30000
    expect(calcular(e).avisos.map((a) => a.mensagem)).not.toContainEqual(expect.stringMatching(/^Carga de excentricidade/))
    // Bem acima da sugerida (mais de 3 vezes): só informação
    const grande = exemplo30kg()
    // 3000 kg: 1/5 de Max = 600 kg sugeridos; 2000 kg é mais de 3 vezes isso
    grande.instrumento = { ...grande.instrumento, faixas: [{ max: 3_000_000, e: 500, d: 500 }] }
    grande.excentricidade.carga = 2_000_000
    expect(calcular(grande).avisos.find((a) => a.mensagem.includes('muito diferente da sugerida'))?.nivel).toBe('info')

    const pesada = exemplo30kg()
    pesada.instrumento = { unidade: 'kg', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 3000, e: 1, d: 1 }] }
    pesada.repetibilidade = [{ id: 'r', carga: 1500, leituras: [1500, 1501, 1500] }]
    expect(calcular(pesada).avisos.some((a) => a.mensagem.startsWith('Repetibilidade a 1500 kg'))).toBe(false)
  })

  it('carga de excentricidade abaixo do mínimo da Tabela 5 do POP (copiada de um certificado antigo): atenção', () => {
    // Max, carga copiada (o arredondamento antigo ia para o mais próximo, também para baixo) e a sugerida
    const casos: Array<[number, number, number, string, string]> = [
      [600, 0.2, 100, '1/5 de Max', '150,0 kg'],
      [200, 1, 65, '1/3 de Max', '70 kg'],
      [32, 1, 10, '1/3 de Max', '15 kg'],
      [20, 0.5, 6.5, '1/3 de Max', '7,0 kg'],
      [80_000, 20, 7500, '1/10 de Max', '8000 kg'],
    ]
    const aviso = (max: number, d: number, carga: number) => {
      const e = exemplo30kg()
      e.instrumento = { unidade: 'kg', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max, e: d, d }] }
      e.excentricidade.carga = carga
      return calcular(e)
        .avisos.filter((a) => a.mensagem.startsWith('Carga de excentricidade'))
        .map((a) => ({ ...a, mensagem: a.mensagem.replace(/[\u00A0\u2009\u202F]/g, ' ') }))
    }
    for (const [max, d, carga, fracao, sugerida] of casos) {
      const [a, ...outros] = aviso(max, d, carga)
      expect(outros, `${max} kg`).toEqual([])
      expect(a, `${max} kg`).toMatchObject({ nivel: 'atencao' })
      expect(a.mensagem).toMatch(
        new RegExp(`abaixo do mínimo da Tabela 5 do POP \\(${fracao}, com Max de .+\\): use ≥ ${sugerida}\\.$`),
      )
    }
    // No mínimo ou acima: nada (1/5 de 600 kg = 120 kg; 1/3 de 200 kg = 66,67 kg)
    expect(aviso(600, 0.2, 120)).toEqual([])
    expect(aviso(200, 1, 200 / 3)).toEqual([])
    expect(aviso(200, 1, 70)).toEqual([])
    expect(aviso(80_000, 20, 8000)).toEqual([])
  })

  it('multi-intervalo e múltiplas faixas: menos ensaios de repetibilidade que intervalos de d diferente, atenção', () => {
    const doisIntervalos = (tipoFaixas: 'MULTI_INTERVALO' | 'MULTIPLAS_FAIXAS', cargas: number[]) => {
      const e = exemplo30kg()
      e.instrumento = {
        unidade: 'g',
        classe: 'III',
        tipoFaixas,
        faixas: [
          { max: 15000, e: 5, d: 5 },
          { max: 30000, e: 10, d: 10 },
        ],
      }
      e.repetibilidade = cargas.map((carga, i) => ({ id: `r${i}`, carga, leituras: [carga, carga, carga, carga, carga] }))
      return calcular(e)
        .avisos.filter((a) => a.mensagem.startsWith('Repetibilidade:'))
        .map((a) => ({ ...a, mensagem: a.mensagem.replace(/[\u00A0\u2009\u202F]/g, ' ') }))
    }
    // O ensaio único copiado do último certificado (no intervalo de cima): falta o de baixo
    expect(doisIntervalos('MULTI_INTERVALO', [15500])).toEqual([
      {
        nivel: 'atencao',
        mensagem:
          'Repetibilidade: 1 ensaio para 2 intervalos; falta no intervalo até 15 000 g (d = 5 g). O POP (7.9) pede um ensaio em cada intervalo de d diferente.',
      },
    ])
    expect(doisIntervalos('MULTIPLAS_FAIXAS', [12000])[0].mensagem).toBe(
      'Repetibilidade: 1 ensaio para 2 faixas; falta na faixa até 30 000 g (d = 10 g). O POP (7.9) pede um ensaio em cada faixa de d diferente.',
    )
    // Um em cada: nada; dois no mesmo intervalo: ainda falta o outro
    expect(doisIntervalos('MULTI_INTERVALO', [12000, 25000])).toEqual([])
    expect(doisIntervalos('MULTI_INTERVALO', [20000, 25000])).toHaveLength(1)
    // Sem ensaio nenhum: a pendência já diz (sem este aviso); faixa única: nunca
    expect(doisIntervalos('MULTI_INTERVALO', [])).toEqual([])
    expect(calcular(exemplo30kg()).avisos.some((a) => a.mensagem.startsWith('Repetibilidade:'))).toBe(false)
  })

  it('k = 2 fixo com menos de 10 leituras gera atenção', () => {
    const r = calcular(exemplo30kg({ metodoK: 'K2' }))
    expect(r.avisos.find((a) => a.mensagem.includes('k = 2 fixo'))?.nivel).toBe('atencao')
  })

  it('conformidade sem EMA (balança sem classe) é pendência', () => {
    const e = exemplo30kg({}, { solicitada: true, criterio: 'OIML_INICIAL' })
    e.instrumento.classe = ''
    const r = calcular(e)
    expect(r.conformidade).toBeNull()
    expect(r.pendencias.some((p) => p.startsWith('Conformidade'))).toBe(true)
  })

  describe('U menor que a divisão: informativo quando as leituras se repetem de verdade', () => {
    const m1 = (nominal: number, ema: number): PecaCalculo => ({
      nominal,
      correcao: 0,
      incerteza: 0,
      k: 2,
      ema,
      usarCertificado: false,
      quantidade: 1,
    })
    /**
     * O caso real do dono: Toledo Prix IV DUE, multi-intervalo 6/15/30 kg, e = d = 2/5/10 g, classe III; só a subida
     * (1, 2, 5, 10, 20 e 30 kg); repetibilidade um ensaio por intervalo com 5 leituras iguais; excentricidade toda igual.
     */
    function prix(): EntradaCalculo {
      const pecas = (kg: number) => [m1(kg, kg * 0.00005)]
      return {
        instrumento: {
          unidade: 'kg',
          classe: 'III',
          tipoFaixas: 'MULTI_INTERVALO',
          faixas: [
            { max: 6, e: 0.002, d: 0.002 },
            { max: 15, e: 0.005, d: 0.005 },
            { max: 30, e: 0.01, d: 0.01 },
          ],
        },
        opcoes: OPCOES,
        repetibilidade: [
          { id: 'r5', carga: 5, leituras: [4.998, 4.998, 4.998, 4.998, 4.998] },
          { id: 'r10', carga: 10, leituras: [9.995, 9.995, 9.995, 9.995, 9.995] },
          { id: 'r20', carga: 20, leituras: [19.99, 19.99, 19.99, 19.99, 19.99] },
        ],
        excentricidade: { aplicavel: true, carga: 10, metodo: 1, posicoes: posicoes([9.995, 9.995, 9.995, 9.995, 9.995]) },
        indicacao: {
          metodo: 'CONTINUO',
          retornoZero: null,
          substituicao: { ativa: false, pecas: [], etapas: [] },
          pontos: [
            ponto('1', 1, pecas(1), 1),
            ponto('2', 2, pecas(2), 2),
            ponto('5', 5, pecas(5), 4.998),
            ponto('10', 10, pecas(10), 9.995),
            ponto('20', 20, pecas(20), 19.99),
            ponto('30', 30, pecas(30), 29.99),
          ],
        },
        conformidade: { solicitada: false, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'BANDA_GUARDA' },
      }
    }
    const avisoUd = (e: EntradaCalculo) =>
      calcular(e)
        .avisos.filter((a) => a.mensagem.startsWith('U menor que a divisão'))
        .map((a) => ({ ...a, mensagem: a.mensagem.replace(/[\u00A0\u2009\u202F]/g, ' ') }))

    it('caso real (Prix 6/15/30 kg): s = 0 com 5 leituras e excentricidade sem desvio → só informação', () => {
      const r = calcular(prix())
      expect(r.repetibilidade.map((x) => x.s)).toEqual([0, 0, 0])
      expect(r.excentricidade.maiorDesvio).toBe(0)
      expect(avisoUd(prix())).toEqual([
        {
          nivel: 'info',
          mensagem:
            'U menor que a divisão em 1,000 kg; 2,000 kg; 5,000 kg; 10,000 kg; 20,00 kg; 30,00 kg: normal quando as leituras se repetem exatamente; confira se a divisão (d) está certa.',
        },
      ])
      expect(r.avisos.some((a) => a.mensagem.includes('suspeito'))).toBe(false)
    })

    it('s = 0 com poucas leituras (3 numa carga < 100 kg) → suspeito, com atenção', () => {
      const e = prix()
      e.repetibilidade = e.repetibilidade.map((x) => ({ ...x, leituras: x.leituras.slice(0, 3) }))
      const [a] = avisoUd(e)
      expect(a.nivel).toBe('atencao')
      expect(a.mensagem).toMatch(/: resultado suspeito; confira a repetibilidade \(s = 0\?\) e a divisão\.$/)
    })

    it('só um intervalo com poucas leituras basta (é o s usado nos pontos dele)', () => {
      const e = prix()
      e.repetibilidade[2] = { ...e.repetibilidade[2], leituras: [19.99, 19.99, 19.99] }
      expect(avisoUd(e)[0].nivel).toBe('atencao')
    })

    it('sem repetibilidade nenhuma (s = 0 por falta de ensaio) → suspeito', () => {
      const e = prix()
      e.repetibilidade = []
      expect(avisoUd(e)[0]).toMatchObject({ nivel: 'atencao', mensagem: expect.stringContaining('resultado suspeito') })
    })

    it('divisão que parece errada (leituras que não são múltiplas do d cadastrado) → suspeito', () => {
      const e = prix()
      // d cadastrado 10 g em toda a faixa, mas a balança indicou 4,998 kg (passo de 2 g)
      e.instrumento = { ...e.instrumento, faixas: e.instrumento.faixas.map((f) => ({ ...f, e: 0.01, d: 0.01 })) }
      expect(avisoUd(e)[0].nivel).toBe('atencao')
      // No intervalo de 5 g, 9,996 kg não é múltiplo de 5 g
      const f = prix()
      f.indicacao.pontos[3] = ponto('10', 10, [m1(10, 0.0005)], 9.996)
      expect(avisoUd(f)[0].nivel).toBe('atencao')
    })

    it('classe I: 5 leituras iguais ainda são poucas (o mínimo é 10)', () => {
      const e = prix()
      e.instrumento = { ...e.instrumento, classe: 'I' }
      expect(avisoUd(e)[0].nivel).toBe('atencao')
      e.repetibilidade = e.repetibilidade.map((x) => ({ ...x, leituras: Array.from({ length: 10 }, () => x.leituras[0]) }))
      expect(avisoUd(e)[0].nivel).toBe('info')
    })

    it('com o modo de serviço, a divisão conferida é a de teste', () => {
      const e = prix()
      e.opcoes = { ...OPCOES, divisaoTeste: 0.001 }
      // Leituras de 1 g em 1 g: múltiplas de d_T (U < d_T nas cargas pequenas, onde os pesos quase não pesam) → informativo
      expect(avisoUd(e)).toEqual([expect.objectContaining({ nivel: 'info' })])
      // Uma leitura com meio grama: não é múltipla nem da divisão de teste → suspeito
      e.indicacao.pontos[1] = ponto('2', 2, [m1(2, 0.0001)], 2.0005)
      expect(avisoUd(e)).toEqual([expect.objectContaining({ nivel: 'atencao' })])
    })
  })
})

// ---- Repetibilidade: ensaio sem leituras não conta como feito (POP 7.9) ----------------------------------

describe('repetibilidade: ensaio copiado sem leituras', () => {
  const avisosRep = (ensaios: Array<{ carga: number; leituras: Array<number | null> }>) => {
    const e = exemplo30kg()
    e.instrumento = {
      unidade: 'g',
      classe: 'III',
      tipoFaixas: 'MULTI_INTERVALO',
      faixas: [
        { max: 15000, e: 5, d: 5 },
        { max: 30000, e: 10, d: 10 },
      ],
    }
    e.repetibilidade = ensaios.map((r, i) => ({ id: `r${i}`, ...r }))
    const r = calcular(e)
    return {
      avisos: r.avisos
        .filter((a) => /^Repetibilidade( a |:)/.test(a.mensagem))
        .map((a) => `${a.nivel}: ${a.mensagem.replace(/[\u00A0\u2009\u202F]/g, ' ')}`),
      pendencias: r.pendencias,
    }
  }
  const cinco = (c: number) => [c, c + 5, c, c, c + 5]
  const faltaDeCima =
    'atencao: Repetibilidade: 1 ensaio para 2 intervalos; falta no intervalo até 30 000 g (d = 10 g). O POP (7.9) pede um ensaio em cada intervalo de d diferente.'

  it('o ensaio de cima sem leituras: falta o intervalo dele e o aviso para registrar ou remover', () => {
    expect(
      avisosRep([
        { carga: 10000, leituras: cinco(10000) },
        { carga: 25000, leituras: [null, null, null] },
      ]).avisos,
    ).toEqual(['atencao: Repetibilidade a 25 000 g: sem leituras; registre as leituras ou remova o ensaio.', faltaDeCima])
  })

  it('o de cima com 1 leitura: não vale (n < 2) e falta o intervalo dele', () => {
    const { avisos } = avisosRep([
      { carga: 10000, leituras: cinco(10000) },
      { carga: 25000, leituras: [25010] },
    ])
    expect(avisos).toContain(faltaDeCima)
    expect(avisos.join('\n')).toMatch(/Repetibilidade a 25 000 g: 1 leitura\(s\); o mínimo é 5/)
  })

  it('os dois com leituras: nenhum dos avisos; todos vazios: só a pendência', () => {
    expect(
      avisosRep([
        { carga: 10000, leituras: cinco(10000) },
        { carga: 25000, leituras: cinco(25000) },
      ]).avisos,
    ).toEqual([])
    const vazio = avisosRep([
      { carga: 10000, leituras: [null, null, null, null, null] },
      { carga: 25000, leituras: [null, null, null, null, null] },
    ])
    expect(vazio.avisos).toEqual([])
    expect(vazio.pendencias[0]).toMatch(/^Repetibilidade: registre pelo menos 2 leituras/)
  })
})

// ---- Pesos sem EMA conhecido (sem a classe R111): a deriva, o empuxo e o nominal dependem dele -----------

describe('pesos sem EMA conhecido', () => {
  const semClasse = (extra: Partial<PecaCalculo> = {}): PecaCalculo => ({
    nominal: 10000,
    correcao: 0.1,
    incerteza: 0.16,
    k: 2,
    ema: 0,
    usarCertificado: true,
    quantidade: 1,
    classe: '',
    jogo: 'JP-B',
    ...extra,
  })
  /** A calibração nova (`regrasDoPop`); `legado`: o registro de antes das regras (a revisão de um certificado 1.0.2). */
  const calc = (peca: PecaCalculo, opcoes: Partial<OpcoesCalculo> = {}, legado = false) => {
    const e = exemplo30kg(opcoes)
    if (!legado) e.regrasDoPop = true
    // Os 5 pontos do POP (7.7); os de 5 kg e 20 kg com os pesos M1 do exemplo
    e.indicacao.pontos = [
      ponto('0', 0, [], 0, 0),
      ponto('5', 5000, [P5A], 5000, 5005),
      ponto('10', 10000, [peca], 10000, 10005),
      ponto('20', 20000, [P5A, P5B, P5C, P5D], 20005, 20010),
      ponto('30', 30000, [{ ...peca, quantidade: 3 }], 30005, 30005),
    ]
    return calcular(e)
  }
  const pendencia =
    'Pesos sem EMA conhecido (OIML R 111): o jogo JP-B está sem a classe. O EMA entra na incerteza dos pesos (deriva, empuxo ou valor nominal); confira a classe no cadastro do padrão.'
  const semEspacoFino = (avisos: ResultadoCalculo['avisos']) =>
    avisos.map((a) => ({ ...a, mensagem: a.mensagem.replace(/[\u00A0\u2009\u202F]/g, ' ') }))
  const naoConferida = {
    nivel: 'atencao',
    mensagem: 'Classe dos pesos não conferida em 10 000 g; 30 000 g: pesos sem a classe OIML R 111 (R76 3.7.1).',
  }
  const semIncertezaAviso = {
    nivel: 'atencao',
    mensagem: 'Pesos sem incerteza conhecida (classe ou U do certificado) em 10 000 g; 30 000 g.',
  }

  it('pelo certificado e sem a classe, com a deriva pelo EMA (o padrão): pendência', () => {
    const r = calc(semClasse())
    expect(r.pendencias).toEqual([pendencia])
    // Com a classe, nada
    expect(calc(semClasse({ classe: 'M1', ema: 0.5 })).pendencias).toEqual([])
  })

  it('deriva kD·U e sem o empuxo estimado: o EMA não entra; só o aviso de que a classe não foi conferida', () => {
    const r = calc(semClasse(), { deriva: 'KD', empuxo: 'NENHUM' })
    expect(r.pendencias).toEqual([])
    const avisos = r.avisos.map((a) => ({ ...a, mensagem: a.mensagem.replace(/[\u00A0\u2009\u202F]/g, ' ') }))
    expect(avisos).toContainEqual({
      nivel: 'atencao',
      mensagem: 'Classe dos pesos não conferida em 10 000 g; 30 000 g: pesos sem a classe OIML R 111 (R76 3.7.1).',
    })
    // Deriva kD·U, mas o empuxo estimado usa o EMA (5d): pendência
    expect(calc(semClasse(), { deriva: 'KD' }).pendencias).toEqual([pendencia])
  })

  it('pelo nominal sem a classe (ou pelo certificado sem U): uma pendência só', () => {
    expect(calc(semClasse({ usarCertificado: false, incerteza: 0, correcao: 0 })).pendencias).toEqual([pendencia])
  })

  it('nominal sem EMA na classe do jogo', () => {
    const r = calc(semClasse({ classe: 'M1-2' }))
    expect(r.pendencias.map((p) => p.replace(/[\u00A0\u2009\u202F]/g, ' '))).toEqual([
      'Pesos sem EMA conhecido (OIML R 111): a peça de 10 000 g do jogo JP-B não tem EMA na classe M1-2. O EMA entra na incerteza dos pesos (deriva, empuxo ou valor nominal); confira a classe no cadastro do padrão.',
    ])
  })

  it('peça sem nenhuma incerteza (certificado sem U e com EMA): pendência', () => {
    const r = calc(semClasse({ classe: 'M1', ema: 0.5, incerteza: 0 }))
    expect(r.pendencias.map((p) => p.replace(/[\u00A0\u2009\u202F]/g, ' '))).toEqual([
      'Pesos sem incerteza conhecida (classe ou U do certificado) em 10 000 g; 30 000 g.',
    ])
  })

  // Registro de antes das regras do POP (a revisão de um certificado emitido na 1.0.1/1.0.2, sem `regrasDoPop`): as
  // exigências da época. Sem pendência nova (a revisão que só corrige o endereço sai com os mesmos números); só avisos
  describe('no registro de antes das regras (revisão de um certificado 1.0.2): avisos, como na época', () => {
    it('pelo certificado e sem a classe: sem pendência, a classe dos pesos não conferida; os mesmos números', () => {
      const legado = calc(semClasse(), {}, true)
      expect(legado.pendencias).toEqual([])
      expect(semEspacoFino(legado.avisos)).toContainEqual(naoConferida)
      expect(legado.avisos.map((a) => a.mensagem).join('\n')).not.toMatch(/Pesos sem EMA conhecido/)
      // Os números são os da calibração nova (o EMA que falta não muda o cálculo; só a exigência)
      expect(legado.pontos.map((p) => p.texto.U)).toEqual(calc(semClasse()).pontos.map((p) => p.texto.U))
      // A mesma entrada com as regras do POP: a pendência
      expect(calc(semClasse()).pendencias).toEqual([pendencia])
    })

    it('pelo nominal sem a classe: o aviso de antes (sem incerteza conhecida), nunca pendência', () => {
      const nominal = semClasse({ usarCertificado: false, incerteza: 0, correcao: 0 })
      const legado = calc(nominal, {}, true)
      expect(legado.pendencias).toEqual([])
      expect(semEspacoFino(legado.avisos)).toEqual(expect.arrayContaining([semIncertezaAviso, naoConferida]))
      expect(calc(nominal).pendencias).toEqual([pendencia])
    })

    it('certificado sem U e com a classe: o aviso de antes no lugar da pendência', () => {
      const semU = semClasse({ classe: 'M1', ema: 0.5, incerteza: 0 })
      const legado = calc(semU, {}, true)
      expect(legado.pendencias).toEqual([])
      expect(semEspacoFino(legado.avisos)).toContainEqual(semIncertezaAviso)
      expect(calc(semU).pendencias).toHaveLength(1)
    })
  })
})

// ---- Múltiplas faixas: a descida sem descarregar continua na faixa maior (R76-1 4.10) ----------------------

describe('múltiplas faixas: leituras decrescentes na faixa da maior carga', () => {
  const P = (kg: number): PecaCalculo => ({
    nominal: kg,
    correcao: 0,
    incerteza: 0,
    k: 2,
    ema: (0.0005 * kg) / 10,
    usarCertificado: false,
    quantidade: 1,
    classe: 'M1',
  })
  function entrada(
    tipoFaixas: EntradaCalculo['instrumento']['tipoFaixas'],
    opcoes: Partial<OpcoesCalculo> = {},
    desce = 3.005,
    metodo: EntradaCalculo['indicacao']['metodo'] = 'CRESCENTE_DECRESCENTE',
  ): EntradaCalculo {
    return {
      instrumento: {
        unidade: 'kg',
        classe: 'III',
        tipoFaixas,
        faixas: [
          { max: 6, e: 0.001, d: 0.001 },
          { max: 15, e: 0.005, d: 0.005 },
        ],
      },
      opcoes: { ...OPCOES, ...opcoes },
      repetibilidade: [
        { id: 'r1', carga: 5, leituras: [5, 5.001, 5, 5, 5.001] },
        { id: 'r2', carga: 10, leituras: [10, 10.005, 10, 10, 10] },
      ],
      excentricidade: { aplicavel: false, carga: 0, metodo: 1, posicoes: [] },
      indicacao: {
        metodo,
        retornoZero: 0,
        substituicao: { ativa: false, pecas: [], etapas: [] },
        pontos: [
          ponto('0', 0, [], 0, 0),
          ponto('3', 3, [P(2), P(1)], 3.001, metodo === 'DESCONTINUO' ? null : desce),
          ponto('6', 6, [P(5), P(1)], 6.001, metodo === 'DESCONTINUO' ? null : 6.005),
          ponto('10', 10, [P(10)], 10.005, metodo === 'DESCONTINUO' ? null : 10.005),
          ponto('15', 15, [P(10), P(5)], 15.005, metodo === 'DESCONTINUO' ? null : 15.005),
        ],
      },
      conformidade: { solicitada: true, criterio: 'OIML_INICIAL', toleranciaCliente: 0, regra: 'SIMPLES' },
    }
  }
  const raiz12 = Math.sqrt(12)

  it('↓ abaixo de Max1 com o d e o e da faixa 2; ↑ pela carga (faixa 1)', () => {
    const r = calcular(entrada('MULTIPLAS_FAIXAS'))
    const tres = r.pontos[1]
    perto(orc(tres.decrescente).uDigL, 0.005 / raiz12, 1e-12, 'u(d_L) ↓')
    perto(orc(tres.crescente).uDigL, 0.001 / raiz12, 1e-12, 'u(d_L) ↑')
    expect(tres.ema).toBe(0.0015)
    expect(tres.emaDecrescente).toBe(0.005)
    expect(tres.texto.emaDecrescente).toBe('0,005')
    expect(tres.conformidade).toBe('CONFORME')
    // 6 kg = Max1: a subida ainda na faixa 1; a descida na 2
    perto(orc(r.pontos[2].decrescente).uDigL, 0.005 / raiz12, 1e-12, 'u(d_L) ↓ 6 kg')
    perto(orc(r.pontos[2].crescente).uDigL, 0.001 / raiz12, 1e-12, 'u(d_L) ↑ 6 kg')
    // Acima de Max1, as duas na faixa 2 (sem EMA da descida à parte)
    expect(r.pontos[3].emaDecrescente).toBeUndefined()
    expect(r.conformidade).toBe('CONFORME')
  })

  it('histerese pela média: o d maior (o da faixa 2)', () => {
    const r = calcular(entrada('MULTIPLAS_FAIXAS', { histerese: 'MEDIA' }))
    perto(orc(r.pontos[1].media).uDigL, 0.005 / raiz12, 1e-12, 'u(d_L) média')
  })

  it('↓ 3,003 não é múltiplo do d da faixa 2: U < d com o aviso de atenção', () => {
    const r = calcular(entrada('MULTIPLAS_FAIXAS', {}, 3.003))
    expect(r.avisos.find((a) => a.mensagem.startsWith('U menor que a divisão'))).toMatchObject({
      nivel: 'atencao',
      mensagem: expect.stringMatching(/resultado suspeito/),
    })
  })

  it('multi-intervalo (d pela indicação) e múltiplas faixas sem descida: como antes', () => {
    const multi = calcular(entrada('MULTI_INTERVALO'))
    perto(orc(multi.pontos[1].decrescente).uDigL, 0.001 / raiz12, 1e-12, 'multi-intervalo ↓')
    expect(multi.pontos[1].emaDecrescente).toBeUndefined()
    const descontinuo = calcular(entrada('MULTIPLAS_FAIXAS', {}, 3.005, 'DESCONTINUO'))
    perto(orc(descontinuo.pontos[1].crescente).uDigL, 0.001 / raiz12, 1e-12, 'descontínuo ↑')
    expect(descontinuo.pontos[1].decrescente).toBeNull()
  })

  describe('leitura fora do esperado: a descida pelo e da faixa em que foi lida', () => {
    /** Min de 0,020 kg (20 e da faixa 1) lido na subida e na descida, na calibração nova. */
    const comMin = (sobe: number, desce: number, opcoes: Partial<OpcoesCalculo> = {}) => {
      const e = entrada('MULTIPLAS_FAIXAS', opcoes)
      e.regrasDoPop = true
      e.indicacao.pontos.splice(1, 0, ponto('min', 0.02, [P(0.02)], sobe, desce))
      return calcular(e).pendencias.filter((p) => p.includes('fora do esperado'))
    }
    it('1 d da faixa 2 na descida do Min (histerese no retorno): nada; a tela pinta igual', () => {
      expect(comMin(0.02, 0.025)).toEqual([])
      expect(comMin(0.02, 0.03)).toEqual([])
    })
    it('a vírgula errada na descida continua pendência', () => {
      expect(comMin(0.02, 0.25)).toEqual([
        'Erro de indicação, ponto de 0,020 kg: leitura 0,250 fora do esperado; confira a digitação.',
      ])
    })
    it('a subida é lida na faixa 1: 0,025 no Min continua pendência', () => {
      expect(comMin(0.025, 0.02)).toEqual([
        'Erro de indicação, ponto de 0,020 kg: leitura 0,025 fora do esperado; confira a digitação.',
      ])
    })
    it('com a divisão de teste (cada leitura na faixa da carga): a regra de antes', () => {
      expect(comMin(0.02, 0.025, { divisaoTeste: 0.0001 })).toEqual([
        'Erro de indicação, ponto de 0,0200 kg: leitura 0,0250 fora do esperado; confira a digitação.',
      ])
    })
    it('a faixa da descida: a maior carga lida, só nas múltiplas faixas com descida e sem divisão de teste', () => {
      const e = entrada('MULTIPLAS_FAIXAS')
      const { instrumento } = e
      const pontos = e.indicacao.pontos
      expect(cargaDaDescida(instrumento, 'CRESCENTE_DECRESCENTE', 0, pontos)).toBe(15)
      expect(cargaDaDescida(instrumento, 'DECRESCENTE', 0, pontos)).toBe(15)
      // O ponto de 15 kg sem leitura: a maior lida
      const sem15 = pontos.map((p) => (p.carga === 15 ? { ...p, crescente: null, decrescente: null } : p))
      expect(cargaDaDescida(instrumento, 'CRESCENTE_DECRESCENTE', 0, sem15)).toBe(10)
      expect(cargaDaDescida(instrumento, 'CONTINUO', 0, pontos)).toBeNull()
      expect(cargaDaDescida(instrumento, 'CRESCENTE_DECRESCENTE', 0.0001, pontos)).toBeNull()
      expect(cargaDaDescida({ ...instrumento, tipoFaixas: 'MULTI_INTERVALO' }, 'CRESCENTE_DECRESCENTE', 0, pontos)).toBeNull()
      expect(cargaDaDescida(instrumento, 'CRESCENTE_DECRESCENTE', 0, [])).toBeNull()
      // A faixa de cada leitura decrescente: a maior carga; no zero (receptor vazio), a própria
      expect(cargaDaFaixaDecrescente(0.02, 15)).toBe(15)
      expect(cargaDaFaixaDecrescente(0, 15)).toBe(0)
      expect(cargaDaFaixaDecrescente(0.02, null)).toBe(0.02)
      // leituraImplausivel com a carga da faixa: o e da faixa 2 (5 g), os 10 % sobre a carga
      expect(leituraImplausivel(0.025, 0.02, instrumento)).toBe(true)
      expect(leituraImplausivel(0.025, 0.02, instrumento, 15)).toBe(false)
      expect(leituraImplausivel(0.035, 0.02, instrumento, 15)).toBe(true)
    })
  })

  it('só descendo: todas as leituras na faixa da maior carga, e o EMA delas', () => {
    const e = entrada('MULTIPLAS_FAIXAS', {}, 3.005, 'DECRESCENTE')
    e.indicacao.pontos = e.indicacao.pontos.map((p) => ({ ...p, crescente: null }))
    const r = calcular(e)
    perto(orc(r.pontos[1].decrescente).uDigL, 0.005 / raiz12, 1e-12, 'u(d_L) ↓')
    expect(r.pontos[1].ema).toBe(0.005)
    expect(r.pontos[1].emaDecrescente).toBeUndefined()
    expect(r.pontos[1].conformidade).toBe('CONFORME')
  })
})

// ---- Mínimos do POP e leituras fora do esperado: pendências na calibração nova (`regrasDoPop`) -----------------

describe('calibração nova: os mínimos do POP e as leituras fora do esperado bloqueiam a emissão', () => {
  const sem = (t: string) => t.replace(/[\u00A0\u2009\u202F]/g, ' ')
  const nova = (mudar: (e: EntradaCalculo) => void = () => {}) => {
    const e: EntradaCalculo = { ...exemplo30kg(), regrasDoPop: true }
    mudar(e)
    const r = calcular(e)
    return { r, pendencias: r.pendencias.map(sem), avisos: r.avisos.map((a) => `${a.nivel}: ${sem(a.mensagem)}`) }
  }
  const comLeituras = (e: EntradaCalculo, cargas: number[]) => {
    e.indicacao.pontos = e.indicacao.pontos.map((p) =>
      cargas.includes(p.carga) ? p : { ...p, crescente: null, decrescente: null },
    )
  }

  it('o exemplo completo (6 pontos, 6 leituras, excentricidade): nada', () => {
    expect(nova().pendencias).toEqual([])
  })

  it('só o zero lido: pendência (não é ensaio de carga) e sem o aviso de faixa parcial', () => {
    const { pendencias, avisos } = nova((e) => {
      comLeituras(e, [0])
      e.excentricidade.aplicavel = false
    })
    expect(pendencias).toContain('Erro de indicação: registre as leituras das cargas acima de zero (POP 7.7).')
    expect(avisos.join('\n')).not.toMatch(/faixa parcial/)
    // No registro de antes, como era: o aviso de faixa parcial com a maior carga 0
    const e = exemplo30kg()
    comLeituras(e, [0])
    expect(calcular(e).pendencias).toEqual([])
    expect(calcular(e).avisos.some((a) => /faixa parcial/.test(a.mensagem))).toBe(true)
  })

  it('menos de 5 pontos lidos (contando o zero): pendência; com 5, nada', () => {
    expect(nova((e) => comLeituras(e, [0, 5000, 10000, 30000])).pendencias).toEqual([
      'Erro de indicação: 4 pontos lidos; o POP pede no mínimo 5, contando o zero (7.7).',
    ])
    expect(nova((e) => comLeituras(e, [0, 5000, 10000, 20000, 30000])).pendencias).toEqual([])
    // Os avisos de antes saem (a pendência diz)
    expect(nova((e) => comLeituras(e, [0, 5000, 10000, 30000])).avisos.join('\n')).not.toMatch(/o mínimo é 5, contando/)
  })

  it('o zero é uma das cargas (POP 7.7): sem a leitura dele, pendência, mesmo com 5 cargas lidas; antes das regras, aviso', () => {
    const FALTA_ZERO = 'Erro de indicação: falta a leitura do zero, a primeira carga do ensaio (POP 7.7).'
    const SEM_LINHA =
      'Erro de indicação: falta a leitura do zero, a primeira carga do ensaio; acrescente o ponto sem carga (POP 7.7).'
    const AVISO = 'atencao: Erro de indicação sem a leitura do zero, uma das cargas do ensaio (POP 7.7).'
    const cincoCargas = [5000, 10000, 15000, 20000, 30000]
    // A linha do zero em branco (o plano copiado do certificado anterior: "Calibrar de novo", "Nova calibração")
    const semLeitura = nova((e) => comLeituras(e, cincoCargas))
    expect(semLeitura.pendencias).toEqual([FALTA_ZERO])
    expect(semLeitura.avisos).not.toContain(AVISO)
    // Sem a linha do zero
    const semLinha = (e: EntradaCalculo) => (e.indicacao.pontos = e.indicacao.pontos.filter((p) => p.carga > 0))
    expect(nova(semLinha).pendencias).toEqual([SEM_LINHA])
    // Lida: nada
    expect(nova().pendencias).toEqual([])
    // Nenhuma carga lida: as pendências de sempre, sem a do zero
    expect(nova((e) => comLeituras(e, [])).pendencias.join('\n')).not.toMatch(/leitura do zero/)
    // Medida antes das regras (`minimosComoAviso`) e o registro de antes delas: aviso, como os outros mínimos
    for (const regras of [{ regrasDoPop: true, minimosComoAviso: true }, { regrasDoPop: undefined }]) {
      for (const mudar of [(e: EntradaCalculo) => comLeituras(e, cincoCargas), semLinha]) {
        const r = nova((e) => {
          Object.assign(e, regras)
          mudar(e)
        })
        expect(r.pendencias.join('\n')).not.toMatch(/zero/)
        expect(r.avisos).toContain(AVISO)
      }
    }
    expect(nova((e) => Object.assign(e, { regrasDoPop: undefined })).avisos).not.toContain(AVISO)
  })

  it('subida obrigatória: o método "Decrescente" e o ponto lido só na descida são pendência', () => {
    expect(nova((e) => (e.indicacao.metodo = 'DECRESCENTE')).pendencias).toContain(
      'Erro de indicação: a subida é obrigatória; troque o método “Decrescente” (POP 7.7).',
    )
    expect(
      nova((e) => {
        e.indicacao.pontos[2] = { ...e.indicacao.pontos[2], crescente: null }
      }).pendencias,
    ).toEqual(['Erro de indicação: falta a leitura de subida em 10 000 g (POP 7.7).'])
  })

  it('"crescente e decrescente": o ponto com carga lido na subida e sem a descida é pendência; a virada (Max) e o zero, não', () => {
    const semDescida = (cargas: number[]) => (e: EntradaCalculo) => {
      e.indicacao.pontos = e.indicacao.pontos.map((p) => (cargas.includes(p.carga) ? { ...p, decrescente: null } : p))
    }
    expect(nova(semDescida([5000, 15000])).pendencias).toEqual([
      'Erro de indicação: falta a leitura de descida em 5000 g e 15 000 g (POP 7.7).',
    ])
    // Max é a virada: uma leitura só (POP, Figura 3); o zero tem a sua descida no retorno ao zero
    expect(nova(semDescida([0, 30000])).pendencias).toEqual([])
    // Faixa parcial: a virada é a maior carga lida
    const parcial = nova((e) => {
      comLeituras(e, [0, 5000, 10000, 15000, 20000])
      semDescida([20000])(e)
    })
    expect(parcial.pendencias.join('\n')).not.toMatch(/descida/)
    // Sem nenhuma leitura no ponto: não é a descida que falta (os mínimos têm a pendência deles)
    expect(nova((e) => comLeituras(e, [0, 10000, 15000, 20000, 30000])).pendencias.join('\n')).not.toMatch(/descida/)
    // Os outros métodos não têm a descida (o "Decrescente" tem a pendência dele)
    for (const metodo of ['CONTINUO', 'DESCONTINUO'] as const)
      expect(
        nova((e) => {
          e.indicacao.metodo = metodo
          semDescida([5000, 15000])(e)
        }).pendencias,
      ).toEqual([])
    // Com substituição, as cargas só sobem
    const comSubstituicao = nova((e) => {
      semDescida([5000, 15000])(e)
      e.indicacao.substituicao = { ativa: true, pecas: [], etapas: [] }
    })
    expect(comSubstituicao.pendencias.join('\n')).not.toMatch(/descida/)
  })

  it('a descida que falta só avisa na calibração já medida antes das regras e no registro de antes', () => {
    const tirar = (e: EntradaCalculo) => {
      e.indicacao.pontos = e.indicacao.pontos.map((p) => (p.carga === 5000 ? { ...p, decrescente: null } : p))
    }
    const aviso = 'atencao: Erro de indicação “crescente e decrescente” sem a leitura de descida em 5000 g.'
    const medida = nova((e) => {
      e.minimosComoAviso = true
      tirar(e)
    })
    expect(medida.pendencias).toEqual([])
    expect(medida.avisos).toContain(aviso)
    const antes = exemplo30kg()
    tirar(antes)
    const r = calcular(antes)
    expect(r.pendencias).toEqual([])
    expect(r.avisos.map((a) => `${a.nivel}: ${sem(a.mensagem)}`)).toContain(aviso)
    // Com a descida, nem o aviso
    expect(
      calcular(exemplo30kg())
        .avisos.map((a) => a.mensagem)
        .join('\n'),
    ).not.toMatch(/descida/)
  })

  it('repetibilidade abaixo da Tabela 4: 2 e 4 leituras a 15 kg são pendência; 5 não; 3 com 100 kg ou mais não', () => {
    const rep = (leituras: number[]) =>
      nova((e) => (e.repetibilidade = [{ id: 'r', carga: 15000, leituras }])).pendencias.filter((p) => p.startsWith('Repet'))
    expect(rep([15000, 15005])).toEqual([
      'Repetibilidade a 15 000 g: 2 leituras; o mínimo é 5 (POP, Tabela 4; 3 só com carga ≥ 100 kg).',
    ])
    expect(rep([15000, 15005, 15000, 15000])).toEqual([
      'Repetibilidade a 15 000 g: 4 leituras; o mínimo é 5 (POP, Tabela 4; 3 só com carga ≥ 100 kg).',
    ])
    expect(rep([15000, 15005, 15000, 15000, 15005])).toEqual([])
    // Uma leitura só num segundo ensaio também conta
    expect(
      nova((e) => e.repetibilidade.push({ id: 'r2', carga: 25000, leituras: [25000] })).pendencias.filter((p) =>
        p.startsWith('Repet'),
      ),
    ).toEqual(['Repetibilidade a 25 000 g: 1 leitura; o mínimo é 5 (POP, Tabela 4; 3 só com carga ≥ 100 kg).'])
    // Balança de 300 kg, carga de 150 kg: 3 leituras bastam; 2 não
    const pesada = (leituras: number[]) =>
      nova((e) => {
        e.instrumento = { unidade: 'kg', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 300, e: 0.1, d: 0.1 }] }
        e.repetibilidade = [{ id: 'r', carga: 150, leituras }]
        e.excentricidade = { aplicavel: false, carga: 0, metodo: 1, posicoes: [] }
        e.indicacao.pontos = [0, 75, 150, 225, 300].map((c) => ponto(`${c}`, c, [], c))
      }).pendencias.filter((p) => p.startsWith('Repet'))
    expect(pesada([150, 150.1, 150])).toEqual([])
    expect(pesada([150, 150.1])).toEqual([
      'Repetibilidade a 150,0 kg: 2 leituras; o mínimo é 3 com carga ≥ 100 kg (POP, Tabela 4).',
    ])
  })

  it('classe I: 10 leituras (5 é pendência, sem o aviso de antes); com 10, nada', () => {
    const classeI = (n: number) =>
      nova((e) => {
        e.instrumento = { ...e.instrumento, classe: 'I' }
        e.repetibilidade = [{ id: 'r', carga: 15000, leituras: Array.from({ length: n }, (_, i) => (i % 2 ? 15005 : 15000)) }]
      })
    const cinco = classeI(5)
    expect(cinco.pendencias).toContain('Repetibilidade a 15 000 g: 5 leituras; na classe I o mínimo é 10 (POP, Tabela 4).')
    expect(cinco.avisos.join('\n')).not.toMatch(/faça 10 leituras/)
    expect(classeI(10).pendencias.filter((p) => p.startsWith('Repet'))).toEqual([])
  })

  it('multi-intervalo com um ensaio só: falta o do outro intervalo (pendência, não aviso)', () => {
    const { pendencias, avisos } = nova((e) => {
      e.instrumento = {
        unidade: 'g',
        classe: 'III',
        tipoFaixas: 'MULTI_INTERVALO',
        faixas: [
          { max: 15000, e: 5, d: 5 },
          { max: 30000, e: 10, d: 10 },
        ],
      }
      e.repetibilidade = [{ id: 'r', carga: 25000, leituras: [25000, 25010, 25000, 25000, 25010] }]
    })
    expect(pendencias).toContain(
      'Repetibilidade: 1 ensaio para 2 intervalos; falta no intervalo até 15 000 g (d = 5 g). O POP (7.9) pede um ensaio em cada intervalo de d diferente.',
    )
    expect(avisos.join('\n')).not.toMatch(/1 ensaio para 2 intervalos/)
  })

  it('leitura fora do esperado (vírgula esquecida): uma pendência por leitura, em cada ensaio', () => {
    const { pendencias, avisos } = nova((e) => {
      e.indicacao.pontos[5] = { ...e.indicacao.pontos[5], crescente: 3001000 }
      e.repetibilidade = [{ id: 'r', carga: 15000, leituras: [15000, 15005, 1500500, 15000, 15005, 15000] }]
      e.excentricidade.posicoes = posicoes([10000, 10005, 10000, 100, 10005])
    })
    expect(pendencias).toEqual([
      'Erro de indicação, ponto de 30 000 g: leitura 3 001 000 fora do esperado; confira a digitação.',
      'Excentricidade (P4): leitura 100 fora do esperado com 10 000 g; confira a digitação.',
      'Repetibilidade a 15 000 g: leitura 1 500 500 fora do esperado; confira a digitação.',
    ])
    expect(avisos.join('\n')).not.toMatch(/provável erro de digitação/)
    // No registro de antes, o aviso (vermelho) de sempre, sem pendência
    const antes = exemplo30kg()
    antes.indicacao.pontos[5] = { ...antes.indicacao.pontos[5], crescente: 3001000 }
    expect(calcular(antes).pendencias).toEqual([])
    expect(calcular(antes).avisos.find((a) => /provável erro de digitação/.test(a.mensagem))?.nivel).toBe('erro')
  })

  it('a regra: mais de 10 % da carga ou, na carga pequena, mais de 2 e', () => {
    const inst = { tipoFaixas: 'UNICA' as const, faixas: [{ max: 30, e: 0.02, d: 0.02 }] }
    // Carga de 3 d (0,06 kg): 1 d fora (0,04 ou 0,08) passa de 10 %, mas não de 2 e
    expect(leituraImplausivel(0.04, 0.06, inst)).toBe(false)
    expect(leituraImplausivel(0.08, 0.06, inst)).toBe(false)
    expect(leituraImplausivel(0.12, 0.06, inst)).toBe(true)
    // Carga grande: 10 %
    expect(leituraImplausivel(27.1, 30, inst)).toBe(false)
    expect(leituraImplausivel(26.9, 30, inst)).toBe(true)
    expect(leituraImplausivel(30001, 30, inst)).toBe(true)
    // Sem leitura: nunca
    expect(leituraImplausivel(null, 30, inst)).toBe(false)
    expect(leituraImplausivel(null, 0, inst)).toBe(false)
    // Carga zero: 2 e da 1ª faixa (a carga esquecida, ou o zero digitado errado)
    expect(leituraImplausivel(5, 0, inst)).toBe(true)
    expect(leituraImplausivel(0.05, 0, inst)).toBe(true)
    expect(leituraImplausivel(0.04, 0, inst)).toBe(false)
    expect(leituraImplausivel(-0.02, 0, inst)).toBe(false)
    const classeI = { tipoFaixas: 'UNICA' as const, faixas: [{ max: 220, e: 0.001, d: 0.0001 }] }
    expect(leituraImplausivel(-0.0001, 0, classeI)).toBe(false)
    expect(leituraImplausivel(0.0021, 0, classeI)).toBe(true)
    expect(leituraImplausivel(100, 0, classeI)).toBe(true)
    // Multi-intervalo: o e do intervalo da carga
    const multi = {
      tipoFaixas: 'MULTI_INTERVALO' as const,
      faixas: [
        { max: 15, e: 0.005, d: 0.005 },
        { max: 30, e: 0.5, d: 0.5 },
      ],
    }
    expect(leituraImplausivel(17.5, 16, multi)).toBe(false)
    expect(leituraImplausivel(17.7, 16, multi)).toBe(true)
    expect(leituraImplausivel(14.9, 13.5, multi)).toBe(true)
  })
})

// ---- Calibração nova: a balança que não pesa corretamente e os dados que faltam (POP 7.7 a 7.10) -----------------

describe('calibração nova: a balança que não pesa corretamente e os dados que faltam', () => {
  const sem = (t: string) => t.replace(/[   ]/g, ' ')
  // Pesos M1 pelo certificado, sem correção (o erro é a leitura menos a carga)
  const kg = (nominal: number): PecaCalculo => certificado(nominal, 0, nominal * 1.6e-5, nominal * 5e-5)
  const [K5, K10A, K10B, K10C] = [kg(5), kg(10), kg(10), kg(10)]
  /** Classe III, Max 30 kg, e = d = 10 g, 5 pontos, repetibilidade e excentricidade completas: nada pendente. */
  const balanca30 = (): EntradaCalculo => ({
    instrumento: { unidade: 'kg', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30, e: 0.01, d: 0.01 }] },
    opcoes: OPCOES,
    repetibilidade: [{ id: 'r', carga: 15, leituras: [15, 15, 15.01, 15, 15] }],
    excentricidade: { aplicavel: true, carga: 10, metodo: 1, posicoes: posicoes([10, 10, 10.01, 10, 10]) },
    indicacao: {
      metodo: 'CRESCENTE_DECRESCENTE',
      retornoZero: 0,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: [
        ponto('0', 0, [], 0, 0),
        ponto('5', 5, [K5], 5, 5),
        ponto('10', 10, [K10A], 10, 10),
        ponto('20', 20, [K10A, K10B], 20, 20.01),
        ponto('30', 30, [K10A, K10B, K10C], 30.01, 30.01),
      ],
    },
    conformidade: { solicitada: false, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'BANDA_GUARDA' },
  })
  const calc = (mudar: (e: EntradaCalculo) => void = () => {}, nova = true) => {
    const e = balanca30()
    if (nova) e.regrasDoPop = true
    mudar(e)
    const r = calcular(e)
    return { r, pendencias: r.pendencias.map(sem), avisos: r.avisos.map((a) => `${a.nivel}: ${sem(a.mensagem)}`) }
  }
  const lerEm = (e: EntradaCalculo, carga: number, crescente: number | null, decrescente: number | null = crescente) => {
    e.indicacao.pontos = e.indicacao.pontos.map((p) => (p.carga === carga ? { ...p, crescente, decrescente } : p))
  }

  it('o cenário de base não tem pendência', () => {
    expect(calc().pendencias).toEqual([])
  })

  describe('erro maior que o EMA em serviço (POP 7.8): a balança não pesa corretamente', () => {
    const NAO_PESA = (carga: string, erro: string, ema: string) =>
      `Erro de indicação, ponto de ${carga}: erro de ${erro}, maior que o EMA em serviço (±${ema}); a balança não pesa corretamente e não é calibrada (POP 7.8).`

    it('sem conformidade pedida: 10 e em Max é pendência (o EMA em serviço da Portaria 157 em Max é 4 e)', () => {
      const { r, pendencias } = calc((e) => lerEm(e, 30, 30.1))
      expect(pendencias).toEqual([NAO_PESA('30,00 kg', '+0,100 kg', '0,04 kg')])
      expect(r.pontos[4].foraDoEmaServico).toEqual({ crescente: true, decrescente: true })
      expect(r.pontos[3].foraDoEmaServico).toBeUndefined()
    })

    it('com a conformidade pedida: a pendência, além do "não conforme"', () => {
      const { r, pendencias } = calc((e) => {
        lerEm(e, 30, 30.1)
        e.conformidade = { solicitada: true, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'SIMPLES' }
      })
      expect(r.conformidade).toBe('NAO_CONFORME')
      expect(pendencias).toEqual([NAO_PESA('30,00 kg', '+0,100 kg', '0,04 kg')])
    })

    it('no limite exato passa; uma divisão acima, não', () => {
      expect(calc((e) => lerEm(e, 30, 30.04)).pendencias).toEqual([])
      expect(calc((e) => lerEm(e, 30, 29.96)).pendencias).toEqual([])
      expect(calc((e) => lerEm(e, 30, 30.05)).pendencias).toEqual([NAO_PESA('30,00 kg', '+0,050 kg', '0,04 kg')])
      expect(calc((e) => lerEm(e, 30, 29.95)).pendencias).toEqual([NAO_PESA('30,00 kg', '-0,050 kg', '0,04 kg')])
      // Até 500 e (5 kg), 2 e
      expect(calc((e) => lerEm(e, 5, 5.02)).pendencias).toEqual([])
      expect(calc((e) => lerEm(e, 5, 5.03)).pendencias).toEqual([NAO_PESA('5,00 kg', '+0,030 kg', '0,02 kg')])
    })

    it('só a leitura decrescente fora; no zero, 2 e passa e acima disso a leitura com carga zero é pendência', () => {
      const desce = calc((e) => lerEm(e, 20, 20, 20.05))
      expect(desce.pendencias).toEqual([NAO_PESA('20,00 kg', '+0,050 kg', '0,04 kg')])
      expect(desce.r.pontos[3].foraDoEmaServico).toEqual({ crescente: false, decrescente: true })
      expect(calc((e) => lerEm(e, 0, 0.02, 0)).pendencias).toEqual([])
      expect(calc((e) => lerEm(e, 0, 0.03, 0)).pendencias).toEqual([
        'Erro de indicação, ponto de 0,00 kg: leitura 0,03 com carga zero; confira a carga do ponto ou a digitação.',
      ])
    })

    it('multi-intervalo: o EMA pelo e do intervalo da carga', () => {
      const multi = (leitura10: number) =>
        calc((e) => {
          e.instrumento = {
            ...e.instrumento,
            tipoFaixas: 'MULTI_INTERVALO',
            faixas: [
              { max: 15, e: 0.005, d: 0.005 },
              { max: 30, e: 0.01, d: 0.01 },
            ],
          }
          e.repetibilidade.push({ id: 'r2', carga: 10, leituras: [10, 10, 10.005, 10, 10] })
          lerEm(e, 10, leitura10)
        }).pendencias.filter((p) => p.includes('EMA em serviço'))
      // 10 kg = 2 000 e de 5 g: 4 e = 0,020 kg
      expect(multi(10.02)).toEqual([])
      expect(multi(10.025)).toEqual([NAO_PESA('10,000 kg', '+0,0250 kg', '0,02 kg')])
    })

    it('sem classe: a tolerância do cliente (pedida na conformidade); sem ela, não há limite', () => {
      const semClasse = (tolerancia: number) =>
        calc((e) => {
          e.instrumento = { ...e.instrumento, classe: '' }
          e.conformidade = { solicitada: tolerancia > 0, criterio: 'CLIENTE', toleranciaCliente: tolerancia, regra: 'SIMPLES' }
          lerEm(e, 30, 30.1)
        }).pendencias
      expect(semClasse(0.05)).toEqual([
        'Erro de indicação, ponto de 30,00 kg: erro de +0,100 kg, maior que a tolerância do cliente (±0,05 kg); a balança não pesa corretamente e não é calibrada (POP 7.8).',
      ])
      expect(semClasse(0.1)).toEqual([])
      expect(semClasse(0)).toEqual([])
    })

    it('leitura fora do esperado (digitação): só a pendência dela, sem repetir a do EMA', () => {
      expect(calc((e) => lerEm(e, 30, 300.1, 30.01)).pendencias).toEqual([
        'Erro de indicação, ponto de 30,00 kg: leitura 300,10 fora do esperado; confira a digitação.',
      ])
    })

    it('registro de antes (sem as regras do POP): aviso de atenção, sem pendência', () => {
      const { pendencias, avisos } = calc((e) => lerEm(e, 30, 30.1), false)
      expect(pendencias).toEqual([])
      expect(avisos).toContain(
        'atencao: Erro maior que o EMA em serviço em 30,00 kg: pelo POP (7.8), a balança não pesa corretamente.',
      )
    })

    it('o exemplo do cg-18 (registro de antes) não muda', () => {
      expect(calcular(exemplo30kg()).pendencias).toEqual([])
      expect(calcular({ ...exemplo30kg(), regrasDoPop: true }).pendencias).toEqual([])
    })
  })

  describe('retorno ao zero (POP 7.7 e 7.8)', () => {
    it('não registrado: pendência; com 2 e, passa; acima disso, a balança não voltou ao zero', () => {
      expect(calc((e) => (e.indicacao.retornoZero = null)).pendencias).toEqual([
        'Erro de indicação: registre o retorno ao zero, a indicação sem carga depois de retirar toda a carga (POP 7.7).',
      ])
      expect(calc((e) => (e.indicacao.retornoZero = 0.02)).pendencias).toEqual([])
      expect(calc((e) => (e.indicacao.retornoZero = -0.02)).pendencias).toEqual([])
      const NAO_VOLTOU = (v: string) =>
        `Erro de indicação: a balança não voltou ao zero (retorno de ${v}; limite de ±0,02 kg); a balança não pesa corretamente e não é calibrada (POP 7.8).`
      expect(calc((e) => (e.indicacao.retornoZero = 0.03)).pendencias).toEqual([NAO_VOLTOU('0,03 kg')])
      expect(calc((e) => (e.indicacao.retornoZero = 0.5)).pendencias).toEqual([NAO_VOLTOU('0,50 kg')])
    })

    it('sem nenhuma carga lida, só as pendências de antes; no registro de antes, aviso', () => {
      const vazio = calc((e) => {
        lerEm(e, 0, null)
        lerEm(e, 5, null)
        lerEm(e, 10, null)
        lerEm(e, 20, null)
        lerEm(e, 30, null)
        e.indicacao.retornoZero = null
      }).pendencias
      expect(vazio).toEqual(['Erro de indicação: nenhuma leitura registrada.'])
      expect(calc((e) => (e.indicacao.retornoZero = null), false).pendencias).toEqual([])
      const antes = calc((e) => (e.indicacao.retornoZero = 0.5), false)
      expect(antes.pendencias).toEqual([])
      expect(antes.avisos).toContain(
        'atencao: Retorno ao zero de 0,50 kg, maior que o EMA em serviço (±0,02 kg): pelo POP (7.8), a balança não pesa corretamente.',
      )
    })
  })

  describe('excentricidade (POP 7.10)', () => {
    it('posições sem leitura: pendência na calibração nova; aviso no registro de antes', () => {
      const duas = (e: EntradaCalculo) => (e.excentricidade.posicoes = posicoes([10, 10.01, null, null, null]))
      expect(calc(duas).pendencias).toEqual(['Excentricidade: 3 posições sem leitura; registre todas (POP 7.10).'])
      expect(calc((e) => (e.excentricidade.posicoes = posicoes([10, 10, 10, 10, null]))).pendencias).toEqual([
        'Excentricidade: 1 posição sem leitura; registre todas (POP 7.10).',
      ])
      const antes = calc(duas, false)
      expect(antes.pendencias).toEqual([])
      expect(antes.avisos).toContain('atencao: Excentricidade: 3 posição(ões) sem leitura.')
    })

    it('carga apagada (0) com leituras: pendência, e as leituras voltam a ser conferidas quando ela é informada', () => {
      expect(calc((e) => (e.excentricidade.carga = 0)).pendencias).toEqual([
        'Excentricidade: informe a carga usada no ensaio (POP 7.10).',
      ])
      // Sem leituras: a pendência de sempre (registre as leituras)
      expect(
        calc((e) => {
          e.excentricidade.carga = 0
          e.excentricidade.posicoes = posicoes([null, null, null, null, null])
        }).pendencias,
      ).toEqual(['Excentricidade: registre as leituras das posições (ou marque o ensaio como não aplicável).'])
      expect(calc((e) => (e.excentricidade.carga = 0), false).avisos).toContain(
        'atencao: Excentricidade: informe a carga usada no ensaio (POP 7.10).',
      )
    })
  })

  describe('excentricidade método 3 (classe I): o zero antes de cada posição também é conferido', () => {
    const metodo3 = (zeros: Array<number | null>) => (e: EntradaCalculo) => {
      e.excentricidade = { ...e.excentricidade, metodo: 3, posicoes: posicoes([10, 10, 10, 10, 10], zeros) }
    }
    it('a carga digitada no lugar do zero: pendência na calibração nova (sem ela, U de todos os pontos explode)', () => {
      const { r, pendencias } = calc(metodo3([0, 0, 10, 0, 0]))
      expect(r.excentricidade.desvios).toEqual([0, 0, -10, 0, 0])
      expect(pendencias).toEqual(['Excentricidade (P3): zero antes 10,00 fora do esperado; confira a digitação.'])
      // Na posição 1 (a referência de todas): também
      expect(calc(metodo3([10, 0, 0, 0, 0])).pendencias).toEqual([
        'Excentricidade (P1): zero antes 10,00 fora do esperado; confira a digitação.',
      ])
    })
    it('zero dentro de 2 e: nada; sem o zero lido: nada', () => {
      expect(calc(metodo3([0, 0.01, -0.02, 0.02, 0])).pendencias).toEqual([])
      expect(calc(metodo3([null, null, null, null, null])).pendencias).toEqual([])
    })
    it('registro de antes: o aviso (vermelho) de sempre, sem pendência', () => {
      const { pendencias, avisos } = calc(metodo3([0, 0, 10, 0, 0]), false)
      expect(pendencias).toEqual([])
      expect(avisos.join('\n')).toMatch(/provável erro de digitação: 10,00 no zero antes da excentricidade \(P3\)/)
    })
    it('classe I (220 g, e = 1 mg): o zero antes com a carga de 100 g', () => {
      const e: EntradaCalculo = {
        instrumento: { unidade: 'g', classe: 'I', tipoFaixas: 'UNICA', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] },
        opcoes: OPCOES,
        repetibilidade: [],
        excentricidade: {
          aplicavel: true,
          carga: 100,
          metodo: 3,
          posicoes: posicoes([100, 100.0001, 100, 100.0001, 100], [0, 0, 100.0001, 0, -0.0001]),
        },
        indicacao: { metodo: 'DESCONTINUO', retornoZero: 0, substituicao: { ativa: false, pecas: [], etapas: [] }, pontos: [] },
        conformidade: { solicitada: false, criterio: 'OIML_INICIAL', toleranciaCliente: 0, regra: 'SIMPLES' },
        regrasDoPop: true,
      }
      expect(calcular(e).pendencias.map(sem)).toContain(
        'Excentricidade (P3): zero antes 100,0001 fora do esperado; confira a digitação.',
      )
    })
  })

  describe('ponto sem carga: a leitura com carga zero também é conferida', () => {
    const SEM_CARGA = (n: number) =>
      `Erro de indicação: o ponto ${n} está sem carga; informe a carga do ponto (só o primeiro, o do zero, fica sem carga).`
    it('ponto acrescentado e lido com a carga esquecida (0): pendência, sem o erro igual à leitura inteira liberado', () => {
      const { pendencias } = calc((e) => e.indicacao.pontos.push(ponto('novo', 0, [], 25, 25)))
      expect(pendencias).toEqual([SEM_CARGA(6)])
      // Mesmo com a leitura perto de zero: dois zeros não contam como dois pontos (POP 7.7)
      expect(calc((e) => e.indicacao.pontos.push(ponto('novo', 0, [], 0, 0))).pendencias).toEqual([SEM_CARGA(6)])
      // O ponto sem leitura não acusa
      expect(calc((e) => e.indicacao.pontos.push(ponto('novo', 0, [], null, null))).pendencias).toEqual([])
      // O zero apagado e acrescentado de novo no fim (a tabela não reordena) continua sendo o zero
      expect(
        calc((e) => {
          e.indicacao.pontos = [...e.indicacao.pontos.slice(1), ponto('novo', 0, [], 0, 0)]
        }).pendencias,
      ).toEqual([])
    })
    it('a leitura do zero longe de zero (mais de 2 e): pendência; dentro de 2 e, nada', () => {
      expect(calc((e) => lerEm(e, 0, 0.05, 0)).pendencias).toEqual([
        'Erro de indicação, ponto de 0,00 kg: leitura 0,05 com carga zero; confira a carga do ponto ou a digitação.',
      ])
      expect(calc((e) => lerEm(e, 0, 25, 25)).pendencias).toEqual([
        'Erro de indicação, ponto de 0,00 kg: leitura 25,00 com carga zero; confira a carga do ponto ou a digitação.',
      ])
      expect(calc((e) => lerEm(e, 0, 0.01, -0.01)).pendencias).toEqual([])
    })
    it('registro de antes: só o aviso das leituras fora do esperado', () => {
      const { pendencias, avisos } = calc((e) => e.indicacao.pontos.push(ponto('novo', 0, [], 25, 25)), false)
      expect(pendencias).toEqual([])
      expect(avisos.join('\n')).toMatch(/provável erro de digitação: 25,00 em 0,00 kg/)
    })
  })

  describe('ponto sem nenhum peso padrão (a carga só digitada)', () => {
    const SEM_PESO = (carga: string) =>
      `Erro de indicação, ponto de ${carga}: nenhum peso padrão no ponto; escolha os pesos do ponto ou, nos padrões, um jogo que faça essa carga.`
    const semPecas = (carga: number) => (e: EntradaCalculo) => {
      e.indicacao.pontos = e.indicacao.pontos.map((p) => (p.carga === carga ? { ...p, pecas: [] } : p))
    }
    it('calibração nova: pendência (o ponto sairia com E e U sem padrão rastreável), sem o aviso', () => {
      const { pendencias, avisos } = calc(semPecas(10))
      expect(pendencias).toEqual([SEM_PESO('10,00 kg')])
      expect(avisos.join('\n')).not.toMatch(/Carga sem padrões/)
    })
    it('registro de antes (revisão, "como encontrado"): só o aviso de sempre', () => {
      const { pendencias, avisos } = calc(semPecas(10), false)
      expect(pendencias).toEqual([])
      expect(avisos).toContain(
        'atencao: Carga sem padrões em 10,00 kg: a referência é a carga digitada, sem a incerteza dos pesos.',
      )
    })
    it('o zero, o ponto sem leitura e o ponto só com as etapas de substituição por baixo não acusam', () => {
      expect(calc(semPecas(0)).pendencias).toEqual([])
      expect(
        calc((e) => {
          semPecas(10)(e)
          lerEm(e, 10, null)
        }).pendencias.filter((p) => p.includes('nenhum peso padrão')),
      ).toEqual([])
      const comSubstituicao = calc((e) => {
        e.indicacao.metodo = 'CONTINUO'
        e.indicacao.substituicao = {
          ativa: true,
          pecas: [K10A],
          etapas: [{ leituraPadroes: 10, leituraSubstituicao: 10 }],
        }
        e.indicacao.pontos = e.indicacao.pontos.map((p) => (p.carga === 10 ? { ...p, pecas: [], nivelSubstituicao: 1 } : p))
      })
      expect(comSubstituicao.pendencias.filter((p) => p.includes('nenhum peso padrão'))).toEqual([])
    })
  })

  describe('repetibilidade sem a carga (POP 7.9)', () => {
    it('faixa única: o ensaio com leituras e carga 0 é pendência', () => {
      expect(calc((e) => (e.repetibilidade[0].carga = 0)).pendencias).toEqual([
        'Repetibilidade: informe a carga do ensaio (POP 7.9).',
      ])
      // Com dois ensaios, diz qual
      expect(calc((e) => e.repetibilidade.push({ id: 'r2', carga: 0, leituras: [25, 25, 25, 25, 25] })).pendencias).toEqual([
        'Repetibilidade: informe a carga do ensaio 2 (POP 7.9).',
      ])
      expect(calc((e) => (e.repetibilidade[0].carga = 0), false).avisos).toContain(
        'atencao: Repetibilidade: informe a carga do ensaio (POP 7.9).',
      )
    })

    it('multi-intervalo: o ensaio sem carga não esconde o intervalo sem ensaio', () => {
      const multi = (carga: number) =>
        calc((e) => {
          e.instrumento = {
            ...e.instrumento,
            tipoFaixas: 'MULTI_INTERVALO',
            faixas: [
              { max: 15, e: 0.005, d: 0.005 },
              { max: 30, e: 0.01, d: 0.01 },
            ],
          }
          e.repetibilidade = [{ id: 'r', carga, leituras: [25, 25, 25.01, 25, 25] }]
        }).pendencias.filter((p) => p.startsWith('Repetibilidade'))
      expect(multi(25)).toEqual([
        'Repetibilidade: 1 ensaio para 2 intervalos; falta no intervalo até 15,000 kg (d = 0,005 kg). O POP (7.9) pede um ensaio em cada intervalo de d diferente.',
      ])
      expect(multi(0)).toEqual([
        'Repetibilidade: 0 ensaios para 2 intervalos; falta nos intervalos até 15,000 kg (d = 0,005 kg) e até 30,00 kg (d = 0,010 kg). O POP (7.9) pede um ensaio em cada intervalo de d diferente.',
        'Repetibilidade: informe a carga do ensaio (POP 7.9).',
      ])
    })
  })

  describe('rascunho já medido antes das regras do POP (`minimosComoAviso`, marcado na atualização)', () => {
    const medido = (mudar: (e: EntradaCalculo) => void, nova = true) =>
      calc((e) => {
        e.minimosComoAviso = true
        mudar(e)
      }, nova)
    /** 4 pontos (sem o de 20 kg), 3 leituras a 15 kg, sem o retorno ao zero e uma posição da excentricidade sem leitura. */
    const abaixoDosMinimos = (e: EntradaCalculo) => {
      lerEm(e, 20, null)
      e.repetibilidade = [{ id: 'r', carga: 15, leituras: [15, 15, 15.01] }]
      e.indicacao.retornoZero = null
      e.excentricidade.posicoes = posicoes([10, 10, 10.01, 10, null])
    }

    it('os mínimos (pontos, leituras, retorno ao zero, posições) ficam como avisos, como na época', () => {
      // Na calibração nova, cada um é pendência
      expect(calc(abaixoDosMinimos).pendencias).toEqual([
        'Erro de indicação: 4 pontos lidos; o POP pede no mínimo 5, contando o zero (7.7).',
        'Repetibilidade a 15,00 kg: 3 leituras; o mínimo é 5 (POP, Tabela 4; 3 só com carga ≥ 100 kg).',
        'Erro de indicação: registre o retorno ao zero, a indicação sem carga depois de retirar toda a carga (POP 7.7).',
        'Excentricidade: 1 posição sem leitura; registre todas (POP 7.10).',
      ])
      const { pendencias, avisos } = medido(abaixoDosMinimos)
      expect(pendencias).toEqual([])
      expect(avisos).toEqual(
        expect.arrayContaining([
          'atencao: Erro de indicação com 4 ponto(s); o mínimo é 5, contando o zero (cg-18 §5.2).',
          'atencao: Repetibilidade a 15,00 kg: 3 leitura(s); o mínimo é 5 (3 só com carga ≥ 100 kg).',
          'atencao: Excentricidade: 1 posição(ões) sem leitura.',
        ]),
      )
    })

    it('a subida e um ensaio de repetibilidade por intervalo também', () => {
      expect(medido((e) => (e.indicacao.metodo = 'DECRESCENTE')).pendencias).toEqual([])
      expect(medido((e) => lerEm(e, 10, null, 10)).pendencias).toEqual([])
      const multi = medido((e) => {
        e.instrumento = {
          ...e.instrumento,
          tipoFaixas: 'MULTI_INTERVALO',
          faixas: [
            { max: 15, e: 0.005, d: 0.005 },
            { max: 30, e: 0.01, d: 0.01 },
          ],
        }
        e.repetibilidade = [{ id: 'r', carga: 25, leituras: [25, 25, 25.01, 25, 25] }]
      })
      expect(multi.pendencias).toEqual([])
      expect(multi.avisos).toContain(
        'atencao: Repetibilidade: 1 ensaio para 2 intervalos; falta no intervalo até 15,000 kg (d = 0,005 kg). O POP (7.9) pede um ensaio em cada intervalo de d diferente.',
      )
    })

    it('a balança que não pesa corretamente continua sem certificado (POP 7.8)', () => {
      expect(medido((e) => lerEm(e, 30, 30.1)).pendencias).toEqual([
        'Erro de indicação, ponto de 30,00 kg: erro de +0,100 kg, maior que o EMA em serviço (±0,04 kg); a balança não pesa corretamente e não é calibrada (POP 7.8).',
      ])
      expect(medido((e) => (e.indicacao.retornoZero = 0.5)).pendencias).toEqual([
        'Erro de indicação: a balança não voltou ao zero (retorno de 0,50 kg; limite de ±0,02 kg); a balança não pesa corretamente e não é calibrada (POP 7.8).',
      ])
    })

    it('o que se corrige no escritório continua pendência: digitação, cargas e pesos do ponto', () => {
      expect(medido((e) => lerEm(e, 30, 300.1, 30.01)).pendencias).toEqual([
        'Erro de indicação, ponto de 30,00 kg: leitura 300,10 fora do esperado; confira a digitação.',
      ])
      expect(medido((e) => (e.excentricidade.carga = 0)).pendencias).toEqual([
        'Excentricidade: informe a carga usada no ensaio (POP 7.10).',
      ])
      expect(medido((e) => (e.repetibilidade[0].carga = 0)).pendencias).toEqual([
        'Repetibilidade: informe a carga do ensaio (POP 7.9).',
      ])
      expect(
        medido((e) => {
          e.indicacao.pontos = e.indicacao.pontos.map((p) => (p.carga === 10 ? { ...p, pecas: [] } : p))
        }).pendencias,
      ).toEqual([
        'Erro de indicação, ponto de 10,00 kg: nenhum peso padrão no ponto; escolha os pesos do ponto ou, nos padrões, um jogo que faça essa carga.',
      ])
      expect(medido((e) => e.indicacao.pontos.push(ponto('novo', 0, [], 25, 25))).pendencias).toEqual([
        'Erro de indicação: o ponto 6 está sem carga; informe a carga do ponto (só o primeiro, o do zero, fica sem carga).',
      ])
      // Só o zero lido não é ensaio de carga
      expect(
        medido((e) => {
          for (const c of [5, 10, 20, 30]) lerEm(e, c, null)
        }).pendencias,
      ).toEqual(['Erro de indicação: registre as leituras das cargas acima de zero (POP 7.7).'])
    })

    it('sem as regras do POP (registro de antes), a marca não muda nada', () => {
      const semMarca = calc((e) => {
        abaixoDosMinimos(e)
        lerEm(e, 30, 30.1)
      }, false)
      const comMarca = medido((e) => {
        abaixoDosMinimos(e)
        lerEm(e, 30, 30.1)
      }, false)
      expect(comMarca.pendencias).toEqual([])
      expect(comMarca.avisos).toEqual(semMarca.avisos)
    })
  })

  describe('calibração parcial acordada só da faixa de baixo (POP 7.1)', () => {
    const duasFaixas = (tipoFaixas: 'MULTIPLAS_FAIXAS' | 'MULTI_INTERVALO', ate: number) =>
      calc((e) => {
        e.instrumento = {
          unidade: 'kg',
          classe: 'III',
          tipoFaixas,
          faixas: [
            { max: 6, e: 0.001, d: 0.001 },
            { max: 15, e: 0.005, d: 0.005 },
          ],
        }
        const cargas = ate === 6 ? [0, 1, 2, 4, 6] : [0, 3, 6, 10, 15]
        e.indicacao.pontos = cargas.map((c) => ponto(`${c}`, c, c ? [kg(c)] : [], c, c))
        e.repetibilidade = [{ id: 'r', carga: 5, leituras: [5, 5, 5.001, 5, 5] }]
        e.excentricidade = { aplicavel: true, carga: 5, metodo: 1, posicoes: posicoes([5, 5, 5.001, 5, 5]) }
      })

    it('múltiplas faixas calibrada até Max1: sem a pendência da faixa de cima, com o aviso de faixa parcial', () => {
      const { pendencias, avisos } = duasFaixas('MULTIPLAS_FAIXAS', 6)
      expect(pendencias).toEqual([])
      expect(avisos.join('\n')).toMatch(/faixa parcial/)
    })

    it('até Max da faixa de cima: a pendência continua', () => {
      expect(duasFaixas('MULTIPLAS_FAIXAS', 15).pendencias).toEqual([
        'Repetibilidade: 1 ensaio para 2 faixas; falta na faixa até 15,000 kg (d = 0,005 kg). O POP (7.9) pede um ensaio em cada faixa de d diferente.',
      ])
    })

    it('multi-intervalo calibrado até Max1: sem pendência', () => {
      expect(duasFaixas('MULTI_INTERVALO', 6).pendencias).toEqual([])
      expect(duasFaixas('MULTI_INTERVALO', 15).pendencias).toHaveLength(1)
    })
  })

  describe('cargas acima de Max', () => {
    it('ponto, repetibilidade e excentricidade acima de Max: pendência; Max exato, não', () => {
      const K5B = kg(5)
      const { pendencias, avisos } = calc((e) => {
        e.indicacao.pontos.push(ponto('35', 35, [K10A, K10B, K10C, K5B], 35.01, 35.01))
        e.repetibilidade = [{ id: 'r', carga: 40, leituras: [40, 40, 40.01, 40, 40] }]
        e.excentricidade = { aplicavel: true, carga: 45, metodo: 1, posicoes: posicoes([45, 45, 45, 45, 45]) }
      })
      expect(pendencias).toEqual([
        'Erro de indicação, ponto de 35,00 kg: carga acima de Max (30,00 kg); confira a carga ou o Max da balança.',
        'Repetibilidade a 40,00 kg: carga acima de Max (30,00 kg); confira a carga ou o Max da balança.',
        'Excentricidade: carga de 45,00 kg acima de Max (30,00 kg); confira a carga ou o Max da balança.',
      ])
      expect(avisos.join('\n')).not.toMatch(/maior que Max/)
      expect(calc((e) => (e.repetibilidade = [{ id: 'r', carga: 30, leituras: [30, 30, 30.01, 30, 30] }])).pendencias).toEqual([])
    })

    it('multi-intervalo: o Max do último intervalo', () => {
      const { pendencias } = calc((e) => {
        e.instrumento = {
          ...e.instrumento,
          tipoFaixas: 'MULTI_INTERVALO',
          faixas: [
            { max: 15, e: 0.005, d: 0.005 },
            { max: 30, e: 0.01, d: 0.01 },
          ],
        }
        e.repetibilidade.push({ id: 'r2', carga: 25, leituras: [25, 25, 25.01, 25, 25] })
        e.indicacao.pontos.push(ponto('35', 35, [K10A, K10B, K10C, kg(5)], 35.01, 35.01))
      })
      expect(pendencias).toEqual([
        'Erro de indicação, ponto de 35,00 kg: carga acima de Max (30,00 kg); confira a carga ou o Max da balança.',
      ])
    })

    it('registro de antes: avisos, sem pendência', () => {
      const { pendencias, avisos } = calc((e) => {
        e.repetibilidade = [{ id: 'r', carga: 40, leituras: [40, 40, 40.01, 40, 40] }]
        e.excentricidade.carga = 45
        e.excentricidade.posicoes = posicoes([45, 45, 45, 45, 45])
      }, false)
      expect(pendencias).toEqual([])
      expect(avisos).toContain(
        'atencao: Carga acima de Max (30,00 kg) em 40,00 kg (repetibilidade); confira a carga ou o Max da balança.',
      )
      expect(avisos).toContain('atencao: Carga de excentricidade (45,00 kg) maior que Max.')
    })
  })

  describe('revisão de um certificado de antes das regras: a leitura fora do esperado que a revisão mudou', () => {
    const original = () => {
      const e = balanca30()
      return {
        indicacao: Object.fromEntries(
          e.indicacao.pontos.map((p) => [p.id, { crescente: p.crescente, decrescente: p.decrescente }]),
        ),
        repetibilidade: Object.fromEntries(e.repetibilidade.map((r) => [r.id, r.leituras])),
        excentricidade: e.excentricidade.posicoes.map((p) => p.leitura),
      }
    }
    it('mudada: pendência; já no certificado revisado: só o aviso de sempre', () => {
      const mudada = calc((e) => {
        lerEm(e, 20, 20000, 20.01)
        e.leiturasDoOriginal = original()
      }, false)
      expect(mudada.pendencias).toEqual([
        'Erro de indicação, ponto de 20,00 kg: leitura 20 000,00 fora do esperado; confira a digitação.',
      ])
      expect(mudada.avisos.join('\n')).not.toMatch(/provável erro de digitação/)
      // A mesma leitura já estava no certificado revisado: aviso, como antes
      const ja = calc((e) => {
        lerEm(e, 20, 20000, 20.01)
        const o = original()
        o.indicacao['20'] = { crescente: 20000, decrescente: 20.01 }
        e.leiturasDoOriginal = o
      }, false)
      expect(ja.pendencias).toEqual([])
      expect(ja.avisos.join('\n')).toMatch(/provável erro de digitação: 20 000,00 em 20,00 kg/)
      // Repetibilidade e excentricidade também
      const outras = calc((e) => {
        e.repetibilidade[0].leituras = [15, 15, 1501, 15, 15]
        e.excentricidade.posicoes = posicoes([10, 10, 10.01, 100, 10])
        e.leiturasDoOriginal = original()
      }, false)
      expect(outras.pendencias).toEqual([
        'Excentricidade (P4): leitura 100,00 fora do esperado com 10,00 kg; confira a digitação.',
        'Repetibilidade a 15,00 kg: leitura 1501,00 fora do esperado; confira a digitação.',
      ])
    })
  })
})

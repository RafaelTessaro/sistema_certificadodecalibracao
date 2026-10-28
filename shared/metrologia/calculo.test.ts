import { describe, expect, it } from 'vitest'
import type { OpcoesCalculo } from '../tipos.ts'
import { calcular } from './calculo.ts'
import { pesosMinimosSubstituicao } from './sugestoes.ts'
import type { EntradaCalculo, Orcamento, PecaCalculo, PontoCalculo } from './tipos.ts'

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
    expect(texto).toMatch(/info: U menor que a divisão em 0 g; 5000 g:/)
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
})

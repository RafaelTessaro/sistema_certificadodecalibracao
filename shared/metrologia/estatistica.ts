// Estatística do cálculo da incerteza: média, desvio-padrão, distribuição t de Student e fator de
// abrangência (JCGM 100:2008 – GUM, Anexo G; EURAMET cg-18 v4.0, Apêndice B). Sem dependências.

import type { OpcoesCalculo } from '../tipos.ts'

/** Probabilidade unilateral do intervalo de 95,45 % (na normal, k = 2). */
export const P_95_45 = 0.97725

export type MetodoK = OpcoesCalculo['metodoK']

/** Média aritmética; NaN para lista vazia. Soma os desvios em relação ao primeiro valor (leituras grandes e próximas). */
export function media(valores: readonly number[]): number {
  if (!valores.length) return NaN
  const base = valores[0]
  let soma = 0
  for (const v of valores) soma += v - base
  return base + soma / valores.length
}

/** Desvio-padrão experimental s (divisor n − 1); NaN com menos de 2 valores. */
export function desvioPadrao(valores: readonly number[]): number {
  if (valores.length < 2) return NaN
  const m = media(valores)
  let soma = 0
  for (const v of valores) soma += (v - m) ** 2
  return Math.sqrt(soma / (valores.length - 1))
}

// ---- Funções especiais ----------------------------------------------------------------------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

/** ln Γ(z) pela aproximação de Lanczos (g = 7, n = 9). */
function lnGama(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGama(1 - z)
  const w = z - 1
  let x = LANCZOS[0]
  for (let i = 1; i < LANCZOS.length; i++) x += LANCZOS[i] / (w + i)
  const t = w + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (w + 0.5) * Math.log(t) - t + Math.log(x)
}

/** Fração contínua da beta incompleta (método de Lentz modificado). */
function fracaoContinuaBeta(a: number, b: number, x: number): number {
  const MINIMO = 1e-300
  const limitar = (v: number) => (Math.abs(v) < MINIMO ? MINIMO : v)
  let c = 1
  let d = 1 / limitar(1 - ((a + b) * x) / (a + 1))
  let h = d
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2))
    d = 1 / limitar(1 + aa * d)
    c = limitar(1 + aa / c)
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2))
    d = 1 / limitar(1 + aa * d)
    c = limitar(1 + aa / c)
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-16) break
  }
  return h
}

/** Função beta incompleta regularizada I_x(a, b). */
export function betaIncompleta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lnGama(a + b) - lnGama(a) - lnGama(b) + a * Math.log(x) + b * Math.log1p(-x))
  return x < (a + 1) / (a + b + 2) ? (bt * fracaoContinuaBeta(a, b, x)) / a : 1 - (bt * fracaoContinuaBeta(b, a, 1 - x)) / b
}

/** P(T > t) para t ≥ 0 na t de Student com ν graus de liberdade. */
function caudaT(t: number, nu: number): number {
  return 0.5 * betaIncompleta(nu / 2, 0.5, nu / (nu + t * t))
}

/** Função de distribuição acumulada da t de Student (ν finito). */
export function distribuicaoT(t: number, nu: number): number {
  const cauda = caudaT(Math.abs(t), nu)
  return t >= 0 ? 1 - cauda : cauda
}

/** Quantil da normal padrão (algoritmo de Acklam; erro relativo < 1,2 × 10⁻⁹). */
export function quantilNormal(p: number): number {
  if (!(p > 0)) return p === 0 ? -Infinity : NaN
  if (!(p < 1)) return p === 1 ? Infinity : NaN
  const a = [-39.69683028665376, 220.9460984245205, -275.928510446969, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const baixo = 0.02425
  const cauda = (q: number) =>
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  if (p < baixo) return cauda(Math.sqrt(-2 * Math.log(p)))
  if (p > 1 - baixo) return -cauda(Math.sqrt(-2 * Math.log(1 - p)))
  const q = p - 0.5
  const r = q * q
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  )
}

/** Expansão de Cornish-Fisher do quantil t a partir do quantil normal x (Abramowitz & Stegun 26.7.5). */
function cornishFisher(x: number, nu: number): number {
  const x2 = x * x
  const g1 = (x * (x2 + 1)) / 4
  const g2 = (x * ((5 * x2 + 16) * x2 + 3)) / 96
  const g3 = (x * (((3 * x2 + 19) * x2 + 17) * x2 - 15)) / 384
  const g4 = (x * ((((79 * x2 + 776) * x2 + 1482) * x2 - 1920) * x2 - 945)) / 92160
  return x + g1 / nu + g2 / nu ** 2 + g3 / nu ** 3 + g4 / nu ** 4
}

const memoQuantil = new Map<string, number>()

/**
 * Quantil da t de Student: o t tal que P(T ≤ t) = p, com ν graus de liberdade (ν pode ser fracionário).
 * ν = 1 e 2 têm forma fechada; ν > 1000 usa Cornish-Fisher; ν = ∞ é a normal. No resto, bisseção na cauda.
 */
export function quantilT(p: number, nu: number): number {
  if (Number.isNaN(p) || !(nu > 0)) return NaN
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (p === 0.5) return 0
  if (p < 0.5) return -quantilT(1 - p, nu)
  if (nu === Infinity) return quantilNormal(p)
  if (nu === 1) return Math.tan(Math.PI * (p - 0.5))
  if (nu === 2) return (2 * p - 1) / Math.sqrt(2 * p * (1 - p))
  if (nu > 1000) return cornishFisher(quantilNormal(p), nu)
  const chave = `${p}|${nu}`
  const memo = memoQuantil.get(chave)
  if (memo !== undefined) return memo
  const alvo = 1 - p
  let baixo = 0
  let alto = 2
  while (caudaT(alto, nu) > alvo) {
    baixo = alto
    alto *= 2
  }
  for (let i = 0; i < 200 && alto - baixo > 1e-14 * alto; i++) {
    const meio = (baixo + alto) / 2
    if (caudaT(meio, nu) > alvo) baixo = meio
    else alto = meio
  }
  const t = (baixo + alto) / 2
  if (memoQuantil.size > 500) memoQuantil.clear()
  memoQuantil.set(chave, t)
  return t
}

// ---- Fator de abrangência ---------------------------------------------------------------------

/** GUM Tabela G.2, coluna 95,45 %: [ν, t]. */
export const TABELA_G2: ReadonlyArray<readonly [number, number]> = [
  [1, 13.97],
  [2, 4.53],
  [3, 3.31],
  [4, 2.87],
  [5, 2.65],
  [6, 2.52],
  [7, 2.43],
  [8, 2.37],
  [9, 2.32],
  [10, 2.28],
  [11, 2.25],
  [12, 2.23],
  [13, 2.21],
  [14, 2.2],
  [15, 2.18],
  [16, 2.17],
  [17, 2.16],
  [18, 2.15],
  [19, 2.14],
  [20, 2.13],
  [25, 2.11],
  [30, 2.09],
  [35, 2.07],
  [40, 2.06],
  [45, 2.06],
  [50, 2.05],
  [100, 2.025],
]

/**
 * Fator de abrangência k para 95,45 % (cg-18 B1) a partir de ν_eff:
 * - T_EXATO: t⁻¹(0,97725; ⌊ν⌋) (GUM G.4.1, ν truncado);
 * - TABELA: linha imediatamente inferior da Tabela G.2 do GUM (convenção conservadora dos exemplos H2);
 * - K2: k = 2 fixo.
 * ν = ∞ dá k = 2.
 */
export function fatorAbrangencia(nu: number, metodo: MetodoK = 'T_EXATO'): number {
  if (metodo === 'K2' || Number.isNaN(nu) || nu === Infinity) return 2
  const inteiro = Math.max(1, Math.floor(nu))
  if (metodo === 'TABELA') {
    let k = TABELA_G2[0][1]
    for (const [linha, valor] of TABELA_G2) if (linha <= inteiro) k = valor
    return k
  }
  return quantilT(P_95_45, inteiro)
}

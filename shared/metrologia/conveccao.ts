// Convecção dos pesos e aclimatação (EURAMET cg-18 v4.0, 7.1.2.4 e Anexo F): a diferença de temperatura entre
// os pesos e o ar cria uma corrente de ar que muda a indicação. Na classe I entra na incerteza da massa de
// referência, peça a peça, pela Tabela F2.1 (u = Δm_conv/√3). Sem medição da diferença, ela é estimada pelo
// tempo de aclimatação (Tabela F1.3). Puro, sem dependências.

import type { ClassePeso } from '../tipos.ts'

/** Colunas de |ΔT| (K) da Tabela F2.1, em ordem crescente. */
export const F21_DELTA_T = [1, 2, 3, 5, 7, 10, 15, 20] as const
/** cg-18 v4.0, Tabela F2.1: Δm_conv (mg) por massa da peça (kg) e |ΔT| (colunas de F21_DELTA_T). */
export const TABELA_F21: ReadonlyArray<readonly [kg: number, mg: readonly number[]]> = [
  [0.01, [0.01, 0.01, 0.02, 0.03, 0.03, 0.05, 0.06, 0.08]],
  [0.02, [0.01, 0.02, 0.03, 0.05, 0.06, 0.08, 0.11, 0.14]],
  [0.05, [0.03, 0.05, 0.06, 0.09, 0.12, 0.17, 0.23, 0.29]],
  [0.1, [0.05, 0.08, 0.11, 0.17, 0.22, 0.29, 0.4, 0.51]],
  [0.2, [0.08, 0.14, 0.19, 0.29, 0.38, 0.51, 0.72, 0.91]],
  [0.5, [0.17, 0.29, 0.4, 0.61, 0.81, 1.09, 1.54, 1.96]],
  [1, [0.29, 0.51, 0.72, 1.09, 1.45, 1.96, 2.76, 3.53]],
  [2, [0.51, 0.91, 1.27, 1.96, 2.61, 3.53, 5.01, 6.42]],
  [5, [1.09, 1.96, 2.76, 4.28, 5.72, 7.79, 11.1, 14.3]],
  [10, [1.96, 3.53, 5.01, 7.79, 10.45, 14.3, 20.47, 26.43]],
  [20, [3.53, 6.42, 9.14, 14.3, 19.25, 26.43, 38, 49.23]],
  [50, [7.79, 14.3, 20.47, 32.27, 43.65, 60.23, 87.06, 113.23]],
]
/** Degraus de ΔT das Tabelas F1.2/F1.3 (K), do maior para o menor. */
export const F13_DEGRAUS = [20, 15, 10, 7, 5, 3, 2, 1] as const
/**
 * cg-18 v4.0, Tabela F1.3, pesos cobertos por campânula: minutos para cada degrau 20→15, 15→10, 10→7, 7→5, 5→3,
 * 3→2, 2→1 K. Usada sempre (é a mais lenta; na caixa de pesos pode ser mais lento ainda).
 */
export const TABELA_F13: ReadonlyArray<readonly [kg: number, minutos: readonly number[]]> = [
  [0.01, [3.2, 4.7, 4.4, 4.4, 7.1, 6, 11.1]],
  [0.02, [4.4, 6.7, 6.3, 6.2, 10.2, 8.6, 16]],
  [0.05, [6.9, 10.4, 9.8, 9.9, 16.1, 13.8, 25.7]],
  [0.1, [9.6, 14.5, 13.7, 13.8, 22.6, 19.5, 36.6]],
  [0.2, [13.3, 20.1, 19.1, 19.2, 31.7, 27.3, 51.6]],
  [0.5, [20.2, 30.7, 29.2, 29.6, 48.9, 42.4, 80.5]],
  [1, [27.7, 42.1, 40.1, 40.7, 67.5, 58.8, 112]],
  [2, [37.8, 57.5, 54.9, 55.8, 92.8, 81, 155]],
  [5, [56.7, 86.4, 82.8, 84.3, 140.5, 123.1, 236.5]],
  [10, [76.8, 117.2, 112.4, 114.7, 191.5, 168.1, 324]],
  [20, [103.8, 158.6, 152.4, 155.6, 260.2, 228.9, 442.2]],
  [50, [154.2, 235.9, 226.9, 232.1, 388.7, 342.7, 664.1]],
]
/**
 * |ΔT| abaixo disto conta como pesos aclimatados, sem convecção. Decisão conservadora da empresa (D3): nenhum
 * valor registrado dispensa a convecção; 0,0 °C (o termômetro não mostra diferença) usa a coluna de 1 K, a menor
 * da Tabela F2.1. Para voltar à leitura da opção 1 do exemplo H1 (0,0 °C = sem convecção), use 0,05.
 */
export const DELTA_T_ACLIMATADO = -1
/** Classes em que a convecção NÃO entra (cg-18 7.1.2.4: só F1 ou melhor). '' (desconhecida) entra. */
const CLASSES_SEM_CONVECCAO: readonly ClassePeso[] = ['F2', 'M1', 'M1-2', 'M2', 'M2-3', 'M3']
export const conveccaoRelevante = (classe: ClassePeso | '' | undefined): boolean =>
  !CLASSES_SEM_CONVECCAO.includes(classe as ClassePeso)

const TOL = 1e-9

/** Linha da tabela: a primeira (em ordem crescente) com massa ≥ kg; `null` acima da última. */
function linhaDaMassa<T>(tabela: ReadonlyArray<readonly [number, T]>, massaKg: number): T | null {
  return tabela.find(([kg]) => massaKg <= kg * (1 + TOL))?.[1] ?? null
}

/**
 * Δm_conv em mg (Tabela F2.1), conservador, sem interpolar:
 * - d = |ΔT|; d < DELTA_T_ACLIMATADO, ou massa ≤ 0 → 0;
 * - coluna: a menor de F21_DELTA_T com d ≤ c (0 ≤ d ≤ 1 → coluna de 1 K); d > 20 K → null (fora da tabela);
 * - linha: a primeira com massa ≥ m (abaixo de 10 g → a de 10 g); acima de 50 kg → null.
 */
export function deltaMConveccaoMg(massaKg: number, deltaTK: number): number | null {
  const d = Math.abs(deltaTK)
  if (!(massaKg > 0) || !Number.isFinite(d) || d < DELTA_T_ACLIMATADO) return 0
  const coluna = F21_DELTA_T.findIndex((c) => d <= c * (1 + TOL))
  const linha = linhaDaMassa(TABELA_F21, massaKg)
  if (coluna < 0 || !linha) return null
  return linha[coluna]
}

/**
 * ΔT restante (K) depois de `minutos` de aclimatação a partir de ΔT0 (Tabela F1.3), conservador:
 * - d0 = |ΔT0|; d0 < DELTA_T_ACLIMATADO → 0; d0 > 20 → d0 (fora da tabela; deltaMConveccaoMg dá null);
 * - linha: a primeira com massa ≥ m, ou a de 50 kg;
 * - começa no menor degrau ≥ d0 (0,5 K → 1; 6 K → 7) e só desce um degrau quando o tempo inteiro dele já
 *   passou; nunca abaixo de 1 K (a tabela não desce de 1 K).
 */
export function deltaTAposAclimatacao(massaKg: number, deltaT0K: number, minutos: number): number {
  const d0 = Math.abs(deltaT0K)
  if (!Number.isFinite(d0) || d0 < DELTA_T_ACLIMATADO) return 0
  if (d0 > F13_DEGRAUS[0] * (1 + TOL)) return d0
  const tempos = linhaDaMassa(TABELA_F13, massaKg) ?? TABELA_F13[TABELA_F13.length - 1][1]
  // Índice do degrau inicial: o menor degrau ≥ d0 (os degraus estão do maior para o menor)
  let i = F13_DEGRAUS.length - 1
  while (i > 0 && d0 > F13_DEGRAUS[i] * (1 + TOL)) i--
  let resto = Math.max(0, minutos || 0)
  while (i < F13_DEGRAUS.length - 1 && resto + TOL >= tempos[i]) {
    resto -= tempos[i]
    i++
  }
  return F13_DEGRAUS[i]
}

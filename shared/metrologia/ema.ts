// Erros máximos admissíveis (EMA): do instrumento (OIML R76-1:2006 Tabela 6; Portaria Inmetro
// 157/2022 Tabela 5) e dos pesos padrão (OIML R111-1:2004 Tabela 1).

import type { ClasseExatidao, ClassePeso, CriterioEma, Faixa } from '../tipos.ts'
import { limparRuido } from './arredondamento.ts'
import type { InstrumentoCalculo } from './tipos.ts'

/** Tolerância relativa nas comparações de fronteira (m/e = 500 tem de cair em 500, não em 499,99…). */
const TOL = 1e-9

export type InstrumentoEma = Pick<InstrumentoCalculo, 'classe' | 'tipoFaixas' | 'faixas'>

/** Faixas em ordem crescente de Max (cópia; a entrada não é alterada). */
export function faixasOrdenadas(faixas: readonly Faixa[]): Faixa[] {
  return [...faixas].sort((a, b) => a.max - b.max)
}

/**
 * Faixa (ou intervalo parcial) que contém o valor: a primeira, em ordem crescente de Max, com valor ≤ Max
 * (fronteira inclusiva no limite superior); acima de todas, a última. Instrumento de faixa única: a primeira.
 * Vale para multi-intervalo (EMA e d pelo intervalo parcial) e para múltiplas faixas (a menor que comporta a carga).
 */
export function faixaDoValor(valor: number, instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>): Faixa {
  const faixas = faixasOrdenadas(instrumento.faixas)
  if (instrumento.tipoFaixas === 'UNICA' || faixas.length === 1) return faixas[0]
  const v = Math.abs(valor)
  return faixas.find((f) => v <= f.max * (1 + TOL)) ?? faixas[faixas.length - 1]
}

/** Mudanças de EMA da R76 (em múltiplos de e): até L1 → 0,5e; até L2 → 1,0e; acima → 1,5e (verificação inicial). */
export const LIMIARES_EMA: Record<Exclude<ClasseExatidao, ''>, readonly [number, number]> = {
  I: [50_000, 200_000],
  II: [5_000, 20_000],
  III: [500, 2_000],
  IIII: [50, 200],
}

/** Multiplicadores de e em cada um dos três trechos, por critério. */
const MULTIPLICADORES: Record<Exclude<CriterioEma, 'CLIENTE'>, readonly [number, number, number]> = {
  /** R76 Tabela 6 (= aprovação de modelo da Portaria 157). */
  OIML_INICIAL: [0.5, 1, 1.5],
  /** R76 3.5.2: em serviço = dobro da verificação inicial. */
  OIML_SERVICO: [1, 2, 3],
  /** Portaria 157/2022 Tabela 5, coluna "Verificação" (inicial e subsequente). */
  PORTARIA_VERIFICACAO: [1, 2, 2],
  /** Portaria 157/2022 2.5.3 / 8.9: em serviço = dobro da verificação. */
  PORTARIA_SERVICO: [2, 4, 4],
}

/**
 * Trechos do EMA de uma classe, em múltiplos de e (para a tabela impressa da folha de campo em branco):
 * [{ ate: 500, multiplo: 2 }, { ate: null, multiplo: 4 }] — `ate` em e (null = acima do anterior); trechos
 * vizinhos com o mesmo múltiplo saem juntos.
 */
export function trechosEma(
  classe: Exclude<ClasseExatidao, ''>,
  criterio: Exclude<CriterioEma, 'CLIENTE'>,
): Array<{ ate: number | null; multiplo: number }> {
  const [l1, l2] = LIMIARES_EMA[classe]
  const m = MULTIPLICADORES[criterio]
  const trechos = [
    { ate: l1 as number | null, multiplo: m[0] },
    { ate: l2 as number | null, multiplo: m[1] },
    { ate: null, multiplo: m[2] },
  ]
  return trechos
    .filter((t, i) => i === trechos.length - 1 || t.multiplo !== trechos[i + 1].multiplo)
    .map((t, i, lista) => (i === lista.length - 1 ? { ...t, ate: null } : t))
}

/**
 * EMA do instrumento na carga m (unidade da balança), pelo critério escolhido.
 * Em multi-intervalo usa o e da faixa parcial onde m está; fronteiras inclusivas no limite superior
 * (m = 500e ainda é 0,5e na classe III). Classe '' dá null, exceto no critério CLIENTE, que devolve a
 * tolerância do cliente (null se não informada).
 */
export function emaInstrumento(
  m: number,
  instrumento: InstrumentoEma,
  criterio: CriterioEma,
  toleranciaCliente = 0,
): number | null {
  if (criterio === 'CLIENTE') return toleranciaCliente > 0 ? toleranciaCliente : null
  if (!instrumento.classe || !instrumento.faixas.length) return null
  const { e } = faixaDoValor(m, instrumento)
  if (!(e > 0)) return null
  const [l1, l2] = LIMIARES_EMA[instrumento.classe]
  const n = Math.abs(m) / e
  const trecho = n <= l1 * (1 + TOL) ? 0 : n <= l2 * (1 + TOL) ? 1 : 2
  return limparRuido(MULTIPLICADORES[criterio][trecho] * e)
}

// ---- Pesos padrão (OIML R111-1:2004, Tabela 1) -----------------------------------------------

export const CLASSES_PESO: readonly ClassePeso[] = ['E1', 'E2', 'F1', 'F2', 'M1', 'M1-2', 'M2', 'M2-3', 'M3']

const _ = null

/** [nominal em g, EMA em mg por classe na ordem de CLASSES_PESO]; null = nominal inexistente na classe. */
const TABELA_R111: ReadonlyArray<readonly [number, ReadonlyArray<number | null>]> = [
  [5_000_000, [_, _, 25_000, 80_000, 250_000, 500_000, 800_000, 1_600_000, 2_500_000]],
  [2_000_000, [_, _, 10_000, 30_000, 100_000, 200_000, 300_000, 600_000, 1_000_000]],
  [1_000_000, [_, 1_600, 5_000, 16_000, 50_000, 100_000, 160_000, 300_000, 500_000]],
  [500_000, [_, 800, 2_500, 8_000, 25_000, 50_000, 80_000, 160_000, 250_000]],
  [200_000, [_, 300, 1_000, 3_000, 10_000, 20_000, 30_000, 60_000, 100_000]],
  [100_000, [_, 160, 500, 1_600, 5_000, 10_000, 16_000, 30_000, 50_000]],
  [50_000, [25, 80, 250, 800, 2_500, 5_000, 8_000, 16_000, 25_000]],
  [20_000, [10, 30, 100, 300, 1_000, _, 3_000, _, 10_000]],
  [10_000, [5, 16, 50, 160, 500, _, 1_600, _, 5_000]],
  [5_000, [2.5, 8, 25, 80, 250, _, 800, _, 2_500]],
  [2_000, [1, 3, 10, 30, 100, _, 300, _, 1_000]],
  [1_000, [0.5, 1.6, 5, 16, 50, _, 160, _, 500]],
  [500, [0.25, 0.8, 2.5, 8, 25, _, 80, _, 250]],
  [200, [0.1, 0.3, 1, 3, 10, _, 30, _, 100]],
  [100, [0.05, 0.16, 0.5, 1.6, 5, _, 16, _, 50]],
  [50, [0.03, 0.1, 0.3, 1, 3, _, 10, _, 30]],
  [20, [0.025, 0.08, 0.25, 0.8, 2.5, _, 8, _, 25]],
  [10, [0.02, 0.06, 0.2, 0.6, 2, _, 6, _, 20]],
  [5, [0.016, 0.05, 0.16, 0.5, 1.6, _, 5, _, 16]],
  [2, [0.012, 0.04, 0.12, 0.4, 1.2, _, 4, _, 12]],
  [1, [0.01, 0.03, 0.1, 0.3, 1, _, 3, _, 10]],
  [0.5, [0.008, 0.025, 0.08, 0.25, 0.8, _, 2.5, _, _]],
  [0.2, [0.006, 0.02, 0.06, 0.2, 0.6, _, 2, _, _]],
  [0.1, [0.005, 0.016, 0.05, 0.16, 0.5, _, 1.6, _, _]],
  [0.05, [0.004, 0.012, 0.04, 0.12, 0.4, _, _, _, _]],
  [0.02, [0.003, 0.01, 0.03, 0.1, 0.3, _, _, _, _]],
  [0.01, [0.003, 0.008, 0.025, 0.08, 0.25, _, _, _, _]],
  [0.005, [0.003, 0.006, 0.02, 0.06, 0.2, _, _, _, _]],
  [0.002, [0.003, 0.006, 0.02, 0.06, 0.2, _, _, _, _]],
  [0.001, [0.003, 0.006, 0.02, 0.06, 0.2, _, _, _, _]],
]

/** Nominais da Tabela 1 da R111, em gramas, do maior para o menor (5 000 kg … 1 mg). */
export const NOMINAIS_R111: readonly number[] = TABELA_R111.map(([n]) => n)

function linhaR111(nominalGramas: number) {
  return TABELA_R111.find(([n]) => Math.abs(n - nominalGramas) <= TOL * n)
}

/** Nominal da série 1-2-5 imediatamente inferior (ou igual), na mesma década: 25 kg → 20 kg; 3 g → 2 g; 7 t → 5 t. */
function nominalSerie125(nominal: number): number {
  let ordem = Math.floor(Math.log10(nominal))
  if (nominal >= 10 ** (ordem + 1) * (1 - TOL)) ordem += 1
  else if (nominal < 10 ** ordem * (1 - TOL)) ordem -= 1
  const base = 10 ** ordem
  const mantissa = nominal / base
  const degrau = mantissa >= 5 * (1 - TOL) ? 5 : mantissa >= 2 * (1 - TOL) ? 2 : 1
  return ordem >= 0 ? degrau * base : degrau / 10 ** -ordem
}

/**
 * EMA de um peso da classe (mg) pela Tabela 1 da R111. Nominal fora da tabela: usa o nominal
 * imediatamente inferior da mesma década na série 1-2-5 (25 kg → 20 kg). Sem correspondência, ou
 * nominal inexistente na classe ("—" na tabela), null.
 */
export function emaPeso(nominalGramas: number, classe: ClassePeso | ''): number | null {
  if (!classe || !(nominalGramas > 0)) return null
  const coluna = CLASSES_PESO.indexOf(classe)
  if (coluna < 0) return null
  const linha = linhaR111(nominalGramas) ?? linhaR111(nominalSerie125(nominalGramas))
  return linha?.[1][coluna] ?? null
}

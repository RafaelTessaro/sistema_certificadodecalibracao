import { casasDecimais } from '#shared/metrologia/index.ts'
import type { Balanca } from '#shared/tipos.ts'

/** Maior capacidade da balança. */
export const maxDe = (b: Pick<Balanca, 'faixas'>) => Math.max(0, ...b.faixas.map((f) => f.max))

/** Casas decimais das leituras (as da menor divisão). */
export const casasDe = (b: Pick<Balanca, 'faixas'>) => Math.max(0, ...b.faixas.map((f) => casasDecimais(f.d)))

/** Menor divisão da balança. */
export const menorD = (b: Pick<Balanca, 'faixas'>) => Math.min(...b.faixas.map((f) => f.d).filter((d) => d > 0), Infinity)

import { deltaTMaximo, ehRodoviaria } from '#shared/dominio.ts'
import { casasDecimais } from '#shared/metrologia/index.ts'
import type { Balanca, ClasseExatidao } from '#shared/tipos.ts'

/** Maior capacidade da balança. */
export const maxDe = (b: Pick<Balanca, 'faixas'>) => Math.max(0, ...b.faixas.map((f) => f.max))

/** Casas decimais das leituras (as da menor divisão). */
export const casasDe = (b: Pick<Balanca, 'faixas'>) => Math.max(0, ...b.faixas.map((f) => casasDecimais(f.d)))

/** Menor divisão da balança. */
export const menorD = (b: Pick<Balanca, 'faixas'>) => Math.min(...b.faixas.map((f) => f.d).filter((d) => d > 0), Infinity)

/** Aviso da variação da temperatura acima do limite da classe (1 °C na I; 3 °C na II; 5 °C nas demais e sem classe). */
export function textoDeltaT(deltaT: number, classe: ClasseExatidao): string {
  const variou = String(Math.round(deltaT * 10) / 10).replace('.', ',')
  const quem = classe ? `balanças classe ${classe}` : 'balanças sem classe'
  return `A temperatura variou ${variou} °C durante a calibração. O limite para ${quem} é ${deltaTMaximo(classe)} °C; registre nas observações.`
}

/**
 * Dica da carga da repetibilidade (POP 7.9): faixa única, de 50 % a 100 % da capacidade (na rodoviária pode ser
 * menos); multi-intervalo e múltiplas faixas, um ensaio por intervalo (ou faixa) de d diferente.
 */
export function dicaRepetibilidade(b: Pick<Balanca, 'tipoFaixas' | 'faixas' | 'tipo' | 'receptor'>): string {
  if (b.tipoFaixas !== 'UNICA' && b.faixas.length > 1)
    return `Faça um ensaio por ${b.tipoFaixas === 'MULTI_INTERVALO' ? 'intervalo' : 'faixa'}: nos de baixo, com carga logo abaixo do Max dele; no de cima, de 50 % a 100 % de Max, sem coincidir com o Max de baixo (não precisa ser peso padrão).`
  return `Use de 50 % a 100 % da capacidade${ehRodoviaria(b) ? ' (na rodoviária, pode ser menos)' : ''} (não precisa ser peso padrão).`
}

/**
 * Os ensaios de repetibilidade a acrescentar: sem nenhum, todos os sugeridos; senão, o primeiro sugerido que
 * ainda não está na lista (pela carga) ou, com todos lá, o do intervalo de cima de novo (outra carga, a pedido).
 */
export function proximosEnsaiosRepetibilidade<T extends { carga: number }>(
  sugeridos: T[],
  atuais: Array<{ carga: number }>,
): T[] {
  if (!sugeridos.length) return []
  if (!atuais.length) return sugeridos
  const falta = sugeridos.find((s) => !atuais.some((a) => Math.abs(a.carga - s.carga) <= 1e-9 * Math.max(1, s.carga)))
  return [falta ?? sugeridos.at(-1)!]
}

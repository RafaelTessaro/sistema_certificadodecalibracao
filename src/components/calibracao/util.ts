import { deltaTMaximo, ehRodoviaria, metodoExcentricidadePadrao, temLeiturasExcentricidade } from '#shared/dominio.ts'
import { casasDecimais, leituraImplausivel } from '#shared/metrologia/index.ts'
import type { ResultadoPonto } from '#shared/metrologia/tipos.ts'
import type { Balanca, CalibracaoInput, ClasseExatidao, PontoIndicacao } from '#shared/tipos.ts'

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

/**
 * O cliente faz o ajuste interno (CAL) antes dos ensaios, se a balança tiver (POP 7.11): sempre na classe I e quando
 * d é menor que 1/100 000 de Max.
 */
export function pedeAjusteInterno(b: Pick<Balanca, 'classe' | 'faixas'>): boolean {
  return b.classe === 'I' || menorD(b) < maxDe(b) / 100_000
}

/**
 * A classe da balança mudou no meio da calibração ("Corrigir cadastro"): o ensaio de excentricidade ainda sem leituras
 * passa para o método da classe nova (POP 7.10: 1; na classe I, 3). Com leituras, fica como foi feito.
 */
export function comMetodoDaClasse<T extends Pick<CalibracaoInput, 'excentricidade'>>(f: T, classe: ClasseExatidao): T {
  const metodo = metodoExcentricidadePadrao(classe)
  if (f.excentricidade.metodo === metodo || temLeiturasExcentricidade(f.excentricidade)) return f
  return { ...f, excentricidade: { ...f.excentricidade, metodo } }
}

/**
 * A etapa Repetibilidade está feita: algum ensaio com 2 leituras ou mais e nenhum ensaio com carga e sem leitura (o
 * copiado do último certificado, ou o da carga sugerida, que ficou para trás: registre as leituras ou remova-o).
 */
export const repetibilidadeCompleta = (ensaios: ReadonlyArray<{ carga: number; n: number }>) =>
  ensaios.some((r) => r.n >= 2) && ensaios.every((r) => r.n > 0 || !(r.carga > 0))

/**
 * Cor do campo da leitura: fora do esperado para a carga (provável erro de digitação: vírgula esquecida, outra unidade;
 * a mesma regra da pendência do cálculo, `leituraImplausivel`), erro; fora do EMA, atenção.
 */
export function tomLeitura(
  p: Pick<PontoIndicacao, 'carga' | 'crescente' | 'decrescente'>,
  r: ResultadoPonto | undefined,
  lado: 'crescente' | 'decrescente',
  balanca: Pick<Balanca, 'tipoFaixas' | 'faixas'>,
): 'normal' | 'erro' | 'atencao' {
  // A carga digitada (a do cálculo é a soma dos pesos; quando não fecham, a diferença já é pendência)
  if (leituraImplausivel(p[lado], p.carga, balanca)) return 'erro'
  if (r?.[lado] && r.conformidade === 'NAO_CONFORME') return 'atencao'
  return 'normal'
}

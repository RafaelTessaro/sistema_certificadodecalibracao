// Sugestões para o técnico montar os ensaios: pontos de carga, carga e posições da excentricidade,
// carga e número de leituras da repetibilidade (EURAMET cg-18 §5; DOQ-CGCRE-097 10.4.1; OIML R76 A.4).

import type { ClasseExatidao, Faixa, Receptor, Unidade } from '../tipos.ts'
import {
  algarismosSignificativos,
  arredondarMeioPar,
  arredondarSignificativos,
  casasDecimais,
  ordemDeGrandeza,
} from './arredondamento.ts'
import { faixaDoValor, faixasOrdenadas, LIMIARES_EMA } from './ema.ts'
import { converterMassa } from './pesos.ts'
import type { InstrumentoCalculo } from './tipos.ts'

const TOL = 1e-9

/** Valor "redondo" para carga sugerida: até 3 algarismos significativos fica como está (22 500); senão, 2 (1 125 → 1 100). */
function redondo(valor: number): number {
  return algarismosSignificativos(valor) <= 3 ? valor : arredondarSignificativos(valor, 2)
}

/** Múltiplo de `passo` mais próximo (sem ruído do binário); `passo` ≤ 0 deixa como está. */
function multiplo(valor: number, passo: number): number {
  if (!(passo > 0)) return valor
  const n = Math.max(1, Math.round(valor / passo))
  return arredondarMeioPar(n * passo, casasDecimais(passo))
}

/**
 * Valor "redondo" de 1 algarismo e meio, igual ou acima de `valor`: o menor múltiplo de 0,5·10^ordem que não
 * fica abaixo dele (73,3 → 75; 6,67 → 7; 10 → 10; 6 000 → 6 000).
 */
function meioRedondoAcima(valor: number): number {
  if (!(valor > 0)) return 0
  const ordem = ordemDeGrandeza(valor)
  const passo = ordem >= 1 ? 5 * 10 ** (ordem - 1) : 5 / 10 ** (1 - ordem)
  const n = Math.max(1, Math.ceil(Number((valor / passo).toPrecision(12)) - TOL))
  return arredondarMeioPar(n * passo, casasDecimais(passo))
}

/**
 * Pontos sugeridos para o erro de indicação (cg-18 §5.2; R76 A.4.4.1; POP 7.7): 0, Min (quando marcada),
 * ~25, 50, 75 e 100 % de Max em valores redondos múltiplos de e, mais as mudanças de EMA da classe (500e e
 * 2000e na classe III; 5 000e e 20 000e na II…) que caírem dentro da faixa. Em multi-intervalo, o e é o do
 * intervalo parcial do ponto. Sem duplicados, em ordem crescente, na unidade da balança.
 * Classe I (com a `unidade`): os ~25, 50 e 75 % de Max em múltiplos de 10 g, que se montam só com peças de 10 g
 * ou mais (POP 6.1: cada peça soma a sua incerteza e a sua convecção; 220 g → 60 g = 50 g + 10 g, 110 g e
 * 170 g = 100 g + 50 g + 20 g). Com Max abaixo de 40 g não dá (o ponto de 25 % já fica abaixo de 10 g).
 */
export function sugerirPontos(
  instrumento: Pick<InstrumentoCalculo, 'classe' | 'tipoFaixas' | 'faixas'> & { min?: number; unidade?: Unidade },
): number[] {
  const faixas = faixasOrdenadas(instrumento.faixas)
  if (!faixas.length) return []
  const max = faixas[faixas.length - 1].max
  const pontos = [0, max]
  const min = instrumento.min ?? 0
  if (min > 0 && min < max * (1 - TOL)) pontos.push(min)
  const dezGramas = instrumento.classe === 'I' && instrumento.unidade ? converterMassa(10, 'g', instrumento.unidade) : 0
  const passoClasseI = dezGramas > 0 && 0.25 * max >= dezGramas * (1 - TOL) ? dezGramas : 0
  for (const fracao of [0.25, 0.5, 0.75]) {
    const v = redondo(fracao * max)
    const e = faixaDoValor(v, instrumento).e
    pontos.push(multiplo(v, passoClasseI >= e ? passoClasseI : e))
  }
  if (instrumento.classe) {
    const [l1, l2] = LIMIARES_EMA[instrumento.classe]
    let inferior = 0
    for (const f of faixas) {
      for (const n of [l1, l2]) {
        const c = arredondarMeioPar(n * f.e, casasDecimais(f.e))
        if (f.e > 0 && c > inferior * (1 + TOL) && c < max * (1 - TOL) && c <= f.max * (1 + TOL)) pontos.push(c)
      }
      if (instrumento.tipoFaixas !== 'UNICA') inferior = f.max
    }
  }
  const ordenados = pontos.filter((p) => p >= 0 && p <= max * (1 + TOL)).sort((a, b) => a - b)
  return ordenados.filter((p, i) => i === 0 || Math.abs(p - ordenados[i - 1]) > TOL * max)
}

/**
 * Carga mínima do ensaio de excentricidade (DOQ-CGCRE-097 10.4.1; POP 7.10, Tabela 5), pelo maior Max (na
 * unidade da balança): 1/3 de Max até 500 kg, 1/5 de Max acima de 500 kg até 3 000 kg e 1/10 de Max acima de
 * 3 000 kg. `fracao`, como o POP escreve: "1/3 de Max", "1/5 de Max" ou "1/10 de Max" ('' sem Max).
 */
export function minimoExcentricidade(max: number, unidade: Unidade): { minimo: number; fracao: string } {
  if (!(max > 0)) return { minimo: 0, fracao: '' }
  const maxKg = converterMassa(max, unidade, 'kg')
  const divisor = maxKg <= 500 * (1 + TOL) ? 3 : maxKg <= 3000 * (1 + TOL) ? 5 : 10
  return { minimo: max / divisor, fracao: `1/${divisor} de Max` }
}

/**
 * Valores nominais da série 1-2-5 dos pesos (OIML R 111: 1, 2 e 5 × 10ⁿ) de `de` a `ate`, inclusive, em ordem
 * crescente. Vale em qualquer unidade de massa do sistema (mg, g, kg e t são potências de 10 entre si).
 */
function serie125(de: number, ate: number): number[] {
  if (!(de > 0) || !(ate >= de)) return []
  const valores: number[] = []
  for (let ordem = Math.floor(Math.log10(de)) - 1; ordem <= Math.floor(Math.log10(ate)) + 1; ordem++)
    for (const m of [1, 2, 5]) {
      const v = Number((m * 10 ** ordem).toPrecision(12))
      if (v >= de * (1 - TOL) && v <= ate * (1 + TOL)) valores.push(v)
    }
  return valores
}

/**
 * Carga do ensaio de excentricidade: o mínimo da Tabela 5 do POP (`minimoExcentricidade`) num valor redondo
 * igual ou acima dele (nunca abaixo). Na classe I, uma peça só (POP 7.11): o menor nominal da série 1-2-5 igual
 * ou acima de 1/3 de Max (100 g numa balança de 220 g). Na unidade da balança.
 */
export function cargaExcentricidade(max: number, unidade: Unidade, classe?: ClasseExatidao | null): number {
  const { minimo } = minimoExcentricidade(max, unidade)
  if (!(minimo > 0)) return 0
  const peca = classe === 'I' ? serie125(minimo, max)[0] : undefined
  return peca ?? Math.min(max, meioRedondoAcima(minimo))
}

/**
 * A carga de excentricidade está abaixo do mínimo da Tabela 5 do POP (a copiada de um certificado antigo, que
 * arredondava para o valor mais próximo, ou a digitada)? Sem carga ou sem Max, não.
 */
export function excentricidadeAbaixoDoMinimo(carga: number, max: number, unidade: Unidade): boolean {
  const { minimo } = minimoExcentricidade(max, unidade)
  return carga > 0 && minimo > 0 && carga < minimo * (1 - 1e-6)
}

/**
 * Onde falta o ensaio de repetibilidade, para os avisos: "no intervalo até 6 kg", "nas faixas até 6 kg e até
 * 15 kg". `nome`: "intervalo" (multi-intervalo) ou "faixa" (múltiplas faixas).
 */
export function ondeFaltaRepetibilidade(
  tipoFaixas: InstrumentoCalculo['tipoFaixas'],
  faixas: string[],
): { onde: string; nome: 'intervalo' | 'faixa' } {
  const nome = tipoFaixas === 'MULTI_INTERVALO' ? 'intervalo' : 'faixa'
  const artigo =
    nome === 'intervalo' ? (faixas.length > 1 ? 'nos intervalos' : 'no intervalo') : faixas.length > 1 ? 'nas faixas' : 'na faixa'
  const lista = faixas.length > 1 ? `${faixas.slice(0, -1).join(', ')} e ${faixas.at(-1)}` : (faixas[0] ?? '')
  return { onde: `${artigo} ${lista}`, nome }
}

/**
 * Multi-intervalo e múltiplas faixas: os intervalos (ou faixas) de d diferente sem ensaio de repetibilidade
 * entre as `cargas` (POP 7.9: um ensaio em cada). A carga é do intervalo que a comporta (o menor); um d
 * repetido em mais de um conta uma vez (fica o de maior Max). Faixa única: nenhum.
 */
export function faixasSemRepetibilidade(
  instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>,
  cargas: number[],
): Faixa[] {
  const faixas = faixasOrdenadas(instrumento.faixas)
  if (instrumento.tipoFaixas === 'UNICA' || faixas.length < 2) return []
  const iguais = (a: number, b: number) => Math.abs(a - b) <= TOL * Math.max(Math.abs(a), Math.abs(b))
  const cobertos = cargas.filter((c) => c > 0).map((c) => faixaDoValor(c, instrumento).d)
  return faixas.filter((f, i) => !faixas.slice(i + 1).some((g) => iguais(g.d, f.d)) && !cobertos.some((d) => iguais(d, f.d)))
}

/**
 * Massa mínima de pesos padrão (kg) em cada etapa com cargas de substituição (POP 7.12, Tabela 7), pelo Max em
 * kg: 1 000 kg até 5 t; 5 000 kg até 30 t; 10 000 kg até 60 t; 15 000 kg até 80 t; 20 000 kg acima. Abaixo de
 * 1 000 kg não se usa substituição (0).
 */
export function pesosMinimosSubstituicao(maxKg: number): number {
  if (!(maxKg >= 1000 * (1 - TOL))) return 0
  const tabela: Array<[number, number]> = [
    [5_000, 1_000],
    [30_000, 5_000],
    [60_000, 10_000],
    [80_000, 15_000],
  ]
  return tabela.find(([ate]) => maxKg <= ate * (1 + TOL))?.[1] ?? 20_000
}

/** A regra da carga mínima da excentricidade, para as dicas da tela e da folha. */
export const REGRA_CARGA_EXCENTRICIDADE = 'no mínimo 1/3 de Max até 500 kg, 1/5 de Max até 3 t e 1/10 de Max acima'

/**
 * Rótulos das posições do ensaio de excentricidade por tipo de receptor (cg-18 Fig. 5.3-1; R76 A.4.7).
 * A primeira posição é a referência dos desvios. APOIOS e TANQUE: uma posição por apoio (4 quando o
 * número de apoios não foi informado). GANCHO: lista vazia (ensaio não aplicável; a carga se centra sozinha).
 */
export function posicoesExcentricidade(receptor: Receptor, apoios = 0): string[] {
  const nApoios = apoios >= 1 ? Math.floor(apoios) : 4
  switch (receptor) {
    case 'RETANGULAR':
      return ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita']
    case 'CIRCULAR':
      return ['Centro', 'Frente (0°)', 'Direita (90°)', 'Trás (180°)', 'Esquerda (270°)']
    case 'APOIOS':
    case 'TANQUE':
      return Array.from({ length: nApoios }, (_, i) => `Apoio ${i + 1}`)
    case 'RODOVIARIA':
      return ['Início (ida)', 'Meio (ida)', 'Fim (ida)', 'Início (volta)', 'Meio (volta)', 'Fim (volta)']
    case 'GANCHO':
      return []
  }
}

/** Leituras mínimas da repetibilidade: 5, ou 3 com carga de 100 kg ou mais (POP 7.9, Tabela 4). */
const leiturasMinimas = (carga: number, unidade: Unidade) => (converterMassa(carga, unidade, 'kg') >= 100 * (1 - TOL) ? 3 : 5)

/**
 * Repetibilidade sugerida (cg-18 §5.1): carga de ~0,5·Max (valor redondo) e o número mínimo de
 * leituras, 5 (ou 3 quando a carga é de 100 kg ou mais). Com menos de 10 leituras, k sai maior que 2.
 */
export function repetibilidadeSugerida(max: number, unidade: Unidade = 'kg'): { carga: number; leituras: number } {
  if (!(max > 0)) return { carga: 0, leituras: 5 }
  const carga = redondo(max / 2)
  return { carga, leituras: leiturasMinimas(carga, unidade) }
}

/**
 * Ensaios de repetibilidade sugeridos (POP 7.9). Na classe I, sempre 10 leituras com uma peça só (POP, Tabela 4).
 * Faixa única: um, a ~0,5·Max (`repetibilidadeSugerida`); na classe I, o menor nominal da série 1-2-5 entre
 * metade de Max e Max (200 g numa balança de 220 g).
 * Multi-intervalo e múltiplas faixas: um por intervalo (ou faixa) de d diferente; nos de baixo, uma carga
 * redonda logo abaixo do Max dele (~0,8·Max, dentro do intervalo; na classe I, a maior peça que cabe nele); no de
 * cima, ~0,5·Max, sem coincidir com o Max do intervalo de baixo (senão, um valor redondo entre os dois: 15/30 kg →
 * 12 kg e 25 kg). Na unidade da balança, do menor para o maior.
 */
export function repetibilidadesSugeridas(
  instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'> & { classe?: ClasseExatidao },
  unidade: Unidade = 'kg',
): Array<{ carga: number; leituras: number }> {
  const sugeridas = repetibilidadesPorFaixa(instrumento, unidade)
  if (instrumento.classe !== 'I') return sugeridas
  const faixas = faixasOrdenadas(instrumento.faixas)
  const varias = instrumento.tipoFaixas !== 'UNICA' && faixas.length > 1
  return sugeridas.map((r, i) => {
    // Uma peça só (POP 7.11). No intervalo de cima (ou na faixa única): a menor entre metade de Max e Max, acima do
    // Max do de baixo. Nos de baixo: a maior que cabe nele (no multi-intervalo, acima do Max do anterior). Sem peça
    // da série no intervalo, a carga de sempre.
    const f = varias ? faixas[i] : faixas.at(-1)
    if (!f) return { ...r, leituras: 10 }
    const acimaDe = (max: number) => max * (1 + 1e-6)
    const peca =
      !varias || i === faixas.length - 1
        ? serie125(Math.max(f.max / 2, varias ? acimaDe(faixas[i - 1].max) : 0), f.max)[0]
        : serie125(instrumento.tipoFaixas === 'MULTI_INTERVALO' && i > 0 ? acimaDe(faixas[i - 1].max) : f.max / 10, f.max).at(-1)
    return { carga: peca ?? r.carga, leituras: 10 }
  })
}

function repetibilidadesPorFaixa(
  instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>,
  unidade: Unidade,
): Array<{ carga: number; leituras: number }> {
  const faixas = faixasOrdenadas(instrumento.faixas)
  const max = faixas.at(-1)?.max ?? 0
  if (instrumento.tipoFaixas === 'UNICA' || faixas.length < 2) return [repetibilidadeSugerida(max, unidade)]
  const cargas = faixas.map((f, i) => {
    const anterior = instrumento.tipoFaixas === 'MULTI_INTERVALO' && i > 0 ? faixas[i - 1].max : 0
    if (i < faixas.length - 1) {
      const c = redondo(Number((0.8 * f.max).toPrecision(12)))
      return c > anterior * (1 + TOL) && c < f.max * (1 - TOL) ? c : redondo(Number(((anterior + f.max) / 2).toPrecision(12)))
    }
    const meio = redondo(max / 2)
    const abaixo = faixas[i - 1].max
    return meio > abaixo * (1 + TOL) ? meio : Math.min(max, meioRedondoAcima((abaixo + max) / 2))
  })
  return cargas.map((carga) => ({ carga, leituras: leiturasMinimas(carga, unidade) }))
}

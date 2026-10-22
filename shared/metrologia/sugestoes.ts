// Sugestões para o técnico montar os ensaios: pontos de carga, carga e posições da excentricidade,
// carga e número de leituras da repetibilidade (EURAMET cg-18 5; DOQ-CGCRE-097 10.3 e 10.4; OIML R76 A.4).

import type { Faixa, Receptor, Unidade } from '../tipos.ts'
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

/** Passo do valor "redondo" de 1 algarismo e meio: 0,5·10^ordem (73,3 → 5; 166,7 → 50; 1 066,7 → 500). */
function passoMeioRedondo(valor: number): number {
  const ordem = ordemDeGrandeza(valor)
  return ordem >= 1 ? 5 * 10 ** (ordem - 1) : 5 / 10 ** (1 - ordem)
}

/** O menor múltiplo de 0,5·10^ordem igual ou maior que o valor (166,7 → 200; 120 → 150; 10 → 10). */
function meioRedondoParaCima(valor: number): number {
  if (!(valor > 0)) return 0
  const passo = passoMeioRedondo(valor)
  const n = Math.max(1, Math.ceil(Number((valor / passo).toPrecision(12))))
  return arredondarMeioPar(n * passo, casasDecimais(passo))
}

/** O maior múltiplo de 0,5·10^ordem igual ou menor que o valor (10 200 → 10 000; 5,1 → 5); 0 se não houver. */
function meioRedondoParaBaixo(valor: number): number {
  if (!(valor > 0)) return 0
  const passo = passoMeioRedondo(valor)
  const n = Math.floor(Number((valor / passo).toPrecision(12)))
  return n > 0 ? arredondarMeioPar(n * passo, casasDecimais(passo)) : 0
}

/**
 * Pontos sugeridos para o erro de indicação (cg-18 5.2; R76 A.4.4.1): 0, ~25, 50, 75 e 100 % de Max em
 * valores redondos múltiplos de e, mais as mudanças de EMA da classe (500e e 2000e na classe III; 5 000e e
 * 20 000e na II…) que caírem dentro da faixa. Em multi-intervalo, o e é o do intervalo parcial do ponto.
 * Sem duplicados, em ordem crescente, na unidade da balança.
 */
export function sugerirPontos(instrumento: Pick<InstrumentoCalculo, 'classe' | 'tipoFaixas' | 'faixas'>): number[] {
  const faixas = faixasOrdenadas(instrumento.faixas)
  if (!faixas.length) return []
  const max = faixas[faixas.length - 1].max
  const pontos = [0, max]
  for (const fracao of [0.25, 0.5, 0.75]) {
    const v = redondo(fracao * max)
    pontos.push(multiplo(v, faixaDoValor(v, instrumento).e))
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
 * Carga mínima do ensaio de excentricidade (DOQ-CGCRE-097, 10.4): Max/3 até 500 kg, Max/5 acima de 500 kg
 * até 3 000 kg e Max/10 acima de 3 000 kg. `minimo` na unidade da balança, sem arredondar.
 */
export function fracaoExcentricidade(max: number, unidade: Unidade): { divisor: 3 | 5 | 10; minimo: number } {
  const maxKg = max > 0 ? converterMassa(max, unidade, 'kg') : 0
  const divisor = maxKg <= 500 * (1 + TOL) ? 3 : maxKg <= 3000 * (1 + TOL) ? 5 : 10
  return { divisor, minimo: max > 0 ? max / divisor : 0 }
}

/**
 * Carga sugerida do ensaio de excentricidade: a fração do DOQ-CGCRE-097, 10.4 (`fracaoExcentricidade`)
 * arredondada PARA CIMA para um valor redondo (múltiplo de 0,5·10^ordem), nunca abaixo do mínimo:
 * 500 kg → 200 kg; 600 kg → 150 kg; 3 200 g → 1 500 g; 120 t → 15 t; 30 kg → 10 kg. Na unidade da balança.
 */
export function cargaExcentricidade(max: number, unidade: Unidade): number {
  if (!(max > 0)) return 0
  return meioRedondoParaCima(fracaoExcentricidade(max, unidade).minimo)
}

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

/**
 * Posição de referência de cada posição do ensaio de excentricidade. Nos receptores comuns, a posição 1 (o
 * centro). Com carga rolante (rodoviária e ferroviária), as posições vêm em passagens de 3 (início, meio e
 * fim; na ida e na volta) e a referência é o meio da mesma passagem, como no cg-18 H3 ("diferença máxima
 * entre a indicação no centro e as duas indicações descentradas"); com um número de posições que não é
 * múltiplo de 3, uma passagem só, com a referência no meio.
 */
export function referenciasExcentricidade(n: number, cargaRolante = false): number[] {
  if (!cargaRolante) return Array.from({ length: n }, () => 0)
  const passagem = n % 3 === 0 ? 3 : n
  return Array.from({ length: n }, (_, i) => Math.floor(i / passagem) * passagem + Math.floor((passagem - 1) / 2))
}

const leiturasMinimas = (carga: number, unidade: Unidade) => (converterMassa(carga, unidade, 'kg') >= 100 * (1 - TOL) ? 3 : 5)

/**
 * Repetibilidade sugerida (cg-18 5.1): carga de ~0,5·Max (valor redondo) e o número mínimo de
 * leituras, 5 (ou 3 quando a carga é de 100 kg ou mais). Com menos de 10 leituras, k sai maior que 2.
 */
export function repetibilidadeSugerida(max: number, unidade: Unidade = 'kg'): { carga: number; leituras: number } {
  if (!(max > 0)) return { carga: 0, leituras: 5 }
  const carga = redondo(max / 2)
  return { carga, leituras: leiturasMinimas(carga, unidade) }
}

/**
 * Faixas (múltiplas faixas) ou intervalos (multi-intervalo) que pedem um ensaio de repetibilidade próprio
 * (DOQ-CGCRE-097, 10.3: "nas diferentes faixas"): um por d diferente, em ordem crescente de Max. Faixa
 * única, ou todas com o mesmo d: nenhuma (o ensaio de ~0,5·Max basta).
 */
function faixasComDProprio(instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>): Faixa[] {
  if (instrumento.tipoFaixas === 'UNICA') return []
  const faixas = faixasOrdenadas(instrumento.faixas)
  if (new Set(faixas.map((f) => f.d)).size < 2) return []
  return faixas.filter((f, i) => faixas.findIndex((g) => g.d === f.d) === i)
}

/**
 * Carga sugerida para a repetibilidade numa faixa ou intervalo: logo abaixo do Max dela (cg-18 5.1: "below
 * and close to Max1"), um valor redondo entre 75 % e 100 % de Max_i, acima do Max de baixo (6 kg → 5 kg;
 * 15 kg → 14 kg; 12 000 g → 10 000 g). No último, ~0,5·Max quando cai nele (é o ensaio de sempre).
 */
function cargaRepetibilidadeNaFaixa(faixas: Faixa[], i: number): number {
  const max = faixas[i].max
  const inferior = i > 0 ? faixas[i - 1].max : 0
  const dentro = (c: number) => c > inferior * (1 + TOL) && c <= max * (1 + TOL)
  if (i === faixas.length - 1) {
    const meio = redondo(max / 2)
    if (dentro(meio)) return meio
  }
  const candidatas = [meioRedondoParaBaixo(0.85 * max), arredondarSignificativos(0.9 * max, 2)]
  return candidatas.find((c) => dentro(c) && c >= 0.75 * max * (1 - TOL)) ?? candidatas.find(dentro) ?? max
}

/**
 * Ensaios de repetibilidade sugeridos: um só, de ~0,5·Max, na faixa única; em multi-intervalo e múltiplas
 * faixas, um em cada faixa ou intervalo de d diferente, com carga logo abaixo de Max_i (DOQ-CGCRE-097, 10.3).
 */
export function repetibilidadesSugeridas(
  instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>,
  unidade: Unidade = 'kg',
): Array<{ carga: number; leituras: number }> {
  const faixas = faixasOrdenadas(instrumento.faixas)
  const max = faixas.at(-1)?.max ?? 0
  const proprias = faixasComDProprio(instrumento)
  if (!proprias.length) return [repetibilidadeSugerida(max, unidade)]
  return proprias.map((f) => {
    const carga = cargaRepetibilidadeNaFaixa(faixas, faixas.indexOf(f))
    return { carga, leituras: leiturasMinimas(carga, unidade) }
  })
}

/** Faixa ou intervalo sem ensaio de repetibilidade: a faixa, o Max da de baixo (0 na primeira) e a carga sugerida. */
export interface FaixaSemRepetibilidade {
  faixa: Faixa
  inferior: number
  sugerida: number
}

/**
 * Faixas ou intervalos de d diferente sem nenhum ensaio de repetibilidade entre as `cargas` (DOQ-CGCRE-097,
 * 10.3). Um ensaio vale para a faixa ou o intervalo onde a carga dele cai (e para os de mesmo d).
 */
export function faixasSemRepetibilidade(
  instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>,
  cargas: number[],
): FaixaSemRepetibilidade[] {
  const proprias = faixasComDProprio(instrumento)
  if (!proprias.length) return []
  const faixas = faixasOrdenadas(instrumento.faixas)
  const cobertos = new Set(cargas.filter((c) => c > 0).map((c) => faixaDoValor(c, instrumento).d))
  return proprias
    .filter((f) => !cobertos.has(f.d))
    .map((f) => {
      const i = faixas.indexOf(f)
      return { faixa: f, inferior: i > 0 ? faixas[i - 1].max : 0, sugerida: cargaRepetibilidadeNaFaixa(faixas, i) }
    })
}

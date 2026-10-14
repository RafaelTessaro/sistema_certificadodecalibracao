// Sugestões para o técnico montar os ensaios: pontos de carga, carga e posições da excentricidade,
// carga e número de leituras da repetibilidade (EURAMET cg-18 §5; DOQ-CGCRE-097 10.4.1; OIML R76 A.4).

import type { Receptor, Unidade } from '../tipos.ts'
import { algarismosSignificativos, arredondarMeioPar, arredondarSignificativos, casasDecimais, ordemDeGrandeza } from './arredondamento.ts'
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

/** Valor "redondo" de 1 algarismo e meio: múltiplo de 0,5·10^ordem mais próximo (73,3 → 75; 10 → 10; 6 000 → 6 000). */
function meioRedondo(valor: number): number {
  if (!(valor > 0)) return 0
  const ordem = ordemDeGrandeza(valor)
  const passo = ordem >= 1 ? 5 * 10 ** (ordem - 1) : 5 / 10 ** (1 - ordem)
  return multiplo(valor, passo)
}

/**
 * Pontos sugeridos para o erro de indicação (cg-18 §5.2; R76 A.4.4.1): 0, ~25, 50, 75 e 100 % de Max em
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
 * Carga do ensaio de excentricidade (DOQ-CGCRE-097 10.4.1): Max/3 até 500 kg, Max/5 de 500 kg a 3 000 kg
 * e Max/10 acima de 3 000 kg, arredondada para um valor redondo. Na unidade da balança.
 */
export function cargaExcentricidade(max: number, unidade: Unidade): number {
  if (!(max > 0)) return 0
  const maxKg = converterMassa(max, unidade, 'kg')
  const divisor = maxKg <= 500 * (1 + TOL) ? 3 : maxKg <= 3000 * (1 + TOL) ? 5 : 10
  return meioRedondo(max / divisor)
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
 * Repetibilidade sugerida (cg-18 §5.1): carga de ~0,5·Max (valor redondo) e o número mínimo de
 * leituras, 5 (ou 3 quando a carga é de 100 kg ou mais). Com menos de 10 leituras, k sai maior que 2.
 */
export function repetibilidadeSugerida(max: number, unidade: Unidade = 'kg'): { carga: number; leituras: number } {
  if (!(max > 0)) return { carga: 0, leituras: 5 }
  const carga = redondo(max / 2)
  return { carga, leituras: converterMassa(carga, unidade, 'kg') >= 100 * (1 - TOL) ? 3 : 5 }
}

// Arredondamento e apresentação dos resultados (NIT-DICLA-021 §6.3, GUM 7.2.6, ABNT NBR 5891:2014).
//
// Todo o arredondamento trabalha sobre a representação decimal do número (string a partir de
// `toPrecision(15)`), nunca com Math.round/toFixed sobre o binário: 9,85 fica guardado como
// 9,8499999… e sairia 9,8 por acaso, e 4,85 → 4,8 / 4,55 → 4,6 exigem meio-par de verdade.
// A cadeia de cálculo fica em precisão total; só a apresentação arredonda.

/** Algarismos significativos lidos do binário (15 é o máximo que o double garante sem ruído). */
const ALGARISMOS = 15
/** Espaço não separável: separador de milhar (SI / Inmetro). */
const NBSP = ' '

/** Número decimal exato: (−1)^negativo × digitos × 10^(−casas). `digitos` sem zeros à esquerda ('0' no zero). */
interface Decimal {
  negativo: boolean
  digitos: string
  casas: number
}

function normalizar(x: Decimal): Decimal {
  const digitos = x.digitos.replace(/^0+(?=\d)/, '')
  return { negativo: x.negativo && /[1-9]/.test(digitos), digitos, casas: x.casas }
}

function paraDecimal(valor: number): Decimal {
  const [mantissa, expoente] = Math.abs(valor).toPrecision(ALGARISMOS).split('e')
  const [inteira, fracao = ''] = mantissa.split('.')
  let digitos = inteira + fracao
  let casas = fracao.length - Number(expoente ?? 0)
  if (casas < 0) {
    digitos += '0'.repeat(-casas)
    casas = 0
  }
  return normalizar({ negativo: valor < 0, digitos, casas })
}

/** Soma 1 a uma sequência de algarismos decimais ("199" → "200", "99" → "100"). */
function incrementar(digitos: string): string {
  const v = digitos.split('')
  for (let i = v.length - 1; i >= 0; i--) {
    if (v[i] !== '9') {
      v[i] = String(Number(v[i]) + 1)
      return v.join('')
    }
    v[i] = '0'
  }
  return '1' + v.join('')
}

/**
 * Arredonda na casa decimal `casas` (negativa = dezenas, centenas…) pela regra do meio-par:
 * acima da metade sobe, abaixo desce e, na metade exata, fica o algarismo par (NBR 5891).
 * O resultado tem `casas` = max(0, casas).
 */
function arredondarDecimal(x: Decimal, casas: number): Decimal {
  if (casas >= x.casas) return normalizar({ ...x, digitos: x.digitos + '0'.repeat(casas - x.casas), casas })
  const cortar = x.casas - casas
  const digitos = x.digitos.padStart(cortar + 1, '0')
  const manter = digitos.slice(0, digitos.length - cortar)
  const resto = digitos.slice(digitos.length - cortar)
  let subir: boolean
  if (resto[0] !== '5') subir = resto[0] > '5'
  else if (/[1-9]/.test(resto.slice(1))) subir = true
  else subir = Number(manter[manter.length - 1]) % 2 === 1
  let novos = subir ? incrementar(manter) : manter
  if (casas < 0) novos += '0'.repeat(-casas)
  return normalizar({ negativo: x.negativo, digitos: novos, casas: Math.max(0, casas) })
}

/** Posição do primeiro algarismo significativo (10^ordem); 0 para o zero. */
function ordemDecimal(x: Decimal): number {
  return /[1-9]/.test(x.digitos) ? x.digitos.length - 1 - x.casas : 0
}

function partes(x: Decimal): { inteira: string; fracao: string } {
  const digitos = x.digitos.padStart(x.casas + 1, '0')
  return { inteira: digitos.slice(0, digitos.length - x.casas), fracao: digitos.slice(digitos.length - x.casas) }
}

function decimalParaNumero(x: Decimal): number {
  const { inteira, fracao } = partes(x)
  const n = Number(`${x.negativo ? '-' : ''}${inteira}${fracao ? '.' + fracao : ''}`)
  return n === 0 ? 0 : n
}

/** Vírgula decimal; espaço não separável como separador de milhar quando a parte inteira tem 5 ou mais dígitos. */
function formatarDecimal(x: Decimal): string {
  const { inteira, fracao } = partes(x)
  const agrupada = inteira.length >= 5 ? inteira.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) : inteira
  return `${x.negativo ? '-' : ''}${agrupada}${fracao ? ',' + fracao : ''}`
}

// ---- API ----------------------------------------------------------------------------------

/** Arredonda pelo meio-par na casa decimal `casas` (negativa = dezenas, centenas…) e devolve o número. */
export function arredondarMeioPar(valor: number, casas: number): number {
  if (!Number.isFinite(valor)) return valor
  return decimalParaNumero(arredondarDecimal(paraDecimal(valor), Math.trunc(casas)))
}

/** Arredonda pelo meio-par para `algarismos` algarismos significativos. */
export function arredondarSignificativos(valor: number, algarismos: number): number {
  if (!Number.isFinite(valor) || valor === 0) return valor
  const x = paraDecimal(valor)
  return decimalParaNumero(arredondarDecimal(x, algarismos - 1 - ordemDecimal(x)))
}

/** Expoente do primeiro algarismo significativo (⌊log10|v|⌋), lido da representação decimal; 0 para o zero. */
export function ordemDeGrandeza(valor: number): number {
  return Number.isFinite(valor) ? ordemDecimal(paraDecimal(valor)) : 0
}

/** Quantos algarismos significativos o número tem (sem os zeros finais): 22 500 → 3, 0,005 → 1. */
export function algarismosSignificativos(valor: number): number {
  if (!Number.isFinite(valor) || valor === 0) return 0
  return paraDecimal(valor).digitos.replace(/0+$/, '').length
}

/** Número de casas decimais de um valor (sem zeros finais): 0,005 → 3; 5 → 0; 2,50 → 1. */
export function casasDecimais(valor: number): number {
  if (!Number.isFinite(valor) || valor === 0) return 0
  let { digitos, casas } = paraDecimal(valor)
  while (casas > 0 && digitos.endsWith('0')) {
    digitos = digitos.slice(0, -1)
    casas--
  }
  return casas
}

/**
 * Remove o ruído do binário numa soma ou diferença de valores decimais (ex.: 30 010 − 30 000,15 dá
 * 9,849999999998545): arredonda em 12 algarismos significativos na escala da maior parcela.
 */
export function limparRuido(valor: number, escala = Math.abs(valor)): number {
  if (!Number.isFinite(valor) || valor === 0) return valor
  const referencia = Math.max(Math.abs(escala), Math.abs(valor))
  return arredondarMeioPar(valor, 11 - ordemDeGrandeza(referencia))
}

/**
 * Número com vírgula decimal, arredondado (meio-par) em `casas` casas, com espaço não separável
 * (U+00A0) como separador de milhar quando a parte inteira tem 5 ou mais dígitos. "-0,0" sai "0,0".
 * Infinito sai "∞"; NaN sai vazio.
 */
export function formatarNumero(valor: number, casas: number): string {
  if (Number.isNaN(valor)) return ''
  if (!Number.isFinite(valor)) return valor > 0 ? '∞' : '-∞'
  return formatarDecimal(arredondarDecimal(paraDecimal(valor), Math.trunc(casas)))
}

export interface ResultadoArredondado {
  /** Erro arredondado na casa do último algarismo de U, com vírgula decimal ("5,0"). */
  erro: string
  /** U com 2 algarismos significativos ("7,7"). */
  U: string
  /** Casa decimal usada (negativa = dezenas, centenas…). */
  casas: number
  /** Os mesmos valores arredondados, como número (para a regra de decisão "como reportado"). */
  valorErro: number
  valorU: number
}

/**
 * Resultado como vai ao certificado (NIT-DICLA-021 §6.3; GUM 7.2.6): U com 2 algarismos significativos
 * e o erro arredondado na mesma casa decimal do último algarismo de U, ambos pelo meio-par (NBR 5891).
 * Ex.: (4,985; 7,7277) → ("5,0"; "7,7"); (9,85; 11,2023) → ("10"; "11"); (−0,035; 7,4) → ("0,0"; "7,4").
 * Quando o arredondamento de U sobe de ordem (9,96 → 10,0), fica com 2 algarismos ("10").
 */
export function arredondarResultado(erro: number, U: number): ResultadoArredondado {
  if (!(U > 0) || !Number.isFinite(U)) {
    const casas = casasDecimais(erro)
    return { erro: formatarNumero(erro, casas), U: '', casas, valorErro: arredondarMeioPar(erro, casas), valorU: NaN }
  }
  const u = paraDecimal(U)
  const ordem = ordemDecimal(u)
  let casas = 1 - ordem
  let uArredondado = arredondarDecimal(u, casas)
  if (ordemDecimal(uArredondado) > ordem) {
    casas -= 1
    uArredondado = arredondarDecimal(uArredondado, casas)
  }
  const e = arredondarDecimal(paraDecimal(erro), casas)
  return {
    erro: formatarDecimal(e),
    U: formatarDecimal(uArredondado),
    casas,
    valorErro: decimalParaNumero(e),
    valorU: decimalParaNumero(uArredondado),
  }
}

// Estado do formulário da balança e as conversões de unidade (sem React, para os testes).
//
// Tudo é gravado na unidade da indicação (`unidade`: como o mostrador indica o peso), que é a unidade das
// leituras e do cálculo. Na tela, cada coluna é digitada na unidade da plaqueta: Max em kg e e/d em g,
// por exemplo, numa balança 6/15/33 kg × 2/5/10 g, ou tudo em kg numa rodoviária 80 t × 20 kg. A conversão
// acontece ao gravar.

import {
  BALANCA_VAZIA,
  converterMassa,
  divisaoLegivel,
  numero,
  semIndicadorLegado,
  unidadeDivisaoSugerida,
  unidadeLegivel,
} from '#shared/dominio.ts'
import type { Balanca, BalancaInput, Receptor, Unidade } from '#shared/tipos.ts'

/** Faixa como digitada (texto), para não atrapalhar a digitação de "0,00" ou "1.5". `chave` identifica a linha na tela. */
export interface FaixaTexto {
  chave: number
  max: string
  e: string
  d: string
}

/** Campos digitados com unidade própria. */
export type ColunaUnidade = 'max' | 'e' | 'd' | 'min'

export type FormBalanca = Omit<BalancaInput, 'faixas' | 'min'> & {
  faixas: FaixaTexto[]
  min: string
  /** Unidade em que cada coluna é digitada (a da plaqueta). */
  un: Record<ColunaUnidade, Unidade>
  /**
   * Colunas cuja unidade a pessoa escolheu no seletor: não mudam mais sozinhas. As outras, enquanto vazias,
   * seguem a sugestão pelo tipo e pela capacidade (ver `comUnidadesSugeridas`).
   */
  unEscolhida: ColunaUnidade[]
}

/** Receptores em que o número de apoios (células de carga) importa. */
export const COM_APOIOS: Receptor[] = ['APOIOS', 'RODOVIARIA', 'TANQUE']

let seqFaixa = 0
export const novaFaixa = (x: Partial<Omit<FaixaTexto, 'chave'>> = {}): FaixaTexto => ({
  max: '',
  e: '',
  d: '',
  ...x,
  chave: ++seqFaixa,
})

/** Número para o campo de texto: vírgula decimal, sem separador de milhar nem ruído binário; 0 vira vazio. */
export function textoDe(n: number): string {
  if (!Number.isFinite(n) || n === 0) return ''
  return Number(n.toPrecision(12)).toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 12 })
}

/** Campo vazio = 0; texto que não é número = NaN. */
export const lerCampo = (t: string) => (t.trim() ? numero(t) : 0)
export const campoInvalido = (t: string) => t.trim() !== '' && Number.isNaN(numero(t))

const colunaVazia = (s: FormBalanca, c: ColunaUnidade) => (c === 'min' ? !s.min.trim() : s.faixas.every((x) => !x[c].trim()))

/** Faixas que aparecem na tela (na faixa única, as linhas extras ficam guardadas, mas escondidas). */
const visiveis = (s: Pick<FormBalanca, 'tipoFaixas' | 'faixas'>) => (s.tipoFaixas === 'UNICA' ? s.faixas.slice(0, 1) : s.faixas)

/** Número digitado numa coluna, na unidade da indicação (0 quando vazio ou inválido). */
function naIndicacao(s: FormBalanca, t: string, coluna: ColunaUnidade): number {
  const v = lerCampo(t)
  return Number.isFinite(v) && v > 0 ? converterMassa(v, s.un[coluna], s.unidade) : 0
}

/**
 * Unidade sugerida para as colunas ainda vazias cuja unidade ninguém escolheu: e e d pelo tipo e pela maior
 * capacidade digitada (`unidadeDivisaoSugerida`: g na balança de 30 kg, kg na rodoviária ou de 1 t ou mais);
 * o Min, pela ordem de grandeza da carga mínima usual (20 e: 100 g numa de 5 g, 400 kg numa de 20 kg).
 * Chamada depois de cada mudança no tipo, na unidade da indicação e nas faixas.
 */
export function comUnidadesSugeridas(s: FormBalanca): FormBalanca {
  const linhas = visiveis(s)
  const max = Math.max(0, ...linhas.map((x) => naIndicacao(s, x.max, 'max')))
  const divisao = unidadeDivisaoSugerida(s.unidade, s.tipo, max)
  const livre = (c: ColunaUnidade) => !s.unEscolhida.includes(c) && colunaVazia(s, c)
  const un = { ...s.un }
  if (livre('e')) un.e = divisao
  if (livre('d')) un.d = divisao
  if (livre('min')) {
    const x = linhas[0]
    const e1 = x ? naIndicacao(s, x.e, 'e') || naIndicacao(s, x.d, 'd') : 0
    un.min = e1 > 0 ? divisaoLegivel([20 * e1], s.unidade).unidade : divisao
  }
  return un.e === s.un.e && un.d === s.un.d && un.min === s.un.min ? s : { ...s, un }
}

export function formularioInicial(balanca?: Balanca, clienteId?: string): FormBalanca {
  let base: BalancaInput
  if (balanca) {
    // Uma cópia com o cadastro antigo (indicador separado) entra já no formato atual
    const { id: _i, versao: _v, criadoEm: _c, atualizadoEm: _a, ...resto } = semIndicadorLegado(balanca)
    base = { ...BALANCA_VAZIA, ...resto }
  } else base = { ...BALANCA_VAZIA, clienteId: clienteId ?? '' }
  const faixas = base.faixas.length ? base.faixas : BALANCA_VAZIA.faixas
  const u = base.unidade
  // Max na unidade da indicação; e, d e Min gravados na mais legível (0,005 kg → 5 g; 20 kg continua kg), como
  // costumam vir na plaqueta. As colunas vazias (cadastro novo) ficam com a sugestão pelo tipo e pela capacidade.
  const legivel = (valores: number[]) => (valores.some((v) => v > 0) ? unidadeLegivel(valores, u) : u)
  const un: FormBalanca['un'] = {
    max: u,
    e: legivel(faixas.map((x) => x.e)),
    d: legivel(faixas.map((x) => x.d)),
    min: legivel([base.min]),
  }
  return comUnidadesSugeridas({
    ...base,
    faixas: faixas.map((x) =>
      novaFaixa({
        max: textoDe(converterMassa(x.max, u, un.max)),
        e: textoDe(converterMassa(x.e, u, un.e)),
        d: textoDe(converterMassa(x.d, u, un.d)),
      }),
    ),
    min: textoDe(converterMassa(base.min, u, un.min)),
    un,
    unEscolhida: [],
  })
}

/** O que vai para o servidor, tudo na unidade da indicação: números lidos e faixas escondidas não são gravados. */
export function paraEntrada(f: FormBalanca): BalancaInput {
  const { faixas, min, un, unEscolhida: _e, ...resto } = f
  const ler = (t: string, de: Unidade) => converterMassa(lerCampo(t), de, f.unidade)
  return {
    ...resto,
    // e e d costumam ser iguais: o que ficar em branco copia o outro
    faixas: (f.tipoFaixas === 'UNICA' ? faixas.slice(0, 1) : faixas).map((x) => {
      const e = ler(x.e, un.e)
      const d = ler(x.d, un.d)
      return { max: ler(x.max, un.max), e: e || d, d: d || e }
    }),
    min: ler(min, un.min),
    apoios: COM_APOIOS.includes(f.receptor) ? f.apoios : 0,
  }
}

/** Passa uma coluna para outra unidade, convertendo o que já foi digitado; texto que não é número fica como está. */
function converterColuna(s: FormBalanca, coluna: ColunaUnidade, para: Unidade): FormBalanca {
  const de = s.un[coluna]
  if (de === para) return s
  const converter = (t: string) => (t.trim() && !campoInvalido(t) ? textoDe(converterMassa(lerCampo(t), de, para)) : t)
  const un = { ...s.un, [coluna]: para }
  if (coluna === 'min') return { ...s, un, min: converter(s.min) }
  return { ...s, un, faixas: s.faixas.map((x) => ({ ...x, [coluna]: converter(x[coluna]) })) }
}

/**
 * A pessoa escolhe a unidade em que uma coluna é digitada: converte o que já foi digitado (6 kg → 6000 g),
 * sem mudar o valor gravado, e a coluna deixa de seguir a sugestão automática.
 */
export function comUnidadeColuna(s: FormBalanca, coluna: ColunaUnidade, para: Unidade): FormBalanca {
  const novo = converterColuna(s, coluna, para)
  return s.unEscolhida.includes(coluna) ? novo : { ...novo, unEscolhida: [...s.unEscolhida, coluna] }
}

/**
 * Troca a unidade da indicação sem mudar o tamanho de nada: os números continuam valendo na unidade de
 * cada coluna e são gravados já convertidos (6 kg com a indicação em g → 6000 g). A coluna do Max acompanha
 * a indicação enquanto estiver nela; e, d e Min ainda vazios passam para a unidade sugerida.
 */
export function comUnidade(s: FormBalanca, unidade: Unidade): FormBalanca {
  if (unidade === s.unidade) return s
  let novo: FormBalanca = { ...s, unidade }
  if (s.un.max === s.unidade) novo = converterColuna(novo, 'max', unidade)
  return comUnidadesSugeridas(novo)
}

/** Dica dentro do campo e ou d vazio: o valor da outra coluna (em branco, fica igual a ela), já na unidade deste. */
export function espelho(s: Pick<FormBalanca, 'un'>, x: FaixaTexto, coluna: 'e' | 'd'): string {
  const outra = coluna === 'e' ? 'd' : 'e'
  const t = x[outra]
  if (!t.trim() || campoInvalido(t)) return `= ${outra}`
  return textoDe(converterMassa(lerCampo(t), s.un[outra], s.un[coluna])) || `= ${outra}`
}

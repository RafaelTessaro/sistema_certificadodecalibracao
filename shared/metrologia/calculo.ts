// Motor de cálculo da calibração de instrumentos de pesagem não automáticos (EURAMET cg-18 v4.0,
// seções 6 e 7): repetibilidade, excentricidade, erro de indicação com o orçamento de incerteza de
// cada ponto, graus de liberdade efetivos, fator de abrangência e U, cargas de substituição, textos
// do certificado, declaração de conformidade, avisos e pendências.
// Puro (sem I/O): roda igual no servidor (emissão e PDF) e no navegador (cálculo ao vivo).

import type { Faixa, OpcoesCalculo } from '../tipos.ts'
import { arredondarResultado, casasDecimais, formatarNumero, limparRuido } from './arredondamento.ts'
import { emaInstrumento, faixaDoValor, faixasOrdenadas } from './ema.ts'
import { desvioPadrao, fatorAbrangencia, media } from './estatistica.ts'
import { converterMassa } from './pesos.ts'
import { cargaExcentricidade } from './sugestoes.ts'
import type {
  Aviso,
  EntradaCalculo,
  Orcamento,
  PecaCalculo,
  PontoCalculo,
  ResultadoCalculo,
  ResultadoExcentricidade,
  ResultadoPonto,
  ResultadoRepetibilidade,
  SituacaoConformidade,
} from './tipos.ts'

const RAIZ3 = Math.sqrt(3)
const RAIZ12 = Math.sqrt(12)
/** Densidade do ar de referência e dos pesos de referência, kg/m³ (OIML R111; cg-18 7.1.2-5). */
const RHO_AR = 1.2
const RHO_PESOS = 8000
/** Tolerância relativa das comparações de cargas e limites. */
const TOL = 1e-9

/** Componentes da massa de referência de um conjunto de peças (cg-18 7.1.2). */
interface Massa {
  temPecas: boolean
  /** Σ nominal·q. */
  nominal: number
  /** Σ (nominal + correção)·q: valor convencional da carga. */
  valor: number
  uMassa: number
  uDeriva: number
  uEmpuxo: number
  /** u(m_ref) = √(uMassa² + uDeriva² + uEmpuxo²). */
  u: number
  /** Σ EMA·q das peças. */
  somaEma: number
  /** Todas as peças com EMA conhecido (classe R111 informada). */
  emaConhecido: boolean
  /** Alguma peça sem incerteza (pelo nominal sem classe, ou pelo certificado sem U). */
  semIncerteza: boolean
}

/** Referência de um ponto: m_ref das peças ou, com substituição, L_T = s·m_refCheia + m_ref,k + ΣΔI_j. */
interface Referencia {
  carga: number
  valor: number
  /** Peças aplicadas neste ponto (m_ref,k). */
  massa: Massa
  /** s·u(m_refCheia) e 2·Σ u²(I_j) da cadeia de substituição (cg-18 7.1.2-15b). */
  substituicao: { uCheias: number; u2Leituras: number } | null
}

interface Contexto {
  entrada: EntradaCalculo
  opcoes: OpcoesCalculo
  faixas: Faixa[]
  d0: number
  uDig0: number
  /** Ensaios de repetibilidade válidos (n ≥ 2). */
  repeticoes: ResultadoRepetibilidade[]
  /** u_rel da excentricidade aplicada aos pontos (0 se fora do orçamento). */
  uRelEcc: number
  /** u_rel do termo de tempo |E0|/(Max·√3) (só com substituição e retorno ao zero lido). */
  uRelTempo: number
  /** Tolerância absoluta (TOL·Max). */
  tol: number
}

const lida = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const naoExcede = (valor: number, limite: number) => valor <= limite + TOL * Math.max(Math.abs(limite), Math.abs(valor))

// ---- Repetibilidade (cg-18 6.1) ----------------------------------------------------------------

function resumirRepetibilidade(ensaio: EntradaCalculo['repetibilidade'][number]): ResultadoRepetibilidade {
  const leituras = ensaio.leituras.map(lida).filter((l): l is number => l !== null)
  const n = leituras.length
  if (!n) return { id: ensaio.id, carga: ensaio.carga, n: 0, media: 0, s: 0, nu: 0, amplitude: 0 }
  const maior = Math.max(...leituras)
  const menor = Math.min(...leituras)
  return {
    id: ensaio.id,
    carga: ensaio.carga,
    n,
    media: media(leituras),
    s: n >= 2 ? desvioPadrao(leituras) : 0,
    nu: n - 1,
    amplitude: limparRuido(maior - menor, Math.max(Math.abs(maior), Math.abs(menor))),
  }
}

/**
 * Repetibilidade aplicável à carga (cg-18 7.1.1.3): o maior s entre os dois ensaios que envolvem a carga
 * (o de maior carga ≤ L e o de menor carga ≥ L); abaixo ou acima de todos, o mais próximo; com um ensaio só,
 * ele vale para toda a faixa. Empate em s: o de menos graus de liberdade (conservador).
 */
function repetibilidadeNaCarga(carga: number, ctx: Contexto): { s: number; nu: number } | null {
  const ensaios = ctx.repeticoes
  if (!ensaios.length) return null
  const { tol } = ctx
  const candidatos: ResultadoRepetibilidade[] = []
  const abaixo = ensaios.filter((r) => r.carga <= carga + tol)
  const acima = ensaios.filter((r) => r.carga >= carga - tol)
  if (abaixo.length) {
    const c = Math.max(...abaixo.map((r) => r.carga))
    candidatos.push(...abaixo.filter((r) => r.carga >= c - tol))
  }
  if (acima.length) {
    const c = Math.min(...acima.map((r) => r.carga))
    candidatos.push(...acima.filter((r) => r.carga <= c + tol))
  }
  let escolhido = candidatos[0]
  for (const r of candidatos) if (r.s > escolhido.s || (r.s === escolhido.s && r.nu < escolhido.nu)) escolhido = r
  return { s: escolhido.s, nu: escolhido.nu }
}

// ---- Excentricidade (cg-18 6.3 e 7.1.1.4) --------------------------------------------------------

function calcularExcentricidade(exc: EntradaCalculo['excentricidade']): { resultado: ResultadoExcentricidade; valida: boolean } {
  const vazio: ResultadoExcentricidade = {
    aplicavel: exc.aplicavel,
    carga: exc.carga,
    desvios: exc.posicoes.map(() => null),
    maiorDesvio: 0,
    posicaoMaior: -1,
    incertezaRelativa: 0,
  }
  if (!exc.aplicavel || !exc.posicoes.length) return { resultado: vazio, valida: false }
  const posicoes = exc.posicoes
  const i1 = lida(posicoes[0].leitura)
  const ref1 = lida(posicoes[0].referencia) ?? 0
  const desvios = posicoes.map((p, i): number | null => {
    const leitura = lida(p.leitura)
    if (leitura === null || i1 === null) return null
    if (i === 0) return 0
    const escala = Math.max(Math.abs(leitura), Math.abs(i1))
    switch (exc.metodo) {
      // (6.3-2) zero lido antes de cada posição (sem leitura do zero: zero = 0)
      case 3:
        return limparRuido(leitura - (lida(p.referencia) ?? 0) - (i1 - ref1), escala)
      // (6.3-3) leitura na posição 1 logo antes (sem ela: a primeira leitura da posição 1)
      case 4:
        return limparRuido(leitura - (lida(p.referencia) ?? i1), escala)
      // (6.3-1) métodos 1 e 2
      default:
        return limparRuido(leitura - i1, escala)
    }
  })
  let maiorDesvio = 0
  let posicaoMaior = -1
  desvios.forEach((d, i) => {
    if (d !== null && (posicaoMaior < 0 || Math.abs(d) > maiorDesvio)) {
      maiorDesvio = Math.abs(d)
      posicaoMaior = i
    }
  })
  const valida = desvios.filter((d) => d !== null).length >= 2
  const lEcc = exc.carga > 0 ? exc.carga : (i1 ?? 0)
  const incertezaRelativa = valida && lEcc > 0 ? maiorDesvio / (2 * lEcc * RAIZ3) : 0
  return { resultado: { ...vazio, desvios, maiorDesvio, posicaoMaior, incertezaRelativa }, valida }
}

// ---- Massa de referência (cg-18 7.1.2) ---------------------------------------------------------

/** u_rel do empuxo do ar sem correção (cg-18 7.1.2-5c, -5d e -5e), com mpe relativo = Σ EMA / Σ nominal. */
function incertezaRelativaEmpuxo(mpeRelativo: number, opcoes: OpcoesCalculo): number {
  switch (opcoes.empuxo) {
    case 'AJUSTADO':
      return mpeRelativo / (4 * RAIZ3)
    case 'NAO_AJUSTADO':
      return (0.1 * (RHO_AR / RHO_PESOS) + mpeRelativo / 4) / RAIZ3
    case 'DELTA_T':
      return Math.sqrt(1.07e-4 + 1.33e-6 * opcoes.deltaTLocal ** 2) * (RHO_AR / RHO_PESOS) + mpeRelativo / (4 * RAIZ3)
    default:
      return 0
  }
}

/**
 * Componentes da massa de referência, somados linearmente entre as peças (correlação total, cg-18 7.1.2):
 * u(δm_c) = U/k (certificado) ou EMA/√3 (nominal); deriva D = EMA, ou kD·U (com U = 0, D = EMA), u = D/√3;
 * empuxo u = u_rel·Σ nominal.
 */
function componentesMassa(pecas: readonly PecaCalculo[], opcoes: OpcoesCalculo): Massa {
  let nominal = 0
  let valor = 0
  let uMassa = 0
  let uDeriva = 0
  let somaEma = 0
  let temPecas = false
  let emaConhecido = true
  let semIncerteza = false
  for (const p of pecas) {
    const q = p.quantidade
    if (!(q > 0)) continue
    temPecas = true
    nominal += p.nominal * q
    valor += (p.nominal + (p.usarCertificado ? p.correcao : 0)) * q
    const u = p.usarCertificado ? p.incerteza / (p.k > 0 ? p.k : 2) : p.ema / RAIZ3
    if (!(u > 0)) semIncerteza = true
    uMassa += u * q
    const deriva = opcoes.deriva === 'KD' && p.incerteza > 0 ? opcoes.kD * p.incerteza : p.ema
    uDeriva += (deriva / RAIZ3) * q
    somaEma += p.ema * q
    if (!(p.ema > 0)) emaConhecido = false
  }
  const uEmpuxo = nominal > 0 ? incertezaRelativaEmpuxo(somaEma / nominal, opcoes) * nominal : 0
  return {
    temPecas,
    nominal: limparRuido(nominal),
    valor: limparRuido(valor, nominal),
    uMassa,
    uDeriva,
    uEmpuxo,
    u: Math.sqrt(uMassa ** 2 + uDeriva ** 2 + uEmpuxo ** 2),
    somaEma,
    emaConhecido,
    semIncerteza,
  }
}

// ---- Indicação e orçamento (cg-18 7.1.1, 7.1.3, 7.2, 7.3) -----------------------------------------

/** d da indicação: divisão de teste; multi-intervalo pelo intervalo da indicação; múltiplas faixas pela menor que comporta a carga. */
function divisaoNaCarga(indicacao: number, carga: number, ctx: Contexto): number {
  if (ctx.opcoes.divisaoTeste > 0) return ctx.opcoes.divisaoTeste
  const instrumento = ctx.entrada.instrumento
  return faixaDoValor(instrumento.tipoFaixas === 'MULTI_INTERVALO' ? indicacao : carga, instrumento).d
}

const ehZero = (carga: number, ctx: Contexto) => Math.abs(carga) <= ctx.tol

/** u(I) = √(d0²/12 + d_I²/12 + s² + (u_rel,ecc·I)² + u²hist + u²tempo); no ponto zero só d0 e s (e a histerese da média). */
function incertezaIndicacao(indicacao: number, carga: number, ctx: Contexto, uHist = 0) {
  const zero = ehZero(carga, ctx)
  const repetibilidade = repetibilidadeNaCarga(carga, ctx)
  const uDigL = zero ? 0 : divisaoNaCarga(indicacao, carga, ctx) / RAIZ12
  const uRep = repetibilidade?.s ?? 0
  const uEcc = zero ? 0 : Math.abs(indicacao) * ctx.uRelEcc
  const uTempo = zero ? 0 : Math.abs(indicacao) * ctx.uRelTempo
  const uIndicacao = Math.sqrt(ctx.uDig0 ** 2 + uDigL ** 2 + uRep ** 2 + uEcc ** 2 + uHist ** 2 + uTempo ** 2)
  return { uDig0: ctx.uDig0, uDigL, uRep, uEcc, uHist, uTempo, uIndicacao, nu: repetibilidade?.nu ?? Infinity }
}

/**
 * Orçamento de um ponto: E = I − m_ref, u²(E) = u²(I) + u²(m_ref) (7.1-2) ou, com substituição,
 * u²(E) = u²(I) + u²(L_T), u²(L_T) = [s·u(m_refCheia) + u(m_ref,k)]² + 2·Σ u²(I_j) (7.1.2-15b, 7.1.3-1c).
 * ν_eff = u⁴(E)/(u_rep⁴/ν) só com a repetibilidade direta (convenção do H3); k pelo método escolhido.
 */
function orcamento(indicacao: number, ref: Referencia, ctx: Contexto, uHist = 0): Orcamento {
  const ind = incertezaIndicacao(indicacao, ref.carga, ctx, uHist)
  const uReferencia = ref.massa.u
  let u2Referencia = uReferencia ** 2
  let uSubstituicao = 0
  if (ref.substituicao) {
    const { uCheias, u2Leituras } = ref.substituicao
    u2Referencia = (uCheias + uReferencia) ** 2 + u2Leituras
    uSubstituicao = Math.sqrt(uCheias ** 2 + u2Leituras)
  }
  const uCombinada = Math.sqrt(ind.uIndicacao ** 2 + u2Referencia)
  const nuEff = ind.uRep > 0 && ind.nu > 0 ? uCombinada ** 4 / (ind.uRep ** 4 / ind.nu) : Infinity
  const k = fatorAbrangencia(nuEff, ctx.opcoes.metodoK)
  return {
    indicacao,
    referencia: ref.valor,
    erro: limparRuido(indicacao - ref.valor, Math.max(Math.abs(indicacao), Math.abs(ref.valor))),
    uDig0: ind.uDig0,
    uDigL: ind.uDigL,
    uRep: ind.uRep,
    uEcc: ind.uEcc,
    uHist: ind.uHist,
    uTempo: ind.uTempo,
    uIndicacao: ind.uIndicacao,
    uMassa: ref.massa.uMassa,
    uDeriva: ref.massa.uDeriva,
    uEmpuxo: ref.massa.uEmpuxo,
    uSubstituicao,
    uReferencia,
    uCombinada,
    nuEff,
    k,
    U: k * uCombinada,
  }
}

// ---- Cargas de substituição (cg-18 4.3.3 e 7.1.2.6) ---------------------------------------------

interface CadeiaSubstituicao {
  /** Carga de pesos padrão de cada etapa (m_refCheia). */
  massa: Massa
  /** ΔI_j = I(L_sub,j) − I(m_ref,j) e u²(I_j) com I = leitura com os padrões; null = leituras faltando. */
  etapas: Array<{ delta: number; u2: number } | null>
}

function prepararSubstituicao(ctx: Contexto): CadeiaSubstituicao | null {
  const sub = ctx.entrada.indicacao.substituicao
  if (!sub.ativa) return null
  return {
    massa: componentesMassa(sub.pecas, ctx.opcoes),
    etapas: sub.etapas.map((etapa) => {
      const padroes = lida(etapa.leituraPadroes)
      const substituicao = lida(etapa.leituraSubstituicao)
      if (padroes === null || substituicao === null) return null
      const escala = Math.max(Math.abs(padroes), Math.abs(substituicao))
      return {
        delta: limparRuido(substituicao - padroes, escala),
        u2: incertezaIndicacao(padroes, padroes, ctx).uIndicacao ** 2,
      }
    }),
  }
}

/** Referência do ponto, ou o motivo (texto) de não dar para calcular. */
function referenciaPonto(ponto: PontoCalculo, nivel: number, massa: Massa, cadeia: CadeiaSubstituicao | null): Referencia | string {
  if (nivel === 0 || !cadeia) return { carga: ponto.carga, valor: massa.temPecas ? massa.valor : ponto.carga, massa, substituicao: null }
  if (!cadeia.massa.temPecas) return 'informe os pesos padrão usados nas etapas de substituição'
  if (nivel > cadeia.etapas.length) return `faltam etapas de substituição (o ponto usa ${nivel})`
  let delta = 0
  let u2 = 0
  for (let j = 0; j < nivel; j++) {
    const etapa = cadeia.etapas[j]
    if (!etapa) return `faltam as leituras da etapa ${j + 1} da substituição`
    delta += etapa.delta
    u2 += etapa.u2
  }
  const escala = nivel * cadeia.massa.nominal + massa.nominal
  return {
    carga: ponto.carga,
    valor: limparRuido(nivel * cadeia.massa.valor + massa.valor + delta, escala),
    massa,
    substituicao: { uCheias: nivel * cadeia.massa.u, u2Leituras: 2 * u2 },
  }
}

// ---- Cálculo completo ----------------------------------------------------------------------------

/**
 * Calcula a calibração: resultados de repetibilidade e excentricidade, o orçamento de incerteza de cada
 * ponto (crescente, decrescente e, na opção MEDIA, a média com a histerese), os textos do certificado,
 * a conformidade (quando solicitada), os avisos e as pendências. Com pendências o cálculo é feito com o
 * que houver (ex.: sem repetibilidade, s = 0), para a tela mostrar ao vivo; a emissão deve exigir zero pendências.
 */
export function calcular(entrada: EntradaCalculo): ResultadoCalculo {
  const { instrumento, opcoes, conformidade } = entrada
  const unidade = instrumento.unidade
  const avisos: Aviso[] = []
  const pendencias: string[] = []
  const repetibilidade = entrada.repetibilidade.map(resumirRepetibilidade)
  const retornoZero = lida(entrada.indicacao.retornoZero)
  const faixas = faixasOrdenadas(instrumento.faixas)
  const d0 = opcoes.divisaoTeste > 0 ? opcoes.divisaoTeste : (faixas[0]?.d ?? 0)

  const exc = calcularExcentricidade(entrada.excentricidade)
  if (!faixas.length || !(d0 > 0)) {
    pendencias.push('Instrumento: informe pelo menos uma faixa com Max, e e d maiores que zero.')
    return {
      repetibilidade,
      excentricidade: exc.resultado,
      pontos: [],
      maiorU: 0,
      erroRetornoZero: retornoZero,
      conformidade: null,
      avisos,
      pendencias,
    }
  }

  const max = faixas[faixas.length - 1].max
  const sub = entrada.indicacao.substituicao
  const ctx: Contexto = {
    entrada,
    opcoes,
    faixas,
    d0,
    uDig0: opcoes.zeroAprovado ? d0 / (4 * RAIZ3) : d0 / RAIZ12,
    repeticoes: repetibilidade.filter((r) => r.n >= 2),
    uRelEcc: opcoes.excentricidade && exc.valida ? exc.resultado.incertezaRelativa : 0,
    uRelTempo: sub.ativa && retornoZero !== null && max > 0 ? Math.abs(retornoZero) / (max * RAIZ3) : 0,
    tol: TOL * Math.max(Math.abs(max), Number.MIN_VALUE),
  }

  /** Carga nas casas de d (ou mais, se o valor tiver); `rotulo` acrescenta a unidade (para os avisos). */
  const textoCarga = (carga: number) => formatarNumero(carga, Math.max(casasDecimais(divisaoNaCarga(carga, carga, ctx)), casasDecimais(carga)))
  const rotulo = (carga: number) => `${textoCarga(carga)} ${unidade}`
  const leituraTexto = (leitura: number | null, carga: number) =>
    leitura === null ? '' : formatarNumero(leitura, Math.max(casasDecimais(divisaoNaCarga(leitura, carga, ctx)), casasDecimais(leitura)))
  const implausivel = (leitura: number | null, carga: number) => leitura !== null && carga > 0 && Math.abs(leitura - carga) > 0.1 * carga

  const cadeia = prepararSubstituicao(ctx)
  const porMedia = opcoes.histerese === 'MEDIA'
  const semPadroes: string[] = []
  const semIncerteza: string[] = []
  const classeInsuficiente: string[] = []
  const leiturasImplausiveis: string[] = []
  const uMenorQueD: string[] = []
  let semEma = false
  let maiorU = 0
  let pontosLidos = 0
  let maiorCargaLida = -Infinity

  const pontos = entrada.indicacao.pontos.map((ponto): ResultadoPonto => {
    const nivel = cadeia ? Math.max(0, Math.floor(ponto.nivelSubstituicao || 0)) : 0
    const massa = componentesMassa(ponto.pecas, opcoes)
    const ref = referenciaPonto(ponto, nivel, massa, cadeia)
    const sobe = lida(ponto.crescente)
    const desce = lida(ponto.decrescente)
    const temLeitura = sobe !== null || desce !== null
    if (temLeitura) {
      pontosLidos++
      maiorCargaLida = Math.max(maiorCargaLida, ponto.carga)
      for (const l of [sobe, desce]) if (implausivel(l, ponto.carga)) leiturasImplausiveis.push(`${leituraTexto(l, ponto.carga)} em ${rotulo(ponto.carga)}`)
      if (nivel === 0 && !massa.temPecas && !ehZero(ponto.carga, ctx)) semPadroes.push(rotulo(ponto.carga))
      if (massa.temPecas && massa.semIncerteza) semIncerteza.push(rotulo(ponto.carga))
      if (nivel === 0 && massa.temPecas && massa.emaConhecido) {
        const emaOiml = emaInstrumento(ponto.carga, instrumento, 'OIML_INICIAL')
        if (emaOiml !== null && !naoExcede(massa.somaEma, emaOiml / 3)) classeInsuficiente.push(rotulo(ponto.carga))
      }
    }

    let crescente: Orcamento | null = null
    let decrescente: Orcamento | null = null
    let mediaOrc: Orcamento | null = null
    if (typeof ref === 'string') {
      if (temLeitura) pendencias.push(`Erro de indicação, ponto de ${rotulo(ponto.carga)}: ${ref}.`)
    } else {
      if (sobe !== null) crescente = orcamento(sobe, ref, ctx)
      if (desce !== null) decrescente = orcamento(desce, ref, ctx)
      if (porMedia && temLeitura) {
        const ambas = sobe !== null && desce !== null
        const indicacao = ambas ? limparRuido((sobe + desce) / 2, Math.max(Math.abs(sobe), Math.abs(desce))) : (sobe ?? desce ?? 0)
        mediaOrc = orcamento(indicacao, ref, ctx, ambas ? Math.abs(desce - sobe) / RAIZ12 : 0)
      }
    }

    // Orçamento reportado (o de maior U na opção SEPARADO; a média na opção MEDIA)
    const reportados = (porMedia ? [mediaOrc] : [crescente, decrescente]).filter((o): o is Orcamento => o !== null)
    const principal = reportados.reduce<Orcamento | null>((a, o) => (!a || o.U > a.U ? o : a), null)
    for (const o of reportados) {
      maiorU = Math.max(maiorU, o.U)
      const d = ehZero(ponto.carga, ctx) ? d0 : divisaoNaCarga(o.indicacao, ponto.carga, ctx)
      if (o.U < d * (1 - TOL)) uMenorQueD.push(rotulo(ponto.carga))
    }
    const arredondado = principal ? arredondarResultado(principal.erro, principal.U) : null
    const erroTexto = (o: Orcamento | null) => (o && principal ? arredondarResultado(o.erro, principal.U).erro : '')

    // Conformidade com os valores como reportados (E na casa de U, U com 2 algarismos)
    let ema: number | null = null
    let situacao: SituacaoConformidade | null = null
    if (conformidade.solicitada) {
      ema = emaInstrumento(ponto.carga, instrumento, conformidade.criterio, conformidade.toleranciaCliente)
      if (ema === null && principal) semEma = true
      if (ema !== null && principal && arredondado) {
        const limite = ema
        const atende = reportados.every((o) => {
          const e = Math.abs(arredondarResultado(o.erro, principal.U).valorErro)
          return naoExcede(conformidade.regra === 'BANDA_GUARDA' ? e + arredondado.valorU : e, limite)
        })
        situacao = atende ? 'CONFORME' : 'NAO_CONFORME'
      }
    }

    const referencia = typeof ref === 'string' ? ponto.carga : ref.valor
    return {
      id: ponto.id,
      carga: ponto.carga,
      referencia,
      crescente,
      decrescente,
      media: mediaOrc,
      ema,
      conformidade: situacao,
      texto: {
        carga: textoCarga(ponto.carga),
        referencia: formatarNumero(referencia, arredondado ? arredondado.casas : casasDecimais(referencia)),
        crescente: leituraTexto(sobe, ponto.carga),
        decrescente: leituraTexto(desce, ponto.carga),
        erroCrescente: erroTexto(crescente),
        erroDecrescente: erroTexto(decrescente),
        erroMedio: erroTexto(mediaOrc),
        U: arredondado?.U ?? '',
        k: principal ? formatarNumero(principal.k, 2) : '',
        nuEff: principal ? (principal.nuEff === Infinity ? '∞' : formatarNumero(Math.floor(principal.nuEff), 0)) : '',
        ema: ema !== null ? formatarNumero(ema, casasDecimais(ema)) : '',
      },
    }
  })

  // ---- Pendências ----
  if (!pontosLidos) pendencias.unshift('Erro de indicação: nenhuma leitura registrada.')
  if (!ctx.repeticoes.length) pendencias.unshift('Repetibilidade: registre pelo menos 2 leituras (o mínimo recomendado é 5).')
  if (entrada.excentricidade.aplicavel && !exc.valida)
    pendencias.push('Excentricidade: registre as leituras das posições (ou marque o ensaio como não aplicável).')
  if (conformidade.solicitada && semEma)
    pendencias.push(
      conformidade.criterio === 'CLIENTE'
        ? 'Conformidade: informe a tolerância do cliente.'
        : 'Conformidade: a classe de exatidão da balança não está marcada; não há EMA para comparar.',
    )

  // ---- Avisos ----
  const lista = (itens: string[]) => [...new Set(itens)].join('; ')
  for (const r of repetibilidade) {
    if (!r.n) continue
    const minimo = converterMassa(r.carga, unidade, 'kg') >= 100 * (1 - TOL) ? 3 : 5
    if (r.n < minimo)
      avisos.push({
        nivel: 'atencao',
        mensagem: `Repetibilidade a ${rotulo(r.carga)}: ${r.n} leitura(s); o mínimo é ${minimo}${minimo === 3 ? ' (carga ≥ 100 kg)' : ' (3 só com carga ≥ 100 kg)'}.`,
      })
  }
  if (ctx.repeticoes.some((r) => r.n < 10))
    avisos.push(
      opcoes.metodoK === 'K2'
        ? { nivel: 'atencao', mensagem: 'Repetibilidade com menos de 10 leituras: k = 2 fixo não se justifica (cg-18 B2); use k pelos graus de liberdade.' }
        : { nivel: 'info', mensagem: 'Repetibilidade com menos de 10 leituras: o k calculado pelos graus de liberdade efetivos sai maior que 2.' },
    )
  if (pontosLidos > 0 && pontosLidos < 5)
    avisos.push({ nivel: 'atencao', mensagem: `Erro de indicação com ${pontosLidos} ponto(s); o mínimo é 5, contando o zero (cg-18 §5.2).` })
  if (pontosLidos > 0 && maiorCargaLida < 0.9 * max * (1 - TOL))
    avisos.push({
      nivel: 'atencao',
      mensagem: `A maior carga ensaiada (${rotulo(maiorCargaLida)}) é menor que 90 % de Max (${rotulo(max)}): calibração em faixa parcial, que precisa constar no certificado.`,
    })
  if (entrada.excentricidade.aplicavel) {
    const lEcc = entrada.excentricidade.carga
    const sugerida = cargaExcentricidade(max, unidade)
    if (lEcc > max * (1 + TOL))
      avisos.push({ nivel: 'atencao', mensagem: `Carga de excentricidade (${rotulo(lEcc)}) maior que Max.` })
    else if (lEcc > 0 && sugerida > 0 && (lEcc < 0.5 * sugerida || lEcc > 3 * sugerida))
      avisos.push({
        nivel: lEcc < 0.5 * sugerida ? 'atencao' : 'info',
        mensagem: `Carga de excentricidade (${rotulo(lEcc)}) muito diferente da sugerida (${rotulo(sugerida)}, DOQ-CGCRE-097 10.4.1).`,
      })
    const faltando = exc.resultado.desvios.filter((d) => d === null).length
    if (exc.valida && faltando) avisos.push({ nivel: 'atencao', mensagem: `Excentricidade: ${faltando} posição(ões) sem leitura.` })
    if (entrada.excentricidade.metodo === 1 || entrada.excentricidade.metodo === 3)
      for (const p of entrada.excentricidade.posicoes)
        if (implausivel(lida(p.leitura), lEcc)) leiturasImplausiveis.push(`${leituraTexto(p.leitura, lEcc)} na excentricidade (${p.rotulo})`)
  }
  for (const r of entrada.repetibilidade)
    for (const l of r.leituras) if (implausivel(lida(l), r.carga)) leiturasImplausiveis.push(`${leituraTexto(l, r.carga)} na repetibilidade a ${rotulo(r.carga)}`)
  if (leiturasImplausiveis.length)
    avisos.push({
      nivel: 'erro',
      mensagem: `Leitura(s) mais de 10 % fora da carga, provável erro de digitação: ${lista(leiturasImplausiveis)}.`,
    })
  if (semPadroes.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Carga sem padrões em ${lista(semPadroes)}: a referência é a carga digitada, sem a incerteza dos pesos.`,
    })
  if (semIncerteza.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Pesos sem incerteza conhecida (classe ou U do certificado) em ${lista(semIncerteza)}.`,
    })
  if (classeInsuficiente.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Classe dos pesos insuficiente em ${lista(classeInsuficiente)}: Σ EMA dos pesos maior que 1/3 do EMA OIML inicial da balança (R76 3.7.1).`,
    })
  if (uMenorQueD.length)
    avisos.push({
      nivel: 'info',
      mensagem: `U menor que a divisão em ${lista(uMenorQueD)}: resultado suspeito; confira a repetibilidade (s = 0?) e a divisão.`,
    })
  if (opcoes.divisaoTeste > 0)
    avisos.push({
      nivel: 'info',
      mensagem: 'Leituras com resolução aumentada (divisão de teste): o certificado deve advertir que a incerteza é menor que a obtida com a divisão normal (cg-18 §8.3).',
    })

  // ---- Conformidade geral (pior caso) ----
  const situacoes = pontos.map((p) => p.conformidade)
  const geral: SituacaoConformidade | null = !conformidade.solicitada
    ? null
    : situacoes.includes('NAO_CONFORME')
      ? 'NAO_CONFORME'
      : situacoes.includes('CONFORME')
        ? 'CONFORME'
        : null

  return {
    repetibilidade,
    excentricidade: exc.resultado,
    pontos,
    maiorU,
    erroRetornoZero: retornoZero === null ? null : limparRuido(retornoZero),
    conformidade: geral,
    avisos,
    pendencias,
  }
}

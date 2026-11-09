// Motor de cálculo da calibração de instrumentos de pesagem não automáticos (EURAMET cg-18 v4.0,
// seções 6 e 7): repetibilidade, excentricidade, erro de indicação com o orçamento de incerteza de
// cada ponto, graus de liberdade efetivos, fator de abrangência e U, cargas de substituição, textos
// do certificado, declaração de conformidade, avisos e pendências.
// Puro (sem I/O): roda igual no servidor (emissão e PDF) e no navegador (cálculo ao vivo).

import type { Faixa, MetodoCarregamento, OpcoesCalculo } from '../tipos.ts'
import {
  correcaoEmpuxoRelativa,
  DELTA_T_LOCAL_PADRAO,
  densidadeAr,
  densidadeArValida,
  densidadePesosPlausivel,
  INCERTEZA_AR_MEDIDO,
  incertezaRelativaDensidadeAr,
  incertezaRelativaDensidadeArLocal,
  incertezaRelativaEmpuxoMedido,
  RHO_0,
  RHO_C,
  U_DENSIDADE_DESCONHECIDA,
} from './ar.ts'
import { arredondarResultado, casasDecimais, formatarNumero, limparRuido } from './arredondamento.ts'
import { conveccaoRelevante, deltaMConveccaoMg, deltaTAposAclimatacao } from './conveccao.ts'
import { CRITERIO_NAO_PESA_CORRETAMENTE, emaInstrumento, faixaDoValor, faixasOrdenadas } from './ema.ts'
import { desvioPadrao, fatorAbrangencia, media } from './estatistica.ts'
import { converterMassa } from './pesos.ts'
import {
  cargaExcentricidade,
  excentricidadeAbaixoDoMinimo,
  faixasAlcancadas,
  faixasSemRepetibilidade,
  minimoExcentricidade,
  ondeFaltaRepetibilidade,
  pesosMinimosSubstituicao,
} from './sugestoes.ts'
import type {
  Aviso,
  EntradaCalculo,
  InstrumentoCalculo,
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

// Pendências do cálculo que dizem um campo em branco: as marcas "●" das etapas (`camposObrigatoriosEmissao`, em
// dominio.ts) usam os mesmos textos para levar de cada pendência ao campo
export const PENDENCIA_SEM_LEITURAS_INDICACAO = 'Erro de indicação: nenhuma leitura registrada.'
export const PENDENCIA_RETORNO_ZERO =
  'Erro de indicação: registre o retorno ao zero, a indicação sem carga depois de retirar toda a carga (POP 7.7).'
export const PENDENCIA_LEITURAS_EXCENTRICIDADE =
  'Excentricidade: registre as leituras das posições (ou marque o ensaio como não aplicável).'
export const PENDENCIA_AR_MEDIDO =
  'Empuxo pela densidade do ar medida: registre a temperatura, a umidade relativa e a pressão atmosférica (etapa Padrões e ambiente).'
export const PENDENCIA_CONVECCAO =
  'Convecção: registre a diferença de temperatura entre os pesos e o ar antes do 1º ensaio, ou a aclimatação dos pesos (etapa Padrões e ambiente).'
/** Nenhum ensaio de repetibilidade com 2 leituras ou mais: o mínimo do POP, ou o de antes das regras. */
export const pendenciaSemRepetibilidade = (minimosComoAviso: boolean, classeI: boolean): string =>
  minimosComoAviso
    ? 'Repetibilidade: registre pelo menos 2 leituras (o mínimo recomendado é 5).'
    : `Repetibilidade: registre as leituras do ensaio (no mínimo ${classeI ? '10' : '5; 3 com carga ≥ 100 kg'}; POP, Tabela 4).`
/** O nome de cada método de carregamento, como a tela e a folha escrevem (`METODOS_CARREGAMENTO` em dominio.ts). */
export const NOMES_METODO_CARREGAMENTO: Record<MetodoCarregamento, string> = {
  CRESCENTE_DECRESCENTE: 'Crescente e decrescente',
  DESCONTINUO: 'Crescente com descarga',
  CONTINUO: 'Crescente contínuo',
  DECRESCENTE: 'Decrescente',
}
/** Densidade do ar de referência e dos pesos de referência, kg/m³ (OIML R111; cg-18 7.1.2-5). */
const RHO_AR = RHO_0
const RHO_PESOS = RHO_C
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
  /** u(δm_conv): Σ q·Δm_conv/√3 das peças (cg-18 7.1.2-13); 0 sem a opção de convecção. */
  uConveccao: number
  /** δm_B somada a `valor` (7.1.2-4); 0 fora do empuxo MEDIDO. */
  correcaoEmpuxo: number
  /** u(m_ref) = √(uMassa² + uDeriva² + uEmpuxo² + uConveccao²) (7.1.2-14). */
  u: number
  /** Σ EMA·q das peças. */
  somaEma: number
  /** Todas as peças com EMA conhecido (classe R111 informada). */
  emaConhecido: boolean
  /**
   * Peças sem EMA (jogo sem a classe R111, ou nominal sem EMA na classe) em que o EMA entra na incerteza: uso pelo
   * nominal, deriva pelo EMA ou empuxo estimado (5c/5d/5e). Um texto por jogo ou peça, para a pendência.
   */
  emaFaltando: string[]
  /** Alguma peça sem incerteza (pelo nominal sem classe, ou pelo certificado sem U). */
  semIncerteza: boolean
  /**
   * Peças de jogo "valor do certificado" sem a U no cadastro e com correção: entram pelo nominal, e a correção do
   * certificado fica de fora (`PecaCalculo.correcaoSemU`). Um texto por peça, para o aviso.
   */
  correcaoIgnorada: string[]
  /** Convecção: falta o ΔT pesos − ar (nem medido, nem pela aclimatação). */
  semDeltaT: boolean
  /** Convecção: ΔT acima de 20 K ou peça acima de 50 kg (fora da Tabela F2.1). */
  conveccaoForaDaTabela: boolean
  /** Convecção de alguma peça (≥ 10 g) maior que 1/3 do EMA dela (cg-18, Tabela F2.2), com ΔT acima de 1 K. */
  conveccaoAcimaEma: boolean
  /** Empuxo MEDIDO: jogos (ou peças sem jogo) sem a densidade ou sem u(ρ) no cadastro. */
  semDensidade: string[]
  /** Empuxo MEDIDO: jogos com a densidade fora da faixa dos pesos (7,95 digitado em vez de 7 950) e o valor. */
  densidadeImplausivel: Array<{ jogo: string; densidade: number }>
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
  /** ρa e u(ρa) para o empuxo MEDIDO; null quando a opção não é MEDIDO ou falta t, UR ou p. */
  ar: { rhoA: number; uRhoA: number } | null
  /** ΔT pesos − ar (K) a usar para uma peça de `kg` quilos; null = não informado. */
  deltaTPeca: ((kg: number) => number) | null
  /**
   * Múltiplas faixas com descida sem descarregar (crescente e decrescente, ou só decrescente): a maior carga aplicada,
   * cuja faixa vale para as leituras decrescentes; null nos demais casos (cada leitura na faixa da carga).
   */
  cargaDescida: number | null
}

const lida = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** "A", "A e B", "A, B e C". */
const listaE = (itens: string[]) =>
  itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}` : (itens[0] ?? '')

const naoExcede = (valor: number, limite: number) => valor <= limite + TOL * Math.max(Math.abs(limite), Math.abs(valor))

/**
 * Leitura fora do esperado para a carga, provável erro de digitação (vírgula esquecida, outra unidade): mais longe da
 * carga que 10 % dela ou, na carga pequena, que 2 e (lá só o arredondamento em d já passa de 10 %). O e é o da faixa
 * ou do intervalo de `cargaFaixa` (a carga; na leitura decrescente das múltiplas faixas, a da faixa em que foi lida:
 * `cargaDaFaixaDecrescente`); sem e, o d. Com carga zero, 2 e da 1ª faixa: o ponto com a carga esquecida e o zero
 * digitado errado (o "zero antes" da excentricidade). Sem leitura, nunca. A tela usa a mesma regra para pintar o campo,
 * e o cálculo a transforma em pendência na calibração nova (`EntradaCalculo.regrasDoPop`).
 */
export function leituraImplausivel(
  leitura: number | null | undefined,
  carga: number,
  instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>,
  cargaFaixa = carga,
): boolean {
  const l = lida(leitura)
  if (l === null || !Number.isFinite(carga) || carga < 0) return false
  const faixa = instrumento.faixas.length ? faixaDoValor(Number.isFinite(cargaFaixa) ? cargaFaixa : carga, instrumento) : null
  const e = faixa ? (faixa.e > 0 ? faixa.e : faixa.d > 0 ? faixa.d : 0) : 0
  return !naoExcede(Math.abs(l - carga), Math.max(0.1 * carga, 2 * e))
}

/**
 * Leituras de uma posição da excentricidade fora do esperado (a pendência do cálculo e a cor dos campos na tela): a
 * indicação com a carga (métodos 1 e 3, com a carga informada; sem ela, a pendência é a da carga) e, no método 3 (o da
 * classe I), o zero lido antes da posição. No método 2 a balança é tarada com a carga, e no 4 a referência é a
 * leitura no centro: lá só o desvio conta.
 */
export function excentricidadeImplausivel(
  exc: { carga: number; metodo: number },
  posicao: { leitura: number | null; referencia: number | null },
  instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>,
): { leitura: boolean; referencia: boolean } {
  return {
    leitura:
      (exc.metodo === 1 || exc.metodo === 3) && exc.carga > 0 && leituraImplausivel(posicao.leitura, exc.carga, instrumento),
    referencia: exc.metodo === 3 && leituraImplausivel(posicao.referencia, 0, instrumento),
  }
}

/**
 * Múltiplas faixas com a descida sem descarregar (crescente e decrescente, ou só decrescente, sem divisão de teste): a
 * maior carga lida, cuja faixa vale para as leituras decrescentes (a troca para a faixa menor só acontece com o receptor
 * vazio, OIML R76-1 4.10); null nos demais casos (cada leitura na faixa da carga). O cálculo e a tela usam esta.
 */
export function cargaDaDescida(
  instrumento: Pick<InstrumentoCalculo, 'tipoFaixas' | 'faixas'>,
  metodo: EntradaCalculo['indicacao']['metodo'],
  divisaoTeste: number,
  pontos: ReadonlyArray<{ carga: number; crescente: number | null; decrescente: number | null }>,
): number | null {
  const desceSemDescarregar =
    instrumento.tipoFaixas === 'MULTIPLAS_FAIXAS' &&
    instrumento.faixas.length > 1 &&
    !(divisaoTeste > 0) &&
    (metodo === 'CRESCENTE_DECRESCENTE' || metodo === 'DECRESCENTE')
  if (!desceSemDescarregar) return null
  const lidas = pontos.filter((p) => lida(p.crescente) !== null || lida(p.decrescente) !== null).map((p) => p.carga)
  return lidas.length ? Math.max(...lidas) : null
}

/**
 * Carga que decide a faixa (o d, o e e o EMA) da leitura decrescente de um ponto: com a descida sem descarregar
 * (`cargaDaDescida`), a maior carga aplicada; no zero (o receptor vazio) e nos demais casos, a própria carga.
 */
export function cargaDaFaixaDecrescente(carga: number, cargaDescida: number | null, tol = 0): number {
  return cargaDescida !== null && Math.abs(carga) > tol ? Math.max(carga, cargaDescida) : carga
}

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
function repetibilidadeNaCarga(carga: number, ctx: Contexto): { s: number; nu: number; carga: number } | null {
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
  return { s: escolhido.s, nu: escolhido.nu, carga: escolhido.carga }
}

/** Leituras mínimas de um ensaio de repetibilidade (POP 7.9, Tabela 4): 10 na classe I; 5, ou 3 com carga ≥ 100 kg. */
function leiturasMinimasRepetibilidade(carga: number, ctx: Contexto): number {
  if (ctx.entrada.instrumento.classe === 'I') return 10
  return converterMassa(carga, ctx.entrada.instrumento.unidade, 'kg') >= 100 * (1 - TOL) ? 3 : 5
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
 * empuxo u = u_rel·Σ nominal (5c/5d/5e) ou, no MEDIDO, a correção δm_B (7.1.2-4) com u pela 7.1.2-5a peça a
 * peça (ρa e ρ comuns: soma linear); convecção u = Δm_conv/√3 peça a peça (Tabela F2.1).
 */
function componentesMassa(pecas: readonly PecaCalculo[], ctx: Contexto): Massa {
  const { opcoes } = ctx
  const unidade = ctx.entrada.instrumento.unidade
  const medido = opcoes.empuxo === 'MEDIDO' && ctx.ar !== null
  const comConveccao = opcoes.conveccao === 'CALCULAR'
  let nominal = 0
  let valor = 0
  let uMassa = 0
  let uDeriva = 0
  let somaEma = 0
  let temPecas = false
  let emaConhecido = true
  let semIncerteza = false
  let correcaoEmpuxo = 0
  let uEmpuxoMedido = 0
  let uConveccao = 0
  let semDeltaT = false
  let conveccaoForaDaTabela = false
  let conveccaoAcimaEma = false
  const semDensidade: string[] = []
  const densidadeImplausivel: Massa['densidadeImplausivel'] = []
  const emaFaltando: string[] = []
  const correcaoIgnorada: string[] = []
  // O empuxo estimado usa o mpe relativo (Σ EMA / Σ nominal); o MEDIDO sem t, UR ou p já é pendência
  const empuxoEstimado = opcoes.empuxo === 'AJUSTADO' || opcoes.empuxo === 'NAO_AJUSTADO' || opcoes.empuxo === 'DELTA_T'
  const nomePeca = (p: PecaCalculo) => `peça de ${formatarNumero(p.nominal, casasDecimais(p.nominal))} ${unidade}`
  for (const p of pecas) {
    const q = p.quantidade
    if (!(q > 0)) continue
    temPecas = true
    nominal += p.nominal * q
    valor += (p.nominal + (p.usarCertificado ? p.correcao : 0)) * q
    const u = p.usarCertificado ? p.incerteza / (p.k > 0 ? p.k : 2) : p.ema / RAIZ3
    if (!(u > 0)) semIncerteza = true
    if (!p.usarCertificado && p.correcaoSemU) {
      const jogo = p.jogo?.trim()
      correcaoIgnorada.push(`${nomePeca(p)}${jogo ? ` do jogo ${jogo}` : ''}`)
    }
    uMassa += u * q
    const deriva = opcoes.deriva === 'KD' && p.incerteza > 0 ? opcoes.kD * p.incerteza : p.ema
    uDeriva += (deriva / RAIZ3) * q
    somaEma += p.ema * q
    if (!(p.ema > 0)) {
      emaConhecido = false
      // Sem o EMA, a deriva (pelo EMA, ou kD·U sem U), u(δm_c) pelo nominal e o mpe do empuxo estimado somem
      const usaEma = !p.usarCertificado || opcoes.deriva !== 'KD' || !(p.incerteza > 0) || empuxoEstimado
      const jogo = p.jogo?.trim()
      if (usaEma)
        emaFaltando.push(
          p.classe
            ? `a ${nomePeca(p)}${jogo ? ` do jogo ${jogo}` : ''} não tem EMA na classe ${p.classe}`
            : jogo
              ? `o jogo ${jogo} está sem a classe`
              : `a ${nomePeca(p)} está sem a classe`,
        )
    }
    // Empuxo pela densidade do ar medida sem ρ ou u(ρ), ou com ρ fora da faixa dos pesos: a pendência bloqueia a
    // emissão (em qualquer ensaio, também no "como encontrado"); a tela calcula com ρc e a u(ρ) conservadora, sem
    // a correção absurda de um 7,95
    const temRho = (p.densidade ?? 0) > 0
    const plausivel = temRho && densidadePesosPlausivel(p.densidade!)
    if (opcoes.empuxo === 'MEDIDO') {
      const jogo = p.jogo?.trim() || nomePeca(p)
      if (!temRho || !((p.uDensidade ?? 0) > 0)) semDensidade.push(jogo)
      else if (!plausivel) densidadeImplausivel.push({ jogo, densidade: p.densidade! })
    }
    if (medido && ctx.ar) {
      const rho = plausivel ? p.densidade! : RHO_C
      const uRho = plausivel && (p.uDensidade ?? 0) > 0 ? p.uDensidade! : U_DENSIDADE_DESCONHECIDA
      correcaoEmpuxo += q * p.nominal * correcaoEmpuxoRelativa(ctx.ar.rhoA, rho)
      uEmpuxoMedido += q * p.nominal * incertezaRelativaEmpuxoMedido(ctx.ar.rhoA, ctx.ar.uRhoA, rho, uRho)
    }
    if (comConveccao && conveccaoRelevante(p.classe)) {
      if (!ctx.deltaTPeca) semDeltaT = true
      else {
        const kg = converterMassa(p.nominal, unidade, 'kg')
        const dt = ctx.deltaTPeca(kg)
        const mg = deltaMConveccaoMg(kg, dt)
        if (mg === null) conveccaoForaDaTabela = true
        else {
          const dm = converterMassa(mg, 'mg', unidade)
          uConveccao += (q * dm) / RAIZ3
          // cg-18 Tabela F2.2, com o EMA real da peça; só dentro da tabela (≥ 10 g): abaixo, a linha de 10 g é um piso.
          // Só acima da coluna de 1 K: até 1 K o cálculo já está na menor coluna (D3), e esperar não muda nada
          // (as peças E1 passam de 1/3 do EMA já na coluna de 1 K)
          if (p.ema > 0 && kg >= 0.01 * (1 - TOL) && Math.abs(dt) > 1 + TOL && dm > (p.ema / 3) * (1 + TOL))
            conveccaoAcimaEma = true
        }
      }
    }
  }
  // MEDIDO sem t, UR ou p: a estimativa conservadora 5d, para a tela (a pendência bloqueia a emissão)
  const opcoesEmpuxo = opcoes.empuxo === 'MEDIDO' && !medido ? { ...opcoes, empuxo: 'NAO_AJUSTADO' as const } : opcoes
  const uEmpuxo = medido ? uEmpuxoMedido : nominal > 0 ? incertezaRelativaEmpuxo(somaEma / nominal, opcoesEmpuxo) * nominal : 0
  if (!medido) correcaoEmpuxo = 0
  return {
    temPecas,
    nominal: limparRuido(nominal),
    valor: limparRuido(medido ? valor + correcaoEmpuxo : valor, nominal),
    uMassa,
    uDeriva,
    uEmpuxo,
    uConveccao,
    correcaoEmpuxo,
    u: Math.sqrt(uMassa ** 2 + uDeriva ** 2 + uEmpuxo ** 2 + uConveccao ** 2),
    somaEma,
    emaConhecido,
    emaFaltando: [...new Set(emaFaltando)],
    semIncerteza,
    correcaoIgnorada,
    semDeltaT,
    conveccaoForaDaTabela,
    conveccaoAcimaEma,
    semDensidade,
    densidadeImplausivel,
  }
}

// ---- Indicação e orçamento (cg-18 7.1.1, 7.1.3, 7.2, 7.3) -----------------------------------------

/**
 * d da indicação: divisão de teste; multi-intervalo pelo intervalo da indicação; múltiplas faixas pela menor que
 * comporta `cargaFaixa` (a carga; na descida sem descarregar, a maior carga aplicada: ver `cargaDaFaixaDescida`).
 */
function divisaoNaCarga(indicacao: number, carga: number, ctx: Contexto, cargaFaixa = carga): number {
  if (ctx.opcoes.divisaoTeste > 0) return ctx.opcoes.divisaoTeste
  const instrumento = ctx.entrada.instrumento
  return faixaDoValor(instrumento.tipoFaixas === 'MULTI_INTERVALO' ? indicacao : cargaFaixa, instrumento).d
}

const ehZero = (carga: number, ctx: Contexto) => Math.abs(carga) <= ctx.tol

/**
 * Carga que decide a faixa de uma leitura decrescente. Na balança de múltiplas faixas, a troca para a faixa menor
 * só acontece com o receptor vazio (OIML R76-1 4.10): na descida sem descarregar, a leitura continua na faixa da maior
 * carga aplicada. O zero (receptor vazio) e os demais casos: a própria carga.
 */
const cargaDaFaixaDescida = (carga: number, ctx: Contexto) => cargaDaFaixaDecrescente(carga, ctx.cargaDescida, ctx.tol)

/** u(I) = √(d0²/12 + d_I²/12 + s² + (u_rel,ecc·I)² + u²hist + u²tempo); no ponto zero só d0 e s (e a histerese da média). */
function incertezaIndicacao(indicacao: number, carga: number, ctx: Contexto, uHist = 0, cargaFaixa = carga) {
  const zero = ehZero(carga, ctx)
  const repetibilidade = repetibilidadeNaCarga(carga, ctx)
  const uDigL = zero ? 0 : divisaoNaCarga(indicacao, carga, ctx, cargaFaixa) / RAIZ12
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
function orcamento(indicacao: number, ref: Referencia, ctx: Contexto, uHist = 0, cargaFaixa = ref.carga): Orcamento {
  const ind = incertezaIndicacao(indicacao, ref.carga, ctx, uHist, cargaFaixa)
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
    uConveccao: ref.massa.uConveccao,
    correcaoEmpuxo: ref.massa.correcaoEmpuxo,
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
    massa: componentesMassa(sub.pecas, ctx),
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
function referenciaPonto(
  ponto: PontoCalculo,
  nivel: number,
  massa: Massa,
  cadeia: CadeiaSubstituicao | null,
): Referencia | string {
  if (nivel === 0 || !cadeia)
    return { carga: ponto.carga, valor: massa.temPecas ? massa.valor : ponto.carga, massa, substituicao: null }
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

/**
 * Alguma leitura (erro de indicação, repetibilidade ou excentricidade) não é múltipla da divisão com que foi lida
 * (o d do intervalo, ou o da divisão de teste)? Então o d cadastrado parece errado (a balança indica mais fino).
 */
function leiturasForaDaDivisao(entrada: EntradaCalculo, ctx: Contexto): boolean {
  const fora = (leitura: number | null | undefined, carga: number, cargaFaixa = carga) => {
    const l = lida(leitura)
    if (l === null) return false
    const d = ehZero(carga, ctx) && ehZero(l, ctx) ? ctx.d0 : divisaoNaCarga(l, carga, ctx, cargaFaixa)
    if (!(d > 0)) return false
    const n = l / d
    // Só o ruído do binário (4,998 / 0,002 = 2499,0000000000005)
    return Math.abs(n - Math.round(n)) > 1e-9 * Math.max(1, Math.abs(n))
  }
  const exc = entrada.excentricidade
  return (
    entrada.indicacao.pontos.some(
      (p) => fora(p.crescente, p.carga) || fora(p.decrescente, p.carga, cargaDaFaixaDescida(p.carga, ctx)),
    ) ||
    entrada.repetibilidade.some((r) => r.leituras.some((l) => fora(l, r.carga))) ||
    // Referência: o zero antes de cada posição (método 3) ou a leitura no centro logo antes (método 4)
    (exc.aplicavel &&
      exc.posicoes.some((p) => fora(p.leitura, exc.carga) || fora(p.referencia, exc.metodo === 4 ? exc.carga : 0)))
  )
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
  /** Registro de antes das regras do POP: os mínimos e as leituras fora do esperado ficam só como avisos. */
  const legado = entrada.regrasDoPop !== true
  /** Os mínimos do POP só como avisos: no registro de antes e na calibração já medida antes das regras. */
  const minimosComoAviso = legado || entrada.minimosComoAviso === true
  /**
   * O método com que as leituras foram medidas, quando a pessoa passou o ensaio para outro depois delas ("Usar o método
   * do POP"; `EnsaioIndicacao.metodoMedido`); null = o método é o medido. Aí a subida e a descida que o método novo pede
   * e que faltam são pendências mesmo na calibração medida antes das regras: o certificado não pode dizer que as cargas
   * foram aplicadas de um jeito que não foi feito.
   */
  const metodoMedido =
    entrada.indicacao.metodoMedido && entrada.indicacao.metodoMedido !== entrada.indicacao.metodo
      ? entrada.indicacao.metodoMedido
      : null
  /**
   * Calibração começada antes do método fixo pela classe (a visita de `metodoIndicacaoDaVisita`, em dominio.ts): medida
   * antes das regras ou antes de a descida ser obrigatória, ou com a folha de antes impressa. Trocada para o método do
   * POP (`metodoMedido`), a troca pode ter vindo antes das leituras: as pendências não dizem "o método medido".
   */
  const comecadaAntes = minimosComoAviso || entrada.descidaComoAviso === true
  /** A descida que falta no "crescente e decrescente" só como aviso (medida antes de ela ser obrigatória). */
  const descidaComoAviso = !metodoMedido && comecadaAntes
  const avisos: Aviso[] = []
  const pendencias: string[] = []
  const repetibilidade = entrada.repetibilidade.map(resumirRepetibilidade)
  const retornoZero = lida(entrada.indicacao.retornoZero)
  const faixas = faixasOrdenadas(instrumento.faixas)
  const d0 = opcoes.divisaoTeste > 0 ? opcoes.divisaoTeste : (faixas[0]?.d ?? 0)

  const exc = calcularExcentricidade(entrada.excentricidade)

  // Ar do local (A1.1-1): u(ρa) pela A3-1 logo após um ajuste (situação B) e pela A3-2 nos demais (situação A)
  const a = entrada.ar ?? null
  const arCompleto = !!a && a.temperatura !== null && a.umidade !== null && a.pressao !== null
  const rhoA = arCompleto ? densidadeAr(a.temperatura!, a.umidade!, a.pressao!) : null
  const uRelRhoA = a?.ajustadaAntes
    ? incertezaRelativaDensidadeAr(
        INCERTEZA_AR_MEDIDO.pressaoHpa,
        INCERTEZA_AR_MEDIDO.temperaturaK,
        INCERTEZA_AR_MEDIDO.umidadePct,
      )
    : incertezaRelativaDensidadeArLocal(opcoes.deltaTLocal > 0 ? opcoes.deltaTLocal : DELTA_T_LOCAL_PADRAO)
  const ar =
    rhoA === null
      ? null
      : { densidade: rhoA, incerteza: rhoA * uRelRhoA, valida: densidadeArValida(a!.temperatura!, a!.umidade!, a!.pressao!) }
  // ΔT pesos − ar: o medido (vale para todas as peças) ou o estimado pela aclimatação (depende da massa da peça)
  const t = entrada.termica ?? null
  const aclimatacao = t?.aclimatacao ?? null
  const deltaTPeca: Contexto['deltaTPeca'] =
    t && t.deltaT !== null && Number.isFinite(t.deltaT)
      ? () => Math.abs(t.deltaT!)
      : aclimatacao
        ? (kg) => deltaTAposAclimatacao(kg, aclimatacao.deltaT0, aclimatacao.minutos)
        : null

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
      ar,
    }
  }

  const max = faixas[faixas.length - 1].max
  const sub = entrada.indicacao.substituicao
  const metodo = entrada.indicacao.metodo
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
    ar: opcoes.empuxo === 'MEDIDO' && ar ? { rhoA: ar.densidade, uRhoA: ar.incerteza } : null,
    deltaTPeca,
    cargaDescida: cargaDaDescida(instrumento, metodo, opcoes.divisaoTeste, entrada.indicacao.pontos),
  }

  // POP 7.8: o limite de "não pesa corretamente" é o EMA em serviço da classe (na leitura decrescente das múltiplas
  // faixas, o da faixa em que foi lida) ou, sem classe, a tolerância do cliente (pedida na conformidade); sem os dois,
  // não há o que conferir
  const toleranciaCliente =
    conformidade.solicitada && conformidade.criterio === 'CLIENTE' && conformidade.toleranciaCliente > 0
      ? conformidade.toleranciaCliente
      : null
  const limiteServico = (carga: number, cargaFaixa = carga): number | null => {
    if (!instrumento.classe) return toleranciaCliente
    const naFaixa =
      cargaFaixa === carga
        ? instrumento
        : { ...instrumento, tipoFaixas: 'UNICA' as const, faixas: [faixaDoValor(cargaFaixa, instrumento)] }
    return emaInstrumento(carga, naFaixa, CRITERIO_NAO_PESA_CORRETAMENTE)
  }
  const nomeLimite = instrumento.classe ? 'o EMA em serviço' : 'a tolerância do cliente'
  const textoLimite = (limite: number) => `±${formatarNumero(limite, casasDecimais(limite))} ${unidade}`
  const acimaDeMax = (carga: number) => carga > max * (1 + TOL)

  /** Carga nas casas de d (ou mais, se o valor tiver); `rotulo` acrescenta a unidade (para os avisos). */
  const textoCarga = (carga: number) =>
    formatarNumero(carga, Math.max(casasDecimais(divisaoNaCarga(carga, carga, ctx)), casasDecimais(carga)))
  const rotulo = (carga: number) => `${textoCarga(carga)} ${unidade}`
  const leituraTexto = (leitura: number | null, carga: number, cargaFaixa = carga) =>
    leitura === null
      ? ''
      : formatarNumero(leitura, Math.max(casasDecimais(divisaoNaCarga(leitura, carga, ctx, cargaFaixa)), casasDecimais(leitura)))
  const implausivel = (leitura: number | null, carga: number, cargaFaixa = carga) =>
    leituraImplausivel(leitura, carga, instrumento, cargaFaixa)

  const cadeia = prepararSubstituicao(ctx)
  const porMedia = opcoes.histerese === 'MEDIA'
  const semPadroes: string[] = []
  const semIncerteza: string[] = []
  const emaFaltando: string[] = []
  const classeInsuficiente: string[] = []
  /** Pontos em que a classe dos pesos não pôde ser conferida (sem EMA), sem a pendência do EMA. */
  const classeNaoConferida: string[] = []
  /**
   * Leituras fora do esperado: o texto do aviso (registro anterior) e o da pendência (calibração nova). `alterada`: na
   * revisão de um certificado de antes das regras, a leitura que não estava nele (`EntradaCalculo.leiturasDoOriginal`).
   */
  const leiturasImplausiveis: Array<{ aviso: string; pendencia: string; alterada: boolean }> = []
  const original = entrada.leiturasDoOriginal
  const mudou = (antes: number | null | undefined, agora: number | null | undefined) => !!original && lida(antes) !== lida(agora)
  /** Pontos com o erro maior que o EMA em serviço (POP 7.8): o maior erro do ponto, como reportado, e o limite. */
  const foraDoEmaServico: Array<{ carga: number; erro: string; limite: number }> = []
  /** Cargas acima de Max, em cada ensaio. */
  const cargasAcimaDeMax: Array<{ ensaio: 'indicacao' | 'repetibilidade' | 'excentricidade'; carga: number }> = []
  /** Pontos lidos sem a leitura de subida (a subida é obrigatória, POP 7.7). */
  const semSubida: string[] = []
  /**
   * "Crescente e decrescente": pontos com carga lidos na subida e sem a descida (POP 7.7). A maior carga lida sai depois
   * (`semDescida` filtrado): é onde a subida vira descida, uma leitura só (POP, Figura 3). O zero também não entra: a
   * descida dele é o retorno ao zero, que tem a pendência dele. Com substituição, as cargas só sobem (descer pediria
   * tirar o material).
   */
  const semDescida: number[] = []
  const uMenorQueD: string[] = []
  /** U < d com s = 0 de poucas leituras (ou sem repetibilidade): aí o resultado é suspeito, não só leituras iguais. */
  let uMenorQueDPoucasLeituras = false
  const conveccaoAcimaEma: string[] = []
  const semDensidade: string[] = []
  const densidadeImplausivel = new Map<string, number>()
  const conferirDensidade = (m: Massa) => {
    semDensidade.push(...m.semDensidade)
    for (const x of m.densidadeImplausivel) if (!densidadeImplausivel.has(x.jogo)) densidadeImplausivel.set(x.jogo, x.densidade)
  }
  let substituicaoLida = false
  let semDeltaT = false
  let conveccaoForaDaTabela = false
  let algumPelaIncerteza = false
  let semEma = false
  let maiorU = 0
  let pontosLidos = 0
  let maiorCargaLida = -Infinity
  /** Algum ponto com carga acima de zero lido (só o zero lido não é ensaio de erro de indicação). */
  let cargaLida = false
  /** Já houve um ponto sem carga lido antes deste (o zero; outro ponto lido sem carga é a carga esquecida). */
  let zeroLidoAntes = false
  /** Pontos lidos sem carga que não são o primeiro (calibração nova): o nº do ponto na tabela, para a pendência. */
  const semCarga: number[] = []
  /** Peças de jogo "valor do certificado" sem a U no cadastro, com a correção do certificado ignorada. */
  const correcaoIgnorada: string[] = []

  const pontos = entrada.indicacao.pontos.map((ponto, iPonto): ResultadoPonto => {
    const nivel = cadeia ? Math.max(0, Math.floor(ponto.nivelSubstituicao || 0)) : 0
    const massa = componentesMassa(ponto.pecas, ctx)
    // Peças fora dos padrões escolhidos: sem a referência (a carga é a digitada), o motivo vira a pendência
    const ref = ponto.semPadrao ? ponto.semPadrao : referenciaPonto(ponto, nivel, massa, cadeia)
    const sobe = lida(ponto.crescente)
    const desce = lida(ponto.decrescente)
    const temLeitura = sobe !== null || desce !== null
    const faixaDesce = cargaDaFaixaDescida(ponto.carga, ctx)
    // Ponto acrescentado e lido com a carga esquecida (0) depois do zero: na calibração nova, a pendência pede a carga
    // (sem ela, o erro seria a leitura inteira); dois zeros também não contam como dois pontos (POP 7.7). O zero
    // apagado e acrescentado de novo no fim continua sendo o zero
    const semCargaLido = temLeitura && ehZero(ponto.carga, ctx)
    const zeroForaDoLugar = !legado && semCargaLido && zeroLidoAntes
    if (semCargaLido) zeroLidoAntes = true
    if (zeroForaDoLugar) semCarga.push(iPonto + 1)
    if (temLeitura) {
      pontosLidos++
      maiorCargaLida = Math.max(maiorCargaLida, ponto.carga)
      if (!ehZero(ponto.carga, ctx)) cargaLida = true
      if (sobe === null && metodo !== 'DECRESCENTE') semSubida.push(rotulo(ponto.carga))
      if (metodo === 'CRESCENTE_DECRESCENTE' && !sub.ativa && sobe !== null && desce === null && !ehZero(ponto.carga, ctx))
        semDescida.push(ponto.carga)
      // A leitura contra a carga feita: a digitada, quando os pesos não a somam (essa diferença já é pendência). A
      // decrescente, pelo e da faixa em que foi lida (múltiplas faixas, descida sem descarregar)
      const cargaFeita = ponto.cargaDigitada ?? ponto.carga
      const comCargaZero = ehZero(cargaFeita, ctx)
      for (const [lado, l, faixa] of [
        ['crescente', sobe, cargaFeita],
        ['decrescente', desce, cargaDaFaixaDescida(cargaFeita, ctx)],
      ] as const)
        if (!zeroForaDoLugar && implausivel(l, cargaFeita, faixa))
          leiturasImplausiveis.push({
            aviso: `${leituraTexto(l, cargaFeita, faixa)} em ${rotulo(cargaFeita)}`,
            pendencia: `Erro de indicação, ponto de ${rotulo(cargaFeita)}: leitura ${leituraTexto(l, cargaFeita, faixa)} ${
              comCargaZero ? 'com carga zero; confira a carga do ponto ou a digitação.' : 'fora do esperado; confira a digitação.'
            }`,
            alterada: mudou(original?.indicacao[ponto.id]?.[lado], l),
          })
      // Acima de Max (POP 7.7: as cargas vão até Max): uma carga digitada errada ou o Max errado no cadastro
      const maiorCarga = Math.max(ponto.carga, cargaFeita)
      if (acimaDeMax(maiorCarga)) cargasAcimaDeMax.push({ ensaio: 'indicacao', carga: maiorCarga })
      if (nivel === 0 && !massa.temPecas && !ehZero(ponto.carga, ctx) && !ponto.semPadrao) semPadroes.push(rotulo(ponto.carga))
      emaFaltando.push(...massa.emaFaltando)
      correcaoIgnorada.push(...massa.correcaoIgnorada)
      // Sem incerteza nenhuma (u(δm_c) = 0): o EMA que falta já é a pendência; senão, o certificado sem U. No registro de
      // antes das regras, o aviso de antes, em todo ponto assim (o EMA que falta não é pendência)
      if (massa.temPecas && massa.semIncerteza && (legado || !massa.emaFaltando.length)) semIncerteza.push(rotulo(ponto.carga))
      if (massa.semDeltaT) semDeltaT = true
      if (massa.conveccaoForaDaTabela) conveccaoForaDaTabela = true
      if (massa.conveccaoAcimaEma) conveccaoAcimaEma.push(rotulo(ponto.carga))
      conferirDensidade(massa)
      if (nivel > 0) substituicaoLida = true
      // Classe dos pesos (R 76-1 3.7.1): Σ EMA ≤ 1/3 do EMA da balança ou, só com pesos E1/E2 pelo certificado,
      // a incerteza expandida da carga 2·√(u²(δm_c) + u²(δm_D)) ≤ 1/3 do EMA (uma ou outra basta)
      const pecasUsadas = ponto.pecas.filter((p) => p.quantidade > 0)
      const pelaIncerteza =
        pecasUsadas.length > 0 && pecasUsadas.every((p) => p.usarCertificado && (p.classe === 'E1' || p.classe === 'E2'))
      if (nivel === 0 && massa.temPecas && (pelaIncerteza || massa.emaConhecido)) {
        const emaOiml = emaInstrumento(ponto.carga, instrumento, 'OIML_INICIAL')
        if (emaOiml !== null) {
          const limite = emaOiml / 3
          const atendePeloErro = massa.emaConhecido && naoExcede(massa.somaEma, limite)
          const atendePelaIncerteza = pelaIncerteza && naoExcede(2 * Math.sqrt(massa.uMassa ** 2 + massa.uDeriva ** 2), limite)
          if (!atendePeloErro && !atendePelaIncerteza) {
            classeInsuficiente.push(rotulo(ponto.carga))
            if (pelaIncerteza) algumPelaIncerteza = true
          }
        }
      } else if (
        nivel === 0 &&
        massa.temPecas &&
        (legado || !massa.emaFaltando.length) &&
        emaInstrumento(ponto.carga, instrumento, 'OIML_INICIAL') !== null
      )
        // Sem o EMA de alguma peça, mas ele não entra na incerteza (deriva kD·U, empuxo medido ou nenhum); no registro de
        // antes das regras, também quando entra (lá, o EMA que falta é só este aviso)
        classeNaoConferida.push(rotulo(ponto.carga))
    }

    let crescente: Orcamento | null = null
    let decrescente: Orcamento | null = null
    let mediaOrc: Orcamento | null = null
    // Média de uma leitura em cada faixa: o d maior (conservador)
    const faixaMedia =
      desce !== null &&
      (sobe === null || divisaoNaCarga(desce, ponto.carga, ctx, faixaDesce) > divisaoNaCarga(sobe, ponto.carga, ctx))
        ? faixaDesce
        : ponto.carga
    if (typeof ref === 'string') {
      if (temLeitura) pendencias.push(`Erro de indicação, ponto de ${rotulo(ponto.carga)}: ${ref}.`)
    } else {
      if (sobe !== null) crescente = orcamento(sobe, ref, ctx)
      if (desce !== null) decrescente = orcamento(desce, ref, ctx, 0, faixaDesce)
      if (porMedia && temLeitura) {
        const ambas = sobe !== null && desce !== null
        const indicacao = ambas
          ? limparRuido((sobe + desce) / 2, Math.max(Math.abs(sobe), Math.abs(desce)))
          : (sobe ?? desce ?? 0)
        mediaOrc = orcamento(indicacao, ref, ctx, ambas ? Math.abs(desce - sobe) / RAIZ12 : 0, faixaMedia)
      }
    }
    // Etapas e pesos que não somam a carga digitada: o ponto é calculado pelo valor dos pesos, mas não é a carga feita
    if (temLeitura && ponto.cargaDigitada !== undefined) {
      const dif = limparRuido(ponto.carga - ponto.cargaDigitada, Math.max(Math.abs(ponto.carga), Math.abs(ponto.cargaDigitada)))
      const quem =
        nivel > 0
          ? ponto.pecas.length
            ? 'as etapas de substituição e os pesos somam'
            : 'as etapas de substituição somam'
          : 'os pesos somam'
      pendencias.push(
        `Erro de indicação, ponto de ${rotulo(ponto.cargaDigitada)}: ${quem} ${rotulo(ponto.carga)}; ${
          dif < 0
            ? `faltam ${rotulo(-dif)}. Escolha nos padrões o jogo que completa a carga ou acerte os pesos do ponto.`
            : `passam ${rotulo(dif)}. Acerte os pesos${nivel > 0 ? ' ou o nível de substituição' : ''} do ponto.`
        }`,
      )
    }

    // Orçamento reportado (o de maior U na opção SEPARADO; a média na opção MEDIA), com a carga que decide a faixa
    const reportados = (
      porMedia
        ? [{ o: mediaOrc, faixa: faixaMedia, desce: sobe === null }]
        : [
            { o: crescente, faixa: ponto.carga, desce: false },
            { o: decrescente, faixa: faixaDesce, desce: true },
          ]
    ).filter((x): x is { o: Orcamento; faixa: number; desce: boolean } => x.o !== null)
    const principal = reportados.reduce<Orcamento | null>((a, { o }) => (!a || o.U > a.U ? o : a), null)
    for (const { o, faixa } of reportados) {
      maiorU = Math.max(maiorU, o.U)
      const d = ehZero(ponto.carga, ctx) ? d0 : divisaoNaCarga(o.indicacao, ponto.carga, ctx, faixa)
      if (o.U < d * (1 - TOL)) {
        uMenorQueD.push(rotulo(ponto.carga))
        const rep = repetibilidadeNaCarga(ponto.carga, ctx)
        if (!rep || (rep.s === 0 && rep.nu + 1 < leiturasMinimasRepetibilidade(rep.carga, ctx))) uMenorQueDPoucasLeituras = true
      }
    }
    const arredondado = principal ? arredondarResultado(principal.erro, principal.U) : null
    const erroTexto = (o: Orcamento | null) => (o && principal ? arredondarResultado(o.erro, principal.U).erro : '')

    // POP 7.8: erro de indicação maior que o EMA em serviço (sem classe, a tolerância do cliente): a balança não pesa
    // corretamente. Cada leitura (subida e descida, também na opção MEDIA), com o erro como reportado (na casa de U) e
    // sem somar U (a banda de guarda é só da conformidade); o valor no limite passa. A leitura fora do esperado
    // (digitação) e o ponto cujos pesos não somam a carga já são pendências
    const fora = { crescente: false, decrescente: false }
    if (principal && ponto.cargaDigitada === undefined && !zeroForaDoLugar) {
      let pior: { valor: number; texto: string; limite: number } | null = null
      for (const [lado, o, leitura, faixa] of [
        ['crescente', crescente, sobe, ponto.carga],
        ['decrescente', decrescente, desce, faixaDesce],
      ] as const) {
        if (!o || implausivel(leitura, ponto.carga, faixa)) continue
        const limite = limiteServico(ponto.carga, faixa)
        const e = arredondarResultado(o.erro, principal.U)
        if (limite === null || naoExcede(Math.abs(e.valorErro), limite)) continue
        fora[lado] = true
        if (!pior || Math.abs(e.valorErro) > Math.abs(pior.valor)) pior = { valor: e.valorErro, texto: e.erro, limite }
      }
      if (pior)
        foraDoEmaServico.push({
          carga: ponto.carga,
          erro: `${pior.valor > 0 ? '+' : ''}${pior.texto} ${unidade}`,
          limite: pior.limite,
        })
    }

    // Conformidade com os valores como reportados (E na casa de U, U com 2 algarismos). Múltiplas faixas: a leitura
    // decrescente pelo EMA da faixa em que foi lida (como balança de faixa única com essa faixa); a média, pelo da
    // subida (o menor)
    let ema: number | null = null
    let emaDecrescente: number | null = null
    let situacao: SituacaoConformidade | null = null
    if (conformidade.solicitada) {
      const emaSobe = emaInstrumento(ponto.carga, instrumento, conformidade.criterio, conformidade.toleranciaCliente)
      const emaDesce =
        faixaDesce === ponto.carga
          ? emaSobe
          : emaInstrumento(
              ponto.carga,
              { ...instrumento, tipoFaixas: 'UNICA', faixas: [faixaDoValor(faixaDesce, instrumento)] },
              conformidade.criterio,
              conformidade.toleranciaCliente,
            )
      const emaDe = (desceu: boolean) => (desceu ? emaDesce : emaSobe)
      ema = emaDe(reportados.length > 0 && reportados.every((x) => x.desce))
      if (!porMedia && crescente && decrescente && emaDesce !== null && emaDesce !== emaSobe) emaDecrescente = emaDesce
      if (ema === null && principal) semEma = true
      if (ema !== null && principal && arredondado) {
        const atende = reportados.every(({ o, desce: desceu }) => {
          const limite = emaDe(desceu)
          const e = Math.abs(arredondarResultado(o.erro, principal.U).valorErro)
          return limite !== null && naoExcede(conformidade.regra === 'BANDA_GUARDA' ? e + arredondado.valorU : e, limite)
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
      ...(emaDecrescente !== null ? { emaDecrescente } : {}),
      conformidade: situacao,
      ...(fora.crescente || fora.decrescente ? { foraDoEmaServico: fora } : {}),
      texto: {
        carga: textoCarga(ponto.carga),
        referencia: formatarNumero(referencia, arredondado ? arredondado.casas : casasDecimais(referencia)),
        crescente: leituraTexto(sobe, ponto.carga),
        decrescente: leituraTexto(desce, ponto.carga, faixaDesce),
        erroCrescente: erroTexto(crescente),
        erroDecrescente: erroTexto(decrescente),
        erroMedio: erroTexto(mediaOrc),
        U: arredondado?.U ?? '',
        k: principal ? formatarNumero(principal.k, 2) : '',
        nuEff: principal ? (principal.nuEff === Infinity ? '∞' : formatarNumero(Math.floor(principal.nuEff), 0)) : '',
        ema: ema !== null ? formatarNumero(ema, casasDecimais(ema)) : '',
        ...(emaDecrescente !== null ? { emaDecrescente: formatarNumero(emaDecrescente, casasDecimais(emaDecrescente)) } : {}),
      },
    }
  })

  // ---- Pendências ----
  if (!pontosLidos) pendencias.unshift(PENDENCIA_SEM_LEITURAS_INDICACAO)
  if (!ctx.repeticoes.length) pendencias.unshift(pendenciaSemRepetibilidade(minimosComoAviso, instrumento.classe === 'I'))
  if (entrada.excentricidade.aplicavel && !exc.valida) pendencias.push(PENDENCIA_LEITURAS_EXCENTRICIDADE)
  // Mínimos do POP (7.7 e 7.9, Tabela 4) na calibração nova; no registro anterior e na calibração já medida antes das
  // regras, avisos (mais abaixo)
  // Só as faixas que o erro de indicação alcançou (a calibração parcial acordada, POP 7.1). O ensaio sem carga não
  // cobre intervalo nenhum, mas também não esconde os que faltam (a pendência dele é outra)
  const cargasRep = ctx.repeticoes.map((r) => r.carga).filter((c) => c > 0)
  const semEnsaio = ctx.repeticoes.length ? faixasSemRepetibilidade(instrumento, cargasRep, cargaLida ? maiorCargaLida : 0) : []
  const textoSemEnsaio = () => {
    const { onde, nome } = ondeFaltaRepetibilidade(
      instrumento.tipoFaixas,
      semEnsaio.map((f) => `até ${rotulo(f.max)} (d = ${rotulo(f.d)})`),
    )
    const alcancadas = faixasAlcancadas(instrumento, cargaLida ? maiorCargaLida : 0).length
    return `Repetibilidade: ${cargasRep.length} ${cargasRep.length === 1 ? 'ensaio' : 'ensaios'} para ${alcancadas} ${nome}s; falta ${onde}. O POP (7.9) pede um ensaio em cada ${nome} de d diferente.`
  }
  // "Crescente e decrescente" sem a descida de um ponto (a maior carga lida é a virada, com uma leitura só)
  const cargasSemDescida = [...new Set(semDescida.filter((c) => !(Math.abs(c - maiorCargaLida) <= ctx.tol)).map(rotulo))]
  // O ensaio trocado de método depois das leituras: o caminho de volta, na própria pendência. Na calibração começada
  // antes desta versão (`comecadaAntes`), o método com que foi começada, sem "medido"
  const voltarAoMedido = metodoMedido
    ? ` Sem ela, volte para “${NOMES_METODO_CARREGAMENTO[metodoMedido]}”, ${
        comecadaAntes ? 'o método com que a calibração foi começada' : 'o método medido'
      }.`
    : ''
  const faltaSubida = () =>
    `Erro de indicação: falta a leitura de subida em ${listaE([...new Set(semSubida)])} (POP 7.7).${voltarAoMedido}`
  const faltaDescida = () =>
    `Erro de indicação: falta a leitura de descida em ${listaE(cargasSemDescida)} (POP 7.7).${voltarAoMedido}`
  // Só o zero lido não é ensaio de carga: pendência também na calibração já medida antes das regras
  if (!legado && pontosLidos > 0 && !cargaLida)
    pendencias.push('Erro de indicação: registre as leituras das cargas acima de zero (POP 7.7).')
  if (!minimosComoAviso) {
    if (pontosLidos > 0 && cargaLida && pontosLidos < 5)
      pendencias.push(
        `Erro de indicação: ${pontosLidos} ${pontosLidos === 1 ? 'ponto lido' : 'pontos lidos'}; o POP pede no mínimo 5, contando o zero (7.7).`,
      )
    if (metodo === 'DECRESCENTE')
      pendencias.push('Erro de indicação: a subida é obrigatória; troque o método “Decrescente” (POP 7.7).')
    else if (semSubida.length) pendencias.push(faltaSubida())
    // A descida: na calibração medida antes de ela ser obrigatória, o aviso (mais abaixo)
    if (!descidaComoAviso && cargasSemDescida.length) pendencias.push(faltaDescida())
    // Ensaio copiado e não feito (sem leituras): o aviso mais abaixo
    for (const r of repetibilidade) {
      const minimo = leiturasMinimasRepetibilidade(r.carga, ctx)
      if (r.n > 0 && r.n < minimo)
        pendencias.push(
          `Repetibilidade a ${rotulo(r.carga)}: ${r.n} ${r.n === 1 ? 'leitura' : 'leituras'}; ${
            instrumento.classe === 'I'
              ? 'na classe I o mínimo é 10 (POP, Tabela 4).'
              : minimo === 3
                ? 'o mínimo é 3 com carga ≥ 100 kg (POP, Tabela 4).'
                : 'o mínimo é 5 (POP, Tabela 4; 3 só com carga ≥ 100 kg).'
          }`,
        )
    }
    if (semEnsaio.length) pendencias.push(textoSemEnsaio())
  }
  // Trocado de método depois das leituras: o que o método novo pede (a subida, a descida), também na calibração medida
  // antes das regras (`metodoMedido`)
  else if (metodoMedido) {
    if (metodo !== 'DECRESCENTE' && semSubida.length) pendencias.push(faltaSubida())
    if (cargasSemDescida.length) pendencias.push(faltaDescida())
  }
  // Trocado de método depois das leituras e, depois, com a classe da balança trocada: o método de agora não é o do POP
  // nesta classe (o de `metodoIndicacaoPadrao`, em dominio.ts) nem o medido, e o certificado diria um método que não foi
  // usado. Também na calibração medida antes das regras (`metodoMedido`)
  const metodoDoPop: MetodoCarregamento = instrumento.classe === 'I' ? 'DESCONTINUO' : 'CRESCENTE_DECRESCENTE'
  if (metodoMedido && metodo !== metodoDoPop) {
    const nome = (m: MetodoCarregamento) => `“${NOMES_METODO_CARREGAMENTO[m]}”`
    const [origem, volta] = comecadaAntes
      ? [`começada antes desta versão com ${nome(metodoMedido)} e trocada`, 'o de antes']
      : [`medido como ${nome(metodoMedido)} e trocado`, 'o medido']
    pendencias.push(
      `Erro de indicação: ${origem} depois para ${nome(metodo)}, que não é o método do POP nesta classe${
        metodoMedido === metodoDoPop ? `; volte para ${volta}` : ` (${nome(metodoDoPop)}); use o do POP ou volte para ${volta}`
      } (POP 7.7).`,
    )
  }
  // Retorno ao zero (POP 7.7: registrado ao fim do erro de indicação; 7.8: a balança que não volta ao zero não pesa
  // corretamente). O limite é o EMA em serviço na carga zero (2 e da 1ª faixa) ou, sem classe, a tolerância do cliente
  const limiteZero = limiteServico(0)
  const zeroFora = retornoZero !== null && limiteZero !== null && !naoExcede(Math.abs(retornoZero), limiteZero)
  if (!legado && cargaLida) {
    // Não anotado na calibração já medida antes das regras (era opcional): como na época
    if (retornoZero === null) {
      if (!minimosComoAviso) pendencias.push(PENDENCIA_RETORNO_ZERO)
    } else if (zeroFora)
      pendencias.push(
        `Erro de indicação: a balança não voltou ao zero (retorno de ${leituraTexto(retornoZero, 0)} ${unidade}; limite de ${textoLimite(limiteZero!)}); a balança não pesa corretamente e não é calibrada (POP 7.8).`,
      )
  }
  // Erro maior que o EMA em serviço (POP 7.8): uma pendência por ponto
  if (!legado)
    for (const f of foraDoEmaServico)
      pendencias.push(
        `Erro de indicação, ponto de ${rotulo(f.carga)}: erro de ${f.erro}, maior que ${nomeLimite} (${textoLimite(f.limite)}); a balança não pesa corretamente e não é calibrada (POP 7.8).`,
      )
  // Ponto lido sem nenhum peso padrão (a carga menor que a menor peça, as peças tiradas à mão): o E e o U sairiam sem
  // padrão rastreável por trás. Na calibração nova, pendência; no registro de antes, o aviso (mais abaixo)
  if (!legado)
    for (const c of new Set(semPadroes))
      pendencias.push(
        `Erro de indicação, ponto de ${c}: nenhum peso padrão no ponto; escolha os pesos do ponto ou, nos padrões, um jogo que faça essa carga.`,
      )
  for (const n of semCarga)
    pendencias.push(
      `Erro de indicação: o ponto ${n} está sem carga; informe a carga do ponto (só o primeiro, o do zero, fica sem carga).`,
    )
  // Ensaio de repetibilidade com leituras e sem a carga (o campo apagado grava 0): as leituras não são conferidas
  const semCargaRep = repetibilidade
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.n > 0 && !(r.carga > 0))
    .map(({ i }) => `Repetibilidade: informe a carga do ensaio${repetibilidade.length > 1 ? ` ${i + 1}` : ''} (POP 7.9).`)
  for (const r of repetibilidade)
    if (r.n > 0 && acimaDeMax(r.carga)) cargasAcimaDeMax.push({ ensaio: 'repetibilidade', carga: r.carga })
  if (conformidade.solicitada && semEma)
    pendencias.push(
      conformidade.criterio === 'CLIENTE'
        ? 'Conformidade: informe a tolerância do cliente.'
        : 'Conformidade: a classe de exatidão da balança não está marcada; não há EMA para comparar.',
    )
  if (opcoes.empuxo === 'MEDIDO' && !arCompleto) pendencias.push(PENDENCIA_AR_MEDIDO)
  // A densidade e u(ρ) de cada jogo usado num ponto lido (cg-18 7.1.2-4 e 7.1.2-5a)
  if (substituicaoLida && cadeia) conferirDensidade(cadeia.massa)
  const jogosSemDensidade = [...new Set(semDensidade)]
  if (jogosSemDensidade.length)
    pendencias.push(
      `Empuxo pela densidade do ar medida: ${jogosSemDensidade.length > 1 ? `os jogos ${listaE(jogosSemDensidade)} estão` : `o jogo ${jogosSemDensidade[0]} está`} sem a densidade ou a incerteza da densidade (cadastro do padrão).`,
    )
  for (const [jogo, rho] of densidadeImplausivel)
    pendencias.push(
      `Empuxo pela densidade do ar medida: o jogo ${jogo} está com densidade de ${formatarNumero(rho, Math.min(casasDecimais(rho), 6))} kg/m³, fora da faixa dos pesos; confira a unidade no cadastro do padrão (7,95 g/cm³ = 7 950 kg/m³).`,
    )
  if (semDeltaT) pendencias.push(PENDENCIA_CONVECCAO)
  if (conveccaoForaDaTabela)
    pendencias.push(
      'Convecção: diferença de temperatura acima de 20 °C ou peça acima de 50 kg, fora da Tabela F2.1 do cg-18; aguarde a aclimatação e meça de novo.',
    )
  // Pesos sem o EMA da R111 (jogo sem a classe) em que ele entra na incerteza: sem ele, a deriva, o mpe do empuxo e
  // u(δm_c) pelo nominal somem e a conferência da classe dos pesos (R76 3.7.1) não é feita. Regras da 1.0.3: no
  // registro de antes delas (a revisão de um certificado 1.0.1/1.0.2, a mesma visita), as exigências da época: a
  // classe dos pesos não conferida e os pesos sem incerteza ficam como avisos (abaixo). A saída da pendência (a classe
  // no cadastro) mudaria os números da revisão
  if (substituicaoLida && cadeia) emaFaltando.push(...cadeia.massa.emaFaltando)
  const pesosSemEma = [...new Set(emaFaltando)]
  if (!legado && pesosSemEma.length)
    pendencias.push(
      `Pesos sem EMA conhecido (OIML R 111): ${listaE(pesosSemEma)}. O EMA entra na incerteza dos pesos (deriva, empuxo ou valor nominal); confira a classe no cadastro do padrão.`,
    )
  const textoSemIncerteza = `Pesos sem incerteza conhecida (classe ou U do certificado) em ${[...new Set(semIncerteza)].join('; ')}.`
  if (semIncerteza.length) {
    if (legado) avisos.push({ nivel: 'atencao', mensagem: textoSemIncerteza })
    else pendencias.push(textoSemIncerteza)
  }

  // ---- Avisos ----
  const lista = (itens: string[]) => [...new Set(itens)].join('; ')
  for (const r of repetibilidade) {
    // Ensaio copiado (rascunho novo, "recalibrar", carga sugerida) e não feito: não conta no "um por intervalo"
    if (!r.n) {
      if (r.carga > 0 && ctx.repeticoes.length)
        avisos.push({
          nivel: 'atencao',
          mensagem: `Repetibilidade a ${rotulo(r.carga)}: sem leituras; registre as leituras ou remova o ensaio.`,
        })
      continue
    }
    const minimo = converterMassa(r.carga, unidade, 'kg') >= 100 * (1 - TOL) ? 3 : 5
    if (minimosComoAviso && r.n < minimo)
      avisos.push({
        nivel: 'atencao',
        mensagem: `Repetibilidade a ${rotulo(r.carga)}: ${r.n} leitura(s); o mínimo é ${minimo}${minimo === 3 ? ' (carga ≥ 100 kg)' : ' (3 só com carga ≥ 100 kg)'}.`,
      })
  }
  // Multi-intervalo e múltiplas faixas: um ensaio em cada intervalo (ou faixa) de d diferente (o rascunho novo
  // e o "recalibrar" copiam os ensaios do último certificado, que podia ter um só). Só os ensaios feitos (n ≥ 2, os
  // que entram na incerteza): os copiados vêm sem as leituras
  if (minimosComoAviso && semEnsaio.length) avisos.push({ nivel: 'atencao', mensagem: textoSemEnsaio() })
  const classeI = instrumento.classe === 'I'
  if (ctx.repeticoes.some((r) => r.n < 10)) {
    // Na classe I o POP pede 10 leituras (Tabela 4): o aviso de atenção substitui o informativo (na calibração nova, a
    // pendência)
    if (classeI && minimosComoAviso)
      avisos.push({ nivel: 'atencao', mensagem: 'Balança classe I: faça 10 leituras na repetibilidade (POP, Tabela 4).' })
    if (opcoes.metodoK === 'K2')
      avisos.push({
        nivel: 'atencao',
        mensagem:
          'Repetibilidade com menos de 10 leituras: k = 2 fixo não se justifica (cg-18 B2); use k pelos graus de liberdade.',
      })
    else if (!classeI)
      avisos.push({
        nivel: 'info',
        mensagem: 'Repetibilidade com menos de 10 leituras: o k calculado pelos graus de liberdade efetivos sai maior que 2.',
      })
  }
  if (minimosComoAviso && (legado || cargaLida) && pontosLidos > 0 && pontosLidos < 5)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Erro de indicação com ${pontosLidos} ponto(s); o mínimo é 5, contando o zero (cg-18 §5.2).`,
    })
  // A descida que falta: na calibração nova, a pendência (mais acima); medida antes de ela ser obrigatória, só o aviso
  if (descidaComoAviso && cargasSemDescida.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Erro de indicação “crescente e decrescente” sem a leitura de descida em ${listaE(cargasSemDescida)}.`,
    })
  // Faixa parcial (POP 7.7: acordada com o cliente e declarada no certificado). Só o zero lido é pendência, não faixa
  if (pontosLidos > 0 && (legado || cargaLida) && maiorCargaLida < 0.9 * max * (1 - TOL))
    avisos.push({
      nivel: 'atencao',
      mensagem: `A maior carga ensaiada (${rotulo(maiorCargaLida)}) é menor que 90 % de Max (${rotulo(max)}): calibração em faixa parcial, que precisa constar no certificado.`,
    })
  // Excentricidade (POP 7.10, Tabela 6): todas as posições, com a carga informada e até Max. Na calibração nova,
  // pendências; no registro de antes, avisos (as posições que faltam, também na calibração já medida antes das regras)
  const excentricidadeIncompleta: string[] = []
  if (entrada.excentricidade.aplicavel) {
    const lEcc = entrada.excentricidade.carga
    const sugerida = cargaExcentricidade(max, unidade, instrumento.classe)
    const comLeitura = entrada.excentricidade.posicoes.some((p) => lida(p.leitura) !== null)
    if (comLeitura && !(lEcc > 0)) excentricidadeIncompleta.push('Excentricidade: informe a carga usada no ensaio (POP 7.10).')
    if (lEcc > max * (1 + TOL)) {
      if (legado) avisos.push({ nivel: 'atencao', mensagem: `Carga de excentricidade (${rotulo(lEcc)}) maior que Max.` })
      else cargasAcimaDeMax.push({ ensaio: 'excentricidade', carga: lEcc })
    }
    // Abaixo do mínimo da Tabela 5 (a carga copiada de um certificado antigo, que arredondava para o mais próximo)
    else if (excentricidadeAbaixoDoMinimo(lEcc, max, unidade))
      avisos.push({
        nivel: 'atencao',
        mensagem: `Carga de excentricidade (${rotulo(lEcc)}) abaixo do mínimo da Tabela 5 do POP (${minimoExcentricidade(max, unidade).fracao}, com Max de ${rotulo(max)}): use ≥ ${rotulo(sugerida)}.`,
      })
    else if (lEcc > 0 && sugerida > 0 && lEcc > 3 * sugerida)
      avisos.push({
        nivel: 'info',
        mensagem: `Carga de excentricidade (${rotulo(lEcc)}) muito diferente da sugerida (${rotulo(sugerida)}, DOQ-CGCRE-097 10.4.1).`,
      })
    const faltando = exc.resultado.desvios.filter((d) => d === null).length
    if (exc.valida && faltando) {
      if (minimosComoAviso) avisos.push({ nivel: 'atencao', mensagem: `Excentricidade: ${faltando} posição(ões) sem leitura.` })
      else
        excentricidadeIncompleta.push(
          `Excentricidade: ${faltando} ${faltando === 1 ? 'posição' : 'posições'} sem leitura; registre todas (POP 7.10).`,
        )
    }
    // A indicação com a carga (métodos 1 e 3) e, no método 3 (classe I), o zero antes de cada posição: um zero errado
    // (a carga digitada no lugar dele) muda o desvio de todas as posições e o U de todos os pontos
    entrada.excentricidade.posicoes.forEach((p, i) => {
      const fora = excentricidadeImplausivel(entrada.excentricidade, p, instrumento)
      if (fora.leitura)
        leiturasImplausiveis.push({
          aviso: `${leituraTexto(p.leitura, lEcc)} na excentricidade (${p.rotulo})`,
          pendencia: `Excentricidade (${p.rotulo}): leitura ${leituraTexto(p.leitura, lEcc)} fora do esperado com ${rotulo(lEcc)}; confira a digitação.`,
          alterada: mudou(original?.excentricidade[i], p.leitura),
        })
      if (fora.referencia)
        leiturasImplausiveis.push({
          aviso: `${leituraTexto(p.referencia, 0)} no zero antes da excentricidade (${p.rotulo})`,
          pendencia: `Excentricidade (${p.rotulo}): zero antes ${leituraTexto(p.referencia, 0)} fora do esperado; confira a digitação.`,
          alterada: !!original?.referenciasExcentricidade && mudou(original.referenciasExcentricidade[i], p.referencia),
        })
    })
  }
  // Sem a carga (o campo apagado grava 0), a pendência é a da carga: as leituras não são conferidas
  for (const r of entrada.repetibilidade)
    r.leituras.forEach((l, i) => {
      if (r.carga > 0 && implausivel(lida(l), r.carga))
        leiturasImplausiveis.push({
          aviso: `${leituraTexto(l, r.carga)} na repetibilidade a ${rotulo(r.carga)}`,
          pendencia: `Repetibilidade a ${rotulo(r.carga)}: leitura ${leituraTexto(l, r.carga)} fora do esperado; confira a digitação.`,
          alterada: mudou(original?.repetibilidade[r.id]?.[i], l),
        })
    })
  // Calibração nova: cada leitura é uma pendência (a balança que não pesa certo não é calibrada, POP 7.8); no registro
  // anterior, o aviso de antes, menos a leitura que a revisão mudou (a revisão não traz leitura absurda nova)
  const implausiveisComoAviso = legado ? leiturasImplausiveis.filter((x) => !x.alterada) : []
  if (implausiveisComoAviso.length)
    avisos.push({
      nivel: 'erro',
      mensagem: `Leitura(s) mais de 10 % fora da carga, provável erro de digitação: ${lista(implausiveisComoAviso.map((x) => x.aviso))}.`,
    })
  pendencias.push(...new Set(leiturasImplausiveis.filter((x) => !legado || x.alterada).map((x) => x.pendencia)))
  // Os demais dados que faltam ou não fecham: pendências na calibração nova; avisos no registro de antes
  const textoAcimaDeMax = ({ ensaio, carga }: (typeof cargasAcimaDeMax)[number]) => {
    const confira = `acima de Max (${rotulo(max)}); confira a carga ou o Max da balança.`
    if (ensaio === 'excentricidade') return `Excentricidade: carga de ${rotulo(carga)} ${confira}`
    if (ensaio === 'repetibilidade') return `Repetibilidade a ${rotulo(carga)}: carga ${confira}`
    return `Erro de indicação, ponto de ${rotulo(carga)}: carga ${confira}`
  }
  if (!legado) {
    pendencias.push(...semCargaRep, ...excentricidadeIncompleta, ...cargasAcimaDeMax.map(textoAcimaDeMax))
  } else {
    for (const mensagem of [...semCargaRep, ...excentricidadeIncompleta]) avisos.push({ nivel: 'atencao', mensagem })
    if (cargasAcimaDeMax.length)
      avisos.push({
        nivel: 'atencao',
        mensagem: `Carga acima de Max (${rotulo(max)}) em ${lista(
          cargasAcimaDeMax.map((x) => `${rotulo(x.carga)}${x.ensaio === 'repetibilidade' ? ' (repetibilidade)' : ''}`),
        )}; confira a carga ou o Max da balança.`,
      })
    if (foraDoEmaServico.length)
      avisos.push({
        nivel: 'atencao',
        mensagem: `Erro maior que ${nomeLimite} em ${lista(foraDoEmaServico.map((f) => rotulo(f.carga)))}: pelo POP (7.8), a balança não pesa corretamente.`,
      })
    if (zeroFora)
      avisos.push({
        nivel: 'atencao',
        mensagem: `Retorno ao zero de ${leituraTexto(retornoZero, 0)} ${unidade}, maior que ${nomeLimite} (${textoLimite(limiteZero!)}): pelo POP (7.8), a balança não pesa corretamente.`,
      })
  }
  if (legado && semPadroes.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Carga sem padrões em ${lista(semPadroes)}: a referência é a carga digitada, sem a incerteza dos pesos.`,
    })
  // Peça de jogo "valor do certificado" sem a U no cadastro: entra pelo nominal, sem a correção do certificado (na
  // classe I, a etapa Revisão também dá a pendência: POP 6.1)
  if (substituicaoLida && cadeia) correcaoIgnorada.push(...cadeia.massa.correcaoIgnorada)
  if (correcaoIgnorada.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Correção do certificado ignorada em ${listaE([...new Set(correcaoIgnorada)])}: peça sem a U no cadastro entra pelo valor nominal. Complete a U no cadastro do padrão.`,
    })
  if (classeNaoConferida.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Classe dos pesos não conferida em ${lista(classeNaoConferida)}: pesos sem a classe OIML R 111 (R76 3.7.1).`,
    })
  if (classeInsuficiente.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Classe dos pesos insuficiente em ${lista(classeInsuficiente)}: Σ EMA dos pesos maior que 1/3 do EMA OIML inicial da balança${algumPelaIncerteza ? ' e, com os pesos E1/E2 pelo certificado, a incerteza 2·u (com a deriva) também' : ''} (R76 3.7.1).`,
    })
  // ---- Empuxo e convecção (classe I; cg-18 7.1.2.2 e 7.1.2.4) ----
  const estimado = opcoes.empuxo === 'AJUSTADO' || opcoes.empuxo === 'NAO_AJUSTADO' || opcoes.empuxo === 'DELTA_T'
  if (classeI && (opcoes.empuxo === 'NAO_AJUSTADO' || opcoes.empuxo === 'DELTA_T'))
    avisos.push({
      nivel: 'atencao',
      mensagem:
        'Balança classe I com o empuxo estimado sem a densidade do ar (cg-18 7.1.2-5d/5e): essa parcela domina a incerteza. Use “Densidade do ar medida” (Opções do cálculo, na Conclusão).',
    })
  if (opcoes.empuxo === 'AJUSTADO' && a && !a.ajustadaAntes)
    avisos.push({
      nivel: 'atencao',
      mensagem:
        'Empuxo “Balança ajustada logo antes” (cg-18 7.1.2-5c) num ensaio sem ajuste logo antes: a incerteza do empuxo fica subestimada; use “Balança não ajustada antes” ou “Densidade do ar medida”.',
    })
  if (opcoes.empuxo === 'MEDIDO' && ar && !ar.valida)
    avisos.push({
      nivel: 'info',
      mensagem:
        'Densidade do ar calculada fora da faixa de validade da fórmula do cg-18 (A1.1-1: 15 °C a 27 °C, 20 % a 80 % UR, 600 hPa a 1 100 hPa).',
    })
  if (estimado && ar && Math.abs(ar.densidade - RHO_0) > 0.1 * RHO_0 * (1 + TOL))
    avisos.push({
      nivel: 'atencao',
      mensagem: `Densidade do ar de ${formatarNumero(ar.densidade, 3)} kg/m³, a mais de 10 % de 1,2 kg/m³: as estimativas do empuxo sem a densidade do ar supõem até 10 % (cg-18 7.1.2.2, nota 5) e podem subestimar a incerteza; use “Densidade do ar medida”.`,
    })
  if (conveccaoAcimaEma.length)
    avisos.push({
      nivel: 'atencao',
      mensagem: `Convecção maior que 1/3 do EMA da peça em ${lista(conveccaoAcimaEma)}: a diferença de temperatura pesos − ar é grande para a classe dos pesos (cg-18, Tabela F2.2); se possível, aguarde a aclimatação.`,
    })
  // Pesos padrão de menos em cada etapa de substituição (a referência fica quase toda no material sem calibração;
  // regra da empresa, `pesosMinimosSubstituicao`: o POP não cobre as rodoviárias)
  if (cadeia?.massa.temPecas) {
    const minimo = pesosMinimosSubstituicao(converterMassa(max, unidade, 'kg'))
    if (minimo > 0 && converterMassa(cadeia.massa.nominal, unidade, 'kg') < minimo * (1 - TOL))
      avisos.push({
        nivel: 'atencao',
        mensagem: `Cargas de substituição com ${rotulo(cadeia.massa.nominal)} de pesos padrão em cada etapa: para Max de ${rotulo(max)}, o mínimo é ${formatarNumero(converterMassa(minimo, 'kg', unidade), 0)} ${unidade} (regra da empresa).`,
      })
  }
  // U < d: normal quando as leituras se repetem exatamente (s = 0 de verdade: u fica só com a resolução, d/√6). Suspeito
  // quando o s = 0 vem de poucas leituras (ou falta a repetibilidade) ou quando a divisão parece errada (leitura que não
  // é múltipla do d cadastrado)
  if (uMenorQueD.length)
    avisos.push(
      uMenorQueDPoucasLeituras || leiturasForaDaDivisao(entrada, ctx)
        ? {
            nivel: 'atencao',
            mensagem: `U menor que a divisão em ${lista(uMenorQueD)}: resultado suspeito; confira a repetibilidade (s = 0?) e a divisão.`,
          }
        : {
            nivel: 'info',
            mensagem: `U menor que a divisão em ${lista(uMenorQueD)}: normal quando as leituras se repetem exatamente; confira se a divisão (d) está certa.`,
          },
    )
  if (opcoes.divisaoTeste > 0)
    avisos.push({
      nivel: 'info',
      mensagem:
        'Leituras com resolução aumentada (divisão de teste): o certificado deve advertir que a incerteza é menor que a obtida com a divisão normal (cg-18 §8.3).',
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
    ar,
  }
}

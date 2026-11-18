// Avisos na hora (PLANO.md §1.11; 04-interface.md §6.5): as regras do sistema rodando no celular, em duas classes.
//
//   "Confira a digitação" (DIGITACAO, âmbar): leitura que não é múltiplo da divisão (d, ou a divisão de teste), com menos
//     ou mais casas que a divisão, ambiente improvável para o local (temperatura fora de −10 °C a 40 °C, a faixa de uso
//     das balanças sem marcação, R 76 3.9.2.1; umidade abaixo de 10 % ou acima de 98 %; pressão fora de 750 a 1 060 hPa)
//     e duas leituras seguidas da repetibilidade ou da excentricidade a menos de 5 s uma da outra. Saída: "Conferi, está
//     certo" (vai para `registro.avisosConferidos`).
//   "Isto impede o certificado" (IMPEDE, vermelho): tudo o que o sistema transforma em pendência de emissão e depende só
//     do que o técnico anota no local — padrão vencido (ou fora do intervalo do POP) no dia, ΔT pesos − ar acima do limite
//     na classe I, repetibilidade com menos leituras que o mínimo, balança que não pesa corretamente (POP 7.8, com o texto
//     neutro), leitura longe da carga, pressão em kPa ou valor do ambiente fora da faixa aceita, carga acima de Max e os
//     itens obrigatórios que faltam. Saída: "Resolver agora" ou "Registrar motivo".
//   Nenhum aviso bloqueia a assinatura (o que bloqueia é o "Falta para assinar", progresso.ts).
//
// Quando uma regra da lista de "Confira a digitação" é também pendência de emissão (a leitura longe da carga, a pressão em
// kPa, o ambiente fora da faixa aceita), o aviso sai como IMPEDE: "Conferi, está certo" deixaria o certificado travado.
// Fora das regras do POP (a revisão de um certificado antigo), a leitura longe da carga volta a ser só digitação.
//
// Toda pendência de emissão que depende só de dados do campo cai em IMPEDE: `avisosDoRegistro` roda as mesmas regras do
// escritório (`pendenciasEmissao` e o cálculo) sobre o rascunho que o registro daria (`registroParaRascunho`) e classifica
// cada pendência (`classeDaPendencia`); as do escritório (cadastro dos padrões, opções do cálculo, conformidade, próxima
// calibração) ficam de fora. Uma pendência que a tabela não conhece sai como IMPEDE, com o texto do sistema.
//
// "Algo diferente…" num dado metrológico (d, e, Max, Min, classe, unidade) com o valor visto em campo: os avisos usam o
// valor visto (`instrumentoDoCampo`); sem valor que dê para ler, os avisos que dependem dele ficam desligados
// (`faixaDosAvisos` explica).

import { calcularCalibracao } from '../calibracao.ts'
import {
  dataIsoValida,
  deltaTPesosMaximo,
  FAIXAS_AMBIENTE,
  foraDaFaixaAmbiente,
  formatarDataBr,
  hojeLocalIso,
  MESES_MAX_CALIBRACAO_PADRAO,
  minimosDoPopComoAviso,
  PENDENCIA_TERMOMETRO_DUAS_ENTRADAS,
  PENDENCIAS_SO_DO_SERVIDOR,
  pendenciaDoCertificadoDigital,
  pendenciasEmissao,
  regrasDoPopComoAviso,
  somarMeses,
} from '../dominio.ts'
import {
  cargaDaDescida,
  cargaDaFaixaDecrescente,
  casasAbaixoDaDivisao,
  casasDecimais,
  CRITERIO_NAO_PESA_CORRETAMENTE,
  divisaoDaLeitura,
  emaInstrumento,
  faixaDoValor,
  formatarNumero,
  leituraForaDaDivisao,
  leituraImplausivel,
  minimoLeiturasRepetibilidade,
  PENDENCIA_AR_MEDIDO,
  PENDENCIA_CARGA_EXCENTRICIDADE,
  PENDENCIA_CONVECCAO,
  PENDENCIA_LEITURAS_EXCENTRICIDADE,
  PENDENCIA_RETORNO_ZERO,
  PENDENCIA_SEM_LEITURAS_INDICACAO,
} from '../metrologia/index.ts'
import type { InstrumentoCalculo } from '../metrologia/index.ts'
import type { CalibracaoInput, Padrao, Unidade } from '../tipos.ts'
import {
  balancaDoCampo,
  dataDoRegistro,
  indiceDeltaTValido,
  indiceFimValido,
  indiceInicioValido,
  instrumentoDoCampo,
  msDoInstante,
  padroesDoPacote,
  PENDENCIA_JUSTIFICATIVA_CAMPO,
  registroCorrigido,
  registroParaRascunho,
  unidadeDoRegistro,
} from './importar.ts'
import type { InstrumentoDoCampo } from './importar.ts'
import { casasDaLeitura, numeroDaLeitura } from './registro.ts'
import type {
  AvisoConferidoCampo,
  CampoConferir,
  ClasseAviso,
  Instante,
  LeituraCampo,
  NumeroPasso,
  PacoteCampo,
  RegistroCampo,
} from './tipos.ts'

// ---- Os avisos -------------------------------------------------------------------------------------------------------

/** Um aviso na hora. `campo`: o caminho a partir de `passos` (tipos.ts), ou '' quando é do passo todo. */
export interface AvisoCampo {
  /** O código estável (vai para `avisosConferidos`): "FORA_DA_DIVISAO", "PADRAO_VENCIDO", "FALTA_PRESSAO"… */
  codigo: string
  classe: ClasseAviso
  passo: NumeroPasso
  campo: string
  texto: string
  /** Um dado que falta (não um dado com problema): a Revisão mostra junto do "Falta para assinar". */
  falta: boolean
}

/** O texto neutro da balança que não pesa corretamente (nunca "reprovada"). */
export const TEXTO_NAO_PESA =
  'As leituras indicam que a balança precisa de manutenção antes da calibração (POP 7.8). Fale com o escritório.'

/** Faixas do ambiente plausíveis para o local (fora delas, só "Confira a digitação"; fora de `FAIXAS_AMBIENTE`, impede). */
export const FAIXAS_PLAUSIVEIS = {
  /** A faixa de uso das balanças sem marcação de temperatura (R 76 3.9.2.1). */
  temperatura: { min: -10, max: 40 },
  umidade: { min: 10, max: 98 },
  /** Do nível do mar a cerca de 2 500 m de altitude. */
  pressao: { min: 750, max: 1060 },
} as const

/** Duas leituras seguidas da repetibilidade ou da excentricidade a menos disto: tirar e pôr a carga leva mais. */
export const INTERVALO_MINIMO_LEITURAS_MS = 5_000

// ---- Contexto de uma leitura ------------------------------------------------------------------------------------------

/** O que a leitura é (decide as regras que valem para ela). */
export type TipoLeituraCampo =
  | 'INDICACAO_CRESCENTE'
  | 'INDICACAO_DECRESCENTE'
  | 'RETORNO_ZERO'
  | 'SUBSTITUICAO'
  | 'REPETIBILIDADE'
  | 'EXCENTRICIDADE'
  | 'ZERO_EXCENTRICIDADE'
  /** Carga escrita no local (ponto acrescentado, ou a carga aplicada da repetibilidade e da excentricidade). */
  | 'CARGA'
  | 'TEMPERATURA'
  | 'UMIDADE'
  | 'PRESSAO'
  | 'DELTA_T'

/** Tudo o que `avisosDaLeitura` precisa para julgar uma leitura (monte com `contextoDaLeitura`). */
export interface ContextoLeitura {
  campo: string
  passo: NumeroPasso
  tipo: TipoLeituraCampo
  /** A unidade das leituras de massa (a do registro). */
  unidade: Unidade
  /** A balança como o técnico a viu; null (ou sem faixas) desliga os avisos de massa. */
  instrumento: Pick<InstrumentoCalculo, 'classe' | 'tipoFaixas' | 'faixas'> | null
  /** Dados metrológicos sem valor legível ("Algo diferente…" sem o valor): os avisos que dependem deles ficam desligados. */
  desligados: readonly CampoConferir[]
  /** O d veio do valor visto em campo (o texto do aviso não manda marcar "Algo diferente" de novo). */
  dVisto: boolean
  /** A carga da leitura (na unidade do registro); null = sem carga conhecida. */
  carga: number | null
  /** A carga que decide a faixa (a leitura decrescente das múltiplas faixas: a maior carga aplicada). */
  cargaFaixa: number | null
  divisaoTeste: number
  /** Método da excentricidade (1 a 4): a indicação com a carga só é conferida nos métodos 1 e 3; o zero antes, no 3. */
  metodoExcentricidade: number
  /** A leitura anterior da mesma série (repetibilidade, excentricidade), para a regra dos 5 s. */
  anterior: LeituraCampo | null
  /** Max (na unidade do registro); null = desconhecido. */
  max: number | null
  /** Tolerância do cliente (conformidade pedida pelo critério do cliente), para a balança sem classe; null sem ela. */
  toleranciaCliente: number | null
  /** Classe I: o maior ΔT pesos − ar para começar os ensaios (POP 7.4); null fora da classe I. */
  limiteDeltaT: number | null
  /** As regras do POP valem (calibração nova): a leitura longe da carga e a balança que não pesa impedem o certificado. */
  regrasDoPop: boolean
  /** O valor do ambiente vai para o certificado (a linha do início que vale, a do fim; o ΔT que vale). */
  noCertificado: boolean
}

/** Os dados do registro que todos os contextos usam, calculados uma vez (`avisosDoRegistro`). */
export interface PreparoAvisos {
  rascunho: CalibracaoInput
  instrumento: InstrumentoDoCampo
  unidade: Unidade
  cargaDescida: number | null
  limiteDeltaT: number | null
  padroesUsados: Padrao[]
}

export function prepararAvisos(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): PreparoAvisos {
  const rascunho = registroParaRascunho(registro, pacote)
  const instrumento = instrumentoDoCampo(registro, pacote)
  const i = instrumento.instrumento
  const padroesUsados = padroesDoPacote(pacote, rascunho.padroesIds)
  const jogos = padroesUsados.filter((p) => p.tipo === 'PESOS').map((p) => p.classe)
  const classe = i && !instrumento.desligados.includes('balanca.classe') ? i.classe : null
  return {
    rascunho,
    instrumento,
    unidade: unidadeDoRegistro(registro, pacote),
    cargaDescida:
      i && i.faixas.length
        ? cargaDaDescida(i, rascunho.indicacao.metodo, rascunho.opcoes.divisaoTeste, rascunho.indicacao.pontos)
        : null,
    limiteDeltaT: classe === 'I' ? (jogos.length ? deltaTPesosMaximo(jogos) : (pacote?.plano?.limiteDeltaTPesos ?? 1)) : null,
    padroesUsados,
  }
}

const RE = {
  ponto: /^indicacao\.pontos\.([^.]+)\.(crescente|decrescente|cargaAplicada)$/,
  retorno: /^indicacao\.retornoZero$/,
  etapa: /^indicacao\.substituicao\.etapas\.(\d+)\.(padroes|substituicao)$/,
  repLeitura: /^repetibilidade\.([^.]+)\.leituras\.(\d+)$/,
  repCarga: /^repetibilidade\.([^.]+)\.cargaAplicada$/,
  excPosicao: /^excentricidade\.posicoes\.(\d+)\.(leitura|zeroAntes)$/,
  excCarga: /^excentricidade\.cargaAplicada$/,
  ambiente: /^ambiente\.linhas\.(\d+)\.(temperatura|umidade|pressao)$/,
  deltaT: /^ambiente\.deltaT\.(\d+)(?:\.valor)?$/,
  deltaT0: /^ambiente\.deltaT0\.(origem|sala)$/,
} as const

/**
 * O contexto de uma leitura do registro pelo caminho dela (o mesmo `campo` das correções e dos avisos conferidos:
 * "indicacao.pontos.p3.crescente", "repetibilidade.rep1.leituras.4", "ambiente.linhas.0.pressao"…), também de uma
 * leitura que ainda vai entrar (a próxima posição da lista). null para um caminho que não é de leitura.
 */
export function contextoDaLeitura(
  registro: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  campo: string,
  preparo: PreparoAvisos = prepararAvisos(registro, pacote),
): ContextoLeitura | null {
  const { rascunho, instrumento: vista } = preparo
  const ps = registro.passos
  const i = vista.instrumento && vista.instrumento.faixas.length ? vista.instrumento : null
  const conformidade = rascunho.conformidade
  const base: Omit<ContextoLeitura, 'tipo' | 'passo'> = {
    campo,
    unidade: preparo.unidade,
    instrumento: i,
    desligados: vista.desligados,
    dVisto: vista.observados.some((o) => o.campo === 'balanca.d'),
    carga: null,
    cargaFaixa: null,
    divisaoTeste: rascunho.opcoes.divisaoTeste,
    metodoExcentricidade: rascunho.excentricidade.metodo,
    anterior: null,
    max: i ? i.faixas[i.faixas.length - 1].max : null,
    toleranciaCliente:
      conformidade.solicitada && conformidade.criterio === 'CLIENTE' && conformidade.toleranciaCliente > 0
        ? conformidade.toleranciaCliente
        : null,
    limiteDeltaT: preparo.limiteDeltaT,
    regrasDoPop: !regrasDoPopComoAviso(rascunho),
    noCertificado: true,
  }
  let m: RegExpExecArray | null
  if ((m = RE.ponto.exec(campo))) {
    const p = rascunho.indicacao.pontos.find((x) => x.id === m![1])
    const carga = p ? p.carga : null
    if (m[2] === 'cargaAplicada') return { ...base, tipo: 'CARGA', passo: 5, carga }
    const desce = m[2] === 'decrescente'
    return {
      ...base,
      tipo: desce ? 'INDICACAO_DECRESCENTE' : 'INDICACAO_CRESCENTE',
      passo: 5,
      carga,
      cargaFaixa: carga !== null && desce ? cargaDaFaixaDecrescente(carga, preparo.cargaDescida) : carga,
    }
  }
  if (RE.retorno.test(campo)) return { ...base, tipo: 'RETORNO_ZERO', passo: 5, carga: 0, cargaFaixa: 0 }
  if ((m = RE.etapa.exec(campo))) return { ...base, tipo: 'SUBSTITUICAO', passo: 5 }
  if ((m = RE.repLeitura.exec(campo))) {
    const r = rascunho.repetibilidade.find((x) => x.id === m![1])
    const j = Number(m[2])
    const anterior = ps.repetibilidade.find((x) => x.id === m![1])?.leituras[j - 1] ?? null
    return { ...base, tipo: 'REPETIBILIDADE', passo: 6, carga: r ? r.carga : null, cargaFaixa: r ? r.carga : null, anterior }
  }
  if (RE.repCarga.test(campo)) {
    const id = RE.repCarga.exec(campo)![1]
    return { ...base, tipo: 'CARGA', passo: 6, carga: rascunho.repetibilidade.find((x) => x.id === id)?.carga ?? null }
  }
  if ((m = RE.excPosicao.exec(campo))) {
    const k = Number(m[1])
    const zero = m[2] === 'zeroAntes'
    const posicoes = ps.excentricidade.posicoes
    const anterior = zero ? (posicoes[k - 1]?.leitura ?? null) : (posicoes[k]?.zeroAntes ?? posicoes[k - 1]?.leitura ?? null)
    const carga = zero ? 0 : rascunho.excentricidade.carga
    return { ...base, tipo: zero ? 'ZERO_EXCENTRICIDADE' : 'EXCENTRICIDADE', passo: 7, carga, cargaFaixa: carga, anterior }
  }
  if (RE.excCarga.test(campo)) return { ...base, tipo: 'CARGA', passo: 7, carga: rascunho.excentricidade.carga }
  if ((m = RE.ambiente.exec(campo))) {
    const k = Number(m[1])
    const iIni = indiceInicioValido(registro)
    const iFim = indiceFimValido(registro)
    const tipo = m[2] === 'temperatura' ? 'TEMPERATURA' : m[2] === 'umidade' ? 'UMIDADE' : 'PRESSAO'
    // A pressão do certificado é a do início (a do fim só quando a do início ficou em branco)
    const iPressao = ps.ambiente.linhas[iIni]?.pressao ? iIni : iFim
    return { ...base, tipo, passo: 4, noCertificado: tipo === 'PRESSAO' ? k === iPressao : k === iIni || k === iFim }
  }
  if ((m = RE.deltaT.exec(campo))) {
    const k = Number(m[1])
    const valido = indiceDeltaTValido(registro)
    // A medição nova (a próxima da lista) é a que vale até outra entrar
    return { ...base, tipo: 'DELTA_T', passo: 4, noCertificado: k === valido || k >= ps.ambiente.deltaT.length }
  }
  if (RE.deltaT0.test(campo)) return { ...base, tipo: 'TEMPERATURA', passo: 4 }
  return null
}

// ---- Uma leitura ------------------------------------------------------------------------------------------------------

const TOL = 1e-9
const naoExcede = (valor: number, limite: number) => valor <= limite + TOL * Math.max(Math.abs(limite), Math.abs(valor))
const fmt = (v: number) => formatarNumero(v, casasDecimais(v))
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * Os avisos de uma leitura, na hora em que ela é confirmada ("Próxima" ou saindo do campo). Rápido e local: as regras
 * de uma leitura só (múltiplo e casas da divisão, longe da carga, balança que não pesa, carga acima de Max, ambiente, ΔT,
 * leituras rápidas demais). As do passo e da folha inteira: `avisosDoPasso` e `avisosDoRegistro`.
 */
export function avisosDaLeitura(ctx: ContextoLeitura, leitura: LeituraCampo | string | null | undefined): AvisoCampo[] {
  const valor = typeof leitura === 'string' ? leitura : leitura?.valor
  const n = numeroDaLeitura(valor ?? null)
  if (valor === undefined || n === null) return []
  const avisos: AvisoCampo[] = []
  const aviso = (codigo: string, classe: ClasseAviso, texto: string) =>
    avisos.push({ codigo, classe, passo: ctx.passo, campo: ctx.campo, texto, falta: false })
  const ambiente = (faixa: 'temperatura' | 'umidade' | 'pressao' | 'deltaTPesos', unidade: string) => {
    if (!foraDaFaixaAmbiente(n, faixa)) return false
    const { min, max } = FAIXAS_AMBIENTE[faixa]
    const sinal = (x: number) => `${x < 0 ? '−' : ''}${Math.abs(x)}`
    aviso(
      'AMBIENTE_FORA_DA_FAIXA',
      ctx.noCertificado ? 'IMPEDE' : 'DIGITACAO',
      `${valor} ${unidade} está fora da faixa aceita (${sinal(min)} ${unidade} a ${sinal(max)} ${unidade}). Confira o valor.`,
    )
    return true
  }
  switch (ctx.tipo) {
    case 'TEMPERATURA': {
      if (ambiente('temperatura', '°C')) break
      const f = FAIXAS_PLAUSIVEIS.temperatura
      if (n < f.min || n > f.max)
        aviso(
          'TEMPERATURA_IMPROVAVEL',
          'DIGITACAO',
          `${valor} °C está fora da faixa de uso das balanças (−10 °C a 40 °C). Confira a digitação; se for isso mesmo, anote em Anotações.`,
        )
      break
    }
    case 'UMIDADE': {
      if (ambiente('umidade', '%')) break
      const f = FAIXAS_PLAUSIVEIS.umidade
      if (n < f.min || n > f.max) aviso('UMIDADE_IMPROVAVEL', 'DIGITACAO', `Umidade de ${valor} %: confira a digitação.`)
      break
    }
    case 'PRESSAO': {
      if (n >= 30 && n <= 120) {
        aviso(
          'PRESSAO_EM_KPA',
          ctx.noCertificado ? 'IMPEDE' : 'DIGITACAO',
          `${valor} parece estar em kPa. A folha pede hPa (ex.: ${formatarNumero(n * 10, Math.max(0, casasDecimais(n) - 1))}).`,
        )
        break
      }
      if (ambiente('pressao', 'hPa')) break
      const f = FAIXAS_PLAUSIVEIS.pressao
      if (n < f.min || n > f.max)
        aviso(
          'PRESSAO_IMPROVAVEL',
          'DIGITACAO',
          `Pressão de ${valor} hPa: improvável para o local. Confira o barômetro e a digitação.`,
        )
      break
    }
    case 'DELTA_T': {
      if (ambiente('deltaTPesos', '°C')) break
      if (ctx.limiteDeltaT !== null && !naoExcede(Math.abs(n), ctx.limiteDeltaT))
        aviso(
          'DELTA_T_ACIMA',
          ctx.noCertificado ? 'IMPEDE' : 'DIGITACAO',
          `ΔT de ${valor} °C, acima de ${fmt(ctx.limiteDeltaT)} °C. Aguarde a aclimatação dos pesos e meça de novo (POP 7.4).`,
        )
      break
    }
    default:
      avisosDeMassa(ctx, valor, n, aviso)
  }
  // Duas leituras seguidas a menos de 5 s (a tecla "Repetir" depressa demais)
  if (
    (ctx.tipo === 'REPETIBILIDADE' || ctx.tipo === 'EXCENTRICIDADE' || ctx.tipo === 'ZERO_EXCENTRICIDADE') &&
    ctx.anterior &&
    typeof leitura === 'object'
  ) {
    const a = msDoInstante(ctx.anterior.em)
    const b = msDoInstante(leitura?.em)
    if (a !== null && b !== null && Math.abs(b - a) < INTERVALO_MINIMO_LEITURAS_MS)
      aviso('LEITURA_RAPIDA', 'DIGITACAO', 'Duas leituras com menos de 5 s entre elas. Tirou e pôs a carga de novo?')
  }
  return avisos
}

function avisosDeMassa(
  ctx: ContextoLeitura,
  valor: string,
  n: number,
  aviso: (codigo: string, classe: ClasseAviso, texto: string) => void,
): void {
  const i = ctx.instrumento && ctx.instrumento.faixas.length ? ctx.instrumento : null
  if (!i) return
  const desligado = (c: CampoConferir) => ctx.desligados.includes(c)
  const u = ctx.unidade
  if (ctx.tipo === 'CARGA') {
    if (ctx.max !== null && !desligado('balanca.max') && n > ctx.max * (1 + TOL))
      aviso(
        'CARGA_ACIMA_DE_MAX',
        ctx.regrasDoPop ? 'IMPEDE' : 'DIGITACAO',
        `Carga acima da capacidade (Max ${fmt(ctx.max)} ${u}). Confira a carga.`,
      )
    return
  }
  const carga = ctx.carga ?? (ctx.tipo === 'SUBSTITUICAO' ? n : null)
  if (carga === null) return
  const faixa = ctx.cargaFaixa ?? carga
  const escala = Math.max(...i.faixas.map((f) => f.max), Number.MIN_VALUE)

  // Divisão: múltiplo de d e as casas (com a faixa das múltiplas faixas pelo Max, que precisa ser conhecido)
  if (!desligado('balanca.d') && !(desligado('balanca.max') && i.faixas.length > 1)) {
    const zero = Math.abs(carga) <= TOL * escala && Math.abs(n) <= TOL * escala
    const d0 = ctx.divisaoTeste > 0 ? ctx.divisaoTeste : i.faixas[0].d
    const d = zero ? d0 : divisaoDaLeitura(n, i, ctx.divisaoTeste, ctx.tipo === 'SUBSTITUICAO' ? n : faixa)
    const textoD = `d = ${fmt(d)} ${u}`
    const casas = casasDaLeitura(valor)
    const casasD = casasDecimais(d)
    if (leituraForaDaDivisao(n, d))
      aviso(
        'FORA_DA_DIVISAO',
        'DIGITACAO',
        `${valor} não é múltiplo de ${textoD}. Confira o mostrador.${
          ctx.dVisto ? '' : ' Se a balança indica mais fino que d, marque “Algo diferente” no d (passo 3).'
        }`,
      )
    else if (casas > casasD)
      aviso(
        'MAIS_CASAS',
        'DIGITACAO',
        `A divisão tem ${plural(casasD, 'casa', 'casas')} (${textoD}). Confira se não sobrou um dígito.`,
      )
    // O zero escrito "0" não esconde dígito; "100" no lugar de "100,05", sim
    if (n !== 0 && casasAbaixoDaDivisao(casas, d))
      aviso(
        'MENOS_CASAS',
        'DIGITACAO',
        `A divisão tem ${plural(casasD, 'casa', 'casas')} (${textoD}) e a leitura ${casas ? `só ${casas}` : 'nenhuma'}. Escreva todos os dígitos do mostrador.`,
      )
  }

  // Longe da carga (vírgula esquecida, outra unidade, carga trocada): a regra do cálculo (`leituraImplausivel`)
  const conferirCarga =
    ctx.tipo === 'INDICACAO_CRESCENTE' ||
    ctx.tipo === 'INDICACAO_DECRESCENTE' ||
    (ctx.tipo === 'REPETIBILIDADE' && carga > 0) ||
    (ctx.tipo === 'EXCENTRICIDADE' && (ctx.metodoExcentricidade === 1 || ctx.metodoExcentricidade === 3) && carga > 0) ||
    (ctx.tipo === 'ZERO_EXCENTRICIDADE' && ctx.metodoExcentricidade === 3)
  const semE = desligado('balanca.e') || desligado('balanca.d') || (desligado('balanca.max') && i.faixas.length > 1)
  const longe = conferirCarga && !semE && leituraImplausivel(n, carga, i, faixa)
  if (longe) {
    const textoCarga = formatarNumero(carga, Math.max(casasDecimais(faixaDoValor(faixa, i).d), casasDecimais(carga)))
    aviso(
      'LONGE_DA_CARGA',
      ctx.regrasDoPop ? 'IMPEDE' : 'DIGITACAO',
      carga > 0
        ? `${valor} está muito longe da carga de ${textoCarga} ${u}. Confira a digitação ou os pesos.`
        : `${valor} ${u} sem carga na balança. Confira a digitação.`,
    )
  }

  // A balança que não pesa corretamente (POP 7.8): o erro (ou o retorno ao zero) acima do EMA em serviço; sem classe, a
  // tolerância do cliente. Pela carga nominal (o cálculo, no escritório, usa o valor dos pesos)
  const conferirEma =
    ((ctx.tipo === 'INDICACAO_CRESCENTE' || ctx.tipo === 'INDICACAO_DECRESCENTE') && carga > 0) || ctx.tipo === 'RETORNO_ZERO'
  if (conferirEma && !longe && ctx.regrasDoPop && !semE && !desligado('balanca.classe')) {
    let limite: number | null = ctx.toleranciaCliente
    if (i.classe) {
      const naFaixa = faixa === carga ? i : { ...i, tipoFaixas: 'UNICA' as const, faixas: [faixaDoValor(faixa, i)] }
      limite = emaInstrumento(carga, naFaixa, CRITERIO_NAO_PESA_CORRETAMENTE)
    }
    const erro = ctx.tipo === 'RETORNO_ZERO' ? n : n - carga
    if (limite !== null && !naoExcede(Math.abs(erro), limite)) aviso('NAO_PESA_CORRETAMENTE', 'IMPEDE', TEXTO_NAO_PESA)
  }
}

// ---- As pendências do sistema -----------------------------------------------------------------------------------------

/** O que o celular faz com uma pendência de emissão: IMPEDE (dado do campo) ou ESCRITORIO (não aparece no celular). */
export type DestinoPendencia = 'IMPEDE' | 'ESCRITORIO'

export interface ClasseDePendencia {
  codigo: string
  classe: DestinoPendencia
  passo: NumeroPasso
  /** Um dado que falta (não um dado com problema). */
  falta: boolean
}

interface RegraPendencia extends ClasseDePendencia {
  padrao: RegExp
  /** Na balança informada no local (folhas só do cliente e em branco), o cadastro é o que o técnico escreveu. */
  naInformada?: DestinoPendencia
}

const exato = (texto: string) => new RegExp(`^${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
const regra = (
  codigo: string,
  classe: DestinoPendencia,
  passo: NumeroPasso,
  padrao: RegExp,
  extra: { falta?: boolean; naInformada?: DestinoPendencia } = {},
): RegraPendencia => ({ codigo, classe, passo, padrao, falta: extra.falta ?? false, naInformada: extra.naInformada })
const FALTA = { falta: true }

/**
 * A classe de cada pendência de emissão (`pendenciasEmissao`, `pendenciasAmbiente`, `pendenciasPressao` e as do cálculo),
 * pelo texto: IMPEDE quando depende só do que o técnico anota no local (e dá para resolver lá: medir de novo, fazer mais
 * leituras, trocar o padrão, marcar o que foi usado); ESCRITORIO quando é do cadastro (padrão sem certificado,
 * acreditação, classe ou densidade dos pesos), das opções do cálculo, da conformidade ou da próxima calibração. A ordem
 * importa: vale a primeira que casar.
 */
export const REGRAS_PENDENCIA: readonly RegraPendencia[] = [
  // A balança que não pesa corretamente (o erro ou o retorno ao zero; POP 7.8)
  regra('NAO_PESA_CORRETAMENTE', 'IMPEDE', 5, /a balança não pesa corretamente e não é calibrada \(POP 7\.8\)\.$/),
  // Campos obrigatórios (camposObrigatoriosEmissao) e a data
  regra('FALTA_DATA', 'IMPEDE', 8, /^Informe a data da calibração\.$/, FALTA),
  regra('DATA_FUTURA', 'IMPEDE', 8, /^A data da calibração não pode ser futura\.$/),
  regra('FALTA_TECNICO', 'IMPEDE', 2, /^Informe o técnico que executou a calibração\.$/, FALTA),
  regra('FALTA_PESOS', 'IMPEDE', 1, /^Escolha os padrões utilizados\.$/, FALTA),
  regra('FALTA_PESOS', 'IMPEDE', 1, /^Escolha pelo menos um jogo de pesos padrão\.$/, FALTA),
  regra('FALTA_ENDERECO', 'IMPEDE', 2, /^Informe o endereço onde a calibração foi feita\.$/, FALTA),
  regra('FALTA_TEMPERATURA', 'IMPEDE', 4, /^Registre a temperatura no início e no fim da calibração\.$/, FALTA),
  // Os padrões: o vencido (ou fora do intervalo do POP) no dia se resolve no local (outro padrão); o cadastro, não
  regra('PADRAO_VENCIDO', 'IMPEDE', 1, /^O padrão .+ estava vencido na data da calibração/),
  regra('PADRAO_FORA_DO_INTERVALO', 'IMPEDE', 1, /^O padrão .+ foi calibrado em .+, há mais de \d+ meses desta calibração/),
  regra('PADRAO_DESATIVADO', 'ESCRITORIO', 1, /^O padrão .+ está desativado:/),
  regra('PADRAO_SEM_VALIDADE', 'ESCRITORIO', 1, /^O padrão .+ está sem a data da próxima calibração\.$/),
  regra('PADRAO_CALIBRADO_DEPOIS', 'ESCRITORIO', 1, /^O padrão .+ foi calibrado em .+, depois desta calibração/),
  regra('PADRAO_SEM_CERTIFICADO', 'ESCRITORIO', 1, /^O padrão .+ está sem o número do certificado/),
  regra('PADRAO_SEM_ACREDITACAO', 'ESCRITORIO', 1, /^O padrão .+ está sem a acreditação Cgcre/),
  // O ambiente e a pressão (pendenciasAmbiente, pendenciasPressao)
  regra('PRESSAO_EM_KPA', 'IMPEDE', 4, /^Pressão de .+ hPa fora da faixa .+: a pressão é em hPa/),
  regra(
    'AMBIENTE_FORA_DA_FAIXA',
    'IMPEDE',
    4,
    /^(Temperatura no início|Temperatura no fim|Umidade no início|Umidade no fim|Pressão|Diferença de temperatura pesos − ar|Aclimatação dos pesos: diferença na chegada|Aclimatação dos pesos: tempo no local) fora da faixa/,
  ),
  regra('FALTA_BAROMETRO', 'IMPEDE', 4, /^Pressão informada sem barômetro nos padrões/, FALTA),
  regra('FALTA_PRESSAO', 'IMPEDE', 4, /^Barômetros? escolhidos? sem a pressão registrada/, FALTA),
  regra('FALTA_PRESSAO', 'IMPEDE', 4, /^Registre a pressão atmosférica/, FALTA),
  regra('FALTA_AR_MEDIDO', 'IMPEDE', 4, exato(PENDENCIA_AR_MEDIDO), FALTA),
  regra('FALTA_DELTA_T', 'IMPEDE', 4, exato(PENDENCIA_CONVECCAO), FALTA),
  regra('CONVECCAO_FORA_DA_TABELA', 'IMPEDE', 4, /^Convecção: diferença de temperatura acima de 20/),
  // Classe I
  regra('TERMOMETRO_DUAS_ENTRADAS', 'IMPEDE', 1, exato(PENDENCIA_TERMOMETRO_DUAS_ENTRADAS)),
  regra('PESOS_CLASSE_I', 'ESCRITORIO', 1, /^Balança classe I: o jogo .+ (é da classe|está sem a classe)/),
  regra('PESOS_CLASSE_I', 'ESCRITORIO', 1, /^Balança classe I: use o jogo .+ pelo valor do certificado/),
  regra('PESOS_CLASSE_I', 'ESCRITORIO', 1, /^Balança classe I: o jogo .+ está sem a incerteza/),
  regra('OPCOES_CLASSE_I', 'ESCRITORIO', 8, /^Balança classe I: (o empuxo do ar|a convecção) precisa entrar no cálculo/),
  // A balança (cadastrada: o escritório corrige; informada: o técnico escreveu)
  regra('BALANCA_SEM_IDENTIFICACAO', 'ESCRITORIO', 3, /^Balança sem nº de série nem identificação/, { naInformada: 'IMPEDE' }),
  regra('BALANCA_SEM_FAIXA', 'ESCRITORIO', 3, /^Instrumento: informe pelo menos uma faixa/, { naInformada: 'IMPEDE' }),
  // Excentricidade
  regra('EXCENTRICIDADE_DISPENSADA', 'IMPEDE', 7, /^Excentricidade: o POP .+ só dispensa o ensaio/),
  regra('FALTA_MOTIVO_EXCENTRICIDADE', 'IMPEDE', 7, /^Excentricidade: informe por que o ensaio não foi feito/, FALTA),
  regra('FALTA_LEITURAS_EXCENTRICIDADE', 'IMPEDE', 7, exato(PENDENCIA_LEITURAS_EXCENTRICIDADE), FALTA),
  regra('FALTA_CARGA_EXCENTRICIDADE', 'IMPEDE', 7, exato(PENDENCIA_CARGA_EXCENTRICIDADE), FALTA),
  regra('FALTA_POSICOES', 'IMPEDE', 7, /^Excentricidade: \d+ posi(ção|ções) sem leitura/, FALTA),
  regra('LONGE_DA_CARGA', 'IMPEDE', 7, /^Excentricidade \(.+\): (leitura|zero antes) .+ fora do esperado/),
  regra('CARGA_ACIMA_DE_MAX', 'IMPEDE', 7, /^Excentricidade: carga de .+ acima de Max/),
  // Erro de indicação
  regra('FALTA_LEITURAS_INDICACAO', 'IMPEDE', 5, exato(PENDENCIA_SEM_LEITURAS_INDICACAO), FALTA),
  regra('FALTA_RETORNO_ZERO', 'IMPEDE', 5, exato(PENDENCIA_RETORNO_ZERO), FALTA),
  regra('FALTA_CARGAS', 'IMPEDE', 5, /^Erro de indicação: registre as leituras das cargas acima de zero/, FALTA),
  regra('POUCOS_PONTOS', 'IMPEDE', 5, /^Erro de indicação: \d+ pontos? lidos?; o POP pede no mínimo 5/),
  regra('FALTA_ZERO', 'IMPEDE', 5, /^Erro de indicação: falta a leitura do zero/),
  regra('FALTA_SUBIDA', 'IMPEDE', 5, /^Erro de indicação: falta a leitura de subida em/),
  regra('FALTA_DESCIDA', 'IMPEDE', 5, /^Erro de indicação: falta a leitura de descida em/),
  regra('PONTO_SEM_CARGA', 'IMPEDE', 5, /^Erro de indicação: o ponto \d+ está sem carga/),
  regra('METODO_DECRESCENTE', 'ESCRITORIO', 5, /^Erro de indicação: a subida é obrigatória; troque o método/),
  regra('METODO_FORA_DO_POP', 'ESCRITORIO', 5, /^Erro de indicação: .+ não é o método do POP nesta classe/),
  regra('LONGE_DA_CARGA', 'IMPEDE', 5, /^Erro de indicação, ponto de .+: leitura .+ (com carga zero|fora do esperado)/),
  regra('CARGA_ACIMA_DE_MAX', 'IMPEDE', 5, /^Erro de indicação, ponto de .+: carga acima de Max/),
  regra('PONTO_SEM_PESOS', 'IMPEDE', 5, /^Erro de indicação, ponto de .+: nenhum peso padrão no ponto/),
  regra(
    'CARGA_DIFERENTE_DOS_PESOS',
    'IMPEDE',
    5,
    /^Erro de indicação, ponto de .+: (as etapas de substituição e os pesos somam|as etapas de substituição somam|os pesos somam) /,
  ),
  regra(
    'SUBSTITUICAO_INCOMPLETA',
    'IMPEDE',
    5,
    /^Erro de indicação, ponto de .+: (faltam etapas de substituição|faltam as leituras da etapa)/,
  ),
  // Peças de um jogo que não foi marcado como usado: marcar no passo 1; peça tirada do cadastro: o escritório
  regra('PESOS_FORA_DOS_PADROES', 'IMPEDE', 1, /^Erro de indicação, ponto de .+: .*não está entre os padrões escolhidos/),
  regra('PESOS_FORA_DO_CADASTRO', 'ESCRITORIO', 1, /^Erro de indicação, ponto de .+: .*peças? tiradas? do cadastro/),
  regra('PESOS_DA_SUBSTITUICAO', 'ESCRITORIO', 5, /^Erro de indicação, ponto de .+: informe os pesos padrão usados nas etapas/),
  // Repetibilidade
  regra('FALTA_REPETIBILIDADE', 'IMPEDE', 6, /^Repetibilidade: registre (pelo menos 2 leituras|as leituras do ensaio)/, FALTA),
  regra('FALTA_CARGA_REPETIBILIDADE', 'IMPEDE', 6, /^Repetibilidade: informe a carga do ensaio/, FALTA),
  regra('FALTA_ENSAIO_REPETIBILIDADE', 'IMPEDE', 6, /^Repetibilidade: \d+ ensaios? para \d+ /),
  regra('LONGE_DA_CARGA', 'IMPEDE', 6, /^Repetibilidade a .+: leitura .+ fora do esperado/),
  regra('CARGA_ACIMA_DE_MAX', 'IMPEDE', 6, /^Repetibilidade a .+: carga acima de Max/),
  regra('POUCAS_LEITURAS_REPETIBILIDADE', 'IMPEDE', 6, /^Repetibilidade a .+: \d+ leituras?; /),
  // Pesos (cadastro): o escritório
  regra('DENSIDADE_DOS_PESOS', 'ESCRITORIO', 1, /^Empuxo pela densidade do ar medida: (os jogos|o jogo) /),
  regra('PESOS_SEM_EMA', 'ESCRITORIO', 1, /^Pesos sem EMA conhecido/),
  regra('PESOS_SEM_INCERTEZA', 'ESCRITORIO', 1, /^Pesos sem incerteza conhecida/),
  // Escritório: o reparo e o ajuste externo dos registros antigos, a conformidade, a próxima calibração, o recebimento
  regra('AJUSTE_EXTERNO', 'ESCRITORIO', 5, /^Descreva o ajuste externo/),
  regra('OS_DO_REPARO', 'ESCRITORIO', 2, /^Houve reparo: informe o número da ordem de serviço/),
  regra('TOLERANCIA_CLIENTE', 'ESCRITORIO', 8, /^Informe a tolerância do cliente/),
  regra('CONFORMIDADE', 'ESCRITORIO', 8, /^Conformidade: /),
  regra('PROXIMA_CALIBRACAO', 'ESCRITORIO', 8, /^Informe a data da próxima calibração/),
  regra('PROXIMA_CALIBRACAO', 'ESCRITORIO', 8, /^A próxima calibração precisa ser depois da data da calibração/),
  regra('DATA_RECEBIMENTO', 'ESCRITORIO', 8, /^O recebimento do item não pode ser depois/),
  regra('JUSTIFICATIVA_CAMPO', 'ESCRITORIO', 8, new RegExp(`^${PENDENCIA_JUSTIFICATIVA_CAMPO}`)),
]

/**
 * A classe de uma pendência de emissão pelo texto (`REGRAS_PENDENCIA`); null se nenhuma regra conhece o texto (o celular
 * a mostra como IMPEDE, com o texto do sistema, e o teste das pendências falha). `balancaInformada`: folhas só do cliente
 * e em branco.
 */
export function classeDaPendencia(texto: string, contexto: { balancaInformada?: boolean } = {}): ClasseDePendencia | null {
  if (PENDENCIAS_SO_DO_SERVIDOR.includes(texto) || pendenciaDoCertificadoDigital(texto))
    return { codigo: 'SO_DO_SERVIDOR', classe: 'ESCRITORIO', passo: 8, falta: false }
  const r = REGRAS_PENDENCIA.find((x) => x.padrao.test(texto))
  if (!r) return null
  return {
    codigo: r.codigo,
    classe: contexto.balancaInformada && r.naInformada ? r.naInformada : r.classe,
    passo: r.passo,
    falta: r.falta,
  }
}

/** Os textos do celular para as pendências que, no sistema, falam das telas do escritório. */
const TEXTO_NO_CELULAR: Record<string, string> = {
  FALTA_PESOS: 'Marque o jogo de pesos padrão usado (passo 1).',
  FALTA_TEMPERATURA: 'Registre a temperatura no início e no fim (passo 4).',
  FALTA_PRESSAO: 'Registre a pressão no início (passo 4), medida com o barômetro.',
  FALTA_BAROMETRO: 'Marque o barômetro usado (passo 1 ou o instrumento do passo 4).',
  FALTA_AR_MEDIDO: 'Registre a temperatura, a umidade e a pressão (passo 4): a classe I usa a densidade do ar medida.',
  FALTA_DELTA_T: 'Registre o ΔT pesos − ar antes do 1º ensaio, ou a aclimatação dos pesos (passo 4).',
  TERMOMETRO_DUAS_ENTRADAS: 'Marque o termômetro de duas entradas usado no ΔT (passo 1), ou registre o ΔT pela aclimatação.',
  PESOS_FORA_DOS_PADROES: 'Os pesos de um ponto são de um jogo que não está marcado como usado: marque o jogo no passo 1.',
  NAO_PESA_CORRETAMENTE: TEXTO_NAO_PESA,
}

/** As pendências de emissão que o escritório veria com o rascunho que este registro daria (as regras do sistema). */
export function pendenciasDoRegistro(
  registro: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  opcoes: { hoje?: string; preparo?: PreparoAvisos } = {},
): string[] {
  const preparo = opcoes.preparo ?? prepararAvisos(registro, pacote)
  const k = preparo.rascunho
  const balanca = balancaDoCampo(registro, pacote)
  const padroes = preparo.padroesUsados
  const pendencias = pendenciasEmissao(k, {
    padroes,
    hoje: opcoes.hoje ?? hojeLocalIso(),
    temPesos: padroes.some((p) => p.tipo === 'PESOS'),
    classe: balanca?.classe ?? pacote?.balanca?.classe,
    ...(balanca ? { balanca } : {}),
  })
  if (balanca) pendencias.push(...calcularCalibracao(k, balanca, padroes).resultado.pendencias)
  else if (registro.passos.balanca.informada)
    pendencias.push('Instrumento: informe pelo menos uma faixa com Max, e e d maiores que zero.')
  return [...new Set(pendencias)]
}

// ---- O passo e a folha ------------------------------------------------------------------------------------------------

/** Todas as leituras do registro (fora as tentativas descartadas), com o caminho de cada uma. */
export function leiturasDoRegistro(registro: RegistroCampo): Array<{ campo: string; leitura: LeituraCampo }> {
  const ps = registro.passos
  const lista: Array<{ campo: string; leitura: LeituraCampo | null }> = []
  ps.ambiente.linhas.forEach((l, i) => {
    for (const k of ['temperatura', 'umidade', 'pressao'] as const)
      lista.push({ campo: `ambiente.linhas.${i}.${k}`, leitura: l[k] })
  })
  ps.ambiente.deltaT.forEach((m, i) => lista.push({ campo: `ambiente.deltaT.${i}.valor`, leitura: m.valor }))
  if (ps.ambiente.deltaT0) {
    lista.push({ campo: 'ambiente.deltaT0.origem', leitura: ps.ambiente.deltaT0.origem })
    lista.push({ campo: 'ambiente.deltaT0.sala', leitura: ps.ambiente.deltaT0.sala })
  }
  for (const p of ps.indicacao.pontos)
    for (const k of ['cargaAplicada', 'crescente', 'decrescente'] as const)
      lista.push({ campo: `indicacao.pontos.${p.id}.${k}`, leitura: p[k] })
  lista.push({ campo: 'indicacao.retornoZero', leitura: ps.indicacao.retornoZero })
  ps.indicacao.substituicao?.etapas.forEach((e, i) => {
    lista.push({ campo: `indicacao.substituicao.etapas.${i}.padroes`, leitura: e.padroes })
    lista.push({ campo: `indicacao.substituicao.etapas.${i}.substituicao`, leitura: e.substituicao })
  })
  for (const r of ps.repetibilidade) {
    lista.push({ campo: `repetibilidade.${r.id}.cargaAplicada`, leitura: r.cargaAplicada })
    r.leituras.forEach((l, j) => lista.push({ campo: `repetibilidade.${r.id}.leituras.${j}`, leitura: l }))
  }
  lista.push({ campo: 'excentricidade.cargaAplicada', leitura: ps.excentricidade.cargaAplicada })
  ps.excentricidade.posicoes.forEach((p, i) => {
    lista.push({ campo: `excentricidade.posicoes.${i}.zeroAntes`, leitura: p.zeroAntes })
    lista.push({ campo: `excentricidade.posicoes.${i}.leitura`, leitura: p.leitura })
  })
  return lista.filter((x): x is { campo: string; leitura: LeituraCampo } => !!x.leitura)
}

/**
 * Os avisos da folha inteira (a Revisão): os de cada leitura, os dos padrões (vencido ou fora do intervalo no dia), a
 * repetibilidade com menos leituras que o mínimo e as pendências de emissão que dependem só do campo (as regras do
 * sistema sobre o rascunho que o registro daria). `hoje`: para a regra da data futura (padrão: o dia do aparelho).
 */
export function avisosDoRegistro(
  original: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  opcoes: { hoje?: string } = {},
): AvisoCampo[] {
  const registro = registroCorrigido(original)
  const preparo = prepararAvisos(registro, pacote)
  const avisos: AvisoCampo[] = []
  const deltaTValido = indiceDeltaTValido(registro)

  // Cada leitura (do ΔT, só a que vale: as de antes foram superadas pela medição depois da aclimatação)
  for (const { campo, leitura } of leiturasDoRegistro(registro)) {
    const dt = /^ambiente\.deltaT\.(\d+)/.exec(campo)
    if (dt && Number(dt[1]) !== deltaTValido) continue
    const ctx = contextoDaLeitura(registro, pacote, campo, preparo)
    if (ctx) avisos.push(...avisosDaLeitura(ctx, leitura))
  }

  // Os padrões usados, no dia da calibração
  const data = dataDoRegistro(registro)
  const regrasDoPop = !regrasDoPopComoAviso(preparo.rascunho)
  if (dataIsoValida(data))
    for (const p of preparo.padroesUsados) {
      const campo = registro.passos.padroes.some((x) => x.id === p.id) ? `padroes.${p.id}` : ''
      if (p.validade && p.validade < data)
        avisos.push({
          codigo: 'PADRAO_VENCIDO',
          classe: 'IMPEDE',
          passo: 1,
          campo,
          texto: `O padrão ${p.identificacao} estava vencido no dia da calibração (venceu em ${formatarDataBr(p.validade)}). Use outro padrão.`,
          falta: false,
        })
      else if (
        regrasDoPop &&
        dataIsoValida(p.dataCalibracao) &&
        p.dataCalibracao <= data &&
        data > somarMeses(p.dataCalibracao, MESES_MAX_CALIBRACAO_PADRAO)
      )
        avisos.push({
          codigo: 'PADRAO_FORA_DO_INTERVALO',
          classe: 'IMPEDE',
          passo: 1,
          campo,
          texto: `O padrão ${p.identificacao} foi calibrado em ${formatarDataBr(p.dataCalibracao)}, há mais de ${MESES_MAX_CALIBRACAO_PADRAO} meses (POP, Tabela 3). Use outro padrão.`,
          falta: false,
        })
    }

  // A repetibilidade com menos leituras que o mínimo do POP (10 na classe I; 5, ou 3 com carga ≥ 100 kg)
  const vista = preparo.instrumento.instrumento
  const classe =
    vista && !preparo.instrumento.desligados.includes('balanca.classe') ? vista.classe : (pacote?.balanca?.classe ?? '')
  if (!minimosDoPopComoAviso(preparo.rascunho))
    for (const r of preparo.rascunho.repetibilidade) {
      const lidas = r.leituras.filter((l) => l !== null).length
      const minimo = minimoLeiturasRepetibilidade(r.carga, { classe, unidade: preparo.unidade })
      if (!lidas || lidas >= minimo) continue
      const d = vista && vista.faixas.length && r.carga > 0 ? faixaDoValor(r.carga, vista).d : 0
      avisos.push({
        codigo: 'POUCAS_LEITURAS_REPETIBILIDADE',
        classe: 'IMPEDE',
        passo: 6,
        campo: `repetibilidade.${r.id}`,
        texto: `Repetibilidade a ${formatarNumero(r.carga, Math.max(casasDecimais(d), casasDecimais(r.carga)))} ${preparo.unidade}: ${plural(lidas, 'leitura', 'leituras')}; o mínimo é ${minimo} (POP, Tabela 4). Faça mais leituras.`,
        falta: false,
      })
    }

  // As pendências de emissão do sistema que dependem só do campo, menos as que os avisos acima já cobrem (o mesmo código
  // no mesmo passo); cada uma das outras vira um aviso, com o texto do sistema (ou o do celular, `TEXTO_NO_CELULAR`)
  const informada = !!registro.passos.balanca.informada
  const cobertos = new Set(avisos.filter((a) => a.classe === 'IMPEDE').map((a) => `${a.codigo}|${a.passo}`))
  for (const texto of pendenciasDoRegistro(registro, pacote, { hoje: opcoes.hoje, preparo })) {
    const c = classeDaPendencia(texto, { balancaInformada: informada })
    if (c?.classe === 'ESCRITORIO') continue
    const codigo = c?.codigo ?? 'PENDENCIA_DO_SISTEMA'
    const passo = c?.passo ?? 8
    if (c && cobertos.has(`${codigo}|${passo}`)) continue
    avisos.push({
      codigo,
      classe: 'IMPEDE',
      passo,
      campo: '',
      texto: TEXTO_NO_CELULAR[codigo] ?? texto,
      falta: c?.falta ?? false,
    })
  }
  return semRepetidos(avisos)
}

const semRepetidos = (avisos: AvisoCampo[]) => {
  const vistos = new Set<string>()
  return avisos.filter((a) => {
    const chave = `${a.codigo}|${a.campo}|${a.texto}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
}

/** Os avisos de um passo (os da folha inteira daquele passo: as mesmas regras, o mesmo resultado). */
export function avisosDoPasso(
  registro: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  passo: NumeroPasso,
  opcoes: { hoje?: string } = {},
): AvisoCampo[] {
  return avisosDoRegistro(registro, pacote, opcoes).filter((a) => a.passo === passo)
}

// ---- Conferidos ---------------------------------------------------------------------------------------------------------

/** O aviso já foi conferido ("Conferi, está certo" ou "Registrar motivo") com o mesmo código, campo e texto? */
export function avisoConferido(aviso: AvisoCampo, registro: Pick<RegistroCampo, 'avisosConferidos'>): AvisoConferidoCampo | null {
  return (
    registro.avisosConferidos.find((c) => c.codigo === aviso.codigo && c.campo === aviso.campo && c.texto === aviso.texto) ?? null
  )
}

/** Os avisos que ainda não foram conferidos (o valor mudou: o texto muda, e o aviso volta). */
export function avisosPendentes(avisos: readonly AvisoCampo[], registro: Pick<RegistroCampo, 'avisosConferidos'>): AvisoCampo[] {
  return avisos.filter((a) => !avisoConferido(a, registro))
}

/** O que vai para `registro.avisosConferidos`: "Conferi, está certo" (sem motivo) ou "Registrar motivo". */
export function conferirAviso(aviso: AvisoCampo, em: Instante, motivo = ''): AvisoConferidoCampo {
  return { codigo: aviso.codigo, classe: aviso.classe, campo: aviso.campo, texto: aviso.texto, em, motivo: motivo.trim() }
}

/**
 * A faixa que explica com que balança os avisos estão: "Avisos pelo valor visto em campo: d = 0,01 kg." e, para um dado
 * marcado "Algo diferente…" sem valor legível, "Sem o valor visto em campo de d: os avisos que dependem disso estão
 * desligados.". Vazia quando os avisos usam o cadastro como veio.
 */
export function faixaDosAvisos(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): string[] {
  const v = instrumentoDoCampo(registro, pacote)
  const linhas: string[] = []
  if (v.observados.length) linhas.push(`Avisos pelo valor visto em campo: ${v.observados.map((o) => o.texto).join(', ')}.`)
  const nomes: Partial<Record<CampoConferir, string>> = {
    'balanca.unidade': 'unidade',
    'balanca.max': 'Max',
    'balanca.d': 'd',
    'balanca.e': 'e',
    'balanca.min': 'Min',
    'balanca.classe': 'classe',
  }
  if (v.desligados.length) {
    const lista = v.desligados.map((c) => nomes[c] ?? c)
    const texto = lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}` : lista[0]
    linhas.push(
      v.informada
        ? `Falta ${texto} da balança: os avisos que dependem disso estão desligados.`
        : `Sem o valor visto em campo de ${texto}: os avisos que dependem disso estão desligados.`,
    )
  }
  return linhas
}

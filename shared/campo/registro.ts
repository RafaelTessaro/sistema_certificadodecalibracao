// O registro de campo: o registro vazio, pronto para preencher (`registroInicial`), a conferência da estrutura e dos
// limites (`validarRegistro`, a MESMA no celular, antes de Finalizar, e no servidor, ao receber) e as pequenas regras
// que os dois lados e as telas usam (leitura como texto, data e hora com o fuso, assinaturas). Puro.
//
// `validarRegistro` não decide se a calibração está completa ("Falta para assinar" é outra regra): confere o formato
// (cada campo com o tipo certo), os limites (tamanho total, listas, textos, PNG de até 300 KB), a ausência de números
// com casas decimais e, com o pacote, que o registro é dele (envio, nº, tipo e os ids dos pontos e dos ensaios). No
// servidor, problema de formato não recusa o registro: ele é gravado com a marca FORMATO e a lista dos problemas.

import { converterMassa, dataIsoValida } from '../dominio.ts'
import { numeroDaFolha } from '../folhaCampo.ts'
import { casasDecimais, faixaDoValor, formatarNumero, posicoesExcentricidade } from '../metrologia/index.ts'
import type { Unidade } from '../tipos.ts'
import { bytesUtf8, calcularConteudoSha256, jsonCanonico, REGEX_SHA256 } from './canonico.ts'
import { comSubstituicao } from './pacote.ts'
import {
  aparelhoIdValido,
  CONTRATO_CAMPO,
  envioIdValido,
  FORMATO_REGISTRO,
  LIMITE_PNG_BYTES,
  LIMITE_REGISTRO_BYTES,
  versaoAppValida,
} from './protocolo.ts'
import type {
  AparelhoCampo,
  AssinaturaDoClienteCampo,
  ExcentricidadeCampo,
  Instante,
  LeituraCampo,
  PacoteCampo,
  PessoaCampo,
  ProblemaRegistro,
  RegistroCampo,
  ViaLeitura,
} from './tipos.ts'
import {
  CAMPOS_CONFERIR,
  CLASSES_AVISO,
  CLASSES_INFORMADAS,
  DESFECHOS,
  MOMENTOS_AMBIENTE,
  RECEPTORES_INFORMADOS,
  TIPOS_ANOTACAO,
  TIPOS_FAIXAS_INFORMADOS,
  TIPOS_FOLHA_CAMPO,
  VIAS_LEITURA,
} from './tipos.ts'

// ---- Data e hora ---------------------------------------------------------------------------------------------------

/** ISO 8601 com segundos e o fuso ("2026-11-18T08:42:10-03:00"; aceita milissegundos e "Z"). */
export const REGEX_INSTANTE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/

/**
 * A data e a hora de agora no relógio do celular, em ISO com o fuso: "2026-11-18T08:42:10-03:00". `fusoMin`: minutos a
 * somar ao UTC (−180 em Brasília); padrão, o fuso do aparelho. Use sempre esta função (nunca `toISOString`, que dá o UTC:
 * depois das 21:00 em Brasília já seria o dia seguinte).
 */
export function instanteLocal(d: Date = new Date(), fusoMin: number = -d.getTimezoneOffset()): Instante {
  const local = new Date(d.getTime() + fusoMin * 60_000)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const abs = Math.abs(fusoMin)
  return (
    `${local.getUTCFullYear()}-${p2(local.getUTCMonth() + 1)}-${p2(local.getUTCDate())}` +
    `T${p2(local.getUTCHours())}:${p2(local.getUTCMinutes())}:${p2(local.getUTCSeconds())}` +
    `${fusoMin < 0 ? '-' : '+'}${p2(Math.floor(abs / 60))}:${p2(abs % 60)}`
  )
}

/** É uma data e hora completa, com o fuso, que existe no calendário? ('' não é.) */
export function instanteValido(v: unknown): v is Instante {
  if (typeof v !== 'string') return false
  const m = REGEX_INSTANTE.exec(v)
  if (!m) return false
  if (!dataIsoValida(`${m[1]}-${m[2]}-${m[3]}`)) return false
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) return false
  return Number.isFinite(Date.parse(v))
}

/** A data (AAAA-MM-DD) e a hora (HH:mm) como estão escritas no instante (o relógio do celular, sem converter o fuso). */
export function partesDoInstante(v: unknown): { data: string; hora: string } | null {
  if (!instanteValido(v)) return null
  const m = REGEX_INSTANTE.exec(v)!
  return { data: `${m[1]}-${m[2]}-${m[3]}`, hora: `${m[4]}:${m[5]}` }
}

/** "18/11/2026 08:42" (o relógio do celular); '' se o instante for vazio ou inválido. */
export function formatarInstante(v: unknown): string {
  const p = partesDoInstante(v)
  return p ? `${p.data.split('-').reverse().join('/')} ${p.hora}` : ''
}

/** "18/11/2026, das 08:42 às 15:58" (no mesmo dia) ou "18/11/2026 08:42 a 19/11/2026 10:15"; '' sem o início. */
export function textoDoPeriodo(inicio: unknown, fim: unknown): string {
  const a = partesDoInstante(inicio)
  if (!a) return ''
  const b = partesDoInstante(fim)
  const dia = (p: { data: string }) => p.data.split('-').reverse().join('/')
  if (!b) return `${dia(a)}, a partir das ${a.hora}`
  return a.data === b.data ? `${dia(a)}, das ${a.hora} às ${b.hora}` : `${dia(a)} ${a.hora} a ${dia(b)} ${b.hora}`
}

// ---- Leituras (texto como digitado) --------------------------------------------------------------------------------

/** O texto do teclado do app: "-" opcional, algarismos e, opcionalmente, vírgula e casas ("100,05", "-0,02", "150,0"). */
export const REGEX_LEITURA = /^-?\d{1,12}(?:,\d{1,9})?$/
export const leituraTextoValida = (v: unknown): v is string => typeof v === 'string' && REGEX_LEITURA.test(v)

/** Uma leitura nova, com a hora do celular. */
export function novaLeitura(valor: string, via: ViaLeitura = 'teclado', em: Instante = instanteLocal()): LeituraCampo {
  return { valor, em, via }
}

/** O número de uma leitura ("100,05" → 100.05); null se vazia ou fora do formato do teclado. */
export function numeroDaLeitura(l: LeituraCampo | string | null | undefined): number | null {
  const v = typeof l === 'string' ? l : l?.valor
  if (!leituraTextoValida(v)) return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Casas decimais digitadas ("150,0" → 1; "150" → 0): o aviso de "menos casas que a divisão" compara com as de d. */
export function casasDaLeitura(l: LeituraCampo | string | null | undefined): number {
  const v = typeof l === 'string' ? l : (l?.valor ?? '')
  const i = v.indexOf(',')
  return i < 0 ? 0 : v.length - i - 1
}

/**
 * Um número escrito para pessoas, com vírgula decimal e espaços de milhar ("80 000,0", "−0,5", "0,05"), também com
 * ponto decimal sem vírgula ("0.05"); null se não for um número.
 */
export function numeroDoTexto(texto: unknown): number | null {
  if (typeof texto !== 'string') return null
  let s = texto.replace(/[\s  ]/g, '').replace(/[−–]/g, '-')
  if (!s) return null
  if (s.includes(',')) {
    if (s.includes('.')) return null
    s = s.replace(',', '.')
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * A carga como a folha a mostra, nas casas da divisão daquela carga (`d`) ou nas da própria carga, se tiver mais
 * ("100,00" com d = 0,05; "80 000" com d = 20, o milhar com o espaço que não quebra, U+00A0, como em todo o sistema):
 * `PontoCampo.cargaPrevista` e as cargas previstas dos ensaios. `numeroDoTexto` lê de volta.
 */
export function textoDaCarga(carga: number, d = 0): string {
  return formatarNumero(carga, Math.max(casasDecimais(d), casasDecimais(carga)))
}

/**
 * O valor visto em campo num dado metrológico, como o técnico digitou ("50 g", "0,05", "0,05 kg"), na unidade da balança;
 * null se não der para ler. Sem unidade, o número já está na unidade da balança.
 */
export function valorObservado(texto: unknown, unidade: Unidade): number | null {
  if (typeof texto !== 'string') return null
  const m = /^\s*([-−]?[\d\s.,]+?)\s*(mg|g|kg|t)?\s*$/i.exec(texto)
  if (!m) return null
  const n = numeroDoTexto(m[1])
  if (n === null) return null
  const u = (m[2]?.toLowerCase() ?? unidade) as Unidade
  return converterMassa(n, u, unidade)
}

// ---- Assinaturas ---------------------------------------------------------------------------------------------------

export type TipoAssinaturaCliente = 'ASSINOU' | 'NAO_ASSINOU' | 'DISPENSADA' | 'SO_NO_PAPEL' | 'PENDENTE'

/** Qual das alternativas da assinatura do cliente (PENDENTE = ainda nenhuma). */
export function tipoAssinaturaCliente(a: AssinaturaDoClienteCampo | null | undefined): TipoAssinaturaCliente {
  if (!a || typeof a !== 'object') return 'PENDENTE'
  if ('naoAssinou' in a && a.naoAssinou === true) return 'NAO_ASSINOU'
  if ('dispensada' in a && a.dispensada === 'LABORATORIO') return 'DISPENSADA'
  if ('soNoPapel' in a && a.soNoPapel === true) return 'SO_NO_PAPEL'
  if ('png' in a) return 'ASSINOU'
  return 'PENDENTE'
}

const PREFIXO_PNG = 'data:image/png;base64,'
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Decodifica o começo de um base64 (até `bytes` bytes), sem depender de atob/Buffer. */
function inicioDoBase64(b64: string, bytes: number): number[] {
  const saida: number[] = []
  let acumulado = 0
  let bits = 0
  for (const ch of b64) {
    if (ch === '=') break
    const v = B64.indexOf(ch)
    if (v < 0) return []
    acumulado = (acumulado << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      saida.push((acumulado >> bits) & 0xff)
      if (saida.length >= bytes) break
    }
  }
  return saida
}

/** Bytes da imagem de um data URL em base64 (sem decodificar). */
export function bytesDoDataUrl(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const sobra = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - sobra
}

/** Largura e altura de um PNG em data URL (pelo cabeçalho IHDR); null se não for um PNG. */
export function dimensoesDoPng(dataUrl: unknown): { largura: number; altura: number } | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIXO_PNG)) return null
  const b = inicioDoBase64(dataUrl.slice(PREFIXO_PNG.length, PREFIXO_PNG.length + 48), 24)
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length < 24 || assinatura.some((x, i) => b[i] !== x)) return null
  if (String.fromCharCode(b[12], b[13], b[14], b[15]) !== 'IHDR') return null
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
  return { largura: u32(16), altura: u32(20) }
}

/**
 * Confere a imagem de uma assinatura: PNG em data URL (base64), com o cabeçalho de PNG, de 50 × 20 px a 4 000 × 4 000 px
 * e até `LIMITE_PNG_BYTES`. null = certo; senão, a frase do problema.
 */
export function validarPng(dataUrl: unknown): string | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIXO_PNG)) return 'A assinatura precisa ser uma imagem PNG.'
  const b64 = dataUrl.slice(PREFIXO_PNG.length)
  if (!b64 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return 'A imagem da assinatura está corrompida.'
  if (bytesDoDataUrl(dataUrl) > LIMITE_PNG_BYTES)
    return `A imagem da assinatura passa de ${Math.round(LIMITE_PNG_BYTES / 1024)} KB.`
  const dim = dimensoesDoPng(dataUrl)
  if (!dim) return 'A imagem da assinatura não é um PNG válido.'
  if (dim.largura < 50 || dim.altura < 20 || dim.largura > 4000 || dim.altura > 4000)
    return 'A imagem da assinatura tem um tamanho fora do esperado.'
  return null
}

// ---- Registro vazio ------------------------------------------------------------------------------------------------

/** As posições da excentricidade sem o desenho da balança: as 1 a 5 dos desenhos de referência (como no papel). */
const POSICOES_EM_BRANCO = ['1', '2', '3', '4', '5']

/**
 * O registro vazio de uma folha, pronto para preencher, ao tocar em "Começar a folha": os passos com os itens do pacote
 * (padrões da lista, dados impressos para conferir, pontos com os ids e as cargas da folha, ensaios de repetibilidade,
 * posições da excentricidade, etapas de substituição), sem nenhuma leitura. Nada é preenchido sem um toque do técnico.
 * `pacoteSha256`: o que o celular calculou ao receber (`calcularSha256Pacote`). `agora`: a hora de começar.
 */
export function registroInicial(
  pacote: PacoteCampo,
  tecnico: PessoaCampo,
  aparelho: AparelhoCampo,
  opcoes: { pacoteSha256?: string; agora?: Instante } = {},
): RegistroCampo {
  const { folha, plano, entrada, balanca } = pacote
  const agora = opcoes.agora ?? instanteLocal()
  const dNaCarga = (carga: number) => (balanca && balanca.faixas.length ? faixaDoValor(carga, balanca).d : 0)
  const cargaTexto = (carga: number, d = dNaCarga(carga)) =>
    carga > 0 ? textoDaCarga(carga, d) : carga === 0 ? textoDaCarga(0, d) : ''
  const vazioDeTexto = { razaoSocial: '', documento: '', endereco: '', enderecoIgualAoLocal: false, contato: '', email: '' }
  const balancaInformada = {
    tipo: '',
    fabricante: '',
    modelo: '',
    numeroSerie: '',
    identificacao: '',
    localInstalacao: '',
    anoFabricacao: '',
    apoios: '',
    plataforma: '',
    portariaAprovacao: '',
    classe: '' as const,
    tipoFaixas: '' as const,
    receptor: '' as const,
    unidade: '' as const,
    faixas: [{ max: '', e: '', d: '' }],
    min: '',
  }
  const s = plano?.substituicao
  const substituicao =
    s && (s.ativa || s.sugerida) && s.etapas > 0
      ? { etapas: Array.from({ length: s.etapas }, () => ({ padroes: null, substituicao: null, material: '' })) }
      : comSubstituicao(pacote)
        ? { etapas: [] }
        : null
  const e = plano?.excentricidade
  // Prevista como não aplicável, o técnico pode ver no local que dá para fazer ("Fazer o ensaio"): as posições do desenho
  // da balança ficam prontas (sem desenho, como no gancho, as 1 a 5), e a carga ele escreve no local
  const desenho = e && !e.aplicavel && balanca ? posicoesExcentricidade(balanca.receptor, balanca.apoios) : undefined
  const excentricidade: ExcentricidadeCampo = e
    ? {
        aplicavel: e.aplicavel ? true : null,
        motivo: e.aplicavel ? '' : e.motivo,
        cargaPrevista: e.aplicavel && e.carga > 0 ? cargaTexto(e.carga) : '',
        cargaAplicada: null,
        posicoes: (e.aplicavel ? e.posicoes : desenho?.length ? desenho : POSICOES_EM_BRANCO).map((rotulo) => ({
          rotulo,
          zeroAntes: null,
          leitura: null,
        })),
      }
    : {
        // Folha sem balança cadastrada: as posições 1 a 5 dos desenhos de referência (como no papel)
        aplicavel: true,
        motivo: '',
        cargaPrevista: '',
        cargaAplicada: null,
        posicoes: POSICOES_EM_BRANCO.map((rotulo) => ({ rotulo, zeroAntes: null, leitura: null })),
      }
  const linha = (momento: 'INICIO' | 'FIM') => ({
    momento,
    em: '',
    temperatura: null,
    umidade: null,
    pressao: null,
    instrumentos: [],
  })
  return {
    formato: FORMATO_REGISTRO,
    contrato: CONTRATO_CAMPO,
    envioId: pacote.envioId,
    numero: folha.numero,
    pacoteSha256: opcoes.pacoteSha256 ?? '',
    formulario: { codigo: folha.formulario.codigo, revisao: folha.formulario.revisao },
    piloto: folha.piloto,
    tipo: folha.tipo,
    aparelho: { ...aparelho },
    tecnico: { ...tecnico },
    relogio: { iniciadoEm: agora, finalizadoEm: '' },
    passos: {
      padroes: pacote.padroes.previstos
        .filter((p) => p.naFolha)
        .map((p) => ({ id: p.id, identificacao: p.identificacao, levado: false, usado: false, outro: false })),
      chegada: {
        conferencias: pacote.conferir.chegada.map((x) => ({
          campo: x.campo,
          rotulo: x.rotulo,
          mostrado: x.mostrado,
          confere: null,
        })),
        ...(folha.tipo === 'branco' ? { clienteInformado: { ...vazioDeTexto } } : {}),
        os: '',
        local: '',
        localEndereco: '',
        inicio: '',
      },
      balanca: {
        conferencias: pacote.conferir.balanca.map((x) => ({
          campo: x.campo,
          rotulo: x.rotulo,
          mostrado: x.mostrado,
          confere: null,
        })),
        ...(folha.tipo === 'cliente' || folha.tipo === 'branco' ? { informada: balancaInformada } : {}),
      },
      ambiente: { linhas: [linha('INICIO'), linha('FIM')], deltaT: [], pesosNoLocalDesde: '', deltaT0: null },
      indicacao: {
        calInterno: balanca?.classe === 'I' ? { feito: false, em: '' } : null,
        pontos: plano
          ? entrada.indicacao.pontos.map((p, i) => ({
              id: p.id,
              acrescentado: false,
              cargaPrevista: cargaTexto(p.carga, plano.pontos[i]?.d ?? dNaCarga(p.carga)),
              cargaAplicada: null,
              pecas: p.pecas.map((x) => ({ ...x })),
              pecasTrocadas: false,
              nivelSubstituicao: p.nivelSubstituicao,
              crescente: null,
              decrescente: null,
            }))
          : [],
        retornoZero: null,
        substituicao,
      },
      repetibilidade: plano
        ? entrada.repetibilidade.map((r) => ({
            id: r.id,
            cargaPrevista: r.carga > 0 ? cargaTexto(r.carga) : '',
            cargaAplicada: null,
            leituras: [],
          }))
        : [],
      excentricidade,
      final: { dataCalibracao: '', termino: '' },
    },
    tentativas: [],
    desfecho: 'COMPLETA',
    motivoDesfecho: '',
    anotacoes: [],
    avisosConferidos: [],
    trilha: [],
    reaberturas: [],
    assinaturas: { tecnico: null, cliente: null },
    correcoesPosAssinatura: [],
  }
}

// ---- Conferência do registro ---------------------------------------------------------------------------------------

/** Limites de cada lista e de cada texto (contra dado corrompido; muito acima do uso real). */
export const LIMITES_REGISTRO = {
  pontos: 100,
  leituras: 60,
  ensaiosRepetibilidade: 12,
  posicoes: 40,
  etapas: 40,
  linhasAmbiente: 20,
  deltaT: 50,
  padroes: 100,
  conferencias: 40,
  pecas: 200,
  tentativas: 10,
  anotacoes: 300,
  avisos: 1000,
  trilha: 3000,
  reaberturas: 50,
  correcoes: 300,
  /** id, campo, código. */
  id: 120,
  /** nomes, função, rótulos, modelo. */
  nome: 120,
  /** textos digitados (motivos, anotações, endereço). */
  texto: 2000,
  /** valores mostrados e "de/para" das correções. */
  mostrado: 500,
} as const

type Prob = (campo: string, mensagem: string) => void
type Obj = Record<string, unknown>

const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Conferências de tipo, que anotam o problema e devolvem o valor (ou um vazio) para seguir conferindo. */
function conferidor(p: Prob) {
  const objeto = (v: unknown, campo: string): Obj | null => {
    if (ehObj(v)) return v
    p(campo, 'Falta este bloco (esperava um objeto).')
    return null
  }
  const texto = (v: unknown, campo: string, max: number, obrigatorio = false): string => {
    if (typeof v !== 'string') {
      p(campo, 'Esperava um texto.')
      return ''
    }
    if (v.length > max) p(campo, `Texto longo demais (máximo ${max} letras).`)
    if (obrigatorio && !v.trim()) p(campo, 'Não pode ficar em branco.')
    return v
  }
  const bool = (v: unknown, campo: string): boolean => {
    if (typeof v !== 'boolean') p(campo, 'Esperava sim ou não (true/false).')
    return v === true
  }
  const inteiro = (v: unknown, campo: string, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) {
      p(campo, `Esperava um número inteiro de ${min} a ${max}.`)
      return min
    }
    return v
  }
  const umDe = <T extends string | number>(v: unknown, lista: readonly T[], campo: string): T | null => {
    if (lista.includes(v as T)) return v as T
    p(campo, `Valor fora da lista: ${JSON.stringify(v)?.slice(0, 40) ?? 'nada'}.`)
    return null
  }
  const instante = (v: unknown, campo: string, vazio: boolean): string => {
    if (vazio && v === '') return ''
    if (!instanteValido(v))
      p(campo, vazio ? 'Data e hora inválida (ISO com o fuso, ou vazia).' : 'Falta a data e hora (ISO com o fuso).')
    return typeof v === 'string' ? v : ''
  }
  const lista = (v: unknown, campo: string, max: number): unknown[] => {
    if (!Array.isArray(v)) {
      p(campo, 'Esperava uma lista.')
      return []
    }
    if (v.length > max) p(campo, `Lista longa demais (máximo ${max} itens).`)
    return v.slice(0, max)
  }
  const leitura = (v: unknown, campo: string, nula = true): void => {
    if (v === null && nula) return
    const l = objeto(v, campo)
    if (!l) return
    if (!leituraTextoValida(l.valor))
      p(`${campo}.valor`, 'Leitura fora do formato do teclado (algarismos, vírgula e o sinal na frente).')
    instante(l.em, `${campo}.em`, false)
    umDe(l.via, VIAS_LEITURA, `${campo}.via`)
  }
  const sha = (v: unknown, campo: string, vazio: boolean): void => {
    if (vazio && v === '') return
    if (typeof v !== 'string' || !REGEX_SHA256.test(v)) p(campo, 'Resumo sha256 inválido.')
  }
  const pecas = (v: unknown, campo: string): void => {
    lista(v, campo, LIMITES_REGISTRO.pecas).forEach((x, i) => {
      const o = objeto(x, `${campo}.${i}`)
      if (!o) return
      texto(o.padraoId, `${campo}.${i}.padraoId`, LIMITES_REGISTRO.id, true)
      texto(o.pesoId, `${campo}.${i}.pesoId`, LIMITES_REGISTRO.id, true)
      inteiro(o.quantidade, `${campo}.${i}.quantidade`, 1, 10_000)
    })
  }
  return { erro: p, objeto, texto, bool, inteiro, umDe, instante, lista, leitura, sha, pecas }
}

type Conferidor = ReturnType<typeof conferidor>

function conferirAmbiente(c: Conferidor, v: unknown, campo: string): void {
  const a = c.objeto(v, campo)
  if (!a) return
  c.lista(a.linhas, `${campo}.linhas`, LIMITES_REGISTRO.linhasAmbiente).forEach((x, i) => {
    const l = c.objeto(x, `${campo}.linhas.${i}`)
    if (!l) return
    const k = `${campo}.linhas.${i}`
    c.umDe(l.momento, MOMENTOS_AMBIENTE, `${k}.momento`)
    c.instante(l.em, `${k}.em`, true)
    c.leitura(l.temperatura, `${k}.temperatura`)
    c.leitura(l.umidade, `${k}.umidade`)
    c.leitura(l.pressao, `${k}.pressao`)
    c.lista(l.instrumentos, `${k}.instrumentos`, 10).forEach((id, j) =>
      c.texto(id, `${k}.instrumentos.${j}`, LIMITES_REGISTRO.id, true),
    )
  })
  c.lista(a.deltaT, `${campo}.deltaT`, LIMITES_REGISTRO.deltaT).forEach((x, i) => {
    const m = c.objeto(x, `${campo}.deltaT.${i}`)
    if (!m) return
    c.leitura(m.valor, `${campo}.deltaT.${i}.valor`, false)
    c.texto(m.instrumento, `${campo}.deltaT.${i}.instrumento`, LIMITES_REGISTRO.id)
  })
  c.instante(a.pesosNoLocalDesde, `${campo}.pesosNoLocalDesde`, true)
  if (a.deltaT0 !== null) {
    const d = c.objeto(a.deltaT0, `${campo}.deltaT0`)
    if (d) {
      c.leitura(d.origem, `${campo}.deltaT0.origem`)
      c.leitura(d.sala, `${campo}.deltaT0.sala`)
      c.instante(d.em, `${campo}.deltaT0.em`, true)
    }
  }
}

function conferirIndicacao(c: Conferidor, v: unknown, campo: string): void {
  const ind = c.objeto(v, campo)
  if (!ind) return
  if (ind.calInterno !== null) {
    const cal = c.objeto(ind.calInterno, `${campo}.calInterno`)
    if (cal) {
      c.bool(cal.feito, `${campo}.calInterno.feito`)
      c.instante(cal.em, `${campo}.calInterno.em`, true)
    }
  }
  const ids = new Set<string>()
  c.lista(ind.pontos, `${campo}.pontos`, LIMITES_REGISTRO.pontos).forEach((x, i) => {
    const k = `${campo}.pontos.${i}`
    const pt = c.objeto(x, k)
    if (!pt) return
    const id = c.texto(pt.id, `${k}.id`, LIMITES_REGISTRO.id, true)
    if (id && ids.has(id)) c.erro(`${k}.id`, 'Id de ponto repetido.')
    ids.add(id)
    const acrescentado = c.bool(pt.acrescentado, `${k}.acrescentado`)
    c.texto(pt.cargaPrevista, `${k}.cargaPrevista`, LIMITES_REGISTRO.mostrado)
    c.leitura(pt.cargaAplicada, `${k}.cargaAplicada`)
    if (acrescentado && pt.cargaAplicada === null) c.erro(`${k}.cargaAplicada`, 'Ponto acrescentado sem a carga digitada.')
    c.pecas(pt.pecas, `${k}.pecas`)
    c.bool(pt.pecasTrocadas, `${k}.pecasTrocadas`)
    c.inteiro(pt.nivelSubstituicao, `${k}.nivelSubstituicao`, 0, 100)
    c.leitura(pt.crescente, `${k}.crescente`)
    c.leitura(pt.decrescente, `${k}.decrescente`)
  })
  c.leitura(ind.retornoZero, `${campo}.retornoZero`)
  if (ind.substituicao !== null) {
    const s = c.objeto(ind.substituicao, `${campo}.substituicao`)
    if (s)
      c.lista(s.etapas, `${campo}.substituicao.etapas`, LIMITES_REGISTRO.etapas).forEach((x, i) => {
        const k = `${campo}.substituicao.etapas.${i}`
        const et = c.objeto(x, k)
        if (!et) return
        c.leitura(et.padroes, `${k}.padroes`)
        c.leitura(et.substituicao, `${k}.substituicao`)
        c.texto(et.material, `${k}.material`, LIMITES_REGISTRO.nome * 2)
      })
  }
}

function conferirRepetibilidade(c: Conferidor, v: unknown, campo: string): void {
  const ids = new Set<string>()
  c.lista(v, campo, LIMITES_REGISTRO.ensaiosRepetibilidade).forEach((x, i) => {
    const k = `${campo}.${i}`
    const r = c.objeto(x, k)
    if (!r) return
    const id = c.texto(r.id, `${k}.id`, LIMITES_REGISTRO.id, true)
    if (id && ids.has(id)) c.erro(`${k}.id`, 'Id de ensaio repetido.')
    ids.add(id)
    c.texto(r.cargaPrevista, `${k}.cargaPrevista`, LIMITES_REGISTRO.mostrado)
    c.leitura(r.cargaAplicada, `${k}.cargaAplicada`)
    c.lista(r.leituras, `${k}.leituras`, LIMITES_REGISTRO.leituras).forEach((l, j) => c.leitura(l, `${k}.leituras.${j}`, false))
  })
}

function conferirExcentricidade(c: Conferidor, v: unknown, campo: string): void {
  const e = c.objeto(v, campo)
  if (!e) return
  if (e.aplicavel !== null) c.bool(e.aplicavel, `${campo}.aplicavel`)
  c.texto(e.motivo, `${campo}.motivo`, LIMITES_REGISTRO.texto)
  c.texto(e.cargaPrevista, `${campo}.cargaPrevista`, LIMITES_REGISTRO.mostrado)
  c.leitura(e.cargaAplicada, `${campo}.cargaAplicada`)
  c.lista(e.posicoes, `${campo}.posicoes`, LIMITES_REGISTRO.posicoes).forEach((x, i) => {
    const k = `${campo}.posicoes.${i}`
    const pos = c.objeto(x, k)
    if (!pos) return
    c.texto(pos.rotulo, `${k}.rotulo`, LIMITES_REGISTRO.nome, true)
    c.leitura(pos.zeroAntes, `${k}.zeroAntes`)
    c.leitura(pos.leitura, `${k}.leitura`)
  })
}

/** Números com casas decimais (ou não seguros) em qualquer lugar do registro: só inteiros são aceitos. */
function numerosNaoInteiros(v: unknown, caminho: string, saida: string[], profundidade = 0): void {
  if (saida.length >= 5 || profundidade > 40) return
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) saida.push(caminho)
    return
  }
  if (Array.isArray(v))
    v.forEach((x, i) => numerosNaoInteiros(x, caminho ? `${caminho}.${i}` : String(i), saida, profundidade + 1))
  else if (ehObj(v))
    for (const [k, x] of Object.entries(v)) numerosNaoInteiros(x, caminho ? `${caminho}.${k}` : k, saida, profundidade + 1)
}

export interface OpcoesValidarRegistro {
  /** O pacote do envio: confere que o registro é dele (envio, nº, tipo, ids dos pontos e dos ensaios). */
  pacote?: PacoteCampo | null
  /**
   * FINALIZAR (no celular, antes de "Finalizar e colher assinaturas": as assinaturas ainda não existem) ou ENTREGA (no
   * servidor, ao receber: a folha tem de estar finalizada, com a assinatura do técnico e a do cliente ou a alternativa).
   * Padrão: ENTREGA.
   */
  momento?: 'FINALIZAR' | 'ENTREGA'
}

/**
 * Confere a estrutura e os limites de um registro (qualquer valor: o servidor passa o corpo como chegou). Lista vazia =
 * nenhum problema. Nunca lança exceção.
 */
export function validarRegistro(registro: unknown, opcoes: OpcoesValidarRegistro = {}): ProblemaRegistro[] {
  const problemas: ProblemaRegistro[] = []
  const p: Prob = (campo, mensagem) => {
    if (problemas.length < 200) problemas.push({ campo, mensagem })
  }
  try {
    conferirRegistro(registro, opcoes, p)
  } catch {
    p('', 'O registro tem um formato que o sistema não conseguiu conferir.')
  }
  return problemas
}

function conferirRegistro(registro: unknown, opcoes: OpcoesValidarRegistro, p: Prob): void {
  if (!ehObj(registro)) {
    p('', 'O registro não é um objeto JSON.')
    return
  }
  const r = registro
  const entrega = (opcoes.momento ?? 'ENTREGA') === 'ENTREGA'
  const c = conferidor(p)

  // Tamanho e números
  try {
    const bytes = bytesUtf8(jsonCanonico(r))
    if (bytes > LIMITE_REGISTRO_BYTES)
      p('', `O registro tem ${Math.ceil(bytes / 1024)} KB; o máximo é ${Math.round(LIMITE_REGISTRO_BYTES / 1024)} KB.`)
  } catch {
    p('', 'O registro tem um número inválido (NaN ou infinito).')
  }
  const fracionados: string[] = []
  numerosNaoInteiros(r, '', fracionados)
  for (const caminho of fracionados) p(caminho, 'Número com casas decimais: as cargas e as leituras vão como texto.')

  // Identificação
  if (r.formato !== FORMATO_REGISTRO) p('formato', `Formato do registro desconhecido (esperava ${FORMATO_REGISTRO}).`)
  c.inteiro(r.contrato, 'contrato', 1, 1000)
  if (!envioIdValido(r.envioId)) p('envioId', 'Identificação do envio inválida.')
  if (typeof r.numero !== 'string' || numeroDaFolha(r.numero) !== r.numero) p('numero', 'Nº da folha inválido (FC-AAAA-NNNNN).')
  c.sha(r.pacoteSha256, 'pacoteSha256', true)
  const formulario = c.objeto(r.formulario, 'formulario')
  if (formulario) {
    c.texto(formulario.codigo, 'formulario.codigo', 40, true)
    c.texto(formulario.revisao, 'formulario.revisao', 20, true)
  }
  const piloto = c.bool(r.piloto, 'piloto')
  const tipo = c.umDe(r.tipo, TIPOS_FOLHA_CAMPO, 'tipo')
  const aparelho = c.objeto(r.aparelho, 'aparelho')
  if (aparelho) {
    if (!aparelhoIdValido(aparelho.id)) p('aparelho.id', 'Identificação do aparelho inválida.')
    c.texto(aparelho.modelo, 'aparelho.modelo', 80)
    if (!versaoAppValida(aparelho.versaoApp)) p('aparelho.versaoApp', 'Versão do app inválida.')
  }
  const tecnico = c.objeto(r.tecnico, 'tecnico')
  if (tecnico) {
    c.texto(tecnico.id, 'tecnico.id', LIMITES_REGISTRO.id, true)
    c.texto(tecnico.nome, 'tecnico.nome', LIMITES_REGISTRO.nome, true)
  }
  const relogio = c.objeto(r.relogio, 'relogio')
  if (relogio) {
    c.instante(relogio.iniciadoEm, 'relogio.iniciadoEm', false)
    c.instante(relogio.finalizadoEm, 'relogio.finalizadoEm', !entrega)
  }

  // Passos
  const passos = c.objeto(r.passos, 'passos')
  let local: unknown = ''
  if (passos) {
    c.lista(passos.padroes, 'passos.padroes', LIMITES_REGISTRO.padroes).forEach((x, i) => {
      const k = `passos.padroes.${i}`
      const pd = c.objeto(x, k)
      if (!pd) return
      c.texto(pd.id, `${k}.id`, LIMITES_REGISTRO.id, true)
      c.texto(pd.identificacao, `${k}.identificacao`, LIMITES_REGISTRO.nome)
      c.bool(pd.levado, `${k}.levado`)
      c.bool(pd.usado, `${k}.usado`)
      c.bool(pd.outro, `${k}.outro`)
    })
    const conferencias = (v: unknown, k: string) =>
      c.lista(v, k, LIMITES_REGISTRO.conferencias).forEach((x, i) => {
        const cf = c.objeto(x, `${k}.${i}`)
        if (!cf) return
        c.umDe(cf.campo, Object.values(CAMPOS_CONFERIR), `${k}.${i}.campo`)
        c.texto(cf.rotulo, `${k}.${i}.rotulo`, LIMITES_REGISTRO.nome)
        c.texto(cf.mostrado, `${k}.${i}.mostrado`, LIMITES_REGISTRO.mostrado)
        if (cf.confere !== null) c.bool(cf.confere, `${k}.${i}.confere`)
        if (cf.observado !== undefined) c.texto(cf.observado, `${k}.${i}.observado`, LIMITES_REGISTRO.mostrado)
      })
    const chegada = c.objeto(passos.chegada, 'passos.chegada')
    if (chegada) {
      conferencias(chegada.conferencias, 'passos.chegada.conferencias')
      if (chegada.clienteInformado !== undefined) {
        const ci = c.objeto(chegada.clienteInformado, 'passos.chegada.clienteInformado')
        if (ci) {
          for (const k of ['razaoSocial', 'documento', 'endereco', 'contato', 'email'] as const)
            c.texto(ci[k], `passos.chegada.clienteInformado.${k}`, LIMITES_REGISTRO.mostrado)
          c.bool(ci.enderecoIgualAoLocal, 'passos.chegada.clienteInformado.enderecoIgualAoLocal')
        }
      } else if (tipo === 'branco') p('passos.chegada.clienteInformado', 'Na folha em branco, falta o cliente informado.')
      c.texto(chegada.os, 'passos.chegada.os', 40)
      local = chegada.local
      c.umDe(chegada.local, ['', 'CLIENTE', 'LABORATORIO'], 'passos.chegada.local')
      c.texto(chegada.localEndereco, 'passos.chegada.localEndereco', LIMITES_REGISTRO.mostrado)
      c.instante(chegada.inicio, 'passos.chegada.inicio', true)
    }
    const balanca = c.objeto(passos.balanca, 'passos.balanca')
    if (balanca) {
      conferencias(balanca.conferencias, 'passos.balanca.conferencias')
      const informadaEsperada = tipo === 'cliente' || tipo === 'branco'
      if (balanca.informada !== undefined) {
        if (!informadaEsperada) p('passos.balanca.informada', 'Balança informada numa folha de balança cadastrada.')
        const bi = c.objeto(balanca.informada, 'passos.balanca.informada')
        if (bi) {
          const k = 'passos.balanca.informada'
          for (const t of [
            'tipo',
            'fabricante',
            'modelo',
            'numeroSerie',
            'identificacao',
            'localInstalacao',
            'anoFabricacao',
            'apoios',
            'plataforma',
            'portariaAprovacao',
            'min',
          ] as const)
            c.texto(bi[t], `${k}.${t}`, LIMITES_REGISTRO.nome * 2)
          c.umDe(bi.classe, CLASSES_INFORMADAS, `${k}.classe`)
          c.umDe(bi.tipoFaixas, TIPOS_FAIXAS_INFORMADOS, `${k}.tipoFaixas`)
          c.umDe(bi.receptor, RECEPTORES_INFORMADOS, `${k}.receptor`)
          c.umDe(bi.unidade, ['', 'mg', 'g', 'kg', 't'], `${k}.unidade`)
          const faixas = c.lista(bi.faixas, `${k}.faixas`, 3)
          if (!faixas.length) p(`${k}.faixas`, 'Falta ao menos uma faixa (Max, e, d).')
          faixas.forEach((x, i) => {
            const f = c.objeto(x, `${k}.faixas.${i}`)
            if (!f) return
            for (const t of ['max', 'e', 'd'] as const) c.texto(f[t], `${k}.faixas.${i}.${t}`, 40)
          })
        }
      } else if (informadaEsperada) p('passos.balanca.informada', 'Nesta folha a balança é informada no local, e ela falta.')
    }
    conferirAmbiente(c, passos.ambiente, 'passos.ambiente')
    conferirIndicacao(c, passos.indicacao, 'passos.indicacao')
    conferirRepetibilidade(c, passos.repetibilidade, 'passos.repetibilidade')
    conferirExcentricidade(c, passos.excentricidade, 'passos.excentricidade')
    const final = c.objeto(passos.final, 'passos.final')
    if (final) {
      if (final.dataCalibracao !== '' && !dataIsoValida(final.dataCalibracao))
        p('passos.final.dataCalibracao', 'Data inválida (AAAA-MM-DD).')
      c.instante(final.termino, 'passos.final.termino', true)
    }
  }

  // Tentativas descartadas (só consulta)
  c.lista(r.tentativas, 'tentativas', LIMITES_REGISTRO.tentativas).forEach((x, i) => {
    const k = `tentativas.${i}`
    const t = c.objeto(x, k)
    if (!t) return
    c.inteiro(t.n, `${k}.n`, 1, 100)
    c.texto(t.motivo, `${k}.motivo`, LIMITES_REGISTRO.texto, true)
    c.instante(t.encerradaEm, `${k}.encerradaEm`, false)
    conferirAmbiente(c, t.ambiente, `${k}.ambiente`)
    conferirIndicacao(c, t.indicacao, `${k}.indicacao`)
    conferirRepetibilidade(c, t.repetibilidade, `${k}.repetibilidade`)
    conferirExcentricidade(c, t.excentricidade, `${k}.excentricidade`)
  })

  // Desfecho, anotações, avisos, correções
  const desfecho = c.umDe(r.desfecho, DESFECHOS, 'desfecho')
  const motivo = c.texto(r.motivoDesfecho, 'motivoDesfecho', LIMITES_REGISTRO.texto)
  if (desfecho && desfecho !== 'COMPLETA' && !motivo.trim()) p('motivoDesfecho', 'Folha encerrada sem completar: falta o motivo.')
  c.lista(r.anotacoes, 'anotacoes', LIMITES_REGISTRO.anotacoes).forEach((x, i) => {
    const k = `anotacoes.${i}`
    const a = c.objeto(x, k)
    if (!a) return
    c.texto(a.id, `${k}.id`, LIMITES_REGISTRO.id, true)
    c.inteiro(a.passo, `${k}.passo`, 1, 8)
    c.umDe(a.tipo, TIPOS_ANOTACAO, `${k}.tipo`)
    c.texto(a.campo, `${k}.campo`, LIMITES_REGISTRO.id)
    c.texto(a.texto, `${k}.texto`, LIMITES_REGISTRO.texto, true)
    c.instante(a.em, `${k}.em`, false)
  })
  c.lista(r.avisosConferidos, 'avisosConferidos', LIMITES_REGISTRO.avisos).forEach((x, i) => {
    const k = `avisosConferidos.${i}`
    const a = c.objeto(x, k)
    if (!a) return
    c.texto(a.codigo, `${k}.codigo`, LIMITES_REGISTRO.id, true)
    c.umDe(a.classe, CLASSES_AVISO, `${k}.classe`)
    c.texto(a.campo, `${k}.campo`, LIMITES_REGISTRO.id)
    c.texto(a.texto, `${k}.texto`, LIMITES_REGISTRO.texto, true)
    c.instante(a.em, `${k}.em`, false)
    c.texto(a.motivo, `${k}.motivo`, LIMITES_REGISTRO.texto)
  })
  const correcao = (x: unknown, k: string, depois: boolean) => {
    const a = c.objeto(x, k)
    if (!a) return
    c.texto(a.campo, `${k}.campo`, LIMITES_REGISTRO.id, true)
    c.texto(a.de, `${k}.de`, LIMITES_REGISTRO.mostrado)
    c.texto(a.para, `${k}.para`, LIMITES_REGISTRO.mostrado)
    c.instante(a.em, `${k}.em`, false)
    c.texto(a.motivo, `${k}.motivo`, LIMITES_REGISTRO.texto, depois)
    if (depois) c.bool(a.mostradoAoCliente, `${k}.mostradoAoCliente`)
  }
  c.lista(r.trilha, 'trilha', LIMITES_REGISTRO.trilha).forEach((x, i) => correcao(x, `trilha.${i}`, false))
  c.lista(r.reaberturas, 'reaberturas', LIMITES_REGISTRO.reaberturas).forEach((x, i) => {
    const k = `reaberturas.${i}`
    const a = c.objeto(x, k)
    if (!a) return
    c.instante(a.em, `${k}.em`, false)
    c.texto(a.motivo, `${k}.motivo`, LIMITES_REGISTRO.texto, true)
    c.sha(a.sha256Anterior, `${k}.sha256Anterior`, false)
  })
  const correcoesDepois = c.lista(r.correcoesPosAssinatura, 'correcoesPosAssinatura', LIMITES_REGISTRO.correcoes)
  correcoesDepois.forEach((x, i) => correcao(x, `correcoesPosAssinatura.${i}`, true))

  // Assinaturas
  const assinaturas = c.objeto(r.assinaturas, 'assinaturas')
  if (assinaturas) {
    const tec = assinaturas.tecnico
    if (tec === null) {
      if (entrega) p('assinaturas.tecnico', 'Falta a assinatura do técnico.')
      if (correcoesDepois.length) p('correcoesPosAssinatura', 'Correção depois da assinatura sem a assinatura do técnico.')
    } else {
      const t = c.objeto(tec, 'assinaturas.tecnico')
      if (t) {
        c.texto(t.nome, 'assinaturas.tecnico.nome', LIMITES_REGISTRO.nome, true)
        const png = validarPng(t.png)
        if (png) p('assinaturas.tecnico.png', png)
        c.instante(t.em, 'assinaturas.tecnico.em', false)
        c.sha(t.conteudoSha256, 'assinaturas.tecnico.conteudoSha256', false)
      }
    }
    const cli = assinaturas.cliente
    if (cli === null) {
      if (entrega) p('assinaturas.cliente', 'Falta a assinatura do cliente (ou "Cliente não assinou").')
    } else {
      const a = c.objeto(cli, 'assinaturas.cliente')
      const qual = a ? tipoAssinaturaCliente(a as unknown as AssinaturaDoClienteCampo) : 'PENDENTE'
      if (a && qual === 'ASSINOU') {
        c.texto(a.nome, 'assinaturas.cliente.nome', LIMITES_REGISTRO.nome, true)
        c.texto(a.funcao, 'assinaturas.cliente.funcao', LIMITES_REGISTRO.nome, true)
        const png = validarPng(a.png)
        if (png) p('assinaturas.cliente.png', png)
        c.instante(a.em, 'assinaturas.cliente.em', false)
        c.sha(a.conteudoSha256, 'assinaturas.cliente.conteudoSha256', false)
        const daTecnico = ehObj(tec) ? tec.conteudoSha256 : undefined
        if (typeof daTecnico === 'string' && a.conteudoSha256 !== daTecnico)
          p('assinaturas.cliente.conteudoSha256', 'As duas assinaturas não amarram o mesmo conteúdo.')
      } else if (a && qual === 'NAO_ASSINOU') {
        c.texto(a.motivo, 'assinaturas.cliente.motivo', LIMITES_REGISTRO.texto, true)
        c.instante(a.em, 'assinaturas.cliente.em', false)
      } else if (qual === 'DISPENSADA') {
        if (local !== 'LABORATORIO') p('assinaturas.cliente', 'Assinatura do cliente dispensada fora do laboratório.')
      } else if (qual === 'SO_NO_PAPEL') {
        if (!piloto) p('assinaturas.cliente', '"O cliente assinou só o papel" vale só no piloto.')
      } else if (a) p('assinaturas.cliente', 'Assinatura do cliente com formato desconhecido.')
    }
  }

  // Com o pacote: o registro é dele?
  const pacote = opcoes.pacote
  if (pacote) {
    if (r.envioId !== pacote.envioId) p('envioId', 'O registro é de outro envio.')
    if (r.numero !== pacote.folha.numero) p('numero', `O registro é da folha ${String(r.numero)}, não da ${pacote.folha.numero}.`)
    if (tipo && tipo !== pacote.folha.tipo) p('tipo', 'O tipo da folha não é o do pacote.')
    const pts = ehObj(passos?.indicacao) ? passos.indicacao.pontos : null
    const doPacote = new Set(pacote.entrada.indicacao.pontos.map((x) => x.id))
    if (Array.isArray(pts))
      pts.forEach((x, i) => {
        if (ehObj(x) && x.acrescentado === false && typeof x.id === 'string' && !doPacote.has(x.id))
          p(`passos.indicacao.pontos.${i}.id`, 'Ponto que não está no pacote (sem a marca de acrescentado).')
      })
    const reps = passos?.repetibilidade
    const repsDoPacote = new Set(pacote.entrada.repetibilidade.map((x) => x.id))
    if (Array.isArray(reps))
      reps.forEach((x, i) => {
        if (ehObj(x) && typeof x.id === 'string' && !repsDoPacote.has(x.id) && !x.id.startsWith('cel-'))
          p(`passos.repetibilidade.${i}.id`, 'Ensaio de repetibilidade que não está no pacote.')
      })
  }
}

/**
 * Confere, com o sha256, que as assinaturas amarram o conteúdo do registro (`conteudoSha256` = o sha256 do registro sem
 * as assinaturas e sem as correções depois delas). No servidor, problema aqui também vira marca FORMATO.
 */
export async function conferirAssinaturas(
  registro: RegistroCampo,
  sha: (t: string) => string | Promise<string>,
): Promise<ProblemaRegistro[]> {
  const problemas: ProblemaRegistro[] = []
  const t = registro.assinaturas?.tecnico
  const cli = registro.assinaturas?.cliente
  const doCliente = tipoAssinaturaCliente(cli) === 'ASSINOU' ? (cli as { conteudoSha256: string }).conteudoSha256 : null
  if (!t && !doCliente) return problemas
  let conteudo: string
  try {
    conteudo = await calcularConteudoSha256(registro, sha)
  } catch {
    return [{ campo: 'assinaturas', mensagem: 'Não foi possível calcular o conteúdo assinado.' }]
  }
  if (t && t.conteudoSha256 !== conteudo)
    problemas.push({
      campo: 'assinaturas.tecnico.conteudoSha256',
      mensagem: 'A assinatura do técnico não corresponde ao conteúdo da folha.',
    })
  if (doCliente !== null && doCliente !== conteudo)
    problemas.push({
      campo: 'assinaturas.cliente.conteudoSha256',
      mensagem: 'A assinatura do cliente não corresponde ao conteúdo da folha.',
    })
  return problemas
}

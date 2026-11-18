// A folha impressa assinada: a FOR-CAL-01 preenchida no celular (app BC Calibração), em PDF. Gerada NA HORA em que é
// pedida, a partir do registro de campo guardado (e do pacote do envio, quando existe): sem fila, sem versões guardadas
// e sem sha256 nem código no rodapé (05-ajustes-finais §8). O nº da folha (FC-AAAA-NNNNN) é o que a identifica.
//
// Em tabelas, A4 retrato, na ordem e com os rótulos da folha impressa (server/pdf/folhaCampo.ts):
//   cabeçalho (marca, "Folha de campo — preenchida no celular", nº da folha e o nº do certificado reservado) em toda
//   página; na 1ª, a faixa PILOTO (o papel é o registro original) e a do desfecho (encerrada sem completar), a
//   identificação (formulário, POP, OS, técnico, celular e versão do app, envio, começo e fim) e o cliente e a balança
//   (cadastrados ou informados no local); depois os 8 passos, cada leitura exatamente como foi digitada e com a hora
//   do celular (ambiente no início e no fim, a série do ΔT da classe I, as etapas de substituição, a repetibilidade, a
//   grade da excentricidade, a data e a hora do fim), as assinaturas (PNG, nome, função e hora, ou a alternativa do
//   cliente), as anotações, os avisos vistos no local com a escolha do técnico, as correções antes e depois da
//   assinatura (o valor antigo visível, o motivo e a hora), as reaberturas e, em anexo, as tentativas recomeçadas (só
//   consulta). Rodapé: "FC-… · FOR-CAL-01 rev. 05 · gerado em dd/mm/aaaa hh:mm".
//
// Determinística: a mesma entrada (com `geradoEm`) dá o mesmo PDF, byte a byte. Tolerante: um registro guardado com a
// marca FORMATO (campos faltando) ainda gera a folha, com "—" no que falta. Os PDFs do certificado e da folha em branco
// não dependem deste módulo.

import { descreverPecas } from '#shared/calibracao.ts'
import {
  EMPRESA_PADRAO,
  formatarDataBr,
  LOCAIS,
  METODOS_CARREGAMENTO,
  RECEPTORES,
  ROTULO_CLASSE,
  ROTULO_METODO_INDICACAO,
  TIPOS_FAIXAS,
} from '#shared/dominio.ts'
import { FORMULARIO_FOLHA_CAMPO, METODO_EXCENTRICIDADE_FOLHA } from '#shared/folhaCampo.ts'
import { identificacaoDaBalanca, nomeDoCliente } from '#shared/campo/pacote.ts'
import { LIMITE_RELOGIO_MS, textoRelogioDiferente } from '#shared/campo/protocolo.ts'
import { REGEX_INSTANTE, textoDaCarga, tipoAssinaturaCliente } from '#shared/campo/registro.ts'
import { FRASE_ASSINATURA_CLIENTE } from '#shared/campo/resumoCliente.ts'
import {
  CAMPOS_CONFERIR,
  type ChavePasso,
  type CorrecaoCampo,
  type CorrecaoPosAssinaturaCampo,
  type Desfecho,
  type MomentoAmbiente,
  PASSOS_FOLHA,
  type PacoteCampo,
  type RegistroCampo,
  ROTULO_TIPO_ANOTACAO,
  type TipoFolhaCampo,
  TITULOS_PASSOS,
} from '#shared/campo/tipos.ts'
import type { ClasseExatidao, DadosEmpresa, Padrao, Receptor, TipoFaixas } from '#shared/tipos.ts'
import { pngDecodificavel } from '../campo/png.ts'
import {
  A4,
  BASE_RODAPE,
  colunasMarca,
  corpoQueCabe,
  dataHoraBrasilia,
  fundoTimbrado,
  inteiro,
  larguraMarca,
  larguraTexto,
  MODULO,
  type No,
  type NoObjeto,
  pdfmake,
  quebraAntes,
  TOPO_CABECALHO,
} from './base.ts'
import { COR, TIMBRADO } from './marca.ts'

export interface OpcoesPdfRegistroCampo {
  /** Quando o PDF é gerado (ISO; os testes fixam): sai no rodapé e é a data do documento. Padrão: agora. */
  geradoEm?: string
  /** Piloto (o registro ou o envio): a faixa "PILOTO". Padrão: `registro.piloto`. */
  piloto?: boolean
  /** A empresa do cabeçalho (Configurações). Padrão: a do sistema (`EMPRESA_PADRAO`). */
  empresa?: DadosEmpresa
  /** Quando o servidor recebeu o registro (ISO, a hora do servidor); '' ou ausente = não mostra. */
  recebidoEm?: string
  /** Diferença do relógio do celular na entrega, em segundos: passando de 5 min, o selo "Relógio do celular diferente". */
  relogioDiferencaS?: number | null
}

// ---- Textos fixos (exportados para os testes) ------------------------------------------------------------------------

export const TITULO_REGISTRO_CAMPO = 'Folha de campo — preenchida no celular'
export const FAIXA_PILOTO =
  'PILOTO: o registro original é a FOR-CAL-01 em papel. Esta folha é a cópia do celular, para comparar com o papel.'
export const TITULO_ANEXO_TENTATIVAS = 'Anexo: tentativas recomeçadas (só consulta)'
export const NOTA_ANEXO_TENTATIVAS =
  'A balança precisou de manutenção e os ensaios foram recomeçados. As leituras abaixo ficam guardadas só para consulta: não vão para o rascunho nem para o certificado.'

const ROTULO_TIPO_FOLHA: Record<TipoFolhaCampo, string> = {
  calibracao: 'Da calibração (balança cadastrada)',
  balanca: 'Avulsa da balança cadastrada',
  cliente: 'Só do cliente (balança informada no local)',
  branco: 'Em branco (cliente e balança informados no local)',
}

export const ROTULO_DESFECHO: Record<Desfecho, string> = {
  COMPLETA: 'Completa',
  INCOMPLETA: 'Encerrada sem completar: incompleta',
  NAO_CALIBRADA: 'Encerrada sem completar: não calibrada',
}

const ROTULO_MOMENTO: Record<MomentoAmbiente, string> = {
  INICIO: 'Início',
  INICIO_REPETIDA: 'Início (medido de novo)',
  FIM: 'Fim',
}

const ROTULO_CLASSE_AVISO = { DIGITACAO: 'Confira a digitação', IMPEDE: 'Isto impede o certificado' } as const

// ---- Página e tintas -----------------------------------------------------------------------------------------------

/** Margem lateral de 12 mm, como a folha impressa. */
const MARGEM_X = 34
const LARGURA = A4.largura - 2 * MARGEM_X
/** O conteúdo começa logo abaixo do timbrado (a marca e os nºs). */
const MARGEM_TOPO = TOPO_CABECALHO + MODULO + 16
/** Rodapé de uma linha, apoiado no fio de base. */
const MARGEM_BASE = Math.ceil(A4.altura - BASE_RODAPE + 18)

const C = {
  texto: COR.texto,
  secundario: COR.textoSecundario,
  rotulo: COR.rotulo,
  fio: COR.fio,
  fioClaro: COR.fioClaro,
  cabecalho: COR.fundoCabecalho,
  zebra: COR.zebra,
  apagado: '#8A8F94',
} as const

const TRACO = '—'
const TITULO_CABECALHO = 'FOLHA DE CAMPO — PREENCHIDA NO CELULAR'

// ---- Leitura tolerante do registro guardado ------------------------------------------------------------------------

type Objeto = Record<string, unknown>
/** Um objeto do registro com algumas listas e objetos garantidos. */
type Com<T> = Objeto & T
const objeto = (v: unknown): Objeto => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : {})
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const objetos = (v: unknown): Objeto[] => lista(v).map(objeto)
/** Texto de um campo (número vira texto; o resto, ''). */
const txt = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
const ou = (s: string, alternativa = TRACO) => s || alternativa
const juntar = (partes: Array<string | false | null | undefined>, sep = ' · ') => partes.filter(Boolean).join(sep)

/** Os ensaios de uma tentativa (ou os do registro), com as listas sempre presentes. */
function ensaiosSeguros(x: Objeto) {
  const ambiente = objeto(x.ambiente)
  const indicacao = objeto(x.indicacao)
  const exc = objeto(x.excentricidade)
  const sub = indicacao.substituicao && typeof indicacao.substituicao === 'object' ? objeto(indicacao.substituicao) : null
  return {
    ambiente: {
      ...ambiente,
      linhas: objetos(ambiente.linhas),
      deltaT: objetos(ambiente.deltaT),
      deltaT0: ambiente.deltaT0 && typeof ambiente.deltaT0 === 'object' ? objeto(ambiente.deltaT0) : null,
    } as Com<{ linhas: Objeto[]; deltaT: Objeto[]; deltaT0: Objeto | null }>,
    indicacao: {
      ...indicacao,
      calInterno: indicacao.calInterno && typeof indicacao.calInterno === 'object' ? objeto(indicacao.calInterno) : null,
      pontos: objetos(indicacao.pontos),
      substituicao: sub ? { etapas: objetos(sub.etapas) } : null,
    } as Com<{ calInterno: Objeto | null; pontos: Objeto[]; substituicao: { etapas: Objeto[] } | null }>,
    repetibilidade: objetos(x.repetibilidade).map((e) => ({ ...e, leituras: lista(e.leituras) }) as Com<{ leituras: unknown[] }>),
    excentricidade: { ...exc, posicoes: objetos(exc.posicoes) } as Com<{ posicoes: Objeto[] }>,
  }
}
type Ensaios = ReturnType<typeof ensaiosSeguros>

/** O registro com as listas e os objetos sempre presentes (um registro com a marca FORMATO pode vir sem eles). */
function normalizar(bruto: RegistroCampo) {
  const r = objeto(bruto)
  const ps = objeto(r.passos)
  const chegada = objeto(ps.chegada)
  const balanca = objeto(ps.balanca)
  const ass = objeto(r.assinaturas)
  return {
    numero: txt(r.numero),
    formulario: objeto(r.formulario),
    piloto: r.piloto === true,
    tipo: txt(r.tipo) as TipoFolhaCampo | '',
    aparelho: objeto(r.aparelho),
    tecnico: objeto(r.tecnico),
    relogio: objeto(r.relogio),
    passos: {
      padroes: objetos(ps.padroes),
      chegada: {
        ...chegada,
        conferencias: objetos(chegada.conferencias),
        clienteInformado:
          chegada.clienteInformado && typeof chegada.clienteInformado === 'object' ? objeto(chegada.clienteInformado) : null,
      } as Com<{ conferencias: Objeto[]; clienteInformado: Objeto | null }>,
      balanca: {
        conferencias: objetos(balanca.conferencias),
        informada: balanca.informada && typeof balanca.informada === 'object' ? objeto(balanca.informada) : null,
      },
      ...ensaiosSeguros(ps),
      final: objeto(ps.final),
    },
    tentativas: objetos(r.tentativas).map((t) => ({ ...t, ...ensaiosSeguros(t) }) as Objeto & Ensaios),
    desfecho: txt(r.desfecho) as Desfecho | '',
    motivoDesfecho: txt(r.motivoDesfecho),
    anotacoes: objetos(r.anotacoes),
    avisosConferidos: objetos(r.avisosConferidos),
    trilha: objetos(r.trilha) as unknown as CorrecaoCampo[],
    reaberturas: objetos(r.reaberturas),
    assinaturas: {
      tecnico: ass.tecnico && typeof ass.tecnico === 'object' ? objeto(ass.tecnico) : null,
      cliente: ass.cliente && typeof ass.cliente === 'object' ? objeto(ass.cliente) : null,
    },
    correcoesPosAssinatura: objetos(r.correcoesPosAssinatura) as unknown as CorrecaoPosAssinaturaCampo[],
  }
}
type Registro = ReturnType<typeof normalizar>

// ---- Data e hora ---------------------------------------------------------------------------------------------------

interface Partes {
  /** AAAA-MM-DD */
  data: string
  /** dd/mm/aaaa */
  dia: string
  hora: string
  segundos: string
}

/** As partes de um instante do celular como estão escritas (o relógio do celular, sem converter o fuso). */
function partes(v: unknown): Partes | null {
  if (typeof v !== 'string') return null
  const m = REGEX_INSTANTE.exec(v)
  if (!m) return null
  return { data: `${m[1]}-${m[2]}-${m[3]}`, dia: `${m[3]}/${m[2]}/${m[1]}`, hora: `${m[4]}:${m[5]}`, segundos: m[6] }
}

/** "21/10/2026 08:42" (o relógio do celular); '' sem instante. */
const dataHora = (v: unknown): string => {
  const p = partes(v)
  return p ? `${p.dia} ${p.hora}` : ''
}

/** Uma hora do servidor (ISO em UTC) em Brasília: "20/10/2026 17:10"; '' se não for uma data. */
const dataHoraServidor = (iso: unknown): string => {
  const q = typeof iso === 'string' ? dataHoraBrasilia(iso) : null
  return q ? `${q.data} ${q.hora}` : ''
}

// ---- Contexto ------------------------------------------------------------------------------------------------------

interface PadraoResumo {
  identificacao: string
  descricao: string
  certificado: string
  validade: string
}

interface Contexto {
  r: Registro
  p: PacoteCampo | null
  /** Unidade das leituras ('' = não se sabe). */
  u: string
  /** Dia da folha (AAAA-MM-DD do começo): as horas de outro dia saem com a data. */
  dia: string
  classeI: boolean
  padroes: Map<string, PadraoResumo>
  cadastro: Padrao[]
  /** Correções antes de assinar e depois da assinatura, pelo campo (vazias nas tentativas). */
  antes: Map<string, CorrecaoCampo[]>
  depois: Map<string, CorrecaoPosAssinaturaCampo[]>
  /** Os pesos impressos de cada ponto e ensaio do pacote, pelo id. */
  pesosDoPonto: Map<string, string>
  pesosDaRepetibilidade: Map<string, string>
}

function porCampo<T extends { campo?: unknown }>(itens: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of itens) {
    const k = txt(x.campo)
    if (!k) continue
    m.set(k, [...(m.get(k) ?? []), x])
  }
  return m
}

function contexto(registro: RegistroCampo, pacote: PacoteCampo | null): Contexto {
  const r = normalizar(registro)
  const p = pacote && typeof pacote === 'object' ? pacote : null
  const informada = r.passos.balanca.informada
  const u = txt(p?.balanca?.unidade) || txt(p?.plano?.unidade) || txt(informada?.unidade)
  const classe = txt(p?.balanca?.classe) || txt(informada?.classe)
  const cadastro = lista(p?.padroes?.cadastro) as Padrao[]
  const padroes = new Map<string, PadraoResumo>()
  for (const x of cadastro)
    padroes.set(x.id, {
      identificacao: txt(x.identificacao),
      descricao: txt(x.descricao),
      certificado: txt(x.certificado),
      validade: txt(x.validade),
    })
  const pesosDoPonto = new Map<string, string>()
  const pesosDaRepetibilidade = new Map<string, string>()
  const plano = p?.plano
  if (plano) {
    lista(p?.entrada?.indicacao?.pontos).forEach((x, i) => {
      const id = txt(objeto(x).id)
      if (id && plano.pontos[i]) pesosDoPonto.set(id, plano.pontos[i].pesos)
    })
    lista(p?.entrada?.repetibilidade).forEach((x, i) => {
      const id = txt(objeto(x).id)
      if (id && plano.repetibilidade[i]) pesosDaRepetibilidade.set(id, plano.repetibilidade[i].pesos)
    })
  }
  const inicio = partes(r.relogio.iniciadoEm) ?? partes(r.passos.chegada.inicio)
  return {
    r,
    p,
    u,
    dia: inicio?.data ?? '',
    classeI: classe === 'I' || r.passos.ambiente.deltaT.length > 0 || !!r.passos.indicacao.calInterno,
    padroes,
    cadastro,
    antes: porCampo(r.trilha),
    depois: porCampo(r.correcoesPosAssinatura),
    pesosDoPonto,
    pesosDaRepetibilidade,
  }
}

/** O contexto de uma tentativa recomeçada: sem as correções (que valem para os passos atuais). */
const contextoDaTentativa = (ctx: Contexto): Contexto => ({ ...ctx, antes: new Map(), depois: new Map() })

/** "08:41:05", ou "22/10 08:41:05" quando é de outro dia que o do começo da folha; '' sem hora. */
function horaDe(ctx: Contexto, v: unknown, segundos = true): string {
  const p = partes(v)
  if (!p) return ''
  const h = segundos ? `${p.hora}:${p.segundos}` : p.hora
  return !ctx.dia || p.data === ctx.dia ? h : `${p.dia.slice(0, 5)} ${h}`
}

const unidade = (ctx: Contexto) => ctx.u || undefined

// ---- Blocos de layout ----------------------------------------------------------------------------------------------

type Alinhamento = 'left' | 'right' | 'center'
interface Coluna {
  titulo: string
  unidade?: string
  largura: number | string
  alinhamento?: Alinhamento
}

const LAYOUT_TABELA: NoObjeto = {
  hLineWidth: (i: number, no: { table: { body: unknown[]; headerRows?: number } }) =>
    i === 0 || i === no.table.body.length || i === (no.table.headerRows ?? 0) ? 0.6 : 0.25,
  hLineColor: (i: number, no: { table: { body: unknown[]; headerRows?: number } }) =>
    i === 0 || i === no.table.body.length || i === (no.table.headerRows ?? 0) ? '#AEB4B0' : C.fioClaro,
  vLineWidth: () => 0,
  fillColor: (linha: number, no: { table: { headerRows?: number } }) => {
    const cab = no.table.headerRows ?? 0
    if (linha < cab) return C.cabecalho
    return (linha - cab) % 2 === 1 ? C.zebra : null
  },
  paddingLeft: (i: number) => (i === 0 ? 5 : 4),
  paddingRight: (i: number, no: { table: { widths: unknown[] } }) => (i === no.table.widths.length - 1 ? 5 : 4),
  paddingTop: () => 2.2,
  paddingBottom: () => 2.2,
}

function alinhar(celula: No, alinhamento?: Alinhamento): No {
  if (!alinhamento) return celula
  if (typeof celula === 'string' || Array.isArray(celula)) return { text: celula, alignment: alinhamento }
  // A célula coberta por um colSpan ({}) fica como está
  return celula.alignment || !Object.keys(celula).length ? celula : { ...celula, alignment: alinhamento }
}

/** Tabela de dados: cabeçalho cinza (repetido na página seguinte), zebra suave, fios finos e sem linhas verticais. */
function tabela(colunas: Coluna[], linhas: No[][], margem: number[] = [0, 0, 0, 0]): NoObjeto {
  const cabecalho: No[] = colunas.map((c) => ({
    text: [{ text: c.titulo }, ...(c.unidade ? [{ text: ` (${c.unidade})`, font: 'Inter', bold: false }] : [])],
    style: 'cabecalhoTabela',
    alignment: c.alinhamento ?? 'left',
  }))
  const corpo = linhas.map((l) => l.map((cel, j) => alinhar(cel, colunas[j]?.alinhamento)))
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      keepWithHeaderRows: 1,
      widths: colunas.map((c) => c.largura),
      body: [cabecalho, ...corpo],
    },
    layout: LAYOUT_TABELA,
    margin: margem,
  }
}

interface Par {
  rotulo: string
  valor: No
  /** Ocupa a linha inteira (texto longo). */
  inteira?: boolean
}

/** Ficha de rótulo e valor, dois pares por linha (o par `inteira` ocupa a linha toda). */
function ficha(pares: Array<Par | null | false>, margem: number[] = [0, 0, 0, 0], larguraRotulo = 96): NoObjeto {
  const valor = (v: No): No => (v === '' ? { text: TRACO, color: C.apagado } : v)
  const rot = (t: string): NoObjeto => ({ text: t, style: 'rotulo' })
  const body: No[][] = []
  let pendente: Par | null = null
  const fechar = () => {
    if (pendente) body.push([rot(pendente.rotulo), valor(pendente.valor), '', ''])
    pendente = null
  }
  for (const par of pares) {
    if (!par) continue
    if (par.inteira) {
      fechar()
      body.push([rot(par.rotulo), { ...objetoDe(valor(par.valor)), colSpan: 3 }, {}, {}])
    } else if (pendente) {
      const a: Par = pendente
      body.push([rot(a.rotulo), valor(a.valor), rot(par.rotulo), valor(par.valor)])
      pendente = null
    } else pendente = par
  }
  fechar()
  if (!body.length) return { text: '' }
  return {
    table: { widths: [larguraRotulo, '*', larguraRotulo, '*'], body, dontBreakRows: true },
    layout: {
      hLineWidth: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? 0.6 : 0.25),
      hLineColor: (i: number, no: { table: { body: unknown[] } }) =>
        i === 0 || i === no.table.body.length ? '#AEB4B0' : C.fioClaro,
      vLineWidth: () => 0,
      paddingLeft: (i: number) => (i === 0 ? 5 : i === 2 ? 10 : 4),
      paddingRight: () => 4,
      paddingTop: () => 2.1,
      paddingBottom: () => 2.1,
    },
    margin: margem,
  }
}

const objetoDe = (n: No): NoObjeto => (typeof n === 'string' || Array.isArray(n) ? { text: n } : n)

/** Título de um passo ou bloco: o nº num quadrado verde (como na folha impressa), o nome e, à direita, um complemento. */
function titulo(n: number | null, nome: string, complemento = ''): NoObjeto {
  const celulas: No[] = []
  if (n !== null)
    celulas.push({
      text: String(n),
      font: 'Poppins',
      fontSize: 8,
      color: '#FFFFFF',
      fillColor: COR.marcaTexto,
      alignment: 'center',
      margin: [0, 0.8, 0, 0],
    })
  celulas.push({
    text: nome.toUpperCase(),
    font: 'InterMedio',
    bold: true,
    fontSize: 8.4,
    characterSpacing: 0.35,
    color: C.texto,
    margin: [n !== null ? 6.5 : 0, 1.4, 0, 0],
  })
  celulas.push({ text: complemento, fontSize: 7, color: C.secundario, alignment: 'right', margin: [6, 2, 0, 0] })
  return {
    table: { widths: n !== null ? [11, '*', 'auto'] : ['*', 'auto'], heights: [11], body: [celulas] },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 0.9 : 0),
      hLineColor: () => C.texto,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 11, 0, 4],
    // Título sozinho no pé da página vai para a próxima
    headlineLevel: 90,
  }
}

const tituloPasso = (chave: ChavePasso, complemento = '') => titulo(PASSOS_FOLHA[chave], TITULOS_PASSOS[chave], complemento)

const subtitulo = (texto: string, margem: number[] = [0, 6, 0, 2.5]): NoObjeto => ({
  text: texto,
  font: 'InterMedio',
  bold: true,
  fontSize: 7.8,
  color: C.texto,
  margin: margem,
  headlineLevel: 50,
})

const nota = (texto: No, margem: number[] = [0, 3, 0, 0]): NoObjeto => ({ text: texto, style: 'nota', margin: margem })

/** Faixa de destaque (PILOTO, desfecho): fio grosso à esquerda, fundo cinza claro (sai bem na laser P&B). */
function faixa(texto: No, margem: number[] = [0, 0, 0, 5]): NoObjeto {
  return {
    table: { widths: ['*'], body: [[{ text: texto, fontSize: 8.2, color: C.texto }]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 2.6 : 0),
      vLineColor: () => C.texto,
      fillColor: () => C.cabecalho,
      paddingLeft: () => 8,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: margem,
  }
}

const apagado = (texto: string): NoObjeto => ({ text: texto, color: C.apagado })
const simNao = (v: unknown): No => (v === true ? 'Sim' : v === false ? 'Não' : apagado(TRACO))

/**
 * Um valor das tabelas de correções como as pessoas leem: o texto digitado como está; a data, o instante e as opções de
 * marcar (o local da calibração, sim e não) por extenso; '' = "(vazio)".
 */
function valorLegivel(v: unknown, campo = ''): string {
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  const s = txt(v)
  if (!s) return '(vazio)'
  if (s === 'true' || s === 'false') return s === 'true' ? 'Sim' : 'Não'
  if (campo.endsWith('chegada.local') && s in LOCAIS) return LOCAIS[s as keyof typeof LOCAIS]
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatarDataBr(s) || s
  return dataHora(s) || s
}

// ---- Leitura numa célula -------------------------------------------------------------------------------------------

const leituraTem = (l: unknown) => typeof objeto(l).valor === 'string' && txt(objeto(l).valor) !== ''

/**
 * Uma leitura numa célula: o valor exatamente como foi digitado, a hora do celular embaixo (e "Repetir" quando entrou
 * pela tecla), o valor de antes de uma correção antes de assinar (riscado) e, quando foi corrigido depois da
 * assinatura, o valor assinado riscado e o novo, com a hora.
 */
function leitura(ctx: Contexto, l: unknown, caminho: string): NoObjeto {
  const x = objeto(l)
  const valor = typeof x.valor === 'string' ? x.valor : ''
  const depois = ctx.depois.get(caminho) ?? []
  const linhas: No[] = []
  if (!valor.trim()) linhas.push(apagado(TRACO))
  else
    linhas.push({
      text: valor,
      font: 'InterMedio',
      fontSize: 8.8,
      ...(depois.length ? { decoration: 'lineThrough', color: C.secundario } : {}),
    })
  const hora = horaDe(ctx, x.em)
  const repetir = x.via === 'repetir'
  if (valor.trim() && (hora || repetir)) linhas.push({ text: juntar([hora, repetir && 'Repetir']), style: 'hora' })
  for (const c of ctx.antes.get(caminho) ?? [])
    linhas.push({
      text: [
        'antes ',
        { text: txt(c.de) || '(vazio)', decoration: 'lineThrough' },
        ` · corrigido ${horaDe(ctx, c.em, false)}`.trimEnd(),
      ],
      style: 'correcao',
    })
  for (const c of depois)
    linhas.push({
      text: [
        { text: txt(c.para) || '(vazio)', font: 'InterMedio', color: C.texto },
        ` corrigido após a assinatura ${horaDe(ctx, c.em, false)}`.trimEnd(),
      ],
      style: 'correcao',
    })
  return { stack: linhas }
}

// ---- Rótulo do campo (correções, anotações e avisos) ---------------------------------------------------------------

const CAMPOS_DO_PASSO: Partial<Record<string, string>> = {
  'chegada.os': 'Nº da OS',
  'chegada.local': 'Local da calibração',
  'chegada.localEndereco': 'Endereço da calibração',
  'chegada.inicio': 'Hora de início',
  'final.dataCalibracao': 'Data da calibração',
  'final.termino': 'Hora de término',
  'indicacao.retornoZero': 'Retorno ao zero',
  'indicacao.calInterno': 'Ajuste interno (CAL) antes dos ensaios',
  'excentricidade.aplicavel': 'Excentricidade feita',
  'excentricidade.motivo': 'Excentricidade: por que não foi feita',
  'excentricidade.cargaAplicada': 'Excentricidade: carga aplicada',
  'excentricidade.carga': 'Excentricidade: carga aplicada',
  'ambiente.pesosNoLocalDesde': 'Pesos no local desde',
  'ambiente.deltaT0.origem': 'ΔT0: temperatura de origem',
  'ambiente.deltaT0.sala': 'ΔT0: temperatura da sala',
}

const ROTULO_LEITURA_PONTO: Partial<Record<string, string>> = {
  crescente: 'indicação ↑',
  decrescente: 'indicação ↓',
  cargaAplicada: 'carga aplicada',
  pecas: 'peças',
}

const ROTULO_AMBIENTE: Partial<Record<string, string>> = {
  temperatura: 'temperatura',
  umidade: 'umidade',
  pressao: 'pressão',
  em: 'hora',
  instrumentos: 'instrumentos',
}

const PASSO_DO_CONFERIR = (campo: string) => (campo.startsWith('balanca.') ? PASSOS_FOLHA.balanca : PASSOS_FOLHA.chegada)
const CAMPOS_CONFERIR_LISTA: readonly string[] = Object.values(CAMPOS_CONFERIR)

/**
 * O campo de uma correção, anotação ou aviso para pessoas: "Passo 5 · ponto 6 (150,00 kg) · indicação ↑". O caminho segue
 * a regra do registro (tipos.ts): a partir de `passos`, com o id do item quando ele tem id e a posição quando não tem.
 */
function rotuloDoCampo(ctx: Contexto, campo: string): string {
  const c = campo.trim().replace(/^passos\./, '')
  if (!c) return ''
  const passo = (n: number, resto: string) => `Passo ${n} · ${resto}`
  if (CAMPOS_CONFERIR_LISTA.includes(c)) {
    const conf = [...ctx.r.passos.chegada.conferencias, ...ctx.r.passos.balanca.conferencias].find((x) => x.campo === c)
    const doPacote = [...(ctx.p?.conferir?.chegada ?? []), ...(ctx.p?.conferir?.balanca ?? [])].find((x) => x.campo === c)
    return passo(PASSO_DO_CONFERIR(c), txt(conf?.rotulo) || txt(doPacote?.rotulo) || c)
  }
  const fixo = CAMPOS_DO_PASSO[c]
  const k = c.split('.')
  const numero = PASSOS_FOLHA[k[0] as ChavePasso]
  if (fixo && numero) return passo(numero, fixo)
  const ps = ctx.r.passos
  switch (k[0]) {
    case 'chegada':
      if (k[1] === 'clienteInformado') return passo(2, `cliente escrito no local${k[2] ? ` · ${k[2]}` : ''}`)
      break
    case 'balanca':
      if (k[1] === 'informada') return passo(3, `balança informada${k[2] ? ` · ${k[2]}` : ''}`)
      break
    case 'padroes': {
      const item = ps.padroes.find((x) => x.id === k[1]) ?? ps.padroes[Number(k[1])]
      return passo(1, juntar([txt(item?.identificacao) || `padrão ${k[1] ?? ''}`.trim(), k[2]]))
    }
    case 'ambiente': {
      if (k[1] === 'linhas') {
        const linha = ps.ambiente.linhas[Number(k[2])]
        const momento = ROTULO_MOMENTO[txt(linha?.momento) as MomentoAmbiente] ?? `linha ${Number(k[2]) + 1}`
        return passo(4, juntar([`ambiente ${momento.toLowerCase()}`, k[3] && (ROTULO_AMBIENTE[k[3]] ?? k[3])]))
      }
      if (k[1] === 'deltaT') return passo(4, `ΔT pesos − ar · ${Number(k[2]) + 1}ª medição`)
      break
    }
    case 'indicacao': {
      if (k[1] === 'pontos') {
        const i = ps.indicacao.pontos.findIndex((x) => x.id === k[2])
        const pt = ps.indicacao.pontos[i]
        const carga = pt ? txt(pt.cargaPrevista) || txt(objeto(pt.cargaAplicada).valor) : ''
        const nome =
          i >= 0 ? `ponto ${i + 1}${carga ? ` (${carga}${ctx.u ? ` ${ctx.u}` : ''})` : ''}` : `ponto ${k[2] ?? ''}`.trim()
        return passo(5, juntar([nome, k[3] && (ROTULO_LEITURA_PONTO[k[3]] ?? k[3])]))
      }
      if (k[1] === 'substituicao') {
        const qual =
          k[4] === 'padroes' || k[4] === 'leituraPadroes'
            ? 'indicação com os pesos'
            : k[4] === 'material'
              ? 'material'
              : 'indicação com a substituição'
        return passo(5, `${Number(k[3]) + 1}ª etapa de substituição · ${qual}`)
      }
      break
    }
    case 'repetibilidade': {
      const j = ps.repetibilidade.findIndex((x) => x.id === k[1])
      const e = ps.repetibilidade[j]
      const carga = e ? txt(e.cargaPrevista) || txt(objeto(e.cargaAplicada).valor) : ''
      const nome =
        j >= 0
          ? `repetibilidade${ps.repetibilidade.length > 1 ? ` ${j + 1}` : ''}${carga ? ` (${carga}${ctx.u ? ` ${ctx.u}` : ''})` : ''}`
          : 'repetibilidade'
      if (k[2] === 'leituras') return passo(6, `${nome} · leitura ${Number(k[3]) + 1}`)
      if (k[2] === 'cargaAplicada' || k[2] === 'carga') return passo(6, `${nome} · carga aplicada`)
      return passo(6, nome)
    }
    case 'excentricidade': {
      if (k[1] === 'posicoes') {
        const pos = ps.excentricidade.posicoes[Number(k[2])]
        const nome = txt(pos?.rotulo) || `posição ${Number(k[2]) + 1}`
        const qual = k[3] === 'zeroAntes' ? 'zero antes' : k[3] ? 'indicação' : ''
        return passo(7, juntar(['excentricidade', nome, qual]))
      }
      break
    }
  }
  return numero ? passo(numero, c.slice(k[0].length + 1) || TITULOS_PASSOS[k[0] as ChavePasso]) : c
}

// ---- Cabeçalho e rodapé --------------------------------------------------------------------------------------------

/** O fio entre o nº do certificado e o da folha, com as margens dele (pt). */
const LARGURA_FIO_NUMEROS = 0.6 + 2 * 11

function cabecalho(ctx: Contexto, empresa: DadosEmpresa, piloto: boolean) {
  const numero = ctx.r.numero || 'FC sem nº'
  const certificado = txt(ctx.p?.folha?.numeroCertificado)
  const poppins = { fonte: 'Poppins' as const, tamanho: 12.5 }
  const titulo = larguraTexto(TITULO_CABECALHO, { fonte: 'InterMedio', tamanho: 6.3, espacamento: 0.5 })
  const livre = LARGURA - larguraMarca(empresa) - 16
  const corpoFolha = corpoQueCabe(numero, certificado ? (livre - LARGURA_FIO_NUMEROS) / 2 : livre, poppins)
  const colunaFolha = Math.max(titulo, larguraTexto(numero, { ...poppins, tamanho: corpoFolha }))
  const corpoCertificado = certificado
    ? corpoQueCabe(certificado, livre - LARGURA_FIO_NUMEROS - colunaFolha, poppins)
    : poppins.tamanho
  const pilha = (rotulo: string, valor: string, corpo: number, embaixo: No): NoObjeto => ({
    width: 'auto',
    alignment: 'right',
    margin: [0, -1.5, 0, 0],
    lineHeight: 1,
    stack: [
      { text: rotulo, font: 'InterMedio', fontSize: 6.3, characterSpacing: 0.5, color: COR.marcaTexto },
      {
        text: valor,
        noWrap: true,
        font: 'Poppins',
        fontSize: corpo,
        lineHeight: 0.8,
        color: TIMBRADO.texto,
        margin: [0, -1.5, 0, 0],
      },
      { text: embaixo, fontSize: 7, color: TIMBRADO.secundario, margin: [0, 4.6, 0, 0] },
    ],
  })
  // Um nó novo a cada página (o pdfmake guardaria as posições no nó reaproveitado)
  return (pagina: number, total: number): NoObjeto => ({
    margin: [MARGEM_X, TOPO_CABECALHO, MARGEM_X, 0],
    columns: [
      ...colunasMarca(empresa),
      ...(certificado
        ? [
            pilha('CERTIFICADO Nº', certificado, corpoCertificado, 'reservado na folha'),
            {
              width: 'auto',
              canvas: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: 32, lineWidth: 0.6, lineColor: '#B5B5B5' }],
              margin: [11, -1, 11, 0],
            },
          ]
        : []),
      pilha(TITULO_CABECALHO, numero, corpoFolha, [
        ...(piloto ? [{ text: 'PILOTO', font: 'InterMedio', bold: true, color: TIMBRADO.texto }, ' · '] : []),
        `Página ${pagina} de ${total}`,
      ]),
    ],
  })
}

/** "FC-2026-00042 · FOR-CAL-01 rev. 05 · gerado em 18/11/2026 10:30": sem sha256 nem código. */
export function textoRodapeRegistroCampo(numero: string, formulario: { codigo?: string; revisao?: string }, geradoEm: string) {
  const f = `${formulario.codigo || FORMULARIO_FOLHA_CAMPO.codigo} rev. ${formulario.revisao || FORMULARIO_FOLHA_CAMPO.revisao}`
  const q = dataHoraBrasilia(geradoEm)
  return `${numero || 'FC sem nº'} · ${f} · gerado em ${q ? `${q.data} ${q.hora}` : geradoEm}`
}

// ---- Identificação, cliente e balança (página 1) -------------------------------------------------------------------

function blocoIdentificacao(ctx: Contexto, o: OpcoesPdfRegistroCampo): No[] {
  const { r, p } = ctx
  const f = p?.folha
  const formulario = `${txt(r.formulario.codigo) || FORMULARIO_FOLHA_CAMPO.codigo} rev. ${txt(r.formulario.revisao) || FORMULARIO_FOLHA_CAMPO.revisao}`
  const os = txt(f?.os) || txt(r.passos.chegada.os)
  const tipo = (txt(f?.tipo) || r.tipo) as TipoFolhaCampo | ''
  const enviada = dataHoraServidor(f?.enviadaEm)
  const desfecho = r.desfecho ? (ROTULO_DESFECHO[r.desfecho] ?? r.desfecho) : ''
  // O selo RELOGIO só passa de 5 min (a mesma regra da entrega)
  const diferenca = o.relogioDiferencaS === null || o.relogioDiferencaS === undefined ? NaN : Number(o.relogioDiferencaS) * 1000
  const relogio = Math.abs(diferenca) > LIMITE_RELOGIO_MS ? textoRelogioDiferente(diferenca) : ''
  return [
    titulo(null, 'Identificação', `${formulario} · ${txt(f?.formulario?.titulo) || FORMULARIO_FOLHA_CAMPO.titulo}`),
    ficha([
      { rotulo: 'Folha de campo', valor: { text: ou(r.numero), font: 'InterMedio' } },
      { rotulo: 'Certificado nº', valor: txt(f?.numeroCertificado) ? `${f!.numeroCertificado} (reservado)` : '' },
      { rotulo: 'Formulário', valor: formulario },
      { rotulo: 'Procedimento', valor: txt(f?.pop) },
      { rotulo: 'Nº da OS', valor: os ? `${os}${!txt(f?.os) ? ' (escrito no local)' : ''}` : '' },
      { rotulo: 'Tipo de folha', valor: tipo ? (ROTULO_TIPO_FOLHA[tipo as TipoFolhaCampo] ?? tipo) : '' },
      { rotulo: 'Técnico que executou', valor: txt(r.tecnico.nome) },
      {
        rotulo: 'Celular',
        valor: juntar([txt(r.aparelho.modelo), txt(r.aparelho.versaoApp) && `app ${txt(r.aparelho.versaoApp)}`]),
      },
      {
        rotulo: 'Enviada ao celular',
        valor: juntar([enviada, txt(f?.enviadaPor) && `por ${txt(f?.enviadaPor)}`], ' '),
      },
      { rotulo: 'Começada no celular', valor: dataHora(r.relogio.iniciadoEm) },
      { rotulo: 'Finalizada', valor: dataHora(r.relogio.finalizadoEm) },
      { rotulo: 'Recebida no servidor', valor: juntar([dataHoraServidor(o.recebidoEm), relogio]) },
      {
        rotulo: 'Desfecho',
        valor: desfecho
          ? { text: juntar([desfecho, r.motivoDesfecho]), ...(r.desfecho !== 'COMPLETA' ? { font: 'InterMedio' } : {}) }
          : '',
        inteira: true,
      },
    ]),
  ]
}

const textoConferido = (ctx: Contexto, campo: string) => {
  const c = [...ctx.r.passos.chegada.conferencias, ...ctx.r.passos.balanca.conferencias].find((x) => x.campo === campo)
  return txt(c?.mostrado)
}

function resumoDaInformada(b: Objeto, u: string): { balanca: string; capacidade: string } {
  const faixas = objetos(b.faixas).filter((x) => txt(x.max) || txt(x.d) || txt(x.e))
  const comU = (v: string) => (v ? `${v}${u ? ` ${u}` : ''}` : '')
  return {
    balanca: juntar([
      txt(b.tipo),
      juntar([txt(b.fabricante), txt(b.modelo)], ' '),
      txt(b.numeroSerie) && `nº ${txt(b.numeroSerie)}`,
      txt(b.identificacao) && `TAG ${txt(b.identificacao)}`,
    ]),
    capacidade: juntar([
      ...faixas.map((x) => juntar([comU(txt(x.max)) && `Max ${comU(txt(x.max))}`, comU(txt(x.d)) && `d ${comU(txt(x.d))}`])),
      txt(b.classe) && `classe ${txt(b.classe)}`,
    ]),
  }
}

function blocoClienteEBalanca(ctx: Contexto): No[] {
  const { r, p } = ctx
  const c = p?.cliente
  const ci = r.passos.chegada.clienteInformado
  const informado = !c && !!ci && (txt(ci.razaoSocial) || txt(ci.documento))
  const cliente = c
    ? nomeDoCliente(c)
    : informado
      ? `${txt(ci!.razaoSocial) || txt(ci!.documento)} (informado no local)`
      : textoConferido(ctx, CAMPOS_CONFERIR.clienteNome)
  const documento = c
    ? juntar([c.documento, c.inscricaoEstadual && `IE ${c.inscricaoEstadual}`])
    : informado
      ? txt(ci!.documento)
      : textoConferido(ctx, CAMPOS_CONFERIR.clienteDocumento)
  const endereco =
    txt(p?.folha?.localEndereco) || txt(r.passos.chegada.localEndereco) || textoConferido(ctx, CAMPOS_CONFERIR.localEndereco)
  const b = p?.balanca
  const inf = r.passos.balanca.informada
  let balanca = ''
  let capacidade = ''
  if (b) {
    balanca = identificacaoDaBalanca(b)
    capacidade = juntar([
      textoConferido(ctx, CAMPOS_CONFERIR.max) && `Max ${textoConferido(ctx, CAMPOS_CONFERIR.max)}`,
      textoConferido(ctx, CAMPOS_CONFERIR.d) && `d ${textoConferido(ctx, CAMPOS_CONFERIR.d)}`,
      textoConferido(ctx, CAMPOS_CONFERIR.e) && `e ${textoConferido(ctx, CAMPOS_CONFERIR.e)}`,
      textoConferido(ctx, CAMPOS_CONFERIR.classe) && `classe ${textoConferido(ctx, CAMPOS_CONFERIR.classe)}`,
    ])
  } else if (inf) {
    const x = resumoDaInformada(inf, txt(inf.unidade))
    balanca = x.balanca ? `${x.balanca} (informada no local)` : 'Informada no local'
    capacidade = x.capacidade
  } else {
    balanca = juntar([
      textoConferido(ctx, CAMPOS_CONFERIR.tipo),
      juntar([textoConferido(ctx, CAMPOS_CONFERIR.fabricante), textoConferido(ctx, CAMPOS_CONFERIR.modelo)], ' '),
      textoConferido(ctx, CAMPOS_CONFERIR.numeroSerie) && `nº ${textoConferido(ctx, CAMPOS_CONFERIR.numeroSerie)}`,
    ])
  }
  return [
    titulo(null, 'Cliente e balança'),
    ficha([
      { rotulo: 'Cliente', valor: cliente ? { text: cliente, font: 'InterMedio' } : '', inteira: true },
      { rotulo: 'CNPJ / CPF', valor: documento },
      { rotulo: 'Local da calibração', valor: LOCAIS[txt(r.passos.chegada.local) as keyof typeof LOCAIS] ?? '' },
      { rotulo: 'Endereço da calibração', valor: endereco, inteira: true },
      { rotulo: 'Balança', valor: balanca ? { text: balanca, font: 'InterMedio' } : '', inteira: true },
      { rotulo: 'Capacidade e divisão', valor: capacidade, inteira: true },
    ]),
  ]
}

// ---- 1. Padrões ----------------------------------------------------------------------------------------------------

function passoPadroes(ctx: Contexto): No[] {
  const itens = ctx.r.passos.padroes
  const previstos = new Map((ctx.p?.padroes?.previstos ?? []).map((x) => [x.id, x]))
  const linhas: No[][] = itens.map((x) => {
    const cad = ctx.padroes.get(txt(x.id))
    const vencido = previstos.get(txt(x.id))?.situacao === 'VENCIDO'
    return [
      {
        stack: [
          { text: ou(txt(x.identificacao) || txt(cad?.identificacao)), font: 'InterMedio' },
          ...(x.outro === true ? [{ text: 'usei outro (escolhido no local)', style: 'hora' }] : []),
        ],
      },
      ou(txt(cad?.descricao)),
      ou(txt(cad?.certificado)),
      {
        text: [ou(formatarDataBr(txt(cad?.validade))), ...(vencido ? [{ text: ' vencido', font: 'InterMedio' }] : [])],
      },
      simNao(x.levado),
      simNao(x.usado),
    ]
  })
  return [
    tituloPasso('padroes'),
    linhas.length
      ? tabela(
          [
            { titulo: 'Identificação', largura: 78 },
            { titulo: 'Descrição', largura: '*' },
            { titulo: 'Certificado nº', largura: 84 },
            { titulo: 'Próx. calibração', largura: 62, alinhamento: 'right' },
            { titulo: 'Levado', largura: 34, alinhamento: 'center' },
            { titulo: 'Usado', largura: 34, alinhamento: 'center' },
          ],
          linhas,
        )
      : nota('Nenhum padrão na lista.'),
  ]
}

// ---- 2 e 3. Chegada e identificação da balança ---------------------------------------------------------------------

function tabelaConferencias(itens: Objeto[]): NoObjeto {
  const linhas: No[][] = itens.map((x) => {
    const local: No =
      x.confere === true
        ? 'Confere'
        : x.confere === false
          ? {
              stack: [
                { text: 'Algo diferente', font: 'InterMedio' },
                ...(txt(x.observado) ? [{ text: `visto no local: ${txt(x.observado)}`, style: 'hora' }] : []),
              ],
            }
          : apagado('Não conferido')
    return [{ text: ou(txt(x.rotulo) || txt(x.campo)), style: 'rotuloLinha' }, ou(txt(x.mostrado)), local]
  })
  return tabela(
    [
      { titulo: 'Dado impresso', largura: 132 },
      { titulo: 'Como estava na folha', largura: '*' },
      { titulo: 'No local', largura: 104 },
    ],
    linhas,
  )
}

function passoChegada(ctx: Contexto): No[] {
  const { r, p } = ctx
  const ch = r.passos.chegada
  const ci = ch.clienteInformado
  const os = txt(p?.folha?.os)
  const osEscrita = txt(ch.os)
  const endereco = txt(p?.folha?.localEndereco)
  const enderecoEscrito = txt(ch.localEndereco)
  const previsto = txt(p?.folha?.tecnicoPrevisto)
  const executou = txt(r.tecnico.nome)
  const conteudo: No[] = [tituloPasso('chegada')]
  if (ch.conferencias.length) conteudo.push(tabelaConferencias(ch.conferencias))
  if (ci)
    conteudo.push(
      subtitulo('Cliente escrito no local'),
      ficha([
        { rotulo: 'Razão social ou nome', valor: txt(ci.razaoSocial), inteira: true },
        { rotulo: 'CNPJ ou CPF', valor: txt(ci.documento) },
        { rotulo: 'Contato', valor: txt(ci.contato) },
        {
          rotulo: 'Endereço do cliente',
          valor: ci.enderecoIgualAoLocal === true ? 'O mesmo do endereço da calibração' : txt(ci.endereco),
          inteira: true,
        },
        { rotulo: 'E-mail', valor: txt(ci.email), inteira: true },
      ]),
    )
  // A OS e o endereço impressos já estão na tabela dos conferidos: aqui, só os escritos no local
  const conferido = (campo: string) => !!os && ch.conferencias.some((x) => x.campo === campo)
  conteudo.push(
    ficha(
      [
        { rotulo: 'Hora de início', valor: dataHora(ch.inicio) },
        { rotulo: 'Local da calibração', valor: LOCAIS[txt(ch.local) as keyof typeof LOCAIS] ?? apagado('Não marcado') },
        {
          rotulo: 'Técnico que executou',
          valor: juntar([executou, previsto && previsto !== executou && `previsto: ${previsto}`]),
        },
        conferido(CAMPOS_CONFERIR.os)
          ? null
          : { rotulo: 'Nº da OS', valor: os || (osEscrita ? `${osEscrita} (escrito no local)` : '') },
        endereco && ch.conferencias.some((x) => x.campo === CAMPOS_CONFERIR.localEndereco)
          ? null
          : {
              rotulo: 'Endereço da calibração',
              valor: endereco || (enderecoEscrito ? `${enderecoEscrito} (escrito no local)` : ''),
              inteira: true,
            },
      ],
      [0, ch.conferencias.length || ci ? 5 : 0, 0, 0],
    ),
  )
  return conteudo
}

function passoBalanca(ctx: Contexto): No[] {
  const b = ctx.r.passos.balanca
  const conteudo: No[] = [tituloPasso('balanca', b.informada ? 'balança informada no local' : '')]
  if (b.conferencias.length) conteudo.push(tabelaConferencias(b.conferencias))
  const inf = b.informada
  if (inf) {
    const u = txt(inf.unidade)
    const classe = txt(inf.classe) as ClasseExatidao
    const comU = (v: string) => (v ? `${v}${u ? ` ${u}` : ''}` : '')
    conteudo.push(
      ficha([
        { rotulo: 'Tipo de balança', valor: txt(inf.tipo) },
        { rotulo: 'Identificação / TAG', valor: txt(inf.identificacao) },
        { rotulo: 'Fabricante (indicador)', valor: txt(inf.fabricante) },
        { rotulo: 'Modelo (indicador)', valor: txt(inf.modelo) },
        { rotulo: 'Nº de série (indicador)', valor: txt(inf.numeroSerie) },
        { rotulo: 'Ano de fabricação', valor: txt(inf.anoFabricacao) },
        { rotulo: 'Local de instalação', valor: txt(inf.localInstalacao) },
        { rotulo: 'Nº de apoios', valor: txt(inf.apoios) },
        { rotulo: 'Plataforma', valor: txt(inf.plataforma) },
        { rotulo: 'Portaria de aprovação', valor: txt(inf.portariaAprovacao) },
        { rotulo: 'Classe de exatidão', valor: classe ? (ROTULO_CLASSE[classe] ?? classe) : apagado('Não marcada') },
        { rotulo: 'Faixas', valor: TIPOS_FAIXAS[txt(inf.tipoFaixas) as TipoFaixas] ?? '' },
        { rotulo: 'Receptor de carga', valor: RECEPTORES[txt(inf.receptor) as Receptor] ?? '' },
        { rotulo: 'Unidade da indicação', valor: u },
        { rotulo: 'Carga mínima (Min)', valor: comU(txt(inf.min)) },
      ]),
    )
    const faixas = objetos(inf.faixas)
    if (faixas.length)
      conteudo.push(
        tabela(
          [
            { titulo: 'Faixa', largura: 40, alinhamento: 'center' },
            { titulo: 'Capacidade (Max)', unidade: u || undefined, largura: '*', alinhamento: 'right' },
            { titulo: 'Divisão de verificação (e)', unidade: u || undefined, largura: '*', alinhamento: 'right' },
            { titulo: 'Divisão (d)', unidade: u || undefined, largura: '*', alinhamento: 'right' },
          ],
          faixas.map((x, i) => [String(i + 1), ou(txt(x.max)), ou(txt(x.e)), ou(txt(x.d))]),
          [0, 5, 0, 0],
        ),
      )
  }
  if (!b.conferencias.length && !inf) conteudo.push(nota('Sem dados da balança no registro.'))
  return conteudo
}

// ---- 4. Ambiente ---------------------------------------------------------------------------------------------------

const instrumentos = (ctx: Contexto, ids: unknown) =>
  lista(ids)
    .map((id) => ctx.padroes.get(txt(id))?.identificacao || txt(id))
    .filter(Boolean)
    .join(', ')

function blocoAmbiente(ctx: Contexto, e: Ensaios, base: string): No[] {
  const a = e.ambiente
  const linhas: No[][] = a.linhas.map((l, i) => [
    { text: ROTULO_MOMENTO[txt(l.momento) as MomentoAmbiente] ?? ou(txt(l.momento)), font: 'InterMedio' },
    ou(horaDe(ctx, l.em, false)),
    leitura(ctx, l.temperatura, `${base}ambiente.linhas.${i}.temperatura`),
    leitura(ctx, l.umidade, `${base}ambiente.linhas.${i}.umidade`),
    leitura(ctx, l.pressao, `${base}ambiente.linhas.${i}.pressao`),
    ou(instrumentos(ctx, l.instrumentos)),
  ])
  const conteudo: No[] = [
    linhas.length
      ? tabela(
          [
            { titulo: 'Ambiente', largura: 92 },
            { titulo: 'Hora', largura: 40, alinhamento: 'center' },
            { titulo: 'Temperatura', unidade: '°C', largura: '*', alinhamento: 'right' },
            { titulo: 'Umidade', unidade: '%', largura: '*', alinhamento: 'right' },
            { titulo: 'Pressão', unidade: 'hPa', largura: '*', alinhamento: 'right' },
            { titulo: 'Instrumento usado', largura: 96 },
          ],
          linhas,
        )
      : nota('Nenhuma linha do ambiente anotada.'),
  ]
  // Classe I: a série do ΔT pesos − ar (vale a última antes do passo 5), os pesos no local e a aclimatação (ΔT0)
  const desde = dataHora(a.pesosNoLocalDesde)
  const d0 = a.deltaT0
  if (ctx.classeI || a.deltaT.length || desde || d0) {
    const limite = ctx.p?.plano?.limiteDeltaTPesos
    conteudo.push(
      subtitulo(
        `Classe I: ΔT pesos − ar${typeof limite === 'number' ? ` (até ${String(limite).replace('.', ',')} °C para começar)` : ''}`,
      ),
    )
    if (a.deltaT.length)
      conteudo.push(
        tabela(
          [
            { titulo: 'Medição', largura: 60, alinhamento: 'center' },
            { titulo: 'ΔT pesos − ar', unidade: '°C', largura: 110, alinhamento: 'right' },
            { titulo: 'Instrumento', largura: '*' },
          ],
          a.deltaT.map((m, i) => [
            `${i + 1}ª${i === a.deltaT.length - 1 && a.deltaT.length > 1 ? ' (última)' : ''}`,
            leitura(ctx, m.valor, `${base}ambiente.deltaT.${i}.valor`),
            ou(instrumentos(ctx, [m.instrumento])),
          ]),
        ),
        nota('Vale a última medição antes do passo 5.', [0, 2, 0, 0]),
      )
    conteudo.push(
      ficha(
        [
          { rotulo: 'Pesos no local desde', valor: desde },
          {
            rotulo: 'Pela aclimatação (ΔT0)',
            valor: d0
              ? juntar([
                  leituraTem(d0.origem) && `origem ${txt(objeto(d0.origem).valor)} °C`,
                  leituraTem(d0.sala) && `sala ${txt(objeto(d0.sala).valor)} °C`,
                  horaDe(ctx, d0.em, false) && `às ${horaDe(ctx, d0.em, false)}`,
                ])
              : apagado('Não usado'),
          },
        ],
        [0, 5, 0, 0],
      ),
    )
  }
  return conteudo
}

// ---- 5. Erro de indicação ------------------------------------------------------------------------------------------

function pesosDoPonto(ctx: Contexto, pt: Objeto): No {
  const pecas = lista(pt.pecas) as Parameters<typeof descreverPecas>[0]
  const zero = txt(pt.cargaPrevista) !== '' && /^[0,.\s]+$/.test(txt(pt.cargaPrevista).replace(/ /g, ' '))
  if (pt.pecasTrocadas === true)
    return {
      stack: [ou(descreverPecas(pecas, ctx.cadastro)), { text: 'peças trocadas no local', style: 'hora' }],
    }
  const doPlano = ctx.pesosDoPonto.get(txt(pt.id))
  if (doPlano) return doPlano
  if (zero && !pecas.length) return apagado('sem carga (zero)')
  return ou(descreverPecas(pecas, ctx.cadastro))
}

function celulaCarga(ctx: Contexto, pt: Objeto, caminho: string): No {
  const prevista = txt(pt.cargaPrevista)
  if (leituraTem(pt.cargaAplicada))
    return {
      stack: [
        ...(leitura(ctx, pt.cargaAplicada, caminho).stack as No[]),
        {
          text: pt.acrescentado === true ? 'acrescentado no local' : prevista ? `aplicada (prevista ${prevista})` : 'aplicada',
          style: 'hora',
        },
      ],
    }
  return {
    stack: [
      { text: ou(prevista), font: 'InterMedio' },
      ...(pt.acrescentado === true ? [{ text: 'acrescentado no local', style: 'hora' }] : []),
    ],
  }
}

function blocoIndicacao(ctx: Contexto, e: Ensaios, base: string): No[] {
  const ind = e.indicacao
  const plano = ctx.p?.plano ?? null
  const metodo = plano?.metodo
  const temSobe = ind.pontos.some((x) => leituraTem(x.crescente))
  const temDesce = ind.pontos.some((x) => leituraTem(x.decrescente))
  const sobe = metodo ? metodo !== 'DECRESCENTE' || temSobe : true
  const desce = metodo ? metodo === 'CRESCENTE_DECRESCENTE' || metodo === 'DECRESCENTE' || temDesce : temDesce
  const comSub =
    !!ind.substituicao ||
    ind.pontos.some((x) => Number(x.nivelSubstituicao) > 0) ||
    !!plano?.substituicao?.ativa ||
    !!plano?.substituicao?.sugerida
  const conteudo: No[] = []
  const cal = ind.calInterno
  conteudo.push(
    ficha(
      [
        metodo ? { rotulo: ROTULO_METODO_INDICACAO, valor: METODOS_CARREGAMENTO[metodo]?.label ?? metodo, inteira: !cal } : null,
        cal
          ? {
              rotulo: 'Ajuste interno (CAL)',
              valor:
                cal.feito === true
                  ? juntar(['Feito antes dos ensaios', horaDe(ctx, cal.em, false) && `às ${horaDe(ctx, cal.em, false)}`])
                  : cal.feito === false
                    ? 'Não feito'
                    : '',
            }
          : null,
      ],
      [0, 0, 0, 4],
      104,
    ),
  )
  const colunas: Coluna[] = [
    { titulo: 'Nº', largura: 18, alinhamento: 'center' },
    { titulo: 'Carga', unidade: unidade(ctx), largura: 74, alinhamento: 'right' },
    ...(comSub ? [{ titulo: 'Substi-\ntuições', largura: 38, alinhamento: 'center' as const }] : []),
    { titulo: comSub ? 'Pesos padrão por cima' : 'Pesos padrão', largura: '*' },
    ...(sobe ? [{ titulo: 'Indicação ↑', unidade: unidade(ctx), largura: 88, alinhamento: 'right' as const }] : []),
    ...(desce ? [{ titulo: 'Indicação ↓', unidade: unidade(ctx), largura: 88, alinhamento: 'right' as const }] : []),
  ]
  const leituras = (sobe ? 1 : 0) + (desce ? 1 : 0)
  const antes = colunas.length - leituras
  const linhas: No[][] = ind.pontos.map((pt, i) => {
    const caminho = `${base}indicacao.pontos.${txt(pt.id) || i}`
    const n = Number(pt.nivelSubstituicao)
    return [
      String(i + 1),
      celulaCarga(ctx, pt, `${caminho}.cargaAplicada`),
      ...(comSub ? [n > 0 ? String(n) : apagado(TRACO)] : []),
      pesosDoPonto(ctx, pt),
      ...(sobe ? [leitura(ctx, pt.crescente, `${caminho}.crescente`)] : []),
      ...(desce ? [leitura(ctx, pt.decrescente, `${caminho}.decrescente`)] : []),
    ]
  })
  if (!linhas.length) {
    const vazia: No[] = [{ ...apagado('Nenhum ponto anotado.'), colSpan: colunas.length, alignment: 'left' }]
    for (let i = 1; i < colunas.length; i++) vazia.push({})
    linhas.push(vazia)
  }
  // O retorno ao zero, no fim (lido uma vez só)
  const rz: No[] = [{ text: 'RETORNO AO ZERO  sem carga', style: 'rotuloLinha', colSpan: antes, alignment: 'left' }]
  for (let i = 1; i < antes; i++) rz.push({})
  if (leituras > 0) {
    rz.push({ ...leitura(ctx, ind.retornoZero, `${base}indicacao.retornoZero`), colSpan: leituras, alignment: 'right' })
    for (let i = 1; i < leituras; i++) rz.push({})
  }
  linhas.push(rz)
  conteudo.push(tabela(colunas, linhas))
  // As etapas das cargas de substituição (rodoviárias), na ordem em que foram feitas
  if (ind.substituicao) {
    const s = plano?.substituicao
    const cargaEtapa = s && s.carga > 0 ? textoDaCarga(s.carga) : ''
    conteudo.push(
      subtitulo(
        cargaEtapa
          ? `Cargas de substituição — ${cargaEtapa} ${ctx.u} de pesos padrão em cada etapa${s?.pesos ? ` (${s.pesos})` : ''}`
          : 'Cargas de substituição',
      ),
    )
    const etapas = ind.substituicao.etapas
    conteudo.push(
      etapas.length
        ? tabela(
            [
              { titulo: 'Etapa', largura: 34, alinhamento: 'center' },
              { titulo: 'Indicação com os pesos', unidade: unidade(ctx), largura: 108, alinhamento: 'right' },
              { titulo: 'Indicação com a substituição', unidade: unidade(ctx), largura: 108, alinhamento: 'right' },
              { titulo: 'Material da substituição / obs.', largura: '*' },
            ],
            etapas.map((et, i) => [
              `${i + 1}ª`,
              leitura(ctx, et.padroes, `${base}indicacao.substituicao.etapas.${i}.padroes`),
              leitura(ctx, et.substituicao, `${base}indicacao.substituicao.etapas.${i}.substituicao`),
              ou(txt(et.material)),
            ]),
          )
        : nota('Nenhuma etapa anotada.'),
    )
  }
  return conteudo
}

// ---- 6. Repetibilidade ---------------------------------------------------------------------------------------------

/** Leituras por linha da grade (como as faixas de 6 da folha impressa). */
const LEITURAS_POR_LINHA = 6

/**
 * Cada ensaio (a carga e a grade das leituras) num bloco que não se divide entre as páginas; `cabeca` (o título do
 * passo) vai junto do primeiro, para não ficar sozinho no pé da página.
 */
function blocoRepetibilidade(ctx: Contexto, e: Ensaios, base: string, cabeca: No[] = []): No[] {
  const plano = ctx.p?.plano ?? null
  const ensaios = e.repetibilidade
  if (!ensaios.length) return [...cabeca, nota('Nenhum ensaio anotado.')]
  const blocos: No[] = []
  ensaios.forEach((ens, k) => {
    const conteudo: No[] = k === 0 ? [...cabeca] : []
    blocos.push(inteiro(conteudo))
    const caminho = `${base}repetibilidade.${txt(ens.id) || k}`
    const prevista = txt(ens.cargaPrevista)
    const previstas = plano?.repetibilidade?.[k]?.leituras
    const pesos = ctx.pesosDaRepetibilidade.get(txt(ens.id)) ?? ''
    const repetidas = ens.leituras.filter((l) => objeto(l).via === 'repetir').length
    const carga: No = leituraTem(ens.cargaAplicada)
      ? leitura(ctx, ens.cargaAplicada, `${caminho}.cargaAplicada`)
      : { text: ou(prevista), font: 'InterMedio' }
    conteudo.push(
      ficha(
        [
          {
            rotulo: `${ensaios.length > 1 ? `Ensaio ${k + 1}: carga` : 'Carga'}${ctx.u ? ` (${ctx.u})` : ''}`,
            valor: {
              stack: [
                ...((objetoDe(carga).stack as No[] | undefined) ?? [carga]),
                ...(leituraTem(ens.cargaAplicada) && prevista
                  ? [{ text: `aplicada (prevista ${prevista})`, style: 'hora' }]
                  : []),
              ],
            },
          },
          { rotulo: 'Pesos padrão', valor: pesos },
          {
            rotulo: 'Leituras',
            valor: juntar([
              `${ens.leituras.filter(leituraTem).length} anotadas`,
              typeof previstas === 'number' && `${previstas} previstas`,
              repetidas > 0 && `${repetidas} pela tecla Repetir`,
            ]),
            inteira: true,
          },
        ],
        [0, k ? 8 : 0, 0, 3],
        104,
      ),
    )
    if (!ens.leituras.length) {
      conteudo.push(nota('Nenhuma leitura anotada.', [0, 0, 0, 0]))
      return
    }
    const n = ens.leituras.length
    const colunas = Math.min(LEITURAS_POR_LINHA, n)
    const linhas: No[][] = []
    for (let i = 0; i < n; i += colunas) {
      const linha: No[] = []
      for (let j = i; j < i + colunas; j++) {
        if (j >= ens.leituras.length) {
          linha.push('')
          continue
        }
        const cel = leitura(ctx, ens.leituras[j], `${caminho}.leituras.${j}`)
        linha.push({
          stack: [{ text: `${j + 1}ª`, style: 'hora', alignment: 'left' }, ...(cel.stack as No[])],
          alignment: 'right',
        })
      }
      linhas.push(linha)
    }
    conteudo.push({
      table: { widths: Array(colunas).fill('*'), body: linhas, dontBreakRows: true },
      layout: {
        ...LAYOUT_TABELA,
        fillColor: () => null,
        vLineWidth: (i: number, no: { table: { widths: unknown[] } }) => (i === 0 || i === no.table.widths.length ? 0 : 0.25),
        vLineColor: () => C.fioClaro,
      },
    })
  })
  return blocos
}

// ---- 7. Excentricidade ---------------------------------------------------------------------------------------------

function blocoExcentricidade(ctx: Contexto, e: Ensaios, base: string): No[] {
  const x = e.excentricidade
  const plano = ctx.p?.plano ?? null
  if (x.aplicavel === false || (x.aplicavel === null && !x.posicoes.some((p) => leituraTem(p.leitura))))
    return [
      ficha([
        {
          rotulo: 'Ensaio',
          valor: x.aplicavel === false ? 'Não feito' : apagado('Previsto como não aplicável; não confirmado no local'),
        },
        { rotulo: 'Por quê', valor: txt(x.motivo) },
      ]),
    ]
  const zero = ctx.classeI || x.posicoes.some((p) => leituraTem(p.zeroAntes))
  const prevista = txt(x.cargaPrevista)
  const pesos = plano?.excentricidade?.pesos ?? ''
  const conteudo: No[] = [
    ficha(
      [
        {
          rotulo: `Carga${ctx.u ? ` (${ctx.u})` : ''}`,
          valor: leituraTem(x.cargaAplicada)
            ? {
                stack: [
                  ...(leitura(ctx, x.cargaAplicada, `${base}excentricidade.cargaAplicada`).stack as No[]),
                  ...(prevista ? [{ text: `aplicada (prevista ${prevista})`, style: 'hora' }] : []),
                ],
              }
            : prevista
              ? { text: prevista, font: 'InterMedio' }
              : '',
        },
        { rotulo: 'Pesos padrão', valor: pesos },
        {
          rotulo: 'Como',
          valor: zero ? METODO_EXCENTRICIDADE_FOLHA.classeI : METODO_EXCENTRICIDADE_FOLHA.demais,
          inteira: true,
        },
      ],
      [0, 0, 0, 4],
      104,
    ),
  ]
  conteudo.push(
    x.posicoes.length
      ? tabela(
          // Larguras fixas: a grade fica compacta, com as leituras perto do nome da posição
          [
            { titulo: 'Posição', largura: 170 },
            ...(zero ? [{ titulo: 'Zero antes', unidade: unidade(ctx), largura: 110, alinhamento: 'right' as const }] : []),
            { titulo: 'Indicação', unidade: unidade(ctx), largura: 110, alinhamento: 'right' },
          ],
          x.posicoes.map((pos, i) => [
            {
              text: /^\d+$/.test(txt(pos.rotulo)) || !txt(pos.rotulo) ? `Posição ${txt(pos.rotulo) || i + 1}` : txt(pos.rotulo),
              font: 'InterMedio',
            },
            ...(zero ? [leitura(ctx, pos.zeroAntes, `${base}excentricidade.posicoes.${i}.zeroAntes`)] : []),
            leitura(ctx, pos.leitura, `${base}excentricidade.posicoes.${i}.leitura`),
          ]),
        )
      : nota('Nenhuma posição anotada.'),
  )
  return conteudo
}

// ---- 8. Assinaturas ------------------------------------------------------------------------------------------------

/** A imagem só vai para o pdfkit conferida por inteiro (`pngDecodificavel`): um PNG estragado derrubaria o servidor. */
function imagemAssinatura(png: unknown): No {
  if (typeof png === 'string' && pngDecodificavel(png))
    return { image: png, fit: [200, 58], alignment: 'left', margin: [0, 2, 0, 2] }
  return { text: 'Imagem da assinatura ilegível.', style: 'nota', margin: [0, 18, 0, 18] }
}

function passoFinal(ctx: Contexto): No[] {
  const { r, p } = ctx
  const fin = r.passos.final
  const certificado = txt(p?.folha?.numeroCertificado)
  const inicio = r.passos.chegada.inicio || r.relogio.iniciadoEm
  const termino = fin.termino || r.relogio.finalizadoEm
  const dados = ficha([
    {
      rotulo: 'Data da calibração',
      valor: { text: ou(formatarDataBr(txt(fin.dataCalibracao)) || txt(fin.dataCalibracao)), font: 'InterMedio' },
    },
    { rotulo: 'Hora de término', valor: dataHora(fin.termino) },
    certificado ? { rotulo: 'Certificado nº', valor: `${certificado} (vai na etiqueta)` } : null,
  ])
  // Técnico
  const t = r.assinaturas.tecnico
  const tecnico: No[] = [{ text: 'TÉCNICO QUE EXECUTOU', style: 'rotuloAssinatura' }]
  if (t && typeof t.png === 'string') {
    tecnico.push(
      imagemAssinatura(t.png),
      { text: ou(txt(t.nome) || txt(r.tecnico.nome)), font: 'InterMedio' },
      { text: `Assinou com o PIN em ${ou(dataHora(t.em))}`, style: 'nota', margin: [0, 1, 0, 0] },
      {
        text: `Executei as medições desta folha${dataHora(inicio) ? ` de ${dataHora(inicio)}` : ''}${dataHora(termino) ? ` a ${dataHora(termino)}` : ''}.`,
        style: 'nota',
        margin: [0, 1, 0, 0],
      },
    )
  } else tecnico.push({ text: 'Sem assinatura do técnico.', style: 'nota', margin: [0, 6, 0, 0] })
  // Cliente
  const c = r.assinaturas.cliente
  const tipo = tipoAssinaturaCliente(c as never)
  const cliente: No[] = [{ text: 'PELO CLIENTE — QUEM ACOMPANHOU', style: 'rotuloAssinatura' }]
  if (tipo === 'ASSINOU' && c) {
    const mostradas = r.correcoesPosAssinatura.filter((x) => x.mostradoAoCliente === true)
    cliente.push(
      imagemAssinatura(c.png),
      { text: juntar([ou(txt(c.nome)), txt(c.funcao)]), font: 'InterMedio' },
      { text: `Assinou em ${ou(dataHora(c.em))}`, style: 'nota', margin: [0, 1, 0, 0] },
      { text: `“${FRASE_ASSINATURA_CLIENTE}”`, style: 'nota', italics: true, margin: [0, 1, 0, 0] },
      ...mostradas.map((x) => ({
        text: `Assinatura anterior à correção de ${ou(dataHora(x.em))} (${rotuloDoCampo(ctx, txt(x.campo)) || 'ver as correções'}).`,
        style: 'nota',
        font: 'InterMedio',
        margin: [0, 2, 0, 0],
      })),
    )
  } else if (tipo === 'NAO_ASSINOU' && c)
    cliente.push(
      { text: `Cliente não assinou: ${ou(txt(c.motivo))}`, font: 'InterMedio', margin: [0, 6, 0, 0] },
      ...(dataHora(c.em) ? [{ text: `Registrado em ${dataHora(c.em)}`, style: 'nota', margin: [0, 1, 0, 0] }] : []),
    )
  else if (tipo === 'DISPENSADA')
    cliente.push({ text: 'Calibração no laboratório: sem assinatura do cliente.', font: 'InterMedio', margin: [0, 6, 0, 0] })
  else if (tipo === 'SO_NO_PAPEL')
    cliente.push({ text: 'O cliente assinou só o papel (piloto).', font: 'InterMedio', margin: [0, 6, 0, 0] })
  else cliente.push({ text: 'Sem assinatura do cliente.', style: 'nota', margin: [0, 6, 0, 0] })
  const assinaturas: NoObjeto = {
    table: { widths: ['*', '*'], body: [[{ stack: tecnico }, { stack: cliente }]], dontBreakRows: true },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => C.fio,
      vLineColor: () => C.fio,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 7,
    },
    margin: [0, 5, 0, 0],
  }
  return [inteiro([tituloPasso('final', certificado ? `etiqueta: ${certificado}` : ''), dados, assinaturas])]
}

// ---- Anotações, avisos, correções e reaberturas --------------------------------------------------------------------

function blocoAnotacoes(ctx: Contexto): No[] {
  const itens = ctx.r.anotacoes
  return [
    titulo(null, 'Anotações', 'dado impresso diferente, observações e anomalias'),
    itens.length
      ? tabela(
          [
            { titulo: 'Passo', largura: 30, alinhamento: 'center' },
            { titulo: 'Tipo', largura: 86 },
            { titulo: 'Sobre', largura: 120 },
            { titulo: 'Anotação', largura: '*' },
            { titulo: 'Hora', largura: 44, alinhamento: 'right' },
          ],
          itens.map((a) => [
            ou(txt(a.passo)),
            ROTULO_TIPO_ANOTACAO[txt(a.tipo) as keyof typeof ROTULO_TIPO_ANOTACAO] ?? ou(txt(a.tipo)),
            txt(a.campo) ? rotuloDoCampo(ctx, txt(a.campo)).replace(/^Passo \d+ · /, '') : apagado('o passo todo'),
            ou(txt(a.texto)),
            ou(horaDe(ctx, a.em, false)),
          ]),
        )
      : nota('Nenhuma anotação.'),
  ]
}

function blocoAvisos(ctx: Contexto): No[] {
  const itens = ctx.r.avisosConferidos
  return [
    titulo(null, 'Avisos vistos no local', 'e a escolha do técnico'),
    itens.length
      ? tabela(
          [
            { titulo: 'Sobre', largura: 140 },
            { titulo: 'Aviso', largura: '*' },
            { titulo: 'Tipo', largura: 80 },
            { titulo: 'O técnico', largura: 118 },
            { titulo: 'Hora', largura: 44, alinhamento: 'right' },
          ],
          itens.map((a) => [
            ou(rotuloDoCampo(ctx, txt(a.campo))),
            ou(txt(a.texto)),
            ROTULO_CLASSE_AVISO[txt(a.classe) as keyof typeof ROTULO_CLASSE_AVISO] ?? ou(txt(a.classe)),
            txt(a.motivo) ? { text: [{ text: 'Motivo: ', font: 'InterMedio' }, txt(a.motivo)] } : 'Conferi, está certo',
            ou(horaDe(ctx, a.em, false)),
          ]),
        )
      : nota('Nenhum aviso na hora.'),
  ]
}

function blocoCorrecoes(ctx: Contexto): No[] {
  const antes = ctx.r.trilha
  const depois = ctx.r.correcoesPosAssinatura
  const conteudo: No[] = [
    titulo(null, 'Correções antes de assinar', 'o valor de antes continua visível'),
    antes.length
      ? tabela(
          [
            { titulo: 'Sobre', largura: 190 },
            { titulo: 'Antes', largura: 62, alinhamento: 'right' },
            { titulo: 'Depois', largura: 62, alinhamento: 'right' },
            { titulo: 'Hora', largura: 44, alinhamento: 'right' },
            { titulo: 'Motivo', largura: '*' },
          ],
          antes.map((x) => [
            ou(rotuloDoCampo(ctx, txt(x.campo))),
            { text: valorLegivel(x.de, txt(x.campo)), decoration: 'lineThrough', color: C.secundario },
            { text: valorLegivel(x.para, txt(x.campo)), font: 'InterMedio' },
            ou(horaDe(ctx, x.em, false)),
            ou(txt(x.motivo)),
          ]),
        )
      : nota('Nenhuma correção antes de assinar.'),
    titulo(null, 'Correções depois da assinatura', 'por acréscimo, com o PIN; o valor assinado continua visível'),
    depois.length
      ? tabela(
          [
            { titulo: 'Sobre', largura: 170 },
            { titulo: 'Valor assinado', largura: 62, alinhamento: 'right' },
            { titulo: 'Corrigido para', largura: 62, alinhamento: 'right' },
            { titulo: 'Hora', largura: 44, alinhamento: 'right' },
            { titulo: 'Motivo', largura: '*' },
          ],
          depois.map((x) => [
            {
              stack: [
                ou(rotuloDoCampo(ctx, txt(x.campo))),
                ...(x.mostradoAoCliente === true
                  ? [{ text: 'estava no resumo do cliente: a assinatura dele fica anterior à correção', style: 'hora' }]
                  : []),
              ],
            },
            { text: valorLegivel(x.de, txt(x.campo)), decoration: 'lineThrough', color: C.secundario },
            { text: valorLegivel(x.para, txt(x.campo)), font: 'InterMedio' },
            ou(horaDe(ctx, x.em, false)),
            ou(txt(x.motivo)),
          ]),
        )
      : nota('Nenhuma correção depois da assinatura.'),
  ]
  const reab = ctx.r.reaberturas
  if (reab.length)
    conteudo.push(
      titulo(null, 'Reaberturas', 'as assinaturas foram apagadas e colhidas de novo'),
      tabela(
        [
          { titulo: 'Quando', largura: 90 },
          { titulo: 'Motivo', largura: '*' },
        ],
        reab.map((x) => [ou(dataHora(x.em)), ou(txt(x.motivo))]),
      ),
    )
  return conteudo
}

// ---- Anexo: tentativas recomeçadas ---------------------------------------------------------------------------------

function anexoTentativas(ctx: Contexto): No[] {
  const tentativas = ctx.r.tentativas
  if (!tentativas.length) return []
  const c = contextoDaTentativa(ctx)
  const conteudo: No[] = [
    { ...titulo(null, TITULO_ANEXO_TENTATIVAS), pageBreak: 'before' },
    nota(NOTA_ANEXO_TENTATIVAS, [0, 0, 0, 2]),
  ]
  tentativas.forEach((t, i) => {
    const base = `tentativas.${i}.`
    conteudo.push(
      faixa(
        [
          { text: `Tentativa ${txt(t.n) || i + 1}`, font: 'InterMedio' },
          ` · encerrada em ${ou(dataHora(t.encerradaEm))} · motivo: ${ou(txt(t.motivo))}`,
        ],
        [0, 10, 0, 2],
      ),
      subtitulo(`${PASSOS_FOLHA.ambiente}. ${TITULOS_PASSOS.ambiente}`),
      ...blocoAmbiente(c, t, base),
      subtitulo(`${PASSOS_FOLHA.indicacao}. ${TITULOS_PASSOS.indicacao}`),
      ...blocoIndicacao(c, t, base),
      ...blocoRepetibilidade(c, t, base, [subtitulo(`${PASSOS_FOLHA.repetibilidade}. ${TITULOS_PASSOS.repetibilidade}`)]),
      subtitulo(`${PASSOS_FOLHA.excentricidade}. ${TITULOS_PASSOS.excentricidade}`),
      ...blocoExcentricidade(c, t, base),
    )
  })
  return conteudo
}

// ---- Documento -----------------------------------------------------------------------------------------------------

/** Definição do documento do pdfmake (exportada para os testes). */
export function definicaoRegistroCampo(
  registro: RegistroCampo,
  pacote: PacoteCampo | null,
  opcoes: OpcoesPdfRegistroCampo = {},
): NoObjeto {
  const ctx = contexto(registro, pacote)
  const { r } = ctx
  const geradoEm = opcoes.geradoEm ?? new Date().toISOString()
  const data = new Date(geradoEm)
  const quando = Number.isNaN(data.getTime()) ? new Date(0) : data
  const piloto = opcoes.piloto ?? r.piloto
  const empresa = opcoes.empresa ?? EMPRESA_PADRAO
  const ensaios: Ensaios = r.passos
  const naoCompleta = r.desfecho === 'INCOMPLETA' || r.desfecho === 'NAO_CALIBRADA'
  const conteudo: No[] = [
    ...(piloto ? [faixa([{ text: 'PILOTO: ', font: 'InterMedio' }, FAIXA_PILOTO.replace(/^PILOTO: /, '')])] : []),
    ...(naoCompleta
      ? [
          faixa([
            { text: `${ROTULO_DESFECHO[r.desfecho as Desfecho]}. `, font: 'InterMedio' },
            r.motivoDesfecho ? `Motivo: ${r.motivoDesfecho}` : 'Sem motivo informado.',
            ' As leituras em branco não foram medidas.',
          ]),
        ]
      : []),
    ...blocoIdentificacao(ctx, opcoes).map((n, i) => (i === 0 ? { ...objetoDe(n), margin: [0, 2, 0, 4] } : n)),
    ...blocoClienteEBalanca(ctx),
    ...passoPadroes(ctx),
    ...passoChegada(ctx),
    ...passoBalanca(ctx),
    tituloPasso('ambiente'),
    ...blocoAmbiente(ctx, ensaios, ''),
    tituloPasso('indicacao'),
    ...blocoIndicacao(ctx, ensaios, ''),
    ...blocoRepetibilidade(ctx, ensaios, '', [tituloPasso('repetibilidade')]),
    tituloPasso('excentricidade'),
    ...blocoExcentricidade(ctx, ensaios, ''),
    ...passoFinal(ctx),
    ...blocoAnotacoes(ctx),
    ...blocoAvisos(ctx),
    ...blocoCorrecoes(ctx),
    ...anexoTentativas(ctx),
  ]
  const formulario = { codigo: txt(r.formulario.codigo), revisao: txt(r.formulario.revisao) }
  const rodape = textoRodapeRegistroCampo(r.numero, formulario, geradoEm)
  const cliente = pacote?.cliente ? nomeDoCliente(pacote.cliente) : txt(r.passos.chegada.clienteInformado?.razaoSocial)
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGEM_X, MARGEM_TOPO, MARGEM_X, MARGEM_BASE],
    language: 'pt-BR',
    displayTitle: true,
    info: {
      title: `Folha de campo ${r.numero} — preenchida no celular`,
      author: empresa.razaoSocial || empresa.nomeFantasia,
      subject: juntar(['Folha de campo de calibração de balança preenchida no celular', cliente], ' — '),
      keywords: juntar(
        [
          'folha de campo',
          r.numero,
          'preenchida no celular',
          txt(r.formulario.codigo) || FORMULARIO_FOLHA_CAMPO.codigo,
          piloto && 'piloto',
        ],
        '; ',
      ),
      creator: 'BC Calibração',
      producer: 'BC Calibração',
      creationDate: quando,
      modDate: quando,
    },
    header: cabecalho(ctx, empresa, piloto),
    footer: (): NoObjeto => ({
      text: rodape,
      fontSize: 6.6,
      color: TIMBRADO.secundario,
      margin: [MARGEM_X, BASE_RODAPE - 13 - (A4.altura - MARGEM_BASE), MARGEM_X, 0],
    }),
    background: fundoTimbrado(MARGEM_X, LARGURA),
    pageBreakBefore: quebraAntes,
    content: conteudo,
    styles: {
      rotulo: { font: 'InterMedio', fontSize: 6.8, color: C.rotulo },
      rotuloLinha: { font: 'InterMedio', fontSize: 7.4, color: C.texto },
      rotuloAssinatura: { font: 'InterMedio', fontSize: 6.6, characterSpacing: 0.4, color: COR.marcaTexto },
      cabecalhoTabela: { font: 'InterMedio', fontSize: 6.8, color: C.secundario },
      hora: { fontSize: 6.3, color: C.secundario, font: 'Inter' },
      correcao: { fontSize: 6.3, color: C.secundario, font: 'Inter' },
      nota: { fontSize: 7.2, color: C.secundario },
    },
    defaultStyle: { font: 'Inter', fontSize: 8.2, lineHeight: 1.1, color: C.texto },
  }
}

/**
 * A folha impressa assinada em PDF, a partir do registro guardado (e do pacote do envio, quando existe; um registro
 * órfão sai só com o que ele mesmo traz). Determinística com `geradoEm`.
 */
export async function gerarPdfRegistroCampo(
  registro: RegistroCampo,
  pacote: PacoteCampo | null,
  opcoes: OpcoesPdfRegistroCampo = {},
): Promise<Buffer> {
  return await pdfmake()
    .createPdf(definicaoRegistroCampo(registro, pacote, opcoes))
    .getBuffer()
}

/** Nome do arquivo para baixar: "Folha-de-campo-preenchida-FC-2026-00042.pdf". */
export const nomeArquivoRegistroCampo = (numero: string) =>
  `Folha-de-campo-preenchida-${numero || 'registro'}.pdf`.replace(/[^A-Za-z0-9._-]/g, '-')

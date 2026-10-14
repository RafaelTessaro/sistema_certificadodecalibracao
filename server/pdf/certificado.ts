// Certificado de calibração em PDF (A4 retrato), montado com o pdfmake só a partir dos dados
// congelados na emissão (DadosCertificadoPdf): gerar de novo dá o mesmo documento, byte a byte.
//
// Conteúdo segundo a ABNT NBR ISO/IEC 17025:2017 (7.8), o EURAMET cg-18 v4.0 (§8) e o DOQ-CGCRE-097,
// para laboratório NÃO acreditado: sem RBC, sem marcas do Inmetro e sem "validade"
// (docs/pesquisa/01-normas-certificado.md §3, §6 e §8). Layout em docs/pesquisa/03 §5 e 04 §5.

import { createRequire } from 'node:module'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  casasDecimais,
  emaInstrumento,
  faixaDoValor,
  faixasOrdenadas,
  formatarNumero,
  LIMIARES_EMA,
  ordemDeGrandeza,
} from '#shared/metrologia/index.ts'
import type { ResultadoCalculo, ResultadoPonto } from '#shared/metrologia/tipos.ts'
import {
  CRITERIOS_EMA,
  divisaoLegivel,
  enderecoCliente,
  FINALIDADES,
  formatarDataBr,
  LOCAIS,
  METODOS_EXCENTRICIDADE,
  numeroBr,
  RECEPTORES,
  REGRAS_DECISAO,
  resumoPesos,
  ROTULO_CLASSE,
  textoComEmpresa,
  TIPOS_BALANCA,
  TIPOS_PADRAO,
} from '#shared/dominio.ts'
import type {
  Balanca,
  Calibracao,
  EmissaoCertificado,
  EnsaioIndicacao,
  MetodoCarregamento,
  Padrao,
  Signatario,
  Unidade,
  Verificacao,
} from '#shared/tipos.ts'
import { diagramaExcentricidade, graficoErros, qrSvg, type PontoGrafico, type TrechoEma, type ValorGrafico } from './graficos.ts'
import { COR, ROTULO } from './marca.ts'
import { FONTES_TIMBRADO, LARGURA, timbrado } from './timbrado.ts'
import type { DadosCertificadoPdf } from './tipos.ts'

// ---- pdfmake (servidor) --------------------------------------------------------------------------

/** Nó do documento do pdfmake (o pacote não traz tipos). */
type No = string | NoObjeto | No[]
interface NoObjeto {
  [chave: string]: unknown
}

interface PdfMakeServidor {
  setFonts(fontes: Record<string, Record<string, string>>): void
  setUrlAccessPolicy(politica: (url: string) => boolean): void
  setLocalAccessPolicy(politica: (caminho: string) => boolean): void
  createPdf(documento: NoObjeto): { getBuffer(): Promise<Buffer> }
}

const requerer = createRequire(import.meta.url)
const PASTA_FONTES = fileURLToPath(new URL('./fontes/', import.meta.url))
const fonte = (arquivo: string) => resolve(PASTA_FONTES, arquivo)

/**
 * Inter estática no documento: Regular/SemiBold no texto; Medium/Bold nos rótulos e números. No papel
 * timbrado (timbrado.ts), o rodapé também é em Inter; o cabeçalho (palavra-marca, razão social, contatos,
 * título e nº) usa a Poppins, a geométrica do logotipo oficial.
 */
const FONTES = {
  ...FONTES_TIMBRADO,
  Inter: {
    normal: fonte('Inter-Regular.ttf'),
    bold: fonte('Inter-SemiBold.ttf'),
    italics: fonte('Inter-Italic.ttf'),
    bolditalics: fonte('Inter-SemiBold.ttf'),
  },
  InterMedio: {
    normal: fonte('Inter-Medium.ttf'),
    bold: fonte('Inter-Bold.ttf'),
    italics: fonte('Inter-Italic.ttf'),
    bolditalics: fonte('Inter-Bold.ttf'),
  },
}

let motorPdf: PdfMakeServidor | null = null
function pdfmake(): PdfMakeServidor {
  motorPdf ??= requerer('pdfmake') as PdfMakeServidor
  // O pdfmake é um objeto único no processo: fontes e políticas são reafirmadas a cada geração.
  motorPdf.setFonts(FONTES)
  motorPdf.setUrlAccessPolicy(() => false)
  motorPdf.setLocalAccessPolicy((caminho) =>
    resolve(caminho).startsWith(PASTA_FONTES.endsWith(sep) ? PASTA_FONTES : PASTA_FONTES + sep),
  )
  return motorPdf
}

// ---- Página e tipografia -------------------------------------------------------------------------

// Página A4 com 45 pt de margem lateral; margens de cima e de baixo vêm do papel timbrado (timbrado.ts)
const NUM: NoObjeto = { fontFeatures: ['tnum'] }

const ESTILOS: Record<string, NoObjeto> = {
  secao: { font: 'InterMedio', bold: true, fontSize: 8.6, color: COR.marcaTexto, characterSpacing: 0.45 },
  subsecao: { bold: true, fontSize: 8.8, color: COR.texto },
  rotulo: { ...ROTULO, lineHeight: 1.1 },
  valor: { fontSize: 8.6, lineHeight: 1.22 },
  paragrafo: { fontSize: 8.2, lineHeight: 1.34, color: COR.texto },
  th: { font: 'InterMedio', fontSize: 6.8, color: COR.textoSecundario, lineHeight: 1.12 },
  td: { fontSize: 8.1, lineHeight: 1.15 },
  nota: { fontSize: 6.9, color: COR.textoSecundario, lineHeight: 1.3 },
  declaracao: { fontSize: 7.4, lineHeight: 1.33, color: COR.texto },
}

/** Espaço mínimo (pt) que precisa sobrar abaixo de um título; menos que isso, o título vai para a próxima página. */
const ESPACO_TITULO = 120

// ---- Utilitários de texto e números ----------------------------------------------------------------

const MENOS = '\u2212'

/** Troca o hífen do sinal pelo sinal de menos tipográfico. */
const comMenos = (s: string) => s.replace(/^-/, MENOS)

/** Número com vírgula, meio-par, milhar com espaço não separável e sinal de menos tipográfico. */
const num = (v: number, casas: number) => comMenos(formatarNumero(v, casas))

/** Erro com sinal explícito: "+0,05", "−0,10", "0,00". */
function comSinal(s: string): string {
  if (!s) return ''
  if (s.startsWith('-') || s.startsWith(MENOS)) return comMenos(s)
  return /[1-9]/.test(s) ? `+${s}` : s
}

/** Texto do motor ("1 234,5", "-0,05") → número; NaN se vazio. */
function lerNumero(s: string): number {
  if (!s) return NaN
  return Number(
    s
      .replace(/[\s\u00A0\u202F]/g, '')
      .replace(MENOS, '-')
      .replace(',', '.'),
  )
}

const vazio = (s: string | null | undefined) => !s || !s.trim()
const ou = (s: string | null | undefined, alternativa = '—') => (vazio(s) ? alternativa : s!.trim())

/** Data e hora no fuso de Brasília (a empresa fica em Rio Claro/SP), independentes do fuso do servidor. */
function dataHoraBrasilia(iso: string): { data: string; hora: string } | null {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return null
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  )
  return { data: `${partes.day}/${partes.month}/${partes.year}`, hora: `${partes.hour}:${partes.minute}` }
}

const UNIDADE_EM_GRAMAS: Record<Unidade, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 }

// ---- Blocos de layout -----------------------------------------------------------------------------

function fio(cor: string = COR.fio, largura = 0.5, margem: number[] = [0, 3, 0, 7]): NoObjeto {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGURA, y2: 0, lineWidth: largura, lineColor: cor }], margin: margem }
}

/** Tira as dicas de quebra (headlineLevel) de dentro de um bloco inteiro: lá dentro elas criariam páginas em branco. */
function semDicaDeQuebra(no: unknown): void {
  if (Array.isArray(no)) {
    for (const x of no) semDicaDeQuebra(x)
    return
  }
  if (!no || typeof no !== 'object') return
  delete (no as NoObjeto).headlineLevel
  for (const v of Object.values(no)) if (v && typeof v === 'object') semDicaDeQuebra(v)
}

/**
 * Espaço antes de um título ou bloco, num nó à parte (e não como margem do título): quando o título abre
 * uma página, o espaço fica no pé da anterior, e o corpo começa sempre à mesma distância do cabeçalho.
 */
function espaco(pt: number): NoObjeto {
  return { canvas: [], margin: [0, pt, 0, 0], espacoAntes: true }
}
const ehEspaco = (no: No | undefined): no is NoObjeto =>
  !!no && typeof no === 'object' && !Array.isArray(no) && no.espacoAntes === true

/**
 * Bloco que não se divide entre páginas (precisa caber numa página). O espaço do começo vira margem do
 * bloco: o pdfmake aplica a margem antes de decidir se o bloco cabe, então ela fica na página de antes.
 */
function inteiro(conteudo: No[]): NoObjeto {
  semDicaDeQuebra(conteudo)
  const [primeiro, ...resto] = conteudo
  if (ehEspaco(primeiro)) return { stack: resto, unbreakable: true, margin: primeiro.margin }
  return { stack: conteudo, unbreakable: true }
}

/** Bloco inteiro quando pequeno; senão, divisível (com o cabeçalho das tabelas repetido). */
const bloco = (conteudo: No[], pequeno: boolean): NoObjeto => (pequeno ? inteiro(conteudo) : { stack: conteudo })

/**
 * Título de seção numerado: número e título em verde escuro, caixa alta, com um fio fino abaixo. `antes` é o
 * espaço acima dele (0 na primeira seção, que já começa à distância certa do timbrado).
 */
function secao(numero: number | string, titulo: string, minimoAbaixo = ESPACO_TITULO, antes = 17): No[] {
  return [
    ...(antes ? [espaco(antes)] : []),
    {
      text: [{ text: `${numero}`, color: COR.marca }, { text: `\u2003${titulo.toUpperCase()}` }],
      style: 'secao',
      headlineLevel: minimoAbaixo,
    },
    fio(COR.fio, 0.5, [0, 4, 0, 7]),
  ]
}

/** Título de subseção ("6.3 Erro de indicação"), com uma linha de complemento opcional logo abaixo. */
function subsecao(numero: string, titulo: string, complemento = '', minimoAbaixo = ESPACO_TITULO - 20): No[] {
  return [
    espaco(12),
    {
      text: [{ text: `${numero}\u2002`, color: COR.marcaTexto }, { text: titulo }],
      style: 'subsecao',
      headlineLevel: minimoAbaixo,
      margin: [0, 0, 0, complemento ? 1 : 5],
    },
    ...(complemento ? [{ text: complemento, style: 'nota', fontSize: 7.4, margin: [0, 0, 0, 5] }] : []),
  ]
}

interface Campo {
  rotulo: string
  valor: No
  /** Colunas da grade ocupadas (padrão 1). */
  span?: number
}

const SEM_LINHAS: NoObjeto = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 10,
  paddingTop: () => 2.5,
  paddingBottom: () => 3.5,
}

/** Grade de campos "RÓTULO / valor" (formulário técnico), em colunas iguais ou com as larguras dadas. */
function grade(linhas: Campo[][], larguras: number | Array<number | string> = 4): NoObjeto {
  const colunas = typeof larguras === 'number' ? larguras : larguras.length
  const body: No[][] = []
  for (const linha of linhas) {
    const celulas: No[] = []
    let usadas = 0
    for (const c of linha) {
      const span = Math.min(c.span ?? 1, colunas - usadas)
      if (span <= 0) break
      const valor = typeof c.valor === 'string' ? ou(c.valor) : c.valor
      celulas.push({
        colSpan: span,
        stack: [
          { text: c.rotulo.toUpperCase(), style: 'rotulo' },
          { text: valor, style: 'valor', margin: [0, 1.5, 0, 0] },
        ],
      })
      for (let i = 1; i < span; i++) celulas.push({})
      usadas += span
    }
    while (usadas < colunas) {
      celulas.push({ text: '' })
      usadas++
    }
    body.push(celulas)
  }
  return {
    table: { widths: typeof larguras === 'number' ? Array(colunas).fill('*') : larguras, body, dontBreakRows: true },
    layout: SEM_LINHAS,
  }
}

function paragrafo(texto: No, margem: number[] = [0, 2, 0, 5]): NoObjeto {
  return { text: texto, style: 'paragrafo', margin: margem }
}

/** Caixa de destaque com filete verde à esquerda (revisão, ajuste, avisos). */
function destaque(
  conteudo: No,
  cor: string = COR.marca,
  fundo: string = COR.marcaFundo,
  margem: number[] = [0, 4, 0, 6],
): NoObjeto {
  return {
    table: { widths: ['*'], body: [[conteudo]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 2.2 : 0),
      vLineColor: () => cor,
      fillColor: () => fundo,
      paddingLeft: () => 9,
      paddingRight: () => 9,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: margem,
    unbreakable: true,
  }
}

/** Layout das tabelas de medição: sem linhas verticais, cabeçalho cinza, zebra suave, fios finos. */
const LAYOUT_TABELA: NoObjeto = {
  hLineWidth: (i: number, no: { table: { body: unknown[]; headerRows?: number } }) =>
    i === 0 || i === no.table.body.length ? 0.6 : i === (no.table.headerRows ?? 1) ? 0.6 : 0.25,
  hLineColor: (i: number, no: { table: { body: unknown[]; headerRows?: number } }) =>
    i === 0 || i === no.table.body.length || i === (no.table.headerRows ?? 1) ? '#AEB4B0' : COR.fioClaro,
  vLineWidth: () => 0,
  fillColor: (linha: number, no: { table: { headerRows?: number } }) => {
    const cab = no.table.headerRows ?? 1
    if (linha < cab) return COR.fundoCabecalho
    return (linha - cab) % 2 === 1 ? COR.zebra : null
  },
  paddingLeft: (i: number) => (i === 0 ? 6 : 4),
  paddingRight: (i: number, no: { table: { widths: unknown[] } }) => (i === no.table.widths.length - 1 ? 6 : 4),
  paddingTop: () => 3.3,
  paddingBottom: () => 3,
}

type Alinhamento = 'left' | 'right' | 'center'

interface Coluna {
  titulo: No
  largura: number | string
  alinhamento?: Alinhamento
  numerica?: boolean
}

/** Tabela de medição: cabeçalho repetido ao quebrar a página, linhas que não se partem, números à direita. */
function tabela(
  colunas: Coluna[],
  linhas: No[][],
  opcoes: { pequena?: boolean; margem?: number[]; tamanho?: number } = {},
): NoObjeto {
  const cabecalho = colunas.map((c) => ({
    text: c.titulo,
    style: 'th',
    alignment: c.alinhamento ?? (c.numerica ? 'right' : 'left'),
  }))
  const corpo = linhas.map((l) =>
    l.map((celula, i) => {
      const c = colunas[i]
      const base = typeof celula === 'object' && !Array.isArray(celula) ? celula : { text: celula }
      return {
        style: 'td',
        alignment: c.alinhamento ?? (c.numerica ? 'right' : 'left'),
        ...(c.numerica ? NUM : {}),
        ...(opcoes.tamanho ? { fontSize: opcoes.tamanho } : {}),
        ...base,
      }
    }),
  )
  return {
    table: {
      headerRows: 1,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: colunas.map((c) => c.largura),
      body: [cabecalho, ...corpo],
    },
    layout: LAYOUT_TABELA,
    margin: opcoes.margem ?? [0, 2, 0, 4],
    // Tabela pequena não se divide entre páginas
    ...(opcoes.pequena ? { unbreakable: true } : {}),
  }
}

/** Título de coluna em duas linhas: grandeza e unidade (sem unidade, a 2ª linha fica vazia para alinhar). */
const th = (titulo: No, unidade?: string): No => [
  ...(Array.isArray(titulo) ? titulo : [titulo]),
  { text: unidade ? `\n(${unidade})` : '\n\u00A0', font: 'Inter', color: COR.rotulo },
]

/** νeff com o índice rebaixado. */
const NU_EFF: No = [{ text: 'ν' }, { text: 'eff', sub: true }]

/** Lista com marcadores discretos. */
function lista(itens: No[]): NoObjeto {
  return {
    ul: itens.map((t) => ({ text: t, style: 'paragrafo', margin: [0, 0, 0, 3.5] })),
    markerColor: COR.marca,
    margin: [2, 1, 0, 2],
  }
}

// ---- Contexto do certificado ---------------------------------------------------------------------

interface Contexto {
  d: DadosCertificadoPdf
  k: Calibracao
  e: EmissaoCertificado
  b: Balanca
  u: Unidade
  numero: string
  /** Divisão usada nas leituras na carga (divisão de teste, quando houver). */
  divisao: (carga: number) => number
}

function contexto(d: DadosCertificadoPdf): Contexto {
  const k = d.calibracao
  const e = d.emissao
  const b = e.balanca
  const divisaoTeste = k.opcoes.divisaoTeste
  return {
    d,
    k,
    e,
    b,
    u: b.unidade,
    numero: ou(k.numero, 'PRÉVIA'),
    divisao: (carga) => (divisaoTeste > 0 ? divisaoTeste : b.faixas.length ? faixaDoValor(carga, b).d : 0),
  }
}

/** Leitura nas casas da divisão (ou mais, se o valor tiver). */
function leitura(ctx: Contexto, valor: number, carga: number): string {
  return num(valor, Math.max(casasDecimais(ctx.divisao(carga)), casasDecimais(valor)))
}

const empresaNome = (e: EmissaoCertificado) => e.empresa.razaoSocial || e.empresa.nomeFantasia
const marcaNome = (e: EmissaoCertificado) => e.empresa.nomeFantasia || e.empresa.razaoSocial

// ---- 1. Dados da calibração -------------------------------------------------------------------------

function dataEmissao(ctx: Contexto): string {
  const pelaCalibracao = formatarDataBr(ctx.k.dataEmissao)
  return pelaCalibracao || dataHoraBrasilia(ctx.e.emitidoEm)?.data || ''
}

function secaoDadosCalibracao(ctx: Contexto, n: number): No[] {
  const { k, e } = ctx
  const local = [LOCAIS[k.local], k.localEndereco.trim()].filter(Boolean).join(' — ')
  const linhas: Campo[][] = [
    [
      { rotulo: 'Certificado nº', valor: { text: ctx.numero, bold: true } },
      { rotulo: 'Data da calibração', valor: formatarDataBr(k.dataCalibracao) },
      { rotulo: 'Data de emissão', valor: dataEmissao(ctx) },
      { rotulo: 'Ordem de serviço', valor: k.ordemServico },
    ],
    [
      { rotulo: 'Local da calibração', valor: local, span: k.dataRecebimento ? 3 : 4 },
      ...(k.dataRecebimento ? [{ rotulo: 'Recebimento do item', valor: formatarDataBr(k.dataRecebimento) }] : []),
    ],
  ]
  const procedimento: No[] = [
    { text: ou(e.textos.procedimento), bold: true },
    ...(vazio(e.textos.procedimentoDescricao) ? [] : [{ text: ` — ${e.textos.procedimentoDescricao.trim()}`, color: COR.texto }]),
  ]
  const blocos: No[] = [
    inteiro([...secao(n, 'Dados da calibração', ESPACO_TITULO, 0), grade(linhas)]),
    inteiro([
      { text: 'PROCEDIMENTO', style: 'rotulo', margin: [0, 3, 0, 1.5] },
      { text: procedimento, style: 'paragrafo' },
    ]),
  ]
  if (!vazio(e.substituiNumero)) {
    const emitido = formatarDataBr(e.substituiEmissao) || dataHoraBrasilia(e.substituiEmissao)?.data || ''
    blocos.push(
      destaque(
        {
          stack: [
            { text: 'REVISÃO DE CERTIFICADO', style: 'rotulo', color: COR.marcaTexto, margin: [0, 0, 0, 2] },
            {
              text: [
                `Este certificado substitui integralmente o Certificado nº `,
                { text: e.substituiNumero.trim(), bold: true },
                emitido ? `, emitido em ${emitido}` : '',
                ', que fica cancelado.',
                vazio(k.motivoRevisao) ? '' : ` Motivo: ${k.motivoRevisao.trim().replace(/\.?$/, '.')}`,
              ],
              style: 'paragrafo',
            },
          ],
        },
        COR.marca,
        COR.marcaFundo,
        [0, 8, 0, 2],
      ),
    )
  }
  return blocos
}

// ---- 2. Cliente --------------------------------------------------------------------------------------

function secaoCliente(ctx: Contexto, n: number): No[] {
  const c = ctx.e.cliente
  const pj = c.tipo === 'PJ'
  const nome = pj ? c.razaoSocial || c.nome : c.nome
  const fantasia = pj && c.nome && c.razaoSocial && c.nome.trim() !== c.razaoSocial.trim() ? c.nome.trim() : ''
  const contato = [c.contato, c.telefone || c.celular, c.email].filter((x) => !vazio(x)).join(' · ')
  const nomeValor: No = fantasia
    ? [
        { text: ou(nome), bold: true },
        { text: `\u2003${fantasia}`, color: COR.textoSecundario, fontSize: 7.8 },
      ]
    : { text: ou(nome), bold: true }
  return [
    inteiro([
      ...secao(n, 'Cliente'),
      grade([
        [
          { rotulo: pj ? 'Razão social' : 'Nome', valor: nomeValor, span: 3 },
          { rotulo: pj ? 'CNPJ' : 'CPF', valor: { text: ou(c.documento) } },
        ],
        [{ rotulo: 'Endereço', valor: enderecoCliente(c), span: 4 }],
        ...(contato ? [[{ rotulo: 'Contato', valor: contato, span: 4 }]] : []),
      ]),
    ]),
  ]
}

// ---- 3. Instrumento calibrado ---------------------------------------------------------------------

function divisaoTexto(valor: number, u: Unidade): string {
  const { valores, unidade } = divisaoLegivel([valor], u)
  return `${numeroBr(valores[0])} ${unidade}`
}

const SIM_NAO: Record<Verificacao, string> = { SIM: 'sim', NAO: 'não', NA: 'n/a' }
const ZERO_AUTOMATICO = { LIGADO: 'ligado', DESLIGADO: 'desligado', NAO_POSSUI: 'não possui' } as const

function secaoInstrumento(ctx: Contexto, n: number): No[] {
  const { b, k, u } = ctx
  const faixas = faixasOrdenadas(b.faixas)
  const indicador = [b.indicadorFabricante, b.indicadorModelo].filter((x) => !vazio(x)).join(' ')
  const temIndicador = !vazio(indicador) || !vazio(b.indicadorSerie)
  const receptor = [
    RECEPTORES[b.receptor] ?? b.receptor,
    vazio(b.dimensoes) ? '' : b.dimensoes.trim(),
    (b.receptor === 'APOIOS' || b.receptor === 'RODOVIARIA' || b.receptor === 'TANQUE') && b.apoios > 0
      ? `${b.apoios} apoios`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const linhas: Campo[][] = [
    [
      {
        rotulo: 'Instrumento',
        valor: { text: `Balança ${(TIPOS_BALANCA[b.tipo] ?? 'de pesagem').toLowerCase()}`, bold: true },
        span: 2,
      },
      { rotulo: 'Fabricante', valor: b.fabricante },
      { rotulo: 'Modelo', valor: b.modelo },
    ],
    [
      { rotulo: 'Nº de série', valor: { text: ou(b.numeroSerie) } },
      { rotulo: 'Identificação / TAG (*)', valor: b.identificacao },
      { rotulo: 'Ano de fabricação', valor: b.anoFabricacao },
      { rotulo: 'Unidade', valor: u },
    ],
  ]
  if (temIndicador)
    linhas.push([
      {
        rotulo: 'Indicador',
        valor: [indicador, vazio(b.indicadorSerie) ? '' : `nº de série ${b.indicadorSerie.trim()}`].filter(Boolean).join(' · '),
        span: 4,
      },
    ])

  // Características metrológicas (conforme a marcação do instrumento)
  const metrologia: No[] = []
  if (faixas.length <= 1) {
    const f = faixas[0] ?? { max: 0, e: 0, d: 0 }
    metrologia.push(
      grade(
        [
          [
            { rotulo: 'Capacidade (Max)', valor: { text: f.max ? `${numeroBr(f.max)} ${u}` : '—', bold: true } },
            { rotulo: 'Carga mínima (Min)', valor: { text: b.min ? `${numeroBr(b.min)} ${u}` : '—' } },
            { rotulo: 'Divisão (d)', valor: { text: f.d ? divisaoTexto(f.d, u) : '—', bold: true } },
            { rotulo: 'Divisão de verificação (e)', valor: { text: f.e ? divisaoTexto(f.e, u) : '—' } },
            { rotulo: 'n = Max/e', valor: { text: f.e ? numeroBr(Math.round(f.max / f.e)) : '—' } },
            { rotulo: 'Classe', valor: ROTULO_CLASSE[b.classe] },
          ],
        ],
        [76, 76, 62, 112, 56, '*'],
      ),
    )
  } else {
    const nome = b.tipoFaixas === 'MULTI_INTERVALO' ? 'Intervalo' : 'Faixa'
    metrologia.push(
      grade(
        [
          [
            {
              rotulo: 'Tipo',
              valor: b.tipoFaixas === 'MULTI_INTERVALO' ? 'Multi-intervalo' : 'Múltiplas faixas',
            },
            { rotulo: 'Carga mínima (Min)', valor: { text: b.min ? `${numeroBr(b.min)} ${u}` : '—' } },
            { rotulo: 'Classe de exatidão', valor: ROTULO_CLASSE[b.classe] },
            { rotulo: 'Unidade', valor: u },
          ],
        ],
        4,
      ),
      tabela(
        [
          { titulo: nome, largura: 60 },
          { titulo: th('Capacidade Max', u), largura: '*', numerica: true },
          { titulo: 'Divisão (d)', largura: '*', numerica: true },
          { titulo: 'Divisão de verificação (e)', largura: '*', numerica: true },
          { titulo: 'n = Max/e', largura: '*', numerica: true },
        ],
        faixas.map((f, i) => [
          `${nome} ${i + 1}`,
          numeroBr(f.max),
          divisaoTexto(f.d, u),
          divisaoTexto(f.e, u),
          f.e ? numeroBr(Math.round(f.max / f.e)) : '—',
        ]),
        { pequena: true, margem: [0, 2, 0, 6] },
      ),
    )
  }

  const outros: Campo[][] = [
    [
      { rotulo: 'Portaria de aprovação de modelo', valor: b.portariaAprovacao, span: 2 },
      { rotulo: 'Receptor de carga', valor: receptor, span: 2 },
    ],
    [
      { rotulo: 'Local de instalação (*)', valor: b.localInstalacao, span: 2 },
      { rotulo: 'Finalidade de uso (*)', valor: b.finalidade ? FINALIDADES[b.finalidade] : '', span: 2 },
    ],
  ]

  // Condição do item, ajuste e reparo
  const p = k.preliminar
  const verificacao = [
    `identificável: ${SIM_NAO[p.identificavel]}`,
    `limpo: ${SIM_NAO[p.limpa]}`,
    `nivelado: ${SIM_NAO[p.nivelada]}`,
    `aquecido / estabilizado: ${SIM_NAO[p.aquecida]}`,
    `pré-carga: ${SIM_NAO[p.preCarga]}`,
    `zero automático: ${ZERO_AUTOMATICO[p.zeroAutomatico]}`,
  ].join('  ·  ')

  const condicao: No[] = [
    { text: 'VERIFICAÇÃO PRELIMINAR', style: 'rotulo', margin: [0, 4, 0, 1.5] },
    { text: verificacao.charAt(0).toUpperCase() + verificacao.slice(1) + '.', style: 'paragrafo', margin: [0, 0, 0, 3] },
  ]

  const ajuste: No[] = []
  if (k.ajuste.realizado === 'NAO') {
    ajuste.push(
      paragrafo([
        { text: 'Ajuste: ', bold: true },
        'não foi realizado ajuste no instrumento; os resultados referem-se ao instrumento na condição em que foi encontrado.',
      ]),
    )
  } else {
    const tipo =
      k.ajuste.realizado === 'INTERNO' ? 'ajuste interno (automático) do instrumento' : 'ajuste externo, com peso padrão'
    const descricao = vazio(k.ajuste.descricao) ? '' : ` (${k.ajuste.descricao.trim().replace(/\.$/, '')})`
    const resultados = temComoEncontrado(ctx.d)
      ? 'Os resultados obtidos antes e depois do ajuste são apresentados, respectivamente, em 6.4 (“como encontrado”) e em 6.3 (“como deixado”).'
      : 'Os resultados antes do ajuste não foram medidos; os resultados deste certificado referem-se ao instrumento após o ajuste (“como deixado”).'
    ajuste.push(
      destaque(
        {
          text: [
            { text: 'Ajuste: ', bold: true },
            `antes da calibração foi realizado ${tipo}${descricao}. ${resultados} O ajuste não faz parte da calibração.`,
          ],
          style: 'paragrafo',
        },
        COR.marca,
        COR.marcaFundo,
        [0, 2, 0, 4],
      ),
    )
  }

  if (k.reparo.houve) {
    const r = k.reparo
    const partes: string[] = []
    partes.push(
      `O instrumento foi submetido a reparo/manutenção${vazio(r.descricao) ? '' : ` (${r.descricao.trim().replace(/\.$/, '')})`}`,
    )
    if (!vazio(k.ordemServico)) partes.push(` registrado(a) na Ordem de Serviço nº ${k.ordemServico.trim()}`)
    const marcas: string[] = []
    if (!vazio(r.marcaReparo)) marcas.push(`da marca de reparo nº ${r.marcaReparo.trim()}`)
    if (!vazio(r.selosColocados)) marcas.push(`das marcas de selagem nº ${r.selosColocados.trim()}`)
    if (marcas.length) partes.push(`, com afixação ${marcas.join(' e ')}`)
    if (!vazio(r.selosRetirados)) partes.push(` (retiradas: ${r.selosRetirados.trim()})`)
    const orgao =
      !ctx.e.cliente.uf || ctx.e.cliente.uf === 'SP'
        ? 'pelo órgão metrológico (IPEM-SP)'
        : 'pelo órgão metrológico competente (Inmetro/RBMLQ-I)'
    ajuste.push(
      destaque(
        {
          text: [
            { text: 'Reparo: ', bold: true },
            `${partes.join('')}. Os serviços de reparo e manutenção não fazem parte da calibração. O instrumento deve ser submetido à verificação após reparo ${orgao} antes de ser utilizado nas finalidades sujeitas ao controle metrológico legal.`,
          ],
          style: 'paragrafo',
        },
        COR.alerta,
        COR.alertaFundo,
        [0, 2, 0, 4],
      ),
    )
  }

  return [
    inteiro([...secao(n, 'Instrumento calibrado'), grade(linhas)]),
    inteiro([
      {
        text: 'CARACTERÍSTICAS METROLÓGICAS, CONFORME A MARCAÇÃO DO INSTRUMENTO',
        style: 'rotulo',
        color: COR.marcaTexto,
        margin: [0, 6, 0, 3],
      },
      ...metrologia,
      grade(outros),
    ]),
    inteiro(condicao),
    ...ajuste,
  ]
}

// ---- 4. Condições ambientais ---------------------------------------------------------------------

function secaoAmbiente(ctx: Contexto, n: number): No[] {
  const a = ctx.k.ambiente
  const par = (ini: number | null, fim: number | null, casas: number, unidade: string) => {
    if (ini === null && fim === null) return '—'
    const f = (v: number | null) => (v === null ? '—' : `${num(v, casas)} ${unidade}`)
    return `início ${f(ini)}  →  fim ${f(fim)}`
  }
  const monitoramento = ctx.e.padroes
    .filter((p) => p.tipo === 'TERMOHIGROMETRO' || p.tipo === 'BAROMETRO')
    .map((p) => p.identificacao)
    .filter(Boolean)
  return [
    inteiro([
      ...secao(n, 'Condições ambientais'),
      grade([
        [
          { rotulo: 'Temperatura', valor: { text: par(a.temperaturaInicial, a.temperaturaFinal, 1, '°C') }, span: 2 },
          { rotulo: 'Umidade relativa', valor: { text: par(a.umidadeInicial, a.umidadeFinal, 0, '%') }, span: 2 },
        ],
        ...(a.pressao !== null || monitoramento.length
          ? [
              [
                {
                  rotulo: 'Pressão atmosférica',
                  valor: { text: a.pressao !== null ? `${num(a.pressao, 0)} hPa` : '—' },
                  span: 2,
                },
                { rotulo: 'Instrumentos de monitoramento', valor: monitoramento.join(', '), span: 2 },
              ],
            ]
          : []),
      ]),
    ]),
  ]
}

// ---- 5. Padrões utilizados -------------------------------------------------------------------------

function secaoPadroes(ctx: Contexto, n: number): No[] {
  const padroes = [...ctx.e.padroes].sort((a, b) => Number(b.tipo === 'PESOS') - Number(a.tipo === 'PESOS'))
  const descricao = (p: Padrao): No => {
    const titulo = ou(p.descricao, TIPOS_PADRAO[p.tipo])
    let detalhe = ''
    if (p.tipo === 'PESOS') {
      const pecas = resumoPesos(p.pesos)
      detalhe = [pecas.length > 90 ? `${pecas.slice(0, 88).replace(/,\s*[^,]*$/, '')}…` : pecas, p.material]
        .filter((x) => !vazio(x))
        .join(' · ')
    } else {
      detalhe = [
        [p.fabricante, p.modelo].filter((x) => !vazio(x)).join(' '),
        vazio(p.numeroSerie) ? '' : `nº de série ${p.numeroSerie}`,
        p.incertezaTexto,
      ]
        .filter((x) => !vazio(x))
        .join(' · ')
    }
    return detalhe ? [{ text: titulo }, { text: `\n${detalhe}`, fontSize: 6.8, color: COR.textoSecundario }] : titulo
  }
  const laboratorio = (p: Padrao): No =>
    vazio(p.acreditacao)
      ? ou(p.laboratorio)
      : [
          { text: ou(p.laboratorio) },
          {
            text: `\nAcreditação Cgcre ${p.acreditacao.trim().replace(/^cgcre\s*/i, '')}`,
            fontSize: 6.8,
            color: COR.textoSecundario,
          },
        ]

  const linhas = padroes.map((p): No[] => [
    { text: ou(p.identificacao), bold: true },
    descricao(p),
    { text: ou(p.classe), alignment: 'center' },
    { text: ou(p.certificado) },
    laboratorio(p),
    { text: ou(formatarDataBr(p.dataCalibracao)), alignment: 'right' },
    { text: ou(formatarDataBr(p.validade)), alignment: 'right' },
  ])
  const nominais = padroes.filter((p) => p.tipo === 'PESOS' && p.uso === 'NOMINAL').map((p) => p.identificacao)
  const blocos: No[] = [
    bloco(
      [
        ...secao(n, 'Padrões utilizados'),
        tabela(
          [
            { titulo: 'Identificação', largura: 54 },
            { titulo: 'Descrição', largura: '*' },
            { titulo: 'Classe', largura: 'auto', alinhamento: 'center' },
            { titulo: 'Certificado nº', largura: 'auto' },
            { titulo: 'Calibrado por', largura: '*' },
            { titulo: 'Calibrado\nem', largura: 'auto', alinhamento: 'right' },
            { titulo: 'Próxima\ncalibração', largura: 'auto', alinhamento: 'right' },
          ],
          linhas.length
            ? linhas
            : [[{ text: 'Nenhum padrão informado.', colSpan: 7, color: COR.textoSecundario }, '', '', '', '', '', '']],
          { tamanho: 7.6 },
        ),
      ],
      linhas.length <= 8,
    ),
  ]
  if (nominais.length)
    blocos.push(
      paragrafo(
        `Os pesos padrão ${nominais.join(', ')} foram utilizados pelo valor nominal: o erro máximo admissível da classe (OIML R 111) foi considerado como contribuição para a incerteza de medição (ABNT NBR ISO/IEC 17025:2017, Anexo A, A.2.3).`,
        [0, 3, 0, 2],
      ),
    )
  if (!vazio(ctx.e.textos.rastreabilidade))
    blocos.push(paragrafo(textoComEmpresa(ctx.e.textos.rastreabilidade.trim(), ctx.e.empresa), [0, 4, 0, 2]))
  return blocos
}

// ---- 6. Resultados ---------------------------------------------------------------------------------

function repetibilidade(ctx: Contexto, abertura: No[]): No[] {
  const { u } = ctx
  const resultados = ctx.d.resultado.repetibilidade.filter((r) => r.n > 0)
  const titulo = subsecao('6.1', 'Repetibilidade')
  if (!resultados.length) return [inteiro([...abertura, ...titulo, paragrafo('Ensaio não realizado.')])]
  const linhas = resultados.map((r): No[] => {
    const ensaio = ctx.k.repetibilidade.find((x) => x.id === r.id)
    const leituras = (ensaio?.leituras ?? []).filter((l): l is number => typeof l === 'number' && Number.isFinite(l))
    const dCasas = casasDecimais(ctx.divisao(r.carga))
    const casasS = r.s > 0 ? Math.max(dCasas, 1 - ordemDeGrandeza(r.s)) : dCasas
    return [
      { text: leitura(ctx, r.carga, r.carga), bold: true },
      { text: leituras.map((l) => leitura(ctx, l, r.carga)).join('\u2003 '), ...NUM },
      String(r.n),
      num(r.media, casasS),
      { text: num(r.s, casasS), bold: true },
    ]
  })
  return [
    bloco(
      [
        ...abertura,
        ...titulo,
        tabela(
          [
            { titulo: th('Carga', u), largura: 58, numerica: true },
            { titulo: th('Indicações', u), largura: '*' },
            { titulo: th('Medições', 'n'), largura: 44, numerica: true },
            { titulo: th('Média', u), largura: 58, numerica: true },
            { titulo: th('Desvio-padrão s', u), largura: 72, numerica: true },
          ],
          linhas,
        ),
        {
          text: 's: desvio-padrão experimental de uma indicação (n − 1 graus de liberdade), com a mesma carga aplicada repetidas vezes no centro do receptor.',
          style: 'nota',
          margin: [0, 1, 0, 0],
        },
      ],
      linhas.length <= 5,
    ),
  ]
}

function excentricidade(ctx: Contexto): No[] {
  const { u, k, b } = ctx
  const ensaio = k.excentricidade
  const res = ctx.d.resultado.excentricidade
  if (!ensaio.aplicavel)
    return [
      inteiro([
        ...subsecao('6.2', 'Excentricidade'),
        paragrafo(`Ensaio não aplicável${vazio(ensaio.motivo) ? '.' : `: ${ensaio.motivo.trim().replace(/\.?$/, '.')}`}`),
      ]),
    ]
  const carga = ensaio.carga
  const casas = casasDecimais(ctx.divisao(carga))
  const comReferencia = ensaio.metodo === 3 || ensaio.metodo === 4
  const colunas: Coluna[] = [
    { titulo: th('Nº'), largura: 16, alinhamento: 'center' },
    { titulo: th('Posição'), largura: '*' },
    ...(comReferencia
      ? [{ titulo: th(ensaio.metodo === 3 ? 'Zero lido' : 'Leitura na posição 1', u), largura: 62, numerica: true }]
      : []),
    { titulo: th('Indicação', u), largura: 62, numerica: true },
    { titulo: th('Desvio ΔI', u), largura: 58, numerica: true },
  ]
  const linhas = ensaio.posicoes.map((p, i): No[] => {
    const desvio = res.desvios[i]
    const maior = i === res.posicaoMaior && res.maiorDesvio > 0
    return [
      { text: String(i + 1), color: COR.textoSecundario, ...NUM },
      { text: ou(p.rotulo, `Posição ${i + 1}`), bold: maior },
      ...(comReferencia ? [p.referencia === null ? '—' : leitura(ctx, p.referencia, carga)] : []),
      p.leitura === null ? '—' : leitura(ctx, p.leitura, carga),
      i === 0
        ? { text: 'referência', color: COR.rotulo, fontSize: 7 }
        : {
            text: desvio === null || desvio === undefined ? '—' : comSinal(num(desvio, Math.max(casas, casasDecimais(desvio)))),
            bold: maior,
          },
    ]
  })
  const maior = num(res.maiorDesvio, Math.max(casas, casasDecimais(res.maiorDesvio)))
  const resumo = paragrafo(
    [
      { text: 'Maior desvio: ', bold: true },
      { text: `|ΔI|máx = ${maior} ${u}`, bold: true },
      res.posicaoMaior > 0 && res.maiorDesvio > 0
        ? { text: `, na posição ${res.posicaoMaior + 1}`, color: COR.textoSecundario }
        : '',
    ],
    [0, 4, 0, 0],
  )
  const nota: NoObjeto = {
    text: 'ΔI: diferença entre a indicação em cada posição e a indicação na posição 1 (referência), com a mesma carga.',
    style: 'nota',
    margin: [0, 2, 0, 0],
  }
  const tab = tabela(colunas, linhas, { margem: [0, 0, 0, 0] })
  const diagrama = diagramaExcentricidade(
    b.receptor,
    ensaio.posicoes.map((p) => p.rotulo),
    res.maiorDesvio > 0 ? res.posicaoMaior : -1,
    b.apoios,
  )
  const corpo: No = diagrama
    ? {
        columns: [
          { width: '*', stack: [tab, resumo, nota] },
          {
            width: diagrama.largura,
            stack: [
              { svg: diagrama.svg, width: diagrama.largura, height: diagrama.altura, font: 'Inter' },
              { text: 'Posições vistas de cima', style: 'nota', alignment: 'center', margin: [0, 1, 0, 0] },
            ],
          },
        ],
        columnGap: 18,
      }
    : { stack: [tab, resumo, nota] }
  const descricao = `Carga de ensaio: ${leitura(ctx, carga, carga)} ${u} · método: ${METODOS_EXCENTRICIDADE[ensaio.metodo].toLowerCase()}.`
  return [bloco([...subsecao('6.2', 'Excentricidade', descricao), corpo], ensaio.posicoes.length <= 14)]
}

const DESCRICAO_METODO: Record<MetodoCarregamento, string> = {
  CRESCENTE_DECRESCENTE:
    'Carregamento: cargas crescentes até a maior carga e depois decrescentes, sem descarregar entre os pontos.',
  DESCONTINUO: 'Carregamento: cargas crescentes, com descarga entre os pontos.',
  CONTINUO: 'Carregamento: cargas crescentes, sem descarregar entre os pontos.',
  DECRESCENTE: 'Carregamento: cargas decrescentes, a partir da maior carga.',
}

interface OpcoesTabelaErros {
  conformidade: boolean
  substituicao: boolean
}

/** Linhas impressas: só os pontos com alguma indicação. */
const pontosLidos = (r: ResultadoCalculo) => r.pontos.filter((p) => p.texto.crescente !== '' || p.texto.decrescente !== '')

/** Tabela do erro de indicação (como deixado ou como encontrado). */
function tabelaErros(ctx: Contexto, r: ResultadoCalculo, ensaio: EnsaioIndicacao, o: OpcoesTabelaErros): NoObjeto {
  const { u } = ctx
  const pontos = pontosLidos(r)
  const media = ctx.k.opcoes.histerese === 'MEDIA'
  const sobe = pontos.some((p) => p.texto.crescente !== '')
  const desce = pontos.some((p) => p.texto.decrescente !== '')
  const ambos = sobe && desce
  const setaSobe = ambos ? ' ↑' : ''
  const setaDesce = ambos ? ' ↓' : ''
  const nivel = new Map(ensaio.pontos.map((p) => [p.id, p.nivelSubstituicao]))

  const colunas: Coluna[] = [{ titulo: th('Carga', u), largura: '*', numerica: true }]
  if (o.substituicao) colunas.push({ titulo: th('Subst.', 'nº'), largura: 34, numerica: true })
  const celulas: Array<(p: ResultadoPonto) => No> = []
  const erro = (t: string): No => ({ text: comSinal(t) || '—', bold: true })
  if (media) {
    if (sobe) {
      colunas.push({ titulo: th(`Indicação${setaSobe}`, u), largura: '*', numerica: true })
      celulas.push((p) => p.texto.crescente || '—')
    }
    if (desce) {
      colunas.push({ titulo: th(`Indicação${setaDesce}`, u), largura: '*', numerica: true })
      celulas.push((p) => p.texto.decrescente || '—')
    }
    colunas.push({ titulo: th(ambos ? 'Erro (média)' : 'Erro', u), largura: '*', numerica: true })
    celulas.push((p) => erro(p.texto.erroMedio))
  } else {
    if (sobe) {
      colunas.push({ titulo: th(`Indicação${setaSobe}`, u), largura: '*', numerica: true })
      celulas.push((p) => p.texto.crescente || '—')
      colunas.push({ titulo: th(`Erro${setaSobe}`, u), largura: '*', numerica: true })
      celulas.push((p) => erro(p.texto.erroCrescente))
    }
    if (desce) {
      colunas.push({ titulo: th(`Indicação${setaDesce}`, u), largura: '*', numerica: true })
      celulas.push((p) => p.texto.decrescente || '—')
      colunas.push({ titulo: th(`Erro${setaDesce}`, u), largura: '*', numerica: true })
      celulas.push((p) => erro(p.texto.erroDecrescente))
    }
  }
  colunas.push(
    { titulo: th('U', u), largura: '*', numerica: true },
    { titulo: th('k'), largura: 28, numerica: true },
    { titulo: th(NU_EFF), largura: 28, numerica: true },
  )
  if (o.conformidade)
    colunas.push(
      { titulo: th('EMA', `±${u}`), largura: '*', numerica: true },
      { titulo: th('Situação'), largura: 56, alinhamento: 'center' },
    )

  const linhas = pontos.map((p): No[] => {
    const situacao: NoObjeto =
      p.conformidade === 'CONFORME'
        ? { text: 'Conforme', color: COR.marcaTexto }
        : p.conformidade === 'NAO_CONFORME'
          ? { text: 'Não conforme', bold: true, color: COR.alerta }
          : { text: '—', color: COR.rotulo }
    return [
      { text: p.texto.referencia || p.texto.carga, bold: true },
      ...(o.substituicao ? [String(nivel.get(p.id) ?? 0)] : []),
      ...celulas.map((f) => f(p)),
      p.texto.U || '—',
      { text: p.texto.k || '—', color: COR.textoSecundario },
      { text: p.texto.nuEff || '—', color: COR.textoSecundario },
      ...(o.conformidade ? [p.texto.ema ? `±${p.texto.ema}` : '—', { ...situacao, fontSize: 7.8 }] : []),
    ]
  })
  return tabela(colunas, linhas, { pequena: linhas.length <= 8 })
}

/** Nota abaixo da tabela de erros (símbolos e convenções). */
function notaErros(ctx: Contexto, ensaio: EnsaioIndicacao, substituicao: boolean): NoObjeto {
  const media = ctx.k.opcoes.histerese === 'MEDIA'
  const ambos = ensaio.pontos.some((p) => p.crescente !== null) && ensaio.pontos.some((p) => p.decrescente !== null)
  const partes = [
    `Carga: valor de referência da carga aplicada (valor convencional dos pesos padrão${substituicao ? ', somado às cargas de substituição' : ''}).`,
    media && ambos
      ? 'Erro = média das indicações ↑ e ↓ − carga; a histerese está incluída na incerteza.'
      : 'Erro = indicação − carga.',
    'U: incerteza expandida, com o fator de abrangência k para νeff graus de liberdade efetivos (probabilidade de abrangência de aproximadamente 95 %).',
  ]
  if (ambos) partes.push('↑ carga crescente; ↓ carga decrescente.')
  if (substituicao) partes.push('Subst.: número de cargas de substituição sob os pesos padrão no ponto.')
  return { text: partes.join(' '), style: 'nota', margin: [0, 1, 0, 0] }
}

/** Pontos do gráfico com os valores como reportados (E na casa de U, U com 2 algarismos). */
function pontosGrafico(r: ResultadoCalculo, media: boolean): PontoGrafico[] {
  const valor = (erro: string, U: string): ValorGrafico | null => {
    const e = lerNumero(erro)
    const incerteza = lerNumero(U)
    return Number.isFinite(e) && Number.isFinite(incerteza) ? { erro: e, U: incerteza } : null
  }
  return pontosLidos(r).map((p) => ({
    carga: Number.isFinite(p.referencia) ? p.referencia : p.carga,
    crescente: media ? null : valor(p.texto.erroCrescente, p.texto.U),
    decrescente: media ? null : valor(p.texto.erroDecrescente, p.texto.U),
    media: media ? valor(p.texto.erroMedio, p.texto.U) : null,
  }))
}

/** Limites de EMA em degraus, exatos nas mudanças de trecho (500e/2000e na classe III) e nas faixas. */
function trechosEma(ctx: Contexto, ate: number): TrechoEma[] {
  const c = ctx.k.conformidade
  const b = ctx.b
  if (!c.solicitada || !(ate > 0)) return []
  if (c.criterio === 'CLIENTE') return c.toleranciaCliente > 0 ? [{ de: 0, ate, ema: c.toleranciaCliente }] : []
  if (!b.classe || !b.faixas.length) return []
  const [l1, l2] = LIMIARES_EMA[b.classe]
  const quebras = new Set<number>([0, ate])
  for (const f of b.faixas) for (const q of [l1 * f.e, l2 * f.e, f.max]) if (q > 0 && q < ate) quebras.add(q)
  const pontos = [...quebras].sort((a, z) => a - z)
  const trechos: TrechoEma[] = []
  for (let i = 0; i < pontos.length - 1; i++) {
    const meio = (pontos[i] + pontos[i + 1]) / 2
    const ema = emaInstrumento(meio, b, c.criterio, c.toleranciaCliente)
    if (ema === null) continue
    const ultimo = trechos[trechos.length - 1]
    if (ultimo && Math.abs(ultimo.ema - ema) < 1e-12 && Math.abs(ultimo.ate - pontos[i]) < 1e-12) ultimo.ate = pontos[i + 1]
    else trechos.push({ de: pontos[i], ate: pontos[i + 1], ema })
  }
  return trechos
}

/** Há resultado "como encontrado" (então 6.3 é o "como deixado"). */
const temComoEncontrado = (d: DadosCertificadoPdf) =>
  d.comoEncontrado !== null && d.calibracao.ajuste.realizado !== 'NAO' && pontosLidos(d.comoEncontrado).length > 0

/** Soma dos nominais das peças, na unidade da balança. */
function cargaPecas(ctx: Contexto, pecas: Calibracao['indicacao']['substituicao']['pecas']): number {
  let gramas = 0
  for (const r of pecas) {
    const padrao = ctx.e.padroes.find((p) => p.id === r.padraoId)
    const peso = padrao?.pesos.find((x) => x.id === r.pesoId)
    if (peso) gramas += peso.nominal * (r.quantidade || 1)
  }
  return Number((gramas / UNIDADE_EM_GRAMAS[ctx.u]).toPrecision(12))
}

function erroIndicacao(ctx: Contexto): No[] {
  const { k, u } = ctx
  const r = ctx.d.resultado
  const ensaio = k.indicacao
  const substituicao = ensaio.substituicao.ativa && ensaio.pontos.some((p) => p.nivelSubstituicao > 0)
  const conformidade = k.conformidade.solicitada
  const media = k.opcoes.histerese === 'MEDIA'
  const titulo = subsecao(
    '6.3',
    temComoEncontrado(ctx.d) ? 'Erro de indicação — como deixado (após o ajuste)' : 'Erro de indicação',
    DESCRICAO_METODO[ensaio.metodo],
  )
  if (!pontosLidos(r).length) return [inteiro([...titulo, paragrafo('Ensaio não realizado.')])]
  const tab = tabelaErros(ctx, r, ensaio, { conformidade, substituicao })
  const blocos: No[] = [bloco([...titulo, tab, notaErros(ctx, ensaio, substituicao)], pontosLidos(r).length <= 12)]

  if (substituicao) {
    const pesos = cargaPecas(ctx, ensaio.substituicao.pecas)
    const etapas = ensaio.substituicao.etapas.filter((e) => e.leituraPadroes !== null && e.leituraSubstituicao !== null).length
    blocos.push(
      paragrafo(
        `Cargas de substituição (EURAMET cg-18, 4.3.3): em cada etapa, a carga de pesos padrão${pesos > 0 ? ` de ${leitura(ctx, pesos, pesos)} ${u}` : ''} foi trocada por uma carga de substituição com a mesma indicação (${etapas} etapa${etapas === 1 ? '' : 's'}). A incerteza das etapas está incluída em U.`,
        [0, 5, 0, 2],
      ),
    )
  }

  // Gráfico erro × carga
  const pg = pontosGrafico(r, media)
  if (pg.some((p) => p.crescente || p.decrescente || p.media)) {
    const maxCarga = Math.max(...pg.map((p) => p.carga))
    const ema = conformidade ? trechosEma(ctx, maxCarga) : []
    blocos.push(
      inteiro([
        espaco(12),
        {
          svg: graficoErros(pg, { largura: LARGURA, altura: 158, unidade: u, ema }),
          width: LARGURA,
          height: 158,
          font: 'Inter',
          margin: [0, 0, 0, 3],
        },
        {
          text: `Erro de indicação em função da carga${media ? ' (média das cargas crescente e decrescente)' : ''}. As barras verticais representam a incerteza expandida U${ema.length ? '; as linhas tracejadas, os limites ±EMA da declaração de conformidade' : ''}.`,
          style: 'nota',
        },
      ]),
    )
  }

  if (r.erroRetornoZero !== null) {
    blocos.push(
      paragrafo(
        [
          { text: 'Retorno ao zero: ', bold: true },
          'após a retirada da carga, o instrumento indicou ',
          { text: `${leitura(ctx, r.erroRetornoZero, 0)} ${u}`, bold: true },
          '.',
        ],
        [0, 7, 0, 2],
      ),
    )
  }
  return blocos
}

function comoEncontrado(ctx: Contexto): No[] {
  const r = ctx.d.comoEncontrado
  const ensaio = ctx.k.comoEncontrado
  if (!r || !ensaio || !temComoEncontrado(ctx.d)) return []
  const substituicao = ensaio.substituicao.ativa && ensaio.pontos.some((p) => p.nivelSubstituicao > 0)
  return [
    bloco(
      [
        ...subsecao('6.4', 'Erro de indicação — como encontrado (antes do ajuste)', DESCRICAO_METODO[ensaio.metodo]),
        tabelaErros(ctx, r, ensaio, { conformidade: ctx.k.conformidade.solicitada, substituicao }),
        notaErros(ctx, ensaio, substituicao),
        {
          text: 'Resultados obtidos antes do ajuste, apresentados para que o cliente avalie o efeito sobre as pesagens anteriores. O ajuste não faz parte da calibração.',
          style: 'nota',
          margin: [0, 2, 0, 0],
        },
      ],
      pontosLidos(r).length <= 12,
    ),
  ]
}

function secaoResultados(ctx: Contexto, n: number): No[] {
  return [...repetibilidade(ctx, secao(n, 'Resultados')), ...excentricidade(ctx), ...erroIndicacao(ctx), ...comoEncontrado(ctx)]
}

// ---- 7. Declaração de conformidade ----------------------------------------------------------------

function secaoConformidade(ctx: Contexto, n: number): No[] {
  const { k, b, u } = ctx
  const c = k.conformidade
  const r = ctx.d.resultado
  const criterio = CRITERIOS_EMA[c.criterio]
  const regra = REGRAS_DECISAO[c.regra]
  const pequeno = (t: string): NoObjeto => ({ text: `\n${t}`, fontSize: 7.2, color: COR.textoSecundario })
  let especificacao: No
  if (c.criterio === 'CLIENTE') {
    const tol = num(c.toleranciaCliente, casasDecimais(c.toleranciaCliente))
    especificacao = [
      { text: `${criterio.label}: EMA de ±${tol} ${u}`, bold: true },
      pequeno('Valor informado pelo cliente, igual em toda a faixa calibrada.'),
    ]
  } else {
    const e = b.faixas.length
      ? faixasOrdenadas(b.faixas)
          .map((f) => divisaoTexto(f.e, u))
          .join(' / ')
      : ''
    const instrumento = [b.classe ? `classe ${b.classe}` : '', e ? `e = ${e}` : ''].filter(Boolean).join(', ')
    especificacao = [
      { text: criterio.label, bold: true },
      pequeno(`${criterio.descricao.replace(/\.$/, '')}${instrumento ? `; ${instrumento}` : ''}.`),
    ]
  }
  const ilac =
    c.regra === 'BANDA_GUARDA'
      ? 'Faixa de guarda w = U (ILAC-G8:09/2019, 4.2.2).'
      : 'Sem faixa de guarda, w = 0 (ILAC-G8:09/2019, 4.2.1).'
  const naoConformes = pontosLidos(r).filter((p) => p.conformidade === 'NAO_CONFORME')
  const situacao = r.conformidade
  const resultadoTexto =
    situacao === 'CONFORME'
      ? 'em todos os pontos calibrados.'
      : situacao === 'NAO_CONFORME'
        ? `no(s) ponto(s) de ${naoConformes.map((p) => `${p.texto.referencia || p.texto.carga} ${u}`).join('; ')}.`
        : 'não foi possível avaliar: não há erro máximo admissível para comparar.'
  const selo = situacao === 'CONFORME' ? 'CONFORME' : situacao === 'NAO_CONFORME' ? 'NÃO CONFORME' : 'NÃO AVALIADA'
  const corSelo = situacao === 'NAO_CONFORME' ? COR.alerta : COR.marcaTexto
  const comparados = temComoEncontrado(ctx.d) ? 'os erros de indicação “como deixado” (6.3)' : 'os erros de indicação (6.3)'
  return [
    inteiro([
      ...secao(n, 'Declaração de conformidade'),
      paragrafo(
        `Declaração solicitada pelo cliente: ${comparados} foram comparados, em cada ponto e em cada sentido de carregamento, com o erro máximo admissível (EMA) do critério abaixo, segundo a regra de decisão indicada.`,
        [0, 0, 0, 3],
      ),
      grade([
        [
          { rotulo: 'Critério', valor: especificacao, span: 2 },
          {
            rotulo: 'Regra de decisão',
            valor: [{ text: regra.label, bold: true }, pequeno(`${regra.descricao.replace(/\.$/, '')}. ${ilac}`)],
            span: 2,
          },
        ],
      ]),
      {
        table: {
          widths: ['auto', '*'],
          body: [
            [
              {
                text: selo,
                font: 'InterMedio',
                bold: true,
                fontSize: 10,
                characterSpacing: 0.5,
                color: corSelo,
                margin: [4, 1.5, 10, 1],
              },
              {
                text: [{ text: 'Resultado: ', bold: true }, `${selo.toLowerCase()} ${resultadoTexto}`],
                style: 'paragrafo',
                margin: [0, 3, 0, 0],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.8,
          vLineWidth: (i: number) => (i === 1 ? 0 : 0.8),
          hLineColor: () => corSelo,
          vLineColor: () => corSelo,
          paddingLeft: () => 6,
          paddingRight: () => 8,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        margin: [0, 4, 0, 6],
      },
      paragrafo({ text: 'Esta declaração não constitui verificação metrológica legal.', bold: true }),
    ]),
  ]
}

// ---- 8. Observações, 9. Opiniões, 10. Declarações -------------------------------------------------

function secaoObservacoes(ctx: Contexto, n: number): No[] {
  const { k, e, b, u } = ctx
  const itens: No[] = []
  if (!vazio(e.textos.observacoesPadrao)) itens.push(textoComEmpresa(e.textos.observacoesPadrao.trim(), e.empresa))
  if (!vazio(k.observacoes)) itens.push(k.observacoes.trim())

  const parcial = ctx.d.resultado.avisos.some((a) => /faixa parcial/i.test(a.mensagem))
  if (parcial) {
    const lidos = pontosLidos(ctx.d.resultado)
    const maior = Math.max(...lidos.map((p) => (Number.isFinite(p.referencia) ? p.referencia : p.carga)))
    const max = Math.max(...b.faixas.map((f) => f.max))
    itens.push(
      `Calibração em faixa parcial: a maior carga ensaiada foi ${num(maior, casasDecimais(ctx.divisao(maior)))} ${u}, abaixo da capacidade máxima do instrumento (Max = ${numeroBr(max)} ${u}). Os resultados aplicam-se somente à faixa calibrada.`,
    )
  }
  if (k.opcoes.divisaoTeste > 0)
    itens.push(
      `As leituras foram feitas com resolução aumentada (divisão de teste de ${divisaoTexto(k.opcoes.divisaoTeste, u)}): a incerteza declarada é menor que a obtida com a divisão normal do instrumento (EURAMET cg-18, 8.3).`,
    )
  const temCliente = !vazio(b.identificacao) || !vazio(b.localInstalacao) || !!b.finalidade
  if (temCliente)
    itens.push(
      'As informações identificadas com (*) foram fornecidas pelo cliente e são de sua responsabilidade; elas podem influenciar a interpretação dos resultados.',
    )
  const proxima = formatarDataBr(k.proximaCalibracao)
  if (k.proximaNoCertificado && proxima)
    itens.push([{ text: 'Data da próxima calibração informada a pedido do cliente: ' }, { text: proxima, bold: true }, '.'])
  else if (!vazio(e.textos.intervalo)) itens.push(textoComEmpresa(e.textos.intervalo.trim(), e.empresa))

  if (!itens.length) return []
  return [inteiro([...secao(n, 'Observações'), lista(itens.slice(0, 1))]), ...(itens.length > 1 ? [lista(itens.slice(1))] : [])]
}

function secaoOpinioes(ctx: Contexto, n: number): No[] {
  const texto = ctx.k.opinioes.trim()
  if (!texto) return []
  return [
    bloco(
      [
        ...secao(n, 'Opiniões e interpretações'),
        paragrafo(
          'As considerações a seguir baseiam-se nos resultados desta calibração, não fazem parte dos resultados de medição e foram emitidas por pessoal autorizado.',
          [0, 0, 0, 4],
        ),
        destaque({ text: texto, style: 'paragrafo' }, COR.grafite, COR.fundoCabecalho, [0, 0, 0, 2]),
      ],
      texto.length < 1500,
    ),
  ]
}

function secaoDeclaracoes(ctx: Contexto, n: number): No[] {
  const t = ctx.e.textos
  const textos = [t.incerteza, t.abrangencia, t.naoAcreditado, t.controleLegal, t.reproducao]
    .filter((x) => !vazio(x))
    .map((x) => textoComEmpresa(x.trim(), ctx.e.empresa))
  if (!textos.length) return []
  const itens = textos.map((x, i) => ({
    columns: [
      { text: `${i + 1}.`, width: 14, style: 'declaracao', color: COR.marcaTexto, bold: true },
      { text: x, width: '*', style: 'declaracao' },
    ],
    margin: [0, 0, 0, 4.5],
  }))
  return [inteiro([...secao(n, 'Declarações'), itens[0]]), ...itens.slice(1).map((i) => ({ ...i, unbreakable: true }))]
}

// ---- Assinaturas, autenticidade e fim ----------------------------------------------------------------

/** Assinatura digitalizada só se for PNG/JPEG de verdade (data URL com a assinatura do formato). */
function imagemAssinatura(dataUrl: string): string | null {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!m) return null
  const bytes = Buffer.from(m[2].replace(/\s/g, ''), 'base64')
  const png = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const jpeg = bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  return png || jpeg ? `data:image/${png ? 'png' : 'jpeg'};base64,${m[2].replace(/\s/g, '')}` : null
}

function assinatura(papel: string, s: Signatario, comImagem: boolean): NoObjeto {
  const imagem = comImagem ? imagemAssinatura(s.assinatura) : null
  return {
    stack: [
      { text: papel.toUpperCase(), style: 'rotulo', margin: [0, 0, 0, 2] },
      imagem ? { image: imagem, fit: [150, 40], margin: [0, 0, 0, 1] } : { text: ' ', fontSize: 30, lineHeight: 1 },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 190, y2: 0, lineWidth: 0.6, lineColor: COR.grafite }], margin: [0, 1, 0, 4] },
      { text: ou(s.nome), bold: true, fontSize: 8.6 },
      {
        text: [s.cargo, s.registro].filter((x) => !vazio(x)).join(' · ') || ' ',
        fontSize: 7.4,
        color: COR.textoSecundario,
        margin: [0, 1, 0, 0],
      },
    ],
  }
}

function blocoFinal(ctx: Contexto, comImagem: boolean): No[] {
  const { e } = ctx
  const mesmo = e.tecnico.id && e.tecnico.id === e.signatario.id
  const emissao = dataHoraBrasilia(e.emitidoEm)
  const assinaturas: NoObjeto = mesmo
    ? { columns: [assinatura('Executado e autorizado por', e.signatario, comImagem), { text: '' }], columnGap: 24 }
    : {
        columns: [assinatura('Executado por', e.tecnico, comImagem), assinatura('Autorizado por', e.signatario, comImagem)],
        columnGap: 24,
      }
  const cidade = [e.empresa.cidade, e.empresa.uf].filter((x) => !vazio(x)).join('/')
  const quando: No[] = emissao
    ? [
        {
          text: `${cidade ? `${cidade}, ` : ''}emitido em ${emissao.data}, às ${emissao.hora} (horário de Brasília).`,
          fontSize: 7.4,
          color: COR.textoSecundario,
          margin: [0, 10, 0, 0],
        },
      ]
    : []

  const url = ctx.d.urlVerificacao.trim()
  const textoAutenticidade: No[] = [
    { text: 'AUTENTICIDADE', style: 'rotulo', color: COR.marcaTexto, margin: [0, 0, 0, 4] },
    {
      text: [
        { text: 'Código de autenticidade\u2002', fontSize: 7.6, color: COR.textoSecundario },
        { text: ou(e.codigo), font: 'InterMedio', bold: true, fontSize: 12.5, characterSpacing: 0.6 },
      ],
    },
    ...(url ? [{ text: url, fontSize: 7.8, color: COR.marcaTexto, margin: [0, 4, 0, 0] }] : []),
    {
      text: `Confira a autenticidade com a ${marcaNome(e)} informando o código${url ? ' ou pelo endereço acima' : ''}.`,
      fontSize: 7.6,
      color: COR.textoSecundario,
      margin: [0, 4, 0, 0],
    },
  ]
  const TAMANHO_QR = 72
  const qr = vazio(ctx.d.qrCode) ? null : qrSvg(ctx.d.qrCode.trim(), TAMANHO_QR)
  const autenticidade: NoObjeto = {
    table: {
      widths: qr ? [TAMANHO_QR, '*'] : ['*'],
      body: [
        qr
          ? [
              { svg: qr.svg, width: qr.largura, height: qr.altura },
              { stack: textoAutenticidade, margin: [8, 9, 0, 0] },
            ]
          : [{ stack: textoAutenticidade }],
      ],
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: (i: number, no: { table: { widths: unknown[] } }) => (i === 0 || i === no.table.widths.length ? 0.6 : 0),
      hLineColor: () => COR.fio,
      vLineColor: () => COR.fio,
      paddingLeft: () => 6,
      paddingRight: () => 10,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 16, 0, 0],
  }
  return [
    inteiro([
      espaco(18),
      fio(COR.fio, 0.5, [0, 0, 0, 12]),
      assinaturas,
      ...quando,
      autenticidade,
      {
        text: `— Fim do Certificado de Calibração nº ${ctx.numero} —`,
        alignment: 'center',
        fontSize: 7.6,
        color: COR.textoSecundario,
        characterSpacing: 0.3,
        margin: [0, 16, 0, 0],
      },
    ]),
  ]
}

/** Título sozinho no pé da página vai para a próxima (headlineLevel = espaço mínimo, em pt, abaixo dele). */
function quebraAntes(no: {
  headlineLevel?: unknown
  startPosition?: { pageInnerHeight: number; verticalRatio: number }
}): boolean {
  const minimo = typeof no.headlineLevel === 'number' ? no.headlineLevel : 0
  if (!minimo || !no.startPosition) return false
  const restante = no.startPosition.pageInnerHeight * (1 - no.startPosition.verticalRatio)
  return restante < minimo
}

// ---- Documento ---------------------------------------------------------------------------------------

function dataDoDocumento(d: DadosCertificadoPdf): Date {
  const emitido = new Date(d.emissao.emitidoEm)
  if (d.emissao.emitidoEm && !Number.isNaN(emitido.getTime())) return emitido
  const calibrado = new Date(`${d.calibracao.dataCalibracao}T12:00:00Z`)
  return Number.isNaN(calibrado.getTime()) ? new Date(0) : calibrado
}

/** Definição do documento do pdfmake (exportada para testes e para a prévia). */
export function definicaoCertificado(d: DadosCertificadoPdf, opcoes: { assinaturas?: boolean } = {}): NoObjeto {
  const ctx = contexto(d)
  let n = 0
  const conteudo: No[] = [
    ...secaoDadosCalibracao(ctx, ++n),
    ...secaoCliente(ctx, ++n),
    ...secaoInstrumento(ctx, ++n),
    ...secaoAmbiente(ctx, ++n),
    ...secaoPadroes(ctx, ++n),
    ...secaoResultados(ctx, ++n),
  ]
  if (d.calibracao.conformidade.solicitada) conteudo.push(...secaoConformidade(ctx, ++n))
  const observacoes = secaoObservacoes(ctx, n + 1)
  if (observacoes.length) {
    n++
    conteudo.push(...observacoes)
  }
  const opinioes = secaoOpinioes(ctx, n + 1)
  if (opinioes.length) {
    n++
    conteudo.push(...opinioes)
  }
  conteudo.push(...secaoDeclaracoes(ctx, ++n))
  conteudo.push(...blocoFinal(ctx, opcoes.assinaturas !== false))

  const e = d.emissao
  const papel = timbrado(e.empresa, ctx.numero)
  const data = dataDoDocumento(d)
  const titulo = `Certificado de calibração nº ${ctx.numero}`
  const instrumento = [
    TIPOS_BALANCA[e.balanca.tipo] ? `Balança ${TIPOS_BALANCA[e.balanca.tipo].toLowerCase()}` : 'Balança',
    e.balanca.fabricante,
    e.balanca.modelo,
    e.balanca.numeroSerie ? `nº de série ${e.balanca.numeroSerie}` : '',
  ]
    .filter((x) => !vazio(x))
    .join(' ')
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: papel.margens,
    language: 'pt-BR',
    displayTitle: true,
    info: {
      title: titulo,
      author: empresaNome(e),
      subject: `${instrumento} — ${e.cliente.razaoSocial || e.cliente.nome}`,
      keywords: `certificado de calibração; ${ctx.numero}; ${e.codigo}`,
      creator: 'BC Calibração',
      producer: 'BC Calibração',
      creationDate: data,
      modDate: data,
    },
    // O timbrado (capa e cabeçalho corrido) é desenhado no fundo da página; o rodapé tem a paginação
    background: papel.fundo,
    footer: papel.rodape,
    ...(papel.marcaDagua(d.marcaDagua) ? { watermark: papel.marcaDagua(d.marcaDagua) } : {}),
    // Na página 1, o corpo começa abaixo do timbrado completo e do título
    content: [papel.aberturaCapa, ...conteudo],
    defaultStyle: { font: 'Inter', fontSize: 8.5, lineHeight: 1.2, color: COR.texto },
    styles: ESTILOS,
    pageBreakBefore: quebraAntes,
  }
}

/**
 * Gera o certificado de calibração em PDF. Determinístico: a data do documento é a da emissão.
 * Se a imagem de uma assinatura não puder ser desenhada, o certificado sai com a linha de assinatura.
 */
export async function gerarCertificadoPdf(d: DadosCertificadoPdf): Promise<Buffer> {
  try {
    return await pdfmake().createPdf(definicaoCertificado(d)).getBuffer()
  } catch (erro) {
    const temImagem = [d.emissao.tecnico.assinatura, d.emissao.signatario.assinatura].some((a) => !vazio(a))
    if (!temImagem) throw erro
    return pdfmake()
      .createPdf(definicaoCertificado(d, { assinaturas: false }))
      .getBuffer()
  }
}

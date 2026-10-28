// Certificado de calibração em PDF (A4 retrato), montado com o pdfmake só a partir dos dados
// congelados na emissão (DadosCertificadoPdf): gerar de novo dá o mesmo documento, byte a byte.
//
// Conteúdo segundo a ABNT NBR ISO/IEC 17025:2017 (7.8.2.1 e 7.8.4.1), o EURAMET cg-18 v4.0 (§8) e o
// DOQ-CGCRE-097, para laboratório NÃO acreditado: sem RBC, sem marcas do Inmetro e sem "validade"
// (docs/pesquisa/01-normas-certificado.md §3, §6 e §8). Layout em docs/pesquisa/03 §5 e 04 §5.
//
// Visual da 1ª versão (seções numeradas com fio, grades "RÓTULO / valor", tabelas com zebra, o desenho das
// posições da excentricidade e o gráfico do erro de indicação), em no máximo 3 páginas: só a redundância saiu
// (a verificação preliminar numa linha, e só com item "não"; uma legenda só para as tabelas dos resultados; a
// ressalva das opiniões na linha do título; a área das assinaturas baixa, com o fim colado nela). O procedimento
// (POP) sai no cabeçalho de toda página e no método. Se o certificado passaria de 3 páginas, o gráfico encolhe;
// depois os respiros apertam (o layout compacto); e, em último caso, o gráfico sai — o desenho das posições fica
// sempre (`DIAGRAMACOES`, `montarCertificado`). Com 3 páginas, a última nunca fica só com as declarações e as
// assinaturas: a montagem mede e leva para ela uma seção inteira da penúltima. Com as opções da classe I (empuxo
// pela densidade do ar medida, convecção calculada), uma frase curta embaixo do método diz a densidade do ar e a
// diferença de temperatura pesos − ar usadas (`notaEmpuxoConveccao`); sem elas, nada muda.

import {
  casasDecimais,
  densidadePesosPlausivel,
  emaInstrumento,
  faixaDoValor,
  faixasOrdenadas,
  formatarNumero,
  LIMIARES_EMA,
  ordemDeGrandeza,
} from '#shared/metrologia/index.ts'
import type { ResultadoCalculo, ResultadoPonto } from '#shared/metrologia/tipos.ts'
import { opcoesComoEncontrado } from '#shared/calibracao.ts'
import {
  calculoLegado,
  CRITERIOS_EMA,
  divisaoLegivel,
  enderecoCliente,
  enderecoEmpresa,
  FINALIDADES,
  formatarDataBr,
  LOCAIS,
  METODOS_EXCENTRICIDADE,
  numeroBr,
  parteSeparada,
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
  MetodoExcentricidade,
  Padrao,
  Signatario,
  Unidade,
} from '#shared/tipos.ts'
import { diagramaPosicoes, graficoErros, type PontoGrafico, type TrechoEma, type ValorGrafico } from './graficos.ts'
import {
  A4,
  BASE_RODAPE,
  colunasMarca,
  dataHoraBrasilia,
  fundoTimbrado,
  inteiro,
  larguraTexto,
  MODULO,
  type No,
  type NoObjeto,
  pdfmake,
  quebraAntes,
  TOPO_CABECALHO,
} from './base.ts'
import { COR, TIMBRADO } from './marca.ts'
import type { DadosCertificadoPdf } from './tipos.ts'

// ---- Página e tipografia -------------------------------------------------------------------------

const MARGEM_X = 45
/** Largura útil (≈ 178 mm). */
const LARGURA = A4.largura - 2 * MARGEM_X

const MARGEM_TOPO = TOPO_CABECALHO + MODULO + 20
/** Texto do rodapé: corpo, entrelinha e respiro entre a última linha de base e o fio de base. */
const RODAPE = { tamanho: 7, entrelinha: 9, respiro: 9 }
const NUM: NoObjeto = { fontFeatures: ['tnum'] }

/**
 * Respiros e entrelinhas do layout. O normal é o visual da 1ª versão; o compacto (o de antes, enxuto) só entra
 * quando o certificado, mesmo com o gráfico menor, passaria de 3 páginas (`montarCertificado`). Nos dois, dados
 * com 8 pt ou mais, notas e declarações com 7 pt ou mais e rótulos em versal de 6,3 pt.
 */
interface Ritmo {
  estilos: Record<string, NoObjeto>
  /** Acima do título de seção e, em volta do fio embaixo dele, antes e depois. */
  secao: { topo: number; fio: [number, number] }
  /**
   * Acima do título de subseção e embaixo da linha de complemento (ou do título, sem ela); `naLinha`: o
   * complemento na linha do título, depois dele (senão, numa linha embaixo, como na 1ª versão).
   */
  subsecao: { topo: number; base: number; naLinha: boolean }
  /** Folgas de cada linha da grade "RÓTULO / valor" (em cima e embaixo) e entre o rótulo e o valor. */
  grade: { topo: number; base: number; valor: number }
  /** Folgas das células das tabelas de medição (em cima e embaixo). */
  celula: { topo: number; base: number }
  /** Folga interna das caixas de destaque e a margem delas. */
  destaque: { folga: number; margem: number[] }
  paragrafo: number[]
  /** Entre os itens das listas e das declarações. */
  item: number
  /** Acima do gráfico e do fio das assinaturas. */
  grafico: number
  assinaturas: number
}

const ESTILOS_BASE = {
  secao: { font: 'InterMedio', bold: true, color: COR.marcaTexto, characterSpacing: 0.45 },
  subsecao: { bold: true, color: COR.texto },
  rotulo: { font: 'InterMedio', fontSize: 6.3, color: COR.rotulo, characterSpacing: 0.3, lineHeight: 1.1 },
  paragrafo: { color: COR.texto },
  th: { font: 'InterMedio', fontSize: 7, color: COR.textoSecundario },
  nota: { fontSize: 7, color: COR.textoSecundario },
  declaracao: { color: COR.texto },
}

const RITMO_NORMAL: Ritmo = {
  estilos: {
    ...ESTILOS_BASE,
    secao: { ...ESTILOS_BASE.secao, fontSize: 8.6 },
    subsecao: { ...ESTILOS_BASE.subsecao, fontSize: 8.6 },
    valor: { fontSize: 8.4, lineHeight: 1.17 },
    paragrafo: { ...ESTILOS_BASE.paragrafo, fontSize: 7.9, lineHeight: 1.28 },
    th: { ...ESTILOS_BASE.th, lineHeight: 1.1 },
    td: { fontSize: 8, lineHeight: 1.08 },
    nota: { ...ESTILOS_BASE.nota, lineHeight: 1.28 },
    declaracao: { ...ESTILOS_BASE.declaracao, fontSize: 7.1, lineHeight: 1.26 },
  },
  secao: { topo: 10, fio: [3, 5] },
  subsecao: { topo: 7, base: 2.5, naLinha: false },
  grade: { topo: 1.5, base: 2.2, valor: 1.2 },
  celula: { topo: 2.4, base: 2.1 },
  destaque: { folga: 4, margem: [0, 3.5, 0, 2.5] },
  paragrafo: [0, 2, 0, 3],
  item: 2.3,
  grafico: 9,
  assinaturas: 7,
}

const RITMO_COMPACTO: Ritmo = {
  estilos: {
    ...ESTILOS_BASE,
    secao: { ...ESTILOS_BASE.secao, fontSize: 8.2 },
    subsecao: { ...ESTILOS_BASE.subsecao, fontSize: 8.3 },
    valor: { fontSize: 8.2, lineHeight: 1.12 },
    paragrafo: { ...ESTILOS_BASE.paragrafo, fontSize: 7.6, lineHeight: 1.24 },
    th: { ...ESTILOS_BASE.th, lineHeight: 1.06 },
    td: { fontSize: 8, lineHeight: 1.04 },
    nota: { ...ESTILOS_BASE.nota, lineHeight: 1.22 },
    declaracao: { ...ESTILOS_BASE.declaracao, fontSize: 7, lineHeight: 1.16 },
  },
  secao: { topo: 7, fio: [2.5, 3.5] },
  subsecao: { topo: 5, base: 2, naLinha: true },
  grade: { topo: 1, base: 1.8, valor: 0.8 },
  celula: { topo: 2.1, base: 1.8 },
  destaque: { folga: 3.2, margem: [0, 2.5, 0, 2] },
  paragrafo: [0, 1.5, 0, 2],
  item: 1.2,
  grafico: 6,
  assinaturas: 4,
}

export const RITMOS = { normal: RITMO_NORMAL, compacto: RITMO_COMPACTO }
export type NomeRitmo = keyof typeof RITMOS

/** Espaço mínimo (pt) que precisa sobrar abaixo de um título; menos que isso, o título vai para a próxima página. */
const ESPACO_TITULO = 90

/** Número da seção dos resultados (as seções 1 a 4 saem sempre): o texto do ajuste cita as subseções. */
const N_RESULTADOS = 5

// ---- Utilitários de texto e números ----------------------------------------------------------------

const MENOS = '−'

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

const vazio = (s: string | null | undefined) => !s || !s.trim()
const ou = (s: string | null | undefined, alternativa = '—') => (vazio(s) ? alternativa : s!.trim())
/** Frase terminada em ponto final (sem dobrar o ponto). */
const comPonto = (s: string) => s.trim().replace(/\.?$/, '.')

const UNIDADE_EM_GRAMAS: Record<Unidade, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 }

// ---- Blocos de layout -----------------------------------------------------------------------------

function fio(cor: string = COR.fio, largura = 0.5, margem: number[] = [0, 3, 0, 6]): NoObjeto {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGURA, y2: 0, lineWidth: largura, lineColor: cor }], margin: margem }
}

/** Bloco inteiro quando pequeno; senão, divisível (com o cabeçalho das tabelas repetido). */
const bloco = (conteudo: No[], pequeno: boolean): NoObjeto => (pequeno ? inteiro(conteudo) : { stack: conteudo })

/**
 * Título de seção numerado: número e título em verde escuro, caixa alta, com um fio fino abaixo. `complemento`:
 * nota curta na mesma linha, depois do título (sem linha a mais).
 */
function secao(r: Ritmo, numero: number | string, titulo: string, espaco = ESPACO_TITULO, complemento = ''): No[] {
  return [
    {
      text: [
        { text: `${numero}`, color: COR.marca },
        // Com o complemento na linha, o espaço menor depois do número (a linha toda cabe na largura)
        { text: `${complemento ? ' ' : ' '}${titulo.toUpperCase()}` },
        ...(complemento
          ? [
              {
                text: `  ${complemento}`,
                font: 'Inter',
                bold: false,
                fontSize: 7,
                characterSpacing: 0,
                color: COR.textoSecundario,
              },
            ]
          : []),
      ],
      style: 'secao',
      headlineLevel: espaco,
      margin: [0, r.secao.topo, 0, 0],
    },
    fio(COR.fio, 0.5, [0, r.secao.fio[0], 0, r.secao.fio[1]]),
  ]
}

/** Título de subseção ("5.3 Erro de indicação"), com um complemento opcional embaixo (ou na linha dele). */
function subsecao(r: Ritmo, numero: string, titulo: string, complemento: No = '', espaco = ESPACO_TITULO - 20): No[] {
  const naLinha = !!complemento && r.subsecao.naLinha
  return [
    {
      text: [
        { text: `${numero} `, color: COR.marcaTexto },
        { text: titulo },
        ...(naLinha ? [{ text: ' ' }, { text: complemento, style: 'nota', bold: false }] : []),
      ],
      style: 'subsecao',
      headlineLevel: espaco,
      margin: [0, r.subsecao.topo, 0, complemento && !naLinha ? 0.5 : r.subsecao.base],
    },
    ...(complemento && !naLinha ? [{ text: complemento, style: 'nota', margin: [0, 0, 0, r.subsecao.base] }] : []),
  ]
}

interface Campo {
  rotulo: string
  valor: No
  /** Colunas da grade ocupadas (padrão 1). */
  span?: number
}

/** Grade de campos "RÓTULO / valor" (formulário técnico), em colunas iguais ou com as larguras dadas. */
function grade(r: Ritmo, linhas: Campo[][], larguras: number | Array<number | string> = 4): NoObjeto {
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
          { text: valor, style: 'valor', margin: [0, r.grade.valor, 0, 0] },
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
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 8,
      paddingTop: () => r.grade.topo,
      paddingBottom: () => r.grade.base,
    },
  }
}

function paragrafo(r: Ritmo, texto: No, margem: number[] = r.paragrafo): NoObjeto {
  return { text: texto, style: 'paragrafo', margin: margem }
}

/** Caixa de destaque com filete à esquerda (revisão, ajuste, reparo, opiniões). */
function destaque(
  r: Ritmo,
  conteudo: No,
  cor: string = COR.marca,
  fundo: string = COR.marcaFundo,
  margem: number[] = r.destaque.margem,
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
      paddingTop: () => r.destaque.folga,
      paddingBottom: () => r.destaque.folga,
    },
    margin: margem,
    unbreakable: true,
  }
}

/** Layout das tabelas de medição: sem linhas verticais, cabeçalho cinza, zebra suave, fios finos. */
const layoutTabela = (r: Ritmo): NoObjeto => ({
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
  paddingTop: () => r.celula.topo,
  paddingBottom: () => r.celula.base,
})

type Alinhamento = 'left' | 'right' | 'center'

interface Coluna {
  titulo: No
  largura: number | string
  alinhamento?: Alinhamento
  numerica?: boolean
}

/** Tabela de medição: cabeçalho repetido ao quebrar a página, linhas que não se partem, números à direita. */
function tabela(
  r: Ritmo,
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
    layout: layoutTabela(r),
    margin: opcoes.margem ?? [0, 2, 0, 2],
    // Tabela pequena não se divide entre páginas
    ...(opcoes.pequena ? { unbreakable: true } : {}),
  }
}

/** Título de coluna em duas linhas: grandeza e unidade (sem unidade, a 2ª linha fica vazia para alinhar). */
const th = (titulo: No, unidade?: string): No => [
  ...(Array.isArray(titulo) ? titulo : [titulo]),
  { text: unidade ? `\n(${unidade})` : '\n ', font: 'Inter', color: COR.rotulo },
]

/** νeff com o índice rebaixado. */
const NU_EFF: No = [{ text: 'ν' }, { text: 'eff', sub: true }]

/** Lista com marcadores discretos. */
function lista(r: Ritmo, itens: No[]): NoObjeto {
  return {
    ul: itens.map((t) => ({ text: t, style: 'paragrafo', margin: [0, 0, 0, r.item] })),
    markerColor: COR.marca,
    margin: [2, 1, 0, 1],
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
  /** Respiros do layout (normal ou compacto). */
  r: Ritmo
}

function contexto(d: DadosCertificadoPdf, ritmo: NomeRitmo = 'normal'): Contexto {
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
    r: RITMOS[ritmo],
  }
}

/** Leitura nas casas da divisão (ou mais, se o valor tiver). */
function leitura(ctx: Contexto, valor: number, carga: number): string {
  return num(valor, Math.max(casasDecimais(ctx.divisao(carga)), casasDecimais(valor)))
}

const empresaNome = (e: EmissaoCertificado) => e.empresa.razaoSocial || e.empresa.nomeFantasia

/** Código do procedimento (POP) da emissão, ou '' (certificados emitidos sem ele). */
const procedimento = (e: EmissaoCertificado) => (e.textos.procedimento ?? '').trim()

// ---- 1. Dados da calibração (local, ambiente e método) e 2. Cliente -------------------------------------------

function dataEmissao(ctx: Contexto): string {
  const pelaCalibracao = formatarDataBr(ctx.k.dataEmissao)
  return pelaCalibracao || dataHoraBrasilia(ctx.e.emitidoEm)?.data || ''
}

/** Condições ambientais (início e fim), numa linha da grade. */
function linhaAmbiente(ctx: Contexto): Campo[] {
  const a = ctx.k.ambiente
  const par = (ini: number | null, fim: number | null, casas: number, unidade: string) => {
    if (ini === null && fim === null) return '—'
    const f = (v: number | null) => (v === null ? '—' : `${num(v, casas)} ${unidade}`)
    return `${f(ini)}  →  ${f(fim)}`
  }
  const monitoramento = ctx.e.padroes
    .filter((p) => p.tipo === 'TERMOHIGROMETRO' || p.tipo === 'BAROMETRO')
    .map((p) => p.identificacao)
    .filter(Boolean)
  // A pressão só com o barômetro que a mediu entre os padrões (valor rastreável; a emissão confere os dois)
  const comBarometro = ctx.e.padroes.some((p) => p.tipo === 'BAROMETRO')
  return [
    { rotulo: 'Temperatura (início → fim)', valor: { text: par(a.temperaturaInicial, a.temperaturaFinal, 1, '°C') } },
    { rotulo: 'Umidade relativa (início → fim)', valor: { text: par(a.umidadeInicial, a.umidadeFinal, 0, '%') } },
    {
      rotulo: 'Pressão atmosférica',
      valor: { text: a.pressao !== null && comBarometro ? `${num(a.pressao, 0)} hPa` : '—' },
    },
    { rotulo: 'Monitoramento ambiental', valor: monitoramento.join(', ') },
  ]
}

/**
 * O método (POP) e, embaixo, em letra menor, como o empuxo e a convecção entraram no cálculo (classe I). Sem a
 * nota, o mesmo valor de sempre.
 */
function valorMetodo(metodo: NoObjeto[], nota: string | null): No {
  if (!nota) return metodo.length ? metodo : '—'
  return [...(metodo.length ? metodo : [{ text: '—' }]), { text: `\n${nota}`, fontSize: 7, color: COR.textoSecundario }]
}

/**
 * Como o empuxo do ar e a convecção dos pesos entraram no cálculo (as opções da classe I), numa frase curta
 * embaixo do método: a densidade do ar calculada e a dos pesos (empuxo pela densidade do ar medida, cg-18 7.1.2-4
 * e A1.1-1) e a diferença de temperatura pesos − ar da convecção (cg-18 7.1.2.4). Com algum resultado impresso
 * sem ajuste logo antes (o "como encontrado", ou o final sem ajuste), também a variação de temperatura do local
 * que a incerteza da densidade do ar considera (cg-18 A3-2; como o H1.1 pede para a 5e). Sem essas opções, null:
 * os certificados das outras classes (e os de antes) ficam como estavam.
 */
export function notaEmpuxoConveccao(ctx: Pick<Contexto, 'd' | 'k' | 'e'>): string | null {
  const { k } = ctx
  const frases: string[] = []
  const ar = ctx.d.resultado.ar
  // A densidade dos pesos só quando cada jogo usado nas cargas a tem no cadastro (com u(ρ) e na faixa dos pesos);
  // sem ela o cálculo usa ρc = 8 000 kg/m³ e a emissão fica bloqueada (pendência do cálculo), mas a prévia não mente
  const usados = new Set(
    [k.indicacao, k.comoEncontrado]
      .flatMap((x) => (x ? [...x.pontos.flatMap((p) => p.pecas), ...x.substituicao.pecas] : []))
      .map((x) => x.padraoId),
  )
  const jogos = ctx.e.padroes.filter((p) => p.tipo === 'PESOS' && (!usados.size || usados.has(p.id)))
  const cadastradas =
    jogos.length > 0 &&
    jogos.every((p) => (p.densidade ?? 0) > 0 && densidadePesosPlausivel(p.densidade) && (p.incertezaDensidade ?? 0) > 0)
  const densidades = [...new Set(jogos.map((p) => p.densidade))]
  const pesos = !cadastradas
    ? ''
    : densidades.length === 1
      ? `, e a densidade dos pesos de ${numeroBr(densidades[0])} kg/m³`
      : ', e a densidade de cada jogo de pesos'
  // Classe I com "ajustada logo antes" no ensaio final: só o "como encontrado" vai pela densidade do ar medida
  // (`opcoesComoEncontrado`; o certificado de antes do cálculo da classe I, não)
  const arAntes = ctx.d.comoEncontrado?.ar ?? null
  const soAntes =
    k.opcoes.empuxo !== 'MEDIDO' &&
    temComoEncontrado(ctx.d) &&
    !calculoLegado(k) &&
    opcoesComoEncontrado(k.opcoes, ctx.e.balanca.classe).empuxo === 'MEDIDO' &&
    !!arAntes
  if (soAntes) {
    const deltaT = k.opcoes.deltaTLocal > 0 ? k.opcoes.deltaTLocal : 10
    frases.push(
      `No “como encontrado”, empuxo do ar corrigido com a densidade do ar de ${num(arAntes.densidade, 3)} kg/m³, calculada pela temperatura, umidade e pressão medidas${pesos}; a incerteza dela considera uma variação de temperatura de ${numeroBr(deltaT)} K no local de uso (EURAMET cg-18, 7.1.2-4, A1.1-1 e A3-2).`,
    )
  }
  if (k.opcoes.empuxo === 'MEDIDO' && ar) {
    frases.push(
      `Empuxo do ar corrigido com a densidade do ar de ${num(ar.densidade, 3)} kg/m³, calculada pela temperatura, umidade e pressão medidas${pesos} (EURAMET cg-18, 7.1.2-4 e A1.1-1).`,
    )
    // Situação A (sem ajuste logo antes): o final, quando não houve ajuste, ou só o "como encontrado" impresso
    const semAjuste = k.ajuste.realizado === 'NAO'
    if (semAjuste || temComoEncontrado(ctx.d)) {
      const deltaT = k.opcoes.deltaTLocal > 0 ? k.opcoes.deltaTLocal : 10
      frases.push(
        `${semAjuste ? 'A' : 'No “como encontrado”, a'} incerteza da densidade do ar considera uma variação de temperatura de ${numeroBr(deltaT)} K no local de uso (cg-18, A3-2).`,
      )
    }
  }
  if ((k.opcoes.conveccao ?? 'NAO_CONSIDERAR') === 'CALCULAR') {
    const dt = k.ambiente.deltaTPesos ?? null
    const acl = k.ambiente.aclimatacao ?? null
    if (dt !== null)
      frases.push(
        `Convecção dos pesos incluída na incerteza, com a diferença de temperatura pesos − ar medida de ${num(Math.abs(dt), 1)} °C (cg-18, 7.1.2.4 e Tabela F2.1).`,
      )
    else if (acl)
      frases.push(
        `Convecção dos pesos incluída na incerteza, com a diferença de temperatura estimada pela aclimatação de ${numeroBr(acl.minutos)} min a partir de ${num(Math.abs(acl.deltaT0), 1)} °C (cg-18, Tabelas F1.3 e F2.1).`,
      )
  }
  return frases.length ? frases.join(' ') : null
}

function secaoDadosCalibracao(ctx: Contexto, n: number): No[] {
  const { k, e } = ctx
  const local = [LOCAIS[k.local], k.localEndereco.trim()].filter(Boolean).join(' — ')
  // O código do POP em negrito e a descrição curta; sem POP registrado, só a descrição
  const descricaoMetodo = (e.textos.procedimentoDescricao ?? '').trim()
  const metodo: NoObjeto[] = [
    ...(procedimento(e) ? [{ text: procedimento(e), bold: true }] : []),
    ...(procedimento(e) && descricaoMetodo ? [{ text: ' — ' }] : []),
    ...(descricaoMetodo ? [{ text: descricaoMetodo }] : []),
  ]
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
    linhaAmbiente(ctx),
    [{ rotulo: 'Método — procedimento (POP)', valor: valorMetodo(metodo, notaEmpuxoConveccao(ctx)), span: 4 }],
  ]
  const blocos: No[] = [inteiro([...secao(ctx.r, n, 'Dados da calibração'), grade(ctx.r, linhas)])]
  if (!vazio(e.substituiNumero)) {
    const emitido = formatarDataBr(e.substituiEmissao) || dataHoraBrasilia(e.substituiEmissao)?.data || ''
    blocos.push(
      destaque(ctx.r, {
        text: [
          { text: 'Revisão: ', bold: true },
          `este certificado substitui integralmente o Certificado nº `,
          { text: e.substituiNumero.trim(), bold: true },
          emitido ? `, emitido em ${emitido}` : '',
          ', que fica cancelado.',
          vazio(k.motivoRevisao) ? '' : ` Motivo: ${comPonto(k.motivoRevisao)}`,
        ],
        style: 'paragrafo',
      }),
    )
  }
  return blocos
}

/** Nome comparável: sem acentos, pontuação, caixa e o tipo da sociedade ("Ltda.", "ME", "S/A"…). */
const nomeComparavel = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(ltda|me|epp|eireli|s ?a|cia)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function secaoCliente(ctx: Contexto, n: number): No[] {
  const c = ctx.e.cliente
  const pj = c.tipo === 'PJ'
  const nome = pj ? c.razaoSocial || c.nome : c.nome
  // O nome fantasia ao lado da razão social só quando diz outra coisa (não a mesma razão social sem o "Ltda.")
  const fantasia =
    pj && !vazio(c.nome) && !vazio(c.razaoSocial) && nomeComparavel(c.nome) !== nomeComparavel(c.razaoSocial) ? c.nome.trim() : ''
  const contato = [c.contato, c.telefone || c.celular, c.email].filter((x) => !vazio(x)).join(' · ')
  const nomeValor: No = fantasia
    ? [
        { text: ou(nome), bold: true },
        { text: `\u2003${fantasia}`, color: COR.textoSecundario, fontSize: 7.8 },
      ]
    : { text: ou(nome), bold: true }
  return [
    inteiro([
      ...secao(ctx.r, n, 'Cliente'),
      grade(ctx.r, [
        [
          { rotulo: pj ? 'Razão social' : 'Nome', valor: nomeValor, span: 3 },
          { rotulo: pj ? 'CNPJ' : 'CPF', valor: { text: ou(c.documento) } },
        ],
        [
          { rotulo: 'Endereço', valor: enderecoCliente(c), span: contato ? 2 : 4 },
          ...(contato ? [{ rotulo: 'Contato', valor: contato, span: 2 }] : []),
        ],
      ]),
    ]),
  ]
}

// ---- 3. Instrumento calibrado ---------------------------------------------------------------------

/** Divisões na unidade mais legível, separadas por barra: "50 g", "2 / 5 / 10 g". */
function divisoesTexto(valores: number[], u: Unidade): string {
  if (!valores.length || valores.some((v) => !(v > 0))) return '—'
  const l = divisaoLegivel(valores, u)
  return `${l.valores.map((v) => numeroBr(v)).join(' / ')} ${l.unidade}`
}

/**
 * Colunas das características metrológicas (sem as folgas de 8 pt): cada rótulo numa linha ("divisão de
 * verificação" na 4ª). Multi-intervalo: a capacidade nas duas primeiras ("30 000 / 60 000 / 80 000 kg").
 */
const LARGURAS_METROLOGIA = [76, 76, 62, 112, 56, '*']
const LARGURAS_METROLOGIA_MULTI = [66, 66, 60, 98, 74, '*']

const PRELIMINAR: Array<[keyof Calibracao['preliminar'], string]> = [
  ['identificavel', 'identificável'],
  ['limpa', 'limpo'],
  ['nivelada', 'nivelado'],
  ['aquecida', 'aquecido / estabilizado'],
  ['preCarga', 'pré-carga aplicada'],
]

/** Verificação preliminar (numa linha, só com algum item "não"), ajuste e reparo: uma ou duas frases cada. */
function condicaoDoItem(ctx: Contexto): No[] {
  const { k } = ctx
  const blocos: No[] = []
  const naoAtendidos = PRELIMINAR.filter(([chave]) => k.preliminar[chave] === 'NAO').map(([, t]) => t)
  if (naoAtendidos.length)
    blocos.push(
      paragrafo(
        ctx.r,
        [{ text: 'Verificação preliminar: ', bold: true }, `item(ns) não atendido(s): ${naoAtendidos.join(', ')}.`],
        [0, 3, 0, 0],
      ),
    )
  const ajuste: No[] = []
  if (k.ajuste.realizado === 'NAO') {
    ajuste.push(
      { text: 'Ajuste: ', bold: true },
      'não foi realizado ajuste no instrumento; os resultados referem-se ao instrumento na condição em que foi encontrado.',
    )
  } else {
    const tipo = k.ajuste.realizado === 'INTERNO' ? 'ajuste interno (automático)' : 'ajuste externo, com peso padrão'
    const descricao = vazio(k.ajuste.descricao) ? '' : ` (${k.ajuste.descricao.trim().replace(/\.$/, '')})`
    const resultados = temComoEncontrado(ctx.d)
      ? `Resultados antes do ajuste em ${N_RESULTADOS}.4 (“como encontrado”) e depois dele em ${N_RESULTADOS}.3 (“como deixado”).`
      : 'Os resultados referem-se ao instrumento após o ajuste (“como deixado”).'
    ajuste.push(
      { text: 'Ajuste: ', bold: true },
      `antes da calibração foi realizado ${tipo}${descricao}. ${resultados} O ajuste não faz parte da calibração.`,
    )
  }
  blocos.push(destaque(ctx.r, { text: ajuste, style: 'paragrafo' }))

  if (k.reparo.houve) {
    const r = k.reparo
    const partes: string[] = [
      `o instrumento passou por reparo/manutenção${vazio(r.descricao) ? '' : ` (${r.descricao.trim().replace(/\.$/, '')})`}`,
    ]
    if (!vazio(k.ordemServico)) partes.push(` registrado(a) na Ordem de Serviço nº ${k.ordemServico.trim()}`)
    const marcas: string[] = []
    if (!vazio(r.marcaReparo)) marcas.push(`da marca de reparo nº ${r.marcaReparo.trim()}`)
    if (!vazio(r.selosColocados)) marcas.push(`das marcas de selagem nº ${r.selosColocados.trim()}`)
    if (marcas.length) partes.push(`, com afixação ${marcas.join(' e ')}`)
    if (!vazio(r.selosRetirados)) partes.push(` (retiradas: ${r.selosRetirados.trim()})`)
    const orgao =
      !ctx.e.cliente.uf || ctx.e.cliente.uf === 'SP' ? 'pelo órgão metrológico (IPEM-SP)' : 'pelo órgão metrológico competente'
    blocos.push(
      destaque(
        ctx.r,
        {
          text: [
            { text: 'Reparo: ', bold: true },
            `${partes.join('')}. Os serviços de reparo e manutenção não fazem parte da calibração; para o uso sujeito ao controle metrológico legal, é obrigatória a verificação após reparo ${orgao}.`,
          ],
          style: 'paragrafo',
        },
        COR.alerta,
        COR.alertaFundo,
        [0, 2, 0, 3],
      ),
    )
  }
  return blocos
}

function secaoInstrumento(ctx: Contexto, n: number): No[] {
  const { b, u } = ctx
  const faixas = faixasOrdenadas(b.faixas)
  const multi = faixas.length > 1
  // Plataforma com plaqueta própria; nos certificados emitidos com o cadastro antigo, o indicador separado
  const separada = parteSeparada(b)
  const receptor = [
    RECEPTORES[b.receptor] ?? b.receptor,
    vazio(b.dimensoes) ? '' : b.dimensoes.trim(),
    (b.receptor === 'APOIOS' || b.receptor === 'RODOVIARIA' || b.receptor === 'TANQUE') && b.apoios > 0
      ? `${b.apoios} apoios`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const maxes = faixas.map((f) => numeroBr(f.max)).join(' / ')
  const tipoFaixas = b.tipoFaixas === 'MULTI_INTERVALO' ? 'multi-intervalo' : 'múltiplas faixas'

  const identificacao: Campo[][] = [
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
    ...(separada
      ? [
          [
            {
              rotulo: separada.rotulo,
              valor: [separada.nome, separada.serie && `nº de série ${separada.serie}`].filter(Boolean).join(' · '),
              span: 4,
            },
          ],
        ]
      : []),
  ]
  // Características metrológicas, conforme a marcação do instrumento (multi-intervalo: "6 / 15 / 33 kg")
  const max: Campo = {
    rotulo: multi ? `Capacidade (Max) · ${tipoFaixas}` : 'Capacidade (Max)',
    valor: { text: faixas.length ? `${maxes} ${u}` : '—', bold: true },
    span: multi ? 2 : 1,
  }
  const min: Campo = { rotulo: 'Carga mínima (Min)', valor: b.min ? `${numeroBr(b.min)} ${u}` : '—' }
  const d: Campo = {
    rotulo: 'Divisão (d)',
    valor: {
      text: divisoesTexto(
        faixas.map((f) => f.d),
        u,
      ),
      bold: true,
    },
  }
  const e: Campo = {
    rotulo: 'Divisão de verificação (e)',
    valor: divisoesTexto(
      faixas.map((f) => f.e),
      u,
    ),
  }
  const classe: Campo = { rotulo: 'Classe de exatidão', valor: ROTULO_CLASSE[b.classe] }
  const f = faixas[0]
  const nMax: Campo = { rotulo: 'n = Max/e', valor: f && f.e > 0 ? numeroBr(Math.round(f.max / f.e)) : '—' }
  const metrologia = multi
    ? grade(ctx.r, [[max, d, e, min, classe]], LARGURAS_METROLOGIA_MULTI)
    : grade(ctx.r, [[max, min, d, e, nMax, classe]], LARGURAS_METROLOGIA)
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
  return [
    inteiro([
      ...secao(ctx.r, n, 'Instrumento calibrado'),
      grade(ctx.r, identificacao),
      {
        text: 'CARACTERÍSTICAS METROLÓGICAS, CONFORME A MARCAÇÃO DO INSTRUMENTO',
        style: 'rotulo',
        color: COR.marcaTexto,
        margin: [0, 4, 0, 2.5],
      },
      metrologia,
      grade(ctx.r, outros),
    ]),
    ...condicaoDoItem(ctx),
  ]
}

// ---- 4. Padrões utilizados -------------------------------------------------------------------------

function secaoPadroes(ctx: Contexto, n: number): No[] {
  const padroes = [...ctx.e.padroes].sort((a, b) => Number(b.tipo === 'PESOS') - Number(a.tipo === 'PESOS'))
  const pequeno = (t: string): NoObjeto => ({ text: `\n${t}`, fontSize: 7, color: COR.textoSecundario })
  // Descrição numa linha de detalhe curta: as peças (ou quantas são, se a lista for longa) e o material; nos
  // instrumentos, fabricante, modelo e nº de série
  const descricao = (p: Padrao): No => {
    const titulo = ou(p.descricao, TIPOS_PADRAO[p.tipo])
    let detalhe = ''
    if (p.tipo === 'PESOS') {
      const pecas = resumoPesos(p.pesos)
      const quantas = p.pesos.length
      detalhe = [pecas.length > 32 ? `${quantas} peças` : pecas, p.material.toLowerCase()].filter((x) => !vazio(x)).join(' · ')
    } else {
      detalhe = [
        [p.fabricante, p.modelo].filter((x) => !vazio(x)).join(' '),
        vazio(p.numeroSerie) ? '' : `nº de série ${p.numeroSerie}`,
      ]
        .filter((x) => !vazio(x))
        .join(' · ')
    }
    return detalhe ? [{ text: titulo }, pequeno(detalhe)] : titulo
  }
  const laboratorio = (p: Padrao): No =>
    vazio(p.acreditacao)
      ? ou(p.laboratorio)
      : [{ text: ou(p.laboratorio) }, pequeno(`Acreditação Cgcre ${p.acreditacao.trim().replace(/^cgcre\s*/i, '')}`)]

  const linhas = padroes.map((p): No[] => [
    { text: ou(p.identificacao), bold: true },
    descricao(p),
    { text: ou(p.classe), alignment: 'center' },
    { text: ou(p.certificado) },
    laboratorio(p),
    { text: ou(formatarDataBr(p.validade)), alignment: 'right' },
  ])
  const nominais = padroes.filter((p) => p.tipo === 'PESOS' && p.uso === 'NOMINAL').map((p) => p.identificacao)
  const notas: string[] = []
  if (!vazio(ctx.e.textos.rastreabilidade)) notas.push(textoComEmpresa(ctx.e.textos.rastreabilidade.trim(), ctx.e.empresa))
  if (nominais.length)
    notas.push(
      `Pesos padrão ${nominais.join(', ')} usados pelo valor nominal: o erro máximo admissível da classe (OIML R 111) entra como contribuição para a incerteza.`,
    )
  // A rastreabilidade ("por meio dos padrões abaixo") vem logo abaixo do título e fica com ele; a tabela pode se
  // dividir entre as páginas (por linha, com o cabeçalho de novo): inteira, ela deixaria um vão no pé da página
  // quando a identificação do instrumento é longa (ajuste e reparo)
  const nota = notas.join(' ')
  const corpo = Number(ctx.r.estilos.paragrafo.fontSize ?? 8)
  const entrelinha = corpo * Number(ctx.r.estilos.paragrafo.lineHeight ?? 1.2)
  const linhasNota = nota ? Math.ceil((nota.length * corpo * 0.52) / LARGURA) : 0
  return [
    {
      ...inteiro([...secao(ctx.r, n, 'Padrões utilizados'), ...(nota ? [paragrafo(ctx.r, nota, [0, 0, 0, 2.5])] : [])]),
      // O título e a rastreabilidade só ficam no pé da página com o cabeçalho e a 1ª linha da tabela embaixo
      // (título ≈ 30 pt, nota estimada pelas linhas e cabeçalho com a 1ª linha ≈ 80 pt)
      headlineLevel: 115 + Math.ceil(linhasNota * entrelinha + (nota ? 2.5 : 0)),
    },
    tabela(
      ctx.r,
      [
        { titulo: 'Identificação', largura: 58 },
        { titulo: 'Descrição', largura: '*' },
        { titulo: 'Classe', largura: 'auto', alinhamento: 'center' },
        { titulo: 'Certificado nº', largura: 'auto' },
        { titulo: 'Calibrado por', largura: 128 },
        { titulo: 'Próxima\ncalibração', largura: 'auto', alinhamento: 'right' },
      ],
      linhas.length
        ? linhas
        : [[{ text: 'Nenhum padrão informado.', colSpan: 6, color: COR.textoSecundario }, '', '', '', '', '']],
      { tamanho: 7.6 },
    ),
  ]
}

// ---- 5. Resultados ---------------------------------------------------------------------------------

function repetibilidade(ctx: Contexto, abertura: No[]): No[] {
  const { u } = ctx
  const resultados = ctx.d.resultado.repetibilidade.filter((r) => r.n > 0)
  const titulo = subsecao(
    ctx.r,
    `${N_RESULTADOS}.1`,
    'Repetibilidade',
    'Mesma carga, aplicada repetidas vezes no centro do receptor.',
  )
  if (!resultados.length) return [inteiro([...abertura, ...titulo, paragrafo(ctx.r, 'Ensaio não realizado.')])]
  const linhas = resultados.map((r): No[] => {
    const ensaio = ctx.k.repetibilidade.find((x) => x.id === r.id)
    const leituras = (ensaio?.leituras ?? []).filter((l): l is number => typeof l === 'number' && Number.isFinite(l))
    const dCasas = casasDecimais(ctx.divisao(r.carga))
    const casasS = r.s > 0 ? Math.max(dCasas, 1 - ordemDeGrandeza(r.s)) : dCasas
    return [
      { text: leitura(ctx, r.carga, r.carga), bold: true },
      { text: leituras.map((l) => leitura(ctx, l, r.carga)).join('  '), ...NUM },
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
          ctx.r,
          [
            { titulo: th('Carga', u), largura: 58, numerica: true },
            { titulo: th('Indicações', u), largura: '*' },
            { titulo: th('Medições', 'n'), largura: 42, numerica: true },
            { titulo: th('Média', u), largura: 58, numerica: true },
            { titulo: th('Desvio-padrão s', u), largura: 70, numerica: true },
          ],
          linhas,
        ),
      ],
      linhas.length <= 5,
    ),
  ]
}

/** Largura máxima do desenho das posições ao lado da tabela (pt); mais largo, ele é reduzido. */
const LARGURA_DESENHO = 214
/** Até onde o desenho largo encolhe para o rótulo da posição caber numa linha da tabela ao lado (pt). */
const LARGURA_DESENHO_MIN = 160
/** Entre a tabela das posições e o desenho (pt). */
const ESPACO_DESENHO = 18

/**
 * Excentricidade: a tabela das posições (uma por linha) e, ao lado, o desenho delas vistas de cima, com a de
 * maior desvio destacada. Embaixo da tabela, o maior desvio.
 */
function excentricidade(ctx: Contexto): No[] {
  const { u, k, b } = ctx
  const ensaio = k.excentricidade
  const res = ctx.d.resultado.excentricidade
  const numero = `${N_RESULTADOS}.2`
  if (!ensaio.aplicavel)
    return [
      inteiro([
        ...subsecao(ctx.r, numero, 'Excentricidade'),
        paragrafo(ctx.r, `Ensaio não aplicável${vazio(ensaio.motivo) ? '.' : `: ${comPonto(ensaio.motivo)}`}`),
      ]),
    ]
  const carga = ensaio.carga
  const casas = casasDecimais(ctx.divisao(carga))
  const comReferencia = ensaio.metodo === 3 || ensaio.metodo === 4
  const temMaior = res.posicaoMaior > 0 && res.maiorDesvio > 0
  const colunas: Coluna[] = [
    { titulo: th('Nº'), largura: 16, alinhamento: 'center' },
    { titulo: th('Posição'), largura: '*' },
    ...(comReferencia
      ? [{ titulo: th(ensaio.metodo === 3 ? 'Zero lido' : 'Posição 1 antes', u), largura: 60, numerica: true }]
      : []),
    { titulo: th('Indicação', u), largura: 60, numerica: true },
    { titulo: th('Desvio ΔI', u), largura: 56, numerica: true },
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
    ctx.r,
    [
      { text: 'Maior desvio: ', bold: true },
      { text: `|ΔI|máx = ${maior} ${u}`, bold: true },
      temMaior ? { text: `, na posição ${res.posicaoMaior + 1}`, color: COR.textoSecundario } : '',
    ],
    [0, 3, 0, 0],
  )
  const tab = tabela(ctx.r, colunas, linhas, { margem: [0, 0, 0, 0] })
  const diagrama = diagramaPosicoes(
    b.receptor,
    ensaio.posicoes.map((p) => p.rotulo),
    res.maiorDesvio > 0 ? res.posicaoMaior : -1,
    b.apoios,
  )
  // O rótulo da posição numa linha: com a coluna da referência (métodos 3 e 4) ou rótulos longos, o desenho largo
  // (rodoviária) encolhe um pouco, até LARGURA_DESENHO_MIN (folgas das células: 6 nas pontas, 4 + 4 entre colunas)
  const fixas =
    colunas.reduce((soma, c) => soma + (typeof c.largura === 'number' ? c.largura : 0), 0) + 12 + 8 * (colunas.length - 1)
  const rotuloMaisLargo = Math.max(
    ...ensaio.posicoes.map((p, i) => larguraTexto(ou(p.rotulo, `Posição ${i + 1}`), { tamanho: 8, negrito: true })),
  )
  const cabe = LARGURA - ESPACO_DESENHO - fixas - rotuloMaisLargo - 1
  const largura = diagrama
    ? Math.max(Math.min(diagrama.largura, LARGURA_DESENHO_MIN), Math.min(diagrama.largura, LARGURA_DESENHO, cabe))
    : 0
  const corpo: No = diagrama
    ? {
        columns: [
          { width: '*', stack: [tab, resumo] },
          {
            width: largura,
            stack: [
              {
                svg: diagrama.svg,
                width: largura,
                height: (diagrama.altura * largura) / diagrama.largura,
                font: 'Inter',
              },
              { text: 'Posições vistas de cima', style: 'nota', alignment: 'center', margin: [0, 1, 0, 0] },
            ],
          },
        ],
        columnGap: ESPACO_DESENHO,
      }
    : { stack: [tab, resumo] }
  const descricao = `Carga de ensaio: ${leitura(ctx, carga, carga)} ${u} · método: ${METODOS_EXCENTRICIDADE[ensaio.metodo].toLowerCase()}.`
  return [bloco([...subsecao(ctx.r, numero, 'Excentricidade', descricao), corpo], ensaio.posicoes.length <= 14)]
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

/** O ensaio usa as duas direções (↑ e ↓)? */
const ambosSentidos = (ensaio: EnsaioIndicacao) =>
  ensaio.pontos.some((p) => p.crescente !== null) && ensaio.pontos.some((p) => p.decrescente !== null)

/** O ensaio tem cargas de substituição em algum ponto? */
const comSubstituicao = (ensaio: EnsaioIndicacao) =>
  ensaio.substituicao.ativa && ensaio.pontos.some((p) => p.nivelSubstituicao > 0)

/**
 * Linhas de uma tabela de erros que vai inteira para a página seguinte quando não cabe; mais que isso, ela se
 * divide entre as páginas (com o cabeçalho repetido) e não deixa um vão no pé da página.
 */
const LINHAS_INTEIRAS = 8

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
  if (o.substituicao) colunas.push({ titulo: th('Subst.', 'nº'), largura: 32, numerica: true })
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
    { titulo: th('k'), largura: 'auto', numerica: true },
    { titulo: th(NU_EFF), largura: 'auto', numerica: true },
  )
  if (o.conformidade)
    colunas.push(
      { titulo: th('EMA', `±${u}`), largura: '*', numerica: true },
      { titulo: th('Situação'), largura: 54, alinhamento: 'center' },
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
      ...(o.conformidade ? [p.texto.ema ? `±${p.texto.ema}` : '—', { ...situacao, fontSize: 7.6 }] : []),
    ]
  })
  return tabela(ctx.r, colunas, linhas, { pequena: linhas.length <= LINHAS_INTEIRAS })
}

/** Há resultado "como encontrado" (então 5.3 é o "como deixado"). */
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

/** As cargas de substituição de um ensaio, numa frase (vazia sem elas). */
function fraseSubstituicao(ctx: Contexto, ensaio: EnsaioIndicacao): string {
  if (!comSubstituicao(ensaio)) return ''
  const pesos = cargaPecas(ctx, ensaio.substituicao.pecas)
  const etapas = ensaio.substituicao.etapas.filter((e) => e.leituraPadroes !== null && e.leituraSubstituicao !== null).length
  return ` (EURAMET cg-18, 4.3.3): ${etapas} etapa${etapas === 1 ? '' : 's'}, cada uma com ${pesos > 0 ? `${leitura(ctx, pesos, pesos)} ${ctx.u} de ` : ''}pesos padrão trocados por carga de mesma indicação; incerteza das etapas incluída em U. `
}

/**
 * Frases curtas embaixo de uma tabela de erros: cargas de substituição e retorno ao zero. `anterior`: o ensaio
 * da tabela de cima (no "como encontrado", o "como deixado"); as mesmas cargas de substituição não se repetem.
 */
function depoisDaTabela(ctx: Contexto, r: ResultadoCalculo, ensaio: EnsaioIndicacao, anterior?: EnsaioIndicacao): No[] {
  const { u } = ctx
  const partes: No[] = []
  const substituicao = fraseSubstituicao(ctx, ensaio)
  if (substituicao && (!anterior || substituicao !== fraseSubstituicao(ctx, anterior)))
    partes.push({ text: 'Cargas de substituição', bold: true }, substituicao)
  else if (substituicao) partes.push({ text: 'Cargas de substituição', bold: true }, ` como em ${N_RESULTADOS}.3. `)
  if (r.erroRetornoZero !== null)
    partes.push(
      { text: 'Retorno ao zero: ', bold: true },
      'após a retirada da carga, o instrumento indicou ',
      { text: `${leitura(ctx, r.erroRetornoZero, 0)} ${u}`, bold: true },
      '.',
    )
  return partes.length ? [paragrafo(ctx.r, partes, [0, 0, 0, 1])] : []
}

/** `fim`: o que vai junto, embaixo da tabela (a legenda, quando é a última tabela dos resultados). */
function erroIndicacao(ctx: Contexto, fim: No[] = []): No[] {
  const { k } = ctx
  const r = ctx.d.resultado
  const ensaio = k.indicacao
  const titulo = subsecao(
    ctx.r,
    `${N_RESULTADOS}.3`,
    temComoEncontrado(ctx.d) ? 'Erro de indicação — como deixado (após o ajuste)' : 'Erro de indicação',
    DESCRICAO_METODO[ensaio.metodo],
  )
  if (!pontosLidos(r).length) return [inteiro([...titulo, paragrafo(ctx.r, 'Ensaio não realizado.'), ...fim])]
  const tab = tabelaErros(ctx, r, ensaio, { conformidade: k.conformidade.solicitada, substituicao: comSubstituicao(ensaio) })
  return [bloco([...titulo, tab, ...depoisDaTabela(ctx, r, ensaio), ...fim], pontosLidos(r).length <= LINHAS_INTEIRAS)]
}

function comoEncontrado(ctx: Contexto, fim: No[] = []): No[] {
  const r = ctx.d.comoEncontrado
  const ensaio = ctx.k.comoEncontrado
  if (!r || !ensaio || !temComoEncontrado(ctx.d)) return []
  return [
    bloco(
      [
        ...subsecao(
          ctx.r,
          `${N_RESULTADOS}.4`,
          'Erro de indicação — como encontrado (antes do ajuste)',
          DESCRICAO_METODO[ensaio.metodo],
        ),
        tabelaErros(ctx, r, ensaio, { conformidade: ctx.k.conformidade.solicitada, substituicao: comSubstituicao(ensaio) }),
        ...depoisDaTabela(ctx, r, ensaio, ctx.k.indicacao),
        ...fim,
      ],
      pontosLidos(r).length <= LINHAS_INTEIRAS,
    ),
  ]
}

// ---- Gráfico do erro de indicação ---------------------------------------------------------------------

/** Uma diagramação do certificado: os respiros do layout e a altura do gráfico (pt; 0 = sem ele). */
export interface Diagramacao {
  ritmo: NomeRitmo
  grafico: number
}

/**
 * As diagramações, da preferida à última: a montagem usa a primeira com que o certificado cabe em `MAX_PAGINAS`.
 * Primeiro o gráfico encolhe; depois os respiros apertam (o layout compacto); por último, o gráfico sai. O
 * desenho das posições fica sempre.
 */
export const DIAGRAMACOES: readonly Diagramacao[] = [
  { ritmo: 'normal', grafico: 150 },
  { ritmo: 'normal', grafico: 132 },
  { ritmo: 'normal', grafico: 116 },
  { ritmo: 'normal', grafico: 100 },
  { ritmo: 'compacto', grafico: 100 },
  { ritmo: 'compacto', grafico: 84 },
  { ritmo: 'compacto', grafico: 0 },
]

/** Texto do motor ("1 234,5", "−0,05") → número; NaN se vazio. */
function lerNumero(s: string): number {
  if (!s) return NaN
  return Number(
    s
      .replace(/[\s\u00A0\u202F]/g, '')
      .replace(MENOS, '-')
      .replace(',', '.'),
  )
}

/** Pontos do gráfico com os valores como impressos na tabela (E na casa de U, U com 2 algarismos). */
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

/** Limites ±EMA em degraus, exatos nas mudanças de trecho (500e/2000e na classe III) e nas faixas. */
function limitesEma(ctx: Contexto, ate: number): TrechoEma[] {
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
    const ultimo = trechos.at(-1)
    if (ultimo && Math.abs(ultimo.ema - ema) < 1e-12 && Math.abs(ultimo.ate - pontos[i]) < 1e-12) ultimo.ate = pontos[i + 1]
    else trechos.push({ de: pontos[i], ate: pontos[i + 1], ema })
  }
  return trechos
}

/** O gráfico do erro de indicação "como deixado" (5.3) × carga, com a legenda embaixo; `altura` 0 (ou só o zero lido): sem ele. */
function graficoIndicacao(ctx: Contexto, altura: number): No[] {
  if (!(altura > 0)) return []
  // Média só com os dois sentidos, como na tabela e na legenda; num sentido só (contínuo, descontínuo ou
  // decrescente), a série dele: o erro e o U são os mesmos da média (a indicação de um sentido, sem histerese)
  const media = ctx.k.opcoes.histerese === 'MEDIA' && ambosSentidos(ctx.k.indicacao)
  const pontos = pontosGrafico(ctx.d.resultado, media)
  // Sem nenhum ponto com carga (só o zero lido, numa prévia), não há o que desenhar
  if (!pontos.some((p) => p.carga > 0 && (p.crescente || p.decrescente || p.media))) return []
  const ema = limitesEma(ctx, Math.max(...pontos.map((p) => p.carga)))
  const qual = temComoEncontrado(ctx.d) ? ' — como deixado' : ''
  return [
    inteiro([
      {
        svg: graficoErros(pontos, { largura: LARGURA, altura, unidade: ctx.u, ema }),
        width: LARGURA,
        height: altura,
        font: 'Inter',
        margin: [0, ctx.r.grafico, 0, 2],
      },
      {
        text: `Erro de indicação em função da carga${qual}${media ? ' (média das indicações ↑ e ↓)' : ''}. Barras: incerteza expandida U${ema.length ? '; tracejado: limites ±EMA' : ''}.`,
        style: 'nota',
      },
    ]),
  ]
}

/** O desvio ΔI da excentricidade como o cálculo faz em cada método (cg-18 6.3-1, 6.3-2 e 6.3-3). */
export const LEGENDA_DESVIO_EXCENTRICIDADE: Record<MetodoExcentricidade, string> = {
  1: 'ΔI: indicação na posição − indicação na posição 1.',
  2: 'ΔI: indicação na posição − indicação na posição 1.',
  3: 'ΔI: (indicação − zero lido) na posição − o mesmo na posição 1.',
  4: 'ΔI: indicação na posição − indicação na posição 1 logo antes.',
}

/**
 * Em quais tabelas impressas a carga já inclui a correção do empuxo do ar δm_B (empuxo pela densidade do ar medida,
 * cg-18 7.1.2-4): no ensaio final com a opção e o ar registrado, e no "como encontrado" com as opções dele
 * (`opcoesComoEncontrado`: na classe I, também com "ajustada logo antes"; o certificado de antes, como na época).
 */
export function cargaComEmpuxo(ctx: Pick<Contexto, 'd' | 'k' | 'b'>): { final: boolean; antes: boolean } {
  const { d, k } = ctx
  const opcoesAntes = calculoLegado(k) ? k.opcoes : opcoesComoEncontrado(k.opcoes, ctx.b.classe)
  return {
    final: k.opcoes.empuxo === 'MEDIDO' && d.resultado.ar !== null,
    antes: temComoEncontrado(d) && opcoesAntes.empuxo === 'MEDIDO' && (d.comoEncontrado?.ar ?? null) !== null,
  }
}

/** "Carga: …" da legenda: o valor convencional dos pesos e, quando entrou, a correção do empuxo do ar. */
function legendaCarga(ctx: Contexto, substituicao: boolean): string {
  const empuxo = cargaComEmpuxo(ctx)
  const impressoAntes = temComoEncontrado(ctx.d)
  const somado = substituicao ? ', somado às cargas de substituição' : ''
  if (empuxo.final && (empuxo.antes || !impressoAntes))
    return `Carga: valor convencional dos pesos padrão, corrigido do empuxo do ar${somado}.`
  if (empuxo.antes) return `Carga: valor convencional dos pesos padrão${somado}; no “como encontrado”, corrigido do empuxo do ar.`
  if (empuxo.final) return `Carga: valor convencional dos pesos padrão${somado}; no “como deixado”, corrigido do empuxo do ar.`
  return `Carga: valor convencional dos pesos padrão${somado}.`
}

/** Uma legenda só, embaixo dos resultados: símbolos e convenções das tabelas. */
function legendaResultados(ctx: Contexto): NoObjeto {
  const { k, d } = ctx
  const ensaios = [k.indicacao, ...(temComoEncontrado(d) && k.comoEncontrado ? [k.comoEncontrado] : [])]
  const ambos = ensaios.some(ambosSentidos)
  const substituicao = ensaios.some(comSubstituicao)
  const media = k.opcoes.histerese === 'MEDIA'
  const partes = [
    legendaCarga(ctx, substituicao),
    media && ambos
      ? 'Erro = média das indicações ↑ e ↓ − carga; a histerese está incluída na incerteza.'
      : 'Erro = indicação − carga.',
    'U: incerteza expandida; k: fator de abrangência; νeff: graus de liberdade efetivos.',
  ]
  if (ambos) partes.push('↑ / ↓: carga crescente / decrescente.')
  if (substituicao) partes.push('Subst.: nº de cargas de substituição sob os pesos.')
  if (k.conformidade.solicitada) partes.push('EMA: erro máximo admissível do critério de conformidade.')
  partes.push('s: desvio-padrão experimental (n − 1 graus de liberdade).')
  if (k.excentricidade.aplicavel) partes.push(LEGENDA_DESVIO_EXCENTRICIDADE[k.excentricidade.metodo])
  return { text: partes.join(' '), style: 'nota', margin: [0, 2, 0, 0] }
}

/**
 * Resultados em grupos (cada subseção é um ponto onde a página pode ser quebrada, ver `montarCertificado`): a
 * repetibilidade, a excentricidade, o erro de indicação ("como deixado"), o gráfico dele e o "como encontrado". A
 * legenda vai junto com a última tabela.
 */
function secaoResultados(ctx: Contexto, n: number, alturaGrafico: number): Grupo[] {
  const legenda = [legendaResultados(ctx)]
  const antes = temComoEncontrado(ctx.d)
  const grupos: Grupo[] = [
    { id: 'repetibilidade', nos: repetibilidade(ctx, secao(ctx.r, n, 'Resultados')) },
    { id: 'excentricidade', nos: excentricidade(ctx) },
    { id: 'indicacao', nos: erroIndicacao(ctx, antes ? [] : legenda) },
    { id: 'grafico', nos: graficoIndicacao(ctx, alturaGrafico) },
    { id: 'como-encontrado', nos: comoEncontrado(ctx, legenda) },
  ]
  return grupos.filter((g) => g.nos.length)
}

// ---- 6. Declaração de conformidade ----------------------------------------------------------------

function secaoConformidade(ctx: Contexto, n: number): No[] {
  const { k, b, u } = ctx
  const c = k.conformidade
  const r = ctx.d.resultado
  const criterio = CRITERIOS_EMA[c.criterio]
  const regra = REGRAS_DECISAO[c.regra]
  const pequeno = (t: string): NoObjeto => ({ text: `\n${t}`, fontSize: 7, color: COR.textoSecundario })
  let especificacao: No
  if (c.criterio === 'CLIENTE') {
    const tol = num(c.toleranciaCliente, casasDecimais(c.toleranciaCliente))
    especificacao = [{ text: `${criterio.label}: EMA de ±${tol} ${u}`, bold: true }, pequeno('Igual em toda a faixa calibrada.')]
  } else {
    const e = b.faixas.length
      ? divisoesTexto(
          faixasOrdenadas(b.faixas).map((f) => f.e),
          u,
        )
      : ''
    const instrumento = [b.classe ? `classe ${b.classe}` : '', e ? `e = ${e}` : ''].filter(Boolean).join(', ')
    especificacao = [
      { text: criterio.label, bold: true },
      pequeno(`${criterio.descricao.replace(/\.$/, '')}${instrumento ? `; ${instrumento}` : ''}.`),
    ]
  }
  const ilac =
    c.regra === 'BANDA_GUARDA'
      ? 'Faixa de guarda w = U; risco de aceitação indevida ≤ 2,5 % (ILAC-G8:09/2019).'
      : 'Sem faixa de guarda: risco compartilhado com o cliente (ILAC-G8:09/2019).'
  const naoConformes = pontosLidos(r).filter((p) => p.conformidade === 'NAO_CONFORME')
  const situacao = r.conformidade
  const resultadoTexto =
    situacao === 'CONFORME'
      ? 'conforme em todos os pontos calibrados'
      : situacao === 'NAO_CONFORME'
        ? `não conforme no(s) ponto(s) de ${naoConformes.map((p) => `${p.texto.referencia || p.texto.carga} ${u}`).join('; ')}`
        : 'não foi possível avaliar: não há erro máximo admissível para comparar'
  const selo = situacao === 'CONFORME' ? 'CONFORME' : situacao === 'NAO_CONFORME' ? 'NÃO CONFORME' : 'NÃO AVALIADA'
  const corSelo = situacao === 'NAO_CONFORME' ? COR.alerta : COR.marcaTexto
  const comparados = temComoEncontrado(ctx.d)
    ? `os erros de indicação “como deixado” (${N_RESULTADOS}.3)`
    : `os erros de indicação (${N_RESULTADOS}.3)`
  return [
    inteiro([
      ...secao(ctx.r, n, 'Declaração de conformidade'),
      paragrafo(
        ctx.r,
        `Solicitada pelo cliente: ${comparados} foram comparados, em cada ponto e sentido de carregamento, com o erro máximo admissível (EMA) do critério, segundo a regra de decisão. Esta declaração não constitui verificação metrológica legal.`,
        [0, 0, 0, 3],
      ),
      grade(ctx.r, [
        [
          { rotulo: 'Critério', valor: especificacao, span: 2 },
          { rotulo: 'Regra de decisão', valor: [{ text: regra.label, bold: true }, pequeno(ilac)], span: 2 },
        ],
      ]),
      // O resultado numa caixa com o selo, na cor da situação
      {
        table: {
          widths: ['auto', '*'],
          body: [
            [
              {
                text: selo,
                font: 'InterMedio',
                bold: true,
                fontSize: 9.6,
                characterSpacing: 0.5,
                color: corSelo,
                margin: [3, 0.5, 10, 0],
              },
              {
                text: [{ text: 'Resultado: ', bold: true }, `${resultadoTexto}.`],
                style: 'paragrafo',
                margin: [0, 1.2, 0, 0],
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
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 3, 0, 1],
      },
    ]),
  ]
}

// ---- Observações, opiniões e declarações (numeradas na sequência) -------------------------------------------------

/** As linhas de um texto digitado, sem as vazias e sem os espaços das pontas (uma observação por linha). */
export const linhasDoTexto = (texto: string): string[] =>
  texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

function secaoObservacoes(ctx: Contexto, n: number): No[] {
  const { k, e, b, u } = ctx
  const itens: No[] = []
  if (!vazio(e.textos.observacoesPadrao)) itens.push(textoComEmpresa(e.textos.observacoesPadrao.trim(), e.empresa))
  // Uma observação por linha digitada: cada uma com o seu marcador, como os outros itens
  if (!vazio(k.observacoes)) itens.push(...linhasDoTexto(k.observacoes))

  const parcial = ctx.d.resultado.avisos.some((a) => /faixa parcial/i.test(a.mensagem))
  if (parcial) {
    const lidos = pontosLidos(ctx.d.resultado)
    const maior = Math.max(...lidos.map((p) => (Number.isFinite(p.referencia) ? p.referencia : p.carga)))
    const max = Math.max(...b.faixas.map((f) => f.max))
    itens.push(
      `Calibração em faixa parcial: a maior carga ensaiada foi ${num(maior, casasDecimais(ctx.divisao(maior)))} ${u}, abaixo da capacidade máxima (Max = ${numeroBr(max)} ${u}). Os resultados aplicam-se somente à faixa calibrada.`,
    )
  }
  if (k.opcoes.divisaoTeste > 0)
    itens.push(
      `Leituras com resolução aumentada (divisão de teste de ${divisoesTexto([k.opcoes.divisaoTeste], u)}): a incerteza declarada é menor que a obtida com a divisão normal do instrumento (EURAMET cg-18, 8.3).`,
    )
  const temCliente = !vazio(b.identificacao) || !vazio(b.localInstalacao) || !!b.finalidade
  if (temCliente)
    itens.push(
      'Informações com (*) fornecidas pelo cliente, sob sua responsabilidade; podem influenciar a interpretação dos resultados.',
    )
  const proxima = formatarDataBr(k.proximaCalibracao)
  if (k.proximaNoCertificado && proxima)
    itens.push([{ text: 'Data da próxima calibração informada a pedido do cliente: ' }, { text: proxima, bold: true }, '.'])
  else if (!vazio(e.textos.intervalo)) itens.push(textoComEmpresa(e.textos.intervalo.trim(), e.empresa))

  if (!itens.length) return []
  return [
    inteiro([...secao(ctx.r, n, 'Observações'), lista(ctx.r, itens.slice(0, 1))]),
    ...(itens.length > 1 ? [lista(ctx.r, itens.slice(1))] : []),
  ]
}

/** Ressalva das opiniões e interpretações (ISO/IEC 17025, 7.8.7): curta, cabe na linha do título da seção. */
export const RESSALVA_OPINIOES =
  'Baseadas nos resultados; não fazem parte dos resultados de medição. Emitidas por pessoal autorizado.'

function secaoOpinioes(ctx: Contexto, n: number): No[] {
  const texto = ctx.k.opinioes.trim()
  if (!texto) return []
  // A ressalva (ISO/IEC 17025, 7.8.7) na linha do título: a caixa fica só com a opinião
  return [
    bloco(
      [
        ...secao(ctx.r, n, 'Opiniões e interpretações', ESPACO_TITULO, RESSALVA_OPINIOES),
        destaque(ctx.r, { text: texto, style: 'paragrafo' }, COR.grafite, COR.fundoCabecalho, [0, 0, 0, 1]),
      ],
      texto.length < 1500,
    ),
  ]
}

/**
 * Declarações e o fim do certificado (assinaturas), num bloco só: quando não cabem no resto da página, vão
 * juntas para a seguinte, que nunca fica só com as assinaturas e uma declaração solta. Mesmo número de
 * páginas que deixar as declarações se dividirem (o bloco é o último do certificado). A cláusula de
 * reprodução não entra aqui: ela sai no rodapé de toda página.
 */
function secaoDeclaracoes(ctx: Contexto, n: number, fim: No[]): No[] {
  const t = ctx.e.textos
  const textos = [t.incerteza, t.abrangencia, t.naoAcreditado, t.controleLegal]
    .filter((x) => !vazio(x))
    .map((x) => textoComEmpresa(x.trim(), ctx.e.empresa))
  // Sem declaração nenhuma (todos os textos apagados nas configurações), só o fim
  if (!textos.length) return [inteiro(fim)]
  const itens = textos.map((x, i) => ({
    columns: [
      { text: `${i + 1}.`, width: 12, style: 'declaracao', color: COR.marcaTexto, bold: true },
      { text: x, width: '*', style: 'declaracao' },
    ],
    margin: [0, 0, 0, ctx.r.item],
  }))
  return [inteiro([...secao(ctx.r, n, 'Declarações'), ...itens, ...fim])]
}

// ---- Assinaturas e fim ----------------------------------------------------------------

/** Assinatura digitalizada só se for PNG/JPEG de verdade (data URL com a assinatura do formato). */
function imagemAssinatura(dataUrl: string): string | null {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!m) return null
  const bytes = Buffer.from(m[2].replace(/\s/g, ''), 'base64')
  const png = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const jpeg = bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  return png || jpeg ? `data:image/${png ? 'png' : 'jpeg'};base64,${m[2].replace(/\s/g, '')}` : null
}

/**
 * Área de uma assinatura, baixa (≈ 20 mm com o nome e o cargo): o rótulo, a imagem da assinatura (até 22 pt de
 * altura, ≈ 8 mm) ou o espaço para assinar à mão, o fio, o nome e o cargo com o registro.
 */
const ALTURA_ASSINATURA = 22

function assinatura(papel: string, s: Signatario, comImagem: boolean): NoObjeto {
  const imagem = comImagem ? imagemAssinatura(s.assinatura) : null
  return {
    stack: [
      { text: papel.toUpperCase(), style: 'rotulo', margin: [0, 0, 0, 0.5] },
      imagem
        ? { image: imagem, fit: [110, ALTURA_ASSINATURA], margin: [0, 0, 0, 0.5] }
        : { text: ' ', fontSize: ALTURA_ASSINATURA / 1.21, lineHeight: 1, margin: [0, 0, 0, 0.5] },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 0.6, lineColor: COR.grafite }],
        margin: [0, 0.5, 0, 2],
      },
      { text: ou(s.nome), bold: true, fontSize: 8.2 },
      {
        text: [s.cargo, s.registro].filter((x) => !vazio(x)).join(' · ') || ' ',
        fontSize: 7.2,
        color: COR.textoSecundario,
      },
    ],
  }
}

/**
 * Fim do certificado: as assinaturas, a data da emissão e a linha de fim (vai inteiro, com as declarações).
 * Com uma assinatura só (quem executou também autorizou), a data e a linha de fim vão na coluna ao lado dela,
 * alinhadas ao pé (sem linha a mais); com duas, numa linha embaixo delas.
 */
function blocoFinal(ctx: Contexto, comImagem: boolean): No[] {
  const { e } = ctx
  const mesmo = e.tecnico.id && e.tecnico.id === e.signatario.id
  const emissao = dataHoraBrasilia(e.emitidoEm)
  const cidade = [e.empresa.cidade, e.empresa.uf].filter((x) => !vazio(x)).join('/')
  // A prévia não foi emitida: diz quando foi gerada e que não tem valor
  const emitido: NoObjeto = {
    text: !emissao
      ? ''
      : ctx.d.previa
        ? `Prévia gerada em ${emissao.data}, às ${emissao.hora} (horário de Brasília), sem valor.`
        : `${cidade ? `${cidade}, ` : ''}emitido em ${emissao.data}, às ${emissao.hora} (horário de Brasília).`,
    fontSize: 7.2,
  }
  const fim: NoObjeto = {
    text: `— Fim do Certificado de Calibração nº ${ctx.numero} —`,
    fontSize: 7.4,
    characterSpacing: 0.3,
  }
  if (mesmo)
    return [
      fio(COR.fio, 0.5, [0, ctx.r.assinaturas, 0, 5]),
      {
        columns: [
          { width: 210, ...assinatura('Executado e autorizado por', e.signatario, comImagem) },
          {
            width: '*',
            // As duas linhas no pé da coluna da assinatura (alinhadas com o nome e o cargo)
            stack: [emitido, { ...fim, margin: [0, 1, 0, 0] }],
            alignment: 'right',
            color: COR.textoSecundario,
            margin: [0, ALTURA_ASSINATURA + 13, 0, 0],
          },
        ],
        columnGap: 24,
      },
    ]
  return [
    fio(COR.fio, 0.5, [0, ctx.r.assinaturas, 0, 5]),
    {
      columns: [assinatura('Executado por', e.tecnico, comImagem), assinatura('Autorizado por', e.signatario, comImagem)],
      columnGap: 24,
    },
    // A data da emissão à esquerda e a linha de fim à direita, numa linha só
    {
      columns: [
        { width: '*', ...emitido },
        { width: 'auto', ...fim, alignment: 'right' },
      ],
      columnGap: 12,
      color: COR.textoSecundario,
      margin: [0, 3.5, 0, 0],
    },
  ]
}

// ---- Cabeçalho, rodapé, marca d'água ------------------------------------------------------------

/**
 * Cabeçalho corrido, igual em todas as páginas: à esquerda o logo e a palavra-marca (Poppins, como no
 * timbrado oficial); à direita, alinhados à margem, o título, o número, o procedimento (POP) e a página —
 * o que a ISO/IEC 17025 (7.8.2.1) pede em cada folha, num lugar só. Tudo encosta no módulo de 30 pt.
 */
function cabecalho(ctx: Contexto) {
  const pop = procedimento(ctx.e)
  return (pagina: number, total: number): NoObjeto => ({
    margin: [MARGEM_X, TOPO_CABECALHO, MARGEM_X, 0],
    columns: [
      ...colunasMarca(ctx.e.empresa),
      {
        width: 'auto',
        alignment: 'right',
        // Versal do título na altura do topo do logo; linha de base da página na base do logo
        margin: [0, -1.5, 0, 0],
        lineHeight: 1,
        stack: [
          {
            text: 'CERTIFICADO DE CALIBRAÇÃO Nº',
            font: 'InterMedio',
            fontSize: 6.3,
            characterSpacing: 0.5,
            color: COR.marcaTexto,
          },
          { text: ctx.numero, font: 'Poppins', fontSize: 12.5, lineHeight: 0.8, color: TIMBRADO.texto, margin: [0, -1.5, 0, 0] },
          {
            text: [
              ...(pop
                ? [
                    { text: 'POP: ', font: 'InterMedio', color: TIMBRADO.secundario },
                    { text: pop, font: 'InterMedio', color: TIMBRADO.texto },
                    { text: ' · ' },
                  ]
                : []),
              { text: `Página ${pagina} de ${total}` },
            ],
            fontSize: 7,
            color: TIMBRADO.secundario,
            margin: [0, 4.6, 0, 0],
          },
        ],
      },
    ],
  })
}

/** Linhas que um texto ocupa numa largura, por estimativa generosa (≈ 0,6 em por caractere no Inter). */
function linhasEstimadas(texto: string, largura: number, emPorCaractere = 0.6): number {
  return Math.max(1, Math.ceil((texto.length * RODAPE.tamanho * emPorCaractere) / (largura - 24)))
}

/** Frases da cláusula de reprodução (Configurações → Certificado), uma por linha do rodapé. */
function frasesDaClausula(ctx: Contexto): string[] {
  const t = textoComEmpresa(ctx.e.textos.reproducao ?? '', ctx.e.empresa)
    .replace(/\s+/g, ' ')
    .trim()
  return t ? t.split(/(?<=[.!?])\s+(?=\S)/) : []
}

/**
 * Rodapé: a identificação legal da empresa (dinâmica, linhas vazias somem) e a cláusula de reprodução (o
 * certificado só pode ser reproduzido na íntegra), apoiadas no fio de base. A cláusula sai à direita, uma
 * frase por linha, ao lado das últimas linhas da empresa, logo acima do trapézio verde — quando cabe (medido
 * com a fonte); senão, desce para linhas próprias. O bloco é alinhado por baixo (última linha sempre à mesma
 * distância do fio) e a margem inferior da página cresce se ele tiver mais linhas: nada encosta no fio nem
 * sai da caixa do rodapé.
 */
function rodape(ctx: Contexto): { no: () => NoObjeto; margemBase: number } {
  const emp = ctx.e.empresa
  const razao = emp.razaoSocial || emp.nomeFantasia
  const SEP = ' · '
  const cnpj = vazio(emp.cnpj) ? '' : `${SEP}CNPJ ${emp.cnpj.trim()}`
  const endereco = enderecoEmpresa(emp)
  const contatos = [emp.telefone, emp.email, emp.site].filter((x) => !vazio(x)).join(SEP)
  const medida = { tamanho: RODAPE.tamanho }
  const ESPACO = 12
  // Folga da medida (pt): a quebra de linha do pdfmake não pode pegar a cláusula de surpresa
  const FOLGA = 4

  // Linhas da empresa, com a largura de cada uma numa linha só
  const empresa: Array<{ no: No; largura: number; linhas: number }> = [
    {
      no: { text: [{ text: razao, bold: true, color: TIMBRADO.texto }, { text: cnpj }] },
      largura: larguraTexto(razao, { ...medida, negrito: true }) + larguraTexto(cnpj, medida),
      linhas: linhasEstimadas(razao + cnpj, LARGURA, 0.64),
    },
    ...[endereco, contatos]
      .filter((x) => !vazio(x))
      .map((x) => ({ no: { text: x }, largura: larguraTexto(x, medida), linhas: linhasEstimadas(x, LARGURA) })),
  ]
  const frases = frasesDaClausula(ctx)
  const larguraClausula = Math.max(0, ...frases.map((f) => larguraTexto(f, { ...medida, italico: true })))
  const clausula = (no: NoObjeto): NoObjeto => ({ ...no, italics: true, alignment: 'right' })

  const linhas: No[] = []
  let n = 0
  const aoLado = empresa.slice(empresa.length - frases.length)
  const cabeAoLado =
    frases.length > 0 &&
    frases.length <= empresa.length &&
    aoLado.every((l) => l.largura + ESPACO + larguraClausula + FOLGA <= LARGURA)
  if (cabeAoLado) {
    for (const l of empresa.slice(0, empresa.length - frases.length)) {
      linhas.push(l.no)
      n += l.linhas
    }
    linhas.push({
      columns: [
        { width: '*', stack: aoLado.map((l) => l.no) },
        clausula({ width: 'auto', stack: frases.map((f) => ({ text: f })) }),
      ],
      columnGap: ESPACO,
    })
    n += aoLado.length
  } else {
    for (const l of empresa) {
      linhas.push(l.no)
      n += l.linhas
    }
    for (const f of frases) {
      linhas.push(clausula({ text: f }))
      n += linhasEstimadas(f, LARGURA)
    }
  }

  // Topo da 1ª linha para a última linha de base ficar a RODAPE.respiro pt do fio de base
  const primeira = BASE_RODAPE - RODAPE.respiro - RODAPE.tamanho * 0.969 - (n - 1) * RODAPE.entrelinha
  const margemBase = Math.ceil(A4.altura - primeira + 7)
  return {
    margemBase,
    no: () => ({
      margin: [MARGEM_X, primeira - (A4.altura - margemBase), MARGEM_X, 0],
      stack: linhas,
      fontSize: RODAPE.tamanho,
      lineHeight: RODAPE.entrelinha / (RODAPE.tamanho * 1.21),
      color: TIMBRADO.secundario,
    }),
  }
}

/** Assinatura do rodapé (fio grafite e trapézio verde), repetida no fundo de cada página. */
const fundo = fundoTimbrado(MARGEM_X, LARGURA)

function marcaDagua(texto: string): NoObjeto | undefined {
  const t = texto.trim()
  if (!t) return undefined
  const cancelado = /cancel/i.test(t)
  return {
    text: t,
    color: cancelado ? '#B42318' : '#7A817C',
    opacity: cancelado ? 0.13 : 0.1,
    bold: true,
    font: 'InterMedio',
    angle: -50,
  }
}

// ---- Documento ---------------------------------------------------------------------------------------

function dataDoDocumento(d: DadosCertificadoPdf): Date {
  const emitido = new Date(d.emissao.emitidoEm)
  if (d.emissao.emitidoEm && !Number.isNaN(emitido.getTime())) return emitido
  const calibrado = new Date(`${d.calibracao.dataCalibracao}T12:00:00Z`)
  return Number.isNaN(calibrado.getTime()) ? new Date(0) : calibrado
}

/**
 * As imagens das assinaturas vão no certificado emitido; na prévia (ninguém autorizou ainda) e quando a imagem
 * não pode ser desenhada (`assinaturas: false`), só as linhas.
 */
const comImagens = (d: DadosCertificadoPdf, opcoes: { assinaturas?: boolean }) => opcoes.assinaturas !== false && !d.previa

/** Uma seção (ou subseção dos resultados) do certificado: onde a página pode ser quebrada no equilíbrio. */
interface Grupo {
  id: string
  nos: No[]
}

/** Id do grupo final (declarações e assinaturas), o último do certificado. */
const ID_FINAL = 'declaracoes'

/** As seções na ordem, numeradas na sequência (as que não se aplicam não ocupam número). */
function grupos(ctx: Contexto, comImagem: boolean, alturaGrafico: number): Grupo[] {
  let n = 0
  const lista: Grupo[] = [
    { id: 'dados', nos: secaoDadosCalibracao(ctx, ++n) },
    { id: 'cliente', nos: secaoCliente(ctx, ++n) },
    { id: 'instrumento', nos: secaoInstrumento(ctx, ++n) },
    { id: 'padroes', nos: secaoPadroes(ctx, ++n) },
    ...secaoResultados(ctx, ++n, alturaGrafico),
  ]
  if (ctx.k.conformidade.solicitada) lista.push({ id: 'conformidade', nos: secaoConformidade(ctx, ++n) })
  // Observações e opiniões só ocupam número quando existem
  const observacoes = secaoObservacoes(ctx, n + 1)
  if (observacoes.length) lista.push({ id: 'observacoes', nos: observacoes })
  n += observacoes.length ? 1 : 0
  const opinioes = secaoOpinioes(ctx, n + 1)
  if (opinioes.length) lista.push({ id: 'opinioes', nos: opinioes })
  n += opinioes.length ? 1 : 0
  lista.push({ id: ID_FINAL, nos: secaoDeclaracoes(ctx, ++n, blocoFinal(ctx, comImagem)) })
  return lista
}

/**
 * Marca invisível (≈ 0,1 pt) depois de um grupo, fora dele: a montagem lê em que página e altura ela ficou (o
 * fim do grupo). A última (`fim:declaracoes`) só sai na medição: depois dela não há nada, e ela não pode abrir
 * uma página sozinha.
 */
const marcaFim = (id: string): NoObjeto => ({ text: ' ', id: `fim:${id}`, fontSize: 0.1, lineHeight: 1 })

/** O primeiro nó do grupo começando uma página nova. */
function comQuebra(nos: No[]): No[] {
  const [primeiro, ...resto] = nos
  const no: NoObjeto =
    primeiro && typeof primeiro === 'object' && !Array.isArray(primeiro) ? { ...primeiro } : { stack: [primeiro] }
  return [{ ...no, pageBreak: 'before' }, ...resto]
}

/**
 * Definição do documento do pdfmake (exportada para testes e para a prévia). `quebras`: grupos que começam
 * uma página nova (o equilíbrio das páginas, medido em `montarCertificado`); `medir`: com a marca do fim;
 * `diagramacao`: os respiros e a altura do gráfico (padrão, a preferida).
 */
export function definicaoCertificado(
  d: DadosCertificadoPdf,
  opcoes: { assinaturas?: boolean; quebras?: string[]; medir?: boolean; diagramacao?: Diagramacao } = {},
): NoObjeto {
  const { ritmo, grafico } = opcoes.diagramacao ?? DIAGRAMACOES[0]
  const ctx = contexto(d, ritmo)
  const conteudo: No[] = grupos(ctx, comImagens(d, opcoes), grafico).flatMap((g) => [
    ...(opcoes.quebras?.includes(g.id) && g.id !== ID_FINAL ? comQuebra(g.nos) : g.nos),
    ...(g.id !== ID_FINAL || opcoes.medir ? [marcaFim(g.id)] : []),
  ])

  const e = d.emissao
  const data = dataDoDocumento(d)
  const pe = rodape(ctx)
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
    pageMargins: [MARGEM_X, MARGEM_TOPO, MARGEM_X, pe.margemBase],
    language: 'pt-BR',
    displayTitle: true,
    info: {
      title: titulo,
      author: empresaNome(e),
      subject: `${instrumento} — ${e.cliente.razaoSocial || e.cliente.nome}`,
      keywords: ['certificado de calibração', ctx.numero, procedimento(e)].filter(Boolean).join('; '),
      creator: 'BC Calibração',
      producer: 'BC Calibração',
      creationDate: data,
      modDate: data,
    },
    header: cabecalho(ctx),
    footer: pe.no,
    background: fundo,
    ...(marcaDagua(d.marcaDagua) ? { watermark: marcaDagua(d.marcaDagua) } : {}),
    content: conteudo,
    defaultStyle: { font: 'Inter', fontSize: 8, lineHeight: 1.16, color: COR.texto },
    styles: ctx.r.estilos,
    pageBreakBefore: quebraAntes,
  }
}

/**
 * Gera o certificado de calibração em PDF. Determinístico: a data do documento é a da emissão.
 * Se a imagem de uma assinatura não puder ser desenhada, o certificado sai com a linha de assinatura.
 */
export async function gerarCertificadoPdf(d: DadosCertificadoPdf): Promise<Buffer> {
  try {
    return (await montarCertificado(d)).pdf
  } catch (erro) {
    const temImagem = !d.previa && [d.emissao.tecnico.assinatura, d.emissao.signatario.assinatura].some((a) => !vazio(a))
    if (!temImagem) throw erro
    return (await montarCertificado(d, { assinaturas: false })).pdf
  }
}

// ---- Equilíbrio das páginas ----------------------------------------------------------------------------------

/** Páginas no máximo: com mais, o gráfico encolhe e, em último caso, sai (`montarCertificado`). */
export const MAX_PAGINAS = 3
/**
 * Última página com menos que isto ocupado (fração da altura útil) num certificado de 3 páginas ou mais: a
 * montagem tenta levar uma seção inteira da penúltima para ela (nunca fica só com as declarações e as
 * assinaturas).
 */
export const OCUPACAO_MINIMA_ULTIMA = 0.5
/** Ganho mínimo (fração da página) para trocar a paginação natural pela equilibrada. */
const GANHO_MINIMO = 0.05
/** Quebras previstas conferidas no máximo (cada uma é uma montagem a mais). */
const MAX_TENTATIVAS = 2
/** Ocupação prevista da última página acima da qual a quebra não é tentada (o que passou não caberia). */
const OCUPACAO_MAXIMA_PREVISTA = 0.97

/**
 * O certificado montado: o PDF, o nº de páginas, a fração ocupada de cada página (pela marca do fim do último
 * grupo nela), os grupos que começam uma página nova e a diagramação (respiros e altura do gráfico).
 */
export interface CertificadoMontado {
  pdf: Buffer
  paginas: number
  ocupacao: number[]
  quebras: string[]
  diagramacao: Diagramacao
}

interface Medicao extends CertificadoMontado {
  /** Fim de cada grupo (id → página e altura do fim). */
  fins: Map<string, { pagina: number; topo: number }>
  /** Altura útil da página (pt), entre as margens. */
  alturaUtil: number
  /** A marca do fim ficou sozinha no alto de uma página (o fim do conteúdo encostou no pé da anterior). */
  marcaSozinha: boolean
}

async function medirCertificado(
  d: DadosCertificadoPdf,
  opcoes: { assinaturas?: boolean; quebras: string[]; diagramacao: Diagramacao },
): Promise<Medicao> {
  const definicao = definicaoCertificado(d, { ...opcoes, medir: true })
  const margemBase = (definicao.pageMargins as number[])[3]
  const util = A4.altura - margemBase - MARGEM_TOPO
  const fins = new Map<string, { pagina: number; topo: number }>()
  definicao.pageBreakBefore = (
    no: Parameters<typeof quebraAntes>[0] & { id?: string; startPosition?: { pageNumber: number; top: number } },
  ) => {
    if (no.id?.startsWith('fim:') && no.startPosition && !fins.has(no.id.slice(4)))
      fins.set(no.id.slice(4), { pagina: no.startPosition.pageNumber, topo: no.startPosition.top })
    return quebraAntes(no)
  }
  const pdf: Buffer = await pdfmake().createPdf(definicao).getBuffer()
  const final = fins.get(ID_FINAL)
  // A marca do fim sozinha no alto de uma página: o conteúdo acabou no pé da anterior (cheia)
  const marcaSozinha = !!final && final.topo <= MARGEM_TOPO + 0.5
  const paginas = (final?.pagina ?? 0) - (marcaSozinha ? 1 : 0)
  const ocupacao = Array.from({ length: paginas }, (_, i) => {
    if (marcaSozinha && i === paginas - 1) return 1
    const topos = [...fins.values()].filter((x) => x.pagina === i + 1).map((x) => x.topo)
    // Página sem o fim de nenhum grupo: um grupo que a atravessa inteira
    return topos.length ? Math.min(1, Math.max(0, (Math.max(...topos) - MARGEM_TOPO) / util)) : 1
  })
  return {
    pdf,
    paginas,
    ocupacao,
    quebras: opcoes.quebras,
    diagramacao: opcoes.diagramacao,
    fins,
    alturaUtil: util,
    marcaSozinha,
  }
}

/** A menor ocupação entre as duas últimas páginas (o que o equilíbrio aumenta). */
const menorDasUltimas = (m: Medicao) => Math.min(...m.ocupacao.slice(-2))

/**
 * Onde quebrar a página para equilibrar as duas últimas, previsto pela medição natural: tudo o que vem depois
 * do fim do grupo anterior na penúltima página passa para a última (e empurra o que já estava nela). Os
 * candidatos são os grupos que começam na penúltima página; vale o que deixa a menor das duas mais cheia, sem
 * passar do pé da última. Em ordem do melhor para o pior previsto.
 */
function quebrasPrevistas(natural: Medicao, ordem: string[]): Array<{ id: string; menor: number }> {
  const n = natural.paginas
  const [penultima, ultima] = natural.ocupacao.slice(-2)
  const util = (topo: number) => (topo - MARGEM_TOPO) / natural.alturaUtil
  return ordem
    .flatMap((id, i) => {
      const anterior = natural.fins.get(ordem[i - 1] ?? '')
      // O gráfico fica com a tabela dele (não começa a última página com a de cima meio vazia)
      if (i === 0 || id === ID_FINAL || id === 'grafico' || anterior?.pagina !== n - 1) return []
      const fica = util(anterior.topo)
      const vai = ultima + (penultima - fica)
      return vai <= OCUPACAO_MAXIMA_PREVISTA ? [{ id, menor: Math.min(fica, vai) }] : []
    })
    .sort((a, b) => b.menor - a.menor)
}

/**
 * A primeira diagramação (`DIAGRAMACOES`) com que o certificado cabe em `MAX_PAGINAS`. Se nenhuma couber, a de
 * menos páginas (a primeira no empate): apertar ou tirar o gráfico sem poupar página não ajuda ninguém.
 */
async function diagramacaoQueCabe(d: DadosCertificadoPdf, opcoes: { assinaturas?: boolean }): Promise<Medicao> {
  // Sem gráfico nos dados (nenhum ponto lido), a altura dele não muda nada: só os respiros
  const temGrafico = grupos(contexto(d), comImagens(d, opcoes), DIAGRAMACOES[0].grafico).some((g) => g.id === 'grafico')
  const medidas: Medicao[] = []
  for (const diagramacao of DIAGRAMACOES) {
    if (!temGrafico && medidas.some((x) => x.diagramacao.ritmo === diagramacao.ritmo)) continue
    const m = await medirCertificado(d, { ...opcoes, quebras: [], diagramacao })
    if (m.paginas <= MAX_PAGINAS) return m
    medidas.push(m)
  }
  return medidas.reduce((a, b) => (b.paginas < a.paginas ? b : a))
}

/**
 * Monta o certificado. Primeiro a diagramação (`diagramacaoQueCabe`: no máximo 3 páginas). Depois, com 3
 * páginas ou mais e a última quase vazia (só as declarações e as assinaturas, por exemplo), leva para ela uma
 * seção inteira da penúltima (a que deixa as duas mais parecidas), sem mudar o nº de páginas: nada de uma página
 * final só com o fim do certificado. A quebra é prevista pela medição natural e conferida montando de novo (no
 * máximo `MAX_TENTATIVAS`). Determinístico (mede e decide sempre igual).
 */
export async function montarCertificado(
  d: DadosCertificadoPdf,
  opcoes: { assinaturas?: boolean } = {},
): Promise<CertificadoMontado> {
  const natural = await diagramacaoQueCabe(d, opcoes)
  const { diagramacao } = natural
  let melhor = natural
  const n = natural.paginas
  if (n >= 3 && natural.ocupacao[n - 1] < OCUPACAO_MINIMA_ULTIMA) {
    const ordem = grupos(contexto(d, diagramacao.ritmo), comImagens(d, opcoes), diagramacao.grafico).map((g) => g.id)
    const previstas = quebrasPrevistas(natural, ordem).filter((x) => x.menor >= menorDasUltimas(natural) + GANHO_MINIMO)
    for (const { id } of previstas.slice(0, MAX_TENTATIVAS)) {
      const m = await medirCertificado(d, { ...opcoes, quebras: [id], diagramacao })
      // Conferida: o mesmo nº de páginas e as duas últimas mais equilibradas que na paginação natural
      if (m.paginas === n && menorDasUltimas(m) >= menorDasUltimas(natural) + GANHO_MINIMO) {
        melhor = m
        break
      }
    }
  }
  // A marca do fim sozinha numa página (o fim encostou no pé da anterior): monta de novo sem ela
  if (melhor.marcaSozinha) {
    const pdf = await pdfmake()
      .createPdf(definicaoCertificado(d, { ...opcoes, quebras: melhor.quebras, diagramacao }))
      .getBuffer()
    return { pdf, paginas: melhor.paginas, ocupacao: melhor.ocupacao, quebras: melhor.quebras, diagramacao }
  }
  const { pdf, paginas, ocupacao, quebras } = melhor
  return { pdf, paginas, ocupacao, quebras, diagramacao }
}

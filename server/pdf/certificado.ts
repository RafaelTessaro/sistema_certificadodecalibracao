// Certificado de calibração em PDF (A4 retrato), montado com o pdfmake só a partir dos dados
// congelados na emissão (DadosCertificadoPdf): gerar de novo dá o mesmo documento, byte a byte.
//
// Conteúdo segundo a ABNT NBR ISO/IEC 17025:2017 (7.8.2.1 e 7.8.4.1), o EURAMET cg-18 v4.0 (§8) e o
// DOQ-CGCRE-097, para laboratório NÃO acreditado: sem RBC, sem marcas do Inmetro e sem "validade"
// (docs/pesquisa/01-normas-certificado.md §3, §6 e §8). Layout em docs/pesquisa/03 §5 e 04 §5.
//
// Enxuto: só o obrigatório, em 2 páginas (3 no pior caso: ajuste com "como encontrado", reparo,
// multi-intervalo, rodoviária com substituição e conformidade). Grade de identificação compacta, resultados
// em tabelas, uma legenda só para as tabelas, sem gráfico nem desenho das posições, a ressalva das opiniões
// na linha do título e a área das assinaturas baixa. O procedimento (POP) sai no cabeçalho de toda página e
// no método. Com 3 páginas, a última nunca fica só com as declarações e as assinaturas: a montagem mede e
// leva para ela uma seção inteira da penúltima (`montarCertificado`).

import { casasDecimais, faixaDoValor, faixasOrdenadas, formatarNumero, ordemDeGrandeza } from '#shared/metrologia/index.ts'
import type { ResultadoCalculo, ResultadoPonto } from '#shared/metrologia/tipos.ts'
import {
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
  Padrao,
  Signatario,
  Unidade,
} from '#shared/tipos.ts'
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

const MARGEM_TOPO = TOPO_CABECALHO + MODULO + 17
/** Texto do rodapé: corpo, entrelinha e respiro entre a última linha de base e o fio de base. */
const RODAPE = { tamanho: 7, entrelinha: 9, respiro: 9 }
const NUM: NoObjeto = { fontFeatures: ['tnum'] }

/** Dados com 8 pt ou mais; notas e declarações com 7 pt; rótulos em versal de 6,3 pt. */
const ESTILOS: Record<string, NoObjeto> = {
  secao: { font: 'InterMedio', bold: true, fontSize: 8, color: COR.marcaTexto, characterSpacing: 0.45 },
  subsecao: { bold: true, fontSize: 8.2, color: COR.texto },
  rotulo: { font: 'InterMedio', fontSize: 6.3, color: COR.rotulo, characterSpacing: 0.2, lineHeight: 1.1 },
  valor: { fontSize: 8, lineHeight: 1.16 },
  paragrafo: { fontSize: 7.6, lineHeight: 1.26, color: COR.texto },
  th: { font: 'InterMedio', fontSize: 7, color: COR.textoSecundario, lineHeight: 1.08 },
  td: { fontSize: 8, lineHeight: 1.05 },
  nota: { fontSize: 7, color: COR.textoSecundario, lineHeight: 1.25 },
  declaracao: { fontSize: 7, lineHeight: 1.15, color: COR.texto },
}

/** Espaço mínimo (pt) que precisa sobrar abaixo de um título; menos que isso, o título vai para a próxima página. */
const ESPACO_TITULO = 70

/** Número da seção dos resultados (as seções 1 a 3 saem sempre): o texto do ajuste cita as subseções. */
const N_RESULTADOS = 4

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

function fio(cor: string = COR.fio, largura = 0.5, margem: number[] = [0, 3, 0, 4]): NoObjeto {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGURA, y2: 0, lineWidth: largura, lineColor: cor }], margin: margem }
}

/** Bloco inteiro quando pequeno; senão, divisível (com o cabeçalho das tabelas repetido). */
const bloco = (conteudo: No[], pequeno: boolean): NoObjeto => (pequeno ? inteiro(conteudo) : { stack: conteudo })

/**
 * Título de seção numerado: número e título em verde escuro, caixa alta, com um fio fino abaixo. `complemento`:
 * nota curta na mesma linha, depois do título (sem linha a mais).
 */
function secao(numero: number | string, titulo: string, espaco = ESPACO_TITULO, complemento = ''): No[] {
  return [
    {
      text: [
        { text: `${numero}`, color: COR.marca },
        { text: ` ${titulo.toUpperCase()}` },
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
      margin: [0, 7, 0, 0],
    },
    fio(COR.fio, 0.5, [0, 2.5, 0, 3.5]),
  ]
}

/** Título de subseção ("5.3 Erro de indicação"), com uma linha de complemento opcional ao lado. */
function subsecao(numero: string, titulo: string, complemento: No = '', espaco = ESPACO_TITULO - 20): NoObjeto {
  return {
    text: [
      { text: `${numero} `, color: COR.marcaTexto },
      { text: titulo },
      ...(complemento ? [{ text: ' ' }, { text: complemento, style: 'nota', bold: false, color: COR.textoSecundario }] : []),
    ],
    style: 'subsecao',
    headlineLevel: espaco,
    margin: [0, 5, 0, 2],
  }
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
  paddingRight: () => 6,
  paddingTop: () => 1,
  paddingBottom: () => 2,
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
          { text: valor, style: 'valor', margin: [0, 1, 0, 0] },
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

/** Distribui os campos em linhas de `colunas`, na ordem: um campo que não cabe no resto da linha começa outra. */
function fluir(campos: Campo[], colunas: number): Campo[][] {
  const linhas: Campo[][] = []
  let atual: Campo[] = []
  let usadas = 0
  for (const c of campos) {
    const span = Math.min(c.span ?? 1, colunas)
    if (usadas + span > colunas) {
      linhas.push(atual)
      atual = []
      usadas = 0
    }
    atual.push(c)
    usadas += span
  }
  if (atual.length) linhas.push(atual)
  return linhas
}

function paragrafo(texto: No, margem: number[] = [0, 1.5, 0, 2]): NoObjeto {
  return { text: texto, style: 'paragrafo', margin: margem }
}

/** Caixa de destaque com filete à esquerda (revisão, ajuste, reparo, opiniões). */
function destaque(
  conteudo: No,
  cor: string = COR.marca,
  fundo: string = COR.marcaFundo,
  margem: number[] = [0, 3, 0, 2],
): NoObjeto {
  return {
    table: { widths: ['*'], body: [[conteudo]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 2 : 0),
      vLineColor: () => cor,
      fillColor: () => fundo,
      paddingLeft: () => 7,
      paddingRight: () => 7,
      paddingTop: () => 3.5,
      paddingBottom: () => 3.5,
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
  paddingLeft: (i: number) => (i === 0 ? 5 : 3.5),
  paddingRight: (i: number, no: { table: { widths: unknown[] } }) => (i === no.table.widths.length - 1 ? 5 : 3.5),
  paddingTop: () => 2.2,
  paddingBottom: () => 1.9,
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
    margin: opcoes.margem ?? [0, 1, 0, 2],
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
function lista(itens: No[]): NoObjeto {
  return {
    ul: itens.map((t) => ({ text: t, style: 'paragrafo', margin: [0, 0, 0, 1] })),
    markerColor: COR.marca,
    margin: [2, 0, 0, 1],
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

/** Código do procedimento (POP) da emissão, ou '' (certificados emitidos sem ele). */
const procedimento = (e: EmissaoCertificado) => (e.textos.procedimento ?? '').trim()

// ---- 1. Dados da calibração: cliente, local, ambiente e método -------------------------------------------------

function dataEmissao(ctx: Contexto): string {
  const pelaCalibracao = formatarDataBr(ctx.k.dataEmissao)
  return pelaCalibracao || dataHoraBrasilia(ctx.e.emitidoEm)?.data || ''
}

/** Condições ambientais (início e fim), numa linha da grade dos dados da calibração. */
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

function secaoDadosCalibracao(ctx: Contexto, n: number): No[] {
  const { k, e } = ctx
  const c = e.cliente
  const pj = c.tipo === 'PJ'
  const nome = pj ? c.razaoSocial || c.nome : c.nome
  const contato = [c.contato, c.telefone || c.celular, c.email].filter((x) => !vazio(x)).join(' · ')
  const local = [LOCAIS[k.local], k.localEndereco.trim()].filter(Boolean).join(' — ')
  // O código do POP em negrito e a descrição curta; sem POP registrado, só a descrição
  const descricaoMetodo = (e.textos.procedimentoDescricao ?? '').trim()
  const metodo: No = [
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
      { rotulo: pj ? 'Cliente (razão social)' : 'Cliente', valor: { text: ou(nome), bold: true }, span: 3 },
      { rotulo: pj ? 'CNPJ' : 'CPF', valor: { text: ou(c.documento) } },
    ],
    [
      { rotulo: 'Endereço do cliente', valor: enderecoCliente(c), span: contato ? 2 : 4 },
      ...(contato ? [{ rotulo: 'Contato', valor: contato, span: 2 }] : []),
    ],
    [
      { rotulo: 'Local da calibração', valor: local, span: k.dataRecebimento ? 3 : 4 },
      ...(k.dataRecebimento ? [{ rotulo: 'Recebimento do item', valor: formatarDataBr(k.dataRecebimento) }] : []),
    ],
    linhaAmbiente(ctx),
    [{ rotulo: 'Método — procedimento (POP)', valor: metodo.length ? metodo : '—', span: 4 }],
  ]
  const blocos: No[] = [inteiro([...secao(n, 'Dados da calibração'), grade(linhas)])]
  if (!vazio(e.substituiNumero)) {
    const emitido = formatarDataBr(e.substituiEmissao) || dataHoraBrasilia(e.substituiEmissao)?.data || ''
    blocos.push(
      destaque({
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

// ---- 2. Instrumento calibrado ---------------------------------------------------------------------

/** Divisões na unidade mais legível, separadas por barra: "50 g", "2 / 5 / 10 g". */
function divisoesTexto(valores: number[], u: Unidade): string {
  if (!valores.length || valores.some((v) => !(v > 0))) return '—'
  const l = divisaoLegivel(valores, u)
  return `${l.valores.map((v) => numeroBr(v)).join(' / ')} ${l.unidade}`
}

/** Colunas da grade do instrumento: cada rótulo longo cabe numa linha (TAG na 6ª, "divisão de verificação" na 4ª). */
const LARGURAS_INSTRUMENTO = [73, 73, 73, 94, 73, '*']

const PRELIMINAR: Array<[keyof Calibracao['preliminar'], string]> = [
  ['identificavel', 'identificável'],
  ['limpa', 'limpo'],
  ['nivelada', 'nivelado'],
  ['aquecida', 'aquecido / estabilizado'],
  ['preCarga', 'pré-carga aplicada'],
]

/** Ajuste, reparo e verificação preliminar: uma ou duas frases cada. */
function condicaoDoItem(ctx: Contexto): No[] {
  const { k } = ctx
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
  const naoAtendidos = PRELIMINAR.filter(([chave]) => k.preliminar[chave] === 'NAO').map(([, t]) => t)
  const preliminar: No[] = naoAtendidos.length
    ? [{ text: '\nVerificação preliminar: ', bold: true }, `item(ns) não atendido(s): ${naoAtendidos.join(', ')}.`]
    : []
  const blocos: No[] = [destaque({ text: [...ajuste, ...preliminar], style: 'paragrafo' })]

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
        {
          text: [
            { text: 'Reparo: ', bold: true },
            `${partes.join('')}. Os serviços de reparo e manutenção não fazem parte da calibração; para o uso sujeito ao controle metrológico legal, é obrigatória a verificação após reparo ${orgao}.`,
          ],
          style: 'paragrafo',
        },
        COR.alerta,
        COR.alertaFundo,
        [0, 1.5, 0, 2],
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

  const identificacao: Campo[] = [
    {
      rotulo: 'Instrumento',
      valor: { text: `Balança ${(TIPOS_BALANCA[b.tipo] ?? 'de pesagem').toLowerCase()}`, bold: true },
      span: 2,
    },
    { rotulo: 'Fabricante', valor: b.fabricante },
    { rotulo: 'Modelo', valor: b.modelo },
    { rotulo: 'Nº de série', valor: { text: ou(b.numeroSerie) } },
    { rotulo: 'Identificação / TAG (*)', valor: b.identificacao },
  ]
  // Características metrológicas, conforme a marcação do instrumento (multi-intervalo: "6 / 15 / 33 kg");
  // a ordem põe os rótulos longos nas colunas largas da grade
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
  const metrologia: Campo[] = multi ? [max, d, e, min, classe] : [max, min, d, e, classe, { rotulo: 'Unidade', valor: u }]
  const outros: Campo[] = [
    ...(separada
      ? [
          {
            rotulo: separada.rotulo,
            valor: [separada.nome, separada.serie && `nº de série ${separada.serie}`].filter(Boolean).join(' · '),
            span: 2,
          },
        ]
      : []),
    { rotulo: 'Receptor de carga', valor: receptor, span: 2 },
    { rotulo: 'Portaria de aprovação de modelo', valor: b.portariaAprovacao, span: 2 },
    { rotulo: 'Local de instalação (*)', valor: b.localInstalacao, span: 2 },
    { rotulo: 'Finalidade de uso (*)', valor: b.finalidade ? FINALIDADES[b.finalidade] : '', span: 2 },
    { rotulo: 'Ano de fabricação', valor: b.anoFabricacao },
    ...(multi ? [{ rotulo: 'Unidade', valor: u }] : []),
  ]
  return [
    inteiro([
      ...secao(n, 'Instrumento calibrado'),
      grade([identificacao, metrologia, ...fluir(outros, 6)], LARGURAS_INSTRUMENTO),
      ...condicaoDoItem(ctx),
    ]),
  ]
}

// ---- 3. Padrões utilizados -------------------------------------------------------------------------

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
  // A rastreabilidade vem logo abaixo do título (fica com ele); a tabela pode se dividir entre as páginas (por
  // linha, com o cabeçalho de novo): inteira, ela deixaria um vão no pé da página 1 quando a identificação do
  // instrumento é longa (ajuste e reparo)
  return [
    {
      ...inteiro([
        ...secao(n, 'Padrões utilizados'),
        ...(notas.length ? [{ text: notas.join(' '), style: 'nota', margin: [0, 0, 0, 1.5] }] : []),
      ]),
      // O título e a rastreabilidade só ficam no pé da página com o cabeçalho e a 1ª linha da tabela embaixo
      // (título ≈ 25 pt, nota estimada por linhas de 7 pt e cabeçalho com a 1ª linha ≈ 80 pt)
      headlineLevel: 105 + Math.ceil((notas.join(' ').length * 7 * 0.52) / LARGURA) * 9,
    },
    tabela(
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

// ---- 4. Resultados ---------------------------------------------------------------------------------

function repetibilidade(ctx: Contexto, abertura: No[]): No[] {
  const { u } = ctx
  const resultados = ctx.d.resultado.repetibilidade.filter((r) => r.n > 0)
  const titulo = subsecao(`${N_RESULTADOS}.1`, 'Repetibilidade', 'mesma carga, repetidas vezes, no centro do receptor')
  if (!resultados.length) return [inteiro([...abertura, titulo, paragrafo('Ensaio não realizado.')])]
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
        titulo,
        tabela(
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

/** Posições por tabela da excentricidade (mais que isso, outra tabela embaixo). */
const POSICOES_POR_TABELA = 8

/** Excentricidade com as posições nas colunas: indicação e desvio ΔI em linhas. */
function excentricidade(ctx: Contexto): No[] {
  const { u, k } = ctx
  const ensaio = k.excentricidade
  const res = ctx.d.resultado.excentricidade
  const numero = `${N_RESULTADOS}.2`
  if (!ensaio.aplicavel)
    return [
      inteiro([
        subsecao(numero, 'Excentricidade'),
        paragrafo(`Ensaio não aplicável${vazio(ensaio.motivo) ? '.' : `: ${comPonto(ensaio.motivo)}`}`),
      ]),
    ]
  const carga = ensaio.carga
  const casas = casasDecimais(ctx.divisao(carga))
  const comReferencia = ensaio.metodo === 3 || ensaio.metodo === 4
  const maiorDesvio = num(res.maiorDesvio, Math.max(casas, casasDecimais(res.maiorDesvio)))
  const temMaior = res.posicaoMaior > 0 && res.maiorDesvio > 0
  const complemento: No = [
    `carga ${leitura(ctx, carga, carga)} ${u} · ${METODOS_EXCENTRICIDADE[ensaio.metodo].toLowerCase()} · maior desvio `,
    { text: `|ΔI|máx = ${maiorDesvio} ${u}`, bold: true, color: COR.texto },
    temMaior ? ` (posição ${res.posicaoMaior + 1})` : '',
  ]
  const tabelas: No[] = []
  for (let de = 0; de < ensaio.posicoes.length; de += POSICOES_POR_TABELA) {
    const indices = ensaio.posicoes.slice(de, de + POSICOES_POR_TABELA).map((_, j) => de + j)
    const celula = (i: number, valor: No): NoObjeto => ({
      ...(typeof valor === 'object' && !Array.isArray(valor) ? valor : { text: valor }),
      bold: i === res.posicaoMaior && res.maiorDesvio > 0 ? true : undefined,
    })
    const rotuloLinha = (t: string, unidade = true): NoObjeto => ({
      text: [{ text: t }, ...(unidade ? [{ text: ` (${u})`, color: COR.rotulo }] : [])],
      style: 'th',
      alignment: 'left',
      fontFeatures: undefined,
    })
    const linhas: No[][] = []
    if (comReferencia)
      linhas.push([
        rotuloLinha(ensaio.metodo === 3 ? 'Zero lido' : 'Posição 1 antes'),
        ...indices.map((i) => {
          const r = ensaio.posicoes[i].referencia
          return r === null ? '—' : leitura(ctx, r, carga)
        }),
      ])
    linhas.push([
      rotuloLinha('Indicação'),
      ...indices.map((i) => {
        const l = ensaio.posicoes[i].leitura
        return l === null ? '—' : leitura(ctx, l, carga)
      }),
    ])
    linhas.push([
      rotuloLinha('Desvio ΔI'),
      ...indices.map((i): No => {
        if (i === 0) return { text: 'referência', color: COR.rotulo, fontSize: 7 }
        const d = res.desvios[i]
        return celula(i, d === null || d === undefined ? '—' : comSinal(num(d, Math.max(casas, casasDecimais(d)))))
      }),
    ])
    tabelas.push(
      tabela(
        [
          { titulo: 'Posição', largura: 64 },
          ...indices.map((i): Coluna => ({
            titulo: [{ text: `${i + 1} `, color: COR.marcaTexto }, { text: ou(ensaio.posicoes[i].rotulo, `Posição ${i + 1}`) }],
            largura: '*',
            alinhamento: 'right',
            numerica: true,
          })),
        ],
        linhas,
        { pequena: true },
      ),
    )
  }
  return [inteiro([subsecao(numero, 'Excentricidade', complemento), ...tabelas])]
}

const DESCRICAO_METODO: Record<MetodoCarregamento, string> = {
  CRESCENTE_DECRESCENTE: 'cargas crescentes até a maior carga e depois decrescentes, sem descarregar',
  DESCONTINUO: 'cargas crescentes, com descarga entre os pontos',
  CONTINUO: 'cargas crescentes, sem descarregar entre os pontos',
  DECRESCENTE: 'cargas decrescentes, a partir da maior carga',
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
  return tabela(colunas, linhas, { pequena: linhas.length <= 12 })
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

/** Frases curtas embaixo de uma tabela de erros: cargas de substituição e retorno ao zero. */
function depoisDaTabela(ctx: Contexto, r: ResultadoCalculo, ensaio: EnsaioIndicacao): No[] {
  const { u } = ctx
  const partes: No[] = []
  if (comSubstituicao(ensaio)) {
    const pesos = cargaPecas(ctx, ensaio.substituicao.pecas)
    const etapas = ensaio.substituicao.etapas.filter((e) => e.leituraPadroes !== null && e.leituraSubstituicao !== null).length
    partes.push(
      { text: 'Cargas de substituição', bold: true },
      ` (EURAMET cg-18, 4.3.3): ${etapas} etapa${etapas === 1 ? '' : 's'}, cada uma com ${pesos > 0 ? `${leitura(ctx, pesos, pesos)} ${u} de ` : ''}pesos padrão trocados por carga de mesma indicação; incerteza das etapas incluída em U. `,
    )
  }
  if (r.erroRetornoZero !== null)
    partes.push(
      { text: 'Retorno ao zero: ', bold: true },
      'após a retirada da carga, o instrumento indicou ',
      { text: `${leitura(ctx, r.erroRetornoZero, 0)} ${u}`, bold: true },
      '.',
    )
  return partes.length ? [paragrafo(partes, [0, 0, 0, 1])] : []
}

function erroIndicacao(ctx: Contexto): No[] {
  const { k } = ctx
  const r = ctx.d.resultado
  const ensaio = k.indicacao
  const titulo = subsecao(
    `${N_RESULTADOS}.3`,
    temComoEncontrado(ctx.d) ? 'Erro de indicação — como deixado (após o ajuste)' : 'Erro de indicação',
    DESCRICAO_METODO[ensaio.metodo],
  )
  if (!pontosLidos(r).length) return [inteiro([titulo, paragrafo('Ensaio não realizado.')])]
  const tab = tabelaErros(ctx, r, ensaio, { conformidade: k.conformidade.solicitada, substituicao: comSubstituicao(ensaio) })
  return [bloco([titulo, tab, ...depoisDaTabela(ctx, r, ensaio)], pontosLidos(r).length <= 12)]
}

function comoEncontrado(ctx: Contexto): No[] {
  const r = ctx.d.comoEncontrado
  const ensaio = ctx.k.comoEncontrado
  if (!r || !ensaio || !temComoEncontrado(ctx.d)) return []
  return [
    bloco(
      [
        subsecao(`${N_RESULTADOS}.4`, 'Erro de indicação — como encontrado (antes do ajuste)', DESCRICAO_METODO[ensaio.metodo]),
        tabelaErros(ctx, r, ensaio, { conformidade: ctx.k.conformidade.solicitada, substituicao: comSubstituicao(ensaio) }),
        ...depoisDaTabela(ctx, r, ensaio),
      ],
      pontosLidos(r).length <= 12,
    ),
  ]
}

/** Uma legenda só, embaixo dos resultados: símbolos e convenções das tabelas. */
function legendaResultados(ctx: Contexto): NoObjeto {
  const { k, d } = ctx
  const ensaios = [k.indicacao, ...(temComoEncontrado(d) && k.comoEncontrado ? [k.comoEncontrado] : [])]
  const ambos = ensaios.some(ambosSentidos)
  const substituicao = ensaios.some(comSubstituicao)
  const media = k.opcoes.histerese === 'MEDIA'
  const partes = [
    `Carga: valor convencional dos pesos padrão${substituicao ? ', somado às cargas de substituição' : ''}.`,
    media && ambos
      ? 'Erro = média das indicações ↑ e ↓ − carga; a histerese está incluída na incerteza.'
      : 'Erro = indicação − carga.',
    'U: incerteza expandida; k: fator de abrangência; νeff: graus de liberdade efetivos.',
  ]
  if (ambos) partes.push('↑ / ↓: carga crescente / decrescente.')
  if (substituicao) partes.push('Subst.: nº de cargas de substituição sob os pesos.')
  if (k.conformidade.solicitada) partes.push('EMA: erro máximo admissível do critério de conformidade.')
  partes.push('s: desvio-padrão experimental (n − 1 graus de liberdade).')
  if (k.excentricidade.aplicavel) partes.push('ΔI: indicação na posição − indicação na posição 1.')
  return { text: partes.join(' '), style: 'nota', margin: [0, 2, 0, 0] }
}

/**
 * Resultados em grupos (cada subseção é um ponto onde a página pode ser quebrada, ver `montarCertificado`); a
 * legenda vai no fim do último, junto com a tabela de cima.
 */
function secaoResultados(ctx: Contexto, n: number): Grupo[] {
  const grupos: Grupo[] = [
    { id: 'repetibilidade', nos: repetibilidade(ctx, secao(n, 'Resultados')) },
    { id: 'excentricidade', nos: excentricidade(ctx) },
    { id: 'indicacao', nos: erroIndicacao(ctx) },
    { id: 'como-encontrado', nos: comoEncontrado(ctx) },
  ].filter((g) => g.nos.length)
  grupos.at(-1)!.nos.push(legendaResultados(ctx))
  return grupos
}

// ---- 5. Declaração de conformidade ----------------------------------------------------------------

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
      ? 'em todos os pontos calibrados'
      : situacao === 'NAO_CONFORME'
        ? `no(s) ponto(s) de ${naoConformes.map((p) => `${p.texto.referencia || p.texto.carga} ${u}`).join('; ')}`
        : 'não há erro máximo admissível para comparar'
  const selo = situacao === 'CONFORME' ? 'CONFORME' : situacao === 'NAO_CONFORME' ? 'NÃO CONFORME' : 'NÃO AVALIADA'
  const corSelo = situacao === 'NAO_CONFORME' ? COR.alerta : COR.marcaTexto
  const comparados = temComoEncontrado(ctx.d)
    ? `os erros de indicação “como deixado” (${N_RESULTADOS}.3)`
    : `os erros de indicação (${N_RESULTADOS}.3)`
  return [
    inteiro([
      ...secao(n, 'Declaração de conformidade'),
      paragrafo(
        `Solicitada pelo cliente: ${comparados} foram comparados, em cada ponto e sentido de carregamento, com o erro máximo admissível (EMA) do critério, segundo a regra de decisão. Esta declaração não constitui verificação metrológica legal.`,
        [0, 0, 0, 2],
      ),
      grade(
        [
          [
            { rotulo: 'Critério', valor: especificacao },
            {
              rotulo: 'Regra de decisão',
              valor: [{ text: regra.label, bold: true }, pequeno(ilac)],
            },
            {
              rotulo: 'Resultado',
              valor: [
                { text: selo, font: 'InterMedio', bold: true, characterSpacing: 0.4, color: corSelo },
                pequeno(`${selo.charAt(0)}${selo.slice(1).toLowerCase()} ${resultadoTexto}.`),
              ],
            },
          ],
        ],
        ['*', '*', 130],
      ),
    ]),
  ]
}

// ---- Observações, opiniões e declarações (numeradas na sequência) -------------------------------------------------

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
  return [inteiro([...secao(n, 'Observações'), lista(itens.slice(0, 1))]), ...(itens.length > 1 ? [lista(itens.slice(1))] : [])]
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
        ...secao(n, 'Opiniões e interpretações', ESPACO_TITULO, RESSALVA_OPINIOES),
        destaque({ text: texto, style: 'paragrafo' }, COR.grafite, COR.fundoCabecalho, [0, 0, 0, 1]),
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
      { text: `${i + 1}.`, width: 11, style: 'declaracao', color: COR.marcaTexto, bold: true },
      { text: x, width: '*', style: 'declaracao' },
    ],
    margin: [0, 0, 0, 1.2],
  }))
  return [inteiro([...secao(n, 'Declarações'), ...itens, ...fim])]
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
      fio(COR.fio, 0.5, [0, 4, 0, 3]),
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
    fio(COR.fio, 0.5, [0, 4, 0, 3]),
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
function grupos(ctx: Contexto, comImagem: boolean): Grupo[] {
  let n = 0
  const lista: Grupo[] = [
    { id: 'dados', nos: secaoDadosCalibracao(ctx, ++n) },
    { id: 'instrumento', nos: secaoInstrumento(ctx, ++n) },
    { id: 'padroes', nos: secaoPadroes(ctx, ++n) },
    ...secaoResultados(ctx, ++n),
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
 * uma página nova (o equilíbrio das páginas, medido em `montarCertificado`); `medir`: com a marca do fim.
 */
export function definicaoCertificado(
  d: DadosCertificadoPdf,
  opcoes: { assinaturas?: boolean; quebras?: string[]; medir?: boolean } = {},
): NoObjeto {
  const ctx = contexto(d)
  const conteudo: No[] = grupos(ctx, comImagens(d, opcoes)).flatMap((g) => [
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
    return (await montarCertificado(d)).pdf
  } catch (erro) {
    const temImagem = !d.previa && [d.emissao.tecnico.assinatura, d.emissao.signatario.assinatura].some((a) => !vazio(a))
    if (!temImagem) throw erro
    return (await montarCertificado(d, { assinaturas: false })).pdf
  }
}

// ---- Equilíbrio das páginas ----------------------------------------------------------------------------------

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
 * grupo nela) e os grupos que começam uma página nova.
 */
export interface CertificadoMontado {
  pdf: Buffer
  paginas: number
  ocupacao: number[]
  quebras: string[]
}

interface Medicao extends CertificadoMontado {
  /** Fim de cada grupo (id → página e altura do fim). */
  fins: Map<string, { pagina: number; topo: number }>
  /** Altura útil da página (pt), entre as margens. */
  alturaUtil: number
  /** A marca do fim ficou sozinha no alto de uma página (o fim do conteúdo encostou no pé da anterior). */
  marcaSozinha: boolean
}

async function medirCertificado(d: DadosCertificadoPdf, opcoes: { assinaturas?: boolean; quebras: string[] }) {
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
  return { pdf, paginas, ocupacao, quebras: opcoes.quebras, fins, alturaUtil: util, marcaSozinha } satisfies Medicao
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
      if (i === 0 || id === ID_FINAL || anterior?.pagina !== n - 1) return []
      const fica = util(anterior.topo)
      const vai = ultima + (penultima - fica)
      return vai <= OCUPACAO_MAXIMA_PREVISTA ? [{ id, menor: Math.min(fica, vai) }] : []
    })
    .sort((a, b) => b.menor - a.menor)
}

/**
 * Monta o certificado. Com 3 páginas ou mais e a última quase vazia (só as declarações e as assinaturas, por
 * exemplo), leva para ela uma seção inteira da penúltima (a que deixa as duas mais parecidas), sem mudar o nº
 * de páginas: nada de uma página final só com o fim do certificado. A quebra é prevista pela medição natural e
 * conferida montando de novo (no máximo `MAX_TENTATIVAS`). Determinístico (mede e decide sempre igual).
 */
export async function montarCertificado(
  d: DadosCertificadoPdf,
  opcoes: { assinaturas?: boolean } = {},
): Promise<CertificadoMontado> {
  const natural = await medirCertificado(d, { ...opcoes, quebras: [] })
  let melhor = natural
  const n = natural.paginas
  if (n >= 3 && natural.ocupacao[n - 1] < OCUPACAO_MINIMA_ULTIMA) {
    const ordem = grupos(contexto(d), comImagens(d, opcoes)).map((g) => g.id)
    const previstas = quebrasPrevistas(natural, ordem).filter((x) => x.menor >= menorDasUltimas(natural) + GANHO_MINIMO)
    for (const { id } of previstas.slice(0, MAX_TENTATIVAS)) {
      const m = await medirCertificado(d, { ...opcoes, quebras: [id] })
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
      .createPdf(definicaoCertificado(d, { ...opcoes, quebras: melhor.quebras }))
      .getBuffer()
    return { pdf, paginas: melhor.paginas, ocupacao: melhor.ocupacao, quebras: melhor.quebras }
  }
  const { pdf, paginas, ocupacao, quebras } = melhor
  return { pdf, paginas, ocupacao, quebras }
}

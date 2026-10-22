// Folha de campo (A4 retrato, preto e branco): o roteiro impresso que o técnico leva ao cliente e
// preenche à caneta, passo a passo, na ordem do serviço no local. É o registro de dados brutos da
// calibração (ABNT NBR ISO/IEC 17025:2017, 7.5): depois, cada valor é digitado no assistente — cada
// passo diz em que etapa do sistema ele entra e usa os mesmos rótulos da tela.
//
// Ordem do serviço: padrões (antes de sair) → chegada → identificação → verificação (como a balança foi
// encontrada: condições, selos, marca do Inmetro/IPEM) e ambiente no início → erro de indicação "como encontrado" → ajuste/reparo (e o erro de indicação de novo, nas
// colunas "depois do ajuste" da mesma tabela) → repetibilidade → excentricidade → ambiente no fim e
// conclusão → assinaturas. A repetibilidade e a excentricidade vêm depois da decisão de ajustar porque,
// no sistema, elas valem para a balança como foi deixada; só o erro de indicação tem "antes" e "depois"
// do ajuste (ISO/IEC 17025 7.8.4.1 d; DOQ-CGCRE-097 10.2.3).
//
// Convenção visual: fundo cinza = veio do sistema (previsto), para conferir ("□ confere" ao lado do
// rótulo) e, se estiver diferente, escrever o certo na caixa branca logo abaixo, livre na largura toda;
// caixa branca = escrever no local; caixas de marcar sempre brancas (marca-se com X o que foi feito), com a opção prevista no sistema em negrito e a
// etiqueta PREVISTO. Com balança (e, de preferência, rascunho), a folha sai pré-preenchida pelo plano
// (shared/folhaCampo.ts); sem balança, sai "em branco", para uma balança ainda não cadastrada.
// Toda página leva o nº da folha (com QR), a OS, o cliente e a balança, e a rubrica e a data: uma folha
// solta ou digitalizada sozinha continua identificável. Determinística como o certificado.
//
// Paginação medida (`montar`): a parte de um passo que passa para a página seguinte repete o título do
// passo com "(continuação)"; a tabela de pontos vai sempre inteira (só a que não cabe numa página se divide,
// com o título e o cabeçalho de novo) e, quando passa para a página seguinte, o título, a instrução e o
// método ficam na sobra desta, com o aviso "tabela na próxima página"; os pontos e as etapas de
// substituição, preenchidos intercalados, ficam na mesma página; as observações crescem no espaço que
// sobra na página delas.

import { createRequire } from 'node:module'
import {
  AJUSTES,
  capacidadeTexto,
  converterMassa,
  CRITERIOS_EMA,
  divisaoLegivel,
  ehRodoviaria,
  enderecoCliente,
  FINALIDADES,
  formatarDataBr,
  METODOS_CARREGAMENTO,
  METODOS_EXCENTRICIDADE,
  numeroBr,
  RECEPTORES,
  REGRAS_DECISAO,
  ROTULO_CLASSE,
  TIPOS_BALANCA,
} from '#shared/dominio.ts'
import {
  type CargaPlanejada,
  CRITERIO_AJUSTE,
  FORMULARIO_FOLHA_CAMPO,
  padroesPrevistos,
  planoDaFolha,
  type PlanoFolha,
  validadeDosPadroes,
} from '#shared/folhaCampo.ts'
import {
  casasDecimais,
  faixaDoValor,
  faixasOrdenadas,
  formatarNumero,
  posicoesExcentricidade,
  trechosEma,
} from '#shared/metrologia/index.ts'
import type {
  Balanca,
  CalibracaoInput,
  Cliente,
  CriterioEma,
  DadosEmpresa,
  MetodoCarregamento,
  MetodoExcentricidade,
  Padrao,
} from '#shared/tipos.ts'
import {
  A4,
  BASE_RODAPE,
  caberNaLargura,
  colunasMarca,
  dataHoraBrasilia,
  fundoTimbrado,
  inteiro,
  larguraTexto,
  MODULO,
  type No,
  type NoObjeto,
  pdfmake,
  TOPO_CABECALHO,
} from './base.ts'
import { ErroApi } from '../erros.ts'
import { diagramaExcentricidade } from './graficos.ts'
import { COR, TIMBRADO } from './marca.ts'

// ---- Entrada -----------------------------------------------------------------------------------------

export interface DadosFolhaCampo {
  /** Nº único da folha (ex.: "FC-2026-00042"): sai em todas as páginas e no QR ('' = linha para escrever). */
  numero: string
  empresa: DadosEmpresa
  /** Cliente da visita (pode vir sem balança: folha em branco já com o cliente). */
  cliente: Cliente | null
  /** Balança cadastrada; null = folha em branco (balança ainda não cadastrada). */
  balanca: Balanca | null
  /** Rascunho da calibração (pontos, cargas, padrões, OS…); null = planejar só pelo cadastro. */
  calibracao: CalibracaoInput | null
  /** Padrões cadastrados: os escolhidos no rascunho (ou, sem escolha, os ativos) são os previstos. */
  padroes: Padrao[]
  /** Técnico designado para a visita ('' = escrever). */
  tecnico: string
  /** Quando e por quem a folha foi impressa (ISO): sai na folha e é a data do documento (determinismo). */
  impressoEm: string
  impressoPor: string
}

// ---- Página, cores e tipografia ------------------------------------------------------------------------

/** Margem lateral de 12 mm: largura útil de 186 mm, sobra para a escrita sem encostar na borda. */
const MARGEM_X = 34
const LARGURA = A4.largura - 2 * MARGEM_X
/** Faixa de identificação (OS, cliente, balança) logo abaixo do timbrado, em toda página. */
const TOPO_FAIXA = TOPO_CABECALHO + MODULO + 8
const MARGEM_TOPO = TOPO_FAIXA + 22
/** Rodapé: duas linhas apoiadas no fio de base. */
const MARGEM_BASE = Math.ceil(A4.altura - BASE_RODAPE + 30)

/** Tintas neutras (R = G = B): a laser imprime só com o preto, e os cinzas sobrevivem à fotocópia. */
const T = {
  texto: '#1A1A1A',
  instrucao: '#262626',
  rotulo: '#4D4D4D',
  suave: '#626262',
  /** Fundo do que veio do sistema (≈ 11 % de preto). */
  previsto: '#E3E3E3',
  previstoTexto: '#2B2B2B',
  borda: '#4F4F4F',
  linha: '#8C8C8C',
  linhaClara: '#B5B5B5',
} as const

/**
 * Altura mínima do conteúdo das linhas de leitura e das de observação; com o padding, a linha de leitura
 * fica com ≈ 7,1 mm e a de observação, com ≈ 6,7 mm (7 mm no mínimo para a escrita à mão em prancheta,
 * contando o fio).
 */
const ALTURA_LEITURA = 17
const ALTURA_ESCRITA = 19
/**
 * Espaço livre para a escrita à mão embaixo do rótulo (e da dica) de uma caixa de escrever: com o pé da
 * linha do rótulo e o padding de baixo, ≈ 7,3 mm livres (7 mm no mínimo). A caixa cresce quando o rótulo
 * quebra em duas linhas, e o espaço livre continua o mesmo.
 */
const LIVRE_ESCRITA = 16
/** Altura da linha do modelo do formato ("____:____"), que fica no pé do espaço livre (escreve-se nela). */
const ALTURA_FORMATO = 9.5
/** Valor que veio do sistema: rótulo e uma linha de valor (a correção vai na linha de baixo). */
const ALTURA_PREVISTO = 17
/** Lado das caixas de marcar (≈ 3,9 mm). */
const LADO_CAIXA = 11
/**
 * Caixa branca de correção embaixo de um valor previsto: inteira livre para a escrita à mão (≈ 7,2 mm de
 * altura na largura toda da célula). O "□ confere" fica no valor previsto, à direita do rótulo.
 */
const ALTURA_CORRIGIR = 15

const MENOS = '−'
const num = (v: number, casas: number) => formatarNumero(v, casas).replace(/^-/, MENOS)
const vazio = (s: string | null | undefined) => !s || !s.trim()
const NBSP = ' '

/** Lista de pesos que só quebra entre as peças ("7 × 20 kg + 10 kg"): nunca entre o número e a unidade. */
const semQuebra = (s: string) =>
  s
    .split(' + ')
    .map((p) => p.replace(/ /g, NBSP))
    .join(' + ')

const requerer = createRequire(import.meta.url)
interface RetanguloQr {
  x: number
  y: number
  w: number
  h: number
}

/**
 * QR code em SVG, no tamanho que se quiser: o nó `qr` do pdfmake só usa módulos de pontos inteiros (num
 * cabeçalho de 34 pt sairiam módulos de 1 pt, pequenos demais para a câmera). A matriz vem do mesmo
 * codificador do pdfmake; a margem branca é de 2 módulos (o papel em volta completa a zona de silêncio).
 */
function qrSvg(texto: string): string {
  const { measure } = (
    requerer('pdfmake/js/qrEnc.js') as { default: { measure(no: object): { _canvas: RetanguloQr[]; _width: number } } }
  ).default
  const q = measure({ qr: texto, fit: 1000, eccLevel: 'M' })
  const [, ...modulos] = q._canvas
  const m = modulos[0]?.w ?? 1
  const lado = q._width + 4 * m
  const caminho = modulos.map((r) => `M${r.x + 2 * m} ${r.y + 2 * m}h${r.w}v${r.h}h-${r.w}z`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}"><rect width="${lado}" height="${lado}" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`
}

// ---- Peças de layout -----------------------------------------------------------------------------------

/**
 * Caixa de marcar, sempre branca: uma caixa cheia pareceria já marcada (sobretudo em fotocópia). O que o
 * sistema prevê vai no rótulo (`rotuloOpcao`).
 */
function caixa(lado = LADO_CAIXA): NoObjeto {
  return {
    canvas: [{ type: 'rect', x: 0, y: 0, w: lado, h: lado, lineWidth: 0.8, lineColor: '#333333', color: '#FFFFFF' }],
  }
}

interface Opcao {
  rotulo: No
  /** A opção que o sistema prevê: rótulo em negrito e a etiqueta PREVISTO. */
  prevista?: boolean
}

/** Etiqueta pequena ao lado da opção prevista. */
const ETIQUETA_PREVISTO: NoObjeto = {
  text: '  PREVISTO',
  font: 'InterMedio',
  bold: false,
  fontSize: 5.3,
  characterSpacing: 0.45,
  color: T.suave,
}

function rotuloOpcao(op: Opcao, tamanho: number): NoObjeto {
  const forte: No = typeof op.rotulo === 'string' ? { text: op.rotulo, bold: true } : { ...(op.rotulo as NoObjeto), bold: true }
  return { text: op.prevista ? [forte, ETIQUETA_PREVISTO] : op.rotulo, fontSize: tamanho, margin: [0, 1.6, 0, 0] }
}

/**
 * Opções lado a lado (□ Sim  □ Não  □ N/A). Espaços pelo padding da tabela, não por margem: o pdfmake
 * não reserva a margem lateral das células de largura automática e o rótulo quebraria. Sem fios
 * horizontais: mesmo sem desenhar a borda, o pdfmake reservaria 1 pt em cima e embaixo de cada linha.
 */
function opcoes(lista: Opcao[], o: { tamanho?: number; espaco?: number; vertical?: boolean } = {}): NoObjeto {
  const espaco = o.espaco ?? 10
  if (o.vertical)
    return {
      table: {
        widths: [LADO_CAIXA, '*'],
        body: lista.map((op) => [caixa(), rotuloOpcao(op, o.tamanho ?? 8)]),
      },
      layout: {
        defaultBorder: false,
        hLineWidth: () => 0,
        paddingLeft: (i: number) => (i % 2 ? 3.5 : 0),
        paddingRight: () => 0,
        paddingTop: (i: number) => (i ? 3.2 : 0),
        paddingBottom: () => 0,
      },
    }
  const celulas: No[] = []
  lista.forEach((op) => {
    celulas.push(caixa())
    celulas.push(rotuloOpcao(op, o.tamanho ?? 8))
  })
  return {
    table: { widths: lista.flatMap(() => [LADO_CAIXA, 'auto']), body: [celulas] },
    layout: {
      defaultBorder: false,
      hLineWidth: () => 0,
      paddingLeft: (i: number) => (i % 2 ? 3.5 : 0),
      paddingRight: (i: number) => (i % 2 && i < lista.length * 2 - 1 ? espaco : 0),
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  }
}

/** Unidades entre parênteses que ficam como se escrevem no rótulo em versal ("CARGA (kg)", "PRESSÃO (hPa)"). */
const UNIDADE_NO_ROTULO: Record<string, string> = { MG: 'mg', G: 'g', KG: 'kg', T: 't', HPA: 'hPa' }

/** Rótulo pequeno em versal (dentro das caixas, no canto superior esquerdo). */
const rotulo = (texto: string, extra: NoObjeto = {}): NoObjeto => ({
  text: texto.toUpperCase().replace(/\((MG|G|KG|T|HPA)\)/g, (_, u: string) => `(${UNIDADE_NO_ROTULO[u]})`),
  font: 'InterMedio',
  fontSize: 5.9,
  characterSpacing: 0.3,
  color: T.rotulo,
  lineHeight: 1.05,
  ...extra,
})

/** Célula de uma grade de campos: o conteúdo e a altura mínima da linha. */
interface Celula {
  no: NoObjeto
  altura: number
  span: number
  /** Linhas ocupadas (padrão 1). */
  linhas?: number
}

/**
 * Valor que veio do sistema (fundo cinza). `confere`: "□ confere" à direita do rótulo, para marcar quando o
 * valor está certo; diferente, o certo vai na caixa branca de baixo (`corrigir`).
 */
function previsto(titulo: string, valor: No, o: { confere?: boolean; span?: number } = {}): Celula {
  const cabeca: No = o.confere
    ? {
        table: {
          widths: ['*', 7, 'auto'],
          body: [
            [
              rotulo(titulo),
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 7, h: 7, lineWidth: 0.7, lineColor: '#333333', color: '#FFFFFF' }] },
              { text: 'confere', fontSize: 5.6, color: T.rotulo, lineHeight: 1, margin: [0, 0.8, 0, 0] },
            ],
          ],
        },
        layout: {
          defaultBorder: false,
          paddingLeft: (i: number) => (i === 2 ? 2.2 : 0),
          paddingRight: (i: number) => (i === 0 ? 3 : 0),
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      }
    : rotulo(titulo)
  return {
    no: {
      stack: [cabeca, { text: valor, fontSize: 8.7, color: T.previstoTexto, lineHeight: 1.1, margin: [0, 1.2, 0, 0] }],
      fillColor: T.previsto,
    },
    altura: ALTURA_PREVISTO,
    span: o.span ?? 1,
  }
}

/** Espaço vertical exato (uma pilha vazia só com a margem). */
const espaco = (altura: number): NoObjeto => ({ stack: [], margin: [0, altura, 0, 0] })

/**
 * Caixa branca de escrever: o rótulo no canto, a dica embaixo dele (opcional) e, livre embaixo deles, o
 * espaço da escrita (`LIVRE_ESCRITA`), com o modelo do formato no pé, à direita (__/__/____), quando há.
 * `aoLado`: letra miúda logo depois do rótulo (o previsto, "previsto: Carlos", ou quando medir): a caixa
 * fica livre para quem escreve. `altura`: altura mínima do conteúdo (a caixa nunca fica menor que o necessário).
 */
function escrever(
  titulo: string,
  o: { span?: number; altura?: number; dica?: string; formato?: string; aoLado?: string } = {},
): Celula {
  return {
    no: {
      stack: [
        o.aoLado
          ? { text: [rotulo(titulo), { text: `  ${o.aoLado}`, fontSize: 5.9, color: T.suave }], lineHeight: 1.05 }
          : rotulo(titulo),
        ...(o.dica ? [{ text: o.dica, fontSize: 6.1, color: T.suave, margin: [0, 0.8, 0, 0] }] : []),
        o.formato
          ? {
              text: o.formato,
              fontSize: 7.4,
              lineHeight: 1,
              color: T.suave,
              alignment: 'right',
              margin: [0, LIVRE_ESCRITA - ALTURA_FORMATO, 0, 0],
            }
          : espaco(LIVRE_ESCRITA),
      ],
      fillColor: '#FFFFFF',
    },
    altura: o.altura ?? 0,
    span: o.span ?? 1,
  }
}

/** Caixa branca de escrever com uma caixa de marcar no alto, à direita do rótulo ("□ o mesmo do local"). */
function escreverComCaixa(titulo: string, opcao: string, o: { span?: number } = {}): Celula {
  return {
    no: {
      stack: [
        {
          table: {
            widths: ['auto', '*', 8.5, 'auto'],
            body: [
              [
                rotulo(titulo),
                { text: '' },
                {
                  canvas: [{ type: 'rect', x: 0, y: 0, w: 8.5, h: 8.5, lineWidth: 0.7, lineColor: '#333333', color: '#FFFFFF' }],
                },
                { text: opcao, fontSize: 6.6, color: T.rotulo, margin: [0, 0.6, 0, 0] },
              ],
            ],
          },
          layout: {
            defaultBorder: false,
            paddingLeft: (i: number) => (i === 3 ? 3 : 0),
            paddingRight: (i: number) => (i === 1 ? 6 : 0),
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
        },
        // A caixa de marcar é mais alta que o rótulo: o espaço livre conta a partir dela
        espaco(LIVRE_ESCRITA - 1.5),
      ],
      fillColor: '#FFFFFF',
    },
    altura: 0,
    span: o.span ?? 1,
  }
}

/** Caixa com opções de marcar (□ kg □ t…). */
function marcar(
  titulo: string,
  lista: Opcao[],
  o: { span?: number; complemento?: No; tamanho?: number; altura?: number; vertical?: boolean; espaco?: number } = {},
): Celula {
  return {
    no: {
      stack: [
        rotulo(titulo, { margin: [0, 0, 0, 3] }),
        opcoes(lista, { tamanho: o.tamanho ?? 7.8, espaco: o.espaco ?? 9, vertical: o.vertical }),
        ...(o.complemento ? [{ text: o.complemento, fontSize: 7, color: T.suave, margin: [0, 3, 0, 0] }] : []),
      ],
      fillColor: '#FFFFFF',
    },
    altura: o.altura ?? 25,
    span: o.span ?? 1,
  }
}

/**
 * Caixa branca logo abaixo de um valor previsto (com "□ confere"): se estiver diferente, o valor certo vai
 * aqui, na largura toda da célula e com ≈ 7,2 mm de altura livre (um nº de série, uma portaria ou uma data
 * cabem à mão).
 */
function corrigir(span = 1, altura = ALTURA_CORRIGIR): Celula {
  return { no: { text: '', fillColor: '#FFFFFF' }, altura, span }
}

const LAYOUT_GRADE: NoObjeto = {
  hLineWidth: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? 0.8 : 0.5),
  vLineWidth: (i: number, no: { table: { widths: unknown[] } }) => (i === 0 || i === no.table.widths.length ? 0.8 : 0.5),
  hLineColor: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? T.borda : T.linha),
  vLineColor: (i: number, no: { table: { widths: unknown[] } }) => (i === 0 || i === no.table.widths.length ? T.borda : T.linha),
  paddingLeft: () => 4.5,
  paddingRight: () => 4.5,
  paddingTop: () => 2.3,
  paddingBottom: () => 2.5,
}

/**
 * Grade de campos (linhas de células), em colunas iguais ou com as larguras dadas. `semFioDeCima`: colada
 * embaixo de outra grade (continua a mesma caixa, com outras colunas), sem o fio de cima.
 */
function grade(
  linhas: Celula[][],
  larguras: number | Array<number | string> = 4,
  margem: number[] = [0, 0, 0, 0],
  o: { semFioDeCima?: boolean } = {},
): NoObjeto {
  const colunas = typeof larguras === 'number' ? larguras : larguras.length
  const body: No[][] = []
  const alturas: number[] = []
  // Colunas ainda ocupadas por células de várias linhas (rowSpan) das linhas de cima
  const ocupadas: number[] = Array(colunas).fill(0)
  for (const linha of linhas) {
    const celulas: No[] = []
    let usadas = 0
    let altura = 0
    const pular = () => {
      while (usadas < colunas && ocupadas[usadas] > 0) {
        ocupadas[usadas]--
        celulas.push({})
        usadas++
      }
    }
    for (const c of linha) {
      pular()
      const span = Math.min(c.span, colunas - usadas)
      if (span <= 0) break
      const n = c.linhas ?? 1
      celulas.push({ ...c.no, colSpan: span, ...(n > 1 ? { rowSpan: n } : {}) })
      for (let i = 1; i < span; i++) celulas.push({})
      for (let i = 0; i < span; i++) ocupadas[usadas + i] = n - 1
      usadas += span
      if (n === 1) altura = Math.max(altura, c.altura)
    }
    pular()
    while (usadas < colunas) {
      celulas.push({ text: '' })
      usadas++
      pular()
    }
    body.push(celulas)
    alturas.push(altura)
  }
  return {
    table: {
      widths: typeof larguras === 'number' ? Array(colunas).fill('*') : larguras,
      body,
      heights: (i: number) => alturas[i] ?? 'auto',
      dontBreakRows: true,
    },
    layout: o.semFioDeCima
      ? {
          ...LAYOUT_GRADE,
          hLineWidth: (i: number, no: { table: { body: unknown[] } }) =>
            i === 0 ? 0 : (LAYOUT_GRADE.hLineWidth as (i: number, no: unknown) => number)(i, no),
        }
      : LAYOUT_GRADE,
    margin: margem,
  }
}

interface Coluna {
  titulo: string
  unidade?: string
  largura: number | string
  alinhamento?: 'left' | 'right' | 'center'
  /** Colunas vizinhas com o mesmo grupo ganham um título comum acima (ex.: "como encontrado"). */
  grupo?: string
  /** Dica curta embaixo do título e da unidade ("só se descer"). */
  nota?: string
}

type Alinhamento = 'left' | 'right' | 'center'
type CelulaTabela = {
  tipo: 'previsto' | 'escrever' | 'numero' | 'dica'
  no?: No
  alinhamento?: Alinhamento
  /** Colunas ocupadas (padrão 1). */
  span?: number
}

const pre = (no: No, alinhamento?: Alinhamento): CelulaTabela => ({ tipo: 'previsto', no, alinhamento })
const livre = (): CelulaTabela => ({ tipo: 'escrever' })
const nro = (n: No): CelulaTabela => ({ tipo: 'numero', no: n })
/** Caixa de escrever com o previsto em letra miúda no canto ("previsto: TH-01"). */
const dica = (n: No, span?: number): CelulaTabela => ({ tipo: 'dica', no: n, span })

/**
 * Tabela de leituras: unidade no cabeçalho, linhas altas, previsto em cinza e escrita em branco. `idLinhas`:
 * marca cada linha (no texto da primeira célula) com `${idLinhas}:${i}`, para a montagem achar a página dela;
 * `primeiraLinha`: o índice da primeira linha (um pedaço de uma tabela dividida entre as páginas).
 */
function tabelaLeituras(
  colunas: Coluna[],
  linhas: CelulaTabela[][],
  o: { altura?: number; margem?: number[]; idLinhas?: string; primeiraLinha?: number } = {},
): NoObjeto {
  const tituloColuna = (c: Coluna): NoObjeto => ({
    stack: [
      { text: c.titulo, font: 'InterMedio', fontSize: 6.8, color: T.texto, lineHeight: 1.05 },
      ...(c.unidade !== undefined
        ? [{ text: c.unidade ? `(${c.unidade})` : ' ', fontSize: 6.5, color: T.rotulo, margin: [0, 0.4, 0, 0] }]
        : []),
      ...(c.nota ? [{ text: c.nota, fontSize: 5.9, color: T.suave, lineHeight: 1.05, margin: [0, 0.6, 0, 0] }] : []),
    ],
    alignment: c.alinhamento ?? 'left',
  })
  // Início de cada grupo de colunas (fio vertical mais forte à esquerda dele)
  const iniciosGrupo = new Set(colunas.flatMap((c, i) => (c.grupo && colunas[i - 1]?.grupo !== c.grupo ? [i] : [])))
  const cabecalho: No[][] = []
  if (iniciosGrupo.size) {
    const topo: No[] = []
    const baixo: No[] = []
    colunas.forEach((c, i) => {
      if (!c.grupo) {
        topo.push({ ...tituloColuna(c), rowSpan: 2 })
        baixo.push({})
        return
      }
      if (iniciosGrupo.has(i)) {
        let span = 1
        while (colunas[i + span]?.grupo === c.grupo) span++
        topo.push({
          text: c.grupo.toUpperCase(),
          colSpan: span,
          font: 'InterMedio',
          bold: true,
          fontSize: 6.3,
          characterSpacing: 0.35,
          color: T.texto,
          alignment: 'center',
        })
      } else topo.push({})
      baixo.push(tituloColuna(c))
    })
    cabecalho.push(topo, baixo)
  } else cabecalho.push(colunas.map(tituloColuna))
  const nCabecalho = cabecalho.length
  const celula = (cel: CelulaTabela, i: number, id?: string): NoObjeto => {
    const alinhamento = cel.alinhamento ?? colunas[i].alinhamento ?? 'left'
    // A marca da linha vai num texto (o pdfmake corrige a página do texto de uma linha que passou inteira
    // para a página seguinte)
    const marcaLinha = id ? { id } : {}
    if (cel.tipo === 'escrever') return { text: id ? ' ' : '', fontSize: 1, ...marcaLinha, fillColor: '#FFFFFF' }
    if (cel.tipo === 'dica')
      return {
        text: cel.no ?? '',
        fontSize: 6.2,
        lineHeight: 1.1,
        color: T.suave,
        fillColor: '#FFFFFF',
        ...(cel.alinhamento ? { alignment: cel.alinhamento } : {}),
        ...marcaLinha,
      }
    if (cel.tipo === 'numero')
      return {
        text: cel.no ?? '',
        font: 'InterMedio',
        fontSize: 7.4,
        color: T.rotulo,
        alignment: 'center',
        verticalAlignment: 'middle',
        fillColor: '#FFFFFF',
        ...marcaLinha,
      }
    return {
      stack: [cel.no && typeof cel.no === 'object' && !Array.isArray(cel.no) ? cel.no : { text: cel.no ?? '' }],
      fontSize: 8.3,
      lineHeight: 1.08,
      color: T.previstoTexto,
      alignment: alinhamento,
      verticalAlignment: 'middle',
      fillColor: T.previsto,
      fontFeatures: ['tnum'],
    }
  }
  const primeira = o.primeiraLinha ?? 0
  const corpo = linhas.map((l, j) => {
    const out: No[] = []
    let coluna = 0
    l.forEach((cel, k) => {
      const span = Math.max(1, cel.span ?? 1)
      const id = o.idLinhas && k === 0 ? `${o.idLinhas}:${primeira + j}` : undefined
      out.push({ ...celula(cel, coluna, id), ...(span > 1 ? { colSpan: span } : {}) })
      for (let x = 1; x < span; x++) out.push({})
      coluna += span
    })
    return out
  })
  const altura = o.altura ?? ALTURA_LEITURA
  const externa = (i: number, n: number) => i === 0 || i === n
  return {
    table: {
      headerRows: nCabecalho,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: colunas.map((c) => c.largura),
      heights: (i: number) => (i < nCabecalho ? 'auto' : altura),
      body: [...cabecalho, ...corpo],
    },
    layout: {
      hLineWidth: (i: number, no: { table: { body: unknown[] } }) =>
        externa(i, no.table.body.length) ? 0.8 : i === nCabecalho ? 0.9 : 0.5,
      vLineWidth: (i: number, no: { table: { widths: unknown[] } }) =>
        externa(i, no.table.widths.length) ? 0.8 : iniciosGrupo.has(i) ? 1.3 : 0.5,
      hLineColor: (i: number, no: { table: { body: unknown[] } }) =>
        externa(i, no.table.body.length) || i === nCabecalho ? T.borda : T.linha,
      vLineColor: (i: number, no: { table: { widths: unknown[] } }) =>
        externa(i, no.table.widths.length) || iniciosGrupo.has(i) ? T.borda : T.linha,
      paddingLeft: () => 3.5,
      paddingRight: () => 3.5,
      paddingTop: (i: number) => (i < nCabecalho ? 2.6 : 1.5),
      paddingBottom: (i: number) => (i < nCabecalho ? 2.2 : 1.5),
    },
    margin: o.margem ?? [0, 0, 0, 0],
  }
}

/** Linhas-guia para texto livre (observações); `previstoTexto` sai em cinza na primeira linha. */
function linhasGuia(quantas: number, titulo: string, dica = '', previstoTexto = ''): NoObjeto {
  const body: No[][] = [
    [
      {
        text: [
          rotulo(titulo),
          ...(dica ? [{ text: `   ${dica}`, fontSize: 6.3, color: T.suave }] : []),
          ...(previstoTexto ? [{ text: `\n${previstoTexto}`, fontSize: 7.8, color: T.previstoTexto }] : []),
        ],
        fillColor: previstoTexto ? T.previsto : undefined,
      },
    ],
    ...Array.from({ length: quantas }, () => [{ text: '' }]),
  ]
  return {
    table: { widths: ['*'], body, heights: (i: number) => (i === 0 ? 'auto' : ALTURA_ESCRITA) },
    layout: {
      hLineWidth: (i: number, no: { table: { body: unknown[] } }) =>
        i === 0 || i === no.table.body.length ? 0.8 : i === 1 && !previstoTexto ? 0 : 0.5,
      vLineWidth: () => 0.8,
      hLineColor: (i: number, no: { table: { body: unknown[] } }) =>
        i === 0 || i === no.table.body.length ? T.borda : T.linhaClara,
      vLineColor: () => T.borda,
      hLineStyle: (i: number, no: { table: { body: unknown[] } }) =>
        i > 1 && i < no.table.body.length ? { dash: { length: 1.2, space: 1.8 } } : null,
      paddingLeft: () => 4.5,
      paddingRight: () => 4.5,
      paddingTop: (i: number) => (i === 0 ? 2.8 : 0),
      paddingBottom: (i: number) => (i === 0 && previstoTexto ? 2.5 : 0),
    },
  }
}

/** Instrução curta do passo (o que fazer, na ordem), alinhada ao título. */
function instrucao(texto: No, margem: number[] = [21, 0, 0, 3.5]): NoObjeto {
  return { text: texto, fontSize: 7.8, lineHeight: 1.2, color: T.instrucao, margin: margem }
}

/** Nota pequena (regras, avisos de digitação). */
function nota(texto: No, margem: number[] = [0, 3, 0, 0]): NoObjeto {
  return { text: texto, fontSize: 6.8, lineHeight: 1.24, color: T.suave, margin: margem }
}

/** Subtítulo dentro de um passo. */
function subtitulo(texto: string, margem: number[] = [0, 7, 0, 3]): NoObjeto {
  return { text: texto, font: 'InterMedio', bold: true, fontSize: 7.6, color: T.texto, margin: margem }
}

/**
 * Título de um passo: nº num quadrado verde, o nome e, à direita, a etapa do sistema onde ele é digitado.
 * `continuacao`: a parte do passo que passou para a página seguinte repete o título, com "(continuação)".
 */
function tituloPasso(n: number, titulo: string, sistema: string, continuacao = false): NoObjeto {
  // A continuação é mais baixa (≈ 4 mm): só lembra de que passo é a parte que abre a página
  const lado = continuacao ? 11 : 14
  const corpo = continuacao ? 7.4 : 8.8
  return {
    table: {
      widths: [lado, '*', 'auto'],
      body: [
        [
          {
            text: String(n),
            font: 'Poppins',
            fontSize: continuacao ? 7.2 : 8.8,
            color: '#FFFFFF',
            fillColor: COR.marcaTexto,
            alignment: 'center',
            margin: [0, continuacao ? 0.9 : 1.3, 0, 0],
          },
          {
            text: [
              { text: titulo.toUpperCase() },
              ...(continuacao
                ? [{ text: '  (CONTINUAÇÃO)', bold: false, fontSize: 6.4, characterSpacing: 0.3, color: T.rotulo }]
                : []),
            ],
            font: 'InterMedio',
            bold: true,
            fontSize: corpo,
            characterSpacing: 0.35,
            color: T.texto,
            margin: [continuacao ? 6 : 7, continuacao ? 1.6 : 2.3, 0, 0],
          },
          {
            text: [{ text: 'NO SISTEMA  ', font: 'InterMedio', fontSize: 5.7, characterSpacing: 0.4 }, { text: sistema }],
            fontSize: 6.9,
            color: T.rotulo,
            alignment: 'right',
            margin: [6, continuacao ? 2.2 : 3.6, 0, 0],
          },
        ],
      ],
      heights: [lado],
    },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? (continuacao ? 0.6 : 0.9) : 0),
      hLineColor: () => (continuacao ? T.linha : T.texto),
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 3],
  }
}

/**
 * Parte de um passo depois da primeira: passa inteira para a página seguinte quando não cabe. Com `id`,
 * a montagem acha onde ela ficou (as observações); `quebra`: começa sempre uma página nova; `partivel`:
 * pode se dividir entre as páginas (uma tabela maior que a página; o cabeçalho dela se repete).
 */
interface ParteComId {
  parte: No
  id: string
  quebra?: boolean
  partivel?: boolean
}
type Parte = No | ParteComId

const eParte = (p: Parte): p is ParteComId => !!p && typeof p === 'object' && !Array.isArray(p) && 'parte' in p

/** Id da parte i (1, 2…) do passo n, quando ela não tem um próprio. */
const idParte = (n: number, i: number) => `parte-${n}-${i}`

/**
 * Um passo do roteiro: título, instrução e a primeira parte ficam juntos; as demais partes passam
 * inteiras para a página seguinte quando não cabem. A parte que abre uma página (medido na montagem,
 * `Extras.continuacoes`) repete o título do passo com "(continuação)": nada fica solto no alto da página.
 * Um bloco inteiro mais alto que a página é descartado pelo pdfmake, sem erro: a montagem percebe pela
 * marca do fim dele (`descartados`) e monta de novo com `Extras.semBlocos`, em que só o título e a
 * instrução ficam juntos e o resto se divide onde a página acaba.
 */
function passo(
  ctx: Contexto,
  n: number,
  titulo: string,
  sistema: string,
  texto: No | null,
  primeira: No[],
  resto: Parte[] = [],
): No[] {
  const topo = [tituloPasso(n, titulo, sistema), ...(texto ? [instrucao(texto)] : [])]
  if (ctx.extras.semBlocos)
    return [
      { ...inteiro(topo), id: `passo-${n}`, margin: [0, 5, 0, 0] },
      marca(`fim:passo-${n}`),
      ...primeira,
      ...resto.flatMap((r, i): No[] => {
        const { parte, id } = eParte(r) ? r : { parte: r, id: idParte(n, i + 1) }
        return [{ stack: [parte], id: `solto-${id}` }, marca(`fim:solto-${id}`)]
      }),
    ]
  const cabeca = inteiro([...topo, ...primeira])
  return [
    { ...cabeca, id: `passo-${n}`, margin: [0, 5, 0, 0] },
    marca(`fim:passo-${n}`),
    ...resto.flatMap((r, i): No[] => {
      const { parte, id, quebra, partivel } = eParte(r) ? r : { parte: r, id: idParte(n, i + 1), quebra: false, partivel: false }
      // Pode se dividir: não ganha título de continuação (fica fora da medição das partes, `parte-…`)
      if (partivel) return [{ stack: [parte], id: `partivel-${id}` }, marca(`fim:partivel-${id}`)]
      const continua = quebra || ctx.extras.continuacoes.includes(id)
      return [
        {
          ...inteiro([...(continua ? [tituloPasso(n, titulo, sistema, true)] : []), parte]),
          id,
          ...(quebra ? { pageBreak: 'before' } : {}),
        },
        marca(`fim:${id}`),
      ]
    }),
  ]
}

/**
 * Marca invisível (≈ 0,1 pt) logo depois de um bloco, fora dele: a montagem lê em que página e altura ela
 * ficou (o bloco inteiro informa a posição de antes de passar para a página seguinte; a marca, a de depois).
 */
const marca = (id: string): NoObjeto => ({ text: ' ', id, fontSize: 0.1, lineHeight: 1 })

// ---- Contexto -----------------------------------------------------------------------------------------------

interface Contexto {
  d: DadosFolhaCampo
  b: Balanca | null
  k: CalibracaoInput | null
  plano: PlanoFolha | null
  /** Unidade da indicação para os cabeçalhos ('' na folha em branco). */
  u: string
  impresso: { data: string; hora: string } | null
  /**
   * Data em que os padrões precisam estar em dia (ISO): a prevista no rascunho ou, sem ela ou se ela já
   * passou, a da impressão (em Brasília).
   */
  data: string
  /** O que a montagem mediu e acrescenta (títulos de continuação, linhas de observação a mais). */
  extras: Extras
}

/** O que a montagem acrescenta depois de medir a folha (ver `montar`). */
export interface Extras {
  /** Partes de passo que abrem uma página: saem com o título do passo e "(continuação)". */
  continuacoes: string[]
  /** Linhas a mais nas observações, no espaço que sobra no fim da página onde elas estão. */
  linhas: number
  /**
   * Tabela de pontos longa (não cabe numa página) dividida entre as páginas: as linhas que abrem cada página
   * nova (medidas na montagem; vazio = a tabela inteira).
   */
  cortes: number[]
  /**
   * Só na montagem, para medir onde a tabela de pontos se divide: o passo sai solto, sem blocos inteiros
   * ('pagina-nova': começando numa página nova).
   */
  medirPontos?: 'aqui' | 'pagina-nova'
  /**
   * A tabela dos pontos passou inteira para a página seguinte: o pé da página do título do passo diz onde
   * ela está ("tabela na próxima página").
   */
  avisoPontos?: boolean
  /**
   * Linhas da "Observações (continuação)" no alto da página seguinte, logo depois das observações e antes
   * das opiniões (0 = sem continuação).
   */
  continuacao: number
  /**
   * A última página ficaria só com as assinaturas e mais da metade em branco: as observações (e as opiniões)
   * passam para ela, com o título do passo e "(continuação)", e crescem lá.
   */
  observacoesAdiante?: boolean
  /**
   * Montagem de segurança, quando algum bloco inteiro não coube numa página (e sumiria): só o título e a
   * instrução de cada passo ficam juntos; as tabelas se dividem onde a página acaba, com o cabeçalho de novo.
   */
  semBlocos?: boolean
}

const SEM_EXTRAS: Extras = { continuacoes: [], linhas: 0, continuacao: 0, cortes: [] }

/** Data ISO (AAAA-MM-DD) de um instante, no horário de Brasília. */
function dataIsoBrasilia(iso: string): string {
  const b = dataHoraBrasilia(iso)
  return b ? b.data.split('/').reverse().join('-') : iso.slice(0, 10)
}

function contexto(d: DadosFolhaCampo, extras: Extras = SEM_EXTRAS): Contexto {
  // A validade dos padrões vale na visita: na data do rascunho ou, se ela já passou (o rascunho nasce com a
  // data do dia em que foi criado), na da impressão
  const impressao = dataIsoBrasilia(d.impressoEm)
  const prevista = d.calibracao?.dataCalibracao ?? ''
  const data = prevista > impressao ? prevista : impressao
  const plano = d.balanca ? planoDaFolha(d.calibracao, d.balanca, d.padroes, data) : null
  return {
    d,
    b: d.balanca,
    k: d.calibracao,
    plano,
    u: d.balanca?.unidade ?? '',
    impresso: dataHoraBrasilia(d.impressoEm),
    data,
    extras,
  }
}

/**
 * A folha leva as substituições (coluna nos pontos e a tabela das etapas): em branco (pode ser uma
 * rodoviária), com a substituição no plano ou numa rodoviária (a mesma condição da tela do assistente).
 */
const comSubstituicao = (ctx: Contexto) => !ctx.plano || ctx.plano.substituicao.ativa || (!!ctx.b && ehRodoviaria(ctx.b))

/** Divisão na unidade mais legível: "2 g", "0,05 kg" → "50 g". */
function divisaoTexto(valor: number, unidade: Balanca['unidade']): string {
  const { valores, unidade: u } = divisaoLegivel([valor], unidade)
  return `${numeroBr(valores[0])} ${u}`
}

/** Carga nas casas da divisão (o técnico vê quantos dígitos a leitura tem). */
const cargaTexto = (carga: number, d: number) => num(carga, Math.max(casasDecimais(d), casasDecimais(carga)))

/** Carga nas casas da divisão daquela carga (multi-intervalo: a do intervalo parcial), como na tabela de pontos. */
function cargaNaDivisao(ctx: Contexto, carga: number): string {
  const b = ctx.b
  return b && b.faixas.length ? cargaTexto(carga, faixaDoValor(carga, b).d) : numeroBr(carga)
}

/** "do prato" (balanças pequenas e prato redondo) ou "da plataforma". */
function centro(b: Balanca | null): string {
  if (!b) return 'do prato ou da plataforma'
  const max = faixasOrdenadas(b.faixas).at(-1)?.max ?? 0
  return b.receptor === 'CIRCULAR' || converterMassa(max, b.unidade, 'kg') <= 60 ? 'do prato' : 'da plataforma'
}

/** Unidade para os cabeçalhos das tabelas. */
const unidadeColuna = (ctx: Contexto) => ctx.u || 'unid.'

/**
 * Etapas do assistente da calibração (src/pages/CalibracaoForm.tsx), com o número e o nome da tela:
 * cada passo da folha diz em qual delas o que foi anotado é digitado.
 */
export const ETAPAS_SISTEMA = {
  cliente: '1 · Cliente e OS',
  balanca: '2 · Balança e ajuste',
  padroes: '3 · Padrões e ambiente',
  repetibilidade: '4 · Repetibilidade',
  excentricidade: '5 · Excentricidade',
  indicacao: '6 · Erro de indicação',
  conclusao: '7 · Conclusão',
  revisao: '8 · Revisão e emissão',
} as const
const E = ETAPAS_SISTEMA
const e2 = (a: string, b: string) => `${a} · ${b}`

/** Marca de campo obrigatório para emitir. */
const OBRIG = ' ●'

/** Números dos passos da folha (as instruções e o roteiro de digitação citam uns aos outros). */
const N = {
  padroes: 1,
  chegada: 2,
  balanca: 3,
  verificacao: 4,
  indicacao: 5,
  ajuste: 6,
  repetibilidade: 7,
  excentricidade: 8,
  encerramento: 9,
  assinaturas: 10,
} as const

/**
 * Roteiro de digitação: de quais passos da folha sai cada etapa do assistente, na ordem da tela
 * (a folha segue a ordem do serviço no local; o escritório digita na ordem do sistema). As anotações
 * internas do passo 9 (leituras a mais, posições extras, o que foi combinado) são um campo da etapa 1.
 */
export const ROTEIRO_DIGITACAO: Array<{ etapa: string; passos: string }> = [
  { etapa: E.cliente, passos: `${N.chegada}, ${N.encerramento} (Anotações internas) e ${N.assinaturas}` },
  { etapa: E.balanca, passos: `${N.balanca}, ${N.verificacao} e ${N.ajuste}` },
  { etapa: E.padroes, passos: `${N.padroes}, ${N.verificacao} e ${N.encerramento}` },
  { etapa: E.repetibilidade, passos: `${N.repetibilidade}` },
  { etapa: E.excentricidade, passos: `${N.excentricidade}` },
  { etapa: E.indicacao, passos: `${N.indicacao}` },
  { etapa: E.conclusao, passos: `${N.verificacao} (divisão) e ${N.encerramento}` },
]

// ---- Introdução (página 1) -----------------------------------------------------------------------------

function introducao(): No[] {
  const amostra = (fundo: string): NoObjeto => ({
    canvas: [{ type: 'rect', x: 0, y: 0, w: 15, h: 9, lineWidth: 0.6, lineColor: T.borda, color: fundo }],
    margin: [0, 0.6, 0, 0],
  })
  const titulo = (t: string) => ({ text: `${t}  `, font: 'InterMedio', bold: true, fontSize: 6.5, characterSpacing: 0.35 })
  const regras: No[] = [
    {
      text: [
        titulo('COMO ANOTAR E CORRIGIR'),
        'Caneta azul ou preta, na hora da leitura (nada de lápis ou corretivo); a indicação como no mostrador, com todos os dígitos e o sinal. ',
        { text: 'Para corrigir: ', bold: true },
        'um risco só sobre o valor errado (continua legível), o certo ao lado, rubrica e data. Duvidosa: repita e anote as duas. ',
        { text: 'Dado do sistema: ', bold: true },
        'certo, marque “confere”; diferente, escreva o certo na caixa branca embaixo. Grampeie as folhas.',
      ],
    },
  ]
  // Legenda numa linha: o que cada fundo quer dizer
  const item = (desenho: NoObjeto, texto: No): No[] => [desenho, { text: texto, fontSize: 6.7, lineHeight: 1.12 }]
  const legenda: NoObjeto = {
    table: {
      widths: [15, 'auto', 15, 'auto', 15, 'auto', 8, 'auto'],
      body: [
        [
          ...item(amostra(T.previsto), [{ text: 'Do sistema: ', bold: true }, 'confira']),
          ...item(amostra('#FFFFFF'), [{ text: 'Escreva no local', bold: true }]),
          ...item({ ...caixa(9), margin: [3, 0.6, 0, 0] }, [
            { text: 'Marque com X', bold: true },
            ' ·',
            { ...ETIQUETA_PREVISTO, text: ' PREVISTO' },
            ' = do sistema',
          ]),
          { text: '●', color: COR.marcaTexto, fontSize: 7, margin: [0, -0.4, 0, 0] },
          { text: [{ text: 'Obrigatório para emitir', bold: true }, ' · (*) dado do cliente'], fontSize: 6.7 },
        ],
      ],
    },
    layout: {
      defaultBorder: false,
      paddingLeft: (i: number) => (i % 2 ? 4 : i ? 12 : 0),
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  }
  return [
    {
      table: {
        widths: ['*'],
        body: [[{ stack: regras, fontSize: 6.8, lineHeight: 1.2 }], [{ ...legenda, fillColor: '#FAFAFA' }]],
      },
      layout: {
        hLineWidth: (i: number) => (i === 1 ? 0.5 : 0.8),
        vLineWidth: () => 0.8,
        hLineColor: (i: number) => (i === 1 ? T.linhaClara : T.borda),
        vLineColor: () => T.borda,
        paddingLeft: () => 7,
        paddingRight: () => 7,
        paddingTop: (i: number) => (i ? 3.5 : 4.5),
        paddingBottom: (i: number) => (i ? 3 : 4),
      },
    },
  ]
}

// ---- 1. Antes de sair: padrões -------------------------------------------------------------------------

/**
 * Linhas da tabela dos padrões a partir das quais ela pode se dividir entre as páginas, com o cabeçalho de
 * novo (folha em branco de uma empresa com muitos padrões): inteira, ela não caberia na página 1 e sumiria.
 */
const LINHAS_PADROES_INTEIRA = 20

function passoPadroes(ctx: Contexto, n: number): No[] {
  const { d, plano } = ctx
  // Sem plano (em branco ou só do cliente), a validade é conferida do mesmo jeito, na data da visita ou da impressão
  const semPlano = plano ? null : validadeDosPadroes(padroesPrevistos(ctx.k, d.padroes), ctx.data)
  const todos = plano?.padroes ?? semPlano!.itens.map((x) => ({ ...x, separar: '', naFolha: true }))
  // Com o plano, inteiros só os que vão a campo; os outros previstos no sistema, numa linha
  const previstos = todos.filter((p) => p.naFolha)
  const outros = todos.filter((p) => !p.naFolha)
  const validade = (p: Padrao, situacao: string): No => {
    const data = formatarDataBr(p.validade) || '—'
    if (situacao === 'VENCIDO') return { text: [{ text: data }, { text: ' VENCIDO', bold: true, color: T.texto }] }
    if (situacao === 'VENCENDO') return { text: [{ text: data }, { text: '\nvence em breve', fontSize: 6.4 }] }
    return data
  }
  const linhas: CelulaTabela[][] = previstos.map(({ padrao: p, situacao, separar }) => [
    livre(),
    livre(),
    pre({ text: p.identificacao || '—', bold: true }),
    pre({
      text: [{ text: p.descricao || p.tipo }, ...(p.classe ? [{ text: ` · ${p.classe}`, color: T.suave }] : [])],
      fontSize: 7.4,
    }),
    // Sem plano, as peças de cada jogo são escritas no local (caixa branca); instrumento não tem peças
    // Lista longa de peças (um jogo inteiro) em letra um pouco menor, como a descrição: quebra menos
    plano
      ? pre(
          separar.length > 28
            ? { text: semQuebra(separar), fontSize: 7.4 }
            : semQuebra(separar) || (p.tipo === 'PESOS' ? '—' : 'levar'),
          'left',
        )
      : p.tipo === 'PESOS'
        ? livre()
        : pre('—', 'center'),
    pre({ text: p.certificado || '—', fontSize: 7.4 }),
    pre(validade(p, situacao), 'right'),
  ])
  linhas.push([livre(), livre(), livre(), livre(), livre(), livre(), livre()])
  const longa = linhas.length > LINHAS_PADROES_INTEIRA
  const tabela = tabelaLeituras(
    [
      { titulo: 'Levado', largura: 26, alinhamento: 'center' },
      { titulo: 'Usado', largura: 24, alinhamento: 'center' },
      { titulo: 'Identificação', largura: 70 },
      { titulo: 'Descrição', largura: '*' },
      // Larga: a lista de peças de um jogo ("10 kg + 5 kg + 2 × 2 kg + 1 kg + 500 g…") quebra menos
      { titulo: plano ? 'Separar (peças previstas)' : 'Peças usadas', largura: 112 },
      { titulo: 'Certificado nº', largura: 72 },
      { titulo: 'Próxima calibração', largura: 64, alinhamento: 'right' },
    ],
    linhas,
    { altura: 15 },
  )
  const outrosTexto: No[] = outros.length
    ? [
        nota([
          { text: 'Também previstos no sistema, mas o plano não usa: ', bold: true, color: T.texto },
          ...outros.flatMap((p, i) => [
            ...(i ? [' · '] : []),
            { text: p.padrao.identificacao || p.padrao.descricao || '—', bold: true },
            ...(p.situacao === 'VENCIDO' ? [' (vencido)'] : []),
          ]),
          '. Levou algum? Anote na linha em branco.',
        ]),
      ]
    : []
  const avisos = plano?.avisos ?? semPlano!.avisos
  const aviso: No[] = avisos.length
    ? [
        {
          table: {
            widths: ['*'],
            body: [[{ text: [{ text: 'Resolva antes de sair: ', bold: true }, avisos.join(' ')], fontSize: 7.4 }]],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 2.2 : 0),
            vLineColor: () => T.texto,
            paddingLeft: () => 7,
            paddingTop: () => 2,
            paddingBottom: () => 2,
          },
          margin: [0, 4, 0, 0],
        },
      ]
    : []
  const texto: No = plano
    ? `Separe os padrões e as peças previstas (${plano.origem === 'RASCUNHO' ? 'pontos, cargas e posições planejados no sistema' : 'pontos, cargas e posições sugeridos pelo sistema'}) e marque “levado”; no cliente, “usado”.`
    : 'Folha em branco, para balança ainda não cadastrada: marque os padrões levados e, no cliente, os usados.'
  const titulo = 'Antes de sair: padrões'
  // Muitos padrões (folha em branco): a tabela se divide entre as páginas, com o cabeçalho de novo
  if (longa)
    return passo(
      ctx,
      n,
      titulo,
      E.padroes,
      texto,
      [],
      [{ parte: { stack: [tabela, ...outrosTexto, ...aviso] }, id: idParte(n, 1), partivel: true }],
    )
  return passo(ctx, n, titulo, E.padroes, texto, [tabela, ...outrosTexto, ...aviso])
}

// ---- 2. Chegada: cliente e OS ---------------------------------------------------------------------------

function passoChegada(ctx: Contexto, n: number): No[] {
  const { d, k } = ctx
  const c = d.cliente
  const os = k?.ordemServico?.trim() ?? ''
  const tecnico = d.tecnico.trim()
  const endereco = k?.localEndereco?.trim() || (c ? enderecoCliente(c) : '')
  const local = k?.local ?? null
  const anotacoes = k?.anotacoesInternas?.trim() ?? ''
  // A data do rascunho só é "prevista" quando foi marcada para a frente (o rascunho nasce com a data do dia)
  const impressoIso = d.impressoEm.slice(0, 10)
  const prevista = k?.dataCalibracao && k.dataCalibracao > impressoIso ? formatarDataBr(k.dataCalibracao) : ''
  const ondeFoi = marcar(
    'Onde a calibração foi feita',
    [
      { rotulo: 'nas instalações do cliente', prevista: local === 'CLIENTE' },
      { rotulo: 'no laboratório da empresa', prevista: local === 'LABORATORIO' },
    ],
    { vertical: true, tamanho: 7.4 },
  )
  // O técnico previsto é só uma dica, ao lado do rótulo: quem foi de fato escreve o nome na caixa livre (é o
  // que vai para o sistema)
  const dados: Celula[] = [
    os ? previsto('Nº da ordem de serviço', os) : escrever('Nº da ordem de serviço'),
    escrever(`Técnico que executou${OBRIG}`, { aoLado: tecnico ? `previsto: ${tecnico}` : '' }),
    escrever(`Data da calibração${OBRIG}`, { formato: '____/____/________', aoLado: prevista ? `prevista: ${prevista}` : '' }),
    escrever('Hora de início', { formato: '____:____' }),
  ]
  // Recados de acesso (portaria, EPI, contato) vêm primeiro: são para a chegada
  const recado: Celula[][] = anotacoes
    ? [[previsto('Anotações internas · acesso, contato, EPI (não saem no certificado)', anotacoes, { span: 4 })]]
    : []
  let linhas: Celula[][]
  if (c) {
    const pj = c.tipo === 'PJ'
    const nome = pj ? c.razaoSocial || c.nome : c.nome
    const contato = [c.contato, c.telefone || c.celular].filter((x) => !vazio(x)).join(' · ')
    linhas = [
      ...recado,
      [
        // O nome e o documento saem no certificado: "□ confere" e, embaixo, a caixa para o certo
        previsto(pj ? 'Razão social' : 'Nome', { text: nome || '—', bold: true }, { span: 2, confere: true }),
        // O contato (nome, função e telefone) na coluna larga; o CNPJ cabe na estreita
        { ...previsto('Contato no cliente', contato || '—'), linhas: 2 },
        previsto(pj ? 'CNPJ' : 'CPF', c.documento || '—', { confere: true }),
      ],
      // Mais baixa que a da balança (≈ 7 mm): o nome ou o CNPJ certos cabem numa linha
      [corrigir(2, 15), corrigir(1, 15)],
      [
        endereco
          ? previsto(`Endereço da calibração${OBRIG}`, endereco, { span: 3, confere: true })
          : escrever(`Endereço da calibração${OBRIG}`, { span: 3 }),
        { ...ondeFoi, linhas: endereco ? 2 : 1 },
      ],
      ...(endereco ? [[corrigir(3)]] : []),
    ]
  } else {
    linhas = [
      ...recado,
      [escrever('Razão social / Nome', { span: 3 }), escrever('CNPJ / CPF')],
      [escrever(`Endereço da calibração${OBRIG} (rua, nº, bairro, cidade/UF, CEP)`, { span: 3 }), ondeFoi],
      // O certificado traz também o endereço do cadastro do cliente (sede, pessoa física sem CNPJ…)
      [escreverComCaixa('Endereço do cliente (sai no certificado)', 'o mesmo do local da calibração', { span: 4 })],
      [escrever('Contato e telefone', { span: 2 }), escrever('E-mail para o certificado', { span: 2 })],
    ]
  }
  // Os acordos do certificado (conformidade, limite, regra de decisão, data da próxima calibração) são
  // combinados antes das leituras (ISO/IEC 17025, 7.1.3; ILAC-G8): marcados no passo 9 já na chegada
  const texto: No = [
    c
      ? 'Confira o cliente e o endereço da balança (filial, obra…). Anote a data e a hora de início. '
      : 'Preencha o cliente como deve sair no certificado. Anote a data e a hora de início. ',
    { text: `Antes do passo ${N.indicacao}:`, bold: true },
    ` confirme com o cliente a declaração de conformidade, o limite, a regra de decisão e se a data da próxima calibração sai no certificado; marque no passo ${N.encerramento}.`,
  ]
  // OS, técnico, data e hora numa grade colada embaixo, com a coluna do técnico larga: o previsto cabe
  // ao lado do rótulo, e a caixa fica livre para o nome
  return passo(ctx, n, 'Chegada ao cliente', E.cliente, texto, [
    grade(linhas, ['*', '*', '*', 124]),
    grade([dados], [86, '*', 140, 76], [0, 0, 0, 0], { semFioDeCima: true }),
  ])
}

// ---- 3. Identificação da balança -----------------------------------------------------------------------------

/** Nota legal do passo 4, para qualquer finalidade (e na folha em branco): a calibração não é a verificação legal. */
export function notaLegal(b: Balanca | null): string {
  const uso =
    b?.finalidade === 'COMERCIAL'
      ? 'Balança de uso comercial (venda por peso): a'
      : b?.finalidade === 'SAUDE'
        ? 'Balança de uso na saúde: a'
        : 'A'
  return `${uso} calibração não substitui a verificação do Inmetro/IPEM. Selos violados ou marca vencida: anote nas observações.`
}

/**
 * Como a balança foi encontrada, antes de mexer nela (primeiro quadro do passo da verificação): selos,
 * marca de verificação do Inmetro/IPEM e as fotos da plaqueta, do mostrador e dos selos (evidência do que
 * foi conferido) e a nota de que a calibração não substitui a verificação legal.
 */
function selos(b: Balanca | null): NoObjeto {
  const tamanho = { tamanho: 7.4, espaco: 7 }
  return {
    stack: [
      grade(
        [
          [
            marcar(
              'Selos / lacres encontrados',
              [{ rotulo: 'intactos' }, { rotulo: 'violados' }, { rotulo: 'sem selo' }],
              tamanho,
            ),
            escrever('Marca de verificação Inmetro/IPEM: ano'),
            marcar(
              'Fotos tiradas antes de mexer',
              [{ rotulo: 'plaqueta' }, { rotulo: 'mostrador' }, { rotulo: 'selos' }],
              tamanho,
            ),
          ],
        ],
        ['*', 172, 172],
      ),
      nota(notaLegal(b)),
    ],
    margin: [0, 0, 0, 5],
  }
}

function passoBalanca(ctx: Contexto, n: number): No[] {
  const { b } = ctx
  if (!b) return passoBalancaEmBranco(ctx, n)
  const plataforma = [
    [b.plataformaFabricante, b.plataformaModelo].filter((x) => !vazio(x)).join(' '),
    vazio(b.plataformaSerie) ? '' : `nº ${b.plataformaSerie.trim()}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const faixas = faixasOrdenadas(b.faixas)
  const es = divisaoLegivel(
    faixas.map((f) => f.e),
    b.unidade,
  )
  const receptor = [
    (RECEPTORES[b.receptor] ?? b.receptor).replace(/ \(.*\)$/, ''),
    (b.receptor === 'APOIOS' || b.receptor === 'RODOVIARIA' || b.receptor === 'TANQUE') && b.apoios > 0
      ? `${b.apoios} apoios`
      : '',
    b.dimensoes.trim(),
  ]
    .filter(Boolean)
    .join(' · ')
  const multi = faixas.length > 1
  const finalidade = b.finalidade ? FINALIDADES[b.finalidade] : ''
  type Linha = Array<[string, No]>
  // Identificação e características metrológicas numa grade só, na ordem da tela de cadastro
  const linhas: Linha[] = [
    [
      ['Tipo de balança', TIPOS_BALANCA[b.tipo] ?? '—'],
      ['Fabricante (indicador)', b.fabricante || '—'],
      ['Modelo (indicador)', b.modelo || '—'],
      ['Nº de série (indicador)', { text: b.numeroSerie || '—', bold: true }],
    ],
    [
      ['Identificação / TAG (*)', b.identificacao || '—'],
      ['Local de instalação (*)', b.localInstalacao || '—'],
      ['Plataforma (marca, modelo, nº de série)', plataforma || '—'],
      ['Ano de fabricação', b.anoFabricacao || '—'],
    ],
    [
      [
        multi
          ? b.tipoFaixas === 'MULTI_INTERVALO'
            ? 'Max × d (multi-intervalo)'
            : 'Max × d (múltiplas faixas)'
          : 'Capacidade × divisão',
        { text: capacidadeTexto(b) || '—', bold: true },
      ],
      ['Divisão de verificação (e)', es.valores.length ? `${es.valores.map((x) => numeroBr(x)).join('/')} ${es.unidade}` : '—'],
      ['Carga mínima (Min)', b.min ? `${numeroBr(b.min)} ${b.unidade}` : '—'],
      ['Classe de exatidão', ROTULO_CLASSE[b.classe]],
    ],
    [
      ['Unidade da indicação', b.unidade],
      ['Portaria de aprovação de modelo', b.portariaAprovacao || '—'],
      ['Receptor de carga', receptor || '—'],
      ['Finalidade (*)', finalidade || '—'],
    ],
  ]
  const celulas = (ls: Linha[]): Celula[][] =>
    ls.flatMap((linha) => [linha.map(([r, v]) => previsto(r, v, { confere: true })), linha.map(() => corrigir())])
  return passo(
    ctx,
    n,
    'Identificação da balança',
    E.balanca,
    [
      'Confira com a plaqueta do ',
      { text: 'indicador', bold: true },
      ' (o mostrador): certo, marque “confere”; diferente, escreva o certo embaixo e avise o cliente.',
    ],
    // A identificação fica com o título; as características metrológicas (cada linha com a sua caixa de
    // corrigir) podem ir para a página seguinte
    [grade(celulas(linhas.slice(0, 2)), 4)],
    linhas.slice(2).map((l) => grade(celulas([l]), 4, [0, 1.5, 0, 0])),
  )
}

function passoBalancaEmBranco(ctx: Contexto, n: number): No[] {
  const linhas: Celula[][] = [
    [
      escrever('Tipo de balança'),
      escrever('Fabricante (indicador)'),
      escrever('Modelo (indicador)'),
      escrever('Nº de série (indicador)'),
    ],
    [
      escrever('Identificação / TAG (*)'),
      escrever('Local de instalação (*)'),
      escrever('Plataforma (fabricante, modelo, nº de série)'),
      escrever('Ano de fabricação'),
    ],
  ]
  const lista = (xs: string[]) => xs.map((r) => ({ rotulo: r }))
  const opcoesMetrologia = { tamanho: 7.3, espaco: 7 }
  const metrologia: Celula[][] = [
    [
      marcar('Unidade da indicação', lista(['mg', 'g', 'kg', 't']), opcoesMetrologia),
      marcar('Classe de exatidão', lista(['I', 'II', 'III', 'IIII', 'não marcada']), opcoesMetrologia),
      marcar('Faixas de pesagem', lista(['única', 'multi-intervalo', 'múltiplas']), opcoesMetrologia),
    ],
    [
      marcar(
        'Receptor de carga (define as posições da excentricidade)',
        lista(['retangular / quadrado', 'prato redondo', 'mais de 4 apoios', 'rodoviária', 'gancho', 'tanque / silo']),
        { span: 3, tamanho: 7.4, espaco: 8 },
      ),
    ],
    // Os apoios definem as posições da excentricidade; as dimensões saem no certificado
    [escrever('Nº de apoios (células de carga)'), escrever('Dimensões do prato / plataforma (sai no certificado)', { span: 2 })],
    [
      marcar(
        'Finalidade (*) — informada pelo cliente',
        lista(['comercial (venda por peso)', 'processo / produção', 'laboratório / controle de qualidade', 'saúde']),
        { span: 3, tamanho: 7.4, espaco: 10 },
      ),
    ],
  ]
  const faixas = tabelaLeituras(
    [
      { titulo: 'Faixa / intervalo', largura: 70 },
      { titulo: 'Capacidade (Max)', unidade: 'na unidade da indicação', largura: '*' },
      { titulo: 'Divisão de verificação (e)', unidade: 'escreva a unidade: g, kg…', largura: '*' },
      { titulo: 'Divisão (d)', unidade: 'escreva a unidade', largura: '*' },
    ],
    [1, 2, 3].map((i) => [nro(`${i}`), livre(), livre(), livre()]),
    { altura: 17 },
  )
  const outros = grade(
    [[escrever('Carga mínima (Min), com a unidade'), escrever('Portaria de aprovação de modelo', { span: 2 })]],
    [150, '*', '*'],
    [0, 4, 0, 0],
  )
  return passo(
    ctx,
    n,
    'Identificação da balança',
    `${E.balanca} (cadastre a balança antes)`,
    [
      'Copie os dados da plaqueta do ',
      { text: 'indicador', bold: true },
      ' (o mostrador) e, se tiver, da plataforma. Sem marca, modelo ou série, use a identificação do cliente (TAG, patrimônio).',
    ],
    // A coluna da plataforma, mais larga: o rótulo cabe numa linha e a caixa fica com a altura das outras
    [grade(linhas, ['*', '*', 165, '*'])],
    [
      {
        stack: [subtitulo('Características metrológicas, conforme a plaqueta', [0, 5, 0, 3]), grade(metrologia, [116, 178, '*'])],
      },
      { stack: [{ stack: [faixas], margin: [0, 4, 0, 0] }, outros] },
    ],
  )
}

// ---- 4. Verificação antes de calibrar e ambiente no início ---------------------------------------------------

/** Os mesmos itens e textos da tela "Verificação antes de calibrar" (EtapaInstrumento.tsx). */
export const VERIFICACOES_FOLHA = [
  'Balança identificada (série, modelo, plaqueta legível)',
  'Limpa, sem danos ou contaminação no prato/plataforma',
  'Nivelada (bolha centralizada, quando houver)',
  'Ligada e aquecida pelo tempo do fabricante',
  'Pré-carga aplicada (carga perto de Max pelo menos uma vez)',
]

/** Instrumentos de ambiente previstos: com o plano, os que vão a campo (o termo-higrômetro escolhido). */
function instrumentosAmbiente(ctx: Contexto): Padrao[] {
  return (
    ctx.plano ? ctx.plano.padroes.filter((p) => p.naFolha).map((p) => p.padrao) : padroesPrevistos(ctx.k, ctx.d.padroes)
  ).filter((p) => p.tipo === 'TERMOHIGROMETRO' || p.tipo === 'BAROMETRO')
}

/**
 * Ambiente no início ou no fim, numa linha de caixas (os campos da tela "Padrões e ambiente"): hora,
 * temperatura, umidade, pressão e o instrumento usado (o previsto em letra miúda).
 */
function gradeAmbiente(ctx: Contexto, momento: 'Início' | 'Fim', margem: number[] = [0, 0, 0, 0]): NoObjeto {
  const previstos = instrumentosAmbiente(ctx)
    .map((p) => p.identificacao)
    .join(', ')
  // Quando medir vai ao lado do rótulo (no fim, "no mesmo lugar e com o mesmo instrumento" está na instrução
  // do passo): as caixas ficam livres para escrever
  return grade(
    [
      [
        escrever(`${momento} · hora`, {
          formato: '____:____',
          ...(momento === 'Início' ? { aoLado: '15 min após chegar' } : {}),
        }),
        escrever(`Temperatura${OBRIG} (°C)`),
        escrever('Umidade relativa (%)'),
        escrever('Pressão, opcional (hPa)'),
        escrever('Instrumento usado', previstos ? { aoLado: `previsto: ${previstos}` } : {}),
      ],
    ],
    [106, '*', '*', '*', 128],
    margem,
  )
}

function passoVerificacao(ctx: Contexto, n: number): No[] {
  const { b, plano, u } = ctx
  const maxTexto = plano && plano.max ? ` (${numeroBr(plano.max)} ${u})` : ''
  const linhas: No[][] = VERIFICACOES_FOLHA.map((t, i) => [
    { text: `${i + 1}.`, fontSize: 7.2, color: T.rotulo, margin: [0, 1.5, 0, 0] },
    { text: t, fontSize: 8, margin: [0, 1.5, 0, 0] },
    opcoes([{ rotulo: 'Sim' }, { rotulo: 'Não' }, { rotulo: 'N/A' }], { tamanho: 7.8, espaco: 10 }),
  ])
  linhas.push([
    { text: '6.', fontSize: 7.2, color: T.rotulo, margin: [0, 1.5, 0, 0] },
    { text: 'Zero automático / rastreamento de zero', fontSize: 8, margin: [0, 1.5, 0, 0] },
    opcoes([{ rotulo: 'Ligado' }, { rotulo: 'Desligado' }, { rotulo: 'Não possui' }], { tamanho: 7.8, espaco: 10 }),
  ])
  const lista: NoObjeto = {
    table: { widths: [12, '*', 'auto'], body: linhas, heights: 11 },
    layout: {
      hLineWidth: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? 0.8 : 0.4),
      hLineColor: (i: number, no: { table: { body: unknown[] } }) =>
        i === 0 || i === no.table.body.length ? T.borda : T.linhaClara,
      vLineWidth: () => 0,
      paddingLeft: (i: number) => (i === 0 ? 2 : 4),
      paddingRight: () => 2,
      paddingTop: () => 2,
      paddingBottom: () => 0.6,
    },
  }
  const ds = b
    ? divisaoLegivel(
        faixasOrdenadas(b.faixas).map((f) => f.d),
        b.unidade,
      )
    : null
  const d = ds ? `${ds.valores.map((x) => numeroBr(x)).join('/')} ${ds.unidade}` : ''
  const dTeste = ctx.k?.opcoes.divisaoTeste ?? 0
  // Antes da primeira leitura: aquecimento, aclimatação dos pesos, onde a balança está e a divisão usada
  const condicoes = grade(
    [
      [
        escrever('Ligada desde', { formato: '____:____' }),
        escrever('Pesos no local há (min)', { aoLado: 'aclimatação' }),
        marcar('Onde a balança está', [{ rotulo: 'local fechado' }, { rotulo: 'ao ar livre (sol, vento, chuva: anote)' }], {
          tamanho: 7.4,
          span: 2,
          altura: 22,
        }),
      ],
      [
        marcar(
          `Divisão usada nas leituras (modo serviço) — no sistema: ${E.conclusao}`,
          [
            { rotulo: d ? `a normal (d = ${d})` : 'a normal (d da plaqueta)', prevista: !!b && !(dTeste > 0) },
            {
              rotulo:
                b && dTeste > 0
                  ? `modo serviço, d = ${divisaoTexto(dTeste, b.unidade)} (com a concordância do cliente)`
                  : 'modo serviço, d = __________ (com a concordância do cliente)',
              prevista: !!b && dTeste > 0,
            },
          ],
          { span: 4, altura: 22 },
        ),
      ],
    ],
    [84, 128, '*', '*'],
    [0, 5, 0, 0],
  )
  return passo(
    ctx,
    n,
    'Verificação antes de calibrar e ambiente no início',
    e2(E.balanca, E.padroes),
    [
      `Aqueça, limpe, nivele e pré-carregue perto de Max${maxTexto}. Algum “Não”? Anote nas observações; sem condição de uso, `,
      { text: 'não calibre', bold: true },
      '.',
    ],
    // Como a balança foi encontrada vem antes dos itens 1 a 6: as fotos são do estado de antes de mexer nela
    [selos(b), lista, condicoes],
    [gradeAmbiente(ctx, 'Início', [0, 5, 0, 0])],
  )
}

// ---- 5. Erro de indicação: "como encontrado" e "depois do ajuste" nas mesmas linhas ----------------------

const INSTRUCAO_METODO: Record<MetodoCarregamento, string> = {
  CRESCENTE_DECRESCENTE: 'suba até a maior ↑ e desça sem descarregar ↓',
  DESCONTINUO: 'retire tudo e confira o zero entre uma carga e outra',
  CONTINUO: 'vá somando os pesos, sem descarregar',
  DECRESCENTE: 'comece pela maior e vá retirando ↓',
}

const ORDEM_METODOS: MetodoCarregamento[] = ['CRESCENTE_DECRESCENTE', 'DESCONTINUO', 'CONTINUO', 'DECRESCENTE']

const GRUPO_ANTES = 'Como encontrado'
const GRUPO_DEPOIS = 'Depois do ajuste · só se ajustou'

/** Largura da coluna da hora do início, à direita das opções do método. */
const LARGURA_HORA_INICIO = 58

/**
 * "Como as cargas foram aplicadas", uma linha de opções para cada grupo de colunas da tabela dos pontos
 * ("como encontrado" e "depois do ajuste"): no sistema, cada aba do erro de indicação tem o seu método, e o
 * certificado imprime os dois (o técnico pode conferir só subindo e, depois do ajuste, subir e descer). À
 * direita, na mesma linha, a hora do início de cada ensaio. Fica com o título do passo (sozinha no alto de
 * uma página, a hora pareceria a da chegada).
 */
function opcoesMetodo(plano: PlanoFolha | null): NoObjeto {
  const semBorda = [false, false, false, false]
  // A hora de cada ensaio na linha dele (≈ 5,6 mm: cabe "08:15" à mão)
  const hora = (): NoObjeto => ({
    text: '____:____',
    fontSize: 7.4,
    color: T.suave,
    alignment: 'center',
    margin: [0, 2.6, 0, 0],
    border: [true, false, true, true],
    fillColor: '#FFFFFF',
  })
  const linha = (grupo: string, previsto: MetodoCarregamento | null): No[] => [
    {
      text: grupo.toUpperCase(),
      font: 'InterMedio',
      bold: true,
      fontSize: 5.4,
      characterSpacing: 0.15,
      color: T.texto,
      margin: [0, 2.7, 0, 0],
      border: semBorda,
    },
    {
      ...opcoes(
        ORDEM_METODOS.map((m) => ({ rotulo: METODOS_CARREGAMENTO[m].label, prevista: m === previsto })),
        { tamanho: 6.6, espaco: 6 },
      ),
      border: semBorda,
    },
    hora(),
  ]
  return {
    table: {
      widths: [62, '*', LARGURA_HORA_INICIO],
      body: [
        [
          { ...rotulo('Como as cargas foram aplicadas'), colSpan: 2, border: semBorda },
          {},
          { ...rotulo('Hora do início'), alignment: 'center', border: [true, true, true, false], fillColor: '#FFFFFF' },
        ],
        linha(GRUPO_ANTES, plano?.metodoComoEncontrado ?? null),
        linha('Depois do ajuste', plano?.metodo ?? null),
      ],
    },
    layout: {
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
      hLineColor: () => T.borda,
      vLineColor: () => T.borda,
      paddingLeft: (i: number) => (i === 2 ? 4 : 0),
      paddingRight: (i: number) => (i === 0 ? 4 : i === 1 ? 6 : 4),
      paddingTop: (i: number) => (i ? 1.5 : 1.8),
      paddingBottom: (i: number) => (i ? 1.5 : 0.6),
    },
    margin: [0, 0, 0, 5],
  }
}

/**
 * Colunas ↑ e ↓ que o método previsto usa (como na tela: ↓ só em "crescente e decrescente"; só ↓ no
 * decrescente). A folha imprime sempre as duas, porque o método pode mudar no local: a que o método
 * previsto não usa sai estreita, com "só se descer" (ou "só se subir").
 */
function colunasIndicacao(metodo: MetodoCarregamento | null) {
  return {
    sobe: metodo !== 'DECRESCENTE',
    desce: metodo === null || metodo === 'CRESCENTE_DECRESCENTE' || metodo === 'DECRESCENTE',
  }
}

/**
 * Pesos de uma carga planejada e, quando não fecham, quanto falta; com substituição, quanto as etapas e
 * os pesos passam da carga (em negrito, para resolver antes de sair).
 */
function pesosDaCarga(ctx: Contexto, c: { pesos: string; falta: number; excesso?: number }, tamanho = 8): No {
  // A quantidade nunca quebra entre o número e a unidade
  const qtd = (v: number) => `${num(v, casasDecimais(v))} ${ctx.u}`.replace(/ /g, NBSP)
  const excesso = c.excesso ?? 0
  return {
    text: [
      { text: semQuebra(c.pesos) || '—' },
      ...(c.falta > 0 ? [{ text: `\nfaltam ${qtd(c.falta)}`, bold: true, fontSize: 7 }] : []),
      ...(excesso > 0 ? [{ text: `\npassa ${qtd(excesso)} da carga`, bold: true, fontSize: 7 }] : []),
    ],
    fontSize: c.pesos.length > 22 ? Math.min(tamanho, 7.2) : tamanho,
  }
}

/** Linhas da tabela de pontos na folha em branco: o zero e mais 11 (multi-intervalo: 9 a 10 pontos e reserva). */
const LINHAS_PONTOS_EM_BRANCO = 12

/** Nome da última coluna dos pontos: a faixa (carga ± EMA) só serve para decidir o ajuste no local. */
const FAIXA_AJUSTE = 'Faixa para decidir o ajuste'

/** Marca das linhas da tabela de pontos (a montagem acha a página de cada uma para dividir a tabela). */
const ID_LINHA_PONTOS = 'linha-pontos'

/** Tabela dos pontos de carga, em linhas: a montagem pode dividi-la entre as páginas. */
interface TabelaPontos {
  colunas: Coluna[]
  linhas: CelulaTabela[][]
}

/**
 * Tabela dos pontos de carga (pré-preenchida pelo plano, ou em branco): as leituras "como encontrado"
 * e "depois do ajuste" lado a lado, nas mesmas linhas (mesmas cargas), e linhas de reserva. No fim, na
 * própria tabela (nada fica solto no alto de outra página): o retorno ao zero, antes e depois do ajuste,
 * e, com o plano, a troca de peças em relação ao previsto (um 10 kg de outro jogo…), que muda as peças do
 * ponto, e com elas a massa de referência e a incerteza. Na folha em branco, os pesos de cada ponto já
 * são escritos na tabela.
 */
function tabelaPontos(ctx: Contexto, reserva: number): TabelaPontos {
  const { b, plano } = ctx
  const u = unidadeColuna(ctx)
  const multi = !!b && b.faixas.length > 1
  const comEma = !!plano?.pontos.some((p) => p.ema !== null)
  // Em branco (pode ser rodoviária) e em rodoviária, a coluna das substituições vai sempre: com a
  // substituição no plano, o nível de cada ponto; sem ela, o nível sugerido (os pesos previstos não chegam
  // à carga) ou, se os pesos chegam a todas, para escrever
  const comSub = comSubstituicao(ctx)
  const sub = plano?.substituicao
  const subPrevista = !!sub && (sub.ativa || sub.sugerida)
  // A coluna que o método previsto de cada grupo não usa sai estreita (o método pode mudar no local). Cada
  // grupo com pelo menos 120 pt: o título "depois do ajuste · só se ajustou" numa linha só
  const estreita = 48
  const colunasGrupo = (grupo: string, metodo: MetodoCarregamento | null): Coluna[] => {
    const { sobe, desce } = colunasIndicacao(metodo)
    const larga = sobe && desce ? 60 : 72
    return [
      { titulo: 'Indicação ↑', unidade: u, largura: sobe ? larga : estreita, grupo, ...(sobe ? {} : { nota: 'só se subir' }) },
      { titulo: 'Indicação ↓', unidade: u, largura: desce ? larga : estreita, grupo, ...(desce ? {} : { nota: 'só se descer' }) },
    ]
  }
  const colunas: Coluna[] = [
    { titulo: 'Nº', largura: 15, alinhamento: 'center' },
    { titulo: 'Carga', unidade: u, largura: 50, alinhamento: 'right' },
    ...(comSub
      ? [
          {
            titulo: 'Substi-\ntuições',
            largura: 34,
            alinhamento: 'center' as const,
            ...(!plano ? { nota: 'rodoviária' } : sub?.sugerida ? { nota: 'sugeridas' } : {}),
          },
        ]
      : []),
    { titulo: comSub ? 'Pesos padrão por cima' : 'Pesos padrão', largura: '*' },
    ...colunasGrupo(GRUPO_ANTES, plano ? plano.metodoComoEncontrado : null),
    ...colunasGrupo(GRUPO_DEPOIS, plano ? plano.metodo : null),
    ...(comEma ? [{ titulo: FAIXA_AJUSTE, unidade: u, largura: 66, alinhamento: 'right' as const }] : []),
  ]
  const leituras = (): CelulaTabela[] => [livre(), livre()]
  const linhas: CelulaTabela[][] = []
  for (const [i, p] of (plano?.pontos ?? []).entries()) {
    const zero = !(p.carga > 0)
    const pesos: No = zero ? { text: 'sem carga (zero)', color: T.suave, fontSize: 7.2 } : pesosDaCarga(ctx, p, 8)
    const carga: No = {
      text: [
        { text: cargaTexto(p.carga, p.d), bold: true },
        // Multi-intervalo e múltiplas faixas: a divisão muda com a carga
        ...(multi ? [{ text: `\nd = ${divisaoTexto(p.d, b!.unidade)}`, fontSize: 6.2, color: T.suave }] : []),
      ],
    }
    const cel: CelulaTabela[] = [nro(String(i + 1)), pre(carga, 'right')]
    if (comSub) cel.push(subPrevista ? pre(p.nivelSubstituicao > 0 ? `${p.nivelSubstituicao}` : '—', 'center') : livre())
    cel.push(pre(pesos))
    cel.push(...leituras(), ...leituras())
    if (comEma)
      cel.push(
        pre(
          p.ema === null
            ? '—'
            : {
                text: [
                  { text: `${cargaTexto(p.carga - p.ema, p.d)} a ${cargaTexto(p.carga + p.ema, p.d)}`, fontSize: 7.1 },
                  { text: `\nEMA ±${cargaTexto(p.ema, p.d)}`, fontSize: 6.1, color: T.suave },
                ],
              },
          'right',
        ),
      )
    linhas.push(cel)
  }
  const inicio = linhas.length
  // Em branco: o zero e mais 11 linhas (0, 25, 50, 75 e 100 % de Max e as cargas onde muda o EMA de cada intervalo)
  const total = plano ? reserva : LINHAS_PONTOS_EM_BRANCO
  for (let i = 0; i < total; i++) {
    const zeroEmBranco = !plano && i === 0
    const cel: CelulaTabela[] = [nro(plano ? '+' : String(inicio + i + 1))]
    cel.push(zeroEmBranco ? pre({ text: '0', bold: true }, 'right') : livre())
    if (comSub) cel.push(livre())
    cel.push(zeroEmBranco ? pre({ text: 'sem carga (zero)', color: T.suave, fontSize: 7.2 }) : livre())
    cel.push(...leituras(), ...leituras())
    if (comEma) cel.push(livre())
    linhas.push(cel)
  }
  // No fim, o rótulo à esquerda (nas colunas da carga e dos pesos) e a escrita à direita, nas leituras
  const antesDasLeituras = comSub ? 4 : 3
  const rotuloLinha = (titulo: string, texto: string): CelulaTabela =>
    dica(
      [
        { text: titulo, font: 'InterMedio', fontSize: 6.3, characterSpacing: 0.3, color: T.texto },
        { text: `\n${texto}`, fontSize: 6.2 },
      ],
      antesDasLeituras,
    )
  // Retorno ao zero: uma leitura por aba do sistema ("como encontrado" e "depois do ajuste"), cada uma com o
  // seu campo "Retorno ao zero" (com substituição, ele entra na incerteza de cada ensaio)
  linhas.push([
    rotuloLinha('RETORNO AO ZERO', 'indicação depois de retirar toda a carga'),
    { ...livre(), span: 2 },
    { ...livre(), span: 2 },
    ...(comEma ? [pre('—', 'center')] : []),
  ])
  if (plano)
    linhas.push([
      rotuloLinha('PESOS DIFERENTES DO PREVISTO', 'nº da linha e as peças usadas de fato'),
      { ...dica('ex.: “linha 5: 7 × 20 kg + 10 kg do JP-02”'), alinhamento: 'right', span: 4 + (comEma ? 1 : 0) },
    ])
  return { colunas, linhas }
}

/**
 * Nota embaixo dos pontos: o que a última coluna quer dizer (o critério e que ela é só para decidir o
 * ajuste no local). Onde cada coluna é digitada vai no roteiro do escritório (passo das assinaturas).
 */
function notaFaixa(ctx: Contexto): No[] {
  const f = ctx.plano?.faixaAceitavel
  if (!f || !ctx.plano?.pontos.some((p) => p.ema !== null)) return []
  const criterio = `${CRITERIOS_EMA[f.criterio].label}${f.criterio === 'CLIENTE' ? `, ±${numeroBr(f.toleranciaCliente)} ${ctx.u}` : ''}`
  // O técnico nunca ajusta por conta própria: fora da faixa, propõe; quem decide é o cliente (passo 6)
  const fora = 'fora dela, proponha o ajuste ao cliente.'
  return [
    nota(
      [
        { text: `${FAIXA_AJUSTE}: `, bold: true, color: T.texto },
        f.daConformidade
          ? `carga ± EMA (${criterio}); ${fora} A conformidade inclui a incerteza.`
          : f.toleranciaPendente
            ? `carga ± EMA (${criterio}, classe ${ctx.b?.classe}); ${fora} A tolerância do cliente ainda não foi informada: pergunte e anote no passo ${N.encerramento}.`
            : `carga ± EMA (${criterio}, classe ${ctx.b?.classe}); ${fora} Não é declaração de conformidade (o cliente não pediu).`,
      ],
      [0, 3, 0, 0],
    ),
  ]
}

/** Linhas de pontos a partir das quais a tabela não cabe numa página com o título (precisa se dividir). */
const LINHAS_TABELA_INTEIRA = 22

/** Linhas de reserva (ponto a mais, carga diferente): duas, ou uma quando a tabela já é longa. */
const reservaDosPontos = (ctx: Contexto) => ((ctx.plano?.pontos.length ?? 0) >= 7 ? 1 : 2)

/** A tabela de pontos não cabe numa página com o título: precisa se dividir. */
const pontosLongos = (ctx: Contexto) =>
  (ctx.plano ? ctx.plano.pontos.length + reservaDosPontos(ctx) : LINHAS_PONTOS_EM_BRANCO) > LINHAS_TABELA_INTEIRA

/**
 * Linhas dos pontos (com a reserva, o retorno ao zero e os pesos diferentes) e das etapas de substituição
 * que ainda cabem juntas, com os títulos, numa página só (medido: rodoviária com 7 pontos e 15 etapas não cabe).
 */
const LINHAS_PONTOS_E_ETAPAS = 21

/** Linhas da tabela das etapas a partir das quais ela se divide entre as páginas (inteira, não caberia). */
const LINHAS_ETAPAS_INTEIRA = 26

/** Linhas da tabela das etapas de substituição (ver `tabelaSubstituicao`). */
function linhasDasEtapas(ctx: Contexto): number {
  const { plano } = ctx
  const s = plano && (plano.substituicao.ativa || plano.substituicao.sugerida) ? plano.substituicao : null
  const temPesos = !!plano?.padroes.some((p) => p.padrao.tipo === 'PESOS')
  return s ? s.etapas + 1 : plano && temPesos ? ETAPAS_SUBSTITUICAO_RESERVA : ETAPAS_SUBSTITUICAO_EM_BRANCO
}

/**
 * Pontos e etapas de substituição do plano, preenchidos intercalados (ponto 3, etapa 1, ponto 4…), vão
 * juntos, na mesma página (o passo começa numa página nova, se preciso), quando cabem nela. Muitos pontos
 * ou muitas etapas: as etapas vão depois, como outra parte do passo (inteiras, elas sumiriam do PDF).
 */
function pontosComEtapas(ctx: Contexto): boolean {
  if (!ctx.plano || !comSubstituicao(ctx) || ctx.extras.semBlocos) return false
  const pontos = ctx.plano.pontos.length + reservaDosPontos(ctx) + 2
  return pontos + linhasDasEtapas(ctx) <= LINHAS_PONTOS_E_ETAPAS
}

/**
 * A montagem pode dividir a tabela de pontos entre as páginas (medindo onde a página acaba)? Só a que não
 * cabe numa página: a que cabe vai sempre inteira (com até ≈ 20 linhas, o técnico nunca vira a folha no
 * meio da subida ou da descida).
 */
function pontosDivisiveis(ctx: Contexto): boolean {
  return !ctx.extras.semBlocos && pontosLongos(ctx)
}

/** A tabela dos pontos inteira (com as etapas, quando vão juntas): a parte que passa inteira para a página seguinte. */
const ID_TABELA_PONTOS = idParte(N.indicacao, 1)

/** Espaço (pt) para o aviso "tabela na próxima página" no pé da página do título do passo 5. */
const ALTURA_AVISO_PONTOS = 16

/**
 * Como fazer as etapas de substituição: fica no alto do passo, com o que se lê antes das tabelas, quando os
 * pontos e as etapas vão juntos (eles podem ir juntos para a página seguinte).
 */
function notaEtapas(margem: number[] = [0, 0, 0, 4], titulo = false): NoObjeto {
  return nota(
    [
      ...(titulo ? [{ text: 'Cargas de substituição: ', bold: true, color: T.texto }] : []),
      `${titulo ? 'em' : 'Em'} cada etapa, com os pesos padrão na plataforma, anote a indicação; troque-os pela carga de substituição (caminhão, lastro) até a mesma indicação e anote de novo. A coluna “substituições” dos pontos diz quantas etapas ficam por baixo dos pesos. `,
      { text: 'Só crescente', bold: true },
      ': para descer, seria preciso tirar o material. ',
      { text: 'Ajustou?', bold: true },
      ' Refaça as etapas nas colunas “depois do ajuste”.',
    ],
    margem,
  )
}

function passoIndicacao(ctx: Contexto, n: number): No[] {
  const { plano } = ctx
  const comSub = comSubstituicao(ctx)
  // Com as substituições na folha (rodoviária ou em branco): para descer, seria preciso tirar o material
  const soCrescente: No[] = comSub ? [' Com cargas de substituição: ', { text: 'só crescente', bold: true }, '.'] : []
  // O método previsto vai marcado (PREVISTO) nas opções logo abaixo; "depois do ajuste" diz "só se ajustou"
  const texto: No = plano
    ? [
        'Zere vazia e aplique as cargas na ordem da tabela (',
        { text: INSTRUCAO_METODO[plano.metodoComoEncontrado], bold: true },
        '); anote a indicação estável.',
        ...soCrescente,
      ]
    : [
        'Cargas: ',
        { text: '0, 25, 50, 75 e 100 % de Max', bold: true },
        ' e onde muda o EMA (500e e 2000e na classe III), até pelo menos 90 % de Max. Zere, aplique e anote a indicação estável.',
        ...soCrescente,
      ]
  const t = tabelaPontos(ctx, reservaDosPontos(ctx))
  const total = t.linhas.length
  const tabela = (de: number, ate: number) =>
    tabelaLeituras(t.colunas, t.linhas.slice(de, ate), { idLinhas: ID_LINHA_PONTOS, primeiraLinha: de })
  // Pontos e etapas de substituição do plano na mesma página, quando cabem: são preenchidos intercalados.
  // Na folha em branco (só em rodoviária), as etapas podem ir para a página seguinte; muitas, se dividem.
  const junto = pontosComEtapas(ctx)
  const fim: No[] = [
    ...notaFaixa(ctx),
    // Em branco, o EMA por classe para decidir o ajuste (com balança, a coluna da faixa)
    ...(plano ? [] : [tabelaEmaPorClasse()]),
    ...(junto ? [tabelaSubstituicao(ctx, { semNota: true })] : []),
  ]
  const etapasLongas = linhasDasEtapas(ctx) > LINHAS_ETAPAS_INTEIRA
  const depois: Parte[] =
    comSub && !junto
      ? [etapasLongas ? { parte: tabelaSubstituicao(ctx), id: idParte(n, 9), partivel: true } : tabelaSubstituicao(ctx)]
      : []
  // O que se preenche (ou se lê) antes das tabelas fica com o título: o método e a hora de cada grupo de
  // colunas e, com as etapas juntas, como fazê-las. Quando as tabelas passam para a página seguinte, um
  // aviso no pé desta diz onde elas estão (medido na montagem)
  const avisoPontos: No[] = ctx.extras.avisoPontos
    ? [
        nota(
          junto
            ? [
                { text: 'Tabelas na próxima página', bold: true, color: T.texto },
                ': os pontos e as etapas de substituição, juntos.',
              ]
            : [{ text: 'Tabela dos pontos na próxima página.', bold: true, color: T.texto }],
          [0, 0, 0, 0],
        ),
      ]
    : []
  const cabeca: No[] = [opcoesMetodo(plano), ...(junto ? [notaEtapas([0, 0, 0, 4], true)] : []), ...avisoPontos]
  const titulo = 'Erro de indicação'
  if (ctx.extras.semBlocos)
    // Montagem de segurança: a tabela se divide onde a página acaba (o cabeçalho se repete)
    return passo(ctx, n, titulo, E.indicacao, texto, [...cabeca, tabela(0, total), ...fim], depois)
  const medir = ctx.extras.medirPontos
  if (medir)
    // Só para a montagem medir onde a tabela longa se divide: o título e o método juntos, a tabela solta
    return [
      {
        ...inteiro([tituloPasso(n, titulo, E.indicacao), instrucao(texto), ...cabeca]),
        id: `passo-${n}`,
        margin: [0, 5, 0, 0],
        ...(medir === 'pagina-nova' ? { pageBreak: 'before' } : {}),
      },
      tabela(0, total),
      ...fim,
      ...depois.map((p) => (eParte(p) ? p.parte : p)),
    ]
  const cortes = ctx.extras.cortes.filter((c, i, l) => c > 0 && c < total && (i === 0 || c > l[i - 1]))
  if (cortes.length) {
    // Longa, dividida onde a montagem mediu: cada pedaço abre uma página, com o título do passo e o cabeçalho
    const limites = [...cortes, total]
    const pedacos: Parte[] = cortes.map((de, i) => ({
      parte: { stack: [tabela(de, limites[i + 1]), ...(i === cortes.length - 1 ? fim : [])] },
      id: `${idParte(n, 0)}-pontos-${i + 1}`,
      quebra: true,
    }))
    return passo(ctx, n, titulo, E.indicacao, texto, [...cabeca, tabela(0, cortes[0])], [...pedacos, ...depois])
  }
  if (pontosLongos(ctx))
    // Longa demais para uma página e sem a divisão medida: vai sozinha e se divide (o cabeçalho se repete)
    return passo(ctx, n, titulo, E.indicacao, texto, cabeca, [
      { parte: { stack: [tabela(0, total), ...fim] }, id: ID_TABELA_PONTOS, partivel: true },
      ...depois,
    ])
  // A tabela inteira (e as etapas, quando vão juntas) passa inteira para a página seguinte quando não cabe
  // nesta, com o título de continuação; o título, a instrução e o método ficam na sobra desta página
  return passo(ctx, n, titulo, E.indicacao, texto, cabeca, [
    { parte: { stack: [tabela(0, total), ...fim] }, id: ID_TABELA_PONTOS },
    ...depois,
  ])
}

/**
 * Etapas de substituição para escrever, sem a substituição no plano: na folha em branco (ou sem pesos
 * previstos), as de uma rodoviária de 80 t com 10 t de pesos (7) e mais uma; numa rodoviária cujos pesos
 * previstos chegam a todas as cargas, só a reserva.
 */
const ETAPAS_SUBSTITUICAO_EM_BRANCO = 8
const ETAPAS_SUBSTITUICAO_RESERVA = 2

/**
 * Etapas das cargas de substituição (rodoviárias), "como encontrado" e "depois do ajuste" lado a lado,
 * como na tabela dos pontos: no sistema, cada aba do erro de indicação tem as suas etapas. Com a
 * substituição no plano (ou sugerida pela folha), as etapas que os pontos usam, com a carga de cada uma, e
 * uma linha a mais; sem ela, as linhas e a carga de cada etapa para escrever.
 */
function tabelaSubstituicao(ctx: Contexto, o: { semNota?: boolean } = {}): No {
  const { plano, u } = ctx
  const uc = unidadeColuna(ctx)
  const s = plano && (plano.substituicao.ativa || plano.substituicao.sugerida) ? plano.substituicao : null
  const previstas = s ? s.etapas : 0
  const total = linhasDasEtapas(ctx)
  const linhas: CelulaTabela[][] = Array.from({ length: total }, (_, i) => [
    nro(!s || i < previstas ? `${i + 1}ª` : '+'),
    s && i < previstas ? pre(numeroBr(s.carga), 'right') : livre(),
    livre(),
    livre(),
    livre(),
    livre(),
    livre(),
  ])
  const grupo = (g: string): Coluna[] => [
    { titulo: 'Indicação com os pesos', unidade: uc, largura: '*', grupo: g },
    { titulo: 'Indicação com a substituição', unidade: uc, largura: '*', grupo: g },
  ]
  return {
    stack: [
      subtitulo(
        s
          ? `Cargas de substituição${s.sugerida ? ' sugeridas' : ''} — ${numeroBr(s.carga)} ${u} de pesos padrão em cada etapa (${semQuebra(s.pesos) || '—'})${s.sugerida ? '; mude no local, se precisar' : ''}`
          : plano
            ? 'Cargas de substituição — quando os pesos levados não chegam às cargas dos pontos'
            : 'Cargas de substituição — só em rodoviária, quando os pesos levados não chegam às cargas dos pontos',
        [0, 8, 0, o.semNota ? 4 : 2],
      ),
      // Com os pontos e as etapas juntos, como fazê-las fica no alto do passo
      ...(o.semNota ? [] : [notaEtapas()]),
      tabelaLeituras(
        [
          { titulo: 'Etapa', largura: 30, alinhamento: 'center' },
          { titulo: 'Pesos padrão', unidade: uc, largura: 58, alinhamento: 'right' },
          ...grupo(GRUPO_ANTES),
          ...grupo(GRUPO_DEPOIS),
          { titulo: 'Material da substituição / obs.', largura: 104 },
        ],
        linhas,
      ),
    ],
  }
}

// ---- 6. Ajuste e reparo --------------------------------------------------------------------------------------

function passoAjuste(ctx: Contexto, n: number, indicacao: number): No[] {
  const { k } = ctx
  // O rascunho novo sempre começa com "não houve ajuste/reparo": só marca como previsto o que foi combinado
  const realizado = k && k.ajuste.realizado !== 'NAO' ? k.ajuste.realizado : null
  const r = k?.reparo
  const grid = grade(
    [
      [
        marcar(
          'Ajuste',
          [
            { rotulo: AJUSTES.NAO },
            { rotulo: AJUSTES.INTERNO, prevista: realizado === 'INTERNO' },
            { rotulo: AJUSTES.EXTERNO, prevista: realizado === 'EXTERNO' },
          ],
          { span: 3, espaco: 16 },
        ),
        escrever('Hora do ajuste', { formato: '____:____' }),
      ],
      [escrever(`Como foi o ajuste${OBRIG} (no externo: o peso usado e a identificação dele)`, { span: 4 })],
      [
        marcar('Reparo ou manutenção', [{ rotulo: 'não houve' }, { rotulo: 'houve (OS obrigatória)', prevista: !!r?.houve }]),
        r?.houve && !vazio(r.descricao)
          ? previsto('Serviço realizado', r.descricao, { confere: true, span: 3 })
          : escrever('Serviço realizado', { span: 3 }),
      ],
      [escrever('Marca de reparo nº'), escrever('Selos retirados'), escrever('Selos colocados', { span: 2 })],
    ],
    [190, '*', '*', 100],
  )
  return passo(ctx, n, 'Ajuste e reparo', E.balanca, instrucaoAjuste(ctx, indicacao), [grid])
}

/**
 * Instrução do passo 6: o técnico nunca ajusta por conta própria. Quando propor o ajuste (fora da faixa da
 * última coluna dos pontos; na folha em branco, fora do EMA da classe; com a tolerância do cliente ainda
 * por informar, fora dela; sem faixa, só a pedido do cliente) e a regra de sempre: ajuste só com a
 * autorização do cliente e pelos meios permitidos (romper selo só em oficina permissionária, com a
 * comunicação ao órgão metrológico da Portaria Inmetro 457/2021).
 */
function instrucaoAjuste(ctx: Contexto, indicacao: number): No[] {
  const { k } = ctx
  const comFaixa = !!ctx.plano?.pontos.some((p) => p.ema !== null)
  const toleranciaPendente =
    k?.conformidade.solicitada && k.conformidade.criterio === 'CLIENTE' && !(k.conformidade.toleranciaCliente > 0)
  const proponha = ': proponha o ajuste ao cliente. '
  const quando: No[] = comFaixa
    ? [{ text: `Fora da ${FAIXA_AJUSTE.toLowerCase()}`, bold: true }, ` (passo ${indicacao})${proponha}`]
    : ctx.plano
      ? toleranciaPendente
        ? [{ text: 'Fora da tolerância do cliente', bold: true }, ` (anote-a no passo ${N.encerramento})${proponha}`]
        : ctx.b?.classe
          ? ['Sem faixa para comparar: o ajuste é só a pedido do cliente. ']
          : ['Balança sem classe: não há EMA para comparar; o ajuste é só a pedido do cliente. ']
      : [{ text: 'Erro fora do EMA da classe', bold: true }, ` (tabela embaixo dos pontos, no passo ${indicacao})${proponha}`]
  return [
    ...quando,
    'Ajuste só com autorização do cliente e pelos meios permitidos (sem romper selo, salvo oficina permissionária): ajuste e ',
    { text: `refaça o passo ${indicacao} nas colunas “depois do ajuste”`, bold: true },
    '.',
  ]
}

/**
 * Folha em branco, embaixo da tabela dos pontos: o EMA em serviço por classe (o critério que o sistema usa
 * para decidir o ajuste quando o cliente não pede declaração de conformidade), em divisões de verificação
 * (e), para comparar com o erro (indicação − carga) de cada ponto no local.
 */
function tabelaEmaPorClasse(): NoObjeto {
  const classes = ['I', 'II', 'III', 'IIII'] as const
  const trecho = (ate: number | null, multiplo: number, anterior: number | null) =>
    `±${numeroBr(multiplo)}e ${ate === null ? (anterior === null ? 'em toda a faixa' : `acima de ${numeroBr(anterior)}e`) : `até ${numeroBr(ate)}e`}`
  const celula = (classe: (typeof classes)[number]): No => {
    const trechos = trechosEma(classe, CRITERIO_AJUSTE)
    return {
      stack: [
        { text: `Classe ${classe}`, font: 'InterMedio', bold: true, fontSize: 7, color: T.texto },
        ...trechos.map((t, i) => ({
          text: trecho(t.ate, t.multiplo, i ? trechos[i - 1].ate : null),
          fontSize: 7,
          color: T.instrucao,
        })),
      ],
    }
  }
  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          {
            text: [
              {
                text: `Para decidir o ajuste: EMA ${CRITERIOS_EMA[CRITERIO_AJUSTE].label.replace(/^Portaria Inmetro 157\/2022 — /, '')} · Portaria Inmetro 157/2022`,
                bold: true,
                color: T.texto,
              },
              '   erro = indicação − carga; e = divisão de verificação; na verificação do Inmetro/IPEM o EMA é a metade',
            ],
            fontSize: 6.6,
            color: T.suave,
            colSpan: 4,
          },
          {},
          {},
          {},
        ],
        classes.map(celula),
      ],
    },
    layout: {
      hLineWidth: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? 0.8 : 0.4),
      vLineWidth: (i: number) => (i === 0 || i === 4 ? 0.8 : 0.4),
      hLineColor: (i: number, no: { table: { body: unknown[] } }) =>
        i === 0 || i === no.table.body.length ? T.borda : T.linhaClara,
      vLineColor: (i: number) => (i === 0 || i === 4 ? T.borda : T.linhaClara),
      paddingLeft: () => 4.5,
      paddingRight: () => 4.5,
      paddingTop: () => 2.2,
      paddingBottom: () => 2,
    },
    margin: [0, 4, 0, 0],
  }
}

// ---- 7. Repetibilidade ----------------------------------------------------------------------------------------

/**
 * Carga e pesos previstos de um ensaio (repetibilidade, excentricidade), cada um com "□ confere" e, embaixo,
 * a caixa branca para a carga ou os pesos usados de fato, se forem outros; a hora ao lado, nas duas linhas.
 * Sem carga prevista, as caixas para escrever.
 */
function cargaDoEnsaio(ctx: Contexto, c: CargaPlanejada | null, rotuloCarga: string, rotuloPesos: string): NoObjeto {
  const { u } = ctx
  const comCarga = !!c && c.carga > 0
  return grade(
    [
      [
        comCarga
          ? previsto(`${rotuloCarga} (${u})`, { text: cargaNaDivisao(ctx, c!.carga), bold: true }, { confere: true })
          : escrever(`${rotuloCarga}${u ? ` (${u})` : ''}`),
        comCarga
          ? previsto(rotuloPesos, pesosDaCarga(ctx, c!, 8.7), { span: 2, confere: true })
          : escrever('Pesos ou carga usada', { span: 2 }),
        { ...escrever('Hora', { formato: '____:____' }), linhas: comCarga ? 2 : 1 },
      ],
      ...(comCarga ? [[corrigir(), corrigir(2)]] : []),
    ],
    [132, '*', '*', 70],
  )
}

function blocoRepetibilidade(ctx: Contexto, r: PlanoFolha['repetibilidade'][number] | null, titulo: string): No[] {
  const uc = unidadeColuna(ctx)
  const n = r ? r.leituras : 5
  const minimo = r ? r.minimo : 5
  // Três blocos lado a lado. Carga de 100 kg ou mais (mínimo 3): 6 linhas bastam; nas menores, 9. Com mais
  // leituras, k fica mais perto de 2 (k = t de Student, sempre acima de 2 com s > 0): as que não couberem vão
  // nas Anotações internas do passo 9 (as Observações saem no certificado)
  const total = Math.max(minimo === 3 ? 6 : 9, Math.ceil(n / 3) * 3)
  const sobra = total < 10 ? ` As que não couberem: em Anotações internas (passo ${N.encerramento}).` : ''
  const terco = total / 3
  const linhasDe = (de: number, ate: number): CelulaTabela[][] =>
    Array.from({ length: ate - de }, (_, i) => [nro(String(de + i + 1)), livre(), livre()])
  const colunas: Coluna[] = [
    { titulo: 'Nº', largura: 16, alinhamento: 'center' },
    { titulo: 'Com a carga', unidade: uc, largura: '*' },
    { titulo: 'Zero após retirar', unidade: uc, largura: '*' },
  ]
  // Rodoviária e ferroviária: a carga é um veículo (a carga aplicada é a indicação dele na 1ª leitura)
  const cabeca = comVeiculo(ctx)
    ? cargaDoVeiculo(ctx, 'Carga aplicada', '1ª leitura')
    : cargaDoEnsaio(ctx, r, 'Carga aplicada', 'Pesos previstos (não precisa ser padrão: uma peça só é o ideal)')
  return [
    ...(titulo ? [subtitulo(titulo, [0, 2, 0, 3])] : []),
    cabeca,
    {
      columns: [0, 1, 2].map((i) => ({
        width: '*',
        stack: [tabelaLeituras(colunas, linhasDe(i * terco, (i + 1) * terco))],
      })),
      columnGap: 8,
      margin: [0, 5, 0, 0],
    },
    nota(
      r
        ? `Faça as ${n} leituras previstas (mínimo ${minimo}${minimo === 3 ? ', por ser carga de 100 kg ou mais' : ''}). ${total > n ? (total === n + 1 ? `Linha ${total}: opcional; ` : `Linhas ${n + 1} a ${total}: opcionais; `) : ''}mais leituras deixam a incerteza menor (com 10 leituras, k fica mais perto de 2).${sobra}`
        : `Mínimo de 5 leituras (3 se a carga for de 100 kg ou mais); com 10 leituras, k fica mais perto de 2.${sobra}`,
    ),
  ]
}

/** Rodoviária ou ferroviária: a repetibilidade e a excentricidade são feitas com um veículo, não com blocos. */
const comVeiculo = (ctx: Contexto) => !!ctx.b && ehRodoviaria(ctx.b)

/** "nº do desenho = nº da linha" sem quebra em volta do "=". */
const DESENHO_LINHA = `nº do desenho${NBSP}=${NBSP}nº da linha`

/** Com um veículo, o que se faz em cada parada (passos 7 e 8). */
const PARADA_VEICULO = 'motor desligado, freio puxado, motorista sempre na mesma condição'

/**
 * Carga de um ensaio feito com um veículo (passos 7 e 8): a carga é a indicação do veículo (na 1ª leitura
 * ou na posição 1), escrita no local, e o veículo usado; a hora ao lado. Nada de pesos previstos.
 */
function cargaDoVeiculo(ctx: Contexto, rotuloCarga: string, onde: string): NoObjeto {
  return grade(
    [
      [
        escrever(`${rotuloCarga} (${ctx.u})`, { aoLado: `= indicação na ${onde}` }),
        escrever('Veículo / carga', { span: 2, aoLado: 'tipo e placa' }),
        escrever('Hora', { formato: '____:____' }),
      ],
    ],
    [176, '*', '*', 70],
  )
}

function passoRepetibilidade(ctx: Contexto, n: number): No[] {
  const { plano, u } = ctx
  const lista = plano?.repetibilidade ?? []
  const primeiro = lista[0]
  const veiculo = comVeiculo(ctx)
  const vezes = primeiro ? primeiro.leituras : 3
  const texto: No = veiculo
    ? [
        `Zere. Use um veículo de massa constante; pare na marca do centro, ${PARADA_VEICULO}. Anote a indicação estável, saia e anote o zero. `,
        { text: `Repita ${vezes} vezes`, bold: true },
        ', do mesmo jeito.',
      ]
    : primeiro
      ? [
          `Zere. Coloque ${numeroBr(primeiro.carga)} ${u} no centro ${centro(ctx.b)}, anote a indicação estável, retire e anote o zero. `,
          { text: `Repita ${primeiro.leituras} vezes`, bold: true },
          ', do mesmo jeito.',
        ]
      : [
          'Zere. Coloque uma carga de ',
          { text: 'cerca de metade de Max', bold: true },
          ' no centro, anote a indicação, retire e anote o zero. Repita 5 vezes (3 se a carga for de 100 kg ou mais). ',
          // Em branco, a balança pode ser uma rodoviária
          { text: 'Rodoviária:', bold: true },
          ` use um veículo de massa constante (${PARADA_VEICULO}); carga aplicada = indicação na 1ª leitura.`,
        ]
  const blocos = lista.length
    ? lista.map((r, i) => blocoRepetibilidade(ctx, r, lista.length > 1 ? `Ensaio ${i + 1}` : ''))
    : [blocoRepetibilidade(ctx, null, '')]
  return passo(
    ctx,
    n,
    'Repetibilidade',
    E.repetibilidade,
    texto,
    blocos[0],
    blocos.slice(1).map((b) => ({ stack: b })),
  )
}

// ---- 8. Excentricidade ------------------------------------------------------------------------------------------

function opcoesMetodoEcc(previsto: MetodoExcentricidade | null, colunas = 1): NoObjeto {
  const op = (m: MetodoExcentricidade): Opcao => ({
    rotulo: { text: [{ text: `${m}. `, bold: true }, METODOS_EXCENTRICIDADE[m]] },
    prevista: previsto === m,
  })
  if (colunas === 1) return opcoes(([1, 2, 3, 4] as const).map(op), { vertical: true, tamanho: 7.2 })
  return {
    columns: [
      { width: '*', ...opcoes([op(1), op(2)], { vertical: true, tamanho: 7.2 }) },
      { width: '*', ...opcoes([op(3), op(4)], { vertical: true, tamanho: 7.2 }) },
    ],
    columnGap: 10,
  }
}

function passoExcentricidade(ctx: Contexto, n: number): No[] {
  const { b, plano, u } = ctx
  const uc = unidadeColuna(ctx)
  const ecc = plano?.excentricidade
  if (ecc && !ecc.aplicavel) {
    return passo(ctx, n, 'Excentricidade', E.excentricidade, 'Ensaio previsto como não aplicável. Confirme no local.', [
      grade(
        [
          [
            previsto('Por que o ensaio não foi feito (sai no certificado)', ecc.motivo || '—', { confere: true }),
            // As posições e leituras de um ensaio não previsto vão nas anotações internas (as observações saem no certificado)
            marcar(
              'Ensaio realizado',
              [{ rotulo: 'não', prevista: true }, { rotulo: 'sim: anote posições e leituras em Anotações internas' }],
              { vertical: true, tamanho: 7.6 },
            ),
          ],
        ],
        ['*', 240],
      ),
    ])
  }
  const receptor = b?.receptor ?? 'RETANGULAR'
  // Em branco o receptor não é conhecido: a posição de cada linha é escrita no local
  const rotulos = b ? (ecc?.posicoes.length ? ecc.posicoes : posicoesExcentricidade(receptor, b.apoios)) : []
  const diagrama = b ? diagramaExcentricidade(receptor, rotulos, -1, b.apoios, { frente: 'FRENTE · INDICADOR' }) : null
  // Rodoviária: o desenho comprido, com o "como foi feito" embaixo, à esquerda da tabela (mais estreita)
  const larga = receptor === 'RODOVIARIA'
  const larguraEsquerda = larga ? 236 : 176
  const larguraDiagrama = larga ? 236 : receptor === 'APOIOS' || receptor === 'TANQUE' ? 168 : 100
  const tabela = tabelaLeituras(
    [
      { titulo: 'Nº', largura: 16, alinhamento: 'center' },
      { titulo: 'Posição', largura: '*' },
      { titulo: 'Zero ou centro antes', unidade: `${uc} · métodos 3 e 4`, largura: larga ? 70 : 84 },
      { titulo: 'Indicação', unidade: uc, largura: larga ? 70 : 84 },
    ],
    b
      ? rotulos.map((r, i): CelulaTabela[] => [nro(String(i + 1)), pre(r), livre(), livre()])
      : // Em branco: 8 linhas, que cobrem também 6 a 8 apoios e a rodoviária (ida e volta)
        Array.from({ length: LINHAS_EXCENTRICIDADE_EM_BRANCO }, (_, i): CelulaTabela[] => [
          nro(String(i + 1)),
          livre(),
          livre(),
          livre(),
        ]),
  )
  const comCarga = !!ecc && ecc.carga > 0
  // Rodoviária e ferroviária: carga rolante, com um veículo; a carga usada é a indicação na posição 1
  const veiculo = comVeiculo(ctx)
  const cabeca = veiculo
    ? cargaDoVeiculo(ctx, 'Carga usada', 'posição 1')
    : cargaDoEnsaio(ctx, ecc ?? null, 'Carga usada', 'Pesos previstos')
  // Sem carga prevista, a regra da carga vai na instrução (a caixa da carga fica livre para escrever)
  const texto: No = veiculo
    ? [
        'Zere vazia. Use um veículo de massa constante; pare nas marcas de início, meio e fim, na ida e na volta, ',
        { text: 'na ordem do desenho', bold: true },
        ` (${DESENHO_LINHA}); em cada parada, ${PARADA_VEICULO}.`,
      ]
    : [
        ...(comCarga
          ? [`Zere vazia e coloque ${numeroBr(ecc!.carga)} ${u} em cada posição, `]
          : [
              'Zere vazia e coloque a carga (',
              { text: 'Max/3 até 500 kg · Max/5 até 3 t · Max/10 acima', bold: true },
              ') em cada posição, ',
            ]),
        { text: 'na ordem do desenho', bold: true },
        ` (${DESENHO_LINHA}). Frente = lado do indicador.`,
      ]
  const metodo = ecc ? ecc.metodo : null
  const desenho: No = diagrama
    ? {
        svg: diagrama.svg,
        width: larguraDiagrama,
        height: (larguraDiagrama * diagrama.altura) / diagrama.largura,
        margin: [(larguraEsquerda - larguraDiagrama) / 2, 0, 0, 0],
      }
    : b
      ? { text: 'Desenhe as posições aqui', fontSize: 7, color: T.suave, margin: [0, 30, 0, 30] }
      : desenhosDeReferencia(larguraEsquerda)
  const comoFoi = (colunas: number): No[] => [
    {
      text: [rotulo('Como foi feito'), { text: '  · 2 e 4: sem zero automático', fontSize: 6.2, color: T.suave }],
      margin: [0, 4, 0, 3],
    },
    opcoesMetodoEcc(metodo, colunas),
  ]
  const corpo: No[] = [
    {
      columns: [
        { width: larguraEsquerda, margin: [0, 5, 12, 0], stack: [desenho, ...comoFoi(1)] },
        { width: '*', stack: [tabela], margin: [0, 5, 0, 0] },
      ],
    },
  ]
  // A carga fica com o título; o desenho e as leituras podem ir para a página seguinte
  return passo(
    ctx,
    n,
    'Excentricidade',
    E.excentricidade,
    texto,
    [cabeca],
    [
      {
        stack: [
          ...corpo,
          ...(b
            ? []
            : [
                nota(
                  'Escreva a posição de cada linha (ex.: centro, frente esquerda). Prato retangular ou redondo: na ordem dos desenhos. Mais de 4 apoios ou tanque: uma posição por apoio (apoio 1, 2…). Rodoviária: com um veículo, pare no início, no meio e no fim, na ida e na volta; carga usada = indicação na posição 1.',
                  [0, 4, 0, 0],
                ),
              ]),
        ],
      },
    ],
  )
}

/** Linhas da excentricidade na folha em branco. */
const LINHAS_EXCENTRICIDADE_EM_BRANCO = 8

/** Folha em branco: os desenhos do prato retangular e do redondo, lado a lado, como referência da ordem. */
function desenhosDeReferencia(largura: number): No {
  const lado = (receptor: 'RETANGULAR' | 'CIRCULAR', legenda: string): NoObjeto => {
    const d = diagramaExcentricidade(receptor, posicoesExcentricidade(receptor), -1, 4, { frente: 'FRENTE' })!
    const w = (largura - 8) / 2
    return {
      width: w,
      stack: [
        { svg: d.svg, width: w, height: (w * d.altura) / d.largura },
        { text: legenda, fontSize: 6.2, color: T.suave, alignment: 'center', margin: [0, 1, 0, 0] },
      ],
    }
  }
  return { columns: [lado('RETANGULAR', 'retangular'), lado('CIRCULAR', 'redondo')], columnGap: 8 }
}

// ---- 9. Encerramento: ambiente no fim e conclusão com o cliente ----------------------------------------------

/**
 * Linhas de observação sempre impressas; com espaço sobrando no fim da página delas, ganham até mais 16
 * (e, quando as opiniões passaram para a página seguinte, uma continuação de até 8 linhas no alto dela,
 * logo depois das observações).
 */
const LINHAS_OBSERVACOES = 3
const MAX_LINHAS_EXTRAS = 16
const MAX_LINHAS_CONTINUACAO = 8
const ID_OBSERVACOES = 'parte-observacoes'
const ID_CONTINUACAO = 'parte-observacoes-continuacao'
const ID_OPINIOES = 'parte-opinioes'
const ID_FIM = 'fim-da-folha'
const TITULO_OBSERVACOES = 'Observações (saem no certificado)'

/** Rótulos curtos dos critérios da tela (o nome inteiro não cabe nas caixas de marcar). */
const CRITERIO_CURTO: Record<CriterioEma, string> = {
  PORTARIA_SERVICO: 'Portaria 157 — em serviço',
  PORTARIA_VERIFICACAO: 'Portaria 157 — verificação',
  OIML_SERVICO: 'OIML R76 — em serviço',
  OIML_INICIAL: 'OIML R76 — verif. inicial',
  CLIENTE: 'Tolerância do cliente ↓',
}

/**
 * Variação de temperatura que vai nas observações (dica da caixa): o limite da política da empresa pela
 * classe da balança — 3 °C na classe II (e na I, fora do escopo, a mais exigente), 5 °C nas III e IIII;
 * sem classe ou em branco, os dois. Exportada para os testes.
 */
export function limiteDeltaT(b: Pick<Balanca, 'classe'> | null): string {
  const classe = b?.classe ?? ''
  if (classe === 'I' || classe === 'II') return 'ΔT acima de 3 °C'
  if (classe === 'III' || classe === 'IIII') return 'ΔT acima de 5 °C'
  return 'ΔT acima do limite (5 °C; classe II: 3 °C)'
}

function passoEncerramento(ctx: Contexto, n: number): No[] {
  const { k, u } = ctx
  const c = k?.conformidade
  const pediu = !!c?.solicitada
  // Tolerância do cliente pedida, mas ainda sem o valor (vem na visita): caixa para escrever, nunca "0 kg"
  const semTolerancia = !!c && c.criterio === 'CLIENTE' && !(c.toleranciaCliente > 0)
  // Declaração de conformidade com os mesmos campos da tela (Conclusão): o cliente pediu? limite,
  // tolerância do cliente e regra de decisão. O que veio do sistema ganha "□ confere" e a caixa de corrigir.
  const perguntaConformidade = marcar(
    'O cliente pediu declaração de conformidade?',
    [
      { rotulo: 'não', prevista: !!k && !pediu },
      { rotulo: 'sim', prevista: pediu },
    ],
    { tamanho: 7.6 },
  )
  // Sem pedido no sistema: o limite com os critérios da tela para marcar (nada de texto livre: "Inmetro"
  // não diz se é verificação ou em serviço, e o EMA em serviço é o dobro)
  const limiteParaMarcar = (): Celula => {
    const op = (x: CriterioEma): Opcao => ({ rotulo: CRITERIO_CURTO[x] })
    return {
      no: {
        stack: [
          rotulo('Limite (erro máximo admissível)', { margin: [0, 0, 0, 3] }),
          {
            columns: [
              { width: '*', ...opcoes([op('PORTARIA_SERVICO'), op('PORTARIA_VERIFICACAO')], { vertical: true, tamanho: 7.2 }) },
              { width: '*', ...opcoes([op('OIML_SERVICO'), op('OIML_INICIAL')], { vertical: true, tamanho: 7.2 }) },
              { width: '*', ...opcoes([op('CLIENTE')], { vertical: true, tamanho: 7.2 }) },
            ],
            columnGap: 6,
          },
        ],
        fillColor: '#FFFFFF',
      },
      altura: 30,
      span: 3,
    }
  }
  const conformidade: Celula[][] =
    pediu && c
      ? [
          [
            { ...perguntaConformidade, linhas: 2 },
            previsto(
              'Limite (erro máximo admissível)',
              { text: CRITERIOS_EMA[c.criterio].label, bold: true },
              { span: c.criterio === 'CLIENTE' ? 1 : 2, confere: true },
            ),
            ...(c.criterio === 'CLIENTE'
              ? [
                  semTolerancia
                    ? {
                        ...escrever(`Tolerância do cliente (±)${u ? ` (${u})` : ''}${OBRIG}`, {
                          dica: 'ainda não informada: pergunte',
                        }),
                        linhas: 2,
                      }
                    : previsto('Tolerância do cliente (±)', `${numeroBr(c.toleranciaCliente)} ${u}`, { confere: true }),
                ]
              : []),
            previsto('Regra de decisão', REGRAS_DECISAO[c.regra].label, { confere: true }),
          ],
          [
            corrigir(c.criterio === 'CLIENTE' ? 1 : 2),
            ...(c.criterio === 'CLIENTE' && !semTolerancia ? [corrigir()] : []),
            corrigir(),
          ],
        ]
      : [
          [{ ...perguntaConformidade, linhas: 2 }, limiteParaMarcar()],
          [
            escrever(`Tolerância do cliente (±)${u ? ` (${u})` : ''}`, { span: 2, dica: 'só com “tolerância do cliente”' }),
            marcar('Regra de decisão', [{ rotulo: 'banda de guarda' }, { rotulo: 'aceitação simples' }], {
              tamanho: 7.4,
              vertical: true,
            }),
          ],
        ]
  const dataPrevista = !!k?.proximaCalibracao
  const noCertificado = !!k?.proximaNoCertificado
  const proxima: Celula[][] = [
    [
      dataPrevista
        ? previsto('Próxima calibração (data)', formatarDataBr(k!.proximaCalibracao), { confere: true })
        : escrever('Próxima calibração (data)', { formato: '____/____/________' }),
      {
        ...marcar(
          'O cliente pediu a data no certificado? (*)',
          [
            { rotulo: 'não: fica só como lembrete interno', prevista: !!k && !noCertificado },
            { rotulo: 'sim: a data sai no certificado', prevista: noCertificado },
          ],
          { span: 3, tamanho: 7.6, espaco: 14 },
        ),
        linhas: dataPrevista ? 2 : 1,
      },
    ],
    ...(dataPrevista ? [[corrigir()]] : []),
  ]
  const observacoes = linhasGuia(
    LINHAS_OBSERVACOES + ctx.extras.linhas,
    TITULO_OBSERVACOES,
    `itens “Não” da verificação, ${limiteDeltaT(ctx.b)}, faixa ou carga fora do previsto, ensaio não feito e o motivo`,
  )
  return passo(
    ctx,
    n,
    'Encerramento: ambiente no fim e conclusão',
    e2(E.padroes, E.conclusao),
    'Meça o ambiente de novo, no mesmo lugar e com o mesmo instrumento. Confira que os acordos marcados na chegada não mudaram.',
    [gradeAmbiente(ctx, 'Fim')],
    [
      { ...grade([...conformidade, ...proxima], ['*', '*', '*', 150]), margin: [0, 6, 0, 0] },
      {
        parte: { ...observacoes, margin: [0, 6, 0, 0] },
        id: ID_OBSERVACOES,
        ...(ctx.extras.observacoesAdiante ? { quebra: true } : {}),
      },
      // A continuação vem logo depois das observações (no alto da página seguinte), nunca depois das opiniões
      ...(ctx.extras.continuacao
        ? [
            {
              parte: linhasGuia(
                ctx.extras.continuacao,
                'Observações (continuação)',
                'saem no certificado, como as do fim da página anterior',
              ),
              id: ID_CONTINUACAO,
              quebra: true,
            },
          ]
        : []),
      {
        parte: {
          columns: [
            { width: '*', ...linhasGuia(1, 'Opiniões e interpretações (opcional)', 'recomendações ao cliente') },
            { width: '*', ...linhasGuia(1, 'Anotações internas', 'não saem no certificado') },
          ],
          columnGap: 8,
          margin: [0, 5, 0, 0],
        },
        id: ID_OPINIOES,
      },
    ],
  )
}

// ---- 10. Assinaturas e escritório ---------------------------------------------------------------------------

function passoAssinaturas(ctx: Contexto, n: number): No[] {
  const campo = grade(
    [
      [
        // Quem executou escreve o nome ao lado da assinatura (o previsto pode não ser quem foi)
        escrever('Técnico que executou (nome)', { altura: 28 }),
        escrever('Assinatura', { altura: 28 }),
        escrever('Data', { formato: '___/___/_____', altura: 28 }),
        escrever('Hora de término', { formato: '____:____', altura: 28 }),
      ],
      [
        escrever('Acompanhado pelo cliente (nome e função)', { altura: 28 }),
        // O cliente assina que está ciente das condições e acordos desta folha, não dos resultados
        escrever('Assinatura', { altura: 28, aoLado: 'ciente das condições, não dos resultados' }),
        escrever('Data', { formato: '___/___/_____', altura: 28 }),
        { no: { text: '' }, altura: 28, span: 1 },
      ],
    ],
    [160, '*', 80, 70],
  )
  const tracejado = { dash: { length: 2, space: 1.6 } }
  const escritorio = {
    table: {
      widths: ['*', 66, '*', 66, 118],
      body: [
        [
          {
            text: [
              { text: 'ESCRITÓRIO  ', font: 'InterMedio', bold: true, characterSpacing: 0.4, color: T.texto },
              'conferência da digitação com esta folha (ISO/IEC 17025, 7.5.1 e 7.11.6) — de preferência por outra pessoa',
            ],
            fontSize: 6.6,
            color: T.suave,
            colSpan: 5,
          },
          {},
          {},
          {},
          {},
        ],
        [
          { stack: [rotulo('Digitado no sistema por')] },
          { stack: [rotulo('Em'), { text: '___/___/_____', fontSize: 7.2, color: T.suave, margin: [0, 8, 0, 0] }] },
          { stack: [rotulo('Conferido com a folha por')] },
          { stack: [rotulo('Em'), { text: '___/___/_____', fontSize: 7.2, color: T.suave, margin: [0, 8, 0, 0] }] },
          { stack: [rotulo('Certificado nº (preenchido no escritório)')] },
        ],
        [
          {
            colSpan: 5,
            text: [
              { text: 'PARA DIGITAR, NA ORDEM DO SISTEMA  ', font: 'InterMedio', fontSize: 5.9, characterSpacing: 0.3 },
              ...ROTEIRO_DIGITACAO.flatMap((r, i) => [
                ...(i ? [{ text: '  ·  ', color: T.linha }] : []),
                { text: r.etapa, bold: true },
                ` ← ${r.passos.includes(' ') ? 'passos' : 'passo'} ${r.passos}`,
              ]),
              // Onde vão as duas metades da tabela de pontos quando houve ajuste
              {
                text: `\nCom ajuste (passo ${N.ajuste}): as colunas “como encontrado” do passo ${N.indicacao} vão na aba “Antes do ajuste” da etapa ${E.indicacao} e as “depois do ajuste”, na aba “Depois do ajuste”, cada uma com o seu método${comSubstituicao(ctx) ? ', o seu retorno ao zero e as suas etapas de substituição' : ' e o seu retorno ao zero'}.`,
              },
            ],
            fontSize: 6.4,
            lineHeight: 1.25,
            color: T.instrucao,
          },
          {},
          {},
          {},
          {},
        ],
        [
          {
            colSpan: 5,
            stack: [
              opcoes(
                [
                  // O sistema não guarda anexos da calibração: a cópia digitalizada fica na pasta da OS
                  { rotulo: 'Folha digitalizada e guardada na pasta da OS: ____________________' },
                  { rotulo: 'Original arquivado com a OS (guarda de 5 anos ou mais)' },
                ],
                { tamanho: 7.2, espaco: 18 },
              ),
            ],
          },
          {},
          {},
          {},
          {},
        ],
      ],
      heights: (i: number) => (i === 1 ? 30 : 'auto'),
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: (i: number) => (i === 0 || i === 5 ? 0.6 : 0.4),
      hLineColor: () => T.linha,
      vLineColor: () => T.linha,
      hLineStyle: () => tracejado,
      vLineStyle: () => tracejado,
      paddingLeft: () => 4.5,
      paddingRight: () => 4.5,
      paddingTop: () => 2.8,
      paddingBottom: () => 2.8,
    },
    margin: [0, 8, 0, 0],
  }
  // As assinaturas e o quadro do escritório ficam juntos, no fim da folha: o quadro nunca vai sozinho para
  // uma página nova (se o passo não cabe, as observações crescem no espaço que ele deixa)
  return passo(ctx, n, 'Assinaturas', e2(E.cliente, E.revisao), null, [campo, escritorio])
}

// ---- Cabeçalho e rodapé ------------------------------------------------------------------------------------

/** Tamanhos da letra dos valores da faixa de identificação: o maior em que a balança cabe inteira. */
const TAMANHOS_FAIXA = [7.4, 6.8, 6.2]
/** Respiro à direita de cada valor da faixa e folga da medida (pt). */
const RESPIRO_FAIXA = 14
const FOLGA_FAIXA = 2
/**
 * Largura do cliente (pt) com que a letra ainda fica no tamanho maior; abaixo dela, a letra diminui. O
 * cliente nunca fica com menos que o mínimo: com uma balança enorme, a TAG é que encurta.
 */
const BOM_CLIENTE_FAIXA = 110
const MIN_CLIENTE_FAIXA = 64

/**
 * Valores da faixa de identificação numa linha só, dentro da largura da página: a balança (nº de série e
 * TAG) é o que identifica o serviço e vai inteira (com a letra um pouco menor, se preciso); o cliente
 * encurta com "…" (o nome inteiro está no passo 2). Só uma TAG enorme encurta, nunca o nº de série.
 * Exportada para os testes.
 */
export function textosDaFaixa(e: { os: string; cliente: string | null; serie: string; tag: string }): {
  os: string
  cliente: string
  balanca: string
  /** Tamanho da letra dos valores (pt). */
  tamanho: number
  /** Largura de cada coluna de valor (o texto e o respiro à direita), em pt. */
  larguras: { os: number; cliente: number; balanca: number }
} {
  const rot = (t: string) => larguraTexto(t.toUpperCase(), { fonte: 'InterMedio', tamanho: 5.8, espacamento: 0.3 }) + 3
  const rotulos = rot('OS') + rot('Cliente') + rot('Balança')
  const serie = e.serie ? `nº de série ${e.serie}` : ''
  const juntar = (tag: string) => [serie, tag && `TAG ${tag}`].filter(Boolean).join(' · ')
  const montar = (tamanho: number, paraOCliente: number, encurtarTag: boolean) => {
    const fonte = { negrito: true, tamanho }
    const coluna = (t: string) => larguraTexto(t, fonte) + RESPIRO_FAIXA + FOLGA_FAIXA
    /** O texto (encurtado, se preciso) que cabe numa coluna de `largura`. */
    const caber = (t: string, largura: number) => caberNaLargura(t, largura - RESPIRO_FAIXA - FOLGA_FAIXA, fonte)
    // Sem valor, a linha para escrever (OS 70 pt, balança 130 pt)
    const os = caber(e.os, 130)
    const larguraOs = os ? coluna(os) : 70
    const disponivel = LARGURA - rotulos - larguraOs
    const minCliente = e.cliente === null ? 70 : Math.min(coluna(e.cliente || ' '), paraOCliente)
    const paraBalanca = disponivel - minCliente
    let balanca = juntar(e.tag)
    if (balanca && coluna(balanca) > paraBalanca) {
      if (!encurtarTag || !e.tag) return null
      // Só a TAG encurta: o nº de série vai sempre inteiro
      const prefixo = larguraTexto(serie ? `${serie} · TAG ` : 'TAG ', fonte)
      balanca = juntar(caberNaLargura(e.tag, paraBalanca - prefixo - RESPIRO_FAIXA - FOLGA_FAIXA, fonte))
    }
    const larguraBalanca = balanca ? coluna(balanca) : 130
    const paraCliente = Math.max(0, disponivel - larguraBalanca)
    const cliente = e.cliente ? caber(e.cliente, paraCliente) : ''
    const larguraCliente = e.cliente === null ? 0 : e.cliente ? Math.min(coluna(cliente || ' '), paraCliente) : 70
    return { os, cliente, balanca, tamanho, larguras: { os: larguraOs, cliente: larguraCliente, balanca: larguraBalanca } }
  }
  // A letra maior em que a balança cabe inteira com um bom pedaço do cliente; senão, com o mínimo dele
  for (const minimo of [BOM_CLIENTE_FAIXA, MIN_CLIENTE_FAIXA])
    for (const tamanho of TAMANHOS_FAIXA) {
      const r = montar(tamanho, minimo, false)
      if (r) return r
    }
  return montar(TAMANHOS_FAIXA.at(-1)!, MIN_CLIENTE_FAIXA, true)!
}

/** Identificação da tarefa em toda página (ISO/IEC 17025, 7.5.1): OS, cliente e balança. */
function faixaIdentificacao(ctx: Contexto): NoObjeto {
  const { d, b, k } = ctx
  const c = d.cliente
  const t = textosDaFaixa({
    os: k?.ordemServico?.trim() ?? '',
    cliente: c ? (c.nome || c.razaoSocial).trim() : null,
    serie: b?.numeroSerie?.trim() ?? '',
    tag: b?.identificacao?.trim() ?? '',
  })
  const { os, cliente, balanca } = t
  const rot = (texto: string) => ({
    text: texto.toUpperCase(),
    font: 'InterMedio',
    fontSize: 5.8,
    characterSpacing: 0.3,
    color: T.rotulo,
    border: [false, false, false, false],
    margin: [0, 2.4, 3, 0],
  })
  const val = (texto: string) =>
    texto
      ? {
          text: texto,
          fontSize: t.tamanho,
          bold: true,
          color: T.texto,
          noWrap: true,
          border: [false, false, false, false],
          margin: [0, 1, RESPIRO_FAIXA, 0],
        }
      : { text: '', border: [false, false, false, true], margin: [0, 0, RESPIRO_FAIXA, 0] }
  // Larguras medidas (nada passa da margem direita); sem cliente (folha em branco), a linha dele ocupa o resto
  const { larguras } = t
  return {
    table: {
      widths: ['auto', larguras.os, 'auto', c ? larguras.cliente : '*', 'auto', larguras.balanca, '*'],
      body: [
        [
          rot('OS'),
          val(os),
          rot('Cliente'),
          val(cliente),
          rot('Balança'),
          val(balanca),
          { text: '', border: [false, false, false, false] },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.6,
      hLineColor: () => T.linha,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 2,
    },
  }
}

/** Lado do QR do nº da folha, no cabeçalho de toda página (≈ 12 mm; módulos de ≈ 0,5 mm). */
const LADO_QR = 34

function cabecalho(ctx: Contexto) {
  const numero = ctx.d.numero.trim()
  // Desenhado uma vez e repetido em cada página
  const qr = numero ? qrSvg(numero) : ''
  return (pagina: number, total: number): NoObjeto => ({
    margin: [MARGEM_X, TOPO_CABECALHO, MARGEM_X, 0],
    stack: [
      {
        columns: [
          ...colunasMarca(ctx.d.empresa),
          {
            width: 'auto',
            alignment: 'right',
            margin: [0, -1.5, 0, 0],
            lineHeight: 1,
            stack: [
              {
                text: 'FOLHA DE CAMPO — CALIBRAÇÃO DE BALANÇA',
                font: 'InterMedio',
                fontSize: 6.3,
                characterSpacing: 0.5,
                color: COR.marcaTexto,
              },
              numero
                ? {
                    text: numero,
                    font: 'Poppins',
                    fontSize: 12.5,
                    lineHeight: 0.8,
                    color: TIMBRADO.texto,
                    margin: [0, -1.5, 0, 0],
                  }
                : { text: 'Nº ________________', fontSize: 9, color: TIMBRADO.secundario, margin: [0, 1, 0, 0] },
              { text: `Página ${pagina} de ${total}`, fontSize: 7, color: TIMBRADO.secundario, margin: [0, 4.6, 0, 0] },
            ],
          },
          ...(qr ? [{ svg: qr, width: LADO_QR, height: LADO_QR, margin: [7, -3, -2, 0] }] : []),
        ],
      },
      // Uma linha nova a cada página: o pdfmake reaproveita o nó do cabeçalho e guardaria as posições
      { ...faixaIdentificacao(ctx), margin: [0, TOPO_FAIXA - TOPO_CABECALHO - MODULO, 0, 0] },
    ],
  })
}

/** Código do procedimento que a folha segue (o primeiro item da referência do formulário: "PT-CAL-01"). */
export const PROCEDIMENTO = FORMULARIO_FOLHA_CAMPO.referencia.split(' · ')[0]

function rodape(ctx: Contexto) {
  const f = FORMULARIO_FOLHA_CAMPO
  const { impresso, d } = ctx
  const quem = [
    impresso ? `Impressa em ${impresso.data}, às ${impresso.hora}` : 'Impressa',
    vazio(d.impressoPor) ? '' : ` por ${d.impressoPor.trim()}`,
  ].join('')
  return (): NoObjeto => ({
    margin: [MARGEM_X, BASE_RODAPE - 22 - (A4.altura - MARGEM_BASE), MARGEM_X, 0],
    columns: [
      {
        width: '*',
        stack: [
          {
            text: [
              { text: `${f.codigo} rev. ${f.revisao}`, bold: true, color: TIMBRADO.texto },
              // O procedimento sem a revisão: a folha não precisa ser reimpressa a cada revisão do PT
              ` · ${PROCEDIMENTO} · registro de dados brutos (ISO/IEC 17025, 7.5) · não é certificado de calibração`,
            ],
          },
          { text: `${quem} · guarde o original com a OS` },
        ],
        fontSize: 6.2,
        lineHeight: 1.25,
        color: TIMBRADO.secundario,
      },
      {
        width: 'auto',
        text: [
          { text: 'RUBRICA  ', font: 'InterMedio', fontSize: 5.7, characterSpacing: 0.4 },
          '______________     ',
          { text: 'DATA  ', font: 'InterMedio', fontSize: 5.7, characterSpacing: 0.4 },
          '____/____/________',
        ],
        fontSize: 7.4,
        color: TIMBRADO.secundario,
        margin: [10, 5, 0, 0],
      },
    ],
  })
}

// ---- Documento -------------------------------------------------------------------------------------------------

/** Definição do documento do pdfmake (exportada para os testes). */
export function definicaoFolhaCampo(d: DadosFolhaCampo, o: { extras?: Extras } = {}): NoObjeto {
  const ctx = contexto(d, o.extras)
  const conteudo: No[] = [
    ...introducao(),
    ...passoPadroes(ctx, N.padroes),
    ...passoChegada(ctx, N.chegada),
    ...passoBalanca(ctx, N.balanca),
    ...passoVerificacao(ctx, N.verificacao),
    ...passoIndicacao(ctx, N.indicacao),
    ...passoAjuste(ctx, N.ajuste, N.indicacao),
    ...passoRepetibilidade(ctx, N.repetibilidade),
    ...passoExcentricidade(ctx, N.excentricidade),
    ...passoEncerramento(ctx, N.encerramento),
    ...passoAssinaturas(ctx, N.assinaturas),
    // Marca do fim do conteúdo (o nº de páginas e o espaço que sobra na última)
    marca(ID_FIM),
  ]
  const data = new Date(d.impressoEm)
  const quando = Number.isNaN(data.getTime()) ? new Date(0) : data
  const c = d.cliente
  const b = d.balanca
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGEM_X, MARGEM_TOPO, MARGEM_X, MARGEM_BASE],
    language: 'pt-BR',
    displayTitle: true,
    info: {
      title: `Folha de campo ${d.numero}`,
      author: d.empresa.razaoSocial || d.empresa.nomeFantasia,
      subject: [
        'Folha de campo de calibração de balança',
        c ? c.razaoSocial || c.nome : '',
        b ? [b.fabricante, b.modelo, b.numeroSerie && `nº de série ${b.numeroSerie}`].filter(Boolean).join(' ') : 'em branco',
      ]
        .filter(Boolean)
        .join(' — '),
      keywords: `folha de campo; ${d.numero}; ${FORMULARIO_FOLHA_CAMPO.codigo}; ${FORMULARIO_FOLHA_CAMPO.referencia}`,
      creator: 'BC Calibração',
      producer: 'BC Calibração',
      creationDate: quando,
      modDate: quando,
    },
    header: cabecalho(ctx),
    footer: rodape(ctx),
    background: fundoTimbrado(MARGEM_X, LARGURA),
    content: conteudo,
    defaultStyle: { font: 'Inter', fontSize: 8.4, lineHeight: 1.15, color: T.texto },
  }
}

/** Gera a folha de campo em PDF. Determinística: a data do documento é a da impressão. */
export async function gerarFolhaCampoPdf(d: DadosFolhaCampo): Promise<Buffer> {
  return (await montar(d)).pdf
}

interface PosicaoNo {
  id?: string
  startPosition: { pageNumber: number; top: number }
}

/**
 * A folha montada: o PDF, os extras usados, as marcas (id → página e altura), o nº de páginas e os blocos
 * inteiros que sumiram do PDF (`faltando`, ver `descartados`).
 */
export interface Medida {
  pdf: Buffer
  extras: Extras
  marcas: Map<string, { pagina: number; topo: number }>
  paginas: number
  faltando: string[]
}

/**
 * Blocos inteiros (um passo com a primeira parte, ou outra parte dele) que o pdfmake descartou: mais altos
 * que a página, eles somem do PDF sem erro (só a posição de antes fica registrada), e o que vem depois
 * começa no alto da página seguinte. A marca do fim do bloco fica então no topo de uma página depois da
 * dele, sem nada antes dela; um bloco posto, mesmo o que passou para a página seguinte, termina mais abaixo.
 */
function descartados(marcas: Map<string, { pagina: number; topo: number }>): string[] {
  return [...marcas.entries()]
    .filter(([id, x]) => {
      if (!/^(passo-\d+$|parte-)/.test(id)) return false
      const fim = marcas.get(`fim:${id}`)
      return !!fim && fim.pagina > x.pagina && fim.topo <= MARGEM_TOPO + 0.5
    })
    .map(([id]) => id)
}

async function medir(d: DadosFolhaCampo, extras: Extras): Promise<Medida> {
  const marcas = new Map<string, { pagina: number; topo: number }>()
  const definicao = definicaoFolhaCampo(d, { extras })
  definicao.pageBreakBefore = (no: PosicaoNo) => {
    if (no.id && !marcas.has(no.id)) marcas.set(no.id, { pagina: no.startPosition.pageNumber, topo: no.startPosition.top })
    return false
  }
  const pdf: Buffer = await pdfmake().createPdf(definicao).getBuffer()
  return { pdf, extras, marcas, paginas: marcas.get(ID_FIM)?.pagina ?? 0, faltando: descartados(marcas) }
}

/**
 * Partes de passo que passaram inteiras para a página seguinte (a marca depois delas está numa página
 * depois da que elas tentaram): abrem a página e precisam do título do passo.
 */
function abremPagina(m: Medida): string[] {
  return [...m.marcas.entries()]
    .filter(([id, x]) => id.startsWith('parte-') && (m.marcas.get(`fim:${id}`)?.pagina ?? x.pagina) > x.pagina)
    .map(([id]) => id)
}

/**
 * Os títulos de continuação estão certos: saem exatamente nas partes que abrem uma página. Nenhuma fica
 * solta no alto de uma página e nenhuma repete o título no meio da página onde o passo está (a parte que
 * abria a página numa montagem e, noutra, coube na de antes).
 */
function continuacoesExatas(m: Medida): boolean {
  const abrem = abremPagina(m)
  const titulos = m.extras.continuacoes
  return abrem.length === titulos.length && abrem.every((id) => titulos.includes(id))
}

/** Espaço livre no pé de uma página (pt): da última marca dela até a margem de baixo. */
function livreNaPagina(m: Medida, pagina: number): number {
  const fim = Math.max(0, ...[...m.marcas.values()].filter((x) => x.pagina === pagina).map((x) => x.topo))
  return A4.altura - MARGEM_BASE - fim
}

/** Metade da altura útil da página (pt): com mais que isso em branco, a página parece incompleta. */
const MEIA_PAGINA = (A4.altura - MARGEM_TOPO - MARGEM_BASE) / 2

/**
 * Espaço livre no pé de uma página (pt) pelo fim dos blocos que terminam nela: a posição de início de um
 * bloco que passou para a página seguinte fica registrada no pé desta, e não conta.
 */
function livreDepoisDosBlocos(m: Medida, pagina: number): number {
  const fins = [...m.marcas.entries()].filter(([id, x]) => x.pagina === pagina && (id.startsWith('fim:') || id === ID_FIM))
  return A4.altura - MARGEM_BASE - Math.max(MARGEM_TOPO, ...fins.map(([, x]) => x.topo))
}

/** Altura de uma linha de observação (a linha e o fio). */
const LINHA_OBS = ALTURA_ESCRITA + 0.5

/**
 * Linhas de observação a mais: o espaço que sobra no fim da página onde as observações estão (as opiniões,
 * se estão nela, só descem) e, quando as opiniões passaram para a página seguinte, a continuação no alto
 * dela, logo depois das observações e antes das opiniões.
 */
function linhasDeObservacao(m: Medida): { linhas: number; continuacao: number } {
  const obs = m.marcas.get(`fim:${ID_OBSERVACOES}`)
  if (!obs) return { linhas: 0, continuacao: 0 }
  const linhas = Math.max(0, Math.min(MAX_LINHAS_EXTRAS, Math.floor((livreNaPagina(m, obs.pagina) - 1) / LINHA_OBS)))
  const opinioes = m.marcas.get(ID_OPINIOES)
  const opinioesDepois =
    !!opinioes && opinioes.pagina === obs.pagina && m.marcas.get(`fim:${ID_OPINIOES}`)?.pagina === obs.pagina + 1
  // Título "(continuação)" do passo, o rótulo das observações e o respiro antes das opiniões (≈ 34 pt)
  const continuacao = opinioesDepois
    ? Math.min(MAX_LINHAS_CONTINUACAO, Math.floor((livreNaPagina(m, obs.pagina + 1) - 34) / LINHA_OBS))
    : 0
  return { linhas, continuacao: continuacao >= 2 ? continuacao : 0 }
}

/** Linhas mínimas no primeiro pedaço da tabela de pontos dividida (menos que isso: ela começa na página seguinte). */
const MIN_LINHAS_INICIO = 4
/**
 * Linhas mínimas no último pedaço: pelo menos dois pontos, as linhas de reserva e as do fim (retorno ao zero
 * e, com o plano, os pesos diferentes do previsto).
 */
const minLinhasFim = (ctx: Contexto) => 2 + (ctx.plano ? reservaDosPontos(ctx) + 2 : 1)

/** Página de cada linha da tabela de pontos (0 quando a linha não foi achada). */
function paginasDasLinhas(m: Medida): number[] {
  const out: number[] = []
  for (let i = 0; m.marcas.has(`${ID_LINHA_PONTOS}:${i}`); i++) out.push(m.marcas.get(`${ID_LINHA_PONTOS}:${i}`)!.pagina)
  return out
}

/**
 * Onde dividir a tabela de pontos longa (que não cabe numa página): mede o passo solto e corta a tabela onde
 * cada página acaba. Cada pedaço seguinte abre a página com o título do passo e o cabeçalho da tabela. A
 * tabela que cabe numa página nunca se divide (ver `pontosDivisiveis`).
 */
async function cortesDosPontos(d: DadosFolhaCampo, extras: Extras): Promise<number[]> {
  const ctx = contexto(d, extras)
  if (!pontosDivisiveis(ctx)) return []
  for (const modo of ['aqui', 'pagina-nova'] as const) {
    const paginas = paginasDasLinhas(await medir(d, { ...extras, medirPontos: modo }))
    const total = paginas.length
    if (!total || paginas.includes(0)) return []
    const cortes = paginas.flatMap((p, i) => (i > 0 && p !== paginas[i - 1] ? [i] : []))
    if (!cortes.length) return []
    // Um pedaço pequeno no fim da página: melhor começar a tabela na seguinte
    if (cortes[0] < MIN_LINHAS_INICIO) continue
    // O último pedaço não fica só com as linhas do fim; os seguintes ao primeiro perdem uma linha, que dá
    // lugar ao título de continuação
    cortes[cortes.length - 1] = Math.min(cortes.at(-1)!, total - minLinhasFim(ctx))
    for (let i = 1; i < cortes.length; i++) cortes[i] -= 1
    const crescentes = cortes.every((c, i) => c >= (i ? cortes[i - 1] + MIN_LINHAS_INICIO : MIN_LINHAS_INICIO))
    return crescentes ? cortes : []
  }
  return []
}

/** A tabela dividida ficou como medido: o passo não mudou de página e cada pedaço está inteiro na sua. */
function cortesConferem(m: Medida, cortes: number[]): boolean {
  const id = `passo-${N.indicacao}`
  const ini = m.marcas.get(id)
  if (!ini || m.marcas.get(`fim:${id}`)?.pagina !== ini.pagina) return false
  const paginas = paginasDasLinhas(m)
  const limites = [0, ...cortes, paginas.length]
  return limites.slice(1).every((ate, j) => paginas.slice(limites[j], ate).every((p) => p === ini.pagina + j))
}

/**
 * Remonta até os títulos de continuação ficarem exatamente nas partes que abrem uma página: a que abre
 * ganha o título; a que já não abre (o que vem antes dela mudou) perde o título.
 */
async function comContinuacoes(d: DadosFolhaCampo, m: Medida): Promise<Medida> {
  for (let i = 0; i < 6 && !continuacoesExatas(m); i++) m = await medir(d, { ...m.extras, continuacoes: abremPagina(m) })
  return m
}

/**
 * A tabela dos pontos passou inteira para a página seguinte e o título do passo ficou no pé desta: com
 * espaço embaixo dele, o aviso "tabela na próxima página" (conferido montando de novo).
 */
async function comAvisoDosPontos(d: DadosFolhaCampo, m: Medida): Promise<Medida> {
  if (m.extras.avisoPontos || !m.extras.continuacoes.includes(ID_TABELA_PONTOS)) return m
  const titulo = m.marcas.get(`passo-${N.indicacao}`)
  const fim = m.marcas.get(`fim:passo-${N.indicacao}`)
  if (!titulo || !fim || fim.pagina !== titulo.pagina || A4.altura - MARGEM_BASE - fim.topo < ALTURA_AVISO_PONTOS) return m
  const r = await medir(d, { ...m.extras, avisoPontos: true })
  const igual = r.marcas.get(`fim:passo-${N.indicacao}`)?.pagina === fim.pagina
  return igual && r.paginas === m.paginas && continuacoesExatas(r) && r.faltando.length <= m.faltando.length ? r : m
}

/**
 * As assinaturas abriram a última página e ela ficou com mais da metade em branco: as observações e as
 * opiniões vão para ela (com o título do passo e "(continuação)") e crescem lá, em vez de crescer no pé da
 * página de antes. Só quando a de antes não fica com mais da metade em branco (conferido montando de novo).
 */
async function comObservacoesAdiante(d: DadosFolhaCampo, m: Medida): Promise<Medida> {
  if (m.extras.semBlocos || m.extras.observacoesAdiante) return m
  const ultima = m.paginas
  const opinioes = m.marcas.get(`fim:${ID_OPINIOES}`)
  const assinaturas = m.marcas.get(`fim:passo-${N.assinaturas}`)
  if (!opinioes || assinaturas?.pagina !== ultima || opinioes.pagina !== ultima - 1) return m
  if (livreDepoisDosBlocos(m, ultima) <= MEIA_PAGINA) return m
  const r = await comContinuacoes(d, await medir(d, { ...m.extras, observacoesAdiante: true }))
  const certo =
    r.paginas === m.paginas &&
    continuacoesExatas(r) &&
    r.faltando.length <= m.faltando.length &&
    r.marcas.get(`fim:${ID_OBSERVACOES}`)?.pagina === ultima &&
    livreDepoisDosBlocos(r, ultima - 1) <= MEIA_PAGINA
  return certo ? r : m
}

/**
 * Monta a folha medindo onde cada bloco ficou: (1) a parte de um passo que abre uma página ganha o título
 * do passo com "(continuação)" — remontando até nenhuma parte ficar solta; (2) a tabela de pontos longa
 * (maior que uma página) se divide entre as páginas (conferido montando de novo) e, quando a tabela inteira
 * passou para a página seguinte, o pé da página do título avisa onde ela está; (3) a última página não fica
 * só com as assinaturas e mais da metade em branco: as observações vão para ela; (4) as observações
 * crescem no espaço que sobra na página delas (e continuam no alto da seguinte, se as opiniões passaram
 * para lá), conferido montando de novo: o nº de páginas não muda e nenhuma parte fica sem título.
 * Nada pode sumir: se um bloco inteiro foi descartado (mais alto que a página), a folha é montada de novo
 * sem os blocos inteiros (`Extras.semBlocos`: só o título e a instrução de cada passo ficam juntos, e nada
 * mais alto que uma página fica inteiro); se ainda assim faltar algo, erro, antes de guardar o PDF.
 */
export async function montar(d: DadosFolhaCampo): Promise<Medida> {
  const m = await montarCom(d, SEM_EXTRAS)
  if (!m.faltando.length) return m
  const seguro = await montarCom(d, { ...SEM_EXTRAS, semBlocos: true })
  if (!seguro.faltando.length) return seguro
  const passos = [...new Set(seguro.faltando.map((id) => /\d+/.exec(id)?.[0]).filter(Boolean))]
  throw new ErroApi(
    500,
    `A folha de campo não coube nas páginas (faltou o passo ${passos.join(', ')}). Nada foi guardado: avise quem cuida do sistema.`,
  )
}

async function montarCom(d: DadosFolhaCampo, base: Extras): Promise<Medida> {
  let m = await comContinuacoes(d, await medir(d, base))
  const cortes = base.semBlocos ? [] : await cortesDosPontos(d, m.extras)
  if (cortes.length) {
    // Com a tabela dividida, o que vem depois sobe: as continuações são medidas de novo, do zero
    const r = await comContinuacoes(d, await medir(d, { ...m.extras, cortes, continuacoes: [] }))
    if (cortesConferem(r, cortes) && continuacoesExatas(r) && r.paginas <= m.paginas && r.faltando.length <= m.faltando.length)
      m = r
  }
  m = await comObservacoesAdiante(d, await comAvisoDosPontos(d, m))
  const extras = m.extras
  const obs = linhasDeObservacao(m)
  const tentativas = [
    obs,
    { linhas: obs.linhas, continuacao: 0 },
    { linhas: Math.max(0, obs.linhas - 1), continuacao: 0 },
  ].filter(
    (t, i, l) =>
      (t.linhas || t.continuacao) && l.findIndex((x) => x.linhas === t.linhas && x.continuacao === t.continuacao) === i,
  )
  for (const t of tentativas) {
    // Com a continuação das observações, as opiniões vêm logo depois dela, na mesma página: sem outro título
    const continuacoes = t.continuacao ? extras.continuacoes.filter((id) => id !== ID_OPINIOES) : extras.continuacoes
    const e: Extras = { ...extras, ...t, continuacoes }
    const r = await medir(d, e)
    if (r.paginas === m.paginas && continuacoesExatas(r) && r.faltando.length <= m.faltando.length) return r
  }
  return m
}

/** Nome do arquivo: "Folha-de-campo-FC-2026-00042.pdf". */
export const nomeArquivoFolhaCampo = (numero: string) =>
  `Folha-de-campo-${(numero || 'em-branco').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '')}.pdf`

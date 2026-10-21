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
// Convenção visual: fundo cinza = veio do sistema (previsto), para conferir e, se preciso, corrigir na
// linha "confere ou escreva o certo" logo abaixo; caixa branca = escrever no local; caixas de marcar
// sempre brancas (marca-se com X o que foi feito), com a opção prevista no sistema em negrito e a
// etiqueta PREVISTO. Com balança (e, de preferência, rascunho), a folha sai pré-preenchida pelo plano
// (shared/folhaCampo.ts); sem balança, sai "em branco", para uma balança ainda não cadastrada.
// Toda página leva o nº da folha (com QR), a OS, o cliente e a balança, e a rubrica e a data: uma folha
// solta ou digitalizada sozinha continua identificável. Determinística como o certificado.
//
// Paginação medida (`montar`): a parte de um passo que passa para a página seguinte repete o título do
// passo com "(continuação)"; os pontos e as etapas de substituição, preenchidos intercalados, ficam na
// mesma página; as observações crescem no espaço que sobra na página delas.

import { createRequire } from 'node:module'
import {
  AJUSTES,
  capacidadeTexto,
  converterMassa,
  CRITERIOS_EMA,
  divisaoLegivel,
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
  colunasMarca,
  dataHoraBrasilia,
  fundoTimbrado,
  inteiro,
  MODULO,
  type No,
  type NoObjeto,
  pdfmake,
  TOPO_CABECALHO,
} from './base.ts'
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
 * Altura mínima do conteúdo das linhas de leitura e das caixas de escrever; com o padding, a linha
 * de leitura fica com ≈ 7,2 mm e a caixa de escrever, com ≈ 7,6 mm (7 mm no mínimo para a escrita à
 * mão em prancheta).
 */
const ALTURA_LEITURA = 17.5
const ALTURA_ESCRITA = 19
/** Valor que veio do sistema: rótulo e uma linha de valor (a correção vai na linha de baixo). */
const ALTURA_PREVISTO = 17
/** Lado das caixas de marcar (≈ 3,9 mm). */
const LADO_CAIXA = 11
/**
 * Linha de correção embaixo de um valor previsto: a legenda "□ confere ou escreva o certo" numa linha
 * miúda no alto (≈ 8 pt) e, embaixo dela, ≈ 7,2 mm livres na largura toda da célula para a escrita à mão
 * (com o padding, a linha tem ≈ 11 mm).
 */
const ALTURA_CORRIGIR = 27.5

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
 * não reserva a margem lateral das células de largura automática e o rótulo quebraria.
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
        paddingLeft: (i: number) => (i % 2 ? 3.5 : 0),
        paddingRight: () => 0,
        paddingTop: (i: number) => (i ? 2.2 : 0),
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
      paddingLeft: (i: number) => (i % 2 ? 3.5 : 0),
      paddingRight: (i: number) => (i % 2 && i < lista.length * 2 - 1 ? espaco : 0),
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  }
}

/** Rótulo pequeno em versal (dentro das caixas, no canto superior esquerdo). */
const rotulo = (texto: string, extra: NoObjeto = {}): NoObjeto => ({
  text: texto.toUpperCase(),
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

/** Valor que veio do sistema (fundo cinza), com "□ confere" opcional à direita do rótulo. */
function previsto(titulo: string, valor: No, o: { confere?: boolean; span?: number } = {}): Celula {
  const cabeca: No = o.confere
    ? {
        table: {
          widths: ['*', 8.5, 'auto'],
          body: [
            [
              rotulo(titulo),
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 8.5, h: 8.5, lineWidth: 0.7, lineColor: '#333333', color: '#FFFFFF' }] },
              { text: 'confere', fontSize: 6.1, color: T.rotulo, margin: [0, 0.6, 0, 0] },
            ],
          ],
        },
        layout: {
          defaultBorder: false,
          paddingLeft: (i: number) => (i === 2 ? 2.5 : 0),
          paddingRight: (i: number) => (i === 0 ? 4 : 0),
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

/** Caixa branca de escrever, com o rótulo no canto e, opcionalmente, um modelo do formato embaixo (__/__/____). */
function escrever(titulo: string, o: { span?: number; altura?: number; dica?: string; formato?: string } = {}): Celula {
  const altura = o.altura ?? 22
  return {
    no: {
      stack: [
        rotulo(titulo),
        ...(o.dica ? [{ text: o.dica, fontSize: 6.1, color: T.suave, margin: [0, 0.8, 0, 0] }] : []),
        ...(o.formato
          ? [
              {
                text: o.formato,
                fontSize: 7.4,
                color: T.suave,
                alignment: 'right',
                margin: [0, altura - 19 - (o.dica ? 8 : 0), 0, 0],
              },
            ]
          : []),
      ],
      fillColor: '#FFFFFF',
    },
    altura,
    span: o.span ?? 1,
  }
}

/** Caixa branca de escrever com uma caixa de marcar no alto, à direita do rótulo ("□ o mesmo do local"). */
function escreverComCaixa(titulo: string, opcao: string, o: { span?: number; altura?: number } = {}): Celula {
  return {
    no: {
      table: {
        widths: ['auto', '*', 8.5, 'auto'],
        body: [
          [
            rotulo(titulo),
            { text: '' },
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 8.5, h: 8.5, lineWidth: 0.7, lineColor: '#333333', color: '#FFFFFF' }] },
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
      fillColor: '#FFFFFF',
    },
    altura: o.altura ?? 22,
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
 * Conferência logo abaixo de um valor previsto: "□ confere ou escreva o certo" numa legenda miúda no
 * alto e, se estiver diferente, o valor certo escrito embaixo dela, na largura toda da célula e com
 * ≈ 7,2 mm de altura livre (um nº de série, um modelo, uma portaria ou uma data cabem à mão).
 */
function corrigir(span = 1, altura = ALTURA_CORRIGIR): Celula {
  const lado = 8
  return {
    no: {
      table: {
        widths: [lado, 'auto', 'auto'],
        body: [
          [
            { canvas: [{ type: 'rect', x: 0, y: 0, w: lado, h: lado, lineWidth: 0.6, lineColor: '#333333', color: '#FFFFFF' }] },
            { text: 'confere', fontSize: 5.8, color: T.rotulo, lineHeight: 1, margin: [0, 1, 0, 0] },
            { text: 'ou escreva o certo:', fontSize: 5.2, color: '#7A7A7A', lineHeight: 1, margin: [0, 1.4, 0, 0] },
          ],
        ],
      },
      layout: {
        defaultBorder: false,
        paddingLeft: (i: number) => (i === 1 ? 2.2 : i === 2 ? 3.5 : 0),
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      fillColor: '#FFFFFF',
    },
    altura,
    span,
  }
}

const LAYOUT_GRADE: NoObjeto = {
  hLineWidth: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? 0.8 : 0.5),
  vLineWidth: (i: number, no: { table: { widths: unknown[] } }) => (i === 0 || i === no.table.widths.length ? 0.8 : 0.5),
  hLineColor: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? T.borda : T.linha),
  vLineColor: (i: number, no: { table: { widths: unknown[] } }) => (i === 0 || i === no.table.widths.length ? T.borda : T.linha),
  paddingLeft: () => 4.5,
  paddingRight: () => 4.5,
  paddingTop: () => 2.8,
  paddingBottom: () => 2.5,
}

/** Grade de campos (linhas de células), em colunas iguais ou com as larguras dadas. */
function grade(linhas: Celula[][], larguras: number | Array<number | string> = 4, margem: number[] = [0, 0, 0, 0]): NoObjeto {
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
    layout: LAYOUT_GRADE,
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
type CelulaTabela = { tipo: 'previsto' | 'escrever' | 'numero' | 'dica'; no?: No; alinhamento?: Alinhamento }

const pre = (no: No, alinhamento?: Alinhamento): CelulaTabela => ({ tipo: 'previsto', no, alinhamento })
const livre = (): CelulaTabela => ({ tipo: 'escrever' })
const nro = (n: No): CelulaTabela => ({ tipo: 'numero', no: n })
/** Caixa de escrever com o previsto em letra miúda no canto ("previsto: TH-01"). */
const dica = (n: No): CelulaTabela => ({ tipo: 'dica', no: n })

/** Tabela de leituras: unidade no cabeçalho, linhas altas, previsto em cinza e escrita em branco. */
function tabelaLeituras(colunas: Coluna[], linhas: CelulaTabela[][], o: { altura?: number; margem?: number[] } = {}): NoObjeto {
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
  const corpo = linhas.map((l) =>
    l.map((cel, i) => {
      const alinhamento = cel.alinhamento ?? colunas[i].alinhamento ?? 'left'
      if (cel.tipo === 'escrever') return { text: '', fillColor: '#FFFFFF' }
      if (cel.tipo === 'dica') return { text: cel.no ?? '', fontSize: 6.2, lineHeight: 1.1, color: T.suave, fillColor: '#FFFFFF' }
      if (cel.tipo === 'numero')
        return {
          text: cel.no ?? '',
          font: 'InterMedio',
          fontSize: 7.4,
          color: T.rotulo,
          alignment: 'center',
          verticalAlignment: 'middle',
          fillColor: '#FFFFFF',
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
    }),
  )
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
  const cabeca = inteiro([tituloPasso(n, titulo, sistema), ...(texto ? [instrucao(texto)] : []), ...primeira])
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
  /** Data prevista da calibração (ISO): a do rascunho ou, sem ela, a da impressão (em Brasília). */
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
   * Linhas da "Observações (continuação)" no alto da página seguinte, logo depois das observações e antes
   * das opiniões (0 = sem continuação).
   */
  continuacao: number
}

const SEM_EXTRAS: Extras = { continuacoes: [], linhas: 0, continuacao: 0 }

/** Data ISO (AAAA-MM-DD) de um instante, no horário de Brasília. */
function dataIsoBrasilia(iso: string): string {
  const b = dataHoraBrasilia(iso)
  return b ? b.data.split('/').reverse().join('-') : iso.slice(0, 10)
}

function contexto(d: DadosFolhaCampo, extras: Extras = SEM_EXTRAS): Contexto {
  const data = d.calibracao?.dataCalibracao || dataIsoBrasilia(d.impressoEm)
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

/** Rodoviária ou ferroviária (cadastrada): a folha leva a substituição mesmo sem ela no plano, como a tela. */
const ehRodoviaria = (b: Balanca | null) =>
  !!b && (b.receptor === 'RODOVIARIA' || b.tipo === 'RODOVIARIA' || b.tipo === 'FERROVIARIA')

/**
 * A folha leva as substituições (coluna nos pontos e a tabela das etapas): em branco (pode ser uma
 * rodoviária), com a substituição no plano ou numa rodoviária (a mesma condição da tela do assistente).
 */
const comSubstituicao = (ctx: Contexto) => !ctx.plano || ctx.plano.substituicao.ativa || ehRodoviaria(ctx.b)

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
 * (a folha segue a ordem do serviço no local; o escritório digita na ordem do sistema).
 */
export const ROTEIRO_DIGITACAO: Array<{ etapa: string; passos: string }> = [
  { etapa: E.cliente, passos: `${N.chegada} e ${N.assinaturas}` },
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
        'um risco só sobre o valor errado (continua legível), o certo ao lado, rubrica e data. Duvidosa: repita e anote as duas. Grampeie as folhas.',
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

function passoPadroes(ctx: Contexto, n: number): No[] {
  const { d, plano } = ctx
  // Sem plano (em branco ou só do cliente), a validade é conferida do mesmo jeito, na data da visita ou da impressão
  const semPlano = plano ? null : validadeDosPadroes(padroesPrevistos(ctx.k, d.padroes), ctx.data)
  const previstos = plano?.padroes ?? semPlano!.itens.map((x) => ({ ...x, separar: '' }))
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
    pre(plano ? semQuebra(separar) || (p.tipo === 'PESOS' ? '—' : 'levar') : '', 'left'),
    pre({ text: p.certificado || '—', fontSize: 7.4 }),
    pre(validade(p, situacao), 'right'),
  ])
  linhas.push([livre(), livre(), livre(), livre(), livre(), livre(), livre()])
  const tabela = tabelaLeituras(
    [
      { titulo: 'Levado', largura: 26, alinhamento: 'center' },
      { titulo: 'Usado', largura: 24, alinhamento: 'center' },
      { titulo: 'Identificação', largura: 70 },
      { titulo: 'Descrição', largura: '*' },
      { titulo: plano ? 'Separar (peças previstas)' : 'Peças usadas', largura: 90 },
      { titulo: 'Certificado nº', largura: 72 },
      { titulo: 'Próxima calibração', largura: 64, alinhamento: 'right' },
    ],
    linhas,
    { altura: 15 },
  )
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
  return passo(ctx, n, 'Antes de sair: padrões', E.padroes, texto, [tabela, ...aviso])
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
  const dados: Celula[] = [
    os ? previsto('Nº da ordem de serviço', os) : escrever('Nº da ordem de serviço'),
    tecnico ? previsto(`Técnico que executou${OBRIG}`, tecnico) : escrever(`Técnico que executou${OBRIG}`),
    escrever(`Data da calibração${OBRIG}`, { formato: '____/____/________', dica: prevista ? `prevista: ${prevista}` : '' }),
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
        previsto(pj ? 'Razão social' : 'Nome', { text: nome || '—', bold: true }, { span: 2 }),
        // O contato (nome, função e telefone) na coluna larga; o CNPJ cabe na estreita
        previsto('Contato no cliente', contato || '—'),
        previsto(pj ? 'CNPJ' : 'CPF', c.documento || '—'),
      ],
      [
        endereco
          ? previsto(`Endereço da calibração${OBRIG}`, endereco, { span: 3 })
          : escrever(`Endereço da calibração${OBRIG}`, { span: 3 }),
        { ...ondeFoi, linhas: endereco ? 2 : 1 },
      ],
      ...(endereco ? [[corrigir(3)]] : []),
      dados,
    ]
  } else {
    linhas = [
      ...recado,
      [escrever('Razão social / Nome', { span: 3 }), escrever('CNPJ / CPF')],
      [escrever(`Endereço da calibração${OBRIG} (rua, nº, bairro, cidade/UF, CEP)`, { span: 3 }), ondeFoi],
      // O certificado traz também o endereço do cadastro do cliente (sede, pessoa física sem CNPJ…)
      [escreverComCaixa('Endereço do cliente (sai no certificado)', 'o mesmo do local da calibração', { span: 4 })],
      [escrever('Contato e telefone', { span: 2 }), escrever('E-mail para o certificado', { span: 2 })],
      dados,
    ]
  }
  const texto = c
    ? 'Confira o cliente e o endereço onde a balança está (filial, obra…). Anote a data e a hora de início.'
    : 'Preencha o cliente como deve sair no certificado. Anote a data e a hora de início.'
  return passo(ctx, n, 'Chegada ao cliente', E.cliente, texto, [grade(linhas, ['*', '*', '*', 124])])
}

// ---- 3. Identificação da balança -----------------------------------------------------------------------------

/**
 * Como a balança foi encontrada, antes de mexer nela (passo da verificação): selos, marca de verificação
 * do Inmetro/IPEM e as fotos da plaqueta e do mostrador (evidência do que foi conferido). Balança de uso
 * comercial ou na saúde: a nota de que a calibração não substitui a verificação legal.
 */
function selos(b: Balanca | null): NoObjeto {
  const legal = !b || b.finalidade === 'COMERCIAL' || b.finalidade === 'SAUDE'
  const avisoLegal = !!b && legal
  return {
    stack: [
      grade(
        [
          [
            marcar('Selos / lacres encontrados', [{ rotulo: 'intactos' }, { rotulo: 'violados' }, { rotulo: 'sem selo' }], {
              tamanho: 7.4,
              espaco: 8,
            }),
            escrever(legal ? 'Marca de verificação Inmetro/IPEM: ano' : 'Marca Inmetro/IPEM (se houver): ano', { altura: 25 }),
            marcar('Fotos tiradas', [{ rotulo: 'plaqueta' }, { rotulo: 'mostrador' }], { tamanho: 7.4, espaco: 8 }),
          ],
        ],
        ['*', '*', 150],
      ),
      ...(avisoLegal
        ? [
            nota(
              `Balança de uso ${b!.finalidade === 'COMERCIAL' ? 'comercial (venda por peso)' : 'na saúde'}: a calibração não substitui a verificação do Inmetro/IPEM. Selos violados ou marca vencida: anote nas observações.`,
            ),
          ]
        : []),
    ],
    margin: [0, 5, 0, 0],
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
      ['Plataforma (fabricante, modelo, nº de série)', plataforma || '—'],
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
    ls.flatMap((linha) => [linha.map(([r, v]) => previsto(r, v)), linha.map(() => corrigir())])
  return passo(
    ctx,
    n,
    'Identificação da balança',
    E.balanca,
    [
      'Confira cada dado com a plaqueta do ',
      { text: 'indicador', bold: true },
      ' (o mostrador). Diferente? Escreva o certo embaixo e avise o cliente.',
    ],
    // A identificação fica com o título; as características metrológicas podem ir para a página seguinte
    [grade(celulas(linhas.slice(0, 2)), 4)],
    [grade(celulas(linhas.slice(2)), 4, [0, 3, 0, 0])],
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
    [grade(linhas, 4)],
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

function instrumentosAmbiente(ctx: Contexto): Padrao[] {
  return (ctx.plano ? ctx.plano.padroes.map((p) => p.padrao) : padroesPrevistos(ctx.k, ctx.d.padroes)).filter(
    (p) => p.tipo === 'TERMOHIGROMETRO' || p.tipo === 'BAROMETRO',
  )
}

function tabelaAmbiente(ctx: Contexto, momento: 'Início' | 'Fim'): No[] {
  const instrumentos = instrumentosAmbiente(ctx)
  const previstos = instrumentos.map((p) => p.identificacao).join(', ')
  return [
    tabelaLeituras(
      [
        { titulo: 'Momento', largura: 52 },
        { titulo: 'Hora', unidade: 'hh:mm', largura: 70 },
        { titulo: `Temperatura${OBRIG}`, unidade: '°C', largura: '*' },
        { titulo: 'Umidade relativa', unidade: '%', largura: '*' },
        { titulo: 'Pressão (opcional)', unidade: 'hPa', largura: '*' },
        { titulo: 'Instrumento usado', largura: 128 },
      ],
      [[nro(momento), livre(), livre(), livre(), livre(), previstos ? dica(`previsto: ${previstos}`) : livre()]],
    ),
  ]
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
    table: { widths: [12, '*', 'auto'], body: linhas, heights: 12 },
    layout: {
      hLineWidth: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? 0.8 : 0.4),
      hLineColor: (i: number, no: { table: { body: unknown[] } }) =>
        i === 0 || i === no.table.body.length ? T.borda : T.linhaClara,
      vLineWidth: () => 0,
      paddingLeft: (i: number) => (i === 0 ? 2 : 4),
      paddingRight: () => 2,
      paddingTop: () => 2.2,
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
        escrever('Pesos no local há (min)', { dica: 'aclimatação' }),
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
    [84, 96, '*', '*'],
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
    [lista, selos(b), condicoes],
    [
      {
        stack: [
          subtitulo('Ambiente no início — perto da balança, depois de uns 15 min no local', [0, 5, 0, 2.5]),
          ...tabelaAmbiente(ctx, 'Início'),
        ],
      },
    ],
  )
}

// ---- 5. Erro de indicação: "como encontrado" e "depois do ajuste" nas mesmas linhas ----------------------

const INSTRUCAO_METODO: Record<MetodoCarregamento, string> = {
  CRESCENTE_DECRESCENTE: 'suba até a maior carga (↑) e desça sem descarregar (↓)',
  DESCONTINUO: 'retire tudo e confira o zero entre uma carga e outra',
  CONTINUO: 'vá somando os pesos, sem descarregar',
  DECRESCENTE: 'comece pela maior carga e vá retirando (↓)',
}

const ORDEM_METODOS: MetodoCarregamento[] = ['CRESCENTE_DECRESCENTE', 'DESCONTINUO', 'CONTINUO', 'DECRESCENTE']

/**
 * "Como as cargas foram aplicadas" e, à direita, a hora do início do ensaio: ficam com o título do passo
 * (sozinha no alto de uma página, a hora pareceria a da chegada).
 */
function opcoesMetodo(previsto: MetodoCarregamento | null): No[] {
  return [
    {
      columns: [
        {
          width: '*',
          stack: [
            rotulo('Como as cargas foram aplicadas', { margin: [0, 2.5, 0, 2.5] }),
            opcoes(
              ORDEM_METODOS.map((m) => ({ rotulo: METODOS_CARREGAMENTO[m].label, prevista: m === previsto })),
              { tamanho: 7.5, espaco: 11 },
            ),
          ],
        },
        { width: 84, ...grade([[escrever('Hora do início', { formato: '____:____', altura: 20 })]], 1) },
      ],
      columnGap: 8,
      margin: [0, 0, 0, 5],
    },
  ]
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
  const qtd = (v: number) => `${num(v, casasDecimais(v))} ${ctx.u}`
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

const GRUPO_ANTES = 'Como encontrado'
const GRUPO_DEPOIS = 'Depois do ajuste · só se ajustou'

/** Linhas da tabela de pontos na folha em branco: o zero e mais 11 (multi-intervalo: 9 a 10 pontos e reserva). */
const LINHAS_PONTOS_EM_BRANCO = 12

/**
 * Tabela dos pontos de carga (pré-preenchida pelo plano, ou em branco): as leituras "como encontrado"
 * e "depois do ajuste" lado a lado, nas mesmas linhas (mesmas cargas), e linhas de reserva.
 */
function tabelaPontos(ctx: Contexto, reserva: number): NoObjeto {
  const { b, plano } = ctx
  const u = unidadeColuna(ctx)
  const { sobe, desce } = colunasIndicacao(plano ? plano.metodo : null)
  const multi = !!b && b.faixas.length > 1
  const comEma = !!plano?.pontos.some((p) => p.ema !== null)
  // Em branco (pode ser rodoviária) e em rodoviária, a coluna das substituições vai sempre: sem a
  // substituição no plano, sai para escrever
  const comSub = comSubstituicao(ctx)
  const subPrevista = !!plano?.substituicao.ativa
  // A coluna que o método previsto não usa sai estreita (o método pode mudar no local)
  // Cada grupo com pelo menos 120 pt: o título "depois do ajuste · só se ajustou" numa linha só
  const larga = sobe && desce ? 60 : 72
  const estreita = 48
  const colunasGrupo = (grupo: string): Coluna[] => [
    { titulo: 'Indicação ↑', unidade: u, largura: sobe ? larga : estreita, grupo, ...(sobe ? {} : { nota: 'só se subir' }) },
    { titulo: 'Indicação ↓', unidade: u, largura: desce ? larga : estreita, grupo, ...(desce ? {} : { nota: 'só se descer' }) },
  ]
  const colunas: Coluna[] = [
    { titulo: 'Nº', largura: 15, alinhamento: 'center' },
    { titulo: 'Carga', unidade: u, largura: 50, alinhamento: 'right' },
    ...(comSub
      ? [{ titulo: 'Substi-\ntuições', largura: 34, alinhamento: 'center' as const, ...(plano ? {} : { nota: 'rodoviária' }) }]
      : []),
    { titulo: comSub ? 'Pesos padrão por cima' : 'Pesos padrão', largura: '*' },
    ...colunasGrupo(GRUPO_ANTES),
    ...colunasGrupo(GRUPO_DEPOIS),
    ...(comEma ? [{ titulo: 'Faixa aceitável', unidade: u, largura: 64, alinhamento: 'right' as const }] : []),
  ]
  const leituras = (): CelulaTabela[] => [livre(), livre()]
  const linhas: CelulaTabela[][] = []
  for (const [i, p] of (plano?.pontos ?? []).entries()) {
    const zero = !(p.carga > 0)
    const pesos: No = zero ? { text: 'sem carga (zero)', color: T.suave, fontSize: 7.2 } : pesosDaCarga(ctx, p)
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
  return tabelaLeituras(colunas, linhas)
}

/**
 * Retorno ao zero (antes e depois do ajuste) e, com o plano, a troca de peças em relação ao previsto (um
 * 10 kg de outro jogo…), que muda as peças do ponto, e com elas a massa de referência e a incerteza.
 * Numa linha só. Na folha em branco, os pesos de cada ponto já são escritos na tabela.
 */
function retornoZero(ctx: Contexto): NoObjeto {
  const u = ctx.u ? ` (${ctx.u})` : ''
  if (!ctx.plano)
    return grade(
      [[escrever(`Indicação no retorno ao zero${u}`), escrever(`Retorno ao zero depois do ajuste${u}`)]],
      2,
      [0, 4, 0, 0],
    )
  const altura = 34
  return grade(
    [
      [
        escrever(`Indicação no retorno ao zero${u}`, { altura }),
        escrever(`Retorno ao zero depois do ajuste${u}`, { altura }),
        escrever('Pesos diferentes do previsto', {
          altura,
          dica: 'nº da linha e os pesos usados de fato (ex.: “linha 5: 7 × 20 kg + 10 kg do JP-02”)',
        }),
      ],
    ],
    [116, 116, '*'],
    [0, 4, 0, 0],
  )
}

/** O que a coluna "faixa aceitável" quer dizer: o critério e que ela é só para decidir o ajuste. */
function notaEma(ctx: Contexto): No[] {
  const f = ctx.plano?.faixaAceitavel
  if (!f || !ctx.plano?.pontos.some((p) => p.ema !== null)) return []
  const criterio = `${CRITERIOS_EMA[f.criterio].label}${f.criterio === 'CLIENTE' ? `, ±${numeroBr(f.toleranciaCliente)} ${ctx.u}` : ''}`
  return [
    nota([
      { text: 'Faixa aceitável: ', bold: true },
      f.daConformidade
        ? `carga ± EMA (${criterio}), só para decidir o ajuste; a conformidade do certificado considera também a incerteza.`
        : `carga ± EMA (${criterio}, classe ${ctx.b?.classe}), só para decidir o ajuste no local: o cliente não pediu declaração de conformidade.`,
    ]),
  ]
}

/** Pontos a partir dos quais a tabela não cabe numa página com o título (vai sozinha, podendo se dividir). */
const LINHAS_TABELA_INTEIRA = 22

function passoIndicacao(ctx: Contexto, n: number, passoAjuste: number): No[] {
  const { plano } = ctx
  const primeiro: No[] = [{ text: 'Sem ajustar, anote só ' }, { text: '“como encontrado”', bold: true }, { text: '.' }]
  const texto: No = plano
    ? [
        'Zere vazia, aplique as cargas na ordem da tabela e anote a indicação estável. ',
        { text: `Método previsto: ${METODOS_CARREGAMENTO[plano.metodo].label.toLowerCase()}`, bold: true },
        ` — ${INSTRUCAO_METODO[plano.metodo]}. `,
        ...primeiro,
      ]
    : [
        'Cargas: ',
        { text: '0, 25, 50, 75 e 100 % de Max', bold: true },
        ' e onde muda o EMA (500e e 2000e na classe III), até pelo menos 90 % de Max. Zere, aplique e anote a indicação estável. ',
        ...primeiro,
      ]
  const comSub = comSubstituicao(ctx)
  const digitar = nota(
    [
      { text: 'Na digitação: ', bold: true, color: T.texto },
      `sem ajuste, “como encontrado” vai na etapa ${E.indicacao}; com ajuste (passo ${passoAjuste}), nas abas “Antes do ajuste” e “Depois do ajuste”${comSub ? ', cada uma com as suas etapas de substituição' : ''}.`,
    ],
    [0, 3, 0, 0],
  )
  // Linhas de reserva (ponto a mais, carga diferente): duas, ou uma quando a tabela já é longa
  const reserva = (plano?.pontos.length ?? 0) >= 7 ? 1 : 2
  const tabela = tabelaPontos(ctx, reserva)
  const linhasTabela = plano ? plano.pontos.length + reserva : LINHAS_PONTOS_EM_BRANCO
  // Pontos e etapas de substituição na mesma página: são preenchidos intercalados (ponto 3, etapa 1, ponto 4…).
  // Na folha em branco (só em rodoviária), as etapas podem ir para a página seguinte.
  const substituicaoJunto = comSub && !!plano
  if (linhasTabela > LINHAS_TABELA_INTEIRA)
    // Tabela longa demais para uma página: vai sozinha e se divide (o cabeçalho dela se repete)
    return passo(ctx, n, 'Erro de indicação', E.indicacao, texto, opcoesMetodo(plano?.metodo ?? null), [
      { parte: { stack: [tabela, ...notaEma(ctx)] }, id: idParte(n, 1), partivel: true },
      ...(comSub ? [tabelaSubstituicao(ctx)] : []),
      { stack: [retornoZero(ctx), digitar] },
    ])
  return passo(
    ctx,
    n,
    'Erro de indicação',
    E.indicacao,
    texto,
    [
      ...opcoesMetodo(plano?.metodo ?? null),
      tabela,
      ...notaEma(ctx),
      // Em branco, o EMA por classe para decidir o ajuste (com balança, a coluna "faixa aceitável")
      ...(plano ? [] : [tabelaEmaPorClasse()]),
      ...(substituicaoJunto ? [tabelaSubstituicao(ctx)] : []),
    ],
    [...(comSub && !substituicaoJunto ? [tabelaSubstituicao(ctx)] : []), { stack: [retornoZero(ctx), digitar] }],
  )
}

/** Etapas de substituição para escrever (folha em branco ou rodoviária sem a substituição no plano). */
const ETAPAS_SUBSTITUICAO_EM_BRANCO = 4

/**
 * Etapas das cargas de substituição (rodoviárias), "como encontrado" e "depois do ajuste" lado a lado,
 * como na tabela dos pontos: no sistema, cada aba do erro de indicação tem as suas etapas. Sem a
 * substituição no plano (em branco ou rodoviária que ainda não a usou), sai com poucas linhas e a carga de
 * cada etapa para escrever.
 */
function tabelaSubstituicao(ctx: Contexto): No {
  const { plano, u } = ctx
  const uc = unidadeColuna(ctx)
  const s = plano?.substituicao.ativa ? plano.substituicao : null
  const previstas = s ? s.etapas : 0
  const total = s ? s.etapas + 1 : ETAPAS_SUBSTITUICAO_EM_BRANCO
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
          ? `Cargas de substituição — ${numeroBr(s.carga)} ${u} de pesos padrão em cada etapa (${semQuebra(s.pesos) || '—'})`
          : plano
            ? 'Cargas de substituição — quando os pesos levados não chegam às cargas dos pontos'
            : 'Cargas de substituição — só em rodoviária, quando os pesos levados não chegam às cargas dos pontos',
        [0, 8, 0, 2],
      ),
      nota(
        [
          'Em cada etapa: com os pesos padrão na plataforma, anote a indicação; troque os pesos pela carga de substituição (caminhão, lastro) até a mesma indicação e anote de novo. Na tabela acima, a coluna “substituições” diz quantas etapas ficam por baixo dos pesos de cada ponto. ',
          { text: 'Ajustou?', bold: true },
          ' Refaça as etapas e anote nas colunas “depois do ajuste”.',
        ],
        [0, 0, 0, 4],
      ),
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
        escrever('Hora do ajuste', { formato: '____:____', altura: 25 }),
      ],
      [escrever(`Como foi o ajuste${OBRIG} (no externo: o peso usado e a identificação dele)`, { span: 4 })],
      [
        marcar('Reparo ou manutenção', [{ rotulo: 'não houve' }, { rotulo: 'houve (OS obrigatória)', prevista: !!r?.houve }]),
        r?.houve && !vazio(r.descricao)
          ? previsto('Serviço realizado', r.descricao, { confere: true, span: 3 })
          : escrever('Serviço realizado', { span: 3, altura: 25 }),
      ],
      [escrever('Marca de reparo nº'), escrever('Selos retirados'), escrever('Selos colocados', { span: 2 })],
    ],
    [190, '*', '*', 100],
  )
  // Critério para decidir o ajuste: a coluna "faixa aceitável" dos pontos; na folha em branco, a tabela do
  // EMA por classe; sem classe nem conformidade pedida, só o pedido do cliente
  const comFaixa = !!ctx.plano?.pontos.some((p) => p.ema !== null)
  const quando: No[] = comFaixa
    ? [
        { text: 'Erro fora da faixa aceitável', bold: true },
        ` (última coluna do passo ${indicacao}) ou a pedido do cliente: ajuste e `,
      ]
    : ctx.plano
      ? ['A pedido do cliente (balança sem classe: não há EMA para comparar): ajuste e ']
      : [
          { text: 'Erro fora do EMA da classe', bold: true },
          ` (tabela embaixo dos pontos, no passo ${indicacao}) ou a pedido do cliente: ajuste e `,
        ]
  return passo(
    ctx,
    n,
    'Ajuste e reparo',
    E.balanca,
    [...quando, { text: `refaça as cargas do passo ${indicacao} nas colunas “depois do ajuste”`, bold: true }, '.'],
    [grid],
  )
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
                text: `EMA ${CRITERIOS_EMA[CRITERIO_AJUSTE].label.replace(/^Portaria Inmetro 157\/2022 — /, '')} · Portaria Inmetro 157/2022`,
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

function blocoRepetibilidade(ctx: Contexto, r: PlanoFolha['repetibilidade'][number] | null, titulo: string): No[] {
  const { u } = ctx
  const uc = unidadeColuna(ctx)
  const n = r ? r.leituras : 5
  const minimo = r ? r.minimo : 5
  // Três blocos lado a lado. Carga de 100 kg ou mais (mínimo 3): 6 linhas bastam; nas menores, 9 (com 10
  // leituras, k = 2: a que não couber vai nas observações)
  const total = Math.max(minimo === 3 ? 6 : 9, Math.ceil(n / 3) * 3)
  const sobra = total < 10 ? '; as que não couberem, nas observações' : ''
  const terco = total / 3
  const linhasDe = (de: number, ate: number): CelulaTabela[][] =>
    Array.from({ length: ate - de }, (_, i) => [nro(String(de + i + 1)), livre(), livre()])
  const colunas: Coluna[] = [
    { titulo: 'Nº', largura: 16, alinhamento: 'center' },
    { titulo: 'Indicação com a carga', unidade: uc, largura: '*' },
    { titulo: 'Zero após retirar', unidade: uc, largura: '*' },
  ]
  const comCarga = !!r && r.carga > 0
  const cabeca = grade(
    [
      [
        comCarga
          ? previsto(`Carga aplicada (${u})`, { text: cargaNaDivisao(ctx, r!.carga), bold: true })
          : escrever(`Carga aplicada${u ? ` (${u})` : ''}`, { dica: 'cerca de Max/2' }),
        comCarga
          ? previsto('Pesos previstos (não precisa ser padrão: uma peça só é o ideal)', pesosDaCarga(ctx, r!, 8.7), { span: 2 })
          : escrever('Pesos ou carga usada', { span: 2 }),
        escrever('Hora', { formato: '____:____' }),
      ],
      ...(comCarga ? [[corrigir(1), escrever('Se usou outra carga, descreva', { span: 3, altura: 16 })]] : []),
    ],
    [118, '*', '*', 70],
  )
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
        ? `Faça as ${n} leituras previstas (mínimo ${minimo}${minimo === 3 ? ', por ser carga de 100 kg ou mais' : ''}). ${total > n ? (total === n + 1 ? `Linha ${total}: opcional; ` : `Linhas ${n + 1} a ${total}: opcionais; `) : ''}mais leituras deixam a incerteza menor (com 10, k = 2${sobra}).`
        : `Mínimo de 5 leituras (3 se a carga for de 100 kg ou mais); com 10, a incerteza sai com k = 2${sobra}.`,
    ),
  ]
}

function passoRepetibilidade(ctx: Contexto, n: number): No[] {
  const { plano, u } = ctx
  const lista = plano?.repetibilidade ?? []
  const primeiro = lista[0]
  const texto: No = primeiro
    ? [
        `Zere. Coloque ${numeroBr(primeiro.carga)} ${u} no centro ${centro(ctx.b)}, anote a indicação estável, retire e anote o zero. `,
        { text: `Repita ${primeiro.leituras} vezes`, bold: true },
        ', do mesmo jeito.',
      ]
    : [
        'Zere. Coloque uma carga de ',
        { text: 'cerca de metade de Max', bold: true },
        ' no centro, anote a indicação, retire e anote o zero. Repita 5 vezes (3 se a carga for de 100 kg ou mais).',
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
            marcar('Ensaio realizado', [{ rotulo: 'não', prevista: true }, { rotulo: 'sim: descreva nas observações' }]),
          ],
        ],
        ['*', 190],
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
  const cabeca = grade(
    [
      [
        comCarga
          ? previsto(`Carga usada (${u})`, { text: cargaNaDivisao(ctx, ecc!.carga), bold: true })
          : escrever(`Carga usada${u ? ` (${u})` : ''}`, { dica: 'Max/3 até 500 kg · Max/5 até 3 t · Max/10 acima' }),
        comCarga
          ? previsto('Pesos previstos', pesosDaCarga(ctx, ecc!, 8.7), { span: 2 })
          : escrever('Pesos ou carga usada', { span: 2 }),
        escrever('Hora', { formato: '____:____' }),
      ],
      ...(comCarga ? [[corrigir(1), escrever('Se usou outra carga, descreva', { span: 3, altura: 16 })]] : []),
    ],
    [118, '*', '*', 70],
  )
  const texto: No = [
    `Zere vazia e coloque ${comCarga ? `${numeroBr(ecc!.carga)} ${u}` : 'a carga'} em cada posição, `,
    { text: 'na ordem do desenho', bold: true },
    ' (nº do desenho = nº da linha). Frente = lado do indicador.',
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
                  'Escreva a posição de cada linha (ex.: centro, frente esquerda). Prato retangular ou redondo: na ordem dos desenhos. Mais de 4 apoios ou tanque: uma posição por apoio (apoio 1, 2…). Rodoviária: início, meio e fim, na ida e na volta.',
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
 * Linhas de observação sempre impressas; com espaço sobrando no fim da página delas, ganham até mais 10
 * (e, quando as opiniões passaram para a página seguinte, uma continuação de até 8 linhas no alto dela,
 * logo depois das observações).
 */
const LINHAS_OBSERVACOES = 3
const MAX_LINHAS_EXTRAS = 10
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

function passoEncerramento(ctx: Contexto, n: number): No[] {
  const { k, u } = ctx
  const c = k?.conformidade
  const pediu = !!c?.solicitada
  // Declaração de conformidade com os mesmos campos da tela (Conclusão): o cliente pediu? limite,
  // tolerância do cliente e regra de decisão. O que veio do sistema ganha "confere ou escreva o certo".
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
              {
                span: c.criterio === 'CLIENTE' ? 1 : 2,
              },
            ),
            ...(c.criterio === 'CLIENTE' ? [previsto('Tolerância do cliente (±)', `${numeroBr(c.toleranciaCliente)} ${u}`)] : []),
            previsto('Regra de decisão', REGRAS_DECISAO[c.regra].label),
          ],
          [corrigir(c.criterio === 'CLIENTE' ? 1 : 2), ...(c.criterio === 'CLIENTE' ? [corrigir()] : []), corrigir()],
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
        ? previsto('Próxima calibração (data)', formatarDataBr(k!.proximaCalibracao))
        : escrever('Próxima calibração (data)', { formato: '____/____/________', altura: 25 }),
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
    'itens “Não” da verificação, ΔT acima de 5 °C, faixa ou carga diferentes do previsto, ensaio não feito e o motivo',
  )
  return passo(
    ctx,
    n,
    'Encerramento: ambiente no fim e conclusão',
    e2(E.padroes, E.conclusao),
    'Terminadas as leituras, meça o ambiente de novo, no mesmo lugar e com o mesmo instrumento; depois, confirme com o cliente o que sai no certificado.',
    tabelaAmbiente(ctx, 'Fim'),
    [
      { ...grade([...conformidade, ...proxima], ['*', '*', '*', 150]), margin: [0, 6, 0, 0] },
      { parte: { ...observacoes, margin: [0, 6, 0, 0] }, id: ID_OBSERVACOES },
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
  const tecnico = ctx.d.tecnico.trim()
  const campo = grade(
    [
      [
        tecnico ? previsto('Técnico que executou', tecnico) : escrever('Técnico que executou (nome)'),
        escrever('Assinatura', { altura: 28 }),
        escrever('Data', { formato: '___/___/_____', altura: 28 }),
        escrever('Hora de término', { formato: '____:____', altura: 28 }),
      ],
      [
        escrever('Acompanhado pelo cliente (nome e função)', { altura: 28 }),
        escrever('Assinatura', { altura: 28, dica: 'ciente das condições e acordos desta folha (não dos resultados)' }),
        escrever('Data', { formato: '___/___/_____', altura: 28 }),
        { no: { text: '' }, altura: 28, span: 1 },
      ],
    ],
    [150, '*', 80, 70],
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
                  { rotulo: 'Folha digitalizada e anexada à calibração' },
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
  return passo(ctx, n, 'Assinaturas', e2(E.cliente, E.revisao), null, [campo], [escritorio])
}

// ---- Cabeçalho e rodapé ------------------------------------------------------------------------------------

/** Identificação da tarefa em toda página (ISO/IEC 17025, 7.5.1): OS, cliente e balança. */
function faixaIdentificacao(ctx: Contexto): NoObjeto {
  const { d, b, k } = ctx
  const c = d.cliente
  const os = k?.ordemServico?.trim() ?? ''
  const cliente = c ? (c.nome || c.razaoSocial).trim() : ''
  const balanca = b
    ? [b.numeroSerie && `nº de série ${b.numeroSerie}`, b.identificacao && `TAG ${b.identificacao}`].filter(Boolean).join(' · ')
    : ''
  const rot = (t: string) => ({
    text: t.toUpperCase(),
    font: 'InterMedio',
    fontSize: 5.8,
    characterSpacing: 0.3,
    color: T.rotulo,
    border: [false, false, false, false],
    margin: [0, 2.4, 3, 0],
  })
  const val = (t: string) =>
    t
      ? {
          text: t,
          fontSize: 7.4,
          bold: true,
          color: T.texto,
          noWrap: true,
          border: [false, false, false, false],
          margin: [0, 1, 14, 0],
        }
      : { text: '', border: [false, false, false, true], margin: [0, 0, 14, 0] }
  const larg = (t: string, vazioLargura: number | string) => (t ? 'auto' : vazioLargura)
  return {
    table: {
      widths: ['auto', larg(os, 70), 'auto', c ? 'auto' : '*', 'auto', larg(balanca, 130), '*'],
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
              ' · registro de dados brutos (ISO/IEC 17025, 7.5) · não é certificado de calibração',
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
    ...passoIndicacao(ctx, N.indicacao, N.ajuste),
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

/** A folha montada: o PDF, os extras usados, as marcas (id → página e altura) e o nº de páginas. */
export interface Medida {
  pdf: Buffer
  extras: Extras
  marcas: Map<string, { pagina: number; topo: number }>
  paginas: number
}

async function medir(d: DadosFolhaCampo, extras: Extras): Promise<Medida> {
  const marcas = new Map<string, { pagina: number; topo: number }>()
  const definicao = definicaoFolhaCampo(d, { extras })
  definicao.pageBreakBefore = (no: PosicaoNo) => {
    if (no.id && !marcas.has(no.id)) marcas.set(no.id, { pagina: no.startPosition.pageNumber, topo: no.startPosition.top })
    return false
  }
  const pdf: Buffer = await pdfmake().createPdf(definicao).getBuffer()
  return { pdf, extras, marcas, paginas: marcas.get(ID_FIM)?.pagina ?? 0 }
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

/** Espaço livre no pé de uma página (pt): da última marca dela até a margem de baixo. */
function livreNaPagina(m: Medida, pagina: number): number {
  const fim = Math.max(0, ...[...m.marcas.values()].filter((x) => x.pagina === pagina).map((x) => x.topo))
  return A4.altura - MARGEM_BASE - fim
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

/**
 * Monta a folha medindo onde cada bloco ficou: (1) a parte de um passo que abre uma página ganha o título
 * do passo com "(continuação)" — remontando até nenhuma parte ficar solta; (2) as observações crescem no
 * espaço que sobra na página delas (e continuam no alto da seguinte, se as opiniões passaram para lá),
 * conferido montando de novo: o nº de páginas não muda e nenhuma parte fica sem título.
 */
export async function montar(d: DadosFolhaCampo): Promise<Medida> {
  let extras = SEM_EXTRAS
  let m = await medir(d, extras)
  for (let i = 0; i < 6; i++) {
    const novas = abremPagina(m).filter((id) => !extras.continuacoes.includes(id))
    if (!novas.length) break
    extras = { ...extras, continuacoes: [...extras.continuacoes, ...novas] }
    m = await medir(d, extras)
  }
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
    if (r.paginas === m.paginas && abremPagina(r).every((id) => e.continuacoes.includes(id))) return r
  }
  return m
}

/** Nome do arquivo: "Folha-de-campo-FC-2026-00042.pdf". */
export const nomeArquivoFolhaCampo = (numero: string) =>
  `Folha-de-campo-${(numero || 'em-branco').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '')}.pdf`

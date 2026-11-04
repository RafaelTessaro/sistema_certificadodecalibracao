// Folha de campo (A4 retrato, preto e branco): o roteiro impresso que o técnico leva ao cliente e
// preenche à caneta, passo a passo, na ordem do serviço no local. É o registro de dados brutos da
// calibração (ABNT NBR ISO/IEC 17025:2017, 7.5): depois, cada valor é digitado no assistente — cada
// passo diz em que etapa do sistema ele entra e usa os mesmos rótulos da tela.
//
// Ordem do serviço: padrões (antes de sair) → chegada → identificação → ambiente no início → erro de
// indicação → repetibilidade → excentricidade → ambiente no fim → assinaturas e etiqueta. A folha só registra
// a calibração da balança como ela está: balança que não pesa certo não é calibrada (a manutenção e o ajuste
// são feitos antes, à parte), por isso não há ajuste nem reparo, nem "como encontrado" e "depois do ajuste" (na
// classe I, só o ajuste interno de rotina, antes dos ensaios, que o certificado declara).
// A declaração de conformidade, a próxima calibração e os demais acordos são preenchidos só no sistema.
//
// Convenção visual: fundo cinza = veio do sistema (impresso, compacto); caixa branca = escrever no local
// (só o que é medido lá); caixas de marcar sempre brancas (marca-se com X o que foi feito), com a opção
// prevista no sistema em negrito e a etiqueta PREVISTO. Dado impresso diferente do real não tem caixa de
// correção: o técnico anota o certo no bloco Anotações, no fim da folha (ou numa folha anexa), com o nº do passo,
// rubrica e data, e as observações e anomalias também (uma linha no alto da página 1 diz isso, como o POP, item 10).
// Tabela de escrever tem os rótulos das colunas numa linha de cabeçalho própria: nenhum rótulo ocupa a caixa onde se
// escreve. Com balança (e, de preferência, rascunho), a folha sai pré-preenchida pelo plano (shared/folhaCampo.ts); sem
// balança, sai "em branco", para uma balança ainda não cadastrada das classes II a IIII (a classe I usa a folha da
// balança cadastrada: o ΔT pesos − ar, o ajuste interno antes dos ensaios e o zero antes de cada posição só saem
// nela). Toda página leva o nº da folha e o nº do certificado reservado (quando há): uma folha solta ou digitalizada
// sozinha continua identificável (a OS fica uma vez só, no passo 2, com o cliente). O nº do certificado vai também na
// etiqueta de calibração (a nota sai no passo das assinaturas). Determinística como o certificado.
//
// Paginação medida (`montar`): a parte de um passo que passa para a página seguinte repete o título do
// passo com "(continuação)"; a tabela de pontos vai sempre inteira (só a que não cabe numa página se divide,
// com o título e o cabeçalho de novo) e, quando passa para a página seguinte, o título, a instrução e o
// método ficam na sobra desta, com o aviso "tabela na próxima página"; os pontos e as etapas de
// substituição, preenchidos intercalados, ficam na mesma página.
//
// Rev. 03, só a medição: 2 páginas (frente e verso de uma folha), também nas rodoviárias e na folha em branco: os
// passos na ordem (o passo 5 inteiro na frente quando cabe nela; senão, os ensaios no verso: `comEnsaiosNoVerso`, e a
// frente acaba no passo 4 com a linha "Continua na próxima página"), as assinaturas (com o lembrete de preencher a
// linha Fim do ambiente antes de assinar) e, por último, o bloco Anotações (linhas pontilhadas até o pé da última
// página, medido na montagem: `comAnotacoes`; sem espaço para as linhas mínimas no fim do verso, sozinho numa página a
// mais) para o que for diferente, as observações e as anomalias. Sem QR (o nº da folha basta), sem rubrica no rodapé
// (a data da calibração e a assinatura ficam só no passo das assinaturas) e sem faixa no alto (a OS está no passo 2).
// Instruções de uma linha por passo (a curta na barra do título; o POP explica o resto); a chegada e a identificação da
// balança (passos 2 e 3) num bloco só, com as medidas, o telefone e o nº que não se partem na quebra de linha
// (`medidasSemQuebra`); o ambiente no início e no fim numa tabela só, no passo 4; a repetibilidade numa faixa
// horizontal, com o nº de cada leitura numa linha miúda em cima; a excentricidade (com as assinaturas) num bloco só.
// Rótulos de 7 pt (em caixa baixa, para caberem), dado impresso de 9 pt e linhas de escrever de ≈ 6,5 mm; as de
// leitura, mais altas (até ≈ 8,8 mm) quando a página tem espaço (`comLinhasFolgadas`), sem tirar as linhas mínimas das
// Anotações.
//
// Classe I (só na folha de uma balança classe I): o ΔT pesos − ar na linha do ambiente no início, a umidade e a pressão
// obrigatórias, 10 leituras na repetibilidade (duas faixas de 6) e, na excentricidade, o zero antes de cada posição
// (método 3), nas linhas que já existem; e uma linha a mais no alto do passo 5, o ajuste interno (CAL) de rotina feito
// antes dos ensaios (uma caixa de marcar e a hora: não é reparo nem ajuste durante a calibração).

import {
  capacidadeTexto,
  divisaoLegivel,
  ehRodoviaria,
  enderecoCliente,
  formatarDataBr,
  METODOS_CARREGAMENTO,
  metodosCarregamentoParaEscolher,
  numeroBr,
  pressaoObrigatoria,
  RECEPTORES,
  ROTULO_CLASSE,
  TIPOS_BALANCA,
  TIPOS_PADRAO,
} from '#shared/dominio.ts'
import {
  AVISO_ETIQUETA,
  type CargaPlanejada,
  FORMULARIO_FOLHA_CAMPO,
  padroesPrevistos,
  referenciaDoFormulario,
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
  REGRA_CARGA_EXCENTRICIDADE,
} from '#shared/metrologia/index.ts'
import type { Balanca, CalibracaoInput, Cliente, DadosEmpresa, MetodoCarregamento, Padrao } from '#shared/tipos.ts'
import {
  A4,
  BASE_RODAPE,
  caberNaLargura,
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
  TOPO_CABECALHO,
} from './base.ts'
import { ErroApi } from '../erros.ts'
import { diagramaExcentricidade } from './graficos.ts'
import { COR, TIMBRADO } from './marca.ts'

// ---- Entrada -----------------------------------------------------------------------------------------

export interface DadosFolhaCampo {
  /** Nº único da folha (ex.: "FC-2026-00042"): sai em todas as páginas ('' = linha para escrever). */
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
  /**
   * Código e revisão do POP de calibração (Configurações, `textos.procedimento`): sai no rodapé de toda
   * página, como referência do formulário. Vazio ou ausente = sem referência.
   */
  procedimento?: string
  /**
   * Nº do certificado reservado na impressão da folha (o da calibração; na folha avulsa, também a em branco, um
   * nº da folha, que passa para a calibração a que ela for ligada): sai no alto de toda página, ao lado do nº
   * da folha, e no passo das assinaturas, com a nota da etiqueta de calibração (`AVISO_ETIQUETA`). Vazio ou
   * ausente (folha de antes desta versão, ou de uma revisão) = nada.
   */
  numeroCertificado?: string
}

// ---- Página, cores e tipografia ------------------------------------------------------------------------

/** Margem lateral de 12 mm: largura útil de 186 mm, sobra para a escrita sem encostar na borda. */
const MARGEM_X = 34
const LARGURA = A4.largura - 2 * MARGEM_X
/**
 * O conteúdo começa logo abaixo do timbrado (a marca e os nºs da folha e do certificado), sem faixa de identificação: a
 * OS fica uma vez só, no passo 2.
 */
const MARGEM_TOPO = TOPO_CABECALHO + MODULO + 10
/** Rodapé: duas linhas apoiadas no fio de base (o conteúdo para ≈ 1,8 mm acima delas). */
const MARGEM_BASE = Math.ceil(A4.altura - BASE_RODAPE + 23.5)

/** Tintas neutras (R = G = B): a laser imprime só com o preto, e os cinzas sobrevivem à fotocópia. */
const T = {
  texto: '#1A1A1A',
  instrucao: '#262626',
  rotulo: '#4D4D4D',
  suave: '#626262',
  /** Fundo do que veio do sistema (≈ 11 % de preto). */
  previsto: '#E3E3E3',
  previstoTexto: '#1F1F1F',
  borda: '#4F4F4F',
  linha: '#8C8C8C',
  linhaClara: '#B5B5B5',
} as const

/**
 * Tamanhos da letra: rótulos de 7 pt (em caixa baixa: cabem nas caixas sem quebrar) e dado impresso de 9 pt, o
 * mínimo para ler na prancheta, de pé ao lado da balança; as dicas ao lado dos rótulos, um pouco menores.
 */
const FONTE_ROTULO = 7
const FONTE_DADO = 9
const FONTE_DICA = 6.6
/** Texto das opções de marcar (□ Sim, □ intactos…). */
const FONTE_OPCAO = 7.4

/**
 * Altura do conteúdo das linhas de escrever (leituras, campos em linha): com o padding (1,5 + 1,5), ≈ 6,5 mm, com
 * folga para a escrita à mão em prancheta. As linhas de leitura (ambiente, pontos, etapas, repetibilidade e
 * excentricidade) ganham mais altura quando a página tem espaço (`Extras.folgaLeitura`).
 */
const ALTURA_LEITURA = 15.5
/**
 * Espaço livre para a escrita à mão embaixo do rótulo de uma caixa de rótulo em cima: com o padding de baixo,
 * ≈ 6,7 mm livres. A caixa cresce quando o rótulo quebra em duas linhas, e o espaço livre continua o mesmo.
 */
const LIVRE_ESCRITA = 17.5
/** Altura da linha do modelo do formato ("____:____"), que fica no pé do espaço livre (escreve-se nela). */
const ALTURA_FORMATO = 9
/** Lado das caixas de marcar (≈ 3,5 mm). */
const LADO_CAIXA = 10

/**
 * Onde se anota o que é diferente do impresso, o que não coube, as observações e as anomalias: o bloco Anotações, a
 * última coisa da folha (depois das assinaturas), com as linhas pontilhadas até o pé da última página
 * (`blocoAnotacoes`). Sem caixa de correção nem de observações (campo novo); sem espaço, numa folha anexa.
 */
export const ONDE_ANOTAR = 'em Anotações (no fim da folha)'

/** Nome do bloco das anotações, no fim da folha (as instruções dizem "em Anotações"). */
export const TITULO_ANOTACOES = 'Anotações'
/** O que vai nas anotações, na barra do título do bloco, depois do nome. */
export const DICA_ANOTACOES = 'dado impresso diferente, observações e anomalias, com o nº do passo, rubrica e data'

/**
 * A folha em branco é das classes II a IIII: sem o ΔT pesos − ar, sem o ajuste interno antes dos ensaios e sem o zero
 * antes de cada posição (método 3), que só saem na folha de uma balança classe I cadastrada (ao lado da classe, no
 * passo 3).
 */
export const AVISO_CLASSE_I_EM_BRANCO = 'Classe I: cadastre a balança e imprima a folha dela'
const CLASSE_I = 'Classe I: '

/** A regra de onde anotar (no alto da página 1), com o nº do passo, rubrica e data (POP, item 10). */
export const AVISO_ANOTACOES = `Dado impresso diferente ou observação? Anote ${ONDE_ANOTAR}, com o nº do passo, rubrica e data; sem espaço, numa folha anexa.`

const MENOS = '−'
const num = (v: number, casas: number) => formatarNumero(v, casas).replace(/^-/, MENOS)
const vazio = (s: string | null | undefined) => !s || !s.trim()
const NBSP = '\u00a0'

/** Lista de pesos que só quebra entre as peças ("7 × 20 kg + 10 kg"): nunca entre o número e a unidade. */
const semQuebra = (s: string) =>
  s
    .split(' + ')
    .map((p) => p.replace(/ /g, NBSP))
    .join(' + ')

/**
 * Medidas impressas que não se separam na quebra de linha: o número e a unidade ("80 000 kg", "8 apoios"), as medidas
 * ("24,0 × 3,2 m", "prato Ø 80 mm", inteiras) e o "nº" e o número; entre a capacidade e a divisão ("80 000 kg × 50 kg"), a
 * linha só quebra antes do "×".
 */
const medidasSemQuebra = (s: string) =>
  s
    .replace(/(\d) × (?=\d)/g, `$1${NBSP}×${NBSP}`)
    .replace(/( ?)([Ø⌀]) (?=\d)/gu, (_, antes: string, o: string) => `${antes ? NBSP : ''}${o}${NBSP}`)
    .replace(/ × /g, ` ×${NBSP}`)
    .replace(/(\d) (?=(?:t|kg|g|mg|m|cm|mm|apoios)(?![\p{L}\d]))/gu, `$1${NBSP}`)
    .replace(/\bnº /g, `nº${NBSP}`)

/** Telefone que não se parte na quebra de linha ("(19) 3526-4400"). */
const telefoneSemQuebra = (s: string) => (s.length <= 24 ? s.trim().replace(/\s+/g, NBSP) : s)

/**
 * Separador de itens impressos numa célula: na quebra de linha, o "·" vai com o item seguinte e abre a linha de baixo
 * (nunca sozinho no fim ou no começo de uma linha).
 */
const SEPARADOR = ` ·${NBSP}`

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
  fontSize: 5.8,
  characterSpacing: 0.4,
  color: T.suave,
}

function rotuloOpcao(op: Opcao, tamanho: number): NoObjeto {
  const forte: No = typeof op.rotulo === 'string' ? { text: op.rotulo, bold: true } : { ...(op.rotulo as NoObjeto), bold: true }
  return { text: op.prevista ? [forte, ETIQUETA_PREVISTO] : op.rotulo, fontSize: tamanho, margin: [0, 1, 0, 0] }
}

/**
 * Opções lado a lado (□ Sim  □ Não  □ N/A). Espaços pelo padding da tabela, não por margem: o pdfmake
 * não reserva a margem lateral das células de largura automática e o rótulo quebraria. Sem fios
 * horizontais: mesmo sem desenhar a borda, o pdfmake reservaria 1 pt em cima e embaixo de cada linha.
 */
function opcoes(lista: Opcao[], o: { tamanho?: number; espaco?: number; vertical?: boolean } = {}): NoObjeto {
  const espaco = o.espaco ?? 9
  const tamanho = o.tamanho ?? FONTE_OPCAO
  if (o.vertical)
    return {
      table: {
        widths: [LADO_CAIXA, '*'],
        body: lista.map((op) => [caixa(), rotuloOpcao(op, tamanho)]),
      },
      layout: {
        defaultBorder: false,
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: (i: number) => (i % 2 ? 3.5 : 0),
        paddingRight: () => 0,
        paddingTop: (i: number) => (i ? 2.6 : 0),
        paddingBottom: () => 0,
      },
    }
  const celulas: No[] = []
  lista.forEach((op) => {
    celulas.push(caixa())
    celulas.push(rotuloOpcao(op, tamanho))
  })
  return {
    table: { widths: lista.flatMap(() => [LADO_CAIXA, 'auto']), body: [celulas] },
    layout: {
      defaultBorder: false,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: (i: number) => (i % 2 ? 3 : 0),
      paddingRight: (i: number) => (i % 2 && i < lista.length * 2 - 1 ? espaco : 0),
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  }
}

/** Rótulo de um campo (no canto da caixa, ou à esquerda dela, nos campos em linha). */
const rotulo = (texto: string, extra: NoObjeto = {}): NoObjeto => ({
  text: texto,
  font: 'InterMedio',
  fontSize: FONTE_ROTULO,
  color: T.rotulo,
  lineHeight: 0.95,
  ...extra,
})

/** O rótulo e, logo depois dele, uma dica em letra miúda ("previsto: TH-01", "até 1 °C"). */
const rotuloComDica = (titulo: string, dica?: string, extra: NoObjeto = {}): NoObjeto =>
  dica
    ? { text: [rotulo(titulo), { text: `  ${dica}`, fontSize: FONTE_DICA, color: T.suave }], lineHeight: 0.95, ...extra }
    : rotulo(titulo, extra)

/** Célula de uma grade de campos: o conteúdo e a altura mínima da linha. */
interface Celula {
  no: NoObjeto
  altura: number
  span: number
  /** Linhas ocupadas (padrão 1). */
  linhas?: number
}

/**
 * Valor que veio do sistema (fundo cinza), compacto: o rótulo e o valor. Sem caixa de correção: diferente do
 * real, o técnico anota o certo em Anotações, no fim da folha (`AVISO_ANOTACOES`).
 */
function previsto(titulo: string, valor: No, o: { span?: number } = {}): Celula {
  return {
    no: {
      stack: [
        rotulo(titulo),
        { text: valor, fontSize: FONTE_DADO, color: T.previstoTexto, lineHeight: 0.98, margin: [0, 0.6, 0, 0] },
      ],
      fillColor: T.previsto,
    },
    altura: 0,
    span: o.span ?? 1,
  }
}

/** Valor que veio do sistema numa linha só: o rótulo à esquerda e o valor ao lado (quebra, se for longo). */
function previstoEmLinha(titulo: string, valor: No, o: { span?: number } = {}): Celula {
  return {
    no: {
      text: [rotulo(titulo), { text: '   ' }, { text: valor, fontSize: FONTE_DADO, color: T.previstoTexto }],
      lineHeight: 0.98,
      fillColor: T.previsto,
      verticalAlignment: 'middle',
    },
    altura: 0,
    span: o.span ?? 1,
  }
}

/** Espaço vertical exato (uma pilha vazia só com a margem). */
const espaco = (altura: number): NoObjeto => ({ stack: [], margin: [0, altura, 0, 0] })

/**
 * Caixa branca de escrever, com o rótulo em cima: o rótulo no canto, a dica embaixo dele (opcional) e, livre
 * embaixo deles, o espaço da escrita (`LIVRE_ESCRITA`), com o modelo do formato no pé, à direita (__/__/____),
 * quando há. Para o que é longo (nomes, descrições); o curto vai num campo em linha (`campo`). `aoLado`: letra
 * miúda logo depois do rótulo. `altura`: altura mínima do conteúdo (a caixa nunca fica menor que o necessário).
 */
function escrever(
  titulo: string,
  o: { span?: number; altura?: number; dica?: string; formato?: string; aoLado?: string; livre?: number } = {},
): Celula {
  const livre = o.livre ?? LIVRE_ESCRITA
  return {
    no: {
      stack: [
        rotuloComDica(titulo, o.aoLado),
        ...(o.dica ? [{ text: o.dica, fontSize: FONTE_DICA, color: T.suave, margin: [0, 0.6, 0, 0] }] : []),
        o.formato
          ? {
              text: o.formato,
              fontSize: 7.6,
              lineHeight: 1,
              color: T.suave,
              alignment: 'right',
              margin: [0, livre - ALTURA_FORMATO, 0, 0],
            }
          : espaco(livre),
      ],
      fillColor: '#FFFFFF',
    },
    altura: o.altura ?? 0,
    span: o.span ?? 1,
  }
}

/**
 * Campo de escrever em linha (≈ 6 mm de altura): o rótulo à esquerda (com a dica embaixo dele, em letra
 * miúda), a escrita à direita, na mesma linha, e o modelo do formato no fim (____:____). Para o que é curto
 * (hora, data, um número, um nome).
 */
function campo(titulo: string, o: { span?: number; formato?: string; dica?: string; aoLado?: string } = {}): Celula {
  return {
    no: {
      table: {
        widths: ['auto', '*', 'auto'],
        body: [
          [
            {
              stack: [
                rotuloComDica(titulo, o.aoLado),
                ...(o.dica ? [{ text: o.dica, fontSize: FONTE_DICA, color: T.suave, lineHeight: 0.95 }] : []),
              ],
              verticalAlignment: 'middle',
            },
            { text: '' },
            o.formato
              ? { text: o.formato, fontSize: 7.6, color: T.suave, verticalAlignment: 'bottom', margin: [0, 0, 0, 0.4] }
              : { text: '' },
          ],
        ],
        heights: [ALTURA_LEITURA],
      },
      layout: SEM_FIOS,
      fillColor: '#FFFFFF',
    },
    altura: ALTURA_LEITURA,
    span: o.span ?? 1,
  }
}

/** Tabela sem fios nem respiro (para arrumar peças lado a lado dentro de uma célula). */
const SEM_FIOS: NoObjeto = {
  defaultBorder: false,
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: (i: number) => (i ? 5 : 0),
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
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
                { text: opcao, fontSize: FONTE_ROTULO, color: T.rotulo, margin: [0, 0.4, 0, 0] },
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
        espaco(LIVRE_ESCRITA - 1.2),
      ],
      fillColor: '#FFFFFF',
    },
    altura: 0,
    span: o.span ?? 1,
  }
}

/** Caixa com opções de marcar, com o rótulo em cima (□ kg □ t…). */
function marcar(
  titulo: string,
  lista: Opcao[],
  o: {
    span?: number
    complemento?: No
    tamanho?: number
    altura?: number
    vertical?: boolean
    espaco?: number
    /** Dica curta ao lado do rótulo, em letra miúda. */
    aoLado?: string
  } = {},
): Celula {
  return {
    no: {
      stack: [
        rotuloComDica(titulo, o.aoLado, { margin: [0, 0, 0, 1.8] }),
        opcoes(lista, { tamanho: o.tamanho, espaco: o.espaco, vertical: o.vertical }),
        ...(o.complemento ? [{ text: o.complemento, fontSize: FONTE_DICA, color: T.suave, margin: [0, 2, 0, 0] }] : []),
      ],
      fillColor: '#FFFFFF',
    },
    altura: o.altura ?? 0,
    span: o.span ?? 1,
  }
}

/** Opções de marcar em linha (≈ 6 mm de altura): o rótulo à esquerda e as opções logo depois dele. */
function marcarEmLinha(
  titulo: string,
  lista: Opcao[],
  o: {
    span?: number
    tamanho?: number
    espaco?: number
    aoLado?: string
    dica?: string
    depois?: No
    /** Largura do texto de depois das opções (pt; padrão: o que sobra). */
    larguraDepois?: number
  } = {},
): Celula {
  return {
    no: {
      table: {
        // As opções na coluna que sobra: numa coluna automática, um arredondamento quebraria a última opção
        widths:
          o.depois && o.larguraDepois
            ? ['auto', '*', o.larguraDepois]
            : ['auto', o.depois ? 'auto' : '*', ...(o.depois ? ['*'] : [])],
        body: [
          [
            {
              stack: [
                rotuloComDica(titulo, o.aoLado),
                ...(o.dica ? [{ text: o.dica, fontSize: FONTE_DICA, color: T.suave, lineHeight: 0.95 }] : []),
              ],
              verticalAlignment: 'middle',
            },
            { ...opcoes(lista, { tamanho: o.tamanho, espaco: o.espaco }), verticalAlignment: 'middle' },
            ...(o.depois ? [{ text: o.depois, fontSize: FONTE_OPCAO, color: T.suave, verticalAlignment: 'middle' }] : []),
          ],
        ],
        heights: [ALTURA_LEITURA],
      },
      layout: { ...SEM_FIOS, paddingLeft: (i: number) => (i ? 7 : 0) },
      fillColor: '#FFFFFF',
    },
    altura: ALTURA_LEITURA,
    span: o.span ?? 1,
  }
}

const LAYOUT_GRADE: NoObjeto = {
  hLineWidth: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? 0.8 : 0.5),
  vLineWidth: (i: number, no: { table: { widths: unknown[] } }) => (i === 0 || i === no.table.widths.length ? 0.8 : 0.5),
  hLineColor: (i: number, no: { table: { body: unknown[] } }) => (i === 0 || i === no.table.body.length ? T.borda : T.linha),
  vLineColor: (i: number, no: { table: { widths: unknown[] } }) => (i === 0 || i === no.table.widths.length ? T.borda : T.linha),
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 1.5,
  paddingBottom: () => 1.5,
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
  /** Colunas vizinhas com o mesmo grupo ganham um título comum acima. */
  grupo?: string
  /** Dica curta embaixo do título e da unidade ("só se descer"). */
  nota?: string
}

type Alinhamento = 'left' | 'right' | 'center'
type CelulaTabela = {
  /** 'coberta': a célula de baixo de uma que ocupa mais de uma linha (`linhas`). */
  tipo: 'previsto' | 'escrever' | 'numero' | 'dica' | 'coberta'
  no?: No
  alinhamento?: Alinhamento
  /** Colunas ocupadas (padrão 1). */
  span?: number
  /** Linhas ocupadas (padrão 1); as de baixo levam `coberta()` nesta coluna. */
  linhas?: number
  /** Onde o texto fica na altura da célula (de uma linha só: a de várias linhas fica sempre no alto). */
  vertical?: 'bottom'
}

const pre = (no: No, alinhamento?: Alinhamento): CelulaTabela => ({ tipo: 'previsto', no, alinhamento })
const livre = (): CelulaTabela => ({ tipo: 'escrever' })
const nro = (n: No): CelulaTabela => ({ tipo: 'numero', no: n })
const coberta = (): CelulaTabela => ({ tipo: 'coberta' })
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
  o: {
    altura?: number
    alturaUltima?: number
    margem?: number[]
    idLinhas?: string
    primeiraLinha?: number
    /** Respiro à esquerda e à direita de cada coluna (padrão 3,5 pt). */
    respiro?: number
  } = {},
): NoObjeto {
  // A unidade na mesma linha do título ("Indicação ↑ (kg)"): o cabeçalho fica numa linha só, quando cabe
  const tituloColuna = (c: Coluna): NoObjeto => ({
    stack: [
      {
        text: [{ text: c.titulo }, ...(c.unidade ? [{ text: ` (${c.unidade})`, font: 'Inter', color: T.rotulo }] : [])],
        font: 'InterMedio',
        fontSize: FONTE_ROTULO,
        color: T.texto,
        lineHeight: 0.95,
      },
      ...(c.nota ? [{ text: c.nota, fontSize: FONTE_DICA, color: T.suave, lineHeight: 0.95, margin: [0, 0.4, 0, 0] }] : []),
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
          text: c.grupo,
          colSpan: span,
          font: 'InterMedio',
          bold: true,
          fontSize: FONTE_ROTULO,
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
    if (cel.tipo === 'coberta') return {}
    if (cel.tipo === 'escrever') return { text: id ? ' ' : '', fontSize: 1, ...marcaLinha, fillColor: '#FFFFFF' }
    if (cel.tipo === 'dica')
      return {
        text: cel.no ?? '',
        fontSize: FONTE_DICA,
        lineHeight: 0.98,
        color: T.suave,
        fillColor: '#FFFFFF',
        ...(cel.alinhamento ? { alignment: cel.alinhamento } : {}),
        ...(cel.vertical ? { verticalAlignment: cel.vertical } : {}),
        ...marcaLinha,
      }
    if (cel.tipo === 'numero')
      return {
        text: cel.no ?? '',
        font: 'InterMedio',
        fontSize: 7.6,
        color: T.rotulo,
        alignment: 'center',
        verticalAlignment: 'middle',
        fillColor: '#FFFFFF',
        ...marcaLinha,
      }
    return {
      stack: [cel.no && typeof cel.no === 'object' && !Array.isArray(cel.no) ? cel.no : { text: cel.no ?? '' }],
      fontSize: FONTE_DADO,
      lineHeight: 0.98,
      color: T.previstoTexto,
      alignment: alinhamento,
      verticalAlignment: 'middle',
      fillColor: T.previsto,
      ...(alinhamento === 'right' ? { fontFeatures: ['tnum'] } : {}),
    }
  }
  const primeira = o.primeiraLinha ?? 0
  const corpo = linhas.map((l, j) => {
    const out: No[] = []
    let coluna = 0
    l.forEach((cel, k) => {
      const span = Math.max(1, cel.span ?? 1)
      const id = o.idLinhas && k === 0 ? `${o.idLinhas}:${primeira + j}` : undefined
      const linhasOcupadas = Math.max(1, cel.linhas ?? 1)
      // A que ocupa mais de uma linha fica no alto dela (o pdfmake não centraliza na altura de várias linhas)
      out.push({
        ...celula(cel, coluna, id),
        ...(span > 1 ? { colSpan: span } : {}),
        ...(linhasOcupadas > 1 ? { rowSpan: linhasOcupadas, verticalAlignment: 'top' } : {}),
      })
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
      heights: (i: number) =>
        i < nCabecalho ? 'auto' : o.alturaUltima !== undefined && i === nCabecalho + corpo.length - 1 ? o.alturaUltima : altura,
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
      paddingLeft: () => o.respiro ?? 3.5,
      paddingRight: () => o.respiro ?? 3.5,
      paddingTop: (i: number) => (i < nCabecalho ? 1.1 : 1.5),
      paddingBottom: (i: number) => (i < nCabecalho ? 0.8 : 1.5),
    },
    margin: o.margem ?? [0, 0, 0, 0],
  }
}

/**
 * Tabela de leituras sem a linha de cabeçalho (as linhas trazem o rótulo na primeira coluna). `miuda`: as linhas de
 * rótulos em letra miúda (o nº de cada leitura ou posição, em cima das caixas de escrever de uma faixa), mais baixas.
 */
function tabelaSemCabecalho(
  larguras: Array<number | string>,
  linhas: CelulaTabela[][],
  forte: (i: number) => boolean = () => false,
  alturas: (i: number) => number | string = () => ALTURA_LEITURA,
  miuda: (i: number) => boolean = () => false,
): NoObjeto {
  const t = tabelaLeituras(
    larguras.map((l) => ({ titulo: '', largura: l })),
    linhas,
  ) as { table: { body: No[][]; headerRows: number; heights: (i: number) => number | string }; layout: Record<string, unknown> }
  const body = t.table.body.slice(1)
  return {
    ...t,
    table: { ...t.table, body, headerRows: 0, heights: alturas },
    layout: {
      ...t.layout,
      hLineWidth: (i: number, no: { table: { body: unknown[] } }) =>
        i === 0 || i === no.table.body.length ? 0.8 : forte(i) ? 0.9 : 0.5,
      hLineColor: (i: number, no: { table: { body: unknown[] } }) =>
        i === 0 || i === no.table.body.length || forte(i) ? T.borda : T.linha,
      paddingTop: (i: number) => (miuda(i) ? 1 : 1.2),
      paddingBottom: (i: number) => (miuda(i) ? 0.6 : 1.5),
    },
  }
}

/** Rótulo miúdo de uma coluna, numa linha própria em cima das caixas de escrever ("1ª", "6ª · opcional", "Hora"). */
const rotuloMiudo = (texto: string): CelulaTabela => dica([{ text: texto, fontSize: 6, color: T.suave }])

/** Corpo da instrução do passo. */
const FONTE_INSTRUCAO = 7.4
/** Separa o nome do passo da instrução, na mesma linha. */
const ESPACO_INSTRUCAO = '\u2002 '

/** Instrução curta do passo (o que fazer, na ordem; o POP explica o resto), alinhada ao título. */
function instrucao(texto: No, margem: number[] = [17, 0, 0, 1.8]): NoObjeto {
  return { text: texto, fontSize: FONTE_INSTRUCAO, lineHeight: 1, color: T.instrucao, margin: margem }
}

/** Largura (pt) de um texto rico numa linha só, na Inter (os pedaços em negrito, medidos em negrito); com quebra, ∞. */
function larguraNo(no: No, tamanho: number, negrito = false): number {
  if (no === null || no === undefined) return 0
  if (typeof no === 'string' || typeof no === 'number') {
    const s = String(no)
    return s.includes('\n') ? Infinity : larguraTexto(s, { tamanho, negrito })
  }
  if (Array.isArray(no)) return no.reduce((soma: number, x) => soma + larguraNo(x as No, tamanho, negrito), 0)
  const o = no as NoObjeto
  return larguraNo(o.text as No, (o.fontSize as number | undefined) ?? tamanho, (o.bold as boolean | undefined) ?? negrito)
}

/**
 * A instrução cabe na barra do título, depois do nome, numa linha só (sem a linha dela embaixo do título: ≈ 3,5 mm
 * a menos por passo)? A barra tem o nº, o nome, a instrução e, à direita, a etapa do sistema.
 */
function instrucaoNaBarra(titulo: string, sistema: string, texto: No, complemento = 0): boolean {
  const nome = larguraTexto(titulo.toUpperCase(), { fonte: 'InterMedio', negrito: true, tamanho: 8.2, espacamento: 0.35 })
  const etapa =
    larguraTexto('NO SISTEMA  ', { fonte: 'InterMedio', tamanho: 5.8, espacamento: 0.4 }) + larguraTexto(sistema, { tamanho: 7 })
  const espaco = larguraTexto(ESPACO_INSTRUCAO, { tamanho: FONTE_INSTRUCAO })
  // O quadrado do nº, os respiros do nome (6,5) e da etapa (6) e uma folga para o arredondamento da quebra de linha
  const livre = LARGURA - 9.8 - 6.5 - 6 - etapa - 4
  return nome + complemento + espaco + larguraNo(texto, FONTE_INSTRUCAO) <= livre
}

/** Nota pequena (regras, avisos de digitação). */
function nota(texto: No, margem: number[] = [0, 2.2, 0, 0]): NoObjeto {
  return { text: texto, fontSize: 6.8, lineHeight: 1.02, color: T.suave, margin: margem }
}

/** Subtítulo dentro de um passo. */
function subtitulo(texto: string, margem: number[] = [0, 6, 0, 2.5]): NoObjeto {
  return { text: texto, font: 'InterMedio', bold: true, fontSize: 7.6, color: T.texto, margin: margem }
}

/** Quadrado verde com o nº do passo. */
function numeroPasso(n: number, continuacao: boolean): NoObjeto {
  return {
    text: String(n),
    font: 'Poppins',
    fontSize: continuacao ? 7.2 : 8,
    color: '#FFFFFF',
    fillColor: COR.marcaTexto,
    alignment: 'center',
    margin: [0, continuacao ? 0.4 : 0.3, 0, 0],
  }
}

/**
 * Título de um passo: nº num quadrado verde, o nome e, à direita, a etapa do sistema onde ele é digitado.
 * `continuacao`: a parte do passo que passou para a página seguinte repete o título, com "(continuação)";
 * `complemento`: logo depois do nome, na mesma linha (o nº do certificado reservado, no passo 8); `outro`:
 * um segundo passo na mesma barra (a chegada e a identificação da balança, num bloco só).
 */
function tituloPasso(
  n: number,
  titulo: string,
  sistema: string,
  continuacao = false,
  complemento: No[] = [],
  outro?: { n: number; titulo: string },
  /** A instrução do passo na mesma linha, depois do nome (só quando cabe: `instrucaoNaBarra`). */
  texto?: No,
): NoObjeto {
  // A continuação é mais baixa (≈ 3,5 mm): só lembra de que passo é a parte que abre a página
  const lado = continuacao ? 9.5 : 9.8
  const corpo = continuacao ? 7.4 : 8.2
  const nome = (t: string, cont: boolean, extra: No[] = []): NoObjeto => ({
    text: [
      { text: t.toUpperCase() },
      ...(cont ? [{ text: '  (CONTINUAÇÃO)', bold: false, fontSize: 6.4, characterSpacing: 0.3, color: T.rotulo }] : []),
      ...extra,
      // Cada pedaço com a letra da instrução (o pdfmake não passa o estilo de um texto para os pedaços dentro dele)
      ...(texto
        ? [ESPACO_INSTRUCAO, ...(Array.isArray(texto) ? texto : [texto])].map((x): NoObjeto => {
            const o = typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as NoObjeto) : { text: x }
            return {
              ...o,
              font: 'Inter',
              bold: o.bold ?? false,
              fontSize: o.fontSize ?? FONTE_INSTRUCAO,
              characterSpacing: 0,
              color: o.color ?? T.instrucao,
            }
          })
        : []),
    ],
    font: 'InterMedio',
    bold: true,
    fontSize: corpo,
    characterSpacing: 0.35,
    color: T.texto,
    margin: [continuacao ? 6 : 6.5, continuacao ? 1.1 : 1.1, outro ? 12 : 0, 0],
  })
  const etapa: NoObjeto = {
    text: [{ text: 'NO SISTEMA  ', font: 'InterMedio', fontSize: 5.8, characterSpacing: 0.4 }, { text: sistema }],
    fontSize: 7,
    color: T.rotulo,
    alignment: 'right',
    margin: [6, continuacao ? 1.6 : 1.8, 0, 0],
  }
  const celulas: No[] = outro
    ? [
        numeroPasso(n, continuacao),
        nome(titulo, false),
        numeroPasso(outro.n, continuacao),
        nome(outro.titulo, continuacao, complemento),
        etapa,
      ]
    : [numeroPasso(n, continuacao), nome(titulo, continuacao, complemento), etapa]
  return {
    table: {
      widths: outro ? [lado, 'auto', lado, '*', 'auto'] : [lado, '*', 'auto'],
      body: [celulas],
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
    margin: [0, 0, 0, 1.1],
  }
}

/**
 * Parte de um passo depois da primeira: passa inteira para a página seguinte quando não cabe. Com `id`,
 * a montagem acha onde ela ficou; `quebra`: começa sempre uma página nova; `partivel`:
 * pode se dividir entre as páginas (uma tabela maior que a página; o cabeçalho dela se repete).
 */
interface ParteComId {
  parte: No
  id: string
  quebra?: boolean
  partivel?: boolean
  /** O título de continuação, quando é o de outro passo (no bloco dos passos 2 e 3, a parte da balança: o 3). */
  titulo?: { n: number; titulo: string; sistema: string }
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
  o: {
    outro?: { n: number; titulo: string }
    complemento?: No[]
    /** O passo começa numa página nova (os ensaios no verso, ver `Extras.ensaiosNoVerso`). */
    paginaNova?: boolean
  } = {},
): No[] {
  const topo = topoDoPasso(n, titulo, sistema, texto, o.outro, o.complemento)
  const quebraAntes = o.paginaNova ? { pageBreak: 'before' } : {}
  if (ctx.extras.semBlocos)
    return [
      { ...inteiro(topo), id: `passo-${n}`, margin: [0, ESPACO_PASSO, 0, 0], ...quebraAntes },
      marca(`fim:passo-${n}`),
      ...primeira,
      ...resto.flatMap((r, i): No[] => {
        const { parte, id } = eParte(r) ? r : { parte: r, id: idParte(n, i + 1) }
        return [{ stack: [parte], id: `solto-${id}` }, marca(`fim:solto-${id}`)]
      }),
    ]
  const cabeca = inteiro([...topo, ...primeira])
  const folga = (id: string) => (ctx.extras.folgas?.includes(id) ? FOLGA_BLOCO : 0)
  return [
    { ...cabeca, id: `passo-${n}`, margin: [0, ESPACO_PASSO + folga(`passo-${n}`), 0, 0], ...quebraAntes },
    marca(`fim:passo-${n}`),
    ...resto.flatMap((r, i): No[] => {
      const { parte, id, quebra, partivel } = eParte(r) ? r : { parte: r, id: idParte(n, i + 1), quebra: false, partivel: false }
      // Pode se dividir: não ganha título de continuação (fica fora da medição das partes, `parte-…`)
      if (partivel) return [{ stack: [parte], id: `partivel-${id}` }, marca(`fim:partivel-${id}`)]
      const continua = quebra || ctx.extras.continuacoes.includes(id)
      const t = (eParte(r) && r.titulo) || { n, titulo, sistema }
      return [
        {
          ...inteiro([...(continua ? [tituloPasso(t.n, t.titulo, t.sistema, true)] : []), parte]),
          id,
          ...(folga(id) ? { margin: [0, folga(id), 0, 0] } : {}),
          ...(quebra ? { pageBreak: 'before' } : {}),
        },
        marca(`fim:${id}`),
      ]
    }),
  ]
}

/** O título do passo e a instrução: a curta na barra do título, depois do nome; a longa, na linha de baixo. */
function topoDoPasso(
  n: number,
  titulo: string,
  sistema: string,
  texto: No | null,
  outro?: { n: number; titulo: string },
  complemento: No[] = [],
): No[] {
  const naBarra = !!texto && !outro && !complemento.length && instrucaoNaBarra(titulo, sistema, texto)
  return [
    tituloPasso(n, titulo, sistema, false, complemento, outro, naBarra ? texto! : undefined),
    ...(texto && !naBarra ? [instrucao(texto)] : []),
  ]
}

/**
 * Marca invisível (≈ 0,1 pt) logo depois de um bloco, fora dele: a montagem lê em que página e altura ela
 * ficou (o bloco inteiro informa a posição de antes de passar para a página seguinte; a marca, a de depois).
 */
const marca = (id: string): NoObjeto => ({ text: ' ', id, fontSize: 0.1, lineHeight: 1 })

/** Respiro entre duas grades de um passo (a de baixo com outras colunas). */
const ENTRE_GRADES = 2

/** Respiro entre um passo e o seguinte. */
const ESPACO_PASSO = 1.2
/** Respiro a mais de um bloco que o pdfmake descartaria no pé da página (ver `Extras.folgas`). */
const FOLGA_BLOCO = 1.5

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
  /** O que a montagem mediu e acrescenta (títulos de continuação, cortes da tabela de pontos…). */
  extras: Extras
  /** Nº do certificado reservado na impressão ('' = sem nº: folha de antes desta versão, ou de uma revisão). */
  certificado: string
}

/** Altura do conteúdo das linhas de leitura do passo n (pt), com a folga medida na montagem (`Extras.folgaLeitura`). */
const alturaLeitura = (ctx: Contexto, n: number) => ALTURA_LEITURA + (ctx.extras.folgaLeitura?.[n] ?? 0)

/** O que a montagem acrescenta depois de medir a folha (ver `montar`). */
export interface Extras {
  /** Partes de passo que abrem uma página: saem com o título do passo e "(continuação)". */
  continuacoes: string[]
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
   * Os pontos e as etapas de substituição, juntos, não couberam na página do título do passo 5 (iriam inteiros
   * para a seguinte, deixando esta quase vazia): os pontos ficam nela e as etapas vão como outra parte do passo.
   */
  etapasAParte?: boolean
  /**
   * Montagem de segurança, quando algum bloco inteiro não coube numa página (e sumiria): só o título e a
   * instrução de cada passo ficam juntos; as tabelas se dividem onde a página acaba, com o cabeçalho de novo.
   */
  semBlocos?: boolean
  /**
   * O passo 5 começa numa página nova (na folha de 2 páginas, o verso): o título e o método iam ficar no pé da página e a
   * tabela dos pontos passar inteira para a seguinte. Só quando a folha continua com as mesmas páginas e as Anotações,
   * no fim, ficam com as linhas mínimas (medido na montagem, `comEnsaiosNoVerso`). A página de antes acaba no passo 4,
   * com a linha "Continua na próxima página" (`avisoContinua`), para o espaço que sobra embaixo não parecer o lugar
   * das anotações; `semAvisoContinua`: sem lugar para ela na página do passo 4.
   */
  ensaiosNoVerso?: boolean
  semAvisoContinua?: boolean
  /**
   * Blocos inteiros que ganham um respiro a mais em cima: o pdfmake descarta o bloco que cabe no pé da página
   * por uma fração de ponto (arredondamento); empurrado, ele passa inteiro para a página seguinte.
   */
  folgas?: string[]
  /**
   * Folha de frente e verso com espaço sobrando: o que as linhas de leitura de cada passo (`PASSOS_COM_LEITURA`, pelo nº)
   * ganham de altura (pt), a folga da página onde elas ficam, até `FOLGA_MAXIMA` e sem passar de
   * `PREENCHIMENTO_MAXIMO` da altura útil nem tirar as linhas mínimas das Anotações, na última (medido na montagem,
   * `comLinhasFolgadas`). O espaço que sobra vira escrita mais folgada; o que ainda sobra no fim, as Anotações.
   */
  folgaLeitura?: Partial<Record<number, number>>
  /**
   * O bloco Anotações, a última coisa da folha (medido na montagem, `comAnotacoes`): a altura da caixa das linhas
   * pontilhadas (pt; do fim das assinaturas até o pé da última página). `paginaNova`: as linhas mínimas não couberam no
   * fim da última página, e o bloco vai sozinho para uma página a mais, depois do passo 8 (a caixa até o pé dela).
   */
  anotacoes?: { altura: number; paginaNova?: boolean }
}

const SEM_EXTRAS: Extras = { continuacoes: [], cortes: [] }

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
    certificado: d.numeroCertificado?.trim() ?? '',
  }
}

/**
 * A folha leva as substituições (coluna nos pontos e a tabela das etapas): com a substituição no plano ou numa
 * rodoviária cadastrada (a mesma condição da tela do assistente). A folha em branco não: o POP não cobre
 * rodoviárias nem ferroviárias, e a balança não cadastrada só pode ser uma das que ele cobre.
 */
const comSubstituicao = (ctx: Contexto) => !!ctx.plano && (ctx.plano.substituicao.ativa || (!!ctx.b && ehRodoviaria(ctx.b)))

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
  revisao: '8 · Revisão e emissão',
} as const
const E = ETAPAS_SISTEMA
const e2 = (a: string, b: string) => `${a} · ${b}`

/** Marca de campo obrigatório para emitir. */
const OBRIG = ' ●'

/** Números dos passos da folha (as instruções citam uns aos outros). */
const N = {
  padroes: 1,
  chegada: 2,
  balanca: 3,
  ambiente: 4,
  indicacao: 5,
  repetibilidade: 6,
  excentricidade: 7,
  assinaturas: 8,
} as const

/**
 * Passos com linhas de leitura: o ambiente, os pontos e as etapas, a repetibilidade e a excentricidade. Cada um ganha a
 * folga da página onde ficam as linhas dele (`Extras.folgaLeitura`).
 */
const PASSOS_COM_LEITURA = [N.ambiente, N.indicacao, N.repetibilidade, N.excentricidade]

// ---- Introdução (página 1) -----------------------------------------------------------------------------

function introducao(): No[] {
  // As regras de anotar e corrigir, a de onde anotar em negrito e, numa linha própria, a legenda dos fundos. A amostra do
  // fundo cinza abre a linha: sem `preserveLeadingSpaces`, o pdfmake cortaria os espaços do começo da linha e o
  // fundo sairia por cima do fio da caixa
  const amostra = (fundo: string): NoObjeto => ({
    text: '\u2002\u2002\u2002',
    background: fundo,
    fontSize: 6.4,
    preserveLeadingSpaces: true,
  })
  const regras: NoObjeto = {
    text: [
      { text: 'COMO ANOTAR E CORRIGIR  ', font: 'InterMedio', bold: true, fontSize: 6.8, characterSpacing: 0.3 },
      'Caneta, na hora da leitura (sem lápis nem corretivo), com todos os dígitos e o sinal. Errou: ',
      { text: 'um risco só sobre o valor errado', bold: true },
      ' (continua legível), o certo ao lado, rubrica e data. ',
      { text: AVISO_ANOTACOES, bold: true },
      '\n',
      amostra(T.previsto),
      { text: ' Impresso pelo sistema', bold: true },
      ' · □ ',
      { text: 'Marque com X', bold: true },
      { ...ETIQUETA_PREVISTO, text: ' (PREVISTO = do sistema)' },
      ' · ',
      { text: '●', color: COR.marcaTexto },
      ' obrigatório para emitir · (*) dado do cliente',
    ],
    fontSize: 7.2,
    lineHeight: 1.02,
  }
  return [
    {
      table: { widths: ['*'], body: [[regras]] },
      layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0.8,
        hLineColor: () => T.borda,
        vLineColor: () => T.borda,
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 1.8,
        paddingBottom: () => 1.6,
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

/**
 * Larguras da tabela dos padrões (a descrição fica com o resto). Com o plano, a coluna das peças é larga (a
 * lista impressa: "10 kg + 5 kg + 2 × 2 kg + 1 kg + 500 g…" quebra menos); sem ele, as peças são escritas à
 * mão, curtas ("7 × 20 + 10"), numa caixa de ≈ 21 mm, e a descrição ganha a largura (≈ 57 mm) para caber
 * inteira numa linha ("Termo-higrômetro digital com sonda externa", "Jogo de pesos 20 kg (15 peças) classe M1"):
 * um padrão por linha, e a folha em branco não cresce com os padrões da empresa.
 */
const COLUNAS_PADROES = {
  plano: { levado: 25, usado: 23, identificacao: 66, pecas: 96, certificado: 74, proxima: 56 },
  semPlano: { levado: 25, usado: 23, identificacao: 66, pecas: 56, certificado: 74, proxima: 56 },
}
/** O que a tabela de leituras gasta além das colunas: o respiro (3,5 + 3,5) de cada uma e os fios verticais. */
const MOLDURA_PADROES = 7 * 7 + 2 * 0.8 + 6 * 0.5
/** Corpo da descrição do padrão na tabela (a identificação e o nº do certificado, ao lado, é que o identificam). */
const FONTE_DESCRICAO_PADRAO = 7.6

/** A classe como palavra solta numa descrição, com o "classe" antes, se tiver ("… classe M1", "M1 …"). */
const classeEscrita = (classe: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(classe\\s+)?${classe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')

/**
 * Descrição do padrão na tabela: a do cadastro (ou o tipo) e a classe, se a descrição ainda não a tiver
 * ("Jogo de pesos 20 kg classe M1" não ganha "· M1"). Com `largura` (o espaço útil da coluna, pt), numa linha
 * só (a folha não cresce com os padrões): sem caber, a classe escrita na descrição sai dela e vai no fim, e o
 * resto é cortado com "…" (a identificação e o nº do certificado, ao lado, é que identificam o padrão).
 */
export function descricaoPadraoNaFolha(p: Padrao, largura: number | null = null): NoObjeto {
  const fonte = { tamanho: FONTE_DESCRICAO_PADRAO }
  // Folga da medida: a quebra de linha do pdfmake não pode pegar o texto de surpresa
  const FOLGA = 3
  const doCadastro = p.classe.trim()
  let descricao = (p.descricao || TIPOS_PADRAO[p.tipo] || p.tipo).replace(/\s+/g, ' ').trim()
  const escrita = doCadastro ? classeEscrita(doCadastro) : null
  let classe = !escrita || escrita.test(descricao) ? '' : ` · ${doCadastro}`
  if (largura !== null && escrita && !classe && larguraTexto(descricao, fonte) > largura - FOLGA) {
    const semClasse = descricao
      .replace(escrita, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[\s,;:·–—-]+$/, '')
      .trim()
    if (semClasse) [descricao, classe] = [semClasse, ` · ${doCadastro}`]
  }
  const util = largura === null ? null : largura - FOLGA - (classe ? larguraTexto(classe, fonte) : 0)
  return {
    text: [
      { text: util === null ? descricao : caberNaLargura(descricao, util, fonte) },
      ...(classe ? [{ text: classe, color: T.suave }] : []),
    ],
    fontSize: FONTE_DESCRICAO_PADRAO,
  }
}

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
    if (situacao === 'VENCENDO') return { text: [{ text: data }, { text: '\nvence em breve', fontSize: FONTE_DICA }] }
    return data
  }
  const col = plano ? COLUNAS_PADROES.plano : COLUNAS_PADROES.semPlano
  // Um padrão por linha: a descrição que não cabe encurta com "…" (a lista das peças, ao lado, é que pode ocupar duas)
  const larguraDescricao = LARGURA - Object.values(col).reduce((soma, l) => soma + l, 0) - MOLDURA_PADROES
  const linhas: CelulaTabela[][] = previstos.map(({ padrao: p, situacao, separar }) => [
    livre(),
    livre(),
    pre({ text: p.identificacao || '—', bold: true }),
    pre(descricaoPadraoNaFolha(p, larguraDescricao)),
    // Sem plano, as peças de cada jogo são escritas no local (caixa branca); instrumento não tem peças
    plano
      ? pre(semQuebra(separar) || (p.tipo === 'PESOS' ? '—' : 'levar'), 'left')
      : p.tipo === 'PESOS'
        ? livre()
        : pre('—', 'center'),
    pre({ text: p.certificado || '—' }),
    pre(validade(p, situacao), 'right'),
  ])
  linhas.push([livre(), livre(), livre(), livre(), livre(), livre(), livre()])
  const longa = linhas.length > LINHAS_PADROES_INTEIRA
  const tabela = tabelaLeituras(
    [
      { titulo: 'Levado', largura: col.levado, alinhamento: 'center' },
      { titulo: 'Usado', largura: col.usado, alinhamento: 'center' },
      { titulo: 'Identificação', largura: col.identificacao },
      { titulo: 'Descrição', largura: '*' },
      { titulo: plano ? 'Separar (peças previstas)' : 'Peças usadas', largura: col.pecas },
      { titulo: 'Certificado nº', largura: col.certificado },
      { titulo: 'Próx. calibração', largura: col.proxima, alinhamento: 'right' },
    ],
    linhas,
    // Com o plano, as linhas do sistema baixas (só se marca com X); a em branco, para escrever outro padrão, com
    // ≈ 6,5 mm. Sem o plano (folha em branco), as peças usadas de cada jogo são escritas na linha: todas com ≈ 6,5 mm
    { altura: plano ? 10.6 : ALTURA_LEITURA, alturaUltima: ALTURA_LEITURA },
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
            body: [[{ text: [{ text: 'Resolva antes de sair: ', bold: true }, avisos.join(' ')], fontSize: 7.2 }]],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 2.2 : 0),
            vLineColor: () => T.texto,
            paddingLeft: () => 7,
            paddingTop: () => 1.2,
            paddingBottom: () => 1.2,
          },
          margin: [0, 2.5, 0, 0],
        },
      ]
    : []
  const texto: No = plano
    ? `Separe os padrões e as peças previstas (${plano.origem === 'RASCUNHO' ? 'pontos, cargas e posições planejados no sistema' : 'pontos, cargas e posições sugeridos pelo sistema'}) e marque “levado”; no cliente, “usado”.`
    : 'Em branco: marque os padrões levados e, no cliente, os usados.'
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

// ---- 2 e 3. Chegada ao cliente e identificação da balança (um bloco só) --------------------------------------

/**
 * Cliente e local (passo 2): impressos do cadastro, para conferir (diferente, em Anotações), ou em caixas para
 * escrever (folha em branco). A OS vem logo embaixo, com o técnico e a hora de início (`linhaChegada`).
 */
function gradesCliente(ctx: Contexto): NoObjeto[] {
  const { d, k } = ctx
  const c = d.cliente
  const endereco = k?.localEndereco?.trim() || (c ? enderecoCliente(c) : '')
  const local = k?.local ?? null
  const anotacoes = k?.anotacoesInternas?.trim() ?? ''
  const ondeFoi = marcar('Onde a calibração foi feita', [
    { rotulo: 'no cliente', prevista: local === 'CLIENTE' },
    { rotulo: 'no laboratório', prevista: local === 'LABORATORIO' },
  ])
  const ONDE = 164
  // Recados de acesso (portaria, EPI, contato) vêm primeiro: são para a chegada
  const recado: Celula[][] = anotacoes
    ? [[previstoEmLinha('Anotações internas (não saem no certificado)', anotacoes, { span: 4 })]]
    : []
  if (!c)
    return [
      grade(
        [
          ...recado,
          // O nome e o documento numa linha só (≈ 6 mm: o rótulo à esquerda e a escrita ao lado)
          [campo('Razão social / Nome', { span: 3 }), campo('CNPJ / CPF')],
          [escrever(`Endereço da calibração${OBRIG} (rua, nº, bairro, cidade/UF, CEP)`, { span: 3 }), ondeFoi],
          // O certificado traz também o endereço do cadastro do cliente (sede, pessoa física sem CNPJ…)
          [
            escreverComCaixa('Endereço do cliente (sai no certificado)', 'o mesmo do local', { span: 2 }),
            escrever('Contato e telefone'),
            escrever('E-mail para o certificado'),
          ],
        ],
        ['*', '*', '*', ONDE],
      ),
    ]
  const pj = c.tipo === 'PJ'
  const nome = pj ? c.razaoSocial || c.nome : c.nome
  const telefone = c.telefone || c.celular
  const contato = [c.contato, vazio(telefone) ? '' : telefoneSemQuebra(telefone)].filter((x) => !vazio(x)).join(SEPARADOR) || '—'
  const documento = c.documento || '—'
  // Impresso compacto, sem caixas de correção: diferente do real, anota-se em Anotações, no fim da folha. O contato e o
  // documento com a largura do texto (o contato até 230 pt): não quebram de linha à toa
  const largura = (t: string, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.ceil(larguraTexto(t, { tamanho: FONTE_DADO })) + 2))
  return [
    ...(recado.length ? [grade(recado, ['*'])] : []),
    grade(
      [
        [
          previsto(pj ? 'Razão social' : 'Nome', { text: nome || '—', bold: true }),
          previsto('Contato no cliente', contato),
          previsto(pj ? 'CNPJ' : 'CPF', documento),
        ],
      ],
      ['*', largura(contato, 110, 200), largura(documento, 70, 110)],
      [0, 0, 0, 0],
      { semFioDeCima: recado.length > 0 },
    ),
    grade(
      [
        [
          endereco
            ? previsto(`Endereço da calibração${OBRIG}`, endereco, { span: 3 })
            : escrever(`Endereço da calibração${OBRIG}`, { span: 3 }),
          ondeFoi,
        ],
      ],
      ['*', '*', '*', ONDE],
      [0, 0, 0, 0],
      { semFioDeCima: true },
    ),
  ]
}

/**
 * A OS, quem e a hora de início, numa linha (≈ 6 mm), colada embaixo do cliente: a OS impressa do rascunho (cinza) ou,
 * sem ela, um campo para escrever (é o único lugar da OS na folha: não há faixa no alto das páginas); o técnico previsto
 * é só uma dica, embaixo do rótulo (quem foi de fato escreve o nome: é o que vai para o sistema). A data da calibração
 * não: ela fica uma vez só, no passo das assinaturas.
 */
function linhaChegada(ctx: Contexto): NoObjeto {
  const { d, k } = ctx
  const os = k?.ordemServico?.trim() ?? ''
  const tecnico = d.tecnico.trim()
  const celulas: Celula[] = [
    os ? previstoEmLinha('Nº da OS', { text: os, bold: true }) : campo('Nº da OS'),
    campo(`Técnico que executou${OBRIG}`, { dica: tecnico ? `previsto: ${tecnico}` : undefined }),
    campo('Hora de início', { formato: '____:____' }),
  ]
  return grade([celulas], [150, '*', 110], [0, 0, 0, 0], { semFioDeCima: true })
}

/**
 * A data da calibração prevista no rascunho (dd/mm/aaaa), só quando foi marcada para a frente (o rascunho nasce com a
 * data do dia); '' = nenhuma. Sai como dica no campo da data, no passo das assinaturas.
 */
function dataPrevista(ctx: Contexto): string {
  const { d, k } = ctx
  const impressoIso = d.impressoEm.slice(0, 10)
  return k?.dataCalibracao && k.dataCalibracao > impressoIso ? formatarDataBr(k.dataCalibracao) : ''
}

/** Colunas da grade da balança: cada rótulo numa linha só (medidos na letra dos rótulos). */
const LARGURAS_BALANCA = [58, 76, 64, 80, 84, '*']

/** Identificação da balança (passo 3), impressa do cadastro para conferir com a plaqueta (diferente, em Anotações). */
function gradeBalanca(b: Balanca): NoObjeto {
  const plataforma = [
    [b.plataformaFabricante, b.plataformaModelo].filter((x) => !vazio(x)).join(' '),
    vazio(b.plataformaSerie) ? '' : `nº${NBSP}${b.plataformaSerie.trim()}`,
  ]
    .filter(Boolean)
    .join(SEPARADOR)
  const faixas = faixasOrdenadas(b.faixas)
  const es = divisaoLegivel(
    faixas.map((f) => f.e),
    b.unidade,
  )
  const receptor = [
    (RECEPTORES[b.receptor] ?? b.receptor).replace(/ \(.*\)$/, ''),
    (b.receptor === 'APOIOS' || b.receptor === 'RODOVIARIA' || b.receptor === 'TANQUE') && b.apoios > 0
      ? `${b.apoios}${NBSP}apoios`
      : '',
    medidasSemQuebra(b.dimensoes.trim()),
  ]
    .filter(Boolean)
    .join(SEPARADOR)
  const multi = faixas.length > 1
  // Identificação e características metrológicas numa grade só, em três linhas: os rótulos longos ficam nas
  // colunas largas (cada um numa linha), e o que é mais longo (plataforma, portaria) ocupa duas colunas
  const c = (rotulo: string, valor: No): Celula => previsto(rotulo, valor)
  // Uma grade por linha, cada uma com as suas larguras (cada rótulo numa linha só; o que é longo, com mais largura)
  const linha = (celulas: Celula[], larguras: Array<number | string>, primeira = false) =>
    grade([celulas], larguras, primeira ? [0, ENTRE_GRADES, 0, 0] : [0, 0, 0, 0], { semFioDeCima: !primeira })
  return {
    stack: [
      linha(
        [
          c('Tipo de balança', TIPOS_BALANCA[b.tipo] ?? '—'),
          c('Fabricante (indicador)', b.fabricante || '—'),
          c('Modelo (indicador)', b.modelo || '—'),
          c('Nº de série (indicador)', { text: b.numeroSerie || '—', bold: true }),
          c('Identificação / TAG (*)', b.identificacao || '—'),
          c('Ano de fabricação', b.anoFabricacao || '—'),
        ],
        LARGURAS_BALANCA,
        true,
      ),
      linha(
        [
          c(
            multi
              ? b.tipoFaixas === 'MULTI_INTERVALO'
                ? 'Max × d (multi-intervalo)'
                : 'Max × d (múltiplas faixas)'
              : 'Capacidade × divisão',
            { text: medidasSemQuebra(capacidadeTexto(b)) || '—', bold: true },
          ),
          c('Carga mínima (Min)', b.min ? `${numeroBr(b.min)}${NBSP}${b.unidade}` : '—'),
          c('Classe de exatidão', ROTULO_CLASSE[b.classe]),
          c(
            'Divisão de verificação (e)',
            es.valores.length ? `${es.valores.map((x) => numeroBr(x)).join('/')}${NBSP}${es.unidade}` : '—',
          ),
        ],
        ['*', 96, 110, 120],
      ),
      linha(
        [
          c('Plataforma (marca, modelo, série)', plataforma || '—'),
          c('Portaria de aprovação de modelo', b.portariaAprovacao || '—'),
          c('Receptor de carga', receptor || '—'),
          c('Local de instalação (*)', b.localInstalacao || '—'),
        ],
        ['*', 160, 100, 110],
      ),
    ],
  }
}

/**
 * Identificação da balança na folha em branco: tudo para escrever ou marcar, com as faixas embaixo. O curto em campos
 * em linha (≈ 6,5 mm: o rótulo à esquerda e a escrita ao lado); o longo (plataforma, portaria, dimensões) com o rótulo
 * em cima. A unidade vai escrita com cada valor das faixas (Max, e, d) e com Min, ao lado delas, como na plaqueta.
 */
function gradeBalancaEmBranco(): NoObjeto[] {
  const lista = (xs: string[]) => xs.map((r) => ({ rotulo: r }))
  const op = { espaco: 7 }
  const linha = (celulas: Celula[], larguras: Array<number | string>, primeira = false) =>
    grade([celulas], larguras, primeira ? [0, ENTRE_GRADES, 0, 0] : [0, 0, 0, 0], { semFioDeCima: !primeira })
  const identificacao: NoObjeto = {
    stack: [
      linha([campo('Tipo de balança'), campo('Fabricante'), campo('Modelo'), campo('Nº de série')], ['*', '*', '*', '*'], true),
      linha(
        [campo('Identificação / TAG (*)'), campo('Local de instalação (*)'), campo('Ano de fabricação'), campo('Nº de apoios')],
        [150, '*', 104, 92],
      ),
      grade(
        [
          [
            escrever('Plataforma (fabricante, modelo, nº de série)'),
            escrever('Portaria de aprovação de modelo'),
            escrever('Dimensões do prato (sai no certificado)'),
          ],
        ],
        ['*', 150, 150],
        [0, 0, 0, 0],
        { semFioDeCima: true },
      ),
    ],
  }
  // Características metrológicas: as opções em linha (≈ 6 mm cada). Sem a classe I: a folha em branco não tem o ΔT
  // pesos − ar, o ajuste interno antes dos ensaios nem o zero antes de cada posição (método 3), que só saem na folha de
  // uma balança classe I cadastrada; a linha ao lado das classes diz isso, em duas linhas miúdas (a caixa não cresce),
  // numa coluna da largura delas, quebrando depois de "balança"
  const avisoClasseI = [
    { text: CLASSE_I, bold: true },
    { text: AVISO_CLASSE_I_EM_BRANCO.slice(CLASSE_I.length).replace('balança e ', 'balança\ne ') },
  ].map((x): NoObjeto => ({ ...x, fontSize: FONTE_DICA, lineHeight: 0.95, color: T.texto }))
  const metrologia: NoObjeto = {
    stack: [
      linha(
        [
          marcarEmLinha('Classe', lista(['II', 'III', 'IIII', 'não marcada']), {
            ...op,
            depois: avisoClasseI,
            larguraDepois: 138,
          }),
          marcarEmLinha('Faixas', lista(['única', 'multi-intervalo', 'múltiplas']), op),
        ],
        ['*', 196],
      ),
      // Sem "rodoviária": o POP não a cobre (a de uma rodoviária cadastrada sai impressa). O receptor define as
      // posições da excentricidade
      linha(
        [
          marcarEmLinha(
            'Receptor de carga',
            lista(['retangular / quadrado', 'prato redondo', 'mais de 4 apoios', 'gancho', 'tanque / silo']),
            op,
          ),
        ],
        ['*'],
      ),
    ],
  }
  // As faixas com o nome de cada coluna numa linha de cabeçalho própria (a unidade embaixo dele, em letra miúda): as três
  // faixas ficam inteiras para escrever; Min (uma só para a balança) numa caixa alta à direita, da altura das três
  const comUnidade = (titulo: string, largura: number | string): Coluna => ({ titulo, largura, nota: 'com a unidade' })
  const faixas = tabelaLeituras(
    [
      { titulo: '', largura: 62 },
      comUnidade('Capacidade (Max)', '*'),
      comUnidade('Divisão de verificação (e)', '*'),
      comUnidade('Divisão (d)', '*'),
      comUnidade('Carga mínima (Min)', 104),
    ],
    [1, 2, 3].map((i): CelulaTabela[] => [
      dica([{ text: `Faixa ${i}`, font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.texto }]),
      livre(),
      livre(),
      livre(),
      i === 1 ? { ...livre(), linhas: 3 } : coberta(),
    ]),
  )
  return [identificacao, metrologia, { ...faixas, margin: [0, ENTRE_GRADES, 0, 0] }]
}

function passoIdentificacao(ctx: Contexto, n: number, nBalanca: number): No[] {
  const { b } = ctx
  const outro = { n: nBalanca, titulo: 'Identificação da balança' }
  const sistema = e2(E.cliente, E.balanca)
  const continuacao = { n: nBalanca, titulo: outro.titulo, sistema: E.balanca }
  const texto: No = b
    ? [
        'Confira o cliente, o endereço e a plaqueta do ',
        { text: 'indicador', bold: true },
        // Onde ficam as Anotações (no fim da folha), a regra do alto da página 1 diz: aqui, só o nº dos passos
        ` (o mostrador). Diferente? Anote o certo em ${TITULO_ANOTACOES} (passo ${n} ou ${nBalanca}) e avise o cliente.`,
      ]
    : [
        'Preencha o cliente como sai no certificado e copie a plaqueta do ',
        { text: 'indicador', bold: true },
        ' (sem série: a TAG); cadastre a balança antes de digitar.',
      ]
  const cliente = [...gradesCliente(ctx), linhaChegada(ctx)]
  if (b)
    return passo(
      ctx,
      n,
      'Chegada ao cliente',
      sistema,
      texto,
      cliente,
      [{ parte: gradeBalanca(b), id: idParte(n, 1), titulo: continuacao }],
      { outro },
    )
  // Em branco: as partes da balança podem ir para a página seguinte, cada uma com o título do passo 3
  const [identificacao, metrologia, faixas] = gradeBalancaEmBranco()
  return passo(
    ctx,
    n,
    'Chegada ao cliente',
    sistema,
    texto,
    cliente,
    [
      { parte: { stack: [identificacao, metrologia] }, id: idParte(n, 1), titulo: continuacao },
      { parte: faixas, id: idParte(n, 2), titulo: continuacao },
    ],
    { outro },
  )
}

// ---- 4. Ambiente (no início e no fim) ----------------------------------------------------------------------

/** Instrumentos de ambiente previstos: com o plano, os que vão a campo (o termo-higrômetro escolhido). */
function instrumentosAmbiente(ctx: Contexto): Padrao[] {
  return (
    ctx.plano ? ctx.plano.padroes.filter((p) => p.naFolha).map((p) => p.padrao) : padroesPrevistos(ctx.k, ctx.d.padroes)
  ).filter((p) => p.tipo === 'TERMOHIGROMETRO' || p.tipo === 'BAROMETRO')
}

/**
 * Ambiente no início e no fim, numa tabela só (os campos da tela "Padrões e ambiente"): uma linha para cada
 * momento, com a hora, a temperatura, a umidade, a pressão e o instrumento usado (o previsto embaixo do título).
 * O fim é medido depois da excentricidade, no mesmo lugar e com o mesmo instrumento: a linha dele fica aqui,
 * embaixo da do início, para comparar. Balança classe I: a diferença de temperatura pesos − ar, na linha do início,
 * medida antes do 1º ensaio (a última medição, a que libera os ensaios). As dicas (o instrumento previsto, quando a
 * pressão é obrigatória, quando medir o ΔT e o limite dele) vão no cabeçalho, embaixo do título da coluna: as caixas
 * de escrever ficam livres.
 */
function tabelaAmbiente(ctx: Contexto): NoObjeto {
  const previstos = instrumentosAmbiente(ctx)
    .map((p) => p.identificacao)
    .join(', ')
  const classeI = ctx.b?.classe === 'I'
  // O ΔT é medido antes do 1º ensaio (POP 7.4.5: depois do aquecimento e da aclimatação), não na chegada; se a dica não
  // couber numa linha, quebra só depois do "·"
  const quandoDeltaT = `${semQuebra('antes do 1º ensaio ·')} ${semQuebra(`até ${numeroBr(ctx.plano?.limiteDeltaTPesos ?? 1)} °C`)}`
  const colunas: Coluna[] = [
    // O momento e quando, numa linha só ("Início  15 min após chegar"); cada título numa linha (na classe I, com
    // uma coluna a mais, as larguras medidas)
    { titulo: 'Ambiente', largura: classeI ? 84 : 92 },
    { titulo: 'Hora', largura: classeI ? 36 : 42, alinhamento: 'center' },
    { titulo: `Temperatura${OBRIG}`, unidade: '°C', largura: classeI ? 70 : '*' },
    // Na classe I, a umidade entra na densidade do ar (empuxo, cg-18 A1.1-1): obrigatória
    { titulo: classeI ? `Umidade${OBRIG}` : 'Umidade', unidade: '%', largura: '*' },
    // Obrigatória nas classes I e II, com o barômetro (POP 6.2); em branco (classes II a IIII), a classe ainda não é
    // conhecida: a dica diz que é obrigatória na II
    !ctx.b
      ? { titulo: 'Pressão', unidade: 'hPa', largura: '*', nota: `obrigatória na classe${NBSP}II` }
      : pressaoObrigatoria(ctx.b.classe)
        ? { titulo: `Pressão${OBRIG}`, unidade: 'hPa', largura: '*' }
        : { titulo: 'Pressão, opcional', unidade: 'hPa', largura: 90 },
    // Classe I: a diferença pesos − ar antes do 1º ensaio, com o termômetro de duas entradas (convecção, cg-18
    // 7.1.2.4), com o limite do POP 7.4 para os pesos previstos
    ...(classeI ? [{ titulo: `ΔT pesos − ar${OBRIG}`, unidade: '°C', largura: 74, nota: quandoDeltaT }] : []),
    {
      titulo: 'Instrumento usado',
      largura: classeI ? 70 : 112,
      ...(previstos ? { nota: `previsto: ${previstos}` } : {}),
    },
  ]
  const momento = (titulo: string, texto: string): CelulaTabela =>
    dica([
      { text: titulo, font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.texto },
      { text: `  ${texto}`, fontSize: 6.2 },
    ])
  return tabelaLeituras(
    colunas,
    [
      [momento('Início', '15 min após chegar'), livre(), livre(), livre(), livre(), ...(classeI ? [livre()] : []), livre()],
      [
        momento('Fim', `após o passo ${N.excentricidade}`),
        livre(),
        livre(),
        livre(),
        livre(),
        ...(classeI ? [pre('—', 'center')] : []),
        livre(),
      ],
    ],
    { altura: alturaLeitura(ctx, N.ambiente) },
  )
}

/**
 * O passo 4 é só o ambiente, sem instrução (a tabela diz quando medir): a balança chega em condição de uso (a que não
 * pesa certo não é calibrada; a manutenção é feita antes, à parte), e o que for diferente vai em Anotações, no fim da
 * folha.
 */
function passoAmbiente(ctx: Contexto, n: number): No[] {
  return passo(ctx, n, 'Ambiente', E.padroes, null, [tabelaAmbiente(ctx)])
}

/** Marca da linha "Continua na próxima página" (`avisoContinua`). */
const ID_CONTINUA = 'continua'

/**
 * Com os ensaios no verso (`Extras.ensaiosNoVerso`), a página do passo 4 acaba com espaço vazio embaixo: uma linha
 * discreta diz que a folha continua na próxima página, com os passos 5 a 8 e, no fim, as Anotações (o espaço vazio não
 * é o lugar de anotar).
 */
function avisoContinua(ctx: Contexto): No[] {
  if (!ctx.extras.ensaiosNoVerso || ctx.extras.semAvisoContinua || ctx.extras.semBlocos) return []
  return [
    {
      ...nota(
        [
          { text: 'Continua na próxima página', bold: true, color: T.texto },
          `: passos ${N.indicacao} a ${N.assinaturas} e, no fim da folha, ${TITULO_ANOTACOES}.`,
        ],
        [0, 5, 0, 0],
      ),
      id: ID_CONTINUA,
    },
    marca(`fim:${ID_CONTINUA}`),
  ]
}

// ---- 5. Erro de indicação ------------------------------------------------------------------------------------

const INSTRUCAO_METODO: Record<MetodoCarregamento, string> = {
  CRESCENTE_DECRESCENTE: 'suba até a maior ↑ e desça sem descarregar ↓',
  DESCONTINUO: 'retire tudo e confira o zero entre uma carga e outra',
  CONTINUO: 'vá somando os pesos, sem descarregar',
  DECRESCENTE: 'comece pela maior e vá retirando ↓',
}

/**
 * Métodos que a folha oferece, na ordem da tela: os que o sistema oferece (sem o "Decrescente", que não sobe as cargas;
 * ele só sai quando o rascunho já está com ele, um registro de antes).
 */
function metodosNaFolha(ctx: Contexto): MetodoCarregamento[] {
  const usaDecrescente = ctx.k?.indicacao?.metodo === 'DECRESCENTE' || ctx.plano?.metodo === 'DECRESCENTE'
  return metodosCarregamentoParaEscolher(usaDecrescente ? 'DECRESCENTE' : null)
}

/**
 * Classe I: o ajuste interno de rotina da balança analítica (CAL), feito antes dos ensaios, que o certificado declara.
 * Não é reparo nem ajuste durante a calibração (a balança que não pesa certo não é calibrada). Só na folha de uma
 * balança classe I (a em branco é das classes II a IIII).
 */
export const AJUSTE_INTERNO_CLASSE_I = 'Ajuste interno (CAL) feito antes dos ensaios'

/**
 * Como as cargas foram aplicadas (o campo da tela do erro de indicação, com o mesmo rótulo e as mesmas opções:
 * `metodosNaFolha`), com o previsto no sistema marcado, e, ao lado, a hora do início do ensaio. Fica com o título do passo (sozinha no alto de uma
 * página, a hora pareceria a da chegada). Classe I: em cima, numa linha, a caixa do ajuste interno de rotina (CAL)
 * feito antes dos ensaios, com a dica de onde ele é digitado, e a hora dele ao lado.
 */
function opcoesMetodo(ctx: Contexto): NoObjeto {
  const ajusteInterno: Celula[][] =
    ctx.b?.classe === 'I'
      ? [
          [
            marcarEmLinha('Classe I', [{ rotulo: AJUSTE_INTERNO_CLASSE_I }], {
              depois: [{ text: `rotina das analíticas, não é reparo · no sistema: ${E.balanca}`, fontSize: FONTE_DICA }],
            }),
            campo('Hora', { formato: '____:____' }),
          ],
        ]
      : []
  return grade(
    [
      ...ajusteInterno,
      [
        marcar(
          'Como as cargas foram aplicadas',
          metodosNaFolha(ctx).map((m) => ({ rotulo: METODOS_CARREGAMENTO[m].label, prevista: m === ctx.plano?.metodo })),
          { tamanho: 7.2, espaco: 8 },
        ),
        escrever('Início do ensaio', { formato: '____:____' }),
      ],
    ],
    ['*', 92],
    [0, 0, 0, 3],
  )
}

/**
 * Colunas ↑ e ↓ que o método previsto usa (como na tela: ↓ só em "crescente e decrescente"; só ↓ no
 * decrescente). A folha imprime sempre as duas, porque o método pode mudar no local: a que o método
 * previsto não usa sai mais estreita.
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
function pesosDaCarga(
  ctx: Contexto,
  c: { pesos: string; falta: number; excesso?: number },
  tamanho = 8,
  /** Largura útil da caixa (pt): a lista longa fica numa linha com a maior letra que cabe (até 7,4 pt; menos, quebra). */
  largura?: number,
): No {
  // A quantidade nunca quebra entre o número e a unidade
  const qtd = (v: number) => `${num(v, casasDecimais(v))} ${ctx.u}`.replace(/ /g, NBSP)
  const excesso = c.excesso ?? 0
  return {
    text: [
      // Sem nenhuma peça e faltando a carga inteira: só o que falta (uma linha)
      ...(c.pesos || !(c.falta > 0) ? [{ text: semQuebra(c.pesos) || '—' }] : []),
      ...(c.falta > 0 ? [{ text: `${c.pesos ? '\n' : ''}faltam ${qtd(c.falta)}`, bold: true, fontSize: 7 }] : []),
      ...(excesso > 0 ? [{ text: `\npassa ${qtd(excesso)} da carga`, bold: true, fontSize: 7 }] : []),
    ],
    fontSize:
      largura !== undefined
        ? (TAMANHOS_PESOS.find((t) => t <= tamanho && larguraTexto(semQuebra(c.pesos), { tamanho: t }) <= largura - 1) ?? 7.4)
        : c.pesos.length > 22
          ? Math.min(tamanho, 7.2)
          : tamanho,
  }
}

/** Tamanhos da letra da lista de pesos numa caixa de largura conhecida, do maior para o menor. */
const TAMANHOS_PESOS = [9, 8.6, 8.2, 7.8, 7.4]

/**
 * Linhas da tabela de pontos na folha em branco: o zero e mais 8 (0, Min, 25, 50, 75 e 100 % de Max e, na classe III,
 * 500e e 2000e; multi-intervalo com mais cargas: em Anotações, no fim da folha).
 */
const LINHAS_PONTOS_EM_BRANCO = 9

/** Respiro das colunas da tabela dos pontos: menor que o das outras tabelas, para a lista dos pesos caber numa linha. */
const RESPIRO_PONTOS = 2.5

/** Marca das linhas da tabela de pontos (a montagem acha a página de cada uma para dividir a tabela). */
const ID_LINHA_PONTOS = 'linha-pontos'

/** Tabela dos pontos de carga, em linhas: a montagem pode dividi-la entre as páginas. */
interface TabelaPontos {
  colunas: Coluna[]
  linhas: CelulaTabela[][]
}

/**
 * Tabela dos pontos de carga (pré-preenchida pelo plano, ou em branco): a carga, os pesos e as leituras ↑ e ↓, e
 * linhas de reserva. No fim, na própria tabela (nada fica solto no alto de outra página): o retorno ao zero. Peças
 * trocadas em relação às impressas (um 10 kg de outro jogo…) vão em Anotações, no fim da folha (a nota em cima da
 * tabela diz isso). Na folha em branco, os pesos de cada ponto são escritos na tabela.
 */
function tabelaPontos(ctx: Contexto, reserva: number): TabelaPontos {
  const { plano } = ctx
  const u = unidadeColuna(ctx)
  // Numa rodoviária, a coluna das substituições vai sempre: com a substituição no plano, o nível de cada ponto;
  // sem ela, o nível sugerido (os pesos previstos não chegam à carga) ou, se os pesos chegam a todas, para escrever
  const comSub = comSubstituicao(ctx)
  const sub = plano?.substituicao
  const subPrevista = !!sub && (sub.ativa || sub.sugerida)
  // A coluna que o método previsto não usa sai mais estreita (o método pode mudar no local); as leituras, largas
  // para a escrita à mão. Com as substituições (mais uma coluna), um pouco mais estreitas
  const { sobe, desce } = colunasIndicacao(plano ? plano.metodo : null)
  const larga = comSub ? 92 : 100
  const estreita = comSub ? 64 : 70
  const colunas: Coluna[] = [
    { titulo: 'Nº', largura: 13, alinhamento: 'center' },
    { titulo: 'Carga', unidade: u, largura: comSub ? 46 : 50, alinhamento: 'right' },
    ...(comSub
      ? [
          {
            titulo: 'Substi-\ntuições',
            largura: 34,
            alinhamento: 'center' as const,
            ...(sub?.sugerida ? { nota: 'sugeridas' } : {}),
          },
        ]
      : []),
    { titulo: comSub ? 'Pesos padrão por cima' : 'Pesos padrão', largura: '*' },
    // Em branco, a unidade só na coluna da carga: o cabeçalho das leituras numa linha
    { titulo: 'Indicação ↑', unidade: ctx.u || undefined, largura: sobe ? larga : estreita },
    { titulo: 'Indicação ↓', unidade: ctx.u || undefined, largura: desce ? larga : estreita },
  ]
  // Largura útil da coluna dos pesos (a que fica com o resto): a página menos as outras colunas, os respiros e os fios
  const fixas = colunas.reduce((soma, c) => soma + (typeof c.largura === 'number' ? c.largura : 0), 0)
  const fios = 2 * 0.8 + 0.5 * Math.max(0, colunas.length - 1)
  const larguraPesos = LARGURA - fixas - colunas.length * 2 * RESPIRO_PONTOS - fios
  const linhas: CelulaTabela[][] = []
  for (const [i, p] of (plano?.pontos ?? []).entries()) {
    const zero = !(p.carga > 0)
    const pesos: No = zero
      ? { text: 'sem carga (zero)', color: T.suave, fontSize: 7.6 }
      : pesosDaCarga(ctx, p, FONTE_DADO, larguraPesos)
    const carga: No = { text: cargaTexto(p.carga, p.d), bold: true }
    const cel: CelulaTabela[] = [nro(String(i + 1)), pre(carga, 'right')]
    if (comSub) cel.push(subPrevista ? pre(p.nivelSubstituicao > 0 ? `${p.nivelSubstituicao}` : '—', 'center') : livre())
    cel.push(pre(pesos), livre(), livre())
    linhas.push(cel)
  }
  const inicio = linhas.length
  // Em branco: o zero e mais 8 linhas (0, Min, 25, 50, 75 e 100 % de Max e, na classe III, 500e e 2000e)
  const total = plano ? reserva : LINHAS_PONTOS_EM_BRANCO
  for (let i = 0; i < total; i++) {
    const zeroEmBranco = !plano && i === 0
    const cel: CelulaTabela[] = [nro(plano ? '+' : String(inicio + i + 1))]
    cel.push(zeroEmBranco ? pre({ text: '0', bold: true }, 'right') : livre())
    if (comSub) cel.push(livre())
    cel.push(zeroEmBranco ? pre({ text: 'sem carga (zero)', color: T.suave, fontSize: 7.6 }) : livre())
    cel.push(livre(), livre())
    linhas.push(cel)
  }
  // No fim, o rótulo à esquerda (nas colunas da carga e dos pesos) e a escrita à direita, nas leituras
  const antesDasLeituras = 3 + (comSub ? 1 : 0)
  linhas.push([
    dica(
      [
        { text: 'RETORNO AO ZERO', font: 'InterMedio', fontSize: 6.6, characterSpacing: 0.3, color: T.texto },
        { text: '  sem carga', fontSize: 6.2 },
      ],
      antesDasLeituras,
    ),
    { ...livre(), span: 2 },
  ])
  return { colunas, linhas }
}

/**
 * Nota em cima dos pontos: pesos diferentes dos impressos vão em Anotações, no fim da folha, com o nº da linha; no multi-intervalo e nas
 * múltiplas faixas, a divisão de cada faixa (a carga sai nas casas da divisão dela).
 */
function notaPontos(ctx: Contexto): No[] {
  const b = ctx.b
  if (!ctx.plano) return []
  const divisoes: No[] =
    b && b.faixas.length > 1
      ? [
          { text: 'Divisão: ', bold: true, color: T.texto },
          faixasOrdenadas(b.faixas)
            .map((f) => `d = ${divisaoTexto(f.d, b.unidade)} até ${numeroBr(f.max)} ${b.unidade}`)
            .join(' · '),
          '. ',
        ]
      : []
  return [
    nota(
      [
        ...divisoes,
        { text: 'Pesos diferentes dos impressos: ', bold: true, color: T.texto },
        `${ONDE_ANOTAR}, com o nº da linha.`,
      ],
      [0, 0, 0, 3],
    ),
  ]
}

/** Linhas de pontos a partir das quais a tabela não cabe numa página com o título (precisa se dividir). */
const LINHAS_TABELA_INTEIRA = 22

/**
 * Linhas de reserva (ponto a mais, carga diferente): duas; uma quando a tabela já é longa (7 pontos); nenhuma
 * com 8 ou mais (com Min, a tabela ganha uma linha: o ponto a mais vai em Anotações, no fim da folha, como todo dado a
 * mais).
 */
const reservaDosPontos = (ctx: Contexto) => {
  const n = ctx.plano?.pontos.length ?? 0
  return n >= 8 ? 0 : n >= 7 ? 1 : 2
}

/** A tabela de pontos não cabe numa página com o título: precisa se dividir. */
const pontosLongos = (ctx: Contexto) =>
  (ctx.plano ? ctx.plano.pontos.length + reservaDosPontos(ctx) : LINHAS_PONTOS_EM_BRANCO) > LINHAS_TABELA_INTEIRA

/**
 * Linhas dos pontos (com a reserva e o retorno ao zero) e das etapas de substituição
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
  return s ? s.etapas : plano && temPesos ? ETAPAS_SUBSTITUICAO_RESERVA : ETAPAS_SUBSTITUICAO_EM_BRANCO
}

/**
 * Pontos e etapas de substituição do plano, preenchidos intercalados (ponto 3, etapa 1, ponto 4…), vão
 * juntos, na mesma página, quando cabem nela. Muitos pontos ou muitas etapas: as etapas vão depois, como outra
 * parte do passo (inteiras, elas sumiriam do PDF). Juntos, mas sem caber depois do título do passo (passariam
 * inteiros para a página seguinte, deixando esta quase vazia): a montagem tenta as etapas à parte
 * (`Extras.etapasAParte`), com os pontos na página do título.
 */
function pontosComEtapas(ctx: Contexto): boolean {
  if (!ctx.plano || !comSubstituicao(ctx) || ctx.extras.semBlocos || ctx.extras.etapasAParte) return false
  const pontos = ctx.plano.pontos.length + reservaDosPontos(ctx) + 1
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
function notaEtapas(margem: number[] = [0, 0, 0, 4], titulo = false, depois = false): NoObjeto {
  return nota(
    [
      ...(titulo
        ? [
            {
              text: `Cargas de substituição${depois ? ' (tabela das etapas depois da dos pontos)' : ''}: `,
              bold: true,
              color: T.texto,
            },
          ]
        : []),
      `${titulo ? 'em' : 'Em'} cada etapa, anote a indicação com os pesos padrão na plataforma; troque-os pela carga de substituição (caminhão, lastro) até a mesma indicação e anote de novo. `,
      { text: 'Só crescente', bold: true },
      ': para descer, seria preciso tirar o material.',
    ],
    margem,
  )
}

function passoIndicacao(ctx: Contexto, n: number): No[] {
  const { plano } = ctx
  const comSub = comSubstituicao(ctx)
  // Com as substituições na folha (rodoviária): para descer, seria preciso tirar o material
  const soCrescente: No[] = comSub ? [' Com cargas de substituição: ', { text: 'só crescente', bold: true }, '.'] : []
  // O método previsto vai marcado (PREVISTO) nas opções logo abaixo
  const texto: No = plano
    ? [
        'Zere vazia e aplique as cargas na ordem da tabela (',
        { text: INSTRUCAO_METODO[plano.metodo], bold: true },
        '); anote a indicação estável.',
        ...soCrescente,
      ]
    : [
        'Cargas: ',
        { text: '0, Min (se marcada), 25, 50, 75 e 100 % de Max', bold: true },
        ' e em 500e e 2000e (classe III). Zere, aplique e anote a indicação.',
        ...soCrescente,
      ]
  const t = tabelaPontos(ctx, reservaDosPontos(ctx))
  const total = t.linhas.length
  const tabela = (de: number, ate: number) =>
    tabelaLeituras(t.colunas, t.linhas.slice(de, ate), {
      idLinhas: ID_LINHA_PONTOS,
      primeiraLinha: de,
      respiro: RESPIRO_PONTOS,
      altura: alturaLeitura(ctx, N.indicacao),
    })
  // Pontos e etapas de substituição do plano na mesma página, quando cabem: são preenchidos intercalados.
  // Separadas dos pontos, as etapas podem ir para a página seguinte; muitas, se dividem.
  const junto = pontosComEtapas(ctx)
  // As etapas à parte (não couberam junto com os pontos): como fazê-las continua no alto, dizendo onde estão
  const aParte = !!ctx.extras.etapasAParte && comSub && !!plano
  const fim: No[] = junto ? [tabelaSubstituicao(ctx, { semNota: true })] : []
  const etapasLongas = linhasDasEtapas(ctx) > LINHAS_ETAPAS_INTEIRA
  const depois: Parte[] = [
    ...(comSub && !junto
      ? [
          etapasLongas
            ? { parte: tabelaSubstituicao(ctx, { semNota: aParte }), id: idParte(n, 9), partivel: true }
            : tabelaSubstituicao(ctx, { semNota: aParte }),
        ]
      : []),
  ]
  // O que se preenche (ou se lê) antes das tabelas fica com o título: o método e a hora do início e, com as
  // etapas juntas, como fazê-las. Quando as tabelas passam para a página seguinte, um aviso no pé desta diz onde
  // elas estão (medido na montagem)
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
  // A nota da tabela (pesos diferentes: em Anotações, no fim da folha) vem antes dela, com o método: a tabela, que pode
  // passar para a página seguinte, fica só com as linhas
  const cabeca: No[] = [
    opcoesMetodo(ctx),
    ...notaPontos(ctx),
    ...(junto || aParte ? [notaEtapas([0, 0, 0, 4], true, aParte)] : []),
    ...avisoPontos,
  ]
  const titulo = 'Erro de indicação'
  if (ctx.extras.semBlocos)
    // Montagem de segurança: a tabela se divide onde a página acaba (o cabeçalho se repete)
    return passo(ctx, n, titulo, E.indicacao, texto, [...cabeca, tabela(0, total), ...fim], depois)
  const medir = ctx.extras.medirPontos
  if (medir)
    // Só para a montagem medir onde a tabela longa se divide: o título e o método juntos, a tabela solta
    return [
      {
        ...inteiro([...topoDoPasso(n, titulo, E.indicacao, texto), ...cabeca]),
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
  // nesta, com o título de continuação; o título, a instrução e o método ficam na sobra desta página. Com os
  // ensaios no verso, o passo começa a página 2
  return passo(
    ctx,
    n,
    titulo,
    E.indicacao,
    texto,
    cabeca,
    [{ parte: { stack: [tabela(0, total), ...fim] }, id: ID_TABELA_PONTOS }, ...depois],
    { paginaNova: !!ctx.extras.ensaiosNoVerso },
  )
}

/**
 * Etapas de substituição para escrever, sem a substituição no plano: numa rodoviária sem pesos previstos, 4 (uma
 * rodoviária de 40 t com 10 t de pesos; mais etapas, em Anotações, no fim da folha); numa rodoviária cujos pesos
 * previstos chegam a todas as cargas, só a reserva. A folha em branco não leva as substituições (ver `comSubstituicao`).
 */
const ETAPAS_SUBSTITUICAO_EM_BRANCO = 4
const ETAPAS_SUBSTITUICAO_RESERVA = 2
/** Quanto as linhas das etapas são mais baixas que as outras de leitura (pt): ≈ 6 mm com a altura comum. */
const ETAPAS_MAIS_BAIXAS = 2

/**
 * Etapas das cargas de substituição (rodoviárias): a indicação com os pesos e com a substituição. Com a
 * substituição no plano (ou sugerida pela folha), as etapas que os pontos usam, com a carga de cada uma (uma etapa a
 * mais vai em Anotações, no fim da folha, como todo dado a mais); sem ela, as linhas e a carga de cada etapa para
 * escrever.
 */
function tabelaSubstituicao(ctx: Contexto, o: { semNota?: boolean } = {}): No {
  const { plano, u } = ctx
  const uc = unidadeColuna(ctx)
  const s = plano && (plano.substituicao.ativa || plano.substituicao.sugerida) ? plano.substituicao : null
  const linhas: CelulaTabela[][] = Array.from({ length: linhasDasEtapas(ctx) }, (_, i) => [
    nro(`${i + 1}ª`),
    s ? pre(numeroBr(s.carga), 'right') : livre(),
    livre(),
    livre(),
    livre(),
  ])
  return {
    stack: [
      subtitulo(
        s
          ? `Cargas de substituição${s.sugerida ? ' sugeridas' : ''} — ${numeroBr(s.carga)} ${u} de pesos padrão em cada etapa (${semQuebra(s.pesos) || '—'})${s.sugerida ? '; mude no local, se precisar' : ''}`
          : 'Cargas de substituição — quando os pesos levados não chegam às cargas dos pontos',
        [0, 6, 0, o.semNota ? 3.5 : 2],
      ),
      // Com os pontos e as etapas juntos, como fazê-las fica no alto do passo
      ...(o.semNota ? [] : [notaEtapas()]),
      // O cabeçalho numa linha só (cada título com a unidade cabe na sua coluna); as linhas um pouco mais baixas que
      // as dos pontos (≈ 6 mm: duas leituras e o material), para os pontos, as etapas e os ensaios caberem no verso
      tabelaLeituras(
        [
          { titulo: 'Etapa', largura: 30, alinhamento: 'center' },
          { titulo: 'Pesos padrão', unidade: uc, largura: 70, alinhamento: 'right' },
          { titulo: 'Indicação com os pesos', unidade: uc, largura: '*' },
          { titulo: 'Indicação com a substituição', unidade: uc, largura: '*' },
          { titulo: 'Material da substituição / obs.', largura: 136 },
        ],
        linhas,
        { altura: alturaLeitura(ctx, N.indicacao) - ETAPAS_MAIS_BAIXAS },
      ),
    ],
  }
}

// ---- 6. Repetibilidade ----------------------------------------------------------------------------------------

/**
 * Carga e pesos previstos de um ensaio (repetibilidade, excentricidade), impressos numa faixa de uma linha, e a
 * hora ao lado (≈ 6 mm, para escrever); outros pesos ou outra carga vão em Anotações, no fim da folha. Sem carga
 * prevista, os campos em linha para escrever.
 */
function cargaDoEnsaio(ctx: Contexto, c: CargaPlanejada | null, rotuloCarga: string, rotuloPesos: string): NoObjeto {
  const { u } = ctx
  if (!c || !(c.carga > 0))
    return grade(
      [
        [
          campo(`${rotuloCarga}${u ? ` (${u})` : ''}`),
          campo('Pesos ou carga usada', { span: 2 }),
          campo('Hora', { formato: '____:____' }),
        ],
      ],
      [132, '*', '*', 86],
    )
  // Impresso, numa faixa de uma linha: o rótulo e o valor lado a lado; a hora para escrever na linha
  const pesos = pesosDaCarga(ctx, c, FONTE_DADO) as NoObjeto
  const meio = { verticalAlignment: 'middle' }
  return {
    table: {
      widths: [128, '*', 86],
      body: [
        [
          {
            text: [
              rotulo(`${rotuloCarga} (${u})`),
              '  ',
              { text: cargaNaDivisao(ctx, c.carga), bold: true, fontSize: FONTE_DADO },
            ],
            fillColor: T.previsto,
            color: T.previstoTexto,
            ...meio,
          },
          {
            text: [rotulo(rotuloPesos), '  ', pesos],
            fillColor: T.previsto,
            color: T.previstoTexto,
            fontSize: FONTE_DADO,
            ...meio,
          },
          {
            text: [rotulo('Hora'), { text: '   ____:____', fontSize: 7.6, color: T.suave }],
            fillColor: '#FFFFFF',
            verticalAlignment: 'bottom',
          },
        ],
      ],
      heights: [ALTURA_LEITURA],
    },
    layout: LAYOUT_GRADE,
  }
}

/** Leituras de repetibilidade por faixa (a faixa horizontal da folha). */
const LEITURAS_POR_FAIXA = 6

/** Leituras da repetibilidade na folha em branco (classes II a IIII): 5 bastam; com 10, k = 2. */
const LEITURAS_EM_BRANCO = 10

/**
 * Leituras da repetibilidade: 6 (as previstas e uma a mais; com 10 leituras, k = 2, e as que não couberem vão em
 * Anotações, no fim da folha) ou, com mais leituras previstas (a classe I, com 10), o múltiplo de 6 que as cabe (duas
 * faixas).
 */
const linhasRepetibilidade = (leituras: number) =>
  Math.max(LEITURAS_POR_FAIXA, Math.ceil(leituras / LEITURAS_POR_FAIXA) * LEITURAS_POR_FAIXA)

/**
 * As leituras numa faixa horizontal: as colunas são as leituras, e as linhas, a indicação com a carga e o zero
 * depois de retirá-la (≈ 6 mm cada), com o nº de cada leitura numa linha miúda em cima delas (as caixas de escrever
 * ficam livres). Com mais de 6 leituras, mais uma faixa (7ª a 12ª), com os nº dela em cima.
 */
function faixasRepetibilidade(ctx: Contexto, total: number, previstas: number, carga: CargaPlanejada | null): NoObjeto {
  const uc = unidadeColuna(ctx)
  const comCarga = !!carga && carga.carga > 0
  const rotuloLinha = (titulo: string): CelulaTabela =>
    dica([
      { text: titulo, font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.texto },
      { text: ` (${uc})`, fontSize: FONTE_ROTULO },
    ])
  // O nº de cada leitura em cima da coluna; as que passam das previstas, "opcional". Em branco (sem a carga prevista;
  // classes II a IIII), quantas vezes vai nos nº: 5 (3 com 100 kg ou mais: a 4ª e a 5ª só abaixo disso); as outras,
  // opcionais (com 10, k = 2)
  const quando = (i: number) =>
    !comCarga && !ctx.plano
      ? i === 4 || i === 5
        ? ' · < 100 kg'
        : i > 5
          ? ' · opcional'
          : ''
      : i > previstas
        ? ' · opcional'
        : ''
  const faixas = total / LEITURAS_POR_FAIXA
  // Cada faixa: a linha dos nº, a da indicação com a carga e a do zero
  const nLinhas = faixas * 3
  // Sem a carga prevista (folha em branco), a carga, os pesos e a hora para escrever na coluna da esquerda, cada um na
  // sua caixa, com o rótulo no alto e o espaço de escrever embaixo dele (≥ 6,5 mm): a carga na linha dos nº e na de
  // baixo dela, os pesos nas do meio (duas linhas de escrita) e a hora, em linha, na última. Numa faixa só (3 linhas),
  // as três não cabem: vão numa linha de campos em cima das leituras, como na excentricidade
  const emCima = !comCarga && faixas === 1
  const caixaEscrever = (t: string, extra: string, linhas: number): CelulaTabela => ({
    ...dica([
      { text: t, font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.rotulo },
      { text: extra, fontSize: FONTE_DICA, color: T.suave },
    ]),
    linhas,
  })
  const esquerda = (r: number): CelulaTabela[] => {
    if (emCima) return []
    if (comCarga)
      return [r ? coberta() : { ...pre(celulaCarga(ctx, carga!, 'Carga', comoRepetir(ctx, previstas, carga!))), linhas: nLinhas }]
    if (r === 0) return [caixaEscrever('Carga aplicada', ` (${uc})`, 2)]
    if (r === 2) return [caixaEscrever('Pesos', ' (não precisa ser padrão)', nLinhas - 3)]
    if (r === nLinhas - 1)
      return [
        {
          ...dica([
            { text: 'Hora', font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.rotulo },
            { text: '   ____:____', fontSize: 7.6, color: T.suave },
          ]),
          vertical: 'bottom',
        },
      ]
    return [coberta()]
  }
  const linhas = Array.from({ length: faixas }, (_, f): CelulaTabela[][] => [
    [
      ...esquerda(3 * f),
      rotuloMiudo(''),
      ...Array.from({ length: LEITURAS_POR_FAIXA }, (_, j) => {
        const i = f * LEITURAS_POR_FAIXA + j + 1
        return rotuloMiudo(`${i}ª${quando(i)}`)
      }),
    ],
    [...esquerda(3 * f + 1), rotuloLinha('Com a carga'), ...Array.from({ length: LEITURAS_POR_FAIXA }, livre)],
    [...esquerda(3 * f + 2), rotuloLinha('Zero após retirar'), ...Array.from({ length: LEITURAS_POR_FAIXA }, livre)],
  ]).flat()
  const altura = alturaLeitura(ctx, N.repetibilidade)
  const tabela = tabelaSemCabecalho(
    [...(emCima ? [] : [comCarga ? 100 : 112]), 80, ...Array.from({ length: LEITURAS_POR_FAIXA }, () => '*')],
    linhas,
    // Fio mais forte entre as faixas (1ª a 6ª e 7ª a 12ª)
    (i) => i > 0 && i % 3 === 0,
    (i) => (i % 3 === 0 ? 'auto' : altura),
    (i) => i % 3 === 0,
  )
  return emCima
    ? { stack: [cargaDoEnsaio(ctx, null, 'Carga aplicada', 'Pesos'), { ...tabela, margin: [0, ENTRE_GRADES, 0, 0] }] }
    : tabela
}

/** Como fazer a repetibilidade de um ensaio, embaixo da carga: no centro, uma peça só (classe I), quantas vezes. */
function comoRepetir(ctx: Contexto, leituras: number, r: CargaPlanejada): No {
  const minimo = (r as PlanoFolha['repetibilidade'][number]).minimo
  return [
    ctx.b?.classe === 'I' ? 'uma peça só, no centro, ' : 'no centro, ',
    { text: `${leituras} vezes`, bold: true },
    minimo ? ` (mín.${NBSP}${minimo})` : '',
  ]
}

/** A carga prevista de um ensaio e os pesos dela, numa célula cinza (à esquerda das leituras). */
function celulaCarga(ctx: Contexto, c: CargaPlanejada, titulo: string, como?: No): NoObjeto {
  return {
    stack: [
      { text: [rotulo(`${titulo} (${ctx.u})`), '  ', { text: cargaNaDivisao(ctx, c.carga), bold: true, fontSize: FONTE_DADO }] },
      pesosDaCarga(ctx, c, FONTE_DADO),
      ...(como ? [{ text: como, fontSize: FONTE_DICA, color: T.instrucao, lineHeight: 0.98, margin: [0, 0.8, 0, 0] }] : []),
    ],
  }
}

function blocoRepetibilidade(ctx: Contexto, r: PlanoFolha['repetibilidade'][number] | null): No[] {
  // Em branco (classes II a IIII): 5 bastam, e até 10 (k = 2), em duas faixas: quantas vezes vai nos nº em cima das
  // caixas. Com a carga prevista, ela vai na primeira coluna; sem ela, a carga, os pesos e a hora para escrever, na
  // mesma coluna, cada um na sua caixa
  const n = r ? r.leituras : LEITURAS_EM_BRANCO
  return [faixasRepetibilidade(ctx, linhasRepetibilidade(n), n, r)]
}

/**
 * Mais de um ensaio (multi-intervalo e múltiplas faixas: um por intervalo, POP 7.9): uma tabela só, uma linha
 * dupla por ensaio (a carga, os pesos e a hora; as leituras com a carga e o zero depois de retirar), com a hora e o nº
 * de cada leitura numa linha miúda em cima de todas (as caixas de escrever ficam livres). Com muitas leituras previstas
 * (mais de 8 num ensaio), null: um bloco por ensaio.
 */
function tabelaRepetibilidades(ctx: Contexto, lista: PlanoFolha['repetibilidade']): No[] | null {
  const maior = Math.max(...lista.map((r) => r.leituras))
  if (maior > 8) return null
  const uc = unidadeColuna(ctx)
  const colunasLeitura = Math.max(LEITURAS_POR_FAIXA, maior)
  // Como o ensaio único: o nº, a carga, os pesos e quantas vezes na célula cinza à esquerda; a hora numa caixa ao lado
  const rotuloLinha = (titulo: string): CelulaTabela =>
    dica([
      { text: titulo, font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.texto },
      { text: ` (${uc})`, fontSize: FONTE_ROTULO },
    ])
  // "Opcional" só a leitura que passa das previstas em todos os ensaios (quantas vezes cada um está na célula da carga)
  const cabecalho: CelulaTabela[] = [
    rotuloMiudo(''),
    rotuloMiudo('Hora'),
    rotuloMiudo(''),
    ...Array.from({ length: colunasLeitura }, (_, j) => rotuloMiudo(`${j + 1}ª${j + 1 > maior ? ' · opcional' : ''}`)),
  ]
  const linhas = lista.flatMap((r, i): CelulaTabela[][] => [
    [
      { ...pre(celulaCarga(ctx, r, `${i + 1} · Carga`, comoRepetir(ctx, r.leituras, r))), linhas: 2 },
      { ...livre(), linhas: 2 },
      rotuloLinha('Com a carga'),
      ...Array.from({ length: colunasLeitura }, livre),
    ],
    [coberta(), coberta(), rotuloLinha('Zero após retirar'), ...Array.from({ length: colunasLeitura }, livre)],
  ])
  const altura = alturaLeitura(ctx, N.repetibilidade)
  return [
    tabelaSemCabecalho(
      [128, 34, 80, ...Array.from({ length: colunasLeitura }, () => '*')],
      [cabecalho, ...linhas],
      // Fio mais forte entre os ensaios
      (i) => i > 1 && (i - 1) % 2 === 0,
      (i) => (i === 0 ? 'auto' : altura),
      (i) => i === 0,
    ),
  ]
}

function passoRepetibilidade(ctx: Contexto, n: number): No[] {
  const { plano } = ctx
  const lista = plano?.repetibilidade ?? []
  const primeiro = lista[0]
  const varios = lista.length > 1
  const texto: No | null = !primeiro
    ? [{ text: 'Cerca de metade de Max', bold: true }, ' no centro: anote, retire e anote o zero; repita.']
    : // Com a carga prevista (um ensaio, ou um por intervalo na tabela compacta): o como (no centro, quantas vezes) vai
      // na célula da carga, ao lado das leituras
      null
  const compacta = varios ? tabelaRepetibilidades(ctx, lista) : null
  if (compacta) return passo(ctx, n, 'Repetibilidade', E.repetibilidade, texto, compacta)
  const blocos = lista.length ? lista.map((r) => blocoRepetibilidade(ctx, r)) : [blocoRepetibilidade(ctx, null)]
  // Vários ensaios com muitas leituras: um bloco por ensaio, com o nº dele
  if (varios)
    return passo(
      ctx,
      n,
      'Repetibilidade',
      E.repetibilidade,
      texto,
      [subtitulo('Ensaio 1', [0, 0, 0, 2]), ...blocos[0]],
      blocos.slice(1).map((b, i) => ({ stack: [subtitulo(`Ensaio ${i + 2}`, [0, 4, 0, 2]), ...b] })),
    )
  return passo(ctx, n, 'Repetibilidade', E.repetibilidade, texto, blocos[0])
}

// ---- 7. Excentricidade ------------------------------------------------------------------------------------------

/**
 * Como fazer a excentricidade, numa frase fixa (sem opções de marcar): nas classes II a IIII (e na folha em branco),
 * o método 1 (zera vazia e desloca a carga); na classe I, o método 3 (o zero antes de cada posição, o padrão do
 * sistema e do POP 7.10). O plano avisa antes de sair quando o sistema está com outro método.
 */
export const METODO_EXCENTRICIDADE_FOLHA = {
  classeI: 'Zere antes de cada posição',
  demais: 'Zere vazia e desloque a carga pelas posições',
} as const

/**
 * Largura (pt) do desenho das posições de um prato ou de uma plataforma: o desenho tem 128 de largura, com os nº das
 * posições em 7 e "FRENTE" em 5,8; com 112 pt, os nº ficam com ≈ 6,1 pt e "FRENTE" com ≈ 5,1 pt.
 */
const LARGURA_DESENHO = 112
/** Largura (pt) de cada desenho de referência da folha em branco (lado a lado): os nº com ≈ 6,7 pt e "FRENTE" com 5,5. */
const LARGURA_DESENHO_REFERENCIA = 122

/**
 * O passo 7 é um bloco só (o título, a instrução, a carga, o desenho e as leituras): o técnico vê a carga e o desenho
 * na página onde anota as leituras; se não couber na página, vai todo para a seguinte. `fim`: o que vai no mesmo bloco
 * (as assinaturas: nunca ficam sozinhas numa página).
 */
function passoExcentricidade(ctx: Contexto, n: number, fim: No[] = []): No[] {
  const { b, plano, u } = ctx
  const uc = unidadeColuna(ctx)
  const ecc = plano?.excentricidade
  if (ecc && !ecc.aplicavel) {
    return passo(ctx, n, 'Excentricidade', E.excentricidade, 'Ensaio previsto como não aplicável. Confirme no local.', [
      grade(
        [
          [
            previsto('Por que o ensaio não foi feito (sai no certificado)', ecc.motivo || '—'),
            marcar('Ensaio realizado', [{ rotulo: 'não', prevista: true }, { rotulo: `sim: anote ${ONDE_ANOTAR}` }]),
          ],
        ],
        ['*', 224],
      ),
      ...fim,
    ])
  }
  const classeI = b?.classe === 'I'
  const receptor = b?.receptor ?? 'RETANGULAR'
  // Em branco o receptor não é conhecido: a posição de cada coluna é escrita no local
  const rotulos = b ? (ecc?.posicoes.length ? ecc.posicoes : posicoesExcentricidade(receptor, b.apoios)) : []
  const diagrama = b ? diagramaExcentricidade(receptor, rotulos, -1, b.apoios, { frente: 'FRENTE' }) : null
  // Rodoviária, mais de 4 apoios e tanque: o desenho comprido à esquerda da tabela das posições; prato e plataforma:
  // o desenho e as posições na horizontal, lado a lado
  const comprido = receptor === 'RODOVIARIA' || receptor === 'APOIOS' || receptor === 'TANQUE'
  const larguraEsquerda = comprido
    ? receptor === 'RODOVIARIA'
      ? 236
      : 176
    : b
      ? LARGURA_DESENHO + 6
      : 2 * LARGURA_DESENHO_REFERENCIA + 6
  const comCarga = !!ecc && ecc.carga > 0
  // Desenho comprido: a coluna da esquerda (o desenho e, com a carga prevista, a caixa dela embaixo) não passa da
  // tabela das posições (`layoutComprido`): o passo 7 vai inteiro com o 8, e a sobra desceria o fim da folha
  const { larguraDiagrama, cargaNoDesenho: comCargaNoDesenho } = comprido
    ? layoutComprido(ctx, receptor, rotulos.length, diagrama, comCarga ? ecc! : null, larguraEsquerda)
    : { larguraDiagrama: LARGURA_DESENHO, cargaNoDesenho: false }
  const tabela = tabelaLeituras(
    [
      { titulo: 'Nº', largura: 15, alinhamento: 'center' },
      { titulo: 'Posição', largura: '*' },
      // O zero antes de cada posição só na classe I (método 3)
      ...(classeI ? [{ titulo: 'Zero antes', unidade: uc, largura: 70 }] : []),
      { titulo: 'Indicação', unidade: uc, largura: 76 },
    ],
    rotulos.map((r, i): CelulaTabela[] => [nro(String(i + 1)), pre(r), ...(classeI ? [livre()] : []), livre()]),
    { altura: alturaLeitura(ctx, N.excentricidade) },
  )
  // O método numa frase fixa, no começo da instrução; sem carga prevista, a regra da carga vai junto (a caixa da
  // carga fica livre para escrever). Prato e plataforma com a carga prevista (impressa na tabela das posições): a
  // instrução curta, na barra do título
  const metodo: NoObjeto = {
    text: classeI ? METODO_EXCENTRICIDADE_FOLHA.classeI : METODO_EXCENTRICIDADE_FOLHA.demais,
    bold: true,
  }
  const frente = '. Frente: indicador (se remoto, o de acesso).'
  const texto: No =
    b && !comprido && comCarga && !classeI
      ? [metodo, ', na ordem do desenho (frente: indicador).']
      : classeI
        ? [
            metodo,
            // Classe I: uma peça só, a meio raio (POP 7.11)
            comCarga
              ? ` e coloque ${numeroBr(ecc!.carga)} ${u} (uma peça só) a meio raio`
              : ' e coloque a carga (uma peça só) a meio raio',
            `, na ordem do desenho${comprido ? ' (nº do desenho = linha)' : ''}${frente}`,
          ]
        : [
            metodo,
            ...(comCarga ? [] : [' (carga: ', REGRA_CARGA_EXCENTRICIDADE, ')']),
            ', na ordem do desenho',
            // Em branco, a posição de cada coluna é escrita no local
            b
              ? `${comprido ? ' (nº do desenho = linha)' : ''}${frente}`
              : `; escreva a posição de cada coluna (mais de 4 apoios ou tanque: uma por apoio)${frente}`,
          ]
  const desenho: No = diagrama
    ? {
        svg: diagrama.svg,
        width: larguraDiagrama,
        height: (larguraDiagrama * diagrama.altura) / diagrama.largura,
        margin: [(larguraEsquerda - larguraDiagrama) / 2, 0, 0, 0],
      }
    : b
      ? { text: 'Desenhe as posições aqui', fontSize: 7, color: T.suave, margin: [0, 30, 0, 30] }
      : desenhosDeReferencia()
  // Desenho comprido com a carga prevista: a carga e os pesos embaixo do desenho, ao lado da tabela das posições, quando
  // cabem na altura dela (`layoutComprido`); senão, numa linha embaixo da instrução
  const cargaNoDesenho = comCargaNoDesenho ? cargaEmBaixoDoDesenho(ctx, ecc!) : null
  const corpo: No = comprido
    ? {
        columns: [
          {
            width: larguraEsquerda,
            margin: [0, 3, 10, 0],
            stack: [desenho, ...(cargaNoDesenho ? [cargaNoDesenho] : [])],
          },
          { width: '*', stack: [tabela], margin: [0, 3, 0, 0] },
        ],
      }
    : b
      ? // Prato e plataforma: o desenho e, ao lado, as posições na horizontal (uma coluna por posição, na ordem do
        // desenho)
        {
          columns: [
            { width: larguraEsquerda, stack: [desenho], margin: [0, 1, 0, 0] },
            {
              width: '*',
              stack: [posicoesNaHorizontal(ctx, rotulos, comCarga ? ecc! : null)],
              margin: [8, 0, 0, 0],
            },
          ],
        }
      : // Em branco: os desenhos de referência, lado a lado, e, ao lado deles, as posições para escrever, em duas faixas
        {
          columns: [
            { width: larguraEsquerda, stack: [desenho], margin: [0, 3, 0, 0] },
            { width: '*', stack: [posicoesEmBranco(ctx)], margin: [8, 3, 0, 0] },
          ],
          margin: [0, 0, 0, 3],
        }
  // A carga numa linha, embaixo da instrução, quando não está na tabela das posições (prato e plataforma) nem embaixo do
  // desenho (comprido); sem a carga prevista, os campos para escrever
  const cabeca: No[] =
    (b && !comprido && comCarga) || cargaNoDesenho ? [] : [cargaDoEnsaio(ctx, ecc ?? null, 'Carga usada', 'Pesos previstos')]
  return passo(ctx, n, 'Excentricidade', E.excentricidade, texto, [...cabeca, corpo, ...fim])
}

/** Altura de uma linha de texto na Inter (pt por pt de letra: o ascendente menos o descendente, sem entrelinha). */
const LINHA_INTER = 1.21
/** Altura da tabela das posições sem as linhas (pt): o cabeçalho (uma linha de 7 pt, o respiro e os fios). */
const CABECALHO_POSICOES = 0.8 + 1.1 + FONTE_ROTULO * 0.95 * LINHA_INTER + 0.8 + 0.9
/** Cada linha da tabela das posições, além da altura de escrever (pt): o respiro (1,5 + 1,5) e o fio. */
const ALEM_DA_LINHA = 3.5
/** Largura mínima do desenho do tanque e da plataforma com mais de 4 apoios (pt), quando ele encolhe para a tabela. */
const DESENHO_COMPRIDO_MINIMO = 120
/** Largura da coluna da hora na caixa da carga embaixo do desenho (pt). */
const COLUNA_HORA_DESENHO = 62

/**
 * Altura (pt) da caixa da carga embaixo do desenho comprido (`cargaEmBaixoDoDesenho`) numa coluna da largura dada: a
 * margem de cima, os fios, o respiro, a linha da carga e a lista dos pesos, que quebra entre as peças (" + "). Um
 * pouco acima da real (a decisão do layout não pode errar para menos).
 */
function alturaCargaEmBaixoDoDesenho(ctx: Contexto, c: CargaPlanejada, largura: number): number {
  const pesos = pesosDaCarga(ctx, c, FONTE_DADO) as NoObjeto
  const tamanho = Number(pesos.fontSize ?? FONTE_DADO)
  // A coluna do texto: a largura menos a da hora, o respiro (4 + 4 em cada uma) e os fios
  const util = largura - COLUNA_HORA_DESENHO - 16 - 2.1
  const rotuloPesos = larguraTexto('Pesos previstos  ', { fonte: 'InterMedio', tamanho: FONTE_ROTULO })
  let linhas = 1
  let ocupado = rotuloPesos
  for (const [i, peca] of semQuebra(c.pesos || '—')
    .split(' + ')
    .entries()) {
    const w = larguraTexto(`${i ? ' + ' : ''}${peca}`, { tamanho })
    if (ocupado + w > util && ocupado > 0) {
      linhas++
      ocupado = larguraTexto(peca, { tamanho })
    } else ocupado += w
  }
  // "faltam …" (7 pt), numa linha
  const extras = c.falta > 0 ? 1 : 0
  const texto = FONTE_DADO * LINHA_INTER + 1.5 + linhas * Math.max(tamanho, FONTE_ROTULO) * LINHA_INTER + extras * 7 * LINHA_INTER
  const hora = FONTE_ROTULO * 0.95 * LINHA_INTER + 4 + 7.6 * LINHA_INTER
  return 6 + 0.8 + 1.5 + Math.max(texto, hora) + 1.5 + 0.8 + 1
}

/**
 * O desenho comprido (rodoviária, mais de 4 apoios e tanque) ao lado da tabela das posições: a coluna da esquerda não
 * passa da altura da tabela, que é o passo (o 7 vai inteiro com o 8; a sobra desceria o fim da folha e tiraria as
 * Anotações, ou abriria uma página a mais). Com a carga prevista, a caixa dela vai embaixo do desenho quando cabe; no
 * tanque e na plataforma com mais de 4 apoios, o desenho encolhe para ela caber (até `DESENHO_COMPRIDO_MINIMO`); senão,
 * a carga vai numa linha embaixo da instrução (`cargaDoEnsaio`), e o desenho encolhe para a altura da tabela. A
 * rodoviária fica com o desenho inteiro (a tabela dela, com 6 posições ou mais, é a mais alta). A altura das linhas é
 * a de base (sem a folga de `comLinhasFolgadas`, que só aumenta a tabela): a escolha não muda entre as medidas.
 */
function layoutComprido(
  ctx: Contexto,
  receptor: Balanca['receptor'],
  posicoes: number,
  diagrama: { largura: number; altura: number } | null,
  carga: CargaPlanejada | null,
  larguraEsquerda: number,
): { larguraDiagrama: number; cargaNoDesenho: boolean } {
  const normal = receptor === 'RODOVIARIA' ? 196 : 168
  if (!diagrama) return { larguraDiagrama: normal, cargaNoDesenho: !!carga }
  const proporcao = diagrama.altura / diagrama.largura
  const tabela = CABECALHO_POSICOES + posicoes * (ALTURA_LEITURA + ALEM_DA_LINHA)
  const encolhe = receptor !== 'RODOVIARIA'
  // O desenho na altura dada (pt), entre o mínimo e o normal
  const naAltura = (altura: number) =>
    encolhe ? Math.max(DESENHO_COMPRIDO_MINIMO, Math.min(normal, Math.floor(altura / proporcao))) : normal
  const caixa = carga ? alturaCargaEmBaixoDoDesenho(ctx, carga, larguraEsquerda - 10) : 0
  if (carga) {
    const largura = naAltura(tabela - caixa)
    if (largura * proporcao + caixa <= tabela + 1) return { larguraDiagrama: largura, cargaNoDesenho: true }
    // A rodoviária com a lista longa: a carga em cima; o desenho inteiro
  }
  return { larguraDiagrama: naAltura(tabela), cargaNoDesenho: false }
}

/**
 * A carga prevista da excentricidade e os pesos dela (cinza) e a hora (para escrever), embaixo do desenho comprido
 * (rodoviária, mais de 4 apoios e tanque), na largura dele.
 */
function cargaEmBaixoDoDesenho(ctx: Contexto, c: CargaPlanejada): NoObjeto {
  return {
    table: {
      widths: ['*', COLUNA_HORA_DESENHO],
      body: [
        [
          {
            stack: [
              { text: [rotulo(`Carga usada (${ctx.u})`), '  ', { text: cargaNaDivisao(ctx, c.carga), bold: true }] },
              { text: [rotulo('Pesos previstos'), '  ', pesosDaCarga(ctx, c, FONTE_DADO)], margin: [0, 1.5, 0, 0] },
            ],
            fontSize: FONTE_DADO,
            color: T.previstoTexto,
            fillColor: T.previsto,
          },
          {
            stack: [
              rotulo('Hora'),
              { text: '____:____', fontSize: 7.6, color: T.suave, alignment: 'right', margin: [0, 4, 0, 0] },
            ],
            fillColor: '#FFFFFF',
          },
        ],
      ],
      dontBreakRows: true,
    },
    layout: LAYOUT_GRADE,
    margin: [0, 6, 0, 0],
  }
}

/** Rótulo de uma linha das posições na horizontal ("Indicação (kg)"). */
function rotuloLinhaPosicao(ctx: Contexto, titulo: string): CelulaTabela {
  return dica([
    { text: titulo, font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.texto },
    { text: ` (${unidadeColuna(ctx)})`, fontSize: FONTE_ROTULO },
  ])
}

/**
 * As posições da excentricidade na horizontal (prato e plataforma): a posição impressa no alto de cada coluna, na
 * ordem do desenho, e embaixo a indicação (na classe I, antes dela, o zero antes de cada posição), em linhas de
 * escrever.
 */
function posicoesNaHorizontal(ctx: Contexto, rotulos: string[], carga: CargaPlanejada | null): NoObjeto {
  const posicao = (r: string, i: number): CelulaTabela =>
    pre({ text: [{ text: `${i + 1}  `, font: 'InterMedio', fontSize: 7.6, color: T.rotulo }, { text: r }] })
  return tabelaSemCabecalho(
    [92, ...rotulos.map(() => '*')],
    [
      [
        carga
          ? pre(celulaCarga(ctx, carga, 'Carga'))
          : dica([{ text: 'Posição', font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.texto }]),
        ...rotulos.map(posicao),
      ],
      ...(ctx.b?.classe === 'I' ? [[rotuloLinhaPosicao(ctx, 'Zero antes'), ...rotulos.map(() => livre())]] : []),
      [rotuloLinhaPosicao(ctx, 'Indicação'), ...rotulos.map(() => livre())],
    ],
    (i) => i === 1,
    (i) => (i === 0 ? 'auto' : alturaLeitura(ctx, N.excentricidade)),
  )
}

/** Posições da excentricidade na folha em branco: 6 (os 5 do prato e até 6 apoios; mais apoios: em Anotações), 3 por faixa. */
const LINHAS_EXCENTRICIDADE_EM_BRANCO = 6
const POSICOES_POR_FAIXA = 3

/**
 * Folha em branco: as posições da excentricidade para escrever, em duas faixas (1 a 3 e 4 a 6), como a repetibilidade:
 * o nº de cada posição numa linha miúda em cima e, embaixo, a posição (escrita no local) e a indicação, em linhas de
 * escrever (as caixas ficam livres).
 */
function posicoesEmBranco(ctx: Contexto): NoObjeto {
  const faixas = LINHAS_EXCENTRICIDADE_EM_BRANCO / POSICOES_POR_FAIXA
  const linhas = Array.from({ length: faixas }, (_, f): CelulaTabela[][] => {
    const nos = Array.from({ length: POSICOES_POR_FAIXA }, (_, j) => f * POSICOES_POR_FAIXA + j + 1)
    return [
      [rotuloMiudo(''), ...nos.map((i) => rotuloMiudo(String(i)))],
      [
        dica([
          { text: 'Posição', font: 'InterMedio', fontSize: FONTE_ROTULO, color: T.texto },
          { text: '  escreva', fontSize: 6.2 },
        ]),
        ...nos.map(() => livre()),
      ],
      [rotuloLinhaPosicao(ctx, 'Indicação'), ...nos.map(() => livre())],
    ]
  }).flat()
  const altura = alturaLeitura(ctx, N.excentricidade)
  return tabelaSemCabecalho(
    [66, ...Array.from({ length: POSICOES_POR_FAIXA }, () => '*')],
    linhas,
    // Fio mais forte entre as faixas
    (i) => i > 0 && i % 3 === 0,
    (i) => (i % 3 === 0 ? 'auto' : altura),
    (i) => i % 3 === 0,
  )
}

/** Folha em branco: os desenhos do prato retangular e do redondo, lado a lado, como referência da ordem. */
function desenhosDeReferencia(): No {
  const lado = (receptor: 'RETANGULAR' | 'CIRCULAR', legenda: string): NoObjeto => {
    const d = diagramaExcentricidade(receptor, posicoesExcentricidade(receptor), -1, 4, { frente: 'FRENTE' })!
    const w = LARGURA_DESENHO_REFERENCIA
    return {
      width: w,
      stack: [
        { svg: d.svg, width: w, height: (w * d.altura) / d.largura },
        { text: legenda, fontSize: 6.6, color: T.suave, alignment: 'center', margin: [0, 1, 0, 0] },
      ],
    }
  }
  return { columns: [lado('RETANGULAR', 'retangular'), lado('CIRCULAR', 'redondo')], columnGap: 6 }
}

// ---- 8. Assinaturas e etiqueta ---------------------------------------------------------------------------------

/** Marca do fim do conteúdo (o nº de páginas e o espaço que sobra na última). */
const ID_FIM = 'fim-da-folha'

/**
 * Lembrete do ambiente do fim, na barra da nota do passo 8, logo acima das assinaturas: a temperatura do fim é
 * obrigatória para emitir, e a linha Fim fica na frente (passo 4), enquanto o serviço termina no verso.
 */
export const LEMBRETE_AMBIENTE_FIM = `Antes de assinar: preencha a linha Fim do passo ${N.ambiente}.`

/**
 * Nota do passo 8 (a barra embaixo do título): com o nº reservado (no título), a da etiqueta de calibração (o técnico
 * copia o nº do certificado na etiqueta que cola na balança, no fim do serviço; a validade fica para o cliente), numa
 * linha; sempre, em negrito, o lembrete curto do ambiente do fim (`LEMBRETE_AMBIENTE_FIM`), numa linha logo acima das
 * assinaturas.
 */
function notaAssinaturas(ctx: Contexto): NoObjeto {
  const lembrete: NoObjeto = { text: LEMBRETE_AMBIENTE_FIM, bold: true }
  return {
    table: {
      widths: ['*'],
      // Cada nota numa linha só (o nº está logo acima, no título do passo)
      body: [
        [{ text: ctx.certificado ? [AVISO_ETIQUETA, '\n', lembrete] : [lembrete], fontSize: 7, lineHeight: 1, color: T.texto }],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 2.2 : 0),
      vLineColor: () => T.texto,
      paddingLeft: () => 7,
      paddingRight: () => 0,
      paddingTop: () => 0.8,
      paddingBottom: () => 0.8,
    },
    margin: [0, 0, 0, 2],
  }
}

/** Espaço livre para a assinatura, embaixo do rótulo (≈ 10 mm). */
const LIVRE_ASSINATURA = 28

/**
 * O passo 8, no fim da folha: com o nº do certificado reservado, ele vai no título (na mesma linha) e a nota da
 * etiqueta de calibração embaixo; o lembrete do ambiente do fim (passo 4, na frente) sempre; depois, numa linha, o nome e a assinatura de quem executou (o previsto pode não
 * ser quem foi) e de quem acompanhou pelo cliente (ciente das condições, não dos resultados), a data da calibração (a
 * dos ensaios, a que vai na etiqueta e no certificado; a prevista, como dica) e a hora do fim. A data e a assinatura
 * só aqui: a folha não tem outra data para preencher, e o rodapé das páginas não tem rubrica. Vai no mesmo bloco da
 * excentricidade: as assinaturas nunca ficam sozinhas numa página.
 */
function blocoAssinaturas(ctx: Contexto, n: number): NoObjeto {
  const prevista = dataPrevista(ctx)
  const campos = grade(
    [
      [
        escrever('Técnico que executou — nome e assinatura', { livre: LIVRE_ASSINATURA }),
        escrever('Pelo cliente — nome, função e assinatura', {
          // "quem acompanhou;" não se separa: a dica quebra inteira para a linha de baixo, se não couber ao lado
          aoLado: `quem${NBSP}acompanhou; ciente das condições, não dos resultados`,
          livre: LIVRE_ASSINATURA,
        }),
        // A dica ocupa uma linha embaixo do rótulo: o espaço livre desconta essa linha (a caixa não cresce)
        escrever(`Data da calibração${OBRIG}`, {
          formato: '___/___/_____',
          dica: prevista ? `prevista: ${prevista}` : undefined,
          livre: prevista ? LIVRE_ASSINATURA - 7 : LIVRE_ASSINATURA,
        }),
        escrever('Hora de término', { formato: '____:____', livre: LIVRE_ASSINATURA }),
      ],
    ],
    [150, '*', 80, 64],
  )
  const etiqueta: No[] = ctx.certificado
    ? [
        {
          text: '   CERTIFICADO Nº ',
          font: 'InterMedio',
          bold: false,
          fontSize: 6.4,
          characterSpacing: 0.3,
          color: T.rotulo,
        },
        { text: ctx.certificado, characterSpacing: 0.2 },
      ]
    : []
  return {
    stack: [
      // Sem nº reservado (folha de antes desta versão, ou de uma revisão), não há o que copiar na etiqueta
      tituloPasso(n, ctx.certificado ? 'Assinaturas e etiqueta' : 'Assinaturas', e2(E.cliente, E.revisao), false, etiqueta),
      notaAssinaturas(ctx),
      campos,
    ],
    id: `passo-${n}`,
    margin: [0, 4, 0, 0],
  }
}

// ---- Anotações (no fim da folha) ------------------------------------------------------------------------------

/** Id do bloco Anotações (a montagem acha onde ele acabou pela marca `fim:anotacoes`). */
const ID_ANOTACOES = 'anotacoes'
/** Distância mínima entre as linhas das anotações (pt): ≈ 7 mm, para a escrita à mão (a caixa as reparte por igual). */
const ENTRE_LINHAS_ANOTACOES = 20
/**
 * Linhas mínimas no fim da última página; sem espaço para elas, o bloco vai sozinho para uma página a mais
 * (`comAnotacoes`).
 */
const MIN_LINHAS_ANOTACOES = 3
/** Respiro em cima do bloco (pt), como entre os passos. */
const ACIMA_ANOTACOES = 6
/** Altura do bloco sem a caixa das linhas (pt): o respiro de cima, a barra do título (9,8 + o fio), o respiro embaixo dela e o fio. */
const ALTURA_FIXA_ANOTACOES = ACIMA_ANOTACOES + 9.8 + 0.9 + 1.1 + 0.8
/** O que fica livre entre o pé do bloco e o rodapé (pt). */
const RESPIRO_PE_ANOTACOES = 4
/** Onde a caixa das Anotações acaba (pt, do alto): logo acima do rodapé, na mesma altura em toda folha. */
const PE_ANOTACOES = A4.altura - MARGEM_BASE - RESPIRO_PE_ANOTACOES
/**
 * Quanto a linha pontilhada fica acima do pé do seu espaço (pt): a de baixo não se confunde com o fio da caixa, e cada
 * espaço de escrever tem a sua linha (com 3 espaços, 3 linhas desenhadas).
 */
const RECUO_LINHA_ANOTACOES = 3.5

/** Linhas de escrever de uma caixa de anotações com a altura dada (pt): as de pelo menos ≈ 7 mm que cabem nela. */
const linhasDasAnotacoes = (altura: number) => Math.floor(altura / ENTRE_LINHAS_ANOTACOES + 1e-6)

/**
 * O bloco Anotações, a última coisa da folha (depois das assinaturas): o dado impresso diferente, as observações e as
 * anomalias, com o nº do passo, rubrica e data, à mão. Uma barra como a dos passos (sem nº: não é um passo do serviço)
 * e uma caixa até o pé da última página, repartida por igual em espaços de escrever (≈ 7 mm ou um pouco mais), cada um
 * com a sua linha pontilhada, um pouco acima do pé dele (`RECUO_LINHA_ANOTACOES`; a de baixo, logo acima do fio da
 * caixa). A altura da caixa é medida na montagem (`Extras.anotacoes`, `comAnotacoes`); sem espaço para as linhas mínimas
 * no fim da última página, o bloco abre uma página a mais (`paginaNova`). Sem medida (a definição fora da montagem),
 * nada.
 */
function blocoAnotacoes(ctx: Contexto): No[] {
  const altura = ctx.extras.anotacoes?.altura ?? 0
  const linhas = linhasDasAnotacoes(altura)
  if (linhas < 1) return []
  const h = altura / linhas
  const barra: NoObjeto = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: [
              { text: TITULO_ANOTACOES.toUpperCase() },
              {
                text: ` — ${DICA_ANOTACOES}`,
                font: 'Inter',
                bold: false,
                fontSize: FONTE_INSTRUCAO,
                characterSpacing: 0,
                color: T.instrucao,
              },
            ],
            font: 'InterMedio',
            bold: true,
            fontSize: 8.2,
            characterSpacing: 0.35,
            color: T.texto,
            margin: [0, 1.1, 0, 0],
          },
        ],
      ],
      heights: [9.8],
    },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 0.9 : 0),
      hLineColor: () => T.texto,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 1.1],
  }
  // A caixa com o fio das tabelas e, dentro dela, as linhas pontilhadas (cinza, para não brigar com a escrita)
  const pautas: NoObjeto = {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: LARGURA, h: altura, lineWidth: 0.8, lineColor: T.borda },
      ...Array.from({ length: linhas }, (_, i) => ({
        type: 'line',
        x1: 5,
        y1: (i + 1) * h - RECUO_LINHA_ANOTACOES,
        x2: LARGURA - 5,
        y2: (i + 1) * h - RECUO_LINHA_ANOTACOES,
        lineWidth: 0.7,
        lineColor: T.linha,
        dash: { length: 1.2, space: 2 },
      })),
    ],
  }
  const bloco: NoObjeto = { ...inteiro([barra, pautas]), id: ID_ANOTACOES, margin: [0, ACIMA_ANOTACOES, 0, 0] }
  // Na página a mais, a quebra vai num invólucro: o pdfmake não mede (`pageBreakBefore`) o nó que já a tem, e a montagem
  // acha o começo do bloco pelo id
  return [ctx.extras.anotacoes?.paginaNova ? { stack: [bloco], pageBreak: 'before' } : bloco, marca(`fim:${ID_ANOTACOES}`)]
}

// ---- Cabeçalho e rodapé ------------------------------------------------------------------------------------

/** Dica embaixo do nº do certificado, em toda página: a nota inteira da etiqueta está no passo das assinaturas. */
export const DICA_ETIQUETA = `Vai na etiqueta (passo ${N.assinaturas})`

/** Título do bloco do nº da folha, no alto de toda página. */
const TITULO_FOLHA = 'FOLHA DE CAMPO — CALIBRAÇÃO DE BALANÇA'
/** O fio entre o nº do certificado e o da folha, com as margens dele (pt). */
const LARGURA_FIO_NUMEROS = 0.6 + 2 * 11
/** Espaço mínimo (pt) entre a marca e os números no cabeçalho. */
const ESPACO_MARCA = 16

/**
 * Corpo dos dois nºs do alto da página (Poppins, 12,5 pt), numa linha só cada um: o pdfmake, na coluna 'auto',
 * às vezes passava a última letra para a linha de baixo (o nº partido, por cima do conteúdo). Os dois, o fio
 * entre eles e a marca cabem na largura: um nº longo (formato de numeração configurado) encolhe.
 */
function corposDosNumeros(ctx: Contexto): { certificado: number; folha: number } {
  const poppins = { fonte: 'Poppins' as const, tamanho: 12.5 }
  const titulo = larguraTexto(TITULO_FOLHA, { fonte: 'InterMedio', tamanho: 6.3, espacamento: 0.5 })
  const livre = LARGURA - larguraMarca(ctx.d.empresa) - ESPACO_MARCA
  if (!ctx.certificado) return { certificado: 12.5, folha: corpoQueCabe(ctx.d.numero.trim(), livre, poppins) }
  const folha = corpoQueCabe(ctx.d.numero.trim(), (livre - LARGURA_FIO_NUMEROS) / 2, poppins)
  const colunaFolha = Math.max(titulo, larguraTexto(ctx.d.numero.trim(), { ...poppins, tamanho: folha }))
  return { certificado: corpoQueCabe(ctx.certificado, livre - LARGURA_FIO_NUMEROS - colunaFolha, poppins), folha }
}

/**
 * Nº do certificado reservado, no alto de toda página, à esquerda do nº da folha e do mesmo tamanho (é o que o
 * técnico copia na etiqueta de calibração), com a dica da etiqueta embaixo, separado dele por um fio.
 */
function colunasCertificado(ctx: Contexto, corpo: number): NoObjeto[] {
  if (!ctx.certificado) return []
  return [
    {
      width: 'auto',
      alignment: 'right',
      margin: [0, -1.5, 0, 0],
      lineHeight: 1,
      stack: [
        { text: 'CERTIFICADO Nº', font: 'InterMedio', fontSize: 6.3, characterSpacing: 0.5, color: COR.marcaTexto },
        {
          text: ctx.certificado,
          noWrap: true,
          font: 'Poppins',
          fontSize: corpo,
          lineHeight: 0.8,
          color: TIMBRADO.texto,
          margin: [0, -1.5, 0, 0],
        },
        { text: DICA_ETIQUETA, fontSize: 7, color: TIMBRADO.secundario, margin: [0, 4.6, 0, 0] },
      ],
    },
    {
      width: 'auto',
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 0, y2: 32, lineWidth: 0.6, lineColor: T.linhaClara }],
      margin: [11, -1, 11, 0],
    },
  ]
}

function cabecalho(ctx: Contexto) {
  const numero = ctx.d.numero.trim()
  const corpos = corposDosNumeros(ctx)
  // Um nó novo a cada página: o pdfmake reaproveita o nó do cabeçalho e guardaria as posições
  return (pagina: number, total: number): NoObjeto => ({
    margin: [MARGEM_X, TOPO_CABECALHO, MARGEM_X, 0],
    stack: [
      {
        columns: [
          ...colunasMarca(ctx.d.empresa),
          ...colunasCertificado(ctx, corpos.certificado),
          {
            width: 'auto',
            alignment: 'right',
            margin: [0, -1.5, 0, 0],
            lineHeight: 1,
            stack: [
              {
                text: TITULO_FOLHA,
                font: 'InterMedio',
                fontSize: 6.3,
                characterSpacing: 0.5,
                color: COR.marcaTexto,
              },
              numero
                ? {
                    text: numero,
                    noWrap: true,
                    font: 'Poppins',
                    fontSize: corpos.folha,
                    lineHeight: 0.8,
                    color: TIMBRADO.texto,
                    margin: [0, -1.5, 0, 0],
                  }
                : { text: 'Nº ________________', fontSize: 9, color: TIMBRADO.secundario, margin: [0, 1, 0, 0] },
              { text: `Página ${pagina} de ${total}`, fontSize: 7, color: TIMBRADO.secundario, margin: [0, 4.6, 0, 0] },
            ],
          },
        ],
      },
    ],
  })
}

function rodape(ctx: Contexto) {
  const f = FORMULARIO_FOLHA_CAMPO
  const { impresso, d } = ctx
  const pop = referenciaDoFormulario(d.procedimento)
  const quem = [
    impresso ? `Impressa em ${impresso.data}, às ${impresso.hora}` : 'Impressa',
    vazio(d.impressoPor) ? '' : ` por ${d.impressoPor.trim()}`,
  ].join('')
  // Sem rubrica nem data: a data e a assinatura ficam só no passo das assinaturas
  return (): NoObjeto => ({
    margin: [MARGEM_X, BASE_RODAPE - 19.5 - (A4.altura - MARGEM_BASE), MARGEM_X, 0],
    stack: [
      {
        text: [
          { text: `${f.codigo} rev. ${f.revisao}`, bold: true, color: TIMBRADO.texto },
          // O POP configurado (sem ele, nada): a folha é o registro do procedimento em uso
          ...(pop ? [' · ', { text: pop, color: TIMBRADO.texto }] : []),
          ' · registro de dados brutos (ISO/IEC 17025, 7.5)',
        ],
      },
      { text: `${quem} · não é certificado de calibração` },
    ],
    fontSize: 6.2,
    lineHeight: 1.25,
    color: TIMBRADO.secundario,
  })
}

// ---- Documento -------------------------------------------------------------------------------------------------

/** Definição do documento do pdfmake (exportada para os testes). */
export function definicaoFolhaCampo(d: DadosFolhaCampo, o: { extras?: Extras } = {}): NoObjeto {
  const ctx = contexto(d, o.extras)
  const conteudo: No[] = [
    ...introducao(),
    ...passoPadroes(ctx, N.padroes),
    ...passoIdentificacao(ctx, N.chegada, N.balanca),
    ...passoAmbiente(ctx, N.ambiente),
    // Com os ensaios no verso, a frente acaba aqui: a linha que diz que a folha continua
    ...avisoContinua(ctx),
    ...passoIndicacao(ctx, N.indicacao),
    ...passoRepetibilidade(ctx, N.repetibilidade),
    // O passo 8 (assinaturas) no mesmo bloco da última parte do 7
    ...passoExcentricidade(ctx, N.excentricidade, [blocoAssinaturas(ctx, N.assinaturas)]),
    // Por último, as Anotações, até o pé da última página (medidas na montagem)
    ...blocoAnotacoes(ctx),
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
      keywords: [
        'folha de campo',
        d.numero,
        ctx.certificado ? `certificado ${ctx.certificado}` : '',
        FORMULARIO_FOLHA_CAMPO.codigo,
        referenciaDoFormulario(d.procedimento),
        FORMULARIO_FOLHA_CAMPO.referencia,
      ]
        .filter(Boolean)
        .join('; '),
      creator: 'BC Calibração',
      producer: 'BC Calibração',
      creationDate: quando,
      modDate: quando,
    },
    header: cabecalho(ctx),
    footer: rodape(ctx),
    background: fundoTimbrado(MARGEM_X, LARGURA),
    content: conteudo,
    defaultStyle: { font: 'Inter', fontSize: 8.4, lineHeight: 1, color: T.texto },
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

/** Linhas mínimas no primeiro pedaço da tabela de pontos dividida (menos que isso: ela começa na página seguinte). */
const MIN_LINHAS_INICIO = 4
/** Linhas mínimas no último pedaço: pelo menos dois pontos, as linhas de reserva e a do retorno ao zero. */
const minLinhasFim = (ctx: Contexto) => 3 + (ctx.plano ? reservaDosPontos(ctx) : 0)

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

/**
 * A tabela dividida ficou como medido: o primeiro pedaço na página do título do passo (a do fim dele: o começo
 * de um bloco que passou inteiro para a página seguinte fica registrado na de antes) e cada pedaço seguinte
 * inteiro na sua.
 */
function cortesConferem(m: Medida, cortes: number[]): boolean {
  const titulo = m.marcas.get(`fim:passo-${N.indicacao}`)
  if (!titulo) return false
  const paginas = paginasDasLinhas(m)
  const limites = [0, ...cortes, paginas.length]
  return limites.slice(1).every((ate, j) => paginas.slice(limites[j], ate).every((p) => p === titulo.pagina + j))
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
 * Os pontos e as etapas de substituição (juntos) passaram inteiros para a página seguinte, deixando a do
 * título do passo 5 quase vazia (rodoviária com muitos pontos e etapas, depois de um passo 4 longo): monta de
 * novo com as etapas à parte (`Extras.etapasAParte`), os pontos na página do título e as etapas depois, com o
 * título de continuação se abrirem a página. Fica assim se os pontos couberam lá e a folha não ganhou página.
 */
async function comEtapasAParte(d: DadosFolhaCampo, m: Medida): Promise<Medida> {
  if (m.extras.etapasAParte || !m.extras.continuacoes.includes(ID_TABELA_PONTOS) || !pontosComEtapas(contexto(d, m.extras)))
    return m
  const r = await comContinuacoes(d, await medir(d, { ...m.extras, etapasAParte: true, continuacoes: [] }))
  const pontosNaPagina = !r.extras.continuacoes.includes(ID_TABELA_PONTOS)
  return pontosNaPagina && r.paginas <= m.paginas && continuacoesExatas(r) && r.faltando.length <= m.faltando.length ? r : m
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
 * Linhas das Anotações que cabem no fim da folha montada (sem elas): do fim do conteúdo até o pé da última página
 * (`alturaDasAnotacoes`).
 */
const linhasNoFim = (m: Medida) => linhasDasAnotacoes(alturaDasAnotacoes(m))

/**
 * Altura (pt) da caixa das Anotações no fim da folha montada sem elas: do fim do conteúdo (as assinaturas) até o pé da
 * última página, sem a barra do título e o respiro de cima (a mesma distância do rodapé em toda folha).
 */
function alturaDasAnotacoes(m: Medida): number {
  const fim = m.marcas.get(ID_FIM)
  if (!fim) return 0
  return Math.floor((PE_ANOTACOES - fim.topo - ALTURA_FIXA_ANOTACOES) * 4) / 4
}

/**
 * O passo 5 dividido (o título e o método no pé de uma página e a tabela dos pontos inteira na seguinte): monta de novo
 * com o passo começando na página seguinte (na folha de 2 páginas, os ensaios no verso: `Extras.ensaiosNoVerso`), com o
 * título, o método e a tabela juntos. Fica assim se a folha continua com as mesmas páginas, nada some, nenhuma parte
 * fica sem título e as Anotações, no fim, ainda ficam com as linhas mínimas (ou também não ficavam sem isso); senão,
 * como estava (a tabela inteira na página seguinte, com o aviso no pé desta). O passo 5 que cabe inteiro na página do
 * título (com a tabela) fica nela: na folha de 2 páginas, a frente fica cheia e as Anotações, no fim do verso, maiores.
 */
async function comEnsaiosNoVerso(d: DadosFolhaCampo, m: Medida): Promise<Medida> {
  const titulo = m.marcas.get(`passo-${N.indicacao}`)
  if (m.extras.semBlocos || m.extras.cortes.length || !titulo || !m.extras.continuacoes.includes(ID_TABELA_PONTOS)) return m
  const verso = { ...m.extras, ensaiosNoVerso: true, avisoPontos: false, etapasAParte: false, continuacoes: [] }
  let r = await comContinuacoes(d, await medir(d, verso))
  // A linha "Continua na próxima página" fica na página do passo 4 (sem lugar para ela, sai)
  const aviso = r.marcas.get(`fim:${ID_CONTINUA}`)
  if (aviso && aviso.pagina !== r.marcas.get(`fim:passo-${N.ambiente}`)?.pagina)
    r = await comContinuacoes(d, await medir(d, { ...verso, semAvisoContinua: true }))
  const fim = r.marcas.get(`fim:passo-${N.indicacao}`)
  const juntos = !!fim && fim.pagina > titulo.pagina && !r.extras.continuacoes.includes(ID_TABELA_PONTOS)
  if (!juntos || r.paginas !== m.paginas || !continuacoesExatas(r) || r.faltando.length) return m
  return linhasNoFim(r) >= MIN_LINHAS_ANOTACOES || linhasNoFim(m) < MIN_LINHAS_ANOTACOES ? r : m
}

/**
 * Monta a folha medindo onde cada bloco ficou: (1) a parte de um passo que abre uma página ganha o título
 * do passo com "(continuação)" — remontando até nenhuma parte ficar solta; (2) a tabela de pontos longa
 * (maior que uma página) se divide entre as páginas (conferido montando de novo); os pontos e as etapas de
 * substituição que passaram juntos para a página seguinte se separam (os pontos ficam na página do título,
 * `comEtapasAParte`) e, quando a tabela inteira ainda passou para a página seguinte, o pé da página do título
 * avisa onde ela está, ou o passo inteiro vai para a página seguinte (`comEnsaiosNoVerso`); (3) com espaço sobrando,
 * as linhas de leitura ficam mais altas (`comLinhasFolgadas`) e (4) o que ainda sobra no fim da última página vira o
 * bloco Anotações (`comAnotacoes`). Nada pode sumir: se um bloco inteiro foi descartado (mais alto que a página), a
 * folha é montada de novo sem os blocos inteiros (`Extras.semBlocos`: só o título e a instrução de cada passo ficam
 * juntos, e nada mais alto que uma página fica inteiro); se ainda assim faltar algo, erro, antes de guardar o PDF.
 */
export async function montar(d: DadosFolhaCampo): Promise<Medida> {
  let m = await montarCom(d, SEM_EXTRAS)
  // Um bloco que cabia no pé da página por uma fração de ponto sumiu: empurrado, ele passa para a seguinte
  for (let i = 0; i < 3 && m.faltando.length; i++)
    m = await montarCom(d, { ...SEM_EXTRAS, folgas: [...new Set([...(m.extras.folgas ?? []), ...m.faltando])] })
  if (!m.faltando.length) return comAnotacoes(d, await comLinhasFolgadas(d, m))
  const seguro = await montarCom(d, { ...SEM_EXTRAS, semBlocos: true })
  if (!seguro.faltando.length) return comAnotacoes(d, seguro)
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
  return comEnsaiosNoVerso(d, await comAvisoDosPontos(d, await comEtapasAParte(d, m)))
}

/** Altura útil da página (pt): da margem de cima (embaixo do timbrado) à de baixo (o rodapé). */
const ALTURA_UTIL = A4.altura - MARGEM_BASE - MARGEM_TOPO
/** Até onde as linhas de leitura mais altas podem encher a página (fração da altura útil): fica um respiro embaixo. */
const PREENCHIMENTO_MAXIMO = 0.88
/**
 * Até onde as linhas de leitura mais altas podem encher a última página (pt, do alto): fica o espaço das Anotações com
 * as linhas mínimas (e 1,5 pt de folga para a medida).
 */
const LIMITE_COM_ANOTACOES = PE_ANOTACOES - ALTURA_FIXA_ANOTACOES - MIN_LINHAS_ANOTACOES * ENTRE_LINHAS_ANOTACOES - 1.5
/** O máximo que uma linha de leitura ganha (pt): com o padding e o fio, ≈ 8,8 mm (25 pt). */
const FOLGA_MAXIMA = 6
/** Folga de prova (pt): montada com ela, a folha diz quantas linhas de leitura cada página tem. */
const FOLGA_DE_PROVA = 2

/** Onde o conteúdo de cada página acaba (pt, do alto): a marca do fim de bloco mais baixa nela (sem as Anotações). */
function finsDasPaginas(m: Medida): number[] {
  const fins: number[] = Array(m.paginas).fill(MARGEM_TOPO)
  for (const [id, x] of m.marcas)
    if ((id.startsWith('fim:') || id === ID_FIM) && id !== `fim:${ID_ANOTACOES}` && x.pagina >= 1 && x.pagina <= m.paginas)
      fins[x.pagina - 1] = Math.max(fins[x.pagina - 1], x.topo)
  return fins
}

/**
 * Página das linhas de leitura de cada passo (`PASSOS_COM_LEITURA`): a do fim do bloco do passo; no passo 5, a da
 * tabela dos pontos (que pode ir para a página seguinte à do título).
 */
function paginasDasLeituras(m: Medida): Partial<Record<number, number>> {
  const pagina = (id: string) => m.marcas.get(`fim:${id}`)?.pagina
  return Object.fromEntries(
    PASSOS_COM_LEITURA.map((n) => [
      n,
      n === N.indicacao ? (pagina(ID_TABELA_PONTOS) ?? pagina(`passo-${n}`)) : pagina(`passo-${n}`),
    ]),
  )
}

/** Página de cada passo e das linhas de leitura, para conferir que uma montagem não mudou a arrumação da outra. */
const arrumacao = (m: Medida) =>
  JSON.stringify([
    Object.values(N).map((n) => m.marcas.get(`fim:passo-${n}`)?.pagina),
    paginasDasLeituras(m),
    m.paginas,
    m.marcas.get(`fim:${ID_CONTINUA}`)?.pagina,
  ])

/**
 * Folha de 2 páginas com espaço sobrando: as linhas de leitura ganham altura (`Extras.folgaLeitura`), sem conteúdo
 * novo. Cada página com espaço (abaixo de `PREENCHIMENTO_MAXIMO` da altura útil; a última, sem tirar as linhas mínimas
 * das Anotações: `LIMITE_COM_ANOTACOES`) ganha a folga que a enche até o limite, no máximo `FOLGA_MAXIMA`, e cada passo,
 * a da página das linhas dele; a página cheia fica como está. Uma montagem com a folga de prova mede quanto cada página
 * cresce por ponto de folga (as linhas de leitura dela); se a prova muda a arrumação (um bloco passa para a página
 * seguinte), mede página por página. Fica assim se a folha continua igual (as mesmas páginas, cada passo na sua, nada
 * some, as continuações certas) e sem passar do limite; senão, tenta com a metade e, por fim, fica como estava.
 */
async function comLinhasFolgadas(d: DadosFolhaCampo, m: Medida): Promise<Medida> {
  if (m.paginas !== 2 || m.extras.semBlocos || m.extras.cortes.length) return m
  const paginas = paginasDasLeituras(m)
  if (PASSOS_COM_LEITURA.some((n) => !paginas[n])) return m
  const antes = arrumacao(m)
  const base = finsDasPaginas(m)
  const preenchimento = MARGEM_TOPO + PREENCHIMENTO_MAXIMO * ALTURA_UTIL
  const limites = base.map((_, i) => (i === m.paginas - 1 ? Math.min(preenchimento, LIMITE_COM_ANOTACOES) : preenchimento))
  const passosDas = (ps: number[]) => PASSOS_COM_LEITURA.filter((n) => ps.includes(paginas[n]!))
  const comEspaco = base.flatMap((x, i) => (limites[i] - x >= 1 && passosDas([i + 1]).length ? [i + 1] : []))
  // Quanto cada página cresce por ponto de folga, medido com a folga de prova nos passos das páginas dadas
  const crescimento: number[] = base.map(() => 0)
  const medirCrescimento = async (ps: number[]) => {
    const prova = await medir(d, {
      ...m.extras,
      folgaLeitura: Object.fromEntries(passosDas(ps).map((n) => [n, FOLGA_DE_PROVA])),
    })
    if (arrumacao(prova) !== antes) return false
    const fins = finsDasPaginas(prova)
    for (const p of ps) crescimento[p - 1] = (fins[p - 1] - base[p - 1]) / FOLGA_DE_PROVA
    return true
  }
  if (!comEspaco.length) return m
  if (!(await medirCrescimento(comEspaco)))
    if (comEspaco.length === 1) return m
    else for (const p of comEspaco) await medirCrescimento([p])
  const folgaDaPagina = base.map((x, i) =>
    crescimento[i] > 0 ? Math.max(0, Math.min(FOLGA_MAXIMA, Math.floor(((limites[i] - x) / crescimento[i]) * 4) / 4)) : 0,
  )
  for (const fracao of [1, 0.5]) {
    const folgaLeitura = Object.fromEntries(
      PASSOS_COM_LEITURA.map((n) => [n, folgaDaPagina[paginas[n]! - 1] * fracao]).filter(([, f]) => f > 0),
    )
    if (!Object.keys(folgaLeitura).length) break
    const r = await medir(d, { ...m.extras, folgaLeitura })
    // A página que já passava do limite (sem folga) não pode crescer
    const cabem = arrumacao(r) === antes && finsDasPaginas(r).every((x, i) => x <= Math.max(limites[i], base[i]) + 1)
    if (cabem && !r.faltando.length && continuacoesExatas(r)) return r
  }
  return m
}

/**
 * O espaço que sobra no fim da folha, depois das assinaturas, vira o bloco Anotações (`blocoAnotacoes`): a caixa vai do
 * fim das assinaturas até o pé da última página (`PE_ANOTACOES`). Fica assim se a folha não ganhou página (o bloco
 * inteiro na última, nada some e as continuações certas); senão, mais baixa, até o mínimo de linhas
 * (`MIN_LINHAS_ANOTACOES`). Sem espaço para elas (o verso cheio, como na rodoviária multi-intervalo), o bloco vai
 * sozinho para uma página a mais, depois do passo 8, com a caixa até o pé dela (a altura medida com uma caixa de prova):
 * a folha nunca manda o técnico para um bloco que não existe. O resto da folha não muda.
 */
async function comAnotacoes(d: DadosFolhaCampo, m: Medida): Promise<Medida> {
  const fim = m.marcas.get(ID_FIM)
  if (m.extras.anotacoes || !fim) return m
  /** O bloco inteiro na página dada, a folha com as páginas dadas, nada some e as continuações e os cortes certos. */
  const confere = (r: Medida, paginas: number) =>
    r.marcas.get(`fim:${ID_ANOTACOES}`)?.pagina === paginas &&
    r.paginas === paginas &&
    !r.faltando.length &&
    continuacoesExatas(r) &&
    (!r.extras.cortes.length || cortesConferem(r, r.extras.cortes))
  for (let altura = alturaDasAnotacoes(m), i = 0; linhasDasAnotacoes(altura) >= MIN_LINHAS_ANOTACOES && i < 3; altura -= 4, i++) {
    const r = await medir(d, { ...m.extras, anotacoes: { altura } })
    if (confere(r, m.paginas)) return r
  }
  const prova = MIN_LINHAS_ANOTACOES * ENTRE_LINHAS_ANOTACOES
  const pe = (await medir(d, { ...m.extras, anotacoes: { altura: prova, paginaNova: true } })).marcas.get(`fim:${ID_ANOTACOES}`)
  if (pe?.pagina !== m.paginas + 1) return m
  for (let altura = Math.floor((prova + PE_ANOTACOES - pe.topo) * 4) / 4, i = 0; i < 3; altura -= 4, i++) {
    const r = await medir(d, { ...m.extras, anotacoes: { altura, paginaNova: true } })
    if (confere(r, m.paginas + 1)) return r
  }
  return m
}

/** Nome do arquivo: "Folha-de-campo-FC-2026-00042.pdf". */
export const nomeArquivoFolhaCampo = (numero: string) =>
  `Folha-de-campo-${(numero || 'em-branco').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '')}.pdf`

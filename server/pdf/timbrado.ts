// Papel timbrado do certificado de calibração: o timbrado completo da capa (página 1), o cabeçalho corrido
// (páginas 2 em diante), o rodapé com o fio da marca e a marca d'água.
//
// Uma moldura só, igual em todas as páginas e com o mesmo peso em cima e embaixo: em cima, a assinatura
// (logo + palavra-marca) sempre no mesmo lugar e um fio preto fino que fecha o cabeçalho; embaixo, o fio da
// marca, com o mesmo peso e a mesma cor, que termina na cunha verde do papel timbrado oficial em miniatura
// (borda a 40°, separada do fio por um vão branco), sobre a última coluna do corpo.
//
// - Página 1: o timbrado da empresa, como no papel do Word: logo, palavra-marca e razão social à esquerda;
//   telefone, e-mail e site com ícones verdes à direita; abaixo, o título "CERTIFICADO DE CALIBRAÇÃO" com o
//   nº, e o fio. A marca d'água em contorno do papel oficial não entra: ela funciona numa carta quase em
//   branco, mas numa página de dados as hastes do símbolo se leem como fios de tabela fora do lugar.
// - Páginas 2+: cabeçalho corrido numa linha: a mesma assinatura da capa em escala menor à esquerda; à
//   direita, o título "CERTIFICADO DE CALIBRAÇÃO" em versal espaçada e o nº, na Poppins do título da capa.
// - Todas: rodapé sob o fio da marca. À esquerda, razão social · CNPJ e o endereço; à direita, a cláusula
//   de reprodução e "Página X de Y". Os contatos ficam só na capa: o rodapé não repete o cabeçalho.
//
// Tipografia: o cabeçalho é da marca, em Poppins (a geométrica do logotipo oficial): palavra-marca, razão
// social, contatos, título e nº; o rodapé é do documento, em Inter, como o corpo. Cinco corpos e só eles
// (CORPO). Todo texto e todo fio em preto 100 % (TINTA): a hierarquia vem do corpo e do peso, e a impressão
// sai nítida em qualquer laser. Nada é chapado em área grande e tudo fica a ≥ 13 mm da borda. Os dados vêm
// da emissão: nada da empresa fica escrito aqui.
//
// O timbrado é desenhado no fundo da página (o background do pdfmake ocupa a folha inteira; o cabeçalho
// do pdfmake descarta o que passa da margem de cima) e o rodapé, que precisa do total de páginas, no
// footer. Os textos são medidos com o fontkit (o mesmo do pdfkit) e quebrados aqui, linha a linha: as
// posições são exatas e a margem de baixo cresce quando o endereço da empresa é longo.

import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DadosEmpresa } from '#shared/tipos.ts'
import { fioMarcaSvg, iconeSvg, type Icone, logoSvg, TINTA } from './marca.ts'

type NoObjeto = Record<string, unknown>

// ---- Página -------------------------------------------------------------------------------------------

export const A4 = { largura: 595.28, altura: 841.89 }
export const MARGEM_X = 45
/** Largura útil (≈ 178 mm). */
export const LARGURA = A4.largura - 2 * MARGEM_X
const DIREITA = MARGEM_X + LARGURA

/** Topo do logo, igual em todas as páginas (≈ 12,7 mm da borda); a última linha do rodapé fica à mesma distância. */
const TOPO = 36
/**
 * Os dois fios do quadro (o do cabeçalho e o da marca, no rodapé): finos, iguais e em preto puro, que a
 * impressora não retícula (um cinza sairia pontilhado).
 */
const FIO = { espessura: 0.4, cor: TINTA.texto }
/** Do pé do logo (ou do título, na capa) ao fio: o fio pertence ao cabeçalho... */
const VAO_FIO = 7
/**
 * ...e o corpo começa bem abaixo dele, à mesma altura em toda página: longe o bastante para que o título da
 * primeira seção pertença ao fio cinza dela, e não fique imprensado entre dois fios.
 */
const VAO_CORPO = 20

/** Escala tipográfica do timbrado: cinco corpos, e só eles (fora a marca d'água). */
const CORPO = { micro: 6.5, texto: 7.5, corrido: 9, capa: 13, titulo: 17 } as const

/**
 * Assinatura (logo + palavra-marca): a mesma na capa e no cabeçalho corrido, em outra escala. A altura das
 * versais da marca fica em ≈ 0,23 do diâmetro do logo e o vão até ela em 0,22 (no papel oficial, ≈ 0,19).
 */
const ASSINATURA = { vaoLogo: 0.22 }

const arredondar = (v: number) => Math.round(v * 100) / 100

// ---- Fontes e medidas ---------------------------------------------------------------------------------

const PASTA_FONTES = fileURLToPath(new URL('./fontes/', import.meta.url))
const arquivo = (nome: string) => resolve(PASTA_FONTES, nome)

const ARQUIVOS = {
  regular: 'Poppins-Regular.ttf',
  medio: 'Poppins-Medium.ttf',
  semibold: 'Poppins-SemiBold.ttf',
  extrabold: 'Poppins-ExtraBold.ttf',
  inter: 'Inter-Regular.ttf',
  interSemibold: 'Inter-SemiBold.ttf',
  interMedio: 'Inter-Medium.ttf',
  /** A marca d'água (Inter Bold, a "InterMedio" em negrito do certificado). */
  interNegrito: 'Inter-Bold.ttf',
} as const
type Medida = keyof typeof ARQUIVOS

/**
 * Famílias do timbrado para o pdfmake: Poppins (Regular / SemiBold no negrito), a Medium do título do
 * cabeçalho corrido e a da palavra-marca.
 */
export const FONTES_TIMBRADO = {
  Poppins: {
    normal: arquivo(ARQUIVOS.regular),
    bold: arquivo(ARQUIVOS.semibold),
    italics: arquivo(ARQUIVOS.regular),
    bolditalics: arquivo(ARQUIVOS.semibold),
  },
  PoppinsMedio: {
    normal: arquivo(ARQUIVOS.medio),
    bold: arquivo(ARQUIVOS.medio),
    italics: arquivo(ARQUIVOS.medio),
    bolditalics: arquivo(ARQUIVOS.medio),
  },
  PoppinsMarca: {
    normal: arquivo(ARQUIVOS.extrabold),
    bold: arquivo(ARQUIVOS.extrabold),
    italics: arquivo(ARQUIVOS.extrabold),
    bolditalics: arquivo(ARQUIVOS.extrabold),
  },
}

/** Fonte de cada medida no pdfmake (as famílias Inter e InterMedio são as do corpo, em certificado.ts). */
const FONTE: Record<Medida, NoObjeto> = {
  regular: { font: 'Poppins', bold: false },
  medio: { font: 'PoppinsMedio', bold: false },
  semibold: { font: 'Poppins', bold: true },
  extrabold: { font: 'PoppinsMarca', bold: false },
  inter: { font: 'Inter', bold: false },
  interSemibold: { font: 'Inter', bold: true },
  interMedio: { font: 'InterMedio', bold: false },
  interNegrito: { font: 'InterMedio', bold: true },
}

const ehInter = (m: Medida) => m.startsWith('inter')
/** Métricas (hhea, em): o pdfmake põe a linha de base a `ascendente` × corpo do topo da linha. */
const ascendente = (m: Medida) => (ehInter(m) ? 0.96875 : 1.05)
/** Altura das versais (em). */
const versal = (m: Medida) => (ehInter(m) ? 0.7275 : 0.705)
/** Altura de x (em). */
const alturaX = (m: Medida) => (ehInter(m) ? 0.546 : 0.55)

interface FonteMedida {
  unitsPerEm: number
  layout(texto: string): { advanceWidth: number }
}
const fontesMedidas = new Map<Medida, FonteMedida | null>()

/** A fonte aberta pelo fontkit que vem com o pdfkit (dependência do pdfmake); null se não der. */
function fonteMedida(medida: Medida): FonteMedida | null {
  if (!fontesMedidas.has(medida)) {
    let f: FonteMedida | null = null
    try {
      const doPdfmake = createRequire(createRequire(import.meta.url).resolve('pdfmake'))
      const fontkit = createRequire(doPdfmake.resolve('pdfkit'))('fontkit') as { openSync(caminho: string): FonteMedida }
      f = fontkit.openSync(arquivo(ARQUIVOS[medida]))
    } catch {
      f = null
    }
    fontesMedidas.set(medida, f)
  }
  return fontesMedidas.get(medida) ?? null
}

/** Sem o fontkit: largura média por letra (em), por cima, para nada transbordar. */
const MEDIA_POR_LETRA: Record<Medida, number> = {
  regular: 0.64,
  medio: 0.67,
  semibold: 0.7,
  extrabold: 0.76,
  inter: 0.62,
  interSemibold: 0.65,
  interMedio: 0.64,
  interNegrito: 0.66,
}

/** Largura (pt) do texto, com o espaçamento entre letras como o pdfmake calcula. */
function larguraTexto(medida: Medida, texto: string, corpo: number, espacamento = 0): number {
  const f = fonteMedida(medida)
  const natural = f ? (f.layout(texto).advanceWidth / f.unitsPerEm) * corpo : [...texto].length * MEDIA_POR_LETRA[medida] * corpo
  return natural + espacamento * Math.max(texto.length - 1, 0)
}

/**
 * Quebra o texto em linhas de até `largura`: nos espaços e, numa palavra maior que a linha (e-mail, site),
 * depois de ".", "@", "/", "-" ou "_".
 */
function quebrar(texto: string, medida: Medida, corpo: number, largura: number, espacamento = 0): string[] {
  const cabe = (t: string) => larguraTexto(medida, t, corpo, espacamento) <= largura
  const linhas: string[] = []
  let atual = ''
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const junto = atual ? `${atual} ${palavra}` : palavra
    if (cabe(junto)) {
      atual = junto
      continue
    }
    if (atual) linhas.push(atual)
    atual = ''
    for (const pedaco of cabe(palavra) ? [palavra] : palavra.split(/(?<=[.@/_-])/)) {
      if (atual && !cabe(atual + pedaco)) {
        linhas.push(atual)
        atual = pedaco
      } else atual += pedaco
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

/**
 * Junta as partes com o separador do timbrado, linha a linha: uma parte que não cabe vai inteira para a
 * linha de baixo (o separador nunca fica pendurado no fim nem no começo de uma linha); só uma parte maior
 * que a linha toda é quebrada nas palavras.
 */
function quebrarPartes(partes: string[], medida: Medida, corpo: number, largura: number): string[] {
  const linhas: string[] = []
  let atual = ''
  for (const parte of partes) {
    const junto = atual ? atual + SEP + parte : parte
    if (larguraTexto(medida, junto, corpo) <= largura) {
      atual = junto
      continue
    }
    if (atual) linhas.push(atual)
    const pedacos = quebrar(parte, medida, corpo, largura)
    linhas.push(...pedacos.slice(0, -1))
    atual = pedacos.at(-1) ?? ''
  }
  if (atual) linhas.push(atual)
  return linhas
}

interface Ajuste {
  corpo: number
  linhas: string[]
  /** Não coube nem no corpo mínimo: a última linha termina em reticências. */
  cortado: boolean
}

/**
 * Maior corpo, de `maximo` a `minimo` (passos de 0,25 pt), em que o texto cabe em `largura` com até
 * `maxLinhas` linhas. Se nem no mínimo couber, a última linha termina em reticências (só com dados
 * absurdos; a razão social completa sempre sai no rodapé, que cresce em vez de cortar).
 */
function ajustar(
  texto: string,
  medida: Medida,
  maximo: number,
  minimo: number,
  largura: number,
  maxLinhas: number,
  espacamentoEm = 0,
): Ajuste {
  for (let corpo = maximo; corpo >= minimo - 1e-6; corpo = Math.round((corpo - 0.25) * 100) / 100) {
    const esp = espacamentoEm * corpo
    const linhas = quebrar(texto, medida, corpo, largura, esp)
    if (linhas.length <= maxLinhas && linhas.every((l) => larguraTexto(medida, l, corpo, esp) <= largura))
      return { corpo, linhas, cortado: false }
  }
  const esp = espacamentoEm * minimo
  const linhas = quebrar(texto, medida, minimo, largura, esp).slice(0, maxLinhas)
  let ultima = linhas[linhas.length - 1] ?? ''
  while (ultima.length > 1 && larguraTexto(medida, `${ultima}…`, minimo, esp) > largura) ultima = ultima.slice(0, -1).trimEnd()
  linhas[linhas.length - 1] = `${ultima}…`
  return { corpo: minimo, linhas, cortado: true }
}

/** Palavra-marca: primeiro numa linha só (até `minimoUmaLinha`); se não der, em até `maxLinhas`. */
function ajustarMarca(texto: string, corpos: [number, number, number], largura: number, maxLinhas: number): Ajuste {
  const [maximo, minimoUmaLinha, minimo] = corpos
  const umaLinha = ajustar(texto, 'extrabold', maximo, minimoUmaLinha, largura, 1)
  if (!umaLinha.cortado || maxLinhas === 1) return umaLinha
  return ajustar(texto, 'extrabold', minimoUmaLinha, minimo, largura, maxLinhas)
}

// ---- Dados ------------------------------------------------------------------------------------------

const vazio = (s: string | null | undefined) => !s || !s.trim()
const limpo = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ')

/** Separador único do timbrado. */
const SEP = ' · '

/** Nome da marca (nome fantasia; sem ele, a razão social) e a razão social quando for diferente dele. */
function nomes(empresa: DadosEmpresa) {
  const marca = limpo(empresa.nomeFantasia) || limpo(empresa.razaoSocial)
  const razao = limpo(empresa.razaoSocial)
  return {
    marca: marca.toUpperCase(),
    razao: razao && razao.toUpperCase() !== marca.toUpperCase() ? razao.toUpperCase() : '',
    /** Nome legal (rodapé): a razão social, na mesma caixa alta do cabeçalho. */
    legal: (razao || marca).toUpperCase(),
    cnpj: vazio(empresa.cnpj) ? '' : `CNPJ ${limpo(empresa.cnpj)}`,
  }
}

/** Partes do endereço da empresa: logradouro, bairro, cidade/UF e CEP. */
function partesEndereco(e: DadosEmpresa): string[] {
  const cidade = [limpo(e.cidade), limpo(e.uf)].filter(Boolean).join('/')
  return [limpo(e.endereco), limpo(e.bairro), cidade, vazio(e.cep) ? '' : `CEP ${limpo(e.cep)}`].filter(Boolean)
}

/** Nó de texto de uma linha, posto na página com a linha de base em `base`. */
function linhaAbsoluta(
  texto: string | NoObjeto[],
  x: number,
  base: number,
  corpo: number,
  medida: Medida,
  extra: NoObjeto,
): NoObjeto {
  return {
    text: texto,
    fontSize: corpo,
    lineHeight: 1,
    noWrap: true,
    ...FONTE[medida],
    ...extra,
    absolutePosition: { x, y: base - ascendente(medida) * corpo },
  }
}

/** Linha alinhada à direita em `direita` (caixa de largura fixa, para o alinhamento ser do pdfmake). */
function linhaDireita(
  texto: string | NoObjeto[],
  direita: number,
  largura: number,
  base: number,
  corpo: number,
  medida: Medida,
  extra: NoObjeto,
): NoObjeto {
  return {
    absolutePosition: { x: direita - largura, y: base - ascendente(medida) * corpo },
    columns: [
      {
        width: largura,
        text: texto,
        alignment: 'right',
        fontSize: corpo,
        lineHeight: 1,
        noWrap: true,
        ...FONTE[medida],
        ...extra,
      },
    ],
  }
}

/** Fio do cabeçalho (retângulo cheio: pontas retas e a espessura exata) com o topo em `y`. */
const fioTimbrado = (y: number): NoObjeto => ({
  canvas: [{ type: 'rect', x: 0, y: 0, w: LARGURA, h: FIO.espessura, color: FIO.cor }],
  absolutePosition: { x: MARGEM_X, y },
})

/** "Nº CC-2026-00123": "Nº" e número no mesmo corpo; o "Nº" em Regular, o número em SemiBold. */
function numeroCertificado(numero: string): NoObjeto[] {
  return [
    { text: 'Nº ', ...FONTE.regular, color: TINTA.texto },
    { text: numero, ...FONTE.semibold, color: TINTA.texto },
  ]
}
const larguraNumero = (numero: string, corpo: number) =>
  larguraTexto('regular', 'Nº ', corpo) + larguraTexto('semibold', numero, corpo)

/** Logo de `diametro` pt com o topo em TOPO, na margem esquerda. */
const logo = (diametro: number): NoObjeto => ({
  svg: logoSvg(diametro),
  width: diametro,
  height: diametro,
  absolutePosition: { x: MARGEM_X, y: TOPO },
})

/**
 * Altura (pt, acima da linha de base) do centro visual de uma linha, para centrar um ícone nela: na metade
 * das versais numa linha de versais e algarismos (telefone), na metade da altura de x numa linha de
 * minúsculas (e-mail, site), e no meio-termo proporcional numa linha mista.
 */
function centroOptico(texto: string, medida: Medida, corpo: number): number {
  const minusculas = (texto.match(/\p{Ll}/gu) ?? []).length
  const altas = (texto.match(/[\p{Lu}\p{N}]/gu) ?? []).length
  const p = minusculas + altas ? minusculas / (minusculas + altas) : 0
  return ((p * alturaX(medida) + (1 - p) * versal(medida)) * corpo) / 2
}

// ---- Página 1: timbrado completo -------------------------------------------------------------------------

const CAPA = {
  logo: 40,
  /** Palavra-marca: corpo máximo, mínimo numa linha só e mínimo (em até 3 linhas). */
  marca: [CORPO.capa, 10, 7] as [number, number, number],
  maxLinhasMarca: 3,
  /** Razão social sob a marca, leve (Poppins Regular, versal com 0,02 em), em até duas linhas. */
  razao: CORPO.texto,
  razaoMinimo: CORPO.micro,
  espacamentoRazao: 0.02,
  /**
   * Da linha de base da marca ao topo das versais da razão social: livra a cedilha da marca e os acentos
   * das versais da razão social (Ã, Ó, Á…), que sobem ≈ 0,2 em acima delas.
   */
  vaoRazao: 6.5,
}
/**
 * Contatos (Poppins Regular, como no papel oficial): corpo, distância entre as linhas de base de dois
 * contatos e entre as linhas de um mesmo contato que quebrou (e-mail longo), ícone e vão até o texto.
 */
const CONTATO = { corpo: CORPO.texto, passo: 11, passoQuebra: 9, icone: 8, vao: 5 }
/** Título da capa e o nº ao lado (o nº diminui até o corpo do cabeçalho corrido para caber na mesma linha). */
const TITULO = { texto: 'CERTIFICADO DE CALIBRAÇÃO', corpo: CORPO.titulo, espacamento: 0.35, numero: CORPO.capa }
/** Do fim do timbrado da empresa ao topo das versais do título. */
const VAO_TITULO = 22

interface Linha {
  no: NoObjeto
  corpo: number
  medida: Medida
  /** Linha de base, a partir do topo das versais da primeira linha do bloco. */
  base: number
}

/** Bloco da marca da capa: a palavra-marca e, leve, a razão social (quando for diferente da marca). */
function blocoMarca(empresa: DadosEmpresa, largura: number, maxLinhasMarca = CAPA.maxLinhasMarca, maxLinhasRazao = 2): Linha[] {
  const n = nomes(empresa)
  const marca = ajustarMarca(n.marca, CAPA.marca, largura, maxLinhasMarca)
  const razao = n.razao
    ? ajustar(n.razao, 'regular', CAPA.razao, CAPA.razaoMinimo, largura, maxLinhasRazao, CAPA.espacamentoRazao)
    : null
  const linhas: Linha[] = []
  let base = 0
  marca.linhas.forEach((l, i) => {
    base = i === 0 ? versal('extrabold') * marca.corpo : base + marca.corpo * 1.08
    linhas.push({ no: { text: l, color: TINTA.grafite }, corpo: marca.corpo, medida: 'extrabold', base })
  })
  razao?.linhas.forEach((l, i) => {
    base += i === 0 ? CAPA.vaoRazao + versal('regular') * razao.corpo : razao.corpo * 1.3
    linhas.push({
      no: { text: l, color: TINTA.texto, characterSpacing: arredondar(CAPA.espacamentoRazao * razao.corpo) },
      corpo: razao.corpo,
      medida: 'regular',
      base,
    })
  })
  // Nomes enormes (bloco bem mais alto que o logo): menos linhas, com reticências; o nome completo sai no rodapé
  if (base > CAPA.logo + 8 && (maxLinhasRazao > 1 || maxLinhasMarca > 1))
    return maxLinhasRazao > 1
      ? blocoMarca(empresa, largura, maxLinhasMarca, maxLinhasRazao - 1)
      : blocoMarca(empresa, largura, maxLinhasMarca - 1, 1)
  return linhas
}

function contatos(empresa: DadosEmpresa): Array<[Icone, string]> {
  const itens: Array<[Icone, string]> = [
    ['telefone', limpo(empresa.telefone)],
    ['email', limpo(empresa.email)],
    ['site', limpo(empresa.site)],
  ]
  return itens.filter(([, v]) => v)
}

/**
 * Timbrado da capa (nós absolutos) e onde ele termina: logo e bloco da marca à esquerda, contatos à direita
 * (os dois blocos centrados na altura do logo), o título com o nº e o fio.
 */
function capa(empresa: DadosEmpresa, numero: string): { nos: NoObjeto[]; fimFio: number } {
  const itens = contatos(empresa)
  // Coluna dos contatos: até 45 % da largura, sempre no mesmo corpo; um valor longo quebra em "." e "@"
  const maxTexto = LARGURA * 0.45 - CONTATO.icone - CONTATO.vao
  const linhasContato = itens.flatMap(([icone, v]) =>
    quebrar(v, 'regular', CONTATO.corpo, maxTexto).map((l, i) => ({ icone: i === 0 ? icone : null, l })),
  )
  const larguraContatos = itens.length
    ? Math.max(...linhasContato.map((x) => larguraTexto('regular', x.l, CONTATO.corpo))) + CONTATO.icone + CONTATO.vao
    : 0

  // Bloco da marca, centrado na altura do logo
  const xMarca = MARGEM_X + CAPA.logo + arredondar(ASSINATURA.vaoLogo * CAPA.logo)
  const linhasMarca = blocoMarca(empresa, DIREITA - xMarca - (larguraContatos ? larguraContatos + 18 : 0))
  const alturaMarca = linhasMarca[linhasMarca.length - 1].base
  const topoMarca = Math.max(TOPO + (CAPA.logo - alturaMarca) / 2, 20)
  const basesMarca = linhasMarca.map((l) => topoMarca + l.base)

  // Contatos: um passo entre dois contatos e um passo menor entre as linhas de um mesmo contato (a
  // continuação de um e-mail longo não se lê como mais um item); o bloco (do topo das versais da primeira à
  // última linha de base) centrado no logo
  const capContato = versal('regular') * CONTATO.corpo
  const desvios = linhasContato.reduce<number[]>(
    (d, x, i) => [...d, i === 0 ? 0 : d[i - 1] + (x.icone ? CONTATO.passo : CONTATO.passoQuebra)],
    [],
  )
  const alturaContatos = (desvios.at(-1) ?? 0) + capContato
  const primeiraContato = TOPO + CAPA.logo / 2 - alturaContatos / 2 + capContato
  const basesContato = desvios.map((d) => primeiraContato + d)
  const nosContato = linhasContato.flatMap(({ icone, l }, i) => {
    const base = basesContato[i]
    const texto = linhaDireita(l, DIREITA - CONTATO.icone - CONTATO.vao, larguraContatos, base, CONTATO.corpo, 'regular', {
      color: TINTA.texto,
    })
    if (!icone) return [texto]
    const meio = base - centroOptico(l, 'regular', CONTATO.corpo)
    return [
      texto,
      {
        svg: iconeSvg(icone),
        width: CONTATO.icone,
        height: CONTATO.icone,
        absolutePosition: { x: DIREITA - CONTATO.icone, y: meio - CONTATO.icone / 2 },
      },
    ]
  })

  // Título e nº na mesma linha de base, abaixo do timbrado da empresa; o fio fecha o bloco, sob o título
  const fimTimbrado = Math.max(
    TOPO + CAPA.logo,
    basesMarca[basesMarca.length - 1] + 0.25 * linhasMarca[linhasMarca.length - 1].corpo,
    ...basesContato.map((b) => b + 0.25 * CONTATO.corpo),
  )
  const baseTitulo = fimTimbrado + VAO_TITULO + versal('semibold') * TITULO.corpo
  const larguraTitulo = larguraTexto('semibold', TITULO.texto, TITULO.corpo, TITULO.espacamento)
  const livre = LARGURA - larguraTitulo - 24
  let corpoNumero: number = TITULO.numero
  while (corpoNumero > CORPO.corrido && larguraNumero(numero, corpoNumero) > livre) corpoNumero -= 0.25
  const cabe = larguraNumero(numero, corpoNumero) <= livre
  // Nº que não coube ao lado do título (formatos muito longos): na linha de baixo, à direita
  if (!cabe) corpoNumero = TITULO.numero
  const baseNumero = cabe ? baseTitulo : baseTitulo + 8 + versal('semibold') * corpoNumero
  const larguraN = Math.min(larguraNumero(numero, corpoNumero) + 2, LARGURA)
  // O fio a VAO_FIO + a cedilha do título abaixo da linha de base
  const yFio = baseNumero + 0.2 * TITULO.corpo + VAO_FIO

  const nos: NoObjeto[] = [
    logo(CAPA.logo),
    ...linhasMarca.map(({ no: { text, ...estilo }, corpo: c, medida }, i) =>
      linhaAbsoluta(text as string, xMarca, basesMarca[i], c, medida, estilo),
    ),
    ...nosContato,
    linhaAbsoluta(TITULO.texto, MARGEM_X, baseTitulo, TITULO.corpo, 'semibold', {
      characterSpacing: TITULO.espacamento,
      color: TINTA.texto,
    }),
    linhaDireita(numeroCertificado(numero), DIREITA, larguraN, baseNumero, corpoNumero, 'semibold', {}),
    fioTimbrado(yFio),
  ]
  return { nos, fimFio: yFio + FIO.espessura }
}

// ---- Páginas 2+: cabeçalho corrido -----------------------------------------------------------------------

/** A assinatura da capa reduzida: logo de 27 pt e a marca em 9 pt (versais a ≈ 0,23 do diâmetro). */
const CORRIDO = { logo: 27, marca: [CORPO.corrido, 7.5, 6.5] as [number, number, number], maxLinhasMarca: 2 }
/**
 * Título no cabeçalho corrido (exigido em toda página, ISO/IEC 17025 7.8.2.1): versal espaçada em Poppins
 * Medium, a família do título da capa e do nº ao lado, em preto, no corpo de texto do timbrado.
 */
const TITULO_CORRIDO = { corpo: CORPO.texto, espacamento: 0.5 }
/** Do fim do título ao "Nº". */
const VAO_TITULO_CORRIDO = 10
/** Topo do fio sob o cabeçalho corrido. */
const FIO_CORRIDO = TOPO + CORRIDO.logo + VAO_FIO
/** Topo do corpo (o pdfmake tem uma margem de cima só para o documento todo): abaixo do fio do cabeçalho. */
export const MARGEM_TOPO = arredondar(FIO_CORRIDO + FIO.espessura + VAO_CORPO)

function cabecalhoCorrido(empresa: DadosEmpresa, numero: string): NoObjeto[] {
  // À direita, numa linha: o título e o nº; nunca quebra
  let corpoNumero: number = CORPO.corrido
  while (corpoNumero > 7.5 && larguraNumero(numero, corpoNumero) > LARGURA * 0.3) corpoNumero -= 0.25
  const larguraTitulo = larguraTexto('medio', TITULO.texto, TITULO_CORRIDO.corpo, TITULO_CORRIDO.espacamento)
  const larguraN = larguraNumero(numero, corpoNumero)
  const larguraDireita = larguraTitulo + VAO_TITULO_CORRIDO + larguraN
  // À esquerda, logo e palavra-marca (uma linha; nomes longos em duas), centrada na altura do logo
  const xMarca = MARGEM_X + CORRIDO.logo + arredondar(ASSINATURA.vaoLogo * CORRIDO.logo)
  const marca = ajustarMarca(nomes(empresa).marca, CORRIDO.marca, DIREITA - xMarca - larguraDireita - 24, CORRIDO.maxLinhasMarca)
  const passo = marca.corpo * 1.08
  const altura = versal('extrabold') * marca.corpo + (marca.linhas.length - 1) * passo
  const primeiraBase = TOPO + (CORRIDO.logo - altura) / 2 + versal('extrabold') * marca.corpo
  const ultimaBase = primeiraBase + (marca.linhas.length - 1) * passo
  return [
    logo(CORRIDO.logo),
    ...marca.linhas.map((l, i) =>
      linhaAbsoluta(l, xMarca, primeiraBase + i * passo, marca.corpo, 'extrabold', { color: TINTA.grafite }),
    ),
    // Na mesma linha de base da marca: o nº na margem e o título antes dele
    linhaDireita(
      TITULO.texto,
      DIREITA - larguraN - VAO_TITULO_CORRIDO,
      larguraTitulo + 2,
      ultimaBase,
      TITULO_CORRIDO.corpo,
      'medio',
      { color: TINTA.texto, characterSpacing: TITULO_CORRIDO.espacamento },
    ),
    linhaDireita(numeroCertificado(numero), DIREITA, larguraN + 2, ultimaBase, corpoNumero, 'semibold', {}),
    fioTimbrado(FIO_CORRIDO),
  ]
}

// ---- Rodapé e fio da marca -------------------------------------------------------------------------------

const RODAPE = {
  /** Identificação, endereço e cláusula. */
  corpo: CORPO.micro,
  /** "Página X de Y", o dado funcional do rodapé. */
  pagina: CORPO.texto,
  /** Distância entre as linhas de base. */
  passo: 9,
  /** Linha de base da última linha: à mesma distância da borda de baixo que o logo da de cima. */
  base: A4.altura - TOPO,
  /** Do pé do fio da marca ao topo das versais da primeira linha. */
  vaoFio: 7,
  /** Branco entre o fim do corpo e o topo da cunha verde. */
  respiro: 10,
  /** Entre a coluna da identificação e a da cláusula/paginação. */
  calha: 18,
  /** Espaçamento da razão social (caixa alta). */
  espacamentoRazao: 0.15,
} as const
const CLAUSULA = 'Este certificado somente pode ser reproduzido na íntegra.'
/**
 * Fio da marca: a cunha verde tem 4,5 pt de altura (11 vezes o fio, para a borda de 40° se ler como uma
 * diagonal, e não como um entalhe) e começa na última coluna do corpo (o último quarto da largura, como a
 * cunha do papel oficial ocupa o último quarto da folha); o vão branco tem 2,5 pt na perpendicular ao corte.
 */
const FIO_MARCA = { alturaCunha: 4.5, inicioCunha: 0.75, vao: 2.5 }

type Trecho = { text: string; razao?: boolean }

export interface Timbrado {
  margens: [number, number, number, number]
  /** Primeiro nó do corpo: reserva, na página 1, o lugar do timbrado completo. */
  aberturaCapa: NoObjeto
  rodape: (pagina: number, total: number) => NoObjeto
  /** Fundo de cada página: o timbrado (capa ou cabeçalho corrido) e o fio da marca do rodapé. */
  fundo: (pagina: number) => NoObjeto
  /** Marca d'água (PRÉVIA, CANCELADO) no tamanho da área do corpo, ou undefined se não houver. */
  marcaDagua: (texto: string) => NoObjeto | undefined
}

/** Papel timbrado de um certificado: margens, timbrado da capa, cabeçalho corrido, rodapé e marca d'água. */
export function timbrado(empresa: DadosEmpresa, numero: string): Timbrado {
  const n = nomes(empresa)

  // Rodapé em duas colunas: à esquerda a identificação legal (razão social · CNPJ, endereço); à direita,
  // alinhadas à margem e por baixo, a cláusula e a paginação. A coluna da direita tem a largura da cláusula.
  const larguraClausula = larguraTexto('inter', CLAUSULA, RODAPE.corpo)
  const larguraPagina = larguraTexto('interSemibold', 'Página 88 de 88', RODAPE.pagina)
  const larguraColunaDireita = Math.max(larguraClausula, larguraPagina)
  const larguraEsquerda = LARGURA - RODAPE.calha - larguraColunaDireita
  const largura = (trechos: Trecho[]) =>
    trechos.reduce(
      (t, x) =>
        t +
        (x.razao
          ? larguraTexto('interSemibold', x.text, RODAPE.corpo, RODAPE.espacamentoRazao)
          : larguraTexto('inter', x.text, RODAPE.corpo)),
      0,
    )
  const esquerda: Trecho[][] = []
  // 1) razão social · CNPJ. Se a razão social ocupar a linha toda, o CNPJ vai para o começo do endereço
  //    (como mais uma parte dele). 2) endereço, quebrado entre as partes.
  let cnpjPendente = n.cnpj
  if (n.legal) {
    quebrar(n.legal, 'interSemibold', RODAPE.corpo, larguraEsquerda, RODAPE.espacamentoRazao).forEach((p) =>
      esquerda.push([{ text: p, razao: true }]),
    )
    const ultima = esquerda[esquerda.length - 1]
    if (cnpjPendente && largura([...ultima, { text: SEP + cnpjPendente }]) <= larguraEsquerda) {
      ultima.push({ text: SEP + cnpjPendente })
      cnpjPendente = ''
    }
  }
  const partes = [...(cnpjPendente ? [cnpjPendente] : []), ...partesEndereco(empresa)]
  quebrarPartes(partes, 'inter', RODAPE.corpo, larguraEsquerda).forEach((l) => esquerda.push([{ text: l }]))

  const nLinhas = Math.max(esquerda.length, 2)
  const primeiraBase = RODAPE.base - (nLinhas - 1) * RODAPE.passo
  // O fio e a cunha se apoiam na mesma linha (o pé do fio); a cunha sobe acima dele
  const peFio = primeiraBase - versal('inter') * RODAPE.corpo - RODAPE.vaoFio
  const topoCunha = peFio - FIO_MARCA.alturaCunha
  const margemBase = Math.ceil((A4.altura - (topoCunha - RODAPE.respiro)) * 100) / 100
  const svgFioMarca = fioMarcaSvg({
    largura: LARGURA,
    fio: FIO.espessura,
    alturaCunha: FIO_MARCA.alturaCunha,
    peCunha: LARGURA * FIO_MARCA.inicioCunha,
    vao: FIO_MARCA.vao,
    cor: FIO.cor,
  })

  // No rodapé do pdfmake, a posição absoluta é medida a partir do topo da caixa do rodapé
  const topoRodape = A4.altura - margemBase
  const rodape = (pagina: number, total: number): NoObjeto => ({
    stack: [
      ...esquerda.map((trechos, i) =>
        linhaAbsoluta(
          trechos.map((t) =>
            t.razao
              ? { text: t.text, ...FONTE.interSemibold, color: TINTA.texto, characterSpacing: RODAPE.espacamentoRazao }
              : { text: t.text, ...FONTE.inter, color: TINTA.texto },
          ),
          MARGEM_X,
          primeiraBase + i * RODAPE.passo - topoRodape,
          RODAPE.corpo,
          'inter',
          {},
        ),
      ),
      linhaDireita(CLAUSULA, DIREITA, larguraClausula + 2, RODAPE.base - RODAPE.passo - topoRodape, RODAPE.corpo, 'inter', {
        color: TINTA.texto,
      }),
      linhaDireita(
        `Página ${pagina} de ${total}`,
        DIREITA,
        larguraPagina + 2,
        RODAPE.base - topoRodape,
        RODAPE.pagina,
        'interSemibold',
        {
          color: TINTA.texto,
        },
      ),
    ],
  })

  // Página 1: o corpo começa abaixo do fio da capa
  const daCapa = capa(empresa, numero)
  const topoCorpoCapa = daCapa.fimFio + VAO_CORPO
  const fimCorpo = A4.altura - margemBase

  // Nó novo a cada página (o pdfmake guarda posições no nó: reaproveitar desenha fios soltos)
  const fundo = (pagina: number): NoObjeto => ({
    stack: [
      ...(pagina === 1 ? capa(empresa, numero).nos : cabecalhoCorrido(empresa, numero)),
      {
        svg: svgFioMarca,
        width: LARGURA,
        height: FIO_MARCA.alturaCunha,
        absolutePosition: { x: MARGEM_X, y: topoCunha },
      },
    ],
  })

  /**
   * Marca d'água diagonal (-50°), centrada na folha como o pdfmake a desenha, no maior corpo (até 84 pt) que
   * cabe na área do corpo da capa, com 14 pt de folga: não passa sobre o timbrado, o nº nem o rodapé, e fica
   * longe da borda que a impressora não imprime. Cinza neutro a 16 % (vermelho a 22 % no CANCELADO), que
   * continua visível impresso em P&B.
   */
  const marcaDagua = (texto: string): NoObjeto | undefined => {
    const t = texto.trim()
    if (!t) return undefined
    const cancelado = /cancel/i.test(t)
    const angulo = 50
    const cos = Math.cos((angulo * Math.PI) / 180)
    const sen = Math.sin((angulo * Math.PI) / 180)
    const em = larguraTexto('interNegrito', t, 1)
    const altura = 1.21 // ascendente − descendente da Inter (hhea)
    const meiaLargura = LARGURA / 2 - 14
    const meiaAltura = Math.min(A4.altura / 2 - topoCorpoCapa, fimCorpo - A4.altura / 2) - 14
    const corpo = Math.min(84, (2 * meiaLargura) / (em * cos + altura * sen), (2 * meiaAltura) / (em * sen + altura * cos))
    return {
      text: t,
      color: cancelado ? '#B42318' : '#000000',
      opacity: cancelado ? 0.22 : 0.16,
      bold: true,
      font: 'InterMedio',
      fontSize: Math.floor(corpo * 4) / 4,
      angle: -angulo,
    }
  }

  return {
    margens: [MARGEM_X, MARGEM_TOPO, MARGEM_X, margemBase],
    aberturaCapa: { canvas: [], margin: [0, arredondar(topoCorpoCapa - MARGEM_TOPO), 0, 0] },
    rodape,
    fundo,
    marcaDagua,
  }
}

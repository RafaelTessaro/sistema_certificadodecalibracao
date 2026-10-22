// Base comum dos PDFs da empresa (certificado de calibração e folha de campo): o motor do pdfmake com
// as fontes, as medidas do timbrado (módulo de 30 pt), o bloco da marca do cabeçalho, a assinatura do
// rodapé e utilitários de layout. Cada documento monta o próprio conteúdo, cabeçalho e rodapé com eles.

import { createRequire } from 'node:module'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DadosEmpresa } from '#shared/tipos.ts'
import { assinaturaRodapeSvg, LOGO_SVG, TIMBRADO } from './marca.ts'

// ---- pdfmake (servidor) --------------------------------------------------------------------------

/** Nó do documento do pdfmake (o pacote não traz tipos). */
export type No = string | NoObjeto | No[]
export interface NoObjeto {
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
 * Inter estática: Regular/SemiBold no texto; Medium/Bold nos rótulos e números.
 * Poppins (a geométrica do logotipo oficial, SIL OFL) só no cabeçalho: ExtraBold na palavra-marca,
 * como no timbrado da empresa, e SemiBold no número do documento.
 */
const FONTES = {
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
  Poppins: {
    normal: fonte('Poppins-SemiBold.ttf'),
    bold: fonte('Poppins-ExtraBold.ttf'),
    italics: fonte('Poppins-SemiBold.ttf'),
    bolditalics: fonte('Poppins-ExtraBold.ttf'),
  },
}

let motorPdf: PdfMakeServidor | null = null
export function pdfmake(): PdfMakeServidor {
  motorPdf ??= requerer('pdfmake') as PdfMakeServidor
  // O pdfmake é um objeto único no processo: fontes e políticas são reafirmadas a cada geração.
  motorPdf.setFonts(FONTES)
  motorPdf.setUrlAccessPolicy(() => false)
  motorPdf.setLocalAccessPolicy((caminho) =>
    resolve(caminho).startsWith(PASTA_FONTES.endsWith(sep) ? PASTA_FONTES : PASTA_FONTES + sep),
  )
  return motorPdf
}

interface FonteMedida {
  unitsPerEm: number
  layout(texto: string): { advanceWidth: number }
}
/** O fontkit é o leitor de fontes do pdfkit (dependência do pdfmake): medir com ele é medir como o PDF desenha. */
const fontkit = createRequire(requerer.resolve('pdfkit'))('fontkit') as { openSync(caminho: string): FonteMedida }
const fontesAbertas = new Map<string, FonteMedida>()

/**
 * Largura (pt) de um texto numa linha só, como o pdfmake mede: por trechos separados por espaço, e o
 * espaçamento entre as letras. Para encurtar com reticências o que não pode quebrar (ex.: a faixa de
 * identificação da folha de campo).
 */
export function larguraTexto(
  texto: string,
  o: { fonte?: keyof typeof FONTES; negrito?: boolean; tamanho: number; espacamento?: number },
): number {
  const arquivo = FONTES[o.fonte ?? 'Inter'][o.negrito ? 'bold' : 'normal']
  let f = fontesAbertas.get(arquivo)
  if (!f) {
    f = fontkit.openSync(arquivo)
    fontesAbertas.set(arquivo, f)
  }
  const unidades = (texto.match(/[^ \t]*[ \t]?/g) ?? []).reduce(
    (soma, trecho) => soma + (trecho ? f.layout(trecho).advanceWidth : 0),
    0,
  )
  return (unidades / f.unitsPerEm) * o.tamanho + (o.espacamento ?? 0) * Math.max(0, texto.length - 1)
}

/** O texto inteiro, se couber em `largura` (pt); senão, o começo dele com "…" (cortado antes de um espaço, se der). */
export function caberNaLargura(texto: string, largura: number, o: Parameters<typeof larguraTexto>[1]): string {
  const t = texto.trim()
  if (larguraTexto(t, o) <= largura) return t
  let [baixo, alto] = [0, t.length]
  while (baixo < alto) {
    const meio = Math.ceil((baixo + alto) / 2)
    if (larguraTexto(`${t.slice(0, meio).trimEnd()}…`, o) <= largura) baixo = meio
    else alto = meio - 1
  }
  const corte = t.slice(0, baixo)
  // Prefere cortar entre palavras quando isso não joga fora mais de um terço do que cabe
  const espaco = corte.lastIndexOf(' ')
  const final = espaco > corte.length * 0.66 ? corte.slice(0, espaco) : corte
  return final ? `${final.replace(/[\s,;:·—–-]+$/, '')}…` : ''
}

// ---- Página e timbrado ---------------------------------------------------------------------------

export const A4 = { largura: 595.28, altura: 841.89 }

// Timbrado: um módulo de 30 pt rege tudo — diâmetro do logo e distância do cabeçalho e do fio de base
// às bordas (10,6 mm: a laser de escritório não imprime os 4–5 mm finais). Sem fio sob o cabeçalho:
// como no papel timbrado oficial, a separação é feita pelo branco.
export const MODULO = 30
/** Topo do logo e do bloco do documento, a partir da borda superior. */
export const TOPO_CABECALHO = MODULO
/** Linha de base do rodapé (fio grafite e trapézio verde), a partir da borda superior. */
export const BASE_RODAPE = A4.altura - MODULO
/** Altura do trapézio verde que fecha o fio de base. */
export const ALTURA_ASSINATURA = 4.5

const vazio = (s: string | null | undefined) => !s || !s.trim()

/**
 * Colunas da marca no cabeçalho: o logo e, centrado nele, a palavra-marca (Poppins, como no timbrado
 * oficial) com a razão social espacejada logo abaixo, quase da largura da palavra-marca.
 */
export function colunasMarca(empresa: DadosEmpresa): NoObjeto[] {
  const marca = (empresa.nomeFantasia || empresa.razaoSocial).toUpperCase()
  const { nomeFantasia, razaoSocial } = empresa
  const razao =
    !vazio(nomeFantasia) && !vazio(razaoSocial) && razaoSocial.trim() !== nomeFantasia.trim() ? razaoSocial.trim() : ''
  return [
    { svg: LOGO_SVG, width: MODULO, height: MODULO },
    {
      width: '*',
      // Bloco centrado no logo; a razão social, espacejada, fica quase da largura da palavra-marca
      // (no timbrado oficial as linhas do bloco são justificadas na mesma medida)
      margin: [9, razao ? 3.3 : 8, 0, 0],
      stack: [
        { text: marca, font: 'Poppins', bold: true, fontSize: 11, lineHeight: 0.9, color: TIMBRADO.grafite },
        ...(razao
          ? [{ text: razao, font: 'InterMedio', fontSize: 5.9, characterSpacing: 0.38, color: TIMBRADO.secundario }]
          : []),
      ],
    },
  ]
}

/** Fundo de cada página: a assinatura do rodapé (fio grafite e trapézio verde) apoiada na linha de base. */
export function fundoTimbrado(margemX: number, largura: number): () => NoObjeto {
  // Desenhada uma vez e repetida em cada página
  const svg = assinaturaRodapeSvg(largura, { altura: ALTURA_ASSINATURA })
  return () => ({
    svg,
    width: largura,
    height: ALTURA_ASSINATURA,
    absolutePosition: { x: margemX, y: BASE_RODAPE - ALTURA_ASSINATURA },
  })
}

// ---- Utilitários -----------------------------------------------------------------------------------

/** Data e hora no fuso de Brasília (a empresa fica em Rio Claro/SP), independentes do fuso do servidor. */
export function dataHoraBrasilia(iso: string): { data: string; hora: string } | null {
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

/** Bloco que não se divide entre páginas (precisa caber numa página). */
export function inteiro(conteudo: No[]): NoObjeto {
  semDicaDeQuebra(conteudo)
  return { stack: conteudo, unbreakable: true }
}

/** Título sozinho no pé da página vai para a próxima (headlineLevel = espaço mínimo, em pt, abaixo dele). */
export function quebraAntes(no: {
  headlineLevel?: unknown
  startPosition?: { pageInnerHeight: number; verticalRatio: number }
}): boolean {
  const minimo = typeof no.headlineLevel === 'number' ? no.headlineLevel : 0
  if (!minimo || !no.startPosition) return false
  const restante = no.startPosition.pageInnerHeight * (1 - no.startPosition.verticalRatio)
  return restante < minimo
}

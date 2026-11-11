// Marca d'água sobre um PDF pronto, sem refazê-lo. A cópia de um certificado cancelado ou substituído parte do
// documento emitido (o arquivo guardado, conferido pelo hash), e não de um PDF refeito com o cálculo e o layout de
// hoje: os números são os do certificado entregue (ISO/IEC 17025, 7.5 e 7.8.8).
//
// A marca entra numa atualização incremental (ISO 32000-1, 7.5.6): os bytes do original ficam intactos no começo do
// arquivo, e no fim são acrescentados só o desenho da marca e as páginas que passam a desenhá-la por cima do
// conteúdo (o original fica entre "q" e "Q", e a marca vem depois, com a fonte e a transparência dela). Feito para os
// PDFs do gerador do sistema (pdfkit: tabela xref clássica, sem criptografia); outro formato é `ErroCarimbo`,
// nunca uma cópia sem a marca. A leitura e a escrita da sintaxe do PDF ficam em sintaxePdf.ts (a assinatura digital
// usa as mesmas).

import { estiloMarcaDagua } from './certificado.ts'
import {
  type Dicionario,
  ErroSintaxePdf,
  escrever,
  escreverAtualizacao,
  fimDoValor,
  lerPdf,
  type ObjetoEscrito,
  paginasDoPdf,
  proximo,
  referencia,
  referencias,
  textoPdf,
  valor,
} from './sintaxePdf.ts'

export { textoPdf }

/** O PDF não tem a estrutura esperada (não foi feito pelo gerador do sistema). */
export class ErroCarimbo extends Error {}

/** Nomes dos recursos acrescentados a cada página (os do pdfkit são F1…, Gs1…). */
const FONTE = '/BCMarca'
const ESTADO = '/BCMarcaGs'
/** Helvetica Bold (uma das 14 fontes-padrão do PDF, sem arquivo embutido): altura das maiúsculas e da linha. */
const ALTURA_MAIUSCULA = 0.718
const ALTURA_LINHA = 1.2
/** Larguras das maiúsculas A–Z na Helvetica Bold (milésimos do corpo; a letra acentuada tem a largura da letra). */
const LARGURAS_AZ = [
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
  611,
]
const LARGURAS: Record<string, number> = {
  ' ': 278,
  '-': 333,
  ...Object.fromEntries(LARGURAS_AZ.map((l, i) => [String.fromCharCode(65 + i), l])),
}
const LARGURA_OUTRA = 722

const largura = (texto: string) =>
  [...texto].reduce((soma, c) => soma + (LARGURAS[c.normalize('NFD')[0]] ?? LARGURA_OUTRA), 0) / 1000

/** Número para o PDF: até 4 casas, sem notação exponencial. */
const num = (x: number) => {
  const s = x.toFixed(4).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}

/**
 * Põe a marca d'água `texto` (com a cor, a transparência e a inclinação da do gerador, `estiloMarcaDagua`) em todas
 * as páginas de `pdf`, sem tocar nos bytes dele: devolve o original seguido da atualização incremental com a marca.
 */
export function carimbarMarcaDagua(pdf: Buffer, texto: string): Buffer {
  try {
    return carimbar(pdf, texto)
  } catch (e) {
    // A leitura do PDF (sintaxePdf.ts) recusa com ErroSintaxePdf: aqui é o mesmo ErroCarimbo, com a mesma mensagem
    if (e instanceof ErroSintaxePdf) throw new ErroCarimbo(e.message)
    throw e
  }
}

function carimbar(pdf: Buffer, texto: string): Buffer {
  texto = texto.trim()
  if (!texto) throw new ErroCarimbo('marca vazia')
  const estilo = estiloMarcaDagua(texto)
  const leitor = lerPdf(pdf)
  const { s, xref, tamanho, objeto, dicionario } = leitor

  // As páginas, com a caixa e os recursos herdados das árvores /Pages acima delas
  const paginas = paginasDoPdf(leitor)

  // Os objetos novos (numerados depois dos do original) e as páginas reescritas (com o mesmo número)
  const escritos: ObjetoEscrito[] = []
  let livre = tamanho
  const novo = (corpo: string) => {
    escritos.push({ num: livre, geracao: 0, corpo })
    return `${livre++} 0 R`
  }
  const fluxo = (conteudo: string) => `<<\n/Length ${conteudo.length}\n>>\nstream\n${conteudo}\nendstream`
  const fonte = novo(`<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica-Bold\n/Encoding /WinAnsiEncoding\n>>`)
  const estado = novo(`<<\n/Type /ExtGState\n/ca ${num(estilo.opacidade)}\n/CA ${num(estilo.opacidade)}\n>>`)
  const abre = novo(fluxo('q'))
  const cor = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(estilo.cor)
  const rgb = cor ? cor.slice(1).map((h) => num(parseInt(h, 16) / 255)) : ['0', '0', '0']
  // O ângulo do pdfmake é no sistema dele (y para baixo); aqui, no do PDF (y para cima)
  const angulo = (-estilo.angulo * Math.PI) / 180
  const [cos, sen] = [Math.cos(angulo), Math.sin(angulo)]
  const largura1 = largura(texto)

  for (const p of paginas) {
    const caixa = /^\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]$/.exec(p.caixa?.trim() ?? '')
    if (!caixa) throw new ErroCarimbo(`página ${p.num} sem MediaBox`)
    const [x0, y0, x1, y1] = caixa.slice(1).map(Number)
    const [L, A] = [x1 - x0, y1 - y0]
    // O maior corpo que cabe inclinado na página (como o tamanho automático da marca do pdfmake)
    const corpo = Math.min(
      L / (largura1 * Math.abs(cos) + ALTURA_LINHA * Math.abs(sen)),
      A / (largura1 * Math.abs(sen) + ALTURA_LINHA * Math.abs(cos)),
    )
    const [w, h] = [largura1 * corpo, ALTURA_MAIUSCULA * corpo]
    // O centro do texto no centro da página
    const tx = x0 + L / 2 - (cos * w) / 2 + (sen * h) / 2
    const ty = y0 + A / 2 - (sen * w) / 2 - (cos * h) / 2

    // Os recursos da página com a fonte e a transparência da marca, com nomes que ela ainda não usa (o PDF que já
    // tem uma marca recebe outra)
    const recursos = dicionario(p.recursos)
    const comMarca = (chave: string, base: string, ref: string) => {
      const sub = dicionario(valor(recursos, chave))
      let nome = base
      for (let n = 2; valor(sub, nome) !== undefined; n++) nome = `${base}${n}`
      const entrada: [string, string] = [chave, escrever([...sub, [nome, ref]])]
      const i = recursos.findIndex(([k]) => k === chave)
      if (i < 0) recursos.push(entrada)
      else recursos[i] = entrada
      return nome
    }
    const nomeFonte = comMarca('/Font', FONTE, fonte)
    const nomeEstado = comMarca('/ExtGState', ESTADO, estado)

    // O desenho: fecha o "q" que guarda o estado de antes do conteúdo original e desenha a marca por cima
    const marca = novo(
      fluxo(
        [
          'Q',
          'q',
          `${nomeEstado} gs`,
          `${rgb.join(' ')} rg`,
          'BT',
          `${nomeFonte} ${num(corpo)} Tf`,
          `${[cos, sen, -sen, cos, tx, ty].map(num).join(' ')} Tm`,
          `(${textoPdf(texto)}) Tj`,
          'ET',
          'Q',
        ].join('\n'),
      ),
    )

    // O conteúdo: uma referência a um fluxo, a uma lista de fluxos ou a lista no próprio dicionário
    const conteudo = valor(p.d, '/Contents')
    const r = referencia(conteudo)
    const lista = r && proximo(s, objeto(r.num)).texto === '[' ? s.slice(objeto(r.num), fimDoValor(s, objeto(r.num))) : null
    const originais = conteudo === undefined ? [] : r && !lista ? [conteudo.trim()] : referencias(lista ?? conteudo)

    const d: Dicionario = [
      ...p.d.filter(([k]) => k !== '/Contents' && k !== '/Resources'),
      ['/Contents', `[${[abre, ...originais, marca].join(' ')}]`],
      ['/Resources', novo(escrever(recursos))],
    ]
    escritos.push({ num: p.num, geracao: p.geracao, corpo: escrever(d) })
  }

  // A atualização: os objetos, a tabela xref só com eles e o trailer apontando para a tabela anterior
  const { texto: saida } = escreverAtualizacao(pdf, xref, escritos, livre)
  return Buffer.concat([pdf, Buffer.from(saida, 'latin1')])
}

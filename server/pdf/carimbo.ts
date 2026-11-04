// Marca d'água sobre um PDF pronto, sem refazê-lo. A cópia de um certificado cancelado ou substituído parte do
// documento emitido (o arquivo guardado, conferido pelo hash), e não de um PDF refeito com o cálculo e o layout de
// hoje: os números são os do certificado entregue (ISO/IEC 17025, 7.5 e 7.8.8).
//
// A marca entra numa atualização incremental (ISO 32000-1, 7.5.6): os bytes do original ficam intactos no começo do
// arquivo, e no fim são acrescentados só o desenho da marca e as páginas que passam a desenhá-la por cima do
// conteúdo (o original fica entre "q" e "Q", e a marca vem depois, com a fonte e a transparência dela). Feito para os
// PDFs do gerador do sistema (pdfkit: tabela xref clássica, sem criptografia); outro formato é `ErroCarimbo`,
// nunca uma cópia sem a marca.

import { estiloMarcaDagua } from './certificado.ts'

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

/**
 * O texto como string literal do PDF na WinAnsiEncoding (sem os parênteses): só ASCII, com os acentos em octal
 * ("SUBSTITUÍDO" → "SUBSTITU\315DO"); o que a codificação não tem sai como "?".
 */
export function textoPdf(texto: string): string {
  return [...texto]
    .map((c) => {
      const n = c.codePointAt(0)!
      if (c === '(' || c === ')' || c === '\\') return `\\${c}`
      if (n >= 0x20 && n <= 0x7e) return c
      if (n >= 0xa0 && n <= 0xff) return `\\${n.toString(8).padStart(3, '0')}`
      return '?'
    })
    .join('')
}

/** Número para o PDF: até 4 casas, sem notação exponencial. */
const num = (x: number) => {
  const s = x.toFixed(4).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}

// ---- Leitura (o mínimo da sintaxe do PDF) -------------------------------------------------------------------

const BRANCOS = '\0\t\n\f\r '
const DELIMITADORES = '()<>[]{}/%'
const regular = (c: string | undefined) => c !== undefined && !BRANCOS.includes(c) && !DELIMITADORES.includes(c)

interface Token {
  texto: string
  inicio: number
  fim: number
}

/** O próximo token a partir de `i` (pula brancos e comentários); null = fim do texto. */
function token(s: string, i: number): Token | null {
  for (;;) {
    while (i < s.length && BRANCOS.includes(s[i])) i++
    if (s[i] !== '%') break
    while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++
  }
  if (i >= s.length) return null
  const c = s[i]
  let f = i + 1
  if ((c === '<' || c === '>') && s[i + 1] === c) f = i + 2
  else if (c === '(') {
    for (let nivel = 1; nivel > 0; f++) {
      if (f >= s.length) throw new ErroCarimbo('texto sem fim')
      if (s[f] === '\\') f++
      else if (s[f] === '(') nivel++
      else if (s[f] === ')') nivel--
    }
  } else if (c === '<') {
    f = s.indexOf('>', i) + 1
    if (f === 0) throw new ErroCarimbo('texto hexadecimal sem fim')
  } else if (c === ')' || c === '>') throw new ErroCarimbo(`"${c}" fora de lugar`)
  else if (c === '/' || !'[]{}'.includes(c)) while (regular(s[f])) f++
  return { texto: s.slice(i, f), inicio: i, fim: f }
}

function proximo(s: string, i: number): Token {
  const t = token(s, i)
  if (!t) throw new ErroCarimbo('fim inesperado')
  return t
}

/** Onde termina o valor que começa em `i` (dicionário, lista, referência "n g R" ou um token só). */
function fimDoValor(s: string, i: number): number {
  const t = proximo(s, i)
  if (t.texto === '<<') {
    for (let j = t.fim; ;) {
      const chave = proximo(s, j)
      if (chave.texto === '>>') return chave.fim
      if (!chave.texto.startsWith('/')) throw new ErroCarimbo('chave de dicionário esperada')
      j = fimDoValor(s, chave.fim)
    }
  }
  if (t.texto === '[') {
    for (let j = t.fim; ;) {
      const x = proximo(s, j)
      if (x.texto === ']') return x.fim
      j = fimDoValor(s, j)
    }
  }
  if (/^\d+$/.test(t.texto)) {
    const geracao = token(s, t.fim)
    const r = geracao && /^\d+$/.test(geracao.texto) ? token(s, geracao.fim) : null
    if (r?.texto === 'R') return r.fim
  }
  return t.fim
}

type Dicionario = [chave: string, valor: string][]

/** As entradas do dicionário que começa em `i`, na ordem, com o valor como está no arquivo. */
function entradas(s: string, i: number): Dicionario {
  if (proximo(s, i).texto !== '<<') throw new ErroCarimbo('dicionário esperado')
  const lista: Dicionario = []
  for (let j = proximo(s, i).fim; ;) {
    const chave = proximo(s, j)
    if (chave.texto === '>>') return lista
    if (!chave.texto.startsWith('/')) throw new ErroCarimbo('chave de dicionário esperada')
    const fim = fimDoValor(s, chave.fim)
    lista.push([chave.texto, s.slice(proximo(s, chave.fim).inicio, fim)])
    j = fim
  }
}

const valor = (d: Dicionario, chave: string) => d.find(([k]) => k === chave)?.[1]
const escrever = (d: Dicionario) => `<<\n${d.map(([k, v]) => `${k} ${v}`).join('\n')}\n>>`
const referencia = (v: string | undefined) => {
  const m = v === undefined ? null : /^(\d+)\s+(\d+)\s+R$/.exec(v.trim())
  return m ? { num: Number(m[1]), geracao: Number(m[2]) } : null
}
const referencias = (lista: string) => [...lista.matchAll(/(\d+)\s+(\d+)\s+R/g)].map((m) => `${m[1]} ${m[2]} R`)

/** A tabela xref (a mais nova primeiro, seguindo /Prev): onde está cada objeto, e o trailer mais novo. */
function lerXref(s: string) {
  const sx = s.lastIndexOf('startxref')
  const inicio = sx < 0 ? NaN : Number(/^\s*(\d+)/.exec(s.slice(sx + 9, sx + 40))?.[1])
  const objetos = new Map<number, { posicao: number; geracao: number } | null>()
  let trailer: Dicionario | null = null
  const vistas = new Set<number>()
  for (let pos: number | null = inicio; pos !== null;) {
    if (!Number.isInteger(pos) || vistas.has(pos) || !s.startsWith('xref', pos))
      throw new ErroCarimbo('tabela xref não encontrada')
    vistas.add(pos)
    const subsecao = /\s*(\d+)\s+(\d+)[ \t]*(?:\r\n|\r|\n)/y
    const linha = /(\d{10}) (\d{5}) ([nf])(?: \r| \n|\r\n)/y
    let i = pos + 4
    for (;;) {
      subsecao.lastIndex = i
      const m = subsecao.exec(s)
      if (!m) break
      i = subsecao.lastIndex
      for (let n = 0, primeiro = Number(m[1]); n < Number(m[2]); n++) {
        linha.lastIndex = i
        const e = linha.exec(s)
        if (!e) throw new ErroCarimbo('linha da tabela xref inválida')
        i = linha.lastIndex
        if (!objetos.has(primeiro + n))
          objetos.set(primeiro + n, e[3] === 'n' ? { posicao: Number(e[1]), geracao: Number(e[2]) } : null)
      }
    }
    const t = proximo(s, i)
    if (t.texto !== 'trailer') throw new ErroCarimbo('trailer não encontrado')
    const d = entradas(s, t.fim)
    if (valor(d, '/XRefStm') !== undefined) throw new ErroCarimbo('tabela xref em fluxo')
    trailer ??= d
    const prev = valor(d, '/Prev')
    pos = prev === undefined ? null : Number(prev)
  }
  return { inicio, objetos, trailer: trailer! }
}

/**
 * Põe a marca d'água `texto` (com a cor, a transparência e a inclinação da do gerador, `estiloMarcaDagua`) em todas
 * as páginas de `pdf`, sem tocar nos bytes dele: devolve o original seguido da atualização incremental com a marca.
 */
export function carimbarMarcaDagua(pdf: Buffer, texto: string): Buffer {
  texto = texto.trim()
  if (!texto) throw new ErroCarimbo('marca vazia')
  const estilo = estiloMarcaDagua(texto)
  const s = pdf.toString('latin1')
  if (!s.startsWith('%PDF-')) throw new ErroCarimbo('não é um PDF')
  const xref = lerXref(s)
  if (valor(xref.trailer, '/Encrypt') !== undefined) throw new ErroCarimbo('PDF criptografado')
  const tamanho = Number(valor(xref.trailer, '/Size'))
  const raiz = referencia(valor(xref.trailer, '/Root'))
  if (!Number.isInteger(tamanho) || !raiz) throw new ErroCarimbo('trailer incompleto')

  /** Onde começa o valor do objeto `n` (logo depois de "n g obj"). */
  const objeto = (n: number) => {
    const e = xref.objetos.get(n)
    if (!e) throw new ErroCarimbo(`objeto ${n} não encontrado`)
    const cabecalho = new RegExp(`${n}\\s+${e.geracao}\\s+obj`, 'y')
    cabecalho.lastIndex = e.posicao
    if (!cabecalho.test(s)) throw new ErroCarimbo(`objeto ${n} fora do lugar`)
    return cabecalho.lastIndex
  }
  const dicionario = (v: string | undefined): Dicionario => {
    if (v === undefined) return []
    const r = referencia(v)
    return r ? entradas(s, objeto(r.num)) : entradas(v, 0)
  }

  // As páginas, com a caixa e os recursos herdados das árvores /Pages acima delas
  type Pagina = { num: number; geracao: number; d: Dicionario; caixa?: string; recursos?: string }
  const paginas: Pagina[] = []
  const visitadas = new Set<number>()
  const visitar = (r: { num: number }, herdado: Pick<Pagina, 'caixa' | 'recursos'>, nivel: number) => {
    if (visitadas.has(r.num) || nivel > 32) throw new ErroCarimbo('árvore de páginas inválida')
    visitadas.add(r.num)
    const d = entradas(s, objeto(r.num))
    const h = { caixa: valor(d, '/MediaBox') ?? herdado.caixa, recursos: valor(d, '/Resources') ?? herdado.recursos }
    if (valor(d, '/Type') === '/Pages') {
      for (const filho of referencias(valor(d, '/Kids') ?? '')) visitar(referencia(filho)!, h, nivel + 1)
    } else paginas.push({ num: r.num, geracao: xref.objetos.get(r.num)!.geracao, d, ...h })
  }
  const arvore = referencia(valor(entradas(s, objeto(raiz.num)), '/Pages'))
  if (!arvore) throw new ErroCarimbo('catálogo sem páginas')
  visitar(arvore, {}, 0)
  if (!paginas.length) throw new ErroCarimbo('PDF sem páginas')

  // Os objetos novos (numerados depois dos do original) e as páginas reescritas (com o mesmo número)
  const escritos: { num: number; geracao: number; corpo: string }[] = []
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
  let saida = /[\r\n]$/.test(s) ? '' : '\n'
  const posicoes = new Map<number, { posicao: number; geracao: number }>()
  for (const o of escritos) {
    posicoes.set(o.num, { posicao: pdf.length + saida.length, geracao: o.geracao })
    saida += `${o.num} ${o.geracao} obj\n${o.corpo}\nendobj\n`
  }
  const inicioXref = pdf.length + saida.length
  const numeros = [...posicoes.keys()].sort((a, b) => a - b)
  // A entrada 0 (a cabeça da lista de livres), como as atualizações costumam trazer
  saida += 'xref\n0 1\n0000000000 65535 f \n'
  for (let i = 0; i < numeros.length;) {
    let j = i
    while (j + 1 < numeros.length && numeros[j + 1] === numeros[j] + 1) j++
    saida += `${numeros[i]} ${j - i + 1}\n`
    for (let n = i; n <= j; n++) {
      const { posicao, geracao } = posicoes.get(numeros[n])!
      saida += `${String(posicao).padStart(10, '0')} ${String(geracao).padStart(5, '0')} n \n`
    }
    i = j + 1
  }
  const trailer: Dicionario = [
    ...xref.trailer.filter(([k]) => k !== '/Size' && k !== '/Prev'),
    ['/Size', String(livre)],
    ['/Prev', String(xref.inicio)],
  ]
  saida += `trailer\n${escrever(trailer)}\nstartxref\n${inicioXref}\n%%EOF\n`
  return Buffer.concat([pdf, Buffer.from(saida, 'latin1')])
}

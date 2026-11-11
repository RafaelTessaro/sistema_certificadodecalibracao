// O mínimo da sintaxe do PDF (ISO 32000-1, 7.2 a 7.5) para mexer num PDF pronto sem refazê-lo: ler os tokens, os
// dicionários e a tabela xref clássica, achar as páginas e acrescentar uma atualização incremental (7.5.6) com os
// objetos novos ou reescritos. Feito para os PDFs do gerador do sistema (pdfkit: tabela xref clássica, sem
// criptografia). Usado pela marca d'água (carimbo.ts) e pela assinatura digital (assinaturaPdf.ts).

/** O PDF não tem a estrutura esperada (não foi feito pelo gerador do sistema). */
export class ErroSintaxePdf extends Error {}

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

// ---- Leitura ------------------------------------------------------------------------------------------------

const BRANCOS = '\0\t\n\f\r '
const DELIMITADORES = '()<>[]{}/%'
const regular = (c: string | undefined) => c !== undefined && !BRANCOS.includes(c) && !DELIMITADORES.includes(c)

export interface Token {
  texto: string
  inicio: number
  fim: number
}

/** O próximo token a partir de `i` (pula brancos e comentários); null = fim do texto. */
export function token(s: string, i: number): Token | null {
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
      if (f >= s.length) throw new ErroSintaxePdf('texto sem fim')
      if (s[f] === '\\') f++
      else if (s[f] === '(') nivel++
      else if (s[f] === ')') nivel--
    }
  } else if (c === '<') {
    f = s.indexOf('>', i) + 1
    if (f === 0) throw new ErroSintaxePdf('texto hexadecimal sem fim')
  } else if (c === ')' || c === '>') throw new ErroSintaxePdf(`"${c}" fora de lugar`)
  else if (c === '/' || !'[]{}'.includes(c)) while (regular(s[f])) f++
  return { texto: s.slice(i, f), inicio: i, fim: f }
}

export function proximo(s: string, i: number): Token {
  const t = token(s, i)
  if (!t) throw new ErroSintaxePdf('fim inesperado')
  return t
}

/** Onde termina o valor que começa em `i` (dicionário, lista, referência "n g R" ou um token só). */
export function fimDoValor(s: string, i: number): number {
  const t = proximo(s, i)
  if (t.texto === '<<') {
    for (let j = t.fim; ;) {
      const chave = proximo(s, j)
      if (chave.texto === '>>') return chave.fim
      if (!chave.texto.startsWith('/')) throw new ErroSintaxePdf('chave de dicionário esperada')
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

export type Dicionario = [chave: string, valor: string][]

/** As entradas do dicionário que começa em `i`, na ordem, com o valor como está no arquivo. */
export function entradas(s: string, i: number): Dicionario {
  if (proximo(s, i).texto !== '<<') throw new ErroSintaxePdf('dicionário esperado')
  const lista: Dicionario = []
  for (let j = proximo(s, i).fim; ;) {
    const chave = proximo(s, j)
    if (chave.texto === '>>') return lista
    if (!chave.texto.startsWith('/')) throw new ErroSintaxePdf('chave de dicionário esperada')
    const fim = fimDoValor(s, chave.fim)
    lista.push([chave.texto, s.slice(proximo(s, chave.fim).inicio, fim)])
    j = fim
  }
}

export const valor = (d: Dicionario, chave: string) => d.find(([k]) => k === chave)?.[1]
export const escrever = (d: Dicionario) => `<<\n${d.map(([k, v]) => `${k} ${v}`).join('\n')}\n>>`
export const referencia = (v: string | undefined) => {
  const m = v === undefined ? null : /^(\d+)\s+(\d+)\s+R$/.exec(v.trim())
  return m ? { num: Number(m[1]), geracao: Number(m[2]) } : null
}
export const referencias = (lista: string) => [...lista.matchAll(/(\d+)\s+(\d+)\s+R/g)].map((m) => `${m[1]} ${m[2]} R`)

/** A tabela xref (a mais nova primeiro, seguindo /Prev): onde está cada objeto, e o trailer mais novo. */
export function lerXref(s: string) {
  const sx = s.lastIndexOf('startxref')
  const inicio = sx < 0 ? NaN : Number(/^\s*(\d+)/.exec(s.slice(sx + 9, sx + 40))?.[1])
  const objetos = new Map<number, { posicao: number; geracao: number } | null>()
  let trailer: Dicionario | null = null
  const vistas = new Set<number>()
  for (let pos: number | null = inicio; pos !== null;) {
    if (!Number.isInteger(pos) || vistas.has(pos) || !s.startsWith('xref', pos))
      throw new ErroSintaxePdf('tabela xref não encontrada')
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
        if (!e) throw new ErroSintaxePdf('linha da tabela xref inválida')
        i = linha.lastIndex
        if (!objetos.has(primeiro + n))
          objetos.set(primeiro + n, e[3] === 'n' ? { posicao: Number(e[1]), geracao: Number(e[2]) } : null)
      }
    }
    const t = proximo(s, i)
    if (t.texto !== 'trailer') throw new ErroSintaxePdf('trailer não encontrado')
    const d = entradas(s, t.fim)
    if (valor(d, '/XRefStm') !== undefined) throw new ErroSintaxePdf('tabela xref em fluxo')
    trailer ??= d
    const prev = valor(d, '/Prev')
    pos = prev === undefined ? null : Number(prev)
  }
  return { inicio, objetos, trailer: trailer! }
}

export type XrefPdf = ReturnType<typeof lerXref>

/** O PDF aberto para leitura: o texto (latin1, um caractere por byte), a xref e o acesso aos objetos. */
export interface LeitorPdf {
  s: string
  xref: XrefPdf
  /** O /Size do trailer: o primeiro número livre para um objeto novo. */
  tamanho: number
  raiz: { num: number; geracao: number }
  /** Onde começa o valor do objeto `n` (logo depois de "n g obj"). */
  objeto(n: number): number
  /** O dicionário de um valor (direto ou por referência); ausente = vazio. */
  dicionario(v: string | undefined): Dicionario
}

export function lerPdf(pdf: Buffer): LeitorPdf {
  const s = pdf.toString('latin1')
  if (!s.startsWith('%PDF-')) throw new ErroSintaxePdf('não é um PDF')
  const xref = lerXref(s)
  if (valor(xref.trailer, '/Encrypt') !== undefined) throw new ErroSintaxePdf('PDF criptografado')
  const tamanho = Number(valor(xref.trailer, '/Size'))
  const raiz = referencia(valor(xref.trailer, '/Root'))
  if (!Number.isInteger(tamanho) || !raiz) throw new ErroSintaxePdf('trailer incompleto')

  const objeto = (n: number) => {
    const e = xref.objetos.get(n)
    if (!e) throw new ErroSintaxePdf(`objeto ${n} não encontrado`)
    const cabecalho = new RegExp(`${n}\\s+${e.geracao}\\s+obj`, 'y')
    cabecalho.lastIndex = e.posicao
    if (!cabecalho.test(s)) throw new ErroSintaxePdf(`objeto ${n} fora do lugar`)
    return cabecalho.lastIndex
  }
  const dicionario = (v: string | undefined): Dicionario => {
    if (v === undefined) return []
    const r = referencia(v)
    return r ? entradas(s, objeto(r.num)) : entradas(v, 0)
  }
  return { s, xref, tamanho, raiz, objeto, dicionario }
}

export interface PaginaPdf {
  num: number
  geracao: number
  d: Dicionario
  /** A /MediaBox e os /Resources, herdados das árvores /Pages acima da página quando ela não tem os próprios. */
  caixa?: string
  recursos?: string
}

/** As páginas, na ordem, com a caixa e os recursos herdados. */
export function paginasDoPdf(leitor: LeitorPdf): PaginaPdf[] {
  const { s, xref, objeto } = leitor
  const paginas: PaginaPdf[] = []
  const visitadas = new Set<number>()
  const visitar = (r: { num: number }, herdado: Pick<PaginaPdf, 'caixa' | 'recursos'>, nivel: number) => {
    if (visitadas.has(r.num) || nivel > 32) throw new ErroSintaxePdf('árvore de páginas inválida')
    visitadas.add(r.num)
    const d = entradas(s, objeto(r.num))
    const h = { caixa: valor(d, '/MediaBox') ?? herdado.caixa, recursos: valor(d, '/Resources') ?? herdado.recursos }
    if (valor(d, '/Type') === '/Pages') {
      for (const filho of referencias(valor(d, '/Kids') ?? '')) visitar(referencia(filho)!, h, nivel + 1)
    } else paginas.push({ num: r.num, geracao: xref.objetos.get(r.num)!.geracao, d, ...h })
  }
  const arvore = referencia(valor(entradas(s, objeto(leitor.raiz.num)), '/Pages'))
  if (!arvore) throw new ErroSintaxePdf('catálogo sem páginas')
  visitar(arvore, {}, 0)
  if (!paginas.length) throw new ErroSintaxePdf('PDF sem páginas')
  return paginas
}

// ---- Escrita ------------------------------------------------------------------------------------------------

export interface ObjetoEscrito {
  num: number
  geracao: number
  /** O valor do objeto (o que vai entre "n g obj" e "endobj"). */
  corpo: string
}

/**
 * A atualização incremental: os objetos, a tabela xref só com eles e o trailer apontando para a tabela anterior
 * (/Prev), com o /Size novo e as outras entradas do trailer anterior (/Root, /Info, /ID) copiadas. Com `id2` (hexadecimal),
 * o 2º elemento do /ID passa a ser ele (ISO 32000-1, 14.4: o 1º é permanente, o 2º muda a cada atualização); sem ele, o
 * /ID é copiado como estava. Devolve o texto a acrescentar depois de `pdf` (latin1) e onde ficou cada objeto ("n g obj",
 * contado desde o começo do arquivo).
 */
export function escreverAtualizacao(
  pdf: Buffer,
  xref: XrefPdf,
  escritos: ObjetoEscrito[],
  tamanho: number,
  o: { id2?: string } = {},
) {
  const s = pdf.toString('latin1', Math.max(0, pdf.length - 2))
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
  const idNovo = (v: string) => {
    const id = /^\[\s*(<[0-9A-Fa-f\s]*>)\s*<[0-9A-Fa-f\s]*>\s*\]$/.exec(v.trim())
    return o.id2 && id ? `[${id[1]} <${o.id2}>]` : v
  }
  const trailer: Dicionario = [
    ...xref.trailer
      .filter(([k]) => k !== '/Size' && k !== '/Prev')
      .map(([k, v]): [string, string] => [k, k === '/ID' ? idNovo(v) : v]),
    ['/Size', String(tamanho)],
    ['/Prev', String(xref.inicio)],
  ]
  saida += `trailer\n${escrever(trailer)}\nstartxref\n${inicioXref}\n%%EOF\n`
  return { texto: saida, posicoes, inicioXref }
}

// Gráficos vetoriais do certificado, em SVG desenhado pelo pdfmake (svg-to-pdfkit) com a fonte Inter:
// o gráfico de erro × carga (barras de ±U e, com declaração de conformidade, os limites ±EMA) e o
// diagrama das posições do ensaio de excentricidade. Legíveis em preto e branco: a diferença entre
// as séries está na forma do marcador e no traço, não só na cor.

import { createRequire } from 'node:module'
import { COR } from './marca.ts'

const FONTE = 'Inter'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (v: number) => Math.round(v * 100) / 100

function texto(
  x: number,
  y: number,
  conteudo: string,
  o: { tamanho?: number; cor?: string; ancora?: 'start' | 'middle' | 'end'; negrito?: boolean } = {},
) {
  return (
    `<text x="${r2(x)}" y="${r2(y)}" font-family="${FONTE}" font-size="${o.tamanho ?? 6.5}"` +
    `${o.negrito ? ' font-weight="bold"' : ''} fill="${o.cor ?? COR.rotulo}" text-anchor="${o.ancora ?? 'start'}">${esc(conteudo)}</text>`
  )
}

/** Passo "redondo" (1, 2, 2,5 ou 5 × 10ⁿ) para cerca de `alvo` divisões no intervalo. */
export function passoRedondo(intervalo: number, alvo = 5): number {
  if (!(intervalo > 0) || !Number.isFinite(intervalo)) return 1
  const bruto = intervalo / alvo
  const ordem = 10 ** Math.floor(Math.log10(bruto))
  const n = bruto / ordem
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return m * ordem
}

/** Casas decimais necessárias para escrever os múltiplos de um passo. */
function casasDoPasso(passo: number): number {
  for (let c = 0; c <= 8; c++) if (Math.abs(Math.round(passo * 10 ** c) - passo * 10 ** c) < 1e-6) return c
  return 8
}

/** Número de eixo: vírgula decimal, espaço fino de milhar e sinal de menos tipográfico. */
function numeroEixo(v: number, casas: number): string {
  const valor = Math.abs(v) < 1e-12 ? 0 : v
  const [int, dec] = Math.abs(valor).toFixed(casas).split('.')
  const inteiro = int.length >= 5 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0') : int
  return `${valor < 0 ? '\u2212' : ''}${inteiro}${dec ? ',' + dec : ''}`
}

// ---- Gráfico erro × carga ----------------------------------------------------------------------

export interface ValorGrafico {
  erro: number
  U: number
}

export interface PontoGrafico {
  carga: number
  crescente: ValorGrafico | null
  decrescente: ValorGrafico | null
  media: ValorGrafico | null
}

/** Trecho do limite de EMA: vale ±ema de `de` até `ate` (unidade da balança). */
export interface TrechoEma {
  de: number
  ate: number
  ema: number
}

export interface OpcoesGrafico {
  largura: number
  altura: number
  unidade: string
  /** Limites ±EMA (declaração de conformidade); vazio = não desenha. */
  ema: TrechoEma[]
}

/** Gráfico do erro de indicação × carga, com barras de ±U e, quando houver, os limites ±EMA. */
export function graficoErros(pontos: PontoGrafico[], o: OpcoesGrafico): string {
  const W = o.largura
  const H = o.altura
  const esq = 46
  const dir = 10
  const topo = 26
  const base = 24
  const x0 = esq
  const x1 = W - dir
  const y0 = topo
  const y1 = H - base

  const usarMedia = pontos.some((p) => p.media)
  const series: Array<{ chave: 'crescente' | 'decrescente' | 'media'; rotulo: string }> = usarMedia
    ? [{ chave: 'media', rotulo: 'Média (↑↓)' }]
    : ([
        { chave: 'crescente', rotulo: 'Carga crescente' },
        { chave: 'decrescente', rotulo: 'Carga decrescente' },
      ].filter((s) => pontos.some((p) => p[s.chave as 'crescente' | 'decrescente'])) as typeof series)
  const duas = series.length === 2

  // Escalas
  // A carga de referência carrega a correção dos pesos (300,002 kg) e, com substituição, a diferença das
  // etapas (40 020 kg): um resíduo pequeno além de uma marca não abre mais uma divisão no eixo.
  const maxCarga = Math.max(...pontos.map((p) => p.carga), ...o.ema.map((t) => t.ate), 0)
  const passoX = passoRedondo(maxCarga * 0.98 || 1, 6)
  const marcas = Math.floor(maxCarga / passoX + 1e-9)
  const xMax = Math.max(passoX, (maxCarga - marcas * passoX <= 0.03 * passoX ? marcas : marcas + 1) * passoX)
  let maior = 0
  for (const p of pontos)
    for (const s of series) {
      const v = p[s.chave]
      if (v) maior = Math.max(maior, Math.abs(v.erro) + v.U)
    }
  for (const t of o.ema) if (t.de <= xMax) maior = Math.max(maior, t.ema)
  if (!(maior > 0)) maior = 1
  const passoY = passoRedondo(2 * maior * 1.08, 6)
  const yMax = Math.ceil((maior * 1.08) / passoY) * passoY
  // Respiro nas pontas para o ponto zero e o último ponto não encostarem nos rótulos
  const respiro = 9
  const X = (c: number) => x0 + respiro + (c / xMax) * (x1 - x0 - 2 * respiro)
  const Y = (e: number) => y0 + ((yMax - e) / (2 * yMax)) * (y1 - y0)

  const partes: string[] = []
  // Grade horizontal e rótulos do eixo Y
  const casasY = casasDoPasso(passoY)
  for (let v = -yMax; v <= yMax + passoY / 2; v += passoY) {
    const y = Y(v)
    const zero = Math.abs(v) < passoY / 1000
    partes.push(
      `<line x1="${r2(x0)}" y1="${r2(y)}" x2="${r2(x1)}" y2="${r2(y)}" stroke="${zero ? '#8E9590' : COR.fioClaro}" stroke-width="${zero ? 0.8 : 0.5}"/>`,
    )
    partes.push(texto(x0 - 6, y + 2.2, numeroEixo(v, casasY), { ancora: 'end', cor: zero ? COR.textoSecundario : COR.rotulo }))
  }
  // Eixo X (embaixo), marcas e rótulos
  const casasX = casasDoPasso(passoX)
  partes.push(`<line x1="${r2(x0)}" y1="${r2(y1)}" x2="${r2(x1)}" y2="${r2(y1)}" stroke="${COR.fio}" stroke-width="0.6"/>`)
  for (let c = 0; c <= xMax + passoX / 2; c += passoX) {
    const x = X(c)
    partes.push(`<line x1="${r2(x)}" y1="${r2(y1)}" x2="${r2(x)}" y2="${r2(y1 + 3)}" stroke="${COR.fio}" stroke-width="0.6"/>`)
    partes.push(texto(x, y1 + 11, numeroEixo(c, casasX), { ancora: 'middle' }))
  }
  partes.push(texto(x0 - 40, 11, `Erro (${o.unidade})`, { tamanho: 6.8, cor: COR.textoSecundario, negrito: true }))
  partes.push(
    texto(x1, H - 1.5, `Carga (${o.unidade})`, { tamanho: 6.8, cor: COR.textoSecundario, ancora: 'end', negrito: true }),
  )

  // Limites ±EMA em degraus (tracejado)
  if (o.ema.length) {
    for (const sinal of [1, -1]) {
      let d = ''
      let anterior: number | null = null
      for (const t of o.ema) {
        const de = Math.max(0, t.de)
        const ate = Math.min(xMax, t.ate)
        if (ate <= de) continue
        const y = Y(sinal * t.ema)
        d += anterior === null ? `M ${r2(X(de))} ${r2(y)} ` : `L ${r2(X(de))} ${r2(y)} `
        d += `L ${r2(X(ate))} ${r2(y)} `
        anterior = y
      }
      if (d) partes.push(`<path d="${d}" fill="none" stroke="${COR.grafite}" stroke-width="0.9" stroke-dasharray="3.2 2.2"/>`)
    }
  }

  // Barras de ±U e marcadores
  const deslocamento = duas ? 3.2 : 0
  series.forEach((s, i) => {
    const dx = duas ? (i === 0 ? -deslocamento : deslocamento) : 0
    for (const p of pontos) {
      const v = p[s.chave]
      if (!v) continue
      const x = X(p.carga) + dx
      const ya = Y(v.erro + v.U)
      const yb = Y(v.erro - v.U)
      partes.push(
        `<line x1="${r2(x)}" y1="${r2(ya)}" x2="${r2(x)}" y2="${r2(yb)}" stroke="${COR.grafite}" stroke-width="0.7"/>` +
          `<line x1="${r2(x - 2.4)}" y1="${r2(ya)}" x2="${r2(x + 2.4)}" y2="${r2(ya)}" stroke="${COR.grafite}" stroke-width="0.7"/>` +
          `<line x1="${r2(x - 2.4)}" y1="${r2(yb)}" x2="${r2(x + 2.4)}" y2="${r2(yb)}" stroke="${COR.grafite}" stroke-width="0.7"/>`,
      )
    }
  })
  series.forEach((s, i) => {
    const dx = duas ? (i === 0 ? -deslocamento : deslocamento) : 0
    for (const p of pontos) {
      const v = p[s.chave]
      if (v) partes.push(marcador(X(p.carga) + dx, Y(v.erro), s.chave === 'decrescente'))
    }
  })

  // Legenda (canto superior direito)
  const itens: Array<{ desenho: (x: number, y: number) => string; rotulo: string }> = series.map((s) => ({
    desenho: (x, y) => marcador(x + 3, y, s.chave === 'decrescente'),
    rotulo: s.rotulo,
  }))
  itens.push({
    desenho: (x, y) =>
      `<line x1="${r2(x + 3)}" y1="${r2(y - 4)}" x2="${r2(x + 3)}" y2="${r2(y + 4)}" stroke="${COR.grafite}" stroke-width="0.7"/>` +
      `<line x1="${r2(x + 1)}" y1="${r2(y - 4)}" x2="${r2(x + 5)}" y2="${r2(y - 4)}" stroke="${COR.grafite}" stroke-width="0.7"/>` +
      `<line x1="${r2(x + 1)}" y1="${r2(y + 4)}" x2="${r2(x + 5)}" y2="${r2(y + 4)}" stroke="${COR.grafite}" stroke-width="0.7"/>`,
    rotulo: 'Incerteza ±U',
  })
  if (o.ema.length)
    itens.push({
      desenho: (x, y) =>
        `<line x1="${r2(x - 3)}" y1="${r2(y)}" x2="${r2(x + 9)}" y2="${r2(y)}" stroke="${COR.grafite}" stroke-width="0.9" stroke-dasharray="3.2 2.2"/>`,
      rotulo: 'Limite ±EMA',
    })
  const larguraItem = (rot: string) => 14 + rot.length * 3.45 + 12
  let x = x1 - itens.reduce((s, it) => s + larguraItem(it.rotulo), 0) + 12
  for (const it of itens) {
    partes.push(it.desenho(x, 9))
    partes.push(texto(x + 11, 11.3, it.rotulo, { cor: COR.textoSecundario }))
    x += larguraItem(it.rotulo)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${partes.join('')}</svg>`
}

/** Círculo cheio (crescente/média) ou losango vazado (decrescente). */
function marcador(x: number, y: number, vazado: boolean): string {
  if (!vazado)
    return `<circle cx="${r2(x)}" cy="${r2(y)}" r="2.6" fill="${COR.marca}" stroke="${COR.marcaTexto}" stroke-width="0.6"/>`
  const r = 3.1
  return (
    `<path d="M ${r2(x)} ${r2(y - r)} L ${r2(x + r)} ${r2(y)} L ${r2(x)} ${r2(y + r)} L ${r2(x - r)} ${r2(y)} Z" ` +
    `fill="#FFFFFF" stroke="${COR.texto}" stroke-width="0.8"/>`
  )
}

// ---- Diagrama da excentricidade ----------------------------------------------------------------

export interface Diagrama {
  svg: string
  largura: number
  altura: number
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function posicaoNumerada(x: number, y: number, numero: number, destaque: boolean): string {
  return (
    `<circle cx="${r2(x)}" cy="${r2(y)}" r="7" fill="${destaque ? COR.marcaTexto : '#FFFFFF'}" stroke="${destaque ? COR.marcaTexto : COR.grafite}" stroke-width="0.8"/>` +
    texto(x, y + 2.45, String(numero), { tamanho: 7, negrito: true, cor: destaque ? '#FFFFFF' : COR.texto, ancora: 'middle' })
  )
}

type Lugar = 'C' | 'FE' | 'TE' | 'TD' | 'FD' | 'F' | 'D' | 'T' | 'E'

function lugarRetangular(rotulo: string): Lugar | null {
  const r = semAcento(rotulo)
  if (r.includes('centro')) return 'C'
  const frente = r.includes('frente')
  const tras = r.includes('tras') || r.includes('fundo')
  const esq = r.includes('esq')
  const dir = r.includes('dir')
  if (frente && esq) return 'FE'
  if (tras && esq) return 'TE'
  if (tras && dir) return 'TD'
  if (frente && dir) return 'FD'
  return null
}

function lugarCircular(rotulo: string): Lugar | null {
  const r = semAcento(rotulo)
  if (r.includes('centro')) return 'C'
  if (r.includes('frente')) return 'F'
  if (r.includes('tras') || r.includes('fundo')) return 'T'
  if (r.includes('esq')) return 'E'
  if (r.includes('dir')) return 'D'
  return null
}

/** Lugares de cada posição pelos rótulos; se algum não for reconhecido, a ordem padrão da cg-18 (com 5 posições). */
function lugares(rotulos: string[], reconhecer: (r: string) => Lugar | null, padrao: Lugar[]): Lugar[] | null {
  const lidos = rotulos.map(reconhecer)
  if (lidos.every((l) => l !== null) && new Set(lidos).size === lidos.length) return lidos as Lugar[]
  return rotulos.length === padrao.length ? padrao : null
}

function rotuloFrente(cx: number, y: number) {
  return texto(cx, y, 'FRENTE', { tamanho: 5.8, cor: COR.rotulo, ancora: 'middle', negrito: true })
}

/**
 * Diagrama das posições do ensaio de excentricidade (vista de cima, frente embaixo), com as posições
 * numeradas na ordem da tabela e a de maior desvio destacada. `null` quando o receptor não tem diagrama.
 */
export function diagramaExcentricidade(
  receptor: string,
  rotulos: string[],
  posicaoMaior: number,
  apoios: number,
): Diagrama | null {
  if (!rotulos.length) return null
  const fundo = `fill="${COR.fundoCabecalho}" stroke="#9AA09C" stroke-width="0.8"`

  if (receptor === 'RETANGULAR') {
    const ls = lugares(rotulos, lugarRetangular, ['C', 'FE', 'TE', 'TD', 'FD'])
    if (!ls) return null
    const W = 128
    const H = 98
    const px = 14
    const py = 6
    const pw = 100
    const ph = 72
    const pos: Record<string, [number, number]> = {
      C: [px + pw / 2, py + ph / 2],
      FE: [px + 17, py + ph - 15],
      TE: [px + 17, py + 15],
      TD: [px + pw - 17, py + 15],
      FD: [px + pw - 17, py + ph - 15],
    }
    const partes = [`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="4" ${fundo}/>`, rotuloFrente(px + pw / 2, H - 9)]
    ls.forEach((l, i) => partes.push(posicaoNumerada(pos[l][0], pos[l][1], i + 1, i === posicaoMaior)))
    return { svg: svg(W, H, partes), largura: W, altura: H }
  }

  if (receptor === 'CIRCULAR') {
    const ls = lugares(rotulos, lugarCircular, ['C', 'F', 'D', 'T', 'E'])
    if (!ls) return null
    const W = 128
    const H = 98
    const cx = W / 2
    const cy = 42
    const raio = 38
    const a = 24
    const pos: Record<string, [number, number]> = {
      C: [cx, cy],
      F: [cx, cy + a],
      T: [cx, cy - a],
      D: [cx + a, cy],
      E: [cx - a, cy],
    }
    const partes = [`<circle cx="${cx}" cy="${cy}" r="${raio}" ${fundo}/>`, rotuloFrente(cx, H - 9)]
    ls.forEach((l, i) => partes.push(posicaoNumerada(pos[l][0], pos[l][1], i + 1, i === posicaoMaior)))
    return { svg: svg(W, H, partes), largura: W, altura: H }
  }

  if (receptor === 'APOIOS' || receptor === 'TANQUE') {
    // Uma posição por apoio: metade na lateral de trás (da esquerda para a direita), metade na da frente.
    const n = rotulos.length
    if (n < 2 || n > 16) return null
    const W = 150
    const H = 98
    const px = 10
    const py = 6
    const pw = 130
    const ph = 72
    const emCima = Math.ceil(n / 2)
    const embaixo = n - emCima
    const xs = (q: number) => Array.from({ length: q }, (_, i) => px + 16 + (q === 1 ? (pw - 32) / 2 : (i * (pw - 32)) / (q - 1)))
    const coords: Array<[number, number]> = [
      ...xs(emCima).map((x): [number, number] => [x, py + 15]),
      ...xs(embaixo)
        .reverse()
        .map((x): [number, number] => [x, py + ph - 15]),
    ]
    const partes = [`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="4" ${fundo}/>`, rotuloFrente(px + pw / 2, H - 9)]
    coords.forEach(([x, y], i) => partes.push(posicaoNumerada(x, y, i + 1, i === posicaoMaior)))
    return { svg: svg(W, H, partes), largura: W, altura: H }
  }

  if (receptor === 'RODOVIARIA') {
    // Plataforma comprida; posições de ida na faixa de cima (→) e de volta na de baixo (←).
    const lidos = rotulos.map((r) => {
      const s = semAcento(r)
      const onde =
        s.includes('inicio') || s.includes('entrada')
          ? 0
          : s.includes('meio') || s.includes('centro')
            ? 1
            : s.includes('fim') || s.includes('saida')
              ? 2
              : -1
      const volta = s.includes('volta')
      return onde < 0 ? null : { onde, volta }
    })
    if (lidos.some((l) => l === null)) return null
    const W = 214
    const H = 98
    const px = 8
    const py = 12
    const pw = 198
    const ph = 62
    const nApoios = apoios >= 2 && apoios <= 16 ? Math.floor(apoios) : 4
    const pares = Math.max(1, Math.ceil(nApoios / 2))
    const partes = [`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="3" ${fundo}/>`]
    // Apoios (células de carga) nas laterais
    for (let i = 0; i < pares; i++) {
      const x = pares === 1 ? px + pw / 2 : px + 10 + (i * (pw - 20)) / (pares - 1)
      for (const y of [py - 2.5, py + ph - 2.5])
        partes.push(
          `<rect x="${r2(x - 3.5)}" y="${r2(y)}" width="7" height="5" fill="#FFFFFF" stroke="${COR.grafite}" stroke-width="0.6"/>`,
        )
    }
    const xsLugar = [px + 26, px + pw / 2, px + pw - 26]
    const yIda = py + 19
    const yVolta = py + ph - 19
    // Sentido de cada faixa: a seta passa por trás das posições e termina antes da última
    partes.push(seta(xsLugar[0], xsLugar[2] - 10, yIda, true))
    partes.push(seta(xsLugar[0] + 10, xsLugar[2], yVolta, false))
    partes.push(
      texto(px + pw / 2, H - 5, `em cima: ida (→) · embaixo: volta (←) · ${nApoios} apoios`, { tamanho: 5.8, ancora: 'middle' }),
    )
    lidos.forEach((l, i) => {
      if (!l) return
      const x = l.volta ? xsLugar[2 - l.onde] : xsLugar[l.onde]
      partes.push(posicaoNumerada(x, l.volta ? yVolta : yIda, i + 1, i === posicaoMaior))
    })
    return { svg: svg(W, H, partes), largura: W, altura: H }
  }

  return null
}

function seta(xa: number, xb: number, y: number, paraDireita: boolean): string {
  const ponta = paraDireita ? xb : xa
  const s = paraDireita ? -1 : 1
  return (
    `<line x1="${r2(xa)}" y1="${r2(y)}" x2="${r2(xb)}" y2="${r2(y)}" stroke="#9AA09C" stroke-width="0.7"/>` +
    `<path d="M ${r2(ponta)} ${r2(y)} L ${r2(ponta + s * 4)} ${r2(y - 2.2)} L ${r2(ponta + s * 4)} ${r2(y + 2.2)} Z" fill="#9AA09C"/>`
  )
}

function svg(w: number, h: number, partes: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${partes.join('')}</svg>`
}

// ---- QR code -------------------------------------------------------------------------------------

interface CodificadorQr {
  measure(no: { qr: string; fit: number; eccLevel: string }): {
    _width: number
    _canvas: Array<{ x: number; y: number; w: number }>
  }
}

const requerer = createRequire(import.meta.url)
let codificadorQr: CodificadorQr | null = null

/**
 * QR code (correção de erro M) em SVG, do tamanho pedido. O `{ qr }` do pdfmake arredonda o módulo para
 * um número inteiro de pontos (um código de 45 módulos sairia com 45 pt); aqui o módulo é fracionário.
 * A matriz vem do próprio codificador do pdfmake. `margem` em módulos (zona de silêncio).
 */
export function qrSvg(texto: string, tamanho: number, margem = 2): Diagrama {
  codificadorQr ??= (requerer('pdfmake/js/qrEnc.js') as { default: CodificadorQr }).default
  const ESCALA = 4000
  const medido = codificadorQr.measure({ qr: texto, fit: ESCALA, eccLevel: 'M' })
  const modulos = medido._canvas.slice(1)
  const lado = modulos[0]?.w ?? 1
  const n = Math.round(medido._width / lado)
  const escuro: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false))
  for (const r of modulos) escuro[Math.round(r.y / lado)][Math.round(r.x / lado)] = true
  // Um retângulo por trecho contínuo de módulos escuros em cada linha
  let d = ''
  for (let i = 0; i < n; i++) {
    let j = 0
    while (j < n) {
      if (!escuro[i][j]) {
        j++
        continue
      }
      const inicio = j
      while (j < n && escuro[i][j]) j++
      d += `M${inicio} ${i}h${j - inicio}v1h${inicio - j}z`
    }
  }
  const total = n + 2 * margem
  return {
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margem} ${-margem} ${total} ${total}" width="${tamanho}" height="${tamanho}">` +
      `<rect x="${-margem}" y="${-margem}" width="${total}" height="${total}" fill="#FFFFFF"/>` +
      `<path d="${d}" fill="#000000"/></svg>`,
    largura: tamanho,
    altura: tamanho,
  }
}

// Desenho vetorial das posições do ensaio de excentricidade, em SVG desenhado pelo pdfmake (svg-to-pdfkit)
// com a fonte Inter: sai na folha de campo (o certificado traz só a tabela das posições, sem desenho).
// Legível em preto e branco.

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

function rotuloFrente(cx: number, y: number, rotulo = 'FRENTE') {
  return texto(cx, y, rotulo, { tamanho: 5.8, cor: COR.rotulo, ancora: 'middle', negrito: true })
}

/**
 * Diagrama das posições do ensaio de excentricidade (vista de cima, frente embaixo), com as posições
 * numeradas na ordem da tabela e a de maior desvio destacada. `null` quando o receptor não tem diagrama.
 * `frente`: legenda do lado de baixo (padrão "FRENTE"; a folha de campo diz qual lado é a frente).
 */
export function diagramaExcentricidade(
  receptor: string,
  rotulos: string[],
  posicaoMaior: number,
  apoios: number,
  { frente = 'FRENTE' }: { frente?: string } = {},
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
    const partes = [
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="4" ${fundo}/>`,
      rotuloFrente(px + pw / 2, H - 9, frente),
    ]
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
    const partes = [`<circle cx="${cx}" cy="${cy}" r="${raio}" ${fundo}/>`, rotuloFrente(cx, H - 9, frente)]
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
    const partes = [
      `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="4" ${fundo}/>`,
      rotuloFrente(px + pw / 2, H - 9, frente),
    ]
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

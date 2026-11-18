// PNGs montados à mão para os testes da assinatura que vai para o pdfkit (server/campo/png.ts): um válido do jeito que
// o canvas do app gera (RGBA, 8 bits) e os estragados que passam no `validarPng` (o cabeçalho está certo), mas que o
// png-js não consegue decodificar.

import { crc32, deflateSync } from 'node:zlib'

/** Um bloco do PNG: tamanho, tipo, dados e o CRC (o tamanho pode ser forçado, para o bloco "negativo"). */
export function blocoPng(tipo: string, dados: Buffer, tamanho = dados.length): Buffer {
  const cabeca = Buffer.alloc(8)
  cabeca.writeUInt32BE(tamanho >>> 0, 0)
  cabeca.write(tipo, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([cabeca.subarray(4), dados])) >>> 0, 0)
  return Buffer.concat([cabeca, dados, crc])
}

/** O IHDR: largura, altura, bits, tipo de cor e entrelaçamento. */
export function ihdrPng(o: { largura: number; altura: number; bits?: number; cor?: number; entrelacamento?: number }): Buffer {
  const d = Buffer.alloc(13)
  d.writeUInt32BE(o.largura, 0)
  d.writeUInt32BE(o.altura, 4)
  d[8] = o.bits ?? 8
  d[9] = o.cor ?? 6
  d[12] = o.entrelacamento ?? 0
  return blocoPng('IHDR', d)
}

/** As linhas cruas (filtro 0 e os pixels em branco) de uma imagem 8 bits com `canais` por pixel. */
export function linhasPng(largura: number, altura: number, canais: number, filtro = 0): Buffer {
  const linha = 1 + largura * canais
  const b = Buffer.alloc(altura * linha, 0xff)
  for (let y = 0; y < altura; y++) b[y * linha] = filtro
  return b
}

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** O PNG em data URL com os blocos dados (o IEND é acrescentado, salvo `semFim`). */
export function pngDeBlocos(blocos: Buffer[], o: { semFim?: boolean } = {}): string {
  const fim = o.semFim ? [] : [blocoPng('IEND', Buffer.alloc(0))]
  return `data:image/png;base64,${Buffer.concat([ASSINATURA, ...blocos, ...fim]).toString('base64')}`
}

const L = 120
const A = 40

/** Uma assinatura RGBA válida (120 × 40, como as do canvas, só que em branco). */
export const pngRgbaValido = () =>
  pngDeBlocos([ihdrPng({ largura: L, altura: A }), blocoPng('IDAT', deflateSync(linhasPng(L, A, 4)))])

/** RGBA com o cabeçalho certo e o IDAT que não é zlib: o png-js lança "incorrect header check" num callback. */
export const pngRgbaIdatQueNaoEZlib = () =>
  pngDeBlocos([ihdrPng({ largura: L, altura: A }), blocoPng('IDAT', Buffer.from('isto não é zlib, é texto qualquer'))])

/** RGBA com o zlib certo e um filtro de linha que não existe (5): "Invalid filter algorithm" no mesmo callback. */
export const pngRgbaFiltroInvalido = () =>
  pngDeBlocos([ihdrPng({ largura: L, altura: A }), blocoPng('IDAT', deflateSync(linhasPng(L, A, 4, 5)))])

/**
 * RGBA válida com um bloco tEXt de uns 200 KB (a data URL ainda cabe no limite do `validarPng`): o png-js passa o texto
 * inteiro para o String.fromCharCode.apply e estoura a pilha ("Maximum call stack size exceeded").
 */
export const pngRgbaComTextoGrande = () =>
  pngDeBlocos([
    ihdrPng({ largura: L, altura: A }),
    blocoPng('tEXt', Buffer.concat([Buffer.from('k\0', 'latin1'), Buffer.alloc(200_000, 0x61)])),
    blocoPng('IDAT', deflateSync(linhasPng(L, A, 4))),
  ])

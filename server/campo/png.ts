// A imagem de uma assinatura que veio do celular, conferida por inteiro antes de ir para o pdfkit (1.1.0). O `validarPng`
// (shared/campo/registro.ts, puro) só olha o cabeçalho. O pdfkit decodifica a imagem com o png-js, que lança o erro do
// zlib (ou o do filtro de linha inválido) dentro de um callback: vira uncaughtException e derruba o servidor, toda vez que
// alguém abre a folha impressa assinada. Com um tamanho de bloco "negativo", o png-js também entra em laço. Por isso,
// aqui, com o node:zlib, só passa o PNG simples que ele decodifica sem susto: os blocos inteiros até o IEND, o IHDR de 13
// bytes primeiro, 8 bits por canal, sem entrelaçamento, tipo de cor 0, 2, 3 (com a paleta, só nele), 4 ou 6, o tRNS só
// no tipo 3, o tEXt pequeno e os dados (IDAT) que descomprimem exatamente no tamanho das linhas, cada uma com o filtro
// de 0 a 4.

import { inflateSync } from 'node:zlib'
import { validarPng } from '#shared/campo/registro.ts'

const PREFIXO_PNG = 'data:image/png;base64,'
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** Canais por pixel de cada tipo de cor (8 bits por canal). */
const CANAIS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
/**
 * O maior bloco tEXt aceito. O png-js lê o texto com um String.fromCharCode.apply do bloco inteiro, que estoura a pilha
 * a partir de uns 125 mil bytes; os outros blocos auxiliares ele pula. O canvas do app não grava tEXt.
 */
const MAIOR_TEXTO = 4096

/** O PNG da assinatura (data URL) pode ir para o pdfkit? false = a folha diz que a imagem está ilegível. */
export function pngDecodificavel(dataUrl: unknown): boolean {
  if (typeof dataUrl !== 'string' || validarPng(dataUrl) !== null) return false
  const b = Buffer.from(dataUrl.slice(PREFIXO_PNG.length), 'base64')
  if (b.length < 8 || ASSINATURA_PNG.some((x, i) => b[i] !== x)) return false

  let ihdr: Buffer | null = null
  let cores = 0
  let transparencia = -1
  let fim = false
  const idat: Buffer[] = []
  for (let pos = 8; !fim;) {
    if (pos + 12 > b.length) return false
    const tamanho = b.readUInt32BE(pos)
    const tipo = b.toString('latin1', pos + 4, pos + 8)
    if (tamanho > 0x7fffffff || pos + 12 + tamanho > b.length || !/^[A-Za-z]{4}$/.test(tipo)) return false
    if (!ihdr && tipo !== 'IHDR') return false
    const dados = b.subarray(pos + 8, pos + 8 + tamanho)
    if (tipo === 'tEXt' && tamanho > MAIOR_TEXTO) return false
    if (tipo === 'IHDR') {
      if (ihdr || tamanho !== 13) return false
      ihdr = dados
    } else if (tipo === 'PLTE') {
      if (cores || !tamanho || tamanho % 3 || tamanho > 768) return false
      cores = tamanho / 3
    } else if (tipo === 'tRNS') {
      if (transparencia >= 0) return false
      transparencia = tamanho
    } else if (tipo === 'IDAT') idat.push(dados)
    else if (tipo === 'IEND') fim = true
    pos += 12 + tamanho
  }
  if (!ihdr || !idat.length) return false

  const largura = ihdr.readUInt32BE(0)
  const altura = ihdr.readUInt32BE(4)
  const [bits, cor, compressao, filtro, entrelacamento] = ihdr.subarray(8, 13)
  const canais = CANAIS[cor]
  if (bits !== 8 || !canais || compressao !== 0 || filtro !== 0 || entrelacamento !== 0) return false
  // A paleta só no tipo 3 (em outro tipo, o pdfkit trataria a imagem como indexada)
  if ((cor === 3) !== cores > 0) return false
  // O tRNS só no tipo 3, até um por cor da paleta. Com o canal alfa, o png-js se perde no bloco; no cinza e no RGB, o
  // pdfkit monta a máscara errada (no cinza, com o byte alto, que esconde o preto e apaga o traço da assinatura)
  if (transparencia >= 0 && !(cor === 3 && transparencia <= cores)) return false

  const linha = 1 + largura * canais
  const esperado = altura * linha
  let pixels: Buffer
  try {
    pixels = inflateSync(Buffer.concat(idat), { maxOutputLength: esperado + 1 })
  } catch {
    return false
  }
  if (pixels.length !== esperado) return false
  for (let y = 0; y < altura; y++) if (pixels[y * linha] > 4) return false
  return true
}

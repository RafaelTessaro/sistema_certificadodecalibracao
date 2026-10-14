// Assinatura digitalizada: a foto ou o scan que a pessoa envia vira uma imagem PNG pequena, recortada
// e sem o fundo do papel, pronta para o certificado. Tudo acontece no navegador.

import { ASSINATURA_MAX } from '#shared/usuarios.ts'

/** Tamanho máximo da imagem final (o certificado mostra a assinatura bem menor que isso). */
export const ASSINATURA_LARGURA = 600
export const ASSINATURA_ALTURA = 200

/** Lado maior usado na análise (fotos de celular têm 4000 px ou mais). */
const ANALISE_MAX = 1600
/** Arquivos maiores que isso nem são abertos. */
const ARQUIVO_MAX = 20 * 1024 * 1024

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível abrir a imagem. Use um arquivo PNG ou JPG.'))
    }
    img.src = url
  })
}

function novaTela(largura: number, altura: number) {
  const tela = document.createElement('canvas')
  tela.width = Math.max(1, Math.round(largura))
  tela.height = Math.max(1, Math.round(altura))
  const ctx = tela.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Este navegador não consegue preparar a imagem. Tente no Chrome ou no Edge.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return { tela, ctx }
}

const luminancia = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

/**
 * Torna o papel transparente: pixels com o brilho do fundo somem e a tinta fica, com borda suave.
 * O fundo é estimado pela maioria dos pixels (a assinatura ocupa pouco da imagem). Com o fundo
 * escuro não dá para separar, e a imagem fica como está.
 */
function tirarFundo(px: Uint8ClampedArray) {
  const histograma = new Uint32Array(256)
  const total = px.length / 4
  for (let i = 0; i < px.length; i += 4) histograma[Math.round(luminancia(px[i], px[i + 1], px[i + 2]))]++
  // Brilho do papel: o valor que os 40 % de pixels mais claros alcançam
  let acumulado = 0
  let fundo = 255
  for (let l = 255; l >= 0; l--) {
    acumulado += histograma[l]
    if (acumulado >= total * 0.4) {
      fundo = l
      break
    }
  }
  if (fundo < 110) return
  for (let i = 0; i < px.length; i += 4) {
    const diferenca = fundo - luminancia(px[i], px[i + 1], px[i + 2])
    const opacidade = Math.min(1, Math.max(0, (diferenca - 22) / 60))
    px[i + 3] = Math.round(px[i + 3] * opacidade)
  }
}

/**
 * Retângulo que contém a tinta (pixels bem visíveis), com uma pequena margem. Pontinhos soltos (poeira,
 * sombra na borda do papel) não esticam o recorte: as pontas com menos de 0,2 % da tinta ficam de fora.
 */
function areaDaTinta(px: Uint8ClampedArray, largura: number, altura: number) {
  const colunas = new Uint32Array(largura)
  const linhas = new Uint32Array(altura)
  let total = 0
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (px[(y * largura + x) * 4 + 3] > 110) {
        colunas[x]++
        linhas[y]++
        total++
      }
    }
  }
  if (!total) return null
  const corte = Math.floor(total * 0.002)
  const limites = (h: Uint32Array) => {
    let ini = 0
    let soma = 0
    while (ini < h.length - 1 && soma + h[ini] <= corte) soma += h[ini++]
    let fim = h.length - 1
    soma = 0
    while (fim > ini && soma + h[fim] <= corte) soma += h[fim--]
    return [ini, fim] as const
  }
  let [x0, x1] = limites(colunas)
  let [y0, y1] = limites(linhas)
  const margem = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03) + 2
  x0 = Math.max(0, x0 - margem)
  y0 = Math.max(0, y0 - margem)
  x1 = Math.min(largura - 1, x1 + margem)
  y1 = Math.min(altura - 1, y1 + margem)
  return { x: x0, y: y0, largura: x1 - x0 + 1, altura: y1 - y0 + 1 }
}

/**
 * Prepara a imagem enviada: recorta a assinatura, tira o fundo branco do papel (quando a imagem ainda
 * não tem transparência), reduz para caber em 600 × 200 px e devolve um PNG em data URL menor que
 * `ASSINATURA_MAX`.
 */
export async function prepararAssinatura(arquivo: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(arquivo.type)) {
    throw new Error('Use uma imagem PNG ou JPG. Fotos do iPhone (HEIC) precisam ser convertidas antes.')
  }
  if (arquivo.size > ARQUIVO_MAX) throw new Error('A imagem passa de 20 MB. Use uma foto menor.')
  const img = await carregarImagem(arquivo)
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('A imagem está vazia.')

  // 1. Uma cópia de tamanho razoável para analisar
  const fator = Math.min(1, ANALISE_MAX / Math.max(img.naturalWidth, img.naturalHeight))
  const analise = novaTela(img.naturalWidth * fator, img.naturalHeight * fator)
  analise.ctx.drawImage(img, 0, 0, analise.tela.width, analise.tela.height)
  const dados = analise.ctx.getImageData(0, 0, analise.tela.width, analise.tela.height)
  const px = dados.data

  // 2. Sem transparência (foto ou scan): o papel vira transparente
  let transparentes = 0
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) transparentes++
  if (transparentes < (px.length / 4) * 0.02) tirarFundo(px)
  analise.ctx.putImageData(dados, 0, 0)

  // 3. Só a área com a tinta
  const area = areaDaTinta(px, analise.tela.width, analise.tela.height)
  if (!area)
    throw new Error('Não encontramos a assinatura na imagem. Use uma foto da assinatura em caneta escura sobre papel branco.')

  // 4. Reduz até caber em 600 × 200 e no limite de tamanho
  let escala = Math.min(1, ASSINATURA_LARGURA / area.largura, ASSINATURA_ALTURA / area.altura)
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const saida = novaTela(area.largura * escala, area.altura * escala)
    saida.ctx.drawImage(analise.tela, area.x, area.y, area.largura, area.altura, 0, 0, saida.tela.width, saida.tela.height)
    const url = saida.tela.toDataURL('image/png')
    if (url.length <= ASSINATURA_MAX) return url
    escala *= 0.8
  }
  throw new Error('Não foi possível reduzir a imagem. Tente uma foto mais simples, só com a assinatura.')
}

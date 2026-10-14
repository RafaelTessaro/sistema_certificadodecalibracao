// Identidade visual do certificado: cores, logotipo vetorial e a faixa de marca do rodapé.
// Tudo em SVG simples (sem <mask>/<use>), que o svg-to-pdfkit do pdfmake desenha com fidelidade.

/** Paleta do certificado: a marca em doses mínimas, texto quase preto e cinzas neutros (bom em P&B). */
export const COR = {
  /** Verde da marca (logo, detalhes). */
  marca: '#019F42',
  /** Verde escuro para texto e números de seção (contraste na impressão). */
  marcaTexto: '#067A3B',
  /** Verde bem claro, para fundos de destaque. */
  marcaFundo: '#EEF7F1',
  /** Grafite da marca. */
  grafite: '#58585A',
  texto: '#1B1D1F',
  textoSecundario: '#565B60',
  rotulo: '#6B7075',
  fio: '#CDD2CF',
  fioClaro: '#E6E9E7',
  fundoCabecalho: '#F1F3F2',
  zebra: '#F8F9F8',
  alerta: '#9A3412',
  alertaFundo: '#FFF6ED',
} as const

// Desenho do ícone (src/assets/logo/balancas-icone.svg), com o recorte do <mask> trocado por formas
// brancas: o certificado é sempre impresso sobre fundo branco.
const B = 'M -30 -91.2 L -30 0 A 30 30 0 0 0 26 15 L 26 56.3 A 62 62 0 0 1 -62 0 L -62 -73.3 A 96 96 0 0 1 -30 -91.2 Z'
const Q = 'M 30 91.2 L 30 0 A 30 30 0 0 0 -26 -15 L -26 -56.3 A 62 62 0 0 1 62 0 L 62 73.3 A 96 96 0 0 1 30 91.2 Z'

/** Ícone da Balanças.com (círculo grafite com o "b" e o "q" verdes). */
export const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" width="200" height="200">` +
  `<circle r="100" fill="${COR.grafite}"/>` +
  `<circle r="34" fill="#FFFFFF"/>` +
  `<path d="${B}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round"/>` +
  `<path d="${Q}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round"/>` +
  `<path d="${B}" fill="${COR.marca}"/>` +
  `<path d="${Q}" fill="${COR.marca}"/>` +
  `</svg>`

/**
 * Faixa de marca no pé da página, inspirada no papel timbrado: barra grafite fina e, no canto
 * direito, a curva verde, separadas por um corte diagonal branco.
 */
export function faixaRodapeSvg(largura: number, altura: number): string {
  const w = largura
  const h = altura
  const barra = 6.5
  const fimBarra = w * 0.735
  const inclinacao = barra
  const inicioVerde = fimBarra + 5
  const pontaVerde = h - 25
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<path d="M 0 ${h - barra} L ${fimBarra + inclinacao} ${h - barra} L ${fimBarra} ${h} L 0 ${h} Z" fill="${COR.grafite}"/>` +
    `<path d="M ${inicioVerde} ${h} L ${inicioVerde + inclinacao * 1.6} ${h - barra * 1.6} ` +
    `Q ${w * 0.9} ${pontaVerde + 1} ${w} ${pontaVerde} L ${w} ${h} Z" fill="${COR.marca}"/>` +
    `</svg>`
  )
}

// Identidade visual do certificado: cores, logotipo vetorial e a assinatura de marca do rodapé.
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
// brancas: o certificado é sempre impresso sobre fundo branco. O contorno branco de 12 unidades deixa
// o vão entre o anel e o "b"/"q" tão aberto quanto no timbrado impresso (e separa o verde do grafite no P&B).
const B = 'M -30 -91.2 L -30 0 A 30 30 0 0 0 26 15 L 26 56.3 A 62 62 0 0 1 -62 0 L -62 -73.3 A 96 96 0 0 1 -30 -91.2 Z'
const Q = 'M 30 91.2 L 30 0 A 30 30 0 0 0 -26 -15 L -26 -56.3 A 62 62 0 0 1 62 0 L 62 73.3 A 96 96 0 0 1 30 91.2 Z'

/** Ícone da Balanças.com (círculo grafite com o "b" e o "q" verdes). */
export const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" width="200" height="200">` +
  `<circle r="100" fill="${COR.grafite}"/>` +
  `<circle r="34" fill="#FFFFFF"/>` +
  `<path d="${B}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round"/>` +
  `<path d="${Q}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round"/>` +
  `<path d="${B}" fill="${COR.marca}"/>` +
  `<path d="${Q}" fill="${COR.marca}"/>` +
  `</svg>`

/**
 * Tintas do timbrado (cabeçalho e rodapé). Cinzas exatamente neutros (R = G = B): a laser colorida
 * imprime com o toner preto só, sem franjas; e nenhum texto miúdo mais claro que #555.
 */
export const TIMBRADO = {
  /** Grafite da marca em versão neutra (fios e palavra-marca). */
  grafite: '#585858',
  /** Texto principal do timbrado (razão social, número). */
  texto: '#262626',
  /** Texto secundário (endereço, contatos, página). */
  secundario: '#555555',
} as const

const r2 = (v: number) => Math.round(v * 100) / 100

/** Ângulo do corte diagonal do timbrado oficial (entre a faixa grafite e a colina verde). */
const ANGULO_CORTE = 40

/**
 * Assinatura do rodapé: o fio grafite corre na largura do texto e, depois de um vão branco a 40°
 * (o mesmo corte do papel timbrado da empresa), vira um trapézio verde que termina na margem direita.
 * Pouca tinta, nada sangra e tudo fica dentro da área que a impressora de escritório imprime; o vão
 * branco separa o verde do grafite também no P&B, em que os dois viram cinzas quase iguais.
 * Base de tudo em y = altura.
 */
export function assinaturaRodapeSvg(
  largura: number,
  { comprimento = 60, altura = 4.5, espessura = 0.75, vao = 2.2 } = {},
): string {
  const a = (ANGULO_CORTE * Math.PI) / 180
  const inicioVerde = largura - comprimento
  // Fio grafite: termina num corte paralelo ao lado do trapézio, a "vao" pt (perpendicular) dele
  const fimFio = inicioVerde - vao / Math.sin(a)
  const fio =
    `M 0 ${r2(altura - espessura)} L ${r2(fimFio + espessura / Math.tan(a))} ${r2(altura - espessura)} ` +
    `L ${r2(fimFio)} ${r2(altura)} L 0 ${r2(altura)} Z`
  const verde =
    `M ${r2(inicioVerde)} ${r2(altura)} L ${r2(inicioVerde + altura / Math.tan(a))} 0 ` +
    `L ${r2(largura)} 0 L ${r2(largura)} ${r2(altura)} Z`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(largura)} ${r2(altura)}" width="${r2(largura)}" height="${r2(altura)}">` +
    `<path d="${fio}" fill="${TIMBRADO.grafite}"/>` +
    `<path d="${verde}" fill="${COR.marca}"/>` +
    `</svg>`
  )
}

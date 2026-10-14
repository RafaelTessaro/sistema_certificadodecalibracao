// Identidade visual do certificado: cores, logotipo vetorial, ícones de contato e o fio da marca do rodapé.
// Tudo em SVG simples (sem <mask>/<use>/<clipPath>), que o svg-to-pdfkit do pdfmake desenha com fidelidade e
// sem grupos de transparência.

/**
 * Paleta do certificado: a marca em doses mínimas, texto em preto puro e cinzas neutros (bom em P&B). O texto
 * é #000, como o do timbrado (TINTA): o driver manda o preto puro só para o toner preto e sem retícula, e o
 * corpo sai tão nítido quanto o rodapé (um quase preto sairia pontilhado na laser P&B e montado com C+M+Y+K,
 * com halos de desregistro, na colorida). Os cinzas de texto são exatamente neutros (R = G = B), pelo mesmo
 * motivo; a hierarquia vem do corpo, do peso e desses dois cinzas.
 */
export const COR = {
  /** Verde da marca (logo, detalhes). */
  marca: '#019F42',
  /** Verde escuro para texto e números de seção (contraste na impressão). */
  marcaTexto: '#067A3B',
  /** Verde bem claro, para fundos de destaque. */
  marcaFundo: '#EEF7F1',
  /** Grafite da marca (logo e desenhos do corpo; o texto do timbrado usa as TINTAs neutras). */
  grafite: '#58585A',
  texto: '#000000',
  textoSecundario: '#5A5A5A',
  rotulo: '#6F6F6F',
  fio: '#CDD2CF',
  fioClaro: '#E6E9E7',
  fundoCabecalho: '#F1F3F2',
  zebra: '#F8F9F8',
  alerta: '#9A3412',
  alertaFundo: '#FFF6ED',
} as const

/** Rótulo de campo do corpo do certificado (versal pequena, espaçada, cinza). */
export const ROTULO = { font: 'InterMedio', fontSize: 6.1, color: COR.rotulo, characterSpacing: 0.3 } as const

/**
 * Tintas do papel timbrado. Todo texto e todo fio em preto 100 % (#000): o driver manda o preto puro só para
 * o toner preto e sem retícula, e o texto miúdo sai nítido até numa laser barata (um cinza, mesmo escuro,
 * vira pontinhos e serrilha). A hierarquia vem do corpo e do peso, não do cinza. Só a palavra-marca usa o
 * grafite da marca, em corpo grande e negrito, onde a retícula não atrapalha a leitura (num cinza neutro,
 * R = G = B, que a laser colorida imprime só com o preto).
 */
export const TINTA = {
  /** Texto e fios do timbrado: título, nº, contatos, razões sociais, rodapé, paginação e os dois fios. */
  texto: '#000000',
  /** Palavra-marca. */
  grafite: '#585858',
} as const

// Desenho do ícone (src/assets/logo/balancas-icone.svg), com o recorte do <mask> trocado por formas
// brancas: o certificado é sempre impresso sobre fundo branco. O contorno branco entre o anel grafite e o
// "bq" verde é o do arquivo oficial (traço de 8 unidades, 4 de cada lado), proporcional ao logo: a capa e o
// cabeçalho corrido mostram o mesmo símbolo em escalas diferentes. Só num logo pequeno (o do cabeçalho
// corrido) ele engrossa, para nunca ficar abaixo de RESPIRO_MINIMO_PT de cada lado: em P&B o verde e o
// grafite viram quase o mesmo cinza, e é esse respiro branco, que o espalhamento do toner não pode fechar,
// que mantém o desenho legível.
const B = 'M -30 -91.2 L -30 0 A 30 30 0 0 0 26 15 L 26 56.3 A 62 62 0 0 1 -62 0 L -62 -73.3 A 96 96 0 0 1 -30 -91.2 Z'
const Q = 'M 30 91.2 L 30 0 A 30 30 0 0 0 -26 -15 L -26 -56.3 A 62 62 0 0 1 62 0 L 62 73.3 A 96 96 0 0 1 30 91.2 Z'
/** Traço do recorte no arquivo oficial (unidades do viewBox de 200). */
const TRACO_OFICIAL = 8
/** Respiro branco mínimo entre o anel e o "bq", em pt de papel, de cada lado. */
const RESPIRO_MINIMO_PT = 0.65

/** Arredonda as coordenadas do SVG (saída estável e enxuta). */
const r2 = (v: number) => Math.round(v * 100) / 100

/** Ícone da Balanças.com (círculo grafite com o "b" e o "q" verdes) para um logo de `diametro` pt. */
export function logoSvg(diametro: number): string {
  const traco = r2(Math.max(TRACO_OFICIAL, (2 * RESPIRO_MINIMO_PT * 200) / diametro))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" width="200" height="200">` +
    `<circle r="100" fill="${COR.grafite}"/>` +
    `<circle r="34" fill="#FFFFFF"/>` +
    `<path d="${B}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="${traco}" stroke-linejoin="round"/>` +
    `<path d="${Q}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="${traco}" stroke-linejoin="round"/>` +
    `<path d="${B}" fill="${COR.marca}"/>` +
    `<path d="${Q}" fill="${COR.marca}"/>` +
    `</svg>`
  )
}

// Ícones de contato, genéricos e em traço (desenhos do Lucide, licença ISC — https://lucide.dev). O envelope
// ganhou altura (17 em vez de 16 unidades) para ter o mesmo peso visual do telefone e do globo.
const ICONES = {
  telefone:
    '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4' +
    'a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  email: '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="3.5" width="20" height="17" rx="2"/>',
  site: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
} as const

export type Icone = keyof typeof ICONES

/**
 * Ícone de contato em traço (24 × 24 unidades; o tamanho final vem do nó do pdfmake), no verde escuro da
 * marca. O traço (1,8/24: 0,6 pt num ícone de 8 pt) tem a espessura da haste da Poppins Regular no corpo dos
 * contatos: o ícone pesa o mesmo que o texto ao lado e não se desfaz em pontinhos na impressão em P&B.
 */
export function iconeSvg(nome: Icone, cor: string = COR.marcaTexto, traco = 1.8): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${cor}" ` +
    `stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome]}</svg>`
  )
}

// Fio da marca, no rodapé: a faixa do papel timbrado oficial (faixa grafite, corte branco a 40° e a cunha
// verde que sobe no canto) traduzida para um documento técnico, quase sem tinta. A faixa vira um fio preto,
// com o mesmo peso e a mesma cor do fio do cabeçalho (o quadro da página tem o mesmo peso em cima e
// embaixo), e a cunha vira um trapézio verde, bem mais alto que o fio, na ponta direita: a borda esquerda
// sobe a 40°, paralela ao corte do fio, e um vão branco de largura constante separa os dois. É pela forma,
// não só pela cor, que a cunha se distingue: em P&B, o verde vira um cinza médio, mas continua uma cunha
// inclinada ao lado de um fio preto, e não um fio que muda de tom.
const ANGULO = (40 * Math.PI) / 180

export interface FioMarca {
  /** Largura total (a do texto): a cunha termina em x = largura. */
  largura: number
  /** Espessura do fio. */
  fio: number
  /** Altura da cunha (o desenho tem essa altura; fio e cunha se apoiam na mesma linha de baixo). */
  alturaCunha: number
  /** Pé da cunha (canto de baixo à esquerda), em x local. */
  peCunha: number
  /** Vão branco entre o fio e a cunha, medido na perpendicular ao corte de 40°. */
  vao: number
  /** Cor do fio. */
  cor: string
}

/** Medidas do fio da marca (coordenadas locais): o avanço da borda de 40° da cunha e o pé do corte do fio. */
export function geometriaFioMarca(f: FioMarca) {
  const avancoCunha = f.alturaCunha / Math.tan(ANGULO)
  const avancoFio = f.fio / Math.tan(ANGULO)
  const fimFio = f.peCunha - f.vao / Math.sin(ANGULO)
  return { avancoCunha, avancoFio, fimFio }
}

/** SVG do fio da marca (fio + vão branco a 40° + cunha verde), só com paths simples. */
export function fioMarcaSvg(f: FioMarca): string {
  const { avancoCunha, avancoFio, fimFio } = geometriaFioMarca(f)
  const h = r2(f.alturaCunha)
  const topoFio = r2(f.alturaCunha - f.fio)
  const fio = `M 0 ${topoFio} L ${r2(fimFio + avancoFio)} ${topoFio} L ${r2(fimFio)} ${h} L 0 ${h} Z`
  const cunha = `M ${r2(f.peCunha)} ${h} L ${r2(f.peCunha + avancoCunha)} 0 L ${r2(f.largura)} 0 L ${r2(f.largura)} ${h} Z`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(f.largura)} ${h}" width="${r2(f.largura)}" height="${h}">` +
    `<path d="${fio}" fill="${f.cor}"/>` +
    `<path d="${cunha}" fill="${COR.marca}"/>` +
    `</svg>`
  )
}

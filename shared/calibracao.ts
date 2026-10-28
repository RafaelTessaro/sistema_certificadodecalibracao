// Ligação entre a calibração (como é gravada) e o motor de cálculo (shared/metrologia):
// converte os pesos padrão para a unidade da balança e monta a entrada do cálculo.
// Usado no navegador (cálculo ao vivo) e no servidor (emissão e PDF).

import { calculoLegado, massaLegivel } from './dominio.ts'
import { calcular, emaInstrumento, emaPeso, sugerirPontos } from './metrologia/index.ts'
import type { ArCalculo, EntradaCalculo, PecaCalculo, ResultadoCalculo, TermicaCalculo } from './metrologia/tipos.ts'
import type {
  Balanca,
  CalibracaoInput,
  CondicoesAmbientais,
  EnsaioIndicacao,
  OpcoesCalculo,
  Padrao,
  PecaCarga,
  PesoPadrao,
  Unidade,
} from './tipos.ts'

/** Gramas em uma unidade. */
export const GRAMAS: Record<Unidade, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 }

/** Converte um valor em gramas para a unidade (arredondado em 12 algarismos para não carregar ruído binário). */
export const deGramas = (g: number, u: Unidade) => Number((g / GRAMAS[u]).toPrecision(12))

/** Peça de peso pronta para o cálculo, na unidade da balança. */
export function pecaParaCalculo(padrao: Padrao, peso: PesoPadrao, unidade: Unidade, quantidade = 1): PecaCalculo {
  const emaMg = padrao.classe ? (emaPeso(peso.nominal, padrao.classe) ?? 0) : 0
  const usarCertificado = padrao.uso === 'CERTIFICADO' && peso.incerteza > 0
  return {
    nominal: deGramas(peso.nominal, unidade),
    correcao: usarCertificado ? deGramas(peso.correcao / 1000, unidade) : 0,
    incerteza: usarCertificado ? deGramas(peso.incerteza / 1000, unidade) : 0,
    k: peso.k > 0 ? peso.k : 2,
    ema: deGramas(emaMg / 1000, unidade),
    usarCertificado,
    quantidade,
    classe: padrao.classe,
    // Registro antigo pode não ter os campos (JSON gravado antes desta versão)
    densidade: (padrao.densidade ?? 0) > 0 ? padrao.densidade : 0,
    uDensidade: (padrao.incertezaDensidade ?? 0) > 0 ? padrao.incertezaDensidade! : 0,
    jogo: padrao.identificacao,
  }
}

/** Peças de uma carga (referências gravadas) → peças do cálculo. Referência a peso inexistente é ignorada. */
export function pecasParaCalculo(pecas: PecaCarga[], padroes: Padrao[], unidade: Unidade): PecaCalculo[] {
  const porId = new Map(padroes.map((p) => [p.id, p]))
  const out: PecaCalculo[] = []
  for (const r of pecas) {
    const padrao = porId.get(r.padraoId)
    const peso = padrao?.pesos.find((x) => x.id === r.pesoId)
    if (padrao && peso) out.push(pecaParaCalculo(padrao, peso, unidade, r.quantidade))
  }
  return out
}

/** Soma dos nominais das peças, na unidade da balança. */
export function cargaDasPecas(pecas: PecaCarga[], padroes: Padrao[], unidade: Unidade): number {
  return deGramas(
    pecasParaCalculo(pecas, padroes, 'g').reduce((s, p) => s + p.nominal * p.quantidade, 0),
    unidade,
  )
}

/**
 * Monta uma carga com os pesos dos padrões escolhidos: do maior para o menor, sem repetir peça.
 * `falta` > 0 quando os pesos não somam a carga pedida (na unidade da balança).
 */
export function montarCarga(
  carga: number,
  unidade: Unidade,
  padroes: Padrao[],
): { pecas: PecaCarga[]; falta: number; total: number } {
  const alvoG = carga * GRAMAS[unidade]
  const disponiveis = padroes
    .filter((p) => p.tipo === 'PESOS' && p.ativo)
    .flatMap((p) => p.pesos.map((peso) => ({ padraoId: p.id, peso })))
    .sort((a, b) => b.peso.nominal - a.peso.nominal)
  const pecas: PecaCarga[] = []
  let restante = alvoG
  const tolerancia = Math.max(alvoG * 1e-9, 1e-9)
  for (const d of disponiveis) {
    if (d.peso.nominal <= restante + tolerancia) {
      pecas.push({ padraoId: d.padraoId, pesoId: d.peso.id, quantidade: 1 })
      restante -= d.peso.nominal
      if (restante <= tolerancia) break
    }
  }
  const falta = restante > tolerancia ? deGramas(restante, unidade) : 0
  return { pecas, falta, total: deGramas(alvoG - Math.max(restante, 0), unidade) }
}

/**
 * As peças de uma carga atendem a 6.1 do POP (R76 3.7.1): a soma dos EMA delas (R111, pela classe de cada jogo) não
 * passa de 1/3 do EMA OIML inicial da balança na carga? É a regra que o cálculo confere (o aviso "Classe dos pesos
 * insuficiente"), sem a alternativa da incerteza dos pesos E1/E2 (na classe I, com a deriva pelo EMA, ela só
 * atende quando a soma também atende). null quando não dá para conferir: balança sem classe, sem peças, peças que
 * não somam a carga ou alguma sem a classe (sem EMA).
 */
export function pesosAtendemNaCarga(carga: number, pecas: PecaCarga[], balanca: Balanca, padroes: Padrao[]): boolean | null {
  const ema = emaInstrumento(carga, balanca, 'OIML_INICIAL')
  const calculo = pecasParaCalculo(pecas, padroes, balanca.unidade)
  if (ema === null || !(carga > 0) || !calculo.length || calculo.some((p) => !(p.ema > 0))) return null
  if (diferencaDoPonto(carga, 0, cargaDasPecas(pecas, padroes, balanca.unidade)) !== 0) return null
  const soma = calculo.reduce((s, p) => s + p.ema * p.quantidade, 0)
  return soma <= (ema / 3) * (1 + 1e-9)
}

/**
 * Pontos sugeridos do erro de indicação (`sugerirPontos`) para os pesos escolhidos: na classe I, as cargas perto de
 * 25, 50 e 75 % de Max ficam no múltiplo de 10 g mais próximo em que as peças montadas (`montarCarga`, como o
 * editor e a folha montam) atendem a 6.1 do POP (`pesosAtendemNaCarga`; quando os pesos não fecham a carga ou não
 * têm classe, a série E2). O botão "Sugerir pontos" e a folha de campo sem rascunho usam esta: as cargas batem.
 */
export function pontosSugeridos(balanca: Balanca, padroes: Padrao[]): number[] {
  return sugerirPontos(balanca, (carga) => {
    const m = montarCarga(carga, balanca.unidade, padroes)
    return m.falta > 0 ? null : pesosAtendemNaCarga(carga, m.pecas, balanca, padroes)
  })
}

/** Carga de pesos padrão de cada etapa de substituição (0 quando o ensaio não usa substituição). */
export function cargaDaEtapa(ensaio: Pick<EnsaioIndicacao, 'substituicao'>, padroes: Padrao[], unidade: Unidade): number {
  return ensaio.substituicao.ativa ? cargaDasPecas(ensaio.substituicao.pecas, padroes, unidade) : 0
}

/**
 * Pesos por cima de um ponto do erro de indicação. Com substituição (nível > 0), as etapas por baixo já
 * somam nível × carga da etapa e os pesos só completam o resto (é assim que o cálculo soma a carga do
 * ponto); sem, os pesos fazem a carga inteira. `diferenca`: (etapas + pesos) − carga, na unidade da
 * balança: > 0 passa da carga (nível alto demais), < 0 falta.
 */
export function montarPonto(
  carga: number,
  nivel: number,
  cargaEtapa: number,
  unidade: Unidade,
  padroes: Padrao[],
): { pecas: PecaCarga[]; diferenca: number } {
  if (!(carga > 0)) return { pecas: [], diferenca: 0 }
  const etapas = nivel > 0 && cargaEtapa > 0 ? nivel * cargaEtapa : 0
  const resto = Math.max(0, Number((carga - etapas).toPrecision(12)))
  const m = resto > 0 ? montarCarga(resto, unidade, padroes) : { pecas: [], total: 0 }
  return { pecas: m.pecas, diferenca: diferencaDoPonto(carga, etapas, m.total) }
}

/** (etapas + pesos) − carga, sem o ruído binário e com zero quando a diferença é só arredondamento. */
export function diferencaDoPonto(carga: number, etapas: number, pesos: number): number {
  const d = Number((etapas + pesos - carga).toPrecision(12))
  return Math.abs(d) > Math.abs(carga) * 1e-9 ? d : 0
}

/** Peças de uma carga em texto: "20 kg + 10 kg + 5 kg" (agrupa iguais: "2 × 5 kg"), do maior para o menor. */
export function descreverPecas(pecas: PecaCarga[], padroes: Padrao[]): string {
  const porId = new Map(padroes.flatMap((p) => p.pesos.map((w) => [`${p.id}:${w.id}`, w.nominal])))
  const grupos = new Map<number, number>()
  for (const x of pecas) {
    const g = porId.get(`${x.padraoId}:${x.pesoId}`)
    if (g !== undefined) grupos.set(g, (grupos.get(g) ?? 0) + x.quantidade)
  }
  return [...grupos.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([g, n]) => `${n > 1 ? `${n} × ` : ''}${massaLegivel(g)}`)
    .join(' + ')
}

function indicacaoParaCalculo(ensaio: EnsaioIndicacao, padroes: Padrao[], unidade: Unidade): EntradaCalculo['indicacao'] {
  const etapa = cargaDaEtapa(ensaio, padroes, unidade)
  return {
    metodo: ensaio.metodo,
    retornoZero: ensaio.retornoZero,
    pontos: ensaio.pontos.map((p) => {
      const nivel = ensaio.substituicao.ativa ? p.nivelSubstituicao : 0
      const pesos = p.pecas.length ? cargaDasPecas(p.pecas, padroes, unidade) : 0
      // Carga nominal do ponto: com substituição, as etapas (nível × carga dos pesos da etapa) mais os pesos por cima
      const carga = nivel > 0 && etapa > 0 ? Number((nivel * etapa + pesos).toPrecision(12)) : p.pecas.length ? pesos : p.carga
      return {
        id: p.id,
        carga,
        pecas: pecasParaCalculo(p.pecas, padroes, unidade),
        crescente: p.crescente,
        decrescente: p.decrescente,
        nivelSubstituicao: nivel,
      }
    }),
    substituicao: {
      ativa: ensaio.substituicao.ativa,
      pecas: pecasParaCalculo(ensaio.substituicao.pecas, padroes, unidade),
      etapas: ensaio.substituicao.etapas,
    },
  }
}

const lido = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** Média do início e do fim; só uma lida → ela; nenhuma → null. */
const mediaDe = (x: number | null | undefined, y: number | null | undefined): number | null => {
  const a = lido(x)
  const b = lido(y)
  return a !== null && b !== null ? (a + b) / 2 : (a ?? b)
}

/** Ar do local para o motor: médias de t e UR (início e fim) e a pressão; null sem o registro do ambiente. */
export function arDoAmbiente(a: CondicoesAmbientais | undefined | null, ajustadaAntes: boolean): ArCalculo | null {
  if (!a) return null
  return {
    temperatura: mediaDe(a.temperaturaInicial, a.temperaturaFinal),
    umidade: mediaDe(a.umidadeInicial, a.umidadeFinal),
    pressao: lido(a.pressao),
    ajustadaAntes,
  }
}

/** ΔT pesos − ar para o motor (medido, ou a aclimatação); null quando nenhum dos dois foi registrado. */
export function termicaDoAmbiente(a: CondicoesAmbientais | undefined | null): TermicaCalculo | null {
  const deltaT = lido(a?.deltaTPesos)
  const ac = a?.aclimatacao
  const aclimatacao =
    ac && lido(ac.deltaT0) !== null && lido(ac.minutos) !== null ? { deltaT0: ac.deltaT0, minutos: ac.minutos } : null
  return deltaT === null && !aclimatacao ? null : { deltaT, aclimatacao }
}

/**
 * Opções do cálculo do "como encontrado" na classe I: com o empuxo "ajustada logo antes" (5c), o ensaio antes do
 * ajuste não foi feito logo após um ajuste. Como t, UR e p são medidos na classe I, ele vai pela densidade do ar
 * medida (7.1.2-4/5a), com u(ρa) da situação A (A3-2, com a variação do local); sem t, UR ou p, o motor usa a 5d e
 * dá a pendência. Nas demais classes, as opções como vieram (os certificados emitidos continuam calculando igual).
 */
export function opcoesComoEncontrado(opcoes: OpcoesCalculo, classe: Balanca['classe'] | undefined): OpcoesCalculo {
  if (classe !== 'I' || opcoes.empuxo !== 'AJUSTADO') return opcoes
  return { ...opcoes, empuxo: 'MEDIDO' }
}

/**
 * Entrada do motor de cálculo a partir da calibração gravada. `momento`: o ensaio final (logo após o ajuste,
 * quando houve) ou o "como encontrado" (sempre sem ajuste logo antes).
 */
export function entradaDoCalculo(
  k: Pick<CalibracaoInput, 'opcoes' | 'repetibilidade' | 'excentricidade' | 'indicacao' | 'conformidade'> &
    Partial<Pick<CalibracaoInput, 'ambiente' | 'ajuste' | 'calculoLegado'>> & { emissao?: unknown },
  balanca: Pick<Balanca, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'>,
  padroes: Padrao[],
  ensaio: EnsaioIndicacao = k.indicacao,
  momento: 'FINAL' | 'COMO_ENCONTRADO' = 'FINAL',
): EntradaCalculo {
  const ajustadaAntes = momento === 'FINAL' && (k.ajuste?.realizado ?? 'NAO') !== 'NAO'
  return {
    instrumento: { unidade: balanca.unidade, classe: balanca.classe, tipoFaixas: balanca.tipoFaixas, faixas: balanca.faixas },
    // O certificado emitido antes do cálculo da classe I (e a revisão dele) calcula como na época
    opcoes: momento === 'COMO_ENCONTRADO' && !calculoLegado(k) ? opcoesComoEncontrado(k.opcoes, balanca.classe) : k.opcoes,
    repetibilidade: k.repetibilidade.map((r) => ({ id: r.id, carga: r.carga, leituras: r.leituras })),
    excentricidade: {
      aplicavel: k.excentricidade.aplicavel,
      carga: k.excentricidade.carga,
      metodo: k.excentricidade.metodo,
      posicoes: k.excentricidade.posicoes,
    },
    indicacao: indicacaoParaCalculo(ensaio, padroes, balanca.unidade),
    conformidade: k.conformidade,
    ar: arDoAmbiente(k.ambiente, ajustadaAntes),
    termica: termicaDoAmbiente(k.ambiente),
  }
}

/** Calcula os ensaios finais e, quando houve ajuste e foi medido, o "como encontrado". */
export function calcularCalibracao(
  k: Pick<
    CalibracaoInput,
    'opcoes' | 'repetibilidade' | 'excentricidade' | 'indicacao' | 'conformidade' | 'comoEncontrado' | 'ajuste'
  > &
    Partial<Pick<CalibracaoInput, 'ambiente' | 'calculoLegado'>> & { emissao?: unknown },
  balanca: Pick<Balanca, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'>,
  padroes: Padrao[],
): { resultado: ResultadoCalculo; comoEncontrado: ResultadoCalculo | null } {
  const resultado = calcular(entradaDoCalculo(k, balanca, padroes))
  const temAntes = k.ajuste.realizado !== 'NAO' && !!k.comoEncontrado?.pontos.some((p) => p.crescente !== null)
  const comoEncontrado = temAntes ? calcular(entradaDoCalculo(k, balanca, padroes, k.comoEncontrado!, 'COMO_ENCONTRADO')) : null
  return { resultado, comoEncontrado }
}

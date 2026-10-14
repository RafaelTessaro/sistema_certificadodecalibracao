// Ligação entre a calibração (como é gravada) e o motor de cálculo (shared/metrologia):
// converte os pesos padrão para a unidade da balança e monta a entrada do cálculo.
// Usado no navegador (cálculo ao vivo) e no servidor (emissão e PDF).

import { calcular, emaPeso } from './metrologia/index.ts'
import type { EntradaCalculo, PecaCalculo, ResultadoCalculo } from './metrologia/tipos.ts'
import type { Balanca, CalibracaoInput, EnsaioIndicacao, Padrao, PecaCarga, PesoPadrao, Unidade } from './tipos.ts'

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

function indicacaoParaCalculo(ensaio: EnsaioIndicacao, padroes: Padrao[], unidade: Unidade): EntradaCalculo['indicacao'] {
  const etapa = ensaio.substituicao.ativa ? cargaDasPecas(ensaio.substituicao.pecas, padroes, unidade) : 0
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

/** Entrada do motor de cálculo a partir da calibração gravada. */
export function entradaDoCalculo(
  k: Pick<CalibracaoInput, 'opcoes' | 'repetibilidade' | 'excentricidade' | 'indicacao' | 'conformidade'>,
  balanca: Pick<Balanca, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'>,
  padroes: Padrao[],
  ensaio: EnsaioIndicacao = k.indicacao,
): EntradaCalculo {
  return {
    instrumento: { unidade: balanca.unidade, classe: balanca.classe, tipoFaixas: balanca.tipoFaixas, faixas: balanca.faixas },
    opcoes: k.opcoes,
    repetibilidade: k.repetibilidade.map((r) => ({ id: r.id, carga: r.carga, leituras: r.leituras })),
    excentricidade: {
      aplicavel: k.excentricidade.aplicavel,
      carga: k.excentricidade.carga,
      metodo: k.excentricidade.metodo,
      posicoes: k.excentricidade.posicoes,
    },
    indicacao: indicacaoParaCalculo(ensaio, padroes, balanca.unidade),
    conformidade: k.conformidade,
  }
}

/** Calcula os ensaios finais e, quando houve ajuste e foi medido, o "como encontrado". */
export function calcularCalibracao(
  k: Pick<
    CalibracaoInput,
    'opcoes' | 'repetibilidade' | 'excentricidade' | 'indicacao' | 'conformidade' | 'comoEncontrado' | 'ajuste'
  >,
  balanca: Pick<Balanca, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'>,
  padroes: Padrao[],
): { resultado: ResultadoCalculo; comoEncontrado: ResultadoCalculo | null } {
  const resultado = calcular(entradaDoCalculo(k, balanca, padroes))
  const temAntes = k.ajuste.realizado !== 'NAO' && !!k.comoEncontrado?.pontos.some((p) => p.crescente !== null)
  const comoEncontrado = temAntes ? calcular(entradaDoCalculo(k, balanca, padroes, k.comoEncontrado!)) : null
  return { resultado, comoEncontrado }
}

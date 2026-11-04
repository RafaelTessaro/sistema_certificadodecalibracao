// Ligação entre a calibração (como é gravada) e o motor de cálculo (shared/metrologia):
// converte os pesos padrão para a unidade da balança e monta a entrada do cálculo.
// Usado no navegador (cálculo ao vivo) e no servidor (emissão e PDF).

import {
  calculoLegado,
  CLASSES_PESO,
  massaLegivel,
  minimosDoPopComoAviso,
  regrasDoPopComoAviso,
  valorAmbiente,
} from './dominio.ts'
import { calcular, emaInstrumento, emaPeso, sugerirPontos } from './metrologia/index.ts'
import type {
  ArCalculo,
  EntradaCalculo,
  LeiturasOriginais,
  PecaCalculo,
  ResultadoCalculo,
  TermicaCalculo,
} from './metrologia/tipos.ts'
import type {
  Balanca,
  CalibracaoInput,
  ClassePeso,
  CondicoesAmbientais,
  EnsaioIndicacao,
  OpcoesCalculo,
  Padrao,
  PecaCarga,
  PesoPadrao,
  PontoIndicacao,
  Unidade,
} from './tipos.ts'

/** Gramas em uma unidade. */
export const GRAMAS: Record<Unidade, number> = { mg: 0.001, g: 1, kg: 1000, t: 1_000_000 }

/** Converte um valor em gramas para a unidade (arredondado em 12 algarismos para não carregar ruído binário). */
export const deGramas = (g: number, u: Unidade) => Number((g / GRAMAS[u]).toPrecision(12))

/**
 * Peça de peso pronta para o cálculo, na unidade da balança. A peça sem U num jogo pelo valor do certificado entra pelo
 * nominal (u = EMA/√3, conservador nas classes II a IIII) e leva a correção do certificado que ficou de fora
 * (`correcaoSemU`): o cálculo avisa e, na classe I, a emissão pede a U (`pendenciasEmissao`, POP 6.1).
 */
export function pecaParaCalculo(padrao: Padrao, peso: PesoPadrao, unidade: Unidade, quantidade = 1): PecaCalculo {
  const emaMg = padrao.classe ? (emaPeso(peso.nominal, padrao.classe) ?? 0) : 0
  const usarCertificado = padrao.uso === 'CERTIFICADO' && peso.incerteza > 0
  const semU = padrao.uso === 'CERTIFICADO' && !usarCertificado
  return {
    nominal: deGramas(peso.nominal, unidade),
    correcao: usarCertificado ? deGramas(peso.correcao / 1000, unidade) : 0,
    incerteza: usarCertificado ? deGramas(peso.incerteza / 1000, unidade) : 0,
    k: peso.k > 0 ? peso.k : 2,
    ema: deGramas(emaMg / 1000, unidade),
    usarCertificado,
    ...(semU ? { correcaoSemU: Number.isFinite(peso.correcao) ? deGramas(peso.correcao / 1000, unidade) : 0 } : {}),
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

/**
 * Por que alguma peça de uma carga não entra no cálculo: o jogo dela não está entre os padrões escolhidos (desmarcado
 * depois de escolher as peças à mão, ou fora do rascunho copiado) ou a peça foi tirada do cadastro do jogo. '' quando
 * todas entram. `pecasParaCalculo` e `cargaDasPecas` só ignoram essas peças: sem este motivo, o ponto sairia com a
 * carga das que sobraram (0, com todas fora) e o erro igual à leitura inteira.
 */
export function pecasSemPadrao(pecas: PecaCarga[], padroes: Padrao[]): string {
  const porId = new Map(padroes.map((p) => [p.id, p]))
  let foraDosEscolhidos = false
  const tiradas: string[] = []
  for (const r of pecas) {
    const padrao = porId.get(r.padraoId)
    if (!padrao) foraDosEscolhidos = true
    else if (!padrao.pesos.some((w) => w.id === r.pesoId) && !tiradas.includes(padrao.identificacao))
      tiradas.push(padrao.identificacao)
  }
  const motivos: string[] = []
  if (foraDosEscolhidos) motivos.push('pesos de um jogo que não está entre os padrões escolhidos')
  if (tiradas.length)
    motivos.push(
      tiradas.length > 1
        ? `peças tiradas do cadastro dos jogos ${tiradas.slice(0, -1).join(', ')} e ${tiradas.at(-1)}`
        : `peça tirada do cadastro do jogo ${tiradas[0]}`,
    )
  return motivos.join(' e ')
}

/** Soma dos nominais das peças, na unidade da balança. */
export function cargaDasPecas(pecas: PecaCarga[], padroes: Padrao[], unidade: Unidade): number {
  return deGramas(
    pecasParaCalculo(pecas, padroes, 'g').reduce((s, p) => s + p.nominal * p.quantidade, 0),
    unidade,
  )
}

/** Posição da classe R111 do jogo, da melhor (E1 = 0) para a pior; sem classe, depois de todas. */
const ordemClasse = (classe: ClassePeso | '') => {
  const i = CLASSES_PESO.indexOf(classe as ClassePeso)
  return i < 0 ? CLASSES_PESO.length : i
}

type Montagem = { pecas: PecaCarga[]; falta: number; total: number }

/** Gulosa: do maior nominal para o menor (no empate, a peça do jogo de classe melhor), sem repetir peça. */
function montarGulosa(alvoG: number, unidade: Unidade, jogos: Padrao[]): Montagem {
  const disponiveis = jogos
    .flatMap((p) => p.pesos.map((peso) => ({ padraoId: p.id, peso, ordem: ordemClasse(p.classe) })))
    .sort((a, b) => b.peso.nominal - a.peso.nominal || a.ordem - b.ordem)
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
 * Monta uma carga com os pesos dos padrões escolhidos: do maior para o menor, sem repetir peça (no empate de nominal,
 * a peça do jogo de classe melhor). `falta` > 0 quando os pesos não somam a carga pedida (na unidade da balança).
 *
 * Com a balança (na mesma unidade), a montagem respeita a classe dos pesos (POP 6.1; R76 3.7.1): quando as peças não
 * atendem (`pesosAtendemNaCarga`), tenta de novo sem os jogos de classe pior, um nível por vez, e fica com a primeira
 * montagem completa que atende. Peça de classe pior só entra quando não há outra saída: sem nenhuma montagem completa
 * que atenda, a completa de menor Σ EMA.
 */
export function montarCarga(carga: number, unidade: Unidade, padroes: Padrao[], balanca?: Balanca): Montagem {
  const alvoG = carga * GRAMAS[unidade]
  const jogos = padroes.filter((p) => p.tipo === 'PESOS' && p.ativo)
  const primeira = montarGulosa(alvoG, unidade, jogos)
  if (!balanca || primeira.falta > 0 || pesosAtendemNaCarga(carga, primeira.pecas, balanca, padroes) !== false) return primeira
  const somaEma = (m: Montagem) => pecasParaCalculo(m.pecas, padroes, unidade).reduce((s, p) => s + p.ema * p.quantidade, 0)
  let melhor = primeira
  const niveis = [...new Set(jogos.map((p) => ordemClasse(p.classe)))].sort((a, b) => b - a)
  for (const pior of niveis.slice(0, -1)) {
    const m = montarGulosa(
      alvoG,
      unidade,
      jogos.filter((p) => ordemClasse(p.classe) < pior),
    )
    if (m.falta > 0) continue
    if (pesosAtendemNaCarga(carga, m.pecas, balanca, padroes) !== false) return m
    if (somaEma(m) < somaEma(melhor)) melhor = m
  }
  return melhor
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
    const m = montarCarga(carga, balanca.unidade, padroes, balanca)
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
 * balança: > 0 passa da carga (nível alto demais), < 0 falta. Com a balança, os pesos pela classe (ver `montarCarga`).
 */
export function montarPonto(
  carga: number,
  nivel: number,
  cargaEtapa: number,
  unidade: Unidade,
  padroes: Padrao[],
  balanca?: Balanca,
): { pecas: PecaCarga[]; diferenca: number } {
  if (!(carga > 0)) return { pecas: [], diferenca: 0 }
  const etapas = nivel > 0 && cargaEtapa > 0 ? nivel * cargaEtapa : 0
  const resto = Math.max(0, Number((carga - etapas).toPrecision(12)))
  // Só os pesos por cima das etapas: a conferência da classe vale para a carga deles (como no cálculo, só sem etapas)
  const m = resto > 0 ? montarCarga(resto, unidade, padroes, etapas > 0 ? undefined : balanca) : { pecas: [], total: 0 }
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

/**
 * Leituras que o método de carregamento usa: só a subida (contínuo, com descarga), só a descida (decrescente)
 * ou as duas. A coluna escondida pela troca de método guarda o que foi digitado antes, mas não entra no
 * cálculo nem no certificado.
 */
export function leiturasDoMetodo(
  p: Pick<PontoIndicacao, 'crescente' | 'decrescente'>,
  metodo: EnsaioIndicacao['metodo'],
): { crescente: number | null; decrescente: number | null } {
  return {
    crescente: metodo === 'DECRESCENTE' ? null : p.crescente,
    decrescente: metodo === 'CRESCENTE_DECRESCENTE' || metodo === 'DECRESCENTE' ? p.decrescente : null,
  }
}

function indicacaoParaCalculo(ensaio: EnsaioIndicacao, padroes: Padrao[], unidade: Unidade): EntradaCalculo['indicacao'] {
  const etapa = cargaDaEtapa(ensaio, padroes, unidade)
  const etapaSemPadrao = ensaio.substituicao.ativa ? pecasSemPadrao(ensaio.substituicao.pecas, padroes) : ''
  return {
    metodo: ensaio.metodo,
    retornoZero: ensaio.retornoZero,
    pontos: ensaio.pontos.map((p) => {
      const nivel = ensaio.substituicao.ativa ? p.nivelSubstituicao : 0
      const leituras = leiturasDoMetodo(p, ensaio.metodo)
      // Peças (do ponto ou das etapas por baixo) fora dos padrões: a carga digitada, sem cálculo, e o motivo (pendência)
      const semPadrao = pecasSemPadrao(p.pecas, padroes)
      const motivo = semPadrao
        ? `${semPadrao}; escolha os pesos do ponto de novo`
        : nivel > 0 && etapaSemPadrao
          ? `etapas de substituição com ${etapaSemPadrao}; escolha os pesos da etapa de novo`
          : ''
      if (motivo) return { id: p.id, carga: p.carga, pecas: [], ...leituras, nivelSubstituicao: nivel, semPadrao: motivo }
      const pesos = p.pecas.length ? cargaDasPecas(p.pecas, padroes, unidade) : 0
      const etapas = nivel > 0 && etapa > 0 ? nivel * etapa : 0
      // Carga nominal do ponto: com substituição, as etapas (nível × carga dos pesos da etapa) mais os pesos por cima
      const carga = etapas > 0 ? Number((etapas + pesos).toPrecision(12)) : p.pecas.length ? pesos : p.carga
      // Etapas e pesos que não somam a carga digitada (pesos que não fecham, peças à mão de outra carga, nível
      // alto demais): o certificado reporta o valor dos pesos, e a diferença vira pendência. Substituição sem os pesos
      // da etapa já é pendência do motor
      const semEtapa = nivel > 0 && !(etapa > 0)
      const diferenca = !semEtapa && (p.pecas.length || etapas > 0) ? diferencaDoPonto(p.carga, etapas, pesos) : 0
      return {
        id: p.id,
        carga,
        pecas: pecasParaCalculo(p.pecas, padroes, unidade),
        ...leituras,
        nivelSubstituicao: nivel,
        ...(diferenca !== 0 ? { cargaDigitada: p.carga } : {}),
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

/**
 * Ar do local para o motor: médias de t e UR (início e fim) e a pressão; null sem o registro do ambiente. O valor
 * fora da faixa (`FAIXAS_AMBIENTE`: 81 °C, 92,7 hPa digitado em kPa) conta como não registrado; a pendência diz qual.
 */
export function arDoAmbiente(a: CondicoesAmbientais | undefined | null, ajustadaAntes: boolean): ArCalculo | null {
  if (!a) return null
  return {
    temperatura: mediaDe(valorAmbiente(a.temperaturaInicial, 'temperatura'), valorAmbiente(a.temperaturaFinal, 'temperatura')),
    umidade: mediaDe(valorAmbiente(a.umidadeInicial, 'umidade'), valorAmbiente(a.umidadeFinal, 'umidade')),
    pressao: valorAmbiente(a.pressao, 'pressao'),
    ajustadaAntes,
  }
}

/**
 * ΔT pesos − ar para o motor (medido, ou a aclimatação); null quando nenhum dos dois foi registrado (ou está fora da
 * faixa, como no ar).
 */
export function termicaDoAmbiente(a: CondicoesAmbientais | undefined | null): TermicaCalculo | null {
  const deltaT = valorAmbiente(lido(a?.deltaTPesos), 'deltaTPesos')
  const ac = a?.aclimatacao
  const deltaT0 = valorAmbiente(lido(ac?.deltaT0), 'deltaT0')
  const minutos = valorAmbiente(lido(ac?.minutos), 'minutos')
  const aclimatacao = deltaT0 !== null && minutos !== null ? { deltaT0, minutos } : null
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

/** Ver `regrasDoPopComoAviso` e `minimosDoPopComoAviso` em dominio.ts (lá, para `pendenciasEmissao` também usar). */
export { minimosDoPopComoAviso, regrasDoPopComoAviso }

/** As leituras de um certificado emitido, para a revisão dele (`EntradaCalculo.leiturasDoOriginal`). */
export function leiturasOriginais(
  k: Pick<CalibracaoInput, 'indicacao' | 'repetibilidade' | 'excentricidade'>,
): LeiturasOriginais {
  return {
    indicacao: Object.fromEntries(k.indicacao.pontos.map((p) => [p.id, leiturasDoMetodo(p, k.indicacao.metodo)])),
    repetibilidade: Object.fromEntries(k.repetibilidade.map((r) => [r.id, r.leituras])),
    excentricidade: k.excentricidade.posicoes.map((p) => p.leitura),
    referenciasExcentricidade: k.excentricidade.posicoes.map((p) => p.referencia),
  }
}

/** O certificado revisado (as leituras), para a revisão de um certificado de antes das regras do POP. */
type Original = Pick<CalibracaoInput, 'indicacao' | 'repetibilidade' | 'excentricidade'>

/**
 * Entrada do motor de cálculo a partir da calibração gravada. `momento`: o ensaio final (logo após o ajuste,
 * quando houve) ou o "como encontrado" (sempre sem ajuste logo antes). `original`: na revisão de um certificado de
 * antes das regras do POP, o certificado revisado (a leitura fora do esperado que a revisão mudou é pendência).
 */
export function entradaDoCalculo(
  k: Pick<CalibracaoInput, 'opcoes' | 'repetibilidade' | 'excentricidade' | 'indicacao' | 'conformidade'> &
    Partial<
      Pick<CalibracaoInput, 'ambiente' | 'ajuste' | 'calculoLegado' | 'substituiId' | 'regrasDoPop' | 'minimosComoAviso'>
    > & {
      emissao?: unknown
    },
  balanca: Pick<Balanca, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'>,
  padroes: Padrao[],
  ensaio: EnsaioIndicacao = k.indicacao,
  momento: 'FINAL' | 'COMO_ENCONTRADO' = 'FINAL',
  original?: Original | null,
): EntradaCalculo {
  const ajustadaAntes = momento === 'FINAL' && (k.ajuste?.realizado ?? 'NAO') !== 'NAO'
  const comoAviso = regrasDoPopComoAviso(k, momento)
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
    // A calibração já medida antes das regras: os mínimos como avisos (`minimosDoPopComoAviso`)
    ...(comoAviso ? {} : { regrasDoPop: true, ...(minimosDoPopComoAviso(k, momento) ? { minimosComoAviso: true } : {}) }),
    ...(comoAviso && momento === 'FINAL' && original ? { leiturasDoOriginal: leiturasOriginais(original) } : {}),
  }
}

/**
 * Calcula os ensaios finais e, quando houve ajuste e foi medido, o "como encontrado". `original`: na revisão, o
 * certificado revisado (ver `entradaDoCalculo`).
 */
export function calcularCalibracao(
  k: Pick<
    CalibracaoInput,
    'opcoes' | 'repetibilidade' | 'excentricidade' | 'indicacao' | 'conformidade' | 'comoEncontrado' | 'ajuste'
  > &
    Partial<Pick<CalibracaoInput, 'ambiente' | 'calculoLegado' | 'substituiId' | 'regrasDoPop' | 'minimosComoAviso'>> & {
      emissao?: unknown
    },
  balanca: Pick<Balanca, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'>,
  padroes: Padrao[],
  original?: Original | null,
): { resultado: ResultadoCalculo; comoEncontrado: ResultadoCalculo | null } {
  const resultado = calcular(entradaDoCalculo(k, balanca, padroes, k.indicacao, 'FINAL', original))
  const temAntes = k.ajuste.realizado !== 'NAO' && !!k.comoEncontrado?.pontos.some((p) => p.crescente !== null)
  const comoEncontrado = temAntes ? calcular(entradaDoCalculo(k, balanca, padroes, k.comoEncontrado!, 'COMO_ENCONTRADO')) : null
  return { resultado, comoEncontrado }
}

// Ligação entre a calibração (como é gravada) e o motor de cálculo (shared/metrologia):
// converte os pesos padrão para a unidade da balança e monta a entrada do cálculo.
// Usado no navegador (cálculo ao vivo) e no servidor (emissão e PDF).

import { ehRodoviaria, massaLegivel, METODOS_CARREGAMENTO } from './dominio.ts'
import { calcular, emaPeso } from './metrologia/index.ts'
import type { EntradaCalculo, PecaCalculo, ResultadoCalculo } from './metrologia/tipos.ts'
import type {
  Balanca,
  CalibracaoInput,
  EnsaioIndicacao,
  MetodoCarregamento,
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

// ---- Montagem das cargas com os pesos escolhidos ------------------------------------------------

/** Uma peça disponível, com a massa nominal em µg (inteiro: as somas não carregam ruído do binário). */
interface Peca {
  padraoId: string
  pesoId: string
  ug: number
  /** Posição na lista (do maior nominal para o menor): a ordem das peças na carga montada. */
  ordem: number
}

const MICROGRAMAS = 1e6
const paraUg = (valor: number, unidade: Unidade) => Math.round(valor * GRAMAS[unidade] * MICROGRAMAS)
const deUg = (ug: number, unidade: Unidade) => deGramas(ug / MICROGRAMAS, unidade)

/** As peças dos jogos de pesos ativos, do maior nominal para o menor (na ordem do cadastro entre as iguais). */
function pecasDisponiveis(padroes: Padrao[]): Peca[] {
  return padroes
    .filter((p) => p.tipo === 'PESOS' && p.ativo)
    .flatMap((p) => p.pesos.map((peso) => ({ padraoId: p.id, pesoId: peso.id, g: peso.nominal })))
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.g - a.g || a.i - b.i)
    .map((x, ordem) => ({ padraoId: x.padraoId, pesoId: x.pesoId, ug: Math.round(x.g * MICROGRAMAS), ordem }))
}

const somaUg = (pecas: readonly Peca[]) => pecas.reduce((s, p) => s + p.ug, 0)
const chaveDe = (p: Pick<PecaCarga, 'padraoId' | 'pesoId'>) => `${p.padraoId}:${p.pesoId}`
const paraCarga = (pecas: readonly Peca[]): PecaCarga[] =>
  [...pecas].sort((a, b) => a.ordem - b.ordem).map((p) => ({ padraoId: p.padraoId, pesoId: p.pesoId, quantidade: 1 }))

/** Gulosa: do maior para o menor, sem repetir peça. */
function gulosa(alvo: number, livres: readonly Peca[]): Peca[] {
  const usadas: Peca[] = []
  let resto = alvo
  for (const p of livres)
    if (p.ug <= resto) {
      usadas.push(p)
      resto -= p.ug
      if (resto === 0) break
    }
  return usadas
}

/**
 * Combinações de peças livres que somam exatamente `alvo` (µg), na ordem de preferência (as maiores peças
 * primeiro, o maior número delas primeiro), até `maximo`. Peças de mesmo nominal são intercambiáveis: entra
 * a primeira da lista. `orcamento.nos` limita a busca (a montagem roda a cada tecla no navegador).
 */
function combinacoes(alvo: number, livres: readonly Peca[], maximo: number, orcamento: { nos: number }): Peca[][] {
  const grupos: Peca[][] = []
  for (const p of livres) {
    const g = grupos.at(-1)
    if (g && g[0].ug === p.ug) g.push(p)
    else grupos.push([p])
  }
  const sufixo = grupos.map(() => 0)
  for (let k = grupos.length - 1; k >= 0; k--) sufixo[k] = (sufixo[k + 1] ?? 0) + grupos[k].length * grupos[k][0].ug
  const saida: Peca[][] = []
  const escolha: number[] = grupos.map(() => 0)
  const buscar = (k: number, resto: number) => {
    if (saida.length >= maximo || orcamento.nos-- <= 0) return
    if (resto === 0) {
      saida.push(escolha.flatMap((n, j) => grupos[j].slice(0, n)))
      return
    }
    if (k >= grupos.length || sufixo[k] < resto) return
    const ug = grupos[k][0].ug
    for (let n = Math.min(grupos[k].length, Math.floor(resto / ug)); n >= 0 && saida.length < maximo; n--) {
      escolha[k] = n
      buscar(k + 1, resto - n * ug)
    }
    escolha[k] = 0
  }
  buscar(0, alvo)
  return saida
}

/** Peças para `alvo` µg: a gulosa; se ela não fecha, a primeira combinação exata (se houver). */
function montarUg(alvo: number, livres: readonly Peca[]): Peca[] {
  const g = gulosa(alvo, livres)
  if (somaUg(g) === alvo) return g
  return combinacoes(alvo, livres, 1, { nos: 20_000 })[0] ?? g
}

/**
 * Monta uma carga com os pesos dos padrões escolhidos: do maior para o menor, sem repetir peça (se a gulosa
 * não fecha, procura uma combinação exata). `falta` > 0 quando os pesos não somam a carga pedida (na
 * unidade da balança).
 */
export function montarCarga(
  carga: number,
  unidade: Unidade,
  padroes: Padrao[],
): { pecas: PecaCarga[]; falta: number; total: number } {
  const alvo = paraUg(carga, unidade)
  if (!(alvo > 0)) return { pecas: [], falta: 0, total: 0 }
  const usadas = montarUg(alvo, pecasDisponiveis(padroes))
  const total = somaUg(usadas)
  return { pecas: paraCarga(usadas), falta: total < alvo ? deUg(alvo - total, unidade) : 0, total: deUg(total, unidade) }
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

/**
 * Métodos sem descarga entre os pontos ("Crescente e decrescente", "Crescente contínuo" e "Decrescente"): as
 * cargas se somam na balança, e cada ponto leva as peças do ponto de baixo mais as que faltam (na descida,
 * as peças saem na ordem inversa). No "Crescente com descarga", cada ponto é montado à parte.
 */
export const cargasAcumuladas = (metodo: MetodoCarregamento) => metodo !== 'DESCONTINUO'

/**
 * As cargas da calibração se somam? Quando o ensaio final ou o "como encontrado" é de um método sem descarga:
 * as mesmas peças por ponto servem às duas abas (a folha de campo tem uma lista de peças só).
 */
export function acumulaCargas(f: Pick<CalibracaoInput, 'indicacao' | 'comoEncontrado' | 'ajuste'>): boolean {
  return (
    cargasAcumuladas(f.indicacao.metodo) ||
    (f.ajuste.realizado !== 'NAO' && !!f.comoEncontrado && cargasAcumuladas(f.comoEncontrado.metodo))
  )
}

/** Um ponto a montar: a carga, o nível de substituição e, quando escolhidas à mão, as peças (ficam como estão). */
export interface PontoAMontar {
  carga: number
  nivel: number
  pecasManuais?: PecaCarga[] | null
}

export interface PontoMontado {
  pecas: PecaCarga[]
  /** (etapas + pesos) − carga, na unidade da balança: > 0 passa da carga, < 0 falta. */
  diferenca: number
  /**
   * Sem descarga, a carga deste ponto não sai das peças do ponto de baixo mais outras: seria preciso trocar
   * peças no meio da subida. As peças são as de uma montagem à parte (a carga fecha; a sequência, não).
   */
  foraDaSequencia: boolean
}

/**
 * Cadeia de cargas acumuladas (`alvos` em µg, em ordem crescente): cada conjunto contém o anterior. Procura,
 * com retrocesso limitado, uma cadeia que chegue ao fim; onde não dá, o ponto fica com uma montagem à parte
 * (marcado `quebra`, se ela fecha a carga) ou, quando os pesos não chegam, com as peças de baixo mais as que
 * couberem (o que falta vai na diferença), e a cadeia continua dali. `fixos`: peças escolhidas à mão.
 */
function cadeiaAcumulada(
  alvos: number[],
  fixos: Array<Peca[] | null>,
  disponiveis: Peca[],
): { conjuntos: Peca[][]; quebra: boolean[] } {
  const n = alvos.length
  const conjuntos: Peca[][] = []
  const quebra: boolean[] = alvos.map(() => false)
  const orcamento = { nos: 6000 }
  const contem = (maior: Peca[], menor: Peca[]) => {
    const chaves = new Set(maior.map(chaveDe))
    return menor.every((p) => chaves.has(chaveDe(p)))
  }
  let inicio = 0
  let base: Peca[] = []
  while (inicio < n) {
    let melhor: Peca[][] = []
    const caminho: Peca[][] = []
    const buscar = (k: number, atual: Peca[]): boolean => {
      if (caminho.length > melhor.length) melhor = [...caminho]
      if (k === n) return true
      if (orcamento.nos-- <= 0) return false
      const fixo = fixos[k]
      if (fixo) {
        if (!contem(fixo, atual)) return false
        caminho.push(fixo)
        if (buscar(k + 1, fixo)) return true
        caminho.pop()
        return false
      }
      const falta = alvos[k] - somaUg(atual)
      if (falta < 0) return false
      const usadas = new Set(atual.map(chaveDe))
      const livres = disponiveis.filter((p) => !usadas.has(chaveDe(p)))
      const opcoes = falta === 0 ? [[]] : combinacoes(falta, livres, 4, orcamento)
      for (const extra of opcoes) {
        const proximo = [...atual, ...extra]
        caminho.push(proximo)
        if (buscar(k + 1, proximo)) return true
        caminho.pop()
      }
      return false
    }
    buscar(inicio, base)
    conjuntos.push(...melhor)
    const k = inicio + melhor.length
    if (k >= n) break
    // O ponto k não continua a cadeia
    const fixo = fixos[k]
    let escolhido: Peca[]
    if (fixo) {
      escolhido = fixo
      quebra[k] = true
    } else {
      const aParte = montarUg(alvos[k], disponiveis)
      if (somaUg(aParte) === alvos[k]) {
        escolhido = aParte
        quebra[k] = true
      } else {
        // Os pesos não chegam à carga: as de baixo mais o que couber (a falta já é avisada à parte)
        const atual = conjuntos.at(-1) ?? base
        const usadas = new Set(atual.map(chaveDe))
        const resto = Math.max(0, alvos[k] - somaUg(atual))
        escolhido = [...atual, ...gulosa(resto, disponiveis.filter((p) => !usadas.has(chaveDe(p))))]
      }
    }
    conjuntos.push(escolhido)
    base = escolhido
    inicio = k + 1
  }
  return { conjuntos, quebra }
}

/**
 * Peças de todos os pontos do erro de indicação, como o cálculo soma a carga de cada um (com substituição,
 * nível × carga da etapa por baixo e os pesos só no resto). Com `acumular` (métodos sem descarga), cada
 * ponto leva as peças do ponto de carga logo abaixo (do mesmo nível de substituição) mais as que faltam; sem,
 * cada ponto é montado à parte. A folha de campo e o editor usam esta mesma montagem.
 */
export function montarPontos(
  pontos: PontoAMontar[],
  acumular: boolean,
  cargaEtapa: number,
  unidade: Unidade,
  padroes: Padrao[],
): PontoMontado[] {
  const disponiveis = pecasDisponiveis(padroes)
  const porChave = new Map(disponiveis.map((p) => [chaveDe(p), p]))
  const etapasDe = (p: PontoAMontar) => (p.nivel > 0 && cargaEtapa > 0 ? p.nivel * cargaEtapa : 0)
  const restoDe = (p: PontoAMontar) => Math.max(0, Number((p.carga - etapasDe(p)).toPrecision(12)))
  const saida: PontoMontado[] = pontos.map((p) => {
    if (!(p.carga > 0)) return { pecas: p.pecasManuais ?? [], diferenca: 0, foraDaSequencia: false }
    if (p.pecasManuais) {
      const pesos = cargaDasPecas(p.pecasManuais, padroes, unidade)
      return { pecas: p.pecasManuais, diferenca: diferencaDoPonto(p.carga, etapasDe(p), pesos), foraDaSequencia: false }
    }
    const resto = restoDe(p)
    const m = resto > 0 ? montarCarga(resto, unidade, padroes) : { pecas: [], total: 0 }
    return { pecas: m.pecas, diferenca: diferencaDoPonto(p.carga, etapasDe(p), m.total), foraDaSequencia: false }
  })
  if (!acumular) return saida

  // Uma cadeia por nível de substituição (a troca dos pesos pelo material recomeça a pilha de cima)
  const niveis = new Map<number, number[]>()
  pontos.forEach((p, i) => {
    if (!(p.carga > 0)) return
    const nivel = etapasDe(p) > 0 ? p.nivel : 0
    niveis.set(nivel, [...(niveis.get(nivel) ?? []), i])
  })
  for (const indices of niveis.values()) {
    const ordem = [...indices].sort((a, b) => restoDe(pontos[a]) - restoDe(pontos[b]) || a - b)
    const fixos = ordem.map((i) => {
      const manuais = pontos[i].pecasManuais
      return manuais ? manuais.map((x) => porChave.get(chaveDe(x))).filter((x): x is Peca => !!x) : null
    })
    const { conjuntos, quebra } = cadeiaAcumulada(
      ordem.map((i) => paraUg(restoDe(pontos[i]), unidade)),
      fixos,
      disponiveis,
    )
    ordem.forEach((i, j) => {
      const p = pontos[i]
      const pecas = p.pecasManuais ?? paraCarga(conjuntos[j])
      saida[i] = {
        pecas,
        diferenca: diferencaDoPonto(p.carga, etapasDe(p), p.pecasManuais ? cargaDasPecas(pecas, padroes, unidade) : deUg(somaUg(conjuntos[j]), unidade)),
        foraDaSequencia: quebra[j],
      }
    })
  }
  return saida
}

/**
 * Aviso dos pontos que, sem descarga, não saem das peças do ponto de baixo mais outras (`cargas`: "30 kg").
 * `quem`: os pesos "previstos" (folha de campo) ou "escolhidos" (editor). Com substituição, o método não muda
 * (as cargas só sobem); sem, dá para trocar pelo "Crescente com descarga".
 */
export function avisoForaDaSequencia(
  cargas: string[],
  metodo: MetodoCarregamento,
  quem: 'previstos' | 'escolhidos',
  comSubstituicao: boolean,
): string {
  const alvo = cargas.length === 1 ? `a carga de ${cargas[0]}` : `as cargas de ${cargas.join(', ')}`
  const saida = [
    quem === 'escolhidos' ? 'escolha as peças à mão' : '',
    'leve outras peças',
    comSubstituicao ? 'mude as cargas' : `use o método “${METODOS_CARREGAMENTO.DESCONTINUO.label}”`,
  ].filter(Boolean)
  return `Sem descarregar (“${METODOS_CARREGAMENTO[metodo].label}”), cada carga leva as peças da anterior mais as que faltam, e os pesos ${quem} não montam assim ${alvo}: ${saida.slice(0, -1).join(', ')} ou ${saida.at(-1)}.`
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
      const pecas = pecasParaCalculo(p.pecas, padroes, unidade)
      // Peças de um jogo que saiu da lista de padrões escolhidos: a carga ficaria incompleta (pendência)
      const pecasAusentes = p.pecas.length - pecas.length
      const pesos = pecas.length ? cargaDasPecas(p.pecas, padroes, unidade) : 0
      // Carga nominal do ponto: com substituição, as etapas (nível × carga dos pesos da etapa) mais os pesos por
      // cima; sem nenhuma peça encontrada, a carga digitada (o cálculo pede as peças)
      const carga = nivel > 0 && etapa > 0 ? Number((nivel * etapa + pesos).toPrecision(12)) : pecas.length ? pesos : p.carga
      return {
        id: p.id,
        carga,
        pecas,
        crescente: p.crescente,
        decrescente: p.decrescente,
        nivelSubstituicao: nivel,
        ...(pecasAusentes > 0 ? { pecasAusentes } : {}),
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
/** A balança como o cálculo a vê (o receptor e o tipo dizem se a excentricidade é com carga rolante). */
export type BalancaDoCalculo = Pick<Balanca, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'> &
  Partial<Pick<Balanca, 'receptor' | 'tipo'>>

/** Excentricidade com carga rolante: rodoviária e ferroviária (o veículo passa pela plataforma). */
const cargaRolante = (b: BalancaDoCalculo) =>
  b.receptor !== undefined && b.tipo !== undefined ? ehRodoviaria({ receptor: b.receptor, tipo: b.tipo }) : b.receptor === 'RODOVIARIA'

export function entradaDoCalculo(
  k: Pick<CalibracaoInput, 'opcoes' | 'repetibilidade' | 'excentricidade' | 'indicacao' | 'conformidade'>,
  balanca: BalancaDoCalculo,
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
      cargaRolante: cargaRolante(balanca),
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
  balanca: BalancaDoCalculo,
  padroes: Padrao[],
): { resultado: ResultadoCalculo; comoEncontrado: ResultadoCalculo | null } {
  const resultado = calcular(entradaDoCalculo(k, balanca, padroes))
  const temAntes = k.ajuste.realizado !== 'NAO' && !!k.comoEncontrado?.pontos.some((p) => p.crescente !== null)
  const comoEncontrado = temAntes ? calcular(entradaDoCalculo(k, balanca, padroes, k.comoEncontrado!)) : null
  return { resultado, comoEncontrado }
}

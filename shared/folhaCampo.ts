// Plano da folha de campo: o que a folha impressa antes da visita leva pronto (pontos de carga com os
// pesos de cada um, carga e posições da excentricidade, carga e nº de leituras da repetibilidade,
// substituição e padrões a separar). Usa os ensaios do rascunho quando existem e, quando estão vazios,
// as mesmas sugestões do assistente ("Sugerir pontos", "Começar com a carga sugerida", "Preparar
// posições"): as linhas do papel batem com as da tela na hora de digitar. Puro (navegador e servidor).

import { cargaDasPecas, descreverPecas, montarCarga } from './calibracao.ts'
import { converterMassa, situacaoValidade, type SituacaoValidade } from './dominio.ts'
import {
  cargaExcentricidade,
  emaInstrumento,
  faixaDoValor,
  faixasOrdenadas,
  posicoesExcentricidade,
  repetibilidadeSugerida,
  sugerirPontos,
} from './metrologia/index.ts'
import type {
  Balanca,
  CalibracaoInput,
  Conformidade,
  MetodoCarregamento,
  MetodoExcentricidade,
  Padrao,
  PecaCarga,
  Unidade,
} from './tipos.ts'

/** Código e revisão do formulário (documento controlado, ISO/IEC 17025 8.3): muda a cada alteração do layout. */
export const FORMULARIO_FOLHA_CAMPO = {
  codigo: 'FOR-CAL-01',
  revisao: '00',
  titulo: 'Folha de campo de calibração de balança',
  referencia: 'PT-CAL-01 · EURAMET cg-18 v4.0',
} as const

export interface CargaPlanejada {
  /** Carga nominal, na unidade da balança. */
  carga: number
  pecas: PecaCarga[]
  /** "7 × 20 kg + 10 kg" ('' sem carga ou sem pesos). */
  pesos: string
  /** Quanto falta para os pesos escolhidos fecharem a carga (0 = fecha). */
  falta: number
}

export interface PontoPlanejado extends CargaPlanejada {
  /** Divisão e divisão de verificação na carga (multi-intervalo: as do intervalo parcial). */
  d: number
  e: number
  /** EMA na carga (só quando o cliente pediu a declaração de conformidade e há classe/tolerância). */
  ema: number | null
  /** Substituições por baixo dos pesos (rodoviárias); 0 = só pesos padrão. */
  nivelSubstituicao: number
}

export interface PadraoPlanejado {
  padrao: Padrao
  /** Validade do padrão na data prevista da calibração. */
  situacao: SituacaoValidade
  /** Peças deste jogo que as cargas previstas usam: "15 × 20 kg" ('' se nenhuma ou se não é jogo de pesos). */
  separar: string
}

export interface PlanoFolha {
  /** De onde vieram os ensaios: do rascunho (último certificado) ou das sugestões do assistente. */
  origem: 'RASCUNHO' | 'SUGESTAO'
  unidade: Unidade
  /** Maior capacidade (Max), na unidade da balança. */
  max: number
  metodo: MetodoCarregamento
  pontos: PontoPlanejado[]
  /** Conformidade pedida pelo cliente (para imprimir a EMA), ou null. */
  conformidade: Conformidade | null
  repetibilidade: Array<CargaPlanejada & { leituras: number; minimo: number }>
  excentricidade: {
    aplicavel: boolean
    motivo: string
    metodo: MetodoExcentricidade
    posicoes: string[]
  } & CargaPlanejada
  substituicao: { ativa: boolean; etapas: number } & CargaPlanejada
  padroes: PadraoPlanejado[]
  /** Avisos para resolver antes de sair (padrão vencido, pesos que não fecham a carga…). */
  avisos: string[]
}

const TOL = 1e-9

/** Padrões previstos: os escolhidos no rascunho ou, sem escolha, todos os ativos (menos "outro"), como no POST. */
export function padroesPrevistos(calibracao: Pick<CalibracaoInput, 'padroesIds'> | null, padroes: Padrao[]): Padrao[] {
  const ids = calibracao?.padroesIds ?? []
  if (ids.length) {
    const porId = new Map(padroes.map((p) => [p.id, p]))
    return ids.map((id) => porId.get(id)).filter((p): p is Padrao => !!p)
  }
  return padroes.filter((p) => p.ativo && p.tipo !== 'OUTRO')
}

function cargaPlanejada(carga: number, unidade: Unidade, pesos: Padrao[], pecas?: PecaCarga[]): CargaPlanejada {
  if (!(carga > 0)) return { carga: 0, pecas: [], pesos: '', falta: 0 }
  if (pecas) {
    const total = cargaDasPecas(pecas, pesos, unidade)
    const falta = carga - total > carga * TOL ? Number((carga - total).toPrecision(12)) : 0
    return { carga, pecas, pesos: descreverPecas(pecas, pesos), falta }
  }
  const m = montarCarga(carga, unidade, pesos)
  return { carga, pecas: m.pecas, pesos: descreverPecas(m.pecas, pesos), falta: m.falta }
}

/**
 * Plano da folha de uma balança cadastrada, a partir do rascunho (ou de nenhum). As peças dos pontos
 * automáticos são remontadas com os pesos previstos, como o editor faz ao abrir (recomporCargas).
 */
export function planoDaFolha(
  calibracao: CalibracaoInput | null,
  balanca: Balanca,
  padroes: Padrao[],
  dataPrevista: string,
): PlanoFolha {
  const u = balanca.unidade
  const faixas = faixasOrdenadas(balanca.faixas)
  const max = faixas.at(-1)?.max ?? 0
  const previstos = padroesPrevistos(calibracao, padroes)
  const pesos = previstos.filter((p) => p.tipo === 'PESOS' && p.ativo)
  const conformidade = calibracao?.conformidade.solicitada ? calibracao.conformidade : null
  const avisos: string[] = []

  // ---- Erro de indicação
  const ensaio = calibracao?.indicacao
  const doRascunho = !!ensaio?.pontos.length
  const sub = ensaio?.substituicao
  const substituicaoAtiva = !!sub?.ativa
  const cargaEtapa = substituicaoAtiva ? cargaDasPecas(sub!.pecas, pesos, u) : 0
  const pontosBase = doRascunho
    ? ensaio!.pontos.map((p) => ({ carga: p.carga, pecas: p.pecasManuais ? p.pecas : undefined, nivel: p.nivelSubstituicao }))
    : sugerirPontos(balanca).map((carga) => ({ carga, pecas: undefined as PecaCarga[] | undefined, nivel: 0 }))
  const pontos: PontoPlanejado[] = pontosBase.map((p) => {
    const faixa = faixas.length ? faixaDoValor(p.carga, balanca) : { d: 0, e: 0 }
    const nivel = substituicaoAtiva && cargaEtapa > 0 ? p.nivel : 0
    const base = cargaPlanejada(p.carga, u, pesos, p.pecas)
    // Com substituição, a carga do ponto é nível × carga da etapa + os pesos por cima (como no cálculo)
    const falta =
      nivel > 0
        ? Math.max(0, Number((p.carga - nivel * cargaEtapa - cargaDasPecas(base.pecas, pesos, u)).toPrecision(12)))
        : base.falta
    const ema = conformidade ? emaInstrumento(p.carga, balanca, conformidade.criterio, conformidade.toleranciaCliente) : null
    return { ...base, falta, d: faixa.d, e: faixa.e, ema, nivelSubstituicao: nivel }
  })
  const semFechar = pontos.filter((p) => p.falta > 0)
  if (semFechar.length && pesos.length)
    avisos.push(
      `Os pesos previstos não fecham ${semFechar.length === 1 ? 'a carga' : 'as cargas'} de ${semFechar
        .map((p) => `${p.carga} ${u}`)
        .join(', ')}: leve mais pesos ou use cargas de substituição.`,
    )

  // ---- Repetibilidade
  const sugerida = repetibilidadeSugerida(max, u)
  const minimoPara = (carga: number) => (converterMassa(carga, u, 'kg') >= 100 * (1 - TOL) ? 3 : 5)
  const ensaiosRep = calibracao?.repetibilidade.length
    ? calibracao.repetibilidade.map((r) => ({ carga: r.carga, leituras: r.leituras.length }))
    : [{ carga: sugerida.carga, leituras: Math.max(sugerida.leituras, 5) }]
  const repetibilidade = ensaiosRep.map((r) => ({
    ...cargaPlanejada(r.carga, u, pesos),
    leituras: Math.max(r.leituras, minimoPara(r.carga)),
    minimo: minimoPara(r.carga),
  }))

  // ---- Excentricidade
  const ecc = calibracao?.excentricidade
  const posicoesSugeridas = posicoesExcentricidade(balanca.receptor, balanca.apoios)
  const aplicavel = ecc ? ecc.aplicavel && balanca.receptor !== 'GANCHO' : balanca.receptor !== 'GANCHO'
  const motivo =
    ecc && !ecc.aplicavel && ecc.motivo.trim()
      ? ecc.motivo.trim()
      : balanca.receptor === 'GANCHO'
        ? 'Balança suspensa (gancho): a carga se centraliza sozinha.'
        : ''
  const excentricidade = {
    aplicavel,
    motivo: aplicavel ? '' : motivo,
    metodo: ecc?.metodo ?? 1,
    posicoes: aplicavel ? (ecc?.posicoes.length ? ecc.posicoes.map((p) => p.rotulo) : posicoesSugeridas) : [],
    ...cargaPlanejada(aplicavel ? ecc?.carga || cargaExcentricidade(max, u) : 0, u, pesos),
  }

  // ---- Substituição
  const maiorNivel = Math.max(0, ...pontos.map((p) => p.nivelSubstituicao))
  const substituicao = {
    ativa: substituicaoAtiva,
    etapas: substituicaoAtiva ? Math.max(sub!.etapas.length, maiorNivel) : 0,
    ...(substituicaoAtiva ? cargaPlanejada(cargaEtapa, u, pesos, sub!.pecas) : cargaPlanejada(0, u, pesos)),
  }

  // ---- Padrões: validade na data prevista e peças a separar (união das peças de todas as cargas)
  const usadas = new Map<string, PecaCarga>()
  for (const c of [...pontos, ...repetibilidade, excentricidade, substituicao])
    for (const x of c.pecas) usadas.set(`${x.padraoId}:${x.pesoId}`, x)
  const padroesPlano = previstos.map((p): PadraoPlanejado => {
    const situacao = situacaoValidade(p.validade, dataPrevista)
    if (situacao === 'VENCIDO')
      avisos.push(`${p.identificacao}: calibração vencida em ${p.validade.split('-').reverse().join('/')}.`)
    const pecas = [...usadas.values()].filter((x) => x.padraoId === p.id)
    return { padrao: p, situacao, separar: p.tipo === 'PESOS' ? descreverPecas(pecas, [p]) : '' }
  })
  if (!pesos.length) avisos.push('Nenhum jogo de pesos padrão previsto: escolha os pesos antes de sair.')

  return {
    origem: doRascunho ? 'RASCUNHO' : 'SUGESTAO',
    unidade: u,
    max,
    metodo: ensaio?.metodo ?? 'CRESCENTE_DECRESCENTE',
    pontos,
    conformidade,
    repetibilidade,
    excentricidade,
    substituicao,
    padroes: padroesPlano,
    avisos,
  }
}

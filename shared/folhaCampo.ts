// Plano da folha de campo: o que a folha impressa antes da visita leva pronto (pontos de carga com os
// pesos de cada um, carga e posições da excentricidade, carga e nº de leituras da repetibilidade,
// substituição e padrões a separar). Usa os ensaios do rascunho quando existem e, quando estão vazios,
// as mesmas sugestões do assistente ("Sugerir pontos", "Começar com a carga sugerida", "Preparar
// posições"): as linhas do papel batem com as da tela na hora de digitar. Puro (navegador e servidor).

import {
  cargaDaEtapa,
  cargaDasPecas,
  descreverPecas,
  diferencaDoPonto,
  montarCarga,
  montarPonto,
  pesosAtendemNaCarga,
  pontosSugeridos,
} from './calibracao.ts'
import {
  converterMassa,
  deltaTPesosMaximo,
  ehRodoviaria,
  METODOS_CARREGAMENTO,
  metodoExcentricidadePadrao,
  metodoIndicacaoPadrao,
  numeroBr,
  padroesSemHistorico,
  pressaoObrigatoria,
  situacaoValidade,
  type SituacaoValidade,
} from './dominio.ts'
import {
  cargaExcentricidade,
  emaInstrumento,
  excentricidadeAbaixoDoMinimo,
  faixaDoValor,
  faixasOrdenadas,
  faixasSemRepetibilidade,
  minimoExcentricidade,
  ondeFaltaRepetibilidade,
  pesosMinimosSubstituicao,
  posicoesExcentricidade,
  repetibilidadesSugeridas,
} from './metrologia/index.ts'
import type {
  Balanca,
  CalibracaoInput,
  ClasseExatidao,
  Conformidade,
  CriterioEma,
  EnsaioIndicacao,
  MetodoCarregamento,
  MetodoExcentricidade,
  Padrao,
  PecaCarga,
  Unidade,
} from './tipos.ts'

/**
 * Código e revisão do formulário (documento controlado, ISO/IEC 17025 8.3): muda a cada alteração do layout.
 * Rev. 01: folha enxuta (dado impresso diferente vai no verso, sem caixas de correção). O procedimento de
 * referência é o POP configurado no sistema (sai no rodapé, ver `referenciaDoFormulario`); `referencia` é o
 * guia técnico (metadados do PDF).
 */
export const FORMULARIO_FOLHA_CAMPO = {
  codigo: 'FOR-CAL-01',
  revisao: '01',
  titulo: 'Folha de campo de calibração de balança',
  referencia: 'EURAMET cg-18 v4.0',
} as const

/**
 * Referência do formulário no rodapé de toda página: o POP configurado (`textos.procedimento`, ex.:
 * "BALANÇAS-POP-123 rev. 00" → "POP BALANÇAS-POP-123 rev. 00"; o código que já começa com POP fica como
 * está: "POP-CAL-01 rev. 00"); sem POP, nada.
 */
export function referenciaDoFormulario(procedimento: string | null | undefined): string {
  const pop = (procedimento ?? '').trim()
  return !pop ? '' : /^POP\b/i.test(pop) ? pop : `POP ${pop}`
}

/**
 * Nota da etiqueta de calibração, na folha com o nº do certificado reservado: o técnico copia o nº na
 * etiqueta que cola na balança; a validade da etiqueta é escolha do cliente (o certificado não tem validade).
 */
export const AVISO_ETIQUETA =
  'Copie este nº na etiqueta de calibração (campo CERTIFICADO Nº). A VALIDADE DA CALIBRAÇÃO fica em branco: é preenchida pela qualidade do cliente.'

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
  /** EMA na carga, pelo critério de `PlanoFolha.faixaAceitavel` (null sem classe nem tolerância). */
  ema: number | null
  /** Substituições por baixo dos pesos (rodoviárias); 0 = só pesos padrão. */
  nivelSubstituicao: number
  /**
   * Com substituição: as etapas por baixo e os pesos por cima passam da carga do ponto (nível alto demais
   * ou peças escolhidas à mão a mais), na unidade da balança; 0 = não passam (o que falta vai em `falta`).
   */
  excesso: number
}

/**
 * Critério da coluna "faixa aceitável" (carga ± EMA), só para decidir o ajuste no local: o da declaração de
 * conformidade, quando o cliente pediu; sem pedido, o EMA em serviço da Portaria 157 (o critério padrão do
 * sistema), quando a balança tem classe.
 */
export interface FaixaAceitavel {
  criterio: CriterioEma
  toleranciaCliente: number
  /** Veio da declaração de conformidade pedida pelo cliente (senão, é só a referência para o ajuste). */
  daConformidade: boolean
  /**
   * O cliente pediu a conformidade pela tolerância dele, que ainda não foi informada (vem na visita): a
   * faixa é a do EMA em serviço, só para decidir o ajuste, e a tolerância fica para escrever no local.
   */
  toleranciaPendente: boolean
}

/** Critério de decisão do ajuste quando o cliente não pediu declaração de conformidade. */
export const CRITERIO_AJUSTE: Exclude<CriterioEma, 'CLIENTE'> = 'PORTARIA_SERVICO'

export interface PadraoPlanejado {
  padrao: Padrao
  /** Validade do padrão na data prevista da calibração. */
  situacao: SituacaoValidade
  /** Peças deste jogo que as cargas previstas usam: "15 × 20 kg" ('' se nenhuma ou se não é jogo de pesos). */
  separar: string
  /**
   * Vai inteiro na lista "antes de sair": o jogo de pesos com peças a separar, o termo-higrômetro do
   * ambiente, o barômetro nas classes I e II (a pressão é obrigatória) e outro instrumento escolhido (na classe
   * I, o termômetro de duas entradas, cadastrado como "outro"). Os demais (sem calibração anterior, o rascunho
   * prevê todos os ativos) e o barômetro nas outras classes (a pressão é opcional) vão numa linha só, para não
   * encher a folha de linhas que o plano não usa.
   */
  naFolha: boolean
}

export interface PlanoFolha {
  /** De onde vieram os ensaios: do rascunho (último certificado) ou das sugestões do assistente. */
  origem: 'RASCUNHO' | 'SUGESTAO'
  unidade: Unidade
  /** Maior capacidade (Max), na unidade da balança. */
  max: number
  /**
   * Como as cargas vão ser aplicadas (o ensaio final, "depois do ajuste" quando há ajuste). Com cargas de
   * substituição (as do rascunho ou as sugeridas) e o ensaio ainda sem leituras, "crescente contínuo": para
   * descer ou descarregar, seria preciso tirar o material de substituição (o caminhão ou o lastro).
   */
  metodo: MetodoCarregamento
  /** O do ensaio "como encontrado" (no sistema, cada aba do erro de indicação tem o seu): o mesmo, sem ajuste previsto. */
  metodoComoEncontrado: MetodoCarregamento
  pontos: PontoPlanejado[]
  /** Conformidade pedida pelo cliente, ou null. */
  conformidade: Conformidade | null
  /** Critério da faixa aceitável dos pontos (null: sem classe e sem conformidade pedida, não há EMA). */
  faixaAceitavel: FaixaAceitavel | null
  repetibilidade: Array<CargaPlanejada & { leituras: number; minimo: number }>
  excentricidade: {
    aplicavel: boolean
    motivo: string
    metodo: MetodoExcentricidade
    posicoes: string[]
  } & CargaPlanejada
  /**
   * Cargas de substituição (rodoviárias): as do rascunho (`ativa`) ou, numa rodoviária sem elas no plano
   * cujos pesos previstos não chegam às cargas dos pontos, as sugeridas pela folha (`sugerida`: a carga de
   * cada etapa são os pesos previstos e o nível de cada ponto, o que falta, em etapas). `etapas`: quantas.
   */
  substituicao: { ativa: boolean; sugerida: boolean; etapas: number } & CargaPlanejada
  padroes: PadraoPlanejado[]
  /**
   * Classe I: a maior diferença de temperatura pesos − ar para começar os ensaios (°C, POP 7.4): 3 °C quando todos
   * os jogos de pesos previstos são F1; 1 °C com E1, E2 ou sem classe (`deltaTPesosMaximo`). null nas outras classes.
   */
  limiteDeltaTPesos: number | null
  /**
   * Avisos para resolver antes de sair (padrão vencido, pesos que não fecham a carga dos pontos, da
   * repetibilidade ou da excentricidade…).
   */
  avisos: string[]
}

/** Leituras da repetibilidade na classe I (POP, Tabela 4: 10; nas outras classes, 5, ou 3 com 100 kg ou mais). */
export const LEITURAS_CLASSE_I = 10

const TOL = 1e-9

/**
 * Substituição sugerida para uma rodoviária sem ela no plano, quando os pesos previstos não fecham alguma
 * carga: cada etapa leva os pesos previstos (os maiores, numa carga redonda: 20 × 500 kg = 10 000 kg) e
 * cada ponto fica com as etapas por baixo e o resto em pesos por cima (o modelo do cálculo: nível × carga
 * da etapa + pesos). null quando os pesos fecham todas as cargas (ou não há pesos).
 */
function substituicaoSugerida(cargas: number[], unidade: Unidade, pesos: Padrao[]): { carga: number; pecas: PecaCarga[] } | null {
  const todas = pesos.flatMap((p) => p.pesos.map((w) => ({ padraoId: p.id, pesoId: w.id, quantidade: 1 })))
  if (!todas.length || !cargas.some((c) => c > 0 && montarCarga(c, unidade, pesos).falta > 0)) return null
  const total = cargaDasPecas(todas, pesos, unidade)
  const maior = Math.max(...todas.map((x) => cargaDasPecas([x], pesos, unidade)))
  // Etapa redonda, em múltiplos da maior peça (as pequenas ficam para completar por cima)
  const redonda = maior > 0 ? Number((Math.floor(total / maior + TOL) * maior).toPrecision(12)) : 0
  const m = montarCarga(redonda > 0 ? redonda : total, unidade, pesos)
  const carga = Number((redonda > 0 && m.falta === 0 ? redonda : total).toPrecision(12))
  return carga > 0 ? { carga, pecas: m.falta === 0 ? m.pecas : todas } : null
}

/** O ensaio já tem leituras (dos pontos ou das etapas de substituição)? */
export function temLeituras(e: EnsaioIndicacao | null | undefined): boolean {
  return (
    !!e &&
    (e.pontos.some((p) => p.crescente !== null || p.decrescente !== null) ||
      e.substituicao.etapas.some((x) => x.leituraPadroes !== null || x.leituraSubstituicao !== null))
  )
}

/** Etapas por baixo de uma carga que os pesos (`etapa`) não alcançam sozinhos: ⌈(carga − etapa) / etapa⌉. */
export const nivelSugerido = (carga: number, etapa: number) =>
  etapa > 0 && carga > etapa * (1 + TOL) ? Math.ceil(Number(((carga - etapa) / etapa).toPrecision(12))) : 0

/**
 * Padrões previstos: os escolhidos no rascunho ou, sem escolha, os de um rascunho novo, como no POST (os ativos,
 * menos os "outro"; na classe I, só os jogos E1, E2 e F1, e com os "outro", como o termômetro de duas entradas).
 */
export function padroesPrevistos(
  calibracao: Pick<CalibracaoInput, 'padroesIds'> | null,
  padroes: Padrao[],
  classe?: ClasseExatidao | null,
): Padrao[] {
  const ids = calibracao?.padroesIds ?? []
  if (ids.length) {
    const porId = new Map(padroes.map((p) => [p.id, p]))
    return ids.map((id) => porId.get(id)).filter((p): p is Padrao => !!p)
  }
  return padroesSemHistorico(padroes, classe)
}

/**
 * Validade de cada padrão na data prevista e os avisos dos vencidos: vale com plano (balança cadastrada),
 * na folha só do cliente e na em branco (a data é a da visita ou, sem ela, a da impressão).
 */
export function validadeDosPadroes(
  padroes: Padrao[],
  data: string,
): { itens: Array<{ padrao: Padrao; situacao: SituacaoValidade }>; avisos: string[] } {
  const itens = padroes.map((padrao) => ({ padrao, situacao: situacaoValidade(padrao.validade, data) }))
  const avisos = itens
    .filter((x) => x.situacao === 'VENCIDO')
    .map((x) => `${x.padrao.identificacao}: calibração vencida em ${x.padrao.validade.split('-').reverse().join('/')}.`)
  return { itens, avisos }
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
  const previstos = padroesPrevistos(calibracao, padroes, balanca.classe)
  const pesos = previstos.filter((p) => p.tipo === 'PESOS' && p.ativo)
  const conformidade = calibracao?.conformidade.solicitada ? calibracao.conformidade : null
  // Tolerância do cliente pedida, mas ainda sem o valor (vem na visita): sem ela não há EMA, e a faixa para
  // decidir o ajuste fica com o critério padrão, quando a balança tem classe
  const toleranciaPendente = conformidade?.criterio === 'CLIENTE' && !(conformidade.toleranciaCliente > 0)
  const faixaAceitavel: FaixaAceitavel | null =
    conformidade && !toleranciaPendente
      ? {
          criterio: conformidade.criterio,
          toleranciaCliente: conformidade.toleranciaCliente,
          daConformidade: true,
          toleranciaPendente: false,
        }
      : balanca.classe
        ? { criterio: CRITERIO_AJUSTE, toleranciaCliente: 0, daConformidade: false, toleranciaPendente }
        : null
  const avisos: string[] = []

  // ---- Erro de indicação
  const ensaio = calibracao?.indicacao
  const doRascunho = !!ensaio?.pontos.length
  const sub = ensaio?.substituicao
  const substituicaoAtiva = !!sub?.ativa
  const pontosBase = doRascunho
    ? ensaio!.pontos.map((p) => ({ carga: p.carga, pecas: p.pecasManuais ? p.pecas : undefined, nivel: p.nivelSubstituicao }))
    : pontosSugeridos(balanca, pesos).map((carga) => ({ carga, pecas: undefined as PecaCarga[] | undefined, nivel: 0 }))
  // Rodoviária sem a substituição no plano e com pesos que não chegam às cargas: a folha sugere as etapas
  const subSugerida =
    !substituicaoAtiva && ehRodoviaria(balanca)
      ? substituicaoSugerida(
          pontosBase.filter((p) => !p.pecas).map((p) => p.carga),
          u,
          pesos,
        )
      : null
  const cargaEtapa = substituicaoAtiva ? cargaDaEtapa(ensaio!, pesos, u) : (subSugerida?.carga ?? 0)
  const pontos: PontoPlanejado[] = pontosBase.map((p) => {
    const faixa = faixas.length ? faixaDoValor(p.carga, balanca) : { d: 0, e: 0 }
    const nivel =
      substituicaoAtiva && cargaEtapa > 0
        ? p.nivel
        : subSugerida && !p.pecas && montarCarga(p.carga, u, pesos).falta > 0
          ? nivelSugerido(p.carga, cargaEtapa)
          : 0
    // Com substituição, a carga do ponto é nível × carga da etapa + os pesos por cima (como no cálculo): as
    // peças automáticas completam só o resto (como o editor monta, `montagemDoPonto`)
    const pecas = p.pecas ?? montarPonto(p.carga, nivel, cargaEtapa, u, pesos).pecas
    const base = cargaPlanejada(p.carga, u, pesos, p.carga > 0 ? pecas : undefined)
    const diferenca = p.carga > 0 ? diferencaDoPonto(p.carga, nivel * cargaEtapa, cargaDasPecas(pecas, pesos, u)) : 0
    const ema = faixaAceitavel
      ? emaInstrumento(p.carga, balanca, faixaAceitavel.criterio, faixaAceitavel.toleranciaCliente)
      : null
    return {
      ...base,
      falta: diferenca < 0 ? -diferenca : 0,
      excesso: nivel > 0 && diferenca > 0 ? diferenca : 0,
      d: faixa.d,
      e: faixa.e,
      ema,
      nivelSubstituicao: nivel,
    }
  })
  const semFechar = pontos.filter((p) => p.falta > 0)
  const maiorNivel = Math.max(0, ...pontos.map((p) => p.nivelSubstituicao))
  // Com substituição (a do rascunho ou a sugerida), as cargas só sobem: descer de um ponto para o de baixo,
  // ou descarregar entre um e outro, pediria tirar o material de substituição (e refazer as etapas). Num
  // ensaio ainda sem leituras, a folha prevê o "crescente contínuo": no lugar do "crescente e decrescente"
  // (o padrão de um rascunho novo) e também do método do último certificado, com aviso (o sistema ainda está
  // com o outro). Com leituras, fica o método do ensaio: é o que foi feito
  const metodoDe = (m: MetodoCarregamento, e: EnsaioIndicacao | null | undefined): MetodoCarregamento =>
    maiorNivel > 0 && !temLeituras(e) ? 'CONTINUO' : m
  const metodoRascunho = ensaio?.metodo ?? metodoIndicacaoPadrao(balanca.classe)
  const metodo = metodoDe(metodoRascunho, ensaio)
  const comoEncontrado = calibracao?.comoEncontrado ?? ensaio
  const metodoComoEncontrado = metodoDe(comoEncontrado?.metodo ?? metodoRascunho, comoEncontrado)
  if (subSugerida && maiorNivel > 0)
    avisos.push(
      `Os pesos previstos não chegam às cargas acima de ${numeroBr(cargaEtapa)} ${u}: a folha sugere ${maiorNivel === 1 ? 'uma etapa' : `até ${maiorNivel} etapas`} de substituição de ${numeroBr(cargaEtapa)} ${u}; combine o material (caminhão, lastro) com o cliente.`,
    )
  if (semFechar.length && pesos.length) {
    // Abaixo da menor peça prevista (Min de uma rodoviária, com blocos de 500 kg): faltam pesos menores
    const menorPeca = Math.min(
      ...pesos.flatMap((x) => x.pesos.map((w) => cargaDasPecas([{ padraoId: x.id, pesoId: w.id, quantidade: 1 }], pesos, u))),
    )
    const pequenas = semFechar.every((p) => p.carga < menorPeca * (1 - TOL))
    avisos.push(
      `Os pesos previstos não fecham ${semFechar.length === 1 ? 'a carga' : 'as cargas'} de ${semFechar
        .map((p) => `${numeroBr(p.carga)} ${u}`)
        .join(', ')}: ${pequenas ? 'leve pesos menores.' : 'leve mais pesos ou use cargas de substituição.'}`,
    )
  }
  // Classe I: cargas em que as peças previstas passam de 1/3 do EMA (POP 6.1; R76 3.7.1). As sugeridas já evitam
  // (`pontosSugeridos`), mas Max, as do rascunho e um jogo pior podem cair fora; sem o aviso, o técnico mediria a
  // carga e o escritório só veria "Classe dos pesos insuficiente" no cálculo
  if (balanca.classe === 'I') {
    const fora = pontos.filter(
      (p) =>
        p.carga > 0 &&
        p.falta === 0 &&
        p.nivelSubstituicao === 0 &&
        pesosAtendemNaCarga(p.carga, p.pecas, balanca, pesos) === false,
    )
    const cargas = fora.map((p) => `${numeroBr(p.carga)} ${u}`).join(', ')
    if (fora.length)
      avisos.push(
        `Os pesos previstos não atendem a 6.1 do POP ${fora.length === 1 ? 'na carga' : 'nas cargas'} de ${cargas}: a soma dos EMA das peças passa de 1/3 do EMA da balança. Leve pesos de classe melhor (E1) ou mude a carga no sistema.`,
      )
  }
  // Etapas por baixo que, com os pesos por cima, passam da carga do ponto: o cálculo usaria a soma
  for (const p of pontos.filter((x) => x.excesso > 0))
    avisos.push(
      `Ponto de ${numeroBr(p.carga)} ${u}: ${p.nivelSubstituicao} ${p.nivelSubstituicao === 1 ? 'substituição' : 'substituições'} de ${numeroBr(cargaEtapa)} ${u}${p.pecas.length ? ' e os pesos por cima' : ''} somam ${numeroBr(Number((p.carga + p.excesso).toPrecision(12)))} ${u}; acerte o nível ou a carga no sistema.`,
    )
  // O certificado só cobre a faixa ensaiada: pontos parando bem antes de Max precisam ser combinados
  const maiorCarga = Math.max(0, ...pontos.map((p) => p.carga))
  if (max > 0 && pontos.length && maiorCarga < 0.9 * max * (1 - TOL))
    avisos.push(
      `Os pontos vão só até ${numeroBr(maiorCarga)} ${u} (${Math.round((maiorCarga / max) * 100)} % de Max) e o certificado só vale até essa carga: confirme com o cliente.`,
    )
  // Min marcada fica entre as cargas (as sugeridas já a têm); nas do rascunho, o aviso para incluí-la
  if (balanca.min > 0 && balanca.min < max && !pontos.some((p) => Math.abs(p.carga - balanca.min) <= TOL * max))
    avisos.push(`Min (${numeroBr(balanca.min)} ${u}) não está entre as cargas do erro de indicação: inclua-a no sistema.`)
  // O "como encontrado" do rascunho (quando há) também: cada aba do sistema tem o seu método
  const rotuloMetodo = (m: MetodoCarregamento) => `“${METODOS_CARREGAMENTO[m].label}”`
  const antesMudou = !!calibracao?.comoEncontrado && metodoComoEncontrado !== calibracao.comoEncontrado.metodo
  const finalMudou = metodo !== metodoRascunho
  const noSistema =
    antesMudou && finalMudou
      ? `no sistema, o “como encontrado” está ${rotuloMetodo(calibracao!.comoEncontrado!.metodo)} e o ensaio final, ${rotuloMetodo(metodoRascunho)}`
      : antesMudou
        ? `no sistema, o “como encontrado” está ${rotuloMetodo(calibracao!.comoEncontrado!.metodo)}`
        : `no sistema está ${rotuloMetodo(metodoRascunho)}`
  if (doRascunho && (antesMudou || finalMudou))
    avisos.push(
      `Com cargas de substituição, as cargas só sobem: a folha prevê ${rotuloMetodo('CONTINUO')} (${noSistema}); acerte no sistema.`,
    )

  // ---- Repetibilidade (sugerida: um ensaio por intervalo ou faixa de d diferente; na classe I, 10 leituras)
  const minimoPara = (carga: number) =>
    balanca.classe === 'I' ? LEITURAS_CLASSE_I : converterMassa(carga, u, 'kg') >= 100 * (1 - TOL) ? 3 : 5
  const ensaiosRep = calibracao?.repetibilidade.length
    ? calibracao.repetibilidade.map((r) => ({ carga: r.carga, leituras: r.leituras.length }))
    : repetibilidadesSugeridas(balanca, u).map((r) => ({ carga: r.carga, leituras: Math.max(r.leituras, 5) }))
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
    metodo: ecc?.metodo ?? metodoExcentricidadePadrao(balanca.classe),
    posicoes: aplicavel ? (ecc?.posicoes.length ? ecc.posicoes.map((p) => p.rotulo) : posicoesSugeridas) : [],
    ...cargaPlanejada(aplicavel ? ecc?.carga || cargaExcentricidade(max, u, balanca.classe) : 0, u, pesos),
  }

  // Cargas copiadas do último certificado (o rascunho novo e o "recalibrar"): a da excentricidade abaixo do
  // mínimo da Tabela 5 do POP (o arredondamento antigo ia para o mais próximo) e um ensaio de repetibilidade só
  // numa balança de vários intervalos (POP 7.2 e 7.9: acertar no sistema antes de imprimir)
  // Classe I: o método 3 (POP 7.10); o rascunho copiado de um certificado antigo pode vir com outro
  if (excentricidade.aplicavel && balanca.classe === 'I' && excentricidade.metodo !== 3)
    avisos.push('Excentricidade: na classe I, o POP pede o método 3 (zera antes de cada posição); acerte no sistema.')
  if (excentricidade.aplicavel && excentricidadeAbaixoDoMinimo(excentricidade.carga, max, u))
    avisos.push(
      `Excentricidade: ${numeroBr(excentricidade.carga)} ${u} está abaixo do mínimo da Tabela 5 do POP (${minimoExcentricidade(max, u).fracao}); use ≥ ${numeroBr(cargaExcentricidade(max, u, balanca.classe))} ${u} no sistema.`,
    )
  const semEnsaio = faixasSemRepetibilidade(
    balanca,
    repetibilidade.map((r) => r.carga),
  )
  if (repetibilidade.some((r) => r.carga > 0) && semEnsaio.length) {
    const { onde, nome } = ondeFaltaRepetibilidade(
      balanca.tipoFaixas,
      semEnsaio.map((f) => `até ${numeroBr(f.max)} ${u}`),
    )
    avisos.push(`Repetibilidade: falta ensaio ${onde} (o POP pede um em cada ${nome} de d diferente); acrescente no sistema.`)
  }

  // Repetibilidade e excentricidade com pesos que não fecham a carga: o técnico conferiria a carga
  // prevista aplicando menos (e a da excentricidade entra no cálculo)
  const faltaTexto = (c: CargaPlanejada) => `${numeroBr(c.carga)} ${u} (faltam ${numeroBr(c.falta)} ${u})`
  if (pesos.length) {
    repetibilidade.forEach((r, i) => {
      if (r.falta > 0)
        avisos.push(
          `Repetibilidade${repetibilidade.length > 1 ? ` (ensaio ${i + 1})` : ''}: os pesos previstos não fecham ${faltaTexto(r)}; complete com outra peça (não precisa ser padrão) ou mude a carga no sistema.`,
        )
    })
    if (excentricidade.falta > 0)
      avisos.push(
        `Excentricidade: os pesos previstos não fecham ${faltaTexto(excentricidade)}; leve mais pesos ou mude a carga no sistema.`,
      )
  }

  // ---- Substituição (a do rascunho ou a sugerida)
  const comSugestao = !!subSugerida && maiorNivel > 0
  // Pesos padrão de menos em cada etapa (regra da empresa, `pesosMinimosSubstituicao`; o POP não cobre as
  // rodoviárias): a referência fica quase toda no material sem calibração
  const minimoPesos = pesosMinimosSubstituicao(converterMassa(max, u, 'kg'))
  if ((substituicaoAtiva || comSugestao) && cargaEtapa > 0 && converterMassa(cargaEtapa, u, 'kg') < minimoPesos * (1 - TOL))
    avisos.push(
      `Cargas de substituição com ${numeroBr(cargaEtapa)} ${u} de pesos padrão em cada etapa: para Max de ${numeroBr(max)} ${u}, o mínimo é ${numeroBr(converterMassa(minimoPesos, 'kg', u))} ${u} (regra da empresa). Leve mais pesos.`,
    )
  const substituicao = {
    ativa: substituicaoAtiva,
    sugerida: comSugestao,
    etapas: substituicaoAtiva ? Math.max(sub!.etapas.length, maiorNivel) : maiorNivel,
    ...(substituicaoAtiva
      ? cargaPlanejada(cargaEtapa, u, pesos, sub!.pecas)
      : comSugestao
        ? cargaPlanejada(cargaEtapa, u, pesos, subSugerida.pecas)
        : cargaPlanejada(0, u, pesos)),
  }

  // ---- Padrões: validade na data prevista e peças a separar (união das peças de todas as cargas)
  const usadas = new Map<string, PecaCarga>()
  for (const c of [...pontos, ...repetibilidade, excentricidade, substituicao])
    for (const x of c.pecas) usadas.set(`${x.padraoId}:${x.pesoId}`, x)
  const validades = validadeDosPadroes(previstos, dataPrevista)
  // Um termo-higrômetro basta para o ambiente: o primeiro em dia (sem nenhum em dia, o primeiro)
  const termos = validades.itens.filter((x) => x.padrao.tipo === 'TERMOHIGROMETRO')
  const ambiente = (termos.find((x) => x.situacao !== 'VENCIDO') ?? termos[0])?.padrao
  // Nas classes I e II a pressão é obrigatória: um barômetro vai inteiro na lista (o primeiro em dia)
  const barometros = validades.itens.filter((x) => x.padrao.tipo === 'BAROMETRO')
  const barometro = pressaoObrigatoria(balanca.classe)
    ? (barometros.find((x) => x.situacao !== 'VENCIDO') ?? barometros[0])?.padrao
    : undefined
  const padroesPlano = validades.itens.map(({ padrao: p, situacao }): PadraoPlanejado => {
    const pecas = [...usadas.values()].filter((x) => x.padraoId === p.id)
    const separar = p.tipo === 'PESOS' ? descreverPecas(pecas, [p]) : ''
    // O barômetro fica na linha dos outros (a pressão é opcional e não entra no cálculo), menos nas classes I e
    // II, em que a pressão é obrigatória
    const naFolha = p.tipo === 'PESOS' ? !!separar : p.tipo === 'OUTRO' || p === ambiente || p === barometro
    return { padrao: p, situacao, separar, naFolha }
  })
  // Vencido só importa no que vai a campo (o que o plano não usa sai na linha dos outros, marcado)
  avisos.push(
    ...validadeDosPadroes(
      padroesPlano.filter((x) => x.naFolha).map((x) => x.padrao),
      dataPrevista,
    ).avisos,
  )
  if (!pesos.length) avisos.push('Nenhum jogo de pesos padrão previsto: escolha os pesos antes de sair.')

  return {
    origem: doRascunho ? 'RASCUNHO' : 'SUGESTAO',
    unidade: u,
    max,
    metodo,
    metodoComoEncontrado,
    pontos,
    conformidade,
    faixaAceitavel,
    repetibilidade,
    excentricidade,
    substituicao,
    padroes: padroesPlano,
    limiteDeltaTPesos: balanca.classe === 'I' ? deltaTPesosMaximo(pesos.map((p) => p.classe)) : null,
    avisos,
  }
}

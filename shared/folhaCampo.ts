// Plano da folha de campo: o que a folha impressa antes da visita leva pronto (pontos de carga com os
// pesos de cada um, carga e posições da excentricidade, carga e nº de leituras da repetibilidade,
// substituição e padrões a separar). Usa os ensaios do rascunho quando existem e, quando estão vazios,
// as mesmas sugestões do assistente ("Sugerir pontos", "Começar com a carga sugerida", "Preparar
// posições"): as linhas do papel batem com as da tela na hora de digitar. Puro (navegador e servidor).

import {
  avisoDaFolhaCargasDaConformidade,
  cargaDaEtapa,
  cargaDasPecas,
  comCargasDoEma,
  descreverPecas,
  diferencaDoPonto,
  montarCarga,
  montarPonto,
  pesosAtendemNaCarga,
  pontosSugeridos,
} from './calibracao.ts'
import {
  comMetodoIndicacaoDaClasse,
  converterMassa,
  deltaTPesosMaximo,
  ehRodoviaria,
  metodoExcentricidadePadrao,
  metodoIndicacaoDaVisita,
  metodoIndicacaoPadrao,
  METODOS_EXCENTRICIDADE,
  numeroBr,
  padroesSemHistorico,
  type BalancaDosPadroes,
  situacaoValidade,
  type SituacaoValidade,
} from './dominio.ts'
import {
  cargaExcentricidade,
  CRITERIO_NAO_PESA_CORRETAMENTE,
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
 * Rev. 01: folha enxuta (dado impresso diferente vai no verso, sem caixas de correção). Rev. 02: compacta, em 2
 * páginas (frente e verso) nas balanças cadastradas: chegada e balança num bloco, ambiente do início e do fim numa
 * tabela, repetibilidade na horizontal, escritório ao lado das observações. Rev. 03 (1.0.3): só a medição: sem QR, sem
 * rubrica no rodapé e só a OS na faixa do alto; sem a verificação antes de calibrar (o passo 4 é só o ambiente), sem
 * ajuste e reparo, sem "como encontrado" e "depois do ajuste", sem a faixa do EMA e sem o encerramento (a conformidade
 * e a próxima calibração ficam só no sistema; o diferente, as observações e as anomalias vão no bloco Anotações ou
 * numa folha anexa); o ΔT pesos − ar e o ajuste interno de rotina (CAL) antes dos ensaios só na balança classe I (a
 * folha em branco é das classes II a IIII); a excentricidade com o método numa frase fixa; o lembrete do ambiente do
 * fim antes das assinaturas; 8 passos. Rev. 04 (1.0.4): sem faixa no alto (a OS fica no passo 2) e o bloco Anotações
 * no fim da folha, depois das assinaturas; os rótulos das tabelas de escrever numa linha de cabeçalho própria (nenhum
 * dentro das caixas); o método de carregamento numa linha fixa, o da classe (POP 7.7), sem caixas de marcar (no
 * "crescente e decrescente", sem zerar no meio e, ao trocar peças, sem passar da carga na subida nem ficar abaixo dela
 * na descida), e a descida fechada só no zero e em Max; a hora só na chegada, no ambiente, no término e no ajuste
 * interno da classe I (sem o início do erro de indicação e a hora da repetibilidade e da excentricidade); a
 * repetibilidade sem o zero depois de retirar a carga e, sem carga prevista, só a carga aplicada (sem os pesos); na
 * folha em branco, uma linha da repetibilidade por faixa do passo 3 (POP 7.9: um ensaio em cada intervalo ou faixa); a
 * excentricidade sem carga prevista só com a carga usada; os padrões cadastrados sem linha em branco no fim (o que não
 * está na lista vai em Anotações). Rev. 05 (1.0.5): a pressão com a marca ● em toda classe (sem "opcional" e sem
 * "obrigatória na classe II"); a marca ● no retorno ao zero e na carga da repetibilidade e da excentricidade escritas no
 * local; sem as dimensões do prato; a inscrição estadual do cliente, quando houver; na folha em branco, as posições 1 a 5
 * da excentricidade impressas e as cargas do EMA só com a declaração de conformidade. A folha impressa antes continua
 * igual na reimpressão (o PDF guardado), com a rev. 04.
 * O procedimento de referência é o POP configurado no sistema (sai no rodapé, ver `referenciaDoFormulario`);
 * `referencia` é o guia técnico (metadados do PDF).
 */
export const FORMULARIO_FOLHA_CAMPO = {
  codigo: 'FOR-CAL-01',
  revisao: '05',
  titulo: 'Folha de campo de calibração de balança',
  referencia: 'EURAMET cg-18 v4.0',
} as const

/**
 * "FC-2026-00042", "fc 2026 42", "2026-42" → "FC-2026-00042"; '' se não for um nº de folha. Como o técnico digita o nº
 * impresso no alto da folha: "Ligar à calibração", a reimpressão e a busca da aba "Folhas de campo".
 */
export function numeroDaFolha(v: unknown): string {
  const m = typeof v === 'string' ? /^\s*(?:FC[\s-]*)?(\d{4})[\s-]+(\d{1,5})\s*$/i.exec(v) : null
  return m ? `FC-${m[1]}-${m[2].padStart(5, '0')}` : ''
}

/**
 * Nas palavras-chave do PDF de toda folha impressa desde a 1.0.5: as regras dela (a pressão obrigatória em toda classe;
 * as cargas em que o EMA muda só com a declaração de conformidade). A folha que volta da pasta das folhas sem a marca
 * foi impressa pela 1.0.4 ou antes (`antes_105`), qualquer que seja a data. Não mude: as folhas impressas a trazem.
 */
export const MARCA_FOLHA_REGRAS_105 = 'regras 1.0.5'

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
 * Critério da "faixa aceitável" (carga ± EMA) de cada ponto: o da declaração de conformidade, quando o cliente pediu;
 * sem pedido, o limite de "não pesa corretamente" do POP (7.8, o EMA em serviço), quando a balança tem classe.
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

/**
 * Critério da faixa aceitável quando o cliente não pediu declaração de conformidade: o mesmo do cálculo para a balança
 * que não pesa corretamente (POP 7.8; `CRITERIO_NAO_PESA_CORRETAMENTE`).
 */
export const CRITERIO_AJUSTE: Exclude<CriterioEma, 'CLIENTE'> = CRITERIO_NAO_PESA_CORRETAMENTE

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
   * Como as cargas vão ser aplicadas (o ensaio final, "depois do ajuste" quando há ajuste): fixo pela classe (POP 7.7,
   * `metodoIndicacaoPadrao`), "crescente e decrescente" nas classes II a IIII e sem classe e "crescente com descarga" na
   * classe I, também com cargas de substituição. Só o ensaio que já tem leituras (medido antes desta regra) fica com o
   * método dele, mesmo fora do POP: é o que foi feito.
   */
  metodo: MetodoCarregamento
  /** O do ensaio "como encontrado" (no sistema, cada aba do erro de indicação tem o seu), pela mesma regra. */
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

/**
 * Como fazer a excentricidade, numa frase fixa da folha (sem opções de marcar), com os nomes do POP (7.10), que não
 * numera os métodos: nas classes II a IIII (e na folha em branco), zera vazia e desloca a carga (no sistema, o método 1,
 * "Zera e desloca a carga pelas posições"); na classe I, o zero antes de cada posição (o 3). O plano avisa antes de sair
 * quando o sistema está com outro.
 */
export const METODO_EXCENTRICIDADE_FOLHA = {
  classeI: 'Zere antes de cada posição',
  demais: 'Zere vazia e desloque a carga pelas posições',
} as const

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
 * menos os "outro"; na classe I, só os jogos E1, E2 e F1, e com os "outro", como o termômetro de duas entradas; com a
 * balança, nas outras classes, sem o jogo de classe pior que a mínima quando os outros montam Max).
 */
export function padroesPrevistos(
  calibracao: Pick<CalibracaoInput, 'padroesIds'> | null,
  padroes: Padrao[],
  classe?: ClasseExatidao | BalancaDosPadroes | null,
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
  const previstos = padroesPrevistos(calibracao, padroes, balanca)
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
  const doPlano = doRascunho
    ? ensaio!.pontos.map((p) => ({ carga: p.carga, pecas: p.pecasManuais ? p.pecas : undefined, nivel: p.nivelSubstituicao }))
    : // Sem os pontos no rascunho, os sugeridos: as cargas em que o EMA muda só com a conformidade pedida (POP 7.7) ou
      // com a folha da calibração impressa antes da 1.0.5, que as trazia (`comCargasDoEma`, como "Sugerir pontos")
      pontosSugeridos(balanca, pesos, !!calibracao && comCargasDoEma(calibracao)).map((carga) => ({
        carga,
        pecas: undefined as PecaCarga[] | undefined,
        nivel: 0,
      }))
  // O zero é uma das cargas (POP 7.7) e a leitura dele, obrigatória: o plano do rascunho sem a linha dele (o copiado na
  // 1.0.5 de um certificado emitido sem ela, ou a linha apagada) sai com ela no começo, para o técnico anotar a leitura
  const pontosBase = doPlano.some((p) => !(p.carga > 0))
    ? doPlano
    : [{ carga: 0, pecas: undefined as PecaCarga[] | undefined, nivel: 0 }, ...doPlano]
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
    // Pela classe dos pesos, como o editor monta (POP 6.1)
    const pecas = p.pecas ?? montarPonto(p.carga, nivel, cargaEtapa, u, pesos, balanca).pecas
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
  // O método de carregamento é fixo pela classe (POP 7.7, `metodoIndicacaoPadrao`): "crescente e decrescente" nas
  // classes II a IIII e sem classe; "crescente com descarga" na classe I. Como a tela (`comMetodoIndicacaoDaClasse`): o
  // do rascunho sem leitura de carga não conta (o sistema o acerta pela classe; o zero lido não conta); o ensaio que já
  // tem leitura de carga, medido com outro método antes desta regra, fica com o dele: é o que foi feito. A visita feita
  // antes desta regra (`metodoIndicacaoDaVisita`: já medida ou com a folha de antes impressa) também, mesmo sem leituras
  const daVisita = !!calibracao && metodoIndicacaoDaVisita(calibracao)
  const metodoDe = (e: EnsaioIndicacao | null | undefined): MetodoCarregamento =>
    e ? comMetodoIndicacaoDaClasse(e, balanca.classe, daVisita).metodo : metodoIndicacaoPadrao(balanca.classe)
  const metodo = metodoDe(ensaio)
  const metodoComoEncontrado = metodoDe(calibracao?.comoEncontrado ?? ensaio)
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
  // Cargas em que as peças previstas passam de 1/3 do EMA (POP 6.1; R76 3.7.1), em toda classe. A montagem já prefere
  // os jogos de classe melhor (`montarCarga`) e, na classe I, as sugeridas já evitam (`pontosSugeridos`), mas Max, as do
  // rascunho e um jogo pior podem cair fora; sem o aviso, o técnico mediria a carga e o escritório só veria "Classe dos
  // pesos insuficiente" no cálculo
  {
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
        `Os pesos previstos não atendem a 6.1 do POP ${fora.length === 1 ? 'na carga' : 'nas cargas'} de ${cargas}: a soma dos EMA das peças passa de 1/3 do EMA da balança. Leve pesos de classe melhor${balanca.classe === 'I' ? ' (E1)' : ''} ou mude a carga no sistema.`,
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
  // Conformidade pedida e os pontos do rascunho (copiados ou sugeridos antes do pedido) sem as cargas em que o EMA muda
  const semCargasDoEma = calibracao && doRascunho ? avisoDaFolhaCargasDaConformidade(calibracao, balanca) : null
  if (semCargasDoEma) avisos.push(semCargasDoEma)

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
  // Classe I: o método 3 (POP 7.10); o rascunho copiado de um certificado antigo pode vir com outro. Nas outras
  // classes, a folha imprime o método 1 numa frase fixa (sem opções de marcar): o sistema tem de estar com ele. Os
  // métodos pelos nomes: o do POP e da folha (`METODO_EXCENTRICIDADE_FOLHA`) e o do sistema (o POP não os numera)
  const noSistema = `o sistema está com “${METODOS_EXCENTRICIDADE[excentricidade.metodo]}”`
  if (excentricidade.aplicavel && balanca.classe === 'I' && excentricidade.metodo !== 3)
    avisos.push(
      `Excentricidade: na classe I, o POP (7.10) pede “${METODO_EXCENTRICIDADE_FOLHA.classeI}”, e ${noSistema}; acerte no sistema.`,
    )
  if (excentricidade.aplicavel && balanca.classe !== 'I' && excentricidade.metodo !== 1)
    avisos.push(
      `Excentricidade: a folha prevê “${METODO_EXCENTRICIDADE_FOLHA.demais}” (POP 7.10), e ${noSistema}; acerte no sistema.`,
    )
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
  // A pressão é obrigatória em toda calibração (POP 7.5): o rascunho novo já marca o barômetro (`padroesSemHistorico`);
  // o de antes da 1.0.5 nas classes III e IIII e sem classe, não. Sem barômetro previsto, os ativos entram (para levar)
  const barometrosFora = previstos.some((p) => p.tipo === 'BAROMETRO')
    ? []
    : padroes.filter((p) => p.ativo && p.tipo === 'BAROMETRO' && !previstos.some((x) => x.id === p.id))
  const validades = validadeDosPadroes([...previstos, ...barometrosFora], dataPrevista)
  // Um termo-higrômetro basta para o ambiente: o primeiro em dia (sem nenhum em dia, o primeiro)
  const termos = validades.itens.filter((x) => x.padrao.tipo === 'TERMOHIGROMETRO')
  const ambiente = (termos.find((x) => x.situacao !== 'VENCIDO') ?? termos[0])?.padrao
  // Um barômetro vai inteiro na lista (o primeiro em dia; sem nenhum em dia, o primeiro)
  const barometros = validades.itens.filter((x) => x.padrao.tipo === 'BAROMETRO')
  const barometro = (barometros.find((x) => x.situacao !== 'VENCIDO') ?? barometros[0])?.padrao
  const padroesPlano = validades.itens.map(({ padrao: p, situacao }): PadraoPlanejado => {
    const pecas = [...usadas.values()].filter((x) => x.padraoId === p.id)
    const separar = p.tipo === 'PESOS' ? descreverPecas(pecas, [p]) : ''
    // O termo-higrômetro e o barômetro do ambiente vão inteiros; os outros, na linha dos outros
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
  // A pressão é obrigatória em toda calibração (POP 7.5), com o barômetro listado nos padrões
  if (!barometro)
    avisos.push('Nenhum barômetro ativo cadastrado: a pressão atmosférica é obrigatória (POP 7.5). Cadastre-o em Padrões.')
  // Classe I: o ΔT pesos − ar do passo 4 é medido com o termômetro de duas entradas (padrão "Outro", POP 6.2)
  if (balanca.classe === 'I' && !previstos.some((p) => p.tipo === 'OUTRO' && p.ativo))
    avisos.push(
      'Nenhum termômetro de duas entradas (padrão Outro) previsto: o ΔT do passo 4 precisa dele. Cadastre-o em Padrões → Novo padrão → Outro e escolha-o nos padrões da calibração antes de sair.',
    )

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

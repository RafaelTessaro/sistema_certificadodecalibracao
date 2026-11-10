// Rascunho de uma calibração nova a partir do cadastro: com a balança escolhida, aproveita da última
// calibração emitida dela os padrões, os pontos, as cargas e as posições (sem as leituras). Usado ao
// criar a calibração (POST /api/calibracoes) e na folha de campo de uma balança sem rascunho, que assim
// sai com o mesmo plano que o rascunho teria.

import { comCargasDoEmaIncluidas, pecasSemPadrao, planoDoHistoricoSemConformidade } from '#shared/calibracao.ts'
import {
  calibracaoEmOutraUnidade,
  calibracaoVazia,
  enderecoCliente,
  hojeLocalIso,
  metodoExcentricidadePadrao,
  metodoIndicacaoPadrao,
  normalizarOpcoes,
  opcoesDaClasse,
  padroesSemHistorico,
  somarMeses,
} from '#shared/dominio.ts'
import type {
  Balanca,
  Calibracao,
  CalibracaoInput,
  ClasseExatidao,
  EmissaoCertificado,
  EnsaioIndicacao,
  Padrao,
} from '#shared/tipos.ts'
import type { Contexto } from './contexto.ts'

/** Só os dados de entrada (o que a tela edita) de uma calibração gravada. */
export function entradaDe(k: Calibracao): CalibracaoInput {
  const {
    id: _id,
    versao: _v,
    status: _s,
    numero: _n,
    ano: _a,
    sequencia: _q,
    revisao: _r,
    emissao: _e,
    cancelamento: _c,
    criadoPor: _p,
    criadoEm: _ce,
    atualizadoEm: _ae,
    ...entrada
  } = k
  return entrada
}

/**
 * Os ensaios sem as leituras (mesmos pontos, cargas e pesos), para uma nova calibração da mesma balança. Sem leituras,
 * não há método medido a guardar (`EnsaioIndicacao.metodoMedido`, do ensaio trocado de método depois delas).
 */
export function semLeituras(k: CalibracaoInput): Pick<CalibracaoInput, 'repetibilidade' | 'excentricidade' | 'indicacao'> {
  const { metodoMedido: _medido, ...indicacao } = k.indicacao
  return {
    repetibilidade: k.repetibilidade.map((r) => ({ ...r, leituras: r.leituras.map(() => null) })),
    excentricidade: {
      ...k.excentricidade,
      posicoes: k.excentricidade.posicoes.map((p) => ({ ...p, leitura: null, referencia: null })),
    },
    indicacao: {
      ...indicacao,
      retornoZero: null,
      pontos: k.indicacao.pontos.map((p) => ({ ...p, crescente: null, decrescente: null })),
      substituicao: {
        ...k.indicacao.substituicao,
        etapas: k.indicacao.substituicao.etapas.map(() => ({ leituraPadroes: null, leituraSubstituicao: null })),
      },
    },
  }
}

/**
 * O plano copiado só com as peças dos padrões que entram (`padroes`: os ativos da lista do rascunho novo). O ponto com
 * peças de um jogo que ficou de fora (desativado depois do certificado) ou tiradas do cadastro do jogo volta sem peças e
 * automático: a tela e a folha de campo montam de novo com os pesos escolhidos. As etapas de substituição com essas
 * peças voltam sem pesos (o técnico informa a carga de novo). Sem isso, o cálculo ficaria com a carga das que sobraram.
 */
export function comPecasDosPadroes<T extends Pick<CalibracaoInput, 'indicacao'>>(k: T, padroes: Padrao[]): T {
  const ensaio = (e: EnsaioIndicacao): EnsaioIndicacao => {
    const pontos = e.pontos.map((p) => (pecasSemPadrao(p.pecas, padroes) ? { ...p, pecas: [], pecasManuais: false } : p))
    const substituicao = pecasSemPadrao(e.substituicao.pecas, padroes) ? { ...e.substituicao, pecas: [] } : e.substituicao
    return pontos.every((p, i) => p === e.pontos[i]) && substituicao === e.substituicao ? e : { ...e, pontos, substituicao }
  }
  const indicacao = ensaio(k.indicacao)
  return indicacao === k.indicacao ? k : { ...k, indicacao }
}

/**
 * O plano copiado de uma calibração anterior (sem as leituras, `semLeituras`), conforme o POP para a classe de hoje da
 * balança: a excentricidade pelo método da classe (POP 7.10: 1; na classe I, 3), o erro de indicação também (POP 7.7:
 * "crescente e decrescente"; na classe I, "crescente com descarga"; o "crescente contínuo" ou o "Decrescente" do
 * certificado anterior não passa para a calibração nova) e as leituras com a divisão normal (o modo de serviço, POP
 * 7.6, é combinado com o cliente a cada visita: copiado, daria uma incerteza menor sem ninguém ver).
 */
export function planoConformeAoPop<
  T extends Pick<CalibracaoInput, 'excentricidade' | 'opcoes'> & Partial<Pick<CalibracaoInput, 'indicacao'>>,
>(k: T, classe: ClasseExatidao | null | undefined): T {
  return {
    ...k,
    excentricidade: { ...k.excentricidade, metodo: metodoExcentricidadePadrao(classe) },
    ...(k.indicacao ? { indicacao: { ...k.indicacao, metodo: metodoIndicacaoPadrao(classe) } } : {}),
    opcoes: { ...k.opcoes, divisaoTeste: 0 },
  }
}

/**
 * O plano de uma calibração nova copiado de uma emitida da mesma balança (`anterior`, na unidade atual; "Nova
 * calibração", "Calibrar de novo" e a folha da balança): sem as leituras (`semLeituras`), conforme o POP para a classe
 * de hoje (`planoConformeAoPop`), só com as peças dos `padroes` que entram (os ativos da lista do rascunho novo;
 * `comPecasDosPadroes`) e, sem a declaração de conformidade pedida, sem as cargas em que o EMA muda que as sugestões
 * até a 1.0.4 sempre traziam (`planoDoHistoricoSemConformidade`; POP 7.7). Na emitida a partir da 1.0.5
 * (`emissao.cargasDoEmaAcordadas`), elas ficam: a sugestão já não as trazia, então a que está entre os pontos foi
 * acordada com o cliente. Com a declaração pedida, as que faltavam na última entram (`comCargasDoEmaIncluidas`).
 */
export function planoDoHistorico(
  anterior: CalibracaoInput,
  balanca: Balanca | null | undefined,
  padroes: Padrao[],
  emissao: Pick<EmissaoCertificado, 'cargasDoEmaAcordadas'> | null | undefined,
): Pick<CalibracaoInput, 'repetibilidade' | 'excentricidade' | 'indicacao' | 'opcoes'> {
  const plano = planoDoHistoricoSemConformidade(
    comPecasDosPadroes(planoConformeAoPop({ ...semLeituras(anterior), opcoes: anterior.opcoes }, balanca?.classe), padroes),
    balanca,
    padroes,
    anterior.conformidade.solicitada || emissao?.cargasDoEmaAcordadas === true,
  )
  // Com a declaração pedida (que a calibração nova copia), as cargas em que o EMA muda que faltavam na última entram
  // no plano, sem leituras (POP 7.7): a folha impressa dele já sai com elas
  return anterior.conformidade.solicitada ? comCargasDoEmaIncluidas(plano, balanca, padroes).calibracao : plano
}

/**
 * Os padrões de uma calibração nova copiados de uma anterior (`ids`): os que continuam ativos (`ativos`, o cadastro de
 * hoje) e, se ela não tinha barômetro (a pressão era opcional nas classes III e IIII e sem classe até a 1.0.5), os
 * barômetros ativos: a pressão é obrigatória em toda calibração (POP 7.5).
 */
export function padroesDoHistorico(ids: string[], ativos: Pick<Padrao, 'id' | 'tipo'>[]): string[] {
  const continuam = ids.filter((id) => ativos.some((p) => p.id === id))
  const barometros = ativos.filter((p) => p.tipo === 'BAROMETRO').map((p) => p.id)
  return barometros.some((id) => continuam.includes(id)) ? continuam : [...continuam, ...barometros]
}

/**
 * Os dados de entrada de uma calibração, com as cargas e leituras na unidade atual da balança, para
 * servirem de base a outra (nova calibração, calibrar de novo, revisão). O certificado emitido guarda os
 * números na unidade da balança no dia da emissão (a da cópia congelada); se o cadastro mudou de unidade
 * depois (6000 g → 6 kg), copiar sem converter faria 6000 g valer 6000 kg. Os rascunhos já acompanham a
 * troca quando ela acontece (ver `converterAbertas` no repositório).
 */
export function naUnidadeAtual(ctx: Contexto, k: Calibracao): CalibracaoInput {
  const entrada = entradaDe(k)
  const de = k.emissao?.balanca.unidade
  const para = ctx.repo.obterBalanca(k.balancaId)?.unidade
  return de && para ? calibracaoEmOutraUnidade(entrada, de, para) : entrada
}

/**
 * Rascunho novo: `pedido` traz o que a tela informou (cliente, balança, OS, data…). Sem histórico da
 * balança, os ensaios ficam vazios (a tela e a folha de campo sugerem os pontos), com os métodos da classe, e os
 * padrões são os de `padroesSemHistorico`. Com histórico, o plano da última calibração emitida, conforme o POP
 * (`planoDoHistorico`). Na classe I, as opções do cálculo saem as da classe (empuxo pela densidade do ar medida e
 * convecção; `opcoesDaClasse`). Sem ajuste, reparo nem "como encontrado" (POP 7.8).
 */
export function rascunhoInicial(ctx: Contexto, pedido: Record<string, unknown>, tecnicoId: string): CalibracaoInput {
  const { repo } = ctx
  const config = repo.obterConfig()
  const balancaId = typeof pedido.balancaId === 'string' ? pedido.balancaId : ''
  const balanca = balancaId ? repo.obterBalanca(balancaId) : undefined
  // Sem histórico, os métodos da classe (na classe I: excentricidade pelo método 3 e cargas com descarga)
  const base = calibracaoVazia(config.opcoesPadrao, balanca?.classe)
  const clienteId = typeof pedido.clienteId === 'string' && pedido.clienteId ? pedido.clienteId : (balanca?.clienteId ?? '')
  const cliente = clienteId ? repo.obterCliente(clienteId) : undefined
  const anterior = balanca ? repo.listarCalibracoes({ balancaId: balanca.id, status: 'EMITIDO', limite: 1 }).itens[0] : undefined
  const emitida = anterior ? repo.obterCalibracao(anterior.id) : undefined
  const ultima = emitida ? naUnidadeAtual(ctx, emitida) : undefined
  const ativos = repo.listarPadroes()
  const hoje = hojeLocalIso(repo.agora())
  const data = typeof pedido.dataCalibracao === 'string' && pedido.dataCalibracao ? pedido.dataCalibracao : hoje
  // Sem histórico, os da classe da balança (fora da classe I, sem o jogo de classe pior que a mínima para ela); com ele,
  // os da última que continuam ativos, com o barômetro (`padroesDoHistorico`)
  const padroesIds = ultima
    ? padroesDoHistorico(ultima.padroesIds, ativos)
    : padroesSemHistorico(ativos, balanca ?? null).map((p) => p.id)
  // Da última calibração, o plano (sem as leituras), com o método da excentricidade da classe e sem o modo de serviço,
  // e só com as peças dos padrões que continuam; sem a declaração de conformidade, sem as cargas em que o EMA muda
  // (POP 7.7) que as sugestões até a 1.0.4 sempre traziam (a emitida a partir da 1.0.5 fica com as acordadas)
  const historico = ultima
    ? planoDoHistorico(
        ultima,
        balanca,
        ativos.filter((p) => padroesIds.includes(p.id)),
        emitida?.emissao,
      )
    : undefined
  return {
    ...base,
    ...(historico ? { ...historico, conformidade: ultima!.conformidade } : {}),
    ...pedido,
    clienteId,
    balancaId,
    dataCalibracao: data,
    localEndereco:
      typeof pedido.localEndereco === 'string' && pedido.localEndereco
        ? pedido.localEndereco
        : cliente
          ? enderecoCliente(cliente)
          : '',
    tecnicoId,
    padroesIds,
    // As opções pedidas (quando vêm), as da última calibração ou as padrão; na classe I, com as da classe
    opcoes: opcoesDaClasse(
      pedido.opcoes ? normalizarOpcoes(pedido.opcoes, base.opcoes) : (historico?.opcoes ?? base.opcoes),
      balanca?.classe,
    ),
    // O lembrete conta da data da calibração (que pode ser a de uma visita marcada)
    proximaCalibracao: config.mesesProximaPadrao ? somarMeses(data, config.mesesProximaPadrao) : '',
    proximaNoCertificado: ultima?.proximaNoCertificado ?? false,
    substituiId: '',
  }
}

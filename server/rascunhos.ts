// Rascunho de uma calibração nova a partir do cadastro: com a balança escolhida, aproveita da última
// calibração emitida dela os padrões, os pontos, as cargas e as posições (sem as leituras). Usado ao
// criar a calibração (POST /api/calibracoes) e na folha de campo de uma balança sem rascunho, que assim
// sai com o mesmo plano que o rascunho teria.

import { calibracaoEmOutraUnidade, calibracaoVazia, enderecoCliente, hojeLocalIso, somarMeses } from '#shared/dominio.ts'
import type { Calibracao, CalibracaoInput } from '#shared/tipos.ts'
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

/** Os ensaios sem as leituras (mesmos pontos, cargas e pesos), para uma nova calibração da mesma balança. */
export function semLeituras(k: CalibracaoInput): Pick<CalibracaoInput, 'repetibilidade' | 'excentricidade' | 'indicacao'> {
  return {
    repetibilidade: k.repetibilidade.map((r) => ({ ...r, leituras: r.leituras.map(() => null) })),
    excentricidade: {
      ...k.excentricidade,
      posicoes: k.excentricidade.posicoes.map((p) => ({ ...p, leitura: null, referencia: null })),
    },
    indicacao: {
      ...k.indicacao,
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
 * balança, os ensaios ficam vazios (a tela e a folha de campo sugerem os pontos). Nada que o técnico
 * confirma na visita vem marcado: a verificação antes de calibrar começa sem resposta, e o pedido de
 * declaração de conformidade e o da data no certificado começam desmarcados (o critério e a regra da última
 * calibração ficam prontos, caso o cliente peça de novo).
 */
export function rascunhoInicial(ctx: Contexto, pedido: Record<string, unknown>, tecnicoId: string): CalibracaoInput {
  const { repo } = ctx
  const config = repo.obterConfig()
  const base = calibracaoVazia(config.opcoesPadrao)
  const balancaId = typeof pedido.balancaId === 'string' ? pedido.balancaId : ''
  const balanca = balancaId ? repo.obterBalanca(balancaId) : undefined
  const clienteId = typeof pedido.clienteId === 'string' && pedido.clienteId ? pedido.clienteId : (balanca?.clienteId ?? '')
  const cliente = clienteId ? repo.obterCliente(clienteId) : undefined
  const anterior = balanca ? repo.listarCalibracoes({ balancaId: balanca.id, status: 'EMITIDO', limite: 1 }).itens[0] : undefined
  const emitida = anterior ? repo.obterCalibracao(anterior.id) : undefined
  const ultima = emitida ? naUnidadeAtual(ctx, emitida) : undefined
  const ativos = repo.listarPadroes()
  const hoje = hojeLocalIso(repo.agora())
  const data = typeof pedido.dataCalibracao === 'string' && pedido.dataCalibracao ? pedido.dataCalibracao : hoje
  const padroesIds = ultima
    ? ultima.padroesIds.filter((id) => ativos.some((p) => p.id === id))
    : ativos.filter((p) => p.tipo !== 'OUTRO').map((p) => p.id)
  return {
    ...base,
    ...(ultima
      ? { ...semLeituras(ultima), opcoes: ultima.opcoes, conformidade: { ...ultima.conformidade, solicitada: false } }
      : {}),
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
    // O lembrete conta da data da calibração (que pode ser a de uma visita marcada)
    proximaCalibracao: config.mesesProximaPadrao ? somarMeses(data, config.mesesProximaPadrao) : '',
    proximaNoCertificado: false,
    substituiId: '',
  }
}

// Calibrações (rascunho → revisão → emitido), PDF do certificado, envio por e-mail, lembretes de
// vencimento e a conferência pública de autenticidade (QR code).

import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  calibracaoVazia,
  descricaoBalanca,
  enderecoCliente,
  formatarDataBr,
  hojeLocalIso,
  listaEmails,
  nomeArquivoCertificado,
  normalizarCalibracao,
  somarMeses,
} from '#shared/dominio.ts'
import type { Calibracao, CalibracaoInput, StatusCalibracao } from '#shared/tipos.ts'
import { emitirCertificado, padroesDa, pdfDaCalibracao, pendenciasDa, previa } from '../certificados.ts'
import type { Contexto } from '../contexto.ts'
import type { criarModuloEmail } from '../email.ts'
import { destinatarios } from '../email.ts'
import { ErroApi } from '../erros.ts'

type ComId = FastifyRequest<{ Params: { id: string } }>
type Corpo = Record<string, unknown>
const corpo = (req: FastifyRequest): Corpo => (req.body && typeof req.body === 'object' ? (req.body as Corpo) : {})
const versaoDe = (c: Corpo) => (typeof c.versao === 'number' ? c.versao : undefined)

/** Só os dados de entrada (o que a tela edita) de uma calibração gravada. */
function entradaDe(k: Calibracao): CalibracaoInput {
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
function semLeituras(k: CalibracaoInput): Pick<CalibracaoInput, 'repetibilidade' | 'excentricidade' | 'indicacao'> {
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

export async function rotasCalibracoes(app: FastifyInstance, ctx: Contexto, email: ReturnType<typeof criarModuloEmail>) {
  const { repo } = ctx
  const autor = (req: FastifyRequest) => {
    if (!req.usuario) throw new ErroApi(401, 'Sua sessão terminou. Entre de novo para continuar.', { codigo: 'SEM_SESSAO' })
    return req.usuario
  }
  const obter = (id: string) => {
    const k = repo.obterCalibracao(id)
    if (!k) throw new ErroApi(404, 'Calibração não encontrada.')
    return k
  }

  app.get('/api/calibracoes', async (req) => {
    const q = req.query as Record<string, string | undefined>
    return repo.listarCalibracoes({
      status: (q.status ?? '') as StatusCalibracao | 'ABERTAS' | '',
      clienteId: q.clienteId,
      balancaId: q.balancaId,
      busca: q.busca,
      de: q.de,
      ate: q.ate,
      pagina: Number(q.pagina) || 1,
      limite: Number(q.limite) || 50,
    })
  })

  app.get('/api/calibracoes/:id', async (req: ComId) => {
    const k = obter(req.params.id)
    const aberta = k.status === 'RASCUNHO' || k.status === 'REVISAO'
    return {
      calibracao: k,
      cliente: k.emissao?.cliente ?? repo.obterCliente(k.clienteId),
      balanca: k.emissao?.balanca ?? repo.obterBalanca(k.balancaId),
      padroes: k.emissao?.padroes ?? padroesDa(ctx, k),
      envios: repo.listarEnvios({ calibracaoId: k.id }),
      pendencias: aberta ? pendenciasDa(ctx, k) : [],
      revisoes: repo.revisoesDe(k.id),
    }
  })

  /**
   * Nova calibração (rascunho). Com a balança escolhida, aproveita da última calibração dela os
   * padrões, os pontos e as cargas (sem as leituras); sem histórico, a tela sugere os pontos.
   */
  app.post('/api/calibracoes', async (req, reply) => {
    const u = autor(req)
    const c = corpo(req)
    const config = repo.obterConfig()
    const base = calibracaoVazia(config.opcoesPadrao)
    const balancaId = typeof c.balancaId === 'string' ? c.balancaId : ''
    const balanca = balancaId ? repo.obterBalanca(balancaId) : undefined
    const clienteId = typeof c.clienteId === 'string' && c.clienteId ? c.clienteId : (balanca?.clienteId ?? '')
    const cliente = clienteId ? repo.obterCliente(clienteId) : undefined
    const anterior = balanca
      ? repo.listarCalibracoes({ balancaId: balanca.id, status: 'EMITIDO', limite: 1 }).itens[0]
      : undefined
    const ultima = anterior ? repo.obterCalibracao(anterior.id) : undefined
    const ativos = repo.listarPadroes()
    const hoje = hojeLocalIso()
    const padroesIds = ultima
      ? ultima.padroesIds.filter((id) => ativos.some((p) => p.id === id))
      : ativos.filter((p) => p.tipo !== 'OUTRO').map((p) => p.id)
    const k = repo.criarCalibracao(
      {
        ...base,
        ...(ultima ? { ...semLeituras(ultima), opcoes: ultima.opcoes, conformidade: ultima.conformidade } : {}),
        ...c,
        clienteId,
        balancaId,
        dataCalibracao: typeof c.dataCalibracao === 'string' && c.dataCalibracao ? c.dataCalibracao : hoje,
        localEndereco:
          typeof c.localEndereco === 'string' && c.localEndereco ? c.localEndereco : cliente ? enderecoCliente(cliente) : '',
        tecnicoId: u.id,
        padroesIds,
        proximaCalibracao: config.mesesProximaPadrao ? somarMeses(hoje, config.mesesProximaPadrao) : '',
        proximaNoCertificado: ultima?.proximaNoCertificado ?? false,
        substituiId: '',
      },
      u,
    )
    return reply.code(201).send({ calibracao: k })
  })

  app.put('/api/calibracoes/:id', async (req: ComId) => {
    const k = repo.atualizarCalibracao(req.params.id, req.body)
    return { calibracao: k, pendencias: pendenciasDa(ctx, k) }
  })

  app.delete('/api/calibracoes/:id', async (req: ComId, reply) => {
    repo.excluirRascunho(req.params.id)
    return reply.code(204).send()
  })

  // Rascunho ↔ aguardando revisão
  app.post('/api/calibracoes/:id/situacao', async (req: ComId) => {
    const c = corpo(req)
    const status = c.status === 'REVISAO' ? 'REVISAO' : 'RASCUNHO'
    if (status === 'REVISAO') {
      const pendencias = pendenciasDa(ctx, obter(req.params.id))
      if (pendencias.length) throw new ErroApi(409, `Antes de enviar para revisão: ${pendencias[0]}`, { pendencias })
    }
    return { calibracao: repo.mudarSituacao(req.params.id, status, versaoDe(c)) }
  })

  app.post('/api/calibracoes/:id/emitir', async (req: ComId) => {
    const u = autor(req)
    const c = corpo(req)
    const k = await emitirCertificado(ctx, req.params.id, u, { versao: versaoDe(c) })
    return { calibracao: k }
  })

  app.post('/api/calibracoes/:id/cancelar', async (req: ComId) => {
    const c = corpo(req)
    return { calibracao: repo.cancelar(req.params.id, String(c.motivo ?? ''), autor(req), versaoDe(c)) }
  })

  /** Revisão de um certificado emitido: rascunho com os mesmos dados, que ao ser emitido substitui o original. */
  app.post('/api/calibracoes/:id/revisar', async (req: ComId, reply) => {
    const u = autor(req)
    const original = obter(req.params.id)
    const motivo = String(corpo(req).motivo ?? '').trim()
    if (motivo.length < 5) throw new ErroApi(400, 'Explique o motivo da revisão (sai no certificado novo).')
    const k = repo.criarCalibracao({ ...entradaDe(original), substituiId: original.id, motivoRevisao: motivo }, u)
    return reply.code(201).send({ calibracao: k })
  })

  /** Calibrar de novo a mesma balança: mesmos pontos e padrões, sem as leituras. */
  app.post('/api/calibracoes/:id/recalibrar', async (req: ComId, reply) => {
    const u = autor(req)
    const anterior = obter(req.params.id)
    const config = repo.obterConfig()
    const hoje = hojeLocalIso()
    const cliente = repo.obterCliente(anterior.clienteId)
    const ativos = new Set(repo.listarPadroes().map((p) => p.id))
    const entrada = entradaDe(anterior)
    const k = repo.criarCalibracao(
      {
        ...calibracaoVazia(anterior.opcoes),
        ...semLeituras(entrada),
        clienteId: anterior.clienteId,
        balancaId: anterior.balancaId,
        local: anterior.local,
        localEndereco: cliente ? enderecoCliente(cliente) : anterior.localEndereco,
        padroesIds: anterior.padroesIds.filter((id) => ativos.has(id)),
        opcoes: anterior.opcoes,
        conformidade: anterior.conformidade,
        dataCalibracao: hoje,
        proximaCalibracao: config.mesesProximaPadrao ? somarMeses(hoje, config.mesesProximaPadrao) : '',
        proximaNoCertificado: anterior.proximaNoCertificado,
        tecnicoId: u.id,
      },
      u,
    )
    return reply.code(201).send({ calibracao: k })
  })

  app.get('/api/calibracoes/:id/pdf', async (req: ComId, reply) => {
    const k = obter(req.params.id)
    const pdf = await pdfDaCalibracao(ctx, k)
    const nome = k.numero ? nomeArquivoCertificado(k.numero) : 'Previa-certificado.pdf'
    const baixar = (req.query as { baixar?: string }).baixar === '1'
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `${baixar ? 'attachment' : 'inline'}; filename="${nome}"`)
      .header('Cache-Control', 'no-store')
      .send(pdf)
  })

  // Prévia com os dados da tela (sem gravar)
  app.post('/api/calibracoes/:id/previa', async (req: ComId, reply) => {
    const atual = obter(req.params.id)
    const { valor, erros } = normalizarCalibracao(req.body)
    if (erros.length) throw new ErroApi(400, erros[0], { erros })
    const k: Calibracao = { ...atual, ...valor, substituiId: atual.substituiId }
    const pdf = await previa(ctx, k)
    return reply.header('Content-Type', 'application/pdf').header('Cache-Control', 'no-store').send(pdf)
  })

  app.post('/api/calibracoes/:id/email', async (req: ComId) => {
    const u = autor(req)
    const k = obter(req.params.id)
    if (k.status !== 'EMITIDO') throw new ErroApi(409, 'Só é possível enviar um certificado emitido e válido.')
    const c = corpo(req)
    const para = destinatarios(c.para)
    const assunto =
      String(c.assunto ?? '')
        .trim()
        .slice(0, 200) || `Certificado de calibração ${k.numero}`
    const texto = String(c.texto ?? '').slice(0, 20_000)
    const pdf = await pdfDaCalibracao(ctx, k)
    const r = await email.enviar({
      para,
      assunto,
      texto,
      anexos: [{ nome: nomeArquivoCertificado(k.numero), tipo: 'application/pdf', conteudo: pdf.toString('base64') }],
    })
    repo.registrarEnvio({
      calibracaoId: k.id,
      clienteId: k.clienteId,
      tipo: 'CERTIFICADO',
      para: para.join(', '),
      assunto,
      usuarioId: u.id,
      usuarioNome: u.nome,
    })
    return r
  })

  /** Lembrete de calibração para o cliente (uma mensagem com as balanças que vencem). */
  app.post('/api/lembretes', async (req) => {
    const u = autor(req)
    const c = corpo(req)
    const clienteId = String(c.clienteId ?? '')
    const cliente = repo.obterCliente(clienteId)
    if (!cliente) throw new ErroApi(404, 'Cliente não encontrado.')
    const para = destinatarios(c.para ?? listaEmails(cliente.emailCertificados || cliente.email))
    const assunto = String(c.assunto ?? '')
      .trim()
      .slice(0, 200)
    const texto = String(c.texto ?? '').slice(0, 20_000)
    if (!assunto || !texto) throw new ErroApi(400, 'Informe o assunto e a mensagem do lembrete.')
    const r = await email.enviar({ para, assunto, texto, anexos: [] })
    repo.registrarEnvio({
      calibracaoId: '',
      clienteId,
      tipo: 'LEMBRETE',
      para: para.join(', '),
      assunto,
      usuarioId: u.id,
      usuarioNome: u.nome,
    })
    return r
  })

  /**
   * Conferência de autenticidade pelo código do QR code (sem entrar no sistema). Só o essencial:
   * número, situação, datas, cliente, instrumento e o hash do PDF.
   */
  app.get('/api/verificar/:codigo', async (req) => {
    const codigo = String((req.params as { codigo: string }).codigo ?? '')
      .toUpperCase()
      .slice(0, 20)
    const k = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo) ? repo.calibracaoPorCodigo(codigo) : undefined
    if (!k?.emissao)
      throw new ErroApi(404, 'Nenhum certificado encontrado com este código. Confira o código impresso no certificado.')
    return {
      numero: k.numero,
      status: k.status,
      dataCalibracao: formatarDataBr(k.dataCalibracao),
      dataEmissao: formatarDataBr(k.dataEmissao),
      cliente: k.emissao.cliente.razaoSocial || k.emissao.cliente.nome,
      balanca: descricaoBalanca(k.emissao.balanca),
      numeroSerie: k.emissao.balanca.numeroSerie,
      hashPdf: k.emissao.hashPdf,
    }
  })
}

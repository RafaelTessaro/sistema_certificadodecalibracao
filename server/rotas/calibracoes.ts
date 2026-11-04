// Calibrações (rascunho → revisão → emitido), PDF do certificado, envio por e-mail, lembretes de
// vencimento e a conferência pública de autenticidade (QR code).

import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  calibracaoVazia,
  descricaoBalanca,
  enderecoCliente,
  formatarDataBr,
  hojeLocalIso,
  LIMITES,
  listaEmails,
  nomeArquivoCertificado,
  normalizarCalibracao,
  opcoesDaClasse,
  somarMeses,
} from '#shared/dominio.ts'
import type { Calibracao, Cliente, StatusCalibracao } from '#shared/tipos.ts'
import {
  anexosDoCertificado,
  avisosDa,
  certificadosDosPadroes,
  emitirCertificado,
  padroesDa,
  pdfDaCalibracao,
  pendenciasDa,
  popDaCalibracao,
  previa,
} from '../certificados.ts'
import type { Contexto } from '../contexto.ts'
import type { criarModuloEmail } from '../email.ts'
import { conferirAnexos, destinatarios, LIMITES_EMAIL } from '../email.ts'
import { ErroApi } from '../erros.ts'
import {
  comPecasDosPadroes,
  naUnidadeAtual as naUnidadeAtualDe,
  planoConformeAoPop,
  rascunhoInicial,
  semLeituras,
} from '../rascunhos.ts'
import { registrarNumeros } from './numeros.ts'

type ComId = FastifyRequest<{ Params: { id: string } }>
/** Balanças guardadas com um lembrete (as do pedido além disso ficam de fora do registro). */
const LIMITE_BALANCAS_LEMBRETE = 500
type Corpo = Record<string, unknown>
const corpo = (req: FastifyRequest): Corpo => (req.body && typeof req.body === 'object' ? (req.body as Corpo) : {})
const versaoDe = (c: Corpo) => (typeof c.versao === 'number' ? c.versao : undefined)
/** Só os e-mails do cliente (o "Para" sugerido no envio do certificado); null sem cliente. */
const emailsDoCliente = (c: Cliente | undefined) =>
  c ? { email: c.email ?? '', emailCertificados: c.emailCertificados ?? '' } : null

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
  const naUnidadeAtual = (k: Calibracao) => naUnidadeAtualDe(ctx, k)

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
      // Os e-mails do cadastro atual do cliente (o "Para" do envio do certificado): o cliente pode ter trocado o
      // e-mail de recebimento depois da emissão (o resto do certificado continua com a cópia congelada)
      emailsCliente: emailsDoCliente(repo.obterCliente(k.clienteId) ?? k.emissao?.cliente),
      balanca: k.emissao?.balanca ?? repo.obterBalanca(k.balancaId),
      padroes: k.emissao?.padroes ?? padroesDa(ctx, k),
      envios: repo.listarEnvios({ calibracaoId: k.id }),
      pendencias: aberta ? pendenciasDa(ctx, k) : [],
      // Para conferir, sem impedir a emissão (ex.: a folha de campo saiu com outra revisão do POP que a da data)
      avisos: aberta ? avisosDa(ctx, k) : [],
      revisoes: repo.revisoesDe(k.id),
      folhaCampo: repo.folhaCampoDaCalibracao(k.id),
      // Em andamento: o nº de certificado já reservado (impresso na folha de campo), com que ela vai ser emitida
      numeroReservado: aberta ? repo.numeroReservadoDa(k.id) : null,
      // Revisão em andamento: o nº com que ela sai (o do certificado revisado, com o -R dela)
      numeroRevisao: aberta ? repo.numeroPrevistoDaRevisao(k) : null,
      certificadosPadroes: certificadosDosPadroes(ctx, k),
      // Emitido: a revisão do POP da emissão (com o arquivo, mesmo se anexado depois); em andamento: a que o
      // certificado vai citar, a usada na calibração (`popDaCalibracao`)
      pop: k.emissao
        ? k.emissao.pop
          ? (repo.versoesPop().find((v) => v.id === k.emissao!.pop!.id) ?? null)
          : null
        : (popDaCalibracao(ctx, k)?.versao ?? null),
    }
  })

  /** Anexos do e-mail do certificado: o PDF (sempre) e os certificados dos padrões usados; e os padrões sem arquivo. */
  app.get('/api/calibracoes/:id/anexos', async (req: ComId) => {
    const k = obter(req.params.id)
    if (k.status !== 'EMITIDO') throw new ErroApi(409, 'Só é possível enviar um certificado emitido e válido.')
    const { anexos, semArquivo } = await anexosDoCertificado(ctx, k)
    return {
      anexos: anexos.map(({ ler: _ler, ...a }) => a),
      semArquivo,
      limites: { anexos: LIMITES_EMAIL.anexos, bytes: LIMITES_EMAIL.bytesAnexos },
    }
  })

  /**
   * Nova calibração (rascunho). Com a balança escolhida, aproveita da última calibração dela os
   * padrões, os pontos e as cargas (sem as leituras); sem histórico, a tela sugere os pontos.
   */
  app.post('/api/calibracoes', async (req, reply) => {
    const u = autor(req)
    const k = repo.criarCalibracao(rascunhoInicial(ctx, corpo(req), u.id), u)
    return reply.code(201).send({ calibracao: k })
  })

  app.put('/api/calibracoes/:id', async (req: ComId) => {
    const k = repo.atualizarCalibracao(req.params.id, req.body)
    return { calibracao: k, pendencias: pendenciasDa(ctx, k), avisos: avisosDa(ctx, k) }
  })

  // O nº de certificado reservado para ela volta para a folha de campo em que foi impresso (para a refeita)
  app.delete('/api/calibracoes/:id', async (req: ComId, reply) => {
    const { eventos } = repo.excluirRascunho(req.params.id)
    registrarNumeros(ctx, req, eventos)
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
    const reservado = repo.numeroReservadoDa(req.params.id)
    const { calibracao: k, aviso } = await emitirCertificado(ctx, req.params.id, u, { versao: versaoDe(c) })
    // Com o nº reservado na impressão da folha de campo, o registro diz de qual folha; e se o PDF ficou para depois
    req.detalheAuditoria = [
      reservado && k.numero === reservado.numero ? `${k.numero}, reservado na folha de campo ${reservado.folha}` : '',
      aviso ? 'o PDF não foi gravado na emissão (é gerado ao abrir)' : '',
    ]
      .filter(Boolean)
      .join('; ')
    return aviso ? { calibracao: k, aviso } : { calibracao: k }
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
    // Inteiro no certificado: o que passa do limite é recusado, nunca cortado no meio da palavra
    if (motivo.length > LIMITES.motivo) throw new ErroApi(400, `O motivo da revisão pode ter até ${LIMITES.motivo} caracteres.`)
    const k = repo.criarCalibracao({ ...naUnidadeAtual(original), substituiId: original.id, motivoRevisao: motivo }, u)
    return reply.code(201).send({ calibracao: k })
  })

  /**
   * Calibrar de novo a mesma balança: mesmos pontos e padrões, sem as leituras, com o método da excentricidade da
   * classe e sem o modo de serviço (`planoConformeAoPop`); sem ajuste, reparo nem "como encontrado".
   */
  app.post('/api/calibracoes/:id/recalibrar', async (req: ComId, reply) => {
    const u = autor(req)
    const anterior = obter(req.params.id)
    const config = repo.obterConfig()
    const hoje = hojeLocalIso()
    // O dono de hoje da balança (o cadastro pode ter passado para outro cliente depois do certificado)
    const balanca = repo.obterBalanca(anterior.balancaId)
    const clienteId = balanca?.clienteId || anterior.clienteId
    const cliente = repo.obterCliente(clienteId)
    const ativos = repo.listarPadroes()
    const padroesIds = anterior.padroesIds.filter((id) => ativos.some((p) => p.id === id))
    const entrada = naUnidadeAtual(anterior)
    // Só com as peças dos padrões que continuam (o jogo desativado depois do certificado sai dos pontos)
    const plano = comPecasDosPadroes(
      planoConformeAoPop({ ...semLeituras(entrada), opcoes: entrada.opcoes }, balanca?.classe),
      ativos.filter((p) => padroesIds.includes(p.id)),
    )
    const k = repo.criarCalibracao(
      {
        ...calibracaoVazia(entrada.opcoes),
        ...plano,
        clienteId,
        balancaId: anterior.balancaId,
        local: anterior.local,
        localEndereco: cliente ? enderecoCliente(cliente) : anterior.localEndereco,
        padroesIds,
        // Na classe I, com as opções da classe (a balança pode ter mudado de classe depois do certificado)
        opcoes: opcoesDaClasse(plano.opcoes, balanca?.classe),
        conformidade: entrada.conformidade,
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
    // `anexos`: os ids marcados na tela (sem a lista, vão todos). O PDF do certificado vai sempre.
    const { anexos } = await anexosDoCertificado(ctx, k)
    const marcados = Array.isArray(c.anexos) ? new Set(c.anexos.filter((x): x is string => typeof x === 'string')) : null
    const escolhidos = anexos.filter((a) => a.obrigatorio || !marcados || marcados.has(a.id))
    conferirAnexos(escolhidos)
    const r = await email.enviar({
      para,
      assunto,
      texto,
      anexos: escolhidos.map((a) => ({ nome: a.nome, tipo: a.tipo, conteudo: a.ler() })),
    })
    // Só quem recebeu; os que o servidor de e-mail recusou ficam à parte (a tela avisa)
    const recusados = r.recusados.map((x) => x.endereco)
    repo.registrarEnvio({
      calibracaoId: k.id,
      clienteId: k.clienteId,
      tipo: 'CERTIFICADO',
      para: r.para.join(', '),
      assunto,
      usuarioId: u.id,
      usuarioNome: u.nome,
      anexos: escolhidos.map((a) => a.nome),
      recusados,
    })
    req.detalheAuditoria = [
      `${escolhidos.length} ${escolhidos.length === 1 ? 'anexo' : 'anexos'}`,
      ...(recusados.length ? [`recusados pelo servidor de e-mail: ${recusados.join(', ')}`] : []),
    ].join('; ')
    return { ...r, anexos: escolhidos.map((a) => a.nome) }
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
    // As balanças que vão no e-mail (as escolhidas na tela): só as deste cliente, sem repetir. Em Vencimentos, cada
    // balança aparece avisada só pelo lembrete que a incluiu (`Repositorio.vencimentos`)
    const balancas = [
      ...new Set((Array.isArray(c.balancas) ? c.balancas : []).filter((id): id is string => typeof id === 'string')),
    ]
      .slice(0, LIMITE_BALANCAS_LEMBRETE)
      .filter((id) => repo.obterBalanca(id)?.clienteId === clienteId)
    const r = await email.enviar({ para, assunto, texto, anexos: [] })
    const recusados = r.recusados.map((x) => x.endereco)
    repo.registrarEnvio({
      calibracaoId: '',
      clienteId,
      tipo: 'LEMBRETE',
      para: r.para.join(', '),
      assunto,
      usuarioId: u.id,
      usuarioNome: u.nome,
      balancas,
      recusados,
    })
    if (recusados.length) req.detalheAuditoria = `recusados pelo servidor de e-mail: ${recusados.join(', ')}`
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

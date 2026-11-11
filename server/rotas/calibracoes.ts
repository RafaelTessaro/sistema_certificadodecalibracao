// Calibrações (rascunho → [aguardando autorização] → emitido), PDF do certificado, envio por e-mail, lembretes de
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
  texto,
} from '#shared/dominio.ts'
import { impedimentoDoSignatario, impedimentoDoTecnico, impedimentoParaEmitir, podeDevolver } from '#shared/permissoes.ts'
import type { Calibracao, Cliente, StatusCalibracao } from '#shared/tipos.ts'
import {
  anexosDoCertificado,
  assinaturaParaVerificacao,
  avisosDa,
  certificadosDosPadroes,
  emitirCertificado,
  padroesDa,
  pdfDaCalibracao,
  pendenciasDa,
  popDaCalibracao,
  previa,
  serieDaAssinatura,
  versaoDoPopEmitido,
} from '../certificados.ts'
import type { Contexto } from '../contexto.ts'
import type { criarModuloEmail } from '../email.ts'
import { conferirAnexos, destinatarios, LIMITES_EMAIL } from '../email.ts'
import { ErroApi } from '../erros.ts'
import { naUnidadeAtual as naUnidadeAtualDe, padroesDoHistorico, planoDoHistorico, rascunhoInicial } from '../rascunhos.ts'
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
  const nomeDe = (id: string) => ctx.usuarios.obter(id)?.nome ?? 'usuário excluído'
  /**
   * O técnico indicado agora (na criação ou na troca): só quem tem a marca de técnico e está ativo. O que a calibração já
   * tem continua valendo, mesmo sem a marca hoje (não é conferido de novo).
   */
  const conferirTecnico = (tecnicoId: string, atual = '') => {
    if (!tecnicoId || tecnicoId === atual) return
    const erro = impedimentoDoTecnico(ctx.usuarios.obter(tecnicoId))
    if (erro) throw new ErroApi(400, erro)
  }

  app.get('/api/calibracoes', async (req) => {
    const q = req.query as Record<string, string | undefined>
    return repo.listarCalibracoes({
      status: (q.status ?? '') as StatusCalibracao | 'ABERTAS' | 'AUTORIZAR' | 'ASSINATURA_PENDENTE' | '',
      // "Para você autorizar": as enviadas para quem está vendo
      usuario: req.usuario,
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
      // Em andamento: as folhas impressas para o cliente e ainda não ligadas (a tela avisa e oferece ligar)
      folhasNaoLigadas: aberta ? repo.folhasNaoLigadasDoCliente(k) : [],
      revisoes: repo.revisoesDe(k.id),
      // Corrigido com o mesmo nº: as versões, da primeira à atual (o histórico interno; [] = nunca corrigido assim)
      versoes: k.emissao ? repo.versoesDoCertificado(k.id) : [],
      folhaCampo: repo.folhaCampoDaCalibracao(k.id),
      // Em andamento: o nº de certificado já reservado (impresso na folha de campo), com que ela vai ser emitida
      numeroReservado: aberta ? repo.numeroReservadoDa(k.id) : null,
      // Correção em andamento: o nº com que ela sai (o mesmo do certificado corrigido)
      numeroRevisao: aberta ? repo.numeroPrevistoDaRevisao(k) : null,
      certificadosPadroes: certificadosDosPadroes(ctx, k),
      // Emitido: a revisão do POP da emissão (com o arquivo, mesmo se anexado depois); em andamento: a que o
      // certificado vai citar, a usada na calibração (`popDaCalibracao`)
      pop: k.emissao
        ? k.emissao.pop
          ? versaoDoPopEmitido(repo.versoesPop(), k.emissao.pop)
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
    // O técnico é quem cria, se tiver a marca de técnico; senão, fica para escolher
    const k = repo.criarCalibracao(rascunhoInicial(ctx, corpo(req), u.tecnico ? u.id : ''), u)
    return reply.code(201).send({ calibracao: k })
  })

  app.put('/api/calibracoes/:id', async (req: ComId) => {
    const u = autor(req)
    const antes = repo.obterCalibracao(req.params.id)?.tecnicoId
    if (antes !== undefined) conferirTecnico(texto(corpo(req).tecnicoId, 100), antes)
    const k = repo.atualizarCalibracao(req.params.id, req.body, u)
    // A troca do técnico fica no registro de atividades
    if (antes !== undefined && antes !== k.tecnicoId)
      req.detalheAuditoria = `técnico: ${antes ? nomeDe(antes) : 'nenhum'} → ${nomeDe(k.tecnicoId)}`
    return {
      calibracao: k,
      pendencias: pendenciasDa(ctx, k),
      avisos: avisosDa(ctx, k),
      folhasNaoLigadas: repo.folhasNaoLigadasDoCliente(k),
    }
  })

  // O nº de certificado reservado para ela volta para a folha de campo em que foi impresso (para a refeita)
  app.delete('/api/calibracoes/:id', async (req: ComId, reply) => {
    const { eventos } = repo.excluirRascunho(req.params.id)
    registrarNumeros(ctx, req, eventos)
    return reply.code(204).send()
  })

  // Volta para rascunho: retira o pedido de autorização (para corrigir ou escolher outro signatário). O envio para
  // autorização é `POST /autorizacao` (com o signatário escolhido)
  app.post('/api/calibracoes/:id/situacao', async (req: ComId) => {
    const c = corpo(req)
    if (c.status === 'REVISAO') throw new ErroApi(409, 'Escolha o signatário que vai autorizar e use "Enviar para autorização".')
    const antes = obter(req.params.id)
    const k = repo.mudarSituacao(req.params.id, 'RASCUNHO', versaoDe(c))
    if (antes.status === 'REVISAO')
      req.detalheAuditoria = antes.autorizacao
        ? `pedido de autorização retirado (era para ${antes.autorizacao.signatarioNome})`
        : 'voltou para rascunho'
    return { calibracao: k }
  })

  /**
   * Envia para a autorização de um signatário (com a revisão por outra pessoa ligada): a calibração fica aguardando ele
   * (só ele autoriza ou devolve; ver `impedimentoParaEmitir`). Nunca o técnico que executou nem quem escolheu o técnico.
   * Já enviada, vai para outro.
   */
  app.post('/api/calibracoes/:id/autorizacao', async (req: ComId) => {
    const u = autor(req)
    const c = corpo(req)
    if (!repo.obterConfig().exigirRevisor)
      throw new ErroApi(409, 'A revisão por outra pessoa está desligada (Configurações): emita o certificado direto.')
    const k = obter(req.params.id)
    const pendencias = pendenciasDa(ctx, k)
    if (pendencias.length) throw new ErroApi(409, `Antes de enviar para autorização: ${pendencias[0]}`, { pendencias })
    const signatarioId = texto(c.signatarioId, 100)
    if (!signatarioId) throw new ErroApi(400, 'Escolha o signatário que vai autorizar.')
    const signatario = ctx.usuarios.obter(signatarioId)
    const conferir = (atual: Calibracao) => {
      const erro = impedimentoDoSignatario(signatario, atual.tecnicoId, atual.tecnicoDefinidoPorId)
      if (erro) throw new ErroApi(409, erro)
    }
    const enviada = repo.mudarSituacao(
      k.id,
      'REVISAO',
      versaoDe(c),
      {
        autorizacao: {
          signatarioId,
          signatarioNome: signatario?.nome ?? '',
          porId: u.id,
          por: u.nome,
          em: repo.agora().toISOString(),
        },
        // O técnico que envia a calibração dele confirma que a executou (como ao gravá-la; `quemDefineOTecnico`)
        autorId: u.id,
      },
      conferir,
    )
    req.detalheAuditoria = `para ${signatario?.nome ?? ''}`
    return { calibracao: enviada }
  })

  /** O signatário devolve sem autorizar, com a nota do que precisa ser visto: volta para rascunho. */
  app.post('/api/calibracoes/:id/devolver', async (req: ComId) => {
    const u = autor(req)
    const c = corpo(req)
    const nota = String(c.nota ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (nota.length < 3) throw new ErroApi(400, 'Escreva o que precisa ser visto (vai para quem enviou).')
    if (nota.length > LIMITES.motivo) throw new ErroApi(400, `A nota pode ter até ${LIMITES.motivo} caracteres.`)
    const k = obter(req.params.id)
    const devolvida = repo.mudarSituacao(
      k.id,
      'RASCUNHO',
      versaoDe(c),
      { devolucao: { nota, porId: u.id, por: u.nome, em: repo.agora().toISOString() } },
      (atual) => {
        if (atual.status !== 'REVISAO') throw new ErroApi(409, 'Esta calibração não está aguardando autorização.')
        if (podeDevolver(atual, u)) return
        const pedido = atual.autorizacao
        throw new ErroApi(
          403,
          pedido?.signatarioId === u.id
            ? (impedimentoParaEmitir(true, atual, u) ?? '')
            : pedido
              ? `Só ${pedido.signatarioNome}, que recebeu o pedido, pode devolver esta calibração.`
              : 'Só um signatário que não seja o técnico desta calibração nem quem o escolheu pode devolvê-la.',
          { codigo: 'SEM_PERMISSAO' },
        )
      },
    )
    req.detalheAuditoria = `${k.autorizacao ? `pedido de ${k.autorizacao.por}` : 'enviada para revisão'}: ${nota}`
    return { calibracao: devolvida }
  })

  app.post('/api/calibracoes/:id/emitir', async (req: ComId) => {
    const serie = (k: Calibracao) => serieDaAssinatura(ctx, k.emissao)
    const u = autor(req)
    const c = corpo(req)
    const reservado = repo.numeroReservadoDa(req.params.id)
    const antes = repo.obterCalibracao(req.params.id)
    const { calibracao: k, aviso } = await emitirCertificado(ctx, req.params.id, u, { versao: versaoDe(c) })
    // Com o nº reservado na impressão da folha de campo, o registro diz de qual folha; e se o PDF ficou para depois
    req.detalheAuditoria = [
      // Com a revisão por outra pessoa: quem autorizou (quem emitiu) e quem pediu
      k.emissao?.assinaturas === 'TECNICO_E_SIGNATARIO'
        ? `autorizado por ${u.nome}${antes?.status === 'REVISAO' && antes.autorizacao ? ` (pedido de ${antes.autorizacao.por})` : ''}`
        : '',
      reservado && k.numero === reservado.numero ? `${k.numero}, reservado na folha de campo ${reservado.folha}` : '',
      // A correção com o mesmo nº: a anotação interna (o motivo não sai no certificado)
      k.emissao?.mesmoNumero
        ? `${k.numero} corrigido (a versão anterior fica guardada como substituída): ${k.motivoRevisao}`
        : '',
      // Com o certificado digital da empresa (1.0.7): assinado, com a série do certificado, ou aguardando a assinatura
      k.emissao?.assinatura
        ? `assinado digitalmente${serie(k) ? ` (série ${serie(k)})` : ''}`
        : k.emissao?.assinaturaDigital
          ? 'ainda não assinado digitalmente (é assinado ao abrir ou na próxima tentativa automática)'
          : '',
      aviso && !(k.emissao?.assinaturaDigital && !k.emissao.assinatura)
        ? 'o PDF não foi gravado na emissão (é gerado ao abrir)'
        : '',
    ]
      .filter(Boolean)
      .join('; ')
    return aviso ? { calibracao: k, aviso } : { calibracao: k }
  })

  app.post('/api/calibracoes/:id/cancelar', async (req: ComId) => {
    const c = corpo(req)
    return { calibracao: repo.cancelar(req.params.id, String(c.motivo ?? ''), autor(req), versaoDe(c)) }
  })

  /**
   * Correção de um certificado emitido: rascunho com os mesmos dados, que ao ser emitido sai com o mesmo nº e
   * substitui o corrigido (que fica guardado como versão anterior). O motivo fica só no sistema.
   */
  app.post('/api/calibracoes/:id/revisar', async (req: ComId, reply) => {
    const u = autor(req)
    const original = obter(req.params.id)
    const motivo = String(corpo(req).motivo ?? '').trim()
    if (motivo.length < 5) throw new ErroApi(400, 'Explique o que vai ser corrigido (fica registrado no sistema).')
    // Inteiro no registro: o que passa do limite é recusado, nunca cortado no meio da palavra
    if (motivo.length > LIMITES.motivo) throw new ErroApi(400, `O motivo da correção pode ter até ${LIMITES.motivo} caracteres.`)
    const k = repo.criarCalibracao({ ...naUnidadeAtual(original), substituiId: original.id, motivoRevisao: motivo }, u)
    req.detalheAuditoria = `${original.numero}: ${motivo}`
    return reply.code(201).send({ calibracao: k })
  })

  /**
   * Calibrar de novo a mesma balança: mesmos pontos e padrões, sem as leituras, com o método da excentricidade da
   * classe e sem o modo de serviço (`planoDoHistorico`: sem a declaração de conformidade, sem as cargas em que o EMA
   * muda); sem ajuste, reparo nem "como encontrado".
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
    // Os que continuam ativos, com o barômetro (a pressão é obrigatória em toda calibração, POP 7.5)
    const padroesIds = padroesDoHistorico(anterior.padroesIds, ativos)
    const entrada = naUnidadeAtual(anterior)
    // Só com as peças dos padrões que continuam (o jogo desativado depois do certificado sai dos pontos) e, sem a
    // declaração de conformidade, sem as cargas em que o EMA muda que as sugestões até a 1.0.4 traziam (POP 7.7)
    const plano = planoDoHistorico(
      entrada,
      balanca,
      ativos.filter((p) => padroesIds.includes(p.id)),
      anterior.emissao,
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
        // Quem pediu, se tiver a marca de técnico; senão, fica para escolher
        tecnicoId: u.tecnico ? u.id : '',
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
   * número, situação, datas, cliente, instrumento e o hash do PDF; no assinado digitalmente (1.0.7), o titular e o
   * CNPJ do certificado ICP-Brasil da empresa (públicos: saem no próprio PDF).
   */
  app.get('/api/verificar/:codigo', async (req) => {
    const codigo = String((req.params as { codigo: string }).codigo ?? '')
      .toUpperCase()
      .slice(0, 20)
    const k = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo) ? repo.calibracaoPorCodigo(codigo) : undefined
    if (!k?.emissao)
      throw new ErroApi(404, 'Nenhum certificado encontrado com este código. Confira o código impresso no certificado.')
    // Substituído: o que está no lugar dele hoje, seguindo as correções emitidas até a última
    let atual: Calibracao | undefined
    for (let v: Calibracao | undefined = k, n = 0; v?.status === 'SUBSTITUIDO' && n < 1000; n++) {
      const seguinte: { id: string } | undefined = repo
        .revisoesDe(v.id)
        .find((r) => ['EMITIDO', 'SUBSTITUIDO', 'CANCELADO'].includes(r.status))
      v = seguinte && repo.obterCalibracao(seguinte.id)
      if (v?.emissao) atual = v
    }
    const assinaturaDigital = assinaturaParaVerificacao(ctx, k.emissao)
    return {
      numero: k.numero,
      status: k.status,
      // Versão anterior de um certificado corrigido com o mesmo nº: a data da versão que vale (o nº continua o mesmo)
      ...(atual?.status === 'EMITIDO' && atual.numero === k.numero
        ? { versaoAtualEmitidaEm: formatarDataBr(atual.dataEmissao) }
        : {}),
      // A versão corrigida (ou a revisão) que ficou no lugar dele foi cancelada depois: nenhuma versão vale
      ...(atual?.status === 'CANCELADO' ? { substitutoCancelado: true } : {}),
      dataCalibracao: formatarDataBr(k.dataCalibracao),
      dataEmissao: formatarDataBr(k.dataEmissao),
      cliente: k.emissao.cliente.razaoSocial || k.emissao.cliente.nome,
      balanca: descricaoBalanca(k.emissao.balanca),
      numeroSerie: k.emissao.balanca.numeroSerie,
      hashPdf: k.emissao.hashPdf,
      // Só o PDF já assinado (o que aguarda a assinatura, ou foi cancelado antes dela, não tem assinatura)
      ...(assinaturaDigital ? { assinaturaDigital } : {}),
    }
  })
}

// As rotas do escritório para o app do celular do técnico (cookie da sessão, como as outras telas):
// - Usuários → Celulares dos técnicos (só o administrador): a lista, "Cadastrar celular" (o código de 6 dígitos e o QR,
//   acompanhados pela tela até o celular parear), renomear, revogar (com o motivo) e "Parear de novo";
// - "Enviar para o técnico" (quem imprime a folha): a folha de uma calibração, a avulsa (da balança, só do cliente ou em
//   branco) e uma folha já impressa, pelo nº. A mesma reserva da impressão, sem contar impressão; o PDF é gerado e
//   guardado na primeira vez e os dados impressos ficam congelados; o pacote é montado com eles;
// - recolher (na hora, pedido ou, o administrador, à força), os envios e os registros de uma folha, os registros que
//   voltaram (ver, descartar, ligar um órfão a uma folha), a folha impressa assinada (PDF gerado na hora) e a
//   configuração do app do celular (o registro original: só o administrador muda).

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { readFileSync } from 'node:fs'
import { montarPacote } from '#shared/campo/pacote.ts'
import { formatarQrPareamento, textoDeUmaLinha } from '#shared/campo/protocolo.ts'
import { numeroDaFolha } from '#shared/folhaCampo.ts'
import type { Calibracao, MotivoRevogacao, ResultadoEnvioCampo, SituacaoPareamento, UsuarioSessao } from '#shared/tipos.ts'
import { ROTULO_MOTIVO_REVOGACAO } from '#shared/tipos.ts'
import type { Contexto, ServicosCampo } from '../contexto.ts'
import { ErroApi } from '../erros.ts'
import { gerarPdfRegistroCampo, nomeArquivoRegistroCampo } from '../pdf/registroCampo.ts'
import { type DadosImpressos, entradaFolhaAvulsa, entradaFolhaDaCalibracao, gerarFolha } from './folhaCampo.ts'

/** Versão do sistema (a do package.json, como `VERSAO_APP` em server/app.ts): vai no pacote. */
const VERSAO_SISTEMA: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version

type ComId = FastifyRequest<{ Params: { id: string } }>
type ComNumero = FastifyRequest<{ Params: { numero: string } }>

const corpoDe = (req: FastifyRequest): Record<string, unknown> =>
  req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}

/** O pedido de "Enviar para o técnico": o técnico, a data prevista (AAAA-MM-DD ou '') e o recado. */
export function lerPedidoEnvio(corpo: Record<string, unknown>): { tecnicoId: string; dataPrevista: string; recado: string } {
  const tecnicoId = typeof corpo.tecnicoId === 'string' ? corpo.tecnicoId.trim() : ''
  if (!tecnicoId) throw new ErroApi(400, 'Escolha o técnico que vai receber a folha no celular.')
  const dataPrevista = typeof corpo.dataPrevista === 'string' ? corpo.dataPrevista.trim() : ''
  if (dataPrevista) {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(dataPrevista) ? new Date(`${dataPrevista}T12:00:00Z`) : null
    if (!dia || Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== dataPrevista)
      throw new ErroApi(400, 'Data prevista inválida.')
  }
  const recado = (typeof corpo.recado === 'string' ? corpo.recado : '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? '\n' : ' '))
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, 500)
  return { tecnicoId, dataPrevista, recado }
}

export async function rotasCelulares(app: FastifyInstance, ctx: Contexto, campo: ServicosCampo) {
  const { repo, usuarios } = ctx
  const { repo: repoCampo, pareamentos } = campo

  const quem = (req: FastifyRequest): UsuarioSessao => {
    if (!req.usuario) throw new ErroApi(401, 'Sua sessão terminou. Entre de novo para continuar.', { codigo: 'SEM_SESSAO' })
    return req.usuario
  }

  /** O técnico que recebe o celular ou a folha: existe, está ativo e tem a marca de técnico. */
  const tecnicoAtivo = (id: string) => {
    const t = usuarios.obter(id)
    if (!t) throw new ErroApi(404, 'Técnico não encontrado.')
    if (!t.ativo) throw new ErroApi(409, `${t.nome} está desativado no sistema.`, { codigo: 'TECNICO_INATIVO' })
    if (!t.tecnico)
      throw new ErroApi(409, `${t.nome} não tem a marca de técnico de calibração (Usuários).`, { codigo: 'SEM_MARCA_TECNICO' })
    return t
  }

  // ---- Celulares dos técnicos (administrador) ------------------------------------------------------------------

  app.get('/api/celulares', async () => ({ celulares: repoCampo.listarCelulares() }))

  app.post('/api/celulares/pareamento', async (req) => {
    const u = quem(req)
    const corpo = corpoDe(req)
    const tecnico = tecnicoAtivo(typeof corpo.usuarioId === 'string' ? corpo.usuarioId : '')
    const endereco = pareamentos.enderecoDoQr(corpo.endereco, req.headers.host)
    return {
      pareamento: pareamentos.iniciar({ usuarioId: tecnico.id, tecnicoNome: tecnico.nome, por: u, endereco }),
    }
  })

  app.get('/api/celulares/pareamento/:id', async (req: ComId) => {
    const s = pareamentos.situacao(req.params.id)
    if (!s) throw new ErroApi(404, 'Este código não existe mais. Peça um novo.')
    const pareamento: SituacaoPareamento = {
      id: s.id,
      situacao: s.situacao,
      expiraEm: s.expiraEm,
      ...(s.situacao === 'PAREADO' && s.aparelhoId && repoCampo.obterDispositivo(s.aparelhoId)
        ? { celular: repoCampo.celular(s.aparelhoId) }
        : {}),
    }
    return { pareamento }
  })

  app.delete('/api/celulares/pareamento/:id', async (req: ComId, reply) => {
    pareamentos.cancelar(req.params.id)
    return reply.code(204).send()
  })

  /** O QR só com o endereço do servidor (para o celular já pareado que precisa do endereço novo). */
  app.get('/api/celulares/endereco', async (req) => {
    const q = req.query as Record<string, unknown>
    const endereco = pareamentos.enderecoDoQr(q.endereco, req.headers.host)
    return {
      endereco,
      enderecos: pareamentos.enderecos(),
      qr: endereco ? formatarQrPareamento({ servidor: endereco, codigo: '' }) : '',
    }
  })

  app.put('/api/celulares/:id', async (req: ComId) => {
    const { celular, antes } = repoCampo.renomear(req.params.id, corpoDe(req).nome)
    req.detalheAuditoria = `${antes} → ${celular.nome}`.slice(0, 200)
    return { celular }
  })

  app.post('/api/celulares/:id/revogar', async (req: ComId) => {
    const u = quem(req)
    const corpo = corpoDe(req)
    const celular = repoCampo.revogar(req.params.id, corpo.motivo, corpo.texto, u.nome)
    req.detalheAuditoria = `${celular.nome} · ${celular.tecnicoNome || 'técnico excluído'} · ${
      ROTULO_MOTIVO_REVOGACAO[celular.revogadoMotivo as MotivoRevogacao] ?? ''
    }`.slice(0, 200)
    return { celular }
  })

  app.post('/api/celulares/:id/parear-de-novo', async (req: ComId) => {
    const u = quem(req)
    const d = repoCampo.obterDispositivo(req.params.id)
    if (!d) throw new ErroApi(404, 'Celular não encontrado.')
    const tecnico = tecnicoAtivo(d.usuario_id)
    const endereco = pareamentos.enderecoDoQr(corpoDe(req).endereco, req.headers.host)
    return {
      pareamento: pareamentos.iniciar({ usuarioId: tecnico.id, tecnicoNome: tecnico.nome, aparelhoId: d.id, por: u, endereco }),
    }
  })

  // ---- Configuração ------------------------------------------------------------------------------------------

  app.get('/api/campo/configuracao', async () => ({ config: repoCampo.configuracao() }))

  app.put('/api/campo/configuracao', async (req) => {
    const { config, mudou } = repoCampo.salvarConfiguracao(req.body)
    req.detalheAuditoria = `registro original: ${config.registroOriginal === 'CELULAR' ? 'o celular' : 'o papel (piloto)'}${
      mudou ? '' : ' (sem mudança)'
    }`
    return { config }
  })

  // ---- Enviar para o técnico ---------------------------------------------------------------------------------

  /** Cria o envio com os dados impressos congelados (o pacote) e responde como a tela espera. */
  function criarEnvio(
    req: FastifyRequest,
    e: {
      numero: string
      dados: DadosImpressos
      dadosSha256: string
      origem: 'calibracao' | 'balanca'
      calibracaoId: string
      pedido: ReturnType<typeof lerPedidoEnvio>
      tecnicoNome: string
      aviso?: string
    },
  ): ResultadoEnvioCampo {
    const u = quem(req)
    const piloto = repoCampo.piloto()
    const enviadaEm = repo.agora().toISOString()
    const { envio, versao } = repoCampo.criarEnvio({
      numero: e.numero,
      usuarioId: e.pedido.tecnicoId,
      calibracaoId: e.calibracaoId,
      recado: e.pedido.recado,
      por: u.nome,
      montar: (envioId) =>
        montarPacote(e.dados, {
          envioId,
          origem: e.origem,
          recado: e.pedido.recado,
          dataPrevista: e.pedido.dataPrevista,
          piloto,
          enviadaEm,
          enviadaPor: u.nome,
          versaoSistema: VERSAO_SISTEMA,
          dadosSha256: e.dadosSha256,
          ativos: repo.listarPadroes(),
        }),
    })
    req.detalheAuditoria = `${e.numero} · para ${e.tecnicoNome}${piloto ? ' (piloto)' : ''}`
    return {
      envio: repoCampo.envioParaLista(envio),
      ...(e.aviso ? { aviso: e.aviso } : {}),
      ...(versao !== undefined ? { versao } : {}),
    }
  }

  /** Antes de reservar: o técnico pode receber (ativo, técnico, com um celular que vale). */
  const conferirDestino = (tecnicoId: string) => {
    const t = tecnicoAtivo(tecnicoId)
    if (!repoCampo.temCelular(t.id))
      throw new ErroApi(409, `${t.nome} não tem celular cadastrado. Cadastre em Usuários → Celulares dos técnicos.`, {
        codigo: 'SEM_CELULAR',
      })
    return t
  }

  const origemPelaChave = (numero: string): 'calibracao' | 'balanca' =>
    repo.linhaDaFolha(numero)?.chave.startsWith('calibracao:') ? 'calibracao' : 'balanca'

  /** A folha de uma calibração em andamento (a mesma do papel, se já foi impressa). */
  app.post('/api/calibracoes/:id/enviar-tecnico', async (req: ComId) => {
    const k: Calibracao | undefined = repo.obterCalibracao(req.params.id)
    if (!k) throw new ErroApi(404, 'Calibração não encontrada.')
    if (k.status !== 'RASCUNHO' && k.status !== 'REVISAO')
      throw new ErroApi(409, 'Só a folha de uma calibração em andamento vai para o celular.')
    const corpo = corpoDe(req)
    if (typeof corpo.versao === 'number' && corpo.versao !== k.versao)
      throw new ErroApi(409, 'Esta calibração foi alterada por outra pessoa. Recarregue a página e tente de novo.', {
        codigo: 'CONFLITO',
      })
    const pedido = lerPedidoEnvio(corpo)
    const tecnico = conferirDestino(pedido.tecnicoId)
    const atual = repo.folhaCampoDaCalibracao(k.id)
    if (atual) repoCampo.conferirEnviavel(atual.numero)
    const r = await gerarFolha(ctx, req, entradaFolhaDaCalibracao(ctx, k, ''), { paraEnvio: true })
    return criarEnvio(req, {
      numero: r.numero,
      dados: r.dados!,
      dadosSha256: r.dadosSha256,
      origem: origemPelaChave(r.numero),
      calibracaoId: k.id,
      pedido,
      tecnicoNome: tecnico.nome,
      aviso: r.aviso,
    })
  })

  /**
   * A folha avulsa: da balança (`balancaId`), só do cliente (`clienteId`) ou em branco; `os`, `data` e `chave` como em
   * GET /api/folha-campo (a mesma `chave` é a mesma folha).
   */
  app.post('/api/folha-campo/enviar-tecnico', async (req) => {
    const u = quem(req)
    const corpo = corpoDe(req)
    const pedido = lerPedidoEnvio(corpo)
    const tecnico = conferirDestino(pedido.tecnicoId)
    const e = entradaFolhaAvulsa(ctx, corpo, u.id)
    const existente = repo.linhaDaFolhaPorChave(e.chave)
    if (existente) repoCampo.conferirEnviavel(existente.numero)
    const r = await gerarFolha(ctx, req, e, { paraEnvio: true })
    return criarEnvio(req, {
      numero: r.numero,
      dados: r.dados!,
      dadosSha256: r.dadosSha256,
      origem: 'balanca',
      calibracaoId: repo.linhaDaFolha(r.numero)?.calibracao_id ?? '',
      pedido,
      tecnicoNome: tecnico.nome,
      aviso: r.aviso,
    })
  })

  /** Uma folha já impressa, pelo nº (reenviar depois de recolhida, ou mandar a avulsa impressa). */
  app.post('/api/folhas-campo/:numero/enviar-tecnico', async (req: ComNumero) => {
    const u = quem(req)
    const numero = numeroDaFolha(req.params.numero)
    if (!numero) throw new ErroApi(400, 'Informe o nº da folha de campo como está no alto dela (ex.: FC-2026-00042).')
    const f = repo.linhaDaFolha(numero)
    if (!f) throw new ErroApi(404, `A folha ${numero} não existe.`)
    if (f.substituida_por)
      throw new ErroApi(409, `A folha ${numero} foi substituída pela ${f.substituida_por}: envie a folha nova.`)
    const pedido = lerPedidoEnvio(corpoDe(req))
    const tecnico = conferirDestino(pedido.tecnicoId)
    repoCampo.conferirEnviavel(numero)
    const origem = f.chave.startsWith('calibracao:') ? 'calibracao' : 'balanca'
    const congelados = repo.dadosImpressos<DadosImpressos>(numero)
    if (congelados)
      return criarEnvio(req, {
        numero,
        dados: congelados.dados,
        dadosSha256: congelados.sha256,
        origem,
        calibracaoId: f.calibracao_id,
        pedido,
        tecnicoNome: tecnico.nome,
      })
    // Impressa antes da 1.1.0: os dados de agora, pelo mesmo caminho da impressão (a tela avisa para conferir o papel)
    let entrada
    if (origem === 'calibracao') {
      const k = f.calibracao_id ? repo.obterCalibracao(f.calibracao_id) : undefined
      if (!k || repo.folhaCampoDaCalibracao(k.id)?.numero !== numero || (k.status !== 'RASCUNHO' && k.status !== 'REVISAO'))
        throw new ErroApi(409, `A folha ${numero} não é a de uma calibração em andamento. Use uma folha nova.`)
      entrada = entradaFolhaDaCalibracao(ctx, k, '')
    } else if (f.chave.startsWith('avulsa:')) {
      entrada = entradaFolhaAvulsa(
        ctx,
        {
          balancaId: f.balanca_id,
          ...(f.balanca_id ? {} : { clienteId: f.cliente_id }),
          os: f.ordem_servico,
          data: f.data_prevista,
          chave: f.chave.slice('avulsa:'.length),
        },
        u.id,
      )
    } else {
      throw new ErroApi(
        409,
        `A folha ${numero} voltou da pasta de dados: não dá para montar o que vai para o celular. Use uma folha nova.`,
      )
    }
    const r = await gerarFolha(ctx, req, entrada, { paraEnvio: true })
    if (r.numero !== numero) throw new ErroApi(409, `A folha ${numero} não pôde ser enviada. Use uma folha nova.`)
    return criarEnvio(req, {
      numero,
      dados: r.dados!,
      dadosSha256: r.dadosSha256,
      origem,
      calibracaoId: f.calibracao_id,
      pedido,
      tecnicoNome: tecnico.nome,
      aviso: r.aviso,
    })
  })

  // ---- Recolher e acompanhar -----------------------------------------------------------------------------------

  app.post('/api/folhas-campo/:numero/recolher', async (req: ComNumero) => {
    const u = quem(req)
    const numero = numeroDaFolha(req.params.numero)
    if (!numero) throw new ErroApi(400, 'Informe o nº da folha de campo como está no alto dela (ex.: FC-2026-00042).')
    const corpo = corpoDe(req)
    const forcar = corpo.forcar === true
    if (forcar && u.nivel !== 'ADMIN')
      throw new ErroApi(403, 'Só o administrador recolhe uma folha à força.', { codigo: 'SEM_PERMISSAO' })
    const { envio, imediato } = repoCampo.recolher(numero, { motivo: corpo.motivo, forcar, por: u.nome })
    req.detalheAuditoria = `${numero} · ${forcar ? 'à força' : imediato ? 'na hora (o celular ainda não tinha baixado)' : 'pedido ao celular'}`
    return { envio: repoCampo.envioParaLista(envio), imediato }
  })

  app.get('/api/folhas-campo/:numero/campo', async (req: ComNumero) => {
    const numero = numeroDaFolha(req.params.numero)
    if (!numero) throw new ErroApi(400, 'Informe o nº da folha de campo como está no alto dela (ex.: FC-2026-00042).')
    return repoCampo.campoDaFolha(numero)
  })

  // ---- Registros de campo -----------------------------------------------------------------------------------

  app.get('/api/campo/registros', async (req) => {
    const q = req.query as Record<string, unknown>
    const numero = typeof q.numero === 'string' && q.numero.trim() ? numeroDaFolha(q.numero) : ''
    return {
      registros: repoCampo.listarRegistros({
        ...(numero ? { numero } : {}),
        situacao: typeof q.situacao === 'string' ? q.situacao.toUpperCase() : '',
        orfaos: q.orfaos === '1' || q.orfaos === 'true',
        limite: Number(q.limite) || 200,
      }),
    }
  })

  app.get('/api/campo/registros/:id', async (req: ComId) => repoCampo.obterRegistro(req.params.id))

  /** A folha impressa assinada: gerada na hora, a partir do registro guardado. */
  app.get('/api/campo/registros/:id/pdf', async (req: ComId, reply) => {
    const { linha, registro, pacote } = repoCampo.registroComPacote(req.params.id)
    const pdf = await gerarPdfRegistroCampo(registro, pacote, {
      piloto: !!linha.piloto,
      empresa: repo.obterConfig().empresa,
      recebidoEm: linha.recebido_em,
      relogioDiferencaS: linha.relogio_diferenca_s,
    })
    const nome = nomeArquivoRegistroCampo(linha.ligado_a || linha.numero)
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${nome}"`)
      .header('Cache-Control', 'no-store')
      .send(pdf)
  })

  app.post('/api/campo/registros/:id/descartar', async (req: ComId) => {
    const u = quem(req)
    const registro = repoCampo.descartarRegistro(req.params.id, corpoDe(req).motivo, u.nome)
    req.detalheAuditoria = `${registro.ligadoA || registro.numero}: descartado`
    return { registro }
  })

  app.post('/api/campo/registros/:id/ligar', async (req: ComId) => {
    const u = quem(req)
    const corpo = corpoDe(req)
    const numero = numeroDaFolha(corpo.numero)
    if (!numero) throw new ErroApi(400, 'Informe o nº da folha de campo como está no alto dela (ex.: FC-2026-00042).')
    const registro = repoCampo.ligarRegistro(req.params.id, numero, textoDeUmaLinha(corpo.motivo, 300), u.nome)
    req.detalheAuditoria = `órfão ${registro.numero || 'sem nº'} ligado à ${numero}`
    return { registro }
  })
}

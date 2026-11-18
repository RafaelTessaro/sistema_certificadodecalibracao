// As rotas do app do celular do técnico (app BC Calibração, celular), exatamente como shared/campo/protocolo.ts descreve
// (ROTAS_CAMPO): o pareamento e o APK, públicos na rede interna (com limite por IP); o olá, o pacote, a confirmação do
// recebimento, a resposta ao recolher (regra `celular`) e a entrega do registro (regra `celular-entrega`), com o token do
// celular (server/campo/autenticacao.ts). Corpo JSON, como o resto da API; erros no formato de hoje, {erro, codigo}.

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { hostname } from 'node:os'
import {
  CABECALHOS_CAMPO,
  LIMITE_CORPO_PEDIDO,
  LIMITE_CORPO_REGISTRO,
  lerPedidoOla,
  lerPedidoParear,
  lerPedidoRecolhimento,
  MENSAGENS_ERRO_CAMPO,
  ROTAS_CAMPO,
  type RespostaParear,
} from '#shared/campo/protocolo.ts'
import { ipDe } from '../acesso.ts'
import { LimitePorIp, MENSAGEM_SEM_APK } from '../campo/apk.ts'
import type { DispositivoDaRequisicao, LinhaDispositivo } from '../campo/repositorio.ts'
import type { Contexto, ServicosCampo } from '../contexto.ts'
import { ErroApi } from '../erros.ts'
import { ehLoopback } from '../usuarios.ts'

type ComEnvio = FastifyRequest<{ Params: { envioId: string } }>

const pedidoInvalido = (erros: string[]) =>
  new ErroApi(400, erros[0] ?? MENSAGENS_ERRO_CAMPO.PEDIDO_INVALIDO, { codigo: 'PEDIDO_INVALIDO' })

export async function rotasCampo(app: FastifyInstance, ctx: Contexto, campo: ServicosCampo, servidor: { id: string }) {
  const { usuarios } = ctx
  const { repo: repoCampo, pareamentos, apk } = campo
  // O APK é grande: poucos downloads por IP; as informações, mais
  const limiteApk = new LimitePorIp(20, 10 * 60_000)
  const limiteInfo = new LimitePorIp(120, 10 * 60_000)

  const dispositivo = (req: FastifyRequest): DispositivoDaRequisicao => {
    if (!req.dispositivo) throw new ErroApi(401, MENSAGENS_ERRO_CAMPO.NAO_PAREADO, { codigo: 'NAO_PAREADO' })
    return req.dispositivo
  }
  /** Quem aparece no registro de atividades: o técnico dono do celular (também o desativado, na entrega). */
  const autorDoCelular = (d: LinhaDispositivo) => {
    const u = usuarios.obter(d.usuario_id)
    return { id: d.usuario_id, login: u?.login ?? '' }
  }
  const registrar = (
    req: FastifyRequest,
    acao: Parameters<typeof usuarios.registrar>[0],
    d: LinhaDispositivo,
    alvo: string,
    detalhe: string,
  ) => {
    try {
      usuarios.registrar(acao, { usuario: autorDoCelular(d), ip: ipDe(req), alvo, detalhe: detalhe.slice(0, 300) })
    } catch (e) {
      req.log.error(e, 'falha ao gravar o registro de atividades')
    }
  }
  const limitar = (limite: LimitePorIp, req: FastifyRequest) => {
    const espera = limite.contar(ipDe(req))
    if (espera !== null)
      throw new ErroApi(429, MENSAGENS_ERRO_CAMPO.MUITAS_TENTATIVAS, { codigo: 'MUITAS_TENTATIVAS', esperarSegundos: espera })
  }

  // ---- Pareamento (público, com limite de tentativas) ----------------------------------------------------------
  app.post(ROTAS_CAMPO.parear.caminho, { bodyLimit: LIMITE_CORPO_PEDIDO }, async (req): Promise<RespostaParear> => {
    const ip = ipDe(req)
    const { valor, erros } = lerPedidoParear(req.body)
    // O código fora do formato conta como código errado (passa pelo limite); o resto do pedido, como pedido inválido
    if (erros.length && valor.codigo) throw pedidoInvalido(erros)
    const aceito = pareamentos.aceitar(valor, ip, ehLoopback(ip))
    const tecnico = usuarios.obter(aceito.pendente.usuarioId)
    if (!tecnico || !tecnico.ativo) {
      pareamentos.invalidar(aceito.pendente.id)
      throw new ErroApi(400, 'O técnico deste código não está mais ativo no sistema. Peça um código novo.', {
        codigo: 'CODIGO_EXPIRADO',
      })
    }
    let r: ReturnType<typeof repoCampo.registrarPareamento>
    try {
      r = repoCampo.registrarPareamento({
        aparelhoId: valor.aparelhoId,
        usuarioId: tecnico.id,
        modelo: valor.modelo,
        versaoApp: valor.versaoApp,
        tokenSha256: aceito.tokenSha256,
        por: aceito.pendente.porNome,
      })
    } catch (e) {
      pareamentos.desfazer(aceito.pendente.id)
      throw e
    }
    try {
      usuarios.registrar(aceito.deNovo ? 'CELULAR_PAREADO_DE_NOVO' : 'CELULAR_CADASTRADO', {
        usuario: { id: aceito.pendente.porId, login: aceito.pendente.porLogin },
        ip,
        alvo: r.celular.id,
        detalhe: `${r.celular.nome}${r.celular.modelo ? ` (${r.celular.modelo})` : ''} · técnico ${tecnico.nome}${
          r.trocouTecnico ? ' (o aparelho era de outro técnico)' : ''
        }`.slice(0, 300),
      })
    } catch (e) {
      req.log.error(e, 'falha ao gravar o registro de atividades')
    }
    return {
      token: aceito.token,
      aparelhoId: r.celular.id,
      tecnico: { id: tecnico.id, nome: tecnico.nome },
      servidor: { id: servidor.id, nome: hostname() },
    }
  })

  // ---- Olá: o celular se anuncia e fica sabendo o que baixar, o que devolver e o que o servidor não conhece -----
  app.post(ROTAS_CAMPO.ola.caminho, { bodyLimit: LIMITE_CORPO_PEDIDO }, async (req) => {
    const d = dispositivo(req)
    const { valor, erros } = lerPedidoOla(req.body)
    if (erros.length) throw pedidoInvalido(erros)
    return repoCampo.ola(d.linha, valor, ipDe(req), apk.info())
  })

  // ---- O pacote (o texto congelado no envio) -----------------------------------------------------------------
  app.get(ROTAS_CAMPO.pacote.caminho, async (req: ComEnvio, reply) => {
    const d = dispositivo(req)
    const { texto } = repoCampo.pacote(d.linha, req.params.envioId, ipDe(req))
    return reply.type('application/json; charset=utf-8').send(texto)
  })

  // ---- Confirmação do recebimento ---------------------------------------------------------------------------
  app.post(ROTAS_CAMPO.recebida.caminho, { bodyLimit: LIMITE_CORPO_PEDIDO }, async (req: ComEnvio) => {
    const d = dispositivo(req)
    const r = repoCampo.recebida(d.linha, req.params.envioId, ipDe(req))
    if (r.mudou)
      registrar(
        req,
        r.situacao === 'RECOLHIDA' ? 'FOLHA_RECOLHIDA' : 'FOLHA_RECEBIDA_CELULAR',
        d.linha,
        r.envio.calibracao_id,
        r.situacao === 'RECOLHIDA'
          ? `${r.envio.numero} · o celular ${d.linha.nome} apagou a folha (ainda não tinha começado)`
          : `${r.envio.numero} · no celular ${d.linha.nome}`,
      )
    return { situacao: r.situacao }
  })

  // ---- Resposta ao pedido de recolher ------------------------------------------------------------------------
  app.post(ROTAS_CAMPO.recolhimento.caminho, { bodyLimit: LIMITE_CORPO_PEDIDO }, async (req: ComEnvio) => {
    const d = dispositivo(req)
    const { valor, erros } = lerPedidoRecolhimento(req.body)
    if (erros.length) throw pedidoInvalido(erros)
    const r = repoCampo.recolhimento(d.linha, req.params.envioId, valor, ipDe(req))
    if (r.mudou)
      registrar(
        req,
        'FOLHA_RECOLHIDA',
        d.linha,
        r.envio.calibracao_id,
        valor.resposta === 'APAGUEI'
          ? `${r.envio.numero} · o celular ${d.linha.nome} apagou a folha (ainda não tinha começado)`
          : `${r.envio.numero} · o celular ${d.linha.nome} já tinha começado: a folha volta preenchida`,
      )
    return { situacao: r.situacao }
  })

  // ---- Entrega do registro (grava sempre; o mesmo registro devolve o mesmo recibo) -----------------------------
  app.put(ROTAS_CAMPO.registro.caminho, { bodyLimit: LIMITE_CORPO_REGISTRO }, async (req: ComEnvio) => {
    const d = dispositivo(req)
    const corpo = req.body
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || Buffer.isBuffer(corpo))
      throw new ErroApi(400, MENSAGENS_ERRO_CAMPO.REGISTRO_ILEGIVEL, { codigo: 'REGISTRO_ILEGIVEL' })
    const agoraCelular = String(req.headers[CABECALHOS_CAMPO.agora] ?? '').slice(0, 40)
    const r = await repoCampo.receberRegistro({
      dispositivo: d,
      envioId: req.params.envioId,
      corpo: corpo as Record<string, unknown>,
      ip: ipDe(req),
      agoraCelular,
    })
    if (r.novo) {
      const marcas = r.recibo.marcas.length ? ` · ${r.recibo.marcas.join(', ')}` : ''
      registrar(
        req,
        'FOLHA_DEVOLVIDA_CELULAR',
        d.linha,
        r.envio?.calibracao_id ?? '',
        `${r.registro.numero || r.recibo.numero} · pelo celular ${d.linha.nome}${marcas}`,
      )
    }
    return r.recibo
  })

  // ---- O APK que veio no instalador (público na rede interna) -------------------------------------------------
  app.get(ROTAS_CAMPO.apkInfo.caminho, async (req) => {
    limitar(limiteInfo, req)
    return apk.info()
  })

  app.get(ROTAS_CAMPO.apk.caminho, async (req, reply) => {
    limitar(limiteApk, req)
    const lido = apk.ler()
    if (!lido) throw new ErroApi(404, MENSAGEM_SEM_APK, { codigo: 'SEM_APK' })
    return reply
      .header('Content-Type', 'application/vnd.android.package-archive')
      .header('Content-Disposition', `attachment; filename="${lido.info.nomeArquivo}"`)
      .header('Content-Length', String(lido.conteudo.length))
      .header('X-Conteudo-Sha256', lido.info.sha256)
      .send(lido.conteudo)
  })
}

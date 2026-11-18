// As rotas do escritório para levar o registro de campo à calibração (1.1.0; server/campo/importacao.ts): o que o editor
// precisa saber do celular e do registro, "Comparar com o campo" (piloto), "Puxar dados do campo", "Criar calibração com
// os dados do campo", a justificativa das diferenças depois de puxar, os técnicos que podem receber uma folha no celular
// e as folhas de uma balança que foram para o celular. Todas com o cookie da sessão (quem imprime a folha).

import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { UsuarioSessao } from '#shared/tipos.ts'
import { avisosDa, pendenciasDa } from '../certificados.ts'
import type { Contexto } from '../contexto.ts'
import { ErroApi } from '../erros.ts'
import { registrarNumeros } from '../rotas/numeros.ts'
import {
  campoDaCalibracao,
  compararComCampo,
  criarCalibracaoDoCampo,
  folhasCampoDaBalanca,
  justificarCampo,
  puxarDoCampo,
  tecnicosParaEnvio,
} from './importacao.ts'

type ComId = FastifyRequest<{ Params: { id: string } }>

export async function rotasImportacaoCampo(app: FastifyInstance, ctx: Contexto) {
  const { repo } = ctx

  const quem = (req: FastifyRequest): UsuarioSessao => {
    if (!req.usuario) throw new ErroApi(401, 'Sua sessão terminou. Entre de novo para continuar.', { codigo: 'SEM_SESSAO' })
    return req.usuario
  }
  const calibracao = (id: string) => {
    const k = repo.obterCalibracao(id)
    if (!k) throw new ErroApi(404, 'Calibração não encontrada.')
    return k
  }

  /** O celular e o registro de campo da folha da calibração (a faixa, a trava, comparar/puxar e a justificativa). */
  app.get('/api/calibracoes/:id/campo', async (req: ComId) => campoDaCalibracao(ctx, calibracao(req.params.id)))

  /** "Comparar com o campo": grava a comparação e a observação; não muda a calibração. */
  app.post('/api/calibracoes/:id/comparar-campo', async (req: ComId) => {
    const u = quem(req)
    const r = compararComCampo(ctx, req.params.id, req.body, u)
    req.detalheAuditoria = String((r.importacao.resumo as { texto?: string }).texto ?? '').slice(0, 200)
    return r
  })

  /** "Puxar dados do campo" (registro original = CELULAR): `{registroId, escolhas, versao}`. */
  app.post('/api/calibracoes/:id/puxar-campo', async (req: ComId) => {
    const u = quem(req)
    const r = puxarDoCampo(ctx, req.params.id, req.body, u)
    req.detalheAuditoria = r.resumo.texto.slice(0, 200)
    return {
      calibracao: r.calibracao,
      resumo: r.resumo,
      importacao: r.importacao,
      pendencias: pendenciasDa(ctx, r.calibracao),
      avisos: avisosDa(ctx, r.calibracao),
    }
  })

  /** A justificativa das diferenças depois de puxar (um texto só; vazio tira): `{texto, versao}`. */
  app.post('/api/calibracoes/:id/justificativa-campo', async (req: ComId) => {
    const u = quem(req)
    const k = justificarCampo(ctx, req.params.id, req.body, u)
    req.detalheAuditoria = k.campoJustificativa
      ? `justificativa das diferenças com o celular: ${k.campoJustificativa.texto}`.slice(0, 200)
      : 'justificativa das diferenças com o celular retirada'
    return { calibracao: k, pendencias: pendenciasDa(ctx, k), avisos: avisosDa(ctx, k) }
  })

  /** "Criar calibração com os dados do campo" (registro original = CELULAR): `{balancaId?}` (a balança informada no local). */
  app.post('/api/campo/registros/:id/criar-calibracao', async (req: ComId, reply) => {
    const u = quem(req)
    const r = criarCalibracaoDoCampo(ctx, req.params.id, req.body, u)
    registrarNumeros(ctx, req, r.eventos)
    req.detalheAuditoria = `calibração criada · ${r.resumo.texto}`.slice(0, 200)
    return reply.code(201).send({ calibracao: r.calibracao, resumo: r.resumo, importacao: r.importacao })
  })

  /** Os técnicos ativos e os celulares que valem ("Enviar para o técnico"). */
  app.get('/api/campo/tecnicos', async (req) => ({ tecnicos: tecnicosParaEnvio(ctx, quem(req)) }))

  /** As folhas de uma balança que foram para o celular ou têm registro de campo (a ficha da balança). */
  app.get('/api/balancas/:id/campo', async (req: ComId) => {
    if (!repo.obterBalanca(req.params.id)) throw new ErroApi(404, 'Balança não encontrada.')
    return { folhas: folhasCampoDaBalanca(ctx, req.params.id) }
  })
}

// Nºs de certificado reservados na impressão da folha de campo (ver `Repositorio.numeroParaFolha`): a lista
// dos ainda sem certificado e dos não utilizados (os buracos da numeração, com o motivo), e o descarte do nº
// de uma folha não ligada (avulsa, ou de uma calibração excluída) que não vai ser ligada a nenhuma calibração. E o registro de atividades do que muda
// nos nºs em outras rotas (impressão, ligação da folha, exclusão da calibração).

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ipDe } from '../acesso.ts'
import type { Contexto } from '../contexto.ts'
import { ErroApi } from '../erros.ts'
import type { EventoNumero } from '../repositorio.ts'

/** Cada nº reservado ou não utilizado numa requisição vira uma linha do registro de atividades. */
export function registrarNumeros(ctx: Contexto, req: FastifyRequest, eventos: EventoNumero[]) {
  for (const ev of eventos)
    try {
      ctx.usuarios.registrar(ev.acao, { usuario: req.usuario, ip: ipDe(req), alvo: ev.calibracaoId, detalhe: ev.detalhe })
    } catch (e) {
      req.log.error(e, 'falha ao gravar o registro de atividades')
    }
}

export async function rotasNumeros(app: FastifyInstance, ctx: Contexto) {
  const { repo } = ctx

  app.get('/api/numeros-reservados', async () => ({ numeros: repo.listarNumerosReservados() }))

  /**
   * O nº de uma folha ainda não ligada (avulsa, ou de uma calibração excluída) perdida ou inutilizada passa a
   * não utilizado, com o motivo (só o administrador).
   */
  app.post('/api/numeros-reservados/:reserva/nao-utilizado', async (req: FastifyRequest<{ Params: { reserva: string } }>) => {
    const id = Number(req.params.reserva)
    if (!Number.isSafeInteger(id) || id <= 0) throw new ErroApi(404, 'Nº reservado não encontrado.')
    const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
    const numero = repo.descartarNumeroReservado(id, corpo.motivo, req.usuario?.nome ?? '')
    // O motivo (digitado) fica na tabela dos nºs; o registro guarda qual nº e de qual folha
    req.detalheAuditoria = `${numero.numero} · folha ${numero.folha}`
    return { numero }
  })
}

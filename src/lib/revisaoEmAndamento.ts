import type { StatusCalibracao } from '#shared/tipos.ts'

type Revisao = { id: string; numero: string; status: StatusCalibracao }

/**
 * A revisão em andamento do certificado (rascunho ou aguardando autorização) e o que a página dele faz com ela:
 * - emitido: a faixa "Continuar a revisão"; outra revisão não (uma por vez); o cancelamento espera a revisão ser
 *   emitida ou excluída (o servidor recusa, `Repositorio.cancelar`), e o pedido de cancelamento já avisa;
 * - cancelado com a revisão ainda aberta (de antes dessa trava): a revisão não pode mais ser emitida, e a faixa leva
 *   a ela para ser excluída (nunca "Continuar a revisão").
 */
export function revisaoEmAndamento<R extends Revisao>(status: StatusCalibracao, revisoes: R[]) {
  const aberta = revisoes.find((r) => r.status === 'RASCUNHO' || r.status === 'REVISAO') ?? null
  const emitido = status === 'EMITIDO'
  return {
    aberta,
    faixa: !aberta ? null : emitido ? ('continuar' as const) : ('excluir' as const),
    podeCorrigir: emitido && !aberta,
    cancelamentoBloqueado: emitido && !!aberta,
  }
}

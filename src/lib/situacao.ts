// A situação de uma calibração nas listas, além da pílula: para quem foi o pedido de autorização e quem devolveu.

import type { CalibracaoResumo } from '#shared/tipos.ts'

/** A linha de baixo da situação nas listas: para quem foi o pedido de autorização ("você" em destaque) ou quem devolveu. */
export function detalheDaSituacao(
  k: Pick<CalibracaoResumo, 'status' | 'aguardando' | 'devolvidaPor'>,
  eu: string | undefined,
): { texto: string; destaque: boolean } | null {
  if (k.status === 'REVISAO' && k.aguardando)
    return k.aguardando.id === eu
      ? { texto: 'Aguarda você', destaque: true }
      : { texto: `de ${k.aguardando.nome}`, destaque: false }
  if (k.status === 'RASCUNHO' && k.devolvidaPor) return { texto: `por ${k.devolvidaPor}`, destaque: false }
  return null
}

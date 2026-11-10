import { type ReactNode, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { avisoSemPermissao, type Permissao } from '#shared/permissoes.ts'
import { usePode } from '../../store/sessao'
import { toast } from '../../store/ui'

/**
 * Página só para quem tem a permissão; os outros voltam ao Painel com o aviso do porquê (sem ele, a pessoa ficava no
 * Painel sem entender). O servidor também recusa as rotas.
 */
export function RotaPermitida({ permissao, children }: { permissao: Permissao; children: ReactNode }) {
  const permitido = usePode(permissao)
  useEffect(() => {
    if (!permitido) toast.aviso(...avisoSemPermissao(permissao))
  }, [permitido, permissao])
  return permitido ? children : <Navigate to="/" replace />
}

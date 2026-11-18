// As janelas maiores do app do celular (1.1.0) baixam na primeira vez que abrem: o registro de campo (os 8 passos) e
// "Comparar com o campo" / "Puxar dados do campo" (com a lógica de shared/campo/importar.ts). O bloco principal da
// interface continua do tamanho de antes.

import { type ComponentProps, lazy, Suspense } from 'react'

const RegistroCampoModalAtrasado = lazy(() => import('./RegistroCampoModal').then((m) => ({ default: m.RegistroCampoModal })))
const CompararCampoModalAtrasado = lazy(() => import('./CompararCampoModal').then((m) => ({ default: m.CompararCampoModal })))

type PropsRegistro = ComponentProps<typeof RegistroCampoModalAtrasado>
type PropsComparar = ComponentProps<typeof CompararCampoModalAtrasado>

/** "Registro de campo", baixado na primeira abertura (sem registro, nada é montado). */
export function RegistroCampo(props: PropsRegistro) {
  if (!props.registroId) return null
  return (
    <Suspense fallback={null}>
      <RegistroCampoModalAtrasado {...props} />
    </Suspense>
  )
}

/** "Comparar com o campo" / "Puxar dados do campo", baixado na primeira abertura. */
export function CompararCampo(props: PropsComparar) {
  if (!props.aberto) return null
  return (
    <Suspense fallback={null}>
      <CompararCampoModalAtrasado {...props} />
    </Suspense>
  )
}

// O nº de certificado reservado na impressão da folha de campo (o que o técnico copiou na etiqueta da balança),
// no título do editor da calibração: o certificado é emitido com ele.

import { Hash } from 'lucide-react'
import type { NumeroReservado } from '#shared/tipos.ts'
import { dataHora } from '../lib/format'

export function SeloNumeroReservado({ n }: { n: Pick<NumeroReservado, 'numero' | 'folha' | 'reservadoEm' | 'reservadoPor'> }) {
  return (
    <span
      className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium tracking-normal text-ink-2"
      title={`Na folha de campo ${n.folha}. Reservado em ${dataHora(n.reservadoEm)}${n.reservadoPor ? ` por ${n.reservadoPor}` : ''}. O certificado é emitido com este nº (o da etiqueta).`}
    >
      <Hash className="h-3.5 w-3.5 text-muted" aria-hidden />
      <span>
        Certificado nº <span className="tnum font-semibold text-ink">{n.numero}</span>{' '}
        <span className="font-normal text-muted">(reservado)</span>
      </span>
    </span>
  )
}

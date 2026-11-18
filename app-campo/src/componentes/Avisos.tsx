// Avisos na hora: "Confira a digitação" (âmbar) e "Isto impede o certificado" (vermelho), sempre com ▲, cor e texto.
// Nenhum bloqueia: "Conferi, está certo" (ou "Registrar motivo") fica no registro, e o aviso vai para a Revisão.

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AvisoCampo } from '../../../shared/campo/avisos.ts'
import { AreaTexto, Botao, cn } from './base.tsx'

export function AvisoNaHora({
  aviso,
  aoConferir,
  aoCorrigir,
  aoMotivo,
  compacto,
}: {
  aviso: AvisoCampo
  aoConferir?: () => void
  aoCorrigir?: () => void
  aoMotivo?: (motivo: string) => void
  compacto?: boolean
}) {
  const [pedindoMotivo, setPedindoMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const impede = aviso.classe === 'IMPEDE'
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-xl border-l-4 px-3 py-2.5',
        impede ? 'border-danger bg-danger-soft' : 'border-warning bg-warning-soft',
      )}
    >
      <div className={cn('text-[13px] font-semibold uppercase tracking-wide', impede ? 'text-danger' : 'text-warning-ink')}>
        ▲ {impede ? 'Isto impede o certificado' : 'Confira a digitação'}
      </div>
      <p className={cn('mt-0.5 text-[16px] leading-snug', impede ? 'text-ink' : 'text-warning-ink')}>{aviso.texto}</p>
      {!compacto && (aoConferir || aoCorrigir || aoMotivo) && !pedindoMotivo && (
        <div className="mt-2 flex flex-wrap gap-2">
          {aoCorrigir && <Botao onClick={aoCorrigir}>{impede ? 'Resolver agora' : 'Corrigir'}</Botao>}
          {!impede && aoConferir && <Botao onClick={aoConferir}>Conferi, está certo</Botao>}
          {impede && aoMotivo && <Botao onClick={() => setPedindoMotivo(true)}>Registrar motivo</Botao>}
        </div>
      )}
      {pedindoMotivo && aoMotivo && (
        <div className="mt-2 flex flex-col gap-2">
          <AreaTexto rotulo="Motivo" valor={motivo} aoMudar={setMotivo} autoFoco linhas={2} />
          <div className="flex gap-2">
            <Botao onClick={() => setPedindoMotivo(false)}>Cancelar</Botao>
            <Botao variante="principal" disabled={!motivo.trim()} onClick={() => aoMotivo(motivo.trim())}>
              Registrar
            </Botao>
          </div>
        </div>
      )}
    </div>
  )
}

/** Uma faixa explicativa (cinza), como "Avisos pelo valor visto em campo: d = 0,01 kg.". */
export function Nota({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-neutral-soft px-3 py-2 text-[15px] text-ink-2">{children}</p>
}

// As folhas de campo impressas para o cliente da calibração e ainda não ligadas a nenhuma calibração: se foi uma delas a
// usada no cliente, o nº de certificado dela já está na etiqueta da balança. O aviso aparece nas etapas "Cliente e OS" e
// "Revisão e emissão", sem impedir nada, e "Ligar esta folha" liga pelo fluxo de sempre (`ContextoEtapa.vincularFolha`).

import { Link2, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { FolhaNaoLigada } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { textoFolhaNaoLigada } from '../../lib/folhaCampo'
import { usePode } from '../../store/sessao'
import { Button } from '../ui/Button'

export function AvisoFolhasNaoLigadas({
  folhas,
  aoLigar,
  className,
}: {
  folhas: readonly FolhaNaoLigada[] | undefined
  /** Liga a folha pelo nº (true se ligou). */
  aoLigar: (numero: string) => Promise<boolean>
  className?: string
}) {
  const [ligando, setLigando] = useState<string | null>(null)
  // Só o administrador marca a folha que não foi usada ("Não vai ser usada"): o aviso diz a quem pedir
  const administrador = usePode('cancelarCertificado')
  if (!folhas?.length) return null
  const ligar = async (numero: string) => {
    setLigando(numero)
    try {
      await aoLigar(numero)
    } finally {
      setLigando(null)
    }
  }
  return (
    <div className={cn('rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-warning', className)}>
      <ul className="flex flex-col gap-2.5">
        {folhas.map((f) => (
          <li key={f.numero} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <p className="flex min-w-0 flex-1 items-start gap-2 text-[13px] font-medium">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">{textoFolhaNaoLigada(f, administrador)}</span>
            </p>
            <Button
              tamanho="sm"
              icone={ligando === f.numero ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              disabled={!!ligando}
              onClick={() => void ligar(f.numero)}
              className="shrink-0 self-start"
            >
              Ligar esta folha
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

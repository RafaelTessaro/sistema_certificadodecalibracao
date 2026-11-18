// O selo da folha que foi para o celular (a aba "Folhas de campo", a ficha da balança e o Painel): a situação do envio
// ("No celular de Carlos desde 08:12", "Voltou do campo"…), o que o celular informou e as marcas do registro.

import { Smartphone } from 'lucide-react'
import type { CelularDaFolha } from '#shared/tipos.ts'
import { seloDoCelular, selosDasMarcas } from '../../lib/campo'
import { cn } from '../../lib/cn'
import { Badge } from '../ui/Badge'

export function SeloCelular({
  c,
  compacto,
  className,
  aoVerRegistro,
}: {
  c: CelularDaFolha
  /** Só a pílula (sem a linha de baixo nem as marcas). */
  compacto?: boolean
  className?: string
  /** Com o registro que voltou: o link "Ver registro". */
  aoVerRegistro?: (registroId: string) => void
}) {
  const s = seloDoCelular(c)
  const marcas = selosDasMarcas(c.marcas, c.desfecho)
  return (
    <span className={cn('flex min-w-0 flex-col items-start gap-1', className)}>
      <span title={s.dica}>
        <Badge tom={s.tom} ponto={false} className="gap-1">
          <Smartphone className="h-3 w-3" />
          {s.rotulo}
        </Badge>
      </span>
      {!compacto && s.detalhe && (
        <span className="max-w-56 truncate text-xs text-muted" title={s.detalhe}>
          {s.detalhe}
        </span>
      )}
      {!compacto && marcas.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {marcas.map((m) => (
            <span key={m.rotulo} title={m.dica}>
              <Badge tom={m.tom} ponto={false} className="h-5 px-2 text-[11px]">
                {m.rotulo}
              </Badge>
            </span>
          ))}
        </span>
      )}
      {!compacto && c.registroId && aoVerRegistro && (
        <button
          type="button"
          onClick={() => aoVerRegistro(c.registroId!)}
          className="cursor-pointer text-xs font-medium text-brand-ink hover:underline"
        >
          Ver registro
        </button>
      )}
    </span>
  )
}

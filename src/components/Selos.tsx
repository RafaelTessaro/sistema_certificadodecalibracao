import { Ban, CircleCheck, Clock, FilePen, Hourglass, RefreshCcw, Undo2 } from 'lucide-react'
import { diasEntre, ROTULO_VALIDADE, situacaoValidade, STATUS_CALIBRACAO } from '#shared/dominio.ts'
import type { CalibracaoResumo, StatusCalibracao } from '#shared/tipos.ts'
import { cn } from '../lib/cn'
import { hojeISO, relativoDias } from '../lib/format'
import { Badge } from './ui/Badge'

const ICONE_STATUS: Record<StatusCalibracao, typeof FilePen> = {
  RASCUNHO: FilePen,
  REVISAO: Hourglass,
  EMITIDO: CircleCheck,
  CANCELADO: Ban,
  SUBSTITUIDO: RefreshCcw,
}

/**
 * Situação do documento (pílula com ícone): rascunho (ou devolvido pelo signatário), aguardando autorização (de quem,
 * com `aguardando`), emitido, cancelado, substituído.
 */
export function StatusCalibracaoBadge({
  status,
  aguardando,
  devolvida,
  className,
}: {
  status: StatusCalibracao
  /** Enviada para a autorização desta pessoa (o nome sai na pílula). */
  aguardando?: string
  /** Rascunho devolvido pelo signatário sem autorizar. */
  devolvida?: boolean
  className?: string
}) {
  const s = STATUS_CALIBRACAO[status]
  const voltou = status === 'RASCUNHO' && devolvida
  const Icone = voltou ? Undo2 : ICONE_STATUS[status]
  return (
    <Badge tom={voltou ? 'warning' : s.tom} ponto={false} className={cn('gap-1', className)}>
      <Icone className="h-3 w-3" />
      {voltou ? 'Devolvida' : status === 'REVISAO' && aguardando ? `${s.label} de ${aguardando}` : s.label}
    </Badge>
  )
}

/** A linha de baixo da situação nas listas: para quem foi o pedido de autorização ("você" em destaque) ou quem devolveu. */
export function detalheDaSituacao(
  k: Pick<CalibracaoResumo, 'status' | 'aguardando' | 'devolvidaPor'>,
  eu: string | undefined,
): { texto: string; destaque: boolean } | null {
  if (k.status === 'REVISAO' && k.aguardando)
    return k.aguardando.id === eu ? { texto: 'Aguarda você', destaque: true } : { texto: `de ${k.aguardando.nome}`, destaque: false }
  if (k.status === 'RASCUNHO' && k.devolvidaPor) return { texto: `por ${k.devolvidaPor}`, destaque: false }
  return null
}

/**
 * Prazo (ponto + texto): "Vence em 12 dias", "Vencida há 3 dias", "Em dia". Diferente da situação do
 * documento, para "Emitido" e "Em dia" não se confundirem.
 */
export function PrazoBadge({
  data,
  diasAviso = 30,
  feminino = true,
  className,
}: {
  data: string
  diasAviso?: number
  feminino?: boolean
  className?: string
}) {
  const hoje = hojeISO()
  const sit = situacaoValidade(data, hoje, diasAviso)
  if (sit === 'SEM_DATA') return <span className={cn('text-xs text-muted', className)}>—</span>
  const dias = diasEntre(hoje, data)
  const texto =
    sit === 'VENCIDO'
      ? `${feminino ? 'Vencida' : 'Vencido'} ${relativoDias(dias)}`
      : sit === 'VENCENDO'
        ? dias === 0
          ? 'Vence hoje'
          : `Vence ${relativoDias(dias)}`
        : feminino
          ? 'Em dia'
          : 'Válido'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap', className)}>
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          sit === 'VENCIDO' ? 'bg-danger' : sit === 'VENCENDO' ? 'bg-warning-dot' : 'bg-success',
        )}
      />
      <span
        className={cn(
          sit === 'VENCIDO' ? 'font-medium text-danger' : sit === 'VENCENDO' ? 'font-medium text-warning' : 'text-ink-2',
        )}
      >
        {texto}
      </span>
    </span>
  )
}

/** Validade de um padrão da empresa (em badge): vencido bloqueia o uso nas calibrações. */
export function ValidadePadraoBadge({ validade, diasAviso = 30 }: { validade: string; diasAviso?: number }) {
  const sit = situacaoValidade(validade, hojeISO(), diasAviso)
  const r = ROTULO_VALIDADE[sit]
  return (
    <Badge tom={r.tom}>
      {sit === 'VENCENDO' ? (
        <>
          <Clock className="h-3 w-3" /> Vence {relativoDias(diasEntre(hojeISO(), validade))}
        </>
      ) : (
        r.label
      )}
    </Badge>
  )
}

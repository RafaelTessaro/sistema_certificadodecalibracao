import { Ban, CircleCheck, Clock, FileClock, FilePen, Hourglass, RefreshCcw, Undo2 } from 'lucide-react'
import { diasEntre, ROTULO_VALIDADE, rotuloDaSituacao, situacaoValidade, STATUS_CALIBRACAO } from '#shared/dominio.ts'
import type { StatusCalibracao } from '#shared/tipos.ts'
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
 * com `aguardando`; "Enviada para revisão" com a revisão por outra pessoa desligada), emitido (ou emitido aguardando a
 * assinatura digital, que ainda não pode ser baixado nem enviado), cancelado, substituído.
 */
export function StatusCalibracaoBadge({
  status,
  aguardando,
  devolvida,
  semAutorizacao,
  aguardandoAssinatura,
  className,
}: {
  status: StatusCalibracao
  /** Enviada para a autorização desta pessoa (o nome sai na pílula). */
  aguardando?: string
  /** Rascunho devolvido pelo signatário sem autorizar. */
  devolvida?: boolean
  /** A revisão por outra pessoa está desligada: a enviada não aguarda a autorização de ninguém (`rotuloDaSituacao`). */
  semAutorizacao?: boolean
  /** Emitido e ainda não assinado digitalmente (1.0.7): não é o verde de "Emitido" (o PDF ainda não sai). */
  aguardandoAssinatura?: boolean
  className?: string
}) {
  if (status === 'EMITIDO' && aguardandoAssinatura)
    return (
      <Badge tom="warning" ponto={false} className={cn('gap-1', className)}>
        <FileClock className="h-3 w-3" />
        Aguardando assinatura
      </Badge>
    )
  const s = STATUS_CALIBRACAO[status]
  const rotulo = rotuloDaSituacao(status, semAutorizacao)
  const voltou = status === 'RASCUNHO' && devolvida
  const Icone = voltou ? Undo2 : ICONE_STATUS[status]
  return (
    <Badge tom={voltou ? 'warning' : s.tom} ponto={false} className={cn('gap-1', className)}>
      <Icone className="h-3 w-3" />
      {voltou ? 'Devolvida' : status === 'REVISAO' && aguardando && !semAutorizacao ? `${rotulo} de ${aguardando}` : rotulo}
    </Badge>
  )
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

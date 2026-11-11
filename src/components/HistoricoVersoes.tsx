import { ExternalLink, FileClock, History } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { VersaoCertificado } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { dataHora } from '../lib/format'
import { textoDaCorrecao } from '../lib/versoes'
import { Card, CardHeader } from './ui/Card'

/**
 * Histórico interno de um certificado corrigido com o mesmo nº: cada emissão (quando, por quem, o motivo da correção)
 * e o PDF dela. Só a versão atual vale; as anteriores abrem com a marca “substituído”.
 */
export function HistoricoVersoes({ versoes, atualId }: { versoes: VersaoCertificado[]; atualId: string }) {
  return (
    <Card>
      <CardHeader
        icone={<History className="h-4 w-4" />}
        titulo="Versões deste certificado"
        descricao="Só no sistema: o cliente recebe sempre o mesmo número."
      />
      <ol className="flex flex-col px-5 pb-4">
        {[...versoes].reverse().map((v) => {
          const substituida = v.status === 'SUBSTITUIDO'
          const cancelada = v.status === 'CANCELADO'
          return (
            <li key={v.id} className="border-t border-line py-2.5 text-[13px] first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 font-medium text-ink">
                  Versão {v.versao}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      substituida
                        ? 'bg-surface-2 text-muted'
                        : cancelada
                          ? 'bg-danger-soft text-danger'
                          : 'bg-brand-soft text-brand-ink',
                    )}
                  >
                    {substituida ? 'substituída' : cancelada ? 'cancelada' : 'atual'}
                  </span>
                </p>
                {/* Aguardando a assinatura digital: o servidor não entrega o PDF (a ficha dela tenta assinar ao abrir) */}
                {v.aguardandoAssinatura ? (
                  <span
                    title="Aguardando a assinatura digital: o PDF ainda não pode ser aberto."
                    className="inline-flex shrink-0 cursor-not-allowed items-center gap-1 text-xs font-medium text-muted"
                  >
                    PDF
                    <FileClock className="h-3 w-3" />
                  </span>
                ) : (
                  <a
                    href={api.urlPdf(v.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
                    title={substituida ? 'Abre com a marca “substituído”' : undefined}
                  >
                    PDF
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="text-muted">
                {v.versao === 1 ? (
                  <>
                    Emitida em {dataHora(v.emitidoEm)}
                    {v.emitidoPor && <> por {v.emitidoPor}</>}
                  </>
                ) : (
                  textoDaCorrecao(v)
                )}
              </p>
              {v.motivo && <p className="mt-0.5 break-words text-ink-2">Motivo: {v.motivo}</p>}
              {v.id !== atualId && (
                <Link
                  to={`/calibracoes/${v.id}`}
                  className="mt-0.5 inline-block text-xs font-medium text-brand-ink hover:underline"
                >
                  Ver esta versão
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

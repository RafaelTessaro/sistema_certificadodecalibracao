import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { formatarNumero } from '#shared/metrologia/index.ts'
import type { Aviso } from '#shared/metrologia/tipos.ts'
import { cn } from '../../lib/cn'
import { Card } from '../ui/Card'
import type { ContextoEtapa } from './contexto'
import { GraficoErro } from './GraficoErro'
import { casasDe } from './util'

/** Painel lateral "ao vivo": resumo dos resultados, gráfico e avisos do cálculo. */
export function PainelResultados({ calc, balanca, f }: Pick<ContextoEtapa, 'calc' | 'balanca' | 'f'>) {
  const r = calc?.resultado
  const u = balanca.unidade
  const casas = casasDe(balanca)
  const lidos = r?.pontos.filter((p) => p.crescente || p.decrescente || p.media) ?? []
  const maiorErro = lidos.reduce((m, p) => {
    const e = Math.max(Math.abs(p.media?.erro ?? 0), Math.abs(p.crescente?.erro ?? 0), Math.abs(p.decrescente?.erro ?? 0))
    return Math.max(m, e)
  }, 0)
  const rep = r?.repetibilidade[0]
  const avisos = [
    ...(r?.avisos ?? []),
    ...(calc?.comoEncontrado?.avisos.map((a) => ({ ...a, mensagem: `Antes do ajuste: ${a.mensagem}` })) ?? []),
  ]
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">Resultados ao vivo</p>
        {f.conformidade.solicitada && r?.conformidade && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              r.conformidade === 'CONFORME' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
            )}
          >
            {r.conformidade === 'CONFORME' ? <CircleCheck className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
            {r.conformidade === 'CONFORME' ? 'Conforme' : 'Não conforme'}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-px bg-line">
        <Item rotulo="Pontos lidos" valor={`${lidos.length} de ${f.indicacao.pontos.length}`} />
        <Item rotulo="Maior |erro|" valor={lidos.length ? `${formatarNumero(maiorErro, casas)} ${u}` : '—'} />
        <Item rotulo="Maior U" valor={r && r.maiorU > 0 ? `${formatarNumero(r.maiorU, casas + 1)} ${u}` : '—'} />
        <Item rotulo="Repetibilidade (s)" valor={rep ? `${formatarNumero(rep.s, casas + 1)} ${u}` : '—'} />
        <Item
          rotulo="Excentricidade"
          valor={
            r?.excentricidade.aplicavel
              ? `${formatarNumero(r.excentricidade.maiorDesvio, casas)} ${u}`
              : f.excentricidade.aplicavel
                ? '—'
                : 'N/A'
          }
        />
        <Item
          rotulo="Ajuste"
          valor={f.ajuste.realizado === 'NAO' ? 'Não houve' : f.ajuste.realizado === 'INTERNO' ? 'Interno' : 'Externo'}
        />
      </dl>
      <div className="border-t border-line px-2 pt-3 pb-2">
        <p className="mb-1 px-2 text-xs font-medium text-muted">Erro × carga ({u}) com ±U</p>
        {r && <GraficoErro resultado={r} unidade={u} casas={casas} altura={180} />}
      </div>
      {avisos.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
          {avisos.slice(0, 8).map((a, i) => (
            <AvisoItem key={i} aviso={a} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-surface px-4 py-2.5">
      <dt className="text-[11px] text-muted">{rotulo}</dt>
      <dd className="tnum mt-0.5 truncate text-[13.5px] font-semibold text-ink">{valor}</dd>
    </div>
  )
}

export function AvisoItem({ aviso }: { aviso: Aviso }) {
  const Icone = aviso.nivel === 'erro' ? CircleAlert : aviso.nivel === 'atencao' ? TriangleAlert : Info
  return (
    <li
      className={cn(
        'flex items-start gap-2 text-[12.5px] leading-snug',
        aviso.nivel === 'erro' ? 'text-danger' : aviso.nivel === 'atencao' ? 'text-warning' : 'text-ink-2',
      )}
    >
      <Icone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{aviso.mensagem}</span>
    </li>
  )
}

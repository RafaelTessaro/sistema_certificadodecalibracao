import { CircleAlert, CircleCheck, Eye, FileBadge2, Hourglass, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { formatarNumeroCertificado } from '#shared/dominio.ts'
import { podeEmitir } from '#shared/permissoes.ts'
import type { NumeroReservado } from '#shared/tipos.ts'
import { hojeISO } from '../../lib/format'
import { useSessao } from '../../store/sessao'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import type { ContextoEtapa } from './contexto'
import { AvisoItem } from './PainelResultados'

export function EtapaRevisao({
  ctx,
  numeroReservado = null,
  pendencias,
  salvando,
  aoVisualizar,
  aoEnviarRevisao,
  aoVoltarRascunho,
  aoEmitir,
}: {
  ctx: ContextoEtapa
  /** O nº reservado na impressão da folha de campo (o da etiqueta): o certificado é emitido com ele. */
  numeroReservado?: Pick<NumeroReservado, 'numero' | 'folha'> | null
  pendencias: string[]
  salvando: boolean
  aoVisualizar: () => void
  aoEnviarRevisao: () => void
  aoVoltarRascunho: () => void
  aoEmitir: () => void
}) {
  const { calc, config, f, status, equipe } = ctx
  const usuario = useSessao((s) => s.usuario)
  const r = calc?.resultado
  const signatario = podeEmitir(usuario)
  const proprio = f.tecnicoId === usuario?.id
  const bloqueadoRevisor = config.exigirRevisor && proprio
  const tecnico = equipe.find((u) => u.id === f.tecnicoId)
  const [emitindo, setEmitindo] = useState(false)
  // A numeração segue o ano da emissão (hoje)
  const exemplo = formatarNumeroCertificado(config.numeracao, 1, Number(hojeISO().slice(0, 4)), f.substituiId ? 1 : 0)
  const avisos = [...(r?.avisos ?? []), ...(calc?.comoEncontrado?.avisos ?? [])].filter((a) => a.nivel !== 'info')
  const pronto = pendencias.length === 0

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icone={pronto ? <CircleCheck className="h-4 w-4 text-success" /> : <CircleAlert className="h-4 w-4 text-warning" />}
          titulo={pronto ? 'Tudo pronto para emitir' : 'Falta completar'}
          descricao={
            pronto
              ? 'Confira a prévia do certificado antes de emitir.'
              : 'Resolva os itens abaixo para poder emitir o certificado.'
          }
        />
        {!pronto && (
          <ul className="flex flex-col gap-2 px-5 pb-5">
            {pendencias.map((p) => (
              <li
                key={p}
                className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] font-medium text-warning"
              >
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        )}
        {avisos.length > 0 && (
          <div className="mx-5 mb-5 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-muted">Avisos do cálculo (não impedem a emissão)</p>
            <ul className="flex flex-col gap-1.5">
              {avisos.map((a, i) => (
                <AvisoItem key={i} aviso={a} />
              ))}
            </ul>
          </div>
        )}
      </Card>

      {r && r.pontos.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader titulo="Resumo dos resultados" descricao="Como vão aparecer no certificado" />
          <div className="scroll-fino overflow-x-auto border-t border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-surface-2/70 text-left text-xs whitespace-nowrap text-muted">
                  <th className="px-5 py-2.5 font-medium">Carga ({ctx.balanca.unidade})</th>
                  <th className="px-3 py-2.5 text-right font-medium">Indicação</th>
                  <th className="px-3 py-2.5 text-right font-medium">Erro</th>
                  <th className="px-3 py-2.5 text-right font-medium">U</th>
                  <th className="px-3 py-2.5 text-right font-medium">k</th>
                  <th className="px-5 py-2.5 text-right font-medium">νeff</th>
                </tr>
              </thead>
              <tbody>
                {r.pontos.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="tnum px-5 py-2 text-ink">{p.texto.carga}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-2">
                      {[p.texto.crescente, p.texto.decrescente].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="tnum px-3 py-2 text-right text-ink">
                      {f.opcoes.histerese === 'MEDIA' && p.texto.erroMedio
                        ? p.texto.erroMedio
                        : [p.texto.erroCrescente, p.texto.erroDecrescente].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="tnum px-3 py-2 text-right text-ink">{p.texto.U || '—'}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-2">{p.texto.k || '—'}</td>
                    <td className="tnum px-5 py-2 text-right text-ink-2">{p.texto.nuEff || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader icone={<FileBadge2 className="h-4 w-4" />} titulo="Emissão" />
        <div className="flex flex-col gap-4 px-5 pb-5">
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2/60 px-4 py-3">
              <p className="text-xs text-muted">Executado por</p>
              <p className="mt-0.5 font-medium text-ink">{tecnico?.nome ?? '—'}</p>
            </div>
            <div className="rounded-xl bg-surface-2/60 px-4 py-3">
              <p className="text-xs text-muted">Autorizado por</p>
              <p className="mt-0.5 font-medium text-ink">{signatario && !bloqueadoRevisor ? usuario?.nome : 'Um signatário'}</p>
            </div>
            <div className="rounded-xl bg-surface-2/60 px-4 py-3">
              <p className="text-xs text-muted">Número</p>
              {numeroReservado ? (
                <p className="mt-0.5 font-medium text-ink">
                  <span className="tnum">{numeroReservado.numero}</span>{' '}
                  <span className="font-normal text-muted">
                    (reservado na folha <span className="tnum whitespace-nowrap">{numeroReservado.folha}</span>)
                  </span>
                </p>
              ) : (
                <p className="tnum mt-0.5 font-medium text-ink">Gerado na emissão (ex.: {exemplo})</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button icone={<Eye className="h-4 w-4" />} onClick={aoVisualizar}>
              Ver prévia do PDF
            </Button>
            {status === 'RASCUNHO' && (!signatario || bloqueadoRevisor) && (
              <Button
                variante="primary"
                icone={<Hourglass className="h-4 w-4" />}
                onClick={aoEnviarRevisao}
                disabled={!pronto || salvando}
              >
                Enviar para revisão
              </Button>
            )}
            {status === 'REVISAO' && !signatario && (
              <Button onClick={aoVoltarRascunho} disabled={salvando}>
                Voltar para rascunho
              </Button>
            )}
            {signatario && !bloqueadoRevisor && (
              <Button
                variante="primary"
                icone={emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                disabled={!pronto || salvando || emitindo}
                onClick={async () => {
                  setEmitindo(true)
                  try {
                    await aoEmitir()
                  } finally {
                    setEmitindo(false)
                  }
                }}
                className="sm:ml-auto"
              >
                Emitir certificado
              </Button>
            )}
          </div>
          {status === 'REVISAO' && !signatario && (
            <p className="rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
              Esta calibração está aguardando a revisão de um signatário, que vai conferir e emitir o certificado.
            </p>
          )}
          {bloqueadoRevisor && signatario && (
            <p className="rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
              A empresa exige revisão por outra pessoa: envie para revisão para outro signatário emitir.
            </p>
          )}
          {!signatario && status === 'RASCUNHO' && (
            <p className="text-[13px] text-muted">
              Quem autoriza a emissão é um signatário (marcado pelo administrador em Usuários).
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

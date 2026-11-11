import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Eye,
  FileBadge2,
  Hourglass,
  Loader2,
  Send,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'
import type { Calibracao, NumeroReservado } from '#shared/tipos.ts'
import { dataHora, hojeISO } from '../../lib/format'
import { useSessao } from '../../store/sessao'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { MarcaObrigatorio, Select } from '../ui/Form'
import type { ContextoEtapa } from './contexto'
import { cabecalhoDaRevisao, estadoDaEmissao, motivoDoEnvioDesativado } from './equipe'
import { AvisoFolhasNaoLigadas } from './FolhasNaoLigadas'
import { AvisoItem } from './PainelResultados'

export function EtapaRevisao({
  ctx,
  gravada,
  numeroReservado = null,
  numeroRevisao = null,
  pendencias,
  destinoDe,
  avisos: avisosServidor = [],
  salvando,
  aoVisualizar,
  aoPedirAutorizacao,
  aoVoltarRascunho,
  aoDevolver,
  aoEmitir,
}: {
  ctx: ContextoEtapa
  /** A situação gravada no servidor, com o pedido de autorização e a devolução (se houver). */
  gravada: Pick<Calibracao, 'status' | 'autorizacao' | 'devolucao'>
  /** O nº reservado na impressão da folha de campo (o da etiqueta): o certificado é emitido com ele. */
  numeroReservado?: Pick<NumeroReservado, 'numero' | 'folha'> | null
  /** Correção: o nº com que ela sai (o mesmo do certificado corrigido). */
  numeroRevisao?: string | null
  pendencias: string[]
  /** A etapa de cada pendência (o título dela) e a ida até o campo; null: não é de nenhuma etapa. */
  destinoDe?: (pendencia: string) => { titulo: string; ir: () => void } | null
  /** Do servidor, para conferir sem impedir a emissão (ex.: a folha de campo saiu com outra revisão do POP). */
  avisos?: string[]
  salvando: boolean
  aoVisualizar: () => void
  /** Envia para a autorização do signatário escolhido. */
  aoPedirAutorizacao: (signatarioId: string) => void
  aoVoltarRascunho: () => void
  /** Devolve sem autorizar (pede a nota). */
  aoDevolver: () => void
  aoEmitir: () => void | Promise<void>
}) {
  const { calc, config, f, equipe } = ctx
  const usuario = useSessao((s) => s.usuario)
  const r = calc?.resultado
  const exigir = config.exigirRevisor
  // O técnico da tela (mesmo a troca ainda não gravada: a emissão grava antes) e quem o escolheu, com a situação gravada
  const estado = estadoDaEmissao(
    exigir,
    { ...gravada, tecnicoId: f.tecnicoId, tecnicoDefinidoPorId: ctx.tecnicoDefinidoPorId },
    usuario,
    equipe,
  )
  const { modo, signatarios } = estado
  const pedido = gravada.status === 'REVISAO' ? (gravada.autorizacao ?? null) : null
  const devolucao = gravada.status === 'RASCUNHO' ? (gravada.devolucao ?? null) : null
  const eu = usuario?.id ?? ''
  const [escolha, setEscolha] = useState<string | null>(null)
  // O escolhido na lista, enquanto puder ser escolhido (o técnico pode ter mudado); senão, o sugerido
  const signatarioId = escolha !== null && signatarios.some((u) => u.id === escolha) ? escolha : estado.sugerido
  const escolhido = signatarios.find((u) => u.id === signatarioId)
  const tecnico = equipe.find((u) => u.id === f.tecnicoId)
  // Quem escolheu o técnico de outra pessoa também não autoriza (o aviso de ninguém poder autorizar diz isso)
  const escolheuOutro =
    !!ctx.tecnicoDefinidoPorId &&
    ctx.tecnicoDefinidoPorId !== f.tecnicoId &&
    equipe.some((u) => u.id === ctx.tecnicoDefinidoPorId && u.signatario)
  const [emitindo, setEmitindo] = useState(false)
  // A numeração segue o ano da emissão (hoje). Sem exemplo: com a sequência 1, parecia o nº que o certificado vai receber
  const anoEmissao = hojeISO().slice(0, 4)
  const avisos = [...(r?.avisos ?? []), ...(calc?.comoEncontrado?.avisos ?? [])].filter((a) => a.nivel !== 'info')
  const pronto = pendencias.length === 0
  const bloqueado = !pronto || salvando || emitindo
  // Ao lado de "Enviar para autorização" desativado: o que falta
  const motivoEnvio =
    modo === 'escolher' && signatarioId !== eu
      ? motivoDoEnvioDesativado({ pronto, signatarioId, semSignatarios: signatarios.length === 0, salvando })
      : null
  // Quem vai assinar como "Autorizado por" (ligada) ou quem emite (desligada: fica só registrado). Antes da emissão, o
  // rótulo fica no presente ("Quem autoriza", "Quem emite"): "Autorizado por" pareceria já autorizado
  const quemAutoriza =
    modo === 'emitir' || modo === 'autorizar'
      ? (usuario?.nome ?? '—')
      : modo === 'aguardando'
        ? (pedido?.signatarioNome ?? 'Um signatário')
        : (escolhido?.nome ?? '—')
  // O alto da etapa diz o que quem está usando pode fazer (emitir, autorizar, enviar ou só aguardar)
  const cabecalho = cabecalhoDaRevisao({
    modo,
    pronto,
    autorizaVoce: !!signatarioId && signatarioId === eu,
    aguardandoDe: pedido?.signatarioNome || null,
    irParaItens: !!destinoDe,
  })
  const emitir = async () => {
    setEmitindo(true)
    try {
      await aoEmitir()
    } finally {
      setEmitindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icone={
            !pronto ? (
              <CircleAlert className="h-4 w-4 text-warning" />
            ) : cabecalho.aguardando ? (
              <Hourglass className="h-4 w-4 text-info" />
            ) : (
              <CircleCheck className="h-4 w-4 text-success" />
            )
          }
          titulo={cabecalho.titulo}
          descricao={cabecalho.descricao}
        />
        {!pronto && (
          <ul className="flex flex-col gap-2 px-5 pb-5">
            {pendencias.map((p) => {
              // Cada pendência leva à etapa dela e, quando dá, ao campo
              const destino = destinoDe?.(p) ?? null
              return (
                <li key={p}>
                  {destino ? (
                    <button
                      type="button"
                      onClick={destino.ir}
                      title={`Ir para ${destino.titulo}`}
                      className="group flex w-full cursor-pointer items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-left text-[13px] font-medium text-warning transition-[filter] hover:brightness-[0.97] dark:hover:brightness-125"
                    >
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">{p}</span>
                      <span className="mt-px inline-flex shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap underline-offset-2 group-hover:underline max-sm:hidden">
                        {destino.titulo}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 sm:hidden" />
                    </button>
                  ) : (
                    <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] font-medium text-warning">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      {p}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {/* A folha do cliente ainda não ligada: se foi ela a usada, o nº da etiqueta é o dela (não impede a emissão) */}
        <AvisoFolhasNaoLigadas folhas={ctx.folhasNaoLigadas} aoLigar={ctx.vincularFolha} className="mx-5 mb-5" />
        {avisosServidor.length > 0 && (
          <div className="mx-5 mb-5 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-warning">
            <p className="mb-2 text-xs font-semibold">Confira antes de emitir (não impede a emissão)</p>
            <ul className="flex flex-col gap-1.5">
              {avisosServidor.map((a) => (
                <li key={a} className="flex items-start gap-2 text-[13px] font-medium">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
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
        <CardHeader icone={<FileBadge2 className="h-4 w-4" />} titulo={exigir ? 'Autorização e emissão' : 'Emissão'} />
        <div className="flex flex-col gap-4 px-5 pb-5">
          {devolucao && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              <Undo2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-semibold">
                  Devolvida por {devolucao.por} em {dataHora(devolucao.em)}:
                </span>{' '}
                {devolucao.nota}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2/60 px-4 py-3">
              <p className="text-xs text-muted">Executado por</p>
              <p className="mt-0.5 font-medium text-ink">{tecnico?.nome ?? '—'}</p>
            </div>
            {modo === 'escolher' ? (
              <label className="flex flex-col rounded-xl bg-surface-2/60 px-4 py-3">
                {/* Obrigatório para enviar (a marca das etapas) */}
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  Quem autoriza
                  <MarcaObrigatorio />
                </span>
                <Select
                  className="mt-1"
                  value={signatarioId}
                  onChange={(e) => setEscolha(e.target.value)}
                  disabled={signatarios.length === 0}
                  aria-label="Quem autoriza"
                >
                  <option value="">{signatarios.length ? 'Escolha o signatário…' : 'Nenhum signatário'}</option>
                  {signatarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id === eu ? `${u.nome} (você)` : u.nome}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <div className="rounded-xl bg-surface-2/60 px-4 py-3">
                <p className="text-xs text-muted">{exigir ? 'Quem autoriza' : 'Quem emite'}</p>
                <p className="mt-0.5 font-medium text-ink">{quemAutoriza}</p>
              </div>
            )}
            <div className="rounded-xl bg-surface-2/60 px-4 py-3">
              <p className="text-xs text-muted">Número</p>
              {numeroReservado ? (
                <p className="mt-0.5 font-medium text-ink">
                  <span className="tnum">{numeroReservado.numero}</span>{' '}
                  <span className="font-normal text-muted">
                    (reservado na folha <span className="tnum whitespace-nowrap">{numeroReservado.folha}</span>)
                  </span>
                </p>
              ) : numeroRevisao ? (
                <p className="mt-0.5 font-medium text-ink">
                  <span className="tnum">{numeroRevisao}</span>{' '}
                  <span className="font-normal text-muted">(o mesmo do certificado corrigido)</span>
                </p>
              ) : f.substituiId ? (
                // Correção sem o nº previsto: o certificado corrigido não está mais emitido (a pendência diz a saída)
                <p className="mt-0.5 font-medium text-ink">Não sai: o certificado corrigido não está mais emitido</p>
              ) : (
                <p className="mt-0.5 font-medium text-ink">
                  Gerado na emissão: <span className="font-normal text-muted">o próximo da sequência de {anoEmissao}</span>
                </p>
              )}
            </div>
          </div>

          <p className="-mt-1 text-[13px] text-muted">
            {exigir
              ? 'O certificado sai com duas assinaturas: a de quem executou e a de quem autorizou.'
              : 'O certificado sai só com a assinatura de quem executou.'}
            {f.substituiId &&
              ' A correção sai com o mesmo número e a data de emissão nova; a versão anterior e o motivo ficam só no sistema.'}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button icone={<Eye className="h-4 w-4" />} onClick={aoVisualizar}>
              Ver prévia do PDF
            </Button>
            {gravada.status === 'REVISAO' && modo !== 'autorizar' && (
              <Button onClick={aoVoltarRascunho} disabled={salvando}>
                Voltar para rascunho
              </Button>
            )}
            {modo === 'autorizar' && estado.podeDevolver && (
              <Button icone={<Undo2 className="h-4 w-4" />} onClick={aoDevolver} disabled={salvando || emitindo}>
                Devolver
              </Button>
            )}
            {modo === 'emitir' && (
              <Button
                variante="primary"
                icone={emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                disabled={bloqueado}
                onClick={() => void emitir()}
                className="sm:ml-auto"
              >
                Emitir certificado
              </Button>
            )}
            {(modo === 'autorizar' || (modo === 'escolher' && !!signatarioId && signatarioId === eu)) && (
              <Button
                variante="primary"
                icone={emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                disabled={bloqueado}
                onClick={() => void emitir()}
                className="sm:ml-auto"
              >
                Autorizar e emitir
              </Button>
            )}
            {modo === 'escolher' && signatarioId !== eu && (
              <div className="flex flex-col gap-1.5 sm:ml-auto sm:flex-row sm:items-center sm:gap-3">
                {motivoEnvio && <p className="text-[13px] text-muted sm:order-first sm:text-right">{motivoEnvio}</p>}
                <Button
                  variante="primary"
                  icone={<Send className="h-4 w-4" />}
                  disabled={bloqueado || !signatarioId}
                  onClick={() => aoPedirAutorizacao(signatarioId)}
                >
                  Enviar para autorização
                </Button>
              </div>
            )}
          </div>

          {modo === 'escolher' && signatarios.length === 0 && (
            <p className="rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              {escolheuOutro
                ? 'Ninguém pode autorizar esta calibração: quem executou e quem escolheu o técnico não autorizam, e não há outro signatário.'
                : 'Ninguém pode autorizar esta calibração: quem executou não autoriza a própria, e não há outro signatário.'}{' '}
              Peça ao administrador para marcar um signatário em Usuários.
            </p>
          )}
          {/* O signatário que não pode autorizar esta (executou, ou escolheu o técnico de outra pessoa): por quê */}
          {modo === 'escolher' && usuario?.signatario && estado.impedimento && signatarios.length > 0 && (
            <p className="text-[13px] text-muted">{estado.impedimento}</p>
          )}
          {modo === 'escolher' && escolhido && signatarioId !== eu && (
            <p className="text-[13px] text-muted">
              {escolhido.nome} recebe o pedido, revisa e autoriza a emissão. Até lá, a calibração fica aguardando.
            </p>
          )}
          {modo === 'escolher' && escolhido && signatarioId === eu && (
            <p className="text-[13px] text-muted">
              Você autoriza como signatário: o certificado sai com a sua assinatura em “Autorizado por”.
            </p>
          )}
          {modo === 'autorizar' && (
            <p className="rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
              {pedido
                ? `${pedido.por} pediu a sua autorização em ${dataHora(pedido.em)}. Confira os dados e a prévia; se precisar, corrija a digitação antes de autorizar.`
                : 'Enviada para revisão antes da atualização do sistema: qualquer signatário que não seja o técnico pode autorizar.'}
            </p>
          )}
          {modo === 'aguardando' && pedido && (
            <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {pedido.signatarioId === eu
                  ? estado.impedimento
                  : `Aguardando a autorização de ${pedido.signatarioNome} (pedida por ${pedido.por} em ${dataHora(pedido.em)}).`}{' '}
                Para corrigir ou escolher outro signatário, volte para rascunho.
              </span>
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

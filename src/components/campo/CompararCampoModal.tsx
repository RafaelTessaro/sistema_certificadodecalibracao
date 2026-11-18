// "Comparar com o campo" (piloto: o papel é o registro original) e "Puxar dados do campo" (o registro original é o
// celular), na calibração. A tabela Campo | Celular | Rascunho, calculada aqui com shared/campo/importar.ts sobre o
// rascunho da tela (o servidor recalcula com o gravado e nunca confia nesta prévia): o que é igual fica escondido ("38
// iguais"), as diferenças em destaque. No piloto, nada vai para o rascunho e a observação é opcional. Com o celular, cada
// diferença escolhe o que fica (o do celular vem marcado); o rascunho sem leituras recebe tudo, com o resumo ("47
// leituras, 6 horários, 2 anotações"). As anotações do técnico aparecem ao lado, nunca vão sozinhas para o certificado.

import { ArrowDownToLine, Eye, EyeOff, GitCompareArrows, Loader2, StickyNote, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  aplicarDoCampo,
  type ComparacaoCampo,
  type DiferencaCampo,
  diferencasDoCampo,
  type EscolhaCampo,
  type EscolhasCampo,
} from '#shared/campo/importar.ts'
import type { RegistroOriginal } from '#shared/campo/tipos.ts'
import { ROTULO_TIPO_ANOTACAO } from '#shared/campo/tipos.ts'
import type { Balanca, Calibracao, CalibracaoInput, RegistroCampoDetalhe } from '#shared/tipos.ts'
import { api, ErroApi } from '../../lib/api'
import { contagemDoRegistro, textoContagem, textoIguais, TITULO_GRUPO } from '../../lib/campo'
import { cn } from '../../lib/cn'
import { useTempoReal } from '../../store/tempoReal'
import { avisarErro, toast } from '../../store/ui'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Field, Textarea } from '../ui/Form'
import { Modal } from '../ui/Modal'

const ROTULO_SITUACAO: Partial<Record<DiferencaCampo['situacao'], { rotulo: string; tom: 'warning' | 'info' | 'neutral' }>> = {
  DIFERENTE: { rotulo: 'diferente', tom: 'warning' },
  VAZIO_NO_RASCUNHO: { rotulo: 'vazio no rascunho', tom: 'info' },
  VAZIO_NO_CELULAR: { rotulo: 'vazio no celular', tom: 'neutral' },
  SO_NO_CELULAR: { rotulo: 'do celular, sem par', tom: 'warning' },
  SO_NO_RASCUNHO: { rotulo: 'só no rascunho', tom: 'neutral' },
}

export function CompararCampoModal({
  aberto,
  aoFechar,
  calibracaoId,
  versao,
  rascunho,
  balanca,
  registroId,
  registroOriginal,
  mesesProxima,
  nomes,
  aoPuxar,
  aoComparar,
}: {
  aberto: boolean
  aoFechar: () => void
  calibracaoId: string
  /** A versão gravada (o servidor confere: 409 CONFLITO se outra pessoa mexeu). */
  versao?: number
  /** O rascunho como está na tela (já gravado: o editor grava antes de abrir). */
  rascunho: CalibracaoInput
  balanca: Balanca
  registroId: string
  registroOriginal: RegistroOriginal
  mesesProxima?: number
  /** Os nomes dos usuários pelo id (o técnico do rascunho aparece pelo nome). */
  nomes?: Record<string, string>
  aoPuxar?: (r: { calibracao: Calibracao; pendencias: string[]; avisos: string[]; texto: string }) => void
  aoComparar?: () => void
}) {
  const puxar = registroOriginal === 'CELULAR'
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="max-w-5xl"
      icone={puxar ? <ArrowDownToLine className="h-5 w-5" /> : <GitCompareArrows className="h-5 w-5" />}
      titulo={puxar ? 'Puxar dados do campo' : 'Comparar com o campo'}
      descricao={
        puxar
          ? 'O que o técnico anotou no celular vai para o rascunho. Em cada diferença, escolha o que fica: o do celular vem marcado.'
          : 'Piloto: a folha de papel é o registro original. A comparação fica registrada e nada é escrito no rascunho.'
      }
    >
      {aberto && (
        <Conteudo
          calibracaoId={calibracaoId}
          versao={versao}
          rascunho={rascunho}
          balanca={balanca}
          registroId={registroId}
          puxar={puxar}
          mesesProxima={mesesProxima}
          nomes={nomes}
          aoFechar={aoFechar}
          aoPuxar={aoPuxar}
          aoComparar={aoComparar}
        />
      )}
    </Modal>
  )
}

function Conteudo({
  calibracaoId,
  versao,
  rascunho,
  balanca,
  registroId,
  puxar,
  mesesProxima,
  nomes,
  aoFechar,
  aoPuxar,
  aoComparar,
}: {
  calibracaoId: string
  versao?: number
  rascunho: CalibracaoInput
  balanca: Balanca
  registroId: string
  puxar: boolean
  mesesProxima?: number
  nomes?: Record<string, string>
  aoFechar: () => void
  aoPuxar?: (r: { calibracao: Calibracao; pendencias: string[]; avisos: string[]; texto: string }) => void
  aoComparar?: () => void
}) {
  const [d, setD] = useState<RegistroCampoDetalhe | null>(null)
  const [erro, setErro] = useState('')
  const [verIguais, setVerIguais] = useState(false)
  const [escolhas, setEscolhas] = useState<EscolhasCampo>({})
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let valendo = true
    api.registroCampo(registroId).then(
      (r) => valendo && setD(r),
      (e: unknown) => valendo && setErro(e instanceof Error ? e.message : 'Erro inesperado.'),
    )
    return () => {
      valendo = false
    }
  }, [registroId])

  const opcoes = useMemo(() => ({ unidadeAtual: balanca.unidade, mesesProxima, nomes }), [balanca.unidade, mesesProxima, nomes])
  const calculo = useMemo((): { comparacao: ComparacaoCampo | null; problema: string } => {
    if (!d) return { comparacao: null, problema: '' }
    try {
      return { comparacao: diferencasDoCampo(rascunho, d.conteudo, d.pacote, opcoes), problema: '' }
    } catch (e) {
      return {
        comparacao: null,
        problema: `O registro chegou com problema de formato e não dá para comparar (${e instanceof Error ? e.message : String(e)}).`,
      }
    }
  }, [d, rascunho, opcoes])
  const { comparacao, problema } = calculo
  // A prévia do que fica no rascunho (o servidor recalcula com o gravado)
  const previa = useMemo(() => {
    if (!d || !comparacao || !puxar) return ''
    try {
      return aplicarDoCampo(rascunho, d.conteudo, d.pacote, escolhas, opcoes).resumo.texto
    } catch {
      return ''
    }
  }, [d, comparacao, puxar, rascunho, escolhas, opcoes])

  if (erro) return <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{erro}</p>
  if (!d)
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando o registro do celular…
      </div>
    )

  const diferencas = comparacao?.itens.filter((x) => x.situacao !== 'IGUAL') ?? []
  const visiveis = comparacao ? comparacao.itens.filter((x) => verIguais || x.situacao !== 'IGUAL') : []
  const grupos = [...new Set(visiveis.map((x) => x.grupo))]
  const semLeituras = !!comparacao?.rascunhoSemLeituras
  const escolha = (x: DiferencaCampo): EscolhaCampo => escolhas[x.chave] ?? x.sugestao

  const concluir = async () => {
    setSalvando(true)
    try {
      if (puxar) {
        const r = await api.puxarDoCampo(calibracaoId, { registroId, escolhas, versao })
        useTempoReal.getState().mudou('calibracao')
        toast.sucesso('Dados do campo no rascunho', r.resumo.texto)
        aoPuxar?.({ calibracao: r.calibracao, pendencias: r.pendencias, avisos: r.avisos, texto: r.resumo.texto })
      } else {
        const r = await api.compararComCampo(calibracaoId, registroId, observacao.trim())
        useTempoReal.getState().mudou('calibracao')
        toast.sucesso(
          'Comparação registrada',
          `${textoIguais(r.iguais)}, ${r.diferentes} ${r.diferentes === 1 ? 'diferença' : 'diferenças'}. Nada mudou no rascunho.`,
        )
        aoComparar?.()
      }
      aoFechar()
    } catch (e) {
      avisarErro(puxar ? 'Não foi possível puxar os dados' : 'Não foi possível registrar a comparação', e)
      if (e instanceof ErroApi && e.dados.codigo === 'CONFLITO') aoFechar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {problema && (
        <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {problema}
        </p>
      )}
      {comparacao && comparacao.avisos.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {comparacao.avisos.map((a) => (
            <li key={a} className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      )}

      {comparacao && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2/60 px-4 py-3 text-[13px]">
          {puxar && semLeituras ? (
            <span className="text-ink">
              <b className="font-semibold">O rascunho ainda não tem leituras:</b> tudo o que o técnico anotou vai para ele (
              {textoContagem(contagemDoRegistro(d.conteudo))}).
            </span>
          ) : (
            <span className="text-ink">
              <b className="font-semibold">
                {diferencas.length} {diferencas.length === 1 ? 'diferença' : 'diferenças'}
              </b>{' '}
              · {textoIguais(comparacao.iguais)}
            </span>
          )}
          {comparacao.iguais > 0 && (
            <Button
              tamanho="sm"
              variante="ghost"
              className="ml-auto"
              icone={verIguais ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              onClick={() => setVerIguais((v) => !v)}
            >
              {verIguais ? 'Esconder os iguais' : `Mostrar os ${textoIguais(comparacao.iguais)}`}
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {comparacao && visiveis.length === 0 ? (
            <p className="rounded-xl border border-line px-4 py-6 text-center text-[13px] text-muted">
              Tudo igual: o rascunho já tem o mesmo que o celular.
            </p>
          ) : (
            <div className="scroll-fino max-h-[52vh] overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-surface-2 text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Campo</th>
                    <th className="px-3 py-2 font-medium">Celular</th>
                    <th className="px-3 py-2 font-medium">Rascunho</th>
                    {puxar && <th className="px-3 py-2 font-medium">Fica</th>}
                  </tr>
                </thead>
                {grupos.map((g) => (
                  <tbody key={g}>
                    <tr className="border-t border-line bg-surface-2/40">
                      <td colSpan={puxar ? 4 : 3} className="px-3 py-1.5 text-xs font-semibold text-ink-2">
                        {TITULO_GRUPO[g] ?? g}
                      </td>
                    </tr>
                    {visiveis
                      .filter((x) => x.grupo === g)
                      .map((x) => {
                        const s = ROTULO_SITUACAO[x.situacao]
                        const igual = x.situacao === 'IGUAL'
                        return (
                          <tr key={x.chave} className={cn('border-t border-line', !igual && 'bg-warning-soft/40')}>
                            <td className="px-3 py-1.5 align-top">
                              <span className={cn('block', igual ? 'text-muted' : 'font-medium text-ink')}>{x.rotulo}</span>
                              {s && (
                                <Badge tom={s.tom} ponto={false} className="mt-0.5 h-5 px-2 text-[11px]">
                                  {s.rotulo}
                                </Badge>
                              )}
                            </td>
                            <td className={cn('tnum px-3 py-1.5 align-top', igual ? 'text-muted' : 'font-medium text-ink')}>
                              {x.celular || '—'}
                            </td>
                            <td className={cn('tnum px-3 py-1.5 align-top', igual ? 'text-muted' : 'text-ink-2')}>
                              {x.rascunho || '—'}
                            </td>
                            {puxar && (
                              <td className="px-3 py-1.5 align-top">
                                {!igual && (
                                  <EscolhaFica
                                    valor={escolha(x)}
                                    aoMudar={(v) => setEscolhas((e) => ({ ...e, [x.chave]: v }))}
                                    rotulo={x.rotulo}
                                  />
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <StickyNote className="h-3.5 w-3.5" /> Anotações do técnico
            </p>
            {comparacao?.anotacoes.length ? (
              <ul className="flex flex-col gap-2">
                {comparacao.anotacoes.map((a) => (
                  <li key={a.id} className="rounded-xl bg-surface-2/70 px-3 py-2 text-[12.5px]">
                    <span className="text-[11px] font-medium text-muted">
                      {ROTULO_TIPO_ANOTACAO[a.tipo] ?? a.tipo} · passo {a.passo}
                    </span>
                    <span className="mt-0.5 block whitespace-pre-line text-ink">{a.texto}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-muted">Nenhuma anotação.</p>
            )}
            {!!comparacao?.anotacoes.length && (
              <p className="mt-1.5 text-[11.5px] text-muted">Elas não vão para as observações do certificado: copie se quiser.</p>
            )}
          </div>
          {!!comparacao?.cadastroDiferente.length && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">Dados impressos vistos diferentes</p>
              <ul className="flex flex-col gap-2">
                {comparacao.cadastroDiferente.map((c) => (
                  <li
                    key={c.campo}
                    className={cn(
                      'rounded-xl px-3 py-2 text-[12.5px]',
                      c.metrologico ? 'bg-warning-soft text-warning' : 'bg-surface-2/70 text-ink-2',
                    )}
                  >
                    <span className="block font-medium">
                      {c.rotulo}: <s className="opacity-70">{c.mostrado || '—'}</s>
                      {c.observado ? ` → ${c.observado}` : ''}
                    </span>
                    {c.anotacao && <span className="mt-0.5 block">{c.anotacao}</span>}
                    {c.metrologico && (
                      <span className="mt-0.5 block text-[11.5px]">Cadastro da balança diferente: corrija antes de emitir.</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {!puxar && (
        <Field
          label="Observação"
          htmlFor="comparar-observacao"
          opcional
          hint="Ex.: erro de digitação no papel; leitura conferida com o técnico."
        >
          <Textarea
            id="comparar-observacao"
            value={observacao}
            maxLength={2000}
            onChange={(e) => setObservacao(e.target.value)}
            className="min-h-[64px]"
          />
        </Field>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center">
        {puxar && previa && <p className="text-[13px] text-muted sm:mr-auto">{previa}</p>}
        <div className="flex flex-wrap justify-end gap-2 sm:ml-auto">
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button
            variante="primary"
            disabled={salvando || !comparacao}
            icone={
              salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : puxar ? (
                <ArrowDownToLine className="h-4 w-4" />
              ) : (
                <GitCompareArrows className="h-4 w-4" />
              )
            }
            onClick={() => void concluir()}
          >
            {puxar ? (semLeituras ? 'Puxar todos os dados' : 'Puxar dados do campo') : 'Registrar comparação'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** "Fica: o do celular / o do rascunho" (dois botões pequenos, em px, como os outros controles). */
function EscolhaFica({ valor, aoMudar, rotulo }: { valor: EscolhaCampo; aoMudar: (v: EscolhaCampo) => void; rotulo: string }) {
  const opcoes: Array<{ v: EscolhaCampo; texto: string }> = [
    { v: 'CELULAR', texto: 'Celular' },
    { v: 'RASCUNHO', texto: 'Rascunho' },
  ]
  return (
    <div role="radiogroup" aria-label={`O que fica em ${rotulo}`} className="inline-flex rounded-lg bg-surface-3 p-[2px]">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={valor === o.v}
          onClick={() => aoMudar(o.v)}
          className={cn(
            'h-[24px] cursor-pointer rounded-md px-2 text-[12px] font-medium transition-colors',
            valor === o.v ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

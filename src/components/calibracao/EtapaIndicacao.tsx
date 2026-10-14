import { CircleCheck, CircleX, Layers, Plus, Trash2, TriangleAlert, Truck, Wand2, Weight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cargaDasPecas } from '#shared/calibracao.ts'
import { massaLegivel, METODOS_CARREGAMENTO } from '#shared/dominio.ts'
import { novoId } from '#shared/id.ts'
import { formatarNumero, sugerirPontos } from '#shared/metrologia/index.ts'
import type { ResultadoCalculo, ResultadoPonto } from '#shared/metrologia/tipos.ts'
import type { EnsaioIndicacao, MetodoCarregamento, Padrao, PecaCarga, PontoIndicacao } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Field, Select } from '../ui/Form'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Misc'
import { pecasPara } from './cargas'
import { CampoNumero } from './CampoNumero'
import type { ContextoEtapa } from './contexto'
import { casasDe } from './util'

type Aba = 'depois' | 'antes'

export function EtapaIndicacao(ctx: ContextoEtapa) {
  const { f, alterar, balanca, calc } = ctx
  const temAntes = f.ajuste.realizado !== 'NAO' && !!f.comoEncontrado
  const [aba, setAba] = useState<Aba>('depois')
  const abaAtual: Aba = temAntes ? aba : 'depois'
  const ensaio = abaAtual === 'antes' ? f.comoEncontrado! : f.indicacao
  const resultado = abaAtual === 'antes' ? calc?.comoEncontrado : calc?.resultado
  const setEnsaio = (mudar: (e: EnsaioIndicacao) => EnsaioIndicacao) =>
    alterar((s) =>
      abaAtual === 'antes' && s.comoEncontrado
        ? { ...s, comoEncontrado: mudar(s.comoEncontrado) }
        : { ...s, indicacao: mudar(s.indicacao) },
    )
  const rodoviaria = balanca.receptor === 'RODOVIARIA' || balanca.tipo === 'RODOVIARIA' || balanca.tipo === 'FERROVIARIA'

  return (
    <div className="flex flex-col gap-6">
      {temAntes && (
        <Segmented
          valor={abaAtual}
          aoMudar={setAba}
          opcoes={[
            { valor: 'antes', label: 'Antes do ajuste (como encontrado)' },
            { valor: 'depois', label: 'Depois do ajuste' },
          ]}
        />
      )}
      <TabelaPontos
        key={abaAtual}
        ctx={ctx}
        ensaio={ensaio}
        setEnsaio={setEnsaio}
        resultado={resultado ?? null}
        titulo={abaAtual === 'antes' ? 'Erro de indicação antes do ajuste' : 'Erro de indicação'}
        grupo={`ind-${abaAtual}`}
      />
      {abaAtual === 'depois' && (rodoviaria || f.indicacao.substituicao.ativa) && <Substituicao ctx={ctx} />}
      {abaAtual === 'depois' && (
        <Card>
          <CardHeader titulo="Retorno ao zero" descricao="Indicação depois de retirar toda a carga (opcional)" />
          <div className="px-5 pb-5">
            <CampoNumero
              className="w-48"
              valor={f.indicacao.retornoZero}
              aoMudar={(v) => alterar((s) => ({ ...s, indicacao: { ...s.indicacao, retornoZero: v } }))}
              unidade={balanca.unidade}
              aria-label="Indicação no retorno ao zero"
            />
            {resultado?.erroRetornoZero !== null && resultado?.erroRetornoZero !== undefined && resultado.erroRetornoZero !== 0 && (
              <p className="mt-2 text-[13px] text-warning">
                Não voltou exatamente a zero: {formatarNumero(resultado.erroRetornoZero, casasDe(balanca))} {balanca.unidade}.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

function TabelaPontos({
  ctx,
  ensaio,
  setEnsaio,
  resultado,
  titulo,
  grupo,
}: {
  ctx: ContextoEtapa
  ensaio: EnsaioIndicacao
  setEnsaio: (m: (e: EnsaioIndicacao) => EnsaioIndicacao) => void
  resultado: ResultadoCalculo | null
  titulo: string
  grupo: string
}) {
  const { balanca, selecionados, f } = ctx
  const u = balanca.unidade
  const casas = casasDe(balanca)
  const pesos = selecionados.filter((p) => p.tipo === 'PESOS')
  const [editandoPecas, setEditandoPecas] = useState<PontoIndicacao | null>(null)
  const porId = useMemo(() => new Map((resultado?.pontos ?? []).map((p) => [p.id, p])), [resultado])
  const decrescente = ensaio.metodo === 'CRESCENTE_DECRESCENTE'
  const soDecrescente = ensaio.metodo === 'DECRESCENTE'
  const comConformidade = f.conformidade.solicitada
  const substituicao = ensaio.substituicao.ativa

  const setPontos = (mudar: (l: PontoIndicacao[]) => PontoIndicacao[]) => setEnsaio((e) => ({ ...e, pontos: mudar(e.pontos) }))
  const setPonto = (id: string, mudar: (p: PontoIndicacao) => PontoIndicacao) => setPontos((l) => l.map((p) => (p.id === id ? mudar(p) : p)))
  const mudarCarga = (p: PontoIndicacao, carga: number | null) =>
    setPonto(p.id, (x) => ({
      ...x,
      carga: carga ?? 0,
      pecas: x.pecasManuais ? x.pecas : carga ? pecasPara(carga, balanca, pesos).pecas : [],
    }))
  const sugerir = () => {
    const cargas = sugerirPontos(balanca)
    setEnsaio((e) => ({
      ...e,
      pontos: cargas.map((c) => ({
        id: novoId(),
        carga: c,
        pecas: c ? pecasPara(c, balanca, pesos).pecas : [],
        pecasManuais: false,
        crescente: c === 0 ? 0 : null,
        decrescente: c === 0 ? 0 : null,
        nivelSubstituicao: 0,
      })),
    }))
  }
  const adicionar = () =>
    setPontos((l) => [
      ...l,
      { id: novoId(), carga: 0, pecas: [], pecasManuais: false, crescente: null, decrescente: null, nivelSubstituicao: 0 },
    ])

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icone={<Weight className="h-4 w-4" />}
        titulo={titulo}
        descricao="Aplique as cargas com os pesos padrão e anote a indicação de cada ponto. O erro e a incerteza saem na hora."
        acoes={
          <div className="flex gap-2">
            <Button tamanho="sm" icone={<Wand2 className="h-3.5 w-3.5" />} onClick={sugerir}>
              {ensaio.pontos.length ? 'Refazer pontos' : 'Sugerir pontos'}
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-end">
        <Field label="Como as cargas foram aplicadas" htmlFor={`${grupo}-metodo`} className="sm:w-80">
          <Select
            id={`${grupo}-metodo`}
            value={ensaio.metodo}
            onChange={(e) => setEnsaio((x) => ({ ...x, metodo: e.target.value as MetodoCarregamento }))}
          >
            {(Object.keys(METODOS_CARREGAMENTO) as MetodoCarregamento[]).map((m) => (
              <option key={m} value={m}>
                {METODOS_CARREGAMENTO[m].label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="pb-2.5 text-[13px] text-muted">{METODOS_CARREGAMENTO[ensaio.metodo].descricao}</p>
      </div>

      {pesos.length === 0 && (
        <p className="mx-5 mb-4 flex items-center gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          Escolha os pesos padrão na etapa “Padrões e ambiente” para as cargas serem montadas e rastreadas.
        </p>
      )}

      {ensaio.pontos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border-t border-line px-6 py-10 text-center">
          <p className="max-w-md text-sm text-muted">
            Sugerimos 0, 25 %, 50 %, 75 % e 100 % da capacidade, mais as cargas onde muda o erro máximo admissível da classe.
          </p>
          <Button variante="primary" icone={<Wand2 className="h-4 w-4" />} onClick={sugerir}>
            Sugerir os pontos
          </Button>
        </div>
      ) : (
        <div className="scroll-fino overflow-x-auto border-t border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-surface-2/70 text-left text-xs font-medium text-muted">
                <th className="w-10 px-3 py-2.5 pl-5">#</th>
                <th className="px-3 py-2.5">Carga ({u})</th>
                <th className="px-3 py-2.5">Pesos padrão</th>
                {substituicao && <th className="px-3 py-2.5">Substituições</th>}
                {!soDecrescente && <th className="px-3 py-2.5 text-right">Indicação ↑</th>}
                {(decrescente || soDecrescente) && <th className="px-3 py-2.5 text-right">Indicação ↓</th>}
                <th className="px-3 py-2.5 text-right">Erro</th>
                <th className="px-3 py-2.5 text-right">U</th>
                {comConformidade && <th className="px-3 py-2.5 text-center">EMA</th>}
                <th className="w-10 pr-5" />
              </tr>
            </thead>
            <tbody>
              {ensaio.pontos.map((p, i) => {
                const r = porId.get(p.id)
                const montagem = !p.pecasManuais && p.carga > 0 ? pecasPara(p.carga, balanca, pesos) : null
                const falta = montagem && montagem.falta > 0
                return (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="tnum px-3 py-2.5 pl-5 text-muted">{i + 1}</td>
                    <td className="px-3 py-2">
                      <CampoNumero
                        compacto
                        className="w-24"
                        valor={p.carga}
                        aoMudar={(v) => mudarCarga(p, v)}
                        aria-label={`Carga do ponto ${i + 1}`}
                        grade={{ grupo: `${grupo}-carga`, lin: i, col: 0 }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setEditandoPecas(p)}
                        disabled={!pesos.length || p.carga === 0}
                        className={cn(
                          'flex min-h-9 max-w-[190px] cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent',
                          falta ? 'text-warning' : 'text-ink-2',
                        )}
                        title={`Ver ou trocar os pesos usados nesta carga${p.pecasManuais ? ' (escolhidos à mão)' : ''}`}
                      >
                        <Layers className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span className="line-clamp-2">
                          {p.carga === 0
                            ? 'Sem carga (zero)'
                            : p.pecas.length
                              ? descreverPecas(p.pecas, pesos)
                              : pesos.length
                                ? 'Nenhum peso'
                                : '—'}
                          {falta && ` · faltam ${formatarNumero(montagem!.falta, casas)} ${u}`}
                          {p.pecasManuais && <span className="text-muted"> · à mão</span>}
                        </span>
                      </button>
                    </td>
                    {substituicao && (
                      <td className="px-3 py-2">
                        <Select
                          className="h-9 w-28 text-[13px]"
                          value={p.nivelSubstituicao}
                          onChange={(e) => setPonto(p.id, (x) => ({ ...x, nivelSubstituicao: Number(e.target.value) }))}
                          aria-label="Cargas de substituição por baixo"
                        >
                          {Array.from({ length: ensaio.substituicao.etapas.length + 1 }, (_, n) => (
                            <option key={n} value={n}>
                              {n === 0 ? 'Só pesos' : `${n} subst.`}
                            </option>
                          ))}
                        </Select>
                      </td>
                    )}
                    {!soDecrescente && (
                      <td className="px-3 py-2">
                        <CampoNumero
                          compacto
                          className="ml-auto w-32"
                          valor={p.crescente}
                          aoMudar={(v) => setPonto(p.id, (x) => ({ ...x, crescente: v }))}
                          aria-label={`Indicação crescente do ponto ${i + 1}`}
                          grade={{ grupo, lin: i, col: 1 }}
                          tom={tomLeitura(r, 'crescente')}
                          unidade={u}
                        />
                      </td>
                    )}
                    {(decrescente || soDecrescente) && (
                      <td className="px-3 py-2">
                        <CampoNumero
                          compacto
                          className="ml-auto w-32"
                          valor={p.decrescente}
                          aoMudar={(v) => setPonto(p.id, (x) => ({ ...x, decrescente: v }))}
                          aria-label={`Indicação decrescente do ponto ${i + 1}`}
                          // Na descida, a ordem natural é do último ponto para o primeiro
                          grade={{ grupo, lin: ensaio.pontos.length - i, col: 2 }}
                          tom={tomLeitura(r, 'decrescente')}
                          unidade={u}
                        />
                      </td>
                    )}
                    <td className="tnum px-3 py-2 text-right whitespace-nowrap text-ink">
                      {r ? <ErroPonto r={r} metodo={ensaio.metodo} histerese={f.opcoes.histerese} /> : '—'}
                    </td>
                    <td className="tnum px-3 py-2 text-right whitespace-nowrap text-ink-2">
                      {r?.texto.U ? (
                        <div className="flex flex-col items-end leading-tight">
                          <span className="pt-0.5">{r.texto.U}</span>
                          <span className="text-[11px] text-muted">k = {r.texto.k}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    {comConformidade && (
                      <td className="px-3 py-2.5 text-center">
                        {r?.conformidade ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs font-medium',
                              r.conformidade === 'CONFORME' ? 'text-success' : 'text-danger',
                            )}
                            title={`EMA ±${r.texto.ema} ${u}`}
                          >
                            {r.conformidade === 'CONFORME' ? <CircleCheck className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}±{r.texto.ema}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-5">
                      <Button
                        variante="ghost"
                        tamanho="icon-sm"
                        aria-label={`Remover o ponto ${i + 1}`}
                        onClick={() => setPontos((l) => l.filter((x) => x.id !== p.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {ensaio.pontos.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <Button variante="ghost" tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={adicionar} disabled={ensaio.pontos.length >= 40}>
            Adicionar ponto
          </Button>
          <p className="hidden text-xs text-muted sm:block">Enter desce para a próxima leitura · ↑ ↓ mudam de linha</p>
        </div>
      )}

      <PecasModal
        ponto={editandoPecas}
        pesos={pesos}
        unidade={u}
        aoFechar={() => setEditandoPecas(null)}
        aoSalvar={(pecas, manual) => {
          if (!editandoPecas) return
          const id = editandoPecas.id
          setPonto(id, (x) => ({
            ...x,
            pecasManuais: manual,
            pecas: manual ? pecas : x.carga ? pecasPara(x.carga, balanca, pesos).pecas : [],
          }))
          setEditandoPecas(null)
        }}
      />
    </Card>
  )
}

/** Erro da linha: subida e descida separados ("↑ 5,0 · ↓ 10") ou o da média. */
/** Erro do ponto: a média, ou o da subida e o da descida um embaixo do outro. */
function ErroPonto({ r, metodo, histerese }: { r: ResultadoPonto; metodo: MetodoCarregamento; histerese: 'SEPARADO' | 'MEDIA' }) {
  if (histerese === 'MEDIA' && r.media) return <span className="pt-0.5">{r.texto.erroMedio}</span>
  const sobe = r.crescente ? r.texto.erroCrescente : ''
  const desce = r.decrescente ? r.texto.erroDecrescente : ''
  if (metodo === 'CRESCENTE_DECRESCENTE' && sobe && desce)
    return (
      <div className="flex flex-col items-end leading-tight">
        <span className="pt-0.5">
          {sobe} <span className="text-[11px] text-muted">↑</span>
        </span>
        <span>
          {desce} <span className="text-[11px] text-muted">↓</span>
        </span>
      </div>
    )
  return <span className="pt-0.5">{sobe || desce || '—'}</span>
}

function tomLeitura(r: ResultadoPonto | undefined, lado: 'crescente' | 'decrescente'): 'normal' | 'erro' | 'atencao' {
  const o = r?.[lado]
  if (!r || !o) return 'normal'
  // Leitura muito longe da carga: provável erro de digitação (vírgula esquecida, outra unidade)
  if (r.carga > 0 && Math.abs(o.erro) > 0.1 * r.carga) return 'erro'
  if (r.conformidade === 'NAO_CONFORME') return 'atencao'
  return 'normal'
}

/** "20 kg + 10 kg + 5 kg" (agrupa iguais: "2 × 5 kg"). */
export function descreverPecas(pecas: PecaCarga[], padroes: Padrao[]): string {
  const porId = new Map(padroes.flatMap((p) => p.pesos.map((w) => [`${p.id}:${w.id}`, w.nominal])))
  const grupos = new Map<number, number>()
  for (const x of pecas) {
    const g = porId.get(`${x.padraoId}:${x.pesoId}`)
    if (g !== undefined) grupos.set(g, (grupos.get(g) ?? 0) + x.quantidade)
  }
  return [...grupos.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([g, n]) => `${n > 1 ? `${n} × ` : ''}${massaLegivel(g)}`)
    .join(' + ')
}

/** Escolha manual das peças de um ponto. */
function PecasModal({
  ponto,
  pesos,
  unidade,
  aoFechar,
  aoSalvar,
}: {
  ponto: PontoIndicacao | null
  pesos: Padrao[]
  unidade: string
  aoFechar: () => void
  aoSalvar: (pecas: PecaCarga[], manual: boolean) => void
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [aberto, setAberto] = useState<string | null>(null)
  if (ponto && aberto !== ponto.id) {
    setAberto(ponto.id)
    setMarcados(new Set(ponto.pecas.map((x) => `${x.padraoId}:${x.pesoId}`)))
  }
  if (!ponto && aberto) setAberto(null)
  const pecas: PecaCarga[] = [...marcados].map((k) => {
    const [padraoId, pesoId] = k.split(':')
    return { padraoId, pesoId, quantidade: 1 }
  })
  const total = cargaDasPecas(pecas, pesos, unidade as 'kg')
  return (
    <Modal
      aberto={!!ponto}
      aoFechar={aoFechar}
      largura="max-w-xl"
      icone={<Layers className="h-5 w-5" />}
      titulo="Pesos usados nesta carga"
      descricao={ponto ? `Carga de ${String(ponto.carga).replace('.', ',')} ${unidade}. Marque as peças colocadas na balança.` : undefined}
      rodape={
        <>
          <Button variante="ghost" onClick={() => aoSalvar([], false)}>
            Montar automaticamente
          </Button>
          <Button variante="primary" onClick={() => aoSalvar(pecas, true)}>
            Usar estas peças
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {pesos.map((p) => (
          <div key={p.id}>
            <p className="mb-2 text-[13px] font-semibold text-ink">
              {p.identificacao} <span className="font-normal text-muted">· {p.classe}</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {p.pesos.map((w) => {
                const k = `${p.id}:${w.id}`
                const ativo = marcados.has(k)
                return (
                  <label
                    key={w.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                      ativo ? 'border-brand bg-brand-soft text-ink' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={() =>
                        setMarcados((s) => {
                          const n = new Set(s)
                          if (n.has(k)) n.delete(k)
                          else n.add(k)
                          return n
                        })
                      }
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                    <span className="tnum font-medium">{massaLegivel(w.nominal)}</span>
                    {w.marca && <span className="truncate text-xs text-muted">{w.marca}</span>}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
        {ponto && (
          <p
            className={cn(
              'tnum rounded-xl px-3.5 py-2.5 text-[13px] font-medium',
              Math.abs(total - ponto.carga) <= ponto.carga * 1e-9 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
            )}
          >
            Soma das peças: {String(total).replace('.', ',')} {unidade}
            {Math.abs(total - ponto.carga) > ponto.carga * 1e-9 && ` (a carga do ponto é ${String(ponto.carga).replace('.', ',')} ${unidade})`}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Cargas de substituição (balanças rodoviárias): pesos padrão + material de substituição em etapas. */
function Substituicao({ ctx }: { ctx: ContextoEtapa }) {
  const { f, alterar, balanca, selecionados } = ctx
  const sub = f.indicacao.substituicao
  const u = balanca.unidade
  const pesos = selecionados.filter((p) => p.tipo === 'PESOS')
  const cargaPadroes = cargaDasPecas(sub.pecas, pesos, u)
  const set = (mudar: (s: typeof sub) => typeof sub) =>
    alterar((x) => ({ ...x, indicacao: { ...x.indicacao, substituicao: mudar(x.indicacao.substituicao) } }))
  return (
    <Card>
      <CardHeader
        icone={<Truck className="h-4 w-4" />}
        titulo="Cargas de substituição"
        descricao="Para balanças grandes: os pesos padrão são trocados por material (caminhão, lastro) que dá a mesma indicação, em etapas."
        acoes={
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
            <input
              type="checkbox"
              checked={sub.ativa}
              onChange={(e) => set((s) => ({ ...s, ativa: e.target.checked, etapas: s.etapas.length ? s.etapas : [{ leituraPadroes: null, leituraSubstituicao: null }] }))}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Usar substituição
          </label>
        }
      />
      {sub.ativa && (
        <div className="flex flex-col gap-4 px-5 pb-5">
          <Field
            label="Carga de pesos padrão usada em cada etapa"
            htmlFor="sub-carga"
            hint={pesos.length ? `Montada com os pesos escolhidos: ${descreverPecas(sub.pecas, pesos) || '—'}` : 'Escolha os pesos padrão primeiro.'}
            className="sm:w-80"
          >
            <CampoNumero
              id="sub-carga"
              valor={cargaPadroes || null}
              aoMudar={(v) => set((s) => ({ ...s, pecas: v ? pecasPara(v, balanca, pesos).pecas : [] }))}
              unidade={u}
            />
          </Field>
          <table className="w-full max-w-2xl text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Etapa</th>
                <th className="pb-2 text-right font-medium">Indicação com os pesos</th>
                <th className="pb-2 text-right font-medium">Indicação com a substituição</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {sub.etapas.map((e, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-2 text-ink-2">{i + 1}ª substituição</td>
                  <td className="py-2 pl-2">
                    <CampoNumero
                      compacto
                      className="ml-auto w-40"
                      valor={e.leituraPadroes}
                      aoMudar={(v) => set((s) => ({ ...s, etapas: s.etapas.map((x, j) => (j === i ? { ...x, leituraPadroes: v } : x)) }))}
                      grade={{ grupo: 'sub', lin: i, col: 0 }}
                      unidade={u}
                    />
                  </td>
                  <td className="py-2 pl-2">
                    <CampoNumero
                      compacto
                      className="ml-auto w-40"
                      valor={e.leituraSubstituicao}
                      aoMudar={(v) => set((s) => ({ ...s, etapas: s.etapas.map((x, j) => (j === i ? { ...x, leituraSubstituicao: v } : x)) }))}
                      grade={{ grupo: 'sub', lin: i, col: 1 }}
                      unidade={u}
                    />
                  </td>
                  <td className="py-2 pl-2">
                    <Button
                      variante="ghost"
                      tamanho="icon-sm"
                      aria-label="Remover etapa"
                      onClick={() => set((s) => ({ ...s, etapas: s.etapas.filter((_, j) => j !== i) }))}
                      disabled={sub.etapas.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <Button
              variante="ghost"
              tamanho="sm"
              icone={<Plus className="h-3.5 w-3.5" />}
              onClick={() => set((s) => ({ ...s, etapas: [...s.etapas, { leituraPadroes: null, leituraSubstituicao: null }] }))}
            >
              Outra etapa
            </Button>
          </div>
          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
            Na tabela acima, escolha em “Substituições” quantas etapas de substituição estão por baixo dos pesos em cada ponto. Cada
            etapa soma incerteza; o certificado informa que foram usadas cargas de substituição.
          </p>
        </div>
      )}
    </Card>
  )
}

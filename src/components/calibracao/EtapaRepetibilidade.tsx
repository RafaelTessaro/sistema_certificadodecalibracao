import { Minus, Plus, Repeat, Trash2, Wand2 } from 'lucide-react'
import { novoId } from '#shared/id.ts'
import { formatarNumero, repetibilidadeSugerida } from '#shared/metrologia/index.ts'
import type { EnsaioRepetibilidade } from '#shared/tipos.ts'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Field } from '../ui/Form'
import { CampoNumero } from './CampoNumero'
import type { ContextoEtapa } from './contexto'
import { casasDe, maxDe } from './util'

export function EtapaRepetibilidade({ f, alterar, balanca, calc }: ContextoEtapa) {
  const u = balanca.unidade
  const casas = casasDe(balanca)
  const resultados = new Map((calc?.resultado.repetibilidade ?? []).map((r) => [r.id, r]))
  const setEnsaios = (mudar: (l: EnsaioRepetibilidade[]) => EnsaioRepetibilidade[]) =>
    alterar((s) => ({ ...s, repetibilidade: mudar(s.repetibilidade) }))
  const novo = () => {
    const sug = repetibilidadeSugerida(maxDe(balanca), u)
    setEnsaios((l) => [
      ...l,
      { id: novoId(), carga: sug.carga, leituras: Array.from({ length: Math.max(sug.leituras, 5) }, () => null) },
    ])
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icone={<Repeat className="h-4 w-4" />}
          titulo="Repetibilidade"
          descricao="Coloque a mesma carga várias vezes, conferindo o zero entre uma e outra. Registre cada indicação."
          acoes={
            <Button tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={novo}>
              {f.repetibilidade.length ? 'Outro ensaio' : 'Adicionar ensaio'}
            </Button>
          }
        />
        <div className="px-5 pb-5">
          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
            Use de 50 % a 100 % da capacidade (não precisa ser peso padrão). Faça pelo menos 5 leituras (3 com cargas de 100 kg ou
            mais). Com 10 ou mais leituras a incerteza fica menor (k mais perto de 2).
          </p>
        </div>
      </Card>

      {f.repetibilidade.length === 0 && (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-sm text-muted">Nenhum ensaio de repetibilidade ainda.</p>
          <Button variante="primary" icone={<Wand2 className="h-4 w-4" />} onClick={novo}>
            Começar com a carga sugerida
          </Button>
        </Card>
      )}

      {f.repetibilidade.map((ens, iEns) => {
        const r = resultados.get(ens.id)
        const setEns = (mudar: (e: EnsaioRepetibilidade) => EnsaioRepetibilidade) =>
          setEnsaios((l) => l.map((x) => (x.id === ens.id ? mudar(x) : x)))
        return (
          <Card key={ens.id}>
            <CardHeader
              titulo={f.repetibilidade.length > 1 ? `Ensaio ${iEns + 1}` : 'Leituras'}
              acoes={
                f.repetibilidade.length > 1 && (
                  <Button
                    variante="ghost"
                    tamanho="icon-sm"
                    aria-label="Remover ensaio"
                    onClick={() => setEnsaios((l) => l.filter((x) => x.id !== ens.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )
              }
            />
            <div className="grid grid-cols-1 gap-5 px-5 pb-5 lg:grid-cols-[200px_1fr]">
              <Field label="Carga aplicada" htmlFor={`rep-c-${ens.id}`}>
                <CampoNumero
                  id={`rep-c-${ens.id}`}
                  valor={ens.carga}
                  aoMudar={(v) => setEns((e) => ({ ...e, carga: v ?? 0 }))}
                  unidade={u}
                />
              </Field>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-ink-2">Indicações</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                  {ens.leituras.map((v, i) => (
                    <div key={i} className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[11px] font-medium text-muted">
                        {i + 1}
                      </span>
                      <CampoNumero
                        valor={v}
                        compacto
                        aria-label={`Leitura ${i + 1}`}
                        className="[&_input]:pl-7"
                        aoMudar={(x) => setEns((e) => ({ ...e, leituras: e.leituras.map((y, j) => (j === i ? x : y)) }))}
                        grade={{ grupo: `rep-${ens.id}`, lin: i, col: 0 }}
                        unidade={u}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variante="ghost"
                    tamanho="sm"
                    icone={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setEns((e) => ({ ...e, leituras: [...e.leituras, null] }))}
                    disabled={ens.leituras.length >= 30}
                  >
                    Leitura
                  </Button>
                  <Button
                    variante="ghost"
                    tamanho="sm"
                    icone={<Minus className="h-3.5 w-3.5" />}
                    onClick={() => setEns((e) => ({ ...e, leituras: e.leituras.slice(0, -1) }))}
                    disabled={ens.leituras.length <= 2}
                  >
                    Remover a última
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl border-t border-line bg-line sm:grid-cols-4">
              <Resultado rotulo="Leituras" valor={r ? String(r.n) : '—'} />
              <Resultado rotulo="Média" valor={r ? `${formatarNumero(r.media, casas + 1)} ${u}` : '—'} />
              <Resultado rotulo="Desvio-padrão (s)" valor={r ? `${formatarNumero(r.s, casas + 1)} ${u}` : '—'} destaque />
              <Resultado rotulo="Maior − menor" valor={r ? `${formatarNumero(r.amplitude, casas)} ${u}` : '—'} />
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function Resultado({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="bg-surface-2/60 px-5 py-3">
      <p className="text-xs text-muted">{rotulo}</p>
      <p className={`tnum mt-0.5 text-[15px] font-semibold ${destaque ? 'text-brand-ink' : 'text-ink'}`}>{valor}</p>
    </div>
  )
}

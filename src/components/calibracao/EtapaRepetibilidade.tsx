import { Minus, Plus, Repeat, Trash2, Wand2 } from 'lucide-react'
import { novoId } from '#shared/id.ts'
import { formatarNumero, leituraImplausivel, repetibilidadesSugeridas } from '#shared/metrologia/index.ts'
import type { EnsaioRepetibilidade } from '#shared/tipos.ts'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Field, MarcaObrigatorio, TEXTO_PENDENTE } from '../ui/Form'
import { CampoNumero } from './CampoNumero'
import type { ContextoEtapa } from './contexto'
import { marcasDaEtapa } from './obrigatorios'
import { casasDe, dicaRepetibilidade, gradeRepetibilidade, proximosEnsaiosRepetibilidade } from './util'

export function EtapaRepetibilidade(ctx: ContextoEtapa) {
  const { f, alterar, balanca, calc } = ctx
  // O ensaio é obrigatório para emitir (POP 7.9): a carga e as leituras
  const m = marcasDaEtapa(ctx).marca('repetibilidade')
  const u = balanca.unidade
  const casas = casasDe(balanca)
  const resultados = new Map((calc?.resultado.repetibilidade ?? []).map((r) => [r.id, r]))
  const setEnsaios = (mudar: (l: EnsaioRepetibilidade[]) => EnsaioRepetibilidade[]) =>
    alterar((s) => ({ ...s, repetibilidade: mudar(s.repetibilidade) }))
  // Sem ensaio: os sugeridos (um por intervalo ou faixa de d diferente); depois, o próximo que falta
  const novo = () =>
    setEnsaios((l) => [
      ...l,
      ...proximosEnsaiosRepetibilidade(repetibilidadesSugeridas(balanca, u), l).map((sug) => ({
        id: novoId(),
        carga: sug.carga,
        leituras: Array.from({ length: Math.max(sug.leituras, 5) }, () => null),
      })),
    ])

  return (
    <div className="flex flex-col gap-6">
      <Card id="k-repetibilidade">
        <CardHeader
          icone={<Repeat className="h-4 w-4" />}
          // A marca também sem nenhum ensaio: o ensaio impede a emissão (como "Erro de indicação ●")
          titulo={
            <span className="inline-flex items-center gap-1.5">
              Repetibilidade
              {m.obrigatorio && <MarcaObrigatorio />}
            </span>
          }
          descricao="A mesma carga, várias vezes (POP 7.9). Zere antes de cada vez, coloque a carga no centro e registre a indicação."
          acoes={
            <Button tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={novo}>
              {f.repetibilidade.length ? 'Outro ensaio' : 'Adicionar ensaio'}
            </Button>
          }
        />
        <div className="px-5 pb-5">
          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
            {dicaRepetibilidade(balanca)}{' '}
            {balanca.classe === 'I'
              ? 'Na classe I, faça 10 leituras com uma peça só (POP, Tabela 4).'
              : 'Faça pelo menos 5 leituras (3 com cargas de 100 kg ou mais). Com 10 ou mais leituras a incerteza fica menor (k mais perto de 2).'}
          </p>
        </div>
      </Card>

      {f.repetibilidade.length === 0 && (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-sm text-muted">Nenhum ensaio de repetibilidade ainda.</p>
          {m.pendente && <p className="-mt-1 text-xs font-medium text-warning">{TEXTO_PENDENTE}</p>}
          <Button variante="primary" icone={<Wand2 className="h-4 w-4" />} onClick={novo}>
            Começar com a carga sugerida
          </Button>
        </Card>
      )}

      {f.repetibilidade.map((ens, iEns) => {
        const r = resultados.get(ens.id)
        const setEns = (mudar: (e: EnsaioRepetibilidade) => EnsaioRepetibilidade) =>
          setEnsaios((l) => l.map((x) => (x.id === ens.id ? mudar(x) : x)))
        // Leituras sem a carga (o campo apagado grava 0): não dá para conferi-las, e o ensaio não vale (POP 7.9)
        const semCarga = !(ens.carga > 0) && ens.leituras.some((l) => l !== null)
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
            {/* Carga e leituras com o mesmo rótulo (Field) e a mesma altura de campo: ficam na mesma linha */}
            <div className="grid grid-cols-1 gap-5 px-5 pb-5 lg:grid-cols-[200px_minmax(0,1fr)]">
              <Field
                label="Carga aplicada"
                htmlFor={`rep-c-${ens.id}`}
                erro={semCarga ? 'Informe a carga do ensaio.' : undefined}
                obrigatorio={m.obrigatorio}
              >
                <CampoNumero
                  id={`rep-c-${ens.id}`}
                  valor={ens.carga}
                  aoMudar={(v) => setEns((e) => ({ ...e, carga: v ?? 0 }))}
                  tom={semCarga ? 'erro' : 'normal'}
                  unidade={u}
                />
              </Field>
              <div>
                <Field
                  label="Indicações"
                  htmlFor={`rep-${ens.id}-1`}
                  obrigatorio={m.obrigatorio}
                  pendente={m.pendente}
                  aoSair={m.aoSair}
                >
                  {/* Quantas colunas couberem, cada uma larga o bastante para "160,05 kg" */}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
                    {ens.leituras.map((v, i) => (
                      // O nº da leitura depois do campo e acima dele (z-10): antes, o fundo do campo o cobria
                      <div key={i} className="relative">
                        <CampoNumero
                          id={`rep-${ens.id}-${i + 1}`}
                          valor={v}
                          aria-label={`Leitura ${i + 1}`}
                          className="[&_input]:pl-8"
                          aoMudar={(x) => setEns((e) => ({ ...e, leituras: e.leituras.map((y, j) => (j === i ? x : y)) }))}
                          grade={gradeRepetibilidade(iEns, i)}
                          // Fora do esperado (vírgula esquecida): a mesma regra da pendência do cálculo (sem a carga,
                          // a pendência é a da carga)
                          tom={ens.carga > 0 && leituraImplausivel(v, ens.carga, balanca) ? 'erro' : 'normal'}
                          unidade={u}
                        />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-[11px] font-medium text-muted"
                        >
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </Field>
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
            {/* Sem leituras, nada foi medido: "—", e não 0,0000 (que pareceria um resultado perfeito); o desvio-padrão e
                a amplitude, com 2 leituras ou mais */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl border-t border-line bg-line sm:grid-cols-4">
              <Resultado rotulo="Leituras" valor={r ? String(r.n) : '—'} />
              <Resultado rotulo="Média" valor={r && r.n >= 1 ? `${formatarNumero(r.media, casas + 1)} ${u}` : '—'} />
              <Resultado
                rotulo="Desvio-padrão (s)"
                valor={r && r.n >= 2 ? `${formatarNumero(r.s, casas + 1)} ${u}` : '—'}
                destaque={!!r && r.n >= 2}
              />
              <Resultado rotulo="Maior − menor" valor={r && r.n >= 2 ? `${formatarNumero(r.amplitude, casas)} ${u}` : '—'} />
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

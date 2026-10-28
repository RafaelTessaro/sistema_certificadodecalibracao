import { Crosshair, Wand2 } from 'lucide-react'
import { useEffect } from 'react'
import { METODOS_EXCENTRICIDADE } from '#shared/dominio.ts'
import { cargaExcentricidade, formatarNumero, posicoesExcentricidade } from '#shared/metrologia/index.ts'
import type { MetodoExcentricidade, Receptor } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { Field, Input, Select } from '../ui/Form'
import { CampoNumero } from './CampoNumero'
import type { ContextoEtapa } from './contexto'
import { Resultado } from './EtapaRepetibilidade'
import { casasDe, maxDe } from './util'

export function EtapaExcentricidade({ f, alterar, balanca, calc }: ContextoEtapa) {
  const ecc = f.excentricidade
  const u = balanca.unidade
  const casas = casasDe(balanca)
  const r = calc?.resultado.excentricidade
  const set = (mudar: (e: typeof ecc) => typeof ecc) => alterar((s) => ({ ...s, excentricidade: mudar(s.excentricidade) }))
  const sugerida = cargaExcentricidade(maxDe(balanca), u)
  const posicoesSugeridas = posicoesExcentricidade(balanca.receptor, balanca.apoios)
  const preparar = () =>
    set((e) => ({
      ...e,
      aplicavel: true,
      carga: e.carga || sugerida,
      posicoes: posicoesSugeridas
        .map((rotulo, i) => e.posicoes[i] ?? { rotulo, leitura: null, referencia: null })
        .map((p, i) => ({
          ...p,
          rotulo: posicoesSugeridas[i],
        })),
    }))
  const usaReferencia = ecc.metodo === 3 || ecc.metodo === 4

  // Balança de gancho: a carga se centra sozinha (o ensaio não se aplica)
  const gancho = balanca.receptor === 'GANCHO' && ecc.aplicavel && !ecc.posicoes.length
  useEffect(() => {
    if (gancho)
      set((e) => ({ ...e, aplicavel: false, motivo: e.motivo || 'Balança suspensa (gancho): a carga se centraliza sozinha.' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gancho])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icone={<Crosshair className="h-4 w-4" />}
          titulo="Excentricidade"
          descricao="A mesma carga em posições diferentes do prato ou da plataforma. Mostra quanto a posição muda a indicação."
          acoes={
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
              <input
                type="checkbox"
                checked={ecc.aplicavel}
                onChange={(e) => set((x) => ({ ...x, aplicavel: e.target.checked }))}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Ensaio realizado
            </label>
          }
        />
        {!ecc.aplicavel ? (
          <div className="px-5 pb-5">
            <Field label="Por que o ensaio não foi feito" htmlFor="ecc-motivo" hint="Sai no certificado.">
              <Input
                id="ecc-motivo"
                value={ecc.motivo}
                onChange={(e) => set((x) => ({ ...x, motivo: e.target.value }))}
                placeholder="Ex.: balança suspensa, a carga se centraliza sozinha"
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-3">
            <Field
              label="Carga usada"
              htmlFor="ecc-carga"
              hint={`Sugerida: ${formatarNumero(sugerida, casas)} ${u} (cerca de 1/3 da capacidade)`}
            >
              <CampoNumero
                id="ecc-carga"
                valor={ecc.carga || null}
                aoMudar={(v) => set((x) => ({ ...x, carga: v ?? 0 }))}
                unidade={u}
              />
            </Field>
            <Field label="Como foi feito" htmlFor="ecc-metodo" className="sm:col-span-2">
              <Select
                id="ecc-metodo"
                value={ecc.metodo}
                onChange={(e) => set((x) => ({ ...x, metodo: Number(e.target.value) as MetodoExcentricidade }))}
              >
                {([1, 2, 3, 4] as const).map((m) => (
                  <option key={m} value={m}>
                    {m}. {METODOS_EXCENTRICIDADE[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Card>

      {ecc.aplicavel && (
        <Card>
          <CardHeader
            titulo="Leituras por posição"
            descricao={
              usaReferencia
                ? ecc.metodo === 3
                  ? 'Registre o zero antes de cada posição e a indicação com a carga.'
                  : 'Registre a leitura no centro logo antes de cada posição e a indicação na posição.'
                : 'A posição 1 é a referência: os desvios são calculados em relação a ela.'
            }
            acoes={
              ecc.posicoes.length !== posicoesSugeridas.length && (
                <Button tamanho="sm" icone={<Wand2 className="h-3.5 w-3.5" />} onClick={preparar}>
                  Usar as posições da balança
                </Button>
              )
            }
          />
          {ecc.posicoes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 pb-8 text-center">
              <p className="text-sm text-muted">Prepare as posições conforme o formato do prato/plataforma.</p>
              <Button variante="primary" icone={<Wand2 className="h-4 w-4" />} onClick={preparar}>
                Preparar posições
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 px-5 pb-5 lg:grid-cols-[220px_1fr]">
              <Diagrama receptor={balanca.receptor} n={ecc.posicoes.length} destaque={r?.posicaoMaior ?? -1} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="pb-2 font-medium">Posição</th>
                      {usaReferencia && (
                        <th className="pb-2 text-right font-medium">{ecc.metodo === 3 ? 'Zero antes' : 'Centro antes'}</th>
                      )}
                      <th className="pb-2 text-right font-medium">Indicação</th>
                      <th className="pb-2 text-right font-medium">Desvio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ecc.posicoes.map((p, i) => {
                      const desvio = r?.desvios[i]
                      const maior = r && i === r.posicaoMaior && r.maiorDesvio > 0
                      return (
                        <tr key={i} className="border-t border-line">
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={cn(
                                  'tnum flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold',
                                  maior ? 'bg-warning-soft text-warning' : 'bg-surface-3 text-ink-2',
                                )}
                              >
                                {i + 1}
                              </span>
                              <span className="text-ink-2">{p.rotulo}</span>
                            </span>
                          </td>
                          {usaReferencia && (
                            <td className="py-2 pl-2">
                              <CampoNumero
                                compacto
                                className="ml-auto w-36"
                                valor={p.referencia}
                                aria-label={`Referência da posição ${i + 1}`}
                                aoMudar={(v) =>
                                  set((x) => ({
                                    ...x,
                                    posicoes: x.posicoes.map((y, j) => (j === i ? { ...y, referencia: v } : y)),
                                  }))
                                }
                                grade={{ grupo: 'ecc', lin: i, col: 0 }}
                                unidade={u}
                              />
                            </td>
                          )}
                          <td className="py-2 pl-2">
                            <CampoNumero
                              compacto
                              className="ml-auto w-36"
                              valor={p.leitura}
                              aria-label={`Indicação na posição ${i + 1}`}
                              aoMudar={(v) =>
                                set((x) => ({ ...x, posicoes: x.posicoes.map((y, j) => (j === i ? { ...y, leitura: v } : y)) }))
                              }
                              grade={{ grupo: 'ecc', lin: i, col: 1 }}
                              unidade={u}
                            />
                          </td>
                          <td className={cn('tnum py-2 pl-3 text-right', maior ? 'font-semibold text-warning' : 'text-ink-2')}>
                            {desvio === null || desvio === undefined
                              ? '—'
                              : `${desvio > 0 ? '+' : ''}${formatarNumero(desvio, casas)}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {r && r.aplicavel && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl border-t border-line bg-line">
              <Resultado
                rotulo="Maior desvio"
                valor={r.desvios.filter((d) => d !== null).length >= 2 ? `${formatarNumero(r.maiorDesvio, casas)} ${u}` : '—'}
                destaque
              />
              <Resultado
                rotulo="Na posição"
                valor={r.maiorDesvio > 0 ? `${r.posicaoMaior + 1}. ${ecc.posicoes[r.posicaoMaior]?.rotulo ?? ''}` : '—'}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

/** Desenho das posições: prato retangular, redondo, plataforma com apoios ou rodoviária. */
function Diagrama({ receptor, n, destaque }: { receptor: Receptor; n: number; destaque: number }) {
  const pontos: Array<[number, number]> =
    receptor === 'RETANGULAR'
      ? [
          [50, 50],
          [26, 74],
          [26, 26],
          [74, 26],
          [74, 74],
        ]
      : receptor === 'CIRCULAR'
        ? [
            [50, 50],
            [50, 78],
            [78, 50],
            [50, 22],
            [22, 50],
          ]
        : receptor === 'RODOVIARIA'
          ? [
              [18, 38],
              [50, 38],
              [82, 38],
              [82, 62],
              [50, 62],
              [18, 62],
            ]
          : Array.from({ length: n }, (_, i) => {
              const metade = Math.ceil(n / 2)
              const col = i % metade
              const lin = i < metade ? 0 : 1
              return [metade === 1 ? 50 : 14 + (72 * col) / (metade - 1), lin ? 72 : 28] as [number, number]
            })
  const larga = receptor === 'RODOVIARIA' || receptor === 'APOIOS'
  return (
    <svg
      viewBox={larga ? '0 0 100 100' : '0 0 100 100'}
      className="mx-auto w-full max-w-[220px]"
      role="img"
      aria-label="Posições da carga"
    >
      {receptor === 'CIRCULAR' ? (
        <circle cx="50" cy="50" r="40" fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="1.2" />
      ) : larga ? (
        <rect
          x="6"
          y="20"
          width="88"
          height="60"
          rx="4"
          fill="var(--surface-2)"
          stroke="var(--border-strong)"
          strokeWidth="1.2"
        />
      ) : (
        <rect
          x="10"
          y="10"
          width="80"
          height="80"
          rx="6"
          fill="var(--surface-2)"
          stroke="var(--border-strong)"
          strokeWidth="1.2"
        />
      )}
      {receptor === 'RODOVIARIA' && (
        <>
          <path d="M 12 50 H 88" stroke="var(--border-strong)" strokeDasharray="3 3" strokeWidth="0.8" />
          <path d="M 84 46 L 88 50 L 84 54" fill="none" stroke="var(--muted)" strokeWidth="0.8" />
        </>
      )}
      {pontos.slice(0, Math.max(n, 1)).map(([x, y], i) => (
        <g key={i}>
          <circle
            cx={x}
            cy={y}
            r="7.5"
            fill={i === destaque ? 'var(--warning-dot)' : 'var(--brand)'}
            opacity={i === destaque ? 1 : 0.9}
          />
          <text x={x} y={y + 2.8} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--on-brand)">
            {i + 1}
          </text>
        </g>
      ))}
      <text x="50" y="97" textAnchor="middle" fontSize="6" fill="var(--muted)">
        frente
      </text>
    </svg>
  )
}

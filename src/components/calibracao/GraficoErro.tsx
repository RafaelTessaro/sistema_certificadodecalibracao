import { CartesianGrid, ErrorBar, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatarNumero } from '#shared/metrologia/index.ts'
import type { ResultadoCalculo } from '#shared/metrologia/tipos.ts'
import { useCores } from '../../lib/useCores'

/** Erro × carga com as barras de ±U (e o EMA, quando há declaração de conformidade). */
export function GraficoErro({
  resultado,
  unidade,
  casas,
  altura = 200,
}: {
  resultado: ResultadoCalculo
  unidade: string
  casas: number
  altura?: number
}) {
  const cores = useCores()
  const pontos = resultado.pontos
    .map((p) => {
      const o = p.media ?? p.crescente ?? p.decrescente
      if (!o) return null
      return { carga: p.carga, erro: o.erro, u: [p.media ? p.media.U : Math.max(p.crescente?.U ?? 0, p.decrescente?.U ?? 0)], ema: p.ema }
    })
    .filter((p): p is { carga: number; erro: number; u: number[]; ema: number | null } => !!p)
  if (pontos.length < 2)
    return (
      <div style={{ height: altura }} className="flex items-center justify-center rounded-xl bg-surface-2/60 px-4 text-center text-[13px] text-muted">
        O gráfico aparece quando houver leituras em pelo menos dois pontos.
      </div>
    )
  const emaMax = Math.max(0, ...pontos.map((p) => p.ema ?? 0))
  return (
    <div style={{ height: altura }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pontos} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={cores.grid} vertical={false} />
          <XAxis
            dataKey="carga"
            type="number"
            domain={[0, 'dataMax']}
            tickLine={false}
            axisLine={{ stroke: cores.axis }}
            tick={{ fill: cores.muted, fontSize: 11 }}
            tickFormatter={(v: number) => formatarNumero(v, 0)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: cores.muted, fontSize: 11 }}
            tickFormatter={(v: number) => formatarNumero(v, casas)}
          />
          <ReferenceLine y={0} stroke={cores.axis} />
          {emaMax > 0 && <ReferenceLine y={emaMax} stroke={cores.danger} strokeDasharray="4 4" strokeOpacity={0.6} />}
          {emaMax > 0 && <ReferenceLine y={-emaMax} stroke={cores.danger} strokeDasharray="4 4" strokeOpacity={0.6} />}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as (typeof pontos)[number]
              return (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] shadow-float">
                  <p className="font-medium text-ink">
                    Carga {formatarNumero(p.carga, casas)} {unidade}
                  </p>
                  <p className="tnum text-ink-2">
                    Erro {formatarNumero(p.erro, casas + 1)} · U {formatarNumero(p.u[0], casas + 1)} {unidade}
                  </p>
                  {p.ema !== null && <p className="tnum text-muted">EMA ±{formatarNumero(p.ema, casas + 1)}</p>}
                </div>
              )
            }}
          />
          <Line
            dataKey="erro"
            stroke={cores['series-1']}
            strokeWidth={2}
            dot={{ r: 3.5, fill: cores['series-1'], strokeWidth: 0 }}
            isAnimationActive={false}
          >
            <ErrorBar dataKey="u" width={5} strokeWidth={1.4} stroke={cores['series-1']} direction="y" />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

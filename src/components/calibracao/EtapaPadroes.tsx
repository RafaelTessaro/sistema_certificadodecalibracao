import { Check, Droplets, Gauge, Thermometer, TriangleAlert, Weight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatarDataBr, resumoPesos, situacaoValidade, totalPesos, TIPOS_PADRAO, massaLegivel } from '#shared/dominio.ts'
import type { CondicoesAmbientais, Padrao } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { hojeISO } from '../../lib/format'
import { ValidadePadraoBadge } from '../Selos'
import { Card, CardHeader } from '../ui/Card'
import { Field } from '../ui/Form'
import { CampoNumero } from './CampoNumero'
import type { ContextoEtapa } from './contexto'

export function EtapaPadroes({ f, alterar, padroes, config }: ContextoEtapa) {
  const escolhidos = new Set(f.padroesIds)
  const alternar = (p: Padrao) =>
    alterar((s) => ({
      ...s,
      padroesIds: s.padroesIds.includes(p.id) ? s.padroesIds.filter((x) => x !== p.id) : [...s.padroesIds, p.id],
    }))
  const amb = f.ambiente
  const setAmb = (k: keyof CondicoesAmbientais, v: number | null) =>
    alterar((s) => ({ ...s, ambiente: { ...s.ambiente, [k]: v } }))
  const dataRef = f.dataCalibracao || hojeISO()
  const deltaT =
    amb.temperaturaInicial !== null && amb.temperaturaFinal !== null
      ? Math.abs(amb.temperaturaFinal - amb.temperaturaInicial)
      : null
  const pesos = padroes.filter((p) => p.tipo === 'PESOS')
  const instrumentos = padroes.filter((p) => p.tipo !== 'PESOS')

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icone={<Weight className="h-4 w-4" />}
          titulo="Pesos padrão usados"
          descricao="Escolha os jogos de pesos levados para a calibração. As cargas são montadas com eles."
          acoes={
            <Link to="/padroes" target="_blank" className="text-[13px] font-medium text-brand-ink hover:underline">
              Gerenciar padrões
            </Link>
          }
        />
        <div className="grid grid-cols-1 gap-3 px-5 pb-5 md:grid-cols-2">
          {pesos.length === 0 && (
            <p className="rounded-xl bg-warning-soft px-3.5 py-3 text-[13px] text-warning md:col-span-2">
              Nenhum jogo de pesos cadastrado. Cadastre em{' '}
              <Link to="/padroes?novo=1" className="font-medium underline">
                Padrões
              </Link>{' '}
              com os dados do certificado de calibração de cada peso.
            </p>
          )}
          {pesos.map((p) => (
            <CartaoPadrao
              key={p.id}
              padrao={p}
              marcado={escolhidos.has(p.id)}
              aoClicar={() => alternar(p)}
              dataRef={dataRef}
              dias={config.diasAvisoVencimento}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          icone={<Thermometer className="h-4 w-4" />}
          titulo="Condições ambientais"
          descricao="No início e no fim da calibração. Escolha também o termo-higrômetro usado."
        />
        <div className="flex flex-col gap-5 px-5 pb-5">
          {instrumentos.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {instrumentos.map((p) => (
                <CartaoPadrao
                  key={p.id}
                  padrao={p}
                  marcado={escolhidos.has(p.id)}
                  aoClicar={() => alternar(p)}
                  dataRef={dataRef}
                  dias={config.diasAvisoVencimento}
                />
              ))}
            </div>
          )}
          {/* Três grupos (início e fim lado a lado); as colunas 2fr/2fr/1fr deixam os cinco campos da mesma largura */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]">
            <GrupoAmbiente
              icone={<Thermometer className="h-3.5 w-3.5" />}
              titulo="Temperatura"
              extra={
                deltaT !== null && (
                  <span
                    title="Variação da temperatura durante a calibração"
                    className={cn(
                      'tnum rounded-md px-1.5 text-[11px] leading-5 font-medium whitespace-nowrap',
                      deltaT > 5 ? 'bg-warning-soft text-warning' : 'bg-surface-3 text-muted',
                    )}
                  >
                    Δ {numeroCurto(deltaT)} °C
                  </span>
                )
              }
            >
              <Field label="Início" htmlFor="amb-ti">
                <CampoNumero
                  id="amb-ti"
                  valor={amb.temperaturaInicial}
                  aoMudar={(v) => setAmb('temperaturaInicial', v)}
                  unidade="°C"
                  grade={{ grupo: 'amb', lin: 0, col: 0 }}
                />
              </Field>
              <Field label="Fim" htmlFor="amb-tf">
                <CampoNumero
                  id="amb-tf"
                  valor={amb.temperaturaFinal}
                  aoMudar={(v) => setAmb('temperaturaFinal', v)}
                  unidade="°C"
                  grade={{ grupo: 'amb', lin: 1, col: 0 }}
                />
              </Field>
            </GrupoAmbiente>
            <GrupoAmbiente icone={<Droplets className="h-3.5 w-3.5" />} titulo="Umidade relativa">
              <Field label="Início" htmlFor="amb-ui">
                <CampoNumero
                  id="amb-ui"
                  valor={amb.umidadeInicial}
                  aoMudar={(v) => setAmb('umidadeInicial', v)}
                  unidade="%"
                  grade={{ grupo: 'amb', lin: 0, col: 1 }}
                />
              </Field>
              <Field label="Fim" htmlFor="amb-uf">
                <CampoNumero
                  id="amb-uf"
                  valor={amb.umidadeFinal}
                  aoMudar={(v) => setAmb('umidadeFinal', v)}
                  unidade="%"
                  grade={{ grupo: 'amb', lin: 1, col: 1 }}
                />
              </Field>
            </GrupoAmbiente>
            <GrupoAmbiente icone={<Gauge className="h-3.5 w-3.5" />} titulo="Pressão" colunas={1}>
              {/* "Opcional" no rótulo (e não numa dica embaixo): os três grupos ficam da mesma altura */}
              <Field label="Opcional" htmlFor="amb-p">
                <CampoNumero
                  id="amb-p"
                  aria-label="Pressão atmosférica (opcional)"
                  valor={amb.pressao}
                  aoMudar={(v) => setAmb('pressao', v)}
                  unidade="hPa"
                  grade={{ grupo: 'amb', lin: 0, col: 2 }}
                />
              </Field>
            </GrupoAmbiente>
          </div>
          {deltaT !== null && deltaT > 5 && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />A temperatura variou {numeroCurto(deltaT)} °C durante a
              calibração. O recomendado para balanças classe III é até 5 °C; registre nas observações.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

/** Uma casa decimal, com vírgula (ex.: 0,7). */
const numeroCurto = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

/**
 * Grupo das condições ambientais: título com ícone e os campos lado a lado (início e fim). Na pressão, um
 * campo só: no celular ele fica com a largura dos outros (metade), no computador o grupo é que é mais estreito.
 */
function GrupoAmbiente({
  icone,
  titulo,
  extra,
  colunas = 2,
  children,
}: {
  icone: ReactNode
  titulo: string
  extra?: ReactNode
  colunas?: 1 | 2
  children: ReactNode
}) {
  return (
    <fieldset className="min-w-0 rounded-xl border border-line bg-surface-2/40 px-3.5 pt-3 pb-3.5">
      <legend className="sr-only">{titulo}</legend>
      <div aria-hidden className="mb-2.5 flex h-5 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-ink-2 shadow-xs ring-1 ring-line">
          {icone}
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{titulo}</span>
        {extra && <span className="ml-auto shrink-0">{extra}</span>}
      </div>
      <div className={cn('grid grid-cols-2 gap-3', colunas === 1 && 'sm:grid-cols-1')}>{children}</div>
    </fieldset>
  )
}

function CartaoPadrao({
  padrao: p,
  marcado,
  aoClicar,
  dataRef,
  dias,
}: {
  padrao: Padrao
  marcado: boolean
  aoClicar: () => void
  dataRef: string
  dias: number
}) {
  const situacao = situacaoValidade(p.validade, dataRef, dias)
  const vencido = situacao === 'VENCIDO' || situacao === 'SEM_DATA'
  const Icone = p.tipo === 'PESOS' ? Weight : p.tipo === 'TERMOHIGROMETRO' ? Droplets : Gauge
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={marcado}
      className={cn(
        'group relative flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-150',
        marcado
          ? 'border-brand bg-brand-soft/60 shadow-xs ring-1 ring-brand/30'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/50',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          marcado ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-2',
        )}
      >
        {marcado ? <Check className="h-5 w-5" /> : <Icone className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{p.identificacao}</span>
          {p.classe && (
            <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">{p.classe}</span>
          )}
          <ValidadePadraoBadge validade={p.validade} diasAviso={dias} />
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-2" title={p.descricao || undefined}>
          {p.descricao || TIPOS_PADRAO[p.tipo]}
        </span>
        <span className="mt-1 block text-xs text-muted">
          {p.tipo === 'PESOS'
            ? `${resumoPesos(p.pesos)} · total ${massaLegivel(totalPesos(p.pesos))}`
            : p.incertezaTexto || TIPOS_PADRAO[p.tipo]}
        </span>
        <span className="mt-1 block text-xs text-muted">
          Cert. {p.certificado || '—'} · próxima calibração {p.validade ? formatarDataBr(p.validade) : 'sem data'}
        </span>
        {marcado && vencido && (
          <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-danger">
            <TriangleAlert className="h-3.5 w-3.5" />
            {situacao === 'SEM_DATA' ? 'Sem a data da próxima calibração' : 'Vencido na data da calibração'}: impede a emissão
          </span>
        )}
      </span>
    </button>
  )
}

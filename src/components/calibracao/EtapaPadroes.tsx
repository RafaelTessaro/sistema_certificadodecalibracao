import { Check, Droplets, Gauge, Thermometer, TriangleAlert, Weight } from 'lucide-react'
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Field label="Temperatura inicial" htmlFor="amb-ti">
              <CampoNumero
                id="amb-ti"
                valor={amb.temperaturaInicial}
                aoMudar={(v) => setAmb('temperaturaInicial', v)}
                unidade="°C"
                grade={{ grupo: 'amb', lin: 0, col: 0 }}
              />
            </Field>
            <Field label="Temperatura final" htmlFor="amb-tf">
              <CampoNumero
                id="amb-tf"
                valor={amb.temperaturaFinal}
                aoMudar={(v) => setAmb('temperaturaFinal', v)}
                unidade="°C"
                grade={{ grupo: 'amb', lin: 1, col: 0 }}
              />
            </Field>
            <Field label="Umidade inicial" htmlFor="amb-ui">
              <CampoNumero
                id="amb-ui"
                valor={amb.umidadeInicial}
                aoMudar={(v) => setAmb('umidadeInicial', v)}
                unidade="%"
                grade={{ grupo: 'amb', lin: 0, col: 1 }}
              />
            </Field>
            <Field label="Umidade final" htmlFor="amb-uf">
              <CampoNumero
                id="amb-uf"
                valor={amb.umidadeFinal}
                aoMudar={(v) => setAmb('umidadeFinal', v)}
                unidade="%"
                grade={{ grupo: 'amb', lin: 1, col: 1 }}
              />
            </Field>
            <Field label="Pressão (opcional)" htmlFor="amb-p" className="col-span-2 md:col-span-1">
              <CampoNumero id="amb-p" valor={amb.pressao} aoMudar={(v) => setAmb('pressao', v)} unidade="hPa" />
            </Field>
          </div>
          {deltaT !== null && deltaT > 5 && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />A temperatura variou{' '}
              {String(Math.round(deltaT * 10) / 10).replace('.', ',')} °C durante a calibração. O recomendado para balanças classe
              III é até 5 °C; registre nas observações.
            </p>
          )}
        </div>
      </Card>
    </div>
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
        <span className="mt-0.5 block truncate text-[13px] text-ink-2">{p.descricao || TIPOS_PADRAO[p.tipo]}</span>
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

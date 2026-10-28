import { Check, Droplets, Gauge, Thermometer, ThermometerSun, TriangleAlert, Weight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  deltaTMaximo,
  deltaTPesosMaximo,
  formatarDataBr,
  massaLegivel,
  pressaoObrigatoria,
  resumoPesos,
  situacaoValidade,
  TIPOS_PADRAO,
  totalPesos,
} from '#shared/dominio.ts'
import { deltaTAposAclimatacao, formatarNumero } from '#shared/metrologia/index.ts'
import type { CondicoesAmbientais, Padrao } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { hojeISO } from '../../lib/format'
import { ValidadePadraoBadge } from '../Selos'
import { Card, CardHeader } from '../ui/Card'
import { Field } from '../ui/Form'
import { Segmented } from '../ui/Misc'
import { CampoNumero } from './CampoNumero'
import type { ContextoEtapa } from './contexto'
import { textoDeltaT } from './util'

export function EtapaPadroes({ f, alterar, padroes, selecionados, config, balanca, calc }: ContextoEtapa) {
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
  // Limites da classe da balança: ΔT de 1 °C na classe I e 3 °C na II, e pressão obrigatória (com barômetro) nas duas
  const limiteDeltaT = deltaTMaximo(balanca.classe)
  const comPressao = pressaoObrigatoria(balanca.classe)
  // Convecção (diferença de temperatura pesos − ar): sempre na classe I, e quando a opção do cálculo pede
  const comConveccao = balanca.classe === 'I' || f.opcoes.conveccao === 'CALCULAR'
  const densidadeAr = calc?.resultado.ar ?? null
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
          {/* Três grupos (início e fim lado a lado). As colunas seguem a largura do cartão, não a da janela (com a
              coluna "Resultados ao vivo" ao lado, o cartão é estreito mesmo numa tela larga), e os grupos só ficam
              lado a lado quando cada campo tem uns 7,5rem ou mais, o bastante para "1013,2 hPa" e "-10,5 °C": um
              grupo por linha; dois (a pressão embaixo, com o campo da largura dos outros); e, a partir de 56rem,
              os três em 2fr/2fr/1fr */}
          <div className="@container">
            <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)]">
              <GrupoAmbiente
                icone={<Thermometer className="h-3.5 w-3.5" />}
                titulo="Temperatura"
                extra={
                  deltaT !== null && (
                    <span
                      title="Variação da temperatura durante a calibração"
                      className={cn(
                        'tnum rounded-md px-1.5 text-[11px] leading-5 font-medium whitespace-nowrap',
                        deltaT > limiteDeltaT ? 'bg-warning-soft text-warning' : 'bg-surface-3 text-muted',
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
                <Field label={comPressao ? `Obrigatória na classe ${balanca.classe}` : 'Opcional'} htmlFor="amb-p">
                  <CampoNumero
                    id="amb-p"
                    aria-label={
                      comPressao
                        ? `Pressão atmosférica (obrigatória na classe ${balanca.classe})`
                        : 'Pressão atmosférica (opcional)'
                    }
                    valor={amb.pressao}
                    aoMudar={(v) => setAmb('pressao', v)}
                    unidade="hPa"
                    grade={{ grupo: 'amb', lin: 0, col: 2 }}
                  />
                </Field>
              </GrupoAmbiente>
            </div>
          </div>
          {densidadeAr && (
            <p className="-mt-2 text-xs text-muted">
              Densidade do ar:{' '}
              <span className="tnum font-medium text-ink-2">{formatarNumero(densidadeAr.densidade, 3)} kg/m³</span> (cg-18,
              A1.1-1)
            </p>
          )}
          {deltaT !== null && deltaT > limiteDeltaT && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {textoDeltaT(deltaT, balanca.classe)}
            </p>
          )}
          {comConveccao && (
            <GrupoConveccao
              ambiente={amb}
              classeI={balanca.classe === 'I'}
              jogos={selecionados.filter((p) => p.tipo === 'PESOS')}
              aoMudar={(mudar) => alterar((s) => ({ ...s, ambiente: mudar(s.ambiente) }))}
            />
          )}
        </div>
      </Card>
    </div>
  )
}

/**
 * Diferença de temperatura entre os pesos e o ar (convecção, cg-18 7.1.2.4): medida antes do 1º ensaio, com o
 * termômetro de duas entradas, ou estimada pelo tempo de aclimatação (Tabela F1.3). Trocar o modo limpa o outro.
 */
function GrupoConveccao({
  ambiente,
  classeI,
  jogos,
  aoMudar,
}: {
  ambiente: CondicoesAmbientais
  classeI: boolean
  jogos: Padrao[]
  aoMudar: (mudar: (a: CondicoesAmbientais) => CondicoesAmbientais) => void
}) {
  const [modo, setModo] = useState<'MEDIDA' | 'ACLIMATACAO'>(ambiente.aclimatacao ? 'ACLIMATACAO' : 'MEDIDA')
  // Os dois campos da aclimatação vão juntos para o registro: enquanto falta um, ficam só aqui
  const [acl, setAcl] = useState<{ deltaT0: number | null; minutos: number | null }>({
    deltaT0: ambiente.aclimatacao?.deltaT0 ?? null,
    minutos: ambiente.aclimatacao?.minutos ?? null,
  })
  const mudarModo = (m: 'MEDIDA' | 'ACLIMATACAO') => {
    if (m === modo) return
    setModo(m)
    if (m === 'MEDIDA') setAcl({ deltaT0: null, minutos: null })
    aoMudar((a) => ({ ...a, deltaTPesos: null, aclimatacao: null }))
  }
  const mudarAcl = (k: 'deltaT0' | 'minutos', v: number | null) => {
    const novo = { ...acl, [k]: v }
    setAcl(novo)
    aoMudar((a) => ({
      ...a,
      deltaTPesos: null,
      aclimatacao: novo.deltaT0 !== null && novo.minutos !== null ? { deltaT0: novo.deltaT0, minutos: novo.minutos } : null,
    }))
  }
  // POP 7.4: começar só com |ΔT| ≤ 1 °C (E1/E2) ou ≤ 3 °C (só F1)
  const limite = deltaTPesosMaximo(jogos.map((p) => p.classe))
  const medido = ambiente.deltaTPesos ?? null
  const acimaMedido = classeI && medido !== null && Math.abs(medido) > limite + 1e-9
  // A maior peça dos jogos escolhidos é a que demora mais a aclimatar
  const maiorKg = Math.max(0, ...jogos.flatMap((p) => p.pesos.map((w) => w.nominal / 1000)))
  const estimado =
    modo === 'ACLIMATACAO' && acl.deltaT0 !== null && acl.minutos !== null && maiorKg > 0
      ? deltaTAposAclimatacao(maiorKg, acl.deltaT0, acl.minutos)
      : null
  return (
    <fieldset className="min-w-0 rounded-xl border border-line bg-surface-2/40 px-3.5 pt-3 pb-3.5">
      <legend className="sr-only">Pesos × ar (convecção)</legend>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div aria-hidden className="flex h-5 min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface text-ink-2 shadow-xs ring-1 ring-line">
            <ThermometerSun className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[13px] font-semibold text-ink">Pesos × ar (convecção)</span>
        </div>
        <Segmented
          tamanho="sm"
          className="ml-auto"
          valor={modo}
          aoMudar={mudarModo}
          opcoes={[
            { valor: 'MEDIDA', label: 'Medida' },
            { valor: 'ACLIMATACAO', label: 'Pela aclimatação' },
          ]}
        />
      </div>
      {modo === 'MEDIDA' ? (
        <div className="flex flex-col gap-3">
          <Field
            label="ΔT pesos − ar (antes do 1º ensaio)"
            htmlFor="amb-dtp"
            className="max-w-xs"
            hint="Termômetro de duas entradas: uma sonda entre os pesos, outra no ar junto ao prato. Nunca infravermelho."
          >
            <CampoNumero
              id="amb-dtp"
              valor={medido}
              aoMudar={(v) => aoMudar((a) => ({ ...a, deltaTPesos: v, aclimatacao: null }))}
              unidade="°C"
              tom={acimaMedido ? 'atencao' : 'normal'}
            />
          </Field>
          {acimaMedido && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Acima de {limite} °C: aguarde a aclimatação dos pesos (POP 7.4).
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Diferença na chegada" htmlFor="amb-acl-dt">
              <CampoNumero id="amb-acl-dt" valor={acl.deltaT0} aoMudar={(v) => mudarAcl('deltaT0', v)} unidade="°C" />
            </Field>
            <Field label="Pesos no local até o 1º ensaio" htmlFor="amb-acl-min">
              <CampoNumero id="amb-acl-min" valor={acl.minutos} aoMudar={(v) => mudarAcl('minutos', v)} unidade="min" />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Diferença entre a temperatura de onde os pesos vieram (veículo, depósito) e a do local; na dúvida, o maior valor
            provável.
          </p>
          {estimado !== null && (
            <p
              className={cn(
                'rounded-xl px-3.5 py-2.5 text-[13px]',
                classeI && estimado > limite + 1e-9 ? 'bg-warning-soft text-warning' : 'bg-surface-3/70 text-ink-2',
              )}
            >
              ΔT estimado da maior peça: <span className="tnum font-semibold">{numeroCurto(estimado)} °C</span> (cg-18, Tabela
              F1.3)
            </p>
          )}
        </div>
      )}
    </fieldset>
  )
}

/** Uma casa decimal, com vírgula (ex.: 0,7). */
const numeroCurto = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

/**
 * Grupo das condições ambientais: título com ícone e os campos lado a lado (início e fim). Na pressão, um
 * campo só: com um ou dois grupos por linha ele fica com a largura dos outros (metade do grupo); com os três
 * lado a lado, o grupo é que é mais estreito.
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
      <div className={cn('grid grid-cols-2 gap-3', colunas === 1 && '@4xl:grid-cols-1')}>{children}</div>
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

import { ArrowRight, BellRing, Building2, FileBadge2, FilePen, Scale, ShieldAlert, Weight } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { diasEntre } from '#shared/dominio.ts'
import type { CalibracaoResumo } from '#shared/tipos.ts'
import { rotaCalibracao } from '../components/CertificadosTabela'
import { StatusCalibracaoBadge, ValidadePadraoBadge } from '../components/Selos'
import { Card, CardHeader } from '../components/ui/Card'
import { PageHeader, StatCard } from '../components/ui/Misc'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { dataCurta, dataExtensa, hojeISO, mesCurto, numero } from '../lib/format'
import { useCores } from '../lib/useCores'
import { useSessao } from '../store/sessao'

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function Painel() {
  const usuario = useSessao((s) => s.usuario)
  const { dados: p, carregando } = useConsulta('painel', () => api.painel().then((r) => r.painel), [
    'calibracao',
    'balanca',
    'padrao',
    'cliente',
    'config',
  ])
  const { dados: venc } = useConsulta('vencimentos:painel', () => api.vencimentos(30).then((r) => r.vencimentos), [
    'calibracao',
    'balanca',
  ])
  const primeiroNome = usuario?.nome.trim().split(/\s+/)[0] ?? ''
  const variacao = p && p.emitidosMesAnterior ? Math.round(((p.emitidosMes - p.emitidosMesAnterior) / p.emitidosMesAnterior) * 100) : null

  return (
    <>
      <PageHeader
        titulo={`${saudacao()}${primeiroNome ? `, ${primeiroNome}` : ''}`}
        descricao={dataExtensa(hojeISO())}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          rotulo="Certificados no mês"
          valor={p?.emitidosMes ?? 0}
          formatar={(v) => numero(Math.round(v))}
          icone={<FileBadge2 className="h-4 w-4" />}
          detalhe={
            variacao === null
              ? `${numero(p?.emitidosAno ?? 0)} no ano`
              : `${variacao >= 0 ? '▲' : '▼'} ${Math.abs(variacao)}% em relação ao mês passado`
          }
          destaque
        />
        <StatCard
          rotulo="Calibrações vencendo"
          valor={p?.vencendo ?? 0}
          formatar={(v) => numero(Math.round(v))}
          icone={<BellRing className="h-4 w-4" />}
          detalhe={p?.vencidas ? <span className="font-medium text-danger">{numero(p.vencidas)} já vencidas</span> : 'Próximos 30 dias'}
          delay={0.04}
        />
        <StatCard
          rotulo="Em andamento"
          valor={p?.rascunhos ?? 0}
          formatar={(v) => numero(Math.round(v))}
          icone={<FilePen className="h-4 w-4" />}
          detalhe="Rascunhos e aguardando revisão"
          delay={0.08}
        />
        <StatCard
          rotulo="Padrões a recalibrar"
          valor={p?.padroesVencendo.length ?? 0}
          formatar={(v) => numero(Math.round(v))}
          icone={<Weight className="h-4 w-4" />}
          detalhe={
            p?.padroesVencendo.some((x) => !x.validade || x.validade < hojeISO()) ? (
              <span className="font-medium text-danger">Há padrão vencido</span>
            ) : (
              'Vencendo em breve'
            )
          }
          delay={0.12}
        />
      </div>

      {!carregando && p && p.clientes === 0 && <PrimeirosPassos />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card>
            <CardHeader
              titulo="Certificados emitidos"
              descricao="Últimos 12 meses"
              acoes={
                <span className="text-[13px] text-muted">
                  {numero(p?.emitidosAno ?? 0)} em {hojeISO().slice(0, 4)}
                </span>
              }
            />
            <div className="px-3 pb-4">
              <GraficoMensal dados={p?.porMes ?? []} />
            </div>
          </Card>

          <ListaCalibracoes
            titulo="Em andamento"
            descricao="Continue de onde parou"
            itens={p?.emAndamento ?? []}
            vazio="Nenhuma calibração em andamento."
          />
          <ListaCalibracoes
            titulo="Últimos certificados"
            itens={p?.ultimos ?? []}
            vazio="Nenhum certificado emitido ainda."
            verTodos
          />
        </div>

        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <CardHeader
              icone={<BellRing className="h-4 w-4" />}
              titulo="Vencendo em breve"
              descricao="Balanças dos clientes"
              acoes={
                <Link to="/vencimentos" className="text-[13px] font-medium text-brand-ink hover:underline">
                  Ver todas
                </Link>
              }
            />
            {venc?.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {venc.slice(0, 7).map((v) => {
                  const dias = diasEntre(hojeISO(), v.proximaCalibracao)
                  return (
                    <li key={v.balancaId}>
                      <Link to={`/balancas/${v.balancaId}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/70">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${dias < 0 ? 'bg-danger' : 'bg-warning-dot'}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{v.clienteNome}</p>
                          <p className="truncate text-xs text-muted">{v.balancaDescricao.replace(/^Balança /, '')}</p>
                        </div>
                        <span className={`tnum text-xs whitespace-nowrap ${dias < 0 ? 'font-medium text-danger' : 'text-ink-2'}`}>
                          {dias < 0 ? 'vencida' : dias === 0 ? 'hoje' : `${dias} d`}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-muted">Nenhuma balança vencendo nos próximos 30 dias.</p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              icone={<Weight className="h-4 w-4" />}
              titulo="Padrões"
              descricao="Pesos e instrumentos a recalibrar"
              acoes={
                <Link to="/padroes" className="text-[13px] font-medium text-brand-ink hover:underline">
                  Ver padrões
                </Link>
              }
            />
            {p?.padroesVencendo.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {p.padroesVencendo.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{x.identificacao}</p>
                      <p className="truncate text-xs text-muted">
                        {x.descricao || '—'} {x.validade && `· até ${dataCurta(x.validade)}`}
                      </p>
                    </div>
                    <ValidadePadraoBadge validade={x.validade} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-muted">Todos os padrões estão em dia.</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <Mini icone={<Building2 className="h-4 w-4" />} rotulo="Clientes" valor={p?.clientes ?? 0} to="/clientes" />
              <Mini icone={<Scale className="h-4 w-4" />} rotulo="Balanças" valor={p?.balancas ?? 0} to="/balancas" />
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

function Mini({ icone, rotulo, valor, to }: { icone: ReactNode; rotulo: string; valor: number; to: string }) {
  return (
    <Link to={to} className="group rounded-xl p-2 transition-colors hover:bg-surface-2">
      <span className="flex items-center gap-2 text-[13px] text-muted">
        {icone}
        {rotulo}
      </span>
      <span className="tnum mt-1 block text-xl font-semibold text-ink">{numero(valor)}</span>
    </Link>
  )
}

function ListaCalibracoes({
  titulo,
  descricao,
  itens,
  vazio,
  verTodos,
}: {
  titulo: string
  descricao?: string
  itens: CalibracaoResumo[]
  vazio: string
  verTodos?: boolean
}) {
  if (!itens.length && !verTodos) return null
  return (
    <Card className="overflow-hidden">
      <CardHeader
        titulo={titulo}
        descricao={descricao}
        acoes={
          verTodos && (
            <Link to="/certificados" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-ink hover:underline">
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )
        }
      />
      {itens.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {itens.map((k, i) => (
            <motion.li key={k.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
              <Link to={rotaCalibracao(k)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/70">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                  {k.status === 'RASCUNHO' || k.status === 'REVISAO' ? <FilePen className="h-4 w-4" /> : <FileBadge2 className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    <span className="tnum">{k.numero || 'Rascunho'}</span>
                    <span className="font-normal text-muted"> · {k.clienteNome}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {k.balancaDescricao.replace(/^Balança /, '')} · {dataCurta(k.dataEmissao || k.dataCalibracao)}
                  </p>
                </div>
                <span className="max-sm:hidden">
                  <StatusCalibracaoBadge status={k.status} />
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-muted">{vazio}</p>
      )}
    </Card>
  )
}

function GraficoMensal({ dados }: { dados: Array<{ mes: string; quantidade: number }> }) {
  const cores = useCores()
  const pontos = dados.map((d) => ({ ...d, rotulo: mesCurto(d.mes) }))
  const vazio = pontos.every((d) => d.quantidade === 0)
  return (
    <div className="relative h-[240px] w-full">
      {vazio && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pb-6">
          <p className="rounded-lg bg-surface px-3 py-1.5 text-sm text-muted">Os certificados emitidos aparecem aqui</p>
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pontos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={cores.grid} />
          <XAxis dataKey="rotulo" tickLine={false} axisLine={{ stroke: cores.axis }} tick={{ fill: cores.muted, fontSize: 12 }} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: cores.muted, fontSize: 12 }} width={32} />
          <Tooltip
            cursor={{ fill: cores['surface-2'] }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-float">
                  <p className="font-medium text-ink capitalize">{String(payload[0].payload.rotulo)}</p>
                  <p className="tnum text-ink-2">
                    {numero(Number(payload[0].value))} {Number(payload[0].value) === 1 ? 'certificado' : 'certificados'}
                  </p>
                </div>
              ) : null
            }
          />
          <Bar dataKey="quantidade" fill={cores['series-1']} radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Banco vazio: os passos para começar. */
function PrimeirosPassos() {
  const navegar = useNavigate()
  const passos = [
    { titulo: 'Confira os dados da empresa', texto: 'Razão social, CNPJ e endereço saem no certificado.', to: '/configuracoes' },
    { titulo: 'Cadastre os pesos padrão', texto: 'Com o nº do certificado e a validade de cada jogo.', to: '/padroes?novo=1' },
    { titulo: 'Cadastre um cliente', texto: 'Digite o CNPJ e o resto é preenchido sozinho.', to: '/clientes?novo=1' },
    { titulo: 'Faça a primeira calibração', texto: 'Registre os ensaios e emita o certificado.', to: '/calibracoes/nova' },
  ]
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader icone={<ShieldAlert className="h-4 w-4" />} titulo="Primeiros passos" descricao="Quatro passos para emitir o primeiro certificado" />
      <ol className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
        {passos.map((p, i) => (
          <li key={p.to}>
            <button
              type="button"
              onClick={() => navegar(p.to)}
              className="h-full w-full cursor-pointer rounded-xl border border-line bg-surface-2/50 p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <span className="tnum flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">
                {i + 1}
              </span>
              <p className="mt-3 text-sm font-medium text-ink">{p.titulo}</p>
              <p className="mt-1 text-xs text-muted">{p.texto}</p>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  )
}


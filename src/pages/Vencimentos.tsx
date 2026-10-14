// Vencimentos: balanças dos clientes com a próxima calibração chegando (a data combinada no último
// certificado, que é só um lembrete interno), agrupadas por cliente, com o lembrete por e-mail.

import { BellRing, CalendarClock, CircleCheck, Download, FilePlus2, Mail, MailX, Send, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hojeLocalIso } from '#shared/dominio.ts'
import type { Vencimento } from '#shared/tipos.ts'
import { LembreteModal } from '../components/LembreteModal'
import { PrazoBadge } from '../components/Selos'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Avatar, EmptyState, PageHeader, SearchInput, Segmented, StatCard } from '../components/ui/Misc'
import { Linha, Tabela, Td, Th } from '../components/ui/Table'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { exportarCSV } from '../lib/csv'
import { dataCurta, normalizar, numero } from '../lib/format'

type Filtro = 'vencidas' | '30' | '60' | '90' | 'todas'

const FILTROS: Array<{ valor: Filtro; label: string; dica: string; passa: (v: Vencimento) => boolean }> = [
  {
    valor: 'vencidas',
    label: 'Vencidas',
    dica: 'Balanças com a data da próxima calibração já passada.',
    passa: (v) => v.dias < 0,
  },
  {
    valor: '30',
    label: 'Próximos 30 dias',
    dica: 'As vencidas e as que vencem nos próximos 30 dias.',
    passa: (v) => v.dias <= 30,
  },
  { valor: '60', label: '60 dias', dica: 'As vencidas e as que vencem nos próximos 60 dias.', passa: (v) => v.dias <= 60 },
  { valor: '90', label: '90 dias', dica: 'As vencidas e as que vencem nos próximos 90 dias.', passa: (v) => v.dias <= 90 },
  { valor: 'todas', label: 'Todas', dica: 'Todas as balanças com a próxima calibração marcada.', passa: () => true },
]

interface GrupoCliente {
  clienteId: string
  clienteNome: string
  clienteEmail: string
  itens: Vencimento[]
  vencidas: number
  /** Vencem nos próximos dias de aviso (sem as vencidas). */
  vencendo: number
  /** Lembrete mais recente enviado para este cliente (ISO) ou ''. */
  ultimoLembrete: string
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** Mês (yyyy-MM) de um instante, no fuso deste computador. */
const mesLocal = (iso: string) => hojeLocalIso(new Date(iso)).slice(0, 7)

export function Vencimentos() {
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('30')
  const [busca, setBusca] = useState('')
  const [lembrete, setLembrete] = useState<GrupoCliente | null>(null)
  const { dados, carregando, erro, recarregar } = useConsulta(
    'vencimentos:todos',
    () => api.vencimentos('todos').then((r) => r.vencimentos),
    ['calibracao', 'balanca', 'cliente'],
  )
  const { dados: config } = useConsulta('config', () => api.config().then((r) => r.config), ['config'])
  const diasAviso = config?.diasAvisoVencimento ?? 30
  const todos = useMemo(() => dados ?? [], [dados])

  const contagem = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.valor, todos.filter(f.passa).length])) as Record<Filtro, number>,
    [todos],
  )

  const indicadores = useMemo(() => {
    const mes = hojeLocalIso().slice(0, 7)
    const vencidas = todos.filter((v) => v.dias < 0)
    const em30 = todos.filter((v) => v.dias >= 0 && v.dias <= 30)
    const avisados = new Set(todos.filter((v) => v.lembreteEm && mesLocal(v.lembreteEm) === mes).map((v) => v.clienteId))
    return {
      vencidas: vencidas.length,
      clientesVencidas: new Set(vencidas.map((v) => v.clienteId)).size,
      em30: em30.length,
      clientesEm30: new Set(em30.map((v) => v.clienteId)).size,
      avisados: avisados.size,
    }
  }, [todos])

  const filtroAtual = FILTROS.find((f) => f.valor === filtro) ?? FILTROS[1]

  const lista = useMemo(() => {
    const q = normalizar(busca)
    return todos
      .filter(filtroAtual.passa)
      .filter(
        (v) =>
          !q ||
          normalizar(
            `${v.clienteNome} ${v.clienteEmail} ${v.balancaDescricao} ${v.numeroSerie} ${v.identificacao} ${v.ultimoCertificado}`,
          ).includes(q),
      )
  }, [todos, busca, filtroAtual])

  const grupos = useMemo(() => {
    const mapa = new Map<string, GrupoCliente>()
    for (const v of lista) {
      let g = mapa.get(v.clienteId)
      if (!g) {
        g = {
          clienteId: v.clienteId,
          clienteNome: v.clienteNome,
          clienteEmail: v.clienteEmail,
          itens: [],
          vencidas: 0,
          vencendo: 0,
          ultimoLembrete: '',
        }
        mapa.set(v.clienteId, g)
      }
      g.itens.push(v)
      if (v.dias < 0) g.vencidas++
      else if (v.dias <= diasAviso) g.vencendo++
      if (v.lembreteEm > g.ultimoLembrete) g.ultimoLembrete = v.lembreteEm
    }
    for (const g of mapa.values()) g.itens.sort((a, b) => a.dias - b.dias)
    // O cliente com a balança mais atrasada primeiro
    return [...mapa.values()].sort(
      (a, b) => a.itens[0].dias - b.itens[0].dias || a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'),
    )
  }, [lista, diasAviso])

  const exportar = () =>
    exportarCSV(
      'vencimentos.csv',
      [
        'Cliente',
        'E-mail',
        'Balança',
        'Nº de série',
        'TAG',
        'Última calibração',
        'Certificado',
        'Próxima calibração',
        'Dias',
        'Último lembrete',
      ],
      lista.map((v) => [
        v.clienteNome,
        v.clienteEmail,
        v.balancaDescricao,
        v.numeroSerie,
        v.identificacao,
        dataCurta(v.ultimaCalibracao),
        v.ultimoCertificado,
        dataCurta(v.proximaCalibracao),
        v.dias,
        v.lembreteEm ? dataCurta(v.lembreteEm.slice(0, 10)) : '',
      ]),
    )

  const nomeMes = MESES[Number(hojeLocalIso().slice(5, 7)) - 1]

  return (
    <>
      <PageHeader
        titulo="Vencimentos"
        descricao="Balanças dos clientes com a próxima calibração chegando. Avise o cliente e agende a visita."
        acoes={
          <Button
            icone={<Download className="h-4 w-4" />}
            onClick={exportar}
            disabled={!lista.length}
            title="Planilha (CSV) que abre no Excel"
          >
            Exportar
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          rotulo="Vencidas"
          valor={indicadores.vencidas}
          formatar={(v) => numero(Math.round(v))}
          icone={<TriangleAlert className="h-4 w-4" />}
          detalhe={
            indicadores.vencidas ? (
              <span className="font-medium text-danger">
                De {indicadores.clientesVencidas} {indicadores.clientesVencidas === 1 ? 'cliente' : 'clientes'}
              </span>
            ) : (
              'Nenhuma calibração atrasada'
            )
          }
        />
        <StatCard
          rotulo="Vencem em 30 dias"
          valor={indicadores.em30}
          formatar={(v) => numero(Math.round(v))}
          icone={<CalendarClock className="h-4 w-4" />}
          detalhe={
            indicadores.em30
              ? `De ${indicadores.clientesEm30} ${indicadores.clientesEm30 === 1 ? 'cliente' : 'clientes'}: hora de avisar`
              : 'Nada para os próximos 30 dias'
          }
          delay={0.04}
        />
        <StatCard
          rotulo="Clientes avisados no mês"
          valor={indicadores.avisados}
          formatar={(v) => numero(Math.round(v))}
          icone={<BellRing className="h-4 w-4" />}
          detalhe={`Lembretes enviados em ${nomeMes}`}
          delay={0.08}
        />
      </div>

      <Card className="mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <SearchInput valor={busca} aoMudar={setBusca} placeholder="Buscar cliente, balança, série…" className="md:w-80" />
        <div className="min-w-0 md:ml-auto">
          <Segmented
            valor={filtro}
            aoMudar={setFiltro}
            opcoes={FILTROS.map((f) => ({ valor: f.valor, label: f.label, contagem: contagem[f.valor] }))}
          />
        </div>
      </Card>
      <p className="mb-4 px-1 text-[13px] text-muted">{filtroAtual.dica}</p>

      {carregando ? (
        <EsqueletoGrupos />
      ) : erro && !dados ? (
        <Card>
          <EmptyState
            icone={<CalendarClock className="h-6 w-6" />}
            titulo="Não foi possível carregar os vencimentos"
            descricao={erro}
            acao={<Button onClick={recarregar}>Tentar de novo</Button>}
          />
        </Card>
      ) : !todos.length ? (
        <Card>
          <EmptyState
            icone={<CalendarClock className="h-6 w-6" />}
            titulo="Nenhuma próxima calibração marcada"
            descricao="As balanças aparecem aqui quando o certificado emitido tem a data da próxima calibração. Essa data é um lembrete interno e só sai no certificado se o cliente pedir."
          />
        </Card>
      ) : !grupos.length ? (
        <Card>
          {busca ? (
            <EmptyState
              icone={<CalendarClock className="h-6 w-6" />}
              titulo="Nada encontrado"
              descricao={`Nenhuma balança com “${busca}” neste filtro.`}
              acao={<Button onClick={() => setBusca('')}>Limpar a busca</Button>}
            />
          ) : (
            <EmptyState
              icone={<CircleCheck className="h-6 w-6" />}
              titulo={filtro === 'vencidas' ? 'Nenhuma calibração vencida' : 'Tudo em dia'}
              descricao={
                filtro === 'vencidas'
                  ? 'Nenhuma balança com a data da próxima calibração já passada.'
                  : 'Nenhuma balança vence neste período. Veja um período maior para se adiantar.'
              }
              acao={
                filtro !== 'todas' && (
                  <Button onClick={() => setFiltro(filtro === 'vencidas' ? '30' : 'todas')}>
                    {filtro === 'vencidas' ? 'Ver os próximos 30 dias' : 'Ver todas'}
                  </Button>
                )
              }
            />
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g, i) => (
            <CartaoCliente
              key={g.clienteId}
              grupo={g}
              indice={i}
              diasAviso={diasAviso}
              aoLembrar={() => setLembrete(g)}
              aoNovaCalibracao={(balancaId) => navegar(`/calibracoes/nova?balanca=${encodeURIComponent(balancaId)}`)}
              aoAbrirBalanca={(balancaId) => navegar(`/balancas/${encodeURIComponent(balancaId)}`)}
            />
          ))}
          <p className="px-1 text-center text-xs text-muted">
            {numero(lista.length)} {lista.length === 1 ? 'balança' : 'balanças'} de {numero(grupos.length)}{' '}
            {grupos.length === 1 ? 'cliente' : 'clientes'}
          </p>
        </div>
      )}

      <LembreteModal
        aberto={!!lembrete}
        aoFechar={() => setLembrete(null)}
        clienteId={lembrete?.clienteId ?? ''}
        clienteNome={lembrete?.clienteNome ?? ''}
        email={lembrete?.clienteEmail ?? ''}
        balancas={lembrete?.itens ?? []}
      />
    </>
  )
}

function CartaoCliente({
  grupo: g,
  indice,
  diasAviso,
  aoLembrar,
  aoNovaCalibracao,
  aoAbrirBalanca,
}: {
  grupo: GrupoCliente
  indice: number
  diasAviso: number
  aoLembrar: () => void
  aoNovaCalibracao: (balancaId: string) => void
  aoAbrirBalanca: (balancaId: string) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(indice, 10) * 0.03, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 pt-4 pb-3.5 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Avatar nome={g.clienteNome} className="h-10 w-10 rounded-xl text-[13px]" />
            <div className="min-w-0">
              <Link
                to={`/clientes/${encodeURIComponent(g.clienteId)}`}
                className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-ink underline-offset-2 hover:text-brand-ink hover:underline"
              >
                {g.clienteNome}
              </Link>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px]">
                {g.clienteEmail ? (
                  <>
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="truncate text-ink-2">{g.clienteEmail}</span>
                  </>
                ) : (
                  <>
                    <MailX className="h-3.5 w-3.5 shrink-0 text-warning" />
                    <span className="text-warning">Sem e-mail no cadastro</span>
                  </>
                )}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {g.vencidas > 0 && (
                  <Badge tom="danger">
                    {g.vencidas} {g.vencidas === 1 ? 'vencida' : 'vencidas'}
                  </Badge>
                )}
                {g.vencendo > 0 && (
                  <Badge tom="warning">
                    {g.vencendo} {g.vencendo === 1 ? 'vence em breve' : 'vencem em breve'}
                  </Badge>
                )}
                {g.ultimoLembrete ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted">
                    <BellRing className="h-3 w-3" /> Último lembrete em {dataCurta(hojeLocalIso(new Date(g.ultimoLembrete)))}
                  </span>
                ) : (
                  <span className="text-xs text-muted">Nenhum lembrete enviado</span>
                )}
              </div>
            </div>
          </div>
          <Button variante="soft" icone={<Send className="h-4 w-4" />} onClick={aoLembrar} className="self-start max-sm:w-full">
            Enviar lembrete
          </Button>
        </div>

        <Tabela className="border-t border-line">
          <thead>
            <tr>
              <Th>Balança</Th>
              <Th className="max-md:hidden">Última calibração</Th>
              <Th>Próxima</Th>
              <Th className="max-lg:hidden">Lembrete</Th>
              <Th className="w-12 lg:w-44" />
            </tr>
          </thead>
          <tbody>
            {g.itens.map((v, i) => (
              <Linha key={v.balancaId} indice={i} aoClicar={() => aoAbrirBalanca(v.balancaId)}>
                <Td className="min-w-[180px]">
                  <p className="font-medium text-ink">{v.balancaDescricao}</p>
                  <p className="tnum text-xs text-muted">
                    {[v.numeroSerie && `Série ${v.numeroSerie}`, v.identificacao && `TAG ${v.identificacao}`]
                      .filter(Boolean)
                      .join(' · ') || 'Sem número de série'}
                  </p>
                  {/* No celular a coluna da última calibração some: o certificado vem para cá */}
                  {v.ultimoCertificado && (
                    <p className="text-xs text-muted md:hidden">
                      Último: <LinkCertificado v={v} />
                    </p>
                  )}
                </Td>
                <Td className="whitespace-nowrap max-md:hidden">
                  <p className="tnum">{dataCurta(v.ultimaCalibracao)}</p>
                  {v.ultimoCertificado && (
                    <p className="text-xs">
                      <LinkCertificado v={v} />
                    </p>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  <p className="tnum">{dataCurta(v.proximaCalibracao)}</p>
                  <PrazoBadge data={v.proximaCalibracao} diasAviso={diasAviso} className="text-xs" />
                </Td>
                <Td className="tnum whitespace-nowrap max-lg:hidden">
                  {v.lembreteEm ? dataCurta(hojeLocalIso(new Date(v.lembreteEm))) : <span className="text-muted">—</span>}
                </Td>
                <Td alinhar="right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    tamanho="sm"
                    variante="ghost"
                    icone={<FilePlus2 className="h-3.5 w-3.5" />}
                    onClick={() => aoNovaCalibracao(v.balancaId)}
                    aria-label={`Nova calibração de ${v.balancaDescricao}`}
                    title="Nova calibração desta balança"
                    className="max-lg:w-8 max-lg:px-0"
                  >
                    <span className="max-lg:hidden">Nova calibração</span>
                  </Button>
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      </Card>
    </motion.div>
  )
}

function LinkCertificado({ v }: { v: Vencimento }) {
  return (
    <Link
      to={`/calibracoes/${encodeURIComponent(v.ultimoCertificadoId)}`}
      onClick={(e) => e.stopPropagation()}
      className="tnum font-medium text-brand-ink underline-offset-2 hover:underline"
      title="Abrir o certificado"
    >
      nº {v.ultimoCertificado}
    </Link>
  )
}

function EsqueletoGrupos() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only">Carregando os vencimentos…</span>
      {[0, 1].map((i) => (
        <Card key={i} className="overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-surface-3" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-surface-3" />
              <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-surface-2" />
            </div>
            <div className="h-9 w-36 animate-pulse rounded-xl bg-surface-2" />
          </div>
          {[0, 1].map((j) => (
            <div key={j} className="flex items-center gap-3 border-t border-line px-5 py-3.5">
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 animate-pulse rounded-full bg-surface-3" />
                <div className="h-2.5 w-1/5 animate-pulse rounded-full bg-surface-2" />
              </div>
              <div className="h-3 w-20 animate-pulse rounded-full bg-surface-2" />
            </div>
          ))}
        </Card>
      ))}
    </div>
  )
}

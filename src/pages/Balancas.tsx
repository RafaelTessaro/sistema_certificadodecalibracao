import { Building2, Download, Ellipsis, FilePlus2, Pencil, Plus, Scale, SearchX, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { capacidadeTexto, ROTULO_CLASSE, situacaoValidade, textoBusca, TIPOS_BALANCA } from '#shared/dominio.ts'
import type { BalancaResumo } from '#shared/tipos.ts'
import { BalancaFormModal } from '../components/BalancaFormModal'
import { PrazoBadge } from '../components/Selos'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { confirmar } from '../components/ui/Feedback'
import { EmptyState, Menu, PageHeader, SearchInput, Segmented } from '../components/ui/Misc'
import { Linha, Tabela, Td, Th } from '../components/ui/Table'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { exportarCSV } from '../lib/csv'
import { dataCurta, hojeISO, numero } from '../lib/format'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { EsqueletoTabela } from './Clientes'

type FiltroPrazo = 'todas' | 'vencidas' | 'vencendo' | 'sem'

/** Nome curto da balança: fabricante e modelo, ou o tipo quando não há. */
const nomeBalanca = (b: Pick<BalancaResumo, 'fabricante' | 'modelo' | 'tipo'>) =>
  [b.fabricante, b.modelo].filter(Boolean).join(' ') || TIPOS_BALANCA[b.tipo]

export function Balancas() {
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const podeExcluir = usePode('excluirBalanca')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroPrazo>('todas')
  const [inativas, setInativas] = useState(false)
  const { dados, carregando, erro } = useConsulta(
    `balancas-lista:${inativas}`,
    () => api.balancas({ inativas }).then((r) => r.balancas),
    ['balanca', 'cliente', 'calibracao'],
  )
  // Mesmo prazo de aviso da tela de vencimentos (Configurações)
  const { dados: diasAviso = 30 } = useConsulta(
    'config:diasAviso',
    () => api.config().then((r) => r.config.diasAvisoVencimento),
    ['config'],
  )
  const balancas = useMemo(() => dados ?? [], [dados])

  const [modalLocal, setModal] = useState<{ aberto: boolean; balanca?: BalancaResumo }>({ aberto: false })
  // `?nova=1&cliente=<id>` (vindo da lista de clientes ou da busca global) abre o cadastro direto
  const pelaUrl = params.get('nova') === '1'
  const modal = pelaUrl
    ? { aberto: true, clienteId: params.get('cliente') || undefined, balanca: undefined }
    : { ...modalLocal, clienteId: undefined }
  /** Para onde ir depois de fechar o cadastro novo (a balança recém-criada). */
  const destino = useRef<string | null>(null)
  const fecharModal = () => {
    setModal({ aberto: false })
    if (params.has('nova') || params.has('cliente')) setParams({}, { replace: true })
    if (destino.current) {
      const para = destino.current
      destino.current = null
      navegar(para)
    }
  }

  const hoje = hojeISO()
  const prazo = (b: BalancaResumo) => situacaoValidade(b.proximaCalibracao, hoje, diasAviso)

  const contagem = useMemo(() => {
    const ativas = balancas.filter((b) => b.ativo)
    return {
      vencidas: ativas.filter((b) => situacaoValidade(b.proximaCalibracao, hoje, diasAviso) === 'VENCIDO').length,
      vencendo: ativas.filter((b) => situacaoValidade(b.proximaCalibracao, hoje, diasAviso) === 'VENCENDO').length,
      sem: ativas.filter((b) => !b.ultimaCalibracao).length,
    }
  }, [balancas, hoje, diasAviso])

  const lista = useMemo(() => {
    const termos = textoBusca(busca).split(' ').filter(Boolean)
    const filtradas = balancas
      .filter((b) => {
        if (filtro === 'todas') return true
        if (!b.ativo) return false
        if (filtro === 'sem') return !b.ultimaCalibracao
        const s = situacaoValidade(b.proximaCalibracao, hoje, diasAviso)
        return filtro === 'vencidas' ? s === 'VENCIDO' : s === 'VENCENDO'
      })
      .filter((b) => {
        if (!termos.length) return true
        const alvo = textoBusca(
          b.fabricante,
          b.modelo,
          b.numeroSerie,
          b.identificacao,
          b.clienteNome,
          b.localInstalacao,
          b.plataformaFabricante,
          b.plataformaModelo,
          b.plataformaSerie,
          TIPOS_BALANCA[b.tipo],
          capacidadeTexto(b),
          b.ultimoCertificado,
        )
        return termos.every((t) => alvo.includes(t))
      })
    // Nos filtros de prazo, a mais urgente primeiro
    return filtro === 'vencidas' || filtro === 'vencendo'
      ? [...filtradas].sort((a, b) => a.proximaCalibracao.localeCompare(b.proximaCalibracao))
      : filtradas
  }, [balancas, busca, filtro, hoje, diasAviso])

  const excluir = async (b: BalancaResumo) => {
    const ok = await confirmar({
      titulo: `Excluir ${nomeBalanca(b)}?`,
      descricao: 'Esta ação não pode ser desfeita. Balanças com calibrações não podem ser excluídas (desative-as na edição).',
      confirmar: 'Excluir balança',
      perigo: true,
    })
    if (!ok) return
    try {
      await api.excluirBalanca(b.id)
      useTempoReal.getState().mudou('balanca')
      toast.sucesso('Balança excluída')
    } catch (e) {
      avisarErro('Não foi possível excluir', e)
    }
  }

  const situacaoTexto = (b: BalancaResumo) => {
    if (!b.ativo) return 'Desativada'
    if (!b.ultimaCalibracao) return 'Sem calibração'
    const s = prazo(b)
    return s === 'VENCIDO' ? 'Vencida' : s === 'VENCENDO' ? 'Vence em breve' : s === 'VALIDO' ? 'Em dia' : 'Sem data'
  }

  const exportar = () =>
    exportarCSV(
      'balancas.csv',
      [
        'Cliente',
        'Tipo',
        'Fabricante',
        'Modelo',
        'Nº de série',
        'Identificação',
        'Local de instalação',
        'Capacidade',
        'Classe',
        'Plataforma',
        'Certificados',
        'Última calibração',
        'Último certificado',
        'Próxima calibração',
        'Situação',
      ],
      lista.map((b) => [
        b.clienteNome,
        TIPOS_BALANCA[b.tipo],
        b.fabricante,
        b.modelo,
        b.numeroSerie,
        b.identificacao,
        b.localInstalacao,
        capacidadeTexto(b),
        ROTULO_CLASSE[b.classe],
        [b.plataformaFabricante, b.plataformaModelo, b.plataformaSerie && `série ${b.plataformaSerie}`].filter(Boolean).join(' '),
        b.certificados,
        b.ultimaCalibracao ? dataCurta(b.ultimaCalibracao) : '',
        b.ultimoCertificado,
        b.proximaCalibracao ? dataCurta(b.proximaCalibracao) : '',
        situacaoTexto(b),
      ]),
    )

  const filtrando = !!busca.trim() || filtro !== 'todas'

  return (
    <>
      <PageHeader
        titulo="Balanças"
        descricao={`Instrumentos de pesagem dos clientes · ${numero(balancas.length)} ${balancas.length === 1 ? 'balança' : 'balanças'}${inativas ? ' (incluindo desativadas)' : ''}`}
        acoes={
          <>
            <Button
              icone={<Download className="h-4 w-4" />}
              onClick={exportar}
              disabled={!lista.length}
              title="Planilha (CSV) que abre no Excel"
            >
              Exportar
            </Button>
            <Button variante="primary" icone={<Plus className="h-4 w-4" />} onClick={() => setModal({ aberto: true })}>
              Nova balança
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        {/* Em telas de notebook (1280, 1366) o que não cabe passa para a linha de baixo, sem cortar o texto */}
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput
            valor={busca}
            aoMudar={setBusca}
            placeholder="Série, TAG, modelo ou cliente…"
            className="lg:max-w-80 lg:min-w-60 lg:flex-1"
          />
          <Segmented
            className="shrink-0"
            valor={filtro}
            aoMudar={setFiltro}
            opcoes={[
              { valor: 'todas', label: 'Todas', contagem: balancas.length },
              { valor: 'vencidas', label: 'Vencidas', contagem: contagem.vencidas },
              { valor: 'vencendo', label: `Vencem em ${diasAviso} dias`, contagem: contagem.vencendo },
              { valor: 'sem', label: 'Sem calibração', contagem: contagem.sem },
            ]}
          />
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] whitespace-nowrap text-ink-2 lg:ml-auto">
            <input
              type="checkbox"
              checked={inativas}
              onChange={(e) => setInativas(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Mostrar desativadas
          </label>
        </div>

        {carregando ? (
          <EsqueletoTabela />
        ) : erro && !dados ? (
          <EmptyState icone={<Scale className="h-6 w-6" />} titulo="Não foi possível carregar as balanças" descricao={erro} />
        ) : lista.length === 0 ? (
          balancas.length > 0 && filtrando ? (
            <EmptyState
              icone={<SearchX className="h-6 w-6" />}
              titulo="Nenhuma balança encontrada"
              descricao={
                busca.trim() ? `Nada encontrado para “${busca.trim()}” com o filtro atual.` : 'Nenhuma balança nesta situação.'
              }
              acao={
                <Button
                  onClick={() => {
                    setBusca('')
                    setFiltro('todas')
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icone={<Scale className="h-6 w-6" />}
              titulo="Nenhuma balança cadastrada"
              descricao="Cadastre as balanças dos clientes para calibrar e acompanhar os vencimentos."
              acao={
                <Button variante="primary" icone={<Plus className="h-4 w-4" />} onClick={() => setModal({ aberto: true })}>
                  Cadastrar balança
                </Button>
              }
            />
          )
        ) : (
          <Tabela>
            <thead>
              <tr>
                {/* Balança e Cliente ficam com o espaço que sobra e cortam o texto comprido com "…" (max-w-0 nas
                    células, com uma largura mínima; as larguras das que aparecem somam 100 %); as outras colunas não
                    quebram linha. Abaixo de 1366 px a última calibração sai da
                    lista (continua na página da balança) para a tabela caber sem rolar para o lado. */}
                <Th className="w-full md:w-[60%]">Balança</Th>
                <Th className="max-lg:hidden">Série / TAG</Th>
                <Th className="w-[40%] max-md:hidden">Cliente</Th>
                <Th className="max-[1366px]:hidden">Última calibração</Th>
                <Th>Próxima</Th>
                <Th className="w-10">
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((b, i) => (
                <Linha key={b.id} indice={i} aoClicar={() => navegar(`/balancas/${b.id}`)}>
                  <Td className="max-w-0 min-w-48">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                        <Scale className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-ink">
                          <span className="truncate" title={nomeBalanca(b)}>
                            {nomeBalanca(b)}
                          </span>
                          {!b.ativo && <Badge tom="neutral">Desativada</Badge>}
                        </p>
                        <p className="truncate text-xs text-muted" title={`${TIPOS_BALANCA[b.tipo]} · ${capacidadeTexto(b)}`}>
                          {TIPOS_BALANCA[b.tipo]} · <span className="tnum">{capacidadeTexto(b)}</span>
                        </p>
                        {/* Telas estreitas: série e cliente aparecem aqui, já que as colunas somem */}
                        <p className="tnum truncate text-xs text-muted lg:hidden">
                          {[b.numeroSerie && `Série ${b.numeroSerie}`, b.identificacao].filter(Boolean).join(' · ')}
                          <span className="md:hidden">
                            {(b.numeroSerie || b.identificacao) && ' · '}
                            {b.clienteNome}
                          </span>
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="tnum whitespace-nowrap max-lg:hidden">
                    {b.numeroSerie || <span className="text-muted">—</span>}
                    {b.identificacao && <p className="text-xs text-muted">{b.identificacao}</p>}
                  </Td>
                  <Td className="max-w-0 min-w-32 max-md:hidden">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navegar(`/clientes/${b.clienteId}`)
                      }}
                      className="block max-w-full cursor-pointer truncate text-left text-ink-2 hover:text-brand-ink hover:underline"
                      title={b.clienteNome}
                    >
                      {b.clienteNome}
                    </button>
                    {b.localInstalacao && <p className="truncate text-xs text-muted">{b.localInstalacao}</p>}
                  </Td>
                  <Td className="whitespace-nowrap max-[1366px]:hidden">
                    {b.ultimaCalibracao ? (
                      <>
                        <p className="tnum">{dataCurta(b.ultimaCalibracao)}</p>
                        {b.ultimoCertificado && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              navegar(`/calibracoes/${b.ultimoCertificadoId}`)
                            }}
                            className="tnum cursor-pointer text-xs text-muted hover:text-brand-ink hover:underline"
                          >
                            Nº {b.ultimoCertificado}
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted">Nunca calibrada</span>
                    )}
                  </Td>
                  <Td className="lg:whitespace-nowrap">
                    {b.proximaCalibracao ? (
                      <div>
                        <p className="tnum">{dataCurta(b.proximaCalibracao)}</p>
                        <PrazoBadge data={b.proximaCalibracao} diasAviso={diasAviso} className="text-xs" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{b.ultimaCalibracao ? 'Sem data' : 'Sem calibração'}</span>
                    )}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <Menu
                      gatilho={(abrir) => (
                        <Button variante="ghost" tamanho="icon-sm" onClick={abrir} aria-label={`Ações de ${nomeBalanca(b)}`}>
                          <Ellipsis className="h-4 w-4" />
                        </Button>
                      )}
                      itens={[
                        {
                          label: 'Editar',
                          icone: <Pencil className="h-4 w-4" />,
                          aoClicar: () => setModal({ aberto: true, balanca: b }),
                        },
                        {
                          label: 'Nova calibração',
                          icone: <FilePlus2 className="h-4 w-4" />,
                          aoClicar: () => navegar(`/calibracoes/nova?balanca=${b.id}`),
                        },
                        {
                          label: 'Ver cliente',
                          icone: <Building2 className="h-4 w-4" />,
                          aoClicar: () => navegar(`/clientes/${b.clienteId}`),
                        },
                        ...(podeExcluir
                          ? ([
                              'sep',
                              {
                                label: 'Excluir',
                                icone: <Trash2 className="h-4 w-4" />,
                                aoClicar: () => void excluir(b),
                                perigo: true,
                              },
                            ] as const)
                          : []),
                      ]}
                    />
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </Card>

      <BalancaFormModal
        aberto={modal.aberto}
        aoFechar={fecharModal}
        balanca={modal.balanca}
        clienteId={modal.clienteId}
        aoSalvar={(b) => {
          if (!modal.balanca) destino.current = `/balancas/${b.id}`
        }}
      />
    </>
  )
}

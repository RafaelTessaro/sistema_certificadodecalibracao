import { Building2, Download, Ellipsis, Pencil, Plus, Scale, Trash2, User, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { ClienteResumo, TipoCliente } from '#shared/tipos.ts'
import { ClienteFormModal } from '../components/ClienteFormModal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { confirmar } from '../components/ui/Feedback'
import { Avatar, EmptyState, Menu, PageHeader, SearchInput, Segmented } from '../components/ui/Misc'
import { Linha, Tabela, Td, Th } from '../components/ui/Table'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { rotuloSituacao, situacaoPedeAtencao, tomSituacao } from '../lib/consultas'
import { exportarCSV } from '../lib/csv'
import { dataCurta, normalizar, numero } from '../lib/format'
import { enderecoCliente } from '#shared/dominio.ts'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'

export function Clientes() {
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const podeExcluir = usePode('excluirCliente')
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<'todos' | TipoCliente>('todos')
  const [inativos, setInativos] = useState(false)
  const { dados, carregando, erro } = useConsulta(
    `clientes:${inativos}`,
    () => api.clientes({ inativos }).then((r) => r.clientes),
    ['cliente', 'balanca', 'calibracao'],
  )
  const clientes = useMemo(() => dados ?? [], [dados])
  const [modalLocal, setModal] = useState<{ aberto: boolean; cliente?: ClienteResumo }>({ aberto: false })
  // `?novo=1` (vindo do painel ou da busca global) abre o cadastro direto
  const modal = params.get('novo') === '1' ? { aberto: true } : modalLocal
  const fecharModal = () => {
    setModal({ aberto: false })
    if (params.has('novo')) setParams({}, { replace: true })
  }

  const contagem = useMemo(() => ({ PJ: clientes.filter((c) => c.tipo === 'PJ').length, PF: clientes.filter((c) => c.tipo === 'PF').length }), [clientes])

  const lista = useMemo(() => {
    const q = normalizar(busca)
    const digitos = busca.replace(/[^\dA-Za-z]/g, '').toLowerCase()
    return clientes
      .filter((c) => tipo === 'todos' || c.tipo === tipo)
      .filter(
        (c) =>
          !q ||
          normalizar(`${c.nome} ${c.razaoSocial} ${c.documento} ${c.contato} ${c.cidade} ${c.telefone} ${c.email}`).includes(q) ||
          (digitos.length >= 3 && /\d/.test(digitos) && c.documento.replace(/[^\dA-Za-z]/g, '').toLowerCase().includes(digitos)),
      )
  }, [clientes, busca, tipo])

  const excluir = async (c: ClienteResumo) => {
    const ok = await confirmar({
      titulo: `Excluir ${c.nome}?`,
      descricao: 'Esta ação não pode ser desfeita. Clientes com calibrações não podem ser excluídos (desative-os).',
      confirmar: 'Excluir cliente',
      perigo: true,
    })
    if (!ok) return
    try {
      await api.excluirCliente(c.id)
      useTempoReal.getState().mudou('cliente')
      toast.sucesso('Cliente excluído')
    } catch (e) {
      avisarErro('Não foi possível excluir', e)
    }
  }

  const exportar = () =>
    exportarCSV(
      'clientes.csv',
      ['Nome', 'Razão social', 'CPF/CNPJ', 'Inscrição estadual', 'Contato', 'Telefone', 'Celular', 'E-mail', 'E-mails dos certificados', 'Endereço', 'Cidade', 'UF', 'Balanças', 'Certificados', 'Última calibração'],
      lista.map((c) => [
        c.nome,
        c.razaoSocial,
        c.documento,
        c.inscricaoEstadual,
        c.contato,
        c.telefone,
        c.celular,
        c.email,
        c.emailCertificados,
        enderecoCliente(c),
        c.cidade,
        c.uf,
        c.balancas,
        c.certificados,
        c.ultimaCalibracao ? dataCurta(c.ultimaCalibracao) : '',
      ]),
    )

  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao={`${numero(clientes.length)} ${clientes.length === 1 ? 'cliente' : 'clientes'}${inativos ? ' (incluindo desativados)' : ''}`}
        acoes={
          <>
            <Button icone={<Download className="h-4 w-4" />} onClick={exportar} disabled={!lista.length} title="Planilha (CSV) que abre no Excel">
              Exportar
            </Button>
            <Button variante="primary" icone={<Plus className="h-4 w-4" />} onClick={() => setModal({ aberto: true })}>
              Novo cliente
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center">
          <SearchInput valor={busca} aoMudar={setBusca} placeholder="Buscar por nome, CNPJ, CPF, cidade…" className="md:w-80" />
          <Segmented
            valor={tipo}
            aoMudar={setTipo}
            opcoes={[
              { valor: 'todos', label: 'Todos', contagem: clientes.length },
              { valor: 'PJ', label: 'Empresas', contagem: contagem.PJ },
              { valor: 'PF', label: 'Pessoas', contagem: contagem.PF },
            ]}
          />
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 md:ml-auto">
            <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Mostrar desativados
          </label>
        </div>

        {carregando ? (
          <EsqueletoTabela />
        ) : erro && !dados ? (
          <EmptyState icone={<Users className="h-6 w-6" />} titulo="Não foi possível carregar os clientes" descricao={erro} />
        ) : lista.length === 0 ? (
          <EmptyState
            icone={<Users className="h-6 w-6" />}
            titulo={clientes.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            descricao={
              clientes.length
                ? 'Tente outra busca ou mude o filtro.'
                : 'Cadastre o primeiro cliente: digite o CNPJ e os dados da empresa são preenchidos sozinhos.'
            }
            acao={
              !clientes.length && (
                <Button variante="primary" icone={<Plus className="h-4 w-4" />} onClick={() => setModal({ aberto: true })}>
                  Cadastrar cliente
                </Button>
              )
            }
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th className="max-lg:hidden">Cidade</Th>
                <Th className="max-md:hidden">Contato</Th>
                <Th alinhar="right">Balanças</Th>
                <Th alinhar="right" className="max-sm:hidden">
                  Certificados
                </Th>
                <Th className="max-md:hidden">Última calibração</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lista.map((c, i) => (
                <Linha key={c.id} indice={i} aoClicar={() => navegar(`/clientes/${c.id}`)}>
                  <Td>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar nome={c.nome} className="h-9 w-9 shrink-0 rounded-xl text-xs" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-medium text-ink">
                          <span className="truncate">{c.nome}</span>
                          {!c.ativo && <Badge tom="neutral">Desativado</Badge>}
                          {situacaoPedeAtencao(c) && <Badge tom={tomSituacao(c.situacaoCadastral)}>{rotuloSituacao(c.situacaoCadastral)}</Badge>}
                        </p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                          {c.tipo === 'PJ' ? <Building2 className="h-3 w-3 shrink-0" /> : <User className="h-3 w-3 shrink-0" />}
                          <span className="tnum truncate">{c.documento || (c.tipo === 'PJ' ? 'Sem CNPJ' : 'Sem CPF')}</span>
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="max-lg:hidden">{[c.cidade, c.uf].filter(Boolean).join('/') || <span className="text-muted">—</span>}</Td>
                  <Td className="max-md:hidden">
                    <p className="truncate text-ink-2">{c.contato || c.telefone || c.celular || '—'}</p>
                    {c.email && <p className="truncate text-xs text-muted">{c.email}</p>}
                  </Td>
                  <Td alinhar="right">
                    <span className="inline-flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 text-muted" />
                      {c.balancas}
                    </span>
                  </Td>
                  <Td alinhar="right" className="max-sm:hidden">
                    {c.certificados}
                  </Td>
                  <Td className="tnum max-md:hidden">{c.ultimaCalibracao ? dataCurta(c.ultimaCalibracao) : <span className="text-muted">—</span>}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <Menu
                      gatilho={(abrir) => (
                        <Button variante="ghost" tamanho="icon-sm" onClick={abrir} aria-label={`Ações de ${c.nome}`}>
                          <Ellipsis className="h-4 w-4" />
                        </Button>
                      )}
                      itens={[
                        { label: 'Editar', icone: <Pencil className="h-4 w-4" />, aoClicar: () => setModal({ aberto: true, cliente: c }) },
                        {
                          label: 'Nova balança',
                          icone: <Scale className="h-4 w-4" />,
                          aoClicar: () => navegar(`/balancas?nova=1&cliente=${c.id}`),
                        },
                        ...(podeExcluir
                          ? ([
                              'sep',
                              { label: 'Excluir', icone: <Trash2 className="h-4 w-4" />, aoClicar: () => void excluir(c), perigo: true },
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

      <ClienteFormModal
        aberto={modal.aberto}
        aoFechar={fecharModal}
        cliente={modalLocal.cliente}
        aoSalvar={(c) => {
          if (!modalLocal.cliente) navegar(`/clientes/${c.id}`)
        }}
      />
    </>
  )
}

/** Linhas de carregamento (só na primeira carga). */
export function EsqueletoTabela({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-surface-3" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded-full bg-surface-3" />
            <div className="h-2.5 w-1/5 animate-pulse rounded-full bg-surface-2" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded-full bg-surface-2" />
        </div>
      ))}
    </div>
  )
}

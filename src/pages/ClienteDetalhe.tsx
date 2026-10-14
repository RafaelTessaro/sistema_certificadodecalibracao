import {
  ArrowLeft,
  BellRing,
  Building2,
  CalendarCheck,
  FileBadge2,
  FilePlus2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Scale,
  Send,
  Trash2,
  User,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { capacidadeTexto, enderecoCliente, TIPOS_BALANCA } from '#shared/dominio.ts'
import { BalancaFormModal } from '../components/BalancaFormModal'
import { CertificadosTabela } from '../components/CertificadosTabela'
import { ClienteFormModal } from '../components/ClienteFormModal'
import { PrazoBadge } from '../components/Selos'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { confirmar } from '../components/ui/Feedback'
import { Avatar, EmptyState, PageHeader, StatCard } from '../components/ui/Misc'
import { Linha, Tabela, Td, Th } from '../components/ui/Table'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { ROTULO_TIPO_CLIENTE, rotuloSituacao, situacaoPedeAtencao, tomSituacao } from '../lib/consultas'
import { dataCurta, dataHora, numero } from '../lib/format'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'

export function ClienteDetalhe() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const podeExcluir = usePode('excluirCliente')
  const [editando, setEditando] = useState(false)
  const [novaBalanca, setNovaBalanca] = useState(false)
  const { dados, carregando, erro } = useConsulta(`cliente:${id}`, () => api.cliente(id), ['cliente', 'balanca', 'calibracao'])
  const cliente = dados?.cliente
  const balancas = useMemo(() => dados?.balancas ?? [], [dados])
  const calibracoes = useMemo(() => dados?.calibracoes ?? [], [dados])
  const emitidos = calibracoes.filter((k) => k.status === 'EMITIDO')
  const proxima = useMemo(
    () =>
      balancas
        .filter((b) => b.ativo && b.proximaCalibracao)
        .map((b) => b.proximaCalibracao)
        .sort()[0] ?? '',
    [balancas],
  )

  if (carregando) return <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
  if (!cliente)
    return (
      <EmptyState
        icone={<User className="h-6 w-6" />}
        titulo="Cliente não encontrado"
        descricao={erro}
        acao={<Button onClick={() => navegar('/clientes')}>Voltar para clientes</Button>}
      />
    )

  const excluir = async () => {
    const ok = await confirmar({
      titulo: `Excluir ${cliente.nome}?`,
      descricao: 'Esta ação não pode ser desfeita.',
      confirmar: 'Excluir cliente',
      perigo: true,
    })
    if (!ok) return
    try {
      await api.excluirCliente(cliente.id)
      useTempoReal.getState().mudou('cliente')
      toast.sucesso('Cliente excluído')
      navegar('/clientes', { replace: true })
    } catch (e) {
      avisarErro('Não foi possível excluir', e)
    }
  }

  const emailsCert = cliente.emailCertificados || cliente.email

  return (
    <>
      <PageHeader
        voltar={
          <button
            type="button"
            onClick={() => navegar('/clientes')}
            className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" /> Clientes
          </button>
        }
        titulo={
          <span className="flex items-center gap-3">
            <Avatar nome={cliente.nome} className="h-11 w-11 rounded-2xl text-sm" />
            <span className="min-w-0">
              <span className="block truncate">{cliente.nome}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-normal tracking-normal text-muted">
                <Badge tom="neutral" ponto={false}>
                  {cliente.tipo === 'PJ' ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                  {ROTULO_TIPO_CLIENTE[cliente.tipo]}
                </Badge>
                {!cliente.ativo && <Badge tom="neutral">Desativado</Badge>}
                {cliente.documento && <span className="tnum">{cliente.documento}</span>}
              </span>
            </span>
          </span>
        }
        acoes={
          <>
            {podeExcluir && (
              <Button variante="ghost" icone={<Trash2 className="h-4 w-4" />} onClick={() => void excluir()}>
                Excluir
              </Button>
            )}
            <Button icone={<Pencil className="h-4 w-4" />} onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button
              variante="primary"
              icone={<FilePlus2 className="h-4 w-4" />}
              onClick={() => navegar(`/calibracoes/nova?cliente=${cliente.id}`)}
            >
              Nova calibração
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          rotulo="Balanças"
          valor={balancas.filter((b) => b.ativo).length}
          formatar={(v) => numero(Math.round(v))}
          icone={<Scale className="h-4 w-4" />}
          destaque
        />
        <StatCard
          rotulo="Certificados emitidos"
          valor={emitidos.length}
          formatar={(v) => numero(Math.round(v))}
          icone={<FileBadge2 className="h-4 w-4" />}
          delay={0.04}
        />
        <StatCard
          key={`u-${emitidos[0]?.id ?? ''}`}
          rotulo="Última calibração"
          valor={0}
          formatar={() => (emitidos[0] ? dataCurta(emitidos[0].dataCalibracao) : '—')}
          icone={<CalendarCheck className="h-4 w-4" />}
          detalhe={emitidos[0]?.numero}
          delay={0.08}
        />
        <StatCard
          key={`p-${proxima}`}
          rotulo="Próxima calibração"
          valor={0}
          formatar={() => (proxima ? dataCurta(proxima) : '—')}
          icone={<BellRing className="h-4 w-4" />}
          detalhe={proxima ? <PrazoBadge data={proxima} /> : 'Sem data combinada'}
          delay={0.12}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader titulo="Dados cadastrais" />
          {cliente.tipo === 'PJ' && situacaoPedeAtencao(cliente) && (
            <p className="mx-5 mb-3 rounded-xl bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning">
              Situação na Receita: {rotuloSituacao(cliente.situacaoCadastral)}
            </p>
          )}
          <dl className="flex flex-col gap-4 px-5 pb-5 text-sm">
            {cliente.tipo === 'PJ' && <Dado rotulo="Razão social (sai no certificado)">{cliente.razaoSocial}</Dado>}
            {cliente.tipo === 'PJ' && cliente.situacaoCadastral && (
              <Dado rotulo="Situação na Receita">
                <Badge tom={tomSituacao(cliente.situacaoCadastral)}>{rotuloSituacao(cliente.situacaoCadastral)}</Badge>
              </Dado>
            )}
            {cliente.inscricaoEstadual && <Dado rotulo="Inscrição estadual">{cliente.inscricaoEstadual}</Dado>}
            <Dado rotulo="Contato" icone={<User className="h-4 w-4" />}>
              {cliente.contato}
            </Dado>
            <Dado rotulo="Telefones" icone={<Phone className="h-4 w-4" />}>
              {[cliente.telefone, cliente.celular].filter(Boolean).join(' · ')}
            </Dado>
            <Dado rotulo="E-mail" icone={<Mail className="h-4 w-4" />}>
              {cliente.email}
            </Dado>
            <Dado rotulo="Recebem os certificados" icone={<Send className="h-4 w-4" />}>
              {emailsCert}
            </Dado>
            <Dado rotulo="Endereço" icone={<MapPin className="h-4 w-4" />}>
              {enderecoCliente(cliente)}
            </Dado>
            {cliente.observacoes && <Dado rotulo="Observações internas">{cliente.observacoes}</Dado>}
            <p className="text-xs text-muted">Cliente desde {dataCurta(cliente.criadoEm)}</p>
          </dl>
        </Card>

        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader
              icone={<Scale className="h-4 w-4" />}
              titulo="Balanças"
              descricao={`${balancas.length} ${balancas.length === 1 ? 'balança' : 'balanças'}`}
              acoes={
                <Button tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setNovaBalanca(true)}>
                  Nova balança
                </Button>
              }
            />
            {balancas.length ? (
              <Tabela className="border-t border-line">
                <thead>
                  <tr>
                    <Th>Balança</Th>
                    <Th className="max-sm:hidden">Série / TAG</Th>
                    <Th className="max-md:hidden">Última</Th>
                    <Th>Próxima</Th>
                  </tr>
                </thead>
                <tbody>
                  {balancas.map((b, i) => (
                    <Linha key={b.id} indice={i} aoClicar={() => navegar(`/balancas/${b.id}`)}>
                      <Td>
                        <p className="font-medium text-ink">
                          {[b.fabricante, b.modelo].filter(Boolean).join(' ') || TIPOS_BALANCA[b.tipo]}
                          {!b.ativo && <Badge className="ml-2">Desativada</Badge>}
                        </p>
                        <p className="text-xs text-muted">
                          {TIPOS_BALANCA[b.tipo]} · {capacidadeTexto(b)}
                        </p>
                      </Td>
                      <Td className="tnum max-sm:hidden">
                        {b.numeroSerie || '—'}
                        {b.identificacao && <p className="text-xs text-muted">{b.identificacao}</p>}
                      </Td>
                      <Td className="tnum max-md:hidden">{b.ultimaCalibracao ? dataCurta(b.ultimaCalibracao) : '—'}</Td>
                      <Td>
                        {b.proximaCalibracao ? (
                          <div>
                            <p className="tnum">{dataCurta(b.proximaCalibracao)}</p>
                            <PrazoBadge data={b.proximaCalibracao} className="text-xs" />
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            ) : (
              <EmptyState
                icone={<Scale className="h-6 w-6" />}
                titulo="Nenhuma balança cadastrada"
                descricao="Cadastre as balanças deste cliente para calibrar e acompanhar os vencimentos."
                acao={
                  <Button variante="primary" icone={<Plus className="h-4 w-4" />} onClick={() => setNovaBalanca(true)}>
                    Cadastrar balança
                  </Button>
                }
              />
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              icone={<FileBadge2 className="h-4 w-4" />}
              titulo="Certificados"
              descricao={`${calibracoes.length} ${calibracoes.length === 1 ? 'calibração' : 'calibrações'}`}
            />
            {calibracoes.length ? (
              <div className="border-t border-line">
                <CertificadosTabela itens={calibracoes} ocultarCliente />
              </div>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-muted">Nenhuma calibração deste cliente ainda.</p>
            )}
          </Card>

          {!!dados?.envios.length && (
            <Card className="overflow-hidden">
              <CardHeader icone={<Mail className="h-4 w-4" />} titulo="E-mails enviados" />
              <ul className="divide-y divide-line border-t border-line">
                {dados.envios.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
                      {e.tipo === 'LEMBRETE' ? <BellRing className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{e.assunto}</p>
                      <p className="truncate text-xs text-muted">
                        Para {e.para} · por {e.usuarioNome}
                      </p>
                    </div>
                    <span className="text-xs whitespace-nowrap text-muted">{dataHora(e.em)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ClienteFormModal aberto={editando} cliente={cliente} aoFechar={() => setEditando(false)} />
      <BalancaFormModal aberto={novaBalanca} aoFechar={() => setNovaBalanca(false)} clienteId={cliente.id} />
    </>
  )
}

export function Dado({ rotulo, icone, children }: { rotulo: string; icone?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icone}
        {rotulo}
      </dt>
      <dd className="mt-1 break-words text-ink-2">{children || <span className="text-muted">—</span>}</dd>
    </div>
  )
}

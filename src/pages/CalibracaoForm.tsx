import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  ClipboardList,
  Cloud,
  CloudOff,
  Crosshair,
  FileCheck2,
  Loader2,
  Plus,
  Repeat,
  Scale,
  ScanEye,
  Thermometer,
  Trash2,
  Weight,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { capacidadeTexto, pendenciasEmissao, TIPOS_BALANCA } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente, Configuracoes, Padrao } from '#shared/tipos.ts'
import { BalancaFormModal } from '../components/BalancaFormModal'
import { recomporCargas } from '../components/calibracao/cargas'
import type { ContextoEtapa, IdEtapa } from '../components/calibracao/contexto'
import { EtapaConclusao } from '../components/calibracao/EtapaConclusao'
import { EtapaExcentricidade } from '../components/calibracao/EtapaExcentricidade'
import { EtapaIdentificacao } from '../components/calibracao/EtapaIdentificacao'
import { EtapaIndicacao } from '../components/calibracao/EtapaIndicacao'
import { EtapaInstrumento } from '../components/calibracao/EtapaInstrumento'
import { EtapaPadroes } from '../components/calibracao/EtapaPadroes'
import { EtapaRepetibilidade } from '../components/calibracao/EtapaRepetibilidade'
import { EtapaRevisao } from '../components/calibracao/EtapaRevisao'
import { PainelResultados } from '../components/calibracao/PainelResultados'
import { ClienteFormModal } from '../components/ClienteFormModal'
import { StatusCalibracaoBadge } from '../components/Selos'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Combobox } from '../components/ui/Combobox'
import { confirmar } from '../components/ui/Feedback'
import { Field, Input } from '../components/ui/Form'
import { Modal } from '../components/ui/Modal'
import { EmptyState, PageHeader } from '../components/ui/Misc'
import { api, ErroApi, type MembroEquipe } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { dataCurta, hojeISO } from '../lib/format'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'

export function CalibracaoForm() {
  const { id } = useParams()
  return id ? <EditorCalibracao key={id} id={id} /> : <NovaCalibracao />
}

// ---- Começo: cliente, balança e OS ------------------------------------------------------

function NovaCalibracao() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '')
  const [balancaId, setBalancaId] = useState(params.get('balanca') ?? '')
  const [os, setOs] = useState('')
  const [criando, setCriando] = useState(false)
  const [novoCliente, setNovoCliente] = useState<string | null>(null)
  const [novaBalanca, setNovaBalanca] = useState(false)
  const { dados: clientes } = useConsulta('clientes:false', () => api.clientes().then((r) => r.clientes), ['cliente'])
  const { dados: balancas } = useConsulta(
    clienteId ? `balancas:cliente:${clienteId}` : null,
    () => api.balancas({ clienteId }).then((r) => r.balancas),
    ['balanca', 'calibracao'],
  )
  // Veio com a balança (ex.: da lista de vencimentos): descobre o cliente dela
  const { dados: balancaInicial } = useConsulta(
    balancaId && !clienteId ? `balanca:${balancaId}` : null,
    () => api.balanca(balancaId),
    ['balanca'],
  )
  useEffect(() => {
    if (balancaInicial && !clienteId) setClienteId(balancaInicial.balanca.clienteId)
  }, [balancaInicial, clienteId])

  const comecar = async () => {
    setCriando(true)
    try {
      const r = await api.criarCalibracao({ clienteId, balancaId, ordemServico: os })
      useTempoReal.getState().mudou('calibracao')
      navegar(`/calibracoes/${r.calibracao.id}/editar`, { replace: true })
    } catch (e) {
      avisarErro('Não foi possível começar a calibração', e)
      setCriando(false)
    }
  }

  return (
    <>
      <PageHeader
        voltar={<Voltar para="/certificados" rotulo="Certificados" />}
        titulo="Nova calibração"
        descricao="Escolha o cliente e a balança. Depois é só seguir as etapas."
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card>
          <CardHeader icone={<Building2 className="h-4 w-4" />} titulo="1. Cliente" />
          <div className="px-5 pb-5">
            <Combobox
              opcoes={(clientes ?? []).map((c) => ({
                valor: c.id,
                label: c.nome,
                detalhe: [c.documento, c.cidade].filter(Boolean).join(' · '),
              }))}
              valor={clienteId}
              aoMudar={(v) => {
                setClienteId(v)
                setBalancaId('')
              }}
              placeholder="Buscar cliente pelo nome ou CNPJ…"
              vazio="Nenhum cliente encontrado"
              acaoCriar={{ label: 'Cadastrar novo cliente', aoClicar: (texto) => setNovoCliente(texto) }}
            />
          </div>
        </Card>

        <Card className={cn(!clienteId && 'pointer-events-none opacity-50')}>
          <CardHeader
            icone={<Scale className="h-4 w-4" />}
            titulo="2. Balança"
            acoes={
              clienteId && (
                <Button tamanho="sm" icone={<Plus className="h-3.5 w-3.5" />} onClick={() => setNovaBalanca(true)}>
                  Nova balança
                </Button>
              )
            }
          />
          <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
            {clienteId && balancas?.length === 0 && (
              <p className="text-sm text-muted sm:col-span-2">Este cliente ainda não tem balanças. Cadastre a primeira.</p>
            )}
            {(balancas ?? []).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBalancaId(b.id)}
                aria-pressed={balancaId === b.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-all',
                  balancaId === b.id
                    ? 'border-brand bg-brand-soft/60 ring-1 ring-brand/30'
                    : 'border-line hover:border-line-strong hover:bg-surface-2/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    balancaId === b.id ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-2',
                  )}
                >
                  {balancaId === b.id ? <Check className="h-5 w-5" /> : <Scale className="h-5 w-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">
                    {[b.fabricante, b.modelo].filter(Boolean).join(' ') || TIPOS_BALANCA[b.tipo]}
                  </span>
                  <span className="block truncate text-[13px] text-ink-2">{capacidadeTexto(b)}</span>
                  <span className="block truncate text-xs text-muted">
                    {b.numeroSerie ? `Série ${b.numeroSerie}` : 'Sem nº de série'}
                    {b.identificacao && ` · ${b.identificacao}`}
                  </span>
                  {b.ultimaCalibracao && (
                    <span className="mt-1 block text-xs text-muted">Última calibração: {dataCurta(b.ultimaCalibracao)}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className={cn(!balancaId && 'pointer-events-none opacity-50')}>
          <CardHeader icone={<ClipboardList className="h-4 w-4" />} titulo="3. Ordem de serviço" />
          <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end">
            <Field
              label="Nº da OS no sistema da empresa"
              htmlFor="nova-os"
              className="sm:w-64"
              hint="Para saber a qual OS este certificado pertence."
            >
              <Input id="nova-os" value={os} onChange={(e) => setOs(e.target.value)} placeholder="Opcional" />
            </Field>
            <Button
              variante="primary"
              className="sm:ml-auto"
              icone={criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              disabled={!clienteId || !balancaId || criando}
              onClick={() => void comecar()}
            >
              Começar calibração
            </Button>
          </div>
        </Card>
      </div>

      <ClienteFormModal
        aberto={novoCliente !== null}
        aoFechar={() => setNovoCliente(null)}
        nomeInicial={novoCliente ?? ''}
        aoSalvar={(c) => {
          setClienteId(c.id)
          setBalancaId('')
          setNovaBalanca(true)
        }}
      />
      <BalancaFormModal
        aberto={novaBalanca}
        aoFechar={() => setNovaBalanca(false)}
        clienteId={clienteId}
        aoSalvar={(b) => setBalancaId(b.id)}
      />
    </>
  )
}

function Voltar({ para, rotulo }: { para: string; rotulo: string }) {
  const navegar = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navegar(para)}
      className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" /> {rotulo}
    </button>
  )
}

// ---- Editor (etapas) -------------------------------------------------------------------------

const ETAPAS: Array<{ id: IdEtapa; titulo: string; icone: ReactNode }> = [
  { id: 'identificacao', titulo: 'Cliente e OS', icone: <Building2 className="h-4 w-4" /> },
  { id: 'instrumento', titulo: 'Balança e ajuste', icone: <Scale className="h-4 w-4" /> },
  { id: 'padroes', titulo: 'Padrões e ambiente', icone: <Thermometer className="h-4 w-4" /> },
  { id: 'repetibilidade', titulo: 'Repetibilidade', icone: <Repeat className="h-4 w-4" /> },
  { id: 'excentricidade', titulo: 'Excentricidade', icone: <Crosshair className="h-4 w-4" /> },
  { id: 'indicacao', titulo: 'Erro de indicação', icone: <Weight className="h-4 w-4" /> },
  { id: 'conclusao', titulo: 'Conclusão', icone: <ClipboardList className="h-4 w-4" /> },
  { id: 'revisao', titulo: 'Revisão e emissão', icone: <FileCheck2 className="h-4 w-4" /> },
]

/** Só os dados de entrada (o que a tela edita) de uma calibração gravada. */
function entradaDe(k: Calibracao): CalibracaoInput {
  const {
    id: _id,
    versao: _v,
    status: _s,
    numero: _n,
    ano: _a,
    sequencia: _q,
    revisao: _r,
    emissao: _e,
    cancelamento: _c,
    criadoPor: _p,
    criadoEm: _ce,
    atualizadoEm: _ae,
    ...entrada
  } = k
  return entrada
}

type EstadoSalvo = 'salvo' | 'pendente' | 'salvando' | 'erro'

interface Carregado {
  calibracao: Calibracao
  cliente: Cliente
  balanca: Balanca
  padroes: Padrao[]
  config: Configuracoes
  equipe: MembroEquipe[]
}

function EditorCalibracao({ id }: { id: string }) {
  const navegar = useNavigate()
  const [dados, setDados] = useState<Carregado | null>(null)
  const [erro, setErro] = useState('')
  const [f, setF] = useState<CalibracaoInput | null>(null)
  const [etapa, setEtapa] = useState<IdEtapa>('identificacao')
  const [salvo, setSalvo] = useState<EstadoSalvo>('salvo')
  const [pendenciasServidor, setPendenciasServidor] = useState<string[]>([])
  const [editandoBalanca, setEditandoBalanca] = useState(false)
  const [previa, setPrevia] = useState<{ url: string } | { carregando: true } | null>(null)
  const versao = useRef<number | undefined>(undefined)
  const sujo = useRef(false)
  const fRef = useRef<CalibracaoInput | null>(null)
  fRef.current = f

  // Carga inicial (uma vez): a edição não é recarregada pelo tempo real para não perder o que se digita
  useEffect(() => {
    let ativo = true
    Promise.all([api.calibracao(id), api.padroes(), api.config(), api.equipe()])
      .then(([d, p, c, e]) => {
        if (!ativo) return
        const k = d.calibracao
        if (k.status !== 'RASCUNHO' && k.status !== 'REVISAO') {
          navegar(`/calibracoes/${id}`, { replace: true })
          return
        }
        if (!d.cliente || !d.balanca) throw new Error('O cliente ou a balança desta calibração não existe mais.')
        versao.current = k.versao
        setDados({
          calibracao: k,
          cliente: d.cliente,
          balanca: d.balanca,
          padroes: p.padroes,
          config: c.config,
          equipe: e.equipe,
        })
        setF(entradaDe(k))
        setPendenciasServidor(d.pendencias)
        // Retoma na primeira etapa ainda sem dados
        if (k.indicacao.pontos.some((x) => x.crescente !== null)) setEtapa('revisao')
        else if (k.repetibilidade.length) setEtapa('excentricidade')
      })
      .catch((e: unknown) => ativo && setErro(e instanceof Error ? e.message : 'Erro inesperado.'))
    return () => {
      ativo = false
    }
  }, [id, navegar])

  const balanca = dados?.balanca
  const selecionados = useMemo(
    () => (f && dados ? f.padroesIds.map((pid) => dados.padroes.find((p) => p.id === pid)).filter((p): p is Padrao => !!p) : []),
    [f, dados],
  )

  const alterar = useCallback((mudar: (f: CalibracaoInput) => CalibracaoInput) => {
    setF((atual) => {
      if (!atual) return atual
      const novo = mudar(atual)
      if (novo !== atual) {
        sujo.current = true
        setSalvo('pendente')
      }
      return novo
    })
  }, [])

  // Pesos escolhidos mudaram: refaz a montagem automática das cargas
  const chavePadroes = f?.padroesIds.join(',') ?? ''
  useEffect(() => {
    if (!balanca) return
    alterar((atual) =>
      recomporCargas(
        atual,
        balanca,
        selecionados.filter((p) => p.tipo === 'PESOS'),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavePadroes, balanca])

  const salvar = useCallback(async (): Promise<boolean> => {
    const atual = fRef.current
    if (!atual || !sujo.current) return true
    sujo.current = false
    setSalvo('salvando')
    try {
      const r = await api.salvarCalibracao(id, atual, versao.current)
      versao.current = r.calibracao.versao
      setPendenciasServidor(r.pendencias)
      setSalvo(sujo.current ? 'pendente' : 'salvo')
      useTempoReal.getState().mudou('calibracao')
      return true
    } catch (e) {
      sujo.current = true
      setSalvo('erro')
      if (e instanceof ErroApi && e.status === 409) {
        const recarregar = await confirmar({
          titulo: 'Outra pessoa alterou esta calibração',
          descricao: 'Para não misturar as alterações, recarregue a página. O que você digitou agora pode se perder.',
          confirmar: 'Recarregar',
        })
        if (recarregar) location.reload()
      } else if (!(e instanceof ErroApi && e.status === 401)) avisarErro('Não foi possível salvar o rascunho', e)
      return false
    }
  }, [id])

  // Gravação automática 1 s depois da última alteração
  useEffect(() => {
    if (salvo !== 'pendente') return
    const t = setTimeout(() => void salvar(), 1000)
    return () => clearTimeout(t)
  }, [f, salvo, salvar])

  // Saindo da página com alterações: grava na hora (e o navegador avisa se fechar a aba)
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (sujo.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', aviso)
    return () => {
      window.removeEventListener('beforeunload', aviso)
      if (sujo.current) void salvar()
    }
  }, [salvar])

  const calc = useMemo(() => {
    if (!f || !balanca) return null
    try {
      return calcularCalibracao(f, balanca, selecionados)
    } catch {
      return null
    }
  }, [f, balanca, selecionados])

  // Pendências calculadas aqui na hora (o servidor confere de novo ao emitir)
  const pendencias = useMemo(() => {
    if (!f || !dados) return pendenciasServidor
    const locais = pendenciasEmissao(f, {
      padroes: selecionados,
      hoje: hojeISO(),
      temPesos: selecionados.some((p) => p.tipo === 'PESOS'),
    })
    return [
      ...new Set([
        ...locais,
        ...(calc?.resultado.pendencias ?? []),
        ...(calc?.comoEncontrado?.pendencias.map((p) => `Como encontrado: ${p}`) ?? []),
      ]),
    ]
  }, [f, dados, selecionados, calc, pendenciasServidor])

  if (erro)
    return (
      <EmptyState
        icone={<CircleAlert className="h-6 w-6" />}
        titulo="Não foi possível abrir a calibração"
        descricao={erro}
        acao={<Button onClick={() => navegar('/certificados')}>Voltar</Button>}
      />
    )
  if (!dados || !f || !balanca) return <CarregandoEditor />

  const ctx: ContextoEtapa = {
    f,
    alterar,
    balanca,
    cliente: dados.cliente,
    padroes: dados.padroes,
    selecionados,
    calc,
    config: dados.config,
    equipe: dados.equipe,
    status: dados.calibracao.status,
    editarBalanca: () => setEditandoBalanca(true),
  }
  const indice = ETAPAS.findIndex((e) => e.id === etapa)
  const completa = (e: IdEtapa) => etapaCompleta(e, ctx)

  const irPara = (e: IdEtapa) => {
    setEtapa(e)
    document.getElementById('conteudo')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const verPrevia = async () => {
    setPrevia({ carregando: true })
    try {
      const blob = await api.previa(id, f)
      setPrevia({ url: URL.createObjectURL(blob) })
    } catch (e) {
      setPrevia(null)
      avisarErro('Não foi possível gerar a prévia', e)
    }
  }

  const mudarSituacao = async (status: 'RASCUNHO' | 'REVISAO') => {
    if (!(await salvar())) return
    try {
      const r = await api.mudarSituacao(id, status, versao.current)
      versao.current = r.calibracao.versao
      setDados((d) => (d ? { ...d, calibracao: r.calibracao } : d))
      useTempoReal.getState().mudou('calibracao')
      toast.sucesso(status === 'REVISAO' ? 'Enviada para revisão' : 'Voltou para rascunho')
    } catch (e) {
      avisarErro('Não foi possível mudar a situação', e)
    }
  }

  const emitir = async () => {
    const ok = await confirmar({
      titulo: 'Emitir o certificado?',
      descricao:
        'O certificado recebe o número definitivo e não pode mais ser alterado. Se precisar corrigir depois, é feita uma revisão que substitui este certificado.',
      confirmar: 'Emitir certificado',
    })
    if (!ok) return
    if (!(await salvar())) return
    try {
      const r = await api.emitir(id, { versao: versao.current })
      useTempoReal.getState().mudou('calibracao')
      toast.sucesso(`Certificado ${r.calibracao.numero} emitido`, 'O PDF já está pronto para baixar e enviar.')
      sujo.current = false
      navegar(`/calibracoes/${id}`, { replace: true })
    } catch (e) {
      avisarErro('Não foi possível emitir', e)
    }
  }

  const excluir = async () => {
    const ok = await confirmar({
      titulo: 'Excluir esta calibração?',
      descricao: 'O rascunho e todas as leituras serão apagados. Esta ação não pode ser desfeita.',
      confirmar: 'Excluir rascunho',
      perigo: true,
    })
    if (!ok) return
    try {
      sujo.current = false
      await api.excluirCalibracao(id)
      useTempoReal.getState().mudou('calibracao')
      toast.sucesso('Rascunho excluído')
      navegar('/certificados', { replace: true })
    } catch (e) {
      avisarErro('Não foi possível excluir', e)
    }
  }

  return (
    <>
      <PageHeader
        voltar={<Voltar para="/certificados" rotulo="Certificados" />}
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {dados.calibracao.substituiId ? 'Revisão de certificado' : 'Calibração'}
            <StatusCalibracaoBadge status={dados.calibracao.status} />
          </span>
        }
        descricao={
          <span>
            {dados.cliente.nome} · {[balanca.fabricante, balanca.modelo].filter(Boolean).join(' ') || TIPOS_BALANCA[balanca.tipo]}{' '}
            {capacidadeTexto(balanca)}
            {f.ordemServico && ` · OS ${f.ordemServico}`}
          </span>
        }
        acoes={
          <>
            <IndicadorSalvo estado={salvo} aoTentar={() => void salvar()} />
            <Button variante="ghost" icone={<Trash2 className="h-4 w-4" />} onClick={() => void excluir()}>
              Excluir
            </Button>
            <Button icone={<ScanEye className="h-4 w-4" />} onClick={() => void verPrevia()}>
              Prévia
            </Button>
          </>
        }
      />

      {/* Etapas no celular/tablet: faixa rolável */}
      <div className="scroll-fino -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {ETAPAS.map((e, i) => (
          <button
            key={e.id}
            type="button"
            onClick={() => irPara(e.id)}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              e.id === etapa ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink-2',
            )}
          >
            {completa(e.id) && e.id !== etapa ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <span className="tnum text-xs">{i + 1}</span>
            )}
            {e.titulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <nav className="hidden lg:block" aria-label="Etapas da calibração">
          <ol className="sticky top-4 flex flex-col gap-1">
            {ETAPAS.map((e, i) => {
              const ativa = e.id === etapa
              const ok = completa(e.id)
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => irPara(e.id)}
                    aria-current={ativa ? 'step' : undefined}
                    className={cn(
                      'relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors',
                      ativa ? 'bg-surface text-ink shadow-xs ring-1 ring-line' : 'text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                        ativa ? 'bg-brand text-on-brand' : ok ? 'bg-success-soft text-success' : 'bg-surface-3 text-muted',
                      )}
                    >
                      {ok && !ativa ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="truncate">{e.titulo}</span>
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="sticky top-[420px] mt-6 hidden rounded-xl bg-surface-2/70 p-3 text-xs text-muted lg:block">
            <p className="font-medium text-ink-2">Atalhos</p>
            <p className="mt-1">Enter: próxima leitura</p>
            <p>↑ ↓: muda de linha</p>
            <p>Tab: próximo campo</p>
          </div>
        </nav>

        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={etapa}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              {etapa === 'identificacao' && <EtapaIdentificacao {...ctx} />}
              {etapa === 'instrumento' && <EtapaInstrumento {...ctx} />}
              {etapa === 'padroes' && <EtapaPadroes {...ctx} />}
              {etapa === 'repetibilidade' && <EtapaRepetibilidade {...ctx} />}
              {etapa === 'excentricidade' && <EtapaExcentricidade {...ctx} />}
              {etapa === 'indicacao' && <EtapaIndicacao {...ctx} />}
              {etapa === 'conclusao' && <EtapaConclusao {...ctx} />}
              {etapa === 'revisao' && (
                <EtapaRevisao
                  ctx={ctx}
                  pendencias={pendencias}
                  salvando={salvo === 'salvando'}
                  aoVisualizar={() => void verPrevia()}
                  aoEnviarRevisao={() => void mudarSituacao('REVISAO')}
                  aoVoltarRascunho={() => void mudarSituacao('RASCUNHO')}
                  aoEmitir={emitir}
                />
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
            <Button
              icone={<ArrowLeft className="h-4 w-4" />}
              disabled={indice === 0}
              onClick={() => irPara(ETAPAS[Math.max(0, indice - 1)].id)}
            >
              <span className="max-sm:hidden">{ETAPAS[Math.max(0, indice - 1)].titulo}</span>
            </Button>
            {indice < ETAPAS.length - 1 && (
              <Button variante="primary" onClick={() => irPara(ETAPAS[indice + 1].id)}>
                {ETAPAS[indice + 1].titulo} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Em telas médias o painel ao vivo vem no fim */}
          <div className="mt-6 2xl:hidden">
            {['repetibilidade', 'excentricidade', 'indicacao', 'conclusao'].includes(etapa) && (
              <PainelResultados calc={calc} balanca={balanca} f={f} />
            )}
          </div>
        </div>

        <aside className="hidden 2xl:block">
          <div className="sticky top-4">
            <PainelResultados calc={calc} balanca={balanca} f={f} />
          </div>
        </aside>
      </div>

      <BalancaFormModal
        aberto={editandoBalanca}
        aoFechar={() => setEditandoBalanca(false)}
        balanca={balanca}
        aoSalvar={(b) => setDados((d) => (d ? { ...d, balanca: b } : d))}
      />
      <Modal
        aberto={!!previa}
        aoFechar={() => {
          if (previa && 'url' in previa) URL.revokeObjectURL(previa.url)
          setPrevia(null)
        }}
        largura="max-w-5xl"
        icone={<ScanEye className="h-5 w-5" />}
        titulo="Prévia do certificado"
        descricao="Com marca d'água: só vale depois de emitido."
      >
        {previa && 'url' in previa ? (
          <iframe
            title="Prévia do certificado"
            src={previa.url}
            className="h-[72vh] w-full rounded-xl border border-line bg-white"
          />
        ) : (
          <div className="flex h-[40vh] items-center justify-center gap-3 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin" /> Gerando o PDF…
          </div>
        )}
      </Modal>
    </>
  )
}

function etapaCompleta(e: IdEtapa, { f, calc, selecionados }: ContextoEtapa): boolean {
  switch (e) {
    case 'identificacao':
      return !!f.dataCalibracao && !!f.tecnicoId && (f.local !== 'CLIENTE' || !!f.localEndereco.trim())
    case 'instrumento':
      return f.ajuste.realizado !== 'EXTERNO' || !!f.ajuste.descricao.trim()
    case 'padroes':
      return (
        selecionados.some((p) => p.tipo === 'PESOS') &&
        f.ambiente.temperaturaInicial !== null &&
        f.ambiente.temperaturaFinal !== null
      )
    case 'repetibilidade':
      return !!calc?.resultado.repetibilidade.some((r) => r.n >= 2)
    case 'excentricidade':
      return !f.excentricidade.aplicavel
        ? !!f.excentricidade.motivo.trim()
        : !!calc && !calc.resultado.pendencias.some((p) => p.startsWith('Excentricidade'))
    case 'indicacao':
      return f.indicacao.pontos.length > 0 && f.indicacao.pontos.every((p) => p.crescente !== null || p.decrescente !== null)
    case 'conclusao':
      return !f.conformidade.solicitada || f.conformidade.criterio !== 'CLIENTE' || f.conformidade.toleranciaCliente > 0
    case 'revisao':
      return false
  }
}

function IndicadorSalvo({ estado, aoTentar }: { estado: EstadoSalvo; aoTentar: () => void }) {
  const mapa = {
    salvo: { icone: <Cloud className="h-3.5 w-3.5" />, texto: 'Salvo', cor: 'text-muted' },
    pendente: { icone: <Cloud className="h-3.5 w-3.5" />, texto: 'Alterações…', cor: 'text-muted' },
    salvando: { icone: <Loader2 className="h-3.5 w-3.5 animate-spin" />, texto: 'Salvando…', cor: 'text-muted' },
    erro: { icone: <CloudOff className="h-3.5 w-3.5" />, texto: 'Não salvo · tentar', cor: 'text-danger' },
  }[estado]
  return (
    <button
      type="button"
      onClick={estado === 'erro' ? aoTentar : undefined}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 px-2 text-[13px] font-medium',
        mapa.cor,
        estado === 'erro' && 'cursor-pointer',
      )}
      aria-live="polite"
    >
      {mapa.icone}
      {mapa.texto}
    </button>
  )
}

function CarregandoEditor() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <div className="hidden flex-col gap-2 lg:flex">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  )
}

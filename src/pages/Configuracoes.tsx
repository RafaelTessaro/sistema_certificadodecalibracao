// Configurações (só o administrador): dados da empresa, certificado, cálculo da incerteza, vencimentos e
// lembretes, e-mail, cópias de segurança, aparência e sobre.
// Cada seção tem o seu "Salvar" e grava só a sua parte; as alterações de uma seção continuam guardadas
// ao trocar de seção (o menu marca as que não foram salvas).

import {
  BellRing,
  Building2,
  Check,
  Copy,
  DatabaseBackup,
  Download,
  ExternalLink,
  FileBadge2,
  FolderOpen,
  HardDrive,
  Info,
  KeyRound,
  Loader2,
  Mail,
  MailCheck,
  MailX,
  Monitor,
  Moon,
  Network,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Sigma,
  Sun,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cnpjValido, mascaraCep, mascaraDocumento, mascaraTelefone } from '#shared/documentos.ts'
import {
  CONFIG_PADRAO,
  diasEntre,
  emailValido,
  enderecoEmpresa,
  formatarNumeroCertificado,
  hojeLocalIso,
  preencherModelo,
  termosSensiveis,
  TEXTOS_PADRAO,
  UFS,
} from '#shared/dominio.ts'
import type { ConfigNumeracao, Configuracoes as Config, DadosEmpresa, OpcoesCalculo, TextosCertificado } from '#shared/tipos.ts'
import { CartaoPop } from '../components/CartaoPop'
import { Logo } from '../components/Logo'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { confirmar } from '../components/ui/Feedback'
import { Field, Input, NumberInput, Select, Textarea } from '../components/ui/Form'
import { EmptyState, PageHeader, Segmented } from '../components/ui/Misc'
import { CampoSenha } from '../components/sessao/CampoSenha'
import { api, type ConfigEmail } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { dataHora, hojeISO, tamanhoArquivo } from '../lib/format'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast, useUI, type Tema } from '../store/ui'

// ---- Seções ----------------------------------------------------------------------------

type IdSecao = 'empresa' | 'certificado' | 'calculo' | 'vencimentos' | 'email' | 'backup' | 'aparencia' | 'sobre'

interface InfoSecao {
  id: IdSecao
  label: string
  icone: LucideIcon
}

const GRUPOS: Array<{ grupo: string; secoes: InfoSecao[] }> = [
  {
    grupo: 'Empresa e certificado',
    secoes: [
      { id: 'empresa', label: 'Empresa', icone: Building2 },
      { id: 'certificado', label: 'Certificado', icone: FileBadge2 },
      { id: 'calculo', label: 'Cálculo da incerteza', icone: Sigma },
    ],
  },
  {
    grupo: 'Clientes',
    secoes: [
      { id: 'vencimentos', label: 'Vencimentos e lembretes', icone: BellRing },
      { id: 'email', label: 'E-mail', icone: Mail },
    ],
  },
  {
    grupo: 'Sistema',
    secoes: [
      { id: 'backup', label: 'Cópias de segurança', icone: DatabaseBackup },
      { id: 'aparencia', label: 'Aparência', icone: Palette },
      { id: 'sobre', label: 'Sobre', icone: Info },
    ],
  },
]

const SECOES = GRUPOS.flatMap((g) => g.secoes)

/** Seções que editam as configurações gerais (precisam delas carregadas). */
const DA_CONFIG = new Set<IdSecao>(['empresa', 'certificado', 'calculo', 'vencimentos'])

type AoSujo = (id: IdSecao, sujo: boolean) => void
type SalvarParte = (parte: Partial<Config>, rotulo: string) => Promise<Config>

interface PropsSecao {
  config: Config
  salvarParte: SalvarParte
  aoSujo: AoSujo
}

export function Configuracoes() {
  const [params, setParams] = useSearchParams()
  const secao: IdSecao = SECOES.find((s) => s.id === params.get('secao'))?.id ?? 'empresa'
  // Seções já abertas continuam montadas (escondidas): o que foi digitado não se perde ao trocar
  const [visitadas, setVisitadas] = useState<ReadonlySet<IdSecao>>(() => new Set([secao]))
  if (!visitadas.has(secao)) setVisitadas(new Set([...visitadas, secao]))
  const [sujas, setSujas] = useState<ReadonlySet<IdSecao>>(() => new Set())
  const aoSujo = useCallback<AoSujo>(
    (id, sujo) =>
      setSujas((s) => {
        if (s.has(id) === sujo) return s
        const novo = new Set(s)
        if (sujo) novo.add(id)
        else novo.delete(id)
        return novo
      }),
    [],
  )

  const {
    dados: config,
    carregando,
    erro,
    definir,
    recarregar,
  } = useConsulta('config', () => api.config().then((r) => r.config), ['config'])
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  })

  /** Grava uma parte por cima da configuração mais recente (as outras seções não mudam). */
  const salvarParte = useCallback<SalvarParte>(
    async (parte, rotulo) => {
      const base = configRef.current
      if (!base) throw new Error('As configurações ainda não carregaram. Tente de novo.')
      const r = await api.salvarConfig({ ...base, ...parte })
      definir(r.config)
      configRef.current = r.config
      useTempoReal.getState().mudou('config')
      toast.sucesso('Configurações salvas', rotulo)
      return r.config
    },
    [definir],
  )

  const irPara = (id: IdSecao) => {
    setParams(id === 'empresa' ? {} : { secao: id }, { replace: true })
    const conteudo = document.getElementById('conteudo')
    if (conteudo && conteudo.scrollTop > 120) conteudo.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Fechar a aba com alterações não salvas: o navegador pergunta antes
  const temSujas = sujas.size > 0
  useEffect(() => {
    if (!temSujas) return
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [temSujas])

  // Ctrl+S (⌘S) salva a seção aberta
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
      const form = document.getElementById(`form-config-${secao}`)
      if (form instanceof HTMLFormElement) {
        e.preventDefault()
        form.requestSubmit()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [secao])

  const conteudo = (id: IdSecao): ReactNode => {
    if (DA_CONFIG.has(id) && !config)
      return carregando ? (
        <EsqueletoSecao />
      ) : (
        <ErroSecao titulo="Não foi possível carregar as configurações" erro={erro} aoTentar={recarregar} />
      )
    const props = { config: config!, salvarParte, aoSujo }
    switch (id) {
      case 'empresa':
        return <SecaoEmpresa {...props} />
      case 'certificado':
        return <SecaoCertificado {...props} />
      case 'calculo':
        return <SecaoCalculo {...props} />
      case 'vencimentos':
        return <SecaoVencimentos {...props} />
      case 'email':
        return <SecaoEmail aoSujo={aoSujo} />
      case 'backup':
        return <SecaoBackup />
      case 'aparencia':
        return <SecaoAparencia />
      case 'sobre':
        return <SecaoSobre />
    }
  }

  return (
    <>
      <PageHeader
        titulo="Configurações"
        descricao="Dados da empresa e do certificado, e-mail, cópias de segurança e preferências."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[244px_minmax(0,1fr)] lg:gap-8">
        <NavSecoes atual={secao} sujas={sujas} aoEscolher={irPara} />
        <div className="min-w-0 lg:max-w-[880px]">
          {SECOES.filter((s) => visitadas.has(s.id)).map((s) => (
            <motion.div
              key={s.id}
              hidden={s.id !== secao}
              initial={{ opacity: 0, y: 6 }}
              animate={s.id === secao ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-5"
            >
              {conteudo(s.id)}
            </motion.div>
          ))}
        </div>
      </div>
    </>
  )
}

// ---- Navegação entre as seções ----------------------------------------------------------

function NavSecoes({
  atual,
  sujas,
  aoEscolher,
}: {
  atual: IdSecao
  sujas: ReadonlySet<IdSecao>
  aoEscolher: (id: IdSecao) => void
}) {
  const ativoMovel = useRef<HTMLButtonElement>(null)
  // No celular, a aba escolhida aparece inteira na faixa que rola de lado
  useEffect(() => {
    ativoMovel.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [atual])

  const pontoSujo = (id: IdSecao) =>
    sujas.has(id) ? (
      <span className="relative h-2 w-2 shrink-0 rounded-full bg-warning-dot" title="Alterações não salvas">
        <span className="sr-only">(alterações não salvas)</span>
      </span>
    ) : null

  return (
    <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
      {/* Celular e tablet: abas que rolam de lado */}
      <nav
        aria-label="Seções das configurações"
        className="scroll-fino -mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden"
      >
        <div className="flex w-max gap-1 rounded-2xl bg-surface-3/70 p-1">
          {SECOES.map((s) => {
            const ativo = s.id === atual
            return (
              <button
                type="button"
                key={s.id}
                ref={ativo ? ativoMovel : undefined}
                onClick={() => aoEscolher(s.id)}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'relative flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
                  ativo ? 'text-ink' : 'text-muted hover:text-ink-2',
                )}
              >
                {ativo && (
                  <motion.span
                    layoutId="config-secao-movel"
                    className="absolute inset-0 rounded-xl bg-surface shadow-xs ring-1 ring-line"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <s.icone className={cn('relative h-4 w-4', ativo ? 'text-brand' : 'text-muted')} />
                <span className="relative">{s.label}</span>
                <span className="relative">{pontoSujo(s.id)}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Telas grandes: lista lateral fixa */}
      <nav aria-label="Seções das configurações" className="hidden lg:block">
        {GRUPOS.map((g) => (
          <div key={g.grupo} className="mb-5">
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{g.grupo}</p>
            <div className="flex flex-col gap-0.5">
              {g.secoes.map((s) => {
                const ativo = s.id === atual
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => aoEscolher(s.id)}
                    aria-current={ativo ? 'page' : undefined}
                    className={cn(
                      'group relative flex h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[14px] font-medium transition-colors',
                      ativo ? 'text-ink' : 'text-ink-2 hover:text-ink',
                    )}
                  >
                    {ativo ? (
                      <motion.span
                        layoutId="config-secao"
                        className="absolute inset-0 rounded-xl bg-surface shadow-xs ring-1 ring-line"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    ) : (
                      <span className="absolute inset-0 rounded-xl transition-colors group-hover:bg-surface-3/60" />
                    )}
                    <s.icone
                      className={cn(
                        'relative h-[18px] w-[18px] shrink-0',
                        ativo ? 'text-brand' : 'text-muted group-hover:text-ink-2',
                      )}
                      strokeWidth={ativo ? 2.2 : 1.9}
                    />
                    <span className="relative min-w-0 flex-1 truncate">{s.label}</span>
                    <span className="relative flex">{pontoSujo(s.id)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <p className="px-3 text-xs leading-relaxed text-muted">
          <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium">Ctrl</kbd> +{' '}
          <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium">S</kbd> salva a seção
          aberta.
        </p>
      </nav>
    </div>
  )
}

// ---- Rascunho de cada seção ----------------------------------------------------------------

/**
 * O que está sendo editado numa seção. Sem alterações, acompanha o que outra pessoa gravar; com
 * alterações, guarda o rascunho até salvar ou descartar.
 */
function useSecao<T>(id: IdSecao, atual: T, aoSujo: AoSujo) {
  const [estado, setEstado] = useState(() => ({ base: atual, valor: atual }))
  const chaveBase = JSON.stringify(estado.base)
  const sujo = JSON.stringify(estado.valor) !== chaveBase
  if (!sujo && JSON.stringify(atual) !== chaveBase) setEstado({ base: atual, valor: atual })

  useEffect(() => aoSujo(id, sujo), [id, sujo, aoSujo])
  useEffect(() => () => aoSujo(id, false), [id, aoSujo])

  const [salvando, setSalvando] = useState(false)
  const [tentou, setTentou] = useState(false)
  const mudar = useCallback((fn: (v: T) => T) => setEstado((s) => ({ ...s, valor: fn(s.valor) })), [])

  /** Grava (fn devolve o valor como ficou no servidor) e passa a valer como o novo ponto de partida. */
  const gravar = async (fn: () => Promise<T>) => {
    if (salvando) return
    setSalvando(true)
    try {
      const gravado = await fn()
      setEstado({ base: gravado, valor: gravado })
      setTentou(false)
    } catch (e) {
      avisarErro('Não foi possível salvar', e)
    } finally {
      setSalvando(false)
    }
  }

  return {
    valor: estado.valor,
    sujo,
    salvando,
    tentou,
    setTentou,
    mudar,
    gravar,
    descartar: () => {
      setEstado({ base: atual, valor: atual })
      setTentou(false)
    },
  }
}

// ---- Peças visuais comuns ------------------------------------------------------------------

/** Cartão de uma seção com o formulário e a barra de salvar no rodapé (fica visível ao rolar). */
function FormSecao({
  id,
  icone,
  titulo,
  descricao,
  acoes,
  children,
  sujo,
  salvando,
  aoDescartar,
  aoEnviar,
}: {
  id: IdSecao
  icone: ReactNode
  titulo: string
  descricao: ReactNode
  acoes?: ReactNode
  children: ReactNode
  sujo: boolean
  salvando: boolean
  aoDescartar: () => void
  aoEnviar: (e: FormEvent) => void
}) {
  return (
    <Card>
      <CardHeader icone={icone} titulo={titulo} descricao={descricao} acoes={acoes} className="pb-4" />
      <form
        id={`form-config-${id}`}
        onSubmit={(e) => {
          // Enter num campo ou Ctrl+S sem nada mudado: não grava de novo
          if (!sujo || salvando) return e.preventDefault()
          aoEnviar(e)
        }}
        noValidate
      >
        <div className="flex flex-col gap-6 border-t border-line px-5 py-5">{children}</div>
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-surface/95 px-5 py-3 backdrop-blur-md">
          <AnimatePresence mode="wait" initial={false}>
            {sujo ? (
              <motion.span
                key="sujo"
                role="status"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="mr-auto flex items-center gap-2 text-[13px] font-medium text-warning"
              >
                <span className="h-2 w-2 rounded-full bg-warning-dot" />
                Alterações não salvas
              </motion.span>
            ) : (
              <motion.span
                key="salvo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mr-auto flex items-center gap-1.5 text-[13px] text-muted"
              >
                <Check className="h-3.5 w-3.5" /> Tudo salvo
              </motion.span>
            )}
          </AnimatePresence>
          {sujo && (
            <Button variante="ghost" onClick={aoDescartar} disabled={salvando}>
              Descartar
            </Button>
          )}
          <Button
            variante="primary"
            type="submit"
            disabled={!sujo || salvando}
            aria-busy={salvando}
            icone={salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** Parte de uma seção, com título e explicação. */
function Bloco({ titulo, descricao, children }: { titulo: string; descricao?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h4 className="text-sm font-semibold text-ink">{titulo}</h4>
        {descricao && <p className="mt-0.5 text-[13px] leading-snug text-muted">{descricao}</p>}
      </div>
      {children}
    </section>
  )
}

const Divisor = () => <hr className="border-line" />

const TOM_NOTA = {
  info: 'border-info/20 bg-info-soft text-info',
  aviso: 'border-warning/25 bg-warning-soft text-warning',
  perigo: 'border-danger/25 bg-danger-soft text-danger',
  neutro: 'border-line bg-surface-2/60 text-ink-2',
}

/** Caixa de explicação ou aviso. */
function Nota({
  tom = 'neutro',
  icone,
  children,
  className,
}: {
  tom?: keyof typeof TOM_NOTA
  icone?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-snug', TOM_NOTA[tom], className)}
    >
      {icone && <span className="mt-px flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icone}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Liga/desliga com título e explicação (a linha inteira é clicável). */
function Interruptor({
  id,
  ligado,
  aoMudar,
  titulo,
  descricao,
}: {
  id: string
  ligado: boolean
  aoMudar: (v: boolean) => void
  titulo: ReactNode
  descricao: ReactNode
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-4 rounded-xl border px-4 py-3.5 transition-[border-color,background-color,box-shadow] duration-150',
        'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]',
        ligado ? 'border-brand/50 bg-brand-soft/40' : 'border-line bg-surface-2/40 hover:border-line-strong',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{titulo}</span>
        <span className="mt-1 block text-[13px] leading-snug text-ink-2">{descricao}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={ligado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-150',
          ligado ? 'bg-brand' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow-xs transition-[transform,background-color] duration-150',
            ligado ? 'translate-x-5 bg-on-brand' : 'bg-surface dark:bg-muted',
          )}
        />
      </span>
    </label>
  )
}

interface OpcaoEscolha<T extends string> {
  valor: T
  label: string
  ajuda: string
  recomendado?: boolean
}

/** Opções lado a lado (cartões de rádio), com a explicação de cada uma. */
function Escolha<T extends string>({
  nome,
  legenda,
  ajuda,
  valor,
  aoMudar,
  opcoes,
  colunas = 3,
  children,
}: {
  nome: string
  legenda: string
  ajuda?: ReactNode
  valor: T
  aoMudar: (v: T) => void
  opcoes: Array<OpcaoEscolha<T>>
  colunas?: 2 | 3 | 4
  children?: ReactNode
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      {/* O legend não é item do flex (o gap não vale para ele): o espaço até a explicação vem da margem */}
      <legend className={cn('block p-0 text-sm font-semibold text-ink', ajuda ? 'mb-1' : 'mb-2.5')}>{legenda}</legend>
      {ajuda && <p className="text-[13px] leading-snug text-muted">{ajuda}</p>}
      <div
        className={cn(
          'grid gap-2',
          colunas === 2 ? 'sm:grid-cols-2' : colunas === 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3',
        )}
      >
        {opcoes.map((o) => {
          const ativo = o.valor === valor
          return (
            <label
              key={o.valor}
              className={cn(
                'relative flex cursor-pointer flex-col gap-1.5 rounded-xl border px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-150',
                'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]',
                ativo
                  ? 'border-brand bg-brand-soft/50 ring-4 ring-[var(--ring)]/40'
                  : 'border-line-strong/80 bg-surface hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name={nome}
                value={o.valor}
                checked={ativo}
                onChange={() => aoMudar(o.valor)}
                className="sr-only"
              />
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-[13.5px] leading-snug font-semibold text-ink">{o.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
                    ativo ? 'border-brand bg-brand shadow-[inset_0_0_0_2px_var(--surface)]' : 'border-line-strong',
                  )}
                />
              </span>
              {o.recomendado && (
                <Badge tom="brand" ponto={false} className="h-5 w-fit px-2 text-[11px]">
                  Recomendado
                </Badge>
              )}
              <span className="text-[12.5px] leading-snug text-ink-2">{o.ajuda}</span>
            </label>
          )
        })}
      </div>
      {children}
    </fieldset>
  )
}

function BotaoRestaurar({
  desabilitado,
  aoClicar,
  texto = 'Restaurar texto padrão',
}: {
  desabilitado: boolean
  aoClicar: () => void
  texto?: string
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      title={desabilitado ? 'Já é o texto padrão' : undefined}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1 text-xs font-medium text-muted transition-colors hover:text-ink disabled:cursor-default disabled:opacity-50 disabled:hover:text-muted"
    >
      <RotateCcw className="h-3 w-3" /> {texto}
    </button>
  )
}

/** Variável de um modelo ({cliente}, {numero}…) que entra onde está o cursor. */
interface Variavel {
  chave: string
  ajuda: string
}

/** Texto de modelo (e-mail, lembrete) com os botões que inserem as variáveis. */
function CampoModelo({
  id,
  rotulo,
  valor,
  aoMudar,
  padrao,
  variaveis,
  linhas = 8,
  aviso,
  exemplo,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  padrao: string
  variaveis: Variavel[]
  linhas?: number
  aviso?: string | null
  /** O texto com as variáveis trocadas por valores de exemplo. */
  exemplo: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const inserir = (marca: string) => {
    const el = ref.current
    const ini = el?.selectionStart ?? valor.length
    const fim = el?.selectionEnd ?? valor.length
    aoMudar(valor.slice(0, ini) + marca + valor.slice(fim))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(ini + marca.length, ini + marca.length)
    })
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {rotulo}
        </label>
        <BotaoRestaurar desabilitado={valor === padrao} aoClicar={() => aoMudar(padrao)} texto="Restaurar modelo padrão" />
      </div>
      <Textarea
        ref={ref}
        id={id}
        rows={linhas}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">Inserir:</span>
        {variaveis.map((v) => (
          <button
            type="button"
            key={v.chave}
            onClick={() => inserir(`{${v.chave}}`)}
            title={v.ajuda}
            className="cursor-pointer rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 transition-colors hover:border-brand/60 hover:text-brand-ink"
          >
            {`{${v.chave}}`}
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {variaveis.map((v, i) => (
          <span key={v.chave}>
            {i > 0 && ' · '}
            <span className="font-mono text-[11px] text-ink-2">{`{${v.chave}}`}</span> {v.ajuda}
          </span>
        ))}
      </p>
      {aviso && (
        <p className="flex items-start gap-1.5 text-xs font-medium text-warning">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {aviso}
        </p>
      )}
      <details className="group rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5">
        <summary className="cursor-pointer text-xs font-medium text-ink-2 select-none hover:text-ink">
          Ver um exemplo de como o cliente recebe
        </summary>
        <pre className="mt-2.5 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{exemplo}</pre>
      </details>
    </div>
  )
}

function EsqueletoSecao() {
  return (
    <Card className="p-5" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-3" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-40 animate-pulse rounded-full bg-surface-3" />
          <div className="h-2.5 w-64 animate-pulse rounded-full bg-surface-2" />
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-2.5 w-24 animate-pulse rounded-full bg-surface-2" />
            <div className="h-10 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ))}
      </div>
    </Card>
  )
}

function ErroSecao({ titulo, erro, aoTentar }: { titulo: string; erro: string; aoTentar: () => void }) {
  return (
    <Card>
      <EmptyState
        icone={<TriangleAlert className="h-6 w-6" />}
        titulo={titulo}
        descricao={erro || 'Erro inesperado.'}
        acao={
          <Button icone={<RefreshCw className="h-4 w-4" />} onClick={aoTentar}>
            Tentar de novo
          </Button>
        }
      />
    </Card>
  )
}

/**
 * Copia para a área de transferência. Na rede da empresa (http), o navegador pode bloquear
 * `navigator.clipboard`: aí usa o método antigo.
 */
async function copiarTexto(texto: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    /* tenta o método antigo */
  }
  const campo = document.createElement('textarea')
  campo.value = texto
  campo.setAttribute('readonly', '')
  campo.style.position = 'fixed'
  campo.style.opacity = '0'
  document.body.appendChild(campo)
  campo.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  campo.remove()
  return ok
}

/** Texto em fonte de código com o botão de copiar (caminhos de pasta, endereços). */
function TextoCopiavel({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copiar = async () => {
    if (!(await copiarTexto(texto))) return toast.erro('Não foi possível copiar', 'Selecione o texto e copie com Ctrl+C.')
    setCopiado(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopiado(false), 1600)
  }
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-xl border border-line bg-surface-2/70 py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink" title={texto}>
        {texto}
      </code>
      <Button
        variante="ghost"
        tamanho="icon-sm"
        onClick={() => void copiar()}
        aria-label={copiado ? 'Copiado' : `Copiar ${rotulo}`}
        title={copiado ? 'Copiado' : 'Copiar'}
      >
        {copiado ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  )
}

// ---- Empresa -----------------------------------------------------------------------------

function SecaoEmpresa({ config, salvarParte, aoSujo }: PropsSecao) {
  const s = useSecao('empresa', config.empresa, aoSujo)
  const e = s.valor
  const set = <K extends keyof DadosEmpresa>(k: K, v: DadosEmpresa[K]) => s.mudar((x) => ({ ...x, [k]: v }))
  const erros = {
    razaoSocial: !e.razaoSocial.trim() ? 'Informe a razão social: ela sai no certificado.' : null,
    cnpj: e.cnpj.trim() && !cnpjValido(e.cnpj) ? 'CNPJ inválido: confira os números.' : null,
    email: e.email.trim() && !emailValido(e.email.trim()) ? 'E-mail inválido.' : null,
  }
  const mostrar = (k: keyof typeof erros) => (s.tentou || (k !== 'razaoSocial' && e[k].length >= 14) ? erros[k] : null)

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    s.setTentou(true)
    if (Object.values(erros).some(Boolean))
      return toast.erro('Confira os dados da empresa', Object.values(erros).find(Boolean) ?? '')
    void s.gravar(async () => (await salvarParte({ empresa: e }, 'Dados da empresa')).empresa)
  }

  const rodape = [enderecoEmpresa(e), e.telefone, e.email, e.site].filter(Boolean).join(' · ')

  return (
    <FormSecao
      id="empresa"
      icone={<Building2 className="h-4 w-4" />}
      titulo="Empresa"
      descricao="Os dados da Balanças.com que saem no cabeçalho e no rodapé de todas as páginas do certificado."
      sujo={s.sujo}
      salvando={s.salvando}
      aoDescartar={s.descartar}
      aoEnviar={enviar}
    >
      <Nota tom="info" icone={<FileBadge2 />}>
        A <b className="font-semibold">razão social</b> e o <b className="font-semibold">CNPJ</b> identificam quem emite o
        certificado: saem no cabeçalho. O endereço, o telefone, o e-mail e o site saem no rodapé.
      </Nota>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Field
          label="Razão social"
          htmlFor="emp-razao"
          className="sm:col-span-6"
          erro={mostrar('razaoSocial')}
          hint="Como consta no CNPJ. Também entra no lugar de {empresa} nos textos do certificado."
        >
          <Input id="emp-razao" value={e.razaoSocial} onChange={(x) => set('razaoSocial', x.target.value)} maxLength={160} />
        </Field>
        <Field
          label="Nome fantasia"
          htmlFor="emp-fantasia"
          className="sm:col-span-3"
          hint="Usado nas telas, nos e-mails e nos lembretes."
        >
          <Input id="emp-fantasia" value={e.nomeFantasia} onChange={(x) => set('nomeFantasia', x.target.value)} maxLength={120} />
        </Field>
        <Field label="CNPJ" htmlFor="emp-cnpj" className="sm:col-span-3" erro={mostrar('cnpj')}>
          <Input
            id="emp-cnpj"
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="00.000.000/0000-00"
            value={e.cnpj}
            onChange={(x) => set('cnpj', mascaraDocumento(x.target.value, 'PJ'))}
            className={cn('tnum', mostrar('cnpj') && 'border-danger!')}
          />
        </Field>
        <Field label="Inscrição estadual" htmlFor="emp-ie" className="sm:col-span-3" hint="Opcional.">
          <Input
            id="emp-ie"
            value={e.inscricaoEstadual}
            onChange={(x) => set('inscricaoEstadual', x.target.value)}
            maxLength={30}
          />
        </Field>
        <Field label="Telefone" htmlFor="emp-tel" className="sm:col-span-3">
          <Input
            id="emp-tel"
            inputMode="tel"
            placeholder="(19) 3000-0000"
            value={e.telefone}
            onChange={(x) => set('telefone', mascaraTelefone(x.target.value))}
          />
        </Field>
        <Field label="Endereço" htmlFor="emp-end" className="sm:col-span-6" hint="Rua, número e complemento.">
          <Input id="emp-end" value={e.endereco} onChange={(x) => set('endereco', x.target.value)} maxLength={200} />
        </Field>
        <Field label="Bairro" htmlFor="emp-bairro" className="sm:col-span-4">
          <Input id="emp-bairro" value={e.bairro} onChange={(x) => set('bairro', x.target.value)} maxLength={80} />
        </Field>
        <Field label="CEP" htmlFor="emp-cep" className="sm:col-span-2">
          <Input
            id="emp-cep"
            inputMode="numeric"
            placeholder="00000-000"
            value={e.cep}
            onChange={(x) => set('cep', mascaraCep(x.target.value))}
            className="tnum"
          />
        </Field>
        <Field label="Cidade" htmlFor="emp-cidade" className="sm:col-span-4">
          <Input id="emp-cidade" value={e.cidade} onChange={(x) => set('cidade', x.target.value)} maxLength={80} />
        </Field>
        <Field label="UF" htmlFor="emp-uf" className="sm:col-span-2">
          <Select id="emp-uf" value={e.uf} onChange={(x) => set('uf', x.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="E-mail" htmlFor="emp-email" className="sm:col-span-3" erro={s.tentou ? erros.email : null}>
          <Input
            id="emp-email"
            type="email"
            placeholder="contato@empresa.com.br"
            value={e.email}
            onChange={(x) => set('email', x.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="Site" htmlFor="emp-site" className="sm:col-span-3">
          <Input
            id="emp-site"
            placeholder="empresa.com.br"
            value={e.site}
            onChange={(x) => set('site', x.target.value)}
            maxLength={120}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-line bg-surface-2/50 p-4">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">Resumo do que sai no certificado</p>
        <div className="mt-3 flex items-center gap-3">
          <Logo className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{e.razaoSocial || 'Razão social'}</p>
            <p className="tnum truncate text-xs text-ink-2">
              {[`CNPJ ${e.cnpj || '—'}`, e.inscricaoEstadual && `IE ${e.inscricaoEstadual}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-muted max-sm:hidden">Cabeçalho</span>
        </div>
        <div className="mt-3 flex items-start justify-between gap-3 border-t border-dashed border-line-strong pt-2.5">
          <p className="min-w-0 text-xs leading-relaxed text-ink-2">{rodape || 'Endereço e contatos'}</p>
          <span className="shrink-0 text-[11px] text-muted max-sm:hidden">Rodapé</span>
        </div>
      </div>
    </FormSecao>
  )
}

// ---- Certificado -----------------------------------------------------------------------------

type ChaveTextoFixo = Exclude<keyof TextosCertificado, 'procedimento' | 'procedimentoDescricao'>

const TEXTOS_FIXOS: Array<{ chave: ChaveTextoFixo; titulo: string; ajuda: string }> = [
  {
    chave: 'rastreabilidade',
    titulo: 'Rastreabilidade',
    ajuda: 'Diz que os resultados vêm de padrões (pesos) calibrados por laboratório acreditado. Exigido pela norma.',
  },
  {
    chave: 'incerteza',
    titulo: 'Declaração da incerteza',
    ajuda: 'Explica a incerteza (U) e o fator k, com cerca de 95 % de probabilidade. Exigido pela norma.',
  },
  {
    chave: 'abrangencia',
    titulo: 'Abrangência dos resultados',
    ajuda: 'Os resultados valem só para a balança calibrada e nas condições do dia da calibração.',
  },
  {
    chave: 'reproducao',
    titulo: 'Reprodução',
    ajuda: 'Sai no rodapé de toda página: o certificado só pode ser copiado inteiro. Curto, cabe ao lado do endereço.',
  },
  {
    chave: 'naoAcreditado',
    titulo: 'Empresa não acreditada',
    ajuda: 'Deixa claro que a empresa não é acreditada pelo Inmetro (Cgcre), para o cliente não entender errado.',
  },
  {
    chave: 'controleLegal',
    titulo: 'Verificação do Inmetro / IPEM',
    ajuda: 'Avisa que a calibração não substitui a verificação do IPEM, obrigatória para balanças usadas no comércio.',
  },
  {
    chave: 'intervalo',
    titulo: 'Prazo da próxima calibração',
    ajuda: 'Diz que o certificado não recomenda prazo: quem decide quando calibrar de novo é o cliente.',
  },
  {
    chave: 'observacoesPadrao',
    titulo: 'Observações em todos os certificados',
    ajuda: 'Texto livre e opcional, que sai em todos os certificados.',
  },
]

/** "Validade" e "válido até": certificado de calibração não tem validade (bloqueia o salvar). */
const PALAVRA_VALIDADE = /\bvalidade\b|\bv[aá]lid[oa]s?\s+at[eé]/i
const ERRO_VALIDADE =
  'Tire a palavra “validade”: certificado de calibração não tem validade (ISO/IEC 17025, 7.8.4.3). Quem decide quando calibrar de novo é o cliente.'

/** Avisos (sem bloquear) dos termos que confundem o cliente. Os textos padrão citam a acreditação de propósito. */
function avisosDoTexto(chave: string, t: string) {
  const citaAcreditacao = chave === 'naoAcreditado' || chave === 'rastreabilidade'
  return termosSensiveis(t).filter((m) => !/validade/i.test(m) && !(citaAcreditacao && m.startsWith('Evite "acreditado"')))
}

interface RascunhoCertificado {
  numeracao: ConfigNumeracao
  exigirRevisor: boolean
  textos: TextosCertificado
}

const MARCAS_NUMERO = [
  { marca: '{seq}', ajuda: 'sequência do ano' },
  { marca: '{ano}', ajuda: 'ano com 4 dígitos' },
  { marca: '{aa}', ajuda: 'ano com 2 dígitos' },
]

function SecaoCertificado({ config, salvarParte, aoSujo }: PropsSecao) {
  const atual = useMemo<RascunhoCertificado>(
    () => ({ numeracao: config.numeracao, exigirRevisor: config.exigirRevisor, textos: config.textos }),
    [config],
  )
  const s = useSecao('certificado', atual, aoSujo)
  const v = s.valor
  const formatoRef = useRef<HTMLInputElement>(null)
  const ano = Number(hojeISO().slice(0, 4))
  const razao = config.empresa.razaoSocial || config.empresa.nomeFantasia

  const setTexto = (k: keyof TextosCertificado, t: string) => s.mudar((x) => ({ ...x, textos: { ...x.textos, [k]: t } }))
  const setNumeracao = (n: Partial<ConfigNumeracao>) => s.mudar((x) => ({ ...x, numeracao: { ...x.numeracao, ...n } }))

  const formato = v.numeracao.formato
  const erroFormato = !formato.includes('{seq}') ? 'O formato precisa ter {seq}, o número que aumenta a cada certificado.' : null
  const marcasDesconhecidas = [...formato.matchAll(/\{(\w*)\}/g)]
    .map((m) => m[0])
    .filter((m) => !MARCAS_NUMERO.some((x) => x.marca === m))
  const avisoFormato = erroFormato
    ? null
    : !/\{(ano|aa)\}/.test(formato)
      ? 'Sem {ano} ou {aa}, o número se repete no ano seguinte (a sequência volta a 1 em janeiro).'
      : marcasDesconhecidas.length
        ? `${marcasDesconhecidas.join(', ')} não é reconhecido e sai no número como está.`
        : null
  const exemplos = erroFormato
    ? []
    : [
        { numero: formatarNumeroCertificado(v.numeracao, 1, ano), legenda: `Primeiro certificado de ${ano}` },
        { numero: formatarNumeroCertificado(v.numeracao, 124, ano), legenda: '124º certificado do ano' },
        {
          numero: formatarNumeroCertificado(v.numeracao, 124, ano, 1),
          legenda: 'Revisão do 124º (corrige e substitui o original)',
        },
      ]

  const textosComValidade = (['procedimentoDescricao', ...TEXTOS_FIXOS.map((t) => t.chave)] as const).filter((k) =>
    PALAVRA_VALIDADE.test(v.textos[k]),
  )

  const inserirMarca = (marca: string) => {
    const el = formatoRef.current
    const ini = el?.selectionStart ?? formato.length
    const fim = el?.selectionEnd ?? formato.length
    setNumeracao({ formato: formato.slice(0, ini) + marca + formato.slice(fim) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(ini + marca.length, ini + marca.length)
    })
  }

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    s.setTentou(true)
    if (erroFormato) return toast.erro('Confira a numeração', erroFormato)
    if (textosComValidade.length) {
      document.getElementById(`cert-texto-${textosComValidade[0]}`)?.focus()
      return toast.erro('Confira os textos do certificado', ERRO_VALIDADE)
    }
    void s.gravar(async () => {
      // O código e a revisão do POP não vão daqui: vêm da revisão vigente (registrada no cartão do POP)
      const nova = await salvarParte(
        {
          numeracao: { formato: v.numeracao.formato.trim(), digitos: v.numeracao.digitos },
          exigirRevisor: v.exigirRevisor,
          textos: v.textos,
        },
        'Certificado',
      )
      return { numeracao: nova.numeracao, exigirRevisor: nova.exigirRevisor, textos: nova.textos }
    })
  }

  return (
    <FormSecao
      id="certificado"
      icone={<FileBadge2 className="h-4 w-4" />}
      titulo="Certificado"
      descricao="Numeração, POP, revisão antes da emissão e os textos fixos. Valem para os próximos certificados: os já emitidos não mudam."
      sujo={s.sujo}
      salvando={s.salvando}
      aoDescartar={s.descartar}
      aoEnviar={enviar}
    >
      <Bloco
        titulo="Numeração"
        descricao="Como o número do certificado é montado. A sequência recomeça em 1 a cada ano e um número nunca é reaproveitado, nem quando o certificado é cancelado."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_170px]">
          <Field label="Formato" htmlFor="cert-formato" erro={erroFormato}>
            <Input
              ref={formatoRef}
              id="cert-formato"
              value={formato}
              onChange={(x) => setNumeracao({ formato: x.target.value })}
              spellCheck={false}
              autoComplete="off"
              maxLength={40}
              className={cn('font-mono text-[13.5px]', erroFormato && 'border-danger!')}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Inserir:</span>
              {MARCAS_NUMERO.map((m) => (
                <button
                  type="button"
                  key={m.marca}
                  onClick={() => inserirMarca(m.marca)}
                  className="cursor-pointer rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-ink-2 transition-colors hover:border-brand/60 hover:text-brand-ink"
                >
                  <span className="font-mono">{m.marca}</span> <span className="text-muted">{m.ajuda}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Dígitos da sequência" htmlFor="cert-digitos" hint="Zeros à esquerda: 5 → 00001.">
            <NumberInput
              id="cert-digitos"
              valor={v.numeracao.digitos}
              aoMudar={(n) => setNumeracao({ digitos: n ?? 1 })}
              min={1}
              max={8}
            />
          </Field>
        </div>
        {avisoFormato && (
          <Nota tom="aviso" icone={<TriangleAlert />}>
            {avisoFormato}
          </Nota>
        )}
        {exemplos.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">Prévia</p>
            <ul className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
              {exemplos.map((x) => (
                <li key={x.legenda} className="min-w-0 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-xs">
                  <motion.p
                    key={x.numero}
                    initial={{ opacity: 0.4 }}
                    animate={{ opacity: 1 }}
                    className="tnum truncate font-mono text-[14px] font-semibold text-ink"
                    title={x.numero}
                  >
                    {x.numero}
                  </motion.p>
                  <p className="mt-0.5 text-xs leading-snug text-muted">{x.legenda}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Bloco>

      <Divisor />

      <Bloco
        titulo="POP — Procedimento Operacional Padrão"
        descricao="O documento que descreve como a empresa calibra. O código e a revisão saem em todas as páginas do certificado; o arquivo fica guardado aqui para mostrar a quem pedir (cliente, auditor, fiscalização)."
      >
        <CartaoPop />
        <CampoTexto
          id="cert-texto-procedimentoDescricao"
          titulo="Descrição do método"
          ajuda="Resumo do método e das normas seguidas; sai no certificado ao lado do código do POP."
          valor={v.textos.procedimentoDescricao}
          padrao={TEXTOS_PADRAO.procedimentoDescricao}
          aoMudar={(t) => setTexto('procedimentoDescricao', t)}
          avisos={avisosDoTexto('procedimentoDescricao', v.textos.procedimentoDescricao)}
        />
      </Bloco>

      <Divisor />

      <Bloco titulo="Revisão antes da emissão">
        <Interruptor
          id="cert-revisor"
          ligado={v.exigirRevisor}
          aoMudar={(ligado) => s.mudar((x) => ({ ...x, exigirRevisor: ligado }))}
          titulo="Exigir revisão por outra pessoa antes de emitir"
          descricao={
            <>
              <b className="font-medium text-ink">Ligado:</b> quem fez a calibração não pode emitir o próprio certificado; outro
              signatário confere e autoriza. É o que a norma recomenda quando há mais de uma pessoa habilitada.{' '}
              <b className="font-medium text-ink">Desligado:</b> o técnico que também é signatário pode emitir as próprias
              calibrações (bom para equipes pequenas).
            </>
          }
        />
      </Bloco>

      <Divisor />

      <Bloco
        titulo="Textos fixos do certificado"
        descricao="Saem em todos os certificados. Os textos padrão seguem a norma ISO/IEC 17025 e as orientações do Inmetro: mude só se tiver certeza."
      >
        <Nota tom="info" icone={<Info />}>
          Onde estiver escrito <code className="rounded bg-surface px-1 font-mono text-[12px]">{'{empresa}'}</code>, o certificado
          mostra a razão social: <b className="font-semibold">{razao || '(informe em Empresa)'}</b>.
        </Nota>
        {textosComValidade.length > 0 && (
          <Nota tom="perigo" icone={<ShieldAlert />}>
            {ERRO_VALIDADE}
          </Nota>
        )}
        <div className="flex flex-col gap-5">
          {TEXTOS_FIXOS.map((t) => (
            <CampoTexto
              key={t.chave}
              id={`cert-texto-${t.chave}`}
              titulo={t.titulo}
              ajuda={t.ajuda}
              valor={v.textos[t.chave]}
              padrao={TEXTOS_PADRAO[t.chave]}
              aoMudar={(x) => setTexto(t.chave, x)}
              avisos={avisosDoTexto(t.chave, v.textos[t.chave])}
              opcional={t.chave === 'observacoesPadrao'}
            />
          ))}
        </div>
      </Bloco>
    </FormSecao>
  )
}

/** Um texto fixo do certificado: título, para que serve, o texto e "Restaurar texto padrão". */
function CampoTexto({
  id,
  titulo,
  ajuda,
  valor,
  padrao,
  aoMudar,
  avisos,
  opcional,
}: {
  id: string
  titulo: string
  ajuda: string
  valor: string
  padrao: string
  aoMudar: (t: string) => void
  avisos: string[]
  opcional?: boolean
}) {
  const temValidade = PALAVRA_VALIDADE.test(valor)
  const linhas = Math.min(9, Math.max(3, Math.ceil(valor.length / 95) + 1))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
            {titulo}
            {opcional && <span className="font-normal text-muted"> (opcional)</span>}
          </label>
          <p className="text-xs text-muted">{ajuda}</p>
        </div>
        {padrao && <BotaoRestaurar desabilitado={valor === padrao} aoClicar={() => aoMudar(padrao)} />}
      </div>
      <Textarea
        id={id}
        rows={linhas}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={temValidade}
        placeholder={opcional ? 'Ex.: Calibração realizada com a balança no local de uso.' : undefined}
        className={cn('text-[13.5px] leading-relaxed', temValidade && 'border-danger!')}
      />
      {temValidade && <p className="text-xs font-medium text-danger">{ERRO_VALIDADE}</p>}
      {avisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 text-xs font-medium text-warning">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {a}
        </p>
      ))}
    </div>
  )
}

// ---- Cálculo da incerteza --------------------------------------------------------------------

function SecaoCalculo({ config, salvarParte, aoSujo }: PropsSecao) {
  const s = useSecao('calculo', config.opcoesPadrao, aoSujo)
  const o = s.valor
  const set = <K extends keyof OpcoesCalculo>(k: K, v: OpcoesCalculo[K]) => s.mudar((x) => ({ ...x, [k]: v }))
  const [kdTexto, setKdTexto] = useState(() => String(o.kD).replace('.', ','))
  const kdNumero = Number(kdTexto.replace(',', '.'))
  const erroKd = o.deriva === 'KD' && !(kdNumero >= 0.1 && kdNumero <= 3) ? 'Use um número entre 0,1 e 3.' : null
  // Descartar ou a gravação de outra pessoa trocam o kD: o campo acompanha
  const [kdBase, setKdBase] = useState(o.kD)
  if (o.kD !== kdBase) {
    setKdBase(o.kD)
    if (Number(kdTexto.replace(',', '.')) !== o.kD) setKdTexto(String(o.kD).replace('.', ','))
  }

  const empuxo: Array<OpcaoEscolha<OpcoesCalculo['empuxo']>> = [
    {
      valor: 'NAO_AJUSTADO',
      label: 'Balança não ajustada antes',
      ajuda: 'Considera a variação do ar entre o ajuste de fábrica e o local de uso. A opção mais segura.',
      recomendado: true,
    },
    {
      valor: 'AJUSTADO',
      label: 'Balança ajustada logo antes',
      ajuda: 'Use quando a balança foi ajustada no próprio local, imediatamente antes da calibração.',
    },
    {
      valor: 'NENHUM',
      label: 'Não considerar',
      ajuda: 'Deixa o efeito do ar fora da incerteza. Só para balanças de baixa exatidão, onde ele não faz diferença.',
    },
  ]
  // Opção avançada, só aparece se estiver em uso
  if (o.empuxo === 'DELTA_T' || config.opcoesPadrao.empuxo === 'DELTA_T')
    empuxo.push({
      valor: 'DELTA_T',
      label: 'Pela variação de temperatura',
      ajuda: `Usa a variação de temperatura do local (${String(o.deltaTLocal).replace('.', ',')} K).`,
    })

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    s.setTentou(true)
    if (erroKd) return toast.erro('Confira o cálculo', `Fator kD: ${erroKd}`)
    void s.gravar(async () => (await salvarParte({ opcoesPadrao: o }, 'Cálculo da incerteza')).opcoesPadrao)
  }

  return (
    <FormSecao
      id="calculo"
      icone={<Sigma className="h-4 w-4" />}
      titulo="Cálculo da incerteza"
      descricao="Como as novas calibrações calculam a incerteza (EURAMET cg-18). O técnico pode mudar numa calibração específica."
      sujo={s.sujo}
      salvando={s.salvando}
      aoDescartar={s.descartar}
      aoEnviar={enviar}
    >
      <Nota tom="neutro" icone={<Info />}>
        Estes são os <b className="font-medium text-ink">valores iniciais</b> de cada calibração nova. Cada certificado guarda as
        opções usadas no cálculo, então mudar aqui não altera calibrações já feitas. Na dúvida, fique com as recomendadas.
      </Nota>

      <Escolha
        nome="calc-empuxo"
        legenda="Empuxo do ar"
        ajuda="O ar “empurra” os pesos para cima e muda um pouco a leitura. Escolha como esse efeito entra na incerteza."
        valor={o.empuxo}
        aoMudar={(v) => set('empuxo', v)}
        opcoes={empuxo}
        colunas={empuxo.length === 4 ? 4 : 3}
      />

      <Escolha
        nome="calc-deriva"
        legenda="Deriva dos pesos"
        ajuda="Com o tempo, a massa dos pesos padrão muda um pouco. Escolha como estimar essa mudança."
        valor={o.deriva}
        aoMudar={(v) => set('deriva', v)}
        colunas={2}
        opcoes={[
          {
            valor: 'EMA',
            label: 'Pelo erro máximo da classe',
            ajuda:
              'Usa o erro máximo admissível da classe dos pesos (ex.: M1). O certo quando ainda não há histórico de calibrações dos pesos.',
            recomendado: true,
          },
          {
            valor: 'KD',
            label: 'Pela incerteza do certificado × kD',
            ajuda: 'Usa a incerteza do certificado dos pesos multiplicada por um fator. Para quem já acompanha os pesos há anos.',
          },
        ]}
      >
        <AnimatePresence initial={false}>
          {o.deriva === 'KD' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Field
                label="Fator kD"
                htmlFor="calc-kd"
                className="max-w-[220px] pt-1"
                erro={erroKd}
                hint="Entre 0,1 e 3. Normalmente 1."
              >
                <Input
                  id="calc-kd"
                  inputMode="decimal"
                  value={kdTexto}
                  onChange={(x) => {
                    const t = x.target.value.replace(/[^\d,.]/g, '')
                    setKdTexto(t)
                    const n = Number(t.replace(',', '.'))
                    if (n >= 0.1 && n <= 3) set('kD', n)
                  }}
                  className={cn('tnum', erroKd && 'border-danger!')}
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
      </Escolha>

      <Escolha
        nome="calc-k"
        legenda="Fator de abrangência (k)"
        ajuda="O número que multiplica a incerteza para chegar a cerca de 95 % de probabilidade."
        valor={o.metodoK}
        aoMudar={(v) => set('metodoK', v)}
        opcoes={[
          {
            valor: 'T_EXATO',
            label: 't de Student',
            ajuda:
              'Calcula o k pelos graus de liberdade de cada ponto. Com poucas leituras, o k fica um pouco maior, mais correto.',
            recomendado: true,
          },
          {
            valor: 'TABELA',
            label: 'Tabela do GUM',
            ajuda: 'O mesmo princípio, com o k tirado da tabela G.2 do guia de incerteza (GUM).',
          },
          {
            valor: 'K2',
            label: 'k = 2 fixo',
            ajuda: 'Sempre 2. Mais simples, mas pode subestimar a incerteza com poucas leituras.',
          },
        ]}
      >
        {o.metodoK === 'K2' && (
          <Nota tom="aviso" icone={<TriangleAlert />}>
            Com k = 2 fixo, ajuste também o texto “Declaração da incerteza” em Certificado: o texto padrão fala do k calculado
            pela distribuição t.
          </Nota>
        )}
      </Escolha>

      <Escolha
        nome="calc-histerese"
        legenda="Histerese (carregando e descarregando)"
        ajuda="Vale quando o ensaio sobe e desce a carga: a leitura descendo pode ser um pouco diferente da subindo."
        valor={o.histerese}
        aoMudar={(v) => set('histerese', v)}
        colunas={2}
        opcoes={[
          {
            valor: 'SEPARADO',
            label: 'Erros de subida e descida separados',
            ajuda: 'O certificado mostra os dois erros de cada ponto. É o método do guia EURAMET.',
            recomendado: true,
          },
          {
            valor: 'MEDIA',
            label: 'Um erro pela média',
            ajuda: 'Mostra um único erro por ponto e soma a diferença entre subida e descida à incerteza.',
          },
        ]}
      />

      <div className="flex flex-col gap-2.5">
        <p className="text-sm font-semibold text-ink">Outras opções</p>
        <Interruptor
          id="calc-excentricidade"
          ligado={o.excentricidade}
          aoMudar={(v) => set('excentricidade', v)}
          titulo="Incluir a excentricidade na incerteza"
          descricao="Soma à incerteza de cada ponto o efeito de colocar a carga fora do centro do prato, medido no ensaio de excentricidade. Recomendado: ligado."
        />
        <Interruptor
          id="calc-zero"
          ligado={o.zeroAprovado}
          aoMudar={(v) => set('zeroAprovado', v)}
          titulo="Resolução no zero menor para balança aprovada"
          descricao="Para balanças com modelo aprovado pelo Inmetro e zero automático, o erro de arredondamento no zero é menor (d/4√3 em vez de d/√12). Na dúvida, deixe desligado."
        />
      </div>
    </FormSecao>
  )
}

// ---- Vencimentos e lembretes ---------------------------------------------------------------

type RascunhoVencimentos = Pick<
  Config,
  'diasAvisoVencimento' | 'mesesProximaPadrao' | 'lembreteAssunto' | 'lembreteMensagem' | 'emailAssunto' | 'emailMensagem'
>

const VARIAVEIS_LEMBRETE: Variavel[] = [
  { chave: 'cliente', ajuda: 'nome do cliente' },
  { chave: 'balancas', ajuda: 'lista das balanças, com as datas' },
  { chave: 'data', ajuda: 'a data mais próxima' },
  { chave: 'empresa', ajuda: 'o nome da sua empresa' },
]
const VARIAVEIS_CERTIFICADO: Variavel[] = [
  { chave: 'numero', ajuda: 'número do certificado' },
  { chave: 'cliente', ajuda: 'nome do cliente' },
  { chave: 'balanca', ajuda: 'a balança calibrada' },
  { chave: 'empresa', ajuda: 'o nome da sua empresa' },
]

function SecaoVencimentos({ config, salvarParte, aoSujo }: PropsSecao) {
  const atual = useMemo<RascunhoVencimentos>(
    () => ({
      diasAvisoVencimento: config.diasAvisoVencimento,
      mesesProximaPadrao: config.mesesProximaPadrao,
      lembreteAssunto: config.lembreteAssunto,
      lembreteMensagem: config.lembreteMensagem,
      emailAssunto: config.emailAssunto,
      emailMensagem: config.emailMensagem,
    }),
    [config],
  )
  const s = useSecao('vencimentos', atual, aoSujo)
  const v = s.valor
  const set = <K extends keyof RascunhoVencimentos>(k: K, x: RascunhoVencimentos[K]) => s.mudar((r) => ({ ...r, [k]: x }))
  const ano = Number(hojeISO().slice(0, 4))
  const empresa = config.empresa.nomeFantasia || config.empresa.razaoSocial

  const exemploLembrete = {
    cliente: 'Supermercado Ideal',
    empresa,
    data: `14/11/${ano}`,
    balancas: [
      `• Balança computadora Toledo Prix 3 — 15 kg × 5 g — série 2096123 — vence em 14/11/${ano}`,
      `• Balança plataforma Filizola — 300 kg × 100 g — série 88412 — vence em 20/11/${ano}`,
    ].join('\n'),
  }
  const exemploCertificado = {
    numero: formatarNumeroCertificado(config.numeracao, 124, ano),
    cliente: 'Supermercado Ideal',
    balanca: 'Balança computadora Toledo Prix 3 — 15 kg × 5 g',
    empresa,
  }

  const erros = {
    lembreteAssunto: !v.lembreteAssunto.trim() ? 'Informe o assunto do lembrete.' : null,
    lembreteMensagem: !v.lembreteMensagem.trim() ? 'Escreva a mensagem do lembrete.' : null,
    emailAssunto: !v.emailAssunto.trim() ? 'Informe o assunto do e-mail do certificado.' : null,
    emailMensagem: !v.emailMensagem.trim() ? 'Escreva a mensagem do e-mail do certificado.' : null,
  }

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    s.setTentou(true)
    const erro = Object.values(erros).find(Boolean)
    if (erro) return toast.erro('Confira os modelos de e-mail', erro)
    void s.gravar(async () => {
      const nova = await salvarParte(v, 'Vencimentos e lembretes')
      return {
        diasAvisoVencimento: nova.diasAvisoVencimento,
        mesesProximaPadrao: nova.mesesProximaPadrao,
        lembreteAssunto: nova.lembreteAssunto,
        lembreteMensagem: nova.lembreteMensagem,
        emailAssunto: nova.emailAssunto,
        emailMensagem: nova.emailMensagem,
      }
    })
  }

  return (
    <FormSecao
      id="vencimentos"
      icone={<BellRing className="h-4 w-4" />}
      titulo="Vencimentos e lembretes"
      descricao="Quando avisar sobre as calibrações dos clientes e o texto dos e-mails que saem do sistema."
      sujo={s.sujo}
      salvando={s.salvando}
      aoDescartar={s.descartar}
      aoEnviar={enviar}
    >
      <Bloco titulo="Prazos">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Avisar com antecedência de"
            htmlFor="venc-dias"
            hint="Dias antes da data: a balança aparece como “vence em breve” no painel e em Vencimentos."
          >
            <div className="flex items-center gap-2.5">
              <NumberInput
                id="venc-dias"
                valor={v.diasAvisoVencimento}
                aoMudar={(n) => set('diasAvisoVencimento', n ?? 1)}
                min={1}
                max={365}
                className="w-36"
              />
              <span className="text-sm text-ink-2">dias</span>
            </div>
          </Field>
          <Field
            label="Próxima calibração sugerida"
            htmlFor="venc-meses"
            hint="Meses depois da calibração. Só um lembrete interno: não sai no certificado, a não ser que o cliente peça. 0 = não sugerir."
          >
            <div className="flex items-center gap-2.5">
              <NumberInput
                id="venc-meses"
                valor={v.mesesProximaPadrao}
                aoMudar={(n) => set('mesesProximaPadrao', n ?? 0)}
                min={0}
                max={60}
                className="w-36"
              />
              <span className="text-sm text-ink-2">{v.mesesProximaPadrao === 1 ? 'mês' : 'meses'}</span>
            </div>
          </Field>
        </div>
      </Bloco>

      <Divisor />

      <Bloco
        titulo="Lembrete de calibração"
        descricao="O e-mail que avisa o cliente de que a calibração está chegando (enviado pela tela Vencimentos). Dá para mudar o texto antes de cada envio."
      >
        <Field label="Assunto" htmlFor="venc-lembrete-assunto" erro={s.tentou ? erros.lembreteAssunto : null}>
          <Input
            id="venc-lembrete-assunto"
            value={v.lembreteAssunto}
            onChange={(x) => set('lembreteAssunto', x.target.value)}
            maxLength={200}
          />
        </Field>
        <CampoModelo
          id="venc-lembrete-mensagem"
          rotulo="Mensagem"
          valor={v.lembreteMensagem}
          aoMudar={(t) => set('lembreteMensagem', t)}
          padrao={CONFIG_PADRAO.lembreteMensagem}
          variaveis={VARIAVEIS_LEMBRETE}
          linhas={10}
          aviso={
            s.tentou && erros.lembreteMensagem
              ? erros.lembreteMensagem
              : !v.lembreteMensagem.includes('{balancas}')
                ? 'A mensagem não tem {balancas}: o cliente não vai ver quais balanças vencem.'
                : null
          }
          exemplo={`${preencherModelo(v.lembreteAssunto, exemploLembrete)}\n\n${preencherModelo(v.lembreteMensagem, exemploLembrete)}`}
        />
      </Bloco>

      <Divisor />

      <Bloco titulo="E-mail do certificado" descricao="O e-mail que leva o PDF do certificado ao cliente.">
        <Field label="Assunto" htmlFor="venc-email-assunto" erro={s.tentou ? erros.emailAssunto : null}>
          <Input
            id="venc-email-assunto"
            value={v.emailAssunto}
            onChange={(x) => set('emailAssunto', x.target.value)}
            maxLength={200}
          />
        </Field>
        <CampoModelo
          id="venc-email-mensagem"
          rotulo="Mensagem"
          valor={v.emailMensagem}
          aoMudar={(t) => set('emailMensagem', t)}
          padrao={CONFIG_PADRAO.emailMensagem}
          variaveis={VARIAVEIS_CERTIFICADO}
          linhas={8}
          aviso={s.tentou ? erros.emailMensagem : null}
          exemplo={`${preencherModelo(v.emailAssunto, exemploCertificado)}\n\n${preencherModelo(v.emailMensagem, exemploCertificado)}`}
        />
      </Bloco>
    </FormSecao>
  )
}

// ---- E-mail (SMTP) ---------------------------------------------------------------------------

type Seguranca = ConfigEmail['seguranca']

interface RascunhoEmail {
  servidor: string
  porta: number
  seguranca: Seguranca
  usuario: string
  /** Em branco: mantém a senha gravada. */
  senha: string
  remetenteNome: string
  remetenteEmail: string
}

const PORTA_PADRAO: Record<Seguranca, number> = { STARTTLS: 587, SSL: 465, NENHUMA: 25 }

const deConfigEmail = (c: Partial<ConfigEmail>): RascunhoEmail => ({
  servidor: c.servidor ?? '',
  porta: c.porta ?? 587,
  seguranca: c.seguranca ?? 'STARTTLS',
  usuario: c.usuario ?? '',
  senha: '',
  remetenteNome: c.remetenteNome ?? '',
  remetenteEmail: c.remetenteEmail ?? '',
})

const PROVEDORES: Array<{
  nome: string
  servidor: string
  porta: number
  seguranca: Seguranca
  senha: string
}> = [
  { nome: 'Gmail', servidor: 'smtp.gmail.com', porta: 587, seguranca: 'STARTTLS', senha: 'Senha de app' },
  { nome: 'Outlook / Hotmail', servidor: 'smtp-mail.outlook.com', porta: 587, seguranca: 'STARTTLS', senha: 'Senha de app' },
  { nome: 'Microsoft 365', servidor: 'smtp.office365.com', porta: 587, seguranca: 'STARTTLS', senha: 'Senha da conta ou de app' },
  { nome: 'Locaweb', servidor: 'email-ssl.com.br', porta: 465, seguranca: 'SSL', senha: 'Senha da caixa de e-mail' },
]

function SecaoEmail({ aoSujo }: { aoSujo: AoSujo }) {
  const { dados, carregando, erro, definir, recarregar } = useConsulta('config:email', () => api.configEmail(), ['config'])
  if (!dados) {
    return carregando ? (
      <EsqueletoSecao />
    ) : (
      <ErroSecao titulo="Não foi possível carregar a configuração do e-mail" erro={erro} aoTentar={recarregar} />
    )
  }
  return <FormEmail atual={dados} definir={definir} recarregar={recarregar} aoSujo={aoSujo} />
}

function FormEmail({
  atual,
  definir,
  recarregar,
  aoSujo,
}: {
  atual: ConfigEmail
  definir: (c: ConfigEmail) => void
  recarregar: () => void
  aoSujo: AoSujo
}) {
  const base = useMemo(() => deConfigEmail(atual), [atual])
  const s = useSecao('email', base, aoSujo)
  const v = s.valor
  const set = <K extends keyof RascunhoEmail>(k: K, x: RascunhoEmail[K]) => s.mudar((r) => ({ ...r, [k]: x }))

  const servidor = v.servidor.trim().toLowerCase()
  const usuario = v.usuario.trim()
  const remetente = v.remetenteEmail.trim() || (emailValido(usuario) ? usuario : '')
  // A senha gravada só vale para o mesmo servidor, porta e usuário (regra do servidor)
  const mudouDestino =
    servidor !== atual.servidor ||
    v.porta !== atual.porta ||
    usuario !== atual.usuario ||
    (v.seguranca === 'NENHUMA' && atual.seguranca !== 'NENHUMA')
  const erros = {
    servidor: !servidor
      ? 'Informe o servidor (SMTP), ex.: smtp.gmail.com.'
      : !/^[a-z0-9.-]+$/.test(servidor)
        ? 'Servidor inválido: só letras, números, ponto e hífen.'
        : null,
    usuario: !usuario ? 'Informe o usuário (normalmente o próprio e-mail).' : null,
    senha: v.senha
      ? null
      : !atual.senhaDefinida
        ? 'Informe a senha (no Gmail e no Outlook, a senha de app).'
        : mudouDestino && servidor && usuario
          ? 'Você trocou o servidor, a porta, o usuário ou a segurança: digite a senha de novo.'
          : null,
    remetenteEmail: !remetente
      ? 'Informe o e-mail que aparece como remetente.'
      : !emailValido(remetente)
        ? 'E-mail inválido.'
        : null,
  }
  const mostrar = (k: keyof typeof erros) => (s.tentou ? erros[k] : null)

  const mudarSeguranca = (seg: Seguranca) =>
    s.mudar((r) => ({
      ...r,
      seguranca: seg,
      // A porta acompanha se ainda era a padrão da segurança anterior
      porta: r.porta === PORTA_PADRAO[r.seguranca] ? PORTA_PADRAO[seg] : r.porta,
    }))

  const usarProvedor = (p: (typeof PROVEDORES)[number]) =>
    s.mudar((r) => ({ ...r, servidor: p.servidor, porta: p.porta, seguranca: p.seguranca }))

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    s.setTentou(true)
    const erro = Object.values(erros).find(Boolean)
    if (erro) return toast.erro('Confira o e-mail', erro)
    void s.gravar(async () => {
      const r = await api.salvarConfigEmail({
        servidor,
        porta: v.porta,
        seguranca: v.seguranca,
        usuario,
        senha: v.senha,
        remetenteNome: v.remetenteNome.trim(),
        remetenteEmail: remetente,
      })
      definir(r)
      useTempoReal.getState().mudou('config')
      toast.sucesso('E-mail salvo', r.configurado ? 'Agora envie um e-mail de teste para conferir.' : undefined)
      return deConfigEmail(r)
    })
  }

  // ---- Teste e esquecer ----
  const [para, setPara] = useState(atual.remetenteEmail)
  const [testando, setTestando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const motivoSemTeste = !atual.configurado
    ? 'Salve a configuração antes de testar.'
    : s.sujo
      ? 'Salve as alterações antes de testar: o teste usa o que está gravado.'
      : null

  const testar = async () => {
    const destino = para.trim()
    if (!emailValido(destino)) return setResultado({ ok: false, texto: 'Informe um e-mail válido para receber o teste.' })
    setTestando(true)
    setResultado(null)
    try {
      await api.testarEmail(destino)
      setResultado({ ok: true, texto: `Enviado para ${destino}. Confira a caixa de entrada (e a pasta de spam).` })
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : 'Erro inesperado.' })
    } finally {
      setTestando(false)
    }
  }

  const esquecer = async () => {
    const ok = await confirmar({
      titulo: 'Esquecer a configuração do e-mail?',
      descricao:
        'Apaga o servidor, o usuário e a senha gravados. Certificados e lembretes deixam de sair por e-mail até você configurar de novo.',
      confirmar: 'Esquecer configuração',
      perigo: true,
    })
    if (!ok) return
    try {
      await api.esquecerConfigEmail()
      setResultado(null)
      recarregar()
      useTempoReal.getState().mudou('config')
      toast.sucesso('Configuração do e-mail apagada')
    } catch (e) {
      avisarErro('Não foi possível apagar', e)
    }
  }

  return (
    <>
      <FormSecao
        id="email"
        icone={<Mail className="h-4 w-4" />}
        titulo="E-mail"
        descricao="A conta de e-mail da empresa que envia os certificados e os lembretes aos clientes."
        acoes={atual.configurado ? <Badge tom="success">Configurado</Badge> : <Badge tom="neutral">Não configurado</Badge>}
        sujo={s.sujo}
        salvando={s.salvando}
        aoDescartar={s.descartar}
        aoEnviar={enviar}
      >
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-ink-2">Preencher com os dados de</p>
          <div className="flex flex-wrap gap-2">
            {PROVEDORES.map((p) => (
              <Button
                key={p.nome}
                tamanho="sm"
                variante={servidor === p.servidor ? 'soft' : 'secondary'}
                onClick={() => usarProvedor(p)}
                icone={servidor === p.servidor ? <Check className="h-3.5 w-3.5" /> : undefined}
              >
                {p.nome}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Field
            label="Servidor (SMTP)"
            htmlFor="email-servidor"
            className="sm:col-span-4"
            erro={mostrar('servidor')}
            hint="O provedor informa. Ex.: smtp.gmail.com"
          >
            <Input
              id="email-servidor"
              value={v.servidor}
              onChange={(x) => set('servidor', x.target.value)}
              placeholder="smtp.suaempresa.com.br"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono text-[13.5px]"
            />
          </Field>
          <Field label="Porta" htmlFor="email-porta" className="sm:col-span-2">
            <NumberInput id="email-porta" valor={v.porta} aoMudar={(n) => set('porta', n ?? 587)} min={1} max={65535} />
          </Field>
          <Field
            label="Segurança"
            className="sm:col-span-6"
            hint={v.seguranca === 'NENHUMA' ? undefined : 'Na dúvida: porta 587 com STARTTLS, ou 465 com SSL.'}
          >
            <Segmented
              valor={v.seguranca}
              aoMudar={mudarSeguranca}
              opcoes={[
                { valor: 'STARTTLS', label: 'STARTTLS (587)' },
                { valor: 'SSL', label: 'SSL/TLS (465)' },
                { valor: 'NENHUMA', label: 'Nenhuma' },
              ]}
            />
          </Field>
          {v.seguranca === 'NENHUMA' && (
            <Nota tom="aviso" icone={<TriangleAlert />} className="sm:col-span-6">
              Sem segurança, a senha e as mensagens passam abertas pela internet. Use só se o provedor exigir.
            </Nota>
          )}
          <Field
            label="Usuário"
            htmlFor="email-usuario"
            className="sm:col-span-3"
            erro={mostrar('usuario')}
            hint="Quase sempre o e-mail completo."
          >
            <Input
              id="email-usuario"
              value={v.usuario}
              onChange={(x) => set('usuario', x.target.value)}
              placeholder="certificados@suaempresa.com.br"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Senha"
            htmlFor="email-senha"
            className="sm:col-span-3"
            erro={mostrar('senha') ?? (erros.senha && atual.senhaDefinida && mudouDestino ? erros.senha : null)}
            hint={atual.senhaDefinida ? 'Em branco, mantém a senha gravada.' : 'No Gmail e no Outlook, use a senha de app.'}
          >
            <CampoSenha
              id="email-senha"
              autoComplete="new-password"
              value={v.senha}
              onChange={(x) => set('senha', x.target.value)}
              placeholder={atual.senhaDefinida ? '•••••••• (gravada)' : ''}
            />
          </Field>
          <Field
            label="Nome do remetente"
            htmlFor="email-rem-nome"
            className="sm:col-span-3"
            hint="Como o cliente vê quem enviou."
          >
            <Input
              id="email-rem-nome"
              value={v.remetenteNome}
              onChange={(x) => set('remetenteNome', x.target.value)}
              placeholder="Balanças.com"
              maxLength={120}
            />
          </Field>
          <Field
            label="E-mail do remetente"
            htmlFor="email-rem-email"
            className="sm:col-span-3"
            erro={mostrar('remetenteEmail')}
            hint="Em branco, usa o usuário."
          >
            <Input
              id="email-rem-email"
              type="email"
              value={v.remetenteEmail}
              onChange={(x) => set('remetenteEmail', x.target.value)}
              placeholder={emailValido(usuario) ? usuario : 'certificados@suaempresa.com.br'}
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
        </div>

        <details className="group rounded-xl border border-line bg-surface-2/40">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[13px] font-medium text-ink select-none">
            <KeyRound className="h-4 w-4 text-muted" />
            Onde encontro esses dados? E o que é a “senha de app”?
          </summary>
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5 text-[13px] leading-relaxed text-ink-2">
            <div className="scroll-fino -mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[480px] text-left text-[12.5px]">
                <thead>
                  <tr className="text-muted">
                    <th className="py-1.5 pr-3 font-medium">Provedor</th>
                    <th className="py-1.5 pr-3 font-medium">Servidor</th>
                    <th className="py-1.5 pr-3 font-medium">Porta</th>
                    <th className="py-1.5 pr-3 font-medium">Segurança</th>
                    <th className="py-1.5 font-medium">Senha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {PROVEDORES.map((p) => (
                    <tr key={p.nome}>
                      <td className="py-1.5 pr-3 font-medium text-ink">{p.nome}</td>
                      <td className="py-1.5 pr-3 font-mono text-[12px]">{p.servidor}</td>
                      <td className="tnum py-1.5 pr-3">{p.porta}</td>
                      <td className="py-1.5 pr-3">{p.seguranca === 'SSL' ? 'SSL/TLS' : p.seguranca}</td>
                      <td className="py-1.5">{p.senha}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <b className="font-semibold text-ink">Senha de app:</b> o Gmail e o Outlook não aceitam a senha normal da conta em
              programas como este. É preciso criar uma senha especial, só para o BC Calibração:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <b className="font-medium text-ink">Gmail:</b> ative a “Verificação em duas etapas” na conta Google e crie a senha
                em <span className="font-mono text-[12px]">myaccount.google.com/apppasswords</span>. Copie as 16 letras (sem os
                espaços) e cole no campo Senha.
              </li>
              <li>
                <b className="font-medium text-ink">Outlook e Hotmail:</b> ative a verificação em duas etapas na conta Microsoft e
                crie a senha de app em “Segurança”. A Microsoft vem bloqueando esse tipo de envio em algumas contas: se não
                funcionar, prefira o e-mail do domínio da empresa ou uma conta Gmail.
              </li>
              <li>
                <b className="font-medium text-ink">Locaweb e outros provedores de domínio próprio:</b> use o e-mail completo como
                usuário e a senha da própria caixa de e-mail.
              </li>
            </ul>
            <p className="text-muted">
              A senha fica só no computador do servidor, nunca aparece nas telas e não vai nas cópias de segurança.
            </p>
          </div>
        </details>
      </FormSecao>

      <Card>
        <CardHeader
          icone={<Send className="h-4 w-4" />}
          titulo="Testar o envio"
          descricao="Manda uma mensagem curta para conferir se tudo está certo."
        />
        <div className="flex flex-col gap-3 border-t border-line px-5 py-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field
              label="Enviar o teste para"
              htmlFor="email-teste"
              className="min-w-0 flex-1"
              hint={motivoSemTeste ?? undefined}
            >
              <Input
                id="email-teste"
                type="email"
                value={para}
                onChange={(x) => setPara(x.target.value)}
                onKeyDown={(x) => {
                  if (x.key === 'Enter' && !motivoSemTeste && !testando) {
                    x.preventDefault()
                    void testar()
                  }
                }}
                placeholder="seu-email@empresa.com.br"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Button
              onClick={() => void testar()}
              disabled={!!motivoSemTeste || testando}
              icone={testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              className={cn(motivoSemTeste && 'sm:mb-[22px]')}
            >
              {testando ? 'Enviando…' : 'Enviar e-mail de teste'}
            </Button>
          </div>
          <AnimatePresence initial={false}>
            {resultado && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status">
                <Nota tom={resultado.ok ? 'info' : 'perigo'} icone={resultado.ok ? <MailCheck /> : <MailX />}>
                  <b className="font-semibold">{resultado.ok ? 'E-mail de teste enviado.' : 'O teste falhou.'}</b>{' '}
                  {resultado.texto}
                </Nota>
              </motion.div>
            )}
          </AnimatePresence>
          {(atual.servidor || atual.senhaDefinida) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <p className="text-xs text-muted">Trocou de e-mail ou de provedor? Dá para apagar tudo e começar de novo.</p>
              <Button
                tamanho="sm"
                variante="ghost"
                icone={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => void esquecer()}
                className="text-danger hover:bg-danger-soft hover:text-danger"
              >
                Esquecer configuração
              </Button>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}

// ---- Cópias de segurança -------------------------------------------------------------------

const MOTIVO_COPIA: Record<string, { label: string; tom: 'neutral' | 'brand' | 'warning' }> = {
  diario: { label: 'Automática', tom: 'neutral' },
  manual: { label: 'Feita à mão', tom: 'brand' },
  'antes-restaurar': { label: 'Antes de restaurar', tom: 'warning' },
}

const motivoDaCopia = (arquivo: string) => MOTIVO_COPIA[arquivo.match(/_([a-z-]+)\.db$/)?.[1] ?? ''] ?? MOTIVO_COPIA.diario

function SecaoBackup() {
  const { dados, carregando, erro, recarregar } = useConsulta('backups', () => api.backups(), [])
  const [fazendo, setFazendo] = useState(false)
  const [todas, setTodas] = useState(false)

  const copiarAgora = async () => {
    setFazendo(true)
    try {
      const r = await api.copiaAgora()
      recarregar()
      toast.sucesso('Cópia de segurança feita', r.arquivo)
    } catch (e) {
      avisarErro('Não foi possível fazer a cópia', e)
    } finally {
      setFazendo(false)
    }
  }

  const lista = dados?.backups ?? []
  const pasta = dados?.pasta ?? ''
  const pastaDados = pasta.replace(/[\\/]backups[\\/]?$/, '')
  const ultima = lista[0]
  const diasDesdeUltima = ultima ? diasEntre(hojeLocalIso(new Date(ultima.criadoEm)), hojeISO()) : Infinity
  const visiveis = todas ? lista : lista.slice(0, 8)

  return (
    <>
      <Card>
        <CardHeader
          icone={<DatabaseBackup className="h-4 w-4" />}
          titulo="Cópias de segurança"
          descricao="O sistema faz sozinho uma cópia completa do banco de dados por dia e guarda as últimas 30 (mais as 20 últimas feitas à mão)."
          acoes={
            <Button
              variante="primary"
              tamanho="sm"
              onClick={() => void copiarAgora()}
              disabled={fazendo}
              icone={fazendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />}
            >
              {fazendo ? 'Copiando…' : 'Fazer cópia agora'}
            </Button>
          }
        />
        {carregando ? (
          <div className="border-t border-line px-5 py-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-3" />
                <div className="h-3 w-48 animate-pulse rounded-full bg-surface-2" />
              </div>
            ))}
          </div>
        ) : erro && !dados ? (
          <div className="flex flex-col items-center gap-3 border-t border-line px-5 py-10 text-center">
            <p className="text-sm text-danger">{erro}</p>
            <Button tamanho="sm" icone={<RefreshCw className="h-3.5 w-3.5" />} onClick={recarregar}>
              Tentar de novo
            </Button>
          </div>
        ) : !lista.length ? (
          <p className="border-t border-line px-5 py-10 text-center text-sm text-muted">
            Nenhuma cópia ainda. A primeira é feita automaticamente; use “Fazer cópia agora” para não esperar.
          </p>
        ) : (
          <>
            {diasDesdeUltima > 2 && (
              <div className="border-t border-line px-5 py-3">
                <Nota tom="aviso" icone={<TriangleAlert />}>
                  A última cópia tem mais de 2 dias. Confira se o computador do servidor fica ligado, ou faça uma cópia agora.
                </Nota>
              </div>
            )}
            <ul className="divide-y divide-line border-t border-line">
              {visiveis.map((b, i) => {
                const motivo = motivoDaCopia(b.arquivo)
                return (
                  <motion.li
                    key={b.arquivo}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 10) * 0.02 }}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
                      <HardDrive className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
                        <span className="tnum">{dataHora(b.criadoEm)}</span>
                        <Badge tom={motivo.tom} className="h-5 px-2 text-[11px]">
                          {motivo.label}
                        </Badge>
                        {i === 0 && (
                          <Badge tom="success" ponto={false} className="h-5 px-2 text-[11px]">
                            Mais recente
                          </Badge>
                        )}
                      </p>
                      <p className="tnum truncate text-xs text-muted" title={b.arquivo}>
                        {tamanhoArquivo(b.tamanho)} · {b.arquivo}
                      </p>
                    </div>
                    <a
                      href={api.urlBackup(b.arquivo)}
                      download={b.arquivo}
                      className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line-strong/80 bg-surface px-3 text-[13px] font-medium text-ink shadow-xs transition-colors hover:border-line-strong hover:bg-surface-2 max-sm:w-8 max-sm:px-0"
                      aria-label={`Baixar a cópia de ${dataHora(b.criadoEm)}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="max-sm:hidden">Baixar</span>
                    </a>
                  </motion.li>
                )
              })}
            </ul>
            {lista.length > 8 && (
              <div className="flex justify-center border-t border-line px-5 py-2.5">
                <Button tamanho="sm" variante="ghost" onClick={() => setTodas((t) => !t)}>
                  {todas ? 'Mostrar menos' : `Mostrar todas (${lista.length})`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          icone={<FolderOpen className="h-4 w-4" />}
          titulo="Guarde uma cópia fora deste computador"
          descricao="As cópias automáticas ficam no mesmo disco do servidor."
        />
        <div className="flex flex-col gap-4 border-t border-line px-5 py-5">
          <Nota tom="aviso" icone={<ShieldAlert />}>
            Se o computador do servidor estragar, for roubado ou pegar vírus, as cópias se perdem junto com ele.{' '}
            <b className="font-semibold">Uma vez por semana, copie a pasta de dados inteira</b> para um HD externo, um pen drive
            ou para a nuvem (Google Drive, OneDrive, Dropbox).
          </Nota>
          {pasta ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-[13px] font-medium text-ink-2">Pasta de dados (copie esta)</p>
                <TextoCopiavel texto={pastaDados} rotulo="a pasta de dados" />
                <p className="text-xs text-muted">
                  Tem o banco, as cópias e os PDFs dos certificados emitidos e das folhas de campo impressas.
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-[13px] font-medium text-ink-2">Cópias automáticas</p>
                <TextoCopiavel texto={pasta} rotulo="a pasta das cópias" />
                <p className="text-xs text-muted">Arquivos .db completos e conferidos, um por dia.</p>
              </div>
            </div>
          ) : (
            !carregando && <p className="text-[13px] text-muted">A pasta aparece aqui depois de carregar a lista.</p>
          )}
          <p className="text-xs leading-relaxed text-muted">
            Os PDFs dos certificados e das folhas de campo ficam nas pastas <span className="font-mono">certificados</span> e{' '}
            <span className="font-mono">folhas-campo</span>, dentro da pasta de dados: eles não estão dentro das cópias do banco,
            por isso é importante copiar a pasta inteira. Para voltar uma cópia (restaurar), fale com quem instalou o sistema: a
            troca é feita no computador do servidor.
          </p>
        </div>
      </Card>
    </>
  )
}

// ---- Aparência ------------------------------------------------------------------------------

const TEMAS: Array<{ valor: Tema; label: string; ajuda: string; icone: LucideIcon }> = [
  { valor: 'light', label: 'Claro', ajuda: 'Fundo branco, bom em ambientes iluminados.', icone: Sun },
  { valor: 'dark', label: 'Escuro', ajuda: 'Fundo escuro, cansa menos a vista à noite.', icone: Moon },
  { valor: 'system', label: 'Igual ao computador', ajuda: 'Segue o claro ou o escuro do Windows.', icone: Monitor },
]

function SecaoAparencia() {
  const tema = useUI((s) => s.tema)
  const definirTema = useUI((s) => s.definirTema)
  const recolhida = useUI((s) => s.sidebarRecolhida)
  const alternarSidebar = useUI((s) => s.alternarSidebar)
  return (
    <Card>
      <CardHeader
        icone={<Palette className="h-4 w-4" />}
        titulo="Aparência"
        descricao="Preferências deste computador: cada pessoa escolhe a sua, e vale na hora (não precisa salvar)."
      />
      <div className="flex flex-col gap-6 border-t border-line px-5 py-5">
        <fieldset className="flex flex-col gap-2.5">
          <legend className="p-0 text-sm font-semibold text-ink">Tema</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {TEMAS.map((t) => {
              const ativo = t.valor === tema
              return (
                <label
                  key={t.valor}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-150',
                    'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]',
                    ativo
                      ? 'border-brand bg-brand-soft/50 ring-4 ring-[var(--ring)]/40'
                      : 'border-line-strong/80 bg-surface hover:border-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="tema"
                    value={t.valor}
                    checked={ativo}
                    onChange={() => definirTema(t.valor)}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                      ativo ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink-2',
                    )}
                  >
                    <t.icone className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{t.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{t.ajuda}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
        <div className="max-lg:hidden">
          <Interruptor
            id="aparencia-menu"
            ligado={recolhida}
            aoMudar={(v) => v !== recolhida && alternarSidebar()}
            titulo="Menu lateral compacto"
            descricao="Mostra só os ícones no menu da esquerda e deixa mais espaço para as tabelas."
          />
        </div>
      </div>
    </Card>
  )
}

// ---- Sobre ---------------------------------------------------------------------------------

function SecaoSobre() {
  const { dados } = useConsulta('saude', () => api.get<{ versao?: string }>('/api/saude'), [])
  const endereco = `${location.protocol}//${location.host}`
  const porta = location.port || (location.protocol === 'https:' ? '443' : '80')
  const noServidor = /^(localhost|127\.|\[?::1\]?$)/.test(location.hostname)
  return (
    <Card>
      <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
        <Logo className="h-16 w-16 drop-shadow-sm" />
        <h3 className="mt-3 text-lg font-semibold tracking-[-0.015em] text-ink">BC Calibração</h3>
        <p className="text-[13px] text-muted">Certificados de calibração de balanças · Balanças.com</p>
        <Badge tom="neutral" ponto={false} className="tnum mt-3">
          {dados?.versao ? `Versão ${dados.versao}` : 'Versão —'}
        </Badge>
      </div>
      <div className="flex flex-col gap-4 border-t border-line px-5 py-5">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
            <Network className="h-4 w-4 text-muted" /> Endereço de acesso na rede
          </p>
          <TextoCopiavel texto={endereco} rotulo="o endereço" />
          {noServidor && <p className="text-xs text-muted">Você está usando o sistema no próprio computador do servidor.</p>}
        </div>
        <Nota tom="info" icone={<Monitor />}>
          <p>
            Para acessar de outro computador da empresa, use{' '}
            <b className="font-mono font-semibold">http://&lt;nome-do-servidor&gt;:{porta}</b>
            {!noServidor && <> (ou o endereço acima)</>}.
          </p>
          <p className="mt-1.5 text-ink-2">
            O nome do servidor é o nome do computador onde o BC Calibração está instalado. No Windows, veja em Configurações →
            Sistema → Sobre → “Nome do dispositivo”.
          </p>
        </Nota>
        <a
          href={`${endereco}/#/`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-brand-ink underline-offset-2 hover:underline"
        >
          Abrir o sistema numa nova aba <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </Card>
  )
}

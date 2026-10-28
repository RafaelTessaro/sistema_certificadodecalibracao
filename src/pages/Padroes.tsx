import {
  CalendarClock,
  CopyPlus,
  Ellipsis,
  FileBadge2,
  FileWarning,
  Paperclip,
  Pencil,
  Plus,
  Power,
  PowerOff,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Weight,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  diasEntre,
  formatarDataBr,
  massaLegivel,
  resumoPesos,
  situacaoValidade,
  textoBusca,
  TIPOS_PADRAO,
  totalPesos,
  type SituacaoValidade,
} from '#shared/dominio.ts'
import { novoId } from '#shared/id.ts'
import type { Padrao, PadraoInput, TipoPadrao } from '#shared/tipos.ts'
import { IconePadrao, PadraoFormModal } from '../components/PadraoFormModal'
import { ValidadePadraoBadge } from '../components/Selos'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { confirmar } from '../components/ui/Feedback'
import { EmptyState, Menu, PageHeader, SearchInput, Segmented } from '../components/ui/Misc'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { useConsulta } from '../lib/consulta'
import { hojeISO, numero } from '../lib/format'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'

type Filtro = 'todos' | 'pesos' | 'instrumentos' | 'atencao'

const ORDEM_TIPO: TipoPadrao[] = ['PESOS', 'TERMOHIGROMETRO', 'BAROMETRO', 'OUTRO']

/** Dados do padrão sem os campos de controle (para gravar de novo). */
function dadosDe(p: Padrao): PadraoInput {
  const { id: _i, versao: _v, criadoEm: _c, atualizadoEm: _a, ...dados } = p
  return dados
}

/** Próximo código livre na mesma sequência: "JP-01" → "JP-02" (pula os já usados). */
function proximoCodigo(codigo: string, usados: string[]): string {
  const m = codigo.match(/^(.*?)(\d+)(\D*)$/)
  if (!m) return ''
  const [, prefixo, num, sufixo] = m
  const ocupados = new Set(usados.map((u) => u.toLowerCase()))
  for (let n = Number(num) + 1; n < Number(num) + 1000; n++) {
    const c = `${prefixo}${String(n).padStart(num.length, '0')}${sufixo}`
    if (!ocupados.has(c.toLowerCase())) return c
  }
  return ''
}

/**
 * Cópia para um jogo parecido: mesma composição, classe e laboratório. O que é de cada peça física
 * (série, certificado, datas, correção e incerteza) fica em branco para ser preenchido.
 */
function copiaDe(p: Padrao, usados: string[]): PadraoInput {
  return {
    ...dadosDe(p),
    identificacao: proximoCodigo(p.identificacao, usados),
    numeroSerie: '',
    certificado: '',
    dataCalibracao: '',
    validade: '',
    observacoes: '',
    ativo: true,
    certificadoArquivo: null,
    pesos: p.pesos.map((x) => ({ ...x, id: novoId(), correcao: 0, incerteza: 0 })),
  }
}

export function Padroes() {
  const [params, setParams] = useSearchParams()
  const podeExcluir = usePode('excluirPadrao')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [inativos, setInativos] = useState(false)
  const { dados, carregando, erro } = useConsulta(
    `padroes-lista:${inativos}`,
    () => api.padroes(inativos).then((r) => r.padroes),
    ['padrao'],
  )
  const { dados: diasAviso = 30 } = useConsulta(
    'config:diasAviso',
    () => api.config().then((r) => r.config.diasAvisoVencimento),
    ['config'],
  )
  const hoje = hojeISO()

  const padroes = useMemo(
    () =>
      [...(dados ?? [])].sort(
        (a, b) =>
          Number(b.ativo) - Number(a.ativo) ||
          ORDEM_TIPO.indexOf(a.tipo) - ORDEM_TIPO.indexOf(b.tipo) ||
          a.identificacao.localeCompare(b.identificacao, 'pt-BR', { numeric: true }),
      ),
    [dados],
  )
  const situacao = (p: Padrao): SituacaoValidade => situacaoValidade(p.validade, hoje, diasAviso)
  const vencidos = padroes.filter((p) => p.ativo && situacao(p) === 'VENCIDO')
  const vencendo = padroes.filter((p) => p.ativo && situacao(p) === 'VENCENDO')

  const [modalLocal, setModal] = useState<{ aberto: boolean; padrao?: Padrao; modelo?: { dados: PadraoInput; de: string } }>({
    aberto: false,
  })
  // `?novo=1` (vindo do painel ou da busca global) abre o cadastro direto
  const modal = params.get('novo') === '1' ? { aberto: true } : modalLocal
  const fecharModal = () => {
    setModal({ aberto: false })
    if (params.has('novo')) setParams({}, { replace: true })
  }

  const contagem = {
    pesos: padroes.filter((p) => p.tipo === 'PESOS').length,
    instrumentos: padroes.filter((p) => p.tipo !== 'PESOS').length,
    atencao: vencidos.length + vencendo.length,
  }

  // Poucos padrões: filtra a cada desenho, sem memorizar
  const termos = textoBusca(busca).split(' ').filter(Boolean)
  const lista = padroes
    .filter((p) => {
      if (filtro === 'pesos') return p.tipo === 'PESOS'
      if (filtro === 'instrumentos') return p.tipo !== 'PESOS'
      if (filtro === 'atencao') {
        const s = situacaoValidade(p.validade, hoje, diasAviso)
        return p.ativo && (s === 'VENCIDO' || s === 'VENCENDO')
      }
      return true
    })
    .filter((p) => {
      if (!termos.length) return true
      const alvo = textoBusca(
        p.identificacao,
        p.descricao,
        p.fabricante,
        p.modelo,
        p.numeroSerie,
        p.certificado,
        p.laboratorio,
        TIPOS_PADRAO[p.tipo],
      )
      return termos.every((t) => alvo.includes(t))
    })

  const editar = (p: Padrao) => setModal({ aberto: true, padrao: p })
  const duplicar = (p: Padrao) =>
    setModal({
      aberto: true,
      modelo: {
        dados: copiaDe(
          p,
          padroes.map((x) => x.identificacao),
        ),
        de: p.identificacao,
      },
    })

  const alternarAtivo = async (p: Padrao) => {
    try {
      await api.atualizarPadrao(p.id, { ...dadosDe(p), ativo: !p.ativo }, p.versao)
      useTempoReal.getState().mudou('padrao')
      toast.sucesso(p.ativo ? 'Padrão desativado' : 'Padrão reativado', p.identificacao)
    } catch (e) {
      avisarErro(p.ativo ? 'Não foi possível desativar' : 'Não foi possível reativar', e)
    }
  }

  const excluir = async (p: Padrao) => {
    const ok = await confirmar({
      titulo: `Excluir ${p.identificacao}?`,
      descricao: 'Esta ação não pode ser desfeita. Padrões usados em calibrações não podem ser excluídos (desative-os).',
      confirmar: 'Excluir padrão',
      perigo: true,
    })
    if (!ok) return
    try {
      await api.excluirPadrao(p.id)
      useTempoReal.getState().mudou('padrao')
      toast.sucesso('Padrão excluído', p.identificacao)
    } catch (e) {
      avisarErro('Não foi possível excluir', e)
    }
  }

  const ativos = padroes.filter((p) => p.ativo).length
  const descricao = [
    'Pesos padrão e instrumentos usados nas calibrações',
    `${numero(ativos)} em uso`,
    vencendo.length > 0 && `${vencendo.length} ${vencendo.length === 1 ? 'vence' : 'vencem'} em até ${diasAviso} dias`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <PageHeader
        titulo="Padrões"
        descricao={descricao}
        acoes={
          <Button variante="primary" icone={<Plus className="h-4 w-4" />} onClick={() => setModal({ aberto: true })}>
            Novo padrão
          </Button>
        }
      />

      {vencidos.length > 0 && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger-soft px-4 py-3.5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-danger shadow-xs">
            <ShieldAlert className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-danger">Padrões vencidos não podem ser usados na emissão de certificados</p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              Mande calibrar de novo e, com o certificado novo em mãos, atualize o cadastro (clique no padrão):
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {vencidos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => editar(p)}
                  className="tnum inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-danger/25 bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-danger/50"
                  title="Atualizar o certificado deste padrão"
                >
                  <IconePadrao tipo={p.tipo} className="h-3.5 w-3.5 text-danger" />
                  {p.identificacao}
                  <span className="font-normal text-muted">venceu em {formatarDataBr(p.validade)}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: 'todos', label: 'Todos', contagem: padroes.length },
            { valor: 'pesos', label: 'Pesos', contagem: contagem.pesos },
            { valor: 'instrumentos', label: 'Instrumentos', contagem: contagem.instrumentos },
            { valor: 'atencao', label: 'Vencidos ou vencendo', contagem: contagem.atencao },
          ]}
        />
        <SearchInput
          valor={busca}
          aoMudar={setBusca}
          placeholder="Buscar por código, certificado…"
          className="lg:ml-auto lg:w-72"
        />
        <label className="flex cursor-pointer items-center gap-2 text-[13px] whitespace-nowrap text-ink-2">
          <input
            type="checkbox"
            checked={inativos}
            onChange={(e) => setInativos(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Mostrar desativados
        </label>
      </div>

      {carregando ? (
        <EsqueletoCartoes />
      ) : erro && !dados ? (
        <div className="rounded-2xl border border-line bg-surface shadow-xs">
          <EmptyState icone={<Weight className="h-6 w-6" />} titulo="Não foi possível carregar os padrões" descricao={erro} />
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-xs">
          {padroes.length ? (
            <EmptyState
              icone={
                filtro === 'atencao' && !busca.trim() ? <ShieldCheck className="h-6 w-6" /> : <SearchX className="h-6 w-6" />
              }
              titulo={filtro === 'atencao' && !busca.trim() ? 'Tudo em dia' : 'Nenhum padrão encontrado'}
              descricao={
                filtro === 'atencao' && !busca.trim()
                  ? 'Nenhum padrão vencido ou perto de vencer.'
                  : 'Tente outra busca ou mude o filtro.'
              }
              acao={
                <Button
                  onClick={() => {
                    setBusca('')
                    setFiltro('todos')
                  }}
                >
                  Ver todos
                </Button>
              }
            />
          ) : (
            <EmptyState
              icone={<Weight className="h-6 w-6" />}
              titulo="Nenhum padrão cadastrado"
              descricao="Antes de calibrar, cadastre os pesos padrão com os dados do certificado de calibração deles: número, laboratório, próxima calibração e os valores de cada peça."
              acao={
                <Button variante="primary" icone={<Plus className="h-4 w-4" />} onClick={() => setModal({ aberto: true })}>
                  Cadastrar padrão
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {lista.map((p, i) => (
            <CartaoPadrao
              key={p.id}
              padrao={p}
              indice={i}
              situacao={situacao(p)}
              diasAviso={diasAviso}
              hoje={hoje}
              aoEditar={() => editar(p)}
              itensMenu={[
                { label: 'Editar', icone: <Pencil className="h-4 w-4" />, aoClicar: () => editar(p) },
                { label: 'Duplicar como novo', icone: <CopyPlus className="h-4 w-4" />, aoClicar: () => duplicar(p) },
                p.ativo
                  ? { label: 'Desativar', icone: <PowerOff className="h-4 w-4" />, aoClicar: () => void alternarAtivo(p) }
                  : { label: 'Reativar', icone: <Power className="h-4 w-4" />, aoClicar: () => void alternarAtivo(p) },
                ...(podeExcluir
                  ? ([
                      'sep',
                      { label: 'Excluir', icone: <Trash2 className="h-4 w-4" />, aoClicar: () => void excluir(p), perigo: true },
                    ] as const)
                  : []),
              ]}
            />
          ))}
        </div>
      )}

      <PadraoFormModal aberto={modal.aberto} aoFechar={fecharModal} padrao={modalLocal.padrao} modelo={modalLocal.modelo} />
    </>
  )
}

type ItemMenu = Parameters<typeof Menu>[0]['itens'][number]

function CartaoPadrao({
  padrao: p,
  indice,
  situacao,
  diasAviso,
  hoje,
  aoEditar,
  itensMenu,
}: {
  padrao: Padrao
  indice: number
  situacao: SituacaoValidade
  diasAviso: number
  hoje: string
  aoEditar: () => void
  itensMenu: ItemMenu[]
}) {
  const vencido = p.ativo && situacao === 'VENCIDO'
  const ehPesos = p.tipo === 'PESOS'
  const dias = p.validade ? diasEntre(hoje, p.validade) : null
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(indice, 12) * 0.03, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-surface shadow-xs transition-[border-color,box-shadow] duration-150 hover:shadow-card',
        vencido ? 'border-danger/35 hover:border-danger/55' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-start gap-3.5 p-5 pb-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            !p.ativo
              ? 'bg-surface-2 text-muted'
              : vencido
                ? 'bg-danger-soft text-danger'
                : ehPesos
                  ? 'bg-brand-soft text-brand-ink'
                  : 'bg-info-soft text-info',
          )}
        >
          <IconePadrao tipo={p.tipo} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">{TIPOS_PADRAO[p.tipo]}</p>
          <h3 className="mt-0.5 leading-tight">
            {/* O botão cobre o cartão inteiro (clique em qualquer lugar edita); o menu fica por cima */}
            <button
              type="button"
              onClick={aoEditar}
              className={cn(
                'tnum max-w-full cursor-pointer truncate text-left text-xl font-semibold tracking-[-0.02em] focus-visible:outline-none',
                'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-brand',
                p.ativo ? 'text-ink' : 'text-ink-2',
              )}
            >
              {p.identificacao}
            </button>
          </h3>
          {p.descricao && <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{p.descricao}</p>}
        </div>
        <div className="relative z-10 -mt-1 -mr-2">
          <Menu
            gatilho={(abrir) => (
              <Button variante="ghost" tamanho="icon-sm" onClick={abrir} aria-label={`Ações de ${p.identificacao}`}>
                <Ellipsis className="h-4 w-4" />
              </Button>
            )}
            itens={itensMenu}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-5">
        {p.ativo ? <ValidadePadraoBadge validade={p.validade} diasAviso={diasAviso} /> : <Badge tom="neutral">Desativado</Badge>}
        {ehPesos && p.classe && (
          <Badge tom="neutral" ponto={false}>
            Classe {p.classe}
          </Badge>
        )}
        {ehPesos && p.uso === 'NOMINAL' && (
          <Badge tom="neutral" ponto={false}>
            Só nominal
          </Badge>
        )}
        {p.ativo && !p.certificadoArquivo && (
          <span title="Anexe o PDF do certificado do padrão: ele vai junto no e-mail dos certificados emitidos">
            <Badge tom="warning" ponto={false}>
              <FileWarning className="h-3 w-3" />
              Sem o arquivo do certificado
            </Badge>
          </span>
        )}
      </div>

      <div className="flex-1 px-5 pt-3.5 pb-4">
        {ehPesos ? (
          p.pesos.length ? (
            <>
              <p className="tnum line-clamp-2 text-[13px] text-ink-2" title={resumoPesos(p.pesos)}>
                {resumoPesos(p.pesos)}
              </p>
              <p className="tnum mt-1 text-xs text-muted">
                Total: <b className="font-medium text-ink-2">{massaLegivel(totalPesos(p.pesos))}</b> em {p.pesos.length}{' '}
                {p.pesos.length === 1 ? 'peça' : 'peças'}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-muted">Nenhuma peça cadastrada.</p>
          )
        ) : (
          <>
            {(p.fabricante || p.modelo) && (
              <p className="text-[13px] text-ink-2">{[p.fabricante, p.modelo].filter(Boolean).join(' ')}</p>
            )}
            <p className="mt-0.5 text-xs text-muted">
              {p.incertezaTexto ? `Incerteza: ${p.incertezaTexto}` : 'Incerteza não informada'}
            </p>
          </>
        )}
      </div>

      <div className="space-y-1.5 border-t border-line px-5 py-3.5 text-xs text-muted">
        <p className="flex min-w-0 items-center gap-2">
          <FileBadge2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {p.certificado ? (
              <>
                Certificado <span className="tnum font-medium text-ink-2">{p.certificado}</span>
              </>
            ) : (
              <span className="text-warning">Sem nº do certificado</span>
            )}
            {p.laboratorio && ` · ${p.laboratorio}`}
            {p.acreditacao && ` (${p.acreditacao})`}
          </span>
          {p.certificadoArquivo && (
            // Por cima do botão que cobre o cartão (abrir o arquivo não abre a edição)
            <a
              href={api.urlArquivo(p.certificadoArquivo.sha256)}
              target="_blank"
              rel="noopener"
              className="relative z-10 ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-brand-ink transition-colors hover:bg-brand-soft"
              title={`Abrir ${p.certificadoArquivo.nome}`}
            >
              <Paperclip className="h-3 w-3" />
              Arquivo
            </a>
          )}
        </p>
        <p className="flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {p.validade ? (
            <span className={cn(vencido && 'font-medium text-danger')}>
              {vencido ? 'Venceu em ' : 'Próxima calibração em '}
              <span className="tnum">{formatarDataBr(p.validade)}</span>
              {dias !== null && dias >= 0 && dias <= 90 && (
                <span className="text-muted"> ({dias === 0 ? 'hoje' : `${dias} dias`})</span>
              )}
            </span>
          ) : (
            <span className="text-warning">Sem data da próxima calibração</span>
          )}
        </p>
      </div>
    </motion.article>
  )
}

function EsqueletoCartoes() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-busy="true">
      <span className="sr-only">Carregando padrões…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="h-11 w-11 animate-pulse rounded-xl bg-surface-3" />
            <div className="flex-1 space-y-2">
              <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-surface-2" />
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-surface-3" />
              <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-surface-2" />
            </div>
          </div>
          <div className="mt-4 h-6 w-24 animate-pulse rounded-full bg-surface-2" />
          <div className="mt-5 space-y-2 border-t border-line pt-4">
            <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-surface-2" />
            <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

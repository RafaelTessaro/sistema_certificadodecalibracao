import { Building2, CornerDownLeft, FileBadge2, FilePlus2, KeyRound, LogOut, Scale, Search, UserPlus, Weight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import { formatarDataBr, STATUS_CALIBRACAO } from '#shared/dominio.ts'
import type { BalancaResumo, CalibracaoResumo, ClienteResumo } from '#shared/tipos.ts'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { normalizar } from '../../lib/format'
import { useSessao } from '../../store/sessao'
import { abrirMinhaSenha } from '../sessao/minhaSenha'
import { Avatar } from '../ui/Misc'
import { paginasDoNivel } from './nav'

export const usePaleta = create<{ aberta: boolean; abrir: () => void; fechar: () => void }>((set) => ({
  aberta: false,
  abrir: () => set({ aberta: true }),
  fechar: () => set({ aberta: false }),
}))

interface Resultado {
  id: string
  grupo: string
  titulo: string
  detalhe?: string
  icone: ReactNode
  /** Palavras extras que também encontram o resultado (ações). */
  chaves?: string
  ir: () => void
}

/** Busca global (Ctrl/⌘ + K): páginas, ações, clientes, balanças e certificados. */
export function CommandPalette() {
  const { aberta, abrir, fechar } = usePaleta()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (usePaleta.getState().aberta) fechar()
        else abrir()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abrir, fechar])

  return createPortal(<AnimatePresence>{aberta && <Paleta fechar={fechar} />}</AnimatePresence>, document.body)
}

interface Encontrados {
  clientes: ClienteResumo[]
  balancas: BalancaResumo[]
  calibracoes: CalibracaoResumo[]
}

/** Busca no servidor (com uma pequena espera enquanto a pessoa digita). */
function useBuscaGlobal(q: string): Encontrados {
  const [encontrados, setEncontrados] = useState<Encontrados>({ clientes: [], balancas: [], calibracoes: [] })
  useEffect(() => {
    const termo = q.trim()
    if (termo.length < 2) {
      setEncontrados({ clientes: [], balancas: [], calibracoes: [] })
      return
    }
    let ativo = true
    const t = setTimeout(() => {
      Promise.all([
        api.clientes({ busca: termo }).then((r) => r.clientes.slice(0, 6)),
        api.balancas({ busca: termo }).then((r) => r.balancas.slice(0, 6)),
        api.calibracoes({ busca: termo, limite: 8 }).then((r) => r.itens),
      ])
        .then(([clientes, balancas, calibracoes]) => {
          if (ativo) setEncontrados({ clientes, balancas, calibracoes })
        })
        .catch(() => {
          /* sem conexão: a busca só não mostra resultados */
        })
    }, 180)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [q])
  return encontrados
}

function Paleta({ fechar }: { fechar: () => void }) {
  const [q, setQ] = useState('')
  const [ativo, setAtivo] = useState(0)
  const navegar = useNavigate()
  const lista = useRef<HTMLDivElement>(null)
  const nivel = useSessao((s) => s.usuario?.nivel)
  const sair = useSessao((s) => s.sair)
  const { clientes, balancas, calibracoes } = useBuscaGlobal(q)

  const resultados = useMemo<Resultado[]>(() => {
    const termo = normalizar(q)
    const ir = (to: string) => () => {
      fechar()
      navegar(to)
    }
    const casa = (s: string) => !termo || normalizar(s).includes(termo)
    const out: Resultado[] = []

    const acoes: Resultado[] = [
      {
        id: 'a-cal',
        grupo: 'Ações rápidas',
        titulo: 'Nova calibração',
        detalhe: 'Registrar os ensaios e emitir o certificado',
        chaves: 'certificado calibrar emitir',
        icone: <FilePlus2 className="h-4 w-4" />,
        ir: ir('/calibracoes/nova'),
      },
      {
        id: 'a-cl',
        grupo: 'Ações rápidas',
        titulo: 'Novo cliente',
        chaves: 'cadastrar empresa cnpj cpf',
        icone: <UserPlus className="h-4 w-4" />,
        ir: ir('/clientes?novo=1'),
      },
      {
        id: 'a-bal',
        grupo: 'Ações rápidas',
        titulo: 'Nova balança',
        chaves: 'cadastrar instrumento equipamento',
        icone: <Scale className="h-4 w-4" />,
        ir: ir('/balancas?nova=1'),
      },
      {
        id: 'a-pad',
        grupo: 'Ações rápidas',
        titulo: 'Novo padrão',
        chaves: 'peso pesos padrao jogo termo higrometro',
        icone: <Weight className="h-4 w-4" />,
        ir: ir('/padroes?novo=1'),
      },
    ]
    out.push(...acoes.filter((a) => casa(`${a.titulo} ${a.chaves ?? ''}`)))
    out.push(
      ...paginasDoNivel(nivel)
        .filter((p) => casa(`${p.label} ${p.descricao}`))
        .map((p) => ({
          id: `p-${p.to}`,
          grupo: 'Páginas',
          titulo: p.label,
          detalhe: p.descricao,
          icone: <p.icone className="h-4 w-4" />,
          ir: ir(p.to),
        })),
    )
    // Trocar a senha e sair: só ao buscar (ex.: "senha", "sair")
    const conta: Resultado[] = [
      {
        id: 'a-senha',
        grupo: 'Sua conta',
        titulo: 'Trocar minha senha',
        chaves: 'senha usuario conta alterar mudar',
        icone: <KeyRound className="h-4 w-4" />,
        ir: () => {
          fechar()
          abrirMinhaSenha()
        },
      },
      {
        id: 'a-sair',
        grupo: 'Sua conta',
        titulo: 'Sair',
        detalhe: 'Encerrar a sessão neste computador',
        chaves: 'sair logout desconectar encerrar sessao trocar usuario',
        icone: <LogOut className="h-4 w-4" />,
        ir: () => {
          fechar()
          void sair()
        },
      },
    ]
    if (termo) out.push(...conta.filter((a) => casa(`${a.titulo} ${a.chaves ?? ''}`)))
    out.push(
      ...calibracoes.map((k) => ({
        id: `k-${k.id}`,
        grupo: 'Certificados',
        titulo: k.numero ? `Certificado ${k.numero}` : `Calibração em andamento — ${k.clienteNome}`,
        detalhe: [
          k.clienteNome,
          k.balancaDescricao,
          STATUS_CALIBRACAO[k.status].label,
          formatarDataBr(k.dataEmissao || k.dataCalibracao),
        ]
          .filter(Boolean)
          .join(' • '),
        icone: <FileBadge2 className="h-4 w-4" />,
        ir: ir(k.status === 'RASCUNHO' || k.status === 'REVISAO' ? `/calibracoes/${k.id}/editar` : `/calibracoes/${k.id}`),
      })),
    )
    out.push(
      ...clientes.map((c) => ({
        id: `c-${c.id}`,
        grupo: 'Clientes',
        titulo: c.nome,
        detalhe: [c.documento, c.cidade, c.telefone].filter(Boolean).join(' • '),
        icone: c.tipo === 'PJ' ? <Building2 className="h-4 w-4" /> : <Avatar nome={c.nome} className="h-6 w-6 rounded-md text-[10px]" />,
        ir: ir(`/clientes/${c.id}`),
      })),
    )
    out.push(
      ...balancas.map((b) => ({
        id: `b-${b.id}`,
        grupo: 'Balanças',
        titulo: [b.fabricante, b.modelo].filter(Boolean).join(' ') || 'Balança',
        detalhe: [b.numeroSerie && `Série ${b.numeroSerie}`, b.identificacao, b.clienteNome].filter(Boolean).join(' • '),
        icone: <Scale className="h-4 w-4" />,
        ir: ir(`/balancas/${b.id}`),
      })),
    )
    return out
  }, [q, clientes, balancas, calibracoes, navegar, fechar, nivel, sair])

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-idx="${ativo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [ativo])

  let ultimoGrupo = ''

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[12vh]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[rgb(10_12_14/0.4)] backdrop-blur-[3px]"
        onClick={fechar}
      />
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 460, damping: 36 }}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-float"
        role="dialog"
        aria-label="Busca global"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-[18px] w-[18px] text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setAtivo(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setAtivo((a) => Math.min(a + 1, resultados.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setAtivo((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                resultados[ativo]?.ir()
              } else if (e.key === 'Escape') {
                fechar()
              }
            }}
            placeholder="Buscar clientes, balanças, nº de série, certificados, OS…"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
          />
          <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <div ref={lista} className="scroll-fino max-h-[52vh] overflow-y-auto p-2">
          {resultados.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted">Nenhum resultado para “{q}”.</p>}
          {resultados.map((r, i) => {
            const cabecalho = r.grupo !== ultimoGrupo
            ultimoGrupo = r.grupo
            return (
              <div key={r.id}>
                {cabecalho && (
                  <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{r.grupo}</p>
                )}
                <button
                  type="button"
                  data-idx={i}
                  onMouseMove={() => setAtivo(i)}
                  onClick={r.ir}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    i === ativo ? 'bg-surface-2' : '',
                  )}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-2">
                    {r.icone}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.titulo}</span>
                    {r.detalhe && <span className="block truncate text-xs text-muted">{r.detalhe}</span>}
                  </span>
                  {i === ativo && <CornerDownLeft className="h-3.5 w-3.5 text-muted" />}
                </button>
              </div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}

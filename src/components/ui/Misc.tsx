import { Search, X } from 'lucide-react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useId, useRef, useState, type KeyboardEvent as TeclaReact, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { iniciais } from '../../lib/format'
import { proximoIndice, rolagemMoveAncora } from './menuTeclado'

export function PageHeader({
  titulo,
  descricao,
  acoes,
  voltar,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  acoes?: ReactNode
  voltar?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {voltar}
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] text-ink">{titulo}</h1>
        {descricao && <p className="mt-1 text-[14px] text-muted">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

export function EmptyState({
  icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone: ReactNode
  titulo: string
  descricao?: string
  acao?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      // O brilho atrás do ícone fica dentro do bloco (não vaza sobre a barra de filtros acima)
      className={cn(
        'relative isolate flex flex-col items-center justify-center overflow-hidden px-6 py-14 text-center',
        className,
      )}
    >
      <div className="relative mb-4">
        <div className="absolute inset-1 -z-10 rounded-2xl bg-brand-soft blur-lg" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-brand shadow-xs">
          {icone}
        </div>
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{titulo}</h3>
      {descricao && <p className="mt-1 max-w-sm text-sm text-muted">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </motion.div>
  )
}

/**
 * Controle segmentado com indicador animado (usado em filtros e abas). Tamanhos: `md` (40 px, filtros e abas),
 * `sm` (36 px, compacto) e `campo` (texto do `sm` na altura de um campo, 40 px: para ficar ao lado de campos).
 *
 * É uma parada só do Tab, na opção escolhida (tabindex itinerante); as setas ← e → (e Home/End) trocam a
 * opção, como num grupo de abas. Assim, num formulário, o Tab vai de um campo para o seguinte em vez de
 * passar por cada opção.
 */
export function Segmented<T extends string>({
  opcoes,
  valor,
  aoMudar,
  className,
  tamanho = 'md',
}: {
  opcoes: Array<{ valor: T; label: ReactNode; contagem?: number }>
  valor: T
  aoMudar: (v: T) => void
  className?: string
  tamanho?: 'sm' | 'md' | 'campo'
}) {
  const grupo = useId()
  const botoes = useRef<Array<HTMLButtonElement | null>>([])
  const escolhida = opcoes.findIndex((o) => o.valor === valor)
  // Sem nenhuma escolhida (valor fora da lista), a parada do Tab fica na primeira
  const parada = escolhida >= 0 ? escolhida : 0
  const mover = (e: TeclaReact<HTMLButtonElement>, i: number) => {
    const n = opcoes.length
    const destino =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1
    if (destino < 0 || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    botoes.current[destino]?.focus()
    if (destino !== escolhida) aoMudar(opcoes[destino].valor)
  }
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'scroll-fino inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-surface-3/70 p-1',
        className,
      )}
    >
      {opcoes.map((o, i) => {
        const ativo = o.valor === valor
        return (
          <button
            type="button"
            key={o.valor}
            ref={(el) => {
              botoes.current[i] = el
            }}
            role="tab"
            aria-selected={ativo}
            tabIndex={i === parada ? 0 : -1}
            onKeyDown={(e) => mover(e, i)}
            onClick={() => aoMudar(o.valor)}
            className={cn(
              'relative flex cursor-pointer items-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors duration-150',
              tamanho === 'sm' ? 'h-7 px-2.5 text-xs' : tamanho === 'campo' ? 'h-8 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              ativo ? 'text-ink' : 'text-muted hover:text-ink-2',
            )}
          >
            {ativo && (
              <motion.span
                layoutId={`seg-${grupo}`}
                className="absolute inset-0 rounded-lg bg-surface shadow-xs ring-1 ring-line"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
            {o.contagem !== undefined && (
              <span
                className={cn(
                  'tnum relative rounded-md px-1.5 text-[11px] leading-5',
                  ativo ? 'bg-brand-soft text-brand-ink' : 'bg-surface-3 text-muted',
                )}
              >
                {o.contagem}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Busca das listas. O "x" de limpar fica fora do Tab (o Tab segue para o próximo controle); Esc também limpa. */
export function SearchInput({
  valor,
  aoMudar,
  placeholder = 'Buscar…',
  className,
}: {
  valor: string
  aoMudar: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onKeyDown={(e) => {
          // Esc com texto limpa a busca (sem texto, o Esc segue para quem estiver em volta)
          if (e.key === 'Escape' && valor) {
            e.preventDefault()
            e.stopPropagation()
            aoMudar('')
          }
        }}
        placeholder={placeholder}
        className="min-h-10 max-h-10 w-full rounded-xl border border-line-strong/80 bg-surface pr-9 pl-9 text-sm text-ink shadow-xs transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-[var(--ring)] focus:outline-none"
      />
      <AnimatePresence>
        {valor && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            tabIndex={-1}
            // Não tira o foco da busca
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => aoMudar('')}
            aria-label="Limpar busca"
            title="Limpar busca (Esc)"
            className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

const coresAvatar = [
  'bg-[#e7f6ee] text-[#077a3c] dark:bg-[#14b05c26] dark:text-[#4fd18a]',
  'bg-[#e9f1fc] text-[#2468c8] dark:bg-[#6aa5f024] dark:text-[#8dbaf3]',
  'bg-[#fdf0e7] text-[#b5521c] dark:bg-[#eb683424] dark:text-[#f29a72]',
  'bg-[#f3eefc] text-[#5b45b5] dark:bg-[#9085e924] dark:text-[#aea6f0]',
  'bg-[#fcecf2] text-[#b8336a] dark:bg-[#e87ba424] dark:text-[#ef9fbe]',
]

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  const idx = [...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % coresAvatar.length
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold',
        coresAvatar[idx],
        className,
      )}
    >
      {iniciais(nome)}
    </div>
  )
}

/** Número que "conta" suavemente até o valor ao mudar. */
export function AnimatedNumber({ valor, formatar }: { valor: number; formatar: (v: number) => string }) {
  const mv = useMotionValue(valor)
  const texto = useTransform(mv, (v) => formatar(v))
  const primeiro = useRef(true)
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false
      mv.set(0)
    }
    const ctrl = animate(mv, valor, { duration: 0.7, ease: [0.22, 1, 0.36, 1] })
    return () => ctrl.stop()
  }, [valor, mv])
  return <motion.span>{texto}</motion.span>
}

/** Item do menu suspenso. */
export interface ItemMenu {
  label: string
  icone?: ReactNode
  aoClicar: () => void
  perigo?: boolean
  /** Ação proibida: aparece desabilitada, com o motivo logo abaixo do nome (e ao passar o mouse). */
  motivo?: string
}

/** O que o gatilho do menu recebe: espalhe no botão (`<Button {...props}>`), para o clique, o teclado e o ARIA. */
export interface PropsGatilhoMenu {
  id: string
  onClick: () => void
  onKeyDown: (e: TeclaReact<HTMLElement>) => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls'?: string
}

/**
 * Menu suspenso (renderizado em portal para não ser cortado por tabelas com rolagem). Pelo teclado (WAI-ARIA, menu
 * button): Enter, Espaço ou ↓ no gatilho abrem com o foco no 1º item (↑, no último); ↑ ↓ Home End andam entre os
 * itens, pulando os desabilitados; Esc fecha e devolve o foco ao gatilho; Tab fecha e segue a partir do gatilho.
 */
export function Menu({
  gatilho,
  itens,
  alinhar = 'right',
  classePainel,
}: {
  gatilho: (props: PropsGatilhoMenu, aberto: boolean) => ReactNode
  itens: Array<ItemMenu | 'sep'>
  alinhar?: 'left' | 'right'
  /** Classes a mais do painel (ex.: a largura). */
  classePainel?: string
}) {
  const [pos, setPos] = useState<{
    top: number
    left?: number
    right?: number
    paraCima: boolean
    /** Altura máxima (rola por dentro numa tela baixa). */
    maxAltura: number
  } | null>(null)
  const ancora = useRef<HTMLDivElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  /** O item que recebe o foco ao abrir: o primeiro (clique, Enter, ↓) ou o último (↑). */
  const focoAoAbrir = useRef<'primeiro' | 'ultimo'>('primeiro')
  const abertoEm = useRef(0)
  const idGatilho = useId()
  const idPainel = useId()
  const aberto = pos !== null

  const botoes = () => [...(painel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
  const focarItem = (qual: 'primeiro' | 'ultimo') => {
    const lista = botoes()
    const habilitados = lista.filter((b) => !b.disabled)
    const alvo = qual === 'ultimo' ? habilitados.at(-1) : habilitados[0]
    ;(alvo ?? painel.current)?.focus({ preventScroll: true })
  }
  const fechar = (devolverFoco: boolean) => {
    setPos(null)
    if (devolverFoco) document.getElementById(idGatilho)?.focus({ preventScroll: true })
  }
  const abrir = (foco: 'primeiro' | 'ultimo') => {
    if (aberto) return focarItem(foco)
    const r = ancora.current?.getBoundingClientRect()
    if (!r) return
    focoAoAbrir.current = foco
    abertoEm.current = Date.now()
    // Cada item tem ~38 px (com o motivo, ~54) e cada separador ~9 px, mais o respiro do painel
    const altura = itens.reduce((s, it) => s + (it === 'sep' ? 9 : it.motivo ? 54 : 38), 10)
    const abaixo = window.innerHeight - r.bottom - 12
    const acima = r.top - 12
    const paraCima = altura > abaixo && acima > abaixo
    setPos({
      top: paraCima ? r.top - 6 : r.bottom + 6,
      paraCima,
      maxAltura: Math.max(120, (paraCima ? acima : abaixo) - 6),
      ...(alinhar === 'right' ? { right: window.innerWidth - r.right } : { left: r.left }),
    })
  }

  // Aberto: o foco vai para o item (sem rolar a página, que fecharia o menu)
  useEffect(() => {
    if (aberto) focarItem(focoAoAbrir.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const dentro = (alvo: EventTarget | null) =>
      alvo instanceof Node && (!!ancora.current?.contains(alvo) || !!painel.current?.contains(alvo))
    const fora = (e: MouseEvent) => !dentro(e.target) && setPos(null)
    // O foco saiu do menu e do gatilho (outra janela, um atalho): fecha
    const focoFora = (e: FocusEvent) => !dentro(e.target) && setPos(null)
    const redimensionou = () => setPos(null)
    // O painel fica fixo na tela: fecha quando o gatilho se move (rolou a página ou um elemento que o contém). A
    // rolagem logo depois de abrir (o foco no item, num navegador sem preventScroll) não conta
    const rolou = (e: Event) => {
      if (Date.now() - abertoEm.current > 150 && rolagemMoveAncora(e.target, ancora.current)) setPos(null)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPos(null)
      if (dentro(document.activeElement) || document.activeElement === document.body)
        document.getElementById(idGatilho)?.focus({ preventScroll: true })
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('focusin', focoFora)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', redimensionou)
    document.addEventListener('scroll', rolou, true)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('focusin', focoFora)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', redimensionou)
      document.removeEventListener('scroll', rolou, true)
    }
  }, [aberto, idGatilho])

  const teclaNoPainel = (e: TeclaReact<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      return fechar(true)
    }
    // Tab: o foco volta ao gatilho e o navegador segue dali (sem preventDefault), na ordem da página
    if (e.key === 'Tab') return fechar(true)
    const lista = botoes()
    const i = proximoIndice(
      lista.indexOf(document.activeElement as HTMLButtonElement),
      e.key,
      lista.map((b) => b.disabled),
    )
    if (i === null) return
    e.preventDefault()
    if (i >= 0) lista[i].focus({ preventScroll: true })
  }

  const propsGatilho: PropsGatilhoMenu = {
    id: idGatilho,
    onClick: () => (aberto ? fechar(false) : abrir('primeiro')),
    // ↓ e ↑ abrem (e não rolam a página, o que fecharia o menu)
    onKeyDown: (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      abrir(e.key === 'ArrowUp' ? 'ultimo' : 'primeiro')
    },
    'aria-haspopup': 'menu',
    'aria-expanded': aberto,
    ...(aberto ? { 'aria-controls': idPainel } : {}),
  }

  return (
    <div ref={ancora} className="relative inline-flex">
      {gatilho(propsGatilho, aberto)}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {pos && (
              <motion.div
                ref={painel}
                id={idPainel}
                role="menu"
                aria-orientation="vertical"
                aria-labelledby={idGatilho}
                tabIndex={-1}
                onKeyDown={teclaNoPainel}
                initial={{ opacity: 0, y: pos.paraCima ? 4 : -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
                transition={{ duration: 0.14 }}
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  right: pos.right,
                  maxHeight: pos.maxAltura,
                  translate: pos.paraCima ? '0 -100%' : undefined,
                }}
                className={cn(
                  'z-[70] min-w-[190px] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1 shadow-float outline-none',
                  pos.paraCima ? 'origin-bottom' : 'origin-top',
                  classePainel,
                )}
              >
                {itens.map((it, i) =>
                  it === 'sep' ? (
                    <div key={i} role="separator" className="my-1 h-px bg-line" />
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      key={it.label}
                      disabled={!!it.motivo}
                      title={it.motivo}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (it.motivo) return
                        // O foco volta ao gatilho antes da ação (uma janela que ela abra o devolve a ele ao fechar)
                        fechar(true)
                        it.aoClicar()
                      }}
                      className={cn(
                        'flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors outline-none',
                        it.motivo ? 'items-start' : 'items-center',
                        it.motivo
                          ? 'cursor-not-allowed text-muted'
                          : it.perigo
                            ? 'cursor-pointer text-danger hover:bg-danger-soft focus-visible:bg-danger-soft'
                            : 'cursor-pointer text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink',
                      )}
                    >
                      {it.motivo ? (
                        <>
                          <span className="mt-px flex shrink-0 opacity-60">{it.icone}</span>
                          <span className="min-w-0">
                            <span className="block">{it.label}</span>
                            <span className="mt-0.5 block text-[11.5px] leading-snug font-normal">{it.motivo}</span>
                          </span>
                        </>
                      ) : (
                        <>
                          {it.icone}
                          {it.label}
                        </>
                      )}
                    </button>
                  ),
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}

/** Cartão de indicador (KPI). */
export function StatCard({
  rotulo,
  valor,
  formatar,
  icone,
  detalhe,
  destaque,
  delay = 0,
}: {
  rotulo: string
  valor: number
  formatar: (v: number) => string
  icone: ReactNode
  detalhe?: ReactNode
  destaque?: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative overflow-hidden rounded-2xl border p-5 shadow-xs',
        destaque ? 'border-transparent bg-brand text-on-brand' : 'border-line bg-surface',
      )}
    >
      {destaque && <div className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />}
      <div className="relative flex items-center justify-between">
        <p className={cn('text-[13px] font-medium', destaque ? 'text-on-brand/85' : 'text-muted')}>{rotulo}</p>
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg',
            destaque ? 'bg-on-brand/15 text-on-brand' : 'bg-surface-2 text-ink-2',
          )}
        >
          {icone}
        </div>
      </div>
      <p
        className={cn(
          'relative mt-3 text-[26px] leading-none font-semibold tracking-[-0.025em]',
          destaque ? 'text-on-brand' : 'text-ink',
        )}
      >
        <AnimatedNumber valor={valor} formatar={formatar} />
      </p>
      {detalhe && (
        <div className={cn('relative mt-2 text-[12.5px]', destaque ? 'text-on-brand/80' : 'text-muted')}>{detalhe}</div>
      )}
    </motion.div>
  )
}

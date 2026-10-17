import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

/** Janelas abertas, da mais antiga para a mais recente: Esc fecha só a do topo, e o Tab fica nela. */
const pilha: symbol[] = []

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex], [contenteditable="true"]'

/** Controles que o Tab alcança dentro de `raiz`, na ordem da página. */
function focaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest('[inert]') &&
      (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0),
  )
}

/**
 * Esc, rolagem e foco de uma janela (role=dialog, aria-modal). Ao abrir, o foco vai para o campo marcado
 * com autoFocus ou, sem ele, para o primeiro controle do conteúdo (`[data-janela-conteudo]`); o Tab e o
 * Shift+Tab dão a volta dentro da janela, em vez de seguir para a tela escondida atrás do véu; ao fechar, o
 * foco volta para o botão que abriu.
 */
function useJanela(aberto: boolean, fechar: () => void, caixa: RefObject<HTMLElement | null>) {
  const fecharRef = useRef(fechar)
  useEffect(() => {
    fecharRef.current = fechar
  })
  // Quem tinha o foco antes de abrir: lido na renderização em que a janela abre, porque o autoFocus do
  // conteúdo já tira o foco de lá antes dos efeitos rodarem
  const quemAbriu = useMemo(() => (aberto && typeof document !== 'undefined' ? document.activeElement : null), [aberto])
  const montada = useRef(false)
  useEffect(() => {
    if (!aberto) return
    montada.current = true
    const id = Symbol('janela')
    pilha.push(id)
    document.body.style.overflow = 'hidden'
    const janela = caixa.current
    if (janela && !janela.contains(document.activeElement)) {
      const conteudo = janela.querySelector<HTMLElement>('[data-janela-conteudo]')
      const primeiro = (conteudo && focaveis(conteudo)[0]) ?? focaveis(janela).find((el) => !el.dataset.janelaFechar)
      ;(primeiro ?? janela).focus({ preventScroll: true })
    }
    const onKey = (e: KeyboardEvent) => {
      if (pilha[pilha.length - 1] !== id) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        fecharRef.current()
        return
      }
      const caixaAtual = caixa.current
      // Outra janela por cima, que não usa a pilha (a de sessão encerrada deixa tudo inerte): não mexe
      if (e.key !== 'Tab' || e.defaultPrevented || !caixaAtual || caixaAtual.closest('[inert]')) return
      const ativo = document.activeElement
      const dentro = !!ativo && caixaAtual.contains(ativo)
      // Foco num menu aberto em portal (fora da janela, mas por cima dela): segue o normal
      if (!dentro && ativo && ativo !== document.body && !document.getElementById('root')?.contains(ativo)) {
        if (!ativo.closest('[role="dialog"]')) return
      }
      const lista = focaveis(caixaAtual)
      if (!lista.length) {
        e.preventDefault()
        caixaAtual.focus({ preventScroll: true })
        return
      }
      const primeiro = lista[0]
      const ultimo = lista[lista.length - 1]
      // Na ponta (ou num controle fora do Tab, como o olho da senha clicado, depois do último), dá a volta
      const naPonta =
        !dentro ||
        ativo === caixaAtual ||
        (e.shiftKey
          ? !(primeiro.compareDocumentPosition(ativo) & Node.DOCUMENT_POSITION_FOLLOWING)
          : !(ultimo.compareDocumentPosition(ativo) & Node.DOCUMENT_POSITION_PRECEDING))
      if (naPonta) {
        e.preventDefault()
        ;(e.shiftKey ? ultimo : primeiro).focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      montada.current = false
      pilha.splice(pilha.indexOf(id), 1)
      if (!pilha.length) document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
      // Volta para quem abriu, se o foco ficou na janela que fecha (ou se perdeu) e ele ainda está na tela.
      // Depois de um instante: no modo de desenvolvimento o React desmonta e monta de novo na hora (e aí a
      // janela continua aberta, com o foco onde estava)
      const volta = quemAbriu
      setTimeout(() => {
        if (montada.current) return
        const ativo = document.activeElement
        const perdido = !ativo || ativo === document.body || !!janela?.contains(ativo)
        if (perdido && volta instanceof HTMLElement && volta.isConnected && volta !== document.body)
          volta.focus({ preventScroll: true })
      }, 0)
    }
  }, [aberto, caixa, quemAbriu])
}

const overlay = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
}

export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = 'max-w-lg',
  icone,
}: {
  aberto: boolean
  aoFechar: () => void
  titulo?: ReactNode
  descricao?: ReactNode
  children?: ReactNode
  rodape?: ReactNode
  largura?: string
  icone?: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  useJanela(aberto, aoFechar, caixa)
  return createPortal(
    <AnimatePresence>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div {...overlay} className="absolute inset-0 bg-[rgb(10_12_14/0.42)] backdrop-blur-[3px]" onClick={aoFechar} />
          <motion.div
            ref={caixa}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-float outline-none sm:rounded-3xl',
              largura,
            )}
          >
            {(titulo || descricao) && (
              <div className="flex items-start gap-3 px-6 pt-6 pb-2">
                {icone && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                    {icone}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {titulo && <h2 className="text-lg font-semibold tracking-[-0.015em] text-ink">{titulo}</h2>}
                  {descricao && <p className="mt-1 text-sm text-muted">{descricao}</p>}
                </div>
                <button
                  type="button"
                  onClick={aoFechar}
                  aria-label="Fechar"
                  data-janela-fechar="1"
                  className="-mt-1 -mr-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
            )}
            {children ? (
              <div data-janela-conteudo className="scroll-fino min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {children}
              </div>
            ) : (
              <div className="h-4" />
            )}
            {rodape && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-4">
                {rodape}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function Drawer({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  lado = 'right',
  largura = 'w-[420px]',
}: {
  aberto: boolean
  aoFechar: () => void
  titulo?: ReactNode
  descricao?: ReactNode
  children?: ReactNode
  lado?: 'left' | 'right'
  largura?: string
}) {
  const caixa = useRef<HTMLElement>(null)
  useJanela(aberto, aoFechar, caixa)
  const x = lado === 'right' ? '100%' : '-100%'
  return createPortal(
    <AnimatePresence>
      {aberto && (
        <div className="fixed inset-0 z-50">
          <motion.div {...overlay} className="absolute inset-0 bg-[rgb(10_12_14/0.36)] backdrop-blur-[2px]" onClick={aoFechar} />
          <motion.aside
            ref={caixa}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ x }}
            animate={{ x: 0 }}
            exit={{ x }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className={cn(
              'absolute top-0 bottom-0 flex max-w-[92vw] flex-col border-line bg-surface shadow-float outline-none',
              lado === 'right' ? 'right-0 border-l' : 'left-0 border-r',
              largura,
            )}
          >
            {titulo && (
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-ink">{titulo}</h2>
                  {descricao && <p className="mt-0.5 text-[13px] text-muted">{descricao}</p>}
                </div>
                <button
                  type="button"
                  onClick={aoFechar}
                  aria-label="Fechar"
                  data-janela-fechar="1"
                  className="-mr-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div data-janela-conteudo className="scroll-fino min-h-0 flex-1 overflow-y-auto">
              {children}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

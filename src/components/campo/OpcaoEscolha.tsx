// Uma opção de escolha única em cartão (o técnico em "Enviar para o técnico", o registro original na configuração):
// role=radio dentro de um role=radiogroup, com as setas do teclado andando entre as opções.

import { Check } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function GrupoEscolha({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  // As setas levam à opção vizinha e a escolhem (o padrão do radiogroup)
  const mover = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    const opcoes = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([disabled])'))
    const i = opcoes.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const destino = opcoes[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + opcoes.length) % opcoes.length]
    destino.focus()
    destino.click()
  }
  return (
    <div role="radiogroup" aria-label={rotulo} onKeyDown={mover} className={cn('flex flex-col gap-2', className)}>
      {children}
    </div>
  )
}

export function OpcaoEscolha({
  marcada,
  aoEscolher,
  titulo,
  texto,
  icone,
  extra,
  desabilitada,
  parada = marcada,
}: {
  marcada: boolean
  aoEscolher: () => void
  titulo: ReactNode
  texto?: ReactNode
  icone?: ReactNode
  /** À direita (ex.: o botão "Cadastrar celular" do técnico sem celular). */
  extra?: ReactNode
  desabilitada?: boolean
  /** A parada do Tab do grupo: a marcada ou, sem nenhuma marcada, a primeira. */
  parada?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-150',
        marcada ? 'border-brand bg-brand-soft/50 ring-1 ring-brand/25' : 'border-line-strong/80 bg-surface',
        desabilitada ? 'opacity-75' : 'hover:border-line-strong',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={marcada}
        tabIndex={parada ? 0 : -1}
        disabled={desabilitada}
        onClick={aoEscolher}
        className="group flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left focus-visible:outline-none disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            'mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors',
            marcada ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface group-focus-visible:border-brand',
            'group-focus-visible:ring-4 group-focus-visible:ring-[var(--ring)]',
          )}
        >
          {marcada && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
        {icone && <span className="mt-px shrink-0 text-ink-2">{icone}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{titulo}</span>
          {texto && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{texto}</span>}
        </span>
      </button>
      {extra && <span className="shrink-0">{extra}</span>}
    </div>
  )
}

import { ChevronDown, Minus, Plus } from 'lucide-react'
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/cn'

const baseCampo =
  'w-full rounded-xl border border-line-strong/80 bg-surface text-sm text-ink placeholder:text-muted/80 ' +
  'shadow-xs transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-line-strong focus:border-brand focus:ring-4 focus:ring-[var(--ring)] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70'

export function Field({
  label,
  hint,
  erro,
  children,
  className,
  htmlFor,
  extra,
}: {
  label?: ReactNode
  hint?: ReactNode
  erro?: string | null
  children: ReactNode
  className?: string
  htmlFor?: string
  extra?: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {(label || extra) && (
        <div className="flex items-center justify-between gap-2">
          {label && (
            <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
              {label}
            </label>
          )}
          {extra}
        </div>
      )}
      {children}
      {erro ? (
        <p className="text-xs font-medium text-danger">{erro}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icone?: ReactNode }>(function Input(
  { className, icone, ...props },
  ref,
) {
  if (!icone) return <input ref={ref} className={cn(baseCampo, 'h-10 px-3.5', className)} {...props} />
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">{icone}</span>
      <input ref={ref} className={cn(baseCampo, 'h-10 pr-3.5 pl-9', className)} {...props} />
    </div>
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(baseCampo, 'min-h-[84px] resize-y px-3.5 py-2.5', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(baseCampo, 'h-10 cursor-pointer appearance-none pr-9 pl-3.5', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  )
})

/** Número inteiro com botões − / + ; aceita vazio quando `permitirVazio`. */
export function NumberInput({
  valor,
  aoMudar,
  min = 0,
  max,
  permitirVazio,
  id,
  className,
  placeholder,
  ...props
}: {
  valor: number | null
  aoMudar: (v: number | null) => void
  min?: number
  max?: number
  permitirVazio?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'>) {
  const autoId = useId()
  const limitar = (n: number) => Math.max(min, max !== undefined ? Math.min(max, n) : n)
  const passo = (d: number) => aoMudar(limitar((valor ?? 0) + d))
  return (
    <div
      className={cn(
        'flex h-10 items-stretch overflow-hidden rounded-xl border border-line-strong/80 bg-surface shadow-xs transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-4 focus-within:ring-[var(--ring)] hover:border-line-strong',
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Diminuir"
        onClick={() => passo(-1)}
        className="flex w-9 cursor-pointer items-center justify-center text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        id={id ?? autoId}
        type="number"
        inputMode="numeric"
        placeholder={placeholder}
        className="tnum w-full min-w-0 bg-transparent text-center text-sm font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted/80"
        value={valor === null ? '' : valor}
        onChange={(e) => {
          if (e.target.value === '') return aoMudar(permitirVazio ? null : min)
          const n = Math.trunc(Number(e.target.value))
          if (!Number.isNaN(n)) aoMudar(limitar(n))
        }}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Aumentar"
        onClick={() => passo(1)}
        className="flex w-9 cursor-pointer items-center justify-center text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

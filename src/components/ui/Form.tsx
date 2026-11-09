import { ChevronDown, Minus, Plus } from 'lucide-react'
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type MouseEvent,
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

/**
 * Altura do campo de texto (`<input>`): mínima e máxima iguais, nunca `h-*`. Com uma altura fixa maior que a linha,
 * o Chrome troca a linha do texto digitado por "normal", só a altura da fonte arredondada (14 + 3 px na Inter de
 * 14 px), e a caixa interna do campo corta o que passa dela: a perna do "g" encosta no corte e, com o Windows em
 * 125 a 175 %, perde a última linha de pixels ("Açougue" com o g cortado). Com mínimo e máximo a altura é a mesma e o
 * Chrome mantém a linha do campo (20 px), com folga embaixo. Vale para todo `<input>` de texto do sistema.
 */
const ALTURA_CAMPO = 'min-h-10 max-h-10'

/** Rótulo cortado com "…": ao passar o mouse, mostra o texto inteiro (sem cortar, não há dica). */
function dicaSeCortado(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget
  const cortado = el.scrollWidth > el.clientWidth + 1
  if (cortado) el.title = el.textContent?.trim() ?? ''
  else el.removeAttribute('title')
}

/**
 * A marca de campo obrigatório: o "●" da folha de campo, na cor da marca, com o texto para o leitor de tela. `vazada`
 * (○): o que o cadastro não pede para salvar, mas a emissão pede (ex.: o nº do certificado do padrão).
 */
export function MarcaObrigatorio({ vazada, className }: { vazada?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      <span
        aria-hidden
        className={cn('block h-[6px] w-[6px] rounded-full', vazada ? 'border-[1.5px] border-brand' : 'bg-brand')}
      />
      <span className="sr-only">{vazada ? ' (obrigatório para emitir)' : ' (obrigatório)'}</span>
    </span>
  )
}

/**
 * A legenda de uma linha do alto do formulário ou da etapa: "● obrigatório para salvar" (cadastros) ou "● obrigatório
 * para emitir" (etapas da calibração). `vazada`: também a "○ obrigatório para emitir" do cadastro.
 */
export function LegendaObrigatorio({
  para,
  vazada,
  className,
}: {
  para: 'salvar' | 'emitir' | 'começar'
  vazada?: boolean
  className?: string
}) {
  return (
    <p aria-hidden className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted', className)}>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <MarcaObrigatorio /> obrigatório para {para}
      </span>
      {vazada && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <MarcaObrigatorio vazada /> obrigatório para emitir
        </span>
      )}
    </p>
  )
}

/** O texto curto do campo obrigatório para emitir ainda em branco (as etapas da calibração). */
export const TEXTO_PENDENTE = 'Obrigatório para emitir'

/**
 * Campo de formulário: rótulo, controle e dica (ou erro) embaixo.
 *
 * O rótulo ocupa sempre uma linha de altura fixa, tenha ou não `extra` ao lado: em qualquer linha de campos
 * lado a lado (grade ou flex), os controles começam na mesma altura. O rótulo nunca quebra em duas linhas;
 * se não couber, corta com "…" e mostra o texto inteiro ao passar o mouse. Por isso o rótulo deve ser curto
 * (o detalhe vai na dica) e a coluna, larga o bastante para ele.
 *
 * `obrigatorio`: a marca "●" ao lado do rótulo (`vazada`: "○", obrigatório só para emitir); `opcional`: "opcional" ao
 * lado. `pendente`: o campo obrigatório ainda em branco depois de a pessoa passar por ele, com a borda em destaque e o
 * texto curto no lugar da dica (`TEXTO_PENDENTE`, ou o texto dado). `aoSair`: quando o foco sai do campo.
 */
export function Field({
  label,
  hint,
  erro,
  children,
  className,
  htmlFor,
  extra,
  obrigatorio,
  vazada,
  opcional,
  pendente,
  aoSair,
}: {
  label?: ReactNode
  hint?: ReactNode
  erro?: string | null
  children: ReactNode
  className?: string
  htmlFor?: string
  extra?: ReactNode
  obrigatorio?: boolean
  vazada?: boolean
  opcional?: boolean
  pendente?: boolean | string
  aoSair?: () => void
}) {
  return (
    <div
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
      data-pendente={pendente && !erro ? '' : undefined}
      onBlur={aoSair}
    >
      {(label || extra) && (
        <div className="flex h-5 min-w-0 items-center justify-between gap-2">
          {label && (
            <label htmlFor={htmlFor} className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 font-medium text-ink-2">
              <span onMouseEnter={dicaSeCortado} className="min-w-0 truncate">
                {label}
              </span>
              {obrigatorio && <MarcaObrigatorio vazada={vazada} />}
              {opcional && !obrigatorio && <span className="shrink-0 text-xs font-normal text-muted">opcional</span>}
            </label>
          )}
          {extra && <div className="flex shrink-0 items-center">{extra}</div>}
        </div>
      )}
      {children}
      {erro ? (
        <p className="text-xs font-medium text-danger">{erro}</p>
      ) : pendente ? (
        <p className="text-xs font-medium text-warning">{typeof pendente === 'string' ? pendente : TEXTO_PENDENTE}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * Controle sem rótulo numa linha de campos (ex.: o botão ao lado de um campo): reserva a linha do rótulo
 * para ficar na altura dos controles vizinhos. Abaixo de `sm`, onde os campos ficam numa coluna só, o espaço some.
 */
export function SemRotulo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div aria-hidden className="h-5 max-sm:hidden" />
      {children}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icone?: ReactNode }>(function Input(
  { className, icone, ...props },
  ref,
) {
  if (!icone) return <input ref={ref} className={cn(baseCampo, ALTURA_CAMPO, 'px-3.5', className)} {...props} />
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">{icone}</span>
      <input ref={ref} className={cn(baseCampo, ALTURA_CAMPO, 'pr-3.5 pl-9', className)} {...props} />
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

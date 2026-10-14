import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { numero as lerNumero } from '#shared/dominio.ts'
import { cn } from '../../lib/cn'

/** Número para mostrar no campo: vírgula decimal, sem notação científica nem ruído binário. */
export function numeroParaTexto(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return ''
  const s = Number(v.toPrecision(12)).toString()
  if (/e/i.test(s)) return v.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 12 })
  return s.replace('.', ',')
}

/**
 * Navegação de planilha entre os campos de um mesmo grupo (`data-grade="grupo"`, `data-lin`, `data-col`):
 * Enter e ↓ descem; Shift+Enter e ↑ sobem; Tab segue o padrão do navegador.
 */
function moverNaGrade(e: KeyboardEvent<HTMLInputElement>) {
  const el = e.currentTarget
  const grade = el.dataset.grade
  if (!grade) return
  const lin = Number(el.dataset.lin)
  const col = Number(el.dataset.col)
  let passo = 0
  if (e.key === 'Enter' || e.key === 'ArrowDown') passo = e.shiftKey && e.key === 'Enter' ? -1 : 1
  else if (e.key === 'ArrowUp') passo = -1
  if (!passo) return
  e.preventDefault()
  const campos = [...document.querySelectorAll<HTMLInputElement>(`input[data-grade="${CSS.escape(grade)}"]`)].filter(
    (c) => !c.disabled,
  )
  // Mesma coluna, próxima linha; no fim da coluna, vai para o topo da coluna seguinte (como o técnico lê)
  const mesmaColuna = campos
    .filter((c) => Number(c.dataset.col) === col)
    .sort((a, b) => Number(a.dataset.lin) - Number(b.dataset.lin))
  const i = mesmaColuna.findIndex((c) => Number(c.dataset.lin) === lin)
  let alvo = mesmaColuna[i + passo]
  if (!alvo && passo > 0) {
    const proxima = campos
      .filter((c) => Number(c.dataset.col) > col)
      .sort((a, b) => Number(a.dataset.col) - Number(b.dataset.col) || Number(a.dataset.lin) - Number(b.dataset.lin))
    alvo = proxima[0]
  }
  if (alvo) {
    alvo.focus()
    alvo.select()
  }
}

export interface CampoNumeroProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  valor: number | null
  aoMudar: (v: number | null) => void
  /** Unidade mostrada dentro do campo, à direita. */
  unidade?: string
  /** Grupo de navegação de planilha e posição. */
  grade?: { grupo: string; lin: number; col: number }
  /** Destaque de estado (ex.: leitura fora do esperado). */
  tom?: 'normal' | 'atencao' | 'erro' | 'ok'
  compacto?: boolean
}

/**
 * Campo numérico para leituras: aceita vírgula ou ponto, guarda o texto enquanto a pessoa digita
 * (ex.: "10," no meio da digitação) e devolve o número (ou `null` vazio).
 */
export const CampoNumero = forwardRef<HTMLInputElement, CampoNumeroProps>(function CampoNumero(
  { valor, aoMudar, unidade, grade, tom = 'normal', compacto, className, onKeyDown, onBlur, ...props },
  ref,
) {
  const [texto, setTexto] = useState(() => numeroParaTexto(valor))
  const focado = useRef(false)

  // Valor mudou por fora (sugestão, recarga): atualiza o texto se a pessoa não estiver digitando
  useEffect(() => {
    if (focado.current) return
    const atual = lerNumero(texto)
    const igual = (valor === null && texto.trim() === '') || (valor !== null && atual === valor)
    if (!igual) setTexto(numeroParaTexto(valor))
  }, [valor, texto])

  const invalido = texto.trim() !== '' && Number.isNaN(lerNumero(texto))
  return (
    <div className={cn('relative', className)}>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={texto}
        data-grade={grade?.grupo}
        data-lin={grade?.lin}
        data-col={grade?.col}
        onFocus={(e) => {
          focado.current = true
          e.currentTarget.select()
        }}
        onBlur={(e) => {
          focado.current = false
          // Normaliza o que ficou digitado ("10," → "10")
          const n = lerNumero(texto)
          if (texto.trim() !== '' && !Number.isNaN(n)) setTexto(numeroParaTexto(n))
          onBlur?.(e)
        }}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d,.\-\s]/g, '')
          setTexto(t)
          if (t.trim() === '') aoMudar(null)
          else {
            const n = lerNumero(t)
            if (!Number.isNaN(n)) aoMudar(n)
          }
        }}
        onKeyDown={(e) => {
          moverNaGrade(e)
          onKeyDown?.(e)
        }}
        className={cn(
          'tnum w-full rounded-lg border bg-surface text-right text-ink shadow-xs transition-[border-color,box-shadow,background-color] duration-100',
          'placeholder:text-muted/60 focus:ring-4 focus:ring-[var(--ring)] focus:outline-none',
          compacto ? 'h-9 px-2.5 text-[13.5px]' : 'h-10 px-3 text-sm',
          unidade && (compacto ? 'pr-9' : 'pr-10'),
          invalido || tom === 'erro'
            ? 'border-danger/70 bg-danger-soft/40 focus:border-danger'
            : tom === 'atencao'
              ? 'border-warning/60 bg-warning-soft/40 focus:border-warning'
              : tom === 'ok'
                ? 'border-line-strong/80 focus:border-brand'
                : 'border-line-strong/80 hover:border-line-strong focus:border-brand',
        )}
        {...props}
      />
      {unidade && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] font-medium text-muted">
          {unidade}
        </span>
      )}
    </div>
  )
})

// Peças da interface do celular: botões (alvos de 48 a 64 dp), a moldura da tela (com as margens do Android), o
// cabeçalho com "Salvo ✓", cartões, a folha que sobe de baixo, campos de texto, selos e títulos de seção. Tokens do
// sistema (estilo.css); nunca cores soltas.

import { useEffect, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useFecharNoVoltar } from '../app/camadas.ts'
import { useApp } from '../app/loja.ts'
import { IconeVoltar } from './Icones.tsx'

export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

type Variante = 'principal' | 'secundario' | 'perigo' | 'texto' | 'suave'

export function Botao({
  variante = 'secundario',
  grande,
  className,
  children,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; grande?: boolean }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl px-4 font-semibold transition-colors active:scale-[0.99] disabled:opacity-45'
  const tamanho = grande ? 'min-h-[60px] text-[18px]' : 'min-h-[48px] text-[16px]'
  const cores: Record<Variante, string> = {
    principal: 'bg-brand text-on-brand active:bg-brand-hover',
    secundario: 'border-2 border-campo bg-surface text-ink active:bg-surface-2',
    perigo: 'border-2 border-danger bg-surface text-danger active:bg-danger-soft',
    texto: 'text-brand-ink underline-offset-4 active:underline',
    suave: 'bg-surface-3 text-ink active:bg-line-strong',
  }
  return (
    <button type="button" className={cn(base, tamanho, cores[variante], className)} {...resto}>
      {children}
    </button>
  )
}

/** A moldura da tela: fundo, margens do Android (barra de status e de navegação) e o rodapé fixo. */
export function Tela({ children, rodape, className }: { children: ReactNode; rodape?: ReactNode; className?: string }) {
  return (
    <div className="fundo-app flex h-full flex-col bg-bg" style={{ paddingTop: 'var(--topo)' }}>
      <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}>{children}</div>
      {rodape && (
        <div className="border-t border-line bg-surface px-4 pt-3" style={{ paddingBottom: 'calc(12px + var(--base))' }}>
          {rodape}
        </div>
      )}
      {!rodape && <div style={{ height: 'var(--base)' }} />}
    </div>
  )
}

/** "Salvo ✓" por 2 s a cada gravação (depois fica só o ✓). */
function Salvo() {
  const salvoEm = useApp((e) => e.salvoEm)
  const [recente, setRecente] = useState(false)
  useEffect(() => {
    if (!salvoEm) return
    setRecente(true)
    const t = setTimeout(() => setRecente(false), 2000)
    return () => clearTimeout(t)
  }, [salvoEm])
  if (!salvoEm) return null
  return (
    <span className="text-[14px] font-medium text-brand-ink" aria-live="polite">
      {recente ? 'Salvo ✓' : '✓'}
    </span>
  )
}

export function Cabecalho({
  titulo,
  subtitulo,
  aoVoltar,
  direita,
  salvo,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  aoVoltar?: () => void
  direita?: ReactNode
  salvo?: boolean
}) {
  return (
    <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-1 border-b border-line bg-surface/95 px-2 backdrop-blur">
      {aoVoltar && (
        <button
          type="button"
          onClick={aoVoltar}
          aria-label="Voltar"
          className="grid size-12 place-items-center rounded-xl text-ink active:bg-surface-2"
        >
          <IconeVoltar />
        </button>
      )}
      <div className={cn('min-w-0 flex-1 py-2', !aoVoltar && 'pl-2')}>
        <div className="truncate text-[18px] font-semibold leading-tight">{titulo}</div>
        {subtitulo && <div className="truncate text-[14px] text-ink-2">{subtitulo}</div>}
      </div>
      {salvo && <Salvo />}
      {direita}
    </header>
  )
}

export function Cartao({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'block w-full rounded-2xl border border-line-strong bg-surface p-4 text-left',
        onClick && 'active:bg-surface-2',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function SecaoTitulo({ children, direita }: { children: ReactNode; direita?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-5">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{children}</h2>
      {direita}
    </div>
  )
}

/** A folha que sobe de baixo (anotação, motivos, confirmações). Fecha pelos botões dela ou pelo voltar do Android (`aoFechar`). */
export function Folha({
  titulo,
  children,
  rodape,
  aoFechar,
}: {
  titulo: ReactNode
  children: ReactNode
  rodape?: ReactNode
  /** A mesma ação do Cancelar/Fechar da folha: é o que o voltar do Android faz. */
  aoFechar: () => void
}) {
  useFecharNoVoltar(aoFechar)
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/45" role="dialog" aria-modal="true">
      <div
        className="entra max-h-[92%] overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3"
        style={{ paddingBottom: 'calc(16px + var(--base))' }}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line-strong" />
        <h2 className="mb-3 text-[20px] font-semibold">{titulo}</h2>
        {children}
        {rodape && <div className="mt-4 flex gap-3">{rodape}</div>}
      </div>
    </div>
  )
}

export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  obrigatorio,
  dica,
  tipo = 'text',
  maiusculas = 'sentences',
  autoFoco,
  maximo = 200,
  modoTeclado,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  obrigatorio?: boolean
  dica?: string
  tipo?: 'text' | 'time' | 'date' | 'datetime-local' | 'url'
  maiusculas?: 'sentences' | 'words' | 'none' | 'characters'
  autoFoco?: boolean
  maximo?: number
  modoTeclado?: 'text' | 'numeric' | 'decimal' | 'url'
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[15px] font-medium text-ink-2">
        {rotulo} {obrigatorio && <MarcaObrigatorio />}
      </span>
      <input
        type={tipo}
        value={valor}
        maxLength={maximo}
        autoFocus={autoFoco}
        autoCapitalize={maiusculas}
        inputMode={modoTeclado}
        onChange={(e) => aoMudar(e.target.value)}
        className="min-h-[52px] w-full rounded-xl border-2 border-campo bg-surface px-3 text-[17px] text-ink outline-none focus:border-brand"
      />
      {dica && <span className="mt-1 block text-[14px] text-ink-2">{dica}</span>}
    </label>
  )
}

export function AreaTexto({
  rotulo,
  valor,
  aoMudar,
  obrigatorio,
  autoFoco,
  linhas = 3,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  obrigatorio?: boolean
  autoFoco?: boolean
  linhas?: number
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[15px] font-medium text-ink-2">
        {rotulo} {obrigatorio && <MarcaObrigatorio />}
      </span>
      <textarea
        value={valor}
        rows={linhas}
        maxLength={2000}
        autoFocus={autoFoco}
        autoCapitalize="sentences"
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full rounded-xl border-2 border-campo bg-surface px-3 py-2 text-[17px] text-ink outline-none focus:border-brand"
      />
    </label>
  )
}

/** A marca ● do papel e do sistema (obrigatório para emitir). */
export function MarcaObrigatorio() {
  return (
    <span className="text-brand-ink" title="obrigatório">
      ●<span className="sr-only"> (obrigatório)</span>
    </span>
  )
}

export function Selo({
  children,
  tom = 'neutro',
}: {
  children: ReactNode
  tom?: 'neutro' | 'verde' | 'ambar' | 'grafite' | 'vermelho'
}) {
  const cores = {
    neutro: 'bg-neutral-soft text-ink-2',
    verde: 'bg-brand-soft text-brand-ink',
    ambar: 'bg-warning-soft text-warning-ink',
    grafite: 'bg-surface-3 text-ink',
    vermelho: 'bg-danger-soft text-danger',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold', cores[tom])}>
      {children}
    </span>
  )
}

/** Escolha entre poucas opções (chips grandes). */
export function Escolha<T extends string>({
  opcoes,
  valor,
  aoEscolher,
  rotulo,
}: {
  opcoes: ReadonlyArray<{ valor: T; texto: string }>
  valor: T | '' | null
  aoEscolher: (v: T) => void
  rotulo?: ReactNode
}) {
  return (
    <div>
      {rotulo && <div className="mb-1 text-[15px] font-medium text-ink-2">{rotulo}</div>}
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={valor === o.valor}
            onClick={() => aoEscolher(o.valor)}
            className={cn(
              'min-h-[48px] rounded-xl border-2 px-4 text-[16px] font-medium',
              valor === o.valor ? 'border-brand bg-brand-soft text-brand-ink' : 'border-campo bg-surface text-ink',
            )}
          >
            {valor === o.valor ? '✓ ' : ''}
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Caixa de marcar grande (Levado / Usado). */
export function Marcar({ marcado, aoMudar, children }: { marcado: boolean; aoMudar: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      onClick={() => aoMudar(!marcado)}
      className={cn(
        'inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 px-3 text-[16px] font-medium',
        marcado ? 'border-brand bg-brand-soft text-brand-ink' : 'border-campo bg-surface text-ink',
      )}
    >
      <span
        className={cn(
          'grid size-6 place-items-center rounded-md border-2 text-[14px]',
          marcado ? 'border-brand bg-brand text-on-brand' : 'border-campo',
        )}
      >
        {marcado ? '✓' : ''}
      </span>
      {children}
    </button>
  )
}

/** Uma linha "rótulo · valor" para resumos. */
export function Linha({ rotulo, children }: { rotulo: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <span className="text-[15px] text-ink-2">{rotulo}</span>
      <span className="text-right text-[16px] font-medium">{children}</span>
    </div>
  )
}

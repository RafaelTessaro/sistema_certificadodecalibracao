// O teclado do app para as leituras (7 8 9 ⌫ / 4 5 6 Repetir / 1 2 3 Próxima / ± 0 ,): teclas de 64 dp, sempre no mesmo
// lugar, sem abrir o teclado do Android. "Repetir" só aparece na repetibilidade e na excentricidade, com o valor que vai
// inserir. Um teclado físico (ou Bluetooth) também serve: o ponto vira vírgula e o Enter é a "Próxima".

import { useEffect } from 'react'
import { NOME_DA_TECLA } from '../nucleo/teclado.ts'
import type { Tecla } from '../nucleo/teclado.ts'
import { cn } from './base.tsx'

export function TecladoNumerico({
  aoTeclar,
  aoProxima,
  repetir,
  rotuloProxima = 'Próxima',
}: {
  aoTeclar: (t: Tecla) => void
  aoProxima: () => void
  /** null = sem a tecla (erro de indicação, ambiente); '' = a tecla apagada (nada a repetir). */
  repetir: { valor: string; aoRepetir: () => void } | null
  rotuloProxima?: string
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (/^\d$/.test(e.key)) aoTeclar(e.key as Tecla)
      else if (e.key === ',' || e.key === '.') aoTeclar(',')
      else if (e.key === '-') aoTeclar('±')
      else if (e.key === 'Backspace') aoTeclar('⌫')
      else if (e.key === 'Enter') aoProxima()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoTeclar, aoProxima])

  const tecla = (t: Tecla, extra?: string) => (
    <button
      key={t}
      type="button"
      aria-label={NOME_DA_TECLA[t]}
      onClick={() => aoTeclar(t)}
      className={cn(
        'h-16 rounded-xl border-2 border-campo bg-surface text-[28px] font-medium tabular-nums text-ink active:bg-surface-3',
        extra,
      )}
    >
      {t}
    </button>
  )
  return (
    <div className="grid grid-cols-4 gap-2 bg-surface-2 p-2" style={{ paddingBottom: 'calc(8px + var(--base))' }}>
      {tecla('7')}
      {tecla('8')}
      {tecla('9')}
      {tecla('⌫', 'text-[24px]')}
      {tecla('4')}
      {tecla('5')}
      {tecla('6')}
      {repetir ? (
        <button
          type="button"
          disabled={!repetir.valor}
          onClick={repetir.aoRepetir}
          aria-label={repetir.valor ? `repetir ${repetir.valor}` : 'nada a repetir'}
          className="h-16 rounded-xl border-2 border-campo bg-surface px-1 text-[14px] font-semibold leading-tight text-ink active:bg-surface-3 disabled:opacity-40"
        >
          Repetir
          <span className="block truncate text-[15px] tabular-nums">{repetir.valor || '—'}</span>
        </button>
      ) : (
        <div />
      )}
      {tecla('1')}
      {tecla('2')}
      {tecla('3')}
      <button
        type="button"
        onClick={aoProxima}
        aria-label="próxima leitura"
        className="row-span-2 rounded-xl bg-brand text-[18px] font-semibold text-on-brand active:bg-brand-hover"
      >
        {rotuloProxima}
        <span className="block text-[22px]">↵</span>
      </button>
      {tecla('±')}
      {tecla('0')}
      {tecla(',')}
    </div>
  )
}

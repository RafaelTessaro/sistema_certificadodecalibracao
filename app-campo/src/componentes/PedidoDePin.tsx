// O PIN do técnico (6 dígitos): seis bolinhas e um teclado grande. Confere ao digitar o 6º dígito. Erros seguidos fazem
// esperar (5 erros: 30 s, e dobra). Usado para assinar, sair do modo entrega, corrigir e reabrir.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { conferirPinDoTecnico } from '../app/acoes.ts'
import { useApp } from '../app/loja.ts'
import { esperaRestante, textoDaEspera } from '../nucleo/pin.ts'
import { Botao, cn } from './base.tsx'

export function TecladoPin({ valor, aoMudar, desligado }: { valor: string; aoMudar: (v: string) => void; desligado?: boolean }) {
  const tecla = (t: string) => (
    <button
      key={t}
      type="button"
      disabled={desligado}
      onClick={() => aoMudar(t === '⌫' ? valor.slice(0, -1) : valor.length < 6 ? valor + t : valor)}
      aria-label={t === '⌫' ? 'apagar' : t}
      className="h-16 rounded-xl border-2 border-campo bg-surface text-[26px] font-medium text-ink active:bg-surface-3 disabled:opacity-40"
    >
      {t}
    </button>
  )
  return (
    <div className="grid grid-cols-3 gap-2">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(tecla)}
      <div />
      {tecla('0')}
      {tecla('⌫')}
    </div>
  )
}

export function BolinhasPin({ n }: { n: number }) {
  return (
    <div className="flex justify-center gap-3 py-4" aria-label={`${n} de 6 dígitos`}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={cn('size-4 rounded-full border-2', i < n ? 'border-brand bg-brand' : 'border-campo')} />
      ))}
    </div>
  )
}

/** Pede o PIN do técnico. `aoConfirmar` só é chamado com o PIN certo. */
export function PedidoDePin({
  titulo,
  explicacao,
  aoConfirmar,
  aoCancelar,
  rotuloCancelar = 'Cancelar',
}: {
  titulo: ReactNode
  explicacao?: ReactNode
  aoConfirmar: () => void
  aoCancelar?: () => void
  rotuloCancelar?: string
}) {
  const [pin, setPin] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [conferindo, setConferindo] = useState(false)
  const tentativas = useApp((e) => e.tentativasPin)
  const [agora, setAgora] = useState(() => Date.now())
  const espera = esperaRestante(tentativas, agora)

  useEffect(() => {
    if (!espera) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [espera])

  useEffect(() => {
    if (pin.length !== 6 || conferindo) return
    setConferindo(true)
    void conferirPinDoTecnico(pin).then((r) => {
      setConferindo(false)
      setPin('')
      setAgora(Date.now())
      if (r.ok) aoConfirmar()
      else setMensagem(r.mensagem)
    })
  }, [pin, conferindo, aoConfirmar])

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-center text-[20px] font-semibold">{titulo}</h2>
      {explicacao && <p className="text-center text-[15px] text-ink-2">{explicacao}</p>}
      <BolinhasPin n={pin.length} />
      <p className="min-h-[24px] text-center text-[15px] font-medium text-danger" aria-live="assertive">
        {espera ? textoDaEspera(espera) : mensagem}
      </p>
      <TecladoPin valor={pin} aoMudar={(v) => (setMensagem(''), setPin(v))} desligado={!!espera || conferindo} />
      {aoCancelar && (
        <Botao variante="texto" onClick={aoCancelar} className="mt-1">
          {rotuloCancelar}
        </Botao>
      )}
    </div>
  )
}

/** O pedido de PIN numa folha que sobe de baixo, por cima da tela. */
export function FolhaDePin(props: Parameters<typeof PedidoDePin>[0]) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" role="dialog" aria-modal="true">
      <div className="entra rounded-t-3xl bg-surface px-4 pt-5" style={{ paddingBottom: 'calc(16px + var(--base))' }}>
        <PedidoDePin {...props} />
      </div>
    </div>
  )
}

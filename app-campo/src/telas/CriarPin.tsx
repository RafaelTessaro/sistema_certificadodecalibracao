// Criar o PIN: 6 dígitos, digitados duas vezes. O PIN assina as folhas e tira o celular do modo entrega.

import { useEffect, useState } from 'react'
import { criarPin } from '../app/acoes.ts'
import { useApp } from '../app/loja.ts'
import { Tela } from '../componentes/base.tsx'
import { BolinhasPin, TecladoPin } from '../componentes/PedidoDePin.tsx'

export function TelaCriarPin() {
  const tecnico = useApp((e) => e.pareamento?.tecnico.nome ?? '')
  const [primeiro, setPrimeiro] = useState('')
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (pin.length !== 6) return
    if (!primeiro) {
      setPrimeiro(pin)
      setPin('')
      return
    }
    if (pin !== primeiro) {
      setErro('Os dois PINs não batem. Comece de novo.')
      setPrimeiro('')
      setPin('')
      return
    }
    void criarPin(pin)
  }, [pin, primeiro])

  return (
    <Tela>
      <div className="flex flex-col gap-3 px-5 py-8">
        <p className="text-center text-[16px] text-ink-2">Celular cadastrado para {tecnico}.</p>
        <h1 className="text-center text-[24px] font-semibold">{primeiro ? 'Digite o PIN de novo' : 'Crie o seu PIN'}</h1>
        <p className="text-center text-[16px] text-ink-2">
          6 dígitos. Você vai usar o PIN para assinar as folhas.
          <br />
          <b className="text-ink">O PIN é pessoal: não empreste o celular nem o PIN.</b>
        </p>
        <BolinhasPin n={pin.length} />
        <p className="min-h-[24px] text-center text-[15px] font-medium text-danger" aria-live="assertive">
          {erro}
        </p>
        <TecladoPin valor={pin} aoMudar={(v) => (setErro(''), setPin(v))} />
      </div>
    </Tela>
  )
}

// Campos que gravam na folha: o texto (gravado meio segundo depois de parar de digitar e ao sair do campo, para não
// perder nada nem travar o teclado), a data e hora com "Agora" (o relógio do celular, editável) e a data com "Hoje".

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatarInstante, instanteLocal } from '../../../shared/campo/registro.ts'
import type { RegistroCampo } from '../../../shared/campo/tipos.ts'
import { mudarFolha } from '../app/acoes.ts'
import { editar } from '../nucleo/folha.ts'
import { dataBr } from '../nucleo/datas.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'
import { Botao, CampoTexto, MarcaObrigatorio } from './base.tsx'

/** Grava uma mudança no registro da folha (com a trilha das correções). */
export function useGravar(envioId: string) {
  return useCallback(
    (mudar: (r: RegistroCampo) => void) => {
      const agora = relogioDoAparelho.agora()
      return mudarFolha(envioId, (f) => editar(f, mudar, agora))
    },
    [envioId],
  )
}

export function CampoTextoDaFolha({
  rotulo,
  valor,
  aoGravar,
  obrigatorio,
  dica,
  maiusculas,
  modoTeclado,
  maximo,
}: {
  rotulo: string
  valor: string
  aoGravar: (v: string) => void
  obrigatorio?: boolean
  dica?: string
  maiusculas?: 'sentences' | 'words' | 'none' | 'characters'
  modoTeclado?: 'text' | 'numeric' | 'decimal'
  maximo?: number
}) {
  const [local, setLocal] = useState(valor)
  const pendente = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gravar = useRef(aoGravar)
  useEffect(() => {
    gravar.current = aoGravar
  }, [aoGravar])

  const descarregar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (pendente.current !== null) {
      gravar.current(pendente.current)
      pendente.current = null
    }
  }, [])

  // Valor novo vindo de fora (outra tela) sem nada pendente aqui
  useEffect(() => {
    if (pendente.current === null) setLocal(valor)
  }, [valor])
  useEffect(() => descarregar, [descarregar])

  return (
    <div onBlur={descarregar}>
      <CampoTexto
        rotulo={rotulo}
        valor={local}
        obrigatorio={obrigatorio}
        dica={dica}
        maiusculas={maiusculas}
        modoTeclado={modoTeclado}
        maximo={maximo}
        aoMudar={(v) => {
          setLocal(v)
          pendente.current = v
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(descarregar, 500)
        }}
      />
    </div>
  )
}

/** "2026-11-18T08:42" (o que o campo datetime-local mostra) de um instante ISO com fuso. */
const paraCampo = (v: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.exec(v)?.[0] ?? ''

/** Data e hora (do relógio do celular) com "Agora"; "Ajustar" abre o seletor do Android. */
export function CampoInstante({
  rotulo,
  valor,
  aoMudar,
  obrigatorio,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  obrigatorio?: boolean
}) {
  const [ajustando, setAjustando] = useState(false)
  return (
    <div>
      <div className="mb-1 text-[15px] font-medium text-ink-2">
        {rotulo} {obrigatorio && <MarcaObrigatorio />}
      </div>
      <div className="flex items-center gap-2">
        <div className="min-h-[52px] flex-1 rounded-xl border-2 border-campo bg-surface px-3 py-3 text-[17px] tabular-nums">
          {formatarInstante(valor) || <span className="text-muted">—</span>}
        </div>
        <Botao variante="principal" onClick={() => aoMudar(relogioDoAparelho.agora())}>
          Agora
        </Botao>
        <Botao onClick={() => setAjustando((x) => !x)} aria-label={`Ajustar ${rotulo}`}>
          Ajustar
        </Botao>
      </div>
      {ajustando && (
        <input
          type="datetime-local"
          defaultValue={paraCampo(valor)}
          onChange={(e) => {
            const t = Date.parse(e.target.value)
            if (Number.isFinite(t)) aoMudar(instanteLocal(new Date(t)))
          }}
          className="mt-2 min-h-[52px] w-full rounded-xl border-2 border-campo bg-surface px-3 text-[17px]"
        />
      )}
    </div>
  )
}

/** Uma data (AAAA-MM-DD) com "Hoje". */
export function CampoData({
  rotulo,
  valor,
  aoMudar,
  obrigatorio,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  obrigatorio?: boolean
}) {
  return (
    <div>
      <div className="mb-1 text-[15px] font-medium text-ink-2">
        {rotulo} {obrigatorio && <MarcaObrigatorio />}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          aria-label={rotulo}
          className="min-h-[52px] flex-1 rounded-xl border-2 border-campo bg-surface px-3 text-[17px]"
        />
        <Botao variante="principal" onClick={() => aoMudar(relogioDoAparelho.hoje())}>
          Hoje
        </Botao>
      </div>
      {valor && <div className="mt-1 text-[14px] text-ink-2">{dataBr(valor)}</div>}
    </div>
  )
}

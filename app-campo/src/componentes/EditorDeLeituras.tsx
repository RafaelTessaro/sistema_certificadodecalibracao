// O coração do app: a tabela do passo em cima, a leitura em foco no meio (40 sp, exatamente como digitada, com a
// unidade) e o teclado do app embaixo. "Próxima" confirma, grava e vai para a próxima leitura na ORDEM FÍSICA
// (nucleo/ordem.ts); tocar noutra célula confirma o que estava digitado e leva o foco para lá. Ao confirmar, os avisos
// daquela leitura aparecem embaixo dela (não interrompem: "Próxima" continua valendo, e o aviso vai para a Revisão).
// Nada é preenchido sem um toque: a carga aparece ao lado, nunca dentro da leitura.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  avisosDaLeitura,
  avisosPendentes,
  conferirAviso,
  contextoDaLeitura,
  prepararAvisos,
} from '../../../shared/campo/avisos.ts'
import type { AvisoCampo, PreparoAvisos } from '../../../shared/campo/avisos.ts'
import { novaLeitura } from '../../../shared/campo/registro.ts'
import type { PacoteCampo, RegistroCampo } from '../../../shared/campo/tipos.ts'
import { avisar, mudarFolha } from '../app/acoes.ts'
import { editar, gravarLeitura, lerLeitura } from '../nucleo/folha.ts'
import type { FolhaLocal } from '../nucleo/folha.ts'
import { proximoCampo } from '../nucleo/ordem.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'
import { rotuloDoCampo, unidadeDoCampo } from '../nucleo/rotulos.ts'
import { repetir, tecladoCom, teclar, textoParaConfirmar, valorParaRepetir } from '../nucleo/teclado.ts'
import type { EstadoTeclado, Tecla } from '../nucleo/teclado.ts'
import { AvisoNaHora } from './Avisos.tsx'
import { cn } from './base.tsx'
import { TecladoNumerico } from './TecladoNumerico.tsx'

/** Os avisos ainda não conferidos de uma leitura gravada. */
export function avisosDoCampo(
  registro: RegistroCampo,
  pacote: PacoteCampo | null,
  campo: string,
  preparo?: PreparoAvisos,
): AvisoCampo[] {
  try {
    const l = lerLeitura(registro, campo)
    if (!l) return []
    const ctx = contextoDaLeitura(registro, pacote, campo, preparo ?? prepararAvisos(registro, pacote))
    return ctx ? avisosPendentes(avisosDaLeitura(ctx, l), registro) : []
  } catch {
    return []
  }
}

export interface ContextoTabela {
  foco: string | null
  /** Toca numa célula: confirma o que estava digitado e leva o foco para ela. */
  selecionar: (campo: string) => void
  /** O texto digitado da leitura em foco (ainda não confirmado). */
  rascunho: string
  /** Campos com aviso ainda não conferido (▲ na célula). */
  comAviso: (campo: string) => boolean
}

/** Uma célula de leitura da tabela: a leitura gravada (ou o rascunho, se está em foco), com ▲ quando tem aviso. */
export function Celula({
  campo,
  ctx,
  registro,
  vazio = '·',
}: {
  campo: string
  ctx: ContextoTabela
  registro: RegistroCampo
  vazio?: string
}) {
  const emFoco = ctx.foco === campo
  const valor = emFoco ? ctx.rascunho : (lerLeitura(registro, campo)?.valor ?? '')
  return (
    <button
      type="button"
      onClick={() => ctx.selecionar(campo)}
      className={cn(
        'min-h-[44px] w-full rounded-lg px-2 text-right text-[16px] tabular-nums',
        emFoco ? 'bg-brand-soft font-semibold text-brand-ink ring-2 ring-brand' : 'active:bg-surface-2',
        !valor && !emFoco && 'text-muted',
      )}
    >
      {ctx.comAviso(campo) && !emFoco && <span className="mr-1 text-warning">▲</span>}
      {valor || (emFoco ? '_' : vazio)}
    </button>
  )
}

export function EditorDeLeituras({
  folha,
  campos,
  foco,
  aoFocar,
  aoTerminar,
  descrever,
  tabela,
  rotuloFim = 'Concluir',
}: {
  folha: FolhaLocal & { registro: RegistroCampo }
  /** A ordem das leituras (a ordem física da "Próxima"). */
  campos: readonly string[]
  foco: string | null
  aoFocar: (campo: string | null) => void
  /** "Próxima" na última leitura. */
  aoTerminar?: () => void
  /** O que mostrar acima da leitura em foco (carga, pesos, posição). */
  descrever?: (campo: string) => ReactNode
  tabela: (ctx: ContextoTabela) => ReactNode
  rotuloFim?: string
}) {
  const { registro, pacote, envioId } = folha
  const [teclado, setTeclado] = useState<EstadoTeclado>(() => tecladoCom(foco ? (lerLeitura(registro, foco)?.valor ?? '') : ''))
  const [avisosNovos, setAvisosNovos] = useState<{ campo: string; avisos: AvisoCampo[] } | null>(null)

  // Ao trocar o foco, o teclado começa com a leitura gravada (para corrigir) ou vazio
  useEffect(() => {
    setTeclado(tecladoCom(foco ? (lerLeitura(registro, foco)?.valor ?? '') : ''))
    // Só quando o foco muda (o registro muda a cada gravação e apagaria o que está sendo digitado)
  }, [foco]) // oxlint-disable-line react-hooks/exhaustive-deps

  // As células com aviso ainda não conferido (▲): as contas do registro feitas uma vez para todas as leituras
  const comAviso = useMemo(() => {
    let preparo: PreparoAvisos | undefined
    try {
      preparo = prepararAvisos(registro, pacote)
    } catch {
      preparo = undefined
    }
    const marcados = new Set(preparo ? campos.filter((c) => avisosDoCampo(registro, pacote, c, preparo).length > 0) : [])
    return (campo: string) => marcados.has(campo)
  }, [registro, pacote, campos])

  /** Confirma o que está digitado no campo em foco e leva o foco para `destino` ('auto' = a próxima da ordem). */
  const confirmar = useCallback(
    async (destino: string | null | 'auto') => {
      const campo = foco
      if (!campo) {
        if (destino && destino !== 'auto') aoFocar(destino)
        return
      }
      const texto = textoParaConfirmar(teclado)
      if (texto === null) {
        avisar('Confira o número digitado.', 'erro')
        return
      }
      const atual = lerLeitura(registro, campo)
      const mudou = (atual?.valor ?? '') !== texto || (!!texto && teclado.via !== (atual?.via ?? 'teclado'))
      if (mudou) {
        const agora = relogioDoAparelho.agora()
        const nova = await mudarFolha(envioId, (f) =>
          editar(f, (r) => gravarLeitura(r, campo, texto ? novaLeitura(texto, teclado.via, agora) : null), agora),
        )
        if (!nova?.registro) return
        const avisos = texto ? avisosDoCampo(nova.registro, nova.pacote, campo) : []
        setAvisosNovos(avisos.length ? { campo, avisos } : null)
      }
      const proximo = destino === 'auto' ? proximoCampo(campos, campo) : destino
      if (proximo) aoFocar(proximo)
      else if (destino === 'auto') {
        aoFocar(null)
        aoTerminar?.()
      }
    },
    [foco, teclado, registro, envioId, campos, aoFocar, aoTerminar],
  )

  const aoTeclar = useCallback((t: Tecla) => setTeclado((e) => teclar(e, t)), [])
  const aoProxima = useCallback(() => void confirmar('auto'), [confirmar])
  const selecionar = useCallback((campo: string) => void confirmar(campo), [confirmar])

  const conferir = async (a: AvisoCampo, motivo = '') => {
    const agora = relogioDoAparelho.agora()
    await mudarFolha(envioId, (f) => editar(f, (r) => void r.avisosConferidos.push(conferirAviso(a, agora, motivo)), agora))
    setAvisosNovos((x) => (x ? { ...x, avisos: x.avisos.filter((y) => y !== a) } : x))
  }

  const repetirValor = foco ? valorParaRepetir(registro, foco) : null
  const avisosAVista =
    avisosNovos && avisosNovos.avisos.length
      ? avisosNovos
      : foco && teclado.texto === (lerLeitura(registro, foco)?.valor ?? '')
        ? { campo: foco, avisos: avisosDoCampo(registro, pacote, foco) }
        : null
  const unidade = foco ? unidadeDoCampo(registro, pacote, foco) : ''
  const ultimo = foco ? !proximoCampo(campos, foco) : false

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tabela({ foco, selecionar, rascunho: teclado.texto, comAviso })}
      </div>
      <div className="border-t border-line bg-surface px-4 pb-2 pt-2">
        {avisosAVista && avisosAVista.avisos.length > 0 && (
          <div className="mb-2 max-h-[24vh] space-y-2 overflow-y-auto">
            {avisosAVista.avisos.map((a) => (
              <AvisoNaHora
                key={`${a.codigo}|${a.campo}|${a.texto}`}
                aviso={a}
                aoConferir={() => void conferir(a)}
                aoMotivo={(m) => void conferir(a, m)}
                aoCorrigir={() => {
                  setAvisosNovos(null)
                  if (a.campo && a.campo !== foco) void confirmar(a.campo)
                }}
              />
            ))}
          </div>
        )}
        {foco ? (
          <div aria-live="polite">
            <div className="truncate text-[15px] font-medium text-ink-2">{rotuloDoCampo(registro, pacote, foco)}</div>
            {descrever && <div className="text-[14px] text-ink-2">{descrever(foco)}</div>}
            <div className="flex items-baseline justify-end gap-2 py-1">
              <span className={cn('text-[40px] font-semibold leading-none tabular-nums', !teclado.texto && 'text-muted')}>
                {teclado.texto || '—'}
              </span>
              {unidade && <span className="text-[20px] text-ink-2">{unidade}</span>}
              {teclado.via === 'repetir' && <span className="text-[13px] font-semibold text-ink-2">(repetida)</span>}
            </div>
          </div>
        ) : (
          <p className="py-3 text-center text-[15px] text-ink-2">Toque numa leitura da tabela para digitar.</p>
        )}
      </div>
      {foco && (
        <TecladoNumerico
          aoTeclar={aoTeclar}
          aoProxima={aoProxima}
          rotuloProxima={ultimo ? rotuloFim : 'Próxima'}
          repetir={repetirValor === null ? null : { valor: repetirValor, aoRepetir: () => setTeclado(repetir(repetirValor)) }}
        />
      )}
    </div>
  )
}

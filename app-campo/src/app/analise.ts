// As contas de cada folha que as telas mostram (avisos da folha inteira, etapas, progresso, revisão), calculadas uma vez
// por versão do registro (o registro muda a cada gravação: o objeto novo recalcula). Nunca derrubam a tela: um registro
// que as regras não entendem mostra a tela sem os avisos.

import { useMemo } from 'react'
import { avisosDoRegistro, avisosPendentes } from '../../../shared/campo/avisos.ts'
import type { AvisoCampo } from '../../../shared/campo/avisos.ts'
import { progressoDaFolha, revisaoDaFolha, situacaoDasEtapas } from '../../../shared/campo/progresso.ts'
import type { ProgressoFolha, RevisaoFolha, SituacaoEtapa } from '../../../shared/campo/progresso.ts'
import type { PacoteCampo, RegistroCampo } from '../../../shared/campo/tipos.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'

function seguro<T>(conta: () => T, vazio: T): T {
  try {
    return conta()
  } catch (e) {
    console.error('Conta da folha', e)
    return vazio
  }
}

export interface AnaliseFolha {
  avisos: AvisoCampo[]
  /** Os avisos ainda não conferidos. */
  pendentes: AvisoCampo[]
  etapas: SituacaoEtapa[]
  progresso: ProgressoFolha
}

const progressoVazio: ProgressoFolha = { completas: 0, total: 9, percentual: 0, proxima: 'padroes' }

export function analisar(registro: RegistroCampo, pacote: PacoteCampo | null): AnaliseFolha {
  const hoje = relogioDoAparelho.hoje()
  const avisos = seguro(() => avisosDoRegistro(registro, pacote, { hoje }), [] as AvisoCampo[])
  const etapas = seguro(() => situacaoDasEtapas(registro, pacote, { hoje, avisos }), [] as SituacaoEtapa[])
  const progresso = seguro(() => progressoDaFolha(registro, pacote, { hoje, avisos }), progressoVazio)
  return { avisos, pendentes: avisosPendentes(avisos, registro), etapas, progresso }
}

const cache = new WeakMap<RegistroCampo, AnaliseFolha>()

/** A análise de um registro, guardada enquanto o registro (o objeto) for o mesmo. */
export function analiseEmCache(registro: RegistroCampo, pacote: PacoteCampo | null): AnaliseFolha {
  let a = cache.get(registro)
  if (!a) {
    a = analisar(registro, pacote)
    cache.set(registro, a)
  }
  return a
}

export function useAnalise(
  registro: RegistroCampo | null | undefined,
  pacote: PacoteCampo | null | undefined,
): AnaliseFolha | null {
  return useMemo(() => (registro ? analiseEmCache(registro, pacote ?? null) : null), [registro, pacote])
}

export function useRevisao(
  registro: RegistroCampo | null | undefined,
  pacote: PacoteCampo | null | undefined,
): RevisaoFolha | null {
  return useMemo(
    () =>
      registro
        ? seguro(() => revisaoDaFolha(registro, pacote ?? null, { hoje: relogioDoAparelho.hoje() }), {
            falta: [],
            impede: [],
            digitacao: [],
            tudoCerto: [],
          })
        : null,
    [registro, pacote],
  )
}

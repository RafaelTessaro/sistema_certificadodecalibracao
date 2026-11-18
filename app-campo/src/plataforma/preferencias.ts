// Preferências pequenas do app (@capacitor/preferences, o armazenamento privado do app): o token do pareamento, o
// endereço do servidor, o técnico, o id do aparelho, o hash do PIN e os ajustes do Menu. As folhas ficam no SQLite.

import { Preferences } from '@capacitor/preferences'

export const PREF = {
  token: 'token',
  endereco: 'endereco-servidor',
  servidor: 'servidor',
  tecnico: 'tecnico',
  aparelhoId: 'aparelho-id',
  pareadoEm: 'pareado-em',
  pinHash: 'pin-hash',
  pinTentativas: 'pin-tentativas',
  tema: 'tema',
  horaLembrete: 'hora-lembrete',
  descadastrado: 'descadastrado',
  naoPareado: 'nao-pareado',
} as const
export type ChavePreferencia = (typeof PREF)[keyof typeof PREF]

export async function lerPreferencia(chave: ChavePreferencia): Promise<string | null> {
  return (await Preferences.get({ key: chave })).value
}

export async function gravarPreferencia(chave: ChavePreferencia, valor: string | null): Promise<void> {
  if (valor === null) await Preferences.remove({ key: chave })
  else await Preferences.set({ key: chave, value: valor })
}

export async function lerJson<T>(chave: ChavePreferencia): Promise<T | null> {
  const t = await lerPreferencia(chave)
  if (!t) return null
  try {
    return JSON.parse(t) as T
  } catch {
    return null
  }
}

export const gravarJson = (chave: ChavePreferencia, valor: unknown) =>
  gravarPreferencia(chave, valor === null || valor === undefined ? null : JSON.stringify(valor))

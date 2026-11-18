// Relógio do app: a data e a hora do celular em ISO com o fuso ("2026-11-18T08:42:10-03:00"), sem relógio monotônico
// (05-ajustes-finais §5). O servidor compara a hora do celular com a dele na entrega (marca RELOGIO). Injetável, para os
// testes andarem no tempo sem esperar. Puro: sem Capacitor.

import { hojeLocalIso } from '../../../shared/dominio.ts'
import { instanteLocal } from '../../../shared/campo/registro.ts'
import type { Instante } from '../../../shared/campo/tipos.ts'

export interface Relogio {
  /** Agora, em ISO com o fuso do aparelho. */
  agora(): Instante
  /** Agora, em milissegundos (para as esperas do PIN e os prazos). */
  ms(): number
  /** O dia de hoje no relógio do aparelho (AAAA-MM-DD; nunca pelo UTC). */
  hoje(): string
}

export const relogioDoAparelho: Relogio = {
  agora: () => instanteLocal(),
  ms: () => Date.now(),
  hoje: () => hojeLocalIso(),
}

/** Relógio parado num instante (testes); `avancar` anda o tempo. `fusoMin`: −180 = Brasília. */
export function relogioFixo(inicio: Date | string, fusoMin = -180): Relogio & { avancar(ms: number): void } {
  let t = typeof inicio === 'string' ? Date.parse(inicio) : inicio.getTime()
  const instante = () => instanteLocal(new Date(t), fusoMin)
  return {
    agora: instante,
    ms: () => t,
    hoje: () => instante().slice(0, 10),
    avancar(ms: number) {
      t += ms
    },
  }
}

/** Dias inteiros entre dois instantes (ISO); NaN se algum for inválido. */
export function diasEntre(de: Instante, ate: Instante): number {
  return (Date.parse(ate) - Date.parse(de)) / 86_400_000
}

/** "HH:mm" de um instante, como está escrito (o relógio do celular). */
export function horaDoInstante(v: Instante): string {
  const m = /T(\d{2}):(\d{2})/.exec(v)
  return m ? `${m[1]}:${m[2]}` : ''
}

// Pequenas contas de data (AAAA-MM-DD) e hora, sem fuso: o relógio do celular como está escrito. Puro.

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d + dias))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** "18/11/2026" de AAAA-MM-DD ('' se vazio). */
export function dataBr(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** "17:30" válido? */
export const horaValida = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

/**
 * O próximo momento HH:mm a partir de agora (hoje, se ainda não passou; senão amanhã), no fuso do aparelho. Para o
 * lembrete do fim do expediente.
 */
export function proximoHorario(hora: string, agora: Date): Date {
  const [h, m] = hora.split(':').map(Number)
  const alvo = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), h, m, 0, 0)
  if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1)
  return alvo
}

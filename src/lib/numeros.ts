// Textos do nº de certificado reservado na impressão da folha de campo (o que o técnico copia na etiqueta da
// balança e com que o certificado é emitido) e da lista dos nºs ainda sem certificado e dos não utilizados.

import type { CalibracaoResumo, NumeroReservado, SituacaoNumero } from '#shared/tipos.ts'
import { dataHora } from './format'

export const ROTULO_SITUACAO_NUMERO: Record<SituacaoNumero, string> = {
  reservado: 'Reservado',
  emitido: 'Emitido',
  nao_utilizado: 'Não utilizado',
}

/** "Certificado nº CC-2026-00042 (reservado)". */
export const textoNumeroReservado = (numero: string) => `Certificado nº ${numero} (reservado)`

/** Nº da linha das listas: o do certificado emitido; em andamento, o reservado (`reservado`) ou nenhum. */
export function numeroDaLinha(k: Pick<CalibracaoResumo, 'numero' | 'numeroReservado'>): { numero: string; reservado: boolean } {
  if (k.numero) return { numero: k.numero, reservado: false }
  return k.numeroReservado ? { numero: k.numeroReservado, reservado: true } : { numero: '', reservado: false }
}

/** Separa a lista do servidor: os não utilizados e os reservados em folhas ainda não ligadas (avulsas ou de calibrações excluídas). */
export function separarNumeros(numeros: NumeroReservado[]): { naoUtilizados: NumeroReservado[]; avulsos: NumeroReservado[] } {
  return {
    naoUtilizados: numeros.filter((n) => n.situacao === 'nao_utilizado'),
    avulsos: numeros.filter((n) => n.situacao === 'reservado' && !n.calibracaoId),
  }
}

/** "28/10/2026 às 14:35 · Ana Souza": quando o nº ficou não utilizado (ou foi reservado) e por quem. */
export function quandoDoNumero(n: NumeroReservado): string {
  const em = n.situacao === 'nao_utilizado' && n.situacaoEm ? n.situacaoEm : n.reservadoEm
  const por = n.situacao === 'nao_utilizado' && n.situacaoEm ? n.situacaoPor : n.reservadoPor
  return [dataHora(em), por].filter(Boolean).join(' · ')
}

/**
 * Aviso da ligação de uma folha cujo nº de certificado (impresso nela e talvez já copiado na etiqueta) não vai
 * ser o do certificado: o motivo vem do servidor (revisão, nº já emitido ou não utilizado).
 */
export function avisoNumeroDaFolha(
  daFolha: { numero: string; motivo?: string },
  folha: string,
): { titulo: string; descricao: string } {
  return {
    titulo: `O nº ${daFolha.numero}, impresso na folha ${folha}, não vai ser usado`,
    descricao: [daFolha.motivo?.trim(), 'Se ele foi copiado na etiqueta da balança, corrija a etiqueta.']
      .filter(Boolean)
      .join(' '),
  }
}

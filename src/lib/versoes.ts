// Textos do histórico das versões de um certificado corrigido com o mesmo nº (a faixa da página e o cartão "Versões").

import { dataHora } from './format'

/**
 * Quem corrigiu e quem emitiu uma correção: a correção é de quem a abriu ("Corrigir certificado", com o motivo), que
 * pode não ser quem a emitiu ou, com a revisão ligada, autorizou. "Corrigida por Lizi Martins; emitida em … por Fábio
 * Andrade"; a mesma pessoa (ou o registro sem quem abriu): "Corrigida em … por Fábio Andrade". `genero`: "a" (a versão)
 * ou "o" (o certificado).
 */
export function textoDaCorrecao(
  v: { emitidoEm: string; emitidoPor: string; corrigidaPor?: string },
  genero: 'a' | 'o' = 'a',
): string {
  const quando = v.emitidoEm ? ` em ${dataHora(v.emitidoEm)}` : ''
  const emitiu = v.emitidoPor ? ` por ${v.emitidoPor}` : ''
  const corrigiu = v.corrigidaPor?.trim() ?? ''
  if (corrigiu && corrigiu !== v.emitidoPor) return `Corrigid${genero} por ${corrigiu}; emitid${genero}${quando}${emitiu}`
  return `Corrigid${genero}${quando}${emitiu || (corrigiu ? ` por ${corrigiu}` : '')}`
}

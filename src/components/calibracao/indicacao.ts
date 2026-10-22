import type { CalibracaoInput, EnsaioIndicacao } from '#shared/tipos.ts'

/** Abas do erro de indicação: "antes do ajuste" (como encontrado) e "depois do ajuste" (o ensaio final). */
export type AbaIndicacao = 'antes' | 'depois'

/**
 * Muda o ensaio da aba aberta: "antes do ajuste" é o `comoEncontrado`; "depois" (ou sem ajuste), o erro de
 * indicação final. Cada aba tem os seus pontos, o seu método, o seu retorno ao zero e as suas etapas de
 * substituição, como as duas colunas da folha de campo.
 */
export function mudarEnsaioDaAba(
  s: CalibracaoInput,
  aba: AbaIndicacao,
  mudar: (e: EnsaioIndicacao) => EnsaioIndicacao,
): CalibracaoInput {
  return aba === 'antes' && s.comoEncontrado
    ? { ...s, comoEncontrado: mudar(s.comoEncontrado) }
    : { ...s, indicacao: mudar(s.indicacao) }
}

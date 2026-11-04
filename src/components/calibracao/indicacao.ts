import { leiturasDoMetodo, pontosEmOrdemDeCarga } from '#shared/calibracao.ts'
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

/**
 * Leituras já digitadas nos pontos com carga, nas colunas do método (a escondida não conta): as que "Refazer pontos"
 * apaga. O zero (lido 0 nos pontos sugeridos) não conta.
 */
export function leiturasDigitadas(e: EnsaioIndicacao): number {
  return e.pontos
    .filter((p) => p.carga > 0)
    .reduce((n, p) => {
      const l = leiturasDoMetodo(p, e.metodo)
      return n + (l.crescente !== null ? 1 : 0) + (l.decrescente !== null ? 1 : 0)
    }, 0)
}

/** A pergunta antes de refazer os pontos com leituras digitadas. */
export const textoRefazerPontos = (n: number) =>
  `Refazer os pontos apaga ${n === 1 ? 'a leitura já digitada' : `as ${n} leituras já digitadas`}. Continuar?`

/**
 * "Refazer pontos" troca os pontos pelos sugeridos e apaga as leituras e as cargas mudadas à mão (o rascunho grava
 * sozinho, sem desfazer). Com leituras digitadas, só depois de `confirmarApagar` (com quantas); sem elas, direto.
 */
export async function podeRefazerPontos(
  e: EnsaioIndicacao,
  confirmarApagar: (leituras: number) => Promise<boolean>,
): Promise<boolean> {
  const n = leiturasDigitadas(e)
  return n === 0 || (await confirmarApagar(n))
}

/**
 * O ensaio com os pontos em ordem de carga (`pontosEmOrdemDeCarga`), ao sair do campo da carga: o ponto acrescentado
 * no fim vai para o lugar dele, como no certificado ("cargas crescentes"). O "Decrescente" (só num registro de antes)
 * fica como está. Já em ordem, o mesmo ensaio (nada a gravar).
 */
export function ensaioEmOrdemDeCarga(e: EnsaioIndicacao): EnsaioIndicacao {
  if (e.metodo === 'DECRESCENTE') return e
  const pontos = pontosEmOrdemDeCarga(e.pontos)
  return pontos === e.pontos ? e : { ...e, pontos }
}

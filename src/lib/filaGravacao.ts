/**
 * Gravações uma de cada vez (a gravação automática do rascunho). `salvar()` chamado com uma gravação em andamento
 * espera ela terminar e grava de novo o que ficou pendente, já com a versão nova que ela devolveu: nunca dois PUT
 * ao mesmo tempo com a mesma versão (o segundo voltaria 409, um falso "outra pessoa alterou esta calibração").
 *
 * `gravar` manda o que está pendente agora e diz se deu certo; `pendente` diz se há o que gravar. `salvar()` resolve
 * true quando tudo o que estava pendente até a chamada foi gravado, e false se uma gravação falhou (o que ficou
 * pendente espera a próxima tentativa).
 */
export function criarFilaGravacao(gravar: () => Promise<boolean>, pendente: () => boolean) {
  let emAndamento: Promise<boolean> | null = null
  /** A gravação seguinte, combinada por quem chamou durante a que está em andamento (uma só para todos). */
  let seguinte: Promise<boolean> | null = null

  const salvar = (): Promise<boolean> => {
    if (emAndamento) {
      seguinte ??= emAndamento.then((ok) => {
        seguinte = null
        return ok ? salvar() : false
      })
      return seguinte
    }
    if (!pendente()) return Promise.resolve(true)
    const esta: Promise<boolean> = gravar()
      .catch(() => false)
      .finally(() => {
        if (emAndamento === esta) emAndamento = null
      })
    emAndamento = esta
    return esta
  }

  return {
    salvar,
    /** Há uma gravação em andamento? */
    ocupada: () => emAndamento !== null,
  }
}

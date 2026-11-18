// O que está aberto por cima da tela (a folha que sobe de baixo, a anotação, o PIN, o teclado do app): o voltar do
// Android fecha o de cima, como em qualquer app, em vez de tirar a tela (e o texto digitado nela) de uma vez. Cada
// camada registra a ação do Cancelar/Fechar dela enquanto está aberta; a última registrada é a de cima.

import { useEffect, useRef } from 'react'

const camadas: Array<() => void> = []

/** Registra o que o voltar do Android fecha (a ação do Cancelar/Fechar). Devolve a função que desregistra. */
export function registrarCamada(fechar: () => void): () => void {
  camadas.push(fechar)
  return () => {
    const i = camadas.lastIndexOf(fechar)
    if (i >= 0) camadas.splice(i, 1)
  }
}

/** A ação de fechar da camada de cima; undefined sem nada aberto. */
export const camadaDeCima = (): (() => void) | undefined => camadas.at(-1)

/**
 * Enquanto montado (e com `fechar`), o voltar do Android chama `fechar` em vez de sair da tela. `fechar` é a ação do
 * Cancelar/Fechar de quem está por cima; `null` = nada aberto.
 */
export function useFecharNoVoltar(fechar: (() => void) | null): void {
  const atual = useRef(fechar)
  useEffect(() => {
    atual.current = fechar
  })
  const aberto = fechar !== null
  useEffect(() => {
    if (!aberto) return
    return registrarCamada(() => atual.current?.())
  }, [aberto])
}

// A lógica de teclado dos menus suspensos (Menu de ui/Misc), separada para ser testada sem DOM.

/** Teclas que andam entre os itens do menu aberto. */
const TECLAS = ['ArrowDown', 'ArrowUp', 'Home', 'End']

/**
 * O item que recebe o foco com a tecla: ↓ e ↑ andam em círculo, Home e End vão ao primeiro e ao último; sempre
 * pulando os desabilitados. `atual` -1: nenhum item com o foco (↓ vai ao primeiro, ↑ ao último). -1 = nenhum item
 * habilitado; null = a tecla não é de navegação (o item a trata: Enter e Espaço acionam o botão).
 */
export function proximoIndice(atual: number, tecla: string, desabilitados: readonly boolean[]): number | null {
  if (!TECLAS.includes(tecla)) return null
  const n = desabilitados.length
  const habilitado = (i: number) => !desabilitados[i]
  if (!desabilitados.some((d) => !d)) return -1
  if (tecla === 'Home') return desabilitados.findIndex((d) => !d)
  if (tecla === 'End') return desabilitados.findLastIndex((d) => !d)
  const passo = tecla === 'ArrowDown' ? 1 : -1
  let i = atual < 0 ? (passo > 0 ? -1 : n) : atual
  for (let k = 0; k < n; k++) {
    i = (i + passo + n) % n
    if (habilitado(i)) return i
  }
  return -1
}

/**
 * A rolagem de `alvo` move o gatilho do menu? O painel fica fixo na tela, então só fecha quando a página ou um
 * elemento que contém o gatilho rola; rolar o próprio menu ou outro elemento (o PDF ao lado) não o fecha.
 */
export function rolagemMoveAncora(alvo: EventTarget | null, ancora: Node | null): boolean {
  if (!alvo || !ancora) return false
  const no = alvo as Partial<Node>
  return typeof no.contains === 'function' && no.contains(ancora)
}

/**
 * A linha da lista abre o item pelo teclado com Enter ou Espaço quando o foco está nela (não num botão, link ou menu
 * dentro dela, que respondem sozinhos) e sem Ctrl, Alt ou Meta (atalhos do navegador).
 */
export function deveAbrirPelaTecla(e: {
  key: string
  naPropriaLinha: boolean
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
}): boolean {
  return e.naPropriaLinha && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'Enter' || e.key === ' ')
}

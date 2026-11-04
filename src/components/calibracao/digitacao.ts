// A lógica do campo numérico das leituras (CampoNumero), sem DOM: o valor do texto digitado e a navegação de planilha.

import { numero as lerNumero } from '#shared/dominio.ts'

/**
 * O que o campo grava para o texto digitado: o número do texto inteiro, ou null (vazio ou inválido). Nunca o último
 * número válido da digitação ("11,99525" de "11,99525,00"): o texto fica como foi digitado, em vermelho, e a
 * leitura fica vazia (as pendências do cálculo apontam o que falta).
 */
export function valorDoTexto(texto: string): number | null {
  if (texto.trim() === '') return null
  const n = lerNumero(texto)
  return Number.isNaN(n) ? null : n
}

export interface PosicaoGrade {
  lin: number
  col: number
}

/**
 * Para onde vai o foco na navegação de planilha: o índice em `campos` (-1 = fica onde está). Mesma coluna, linha
 * seguinte (`passo` 1) ou anterior (-1); no fim da coluna, o topo da coluna seguinte (como o técnico lê); com
 * `voltaColuna` (Shift+Enter, o caminho inverso do Enter), no topo, o fim da coluna anterior.
 */
export function alvoNaGrade(campos: readonly PosicaoGrade[], atual: PosicaoGrade, passo: 1 | -1, voltaColuna = false): number {
  const indices = campos.map((_, i) => i)
  const mesmaColuna = indices.filter((i) => campos[i].col === atual.col).sort((a, b) => campos[a].lin - campos[b].lin)
  const i = mesmaColuna.findIndex((j) => campos[j].lin === atual.lin)
  const vizinho = i >= 0 ? mesmaColuna[i + passo] : undefined
  if (vizinho !== undefined) return vizinho
  const porPosicao = (a: number, b: number) => campos[a].col - campos[b].col || campos[a].lin - campos[b].lin
  if (passo > 0) return indices.filter((j) => campos[j].col > atual.col).sort(porPosicao)[0] ?? -1
  if (voltaColuna)
    return (
      indices
        .filter((j) => campos[j].col < atual.col)
        .sort(porPosicao)
        .at(-1) ?? -1
    )
  return -1
}

// O QR code das telas do computador (o pareamento do celular e o endereço do APK), desenhado em SVG com o `uqr` (MIT,
// sem dependências): um caminho só, preto no branco, com a margem que os leitores pedem. Fica preto no branco também no
// modo escuro: a câmera do celular lê melhor assim.

import { useMemo } from 'react'
import { encode } from 'uqr'
import { cn } from '../../lib/cn'

/** O caminho SVG dos módulos escuros (cada linha de módulos seguidos vira um retângulo só). */
function caminhoDoQr(texto: string): { tamanho: number; d: string } {
  const { data, size } = encode(texto, { ecc: 'M', border: 0 })
  const partes: string[] = []
  for (let y = 0; y < size; y++) {
    let x = 0
    while (x < size) {
      if (!data[y][x]) {
        x++
        continue
      }
      const inicio = x
      while (x < size && data[y][x]) x++
      partes.push(`M${inicio} ${y}h${x - inicio}v1h-${x - inicio}z`)
    }
  }
  return { tamanho: size, d: partes.join('') }
}

export function QrCode({
  texto,
  tamanho = 208,
  rotulo,
  className,
}: {
  texto: string
  tamanho?: number
  /** O que o QR leva, para leitores de tela. */
  rotulo: string
  className?: string
}) {
  const { tamanho: n, d } = useMemo(() => caminhoDoQr(texto), [texto])
  const margem = 4
  return (
    <svg
      role="img"
      aria-label={rotulo}
      width={tamanho}
      height={tamanho}
      viewBox={`${-margem} ${-margem} ${n + 2 * margem} ${n + 2 * margem}`}
      shapeRendering="crispEdges"
      className={cn('rounded-xl bg-white', className)}
    >
      <rect x={-margem} y={-margem} width={n + 2 * margem} height={n + 2 * margem} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  )
}

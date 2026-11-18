// Ícones em SVG (traço de 2 px, 24 × 24), no lugar de uma biblioteca: o app fica pequeno e funciona sem internet.

import type { ReactNode } from 'react'

function Svg({ children, tamanho = 24, rotulo }: { children: ReactNode; tamanho?: number; rotulo?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={rotulo ? undefined : true}
      aria-label={rotulo}
      role={rotulo ? 'img' : undefined}
    >
      {children}
    </svg>
  )
}

export const IconeVoltar = () => (
  <Svg>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
)
export const IconeMenu = () => (
  <Svg>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)
export const IconeAtualizar = ({ girando }: { girando?: boolean }) => (
  <span className={girando ? 'inline-block animate-spin' : 'inline-block'}>
    <Svg tamanho={20}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />
    </Svg>
  </span>
)
export const IconeLapis = () => (
  <Svg tamanho={20}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
  </Svg>
)
export const IconeMais = () => (
  <Svg tamanho={20}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IconeCadeado = () => (
  <Svg tamanho={18}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
)
export const IconeQr = () => (
  <Svg>
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
  </Svg>
)
export const IconeSeta = () => (
  <Svg tamanho={20}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
)

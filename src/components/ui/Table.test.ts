// Linhas das listas (Certificados, Clientes, Balanças, Vencimentos, Usuários) pelo teclado: a linha que abre o item
// recebe o foco (Tab) e abre com Enter ou Espaço; a tecla vinda de um botão ou link dentro dela não abre a linha.
// Sem DOM: a decisão da tecla e a linha desenhada no servidor.

import { type ComponentProps, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Linha, Td } from './Table'
import { deveAbrirPelaTecla } from './linhaTeclado'

const linha = (aoClicar?: () => void) =>
  renderToStaticMarkup(
    createElement(
      'table',
      null,
      createElement(
        'tbody',
        null,
        createElement(Linha, { aoClicar } as ComponentProps<typeof Linha>, createElement(Td, null, 'CC-2026-00001')),
      ),
    ),
  )

describe('linha da lista pelo teclado', () => {
  it('Enter e Espaço na própria linha abrem', () => {
    expect(deveAbrirPelaTecla({ key: 'Enter', naPropriaLinha: true })).toBe(true)
    expect(deveAbrirPelaTecla({ key: ' ', naPropriaLinha: true })).toBe(true)
  })

  it('vindo de um botão, link ou menu dentro da linha: não abre (o próprio controle responde)', () => {
    expect(deveAbrirPelaTecla({ key: 'Enter', naPropriaLinha: false })).toBe(false)
    expect(deveAbrirPelaTecla({ key: ' ', naPropriaLinha: false })).toBe(false)
  })

  it('outras teclas e Enter com Ctrl/Alt/Meta (atalhos do navegador): não abre', () => {
    for (const key of ['Tab', 'ArrowDown', 'a', 'Escape']) expect(deveAbrirPelaTecla({ key, naPropriaLinha: true })).toBe(false)
    for (const mod of ['ctrlKey', 'altKey', 'metaKey'] as const)
      expect(deveAbrirPelaTecla({ key: 'Enter', naPropriaLinha: true, [mod]: true })).toBe(false)
  })

  it('a linha que abre o item recebe o foco, com o contorno visível; a que não abre, não', () => {
    const abre = linha(() => {})
    expect(abre).toContain('tabindex="0"')
    expect(abre).toMatch(/class="[^"]*focus-visible:outline-2/)
    const naoAbre = linha()
    expect(naoAbre).not.toContain('tabindex')
    expect(naoAbre).not.toContain('focus-visible:outline-2')
  })
})

// Menus suspensos ("Mais ações", os "…" de Padrões, Balanças, Clientes e Usuários, o menu do usuário) pelo teclado:
// ↑ ↓ Home End entre os itens (pulando os desabilitados), o gatilho com aria-haspopup/aria-expanded, e a rolagem
// que fecha o menu só quando move o gatilho. Sem DOM: a lógica pura e o gatilho desenhado no servidor.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MenuAcoes } from '../usuarios/MenuAcoes'
import { Menu, type PropsGatilhoMenu } from './Misc'
import { proximoIndice, rolagemMoveAncora } from './menuTeclado'

describe('proximoIndice(): ↑ ↓ Home End no menu', () => {
  const nenhum = [false, false, false, false]

  it('↓ e ↑ andam em círculo', () => {
    expect(proximoIndice(0, 'ArrowDown', nenhum)).toBe(1)
    expect(proximoIndice(3, 'ArrowDown', nenhum)).toBe(0)
    expect(proximoIndice(0, 'ArrowUp', nenhum)).toBe(3)
    expect(proximoIndice(2, 'ArrowUp', nenhum)).toBe(1)
  })

  it('Home e End: o primeiro e o último', () => {
    expect(proximoIndice(2, 'Home', nenhum)).toBe(0)
    expect(proximoIndice(0, 'End', nenhum)).toBe(3)
  })

  it('pula os desabilitados (a ação proibida, com o motivo)', () => {
    const desab = [true, false, true, false]
    expect(proximoIndice(1, 'ArrowDown', desab)).toBe(3)
    expect(proximoIndice(3, 'ArrowDown', desab)).toBe(1)
    expect(proximoIndice(1, 'ArrowUp', desab)).toBe(3)
    expect(proximoIndice(3, 'Home', desab)).toBe(1)
    expect(proximoIndice(1, 'End', [false, false, true, true])).toBe(1)
  })

  it('sem foco num item (-1): ↓ vai ao primeiro, ↑ ao último', () => {
    expect(proximoIndice(-1, 'ArrowDown', nenhum)).toBe(0)
    expect(proximoIndice(-1, 'ArrowUp', nenhum)).toBe(3)
  })

  it('todos desabilitados ou sem itens: -1; outra tecla: null (não é de navegação)', () => {
    expect(proximoIndice(0, 'ArrowDown', [true, true])).toBe(-1)
    expect(proximoIndice(-1, 'Home', [])).toBe(-1)
    expect(proximoIndice(0, 'a', nenhum)).toBeNull()
    expect(proximoIndice(0, 'Enter', nenhum)).toBeNull()
  })
})

describe('rolagemMoveAncora(): o menu (fixo na tela) fecha só quando o gatilho se move', () => {
  // Uma árvore de mentira: cada nó conhece o pai
  const no = (pai: { contains: (n: unknown) => boolean } | null) => {
    const n = {
      pai,
      contains(outro: unknown): boolean {
        let x = outro as { pai: unknown } | null
        while (x) {
          if (x === n) return true
          x = x.pai as { pai: unknown } | null
        }
        return false
      },
    }
    return n
  }
  const documento = no(null)
  const main = no(documento)
  const ancora = no(main)
  const iframe = no(main)
  const painel = no(documento)

  it('rolar a página ou o <main> que contém o gatilho: fecha', () => {
    expect(rolagemMoveAncora(documento as unknown as EventTarget, ancora as unknown as Node)).toBe(true)
    expect(rolagemMoveAncora(main as unknown as EventTarget, ancora as unknown as Node)).toBe(true)
  })

  it('rolar o próprio menu ou outro elemento (o PDF ao lado): continua aberto', () => {
    expect(rolagemMoveAncora(painel as unknown as EventTarget, ancora as unknown as Node)).toBe(false)
    expect(rolagemMoveAncora(iframe as unknown as EventTarget, ancora as unknown as Node)).toBe(false)
    expect(rolagemMoveAncora(null, ancora as unknown as Node)).toBe(false)
    expect(rolagemMoveAncora(main as unknown as EventTarget, null)).toBe(false)
  })
})

describe('gatilho do menu', () => {
  it('recebe aria-haspopup, aria-expanded e o id (o painel diz quem o rotula)', () => {
    let recebidas: PropsGatilhoMenu | null = null
    const html = renderToStaticMarkup(
      createElement(Menu, {
        gatilho: (props: PropsGatilhoMenu) => {
          recebidas = props
          return createElement('button', { ...props, type: 'button' }, 'Mais ações')
        },
        itens: [{ label: 'Editar', aoClicar: () => {} }],
      }),
    )
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(recebidas!.id).toBeTruthy()
    expect(typeof recebidas!.onKeyDown).toBe('function')
    expect(typeof recebidas!.onClick).toBe('function')
  })

  it('o "…" de Usuários usa o mesmo menu (com o teclado e os papéis ARIA)', () => {
    const html = renderToStaticMarkup(
      createElement(MenuAcoes, {
        rotulo: 'Ações de Ana',
        itens: [{ label: 'Excluir', aoClicar: () => {}, motivo: 'Você não pode excluir a própria conta' }],
      }),
    )
    expect(html).toContain('aria-label="Ações de Ana"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
  })
})

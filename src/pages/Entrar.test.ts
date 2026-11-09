// O primeiro acesso (criar o administrador): o que a tela diz de quem assina. Desenhado no servidor (sem DOM), como as
// outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PrimeiroAcesso } from './Entrar'

const texto = () =>
  renderToStaticMarkup(createElement(PrimeiroAcesso, { local: true }))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

describe('primeiro acesso', () => {
  it('o administrador nasce técnico e signatário: o nome sai no que ele executar ou autorizar (não "assina tudo")', () => {
    const t = texto()
    expect(t).toContain('Este é o primeiro acesso. Crie a conta do administrador.')
    expect(t).toContain('Sai nos certificados das calibrações que você executar ou autorizar.')
    expect(t).toContain('Lá você marca quem é técnico e quem é signatário.')
    expect(t).not.toMatch(/também assina os certificados|que você autorizar\./)
  })
})

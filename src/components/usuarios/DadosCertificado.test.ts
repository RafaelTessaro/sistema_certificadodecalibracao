// O bloco "No certificado" do cadastro do usuário: com o certificado digital ICP-Brasil da empresa instalado (1.0.7), a
// imagem da assinatura não sai nos certificados (assinados digitalmente), e o cadastro diz isso. Desenhado no servidor
// (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DadosCertificado } from './DadosCertificado'

const bloco = (assinadosDigitalmente?: boolean) =>
  renderToStaticMarkup(
    createElement(DadosCertificado, {
      valor: { tecnico: true, signatario: false, cargo: 'Técnico em metrologia', registro: '', assinatura: '' },
      aoMudar: () => {},
      nome: 'Carlos Eduardo Lima',
      prefixo: 't',
      assinadosDigitalmente,
    }),
  )

describe('a imagem da assinatura no cadastro', () => {
  it('com o certificado digital instalado: "não usada nos certificados assinados digitalmente"', () => {
    expect(bloco(true)).toContain('não usada nos certificados assinados digitalmente')
  })

  it('sem ele, como sempre', () => {
    expect(bloco()).not.toContain('assinados digitalmente')
    expect(bloco(false)).toContain('(opcional)')
  })
})

// E-mails do cliente: a lista digitada ("a@x.com; b@y.com") e o "Para" sugerido no envio do certificado (o e-mail
// para certificados, senão o principal), tirado do cadastro atual do cliente.

import { describe, expect, it } from 'vitest'
import { listaEmails, paraSugerido } from './dominio.ts'

describe('e-mails do cliente', () => {
  it('a lista: separada por vírgula, ponto e vírgula ou espaço, em minúsculas e sem repetição', () => {
    expect(listaEmails(' Qualidade@Mercado.com.br; compras@mercado.com.br,qualidade@mercado.com.br ')).toEqual([
      'qualidade@mercado.com.br',
      'compras@mercado.com.br',
    ])
    expect(listaEmails('')).toEqual([])
  })

  it('o "Para" sugerido: o e-mail para certificados antes do principal; sem nenhum, vazio', () => {
    expect(
      paraSugerido({ email: 'contato@mercado.com.br', emailCertificados: 'Qualidade@mercado.com.br; rh@mercado.com.br' }),
    ).toBe('qualidade@mercado.com.br, rh@mercado.com.br')
    expect(paraSugerido({ email: 'contato@mercado.com.br', emailCertificados: '' })).toBe('contato@mercado.com.br')
    expect(paraSugerido({ email: 'contato@mercado.com.br', emailCertificados: '  ' })).toBe('contato@mercado.com.br')
    expect(paraSugerido({ email: '', emailCertificados: '' })).toBe('')
    expect(paraSugerido(null)).toBe('')
    expect(paraSugerido(undefined)).toBe('')
  })
})

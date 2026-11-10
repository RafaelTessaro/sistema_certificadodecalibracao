// E-mails do cliente: a lista digitada ("a@x.com; b@y.com") e o "Para" sugerido no envio do certificado (o e-mail
// para certificados, senão o principal), tirado do cadastro atual do cliente.

import { describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, balancaNoEmail, CONFIG_PADRAO, listaEmails, paraSugerido, preencherModelo } from './dominio.ts'

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

describe('e-mail do certificado: a balança ({balanca})', () => {
  const prix = {
    ...BALANCA_VAZIA,
    tipo: 'COMPUTADORA' as const,
    fabricante: 'Toledo',
    modelo: 'Prix 4 Uno',
    numeroSerie: '4U-778812',
    tipoFaixas: 'MULTIPLAS' as const,
    faixas: [
      { max: 6, e: 0.002, d: 0.002 },
      { max: 15, e: 0.005, d: 0.005 },
      { max: 32, e: 0.01, d: 0.01 },
    ],
  }
  it('o texto padrão não repete "balança": a descrição vai sem a palavra na frente, com o nº de série', () => {
    const texto = preencherModelo(CONFIG_PADRAO.emailMensagem, {
      numero: 'CC-2026-00002',
      balanca: balancaNoEmail(prix),
      empresa: 'X',
    })
    expect(texto).toContain(
      'Segue em anexo o certificado de calibração nº CC-2026-00002, referente à balança computadora (preço) Toledo Prix 4 Uno — 6/15/32 kg × 2/5/10 g, nº de série 4U-778812.',
    )
    expect(texto).not.toMatch(/balança Balança/i)
    // Sem série: só a descrição
    expect(balancaNoEmail({ ...prix, numeroSerie: '' })).toBe('computadora (preço) Toledo Prix 4 Uno — 6/15/32 kg × 2/5/10 g')
  })
})

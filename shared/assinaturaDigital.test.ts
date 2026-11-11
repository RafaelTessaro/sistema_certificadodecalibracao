// Os textos da assinatura digital (1.0.7): o quadro do PDF assinado e o aviso da prévia, a marca {assinaturaDigital} do
// e-mail do certificado e a linha da verificação pública. O quadro do PDF é congelado (os PDFs assinados são remontados
// byte a byte a partir dos dados da emissão): estes testes pegam qualquer mudança de uma letra.

import { describe, expect, it } from 'vitest'
import {
  CONFIG_PADRAO,
  EMAIL_MENSAGEM_ANTIGA,
  preencherModelo,
  textoAssinaturaDigital,
  textoAssinaturaDigitalEmail,
  textoAssinaturaDigitalVerificacao,
} from './dominio.ts'

const A = { titular: 'FABIO DE GODOY LIMA LTDA', cnpj: '12403843000118' }
const corrido = (partes: Array<{ texto: string }>) => partes.map((p) => p.texto).join('')

describe('o quadro da assinatura digital no PDF', () => {
  it('assinado: o texto exato, com o titular em negrito e o CNPJ com a máscara (nada de "A1")', () => {
    const partes = textoAssinaturaDigital(A)
    expect(corrido(partes)).toBe(
      'Documento assinado digitalmente por FABIO DE GODOY LIMA LTDA, CNPJ 12.403.843/0001-18, com certificado digital ' +
        'ICP-Brasil (MP 2.200-2/2001). Para conferir a assinatura, envie este PDF em validar.iti.gov.br.',
    )
    expect(partes.filter((p) => p.negrito).map((p) => p.texto)).toEqual(['FABIO DE GODOY LIMA LTDA'])
    // Sem quebra de linha no meio do CNPJ, de "ICP-Brasil (MP 2.200-2/2001)" e do endereço do validador
    expect(partes.filter((p) => p.inteira).map((p) => p.texto)).toEqual([
      'CNPJ 12.403.843/0001-18',
      'ICP-Brasil (MP 2.200-2/2001)',
      'validar.iti.gov.br',
    ])
    expect(corrido(partes)).not.toMatch(/\bA1\b|manifesta/i)
  })

  it('prévia (nunca assinada): diz que a emissão sairá assinada', () => {
    expect(corrido(textoAssinaturaDigital(A, true))).toBe(
      'Na emissão, este certificado será assinado digitalmente por FABIO DE GODOY LIMA LTDA, CNPJ 12.403.843/0001-18, ' +
        'com certificado digital ICP-Brasil.',
    )
  })

  it('CNPJ alfanumérico com a máscara; já mascarado, igual; sem CNPJ, sem o trecho', () => {
    expect(corrido(textoAssinaturaDigital({ ...A, cnpj: '12ABC34501DE35' }))).toContain(', CNPJ 12.ABC.345/01DE-35, ')
    expect(corrido(textoAssinaturaDigital({ ...A, cnpj: '12.403.843/0001-18' }))).toContain(', CNPJ 12.403.843/0001-18, ')
    expect(corrido(textoAssinaturaDigital({ ...A, cnpj: '' }))).toBe(
      'Documento assinado digitalmente por FABIO DE GODOY LIMA LTDA, com certificado digital ICP-Brasil (MP 2.200-2/2001). ' +
        'Para conferir a assinatura, envie este PDF em validar.iti.gov.br.',
    )
  })
})

describe('a verificação pública', () => {
  it('"Assinado digitalmente por {TITULAR} (CNPJ …), certificado ICP-Brasil"', () => {
    expect(textoAssinaturaDigitalVerificacao(A)).toBe(
      'Assinado digitalmente por FABIO DE GODOY LIMA LTDA (CNPJ 12.403.843/0001-18), certificado ICP-Brasil',
    )
    expect(textoAssinaturaDigitalVerificacao({ ...A, cnpj: '' })).toBe(
      'Assinado digitalmente por FABIO DE GODOY LIMA LTDA, certificado ICP-Brasil',
    )
  })
})

describe('e-mail do certificado: a marca {assinaturaDigital}', () => {
  const valores = (assinaturaDigital: string) => ({
    numero: 'CC-2026-00002',
    balanca: 'computadora (preço) Toledo Prix 4 Uno — 6/15/32 kg × 2/5/10 g',
    empresa: 'Balanças.com',
    assinaturaDigital,
  })

  it('o texto do certificado assinado: como conferir, e o aviso do Adobe Reader', () => {
    expect(textoAssinaturaDigitalEmail(A)).toBe(
      'O certificado está assinado digitalmente por FABIO DE GODOY LIMA LTDA com certificado ICP-Brasil. Para conferir a ' +
        'assinatura, envie o PDF original (sem imprimir nem converter) em https://validar.iti.gov.br. Se o Adobe Reader ' +
        'mostrar "Pelo menos uma assinatura apresenta problemas" ou "A validade da assinatura é DESCONHECIDA", isso não ' +
        'indica alteração: ele não traz por padrão a raiz ICP-Brasil para este tipo de certificado.',
    )
  })

  it('o modelo padrão tem a marca num parágrafo próprio, depois do anexo', () => {
    expect(CONFIG_PADRAO.emailMensagem).toContain('.\n\n{assinaturaDigital}\n\nQualquer dúvida')
    expect(EMAIL_MENSAGEM_ANTIGA).not.toContain('{assinaturaDigital}')
    expect(CONFIG_PADRAO.emailMensagem.replace('{assinaturaDigital}\n\n', '')).toBe(EMAIL_MENSAGEM_ANTIGA)
  })

  it('sem assinatura digital: a marca some com o parágrafo, sem linhas em branco a mais (igual ao texto de antes)', () => {
    const sem = preencherModelo(CONFIG_PADRAO.emailMensagem, valores(''))
    expect(sem).toBe(preencherModelo(EMAIL_MENSAGEM_ANTIGA, valores('')))
    expect(sem).not.toMatch(/\n\n\n/)
  })

  it('assinado: o parágrafo entra no lugar da marca', () => {
    const texto = preencherModelo(CONFIG_PADRAO.emailMensagem, valores(textoAssinaturaDigitalEmail(A)))
    expect(texto).toContain(`referente à balança ${valores('').balanca}.\n\nO certificado está assinado digitalmente por`)
    expect(texto).toContain('tipo de certificado.\n\nQualquer dúvida, estamos à disposição.')
  })

  it('{assinaturaDigital} vazia sozinha na linha, no começo, no fim ou com espaços em volta: some sem deixar buraco', () => {
    const v = { assinaturaDigital: '', y: 'Y' }
    expect(preencherModelo('{assinaturaDigital}\n\nB', v)).toBe('B')
    expect(preencherModelo('A\n\n{assinaturaDigital}', v)).toBe('A')
    expect(preencherModelo('A\n\n  {assinaturaDigital}  \n\nB', v)).toBe('A\n\nB')
    expect(preencherModelo('A\n{assinaturaDigital}\nB', v)).toBe('A\nB')
    // No meio de uma frase: só a marca sai (sem o espaço que sobraria no fim da linha)
    expect(preencherModelo('Segue o certificado. {assinaturaDigital}\nB', v)).toBe('Segue o certificado.\nB')
    // Com valor, desconhecida ou com texto em volta, como sempre
    expect(preencherModelo('A\n\n{y}\n\nB', v)).toBe('A\n\nY\n\nB')
    expect(preencherModelo('A\n\n{z}\n\nB', v)).toBe('A\n\n{z}\n\nB')
  })

  it('as outras marcas vazias ({os}, {cliente}…) saem como na 1.0.6: o texto de um modelo da empresa não muda', () => {
    // A 1.0.6 só trocava a marca pelo valor
    const v106 = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m))
    const v = { cliente: 'Mercado', os: '', numero: 'CC-2026-00001', empresa: 'Balanças.com', assinaturaDigital: '' }
    for (const modelo of [
      'Olá {cliente},\nOS: {os}\n\nSegue {numero}.\n\n{empresa}',
      'Linha\n{os}\n\nFim',
      '{os}\n\nB',
      'A {os}\n{os} {cliente}',
    ])
      expect(preencherModelo(modelo, v)).toBe(v106(modelo, v))
  })
})

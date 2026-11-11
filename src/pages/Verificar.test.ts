// A conferência pública pelo QR code (sem entrar no sistema): o que a tela diz de cada situação. Desenhado no servidor
// (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { VerificacaoCertificado } from '../lib/api'
import { Resultado } from './Verificar'

const dados = (x: Partial<VerificacaoCertificado>): VerificacaoCertificado => ({
  numero: 'CC-2026-00001',
  status: 'EMITIDO',
  dataCalibracao: '28/10/2026',
  dataEmissao: '30/10/2026',
  cliente: 'Mercado Bom Preço',
  balanca: 'Balança de balcão Toledo 9094',
  numeroSerie: 'TL-2231',
  hashPdf: '',
  ...x,
})
const texto = (d: VerificacaoCertificado) =>
  renderToStaticMarkup(createElement(Resultado, { dados: d, codigo: 'MJ2Q-AAZN' }))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

describe('verificação pública', () => {
  it('versão anterior de um certificado corrigido com o mesmo nº: aponta para a versão que vale', () => {
    const t = texto(dados({ status: 'SUBSTITUIDO', versaoAtualEmitidaEm: '04/11/2026' }))
    expect(t).toContain('substituído por uma versão corrigida')
    expect(t).toContain('versão corrigida, com o mesmo número, emitida em 04/11/2026. Use sempre a mais nova')
  })

  it('a versão corrigida foi cancelada depois: diz que nenhuma versão vale, sem mandar usar "a mais nova"', () => {
    const t = texto(dados({ status: 'SUBSTITUIDO', substitutoCancelado: true }))
    expect(t).toContain('Foi emitido pela Balanças.com, mas depois corrigido e cancelado. Ele não vale mais.')
    expect(t).toContain('Atenção: este certificado não vale mais')
    expect(t).toContain('Nenhuma versão dele serve como comprovante da calibração. Peça à empresa o documento correto.')
    expect(t).not.toMatch(/mais nov[oa]|um novo certificado que corrige/)
  })

  it('a revisão "-R1" de antes (outro nº) e o cancelado continuam com os textos de sempre', () => {
    expect(texto(dados({ status: 'SUBSTITUIDO' }))).toContain(
      'Este certificado foi trocado por uma revisão, um novo certificado que corrige este. Use sempre o mais novo',
    )
    expect(texto(dados({ status: 'CANCELADO' }))).toContain('Atenção: certificado CANCELADO')
    expect(texto(dados({}))).toContain('está registrado no sistema da empresa')
  })

  it('assinado digitalmente (1.0.7): o titular e o CNPJ do certificado ICP-Brasil; sem a assinatura, nada', () => {
    const assinaturaDigital = { titular: 'FABIO DE GODOY LIMA LTDA', cnpj: '12403843000118' }
    const t = texto(dados({ assinaturaDigital }))
    expect(t).toContain('Assinado digitalmente por FABIO DE GODOY LIMA LTDA (CNPJ 12.403.843/0001-18), certificado ICP-Brasil')
    expect(t).toContain('validar.iti.gov.br')
    expect(t).not.toContain('alterada depois da assinatura')
    expect(texto(dados({}))).not.toMatch(/assinado digitalmente|ICP-Brasil/i)
  })

  it('sem carimbo do tempo: o "Indeterminado" do validador depois da validade do certificado que assinou não é alteração', () => {
    const assinaturaDigital = {
      titular: 'FABIO DE GODOY LIMA LTDA',
      cnpj: '12403843000118',
      validoAte: '2046-12-31T23:59:59.000Z',
    }
    const t = texto(dados({ assinaturaDigital }))
    expect(t).toContain('O certificado digital que assinou vale até 31/12/2046.')
    expect(t).toContain('Depois dessa data, o validar.iti.gov.br pode mostrar a assinatura como “Indeterminada”')
    // "continua valendo" soaria como se o certificado valesse (no cancelado, a página diz que ele não vale mais)
    expect(t).toContain(
      'Isso não indica alteração: a impressão digital (SHA-256), logo abaixo, continua servindo para conferir o arquivo.',
    )
    expect(t).not.toContain('continua valendo')
    const cancelado = texto(dados({ status: 'CANCELADO', assinaturaDigital }))
    expect(cancelado).toContain('Ele não vale mais')
    expect(cancelado).not.toContain('continua valendo')
    const vencido = texto(dados({ assinaturaDigital: { ...assinaturaDigital, validoAte: '2020-01-31T12:00:00.000Z' } }))
    expect(vencido).toContain('O certificado digital que assinou venceu em 31/01/2020')
    expect(vencido).toContain('“Indeterminada”')
    // Sem a validade (o certificado que assinou não está mais no banco): só o titular e onde conferir
    expect(texto(dados({ assinaturaDigital: { titular: 'X LTDA', cnpj: '12403843000118' } }))).not.toContain('Indeterminada')
  })

  it('cancelado ou substituído e assinado: a cópia carimbada aparece como alterada depois da assinatura, e isso é esperado', () => {
    const assinaturaDigital = { titular: 'FABIO DE GODOY LIMA LTDA', cnpj: '12403843000118' }
    expect(texto(dados({ status: 'CANCELADO', assinaturaDigital }))).toContain(
      'A cópia marcada CANCELADO aparece nos leitores como alterada depois da assinatura; isso é esperado.',
    )
    expect(texto(dados({ status: 'SUBSTITUIDO', versaoAtualEmitidaEm: '04/11/2026', assinaturaDigital }))).toContain(
      'A cópia marcada SUBSTITUÍDO aparece nos leitores como alterada depois da assinatura; isso é esperado.',
    )
  })
})

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
})

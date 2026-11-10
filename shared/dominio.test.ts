// A inscrição estadual do cliente nas telas como sai no certificado (o PDF a imprime embaixo do CNPJ).

import { describe, expect, it } from 'vitest'
import { inscricaoEstadualNoCertificado } from './dominio.ts'

describe('inscrição estadual como sai no certificado', () => {
  it('em andamento, a do cadastro; no emitido, só a do que saiu com ela (a partir da 1.0.5)', () => {
    const c = { inscricaoEstadual: ' 587229409110 ' }
    expect(inscricaoEstadualNoCertificado(c)).toBe('587229409110')
    expect(inscricaoEstadualNoCertificado(c, { inscricaoEstadualDoCliente: true })).toBe('587229409110')
    expect(inscricaoEstadualNoCertificado(c, {})).toBe('')
    expect(inscricaoEstadualNoCertificado({ inscricaoEstadual: '' })).toBe('')
    expect(inscricaoEstadualNoCertificado(null)).toBe('')
  })
})

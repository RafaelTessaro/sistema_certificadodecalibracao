import { describe, expect, it } from 'vitest'
import { dataCurta, mascaraDocumento, mascaraTelefone, normalizar, relativoDias } from './format'

describe('formatação', () => {
  it('aplica máscaras de CPF, CNPJ e telefone', () => {
    expect(mascaraDocumento('12345678909', 'PF')).toBe('123.456.789-09')
    expect(mascaraDocumento('12403843000118', 'PJ')).toBe('12.403.843/0001-18')
    expect(mascaraTelefone('1930239050')).toBe('(19) 3023-9050')
    expect(mascaraTelefone('19987654321')).toBe('(19) 98765-4321')
  })

  it('busca sem acentos e sem diferenciar maiúsculas', () => {
    expect(normalizar('  Paróquia SÃO José ')).toBe('paroquia sao jose')
  })

  it('formata datas e prazos', () => {
    expect(dataCurta('2026-08-01')).toBe('01/08/2026')
    expect(dataCurta('')).toBe('—')
    expect(relativoDias(3)).toMatch(/3 dias/)
    expect(relativoDias(-1)).toBe('ontem')
    expect(relativoDias(-4)).toBe('há 4 dias')
  })
})

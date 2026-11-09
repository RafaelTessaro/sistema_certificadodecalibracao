import { describe, expect, it } from 'vitest'
import { descricaoBalanca } from '#shared/dominio.ts'
import { balancaNaLista, dataCurta, mascaraDocumento, mascaraTelefone, normalizar, relativoDias } from './format'

describe('formatação', () => {
  it('a balança nas listas: sem "Balança" na frente, com o tipo em maiúscula', () => {
    const b = { tipo: 'PLATAFORMA' as const, fabricante: 'Toledo', modelo: '9094', unidade: 'kg' as const }
    const descricao = descricaoBalanca({ ...b, faixas: [{ max: 30, d: 0.01, e: 0.01 }] })
    expect(descricao).toBe('Balança plataforma Toledo 9094 — 30 kg × 10 g')
    expect(balancaNaLista(descricao)).toBe('Plataforma Toledo 9094 — 30 kg × 10 g')
    expect(balancaNaLista('Balança de balcão / bancada Filizola')).toBe('De balcão / bancada Filizola')
    expect(balancaNaLista('')).toBe('')
  })

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

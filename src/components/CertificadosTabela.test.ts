// A lista das calibrações e dos certificados: a situação de cada linha (com a revisão por outra pessoa desligada, a
// enviada não aguarda a autorização de ninguém) e a balança. Desenhado no servidor (sem DOM), como as outras telas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CalibracaoResumo } from '#shared/tipos.ts'
import { CertificadosTabela } from './CertificadosTabela'

const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const linha = (x: Partial<CalibracaoResumo>): CalibracaoResumo => ({
  id: 'k1',
  versao: 3,
  status: 'REVISAO',
  numero: '',
  revisao: 0,
  clienteId: 'c1',
  clienteNome: 'Mercado Bom Preço',
  balancaId: 'b1',
  balancaDescricao: 'Balança plataforma Toledo 9094 — 30 kg × 10 g',
  balancaSerie: 'TL-2231',
  ordemServico: '5002',
  dataCalibracao: '2026-11-09',
  dataEmissao: '',
  proximaCalibracao: '',
  tecnicoNome: 'Maurício',
  substituiId: '',
  atualizadoEm: '2026-11-09T13:00:00.000Z',
  envios: 0,
  ...x,
})

const tabela = (itens: CalibracaoResumo[]) =>
  texto(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(CertificadosTabela, { itens }))))

describe('lista dos certificados', () => {
  it('a enviada: "Aguardando autorização" de quem; com a revisão por outra pessoa desligada, "Enviada para revisão"', () => {
    expect(tabela([linha({ aguardando: { id: 'fabio', nome: 'Fábio' } })])).toContain('Aguardando autorização de Fábio')
    const desligada = tabela([linha({ semAutorizacao: true })])
    expect(desligada).toContain('Enviada para revisão')
    expect(desligada).not.toMatch(/Aguardando autorização|Aguarda você/)
  })

  it('a balança sem "Balança" na frente, com o tipo em maiúscula', () => {
    expect(tabela([linha({})])).toContain('Plataforma Toledo 9094 — 30 kg × 10 g Série TL-2231')
  })
})

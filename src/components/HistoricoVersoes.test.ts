// O certificado corrigido com o mesmo nº na tela: a lista com uma linha por nº e a anotação "Editado em", e o
// histórico interno das versões no certificado (só a atual vale; as anteriores, marcadas como substituídas).
// Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CalibracaoResumo, VersaoCertificado } from '#shared/tipos.ts'
import { CertificadosTabela } from './CertificadosTabela'
import { HistoricoVersoes } from './HistoricoVersoes'

const html = (no: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, no))
const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const linha = (x: Partial<CalibracaoResumo>): CalibracaoResumo => ({
  id: 'k2',
  versao: 3,
  status: 'EMITIDO',
  numero: 'CC-2026-00002',
  revisao: 1,
  clienteId: 'c1',
  clienteNome: 'Mercado Bom Preço',
  balancaId: 'b1',
  balancaDescricao: 'Balança de balcão Toledo 9094',
  balancaSerie: 'TL-2231',
  ordemServico: 'OS 4471',
  dataCalibracao: '2026-10-28',
  dataEmissao: '2026-11-04',
  proximaCalibracao: '',
  tecnicoNome: 'Carlos',
  substituiId: 'k1',
  atualizadoEm: '2026-11-04T14:00:00.000Z',
  envios: 0,
  ...x,
})

describe('certificado corrigido com o mesmo nº, na tela', () => {
  it('lista: o nº como sempre, com a anotação interna "Editado em"; o não corrigido, "Emitido em"', () => {
    const t = texto(
      html(
        createElement(CertificadosTabela, {
          itens: [
            linha({ editadoEm: '2026-11-04T14:00:00.000Z' }),
            linha({ id: 'k3', numero: 'CC-2026-00003', revisao: 0, substituiId: '', dataEmissao: '2026-10-30' }),
          ],
        }),
      ),
    )
    expect(t).toContain('CC-2026-00002 Editado em 04/11/2026')
    expect(t).toContain('CC-2026-00003 Emitido em 30/10/2026')
    expect(t).not.toMatch(/-R\d/)
  })

  it('lista: a correção em andamento mostra o nº que mantém, sem a data de emissão do certificado corrigido', () => {
    const t = texto(
      html(
        createElement(CertificadosTabela, {
          itens: [
            linha({
              id: 'k4',
              status: 'RASCUNHO',
              numero: '',
              dataEmissao: '',
              numeroCorrigido: 'CC-2026-00003',
              atualizadoEm: '2026-11-04T18:00:00.000Z',
            }),
          ],
        }),
      ),
    )
    expect(t).toContain('CC-2026-00003 (correção) Correção · atualizada em 04/11/2026')
    expect(t).not.toContain('Emitido em')
    expect(t).not.toContain('Em andamento')
  })

  it('lista: na aba "Substituídos", a versão anterior de um corrigido com o mesmo nº vem marcada', () => {
    const t = texto(
      html(
        createElement(CertificadosTabela, {
          itens: [linha({ id: 'k1', status: 'SUBSTITUIDO', versaoAnterior: true, dataEmissao: '2026-10-30' })],
        }),
      ),
    )
    expect(t).toContain('CC-2026-00002 Versão anterior · emitida em 30/10/2026')
  })

  it('histórico: cada versão com quando, quem e o motivo; só a atual vale', () => {
    const versoes: VersaoCertificado[] = [
      { id: 'k1', versao: 1, status: 'SUBSTITUIDO', emitidoEm: '2026-10-30T13:00:00.000Z', emitidoPor: 'Ana', motivo: '' },
      {
        id: 'k2',
        versao: 2,
        status: 'EMITIDO',
        emitidoEm: '2026-11-04T14:00:00.000Z',
        emitidoPor: 'Bruno',
        motivo: 'Número de série da balança digitado errado',
      },
    ]
    const h = html(createElement(HistoricoVersoes, { versoes, atualId: 'k2' }))
    const t = texto(h)
    expect(t).toContain('Versões deste certificado')
    expect(t).toContain('Só no sistema: o cliente recebe sempre o mesmo número.')
    // A mais nova primeiro: a atual, com o motivo da correção; a anterior, substituída, com o link para ela
    expect(t).toMatch(
      /Versão 2 atual PDF Corrigida em 04\/11\/2026 .* por Bruno Motivo: Número de série da balança digitado errado/,
    )
    expect(t).toMatch(/Versão 1 substituída PDF Emitida em 30\/10\/2026 .* por Ana Ver esta versão/)
    expect(t.indexOf('Versão 2')).toBeLessThan(t.indexOf('Versão 1'))
    // O PDF de cada versão (a anterior sai com a marca "substituído", pelo servidor)
    expect(h).toContain('href="/api/calibracoes/k1/pdf"')
    expect(h).toContain('href="/api/calibracoes/k2/pdf"')
    expect(h).toContain('href="/calibracoes/k1"')
    expect(h).not.toContain('href="/calibracoes/k2"')
  })
})

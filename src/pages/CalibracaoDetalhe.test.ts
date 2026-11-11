// A ficha do certificado emitido que ainda aguarda a assinatura digital (1.0.7): o servidor não entrega o PDF (nem o
// anexa ao e-mail) até assinar, então "Baixar PDF", "Imprimir", "Enviar por e-mail" e o "Enviar" do cartão "Envios por
// e-mail" ficam desativados, com o motivo, em vez de dar a recusa do servidor; o mesmo no PDF da lista de versões.
// Desenhado no servidor (sem DOM).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { VersaoCertificado } from '#shared/tipos.ts'
import { HistoricoVersoes } from '../components/HistoricoVersoes'
import { AcoesDoPdf, BotaoEnviarDosEnvios } from './CalibracaoDetalhe'

/** O botão com o rótulo: desativado e o título. */
function botao(html: string, rotulo: string) {
  const b = html.match(new RegExp(`<button([^>]*)>(?:(?!</button>)[\\s\\S])*?${rotulo}`))
  if (!b) throw new Error(`sem o botão "${rotulo}"`)
  return { desativado: /\sdisabled=""/.test(b[1]), titulo: b[1].match(/\stitle="([^"]*)"/)?.[1] ?? null }
}
const acoes = (o: { emitido?: boolean; aguardandoAssinatura?: boolean }) =>
  renderToStaticMarkup(
    createElement(AcoesDoPdf, {
      emitido: o.emitido ?? true,
      aguardandoAssinatura: o.aguardandoAssinatura ?? false,
      urlBaixar: '/api/calibracoes/k1/pdf?baixar=1',
      aoImprimir: () => {},
      aoEnviar: () => {},
    }),
  )

describe('o certificado que aguarda a assinatura digital', () => {
  it('"Baixar PDF", "Imprimir" e "Enviar por e-mail" ficam desativados, com o motivo', () => {
    const html = acoes({ aguardandoAssinatura: true })
    for (const rotulo of ['Baixar PDF', 'Imprimir', 'Enviar por e-mail']) {
      const b = botao(html, rotulo)
      expect(b.desativado, rotulo).toBe(true)
      expect(b.titulo, rotulo).toMatch(/^Aguardando a assinatura digital: /)
    }
    expect(botao(html, 'Enviar por e-mail').titulo).toContain('enviado por e-mail')
    expect(html).not.toContain('href=')
  })

  it('assinado (ou sem assinatura digital): baixar, imprimir e enviar normalmente', () => {
    const html = acoes({})
    expect(html).toContain('href="/api/calibracoes/k1/pdf?baixar=1"')
    for (const rotulo of ['Baixar PDF', 'Imprimir', 'Enviar por e-mail']) expect(botao(html, rotulo).desativado).toBe(false)
    expect(html).not.toContain('Aguardando')
    // Cancelado ou substituído: a cópia baixa e imprime, mas não vai por e-mail
    expect(acoes({ emitido: false })).not.toContain('Enviar por e-mail')
  })

  it('o "Enviar" do cartão "Envios por e-mail" também fica desativado, com o motivo (o modal daria a recusa do servidor)', () => {
    const cartao = (aguardandoAssinatura: boolean) =>
      renderToStaticMarkup(createElement(BotaoEnviarDosEnvios, { aguardandoAssinatura, aoEnviar: () => {} }))
    const aguardando = botao(cartao(true), 'Enviar')
    expect(aguardando.desativado).toBe(true)
    expect(aguardando.titulo).toMatch(/^Aguardando a assinatura digital: .*enviado por e-mail/)
    // O mesmo motivo do "Enviar por e-mail" do alto da ficha
    expect(aguardando.titulo).toBe(botao(acoes({ aguardandoAssinatura: true }), 'Enviar por e-mail').titulo)
    expect(botao(cartao(false), 'Enviar')).toEqual({ desativado: false, titulo: null })
  })

  it('na lista de versões, o PDF da versão que aguarda a assinatura não abre (com o motivo)', () => {
    const versao = (x: Partial<VersaoCertificado>): VersaoCertificado => ({
      id: 'v1',
      versao: 1,
      status: 'SUBSTITUIDO',
      emitidoEm: '2026-11-04T10:00:00.000Z',
      emitidoPor: 'Admin Teste',
      motivo: '',
      ...x,
    })
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(HistoricoVersoes, {
          atualId: 'v2',
          versoes: [
            versao({}),
            versao({ id: 'v2', versao: 2, status: 'EMITIDO', motivo: 'Endereço', aguardandoAssinatura: true }),
          ],
        }),
      ),
    )
    // A anterior abre; a atual, não
    expect(html).toContain('href="/api/calibracoes/v1/pdf"')
    expect(html).not.toContain('href="/api/calibracoes/v2/pdf"')
    expect(html).toMatch(/title="Aguardando a assinatura digital: [^"]*"[^>]*>PDF/)
  })
})

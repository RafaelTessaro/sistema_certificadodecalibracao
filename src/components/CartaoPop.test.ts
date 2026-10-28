// POP em Configurações: uma revisão registrada sem o arquivo recebe o arquivo também depois de substituída
// (é o documento dos certificados emitidos com ela), e a janela da revisão nova avisa quando a vigente está
// sem ele. Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ArquivoAnexo, VersaoPop } from '#shared/tipos.ts'

// Sem DOM: a janela (portal no document.body) sai como o conteúdo dela, no lugar
vi.mock('./ui/Modal', () => ({
  Modal: ({ aberto, children, rodape }: { aberto: boolean; children: ReactNode; rodape?: ReactNode }) =>
    aberto ? createElement('div', { 'data-janela': '' }, children, rodape) : null,
}))
// O cartão lê o POP pela consulta: aqui, as revisões do cenário
const consulta = vi.hoisted(() => ({ dados: null as unknown }))
vi.mock('../lib/consulta', () => ({
  useConsulta: () => ({ dados: consulta.dados, carregando: false, erro: '', atualizando: false, recarregar: () => {} }),
}))

const { CartaoPop, LinhaRevisao, RegistrarPopModal } = await import('./CartaoPop')

const ARQUIVO: ArquivoAnexo = {
  sha256: 'a'.repeat(64),
  nome: 'POP rev 01.pdf',
  tamanho: 120_000,
  tipo: 'application/pdf',
  enviadoEm: '2026-11-03T12:00:00.000Z',
}

function versao(revisao: string, x: Partial<VersaoPop> = {}): VersaoPop {
  return {
    id: Number(revisao) + 1,
    codigo: 'BALANÇAS-POP-123',
    revisao,
    data: '2026-10-28',
    arquivo: null,
    observacao: '',
    criadoEm: '2026-10-28T12:00:00.000Z',
    criadoPor: 'Fábio de Godoy Lima',
    vigente: false,
    ...x,
  }
}

const html = (no: ReturnType<typeof createElement>) => renderToStaticMarkup(no)

describe('revisões anteriores do POP', () => {
  it('sem o arquivo: avisa e oferece anexar (o seletor só aceita os tipos do POP)', () => {
    const t = html(createElement(LinhaRevisao, { v: versao('00'), aoAnexar: () => {} }))
    expect(t).toContain('BALANÇAS-POP-123 rev. 00')
    expect(t).toContain('sem arquivo')
    expect(t).toMatch(/<button[^>]*type="button"[^>]*>.*Anexar o arquivo<\/button>/)
    expect(t).toMatch(/<input[^>]*type="file"[^>]*accept="[^"]*\.pdf/)
    expect(t).toContain('o dos certificados emitidos com esta revisão')
  })

  it('enviando: o botão fica desabilitado', () => {
    const t = html(createElement(LinhaRevisao, { v: versao('00'), anexando: true, aoAnexar: () => {} }))
    expect(t).toMatch(/<button[^>]*disabled=""[^>]*>.*Enviando…<\/button>/)
  })

  it('com o arquivo: o link para abrir, sem o botão de anexar', () => {
    const t = html(createElement(LinhaRevisao, { v: versao('00', { arquivo: ARQUIVO }), aoAnexar: () => {} }))
    expect(t).toContain(`/api/arquivos/${ARQUIVO.sha256}`)
    expect(t).not.toContain('Anexar o arquivo')
    expect(t).not.toContain('sem arquivo')
  })

  it('no cartão: a revisão substituída sem o arquivo aparece com o aviso no resumo e o botão de anexar', () => {
    const atual = versao('01', { arquivo: ARQUIVO, vigente: true })
    const anterior = versao('00')
    consulta.dados = { atual, versoes: [atual, anterior] }
    const t = html(createElement(CartaoPop))
    expect(t).toContain('Revisões anteriores (1)')
    expect(t).toContain('1 sem arquivo')
    expect(t.match(/Anexar o arquivo<\/button>/g)?.length).toBe(1)
    // Todas com o arquivo: nada de aviso
    consulta.dados = { atual, versoes: [atual, versao('00', { arquivo: ARQUIVO })] }
    const tudo = html(createElement(CartaoPop))
    expect(tudo).toContain('Revisões anteriores (1)')
    expect(tudo).not.toContain('sem arquivo')
  })
})

describe('registrar nova revisão do POP', () => {
  const janela = (atual: VersaoPop | null) => html(createElement(RegistrarPopModal, { aberto: true, aoFechar: () => {}, atual }))

  it('a vigente sem o arquivo: avisa que os certificados emitidos com ela ficam sem o documento', () => {
    const t = janela(versao('00', { vigente: true }))
    expect(t).toContain('A revisão vigente (<span class="tnum">BALANÇAS-POP-123 rev. 00</span>) ainda não tem o arquivo.')
    expect(t).toContain('Os certificados emitidos com ela ficam sem o documento.')
    expect(t).toContain('“Revisões anteriores”')
  })

  it('a vigente com o arquivo, ou o primeiro registro: sem o aviso', () => {
    expect(janela(versao('00', { vigente: true, arquivo: ARQUIVO }))).not.toContain('ainda não tem o arquivo')
    expect(janela(null)).not.toContain('ainda não tem o arquivo')
  })
})

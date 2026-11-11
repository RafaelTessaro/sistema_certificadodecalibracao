// A aba "Folhas de campo" da página Certificados: a tabela das folhas impressas (para quem, o nº de certificado
// impresso, a situação com o link da calibração e o botão de reimprimir) e o link da lista dos números não utilizados
// para ela. Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { FolhaCampoListada, NumeroReservado } from '#shared/tipos.ts'
import { TabelaFolhas } from './FolhasCampoLista'
import { ListaNumeros } from './NumerosNaoUtilizados'

const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const folha = (x: Partial<FolhaCampoListada>): FolhaCampoListada => ({
  numero: 'FC-2026-00042',
  origem: 'avulsa',
  clienteNome: 'Mercado Bom Preço',
  balancaDescricao: '',
  balancaSerie: '',
  ordemServico: '',
  numeroCertificado: 'CC-2026-00107',
  situacaoNumero: 'reservado',
  impressaEm: '2026-11-09T13:05:00.000Z',
  impressaPor: 'Lizi',
  impressoes: 1,
  situacao: 'nao_ligada',
  ...x,
})

const tabela = (itens: FolhaCampoListada[]) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(TabelaFolhas, { itens })))

describe('aba "Folhas de campo"', () => {
  it('cada folha com o cliente, a balança, o nº do certificado impresso, a situação e o botão de reimprimir', () => {
    const h = tabela([
      folha({
        numero: 'FC-2026-00044',
        origem: 'calibracao',
        balancaDescricao: 'Balança comercial Toledo 9094 — 30 kg',
        balancaSerie: 'TL-2231',
        numeroCertificado: 'CC-2026-00109',
        situacaoNumero: 'emitido',
        situacao: 'ligada',
        calibracao: { id: 'k1', status: 'EMITIDO', numero: 'CC-2026-00109', clienteNome: 'Mercado Bom Preço' },
      }),
      folha({ numero: 'FC-2026-00043', ordemServico: 'OS 2026/0777' }),
      folha({ numero: 'FC-2026-00042', clienteNome: '', numeroCertificado: '', situacaoNumero: undefined }),
    ])
    const t = texto(h)
    for (const coluna of ['Folha', 'Cliente', 'Balança', 'Nº do certificado', 'Situação']) expect(t).toContain(coluna)
    // A ligada: a balança, o nº emitido e o link para o certificado
    expect(t).toContain('FC-2026-00044 09/11/2026 · Lizi')
    // O tipo abre o texto com maiúscula (como na lista dos certificados)
    expect(t).toContain('Comercial Toledo 9094 — 30 kg Série TL-2231')
    expect(t).toContain('CC-2026-00109 emitido')
    expect(h).toContain('href="/calibracoes/k1"')
    expect(t).toContain('Ligada CC-2026-00109')
    // A do cliente com a OS, não ligada; a em branco, sem nº de certificado (impressa antes da reserva do nº)
    expect(t).toContain('Mercado Bom Preço OS 2026/0777')
    expect(t).toContain('CC-2026-00107 reservado')
    expect(t).toContain('Não ligada')
    expect(t).toContain('Em branco')
    // Reimprimir em cada linha, dizendo que é igual à primeira impressão
    expect(h.match(/aria-label="Reimprimir a folha FC-2026-0004\d"/g)).toHaveLength(3)
    expect(h).toContain('title="Reimprimir a folha FC-2026-00043 (igual à impressa em 09/11/2026)"')
  })

  it('o rascunho abre a edição; a substituída diz qual ficou no lugar; a que não vai ser usada, o motivo', () => {
    const h = tabela([
      folha({
        situacao: 'ligada',
        clienteNome: '',
        calibracao: { id: 'k2', status: 'RASCUNHO', numero: '', clienteNome: 'Padaria Sol' },
      }),
      folha({ numero: 'FC-2026-00041', situacao: 'substituida', substituidaPor: 'FC-2026-00042' }),
      folha({ numero: 'FC-2026-00040', situacao: 'descartada', situacaoNumero: 'nao_utilizado', motivo: 'Molhou na chuva.' }),
    ])
    const t = texto(h)
    expect(h).toContain('href="/calibracoes/k2/editar"')
    expect(t).toContain('Padaria Sol Impressa em branco')
    expect(t).toContain('Ligada Rascunho')
    expect(t).toContain('Substituída Trocada pela FC-2026-00042')
    expect(t).toContain('Não vai ser usada Molhou na chuva.')
    expect(t).toContain('não utilizado')
  })

  it('a folha impressa sem a balança, ligada: a balança da calibração, dizendo que a folha saiu sem ela', () => {
    const t = texto(
      tabela([
        folha({
          situacao: 'ligada',
          numeroCertificado: 'CC-2026-00002',
          situacaoNumero: 'emitido',
          calibracao: {
            id: 'k3',
            status: 'EMITIDO',
            numero: 'CC-2026-00002',
            clienteNome: 'Mercado Bom Preço',
            balancaDescricao: 'Balança computadora (preço) Toledo Prix 4 Uno — 6/15/32 kg × 2/5/10 g',
            balancaSerie: '4U-778812',
          },
        }),
      ]),
    )
    expect(t).toContain('Computadora (preço) Toledo Prix 4 Uno — 6/15/32 kg × 2/5/10 g Série 4U-778812 · Impressa sem a balança')
    expect(t).not.toContain('Em branco')
    // O certificado ligado é o que vale (a correção, com o mesmo nº): sem "(substituído)"
    expect(t).toContain('Ligada CC-2026-00002')
    expect(t).not.toContain('substituído')
  })

  it('a primeira impressão que não terminou: diz o que fazer e não oferece "Reimprimir"', () => {
    const h = tabela([folha({ impressaoInterrompida: true })])
    expect(texto(h)).toContain('Não ligada A impressão não terminou')
    expect(h).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Reimprimir a folha FC-2026-00042"|<button[^>]*aria-label="Reimprimir a folha FC-2026-00042"[^>]*disabled=""/,
    )
    expect(h).toContain('title="A primeira impressão não terminou (o sistema foi interrompido), então a folha não saiu no papel.')
  })
})

describe('Números não utilizados → aba "Folhas de campo"', () => {
  const avulso: NumeroReservado = {
    id: 3,
    numero: 'CC-2026-00044',
    ano: 2026,
    sequencia: 44,
    calibracaoId: '',
    folha: 'FC-2026-00011',
    reservadoEm: '2026-10-20T16:05:00.000Z',
    reservadoPor: 'Ana',
    situacao: 'reservado',
    motivo: '',
    situacaoEm: '',
    situacaoPor: '',
  }

  it('o link "Ver todas as folhas de campo" junto dos reservados em folhas não ligadas (só quando a página o oferece)', () => {
    const com = renderToStaticMarkup(createElement(ListaNumeros, { numeros: [avulso], aoVerFolhas: () => {} }))
    expect(texto(com)).toContain('Reservados em folhas ainda não ligadas Ver todas as folhas de campo')
    const sem = renderToStaticMarkup(createElement(ListaNumeros, { numeros: [avulso] }))
    expect(texto(sem)).not.toContain('Ver todas as folhas de campo')
  })
})

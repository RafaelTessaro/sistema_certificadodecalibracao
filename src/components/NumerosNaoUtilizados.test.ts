// Os nºs de certificado na tela: o selo do editor, o nº nas listas (com "(reservado)") e a lista recolhida dos
// não utilizados na página Certificados. Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NumeroReservado } from '#shared/tipos.ts'
import { NumeroDaLinha } from './CertificadosTabela'
import { ListaNumeros } from './NumerosNaoUtilizados'
import { SeloNumeroReservado } from './SeloNumeroReservado'

const html = (no: ReturnType<typeof createElement>) => renderToStaticMarkup(no)
const texto = (h: string) => h.replace(/<[^>]+>/g, '')

const numero = (x: Partial<NumeroReservado>): NumeroReservado => ({
  id: 1,
  numero: 'CC-2026-00042',
  ano: 2026,
  sequencia: 42,
  calibracaoId: '',
  folha: 'FC-2026-00010',
  reservadoEm: '2026-10-20T13:05:00',
  reservadoPor: 'Ana',
  situacao: 'reservado',
  motivo: '',
  situacaoEm: '',
  situacaoPor: '',
  ...x,
})

describe('nº de certificado na tela', () => {
  it('editor: "Certificado nº … (reservado)", com a folha em que foi reservado', () => {
    const h = html(createElement(SeloNumeroReservado, { n: numero({}) }))
    expect(texto(h)).toBe('Certificado nº CC-2026-00042 (reservado)')
    expect(h).toContain('Na folha de campo FC-2026-00010. Reservado em 20/10/2026 às 13:05 por Ana.')
  })

  it('lista: o emitido; em andamento, o reservado com "(reservado)"; sem nº, "Em andamento"', () => {
    expect(texto(html(createElement(NumeroDaLinha, { k: { numero: 'CC-2026-00001' } })))).toBe('CC-2026-00001')
    const reservado = html(createElement(NumeroDaLinha, { k: { numero: '', numeroReservado: 'CC-2026-00042' } }))
    expect(texto(reservado)).toBe('CC-2026-00042(reservado)')
    expect(reservado).toContain('title="Certificado nº CC-2026-00042 (reservado)"')
    expect(texto(html(createElement(NumeroDaLinha, { k: { numero: '' } })))).toBe('Em andamento')
  })

  it('Números não utilizados: o nº, o motivo e quando; os reservados em folhas não ligadas à parte; nada quando não há', () => {
    expect(html(createElement(ListaNumeros, { numeros: [] }))).toBe('')
    // Só o reservado de uma calibração (aparece na lista dela): nada aqui
    expect(html(createElement(ListaNumeros, { numeros: [numero({ calibracaoId: 'k1' })] }))).toBe('')
    const lista = [
      numero({
        id: 2,
        numero: 'CC-2026-00043',
        situacao: 'nao_utilizado',
        motivo: 'A folha FC-2026-00012 foi ligada à correção do certificado CC-2026-00001, que sai com o mesmo nº dele.',
        situacaoEm: '2026-10-21T08:30:00',
        situacaoPor: 'Bruno',
      }),
      numero({ id: 3, numero: 'CC-2026-00044', folha: 'FC-2026-00011' }),
    ]
    const h = texto(html(createElement(ListaNumeros, { numeros: lista })))
    expect(h).toContain('Números não utilizados (1)')
    expect(h).toContain('1 reservado em folha não ligada')
    expect(h).toContain(
      'CC-2026-00043A folha FC-2026-00012 foi ligada à correção do certificado CC-2026-00001, que sai com o mesmo nº dele.21/10/2026 às 08:30 · Bruno',
    )
    expect(h).toContain('Reservados em folhas ainda não ligadas')
    expect(h).toContain(
      'CC-2026-00044Folha FC-2026-00011: o nº passa para a calibração a que ela for ligada.Reservado em 20/10/2026 às 13:05 · Ana',
    )
    // O botão de descartar só para quem pode
    expect(h).not.toContain('Não vai ser usada')
    const admin = html(createElement(ListaNumeros, { numeros: lista, podeDescartar: true, aoDescartar: () => {} }))
    expect(texto(admin)).toContain('Não vai ser usada')
    // No celular, a linha da folha não ligada empilha o nº, o texto e o botão (a grade só a partir de sm): o texto
    // nunca fica espremido entre eles; o nº da folha não quebra no hífen
    const linhas = [...admin.matchAll(/<li class="([^"]*)"/g)].map((m) => m[1])
    expect(linhas).toHaveLength(2)
    for (const c of linhas) {
      expect(c.split(' ')).toContain('grid')
      expect(c).toMatch(/(^| )sm:grid-cols-\[/)
      expect(c).not.toMatch(/(^| )(flex|flex-wrap|grid-cols-\[)/)
    }
    expect(linhas[1]).toContain('sm:grid-cols-[minmax(132px,auto)_minmax(0,1fr)_auto]')
    expect(admin).not.toContain('flex-1')
    expect(admin).toContain('<span class="tnum whitespace-nowrap">FC-2026-00011</span>')
  })

  it('folha ainda não ligada: reimprimir (para todos), com o cliente e a OS para achar o papel', () => {
    const lista = [
      numero({
        id: 3,
        numero: 'CC-2026-00044',
        folha: 'FC-2026-00011',
        folhaCliente: 'Mercado Bom Preço',
        folhaOs: 'OS 2026/0777',
      }),
      numero({ id: 4, numero: 'CC-2026-00045', folha: 'FC-2026-00012' }),
      // O não utilizado não se reimprime (a folha foi perdida ou inutilizada)
      numero({ id: 5, numero: 'CC-2026-00046', situacao: 'nao_utilizado', motivo: 'Folha molhada na chuva.' }),
    ]
    const h = html(createElement(ListaNumeros, { numeros: lista, aoReimprimir: () => {} }))
    expect(texto(h)).toContain(
      'Folha FC-2026-00011: o nº passa para a calibração a que ela for ligada.Mercado Bom Preço · OS 2026/0777Reservado em',
    )
    // Uma vez em cada folha não ligada, com o nº da folha na dica
    expect(texto(h).match(/Reimprimir/g)).toHaveLength(2)
    expect(h).toContain('title="Reimprimir a folha FC-2026-00012, igual à primeira impressão (os mesmos nºs)"')
    // Sem quem reimprime (ou sem nada a fazer), nem o grupo dos botões
    const sem = html(createElement(ListaNumeros, { numeros: lista }))
    expect(texto(sem)).not.toContain('Reimprimir')
    // O administrador vê os dois botões, lado a lado
    const admin = texto(
      html(createElement(ListaNumeros, { numeros: lista, aoReimprimir: () => {}, podeDescartar: true, aoDescartar: () => {} })),
    )
    expect(admin).toContain('ReimprimirNão vai ser usada')
  })
})

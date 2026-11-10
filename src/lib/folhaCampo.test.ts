import { describe, expect, it, vi } from 'vitest'
import { api, chaveFolhaAvulsa, JANELA_FOLHA_AVULSA_MS } from './api'
import {
  abrirFolhaCampo,
  dataDaFolha,
  TEXTO_FOLHA_NOVA,
  textoBarometrosRetirados,
  textoReimprimir,
  textosOsDaFolha,
} from './folhaCampo'

describe('textos da folha de campo', () => {
  it('reimprimir diz o nº e o dia da primeira impressão (o mesmo nº é o mesmo papel)', () => {
    expect(textoReimprimir({ numero: 'FC-2026-00042', impressaEm: '2026-10-21T15:00:00.000Z' })).toBe(
      'Reimprimir a folha FC-2026-00042 (igual à impressa em 21/10/2026)',
    )
    expect(TEXTO_FOLHA_NOVA).toBe('Imprimir folha nova com os dados atuais')
  })

  it('data inválida não quebra o texto', () => {
    expect(dataDaFolha('')).toBe('—')
    expect(dataDaFolha('ontem')).toBe('—')
  })
})

describe('a OS impressa na folha do cliente, ao ligar a folha', () => {
  it('passou para a calibração: "A OS …" sem repetir o "OS" de quem já o escreveu', () => {
    expect(textosOsDaFolha({ daFolha: 'OS 2026/0999', aplicada: true }).aplicada).toBe(
      'A OS 2026/0999, impressa na folha, passou para esta calibração.',
    )
    expect(textosOsDaFolha({ daFolha: '2026/0999', aplicada: true }).aplicada).toBe(
      'A OS 2026/0999, impressa na folha, passou para esta calibração.',
    )
    expect(textosOsDaFolha({ daFolha: 'OS 1', aplicada: true }).diferente).toBeUndefined()
  })

  it('a folha saiu com outra OS: as duas sem "OS OS"', () => {
    const t = textosOsDaFolha({ daFolha: '777', aplicada: false, daCalibracao: 'OS 5555' })
    expect(t.diferente).toBe('A folha saiu com a OS 777; esta calibração ficou com a OS 5555.')
    expect(t.aplicada).toBeUndefined()
    expect(textosOsDaFolha({ daFolha: 'os 777', aplicada: false, daCalibracao: '5555' }).diferente).toBe(
      'A folha saiu com a os 777; esta calibração ficou com a OS 5555.',
    )
  })

  it('sem OS na folha: nada a dizer', () => {
    expect(textosOsDaFolha(null)).toEqual({})
    expect(textosOsDaFolha(undefined)).toEqual({})
  })
})

describe('a folha de antes da 1.0.5 tirou o barômetro dos padrões', () => {
  it('diz qual saiu, por quê e o que fazer se a pressão foi medida', () => {
    expect(textoBarometrosRetirados(['BR-01'])).toEqual({
      titulo: 'O barômetro saiu dos padrões',
      texto:
        'A folha foi impressa antes da versão 1.0.5, quando a pressão era opcional: o BR-01 saiu dos padrões, e a falta da pressão fica só como aviso. Se a pressão foi medida, registre-a e escolha o barômetro de novo em Padrões e ambiente.',
    })
    expect(textoBarometrosRetirados(['BR-01', 'BR-02']).titulo).toBe('Os barômetros saíram dos padrões')
    expect(textoBarometrosRetirados(['BR-01', 'BR-02']).texto).toContain('os BR-01 e BR-02 saíram dos padrões')
  })
})

describe('folha avulsa: o clique duplo não reserva dois nºs (nem abre duas abas)', () => {
  it('o mesmo pedido em poucos segundos usa a mesma chave (o servidor devolve a mesma folha); outro pedido, outra', () => {
    const a = chaveFolhaAvulsa('cliente=c1&os=4550', 1_000)
    expect(chaveFolhaAvulsa('cliente=c1&os=4550', 1_400)).toBe(a)
    expect(chaveFolhaAvulsa('cliente=c1&os=4550', 1_000 + JANELA_FOLHA_AVULSA_MS - 1)).toBe(a)
    // Passada a janela, é outra folha (outro nº), como pedir de novo
    const b = chaveFolhaAvulsa('cliente=c1&os=4550', 1_000 + JANELA_FOLHA_AVULSA_MS + 1)
    expect(b).not.toBe(a)
    // Outros dados (a OS mudou, outro cliente), outra folha
    expect(chaveFolhaAvulsa('cliente=c1&os=4551', 1_000 + JANELA_FOLHA_AVULSA_MS + 2)).not.toBe(b)
  })

  it('pela URL: dois cliques seguidos geram a mesma URL da folha', () => {
    const u1 = api.urlFolhaCampoAvulsa({ clienteId: 'c9', ordemServico: '4550', data: '2026-11-09' })
    const u2 = api.urlFolhaCampoAvulsa({ clienteId: 'c9', ordemServico: '4550', data: '2026-11-09' })
    expect(u2).toBe(u1)
    expect(api.urlFolhaCampoAvulsa({ clienteId: 'c9', ordemServico: '4551', data: '2026-11-09' })).not.toBe(u1)
  })

  it('a mesma URL aberta de novo logo em seguida não abre outra aba', async () => {
    const abertas: string[] = []
    vi.stubGlobal('window', { open: (url: string) => (abertas.push(url), null) })
    try {
      await abrirFolhaCampo('/api/folha-campo?chave=k1')
      await abrirFolhaCampo('/api/folha-campo?chave=k1')
      await abrirFolhaCampo('/api/folha-campo?chave=k2')
      expect(abertas).toEqual(['/api/folha-campo?chave=k1', '/api/folha-campo?chave=k2'])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

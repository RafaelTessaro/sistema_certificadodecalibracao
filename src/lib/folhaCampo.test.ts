import { describe, expect, it, vi } from 'vitest'
import { api, chaveFolhaAvulsa, JANELA_FOLHA_AVULSA_MS } from './api'
import {
  abrirFolhaCampo,
  confirmacaoSemLigar,
  dataDaFolha,
  TEXTO_FOLHA_NOVA,
  textoBarometrosRetirados,
  textoFolhaNaoLigada,
  textoReimprimir,
  textosDataDaFolha,
  textosOsDaFolha,
} from './folhaCampo'

describe('a folha do cliente ainda não ligada', () => {
  const folha = {
    numero: 'FC-2026-00012',
    numeroCertificado: 'CC-2026-00034',
    ordemServico: 'OS 777',
    mesmaOs: false,
    impressaEm: '2026-11-09T13:00:00.000Z',
    dataPrevista: '',
  }

  it('o aviso diz o nº da folha e o da etiqueta, e pede para ligar', () => {
    expect(textoFolhaNaoLigada(folha)).toBe(
      'O cliente tem a folha FC-2026-00012 (certificado CC-2026-00034 reservado) ainda não ligada. Se foi ela a usada no cliente, ligue-a: o nº da etiqueta é CC-2026-00034.',
    )
    // A da mesma OS diz isso; sem nº de certificado, só a folha
    expect(textoFolhaNaoLigada({ ...folha, mesmaOs: true })).toMatch(
      /^O cliente tem a folha FC-2026-00012 \(da mesma OS 777, certificado CC-2026-00034 reservado\)/,
    )
    expect(textoFolhaNaoLigada({ ...folha, numeroCertificado: '' })).toBe(
      'O cliente tem a folha FC-2026-00012 ainda não ligada. Se foi ela a usada no cliente, ligue-a.',
    )
  })

  it('emitir sem ligar pede confirmação com os dois nºs', () => {
    expect(confirmacaoSemLigar([], null)).toBeNull()
    expect(confirmacaoSemLigar([folha], 'CC-2026-00050')).toEqual({
      titulo: 'Emitir sem ligar a folha FC-2026-00012?',
      descricao:
        'A folha FC-2026-00012 (certificado CC-2026-00034) deste cliente ainda não está ligada. Se foi ela a usada no cliente, a etiqueta da balança tem o nº CC-2026-00034, e este certificado sai com o nº CC-2026-00050. Para ligar, cancele e use “Ligar esta folha”.',
    })
    const duas = confirmacaoSemLigar([folha, { ...folha, numero: 'FC-2026-00013', numeroCertificado: 'CC-2026-00035' }], null)
    expect(duas?.titulo).toBe('Emitir sem ligar as folhas do cliente?')
    expect(duas?.descricao).toMatch(
      /^As folhas FC-2026-00012 \(certificado CC-2026-00034\) e FC-2026-00013 \(certificado CC-2026-00035\) deste cliente ainda não estão ligadas\. Se uma delas foi a usada no cliente, a etiqueta da balança tem o nº de certificado dela, e este certificado sai com outro nº\./,
    )
  })

  it('a data prevista da folha ligada: passou para a calibração, ou é outra (confira no passo 8)', () => {
    expect(textosDataDaFolha({ daFolha: '2026-11-12', aplicada: true, daCalibracao: '2026-11-10' }).aplicada).toBe(
      'A data prevista impressa na folha (12/11/2026) passou para esta calibração. Confira com a data real, que o técnico escreve no passo 8 da folha.',
    )
    expect(textosDataDaFolha({ daFolha: '2026-11-12', aplicada: false, daCalibracao: '2026-11-15' }).diferente).toBe(
      'A folha saiu com a data prevista 12/11/2026, e esta calibração está com 15/11/2026. Confira a data real, que o técnico escreve no passo 8 da folha.',
    )
    expect(textosDataDaFolha(null)).toEqual({})
  })
})

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

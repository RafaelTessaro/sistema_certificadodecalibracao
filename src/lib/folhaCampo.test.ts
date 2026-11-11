import { describe, expect, it, vi } from 'vitest'
import { api, chaveFolhaAvulsa, JANELA_FOLHA_AVULSA_MS } from './api'
import {
  abrirFolhaCampo,
  escolhaPorAbertura,
  avisoDataDaFolha,
  confirmacaoDaEmissao,
  confirmacaoLigarNoLugar,
  confirmacaoSemLigar,
  dataDaFolha,
  TEXTO_FOLHA_NOVA,
  TEXTO_ZERO_DA_FOLHA,
  textoBarometrosRetirados,
  textoDesfazerLigacao,
  textoFolhaNaoLigada,
  textoReimprimir,
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

  it('o aviso diz o nº da folha e o da etiqueta, pede para ligar e diz como tirá-lo se ela não foi usada', () => {
    const NAO_USADA =
      'Se não foi usada, peça ao administrador para marcá-la como “Não vai ser usada” (em Números não utilizados).'
    expect(textoFolhaNaoLigada(folha)).toBe(
      `O cliente tem a folha FC-2026-00012 (certificado CC-2026-00034 reservado) ainda não ligada. Se foi ela a usada no cliente, ligue-a: o nº da etiqueta é CC-2026-00034. ${NAO_USADA}`,
    )
    // A da mesma OS diz isso; sem nº de certificado, só a folha
    expect(textoFolhaNaoLigada({ ...folha, mesmaOs: true })).toMatch(
      /^O cliente tem a folha FC-2026-00012 \(da mesma OS 777, certificado CC-2026-00034 reservado\)/,
    )
    expect(textoFolhaNaoLigada({ ...folha, numeroCertificado: '' })).toBe(
      `O cliente tem a folha FC-2026-00012 ainda não ligada. Se foi ela a usada no cliente, ligue-a. ${NAO_USADA}`,
    )
    // O administrador marca ele mesmo
    expect(textoFolhaNaoLigada(folha, true)).toMatch(
      /Se não foi usada, marque-a como “Não vai ser usada” em Certificados → Números não utilizados\.$/,
    )
  })

  it('a calibração que já tem a folha impressa para ela: o aviso diz qual (e o nº dela) e só pede para ligar a do cliente se foi ela a usada', () => {
    const propria = { numero: 'FC-2026-00031', numeroCertificado: 'CC-2026-00032' }
    // "Da mesma OS" não vale aqui: na visita a vários equipamentos com uma OS só, toda calibração mostraria a do cliente
    expect(textoFolhaNaoLigada({ ...folha, mesmaOs: true }, false, propria)).toBe(
      'Esta calibração já tem a folha FC-2026-00031 (certificado CC-2026-00032). O cliente tem também a folha FC-2026-00012 (certificado CC-2026-00034 reservado) ainda não ligada: ligue-a só se foi ela, e não a FC-2026-00031, a usada nesta balança (a etiqueta tem o nº CC-2026-00034). Se não foi usada, peça ao administrador para marcá-la como “Não vai ser usada” (em Números não utilizados).',
    )
    // Sem o nº reservado na própria (impressa antes de a folha reservar o nº): só a folha
    expect(textoFolhaNaoLigada(folha, false, { numero: 'FC-2026-00031', numeroCertificado: '' })).toMatch(
      /^Esta calibração já tem a folha FC-2026-00031\. O cliente tem também/,
    )
  })

  it('ligar a do cliente no lugar da folha impressa para a calibração pede confirmação: o que sai, o nº que muda e como desfazer', () => {
    const propria = { numero: 'FC-2026-00031', numeroCertificado: 'CC-2026-00032' }
    expect(confirmacaoLigarNoLugar(folha, propria)).toEqual({
      titulo: 'Ligar a folha FC-2026-00012 no lugar da FC-2026-00031?',
      descricao:
        'A folha FC-2026-00031, impressa para esta calibração, fica registrada como não usada, e o nº CC-2026-00032 dela, como não utilizado. O certificado sai com o nº CC-2026-00034, o da folha FC-2026-00012. Ligue só se foi ela a usada nesta balança (a etiqueta tem o nº CC-2026-00034). Se ligar por engano, digite FC-2026-00031 em “Folha de campo nº” e ligue-a de novo: o nº CC-2026-00032 volta para ela.',
      confirmar: 'Ligar a FC-2026-00012',
    })
    // Sem os nºs de certificado: só as folhas
    expect(
      confirmacaoLigarNoLugar({ ...folha, numeroCertificado: '' }, { numero: 'FC-2026-00031', numeroCertificado: '' }).descricao,
    ).toBe(
      'A folha FC-2026-00031, impressa para esta calibração, fica registrada como não usada. Ligue só se foi a FC-2026-00012 a usada nesta balança. Se ligar por engano, digite FC-2026-00031 em “Folha de campo nº” e ligue-a de novo.',
    )
  })

  it('emitir sem ligar pede confirmação com os dois nºs, curta, com o título igual ao botão', () => {
    expect(confirmacaoSemLigar([], null)).toBeNull()
    expect(confirmacaoSemLigar([folha], 'CC-2026-00050')).toEqual({
      titulo: 'Emitir sem ligar a folha FC-2026-00012?',
      descricao:
        'A folha FC-2026-00012 deste cliente ainda não está ligada. Se foi ela a usada, a etiqueta da balança tem o nº CC-2026-00034, mas este certificado sai com o nº CC-2026-00050: cancele e use “Ligar esta folha”. Se não foi usada, peça ao administrador para marcá-la como “Não vai ser usada”.',
      confirmar: 'Emitir sem ligar',
    })
    // O signatário que autoriza: o título diz o que o botão faz, e o nº de saída aparece uma vez só
    const autorizar = confirmacaoSemLigar([folha], 'CC-2026-00050', true, 'autorizar')
    expect(autorizar).toMatchObject({
      titulo: 'Autorizar e emitir sem ligar a folha FC-2026-00012?',
      confirmar: 'Autorizar e emitir sem ligar',
    })
    expect(autorizar?.descricao.match(/CC-2026-00050/g)).toHaveLength(1)
    expect(autorizar?.descricao).toMatch(
      /Se não foi usada, marque-a como “Não vai ser usada” em Certificados → Números não utilizados\.$/,
    )
    // Quem digita e envia para autorização (tem a folha de papel na mão): a mesma pergunta, antes de enviar
    expect(confirmacaoSemLigar([folha], null, false, 'enviar')).toEqual({
      titulo: 'Enviar sem ligar a folha FC-2026-00012?',
      descricao:
        'A folha FC-2026-00012 deste cliente ainda não está ligada. Se foi ela a usada, a etiqueta da balança tem o nº CC-2026-00034, mas este certificado vai sair com outro nº: cancele e use “Ligar esta folha”. Se não foi usada, peça ao administrador para marcá-la como “Não vai ser usada”.',
      confirmar: 'Enviar sem ligar',
    })
    // A folha sem nº de certificado (impressa antes de a folha reservar o nº): só pede para ligar
    const semNumero = confirmacaoSemLigar([{ ...folha, numeroCertificado: '' }], 'CC-2026-00050', true)
    expect(semNumero?.descricao).toBe(
      'A folha FC-2026-00012 deste cliente ainda não está ligada. Se foi ela a usada, ligue-a antes: cancele e use “Ligar esta folha”. Se não foi usada, marque-a como “Não vai ser usada” em Certificados → Números não utilizados.',
    )
    const duas = confirmacaoSemLigar([folha, { ...folha, numero: 'FC-2026-00013', numeroCertificado: 'CC-2026-00035' }], null)
    expect(duas?.titulo).toBe('Emitir sem ligar as folhas do cliente?')
    expect(duas?.descricao).toMatch(
      /^As folhas FC-2026-00012 \(certificado CC-2026-00034\) e FC-2026-00013 \(certificado CC-2026-00035\) deste cliente ainda não estão ligadas\. Se uma delas foi a usada, a etiqueta da balança tem o nº de certificado dela, mas este certificado sai com outro nº: cancele e use “Ligar esta folha”\./,
    )
    expect(duas?.descricao).toMatch(/Se não foram usadas, peça ao administrador para marcá-las como “Não vai ser usada”\.$/)
  })

  it('a confirmação de "Autorizar e emitir" com a folha do cliente não ligada: o título igual ao botão e o nº de saída uma vez só', () => {
    const semLigar = confirmacaoSemLigar([folha], 'CC-2026-00005', true, 'autorizar')
    const c = confirmacaoDaEmissao({ autorizar: true, numeroRevisao: null, numeroReservado: 'CC-2026-00005', semLigar })
    expect(c.titulo).toBe('Autorizar e emitir sem ligar a folha FC-2026-00012?')
    expect(c.confirmar).toBe('Autorizar e emitir sem ligar')
    expect(c.descricao.match(/CC-2026-00005/g)).toHaveLength(1)
    expect(c.descricao).toMatch(
      /Você autoriza como signatário: o certificado sai com a sua assinatura em “Autorizado por” e não pode mais ser alterado\.$/,
    )
    // Emitir direto (revisão desligada), sem folha do cliente: como antes
    expect(
      confirmacaoDaEmissao({ autorizar: false, numeroRevisao: null, numeroReservado: 'CC-2026-00005', semLigar: null }),
    ).toEqual({
      titulo: 'Emitir o certificado?',
      descricao:
        'O certificado sai com o nº CC-2026-00005, o da folha de campo, e não pode mais ser alterado. Se precisar corrigir depois, a correção sai com o mesmo número.',
      confirmar: 'Emitir certificado',
    })
    const semLigarEmitir = confirmacaoSemLigar([folha], 'CC-2026-00005')
    const e = confirmacaoDaEmissao({
      autorizar: false,
      numeroRevisao: null,
      numeroReservado: 'CC-2026-00005',
      semLigar: semLigarEmitir,
    })
    expect(e).toMatchObject({ titulo: 'Emitir sem ligar a folha FC-2026-00012?', confirmar: 'Emitir sem ligar' })
    expect(e.descricao.match(/CC-2026-00005/g)).toHaveLength(1)
    expect(e.descricao).toMatch(/Emitido, o certificado não pode mais ser alterado\.$/)
    expect(
      confirmacaoDaEmissao({ autorizar: true, numeroRevisao: 'CC-2026-00001', numeroReservado: null, semLigar: null }),
    ).toMatchObject({
      titulo: 'Autorizar e emitir o certificado?',
      confirmar: 'Autorizar e emitir',
    })
    // Com o certificado digital da empresa instalado, o PDF sai sem as imagens das assinaturas: o nome, e não a assinatura
    const digital = confirmacaoDaEmissao({
      autorizar: true,
      numeroRevisao: null,
      numeroReservado: null,
      semLigar: null,
      assinadoDigitalmente: true,
    })
    expect(digital.descricao).toMatch(
      /^Você autoriza como signatário: o certificado sai com o seu nome em “Autorizado por”, e assinado digitalmente pela empresa\. /,
    )
    expect(digital.descricao).not.toContain('a sua assinatura')
    expect(
      confirmacaoDaEmissao({
        autorizar: true,
        numeroRevisao: null,
        numeroReservado: 'CC-2026-00005',
        semLigar,
        assinadoDigitalmente: true,
      }).descricao,
    ).toMatch(
      /o certificado sai com o seu nome em “Autorizado por”, e assinado digitalmente pela empresa\. Emitido, ele não pode mais ser alterado\.$/,
    )
  })

  it('a folha da calibração que saiu ao ligar a do cliente: como desfazer, com o nº que volta', () => {
    expect(textoDesfazerLigacao({ numero: 'FC-2026-00031', numeroCertificado: 'CC-2026-00032' })).toEqual({
      titulo: 'A folha FC-2026-00031 saiu desta calibração',
      texto: 'Se foi engano, digite FC-2026-00031 em “Folha de campo nº” e ligue-a de novo: o nº CC-2026-00032 volta para ela.',
    })
    expect(textoDesfazerLigacao({ numero: 'FC-2026-00031', numeroCertificado: '' }).texto).toBe(
      'Se foi engano, digite FC-2026-00031 em “Folha de campo nº” e ligue-a de novo.',
    )
  })

  it('a folha impressa antes da 1.0.6 pode ter saído sem a linha do zero (o sistema nem sempre sabe): confira no papel', () => {
    expect(TEXTO_ZERO_DA_FOLHA.marcada.titulo).toBe('A folha pode ter saído sem a linha do zero')
    expect(TEXTO_ZERO_DA_FOLHA.marcada.texto).toBe(
      'Ela foi impressa antes da versão 1.0.6: confira no papel. A falta da leitura do zero fica só como aviso. Se o técnico anotou o zero (na linha dele ou em Anotações), digite-o no erro de indicação.',
    )
  })

  it('a data prevista da folha ligada: o aviso fica na tela (passou para a calibração, ou é outra), com o botão que troca', () => {
    // Passou: diz a data de antes e volta para ela num clique
    expect(
      avisoDataDaFolha({ folha: 'FC-2026-00010', daFolha: '2026-11-12', aplicada: true, antes: '2026-11-10' }, '2026-11-12'),
    ).toEqual({
      texto:
        'A data da calibração passou de 10/11/2026 para 12/11/2026, a data prevista impressa na folha FC-2026-00010. Confira com a data real, que o técnico escreve no passo 8 da folha.',
      botao: { rotulo: 'Voltar para 10/11/2026', data: '2026-11-10' },
    })
    // A data mudou depois (a pessoa conferiu e trocou): o aviso sai
    expect(
      avisoDataDaFolha({ folha: 'FC-2026-00010', daFolha: '2026-11-12', aplicada: true, antes: '2026-11-10' }, '2026-11-11'),
    ).toBeNull()
    // Outra data: fica a da calibração, e o botão usa a da folha
    expect(
      avisoDataDaFolha({ folha: 'FC-2026-00010', daFolha: '2026-11-12', aplicada: false, antes: '2026-11-15' }, '2026-11-15'),
    ).toEqual({
      texto:
        'A folha FC-2026-00010 saiu com a data prevista 12/11/2026, e esta calibração está com 15/11/2026. Confira com a data real, que o técnico escreve no passo 8 da folha.',
      botao: { rotulo: 'Usar 12/11/2026', data: '2026-11-12' },
    })
    expect(
      avisoDataDaFolha({ folha: 'FC-2026-00010', daFolha: '2026-11-12', aplicada: false, antes: '2026-11-15' }, '2026-11-12'),
    ).toBeNull()
    expect(avisoDataDaFolha(null, '2026-11-12')).toBeNull()
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

describe('"Folha nova (novo nº)": o clique duplo não reserva duas folhas', () => {
  it('a escolha da janela vale uma vez por abertura (a janela ainda responde na animação de saída)', () => {
    const escolhas: string[] = []
    const janela = escolhaPorAbertura()
    janela.abrir()
    expect(janela.escolher(() => escolhas.push('nova'))).toBe(true)
    // O segundo clique do clique duplo (e qualquer outro, até abrir de novo): nada
    expect(janela.escolher(() => escolhas.push('nova'))).toBe(false)
    expect(janela.escolher(() => escolhas.push('reimprimir'))).toBe(false)
    expect(escolhas).toEqual(['nova'])
    // Aberta de novo: escolhe de novo
    janela.abrir()
    expect(janela.escolher(() => escolhas.push('reimprimir'))).toBe(true)
    expect(escolhas).toEqual(['nova', 'reimprimir'])
  })
})

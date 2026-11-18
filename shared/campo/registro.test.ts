import { describe, expect, it } from 'vitest'
import { ASSINATURA_EXEMPLO_1 } from '../../server/pdf/assinaturasExemplo.ts'
import { calcularConteudoSha256, sha256Hex } from './canonico.ts'
import {
  APARELHO_EXEMPLO,
  exemplosCampo,
  pacoteClasseI,
  pacoteDoCliente,
  pacoteEmBranco,
  pacotePlataforma,
  pacoteRodoviaria,
  registroClasseI,
  registroDoCliente,
  registroPlataforma,
  registroRodoviaria,
  TECNICO_EXEMPLO,
} from './exemplos.ts'
import { LIMITE_PNG_BYTES, LIMITE_REGISTRO_BYTES } from './protocolo.ts'
import {
  casasDaLeitura,
  conferirAssinaturas,
  dimensoesDoPng,
  formatarInstante,
  instanteLocal,
  instanteValido,
  leituraTextoValida,
  novaLeitura,
  numeroDaLeitura,
  numeroDoTexto,
  partesDoInstante,
  registroInicial,
  textoDaCarga,
  textoDoPeriodo,
  tipoAssinaturaCliente,
  validarPng,
  validarRegistro,
  valorObservado,
} from './registro.ts'
import type { RegistroCampo } from './tipos.ts'

const AGORA = '2026-10-21T08:05:00-03:00'
const campos = (r: unknown, o?: Parameters<typeof validarRegistro>[1]) => validarRegistro(r, o).map((x) => x.campo)

describe('data e hora do celular', () => {
  it('instanteLocal: ISO com o fuso, nunca o UTC', () => {
    const d = new Date('2026-11-19T00:42:10.000Z')
    // 21:42 em Brasília ainda é o dia 18 (o toISOString daria o dia 19)
    expect(instanteLocal(d, -180)).toBe('2026-11-18T21:42:10-03:00')
    expect(instanteLocal(d, 0)).toBe('2026-11-19T00:42:10+00:00')
    expect(instanteLocal(d, 330)).toBe('2026-11-19T06:12:10+05:30')
    expect(instanteValido(instanteLocal())).toBe(true)
  })

  it('instanteValido: completo, com o fuso e no calendário', () => {
    for (const v of ['2026-11-18T08:42:10-03:00', '2026-11-18T11:42:10.123Z', '2026-11-18T08:42:10+00:00'])
      expect(instanteValido(v), v).toBe(true)
    for (const v of [
      '',
      '2026-11-18',
      '2026-11-18T08:42',
      '2026-11-18T08:42:10',
      '2026-02-30T08:00:00-03:00',
      '2026-11-18T25:00:00-03:00',
      null,
      0,
    ])
      expect(instanteValido(v), String(v)).toBe(false)
  })

  it('mostra a hora como está escrita (o relógio do celular), com o período da folha', () => {
    expect(partesDoInstante('2026-11-18T23:50:00-03:00')).toEqual({ data: '2026-11-18', hora: '23:50' })
    expect(formatarInstante('2026-11-18T08:42:10-03:00')).toBe('18/11/2026 08:42')
    expect(formatarInstante('')).toBe('')
    expect(textoDoPeriodo('2026-11-18T08:42:10-03:00', '2026-11-18T15:58:00-03:00')).toBe('18/11/2026, das 08:42 às 15:58')
    expect(textoDoPeriodo('2026-11-18T16:00:00-03:00', '2026-11-19T10:15:00-03:00')).toBe('18/11/2026 16:00 a 19/11/2026 10:15')
    expect(textoDoPeriodo('2026-11-18T16:00:00-03:00', '')).toBe('18/11/2026, a partir das 16:00')
    expect(textoDoPeriodo('', '')).toBe('')
  })
})

describe('leituras como texto', () => {
  it('o formato do teclado: algarismos, vírgula e o sinal na frente, exatamente como digitado', () => {
    for (const v of ['0', '150,0', '100,05', '-0,02', '80000', '0,0001']) expect(leituraTextoValida(v), v).toBe(true)
    for (const v of ['', ',5', '5,', '1.000,0', '100.05', '+1', '1 000', '−1', '1,2,3', 'abc'])
      expect(leituraTextoValida(v), v).toBe(false)
    expect(novaLeitura('150,0', 'repetir', AGORA)).toEqual({ valor: '150,0', em: AGORA, via: 'repetir' })
  })

  it('o número só é calculado quando pedido, sem perder as casas digitadas', () => {
    expect(numeroDaLeitura('100,05')).toBe(100.05)
    expect(numeroDaLeitura({ valor: '-0,02', em: AGORA, via: 'teclado' })).toBe(-0.02)
    expect(numeroDaLeitura('lixo')).toBeNull()
    expect(numeroDaLeitura(null)).toBeNull()
    expect(casasDaLeitura('150,0')).toBe(1)
    expect(casasDaLeitura('150')).toBe(0)
    expect(casasDaLeitura({ valor: '0,0001', em: AGORA, via: 'teclado' })).toBe(4)
  })

  it('textoDaCarga: nas casas da divisão, como a folha imprime; numeroDoTexto lê de volta', () => {
    expect(textoDaCarga(100, 0.05)).toBe('100,00')
    expect(textoDaCarga(0, 0.05)).toBe('0,00')
    expect(textoDaCarga(8.25, 0.005)).toBe('8,250')
    // Milhar com espaço que não quebra (o mesmo do sistema e da folha)
    expect(textoDaCarga(80_000, 20)).toBe('80\u00a0000')
    expect(textoDaCarga(0.01, 0.0001)).toBe('0,0100')
    for (const [t, n] of [
      ['80 000', 80_000],
      ['100,00', 100],
      ['0,0100', 0.01],
      ['−0,5', -0.5],
      ['0.05', 0.05],
    ] as const)
      expect(numeroDoTexto(t)).toBe(n)
    for (const t of ['', '1.000,5', 'abc', '1,2,3']) expect(numeroDoTexto(t)).toBeNull()
  })

  it('valorObservado: o valor visto em campo na unidade da balança', () => {
    expect(valorObservado('50 g', 'kg')).toBe(0.05)
    expect(valorObservado('0,05', 'kg')).toBe(0.05)
    expect(valorObservado(' 0,1 mg ', 'g')).toBe(0.0001)
    expect(valorObservado('20 kg', 'kg')).toBe(20)
    expect(valorObservado('cinquenta', 'kg')).toBeNull()
  })
})

describe('assinaturas', () => {
  it('tipoAssinaturaCliente', () => {
    expect(tipoAssinaturaCliente(null)).toBe('PENDENTE')
    expect(tipoAssinaturaCliente(registroPlataforma().assinaturas.cliente)).toBe('ASSINOU')
    expect(tipoAssinaturaCliente(registroRodoviaria().assinaturas.cliente)).toBe('NAO_ASSINOU')
    expect(tipoAssinaturaCliente(registroDoCliente().assinaturas.cliente)).toBe('DISPENSADA')
    expect(tipoAssinaturaCliente({ soNoPapel: true })).toBe('SO_NO_PAPEL')
  })

  it('validarPng: PNG em data URL, com o cabeçalho, de tamanho plausível e até 300 KB', () => {
    expect(validarPng(ASSINATURA_EXEMPLO_1)).toBeNull()
    expect(dimensoesDoPng(ASSINATURA_EXEMPLO_1)).toEqual({ largura: 260, altura: 75 })
    expect(validarPng('data:image/jpeg;base64,/9j/4AAQ')).toMatch(/PNG/)
    expect(validarPng('data:image/png;base64,QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=')).toMatch(/não é um PNG/)
    expect(validarPng('data:image/png;base64,iVBOR!!w0KG')).toMatch(/corrompida/)
    expect(validarPng(null)).toMatch(/PNG/)
    // Grande demais (o cabeçalho certo e um corpo enorme)
    const corpo = Math.ceil((LIMITE_PNG_BYTES * 4) / 3 / 4) * 4 + 4
    const grande = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAABLCAMAAAChrwk1${'A'.repeat(corpo)}`
    expect(validarPng(grande)).toMatch(/KB/)
    // Um PNG de 1 × 1 px não é uma assinatura
    const umPorUm =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    expect(dimensoesDoPng(umPorUm)).toEqual({ largura: 1, altura: 1 })
    expect(validarPng(umPorUm)).toMatch(/tamanho/)
  })
})

describe('registroInicial', () => {
  it('plataforma: os itens do pacote, sem nenhuma leitura', () => {
    const p = pacotePlataforma()
    const r = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA, pacoteSha256: 'a'.repeat(64) })
    expect(r).toMatchObject({
      formato: 1,
      contrato: 1,
      envioId: p.envioId,
      numero: 'FC-2026-00042',
      pacoteSha256: 'a'.repeat(64),
      formulario: { codigo: 'FOR-CAL-01', revisao: '05' },
      piloto: true,
      tipo: 'calibracao',
      relogio: { iniciadoEm: AGORA, finalizadoEm: '' },
      desfecho: 'COMPLETA',
      motivoDesfecho: '',
      assinaturas: { tecnico: null, cliente: null },
    })
    const ps = r.passos
    expect(ps.padroes.map((x) => [x.identificacao, x.levado, x.usado])).toEqual([
      ['PP20-01 a 15', false, false],
      ['JP-01', false, false],
      ['TH-01', false, false],
      ['BR-01', false, false],
    ])
    expect(ps.chegada.conferencias.every((x) => x.confere === null)).toBe(true)
    expect(ps.chegada).not.toHaveProperty('clienteInformado')
    expect(ps.balanca).not.toHaveProperty('informada')
    expect(ps.balanca.conferencias).toHaveLength(16)
    expect(ps.indicacao.pontos.map((x) => [x.id, x.cargaPrevista])).toEqual([
      ['p0', '0,00'],
      ['pmin', '1,00'],
      ['p1', '10,00'],
      ['p25', '25,00'],
      ['p3', '100,00'],
      ['p4', '150,00'],
      ['p5', '200,00'],
      ['p6', '300,00'],
    ])
    expect(
      ps.indicacao.pontos.every(
        (x) => !x.acrescentado && x.crescente === null && x.decrescente === null && x.cargaAplicada === null,
      ),
    ).toBe(true)
    expect(ps.indicacao.calInterno).toBeNull()
    expect(ps.indicacao.substituicao).toBeNull()
    expect(ps.repetibilidade).toEqual([{ id: 'rep1', cargaPrevista: '150,00', cargaAplicada: null, leituras: [] }])
    expect(ps.excentricidade).toMatchObject({ aplicavel: true, cargaPrevista: '100,00' })
    expect(ps.excentricidade.posicoes.map((x) => x.rotulo)).toEqual([
      'Centro',
      'Frente esquerda',
      'Trás esquerda',
      'Trás direita',
      'Frente direita',
    ])
    expect(ps.ambiente.linhas.map((x) => x.momento)).toEqual(['INICIO', 'FIM'])
    expect(ps.final).toEqual({ dataCalibracao: '', termino: '' })
  })

  it('rodoviária: as etapas de substituição; classe I: o CAL interno', () => {
    const rod = registroInicial(pacoteRodoviaria(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })
    expect(rod.passos.indicacao.substituicao?.etapas).toHaveLength(3)
    expect(rod.passos.indicacao.pontos.map((x) => x.nivelSubstituicao)).toEqual([0, 0, 0, 1, 2, 3])
    expect(rod.passos.indicacao.pontos.map((x) => x.cargaPrevista.replace('\u00a0', ' '))).toEqual([
      '0',
      '5000',
      '10 000',
      '20 000',
      '30 000',
      '40 000',
    ])
    const cl = registroInicial(pacoteClasseI(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })
    expect(cl.passos.indicacao.calInterno).toEqual({ feito: false, em: '' })
    expect(cl.passos.indicacao.pontos[1].cargaPrevista).toBe('0,0100')
    expect(cl.passos.repetibilidade[0].cargaPrevista).toBe('200,0000')
  })

  it('excentricidade prevista como não aplicável: a confirmar, com as posições do desenho prontas para "Fazer o ensaio"', () => {
    const p = pacotePlataforma()
    Object.assign(p.plano!.excentricidade, { aplicavel: false, motivo: 'Prato pequeno.', posicoes: [], carga: 0 })
    const r = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })
    expect(r.passos.excentricidade).toMatchObject({ aplicavel: null, motivo: 'Prato pequeno.', cargaPrevista: '' })
    expect(r.passos.excentricidade.posicoes.map((x) => x.rotulo)).toEqual([
      'Centro',
      'Frente esquerda',
      'Trás esquerda',
      'Trás direita',
      'Frente direita',
    ])
    expect(r.passos.excentricidade.posicoes.every((x) => x.leitura === null && x.zeroAntes === null)).toBe(true)
    // Plataforma com apoios: uma posição por apoio; gancho (sem desenho): as 1 a 5 da folha em branco
    p.balanca = { ...p.balanca!, receptor: 'APOIOS', apoios: 6 }
    expect(registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA }).passos.excentricidade.posicoes).toHaveLength(6)
    p.balanca = { ...p.balanca, receptor: 'GANCHO' }
    const gancho = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })
    expect(gancho.passos.excentricidade.posicoes.map((x) => x.rotulo)).toEqual(['1', '2', '3', '4', '5'])
    expect(validarRegistro(gancho, { pacote: p, momento: 'FINALIZAR' })).toEqual([])
  })

  it('só do cliente e em branco: balança (e cliente) informados, posições 1 a 5', () => {
    const cli = registroInicial(pacoteDoCliente(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })
    expect(cli.passos.balanca.informada).toMatchObject({ classe: '', unidade: '', faixas: [{ max: '', e: '', d: '' }] })
    expect(cli.passos.chegada).not.toHaveProperty('clienteInformado')
    expect(cli.passos.chegada.conferencias.length).toBeGreaterThan(0)
    const br = registroInicial(pacoteEmBranco(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })
    expect(br.passos.chegada.clienteInformado).toEqual({
      razaoSocial: '',
      documento: '',
      endereco: '',
      enderecoIgualAoLocal: false,
      contato: '',
      email: '',
    })
    expect(br.passos.balanca.informada).toBeDefined()
    expect(br.passos.indicacao.pontos).toEqual([])
    expect(br.passos.repetibilidade).toEqual([])
    expect(br.passos.excentricidade.posicoes.map((x) => x.rotulo)).toEqual(['1', '2', '3', '4', '5'])
    expect(br.passos.padroes.length).toBe(pacoteEmBranco().padroes.previstos.length)
  })
})

describe('validarRegistro', () => {
  it('aceita os exemplos completos na entrega, com o pacote de cada um', () => {
    for (const { nome, pacote, registro } of exemplosCampo()) expect(validarRegistro(registro, { pacote }), nome).toEqual([])
  })

  it('aceita o registro vazio antes de Finalizar, e na entrega pede o término e as assinaturas', () => {
    for (const p of [pacotePlataforma(), pacoteRodoviaria(), pacoteClasseI(), pacoteDoCliente(), pacoteEmBranco()]) {
      const r = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })
      expect(validarRegistro(r, { pacote: p, momento: 'FINALIZAR' }), p.folha.numero).toEqual([])
      expect(campos(r, { pacote: p })).toEqual(['relogio.finalizadoEm', 'assinaturas.tecnico', 'assinaturas.cliente'])
    }
  })

  it('recusa o que não é um registro, sem lançar exceção', () => {
    for (const v of [null, undefined, 'registro', 42, [], true])
      expect(validarRegistro(v)).toEqual([{ campo: '', mensagem: 'O registro não é um objeto JSON.' }])
    const vazio = campos({})
    expect(vazio).toEqual(expect.arrayContaining(['formato', 'contrato', 'envioId', 'numero', 'passos', 'assinaturas']))
    // Lixo em qualquer lugar: lista de problemas, nunca exceção
    const r = registroPlataforma() as unknown as Record<string, unknown>
    const estragos: Array<(x: Record<string, unknown>) => void> = [
      (x) => (x.passos = 'x'),
      (x) => ((x.passos as Record<string, unknown>).indicacao = [1, 2]),
      (x) => ((x.passos as Record<string, unknown>).repetibilidade = { a: 1 }),
      (x) => (x.assinaturas = { tecnico: 5, cliente: [] }),
      (x) => (x.tentativas = [null, 'x', { ambiente: 3 }]),
      (x) => (x.anotacoes = [{ passo: 'dois' }]),
    ]
    for (const estragar of estragos) {
      const copia = structuredClone(r)
      estragar(copia)
      expect(() => validarRegistro(copia)).not.toThrow()
      expect(validarRegistro(copia).length).toBeGreaterThan(0)
    }
  })

  it('aponta leitura fora do formato, número com casas, data sem fuso e valores fora da lista', () => {
    const r = registroPlataforma()
    r.passos.indicacao.pontos[2].crescente!.valor = '10.00'
    r.passos.repetibilidade[0].leituras[0].em = '2026-10-21T08:40:00'
    ;(r.passos.indicacao.pontos[3] as unknown as Record<string, unknown>).nivelSubstituicao = 0.5
    ;(r as unknown as Record<string, unknown>).desfecho = 'PARCIAL'
    r.passos.excentricidade.posicoes[0].leitura!.via = 'colar' as never
    expect(campos(r)).toEqual(
      expect.arrayContaining([
        'passos.indicacao.pontos.2.crescente.valor',
        'passos.repetibilidade.0.leituras.0.em',
        'passos.indicacao.pontos.3.nivelSubstituicao',
        'desfecho',
        'passos.excentricidade.posicoes.0.leitura.via',
      ]),
    )
    expect(
      validarRegistro(r).find(
        (x) => x.campo === 'passos.indicacao.pontos.3.nivelSubstituicao' && /casas decimais/.test(x.mensagem),
      ),
    ).toBeTruthy()
  })

  it('encerrada sem completar precisa de um motivo', () => {
    const r = registroRodoviaria()
    r.desfecho = 'INCOMPLETA'
    expect(campos(r)).toEqual(['motivoDesfecho'])
    r.motivoDesfecho = 'Barômetro com defeito: pressão do fim não medida.'
    expect(campos(r)).toEqual([])
  })

  it('assinaturas: PNG válido, o mesmo conteúdo nas duas, e as alternativas só onde valem', () => {
    const r = registroPlataforma()
    ;(r.assinaturas.cliente as { png: string }).png = 'data:image/jpeg;base64,/9j/4AAQ'
    expect(campos(r)).toEqual(['assinaturas.cliente.png'])
    const r2 = registroPlataforma()
    ;(r2.assinaturas.cliente as { conteudoSha256: string }).conteudoSha256 = 'b'.repeat(64)
    expect(campos(r2)).toEqual(['assinaturas.cliente.conteudoSha256'])
    // Dispensada só no laboratório; "só o papel" só no piloto
    const r3 = registroRodoviaria()
    r3.assinaturas.cliente = { dispensada: 'LABORATORIO' }
    expect(campos(r3)).toEqual(['assinaturas.cliente'])
    r3.assinaturas.cliente = { soNoPapel: true }
    expect(campos(r3)).toEqual(['assinaturas.cliente'])
    r3.piloto = true
    expect(campos(r3)).toEqual([])
    // Correção depois da assinatura sem a assinatura do técnico
    const r4 = registroPlataforma()
    r4.assinaturas.tecnico = null
    expect(campos(r4, { momento: 'FINALIZAR' })).toEqual(['correcoesPosAssinatura'])
  })

  it('com o pacote, confere que o registro é dele', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    expect(campos(r, { pacote: pacoteRodoviaria() })).toEqual(expect.arrayContaining(['envioId', 'numero']))
    r.passos.indicacao.pontos[0].id = 'p-inventado'
    expect(campos(r, { pacote: p })).toEqual(['passos.indicacao.pontos.0.id'])
    // O ponto acrescentado no local pode ter id novo, desde que tenha a carga digitada
    r.passos.indicacao.pontos[0].acrescentado = true
    expect(campos(r, { pacote: p })).toEqual(['passos.indicacao.pontos.0.cargaAplicada'])
    r.passos.indicacao.pontos[0].cargaAplicada = novaLeitura('0', 'teclado', AGORA)
    expect(campos(r, { pacote: p })).toEqual([])
    // Ids repetidos
    r.passos.indicacao.pontos[1].id = r.passos.indicacao.pontos[2].id
    expect(campos(r, { pacote: p })).toEqual(['passos.indicacao.pontos.2.id'])
  })

  it('a balança informada só nas folhas sem balança cadastrada, e obrigatória nelas', () => {
    const r = registroPlataforma()
    r.passos.balanca.informada = registroDoCliente().passos.balanca.informada
    expect(campos(r)).toEqual(['passos.balanca.informada'])
    const c = registroDoCliente()
    delete c.passos.balanca.informada
    expect(campos(c)).toEqual(['passos.balanca.informada'])
    const b = registroInicial(pacoteEmBranco(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })
    delete b.passos.chegada.clienteInformado
    expect(campos(b, { momento: 'FINALIZAR' })).toEqual(['passos.chegada.clienteInformado'])
  })

  it('limites: o tamanho do registro e as listas', () => {
    const r = registroClasseI()
    r.anotacoes = Array.from({ length: 301 }, (_, i) => ({
      id: `an-${i}`,
      passo: 4 as const,
      tipo: 'OBSERVACAO' as const,
      campo: '',
      texto: 'x',
      em: AGORA,
    }))
    expect(campos(r)).toEqual(['anotacoes'])
    const grande = registroClasseI()
    grande.anotacoes = Array.from({ length: 250 }, (_, i) => ({
      id: `an-${i}`,
      passo: 4 as const,
      tipo: 'OBSERVACAO' as const,
      campo: '',
      texto: 'x'.repeat(1500),
      em: AGORA,
    }))
    grande.trilha = Array.from({ length: 2900 }, () => ({
      campo: 'final.dataCalibracao',
      de: 'y'.repeat(400),
      para: 'z'.repeat(400),
      em: AGORA,
      motivo: '',
    }))
    const p = validarRegistro(grande)
    expect(p).toEqual([{ campo: '', mensagem: expect.stringContaining(`${Math.round(LIMITE_REGISTRO_BYTES / 1024)} KB`) }])
  })
})

describe('conferirAssinaturas', () => {
  it('as assinaturas amarram o conteúdo; mudar uma leitura depois de assinar é descoberto', async () => {
    for (const { registro } of exemplosCampo()) expect(await conferirAssinaturas(registro, sha256Hex)).toEqual([])
    const r = registroClasseI()
    r.passos.repetibilidade[0].leituras[3].valor = '200,0009'
    expect((await conferirAssinaturas(r, sha256Hex)).map((x) => x.campo)).toEqual([
      'assinaturas.tecnico.conteudoSha256',
      'assinaturas.cliente.conteudoSha256',
    ])
  })

  it('a correção depois da assinatura não invalida as assinaturas', async () => {
    const r: RegistroCampo = registroPlataforma()
    expect(r.correcoesPosAssinatura).toHaveLength(1)
    r.correcoesPosAssinatura.push({ ...r.correcoesPosAssinatura[0], em: '2026-10-21T10:00:00-03:00' })
    expect(await conferirAssinaturas(r, sha256Hex)).toEqual([])
    expect(r.assinaturas.tecnico!.conteudoSha256).toBe(calcularConteudoSha256(r, sha256Hex))
  })
})

import { describe, expect, it } from 'vitest'
import { sha256Hex } from './canonico.ts'
import {
  aparelhoIdValido,
  CABECALHOS_CAMPO,
  cabecalhosDoCelular,
  cabecalhosSemToken,
  caminhoCampo,
  classificarErroCampo,
  CODIGOS_ERRO_CAMPO,
  diferencaRelogioMs,
  formatarQrPareamento,
  lerPedidoOla,
  lerPedidoParear,
  lerPedidoRecolhimento,
  lerQrPareamento,
  LIMITE_CORPO_REGISTRO,
  LIMITE_REGISTRO_BYTES,
  MENSAGENS_ERRO_CAMPO,
  montarRecibo,
  normalizarCodigo,
  normalizarEnderecoServidor,
  PRAZOS_CAMPO,
  reciboConfere,
  relogioDiferente,
  ROTAS_CAMPO,
  textoRelogioDiferente,
  tokenDoCabecalho,
  tokenValido,
  urlCampo,
  versaoMaisNova,
  versionCode,
} from './protocolo.ts'

const TOKEN = 'q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C'

describe('QR do pareamento', () => {
  it('ida e volta: endereço e código', () => {
    const qr = formatarQrPareamento({ servidor: 'http://192.168.0.10:4850', codigo: '123456' })
    expect(qr).toBe('BCCAL1|http://192.168.0.10:4850|123456')
    expect(lerQrPareamento(qr)).toEqual({ servidor: 'http://192.168.0.10:4850', codigo: '123456' })
  })

  it('normaliza o endereço ao formatar e ao ler', () => {
    expect(formatarQrPareamento({ servidor: '192.168.0.10', codigo: '012345' })).toBe('BCCAL1|http://192.168.0.10:4850|012345')
    expect(lerQrPareamento('  BCCAL1|HTTP://192.168.0.10:4850/|654321 ')).toEqual({
      servidor: 'http://192.168.0.10:4850',
      codigo: '654321',
    })
  })

  it('o QR só do endereço (celular já pareado que precisa do endereço novo)', () => {
    const qr = formatarQrPareamento({ servidor: 'http://10.0.0.5:4850', codigo: '' })
    expect(qr).toBe('BCCAL1|http://10.0.0.5:4850')
    expect(lerQrPareamento(qr)).toEqual({ servidor: 'http://10.0.0.5:4850', codigo: '' })
  })

  it('recusa o que não é um QR do sistema', () => {
    for (const t of [
      '',
      'http://192.168.0.10:4850',
      'BCCAL2|http://192.168.0.10:4850|123456',
      'BCCAL1|http://192.168.0.10:4850|12345',
      'BCCAL1|https://192.168.0.10:4850|123456',
      'BCCAL1|http://999.1.1.1:4850|123456',
      'BCCAL1|http://192.168.0.10:4850|123456|extra',
      null,
      42,
    ])
      expect(lerQrPareamento(t)).toBeNull()
    expect(() => formatarQrPareamento({ servidor: 'http://192.168.0.10', codigo: 'abc' })).toThrow()
    expect(() => formatarQrPareamento({ servidor: 'ftp://x', codigo: '123456' })).toThrow()
  })
})

describe('normalizarEnderecoServidor', () => {
  it('aceita o IP com ou sem porta, com ou sem http, e ignora o caminho', () => {
    const casos: Array<[string, string]> = [
      ['192.168.0.10', 'http://192.168.0.10:4850'],
      ['192.168.0.10:4850', 'http://192.168.0.10:4850'],
      [' http://192.168.0.10:4850/ ', 'http://192.168.0.10:4850'],
      ['HTTP://192.168.0.10:8080/login', 'http://192.168.0.10:8080'],
      ['http://192.168.0.10?x=1', 'http://192.168.0.10:4850'],
      ['Servidor-BC', 'http://servidor-bc:4850'],
      ['servidor-bc.local:4850', 'http://servidor-bc.local:4850'],
    ]
    for (const [entrada, saida] of casos) {
      const r = normalizarEnderecoServidor(entrada)
      expect(r, entrada).toMatchObject({ ok: true, endereco: saida })
    }
  })

  it('diz se o IP é da rede interna', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.1.1', '169.254.3.4', '100.64.0.1', '127.0.0.1'])
      expect(normalizarEnderecoServidor(ip)).toMatchObject({ ok: true, redeLocal: true })
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '200.10.20.30'])
      expect(normalizarEnderecoServidor(ip)).toMatchObject({ ok: true, redeLocal: false })
  })

  it('recusa https, outro esquema, IP inválido, porta fora da faixa e lixo, com uma frase para o técnico', () => {
    for (const t of [
      '',
      '   ',
      'https://192.168.0.10',
      'ftp://192.168.0.10',
      '192.168.0.256',
      '192.168.0',
      '192.168.00.1',
      '192.168.0.10:0',
      '192.168.0.10:70000',
      'user@192.168.0.10',
      'servidor bc',
      '[::1]:4850',
      undefined,
    ]) {
      const r = normalizarEnderecoServidor(t)
      expect(r.ok, String(t)).toBe(false)
      if (!r.ok) expect(r.erro.length).toBeGreaterThan(10)
    }
    expect(normalizarEnderecoServidor('https://192.168.0.10')).toMatchObject({
      ok: false,
      erro: expect.stringContaining('http://'),
    })
  })
})

describe('rotas e cabeçalhos', () => {
  it('todas as rotas ficam em /api/campo, com uma regra de acesso, e o PUT do registro aceita o celular revogado', () => {
    for (const r of Object.values(ROTAS_CAMPO)) {
      expect(r.caminho.startsWith('/api/campo/')).toBe(true)
      expect(['publico', 'celular', 'celular-entrega']).toContain(r.regra)
    }
    expect(ROTAS_CAMPO.registro).toEqual({ metodo: 'PUT', caminho: '/api/campo/registros/:envioId', regra: 'celular-entrega' })
    expect(ROTAS_CAMPO.parear.regra).toBe('publico')
    expect(ROTAS_CAMPO.apk.regra).toBe('publico')
    expect(ROTAS_CAMPO.apkInfo.regra).toBe('publico')
    expect(ROTAS_CAMPO.ola.regra).toBe('celular')
    // Cada rota tem o seu prazo
    for (const nome of ['parear', 'ola', 'pacote', 'recebida', 'recolhimento', 'registro', 'apkInfo'] as const) {
      expect(PRAZOS_CAMPO[nome].conectarMs).toBeGreaterThan(0)
      expect(PRAZOS_CAMPO[nome].lerMs).toBeGreaterThanOrEqual(PRAZOS_CAMPO[nome].conectarMs)
    }
  })

  it('monta o caminho com o envioId e recusa id inválido', () => {
    const id = '5b0e6a52-1c3f-4e7a-9d2b-8f1a0c3e5d71'
    expect(caminhoCampo('pacote', id)).toBe(`/api/campo/envios/${id}/pacote`)
    expect(caminhoCampo('registro', id)).toBe(`/api/campo/registros/${id}`)
    expect(caminhoCampo('ola')).toBe('/api/campo/ola')
    expect(() => caminhoCampo('recebida')).toThrow()
    expect(() => caminhoCampo('recebida', '../x')).toThrow()
    expect(urlCampo('http://192.168.0.10:4850/', '/api/campo/ola')).toBe('http://192.168.0.10:4850/api/campo/ola')
  })

  it('os cabeçalhos do celular: token, CSRF e a hora; e o token lido de volta pelo servidor', () => {
    const c = cabecalhosDoCelular(TOKEN, '2026-11-18T08:42:10-03:00')
    expect(c).toEqual({ authorization: `Bearer ${TOKEN}`, 'x-bc-calibracao': '1', 'x-bc-agora': '2026-11-18T08:42:10-03:00' })
    expect(tokenDoCabecalho(c[CABECALHOS_CAMPO.autorizacao])).toBe(TOKEN)
    expect(tokenDoCabecalho(`bearer  ${TOKEN} `)).toBe(TOKEN)
    for (const v of [undefined, '', TOKEN, `Basic ${TOKEN}`, 'Bearer curto', `Bearer ${TOKEN}x`])
      expect(tokenDoCabecalho(v)).toBe('')
    expect(tokenValido(TOKEN)).toBe(true)
    // O pareamento (público) e a identidade do servidor vão sem token, mas com o cabeçalho contra CSRF
    expect(cabecalhosSemToken('2026-11-18T08:42:10-03:00')).toEqual({
      'x-bc-calibracao': '1',
      'x-bc-agora': '2026-11-18T08:42:10-03:00',
    })
    // O servidor guarda só o sha256 do token
    expect(sha256Hex(TOKEN)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('identificadores, versões e limites', () => {
  it('código de 6 dígitos (com espaço ou hífen, como se digita)', () => {
    expect(normalizarCodigo('123456')).toBe('123456')
    expect(normalizarCodigo(' 123 456 ')).toBe('123456')
    expect(normalizarCodigo('123-456')).toBe('123456')
    for (const v of ['12345', '1234567', 'abcdef', 123456, null]) expect(normalizarCodigo(v)).toBe('')
  })

  it('aparelhoId é um UUID', () => {
    expect(aparelhoIdValido('6f1c2a9e-3b4d-4c8e-9a1f-2b3c4d5e6f70')).toBe(true)
    expect(aparelhoIdValido('6F1C2A9E-3B4D-4C8E-9A1F-2B3C4D5E6F70')).toBe(false)
    expect(aparelhoIdValido('celular-do-tecnico')).toBe(false)
  })

  it('versionCode = a·1 000 000 + b·10 000 + c·100 + build', () => {
    expect(versionCode('1.1.0')).toBe(1_010_000)
    expect(versionCode('1.1.0+1')).toBe(1_010_001)
    expect(versionCode('2.0.13')).toBe(2_001_300)
    expect(versionCode('1.100.0')).toBeNull()
    expect(versionCode('1.1')).toBeNull()
    expect(versaoMaisNova('1.1.1', '1.1.0+3')).toBe(true)
    expect(versaoMaisNova('1.1.0', '1.1.0')).toBe(false)
    expect(versaoMaisNova('lixo', '1.1.0')).toBe(false)
  })

  it('o limite que o app confere fica abaixo do corpo que o servidor aceita, com folga para o escape de "/"', () => {
    expect(LIMITE_REGISTRO_BYTES * 1.1).toBeLessThan(LIMITE_CORPO_REGISTRO)
  })
})

describe('respostas e erros', () => {
  const registro = { numero: 'FC-2026-00042', envioId: '5b0e6a52-1c3f-4e7a-9d2b-8f1a0c3e5d71' }
  const sha = sha256Hex('registro')

  it('o recibo só confere com o mesmo nº, o mesmo envio e o mesmo sha256', () => {
    const recibo = montarRecibo({
      ...registro,
      sha256: sha.toUpperCase(),
      recebidoEm: '2026-11-18T20:10:00.000Z',
      situacao: 'VALIDO',
      marcas: ['PILOTO', 'PILOTO'],
    })
    expect(recibo.sha256).toBe(sha)
    expect(recibo.marcas).toEqual(['PILOTO'])
    expect(reciboConfere(recibo, registro, sha)).toBe(true)
    expect(reciboConfere({ ...recibo, numero: 'FC-2026-00043' }, registro, sha)).toBe(false)
    expect(reciboConfere({ ...recibo, envioId: 'outro-envio-1' }, registro, sha)).toBe(false)
    expect(reciboConfere({ ...recibo, sha256: sha256Hex('outro') }, registro, sha)).toBe(false)
    expect(reciboConfere({ ...recibo, recebidoEm: '' }, registro, sha)).toBe(false)
    expect(reciboConfere(null, registro, sha)).toBe(false)
    expect(reciboConfere({ erro: 'Erro interno do servidor.' }, registro, sha)).toBe(false)
  })

  it('classifica o erro pelo código do corpo ou, sem ele, pelo status (o 413 do Fastify vem sem código)', () => {
    expect(classificarErroCampo(401, { erro: 'x', codigo: 'DESCADASTRADO' })).toBe('DESCADASTRADO')
    expect(classificarErroCampo(401, { erro: 'x' })).toBe('NAO_PAREADO')
    expect(classificarErroCampo(413, { erro: 'Arquivo muito grande.' })).toBe('REGISTRO_GRANDE')
    expect(classificarErroCampo(404, null)).toBe('ENVIO_DESCONHECIDO')
    expect(classificarErroCampo(429, {})).toBe('MUITAS_TENTATIVAS')
    expect(classificarErroCampo(500, { erro: 'Erro interno do servidor. Tente novamente.' })).toBe('SERVIDOR')
    expect(classificarErroCampo(409, { codigo: 'INVENTADO' })).toBe('SERVIDOR')
    // Cada código tem a sua frase
    for (const codigo of Object.keys(CODIGOS_ERRO_CAMPO))
      expect(MENSAGENS_ERRO_CAMPO[codigo as keyof typeof CODIGOS_ERRO_CAMPO]).toBeTruthy()
  })

  it('relógio: diferença em ms e o limite de 5 min', () => {
    expect(diferencaRelogioMs('2026-11-18T08:42:10-03:00', '2026-11-18T11:42:10.000Z')).toBe(0)
    expect(relogioDiferente('2026-11-18T08:47:10-03:00', '2026-11-18T11:42:10.000Z')).toBe(false)
    expect(relogioDiferente('2026-11-18T08:47:11-03:00', '2026-11-18T11:42:10.000Z')).toBe(true)
    expect(relogioDiferente('lixo', '2026-11-18T11:42:10.000Z')).toBe(true)
    expect(textoRelogioDiferente(-12 * 60_000)).toBe('Relógio do celular diferente (12 min)')
  })
})

describe('leitura dos pedidos (servidor)', () => {
  it('parear: corpo certo, e os erros de um corpo errado', () => {
    const certo = lerPedidoParear({
      codigo: '123 456',
      aparelhoId: '6F1C2A9E-3B4D-4C8E-9A1F-2B3C4D5E6F70',
      modelo: ' Samsung\u0000 SM-A546E ',
      versaoApp: '1.1.0',
    })
    expect(certo).toEqual({
      valor: {
        codigo: '123456',
        aparelhoId: '6f1c2a9e-3b4d-4c8e-9a1f-2b3c4d5e6f70',
        modelo: 'Samsung SM-A546E',
        versaoApp: '1.1.0',
      },
      erros: [],
    })
    expect(lerPedidoParear({}).erros).toHaveLength(3)
    expect(lerPedidoParear('lixo').erros).toHaveLength(3)
  })

  it('olá: ignora estados repetidos, desconhecidos e envioIds inválidos', () => {
    const r = lerPedidoOla({
      versaoApp: '1.1.0',
      contrato: 1,
      agora: '2026-11-18T08:42:10-03:00',
      estados: [
        { envioId: '5b0e6a52-1c3f-4e7a-9d2b-8f1a0c3e5d71', estado: 'FINALIZADA' },
        { envioId: '5b0e6a52-1c3f-4e7a-9d2b-8f1a0c3e5d71', estado: 'NOVA' },
        { envioId: '7c2f8b14-5d6e-4f80-a1b2-c3d4e5f60718', estado: 'PERDIDA' },
        { envioId: '../../x', estado: 'NOVA' },
        'lixo',
      ],
    })
    expect(r.erros).toEqual([])
    expect(r.valor.estados).toEqual([{ envioId: '5b0e6a52-1c3f-4e7a-9d2b-8f1a0c3e5d71', estado: 'FINALIZADA' }])
    expect(lerPedidoOla({ versaoApp: 'x', contrato: 0 }).erros).toHaveLength(2)
  })

  it('recolhimento: só APAGUEI ou JA_COMECEI', () => {
    expect(lerPedidoRecolhimento({ resposta: 'JA_COMECEI' })).toEqual({ valor: { resposta: 'JA_COMECEI' }, erros: [] })
    expect(lerPedidoRecolhimento({ resposta: 'TALVEZ' }).erros).toHaveLength(1)
  })
})

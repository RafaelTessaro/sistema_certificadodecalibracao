import { createServer } from 'node:http'
import type { AddressInfo, Server } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PRAZOS_CAMPO } from '../../../shared/campo/protocolo.ts'
import { ClienteCampo } from './cliente.ts'
import { relogioFixo } from './relogio.ts'
import { ServidorFalso, TOKEN_TESTE } from './testes/servidorFalso.ts'
import { transporteNode } from './testes/transporteNode.ts'
import { ErroDeRede, exigirPrazo } from './transporte.ts'
import type { PedidoHttp } from './transporte.ts'

const relogio = relogioFixo('2026-11-18T11:00:00.000Z')

describe('cliente da API do celular', () => {
  it('saúde e pareamento: sem token, com o cabeçalho contra CSRF', async () => {
    const s = new ServidorFalso()
    const c = new ClienteCampo({ endereco: 'http://192.168.0.10:4850', token: '' }, s, relogio)
    const saude = await c.saude()
    expect(saude.ok && saude.valor.id).toBe('srv-1')
    const errado = await c.parear({
      codigo: '000000',
      aparelhoId: '6f1c2a9e-3b4d-4c8e-9a1f-2b3c4d5e6f70',
      modelo: 'X',
      versaoApp: '1.1.0',
    })
    expect(errado).toMatchObject({ ok: false, falha: { tipo: 'HTTP', status: 400, codigo: 'CODIGO_INVALIDO' } })
    expect(!errado.ok && errado.falha.mensagem).toBe('Código errado. Confira o código na tela do computador.')
    const certo = await c.parear({
      codigo: '123456',
      aparelhoId: '6f1c2a9e-3b4d-4c8e-9a1f-2b3c4d5e6f70',
      modelo: 'X',
      versaoApp: '1.1.0',
    })
    expect(certo.ok && certo.valor.token).toBe(TOKEN_TESTE)
    expect(s.cabecalhos[1]).toEqual({ 'x-bc-calibracao': '1', 'x-bc-agora': '2026-11-18T08:00:00-03:00' })
  })

  it('o endereço é lido a cada chamada (trocar no Menu vale na hora); sem endereço, não chama', async () => {
    const s = new ServidorFalso()
    let endereco = ''
    const c = new ClienteCampo(() => ({ endereco, token: TOKEN_TESTE }), s, relogio)
    const sem = await c.saude()
    expect(sem.ok).toBe(false)
    expect(s.pedidos).toEqual([])
    endereco = 'http://10.0.0.5:4850'
    expect((await c.saude()).ok).toBe(true)
  })

  it('fora do ar = "Servidor não encontrado", com o endereço; resposta sem o formato = erro do servidor', async () => {
    const s = new ServidorFalso()
    s.foraDoAr = true
    const c = new ClienteCampo({ endereco: 'http://192.168.0.10:4850', token: TOKEN_TESTE }, s, relogio)
    const r = await c.ola({ versaoApp: '1.1.0', contrato: 1, agora: relogio.agora(), estados: [] })
    expect(r).toMatchObject({ ok: false, falha: { tipo: 'REDE' } })
    expect(!r.ok && r.falha.mensagem).toMatch(/^Servidor não encontrado em http:\/\/192\.168\.0\.10:4850\./)
    const estranho = new ClienteCampo(
      { endereco: 'http://x:1', token: TOKEN_TESTE },
      { enviar: async () => ({ status: 200, corpo: '<html>' }) },
      relogio,
    )
    expect(await estranho.saude()).toMatchObject({ ok: false, falha: { codigo: 'SERVIDOR' } })
    const grande = new ClienteCampo(
      { endereco: 'http://x:1', token: TOKEN_TESTE },
      { enviar: async () => ({ status: 413, corpo: { erro: 'x' } }) },
      relogio,
    )
    expect(await grande.saude()).toMatchObject({ ok: false, falha: { codigo: 'REGISTRO_GRANDE' } })
  })

  it('pedido sem prazo nunca vai para a rede', () => {
    expect(() => exigirPrazo({ metodo: 'GET', url: 'http://x', cabecalhos: {} } as unknown as PedidoHttp)).toThrow(/prazos/)
    expect(() => exigirPrazo({ metodo: 'GET', url: 'http://x', cabecalhos: {}, prazo: { conectarMs: 0, lerMs: 1 } })).toThrow()
    expect(exigirPrazo({ metodo: 'GET', url: 'http://x', cabecalhos: {}, prazo: PRAZOS_CAMPO.ola })).toEqual(PRAZOS_CAMPO.ola)
  })
})

describe('transporte em node:http (os testes que falam com um servidor de verdade)', () => {
  let servidor: Server
  let base = ''
  beforeAll(async () => {
    servidor = createServer((req, res) => {
      if (req.url === '/lento') return // nunca responde: o prazo de leitura vence
      let corpo = ''
      req.on('data', (b) => (corpo += b))
      req.on('end', () => {
        res.setHeader('content-type', 'application/json')
        res.end(
          JSON.stringify({
            metodo: req.method,
            csrf: req.headers['x-bc-calibracao'],
            tipo: req.headers['content-type'],
            corpo: corpo ? JSON.parse(corpo) : null,
          }),
        )
      })
    })
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())))

  it('manda JSON e lê JSON', async () => {
    const r = await transporteNode.enviar({
      metodo: 'PUT',
      url: `${base}/eco`,
      cabecalhos: { 'x-bc-calibracao': '1' },
      corpo: { a: '1,5' },
      prazo: PRAZOS_CAMPO.registro,
    })
    expect(r).toEqual({ status: 200, corpo: { metodo: 'PUT', csrf: '1', tipo: 'application/json', corpo: { a: '1,5' } } })
  })

  it('prazo de leitura vencido e servidor fora do ar viram ErroDeRede', async () => {
    await expect(
      transporteNode.enviar({ metodo: 'GET', url: `${base}/lento`, cabecalhos: {}, prazo: { conectarMs: 1000, lerMs: 150 } }),
    ).rejects.toMatchObject({
      name: 'ErroDeRede',
      tipo: 'PRAZO',
    })
    await expect(
      transporteNode.enviar({
        metodo: 'GET',
        url: 'http://127.0.0.1:1/x',
        cabecalhos: {},
        prazo: { conectarMs: 1000, lerMs: 1000 },
      }),
    ).rejects.toBeInstanceOf(ErroDeRede)
  })
})

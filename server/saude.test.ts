// GET /api/saude: é por ele que o programa das estações (instalador/estacao) acha o servidor na rede.
// Ele faz um GET simples, sem sessão e sem o cabeçalho do app, ao IP ou ao nome do computador.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarApp, hostPermitido, lerHostsPermitidos, VERSAO_APP } from './app.ts'
import { criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { ARQUIVO_ID, idDaInstalacao } from './identidade.ts'

let t: AppComLogin

beforeEach(async () => {
  t = await criarAppComLogin({ semUsuarios: true, porta: 4850 })
})
afterEach(async () => {
  await t.fechar()
})

/** GET como o lançador da estação faz: só o Host, sem cookie nem cabeçalho do app. */
const saude = (remoteAddress: string, host: string) =>
  t.app.inject({ method: 'GET', url: '/api/saude', remoteAddress, headers: { host } })

describe('GET /api/saude', () => {
  it('pela rede: identifica o sistema, a versão, o nome do computador e o servidor, e só isso', async () => {
    const r = await saude('192.168.0.40', '192.168.0.10:4850')
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-length']).toBeDefined() // o NSISdl recusa resposta sem Content-Length
    const { id, instancia, ...resto } = r.json()
    expect(resto).toEqual({ ok: true, app: 'bc-calibracao', versao: VERSAO_APP, nome: hostname() })
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(instancia).toMatch(/^[0-9a-f]{32}$/)
    expect(instancia).not.toBe(id)
    // O texto que o lançador procura na resposta, sem espaços
    expect(r.body).toContain('"app":"bc-calibracao"')
    expect(r.body).toContain(`"nome":${JSON.stringify(hostname())}`)
  })

  it('aceita o nome do computador no endereço (é o que a estação guarda), também com .local', async () => {
    for (const host of [`${hostname()}:4850`, `${hostname().toUpperCase()}:4850`, `${hostname()}.local:4850`]) {
      const r = await saude('10.0.0.25', host)
      expect(r.statusCode, host).toBe(200)
      expect(r.json().nome).toBe(hostname())
    }
  })

  it('outro nome no endereço, ou acesso de fora da rede local, continuam bloqueados', async () => {
    expect((await saude('192.168.0.40', 'nao-e-este-servidor:4850')).statusCode).toBe(403)
    expect((await saude('8.8.8.8', '192.168.0.10:4850')).statusCode).toBe(403)
  })

  it('no próprio computador, a resposta completa também traz o nome', async () => {
    const r = await saude('127.0.0.1', 'localhost:4850')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ ok: true, app: 'bc-calibracao', nome: hostname() })
    expect(r.json()).toHaveProperty('revisao')
    const pelaRede = (await saude('192.168.0.40', '192.168.0.10:4850')).json()
    expect(r.json()).toMatchObject({ id: pelaRede.id, instancia: pelaRede.instancia })
  })
})

describe('nome no endereço (Host) e DNS rebinding', () => {
  const vazio = new Set<string>()

  it('aceita o nome exato do computador e <nome>.local; nunca <nome>.<domínio qualquer>', () => {
    for (const host of ['servidor', 'SERVIDOR:4850', 'servidor.local', 'SERVIDOR.', 'servidor.local.:4850', 'Servidor.LOCAL'])
      expect(hostPermitido(host, vazio, 'SERVIDOR', ''), host).toBe(true)
    for (const host of [
      'servidor.atacante.com',
      'servidor.atacante.com:4850',
      'SERVIDOR.atacante.example.',
      'servidor.local.atacante.com',
      'servidor-x',
      'servidorx.local',
      'servidor.empresa.local',
    ])
      expect(hostPermitido(host, vazio, 'SERVIDOR', ''), host).toBe(false)
    // IPs e localhost continuam valendo
    for (const host of ['192.168.0.10:4850', '[::1]:4850', 'localhost:4850', '127.0.0.1'])
      expect(hostPermitido(host, vazio, 'SERVIDOR', ''), host).toBe(true)
  })

  it('sufixos que não existem na internet (do roteador ou da rede interna) também valem', () => {
    for (const host of ['servidor.lan', 'servidor.home.arpa:4850', 'SERVIDOR.internal', 'servidor.localdomain'])
      expect(hostPermitido(host, vazio, 'SERVIDOR', ''), host).toBe(true)
    expect(hostPermitido('servidor.lan.atacante.com', vazio, 'SERVIDOR', '')).toBe(false)
  })

  it('o domínio da empresa: pelo HOSTS_PERMITIDOS ou pelo domínio do Windows (USERDNSDOMAIN)', () => {
    expect(hostPermitido('servidor.empresa.local', lerHostsPermitidos('servidor.empresa.local'), 'SERVIDOR', '')).toBe(true)
    expect(hostPermitido('servidor.empresa.com.br:4850', vazio, 'SERVIDOR', 'EMPRESA.COM.BR')).toBe(true)
    expect(hostPermitido('servidor.outra.com.br', vazio, 'SERVIDOR', 'EMPRESA.COM.BR')).toBe(false)
  })

  it('pela API: GET /api/saude e o primeiro acesso com o nome do atacante dão 403 e não criam ninguém', async () => {
    const rebind = `${hostname()}.atacante.example:4850`
    expect((await saude('192.168.0.30', rebind)).statusCode).toBe(403)
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/primeiro-acesso',
      remoteAddress: '127.0.0.1',
      headers: { host: rebind, origin: `http://${rebind}`, 'x-bc-calibracao': '1' },
      payload: { nome: 'Suporte', login: 'suporte', senha: 'mesa-de-madeira-azul' },
    })
    expect(r.statusCode).toBe(403)
    expect(r.json().erro).toMatch(/HOSTS_PERMITIDOS/)
    expect(t.usuarios.situacao().usuarios).toBe(0)
    // O próprio nome do computador continua funcionando
    expect((await saude('192.168.0.30', `${hostname()}:4850`)).statusCode).toBe(200)
  })
})

describe('identidade do servidor', () => {
  const pastas: string[] = []
  const novaPasta = () => {
    const p = mkdtempSync(join(tmpdir(), 'bcf-id-'))
    pastas.push(p)
    return p
  }
  afterEach(() => {
    for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true })
  })
  const saudeDe = async (pastaDados: string) => {
    const { app } = await criarApp({ pastaDados, arquivoBanco: ':memory:', pastaEstatica: null })
    try {
      return (
        await app.inject({ method: 'GET', url: '/api/saude', remoteAddress: '192.168.0.40', headers: { host: '192.168.0.10' } })
      ).json()
    } finally {
      await app.close()
    }
  }

  it('o id fica guardado na pasta de dados e acompanha os dados; a instância muda a cada início', async () => {
    const pasta = novaPasta()
    const primeiro = await saudeDe(pasta)
    expect(readFileSync(join(pasta, ARQUIVO_ID), 'utf8').trim()).toBe(primeiro.id)
    const depois = await saudeDe(pasta) // reinício (ou atualização): mesmo servidor
    expect(depois.id).toBe(primeiro.id)
    expect(depois.instancia).not.toBe(primeiro.instancia)
    const outro = await saudeDe(novaPasta()) // outra instalação, mesmo nome de computador
    expect(outro.nome).toBe(primeiro.nome)
    expect(outro.id).not.toBe(primeiro.id)
  })

  it('arquivo estragado: cria um id novo', () => {
    const pasta = novaPasta()
    writeFileSync(join(pasta, ARQUIVO_ID), 'não é um id\n')
    const id = idDaInstalacao(pasta)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(idDaInstalacao(pasta)).toBe(id)
  })
})

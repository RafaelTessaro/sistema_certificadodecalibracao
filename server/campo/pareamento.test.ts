// O pareamento do celular (os códigos em memória, o limite de tentativas e os endereços do QR), o APK que vem no
// instalador e a classificação das rotas do app do celular no controle de acesso.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { NetworkInterfaceInfo } from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { CONTRATO_CAMPO, lerQrPareamento, ROTAS_CAMPO, TENTATIVAS_CODIGO } from '#shared/campo/protocolo.ts'
import { TABELA_ACESSO } from '../acesso.ts'
import { criarAppComLogin, type AppComLogin } from '../auxiliaresTeste.ts'
import { ApkDoCampo, LimitePorIp } from './apk.ts'
import { chamarCelular, parearCelular } from './auxiliaresTesteCampo.ts'
import { ipsDaRede, Pareamentos, sha256Token } from './pareamento.ts'

const placa = (address: string, extra: Partial<NetworkInterfaceInfo> = {}): NetworkInterfaceInfo =>
  ({
    address,
    family: 'IPv4',
    internal: false,
    mac: 'a4:5e:60:00:00:01',
    netmask: '255.255.255.0',
    cidr: null,
    ...extra,
  }) as NetworkInterfaceInfo

const PLACAS: NodeJS.Dict<NetworkInterfaceInfo[]> = {
  Ethernet: [placa('192.168.0.10'), { ...placa('fe80::1'), family: 'IPv6' } as NetworkInterfaceInfo],
  'vEthernet (WSL)': [placa('172.20.0.1')],
  'VirtualBox Host-Only Network': [placa('192.168.56.1')],
  'Wi-Fi': [placa('10.0.0.5')],
  'Loopback Pseudo-Interface 1': [placa('127.0.0.1', { internal: true })],
  Tailscale: [placa('100.64.0.7')],
  Estranha: [placa('169.254.10.2'), placa('8.8.8.8')],
}

const por = { id: 'adm', login: 'admin', nome: 'Admin' }
const pedido = (codigo: string, aparelhoId = '6f1c2a9e-3b4d-4c8e-9a1f-2b3c4d5e6f70') => ({
  codigo,
  aparelhoId,
  modelo: 'X',
  versaoApp: '1.1.0',
})

describe('endereços do QR', () => {
  it('só os IPv4 físicos da rede local, a rede 192.168 primeiro (sem adaptadores virtuais, loopback e link-local)', () => {
    expect(ipsDaRede(PLACAS)).toEqual(['192.168.0.10', '10.0.0.5'])
    const p = new Pareamentos({ placas: () => PLACAS, porta: 4850 })
    expect(p.enderecos()).toEqual(['http://192.168.0.10:4850', 'http://10.0.0.5:4850'])
    expect(p.enderecoDoQr(undefined, 'localhost:4850')).toBe('http://192.168.0.10:4850')
    expect(p.enderecoDoQr('10.0.0.5', undefined)).toBe('http://10.0.0.5:4850')
    expect(() => p.enderecoDoQr('https://x', undefined)).toThrow(/http/)
    // Sem placa reconhecida: o endereço do cabeçalho Host
    expect(new Pareamentos({ placas: () => ({}) }).enderecoDoQr(undefined, '192.168.1.20:4850')).toBe('http://192.168.1.20:4850')
  })

  it('o QR leva o endereço e o código, e o app o lê', () => {
    const p = new Pareamentos({ placas: () => PLACAS })
    const i = p.iniciar({ usuarioId: 'u1', tecnicoNome: 'Maurício', por, endereco: 'http://192.168.0.10:4850' })
    expect(lerQrPareamento(i.qr)).toEqual({ servidor: 'http://192.168.0.10:4850', codigo: i.codigo })
  })
})

describe('códigos de pareamento', () => {
  let agora = 1_000_000
  let p: Pareamentos
  beforeEach(() => {
    agora = 1_000_000
    p = new Pareamentos({ agora: () => agora, placas: () => PLACAS })
  })

  it('uso único; o token vem com o sha256 (só ele vai para o banco)', () => {
    const i = p.iniciar({ usuarioId: 'u1', tecnicoNome: 'M', por, endereco: '' })
    const a = p.aceitar(pedido(i.codigo), '192.168.0.20', false)
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.tokenSha256).toBe(createHash('sha256').update(a.token).digest('hex'))
    expect(sha256Token(a.token)).toBe(a.tokenSha256)
    expect(a.deNovo).toBe(false)
    expect(() => p.aceitar(pedido(i.codigo), '192.168.0.20', false)).toThrow(/venceu ou já foi usado/)
    expect(p.situacao(i.id)?.situacao).toBe('PAREADO')
  })

  it('vence em 10 minutos; um pedido novo para o mesmo técnico cancela o anterior', () => {
    const i = p.iniciar({ usuarioId: 'u1', tecnicoNome: 'M', por, endereco: '' })
    const j = p.iniciar({ usuarioId: 'u1', tecnicoNome: 'M', por, endereco: '' })
    expect(p.situacao(i.id)?.situacao).toBe('CANCELADO')
    agora += 10 * 60_000
    expect(() => p.aceitar(pedido(j.codigo), '192.168.0.20', false)).toThrow(/venceu ou já foi usado/)
    expect(p.situacao(j.id)?.situacao).toBe('EXPIRADO')
    // Esquecido uma hora depois
    agora += 61 * 60_000
    expect(p.situacao(j.id)).toBeNull()
  })

  it(`${TENTATIVAS_CODIGO} códigos errados invalidam os códigos em aberto`, () => {
    const i = p.iniciar({ usuarioId: 'u1', tecnicoNome: 'M', por, endereco: '' })
    const errado = i.codigo === '999999' ? '999998' : '999999'
    for (let n = 1; n <= TENTATIVAS_CODIGO; n++)
      expect(() => p.aceitar(pedido(errado), `192.168.0.${n}`, false)).toThrow(/Código errado/)
    expect(p.situacao(i.id)?.situacao).toBe('INVALIDADO')
    expect(() => p.aceitar(pedido(i.codigo), '192.168.0.99', false)).toThrow(/venceu/)
  })

  it('parear de novo: o código só vale para o mesmo aparelho', () => {
    const id = '6f1c2a9e-3b4d-4c8e-9a1f-2b3c4d5e6f70'
    const i = p.iniciar({ usuarioId: 'u1', tecnicoNome: 'M', por, endereco: '', aparelhoId: id })
    expect(() => p.aceitar(pedido(i.codigo, '7a2d3b0f-4c5e-4d9f-8b20-3c4d5e6f7081'), '192.168.0.20', false)).toThrow(
      /outro celular/,
    )
    expect(p.aceitar(pedido(i.codigo, id), '192.168.0.20', false).deNovo).toBe(true)
  })

  it('cancelar e desfazer', () => {
    const i = p.iniciar({ usuarioId: 'u1', tecnicoNome: 'M', por, endereco: '' })
    p.aceitar(pedido(i.codigo), '192.168.0.20', false)
    p.desfazer(i.id)
    expect(p.situacao(i.id)?.situacao).toBe('AGUARDANDO')
    expect(p.cancelar(i.id)).toBe(true)
    expect(() => p.aceitar(pedido(i.codigo), '192.168.0.20', false)).toThrow(/venceu/)
  })
})

describe('APK do instalador', () => {
  let pasta: string
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'bcf-apk-'))
  })
  afterEach(() => rmSync(pasta, { recursive: true, force: true }))

  it('o mais novo da pasta, com o tamanho e o sha256; sem arquivo, indisponível', () => {
    expect(new ApkDoCampo(join(pasta, 'nao-existe')).info().disponivel).toBe(false)
    writeFileSync(join(pasta, 'BC-Calibracao-1.1.0.apk'), 'apk velho')
    writeFileSync(join(pasta, 'BC-Calibracao-1.1.0+1.apk'), 'apk novo')
    writeFileSync(join(pasta, 'outro.apk'), 'não é')
    mkdirSync(join(pasta, 'BC-Calibracao-9.9.9.apk'))
    const info = new ApkDoCampo(pasta).info()
    expect(info).toEqual({
      disponivel: true,
      versao: '1.1.0+1',
      versionCode: 1010001,
      tamanho: 8,
      sha256: createHash('sha256').update('apk novo').digest('hex'),
      nomeArquivo: 'BC-Calibracao-1.1.0+1.apk',
    })
  })

  it('limite por IP: depois do máximo, a espera em segundos', () => {
    let agora = 0
    const l = new LimitePorIp(2, 60_000, () => agora)
    expect(l.contar('a')).toBeNull()
    expect(l.contar('a')).toBeNull()
    expect(l.contar('a')).toBe(60)
    expect(l.contar('b')).toBeNull()
    agora = 60_000
    expect(l.contar('a')).toBeNull()
  })

  describe('pelo servidor', () => {
    let t: AppComLogin
    beforeEach(async () => {
      writeFileSync(join(pasta, 'BC-Calibracao-1.2.0.apk'), Buffer.from('PK\u0003\u0004 apk de teste'))
      t = await criarAppComLogin({ pastaApk: pasta })
    })
    afterEach(async () => t.fechar())

    it('GET /api/campo/apk e /info são públicos; o olá avisa a versão nova', async () => {
      const info = (await t.app.inject({ method: 'GET', url: '/api/campo/apk/info' })).json()
      expect(info).toMatchObject({ disponivel: true, versao: '1.2.0', nomeArquivo: 'BC-Calibracao-1.2.0.apk' })
      const apk = await t.app.inject({ method: 'GET', url: '/api/campo/apk' })
      expect(apk.statusCode).toBe(200)
      expect(apk.headers['content-type']).toBe('application/vnd.android.package-archive')
      expect(apk.headers['content-disposition']).toBe('attachment; filename="BC-Calibracao-1.2.0.apk"')
      expect(apk.rawPayload.toString('latin1')).toContain('apk de teste')
      const { token } = await parearCelular(t)
      const ola = (versaoApp: string) =>
        chamarCelular(t, token, 'POST', '/api/campo/ola', {
          payload: { versaoApp, contrato: CONTRATO_CAMPO, agora: new Date().toISOString(), estados: [] },
        })
      expect((await ola('1.1.0')).json().appDisponivel).toEqual({ versao: '1.2.0', url: '/api/campo/apk' })
      expect((await ola('1.2.0')).json().appDisponivel).toBeUndefined()
    })

    it('muitos downloads do mesmo IP: 429', async () => {
      let ultima = 0
      for (let i = 0; i < 25 && ultima !== 429; i++)
        ultima = (await t.app.inject({ method: 'GET', url: '/api/campo/apk', remoteAddress: '192.168.0.77' })).statusCode
      expect(ultima).toBe(429)
    })
  })
})

describe('controle de acesso', () => {
  it('toda rota do celular está na tabela de acesso, com a regra do protocolo', () => {
    for (const r of Object.values(ROTAS_CAMPO)) expect(TABELA_ACESSO[`${r.metodo} ${r.caminho}`], r.caminho).toBe(r.regra)
  })
})

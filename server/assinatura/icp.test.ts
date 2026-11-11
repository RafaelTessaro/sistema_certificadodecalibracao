// A leitura dos campos ICP-Brasil do certificado, a cadeia (só uma raiz da lista fecha) e a busca da AC pelo caIssuers.

import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { arquivoPki, derPki, RESPONSAVEL, raizesTeste, sha256, x509Pki } from './__fixtures__/pki.ts'
import {
  buscarComTempoLimite,
  certificadosDe,
  cnpjDoCertificado,
  emissorDoCertificado,
  lerCertificado,
  montarCadeia,
  tipoPelaPolitica,
  titularDoCertificado,
} from './icp.ts'

describe('icp', () => {
  it('lê o CNPJ (otherName, CN, serialNumber), a política, o uso da chave e o caIssuers', () => {
    const c = lerCertificado(derPki('ecnpj'))
    expect(c.cnpjs).toEqual([
      { cnpj: '12345678000195', origem: 'otherName 2.16.76.1.3.3' },
      { cnpj: '12345678000195', origem: 'nome (CN)' },
    ])
    expect(cnpjDoCertificado(c)).toEqual({ cnpj: '12345678000195' })
    expect(titularDoCertificado(c)).toBe('BALANÇAS TESTE LTDA')
    expect(emissorDoCertificado(c)).toBe('AC Intermediaria de Teste v1')
    expect(c.politicas).toEqual(['2.16.76.1.2.1.51'])
    expect(tipoPelaPolitica(c.politicas)).toBe('A1')
    expect(c.usos).toEqual(['digitalSignature', 'nonRepudiation', 'keyEncipherment'])
    expect(c.ca).toBe(false)
    expect(c.caIssuers).toEqual(['http://repositorio.teste.invalid/ac-teste.p7b'])
    expect(c.otherNames).toEqual(['2.16.76.1.3.4', '2.16.76.1.3.2', '2.16.76.1.3.3', '2.16.76.1.3.7'])
    // Os valores dos otherNames (o CPF do responsável) não saem da leitura
    expect(JSON.stringify({ ...c, titular: [...c.titular], emissor: [...c.emissor] })).not.toContain(RESPONSAVEL)

    expect(cnpjDoCertificado(lerCertificado(derPki('conflito')))).toEqual({ cnpj: '12345678000195', conflito: '98765432000198' })
    expect(lerCertificado(derPki('ses')).cnpjs).toEqual([{ cnpj: '12345678000195', origem: 'serialNumber do titular' }])
    expect(lerCertificado(derPki('ecpf')).cnpjs).toEqual([])
    expect(tipoPelaPolitica(lerCertificado(derPki('ses')).politicas)).toBe('SE-S')
    expect(tipoPelaPolitica(['2.16.76.1.2.3.51'])).toBe('A3')
    expect(tipoPelaPolitica(['1.2.3'])).toBe('')
    expect(lerCertificado(derPki('ac')).ca).toBe(true)
  })

  it('a cadeia só fecha numa raiz da lista; a raiz que veio no arquivo não vale sozinha', () => {
    const titular = x509Pki('ecnpj')
    const extras = [x509Pki('raiz'), x509Pki('outro'), x509Pki('ac')]
    const { intermediarias, raiz } = montarCadeia(titular, extras, raizesTeste())
    expect(intermediarias.map((c) => sha256(Buffer.from(c.raw)))).toEqual([sha256(derPki('ac'))])
    expect(raiz && sha256(Buffer.from(raiz.raw))).toBe(sha256(derPki('raiz')))
    expect(montarCadeia(titular, extras, []).raiz).toBeUndefined()
    expect(montarCadeia(titular, [], raizesTeste()).raiz).toBeUndefined()
  })

  it('lê os certificados de DER, PEM e PKCS#7; o resto é ignorado', () => {
    const p7 = certificadosDe(arquivoPki('ac-teste.p7b'))
    expect(p7.map((c) => sha256(Buffer.from(c.raw)))).toEqual([sha256(derPki('ac')), sha256(derPki('raiz'))])
    expect(certificadosDe(derPki('ac'))).toHaveLength(1)
    expect(certificadosDe(Buffer.concat([arquivoPki('ac.crt'), arquivoPki('raiz.crt')]))).toHaveLength(2)
    expect(certificadosDe(Buffer.from('lixo'))).toEqual([])
  })

  it('a busca pelo caIssuers: só http/https, com tempo limite', async () => {
    const servidor = createServer((req, res) => {
      if (req.url === '/lento') setTimeout(() => res.end('x'), 2_000)
      else res.end(derPki('ac'))
    })
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
    const { port } = servidor.address() as AddressInfo
    try {
      const buscar = buscarComTempoLimite(200, { permitirRedeLocal: true })
      expect(certificadosDe(await buscar(`http://127.0.0.1:${port}/ac.crt`))).toHaveLength(1)
      await expect(buscar(`http://127.0.0.1:${port}/lento`)).rejects.toThrow()
      await expect(buscar('file:///etc/passwd')).rejects.toThrow(/não suportado/)
    } finally {
      await new Promise<void>((ok) => servidor.close(() => ok()).closeAllConnections())
    }
  })

  it('a busca pelo caIssuers recusa a rede local (loopback, privada, link-local), também depois de um redirecionamento', async () => {
    const pedidos: string[] = []
    const servidor = createServer((req, res) => {
      pedidos.push(req.url ?? '')
      if (req.url === '/redireciona') res.writeHead(302, { location: `http://localhost:${porta()}/ac.crt` }).end()
      else res.end(derPki('ac'))
    })
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
    const porta = () => (servidor.address() as AddressInfo).port
    try {
      const buscar = buscarComTempoLimite(2_000)
      for (const url of [
        `http://127.0.0.1:${porta()}/ac.crt`,
        `http://localhost:${porta()}/ac.crt`,
        `http://[::1]:${porta()}/ac.crt`,
        'http://10.0.0.1/ac.crt',
        'http://192.168.0.10/ac.crt',
        'http://172.16.5.4/ac.crt',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::ffff:127.0.0.1]/ac.crt',
        'http://0.0.0.0/ac.crt',
      ])
        await expect(buscar(url), url).rejects.toThrow(/rede local/)
      expect(pedidos).toEqual([])
      // O redirecionamento para a rede local também é recusado (o primeiro pedido é permitido só neste teste)
      const comPrimeiro = buscarComTempoLimite(2_000, { permitirRedeLocal: (n) => n === 0 })
      await expect(comPrimeiro(`http://127.0.0.1:${porta()}/redireciona`)).rejects.toThrow(/rede local/)
      expect(pedidos).toEqual(['/redireciona'])
    } finally {
      await new Promise<void>((ok) => servidor.close(() => ok()).closeAllConnections())
    }
  })

  it('a busca pelo caIssuers para de ler ao passar de 1 MB (sem ler a resposta inteira)', async () => {
    let enviados = 0
    const servidor = createServer((req, res) => {
      if (req.url === '/declarado') {
        res.writeHead(200, { 'content-length': String(300 << 20) })
        res.write(Buffer.alloc(1024))
        return
      }
      // Sem Content-Length: manda 64 KB por vez até a conexão cair (até 300 MB)
      const bloco = Buffer.alloc(64 << 10)
      const mandar = () => {
        while (enviados < 300 << 20) {
          enviados += bloco.length
          if (!res.write(bloco)) return void res.once('drain', mandar)
        }
        res.end()
      }
      res.on('close', () => res.destroy())
      mandar()
    })
    await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
    const { port } = servidor.address() as AddressInfo
    try {
      const buscar = buscarComTempoLimite(5_000, { permitirRedeLocal: true })
      await expect(buscar(`http://127.0.0.1:${port}/declarado`)).rejects.toThrow(/grande demais/)
      await expect(buscar(`http://127.0.0.1:${port}/infinito`)).rejects.toThrow(/grande demais/)
      // Parou perto de 1 MB (o que estava nos buffers do sistema), longe dos 300 MB
      expect(enviados).toBeLessThan(32 << 20)
    } finally {
      await new Promise<void>((ok) => servidor.close(() => ok()).closeAllConnections())
    }
  })
})

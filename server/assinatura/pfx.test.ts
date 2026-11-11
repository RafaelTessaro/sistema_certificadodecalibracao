// Abrir o .pfx da empresa e conferir tudo o que a §2.4 do plano exige antes de guardar ou assinar: os formatos que o
// Windows e o OpenSSL exportam, as recusas com mensagem em português, o CNPJ (também alfanumérico e no SE-S) e a
// cadeia até uma raiz confiável (a de teste só pela lista injetada; em produção, só as ICP-Brasil fixadas).

import { generateKeyPairSync, sign, verify, X509Certificate } from 'node:crypto'
import forge from 'node-forge'
import { describe, expect, it } from 'vitest'
import {
  AGORA,
  arquivoPki,
  CNPJ_EMPRESA,
  derPki,
  RESPONSAVEL,
  raizesTeste,
  SENHA,
  SENHA_ACENTO,
  sha256,
} from './__fixtures__/pki.ts'
import { type A1ParaAssinar, ErroCertificadoDigital } from './contrato.ts'
import { abrirPfx, avisoVencimento, completarCadeia, conferirA1, diasParaVencer } from './pfx.ts'
import { raizesIcpBrasil, RAIZES_ICP_BRASIL } from './raizes.ts'

const raizes = raizesTeste()
const abrir = (arquivo: string, senha = SENHA) => abrirPfx(arquivoPki(arquivo), senha, { raizes })
const conferir = (a1: A1ParaAssinar, o: { cnpjEmpresa?: string; agora?: Date } = {}) =>
  conferirA1(a1, { cnpjEmpresa: o.cnpjEmpresa ?? CNPJ_EMPRESA, agora: o.agora ?? AGORA, raizes })
/** Abre e confere: o que a tela de Configurações faz no envio. */
const abrirEConferir = (arquivo: string, o: { senha?: string; cnpjEmpresa?: string; agora?: Date } = {}) =>
  conferir(abrir(arquivo, o.senha), o)

/** Toda mensagem de recusa: um ErroCertificadoDigital, sem a senha e sem o CPF do responsável. */
function recusa(f: () => unknown, motivo: RegExp) {
  let erro: unknown
  try {
    f()
  } catch (e) {
    erro = e
  }
  expect(erro).toBeInstanceOf(ErroCertificadoDigital)
  const m = (erro as Error).message
  expect(m).toMatch(motivo)
  expect(m).not.toContain(SENHA)
  expect(m).not.toContain(RESPONSAVEL)
  expect(m).not.toContain('12345678909')
  return m
}

describe('abrirPfx', () => {
  it.each([
    ['ecnpj-aes.pfx', SENHA],
    ['ecnpj-3des.pfx', SENHA],
    ['ecnpj-rc2.pfx', SENHA],
    ['ecnpj-acento.pfx', SENHA_ACENTO],
    ['ecnpj-acento-3des.pfx', SENHA_ACENTO],
  ])('abre %s: a chave, o certificado no DER original e a cadeia até a raiz', (arquivo, senha) => {
    const a1 = abrir(arquivo, senha)
    expect(a1.dados).toEqual({
      sha256: sha256(derPki('ecnpj')),
      titular: 'BALANÇAS TESTE LTDA',
      cnpj: '12345678000195',
      tipo: 'A1',
      emissor: 'AC Intermediaria de Teste v1',
      serie: '1A2B3C02',
      validoDe: '2026-01-01T00:00:00.000Z',
      validoAte: '2046-12-31T23:59:59.000Z',
    })
    expect(a1.certificadoDer.equals(derPki('ecnpj'))).toBe(true)
    expect(a1.cadeiaDer.map((c) => sha256(c))).toEqual([sha256(derPki('ac')), sha256(derPki('raiz'))])
    // A chave assina e o certificado confere
    const assinatura = sign('sha256', Buffer.from('teste'), a1.chave)
    expect(verify('sha256', Buffer.from('teste'), derPublica(a1), assinatura)).toBe(true)
    expect(conferir(a1)).toEqual({ avisos: [] })
  })

  it('recusa a senha errada (também a senha com acento digitada sem acento)', () => {
    for (const arquivo of ['ecnpj-aes.pfx', 'ecnpj-3des.pfx', 'ecnpj-rc2.pfx'])
      recusa(() => abrir(arquivo, 'Senha@124'), /^A senha não confere com o arquivo do certificado\.$/)
    recusa(() => abrir('ecnpj-acento.pfx', 'Balanca@2026'), /senha não confere/)
    recusa(() => abrir('ecnpj-acento-3des.pfx', 'Balanca@2026'), /senha não confere/)
  })

  it('recusa o que não é um .pfx', () => {
    recusa(() => abrirPfx(Buffer.from('não é um certificado'), SENHA), /não é um certificado digital \.pfx ou \.p12/)
    recusa(() => abrirPfx(Buffer.alloc(0), SENHA), /não é um certificado digital/)
    recusa(() => abrirPfx(derPki('ecnpj'), SENHA), /não é um certificado digital/)
  })

  it('recusa, sem travar o servidor, o arquivo com um número de iterações acima do teto (MAC e PBES2)', () => {
    const der = (a: forge.asn1.Asn1) => Buffer.from(forge.asn1.toDer(a).getBytes(), 'binary')
    const ler = (b: Buffer | string) =>
      forge.asn1.fromDer(forge.util.createBuffer(typeof b === 'string' ? b : b.toString('binary')))
    const inteiro = (n: number) =>
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, forge.asn1.integerToDer(n).getBytes())
    const valor = (a: forge.asn1.Asn1) => a.value as forge.asn1.Asn1[]
    const demorou = (f: () => unknown, motivo: RegExp) => {
      const inicio = performance.now()
      recusa(f, motivo)
      expect(performance.now() - inicio).toBeLessThan(2_000)
    }
    // PFX ::= SEQUENCE { version, authSafe, macData { mac, macSalt, iterations } }: o MAC com 2 bilhões de iterações
    const comMac = ler(arquivoPki('ecnpj-aes.pfx'))
    valor(valor(comMac)[2])[2] = inteiro(2_000_000_000)
    demorou(() => abrirPfx(der(comMac), SENHA, { raizes }), /iterações/)
    // Sem o MAC, o PBKDF2 do PBES2 do contêiner cifrado dos certificados com 50 milhões de iterações
    const semMac = ler(arquivoPki('ecnpj-aes.pfx'))
    valor(semMac).splice(2, 1)
    const octeto = valor(valor(valor(semMac)[1])[1])[0]
    const seguro = ler(octeto.value as string)
    const cifrado = valor(seguro).find(
      (ci) => forge.asn1.derToOid(valor(ci)[0].value as string) === forge.pki.oids.encryptedData,
    )!
    // ContentInfo { oid, [0] EncryptedData { version, EncryptedContentInfo { tipo, AlgorithmIdentifier { PBES2, { kdf { PBKDF2, { sal, iterações } } } } } } }
    const algoritmo = valor(valor(valor(valor(cifrado)[1])[0])[1])[1]
    const pbkdf2 = valor(valor(valor(algoritmo)[1])[0])[1]
    valor(pbkdf2)[1] = inteiro(50_000_000)
    octeto.value = forge.asn1.toDer(seguro).getBytes()
    demorou(() => abrirPfx(der(semMac), SENHA, { raizes }), /iterações/)
    // Os exportados pelo Windows (2.000) e pelo OpenSSL 3 (2.048) abrem
    expect(abrir('ecnpj-aes.pfx').dados.cnpj).toBe('12345678000195')
  })

  it('não deixa uma contagem de iterações negativa ou zero baixar o orçamento da abertura', () => {
    // O forge lê o INTEGER com getInt(32): 0x80000000 sai -2.147.483.648, e o PBKDF2 dele com c < 2 faz só uma rodada.
    // Um bag assim decifraria certo e zeraria o total gasto, e os bags de 100.000 seguintes passariam todos.
    const { asn1 } = forge
    const seq = (v: forge.asn1.Asn1[]) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, v)
    const oid = (o: string) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(o).getBytes())
    const ci = (der: string) =>
      seq([
        oid(forge.pki.oids.data),
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, der)]),
      ])
    const bag = (epki: forge.asn1.Asn1) =>
      seq([oid(forge.pki.oids.pkcs8ShroudedKeyBag), asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [epki])])
    const cifrar = (count: number) =>
      forge.pki.encryptPrivateKeyInfo(seq([]), SENHA, { algorithm: 'aes128', count, prfAlgorithm: 'sha256', saltSize: 1 })
    // EncryptedPrivateKeyInfo { AlgorithmIdentifier { PBES2, { kdf { PBKDF2, { sal, iterações, ... } } } }, dados }
    const comIteracoes = (bytes: string) => {
      const e = cifrar(1) as unknown as { value: { value: { value: { value: { value: { value: string }[] }[] }[] }[] }[] }
      e.value[0].value[1].value[0].value[1].value[1].value = bytes
      return e as unknown as forge.asn1.Asn1
    }
    const caro = cifrar(100_000)
    const pfx = (bags: forge.asn1.Asn1[]) =>
      Buffer.from(
        asn1
          .toDer(
            seq([
              asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, '\x03'),
              ci(asn1.toDer(seq([ci(asn1.toDer(seq(bags)).getBytes())])).getBytes()),
            ]),
          )
          .getBytes(),
        'binary',
      )
    for (const iteracoes of ['\x80\x00\x00\x00', '\xff\xff\xff\xff', '\x00']) {
      const inicio = performance.now()
      recusa(
        () => abrirPfx(pfx([bag(comIteracoes(iteracoes)), ...Array.from({ length: 8 }, () => bag(caro))]), SENHA),
        /iterações/,
      )
      expect(performance.now() - inicio).toBeLessThan(1_000)
    }
  })

  it('recusa o arquivo sem chave, com duas chaves ou com a chave de outro certificado', () => {
    recusa(() => abrir('sem-chave.pfx'), /não traz a chave privada/)
    recusa(() => abrir('duas-chaves.pfx'), /mais de uma chave privada/)
    recusa(() => abrir('chave-trocada.pfx'), /Nenhum certificado do arquivo corresponde à chave privada/)
  })

  it('recusa chave EC, certificado de AC, e-CPF, política fora de A1/SE-S e certificado sem assinatura digital', () => {
    recusa(() => abrirEConferir('ec.pfx'), /curva elíptica.*ainda não/)
    recusa(() => abrirEConferir('deac.pfx'), /autoridade certificadora \(AC\)/)
    recusa(() => abrirEConferir('ecpf.pfx'), /pessoa física \(e-CPF\)/)
    // O SE-S também vale (é o tipo das renovações): a recusa não pede só o A1
    recusa(
      () => abrirEConferir('a3.pfx'),
      /não é do tipo A1 nem SE-S \(A3\)\. Envie o e-CNPJ A1 ou SE-S da empresa, em arquivo \.pfx\.$/,
    )
    recusa(() => abrirEConferir('semassinatura.pfx'), /não permite assinatura digital/)
  })

  it('recusa o vencido e o que ainda não vale, pelo relógio do servidor', () => {
    // As datas no horário de Brasília (0 h UTC de 01/06 = 21 h de 31/05)
    // Na tela de instalar: o texto pede o arquivo novo (não manda para a tela em que a pessoa já está)
    const vencido = recusa(
      () => abrirEConferir('vencido.pfx'),
      /^O certificado venceu em 31\/05\/2026\. Escolha o arquivo do certificado novo \(renovado\)\.$/,
    )
    expect(vencido).not.toContain('Configurações')
    recusa(() => abrirEConferir('futuro.pfx'), /só vale a partir de 31\/12\/2044.*data e a hora do servidor/)
    // O mesmo certificado, conferido num relógio fora da validade
    const a1 = abrir('ecnpj-aes.pfx')
    recusa(() => conferir(a1, { agora: new Date('2025-12-31T23:00:00Z') }), /só vale a partir de 31\/12\/2025/)
  })

  it('recusa a cadeia que não chega à raiz; com o endereço caIssuers, busca a AC uma vez', async () => {
    const semCadeia = abrir('ecnpj-sem-cadeia.pfx')
    expect(semCadeia.cadeiaDer).toEqual([])
    recusa(() => conferir(semCadeia), /não chega a uma raiz da ICP-Brasil.*Incluir todos os certificados no caminho/)

    const pedidos: string[] = []
    const completo = await completarCadeia(semCadeia, {
      raizes,
      buscar: async (url) => {
        pedidos.push(url)
        return arquivoPki('ac-teste.p7b')
      },
    })
    expect(pedidos).toEqual(['http://repositorio.teste.invalid/ac-teste.p7b'])
    expect(completo.cadeiaDer.map(sha256)).toEqual([sha256(derPki('ac')), sha256(derPki('raiz'))])
    expect(completo.chave).toBe(semCadeia.chave)
    expect(conferir(completo)).toEqual({ avisos: [] })

    // Sem rede (ou o endereço fora do ar): continua recusado, sem exceção da busca
    const semRede = await completarCadeia(semCadeia, {
      raizes,
      buscar: async () => {
        throw new Error('sem rede')
      },
    })
    recusa(() => conferir(semRede), /não chega a uma raiz/)
    // A cadeia completa não busca nada
    const nada = await completarCadeia(abrir('ecnpj-aes.pfx'), {
      raizes,
      buscar: async () => {
        throw new Error('não devia buscar')
      },
    })
    expect(nada.cadeiaDer).toHaveLength(2)
  })

  it('a busca pelo caIssuers tenta no máximo 2 endereços (http/https) no total', async () => {
    // Um certificado com 6 endereços caIssuers (um ldap, que não conta) no lugar do titular do arquivo sem a cadeia
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const cert = forge.pki.createCertificate()
    cert.publicKey = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }) as string)
    cert.serialNumber = '01'
    cert.validity.notBefore = new Date('2026-01-01T00:00:00Z')
    cert.validity.notAfter = new Date('2046-01-01T00:00:00Z')
    cert.setSubject([{ name: 'commonName', value: 'TESTE AIA' }])
    cert.setIssuer([{ name: 'commonName', value: 'AC QUE NAO EXISTE' }])
    const { asn1 } = forge
    const descricao = (url: string) =>
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.3.6.1.5.5.7.48.2').getBytes()),
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 6, false, url),
      ])
    const urls = ['ldap://ac.invalid/x', ...[1, 2, 3, 4, 5].map((n) => `http://ac${n}.teste.invalid/ac.p7b`)]
    const aia = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, urls.map(descricao))
    cert.setExtensions([{ id: '1.3.6.1.5.5.7.1.1', value: asn1.toDer(aia).getBytes() }])
    cert.sign(
      forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }) as string),
      forge.md.sha256.create(),
    )
    const certificadoDer = Buffer.from(asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary')
    const a1 = { ...abrir('ecnpj-sem-cadeia.pfx'), certificadoDer }

    const pedidos: string[] = []
    const r = await completarCadeia(a1, {
      raizes,
      buscar: async (url) => {
        pedidos.push(url)
        throw new Error('fora do ar')
      },
    })
    expect(pedidos).toEqual(['http://ac1.teste.invalid/ac.p7b', 'http://ac2.teste.invalid/ac.p7b'])
    expect(r).toBe(a1)
  })

  it('em produção, só as raízes ICP-Brasil fixadas: a raiz de teste não vale', () => {
    expect(raizesIcpBrasil().map((r) => sha256(Buffer.from(r.raw)))).toEqual(RAIZES_ICP_BRASIL.map((r) => r.sha256))
    const a1 = abrirPfx(arquivoPki('ecnpj-aes.pfx'), SENHA)
    // A raiz de teste veio no arquivo, mas não está na lista: a cadeia não fecha
    expect(a1.cadeiaDer.map(sha256)).toEqual([sha256(derPki('ac')), sha256(derPki('raiz'))])
    recusa(() => conferirA1(a1, { cnpjEmpresa: CNPJ_EMPRESA, agora: AGORA }), /não chega a uma raiz da ICP-Brasil/)
  })

  it('confere o CNPJ com o da empresa: outra empresa recusa, filial avisa, vazio pede para preencher', () => {
    // Termina dizendo o que fazer (enviar o e-CNPJ desta empresa), e não mudar o CNPJ da empresa para casar com o certificado
    recusa(
      () => abrirEConferir('outro.pfx'),
      /^O certificado é do CNPJ 98\.765\.432\/0001-98, e o da empresa em Configurações é 12\.345\.678\/0001-95\. Envie o e-CNPJ desta empresa\.$/,
    )
    expect(abrirEConferir('filial.pfx')).toEqual({
      avisos: [expect.stringMatching(/CNPJ 12\.345\.678\/0002-76.*outro estabelecimento.*12\.345\.678\/0001-95/)],
    })
    recusa(() => abrirEConferir('ecnpj-aes.pfx', { cnpjEmpresa: '' }), /Preencha o CNPJ da empresa em Configurações/)
    // O CNPJ da empresa com ou sem máscara
    expect(abrirEConferir('ecnpj-aes.pfx', { cnpjEmpresa: '12345678000195' })).toEqual({ avisos: [] })
  })

  it('recusa o certificado com dois CNPJs diferentes', () => {
    recusa(() => abrirEConferir('conflito.pfx'), /dois CNPJs diferentes \(12\.345\.678\/0001-95 e 98\.765\.432\/0001-98\)/)
  })

  it('lê o CNPJ alfanumérico (PrintableString) e o do SE-S, que só vem no serialNumber', () => {
    const alfa = abrir('alfanumerico.pfx')
    expect(alfa.dados.cnpj).toBe('12ABC34501DE35')
    expect(conferir(alfa, { cnpjEmpresa: '12.ABC.345/01DE-35' })).toEqual({ avisos: [] })
    const ses = abrir('ses.pfx')
    expect(ses.dados).toMatchObject({ tipo: 'SE-S', cnpj: '12345678000195', titular: 'BALANÇAS TESTE LTDA' })
    expect(conferir(ses)).toEqual({ avisos: [] })
  })

  it('avisa a partir de 30 dias do vencimento', () => {
    const a1 = abrir('ecnpj-aes.pfx')
    expect(conferir(a1, { agora: new Date('2046-11-30T12:00:00Z') })).toEqual({ avisos: [] })
    // Na conferência (a tela de instalar) e no cartão: o fato, sem mandar para a tela em que a pessoa já está
    expect(conferir(a1, { agora: new Date('2046-12-11T12:00:00Z') }).avisos).toEqual([
      // O certificado vence numa hora do dia (a da emissão dele): a hora vai junto da data (23:59:59 UTC = 20:59 em Brasília)
      'O certificado digital vence em 20 dias, em 31/12/2046 às 20:59.',
    ])
    expect(diasParaVencer(a1.dados.validoAte, new Date('2046-12-31T10:00:00Z'))).toBe(0)
    expect(avisoVencimento(a1.dados.validoAte, new Date('2046-12-31T10:00:00Z'))).toMatch(/vence hoje/)
    expect(avisoVencimento(a1.dados.validoAte, new Date('2046-12-30T12:00:00Z'))).toMatch(/vence amanhã/)
    expect(avisoVencimento(a1.dados.validoAte, AGORA)).toBeNull()
    // Os dias são os do calendário de Brasília (a data impressa ao lado): às 23h30 de 11/11, o que vence às 11h de 12/11
    // vence amanhã, e não hoje
    const noite = new Date('2026-11-12T02:30:00Z') // 11/11/2026 23:30 em Brasília
    expect(avisoVencimento('2026-11-12T14:00:00Z', noite)).toBe('O certificado digital vence amanhã, em 12/11/2026 às 11:00.')
    expect(avisoVencimento('2026-11-13T14:00:00Z', noite)).toBe('O certificado digital vence em 2 dias, em 13/11/2026 às 11:00.')
    expect(avisoVencimento('2026-11-12T02:45:00Z', noite)).toBe('O certificado digital vence hoje, em 11/11/2026 às 23:45.')
    expect(diasParaVencer('2026-11-12T14:00:00Z', noite)).toBe(1)
    // Vencido hoje: negativo (não "vence hoje")
    expect(diasParaVencer('2026-11-12T02:00:00Z', noite)).toBe(-1)
    expect(avisoVencimento('2026-11-12T02:00:00Z', noite)).toBeNull()
  })

  it('nunca devolve o conteúdo do 2.16.76.1.3.4 (CPF e nascimento do responsável)', () => {
    const a1 = abrir('ecnpj-aes.pfx')
    const publico = JSON.stringify({ ...a1.dados, avisos: conferir(a1).avisos })
    expect(publico).not.toContain(RESPONSAVEL)
    expect(publico).not.toContain('12345678909')
    expect(publico).not.toContain('19800101')
  })
})

/** A chave pública do certificado aberto (para conferir a assinatura feita com a chave). */
const derPublica = (a1: A1ParaAssinar) => new X509Certificate(a1.certificadoDer).publicKey

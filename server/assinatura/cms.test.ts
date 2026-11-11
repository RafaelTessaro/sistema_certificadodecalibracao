// O CMS da assinatura (PAdES B-B): exatamente os três atributos assinados, em ordem DER, a assinatura RSA conferida
// pelo node:crypto, a remontagem pelo valor guardado (conferido pela chave pública) e o carimbo do tempo como
// atributo não assinado.

import { createHash, verify, X509Certificate } from 'node:crypto'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'
import { beforeAll, describe, expect, it } from 'vitest'
import { arquivoPki, derPki, raizesTeste, SENHA, sha256 } from './__fixtures__/pki.ts'
import { type A1ParaAssinar, ErroAssinaturaPdf } from './contrato.ts'
import { conferirCms, formaDer, lerCms, montarCms, OID_CMS, remontarCms } from './cms.ts'
import { abrirPfx } from './pfx.ts'

let a1: A1ParaAssinar
const conteudo = Buffer.from('os bytes cobertos pelo /ByteRange')

beforeAll(() => {
  a1 = abrirPfx(arquivoPki('ecnpj-aes.pfx'), SENHA, { raizes: raizesTeste() })
})

const der = (x: { toSchema(): asn1js.AsnType }) => Buffer.from(x.toSchema().toBER(false))

describe('montarCms', () => {
  it('SignedData destacado com content-type, message-digest e signing-certificate-v2, em ordem DER', async () => {
    const { cms, valor } = await montarCms(a1, conteudo)
    const ci = pkijs.ContentInfo.fromBER(cms)
    expect(ci.contentType).toBe(OID_CMS.signedData)
    const sd = new pkijs.SignedData({ schema: ci.content })
    expect(sd.version).toBe(1)
    expect(sd.encapContentInfo.eContentType).toBe(OID_CMS.data)
    expect(sd.encapContentInfo.eContent).toBeUndefined() // destacado
    expect(sd.digestAlgorithms.map((a) => a.algorithmId)).toEqual([OID_CMS.sha256])
    // A cadeia inteira: o titular, a AC e a raiz, nos bytes originais, na ordem do DER (SET OF: pela codificação, X.690 11.6)
    const ders = ['ecnpj', 'ac', 'raiz'].map((n) => derPki(n))
    expect(sd.certificates!.map((c) => sha256(der(c as pkijs.Certificate)))).toEqual([...ders].sort(Buffer.compare).map(sha256))
    // O SET OF [0] dos certificados sai como os bytes deles concatenados nessa ordem
    expect(cms.includes(Buffer.concat([...ders].sort(Buffer.compare)))).toBe(true)
    expect(sd.signerInfos).toHaveLength(1)
    const si = sd.signerInfos[0]
    expect(si.version).toBe(1)
    expect(si.sid).toBeInstanceOf(pkijs.IssuerAndSerialNumber)
    expect(si.digestAlgorithm.algorithmId).toBe(OID_CMS.sha256)
    expect(si.signatureAlgorithm.algorithmId).toBe(OID_CMS.sha256ComRsa)
    expect(si.signatureAlgorithm.algorithmParams).toBeInstanceOf(asn1js.Null)
    expect(si.unsignedAttrs).toBeUndefined()

    const atributos = si.signedAttrs!.attributes
    expect(atributos.map((a) => a.type).sort()).toEqual(
      [OID_CMS.contentType, OID_CMS.messageDigest, OID_CMS.signingCertificateV2].sort(),
    )
    // Sem signing-time e sem política (PAdES B-B; a hora vai no /M)
    expect(atributos.some((a) => a.type === '1.2.840.113549.1.9.5' || a.type === OID_CMS.sigPolicyId)).toBe(false)
    // Ordem DER (X.690, 11.6): crescente pela codificação
    const codificados = atributos.map((a) => Buffer.from(a.toSchema().toBER(false)))
    expect([...codificados].sort(Buffer.compare)).toEqual(codificados)

    const valorDe = (oid: string) => atributos.find((a) => a.type === oid)!.values[0]
    expect((valorDe(OID_CMS.contentType) as asn1js.ObjectIdentifier).valueBlock.toString()).toBe(OID_CMS.data)
    expect(Buffer.from((valorDe(OID_CMS.messageDigest) as asn1js.OctetString).valueBlock.valueHexView)).toEqual(
      createHash('sha256').update(conteudo).digest(),
    )
    // ESSCertIDv2 só do titular, sem hashAlgorithm (o padrão é sha256), com o certHash e o issuerSerial
    const certs = (valorDe(OID_CMS.signingCertificateV2) as asn1js.Sequence).valueBlock.value
    expect(certs).toHaveLength(1)
    const ids = (certs[0] as asn1js.Sequence).valueBlock.value
    expect(ids).toHaveLength(1)
    const [certHash, issuerSerial] = (ids[0] as asn1js.Sequence).valueBlock.value
    expect(certHash).toBeInstanceOf(asn1js.OctetString)
    expect(Buffer.from((certHash as asn1js.OctetString).valueBlock.valueHexView).toString('hex')).toBe(sha256(derPki('ecnpj')))
    const serie = (issuerSerial as asn1js.Sequence).valueBlock.value[1] as asn1js.Integer
    expect(Buffer.from(serie.valueBlock.valueHexView).toString('hex').toUpperCase()).toBe(a1.dados.serie)

    // A assinatura RSA confere pelo node:crypto, sobre os atributos com a etiqueta SET (RFC 5652, 5.4)
    const setDer = Buffer.from(new asn1js.Set({ value: atributos.map((a) => a.toSchema()) }).toBER(false))
    const publica = new X509Certificate(a1.certificadoDer).publicKey
    expect(verify('sha256', setDer, publica, valor)).toBe(true)
    expect(Buffer.from(si.signature.valueBlock.valueHexView)).toEqual(valor)
    expect(conferirCms(cms, conteudo, a1.certificadoDer).valor).toEqual(valor)
  })

  it('é determinístico e remonta idêntico pelo valor guardado, sem a chave', async () => {
    const a = await montarCms(a1, conteudo)
    const b = await montarCms(a1, conteudo)
    expect(b.cms).toEqual(a.cms)
    const publico = { certificadoDer: a1.certificadoDer, cadeiaDer: a1.cadeiaDer }
    expect(remontarCms(publico, conteudo, { valorPronto: a.valor })).toEqual(a.cms)
  })

  it('os bytes do CMS estão congelados (a chave e o conteúdo de teste): pkijs, asn1js e a ordem não podem mudá-los', async () => {
    // O CMS entra no PDF assinado, que é remontado pelas partes guardadas: um byte diferente aqui (outra versão do
    // pkijs/asn1js, outra ordem dos certificados ou dos atributos) faz os PDFs já assinados deixarem de remontar. Se falhar,
    // não troque o hash: desfaça a mudança ou crie um `formato` novo em PartesAssinaturaPdf
    const { cms, valor } = await montarCms(a1, conteudo)
    expect(sha256(cms)).toBe('a7e2f7d0fc859fe82f9fb578b8d3911974a538dc856031315668ee9631288b26')
    const publico = { certificadoDer: a1.certificadoDer, cadeiaDer: [...a1.cadeiaDer].reverse() }
    expect(sha256(remontarCms(publico, conteudo, { valorPronto: valor }))).toBe(sha256(cms))
    // Com o carimbo do tempo (desligado na 1.0.7) como atributo não assinado
    const token = Buffer.from('3003020107', 'hex')
    expect(sha256((await montarCms(a1, conteudo, { carimbo: async () => token })).cms)).toBe(
      '36cea5de2d78b78bba6125f075373011518ff4f87c1ed0f82caeafbbc03d68a3',
    )
  })

  it('recusa remontar com um valor que não confere com o conteúdo', async () => {
    const { valor, cms } = await montarCms(a1, conteudo)
    const publico = { certificadoDer: a1.certificadoDer, cadeiaDer: a1.cadeiaDer }
    expect(() => remontarCms(publico, Buffer.from('outro conteúdo'), { valorPronto: valor })).toThrow(ErroAssinaturaPdf)
    expect(() => remontarCms(publico, Buffer.from('outro conteúdo'), { valorPronto: valor })).toThrow(/não confere/)
    expect(() => conferirCms(cms, Buffer.from('x'), a1.certificadoDer)).toThrow(/não confere/)
    expect(() => conferirCms(cms, conteudo, derPki('outro'))).toThrow(/não é o esperado/)
  })

  it('o carimbo do tempo entra como atributo não assinado, sobre o valor da assinatura', async () => {
    const token = Buffer.from(new asn1js.Sequence({ value: [new asn1js.Integer({ value: 7 })] }).toBER(false))
    const recebidos: Buffer[] = []
    const { cms, valor, carimbo } = await montarCms(a1, conteudo, {
      carimbo: async (v) => {
        recebidos.push(v)
        return token
      },
    })
    expect(recebidos).toEqual([valor])
    expect(carimbo).toEqual(token)
    const lido = lerCms(cms)
    expect(lido.carimbo).toEqual(token)
    const sd = new pkijs.SignedData({ schema: pkijs.ContentInfo.fromBER(cms).content })
    expect(sd.signerInfos[0].unsignedAttrs!.attributes.map((a) => a.type)).toEqual([OID_CMS.signatureTimeStampToken])
    // Remonta com o token guardado
    const publico = { certificadoDer: a1.certificadoDer, cadeiaDer: a1.cadeiaDer }
    expect(remontarCms(publico, conteudo, { valorPronto: valor, carimbo: token })).toEqual(cms)
    // Sem carimbo, os bytes assinados são os mesmos (o carimbo não muda os atributos assinados)
    expect((await montarCms(a1, conteudo)).valor).toEqual(valor)
  })

  it('recusa o carimbo que não está em DER (o CMS do PDF tem de ser DER, EN 319 142-1)', async () => {
    const hex = (h: string) => Buffer.from(h.replace(/\s/g, ''), 'hex')
    const naoDer = [
      hex('30 09 24 07 04 02 01 02 04 01 03'), // OCTET STRING construído (BER)
      hex('30 80 02 01 07 00 00'), // comprimento indefinido
      hex('30 81 03 02 01 07'), // comprimento na forma longa sem precisar
    ]
    for (const token of naoDer) {
      expect(formaDer(token)).toBe(false)
      await expect(montarCms(a1, conteudo, { carimbo: async () => token })).rejects.toThrow(ErroAssinaturaPdf)
    }
    expect(formaDer(hex('30 03 02 01 07'))).toBe(true)
    expect(formaDer(hex('30 05 04 03 01 02 03'))).toBe(true)
  })

  it('a política (sem uso na 1.0.7) entra como atributo assinado quando pedida', async () => {
    const politica = { oid: '2.16.76.1.7.1.11.1.3', hashSha256: Buffer.alloc(32, 1) }
    const { cms } = await montarCms(a1, conteudo, { politica })
    expect(lerCms(cms).atributos).toContain(OID_CMS.sigPolicyId)
  })
})

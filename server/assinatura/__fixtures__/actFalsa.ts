// Uma ACT (autoridade de carimbo do tempo, RFC 3161) falsa para os testes do cliente carimboTempo.ts: monta a
// TimeStampResp com a chave da ACT de teste (pki/tsa.key, emitida pela AC de teste) e serve por HTTP local, com os
// defeitos que os testes pedem (recusa, nonce ou imprint trocado, atraso).

import { createHash, createPrivateKey, type KeyObject, sign } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'
import { arquivoPki, derPki } from './pki.ts'

const OID = {
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha256ComRsa: '1.2.840.113549.1.1.11',
}

export interface OpcoesActFalsa {
  genTime?: Date
  /** PKIStatus (0 granted, 1 grantedWithMods, 2 rejection…). */
  situacao?: number
  trocarNonce?: boolean
  trocarImprint?: boolean
  /** Estraga a assinatura do token. */
  estragarAssinatura?: boolean
  /** Outro certificado/chave para assinar (ex.: um sem o uso timeStamping). */
  certificado?: Buffer
  chave?: KeyObject
  /** O TSTInfo num OCTET STRING construído (BER, o padrão do pkijs), como uma ACT fora do DER mandaria. */
  ber?: boolean
}

/** A TimeStampResp (DER) para o pedido `pedidoDer`. */
export function respostaCarimbo(pedidoDer: Buffer, o: OpcoesActFalsa = {}): Buffer {
  const pedido = pkijs.TimeStampReq.fromBER(pedidoDer)
  const situacao = o.situacao ?? 0
  const info = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: situacao }),
      ...(situacao > 1
        ? [new asn1js.Sequence({ value: [new asn1js.Utf8String({ value: 'pedido recusado pela ACT de teste' })] })]
        : []),
    ],
  })
  if (situacao > 1) return Buffer.from(new asn1js.Sequence({ value: [info] }).toBER(false))

  const imprint = Buffer.from(pedido.messageImprint.hashedMessage.valueBlock.valueHexView)
  if (o.trocarImprint) imprint[0] ^= 0xff
  const nonce = Buffer.from(pedido.nonce!.valueBlock.valueHexView)
  if (o.trocarNonce) nonce[nonce.length - 1] ^= 0x01
  const tst = new pkijs.TSTInfo({
    version: 1,
    policy: '1.2.3.4.1',
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256 }),
      hashedMessage: new asn1js.OctetString({ valueHex: imprint }),
    }),
    serialNumber: new asn1js.Integer({ value: 4242 }),
    genTime: o.genTime ?? new Date(),
    nonce: new asn1js.Integer({ valueHex: nonce }),
  })
  const conteudo = Buffer.from(tst.toSchema().toBER(false))

  const certificadoDer = o.certificado ?? derPki('tsa')
  const chave = o.chave ?? createPrivateKey(arquivoPki('tsa.key'))
  const cert = pkijs.Certificate.fromBER(certificadoDer)
  const atributos = [
    new pkijs.Attribute({ type: OID.contentType, values: [new asn1js.ObjectIdentifier({ value: OID.tstInfo })] }),
    new pkijs.Attribute({
      type: OID.messageDigest,
      values: [new asn1js.OctetString({ valueHex: createHash('sha256').update(conteudo).digest() })],
    }),
  ]
  const assinado = Buffer.from(new asn1js.Set({ value: atributos.map((a) => a.toSchema()) }).toBER(false))
  const assinatura = sign('sha256', assinado, chave)
  if (o.estragarAssinatura) assinatura[10] ^= 0xff
  const encapsulado = new pkijs.EncapsulatedContentInfo({
    eContentType: OID.tstInfo,
    eContent: new asn1js.OctetString({ valueHex: conteudo }),
  })
  // O construtor do pkijs troca o OCTET STRING por um construído (BER); a ACT de verdade manda o primitivo (DER)
  if (!o.ber) encapsulado.eContent = new asn1js.OctetString({ valueHex: conteudo })
  const sd = new pkijs.SignedData({
    version: 3,
    digestAlgorithms: [new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256 })],
    encapContentInfo: encapsulado,
    certificates: [cert, pkijs.Certificate.fromBER(derPki('ac'))],
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
        digestAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256 }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes: atributos }),
        signatureAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256ComRsa, algorithmParams: new asn1js.Null() }),
        signature: new asn1js.OctetString({ valueHex: assinatura }),
      }),
    ],
  })
  const token = new pkijs.ContentInfo({ contentType: OID.signedData, content: sd.toSchema(true) }).toSchema()
  return Buffer.from(new asn1js.Sequence({ value: [info, token] }).toBER(false))
}

/** Serve a ACT falsa em 127.0.0.1 (porta livre). `responder` monta cada resposta; `atrasoMs` segura a resposta. */
export async function iniciarActFalsa(responder: (pedido: Buffer) => Buffer, o: { atrasoMs?: number; status?: number } = {}) {
  const pedidos: { tipo?: string; corpo: Buffer }[] = []
  const servidor = createServer((req, res) => {
    const partes: Buffer[] = []
    req.on('data', (p: Buffer) => partes.push(p))
    req.on('end', () => {
      const corpo = Buffer.concat(partes)
      pedidos.push({ tipo: req.headers['content-type'], corpo })
      const responderAgora = () => {
        if (res.destroyed) return
        res.writeHead(o.status ?? 200, { 'Content-Type': 'application/timestamp-reply' })
        res.end(o.status && o.status !== 200 ? Buffer.alloc(0) : responder(corpo))
      }
      if (o.atrasoMs) setTimeout(responderAgora, o.atrasoMs)
      else responderAgora()
    })
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  const { port } = servidor.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/tsr`,
    pedidos,
    fechar: () => new Promise<void>((ok) => servidor.close(() => ok()).closeAllConnections()),
  }
}

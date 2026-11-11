// O CMS da assinatura do PDF: SignedData destacado no perfil PAdES baseline B-B (ETSI EN 319 142-1, 6.3; CAdES,
// EN 319 122-1, 5.2). SignerInfo por IssuerAndSerialNumber, SHA-256 e sha256WithRSAEncryption (com NULL). Os atributos
// assinados são exatamente content-type, message-digest e signing-certificate-v2 (RFC 5035), em DER e ordenados:
// sem signing-time (a hora vai no /M do dicionário da assinatura) e sem política ICP-Brasil (PLANO §1 e §2.1).
// O carimbo do tempo (RFC 3161), quando houver, entra como atributo NÃO assinado sobre o valor da assinatura.
//
// Montado com pkijs/asn1js; a assinatura RSA (PKCS#1 v1.5, determinística) é do node:crypto. Na remontagem de um PDF
// assinado que sumiu, o valor guardado é conferido pela chave pública antes de entrar no CMS (`remontarCms`).

import { createHash, sign, verify, X509Certificate, type KeyObject } from 'node:crypto'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'
import { ErroAssinaturaPdf, ErroCertificadoDigital, type PublicoParaRemontar } from './contrato.ts'

export const OID_CMS = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  sigPolicyId: '1.2.840.113549.1.9.16.2.15',
  spuri: '1.2.840.113549.1.9.16.5.1',
  signatureTimeStampToken: '1.2.840.113549.1.9.16.2.14',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha256ComRsa: '1.2.840.113549.1.1.11',
} as const

/** Política de assinatura ICP-Brasil (AD-RB/AD-RT). Sem uso na 1.0.7: fica para o caso de o validar exigir (PLANO §4). */
export interface PoliticaAssinatura {
  oid: string
  /** O hash do campo signPolicyHash da política (não o do arquivo da LPA). */
  hashSha256: Buffer
  uri?: string
}

export interface CertificadosCms extends PublicoParaRemontar {
  chave?: KeyObject
}

const bytes = (v: { valueBlock: { valueHexView: Uint8Array } }) => Buffer.from(v.valueBlock.valueHexView)
const atributo = (type: string, valor: asn1js.AsnType) => new pkijs.Attribute({ type, values: [valor] })
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest()

/** Lê o DER com o pkijs e confere que ele volta aos mesmos bytes (o CMS leva os certificados como vieram). */
function certificadoPkijs(der: Buffer): pkijs.Certificate {
  const c = pkijs.Certificate.fromBER(der)
  if (!Buffer.from(c.toSchema().toBER(false)).equals(der))
    throw new ErroCertificadoDigital(
      'Um certificado da cadeia tem uma codificação que o sistema não consegue reproduzir. Exporte o certificado de novo.',
    )
  return c
}

/** DER: os elementos de um SET OF em ordem crescente da codificação (X.690, 11.6). */
function ordenarDer(atributos: pkijs.Attribute[]) {
  return atributos
    .map((a) => ({ a, b: Buffer.from(a.toSchema().toBER(false)) }))
    .sort((x, y) => Buffer.compare(x.b, y.b))
    .map((c) => c.a)
}

/** Os atributos assinados e a codificação que se assina (com a etiqueta SET 0x31, RFC 5652, 5.4). */
function atributosAssinados(cert: pkijs.Certificate, certificadoDer: Buffer, conteudo: Buffer, politica?: PoliticaAssinatura) {
  // ESSCertIDv2 ::= SEQUENCE { hashAlgorithm DEFAULT sha256 (omitido em DER), certHash, issuerSerial }
  const issuerSerial = new asn1js.Sequence({
    value: [
      new pkijs.GeneralNames({ names: [new pkijs.GeneralName({ type: 4, value: cert.issuer })] }).toSchema(),
      new asn1js.Integer({ valueHex: cert.serialNumber.valueBlock.valueHexView }),
    ],
  })
  const signingCertificateV2 = new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [new asn1js.Sequence({ value: [new asn1js.OctetString({ valueHex: sha256(certificadoDer) }), issuerSerial] })],
      }),
    ],
  })
  const atributos = [
    atributo(OID_CMS.contentType, new asn1js.ObjectIdentifier({ value: OID_CMS.data })),
    atributo(OID_CMS.messageDigest, new asn1js.OctetString({ valueHex: sha256(conteudo) })),
    atributo(OID_CMS.signingCertificateV2, signingCertificateV2),
  ]
  if (politica) {
    // SignaturePolicyId ::= SEQUENCE { sigPolicyId, sigPolicyHash OtherHashAlgAndValue, sigPolicyQualifiers OPTIONAL }
    const qualificadores = politica.uri
      ? [
          new asn1js.Sequence({
            value: [
              new asn1js.Sequence({
                value: [new asn1js.ObjectIdentifier({ value: OID_CMS.spuri }), new asn1js.IA5String({ value: politica.uri })],
              }),
            ],
          }),
        ]
      : []
    atributos.push(
      atributo(
        OID_CMS.sigPolicyId,
        new asn1js.Sequence({
          value: [
            new asn1js.ObjectIdentifier({ value: politica.oid }),
            new asn1js.Sequence({
              value: [
                new pkijs.AlgorithmIdentifier({ algorithmId: OID_CMS.sha256 }).toSchema(),
                new asn1js.OctetString({ valueHex: politica.hashSha256 }),
              ],
            }),
            ...qualificadores,
          ],
        }),
      ),
    )
  }
  const ordenados = ordenarDer(atributos)
  const der = Buffer.from(new asn1js.Set({ value: ordenados.map((a) => a.toSchema()) }).toBER(false))
  return { ordenados, der }
}

/** Os tipos universais de cadeia (BIT STRING, OCTET STRING e os de texto): em DER, sempre primitivos (X.690, 10.2). */
const CADEIAS_ASN1 = new Set([3, 4, 12, 18, 19, 20, 21, 22, 25, 26, 27, 28, 30])

/**
 * A codificação está em DER na forma (X.690, 10.1 e 10.2): um elemento só, comprimentos definidos e mínimos, cadeias
 * primitivas. Lida byte a byte (o aviso de comprimento longo do asn1js olha o último byte, não o primeiro). Não confere a
 * ordem dos SET OF. O conteúdo de um OCTET STRING primitivo não é olhado (confira à parte).
 */
export function formaDer(der: Buffer): boolean {
  /** O fim do elemento que começa em `i` (até `fim`), ou -1 fora do DER. */
  const elemento = (i: number, fim: number): number => {
    const tag = der[i]
    let p = i + 1
    if ((tag & 0x1f) === 0x1f) {
      if (p >= fim || der[p] === 0x80) return -1
      while (p < fim && der[p] & 0x80) p++
      p++
    }
    if (p >= fim) return -1
    const primeiro = der[p++]
    let tamanho = primeiro
    if (primeiro === 0x80) return -1 // comprimento indefinido
    if (primeiro > 0x80) {
      const n = primeiro & 0x7f
      if (n > 4 || p + n > fim || der[p] === 0) return -1
      tamanho = 0
      for (let k = 0; k < n; k++) tamanho = tamanho * 256 + der[p + k]
      p += n
      if (tamanho < 0x80) return -1 // forma longa sem precisar
    }
    const fimValor = p + tamanho
    if (fimValor > fim) return -1
    if (tag & 0x20) {
      if ((tag & 0xc0) === 0 && CADEIAS_ASN1.has(tag & 0x1f)) return -1 // cadeia construída (BER)
      for (let q = p; q < fimValor;) if ((q = elemento(q, fimValor)) < 0) return -1
    }
    return fimValor
  }
  return der.length > 0 && elemento(0, der.length) === der.length
}

/** O token do carimbo como valor ASN.1, em DER (o CMS do PDF é DER) e conferido para voltar aos mesmos bytes. */
function tokenAsn1(token: Buffer): asn1js.AsnType {
  const lido = asn1js.fromBER(token)
  if (
    lido.offset !== token.length ||
    lido.result.error ||
    !formaDer(token) ||
    !Buffer.from(lido.result.toBER(false)).equals(token)
  )
    throw new ErroAssinaturaPdf('O carimbo do tempo veio numa codificação que o sistema não consegue guardar (não está em DER).')
  return lido.result
}

function embalar(
  cert: pkijs.Certificate,
  certificados: pkijs.Certificate[],
  ordenados: pkijs.Attribute[],
  valor: Buffer,
  token?: Buffer,
): Buffer {
  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
    digestAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_CMS.sha256 }),
    signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes: ordenados }),
    signatureAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_CMS.sha256ComRsa, algorithmParams: new asn1js.Null() }),
    signature: new asn1js.OctetString({ valueHex: valor }),
    ...(token
      ? {
          unsignedAttrs: new pkijs.SignedAndUnsignedAttributes({
            type: 1,
            attributes: [atributo(OID_CMS.signatureTimeStampToken, tokenAsn1(token))],
          }),
        }
      : {}),
  })
  const signedData = new pkijs.SignedData({
    version: 1,
    digestAlgorithms: [new pkijs.AlgorithmIdentifier({ algorithmId: OID_CMS.sha256 })],
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: OID_CMS.data }),
    certificates: certificados,
    signerInfos: [signerInfo],
  })
  const contentInfo = new pkijs.ContentInfo({ contentType: OID_CMS.signedData, content: signedData.toSchema(true) })
  return Buffer.from(contentInfo.toSchema().toBER(false))
}

function preparar(a: PublicoParaRemontar, conteudo: Buffer, politica?: PoliticaAssinatura) {
  const cert = certificadoPkijs(a.certificadoDer)
  // SignedData.certificates é um SET OF: em DER, os elementos vão ordenados pela codificação (X.690 11.6), como os
  // signedAttrs. Os bytes do CMS entram na remontagem pelas partes: mudar esta ordem pede outro `formato`
  const certificados = [a.certificadoDer, ...a.cadeiaDer]
    .map((der) => ({ der, c: certificadoPkijs(der) }))
    .sort((x, y) => Buffer.compare(x.der, y.der))
    .map((x) => x.c)
  return { cert, certificados, ...atributosAssinados(cert, a.certificadoDer, conteudo, politica) }
}

const publicaDe = (certificadoDer: Buffer) => new X509Certificate(certificadoDer).publicKey

/**
 * Assina `conteudo` (os bytes cobertos pelo /ByteRange) com a chave e monta o CMS. Com `carimbo`, pede o token
 * sobre o valor da assinatura e o põe como atributo não assinado.
 */
export async function montarCms(
  a: CertificadosCms,
  conteudo: Buffer,
  o: { carimbo?: (valor: Buffer) => Promise<Buffer>; politica?: PoliticaAssinatura } = {},
): Promise<{ cms: Buffer; valor: Buffer; carimbo?: Buffer }> {
  if (!a.chave) throw new ErroCertificadoDigital('Sem a chave privada do certificado, não é possível assinar.')
  const { cert, certificados, ordenados, der } = preparar(a, conteudo, o.politica)
  const valor = sign('sha256', der, a.chave)
  if (!verify('sha256', der, publicaDe(a.certificadoDer), valor))
    throw new ErroCertificadoDigital('A chave privada não corresponde ao certificado.')
  const carimbo = o.carimbo ? await o.carimbo(valor) : undefined
  return { cms: embalar(cert, certificados, ordenados, valor, carimbo), valor, ...(carimbo ? { carimbo } : {}) }
}

/**
 * Remonta o CMS sem a chave, com o valor da assinatura (e o token do carimbo) guardados: o valor é conferido pela
 * chave pública do certificado sobre os atributos deste `conteudo`; se não conferir, ErroAssinaturaPdf.
 */
export function remontarCms(
  a: PublicoParaRemontar,
  conteudo: Buffer,
  o: { valorPronto: Buffer; carimbo?: Buffer; politica?: PoliticaAssinatura },
): Buffer {
  const { cert, certificados, ordenados, der } = preparar(a, conteudo, o.politica)
  if (!verify('sha256', der, publicaDe(a.certificadoDer), o.valorPronto))
    throw new ErroAssinaturaPdf('A assinatura guardada não confere com este PDF.')
  return embalar(cert, certificados, ordenados, o.valorPronto, o.carimbo)
}

/** O que interessa de um CMS de assinatura do sistema (para conferir e para os testes). */
export function lerCms(cms: Buffer) {
  const sd = new pkijs.SignedData({ schema: pkijs.ContentInfo.fromBER(cms).content })
  const si = sd.signerInfos[0]
  if (!si?.signedAttrs) throw new ErroAssinaturaPdf('O CMS não tem os atributos assinados.')
  const valorDe = (oid: string) => si.signedAttrs!.attributes.find((a) => a.type === oid)?.values[0]
  const resumo = valorDe(OID_CMS.messageDigest)
  const token = si.unsignedAttrs?.attributes.find((a) => a.type === OID_CMS.signatureTimeStampToken)?.values[0]
  // O do titular é o que o sid (emissor e nº de série) aponta: os certificados vão na ordem do DER, não titular primeiro
  const sid = si.sid instanceof pkijs.IssuerAndSerialNumber ? si.sid : null
  const doTitular = (sd.certificates ?? []).find(
    (c): c is pkijs.Certificate =>
      c instanceof pkijs.Certificate && !!sid && c.serialNumber.isEqual(sid.serialNumber) && c.issuer.isEqual(sid.issuer),
  )
  return {
    atributos: si.signedAttrs.attributes.map((a) => a.type),
    /** O que a assinatura cobre: os atributos com a etiqueta SET. */
    atributosDer: Buffer.from(new asn1js.Set({ value: si.signedAttrs.attributes.map((a) => a.toSchema()) }).toBER(false)),
    resumo: resumo instanceof asn1js.OctetString ? bytes(resumo) : undefined,
    valor: bytes(si.signature),
    certificados: (sd.certificates ?? []).flatMap((c) =>
      c instanceof pkijs.Certificate ? [Buffer.from(c.toSchema().toBER(false))] : [],
    ),
    /** O certificado do titular (o que o sid aponta), ou undefined. */
    titular: doTitular ? Buffer.from(doTitular.toSchema().toBER(false)) : undefined,
    carimbo: token ? Buffer.from(token.toBER(false)) : undefined,
  }
}

/**
 * Confere o CMS sobre o `conteudo`: o message-digest e a assinatura pela chave pública do certificado do titular
 * (o que o sid do SignerInfo aponta, que precisa ser `certificadoDer` quando informado). Lança ErroAssinaturaPdf se não
 * conferir.
 */
export function conferirCms(cms: Buffer, conteudo: Buffer, certificadoDer?: Buffer) {
  const lido = lerCms(cms)
  const { titular } = lido
  if (!titular || (certificadoDer && !titular.equals(certificadoDer)))
    throw new ErroAssinaturaPdf('O certificado da assinatura não é o esperado.')
  if (!lido.resumo?.equals(sha256(conteudo)) || !verify('sha256', lido.atributosDer, publicaDe(titular), lido.valor))
    throw new ErroAssinaturaPdf('A assinatura do PDF não confere.')
  return lido
}

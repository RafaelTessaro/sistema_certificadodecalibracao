// Cliente de carimbo do tempo (RFC 3161) para a assinatura PAdES B-T (PLANO §2.7). DESLIGADO na 1.0.7: nada no
// sistema o chama ainda (sem tela e sem configuração); fica pronto para quando a empresa contratar uma ACT
// credenciada na ICP-Brasil. Para ligar, passe `criarCarimbador(...)` em OpcoesAssinatura.carimbo (assinaturaPdf.ts).
//
// O pedido leva o SHA-256 do VALOR da assinatura (o atributo signature-time-stamp do CAdES), certReq=true e um nonce
// aleatório de 64 bits. A resposta só é aceita com a situação granted/grantedWithMods, o mesmo messageImprint e o
// mesmo nonce, a assinatura do token conferida, o certificado da ACT com o uso "carimbo do tempo", a cadeia até uma
// raiz confiável (padrão: as ICP-Brasil fixadas) e o genTime a até 5 minutos do relógio. Tempo limite: 15 s. O token e o
// TSTInfo dentro dele têm de estar em DER (o token vai para o CMS do PDF, que é DER: EN 319 142-1).

import { createHash, randomBytes, verify, X509Certificate } from 'node:crypto'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'
import { formaDer } from './cms.ts'
import { montarCadeia } from './icp.ts'
import { raizesIcpBrasil } from './raizes.ts'

/** Não foi possível obter ou conferir o carimbo do tempo (mensagem em português, sem segredo). */
export class ErroCarimboTempo extends Error {}

export const OID_TSP = {
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  timeStamping: '1.3.6.1.5.5.7.3.8',
  extKeyUsage: '2.5.29.37',
  subjectKeyIdentifier: '2.5.29.14',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  sha256: '2.16.840.1.101.3.4.2.1',
} as const

/** Os resumos aceitos no token (o OID do resumo → o nome no node:crypto). SHA-1 não. */
const RESUMOS: Record<string, string> = {
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
}
/** As assinaturas aceitas no token: RSA PKCS#1 v1.5 e ECDSA (o resumo vem do digestAlgorithm). */
const ASSINATURAS = new Set([
  '1.2.840.113549.1.1.1', // rsaEncryption
  '1.2.840.113549.1.1.11',
  '1.2.840.113549.1.1.12',
  '1.2.840.113549.1.1.13',
  '1.2.840.10045.4.3.2', // ecdsa-with-SHA256
  '1.2.840.10045.4.3.3',
  '1.2.840.10045.4.3.4',
])

const TEMPO_LIMITE_MS = 15_000
const TOLERANCIA_MS = 5 * 60_000

const erro = (m: string) => new ErroCarimboTempo(m)
const bytes = (v: { valueBlock: { valueHexView: Uint8Array } }) => Buffer.from(v.valueBlock.valueHexView)
/** O valor de um INTEGER sem os zeros à esquerda (para comparar o nonce). */
const inteiro = (b: Buffer) => {
  let i = 0
  while (i < b.length - 1 && b[i] === 0) i++
  return b.subarray(i)
}

/** O TimeStampReq (DER): SHA-256 do que se carimba, o nonce e certReq=true. */
export function montarPedido(resumo: Buffer, nonce: Buffer): Buffer {
  const pedido = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_TSP.sha256, algorithmParams: new asn1js.Null() }),
      hashedMessage: new asn1js.OctetString({ valueHex: resumo }),
    }),
    nonce: new asn1js.Integer({ valueHex: nonce }),
    certReq: true,
  })
  return Buffer.from(pedido.toSchema().toBER(false))
}

/** Um nonce positivo de 64 bits (o 1º byte entre 1 e 127: INTEGER positivo e DER mínimo). */
function novoNonce(): Buffer {
  const n = randomBytes(8)
  n[0] = n[0] & 0x7f || 1
  return n
}

export interface InfoCarimbo {
  genTime: Date
  /** Número de série do carimbo (hex). */
  serie: string
  politica: string
  certificadoAct: X509Certificate
}

export interface ConferenciaCarimbo {
  /** O SHA-256 do que foi carimbado (o valor da assinatura). */
  resumo: Buffer
  /** O nonce do pedido; sem ele (token guardado), não se confere o nonce. */
  nonce?: Buffer
  /** As raízes confiáveis para a ACT (padrão: as ICP-Brasil fixadas). */
  raizes?: X509Certificate[]
  /** O relógio para conferir o genTime (só num carimbo recém-pedido). */
  agora?: Date
  toleranciaMs?: number
}

/** O certificado do signatário do token: pelo emissor e série, ou pelo identificador da chave. */
function signatario(si: pkijs.SignerInfo, certificados: pkijs.Certificate[]): pkijs.Certificate | undefined {
  const sid = si.sid
  if (sid instanceof pkijs.IssuerAndSerialNumber)
    return certificados.find((c) => c.issuer.isEqual(sid.issuer) && c.serialNumber.isEqual(sid.serialNumber))
  if (sid instanceof asn1js.Constructed || sid instanceof asn1js.Primitive) {
    const ski = bytes(sid as asn1js.OctetString)
    return certificados.find((c) => {
      const ext = c.extensions?.find((e) => e.extnID === OID_TSP.subjectKeyIdentifier)
      const v = ext?.parsedValue as asn1js.OctetString | undefined
      return v && bytes(v).equals(ski)
    })
  }
  return undefined
}

/**
 * Confere um TimeStampToken (ContentInfo DER): o messageImprint, o nonce (quando informado), a assinatura, o uso
 * do certificado da ACT, a validade e a cadeia até uma raiz confiável no genTime e, com `agora`, a hora.
 */
export function conferirToken(token: Buffer, c: ConferenciaCarimbo): InfoCarimbo {
  let sd: pkijs.SignedData
  let tst: pkijs.TSTInfo
  let conteudo: Buffer
  try {
    const ci = pkijs.ContentInfo.fromBER(token)
    if (ci.contentType !== pkijs.ContentInfo.SIGNED_DATA) throw new Error('não é SignedData')
    sd = new pkijs.SignedData({ schema: ci.content })
    if (sd.encapContentInfo.eContentType !== OID_TSP.tstInfo || !sd.encapContentInfo.eContent) throw new Error('não é TSTInfo')
    conteudo = Buffer.from(sd.encapContentInfo.eContent.getValue())
    tst = pkijs.TSTInfo.fromBER(conteudo)
  } catch {
    throw erro('A resposta da ACT não traz um carimbo do tempo válido.')
  }
  // Uma ACT que codifica em BER (o TSTInfo num OCTET STRING construído, comprimento indefinido…) daria um CMS fora do DER
  if (!formaDer(token) || sd.encapContentInfo.eContent.idBlock.isConstructed || !formaDer(conteudo))
    throw erro('O carimbo do tempo da ACT não está em DER: o sistema não consegue pô-lo na assinatura do PDF.')

  if (
    tst.messageImprint.hashAlgorithm.algorithmId !== OID_TSP.sha256 ||
    !bytes(tst.messageImprint.hashedMessage).equals(c.resumo)
  )
    throw erro('O carimbo do tempo não corresponde à assinatura (messageImprint diferente).')
  if (c.nonce && (!tst.nonce || !inteiro(bytes(tst.nonce)).equals(inteiro(c.nonce))))
    throw erro('O carimbo do tempo não corresponde ao pedido (nonce diferente).')
  const genTime = tst.genTime
  if (c.agora && Math.abs(genTime.getTime() - c.agora.getTime()) > (c.toleranciaMs ?? TOLERANCIA_MS))
    throw erro('A hora do carimbo do tempo difere mais de 5 minutos do relógio do servidor. Confira a data e a hora do servidor.')

  // A assinatura do token
  if (sd.signerInfos.length !== 1) throw erro('O carimbo do tempo deve ter exatamente uma assinatura.')
  const si = sd.signerInfos[0]
  const certificados = (sd.certificates ?? []).filter((x): x is pkijs.Certificate => x instanceof pkijs.Certificate)
  const cert = signatario(si, certificados)
  if (!cert) throw erro('O carimbo do tempo não traz o certificado da ACT.')
  const resumo = RESUMOS[si.digestAlgorithm.algorithmId]
  if (!resumo || !ASSINATURAS.has(si.signatureAlgorithm.algorithmId) || !si.signedAttrs)
    throw erro('O carimbo do tempo usa um algoritmo que o sistema não confere.')
  const atributo = (oid: string) => si.signedAttrs!.attributes.find((a) => a.type === oid)?.values[0]
  const tipo = atributo(OID_TSP.contentType)
  const md = atributo(OID_TSP.messageDigest)
  const atributosDer = Buffer.from(new asn1js.Set({ value: si.signedAttrs.attributes.map((a) => a.toSchema()) }).toBER(false))
  const x509 = new X509Certificate(Buffer.from(cert.toSchema().toBER(false)))
  let confere = false
  try {
    confere =
      tipo instanceof asn1js.ObjectIdentifier &&
      tipo.valueBlock.toString() === OID_TSP.tstInfo &&
      md instanceof asn1js.OctetString &&
      bytes(md).equals(createHash(resumo).update(conteudo).digest()) &&
      verify(resumo, atributosDer, x509.publicKey, bytes(si.signature))
  } catch {
    confere = false
  }
  if (!confere) throw erro('A assinatura do carimbo do tempo não confere.')

  // O certificado da ACT: uso "carimbo do tempo", validade no genTime e cadeia até uma raiz confiável
  const eku = cert.extensions?.find((e) => e.extnID === OID_TSP.extKeyUsage)?.parsedValue as pkijs.ExtKeyUsage | undefined
  if (!eku?.keyPurposes.includes(OID_TSP.timeStamping))
    throw erro('O certificado da ACT não é de carimbo do tempo (falta o uso "timeStamping").')
  const dentro = (x: X509Certificate) => genTime >= new Date(x.validFrom) && genTime <= new Date(x.validTo)
  if (!dentro(x509)) throw erro('O certificado da ACT estava fora da validade na hora do carimbo.')
  const outros = certificados.filter((x) => x !== cert).map((x) => new X509Certificate(Buffer.from(x.toSchema().toBER(false))))
  const { intermediarias, raiz } = montarCadeia(x509, outros, c.raizes ?? raizesIcpBrasil())
  if (!raiz || ![...intermediarias, raiz].every(dentro))
    throw erro('O certificado da ACT não chega a uma raiz da ICP-Brasil (ou a cadeia estava fora da validade).')

  return {
    genTime,
    serie: bytes(tst.serialNumber).toString('hex').toUpperCase(),
    politica: tst.policy,
    certificadoAct: x509,
  }
}

/** Confere a TimeStampResp e devolve o TimeStampToken nos bytes em que veio. */
export function conferirResposta(resposta: Buffer, c: ConferenciaCarimbo): { token: Buffer; info: InfoCarimbo } {
  let status: number
  let texto = ''
  let token: Buffer | undefined
  try {
    const lido = asn1js.fromBER(resposta)
    if (lido.offset === -1 || !(lido.result instanceof asn1js.Sequence)) throw new Error('não é SEQUENCE')
    const [info, tokenAsn1] = lido.result.valueBlock.value
    const resp = pkijs.TimeStampResp.fromBER(resposta)
    status = resp.status.status
    texto = (resp.status.statusStrings ?? []).map((s) => s.valueBlock.value).join(' ')
    if (tokenAsn1) token = Buffer.from(tokenAsn1.valueBeforeDecodeView)
    if (!info) throw new Error('sem PKIStatusInfo')
  } catch {
    throw erro('A resposta da ACT não é um carimbo do tempo (RFC 3161).')
  }
  if (status !== 0 && status !== 1)
    throw erro(`A ACT recusou o carimbo do tempo (situação ${status}${texto ? `: ${texto.slice(0, 200)}` : ''}).`)
  if (!token) throw erro('A ACT não devolveu o carimbo do tempo.')
  return { token, info: conferirToken(token, c) }
}

export interface OpcoesCarimboTempo {
  /** O endereço da ACT (HTTP ou HTTPS). */
  url: string
  raizes?: X509Certificate[]
  tempoLimiteMs?: number
  toleranciaMs?: number
  agora?: () => Date
  /** Cabeçalhos que a ACT exigir (autenticação). Nunca aparecem nas mensagens de erro. */
  cabecalhos?: Record<string, string>
  /** O transporte (injetável nos testes): envia o pedido e devolve o corpo da resposta. */
  enviar?: (url: string, corpo: Buffer, o: { sinal: AbortSignal; cabecalhos: Record<string, string> }) => Promise<Buffer>
}

async function enviarHttp(url: string, corpo: Buffer, o: { sinal: AbortSignal; cabecalhos: Record<string, string> }) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply', ...o.cabecalhos },
    body: new Uint8Array(corpo),
    signal: o.sinal,
  })
  if (!r.ok) throw erro(`A ACT respondeu com erro (HTTP ${r.status}).`)
  const resposta = Buffer.from(await r.arrayBuffer())
  if (resposta.length > 1 << 20) throw erro('A resposta da ACT é grande demais.')
  return resposta
}

/** Pede o carimbo do tempo sobre o valor da assinatura e devolve o TimeStampToken (DER) já conferido. */
export async function pedirCarimbo(valorAssinatura: Buffer, o: OpcoesCarimboTempo): Promise<Buffer> {
  if (!/^https?:\/\//i.test(o.url)) throw erro('O endereço da ACT precisa começar com http:// ou https://.')
  const resumo = createHash('sha256').update(valorAssinatura).digest()
  const nonce = novoNonce()
  const tempo = o.tempoLimiteMs ?? TEMPO_LIMITE_MS
  let resposta: Buffer
  try {
    resposta = await (o.enviar ?? enviarHttp)(o.url, montarPedido(resumo, nonce), {
      sinal: AbortSignal.timeout(tempo),
      cabecalhos: o.cabecalhos ?? {},
    })
  } catch (e) {
    if (e instanceof ErroCarimboTempo) throw e
    const nome = (e as Error)?.name
    if (nome === 'TimeoutError' || nome === 'AbortError')
      throw erro(`A ACT não respondeu em ${Math.round(tempo / 1000)} s. Tente de novo mais tarde.`)
    throw erro('Não foi possível falar com a ACT (sem internet ou endereço fora do ar).')
  }
  return conferirResposta(resposta, {
    resumo,
    nonce,
    raizes: o.raizes,
    agora: (o.agora ?? (() => new Date()))(),
    toleranciaMs: o.toleranciaMs,
  }).token
}

/** O gancho para OpcoesAssinatura.carimbo: recebe o valor da assinatura e devolve o token conferido. */
export const criarCarimbador =
  (o: OpcoesCarimboTempo) =>
  (valorAssinatura: Buffer): Promise<Buffer> =>
    pedirCarimbo(valorAssinatura, o)

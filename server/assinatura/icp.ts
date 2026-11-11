// O que a ICP-Brasil põe no certificado e o sistema precisa ler, e a cadeia até uma raiz confiável.
//
// - CNPJ (DOC-ICP-04 v8.3, 7.1.2.2 e Res. CG ICP-Brasil 211/2024): no otherName 2.16.76.1.3.3 do subjectAltName
//   (OCTET STRING ou PrintableString; todo e-CNPJ), no atributo serialNumber do titular (selo eletrônico SE-S) e no fim
//   do CN ("RAZÃO SOCIAL:CNPJ", perfil antigo). O CNPJ pode ser alfanumérico (IN RFB 2.229/2024).
// - Tipo pela política: 2.16.76.1.2.1.* = A1; 2.16.76.1.2.201.* = SE-S (o sucessor do A1).
// - O otherName 2.16.76.1.3.4 (nascimento e CPF do responsável) nunca é lido para fora daqui.
//
// A leitura é feita sobre o DER do certificado (já aceito pelo OpenSSL do node:crypto), com um leitor mínimo.

import { X509Certificate } from 'node:crypto'
import { type LookupAddress, lookup } from 'node:dns'
import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { BlockList, isIP, isIPv4, isIPv6, type LookupFunction } from 'node:net'
import * as pkijs from 'pkijs'
import { normalizarCnpj } from '#shared/documentos.ts'

// ---- DER mínimo (só leitura) ------------------------------------------------------------------------------------

interface No {
  tag: number
  /** O conteúdo (sem a etiqueta e o tamanho). */
  v: Buffer
}

function lerNo(b: Buffer, i = 0): { no: No; fim: number } {
  if (i + 2 > b.length) throw new Error('DER truncado')
  const tag = b[i]
  let tam = b[i + 1]
  let p = i + 2
  if (tam & 0x80) {
    const n = tam & 0x7f
    if (n === 0 || n > 4) throw new Error('DER inválido (tamanho)')
    tam = 0
    for (let k = 0; k < n; k++) tam = tam * 256 + b[p++]
  }
  if (p + tam > b.length) throw new Error('DER truncado')
  return { no: { tag, v: b.subarray(p, p + tam) }, fim: p + tam }
}

function filhos(no: No): No[] {
  const r: No[] = []
  for (let i = 0; i < no.v.length;) {
    const { no: f, fim } = lerNo(no.v, i)
    r.push(f)
    i = fim
  }
  return r
}

function oid(v: Buffer): string {
  const partes: number[] = []
  let n = 0
  for (let i = 0; i < v.length; i++) {
    n = n * 128 + (v[i] & 0x7f)
    if (!(v[i] & 0x80)) {
      if (!partes.length) partes.push(n < 80 ? Math.floor(n / 40) : 2, n < 80 ? n % 40 : n - 80)
      else partes.push(n)
      n = 0
    }
  }
  return partes.join('.')
}

/** O texto de um valor ASN.1 (OCTET STRING, UTF8String, PrintableString, T61, IA5String, VisibleString, BMPString). */
function texto(no: No): string {
  if (no.tag === 0x1e)
    return Buffer.from(no.v.subarray(0, no.v.length & ~1))
      .swap16()
      .toString('utf16le')
  if (no.tag === 0x0c) return no.v.toString('utf8')
  return no.v.toString('latin1')
}

// ---- O conteúdo do certificado ----------------------------------------------------------------------------------

export const OID_ICP = {
  cn: '2.5.4.3',
  serialNumber: '2.5.4.5',
  san: '2.5.29.17',
  keyUsage: '2.5.29.15',
  politicas: '2.5.29.32',
  basicConstraints: '2.5.29.19',
  aia: '1.3.6.1.5.5.7.1.1',
  caIssuers: '1.3.6.1.5.5.7.48.2',
  /** Pessoa física: nascimento, CPF… do titular (e-CPF). */
  dadosPessoaFisica: '2.16.76.1.3.1',
  /** CNPJ da pessoa jurídica titular. */
  cnpj: '2.16.76.1.3.3',
} as const

const USOS = [
  'digitalSignature',
  'nonRepudiation',
  'keyEncipherment',
  'dataEncipherment',
  'keyAgreement',
  'keyCertSign',
  'cRLSign',
  'encipherOnly',
  'decipherOnly',
] as const

export interface ConteudoCertificado {
  /** Atributos do titular e do emissor (OID → valores, na ordem). */
  titular: Map<string, string[]>
  emissor: Map<string, string[]>
  /** Os OIDs dos otherNames do subjectAltName (sem os valores: o 2.16.76.1.3.4 não sai daqui). */
  otherNames: string[]
  politicas: string[]
  /** Os bits do keyUsage presentes (RFC 5280, 4.2.1.3); vazio = sem a extensão. */
  usos: string[]
  temKeyUsage: boolean
  ca: boolean
  /** Os endereços caIssuers do authorityInformationAccess (onde baixar o certificado da AC emissora). */
  caIssuers: string[]
  /** CNPJs achados, com o lugar de cada um. */
  cnpjs: { cnpj: string; origem: string }[]
}

function nome(no: No): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const rdn of filhos(no))
    for (const atv of filhos(rdn)) {
      const [o, v] = filhos(atv)
      if (!o || !v) continue
      const k = oid(o.v)
      m.set(k, [...(m.get(k) ?? []), texto(v)])
    }
  return m
}

/**
 * CNPJ só com 0-9 e A-Z, no formato (12 posições alfanuméricas + 2 dígitos), sem o "todo zeros". Tolera pontuação e
 * rótulo ("CNPJ:", como o normalizarCnpj da tela).
 */
function cnpjOuVazio(s: string): string {
  const c = normalizarCnpj(s)
  return /^[0-9A-Z]{12}\d{2}$/.test(c) && !/^0+$/.test(c) ? c : ''
}

export function lerCertificado(der: Buffer): ConteudoCertificado {
  const cert = lerNo(der).no
  const tbs = filhos(filhos(cert)[0])
  const i = tbs[0]?.tag === 0xa0 ? 1 : 0 // [0] version
  // serialNumber, signature, issuer, validity, subject
  const r: ConteudoCertificado = {
    titular: nome(tbs[i + 4]),
    emissor: nome(tbs[i + 2]),
    otherNames: [],
    politicas: [],
    usos: [],
    temKeyUsage: false,
    ca: false,
    caIssuers: [],
    cnpjs: [],
  }
  const extensoes = tbs.find((n) => n.tag === 0xa3)
  for (const ext of extensoes ? filhos(filhos(extensoes)[0]) : []) {
    const partes = filhos(ext)
    const id = oid(partes[0].v)
    const valor = lerNo(partes[partes.length - 1].v).no // OCTET STRING → o DER da extensão
    if (id === OID_ICP.san) {
      for (const gn of filhos(valor)) {
        if (gn.tag !== 0xa0) continue // [0] otherName
        const [tipo, explicito] = filhos(gn) // type-id, [0] EXPLICIT value
        if (tipo?.tag !== 0x06 || explicito?.tag !== 0xa0) continue
        const qual = oid(tipo.v)
        r.otherNames.push(qual)
        const interno = filhos(explicito)[0]
        if (qual === OID_ICP.cnpj && interno) {
          const cnpj = cnpjOuVazio(texto(interno))
          if (cnpj) r.cnpjs.push({ cnpj, origem: 'otherName 2.16.76.1.3.3' })
        }
      }
    } else if (id === OID_ICP.politicas) {
      for (const pi of filhos(valor)) r.politicas.push(oid(filhos(pi)[0].v))
    } else if (id === OID_ICP.keyUsage) {
      r.temKeyUsage = true
      const bits = valor.v.subarray(1) // o 1º byte é o número de bits não usados
      USOS.forEach((uso, k) => {
        if ((bits[k >> 3] ?? 0) & (0x80 >> (k & 7))) r.usos.push(uso)
      })
    } else if (id === OID_ICP.basicConstraints) {
      const f = filhos(valor)
      r.ca = f[0]?.tag === 0x01 && f[0].v[0] !== 0
    } else if (id === OID_ICP.aia) {
      for (const ad of filhos(valor)) {
        const [metodo, local] = filhos(ad)
        if (metodo?.tag === 0x06 && oid(metodo.v) === OID_ICP.caIssuers && local?.tag === 0x86)
          r.caIssuers.push(local.v.toString('latin1'))
      }
    }
  }
  // serialNumber do titular (SE-S; tolera o prefixo semântico ETSI "NTRBR-", se uma AC usar)
  for (const sn of r.titular.get(OID_ICP.serialNumber) ?? []) {
    const cnpj = cnpjOuVazio(sn.replace(/^[A-Z]{3}BR-/i, ''))
    if (cnpj) r.cnpjs.push({ cnpj, origem: 'serialNumber do titular' })
  }
  // O fim do CN ("RAZÃO SOCIAL:CNPJ")
  for (const cn of r.titular.get(OID_ICP.cn) ?? []) {
    const m = /:\s*([0-9A-Z./-]{14,18})\s*$/i.exec(cn)
    const cnpj = m ? cnpjOuVazio(m[1]) : ''
    if (cnpj) r.cnpjs.push({ cnpj, origem: 'nome (CN)' })
  }
  return r
}

/** O CNPJ do titular (o primeiro achado) e, se houver, outro CNPJ diferente no mesmo certificado. */
export function cnpjDoCertificado(c: ConteudoCertificado): { cnpj: string; conflito?: string } {
  const [primeiro] = c.cnpjs
  if (!primeiro) return { cnpj: '' }
  const outro = c.cnpjs.find((a) => a.cnpj !== primeiro.cnpj)
  return { cnpj: primeiro.cnpj, ...(outro ? { conflito: outro.cnpj } : {}) }
}

/** A razão social: o CN sem o ":CNPJ" do perfil antigo. */
export function titularDoCertificado(c: ConteudoCertificado): string {
  const cn = c.titular.get(OID_ICP.cn)?.[0] ?? ''
  return cn.replace(/:\s*[0-9A-Z./-]{11,18}\s*$/i, '').trim()
}

/** O CN do emissor (a AC que emitiu o certificado). */
export const emissorDoCertificado = (c: ConteudoCertificado) =>
  c.emissor.get(OID_ICP.cn)?.[0] ?? c.emissor.get('2.5.4.10')?.[0] ?? ''

/** O tipo pela política (DOC-ICP-04 v8.3, Tabela 3). Fora de A1 e SE-S: o nome do tipo, ou '' se não for ICP. */
export function tipoPelaPolitica(politicas: string[]): string {
  const prefixos: [string, string][] = [
    ['2.16.76.1.2.1.', 'A1'],
    ['2.16.76.1.2.201.', 'SE-S'],
    ['2.16.76.1.2.202.', 'SE-H'],
    ['2.16.76.1.2.2.', 'A2'],
    ['2.16.76.1.2.3.', 'A3'],
    ['2.16.76.1.2.4.', 'A4'],
    ['2.16.76.1.2.101.', 'S1'],
    ['2.16.76.1.2.102.', 'S2'],
    ['2.16.76.1.2.103.', 'S3'],
    ['2.16.76.1.2.104.', 'S4'],
    ['2.16.76.1.2.301.', 'T3'],
    ['2.16.76.1.2.302.', 'T4'],
  ]
  for (const p of politicas) for (const [prefixo, tipo] of prefixos) if (p.startsWith(prefixo)) return tipo
  return ''
}

/** Os dois CNPJs são da mesma pessoa jurídica (as 8 primeiras posições: matriz e filiais). */
export const mesmaRaizCnpj = (a: string, b: string) => normalizarCnpj(a).slice(0, 8) === normalizarCnpj(b).slice(0, 8)

// ---- Cadeia ------------------------------------------------------------------------------------------------------

/** `filho` foi emitido por `pai`: nome e identificadores batem (checkIssued) e a assinatura confere com a chave do pai. */
export function emitidoPor(filho: X509Certificate, pai: X509Certificate): boolean {
  try {
    return filho.checkIssued(pai) && filho.verify(pai.publicKey)
  } catch {
    return false
  }
}

/**
 * A cadeia do certificado até uma das `raizes`, com os `extras` (os outros certificados do arquivo, os baixados do
 * caIssuers): as ACs intermediárias em ordem (sem o titular e sem a raiz) e a raiz, se chegou. Só uma das `raizes`
 * fecha a cadeia; uma raiz que veio no arquivo, mas não está na lista, não vale.
 */
export function montarCadeia(
  titular: X509Certificate,
  extras: X509Certificate[],
  raizes: X509Certificate[],
): { intermediarias: X509Certificate[]; raiz?: X509Certificate } {
  const intermediarias: X509Certificate[] = []
  let atual = titular
  for (let nivel = 0; nivel < 10; nivel++) {
    const raiz = raizes.find((r) => r.ca && emitidoPor(atual, r))
    if (raiz) return { intermediarias, raiz }
    const pai = extras.find((c) => c.ca && c !== atual && !intermediarias.includes(c) && emitidoPor(atual, c))
    if (!pai || pai.raw.equals(titular.raw)) break
    intermediarias.push(pai)
    atual = pai
  }
  return { intermediarias }
}

/** Os certificados de um arquivo DER, PEM ou PKCS#7 (.p7b/.p7c "só certificados"); o que não for lido é ignorado. */
export function certificadosDe(dados: Buffer): X509Certificate[] {
  const texto = dados.toString('latin1')
  if (texto.includes('-----BEGIN')) {
    const pems = texto.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []
    const p7 = /-----BEGIN PKCS7-----([\s\S]+?)-----END PKCS7-----/.exec(texto)
    return [
      ...pems.flatMap((p) => certificadosDe(Buffer.from(p.replace(/-----[^-]+-----|\s/g, ''), 'base64'))),
      ...(p7 ? certificadosDe(Buffer.from(p7[1].replace(/\s/g, ''), 'base64')) : []),
    ]
  }
  try {
    return [new X509Certificate(dados)]
  } catch {
    // não é um certificado: talvez um PKCS#7 só com certificados
  }
  try {
    const conteudo = pkijs.ContentInfo.fromBER(dados)
    if (conteudo.contentType !== pkijs.ContentInfo.SIGNED_DATA) return []
    const sd = new pkijs.SignedData({ schema: conteudo.content })
    return (sd.certificates ?? []).flatMap((c) =>
      c instanceof pkijs.Certificate ? [new X509Certificate(Buffer.from(c.toSchema().toBER(false)))] : [],
    )
  } catch {
    return []
  }
}

/** Baixa um endereço (o caIssuers do certificado) e devolve o conteúdo. Injetável nos testes. */
export type BuscarEndereco = (url: string) => Promise<Buffer>

/** O tamanho máximo do que a busca pelo caIssuers lê (um .p7b com a cadeia tem poucos KB). */
export const MAX_BYTES_BUSCA = 1 << 20

/** Os endereços que a busca pelo caIssuers não visita: a própria máquina, a rede local e os reservados. */
const REDE_LOCAL = new BlockList()
for (const [rede, prefixo] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  REDE_LOCAL.addSubnet(rede, prefixo, 'ipv4')
for (const [rede, prefixo] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  REDE_LOCAL.addSubnet(rede, prefixo, 'ipv6')

/** O endereço IP é da própria máquina, da rede local ou reservado (o IPv4 dentro do IPv6 também). */
export function ehRedeLocal(ip: string): boolean {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? (isIPv4(ip) ? ip : null)
  if (v4) return REDE_LOCAL.check(v4, 'ipv4')
  if (/^::ffff:/i.test(ip)) return true
  return isIPv6(ip) ? REDE_LOCAL.check(ip, 'ipv6') : true
}

const NAO_LOCAL = 'endereço da rede local não permitido'

/**
 * Só http/https, até 1 MB (o Content-Length maior é recusado antes; sem ele, a leitura para ao passar de 1 MB), com tempo
 * limite para tudo (DNS, conexão e corpo) e até 2 redirecionamentos. O endereço vem de um certificado ainda não conferido:
 * a busca nunca vai à própria máquina nem à rede local (o IP resolvido é conferido antes de conectar).
 * `permitirRedeLocal`: só nos testes (o servidor de teste escuta em 127.0.0.1); com uma função, por pedido (0 = o primeiro).
 */
export function buscarComTempoLimite(
  tempoLimiteMs = 10_000,
  o: { permitirRedeLocal?: boolean | ((pedido: number) => boolean) } = {},
): BuscarEndereco {
  const permitir = (n: number) =>
    typeof o.permitirRedeLocal === 'function' ? o.permitirRedeLocal(n) : o.permitirRedeLocal === true
  return async (inicial) => {
    const sinal = AbortSignal.timeout(tempoLimiteMs)
    let url = inicial
    for (let pedido = 0; pedido <= 2; pedido++) {
      const r = await pedir(url, sinal, permitir(pedido))
      if ('corpo' in r) return r.corpo
      url = r.para
    }
    throw new Error('redirecionamentos demais')
  }
}

function pedir(endereco: string, sinal: AbortSignal, redeLocal: boolean): Promise<{ corpo: Buffer } | { para: string }> {
  let url: URL
  try {
    url = new URL(endereco)
  } catch {
    return Promise.reject(new Error('endereço não suportado'))
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.reject(new Error('endereço não suportado'))
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (
    !redeLocal &&
    (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost') || (isIP(host) && ehRedeLocal(host)))
  )
    return Promise.reject(new Error(NAO_LOCAL))
  // O IP resolvido é conferido aqui, e a conexão vai a ele (sem outra resolução no meio)
  const resolver: LookupFunction = (nome, opcoes, cb) =>
    lookup(nome, { ...opcoes, all: true }, (e, enderecos) => {
      if (e) return cb(e, '', 4)
      const lista = enderecos as LookupAddress[]
      if (!lista.length) return cb(new Error('endereço não encontrado'), '', 4)
      if (!redeLocal && lista.some((a) => ehRedeLocal(a.address))) return cb(new Error(NAO_LOCAL), '', 4)
      if ((opcoes as { all?: boolean }).all) return (cb as unknown as (e: null, l: LookupAddress[]) => void)(null, lista)
      cb(null, lista[0].address, lista[0].family)
    })
  const fazer = url.protocol === 'https:' ? requestHttps : requestHttp
  return new Promise((ok, falha) => {
    const req = fazer(url, { method: 'GET', signal: sinal, lookup: resolver, headers: { accept: '*/*' } }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        try {
          return ok({ para: new URL(res.headers.location, url).toString() })
        } catch {
          return falha(new Error('redirecionamento inválido'))
        } finally {
          req.destroy()
        }
      }
      if (status < 200 || status >= 300) {
        req.destroy()
        return falha(new Error(`HTTP ${status}`))
      }
      if (Number(res.headers['content-length'] ?? 0) > MAX_BYTES_BUSCA) {
        req.destroy()
        return falha(new Error('arquivo grande demais'))
      }
      const partes: Buffer[] = []
      let total = 0
      res.on('data', (b: Buffer) => {
        total += b.length
        if (total > MAX_BYTES_BUSCA) {
          req.destroy()
          falha(new Error('arquivo grande demais'))
          return
        }
        partes.push(b)
      })
      res.on('end', () => ok({ corpo: Buffer.concat(partes) }))
      res.on('error', falha)
    })
    req.on('error', falha)
    req.end()
  })
}

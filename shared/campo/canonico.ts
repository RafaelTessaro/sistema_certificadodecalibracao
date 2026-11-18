// JSON canônico e sha256 do pacote e do registro de campo: integridade invisível (idempotência da entrega, conteúdo que
// as assinaturas amarram). Nada daqui aparece na interface nem no PDF.
//
// - `jsonCanonico`: chaves em ordem (por unidade de código UTF-16, a ordem padrão do `sort`), sem espaços, os mesmos
//   escapes do JSON.stringify. O mesmo valor dá sempre o mesmo texto, no servidor (Node) e no celular (WebView): é sobre
//   ele que o sha256 é calculado, nunca sobre os bytes que trafegaram (o HTTP nativo do Android reescreve o JSON).
// - O sha256 vem por injeção (`FuncaoSha256`): o servidor usa o `node:crypto`, o app pode usar o WebCrypto
//   (`sha256WebCrypto`), e `sha256Hex` é uma implementação em TypeScript puro, síncrona, que funciona em qualquer lugar —
//   inclusive na tela do computador aberta por http://IP, onde não existe `crypto.subtle` (shared/id.ts). As três dão o
//   mesmo resultado (hexadecimal minúsculo do UTF-8 do texto).
// - Conteúdo assinado = o registro sem `assinaturas` e sem `correcoesPosAssinatura`: a correção depois da assinatura muda
//   o sha256 do registro inteiro, mas não o que as assinaturas amarram.

import type { PacoteCampo, RegistroCampo } from './tipos.ts'

/** sha256 em hexadecimal minúsculo do UTF-8 de um texto, síncrono ou não. */
export type FuncaoSha256 = (texto: string) => string | Promise<string>

/** sha256 em hexadecimal (64 caracteres, minúsculos). */
export const REGEX_SHA256 = /^[0-9a-f]{64}$/

/**
 * JSON canônico: objetos com as chaves em ordem e sem espaços; `undefined`, funções e símbolos ficam de fora dos objetos
 * (e viram `null` nas listas), como no JSON.stringify. Número não finito (NaN, Infinity) é recusado: o registro e o pacote
 * nunca devem tê-los.
 */
export function jsonCanonico(valor: unknown): string {
  const partes: string[] = []
  escrever(valor, partes, false)
  return partes.join('')
}

function escrever(v: unknown, saida: string[], naLista: boolean): void {
  if (v === null) {
    saida.push('null')
    return
  }
  switch (typeof v) {
    case 'string':
      saida.push(JSON.stringify(v))
      return
    case 'boolean':
      saida.push(v ? 'true' : 'false')
      return
    case 'number':
      if (!Number.isFinite(v)) throw new Error('JSON canônico: número não finito.')
      saida.push(JSON.stringify(v))
      return
    case 'bigint':
      throw new Error('JSON canônico: bigint não é JSON.')
    case 'undefined':
    case 'function':
    case 'symbol':
      if (naLista) saida.push('null')
      return
  }
  const o = v as { toJSON?: () => unknown }
  if (typeof o.toJSON === 'function') {
    escrever(o.toJSON(), saida, naLista)
    return
  }
  if (Array.isArray(v)) {
    saida.push('[')
    v.forEach((x, i) => {
      if (i) saida.push(',')
      escrever(x, saida, true)
    })
    saida.push(']')
    return
  }
  const obj = v as Record<string, unknown>
  saida.push('{')
  let primeiro = true
  for (const chave of Object.keys(obj).sort()) {
    const x = obj[chave]
    if (x === undefined || typeof x === 'function' || typeof x === 'symbol') continue
    if (!primeiro) saida.push(',')
    primeiro = false
    saida.push(JSON.stringify(chave), ':')
    escrever(x, saida, false)
  }
  saida.push('}')
}

/** Tamanho em bytes do texto em UTF-8 (para os limites). */
export function bytesUtf8(texto: string): number {
  return new TextEncoder().encode(texto).length
}

// ---- sha256 ------------------------------------------------------------------------------------------------------

/** Aplica a função de sha256 ao texto e devolve em minúsculas, síncrono quando a função é síncrona. */
function aplicar<R extends string | Promise<string>>(texto: string, sha: (t: string) => R): R {
  const r = sha(texto)
  return (typeof r === 'string' ? r.toLowerCase() : (r as Promise<string>).then((x) => x.toLowerCase())) as R
}

/** sha256 do JSON canônico de um valor qualquer. */
export function sha256DoValor<R extends string | Promise<string>>(valor: unknown, sha: (t: string) => R): R {
  return aplicar(jsonCanonico(valor), sha)
}

/** O conteúdo que as assinaturas amarram: o registro sem `assinaturas` e sem `correcoesPosAssinatura`. */
export function conteudoAssinado(registro: RegistroCampo): Omit<RegistroCampo, 'assinaturas' | 'correcoesPosAssinatura'> {
  const { assinaturas: _a, correcoesPosAssinatura: _c, ...conteudo } = registro
  return conteudo
}

/** `conteudoSha256` das assinaturas: calculado no Finalizar (celular) e conferido no servidor. */
export function calcularConteudoSha256<R extends string | Promise<string>>(registro: RegistroCampo, sha: (t: string) => R): R {
  return sha256DoValor(conteudoAssinado(registro), sha)
}

/** sha256 do registro inteiro (com as assinaturas e as correções depois delas): a chave da idempotência da entrega. */
export function calcularSha256Registro<R extends string | Promise<string>>(registro: RegistroCampo, sha: (t: string) => R): R {
  return sha256DoValor(registro, sha)
}

/** sha256 do pacote (o servidor guarda no envio; o celular calcula ao receber e leva no registro). */
export function calcularSha256Pacote<R extends string | Promise<string>>(pacote: PacoteCampo, sha: (t: string) => R): R {
  return sha256DoValor(pacote, sha)
}

/** sha256 pelo WebCrypto (app no celular, testes no Node). Sem `crypto.subtle` (página em http://IP), dá erro. */
export const sha256WebCrypto = async (texto: string): Promise<string> => {
  const subtle = (globalThis as { crypto?: { subtle?: { digest(alg: string, dados: Uint8Array): Promise<ArrayBuffer> } } }).crypto
    ?.subtle
  if (!subtle) throw new Error('WebCrypto indisponível neste contexto: use sha256Hex.')
  const resumo = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(texto)))
  return Array.from(resumo, (b) => b.toString(16).padStart(2, '0')).join('')
}

// sha256 em TypeScript puro (FIPS 180-4), sobre o UTF-8 do texto.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** sha256 em hexadecimal minúsculo do UTF-8 de um texto, síncrono e sem dependências. */
export function sha256Hex(texto: string): string {
  const dados = new TextEncoder().encode(texto)
  const n = dados.length
  // Mensagem + 0x80 + zeros + 64 bits do tamanho em bits, em blocos de 64 bytes
  const total = Math.ceil((n + 9) / 64) * 64
  const m = new Uint8Array(total)
  m.set(dados)
  m[n] = 0x80
  const bits = n * 8
  const visao = new DataView(m.buffer)
  visao.setUint32(total - 8, Math.floor(bits / 0x100000000))
  visao.setUint32(total - 4, bits >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  for (let bloco = 0; bloco < total; bloco += 64) {
    for (let i = 0; i < 16; i++) w[i] = visao.getUint32(bloco + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]
      const b = w[i - 2]
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]
    let f = h[5]
    let g = h[6]
    let hh = h[7]
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('')
}

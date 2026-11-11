// O envio do certificado digital pela rede (Configurações → Certificado digital): a rede da empresa usa HTTP sem
// criptografia, e o navegador só oferece o WebCrypto (crypto.subtle) em HTTPS. Então o .pfx e as senhas vão cifrados
// aqui, em JavaScript: uma chave AES-256-GCM aleatória (crypto.getRandomValues, que funciona em HTTP) cifra os dados, e
// essa chave vai cifrada com RSA-OAEP-SHA256 pela chave pública que o servidor dá para um envio só (10 minutos). O servidor
// abre com `abrirPacote` (server/certificadoDigital.ts).
//
// Este módulo (e o node-forge) só é carregado na tela do certificado digital, sob demanda (`import()`): não pesa no resto
// da interface. Também roda no Node, nos testes do servidor.

// Os tipos (forgeMinimo.d.ts) também para o tsconfig do servidor, que roda este módulo nos testes
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./forgeMinimo.d.ts" />
import forge from 'node-forge/lib/forge.js'
import 'node-forge/lib/aes.js'
import 'node-forge/lib/rsa.js'
import 'node-forge/lib/sha256.js'

/** A chave de envio que o servidor dá (GET /api/certificado-digital/chave). */
export interface ChaveDeEnvio {
  id: string
  publicKeyPem: string
}

/** O que vai para o servidor: nada em claro. */
export interface PacoteCifrado {
  id: string
  /** A chave AES-256 cifrada com RSA-OAEP-SHA256 (base64). */
  chave: string
  /** 12 bytes (base64). */
  iv: string
  /** O JSON cifrado com AES-256-GCM, com a etiqueta de 16 bytes no fim (base64). */
  dados: string
}

/** Bytes aleatórios do navegador (ou do Node), como "binary string" do forge. */
function aleatorios(n: number): string {
  const b = new Uint8Array(n)
  globalThis.crypto.getRandomValues(b)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return s
}

/** Os bytes do arquivo escolhido, em base64 (para ir dentro do JSON). */
export function base64DosBytes(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return forge.util.encode64(s)
}

/** A chave pública (PEM, SubjectPublicKeyInfo) para o forge, sem precisar do leitor de PEM dele. */
function chavePublica(pem: string) {
  const corpo = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '')
  return forge.pki.publicKeyFromAsn1(forge.asn1.fromDer(forge.util.decode64(corpo)))
}

/** Cifra `conteudo` (JSON) para o servidor com a chave de envio. */
export function cifrarPacote(chave: ChaveDeEnvio, conteudo: Record<string, unknown>): PacoteCifrado {
  const aes = aleatorios(32)
  const iv = aleatorios(12)
  const cifra = forge.cipher.createCipher('AES-GCM', forge.util.createBuffer(aes))
  cifra.start({ iv, additionalData: chave.id, tagLength: 128 })
  cifra.update(forge.util.createBuffer(forge.util.encodeUtf8(JSON.stringify(conteudo))))
  cifra.finish()
  const dados = cifra.output.getBytes() + cifra.mode.tag.getBytes()
  const chaveCifrada = chavePublica(chave.publicKeyPem).encrypt(aes, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
    // A semente do OAEP também do gerador do navegador
    seed: aleatorios(32),
  })
  return {
    id: chave.id,
    chave: forge.util.encode64(chaveCifrada),
    iv: forge.util.encode64(iv),
    dados: forge.util.encode64(dados),
  }
}

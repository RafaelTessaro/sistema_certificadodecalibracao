// Os pedaços do node-forge que o navegador usa para cifrar o envio do certificado digital (cifraPacote.ts). Declarados
// aqui, e não pelo @types/node-forge, porque aquele traz os tipos do Node para dentro da interface.

declare module 'node-forge/lib/forge.js' {
  interface Asn1 {
    readonly tagClass: number
  }
  interface ByteBuffer {
    getBytes(): string
  }
  interface ChavePublicaRsa {
    encrypt(dados: string, esquema: 'RSA-OAEP', opcoes: { md: unknown; mgf1: { md: unknown }; seed?: string }): string
  }
  interface Cifra {
    start(o: { iv: string; additionalData?: string; tagLength?: number }): void
    update(dados: ByteBuffer): void
    finish(): boolean
    output: ByteBuffer
    mode: { tag: ByteBuffer }
  }
  const forge: {
    asn1: { fromDer(bytes: string): Asn1 }
    pki: { publicKeyFromAsn1(asn1: Asn1): ChavePublicaRsa }
    md: { sha256: { create(): unknown } }
    cipher: { createCipher(algoritmo: 'AES-GCM', chave: ByteBuffer): Cifra }
    util: {
      createBuffer(bytes?: string): ByteBuffer
      encode64(bytes: string): string
      decode64(texto: string): string
      encodeUtf8(texto: string): string
    }
  }
  export default forge
}
declare module 'node-forge/lib/aes.js'
declare module 'node-forge/lib/rsa.js'
declare module 'node-forge/lib/sha256.js'

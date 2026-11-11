// As raízes da ICP-Brasil em que a assinatura digital confia: as ACs Raiz v5, v10, v11, v12 e v13, embutidas no
// sistema (pasta raizes/, DER) e fixadas pelo SHA-256 do certificado. Um certificado da empresa só é aceito se a
// cadeia dele chegar a uma destas (pfx.ts, conferirA1). O ITI não publica os hashes; eles foram conferidos assim
// (11/11/2026):
//
// - todos: baixados por HTTPS de acraiz.icpbrasil.gov.br (os endereços que a página "Repositório AC Raiz" do gov.br
//   aponta), duas vezes em dias diferentes, com o mesmo resultado, e a LCR atual de cada raiz confere com a chave dela;
// - v5 e v10: também na lista de raízes confiáveis da Microsoft (authroot.stl de 23/10/2026, assinada pela Microsoft;
//   o SHA-1 e o SHA-256 batem);
// - v5: também idêntica na lista de confiança do Adobe (AATL) e na cadeia do PDF assinado do Diário Oficial da União;
// - v11, v12 e v13: só pelo site do ITI (não estão nas listas da Microsoft nem do Adobe).
//
// Uma raiz nova da ICP-Brasil exige atualizar o sistema. A v13 é de curva elíptica: as ACs abaixo dela são aceitas na
// cadeia, mas a chave da empresa precisa ser RSA (pfx.ts).

import { createHash, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ErroCertificadoDigital } from './contrato.ts'

export const RAIZES_ICP_BRASIL = [
  { nome: 'v5', arquivo: 'ICP-Brasilv5.der', sha256: 'caa53fc6091c6951887c976e378f6ef89aa6377c55d97b6475422b71ed7e9b17' },
  { nome: 'v10', arquivo: 'ICP-Brasilv10.der', sha256: '6e0bff069a26994c15de2c4888cc54af84882e5495b7fbf66be9ccffec7489f6' },
  { nome: 'v11', arquivo: 'ICP-Brasilv11.der', sha256: '1406710058180fa4081aab3f246f1702429c552a11fa3143b84c88cb3ab8e5e7' },
  { nome: 'v12', arquivo: 'ICP-Brasilv12.der', sha256: 'd8478e37ce19c690cf657381e68fe600e4e1a042536830f06847e03e554c4b01' },
  { nome: 'v13', arquivo: 'ICP-Brasilv13.der', sha256: '2b07d0bc02c4a6e0478ed22d0d99e8f97e1827b269097696a7feb6aad30c3ac8' },
] as const

let carregadas: X509Certificate[] | undefined

/** As raízes ICP-Brasil fixadas. Um arquivo ausente ou com outro hash é erro de instalação (nunca aceito em silêncio). */
export function raizesIcpBrasil(): X509Certificate[] {
  carregadas ??= RAIZES_ICP_BRASIL.map(({ nome, arquivo, sha256 }) => {
    let der: Buffer
    try {
      der = readFileSync(new URL(`./raizes/${arquivo}`, import.meta.url))
    } catch {
      der = Buffer.alloc(0)
    }
    if (createHash('sha256').update(der).digest('hex') !== sha256)
      throw new ErroCertificadoDigital(
        `O arquivo da raiz ICP-Brasil ${nome} está ausente ou alterado nesta instalação. Reinstale o sistema.`,
      )
    return new X509Certificate(der)
  })
  return carregadas
}

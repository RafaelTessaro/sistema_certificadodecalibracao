// A PKI de teste (gerada por gerar-pki.mjs): leitura dos arquivos e as constantes que os testes usam.

import { createHash, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'

const PASTA = new URL('./pki/', import.meta.url)

export const SENHA = 'Senha@123'
export const SENHA_ACENTO = 'Balança@2026'
export const CNPJ_EMPRESA = '12.345.678/0001-95'
/** O relógio dos testes: dentro da validade da PKI de teste (2026-01-01 a 2046-12-31). */
export const AGORA = new Date('2026-11-11T12:00:00Z')
/** O conteúdo do otherName 2.16.76.1.3.4 (nascimento e CPF do responsável): nunca pode sair do núcleo. */
export const RESPONSAVEL = '01011980123456789090000000000000000000000000000SSPSP'

export const arquivoPki = (nome: string) => readFileSync(new URL(nome, PASTA))
/** O certificado em DER (os .crt são PEM). */
export const derPki = (nome: string) => Buffer.from(new X509Certificate(arquivoPki(`${nome}.crt`)).raw)
export const x509Pki = (nome: string) => new X509Certificate(arquivoPki(`${nome}.crt`))
export const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')
/** A lista de confiança dos testes: só a raiz de teste. */
export const raizesTeste = () => [x509Pki('raiz')]

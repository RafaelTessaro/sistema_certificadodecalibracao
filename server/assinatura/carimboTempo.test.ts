// O cliente de carimbo do tempo (RFC 3161), desligado na 1.0.7: o token real de uma ACT (freetsa, fixture) confere
// com a raiz dela e é recusado com as raízes ICP-Brasil; com uma ACT falsa local, as recusas (situação, nonce,
// imprint, assinatura, uso do certificado, hora, tempo limite) e o carimbo entrando na assinatura do PDF.

import { createHash, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { iniciarActFalsa, type OpcoesActFalsa, respostaCarimbo } from './__fixtures__/actFalsa.ts'
import { arquivoPki, derPki, raizesTeste, SENHA } from './__fixtures__/pki.ts'
import { assinarPdf, conferirPdfAssinado, remontarPdf } from '../pdf/assinaturaPdf.ts'
import { formaDer, lerCms } from './cms.ts'
import type { A1ParaAssinar } from './contrato.ts'
import {
  conferirResposta,
  conferirToken,
  criarCarimbador,
  ErroCarimboTempo,
  montarPedido,
  OID_TSP,
  pedirCarimbo,
} from './carimboTempo.ts'
import { abrirPfx } from './pfx.ts'

const freetsa = (nome: string) => readFileSync(new URL(`./__fixtures__/tsa-freetsa/${nome}`, import.meta.url))
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest()
const AGORA = new Date('2026-11-11T12:00:00Z')

let a1: A1ParaAssinar
let fechar: (() => Promise<void>) | undefined
beforeAll(() => {
  a1 = abrirPfx(arquivoPki('ecnpj-aes.pfx'), SENHA, { raizes: raizesTeste() })
})
afterEach(async () => {
  await fechar?.()
  fechar = undefined
})

/** Sobe a ACT falsa com os defeitos pedidos e devolve as opções do cliente apontando para ela. */
async function act(defeitos: OpcoesActFalsa = {}, servidor: { atrasoMs?: number; status?: number } = {}) {
  const a = await iniciarActFalsa((pedido) => respostaCarimbo(pedido, { genTime: AGORA, ...defeitos }), servidor)
  fechar = a.fechar
  return { a, opcoes: { url: a.url, raizes: raizesTeste(), agora: () => AGORA } }
}

describe('carimbo do tempo (RFC 3161)', () => {
  it('o pedido: SHA-256 do valor, nonce e certReq', () => {
    const resumo = sha256(Buffer.from('valor'))
    const nonce = Buffer.from('0102030405060708', 'hex')
    const pedido = pkijs.TimeStampReq.fromBER(montarPedido(resumo, nonce))
    expect(pedido.version).toBe(1)
    expect(pedido.messageImprint.hashAlgorithm.algorithmId).toBe(OID_TSP.sha256)
    expect(Buffer.from(pedido.messageImprint.hashedMessage.valueBlock.valueHexView)).toEqual(resumo)
    expect(Buffer.from(pedido.nonce!.valueBlock.valueHexView)).toEqual(nonce)
    expect(pedido.certReq).toBe(true)
  })

  it('confere o token real de uma ACT (ECDSA/SHA-512) com a raiz dela; com as raízes ICP-Brasil, recusa', () => {
    const resposta = freetsa('resp.tsr')
    const resumo = sha256(freetsa('dado.txt'))
    const raizFreetsa = [new X509Certificate(freetsa('cacert.pem'))]
    const { token, info } = conferirResposta(resposta, { resumo, raizes: raizFreetsa })
    expect(info.genTime.toISOString()).toBe('2026-11-10T23:04:50.000Z')
    expect(info.certificadoAct.raw.equals(new X509Certificate(freetsa('tsa.crt')).raw)).toBe(true)
    // O token sai nos bytes em que veio, dentro da resposta
    expect(resposta.includes(token)).toBe(true)
    expect(conferirToken(token, { resumo, raizes: raizFreetsa }).serie).toBe(info.serie)
    expect(() => conferirToken(token, { resumo: sha256(Buffer.from('outro')), raizes: raizFreetsa })).toThrow(/messageImprint/)
    expect(() => conferirToken(token, { resumo })).toThrow(/raiz da ICP-Brasil/)
    // A hora conferida só no carimbo recém-pedido
    expect(() => conferirToken(token, { resumo, raizes: raizFreetsa, agora: AGORA })).toThrow(/5 minutos/)
  })

  it('o token da ACT falsa é DER como o de uma ACT de verdade: o TSTInfo num OCTET STRING primitivo', () => {
    const pedido = montarPedido(sha256(Buffer.from('valor')), Buffer.from('0102030405060708', 'hex'))
    for (const resposta of [freetsa('resp.tsr'), respostaCarimbo(pedido, { genTime: AGORA })]) {
      const token = Buffer.from((asn1js.fromBER(resposta).result as asn1js.Sequence).valueBlock.value[1].valueBeforeDecodeView)
      expect(formaDer(token)).toBe(true)
      const sd = new pkijs.SignedData({ schema: pkijs.ContentInfo.fromBER(token).content })
      expect(sd.encapContentInfo.eContent!.idBlock.isConstructed).toBe(false)
      expect(formaDer(Buffer.from(sd.encapContentInfo.eContent!.getValue()))).toBe(true)
    }
  })

  it('recusa o token em BER (o TSTInfo num OCTET STRING construído): ele iria para o CMS do PDF, que tem de ser DER', async () => {
    const { opcoes } = await act({ ber: true })
    await expect(pedirCarimbo(Buffer.from('valor'), opcoes)).rejects.toThrow(ErroCarimboTempo)
    await expect(pedirCarimbo(Buffer.from('valor'), opcoes)).rejects.toThrow(/não está em DER/)
  })

  it('pede à ACT e devolve o token conferido', async () => {
    const { a, opcoes } = await act()
    const valor = Buffer.from('valor da assinatura')
    const token = await pedirCarimbo(valor, opcoes)
    expect(a.pedidos).toHaveLength(1)
    expect(a.pedidos[0].tipo).toBe('application/timestamp-query')
    const pedido = pkijs.TimeStampReq.fromBER(a.pedidos[0].corpo)
    expect(Buffer.from(pedido.messageImprint.hashedMessage.valueBlock.valueHexView)).toEqual(sha256(valor))
    expect(pedido.nonce!.valueBlock.valueHexView.length).toBe(8)
    const info = conferirToken(token, { resumo: sha256(valor), raizes: raizesTeste() })
    expect(info.genTime).toEqual(AGORA)
    expect(info.certificadoAct.raw.equals(derPki('tsa'))).toBe(true)
  })

  it.each<[string, OpcoesActFalsa, RegExp]>([
    ['situação recusada', { situacao: 2 }, /recusou o carimbo do tempo \(situação 2: pedido recusado/],
    ['nonce errado', { trocarNonce: true }, /nonce diferente/],
    ['imprint errado', { trocarImprint: true }, /messageImprint diferente/],
    ['assinatura estragada', { estragarAssinatura: true }, /assinatura do carimbo do tempo não confere/],
    ['certificado sem o uso timeStamping', { certificado: derPki('ecnpj') }, /não é de carimbo do tempo/],
    ['hora longe do relógio', { genTime: new Date(AGORA.getTime() + 6 * 60_000) }, /5 minutos/],
  ])('recusa: %s', async (_, defeitos, motivo) => {
    const { opcoes } = await act(defeitos.certificado ? { ...defeitos, chave: a1.chave } : defeitos)
    const p = pedirCarimbo(Buffer.from('valor'), opcoes)
    await expect(p).rejects.toThrow(ErroCarimboTempo)
    await expect(pedirCarimbo(Buffer.from('valor'), opcoes)).rejects.toThrow(motivo)
  })

  it('recusa pela raiz: a ACT de teste não vale com as raízes ICP-Brasil', async () => {
    const { opcoes } = await act()
    await expect(pedirCarimbo(Buffer.from('valor'), { ...opcoes, raizes: undefined })).rejects.toThrow(/raiz da ICP-Brasil/)
  })

  it('tempo limite e erro HTTP', async () => {
    const lenta = await act({}, { atrasoMs: 2_000 })
    const inicio = Date.now()
    await expect(pedirCarimbo(Buffer.from('valor'), { ...lenta.opcoes, tempoLimiteMs: 200 })).rejects.toThrow(
      /não respondeu em 0 s/,
    )
    expect(Date.now() - inicio).toBeLessThan(1_500)
    await fechar!()
    const quebrada = await act({}, { status: 500 })
    await expect(pedirCarimbo(Buffer.from('valor'), quebrada.opcoes)).rejects.toThrow(/HTTP 500/)
    await expect(pedirCarimbo(Buffer.from('valor'), { ...quebrada.opcoes, url: 'ftp://x' })).rejects.toThrow(/http:\/\//)
  })

  it('o carimbo entra na assinatura do PDF (B-T) e o PDF remonta das partes sem a ACT', async () => {
    const { opcoes } = await act()
    const base = montarPdfMinimo()
    const { pdf, partes } = await assinarPdf(base, a1, {
      m: AGORA,
      nome: 'BALANÇAS TESTE LTDA',
      local: 'Rio Claro/SP',
      motivo: 'teste',
      carimbo: criarCarimbador(opcoes),
    })
    const token = lerCms(conferirPdfAssinado(pdf, a1.certificadoDer).cms).carimbo!
    expect(token.toString('base64')).toBe(partes.carimbo)
    expect(conferirToken(token, { resumo: sha256(Buffer.from(partes.valor, 'base64')), raizes: raizesTeste() }).genTime).toEqual(
      AGORA,
    )
    await fechar!()
    fechar = undefined
    expect(remontarPdf(base, partes, a1).equals(pdf)).toBe(true)
  })
})

/** Um PDF mínimo de uma página, com a tabela xref clássica. */
function montarPdfMinimo() {
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
  ]
  let s = '%PDF-1.7\n'
  const pos: number[] = []
  objetos.forEach((o, i) => {
    pos.push(s.length)
    s += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = s.length
  s += `xref\n0 4\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`
  s += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(s, 'latin1')
}

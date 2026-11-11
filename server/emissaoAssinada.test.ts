// Emissão com o certificado digital da empresa instalado (1.0.7, PLANO §2.6), pela API e com o gerador de verdade: o
// PDF guardado é o assinado (o hash é o dele), as partes da assinatura ficam na emissão antes do arquivo, o certificado
// que não pode assinar recusa a emissão antes de gastar o número, a falha depois da emissão deixa o certificado
// "aguardando assinatura" (nunca é entregue sem ela) e o arquivo que sumir volta idêntico, sem a chave. O serviço do
// certificado é o de teste (a PKI de teste, sem cofre).

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Calibracao, EmissaoCertificado, PartesAssinaturaPdf } from '#shared/tipos.ts'
import { CNPJ_EMPRESA } from './assinatura/__fixtures__/pki.ts'
import { a1Teste, type ServicoFalso, servicoCertificadoFalso } from './assinatura/__fixtures__/servicoFalso.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin } from './auxiliaresTeste.ts'
import { avisoPdfNaoAssinado, gerarPdf, tentarPdfsPendentes } from './certificados.ts'
import { gravarConfigEmail } from './email.ts'
import { conferirPdfAssinado } from './pdf/assinaturaPdf.ts'
import { textoPdf } from './pdf/carimbo.ts'

const existe = (programa: string, arg = '-v') => !spawnSync(programa, [arg], { stdio: 'ignore' }).error
const temPdftotext = existe('pdftotext')
const temPdfsig = existe('pdfsig')
const textoDoPdf = (pdf: Buffer) =>
  spawnSync('pdftotext', ['-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 }).stdout.toString('utf8')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const ano = new Date().getFullYear()
const cc = (n: number) => `CC-${ano}-${String(n).padStart(5, '0')}`
const temAssinatura = (pdf: Buffer) => pdf.includes('/ByteRange')
/** O fim do texto do pendente que só o certificado digital congelado na emissão assina (até antes do que a correção faz). */
const SO_O_DA_EMISSAO =
  'Só um certificado digital de BALANÇAS TESTE LTDA (CNPJ 12.345.678/0001-95) pode assiná-lo: ele é assinado sozinho (ao ' +
  'abrir o PDF ou na tentativa automática) quando o administrador instalar um em Configurações → Certificado digital. Se ' +
  'não houver, use “Corrigir certificado” na ficha dele'

interface MensagemJson {
  attachments: Array<{ filename: string; content: string; encoding: string }>
}

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>
let cert: ServicoFalso
let enviados: MensagemJson[]

beforeEach(async () => {
  enviados = []
  t = await criarAppComLogin({
    transporteEmail: () => {
      const transporte = nodemailer.createTransport({ jsonTransport: true })
      const enviar = transporte.sendMail.bind(transporte)
      transporte.sendMail = (async (m: Parameters<typeof enviar>[0]) => {
        const info = await enviar(m)
        enviados.push(JSON.parse(String(info.message)))
        return info
      }) as typeof transporte.sendMail
      return transporte
    },
  })
  gravarConfigEmail(t.ctx, {
    servidor: 'smtp.exemplo.com',
    porta: 587,
    seguranca: 'STARTTLS',
    usuario: 'certificados@balancass.com',
    senha: 'senha-de-app',
    remetenteNome: 'Balanças.com',
    remetenteEmail: 'certificados@balancass.com',
  })
  // A empresa com o CNPJ do certificado de teste
  const config = t.ctx.repo.obterConfig()
  t.ctx.repo.salvarConfig({ ...config, empresa: { ...config.empresa, cnpj: CNPJ_EMPRESA } })
  cert = servicoCertificadoFalso(a1Teste('ecnpj-aes'))
  t.ctx.certificadoDigital = cert
  c = await cenarioCalibracao(t)
}, 60_000)
afterEach(async () => {
  await t.fechar()
})

const obter = (id: string) => t.ctx.repo.obterCalibracao(id)!
const caminhoDo = (k: Pick<Calibracao, 'id'>) => join(t.pasta, 'certificados', obter(k.id).emissao!.arquivo)
const pastaDoAno = () =>
  existsSync(join(t.pasta, 'certificados', String(ano))) ? readdirSync(join(t.pasta, 'certificados', String(ano))).sort() : []
const baixar = (k: Pick<Calibracao, 'id'>) => t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
/** O contador da sequência dos certificados do ano (o último nº dado) e os certificados do ano no banco. */
const sequencia = () => ({
  meta: t.ctx.db.prepare('SELECT valor FROM meta WHERE chave = ?').get(`sequencia_${ano}`) ?? null,
  calibracoes: t.ctx.db.prepare('SELECT COUNT(*) AS n FROM calibracoes WHERE ano = ?').get(ano),
})
async function emitir(k: Calibracao) {
  const atual = obter(k.id)
  return t.chamar('POST', `/api/calibracoes/${k.id}/emitir`, { cookie: t.cookieAdmin, payload: { versao: atual.versao } })
}
async function emitido(): Promise<Calibracao> {
  const r = await emitir(await c.calibracaoPronta())
  expect(r.statusCode, r.body).toBe(200)
  expect(r.json()).not.toHaveProperty('aviso')
  return r.json().calibracao
}
/** Muda a emissão gravada (como se o banco tivesse outro conteúdo). */
function gravarEmissao(id: string, mudar: (e: EmissaoCertificado) => EmissaoCertificado) {
  const k = obter(id)
  t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify({ ...k, emissao: mudar(k.emissao!) }), id)
}
const auditoria = (acao: string) =>
  (t.ctx.db.prepare('SELECT detalhe FROM auditoria WHERE acao = ? ORDER BY id').all(acao) as Array<{ detalhe: string }>).map(
    (x) => x.detalhe,
  )

describe('emissão com o certificado digital instalado', () => {
  it('o PDF guardado é o assinado: hashPdf = sha256 do arquivo, assinaturaDigital e as partes congeladas na emissão', async () => {
    const antes = Date.now()
    const k = await emitido()
    const e = obter(k.id).emissao!
    const a1 = a1Teste('ecnpj-aes')
    expect(e.assinaturaDigital).toEqual({ titular: 'BALANÇAS TESTE LTDA', cnpj: '12345678000195', certificado: a1.dados.sha256 })
    const pdf = readFileSync(caminhoDo(k))
    expect(e.hashPdf).toBe(sha(pdf))
    expect(e.arquivo).toBe(`${ano}/Certificado-${cc(1)}.pdf`)
    // O PDF do pdfmake fica intacto no começo; a assinatura confere com o certificado da empresa
    const base = await gerarPdf(obter(k.id), e, '')
    expect(pdf.subarray(0, base.length).equals(base)).toBe(true)
    expect(() => conferirPdfAssinado(pdf, a1.certificadoDer)).not.toThrow()
    const partes = e.assinatura!
    expect(partes).toMatchObject({
      formato: 1,
      docmdp: 2,
      nome: 'BALANÇAS TESTE LTDA',
      local: 'Rio Claro/SP',
      motivo: `Emissão do certificado de calibração nº ${cc(1)}`,
      certificado: a1.dados.sha256,
      hashBase: sha(base),
    })
    expect(partes).not.toHaveProperty('carimbo')
    // /M: a hora real da assinatura (truncada ao segundo)
    expect(new Date(partes.m).getTime()).toBeGreaterThanOrEqual(Math.floor(antes / 1000) * 1000)
    expect(new Date(partes.m).getTime()).toBeLessThanOrEqual(Date.now())
    // O download e o e-mail entregam esse arquivo
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.rawPayload.equals(pdf)).toBe(true)
    const envio = await t.chamar('POST', `/api/calibracoes/${k.id}/email`, {
      cookie: t.cookieAdmin,
      payload: { para: 'qualidade@mercado.com.br', assunto: 'Certificado', texto: 'Segue.' },
    })
    expect(envio.statusCode, envio.body).toBe(200)
    const anexo = enviados[0].attachments.find((a) => a.filename === `Certificado-${cc(1)}.pdf`)!
    expect(Buffer.from(anexo.content, 'base64').equals(pdf)).toBe(true)
    // A verificação pública: o titular e o CNPJ, e o hash do arquivo assinado
    const v = (await t.app.inject({ method: 'GET', url: `/api/verificar/${e.codigo}` })).json()
    expect(v.hashPdf).toBe(sha(pdf))
    // Com a validade do certificado que assinou: sem carimbo do tempo, depois dela o validador dá "Indeterminado"
    expect(v.assinaturaDigital).toEqual({
      titular: 'BALANÇAS TESTE LTDA',
      cnpj: '12345678000195',
      validoAte: a1.dados.validoAte,
    })
    // O registro de atividades da emissão diz que saiu assinado, com a série do certificado
    expect(auditoria('CERTIFICADO_EMITIDO').at(-1)).toContain(`assinado digitalmente (série ${a1.dados.serie})`)
  })

  it.runIf(temPdftotext)('o PDF assinado: o quadro da assinatura digital, sem as imagens das assinaturas', async () => {
    const k = await emitido()
    const texto = textoDoPdf(readFileSync(caminhoDo(k))).replace(/\s+/g, ' ')
    expect(texto).toContain('Documento assinado digitalmente por BALANÇAS TESTE LTDA, CNPJ 12.345.678/0001-95')
    expect(texto).toContain('validar.iti.gov.br')
    expect(texto).not.toContain('A1')
  })

  it.runIf(temPdfsig)('pdfsig: "Signature is Valid" e "Total document signed" no arquivo emitido', async () => {
    const k = await emitido()
    const saida = spawnSync('pdfsig', [caminhoDo(k)], { encoding: 'utf8' }).stdout
    expect(saida).toContain('Signature Validation: Signature is Valid.')
    expect(saida).toContain('Total document signed')
  })

  it('sem certificado instalado: sai como na 1.0.6 (sem assinaturaDigital, os bytes do gerador, sem assinatura)', async () => {
    cert.remover()
    const k = await emitido()
    const e = obter(k.id).emissao!
    expect(e).not.toHaveProperty('assinaturaDigital')
    expect(e).not.toHaveProperty('assinatura')
    const pdf = readFileSync(caminhoDo(k))
    expect(temAssinatura(pdf)).toBe(false)
    expect(pdf.equals(await gerarPdf(obter(k.id), e, ''))).toBe(true)
    expect(auditoria('CERTIFICADO_EMITIDO').at(-1)).not.toContain('assinado digitalmente')
    // Sem o serviço (instalação sem ele), também
    t.ctx.certificadoDigital = undefined
    const k2 = await emitido()
    expect(obter(k2.id).emissao).not.toHaveProperty('assinaturaDigital')
    expect(temAssinatura(readFileSync(caminhoDo(k2)))).toBe(false)
  })

  it.each([
    ['vencido', () => cert.instalar(a1Teste('vencido')), 'venceu'],
    ['que ainda não vale', () => cert.instalar(a1Teste('futuro')), 'só vale a partir de'],
    ['de outro CNPJ', () => cert.instalar(a1Teste('outro')), 'CNPJ 98.765.432/0001-98'],
    ['que não abre no servidor', () => cert.naoAbre('O certificado digital não abre no servidor.'), 'não abre'],
  ])('certificado %s: 409 antes de gastar o número; rascunho, sequência e pasta como estavam', async (_, preparar, trecho) => {
    const k = await c.calibracaoPronta()
    const antes = sequencia()
    preparar()
    const r = await emitir(k)
    expect(r.statusCode, r.body).toBe(409)
    expect(r.json().erro).toContain(trecho)
    expect(r.json().codigo).toBe('CERTIFICADO_DIGITAL')
    const depois = obter(k.id)
    expect(depois.status).toBe('RASCUNHO')
    expect(depois.numero).toBe('')
    expect(depois.emissao ?? null).toBeNull()
    expect(sequencia()).toEqual(antes)
    expect(pastaDoAno()).toEqual([])
    expect(auditoria('CERTIFICADO_EMITIDO')).toEqual([])
    // Resolvido (o certificado certo instalado), emite com o primeiro nº
    cert.naoAbre(null)
    cert.instalar(a1Teste('ecnpj-aes'))
    const ok = await emitir(k)
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json().calibracao.numero).toBe(cc(1))
  })

  it('o certificado da filial (mesma raiz do CNPJ) assina; o CNPJ congelado é o do certificado', async () => {
    cert.instalar(a1Teste('filial'))
    const k = await emitido()
    expect(obter(k.id).emissao!.assinaturaDigital!.cnpj).toBe('12345678000276')
    expect(temAssinatura(readFileSync(caminhoDo(k)))).toBe(true)
  })

  it('aviso a partir de 30 dias do vencimento do certificado digital; e o certificado que não pode assinar, antes de emitir', async () => {
    const k = await c.calibracaoPronta()
    const avisos = async () =>
      (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().avisos as string[]
    expect((await avisos()).filter((a) => a.includes('certificado digital'))).toEqual([])
    const a1 = a1Teste('ecnpj-aes')
    // Ao meio-dia de Brasília, daqui a N dias do calendário (os dias do aviso são os do calendário de Brasília)
    const hojeBr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const em = (dias: number) => new Date(Date.parse(`${hojeBr}T15:00:00Z`) + dias * 86_400_000).toISOString()
    const dataBr = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
    cert.instalar({ ...a1, dados: { ...a1.dados, validoAte: em(31) } })
    expect((await avisos()).filter((a) => a.includes('certificado digital'))).toEqual([])
    cert.instalar({ ...a1, dados: { ...a1.dados, validoAte: em(12) } })
    expect(await avisos()).toContain(
      `O certificado digital da empresa vence em 12 dias (${dataBr(em(12))} às 12:00). A partir desse horário, a emissão fica bloqueada até o administrador instalar o novo.`,
    )
    cert.instalar({ ...a1, dados: { ...a1.dados, validoAte: em(1) } })
    expect(await avisos()).toContain(
      `O certificado digital da empresa vence amanhã (${dataBr(em(1))} às 12:00). A partir desse horário, a emissão fica bloqueada até o administrador instalar o novo.`,
    )
    // O que não pode assinar impede a emissão: é pendência (a tela não deixa emitir e diz onde resolver), não aviso
    cert.instalar(a1Teste('vencido'))
    expect((await avisos()).filter((a) => a.includes('certificado digital'))).toEqual([])
    const { pendencias } = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(pendencias).toEqual([
      'O certificado digital da empresa venceu: a emissão fica bloqueada até o administrador resolver em Configurações → Certificado digital.',
    ])
    const r = await c.emitir(k)
    expect([r.statusCode, r.json().codigo]).toEqual([409, 'CERTIFICADO_DIGITAL'])
  })

  it('o certificado que não pode assinar não impede o envio para autorização: só a emissão (409 antes de gastar o nº)', async () => {
    const config = t.ctx.repo.obterConfig()
    t.ctx.repo.salvarConfig({ ...config, exigirRevisor: true })
    const VENCIDO =
      'O certificado digital da empresa venceu: a emissão fica bloqueada até o administrador resolver em Configurações → Certificado digital.'
    const pedir = (k: Calibracao) =>
      t.chamar('POST', `/api/calibracoes/${k.id}/autorizacao`, {
        cookie: t.cookieComum,
        payload: { signatarioId: t.adminId, versao: obter(k.id).versao },
      })
    // O operador digita a calibração e envia para o administrador (signatário) autorizar
    const k = await c.calibracaoPronta([], t.cookieComum)
    cert.instalar(a1Teste('vencido'))
    const pedido = await pedir(k)
    expect(pedido.statusCode, pedido.body).toBe(200)
    expect(pedido.json().calibracao).toMatchObject({ status: 'REVISAO', autorizacao: { signatarioId: t.adminId } })
    // A pendência continua na tela (é de quem emite) e a emissão continua recusada, sem gastar o nº
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.pendencias).toEqual([VENCIDO])
    const antes = sequencia()
    const r = await emitir(obter(k.id))
    expect([r.statusCode, r.json().codigo]).toEqual([409, 'CERTIFICADO_DIGITAL'])
    expect(sequencia()).toEqual(antes)
    expect(obter(k.id)).toMatchObject({ status: 'REVISAO', numero: '' })
    // O que falta na calibração continua impedindo o envio (só o certificado digital fica para a emissão)
    const { calibracao: vazia } = (
      await t.chamar('POST', '/api/calibracoes', {
        cookie: t.cookieComum,
        payload: { clienteId: c.cliente.id, balancaId: c.balanca.id },
      })
    ).json()
    const incompleta = await pedir(vazia)
    expect(incompleta.statusCode).toBe(409)
    expect(incompleta.json().erro).toMatch(/^Antes de enviar para autorização: /)
    expect(incompleta.json().pendencias).not.toContain(VENCIDO)
    // Resolvido pelo administrador, quem autoriza emite (assinado)
    cert.instalar(a1Teste('ecnpj-aes'))
    const ok = await emitir(obter(k.id))
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json().calibracao.emissao.assinatura).toBeTruthy()
  })

  it('prévia: nunca assinada; com o certificado instalado, diz que a emissão sairá assinada', async () => {
    const k = await c.calibracaoPronta()
    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/previa`, { cookie: t.cookieAdmin, payload: k })
    expect(r.statusCode, r.body).toBe(200)
    expect(temAssinatura(r.rawPayload)).toBe(false)
    const pelaRotaDoPdf = await baixar(k)
    expect(pelaRotaDoPdf.statusCode).toBe(200)
    expect(temAssinatura(pelaRotaDoPdf.rawPayload)).toBe(false)
    expect(cert.chamadas).toBe(0)
    if (temPdftotext) {
      const texto = textoDoPdf(r.rawPayload).replace(/\s+/g, ' ')
      expect(texto).toContain('Na emissão, este certificado será assinado digitalmente por BALANÇAS TESTE LTDA')
      cert.remover()
      const sem = await t.chamar('POST', `/api/calibracoes/${k.id}/previa`, { cookie: t.cookieAdmin, payload: k })
      expect(textoDoPdf(sem.rawPayload)).not.toContain('assinado digitalmente')
    }
  })
})

describe('falha da assinatura depois da emissão', () => {
  it('a emissão fica, com o aviso; o PDF não é entregue até assinar, o Painel conta e a tentativa automática assina', async () => {
    const k = await c.calibracaoPronta()
    // A emissão confere o certificado (1ª chamada); na hora de assinar, ele não abre mais
    cert.naoAbre('O certificado digital não abre no servidor.', 2)
    const r = await emitir(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().aviso).toBe(avisoPdfNaoAssinado('O certificado digital não abre no servidor.'))
    expect(r.json().aviso).toBe(
      'O certificado foi emitido, mas ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. ' +
        'Motivo: o certificado digital não abre no servidor. Ele é assinado sozinho (ao abrir o PDF ou na tentativa ' +
        'automática) depois que o administrador resolver em Configurações → Certificado digital.',
    )
    const e = obter(k.id).emissao!
    expect(obter(k.id).status).toBe('EMITIDO')
    expect(e.assinaturaDigital).toBeTruthy()
    expect(e.assinatura).toBeUndefined()
    expect(e.hashPdf).toBe('')
    expect(pastaDoAno()).toEqual([])
    expect(auditoria('CERTIFICADO_EMITIDO').at(-1)).toContain('ainda não assinado digitalmente')
    // Nem baixar, nem os anexos, nem o e-mail: nunca o PDF sem a assinatura
    const pdf = await baixar(k)
    expect(pdf.statusCode).toBe(409)
    expect(pdf.json().erro).toBe(
      `O certificado ${cc(1)} ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. ` +
        'Motivo: o certificado digital não abre no servidor. Ele é assinado sozinho (ao abrir o PDF ou na tentativa ' +
        'automática) depois que o administrador resolver em Configurações → Certificado digital.',
    )
    expect((await t.chamar('GET', `/api/calibracoes/${k.id}/anexos`, { cookie: t.cookieAdmin })).statusCode).toBe(409)
    const envio = await t.chamar('POST', `/api/calibracoes/${k.id}/email`, {
      cookie: t.cookieAdmin,
      payload: { para: 'qualidade@mercado.com.br', assunto: 'Certificado', texto: 'Segue.' },
    })
    expect(envio.statusCode).toBe(409)
    expect(enviados).toEqual([])
    expect(pastaDoAno()).toEqual([])
    // O Painel conta os que aguardam a assinatura
    expect((await t.chamar('GET', '/api/painel', { cookie: t.cookieAdmin })).json().painel.aguardandoAssinatura).toBe(1)
    // A lista o distingue do emitido pronto (a pílula não é a verde de "Emitido")
    const naLista = async () =>
      (await t.chamar('GET', '/api/calibracoes?status=EMITIDO', { cookie: t.cookieAdmin }))
        .json()
        .itens.find((x: { id: string }) => x.id === k.id)
    expect(await naLista()).toMatchObject({ status: 'EMITIDO', aguardandoAssinatura: true })
    // A tentativa automática, ainda sem o certificado: nada muda
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [], falhas: [cc(1)] })
    expect(obter(k.id).emissao!.hashPdf).toBe('')
    // Resolvido: a tentativa automática assina e grava
    cert.naoAbre(null)
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [cc(1)], falhas: [] })
    const assinado = readFileSync(caminhoDo(k))
    expect(temAssinatura(assinado)).toBe(true)
    expect(obter(k.id).emissao!.hashPdf).toBe(sha(assinado))
    expect((await t.chamar('GET', '/api/painel', { cookie: t.cookieAdmin })).json().painel.aguardandoAssinatura).toBe(0)
    expect(await naLista()).not.toHaveProperty('aguardandoAssinatura')
    expect((await baixar(k)).rawPayload.equals(assinado)).toBe(true)
  })

  it('assinado em segundo plano: avisa as telas (a ficha aberta deixa de mostrar "aguardando")', async () => {
    const k = await c.calibracaoPronta()
    cert.naoAbre('O certificado digital não abre no servidor.', 2)
    expect((await emitir(k)).json().aviso).toBeTruthy()
    const publicar = vi.spyOn(t.ctx.tempoReal, 'publicar')
    const avisos = () => publicar.mock.calls.map(([m]) => m).filter((m) => m.tipo === 'calibracao' && m.id === k.id)
    // Ainda sem o certificado: nada mudou, nada a avisar
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [], falhas: [cc(1)] })
    await Promise.resolve()
    expect(avisos()).toEqual([])
    cert.naoAbre(null)
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [cc(1)], falhas: [] })
    await Promise.resolve()
    expect(avisos()).toHaveLength(1)
  })

  it('assinado ao abrir: o download assina, grava e serve o assinado', async () => {
    const k = await c.calibracaoPronta()
    cert.naoAbre('O certificado digital não abre no servidor.', 2)
    expect((await emitir(k)).json().aviso).toBeTruthy()
    cert.naoAbre(null)
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(temAssinatura(r.rawPayload)).toBe(true)
    expect(r.rawPayload.equals(readFileSync(caminhoDo(k)))).toBe(true)
    expect(obter(k.id).emissao!.hashPdf).toBe(sha(r.rawPayload))
  })

  it('o certificado trocado por outro do mesmo CNPJ e titular assina o pendente; o de outro CNPJ, não', async () => {
    const k = await c.calibracaoPronta()
    cert.naoAbre('O certificado digital não abre no servidor.', 2)
    expect((await emitir(k)).json().aviso).toBeTruthy()
    cert.naoAbre(null)
    // Outro CNPJ (a empresa também mudou de CNPJ em Configurações): o congelado na emissão não é o dele
    const config = t.ctx.repo.obterConfig()
    t.ctx.repo.salvarConfig({ ...config, empresa: { ...config.empresa, cnpj: '98.765.432/0001-98' } })
    cert.instalar(a1Teste('outro'))
    const recusado = await baixar(k)
    expect(recusado.statusCode).toBe(409)
    // Não manda resolver em Configurações (lá está "Em dia"): diz qual certificado assina e a saída, se ele não voltar
    expect(recusado.json().erro).toBe(
      `O certificado ${cc(1)} ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. Motivo: o ` +
        'certificado digital instalado é do CNPJ 98.765.432/0001-98, e este certificado de calibração foi emitido para ser ' +
        `assinado com o do CNPJ 12.345.678/0001-95. ${SO_O_DA_EMISSAO}: a correção sai assinada com o certificado digital instalado.`,
    )
    expect(obter(k.id).emissao!.assinatura).toBeUndefined()
    // O de outro CNPJ com o CNPJ da empresa ainda o antigo (CNPJ diferente do da empresa): o motivo é o mesmo
    t.ctx.repo.salvarConfig({ ...config, empresa: { ...config.empresa, cnpj: CNPJ_EMPRESA } })
    expect((await baixar(k)).json().erro).toContain(`Motivo: o certificado digital instalado é do CNPJ 98.765.432/0001-98`)
    // Do mesmo CNPJ, com outro titular (o e-CNPJ renovado com a razão social nova)
    cert.instalar(a1Teste('ecnpj-aes'))
    gravarEmissao(k.id, (e) => ({ ...e, assinaturaDigital: { ...e.assinaturaDigital!, titular: 'BALANÇAS ANTIGA LTDA' } }))
    expect((await baixar(k)).json().erro).toBe(
      `O certificado ${cc(1)} ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. Motivo: o ` +
        'certificado digital instalado é de BALANÇAS TESTE LTDA, e este certificado de calibração foi emitido para ser ' +
        'assinado pelo de BALANÇAS ANTIGA LTDA. Só um certificado digital de BALANÇAS ANTIGA LTDA (CNPJ 12.345.678/0001-95) ' +
        'pode assiná-lo: ele é assinado sozinho (ao abrir o PDF ou na tentativa automática) quando o administrador instalar ' +
        'um em Configurações → Certificado digital. Se não houver, use “Corrigir certificado” na ficha dele: a correção sai ' +
        'assinada com o certificado digital instalado.',
    )
    gravarEmissao(k.id, (e) => ({ ...e, assinaturaDigital: { ...e.assinaturaDigital!, titular: 'BALANÇAS TESTE LTDA' } }))
    // Nenhum instalado: o mesmo, sem dizer que a correção sai assinada
    cert.remover()
    expect((await baixar(k)).json().erro).toBe(
      `O certificado ${cc(1)} ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. Motivo: ` +
        `nenhum certificado digital da empresa está instalado. ${SO_O_DA_EMISSAO}.`,
    )
    // O SE-S (a renovação) do mesmo CNPJ e titular: assina
    t.ctx.repo.salvarConfig({ ...config, empresa: { ...config.empresa, cnpj: CNPJ_EMPRESA } })
    const ses = a1Teste('ses')
    cert.instalar(ses)
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(obter(k.id).emissao!.assinatura!.certificado).toBe(ses.dados.sha256)
    expect(() => conferirPdfAssinado(r.rawPayload, ses.certificadoDer)).not.toThrow()
  })

  it('queda entre gravar as partes e gravar o arquivo: a nova tentativa remonta (sem duplicata, sem 2ª assinatura)', async () => {
    const k = await c.calibracaoPronta()
    // A gravação do arquivo falha (uma pasta no lugar do temporário), depois de assinar
    const parcial = join(t.pasta, 'certificados', String(ano), `Certificado-${cc(1)}.pdf.parcial`)
    mkdirSync(parcial, { recursive: true })
    const r = await emitir(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().aviso).toBe('O certificado foi emitido, mas o PDF não pôde ser gravado agora. Ele é gerado de novo ao abrir.')
    const partes = obter(k.id).emissao!.assinatura!
    expect(partes).toBeTruthy()
    expect(obter(k.id).emissao!.hashPdf).toBe('')
    rmSync(parcial, { recursive: true })
    // O certificado nem abre mais: a remontagem não precisa da chave
    cert.naoAbre('O certificado digital não abre no servidor.')
    const chamadas = cert.chamadas
    const pdf = await baixar(k)
    expect(pdf.statusCode, pdf.body).toBe(200)
    expect(cert.chamadas).toBe(chamadas)
    expect(obter(k.id).emissao!.assinatura).toEqual(partes)
    expect(obter(k.id).emissao!.hashPdf).toBe(sha(pdf.rawPayload))
    expect(pastaDoAno()).toEqual([`Certificado-${cc(1)}.pdf`])
  })

  it('o arquivo gravado e o registro perdido: gravar de novo dá o mesmo arquivo, sem o -<sha12>.pdf', async () => {
    const k = await emitido()
    const entregue = readFileSync(caminhoDo(k))
    const partes = obter(k.id).emissao!.assinatura
    gravarEmissao(k.id, (e) => ({ ...e, hashPdf: '', arquivo: '' }))
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [cc(1)], falhas: [] })
    expect(pastaDoAno()).toEqual([`Certificado-${cc(1)}.pdf`])
    expect(readFileSync(caminhoDo(k)).equals(entregue)).toBe(true)
    expect(obter(k.id).emissao!.hashPdf).toBe(sha(entregue))
    expect(obter(k.id).emissao!.assinatura).toEqual(partes)
  })

  it.each([
    ['com o mesmo certificado', () => {}],
    ['com o certificado removido', () => cert.remover()],
    ['com o certificado que não abre', () => cert.naoAbre('O certificado digital não abre no servidor.')],
  ])(
    'o banco voltou de uma cópia de antes da assinatura (%s): o PDF assinado da pasta é adotado, sem assinar de novo',
    async (_, preparar) => {
      const k = await emitido()
      const entregue = readFileSync(caminhoDo(k))
      const { hashPdf, assinatura } = obter(k.id).emissao!
      // A cópia do banco feita entre a emissão e a assinatura, posta no lugar sem o transplante
      gravarEmissao(k.id, ({ assinatura: _partes, ...e }) => ({ ...e, hashPdf: '', arquivo: '' }))
      preparar()
      const chamadas = cert.chamadas
      expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [cc(1)], falhas: [] })
      expect(cert.chamadas).toBe(chamadas)
      // O mesmo documento entregue: o mesmo hash (o QR code continua conferindo), sem um 2º arquivo
      expect(obter(k.id).emissao!.hashPdf).toBe(hashPdf)
      expect(obter(k.id).emissao!.assinatura).toEqual(assinatura)
      expect(pastaDoAno()).toEqual([`Certificado-${cc(1)}.pdf`])
      expect((await baixar(k)).rawPayload.equals(entregue)).toBe(true)
    },
  )

  it('na pasta, um PDF que não é o assinado desta emissão: não é adotado (assina de novo, ao lado)', async () => {
    const k = await emitido()
    const caminho = caminhoDo(k)
    gravarEmissao(k.id, ({ assinatura: _partes, ...e }) => ({ ...e, hashPdf: '', arquivo: '' }))
    writeFileSync(caminho, Buffer.concat([readFileSync(caminho), Buffer.from('\n% outro\n')]))
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [cc(1)], falhas: [] })
    expect(pastaDoAno()).toHaveLength(2)
    expect(obter(k.id).emissao!.arquivo).toMatch(new RegExp(`Certificado-${cc(1)}-[0-9a-f]{12}\\.pdf$`))
  })

  it('cancelado antes de ser assinado: a cópia não diz que foi assinada; a verificação pública também não', async () => {
    const k = await c.calibracaoPronta()
    cert.naoAbre('O certificado digital não abre no servidor.', 2)
    expect((await emitir(k)).json().aviso).toBeTruthy()
    const { codigo } = obter(k.id).emissao!
    const verificar = async () => (await t.app.inject({ method: 'GET', url: `/api/verificar/${codigo}` })).json()
    // Emitido, mas aguardando a assinatura: a verificação pública não diz que está assinado
    expect(await verificar()).not.toHaveProperty('assinaturaDigital')
    const cancelar = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido para o cliente errado', versao: obter(k.id).versao },
    })
    expect(cancelar.statusCode, cancelar.body).toBe(200)
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(temAssinatura(r.rawPayload)).toBe(false)
    expect(await verificar()).not.toHaveProperty('assinaturaDigital')
    if (temPdftotext) {
      const texto = textoDoPdf(r.rawPayload).replace(/\s+/g, ' ')
      expect(texto).not.toContain('Documento assinado digitalmente')
      expect(texto).not.toContain('validar.iti.gov.br')
      expect(texto).toContain('Este certificado foi cancelado antes de ser assinado digitalmente')
    }
  })

  it('as partes da assinatura são gravadas uma vez: a segunda gravação devolve as primeiras', async () => {
    const k = await emitido()
    const partes = obter(k.id).emissao!.assinatura!
    const outras: PartesAssinaturaPdf = { ...partes, m: '2030-01-01T00:00:00.000Z' }
    expect(t.ctx.repo.registrarAssinatura(k.id, outras)).toEqual(partes)
    expect(obter(k.id).emissao!.assinatura).toEqual(partes)
  })
})

describe('arquivo sumido de um certificado assinado', () => {
  it.each([
    ['com o mesmo certificado', () => {}],
    ['com o certificado trocado', () => cert.instalar(a1Teste('ses'))],
    ['com o certificado vencido instalado', () => cert.instalar(a1Teste('vencido'))],
    ['com o certificado removido', () => cert.remover()],
    ['com o certificado que não abre', () => cert.naoAbre('O certificado digital não abre no servidor.')],
  ])('%s: volta idêntico, sem a chave', async (_, preparar) => {
    const k = await emitido()
    const entregue = readFileSync(caminhoDo(k))
    unlinkSync(caminhoDo(k))
    preparar()
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.rawPayload.equals(entregue)).toBe(true)
    expect(readFileSync(caminhoDo(k)).equals(entregue)).toBe(true)
  })

  it('o gerador mudou (o PDF refeito não é a base assinada): 409, nada é gravado e o hash continua', async () => {
    const k = await emitido()
    const hash = obter(k.id).emissao!.hashPdf
    unlinkSync(caminhoDo(k))
    gravarEmissao(k.id, (e) => ({ ...e, cliente: { ...e.cliente, nome: 'Outro nome' } }))
    const r = await baixar(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toContain('Volte essa pasta da cópia de segurança externa')
    expect(existsSync(join(t.pasta, 'certificados', `${ano}/Certificado-${cc(1)}.pdf`))).toBe(false)
    expect(obter(k.id).emissao!.hashPdf).toBe(hash)
  })

  it('sem a parte pública do certificado que assinou: 409, nada é gravado', async () => {
    const k = await emitido()
    unlinkSync(caminhoDo(k))
    gravarEmissao(k.id, (e) => ({ ...e, assinatura: { ...e.assinatura!, certificado: 'ab'.repeat(32) } }))
    expect((await baixar(k)).statusCode).toBe(409)
    // As partes gravadas e o arquivo não (a queda entre os dois): o texto do certificado aguardando a assinatura
    gravarEmissao(k.id, (e) => ({ ...e, hashPdf: '', arquivo: '' }))
    const r = await baixar(k)
    expect(r.statusCode).toBe(409)
    // Nada a resolver em Configurações: o sistema tenta de novo, e a saída é corrigir
    expect(r.json().erro).toBe(
      `O certificado ${cc(1)} ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. Motivo: a ` +
        'parte pública do certificado digital que assinou este PDF não está no banco. O sistema tenta de novo sozinho (ao ' +
        'abrir o PDF e na tentativa automática). Se continuar pendente, use “Corrigir certificado” na ficha dele.',
    )
    expect(pastaDoAno()).toEqual([])
  })
})

describe('correção e cancelamento de um certificado assinado', () => {
  it('a correção com o mesmo nº sai assinada com o certificado atual; a anterior, SUBSTITUÍDO sobre o arquivo dela', async () => {
    const original = await emitido()
    const entregue = readFileSync(caminhoDo(original))
    const rev = await c.criar(`/api/calibracoes/${original.id}/revisar`, { motivo: 'Correção do endereço' })
    const ses = a1Teste('ses')
    cert.instalar(ses)
    const r = await emitir(rev.calibracao)
    expect(r.statusCode, r.body).toBe(200)
    const nova = obter(rev.calibracao.id)
    expect(nova.numero).toBe(cc(1))
    expect(nova.emissao!.assinaturaDigital!.certificado).toBe(ses.dados.sha256)
    const pdfNovo = readFileSync(caminhoDo(nova))
    expect(nova.emissao!.arquivo).toBe(`${ano}/Certificado-${cc(1)}-versao-2.pdf`)
    expect(() => conferirPdfAssinado(pdfNovo, ses.certificadoDer)).not.toThrow()
    expect(nova.emissao!.hashPdf).toBe(sha(pdfNovo))
    // A anterior: o arquivo guardado dela, intacto no começo, com a marca por cima
    expect(obter(original.id).status).toBe('SUBSTITUIDO')
    const copia = await baixar(original)
    expect(copia.statusCode, copia.body).toBe(200)
    expect(copia.rawPayload.subarray(0, entregue.length).equals(entregue)).toBe(true)
    expect(copia.rawPayload.subarray(entregue.length).toString('latin1')).toContain(`(${textoPdf('SUBSTITUÍDO')}) Tj`)
    expect(readFileSync(caminhoDo(original)).equals(entregue)).toBe(true)
  })

  it('cancelado: a cópia é o assinado com a marca d’água (sem erro do carimbo); arquivo e hash como estão', async () => {
    const k = await emitido()
    const entregue = readFileSync(caminhoDo(k))
    const cancelar = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido para o cliente errado', versao: obter(k.id).versao },
    })
    expect(cancelar.statusCode, cancelar.body).toBe(200)
    const r = await baixar(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.rawPayload.subarray(0, entregue.length).equals(entregue)).toBe(true)
    // A marca desenhada no que foi acrescentado (o pdftotext não lê o texto inclinado)
    expect(r.rawPayload.subarray(entregue.length).toString('latin1')).toContain(`(${textoPdf('CANCELADO')}) Tj`)
    expect(readFileSync(caminhoDo(k)).equals(entregue)).toBe(true)
    expect(obter(k.id).emissao!.hashPdf).toBe(sha(entregue))
  })
})

describe('tentativa automática', () => {
  it('só os emitidos sem o PDF registrado; os sem assinatura digital também são gravados', async () => {
    cert.remover()
    const k = await c.calibracaoPronta()
    const parcial = join(t.pasta, 'certificados', String(ano), `Certificado-${cc(1)}.pdf.parcial`)
    mkdirSync(parcial, { recursive: true })
    expect((await emitir(k)).json().aviso).toBeTruthy()
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [], falhas: [cc(1)] })
    rmSync(parcial, { recursive: true })
    const assinado = await (async () => {
      cert.instalar(a1Teste('ecnpj-aes'))
      return emitido()
    })()
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [cc(1)], falhas: [] })
    expect(temAssinatura(readFileSync(caminhoDo(k)))).toBe(false)
    expect(obter(assinado.id).emissao!.hashPdf).toBeTruthy()
    expect(await tentarPdfsPendentes(t.ctx)).toEqual({ gravados: [], falhas: [] })
  })
})

describe('nenhum segredo do certificado sai da emissão', () => {
  it('o banco e o registro não guardam a chave nem a senha', async () => {
    const k = await emitido()
    const a1 = a1Teste('ecnpj-aes')
    const pasta = mkdtempSync(join(tmpdir(), 'bcf-assinada-'))
    try {
      const copia = join(pasta, 'copia.db')
      t.ctx.db.exec(`VACUUM INTO '${copia.replaceAll("'", "''")}'`)
      const banco = readFileSync(copia)
      const chave = a1.chave.export({ format: 'der', type: 'pkcs8' })
      expect(banco.includes(chave.subarray(0, 64))).toBe(false)
      expect(banco.includes(chave.subarray(-64))).toBe(false)
      expect(banco.includes(Buffer.from('Senha@123'))).toBe(false)
      writeFileSync(join(pasta, 'k.json'), JSON.stringify(obter(k.id)))
      expect(readFileSync(join(pasta, 'k.json'), 'utf8')).not.toContain(chave.toString('base64').slice(0, 40))
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  })
})

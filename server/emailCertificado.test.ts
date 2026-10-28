// E-mail do certificado: vão o PDF e os certificados dos padrões usados (o arquivo que o cadastro tem para o
// mesmo certificado — anexado ou corrigido depois da emissão —, senão o congelado na emissão; nunca o de outro
// nº), com a escolha da tela, os limites (20 anexos, 18 MB) e os nomes no histórico. O SMTP é o transporte
// JSON do nodemailer.

import { createHash } from 'node:crypto'
import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LIMITE_EMAIL_BYTES } from '#shared/arquivos.ts'
import type { AnexoEmailDisponivel, Calibracao, CertificadoDoPadrao, Padrao } from '#shared/tipos.ts'
import { ARQUIVOS_TESTE, cenarioCalibracao, criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { conferirAnexos, gravarConfigEmail } from './email.ts'

interface MensagemJson {
  to: Array<{ address: string }>
  subject: string
  attachments: Array<{ filename: string; contentType: string; content: string; encoding: string }>
}

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>
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
  c = await cenarioCalibracao(t)
})
afterEach(async () => {
  await t.fechar()
})

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

async function padrao(identificacao: string, extra: Record<string, unknown>): Promise<Padrao> {
  return (await c.criar('/api/padroes', { ...c.padraoPesos(identificacao), ...extra })).padrao
}

async function atualizar(p: Padrao, extra: Record<string, unknown>): Promise<Padrao> {
  const r = await t.chamar('PUT', `/api/padroes/${p.id}`, {
    cookie: t.cookieAdmin,
    payload: { ...p, ...extra, versao: p.versao },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().padrao
}

const anexosDe = async (k: Calibracao, cookie = t.cookieAdmin) => {
  const r = await t.chamar('GET', `/api/calibracoes/${k.id}/anexos`, { cookie })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as {
    anexos: AnexoEmailDisponivel[]
    semArquivo: CertificadoDoPadrao[]
    limites: { anexos: number; bytes: number }
  }
}

const enviar = (k: Calibracao, extra: Record<string, unknown> = {}, cookie = t.cookieAdmin) =>
  t.chamar('POST', `/api/calibracoes/${k.id}/email`, {
    cookie,
    payload: { para: 'qualidade@mercado.com.br', assunto: `Certificado ${k.numero}`, texto: 'Segue.', ...extra },
  })

describe('anexos do e-mail do certificado', () => {
  it('vão o PDF e os certificados dos padrões; avisa os padrões sem arquivo; o histórico guarda os nomes', async () => {
    const pdfJp = ARQUIVOS_TESTE.pdf('certificado do jogo JP-01')
    const fotoTh = ARQUIVOS_TESTE.jpg('certificado do termo-higrômetro')
    await atualizar(c.pesos, { certificadoArquivo: await c.enviarArquivo(pdfJp, 'scan001.pdf') })
    const th = await padrao('TH-01', {
      tipo: 'TERMOHIGROMETRO',
      descricao: 'Termo-higrômetro digital',
      certificado: 'T-4410/2026',
      certificadoArquivo: await c.enviarArquivo(fotoTh, 'foto.jpg'),
    })
    const br = await padrao('BR-01', { tipo: 'BAROMETRO', descricao: 'Barômetro digital', certificado: 'P-0773/2025' })
    const k = await c.emitido([th.id, br.id])

    const { anexos, semArquivo, limites } = await anexosDe(k, t.cookieComum)
    expect(limites).toEqual({ anexos: 20, bytes: LIMITE_EMAIL_BYTES })
    expect(anexos.map((a) => [a.id, a.nome, a.tipo, a.obrigatorio, a.padroes])).toEqual([
      ['certificado', `Certificado-${k.numero}.pdf`, 'application/pdf', true, []],
      [`arquivo:${sha(pdfJp)}`, 'Certificado-padrao-JP-01_LAB-0456-2026.pdf', 'application/pdf', false, ['JP-01']],
      [`arquivo:${sha(fotoTh)}`, 'Certificado-padrao-TH-01_T-4410-2026.jpg', 'image/jpeg', false, ['TH-01']],
    ])
    expect(anexos[1].tamanho).toBe(pdfJp.length)
    expect(semArquivo).toEqual([
      expect.objectContaining({ identificacao: 'BR-01', certificado: 'P-0773/2025', arquivo: null, origem: '' }),
    ])

    // Sem a escolha da tela, vão todos
    const r = await enviar(k, {}, t.cookieComum)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().anexos).toEqual(anexos.map((a) => a.nome))
    const [m] = enviados
    expect(m.to).toEqual([expect.objectContaining({ address: 'qualidade@mercado.com.br' })])
    expect(m.attachments.map((a) => [a.filename, a.contentType])).toEqual(anexos.map((a) => [a.nome, a.tipo]))
    expect(Buffer.from(m.attachments[0].content, 'base64').subarray(0, 5).toString()).toBe('%PDF-')
    expect(Buffer.from(m.attachments[1].content, 'base64').equals(pdfJp)).toBe(true)
    expect(Buffer.from(m.attachments[2].content, 'base64').equals(fotoTh)).toBe(true)

    // O histórico guarda os nomes dos anexos; o registro de atividades, quantos
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.envios[0]).toMatchObject({ para: 'qualidade@mercado.com.br', anexos: anexos.map((a) => a.nome) })
    expect(
      t.ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'CERTIFICADO_ENVIADO'").get() as { detalhe: string },
    ).toEqual({ detalhe: 'POST /api/calibracoes/:id/email | 3 anexos' })
    // A ficha do certificado lista os certificados dos padrões
    expect(
      detalhe.certificadosPadroes.map((x: CertificadoDoPadrao) => [x.identificacao, x.arquivo?.sha256 ?? null, x.origem]),
    ).toEqual([
      ['JP-01', sha(pdfJp), 'EMISSAO'],
      ['TH-01', sha(fotoTh), 'EMISSAO'],
      ['BR-01', null, ''],
    ])
  })

  it('a tela escolhe: os desmarcados não vão; o PDF do certificado vai sempre', async () => {
    const pdfJp = ARQUIVOS_TESTE.pdf('jp')
    await atualizar(c.pesos, { certificadoArquivo: await c.enviarArquivo(pdfJp, 'jp.pdf') })
    const k = await c.emitido()
    const r = await enviar(k, { anexos: [] })
    expect(r.statusCode, r.body).toBe(200)
    expect(enviados[0].attachments.map((a) => a.filename)).toEqual([`Certificado-${k.numero}.pdf`])
    await enviar(k, { anexos: [`arquivo:${sha(pdfJp)}`, 'arquivo:inexistente', 42] })
    expect(enviados[1].attachments.map((a) => a.filename)).toEqual([
      `Certificado-${k.numero}.pdf`,
      'Certificado-padrao-JP-01_LAB-0456-2026.pdf',
    ])
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.envios.map((e: { anexos: string[] }) => e.anexos.length)).toEqual([2, 1])
  })

  it('dois padrões com o mesmo certificado: o arquivo vai uma vez só', async () => {
    const pdf = ARQUIVOS_TESTE.pdf('certificado de dois jogos')
    const ref = await c.enviarArquivo(pdf, 'certificado.pdf')
    await atualizar(c.pesos, { certificadoArquivo: ref })
    const jp2 = await padrao('JP-02', { certificadoArquivo: ref })
    const k = await c.emitido([jp2.id])
    const { anexos, semArquivo } = await anexosDe(k)
    expect(anexos.map((a) => [a.nome, a.padroes])).toEqual([
      [`Certificado-${k.numero}.pdf`, []],
      ['Certificado-padrao-JP-01-JP-02_LAB-0456-2026.pdf', ['JP-01', 'JP-02']],
    ])
    expect(semArquivo).toEqual([])
  })

  it('o arquivo fica congelado na emissão: o padrão calibrado de novo (outro nº e outro arquivo) não muda o que vai', async () => {
    const antigo = ARQUIVOS_TESTE.pdf('certificado 2026')
    const p = await atualizar(c.pesos, { certificadoArquivo: await c.enviarArquivo(antigo, 'antigo.pdf') })
    const k = await c.emitido()
    expect(k.emissao?.padroes[0]).toMatchObject({ certificado: 'LAB-0456/2026', certificadoArquivo: { sha256: sha(antigo) } })
    // O padrão foi calibrado de novo: certificado e arquivo novos
    const novo = ARQUIVOS_TESTE.pdf('certificado 2027')
    await atualizar(p, { certificado: 'LAB-0999/2027', certificadoArquivo: await c.enviarArquivo(novo, 'novo.pdf') })
    const { anexos } = await anexosDe(k)
    expect(anexos.map((a) => a.id)).toEqual(['certificado', `arquivo:${sha(antigo)}`])
    await enviar(k)
    expect(Buffer.from(enviados[0].attachments[1].content, 'base64').equals(antigo)).toBe(true)
    // Um certificado emitido agora leva o novo
    const outro = await c.emitido()
    expect((await anexosDe(outro)).anexos.map((a) => a.id)).toEqual(['certificado', `arquivo:${sha(novo)}`])
  })

  it('arquivo errado trocado no cadastro com o mesmo nº: os já emitidos passam a levar o certo, mesmo depois de nova calibração', async () => {
    const errado = ARQUIVOS_TESTE.pdf('arquivo anexado errado')
    let p = await atualizar(c.pesos, { certificadoArquivo: await c.enviarArquivo(errado, 'errado.pdf') })
    const k = await c.emitido()
    expect(k.emissao?.padroes[0].certificadoArquivo?.sha256).toBe(sha(errado))
    // A correção: o arquivo certo do mesmo certificado (o nº não muda)
    const certo = ARQUIVOS_TESTE.pdf('o arquivo certo do LAB-0456/2026')
    p = await atualizar(p, { certificadoArquivo: await c.enviarArquivo(certo, 'certo.pdf') })
    const { anexos } = await anexosDe(k)
    expect(anexos.map((a) => [a.id, a.nome])).toEqual([
      ['certificado', `Certificado-${k.numero}.pdf`],
      [`arquivo:${sha(certo)}`, 'Certificado-padrao-JP-01_LAB-0456-2026.pdf'],
    ])
    expect((await enviar(k)).statusCode).toBe(200)
    expect(Buffer.from(enviados[0].attachments[1].content, 'base64').equals(certo)).toBe(true)
    const ficha = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(ficha.certificadosPadroes[0]).toMatchObject({ arquivo: { sha256: sha(certo) }, origem: 'CADASTRO' })

    // O padrão é calibrado de novo: o cadastro guarda o arquivo (certo) do certificado anterior, e o emitido
    // com o nº antigo continua levando ele — nem o errado congelado, nem o do certificado novo
    const novo = ARQUIVOS_TESTE.pdf('certificado 2027')
    p = await atualizar(p, { certificado: 'LAB-0999/2027', certificadoArquivo: await c.enviarArquivo(novo, 'novo.pdf') })
    expect(p.certificadosAnteriores).toEqual([
      { certificado: 'LAB-0456/2026', arquivo: expect.objectContaining({ sha256: sha(certo), nome: 'certo.pdf' }) },
    ])
    expect((await anexosDe(k)).anexos.map((a) => a.id)).toEqual(['certificado', `arquivo:${sha(certo)}`])
    // A emissão congela só o arquivo do certificado vigente, não os anteriores
    const outro = await c.emitido()
    expect(outro.emissao?.padroes[0]).not.toHaveProperty('certificadosAnteriores')
    expect((await anexosDe(outro)).anexos.map((a) => a.id)).toEqual(['certificado', `arquivo:${sha(novo)}`])

    // Cadastro sem arquivo para o nº: vale o congelado na emissão
    await atualizar(p, { certificadoArquivo: null })
    expect((await anexosDe(outro)).anexos.map((a) => a.id)).toEqual(['certificado', `arquivo:${sha(novo)}`])
  })

  it('outro nº de certificado com o arquivo do anterior: recusado, salvo a confirmação de que só corrigiu o nº', async () => {
    const pdf2026 = ARQUIVOS_TESTE.pdf('certificado LAB-0456/2026')
    let p = await atualizar(c.pesos, { certificadoArquivo: await c.enviarArquivo(pdf2026, '2026.pdf') })
    const put = (extra: Record<string, unknown>) =>
      t.chamar('PUT', `/api/padroes/${p.id}`, { cookie: t.cookieAdmin, payload: { ...p, ...extra, versao: p.versao } })
    // O mesmo arquivo: mantido, sem o campo (tela antiga) ou enviado de novo
    for (const extra of [
      { certificado: 'LAB-0999/2027' },
      { certificado: 'LAB-0999/2027', certificadoArquivo: undefined },
      { certificado: 'LAB-0999/2027', certificadoArquivo: await c.enviarArquivo(pdf2026, 'outra copia.pdf') },
      { certificado: 'LAB-0999/2027', arquivoConfirmado: 'sim' },
    ]) {
      const r = await put(extra)
      expect(r.statusCode, JSON.stringify(extra)).toBe(400)
      expect(r.json()).toEqual({
        erro: 'O nº do certificado mudou, mas o arquivo anexado é o do certificado anterior. Anexe o arquivo do certificado novo ou tire o arquivo antigo.',
        codigo: 'ARQUIVO_DO_CERTIFICADO_ANTERIOR',
      })
    }
    expect(t.ctx.repo.obterPadrao(p.id)).toMatchObject({ certificado: 'LAB-0456/2026', versao: p.versao })

    // Só espaços e maiúsculas: é o mesmo nº
    p = await atualizar(p, { certificado: ' lab-0456/2026' })
    expect(p.certificadosAnteriores).toBeUndefined()
    // Correção do nº confirmada na tela: passa, e o arquivo fica também guardado com o nº de antes
    const r = await put({ certificado: 'LAB-0465/2026', arquivoConfirmado: true })
    expect(r.statusCode, r.body).toBe(200)
    p = r.json().padrao
    expect(p).toMatchObject({ certificado: 'LAB-0465/2026', certificadoArquivo: { sha256: sha(pdf2026) } })
    expect(p.certificadosAnteriores?.map((h) => [h.certificado, h.arquivo.sha256])).toEqual([['lab-0456/2026', sha(pdf2026)]])
    // Tirando o arquivo antigo, ou com o arquivo novo, passa sem confirmação
    p = await atualizar(p, { certificado: 'LAB-0999/2027', certificadoArquivo: null })
    expect(p.certificadoArquivo).toBeNull()
    const pdf2028 = ARQUIVOS_TESTE.pdf('certificado 2028')
    p = await atualizar(p, { certificado: 'LAB-1200/2028', certificadoArquivo: await c.enviarArquivo(pdf2028, '2028.pdf') })
    // Preencher o nº que estava vazio (arquivo anexado antes do nº) não é outro certificado
    const th = await padrao('TH-01', {
      tipo: 'TERMOHIGROMETRO',
      certificado: '',
      certificadoArquivo: await c.enviarArquivo(ARQUIVOS_TESTE.pdf('th'), 'th.pdf'),
    })
    expect((await atualizar(th, { certificado: 'T-4410/2026' })).certificado).toBe('T-4410/2026')
  })

  it('emitido sem o arquivo: vai o anexado depois ao cadastro, só se for do mesmo certificado (nº congelado)', async () => {
    const k = await c.emitido()
    expect(k.emissao?.padroes[0].certificadoArquivo).toBeNull()
    expect((await anexosDe(k)).semArquivo.map((x) => x.identificacao)).toEqual(['JP-01'])

    // Anexado depois, com o mesmo nº de certificado (escrito com outro espaçamento/caixa): vai
    const pdf = ARQUIVOS_TESTE.pdf('o mesmo certificado')
    const p = await atualizar(c.pesos, { certificado: 'lab-0456/2026 ', certificadoArquivo: await c.enviarArquivo(pdf, 'a.pdf') })
    const depois = await anexosDe(k)
    expect(depois.anexos.map((a) => a.id)).toEqual(['certificado', `arquivo:${sha(pdf)}`])
    expect(depois.semArquivo).toEqual([])
    const ficha = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(ficha.certificadosPadroes[0]).toMatchObject({
      identificacao: 'JP-01',
      origem: 'CADASTRO',
      certificado: 'LAB-0456/2026',
    })

    // O padrão foi calibrado de novo (outro nº): o emitido continua com o arquivo do certificado dele, que o
    // cadastro guardou ao mudar o nº; nunca o do certificado novo
    await atualizar(p, {
      certificado: 'LAB-0999/2027',
      certificadoArquivo: await c.enviarArquivo(ARQUIVOS_TESTE.pdf('novo'), 'b.pdf'),
    })
    expect((await anexosDe(k)).anexos.map((a) => a.id)).toEqual(['certificado', `arquivo:${sha(pdf)}`])
  })

  it('emitido sem o arquivo e o padrão calibrado de novo sem nunca ter o arquivo de antes: o arquivo novo não vai', async () => {
    const k = await c.emitido()
    await atualizar(c.pesos, {
      certificado: 'LAB-0999/2027',
      certificadoArquivo: await c.enviarArquivo(ARQUIVOS_TESTE.pdf('novo'), 'b.pdf'),
    })
    const novo = await anexosDe(k)
    expect(novo.anexos.map((a) => a.id)).toEqual(['certificado'])
    expect(novo.semArquivo.map((x) => x.identificacao)).toEqual(['JP-01'])
  })

  it('certificado emitido antes desta versão (sem o campo na cópia congelada): a mesma regra do nº', async () => {
    const k = await c.emitido()
    // A cópia congelada de antes não tinha o campo
    const linha = t.ctx.db.prepare('SELECT dados FROM calibracoes WHERE id = ?').get(k.id) as { dados: string }
    const dados = JSON.parse(linha.dados) as Calibracao
    delete dados.emissao!.padroes[0].certificadoArquivo
    delete dados.emissao!.pop
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(dados), k.id)
    const pdf = ARQUIVOS_TESTE.pdf('anexado depois')
    await atualizar(c.pesos, { certificadoArquivo: await c.enviarArquivo(pdf, 'a.pdf') })
    expect((await anexosDe(k)).anexos.map((a) => a.id)).toEqual(['certificado', `arquivo:${sha(pdf)}`])
    const ficha = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(ficha.pop).toBeNull()
  })

  it('acima de 18 MB não envia, com a mensagem; desmarcando, envia', async () => {
    const grande = (n: number) => Buffer.concat([ARQUIVOS_TESTE.pdf(`grande ${n}`), Buffer.alloc(7 * 1024 * 1024)])
    await atualizar(c.pesos, { certificadoArquivo: await c.enviarArquivo(grande(1), '1.pdf') })
    const ids = [
      (await padrao('JP-02', { certificadoArquivo: await c.enviarArquivo(grande(2), '2.pdf') })).id,
      (await padrao('JP-03', { certificadoArquivo: await c.enviarArquivo(grande(3), '3.pdf') })).id,
    ]
    const k = await c.emitido(ids)
    const { anexos } = await anexosDe(k)
    expect(anexos).toHaveLength(4)
    const r = await enviar(k)
    expect(r.statusCode).toBe(413)
    expect(r.json().erro).toMatch(/^Os anexos somam 21(,\d)? MB; o limite é 18 MB por e-mail/)
    expect(enviados).toEqual([])
    const ok = await enviar(k, { anexos: anexos.slice(0, 3).map((a) => a.id) })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(enviados[0].attachments).toHaveLength(3)
    expect(
      (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin }))
        .json()
        .envios.map((e: { anexos: string[] }) => e.anexos.length),
    ).toEqual([3])
  })

  it('no máximo 20 anexos; só para o certificado emitido; sem sessão, 401', async () => {
    expect(() => conferirAnexos(Array.from({ length: 21 }, () => ({ tamanho: 10 })))).toThrow(/^São 21 anexos; o limite é 20/)
    expect(() => conferirAnexos(Array.from({ length: 20 }, () => ({ tamanho: 10 })))).not.toThrow()
    const rascunho = await c.calibracaoPronta()
    expect((await t.chamar('GET', `/api/calibracoes/${rascunho.id}/anexos`, { cookie: t.cookieAdmin })).statusCode).toBe(409)
    expect((await enviar(rascunho)).statusCode).toBe(409)
    const k = await c.emitido()
    expect((await t.chamar('GET', `/api/calibracoes/${k.id}/anexos`)).statusCode).toBe(401)
  })
})

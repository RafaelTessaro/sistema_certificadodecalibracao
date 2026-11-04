// Envio de e-mail pelo servidor SMTP de verdade (o transporte do nodemailer, contra um SMTP falso em 127.0.0.1):
// - o servidor que recusa só parte dos destinatários (550 no RCPT TO): a resposta, a tela e o histórico ficam só com
//   quem recebeu, e os recusados vêm à parte (certificado, lembrete e e-mail de teste);
// - a mensagem maior que o limite do servidor (552 5.3.4, ou o SIZE anunciado no EHLO): a mensagem diz que é pelo
//   tamanho e o que fazer (desmarcar certificados dos padrões), e com o limite anunciado nada é transmitido.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Calibracao, Envio } from '#shared/tipos.ts'
import { smtpFalso } from './__fixtures__/smtpFalso.ts'
import { ARQUIVOS_TESTE, cenarioCalibracao, criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { destinatariosDoEnvio, gravarConfigEmail, mensagemErroEmail, MSG_EMAIL_GRANDE_DEMAIS } from './email.ts'

const MSG_ENDERECO = 'O servidor de e-mail recusou o endereço de destino ou de remetente.'

describe('mensagemErroEmail: recusa pelo tamanho', () => {
  it('552 no fim do DATA, o limite do EHLO conferido pelo nodemailer e o SIZE= recusado no MAIL FROM', () => {
    expect(
      mensagemErroEmail({
        code: 'EMESSAGE',
        responseCode: 552,
        command: 'DATA',
        response: '552 5.3.4 Message size exceeds fixed maximum message size',
      }),
    ).toBe(MSG_EMAIL_GRANDE_DEMAIS)
    expect(
      mensagemErroEmail({ code: 'EMESSAGE', command: 'MAIL FROM', message: 'Message size larger than allowed 10000000' }),
    ).toBe(MSG_EMAIL_GRANDE_DEMAIS)
    expect(
      mensagemErroEmail({
        code: 'EENVELOPE',
        responseCode: 552,
        command: 'MAIL FROM',
        response: '552 5.3.4 Message size exceeds fixed limit',
      }),
    ).toBe(MSG_EMAIL_GRANDE_DEMAIS)
    expect(MSG_EMAIL_GRANDE_DEMAIS).toContain('Desmarque certificados dos padrões')
  })

  it('o endereço recusado continua com a mensagem do endereço (também o 552 da caixa cheia, no RCPT TO)', () => {
    expect(
      mensagemErroEmail({ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO', response: '550 5.1.1 User unknown' }),
    ).toBe(MSG_ENDERECO)
    expect(
      mensagemErroEmail({
        code: 'EENVELOPE',
        responseCode: 552,
        command: 'RCPT TO',
        response: '552 5.2.2 Mailbox size limit exceeded',
      }),
    ).toBe(MSG_ENDERECO)
    // Outro erro da mensagem, sem relação com o tamanho: a mensagem genérica
    expect(mensagemErroEmail({ code: 'EMESSAGE', responseCode: 554, response: '554 5.7.1 Message rejected as spam' })).toContain(
      'Não foi possível enviar o e-mail (EMESSAGE)',
    )
  })
})

describe('destinatariosDoEnvio', () => {
  it('separa os aceitos dos recusados (com o código da resposta), sem diferenciar maiúsculas', () => {
    const erro = Object.assign(new Error('Recipient command failed'), {
      recipient: 'qualidade@mercado.com.br',
      responseCode: 550,
    })
    expect(
      destinatariosDoEnvio(['Qualidade@Mercado.com.br', 'compras@mercado.com.br'], {
        accepted: ['compras@mercado.com.br'],
        rejected: ['qualidade@mercado.com.br'],
        rejectedErrors: [erro],
      }),
    ).toEqual({ para: ['compras@mercado.com.br'], recusados: [{ endereco: 'Qualidade@Mercado.com.br', codigo: 550 }] })
  })

  it('sem a lista dos recusados (outros transportes): todos aceitos; o domínio com acento confere pelo punycode', () => {
    expect(destinatariosDoEnvio(['a@b.com.br'], {})).toEqual({ para: ['a@b.com.br'], recusados: [] })
    expect(
      destinatariosDoEnvio(['qualidade@balanças.com', 'b@c.com'], { rejected: [{ address: 'qualidade@xn--balanas-yxa.com' }] }),
    ).toEqual({ para: ['b@c.com'], recusados: [{ endereco: 'qualidade@balanças.com', codigo: null }] })
  })
})

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>
let smtp: Awaited<ReturnType<typeof smtpFalso>>

async function preparar(o: Parameters<typeof smtpFalso>[0]) {
  smtp = await smtpFalso(o)
  gravarConfigEmail(t.ctx, {
    servidor: '127.0.0.1',
    porta: smtp.porta,
    seguranca: 'NENHUMA',
    usuario: 'certificados@balancass.com',
    senha: 'senha-de-app',
    remetenteNome: 'Balanças.com',
    remetenteEmail: 'certificados@balancass.com',
  })
}

beforeEach(async () => {
  t = await criarAppComLogin()
  c = await cenarioCalibracao(t)
})
afterEach(async () => {
  await t.fechar()
  await smtp?.fechar()
})

const enviarCertificado = (k: Calibracao, para: string, extra: Record<string, unknown> = {}) =>
  t.chamar('POST', `/api/calibracoes/${k.id}/email`, {
    cookie: t.cookieAdmin,
    payload: { para, assunto: `Certificado ${k.numero}`, texto: 'Segue.', ...extra },
  })
const enviosDaCalibracao = async (k: Calibracao): Promise<Envio[]> =>
  (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().envios
const enviosDoCliente = async (): Promise<Envio[]> =>
  (await t.chamar('GET', `/api/clientes/${c.cliente.id}`, { cookie: t.cookieAdmin })).json().envios

describe('destinatário recusado pelo servidor SMTP', () => {
  it('certificado: responde e registra só quem recebeu; o recusado vem à parte', async () => {
    await preparar({ recusar: ['qualidade@mercado.com.br'] })
    const k = await c.emitido()
    const r = await enviarCertificado(k, 'qualidade@mercado.com.br, compras@mercado.com.br')
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      ok: true,
      para: ['compras@mercado.com.br'],
      recusados: [{ endereco: 'qualidade@mercado.com.br', codigo: 550 }],
    })
    // O texto da resposta do servidor fica só no registro do servidor
    expect(r.body).not.toContain('User unknown')
    expect(smtp.recebidas.map((m) => m.para)).toEqual([['compras@mercado.com.br']])
    const [envio] = await enviosDaCalibracao(k)
    expect(envio).toMatchObject({ para: 'compras@mercado.com.br', recusados: ['qualidade@mercado.com.br'] })
  }, 30_000)

  it('todos aceitos: sem recusados', async () => {
    await preparar({})
    const k = await c.emitido()
    const r = await enviarCertificado(k, 'qualidade@mercado.com.br, compras@mercado.com.br')
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ para: ['qualidade@mercado.com.br', 'compras@mercado.com.br'], recusados: [] })
    const [envio] = await enviosDaCalibracao(k)
    expect(envio.para).toBe('qualidade@mercado.com.br, compras@mercado.com.br')
    expect(envio.recusados).toEqual([])
  }, 30_000)

  it('todos recusados: 502 com a mensagem do endereço, e nada no histórico', async () => {
    await preparar({ recusar: ['qualidade@mercado.com.br', 'compras@mercado.com.br'] })
    const k = await c.emitido()
    const r = await enviarCertificado(k, 'qualidade@mercado.com.br, compras@mercado.com.br')
    expect(r.statusCode, r.body).toBe(502)
    expect(r.json().erro).toBe(MSG_ENDERECO)
    expect(await enviosDaCalibracao(k)).toEqual([])
  }, 30_000)

  it('lembrete: o mesmo (o histórico do cliente só com quem recebeu)', async () => {
    await preparar({ recusar: ['qualidade@mercado.com.br'] })
    const r = await t.chamar('POST', '/api/lembretes', {
      cookie: t.cookieAdmin,
      payload: {
        clienteId: c.cliente.id,
        balancas: [c.balanca.id],
        para: 'qualidade@mercado.com.br; compras@mercado.com.br',
        assunto: 'Calibração',
        texto: 'Está na hora.',
      },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      para: ['compras@mercado.com.br'],
      recusados: [{ endereco: 'qualidade@mercado.com.br', codigo: 550 }],
    })
    const [envio] = (await enviosDoCliente()).filter((e) => e.tipo === 'LEMBRETE')
    expect(envio).toMatchObject({ para: 'compras@mercado.com.br', recusados: ['qualidade@mercado.com.br'] })
  }, 30_000)

  it('e-mail de teste: devolve os recusados', async () => {
    await preparar({ recusar: ['errado@mercado.com.br'] })
    const r = await t.chamar('POST', '/api/email/teste', {
      cookie: t.cookieAdmin,
      payload: { para: 'errado@mercado.com.br, certo@mercado.com.br' },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      para: ['certo@mercado.com.br'],
      recusados: [{ endereco: 'errado@mercado.com.br', codigo: 550 }],
    })
  }, 30_000)
})

describe('mensagem maior que o limite do servidor SMTP', () => {
  /** Certificado com o do jogo JP-01 anexado (uns 200 KB, além do PDF do certificado). */
  async function comCertificadoGrande() {
    const scan = ARQUIVOS_TESTE.pdf('x'.repeat(200_000))
    const p = t.ctx.repo.obterPadrao(c.pesos.id)!
    const r = await t.chamar('PUT', `/api/padroes/${p.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...p, certificadoArquivo: await c.enviarArquivo(scan, 'scan-jp01.pdf'), versao: p.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    return c.emitido()
  }

  it('recusada no fim do DATA (552 5.3.4): a mensagem diz que é pelo tamanho; nada no histórico', async () => {
    await preparar({ limite: 150_000 })
    const k = await comCertificadoGrande()
    const r = await enviarCertificado(k, 'qualidade@mercado.com.br')
    expect(r.statusCode, r.body).toBe(502)
    expect(r.json().erro).toBe(MSG_EMAIL_GRANDE_DEMAIS)
    expect(await enviosDaCalibracao(k)).toEqual([])
  }, 30_000)

  it('com o limite anunciado no EHLO: recusa antes de transmitir; só com o certificado, cabe e vai', async () => {
    await preparar({ limite: 150_000, anunciarLimite: true })
    const k = await comCertificadoGrande()
    const r = await enviarCertificado(k, 'qualidade@mercado.com.br')
    expect(r.statusCode, r.body).toBe(502)
    expect(r.json().erro).toBe(MSG_EMAIL_GRANDE_DEMAIS)
    expect(smtp.bytesDados()).toBe(0)
    // Desmarcado o certificado do padrão (só o PDF do certificado, que vai sempre): dentro do limite
    const so = await enviarCertificado(k, 'qualidade@mercado.com.br', { anexos: [] })
    expect(so.statusCode, so.body).toBe(200)
    expect(so.json().anexos).toHaveLength(1)
    expect(smtp.recebidas).toHaveLength(1)
  }, 30_000)
})

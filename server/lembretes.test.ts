// Lembrete de calibração (Vencimentos): o envio guarda as balanças que foram no e-mail, e cada balança só aparece
// como avisada pelo lembrete que a incluiu depois da emissão do último certificado dela (com a hora, não só o dia).
// O último lembrete ao cliente (o cabeçalho do grupo e "Clientes avisados no mês") continua por cliente.

import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, CLIENTE_VAZIO } from '#shared/dominio.ts'
import type { Balanca, Cliente, Envio, Vencimento } from '#shared/tipos.ts'
import { cenarioCalibracao, criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { gravarConfigEmail } from './email.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>
let enviados: number

beforeEach(async () => {
  enviados = 0
  t = await criarAppComLogin({
    transporteEmail: () => {
      const transporte = nodemailer.createTransport({ jsonTransport: true })
      const enviar = transporte.sendMail.bind(transporte)
      transporte.sendMail = (async (m: Parameters<typeof enviar>[0]) => {
        enviados++
        return enviar(m)
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

const novaBalanca = async (numeroSerie: string, cliente: Pick<Cliente, 'id'> = c.cliente): Promise<Balanca> =>
  (
    await c.criar('/api/balancas', {
      ...BALANCA_VAZIA,
      clienteId: cliente.id,
      fabricante: 'Filizola',
      modelo: 'BP-15',
      numeroSerie,
      faixas: [{ max: 30, e: 0.01, d: 0.01 }],
    })
  ).balanca

const lembrete = (balancas: unknown, clienteId = c.cliente.id) =>
  t.chamar('POST', '/api/lembretes', {
    cookie: t.cookieAdmin,
    payload: { clienteId, balancas, para: 'qualidade@mercado.com.br', assunto: 'Calibração', texto: 'Está na hora.' },
  })

async function vencimentos(): Promise<Map<string, Vencimento>> {
  const r = await t.chamar('GET', '/api/vencimentos?dias=todos', { cookie: t.cookieAdmin })
  expect(r.statusCode, r.body).toBe(200)
  return new Map((r.json().vencimentos as Vencimento[]).map((v) => [v.numeroSerie, v]))
}

const lembretesDoCliente = async (clienteId = c.cliente.id): Promise<Envio[]> =>
  ((await t.chamar('GET', `/api/clientes/${clienteId}`, { cookie: t.cookieAdmin })).json().envios as Envio[]).filter(
    (e) => e.tipo === 'LEMBRETE',
  )

describe('lembrete de calibração por balança', () => {
  it('o lembrete só da A não marca a B do mesmo cliente; o último lembrete ao cliente vale para as duas', async () => {
    const fz50 = await novaBalanca('FZ-50')
    await c.emitido()
    await c.emitido([], fz50)
    const r = await lembrete([c.balanca.id])
    expect(r.statusCode, r.body).toBe(200)
    expect(enviados).toBe(1)
    const [envio] = await lembretesDoCliente()
    expect(envio.balancas).toEqual([c.balanca.id])

    const v = await vencimentos()
    expect(v.get('TL-2231')!.lembreteEm).toBe(envio.em)
    expect(v.get('FZ-50')!.lembreteEm).toBe('')
    expect(v.get('TL-2231')!.ultimoLembreteCliente).toBe(envio.em)
    expect(v.get('FZ-50')!.ultimoLembreteCliente).toBe(envio.em)
  })

  it('a balança emitida no mesmo dia, depois do lembrete, aparece sem lembrete', async () => {
    const fz88 = await novaBalanca('FZ-88')
    await c.emitido()
    await c.emitido([], fz88)
    expect((await lembrete([c.balanca.id, fz88.id])).statusCode).toBe(200)
    const [envio] = await lembretesDoCliente()
    // Calibrada de novo e emitida depois do envio, no mesmo dia: o lembrete era do certificado anterior (a data da
    // emissão, sem a hora, não serve para comparar: o envio é do mesmo dia)
    const novo = await c.emitido([], fz88)
    expect(novo.emissao!.emitidoEm > envio.em).toBe(true)

    const v = await vencimentos()
    expect(v.get('FZ-88')!.ultimoCertificado).toBe(novo.numero)
    expect(v.get('FZ-88')!.lembreteEm).toBe('')
    expect(v.get('TL-2231')!.lembreteEm).toBe(envio.em)
  })

  it('balança de outro cliente, repetida ou que não existe no pedido: fica de fora do registro', async () => {
    const outro: Cliente = (
      await c.criar('/api/clientes', {
        ...CLIENTE_VAZIO,
        tipo: 'PJ',
        nome: 'Padaria Nova',
        documento: '11.222.333/0001-81',
        logradouro: 'Rua 2',
        numero: '20',
        cidade: 'Limeira',
        uf: 'SP',
      })
    ).cliente
    const daPadaria = await novaBalanca('PN-01', outro)
    await c.emitido()
    await c.emitido([], daPadaria)
    const r = await lembrete([c.balanca.id, daPadaria.id, c.balanca.id, 'nao-existe', 42])
    expect(r.statusCode, r.body).toBe(200)
    const [envio] = await lembretesDoCliente()
    expect(envio.balancas).toEqual([c.balanca.id])
    const v = await vencimentos()
    expect(v.get('PN-01')!.lembreteEm).toBe('')
    expect(v.get('PN-01')!.ultimoLembreteCliente).toBe('')
    expect(v.get('TL-2231')!.lembreteEm).toBe(envio.em)
    // Sem a lista (ou com ela vazia), o lembrete é enviado e não marca nenhuma balança
    for (const balancas of [undefined, []]) expect((await lembrete(balancas)).statusCode).toBe(200)
    expect((await lembretesDoCliente())[0].balancas).toEqual([])
  })

  it('lembrete de antes desta versão (sem a lista): não marca nenhuma balança, mas conta como lembrete ao cliente', async () => {
    await c.emitido()
    const em = new Date(Date.now() + 60_000).toISOString()
    t.ctx.db
      .prepare(
        `INSERT INTO envios (id, calibracao_id, cliente_id, tipo, para, assunto, usuario_id, usuario_nome, em)
         VALUES ('antigo', '', ?, 'LEMBRETE', 'qualidade@mercado.com.br', 'Calibração', '', 'Admin', ?)`,
      )
      .run(c.cliente.id, em)
    const v = (await vencimentos()).get('TL-2231')!
    expect(v.lembreteEm).toBe('')
    expect(v.ultimoLembreteCliente).toBe(em)
    expect((await lembretesDoCliente())[0].balancas).toEqual([])
  })
})

// Fluxo completo pela API: cadastros → calibração → emissão (PDF guardado e imutável) → verificação
// pública → revisão (substitui) → cancelamento, com as travas de quem pode fazer o quê.

import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, CLIENTE_VAZIO, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente, Padrao } from '#shared/tipos.ts'
import { criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'

let t: AppComLogin
let cliente: Cliente
let balanca: Balanca
let pesos: Padrao

beforeEach(async () => {
  t = await criarAppComLogin()
  // O administrador da ferramenta local não nasce signatário: passa a ser aqui
  const r = await t.chamar('PUT', `/api/usuarios/${t.adminId}`, { cookie: t.cookieAdmin, payload: { signatario: true } })
  expect(r.statusCode).toBe(200)

  cliente = (
    await criar('/api/clientes', {
      ...CLIENTE_VAZIO,
      tipo: 'PJ',
      nome: 'Mercado Bom Preço',
      razaoSocial: 'MERCADO BOM PRECO LTDA',
      documento: '11.444.777/0001-61',
      logradouro: 'Avenida 1',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Rio Claro',
      uf: 'SP',
      cep: '13500-000',
      emailCertificados: 'qualidade@mercado.com.br',
    })
  ).cliente
  balanca = (
    await criar('/api/balancas', {
      ...BALANCA_VAZIA,
      clienteId: cliente.id,
      fabricante: 'Toledo',
      modelo: '9094',
      numeroSerie: 'TL-2231',
      portariaAprovacao: 'Portaria Inmetro 236/1994',
      faixas: [{ max: 30, e: 0.01, d: 0.01 }],
    })
  ).balanca
  pesos = (
    await criar('/api/padroes', {
      ...PADRAO_VAZIO,
      identificacao: 'JP-01',
      descricao: 'Jogo de pesos M1 1 kg a 10 kg',
      classe: 'M1',
      certificado: 'LAB-0456/2026',
      laboratorio: 'Laboratório de Massa Exemplo',
      dataCalibracao: '2026-01-10',
      validade: '2099-01-10',
      pesos: [
        { id: 'p10a', marca: 'A', nominal: 10000, correcao: 40, incerteza: 160, k: 2 },
        { id: 'p10b', marca: 'B', nominal: 10000, correcao: -30, incerteza: 160, k: 2 },
        { id: 'p10c', marca: 'C', nominal: 10000, correcao: 10, incerteza: 160, k: 2 },
        { id: 'p5', marca: '', nominal: 5000, correcao: 20, incerteza: 80, k: 2 },
      ],
    })
  ).padrao
})
afterEach(async () => {
  await t.fechar()
})

async function criar(url: string, payload: unknown, cookie = t.cookieAdmin) {
  const r = await t.chamar('POST', url, { cookie, payload })
  if (r.statusCode !== 201 && r.statusCode !== 200) throw new Error(`${url}: ${r.statusCode} ${r.body}`)
  return r.json()
}

const peca = (pesoId: string) => ({ padraoId: pesos.id, pesoId, quantidade: 1 })

/** Rascunho preenchido com leituras plausíveis (erros de 0 a 10 g). */
async function calibracaoPronta(cookie = t.cookieAdmin): Promise<Calibracao> {
  const { calibracao: k } = (await criar(
    '/api/calibracoes',
    { clienteId: cliente.id, balancaId: balanca.id, ordemServico: 'OS 4471' },
    cookie,
  )) as {
    calibracao: Calibracao
  }
  expect(k).toMatchObject({ status: 'RASCUNHO', numero: '', padroesIds: [pesos.id], ordemServico: 'OS 4471' })
  expect(k.localEndereco).toContain('Rio Claro')
  const dados: CalibracaoInput = {
    ...k,
    ambiente: { temperaturaInicial: 22.1, temperaturaFinal: 22.6, umidadeInicial: 55, umidadeFinal: 57, pressao: null },
    repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15, 15.01, 15, 15, 15] }],
    excentricidade: {
      aplicavel: true,
      motivo: '',
      carga: 10,
      metodo: 1,
      posicoes: ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita'].map((rotulo, i) => ({
        rotulo,
        leitura: i === 2 ? 10.01 : 10,
        referencia: null,
      })),
    },
    indicacao: {
      metodo: 'CRESCENTE_DECRESCENTE',
      retornoZero: 0,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: [
        { id: 'a', carga: 5, pecas: [peca('p5')], pecasManuais: true, crescente: 5, decrescente: 5, nivelSubstituicao: 0 },
        {
          id: 'b',
          carga: 10,
          pecas: [peca('p10a')],
          pecasManuais: true,
          crescente: 10,
          decrescente: 10.01,
          nivelSubstituicao: 0,
        },
        {
          id: 'c',
          carga: 20,
          pecas: [peca('p10a'), peca('p10b')],
          pecasManuais: true,
          crescente: 20.01,
          decrescente: 20.01,
          nivelSubstituicao: 0,
        },
        {
          id: 'd',
          carga: 30,
          pecas: [peca('p10a'), peca('p10b'), peca('p10c')],
          pecasManuais: true,
          crescente: 30.01,
          decrescente: 30.01,
          nivelSubstituicao: 0,
        },
      ],
    },
  }
  const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie, payload: { ...dados, versao: k.versao } })
  expect(r.statusCode, r.body).toBe(200)
  expect(r.json().pendencias).toEqual([])
  return r.json().calibracao
}

const emitir = (k: Calibracao, cookie = t.cookieAdmin) =>
  t.chamar('POST', `/api/calibracoes/${k.id}/emitir`, { cookie, payload: { versao: k.versao } })

describe('emissão do certificado', () => {
  it('numera, congela os dados, guarda o PDF e não deixa mais alterar', async () => {
    const k = await calibracaoPronta()
    const r = await emitir(k)
    expect(r.statusCode, r.body).toBe(200)
    const emitida: Calibracao = r.json().calibracao
    const ano = new Date().getFullYear()
    expect(emitida.status).toBe('EMITIDO')
    expect(emitida.numero).toBe(`CC-${ano}-00001`)
    expect(emitida.emissao).toMatchObject({
      emitidoPor: 'Admin Teste',
      cliente: { razaoSocial: 'MERCADO BOM PRECO LTDA' },
      balanca: { numeroSerie: 'TL-2231' },
      signatario: { id: t.adminId },
      tecnico: { id: t.adminId },
    })
    expect(emitida.emissao?.codigo).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/)

    // O PDF servido é o guardado: o mesmo SHA-256 da emissão
    const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect(createHash('sha256').update(pdf.rawPayload).digest('hex')).toBe(emitida.emissao?.hashPdf)
    const baixar = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf?baixar=1`, { cookie: t.cookieAdmin })
    expect(baixar.headers['content-disposition']).toMatch(/^attachment; filename="Certificado-CC-\d{4}-00001\.pdf"$/)

    // Mudar o cadastro depois não muda o certificado emitido
    await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...balanca, numeroSerie: 'OUTRO', versao: balanca.versao },
    })
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.balanca.numeroSerie).toBe('TL-2231')
    expect(detalhe.revisoes).toEqual([])

    // Emitido não se edita, não se exclui e não se emite de novo
    expect((await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin, payload: k })).statusCode).toBe(409)
    expect((await t.chamar('DELETE', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(409)
    expect((await emitir(emitida)).statusCode).toBe(409)

    // A próxima emissão segue a sequência do ano
    const outra = await calibracaoPronta()
    expect((await emitir(outra)).json().calibracao.numero).toBe(`CC-${ano}-00002`)
  })

  it('verificação pública pelo código, sem login', async () => {
    const k = await calibracaoPronta()
    const emitida: Calibracao = (await emitir(k)).json().calibracao
    const codigo = emitida.emissao!.codigo
    const r = await t.app.inject({ method: 'GET', url: `/api/verificar/${codigo.toLowerCase()}` })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({
      numero: emitida.numero,
      status: 'EMITIDO',
      cliente: 'MERCADO BOM PRECO LTDA',
      numeroSerie: 'TL-2231',
      hashPdf: emitida.emissao!.hashPdf,
    })
    // Só o essencial: nada de leituras, endereço ou e-mail
    expect(Object.keys(r.json()).sort()).toEqual(
      ['balanca', 'cliente', 'dataCalibracao', 'dataEmissao', 'hashPdf', 'numero', 'numeroSerie', 'status'].sort(),
    )
    expect((await t.app.inject({ method: 'GET', url: '/api/verificar/AAAA-BBBB' })).statusCode).toBe(404)
    expect((await t.app.inject({ method: 'GET', url: '/api/verificar/qualquer-coisa' })).statusCode).toBe(404)
  })

  it('o técnico que não é signatário envia para revisão; só o signatário emite', async () => {
    const k = await calibracaoPronta(t.cookieComum)
    expect(k.tecnicoId).toBe(t.comumId)
    const negado = await emitir(k, t.cookieComum)
    expect(negado.statusCode).toBe(403)
    expect(negado.json().erro).toMatch(/signatário/)

    const revisao = await t.chamar('POST', `/api/calibracoes/${k.id}/situacao`, {
      cookie: t.cookieComum,
      payload: { status: 'REVISAO', versao: k.versao },
    })
    expect(revisao.statusCode).toBe(200)
    const aguardando: Calibracao = revisao.json().calibracao
    expect(aguardando.status).toBe('REVISAO')

    const ok = await emitir(aguardando)
    expect(ok.statusCode).toBe(200)
    expect(ok.json().calibracao.emissao).toMatchObject({ tecnico: { id: t.comumId }, signatario: { id: t.adminId } })
  })

  it('com revisor obrigatório, quem executou não emite o próprio certificado', async () => {
    const config = (await t.chamar('GET', '/api/config', { cookie: t.cookieAdmin })).json().config
    expect(
      (await t.chamar('PUT', '/api/config', { cookie: t.cookieAdmin, payload: { ...config, exigirRevisor: true } })).statusCode,
    ).toBe(200)
    const k = await calibracaoPronta()
    const r = await emitir(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toMatch(/outra pessoa/)
  })

  it('padrão vencido na data da calibração bloqueia a emissão', async () => {
    const k = await calibracaoPronta()
    const r = await t.chamar('PUT', `/api/padroes/${pesos.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...pesos, validade: '2026-01-11', versao: pesos.versao },
    })
    expect(r.statusCode).toBe(200)
    const negado = await emitir(k)
    expect(negado.statusCode).toBe(409)
    expect(negado.json().erro).toMatch(/JP-01 estava vencido/)
    expect(negado.json().pendencias.length).toBeGreaterThan(0)
  })

  it('sem leituras não emite: as pendências dizem o que falta', async () => {
    const { calibracao: k } = await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id })
    const r = await emitir(k)
    expect(r.statusCode).toBe(409)
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.pendencias).toEqual(expect.arrayContaining([expect.stringMatching(/temperatura/)]))
  })

  it('prévia do rascunho sai com marca d’água, sem gravar nada', async () => {
    const k = await calibracaoPronta()
    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/previa`, { cookie: t.cookieAdmin, payload: k })
    expect(r.statusCode).toBe(200)
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    const depois = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().calibracao
    expect(depois).toMatchObject({ status: 'RASCUNHO', numero: '', versao: k.versao })
  })
})

describe('revisão e cancelamento', () => {
  it('a revisão herda o número com "-R1", e ao ser emitida substitui o original', async () => {
    const original: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const semMotivo = await t.chamar('POST', `/api/calibracoes/${original.id}/revisar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: '' },
    })
    expect(semMotivo.statusCode).toBe(400)

    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Correção da identificação da balança',
    })) as { calibracao: Calibracao }
    expect(rev).toMatchObject({
      status: 'RASCUNHO',
      substituiId: original.id,
      revisao: 1,
      motivoRevisao: 'Correção da identificação da balança',
    })
    // Leituras copiadas
    expect(rev.indicacao.pontos.map((p) => p.crescente)).toEqual(original.indicacao.pontos.map((p) => p.crescente))
    // Uma revisão por vez
    expect(
      (
        await t.chamar('POST', `/api/calibracoes/${original.id}/revisar`, {
          cookie: t.cookieAdmin,
          payload: { motivo: 'outra revisão' },
        })
      ).statusCode,
    ).toBe(409)
    const andamento = (await t.chamar('GET', `/api/calibracoes/${original.id}`, { cookie: t.cookieAdmin })).json()
    expect(andamento.revisoes).toEqual([{ id: rev.id, numero: '', status: 'RASCUNHO' }])

    const emitida = await emitir(rev)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const nova: Calibracao = emitida.json().calibracao
    expect(nova.numero).toBe(`${original.numero}-R1`)
    expect(nova.emissao).toMatchObject({ substituiNumero: original.numero })

    const antigo = (await t.chamar('GET', `/api/calibracoes/${original.id}`, { cookie: t.cookieAdmin })).json()
    expect(antigo.calibracao.status).toBe('SUBSTITUIDO')
    expect(antigo.revisoes).toEqual([{ id: rev.id, numero: nova.numero, status: 'EMITIDO' }])
    const verificacao = await t.app.inject({ method: 'GET', url: `/api/verificar/${original.emissao!.codigo}` })
    expect(verificacao.json().status).toBe('SUBSTITUIDO')
    // O substituído continua com o PDF (servido com a marca)
    const pdf = await t.chamar('GET', `/api/calibracoes/${original.id}/pdf`, { cookie: t.cookieAdmin })
    expect(pdf.statusCode).toBe(200)
  })

  it('só o administrador cancela, com motivo; a verificação passa a mostrar "cancelado"', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const tecnico = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieComum,
      payload: { motivo: 'Emitido por engano' },
    })
    expect(tecnico.statusCode).toBe(403)
    const semMotivo = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'x' },
    })
    expect(semMotivo.statusCode).toBe(400)
    const ok = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Emitido por engano', versao: k.versao },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().calibracao).toMatchObject({
      status: 'CANCELADO',
      cancelamento: { motivo: 'Emitido por engano', por: 'Admin Teste' },
    })
    const v = await t.app.inject({ method: 'GET', url: `/api/verificar/${k.emissao!.codigo}` })
    expect(v.json().status).toBe('CANCELADO')
    // Cancelado não se revisa nem se envia
    expect(
      (
        await t.chamar('POST', `/api/calibracoes/${k.id}/revisar`, {
          cookie: t.cookieAdmin,
          payload: { motivo: 'corrigir algo' },
        })
      ).statusCode,
    ).toBe(409)
    const email = await t.chamar('POST', `/api/calibracoes/${k.id}/email`, {
      cookie: t.cookieAdmin,
      payload: { para: 'a@b.com' },
    })
    expect(email.statusCode).toBe(409)
  })

  it('calibrar de novo aproveita pontos e padrões, sem as leituras', async () => {
    const k: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const { calibracao: nova } = (await criar(`/api/calibracoes/${k.id}/recalibrar`, {})) as { calibracao: Calibracao }
    expect(nova).toMatchObject({
      status: 'RASCUNHO',
      clienteId: cliente.id,
      balancaId: balanca.id,
      padroesIds: [pesos.id],
      substituiId: '',
    })
    expect(nova.indicacao.pontos.map((p) => p.carga)).toEqual([5, 10, 20, 30])
    expect(nova.indicacao.pontos.every((p) => p.crescente === null && p.decrescente === null)).toBe(true)
    expect(nova.repetibilidade.flatMap((r) => r.leituras).every((l) => l === null)).toBe(true)
    // Uma calibração nova da mesma balança também já vem com os pontos da última emitida
    const { calibracao: outra } = (await criar('/api/calibracoes', { balancaId: balanca.id })) as { calibracao: Calibracao }
    expect(outra.clienteId).toBe(cliente.id)
    expect(outra.indicacao.pontos.map((p) => p.carga)).toEqual([5, 10, 20, 30])
  })
})

describe('listas e painel', () => {
  it('a lista filtra por situação e busca; o painel conta', async () => {
    const emitida: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    await calibracaoPronta()
    const todas = (await t.chamar('GET', '/api/calibracoes', { cookie: t.cookieAdmin })).json()
    expect(todas.total).toBe(2)
    const abertas = (await t.chamar('GET', '/api/calibracoes?status=ABERTAS', { cookie: t.cookieAdmin })).json()
    expect(abertas.itens.map((i: { status: string }) => i.status)).toEqual(['RASCUNHO'])
    const busca = (
      await t.chamar('GET', `/api/calibracoes?busca=${encodeURIComponent('tl-2231')}`, { cookie: t.cookieAdmin })
    ).json()
    expect(busca.total).toBe(2)
    const porNumero = (
      await t.chamar('GET', `/api/calibracoes?busca=${encodeURIComponent(emitida.numero)}`, { cookie: t.cookieAdmin })
    ).json()
    expect(porNumero.itens.map((i: { id: string }) => i.id)).toEqual([emitida.id])
    const painel = (await t.chamar('GET', '/api/painel', { cookie: t.cookieAdmin })).json().painel
    expect(painel).toBeTruthy()
  })
})

// Fluxo completo pela API: cadastros → calibração → emissão (PDF guardado e imutável) → verificação
// pública → revisão (substitui) → cancelamento, com as travas de quem pode fazer o quê.

import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, CLIENTE_VAZIO, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente, Padrao } from '#shared/tipos.ts'
import { criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { ASSINATURA_EXEMPLO_1 } from './pdf/assinaturasExemplo.ts'

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
      acreditacao: 'CAL 0123',
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

  it('prévia sem as imagens das assinaturas (ninguém autorizou ainda); o emitido, com elas', async () => {
    // Técnico e signatário com a assinatura digitalizada
    t.ctx.db.prepare('UPDATE usuarios SET assinatura = ?').run(ASSINATURA_EXEMPLO_1)
    const k = await calibracaoPronta()
    const imagens = (pdf: Buffer) => pdf.toString('latin1').match(/\/Subtype \/Image/g)?.length ?? 0
    const previa = await t.chamar('POST', `/api/calibracoes/${k.id}/previa`, { cookie: t.cookieAdmin, payload: k })
    expect(previa.statusCode).toBe(200)
    expect(imagens(previa.rawPayload)).toBe(0)
    const emitida = await emitir(k)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
    expect(imagens(pdf.rawPayload)).toBeGreaterThan(0)
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

describe('troca da unidade da indicação da balança', () => {
  it('as calibrações abertas acompanham (30 kg → 30 000 g); a emitida não muda', async () => {
    const emitida: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const aberta = await calibracaoPronta()
    // A mesma balança, cadastrada em g: 30 000 g × 10 g
    const r = await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...balanca, unidade: 'g', faixas: [{ max: 30000, e: 10, d: 10 }], versao: balanca.versao },
    })
    expect(r.statusCode, r.body).toBe(200)

    const k: Calibracao = (await t.chamar('GET', `/api/calibracoes/${aberta.id}`, { cookie: t.cookieAdmin })).json().calibracao
    // A versão sobe: uma tela com o rascunho antigo aberto não grava por cima os números em kg
    expect(k.versao).toBe(aberta.versao + 1)
    expect(k.repetibilidade[0]).toMatchObject({ carga: 15000, leituras: [15000, 15000, 15010, 15000, 15000, 15000] })
    expect(k.excentricidade.carga).toBe(10000)
    expect(k.excentricidade.posicoes.map((p) => p.leitura)).toEqual([10000, 10000, 10010, 10000, 10000])
    expect(k.indicacao.pontos.map((p) => [p.carga, p.crescente, p.decrescente])).toEqual([
      [5000, 5000, 5000],
      [10000, 10000, 10010],
      [20000, 20010, 20010],
      [30000, 30010, 30010],
    ])
    expect(k.indicacao.retornoZero).toBe(0)
    // Os pesos padrão continuam os mesmos
    expect(k.indicacao.pontos[3].pecas).toEqual(aberta.indicacao.pontos[3].pecas)
    const salvar = await t.chamar('PUT', `/api/calibracoes/${aberta.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...aberta, versao: aberta.versao },
    })
    expect(salvar.statusCode).toBe(409)

    // O certificado emitido guarda a balança e as leituras de quando foi emitido
    const e: Calibracao = (await t.chamar('GET', `/api/calibracoes/${emitida.id}`, { cookie: t.cookieAdmin })).json().calibracao
    expect(e.versao).toBe(emitida.versao)
    expect(e.repetibilidade[0].carga).toBe(15)
    expect(e.emissao?.balanca).toMatchObject({ unidade: 'kg', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
  })

  it('o que é copiado de um certificado emitido vem na unidade nova (nova calibração, calibrar de novo, revisão)', async () => {
    const emitida: Calibracao = (await emitir(await calibracaoPronta())).json().calibracao
    const r = await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...balanca, unidade: 'g', faixas: [{ max: 30000, e: 10, d: 10 }], versao: balanca.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const cargas = (k: Calibracao) => ({
      indicacao: k.indicacao.pontos.map((p) => p.carga),
      repetibilidade: k.repetibilidade.map((x) => x.carga),
      excentricidade: k.excentricidade.carga,
    })
    const emG = { indicacao: [5000, 10000, 20000, 30000], repetibilidade: [15000], excentricidade: 10000 }

    // Nova calibração (aproveita os pontos da última emitida)
    const { calibracao: nova } = (await criar('/api/calibracoes', { balancaId: balanca.id })) as { calibracao: Calibracao }
    expect(cargas(nova)).toEqual(emG)
    await t.chamar('DELETE', `/api/calibracoes/${nova.id}`, { cookie: t.cookieAdmin })

    // Calibrar de novo
    const { calibracao: denovo } = (await criar(`/api/calibracoes/${emitida.id}/recalibrar`, {})) as { calibracao: Calibracao }
    expect(cargas(denovo)).toEqual(emG)
    expect(denovo.indicacao.pontos.every((p) => p.crescente === null)).toBe(true)
    await t.chamar('DELETE', `/api/calibracoes/${denovo.id}`, { cookie: t.cookieAdmin })

    // Revisão: cargas e leituras convertidas; as pendências são as da unidade certa
    const { calibracao: rev } = (await criar(`/api/calibracoes/${emitida.id}/revisar`, {
      motivo: 'Unidade da indicação corrigida',
    })) as { calibracao: Calibracao }
    expect(cargas(rev)).toEqual(emG)
    expect(rev.indicacao.pontos.map((p) => [p.crescente, p.decrescente])).toEqual([
      [5000, 5000],
      [10000, 10010],
      [20010, 20010],
      [30010, 30010],
    ])
    expect(rev.repetibilidade[0].leituras).toEqual([15000, 15000, 15010, 15000, 15000, 15000])
    expect(rev.excentricidade.posicoes.map((p) => p.leitura)).toEqual([10000, 10000, 10010, 10000, 10000])
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.pendencias).toEqual([])
    const nova2 = await emitir(rev)
    expect(nova2.statusCode, nova2.body).toBe(200)
    expect(nova2.json().calibracao.emissao.balanca).toMatchObject({ unidade: 'g' })
  })
})

describe('troca do cliente dono da balança', () => {
  const outroCliente = () =>
    criar('/api/clientes', {
      ...CLIENTE_VAZIO,
      tipo: 'PJ',
      nome: 'Padaria Nova',
      documento: '11.222.333/0001-81',
      logradouro: 'Rua 2',
      numero: '20',
      cidade: 'Limeira',
      uf: 'SP',
    }).then((r) => r.cliente as Cliente)
  const abertasDe = async (c: Cliente) =>
    (await t.chamar('GET', `/api/calibracoes?status=ABERTAS&clienteId=${c.id}`, { cookie: t.cookieAdmin }))
      .json()
      .itens.map((k: { id: string }) => k.id)

  for (const comUnidade of [false, true]) {
    it(`os rascunhos passam para o novo cliente e continuam gravando${comUnidade ? ' (com a troca da unidade junto)' : ''}`, async () => {
      const aberta = await calibracaoPronta()
      const novo = await outroCliente()
      const r = await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
        cookie: t.cookieAdmin,
        payload: {
          ...balanca,
          clienteId: novo.id,
          ...(comUnidade ? { unidade: 'g', faixas: [{ max: 30000, e: 10, d: 10 }] } : {}),
          versao: balanca.versao,
        },
      })
      expect(r.statusCode, r.body).toBe(200)
      expect(await abertasDe(novo)).toEqual([aberta.id])
      expect(await abertasDe(cliente)).toEqual([])
      const k: Calibracao = (await t.chamar('GET', `/api/calibracoes/${aberta.id}`, { cookie: t.cookieAdmin })).json().calibracao
      expect(k.clienteId).toBe(novo.id)
      expect(k.versao).toBe(aberta.versao + 1)
      // O endereço era o do cliente antigo: passa a ser o do novo
      expect(k.localEndereco).toContain('Limeira')
      expect(k.repetibilidade[0].carga).toBe(comUnidade ? 15000 : 15)
      const salvar = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin, payload: k })
      expect(salvar.statusCode, salvar.body).toBe(200)
      expect(salvar.json().pendencias).toEqual([])
    })
  }
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

describe('balança classe I: o rascunho novo', () => {
  async function analitica() {
    return (
      await criar('/api/balancas', {
        ...BALANCA_VAZIA,
        clienteId: cliente.id,
        tipo: 'ANALITICA',
        unidade: 'g',
        classe: 'I',
        fabricante: 'Shimadzu',
        modelo: 'AUW220',
        numeroSerie: 'D4501',
        faixas: [{ max: 220, e: 0.001, d: 0.0001 }],
      })
    ).balanca as Balanca
  }
  async function jogoE2() {
    return (
      await criar('/api/padroes', {
        ...PADRAO_VAZIO,
        identificacao: 'JP-E2',
        descricao: 'Jogo de pesos E2 1 mg a 200 g',
        classe: 'E2',
        densidade: 7950,
        incertezaDensidade: 70,
        certificado: 'LAB-0999/2026',
        laboratorio: 'Laboratório de Massa Exemplo',
        acreditacao: 'CAL 0123',
        dataCalibracao: '2026-01-10',
        validade: '2099-01-10',
        pesos: [{ id: 'g200', marca: '', nominal: 200, correcao: 0.1, incerteza: 0.1, k: 2 }],
      })
    ).padrao as Padrao
  }

  it('sem histórico, nasce com o empuxo pela densidade do ar medida, a convecção e só os jogos E1/E2/F1', async () => {
    const b = await analitica()
    const e2 = await jogoE2()
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: b.id })) as {
      calibracao: Calibracao
    }
    expect(k.opcoes).toMatchObject({ empuxo: 'MEDIDO', conveccao: 'CALCULAR' })
    // O jogo M1 (do beforeEach) fica de fora; o E2 entra
    expect(k.padroesIds).toEqual([e2.id])
    // O u(ρ) gravado no cadastro do padrão
    const r = await t.chamar('GET', `/api/padroes`, { cookie: t.cookieAdmin })
    expect((r.json().padroes as Padrao[]).find((p) => p.id === e2.id)?.incertezaDensidade).toBe(70)
  })

  /** Instrumento auxiliar rastreável (barômetro, termômetro de duas entradas…). */
  async function auxiliar(tipo: Padrao['tipo'], identificacao: string) {
    return (
      await criar('/api/padroes', {
        ...PADRAO_VAZIO,
        tipo,
        identificacao,
        descricao: identificacao,
        certificado: `LAB-${identificacao}/2026`,
        laboratorio: 'Laboratório Exemplo',
        acreditacao: 'CAL 0123',
        dataCalibracao: '2026-01-10',
        validade: '2099-01-10',
        pesos: [],
      })
    ).padrao as Padrao
  }

  it('sem histórico: o termômetro de duas entradas ("Outro") entra; excentricidade pelo método 3 e cargas com descarga', async () => {
    const b = await analitica()
    const e2 = await jogoE2()
    const td = await auxiliar('OUTRO', 'TD-01')
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: b.id })) as {
      calibracao: Calibracao
    }
    expect([...k.padroesIds].sort()).toEqual([e2.id, td.id].sort())
    expect(k.excentricidade.metodo).toBe(3)
    expect(k.indicacao.metodo).toBe('DESCONTINUO')
    // Classe III: o "outro" fica de fora e os métodos de sempre
    const { calibracao: iii } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id })) as {
      calibracao: Calibracao
    }
    expect(iii.padroesIds).not.toContain(td.id)
    expect(iii.excentricidade.metodo).toBe(1)
    expect(iii.indicacao.metodo).toBe('CRESCENTE_DECRESCENTE')
  })

  it('classe III: os dois jogos, e as opções do padrão da empresa (como sempre)', async () => {
    await jogoE2()
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id })) as {
      calibracao: Calibracao
    }
    expect(k.padroesIds).toHaveLength(2)
    expect(k.opcoes).toMatchObject({ empuxo: 'NAO_AJUSTADO', deriva: 'EMA', conveccao: 'NAO_CONSIDERAR' })
  })

  it('a pressão e o ΔT pesos − ar gravados no rascunho; sem o ΔT, a pendência da convecção', async () => {
    const b = await analitica()
    const e2 = await jogoE2()
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: b.id })) as {
      calibracao: Calibracao
    }
    const ambiente = { temperaturaInicial: 22, temperaturaFinal: 22.4, umidadeInicial: 55, umidadeFinal: 56, pressao: 941.5 }
    // Um ponto lido (a convecção é conferida nos pontos com leitura)
    const indicacao = {
      ...k.indicacao,
      pontos: [
        {
          id: 'p',
          carga: 200,
          pecas: [{ padraoId: e2.id, pesoId: 'g200', quantidade: 1 }],
          pecasManuais: true,
          crescente: 200.0003,
          decrescente: null,
          nivelSubstituicao: 0,
        },
      ],
    }
    let versao = k.versao
    const salvar = async (amb: object) => {
      const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
        cookie: t.cookieAdmin,
        payload: { ...k, versao, indicacao, ambiente: amb },
      })
      expect(r.statusCode).toBe(200)
      versao = r.json().calibracao.versao
      return r
    }
    const sem = await salvar(ambiente)
    expect(sem.json().pendencias).toContain(
      'Convecção: registre a diferença de temperatura entre os pesos e o ar antes do 1º ensaio, ou a aclimatação dos pesos (etapa Padrões e ambiente).',
    )
    const com = await salvar({ ...ambiente, deltaTPesos: 0.3 })
    expect(com.json().calibracao.ambiente).toMatchObject({ pressao: 941.5, deltaTPesos: 0.3, aclimatacao: null })
    expect((com.json().pendencias as string[]).some((p) => p.startsWith('Convecção'))).toBe(false)
    const acl = await salvar({ ...ambiente, aclimatacao: { deltaT0: -4, minutos: 120 } })
    expect(acl.json().calibracao.ambiente).toMatchObject({ deltaTPesos: null, aclimatacao: { deltaT0: -4, minutos: 120 } })
  })

  /** Calibração classe I pronta para emitir: ajuste interno, "como encontrado" e o ensaio final em 100 g e 200 g. */
  async function classeIPronta(b: Balanca, e2: Padrao, opcoes: Partial<Calibracao['opcoes']> = {}) {
    await auxiliar('BAROMETRO', 'BR-01')
    await auxiliar('OUTRO', 'TD-01')
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: b.id })) as {
      calibracao: Calibracao
    }
    const p = (id: string, carga: number, leitura: number, pesoId?: string) => ({
      id,
      carga,
      pecas: pesoId ? [{ padraoId: e2.id, pesoId, quantidade: 1 }] : [],
      pecasManuais: true,
      crescente: leitura,
      decrescente: null,
      nivelSubstituicao: 0,
    })
    const ensaio = (antes: boolean) => ({
      ...k.indicacao,
      retornoZero: 0,
      pontos: [p('z', 0, 0), p('c', 100, antes ? 100.0004 : 100.0001, 'g100'), p('m', 200, antes ? 200.0007 : 200.0002, 'g200')],
    })
    const dados = {
      ...k,
      opcoes: { ...k.opcoes, ...opcoes },
      ajuste: { realizado: 'INTERNO', descricao: '' },
      ambiente: {
        temperaturaInicial: 22.4,
        temperaturaFinal: 23.0,
        umidadeInicial: 58,
        umidadeFinal: 60,
        pressao: 941.5,
        deltaTPesos: 0.4,
        aclimatacao: null,
      },
      repetibilidade: [{ id: 'r', carga: 200, leituras: Array.from({ length: 10 }, (_, i) => (i % 2 ? 200.0003 : 200.0002)) }],
      excentricidade: { aplicavel: false, motivo: 'Teste', carga: 0, metodo: 3, posicoes: [] },
      comoEncontrado: ensaio(true),
      indicacao: ensaio(false),
    }
    const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...dados, versao: k.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().pendencias).toEqual([])
    return r.json().calibracao as Calibracao
  }

  async function jogoE2Completo() {
    return (
      await criar('/api/padroes', {
        ...PADRAO_VAZIO,
        identificacao: 'JP-E2',
        descricao: 'Jogo de pesos E2 100 g e 200 g',
        classe: 'E2',
        densidade: 7950,
        incertezaDensidade: 70,
        certificado: 'LAB-0999/2026',
        laboratorio: 'Laboratório de Massa Exemplo',
        acreditacao: 'CAL 0123',
        dataCalibracao: '2026-01-10',
        validade: '2099-01-10',
        pesos: [
          { id: 'g200', marca: '', nominal: 200, correcao: 0.1, incerteza: 0.1, k: 2 },
          { id: 'g100', marca: '', nominal: 100, correcao: -0.05, incerteza: 0.05, k: 2 },
        ],
      })
    ).padrao as Padrao
  }

  it('"ajustada logo antes" com ajuste interno: o "como encontrado" vai pela densidade do ar medida', async () => {
    const b = await analitica()
    const e2 = await jogoE2Completo()
    const k = await classeIPronta(b, e2, { empuxo: 'AJUSTADO' })
    const { resultado, comoEncontrado } = calcularCalibracao(k, b, [e2])
    expect(comoEncontrado!.pontos[2].crescente!.correcaoEmpuxo).toBeGreaterThan(0)
    expect(comoEncontrado!.avisos.map((a) => a.mensagem).join('\n')).not.toMatch(/empuxo estimado sem a densidade do ar/)
    expect(comoEncontrado!.pontos[2].crescente!.U / resultado.pontos[2].crescente!.U).toBeLessThan(1.1)
  })

  it('padrão gravado antes da conferência da densidade (7,85 em g/cm³): desativa e grava o resto; a densidade nova é conferida', async () => {
    const criado = (await criar('/api/padroes', {
      ...PADRAO_VAZIO,
      identificacao: 'JP-M1',
      classe: 'M1',
      uso: 'NOMINAL',
      pesos: [{ id: 'k20', marca: '', nominal: 20000, correcao: 0, incerteza: 0, k: 2 }],
    })) as { padrao: Padrao }
    const antigo = { ...criado.padrao, densidade: 7.85 }
    t.ctx.db.prepare('UPDATE padroes SET dados = ? WHERE id = ?').run(JSON.stringify(antigo), antigo.id)
    // "Desativar" no menu do cartão manda o cadastro inteiro
    const desativado = await t.chamar('PUT', `/api/padroes/${antigo.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...antigo, ativo: false, versao: antigo.versao },
    })
    expect(desativado.statusCode, desativado.body).toBe(200)
    expect(desativado.json().padrao).toMatchObject({ ativo: false, densidade: 7.85 })
    const atual = desativado.json().padrao as Padrao
    // Outro valor fora da faixa não grava; o valor corrigido grava
    const outro = await t.chamar('PUT', `/api/padroes/${antigo.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, densidade: 7.95, versao: atual.versao },
    })
    expect(outro.statusCode).toBe(400)
    expect(outro.json().erro).toMatch(/Densidade de 7,95 kg\/m³ fora da faixa/)
    const corrigido = await t.chamar('PUT', `/api/padroes/${antigo.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, densidade: 7850, versao: atual.versao },
    })
    expect(corrigido.statusCode, corrigido.body).toBe(200)
    // Cadastro novo com a densidade fora da faixa: não grava
    const novo = await t.chamar('POST', '/api/padroes', {
      cookie: t.cookieAdmin,
      payload: { ...PADRAO_VAZIO, identificacao: 'JP-M2', densidade: 7.85, pesos: antigo.pesos },
    })
    expect(novo.statusCode).toBe(400)
  })

  it('"ajustada logo antes" com ajuste: a densidade dos pesos do "como encontrado" é conferida e bloqueia a emissão', async () => {
    const b = await analitica()
    const e2 = await jogoE2Completo()
    const k = await classeIPronta(b, e2, { empuxo: 'AJUSTADO' })
    // Cadastro gravado antes da conferência da unidade: 7,95 (g/cm³) como kg/m³
    t.ctx.db
      .prepare('UPDATE padroes SET dados = ? WHERE id = ?')
      .run(JSON.stringify({ ...e2, densidade: 7.95, incertezaDensidade: 0.035 }), e2.id)
    const pendencias = async () =>
      (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().pendencias
    expect(await pendencias()).toEqual([
      'Como encontrado: Empuxo pela densidade do ar medida: o jogo JP-E2 está com densidade de 7,95 kg/m³, fora da faixa dos pesos; confira a unidade no cadastro do padrão (7,95 g/cm³ = 7 950 kg/m³).',
    ])
    const negado = await emitir(k)
    expect(negado.statusCode).toBe(409)
    // Sem densidade nem u(ρ) (o cadastro aceita: são opcionais)
    const atual = t.ctx.repo.obterPadrao(e2.id)!
    const semDensidade = await t.chamar('PUT', `/api/padroes/${e2.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, densidade: 0, incertezaDensidade: 0, versao: atual.versao },
    })
    expect(semDensidade.statusCode, semDensidade.body).toBe(200)
    expect(await pendencias()).toEqual([
      'Como encontrado: Empuxo pela densidade do ar medida: o jogo JP-E2 está sem a densidade ou a incerteza da densidade (cadastro do padrão).',
    ])
    expect((await emitir(k)).statusCode).toBe(409)
  })

  it('revisão de certificado classe I emitido antes do cálculo da classe I: mantém o cálculo e as exigências da época', async () => {
    const b = await analitica()
    const e2 = await jogoE2Completo()
    const pronta = await classeIPronta(b, e2, { empuxo: 'AJUSTADO' })
    const emitida = await emitir(pronta)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const original = emitida.json().calibracao as Calibracao
    // Gravado no formato antigo (versão 1.0.x): sem a convecção nas opções, sem o ΔT pesos − ar e a aclimatação
    const { conveccao: _c, ...opcoesAntigas } = original.opcoes
    const { deltaTPesos: _d, aclimatacao: _a, ...ambienteAntigo } = original.ambiente
    const antigo = { ...original, opcoes: opcoesAntigas, ambiente: ambienteAntigo }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(antigo), original.id)
    const naEpoca = calcularCalibracao(antigo, b, [e2]).comoEncontrado!

    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Corrigir o endereço do cliente',
    })) as { calibracao: Calibracao }
    expect(rev.calculoLegado).toBe(true)
    const aberta = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json()
    // Sem as pendências novas da classe I (convecção, ΔT) e o mesmo "como encontrado" do certificado original
    expect(aberta.pendencias).toEqual([])
    expect(calcularCalibracao(aberta.calibracao, b, [e2]).comoEncontrado!.pontos).toEqual(naEpoca.pontos)
    // A tela não muda o que é legado: o PUT mantém a marca
    const salvo = await t.chamar('PUT', `/api/calibracoes/${rev.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...rev, calculoLegado: false, versao: rev.versao },
    })
    expect(salvo.json().calibracao.calculoLegado).toBe(true)
    expect(salvo.json().pendencias).toEqual([])
    // A revisão emitida e a revisão dela continuam legadas
    const r1 = await emitir(salvo.json().calibracao)
    expect(r1.statusCode, r1.body).toBe(200)
    const { calibracao: r2 } = (await criar(`/api/calibracoes/${rev.id}/revisar`, { motivo: 'Outra correção' })) as {
      calibracao: Calibracao
    }
    expect(r2.calculoLegado).toBe(true)
  })

  it('revisão de certificado classe I emitido nesta versão: as regras novas, sem a marca de legado', async () => {
    const b = await analitica()
    const e2 = await jogoE2Completo()
    const original = (await emitir(await classeIPronta(b, e2))).json().calibracao as Calibracao
    const { calibracao: rev } = (await criar(`/api/calibracoes/${original.id}/revisar`, {
      motivo: 'Corrigir o endereço do cliente',
    })) as { calibracao: Calibracao }
    expect(rev.calculoLegado).toBeUndefined()
    // Sem o ΔT pesos − ar, a pendência da convecção volta
    const semDeltaT = await t.chamar('PUT', `/api/calibracoes/${rev.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...rev, ambiente: { ...rev.ambiente, deltaTPesos: null }, versao: rev.versao },
    })
    expect(semDeltaT.json().pendencias).toContain(
      'Convecção: registre a diferença de temperatura entre os pesos e o ar antes do 1º ensaio, ou a aclimatação dos pesos (etapa Padrões e ambiente).',
    )
  })
})

// Folha de campo pela API: a de uma calibração (rascunho e emitida, a reimpressão mantém o nº), a de uma
// balança com o plano da última calibração, a do cliente e a em branco; o nº FC no banco, os 404/400 e
// quem pode pedir (qualquer pessoa com sessão; sem sessão, 401).

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, CLIENTE_VAZIO, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente, Padrao } from '#shared/tipos.ts'
import { criarApp } from './app.ts'
import { criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { abrirBanco, type Banco } from './db.ts'
import { dataDaImpressaoNoPdf, numeroCertificadoNoPdf, Repositorio } from './repositorio.ts'
import { PARAMETROS_LEVES } from './senha.ts'
import { transplantarFolhasCampo } from './usuarios.ts'
import { nomeArquivoDaFolha, numeroDaFolha } from './rotas/folhaCampo.ts'

let t: AppComLogin
let cliente: Cliente
let balanca: Balanca
let pesos: Padrao
const ano = new Date().getFullYear()

async function criar(url: string, payload: unknown, cookie = t.cookieAdmin) {
  const r = await t.chamar('POST', url, { cookie, payload })
  if (r.statusCode !== 201 && r.statusCode !== 200) throw new Error(`${url}: ${r.statusCode} ${r.body}`)
  return r.json()
}

beforeEach(async () => {
  t = await criarAppComLogin()
  await t.chamar('PUT', `/api/usuarios/${t.adminId}`, { cookie: t.cookieAdmin, payload: { signatario: true } })
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
    })
  ).cliente
  balanca = (
    await criar('/api/balancas', {
      ...BALANCA_VAZIA,
      clienteId: cliente.id,
      fabricante: 'Toledo',
      modelo: '9094',
      numeroSerie: 'TL-2231',
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

const rascunho = async (os = 'OS 2026/0456', cookie = t.cookieAdmin): Promise<Calibracao> =>
  (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id, ordemServico: os }, cookie)).calibracao

/** As folhas de campo como estão no banco (o histórico: de qual calibração, substituída por qual). */
const folhasNoBanco = () =>
  t.ctx.db
    .prepare('SELECT numero, calibracao_id, substituida_por, substituida_em FROM folhas_campo ORDER BY ano, sequencia')
    .all() as Array<{ numero: string; calibracao_id: string; substituida_por: string; substituida_em: string }>
const folhaNoBanco = (numero: string) => folhasNoBanco().find((f) => f.numero === numero)
/** O que entrou no registro de atividades sobre a folha de campo (detalhe e alvo). */
const registrosDaFolha = () =>
  (
    t.ctx.db.prepare("SELECT acao, alvo, detalhe FROM auditoria WHERE detalhe LIKE '%folha-campo%' ORDER BY id").all() as Array<{
      acao: string
      alvo: string
      detalhe: string
    }>
  ).map((r) => [r.acao, r.alvo, r.detalhe])

const temPdftotext = !spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error
const textoDoPdf = (pdf: Buffer) =>
  spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdf }).stdout.toString('utf8').replace(/\s+/g, ' ')

describe('folha de campo de uma calibração', { timeout: 30_000 }, () => {
  it('sai em PDF, inline, com o nome pela OS e o nº FC reservado uma vez só', async () => {
    const k = await rascunho()
    const r = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieComum })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.headers['content-type']).toBe('application/pdf')
    expect(r.headers['cache-control']).toBe('no-store')
    expect(r.headers['content-disposition']).toBe(
      `inline; filename="Folha-de-campo-OS-2026-0456.pdf"; filename*=UTF-8''Folha-de-campo-OS-2026-0456.pdf`,
    )
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    const numero = r.headers['x-folha-campo']
    expect(numero).toBe(`FC-${ano}-00001`)

    // Reimprimir mantém o nº; o detalhe da calibração mostra a folha
    const deNovo = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(deNovo.headers['x-folha-campo']).toBe(numero)
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.folhaCampo).toMatchObject({ numero, impressaPor: 'Comum Teste', impressoes: 2 })

    // Outra calibração, outro nº
    const outra = await rascunho('')
    const r2 = await t.chamar('GET', `/api/calibracoes/${outra.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(r2.headers['x-folha-campo']).toBe(`FC-${ano}-00002`)
    expect(r2.headers['content-disposition']).toContain(`filename="Folha-de-campo-FC-${ano}-00002.pdf"`)
    expect((await t.chamar('GET', `/api/calibracoes/${outra.id}`, { cookie: t.cookieAdmin })).json().folhaCampo).toMatchObject({
      numero: `FC-${ano}-00002`,
      impressoes: 1,
    })
  })

  it.runIf(temPdftotext)('traz o cliente, a balança, a OS, o técnico e os padrões do rascunho', async () => {
    const k = await rascunho()
    const r = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    const texto = textoDoPdf(r.rawPayload)
    expect(texto).toContain(`FC-${ano}-00001`)
    expect(texto).toContain('OS 2026/0456')
    expect(texto).toContain('MERCADO BOM PRECO LTDA')
    expect(texto).toContain('TL-2231')
    expect(texto).toContain('JP-01')
    expect(texto).toContain('Admin Teste')
    // Sem calibração anterior: pontos sugeridos pelo sistema, até Max
    expect(texto).toContain('pontos, cargas e posições sugeridos pelo sistema')
    expect(texto).toMatch(/30,00/)
  })

  it('a de um certificado emitido é a reimpressão da folha planejada, com o mesmo nº', async () => {
    const k = await rascunho()
    // Impressa antes da visita
    const antes = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieComum })
    expect(antes.statusCode, antes.body).toBe(200)
    const peca = (pesoId: string) => ({ padraoId: pesos.id, pesoId, quantidade: 1 })
    const ponto = (id: string, carga: number, pecas: string[], leitura: number) => ({
      id,
      carga,
      pecas: pecas.map(peca),
      pecasManuais: true,
      crescente: leitura,
      decrescente: leitura,
      nivelSubstituicao: 0,
    })
    const dados: CalibracaoInput = {
      ...k,
      ambiente: { temperaturaInicial: 22.1, temperaturaFinal: 22.6, umidadeInicial: 55, umidadeFinal: 57, pressao: null },
      repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15, 15.01, 15, 15, 15] }],
      excentricidade: {
        aplicavel: true,
        motivo: '',
        carga: 10,
        metodo: 1,
        posicoes: ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita'].map((rotulo) => ({
          rotulo,
          leitura: 10,
          referencia: null,
        })),
      },
      indicacao: {
        metodo: 'CRESCENTE_DECRESCENTE',
        retornoZero: 0,
        substituicao: { ativa: false, pecas: [], etapas: [] },
        pontos: [
          ponto('a', 5, ['p5'], 5),
          ponto('b', 10, ['p10a'], 10),
          ponto('c', 20, ['p10a', 'p10b'], 20.01),
          ponto('d', 30, ['p10a', 'p10b', 'p10c'], 30.01),
        ],
      },
    }
    const salvo = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...dados, versao: k.versao },
    })
    expect(salvo.statusCode, salvo.body).toBe(200)
    const emitida = await t.chamar('POST', `/api/calibracoes/${k.id}/emitir`, {
      cookie: t.cookieAdmin,
      payload: { versao: salvo.json().calibracao.versao },
    })
    expect(emitida.statusCode, emitida.body).toBe(200)
    // O cadastro muda depois da emissão: a folha reimpressa usa a cópia congelada (a do certificado)
    await t.chamar('PUT', `/api/balancas/${balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...balanca, numeroSerie: 'OUTRO', versao: balanca.versao },
    })
    const r = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieComum })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.headers['x-folha-campo']).toBe(antes.headers['x-folha-campo'])
    if (temPdftotext) {
      const texto = textoDoPdf(r.rawPayload)
      expect(texto).toContain('TL-2231')
      expect(texto).not.toContain('OUTRO')
      // Nunca as leituras; o nº do certificado é o reservado na primeira impressão (o da etiqueta), com que
      // ele foi emitido
      expect(texto).toContain(emitida.json().calibracao.numero)
      expect(texto).not.toContain('20,01')
    }
  })

  it('certificado emitido sem folha: 409, sem reservar nº (não vira registro da calibração)', async () => {
    const k = await rascunho()
    const peca = { padraoId: pesos.id, pesoId: 'p10a', quantidade: 1 }
    const dados: CalibracaoInput = {
      ...k,
      ambiente: { temperaturaInicial: 22, temperaturaFinal: 22.4, umidadeInicial: 50, umidadeFinal: 52, pressao: null },
      repetibilidade: [{ id: 'r1', carga: 10, leituras: [10, 10, 10, 10, 10] }],
      excentricidade: { aplicavel: false, motivo: 'Prato pequeno', carga: 0, metodo: 1, posicoes: [] },
      indicacao: {
        metodo: 'CONTINUO',
        retornoZero: 0,
        substituicao: { ativa: false, pecas: [], etapas: [] },
        pontos: [
          { id: 'a', carga: 10, pecas: [peca], pecasManuais: true, crescente: 10, decrescente: null, nivelSubstituicao: 0 },
        ],
      },
    }
    const salvo = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...dados, versao: k.versao },
    })
    expect(salvo.statusCode, salvo.body).toBe(200)
    const emitida = await t.chamar('POST', `/api/calibracoes/${k.id}/emitir`, {
      cookie: t.cookieAdmin,
      payload: { versao: salvo.json().calibracao.versao },
    })
    expect(emitida.statusCode, emitida.body).toBe(200)
    const r = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toMatch(/sem folha de campo/)
    expect((await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().folhaCampo).toBeNull()
    // O próximo nº continua sendo o 1: nada foi reservado
    expect((await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieAdmin })).headers['x-folha-campo']).toBe(
      `FC-${ano}-00001`,
    )
  })

  it('calibração que não existe: 404; sem sessão: 401', async () => {
    expect((await t.chamar('GET', '/api/calibracoes/nao-existe/folha-campo', { cookie: t.cookieAdmin })).statusCode).toBe(404)
    const k = await rascunho()
    const r = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`)
    expect(r.statusCode).toBe(401)
    // Aberta direto no navegador (nova aba), a sessão vencida responde com uma página, não com JSON
    const html = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { headers: { accept: 'text/html' } })
    expect(html.statusCode).toBe(401)
    expect(html.headers['content-type']).toContain('text/html')
  })
})

describe('folha de campo sem calibração', { timeout: 30_000 }, () => {
  it('em branco: PDF com nº novo a cada pedido; a mesma chave devolve o mesmo nº', async () => {
    const a = await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieComum })
    expect(a.statusCode, a.body).toBe(200)
    expect(a.headers['content-type']).toBe('application/pdf')
    expect(a.headers['x-folha-campo']).toBe(`FC-${ano}-00001`)
    expect(a.headers['content-disposition']).toContain(`inline; filename="Folha-de-campo-FC-${ano}-00001.pdf"`)
    const b = await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieComum })
    expect(b.headers['x-folha-campo']).toBe(`FC-${ano}-00002`)
    const chave = 'f0a1b2c3-d4e5-4f60-8a9b-0c1d2e3f4a5b'
    const c1 = await t.chamar('GET', `/api/folha-campo?chave=${chave}`, { cookie: t.cookieComum })
    const c2 = await t.chamar('GET', `/api/folha-campo?chave=${chave}`, { cookie: t.cookieComum })
    expect(c1.headers['x-folha-campo']).toBe(`FC-${ano}-00003`)
    expect(c2.headers['x-folha-campo']).toBe(`FC-${ano}-00003`)
    expect((await t.chamar('GET', '/api/folha-campo?chave=curta', { cookie: t.cookieComum })).statusCode).toBe(400)
    if (temPdftotext) {
      const texto = textoDoPdf(a.rawPayload)
      expect(texto).toContain('Folha em branco, para balança ainda não cadastrada')
      expect(texto).toContain('JP-01')
      expect(texto).not.toContain('MERCADO BOM PRECO')
    }
  })

  it('da balança: o cliente dela e o plano que o rascunho teria', async () => {
    const r = await t.chamar('GET', `/api/folha-campo?balancaId=${balanca.id}`, { cookie: t.cookieAdmin })
    expect(r.statusCode, r.body).toBe(200)
    if (temPdftotext) {
      const texto = textoDoPdf(r.rawPayload)
      expect(texto).toContain('MERCADO BOM PRECO LTDA')
      expect(texto).toContain('TL-2231')
      expect(texto).toContain('pontos, cargas e posições sugeridos pelo sistema')
    }
    // Nenhum rascunho é criado
    expect((await t.chamar('GET', '/api/calibracoes', { cookie: t.cookieAdmin })).json().total).toBe(0)
  })

  it('do cliente, com a balança em branco', async () => {
    const r = await t.chamar('GET', `/api/folha-campo?clienteId=${cliente.id}`, { cookie: t.cookieAdmin })
    expect(r.statusCode, r.body).toBe(200)
    if (temPdftotext) {
      const texto = textoDoPdf(r.rawPayload)
      expect(texto).toContain('MERCADO BOM PRECO LTDA')
      expect(texto).toContain('cadastre a balança antes')
    }
  })

  it('balança ou cliente que não existem: 404; balança de outro cliente: 400; sem sessão: 401', async () => {
    const outro = (await criar('/api/clientes', { ...CLIENTE_VAZIO, tipo: 'PF', nome: 'Outro Cliente' })).cliente as Cliente
    const chamar = (url: string, cookie: string | null = t.cookieAdmin) => t.chamar('GET', url, { cookie })
    expect((await chamar('/api/folha-campo?balancaId=nao-existe')).statusCode).toBe(404)
    expect((await chamar('/api/folha-campo?clienteId=nao-existe')).statusCode).toBe(404)
    expect((await chamar(`/api/folha-campo?balancaId=${balanca.id}&clienteId=${outro.id}`)).statusCode).toBe(400)
    expect((await chamar(`/api/folha-campo?balancaId=${balanca.id}&clienteId=${cliente.id}`)).statusCode).toBe(200)
    expect((await chamar('/api/folha-campo', null)).statusCode).toBe(401)
  })
})

describe('folha avulsa ligada à calibração digitada', { timeout: 30_000 }, () => {
  const ligar = (id: string, numero: unknown, cookie = t.cookieComum) =>
    t.chamar('PUT', `/api/calibracoes/${id}/folha-campo`, { cookie, payload: { numero } })

  it('em branco: o nº do papel passa a ser o da calibração, no detalhe e na reimpressão', async () => {
    const avulsa = await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieComum })
    const numero = avulsa.headers['x-folha-campo'] as string
    const k = await rascunho()
    // Como o técnico digitaria: minúsculas, espaços e sem os zeros à esquerda
    const r = await ligar(k.id, `fc ${ano} 1`)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().folhaCampo).toMatchObject({ numero })
    expect((await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().folhaCampo).toMatchObject({
      numero,
    })
    // Imprimir pela calibração reimprime com o nº que está no papel, sem reservar outro
    const pelaCalibracao = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(pelaCalibracao.headers['x-folha-campo']).toBe(numero)
    // Ligar de novo o mesmo nº: nada muda
    expect((await ligar(k.id, numero)).statusCode).toBe(200)
  })

  it('troca a folha impressa pelo assistente pela que foi usada no local', async () => {
    const k = await rascunho()
    const doAssistente = (await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })).headers[
      'x-folha-campo'
    ]
    const daBalanca = (await t.chamar('GET', `/api/folha-campo?balancaId=${balanca.id}`, { cookie: t.cookieAdmin })).headers[
      'x-folha-campo'
    ] as string
    expect(daBalanca).not.toBe(doAssistente)
    expect((await ligar(k.id, daBalanca)).statusCode).toBe(200)
    expect((await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().folhaCampo.numero).toBe(
      daBalanca,
    )
    expect(
      (await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })).headers['x-folha-campo'],
    ).toBe(daBalanca)
  })

  it('recusa nº inválido (400), que não existe (404) e de outra calibração (409); outra balança ou cliente, só confirmando', async () => {
    const k = await rascunho()
    expect((await ligar(k.id, '')).statusCode).toBe(400)
    expect((await ligar(k.id, 'abc')).statusCode).toBe(400)
    expect((await ligar(k.id, 42)).statusCode).toBe(400)
    expect((await ligar(k.id, `FC-${ano}-00999`)).statusCode).toBe(404)
    expect((await ligar('nao-existe', `FC-${ano}-00001`)).statusCode).toBe(404)

    // Já é de outra calibração
    const outra = await rascunho('OS 2')
    const daOutra = (await t.chamar('GET', `/api/calibracoes/${outra.id}/folha-campo`, { cookie: t.cookieAdmin })).headers[
      'x-folha-campo'
    ]
    const r = await ligar(k.id, daOutra)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toMatch(/outra calibração/)

    // Impressa para outra balança ou outro cliente
    const outroCliente = (await criar('/api/clientes', { ...CLIENTE_VAZIO, tipo: 'PF', nome: 'Outro Cliente' }))
      .cliente as Cliente
    const outraBalanca = (
      await criar('/api/balancas', {
        ...BALANCA_VAZIA,
        clienteId: cliente.id,
        numeroSerie: 'X-1',
        faixas: [{ max: 15, e: 0.005, d: 0.005 }],
      })
    ).balanca as Balanca
    const daOutraBalanca = (await t.chamar('GET', `/api/folha-campo?balancaId=${outraBalanca.id}`, { cookie: t.cookieAdmin }))
      .headers['x-folha-campo']
    const r2 = await ligar(k.id, daOutraBalanca)
    expect(r2.statusCode).toBe(409)
    expect(r2.json()).toMatchObject({ codigo: 'CONFIRMAR_FOLHA' })
    expect(r2.json().erro).toMatch(/foi impressa para a balança nº de série X-1\. Confira o nº/)
    const doOutroCliente = (await t.chamar('GET', `/api/folha-campo?clienteId=${outroCliente.id}`, { cookie: t.cookieAdmin }))
      .headers['x-folha-campo']
    const r3 = await ligar(k.id, doOutroCliente)
    expect(r3.statusCode).toBe(409)
    expect(r3.json()).toMatchObject({ codigo: 'CONFIRMAR_FOLHA' })
    expect(r3.json().erro).toMatch(/para o cliente Outro Cliente/)
    // Nada mudou sem a confirmação
    expect((await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().folhaCampo).toBeNull()

    // Sem sessão
    expect((await t.chamar('PUT', `/api/calibracoes/${k.id}/folha-campo`, { payload: { numero: daOutra } })).statusCode).toBe(401)
  })

  it('o nº como o técnico digita', () => {
    expect(numeroDaFolha('FC-2026-00042')).toBe('FC-2026-00042')
    expect(numeroDaFolha(' fc 2026 42 ')).toBe('FC-2026-00042')
    expect(numeroDaFolha('2026-42')).toBe('FC-2026-00042')
    expect(numeroDaFolha('FC-2026')).toBe('')
    expect(numeroDaFolha('FC-2026-123456')).toBe('')
    expect(numeroDaFolha(null)).toBe('')
  })
})

/** Preenche o rascunho com leituras que passam na conferência e emite o certificado. */
async function emitir(k: Calibracao): Promise<Calibracao> {
  const peca = (pesoId: string) => ({ padraoId: pesos.id, pesoId, quantidade: 1 })
  const ponto = (id: string, carga: number, pecas: string[], leitura: number) => ({
    id,
    carga,
    pecas: pecas.map(peca),
    pecasManuais: true,
    crescente: leitura,
    decrescente: leitura,
    nivelSubstituicao: 0,
  })
  const dados: CalibracaoInput = {
    ...k,
    ambiente: { temperaturaInicial: 22.1, temperaturaFinal: 22.6, umidadeInicial: 55, umidadeFinal: 57, pressao: null },
    repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15, 15.01, 15, 15, 15] }],
    excentricidade: { aplicavel: false, motivo: 'Prato pequeno', carga: 0, metodo: 1, posicoes: [] },
    indicacao: {
      metodo: 'CRESCENTE_DECRESCENTE',
      retornoZero: 0,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: [ponto('a', 10, ['p10a'], 10), ponto('b', 30, ['p10a', 'p10b', 'p10c'], 30.01)],
    },
  }
  const salvo = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
    cookie: t.cookieAdmin,
    payload: { ...dados, versao: k.versao },
  })
  expect(salvo.statusCode, salvo.body).toBe(200)
  const r = await t.chamar('POST', `/api/calibracoes/${k.id}/emitir`, {
    cookie: t.cookieAdmin,
    payload: { versao: salvo.json().calibracao.versao },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().calibracao
}

describe('nº controlado da folha: reimpressão, rascunho excluído, revisão e folha nova', { timeout: 60_000 }, () => {
  const folhaDe = (id: string, query = '') =>
    t.chamar('GET', `/api/calibracoes/${id}/folha-campo${query}`, { cookie: t.cookieAdmin })
  const ligar = (id: string, numero: string) =>
    t.chamar('PUT', `/api/calibracoes/${id}/folha-campo`, { cookie: t.cookieAdmin, payload: { numero } })
  const detalhe = async (id: string) => (await t.chamar('GET', `/api/calibracoes/${id}`, { cookie: t.cookieAdmin })).json()

  it('a reimpressão é o arquivo da primeira impressão, byte a byte, mesmo com o plano mudado depois', async () => {
    const k = await rascunho()
    const primeira = await folhaDe(k.id)
    // O plano muda depois de impressa (outra OS): o papel com este nº continua sendo o da primeira impressão
    const mudado = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...k, ordemServico: 'OS OUTRA', versao: k.versao },
    })
    expect(mudado.statusCode, mudado.body).toBe(200)
    const segunda = await folhaDe(k.id)
    expect(segunda.headers['x-folha-campo']).toBe(primeira.headers['x-folha-campo'])
    expect(segunda.rawPayload.equals(primeira.rawPayload)).toBe(true)
    // Emitido: a mesma folha, ainda igual à que foi a campo (não remontada com os dados finais)
    await emitir((await detalhe(k.id)).calibracao)
    expect((await folhaDe(k.id)).rawPayload.equals(primeira.rawPayload)).toBe(true)
  })

  it('folha avulsa ligada: imprimir pela calibração devolve a folha como foi a campo (em branco), com o mesmo nº', async () => {
    const avulsa = await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieAdmin })
    const numero = avulsa.headers['x-folha-campo'] as string
    const k = await rascunho()
    expect((await ligar(k.id, numero)).statusCode).toBe(200)
    const pelaCalibracao = await folhaDe(k.id)
    expect(pelaCalibracao.headers['x-folha-campo']).toBe(numero)
    expect(pelaCalibracao.rawPayload.equals(avulsa.rawPayload)).toBe(true)
  })

  it('rascunho excluído: a folha dele pode ser ligada à calibração refeita', async () => {
    const k = await rascunho()
    const numero = (await folhaDe(k.id)).headers['x-folha-campo'] as string
    expect((await t.chamar('DELETE', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(204)
    // Solta na mesma gravação que apagou o rascunho; o registro da impressão continua
    expect(folhaNoBanco(numero)).toMatchObject({ calibracao_id: '', substituida_por: '' })
    const refeita = await rascunho()
    const r = await ligar(refeita.id, numero)
    expect(r.statusCode, r.body).toBe(200)
    expect((await detalhe(refeita.id)).folhaCampo).toMatchObject({ numero })
    // E a reimpressão pela calibração refeita é o mesmo nº, sem reservar outro
    expect((await folhaDe(refeita.id)).headers['x-folha-campo']).toBe(numero)
  })

  it('folha presa a uma calibração que não existe mais (rascunho excluído numa versão antiga): é aceita', async () => {
    const k = await rascunho()
    const numero = (await folhaDe(k.id)).headers['x-folha-campo'] as string
    // Como ficava antes da correção: a folha apontando para um id apagado
    t.ctx.db.prepare("UPDATE folhas_campo SET calibracao_id = 'apagada' WHERE numero = ?").run(numero)
    const outra = await rascunho('OS 2')
    const r = await ligar(outra.id, numero)
    expect(r.statusCode, r.body).toBe(200)
    expect(folhaNoBanco(numero)).toMatchObject({ calibracao_id: outra.id })
    // Excluir uma calibração emitida é recusado e não solta a folha dela
    const emitida = await emitir((await detalhe(outra.id)).calibracao)
    expect((await t.chamar('DELETE', `/api/calibracoes/${emitida.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(409)
    expect(folhaNoBanco(numero)).toMatchObject({ calibracao_id: outra.id })
  })

  it('revisão de certificado: usa a folha do original (a mesma visita), sem reservar nº novo', async () => {
    const k = await rascunho()
    const original = await folhaDe(k.id)
    const numero = original.headers['x-folha-campo'] as string
    await emitir((await detalhe(k.id)).calibracao)
    const rev = await t.chamar('POST', `/api/calibracoes/${k.id}/revisar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Corrigir o endereço' },
    })
    expect(rev.statusCode, rev.body).toBe(201)
    const revisao = rev.json().calibracao as Calibracao
    expect((await detalhe(revisao.id)).folhaCampo).toMatchObject({ numero, herdada: true })
    expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero, herdada: false })
    // Imprimir pela revisão: a folha do original, a mesma
    const pelaRevisao = await folhaDe(revisao.id)
    expect(pelaRevisao.headers['x-folha-campo']).toBe(numero)
    expect(pelaRevisao.rawPayload.equals(original.rawPayload)).toBe(true)
    // Folha nova numa revisão: recusada (a visita é a do original), sem reservar nº
    const nova = await folhaDe(revisao.id, '?nova=a1b2c3d4-0000-4000-8000-00000000000a')
    expect(nova.statusCode).toBe(409)
    expect(nova.json().erro).toMatch(/certificado revisado/)
    // Ligar o nº do original à revisão: aceito (é a mesma visita); o original continua com ela
    const ligada = await ligar(revisao.id, numero)
    expect(ligada.statusCode, ligada.body).toBe(200)
    expect(ligada.json().folhaCampo).toMatchObject({ numero, herdada: true })
    expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero })
    expect(folhaNoBanco(numero)).toMatchObject({ calibracao_id: k.id, substituida_por: '' })
    // Emitida a revisão, o detalhe dela continua mostrando a folha do original
    const revEmitida = await emitir((await detalhe(revisao.id)).calibracao)
    expect((await detalhe(revEmitida.id)).folhaCampo).toMatchObject({ numero, herdada: true })
    expect((await folhaDe(revEmitida.id)).rawPayload.equals(original.rawPayload)).toBe(true)
    // Nenhum nº novo foi reservado
    expect((await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieAdmin })).headers['x-folha-campo']).toBe(
      `FC-${ano}-00002`,
    )
  })

  it('folha nova (plano mudou antes da visita): nº novo; a de antes fica registrada como substituída', async () => {
    const k = await rascunho()
    const primeira = await folhaDe(k.id)
    const antes = primeira.headers['x-folha-campo'] as string
    const chave = 'a1b2c3d4-0000-4000-8000-000000000001'
    const nova = await folhaDe(k.id, `?nova=${chave}`)
    expect(nova.statusCode, nova.body).toBe(200)
    const numero = nova.headers['x-folha-campo'] as string
    expect(numero).not.toBe(antes)
    // O navegador pedindo de novo (a mesma chave): o mesmo nº e o mesmo arquivo
    const deNovo = await folhaDe(k.id, `?nova=${chave}`)
    expect(deNovo.headers['x-folha-campo']).toBe(numero)
    expect(deNovo.rawPayload.equals(nova.rawPayload)).toBe(true)
    expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero, herdada: false, substituidas: [antes] })
    expect((await folhaDe(k.id)).headers['x-folha-campo']).toBe(numero)
    // A de antes continua no banco, da mesma calibração, marcada como substituída pela nova (não usada)
    expect(folhaNoBanco(antes)).toMatchObject({ calibracao_id: k.id, substituida_por: numero })
    expect(folhaNoBanco(antes)!.substituida_em).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(folhaNoBanco(numero)).toMatchObject({ calibracao_id: k.id, substituida_por: '' })
    // O registro de atividades guarda a troca (só a folha nova; a reimpressão não é alteração)
    expect(registrosDaFolha()).toEqual([
      ['ALTERACAO', k.id, `GET /api/calibracoes/:id/folha-campo | ${numero} no lugar da ${antes}`],
    ])
    // A de antes foi a campo, afinal: liga de novo, e a nova é que fica como substituída
    expect((await ligar(k.id, antes)).statusCode).toBe(200)
    expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero: antes, substituidas: [numero] })
    expect(folhaNoBanco(numero)).toMatchObject({ calibracao_id: k.id, substituida_por: antes })
    expect((await folhaDe(k.id)).rawPayload.equals(primeira.rawPayload)).toBe(true)
    expect(registrosDaFolha().at(-1)).toEqual([
      'ALTERACAO',
      k.id,
      `PUT /api/calibracoes/:id/folha-campo | ${antes} no lugar da ${numero}`,
    ])
    // Chave inválida (400) e calibração emitida (409)
    expect((await folhaDe(k.id, '?nova=x')).statusCode).toBe(400)
    await emitir((await detalhe(k.id)).calibracao)
    expect((await folhaDe(k.id, `?nova=${chave.replace(/1$/, '2')}`)).statusCode).toBe(409)
  })
})

describe(
  'folha de outra calibração, de certificado cancelado, de revisão sem folha e de cadastro mudado',
  { timeout: 60_000 },
  () => {
    const folhaDe = (id: string, query = '') =>
      t.chamar('GET', `/api/calibracoes/${id}/folha-campo${query}`, { cookie: t.cookieAdmin })
    const ligar = (id: string, numero: string, confirmar?: boolean) =>
      t.chamar('PUT', `/api/calibracoes/${id}/folha-campo`, {
        cookie: t.cookieAdmin,
        payload: { numero, ...(confirmar ? { confirmar } : {}) },
      })
    const detalhe = async (id: string) => (await t.chamar('GET', `/api/calibracoes/${id}`, { cookie: t.cookieAdmin })).json()
    const revisar = async (id: string) => {
      const r = await t.chamar('POST', `/api/calibracoes/${id}/revisar`, {
        cookie: t.cookieAdmin,
        payload: { motivo: 'Corrigir o endereço' },
      })
      expect(r.statusCode, r.body).toBe(201)
      return r.json().calibracao as Calibracao
    }
    const proximoNumero = async () =>
      (await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieAdmin })).headers['x-folha-campo'] as string

    it('folha substituída de um certificado emitido: não passa para outra calibração nem para a revisão dele', async () => {
      const a = await rascunho()
      const fc1 = (await folhaDe(a.id)).headers['x-folha-campo'] as string
      const fc2 = (await folhaDe(a.id, '?nova=a1b2c3d4-0000-4000-8000-0000000000b1')).headers['x-folha-campo'] as string
      await emitir((await detalhe(a.id)).calibracao)
      const b = await rascunho('OS 2')
      const r = await ligar(b.id, fc1)
      expect(r.statusCode).toBe(409)
      expect(r.json().erro).toMatch(/já é de outra calibração \(CC-/)
      // O histórico do emitido não muda
      expect((await detalhe(a.id)).folhaCampo).toMatchObject({ numero: fc2, substituidas: [fc1] })
      expect(folhaNoBanco(fc1)).toMatchObject({ calibracao_id: a.id, substituida_por: fc2 })
      // A revisão do emitido usa a vigente dele; a substituída lá (não usada) não vira a da revisão
      const rev = await revisar(a.id)
      const r2 = await ligar(rev.id, fc1)
      expect(r2.statusCode).toBe(409)
      expect(r2.json().erro).toMatch(/trocada por outra no certificado revisado/)
      expect((await detalhe(rev.id)).folhaCampo).toMatchObject({ numero: fc2, herdada: true })
      expect(folhaNoBanco(fc1)).toMatchObject({ calibracao_id: a.id, substituida_por: fc2 })
    })

    it('revisão de certificado feito sem folha: não reserva nº novo (é a mesma visita); a avulsa de uma visita nova liga', async () => {
      const c = await rascunho()
      await emitir((await detalhe(c.id)).calibracao)
      expect((await folhaDe(c.id)).statusCode).toBe(409)
      const rev = await revisar(c.id)
      expect(rev.status).toBe('RASCUNHO')
      const r = await folhaDe(rev.id)
      expect(r.statusCode).toBe(409)
      expect(r.headers['x-folha-campo']).toBeUndefined()
      expect(r.json().erro).toMatch(/O certificado revisado foi feito sem folha de campo/)
      expect((await folhaDe(rev.id, '?nova=a1b2c3d4-0000-4000-8000-0000000000c1')).statusCode).toBe(409)
      expect(folhasNoBanco()).toEqual([])
      expect(() => t.ctx.repo.reservarFolhaCampo({ chave: `calibracao:${rev.id}`, calibracaoId: rev.id, por: 'Ana' })).toThrow(
        /não tem folha de campo/,
      )
      expect((await detalhe(rev.id)).folhaCampo).toBeNull()
      // Houve visita nova, com uma folha avulsa: ela liga à revisão
      const avulsa = await proximoNumero()
      expect(avulsa).toBe(`FC-${ano}-00001`)
      expect((await ligar(rev.id, avulsa)).statusCode).toBe(200)
      expect((await folhaDe(rev.id)).headers['x-folha-campo']).toBe(avulsa)
    })

    it('certificado cancelado: a calibração refeita a partir do mesmo papel fica com a folha, e o registro diz de onde veio', async () => {
      const a = await rascunho()
      const fc = (await folhaDe(a.id)).headers['x-folha-campo'] as string
      const emitido = await emitir((await detalhe(a.id)).calibracao)
      const cancelado = await t.chamar('POST', `/api/calibracoes/${a.id}/cancelar`, {
        cookie: t.cookieAdmin,
        payload: { motivo: 'Balança errada no certificado', versao: emitido.versao },
      })
      expect(cancelado.statusCode, cancelado.body).toBe(200)
      const refeita = await rascunho('OS 2')
      const r = await ligar(refeita.id, fc)
      expect(r.statusCode, r.body).toBe(200)
      expect(r.json().folhaCampo).toMatchObject({ numero: fc, herdada: false })
      expect(folhaNoBanco(fc)).toMatchObject({ calibracao_id: refeita.id, substituida_por: '' })
      expect(registrosDaFolha().at(-1)).toEqual([
        'ALTERACAO',
        refeita.id,
        `PUT /api/calibracoes/:id/folha-campo | ${fc} (era do ${emitido.numero}, cancelado)`,
      ])
    })

    it('impressa para uma balança duplicada que foi excluída: liga confirmando, e o registro guarda', async () => {
      const duplicada = (
        await criar('/api/balancas', {
          ...BALANCA_VAZIA,
          clienteId: cliente.id,
          numeroSerie: 'TL-2231-dup',
          faixas: [{ max: 30, e: 0.01, d: 0.01 }],
        })
      ).balanca as Balanca
      const fc = (await t.chamar('GET', `/api/folha-campo?balancaId=${duplicada.id}`, { cookie: t.cookieAdmin })).headers[
        'x-folha-campo'
      ] as string
      expect((await t.chamar('DELETE', `/api/balancas/${duplicada.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(204)
      const k = await rascunho()
      const r = await ligar(k.id, fc)
      expect(r.statusCode).toBe(409)
      expect(r.json()).toMatchObject({ codigo: 'CONFIRMAR_FOLHA' })
      expect(r.json().erro).toMatch(/impressa para uma balança que foi excluída/)
      const ok = await ligar(k.id, fc, true)
      expect(ok.statusCode, ok.body).toBe(200)
      expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero: fc })
      expect(registrosDaFolha().at(-1)?.[2]).toBe(
        `PUT /api/calibracoes/:id/folha-campo | ${fc} (impressa para uma balança que foi excluída)`,
      )
    })

    it('rascunho com a balança errada excluído e refeito com a certa: liga confirmando', async () => {
      const errada = (
        await criar('/api/balancas', {
          ...BALANCA_VAZIA,
          clienteId: cliente.id,
          fabricante: 'Filizola',
          modelo: 'ID-M',
          numeroSerie: 'FZ-9',
          faixas: [{ max: 30, e: 0.01, d: 0.01 }],
        })
      ).balanca as Balanca
      const k = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: errada.id, ordemServico: 'OS 9' }))
        .calibracao as Calibracao
      const fc = (await folhaDe(k.id)).headers['x-folha-campo'] as string
      expect((await t.chamar('DELETE', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(204)
      const refeita = await rascunho('OS 9')
      const r = await ligar(refeita.id, fc)
      expect(r.statusCode).toBe(409)
      expect(r.json().erro).toBe(
        `A folha ${fc} foi impressa para a balança Filizola ID-M, nº de série FZ-9. Confira o nº no alto da folha; se é ela mesmo, ligue assim mesmo.`,
      )
      expect((await ligar(refeita.id, fc, true)).statusCode).toBe(200)
      expect(folhaNoBanco(fc)).toMatchObject({ calibracao_id: refeita.id })
    })

    it('balança que passou para outro cliente depois da impressão: liga sem perguntar (é a mesma balança)', async () => {
      const outro = (await criar('/api/clientes', { ...CLIENTE_VAZIO, tipo: 'PF', nome: 'Antigo Dono' })).cliente as Cliente
      const transferida = (
        await criar('/api/balancas', {
          ...BALANCA_VAZIA,
          clienteId: outro.id,
          numeroSerie: 'TR-1',
          faixas: [{ max: 30, e: 0.01, d: 0.01 }],
        })
      ).balanca as Balanca
      const fc = (await t.chamar('GET', `/api/folha-campo?balancaId=${transferida.id}`, { cookie: t.cookieAdmin })).headers[
        'x-folha-campo'
      ] as string
      const mudou = await t.chamar('PUT', `/api/balancas/${transferida.id}`, {
        cookie: t.cookieAdmin,
        payload: { ...transferida, clienteId: cliente.id },
      })
      expect(mudou.statusCode, mudou.body).toBe(200)
      const k = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: transferida.id })).calibracao as Calibracao
      const r = await ligar(k.id, fc)
      expect(r.statusCode, r.body).toBe(200)
      expect(registrosDaFolha().at(-1)?.[2]).toBe(
        `PUT /api/calibracoes/:id/folha-campo | ${fc} (impressa quando a balança era do cliente Antigo Dono)`,
      )
    })
  },
)

describe('repositório: histórico das folhas de campo', { timeout: 30_000 }, () => {
  const reservar = (calibracaoId: string, chave: string, nova = false) =>
    t.ctx.repo.reservarFolhaCampo({ chave, calibracaoId, balancaId: balanca.id, clienteId: cliente.id, por: 'Ana', nova })

  it('folha nova: a de antes fica substituída (devolvida para o registro); sem folha antes, nada a substituir', async () => {
    const k = await rascunho()
    const primeira = reservar(k.id, `calibracao:${k.id}`, true)
    expect(primeira).toMatchObject({ nova: true, substituiu: [], pdf: null })
    const segunda = reservar(k.id, `calibracao:${k.id}:x1`, true)
    expect(segunda.substituiu).toEqual([primeira.numero])
    const terceira = reservar(k.id, `calibracao:${k.id}:x2`, true)
    expect(terceira.substituiu).toEqual([segunda.numero])
    expect(t.ctx.repo.folhaCampoDaCalibracao(k.id)).toMatchObject({
      numero: terceira.numero,
      substituidas: [primeira.numero, segunda.numero],
    })
    // Reimprimir (sem `nova`): a vigente, a mais nova, contando a impressão
    expect(reservar(k.id, `calibracao:${k.id}`)).toMatchObject({ numero: terceira.numero, nova: false, impressoes: 2 })
  })

  it('a folha de outra calibração que existe é recusada, vigente ou substituída nela (o histórico dela não muda)', async () => {
    const k1 = await rascunho()
    const k2 = await rascunho('OS 2')
    const a = reservar(k1.id, `calibracao:${k1.id}`)
    const b = reservar(k1.id, `calibracao:${k1.id}:x1`, true)
    expect(() => t.ctx.repo.vincularFolhaCampo(b.numero, k2)).toThrow(/outra calibração/)
    expect(() => t.ctx.repo.vincularFolhaCampo(a.numero, k2)).toThrow(/outra calibração/)
    expect(t.ctx.repo.folhaCampoDaCalibracao(k1.id)).toMatchObject({ numero: b.numero, substituidas: [a.numero] })
    expect(t.ctx.repo.folhaCampoDaCalibracao(k2.id)).toBeNull()
    // A substituída volta para a própria calibração
    expect(t.ctx.repo.vincularFolhaCampo(a.numero, k1)).toMatchObject({ numero: a.numero, substituiu: [b.numero] })
  })

  it('ligar a avulsa no lugar da do assistente devolve a substituída; excluir o rascunho solta as duas', async () => {
    const k = await rascunho()
    const doAssistente = reservar(k.id, `calibracao:${k.id}`)
    const avulsa = t.ctx.repo.reservarFolhaCampo({ chave: 'avulsa:teste-0001', por: 'Ana' })
    const ligada = t.ctx.repo.vincularFolhaCampo(avulsa.numero, k)
    expect(ligada).toMatchObject({
      numero: avulsa.numero,
      substituiu: [doAssistente.numero],
      substituidas: [doAssistente.numero],
    })
    t.ctx.repo.excluirRascunho(k.id)
    expect(folhaNoBanco(doAssistente.numero)).toMatchObject({ calibracao_id: '' })
    expect(folhaNoBanco(avulsa.numero)).toMatchObject({ calibracao_id: '' })
    // Livre de novo: a calibração refeita fica com ela, como vigente
    const refeita = await rascunho()
    expect(t.ctx.repo.vincularFolhaCampo(doAssistente.numero, refeita)).toMatchObject({
      numero: doAssistente.numero,
      substituidas: [],
    })
    expect(folhaNoBanco(doAssistente.numero)).toMatchObject({ calibracao_id: refeita.id, substituida_por: '' })
  })

  it('revisão: herda a folha do original, e folha nova é recusada', async () => {
    const k = await rascunho()
    const daVisita = reservar(k.id, `calibracao:${k.id}`)
    await emitir((await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json().calibracao)
    const rev = (
      await t.chamar('POST', `/api/calibracoes/${k.id}/revisar`, {
        cookie: t.cookieAdmin,
        payload: { motivo: 'Corrigir o endereço' },
      })
    ).json().calibracao as Calibracao
    expect(t.ctx.repo.folhaCampoDaCalibracao(rev.id)).toMatchObject({ numero: daVisita.numero, herdada: true })
    expect(() => reservar(rev.id, `calibracao:${rev.id}:x1`, true)).toThrow(/certificado revisado/)
    expect(reservar(rev.id, `calibracao:${rev.id}`)).toMatchObject({ numero: daVisita.numero, nova: false })
    expect(folhasNoBanco()).toHaveLength(1)
  })
})

describe('correções da revisão: avulsa trocada, cancelado, revisão cancelada e PDF em arquivo', { timeout: 60_000 }, () => {
  const folhaDe = (id: string) => t.chamar('GET', `/api/calibracoes/${id}/folha-campo`, { cookie: t.cookieAdmin })
  const ligar = (id: string, numero: string, cookie = t.cookieAdmin) =>
    t.chamar('PUT', `/api/calibracoes/${id}/folha-campo`, { cookie, payload: { numero } })
  const detalhe = async (id: string) => (await t.chamar('GET', `/api/calibracoes/${id}`, { cookie: t.cookieAdmin })).json()
  const avulsa = async () =>
    (await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieAdmin })).headers['x-folha-campo'] as string
  const cancelar = async (k: Calibracao) => {
    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Balança errada no certificado', versao: k.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    return r.json().calibracao as Calibracao
  }
  const passagens = () =>
    t.ctx.db.prepare('SELECT numero, de_calibracao_id, para_calibracao_id FROM folhas_campo_passagens').all()

  it('avulsa ligada por engano e trocada fica livre: a calibração dona do papel liga sem 409', async () => {
    const [fc1, fc2] = [await avulsa(), await avulsa()]
    const k = await rascunho('OS 1')
    expect((await ligar(k.id, fc2)).statusCode).toBe(200)
    const troca = await ligar(k.id, fc1)
    expect(troca.statusCode, troca.body).toBe(200)
    expect(troca.json().folhaCampo).toMatchObject({ numero: fc1, substituidas: [] })
    expect(folhaNoBanco(fc2)).toMatchObject({ calibracao_id: '', substituida_por: '' })
    expect(registrosDaFolha().at(-1)?.[2]).toBe(
      `PUT /api/calibracoes/:id/folha-campo | ${fc1} no lugar da ${fc2}, que ficou livre`,
    )
    const dona = await rascunho('OS 5')
    expect((await ligar(dona.id, fc2)).statusCode).toBe(200)
    expect(folhaNoBanco(fc2)).toMatchObject({ calibracao_id: dona.id, substituida_por: '' })
  })

  it('avulsa presa como substituída noutra calibração em andamento (versão anterior): liga, e o registro diz de onde veio', async () => {
    const fc = await avulsa()
    const k = await rascunho('OS 7')
    t.ctx.db
      .prepare("UPDATE folhas_campo SET calibracao_id = ?, substituida_por = 'FC-X', substituida_em = 'x' WHERE numero = ?")
      .run(k.id, fc)
    const dona = await rascunho('OS 8')
    const r = await ligar(dona.id, fc)
    expect(r.statusCode, r.body).toBe(200)
    expect(registrosDaFolha().at(-1)?.[2]).toBe(
      `PUT /api/calibracoes/:id/folha-campo | ${fc} (estava como não usada em rascunho da OS 7, Mercado Bom Preço, balança nº de série TL-2231)`,
    )
  })

  it('409 diz qual calibração tem a folha, mesmo sem nº de certificado', async () => {
    const k = await rascunho('OS 2026/0456')
    const fc = (await folhaDe(k.id)).headers['x-folha-campo'] as string
    const outra = await rascunho('OS 9')
    const r = await ligar(outra.id, fc)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toBe(
      `A folha ${fc} já é de outra calibração (rascunho da OS 2026/0456, Mercado Bom Preço, balança nº de série TL-2231).`,
    )
  })

  it('certificado cancelado: só o administrador passa a folha; o cancelado continua mostrando-a e a recebe de volta', async () => {
    const d = await rascunho('OS 1')
    const fc = (await folhaDe(d.id)).headers['x-folha-campo'] as string
    const pdfDaVisita = (await folhaDe(d.id)).rawPayload
    const cancelado = await cancelar(await emitir((await detalhe(d.id)).calibracao))
    const refeita = await rascunho('OS 2')
    // O técnico (sem a permissão de cancelar) não mexe no registro do cancelado
    const comum = await ligar(refeita.id, fc, t.cookieComum)
    expect(comum.statusCode).toBe(403)
    expect(comum.json().erro).toBe(
      `A folha ${fc} é o registro dos dados brutos do certificado cancelado ${cancelado.numero}: só o administrador a passa para outra calibração.`,
    )
    expect(folhaNoBanco(fc)).toMatchObject({ calibracao_id: d.id })
    expect((await ligar(refeita.id, fc)).statusCode).toBe(200)
    expect(passagens()).toEqual([{ numero: fc, de_calibracao_id: d.id, para_calibracao_id: refeita.id }])
    // O cancelado continua com a folha no detalhe (e na reimpressão), dizendo para onde ela foi
    expect((await detalhe(d.id)).folhaCampo).toMatchObject({
      numero: fc,
      passouPara: 'rascunho da OS 2, Mercado Bom Preço, balança nº de série TL-2231',
    })
    expect((await folhaDe(d.id)).rawPayload.equals(pdfDaVisita)).toBe(true)
    expect((await detalhe(refeita.id)).folhaCampo).toMatchObject({ numero: fc })
    // Excluída a refeita, a folha volta para o cancelado (como estava nele)
    expect((await t.chamar('DELETE', `/api/calibracoes/${refeita.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(204)
    expect(folhaNoBanco(fc)).toMatchObject({ calibracao_id: d.id, substituida_por: '' })
    expect(passagens()).toEqual([])
    const voltou = (await detalhe(d.id)).folhaCampo
    expect(voltou).toMatchObject({ numero: fc })
    expect(voltou.passouPara).toBeUndefined()
    // Trocada na refeita por outra folha: também volta para o cancelado (não fica solta)
    const outraVez = await rascunho('OS 3')
    expect((await ligar(outraVez.id, fc)).statusCode).toBe(200)
    expect((await ligar(outraVez.id, await avulsa())).statusCode).toBe(200)
    expect(folhaNoBanco(fc)).toMatchObject({ calibracao_id: d.id, substituida_por: '' })
  })

  it('revisão emitida e depois cancelada: a calibração refeita fica com a folha da visita', async () => {
    const c = await rascunho('OS 1')
    const fc = (await folhaDe(c.id)).headers['x-folha-campo'] as string
    const emitido = await emitir((await detalhe(c.id)).calibracao)
    const rev = await t.chamar('POST', `/api/calibracoes/${c.id}/revisar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Corrigir o endereço' },
    })
    expect(rev.statusCode, rev.body).toBe(201)
    const r1 = await emitir(rev.json().calibracao as Calibracao)
    expect((await detalhe(c.id)).calibracao.status).toBe('SUBSTITUIDO')
    // Revisão emitida: a folha vale (409 com o nº que vale, o da revisão)
    const antes = await rascunho('OS 2')
    const recusada = await ligar(antes.id, fc)
    expect(recusada.statusCode).toBe(409)
    expect(recusada.json().erro).toBe(`A folha ${fc} já é de outra calibração (${r1.numero}).`)
    // Revisão cancelada: a cadeia toda terminou cancelada, e o papel da visita pode ser ligado à refeita
    await cancelar(r1)
    const r = await ligar(antes.id, fc)
    expect(r.statusCode, r.body).toBe(200)
    expect(registrosDaFolha().at(-1)?.[2]).toBe(`PUT /api/calibracoes/:id/folha-campo | ${fc} (era do ${r1.numero}, cancelado)`)
    expect(passagens()).toEqual([{ numero: fc, de_calibracao_id: c.id, para_calibracao_id: antes.id }])
    // A revisão cancelada (que usava a folha do original) continua mostrando-a
    expect((await detalhe(r1.id)).folhaCampo).toMatchObject({
      numero: fc,
      herdada: true,
      passouPara: expect.stringContaining('OS 2'),
    })
    expect(emitido.numero).not.toBe(r1.numero)
  })

  it('o PDF da folha fica num arquivo da pasta de dados (o sha256 no banco), e não no banco', async () => {
    const k = await rascunho()
    const r = await folhaDe(k.id)
    const numero = r.headers['x-folha-campo'] as string
    const linha = t.ctx.db.prepare('SELECT pdf, pdf_arquivo, pdf_sha256 FROM folhas_campo WHERE numero = ?').get(numero) as {
      pdf: Uint8Array | null
      pdf_arquivo: string
      pdf_sha256: string
    }
    expect(linha.pdf).toBeNull()
    expect(linha.pdf_arquivo).toBe(`${ano}/${numero}.pdf`)
    const arquivo = join(t.ctx.pastaDados, 'folhas-campo', linha.pdf_arquivo)
    expect(readFileSync(arquivo).equals(r.rawPayload)).toBe(true)
    expect(linha.pdf_sha256).toBe(createHash('sha256').update(r.rawPayload).digest('hex'))
    // Alterado ou sumido: erro claro (um PDF refeito não seria o mesmo papel)
    writeFileSync(arquivo, Buffer.concat([r.rawPayload, Buffer.from(' ')]))
    const alterado = await folhaDe(k.id)
    expect(alterado.statusCode).toBe(409)
    expect(alterado.json().erro).toMatch(/foi alterado depois da impressão/)
    rmSync(arquivo)
    const sumiu = await folhaDe(k.id)
    expect(sumiu.statusCode).toBe(409)
    expect(sumiu.json().erro).toBe(
      `O PDF da folha ${numero} não está na pasta de dados (folhas-campo/${ano}/${numero}.pdf). Volte essa pasta da cópia de segurança externa: um PDF refeito agora não seria o mesmo papel.`,
    )
  })

  it('o PDF guardado no banco (versão em teste) vai para a pasta quando o servidor sobe', async () => {
    const fc = t.ctx.repo.reservarFolhaCampo({ chave: 'avulsa:antiga-0001', por: 'Ana' }).numero
    const pdf = Buffer.from('%PDF-1.7 da versão em teste')
    t.ctx.db.prepare('UPDATE folhas_campo SET pdf = ? WHERE numero = ?').run(pdf, fc)
    expect(t.ctx.repo.moverPdfsDasFolhas()).toBe(1)
    expect(t.ctx.db.prepare('SELECT pdf, pdf_arquivo FROM folhas_campo WHERE numero = ?').get(fc)).toEqual({
      pdf: null,
      pdf_arquivo: `${ano}/${fc}.pdf`,
    })
    expect(readFileSync(join(t.ctx.pastaDados, 'folhas-campo', `${ano}/${fc}.pdf`)).equals(pdf)).toBe(true)
    expect(t.ctx.repo.moverPdfsDasFolhas()).toBe(0)
  })

  it('banco antigo posto no lugar sem levar as folhas: os nºs que têm PDF na pasta não são emitidos de novo', async () => {
    const [a, b] = [await avulsa(), await avulsa()]
    expect([a, b]).toEqual([`FC-${ano}-00001`, `FC-${ano}-00002`])
    expect(existsSync(join(t.ctx.pastaDados, 'folhas-campo', String(ano), `${b}.pdf`))).toBe(true)
    // Como uma cópia de antes das duas folhas, trocada à mão
    t.ctx.db.exec('DELETE FROM folhas_campo')
    expect(await avulsa()).toBe(`FC-${ano}-00003`)
  })
})

describe('banco restaurado de uma cópia antiga: as folhas impressas depois dela', { timeout: 60_000 }, () => {
  const folhaDe = (id: string, q = '') => t.chamar('GET', `/api/calibracoes/${id}/folha-campo${q}`, { cookie: t.cookieAdmin })
  const ligar = (id: string, numero: string, confirmar = false) =>
    t.chamar('PUT', `/api/calibracoes/${id}/folha-campo`, {
      cookie: t.cookieAdmin,
      payload: { numero, ...(confirmar ? { confirmar } : {}) },
    })
  const detalhe = async (id: string) => (await t.chamar('GET', `/api/calibracoes/${id}`, { cookie: t.cookieAdmin })).json()
  const avulsa = async () =>
    (await t.chamar('GET', '/api/folha-campo', { cookie: t.cookieAdmin })).headers['x-folha-campo'] as string
  const linhaDe = (db: Banco, numero: string) =>
    db
      .prepare('SELECT calibracao_id, chave, substituida_por, pdf_arquivo, pdf_sha256 FROM folhas_campo WHERE numero = ?')
      .get(numero) as
      { calibracao_id: string; chave: string; substituida_por: string; pdf_arquivo: string; pdf_sha256: string } | undefined

  it('sem o transplante: a folha que tem PDF na pasta volta ao registro, livre, e é ligada confirmando', async () => {
    const k = await rascunho('OS 1')
    const fc1 = (await folhaDe(k.id)).headers['x-folha-campo'] as string
    const fc2 = await avulsa()
    const pdf2 = readFileSync(join(t.ctx.pastaDados, 'folhas-campo', String(ano), `${fc2}.pdf`))
    // Como a cópia de antes das duas folhas posta no lugar (o LEIA-ME manda trocar o .db)
    t.ctx.db.exec('DELETE FROM folhas_campo')
    // Antes: 404 "não foi impressa por este sistema" (falso). Agora a pasta responde pela folha
    const r = await ligar(k.id, fc2)
    expect(r.statusCode).toBe(409)
    expect(r.json()).toMatchObject({ codigo: 'CONFIRMAR_FOLHA' })
    expect(r.json().erro).toBe(
      `A folha ${fc2} voltou da pasta das folhas de campo (o banco foi restaurado de uma cópia anterior à impressão dela) e não se sabe para qual balança foi impressa. Confira o nº e a balança no alto da folha; se é ela mesmo, ligue assim mesmo.`,
    )
    expect(linhaDe(t.ctx.db, fc2)).toMatchObject({
      calibracao_id: '',
      chave: `recuperada:${fc2}`,
      pdf_arquivo: `${ano}/${fc2}.pdf`,
      pdf_sha256: createHash('sha256').update(pdf2).digest('hex'),
    })
    const ok = await ligar(k.id, fc2, true)
    expect(ok.statusCode, ok.body).toBe(200)
    expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero: fc2 })
    expect(registrosDaFolha().at(-1)?.[2]).toBe(
      `PUT /api/calibracoes/:id/folha-campo | ${fc2} (recuperada da pasta das folhas de campo)`,
    )
    // A reimpressão é o arquivo do papel, sem nº novo
    const reimpressa = await folhaDe(k.id)
    expect(reimpressa.headers['x-folha-campo']).toBe(fc2)
    expect(reimpressa.rawPayload.equals(pdf2)).toBe(true)
    // A da calibração também pode ser ligada de volta (a de agora fica livre: era avulsa)
    expect((await ligar(k.id, fc1, true)).statusCode).toBe(200)
    expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero: fc1 })
    expect(linhaDe(t.ctx.db, fc2)).toMatchObject({ calibracao_id: '' })
    // O registro de atividades guarda a volta das folhas
    expect(
      (
        t.ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id").all() as Array<{
          detalhe: string
        }>
      ).map((x) => x.detalhe),
    ).toEqual([
      `a folha de campo da pasta folhas-campo que não estava no banco (${fc2}) voltou ao registro, livre: o banco é de uma cópia anterior à impressão dela`,
      `a folha de campo da pasta folhas-campo que não estava no banco (${fc1}) voltou ao registro, livre: o banco é de uma cópia anterior à impressão dela`,
    ])
    // Um nº que não está nem no banco nem na pasta continua 404
    expect((await ligar(k.id, `FC-${ano}-00099`)).statusCode).toBe(404)
  })

  it('o servidor sobe com um banco sem as folhas (cópia antiga ou banco novo): as da pasta voltam ao registro', async () => {
    const [a, b] = [await avulsa(), await avulsa()]
    // O banco atual não pôde ser lido e a cópia voltou sem o transplante: aqui, um banco vazio na mesma pasta
    const outro = await criarApp({
      pastaDados: t.ctx.pastaDados,
      arquivoBanco: ':memory:',
      pastaEstatica: null,
      parametrosSenha: PARAMETROS_LEVES,
    })
    try {
      const db = outro.ctx.db
      expect(db.prepare('SELECT numero, chave, calibracao_id FROM folhas_campo ORDER BY sequencia').all()).toEqual([
        { numero: a, chave: `recuperada:${a}`, calibracao_id: '' },
        { numero: b, chave: `recuperada:${b}`, calibracao_id: '' },
      ])
      expect(db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA'").get()).toEqual({
        detalhe: `2 folhas de campo da pasta folhas-campo que não estavam no banco (${a} a ${b}) voltaram ao registro, livres: o banco é de uma cópia anterior à impressão delas`,
      })
      // Subir de novo não repete; o próximo nº continua depois delas
      expect(outro.ctx.repo.recuperarFolhasDaPasta()).toEqual([])
      expect(outro.ctx.repo.reservarFolhaCampo({ chave: 'avulsa:depois-0001', por: 'Ana' }).numero).toBe(`FC-${ano}-00003`)
    } finally {
      await outro.app.close()
    }
  })

  it('transplante: a calibração com a folha da cópia e a nova, impressa depois, fica só com a nova', async () => {
    const k = await rascunho('OS 1')
    const fc1 = (await folhaDe(k.id)).headers['x-folha-campo'] as string
    // A avulsa ligada a outro rascunho, na cópia; depois da cópia, ele ganhou uma folha nova (e a avulsa saiu)
    const outro = await rascunho('OS 2')
    const avulsaLigada = await avulsa()
    expect((await ligar(outro.id, avulsaLigada)).statusCode).toBe(200)
    const copia = await t.ctx.backups.copiar('manual')
    const fc3 = (await folhaDe(k.id, '?nova=a1b2c3d4-0000-4000-8000-0000000000aa')).headers['x-folha-campo'] as string
    const fc4 = (await folhaDe(outro.id, '?nova=a1b2c3d4-0000-4000-8000-0000000000bb')).headers['x-folha-campo'] as string
    expect(linhaDe(t.ctx.db, avulsaLigada)).toMatchObject({ calibracao_id: '' })
    const destino = abrirBanco(copia)
    try {
      expect(transplantarFolhasCampo(t.ctx.db, destino)).toBe(2)
      const estado = (n: string) =>
        destino.prepare('SELECT calibracao_id, substituida_por FROM folhas_campo WHERE numero = ?').get(n)
      // Como o banco atual estava: a da cópia substituída pela nova; a avulsa, livre
      expect(estado(fc1)).toEqual({ calibracao_id: k.id, substituida_por: fc3 })
      expect(estado(fc3)).toEqual({ calibracao_id: k.id, substituida_por: '' })
      expect(estado(avulsaLigada)).toEqual({ calibracao_id: '', substituida_por: '' })
      expect(estado(fc4)).toEqual({ calibracao_id: outro.id, substituida_por: '' })
      const vigentes = destino
        .prepare(
          "SELECT calibracao_id, COUNT(*) AS n FROM folhas_campo WHERE calibracao_id <> '' AND substituida_por = '' GROUP BY calibracao_id",
        )
        .all() as Array<{ n: number }>
      expect(vigentes.every((v) => v.n === 1)).toBe(true)
      expect(
        (
          destino.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id DESC LIMIT 1").get() as {
            detalhe: string
          }
        ).detalhe,
      ).toMatch(
        new RegExp(`; ${fc1}, ${avulsaLigada}, da cópia, ficaram como no banco atual \\(trocadas pelas impressas depois\\)$`),
      )
      // Na cópia de volta, a calibração mostra e reimprime a nova
      expect(new Repositorio(destino).folhaCampoDaCalibracao(k.id)).toMatchObject({ numero: fc3, substituidas: [fc1] })
    } finally {
      destino.close()
    }
  })

  it('calibração com duas folhas vigentes (restaurada antes desta correção): ligar a do papel a torna a dela', async () => {
    const k = await rascunho('OS 1')
    const primeira = await folhaDe(k.id)
    const fc1 = primeira.headers['x-folha-campo'] as string
    const fc2 = (await folhaDe(k.id, '?nova=a1b2c3d4-0000-4000-8000-0000000000cc')).headers['x-folha-campo'] as string
    // Como o transplante antigo deixava: as duas vigentes, e a tela mostrando a de nº maior
    t.ctx.db.prepare("UPDATE folhas_campo SET substituida_por = '', substituida_em = '' WHERE numero = ?").run(fc1)
    expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero: fc2 })
    // O técnico liga a FC-1, o papel que foi a campo: antes, 200 sem mudar nada
    const r = await ligar(k.id, fc1)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().folhaCampo).toMatchObject({ numero: fc1, substituidas: [fc2] })
    expect(folhaNoBanco(fc2)).toMatchObject({ calibracao_id: k.id, substituida_por: fc1 })
    expect(registrosDaFolha().at(-1)?.[2]).toBe(`PUT /api/calibracoes/:id/folha-campo | ${fc1} no lugar da ${fc2}`)
    const reimpressa = await folhaDe(k.id)
    expect(reimpressa.headers['x-folha-campo']).toBe(fc1)
    expect(reimpressa.rawPayload.equals(primeira.rawPayload)).toBe(true)
    // Ligar de novo a que já é a dela não muda nada
    expect((await ligar(k.id, fc1)).json().folhaCampo).toMatchObject({ numero: fc1, substituidas: [fc2] })
  })

  const numeroDe = (r: { headers: Record<string, unknown> }) => r.headers['x-folha-campo'] as string
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
  const arquivoDa = (numero: string) => join(t.ctx.pastaDados, 'folhas-campo', String(ano), `${numero}.pdf`)
  const restauracoes = () =>
    (
      t.ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id").all() as Array<{
        detalhe: string
      }>
    ).map((x) => x.detalhe)

  it('a folha que volta da pasta tem a data da impressão gravada no PDF, e não a do arquivo', async () => {
    const fc = await avulsa()
    const { impressa_em } = t.ctx.db.prepare('SELECT impressa_em FROM folhas_campo WHERE numero = ?').get(fc) as {
      impressa_em: string
    }
    // A pasta voltou da cópia de segurança externa: a data do arquivo é a da cópia
    const daCopia = new Date('2025-03-01T12:00:00Z')
    utimesSync(arquivoDa(fc), daCopia, daCopia)
    t.ctx.db.exec('DELETE FROM folhas_campo')
    expect(t.ctx.repo.recuperarFolhasDaPasta()).toEqual([fc])
    const noPdf = new Date(Math.floor(Date.parse(impressa_em) / 1000) * 1000).toISOString()
    expect(dataDaImpressaoNoPdf(readFileSync(arquivoDa(fc)))).toBe(noPdf)
    expect(t.ctx.db.prepare('SELECT impressa_em, ultima_em FROM folhas_campo WHERE numero = ?').get(fc)).toEqual({
      impressa_em: noPdf,
      ultima_em: noPdf,
    })
    // Um PDF sem a data da impressão fica com a data do arquivo
    const sem = `FC-${ano}-00007`
    writeFileSync(arquivoDa(sem), '%PDF-1.4\n%%EOF\n')
    utimesSync(arquivoDa(sem), daCopia, daCopia)
    expect(t.ctx.repo.recuperarFolhasDaPasta()).toEqual([sem])
    expect(linhaDe(t.ctx.db, sem)).toMatchObject({ chave: `recuperada:${sem}`, calibracao_id: '' })
    expect(t.ctx.db.prepare('SELECT impressa_em FROM folhas_campo WHERE numero = ?').get(sem)).toEqual({
      impressa_em: daCopia.toISOString(),
    })
  })

  it('dataDaImpressaoNoPdf: no dicionário, num objeto à parte, com fuso; sem data ou inválida, null', () => {
    const pdf = (texto: string) => Buffer.from(texto, 'latin1')
    expect(dataDaImpressaoNoPdf(pdf('<< /CreationDate (D:20261021110200Z) >>'))).toBe('2026-10-21T11:02:00.000Z')
    expect(dataDaImpressaoNoPdf(pdf("<< /CreationDate 30 0 R >>\n30 0 obj\n(D:20261021080200-03'00')\nendobj"))).toBe(
      '2026-10-21T11:02:00.000Z',
    )
    expect(dataDaImpressaoNoPdf(pdf('<< /CreationDate (D:20261021110200) >>'))).toBe('2026-10-21T11:02:00.000Z')
    expect(dataDaImpressaoNoPdf(pdf('%PDF-1.4'))).toBeNull()
    expect(dataDaImpressaoNoPdf(pdf('<< /CreationDate (D:20261341110200Z) >>'))).toBeNull()
    expect(dataDaImpressaoNoPdf(pdf('<< /CreationDate 30 0 R >>'))).toBeNull()
  })

  it('numeroCertificadoNoPdf: o nº nas palavras-chave (direto, num objeto à parte, com escapes ou em UTF-16); sem ele, vazio', async () => {
    const pdf = (texto: string) => Buffer.from(texto, 'latin1')
    expect(numeroCertificadoNoPdf(pdf('<< /Keywords (folha de campo; FC-2026-00001; certificado CC-2026-00042) >>'))).toBe(
      'CC-2026-00042',
    )
    expect(
      numeroCertificadoNoPdf(
        pdf('<< /Keywords 31 0 R >>\n31 0 obj\n(folha de campo; certificado 0042\\/2026; FOR-CAL-01)\nendobj'),
      ),
    ).toBe('0042/2026')
    expect(numeroCertificadoNoPdf(pdf('<< /Keywords (folha de campo; FC-2026-00001; FOR-CAL-01) >>'))).toBe('')
    expect(numeroCertificadoNoPdf(pdf('%PDF-1.4'))).toBe('')
    // A folha de verdade: com o POP de nome acentuado, o pdfkit grava as palavras-chave em UTF-16
    const { gerarFolhaCampoPdf } = await import('./pdf/folhaCampo.ts')
    const { folhaEmBranco } = await import('./pdf/exemplosFolhaCampo.ts')
    const real = await gerarFolhaCampoPdf({ ...folhaEmBranco(), procedimento: 'BALANÇAS-POP-123 rev. 00' })
    expect(real.toString('latin1')).not.toContain('certificado CC-2026-00129')
    expect(numeroCertificadoNoPdf(real)).toBe('CC-2026-00129')
    expect(numeroCertificadoNoPdf(await gerarFolhaCampoPdf({ ...folhaEmBranco(), numeroCertificado: undefined }))).toBe('')
  })

  it('folha no banco sem o PDF (a cópia saiu entre a reserva do nº e a gravação): fica com o arquivo da pasta', async () => {
    const k = await rascunho('OS 1')
    const primeira = await folhaDe(k.id)
    const fc = numeroDe(primeira)
    t.ctx.db.prepare("UPDATE folhas_campo SET pdf_arquivo = '', pdf_sha256 = '' WHERE numero = ?").run(fc)
    // O plano mudou depois da impressão: uma folha refeita agora não seria o papel
    const atual = (await detalhe(k.id)).calibracao as Calibracao
    const salvo = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, ordemServico: 'OS 2', versao: atual.versao },
    })
    expect(salvo.statusCode, salvo.body).toBe(200)
    expect(t.ctx.repo.recuperarFolhasDaPasta()).toEqual([])
    expect(linhaDe(t.ctx.db, fc)).toMatchObject({ pdf_arquivo: `${ano}/${fc}.pdf`, pdf_sha256: sha(primeira.rawPayload) })
    const reimpressa = await folhaDe(k.id)
    expect(numeroDe(reimpressa)).toBe(fc)
    expect(reimpressa.rawPayload.equals(primeira.rawPayload)).toBe(true)
    expect(readdirSync(join(t.ctx.pastaDados, 'folhas-campo', String(ano)))).toEqual([`${fc}.pdf`])
    expect(restauracoes()).toEqual([
      `a folha de campo ${fc}, sem PDF no banco, ficou com o da pasta folhas-campo: a reimpressão é o papel`,
    ])
  })

  it('o servidor sobe com calibrações com duas folhas vigentes: fica a mais nova, e a outra sai como numa folha nova', async () => {
    const k = await rascunho('OS 1')
    const fc1 = numeroDe(await folhaDe(k.id))
    const fc2 = numeroDe(await folhaDe(k.id, '?nova=a1b2c3d4-0000-4000-8000-0000000000dd'))
    const outro = await rascunho('OS 2')
    const solta = await avulsa()
    expect((await ligar(outro.id, solta)).statusCode).toBe(200)
    const fc4 = numeroDe(await folhaDe(outro.id, '?nova=a1b2c3d4-0000-4000-8000-0000000000ee'))
    // Como o transplante de antes desta correção deixava as duas calibrações
    t.ctx.db.prepare("UPDATE folhas_campo SET substituida_por = '', substituida_em = '' WHERE numero = ?").run(fc1)
    t.ctx.db.prepare('UPDATE folhas_campo SET calibracao_id = ? WHERE numero = ?').run(outro.id, solta)
    const em2 = (t.ctx.db.prepare('SELECT impressa_em FROM folhas_campo WHERE numero = ?').get(fc2) as { impressa_em: string })
      .impressa_em
    // É o que roda quando o servidor sobe
    expect(t.ctx.repo.recuperarFolhasDaPasta()).toEqual([])
    expect(folhaNoBanco(fc1)).toEqual({ numero: fc1, calibracao_id: k.id, substituida_por: fc2, substituida_em: em2 })
    expect(folhaNoBanco(fc2)).toMatchObject({ calibracao_id: k.id, substituida_por: '' })
    // A avulsa ligada por engano sai livre, como numa folha nova
    expect(folhaNoBanco(solta)).toMatchObject({ calibracao_id: '', substituida_por: '' })
    expect(folhaNoBanco(fc4)).toMatchObject({ calibracao_id: outro.id, substituida_por: '' })
    expect((await detalhe(k.id)).folhaCampo).toMatchObject({ numero: fc2, substituidas: [fc1] })
    expect(restauracoes()).toEqual([
      `2 calibrações tinham mais de uma folha de campo vigente (banco restaurado de uma cópia) e ficaram só com a mais nova: ${fc2} no lugar da ${fc1}; ${fc4} no lugar da ${solta}, que ficou livre`,
    ])
    // Subir de novo não muda nada
    expect(t.ctx.repo.conciliarFolhasVigentes()).toEqual([])
    expect(restauracoes()).toHaveLength(1)
    // O papel que foi a campo continua podendo ser ligado de volta
    expect((await ligar(k.id, fc1)).json().folhaCampo).toMatchObject({ numero: fc1, substituidas: [fc2] })
  })

  const vigentesPorCalibracao = (db: Banco) =>
    (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM folhas_campo WHERE calibracao_id <> '' AND substituida_por = '' GROUP BY calibracao_id",
        )
        .all() as Array<{ n: number }>
    ).map((v) => v.n)
  const estadoEm = (db: Banco, numero: string) =>
    db.prepare('SELECT calibracao_id, substituida_por FROM folhas_campo WHERE numero = ?').get(numero)
  const ultimaRestauracao = (db: Banco) =>
    (
      db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id DESC LIMIT 1").get() as {
        detalhe: string
      }
    ).detalhe

  it('transplante: a vigente de cada calibração é a do banco atual, mesmo que não seja a de nº maior', async () => {
    const k = await rascunho('OS 1')
    const outro = await rascunho('OS 2')
    const a = await avulsa()
    expect((await ligar(k.id, a)).statusCode).toBe(200)
    const f = numeroDe(await folhaDe(outro.id))
    const copia = await t.ctx.backups.copiar('manual')
    // Depois da cópia: folha nova para k (a avulsa fica livre), e a avulsa vai a campo pelo outro
    const n = numeroDe(await folhaDe(k.id, '?nova=a1b2c3d4-0000-4000-8000-0000000000ff'))
    expect((await ligar(outro.id, a)).statusCode).toBe(200)
    expect(folhaNoBanco(f)).toMatchObject({ calibracao_id: outro.id, substituida_por: a })
    const destino = abrirBanco(copia)
    try {
      expect(transplantarFolhasCampo(t.ctx.db, destino)).toBe(1)
      expect(estadoEm(destino, n)).toEqual({ calibracao_id: k.id, substituida_por: '' })
      expect(estadoEm(destino, a)).toEqual({ calibracao_id: outro.id, substituida_por: '' })
      expect(estadoEm(destino, f)).toEqual({ calibracao_id: outro.id, substituida_por: a })
      expect(vigentesPorCalibracao(destino)).toEqual([1, 1])
      const repo = new Repositorio(destino)
      expect(repo.folhaCampoDaCalibracao(outro.id)).toMatchObject({ numero: a, substituidas: [f] })
      expect(repo.folhaCampoDaCalibracao(k.id)).toMatchObject({ numero: n, substituidas: [] })
      expect(ultimaRestauracao(destino)).toBe(
        `a folha de campo impressa depois da cópia (${n}) continua registrada: os nºs não se repetem; ${a}, da cópia, ficou como no banco atual (trocada pela impressa depois); ${f}, da cópia, deixou de ser vigente (uma folha vigente por calibração)`,
      )
    } finally {
      destino.close()
    }
  })

  it('transplante: a avulsa livre na cópia que foi a campo no lugar da folha impressa depois dela volta para a calibração', async () => {
    const k = await rascunho('OS 1')
    const a = await avulsa()
    const copia = await t.ctx.backups.copiar('manual')
    const depois = numeroDe(await folhaDe(k.id))
    expect((await ligar(k.id, a)).statusCode).toBe(200)
    expect(folhaNoBanco(depois)).toMatchObject({ calibracao_id: k.id, substituida_por: a })
    const destino = abrirBanco(copia)
    try {
      expect(transplantarFolhasCampo(t.ctx.db, destino)).toBe(1)
      expect(estadoEm(destino, a)).toEqual({ calibracao_id: k.id, substituida_por: '' })
      expect(estadoEm(destino, depois)).toEqual({ calibracao_id: k.id, substituida_por: a })
      expect(new Repositorio(destino).folhaCampoDaCalibracao(k.id)).toMatchObject({ numero: a, substituidas: [depois] })
      expect(ultimaRestauracao(destino)).toBe(
        `a folha de campo impressa depois da cópia (${depois}) continua registrada: os nºs não se repetem; ${a}, livre na cópia, voltou para a calibração, como no banco atual`,
      )
    } finally {
      destino.close()
    }
  })
})

describe('nome do arquivo', { timeout: 30_000 }, () => {
  it('pela OS (sem repetir "OS") e, sem OS, pelo nº da folha', () => {
    expect(nomeArquivoDaFolha('OS-2026-0456', 'FC-2026-00001')).toBe('Folha-de-campo-OS-2026-0456.pdf')
    expect(nomeArquivoDaFolha('4471', 'FC-2026-00001')).toBe('Folha-de-campo-OS-4471.pdf')
    expect(nomeArquivoDaFolha('  ', 'FC-2026-00001')).toBe('Folha-de-campo-FC-2026-00001.pdf')
  })
})

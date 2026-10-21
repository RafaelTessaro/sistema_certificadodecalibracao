// Folha de campo pela API: a de uma calibração (rascunho e emitida, a reimpressão mantém o nº), a de uma
// balança com o plano da última calibração, a do cliente e a em branco; o nº FC no banco, os 404/400 e
// quem pode pedir (qualquer pessoa com sessão; sem sessão, 401).

import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, CLIENTE_VAZIO, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente, Padrao } from '#shared/tipos.ts'
import { criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { nomeArquivoDaFolha } from './rotas/folhaCampo.ts'

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

const temPdftotext = !spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error
const textoDoPdf = (pdf: Buffer) =>
  spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdf })
    .stdout.toString('utf8')
    .replace(/\s+/g, ' ')

describe('folha de campo de uma calibração', () => {
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

  it('a de um certificado emitido é a reimpressão da folha planejada', async () => {
    const k = await rascunho()
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
    const salvo = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin, payload: { ...dados, versao: k.versao } })
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
    if (temPdftotext) {
      const texto = textoDoPdf(r.rawPayload)
      expect(texto).toContain('TL-2231')
      expect(texto).not.toContain('OUTRO')
      // Nunca as leituras nem o nº do certificado
      expect(texto).not.toContain(emitida.json().calibracao.numero)
      expect(texto).not.toContain('20,01')
    }
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

describe('folha de campo sem calibração', () => {
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

describe('nome do arquivo', () => {
  it('pela OS (sem repetir "OS") e, sem OS, pelo nº da folha', () => {
    expect(nomeArquivoDaFolha('OS-2026-0456', 'FC-2026-00001')).toBe('Folha-de-campo-OS-2026-0456.pdf')
    expect(nomeArquivoDaFolha('4471', 'FC-2026-00001')).toBe('Folha-de-campo-OS-4471.pdf')
    expect(nomeArquivoDaFolha('  ', 'FC-2026-00001')).toBe('Folha-de-campo-FC-2026-00001.pdf')
  })
})

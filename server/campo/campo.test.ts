// O app do celular do técnico no servidor (1.1.0; shared/campo/protocolo.ts), com o servidor de verdade (app.inject):
// pareamento, autenticação do celular, "Enviar para o técnico", recolher, olá, entrega do registro (grava sempre, com as
// marcas), a trava da calibração (só com o registro original no celular), a lista das folhas e o Painel, os registros
// no escritório e a folha impressa assinada.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularSha256Pacote, sha256Hex } from '#shared/campo/canonico.ts'
import { CONTRATO_CAMPO, reciboConfere } from '#shared/campo/protocolo.ts'
import type { PacoteCampo, ReciboCampo } from '#shared/campo/tipos.ts'
import type { Calibracao, CampoDaFolha, CelularListado, FolhaCampoListada, RegistroCampoDetalhe } from '#shared/tipos.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin } from '../auxiliaresTeste.ts'
import { pngRgbaIdatQueNaoEZlib } from './__fixtures__/pngTeste.ts'
import {
  APARELHO_TESTE,
  assinar,
  baixarEConfirmar,
  chamarCelular,
  enviarCalibracao,
  entregar,
  mandarCodigo,
  OUTRO_APARELHO,
  parearCelular,
  pedirCodigo,
  registroDoPacote,
  shaDoRegistro,
} from './auxiliaresTesteCampo.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>

beforeEach(async () => {
  t = await criarAppComLogin()
  c = await cenarioCalibracao(t)
})
afterEach(async () => {
  await t.fechar()
})

const ola = (token: string, estados: Array<{ envioId: string; estado: string }> = [], versaoApp = '1.1.0') =>
  chamarCelular(t, token, 'POST', '/api/campo/ola', {
    payload: { versaoApp, contrato: CONTRATO_CAMPO, agora: new Date().toISOString(), estados },
  })

const auditoria = (acao: string) =>
  t.ctx.db.prepare('SELECT * FROM auditoria WHERE acao = ? ORDER BY id').all(acao) as Array<Record<string, string>>

const envioNoBanco = (id: string) =>
  t.ctx.db.prepare('SELECT * FROM folhas_campo_envios WHERE id = ?').get(id) as Record<string, string | number>

/** Rascunho com a folha enviada ao celular do técnico (comum), baixada e confirmada. */
async function folhaNoCelular(o: { tecnico?: boolean } = {}) {
  const k = await c.calibracaoPronta()
  const { token } = await parearCelular(t)
  const r = await enviarCalibracao(t, k.id)
  const pacote = await baixarEConfirmar(t, token, r.envio.id)
  void o
  return { k, token, envio: r.envio, pacote }
}

describe('pareamento', () => {
  it('código de uso único: o celular recebe o token; o servidor guarda só o sha256; a tela vê "pareado"', async () => {
    const p = await pedirCodigo(t)
    expect(p.codigo).toMatch(/^\d{6}$/)
    expect(p.qr).toMatch(/^BCCAL1\|http:\/\/.+\|\d{6}$/)
    expect(p.tecnico).toEqual({ id: t.comumId, nome: 'Comum Teste' })
    const r = await mandarCodigo(t, p.codigo)
    expect(r.statusCode, r.body).toBe(200)
    const corpo = r.json()
    expect(corpo.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(corpo).toMatchObject({ aparelhoId: APARELHO_TESTE, tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    expect(corpo.servidor.id).toBeTruthy()
    const linha = t.ctx.db.prepare('SELECT * FROM dispositivos').get() as Record<string, string>
    expect(linha.token_sha256).toBe(sha256Hex(corpo.token))
    expect(JSON.stringify(linha)).not.toContain(corpo.token)
    expect(linha.nome).toBe('Celular de Comum')
    // De novo: já usado
    const outra = await mandarCodigo(t, p.codigo, { aparelhoId: OUTRO_APARELHO })
    expect(outra.statusCode).toBe(400)
    expect(outra.json().codigo).toBe('CODIGO_EXPIRADO')
    const s = await t.chamar('GET', `/api/celulares/pareamento/${p.id}`, { cookie: t.cookieAdmin })
    expect(s.json().pareamento).toMatchObject({ situacao: 'PAREADO', celular: { id: APARELHO_TESTE, tecnicoId: t.comumId } })
    expect(auditoria('CELULAR_CADASTRADO')).toHaveLength(1)
    expect(auditoria('CELULAR_CADASTRADO')[0]).toMatchObject({ usuario_id: t.adminId, alvo: APARELHO_TESTE })
  })

  it('o código vence em 10 minutos', async () => {
    const p = await pedirCodigo(t)
    const pareamentos = t.ctx.campo!.pareamentos
    const dez = Date.now() + 10 * 60_000 + 1000
    pareamentos.agora = () => dez
    const r = await mandarCodigo(t, p.codigo)
    expect(r.statusCode).toBe(400)
    expect(r.json().codigo).toBe('CODIGO_EXPIRADO')
    expect(
      (await t.chamar('GET', `/api/celulares/pareamento/${p.id}`, { cookie: t.cookieAdmin })).json().pareamento.situacao,
    ).toBe('EXPIRADO')
  })

  it('código errado 5 vezes invalida o código em aberto; o IP que erra demais espera (429)', async () => {
    const p = await pedirCodigo(t)
    const errado = p.codigo === '000000' ? '111111' : '000000'
    for (let i = 1; i <= 5; i++) {
      const r = await mandarCodigo(t, errado, { remoteAddress: `192.168.0.${10 + i}` })
      expect(r.statusCode).toBe(400)
      expect(r.json()).toMatchObject({ codigo: 'CODIGO_INVALIDO', tentativasRestantes: 5 - i })
    }
    const certo = await mandarCodigo(t, p.codigo, { remoteAddress: '192.168.0.50' })
    expect(certo.json().codigo).toBe('CODIGO_EXPIRADO')
    expect(
      (await t.chamar('GET', `/api/celulares/pareamento/${p.id}`, { cookie: t.cookieAdmin })).json().pareamento.situacao,
    ).toBe('INVALIDADO')
    // O mesmo IP errando seguidas vezes: espera
    const q = await pedirCodigo(t)
    const outroErrado = q.codigo === '222222' ? '333333' : '222222'
    let ultima = await mandarCodigo(t, outroErrado, { remoteAddress: '192.168.0.99' })
    for (let i = 0; i < 6 && ultima.statusCode !== 429; i++)
      ultima = await mandarCodigo(t, outroErrado, { remoteAddress: '192.168.0.99' })
    expect(ultima.statusCode).toBe(429)
    expect(ultima.json()).toMatchObject({ codigo: 'MUITAS_TENTATIVAS' })
    expect(ultima.json().esperarSegundos).toBeGreaterThan(0)
    expect(ultima.headers['retry-after']).toBeTruthy()
  })

  it('o código só pareia para um técnico ativo, com a marca de técnico; só o administrador pede', async () => {
    const r = await t.chamar('POST', '/api/celulares/pareamento', { cookie: t.cookieComum, payload: { usuarioId: t.comumId } })
    expect(r.statusCode).toBe(403)
    await t.chamar('PUT', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin, payload: { tecnico: false } })
    const sem = await t.chamar('POST', '/api/celulares/pareamento', { cookie: t.cookieAdmin, payload: { usuarioId: t.comumId } })
    expect(sem.statusCode).toBe(409)
    expect(sem.json().codigo).toBe('SEM_MARCA_TECNICO')
  })

  it('parear de novo: o mesmo aparelho, token novo (o antigo deixa de valer), a revogação sai', async () => {
    const primeiro = await parearCelular(t)
    expect((await ola(primeiro.token)).statusCode).toBe(200)
    const rev = await t.chamar('POST', `/api/celulares/${APARELHO_TESTE}/revogar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'ENGANO' },
    })
    expect(rev.statusCode).toBe(200)
    expect((await ola(primeiro.token)).json().codigo).toBe('DESCADASTRADO')
    const de = await t.chamar('POST', `/api/celulares/${APARELHO_TESTE}/parear-de-novo`, { cookie: t.cookieAdmin, payload: {} })
    expect(de.statusCode, de.body).toBe(200)
    const { codigo, aparelhoId } = de.json().pareamento
    expect(aparelhoId).toBe(APARELHO_TESTE)
    // Outro aparelho não usa o código de "parear de novo"
    const errado = await mandarCodigo(t, codigo, { aparelhoId: OUTRO_APARELHO })
    expect(errado.statusCode).toBe(400)
    expect(errado.json().codigo).toBe('PEDIDO_INVALIDO')
    const r = await mandarCodigo(t, codigo)
    expect(r.statusCode, r.body).toBe(200)
    const segundo = r.json().token as string
    expect(segundo).not.toBe(primeiro.token)
    expect((await ola(segundo)).statusCode).toBe(200)
    expect((await ola(primeiro.token)).json().codigo).toBe('NAO_PAREADO')
    const lista = (await t.chamar('GET', '/api/celulares', { cookie: t.cookieAdmin })).json().celulares as CelularListado[]
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ id: APARELHO_TESTE, revogado: false, pareamentos: 2 })
    expect(auditoria('CELULAR_PAREADO_DE_NOVO')).toHaveLength(1)
  })

  it('a lista dos celulares: técnico, modelo, versão do app, visto às e IP, folhas no celular; renomear', async () => {
    const { token, envio } = await folhaNoCelular()
    await ola(token)
    const [cel] = (await t.chamar('GET', '/api/celulares', { cookie: t.cookieAdmin })).json().celulares as CelularListado[]
    expect(cel).toMatchObject({
      id: APARELHO_TESTE,
      nome: 'Celular de Comum',
      modelo: 'Samsung SM-A546E',
      versaoApp: '1.1.0',
      tecnicoId: t.comumId,
      tecnicoNome: 'Comum Teste',
      tecnicoAtivo: true,
      folhasNoCelular: 1,
      revogado: false,
    })
    expect(cel.ultimoContato).toBeTruthy()
    expect(cel.ultimoIp).toBeTruthy()
    void envio
    const r = await t.chamar('PUT', `/api/celulares/${APARELHO_TESTE}`, {
      cookie: t.cookieAdmin,
      payload: { nome: 'Celular de Ana' },
    })
    expect(r.json().celular.nome).toBe('Celular de Ana')
    expect(auditoria('CELULAR_RENOMEADO')[0].detalhe).toContain('Celular de Comum → Celular de Ana')
    // Só o administrador vê a lista (com o IP)
    expect((await t.chamar('GET', '/api/celulares', { cookie: t.cookieComum })).statusCode).toBe(403)
  })

  it('pedido com o aparelho fora do formato: 400 PEDIDO_INVALIDO, sem gastar o código', async () => {
    const p = await pedirCodigo(t)
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/campo/parear',
      headers: { 'x-bc-calibracao': '1' },
      payload: { codigo: p.codigo, aparelhoId: 'nao-e-uuid', modelo: 'X', versaoApp: '1.1.0' },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().codigo).toBe('PEDIDO_INVALIDO')
    expect((await mandarCodigo(t, p.codigo)).statusCode).toBe(200)
  })

  it('sem o cabeçalho contra CSRF, o pareamento é bloqueado (403)', async () => {
    const p = await pedirCodigo(t)
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/campo/parear',
      payload: { codigo: p.codigo, aparelhoId: APARELHO_TESTE, modelo: 'X', versaoApp: '1.1.0' },
    })
    expect(r.statusCode).toBe(403)
  })
})

describe('autenticação do celular', () => {
  it('sem token ou token desconhecido: 401 NAO_PAREADO; o cookie da sessão não vale nas rotas do celular', async () => {
    const sem = await t.app.inject({ method: 'POST', url: '/api/campo/ola', headers: { 'x-bc-calibracao': '1' }, payload: {} })
    expect(sem.statusCode).toBe(401)
    expect(sem.json().codigo).toBe('NAO_PAREADO')
    const comCookie = await t.chamar('POST', '/api/campo/ola', {
      cookie: t.cookieAdmin,
      payload: { versaoApp: '1.1.0', contrato: 1, agora: '', estados: [] },
    })
    expect(comCookie.statusCode).toBe(401)
    expect(comCookie.json().codigo).toBe('NAO_PAREADO')
    const desconhecido = await ola('A'.repeat(43))
    expect(desconhecido.json().codigo).toBe('NAO_PAREADO')
  })

  it('o token do celular não vale nas rotas do escritório', async () => {
    const { token } = await parearCelular(t)
    const r = await chamarCelular(t, token, 'GET', '/api/calibracoes')
    expect(r.statusCode).toBe(401)
    expect(r.json().codigo).toBe('SEM_SESSAO')
    const p = await chamarCelular(t, token, 'GET', '/api/celulares')
    expect(p.statusCode).toBe(401)
  })

  it('sem o cabeçalho contra CSRF, o pedido do celular é bloqueado (403)', async () => {
    const { token } = await parearCelular(t)
    const r = await t.app.inject({
      method: 'POST',
      url: '/api/campo/ola',
      headers: { authorization: `Bearer ${token}` },
      payload: { versaoApp: '1.1.0', contrato: 1, agora: '', estados: [] },
    })
    expect(r.statusCode).toBe(403)
  })

  it('celular revogado: 401 DESCADASTRADO para receber folhas; técnico desativado revoga os celulares dele', async () => {
    const { token } = await parearCelular(t)
    const r = await t.chamar('PUT', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin, payload: { ativo: false } })
    expect(r.statusCode, r.body).toBe(200)
    const linha = t.ctx.db.prepare('SELECT revogado_motivo, revogado_em FROM dispositivos').get() as Record<string, string>
    expect(linha.revogado_motivo).toBe('DESLIGAMENTO')
    expect(linha.revogado_em).toBeTruthy()
    const o = await ola(token)
    expect(o.statusCode).toBe(401)
    expect(o.json().codigo).toBe('DESCADASTRADO')
  })

  it('usuário excluído: os celulares dele são revogados (DESLIGAMENTO)', async () => {
    await parearCelular(t)
    const r = await t.chamar('DELETE', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin })
    expect(r.statusCode, r.body).toBeLessThan(300)
    const linha = t.ctx.db.prepare('SELECT revogado_motivo FROM dispositivos').get() as Record<string, string>
    expect(linha.revogado_motivo).toBe('DESLIGAMENTO')
    expect(auditoria('USUARIO_EXCLUIDO').at(-1)!.detalhe).toContain('1 celular descadastrado')
  })
})

describe('olá', () => {
  it('grava o "visto às" e o IP sem linha no registro de atividades; lista os envios a baixar', async () => {
    const k = await c.calibracaoPronta()
    const { token } = await parearCelular(t)
    const antes = (t.ctx.db.prepare('SELECT COUNT(*) AS n FROM auditoria').get() as { n: number }).n
    const vazio = await ola(token)
    expect(vazio.statusCode, vazio.body).toBe(200)
    expect(vazio.json()).toMatchObject({ envios: [], recolher: [], desconhecidos: [], recebeFolhas: true })
    expect((t.ctx.db.prepare('SELECT COUNT(*) AS n FROM auditoria').get() as { n: number }).n).toBe(antes)
    const cel = t.ctx.db.prepare('SELECT ultimo_contato, ultimo_ip, versao_app FROM dispositivos').get() as Record<string, string>
    expect(cel.ultimo_contato).toBeTruthy()
    expect(cel.ultimo_ip).toBeTruthy()
    const { envio } = await enviarCalibracao(t, k.id, { dataPrevista: '2026-12-01', recado: 'Levar o jogo M1' })
    const r = (await ola(token, [{ envioId: '00000000-0000-4000-8000-000000000000', estado: 'EM_PREENCHIMENTO' }])).json()
    expect(r.envios).toHaveLength(1)
    expect(r.envios[0]).toMatchObject({
      envioId: envio.id,
      numero: envio.numero,
      tipo: 'calibracao',
      cliente: 'MERCADO BOM PRECO LTDA',
      dataPrevista: '2026-12-01',
      situacao: 'ENVIADA',
      piloto: true,
    })
    expect(r.desconhecidos).toEqual(['00000000-0000-4000-8000-000000000000'])
    expect(r.tecnico).toEqual({ id: t.comumId, nome: 'Comum Teste' })
    // O estado informado pelo celular aparece no computador
    await baixarEConfirmar(t, token, envio.id)
    await ola(token, [{ envioId: envio.id, estado: 'EM_PREENCHIMENTO' }])
    expect(envioNoBanco(envio.id)).toMatchObject({ situacao: 'NO_CELULAR', estado_celular: 'EM_PREENCHIMENTO' })
  })

  it('técnico sem a marca de técnico não recebe folhas novas (recebeFolhas: false)', async () => {
    const { token } = await parearCelular(t)
    await t.chamar('PUT', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin, payload: { tecnico: false } })
    const r = (await ola(token)).json()
    expect(r).toMatchObject({ recebeFolhas: false, motivoSemFolhas: 'SEM_MARCA_TECNICO', envios: [] })
  })
})

describe('Enviar para o técnico', () => {
  it('congela os dados impressos, não conta impressão, sobe a versão da calibração; o pacote é o congelado', async () => {
    const k = await c.calibracaoPronta()
    await parearCelular(t)
    const r = await enviarCalibracao(t, k.id, { recado: 'Portaria 2' })
    expect(r.envio).toMatchObject({ situacao: 'ENVIADA', tecnicoId: t.comumId, tecnico: 'Comum Teste', piloto: true })
    expect(r.versao).toBe(k.versao + 1)
    expect(r.aviso).toBeUndefined()
    const folha = t.ctx.db.prepare('SELECT * FROM folhas_campo WHERE numero = ?').get(r.envio.numero) as Record<
      string,
      string | number
    >
    expect(folha.impressoes).toBe(0)
    expect(folha.dados_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(folha.pdf_sha256).toBeTruthy()
    const linha = envioNoBanco(r.envio.id)
    const pacote = JSON.parse(String(linha.pacote)) as PacoteCampo
    expect(linha.pacote_sha256).toBe(calcularSha256Pacote(pacote, sha256Hex))
    expect(pacote).toMatchObject({ envioId: r.envio.id, folha: { numero: r.envio.numero, recado: 'Portaria 2', piloto: true } })
    expect(pacote.versoes.dadosSha256).toBe(folha.dados_sha256)
    // O gatilho: o pacote não muda
    expect(() => t.ctx.db.prepare("UPDATE folhas_campo_envios SET pacote = '{}' WHERE id = ?").run(r.envio.id)).toThrow(
      /não pode ser alterado/,
    )
    expect(() => t.ctx.db.prepare("UPDATE folhas_campo SET dados_impressos = '{}' WHERE numero = ?").run(r.envio.numero)).toThrow(
      /não podem ser alterados/,
    )
    // Imprimir depois: a mesma folha (o mesmo nº), e conta a impressão
    const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(pdf.headers['x-folha-campo']).toBe(r.envio.numero)
    expect(
      (t.ctx.db.prepare('SELECT impressoes FROM folhas_campo WHERE numero = ?').get(r.envio.numero) as { impressoes: number })
        .impressoes,
    ).toBe(1)
    expect(auditoria('FOLHA_ENVIADA_TECNICO').at(-1)!.detalhe).toContain(`${r.envio.numero} · para Comum Teste`)
  })

  it('a folha já impressa vai como está no papel (os dados da impressão, mesmo com o rascunho mudado depois)', async () => {
    const k = await c.calibracaoPronta()
    const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    const numero = String(pdf.headers['x-folha-campo'])
    const antes = t.ctx.db
      .prepare('SELECT dados_impressos, dados_sha256 FROM folhas_campo WHERE numero = ?')
      .get(numero) as Record<string, string>
    expect(antes.dados_sha256).toBeTruthy()
    const atual = t.ctx.repo.obterCalibracao(k.id)!
    const mudado = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, ordemServico: 'OS-MUDOU', versao: atual.versao },
    })
    expect(mudado.statusCode, mudado.body).toBe(200)
    await parearCelular(t)
    const r = await enviarCalibracao(t, k.id)
    expect(r.envio.numero).toBe(numero)
    const pacote = JSON.parse(String(envioNoBanco(r.envio.id).pacote)) as PacoteCampo
    expect(pacote.folha.os).not.toBe('OS-MUDOU')
    expect(pacote.versoes.dadosSha256).toBe(antes.dados_sha256)
    expect(
      (t.ctx.db.prepare('SELECT impressoes FROM folhas_campo WHERE numero = ?').get(numero) as { impressoes: number }).impressoes,
    ).toBe(1)
  })

  it('folha impressa antes da 1.1 (sem os dados congelados): vai com os dados de agora e um aviso', async () => {
    const k = await c.calibracaoPronta()
    const pdf = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    const numero = String(pdf.headers['x-folha-campo'])
    // Como uma folha de antes: sem os dados (o gatilho deixa apagar com o banco aberto direto)
    t.ctx.db.exec('DROP TRIGGER folhas_campo_dados_fixos')
    t.ctx.db.prepare("UPDATE folhas_campo SET dados_impressos = '', dados_sha256 = '' WHERE numero = ?").run(numero)
    await parearCelular(t)
    const r = await enviarCalibracao(t, k.id)
    expect(r.aviso).toMatch(/impressa antes da versão 1\.1/)
  })

  it('um envio vivo por folha; a folha que já voltou com dados não vai de novo', async () => {
    const { k, token, envio, pacote } = await folhaNoCelular()
    const de = await t.chamar('POST', `/api/calibracoes/${k.id}/enviar-tecnico`, {
      cookie: t.cookieAdmin,
      payload: { tecnicoId: t.comumId },
    })
    expect(de.statusCode).toBe(409)
    expect(de.json().codigo).toBe('ENVIO_ATIVO')
    // O índice também barra
    expect(() =>
      t.ctx.db
        .prepare(
          `INSERT INTO folhas_campo_envios (id, numero, usuario_id, situacao, pacote, pacote_sha256, contrato, enviado_em, enviado_por)
           VALUES ('x-1', ?, ?, 'ENVIADA', '{}', '', 1, '', '')`,
        )
        .run(envio.numero, t.comumId),
    ).toThrow(/UNIQUE/)
    const reg = registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    expect((await entregar(t, token, envio.id, reg)).statusCode).toBe(200)
    // Recolhida e reenviada? Não: já voltou com dados
    const outra = await t.chamar('POST', `/api/folhas-campo/${envio.numero}/enviar-tecnico`, {
      cookie: t.cookieAdmin,
      payload: { tecnicoId: t.comumId },
    })
    expect(outra.statusCode).toBe(409)
    expect(outra.json().codigo).toBe('ENVIO_ATIVO')
  })

  it('técnico sem celular: 409 SEM_CELULAR, sem reservar folha', async () => {
    const k = await c.calibracaoPronta()
    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/enviar-tecnico`, {
      cookie: t.cookieAdmin,
      payload: { tecnicoId: t.comumId },
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().codigo).toBe('SEM_CELULAR')
    expect(t.ctx.repo.folhaCampoDaCalibracao(k.id)).toBeNull()
  })

  it('o editor aberto antes do envio recebe 409 CONFLITO na próxima gravação', async () => {
    const k = await c.calibracaoPronta()
    await parearCelular(t)
    await enviarCalibracao(t, k.id)
    const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...k, observacoes: 'depois', versao: k.versao },
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().codigo).toBe('CONFLITO')
  })

  it('folhas avulsas: da balança, só do cliente e em branco (o tipo vai no pacote)', async () => {
    await parearCelular(t)
    const avulsa = async (corpo: Record<string, unknown>) => {
      const r = await t.chamar('POST', '/api/folha-campo/enviar-tecnico', {
        cookie: t.cookieComum,
        payload: { tecnicoId: t.comumId, ...corpo },
      })
      expect(r.statusCode, r.body).toBe(200)
      return JSON.parse(String(envioNoBanco(r.json().envio.id).pacote)) as PacoteCampo
    }
    expect((await avulsa({ balancaId: c.balanca.id, chave: 'chave-envio-0001' })).folha.tipo).toBe('balanca')
    expect((await avulsa({ clienteId: c.cliente.id, os: 'OS 77' })).folha).toMatchObject({ tipo: 'cliente', os: 'OS 77' })
    expect((await avulsa({})).folha.tipo).toBe('branco')
    // A mesma chave é a mesma folha (já enviada)
    const de = await t.chamar('POST', '/api/folha-campo/enviar-tecnico', {
      cookie: t.cookieComum,
      payload: { tecnicoId: t.comumId, balancaId: c.balanca.id, chave: 'chave-envio-0001' },
    })
    expect(de.statusCode).toBe(409)
  })
})

describe('recolher', () => {
  it('não baixada: na hora; baixada: pedido, que o celular responde', async () => {
    const k = await c.calibracaoPronta()
    const { token } = await parearCelular(t)
    const { envio } = await enviarCalibracao(t, k.id)
    const r = await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, {
      cookie: t.cookieComum,
      payload: { motivo: 'Visita cancelada' },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ imediato: true, envio: { situacao: 'RECOLHIDA' } })
    // O celular que ainda informa a folha recebe o pedido para apagar; o pacote de um recolhido não desce
    expect((await ola(token, [{ envioId: envio.id, estado: 'RECEBENDO' }])).json().recolher).toEqual([envio.id])
    const p = await chamarCelular(t, token, 'GET', `/api/campo/envios/${envio.id}/pacote`)
    expect(p.statusCode).toBe(409)
    expect(p.json().codigo).toBe('ENVIO_RECOLHIDO')

    // Reenviar a mesma folha (pelo nº) depois de recolhida
    const de = await t.chamar('POST', `/api/folhas-campo/${envio.numero}/enviar-tecnico`, {
      cookie: t.cookieAdmin,
      payload: { tecnicoId: t.comumId },
    })
    expect(de.statusCode, de.body).toBe(200)
    const segundo = de.json().envio
    await baixarEConfirmar(t, token, segundo.id)
    const pedido = await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, {
      cookie: t.cookieComum,
      payload: { motivo: 'Trocar de técnico' },
    })
    expect(pedido.json()).toMatchObject({ imediato: false, envio: { situacao: 'NO_CELULAR', recolherPedidoPor: 'Comum Teste' } })
    const o = (await ola(token, [{ envioId: segundo.id, estado: 'NOVA' }])).json()
    expect(o.recolher).toEqual([segundo.id])
    expect(o.envios).toEqual([])
    const apaguei = await chamarCelular(t, token, 'POST', `/api/campo/envios/${segundo.id}/recolhimento`, {
      payload: { resposta: 'APAGUEI' },
    })
    expect(apaguei.json()).toEqual({ situacao: 'RECOLHIDA' })
    expect(auditoria('FOLHA_RECOLHIDA').length).toBeGreaterThanOrEqual(3)
  })

  it('"já comecei": a folha fica e volta preenchida (devolvida depois de recolhida)', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, { cookie: t.cookieAdmin, payload: { motivo: 'x' } })
    const r = await chamarCelular(t, token, 'POST', `/api/campo/envios/${envio.id}/recolhimento`, {
      payload: { resposta: 'JA_COMECEI' },
    })
    expect(r.json()).toEqual({ situacao: 'NO_CELULAR' })
    expect(envioNoBanco(envio.id).recolher_resposta).toBe('JA_COMECEI')
    const reg = registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    const e = await entregar(t, token, envio.id, reg)
    expect(e.json().marcas).not.toContain('APOS_RECOLHER')
    expect(envioNoBanco(envio.id)).toMatchObject({ situacao: 'DEVOLVIDA', devolvida_apos_recolher: 1 })
  })

  it('confirmação do recebimento com pedido de recolher em aberto: RECOLHIDA', async () => {
    const k = await c.calibracaoPronta()
    const { token } = await parearCelular(t)
    const { envio } = await enviarCalibracao(t, k.id)
    await chamarCelular(t, token, 'GET', `/api/campo/envios/${envio.id}/pacote`)
    const r = await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'x' },
    })
    expect(r.json().imediato).toBe(false)
    const rec = await chamarCelular(t, token, 'POST', `/api/campo/envios/${envio.id}/recebida`, { payload: {} })
    expect(rec.json()).toEqual({ situacao: 'RECOLHIDA' })
  })

  it('emitir com a folha ainda no celular cria o pedido de recolher (na hora, se ele ainda não baixou)', async () => {
    // Baixada: vira pedido, com o motivo; o celular recebe o pedido no olá e a emissão fica no registro de atividades
    const { k, token, envio } = await folhaNoCelular()
    const r = await c.emitir(t.ctx.repo.obterCalibracao(k.id)!)
    expect(r.statusCode, r.body).toBe(200)
    expect(envioNoBanco(envio.id)).toMatchObject({
      situacao: 'NO_CELULAR',
      recolher_motivo: 'Certificado emitido com os dados digitados no computador',
      recolher_pedido_por: 'Admin Teste',
    })
    expect(envioNoBanco(envio.id).recolher_pedido_em).not.toBe('')
    expect((await ola(token, [{ envioId: envio.id, estado: 'NOVA' }])).json().recolher).toEqual([envio.id])
    expect(auditoria('CERTIFICADO_EMITIDO').at(-1)?.detalhe).toContain(`a folha ${envio.numero} foi pedida de volta ao celular`)

    // Não baixada: recolhida na hora
    const k2 = await c.calibracaoPronta()
    const { envio: e2 } = await enviarCalibracao(t, k2.id)
    expect((await c.emitir(t.ctx.repo.obterCalibracao(k2.id)!)).statusCode).toBe(200)
    expect(envioNoBanco(e2.id)).toMatchObject({ situacao: 'RECOLHIDA', forcado: 0 })
    expect(auditoria('CERTIFICADO_EMITIDO').at(-1)?.detalhe).toContain(`a folha ${e2.numero} foi recolhida`)
  })

  it('ligar outra folha de papel à calibração pede de volta a que está no celular (e solta a trava)', async () => {
    const { k, token, envio } = await folhaNoCelular()
    await t.chamar('PUT', '/api/campo/configuracao', { cookie: t.cookieAdmin, payload: { registroOriginal: 'CELULAR' } })
    // A folha avulsa da mesma balança, impressa e preenchida no papel
    const avulsa = await t.chamar('GET', `/api/folha-campo?balancaId=${c.balanca.id}`, { cookie: t.cookieAdmin })
    expect(avulsa.statusCode, avulsa.body).toBe(200)
    const numero = String(avulsa.headers['x-folha-campo'])
    const r = await t.chamar('PUT', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieComum, payload: { numero } })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().recolhidas).toBe(`a folha ${envio.numero} foi pedida de volta ao celular`)
    expect(envioNoBanco(envio.id)).toMatchObject({
      situacao: 'NO_CELULAR',
      recolher_motivo: `Ligada a folha de papel ${numero}: o escritório digita do papel`,
    })
    expect((await ola(token, [{ envioId: envio.id, estado: 'NOVA' }])).json().recolher).toEqual([envio.id])
    // A trava saiu: as leituras podem ser digitadas do papel
    const atual = t.ctx.repo.obterCalibracao(k.id)!
    const mudar = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, ambiente: { ...atual.ambiente, temperaturaInicial: 26 }, versao: atual.versao },
    })
    expect(mudar.statusCode, mudar.body).toBe(200)
    // Ligar de novo a mesma folha não pede nada
    const deNovo = await t.chamar('PUT', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieComum, payload: { numero } })
    expect(deNovo.statusCode, deNovo.body).toBe(200)
    expect(deNovo.json().recolhidas).toBeUndefined()
  })

  it('à força: só o administrador, de qualquer situação viva', async () => {
    const { envio } = await folhaNoCelular()
    const comum = await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, {
      cookie: t.cookieComum,
      payload: { motivo: 'Celular perdido', forcar: true },
    })
    expect(comum.statusCode).toBe(403)
    const r = await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Celular perdido', forcar: true },
    })
    expect(r.json()).toMatchObject({ imediato: true, envio: { situacao: 'RECOLHIDA', forcado: true } })
  })
})

describe('confirmação e pacote', () => {
  it('o 1º GET grava baixado_em; a confirmação passa a NO_CELULAR (repetir é inofensivo); outro celular: 409', async () => {
    const k = await c.calibracaoPronta()
    const { token } = await parearCelular(t)
    const { envio } = await enviarCalibracao(t, k.id)
    const p = await chamarCelular(t, token, 'GET', `/api/campo/envios/${envio.id}/pacote`)
    expect(p.statusCode).toBe(200)
    expect(p.headers['content-type']).toMatch(/application\/json/)
    expect(p.body).toBe(String(envioNoBanco(envio.id).pacote))
    expect(envioNoBanco(envio.id).baixado_em).toBeTruthy()
    for (let i = 0; i < 2; i++) {
      const r = await chamarCelular(t, token, 'POST', `/api/campo/envios/${envio.id}/recebida`, { payload: {} })
      expect(r.json()).toEqual({ situacao: 'NO_CELULAR' })
    }
    expect(auditoria('FOLHA_RECEBIDA_CELULAR')).toHaveLength(1)
    // Outro celular do mesmo técnico
    const outro = await parearCelular(t, { aparelhoId: OUTRO_APARELHO })
    const r = await chamarCelular(t, outro.token, 'POST', `/api/campo/envios/${envio.id}/recebida`, { payload: {} })
    expect(r.statusCode).toBe(409)
    expect(r.json().codigo).toBe('OUTRO_CELULAR')
    // Envio de outro técnico ou que não existe: 404
    const nao = await chamarCelular(t, token, 'GET', '/api/campo/envios/00000000-0000-4000-8000-000000000000/pacote')
    expect(nao.statusCode).toBe(404)
    expect(nao.json().codigo).toBe('ENVIO_DESCONHECIDO')
  })
})

describe('entrega do registro', () => {
  it('grava como chegou, devolve o recibo que confere; o mesmo registro reenviado devolve o mesmo recibo', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    const reg = registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    const r = await entregar(t, token, envio.id, reg)
    expect(r.statusCode, r.body).toBe(200)
    const recibo = r.json() as ReciboCampo
    expect(reciboConfere(recibo, reg, shaDoRegistro(reg))).toBe(true)
    expect(recibo.situacao).toBe('VALIDO')
    expect(recibo.marcas).toEqual(['PILOTO'])
    const linha = t.ctx.db.prepare('SELECT * FROM registros_campo').get() as Record<string, string>
    expect(JSON.parse(linha.conteudo)).toEqual(reg)
    expect(JSON.parse(linha.problemas)).toEqual([])
    expect(envioNoBanco(envio.id)).toMatchObject({ situacao: 'DEVOLVIDA' })
    const de = await entregar(t, token, envio.id, reg)
    expect(de.json()).toEqual(recibo)
    expect((t.ctx.db.prepare('SELECT COUNT(*) AS n FROM registros_campo').get() as { n: number }).n).toBe(1)
    expect(auditoria('FOLHA_DEVOLVIDA_CELULAR')).toHaveLength(1)
    expect(auditoria('FOLHA_DEVOLVIDA_CELULAR')[0].detalhe).not.toContain(recibo.sha256)
    // O gatilho protege o conteúdo
    expect(() => t.ctx.db.prepare("UPDATE registros_campo SET conteudo = '{}'").run()).toThrow(/não pode ser alterado/)
  })

  it('envio desconhecido: grava como órfão', async () => {
    const { token, pacote } = await folhaNoCelular()
    const id = '11111111-2222-4333-8444-555555555555'
    const reg = registroDoPacote({ ...pacote, envioId: id }, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    const r = await entregar(t, token, id, reg)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().marcas).toEqual(expect.arrayContaining(['ORFAO']))
  })

  it('celular revogado entrega (marca APARELHO_REVOGADO), salvo "roubado" (401); o envio recolhido continua recolhido', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Celular perdido', forcar: true },
    })
    await t.chamar('POST', `/api/celulares/${APARELHO_TESTE}/revogar`, { cookie: t.cookieAdmin, payload: { motivo: 'PERDIDO' } })
    const reg = registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    const r = await entregar(t, token, envio.id, reg)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().marcas).toEqual(expect.arrayContaining(['APARELHO_REVOGADO', 'APOS_RECOLHER']))
    expect(envioNoBanco(envio.id).situacao).toBe('RECOLHIDA')
    await t.chamar('POST', `/api/celulares/${APARELHO_TESTE}/revogar`, { cookie: t.cookieAdmin, payload: { motivo: 'ROUBADO' } })
    const outro = assinar({ ...reg, trilha: [{ campo: 'x', de: '1', para: '2', em: reg.relogio.iniciadoEm, motivo: '' }] })
    const roubado = await entregar(t, token, envio.id, outro)
    expect(roubado.statusCode).toBe(401)
    expect(roubado.json().codigo).toBe('DESCADASTRADO')
  })

  it('entrega atrasada de um envio recolhido depois de a folha ser reenviada: grava (nunca 500) e a folha não vai de novo', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Celular perdido', forcar: true },
    })
    const novo = (
      await t.chamar('POST', `/api/folhas-campo/${envio.numero}/enviar-tecnico`, {
        cookie: t.cookieAdmin,
        payload: { tecnicoId: t.comumId },
      })
    ).json().envio
    expect(novo.situacao).toBe('ENVIADA')
    // O celular "achado no carro" entrega a folha antiga
    const r = await entregar(t, token, envio.id, registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }))
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().marcas).toContain('APOS_RECOLHER')
    expect(envioNoBanco(envio.id).situacao).toBe('RECOLHIDA')
    expect(envioNoBanco(novo.id).situacao).toBe('ENVIADA')
    // O novo é recolhido (não baixado: na hora) e a folha, que já voltou com dados, não vai de novo
    await t.chamar('POST', `/api/folhas-campo/${envio.numero}/recolher`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Já voltou' },
    })
    const de = await t.chamar('POST', `/api/folhas-campo/${envio.numero}/enviar-tecnico`, {
      cookie: t.cookieAdmin,
      payload: { tecnicoId: t.comumId },
    })
    expect(de.statusCode).toBe(409)
    expect(de.json().codigo).toBe('FOLHA_COM_REGISTRO')
  })

  it('técnico desativado: o celular revogado ainda entrega a folha começada', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    await t.chamar('PUT', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin, payload: { ativo: false } })
    const r = await entregar(t, token, envio.id, registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }))
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().marcas).toContain('APARELHO_REVOGADO')
    expect(auditoria('FOLHA_DEVOLVIDA_CELULAR')[0].usuario_id).toBe(t.comumId)
  })

  it('formato com problema e assinatura que não confere: grava com a marca FORMATO e a lista', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    const reg = registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    reg.motivoDesfecho = 'mudado depois de assinar'
    const r = await entregar(t, token, envio.id, reg)
    expect(r.statusCode).toBe(200)
    expect(r.json().marcas).toContain('FORMATO')
    const problemas = JSON.parse(
      String((t.ctx.db.prepare('SELECT problemas FROM registros_campo').get() as { problemas: string }).problemas),
    )
    expect(problemas.map((p: { campo: string }) => p.campo)).toContain('assinaturas.tecnico.conteudoSha256')
    // Qualquer objeto JSON é gravado
    const lixo = await entregar(t, token, envio.id, { qualquer: 'coisa' })
    expect(lixo.statusCode).toBe(200)
    expect(lixo.json().marcas).toContain('FORMATO')
  })

  it('assinatura PNG com o cabeçalho certo e os dados estragados: grava com a marca FORMATO e a folha impressa sai', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    const reg = registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    reg.assinaturas.tecnico!.png = pngRgbaIdatQueNaoEZlib()
    const r = await entregar(t, token, envio.id, reg)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().marcas).toContain('FORMATO')
    const linha = t.ctx.db.prepare('SELECT id, problemas FROM registros_campo').get() as { id: string; problemas: string }
    expect(JSON.parse(linha.problemas)).toEqual([
      { campo: 'assinaturas.tecnico.png', mensagem: 'A imagem da assinatura está corrompida.' },
    ])
    // Abrir a folha impressa assinada não derruba o servidor: a imagem sai como ilegível
    const pdf = await t.chamar('GET', `/api/campo/registros/${linha.id}/pdf`, { cookie: t.cookieComum })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
  })

  it('corpo que não é objeto JSON: 400 REGISTRO_ILEGIVEL; acima de 3 MB: 413 REGISTRO_GRANDE', async () => {
    const { token, envio } = await folhaNoCelular()
    const lista = await entregar(t, token, envio.id, [1, 2])
    expect(lista.statusCode).toBe(400)
    expect(lista.json().codigo).toBe('REGISTRO_ILEGIVEL')
    const quebrado = await chamarCelular(t, token, 'PUT', `/api/campo/registros/${envio.id}`, {
      payload: '{quebrado' as unknown as object,
      headers: { 'content-type': 'application/json' },
    })
    expect(quebrado.statusCode).toBe(400)
    expect(quebrado.json().codigo).toBe('REGISTRO_ILEGIVEL')
    const grande = await entregar(t, token, envio.id, { lixo: 'x'.repeat(3 * 1024 * 1024 + 10) })
    expect(grande.statusCode).toBe(413)
    expect(grande.json().codigo).toBe('REGISTRO_GRANDE')
    expect((t.ctx.db.prepare('SELECT COUNT(*) AS n FROM registros_campo').get() as { n: number }).n).toBe(0)
  })

  it('relógio do celular a mais de 5 min: marca RELOGIO com a diferença', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    const atrasado = new Date(Date.now() - 12 * 60_000).toISOString()
    const r = await entregar(t, token, envio.id, registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }), {
      agora: atrasado,
    })
    expect(r.json().marcas).toContain('RELOGIO')
    const d = (t.ctx.db.prepare('SELECT relogio_diferenca_s FROM registros_campo').get() as { relogio_diferenca_s: number })
      .relogio_diferenca_s
    expect(d).toBeLessThan(-11 * 60)
  })

  it('registro original no celular: sem a marca PILOTO', async () => {
    await t.chamar('PUT', '/api/campo/configuracao', { cookie: t.cookieAdmin, payload: { registroOriginal: 'CELULAR' } })
    const { token, envio, pacote } = await folhaNoCelular()
    expect(pacote.folha.piloto).toBe(false)
    const r = await entregar(t, token, envio.id, registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }))
    expect(r.json().marcas).toEqual([])
  })

  it('reaberta no celular e entregue de novo: a revisão anterior fica SUPERADO', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    const primeiro = registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    const r1 = (await entregar(t, token, envio.id, primeiro)).json() as ReciboCampo
    const segundo = registroDoPacote(pacote, {
      tecnico: { id: t.comumId, nome: 'Comum Teste' },
      ajustar: (r) => {
        r.motivoDesfecho = 'Refeito depois de reabrir.'
        r.reaberturas.push({ em: '2026-11-18T09:00:00-03:00', motivo: 'Conferir a OS', sha256Anterior: r1.sha256 })
      },
    })
    const r2 = (await entregar(t, token, envio.id, segundo)).json() as ReciboCampo
    expect(r2.situacao).toBe('VALIDO')
    const situacoes = t.ctx.db.prepare('SELECT sha256, situacao FROM registros_campo ORDER BY recebido_em, rowid').all()
    expect(situacoes).toEqual([
      { sha256: r1.sha256, situacao: 'SUPERADO' },
      { sha256: r2.sha256, situacao: 'VALIDO' },
    ])
    // O primeiro reenviado (recibo perdido) devolve o recibo dele, agora SUPERADO
    expect((await entregar(t, token, envio.id, primeiro)).json().situacao).toBe('SUPERADO')
  })

  it('corrigida depois da assinatura (sem reabrir) e entregue de novo: vale a com mais correções, em qualquer ordem', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    const assinado = registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } })
    const corrigir = (r: typeof assinado, para: string) => {
      const c = structuredClone(r)
      c.correcoesPosAssinatura.push({
        campo: 'final.termino',
        de: c.passos.final.termino,
        para,
        em: '2026-11-18T08:30:00-03:00',
        motivo: 'A hora do término foi anotada errada.',
        mostradoAoCliente: false,
      })
      return c
    }
    const uma = corrigir(assinado, '2026-11-18T08:10:00-03:00')
    const duas = corrigir(uma, '2026-11-18T08:12:00-03:00')
    const tres = corrigir(duas, '2026-11-18T08:14:00-03:00')
    const situacoes = () =>
      t.ctx.db.prepare('SELECT sha256, situacao, situacao_motivo FROM registros_campo ORDER BY recebido_em, rowid').all()

    // Na ordem: cada versão corrigida deixa a anterior SUPERADO
    const r0 = (await entregar(t, token, envio.id, assinado)).json() as ReciboCampo
    const r1 = (await entregar(t, token, envio.id, uma)).json() as ReciboCampo
    expect([r0.situacao, r1.situacao]).toEqual(['VALIDO', 'VALIDO'])
    expect(situacoes()).toEqual([
      {
        sha256: r0.sha256,
        situacao: 'SUPERADO',
        situacao_motivo: 'Chegou uma versão mais nova da mesma folha (corrigida no celular).',
      },
      { sha256: r1.sha256, situacao: 'VALIDO', situacao_motivo: '' },
    ])
    // Fora de ordem: a de três correções chega e vale; a de duas, que chega depois dela, já entra SUPERADO
    const r3 = (await entregar(t, token, envio.id, tres)).json() as ReciboCampo
    expect(r3.situacao).toBe('VALIDO')
    const atrasada = (await entregar(t, token, envio.id, duas)).json() as ReciboCampo
    expect(atrasada.situacao).toBe('SUPERADO')
    const validos = t.ctx.db
      .prepare("SELECT sha256 FROM registros_campo WHERE envio_id = ? AND situacao = 'VALIDO'")
      .all(envio.id) as Array<{ sha256: string }>
    expect(validos.map((x) => x.sha256)).toEqual([r3.sha256])
    expect(situacoes().at(-1)).toMatchObject({
      sha256: atrasada.sha256,
      situacao: 'SUPERADO',
      situacao_motivo: 'Chegou depois de uma versão mais nova da mesma folha (corrigida no celular).',
    })
  })
})

describe('trava da calibração (registro original no celular)', () => {
  it('no piloto (PAPEL) nada trava; com CELULAR, os passos de medição respondem 409 NO_CELULAR', async () => {
    const { k } = await folhaNoCelular()
    const atual = () => t.ctx.repo.obterCalibracao(k.id)!
    const mudarLeitura = (x: Calibracao) => ({
      ...x,
      ambiente: { ...x.ambiente, temperaturaInicial: 25 },
      versao: x.versao,
    })
    const papel = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin, payload: mudarLeitura(atual()) })
    expect(papel.statusCode, papel.body).toBe(200)
    await t.chamar('PUT', '/api/campo/configuracao', { cookie: t.cookieAdmin, payload: { registroOriginal: 'CELULAR' } })
    const travada = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...mudarLeitura(atual()), ambiente: { ...atual().ambiente, temperaturaInicial: 26 } },
    })
    expect(travada.statusCode).toBe(409)
    expect(travada.json().codigo).toBe('NO_CELULAR')
    expect(travada.json().erro).toContain('está no celular de Comum Teste:')
    // Fora dos passos de medição, continua livre
    const livre = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual(), observacoes: 'Livre', versao: atual().versao },
    })
    expect(livre.statusCode, livre.body).toBe(200)
    // O técnico excluído do sistema: a folha continua no celular (o envio vivo) e a frase não fica "de o técnico"
    expect((await t.chamar('DELETE', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin })).statusCode).toBeLessThan(300)
    const semNome = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...mudarLeitura(atual()), ambiente: { ...atual().ambiente, temperaturaInicial: 26 } },
    })
    expect(semNome.statusCode).toBe(409)
    expect(semNome.json().erro).toContain('está no celular do técnico:')
    // Recolher (pedido) libera a trava
    const numero = t.ctx.repo.folhaCampoDaCalibracao(k.id)!.numero
    await t.chamar('POST', `/api/folhas-campo/${numero}/recolher`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Digitar do papel' },
    })
    const depois = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...mudarLeitura(atual()), ambiente: { ...atual().ambiente, temperaturaInicial: 26 } },
    })
    expect(depois.statusCode, depois.body).toBe(200)
  })

  it('só o administrador muda a configuração', async () => {
    const r = await t.chamar('PUT', '/api/campo/configuracao', {
      cookie: t.cookieComum,
      payload: { registroOriginal: 'CELULAR' },
    })
    expect(r.statusCode).toBe(403)
    expect((await t.chamar('GET', '/api/campo/configuracao', { cookie: t.cookieComum })).json().config).toEqual({
      registroOriginal: 'PAPEL',
    })
    const ok = await t.chamar('PUT', '/api/campo/configuracao', {
      cookie: t.cookieAdmin,
      payload: { registroOriginal: 'CELULAR' },
    })
    expect(ok.json().config).toEqual({ registroOriginal: 'CELULAR' })
    expect(auditoria('CAMPO_CONFIGURADO')).toHaveLength(1)
  })
})

describe('no escritório', () => {
  it('a lista das folhas mostra o celular; o Painel mostra o que voltou e o que passou da data no celular', async () => {
    const { k, token, envio, pacote } = await folhaNoCelular()
    const lista = async () =>
      ((await t.chamar('GET', '/api/folhas-campo', { cookie: t.cookieComum })).json().itens as FolhaCampoListada[]).find(
        (f) => f.numero === envio.numero,
      )!
    expect((await lista()).celular).toMatchObject({
      envioId: envio.id,
      situacao: 'NO_CELULAR',
      tecnico: 'Comum Teste',
      marcas: [],
    })
    // Com a data prevista passada: "Ainda no celular"
    t.ctx.db.prepare("UPDATE folhas_campo_envios SET data_prevista = '2020-01-01' WHERE id = ?").run(envio.id)
    const painel = (await t.chamar('GET', '/api/painel', { cookie: t.cookieComum })).json().painel
    expect(painel.campo.aindaNoCelular).toEqual([expect.objectContaining({ numero: envio.numero, calibracaoId: k.id })])
    await entregar(t, token, envio.id, registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }))
    expect((await lista()).celular).toMatchObject({ situacao: 'DEVOLVIDA', voltou: true, marcas: ['PILOTO'] })
    const depois = (await t.chamar('GET', '/api/painel', { cookie: t.cookieComum })).json().painel
    expect(depois.campo.voltaram).toEqual([expect.objectContaining({ numero: envio.numero, marcas: ['PILOTO'] })])
    expect(depois.campo.aindaNoCelular).toEqual([])
  })

  it('o registro, os envios da folha, a folha impressa assinada (PDF), descartar e a importação', async () => {
    const { k, token, envio, pacote } = await folhaNoCelular()
    await entregar(t, token, envio.id, registroDoPacote(pacote, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }))
    const campo = (
      await t.chamar('GET', `/api/folhas-campo/${envio.numero}/campo`, { cookie: t.cookieComum })
    ).json() as CampoDaFolha
    expect(campo).toMatchObject({
      numero: envio.numero,
      dadosCongelados: true,
      envios: [{ id: envio.id, situacao: 'DEVOLVIDA' }],
    })
    const id = campo.registros[0].id
    expect(JSON.stringify(campo)).not.toMatch(/[0-9a-f]{64}/)
    const det = (await t.chamar('GET', `/api/campo/registros/${id}`, { cookie: t.cookieComum })).json() as RegistroCampoDetalhe
    expect(det.registro).toMatchObject({
      numero: envio.numero,
      situacao: 'VALIDO',
      celular: 'Celular de Comum',
      importado: false,
    })
    expect(det.pacote?.envioId).toBe(envio.id)
    const pdf = await t.chamar('GET', `/api/campo/registros/${id}/pdf`, { cookie: t.cookieComum })
    expect(pdf.statusCode, pdf.body.slice(0, 200)).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    // A importação (gravada por quem implementa "Puxar"/"Comparar")
    t.ctx.campo!.repo.registrarImportacao({
      registroId: id,
      calibracaoId: k.id,
      tipo: 'COMPARACAO',
      versaoAntes: 3,
      versaoDepois: 3,
      por: 'Teste',
      resumo: { diferencas: 0 },
    })
    expect(t.ctx.campo!.repo.registroComPacote(id).registro.numero).toBe(envio.numero)
    const listado = (await t.chamar('GET', `/api/campo/registros?numero=${envio.numero}`, { cookie: t.cookieComum })).json()
    expect(listado.registros[0].importado).toBe(true)
    const desc = await t.chamar('POST', `/api/campo/registros/${id}/descartar`, {
      cookie: t.cookieComum,
      payload: { motivo: 'Teste' },
    })
    expect(desc.json().registro).toMatchObject({ situacao: 'DESCARTADO', situacaoMotivo: 'Teste', situacaoPor: 'Comum Teste' })
    expect(auditoria('REGISTRO_CAMPO_SITUACAO')).toHaveLength(1)
  })

  it('um órfão é ligado a uma folha; registro alterado fora do sistema é recusado na leitura', async () => {
    const { token, envio, pacote } = await folhaNoCelular()
    const id = '11111111-2222-4333-8444-555555555555'
    await entregar(
      t,
      token,
      id,
      registroDoPacote({ ...pacote, envioId: id }, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }),
    )
    const orfao = (await t.chamar('GET', '/api/campo/registros?orfaos=1', { cookie: t.cookieComum })).json().registros[0]
    const r = await t.chamar('POST', `/api/campo/registros/${orfao.id}/ligar`, {
      cookie: t.cookieComum,
      payload: { numero: envio.numero },
    })
    expect(r.json().registro.ligadoA).toBe(envio.numero)
    // Alterado direto no arquivo do banco (sem o gatilho)
    t.ctx.db.exec('DROP TRIGGER registros_campo_protegido')
    t.ctx.db.prepare("UPDATE registros_campo SET conteudo = '{}' WHERE id = ?").run(orfao.id)
    const lido = await t.chamar('GET', `/api/campo/registros/${orfao.id}`, { cookie: t.cookieComum })
    expect(lido.statusCode).toBe(409)
    expect(lido.json().codigo).toBe('REGISTRO_ALTERADO')
  })

  it('APK: sem o arquivo, info indisponível e 404 com a frase', async () => {
    const info = await t.app.inject({ method: 'GET', url: '/api/campo/apk/info' })
    expect(info.json()).toMatchObject({ disponivel: false })
    const apk = await t.app.inject({ method: 'GET', url: '/api/campo/apk' })
    expect(apk.statusCode).toBe(404)
    expect(apk.json().erro).toMatch(/não trouxe o app do celular/)
  })
})

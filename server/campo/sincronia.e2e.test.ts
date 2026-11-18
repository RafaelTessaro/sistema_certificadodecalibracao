// Ponta a ponta: o servidor de verdade (Fastify escutando em 127.0.0.1:0, pasta de dados temporária, banco na memória) e
// o núcleo de verdade do app BC Calibração (app-campo/src/nucleo) num "celular" no Node
// (server/campo/__fixtures__/celularSimulado.ts), falando HTTP de verdade, com os prazos, o token e a rede que cai. Um dia
// inteiro de campo (o cadastro do celular, duas folhas, o preenchimento com um aviso conferido, as assinaturas, a entrega
// com a resposta perdida e o reenvio, o escritório lendo o registro e o PDF, comparando no piloto, puxando com o celular
// como registro original e a emissão pedindo a justificativa) e as variações: relógio adiantado, recolher, o Wi-Fi que
// cai entre baixar e confirmar, envios que o servidor não conhece mais (órfão), descadastrar, entrega atrasada de uma
// folha reenviada a outro técnico, encerrar sem completar, recomeçar os ensaios, corrigir depois de assinar, reabrir
// depois de um recibo perdido, laboratório, endereço do servidor que mudou e parear de novo.

import { createServer as criarServidorHttp } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularSha256Registro, sha256Hex } from '#shared/campo/canonico.ts'
import { PENDENCIA_JUSTIFICATIVA_CAMPO } from '#shared/campo/importar.ts'
import { MENSAGEM_SEM_SERVIDOR, MENSAGENS_ERRO_CAMPO } from '#shared/campo/protocolo.ts'
import type { RegistroCampo } from '#shared/campo/tipos.ts'
import type {
  Calibracao,
  CampoDaCalibracao,
  EnvioCampoListado,
  PareamentoIniciado,
  RegistroCampoDetalhe,
  RegistroCampoListado,
} from '#shared/tipos.ts'
import { ClienteCampo } from '../../app-campo/src/nucleo/cliente.ts'
import { MOTIVO_ENTREGA_DESCADASTRADO } from '../../app-campo/src/nucleo/sincronia.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin } from '../auxiliaresTeste.ts'
import { abrirPortaIntermediaria, ACOMPANHANTE, CelularSimulado, rota } from './__fixtures__/celularSimulado.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>
/** "http://127.0.0.1:<porta>": onde o servidor de verdade escuta. */
let endereco: string
let porta: number

beforeEach(async () => {
  t = await criarAppComLogin()
  c = await cenarioCalibracao(t)
  await t.app.listen({ host: '127.0.0.1', port: 0 })
  porta = (t.app.server.address() as { port: number }).port
  endereco = `http://127.0.0.1:${porta}`
})
afterEach(async () => {
  await t.fechar()
})

const APARELHO_A = '0c6a7f52-9d3b-4e1a-8f20-5b4c3d2e1f00'
const APARELHO_B = '1d7b8063-ae4c-4f2b-9031-6c5d4e3f2a11'

// ---- O escritório (as telas do computador, com o cookie da sessão) -------------------------------------------------

/** "Cadastrar celular" (ou "Parear de novo", com o aparelho): o código e o QR com o endereço do servidor. */
async function pedirCodigo(o: { usuarioId?: string; aparelhoId?: string; endereco?: string } = {}): Promise<PareamentoIniciado> {
  const r = o.aparelhoId
    ? await t.chamar('POST', `/api/celulares/${o.aparelhoId}/parear-de-novo`, {
        cookie: t.cookieAdmin,
        payload: { endereco: o.endereco ?? endereco },
      })
    : await t.chamar('POST', '/api/celulares/pareamento', {
        cookie: t.cookieAdmin,
        payload: { usuarioId: o.usuarioId ?? t.comumId, endereco: o.endereco ?? endereco },
      })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().pareamento
}

/** Um celular cadastrado (o técnico lê o QR). */
async function celularPareado(o: { usuarioId?: string; aparelhoId?: string; endereco?: string } = {}) {
  const cel = new CelularSimulado({ aparelhoId: o.aparelhoId ?? APARELHO_A })
  const p = await pedirCodigo({ usuarioId: o.usuarioId, endereco: o.endereco })
  expect(await cel.parear(p.qr)).toBeNull()
  return cel
}

/** "Enviar para o técnico" a folha de uma calibração. */
async function enviarCalibracao(k: Calibracao, o: { tecnicoId?: string; recado?: string } = {}): Promise<EnvioCampoListado> {
  const r = await t.chamar('POST', `/api/calibracoes/${k.id}/enviar-tecnico`, {
    cookie: t.cookieComum,
    payload: { tecnicoId: o.tecnicoId ?? t.comumId, dataPrevista: '', recado: o.recado ?? '' },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().envio
}

/** "Enviar para o técnico" uma folha em branco (cliente e balança informados no local). */
async function enviarEmBranco(tecnicoId = t.comumId): Promise<EnvioCampoListado> {
  const r = await t.chamar('POST', '/api/folha-campo/enviar-tecnico', { cookie: t.cookieComum, payload: { tecnicoId } })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().envio
}

async function recolher(numero: string, o: { forcar?: boolean; motivo?: string } = {}) {
  const r = await t.chamar('POST', `/api/folhas-campo/${numero}/recolher`, {
    cookie: o.forcar ? t.cookieAdmin : t.cookieComum,
    payload: { motivo: o.motivo ?? 'O cliente remarcou a visita.', forcar: !!o.forcar },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as { envio: EnvioCampoListado; imediato: boolean }
}

async function revogar(aparelhoId: string, motivo: string) {
  const r = await t.chamar('POST', `/api/celulares/${aparelhoId}/revogar`, { cookie: t.cookieAdmin, payload: { motivo } })
  expect(r.statusCode, r.body).toBe(200)
}

async function configurar(registroOriginal: 'PAPEL' | 'CELULAR') {
  const r = await t.chamar('PUT', '/api/campo/configuracao', { cookie: t.cookieAdmin, payload: { registroOriginal } })
  expect(r.statusCode, r.body).toBe(200)
}

async function registrosDaFolha(numero: string): Promise<RegistroCampoListado[]> {
  const r = await t.chamar('GET', `/api/campo/registros?numero=${numero}`, { cookie: t.cookieComum })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().registros
}

async function registroGravado(id: string): Promise<RegistroCampoDetalhe> {
  const r = await t.chamar('GET', `/api/campo/registros/${id}`, { cookie: t.cookieComum })
  expect(r.statusCode, r.body).toBe(200)
  return r.json()
}

async function campoDe(k: Pick<Calibracao, 'id'>): Promise<CampoDaCalibracao> {
  const r = await t.chamar('GET', `/api/calibracoes/${k.id}/campo`, { cookie: t.cookieComum })
  expect(r.statusCode, r.body).toBe(200)
  return r.json()
}

/** "Puxar dados do campo" (registro original = CELULAR) do registro que vale para a calibração. */
async function puxar(k: Pick<Calibracao, 'id'>, escolhas: Record<string, 'CELULAR' | 'RASCUNHO'> = {}) {
  const atual = t.ctx.repo.obterCalibracao(k.id)!
  const { registroId } = await campoDe(k)
  expect(registroId).toBeTruthy()
  const r = await t.chamar('POST', `/api/calibracoes/${k.id}/puxar-campo`, {
    cookie: t.cookieComum,
    payload: { registroId, versao: atual.versao, escolhas },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as { calibracao: Calibracao; pendencias: string[] }
}

/** Cadastra outro técnico (sem entrar no sistema: só recebe folhas no celular). */
async function outroTecnico(nome: string, login: string): Promise<string> {
  const r = await t.chamar('POST', '/api/usuarios', {
    cookie: t.cookieAdmin,
    payload: { nome, login, nivel: 'COMUM', senha: '' },
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().usuario.id
}

const envioNoBanco = (id: string) =>
  t.ctx.db.prepare('SELECT * FROM folhas_campo_envios WHERE id = ?').get(id) as Record<string, string | number>

const auditoria = (acao: string) =>
  t.ctx.db.prepare('SELECT * FROM auditoria WHERE acao = ? ORDER BY id').all(acao) as Array<Record<string, string>>

const ponto = (k: Calibracao, id: string) => k.indicacao.pontos.find((p) => p.id === id)!

const shaDoRegistro = (r: RegistroCampo) => calcularSha256Registro(r, sha256Hex)

/** O servidor nunca respondeu 500 ao celular. */
function semErroDoServidor(cel: CelularSimulado) {
  expect(cel.rede.historico.filter((h) => typeof h.status === 'number' && h.status >= 500)).toEqual([])
}

// ---- Um dia inteiro ------------------------------------------------------------------------------------------------

describe('um dia de campo, de ponta a ponta', () => {
  it('cadastrar o celular, receber duas folhas, preencher, assinar, entregar com a rede caindo e levar à calibração', async () => {
    // Manhã, no escritório: o administrador cadastra o celular do técnico (o QR leva o endereço e o código)
    const k = await c.calibracaoPronta()
    const p = await pedirCodigo()
    expect(p.qr).toBe(`BCCAL1|${endereco}|${p.codigo}`)
    const cel = new CelularSimulado({ aparelhoId: APARELHO_A })
    expect(await cel.parear(p.qr)).toBeNull()
    const saude = (await t.app.inject({ method: 'GET', url: '/api/saude' })).json()
    expect(cel.pareamento).toMatchObject({
      endereco,
      aparelhoId: APARELHO_A,
      tecnico: { id: t.comumId, nome: 'Comum Teste' },
      servidor: { id: saude.id },
    })
    const token = cel.pareamento!.token
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const linha = t.ctx.db.prepare('SELECT * FROM dispositivos WHERE id = ?').get(APARELHO_A) as Record<string, string>
    expect(linha.token_sha256).toBe(sha256Hex(token))
    expect(JSON.stringify(linha)).not.toContain(token)
    const situacao = await t.chamar('GET', `/api/celulares/pareamento/${p.id}`, { cookie: t.cookieAdmin })
    expect(situacao.json().pareamento.situacao).toBe('PAREADO')

    // O escritório manda duas folhas: a da calibração (com recado) e uma em branco
    const daCalibracao = await enviarCalibracao(k, { recado: 'Levar a escada da doca 2.' })
    const emBranco = await enviarEmBranco()
    expect(daCalibracao).toMatchObject({ situacao: 'ENVIADA', tipo: 'calibracao', piloto: true, tecnico: 'Comum Teste' })
    expect(emBranco).toMatchObject({ situacao: 'ENVIADA', tipo: 'branco', cliente: '' })
    const fc = daCalibracao.numero

    // "Atualizar agora": olá, os dois pacotes e as duas confirmações
    let r = await cel.sincronizar()
    expect(r).toMatchObject({ conectou: true, falha: null, descadastrado: false, recebeFolhas: true, avisos: [] })
    expect([...r.novas].sort()).toEqual([fc, emBranco.numero].sort())
    expect(cel.rede.conversa()).toEqual([
      'GET /api/saude → 200',
      'POST /api/campo/parear → 200',
      'POST /api/campo/ola → 200',
      `GET /api/campo/envios/${daCalibracao.id}/pacote → 200`,
      `POST /api/campo/envios/${daCalibracao.id}/recebida → 200`,
      `GET /api/campo/envios/${emBranco.id}/pacote → 200`,
      `POST /api/campo/envios/${emBranco.id}/recebida → 200`,
    ])
    for (const envio of [daCalibracao, emBranco]) {
      const f = await cel.exigirFolha(envio.numero)
      const banco = envioNoBanco(envio.id)
      expect(f.estado).toBe('NOVA')
      expect(banco).toMatchObject({ situacao: 'NO_CELULAR', dispositivo_id: APARELHO_A, estado_celular: 'NOVA' })
      // O pacote chegou inteiro: o mesmo sha256 (interno) nos dois lados
      expect(f.pacoteSha256).toBe(banco.pacote_sha256)
    }
    expect((await cel.exigirFolha(fc)).pacote!.folha).toMatchObject({
      numero: fc,
      recado: 'Levar a escada da doca 2.',
      piloto: true,
    })
    // O computador vê o celular ("visto às … · IP") e as folhas nele
    const [celular] = (await t.chamar('GET', '/api/celulares', { cookie: t.cookieAdmin })).json().celulares
    expect(celular).toMatchObject({ id: APARELHO_A, ultimoIp: '127.0.0.1', folhasNoCelular: 2, versaoApp: '1.1.0' })
    expect(celular.ultimoContato).toBeTruthy()
    // De novo: nada a baixar, só o olá
    let desde = cel.rede.historico.length
    await cel.sincronizar()
    expect(cel.rede.conversa(desde)).toEqual(['POST /api/campo/ola → 200'])

    // No cliente, fora da rede da empresa: preenche com um aviso "Confira a digitação" e confere
    cel.rede.foraDoAr = true
    await cel.preencher(fc, { digitacao: true })
    const avisos = await cel.avisosPendentes(fc)
    expect(avisos).toEqual([
      expect.objectContaining({ classe: 'DIGITACAO', codigo: 'MENOS_CASAS', campo: 'indicacao.pontos.b.crescente' }),
    ])
    expect(await cel.conferirAvisosDeDigitacao(fc)).toHaveLength(1)
    expect(await cel.avisosPendentes(fc)).toEqual([])
    const semRede = await cel.sincronizar()
    expect(semRede).toMatchObject({ conectou: false, falha: { tipo: 'REDE', mensagem: MENSAGEM_SEM_SERVIDOR(endereco) } })
    let f = await cel.finalizarEAssinar(fc)
    expect(f).toMatchObject({ estado: 'FINALIZADA', modoEntrega: null })
    expect(f.registro!.assinaturas.tecnico).toMatchObject({ nome: 'Comum Teste' })
    expect(f.registro!.assinaturas.cliente).toMatchObject(ACOMPANHANTE)
    expect(f.registro!.avisosConferidos).toEqual([expect.objectContaining({ codigo: 'MENOS_CASAS', classe: 'DIGITACAO' })])

    // A folha em branco: cliente e balança anotados no local; a balança não tinha condições (não calibrada)
    await cel.comecar(emBranco.numero)
    await cel.mexer(emBranco.numero, (x, em) => {
      x.passos.chegada.clienteInformado = {
        razaoSocial: 'Padaria Pão Dourado Ltda',
        documento: '',
        endereco: 'Rua 3, 450 - Centro - Rio Claro/SP',
        enderecoIgualAoLocal: true,
        contato: 'Antônio',
        email: '',
      }
      x.passos.chegada.local = 'CLIENTE'
      x.passos.chegada.localEndereco = 'Rua 3, 450 - Centro - Rio Claro/SP'
      x.passos.chegada.inicio = em
      Object.assign(x.passos.balanca.informada!, {
        tipo: 'Plataforma',
        fabricante: 'Toledo',
        modelo: '2098',
        numeroSerie: 'TL-88120',
        classe: 'III',
        unidade: 'kg',
        faixas: [{ max: '300', e: '0,1', d: '0,1' }],
        min: '2',
      })
    })
    await cel.encerrar(emBranco.numero, 'NAO_CALIBRADA', 'A célula de carga está danificada: a indicação não estabiliza.')
    await cel.finalizar(emBranco.numero)
    await cel.assinarComoTecnico(emBranco.numero)
    f = await cel.clienteNaoAssinou(emBranco.numero, 'O responsável não estava na loja.')
    expect(f.estado).toBe('FINALIZADA')
    const assinada = structuredClone((await cel.exigirFolha(fc)).registro!)

    // De volta à empresa: o servidor grava a 1ª entrega, mas a resposta se perde no caminho
    cel.rede.foraDoAr = false
    cel.rede.cairDepois(rota('PUT', '/api/campo/registros/'))
    r = await cel.sincronizar()
    expect(r.falha?.tipo).toBe('REDE')
    expect(r.entregues).toEqual([])
    expect(r.naoEntregues).toEqual([{ numero: fc, motivo: expect.stringMatching(/A conexão caiu durante a entrega/) }])
    let gravados = await registrosDaFolha(fc)
    expect(gravados).toHaveLength(1)
    // Sem o recibo, nada sai do celular
    f = await cel.exigirFolha(fc)
    expect(f).toMatchObject({ estado: 'FINALIZADA', recibo: null, entrega: { tentativas: 1 } })
    expect(f.registro).toEqual(assinada)
    expect((await cel.exigirFolha(emBranco.numero)).estado).toBe('FINALIZADA')

    // A próxima rodada entrega de novo: o mesmo recibo, nada gravado em dobro; só então os dados saem do celular
    desde = cel.rede.historico.length
    r = await cel.sincronizar()
    expect(r.falha).toBeNull()
    expect(cel.rede.conversa(desde)).toEqual([
      'POST /api/campo/ola → 200',
      `PUT /api/campo/registros/${daCalibracao.id} → 200`,
      `PUT /api/campo/registros/${emBranco.id} → 200`,
    ])
    expect(r.entregues.map((e) => e.numero).sort()).toEqual([fc, emBranco.numero].sort())
    gravados = await registrosDaFolha(fc)
    expect(gravados).toHaveLength(1)
    expect(r.entregues.find((e) => e.numero === fc)!.recebidoEm).toBe(gravados[0].recebidoEm)
    f = await cel.exigirFolha(fc)
    expect(f).toMatchObject({ estado: 'ENTREGUE', registro: null, pacote: null })
    expect(f.recibo).toEqual({
      numero: fc,
      envioId: daCalibracao.id,
      sha256: shaDoRegistro(assinada),
      recebidoEm: gravados[0].recebidoEm,
      situacao: 'VALIDO',
      marcas: ['PILOTO'],
    })
    expect(auditoria('FOLHA_DEVOLVIDA_CELULAR').filter((a) => a.detalhe.startsWith(fc))).toHaveLength(1)
    expect(envioNoBanco(daCalibracao.id)).toMatchObject({ situacao: 'DEVOLVIDA', estado_celular: 'ENTREGUE' })
    semErroDoServidor(cel)

    // No escritório: o registro como chegou e a folha impressa assinada (PDF gerado na hora)
    const detalhe = await registroGravado(gravados[0].id)
    expect(detalhe.conteudo).toEqual(assinada)
    expect(detalhe.registro).toMatchObject({
      situacao: 'VALIDO',
      marcas: ['PILOTO'],
      problemas: [],
      desfecho: 'COMPLETA',
      tecnico: 'Comum Teste',
      celular: 'Celular de Comum',
    })
    const pdf = await t.chamar('GET', `/api/campo/registros/${gravados[0].id}/pdf`, { cookie: t.cookieComum })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toMatch(/^application\/pdf/)
    expect(pdf.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    const [branco] = await registrosDaFolha(emBranco.numero)
    expect(branco).toMatchObject({ desfecho: 'NAO_CALIBRADA', marcas: ['PILOTO'], problemas: [] })
    expect((await registroGravado(branco.id)).conteudo).toMatchObject({
      motivoDesfecho: 'A célula de carga está danificada: a indicação não estabiliza.',
      assinaturas: { cliente: { naoAssinou: true, motivo: 'O responsável não estava na loja.' } },
    })
    const painel = (await t.chamar('GET', '/api/painel', { cookie: t.cookieComum })).json().painel
    expect(painel.campo.voltaram.map((v: { numero: string }) => v.numero).sort()).toEqual([fc, emBranco.numero].sort())

    // Piloto (o papel é o registro original): "Comparar com o campo" grava a comparação e não mexe no rascunho
    const campo = await campoDe(k)
    expect(campo).toMatchObject({ registroOriginal: 'PAPEL', numero: fc, registroId: gravados[0].id, travada: false })
    const versaoAntes = t.ctx.repo.obterCalibracao(k.id)!.versao
    const comparada = await t.chamar('POST', `/api/calibracoes/${k.id}/comparar-campo`, {
      cookie: t.cookieComum,
      payload: { registroId: campo.registroId, observacao: 'Conferido com a folha de papel.' },
    })
    expect(comparada.statusCode, comparada.body).toBe(200)
    expect(comparada.json().diferentes).toBeGreaterThan(0)
    const itens = comparada.json().importacao.resumo.itens as Array<{ chave: string; celular: string; rascunho: string }>
    expect(itens.find((x) => x.chave === 'indicacao.pontos.c.crescente')).toMatchObject({ celular: '30,02', rascunho: '30,01' })
    expect(t.ctx.repo.obterCalibracao(k.id)!.versao).toBe(versaoAntes)

    // O celular passa a ser o registro original: "Puxar dados do campo" leva as leituras ao rascunho. O rascunho foi
    // digitado do papel no piloto, com a descida no zero e em Max, que o celular não anota (como a folha impressa): o
    // escritório escolhe "Fica: o do celular" nas duas
    await configurar('CELULAR')
    const puxado = await puxar(k, { 'indicacao.pontos.z.decrescente': 'CELULAR', 'indicacao.pontos.c.decrescente': 'CELULAR' })
    const puxada = puxado.calibracao
    expect(ponto(puxada, 'z').decrescente).toBeNull()
    expect(ponto(puxada, 'c').decrescente).toBeNull()
    expect(ponto(puxada, 'c').crescente).toBe(30.02)
    expect(ponto(puxada, 'b').crescente).toBe(10)
    expect(ponto(puxada, 'd')).toMatchObject({ crescente: 20.01, decrescente: 20.02 })
    expect(puxada.ambiente).toMatchObject({
      temperaturaInicial: 22.4,
      umidadeInicial: 56,
      pressao: 927.3,
      temperaturaFinal: 22.9,
    })
    expect(puxada.tecnicoId).toBe(t.comumId)
    expect(puxado.pendencias.filter((x) => x.startsWith(PENDENCIA_JUSTIFICATIVA_CAMPO))).toEqual([])

    // O escritório digita de novo uma leitura do papel: a emissão fica pendente até a justificativa
    const mudada = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieComum,
      payload: {
        ...puxada,
        indicacao: {
          ...puxada.indicacao,
          pontos: puxada.indicacao.pontos.map((x) => (x.id === 'c' ? { ...x, crescente: 30.01 } : x)),
        },
        versao: puxada.versao,
      },
    })
    expect(mudada.statusCode, mudada.body).toBe(200)
    expect(mudada.json().pendencias).toContainEqual(expect.stringContaining(PENDENCIA_JUSTIFICATIVA_CAMPO))
    let atual = mudada.json().calibracao as Calibracao
    const recusada = await c.emitir(atual)
    expect(recusada.statusCode).toBe(409)
    expect(recusada.json().erro).toMatch(PENDENCIA_JUSTIFICATIVA_CAMPO)
    const justificada = await t.chamar('POST', `/api/calibracoes/${k.id}/justificativa-campo`, {
      cookie: t.cookieComum,
      payload: { texto: 'A leitura do papel foi conferida com o técnico.', versao: atual.versao },
    })
    expect(justificada.statusCode, justificada.body).toBe(200)
    atual = justificada.json().calibracao
    const emitida = await c.emitir(atual)
    expect(emitida.statusCode, emitida.body).toBe(200)
    expect(emitida.json().calibracao.emissao.campo).toMatchObject({
      registroId: campo.registroId,
      numero: fc,
      divergencias: [expect.objectContaining({ chave: 'indicacao.pontos.c.crescente', celular: '30,02', certificado: '30,01' })],
      justificativa: 'A leitura do papel foi conferida com o técnico.',
    })
  })
})

// ---- Variações -----------------------------------------------------------------------------------------------------

/** Uma folha de uma calibração nova enviada ao técnico e baixada pelo celular. */
async function folhaNoCelular(cel: CelularSimulado, o: { tecnicoId?: string } = {}) {
  const k = await c.calibracaoPronta()
  const envio = await enviarCalibracao(k, o)
  const r = await cel.sincronizar()
  expect(r.novas).toContain(envio.numero)
  return { k, envio, fc: envio.numero }
}

describe('variações do dia', () => {
  it('relógio do celular adiantado 10 min: o registro chega com a marca RELOGIO (4 min não marca)', async () => {
    const cel = await celularPareado()
    const a = await folhaNoCelular(cel)
    const b = await folhaNoCelular(cel)
    await cel.preencher(a.fc)
    await cel.finalizarEAssinar(a.fc)
    cel.relogio.desvioMs = 10 * 60_000
    const r = await cel.sincronizar()
    expect(r.relogioDiferencaMs).toBeGreaterThan(9.9 * 60_000)
    expect(r.relogioDiferencaMs).toBeLessThan(10.1 * 60_000)
    expect(r.entregues.map((e) => e.numero)).toEqual([a.fc])
    expect((await cel.exigirFolha(a.fc)).recibo!.marcas).toEqual(['RELOGIO', 'PILOTO'])
    const [g] = await registrosDaFolha(a.fc)
    expect(g.marcas).toEqual(['RELOGIO', 'PILOTO'])
    expect(g.relogioDiferencaS).toBeGreaterThanOrEqual(594)
    expect(g.relogioDiferencaS).toBeLessThanOrEqual(606)
    // A folha impressa assinada sai também com a marca
    expect((await t.chamar('GET', `/api/campo/registros/${g.id}/pdf`, { cookie: t.cookieComum })).statusCode).toBe(200)

    cel.relogio.desvioMs = 4 * 60_000
    await cel.preencher(b.fc)
    await cel.finalizarEAssinar(b.fc)
    expect((await cel.sincronizar()).entregues.map((e) => e.numero)).toEqual([b.fc])
    expect((await registrosDaFolha(b.fc))[0].marcas).toEqual(['PILOTO'])
  })

  it('recolher: na hora antes de baixar; pedido depois de baixar (apaga a não começada; "já comecei" guarda e entrega)', async () => {
    // Com o celular como registro original: a folha no celular trava os passos de medição no computador
    await configurar('CELULAR')
    const cel = await celularPareado()

    // 1. Ainda não baixada: recolhida na hora, o celular nem fica sabendo
    const k1 = await c.calibracaoPronta()
    const e1 = await enviarCalibracao(k1)
    expect(await recolher(e1.numero)).toMatchObject({ imediato: true, envio: { situacao: 'RECOLHIDA' } })
    let desde = cel.rede.historico.length
    let r = await cel.sincronizar()
    expect(r).toMatchObject({ novas: [], retiradas: [], falha: null })
    expect(cel.rede.conversa(desde)).toEqual(['POST /api/campo/ola → 200'])
    expect(await cel.folha(e1.numero)).toBeNull()

    // 2. Baixada e não começada: vira pedido; o celular apaga e responde "Apaguei"
    const dois = await folhaNoCelular(cel)
    const pedido = await recolher(dois.fc)
    expect(pedido.imediato).toBe(false)
    expect(pedido.envio).toMatchObject({ situacao: 'NO_CELULAR' })
    expect(pedido.envio.recolherPedidoEm).toBeTruthy()
    desde = cel.rede.historico.length
    r = await cel.sincronizar()
    expect(r.retiradas).toEqual([dois.fc])
    expect(cel.rede.conversa(desde)).toEqual([
      'POST /api/campo/ola → 200',
      `POST /api/campo/envios/${dois.envio.id}/recolhimento → 200`,
    ])
    expect(await cel.exigirFolha(dois.fc)).toMatchObject({ estado: 'RETIRADA', pacote: null, motivoRetirada: 'RECOLHIDA' })
    expect(envioNoBanco(dois.envio.id)).toMatchObject({ situacao: 'RECOLHIDA', estado_celular: 'RETIRADA' })

    // 3. Começada: a trava vale até o pedido; o celular responde "Já comecei", guarda a folha e entrega depois
    const tres = await folhaNoCelular(cel)
    await cel.preencher(tres.fc, { ateIndicacao: true })
    const editor = t.ctx.repo.obterCalibracao(tres.k.id)!
    const mudarNoComputador = (k: Calibracao) =>
      t.chamar('PUT', `/api/calibracoes/${k.id}`, {
        cookie: t.cookieComum,
        payload: { ...k, ambiente: { ...k.ambiente, temperaturaInicial: 23.5 }, versao: k.versao },
      })
    const travada = await mudarNoComputador(editor)
    expect(travada.statusCode).toBe(409)
    expect(travada.json().codigo).toBe('NO_CELULAR')
    expect((await recolher(tres.fc)).imediato).toBe(false)
    expect((await mudarNoComputador(editor)).statusCode).toBe(200)
    desde = cel.rede.historico.length
    r = await cel.sincronizar()
    expect(r.retiradas).toEqual([])
    expect(cel.rede.conversa(desde)).toEqual([
      'POST /api/campo/ola → 200',
      `POST /api/campo/envios/${tres.envio.id}/recolhimento → 200`,
    ])
    expect(await cel.exigirFolha(tres.fc)).toMatchObject({ estado: 'EM_PREENCHIMENTO', respondeuJaComecei: true })
    expect(envioNoBanco(tres.envio.id)).toMatchObject({ situacao: 'NO_CELULAR', recolher_resposta: 'JA_COMECEI' })
    // A próxima rodada não responde de novo
    desde = cel.rede.historico.length
    await cel.sincronizar()
    expect(cel.rede.conversa(desde)).toEqual(['POST /api/campo/ola → 200'])
    await cel.ensaiosFinais(tres.fc, (await cel.exigirFolha(tres.fc)).pacote!)
    await cel.finalizarEAssinar(tres.fc)
    r = await cel.sincronizar()
    expect(r.entregues.map((e) => e.numero)).toEqual([tres.fc])
    expect(envioNoBanco(tres.envio.id)).toMatchObject({ situacao: 'DEVOLVIDA', devolvida_apos_recolher: 1 })
    expect((await registrosDaFolha(tres.fc))[0]).toMatchObject({ situacao: 'VALIDO', marcas: [] })
    semErroDoServidor(cel)
  })

  it('o Wi-Fi cai entre baixar e confirmar: a folha não pode ser começada; na volta, confirma sem baixar de novo', async () => {
    const cel = await celularPareado()
    const k = await c.calibracaoPronta()
    const e = await enviarCalibracao(k)
    cel.rede.cairAntes(rota('POST', '/recebida'))
    let r = await cel.sincronizar()
    expect(r).toMatchObject({ novas: [], aguardando: [e.numero], falha: { tipo: 'REDE' } })
    expect(await cel.exigirFolha(e.numero)).toMatchObject({ estado: 'RECEBENDO', confirmadaEm: '' })
    await expect(cel.comecar(e.numero)).rejects.toThrow(/Conecte-se à rede da empresa/)
    // O escritório vê que o celular baixou, mas a folha ainda não está "no celular"
    expect(envioNoBanco(e.id)).toMatchObject({ situacao: 'ENVIADA', estado_celular: '' })
    expect(envioNoBanco(e.id).baixado_em).toBeTruthy()
    const desde = cel.rede.historico.length
    r = await cel.sincronizar()
    expect(cel.rede.conversa(desde)).toEqual(['POST /api/campo/ola → 200', `POST /api/campo/envios/${e.id}/recebida → 200`])
    expect(r).toMatchObject({ novas: [e.numero], aguardando: [], falha: null })
    expect((await cel.exigirFolha(e.numero)).estado).toBe('NOVA')
    expect(envioNoBanco(e.id)).toMatchObject({ situacao: 'NO_CELULAR', estado_celular: 'NOVA' })
  })

  it('o servidor não conhece mais os envios (voltou uma cópia antiga): a não começada sai sem aviso; a começada chega órfã e é ligada à folha', async () => {
    const cel = await celularPareado()
    const a = await folhaNoCelular(cel)
    const b = await folhaNoCelular(cel)
    await cel.preencher(b.fc)
    await cel.finalizarEAssinar(b.fc)
    t.ctx.db.prepare('DELETE FROM folhas_campo_envios').run()
    const r = await cel.sincronizar()
    expect(r).toMatchObject({ retiradas: [], falha: null })
    expect(r.entregues.map((e) => e.numero)).toEqual([b.fc])
    expect(await cel.exigirFolha(a.fc)).toMatchObject({
      estado: 'RETIRADA',
      pacote: null,
      motivoRetirada: 'DESCONHECIDO',
      avisoRetiradaVisto: true,
    })
    expect((await cel.exigirFolha(b.fc)).recibo!.marcas).toEqual(['ORFAO', 'PILOTO'])
    const orfaos = (await t.chamar('GET', '/api/campo/registros?orfaos=1', { cookie: t.cookieComum })).json()
      .registros as RegistroCampoListado[]
    expect(orfaos).toEqual([expect.objectContaining({ numero: b.fc, envioId: b.envio.id, ligadoA: '', situacao: 'VALIDO' })])
    // A folha impressa assinada sai mesmo sem o pacote do envio
    const pdf = await t.chamar('GET', `/api/campo/registros/${orfaos[0].id}/pdf`, { cookie: t.cookieComum })
    expect(pdf.statusCode).toBe(200)
    expect(pdf.headers['content-type']).toMatch(/^application\/pdf/)
    // O órfão só vale para a calibração depois que o escritório o liga à folha
    expect((await campoDe(b.k)).registroId).toBe('')
    const ligado = await t.chamar('POST', `/api/campo/registros/${orfaos[0].id}/ligar`, {
      cookie: t.cookieComum,
      payload: { numero: b.fc, motivo: 'Conferido com o técnico: é a folha da visita de hoje.' },
    })
    expect(ligado.statusCode, ligado.body).toBe(200)
    expect((await campoDe(b.k)).registroId).toBe(orfaos[0].id)
    semErroDoServidor(cel)
  })

  it('descadastrar no meio do dia: a folha começada ainda é entregue, com a marca; com "roubado", é recusada e fica no celular', async () => {
    const cel = await celularPareado()
    const k1 = await c.calibracaoPronta()
    const k2 = await c.calibracaoPronta()
    const e1 = await enviarCalibracao(k1)
    const e2 = await enviarCalibracao(k2)
    expect((await cel.sincronizar()).novas).toHaveLength(2)
    await cel.preencher(e1.numero)
    await cel.finalizarEAssinar(e1.numero)

    // Troca de aparelho: o celular não recebe mais folhas, mas a folha preenchida chega (marcada)
    await revogar(APARELHO_A, 'TROCA')
    let desde = cel.rede.historico.length
    let r = await cel.sincronizar()
    expect(r).toMatchObject({ descadastrado: true, conectou: true })
    expect(cel.descadastrado).toBe(true)
    expect(cel.rede.conversa(desde)).toEqual(['POST /api/campo/ola → 401', `PUT /api/campo/registros/${e1.id} → 200`])
    expect(r.entregues.map((e) => e.numero)).toEqual([e1.numero])
    expect((await cel.exigirFolha(e1.numero)).recibo!.marcas).toEqual(['APARELHO_REVOGADO', 'PILOTO'])
    expect((await registrosDaFolha(e1.numero))[0].marcas).toEqual(['APARELHO_REVOGADO', 'PILOTO'])
    // A folha que nem começou continua no celular; o escritório não manda mais folhas para este técnico
    expect((await cel.exigirFolha(e2.numero)).estado).toBe('NOVA')
    const k3 = await c.calibracaoPronta()
    const semCelular = await t.chamar('POST', `/api/calibracoes/${k3.id}/enviar-tecnico`, {
      cookie: t.cookieComum,
      payload: { tecnicoId: t.comumId },
    })
    expect(semCelular.statusCode).toBe(409)
    expect(semCelular.json().codigo).toBe('SEM_CELULAR')

    // Roubado: a entrega é recusada e a folha fica guardada no celular
    await revogar(APARELHO_A, 'ROUBADO')
    await cel.preencher(e2.numero)
    await cel.finalizarEAssinar(e2.numero)
    desde = cel.rede.historico.length
    r = await cel.sincronizar()
    expect(cel.rede.conversa(desde)).toEqual(['POST /api/campo/ola → 401', `PUT /api/campo/registros/${e2.id} → 401`])
    expect(r).toMatchObject({ descadastrado: true, entregues: [] })
    expect(r.naoEntregues).toEqual([{ numero: e2.numero, motivo: MOTIVO_ENTREGA_DESCADASTRADO }])
    const guardada = await cel.exigirFolha(e2.numero)
    expect(guardada).toMatchObject({ estado: 'FINALIZADA', entrega: { erro: MOTIVO_ENTREGA_DESCADASTRADO } })
    expect(guardada.registro).not.toBeNull()
    expect(await registrosDaFolha(e2.numero)).toEqual([])
    semErroDoServidor(cel)
  })

  it('entrega atrasada de uma folha recolhida à força e reenviada a outro técnico: grava as duas, sem erro', async () => {
    const celA = await celularPareado()
    const { k, envio: e1, fc } = await folhaNoCelular(celA)
    // No cliente, sem rede: o técnico preenche e assina
    await celA.preencher(fc)
    await celA.finalizarEAssinar(fc)

    // O escritório não espera: recolhe à força e manda a mesma folha para outro técnico
    const forcado = await recolher(fc, { forcar: true, motivo: 'Outro técnico vai fazer a visita.' })
    expect(forcado).toMatchObject({ imediato: true, envio: { situacao: 'RECOLHIDA', forcado: true } })
    const outroId = await outroTecnico('Roberto Alves', 'roberto')
    const celB = await celularPareado({ usuarioId: outroId, aparelhoId: APARELHO_B })
    const reenvio = await t.chamar('POST', `/api/folhas-campo/${fc}/enviar-tecnico`, {
      cookie: t.cookieComum,
      payload: { tecnicoId: outroId },
    })
    expect(reenvio.statusCode, reenvio.body).toBe(200)
    const e2 = reenvio.json().envio as EnvioCampoListado
    expect(e2).toMatchObject({ numero: fc, situacao: 'ENVIADA', tecnico: 'Roberto Alves' })
    expect(e2.id).not.toBe(e1.id)
    expect((await celB.sincronizar()).novas).toEqual([fc])
    await celB.preencher(fc, { erros: [0, 0, 0, 1, 1] })
    await celB.finalizarEAssinar(fc)
    expect((await celB.sincronizar()).entregues.map((e) => e.numero)).toEqual([fc])

    // O 1º celular volta à empresa: responde "Já comecei" e entrega mesmo assim (gravado com a marca)
    const desde = celA.rede.historico.length
    const r = await celA.sincronizar()
    expect(celA.rede.conversa(desde)).toEqual([
      'POST /api/campo/ola → 200',
      `POST /api/campo/envios/${e1.id}/recolhimento → 200`,
      `PUT /api/campo/registros/${e1.id} → 200`,
    ])
    expect(r.entregues.map((e) => e.numero)).toEqual([fc])
    expect(await celA.exigirFolha(fc)).toMatchObject({ estado: 'ENTREGUE', recibo: { marcas: ['APOS_RECOLHER', 'PILOTO'] } })
    const registros = await registrosDaFolha(fc)
    expect(registros).toHaveLength(2)
    const doReenvio = registros.find((x) => x.envioId === e2.id)!
    const atrasado = registros.find((x) => x.envioId === e1.id)!
    expect(doReenvio).toMatchObject({ situacao: 'VALIDO', marcas: ['PILOTO'], tecnico: 'Roberto Alves' })
    expect(atrasado).toMatchObject({ situacao: 'VALIDO', marcas: ['APOS_RECOLHER', 'PILOTO'], tecnico: 'Comum Teste' })
    expect(envioNoBanco(e1.id)).toMatchObject({ situacao: 'RECOLHIDA' })
    expect(envioNoBanco(e2.id)).toMatchObject({ situacao: 'DEVOLVIDA' })
    // Para a calibração vale o registro do envio que estava ativo, não o que chegou depois de recolhido
    expect((await campoDe(k)).registroId).toBe(doReenvio.id)
    semErroDoServidor(celA)
    semErroDoServidor(celB)
  })

  it('encerrar sem completar (incompleta): o motivo chega e o escritório vê o desfecho', async () => {
    const cel = await celularPareado()
    const { k, fc } = await folhaNoCelular(cel)
    await cel.preencher(fc, { ateIndicacao: true })
    const motivo = 'O cliente precisou da balança para a expedição: faltaram a repetibilidade e a excentricidade.'
    await cel.encerrar(fc, 'INCOMPLETA', motivo)
    const f = await cel.finalizarEAssinar(fc)
    expect(f.estado).toBe('FINALIZADA')
    expect((await cel.sincronizar()).entregues.map((e) => e.numero)).toEqual([fc])
    const [g] = await registrosDaFolha(fc)
    expect(g).toMatchObject({ desfecho: 'INCOMPLETA', problemas: [], marcas: ['PILOTO'] })
    expect(await campoDe(k)).toMatchObject({ registroId: g.id, desfecho: 'INCOMPLETA', motivoDesfecho: motivo })
    const lista = (await t.chamar('GET', '/api/folhas-campo?situacao=CELULAR', { cookie: t.cookieComum })).json()
    expect(lista.itens.find((x: { numero: string }) => x.numero === fc).celular).toMatchObject({
      situacao: 'DEVOLVIDA',
      desfecho: 'INCOMPLETA',
      voltou: true,
    })
  })

  it('recomeçar os ensaios: a tentativa anterior chega guardada e não vai para o rascunho', async () => {
    await configurar('CELULAR')
    const cel = await celularPareado()
    const { k, fc } = await folhaNoCelular(cel)
    // A balança não pesava bem: manutenção no local e os ensaios de novo
    await cel.preencher(fc, { ateIndicacao: true, erros: [0, 3, 6, 9, 12] })
    let f = await cel.recomecar(fc, 'Manutenção da célula de carga: o cabo estava solto.')
    expect(f.registro!.tentativas).toHaveLength(1)
    expect(f.registro!.passos.indicacao.pontos.every((p) => p.crescente === null)).toBe(true)
    await cel.preencher(fc)
    f = await cel.finalizarEAssinar(fc)
    expect(f.registro!.trilha).toEqual([])
    expect((await cel.sincronizar()).entregues.map((e) => e.numero)).toEqual([fc])
    const [g] = await registrosDaFolha(fc)
    const conteudo = (await registroGravado(g.id)).conteudo
    expect(conteudo.tentativas).toEqual([
      expect.objectContaining({ n: 1, motivo: 'Manutenção da célula de carga: o cabo estava solto.' }),
    ])
    expect(conteudo.tentativas[0].indicacao.pontos.find((p) => p.id === 'c')!.crescente!.valor).toBe('30,12')
    const puxada = (await puxar(k)).calibracao
    expect(ponto(puxada, 'c').crescente).toBe(30.02)
    expect(ponto(puxada, 'a').crescente).toBe(5)
  })

  it('corrigir depois de assinar: a correção vai junto, as assinaturas continuam valendo e o rascunho recebe o valor novo', async () => {
    await configurar('CELULAR')
    const cel = await celularPareado()
    const { k, fc } = await folhaNoCelular(cel)
    await cel.preencher(fc)
    await cel.finalizarEAssinar(fc)
    const f = await cel.corrigir(fc, 'indicacao.pontos.c.crescente', '30,03', 'Anotei errado: conferido de novo no mostrador.')
    expect(f.estado).toBe('FINALIZADA')
    expect(f.registro!.correcoesPosAssinatura).toEqual([
      expect.objectContaining({ campo: 'indicacao.pontos.c.crescente', de: '30,02', para: '30,03', mostradoAoCliente: false }),
    ])
    expect((await cel.sincronizar()).entregues.map((e) => e.numero)).toEqual([fc])
    const [g] = await registrosDaFolha(fc)
    expect(g).toMatchObject({ situacao: 'VALIDO', marcas: [], problemas: [] })
    const puxada = (await puxar(k)).calibracao
    expect(ponto(puxada, 'c').crescente).toBe(30.03)
  })

  it('reabrir depois de um recibo perdido: a revisão nova vale e a anterior fica SUPERADO', async () => {
    const cel = await celularPareado()
    const { k, envio, fc } = await folhaNoCelular(cel)
    await cel.preencher(fc)
    await cel.finalizarEAssinar(fc)
    const primeira = structuredClone((await cel.exigirFolha(fc)).registro!)
    cel.rede.cairDepois(rota('PUT', '/api/campo/registros/'))
    expect((await cel.sincronizar()).naoEntregues.map((x) => x.numero)).toEqual([fc])
    expect(await registrosDaFolha(fc)).toHaveLength(1)

    // O técnico não sabe que chegou: reabre para acertar o retorno ao zero, assina de novo e entrega
    let f = await cel.reabrir(fc, 'O retorno ao zero foi anotado antes de estabilizar.')
    expect(f).toMatchObject({ estado: 'REABERTA', registro: { assinaturas: { tecnico: null, cliente: null } } })
    expect(f.registro!.reaberturas).toEqual([expect.objectContaining({ sha256Anterior: shaDoRegistro(primeira) })])
    f = await cel.digitar(fc, 'indicacao.retornoZero', '0,01')
    expect(f.registro!.trilha).toEqual([expect.objectContaining({ campo: 'indicacao.retornoZero', de: '0,00', para: '0,01' })])
    f = await cel.finalizarEAssinar(fc)
    const segunda = structuredClone(f.registro!)
    const r = await cel.sincronizar()
    expect(r.entregues.map((e) => e.numero)).toEqual([fc])
    expect((await cel.exigirFolha(fc)).recibo).toMatchObject({ sha256: shaDoRegistro(segunda), situacao: 'VALIDO' })
    const registros = await registrosDaFolha(fc)
    expect(registros).toHaveLength(2)
    const [nova, anterior] = registros
    expect(nova).toMatchObject({ envioId: envio.id, situacao: 'VALIDO', revisaoLocal: 1 })
    expect(anterior).toMatchObject({ envioId: envio.id, situacao: 'SUPERADO', revisaoLocal: 0 })
    expect(anterior.situacaoMotivo).toMatch(/revisão mais nova/)
    expect((await registroGravado(nova.id)).conteudo.passos.indicacao.retornoZero!.valor).toBe('0,01')
    expect((await campoDe(k)).registroId).toBe(nova.id)
  })

  it('corrigir depois de um recibo perdido: a versão corrigida vale e a anterior fica SUPERADO', async () => {
    await configurar('CELULAR')
    const cel = await celularPareado()
    const { k, envio, fc } = await folhaNoCelular(cel)
    await cel.preencher(fc)
    await cel.finalizarEAssinar(fc)
    cel.rede.cairDepois(rota('PUT', '/api/campo/registros/'))
    expect((await cel.sincronizar()).naoEntregues.map((x) => x.numero)).toEqual([fc])
    expect(await registrosDaFolha(fc)).toHaveLength(1)

    // O técnico não sabe que chegou: corrige por acréscimo (sem reabrir; as assinaturas continuam valendo) e entrega
    const f = await cel.corrigir(fc, 'indicacao.pontos.c.crescente', '30,03', 'Anotei errado: conferido de novo no mostrador.')
    expect(f).toMatchObject({ estado: 'FINALIZADA', registro: { reaberturas: [] } })
    const corrigida = structuredClone(f.registro!)
    expect((await cel.sincronizar()).entregues.map((e) => e.numero)).toEqual([fc])
    expect((await cel.exigirFolha(fc)).recibo).toMatchObject({ sha256: shaDoRegistro(corrigida), situacao: 'VALIDO' })
    const registros = await registrosDaFolha(fc)
    expect(registros).toHaveLength(2)
    const [nova, anterior] = registros
    expect(nova).toMatchObject({ envioId: envio.id, situacao: 'VALIDO', revisaoLocal: 0 })
    expect(anterior).toMatchObject({ envioId: envio.id, situacao: 'SUPERADO', revisaoLocal: 0 })
    expect(anterior.situacaoMotivo).toBe('Chegou uma versão mais nova da mesma folha (corrigida no celular).')
    expect((await campoDe(k)).registroId).toBe(nova.id)
    // O Painel conta a folha uma vez só; depois de puxar, nada fica "voltou" para sempre
    const voltaram = async () =>
      (await t.chamar('GET', '/api/painel', { cookie: t.cookieComum }))
        .json()
        .painel.campo.voltaram.map((v: { numero: string }) => v.numero)
    expect(await voltaram()).toEqual([fc])
    expect(ponto((await puxar(k)).calibracao, 'c').crescente).toBe(30.03)
    expect(await voltaram()).toEqual([])
    // A versão anterior não pode mais ser puxada
    const antiga = await t.chamar('POST', `/api/calibracoes/${k.id}/puxar-campo`, {
      cookie: t.cookieComum,
      payload: { registroId: anterior.id, versao: t.ctx.repo.obterCalibracao(k.id)!.versao, escolhas: {} },
    })
    expect(antiga.statusCode).toBe(409)
    expect(antiga.json().codigo).toBe('REGISTRO_NAO_VALE')
  })

  it('no laboratório: só o técnico assina (o cliente fica dispensado) e a folha tranca na hora', async () => {
    const cel = await celularPareado()
    const { fc } = await folhaNoCelular(cel)
    await cel.preencher(fc, { local: 'LABORATORIO' })
    await cel.finalizar(fc)
    const f = await cel.assinarComoTecnico(fc)
    expect(f).toMatchObject({ estado: 'FINALIZADA', modoEntrega: null })
    expect(f.registro!.assinaturas.cliente).toEqual({ dispensada: 'LABORATORIO' })
    expect((await cel.sincronizar()).entregues.map((e) => e.numero)).toEqual([fc])
    expect((await registrosDaFolha(fc))[0]).toMatchObject({ situacao: 'VALIDO', marcas: ['PILOTO'], problemas: [] })
  })

  it('o servidor mudou de endereço: o celular avisa com clareza; com o endereço novo (Menu ou QR), entrega', async () => {
    const antigo = await abrirPortaIntermediaria(porta)
    const outro = criarServidorHttp((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          ok: true,
          app: 'bc-calibracao',
          versao: '1.1.0',
          nome: 'OUTRO-PC',
          id: 'outra-instalacao',
          instancia: 'x',
        }),
      )
    })
    await new Promise<void>((ok) => outro.listen(0, '127.0.0.1', ok))
    try {
      const cel = await celularPareado({ endereco: antigo.endereco })
      expect(cel.pareamento!.endereco).toBe(antigo.endereco)
      const { fc } = await folhaNoCelular(cel)
      await cel.preencher(fc)
      await cel.finalizarEAssinar(fc)

      // O IP do servidor mudou: ninguém responde no endereço gravado
      await antigo.fechar()
      const r = await cel.sincronizar()
      expect(r).toMatchObject({ conectou: false, falha: { tipo: 'REDE', mensagem: MENSAGEM_SEM_SERVIDOR(antigo.endereco) } })
      expect(r.falha!.mensagem).toContain('leia o QR de novo ou digite o endereço no Menu')
      expect(await cel.exigirFolha(fc)).toMatchObject({ estado: 'FINALIZADA' })

      // Menu → "Endereço do servidor": outro servidor BC Calibração e IP errado são recusados
      const outroEndereco = `127.0.0.1:${(outro.address() as { port: number }).port}`
      expect(await cel.mudarEndereco(outroEndereco)).toMatch(/outro servidor BC Calibração \(OUTRO-PC\)/)
      expect(await cel.mudarEndereco('192.168.0.300')).toMatch(/IP inválido/)
      expect(cel.pareamento!.endereco).toBe(antigo.endereco)
      // "Ler o QR de novo": o QR só com o endereço novo (Celulares dos técnicos)
      const q = await t.chamar('GET', `/api/celulares/endereco?endereco=${encodeURIComponent(endereco)}`, {
        cookie: t.cookieAdmin,
      })
      expect(q.json().qr).toBe(`BCCAL1|${endereco}`)
      expect(await cel.lerQr(q.json().qr)).toBeNull()
      expect(cel.pareamento!.endereco).toBe(endereco)
      const depois = await cel.sincronizar()
      expect(depois.falha).toBeNull()
      expect(depois.entregues.map((e) => e.numero)).toEqual([fc])
      // Digitado no Menu também vale (o mesmo servidor)
      expect(await cel.mudarEndereco(`127.0.0.1:${porta}`)).toBeNull()
    } finally {
      await antigo.fechar()
      await new Promise<void>((ok) => outro.close(() => ok()))
    }
  })

  it('parear de novo: token novo (o antigo deixa de valer) e as folhas do celular ficam intactas', async () => {
    const cel = await celularPareado()
    const a = await folhaNoCelular(cel)
    const b = await folhaNoCelular(cel)
    await cel.preencher(a.fc)
    await cel.finalizarEAssinar(a.fc)
    await cel.preencher(b.fc, { ateIndicacao: true })
    const antes = structuredClone(await cel.folhas())
    const tokenAntigo = cel.pareamento!.token

    const p = await pedirCodigo({ aparelhoId: APARELHO_A })
    expect(p.aparelhoId).toBe(APARELHO_A)
    expect(await cel.lerQr(p.qr)).toBeNull()
    expect(cel.pareamento!.token).not.toBe(tokenAntigo)
    expect(await cel.folhas()).toEqual(antes)
    // O token antigo não vale mais
    const velho = new ClienteCampo({ endereco, token: tokenAntigo }, cel.rede, cel.relogio)
    expect(await velho.ola({ versaoApp: '1.1.0', contrato: 1, agora: cel.relogio.agora(), estados: [] })).toMatchObject({
      ok: false,
      falha: { tipo: 'HTTP', status: 401, codigo: 'NAO_PAREADO', mensagem: MENSAGENS_ERRO_CAMPO.NAO_PAREADO },
    })
    // O mesmo celular no computador (pareado duas vezes)
    const celulares = (await t.chamar('GET', '/api/celulares', { cookie: t.cookieAdmin })).json().celulares
    expect(celulares).toEqual([expect.objectContaining({ id: APARELHO_A, pareamentos: 2, revogado: false })])

    const r = await cel.sincronizar()
    expect(r.entregues.map((e) => e.numero)).toEqual([a.fc])
    expect((await cel.exigirFolha(b.fc)).estado).toBe('EM_PREENCHIMENTO')
    expect(envioNoBanco(b.envio.id)).toMatchObject({ situacao: 'NO_CELULAR', estado_celular: 'EM_PREENCHIMENTO' })
  })
})

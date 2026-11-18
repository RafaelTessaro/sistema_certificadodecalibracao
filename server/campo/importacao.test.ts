// O escritório leva o registro de campo à calibração (1.1.0; server/campo/importacao.ts), com o servidor de verdade
// (app.inject): "Comparar com o campo" no piloto (nada no rascunho), "Importar do celular do técnico" com o registro original no
// celular (o técnico que assinou fica sendo quem o definiu), "Criar calibração com os dados do campo" (a folha avulsa da
// balança e a só do cliente, depois de cadastrar a balança), a justificativa das diferenças depois de puxar (pendência
// de emissão até existir) e o bloco congelado na emissão, que não muda o PDF do certificado.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PENDENCIA_JUSTIFICATIVA_CAMPO } from '#shared/campo/importar.ts'
import type { LeituraCampo, PacoteCampo, RegistroCampo } from '#shared/campo/tipos.ts'
import { BALANCA_VAZIA } from '#shared/dominio.ts'
import { impedimentoParaEmitir, TECNICO_NAO_AUTORIZA } from '#shared/permissoes.ts'
import type { Calibracao, CampoDaCalibracao, FolhaCampoDaBalanca, TecnicoParaEnvio } from '#shared/tipos.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin } from '../auxiliaresTeste.ts'
import { gerarPdf } from '../certificados.ts'
import { baixarEConfirmar, enviarCalibracao, entregar, parearCelular, registroDoPacote } from './auxiliaresTesteCampo.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>

beforeEach(async () => {
  t = await criarAppComLogin()
  c = await cenarioCalibracao(t)
})
afterEach(async () => {
  await t.fechar()
})

const EM = '2026-11-18T09:10:00-03:00'
const leitura = (valor: string): LeituraCampo => ({ valor, em: EM, via: 'teclado' })
const TECNICO = () => ({ id: t.comumId, nome: 'Comum Teste' })

/** As leituras do celular: as cargas como a folha as mostra, com `mudar` (id do ponto → crescente) por cima. */
function preencher(r: RegistroCampo, mudar: Record<string, string> = {}) {
  r.passos.padroes.forEach((p) => {
    p.levado = true
    p.usado = true
  })
  const [inicio, fim] = r.passos.ambiente.linhas
  Object.assign(inicio, { em: EM, temperatura: leitura('22,1'), umidade: leitura('55'), pressao: leitura('927') })
  Object.assign(fim, { em: EM, temperatura: leitura('22,6'), umidade: leitura('57') })
  for (const p of r.passos.indicacao.pontos) {
    p.crescente = leitura(mudar[p.id] ?? p.cargaPrevista)
    p.decrescente = leitura(p.cargaPrevista)
  }
  r.passos.indicacao.retornoZero = leitura('0,00')
  for (const e of r.passos.repetibilidade) e.leituras = Array.from({ length: 6 }, () => leitura(e.cargaPrevista))
  r.passos.excentricidade.aplicavel = true
  for (const x of r.passos.excentricidade.posicoes) x.leitura = leitura(r.passos.excentricidade.cargaPrevista)
  r.desfecho = 'COMPLETA'
  r.motivoDesfecho = ''
}

const configurar = (registroOriginal: 'PAPEL' | 'CELULAR') =>
  t.chamar('PUT', '/api/campo/configuracao', { cookie: t.cookieAdmin, payload: { registroOriginal } })

/** A folha da calibração pronta enviada ao celular do técnico (comum), preenchida e entregue. */
async function folhaQueVoltou(o: { mudar?: Record<string, string>; ajustar?: (r: RegistroCampo) => void } = {}) {
  const k = await c.calibracaoPronta()
  const { token } = await parearCelular(t)
  const enviado = await enviarCalibracao(t, k.id)
  const pacote = await baixarEConfirmar(t, token, enviado.envio.id)
  const registro = registroDoPacote(pacote, {
    tecnico: TECNICO(),
    ajustar: (r) => {
      preencher(r, o.mudar)
      o.ajustar?.(r)
    },
  })
  const recibo = await entregar(t, token, enviado.envio.id, registro)
  expect(recibo.statusCode, recibo.body).toBe(200)
  return { k: t.ctx.repo.obterCalibracao(k.id)!, token, envio: enviado.envio, pacote, registro }
}

const campoDe = async (id: string, cookie = t.cookieComum) => {
  const r = await t.chamar('GET', `/api/calibracoes/${id}/campo`, { cookie })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as CampoDaCalibracao
}

const auditoria = (acao: string) =>
  t.ctx.db.prepare('SELECT * FROM auditoria WHERE acao = ? ORDER BY id').all(acao) as Array<Record<string, string>>

const pontoC = (k: Calibracao) => k.indicacao.pontos.find((p) => p.id === 'c')!

describe('o editor: o celular e o registro da folha da calibração', () => {
  it('enviada: a folha no celular trava só com o registro original no celular; voltou: o registro que vale', async () => {
    const k = await c.calibracaoPronta()
    const { token } = await parearCelular(t)
    const { envio } = await enviarCalibracao(t, k.id)
    let campo = await campoDe(k.id)
    expect(campo).toMatchObject({ registroOriginal: 'PAPEL', numero: envio.numero, travada: false, registroId: '' })
    expect(campo.envio).toMatchObject({ id: envio.id, situacao: 'ENVIADA', tecnico: 'Comum Teste' })
    await configurar('CELULAR')
    expect((await campoDe(k.id)).travada).toBe(true)
    const pacote = await baixarEConfirmar(t, token, envio.id)
    expect((await campoDe(k.id)).envio?.situacao).toBe('NO_CELULAR')
    await entregar(t, token, envio.id, registroDoPacote(pacote, { tecnico: TECNICO(), ajustar: (r) => preencher(r) }))
    campo = await campoDe(k.id)
    expect(campo.travada).toBe(false)
    expect(campo.envio?.situacao).toBe('DEVOLVIDA')
    expect(campo.registros).toHaveLength(1)
    expect(campo.registroId).toBe(campo.registros[0].id)
    expect(campo).toMatchObject({ puxado: false, divergencias: [], justificativa: null, desfecho: 'COMPLETA' })
    // O sha256 do registro é interno: nunca vem para a tela
    expect(JSON.stringify(campo)).not.toMatch(/sha256/i)
  })
})

describe('piloto (registro original no papel): comparar', () => {
  it('"Comparar com o campo" grava a comparação e a observação, sem mexer no rascunho; "Puxar" é recusado', async () => {
    const { k } = await folhaQueVoltou({ mudar: { c: '30,00' } })
    const campo = await campoDe(k.id)
    expect(campo.registroOriginal).toBe('PAPEL')
    const puxar = await t.chamar('POST', `/api/calibracoes/${k.id}/puxar-campo`, {
      cookie: t.cookieComum,
      payload: { registroId: campo.registroId, versao: k.versao },
    })
    expect(puxar.statusCode).toBe(409)
    expect(puxar.json().codigo).toBe('PILOTO')

    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/comparar-campo`, {
      cookie: t.cookieComum,
      payload: { registroId: campo.registroId, observacao: '  Erro de digitação\u0007 no papel  ' },
    })
    expect(r.statusCode, r.body).toBe(200)
    const corpo = r.json()
    expect(corpo.importacao).toMatchObject({ tipo: 'COMPARACAO', observacao: 'Erro de digitação no papel' })
    expect(corpo.diferentes).toBeGreaterThan(0)
    const itens = corpo.importacao.resumo.itens as Array<{ chave: string; celular: string; rascunho: string }>
    expect(itens.find((x) => x.chave === 'indicacao.pontos.c.crescente')).toMatchObject({ celular: '30,00', rascunho: '30,01' })
    // Nada mudou na calibração
    const depois = t.ctx.repo.obterCalibracao(k.id)!
    expect(depois.versao).toBe(k.versao)
    expect(pontoC(depois).crescente).toBe(30.01)
    expect(auditoria('CAMPO_COMPARADO')).toHaveLength(1)
    // Comparado: sai de "Voltaram do campo" (o Painel) e não pede justificativa (não houve "Puxar")
    expect((await campoDe(k.id)).importacoes.map((i) => i.tipo)).toEqual(['COMPARACAO'])
    const painel = (await t.chamar('GET', '/api/painel', { cookie: t.cookieComum })).json().painel
    expect(painel.campo.voltaram).toEqual([])
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieComum })).json()
    expect(detalhe.pendencias.some((p: string) => p.startsWith(PENDENCIA_JUSTIFICATIVA_CAMPO))).toBe(false)
  })

  it('o registro de outra folha ou descartado não serve para a calibração', async () => {
    const { k } = await folhaQueVoltou()
    const campo = await campoDe(k.id)
    const outra = await c.calibracaoPronta()
    const r = await t.chamar('POST', `/api/calibracoes/${outra.id}/comparar-campo`, {
      cookie: t.cookieComum,
      payload: { registroId: campo.registroId },
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().codigo).toBe('OUTRA_FOLHA')
    await t.chamar('POST', `/api/campo/registros/${campo.registroId}/descartar`, {
      cookie: t.cookieComum,
      payload: { motivo: 'Teste' },
    })
    const d = await t.chamar('POST', `/api/calibracoes/${k.id}/comparar-campo`, {
      cookie: t.cookieComum,
      payload: { registroId: campo.registroId },
    })
    expect(d.statusCode).toBe(409)
    expect(d.json().codigo).toBe('REGISTRO_NAO_VALE')
    expect((await campoDe(k.id)).registroId).toBe('')
  })
})

describe('registro original no celular: puxar, justificar e emitir', () => {
  it('"Importar do celular do técnico": fica o do celular; o técnico que assinou é quem o definiu; versão conferida', async () => {
    await configurar('CELULAR')
    const { k } = await folhaQueVoltou({ mudar: { c: '30,00' } })
    const campo = await campoDe(k.id)
    // Editor desatualizado
    const velho = await t.chamar('POST', `/api/calibracoes/${k.id}/puxar-campo`, {
      cookie: t.cookieAdmin,
      payload: { registroId: campo.registroId, versao: k.versao - 1 },
    })
    expect(velho.statusCode).toBe(409)
    expect(velho.json().codigo).toBe('CONFLITO')

    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/puxar-campo`, {
      cookie: t.cookieAdmin,
      payload: { registroId: campo.registroId, versao: k.versao, escolhas: { 'x.y': 'OUTRA' } },
    })
    expect(r.statusCode, r.body).toBe(200)
    const corpo = r.json()
    const puxada = corpo.calibracao as Calibracao
    expect(puxada.versao).toBe(k.versao + 1)
    expect(pontoC(puxada).crescente).toBe(30)
    expect(puxada.dataCalibracao).toBe('2026-11-18')
    // O técnico que assinou no celular executou e é quem o definiu: quem puxou (o administrador) pode autorizar
    expect(puxada.tecnicoId).toBe(t.comumId)
    expect(puxada.tecnicoDefinidoPorId).toBe(t.comumId)
    expect(corpo.resumo.texto).toMatch(/^Trouxe do celular a folha FC-\d{4}-\d{5}: /)
    expect(corpo.importacao).toMatchObject({ tipo: 'PUXAR', versaoAntes: k.versao, versaoDepois: puxada.versao })
    expect(auditoria('DADOS_PUXADOS_DO_CAMPO')[0].detalhe).toMatch(/Trouxe do celular a folha/)
    // Logo depois de puxar, nada mudou: sem pendência
    expect(corpo.pendencias.some((p: string) => p.startsWith(PENDENCIA_JUSTIFICATIVA_CAMPO))).toBe(false)
    expect((await campoDe(k.id)).puxado).toBe(true)
  })

  it('o técnico que o registro diz e que não é o do celular nem o da folha não entra na calibração (quem executou não autoriza)', async () => {
    await configurar('CELULAR')
    const sig = await t.chamar('PUT', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin, payload: { signatario: true } })
    expect(sig.statusCode, sig.body).toBe(200)
    // O celular é do comum (signatário), mas o registro diz que quem executou foi o administrador
    const { k } = await folhaQueVoltou({
      mudar: { c: '30,00' },
      ajustar: (r) => (r.tecnico = { id: t.adminId, nome: 'Admin Teste' }),
    })
    const [listado] = (await campoDe(k.id)).registros
    expect(listado.marcas).toContain('FORMATO')
    expect(listado.problemas).toEqual([
      { campo: 'tecnico', mensagem: 'O técnico do registro não é o do celular nem o da folha.' },
    ])
    // Quem executou foi o comum (o técnico da calibração)
    const atual = t.ctx.repo.obterCalibracao(k.id)!
    const com = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, tecnicoId: t.comumId, versao: atual.versao },
    })
    expect(com.statusCode, com.body).toBe(200)
    const antes = t.ctx.repo.obterCalibracao(k.id)!
    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/puxar-campo`, {
      cookie: t.cookieComum,
      payload: { registroId: listado.id, versao: antes.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const puxada = r.json().calibracao as Calibracao
    expect(pontoC(puxada).crescente).toBe(30)
    expect(puxada.tecnicoId).toBe(t.comumId)
    expect(puxada.tecnicoDefinidoPorId).not.toBe(t.adminId)
    expect(impedimentoParaEmitir(true, puxada, { id: t.comumId, signatario: true })).toBe(TECNICO_NAO_AUTORIZA)
  })

  it('a escolha "o do rascunho" mantém o valor digitado', async () => {
    await configurar('CELULAR')
    const { k } = await folhaQueVoltou({ mudar: { c: '30,00' } })
    const campo = await campoDe(k.id)
    const r = await t.chamar('POST', `/api/calibracoes/${k.id}/puxar-campo`, {
      cookie: t.cookieComum,
      payload: { registroId: campo.registroId, versao: k.versao, escolhas: { 'indicacao.pontos.c.crescente': 'RASCUNHO' } },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(pontoC(r.json().calibracao).crescente).toBe(30.01)
    // O valor diferente do celular que ficou é uma diferença: pede a justificativa
    expect(r.json().pendencias.some((p: string) => p.startsWith(PENDENCIA_JUSTIFICATIVA_CAMPO))).toBe(true)
  })

  it('dado bruto mudado depois de puxar: pendência até a justificativa; na emissão, o bloco fica congelado', async () => {
    await configurar('CELULAR')
    const { k } = await folhaQueVoltou({ mudar: { c: '30,00' } })
    const campo = await campoDe(k.id)
    const puxada = (
      await t.chamar('POST', `/api/calibracoes/${k.id}/puxar-campo`, {
        cookie: t.cookieAdmin,
        payload: { registroId: campo.registroId, versao: k.versao },
      })
    ).json().calibracao as Calibracao
    // O escritório digita de novo a leitura do papel
    const mudada = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieComum,
      payload: {
        ...puxada,
        indicacao: {
          ...puxada.indicacao,
          pontos: puxada.indicacao.pontos.map((p) => (p.id === 'c' ? { ...p, crescente: 30.01 } : p)),
        },
        versao: puxada.versao,
      },
    })
    expect(mudada.statusCode, mudada.body).toBe(200)
    const pendente = mudada.json().pendencias.find((p: string) => p.startsWith(PENDENCIA_JUSTIFICATIVA_CAMPO))
    expect(pendente).toMatch(/1 diferença/)
    const depois = await campoDe(k.id)
    expect(depois.divergencias).toEqual([
      expect.objectContaining({ chave: 'indicacao.pontos.c.crescente', celular: '30,00', certificado: '30,01' }),
    ])
    let atual = mudada.json().calibracao as Calibracao
    const recusada = await c.emitir(atual)
    expect(recusada.statusCode).toBe(409)
    expect(recusada.json().erro).toMatch(PENDENCIA_JUSTIFICATIVA_CAMPO)

    // A justificativa (um texto só): editor desatualizado recusado; depois, a pendência some
    const velha = await t.chamar('POST', `/api/calibracoes/${k.id}/justificativa-campo`, {
      cookie: t.cookieComum,
      payload: { texto: 'x', versao: atual.versao - 1 },
    })
    expect(velha.statusCode).toBe(409)
    const j = await t.chamar('POST', `/api/calibracoes/${k.id}/justificativa-campo`, {
      cookie: t.cookieComum,
      payload: { texto: '  Leitura conferida no papel assinado pelo técnico.  ', versao: atual.versao },
    })
    expect(j.statusCode, j.body).toBe(200)
    atual = j.json().calibracao
    expect(atual.campoJustificativa).toMatchObject({
      texto: 'Leitura conferida no papel assinado pelo técnico.',
      porId: t.comumId,
    })
    expect(j.json().pendencias.some((p: string) => p.startsWith(PENDENCIA_JUSTIFICATIVA_CAMPO))).toBe(false)
    expect((await campoDe(k.id)).justificativa?.texto).toBe('Leitura conferida no papel assinado pelo técnico.')
    // O PUT do rascunho não mexe na justificativa (nem a tira, nem a troca)
    const regravada = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
      cookie: t.cookieComum,
      payload: { ...atual, campoJustificativa: { texto: 'outra' }, observacoes: 'ok', versao: atual.versao },
    })
    atual = regravada.json().calibracao
    expect(atual.campoJustificativa?.texto).toBe('Leitura conferida no papel assinado pelo técnico.')

    const emitida = await c.emitir(atual)
    expect(emitida.statusCode, emitida.body).toBe(200)
    const k2 = emitida.json().calibracao as Calibracao
    expect(k2.emissao?.campo).toMatchObject({
      registroId: campo.registroId,
      numero: campo.numero,
      divergencias: [expect.objectContaining({ chave: 'indicacao.pontos.c.crescente' })],
      justificativa: 'Leitura conferida no papel assinado pelo técnico.',
      justificadoPor: 'Comum Teste',
    })
    expect(k2.emissao?.campo?.sha256).toMatch(/^[0-9a-f]{64}$/)
    // O bloco é só dado: o PDF do certificado sai byte a byte igual com e sem ele
    const { campo: _bloco, ...semCampo } = k2.emissao!
    const com = await gerarPdf(k2, k2.emissao!, '')
    const sem = await gerarPdf(k2, semCampo, '')
    expect(Buffer.compare(com, sem)).toBe(0)
    // E o emitido baixado continua sendo o gravado na emissão
    const baixado = await t.chamar('GET', `/api/calibracoes/${k2.id}/pdf`, { cookie: t.cookieComum })
    expect(baixado.statusCode).toBe(200)
  })

  it('sem "Puxar", a emissão não ganha o bloco do campo', async () => {
    const { k } = await folhaQueVoltou()
    const r = await c.emitir(k)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().calibracao.emissao.campo).toBeUndefined()
  })
})

describe('criar a calibração com os dados do campo', () => {
  async function avulsaQueVoltou(corpo: Record<string, unknown>, ajustar?: (r: RegistroCampo, p: PacoteCampo) => void) {
    const { token } = await parearCelular(t)
    const r = await t.chamar('POST', '/api/folha-campo/enviar-tecnico', {
      cookie: t.cookieComum,
      payload: { tecnicoId: t.comumId, ...corpo },
    })
    expect(r.statusCode, r.body).toBe(200)
    const envio = r.json().envio
    const pacote = await baixarEConfirmar(t, token, envio.id)
    const registro = registroDoPacote(pacote, {
      tecnico: TECNICO(),
      ajustar: (x) => {
        preencher(x)
        ajustar?.(x, pacote)
      },
    })
    expect((await entregar(t, token, envio.id, registro)).statusCode).toBe(200)
    const lista = await t.chamar('GET', `/api/campo/registros?numero=${envio.numero}`, { cookie: t.cookieComum })
    return { envio, pacote, registroId: lista.json().registros[0].id as string }
  }

  it('folha avulsa da balança: a calibração nasce ligada à folha e com os dados; de novo, 409', async () => {
    await configurar('CELULAR')
    const { envio, registroId } = await avulsaQueVoltou({ balancaId: c.balanca.id })
    const r = await t.chamar('POST', `/api/campo/registros/${registroId}/criar-calibracao`, { cookie: t.cookieComum })
    expect(r.statusCode, r.body).toBe(201)
    const k = r.json().calibracao as Calibracao
    expect(k).toMatchObject({ status: 'RASCUNHO', balancaId: c.balanca.id, clienteId: c.cliente.id, tecnicoId: t.comumId })
    expect(k.tecnicoDefinidoPorId).toBe(t.comumId)
    expect(t.ctx.repo.folhaCampoDaCalibracao(k.id)?.numero).toBe(envio.numero)
    expect(k.dataCalibracao).toBe('2026-11-18')
    expect(k.ambiente.pressao).toBe(927)
    expect(r.json().importacao).toMatchObject({ tipo: 'PUXAR', calibracaoId: k.id })
    const campo = await campoDe(k.id)
    expect(campo).toMatchObject({ puxado: true, registroId, divergencias: [] })
    const de = await t.chamar('POST', `/api/campo/registros/${registroId}/criar-calibracao`, { cookie: t.cookieComum })
    expect(de.statusCode).toBe(409)
    expect(de.json()).toMatchObject({ codigo: 'TEM_CALIBRACAO', calibracaoId: k.id })
  })

  it('o técnico que o registro diz e que não é o do celular nem o da folha não vira o técnico da calibração nova', async () => {
    await configurar('CELULAR')
    const sig = await t.chamar('PUT', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin, payload: { signatario: true } })
    expect(sig.statusCode, sig.body).toBe(200)
    const { registroId } = await avulsaQueVoltou(
      { balancaId: c.balanca.id },
      (r) => (r.tecnico = { id: t.adminId, nome: 'Admin Teste' }),
    )
    const r = await t.chamar('POST', `/api/campo/registros/${registroId}/criar-calibracao`, { cookie: t.cookieComum })
    expect(r.statusCode, r.body).toBe(201)
    const k = r.json().calibracao as Calibracao
    expect(k.tecnicoId).toBe(t.comumId)
    expect(k.tecnicoDefinidoPorId).toBe(t.comumId)
    expect(impedimentoParaEmitir(true, k, { id: t.comumId, signatario: true })).toBe(TECNICO_NAO_AUTORIZA)
  })

  it('folha só do cliente: pede a balança cadastrada antes (de outro cliente, recusada); no piloto, recusada', async () => {
    const { registroId } = await avulsaQueVoltou({ clienteId: c.cliente.id, os: 'OS 88' })
    const piloto = await t.chamar('POST', `/api/campo/registros/${registroId}/criar-calibracao`, { cookie: t.cookieComum })
    expect(piloto.statusCode).toBe(409)
    expect(piloto.json().codigo).toBe('PILOTO')
    await configurar('CELULAR')
    const sem = await t.chamar('POST', `/api/campo/registros/${registroId}/criar-calibracao`, { cookie: t.cookieComum })
    expect(sem.statusCode).toBe(409)
    expect(sem.json().codigo).toBe('SEM_BALANCA')
    const nova = (
      await c.criar('/api/balancas', {
        ...BALANCA_VAZIA,
        clienteId: c.cliente.id,
        fabricante: 'Filizola',
        modelo: 'BP-15',
        numeroSerie: 'FZ-77',
        faixas: [{ max: 15, e: 0.005, d: 0.005 }],
      })
    ).balanca
    const r = await t.chamar('POST', `/api/campo/registros/${registroId}/criar-calibracao`, {
      cookie: t.cookieComum,
      payload: { balancaId: nova.id },
    })
    expect(r.statusCode, r.body).toBe(201)
    const k = r.json().calibracao as Calibracao
    expect(k).toMatchObject({ balancaId: nova.id, clienteId: c.cliente.id, ordemServico: 'OS 88' })
  })
})

describe('listas de apoio', () => {
  it('os técnicos com celular: a hora em que o celular foi visto só para quem cuida dos usuários', async () => {
    await parearCelular(t)
    t.ctx.db.prepare("UPDATE dispositivos SET ultimo_contato = '2026-11-18T10:55:00.000Z', ultimo_ip = '192.168.0.23'").run()
    const comum = (await t.chamar('GET', '/api/campo/tecnicos', { cookie: t.cookieComum })).json().tecnicos as TecnicoParaEnvio[]
    const tecnico = comum.find((x) => x.id === t.comumId)!
    expect(tecnico.celulares).toHaveLength(1)
    expect(tecnico.celulares[0].ultimoContato).toBeUndefined()
    expect(JSON.stringify(comum)).not.toContain('192.168')
    const admin = (await t.chamar('GET', '/api/campo/tecnicos', { cookie: t.cookieAdmin })).json().tecnicos as TecnicoParaEnvio[]
    expect(admin.find((x) => x.id === t.comumId)!.celulares[0].ultimoContato).toBe('2026-11-18T10:55:00.000Z')
  })

  it('a ficha da balança: as folhas que foram para o celular; a aba das folhas filtra as do celular', async () => {
    const { envio } = await folhaQueVoltou()
    await c.calibracaoPronta()
    const r = await t.chamar('GET', `/api/balancas/${c.balanca.id}/campo`, { cookie: t.cookieComum })
    expect(r.statusCode, r.body).toBe(200)
    const folhas = r.json().folhas as FolhaCampoDaBalanca[]
    expect(folhas.map((f) => f.numero)).toEqual([envio.numero])
    expect(folhas[0].celular).toMatchObject({ situacao: 'DEVOLVIDA', voltou: true })
    expect(folhas[0].celular.registroId).toBeTruthy()
    // A folha impressa (sem celular) fica fora do filtro "Celular"
    const outra = await c.calibracaoPronta()
    expect((await t.chamar('GET', `/api/calibracoes/${outra.id}/folha-campo`, { cookie: t.cookieComum })).statusCode).toBe(200)
    const todas = (await t.chamar('GET', '/api/folhas-campo', { cookie: t.cookieComum })).json()
    const doCelular = (await t.chamar('GET', '/api/folhas-campo?situacao=CELULAR', { cookie: t.cookieComum })).json()
    expect(todas.total).toBe(2)
    expect(doCelular.itens.map((f: { numero: string }) => f.numero)).toEqual([envio.numero])
  })
})

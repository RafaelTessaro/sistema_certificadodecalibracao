// Nº do certificado reservado na impressão da folha de campo (o técnico o copia na etiqueta da balança e o
// certificado é emitido com ele): a reserva na primeira impressão (e não na reimpressão nem na folha nova), a
// emissão com e sem reserva (e com a de outro ano), dois pedidos ao mesmo tempo, o nº que segue o papel (a
// exclusão devolve o nº à folha; a folha ligada leva o dela para a calibração; o engano desfeito devolve cada nº
// ao seu papel; o que não pode mais ser usado gera o aviso), as calibrações de antes desta versão, a lista dos
// nºs não utilizados, o descarte do nº de uma avulsa e a volta de uma cópia do banco (com a ferramenta, e à mão,
// pela pasta das folhas). O PDF da folha é trocado por um falso (rápido), com o nº nas palavras-chave, como o
// de verdade, e que guarda o que o gerador recebeu.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Calibracao, EmissaoCertificado, NumeroReservado } from '#shared/tipos.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin } from './auxiliaresTeste.ts'
import { abrirBanco } from './db.ts'
import type { DadosFolhaCampo } from './pdf/folhaCampo.ts'
import { Repositorio } from './repositorio.ts'
import { transplantarFolhasCampo } from './usuarios.ts'

const { recebidos } = vi.hoisted(() => ({ recebidos: [] as Array<{ numero: string; numeroCertificado?: string }> }))
vi.mock('./pdf/folhaCampo.ts', async (original) => {
  const m = await original<typeof import('./pdf/folhaCampo.ts')>()
  return {
    ...m,
    gerarFolhaCampoPdf: async (d: DadosFolhaCampo & { numeroCertificado?: string }) => {
      recebidos.push({ numero: d.numero, numeroCertificado: d.numeroCertificado })
      // Um pouco de espera, como o gerador de verdade: os pedidos ao mesmo tempo se intercalam
      await new Promise((r) => setTimeout(r, 15))
      const certificado = d.numeroCertificado ? `; certificado ${d.numeroCertificado}` : ''
      return Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Keywords (folha de campo; ${d.numero}${certificado}) >>\nendobj\n%%EOF\n`, 'latin1')
    },
  }
})

const ano = new Date().getFullYear()
const cc = (seq: number, a = ano) => `CC-${a}-${String(seq).padStart(5, '0')}`

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>
let pastaExtra = ''
let chaves = 0

async function iniciar(opcoes: Parameters<typeof criarAppComLogin>[0] = {}) {
  t = await criarAppComLogin(opcoes)
  c = await cenarioCalibracao(t)
}
beforeEach(() => {
  recebidos.length = 0
})
afterEach(async () => {
  await t?.fechar()
  if (pastaExtra) rmSync(pastaExtra, { recursive: true, force: true })
  pastaExtra = ''
})

const folhaDe = (id: string, extra = '', cookie = t.cookieAdmin) =>
  t.chamar('GET', `/api/calibracoes/${id}/folha-campo${extra}`, { cookie })
const novaChave = () => `chave-${String(++chaves).padStart(4, '0')}-teste`
const folhaNova = (id: string) => folhaDe(id, `?nova=${novaChave()}`)
/** Folha avulsa (em branco; `q`: '&balancaId=…' ou '&clienteId=…'); devolve o nº FC. */
async function avulsa(q = '', cookie = t.cookieComum) {
  const r = await t.chamar('GET', `/api/folha-campo?chave=${novaChave()}${q}`, { cookie })
  expect(r.statusCode, r.body).toBe(200)
  return r.headers['x-folha-campo'] as string
}
const ligar = (id: string, numero: string, cookie = t.cookieComum) =>
  t.chamar('PUT', `/api/calibracoes/${id}/folha-campo`, { cookie, payload: { numero } })
const detalhe = async (id: string) => (await t.chamar('GET', `/api/calibracoes/${id}`, { cookie: t.cookieAdmin })).json()
const reservadoDe = async (id: string): Promise<NumeroReservado | null> => (await detalhe(id)).numeroReservado
async function emitir(id: string) {
  const r = await c.emitir((await detalhe(id)).calibracao as Calibracao)
  expect(r.statusCode, r.body).toBe(200)
  return r.json().calibracao as Calibracao
}
const tabela = () =>
  t.ctx.db
    .prepare(
      'SELECT numero, ano, sequencia, calibracao_id, folha, situacao, motivo, situacao_por FROM numeros_reservados ORDER BY ano, sequencia',
    )
    .all() as Array<Record<string, string | number>>
const registros = (acao: string) =>
  (
    t.ctx.db.prepare('SELECT alvo, detalhe FROM auditoria WHERE acao = ? ORDER BY id').all(acao) as Array<{
      alvo: string
      detalhe: string
    }>
  ).map((r) => [r.alvo, r.detalhe])
const numeroNaFolha = (fc: string) =>
  (t.ctx.db.prepare('SELECT numero_certificado FROM folhas_campo WHERE numero = ?').get(fc) as { numero_certificado: string })
    .numero_certificado

describe('reserva na primeira impressão da folha de campo', { timeout: 30_000 }, () => {
  it('a folha sai com o nº; a reimpressão e a folha nova continuam com ele, e a emissão usa o mesmo', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const r = await folhaDe(k.id, '', t.cookieComum)
    expect(r.statusCode, r.body).toBe(200)
    const fc = r.headers['x-folha-campo'] as string
    expect(recebidos).toEqual([{ numero: fc, numeroCertificado: cc(1) }])
    expect(numeroNaFolha(fc)).toBe(cc(1))
    expect(await reservadoDe(k.id)).toMatchObject({
      numero: cc(1),
      ano,
      sequencia: 1,
      calibracaoId: k.id,
      folha: fc,
      reservadoPor: 'Comum Teste',
      situacao: 'reservado',
    })
    // Na lista (rascunhos) e na busca pelo nº
    const lista = (await t.chamar('GET', '/api/calibracoes?status=ABERTAS', { cookie: t.cookieComum })).json()
    expect(lista.itens).toEqual([expect.objectContaining({ id: k.id, numero: '', numeroReservado: cc(1) })])
    const busca = (await t.chamar('GET', `/api/calibracoes?busca=${encodeURIComponent(cc(1))}`, { cookie: t.cookieComum })).json()
    expect(busca.itens.map((x: { id: string }) => x.id)).toEqual([k.id])
    expect((await t.chamar('GET', '/api/painel', { cookie: t.cookieComum })).json().painel.emAndamento[0]).toMatchObject({
      numeroReservado: cc(1),
    })
    // O registro de atividades: quem reservou, qual e em qual folha
    expect(registros('NUMERO_RESERVADO')).toEqual([[k.id, `${cc(1)} · folha ${fc}`]])

    // Reimpressão: o mesmo papel (sem gerar de novo); folha nova: nº FC novo, o mesmo nº de certificado
    expect((await folhaDe(k.id)).headers['x-folha-campo']).toBe(fc)
    const nova = await folhaNova(k.id)
    expect(nova.statusCode, nova.body).toBe(200)
    expect(nova.headers['x-folha-campo']).not.toBe(fc)
    expect(recebidos.map((x) => x.numeroCertificado)).toEqual([cc(1), cc(1)])
    expect(tabela()).toHaveLength(1)

    // Outra calibração impressa depois: o próximo
    const outra = await c.calibracaoPronta()
    await folhaDe(outra.id)
    expect((await reservadoDe(outra.id))?.numero).toBe(cc(2))

    // A emissão usa o nº reservado (a etiqueta), e o registro passa a emitido
    const emitida = await emitir(k.id)
    expect(emitida).toMatchObject({ numero: cc(1), ano, sequencia: 1 })
    expect(tabela()[0]).toMatchObject({ numero: cc(1), situacao: 'emitido', situacao_por: 'Admin Teste' })
    expect(await reservadoDe(emitida.id)).toBeNull()
    expect(registros('CERTIFICADO_EMITIDO').at(-1)).toEqual([
      k.id,
      `POST /api/calibracoes/:id/emitir | ${cc(1)}, reservado na folha de campo ${fc}`,
    ])
    // Sem reserva: o próximo depois dos reservados (nunca um nº já dado)
    const semFolha = await c.calibracaoPronta()
    expect((await emitir(semFolha.id)).numero).toBe(cc(3))
    expect((await emitir(outra.id)).numero).toBe(cc(2))
  })

  it('"Criar e imprimir folha de campo" (o rascunho criado e a folha pedida logo depois) reserva o nº', async () => {
    await iniciar()
    const criado = await t.chamar('POST', '/api/calibracoes', {
      cookie: t.cookieComum,
      payload: { clienteId: c.cliente.id, balancaId: c.balanca.id, ordemServico: '77' },
    })
    const k = criado.json().calibracao as Calibracao
    expect((await folhaDe(k.id, '', t.cookieComum)).statusCode).toBe(200)
    expect(recebidos[0].numeroCertificado).toBe(cc(1))
    expect((await reservadoDe(k.id))?.numero).toBe(cc(1))
  })

  it('dois pedidos ao mesmo tempo nunca dividem um nº (e o da mesma calibração é um só)', async () => {
    await iniciar()
    const ks = await Promise.all(Array.from({ length: 5 }, () => c.calibracaoPronta()))
    const respostas = await Promise.all([
      ...ks.map((k) => folhaDe(k.id)),
      folhaDe(ks[0].id, '', t.cookieComum),
      t.chamar('GET', `/api/folha-campo?chave=${novaChave()}`, { cookie: t.cookieComum }),
      t.chamar('GET', `/api/folha-campo?chave=${novaChave()}&balancaId=${c.balanca.id}`, { cookie: t.cookieAdmin }),
    ])
    expect(respostas.map((r) => r.statusCode)).toEqual(Array(8).fill(200))
    // Os dois pedidos da mesma calibração: a mesma folha e o mesmo nº
    expect(respostas[5].headers['x-folha-campo']).toBe(respostas[0].headers['x-folha-campo'])
    const porFolha = new Map(recebidos.map((x) => [x.numero, x.numeroCertificado]))
    expect(porFolha.size).toBe(7)
    const nums = [...porFolha.values()]
    expect(new Set(nums).size).toBe(7)
    expect([...nums].sort()).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => cc(n)))
    expect(tabela().map((x) => x.sequencia)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (const k of ks) expect((await reservadoDe(k.id))?.numero).toBe(porFolha.get(numeroDe(await folhaDe(k.id))))
  })

  it('duas conexões ao mesmo banco (outro processo) reservando alternadas: nºs diferentes, em sequência', async () => {
    pastaExtra = mkdtempSync(join(tmpdir(), 'bcf-numeros-'))
    const arquivo = join(pastaExtra, 'banco.db')
    await iniciar({ arquivoBanco: arquivo })
    const outroBanco = abrirBanco(arquivo)
    try {
      const outro = new Repositorio(outroBanco)
      const ks = await Promise.all(Array.from({ length: 4 }, () => c.calibracaoPronta()))
      const repos = [t.ctx.repo, outro, t.ctx.repo, outro]
      const dados = ks.map((k, i) =>
        repos[i].reservarFolhaCampo({ chave: `calibracao:${k.id}`, calibracaoId: k.id, por: `Pessoa ${i}` }),
      )
      const avulsas = [outro, t.ctx.repo].map((r, i) => r.reservarFolhaCampo({ chave: `avulsa:conexao-${i}`, por: 'Ana' }))
      expect([...dados, ...avulsas].map((x) => x.numeroCertificado)).toEqual([1, 2, 3, 4, 5, 6].map((n) => cc(n)))
      // A emissão pela primeira conexão continua depois dos reservados pela outra
      const semFolha = await c.calibracaoPronta()
      expect((await emitir(semFolha.id)).numero).toBe(cc(7))
    } finally {
      outroBanco.close()
    }
  })

  it('revisão: sai com o nº do certificado revisado (a folha é a dele), sem reservar outro', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const fc = numeroDe(await folhaDe(k.id))
    const emitida = await emitir(k.id)
    const rev = await t.chamar('POST', `/api/calibracoes/${emitida.id}/revisar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Correção do endereço' },
    })
    const revisao = rev.json().calibracao as Calibracao
    const r = await folhaDe(revisao.id)
    expect(r.headers['x-folha-campo']).toBe(fc)
    expect(await reservadoDe(revisao.id)).toBeNull()
    expect(tabela()).toHaveLength(1)
    expect((await emitir(revisao.id)).numero).toBe(`${cc(1)}-R1`)
  })

  it('a folha impressa num ano e o certificado emitido no outro: o nº continua o da folha (o do ano da reserva)', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    t.ctx.repo.agora = () => new Date(ano - 1, 11, 30, 15, 0)
    await folhaDe(k.id)
    expect(recebidos[0].numeroCertificado).toBe(cc(1, ano - 1))
    t.ctx.repo.agora = () => new Date()
    const emitida = await emitir(k.id)
    expect(emitida).toMatchObject({ numero: cc(1, ano - 1), ano: ano - 1, sequencia: 1 })
    expect(emitida.dataEmissao.slice(0, 4)).toBe(String(ano))
    // O ano novo começa a sua sequência
    expect((await emitir((await c.calibracaoPronta()).id)).numero).toBe(cc(1))
  })

  it('o formato da numeração mudou depois da reserva: o certificado sai como o nº impresso na folha', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    await folhaDe(k.id)
    const config = t.ctx.repo.obterConfig()
    t.ctx.repo.salvarConfig({ ...config, numeracao: { formato: '{seq}/{ano}', digitos: 4 } })
    expect((await emitir(k.id)).numero).toBe(cc(1))
    expect((await emitir((await c.calibracaoPronta()).id)).numero).toBe(`0002/${ano}`)
  })

  it('o nº reservado já num certificado (banco mexido): não sai repetido; fica não utilizado e a emissão dá outro', async () => {
    await iniciar()
    const a = await c.calibracaoPronta()
    expect((await emitir(a.id)).numero).toBe(cc(1))
    const b = await c.calibracaoPronta()
    await folhaDe(b.id)
    t.ctx.db.prepare('UPDATE numeros_reservados SET sequencia = 1, numero = ? WHERE calibracao_id = ?').run(cc(1), b.id)
    const emitida = await emitir(b.id)
    expect(emitida.numero).not.toBe(cc(1))
    expect(tabela()).toEqual([
      expect.objectContaining({
        sequencia: 1,
        situacao: 'nao_utilizado',
        motivo: expect.stringContaining('já estava em outro certificado'),
      }),
    ])
  })
})

describe('calibração excluída antes da emissão: o nº segue o papel', { timeout: 30_000 }, () => {
  it('o nº volta para a folha dela (reservado, sem dono), nunca vai para outra calibração, e passa para a refeita ligada a ela', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const fc = numeroDe(await folhaDe(k.id))
    const r = await t.chamar('DELETE', `/api/calibracoes/${k.id}`, { cookie: t.cookieComum })
    expect(r.statusCode, r.body).toBe(204)
    expect(tabela()).toEqual([
      expect.objectContaining({ numero: cc(1), calibracao_id: '', folha: fc, situacao: 'reservado', motivo: '' }),
    ])
    expect(registros('NUMERO_RESERVADO').at(-1)).toEqual([
      '',
      `${cc(1)} · voltou para a folha ${fc} (calibração excluída antes da emissão: rascunho, Mercado Bom Preço, balança nº de série TL-2231)`,
    ])
    expect(registros('NUMERO_NAO_UTILIZADO')).toEqual([])
    // Na lista dos nºs: reservado numa folha ainda não ligada
    const lista = (await t.chamar('GET', '/api/numeros-reservados', { cookie: t.cookieComum })).json()
    expect(lista.numeros).toEqual([expect.objectContaining({ numero: cc(1), calibracaoId: '', situacao: 'reservado' })])
    // Nunca para outra calibração: nem na próxima reserva, nem na emissão
    const outra = await c.calibracaoPronta()
    await folhaDe(outra.id)
    expect((await reservadoDe(outra.id))?.numero).toBe(cc(2))
    expect((await emitir((await c.calibracaoPronta()).id)).numero).toBe(cc(3))
    // A calibração refeita a partir do mesmo papel: a folha traz o nº dela (o da etiqueta), sem aviso
    const refeita = await c.calibracaoPronta()
    const ligada = await ligar(refeita.id, fc)
    expect(ligada.statusCode, ligada.body).toBe(200)
    expect(ligada.json()).toMatchObject({
      numeroReservado: { numero: cc(1), calibracaoId: refeita.id },
      numeroDaFolha: { numero: cc(1), usado: true },
    })
    expect(registros('NUMERO_RESERVADO').at(-1)).toEqual([refeita.id, `${cc(1)} · da folha ${fc}, ligada a esta calibração`])
    expect((await emitir(refeita.id)).numero).toBe(cc(1))
  })

  it('a avulsa ligada ao rascunho excluído: o nº volta para ela e passa para a calibração refeita', async () => {
    await iniciar()
    const fc = await avulsa()
    const k = await c.calibracaoPronta()
    expect((await ligar(k.id, fc)).json().numeroReservado.numero).toBe(cc(1))
    expect((await t.chamar('DELETE', `/api/calibracoes/${k.id}`, { cookie: t.cookieComum })).statusCode).toBe(204)
    expect(tabela()).toEqual([expect.objectContaining({ numero: cc(1), calibracao_id: '', situacao: 'reservado' })])
    const refeita = await c.calibracaoPronta()
    expect((await ligar(refeita.id, fc)).json()).toMatchObject({
      numeroReservado: { numero: cc(1), calibracaoId: refeita.id },
      numeroDaFolha: { numero: cc(1), usado: true },
    })
    expect((await emitir(refeita.id)).numero).toBe(cc(1))
  })

  it('a refeita que já tinha folha impressa (não foi a campo): passa a usar o nº do papel ligado, e o dela fica não utilizado', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const fc = numeroDe(await folhaDe(k.id))
    expect((await t.chamar('DELETE', `/api/calibracoes/${k.id}`, { cookie: t.cookieComum })).statusCode).toBe(204)
    const refeita = await c.calibracaoPronta()
    await folhaDe(refeita.id)
    expect((await reservadoDe(refeita.id))?.numero).toBe(cc(2))
    const r = await ligar(refeita.id, fc)
    expect(r.json()).toMatchObject({ numeroReservado: { numero: cc(1) }, numeroDaFolha: { numero: cc(1), usado: true } })
    expect(tabela()[1]).toMatchObject({
      numero: cc(2),
      calibracao_id: refeita.id,
      situacao: 'nao_utilizado',
      motivo: `A calibração (rascunho, Mercado Bom Preço, balança nº de série TL-2231) passou a usar o nº ${cc(1)}, da folha ${fc}, ligada no lugar da folha com este nº, que não foi a campo.`,
    })
    expect((await emitir(refeita.id)).numero).toBe(cc(1))
  })

  it('sem nº reservado: nada a registrar', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    expect((await t.chamar('DELETE', `/api/calibracoes/${k.id}`, { cookie: t.cookieComum })).statusCode).toBe(204)
    expect(tabela()).toEqual([])
    expect(registros('NUMERO_NAO_UTILIZADO')).toEqual([])
    expect(registros('NUMERO_RESERVADO')).toEqual([])
  })
})

describe('folha avulsa', { timeout: 30_000 }, () => {
  it('em branco, do cliente ou da balança: reserva um nº da folha; o mesmo pedido de novo, o mesmo', async () => {
    await iniciar()
    const chave = novaChave()
    const r1 = await t.chamar('GET', `/api/folha-campo?chave=${chave}`, { cookie: t.cookieComum })
    const r2 = await t.chamar('GET', `/api/folha-campo?chave=${chave}`, { cookie: t.cookieComum })
    expect(r2.headers['x-folha-campo']).toBe(r1.headers['x-folha-campo'])
    const doCliente = await avulsa(`&clienteId=${c.cliente.id}`)
    const daBalanca = await avulsa(`&balancaId=${c.balanca.id}`)
    expect(recebidos.map((x) => x.numeroCertificado)).toEqual([cc(1), cc(2), cc(3)])
    expect(tabela()).toEqual([
      expect.objectContaining({ numero: cc(1), calibracao_id: '', folha: r1.headers['x-folha-campo'], situacao: 'reservado' }),
      expect.objectContaining({ numero: cc(2), calibracao_id: '', folha: doCliente }),
      expect.objectContaining({ numero: cc(3), calibracao_id: '', folha: daBalanca }),
    ])
    expect(registros('NUMERO_RESERVADO')[0]).toEqual(['', `${cc(1)} · folha avulsa ${r1.headers['x-folha-campo']}`])
  })

  it('ligada a uma calibração sem nº: o nº da folha passa para ela, e a emissão usa ele', async () => {
    await iniciar()
    const fc = await avulsa()
    const k = await c.calibracaoPronta()
    const r = await ligar(k.id, fc)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      numeroReservado: { numero: cc(1), calibracaoId: k.id, folha: fc },
      numeroDaFolha: { numero: cc(1), usado: true },
    })
    expect(registros('NUMERO_RESERVADO').at(-1)).toEqual([k.id, `${cc(1)} · da folha avulsa ${fc}, ligada a esta calibração`])
    // A reimpressão é a avulsa (com o nº dela); a emissão, com o mesmo nº
    expect((await folhaDe(k.id)).headers['x-folha-campo']).toBe(fc)
    expect((await emitir(k.id)).numero).toBe(cc(1))
  })

  it('ligada a uma calibração que já tem nº (a folha dela não foi a campo): ela passa a usar o da folha ligada', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const fcK = numeroDe(await folhaDe(k.id))
    const fc = await avulsa()
    const r = await ligar(k.id, fc)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      numeroReservado: { numero: cc(2), calibracaoId: k.id },
      numeroDaFolha: { numero: cc(2), usado: true },
      folhaCampo: { numero: fc, substituidas: [fcK] },
    })
    const motivo = `A calibração (rascunho, Mercado Bom Preço, balança nº de série TL-2231) passou a usar o nº ${cc(2)}, da folha ${fc}, ligada no lugar da folha com este nº, que não foi a campo.`
    expect(tabela()[0]).toMatchObject({
      numero: cc(1),
      calibracao_id: k.id,
      situacao: 'nao_utilizado',
      motivo,
      situacao_por: 'Comum Teste',
    })
    expect(registros('NUMERO_NAO_UTILIZADO')).toEqual([[k.id, `${cc(1)} · ${motivo}`]])
    expect(registros('NUMERO_RESERVADO').at(-1)).toEqual([k.id, `${cc(2)} · da folha avulsa ${fc}, ligada a esta calibração`])
    // Na lista, com o motivo (explica o salto)
    const lista = (await t.chamar('GET', '/api/numeros-reservados', { cookie: t.cookieComum })).json().numeros as NumeroReservado[]
    expect(lista.find((n) => n.numero === cc(1))).toMatchObject({ situacao: 'nao_utilizado', motivo })
    // O certificado sai com o nº da folha que foi a campo (o da etiqueta)
    expect((await emitir(k.id)).numero).toBe(cc(2))
  })

  it('ligada por engano à calibração que já tinha nº e desfeita: cada nº volta para o seu papel', async () => {
    await iniciar()
    const a = await c.calibracaoPronta()
    const fcA = numeroDe(await folhaDe(a.id))
    const fc = await avulsa()
    expect((await ligar(a.id, fc)).json().numeroReservado.numero).toBe(cc(2))
    // A folha que foi a campo era a dela: ligada de novo, o nº dela volta a valer, e o da avulsa volta para ela
    const volta = await ligar(a.id, fcA)
    expect(volta.statusCode, volta.body).toBe(200)
    expect(volta.json()).toMatchObject({
      numeroReservado: { numero: cc(1), calibracaoId: a.id },
      numeroDaFolha: { numero: cc(1), usado: true },
    })
    expect(tabela()).toEqual([
      expect.objectContaining({ numero: cc(1), calibracao_id: a.id, situacao: 'reservado', motivo: '', situacao_por: '' }),
      expect.objectContaining({ numero: cc(2), calibracao_id: '', folha: fc, situacao: 'reservado' }),
    ])
    expect(registros('NUMERO_RESERVADO').slice(-2)).toEqual([
      [a.id, `${cc(2)} · voltou para a folha avulsa ${fc}, que saiu desta calibração`],
      [a.id, `${cc(1)} · da folha ${fcA}, ligada de novo a esta calibração`],
    ])
    // A avulsa ligada à calibração certa: o nº dela vai junto
    const certa = await c.calibracaoPronta()
    expect((await ligar(certa.id, fc)).json()).toMatchObject({
      numeroReservado: { numero: cc(2), calibracaoId: certa.id },
      numeroDaFolha: { numero: cc(2), usado: true },
    })
    expect((await emitir(a.id)).numero).toBe(cc(1))
    expect((await emitir(certa.id)).numero).toBe(cc(2))
  })

  it('a folha de um certificado cancelado passada para a refeita: o nº dela (emitido) não volta, e a tela avisa', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const fc = numeroDe(await folhaDe(k.id))
    const emitida = await emitir(k.id)
    const cancelar = await t.chamar('POST', `/api/calibracoes/${emitida.id}/cancelar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Balança errada no certificado' },
    })
    expect(cancelar.statusCode, cancelar.body).toBe(200)
    const refeita = await c.calibracaoPronta()
    const r = await ligar(refeita.id, fc, t.cookieAdmin)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({
      numeroReservado: null,
      numeroDaFolha: {
        numero: cc(1),
        usado: false,
        motivo: `O nº ${cc(1)} é o do certificado cancelado ${cc(1)}: um nº emitido não é usado de novo. Esta calibração recebe outro nº na emissão.`,
      },
    })
    // Excluída a refeita, a folha volta para o cancelado. Outra refeita, com nº próprio (a folha dela, impressa
    // antes, não foi a campo): fica com ele, e o aviso diz qual
    expect((await t.chamar('DELETE', `/api/calibracoes/${refeita.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(204)
    const outra = await c.calibracaoPronta()
    await folhaDe(outra.id)
    const r2 = await ligar(outra.id, fc, t.cookieAdmin)
    expect(r2.statusCode, r2.body).toBe(200)
    expect(r2.json()).toMatchObject({
      numeroReservado: { numero: cc(2), calibracaoId: outra.id },
      numeroDaFolha: {
        numero: cc(1),
        usado: false,
        motivo: `O nº ${cc(1)} é o do certificado cancelado ${cc(1)}: um nº emitido não é usado de novo. Esta calibração vai ser emitida com o nº ${cc(2)}.`,
      },
    })
    expect(tabela().find((x) => x.numero === cc(1))).toMatchObject({ situacao: 'emitido', calibracao_id: k.id })
    expect((await emitir(outra.id)).numero).toBe(cc(2))
  })

  it('ligada a uma revisão: a revisão sai com o nº do revisado, e o da folha fica não utilizado', async () => {
    await iniciar()
    const emitida = await emitir((await c.calibracaoPronta()).id)
    const revisao = (
      await t.chamar('POST', `/api/calibracoes/${emitida.id}/revisar`, {
        cookie: t.cookieAdmin,
        payload: { motivo: 'Nova visita' },
      })
    ).json().calibracao as Calibracao
    const fc = await avulsa()
    const r = await ligar(revisao.id, fc)
    expect(r.json()).toMatchObject({
      numeroReservado: null,
      numeroDaFolha: { numero: cc(2), usado: false, motivo: `Uma revisão sai com o nº do certificado revisado (${cc(1)}).` },
    })
    expect(tabela()[0]).toMatchObject({
      numero: cc(2),
      calibracao_id: revisao.id,
      situacao: 'nao_utilizado',
      motivo: `A folha ${fc} foi ligada à revisão do certificado ${cc(1)}, que sai com o nº do certificado revisado.`,
    })
    expect((await emitir(revisao.id)).numero).toBe(`${cc(1)}-R1`)
  })

  it('ligada por engano a uma revisão e trocada: o nº volta para a avulsa e passa para a calibração certa', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const fcK = numeroDe(await folhaDe(k.id))
    const emitida = await emitir(k.id)
    const revisao = (
      await t.chamar('POST', `/api/calibracoes/${emitida.id}/revisar`, {
        cookie: t.cookieAdmin,
        payload: { motivo: 'Correção do endereço' },
      })
    ).json().calibracao as Calibracao
    const fc = await avulsa()
    expect((await ligar(revisao.id, fc)).json().numeroDaFolha).toMatchObject({ numero: cc(2), usado: false })
    // A revisão volta para a folha do certificado revisado (a mesma visita): a avulsa fica livre, com o nº dela
    const volta = await ligar(revisao.id, fcK)
    expect(volta.statusCode, volta.body).toBe(200)
    expect(volta.json()).toMatchObject({ folhaCampo: { numero: fcK }, numeroDaFolha: null })
    expect(tabela()[1]).toMatchObject({ numero: cc(2), calibracao_id: '', situacao: 'reservado', motivo: '', situacao_por: '' })
    const certa = await c.calibracaoPronta()
    expect((await ligar(certa.id, fc)).json()).toMatchObject({
      numeroReservado: { numero: cc(2), calibracaoId: certa.id },
      numeroDaFolha: { numero: cc(2), usado: true },
    })
    expect((await emitir(revisao.id)).numero).toBe(`${cc(1)}-R1`)
    expect((await emitir(certa.id)).numero).toBe(cc(2))
  })

  it('ligada por engano e trocada: o nº volta para a avulsa e passa para a calibração certa', async () => {
    await iniciar()
    const fc1 = await avulsa()
    const fc2 = await avulsa()
    const x = await c.calibracaoPronta()
    const y = await c.calibracaoPronta()
    expect((await ligar(x.id, fc1)).json().numeroReservado.numero).toBe(cc(1))
    // O papel de x era a fc2: a fc1 fica livre, com o nº dela, e x fica com o da fc2
    const troca = await ligar(x.id, fc2)
    expect(troca.json()).toMatchObject({ numeroReservado: { numero: cc(2) }, numeroDaFolha: { numero: cc(2), usado: true } })
    expect(tabela()[0]).toMatchObject({ numero: cc(1), calibracao_id: '', folha: fc1, situacao: 'reservado' })
    expect(registros('NUMERO_RESERVADO')).toContainEqual([
      x.id,
      `${cc(1)} · voltou para a folha avulsa ${fc1}, que saiu desta calibração`,
    ])
    expect((await ligar(y.id, fc1)).json().numeroReservado.numero).toBe(cc(1))
    expect((await emitir(x.id)).numero).toBe(cc(2))
    expect((await emitir(y.id)).numero).toBe(cc(1))
  })

  it('folha nova no lugar de uma avulsa ligada: a avulsa leva o nº dela, e a calibração ganha outro na folha nova', async () => {
    await iniciar()
    const fc = await avulsa()
    const k = await c.calibracaoPronta()
    await ligar(k.id, fc)
    const nova = await folhaNova(k.id)
    expect(nova.statusCode, nova.body).toBe(200)
    expect(recebidos.at(-1)).toEqual({ numero: numeroDe(nova), numeroCertificado: cc(2) })
    expect((await reservadoDe(k.id))?.numero).toBe(cc(2))
    expect(tabela()[0]).toMatchObject({ numero: cc(1), calibracao_id: '', folha: fc })
  })

  it('a que não vai ser usada: só o administrador registra o nº como não utilizado, com o motivo', async () => {
    await iniciar()
    const fc = await avulsa()
    const k = await c.calibracaoPronta()
    await folhaDe(k.id)
    // A lista: do mais novo para o mais antigo (o da calibração e o da avulsa, ainda reservados)
    const numeros = (await t.chamar('GET', '/api/numeros-reservados', { cookie: t.cookieComum })).json()
      .numeros as NumeroReservado[]
    expect(numeros.map((n) => [n.numero, n.calibracaoId, n.situacao])).toEqual([
      [cc(2), k.id, 'reservado'],
      [cc(1), '', 'reservado'],
    ])
    const [daK, doPapel] = numeros
    const descartar = (id: number, motivo: string, cookie = t.cookieAdmin) =>
      t.chamar('POST', `/api/numeros-reservados/${id}/nao-utilizado`, { cookie, payload: { motivo } })
    expect((await descartar(doPapel.id, 'Folha perdida', t.cookieComum)).statusCode).toBe(403)
    expect((await descartar(doPapel.id, 'x')).statusCode).toBe(400)
    expect((await descartar(daK.id, 'Não quero mais')).statusCode).toBe(409)
    expect((await descartar(9999, 'Folha perdida')).statusCode).toBe(404)
    const ok = await descartar(doPapel.id, 'Folha molhada na chuva, jogada fora')
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json().numero).toMatchObject({
      numero: cc(1),
      situacao: 'nao_utilizado',
      motivo: 'Folha molhada na chuva, jogada fora',
      situacaoPor: 'Admin Teste',
    })
    expect((await descartar(doPapel.id, 'De novo, de novo')).statusCode).toBe(409)
    // O registro guarda qual nº e de qual folha (não o texto digitado)
    expect(registros('NUMERO_NAO_UTILIZADO')).toEqual([
      ['', `POST /api/numeros-reservados/:reserva/nao-utilizado | ${cc(1)} · folha ${fc}`],
    ])
    // Ligada depois disso: o nº não volta (a calibração fica sem nº até imprimir a folha dela ou emitir), e a tela
    // avisa para corrigir a etiqueta
    const outra = await c.calibracaoPronta()
    expect((await ligar(outra.id, fc)).json()).toMatchObject({
      numeroReservado: null,
      numeroDaFolha: {
        numero: cc(1),
        usado: false,
        motivo: `O nº ${cc(1)} foi registrado como não utilizado: Folha molhada na chuva, jogada fora. Esta calibração recebe outro nº na emissão.`,
      },
    })
  })
})

describe('calibrações de antes desta versão', { timeout: 30_000 }, () => {
  it('rascunho sem nº reservado: emite como antes; a folha impressa antes (sem nº) é reimpressa igual, sem reservar', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    // A folha de antes desta versão: impressa, com o PDF guardado e sem nº de certificado
    const pdf = Buffer.from('%PDF-1.7\n% folha antiga\n%%EOF\n')
    t.ctx.db
      .prepare(
        `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, impressa_por, impressa_em, ultima_em, pdf)
         VALUES (?, ?, 1, ?, ?, 'Ana', ?, ?, ?)`,
      )
      .run(`FC-${ano}-00001`, ano, `calibracao:${k.id}`, k.id, new Date().toISOString(), new Date().toISOString(), pdf)
    const r = await folhaDe(k.id)
    expect(r.rawPayload.equals(pdf)).toBe(true)
    expect(recebidos).toEqual([])
    expect(await reservadoDe(k.id)).toBeNull()
    expect(tabela()).toEqual([])
    // Folha nova: essa sai com o nº (reservado agora)
    await folhaNova(k.id)
    expect(recebidos.at(-1)?.numeroCertificado).toBe(cc(1))
    // E o rascunho sem folha nenhuma emite como antes
    const semFolha = await c.calibracaoPronta()
    expect((await emitir(semFolha.id)).numero).toBe(cc(2))
    expect((await emitir(k.id)).numero).toBe(cc(1))
  })

  it('o contador da emissão de antes continua valendo: a reserva vem depois do último emitido', async () => {
    await iniciar()
    t.ctx.db.prepare("INSERT INTO meta (chave, valor) VALUES (?, '41')").run(`sequencia_${ano}`)
    const k = await c.calibracaoPronta()
    await folhaDe(k.id)
    expect((await reservadoDe(k.id))?.numero).toBe(cc(42))
  })
})

describe('restauração de uma cópia do banco', { timeout: 30_000 }, () => {
  it('os nºs reservados depois da cópia passam para ela (nunca se repetem), e o da calibração que não existe fica com a folha', async () => {
    await iniciar()
    const antes = await c.calibracaoPronta()
    await folhaDe(antes.id)
    const copia = await t.ctx.backups.copiar('manual')
    // Depois da cópia: uma calibração nova com folha, uma avulsa e uma emissão sem folha
    const depois = await c.calibracaoPronta()
    const fcDepois = numeroDe(await folhaDe(depois.id))
    const fcAvulsa = await avulsa()
    await emitir((await c.calibracaoPronta()).id)
    const destino = abrirBanco(copia)
    try {
      transplantarFolhasCampo(t.ctx.db, destino)
      const linhas = destino
        .prepare('SELECT numero, calibracao_id, folha, situacao FROM numeros_reservados ORDER BY sequencia')
        .all()
      expect(linhas).toEqual([
        { numero: cc(1), calibracao_id: antes.id, folha: expect.any(String), situacao: 'reservado' },
        // A calibração de depois não existe na cópia: o nº fica com a folha (para a refeita)
        { numero: cc(2), calibracao_id: '', folha: fcDepois, situacao: 'reservado' },
        { numero: cc(3), calibracao_id: '', folha: fcAvulsa, situacao: 'reservado' },
      ])
      expect(
        destino.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' AND detalhe LIKE '%certificado%'").get(),
      ).toEqual({
        detalhe: `2 nºs de certificado reservados depois da cópia (${cc(2)} a ${cc(3)}) continuam registrados: os nºs não se repetem`,
      })
      // O contador da emissão não volta: o próximo é depois do emitido depois da cópia (cc 4)
      const repo = new Repositorio(destino)
      const outra = repo.reservarFolhaCampo({ chave: 'avulsa:depois-da-volta', por: 'Ana' })
      expect(outra.numeroCertificado).toBe(cc(5))
      // De novo: nada passa duas vezes
      transplantarFolhasCampo(t.ctx.db, destino)
      expect(destino.prepare('SELECT COUNT(*) AS n FROM numeros_reservados').get()).toEqual({ n: 4 })
    } finally {
      destino.close()
    }
  })

  it('emitido depois da cópia, com a calibração ainda em andamento nela: volta reservado, e a reemissão usa o mesmo nº', async () => {
    await iniciar()
    const d = await c.calibracaoPronta()
    const copia = await t.ctx.backups.copiar('manual')
    const fc = numeroDe(await folhaDe(d.id))
    expect((await emitir(d.id)).numero).toBe(cc(1))
    const destino = abrirBanco(copia)
    try {
      transplantarFolhasCampo(t.ctx.db, destino)
      expect(
        destino.prepare('SELECT numero, calibracao_id, situacao, situacao_em, situacao_por FROM numeros_reservados').all(),
      ).toEqual([{ numero: cc(1), calibracao_id: d.id, situacao: 'reservado', situacao_em: '', situacao_por: '' }])
      expect(destino.prepare('SELECT calibracao_id, numero_certificado FROM folhas_campo WHERE numero = ?').get(fc)).toEqual({
        calibracao_id: d.id,
        numero_certificado: cc(1),
      })
      expect(
        destino.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' AND detalhe LIKE '%certificado%'").get(),
      ).toEqual({
        detalhe: `o nº de certificado reservado depois da cópia (${cc(1)}) continua registrado: os nºs não se repetem; ${cc(1)}, emitido depois da cópia, volta como reservado para a calibração em andamento na cópia (a reemissão usa o mesmo nº)`,
      })
      // A reemissão (o rascunho da cópia) sai com o nº da folha, da etiqueta e do PDF já entregue
      const repo = new Repositorio(destino)
      const reemitida = repo.emitir(d.id, () => ({}) as EmissaoCertificado, {
        numero: (seq, a) => cc(seq, a),
        codigo: () => 'ABCD-2345',
      })
      expect(reemitida.numero).toBe(cc(1))
    } finally {
      destino.close()
    }
  })

  it('a calibração que na cópia tinha outro nº fica com o do banco atual (o do papel ligado depois), e o da cópia como lá', async () => {
    await iniciar()
    const d = await c.calibracaoPronta()
    const fcD = numeroDe(await folhaDe(d.id))
    const copia = await t.ctx.backups.copiar('manual')
    // Depois da cópia: a avulsa que foi a campo (impressa depois) é ligada a ela, que passa a usar o nº dela
    const fc = await avulsa()
    expect((await ligar(d.id, fc)).json().numeroReservado.numero).toBe(cc(2))
    const destino = abrirBanco(copia)
    try {
      transplantarFolhasCampo(t.ctx.db, destino)
      expect(
        destino.prepare('SELECT numero, calibracao_id, situacao FROM numeros_reservados ORDER BY sequencia').all(),
      ).toEqual([
        { numero: cc(1), calibracao_id: d.id, situacao: 'nao_utilizado' },
        { numero: cc(2), calibracao_id: d.id, situacao: 'reservado' },
      ])
      // As folhas também como no banco atual: a avulsa vigente, a da cópia substituída por ela
      const repo = new Repositorio(destino)
      expect(repo.folhaCampoDaCalibracao(d.id)).toMatchObject({ numero: fc, substituidas: [fcD] })
      expect(repo.numeroReservadoDa(d.id)?.numero).toBe(cc(2))
    } finally {
      destino.close()
    }
  })

  it('cópia posta à mão (sem a ferramenta): o nº impresso na folha que volta pela pasta volta com ela e nunca é dado de novo', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const outra = await c.calibracaoPronta()
    const copia = await t.ctx.backups.copiar('manual')
    // Depois da cópia: uma avulsa (o PDF fica na pasta, com o nº nas palavras-chave)
    const fc = await avulsa()
    const destino = abrirBanco(copia)
    try {
      const repo = new Repositorio(destino, () => {}, { pastaFolhas: join(t.pasta, 'folhas-campo') })
      expect(repo.recuperarFolhasDaPasta()).toEqual([fc])
      expect(destino.prepare('SELECT numero_certificado FROM folhas_campo WHERE numero = ?').get(fc)).toEqual({
        numero_certificado: cc(1),
      })
      expect(destino.prepare('SELECT numero, calibracao_id, folha, situacao FROM numeros_reservados').all()).toEqual([
        { numero: cc(1), calibracao_id: '', folha: fc, situacao: 'reservado' },
      ])
      expect(
        destino.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id DESC LIMIT 1").get(),
      ).toEqual({
        detalhe: `o nº de certificado impresso nas folhas que voltaram da pasta (${cc(1)}) continua reservado, no papel: os nºs não se repetem`,
      })
      // A próxima folha não repete o nº; a folha ligada (confirmando) leva o dela para a calibração
      expect(repo.reservarFolhaCampo({ chave: `calibracao:${outra.id}`, calibracaoId: outra.id, por: 'Ana' }).numeroCertificado).toBe(
        cc(2),
      )
      const ligada = repo.vincularFolhaCampo(fc, repo.obterCalibracao(k.id)!, { confirmar: true, por: 'Ana' })
      expect(ligada.numeroDaFolha).toEqual({ numero: cc(1), usado: true })
      expect(repo.numeroReservadoDa(k.id)?.numero).toBe(cc(1))
      // De novo: nada volta duas vezes
      expect(repo.recuperarFolhasDaPasta()).toEqual([])
      expect(destino.prepare('SELECT COUNT(*) AS n FROM numeros_reservados').get()).toEqual({ n: 2 })
    } finally {
      destino.close()
    }
  })

  it('cópia posta à mão e o nº já dado a um certificado antes de a folha voltar: fica não utilizado, e a tela avisa', async () => {
    await iniciar()
    const k = await c.calibracaoPronta()
    const copia = await t.ctx.backups.copiar('manual')
    const fc = await avulsa()
    const destino = abrirBanco(copia)
    try {
      const repo = new Repositorio(destino, () => {}, { pastaFolhas: join(t.pasta, 'folhas-campo') })
      // A cópia não sabe do nº da avulsa: a emissão de outra calibração (sem a pasta) o deu de novo
      const semPasta = new Repositorio(destino)
      const k2 = semPasta.criarCalibracao(
        { ...semPasta.obterCalibracao(k.id)!, ordemServico: 'OS 2' },
        { id: t.adminId, nome: 'Admin Teste' },
      )
      expect(
        semPasta.emitir(k2.id, () => ({}) as EmissaoCertificado, { numero: (seq, a) => cc(seq, a), codigo: () => 'ABCD-2345' })
          .numero,
      ).toBe(cc(1))
      repo.recuperarFolhasDaPasta()
      expect(destino.prepare('SELECT numero, situacao, motivo FROM numeros_reservados').all()).toEqual([
        {
          numero: cc(1),
          situacao: 'nao_utilizado',
          motivo: `Impresso na folha ${fc}, que voltou da pasta das folhas de campo, mas o nº já estava no certificado ${cc(1)}.`,
        },
      ])
      const ligada = repo.vincularFolhaCampo(fc, repo.obterCalibracao(k.id)!, { confirmar: true, por: 'Ana' })
      expect(ligada.numeroDaFolha).toMatchObject({ numero: cc(1), usado: false })
    } finally {
      destino.close()
    }
  })
})

const numeroDe = (r: { headers: Record<string, unknown> }) => r.headers['x-folha-campo'] as string

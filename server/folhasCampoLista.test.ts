// A lista de todas as folhas de campo impressas (aba "Folhas de campo" da página Certificados): para quem cada uma foi
// impressa, o nº de certificado impresso nela, a situação (ligada, não ligada, substituída, não vai ser usada), os
// filtros, a busca, o período, a paginação e as folhas que só estão na pasta de dados.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Calibracao, FolhaCampoListada } from '#shared/tipos.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin } from './auxiliaresTeste.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>

beforeEach(async () => {
  t = await criarAppComLogin()
  c = await cenarioCalibracao(t)
})
afterEach(async () => {
  await t.fechar()
})

/** Dia AAAA-MM-DD no horário daqui, `dias` depois de hoje. */
const dia = (dias = 0) => {
  const d = new Date(Date.now() + dias * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const imprimir = async (url: string) => {
  const r = await t.chamar('GET', url, { cookie: t.cookieComum })
  expect(r.statusCode, r.body).toBe(200)
  return r.headers['x-folha-campo'] as string
}

const listar = async (consulta = '', cookie = t.cookieComum) => {
  const r = await t.chamar('GET', `/api/folhas-campo${consulta}`, { cookie })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as { itens: FolhaCampoListada[]; total: number }
}
const numeros = async (consulta = '') => (await listar(consulta)).itens.map((f) => f.numero)

/**
 * Uma folha de cada jeito: em branco (ligada depois a um rascunho), do cliente com a OS (não ligada), da balança (o nº
 * dela registrado como não utilizado) e as de uma calibração emitida (a primeira trocada por uma folha nova).
 */
async function cenario() {
  const branca = await imprimir('/api/folha-campo')
  const doCliente = await imprimir(`/api/folha-campo?clienteId=${c.cliente.id}&os=${encodeURIComponent('OS 2026/0777')}`)
  const daBalanca = await imprimir(`/api/folha-campo?balancaId=${c.balanca.id}`)
  const k1 = await c.calibracaoPronta()
  const primeira = await imprimir(`/api/calibracoes/${k1.id}/folha-campo`)
  const nova = await imprimir(`/api/calibracoes/${k1.id}/folha-campo?nova=chave-folha-nova-1`)
  const atual = (await t.chamar('GET', `/api/calibracoes/${k1.id}`, { cookie: t.cookieAdmin })).json().calibracao as Calibracao
  const emitida = await c.emitir(atual)
  expect(emitida.statusCode, emitida.body).toBe(200)
  const certificado = emitida.json().calibracao as Calibracao
  // A em branco, ligada a um rascunho (do cliente do cenário)
  const k2 = (await c.criar('/api/calibracoes', { clienteId: c.cliente.id, balancaId: c.balanca.id, ordemServico: 'OS 55' }))
    .calibracao as Calibracao
  const ligada = await t.chamar('PUT', `/api/calibracoes/${k2.id}/folha-campo`, {
    cookie: t.cookieComum,
    payload: { numero: branca },
  })
  expect(ligada.statusCode, ligada.body).toBe(200)
  // A da balança se perdeu: o nº dela fica não utilizado
  const reservas = (await t.chamar('GET', '/api/numeros-reservados', { cookie: t.cookieAdmin })).json().numeros as Array<{
    id: number
    folha: string
    numero: string
  }>
  const reserva = reservas.find((n) => n.folha === daBalanca)!
  const descarte = await t.chamar('POST', `/api/numeros-reservados/${reserva.id}/nao-utilizado`, {
    cookie: t.cookieAdmin,
    payload: { motivo: 'A folha molhou na chuva.' },
  })
  expect(descarte.statusCode, descarte.body).toBe(200)
  return { branca, doCliente, daBalanca, primeira, nova, k1: certificado, k2, reservaDaBalanca: reserva.numero }
}

describe('aba "Folhas de campo": a lista das folhas impressas', { timeout: 60_000 }, () => {
  it('todas, da mais nova para a mais antiga, com o cliente, o pré-nº e a situação de cada uma', async () => {
    const s = await cenario()
    const { itens, total } = await listar()
    expect(total).toBe(5)
    expect(itens.map((f) => f.numero)).toEqual([s.nova, s.primeira, s.daBalanca, s.doCliente, s.branca])
    const da = (n: string) => itens.find((f) => f.numero === n)!

    // A folha nova da calibração emitida: ligada ao certificado, com o nº dele impresso
    expect(da(s.nova)).toMatchObject({
      origem: 'calibracao',
      clienteNome: 'Mercado Bom Preço',
      balancaSerie: 'TL-2231',
      numeroCertificado: s.k1.numero,
      situacaoNumero: 'emitido',
      situacao: 'ligada',
      impressaPor: 'Comum Teste',
      calibracao: { id: s.k1.id, status: 'EMITIDO', numero: s.k1.numero, clienteNome: 'Mercado Bom Preço' },
    })
    expect(da(s.nova).balancaDescricao).toContain('Toledo 9094')
    // A primeira, trocada pela nova: não foi a campo
    expect(da(s.primeira)).toMatchObject({ situacao: 'substituida', substituidaPor: s.nova, numeroCertificado: s.k1.numero })
    // A da balança, perdida: não vai ser usada, com o motivo e quem registrou
    expect(da(s.daBalanca)).toMatchObject({
      origem: 'avulsa',
      clienteNome: 'Mercado Bom Preço',
      situacao: 'descartada',
      numeroCertificado: s.reservaDaBalanca,
      situacaoNumero: 'nao_utilizado',
      motivo: 'A folha molhou na chuva.',
      descartadaPor: 'Admin Teste',
    })
    expect(da(s.daBalanca)).not.toHaveProperty('calibracao')
    // A do cliente com a OS (a balança em branco), ainda não ligada
    expect(da(s.doCliente)).toMatchObject({
      origem: 'avulsa',
      clienteNome: 'Mercado Bom Preço',
      balancaDescricao: '',
      ordemServico: 'OS 2026/0777',
      situacao: 'nao_ligada',
      situacaoNumero: 'reservado',
    })
    expect(da(s.doCliente).numeroCertificado).toMatch(/^CC-/)
    // A em branco, ligada ao rascunho: sem cliente na folha; a calibração diz de quem é, e a OS é a dela
    expect(da(s.branca)).toMatchObject({
      clienteNome: '',
      balancaDescricao: '',
      ordemServico: 'OS 55',
      situacao: 'ligada',
      calibracao: { id: s.k2.id, status: 'RASCUNHO', numero: '', clienteNome: 'Mercado Bom Preço' },
    })
    // O nº impresso na branca passou para o rascunho (o nº segue o papel)
    expect(da(s.branca).calibracao?.numeroReservado).toBe(da(s.branca).numeroCertificado)
  })

  it('filtros: não ligadas, ligadas e as que não vão ser usadas (substituídas e perdidas)', async () => {
    const s = await cenario()
    expect(await numeros('?situacao=NAO_LIGADAS')).toEqual([s.doCliente])
    expect(await numeros('?situacao=LIGADAS')).toEqual([s.nova, s.branca])
    expect(await numeros('?situacao=NAO_USADAS')).toEqual([s.primeira, s.daBalanca])
    // Filtro desconhecido: todas
    expect((await listar('?situacao=QUALQUER')).total).toBe(5)
    // A folha perdida que acaba ligada (achou-se o papel) passa a ligada
    const k = (await c.criar('/api/calibracoes', { clienteId: c.cliente.id, balancaId: c.balanca.id })).calibracao as Calibracao
    const r = await t.chamar('PUT', `/api/calibracoes/${k.id}/folha-campo`, {
      cookie: t.cookieComum,
      payload: { numero: s.daBalanca },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(await numeros('?situacao=NAO_USADAS')).toEqual([s.primeira])
    expect((await listar()).itens.find((f) => f.numero === s.daBalanca)).toMatchObject({ situacao: 'ligada' })
  })

  it('busca pelo nº da folha, pelo pré-nº, pelo cliente (sem acento), pela OS e pela calibração ligada', async () => {
    const s = await cenario()
    expect(await numeros(`?busca=${s.doCliente}`)).toEqual([s.doCliente])
    expect(await numeros(`?busca=${s.doCliente.slice(-5)}`)).toEqual([s.doCliente])
    expect(await numeros(`?busca=${s.reservaDaBalanca.toLowerCase()}`)).toEqual([s.daBalanca])
    expect(await numeros('?busca=0777')).toEqual([s.doCliente])
    expect(await numeros(`?busca=${encodeURIComponent('os 55')}`)).toEqual([s.branca])
    // O cliente com ou sem acento; a em branco aparece pela calibração a que foi ligada
    expect(await numeros(`?busca=${encodeURIComponent('bom preco')}`)).toEqual([
      s.nova,
      s.primeira,
      s.daBalanca,
      s.doCliente,
      s.branca,
    ])
    // Pelo nº do certificado emitido (as duas folhas dele) e pela série da balança
    expect(await numeros(`?busca=${s.k1.numero}`)).toEqual([s.nova, s.primeira])
    expect(await numeros('?busca=tl-2231')).toEqual([s.nova, s.primeira, s.daBalanca, s.branca])
    expect((await listar('?busca=nada-parecido')).total).toBe(0)
    // % e _ são letras, não curingas
    expect((await listar(`?busca=${encodeURIComponent('%')}`)).total).toBe(0)
  })

  it('período pelo dia da impressão (no horário daqui) e paginação', async () => {
    const s = await cenario()
    expect((await listar(`?de=${dia()}&ate=${dia()}`)).total).toBe(5)
    expect((await listar(`?de=${dia(1)}`)).total).toBe(0)
    expect((await listar(`?ate=${dia(-1)}`)).total).toBe(0)
    // Data inválida: ignorada
    expect((await listar('?de=2026-02-30')).total).toBe(5)
    const p1 = await listar('?limite=2&pagina=1')
    const p3 = await listar('?limite=2&pagina=3')
    expect([p1.total, p1.itens.map((f) => f.numero), p3.itens.map((f) => f.numero)]).toEqual([
      5,
      [s.nova, s.primeira],
      [s.branca],
    ])
    // O limite tem teto
    expect((await listar('?limite=99999')).itens).toHaveLength(5)
  })

  it('a reimpressão não muda a lista (nenhum nº novo), só conta a impressão', async () => {
    const s = await cenario()
    const antes = await listar()
    const r = await t.chamar('GET', `/api/folha-campo/${s.doCliente}`, { cookie: t.cookieComum })
    expect(r.statusCode).toBe(200)
    const depois = await listar()
    expect(depois.itens.map((f) => [f.numero, f.numeroCertificado, f.situacao])).toEqual(
      antes.itens.map((f) => [f.numero, f.numeroCertificado, f.situacao]),
    )
    const impressoes = (l: typeof antes) => l.itens.find((f) => f.numero === s.doCliente)?.impressoes
    expect([impressoes(antes), impressoes(depois)]).toEqual([1, 2])
  })

  it('a folha que só está na pasta de dados (o banco veio de uma cópia anterior) aparece, de volta ao registro', async () => {
    const a = await imprimir(`/api/folha-campo?clienteId=${c.cliente.id}`)
    const b = await imprimir('/api/folha-campo')
    t.ctx.db.prepare('DELETE FROM folhas_campo WHERE numero = ?').run(b)
    const { itens } = await listar()
    expect(itens.map((f) => f.numero)).toEqual([b, a])
    // Não se sabe para quem foi impressa; o nº de certificado impresso nela continua o mesmo
    expect(itens[0]).toMatchObject({ origem: 'recuperada', clienteNome: '', situacao: 'nao_ligada' })
    expect(itens[0].numeroCertificado).toMatch(/^CC-/)
    expect(
      (t.ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA'").all() as Array<{ detalhe: string }>).map(
        (l) => l.detalhe,
      ),
    ).toEqual([
      `a folha de campo da pasta folhas-campo que não estava no banco (${b}) voltou ao registro, livre: o banco é de uma cópia anterior à impressão dela`,
    ])
    // Na segunda vez, nada a recuperar
    await listar()
    expect(
      (t.ctx.db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'COPIA_RESTAURADA'").get() as { n: number }).n,
    ).toBe(1)
  })

  it('o cliente excluído depois da impressão fica marcado; sem sessão, 401; o administrador também vê', async () => {
    const outro = (await c.criar('/api/clientes', { ...c.cliente, id: undefined, nome: 'Padaria Sol', documento: '' })).cliente
    const f = await imprimir(`/api/folha-campo?clienteId=${outro.id}`)
    expect((await t.chamar('DELETE', `/api/clientes/${outro.id}`, { cookie: t.cookieAdmin })).statusCode).toBe(204)
    expect((await listar('', t.cookieAdmin)).itens.find((x) => x.numero === f)).toMatchObject({
      clienteNome: '',
      clienteExcluido: true,
    })
    expect((await t.chamar('GET', '/api/folhas-campo')).statusCode).toBe(401)
    // Só leitura: não vai para o registro de atividades
    expect(
      (t.ctx.db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE detalhe LIKE 'GET /api/folhas-campo%'").get() as { n: number })
        .n,
    ).toBe(0)
  })
})

// O certificado cita a revisão do POP usada na calibração (ISO/IEC 17025, 7.8.2.1: o método usado), não a vigente
// na emissão: a impressa na folha de campo da calibração; sem folha, a última registrada com data até a da
// calibração (antes de todas, a mais antiga: a trazida das configurações tem a data da atualização). A revisão do
// certificado é a mesma visita: sai com o POP do original. A revisão do POP com data no futuro é recusada.
// Alguns testes geram a folha de campo em PDF (alguns segundos cada): prazo de 30 s.

import { afterEach, describe, expect, it } from 'vitest'
import { hojeLocalIso } from '#shared/dominio.ts'
import type { Calibracao, VersaoPop } from '#shared/tipos.ts'
import { ARQUIVOS_TESTE, cenarioCalibracao, criarAppComLogin, POP_TESTE, type AppComLogin } from './auxiliaresTeste.ts'
import { abrirBanco } from './db.ts'
import { Repositorio } from './repositorio.ts'
import { transplantarRegistros } from './usuarios.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>
afterEach(async () => {
  await t?.fechar()
})

async function iniciar(opcoes: { semPop?: boolean } = {}) {
  t = await criarAppComLogin(opcoes)
  c = await cenarioCalibracao(t)
}

const texto = (revisao: string) => `${POP_TESTE.codigo} rev. ${revisao}`

async function registrarPop(revisao: string, data: string) {
  const r = await t.chamar('POST', '/api/pop', {
    cookie: t.cookieAdmin,
    payload: { codigo: POP_TESTE.codigo, revisao, data },
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().versao as VersaoPop
}

const detalhe = async (k: Calibracao) => (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()

async function prontaEm(data: string) {
  const k = await c.calibracaoPronta()
  const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
    cookie: t.cookieAdmin,
    payload: { ...k, dataCalibracao: data, versao: k.versao },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().calibracao as Calibracao
}

async function emitir(k: Calibracao) {
  const r = await c.emitir((await detalhe(k)).calibracao)
  expect(r.statusCode, r.body).toBe(200)
  return r.json().calibracao as Calibracao
}

async function revisar(k: Calibracao) {
  const r = await t.chamar('POST', `/api/calibracoes/${k.id}/revisar`, {
    cookie: t.cookieAdmin,
    payload: { motivo: 'Corrigir o endereço do cliente' },
  })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().calibracao as Calibracao
}

describe('POP do certificado: o usado na calibração', () => {
  it('o da folha de campo: a revisão registrada depois da impressão não vale para a calibração', async () => {
    await iniciar()
    const v0 = t.ctx.repo.popVigente()!
    const k = await c.calibracaoPronta()
    const folha = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(folha.statusCode, folha.body).toBe(200)
    // A rev. 01 entra antes da emissão, com data de hoje (a da calibração)
    const v1 = await registrarPop('01', hojeLocalIso())
    const aberta = await detalhe(k)
    expect(aberta.pop).toMatchObject({ id: v0.id, revisao: '00' })
    expect(aberta.pendencias).toEqual([])
    const e = await emitir(k)
    expect(e.emissao?.textos.procedimento).toBe(texto('00'))
    expect(e.emissao?.pop).toMatchObject({ id: v0.id, revisao: '00' })
    // Uma calibração sem folha, do mesmo dia, já sai com a 01
    const outra = await c.emitido()
    expect(outra.emissao?.pop).toMatchObject({ id: v1.id, revisao: '01' })
    expect(outra.emissao?.textos.procedimento).toBe(texto('01'))
  }, 30_000)

  it('a folha avulsa ligada depois: o POP impresso nela', async () => {
    await iniciar()
    const v0 = t.ctx.repo.popVigente()!
    const avulsa = await t.chamar('GET', `/api/folha-campo?chave=avulsa-pop-0001`, { cookie: t.cookieAdmin })
    expect(avulsa.statusCode, avulsa.body).toBe(200)
    await registrarPop('01', hojeLocalIso())
    const k = await c.calibracaoPronta()
    const ligada = await t.chamar('PUT', `/api/calibracoes/${k.id}/folha-campo`, {
      cookie: t.cookieAdmin,
      payload: { numero: avulsa.headers['x-folha-campo'] },
    })
    expect(ligada.statusCode, ligada.body).toBe(200)
    expect((await emitir(k)).emissao?.pop).toMatchObject({ id: v0.id, revisao: '00' })
  }, 30_000)

  it('sem folha: a última revisão com data até a da calibração; antes de todas, a mais antiga', async () => {
    await iniciar({ semPop: true })
    const v0 = await registrarPop('00', '2026-06-01')
    const v1 = await registrarPop('01', '2026-10-28')
    const antes = await prontaEm('2026-10-20')
    expect((await detalhe(antes)).pop).toMatchObject({ id: v0.id })
    const e0 = await emitir(antes)
    expect(e0.emissao?.textos.procedimento).toBe(texto('00'))
    expect(e0.emissao?.pop).toMatchObject({ id: v0.id })
    // No dia da revisão nova: ela
    expect((await emitir(await prontaEm('2026-10-28'))).emissao?.pop).toMatchObject({ id: v1.id })
    // Antes de todas (o POP trazido das configurações tem a data da atualização): a mais antiga, sem pendência
    const antiga = await prontaEm('2026-03-02')
    expect((await detalhe(antiga)).pendencias).toEqual([])
    expect((await emitir(antiga)).emissao?.pop).toMatchObject({ id: v0.id })
  })

  it('revisão do certificado: o POP do original, mesmo com uma revisão nova registrada depois', async () => {
    await iniciar()
    const v0 = t.ctx.repo.popVigente()!
    const original = await c.emitido()
    expect(original.emissao?.pop).toMatchObject({ id: v0.id })
    await registrarPop('01', hojeLocalIso())
    const rev = await revisar(original)
    expect((await detalhe(rev)).pop).toMatchObject({ id: v0.id, revisao: '00' })
    const r1 = await emitir(rev)
    expect(r1.numero).toBe(`${original.numero}-R1`)
    expect(r1.emissao?.textos.procedimento).toBe(texto('00'))
    expect(r1.emissao?.pop).toMatchObject({ id: v0.id, codigo: POP_TESTE.codigo, revisao: '00' })
    // A revisão da revisão também
    const r2 = await emitir(await revisar(r1))
    expect(r2.emissao?.textos.procedimento).toBe(texto('00'))
    expect(r2.emissao?.pop?.id).toBe(v0.id)
  })

  it('revisão com a folha avulsa de uma visita nova ligada a ela: o POP impresso nessa folha', async () => {
    await iniciar()
    const original = await c.emitido()
    const v1 = await registrarPop('01', hojeLocalIso())
    const avulsa = await t.chamar('GET', `/api/folha-campo?chave=avulsa-pop-0002`, { cookie: t.cookieAdmin })
    expect(avulsa.statusCode, avulsa.body).toBe(200)
    const rev = await revisar(original)
    const ligada = await t.chamar('PUT', `/api/calibracoes/${rev.id}/folha-campo`, {
      cookie: t.cookieAdmin,
      payload: { numero: avulsa.headers['x-folha-campo'], confirmar: true },
    })
    expect(ligada.statusCode, ligada.body).toBe(200)
    expect((await detalhe(rev)).pop).toMatchObject({ id: v1.id, revisao: '01' })
    expect((await emitir(rev)).emissao?.textos.procedimento).toBe(texto('01'))
  }, 30_000)

  it('revisão de um certificado emitido antes das revisões do POP: o procedimento que saiu nele', async () => {
    await iniciar()
    const original = await c.emitido()
    // Como a versão 1.0.1 gravava: só o texto das configurações, sem a revisão do POP
    const { pop: _pop, ...semPop } = original.emissao!
    const legado = { ...original, emissao: { ...semPop, textos: { ...semPop.textos, procedimento: 'IT-CAL-07 rev. 3' } } }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(legado), original.id)
    const rev = await revisar(original)
    const aberta = await detalhe(rev)
    expect(aberta.pendencias).toEqual([])
    expect(aberta.pop).toBeNull()
    const emitida = await emitir(rev)
    expect(emitida.emissao?.textos.procedimento).toBe('IT-CAL-07 rev. 3')
    expect(emitida.emissao?.pop ?? null).toBeNull()
  })

  it('revisão com data antes da vigente, ou com número menor: recusada (400); o rascunho continua com a de antes', async () => {
    await iniciar()
    const k = await prontaEm('2026-10-01')
    expect((await detalhe(k)).pop).toMatchObject({ revisao: '00' })
    const registrar = (revisao: string, data: string, codigo = POP_TESTE.codigo) =>
      t.chamar('POST', '/api/pop', { cookie: t.cookieAdmin, payload: { codigo, revisao, data } })
    const antes = await registrar('01', '2025-11-04')
    expect(antes.statusCode).toBe(400)
    expect(antes.json().erro).toBe('A data da revisão precisa ser igual ou posterior à da rev. 00 (05/01/2026).')
    expect((await detalhe(k)).pop).toMatchObject({ revisao: '00' })
    // Fora de ordem: 05 e depois 03
    expect((await registrar('05', '2026-02-01')).statusCode).toBe(201)
    const menor = await registrar('03', '2026-03-01')
    expect(menor.statusCode).toBe(400)
    expect(menor.json().erro).toBe(`A revisão precisa ser maior que a rev. 05 do ${POP_TESTE.codigo}.`)
    // A mesma data da vigente vale; outro código começa do 00
    expect((await registrar('06', '2026-02-01')).statusCode).toBe(201)
    expect((await registrar('00', '2026-02-01', 'POP-CAL-01')).statusCode).toBe(201)
  })

  it('a trazida das configurações (data da atualização) não impede registrar o POP com a data do documento', async () => {
    await iniciar({ semPop: true })
    t.ctx.db
      .prepare(
        `INSERT INTO pop_versoes (codigo, revisao, data, arquivo, observacao, criado_em, criado_por)
         VALUES ('BALANÇAS-POP-123', '02', ?, NULL, '', ?, 'Atualização do sistema')`,
      )
      .run(hojeLocalIso(), new Date().toISOString())
    expect((await registrarPop('00', '2026-10-28')).codigo).toBe(POP_TESTE.codigo)
  })

  it('a revisão do POP com data no futuro é recusada', async () => {
    await iniciar()
    const r = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { codigo: POP_TESTE.codigo, revisao: '01', data: '2099-12-31' },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().erro).toBe('A data da revisão do POP não pode ser no futuro.')
    expect(t.ctx.repo.popVigente()).toMatchObject({ revisao: '00' })
    // Hoje vale
    expect((await registrarPop('01', hojeLocalIso())).revisao).toBe('01')
  })
})

// Voltar uma cópia do banco feita antes de registrar a revisão do POP impressa numa folha de campo: a revisão vai
// junto com a folha (o mesmo id e o arquivo), e a próxima revisão registrada na cópia nunca herda o id dela.
describe('POP da folha de campo ao voltar uma cópia do banco', () => {
  /** Rascunho com a folha impressa com a rev. 01, registrada depois da cópia; devolve a cópia, a calibração e a rev. 01. */
  async function folhaComRevisaoDepoisDaCopia() {
    await iniciar()
    const k = await c.calibracaoPronta()
    const copia = await t.ctx.backups.copiar('manual')
    const arquivo = await c.enviarArquivo(ARQUIVOS_TESTE.docx('pop rev 01'), 'POP rev 01.docx', 'pop')
    const r = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { codigo: POP_TESTE.codigo, revisao: '01', data: hojeLocalIso(), arquivo: arquivo.sha256 },
    })
    expect(r.statusCode, r.body).toBe(201)
    const v1 = r.json().versao as VersaoPop
    const folha = await t.chamar('GET', `/api/calibracoes/${k.id}/folha-campo`, { cookie: t.cookieAdmin })
    expect(folha.statusCode, folha.body).toBe(200)
    expect(t.ctx.repo.popDaFolhaDaCalibracao(k.id)?.pop).toMatchObject({ id: v1.id, revisao: '01' })
    return { k, copia, v1 }
  }
  const restauracoes = (db: ReturnType<typeof abrirBanco>) =>
    (
      db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id").all() as Array<{ detalhe: string }>
    ).map((r) => r.detalhe)

  it('a revisão impressa na folha passa para a cópia (o mesmo id e o arquivo); a registrada depois recebe outro id', async () => {
    const { k, copia, v1 } = await folhaComRevisaoDepoisDaCopia()
    const destino = abrirBanco(copia)
    try {
      transplantarRegistros(t.ctx.db, destino)
      const repo = new Repositorio(destino)
      expect(repo.popDaFolhaDaCalibracao(k.id)?.pop).toMatchObject({
        id: v1.id,
        codigo: POP_TESTE.codigo,
        revisao: '01',
        arquivo: { sha256: v1.arquivo!.sha256 },
      })
      expect(restauracoes(destino)).toContain(
        `a revisão do POP impressa nas folhas de campo que passaram (${POP_TESTE.codigo} rev. 01) continua registrada, como no banco atual`,
      )
      // A revisão registrada depois de voltar a cópia não herda o id: o certificado continua citando a da folha
      const v2 = repo.registrarPop({ codigo: POP_TESTE.codigo, revisao: '02', data: hojeLocalIso() }, 'Teste')
      expect(v2.id).toBeGreaterThan(v1.id)
      expect(repo.popDaFolhaDaCalibracao(k.id)?.pop).toMatchObject({ id: v1.id, revisao: '01' })
      // De novo: nada muda
      const antes = destino.prepare('SELECT COUNT(*) AS n FROM auditoria').get()
      transplantarRegistros(t.ctx.db, destino)
      expect(destino.prepare('SELECT COUNT(*) AS n FROM pop_versoes').get()).toEqual({ n: 3 })
      expect(destino.prepare('SELECT COUNT(*) AS n FROM auditoria').get()).toEqual(antes)
    } finally {
      destino.close()
    }
  }, 30_000)

  it('o id já é de outra revisão na cópia: a folha fica com a mesma revisão registrada na cópia, ou com nenhuma', async () => {
    const { k, copia, v1 } = await folhaComRevisaoDepoisDaCopia()
    const agora = new Date().toISOString()
    const inserir = (db: ReturnType<typeof abrirBanco>, id: number, revisao: string) =>
      db
        .prepare(
          `INSERT INTO pop_versoes (id, codigo, revisao, data, arquivo, observacao, criado_em, criado_por)
           VALUES (?, ?, ?, ?, NULL, '', ?, 'Teste')`,
        )
        .run(id, POP_TESTE.codigo, revisao, hojeLocalIso(), agora)
    // A cópia já tem outra revisão com o id da rev. 01, e a rev. 01 com outro id: a folha fica com essa
    const comRevisao = abrirBanco(copia)
    const outra = `${copia}.outra.db`
    try {
      comRevisao.exec(`VACUUM INTO '${outra}'`)
      inserir(comRevisao, v1.id, '05')
      inserir(comRevisao, v1.id + 7, '01')
      transplantarRegistros(t.ctx.db, comRevisao)
      expect(new Repositorio(comRevisao).popDaFolhaDaCalibracao(k.id)?.pop).toMatchObject({ id: v1.id + 7, revisao: '01' })
    } finally {
      comRevisao.close()
    }
    // Sem a rev. 01 na cópia: a folha fica sem revisão (cai na que valia na data), e o registro de atividades diz
    const semRevisao = abrirBanco(outra)
    try {
      inserir(semRevisao, v1.id, '05')
      transplantarRegistros(t.ctx.db, semRevisao)
      expect(new Repositorio(semRevisao).popDaFolhaDaCalibracao(k.id)).toBeNull()
      expect(restauracoes(semRevisao)).toContain(
        `a revisão do POP impressa na folha de campo ${(await detalhe(k)).folhaCampo.numero} (${POP_TESTE.codigo} rev. 01) não passou para a cópia (o id dela já é de outra revisão lá): o certificado cita a que valia na data da calibração`,
      )
    } finally {
      semRevisao.close()
    }
  }, 30_000)
})

// Voltar uma cópia do banco feita antes de registrar a revisão do POP citada por um certificado emitido depois dela
// (a atualização: o POP real registrado como manda o LEIA-ME, e a cópia de antes da versão nova): a revisão vai junto
// com o certificado (o mesmo id e o arquivo), o POP vigente não regride, e a revisão registrada depois na cópia nunca
// aparece como "o POP da emissão" do certificado.
describe('POP do certificado ao voltar uma cópia do banco', () => {
  const restauracoes = (db: ReturnType<typeof abrirBanco>) =>
    (
      db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id").all() as Array<{ detalhe: string }>
    ).map((r) => r.detalhe)

  /** Cópia feita antes da rev. 01 (com arquivo), registrada depois e citada pelo certificado emitido depois. */
  async function certificadoComRevisaoDepoisDaCopia() {
    await iniciar()
    const copia = await t.ctx.backups.copiar('manual')
    const arquivo = await c.enviarArquivo(ARQUIVOS_TESTE.docx('pop rev 01'), 'POP rev 01.docx', 'pop')
    const r = await t.chamar('POST', '/api/pop', {
      cookie: t.cookieAdmin,
      payload: { codigo: POP_TESTE.codigo, revisao: '01', data: hojeLocalIso(), arquivo: arquivo.sha256 },
    })
    expect(r.statusCode, r.body).toBe(201)
    const v1 = r.json().versao as VersaoPop
    const k = await c.emitido()
    expect(k.emissao?.pop).toMatchObject({ id: v1.id, revisao: '01' })
    return { k, copia, v1 }
  }

  it('a revisão citada pelo certificado passa para a cópia (o mesmo id e o arquivo) e continua a vigente', async () => {
    const { k, copia, v1 } = await certificadoComRevisaoDepoisDaCopia()
    const destino = abrirBanco(copia)
    try {
      expect(destino.prepare('SELECT 1 FROM pop_versoes WHERE id = ?').get(v1.id)).toBeUndefined()
      transplantarRegistros(t.ctx.db, destino)
      const repo = new Repositorio(destino)
      expect(repo.versoesPop().find((v) => v.id === v1.id)).toMatchObject({
        codigo: POP_TESTE.codigo,
        revisao: '01',
        arquivo: { sha256: v1.arquivo!.sha256 },
      })
      // O POP vigente não volta para o da cópia
      expect(repo.popVigente()).toMatchObject({ id: v1.id, revisao: '01' })
      expect(restauracoes(destino)).toContain(
        `a revisão do POP citada pelo certificado que passou (${POP_TESTE.codigo} rev. 01) continua registrada, como no banco atual`,
      )
      // A registrada depois na cópia recebe outro id; o certificado continua com a dele
      const v2 = repo.registrarPop({ codigo: POP_TESTE.codigo, revisao: '02', data: hojeLocalIso() }, 'Teste')
      expect(v2.id).toBeGreaterThan(v1.id)
      expect(repo.obterCalibracao(k.id)?.emissao?.pop).toMatchObject({ id: v1.id, revisao: '01' })
      // De novo: nada muda
      const antes = destino.prepare('SELECT COUNT(*) AS n FROM auditoria').get()
      transplantarRegistros(t.ctx.db, destino)
      expect(destino.prepare('SELECT COUNT(*) AS n FROM pop_versoes').get()).toEqual({ n: 3 })
      expect(destino.prepare('SELECT COUNT(*) AS n FROM auditoria').get()).toEqual(antes)
    } finally {
      destino.close()
    }
  }, 30_000)

  it('o id já é de outra revisão na cópia: a revisão não passa, e o registro de atividades diz qual', async () => {
    const { k, copia, v1 } = await certificadoComRevisaoDepoisDaCopia()
    const destino = abrirBanco(copia)
    try {
      destino
        .prepare(
          `INSERT INTO pop_versoes (id, codigo, revisao, data, arquivo, observacao, criado_em, criado_por)
           VALUES (?, ?, '05', ?, NULL, '', ?, 'Teste')`,
        )
        .run(v1.id, POP_TESTE.codigo, hojeLocalIso(), new Date().toISOString())
      transplantarRegistros(t.ctx.db, destino)
      expect(destino.prepare('SELECT revisao FROM pop_versoes WHERE id = ?').get(v1.id)).toEqual({ revisao: '05' })
      expect(restauracoes(destino)).toContain(
        `a revisão do POP citada pelo certificado ${k.numero} (${POP_TESTE.codigo} rev. 01) não passou para a cópia (o id dela já é de outra revisão lá): o PDF entregue continua citando-a`,
      )
    } finally {
      destino.close()
    }
  }, 30_000)

  it('o detalhe do certificado nunca mostra outra revisão com o mesmo id como "o POP da emissão"', async () => {
    const { k, v1 } = await certificadoComRevisaoDepoisDaCopia()
    expect((await detalhe(k)).pop).toMatchObject({ id: v1.id, revisao: '01' })
    // O id da rev. 01 passa a ser de outra revisão (a cópia voltou sem ela e registrou outra): nenhuma
    t.ctx.db.prepare("UPDATE pop_versoes SET revisao = '05' WHERE id = ?").run(v1.id)
    expect((await detalhe(k)).pop).toBeNull()
    // A mesma revisão (código e nº) registrada com outro id (a cópia que voltou e a registrou de novo): essa
    const outra = v1.id + 7
    t.ctx.db
      .prepare(
        `INSERT INTO pop_versoes (id, codigo, revisao, data, arquivo, observacao, criado_em, criado_por)
         VALUES (?, ?, '01', ?, NULL, '', ?, 'Teste')`,
      )
      .run(outra, POP_TESTE.codigo, hojeLocalIso(), new Date().toISOString())
    expect((await detalhe(k)).pop).toMatchObject({ id: outra, revisao: '01' })
  }, 30_000)
})

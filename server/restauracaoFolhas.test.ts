// Voltar uma cópia do banco de ponta a ponta, com bancos em arquivo, como o LEIA-ME do instalador manda: o
// servidor de verdade, a cópia pela API de backup do SQLite, a ferramenta `transplantar` num processo separado
// e o banco trocado com o servidor parado. As folhas de campo impressas depois da cópia continuam registradas
// (com a ferramenta) ou voltam pela pasta folhas-campo (sem ela, ou com o banco atual estragado), a
// numeração FC nunca volta para trás e nenhuma calibração fica com duas folhas vigentes.

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, CLIENTE_VAZIO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, Cliente, FolhaCampoImpressa } from '#shared/tipos.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin, SENHA_ADMIN } from './auxiliaresTeste.ts'

const FERRAMENTA = fileURLToPath(new URL('./ferramentas/redefinir-senha.mjs', import.meta.url))
const ano = new Date().getFullYear()
const fc = (n: number) => `FC-${ano}-${String(n).padStart(5, '0')}`
const cc = (n: number) => `CC-${ano}-${String(n).padStart(5, '0')}`

let pasta: string
let banco: string
let t: AppComLogin | null = null
let cookie = ''

/** Sobe o servidor com a pasta de dados e o banco em arquivo; `semUsuarios`: as contas já estão no banco. */
async function subir(semUsuarios: boolean) {
  t = await criarAppComLogin({ pastaDados: pasta, arquivoBanco: banco, semUsuarios })
  cookie = semUsuarios ? await t.cookieDe('admin', SENHA_ADMIN) : t.cookieAdmin
  return t
}

/** Para o servidor (o banco fica completo no .db, sem -wal). */
async function parar() {
  await t?.fechar()
  t = null
}

const app = () => {
  if (!t) throw new Error('servidor parado')
  return t
}
async function criar<T>(url: string, payload: unknown): Promise<T> {
  const r = await app().chamar('POST', url, { cookie, payload })
  if (r.statusCode !== 201 && r.statusCode !== 200) throw new Error(`${url}: ${r.statusCode} ${r.body}`)
  return r.json() as T
}
const imprimir = (id: string, nova = '') =>
  app().chamar('GET', `/api/calibracoes/${id}/folha-campo${nova ? `?nova=${nova}` : ''}`, { cookie })
const ligar = (id: string, numero: string, confirmar = false) =>
  app().chamar('PUT', `/api/calibracoes/${id}/folha-campo`, { cookie, payload: { numero, ...(confirmar ? { confirmar } : {}) } })
const folhaDa = async (id: string) =>
  (await app().chamar('GET', `/api/calibracoes/${id}`, { cookie })).json().folhaCampo as FolhaCampoImpressa | null
const avulsa = async () => (await app().chamar('GET', '/api/folha-campo', { cookie })).headers['x-folha-campo'] as string
const vigentesPorCalibracao = () =>
  (
    app()
      .ctx.db.prepare(
        "SELECT COUNT(*) AS n FROM folhas_campo WHERE calibracao_id <> '' AND substituida_por = '' GROUP BY calibracao_id",
      )
      .all() as Array<{ n: number }>
  ).map((v) => v.n)
const restauracoes = () =>
  (
    app().ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id").all() as Array<{
      detalhe: string
    }>
  ).map((x) => x.detalhe)

/** Põe `arquivo` no lugar do banco, como o passo 4 do LEIA-ME (o atual fica como .antes-de-restaurar). */
function porNoLugar(arquivo: string, copiar = false) {
  renameSync(banco, `${banco}.antes-de-restaurar`)
  for (const s of ['-wal', '-shm']) rmSync(`${banco}${s}`, { force: true })
  if (copiar) copyFileSync(arquivo, banco)
  else renameSync(arquivo, banco)
}

afterEach(async () => {
  await parar()
  rmSync(pasta, { recursive: true, force: true })
})

describe('voltar uma cópia do banco: as folhas de campo impressas depois dela', { timeout: 120_000 }, () => {
  let k: Calibracao
  let copia: string
  /** O PDF de cada folha impressa antes de voltar a cópia, e quando foi impresso. */
  const impressas = new Map<string, { pdf: Buffer; em: string }>()

  beforeEach(async () => {
    pasta = mkdtempSync(join(tmpdir(), 'bcf-restauracao-'))
    banco = join(pasta, 'bc-calibracao.db')
    impressas.clear()
    await subir(false)
    const { cliente } = await criar<{ cliente: Cliente }>('/api/clientes', {
      ...CLIENTE_VAZIO,
      tipo: 'PJ',
      nome: 'Mercado Bom Preço',
      razaoSocial: 'MERCADO BOM PRECO LTDA',
      documento: '11.444.777/0001-61',
      cidade: 'Rio Claro',
      uf: 'SP',
    })
    const { balanca } = await criar<{ balanca: Balanca }>('/api/balancas', {
      ...BALANCA_VAZIA,
      clienteId: cliente.id,
      fabricante: 'Toledo',
      modelo: '9094',
      numeroSerie: 'TL-2231',
      faixas: [{ max: 30, e: 0.01, d: 0.01 }],
    })
    k = (
      await criar<{ calibracao: Calibracao }>('/api/calibracoes', {
        clienteId: cliente.id,
        balancaId: balanca.id,
        ordemServico: 'OS 1',
      })
    ).calibracao
    const guardar = async (r: Awaited<ReturnType<typeof imprimir>>) => {
      const numero = r.headers['x-folha-campo'] as string
      impressas.set(numero, { pdf: r.rawPayload, em: (await folhaDa(k.id))!.impressaEm })
      return numero
    }
    // FC-1, impressa antes da visita; a cópia; FC-2, folha nova (o plano mudou), que foi a campo; FC-3, avulsa
    expect(await guardar(await imprimir(k.id))).toBe(fc(1))
    copia = await app().ctx.backups.copiar('manual')
    expect(await guardar(await imprimir(k.id, 'a1b2c3d4-0000-4000-8000-000000000001'))).toBe(fc(2))
    expect(await avulsa()).toBe(fc(3))
    expect(await folhaDa(k.id)).toMatchObject({ numero: fc(2), substituidas: [fc(1)] })
    await parar()
  }, 120_000)

  it('com a ferramenta transplantar: continuam registradas, e a calibração fica com a folha nova', async () => {
    const restaurar = join(pasta, 'restaurar.db')
    copyFileSync(copia, restaurar)
    const r = spawnSync(process.execPath, [FERRAMENTA, 'transplantar', banco, restaurar], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    expect(JSON.parse(r.stdout)).toMatchObject({ transplantado: true, folhasCampo: 2 })
    porNoLugar(restaurar)
    await subir(true)

    // Como estava antes de voltar a cópia: a FC-2 vigente, a FC-1 substituída (não usada), a FC-3 livre
    expect(await folhaDa(k.id)).toMatchObject({ numero: fc(2), substituidas: [fc(1)] })
    expect(vigentesPorCalibracao()).toEqual([1])
    expect(app().ctx.db.prepare('SELECT calibracao_id, chave FROM folhas_campo WHERE numero = ?').get(fc(3))).toMatchObject({
      calibracao_id: '',
      chave: expect.stringMatching(/^avulsa:/),
    })
    // A reimpressão é o papel; nada voltou "da pasta" (estava tudo no banco)
    const reimpressa = await imprimir(k.id)
    expect(reimpressa.headers['x-folha-campo']).toBe(fc(2))
    expect(reimpressa.rawPayload.equals(impressas.get(fc(2))!.pdf)).toBe(true)
    expect(restauracoes().some((d) => d.includes('voltou ao registro') || d.includes('voltaram ao registro'))).toBe(false)
    expect(restauracoes().at(-1)).toBe(
      `2 folhas de campo impressas depois da cópia (${fc(2)} a ${fc(3)}) continuam registradas: os nºs não se repetem; ${fc(1)}, da cópia, ficou como no banco atual (trocada pela impressa depois)`,
    )
    // O técnico levou a FC-1, afinal: ligar a do papel troca de verdade (antes: 200 sem mudar nada)
    const ligada = await ligar(k.id, fc(1))
    expect(ligada.statusCode, ligada.body).toBe(200)
    expect(ligada.json().folhaCampo).toMatchObject({ numero: fc(1), substituidas: [fc(2)] })
    expect((await imprimir(k.id)).rawPayload.equals(impressas.get(fc(1))!.pdf)).toBe(true)
    expect(vigentesPorCalibracao()).toEqual([1])
    // A numeração continua depois das folhas impressas depois da cópia
    expect(await avulsa()).toBe(fc(4))
  })

  it('sem a ferramenta (ou com o banco atual estragado): voltam pela pasta folhas-campo, livres, e o papel é ligado confirmando', async () => {
    porNoLugar(copia, true)
    await subir(true)

    // A cópia só conhecia a FC-1; a FC-2 e a FC-3 voltam ao registro como folhas livres, com a data da impressão
    expect(await folhaDa(k.id)).toMatchObject({ numero: fc(1), substituidas: [] })
    const linhas = app()
      .ctx.db.prepare('SELECT numero, chave, calibracao_id, impressa_em FROM folhas_campo ORDER BY sequencia')
      .all() as Array<{ numero: string; chave: string; calibracao_id: string; impressa_em: string }>
    const noSegundo = (iso: string) => new Date(Math.floor(Date.parse(iso) / 1000) * 1000).toISOString()
    expect(linhas.slice(1)).toEqual([
      { numero: fc(2), chave: `recuperada:${fc(2)}`, calibracao_id: '', impressa_em: noSegundo(impressas.get(fc(2))!.em) },
      { numero: fc(3), chave: `recuperada:${fc(3)}`, calibracao_id: '', impressa_em: expect.any(String) },
    ])
    expect(restauracoes().slice(-2)).toEqual([
      `2 folhas de campo da pasta folhas-campo que não estavam no banco (${fc(2)} a ${fc(3)}) voltaram ao registro, livres: o banco é de uma cópia anterior à impressão delas`,
      // O nº de certificado da avulsa (FC-3), reservado depois da cópia, volta lido do PDF; o da FC-2 (folha nova
      // da calibração) é o mesmo da FC-1, que a cópia já tinha
      `o nº de certificado impresso nas folhas que voltaram da pasta (${cc(2)}) continua reservado, no papel: os nºs não se repetem`,
    ])
    expect(app().ctx.db.prepare('SELECT numero, numero_certificado FROM folhas_campo ORDER BY sequencia').all()).toEqual([
      { numero: fc(1), numero_certificado: cc(1) },
      { numero: fc(2), numero_certificado: cc(1) },
      { numero: fc(3), numero_certificado: cc(2) },
    ])
    expect(
      app().ctx.db.prepare('SELECT numero, calibracao_id, folha, situacao FROM numeros_reservados ORDER BY sequencia').all(),
    ).toEqual([
      { numero: cc(1), calibracao_id: k.id, folha: fc(1), situacao: 'reservado' },
      { numero: cc(2), calibracao_id: '', folha: fc(3), situacao: 'reservado' },
    ])
    expect(vigentesPorCalibracao()).toEqual([1])

    // Ligar a FC-2, que foi a campo: não se sabe para qual balança foi impressa, então pede confirmação
    const pergunta = await ligar(k.id, fc(2))
    expect(pergunta.statusCode).toBe(409)
    expect(pergunta.json()).toMatchObject({ codigo: 'CONFIRMAR_FOLHA' })
    const ligada = await ligar(k.id, fc(2), true)
    expect(ligada.statusCode, ligada.body).toBe(200)
    expect(ligada.json().folhaCampo).toMatchObject({ numero: fc(2), substituidas: [fc(1)] })
    expect(vigentesPorCalibracao()).toEqual([1])
    const reimpressa = await imprimir(k.id)
    expect(reimpressa.headers['x-folha-campo']).toBe(fc(2))
    expect(reimpressa.rawPayload.equals(impressas.get(fc(2))!.pdf)).toBe(true)
    // O nº de certificado da FC-2 continua o da calibração (o da etiqueta)
    expect(ligada.json()).toMatchObject({ numeroReservado: { numero: cc(1) }, numeroDaFolha: { numero: cc(1), usado: true } })
    // Nenhum nº que já está no papel é emitido de novo: nem o da folha, nem o do certificado
    expect(await avulsa()).toBe(fc(4))
    expect(app().ctx.db.prepare('SELECT numero_certificado FROM folhas_campo WHERE numero = ?').get(fc(4))).toEqual({
      numero_certificado: cc(3),
    })

    // Subir de novo não repete nada
    await parar()
    await subir(true)
    expect(restauracoes().filter((d) => d.includes('voltaram ao registro'))).toHaveLength(1)
    expect(await folhaDa(k.id)).toMatchObject({ numero: fc(2), substituidas: [fc(1)] })
  })
})

// As folhas que a cópia já tinha e que, depois dela, passaram a ser de um certificado emitido, cancelado ou revisado
// ficam como no banco atual: o certificado entregue continua com a folha que foi a campo (a reimpressão é o papel),
// e ela não fica livre para outra calibração.
describe('voltar uma cópia do banco: as folhas dos certificados emitidos depois dela', { timeout: 180_000 }, () => {
  let c: Awaited<ReturnType<typeof cenarioCalibracao>>

  beforeEach(async () => {
    pasta = mkdtempSync(join(tmpdir(), 'bcf-restauracao-'))
    banco = join(pasta, 'bc-calibracao.db')
    await subir(false)
    c = await cenarioCalibracao(app())
  }, 120_000)

  const detalheDe = async (id: string) => (await app().chamar('GET', `/api/calibracoes/${id}`, { cookie })).json()
  async function emitir(id: string) {
    const { calibracao } = await detalheDe(id)
    const r = await app().chamar('POST', `/api/calibracoes/${id}/emitir`, { cookie, payload: { versao: calibracao.versao } })
    expect(r.statusCode, r.body).toBe(200)
    return r.json().calibracao as Calibracao
  }
  const avulsaDaBalanca = async () =>
    (await app().chamar('GET', `/api/folha-campo?balancaId=${c.balanca.id}`, { cookie })).headers['x-folha-campo'] as string
  const rascunho = async () =>
    (await criar<{ calibracao: Calibracao }>('/api/calibracoes', { clienteId: c.cliente.id, balancaId: c.balanca.id })).calibracao
  const numeros = () =>
    app().ctx.db.prepare('SELECT numero, calibracao_id, situacao FROM numeros_reservados ORDER BY sequencia').all()

  /** Volta a cópia com a ferramenta (passos 2 a 4 do LEIA-ME) e sobe o servidor com ela; devolve a resposta. */
  async function voltar(copia: string) {
    await parar()
    const restaurar = join(pasta, 'restaurar.db')
    copyFileSync(copia, restaurar)
    const r = spawnSync(process.execPath, [FERRAMENTA, 'transplantar', banco, restaurar], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    porNoLugar(restaurar)
    await subir(true)
    return JSON.parse(r.stdout)
  }

  it('a avulsa da cópia ligada ao rascunho e emitida depois: o certificado fica com ela, e ela não fica livre', async () => {
    const k = await c.calibracaoPronta()
    expect((await imprimir(k.id)).headers['x-folha-campo']).toBe(fc(1))
    expect(await avulsaDaBalanca()).toBe(fc(2))
    const copia = await app().ctx.backups.copiar('manual')
    // Depois da cópia: a avulsa foi a campo, e o certificado sai com o nº dela
    expect((await ligar(k.id, fc(2))).statusCode).toBe(200)
    expect((await emitir(k.id)).numero).toBe(cc(2))
    const papel = (await imprimir(k.id)).rawPayload

    expect(await voltar(copia)).toMatchObject({ transplantado: true, certificados: 1, folhasCampo: 0 })
    expect(await folhaDa(k.id)).toMatchObject({ numero: fc(2), substituidas: [fc(1)] })
    const reimpressa = await imprimir(k.id)
    expect(reimpressa.headers['x-folha-campo']).toBe(fc(2))
    expect(reimpressa.rawPayload.equals(papel)).toBe(true)
    expect(vigentesPorCalibracao()).toEqual([1])
    expect(numeros()).toEqual([
      { numero: cc(1), calibracao_id: k.id, situacao: 'nao_utilizado' },
      { numero: cc(2), calibracao_id: k.id, situacao: 'emitido' },
    ])
    expect(restauracoes()).toContain(
      `${fc(1)}, ${fc(2)}, da cópia, ficaram como no banco atual (são de certificados emitidos, cancelados ou revisados)`,
    )
    // Os dados brutos do certificado não viram a folha de outra calibração
    const outra = await ligar((await rascunho()).id, fc(2))
    expect(outra.statusCode).toBe(409)
    expect(outra.json().erro).toBe(`A folha ${fc(2)} já é de outra calibração (${cc(2)}).`)
  })

  it('a folha de um certificado cancelado passada à calibração refeita, emitida depois: continua com a refeita', async () => {
    const k1 = await c.calibracaoPronta()
    expect((await imprimir(k1.id)).headers['x-folha-campo']).toBe(fc(1))
    expect((await emitir(k1.id)).numero).toBe(cc(1))
    const copia = await app().ctx.backups.copiar('manual')
    // Depois da cópia: o certificado é cancelado e refeito a partir do mesmo papel
    const cancelado = await app().chamar('POST', `/api/calibracoes/${k1.id}/cancelar`, {
      cookie,
      payload: { motivo: 'Erro na digitação dos dados' },
    })
    expect(cancelado.statusCode, cancelado.body).toBe(200)
    const k2 = await c.calibracaoPronta()
    expect((await ligar(k2.id, fc(1))).statusCode).toBe(200)
    expect((await emitir(k2.id)).numero).toBe(cc(2))
    const papel = (await imprimir(k2.id)).rawPayload

    expect(await voltar(copia)).toMatchObject({ transplantado: true, certificados: 2 })
    expect(await folhaDa(k2.id)).toMatchObject({ numero: fc(1), herdada: false })
    const reimpressa = await imprimir(k2.id)
    expect(reimpressa.statusCode).toBe(200)
    expect(reimpressa.rawPayload.equals(papel)).toBe(true)
    // O cancelado continua mostrando a folha dele, e quem a usa agora
    expect(await folhaDa(k1.id)).toMatchObject({ numero: fc(1), passouPara: cc(2) })
    expect(app().ctx.db.prepare('SELECT numero, de_calibracao_id, para_calibracao_id FROM folhas_campo_passagens').all()).toEqual(
      [{ numero: fc(1), de_calibracao_id: k1.id, para_calibracao_id: k2.id }],
    )
    expect(vigentesPorCalibracao()).toEqual([1])
  })

  it('a avulsa da cópia ligada a uma revisão emitida depois: a revisão fica com ela', async () => {
    const k1 = await c.calibracaoPronta()
    expect((await imprimir(k1.id)).headers['x-folha-campo']).toBe(fc(1))
    expect((await emitir(k1.id)).numero).toBe(cc(1))
    expect(await avulsaDaBalanca()).toBe(fc(2))
    const copia = await app().ctx.backups.copiar('manual')
    // Depois da cópia: uma visita nova, com a avulsa, numa revisão do certificado
    const rv = await app().chamar('POST', `/api/calibracoes/${k1.id}/revisar`, {
      cookie,
      payload: { motivo: 'Nova visita ao cliente' },
    })
    expect(rv.statusCode, rv.body).toBe(201)
    const r1 = rv.json().calibracao as Calibracao
    expect((await ligar(r1.id, fc(2))).statusCode).toBe(200)
    expect((await emitir(r1.id)).numero).toBe(cc(1))

    // Um certificado só (o mesmo nº): a versão anterior, substituída depois da cópia, e a correção
    expect(await voltar(copia)).toMatchObject({ transplantado: true, certificados: 1 })
    expect(app().ctx.db.prepare('SELECT status FROM calibracoes WHERE numero = ? ORDER BY revisao').all(cc(1))).toEqual([
      { status: 'SUBSTITUIDO' },
      { status: 'EMITIDO' },
    ])
    expect(await folhaDa(r1.id)).toMatchObject({ numero: fc(2), herdada: false })
    expect(await folhaDa(k1.id)).toMatchObject({ numero: fc(1), herdada: false })
    expect((await imprimir(r1.id)).headers['x-folha-campo']).toBe(fc(2))
    // O nº impresso na avulsa ficou não utilizado (a revisão sai com o do revisado), como no banco atual
    expect(numeros()).toEqual([
      { numero: cc(1), calibracao_id: k1.id, situacao: 'emitido' },
      { numero: cc(2), calibracao_id: r1.id, situacao: 'nao_utilizado' },
    ])
    expect((await ligar((await rascunho()).id, fc(2))).statusCode).toBe(409)
  })
})

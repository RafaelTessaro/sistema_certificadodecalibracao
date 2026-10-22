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
import { type AppComLogin, criarAppComLogin, SENHA_ADMIN } from './auxiliaresTeste.ts'

const FERRAMENTA = fileURLToPath(new URL('./ferramentas/redefinir-senha.mjs', import.meta.url))
const ano = new Date().getFullYear()
const fc = (n: number) => `FC-${ano}-${String(n).padStart(5, '0')}`

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

afterEach(async () => {
  await parar()
  rmSync(pasta, { recursive: true, force: true })
})

describe('voltar uma cópia do banco: as folhas de campo impressas depois dela', { timeout: 120_000 }, () => {
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
    expect(restauracoes().at(-1)).toBe(
      `2 folhas de campo da pasta folhas-campo que não estavam no banco (${fc(2)} a ${fc(3)}) voltaram ao registro, livres: o banco é de uma cópia anterior à impressão delas`,
    )
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
    // Nenhum nº que já está no papel é emitido de novo
    expect(await avulsa()).toBe(fc(4))

    // Subir de novo não repete nada
    await parar()
    await subir(true)
    expect(restauracoes().filter((d) => d.includes('voltaram ao registro'))).toHaveLength(1)
    expect(await folhaDa(k.id)).toMatchObject({ numero: fc(2), substituidas: [fc(1)] })
  })
})

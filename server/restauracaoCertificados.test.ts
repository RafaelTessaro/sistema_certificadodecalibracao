// Voltar uma cópia do banco com certificados emitidos depois dela, de ponta a ponta, como o LEIA-ME do instalador
// manda: o servidor de verdade com o banco em arquivo, o gerador de PDF de verdade, a cópia pela API de backup, a
// ferramenta `transplantar` num processo separado e o banco trocado com o servidor parado. O PDF entregue nunca é
// sobrescrito e o nº dele nunca é dado de novo; com a ferramenta, o certificado continua emitido (o mesmo nº e o
// mesmo código de autenticidade: o QR code do papel continua conferindo).

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Calibracao } from '#shared/tipos.ts'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin, SENHA_ADMIN } from './auxiliaresTeste.ts'

const FERRAMENTA = fileURLToPath(new URL('./ferramentas/redefinir-senha.mjs', import.meta.url))
const ano = new Date().getFullYear()
const cc = (n: number) => `CC-${ano}-${String(n).padStart(5, '0')}`
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

let pasta: string
let banco: string
let t: AppComLogin | null = null
let cookie = ''

async function subir(semUsuarios: boolean) {
  t = await criarAppComLogin({ pastaDados: pasta, arquivoBanco: banco, semUsuarios })
  cookie = semUsuarios ? await t.cookieDe('admin', SENHA_ADMIN) : t.cookieAdmin
  return t
}
async function parar() {
  await t?.fechar()
  t = null
}
const app = () => {
  if (!t) throw new Error('servidor parado')
  return t
}

/** Põe `arquivo` no lugar do banco, como o passo 4 do LEIA-ME (o atual fica como .antes-de-restaurar). */
function porNoLugar(arquivo: string) {
  renameSync(banco, `${banco}.antes-de-restaurar`)
  for (const s of ['-wal', '-shm']) rmSync(`${banco}${s}`, { force: true })
  copyFileSync(arquivo, banco)
}
function transplantar() {
  const restaurar = join(pasta, 'restaurar.db')
  copyFileSync(copia, restaurar)
  const r = spawnSync(process.execPath, [FERRAMENTA, 'transplantar', banco, restaurar], { encoding: 'utf8' })
  expect(r.status, r.stderr).toBe(0)
  return { restaurar, resposta: JSON.parse(r.stdout) as Record<string, unknown> }
}

const obter = async (id: string) =>
  (await app().chamar('GET', `/api/calibracoes/${id}`, { cookie })).json().calibracao as Calibracao
async function emitir(id: string) {
  const k = await obter(id)
  const r = await app().chamar('POST', `/api/calibracoes/${id}/emitir`, { cookie, payload: { versao: k.versao } })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().calibracao as Calibracao
}
async function revisar(id: string) {
  const r = await app().chamar('POST', `/api/calibracoes/${id}/revisar`, { cookie, payload: { motivo: 'Correção do endereço' } })
  expect(r.statusCode, r.body).toBe(201)
  return r.json().calibracao as Calibracao
}
const verificar = (codigo: string) => app().app.inject({ method: 'GET', url: `/api/verificar/${codigo}` })
const caminho = (arquivo: string) => join(pasta, 'certificados', arquivo)
const pastaDoAno = () => readdirSync(join(pasta, 'certificados', String(ano))).sort()
const restauracoes = () =>
  (
    app().ctx.db.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id").all() as Array<{
      detalhe: string
    }>
  ).map((x) => x.detalhe)
const numeros = () =>
  app()
    .ctx.db.prepare('SELECT numero, calibracao_id, situacao, motivo FROM numeros_reservados ORDER BY ano, sequencia')
    .all() as Array<{ numero: string; calibracao_id: string; situacao: string; motivo: string }>

let copia: string
let k1: Calibracao
let k2: Calibracao
let k3: Calibracao
/** Os certificados emitidos depois da cópia (já entregues ao cliente), com o PDF de cada um. */
const entregues = new Map<string, { k: Calibracao; pdf: Buffer }>()

beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'bcf-restauracao-cert-'))
  banco = join(pasta, 'bc-calibracao.db')
  entregues.clear()
  await subir(false)
  const c = await cenarioCalibracao(app())
  // Antes da cópia: k1 emitido (CC-1); k2 com a folha de campo impressa (CC-2 reservado, na etiqueta); k3 em andamento
  k1 = await c.calibracaoPronta()
  expect((await emitir(k1.id)).numero).toBe(cc(1))
  k2 = await c.calibracaoPronta()
  const folha = await app().chamar('GET', `/api/calibracoes/${k2.id}/folha-campo`, { cookie })
  expect(folha.statusCode, folha.body).toBe(200)
  k3 = await c.calibracaoPronta()
  copia = await app().ctx.backups.copiar('manual')
  // Depois da cópia: k2 emitido com o nº da folha; a correção de k1 (o mesmo nº); k4, criada e emitida depois da cópia
  const guardar = (k: Calibracao) => {
    const pdf = readFileSync(caminho(k.emissao!.arquivo))
    expect(sha(pdf)).toBe(k.emissao!.hashPdf)
    entregues.set(k.numero, { k, pdf })
    return k
  }
  expect(guardar(await emitir(k2.id)).numero).toBe(cc(2))
  expect(guardar(await emitir((await revisar(k1.id)).id)).numero).toBe(cc(1))
  expect(guardar(await emitir((await c.calibracaoPronta()).id)).numero).toBe(cc(3))
  await parar()
}, 180_000)

afterEach(async () => {
  await parar()
  rmSync(pasta, { recursive: true, force: true })
})

/** Os PDFs entregues continuam na pasta, intactos. */
function pdfsIntactos() {
  for (const [numero, { k, pdf }] of entregues)
    expect(readFileSync(caminho(k.emissao!.arquivo)).equals(pdf), `PDF de ${numero}`).toBe(true)
}

describe('voltar uma cópia do banco: os certificados emitidos depois dela', { timeout: 180_000 }, () => {
  it('com a ferramenta transplantar: continuam emitidos, com o mesmo nº e o mesmo código (o QR code confere)', async () => {
    const { restaurar, resposta } = transplantar()
    // Os três nºs emitidos ou alterados depois da cópia (o corrigido conta uma vez: a versão anterior e a correção)
    expect(resposta).toMatchObject({ transplantado: true, certificados: 3 })
    porNoLugar(restaurar)
    rmSync(restaurar)
    await subir(true)

    for (const { k, pdf } of entregues.values()) {
      const v = await verificar(k.emissao!.codigo)
      expect(v.statusCode, `${k.numero}: ${v.body}`).toBe(200)
      expect(v.json()).toMatchObject({ numero: k.numero, status: 'EMITIDO', hashPdf: sha(pdf) })
      const baixado = await app().chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie })
      expect(baixado.statusCode).toBe(200)
      expect(baixado.rawPayload.equals(pdf)).toBe(true)
    }
    // O original corrigido depois da cópia ficou substituído, como no banco atual (a versão anterior da correção)
    expect((await obter(k1.id)).status).toBe('SUBSTITUIDO')
    expect((await verificar((await obter(k1.id)).emissao!.codigo)).json().status).toBe('SUBSTITUIDO')
    const correcao = entregues.get(cc(1))!.k
    expect(
      (await app().chamar('GET', `/api/calibracoes/${correcao.id}`, { cookie })).json().versoes.map((v: { id: string }) => v.id),
    ).toEqual([k1.id, correcao.id])
    // O registro de atividades diz cada nº uma vez
    expect(restauracoes()).toContain(
      `3 certificados emitidos ou alterados depois da cópia (${cc(1)}, ${cc(2)}, ${cc(3)}) continuam como no banco atual (o mesmo nº, a mesma situação e o mesmo código de autenticidade): os PDFs entregues continuam valendo`,
    )
    // O nº da folha de k2 ficou emitido; nenhum nº ficou de lado
    expect(numeros()).toEqual([{ numero: cc(2), calibracao_id: k2.id, situacao: 'emitido', motivo: '' }])

    // A próxima emissão continua a numeração; nenhum PDF entregue é tocado
    expect((await emitir(k3.id)).numero).toBe(cc(4))
    pdfsIntactos()
    expect(restauracoes().some((d) => d.includes('não conhece'))).toBe(false)
  })

  it('sem a ferramenta: os nºs com PDF na pasta nunca são dados de novo, e nenhum PDF entregue é sobrescrito', async () => {
    porNoLugar(copia)
    await subir(true)

    // Quando o servidor sobe, os PDFs que o banco não conhece entram no registro de atividades, e os nºs deles
    // ficam não utilizados (com o motivo): o da folha de k2, reservado na cópia, e o de k4, que ela nem tinha
    const motivo = (n: string) =>
      `Certificado emitido depois da cópia do banco que voltou: o PDF está em certificados/${ano}/Certificado-${n}.pdf, mas o banco não tem a emissão. O nº não é dado de novo.`
    expect(numeros()).toEqual([
      { numero: cc(2), calibracao_id: k2.id, situacao: 'nao_utilizado', motivo: motivo(cc(2)) },
      { numero: cc(3), calibracao_id: '', situacao: 'nao_utilizado', motivo: motivo(cc(3)) },
    ])
    // A correção de k1 (o mesmo nº, que o banco tem) também é avisada: o cliente pode estar com ela
    expect(restauracoes().at(-1)).toBe(
      `3 PDFs de certificado na pasta certificados que o banco não conhece (${cc(1)} (versão 2), ${cc(2)}, ${cc(3)}), emitidos depois da cópia do banco que voltou: os nºs não são dados de novo, e os PDFs ficam na pasta`,
    )

    // k3 (outra calibração) e k2 (em andamento na cópia) recebem nºs novos; a correção de k1, o mesmo nº, na versão
    // seguinte à que tem PDF na pasta
    expect((await emitir(k3.id)).numero).toBe(cc(4))
    expect((await emitir(k2.id)).numero).toBe(cc(5))
    const r2 = await emitir((await revisar(k1.id)).id)
    expect(r2).toMatchObject({ numero: cc(1), revisao: 2, emissao: { arquivo: `${ano}/Certificado-${cc(1)}-versao-3.pdf` } })
    pdfsIntactos()
    expect(pastaDoAno()).toEqual(
      [cc(1), `${cc(1)}-versao-2`, `${cc(1)}-versao-3`, cc(2), cc(3), cc(4), cc(5)].map((n) => `Certificado-${n}.pdf`).sort(),
    )

    // Subir de novo não repete o aviso
    const avisos = restauracoes().length
    await parar()
    await subir(true)
    expect(restauracoes()).toHaveLength(avisos)
  })

  it('com o banco atual estragado (a ferramenta segue sem ele): o mesmo, pela pasta certificados', async () => {
    const estragado = readFileSync(banco)
    estragado.fill(0x41, 0, Math.min(estragado.length, 8192))
    writeFileSync(banco, estragado)
    const { restaurar, resposta } = transplantar()
    expect(resposta).toMatchObject({ transplantado: false, certificados: 0 })
    expect(String(resposta.aviso)).toMatch(/não pôde ser lido/)
    porNoLugar(restaurar)
    await subir(true)
    expect((await emitir(k3.id)).numero).toBe(cc(4))
    pdfsIntactos()
    expect(existsSync(caminho(`${ano}/Certificado-${cc(4)}.pdf`))).toBe(true)
  })
})

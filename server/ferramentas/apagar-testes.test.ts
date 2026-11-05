// A ferramenta "apagar os testes" rodando de verdade (processo separado, como no servidor Windows) contra uma pasta de
// dados montada pelo próprio sistema: certificados emitidos, corrigidos e cancelados, rascunhos, folhas de campo com PDF,
// nºs reservados e não utilizados, e-mails, padrão com o arquivo do certificado, POP com arquivo e assinatura do usuário.
// Depois dela: o que fica é igual, o que sai sumiu, a cópia e os PDFs estão onde ela disse, o servidor sobe e a
// numeração recomeça; rodar de novo não faz nada. E as recusas: serviço ligado e sem digitar APAGAR.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Calibracao, NumeroReservado, RegistroAuditoria } from '#shared/tipos.ts'
import { autorDoRegistro, descreverRegistro } from '../../src/components/usuarios/auditoria.ts'
import { nomeCookieSessao } from '../acesso.ts'
import { criarApp } from '../app.ts'
import { ARQUIVOS_TESTE, cenarioCalibracao, criarAppComLogin, H, SENHA_ADMIN, type AppComLogin } from '../auxiliaresTeste.ts'
import { abrirBanco, type Banco } from '../db.ts'
import { gravarConfigEmail } from '../email.ts'
import { TABELAS_APAGADAS, TABELAS_MANTIDAS } from '../limpezaTestes.ts'
import { ASSINATURA_EXEMPLO_1 } from '../pdf/assinaturasExemplo.ts'
import { PARAMETROS_LEVES } from '../senha.ts'

const FERRAMENTA = fileURLToPath(new URL('./apagar-testes.mjs', import.meta.url))
const ano = new Date().getFullYear()
const cc1 = `CC-${ano}-00001`
const fc1 = `FC-${ano}-00001`

/** Roda a ferramenta; `entrada` é o que se digita (vazio = só Enter / entrada fechada). */
function rodar(args: string[], entrada = '') {
  const r = spawnSync(process.execPath, [FERRAMENTA, ...args], { input: entrada, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

let pasta: string
let banco: string
const abertos: AppComLogin[] = []

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'bcf-apagar-'))
  banco = join(pasta, 'bc-calibracao.db')
})
afterEach(async () => {
  for (const t of abertos.splice(0)) await t.fechar().catch(() => {})
  rmSync(pasta, { recursive: true, force: true })
})

function comBanco<T>(fn: (db: Banco) => T): T {
  const db = abrirBanco(banco)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

type Linha = Record<string, unknown>
const linhas = (db: Banco, tabela: string) => db.prepare(`SELECT * FROM ${tabela} ORDER BY rowid`).all() as Linha[]
const contar = (db: Banco, tabela: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n)

/** Todas as linhas de todas as tabelas (para conferir que nada mudou). */
const tudo = () => comBanco((db) => Object.fromEntries([...TABELAS_MANTIDAS, ...TABELAS_APAGADAS].map((t) => [t, linhas(db, t)])))

/** Os arquivos (caminho relativo → sha256) dentro de `dir`. */
function arquivosEm(dir: string): Record<string, string> {
  const r: Record<string, string> = {}
  if (!existsSync(dir)) return r
  for (const item of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!item.isFile()) continue
    const caminho = join(item.parentPath, item.name)
    r[relative(dir, caminho)] = createHash('sha256').update(readFileSync(caminho)).digest('hex')
  }
  return r
}

const PDFS = ['certificados', 'folhas-campo'] as const
const pdfsDaPasta = (base: string) => Object.fromEntries(PDFS.map((p) => [p, arquivosEm(join(base, p))]))
const backups = () => (existsSync(join(pasta, 'backups')) ? readdirSync(join(pasta, 'backups')).sort() : [])
const pastasDeTestes = () => readdirSync(pasta).filter((n) => n.startsWith('testes-apagados'))

/**
 * Monta a pasta de dados com o sistema de verdade (banco em arquivo). `completo`: todos os tipos de registro; sem ele,
 * um certificado emitido com a folha de campo. Devolve o app ainda ligado (o "serviço"), o modelo de uma calibração
 * pronta e os ids das calibrações.
 */
async function montar(completo: boolean) {
  const enviados: unknown[] = []
  const t = await criarAppComLogin({
    pastaDados: pasta,
    arquivoBanco: banco,
    transporteEmail: () => {
      const transporte = nodemailer.createTransport({ jsonTransport: true })
      const enviar = transporte.sendMail.bind(transporte)
      transporte.sendMail = (async (m: Parameters<typeof enviar>[0]) => {
        const info = await enviar(m)
        enviados.push(info)
        return info
      }) as typeof transporte.sendMail
      return transporte
    },
  })
  abertos.push(t)
  const c = await cenarioCalibracao(t)
  const ok = async (r: Promise<{ statusCode: number; body: string }>, esperado = 200) => {
    const x = await r
    expect(x.statusCode, x.body).toBe(esperado)
    return x as Awaited<typeof r> & { json(): Record<string, unknown>; headers: Record<string, unknown> }
  }
  const admin = { cookie: t.cookieAdmin }
  const detalhe = async (id: string) =>
    (await ok(t.chamar('GET', `/api/calibracoes/${id}`, admin))).json() as {
      calibracao: Calibracao
      numeroReservado: NumeroReservado | null
    }
  const emitirAtual = async (id: string) => (await ok(c.emitir((await detalhe(id)).calibracao))).json().calibracao as Calibracao

  // Certificado com o nº reservado na folha de campo, enviado por e-mail
  const k1 = await c.calibracaoPronta()
  await ok(t.chamar('GET', `/api/calibracoes/${k1.id}/folha-campo`, admin))
  const a = await emitirAtual(k1.id)
  const ids = [k1.id]
  if (!completo) return { t, c, modelo: k1, ids }

  gravarConfigEmail(t.ctx, {
    servidor: 'smtp.exemplo.com',
    porta: 587,
    seguranca: 'STARTTLS',
    usuario: 'certificados@balancass.com',
    senha: 'senha-de-app',
    remetenteNome: 'Balanças.com',
    remetenteEmail: 'certificados@balancass.com',
  })
  await ok(
    t.chamar('POST', `/api/calibracoes/${a.id}/email`, {
      ...admin,
      payload: { para: 'qualidade@mercado.com.br', assunto: `Certificado ${a.numero}`, texto: 'Segue.' },
    }),
  )
  // A assinatura e os dados de signatário do técnico
  await ok(
    t.chamar('PUT', `/api/usuarios/${t.adminId}`, {
      ...admin,
      payload: { assinatura: ASSINATURA_EXEMPLO_1, cargo: 'Técnico de calibração', registro: 'CFT 123' },
    }),
  )
  // O padrão com o arquivo do certificado e o POP com o arquivo (guardados na tabela arquivos)
  const ref = await c.enviarArquivo(ARQUIVOS_TESTE.pdf('jp01'), 'Certificado JP-01.pdf')
  const pesos = t.ctx.repo.obterPadrao(c.pesos.id)!
  await ok(
    t.chamar('PUT', `/api/padroes/${pesos.id}`, {
      ...admin,
      payload: { ...pesos, certificadoArquivo: ref, versao: pesos.versao },
    }),
  )
  const pop = await c.enviarArquivo(ARQUIVOS_TESTE.pdf('pop'), 'POP Balanças rev 01.pdf', 'pop')
  await ok(
    t.chamar('POST', '/api/pop', {
      ...admin,
      payload: { codigo: 'BALANÇAS-POP-001', revisao: '01', data: '2026-02-01', arquivo: pop.sha256, observacao: '' },
    }),
    201,
  )
  // Certificado corrigido (a versão anterior fica substituída)
  const b = await c.emitido()
  const { calibracao: correcao } = (await c.criar(`/api/calibracoes/${b.id}/revisar`, { motivo: 'Corrigir o endereço' })) as {
    calibracao: Calibracao
  }
  await emitirAtual(correcao.id)
  // Certificado cancelado (com a folha de campo) e a calibração refeita com o mesmo papel (a passagem da folha)
  const k3 = await c.calibracaoPronta()
  const folha3 = (await ok(t.chamar('GET', `/api/calibracoes/${k3.id}/folha-campo`, admin))).headers['x-folha-campo']
  const e3 = await emitirAtual(k3.id)
  await ok(
    t.chamar('POST', `/api/calibracoes/${k3.id}/cancelar`, {
      ...admin,
      payload: { motivo: 'Emitido por engano', versao: e3.versao },
    }),
  )
  const k5 = (await c.criar('/api/calibracoes', { clienteId: c.cliente.id, balancaId: c.balanca.id })) as {
    calibracao: Calibracao
  }
  await ok(t.chamar('PUT', `/api/calibracoes/${k5.calibracao.id}/folha-campo`, { ...admin, payload: { numero: folha3 } }))
  // Rascunho com a folha impressa (nº reservado)
  const k4 = await c.calibracaoPronta()
  await ok(t.chamar('GET', `/api/calibracoes/${k4.id}/folha-campo`, admin))
  // Folha avulsa (nº reservado sem calibração)
  await ok(t.chamar('GET', '/api/folha-campo?chave=chave-0001-teste', { cookie: t.cookieComum }))
  // Rascunho com folha, excluído, e o nº dele registrado como não utilizado
  const k6 = await c.calibracaoPronta()
  const folha6 = (await ok(t.chamar('GET', `/api/calibracoes/${k6.id}/folha-campo`, admin))).headers['x-folha-campo']
  await ok(t.chamar('DELETE', `/api/calibracoes/${k6.id}`, { cookie: t.cookieComum }), 204)
  const numeros = (await ok(t.chamar('GET', '/api/numeros-reservados', admin))).json().numeros as NumeroReservado[]
  const n6 = numeros.find((n) => n.folha === folha6)!
  await ok(t.chamar('POST', `/api/numeros-reservados/${n6.id}/nao-utilizado`, { ...admin, payload: { motivo: 'Folha perdida' } }))
  // Lembrete de calibração
  await ok(
    t.chamar('POST', '/api/lembretes', {
      ...admin,
      payload: {
        clienteId: c.cliente.id,
        balancas: [c.balanca.id],
        para: 'qualidade@mercado.com.br',
        assunto: 'Calibração',
        texto: 'Está na hora.',
      },
    }),
  )
  expect(enviados).toHaveLength(2)
  ids.push(b.id, correcao.id, k3.id, k4.id, k5.calibracao.id, k6.id)
  return { t, c, modelo: k1, ids }
}

/** O servidor de novo, na mesma pasta (como o serviço iniciado depois), com o administrador entrando. */
async function ligarServidor() {
  const { app } = await criarApp({ pastaDados: pasta, pastaEstatica: null, parametrosSenha: PARAMETROS_LEVES })
  const nome = nomeCookieSessao(undefined)
  const entrada = await app.inject({
    method: 'POST',
    url: '/api/sessao',
    headers: H,
    payload: { login: 'admin', senha: SENHA_ADMIN, manterConectado: false },
  })
  expect(entrada.statusCode, entrada.body).toBe(200)
  const cookie = entrada.cookies.find((x) => x.name === nome)!.value
  const chamar = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: H, cookies: { [nome]: cookie }, ...(payload ? { payload } : {}) })
  return { app, chamar }
}

describe('apagar-testes.mjs', { timeout: 120_000 }, () => {
  it('apaga os testes de um banco de verdade, guarda a cópia e os PDFs, e o sistema recomeça a numeração', async () => {
    const { t, c, modelo, ids } = await montar(true)
    // Os certificados como o dono os vê na lista (um por nº: a versão anterior do corrigido fica só no histórico dele)
    const lista = (await t.chamar('GET', '/api/calibracoes?limite=200', { cookie: t.cookieAdmin })).json() as {
      itens: Array<{ status: string }>
    }
    const naLista = lista.itens.filter((k) => ['EMITIDO', 'CANCELADO', 'SUBSTITUIDO'].includes(k.status)).length
    await t.fechar() // o serviço parado
    abertos.length = 0

    const antes = tudo()
    const pdfsAntes = pdfsDaPasta(pasta)
    const status = comBanco(
      (db) =>
        Object.fromEntries(
          (
            db.prepare('SELECT status, COUNT(*) AS n FROM calibracoes GROUP BY status').all() as Array<{
              status: string
              n: number
            }>
          ).map((l) => [l.status, Number(l.n)]),
        ) as Record<string, number>,
    )
    // O cenário tem de tudo
    expect(status).toMatchObject({ EMITIDO: expect.any(Number), CANCELADO: 1, SUBSTITUIDO: 1, RASCUNHO: expect.any(Number) })
    for (const tabela of TABELAS_APAGADAS) expect(antes[tabela].length, tabela).toBeGreaterThan(0)
    expect(Object.keys(pdfsAntes.certificados).length).toBeGreaterThanOrEqual(4)
    expect(Object.keys(pdfsAntes['folhas-campo']).length).toBeGreaterThanOrEqual(3)
    expect(antes.arquivos.length).toBe(2)
    expect((antes.usuarios as Linha[]).find((u) => u.login === 'admin')!.assinatura).toBe(ASSINATURA_EXEMPLO_1)
    // Toda chave de meta que o sistema grava está classificada (a numeração sai; o resto fica)
    for (const { chave } of antes.meta as Array<{ chave: string }>)
      expect(/^(revisao|sequencia_\d{4}|certificados_fora_do_banco|testes_apagados_em)$/.test(chave), chave).toBe(true)
    const revisao = Number((antes.meta as Array<{ chave: string; valor: string }>).find((m) => m.chave === 'revisao')!.valor)
    const emailJson = readFileSync(join(pasta, 'email.json'), 'utf8')
    // As cópias do banco do período de testes (a automática, a manual e a do instalador): com elas na pasta backups, a
    // tela "Cópias de segurança" as mostraria e voltar uma delas traria os testes de volta
    const copiasDeAntes = [
      'antes-da-versao-1.0.4.db',
      `bc-calibracao_${ano}-11-04_08-00-00_diario.db`,
      `bc-calibracao_${ano}-11-04_09-00-00_manual.db`,
    ]
    mkdirSync(join(pasta, 'backups'), { recursive: true })
    for (const n of copiasDeAntes) copyFileSync(banco, join(pasta, 'backups', n))
    const copiasAntes = arquivosEm(join(pasta, 'backups'))

    // ---- A limpeza
    const r = rodar([pasta], 'APAGAR\n')
    expect(r.stderr).toBe('')
    expect(r.status, r.stdout).toBe(0)
    const emitidos = status.EMITIDO
    expect(r.stdout).toContain(`  - ${emitidos} certificados emitidos (em `)
    expect(r.stdout).toContain('  - 1 certificado cancelado\n')
    expect(r.stdout).toContain('  - 1 versão anterior de certificado corrigido\n')
    expect(r.stdout).toContain(`  - ${status.RASCUNHO + (status.REVISAO ?? 0)} calibrações em andamento\n`)
    expect(r.stdout).toContain(`  - ${antes.folhas_campo.length} folhas de campo\n`)
    expect(r.stdout).toContain('  - 2 registros de e-mails enviados\n')
    expect(r.stdout).toContain(
      '  - 3 cópias do banco da pasta backups, com os testes: vão para a pasta testes-apagados (não são apagadas)\n',
    )
    expect(r.stdout).toContain(`Depois, o próximo certificado será ${cc1} e a próxima folha de campo, ${fc1}.`)
    expect(r.stdout).toContain(
      'Ficam como estão: 2 usuários (com as assinaturas), 1 cliente, 1 balança, 1 padrão, 2 revisões do POP',
    )
    expect(r.stdout).toContain('Pronto: os testes foram apagados.')
    expect(r.stdout).toContain('net start BCCalibracao')

    // O que sai sumiu; o que fica está igual (o registro de atividades só ganha a limpeza)
    const depois = tudo()
    for (const tabela of TABELAS_APAGADAS) expect(depois[tabela], tabela).toEqual([])
    for (const tabela of TABELAS_MANTIDAS) {
      if (tabela === 'meta' || tabela === 'auditoria' || tabela === 'sqlite_sequence') continue
      expect(depois[tabela], tabela).toEqual(antes[tabela])
    }
    expect(depois.auditoria.slice(0, -1)).toEqual(antes.auditoria)
    const registro = depois.auditoria.at(-1) as Linha
    expect(registro).toMatchObject({ acao: 'TESTES_APAGADOS', ip: 'local', usuario_id: '', alvo: '' })
    expect(registro.detalhe).toMatch(
      /^Testes apagados: \d+ certificados, \d+ calibrações em andamento, \d+ folhas de campo, \d+ nºs reservados e 2 e-mails\. Próximos nºs: /,
    )
    // O corrigido conta uma vez, como na lista (a versão anterior não é outro certificado)
    expect(naLista).toBe(status.EMITIDO + status.CANCELADO)
    expect(registro.detalhe).toContain(`Testes apagados: ${naLista} certificados, `)
    const meta = Object.fromEntries((depois.meta as Array<{ chave: string; valor: string }>).map((m) => [m.chave, m.valor]))
    expect(Object.keys(meta).sort()).toEqual(['revisao', 'testes_apagados_em'])
    expect(Number(meta.revisao)).toBe(revisao + 1) // as telas abertas recarregam quando o serviço voltar
    comBanco((db) => {
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    })
    // Na tela "Atividade recente": a limpeza, feita no computador do servidor
    const comoNaTela: RegistroAuditoria = {
      id: Number(registro.id),
      em: String(registro.em),
      usuarioId: '',
      login: '',
      ip: 'local',
      acao: 'TESTES_APAGADOS',
      alvo: '',
      detalhe: String(registro.detalhe),
    }
    expect(descreverRegistro(comoNaTela)).toEqual({
      titulo: 'Apagou os certificados e as calibrações de teste',
      detalhe: registro.detalhe,
    })
    expect(autorDoRegistro(comoNaTela, new Map()).texto).toBe('No computador do servidor')

    // A cópia de antes, conferida, com os testes dentro
    const [copia] = backups()
    expect(backups()).toEqual([expect.stringMatching(/^antes-de-apagar-testes-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.db$/)])
    expect(r.stdout).toContain(`Cópia do banco de antes: ${join(pasta, 'backups', copia)}`)
    expect(registro.detalhe).toContain(`Cópia do banco: ${join('backups', copia)}.`)
    const doBackup = abrirBanco(join(pasta, 'backups', copia))
    try {
      for (const tabela of TABELAS_APAGADAS) expect(contar(doBackup, tabela), tabela).toBe(antes[tabela].length)
      expect(doBackup.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      doBackup.close()
    }
    // Os PDFs mudaram de pasta, inteiros; as pastas do sistema ficaram vazias
    const [movidos] = pastasDeTestes()
    expect(pastasDeTestes()).toEqual([copia.replace(/^antes-de-apagar-testes-(.*)\.db$/, 'testes-apagados-$1')])
    expect(r.stdout).toContain(`PDFs dos testes: ${join(pasta, movidos)}`)
    expect(pdfsDaPasta(join(pasta, movidos))).toEqual(pdfsAntes)
    // As cópias do período de testes também, inteiras (a pasta backups fica só com a cópia de agora)
    expect(arquivosEm(join(pasta, movidos, 'backups'))).toEqual(copiasAntes)
    expect(r.stdout).toContain(`Cópias do banco do período de testes: ${join(pasta, movidos, 'backups')}`)
    expect(String(registro.detalhe).endsWith(` PDFs e cópias antigas: ${movidos}.`)).toBe(true)
    expect(String(registro.detalhe).length).toBeLessThanOrEqual(300)
    for (const p of PDFS) expect(readdirSync(join(pasta, p)), p).toEqual([])
    expect(readFileSync(join(pasta, 'email.json'), 'utf8')).toBe(emailJson)

    // ---- Rodar de novo: nada a apagar, nada muda
    const segunda = rodar([pasta], 'APAGAR\n')
    expect(segunda.stderr).toBe('')
    expect(segunda.status).toBe(0)
    expect(segunda.stdout).toContain('Não há testes para apagar')
    expect(segunda.stdout).not.toContain('Digite')
    expect(tudo()).toEqual(depois)
    expect(backups()).toEqual([copia])
    expect(pastasDeTestes()).toEqual([movidos])

    // ---- O servidor sobe e funciona, com a numeração do começo
    const s = await ligarServidor()
    try {
      expect((await s.chamar('GET', '/api/calibracoes')).json()).toMatchObject({ itens: [], total: 0 })
      expect((await s.chamar('GET', '/api/numeros-reservados')).json()).toEqual({ numeros: [] })
      expect((await s.chamar('GET', `/api/clientes/${c.cliente.id}`)).statusCode).toBe(200)
      // Os registros antigos que apontam para uma calibração apagada: a ficha responde "não encontrado" (a tela mostra
      // "Certificado não encontrado") e o registro de atividades continua abrindo
      for (const id of ids) expect((await s.chamar('GET', `/api/calibracoes/${id}`)).statusCode, id).toBe(404)
      const atividade = await s.chamar('GET', '/api/auditoria?limite=200')
      expect(atividade.statusCode, atividade.body).toBe(200)
      expect((atividade.json().registros as RegistroAuditoria[]).some((x) => x.alvo === ids[0])).toBe(true)

      const nova = (await s.chamar('POST', '/api/calibracoes', { clienteId: c.cliente.id, balancaId: c.balanca.id })).json()
        .calibracao as Calibracao
      const folha = await s.chamar('GET', `/api/calibracoes/${nova.id}/folha-campo`)
      expect(folha.statusCode, folha.body).toBe(200)
      expect(folha.headers['x-folha-campo']).toBe(fc1)
      const ficha = (await s.chamar('GET', `/api/calibracoes/${nova.id}`)).json()
      expect(ficha.numeroReservado).toMatchObject({ numero: cc1, situacao: 'reservado' })
      const k = ficha.calibracao as Calibracao
      const salvo = await s.chamar('PUT', `/api/calibracoes/${k.id}`, {
        ...k,
        dataCalibracao: modelo.dataCalibracao,
        padroesIds: modelo.padroesIds,
        ambiente: modelo.ambiente,
        repetibilidade: modelo.repetibilidade,
        excentricidade: modelo.excentricidade,
        indicacao: modelo.indicacao,
        versao: k.versao,
      })
      expect(salvo.statusCode, salvo.body).toBe(200)
      const emitida = await s.chamar('POST', `/api/calibracoes/${k.id}/emitir`, { versao: salvo.json().calibracao.versao })
      expect(emitida.statusCode, emitida.body).toBe(200)
      expect(emitida.json().calibracao).toMatchObject({ status: 'EMITIDO', numero: cc1 })
      expect(existsSync(join(pasta, 'certificados', String(ano), `Certificado-${cc1}.pdf`))).toBe(true)
    } finally {
      await s.app.close()
    }

    // ---- Uma rodada depois do uso de verdade avisa que os testes já foram apagados (e não apaga sem APAGAR)
    const depoisDoUso = tudo()
    const terceira = rodar([pasta], '\n')
    expect(terceira.status).toBe(3)
    expect(terceira.stdout).toContain('  - 1 certificado emitido (em ')
    expect(terceira.stdout).toMatch(
      /ATENÇÃO: os testes já foram apagados em \d{2}\/\d{2}\/\d{4}\. O que está acima foi feito depois disso\./,
    )
    expect(terceira.stdout).toContain('Nada foi apagado.')
    expect(tudo()).toEqual(depoisDoUso)
  })

  it('recusa com o serviço ligado (o banco em uso), sem mudar nada, e apaga depois de parar o serviço', async () => {
    const { t } = await montar(false)
    const antes = tudo()
    const pdfsAntes = pdfsDaPasta(pasta)
    const r = rodar([pasta], 'APAGAR\n')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('O BC Calibração está usando o banco agora')
    expect(r.stderr).toContain('net stop BCCalibracao')
    expect(r.stderr).toContain('Nada foi apagado.')
    expect(r.stdout).not.toContain('Vai apagar')
    expect(backups()).toEqual([])
    expect(pastasDeTestes()).toEqual([])
    expect(pdfsDaPasta(pasta)).toEqual(pdfsAntes)
    // O serviço continua funcionando
    expect((await t.chamar('GET', '/api/calibracoes', { cookie: t.cookieAdmin })).json().total).toBe(1)
    await t.fechar()
    abertos.length = 0
    expect(tudo()).toEqual(antes)

    // Parado, apaga (também dando o caminho do próprio banco)
    const ok = rodar([banco], 'APAGAR\n')
    expect(ok.status, ok.stderr).toBe(0)
    expect(ok.stdout).toContain('  - 1 certificado emitido (em ')
    expect(comBanco((db) => contar(db, 'calibracoes'))).toBe(0)
  })

  it('sem digitar APAGAR não apaga nada', async () => {
    const { t } = await montar(false)
    await t.fechar()
    abertos.length = 0
    const antes = tudo()
    const pdfsAntes = pdfsDaPasta(pasta)
    for (const entrada of ['', '\n', 'sim\n', 'APAGA\n']) {
      const r = rodar([pasta], entrada)
      expect(r.status, entrada).toBe(3)
      expect(r.stdout).toContain('Vai apagar:')
      expect(r.stdout).toContain('Para apagar, digite APAGAR')
      expect(r.stdout).toContain('Nada foi apagado.')
      expect(r.stderr).toBe('')
    }
    expect(tudo()).toEqual(antes)
    expect(pdfsDaPasta(pasta)).toEqual(pdfsAntes)
    expect(backups()).toEqual([])
    expect(pastasDeTestes()).toEqual([])
    // Em minúsculas também vale
    expect(rodar([pasta], 'apagar\n').status).toBe(0)
    expect(comBanco((db) => contar(db, 'calibracoes'))).toBe(0)
  })

  it('recusa com o servidor de verdade ligado (server/iniciar.mjs, como o serviço do Windows roda)', async () => {
    const servidor = spawn(process.execPath, [fileURLToPath(new URL('../iniciar.mjs', import.meta.url))], {
      env: { ...process.env, PORTA: '0', HOST: '127.0.0.1', PASTA_DADOS: pasta, VITEST: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const saiu = new Promise<void>((pronto) => servidor.once('exit', () => pronto()))
    try {
      let saida = ''
      await new Promise<void>((pronto, falhou) => {
        const limite = setTimeout(() => falhou(new Error(`o servidor não subiu: ${saida}`)), 30_000)
        const ler = (b: Buffer) => {
          saida += b.toString()
          if (saida.includes('servidor iniciado')) {
            clearTimeout(limite)
            pronto()
          }
        }
        servidor.stdout.on('data', ler)
        servidor.stderr.on('data', ler)
        servidor.once('exit', () => falhou(new Error(`o servidor saiu: ${saida}`)))
      })
      const r = rodar([pasta], 'APAGAR\n')
      expect(r.status).toBe(1)
      expect(r.stderr).toContain('net stop BCCalibracao')
      expect(r.stdout).not.toContain('Vai apagar')
    } finally {
      servidor.kill('SIGTERM')
      await saiu
    }
    // Parado o servidor, a ferramenta abre o banco (não há nada para apagar num banco novo)
    const depois = rodar([pasta], 'APAGAR\n')
    expect(depois.status, depois.stderr).toBe(0)
    expect(depois.stdout).toContain('Não há testes para apagar')
  })

  it('uso incorreto e pasta sem o banco', () => {
    const semArgumento = rodar([])
    expect(semArgumento.status).toBe(2)
    expect(semArgumento.stderr).toContain(
      'node\\node.exe server\\ferramentas\\apagar-testes.mjs "C:\\ProgramData\\BC Calibracao\\dados"',
    )
    // "C:\...\dados\" no Prompt de Comando chega com a aspa no fim
    expect(rodar([`${pasta}${sep}"`]).stderr).toContain(`Banco não encontrado: ${banco}`)
    const vazia = rodar([pasta])
    expect(vazia.status).toBe(1)
    expect(vazia.stderr).toContain(`Banco não encontrado: ${banco}`)
    expect(vazia.stderr).toContain('como administrador')
    // Não cria um banco vazio
    expect(existsSync(banco)).toBe(false)
  })
})

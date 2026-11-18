// O app do celular (1.1.0) nas cópias do banco e na limpeza dos testes: voltar uma cópia leva os celulares como no
// banco atual (como as contas) e o que veio do campo depois da cópia (como as folhas impressas); "Apagar os testes" recusa
// enquanto houver folha no celular de um técnico e, depois, apaga os envios e os registros e mantém os celulares.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AppComLogin, cenarioCalibracao, criarAppComLogin } from '../auxiliaresTeste.ts'
import { abrirBanco } from '../db.ts'
import { abrirSozinho, apagarTestes, ARQUIVO_BANCO, levantar } from '../limpezaTestes.ts'
import { transplantarRegistros, transplantarUsuarios } from '../usuarios.ts'
import {
  APARELHO_TESTE,
  baixarEConfirmar,
  enviarCalibracao,
  entregar,
  OUTRO_APARELHO,
  parearCelular,
  registroDoPacote,
} from './auxiliaresTesteCampo.ts'

let pasta: string
let t: AppComLogin
let fechado = false

beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'bcf-campo-copia-'))
  t = await criarAppComLogin({ pastaDados: pasta, arquivoBanco: join(pasta, ARQUIVO_BANCO) })
  fechado = false
})
afterEach(async () => {
  if (!fechado) await t.fechar()
  rmSync(pasta, { recursive: true, force: true })
})

const linhas = (db: ReturnType<typeof abrirBanco>, sql: string) => db.prepare(sql).all() as Array<Record<string, unknown>>

describe('voltar uma cópia do banco', { timeout: 60_000 }, () => {
  it('os celulares ficam como no banco atual; os envios, os registros e as importações de depois da cópia passam', async () => {
    const c = await cenarioCalibracao(t)
    const k1 = await c.calibracaoPronta()
    const k2 = await c.calibracaoPronta()
    const { token } = await parearCelular(t)
    const e1 = (await enviarCalibracao(t, k1.id)).envio
    const pacote1 = await baixarEConfirmar(t, token, e1.id)
    const copia = await t.ctx.backups.copiar('manual')

    // Depois da cópia: a folha 1 volta do campo e é comparada; a 2 vai ao celular, é recolhida à força e reenviada;
    // um segundo celular é cadastrado e o primeiro, revogado
    await entregar(t, token, e1.id, registroDoPacote(pacote1, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }))
    const registro = t.ctx.campo!.repo.listarRegistros()[0]
    t.ctx.campo!.repo.registrarImportacao({
      registroId: registro.id,
      calibracaoId: k1.id,
      tipo: 'COMPARACAO',
      versaoAntes: 1,
      versaoDepois: 1,
      por: 'Teste',
      resumo: {},
    })
    const e2 = (await enviarCalibracao(t, k2.id)).envio
    await baixarEConfirmar(t, token, e2.id)
    const destinoAntes = abrirBanco(copia)
    // A cópia de antes não tinha nada disso
    expect(linhas(destinoAntes, 'SELECT situacao FROM folhas_campo_envios')).toEqual([{ situacao: 'NO_CELULAR' }])
    destinoAntes.close()
    await t.chamar('POST', `/api/folhas-campo/${e2.numero}/recolher`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Trocar de técnico', forcar: true },
    })
    const e2b = (
      await t.chamar('POST', `/api/folhas-campo/${e2.numero}/enviar-tecnico`, {
        cookie: t.cookieAdmin,
        payload: { tecnicoId: t.comumId },
      })
    ).json().envio
    await parearCelular(t, { aparelhoId: OUTRO_APARELHO })
    await t.chamar('POST', `/api/celulares/${APARELHO_TESTE}/revogar`, { cookie: t.cookieAdmin, payload: { motivo: 'TROCA' } })

    // A cópia tinha o envio da folha 2 vivo; o banco atual tem o mesmo recolhido e outro vivo
    const destino = abrirBanco(copia)
    try {
      // Os dados impressos da folha 1 congelados depois da cópia (simulado: a cópia sem eles)
      destino.exec('DROP TRIGGER folhas_campo_dados_fixos')
      destino.prepare("UPDATE folhas_campo SET dados_impressos = '', dados_sha256 = '' WHERE numero = ?").run(e1.numero)
      transplantarUsuarios(t.ctx.db, destino)
      transplantarRegistros(t.ctx.db, destino)
      expect(linhas(destino, 'SELECT * FROM dispositivos ORDER BY id')).toEqual(
        linhas(t.ctx.db, 'SELECT * FROM dispositivos ORDER BY id'),
      )
      expect(linhas(destino, 'SELECT id, situacao FROM folhas_campo_envios ORDER BY enviado_em, id')).toEqual(
        linhas(t.ctx.db, 'SELECT id, situacao FROM folhas_campo_envios ORDER BY enviado_em, id'),
      )
      expect(linhas(destino, "SELECT id FROM folhas_campo_envios WHERE situacao IN ('ENVIADA', 'NO_CELULAR')")).toEqual([
        { id: e2b.id },
      ])
      expect(linhas(destino, 'SELECT * FROM registros_campo')).toEqual(linhas(t.ctx.db, 'SELECT * FROM registros_campo'))
      expect(linhas(destino, 'SELECT * FROM campo_importacoes')).toEqual(linhas(t.ctx.db, 'SELECT * FROM campo_importacoes'))
      expect(linhas(destino, `SELECT dados_sha256 FROM folhas_campo WHERE numero = '${e1.numero}'`)).toEqual(
        linhas(t.ctx.db, `SELECT dados_sha256 FROM folhas_campo WHERE numero = '${e1.numero}'`),
      )
      const detalhes = linhas(destino, "SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA'").map((l) =>
        String(l.detalhe),
      )
      expect(detalhes.some((d) => d.includes('1 registro de campo do celular'))).toBe(true)
      // De novo: nada passa duas vezes
      const n = linhas(destino, 'SELECT COUNT(*) AS n FROM auditoria')
      transplantarRegistros(t.ctx.db, destino)
      expect(linhas(destino, 'SELECT COUNT(*) AS n FROM registros_campo')).toEqual([{ n: 1 }])
      expect(linhas(destino, 'SELECT COUNT(*) AS n FROM auditoria')).toEqual(n)
    } finally {
      destino.close()
    }
  })
})

describe('apagar os testes', { timeout: 60_000 }, () => {
  it('recusa com folha no celular; depois, apaga os envios, os registros e as importações e mantém os celulares', async () => {
    const c = await cenarioCalibracao(t)
    const k1 = await c.calibracaoPronta()
    const k2 = await c.calibracaoPronta()
    const { token } = await parearCelular(t)
    const e1 = (await enviarCalibracao(t, k1.id)).envio
    const pacote1 = await baixarEConfirmar(t, token, e1.id)
    await entregar(t, token, e1.id, registroDoPacote(pacote1, { tecnico: { id: t.comumId, nome: 'Comum Teste' } }))
    const e2 = (await enviarCalibracao(t, k2.id)).envio
    await baixarEConfirmar(t, token, e2.id)
    // Com a folha 2 no celular: recusa (numa cópia do banco, como estaria)
    const copia = await t.ctx.backups.copiar('manual')
    const db = abrirSozinho(copia)
    try {
      expect(() => levantar(db, pasta)).toThrow(new RegExp(`no celular de um técnico \\(${e2.numero}\\).*Nada foi apagado`))
      expect(() => apagarTestes(db, pasta)).toThrow(/Recolha as folhas/)
    } finally {
      db.close()
    }
    // Recolhida à força: a limpeza roda
    await t.chamar('POST', `/api/folhas-campo/${e2.numero}/recolher`, {
      cookie: t.cookieAdmin,
      payload: { motivo: 'Celular perdido', forcar: true },
    })
    await t.fechar()
    fechado = true
    const banco = abrirSozinho(join(pasta, ARQUIVO_BANCO))
    try {
      const r = apagarTestes(banco, pasta)
      expect(r.apagou).toBe(true)
      expect(r.apagadas).toMatchObject({ registros_campo: 1, folhas_campo_envios: 2, campo_importacoes: 0 })
      for (const tabela of ['registros_campo', 'folhas_campo_envios', 'campo_importacoes'])
        expect(linhas(banco, `SELECT COUNT(*) AS n FROM ${tabela}`), tabela).toEqual([{ n: 0 }])
      expect(linhas(banco, 'SELECT id FROM dispositivos')).toEqual([{ id: APARELHO_TESTE }])
    } finally {
      banco.close()
    }
  })
})

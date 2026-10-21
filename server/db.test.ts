// Migração 2: a balança passa a ser identificada pelo indicador e a plataforma vira o dado opcional.

import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { detalheTrocaIndicador, migrar } from './db.ts'

const EM = '2026-10-01T12:00:00.000Z'

/** Banco na versão 1 (antes da troca), com um cliente. */
function bancoV1() {
  const db = new DatabaseSync(':memory:')
  migrar(db, 1)
  db.prepare(
    `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
     VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
  ).run(EM, EM)
  return db
}

function inserirBalanca(db: DatabaseSync, id: string, dados: Record<string, unknown>) {
  db.prepare(
    `INSERT INTO balancas (id, cliente_id, numero_serie, busca, ativo, dados, versao, criado_em, atualizado_em)
     VALUES (?, 'c1', ?, ?, 1, ?, 3, ?, ?)`,
  ).run(id, String(dados.numeroSerie ?? ''), 'antiga', JSON.stringify({ id, clienteId: 'c1', versao: 3, ...dados }), EM, EM)
}

function inserirCalibracao(db: DatabaseSync, id: string, balancaId: string, busca: string, dados: Record<string, unknown>) {
  db.prepare(
    `INSERT INTO calibracoes (id, status, cliente_id, balanca_id, busca, dados, versao, criado_em, atualizado_em)
     VALUES (?, ?, 'c1', ?, ?, ?, 1, ?, ?)`,
  ).run(id, dados.emissao ? 'EMITIDO' : 'RASCUNHO', balancaId, busca, JSON.stringify({ id, ...dados }), EM, EM)
}

const linha = (db: DatabaseSync, id: string) =>
  db.prepare('SELECT numero_serie, busca, dados, versao FROM balancas WHERE id = ?').get(id) as {
    numero_serie: string
    busca: string
    dados: string
    versao: number
  }

const registros = (db: DatabaseSync) =>
  db.prepare('SELECT acao, ip, detalhe FROM auditoria').all() as Array<{ acao: string; ip: string; detalhe: string }>

const PLATAFORMA_ANTIGA = {
  fabricante: 'Toledo do Brasil',
  modelo: '2180',
  numeroSerie: '2180-0041273',
  identificacao: 'BAL-EXP-07',
  localInstalacao: 'Expedição',
  indicadorFabricante: 'Toledo do Brasil',
  indicadorModelo: '9091',
  indicadorSerie: '9091-118832',
  unidade: 'kg',
  faixas: [{ max: 300, e: 0.05, d: 0.05 }],
}

describe('migração 2: balança identificada pelo indicador', () => {
  it('com indicador separado: o indicador vira a identificação e a de antes vai para a plataforma', () => {
    const db = bancoV1()
    inserirBalanca(db, 'b1', PLATAFORMA_ANTIGA)
    migrar(db)
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(3)

    const l = linha(db, 'b1')
    const b = JSON.parse(l.dados)
    expect(b).toMatchObject({
      fabricante: 'Toledo do Brasil',
      modelo: '9091',
      numeroSerie: '9091-118832',
      plataformaFabricante: 'Toledo do Brasil',
      plataformaModelo: '2180',
      plataformaSerie: '2180-0041273',
      identificacao: 'BAL-EXP-07',
      faixas: [{ max: 300, e: 0.05, d: 0.05 }],
    })
    expect(b).not.toHaveProperty('indicadorFabricante')
    expect(b).not.toHaveProperty('indicadorModelo')
    expect(b).not.toHaveProperty('indicadorSerie')
    // Colunas de busca e de nº de série acompanham; a versão não muda (ninguém editou)
    expect(l.numero_serie).toBe('9091-118832')
    expect(l.busca).toContain('9091-118832')
    expect(l.busca).toContain('2180-0041273')
    expect(l.busca).toContain('expedicao')
    expect(l.versao).toBe(3)
    expect(b.versao).toBe(3)
    // O registro de atividades conta as balanças trocadas, para o dono conferir
    expect(registros(db)).toEqual([
      {
        acao: 'SISTEMA_ATUALIZADO',
        ip: 'local',
        detalhe:
          '1 balança com indicador separado passou a ser identificada pelo indicador; os dados de antes ficaram como plataforma. Confira: 9091-118832.',
      },
    ])
  })

  it('sem indicador separado: só troca as chaves', () => {
    const db = bancoV1()
    inserirBalanca(db, 'b2', {
      fabricante: 'Filizola',
      modelo: 'Platina 15',
      numeroSerie: 'FZ-88213',
      indicadorFabricante: '',
      indicadorModelo: '',
      indicadorSerie: '',
      unidade: 'kg',
      faixas: [{ max: 30, e: 0.005, d: 0.005 }],
    })
    migrar(db)
    const l = linha(db, 'b2')
    const b = JSON.parse(l.dados)
    expect(b).toMatchObject({
      fabricante: 'Filizola',
      modelo: 'Platina 15',
      numeroSerie: 'FZ-88213',
      plataformaFabricante: '',
      plataformaModelo: '',
      plataformaSerie: '',
    })
    expect(b).not.toHaveProperty('indicadorSerie')
    expect(l.numero_serie).toBe('FZ-88213')
    expect(l.busca).toBe('filizola platina 15 fz-88213')
    // Nada mudou na identificação: nada a conferir
    expect(registros(db)).toEqual([])
  })

  it('indicador igual à identificação principal (digitado nos dois lugares): sem plataforma inventada', () => {
    const db = bancoV1()
    inserirBalanca(db, 'b3', {
      fabricante: 'Toledo',
      modelo: '9091',
      numeroSerie: 'IND-1',
      indicadorFabricante: 'Toledo',
      indicadorModelo: '9091',
      indicadorSerie: 'ind-1 ',
      unidade: 'kg',
      faixas: [{ max: 300, e: 0.05, d: 0.05 }],
    })
    migrar(db)
    const l = linha(db, 'b3')
    const b = JSON.parse(l.dados)
    expect(b).toMatchObject({
      fabricante: 'Toledo',
      modelo: '9091',
      numeroSerie: 'IND-1',
      plataformaFabricante: '',
      plataformaModelo: '',
      plataformaSerie: '',
    })
    expect(b).not.toHaveProperty('indicadorSerie')
    expect(l.numero_serie).toBe('IND-1')
    expect(l.busca).toBe('toledo 9091 ind-1')
  })

  it('cadastro antigo parcial (só o nº de série do indicador): a identificação de antes vai inteira para a plataforma', () => {
    const db = bancoV1()
    inserirBalanca(db, 'b4', {
      ...PLATAFORMA_ANTIGA,
      indicadorFabricante: '',
      indicadorModelo: '',
    })
    migrar(db)
    const l = linha(db, 'b4')
    const b = JSON.parse(l.dados)
    expect(b).toMatchObject({
      // O modelo 2180 era o da plataforma: não fica como modelo do indicador
      fabricante: 'Toledo do Brasil',
      modelo: '',
      numeroSerie: '9091-118832',
      plataformaFabricante: 'Toledo do Brasil',
      plataformaModelo: '2180',
      plataformaSerie: '2180-0041273',
    })
    expect(l.numero_serie).toBe('9091-118832')
  })

  it('indicador sem nº de série: o nº de série principal fica (a plataforma quase nunca tem o seu)', () => {
    const db = bancoV1()
    inserirBalanca(db, 'b5', {
      fabricante: 'Fabricante Plataforma',
      modelo: '',
      numeroSerie: 'P-4',
      indicadorFabricante: 'Alfa',
      indicadorModelo: '3101C',
      indicadorSerie: '',
      unidade: 'kg',
      faixas: [{ max: 300, e: 0.05, d: 0.05 }],
    })
    inserirBalanca(db, 'b6', { ...PLATAFORMA_ANTIGA, indicadorSerie: '' })
    migrar(db)
    const l5 = linha(db, 'b5')
    expect(JSON.parse(l5.dados)).toMatchObject({
      fabricante: 'Alfa',
      modelo: '3101C',
      numeroSerie: 'P-4',
      // Só o fabricante não identifica plataforma nenhuma
      plataformaFabricante: '',
      plataformaModelo: '',
      plataformaSerie: '',
    })
    expect(l5.numero_serie).toBe('P-4')
    // Com o modelo da plataforma: ela fica com o modelo, e o nº de série continua o principal
    const l6 = linha(db, 'b6')
    expect(JSON.parse(l6.dados)).toMatchObject({
      fabricante: 'Toledo do Brasil',
      modelo: '9091',
      numeroSerie: '2180-0041273',
      plataformaFabricante: 'Toledo do Brasil',
      plataformaModelo: '2180',
      plataformaSerie: '',
    })
    expect(l6.numero_serie).toBe('2180-0041273')
    expect(registros(db).map((r) => r.detalhe)).toEqual([
      '2 balanças com indicador separado passaram a ser identificadas pelo indicador; os dados de antes ficaram como plataforma. Confira: P-4, 2180-0041273.',
    ])
  })

  it('o detalhe do registro cabe no limite, com "…" quando a lista é longa', () => {
    const series = Array.from({ length: 40 }, (_, i) => `SERIE-${1000 + i}`)
    const d = detalheTrocaIndicador(series)
    expect(d.length).toBeLessThanOrEqual(300)
    expect(d).toMatch(/^40 balanças .* Confira: SERIE-1000, SERIE-1001, .*, …$/)
  })

  it('certificados emitidos não mudam; a busca ganha o nº de série que passou a valer', () => {
    const db = bancoV1()
    inserirBalanca(db, 'b1', PLATAFORMA_ANTIGA)
    const copia = { id: 'b1', clienteId: 'c1', ...PLATAFORMA_ANTIGA }
    inserirCalibracao(db, 'k1', 'b1', 'cc-2026-00001 frigorifico toledo do brasil 2180 2180-0041273', {
      emissao: { balanca: copia },
    })
    inserirCalibracao(db, 'k2', 'b1', 'frigorifico toledo do brasil 2180 2180-0041273', {})
    const antes = (db.prepare('SELECT dados FROM calibracoes WHERE id = ?').get('k1') as { dados: string }).dados
    migrar(db)

    const k1 = db.prepare('SELECT busca, dados FROM calibracoes WHERE id = ?').get('k1') as { busca: string; dados: string }
    expect(k1.dados).toBe(antes)
    expect(JSON.parse(k1.dados).emissao.balanca.indicadorSerie).toBe('9091-118832')
    expect(k1.busca).toBe('cc-2026-00001 frigorifico toledo do brasil 2180 2180-0041273 9091-118832')
    // Rascunho: usa o cadastro atual (já migrado)
    const k2 = db.prepare('SELECT busca FROM calibracoes WHERE id = ?').get('k2') as { busca: string }
    expect(k2.busca).toBe('frigorifico toledo do brasil 2180 2180-0041273 9091-118832')
  })

  it('roda uma vez só', () => {
    const db = bancoV1()
    inserirBalanca(db, 'b1', PLATAFORMA_ANTIGA)
    migrar(db)
    const depois = linha(db, 'b1').dados
    migrar(db)
    expect(linha(db, 'b1').dados).toBe(depois)
  })
})

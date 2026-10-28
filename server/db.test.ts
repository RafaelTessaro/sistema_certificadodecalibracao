// Migração 2: a balança passa a ser identificada pelo indicador e a plataforma vira o dado opcional.
// Migração 5: histórico das folhas de campo (a substituída continua registrada) e as folhas soltas.
// Migração 6: o PDF da folha de campo num arquivo (caminho e sha256 no banco) e as passagens da folha de um
// certificado cancelado para a calibração refeita.

import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { detalheTrocaIndicador, migrar } from './db.ts'

const EM = '2026-10-01T12:00:00.000Z'
/** Versão do esquema depois de todas as migrações. */
const ULTIMA = 7

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

const versao = (db: DatabaseSync) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

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
    expect(versao(db)).toBe(ULTIMA)

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

describe('migração 5: histórico das folhas de campo', () => {
  const PDF = Buffer.from('%PDF-1.7 primeira impressão')

  /** Banco na versão 4 (a da folha de campo com o PDF guardado), com um rascunho e duas folhas. */
  function bancoV4() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b1', { numeroSerie: 'TL-1', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    inserirCalibracao(db, 'k1', 'b1', '', {})
    migrar(db, 4)
    const folha = db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, balanca_id, cliente_id, impressa_por,
         impressa_em, ultima_em, pdf) VALUES (?, 2026, ?, ?, ?, 'b1', 'c1', 'Ana', ?, ?, ?)`,
    )
    folha.run('FC-2026-00001', 1, 'calibracao:k1', 'k1', EM, EM, PDF)
    // Folha de um rascunho excluído antes da correção (ficava presa ao id apagado)
    folha.run('FC-2026-00002', 2, 'calibracao:apagado', 'apagado', EM, EM, PDF)
    return db
  }

  const folhas = (db: DatabaseSync) =>
    db
      .prepare('SELECT numero, calibracao_id, substituida_por, substituida_em, pdf FROM folhas_campo ORDER BY numero')
      .all() as Array<{ numero: string; calibracao_id: string; substituida_por: string; substituida_em: string; pdf: Uint8Array }>

  it('acrescenta o histórico (todas vigentes), mantém o PDF e solta a folha do rascunho excluído', () => {
    const db = bancoV4()
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const [daCalibracao, solta] = folhas(db)
    expect(daCalibracao).toMatchObject({ numero: 'FC-2026-00001', calibracao_id: 'k1', substituida_por: '', substituida_em: '' })
    expect(Buffer.from(daCalibracao.pdf).equals(PDF)).toBe(true)
    expect(solta).toMatchObject({ numero: 'FC-2026-00002', calibracao_id: '', substituida_por: '' })
    expect(Buffer.from(solta.pdf).equals(PDF)).toBe(true)
  })

  it('a instalação da versão 1.0.1 (banco na versão 2) chega à última com a tabela completa', () => {
    const db = new DatabaseSync(':memory:')
    migrar(db, 2)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const colunas = (db.prepare('PRAGMA table_info(folhas_campo)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(colunas).toEqual(
      expect.arrayContaining(['numero', 'chave', 'calibracao_id', 'pdf', 'substituida_por', 'substituida_em']),
    )
  })

  it('pode ser repetida: com as colunas já criadas, não falha nem mexe nos dados', () => {
    const db = bancoV4()
    migrar(db)
    db.prepare(
      "UPDATE folhas_campo SET substituida_por = 'FC-2026-00003', substituida_em = ? WHERE numero = 'FC-2026-00001'",
    ).run(EM)
    const antes = folhas(db)
    db.exec('PRAGMA user_version = 4')
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(folhas(db)).toEqual(antes)
  })
})

describe('migração 6: PDF da folha de campo em arquivo e passagens de certificado cancelado', () => {
  const colunas = (db: DatabaseSync) =>
    (db.prepare('PRAGMA table_info(folhas_campo)').all() as Array<{ name: string }>).map((c) => c.name)

  it('acrescenta o caminho e o sha256 do PDF (o PDF do banco continua até o servidor movê-lo) e a tabela das passagens', () => {
    const db = new DatabaseSync(':memory:')
    migrar(db, 5)
    db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, impressa_por, impressa_em, ultima_em, pdf)
       VALUES ('FC-2026-00001', 2026, 1, 'avulsa:a', 'Ana', ?, ?, ?)`,
    ).run(EM, EM, Buffer.from('%PDF-1.7'))
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(colunas(db)).toEqual(expect.arrayContaining(['pdf', 'pdf_arquivo', 'pdf_sha256']))
    expect(db.prepare('SELECT pdf_arquivo, pdf_sha256, length(pdf) AS n FROM folhas_campo').get()).toEqual({
      pdf_arquivo: '',
      pdf_sha256: '',
      n: 8,
    })
    const passagens = (db.prepare('PRAGMA table_info(folhas_campo_passagens)').all() as Array<{ name: string }>).map(
      (c) => c.name,
    )
    expect(passagens).toEqual(
      expect.arrayContaining([
        'numero',
        'de_calibracao_id',
        'para_calibracao_id',
        'substituida_por',
        'substituida_em',
        'em',
        'por',
      ]),
    )
  })

  it('pode ser repetida sem falhar', () => {
    const db = new DatabaseSync(':memory:')
    migrar(db)
    db.exec('PRAGMA user_version = 5')
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
  })
})

describe('migração 7: arquivos guardados no banco, revisões do POP e anexos dos envios', () => {
  /** Instalação da versão 1.0.1 (banco na versão 2), com as configurações gravadas e um envio. */
  function banco101(procedimento: string | null) {
    const db = new DatabaseSync(':memory:')
    migrar(db, 2)
    if (procedimento !== null)
      db.prepare("INSERT INTO config (chave, valor) VALUES ('geral', ?)").run(
        JSON.stringify({ empresa: { razaoSocial: 'X' }, textos: { procedimento, procedimentoDescricao: 'Método' } }),
      )
    db.prepare(
      `INSERT INTO envios (id, calibracao_id, cliente_id, tipo, para, assunto, usuario_id, usuario_nome, em)
       VALUES ('e1', 'k1', 'c1', 'CERTIFICADO', 'a@b.com', 'Certificado', 'u1', 'Ana', ?)`,
    ).run(EM)
    return db
  }
  const pops = (db: DatabaseSync) =>
    db.prepare('SELECT id, codigo, revisao, arquivo, criado_por FROM pop_versoes ORDER BY id').all() as Array<
      Record<string, unknown>
    >
  const colunas = (db: DatabaseSync, tabela: string) =>
    (db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>).map((c) => c.name)

  it('o procedimento digitado nas configurações vira a revisão vigente do POP (e o registro de atividades avisa)', () => {
    const db = banco101('PT-CAL-02 rev. 3')
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(pops(db)).toEqual([{ id: 1, codigo: 'PT-CAL-02', revisao: '3', arquivo: null, criado_por: 'Atualização do sistema' }])
    expect(registros(db)).toEqual([
      {
        acao: 'SISTEMA_ATUALIZADO',
        ip: 'local',
        detalhe:
          'O procedimento das configurações do certificado (PT-CAL-02 rev. 3) passou a ser a revisão vigente do POP, em Configurações → Certificado. Anexe lá o arquivo do POP.',
      },
    ])
    expect(colunas(db, 'arquivos')).toEqual(['sha256', 'nome', 'tipo', 'tamanho', 'conteudo', 'criado_em', 'criado_por'])
    expect(colunas(db, 'pop_versoes')).toEqual([
      'id',
      'codigo',
      'revisao',
      'data',
      'arquivo',
      'observacao',
      'criado_em',
      'criado_por',
    ])
    // Os envios de antes ficam sem a lista de anexos
    expect(db.prepare('SELECT anexos FROM envios').get()).toEqual({ anexos: '' })
  })

  it('o código de exemplo de fábrica (PT-CAL-01 rev. 0) não vira POP: o dono registra o dele', () => {
    const db = banco101('PT-CAL-01 rev. 0')
    migrar(db)
    expect(pops(db)).toEqual([])
    expect(registros(db)).toEqual([])
  })

  it('sem configurações gravadas, ou com o procedimento vazio, também não', () => {
    for (const p of [null, '', '   ']) {
      const db = banco101(p)
      migrar(db)
      expect(pops(db)).toEqual([])
    }
  })

  it('procedimento sem "rev.": o texto inteiro vira o código', () => {
    const db = banco101('Procedimento interno de calibração')
    migrar(db)
    expect(pops(db)).toEqual([expect.objectContaining({ codigo: 'Procedimento interno de calibração', revisao: '' })])
  })

  it('pode ser repetida: não cria a revisão de novo nem perde os arquivos', () => {
    const db = banco101('PT-CAL-02 rev. 3')
    migrar(db)
    db.prepare(
      "INSERT INTO arquivos (sha256, nome, tipo, tamanho, conteudo, criado_em) VALUES (?, 'a.pdf', 'application/pdf', 3, ?, ?)",
    ).run('f'.repeat(64), Buffer.from('abc'), EM)
    db.exec('PRAGMA user_version = 6')
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(pops(db)).toHaveLength(1)
    expect(db.prepare('SELECT COUNT(*) AS n FROM arquivos').get()).toEqual({ n: 1 })
  })
})

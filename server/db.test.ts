// Migração 2: a balança passa a ser identificada pelo indicador e a plataforma vira o dado opcional.
// Migração 5: histórico das folhas de campo (a substituída continua registrada) e as folhas soltas.
// Migração 6: o PDF da folha de campo num arquivo (caminho e sha256 no banco) e as passagens da folha de um
// certificado cancelado para a calibração refeita.
// Migração 8: os nºs de certificado reservados na impressão da folha de campo (e o nº impresso em cada folha).
// Migração 9: a revisão aberta antes do cálculo da classe I, de um certificado emitido antes dele, fica legada.
// Migração 10: a revisão do POP impressa em cada folha de campo (a vigente na primeira impressão).
// Migração 11: a revisão em andamento levada para o novo dono da balança volta para o cliente do certificado revisado.
// Migração 12: as balanças de cada lembrete de calibração (vazio nos de antes).
// Migração 13: os endereços que o servidor de e-mail recusou em cada envio (vazio nos de antes).

import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { calculoLegado, hojeLocalIso, OPCOES_CALCULO_PADRAO, pendenciasEmissao } from '#shared/dominio.ts'
import type { Calibracao } from '#shared/tipos.ts'
import { exemploClasseI } from './pdf/exemplosCertificado.ts'
import { detalheTrocaIndicador, migrar } from './db.ts'

const EM = '2026-10-01T12:00:00.000Z'
/** Versão do esquema depois de todas as migrações. */
const ULTIMA = 13

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

describe('migração 8: nºs de certificado reservados na impressão da folha de campo', () => {
  /** Banco na versão 7 (a anterior), com um rascunho, uma folha impressa para ele e um certificado emitido. */
  function bancoV7() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b1', { numeroSerie: 'TL-1', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    inserirCalibracao(db, 'k1', 'b1', '', {})
    migrar(db, 7)
    db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, balanca_id, cliente_id, impressa_por,
         impressa_em, ultima_em) VALUES ('FC-2026-00001', 2026, 1, 'calibracao:k1', 'k1', 'b1', 'c1', 'Ana', ?, ?)`,
    ).run(EM, EM)
    db.prepare("INSERT INTO meta (chave, valor) VALUES ('sequencia_2026', '12')").run()
    return db
  }
  const colunas = (db: DatabaseSync, tabela: string) =>
    (db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>).map((c) => c.name)

  it('cria a tabela (vazia: os rascunhos de antes não têm nº reservado) e a coluna do nº impresso na folha', () => {
    const db = bancoV7()
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(colunas(db, 'numeros_reservados')).toEqual([
      'id',
      'numero',
      'ano',
      'sequencia',
      'calibracao_id',
      'folha',
      'reservado_em',
      'reservado_por',
      'situacao',
      'motivo',
      'situacao_em',
      'situacao_por',
    ])
    expect(db.prepare('SELECT COUNT(*) AS n FROM numeros_reservados').get()).toEqual({ n: 0 })
    // A folha de antes não tem nº de certificado; o contador da emissão fica como estava
    expect(db.prepare('SELECT numero, numero_certificado FROM folhas_campo').all()).toEqual([
      { numero: 'FC-2026-00001', numero_certificado: '' },
    ])
    expect(db.prepare("SELECT valor FROM meta WHERE chave = 'sequencia_2026'").get()).toEqual({ valor: '12' })
  })

  it('a tabela recusa uma situação desconhecida, o mesmo ano e nº duas vezes e dois nºs reservados para a mesma calibração', () => {
    const db = bancoV7()
    migrar(db)
    const inserir = (sequencia: number, calibracao: string, situacao = 'reservado') =>
      db
        .prepare(
          `INSERT INTO numeros_reservados (numero, ano, sequencia, calibracao_id, folha, reservado_em, situacao)
           VALUES (?, 2026, ?, ?, 'FC-2026-00001', ?, ?)`,
        )
        .run(`CC-2026-${sequencia}`, sequencia, calibracao, EM, situacao)
    inserir(13, 'k1')
    expect(() => inserir(14, 'k2', 'perdido')).toThrow(/CHECK/)
    expect(() => inserir(13, 'k2')).toThrow(/UNIQUE/)
    expect(() => inserir(14, 'k1')).toThrow(/UNIQUE/)
    // Emitido ou não utilizado não conta como o reservado da calibração; folha avulsa ('') também não
    inserir(15, 'k1', 'nao_utilizado')
    inserir(16, '')
    inserir(17, '')
  })

  it('pode ser repetida sem falhar nem perder os nºs', () => {
    const db = bancoV7()
    migrar(db)
    db.prepare(
      `INSERT INTO numeros_reservados (numero, ano, sequencia, calibracao_id, folha, reservado_em)
       VALUES ('CC-2026-00013', 2026, 13, 'k1', 'FC-2026-00001', ?)`,
    ).run(EM)
    db.exec('PRAGMA user_version = 7')
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(db.prepare('SELECT numero, situacao FROM numeros_reservados').all()).toEqual([
      { numero: 'CC-2026-00013', situacao: 'reservado' },
    ])
  })
})

describe('migração 9: revisão aberta antes do cálculo da classe I', () => {
  /**
   * Banco na versão 8 com o certificado classe I emitido na versão anterior (JSON sem `opcoes.conveccao`, sem o ΔT
   * pesos − ar) e a revisão dele aberta ainda na versão anterior (sem a marca `calculoLegado`, sem emissão).
   */
  function bancoV8() {
    const d = exemploClasseI()
    const { conveccao: _c, ...opcoesAntigas } = { ...d.calibracao.opcoes, empuxo: 'AJUSTADO' as const }
    const { deltaTPesos: _d, aclimatacao: _a, ...ambienteAntigo } = d.calibracao.ambiente
    const antigo = {
      ...d.calibracao,
      opcoes: opcoesAntigas,
      ambiente: ambienteAntigo,
      ajuste: { realizado: 'INTERNO' as const, descricao: '' },
    } as unknown as Calibracao
    const original = { ...antigo, id: 'k1', status: 'EMITIDO' as const, emissao: d.emissao }
    const { emissao: _e, numero: _n, ...semEmissao } = antigo
    const revisao = { ...semEmissao, numero: '', id: 'k2', status: 'RASCUNHO' as const, substituiId: 'k1', revisao: 1 }
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Laboratório', 'laboratorio', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b1', { numeroSerie: 'D4501', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] })
    migrar(db, 8)
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, substitui_id, dados, versao, criado_em, atualizado_em)
       VALUES (?, ?, ?, 'c1', 'b1', ?, ?, 1, ?, ?)`,
    )
    inserir.run('k1', 'EMITIDO', original.numero, '', JSON.stringify(original), EM, EM)
    inserir.run('k2', 'RASCUNHO', '', 'k1', JSON.stringify(revisao), EM, EM)
    return { db, d, original }
  }
  const calibracao = (db: DatabaseSync, id: string) =>
    JSON.parse((db.prepare('SELECT dados FROM calibracoes WHERE id = ?').get(id) as { dados: string }).dados) as Calibracao

  it('a revisão aberta na versão anterior fica legada: sem pendências novas e com o "como encontrado" do original', () => {
    const { db, d, original } = bancoV8()
    // Antes da migração: a revisão pediria a convecção e calcularia o "como encontrado" de outro jeito
    const antes = calibracao(db, 'k2')
    expect(calculoLegado(antes)).toBe(false)
    const contexto = { padroes: d.emissao.padroes, hoje: hojeLocalIso(), temPesos: true, classe: 'I' as const }
    expect(pendenciasEmissao(antes, contexto)).toContain(
      'Balança classe I: a convecção precisa entrar no cálculo (Opções do cálculo, na Conclusão).',
    )
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const rev = calibracao(db, 'k2')
    expect(rev.calculoLegado).toBe(true)
    expect(calculoLegado(rev)).toBe(true)
    // O resto do registro fica como estava
    const { calculoLegado: _l, ...semMarca } = rev
    expect(semMarca).toEqual(antes)
    expect(pendenciasEmissao(rev, contexto)).toEqual([])
    const doOriginal = calcularCalibracao(original, d.emissao.balanca, d.emissao.padroes)
    const daRevisao = calcularCalibracao(rev, d.emissao.balanca, d.emissao.padroes)
    expect(daRevisao.comoEncontrado!.pontos).toEqual(doOriginal.comoEncontrado!.pontos)
    // (sem a marca, o "como encontrado" ia pela densidade do ar medida, com outros números)
    expect(calcularCalibracao(antes, d.emissao.balanca, d.emissao.padroes).comoEncontrado!.pontos).not.toEqual(
      doOriginal.comoEncontrado!.pontos,
    )
    expect(daRevisao.comoEncontrado!.pendencias).toEqual([])
    // O original não muda; o registro de atividades diz qual
    expect(calibracao(db, 'k1')).toEqual(original)
    expect(
      registros(db)
        .filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
        .map((r) => r.detalhe),
    ).toEqual([
      `A revisão aberta antes desta versão mantém o cálculo da época, sem as regras novas da classe I. Certificado: ${original.numero}.`,
    ])
  })

  it('não marca a revisão de um original desta versão, o rascunho comum nem a revisão já emitida', () => {
    const { db, original } = bancoV8()
    // Original emitido nesta versão (com a convecção nas opções)
    const novo = { ...original, opcoes: { ...OPCOES_CALCULO_PADRAO, conveccao: 'CALCULAR' as const } }
    db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(novo), 'k1')
    const rascunho = { ...calibracao(db, 'k2'), id: 'k3', substituiId: '' }
    db.prepare(
      `INSERT INTO calibracoes (id, status, cliente_id, balanca_id, dados, versao, criado_em, atualizado_em)
       VALUES ('k3', 'RASCUNHO', 'c1', 'b1', ?, 1, ?, ?)`,
    ).run(JSON.stringify(rascunho), EM, EM)
    const antes = db.prepare('SELECT id, dados FROM calibracoes ORDER BY id').all()
    migrar(db)
    expect(db.prepare('SELECT id, dados FROM calibracoes ORDER BY id').all()).toEqual(antes)
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toEqual([])
    // Revisão emitida (SUBSTITUIDO/EMITIDO) de um original legado: já é legada pela própria emissão, não muda
    const outro = bancoV8()
    outro.db.prepare("UPDATE calibracoes SET status = 'EMITIDO' WHERE id = 'k2'").run()
    const emitida = outro.db.prepare("SELECT dados FROM calibracoes WHERE id = 'k2'").get()
    migrar(outro.db)
    expect(outro.db.prepare("SELECT dados FROM calibracoes WHERE id = 'k2'").get()).toEqual(emitida)
  })

  it('pode ser repetida sem falhar nem registrar de novo', () => {
    const { db } = bancoV8()
    migrar(db)
    const depois = calibracao(db, 'k2')
    db.exec('PRAGMA user_version = 8')
    migrar(db)
    expect(calibracao(db, 'k2')).toEqual(depois)
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toHaveLength(1)
  })
})

describe('migração 10: a revisão do POP impressa em cada folha de campo', () => {
  /** Banco na versão 9 com duas revisões do POP e três folhas: antes de todas, entre as duas e depois da segunda. */
  function bancoV9() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 9)
    const pop = db.prepare('INSERT INTO pop_versoes (id, codigo, revisao, data, criado_em) VALUES (?, ?, ?, ?, ?)')
    pop.run(1, 'BALANÇAS-POP-001', '02', '2026-05-01', '2026-05-01T12:00:00.000Z')
    pop.run(2, 'BALANÇAS-POP-001', '03', '2026-10-28', '2026-10-30T09:00:00.000Z')
    const folha = db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, impressa_em, ultima_em)
       VALUES (?, 2026, ?, ?, ?, ?, ?)`,
    )
    folha.run('FC-2026-00001', 1, 'a', 'k1', '2026-04-20T10:00:00.000Z', '2026-11-01T10:00:00.000Z')
    folha.run('FC-2026-00002', 2, 'b', 'k2', '2026-10-30T08:59:59.000Z', '2026-11-01T10:00:00.000Z')
    folha.run('FC-2026-00003', 3, 'c', 'k3', '2026-10-30T09:00:00.000Z', '2026-10-30T09:00:00.000Z')
    return db
  }
  const popDasFolhas = (db: DatabaseSync) =>
    db.prepare('SELECT numero, pop_id FROM folhas_campo ORDER BY numero').all() as Array<{
      numero: string
      pop_id: number | null
    }>

  it('cada folha fica com a revisão vigente na primeira impressão (a reimpressão não conta); antes de todas, nenhuma', () => {
    const db = bancoV9()
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(popDasFolhas(db)).toEqual([
      { numero: 'FC-2026-00001', pop_id: null },
      { numero: 'FC-2026-00002', pop_id: 1 },
      { numero: 'FC-2026-00003', pop_id: 2 },
    ])
  })

  it('pode ser repetida sem mudar o que foi gravado', () => {
    const db = bancoV9()
    migrar(db)
    db.prepare("UPDATE folhas_campo SET pop_id = 1 WHERE numero = 'FC-2026-00003'").run()
    db.exec('PRAGMA user_version = 9')
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(popDasFolhas(db).map((f) => f.pop_id)).toEqual([null, 1, 1])
  })
})

describe('migração 11: a revisão em andamento volta para o cliente do certificado revisado', () => {
  const ENDERECO_NOVO = { logradouro: 'Rua 2', numero: '20', complemento: '', bairro: '', cidade: 'Limeira', uf: 'SP', cep: '' }
  /**
   * Banco na versão 10: o certificado k1 do cliente c1 e a revisão k2 dele, que a troca do dono da balança (antes
   * desta versão) levou para o cliente c2, com o endereço dele; e o rascunho comum k3, que passou junto (é o certo).
   */
  function bancoV10() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 10)
    const cliente = db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES (?, 'PJ', '', ?, '', 1, ?, 1, ?, ?)`,
    )
    cliente.run('c1', 'Mercado Bom Preço', JSON.stringify({ id: 'c1', nome: 'Mercado Bom Preço' }), EM, EM)
    cliente.run('c2', 'Padaria Nova', JSON.stringify({ id: 'c2', nome: 'Padaria Nova', ...ENDERECO_NOVO }), EM, EM)
    inserirBalanca(db, 'b1', { numeroSerie: 'TL-2231', fabricante: 'Toledo', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    db.prepare("UPDATE balancas SET cliente_id = 'c2', dados = json_set(dados, '$.clienteId', 'c2') WHERE id = 'b1'").run()
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, substitui_id, busca, dados, versao, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, 'b1', ?, ?, ?, ?, ?, ?)`,
    )
    const original = {
      id: 'k1',
      status: 'EMITIDO',
      numero: 'CC-2026-00001',
      clienteId: 'c1',
      balancaId: 'b1',
      localEndereco: 'Avenida 1, 100 – Rio Claro/SP',
    }
    const revisao = {
      id: 'k2',
      status: 'RASCUNHO',
      numero: '',
      clienteId: 'c2',
      balancaId: 'b1',
      substituiId: 'k1',
      ordemServico: 'OS 4471',
      localEndereco: 'Rua 2, 20 – Limeira/SP',
      versao: 4,
    }
    const rascunho = { ...revisao, id: 'k3', substituiId: '', versao: 2 }
    inserir.run(
      'k1',
      'EMITIDO',
      original.numero,
      'c1',
      '',
      'cc-2026-00001 mercado bom preco',
      JSON.stringify(original),
      1,
      EM,
      EM,
    )
    inserir.run('k2', 'RASCUNHO', '', 'c2', 'k1', 'os 4471 padaria nova toledo tl-2231', JSON.stringify(revisao), 4, EM, EM)
    inserir.run('k3', 'RASCUNHO', '', 'c2', '', 'os 4471 padaria nova toledo tl-2231', JSON.stringify(rascunho), 2, EM, EM)
    return db
  }
  const linhaCalibracao = (db: DatabaseSync, id: string) => {
    const l = db.prepare('SELECT cliente_id, busca, dados, versao FROM calibracoes WHERE id = ?').get(id) as {
      cliente_id: string
      busca: string
      dados: string
      versao: number
    }
    return { ...l, dados: JSON.parse(l.dados) as Calibracao }
  }

  it('a revisão volta para o cliente e o endereço do certificado revisado; o rascunho comum fica com o novo dono', () => {
    const db = bancoV10()
    const k3 = linhaCalibracao(db, 'k3')
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const k2 = linhaCalibracao(db, 'k2')
    expect(k2.cliente_id).toBe('c1')
    expect(k2.dados).toMatchObject({ clienteId: 'c1', localEndereco: 'Avenida 1, 100 – Rio Claro/SP', versao: 5 })
    // A versão sobe (a tela aberta com a revisão antiga não grava por cima) e a busca acha pelo cliente certo
    expect(k2.versao).toBe(5)
    expect(k2.busca).toBe('os 4471 mercado bom preco toledo tl-2231')
    expect(linhaCalibracao(db, 'k3')).toEqual(k3)
    expect(
      registros(db)
        .filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
        .map((r) => r.detalhe),
    ).toEqual([
      'A revisão aberta voltou para o cliente do certificado revisado (a balança tinha passado para outro cliente). Certificado: CC-2026-00001.',
    ])
  })

  it('o endereço digitado na revisão (não o do novo dono) fica', () => {
    const db = bancoV10()
    db.prepare("UPDATE calibracoes SET dados = json_set(dados, '$.localEndereco', 'Filial Centro') WHERE id = 'k2'").run()
    migrar(db)
    expect(linhaCalibracao(db, 'k2').dados).toMatchObject({ clienteId: 'c1', localEndereco: 'Filial Centro' })
  })

  it('pode ser repetida sem mexer de novo nem registrar de novo', () => {
    const db = bancoV10()
    migrar(db)
    const depois = linhaCalibracao(db, 'k2')
    db.exec('PRAGMA user_version = 10')
    migrar(db)
    expect(linhaCalibracao(db, 'k2')).toEqual(depois)
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toHaveLength(1)
  })
})

describe('migração 12: as balanças de cada lembrete de calibração', () => {
  function bancoV11() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 11)
    db.prepare(
      `INSERT INTO envios (id, calibracao_id, cliente_id, tipo, para, assunto, usuario_id, usuario_nome, em)
       VALUES ('e1', '', 'c1', 'LEMBRETE', 'a@b.com', 'Calibração', 'u1', 'Ana', ?)`,
    ).run(EM)
    return db
  }
  const envios = (db: DatabaseSync) => db.prepare('SELECT id, balancas FROM envios ORDER BY id').all()

  it('acrescenta a coluna; o lembrete de antes fica sem balanças', () => {
    const db = bancoV11()
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(envios(db)).toEqual([{ id: 'e1', balancas: '' }])
  })

  it('pode ser repetida sem falhar nem perder o que foi gravado', () => {
    const db = bancoV11()
    migrar(db)
    db.prepare(`UPDATE envios SET balancas = '["b1"]' WHERE id = 'e1'`).run()
    db.exec('PRAGMA user_version = 11')
    migrar(db)
    expect(envios(db)).toEqual([{ id: 'e1', balancas: '["b1"]' }])
  })
})

describe('migração 13: os endereços recusados de cada envio', () => {
  function bancoV12() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 12)
    db.prepare(
      `INSERT INTO envios (id, calibracao_id, cliente_id, tipo, para, assunto, usuario_id, usuario_nome, em)
       VALUES ('e1', 'k1', 'c1', 'CERTIFICADO', 'a@b.com, c@d.com', 'Certificado', 'u1', 'Ana', ?)`,
    ).run(EM)
    return db
  }
  const envios = (db: DatabaseSync) => db.prepare('SELECT id, para, recusados FROM envios ORDER BY id').all()

  it('acrescenta a coluna; o envio de antes fica como estava, sem recusados', () => {
    const db = bancoV12()
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(envios(db)).toEqual([{ id: 'e1', para: 'a@b.com, c@d.com', recusados: '' }])
  })

  it('pode ser repetida sem falhar nem perder o que foi gravado', () => {
    const db = bancoV12()
    migrar(db)
    db.prepare(`UPDATE envios SET para = 'c@d.com', recusados = '["a@b.com"]' WHERE id = 'e1'`).run()
    db.exec('PRAGMA user_version = 12')
    migrar(db)
    expect(envios(db)).toEqual([{ id: 'e1', para: 'c@d.com', recusados: '["a@b.com"]' }])
  })
})

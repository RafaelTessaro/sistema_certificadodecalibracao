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
// Migração 14: o rascunho já medido antes das regras do POP mantém os mínimos como avisos (a visita já aconteceu).
// Migração 15: a revisão aberta antes da 1.0.3 ganha os padrões da emissão do certificado revisado; a marcada como legada
// de um certificado emitido com as regras do POP passa a segui-las.
// Migração 16: a calibração em andamento já medida (ou com a folha de campo impressa) antes de a descida ser obrigatória
// (1.0.4) fica com ela como aviso e com o método de carregamento gravado.
// Migração 17: a marca de técnico de cada usuário (todos os de antes ganham a marca).
// Migração 19: a calibração em andamento das classes III e IIII ou sem classe, já medida (ou com a folha de campo impressa)
// sem a pressão antes de ela ser obrigatória em toda classe (1.0.5), fica com a falta dela como aviso.
// Migração 22: a calibração em andamento já medida sem a leitura do zero (ou com a folha impressa sem a linha dele) antes
// de ela ser obrigatória (1.0.6) fica com a falta dela como aviso.
// Migração 23: a mensagem padrão do e-mail do certificado, sem mudança, ganha a marca {assinaturaDigital} (1.0.7).
// Migração 24: a tabela dos certificados digitais da empresa, só com os dados públicos (1.0.7).

import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import {
  AVISO_SEM_PRESSAO,
  avisosEmissao,
  calculoLegado,
  calibracaoVazia,
  comMetodoIndicacaoDaClasse,
  CONFIG_PADRAO,
  EMAIL_MENSAGEM_ANTIGA,
  hojeLocalIso,
  metodoIndicacaoDaVisita,
  OPCOES_CALCULO_PADRAO,
  pendenciasEmissao,
} from '#shared/dominio.ts'
import type { Balanca, Calibracao } from '#shared/tipos.ts'
import { exemploClasseI } from './pdf/exemplosCertificado.ts'
import { detalheTrocaIndicador, lerMeta, migrar } from './db.ts'

const EM = '2026-10-01T12:00:00.000Z'
/** Versão do esquema depois de todas as migrações. */
const ULTIMA = 24

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
    // O resto do registro fica como estava (a migração 15 congela os padrões da emissão original)
    const { calculoLegado: _l, padroesCongelados, ...semMarca } = rev
    expect(semMarca).toEqual(antes)
    expect(padroesCongelados).toEqual(original.emissao.padroes)
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
      `A revisão aberta antes desta versão passa a usar os padrões da emissão do certificado revisado (o certificado e as correções da época). Certificado: ${original.numero}.`,
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
    // Só a 9 (o rascunho comum com leituras é marcado pela 14, com os mínimos como avisos)
    migrar(db, 9)
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
    // A 9 e a 15 (os padrões congelados), uma vez cada
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toHaveLength(2)
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

describe('migração 14: a calibração em andamento já medida antes das regras do POP', () => {
  /** Leituras (null = não lida) do erro de indicação, da repetibilidade e da excentricidade. */
  const ensaios = (o: {
    pontos?: Array<number | null>
    repetibilidade?: Array<number | null>
    posicoes?: Array<number | null>
  }) => ({
    indicacao: {
      metodo: 'CRESCENTE',
      retornoZero: null,
      pontos: [0, 10, 20].map((carga, i) => ({ id: `p${i}`, carga, crescente: o.pontos?.[i] ?? null, decrescente: null })),
    },
    repetibilidade: [{ id: 'r1', carga: 15, leituras: o.repetibilidade ?? [] }],
    excentricidade: {
      aplicavel: true,
      carga: 10,
      posicoes: [0, 1, 2, 3, 4].map((i) => ({ rotulo: `P${i + 1}`, leitura: o.posicoes?.[i] ?? null, referencia: null })),
    },
    comoEncontrado: null,
  })
  /**
   * Banco na versão 13 com: k1 (rascunho com 3 leituras a 15 kg, OS 123), k2 (enviado ao signatário, só os pontos lidos,
   * sem OS), k3 (rascunho só com a excentricidade lida, com o nº reservado na folha), k4 (rascunho ainda sem leitura),
   * k5 (emitido) e k6 (revisão aberta de k5, que segue as regras do certificado revisado).
   */
  function bancoV13() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b1', { numeroSerie: 'TL-2231', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    migrar(db, 13)
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, ordem_servico, substitui_id, dados, versao,
                                criado_em, atualizado_em)
       VALUES (?, ?, ?, 'c1', 'b1', ?, ?, ?, 3, ?, ?)`,
    )
    const calibracao = (
      id: string,
      status: string,
      o: { os?: string; substitui?: string; numero?: string; data?: string; minutos: number },
      leituras: Parameters<typeof ensaios>[0],
    ) => {
      const em = new Date(Date.parse(EM) + o.minutos * 60_000).toISOString()
      const dados = {
        id,
        status,
        numero: o.numero ?? '',
        clienteId: 'c1',
        balancaId: 'b1',
        ordemServico: o.os ?? '',
        dataCalibracao: o.data ?? '2026-10-20',
        substituiId: o.substitui ?? '',
        ...ensaios(leituras),
      }
      inserir.run(id, status, o.numero ?? '', o.os ?? '', o.substitui ?? '', JSON.stringify(dados), em, em)
    }
    calibracao('k1', 'RASCUNHO', { os: '123', minutos: 1 }, { pontos: [0, 10, 20], repetibilidade: [15, 15.01, 15] })
    calibracao('k2', 'REVISAO', { data: '2026-10-21', minutos: 2 }, { pontos: [0, 10.01, null] })
    calibracao('k3', 'RASCUNHO', { os: '77', minutos: 3 }, { posicoes: [10, null, null, null, null] })
    calibracao('k4', 'RASCUNHO', { os: '999', minutos: 4 }, { repetibilidade: [null, null] })
    calibracao('k5', 'EMITIDO', { numero: 'CC-2026-00001', minutos: 5 }, { pontos: [0, 10, 20], repetibilidade: [15, 15, 15] })
    calibracao('k6', 'RASCUNHO', { substitui: 'k5', minutos: 6 }, { pontos: [0, 10, 20], repetibilidade: [15, 15, 15] })
    db.prepare(
      `INSERT INTO numeros_reservados (numero, ano, sequencia, calibracao_id, folha, reservado_em, situacao)
       VALUES ('CC-2026-00042', 2026, 42, 'k3', 'FC-2026-00042', ?, 'reservado')`,
    ).run(EM)
    return db
  }
  const dados = (db: DatabaseSync) =>
    Object.fromEntries(
      (
        db.prepare('SELECT id, dados, versao FROM calibracoes ORDER BY id').all() as Array<{
          id: string
          dados: string
          versao: number
        }>
      ).map((l) => [l.id, { ...(JSON.parse(l.dados) as Record<string, unknown>), _versao: l.versao }]),
    )

  it('marca só a calibração em andamento que já tem leituras; o resto do registro fica como estava', () => {
    const db = bancoV13()
    const antes = dados(db)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const depois = dados(db)
    for (const id of ['k1', 'k2', 'k3']) expect(depois[id], id).toEqual({ ...antes[id], minimosComoAviso: true })
    // Sem leitura nenhuma (ainda não medido), emitido e revisão de um emitido: como estavam
    for (const id of ['k4', 'k5', 'k6']) expect(depois[id], id).toEqual(antes[id])
  })

  it('o registro de atividades diz quais: o nº reservado, a OS ou o cliente com a data', () => {
    const db = bancoV13()
    migrar(db)
    expect(
      registros(db)
        .filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
        .map((r) => r.detalhe),
    ).toEqual([
      '3 calibrações em andamento medidas antes desta versão saem com os mínimos do POP como avisos (a visita já aconteceu); as novas seguem as regras. Confira: OS 123, Frigorífico (21/10/2026), CC-2026-00042.',
    ])
    // Uma só
    const uma = bancoV13()
    uma.exec("DELETE FROM calibracoes WHERE id IN ('k2', 'k3')")
    migrar(uma)
    expect(registros(uma).find((r) => r.acao === 'SISTEMA_ATUALIZADO')?.detalhe).toBe(
      'A calibração em andamento medida antes desta versão sai com os mínimos do POP como avisos (a visita já aconteceu); as novas seguem as regras. Confira: OS 123.',
    )
  })

  it('nenhuma medida: não registra nada', () => {
    const db = bancoV13()
    db.exec("DELETE FROM calibracoes WHERE id IN ('k1', 'k2', 'k3')")
    migrar(db)
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toEqual([])
  })

  it('pode ser repetida sem falhar nem registrar de novo', () => {
    const db = bancoV13()
    migrar(db)
    const depois = dados(db)
    db.exec('PRAGMA user_version = 13')
    migrar(db)
    expect(dados(db)).toEqual(depois)
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toHaveLength(1)
  })
})

describe('migração 15: as revisões abertas antes da 1.0.3 e as marcadas como legadas sem ser', () => {
  const JOGO = { id: 'j1', identificacao: 'JP-01', tipo: 'PESOS', certificado: 'LAB-0456', dataCalibracao: '2026-01-10' }
  const SEM_CONVECCAO = { ...OPCOES_CALCULO_PADRAO, conveccao: undefined }
  /**
   * Banco na versão 14 com: o1 (emitido na 1.0.2, com o jogo na emissão) e r1 (revisão dele aberta na 1.0.2, sem os
   * padrões congelados); o2 (emitido pela 1.0.3 de um rascunho da 1.0.1 não regravado: sem a convecção, com as regras
   * do POP e os mínimos como avisos) e r2 (revisão dele, marcada como legada); o3 (emitido na 1.0.1, sem a convecção) e
   * r3 (revisão dele, legada de verdade, já com os padrões); r4 (revisão de o2 emitida: fica como está).
   */
  function bancoV14() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b1', { numeroSerie: 'TL-2231', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    migrar(db, 14)
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, substitui_id, dados, versao, criado_em, atualizado_em)
       VALUES (?, ?, ?, 'c1', 'b1', ?, ?, 4, ?, ?)`,
    )
    const calibracao = (id: string, status: string, numero: string, substitui: string, dados: Record<string, unknown>) =>
      inserir.run(id, status, numero, substitui, JSON.stringify({ id, status, numero, substituiId: substitui, ...dados }), EM, EM)
    calibracao('o1', 'EMITIDO', 'CC-2026-00001', '', { opcoes: OPCOES_CALCULO_PADRAO, emissao: { padroes: [JOGO] } })
    calibracao('r1', 'RASCUNHO', '', 'o1', { opcoes: OPCOES_CALCULO_PADRAO, padroesIds: ['j1'] })
    calibracao('o2', 'EMITIDO', 'CC-2026-00002', '', {
      opcoes: SEM_CONVECCAO,
      minimosComoAviso: true,
      emissao: { padroes: [JOGO], regrasDoPop: true },
    })
    calibracao('r2', 'REVISAO', '', 'o2', { opcoes: SEM_CONVECCAO, calculoLegado: true, padroesCongelados: [JOGO] })
    calibracao('o3', 'EMITIDO', 'CC-2026-00003', '', { opcoes: SEM_CONVECCAO, emissao: { padroes: [JOGO] } })
    calibracao('r3', 'RASCUNHO', '', 'o3', { opcoes: SEM_CONVECCAO, calculoLegado: true, padroesCongelados: [JOGO] })
    calibracao('r4', 'EMITIDO', 'CC-2026-00002-R1', 'o2', {
      opcoes: SEM_CONVECCAO,
      calculoLegado: true,
      emissao: { padroes: [] },
    })
    return db
  }
  const dados = (db: DatabaseSync) =>
    Object.fromEntries(
      (
        db.prepare('SELECT id, dados, versao FROM calibracoes ORDER BY id').all() as Array<{
          id: string
          dados: string
          versao: number
        }>
      ).map((l) => [l.id, { ...(JSON.parse(l.dados) as Record<string, unknown>), _versao: l.versao }]),
    )

  it('a revisão sem os padrões ganha os da emissão; a legada sem ser segue as regras do certificado revisado', () => {
    const db = bancoV14()
    const antes = dados(db)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const depois = dados(db)
    expect(depois.r1).toEqual({ ...antes.r1, padroesCongelados: [JOGO] })
    const { calculoLegado: _l, ...r2 } = antes.r2 as Record<string, unknown>
    expect(depois.r2).toEqual({ ...r2, regrasDoPop: true, minimosComoAviso: true })
    expect(calculoLegado(depois.r2 as unknown as Calibracao)).toBe(false)
    // A revisão legada de verdade, os emitidos e a revisão já emitida: como estavam (sem subir a versão)
    for (const id of ['o1', 'o2', 'o3', 'r3', 'r4']) expect(depois[id], id).toEqual(antes[id])
    expect(
      registros(db)
        .filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
        .map((r) => r.detalhe),
    ).toEqual([
      'A revisão aberta antes desta versão passa a usar os padrões da emissão do certificado revisado (o certificado e as correções da época). Certificado: CC-2026-00001.',
      'A revisão do certificado emitido com as regras do POP segue as regras dele (não o cálculo de antes da classe I). Certificado: CC-2026-00002.',
    ])
  })

  it('pode ser repetida sem mudar nada nem registrar de novo; sem o que ajustar, não registra', () => {
    const db = bancoV14()
    migrar(db)
    const depois = dados(db)
    db.exec('PRAGMA user_version = 14')
    migrar(db)
    expect(dados(db)).toEqual(depois)
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toHaveLength(2)
    const nada = bancoV14()
    nada.exec("DELETE FROM calibracoes WHERE id IN ('r1', 'r2')")
    migrar(nada)
    expect(registros(nada).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toEqual([])
  })
})

describe('migração 16: a calibração em andamento já medida antes de a descida ser obrigatória', () => {
  const OPCOES = { ...OPCOES_CALCULO_PADRAO }
  /** O erro de indicação "crescente e decrescente" com a subida (e a descida, quando dada) em 0, 10 e 30 kg. */
  const indicacao = (subida: boolean, descida = false) => ({
    metodo: 'CRESCENTE_DECRESCENTE',
    retornoZero: null,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos: [0, 10, 30].map((carga, i) => ({
      id: `p${i}`,
      carga,
      pecas: [],
      crescente: subida ? carga : null,
      decrescente: descida ? carga : null,
    })),
  })
  /**
   * Banco na versão 15 com: k1 (rascunho da 1.0.3 medido sem a descida, OS 55), k2 (enviado ao signatário, medido com
   * a descida, com o nº reservado), k3 (rascunho com os mínimos como avisos: a descida já é aviso), k4 (rascunho ainda
   * sem leitura), o5 (emitido na 1.0.3 com as regras do POP) e r6 (revisão de o5 aberta na 1.0.3), r7 (revisão aberta
   * de um certificado de antes das regras: tudo já é aviso).
   */
  function bancoV15() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b1', { numeroSerie: 'TL-2231', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    migrar(db, 15)
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, ordem_servico, substitui_id, dados, versao,
                                criado_em, atualizado_em)
       VALUES (?, ?, ?, 'c1', 'b1', ?, ?, ?, 2, ?, ?)`,
    )
    let minutos = 0
    const calibracao = (id: string, status: string, o: { os?: string; numero?: string; substitui?: string }, dados: object) => {
      const em = new Date(Date.parse(EM) + ++minutos * 60_000).toISOString()
      const k = {
        id,
        status,
        numero: o.numero ?? '',
        clienteId: 'c1',
        balancaId: 'b1',
        ordemServico: o.os ?? '',
        dataCalibracao: '2026-10-20',
        substituiId: o.substitui ?? '',
        opcoes: OPCOES,
        emissao: null,
        repetibilidade: [],
        excentricidade: { aplicavel: true, carga: 10, posicoes: [] },
        comoEncontrado: null,
        ...dados,
      }
      inserir.run(id, status, o.numero ?? '', o.os ?? '', o.substitui ?? '', JSON.stringify(k), em, em)
    }
    calibracao('k1', 'RASCUNHO', { os: '55' }, { indicacao: indicacao(true) })
    calibracao('k2', 'REVISAO', {}, { indicacao: indicacao(true, true) })
    calibracao('k3', 'RASCUNHO', { os: '56' }, { indicacao: indicacao(true), minimosComoAviso: true })
    calibracao('k4', 'RASCUNHO', { os: '57' }, { indicacao: indicacao(false) })
    calibracao(
      'o5',
      'EMITIDO',
      { numero: 'CC-2026-00005' },
      { indicacao: indicacao(true), emissao: { padroes: [], regrasDoPop: true } },
    )
    calibracao('r6', 'RASCUNHO', { substitui: 'o5' }, { indicacao: indicacao(true), regrasDoPop: true })
    calibracao('o8', 'EMITIDO', { numero: 'CC-2026-00008' }, { indicacao: indicacao(true), emissao: { padroes: [] } })
    calibracao('r7', 'RASCUNHO', { substitui: 'o8' }, { indicacao: indicacao(true) })
    db.prepare(
      `INSERT INTO numeros_reservados (numero, ano, sequencia, calibracao_id, folha, reservado_em, situacao)
       VALUES ('CC-2026-00042', 2026, 42, 'k2', 'FC-2026-00042', ?, 'reservado')`,
    ).run(EM)
    return db
  }
  const dados = (db: DatabaseSync) =>
    Object.fromEntries(
      (
        db.prepare('SELECT id, dados, versao FROM calibracoes ORDER BY id').all() as Array<{
          id: string
          dados: string
          versao: number
        }>
      ).map((l) => [l.id, { ...(JSON.parse(l.dados) as Record<string, unknown>), _versao: l.versao }]),
    )

  it('marca a calibração em andamento com leituras (também a revisão aberta); o resto fica como estava', () => {
    const db = bancoV15()
    const antes = dados(db)
    migrar(db, 16)
    expect(versao(db)).toBe(16)
    const depois = dados(db)
    for (const id of ['k1', 'k2', 'r6']) expect(depois[id], id).toEqual({ ...antes[id], descidaComoAviso: true })
    // Os mínimos já como avisos, sem leitura, emitidos e a revisão de um certificado de antes das regras: como estavam
    for (const id of ['k3', 'k4', 'o5', 'o8', 'r7']) expect(depois[id], id).toEqual(antes[id])
    // A marcada: a descida que falta (10 kg) só como aviso; os outros mínimos continuam
    const k1 = { ...calibracaoVazia(), ...(depois.k1 as unknown as Calibracao) }
    const balanca: Pick<Balanca, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'> = {
      unidade: 'kg',
      classe: 'III',
      tipoFaixas: 'UNICA',
      faixas: [{ max: 30, e: 0.01, d: 0.01 }],
    }
    const { resultado } = calcularCalibracao(k1, balanca, [])
    expect(resultado.pendencias.join('\n')).not.toMatch(/descida/)
    expect(resultado.avisos.map((a) => a.mensagem)).toContain(
      'Erro de indicação “crescente e decrescente” sem a leitura de descida em 10,00 kg.',
    )
    expect(calcularCalibracao({ ...k1, descidaComoAviso: undefined }, balanca, []).resultado.pendencias).toContain(
      'Erro de indicação: falta a leitura de descida em 10,00 kg (POP 7.7).',
    )
  })

  it('o registro de atividades diz quais: a OS, o nº reservado ou o certificado revisado', () => {
    const db = bancoV15()
    migrar(db, 16)
    expect(
      registros(db)
        .filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
        .map((r) => r.detalhe),
    ).toEqual([
      '3 calibrações em andamento medidas ou com a folha impressa antes desta versão mantêm o método gravado e saem com a descida que falta no “crescente e decrescente” como aviso (a visita já aconteceu); as novas seguem a regra. Confira: OS 55, CC-2026-00042, revisão do CC-2026-00005.',
    ])
    const uma = bancoV15()
    uma.exec("DELETE FROM calibracoes WHERE id IN ('k2', 'r6')")
    migrar(uma, 16)
    expect(registros(uma).find((r) => r.acao === 'SISTEMA_ATUALIZADO')?.detalhe).toBe(
      'A calibração em andamento medida ou com a folha impressa antes desta versão mantém o método gravado e sai com a descida que falta no “crescente e decrescente” como aviso (a visita já aconteceu); as novas seguem a regra. Confira: OS 55.',
    )
  })

  it('o zero que "Sugerir os pontos" já preenche não conta como visita feita; a repetibilidade e a excentricidade lidas, sim', () => {
    const db = bancoV15()
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, ordem_servico, substitui_id, dados, versao,
                                criado_em, atualizado_em)
       VALUES (?, 'RASCUNHO', '', 'c1', 'b1', ?, '', ?, 2, ?, ?)`,
    )
    const vazia = indicacao(false)
    // Só os pontos sugeridos: o zero com ↑ 0 e ↓ 0, nenhuma carga lida (o "como encontrado" também)
    const soZero = { ...vazia, pontos: vazia.pontos.map((p) => (p.carga === 0 ? { ...p, crescente: 0, decrescente: 0 } : p)) }
    const base = (os: string, extra: object) => ({
      clienteId: 'c1',
      balancaId: 'b1',
      ordemServico: os,
      dataCalibracao: '2026-10-20',
      substituiId: '',
      opcoes: OPCOES,
      emissao: null,
      repetibilidade: [],
      excentricidade: { aplicavel: true, carga: 10, posicoes: [] },
      comoEncontrado: null,
      indicacao: soZero,
      ...extra,
    })
    const linhas: Array<[string, string, object]> = [
      ['z1', '60', {}],
      ['z2', '61', { comoEncontrado: soZero }],
      ['z3', '62', { repetibilidade: [{ id: 'r1', carga: 20, leituras: [20, 20.01, null, null, null] }] }],
      ['z4', '63', { excentricidade: { aplicavel: true, carga: 10, posicoes: [{ id: 'e1', rotulo: '1', leitura: 10 }] } }],
    ]
    for (const [id, os, extra] of linhas) inserir.run(id, os, JSON.stringify({ id, ...base(os, extra) }), EM, EM)
    const antes = dados(db)
    migrar(db, 16)
    const depois = dados(db)
    for (const id of ['z1', 'z2']) expect(depois[id], id).toEqual(antes[id])
    for (const id of ['z3', 'z4']) expect(depois[id], id).toEqual({ ...antes[id], descidaComoAviso: true })
    expect(registros(db).find((r) => r.acao === 'SISTEMA_ATUALIZADO')?.detalhe).toContain('OS 62, OS 63')
  })

  it('a folha de campo impressa antes da atualização também marca (ela trazia o método do rascunho), mesmo sem nada digitado', () => {
    const db = bancoV15()
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, ordem_servico, substitui_id, dados, versao,
                                criado_em, atualizado_em)
       VALUES (?, 'RASCUNHO', '', 'c1', 'b1', ?, '', ?, 2, ?, ?)`,
    )
    // O caso da conferência: classe III com "crescente com descarga" (o que a folha da 1.0.3 imprimiu), nada digitado
    const vazia = { ...indicacao(false), metodo: 'DESCONTINUO' }
    const base = (id: string, os: string) => ({
      id,
      clienteId: 'c1',
      balancaId: 'b1',
      ordemServico: os,
      dataCalibracao: '2026-10-20',
      substituiId: '',
      opcoes: OPCOES,
      emissao: null,
      repetibilidade: [],
      excentricidade: { aplicavel: true, carga: 10, posicoes: [] },
      comoEncontrado: null,
      indicacao: vazia,
    })
    inserir.run('f1', '70', JSON.stringify(base('f1', '70')), EM, EM)
    inserir.run('f2', '71', JSON.stringify(base('f2', '71')), EM, EM)
    inserir.run('f3', '72', JSON.stringify(base('f3', '72')), EM, EM)
    const folha = db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, balanca_id, cliente_id, impressa_por,
         impressa_em, ultima_em, substituida_por, substituida_em) VALUES (?, 2026, ?, ?, ?, 'b1', 'c1', 'Ana', ?, ?, ?, ?)`,
    )
    // f1: a folha da 1.0.3; f2: uma folha substituída por outra (as duas impressas); f3: nenhuma folha
    folha.run('FC-2026-00070', 70, 'calibracao:f1', 'f1', EM, EM, '', '')
    folha.run('FC-2026-00071', 71, 'calibracao:f2:a', 'f2', EM, EM, 'FC-2026-00072', EM)
    folha.run('FC-2026-00072', 72, 'calibracao:f2', 'f2', EM, EM, '', '')
    // Uma folha avulsa (sem rascunho) não marca nada
    folha.run('FC-2026-00073', 73, 'avulsa:1', '', EM, EM, '', '')
    const antes = dados(db)
    migrar(db, 16)
    const depois = dados(db)
    for (const id of ['f1', 'f2']) expect(depois[id], id).toEqual({ ...antes[id], descidaComoAviso: true })
    expect(depois.f3).toEqual(antes.f3)
    expect(registros(db).find((r) => r.acao === 'SISTEMA_ATUALIZADO')?.detalhe).toContain('OS 70, OS 71')
    expect(registros(db).find((r) => r.acao === 'SISTEMA_ATUALIZADO')?.detalhe).not.toContain('OS 72')
    // A marcada fica com o método gravado (a visita), mesmo sem leituras; a sem folha segue a classe
    const balancaIII = { classe: 'III' as const }
    const k = (id: string) => ({ ...calibracaoVazia(), ...(depois[id] as unknown as Calibracao) })
    expect(metodoIndicacaoDaVisita(k('f1'))).toBe(true)
    expect(comMetodoIndicacaoDaClasse(k('f1').indicacao, balancaIII.classe, metodoIndicacaoDaVisita(k('f1'))).metodo).toBe(
      'DESCONTINUO',
    )
    expect(metodoIndicacaoDaVisita(k('f3'))).toBe(false)
    expect(comMetodoIndicacaoDaClasse(k('f3').indicacao, balancaIII.classe, metodoIndicacaoDaVisita(k('f3'))).metodo).toBe(
      'CRESCENTE_DECRESCENTE',
    )
  })

  it('pode ser repetida sem mudar nada nem registrar de novo; sem o que marcar, não registra', () => {
    const db = bancoV15()
    migrar(db, 16)
    const depois = dados(db)
    db.exec('PRAGMA user_version = 15')
    migrar(db, 16)
    expect(dados(db)).toEqual(depois)
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toHaveLength(1)
    const nada = bancoV15()
    nada.exec("DELETE FROM calibracoes WHERE id IN ('k1', 'k2', 'r6')")
    migrar(nada, 16)
    expect(registros(nada).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toEqual([])
  })
})

describe('migração 17: a marca de técnico dos usuários', () => {
  /** Banco na versão 16, com dois usuários (um signatário, outro não). */
  function bancoV16() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 16)
    const inserir = db.prepare(
      `INSERT INTO usuarios (id, login, nome, nivel, senha_hash, ativo, trocar_senha, versao, criado_em, atualizado_em,
                             senha_alterada_em, signatario)
       VALUES (?, ?, ?, ?, 'x', 1, 0, 1, ?, ?, ?, ?)`,
    )
    inserir.run('u1', 'fabio', 'Fábio', 'ADMIN', EM, EM, EM, 1)
    inserir.run('u2', 'lizi', 'Lizi', 'COMUM', EM, EM, EM, 1)
    inserir.run('u3', 'mauricio', 'Maurício', 'COMUM', EM, EM, EM, 0)
    return db
  }
  const marcas = (db: DatabaseSync) =>
    db.prepare('SELECT id, nivel, signatario, tecnico FROM usuarios ORDER BY id').all() as Array<Record<string, unknown>>

  it('todos os usuários de antes ficam técnicos (todos apareciam na lista); o nível e o signatário não mudam', () => {
    const db = bancoV16()
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(marcas(db)).toEqual([
      { id: 'u1', nivel: 'ADMIN', signatario: 1, tecnico: 1 },
      { id: 'u2', nivel: 'COMUM', signatario: 1, tecnico: 1 },
      { id: 'u3', nivel: 'COMUM', signatario: 0, tecnico: 1 },
    ])
  })

  it('pode ser repetida: a marca tirada depois continua tirada', () => {
    const db = bancoV16()
    migrar(db)
    db.exec("UPDATE usuarios SET tecnico = 0 WHERE id = 'u2'")
    db.exec('PRAGMA user_version = 16')
    migrar(db)
    expect(marcas(db).find((u) => u.id === 'u2')).toMatchObject({ tecnico: 0 })
  })
})

describe('migração 18: a OS impressa na folha de campo avulsa', () => {
  const colunas = (db: DatabaseSync) =>
    (db.prepare('PRAGMA table_info(folhas_campo)').all() as Array<{ name: string; dflt_value: string }>).map((c) => c.name)

  it("acrescenta a coluna; as folhas de antes ficam sem OS (''); pode ser repetida", () => {
    const db = new DatabaseSync(':memory:')
    migrar(db, 17)
    expect(colunas(db)).not.toContain('ordem_servico')
    db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, impressa_em, ultima_em)
       VALUES ('FC-2026-00001', 2026, 1, 'avulsa:x', ?, ?)`,
    ).run(EM, EM)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(db.prepare('SELECT numero, ordem_servico FROM folhas_campo').all()).toEqual([
      { numero: 'FC-2026-00001', ordem_servico: '' },
    ])
    db.exec("UPDATE folhas_campo SET ordem_servico = 'OS 77'")
    db.exec('PRAGMA user_version = 17')
    migrar(db)
    expect(db.prepare('SELECT ordem_servico FROM folhas_campo').get()).toEqual({ ordem_servico: 'OS 77' })
  })
})

describe('migração 19: a calibração em andamento sem a pressão, de antes de ela ser obrigatória em toda classe', () => {
  const OPCOES = { ...OPCOES_CALCULO_PADRAO }
  const lida = {
    metodo: 'CRESCENTE_DECRESCENTE',
    retornoZero: null,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos: [0, 10, 30].map((carga, i) => ({ id: `p${i}`, carga, pecas: [], crescente: carga, decrescente: carga })),
  }
  const semLeitura = { ...lida, pontos: lida.pontos.map((p) => ({ ...p, crescente: null, decrescente: null })) }
  const ambiente = (pressao: number | null) => ({
    temperaturaInicial: 22,
    temperaturaFinal: 22.5,
    umidadeInicial: 55,
    umidadeFinal: 56,
    pressao,
  })
  /**
   * Banco na versão 18 com as balanças b3 (classe III), b2 (classe II) e b0 (sem classe) e: p1 (classe III, medida sem
   * a pressão, OS 80), p2 (sem classe, enviada ao signatário só com a folha impressa e o nº reservado), p3 (classe II,
   * medida sem a pressão: já era obrigatória), p4 (medida com a pressão), p5 (sem leitura e sem folha), p6 (os mínimos já
   * como avisos), o7 (emitido na 1.0.4 sem a pressão) e r8 (revisão de o7 aberta na 1.0.4).
   */
  function bancoV18() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b3', { numeroSerie: 'TL-1', classe: 'III', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    inserirBalanca(db, 'b2', { numeroSerie: 'TL-2', classe: 'II', faixas: [{ max: 30, e: 0.001, d: 0.001 }] })
    inserirBalanca(db, 'b0', { numeroSerie: 'TL-0', classe: '', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    migrar(db, 18)
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, ordem_servico, substitui_id, dados, versao,
                                criado_em, atualizado_em)
       VALUES (?, ?, ?, 'c1', ?, ?, ?, ?, 2, ?, ?)`,
    )
    let minutos = 0
    const calibracao = (
      id: string,
      status: string,
      o: { balanca?: string; os?: string; numero?: string; substitui?: string },
      dados: object,
    ) => {
      const em = new Date(Date.parse(EM) + ++minutos * 60_000).toISOString()
      const k = {
        id,
        status,
        numero: o.numero ?? '',
        clienteId: 'c1',
        balancaId: o.balanca ?? 'b3',
        ordemServico: o.os ?? '',
        dataCalibracao: '2026-11-04',
        substituiId: o.substitui ?? '',
        opcoes: OPCOES,
        emissao: null,
        ambiente: ambiente(null),
        repetibilidade: [],
        excentricidade: { aplicavel: true, carga: 10, posicoes: [] },
        comoEncontrado: null,
        indicacao: lida,
        ...dados,
      }
      inserir.run(id, status, o.numero ?? '', o.balanca ?? 'b3', o.os ?? '', o.substitui ?? '', JSON.stringify(k), em, em)
    }
    calibracao('p1', 'RASCUNHO', { os: '80' }, {})
    calibracao('p2', 'REVISAO', { balanca: 'b0' }, { indicacao: semLeitura })
    calibracao('p3', 'RASCUNHO', { balanca: 'b2', os: '81' }, {})
    calibracao('p4', 'RASCUNHO', { os: '82' }, { ambiente: ambiente(927) })
    calibracao('p5', 'RASCUNHO', { os: '83' }, { indicacao: semLeitura })
    calibracao('p6', 'RASCUNHO', { os: '84' }, { minimosComoAviso: true })
    calibracao('o7', 'EMITIDO', { numero: 'CC-2026-00007' }, { emissao: { padroes: [], regrasDoPop: true } })
    calibracao('r8', 'RASCUNHO', { substitui: 'o7' }, { regrasDoPop: true })
    db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, balanca_id, cliente_id, impressa_por,
         impressa_em, ultima_em, substituida_por, substituida_em)
       VALUES ('FC-2026-00042', 2026, 42, 'calibracao:p2', 'p2', 'b0', 'c1', 'Ana', ?, ?, '', '')`,
    ).run(EM, EM)
    db.prepare(
      `INSERT INTO numeros_reservados (numero, ano, sequencia, calibracao_id, folha, reservado_em, situacao)
       VALUES ('CC-2026-00042', 2026, 42, 'p2', 'FC-2026-00042', ?, 'reservado')`,
    ).run(EM)
    return db
  }
  const dados = (db: DatabaseSync) =>
    Object.fromEntries(
      (db.prepare('SELECT id, dados FROM calibracoes ORDER BY id').all() as Array<{ id: string; dados: string }>).map((l) => [
        l.id,
        JSON.parse(l.dados) as Record<string, unknown>,
      ]),
    )

  it('marca a medida ou com a folha impressa sem a pressão (também a revisão aberta); o resto fica como estava', () => {
    const db = bancoV18()
    const antes = dados(db)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const depois = dados(db)
    for (const id of ['p1', 'p2', 'r8']) expect(depois[id], id).toEqual({ ...antes[id], pressaoComoAviso: true })
    // Classe II (já era obrigatória), com a pressão, sem nada medido nem folha, os mínimos já como avisos e o emitido
    for (const id of ['p3', 'p4', 'p5', 'p6', 'o7']) expect(depois[id], id).toEqual(antes[id])
    // A marcada sai sem a pressão, com o aviso; sem a marca, a pressão é pendência
    const contexto = { padroes: [], hoje: '2026-11-09', temPesos: true, classe: 'III' as const }
    const p1 = { ...calibracaoVazia(), ...(depois.p1 as unknown as Calibracao) }
    expect(pendenciasEmissao(p1, contexto).join('\n')).not.toMatch(/pressão/)
    expect(avisosEmissao(p1, contexto)).toEqual([AVISO_SEM_PRESSAO])
    const nova = { ...p1, pressaoComoAviso: undefined }
    expect(pendenciasEmissao(nova, contexto)).toContain(
      'Registre a pressão atmosférica, medida com o barômetro (escolha-o nos padrões; POP 7.5).',
    )
    expect(avisosEmissao(nova, contexto)).toEqual([])
  })

  it('o registro de atividades diz quais; pode ser repetida sem mudar nada nem registrar de novo', () => {
    const db = bancoV18()
    migrar(db)
    const doSistema = () => registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
    expect(doSistema().map((r) => r.detalhe)).toEqual([
      '3 calibrações em andamento medidas ou com a folha impressa antes desta versão, sem a pressão atmosférica, saem sem ela, com um aviso (a visita já aconteceu); nas novas, a pressão é obrigatória em toda classe. Confira: OS 80, CC-2026-00042, revisão do CC-2026-00007.',
    ])
    const depois = dados(db)
    db.exec('PRAGMA user_version = 18')
    migrar(db)
    expect(dados(db)).toEqual(depois)
    expect(doSistema()).toHaveLength(1)
    const nada = bancoV18()
    nada.exec("DELETE FROM calibracoes WHERE id IN ('p1', 'p2', 'r8')")
    migrar(nada)
    expect(registros(nada).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toEqual([])
  })
})

describe('migração 20: as folhas de campo impressas antes da 1.0.5', () => {
  const OPCOES = { ...OPCOES_CALCULO_PADRAO }
  const semLeitura = {
    metodo: 'CRESCENTE_DECRESCENTE',
    retornoZero: null,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos: [],
  }
  /**
   * Banco na versão 19 com as balanças b3 (30 kg × 10 g, classe III: 500e = 5 kg e 2000e = 20 kg) e b0 (sem classe) e:
   * k1 (b3, com a folha impressa), k2 (b0, com a folha), k3 (b3, sem folha), k4 (b3, já marcada) e o5 (emitido, com a
   * folha). E a folha avulsa FC-2026-00009, não ligada. `comPontos`: mais rascunhos da b3 com a folha impressa
   * (FC-2026-00011…) e os pontos do erro de indicação.
   */
  function bancoV19(comPontos: Array<{ id: string; os: string; cargas: number[] }> = []) {
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b3', { numeroSerie: 'TL-1', classe: 'III', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    inserirBalanca(db, 'b0', { numeroSerie: 'TL-0', classe: '', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    migrar(db, 19)
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, ordem_servico, substitui_id, dados, versao,
                                criado_em, atualizado_em)
       VALUES (?, ?, ?, 'c1', ?, ?, '', ?, 2, ?, ?)`,
    )
    let minutos = 0
    const calibracao = (id: string, status: string, o: { balanca?: string; os?: string; numero?: string }, dados: object) => {
      const em = new Date(Date.parse(EM) + ++minutos * 60_000).toISOString()
      const k = {
        id,
        status,
        numero: o.numero ?? '',
        clienteId: 'c1',
        balancaId: o.balanca ?? 'b3',
        ordemServico: o.os ?? '',
        dataCalibracao: '2026-11-04',
        substituiId: '',
        opcoes: OPCOES,
        emissao: null,
        conformidade: { solicitada: false },
        repetibilidade: [],
        excentricidade: { aplicavel: true, carga: 10, posicoes: [] },
        indicacao: semLeitura,
        ...dados,
      }
      inserir.run(id, status, o.numero ?? '', o.balanca ?? 'b3', o.os ?? '', JSON.stringify(k), em, em)
    }
    calibracao('k1', 'RASCUNHO', { os: '90' }, {})
    calibracao('k2', 'RASCUNHO', { balanca: 'b0', os: '91' }, {})
    calibracao('k3', 'RASCUNHO', { os: '92' }, {})
    calibracao('k4', 'RASCUNHO', { os: '93' }, { cargasDoEmaNaFolha: true })
    calibracao('o5', 'EMITIDO', { numero: 'CC-2026-00005' }, { emissao: { padroes: [] } })
    for (const m of comPontos)
      calibracao(
        m.id,
        'RASCUNHO',
        { os: m.os },
        {
          indicacao: {
            ...semLeitura,
            pontos: m.cargas.map((carga, i) => ({
              id: `${m.id}-${i}`,
              carga,
              pecas: [],
              pecasManuais: false,
              crescente: null,
              decrescente: null,
              nivelSubstituicao: 0,
            })),
          },
        },
      )
    const folha = db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, balanca_id, cliente_id, impressa_por,
         impressa_em, ultima_em, substituida_por, substituida_em)
       VALUES (?, 2026, ?, ?, ?, ?, 'c1', 'Ana', ?, ?, '', '')`,
    )
    for (const [n, k, b] of [
      [1, 'k1', 'b3'],
      [2, 'k2', 'b0'],
      [4, 'k4', 'b3'],
      [5, 'o5', 'b3'],
      [9, '', 'b3'],
    ] as const)
      folha.run(`FC-2026-0000${n}`, n, k ? `calibracao:${k}` : `avulsa:${n}`, k, b, EM, EM)
    comPontos.forEach((m, i) => folha.run(`FC-2026-000${11 + i}`, 11 + i, `calibracao:${m.id}`, m.id, 'b3', EM, EM))
    return db
  }
  const dados = (db: DatabaseSync) =>
    Object.fromEntries(
      (db.prepare('SELECT id, dados FROM calibracoes ORDER BY id').all() as Array<{ id: string; dados: string }>).map((l) => [
        l.id,
        JSON.parse(l.dados) as Record<string, unknown>,
      ]),
    )

  it('marca as folhas que já estavam no banco e a calibração em andamento com folha de uma balança com classe', () => {
    const db = bancoV19()
    const antes = dados(db)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(db.prepare('SELECT numero, antes_105 FROM folhas_campo ORDER BY numero').all()).toEqual(
      [1, 2, 4, 5, 9].map((n) => ({ numero: `FC-2026-0000${n}`, antes_105: 1 })),
    )
    // Nenhuma data de atualização: a folha que voltar da pasta é marcada pelo próprio PDF (a cópia de antes da 1.0.5
    // posta no lugar é atualizada depois das folhas impressas na 1.0.5)
    expect(lerMeta(db, 'folhas_antes_105_ate')).toBeUndefined()
    const depois = dados(db)
    expect(depois.k1).toEqual({ ...antes.k1, cargasDoEmaNaFolha: true })
    // Sem classe (sem cargas em que o EMA muda), sem folha, já marcada e o emitido: como estavam
    for (const id of ['k2', 'k3', 'k4', 'o5']) expect(depois[id], id).toEqual(antes[id])
    // A versão não sobe (a tela não grava a marca)
    expect(db.prepare("SELECT versao FROM calibracoes WHERE id = 'k1'").get()).toEqual({ versao: 2 })
    // O registro de atividades diz qual
    expect(
      registros(db)
        .filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
        .map((r) => r.detalhe),
    ).toEqual([
      'A calibração em andamento com a folha de campo impressa antes desta versão continua com as cargas em que o EMA muda em “Sugerir pontos” e na folha nova, como a folha que foi a campo; nas novas, só com a declaração de conformidade. Confira: OS 90.',
    ])
  })

  it('não afirma que a folha trazia as cargas em que o EMA muda quando os pontos do rascunho não as têm', () => {
    // Até a 1.0.4, a folha do rascunho com pontos saía com os pontos dele (sem 5 e 20 kg, elas não estavam no papel)
    const db = bancoV19([
      { id: 'k6', os: '96', cargas: [0, 7.5, 15, 22.5, 30] },
      { id: 'k7', os: '97', cargas: [0, 5, 7.5, 15, 20, 22.5, 30] },
      { id: 'k8', os: '98', cargas: [0, 5, 7.5, 15, 22.5, 30] },
    ])
    const antes = dados(db)
    migrar(db)
    const depois = dados(db)
    // Sem pontos (a folha saiu com as sugestões) ou com todas elas: marcada; com alguma faltando, como estava
    expect(depois.k1).toEqual({ ...antes.k1, cargasDoEmaNaFolha: true })
    expect(depois.k7).toEqual({ ...antes.k7, cargasDoEmaNaFolha: true })
    expect(depois.k6).toEqual(antes.k6)
    expect(depois.k8).toEqual(antes.k8)
    expect(
      registros(db)
        .filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
        .map((r) => r.detalhe),
    ).toEqual([
      '2 calibrações em andamento com a folha de campo impressa antes desta versão continuam com as cargas em que o EMA muda em “Sugerir pontos” e na folha nova, como a folha que foi a campo; nas novas, só com a declaração de conformidade. Confira: OS 90, OS 97.',
    ])
  })

  it('repetida, não marca as folhas impressas depois', () => {
    const db = bancoV19()
    migrar(db)
    db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, impressa_em, ultima_em) VALUES ('FC-2026-00010', 2026, 10, 'avulsa:10', ?, ?)`,
    ).run(EM, EM)
    const depois = dados(db)
    db.exec('PRAGMA user_version = 19')
    migrar(db)
    expect(db.prepare("SELECT antes_105 FROM folhas_campo WHERE numero = 'FC-2026-00010'").get()).toEqual({ antes_105: 0 })
    expect(dados(db)).toEqual(depois)
    expect(registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toHaveLength(1)
  })
})

describe('migração 21: a data prevista impressa na folha de campo avulsa', () => {
  const colunas = (db: DatabaseSync) =>
    (db.prepare('PRAGMA table_info(folhas_campo)').all() as Array<{ name: string }>).map((c) => c.name)

  it("acrescenta a coluna; as folhas de antes ficam sem data (''); pode ser repetida", () => {
    const db = new DatabaseSync(':memory:')
    migrar(db, 20)
    expect(colunas(db)).not.toContain('data_prevista')
    db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, impressa_em, ultima_em)
       VALUES ('FC-2026-00001', 2026, 1, 'avulsa:x', ?, ?)`,
    ).run(EM, EM)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(db.prepare('SELECT numero, data_prevista FROM folhas_campo').all()).toEqual([
      { numero: 'FC-2026-00001', data_prevista: '' },
    ])
    db.exec("UPDATE folhas_campo SET data_prevista = '2026-11-12'")
    db.exec('PRAGMA user_version = 20')
    migrar(db)
    expect(db.prepare('SELECT data_prevista FROM folhas_campo').get()).toEqual({ data_prevista: '2026-11-12' })
  })
})

describe('migração 22: a calibração em andamento sem a leitura do zero, de antes de ela ser obrigatória', () => {
  const OPCOES = { ...OPCOES_CALCULO_PADRAO }
  const ponto = (carga: number, lida: boolean) => ({
    id: `p${carga}`,
    carga,
    pecas: [],
    crescente: lida ? carga : null,
    decrescente: lida ? carga : null,
  })
  const ensaio = (pontos: ReturnType<typeof ponto>[]) => ({
    metodo: 'CRESCENTE_DECRESCENTE',
    retornoZero: null,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos,
  })
  const CARGAS = [5, 10, 15, 20, 30]
  /** As 5 cargas lidas e o zero: em branco (a linha copiada do certificado anterior), lido ou sem a linha. */
  const medida = (zero: 'branco' | 'lido' | 'sem') =>
    ensaio([...(zero === 'sem' ? [] : [ponto(0, zero === 'lido')]), ...CARGAS.map((c) => ponto(c, true))])
  const plano = (comZero: boolean) => ensaio([...(comZero ? [ponto(0, false)] : []), ...CARGAS.map((c) => ponto(c, false))])
  /**
   * Banco na versão 21 com a balança b3 (classe III) e: z1 (medida, o zero em branco, OS 90), z2 (medida, sem a linha do
   * zero), z3 (em revisão, sem leituras, com a folha impressa e o plano sem a linha do zero, nº reservado), z4 (sem
   * leituras, folha impressa com a linha do zero), z5 (medida com o zero lido), z6 (sem leituras nem folha, plano sem a
   * linha), z7 (os mínimos já como avisos), o8 (emitido sem a leitura do zero) e r9 (correção de o8 aberta na 1.0.5).
   */
  function bancoV21() {
    const db = new DatabaseSync(':memory:')
    migrar(db, 1)
    db.prepare(
      `INSERT INTO clientes (id, tipo, documento, nome, busca, ativo, dados, versao, criado_em, atualizado_em)
       VALUES ('c1', 'PJ', '', 'Frigorífico', 'frigorifico', 1, '{}', 1, ?, ?)`,
    ).run(EM, EM)
    inserirBalanca(db, 'b3', { numeroSerie: 'TL-1', classe: 'III', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })
    migrar(db, 21)
    const inserir = db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, ordem_servico, substitui_id, dados, versao,
                                criado_em, atualizado_em)
       VALUES (?, ?, ?, 'c1', 'b3', ?, ?, ?, 2, ?, ?)`,
    )
    let minutos = 0
    const calibracao = (id: string, status: string, o: { os?: string; numero?: string; substitui?: string }, dados: object) => {
      const em = new Date(Date.parse(EM) + ++minutos * 60_000).toISOString()
      const k = {
        id,
        status,
        numero: o.numero ?? '',
        clienteId: 'c1',
        balancaId: 'b3',
        ordemServico: o.os ?? '',
        dataCalibracao: '2026-11-04',
        substituiId: o.substitui ?? '',
        opcoes: OPCOES,
        emissao: null,
        ambiente: { temperaturaInicial: 22, temperaturaFinal: 22.5, umidadeInicial: 55, umidadeFinal: 56, pressao: 927 },
        repetibilidade: [],
        excentricidade: { aplicavel: true, carga: 10, posicoes: [] },
        comoEncontrado: null,
        indicacao: medida('branco'),
        ...dados,
      }
      inserir.run(id, status, o.numero ?? '', o.os ?? '', o.substitui ?? '', JSON.stringify(k), em, em)
    }
    calibracao('z1', 'RASCUNHO', { os: '90' }, {})
    calibracao('z2', 'RASCUNHO', { os: '91' }, { indicacao: medida('sem') })
    calibracao('z3', 'REVISAO', {}, { indicacao: plano(false) })
    calibracao('z4', 'RASCUNHO', { os: '93' }, { indicacao: plano(true) })
    calibracao('z5', 'RASCUNHO', { os: '94' }, { indicacao: medida('lido') })
    calibracao('z6', 'RASCUNHO', { os: '95' }, { indicacao: plano(false) })
    calibracao('z7', 'RASCUNHO', { os: '96' }, { minimosComoAviso: true })
    calibracao('o8', 'EMITIDO', { numero: 'CC-2026-00008' }, { emissao: { padroes: [], regrasDoPop: true } })
    calibracao('r9', 'RASCUNHO', { substitui: 'o8' }, { regrasDoPop: true })
    const folha = db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, balanca_id, cliente_id, impressa_por,
         impressa_em, ultima_em, substituida_por, substituida_em)
       VALUES (?, 2026, ?, ?, ?, 'b3', 'c1', 'Ana', ?, ?, '', '')`,
    )
    folha.run('FC-2026-00043', 43, 'calibracao:z3', 'z3', EM, EM)
    folha.run('FC-2026-00044', 44, 'calibracao:z4', 'z4', EM, EM)
    db.prepare(
      `INSERT INTO numeros_reservados (numero, ano, sequencia, calibracao_id, folha, reservado_em, situacao)
       VALUES ('CC-2026-00043', 2026, 43, 'z3', 'FC-2026-00043', ?, 'reservado')`,
    ).run(EM)
    return db
  }
  const dados = (db: DatabaseSync) =>
    Object.fromEntries(
      (db.prepare('SELECT id, dados FROM calibracoes ORDER BY id').all() as Array<{ id: string; dados: string }>).map((l) => [
        l.id,
        JSON.parse(l.dados) as Record<string, unknown>,
      ]),
    )

  it('marca a medida sem a leitura do zero e a com a folha impressa sem a linha dele (também a correção aberta)', () => {
    const db = bancoV21()
    const antes = dados(db)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const depois = dados(db)
    for (const id of ['z1', 'z2', 'z3', 'r9']) expect(depois[id], id).toEqual({ ...antes[id], zeroComoAviso: true })
    // A folha com a linha do zero, o zero lido, sem nada medido nem folha, os mínimos já como avisos e o emitido
    for (const id of ['z4', 'z5', 'z6', 'z7', 'o8']) expect(depois[id], id).toEqual(antes[id])
    // A marcada sai sem a leitura do zero, com o aviso; sem a marca, é pendência
    const b = { unidade: 'kg', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30, e: 0.01, d: 0.01 }] } as Balanca
    const z1 = { ...calibracaoVazia(), ...(depois.z1 as unknown as Calibracao) }
    const { resultado } = calcularCalibracao(z1, b, [])
    expect(resultado.pendencias.join('\n')).not.toMatch(/leitura do zero/)
    expect(resultado.avisos.map((a) => a.mensagem)).toContain(
      'Erro de indicação sem a leitura do zero, uma das cargas do ensaio (POP 7.7).',
    )
    expect(calcularCalibracao({ ...z1, zeroComoAviso: undefined }, b, []).resultado.pendencias).toContain(
      'Erro de indicação: falta a leitura do zero, a primeira carga do ensaio (POP 7.7).',
    )
  })

  it('o registro de atividades diz quais; pode ser repetida sem mudar nada nem registrar de novo', () => {
    const db = bancoV21()
    migrar(db)
    const doSistema = () => registros(db).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
    expect(doSistema().map((r) => r.detalhe)).toEqual([
      '4 calibrações em andamento medidas, ou com a folha impressa sem a linha do zero, antes desta versão saem sem a leitura do zero, com um aviso (a visita já foi, ou vai ser, sem a linha); nas novas, a leitura do zero é obrigatória. Confira: OS 90, OS 91, CC-2026-00043, revisão do CC-2026-00008.',
    ])
    const depois = dados(db)
    db.exec('PRAGMA user_version = 21')
    migrar(db)
    expect(dados(db)).toEqual(depois)
    expect(doSistema()).toHaveLength(1)
    const nada = bancoV21()
    nada.exec("DELETE FROM calibracoes WHERE id IN ('z1', 'z2', 'z3', 'r9')")
    migrar(nada)
    expect(registros(nada).filter((r) => r.acao === 'SISTEMA_ATUALIZADO')).toEqual([])
  })

  it('cada folha já impressa guarda se saiu sem a linha do zero, pelo plano de onde veio; só a vigente sem ela marca a calibração', () => {
    const db = bancoV21()
    const folha = db.prepare(
      `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, balanca_id, cliente_id, impressa_por,
         impressa_em, ultima_em, substituida_por, substituida_em)
       VALUES (?, 2026, ?, ?, ?, ?, 'c1', 'Ana', ?, ?, ?, '')`,
    )
    // z6 (plano sem a linha do zero, nada medido) com a folha só do cliente ligada: ela trazia as sugeridas, com o zero
    folha.run('FC-2026-00045', 45, 'avulsa:cliente', 'z6', '', EM, EM, '')
    // A da balança: o plano copiado da última emitida até o dia da impressão (o8 tem a linha do zero; o10, não)
    db.prepare(
      `INSERT INTO calibracoes (id, status, numero, cliente_id, balanca_id, ordem_servico, substitui_id, data_emissao, dados,
                                versao, criado_em, atualizado_em)
       VALUES ('o10', 'EMITIDO', 'CC-2026-00010', 'c1', 'b3', '', '', '2026-11-05', ?, 2, ?, ?)`,
    ).run(JSON.stringify({ id: 'o10', status: 'EMITIDO', indicacao: medida('sem'), emissao: { padroes: [] } }), EM, EM)
    db.prepare("UPDATE calibracoes SET data_emissao = '2026-11-02' WHERE id = 'o8'").run()
    folha.run('FC-2026-00046', 46, 'avulsa:b3-antes', '', 'b3', '2026-11-03T15:00:00.000Z', EM, '')
    folha.run('FC-2026-00047', 47, 'avulsa:b3-depois', '', 'b3', '2026-11-06T15:00:00.000Z', EM, '')
    // A de um rascunho excluído e a que voltou da pasta: não se sabe o plano (a visita pode ter sido sem a linha)
    folha.run('FC-2026-00048', 48, 'calibracao:excluido', '', 'b3', EM, EM, '')
    folha.run('FC-2026-00049', 49, 'recuperada:FC-2026-00049', '', '', EM, EM, '')
    // A substituída de z4 (a vigente, FC-44, tem a linha do zero): não foi a campo, não marca z4
    folha.run('FC-2026-00050', 50, 'calibracao:z4:nova', 'z4', 'b3', EM, EM, 'FC-2026-00044')
    db.prepare("UPDATE calibracoes SET dados = json_set(dados, '$.indicacao', json(?)) WHERE id = 'z4'").run(
      JSON.stringify(plano(true)),
    )
    const antes = dados(db)
    migrar(db)
    const semZero = Object.fromEntries(
      (
        db.prepare('SELECT numero, sem_linha_do_zero FROM folhas_campo ORDER BY numero').all() as Array<{
          numero: string
          sem_linha_do_zero: number
        }>
      ).map((l) => [l.numero, l.sem_linha_do_zero]),
    )
    expect(semZero).toEqual({
      'FC-2026-00043': 1,
      'FC-2026-00044': 0,
      'FC-2026-00045': 0,
      'FC-2026-00046': 0,
      'FC-2026-00047': 1,
      'FC-2026-00048': 1,
      'FC-2026-00049': 1,
      'FC-2026-00050': 0,
    })
    // z6: a folha vigente (a do cliente) tinha a linha do zero; a falta da leitura dele continua impedindo
    expect(dados(db).z6).toEqual(antes.z6)
    expect(dados(db).z4).toEqual(antes.z4)
    // A folha impressa depois (nesta versão) nasce com a linha do zero; repetida, a migração não muda as que já estão
    db.prepare("UPDATE folhas_campo SET sem_linha_do_zero = 0 WHERE numero = 'FC-2026-00047'").run()
    db.exec('PRAGMA user_version = 21')
    migrar(db)
    expect(
      (db.prepare("SELECT sem_linha_do_zero AS n FROM folhas_campo WHERE numero = 'FC-2026-00047'").get() as { n: number }).n,
    ).toBe(0)
  })
})

describe('migração 23: a marca {assinaturaDigital} na mensagem padrão do e-mail do certificado', () => {
  /** Banco na versão 22 com as configurações gravadas (`null` = nunca gravadas). */
  function banco(config: Record<string, unknown> | null) {
    const db = new DatabaseSync(':memory:')
    migrar(db, 22)
    if (config) db.prepare("INSERT INTO config (chave, valor) VALUES ('geral', ?)").run(JSON.stringify(config))
    return db
  }
  const gravada = (db: DatabaseSync) => {
    const l = db.prepare("SELECT valor FROM config WHERE chave = 'geral'").get() as { valor: string } | undefined
    return l && (JSON.parse(l.valor) as Record<string, unknown>)
  }

  it('a mensagem padrão de antes, sem mudança, passa a ter a marca; o resto das configurações fica', () => {
    const db = banco({ ...CONFIG_PADRAO, emailMensagem: EMAIL_MENSAGEM_ANTIGA, emailAssunto: 'Assunto da empresa' })
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    expect(gravada(db)).toMatchObject({ emailMensagem: CONFIG_PADRAO.emailMensagem, emailAssunto: 'Assunto da empresa' })
    expect(
      registros(db)
        .filter((r) => r.acao === 'SISTEMA_ATUALIZADO')
        .map((r) => r.detalhe),
    ).toEqual([expect.stringContaining('{assinaturaDigital}')])
  })

  it('a de antes com as quebras do Windows também; a mudada pela empresa fica como está, sem registro', () => {
    const windows = banco({ ...CONFIG_PADRAO, emailMensagem: EMAIL_MENSAGEM_ANTIGA.replace(/\n/g, '\r\n') })
    migrar(windows)
    expect(gravada(windows)?.emailMensagem).toBe(CONFIG_PADRAO.emailMensagem)
    const mudada = `${EMAIL_MENSAGEM_ANTIGA}\nTel. (19) 3524-0000`
    const db = banco({ ...CONFIG_PADRAO, emailMensagem: mudada })
    migrar(db)
    expect(gravada(db)?.emailMensagem).toBe(mudada)
    expect(registros(db)).toEqual([])
  })

  it('sem configurações gravadas (vale o padrão, já com a marca) ou ilegíveis: nada muda', () => {
    const vazio = banco(null)
    migrar(vazio)
    expect(gravada(vazio)).toBeUndefined()
    const ilegivel = new DatabaseSync(':memory:')
    migrar(ilegivel, 22)
    ilegivel.prepare("INSERT INTO config (chave, valor) VALUES ('geral', '{quebrado')").run()
    migrar(ilegivel)
    expect((ilegivel.prepare("SELECT valor FROM config WHERE chave = 'geral'").get() as { valor: string }).valor).toBe(
      '{quebrado',
    )
  })

  it('pode ser repetida sem mudar nada nem registrar de novo', () => {
    const db = banco({ ...CONFIG_PADRAO, emailMensagem: EMAIL_MENSAGEM_ANTIGA })
    migrar(db)
    db.exec('PRAGMA user_version = 22')
    migrar(db)
    expect(gravada(db)?.emailMensagem).toBe(CONFIG_PADRAO.emailMensagem)
    expect(registros(db)).toHaveLength(1)
  })
})

describe('migração 24: os certificados digitais da empresa (só os dados públicos)', () => {
  it('cria a tabela vazia, sem coluna para a chave ou a senha; pode ser repetida sem perder as linhas', () => {
    const db = new DatabaseSync(':memory:')
    migrar(db, 23)
    migrar(db)
    expect(versao(db)).toBe(ULTIMA)
    const colunas = (db.prepare('PRAGMA table_info(certificados_digitais)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(colunas).toEqual([
      'sha256',
      'serie',
      'titular',
      'cnpj',
      'tipo',
      'emissor',
      'valido_de',
      'valido_ate',
      'certificado',
      'cadeia',
      'instalado_em',
      'instalado_por',
      'removido_em',
      'removido_por',
      'motivo',
    ])
    db.prepare(
      `INSERT INTO certificados_digitais (sha256, serie, titular, cnpj, tipo, emissor, valido_de, valido_ate, certificado,
       cadeia, instalado_em) VALUES ('ab', '01', 'EMPRESA LTDA', '12345678000195', 'A1', 'AC', ?, ?, x'3000', '[]', ?)`,
    ).run(EM, EM, EM)
    db.exec('PRAGMA user_version = 23')
    migrar(db)
    expect(db.prepare('SELECT COUNT(*) AS n FROM certificados_digitais').get()).toEqual({ n: 1 })
  })
})

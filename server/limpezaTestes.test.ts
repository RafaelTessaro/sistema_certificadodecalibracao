// "Apagar os testes" (server/limpezaTestes.ts): a classificação de toda tabela do banco, a trava contra o serviço
// ligado, o -wal deixado por um serviço encerrado à força e o que acontece quando algo falha no meio (os PDFs voltam e
// o banco fica como estava). O caminho inteiro, com um banco de verdade, está em ferramentas/apagar-testes.test.ts.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BackupsAutomaticos } from './backup.ts'
import { abrirBanco, type Banco } from './db.ts'
import {
  abrirSozinho,
  apagarTestes,
  ARQUIVO_BANCO,
  confirmou,
  ErroLimpeza,
  levantar,
  type Levantamento,
  META_TESTES_APAGADOS,
  nadaParaApagar,
  TABELAS_APAGADAS,
  TABELAS_MANTIDAS,
  tabelasDesconhecidas,
  tabelasDoBanco,
  textoLevantamento,
  textoRegistro,
} from './limpezaTestes.ts'

let pasta: string
let arquivo: string

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'bcf-limpeza-'))
  arquivo = join(pasta, ARQUIVO_BANCO)
})
afterEach(() => {
  rmSync(pasta, { recursive: true, force: true })
})

/** Abre o banco normal (como o servidor), roda `fn` e fecha. */
function comBanco<T>(fn: (db: Banco) => T): T {
  const db = abrirBanco(arquivo)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

const contar = (db: Banco, tabela: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n)

/** Um envio de e-mail e o contador da numeração (o que apagar sem precisar de cliente e balança). */
function comTestes(db: Banco) {
  db.prepare(
    "INSERT INTO envios (id, calibracao_id, tipo, para, assunto, em) VALUES ('e1', 'k1', 'CERTIFICADO', 'a@b.com', 'Certificado', '2026-10-01T10:00:00Z')",
  ).run()
  db.prepare("INSERT INTO meta (chave, valor) VALUES ('sequencia_2026', '9')").run()
}

/**
 * Cópias do banco de antes na pasta backups: as do sistema (diária e manual) e a do instalador. Devolve os nomes.
 */
function comCopiasDeAntes(): string[] {
  const nomes = [
    'antes-da-versao-1.0.4.db',
    'bc-calibracao_2026-11-03_21-53-22_manual.db',
    'bc-calibracao_2026-11-04_08-10-44_diario.db',
  ]
  mkdirSync(join(pasta, 'backups'), { recursive: true })
  for (const n of nomes) writeFileSync(join(pasta, 'backups', n), `cópia ${n}`)
  return nomes
}

/** PDFs nas duas pastas (como o servidor grava). Devolve os caminhos relativos à pasta de dados. */
function comPdfs(): string[] {
  const arquivos = [
    join('certificados', '2026', 'Certificado-CC-2026-00001.pdf'),
    join('certificados', '2026', 'Certificado-CC-2026-00002.pdf'),
    join('folhas-campo', '2026', 'FC-2026-00001.pdf'),
  ]
  for (const a of arquivos) {
    mkdirSync(join(pasta, a, '..'), { recursive: true })
    writeFileSync(join(pasta, a), `%PDF-1.7 ${a}`)
  }
  return arquivos
}

const aberto = (fn: (db: Banco) => void) => {
  const db = abrirSozinho(arquivo)
  try {
    fn(db)
  } finally {
    db.close()
  }
}

describe('o que a limpeza apaga e o que fica', () => {
  it('toda tabela do banco novo está classificada (manter ou apagar), uma vez só', () => {
    const db = abrirBanco(':memory:')
    try {
      const tabelas = tabelasDoBanco(db)
      const manter = new Set<string>(TABELAS_MANTIDAS)
      const apagar = new Set<string>(TABELAS_APAGADAS)
      // Uma tabela nova (de outra mudança no sistema) precisa entrar numa das listas de limpezaTestes.ts
      expect(tabelas.filter((t) => !manter.has(t) && !apagar.has(t))).toEqual([])
      expect(tabelasDesconhecidas(db)).toEqual([])
      expect([...manter].filter((t) => apagar.has(t))).toEqual([])
      // As listas não citam tabela que não existe
      expect([...manter, ...apagar].filter((t) => !tabelas.includes(t))).toEqual([])
      expect(TABELAS_APAGADAS).toEqual(
        expect.arrayContaining(['calibracoes', 'envios', 'folhas_campo', 'folhas_campo_passagens', 'numeros_reservados']),
      )
      expect(TABELAS_MANTIDAS).toEqual(
        expect.arrayContaining(['usuarios', 'clientes', 'balancas', 'padroes', 'pop_versoes', 'arquivos', 'config', 'auditoria']),
      )
    } finally {
      db.close()
    }
  })

  it('banco com uma tabela que a ferramenta não conhece: recusa e não muda nada', () => {
    comBanco((db) => {
      comTestes(db)
      db.exec('CREATE TABLE outra_coisa (x TEXT)')
    })
    comPdfs()
    aberto((db) => {
      expect(() => levantar(db, pasta)).toThrow(/não conhece \(outra_coisa\).*Nada foi apagado/)
      expect(() => apagarTestes(db, pasta)).toThrow(ErroLimpeza)
    })
    comBanco((db) => expect(contar(db, 'envios')).toBe(1))
    expect(existsSync(join(pasta, 'backups'))).toBe(false)
    expect(readdirSync(join(pasta, 'certificados', '2026'))).toHaveLength(2)
  })

  it('banco sem nada para apagar: não grava cópia, não cria pasta e não mexe no banco', () => {
    comBanco(() => {})
    mkdirSync(join(pasta, 'certificados', '2026'), { recursive: true }) // pasta vazia não conta
    aberto((db) => {
      const l = levantar(db, pasta)
      expect(nadaParaApagar(l)).toBe(true)
      const antes = contar(db, 'auditoria')
      const r = apagarTestes(db, pasta)
      expect(r.apagou).toBe(false)
      expect(contar(db, 'auditoria')).toBe(antes)
    })
    expect(existsSync(join(pasta, 'backups'))).toBe(false)
    expect(readdirSync(pasta).filter((n) => n.startsWith('testes-apagados'))).toEqual([])
  })
})

describe('o certificado digital da empresa (1.0.7)', () => {
  it('a limpeza não toca no cofre (certificado-digital.json) nem na tabela certificados_digitais', () => {
    expect(TABELAS_MANTIDAS).toContain('certificados_digitais')
    comBanco((db) => {
      comTestes(db)
      db.prepare(
        `INSERT INTO certificados_digitais (sha256, serie, titular, cnpj, tipo, emissor, valido_de, valido_ate, certificado,
         cadeia, instalado_em) VALUES ('ab', '01', 'EMPRESA LTDA', '12345678000195', 'A1', 'AC', '2026-01-01', '2027-01-01',
         x'3000', '[]', '2026-11-01T10:00:00Z')`,
      ).run()
    })
    comPdfs()
    const cofre = join(pasta, 'certificado-digital.json')
    writeFileSync(cofre, '{"versao":1,"dados":"cifrado"}')
    aberto((db) => {
      expect(apagarTestes(db, pasta, { agora: new Date(2026, 10, 4, 10, 30) }).apagou).toBe(true)
      expect(contar(db, 'certificados_digitais')).toBe(1)
    })
    expect(readFileSync(cofre, 'utf8')).toBe('{"versao":1,"dados":"cifrado"}')
    expect(existsSync(join(pasta, 'testes-apagados-2026-11-04_10-30', 'certificado-digital.json'))).toBe(false)
  })
})

describe('as cópias do banco feitas antes da limpeza', () => {
  it('saem da pasta backups (vão para testes-apagados/backups, inteiras); a de agora e as outras ficam', () => {
    comBanco(comTestes)
    const copias = comCopiasDeAntes()
    // De uma limpeza anterior e um arquivo que não é cópia do sistema: ficam
    writeFileSync(join(pasta, 'backups', 'antes-de-apagar-testes-2026-10-01_10-00.db'), 'antiga')
    writeFileSync(join(pasta, 'backups', 'anotacoes.txt'), 'texto')
    aberto((db) => {
      expect(levantar(db, pasta).copias).toBe(3)
      const r = apagarTestes(db, pasta, { agora: new Date(2026, 10, 4, 10, 30) })
      expect(r.copiasMovidas).toBe(3)
      expect(r.pastaPdfs).toBe(join(pasta, 'testes-apagados-2026-11-04_10-30'))
      expect(r.registro).toMatch(/ Cópias antigas do banco: testes-apagados-2026-11-04_10-30\.$/)
    })
    expect(readdirSync(join(pasta, 'backups')).sort()).toEqual([
      'anotacoes.txt',
      'antes-de-apagar-testes-2026-10-01_10-00.db',
      'antes-de-apagar-testes-2026-11-04_10-30.db',
    ])
    const destino = join(pasta, 'testes-apagados-2026-11-04_10-30', 'backups')
    expect(readdirSync(destino).sort()).toEqual(copias)
    for (const c of copias) expect(readFileSync(join(destino, c), 'utf8')).toBe(`cópia ${c}`)
    // A tela "Cópias de segurança" fica sem as cópias com os testes, e o servidor faz uma diária nova quando inicia
    comBanco((db) => expect(new BackupsAutomaticos(db, join(pasta, 'backups')).listar()).toEqual([]))
  })

  it('sozinhas não são testes: só com elas, nada é apagado nem movido (o servidor faz cópias novas depois)', () => {
    comBanco(() => {})
    comCopiasDeAntes()
    aberto((db) => {
      const l = levantar(db, pasta)
      expect(l.copias).toBe(3)
      expect(nadaParaApagar(l)).toBe(true)
      expect(apagarTestes(db, pasta).apagou).toBe(false)
    })
    expect(readdirSync(join(pasta, 'backups'))).toHaveLength(3)
    expect(readdirSync(pasta).filter((n) => n.startsWith('testes-apagados'))).toEqual([])
  })
})

describe('o banco em uso', () => {
  it('recusa enquanto outro programa (o serviço) está com o banco aberto, com o comando para parar o serviço', () => {
    comBanco(comTestes)
    const servidor = abrirBanco(arquivo)
    try {
      let erro: unknown
      try {
        abrirSozinho(arquivo).close()
      } catch (e) {
        erro = e
      }
      expect(erro).toBeInstanceOf(ErroLimpeza)
      expect((erro as ErroLimpeza).emUso).toBe(true)
      expect((erro as ErroLimpeza).message).toContain('net stop BCCalibracao')
      expect((erro as ErroLimpeza).message).toContain('Nada foi apagado')
    } finally {
      servidor.close()
    }
    // Com o serviço parado, abre
    aberto((db) => expect(levantar(db, pasta).envios).toBe(1))
  })

  it('enquanto a limpeza está com o banco, ninguém mais lê nem grava nele (o serviço iniciado no meio não entra)', () => {
    comBanco(comTestes)
    const limpeza = abrirSozinho(arquivo)
    const outro = new DatabaseSync(arquivo)
    try {
      outro.exec('PRAGMA busy_timeout = 0')
      expect(() => outro.prepare('SELECT COUNT(*) AS n FROM envios').get()).toThrow(/locked/)
      limpeza.close()
      expect(outro.prepare('SELECT COUNT(*) AS n FROM envios').get()).toEqual({ n: 1 })
    } finally {
      outro.close()
      try {
        limpeza.close()
      } catch {
        // já fechado
      }
    }
    // Fechado, o banco fica sem -wal (tudo gravado no .db) e continua em WAL para o servidor
    expect(existsSync(`${arquivo}-wal`)).toBe(false)
    expect(comBanco((db) => db.prepare('PRAGMA journal_mode').get())).toEqual({ journal_mode: 'wal' })
  })

  it('o -wal deixado pelo serviço encerrado à força entra na conta (e é apagado junto)', () => {
    comBanco(() => {})
    const codigo = `
      import { abrirBanco } from ${JSON.stringify(new URL('./db.ts', import.meta.url).href)}
      const db = abrirBanco(${JSON.stringify(arquivo)})
      db.exec('PRAGMA wal_autocheckpoint = 0')
      db.prepare("INSERT INTO envios (id, tipo, para, assunto, em) VALUES ('w1', 'LEMBRETE', 'a@b.com', 'x', '2026-10-01')").run()
      db.prepare("INSERT INTO meta (chave, valor) VALUES ('sequencia_2026', '4')").run()
      process.kill(process.pid, 'SIGKILL')
    `
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8' })
    expect(r.signal, r.stderr).toBe('SIGKILL')
    expect(existsSync(`${arquivo}-wal`)).toBe(true)
    aberto((db) => {
      const l = levantar(db, pasta)
      expect(l.envios).toBe(1)
      expect(l.contadores).toBe(1)
      expect(apagarTestes(db, pasta).apagadas.envios).toBe(1)
    })
    comBanco((db) => {
      expect(contar(db, 'envios')).toBe(0)
      expect(db.prepare("SELECT chave FROM meta WHERE chave LIKE 'sequencia%'").all()).toEqual([])
    })
  })
})

describe('falhas no meio da limpeza', () => {
  it('um PDF que não sai do lugar (aberto no Windows): os já movidos voltam, o banco fica como estava', () => {
    comBanco(comTestes)
    const pdfs = comPdfs()
    let chamadas = 0
    const renomear = (de: string, para: string) => {
      // A segunda pasta (folhas-campo/2026) está "travada"
      if (++chamadas === 2) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
      renameSync(de, para)
    }
    aberto((db) => {
      expect(() => apagarTestes(db, pasta, { renomear })).toThrow(
        /Feche os PDFs \(e as cópias do banco\) que estiverem abertos.*Nada foi apagado/,
      )
      expect(contar(db, 'envios')).toBe(1)
    })
    for (const a of pdfs) expect(readFileSync(join(pasta, a), 'utf8')).toBe(`%PDF-1.7 ${a}`)
    expect(readdirSync(pasta).filter((n) => n.startsWith('testes-apagados'))).toEqual([])
    comBanco((db) => {
      expect(contar(db, 'envios')).toBe(1)
      expect(db.prepare("SELECT valor FROM meta WHERE chave = 'sequencia_2026'").get()).toEqual({ valor: '9' })
      expect(db.prepare('SELECT 1 FROM meta WHERE chave = ?').get(META_TESTES_APAGADOS)).toBeUndefined()
    })
    // A cópia de antes fica (gravada antes de mover)
    expect(readdirSync(join(pasta, 'backups'))).toHaveLength(1)
  })

  it('o banco recusa apagar: os PDFs voltam para as pastas e nada muda no banco', () => {
    comBanco((db) => {
      comTestes(db)
      db.exec("CREATE TRIGGER nao_apaga BEFORE DELETE ON envios BEGIN SELECT RAISE(ABORT, 'falha simulada'); END")
    })
    const pdfs = comPdfs()
    const copias = comCopiasDeAntes()
    aberto((db) => {
      expect(() => apagarTestes(db, pasta)).toThrow(/falha simulada.*os PDFs voltaram para as pastas/)
    })
    for (const a of pdfs) expect(existsSync(join(pasta, a))).toBe(true)
    // As cópias do banco de antes também voltam (só a cópia de agora fica a mais)
    for (const c of copias) expect(readFileSync(join(pasta, 'backups', c), 'utf8')).toBe(`cópia ${c}`)
    expect(readdirSync(pasta).filter((n) => n.startsWith('testes-apagados'))).toEqual([])
    comBanco((db) => {
      expect(contar(db, 'envios')).toBe(1)
      expect(contar(db, 'auditoria')).toBe(0)
      expect(db.prepare("SELECT valor FROM meta WHERE chave = 'sequencia_2026'").get()).toEqual({ valor: '9' })
    })
  })

  it('duas limpezas no mesmo minuto não se sobrepõem: a cópia e a pasta ganham -2', () => {
    const agora = new Date(2026, 10, 4, 10, 30)
    comBanco(comTestes)
    comPdfs()
    aberto((db) => apagarTestes(db, pasta, { agora }))
    comBanco(comTestes)
    comPdfs()
    aberto((db) => apagarTestes(db, pasta, { agora }))
    expect(readdirSync(join(pasta, 'backups')).sort()).toEqual([
      'antes-de-apagar-testes-2026-11-04_10-30-2.db',
      'antes-de-apagar-testes-2026-11-04_10-30.db',
    ])
    expect(
      readdirSync(pasta)
        .filter((n) => n.startsWith('testes-apagados'))
        .sort(),
    ).toEqual(['testes-apagados-2026-11-04_10-30', 'testes-apagados-2026-11-04_10-30-2'])
  })
})

describe('textos', () => {
  const base: Levantamento = {
    linhas: { folhas_campo_passagens: 0, folhas_campo: 1, numeros_reservados: 1, envios: 1, calibracoes: 4 },
    emitidos: 1,
    cancelados: 1,
    substituidos: 1,
    versoesAnteriores: 1,
    emAndamento: 1,
    folhas: 1,
    numeros: 1,
    envios: 1,
    primeiraEmissao: '2026-10-15',
    ultimaEmissao: '2026-10-15',
    contadores: 1,
    certificados: { pdfs: 1, outros: 0 },
    folhasCampo: { pdfs: 1, outros: 1 },
    copias: 0,
    ficam: { usuarios: 1, clientes: 1, balancas: 1, padroes: 1, pops: 1 },
    apagadosEm: '',
    proximoCertificado: 'CC-2026-00001',
    proximaFolha: 'FC-2026-00001',
  }

  it('singular e plural, o período das emissões e o aviso de uma limpeza anterior', () => {
    expect(textoLevantamento(base)).toEqual([
      'Vai apagar:',
      '  - 1 certificado emitido (em 15/10/2026)',
      '  - 1 certificado cancelado',
      '  - 1 certificado substituído',
      '  - 1 versão anterior de certificado corrigido',
      '  - 1 calibração em andamento',
      '  - 1 folha de campo',
      '  - 1 nº de certificado reservado ou não utilizado',
      '  - 1 registro de e-mail enviado',
      '  - 1 PDF de certificado, 1 PDF de folha de campo e 1 outro arquivo: saem das pastas e vão para a pasta testes-apagados (não são apagados)',
      '',
      'Ficam como estão: 1 usuário (com as assinaturas), 1 cliente, 1 balança, 1 padrão, 1 revisão do POP, os dados da empresa, as configurações e o registro de atividades.',
      '',
      'Depois, o próximo certificado será CC-2026-00001 e a próxima folha de campo, FC-2026-00001.',
      'Antes de apagar, uma cópia do banco é gravada na pasta backups.',
    ])
    const varios = textoLevantamento({
      ...base,
      emitidos: 12,
      cancelados: 0,
      substituidos: 0,
      versoesAnteriores: 2,
      emAndamento: 0,
      folhas: 0,
      numeros: 3,
      envios: 0,
      ultimaEmissao: '2026-11-03',
      certificados: { pdfs: 14, outros: 0 },
      folhasCampo: { pdfs: 0, outros: 0 },
      ficam: { usuarios: 3, clientes: 0, balancas: 2, padroes: 4, pops: 2 },
      apagadosEm: new Date(2026, 10, 4, 23, 50).toISOString(),
    })
    expect(varios.slice(0, 6)).toEqual([
      'Vai apagar:',
      '  - 12 certificados emitidos (de 15/10/2026 a 03/11/2026)',
      '  - 2 versões anteriores de certificados corrigidos',
      '  - 3 nºs de certificado reservados ou não utilizados',
      '  - 14 PDFs de certificados: saem das pastas e vão para a pasta testes-apagados (não são apagados)',
      '',
    ])
    // A data da limpeza anterior no fuso deste computador
    expect(varios).toContain('ATENÇÃO: os testes já foram apagados em 04/11/2026. O que está acima foi feito depois disso.')
    expect(varios).toContain(
      'Ficam como estão: 3 usuários (com as assinaturas), 0 clientes, 2 balanças, 4 padrões, 2 revisões do POP, os dados da empresa, as configurações e o registro de atividades.',
    )
  })

  it('as cópias do banco de antes, na lista do que sai (vão para a pasta testes-apagados)', () => {
    expect(textoLevantamento({ ...base, copias: 1 })).toContain(
      '  - 1 cópia do banco da pasta backups, com os testes: vai para a pasta testes-apagados (não é apagada)',
    )
    expect(textoLevantamento({ ...base, copias: 3 })).toContain(
      '  - 3 cópias do banco da pasta backups, com os testes: vão para a pasta testes-apagados (não são apagadas)',
    )
  })

  it('o registro de atividades com muitos testes e uma numeração comprida: a lista encurta, os caminhos ficam', () => {
    const copia = join('backups', 'antes-de-apagar-testes-2026-11-04_21-56-2.db')
    const pdfs = 'testes-apagados-2026-11-04_21-56-2'
    const muitos: Levantamento = {
      ...base,
      emitidos: 1234,
      cancelados: 56,
      substituidos: 78,
      versoesAnteriores: 90, // um certificado corrigido é um certificado só: não entram na conta
      emAndamento: 345,
      folhas: 1500,
      numeros: 2345,
      envios: 3456,
      proximoCertificado: 'BC/0001-2026',
    }
    const r = textoRegistro(muitos, copia, pdfs, 4)
    expect(r.length).toBeLessThanOrEqual(300)
    expect(r).toMatch(
      /^Testes apagados: 1368 certificados, 345 calibrações em andamento, 1500 folhas de campo, 2345 nºs reservados e 3456 e-mails\. /,
    )
    expect(r).toContain('Próximos nºs: BC/0001-2026 e FC-2026-00001.')
    expect(r.endsWith(` Cópia do banco: ${copia}. PDFs e cópias antigas: ${pdfs}.`)).toBe(true)
    // Contas de dois algarismos, que já passavam dos 300: cabem inteiras
    const comuns = textoRegistro(
      {
        ...base,
        emitidos: 20,
        cancelados: 3,
        substituidos: 5,
        versoesAnteriores: 7,
        emAndamento: 23,
        folhas: 25,
        numeros: 23,
        envios: 23,
      },
      copia,
      pdfs,
      3,
    )
    expect(comuns.length).toBeLessThanOrEqual(300)
    expect(comuns).toBe(
      `Testes apagados: 28 certificados, 23 calibrações em andamento, 25 folhas de campo, 23 nºs reservados e 23 e-mails. Próximos nºs: CC-2026-00001 e FC-2026-00001. Cópia do banco: ${copia}. PDFs e cópias antigas: ${pdfs}.`,
    )
    // Uma numeração de 40 letras (o máximo das configurações) e 8 algarismos: os caminhos continuam inteiros
    const enorme = textoRegistro({ ...muitos, proximoCertificado: `${'X'.repeat(40)}00000001` }, copia, pdfs, 2)
    expect(enorme.length).toBeLessThanOrEqual(300)
    expect(enorme).toMatch(/^Testes apagados: 1368 certificados, 345 calibrações em andamento e outros registros\. /)
    expect(enorme.endsWith(`PDFs e cópias antigas: ${pdfs}.`)).toBe(true)
    // Só as cópias antigas (sem PDFs)
    const semPdfs = { ...base, certificados: { pdfs: 0, outros: 0 }, folhasCampo: { pdfs: 0, outros: 0 } }
    expect(textoRegistro(semPdfs, copia, pdfs, 1).endsWith(` Cópias antigas do banco: ${pdfs}.`)).toBe(true)
  })

  it('o certificado corrigido com o mesmo nº conta uma vez (como na lista); a revisão "-R1" de antes é outro certificado', () => {
    comBanco((db) => {
      const em = '2026-10-01T10:00:00Z'
      db.prepare(
        `INSERT INTO clientes (id, tipo, nome, dados, versao, criado_em, atualizado_em) VALUES ('c1', 'PJ', 'Cliente', '{}', 1, ?, ?)`,
      ).run(em, em)
      db.prepare(
        `INSERT INTO balancas (id, cliente_id, dados, versao, criado_em, atualizado_em) VALUES ('b1', 'c1', '{}', 1, ?, ?)`,
      ).run(em, em)
      const calibracao = (id: string, status: string, seq: number | null, rev: number, numero: string, substitui = '') =>
        db
          .prepare(
            `INSERT INTO calibracoes (id, status, ano, sequencia, revisao, numero, cliente_id, balanca_id, data_emissao,
               substitui_id, dados, versao, criado_em, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, 'c1', 'b1', ?, ?, '{}', 1, ?, ?)`,
          )
          .run(id, status, seq === null ? null : 2026, seq, rev, numero, numero ? '2026-10-15' : '', substitui, em, em)
      calibracao('k1', 'EMITIDO', 1, 0, 'CC-2026-00001')
      // Corrigido duas vezes com o mesmo nº: as duas versões anteriores e a atual são um certificado só
      calibracao('k2a', 'SUBSTITUIDO', 2, 0, 'CC-2026-00002')
      calibracao('k2b', 'SUBSTITUIDO', 2, 1, 'CC-2026-00002', 'k2a')
      calibracao('k2c', 'EMITIDO', 2, 2, 'CC-2026-00002', 'k2b')
      calibracao('k3', 'CANCELADO', 3, 0, 'CC-2026-00003')
      // A revisão de antes da 1.0.4: o substituído e o "-R1" são dois nºs (duas linhas na lista)
      calibracao('k4', 'SUBSTITUIDO', 4, 0, 'CC-2026-00004')
      calibracao('k4r', 'EMITIDO', 4, 1, 'CC-2026-00004-R1', 'k4')
      // A correção do k1 em andamento (sem nº): o k1 continua sendo o certificado
      calibracao('k5', 'RASCUNHO', null, 0, '', 'k1')
    })
    aberto((db) => {
      const l = levantar(db, pasta)
      expect(l).toMatchObject({ emitidos: 3, cancelados: 1, substituidos: 1, versoesAnteriores: 2, emAndamento: 1 })
      expect(textoLevantamento(l).slice(1, 6)).toEqual([
        '  - 3 certificados emitidos (em 15/10/2026)',
        '  - 1 certificado cancelado',
        '  - 1 certificado substituído',
        '  - 2 versões anteriores de certificados corrigidos',
        '  - 1 calibração em andamento',
      ])
      // No registro de atividades, os certificados como o dono os via na lista: k1, k2, k3, k4 e k4-R1
      expect(textoRegistro(l, 'backups/copia.db', '')).toMatch(/^Testes apagados: 5 certificados e 1 calibração em andamento\. /)
    })
  })

  it('só a palavra APAGAR confirma (maiúsculas ou não, com espaços em volta)', () => {
    for (const s of ['APAGAR', 'apagar', ' Apagar \r', 'APAGAR\n']) expect(confirmou(s), s).toBe(true)
    for (const s of ['', 'sim', 'APAGA', 'APAGAR TUDO', 'não', null, undefined]) expect(confirmou(s), String(s)).toBe(false)
  })

  it('o registro de atividades cabe nos 300 caracteres e diz onde ficou a cópia', () => {
    comBanco((db) => {
      comTestes(db)
      for (let i = 2; i <= 250; i++)
        db.prepare(
          "INSERT INTO envios (id, tipo, para, assunto, em) VALUES (?, 'CERTIFICADO', 'a@b.com', 'x', '2026-10-01')",
        ).run(`e${i}`)
    })
    comPdfs()
    aberto((db) => {
      const r = apagarTestes(db, pasta, { agora: new Date(2026, 10, 4, 9, 5) })
      expect(r.registro).toBe(
        `Testes apagados: 250 e-mails. Próximos nºs: CC-2026-00001 e FC-2026-00001. Cópia do banco: ${join('backups', 'antes-de-apagar-testes-2026-11-04_09-05.db')}. PDFs: testes-apagados-2026-11-04_09-05.`,
      )
      expect(r.registro.length).toBeLessThanOrEqual(300)
      expect(db.prepare('SELECT acao, ip, detalhe FROM auditoria').all()).toEqual([
        { acao: 'TESTES_APAGADOS', ip: 'local', detalhe: r.registro },
      ])
    })
  })
})

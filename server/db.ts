import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { separarProcedimento } from '#shared/arquivos.ts'
import { hojeLocalIso, parteSeparada, semIndicadorLegado, textoBusca, textoBuscaBalanca } from '#shared/dominio.ts'
import type { Balanca, Calibracao } from '#shared/tipos.ts'

export type Banco = DatabaseSync

/** SQL, ou uma função para o que o SQL sozinho não faz bem (mexer no JSON de `dados`). Roda dentro da transação. */
type Migracao = string | ((db: Banco) => void)

/**
 * Migrações do esquema. Cada item roda uma única vez, em ordem, controlado
 * pelo `PRAGMA user_version`. Nunca altere um item já publicado — acrescente outro.
 */
const MIGRACOES: Migracao[] = [
  // 1: cadastros, calibrações (certificados), configurações, usuários, sessões e registro de atividades.
  // Cada registro guarda o objeto completo em `dados` (JSON); as colunas ao lado servem para buscar,
  // ordenar e ligar as tabelas. `versao` impede que duas pessoas gravem por cima uma da outra.
  `
  CREATE TABLE clientes (
    id            TEXT PRIMARY KEY,
    tipo          TEXT NOT NULL CHECK (tipo IN ('PF','PJ')),
    documento     TEXT NOT NULL DEFAULT '',     -- só números e letras (CPF ou CNPJ)
    nome          TEXT NOT NULL,
    busca         TEXT NOT NULL DEFAULT '',     -- texto sem acentos para a busca
    ativo         INTEGER NOT NULL DEFAULT 1,
    dados         TEXT NOT NULL,
    versao        INTEGER NOT NULL,
    criado_em     TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
  CREATE INDEX clientes_documento ON clientes(documento);
  CREATE INDEX clientes_nome ON clientes(nome COLLATE NOCASE);

  CREATE TABLE balancas (
    id            TEXT PRIMARY KEY,
    cliente_id    TEXT NOT NULL REFERENCES clientes(id),
    numero_serie  TEXT NOT NULL DEFAULT '',
    busca         TEXT NOT NULL DEFAULT '',
    ativo         INTEGER NOT NULL DEFAULT 1,
    dados         TEXT NOT NULL,
    versao        INTEGER NOT NULL,
    criado_em     TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
  CREATE INDEX balancas_cliente ON balancas(cliente_id);
  CREATE INDEX balancas_serie ON balancas(numero_serie COLLATE NOCASE);

  CREATE TABLE padroes (
    id            TEXT PRIMARY KEY,
    identificacao TEXT NOT NULL,
    tipo          TEXT NOT NULL,
    validade      TEXT NOT NULL DEFAULT '',     -- yyyy-MM-dd (próxima calibração do padrão)
    busca         TEXT NOT NULL DEFAULT '',
    ativo         INTEGER NOT NULL DEFAULT 1,
    dados         TEXT NOT NULL,
    versao        INTEGER NOT NULL,
    criado_em     TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
  CREATE UNIQUE INDEX padroes_identificacao ON padroes(identificacao COLLATE NOCASE);

  -- Calibração = rascunho enquanto é preenchida; ao ser emitida ganha o número e vira certificado.
  CREATE TABLE calibracoes (
    id              TEXT PRIMARY KEY,
    status          TEXT NOT NULL CHECK (status IN ('RASCUNHO','REVISAO','EMITIDO','CANCELADO','SUBSTITUIDO')),
    ano             INTEGER,                    -- ano da numeração (emissão)
    sequencia       INTEGER,                    -- número no ano (emissão)
    revisao         INTEGER NOT NULL DEFAULT 0, -- 0 = original; 1, 2… = revisões que substituem a anterior
    numero          TEXT NOT NULL DEFAULT '',   -- número formatado, como sai no certificado
    cliente_id      TEXT NOT NULL REFERENCES clientes(id),
    balanca_id      TEXT NOT NULL REFERENCES balancas(id),
    ordem_servico   TEXT NOT NULL DEFAULT '',   -- nº da OS no sistema de ordens de serviço da empresa
    data_calibracao TEXT NOT NULL DEFAULT '',   -- yyyy-MM-dd
    data_emissao    TEXT NOT NULL DEFAULT '',   -- yyyy-MM-dd
    proxima         TEXT NOT NULL DEFAULT '',   -- yyyy-MM-dd: próxima calibração combinada com o cliente
    substitui_id    TEXT NOT NULL DEFAULT '',   -- revisão: a calibração emitida que esta substitui
    codigo          TEXT NOT NULL DEFAULT '',   -- código de autenticidade (QR code), único entre os emitidos
    busca           TEXT NOT NULL DEFAULT '',
    dados           TEXT NOT NULL,
    versao          INTEGER NOT NULL,
    criado_em       TEXT NOT NULL,
    atualizado_em   TEXT NOT NULL
  );
  CREATE UNIQUE INDEX calibracoes_numero ON calibracoes(ano, sequencia, revisao) WHERE sequencia IS NOT NULL;
  CREATE INDEX calibracoes_cliente ON calibracoes(cliente_id);
  CREATE INDEX calibracoes_balanca ON calibracoes(balanca_id);
  CREATE INDEX calibracoes_status ON calibracoes(status, data_emissao);
  CREATE UNIQUE INDEX calibracoes_codigo ON calibracoes(codigo) WHERE codigo <> '';

  -- Envios de certificados e lembretes por e-mail (histórico)
  CREATE TABLE envios (
    id             TEXT PRIMARY KEY,
    calibracao_id  TEXT NOT NULL DEFAULT '',
    cliente_id     TEXT NOT NULL DEFAULT '',
    tipo           TEXT NOT NULL,               -- CERTIFICADO | LEMBRETE
    para           TEXT NOT NULL,
    assunto        TEXT NOT NULL,
    usuario_id     TEXT NOT NULL DEFAULT '',
    usuario_nome   TEXT NOT NULL DEFAULT '',
    em             TEXT NOT NULL
  );
  CREATE INDEX envios_calibracao ON envios(calibracao_id);
  CREATE INDEX envios_cliente ON envios(cliente_id);

  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);

  CREATE TABLE usuarios (
    id                TEXT PRIMARY KEY,
    login             TEXT NOT NULL,              -- já normalizado (minúsculo)
    nome              TEXT NOT NULL,
    nivel             TEXT NOT NULL CHECK (nivel IN ('ADMIN','COMUM')),
    senha_hash        TEXT NOT NULL,              -- '$scrypt$ln=15,r=8,p=3$<sal>$<hash>'
    ativo             INTEGER NOT NULL DEFAULT 1,
    trocar_senha      INTEGER NOT NULL DEFAULT 0,
    versao            INTEGER NOT NULL,
    criado_em         TEXT NOT NULL,
    atualizado_em     TEXT NOT NULL,
    senha_alterada_em TEXT NOT NULL,
    ultimo_acesso_em  TEXT NOT NULL DEFAULT '',
    ultimo_acesso_ip  TEXT NOT NULL DEFAULT '',
    signatario        INTEGER NOT NULL DEFAULT 0,  -- pode autorizar (emitir) certificados
    cargo             TEXT NOT NULL DEFAULT '',
    registro          TEXT NOT NULL DEFAULT '',
    assinatura        TEXT NOT NULL DEFAULT ''     -- imagem da assinatura (data URL)
  );
  CREATE UNIQUE INDEX usuarios_login ON usuarios(login);
  CREATE TABLE sessoes (
    id          TEXT PRIMARY KEY,                 -- SHA-256 (hex) do token; o token só existe no cookie
    usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criada_em   INTEGER NOT NULL,                 -- epoch ms
    usada_em    INTEGER NOT NULL,                 -- última atividade (gravada no máx. a cada 5 min)
    expira_em   INTEGER NOT NULL,                 -- limite absoluto
    persistente INTEGER NOT NULL DEFAULT 0,       -- "manter conectado"
    ip          TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX sessoes_usuario ON sessoes(usuario_id);
  CREATE TABLE auditoria (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    em         TEXT NOT NULL,
    usuario_id TEXT NOT NULL DEFAULT '',
    login      TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    acao       TEXT NOT NULL,
    alvo       TEXT NOT NULL DEFAULT '',
    detalhe    TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX auditoria_em ON auditoria(em);
  `,

  // 2: a balança passa a ser identificada pelo indicador (é o nº de série dele que vale) e a plataforma com
  // plaqueta própria vira o dado opcional (ver `semIndicadorLegado`).
  balancaPeloIndicador,

  // 3: folhas de campo impressas (o registro de dados brutos levado ao cliente). Cada folha ganha um nº
  // FC-AAAA-NNNNN, que sai em toda página; a mesma `chave` reimprime com o mesmo nº (a da calibração é
  // 'calibracao:<id>': uma folha por calibração, a mesma em toda reimpressão).
  `
  CREATE TABLE folhas_campo (
    numero        TEXT PRIMARY KEY,             -- FC-2026-00042
    ano           INTEGER NOT NULL,
    sequencia     INTEGER NOT NULL,
    chave         TEXT NOT NULL,
    calibracao_id TEXT NOT NULL DEFAULT '',
    balanca_id    TEXT NOT NULL DEFAULT '',
    cliente_id    TEXT NOT NULL DEFAULT '',
    impressa_por  TEXT NOT NULL DEFAULT '',     -- nome de quem imprimiu a primeira vez
    impressa_em   TEXT NOT NULL,                -- ISO
    impressoes    INTEGER NOT NULL DEFAULT 1,
    ultima_em     TEXT NOT NULL                 -- ISO da última impressão
  );
  CREATE UNIQUE INDEX folhas_campo_sequencia ON folhas_campo(ano, sequencia);
  CREATE UNIQUE INDEX folhas_campo_chave ON folhas_campo(chave);
  CREATE INDEX folhas_campo_calibracao ON folhas_campo(calibracao_id);
  `,

  // 4: o PDF da primeira impressão de cada folha de campo. A reimpressão (o mesmo nº) devolve esse arquivo,
  // byte a byte: dois papéis com o mesmo nº controlado nunca têm conteúdo diferente (ISO/IEC 17025, 7.5).
  `ALTER TABLE folhas_campo ADD COLUMN pdf BLOB;`,

  // 5: histórico das folhas de campo. A "folha nova" (nº novo, com os dados atuais) não apaga a de antes:
  // ela continua ligada à calibração, marcada como substituída (não usada), e a calibração fica com a mais
  // nova. A folha de um rascunho excluído antes desta versão fica livre para ser ligada de novo.
  folhasSubstituidas,

  // 6: (a) o PDF de cada folha de campo passa a ficar num arquivo, em <pasta de dados>/folhas-campo/<ano>/,
  // com o caminho e o sha256 no banco: o banco (e cada cópia de segurança dele) não cresce ≈ 100 KB por
  // folha impressa. Os PDFs guardados no banco pela migração 4 vão para a pasta quando o servidor sobe
  // (`Repositorio.moverPdfsDasFolhas`). (b) As passagens de uma folha de um certificado cancelado (ou de uma
  // cadeia de revisões que terminou cancelada) para a calibração refeita a partir do mesmo papel: o
  // cancelado continua mostrando a folha dele, e ela volta para ele se a refeita for excluída.
  folhasEmArquivo,

  // 7: (a) arquivos guardados no próprio banco (o certificado de calibração de cada padrão e o POP), pelo
  // SHA-256 do conteúdo: o mesmo arquivo enviado de novo não ocupa espaço outra vez, e cada cópia de
  // segurança do banco leva os arquivos junto. (b) As revisões do POP (Procedimento Operacional Padrão): o
  // código e a revisão saem em toda página do certificado. O código que estava nas configurações vira a
  // revisão 1, a menos que fosse o exemplo de fábrica (PT-CAL-01 rev. 0). (c) Os nomes dos anexos de cada envio.
  arquivosEPop,

  // 8: o nº do certificado reservado na impressão da folha de campo (o técnico o copia na etiqueta da balança
  // e o certificado é emitido com ele), da mesma sequência da emissão. Cada nº fica registrado com a situação:
  // reservado, emitido ou não utilizado (com o motivo), e nunca é usado de novo. A folha guarda o nº impresso nela.
  numerosReservados,
]

/** Acrescenta a coluna se a tabela ainda não a tem (a migração pode ser repetida sem erro). */
function acrescentarColuna(db: Banco, tabela: string, coluna: string, definicao: string) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>
  if (!colunas.some((c) => c.name === coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`)
}

/** Migração 5 (ver acima). Repetível: só acrescenta o que falta e só solta folhas de calibrações que não existem. */
function folhasSubstituidas(db: Banco) {
  acrescentarColuna(db, 'folhas_campo', 'pdf', 'BLOB')
  // nº da folha que ficou no lugar desta (vazio = a vigente) e quando
  acrescentarColuna(db, 'folhas_campo', 'substituida_por', "TEXT NOT NULL DEFAULT ''")
  acrescentarColuna(db, 'folhas_campo', 'substituida_em', "TEXT NOT NULL DEFAULT ''")
  db.exec(
    `UPDATE folhas_campo SET calibracao_id = ''
      WHERE calibracao_id <> '' AND calibracao_id NOT IN (SELECT id FROM calibracoes)`,
  )
}

/** Migração 6 (ver acima). Repetível: só acrescenta o que falta. */
function folhasEmArquivo(db: Banco) {
  acrescentarColuna(db, 'folhas_campo', 'pdf_arquivo', "TEXT NOT NULL DEFAULT ''") // <ano>/FC-….pdf
  acrescentarColuna(db, 'folhas_campo', 'pdf_sha256', "TEXT NOT NULL DEFAULT ''")
  db.exec(`
    CREATE TABLE IF NOT EXISTS folhas_campo_passagens (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      numero             TEXT NOT NULL,             -- FC-2026-00042
      de_calibracao_id   TEXT NOT NULL,             -- o certificado cancelado (ou o original da cadeia) que tinha a folha
      para_calibracao_id TEXT NOT NULL,             -- a calibração refeita que passou a usá-la
      substituida_por    TEXT NOT NULL DEFAULT '',  -- como a folha estava na de origem (para voltar igual)
      substituida_em     TEXT NOT NULL DEFAULT '',
      em                 TEXT NOT NULL,
      por                TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS folhas_campo_passagens_numero ON folhas_campo_passagens(numero);
  `)
}

/** Migração 8 (ver acima). Repetível: só cria o que falta. */
function numerosReservados(db: Banco) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS numeros_reservados (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      numero        TEXT NOT NULL,                -- como sai no certificado (CC-2026-00042), formatado na reserva
      ano           INTEGER NOT NULL,             -- ano e nº da sequência dos certificados (a mesma da emissão)
      sequencia     INTEGER NOT NULL,
      calibracao_id TEXT NOT NULL DEFAULT '',     -- '' = de uma folha avulsa ainda não ligada a uma calibração
      folha         TEXT NOT NULL DEFAULT '',     -- folha de campo em que foi impresso a primeira vez (FC-2026-00042)
      reservado_em  TEXT NOT NULL,                -- ISO
      reservado_por TEXT NOT NULL DEFAULT '',
      situacao      TEXT NOT NULL DEFAULT 'reservado' CHECK (situacao IN ('reservado','emitido','nao_utilizado')),
      motivo        TEXT NOT NULL DEFAULT '',     -- por que não foi utilizado
      situacao_em   TEXT NOT NULL DEFAULT '',     -- ISO: quando foi emitido ou ficou não utilizado
      situacao_por  TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS numeros_reservados_sequencia ON numeros_reservados(ano, sequencia);
    CREATE UNIQUE INDEX IF NOT EXISTS numeros_reservados_calibracao ON numeros_reservados(calibracao_id)
      WHERE situacao = 'reservado' AND calibracao_id <> '';
    CREATE INDEX IF NOT EXISTS numeros_reservados_folha ON numeros_reservados(folha);
    CREATE INDEX IF NOT EXISTS numeros_reservados_dono ON numeros_reservados(calibracao_id, situacao);
  `)
  // O nº do certificado impresso na folha ('' = nenhum: folha anterior a esta versão, ou de uma revisão)
  acrescentarColuna(db, 'folhas_campo', 'numero_certificado', "TEXT NOT NULL DEFAULT ''")
}

/** O código de procedimento de exemplo que vinha nas configurações até a versão 1.0.1 (não é o POP de ninguém). */
export const PROCEDIMENTO_EXEMPLO_ANTIGO = 'PT-CAL-01 rev. 0'

/** Migração 7 (ver acima). Repetível: só cria o que falta e só traz o código das configurações uma vez. */
function arquivosEPop(db: Banco) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS arquivos (
      sha256     TEXT PRIMARY KEY,               -- do conteúdo (hex): o mesmo arquivo é guardado uma vez só
      nome       TEXT NOT NULL,                  -- nome do primeiro envio
      tipo       TEXT NOT NULL,                  -- MIME conferido pelo conteúdo
      tamanho    INTEGER NOT NULL,
      conteudo   BLOB NOT NULL,
      criado_em  TEXT NOT NULL,
      criado_por TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS pop_versoes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT, -- a maior é a vigente
      codigo     TEXT NOT NULL,                  -- BALANÇAS-POP-123
      revisao    TEXT NOT NULL,                  -- 00, 01…
      data       TEXT NOT NULL DEFAULT '',       -- yyyy-MM-dd da revisão
      arquivo    TEXT REFERENCES arquivos(sha256), -- null = arquivo ainda não anexado
      observacao TEXT NOT NULL DEFAULT '',
      criado_em  TEXT NOT NULL,
      criado_por TEXT NOT NULL DEFAULT ''
    );
  `)
  acrescentarColuna(db, 'envios', 'anexos', "TEXT NOT NULL DEFAULT ''") // JSON: nomes dos arquivos anexados
  if (db.prepare('SELECT 1 FROM pop_versoes LIMIT 1').get()) return
  const linha = db.prepare("SELECT valor FROM config WHERE chave = 'geral'").get() as { valor: string } | undefined
  let procedimento = ''
  try {
    const t = JSON.parse(linha?.valor ?? '{}')?.textos?.procedimento
    procedimento = typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  } catch {
    /* configuração ilegível: sem POP (o dono registra) */
  }
  if (!procedimento || procedimento === PROCEDIMENTO_EXEMPLO_ANTIGO) return
  const { codigo, revisao } = separarProcedimento(procedimento)
  const em = new Date()
  db.prepare(
    `INSERT INTO pop_versoes (codigo, revisao, data, arquivo, observacao, criado_em, criado_por)
     VALUES (?, ?, ?, NULL, ?, ?, 'Atualização do sistema')`,
  ).run(
    codigo.slice(0, 60),
    revisao.slice(0, 10),
    hojeLocalIso(em),
    'Código e revisão que estavam nas configurações do certificado.',
    em.toISOString(),
  )
  db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)").run(
    em.toISOString(),
    `O procedimento das configurações do certificado (${procedimento}) passou a ser a revisão vigente do POP, em Configurações → Certificado. Anexe lá o arquivo do POP.`.slice(
      0,
      300,
    ),
  )
}

/**
 * Migração 2. Nas balanças com dados do indicador separado, eles passam para a identificação principal e a
 * identificação de antes vai para a plataforma (o nº de série principal só sai do lugar quando o indicador
 * tinha o dele); quando o indicador só repetia a identificação principal, e nas outras, só troca as chaves
 * (ver `semIndicadorLegado`). As colunas de busca e de nº de série acompanham, e o registro de atividades
 * diz quantas e quais balanças mudaram, para conferir. Os certificados emitidos guardam a cópia congelada do
 * cadastro antigo e não mudam: só ganham na busca o nº de série que passou a valer.
 */
function balancaPeloIndicador(db: Banco) {
  const balancas = new Map<string, Balanca>()
  const trocadas: string[] = []
  const gravar = db.prepare('UPDATE balancas SET dados = ?, numero_serie = ?, busca = ? WHERE id = ?')
  for (const l of db.prepare('SELECT id, dados FROM balancas').all() as Array<{ id: string; dados: string }>) {
    const antes = JSON.parse(l.dados) as Balanca
    const b = semIndicadorLegado(antes)
    balancas.set(l.id, b)
    gravar.run(JSON.stringify(b), b.numeroSerie ?? '', textoBuscaBalanca(b), l.id)
    if (CAMPOS_IDENTIFICACAO.some((c) => String(antes[c] ?? '') !== String(b[c] ?? '')))
      trocadas.push(b.numeroSerie || [b.fabricante, b.modelo].filter(Boolean).join(' ') || l.id)
  }
  if (trocadas.length)
    db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)").run(
      new Date().toISOString(),
      detalheTrocaIndicador(trocadas),
    )
  const buscaCalibracao = db.prepare('UPDATE calibracoes SET busca = ? WHERE id = ?')
  const calibracoes = db.prepare('SELECT id, balanca_id, busca, dados FROM calibracoes').all() as Array<{
    id: string
    balanca_id: string
    busca: string
    dados: string
  }>
  for (const l of calibracoes) {
    const k = JSON.parse(l.dados) as Calibracao
    const b = k.emissao?.balanca ?? balancas.get(l.balanca_id)
    if (!b) continue
    const novos = [b.numeroSerie, parteSeparada(b)?.serie]
      .map((x) => textoBusca(x))
      .filter((x) => x && !` ${l.busca} `.includes(` ${x} `))
    if (novos.length) buscaCalibracao.run([l.busca, ...new Set(novos)].filter(Boolean).join(' '), l.id)
  }
}

const CAMPOS_IDENTIFICACAO = [
  'fabricante',
  'modelo',
  'numeroSerie',
  'plataformaFabricante',
  'plataformaModelo',
  'plataformaSerie',
] as const

/** "2 balanças com indicador separado passaram a ser identificadas pelo indicador… Confira: A, B." (até 300 letras) */
export function detalheTrocaIndicador(series: string[]): string {
  const n = series.length
  const texto =
    n === 1
      ? '1 balança com indicador separado passou a ser identificada pelo indicador; os dados de antes ficaram como plataforma. Confira: '
      : `${n} balanças com indicador separado passaram a ser identificadas pelo indicador; os dados de antes ficaram como plataforma. Confira: `
  let lista = ''
  for (const [i, s] of series.entries()) {
    const proximo = `${lista}${i ? ', ' : ''}${s}`
    if (texto.length + proximo.length + 3 > 300) return `${texto}${lista}, …`
    lista = proximo
  }
  return `${texto}${lista}.`
}

export function abrirBanco(arquivo: string): Banco {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true })
  const db = new DatabaseSync(arquivo)
  // busy_timeout primeiro: o servidor e a ferramenta de senha podem abrir ao mesmo tempo um banco ainda
  // sem -wal (o serviço subindo), e passar para WAL também precisa da trava
  db.exec('PRAGMA busy_timeout = 5000')
  ativarWal(db)
  db.exec(`
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `)
  migrar(db)
  return db
}

/**
 * Passa o banco para WAL. Num banco novo (ou numa cópia feita com VACUUM INTO), dois processos convertendo
 * ao mesmo tempo travariam um ao outro: o SQLite recusa um deles na hora, sem esperar, e ele tenta de novo
 * (até 10 s); quando conseguir, o outro já converteu.
 */
function ativarWal(db: Banco) {
  const limite = Date.now() + 10_000
  for (;;) {
    try {
      db.exec('PRAGMA journal_mode = WAL')
      return
    } catch (e) {
      if (Date.now() >= limite || !/database is locked/.test(String((e as Error)?.message))) throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
}

/** Aplica as migrações que faltam (até a `ate`, para os testes montarem um banco de uma versão antiga). */
export function migrar(db: Banco, ate = MIGRACOES.length) {
  const versao = () => Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
  for (let i = versao(); i < Math.min(ate, MIGRACOES.length); i++) {
    transacao(db, () => {
      // Relida já com a trava de escrita (BEGIN IMMEDIATE): o servidor e a ferramenta de senha podem abrir
      // o mesmo banco ao mesmo tempo, e só um deles aplica cada migração
      if (versao() > i) return
      const m = MIGRACOES[i]
      if (typeof m === 'string') db.exec(m)
      else m(db)
      db.exec(`PRAGMA user_version = ${i + 1}`)
    })
  }
}

const emTransacao = new WeakSet<Banco>()

/** Executa `fn` dentro de uma transação; chamadas aninhadas reaproveitam a transação externa. */
export function transacao<T>(db: Banco, fn: () => T): T {
  if (emTransacao.has(db)) return fn()
  db.exec('BEGIN IMMEDIATE')
  emTransacao.add(db)
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  } finally {
    emTransacao.delete(db)
  }
}

export function lerMeta(db: Banco, chave: string): string | undefined {
  const linha = db.prepare('SELECT valor FROM meta WHERE chave = ?').get(chave) as { valor: string } | undefined
  return linha?.valor
}

export function gravarMeta(db: Banco, chave: string, valor: string | number) {
  db.prepare('INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(
    chave,
    String(valor),
  )
}

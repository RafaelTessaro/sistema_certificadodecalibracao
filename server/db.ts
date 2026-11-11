import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { POP_DA_ATUALIZACAO, separarProcedimento } from '#shared/arquivos.ts'
import {
  calculoLegado,
  enderecoCliente,
  formatarDataBr,
  hojeLocalIso,
  minimosDoPopComoAviso,
  parteSeparada,
  semIndicadorLegado,
  textoBusca,
  textoBuscaBalanca,
  textoBuscaCalibracao,
} from '#shared/dominio.ts'
import { folhaDeAntesComCargasDoEma } from '#shared/metrologia/sugestoes.ts'
import type { Balanca, Calibracao, Cliente } from '#shared/tipos.ts'

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

  // 9: a revisão aberta antes do cálculo da classe I, de um certificado emitido antes dele, mantém o cálculo e as
  // exigências da época, como a revisão aberta depois (`calculoLegado`, que o servidor marca ao criar a revisão):
  // sai com os mesmos números do original e não pede um ΔT pesos − ar que nunca foi medido.
  revisoesLegadas,

  // 10: a revisão do POP impressa em cada folha de campo (pop_id; nulo = nenhuma registrada na impressão): o
  // certificado cita o método usado na calibração (ISO/IEC 17025, 7.8.2.1), o da folha, não o vigente na emissão
  // (`popDaCalibracao` em certificados.ts). As folhas já impressas ficam com a vigente na primeira impressão.
  popDasFolhas,

  // 11: a revisão em andamento que a troca do cliente dono da balança levou para o novo dono volta para o cliente
  // do certificado revisado (a revisão corrige aquele certificado e sai em nome dele; ver `verificarLigacoes`).
  revisoesDoClienteRevisado,

  // 12: as balanças que foram em cada lembrete de calibração (JSON com os ids; vazio nos lembretes de antes, que
  // não marcam nenhuma balança em Vencimentos): a balança só aparece avisada pelo lembrete que a incluiu.
  (db) => acrescentarColuna(db, 'envios', 'balancas', "TEXT NOT NULL DEFAULT ''"),

  // 13: os endereços que o servidor de e-mail recusou em cada envio (JSON; vazio nos de antes). `para` guarda só quem
  // recebeu: o servidor que recusa parte dos destinatários entrega aos outros sem dar erro.
  (db) => acrescentarColuna(db, 'envios', 'recusados', "TEXT NOT NULL DEFAULT ''"),

  // 14: a calibração em andamento que já tinha leituras na atualização para as regras do POP (1.0.3) fica com os mínimos
  // como avisos (`minimosComoAviso`): a visita já aconteceu e as leituras não podem ser refeitas. Na 1.0.2 eles eram só
  // avisos. A balança que não pesa corretamente e as leituras fora do esperado continuam pendências; as novas seguem as
  // regras inteiras.
  medidasAntesDasRegras,

  // 15: (a) a revisão aberta antes da 1.0.3 ganha os padrões congelados na emissão do certificado revisado
  // (`padroesCongelados`, que a 1.0.3 grava ao criar a revisão): ela é a mesma visita, e usa o certificado e as
  // correções da época, mesmo com o padrão desativado ou recalibrado depois. (b) A revisão aberta na 1.0.3 de um
  // certificado emitido com as regras do POP a partir de um rascunho da 1.0.1 não regravado (as opções sem a convecção),
  // que nasceu marcada como legada, passa a seguir as regras do POP, como o servidor faz hoje (`calculoLegado`).
  revisoesComOsPadroesDaEmissao,

  // 16: a calibração em andamento (também a revisão de um certificado) que já tinha leituras ou a folha de campo impressa
  // na atualização para a 1.0.4, quando a descida do "crescente e decrescente" passou a ser obrigatória e o método do
  // erro de indicação passou a ser fixo pela classe (POP 7.7), fica com a descida que falta como aviso e com o método
  // gravado, que a folha de antes imprimia (`descidaComoAviso`, `metodoIndicacaoDaVisita`): a visita já aconteceu, ou vai
  // acontecer com essa folha, e na 1.0.3 a descida era opcional. A que já tem os mínimos como avisos não precisa. As
  // novas seguem a regra, e também a sem folha que só tem o zero que "Sugerir os pontos" preenche (nada medido).
  descidasAntesDaRegra,

  // 17: a marca de técnico de calibração de cada usuário (executa as calibrações: só quem a tem aparece em "Técnico que
  // executou"), à parte do nível e da marca de signatário. Todos os usuários de antes ganham a marca (era assim: todos
  // apareciam na lista); o administrador desmarca quem não executa calibrações. 1.0.5.
  (db) => acrescentarColuna(db, 'usuarios', 'tecnico', 'INTEGER NOT NULL DEFAULT 1'),

  // 18: a OS (ordem de serviço) impressa na folha de campo avulsa (a do cliente com a balança ainda não cadastrada): ao
  // ligar a folha a uma calibração sem OS, ela passa para a calibração ('' nas outras folhas e nas de antes). 1.0.5.
  (db) => acrescentarColuna(db, 'folhas_campo', 'ordem_servico', "TEXT NOT NULL DEFAULT ''"),

  // 19: a calibração em andamento (também a revisão de um certificado) nas classes III e IIII ou sem classe que já tinha
  // leituras ou a folha de campo impressa, sem a pressão atmosférica, na atualização para a 1.0.5, quando a pressão
  // passou a ser obrigatória em toda classe (POP 7.5; antes, só nas classes I e II), fica com a falta dela como aviso
  // (`pressaoComoAviso`): a visita já aconteceu, ou vai acontecer com a folha que dizia "opcional". As novas seguem a
  // regra. A que já tem os mínimos como avisos não precisa.
  pressoesAntesDaRegra,

  // 20: as folhas de campo impressas até a 1.0.4 (`antes_105`; a que voltar da pasta das folhas é marcada pelo próprio
  // PDF, sem a marca das regras da 1.0.5: `Repositorio.recuperarFolhasDaPasta`): a da balança das classes III e IIII ou
  // sem classe dizia "Pressão, opcional" (a em branco, "obrigatória na classe II"), e as sugestões traziam sempre as
  // cargas em que o EMA muda (a em branco mandava aplicá-las). A folha dessas ligada depois a uma calibração deixa a falta
  // da pressão como aviso e mantém as cargas em "Sugerir pontos" e na folha nova (`Repositorio.vincularFolhaCampo`). A
  // calibração em andamento que já tem uma folha impressa fica com as cargas (`cargasDoEmaNaFolha`): as da folha que foi
  // (ou vai) a campo, quando os pontos dela não desmentem (`folhaDeAntesComCargasDoEma`: a folha do rascunho com pontos
  // saía com os pontos dele). 1.0.5.
  folhasAntesDa105,

  // 21: a data prevista da visita impressa na folha de campo avulsa (a do cliente com a balança em branco, ou a da
  // balança): ao ligar a folha a uma calibração que ainda tem a data do dia em que foi criada, ela passa para a
  // calibração; com outra data, a tela avisa para conferir ('' nas outras folhas e nas impressas antes). 1.0.6.
  (db) => acrescentarColuna(db, 'folhas_campo', 'data_prevista', "TEXT NOT NULL DEFAULT ''"),
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
      folha         TEXT NOT NULL DEFAULT '',     -- folha de campo atual do nº (FC-2026-00042): a última impressa com ele, ou a ligada
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

/**
 * Migração 9 (ver acima). Repetível: só marca a revisão aberta (rascunho ou em revisão) de um original legado que
 * ainda não está marcada; a regra é a mesma de `Repositorio.criarCalibracao`. O registro de atividades diz quais.
 */
function revisoesLegadas(db: Banco) {
  const abertas = db
    .prepare(
      `SELECT r.id, r.dados, o.dados AS original FROM calibracoes r JOIN calibracoes o ON o.id = r.substitui_id
        WHERE r.substitui_id <> '' AND r.status IN ('RASCUNHO','REVISAO')`,
    )
    .all() as Array<{ id: string; dados: string; original: string }>
  const gravar = db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
  const marcadas: string[] = []
  for (const l of abertas) {
    const k = JSON.parse(l.dados) as Calibracao
    const original = JSON.parse(l.original) as Calibracao
    if (k.calculoLegado === true || !calculoLegado({ ...original, opcoes: original.opcoes ?? {} })) continue
    gravar.run(JSON.stringify({ ...k, calculoLegado: true }), l.id)
    marcadas.push(original.numero || l.id)
  }
  if (marcadas.length)
    db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)").run(
      new Date().toISOString(),
      detalheLista(
        marcadas.length === 1
          ? 'A revisão aberta antes desta versão mantém o cálculo da época, sem as regras novas da classe I. Certificado: '
          : `${marcadas.length} revisões abertas antes desta versão mantêm o cálculo da época, sem as regras novas da classe I. Certificados: `,
        marcadas,
      ),
    )
}

/**
 * Migração 14 (ver acima). Repetível: só marca a calibração em andamento (rascunho ou em revisão), que não é revisão de
 * um certificado (essa segue as regras do revisado), com alguma leitura e ainda sem a marca. Não sobe a versão: a marca
 * não muda nada do que a tela grava. O registro de atividades diz quais.
 */
function medidasAntesDasRegras(db: Banco) {
  const linhas = db
    .prepare(
      `SELECT k.id, k.dados, c.nome AS cliente,
              (SELECT n.numero FROM numeros_reservados n
                WHERE n.calibracao_id = k.id AND n.situacao = 'reservado' ORDER BY n.id DESC LIMIT 1) AS reservado
         FROM calibracoes k LEFT JOIN clientes c ON c.id = k.cliente_id
        WHERE k.status IN ('RASCUNHO','REVISAO') AND k.substitui_id = ''
        ORDER BY k.criado_em, k.id`,
    )
    .all() as Array<{ id: string; dados: string; cliente: string | null; reservado: string | null }>
  const gravar = db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
  const marcadas: string[] = []
  for (const l of linhas) {
    const k = JSON.parse(l.dados) as Calibracao
    if (k.minimosComoAviso === true || !temLeitura(k)) continue
    gravar.run(JSON.stringify({ ...k, minimosComoAviso: true }), l.id)
    const os = String(k.ordemServico ?? '').trim()
    marcadas.push(
      l.reservado ||
        (os ? `OS ${os}` : `${l.cliente || 'Cliente'}${k.dataCalibracao ? ` (${formatarDataBr(k.dataCalibracao)})` : ''}`),
    )
  }
  if (marcadas.length)
    db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)").run(
      new Date().toISOString(),
      detalheLista(
        marcadas.length === 1
          ? 'A calibração em andamento medida antes desta versão sai com os mínimos do POP como avisos (a visita já aconteceu); as novas seguem as regras. Confira: '
          : `${marcadas.length} calibrações em andamento medidas antes desta versão saem com os mínimos do POP como avisos (a visita já aconteceu); as novas seguem as regras. Confira: `,
        marcadas,
      ),
    )
}

/**
 * Migração 16 (ver acima). Repetível: só marca a calibração em andamento (rascunho ou em revisão, também a revisão de um
 * certificado) com alguma leitura medida (`temLeituraMedida`: o zero que "Sugerir os pontos" já preenche não conta) ou
 * com uma folha de campo impressa (a da 1.0.3 trazia o método do rascunho), ainda sem a marca e sem os mínimos como
 * avisos (`minimosDoPopComoAviso`, onde a descida que falta já é aviso e o método também é o gravado). Não sobe a versão:
 * a marca não muda nada do que a tela grava. O registro de atividades diz quais.
 */
function descidasAntesDaRegra(db: Banco) {
  const linhas = db
    .prepare(
      `SELECT k.id, k.dados, c.nome AS cliente, o.numero AS revisado,
              (SELECT n.numero FROM numeros_reservados n
                WHERE n.calibracao_id = k.id AND n.situacao = 'reservado' ORDER BY n.id DESC LIMIT 1) AS reservado,
              EXISTS (SELECT 1 FROM folhas_campo f WHERE f.calibracao_id = k.id) AS com_folha
         FROM calibracoes k LEFT JOIN clientes c ON c.id = k.cliente_id
              LEFT JOIN calibracoes o ON o.id = k.substitui_id AND k.substitui_id <> ''
        WHERE k.status IN ('RASCUNHO','REVISAO')
        ORDER BY k.criado_em, k.id`,
    )
    .all() as Array<{
    id: string
    dados: string
    cliente: string | null
    revisado: string | null
    reservado: string | null
    com_folha: number
  }>
  const gravar = db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
  const marcadas: string[] = []
  for (const l of linhas) {
    const k = JSON.parse(l.dados) as Calibracao
    if (
      k.descidaComoAviso === true ||
      !(temLeituraMedida(k) || Number(l.com_folha) === 1) ||
      minimosDoPopComoAviso({ ...k, opcoes: k.opcoes ?? {} })
    )
      continue
    gravar.run(JSON.stringify({ ...k, descidaComoAviso: true }), l.id)
    const os = String(k.ordemServico ?? '').trim()
    marcadas.push(
      l.revisado
        ? `revisão do ${l.revisado}`
        : l.reservado ||
            (os ? `OS ${os}` : `${l.cliente || 'Cliente'}${k.dataCalibracao ? ` (${formatarDataBr(k.dataCalibracao)})` : ''}`),
    )
  }
  if (marcadas.length)
    db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)").run(
      new Date().toISOString(),
      detalheLista(
        marcadas.length === 1
          ? 'A calibração em andamento medida ou com a folha impressa antes desta versão mantém o método gravado e sai com a descida que falta no “crescente e decrescente” como aviso (a visita já aconteceu); as novas seguem a regra. Confira: '
          : `${marcadas.length} calibrações em andamento medidas ou com a folha impressa antes desta versão mantêm o método gravado e saem com a descida que falta no “crescente e decrescente” como aviso (a visita já aconteceu); as novas seguem a regra. Confira: `,
        marcadas,
      ),
    )
}

/**
 * Migração 19 (ver acima). Repetível: só marca a calibração em andamento (rascunho ou em revisão, também a revisão de um
 * certificado) de uma balança das classes III e IIII ou sem classe, sem a pressão, com alguma leitura medida
 * (`temLeituraMedida`) ou com uma folha de campo impressa, ainda sem a marca e sem os mínimos como avisos
 * (`minimosDoPopComoAviso`, onde a falta da pressão já é aviso). Não sobe a versão: a marca não muda nada do que a tela
 * grava. O registro de atividades diz quais.
 */
function pressoesAntesDaRegra(db: Banco) {
  const linhas = db
    .prepare(
      `SELECT k.id, k.dados, b.dados AS balanca, c.nome AS cliente, o.numero AS revisado,
              (SELECT n.numero FROM numeros_reservados n
                WHERE n.calibracao_id = k.id AND n.situacao = 'reservado' ORDER BY n.id DESC LIMIT 1) AS reservado,
              EXISTS (SELECT 1 FROM folhas_campo f WHERE f.calibracao_id = k.id) AS com_folha
         FROM calibracoes k LEFT JOIN clientes c ON c.id = k.cliente_id
              LEFT JOIN balancas b ON b.id = k.balanca_id
              LEFT JOIN calibracoes o ON o.id = k.substitui_id AND k.substitui_id <> ''
        WHERE k.status IN ('RASCUNHO','REVISAO')
        ORDER BY k.criado_em, k.id`,
    )
    .all() as Array<{
    id: string
    dados: string
    balanca: string | null
    cliente: string | null
    revisado: string | null
    reservado: string | null
    com_folha: number
  }>
  const gravar = db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
  const marcadas: string[] = []
  for (const l of linhas) {
    const k = JSON.parse(l.dados) as Calibracao
    const classe = l.balanca ? (JSON.parse(l.balanca) as Partial<Balanca>).classe : undefined
    const pressao = k.ambiente?.pressao
    if (
      k.pressaoComoAviso === true ||
      classe === 'I' ||
      classe === 'II' ||
      (typeof pressao === 'number' && Number.isFinite(pressao)) ||
      !(temLeituraMedida(k) || Number(l.com_folha) === 1) ||
      minimosDoPopComoAviso({ ...k, opcoes: k.opcoes ?? {} })
    )
      continue
    gravar.run(JSON.stringify({ ...k, pressaoComoAviso: true }), l.id)
    const os = String(k.ordemServico ?? '').trim()
    marcadas.push(
      l.revisado
        ? `revisão do ${l.revisado}`
        : l.reservado ||
            (os ? `OS ${os}` : `${l.cliente || 'Cliente'}${k.dataCalibracao ? ` (${formatarDataBr(k.dataCalibracao)})` : ''}`),
    )
  }
  if (marcadas.length)
    db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)").run(
      new Date().toISOString(),
      detalheLista(
        marcadas.length === 1
          ? 'A calibração em andamento medida ou com a folha impressa antes desta versão, sem a pressão atmosférica, sai sem ela, com um aviso (a visita já aconteceu); nas novas, a pressão é obrigatória em toda classe. Confira: '
          : `${marcadas.length} calibrações em andamento medidas ou com a folha impressa antes desta versão, sem a pressão atmosférica, saem sem ela, com um aviso (a visita já aconteceu); nas novas, a pressão é obrigatória em toda classe. Confira: `,
        marcadas,
      ),
    )
}

/**
 * Migração 20 (ver acima). Repetível: a coluna e a marca nas folhas que já estavam no banco (só quando a coluna nasce).
 * A folha que voltar depois da pasta das folhas (o banco veio de uma cópia anterior à impressão dela) é marcada pelo
 * próprio PDF, não pela data: uma cópia de antes da 1.0.5 posta no lugar é atualizada depois das folhas impressas na
 * 1.0.5 (`folhaImpressaComRegrasDa105`). Marca a calibração em andamento (rascunho ou em revisão, também a revisão de
 * um certificado) com uma folha de campo impressa, de uma balança com cargas em que o EMA muda (com classe), ainda sem a
 * marca, sem pontos no erro de indicação (a folha saiu com as sugestões, que as traziam) ou com todas elas entre os
 * pontos (`folhaDeAntesComCargasDoEma`): com pontos sem alguma, a folha saiu com esses pontos, sem elas. Não sobe a
 * versão: a marca não muda nada do que a tela grava. O registro de atividades diz quais.
 */
function folhasAntesDa105(db: Banco) {
  const colunas = db.prepare('PRAGMA table_info(folhas_campo)').all() as Array<{ name: string }>
  // Só quando a coluna nasce: repetida, a migração não marca as folhas impressas depois dela
  if (!colunas.some((c) => c.name === 'antes_105')) {
    acrescentarColuna(db, 'folhas_campo', 'antes_105', 'INTEGER NOT NULL DEFAULT 0')
    db.exec('UPDATE folhas_campo SET antes_105 = 1')
  }
  const linhas = db
    .prepare(
      `SELECT k.id, k.dados, b.dados AS balanca, c.nome AS cliente, o.numero AS revisado,
              (SELECT n.numero FROM numeros_reservados n
                WHERE n.calibracao_id = k.id AND n.situacao = 'reservado' ORDER BY n.id DESC LIMIT 1) AS reservado
         FROM calibracoes k LEFT JOIN clientes c ON c.id = k.cliente_id
              LEFT JOIN balancas b ON b.id = k.balanca_id
              LEFT JOIN calibracoes o ON o.id = k.substitui_id AND k.substitui_id <> ''
        WHERE k.status IN ('RASCUNHO','REVISAO')
          AND EXISTS (SELECT 1 FROM folhas_campo f WHERE f.calibracao_id = k.id)
        ORDER BY k.criado_em, k.id`,
    )
    .all() as Array<{
    id: string
    dados: string
    balanca: string | null
    cliente: string | null
    revisado: string | null
    reservado: string | null
  }>
  const gravar = db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
  const marcadas: string[] = []
  for (const l of linhas) {
    const k = JSON.parse(l.dados) as Calibracao
    const b = l.balanca ? (JSON.parse(l.balanca) as Partial<Balanca>) : null
    // Só o que os pontos do rascunho não desmentem: até a 1.0.4, a folha do rascunho com pontos saía com os pontos dele
    const pontos = Array.isArray(k.indicacao?.pontos) ? k.indicacao.pontos.map((p) => Number(p.carga)) : []
    const comCargas =
      !!b?.classe &&
      Array.isArray(b.faixas) &&
      folhaDeAntesComCargasDoEma({ classe: b.classe, tipoFaixas: b.tipoFaixas ?? 'UNICA', faixas: b.faixas }, pontos)
    if (k.cargasDoEmaNaFolha === true || !comCargas) continue
    gravar.run(JSON.stringify({ ...k, cargasDoEmaNaFolha: true }), l.id)
    const os = String(k.ordemServico ?? '').trim()
    marcadas.push(
      l.revisado
        ? `revisão do ${l.revisado}`
        : l.reservado ||
            (os ? `OS ${os}` : `${l.cliente || 'Cliente'}${k.dataCalibracao ? ` (${formatarDataBr(k.dataCalibracao)})` : ''}`),
    )
  }
  if (marcadas.length)
    db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)").run(
      new Date().toISOString(),
      detalheLista(
        marcadas.length === 1
          ? 'A calibração em andamento com a folha de campo impressa antes desta versão continua com as cargas em que o EMA muda em “Sugerir pontos” e na folha nova, como a folha que foi a campo; nas novas, só com a declaração de conformidade. Confira: '
          : `${marcadas.length} calibrações em andamento com a folha de campo impressa antes desta versão continuam com as cargas em que o EMA muda em “Sugerir pontos” e na folha nova, como a folha que foi a campo; nas novas, só com a declaração de conformidade. Confira: `,
        marcadas,
      ),
    )
}

/**
 * Migração 15 (ver acima). Repetível: só mexe na revisão em andamento (rascunho ou em revisão) sem os padrões
 * congelados (o certificado revisado com padrões na emissão) ou marcada como legada sem que o certificado revisado seja
 * (a regra é a mesma de `Repositorio.criarCalibracao`). Não sobe a versão: são campos do servidor, que a tela não grava.
 * O registro de atividades diz quais.
 */
function revisoesComOsPadroesDaEmissao(db: Banco) {
  const abertas = db
    .prepare(
      `SELECT r.id, r.dados, o.dados AS original FROM calibracoes r JOIN calibracoes o ON o.id = r.substitui_id
        WHERE r.substitui_id <> '' AND r.status IN ('RASCUNHO','REVISAO')
        ORDER BY r.criado_em, r.id`,
    )
    .all() as Array<{ id: string; dados: string; original: string }>
  const gravar = db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
  const congeladas: string[] = []
  const comRegras: string[] = []
  for (const l of abertas) {
    const k = JSON.parse(l.dados) as Calibracao
    const original = JSON.parse(l.original) as Calibracao
    const nome = original.numero || l.id
    let novo: Calibracao = k
    const padroes = original.emissao?.padroes
    if (!k.padroesCongelados && Array.isArray(padroes) && padroes.length) {
      novo = { ...novo, padroesCongelados: padroes }
      congeladas.push(nome)
    }
    if (k.calculoLegado === true && !calculoLegado({ ...original, opcoes: original.opcoes ?? {} })) {
      const { calculoLegado: _legado, ...resto } = novo
      novo = resto
      if (original.emissao?.regrasDoPop === true) {
        novo.regrasDoPop = true
        if (original.minimosComoAviso === true) novo.minimosComoAviso = true
      }
      comRegras.push(nome)
    }
    if (novo !== k) gravar.run(JSON.stringify(novo), l.id)
  }
  const registrar = db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)")
  if (congeladas.length)
    registrar.run(
      new Date().toISOString(),
      detalheLista(
        congeladas.length === 1
          ? 'A revisão aberta antes desta versão passa a usar os padrões da emissão do certificado revisado (o certificado e as correções da época). Certificado: '
          : `${congeladas.length} revisões abertas antes desta versão passam a usar os padrões da emissão dos certificados revisados (o certificado e as correções da época). Certificados: `,
        congeladas,
      ),
    )
  if (comRegras.length)
    registrar.run(
      new Date().toISOString(),
      detalheLista(
        comRegras.length === 1
          ? 'A revisão do certificado emitido com as regras do POP segue as regras dele (não o cálculo de antes da classe I). Certificado: '
          : `${comRegras.length} revisões de certificados emitidos com as regras do POP seguem as regras deles (não o cálculo de antes da classe I). Certificados: `,
        comRegras,
      ),
    )
}

/** A calibração tem alguma leitura registrada (erro de indicação, "como encontrado", repetibilidade ou excentricidade)? */
function temLeitura(k: Partial<Pick<Calibracao, 'indicacao' | 'comoEncontrado' | 'repetibilidade' | 'excentricidade'>>) {
  const lido = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  const pontos = [...(k.indicacao?.pontos ?? []), ...(k.comoEncontrado?.pontos ?? [])]
  return (
    pontos.some((p) => lido(p.crescente) || lido(p.decrescente)) ||
    (k.repetibilidade ?? []).some((r) => (r.leituras ?? []).some(lido)) ||
    (k.excentricidade?.posicoes ?? []).some((p) => lido(p.leitura) || lido(p.referencia))
  )
}

/**
 * A calibração tem alguma leitura medida na visita: a de uma carga do erro de indicação ou do "como encontrado" (a subida
 * ou a descida de um ponto com carga, ou uma etapa de substituição, como `temLeiturasDeCarga`), da repetibilidade ou da
 * excentricidade. O zero do erro de indicação não conta: "Sugerir os pontos" e "Refazer pontos" já o preenchem com 0.
 */
export function temLeituraMedida(
  k: Partial<Pick<Calibracao, 'indicacao' | 'comoEncontrado' | 'repetibilidade' | 'excentricidade'>>,
) {
  const lido = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  const ensaios = [k.indicacao, k.comoEncontrado]
  return (
    ensaios.some(
      (e) =>
        (e?.pontos ?? []).some((p) => Number(p.carga) > 0 && (lido(p.crescente) || lido(p.decrescente))) ||
        (e?.substituicao?.etapas ?? []).some((x) => lido(x.leituraPadroes) || lido(x.leituraSubstituicao)),
    ) ||
    (k.repetibilidade ?? []).some((r) => (r.leituras ?? []).some(lido)) ||
    (k.excentricidade?.posicoes ?? []).some((p) => lido(p.leitura) || lido(p.referencia))
  )
}

/**
 * Migração 11 (ver acima). Repetível: só mexe na revisão em andamento com outro cliente que o do certificado
 * revisado. O endereço que tinha passado para o do novo dono volta para o do certificado revisado (o digitado na
 * revisão fica); a busca acompanha e a versão sobe (a tela aberta com a revisão de antes não grava por cima). O
 * registro de atividades diz quais.
 */
function revisoesDoClienteRevisado(db: Banco) {
  const linhas = db
    .prepare(
      `SELECT r.id, r.dados, r.versao, o.cliente_id AS cliente_revisado, o.dados AS original,
              n.dados AS cliente_novo, c.dados AS cliente, b.dados AS balanca
         FROM calibracoes r
         JOIN calibracoes o ON o.id = r.substitui_id
         JOIN clientes c ON c.id = o.cliente_id
         LEFT JOIN clientes n ON n.id = r.cliente_id
         LEFT JOIN balancas b ON b.id = r.balanca_id
        WHERE r.substitui_id <> '' AND r.status IN ('RASCUNHO','REVISAO') AND r.cliente_id <> o.cliente_id`,
    )
    .all() as Array<{
    id: string
    dados: string
    versao: number
    cliente_revisado: string
    original: string
    cliente_novo: string | null
    cliente: string
    balanca: string | null
  }>
  if (!linhas.length) return
  const em = new Date().toISOString()
  const gravar = db.prepare(
    'UPDATE calibracoes SET cliente_id = ?, busca = ?, dados = ?, versao = ?, atualizado_em = ? WHERE id = ?',
  )
  const numeros: string[] = []
  for (const l of linhas) {
    const k = JSON.parse(l.dados) as Calibracao
    const original = JSON.parse(l.original) as Calibracao
    const novoDono = l.cliente_novo ? (JSON.parse(l.cliente_novo) as Cliente) : null
    const versao = l.versao + 1
    const revisao: Calibracao = {
      ...k,
      clienteId: l.cliente_revisado,
      localEndereco: novoDono && k.localEndereco === enderecoCliente(novoDono) ? original.localEndereco : k.localEndereco,
      versao,
      atualizadoEm: em,
    }
    const cliente = JSON.parse(l.cliente) as Cliente
    const balanca = l.balanca ? (JSON.parse(l.balanca) as Balanca) : null
    gravar.run(l.cliente_revisado, textoBuscaCalibracao(revisao, cliente, balanca), JSON.stringify(revisao), versao, em, l.id)
    numeros.push(original.numero || l.id)
  }
  db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'SISTEMA_ATUALIZADO', ?)").run(
    em,
    detalheLista(
      numeros.length === 1
        ? 'A revisão aberta voltou para o cliente do certificado revisado (a balança tinha passado para outro cliente). Certificado: '
        : `${numeros.length} revisões abertas voltaram para o cliente do certificado revisado (a balança tinha passado para outro cliente). Certificados: `,
      numeros,
    ),
  )
}

/**
 * Migração 10 (ver acima). Repetível: só acrescenta a coluna e preenche as folhas sem ela. A vigente na primeira
 * impressão é a última registrada até ela (`Repositorio.popVigente`: a de maior id); antes de todas, nenhuma.
 */
function popDasFolhas(db: Banco) {
  acrescentarColuna(db, 'folhas_campo', 'pop_id', 'INTEGER')
  db.exec(
    `UPDATE folhas_campo
        SET pop_id = (SELECT MAX(p.id) FROM pop_versoes p WHERE p.criado_em <= folhas_campo.impressa_em)
      WHERE pop_id IS NULL`,
  )
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
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
  ).run(
    codigo.slice(0, 60),
    revisao.slice(0, 10),
    hojeLocalIso(em),
    'Código e revisão que estavam nas configurações do certificado.',
    em.toISOString(),
    POP_DA_ATUALIZACAO,
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
  return detalheLista(texto, series)
}

/** `texto` seguido da lista "A, B, C." (até 300 letras, com "…" quando não cabe). */
function detalheLista(texto: string, series: string[]): string {
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

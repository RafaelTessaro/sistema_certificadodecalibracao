// "Apagar os testes": a limpeza feita uma vez só, no computador do servidor, antes de o sistema começar a valer
// (server/ferramentas/apagar-testes.mjs, com o serviço parado). Saem todas as calibrações e todos os certificados
// (rascunhos, emitidos, cancelados e as versões anteriores dos corrigidos), os nºs reservados e não utilizados, as
// folhas de campo e os envios por e-mail; a numeração recomeça (CC-<ano>-00001, FC-<ano>-00001). Ficam os usuários
// (com as assinaturas), os dados da empresa e as configurações, as revisões do POP, os padrões, os clientes, as
// balanças, os arquivos guardados no banco e o registro de atividades. Antes de apagar, uma cópia do banco conferida
// vai para dados/backups, e os PDFs das pastas certificados e folhas-campo são MOVIDOS (nunca apagados) para
// dados/testes-apagados-<data>: um PDF que fica na pasta faria o servidor pular aquele nº (ver
// `Repositorio.conferirCertificadosDaPasta` e `recuperarFolhasDaPasta`). As cópias do banco feitas antes (as
// automáticas, as manuais e as do instalador, todas com os testes) vão para dados/testes-apagados-<data>/backups: na
// pasta backups, a tela "Cópias de segurança" as mostraria como as outras, e voltar uma delas traria os testes de volta
// (e deixaria de fora os certificados de verdade com o nº de um teste).

import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { completarConfig, formatarDataBr, formatarNumeroCertificado, hojeLocalIso } from '#shared/dominio.ts'
import type { AcaoAuditoria } from '#shared/tipos.ts'
import { type Banco, gravarMeta, lerMeta, migrar, transacao } from './db.ts'

/** O banco dentro da pasta de dados. */
export const ARQUIVO_BANCO = 'bc-calibracao.db'

/**
 * Tabelas que a limpeza não toca. `meta` fica, menos os contadores da numeração (`META_DA_NUMERACAO`);
 * `auditoria` ganha o registro da limpeza (os registros antigos que apontam para uma calibração apagada continuam:
 * a tela mostra "Certificado não encontrado"); `arquivos` (certificados dos padrões e POP, pelo SHA-256) fica
 * inteira; `sqlite_sequence` (o SQLite) guarda os ids já usados, que nunca se repetem.
 */
export const TABELAS_MANTIDAS = [
  'clientes',
  'balancas',
  'padroes',
  'usuarios',
  'sessoes',
  'config',
  'meta',
  'auditoria',
  'arquivos',
  'pop_versoes',
  'sqlite_sequence',
] as const

/** Tabelas esvaziadas, nesta ordem (as que dependem das calibrações antes delas). */
export const TABELAS_APAGADAS = ['folhas_campo_passagens', 'folhas_campo', 'numeros_reservados', 'envios', 'calibracoes'] as const

export type TabelaApagada = (typeof TABELAS_APAGADAS)[number]

/** A versão anterior de um certificado corrigido com o mesmo nº (como `VERSAO_ANTERIOR` em server/repositorio.ts). */
const VERSAO_ANTERIOR = 'EXISTS (SELECT 1 FROM calibracoes n WHERE n.substitui_id = k.id AND n.numero = k.numero)'

/** As chaves de `meta` que saem: o contador da numeração de cada ano e o aviso dos PDFs fora do banco. */
const META_DA_NUMERACAO = "chave LIKE 'sequencia\\_%' ESCAPE '\\' OR chave = 'certificados_fora_do_banco'"

/** Quando os testes foram apagados (ISO): uma nova rodada avisa que o que existe foi feito depois. */
export const META_TESTES_APAGADOS = 'testes_apagados_em'

/** Pastas de PDFs (dentro da pasta de dados) que vão para `testes-apagados-<data>`. */
export const PASTAS_PDFS = ['certificados', 'folhas-campo'] as const

/** A pasta das cópias do banco (dentro da pasta de dados). */
export const PASTA_BACKUPS = 'backups'

/**
 * As cópias do banco de antes da limpeza, na pasta backups: as automáticas e as manuais do sistema
 * (`bc-calibracao_<data>_<motivo>.db`, ver server/backup.ts) e as do instalador (`antes-da-versao-X.db`). A cópia de
 * antes da limpeza (`antes-de-apagar-testes-…`) fica.
 */
const COPIA_DE_ANTES = /^(bc-calibracao_.+|antes-da-versao-.+)\.db$/i

/** As cópias do banco de antes da limpeza que estão na pasta backups (nomes, em ordem). */
export function copiasDeAntes(pastaDados: string): string[] {
  const pasta = join(pastaDados, PASTA_BACKUPS)
  if (!existsSync(pasta)) return []
  return readdirSync(pasta, { withFileTypes: true })
    .filter((i) => i.isFile() && COPIA_DE_ANTES.test(i.name))
    .map((i) => i.name)
    .sort()
}

/**
 * O registro de atividades da limpeza (grupo "Cópias e dados", "No computador do servidor"): a ação própria, não a das
 * atualizações do sistema (`SISTEMA_ATUALIZADO`), que diria que uma atualização mexeu nos cadastros.
 */
export const ACAO_TESTES_APAGADOS: AcaoAuditoria = 'TESTES_APAGADOS'

/** Erro com a mensagem para quem roda a ferramenta. `emUso`: o serviço (ou outro programa) está com o banco aberto. */
export class ErroLimpeza extends Error {
  emUso: boolean
  constructor(mensagem: string, emUso = false) {
    super(mensagem)
    this.name = 'ErroLimpeza'
    this.emUso = emUso
  }
}

export const MENSAGEM_EM_USO = [
  'O BC Calibração está usando o banco agora (o serviço está ligado). Nada foi apagado.',
  'Pare o serviço e rode de novo. No Prompt de Comando aberto como administrador:',
  '  net stop BCCalibracao',
].join('\n')

const ocupado = (e: unknown) => {
  const x = e as { errcode?: number; message?: string } | null
  return x?.errcode === 5 || x?.errcode === 6 || /database is locked|database table is locked/i.test(String(x?.message))
}

/**
 * Abre o banco só para a limpeza: com outro programa usando o banco (o serviço), recusa na hora (`ErroLimpeza` com
 * `emUso`). O SQLite em WAL mantém uma trava compartilhada no arquivo enquanto o banco está aberto, e a trava exclusiva
 * pedida aqui (sem esperar) só sai sem ninguém mais nele. Ela fica até `close()`: o serviço iniciado no meio da limpeza
 * não abre o banco. Aplica as migrações que faltarem, como o servidor.
 */
export function abrirSozinho(arquivo: string): Banco {
  if (!existsSync(arquivo)) throw new ErroLimpeza(`Banco não encontrado: ${arquivo}`)
  const db = new DatabaseSync(arquivo)
  try {
    db.exec('PRAGMA busy_timeout = 0')
    db.exec('PRAGMA locking_mode = EXCLUSIVE')
    db.exec('BEGIN EXCLUSIVE')
    db.exec('COMMIT')
  } catch (e) {
    db.close()
    if (ocupado(e)) throw new ErroLimpeza(MENSAGEM_EM_USO, true)
    throw e
  }
  try {
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec('PRAGMA foreign_keys = ON')
    migrar(db)
  } catch (e) {
    db.close()
    throw e
  }
  return db
}

/** As tabelas de estatística do SQLite (ANALYZE), que não são dados do sistema. */
const SEM_ESTATISTICAS = "name NOT LIKE 'sqlite\\_stat%' ESCAPE '\\'"

/** Nomes das tabelas do banco (com a `sqlite_sequence`). */
export function tabelasDoBanco(db: Banco): string[] {
  const linhas = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND ${SEM_ESTATISTICAS} ORDER BY name`).all()
  return (linhas as Array<{ name: string }>).map((l) => l.name)
}

/** As tabelas que a limpeza não conhece (de uma versão mais nova do sistema): com elas, nada é apagado. */
export function tabelasDesconhecidas(db: Banco): string[] {
  const conhecidas = new Set<string>([...TABELAS_MANTIDAS, ...TABELAS_APAGADAS])
  return tabelasDoBanco(db).filter((t) => !conhecidas.has(t))
}

function conferirTabelas(db: Banco) {
  const desconhecidas = tabelasDesconhecidas(db)
  if (desconhecidas.length)
    throw new ErroLimpeza(
      `O banco tem tabelas que esta ferramenta não conhece (${desconhecidas.join(', ')}): ele é de outra versão do sistema. Nada foi apagado.`,
    )
}

export interface ArquivosDaPasta {
  pdfs: number
  outros: number
}

/** Arquivos dentro da pasta (em todas as subpastas). */
function contarArquivos(pasta: string): ArquivosDaPasta {
  const total = { pdfs: 0, outros: 0 }
  if (!existsSync(pasta)) return total
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    if (item.isDirectory()) {
      const dentro = contarArquivos(join(pasta, item.name))
      total.pdfs += dentro.pdfs
      total.outros += dentro.outros
    } else if (/\.pdf$/i.test(item.name)) total.pdfs++
    else total.outros++
  }
  return total
}

export interface Levantamento {
  /** Linhas de cada tabela que vai ser esvaziada. */
  linhas: Record<TabelaApagada, number>
  emitidos: number
  cancelados: number
  /** Certificados substituídos por uma revisão com outro nº (a "-R1" de antes da 1.0.4): uma linha na lista cada. */
  substituidos: number
  /**
   * Versões anteriores de certificados corrigidos com o mesmo nº (a partir da 1.0.4): ficam só no histórico do
   * certificado, não são outro certificado (`VERSAO_ANTERIOR` em server/repositorio.ts).
   */
  versoesAnteriores: number
  /** Rascunhos e calibrações em revisão. */
  emAndamento: number
  folhas: number
  /** Nºs de certificado reservados ou não utilizados (os emitidos já contam nos certificados). */
  numeros: number
  envios: number
  /** Primeira e última data de emissão dos certificados (yyyy-MM-dd), ou ''. */
  primeiraEmissao: string
  ultimaEmissao: string
  /** Chaves de `meta` da numeração gravadas. */
  contadores: number
  certificados: ArquivosDaPasta
  folhasCampo: ArquivosDaPasta
  /**
   * Cópias do banco na pasta backups feitas antes da limpeza (`copiasDeAntes`), com os testes: vão junto com os PDFs.
   * Sozinhas não contam como algo para apagar (o servidor faz cópias novas depois da limpeza).
   */
  copias: number
  ficam: { usuarios: number; clientes: number; balancas: number; padroes: number; pops: number }
  /** Quando os testes já foram apagados antes (ISO), ou ''. */
  apagadosEm: string
  /** Os nºs que saem depois da limpeza (pela numeração das configurações, no ano de hoje). */
  proximoCertificado: string
  proximaFolha: string
}

const contar = (db: Banco, sql: string, ...params: string[]) =>
  Number((db.prepare(sql).get(...params) as { n: number | null }).n ?? 0)

/** O que a limpeza apaga (e o que fica), sem mexer em nada. Recusa um banco com tabelas que ela não conhece. */
export function levantar(db: Banco, pastaDados: string, agora = new Date()): Levantamento {
  conferirTabelas(db)
  const linhas = Object.fromEntries(TABELAS_APAGADAS.map((t) => [t, contar(db, `SELECT COUNT(*) AS n FROM ${t}`)])) as Record<
    TabelaApagada,
    number
  >
  const status = (...s: string[]) =>
    contar(db, `SELECT COUNT(*) AS n FROM calibracoes WHERE status IN (${s.map(() => '?').join(', ')})`, ...s)
  const versoesAnteriores = contar(
    db,
    `SELECT COUNT(*) AS n FROM calibracoes k WHERE k.status = 'SUBSTITUIDO' AND ${VERSAO_ANTERIOR}`,
  )
  const datas = db
    .prepare(
      `SELECT MIN(data_emissao) AS primeira, MAX(data_emissao) AS ultima FROM calibracoes
        WHERE status IN ('EMITIDO', 'CANCELADO', 'SUBSTITUIDO') AND data_emissao <> ''`,
    )
    .get() as { primeira: string | null; ultima: string | null }
  let numeracao = completarConfig({}).numeracao
  try {
    const l = db.prepare("SELECT valor FROM config WHERE chave = 'geral'").get() as { valor: string } | undefined
    if (l) numeracao = completarConfig(JSON.parse(l.valor)).numeracao
  } catch {
    // configuração ilegível: a numeração de fábrica, como o servidor
  }
  const ano = agora.getFullYear()
  return {
    linhas,
    emitidos: status('EMITIDO'),
    cancelados: status('CANCELADO'),
    substituidos: status('SUBSTITUIDO') - versoesAnteriores,
    versoesAnteriores,
    emAndamento: status('RASCUNHO', 'REVISAO'),
    folhas: linhas.folhas_campo,
    numeros: contar(db, "SELECT COUNT(*) AS n FROM numeros_reservados WHERE situacao IN ('reservado', 'nao_utilizado')"),
    envios: linhas.envios,
    primeiraEmissao: datas.primeira ?? '',
    ultimaEmissao: datas.ultima ?? '',
    contadores: contar(db, `SELECT COUNT(*) AS n FROM meta WHERE ${META_DA_NUMERACAO}`),
    certificados: contarArquivos(join(pastaDados, 'certificados')),
    folhasCampo: contarArquivos(join(pastaDados, 'folhas-campo')),
    copias: copiasDeAntes(pastaDados).length,
    ficam: {
      usuarios: contar(db, 'SELECT COUNT(*) AS n FROM usuarios'),
      clientes: contar(db, 'SELECT COUNT(*) AS n FROM clientes'),
      balancas: contar(db, 'SELECT COUNT(*) AS n FROM balancas'),
      padroes: contar(db, 'SELECT COUNT(*) AS n FROM padroes'),
      pops: contar(db, 'SELECT COUNT(*) AS n FROM pop_versoes'),
    },
    apagadosEm: lerMeta(db, META_TESTES_APAGADOS) ?? '',
    proximoCertificado: formatarNumeroCertificado(numeracao, 1, ano),
    proximaFolha: `FC-${ano}-00001`,
  }
}

const arquivosNaPasta = (a: ArquivosDaPasta) => a.pdfs + a.outros

/** Nada para apagar: nenhuma linha, nenhum contador de numeração e nenhum arquivo nas pastas dos PDFs. */
export function nadaParaApagar(l: Levantamento): boolean {
  return (
    Object.values(l.linhas).every((n) => n === 0) &&
    l.contadores === 0 &&
    arquivosNaPasta(l.certificados) === 0 &&
    arquivosNaPasta(l.folhasCampo) === 0
  )
}

const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** "2 PDFs de certificados, 1 PDF de folha de campo e 1 outro arquivo", ou ''. */
function textoPdfs(l: Levantamento): string {
  const partes = [
    l.certificados.pdfs ? qtd(l.certificados.pdfs, 'PDF de certificado', 'PDFs de certificados') : '',
    l.folhasCampo.pdfs ? qtd(l.folhasCampo.pdfs, 'PDF de folha de campo', 'PDFs de folhas de campo') : '',
  ].filter(Boolean)
  const outros = l.certificados.outros + l.folhasCampo.outros
  if (outros) partes.push(qtd(outros, 'outro arquivo', 'outros arquivos'))
  if (!partes.length) return ''
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}` : partes[0]
}

/** As linhas que a ferramenta mostra antes de pedir a confirmação. */
export function textoLevantamento(l: Levantamento): string[] {
  const periodo =
    l.primeiraEmissao && l.ultimaEmissao
      ? l.primeiraEmissao === l.ultimaEmissao
        ? ` (em ${formatarDataBr(l.primeiraEmissao)})`
        : ` (de ${formatarDataBr(l.primeiraEmissao)} a ${formatarDataBr(l.ultimaEmissao)})`
      : ''
  const itens = [
    l.emitidos ? qtd(l.emitidos, 'certificado emitido', 'certificados emitidos') + periodo : '',
    l.cancelados ? qtd(l.cancelados, 'certificado cancelado', 'certificados cancelados') : '',
    l.substituidos ? qtd(l.substituidos, 'certificado substituído', 'certificados substituídos') : '',
    l.versoesAnteriores
      ? qtd(l.versoesAnteriores, 'versão anterior de certificado corrigido', 'versões anteriores de certificados corrigidos')
      : '',
    l.emAndamento ? qtd(l.emAndamento, 'calibração em andamento', 'calibrações em andamento') : '',
    l.folhas ? qtd(l.folhas, 'folha de campo', 'folhas de campo') : '',
    l.numeros
      ? qtd(l.numeros, 'nº de certificado reservado ou não utilizado', 'nºs de certificado reservados ou não utilizados')
      : '',
    l.envios ? qtd(l.envios, 'registro de e-mail enviado', 'registros de e-mails enviados') : '',
  ].filter(Boolean)
  // Algo das tabelas que não entra nas contas acima (ex.: nº já emitido sem o certificado)
  if (!itens.length && Object.values(l.linhas).some((n) => n > 0)) itens.push('registros internos dos certificados')
  if (!itens.length && l.contadores) itens.push('o contador da numeração dos certificados')
  const pdfs = textoPdfs(l)
  const linhas = [...itens.map((i) => `  - ${i}`)]
  if (pdfs) linhas.push(`  - ${pdfs}: saem das pastas e vão para a pasta testes-apagados (não são apagados)`)
  if (l.copias)
    linhas.push(
      `  - ${qtd(l.copias, 'cópia do banco', 'cópias do banco')} da pasta backups, com os testes: ` +
        `${l.copias === 1 ? 'vai' : 'vão'} para a pasta testes-apagados (não ${l.copias === 1 ? 'é apagada' : 'são apagadas'})`,
    )
  const f = l.ficam
  const saida = ['Vai apagar:', ...linhas, '']
  if (l.apagadosEm)
    saida.push(
      `ATENÇÃO: os testes já foram apagados em ${formatarDataBr(hojeLocalIso(new Date(l.apagadosEm)))}. O que está acima foi feito depois disso.`,
      '',
    )
  saida.push(
    `Ficam como estão: ${qtd(f.usuarios, 'usuário', 'usuários')} (com as assinaturas), ${qtd(f.clientes, 'cliente', 'clientes')}, ` +
      `${qtd(f.balancas, 'balança', 'balanças')}, ${qtd(f.padroes, 'padrão', 'padrões')}, ${qtd(f.pops, 'revisão do POP', 'revisões do POP')}, ` +
      'os dados da empresa, as configurações e o registro de atividades.',
    '',
    `Depois, o próximo certificado será ${l.proximoCertificado} e a próxima folha de campo, ${l.proximaFolha}.`,
    'Antes de apagar, uma cópia do banco é gravada na pasta backups.',
  )
  return saida
}

/** A resposta confirma a limpeza? (a palavra APAGAR, em maiúsculas ou não) */
export const confirmou = (resposta: string | null | undefined) =>
  String(resposta ?? '')
    .trim()
    .toUpperCase() === 'APAGAR'

/** "2026-11-04_10-30" (hora deste computador). */
export function carimbo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`
}

/** `base` + `fim`, ou com -2, -3… se já existir. */
function caminhoLivre(base: string, fim = ''): string {
  let caminho = `${base}${fim}`
  for (let n = 2; existsSync(caminho) || existsSync(`${caminho}.parcial`); n++) caminho = `${base}-${n}${fim}`
  return caminho
}

const integridade = (db: Banco) =>
  (db.prepare('PRAGMA integrity_check').all() as Array<Record<string, string>>).map((l) => Object.values(l)[0]).join('; ')

/**
 * Cópia do banco como está (VACUUM INTO, como o instalador), conferida antes de receber o nome final: a integridade
 * e as linhas de cada tabela iguais às do banco.
 */
function copiarBanco(db: Banco, destino: string) {
  const parcial = `${destino}.parcial`
  rmSync(parcial, { force: true })
  try {
    db.exec(`VACUUM INTO '${parcial.replace(/'/g, "''")}'`)
    const copia = new DatabaseSync(parcial)
    try {
      const situacao = integridade(copia)
      if (situacao !== 'ok') throw new ErroLimpeza(`A cópia do banco não passou na conferência (${situacao}). Nada foi apagado.`)
      for (const t of tabelasDoBanco(db)) {
        const linhas = (b: Banco) => contar(b, `SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`)
        if (linhas(copia) !== linhas(db))
          throw new ErroLimpeza(`A cópia do banco não ficou igual ao banco (tabela ${t}). Nada foi apagado.`)
      }
    } finally {
      copia.close()
    }
    renameSync(parcial, destino)
  } catch (e) {
    for (const sufixo of ['', '-wal', '-shm', '-journal']) rmSync(`${parcial}${sufixo}`, { force: true })
    if (e instanceof ErroLimpeza) throw e
    throw new ErroLimpeza(`Não foi possível gravar a cópia do banco em ${destino}: ${mensagemDe(e)}. Nada foi apagado.`)
  }
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

interface Movimento {
  de: string
  para: string
}

/** O que foi movido e as pastas criadas, para desfazer. */
interface Mudanca {
  movidos: Movimento[]
  criadas: string[]
}

/** Volta os arquivos para onde estavam e tira as pastas criadas (vazias). Devolve o que não voltou. */
function desfazer(m: Mudanca): string[] {
  const ficaram: string[] = []
  for (const { de, para } of [...m.movidos].reverse()) {
    try {
      renameSync(para, de)
    } catch {
      ficaram.push(para)
    }
  }
  for (const pasta of [...m.criadas].reverse()) {
    try {
      rmdirSync(pasta)
    } catch {
      // não está vazia (algo não voltou): fica
    }
  }
  return ficaram
}

const avisoDoQueFicou = (ficaram: string[], pastaDados: string) =>
  ficaram.length
    ? `\nATENÇÃO: ${qtd(ficaram.length, 'item não voltou', 'itens não voltaram')} para o lugar (${ficaram.join('; ')}). ` +
      `Mova de volta para as pastas certificados, folhas-campo e backups em ${pastaDados} antes de iniciar o serviço.`
    : ''

/**
 * Move tudo o que está nas pastas dos PDFs (as que têm algum arquivo) para `destino`/<pasta>, e as cópias do banco de
 * antes (`copias`, da pasta backups) para `destino`/backups. Se algo falhar (um PDF aberto no Windows), o que já foi
 * movido volta e o erro diz o que fazer.
 */
function moverArquivos(
  pastaDados: string,
  destino: string,
  copias: string[],
  renomear: (de: string, para: string) => void,
): Mudanca {
  const m: Mudanca = { movidos: [], criadas: [] }
  const criar = (pasta: string) => {
    if (existsSync(pasta)) return
    mkdirSync(pasta)
    m.criadas.push(pasta)
  }
  let atual = ''
  try {
    for (const nome of PASTAS_PDFS) {
      const origem = join(pastaDados, nome)
      if (!arquivosNaPasta(contarArquivos(origem))) continue
      criar(destino)
      criar(join(destino, nome))
      for (const item of readdirSync(origem).sort()) {
        atual = join(nome, item)
        const mov = { de: join(origem, item), para: join(destino, nome, item) }
        renomear(mov.de, mov.para)
        m.movidos.push(mov)
      }
    }
    if (copias.length) {
      criar(destino)
      criar(join(destino, PASTA_BACKUPS))
      for (const nome of copias) {
        atual = join(PASTA_BACKUPS, nome)
        const mov = { de: join(pastaDados, PASTA_BACKUPS, nome), para: join(destino, PASTA_BACKUPS, nome) }
        renomear(mov.de, mov.para)
        m.movidos.push(mov)
      }
    }
  } catch (e) {
    const ficaram = desfazer(m)
    throw new ErroLimpeza(
      `Não foi possível mover ${atual || 'os PDFs'} para ${destino}: ${mensagemDe(e)}. ` +
        'Feche os PDFs (e as cópias do banco) que estiverem abertos e rode de novo. Nada foi apagado.' +
        avisoDoQueFicou(ficaram, pastaDados),
    )
  }
  return m
}

export interface ResultadoLimpeza {
  /** false = não havia nada para apagar (nada mudou). */
  apagou: boolean
  /** Linhas apagadas de cada tabela. */
  apagadas: Record<TabelaApagada, number>
  /** A cópia do banco de antes da limpeza (caminho completo), ou ''. */
  copia: string
  /** A pasta para onde foram os PDFs e as cópias do banco de antes (caminho completo), ou '' se não havia nenhum. */
  pastaPdfs: string
  /** Quantas cópias do banco de antes saíram da pasta backups (para `pastaPdfs`/backups). */
  copiasMovidas: number
  /** O texto gravado no registro de atividades. */
  registro: string
  levantamento: Levantamento
}

export interface OpcoesLimpeza {
  agora?: Date
  /** Os testes trocam para simular um PDF aberto no Windows. */
  renomear?: (de: string, para: string) => void
}

/** Tamanho máximo do detalhe de um registro de atividades. */
const LIMITE_REGISTRO = 300

/**
 * O texto do registro de atividades (até 300 letras; os caminhos, a partir da pasta de dados). É o registro que fica
 * dizendo onde estão a cópia do banco e os PDFs: quando não cabe, encurta a lista das contas, nunca os caminhos.
 */
export function textoRegistro(l: Levantamento, copia: string, pastaPdfs: string, copiasMovidas = 0): string {
  // Os certificados como o dono os via na lista, um por nº: as versões anteriores dos corrigidos com o mesmo nº não são
  // outro certificado (o detalhe está na saída da ferramenta)
  const certificados = l.emitidos + l.cancelados + l.substituidos
  const itens = [
    certificados ? qtd(certificados, 'certificado', 'certificados') : '',
    l.emAndamento ? qtd(l.emAndamento, 'calibração em andamento', 'calibrações em andamento') : '',
    l.folhas ? qtd(l.folhas, 'folha de campo', 'folhas de campo') : '',
    l.numeros ? qtd(l.numeros, 'nº reservado', 'nºs reservados') : '',
    l.envios ? qtd(l.envios, 'e-mail', 'e-mails') : '',
  ].filter(Boolean)
  const movidos = l.certificados.pdfs + l.folhasCampo.pdfs + l.certificados.outros + l.folhasCampo.outros
  const oQue = movidos ? `PDFs${copiasMovidas ? ' e cópias antigas' : ''}` : copiasMovidas ? 'Cópias antigas do banco' : ''
  const onde = pastaPdfs && oQue ? ` ${oQue}: ${pastaPdfs}.` : ''
  const caminhos = `Cópia do banco: ${copia}.${onde}`
  const numeracao = ` Próximos nºs: ${l.proximoCertificado} e ${l.proximaFolha}. `
  const montar = (lista: string, comNumeracao = true) => `Testes apagados: ${lista}.${comNumeracao ? numeracao : ' '}${caminhos}`
  const juntar = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}` : xs[0])
  if (!itens.length) return montar('só a numeração').slice(0, LIMITE_REGISTRO)
  let texto = montar(juntar(itens))
  // Não cabe: as últimas contas dão lugar a "e outros registros"
  for (let n = itens.length - 1; texto.length > LIMITE_REGISTRO && n > 0; n--)
    texto = montar(`${itens.slice(0, n).join(', ')} e outros registros`)
  // Com um formato de numeração muito comprido: sem a numeração (ela está nas configurações)
  if (texto.length > LIMITE_REGISTRO) texto = montar('certificados e calibrações', false)
  return texto.slice(0, LIMITE_REGISTRO)
}

/**
 * Apaga os testes no banco aberto por `abrirSozinho` (`pastaDados`: a pasta dele). Sem nada para apagar, não mexe em
 * nada. Senão: (1) confere o banco e grava a cópia dele em backups/antes-de-apagar-testes-<data>.db; (2) move os PDFs
 * para testes-apagados-<data>, e as cópias do banco de antes (`copiasDeAntes`) para testes-apagados-<data>/backups (sem
 * elas, o servidor faz uma cópia diária nova, já sem os testes, quando inicia); (3) numa transação, esvazia as tabelas
 * dos certificados, tira os contadores da numeração, sobe a revisão (as telas abertas recarregam quando o serviço
 * voltar) e grava o registro de atividades. Se (2) ou (3) falhar, os arquivos voltam para o lugar e o banco fica como
 * estava (a cópia fica).
 */
export function apagarTestes(db: Banco, pastaDados: string, opcoes: OpcoesLimpeza = {}): ResultadoLimpeza {
  const agora = opcoes.agora ?? new Date()
  const renomear = opcoes.renomear ?? renameSync
  const l = levantar(db, pastaDados, agora)
  const vazio = Object.fromEntries(TABELAS_APAGADAS.map((t) => [t, 0])) as Record<TabelaApagada, number>
  if (nadaParaApagar(l))
    return { apagou: false, apagadas: vazio, copia: '', pastaPdfs: '', copiasMovidas: 0, registro: '', levantamento: l }

  const situacao = integridade(db)
  if (situacao !== 'ok') throw new ErroLimpeza(`O banco tem problemas de integridade (${situacao}). Nada foi apagado.`)

  const marca = carimbo(agora)
  const pastaBackups = join(pastaDados, 'backups')
  mkdirSync(pastaBackups, { recursive: true })
  const copia = caminhoLivre(join(pastaBackups, `antes-de-apagar-testes-${marca}`), '.db')
  copiarBanco(db, copia)

  // As cópias do banco de antes (a de agora, `copia`, fica na pasta backups: não entra na lista)
  const copias = copiasDeAntes(pastaDados)
  const temPdfs = arquivosNaPasta(l.certificados) + arquivosNaPasta(l.folhasCampo) > 0
  const mover = temPdfs || copias.length > 0
  const pastaPdfs = mover ? caminhoLivre(join(pastaDados, `testes-apagados-${marca}`)) : ''
  const mudanca = mover ? moverArquivos(pastaDados, pastaPdfs, copias, renomear) : { movidos: [], criadas: [] }

  const registro = textoRegistro(l, relative(pastaDados, copia), pastaPdfs && relative(pastaDados, pastaPdfs), copias.length)
  try {
    const apagadas = transacao(db, () => {
      const n = { ...vazio }
      for (const t of TABELAS_APAGADAS) n[t] = Number(db.prepare(`DELETE FROM ${t}`).run().changes)
      db.prepare(`DELETE FROM meta WHERE ${META_DA_NUMERACAO}`).run()
      gravarMeta(db, 'revisao', Number(lerMeta(db, 'revisao') ?? 0) + 1)
      gravarMeta(db, META_TESTES_APAGADOS, agora.toISOString())
      db.prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', ?, ?)").run(
        agora.toISOString(),
        ACAO_TESTES_APAGADOS,
        registro,
      )
      const violacoes = db.prepare('PRAGMA foreign_key_check').all()
      if (violacoes.length) throw new Error(`${violacoes.length} ligações quebradas entre as tabelas`)
      return n
    })
    return { apagou: true, apagadas, copia, pastaPdfs, copiasMovidas: copias.length, registro, levantamento: l }
  } catch (e) {
    const ficaram = desfazer(mudanca)
    throw new ErroLimpeza(
      `Não foi possível apagar os testes no banco: ${mensagemDe(e)}. Nada foi apagado` +
        (mover ? ` e ${temPdfs ? 'os PDFs' : 'as cópias do banco'} voltaram para as pastas` : '') +
        `. A cópia do banco ficou em ${copia}.` +
        avisoDoQueFicou(ficaram, pastaDados),
    )
  }
}

/** As linhas que a ferramenta mostra depois de apagar. */
export function textoResultado(r: ResultadoLimpeza): string[] {
  return [
    'Pronto: os testes foram apagados.',
    `  Cópia do banco de antes: ${r.copia}`,
    ...(r.pastaPdfs && arquivosNaPasta(r.levantamento.certificados) + arquivosNaPasta(r.levantamento.folhasCampo)
      ? [`  PDFs dos testes: ${r.pastaPdfs}`]
      : []),
    ...(r.copiasMovidas
      ? [
          `  Cópias do banco do período de testes: ${join(r.pastaPdfs, PASTA_BACKUPS)}`,
          '  (o sistema faz uma cópia nova, já sem os testes, quando o serviço iniciar)',
        ]
      : []),
    `O próximo certificado será ${r.levantamento.proximoCertificado} e a próxima folha de campo, ${r.levantamento.proximaFolha}.`,
    '',
    'Agora inicie o serviço: net start BCCalibracao',
  ]
}

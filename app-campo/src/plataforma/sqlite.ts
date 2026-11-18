// O repositório das folhas no celular: SQLite (@capacitor-community/sqlite, sem cifra), no diretório privado do app,
// com uma tabela de folhas (cada folha inteira em JSON) e uma de metadados. Grava a cada alteração. No navegador de
// desenvolvimento (vite), um repositório em memória guardado no localStorage.

import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { FolhaLocal } from '../nucleo/folha.ts'
import { RepositorioMemoria } from '../nucleo/repositorio.ts'
import type { Repositorio } from '../nucleo/repositorio.ts'

const BANCO = 'bc-calibracao'
const VERSAO = 1

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS folhas (
  envio_id      TEXT PRIMARY KEY NOT NULL,
  numero        TEXT NOT NULL,
  estado        TEXT NOT NULL,
  dados         TEXT NOT NULL,
  atualizada_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  chave TEXT PRIMARY KEY NOT NULL,
  valor TEXT NOT NULL
);`

class RepositorioSqlite implements Repositorio {
  private readonly db: SQLiteDBConnection
  constructor(db: SQLiteDBConnection) {
    this.db = db
  }

  async listar(): Promise<FolhaLocal[]> {
    const r = await this.db.query('SELECT dados FROM folhas ORDER BY numero')
    return (r.values ?? []).map((x: { dados: string }) => JSON.parse(x.dados) as FolhaLocal)
  }

  async obter(envioId: string): Promise<FolhaLocal | null> {
    const r = await this.db.query('SELECT dados FROM folhas WHERE envio_id = ?', [envioId])
    const linha = r.values?.[0] as { dados: string } | undefined
    return linha ? (JSON.parse(linha.dados) as FolhaLocal) : null
  }

  async gravar(f: FolhaLocal): Promise<void> {
    await this.db.run(
      `INSERT INTO folhas (envio_id, numero, estado, dados, atualizada_em) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(envio_id) DO UPDATE SET numero = excluded.numero, estado = excluded.estado, dados = excluded.dados,
       atualizada_em = excluded.atualizada_em`,
      [f.envioId, f.numero, f.estado, JSON.stringify(f), f.atualizadaEm],
    )
  }

  async apagar(envioId: string): Promise<void> {
    await this.db.run('DELETE FROM folhas WHERE envio_id = ?', [envioId])
  }

  async lerMeta(chave: string): Promise<string | null> {
    const r = await this.db.query('SELECT valor FROM meta WHERE chave = ?', [chave])
    return (r.values?.[0] as { valor: string } | undefined)?.valor ?? null
  }

  async gravarMeta(chave: string, valor: string | null): Promise<void> {
    if (valor === null) await this.db.run('DELETE FROM meta WHERE chave = ?', [chave])
    else
      await this.db.run('INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', [
        chave,
        valor,
      ])
  }
}

/** Navegador de desenvolvimento: a memória, guardada no localStorage a cada gravação. */
class RepositorioNavegador extends RepositorioMemoria {
  private static readonly CHAVE = 'bc-calibracao-celular'
  private metaSalva: Record<string, string> = {}
  constructor() {
    super()
    try {
      const salvo = JSON.parse(localStorage.getItem(RepositorioNavegador.CHAVE) ?? 'null') as {
        folhas: FolhaLocal[]
        meta: Record<string, string>
      } | null
      for (const f of salvo?.folhas ?? []) void super.gravar(f)
      for (const [k, v] of Object.entries(salvo?.meta ?? {})) {
        void super.gravarMeta(k, v)
        this.metaSalva[k] = v
      }
    } catch {
      // Sem localStorage: só memória
    }
  }
  private async salvar() {
    try {
      localStorage.setItem(RepositorioNavegador.CHAVE, JSON.stringify({ folhas: await this.listar(), meta: this.metaSalva }))
    } catch {
      // Sem localStorage: só memória
    }
  }
  override async gravar(f: FolhaLocal) {
    await super.gravar(f)
    await this.salvar()
  }
  override async apagar(envioId: string) {
    await super.apagar(envioId)
    await this.salvar()
  }
  override async gravarMeta(chave: string, valor: string | null) {
    await super.gravarMeta(chave, valor)
    if (valor === null) delete this.metaSalva[chave]
    else this.metaSalva[chave] = valor
    await this.salvar()
  }
}

/** Abre o banco das folhas (cria as tabelas na primeira vez). */
export async function abrirRepositorio(): Promise<Repositorio> {
  if (!Capacitor.isNativePlatform()) return new RepositorioNavegador()
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const consistente = (await sqlite.checkConnectionsConsistency()).result
  const existe = (await sqlite.isConnection(BANCO, false)).result
  const db =
    consistente && existe
      ? await sqlite.retrieveConnection(BANCO, false)
      : await sqlite.createConnection(BANCO, false, 'no-encryption', VERSAO, false)
  await db.open()
  await db.execute(ESQUEMA, false)
  return new RepositorioSqlite(db)
}

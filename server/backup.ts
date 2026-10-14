import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import type { Banco } from './db.ts'

const PREFIXO = 'bc-calibracao_'

function carimbo(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

export interface InfoBackup {
  arquivo: string
  tamanho: number
  criadoEm: string
}

export type MotivoBackup = 'diario' | 'manual' | 'antes-restaurar'

/** Quantas cópias manter de cada motivo. */
const MANTER: Record<MotivoBackup, number> = { diario: 30, manual: 20, 'antes-restaurar': 10 }

/**
 * Cópias de segurança automáticas do banco (arquivos .db completos e conferidos).
 * Usa a API de backup do SQLite em etapas: o servidor continua respondendo durante a cópia
 * (o VACUUM INTO travaria tudo enquanto copia). A pasta dados/certificados (PDFs emitidos)
 * também precisa ir para o backup externo da empresa.
 */
export class BackupsAutomaticos {
  private db: Banco
  private pasta: string
  private timer?: ReturnType<typeof setInterval>
  private emAndamento: Promise<string> | null = null

  constructor(db: Banco, pasta: string) {
    this.db = db
    this.pasta = pasta
  }

  /** Faz uma cópia se a última diária tiver mais de 24 h e agenda a verificação a cada hora. */
  iniciar() {
    void this.verificarDiario()
    this.timer = setInterval(() => void this.verificarDiario(), 60 * 60 * 1000)
    this.timer.unref?.()
  }

  parar() {
    if (this.timer) clearInterval(this.timer)
  }

  listar(): InfoBackup[] {
    if (!existsSync(this.pasta)) return []
    return readdirSync(this.pasta)
      .filter((f) => f.startsWith(PREFIXO) && f.endsWith('.db'))
      .map((arquivo) => {
        const st = statSync(join(this.pasta, arquivo))
        return { arquivo, tamanho: st.size, criadoEm: st.mtime.toISOString() }
      })
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
  }

  /** Grava uma cópia consistente do banco (mesmo com pessoas usando o sistema) e confere a integridade. */
  copiar(motivo: MotivoBackup): Promise<string> {
    // Duas cópias ao mesmo tempo disputariam o banco: a segunda espera a primeira
    const anterior = this.emAndamento ?? Promise.resolve('')
    const atual = anterior.catch(() => '').then(() => this.copiarAgora(motivo))
    this.emAndamento = atual.finally(() => {
      if (this.emAndamento === atual) this.emAndamento = null
    })
    return atual
  }

  private async copiarAgora(motivo: MotivoBackup): Promise<string> {
    mkdirSync(this.pasta, { recursive: true })
    let arquivo = join(this.pasta, `${PREFIXO}${carimbo()}_${motivo}.db`)
    for (let n = 2; existsSync(arquivo); n++) arquivo = join(this.pasta, `${PREFIXO}${carimbo()}-${n}_${motivo}.db`)
    const temporario = `${arquivo}.parcial`
    try {
      await backup(this.db, temporario, { rate: 200 })
      // Confere a cópia e a deixa num arquivo só (sem -wal/-shm soltos)
      const copia = new DatabaseSync(temporario)
      try {
        const r = copia.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
        if (r.integrity_check !== 'ok') throw new Error(`cópia com defeito: ${r.integrity_check}`)
        copia.exec('PRAGMA journal_mode = DELETE')
        copia.exec(`VACUUM INTO '${arquivo.replace(/'/g, "''")}'`)
      } finally {
        copia.close()
      }
    } finally {
      for (const sufixo of ['', '-wal', '-shm', '-journal']) rmSync(`${temporario}${sufixo}`, { force: true })
    }
    this.limparAntigos()
    return arquivo
  }

  private async verificarDiario() {
    try {
      const ultimo = this.listar().find((b) => b.arquivo.endsWith('_diario.db'))
      if (!ultimo || Date.now() - Date.parse(ultimo.criadoEm) > 24 * 60 * 60 * 1000) await this.copiar('diario')
    } catch (e) {
      console.error('[backup] falha ao gerar cópia automática:', e)
    }
  }

  private limparAntigos() {
    const porMotivo = new Map<string, InfoBackup[]>()
    for (const b of this.listar()) {
      const motivo = b.arquivo.replace(/^.*_([a-z-]+)\.db$/, '$1')
      porMotivo.set(motivo, [...(porMotivo.get(motivo) ?? []), b])
    }
    for (const [motivo, lista] of porMotivo) {
      const manter = MANTER[motivo as MotivoBackup] ?? 20
      for (const velho of lista.slice(manter)) rmSync(join(this.pasta, velho.arquivo), { force: true })
    }
  }
}

import type { FastifyBaseLogger } from 'fastify'
import type { BackupsAutomaticos } from './backup.ts'
import type { Banco } from './db.ts'
import type { Repositorio } from './repositorio.ts'
import type { TempoReal } from './tempoReal.ts'
import type { ServicoUsuarios } from './usuarios.ts'

/** Dependências compartilhadas pelos módulos do servidor. */
export interface Contexto {
  db: Banco
  repo: Repositorio
  usuarios: ServicoUsuarios
  tempoReal: TempoReal
  backups: BackupsAutomaticos
  /** Pasta onde ficam o banco, os backups, os PDFs dos certificados e a configuração do e-mail. */
  pastaDados: string
  log: FastifyBaseLogger
}

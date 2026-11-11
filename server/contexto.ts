import type { FastifyBaseLogger } from 'fastify'
import type { ServicoCertificadoDigital } from './assinatura/contrato.ts'
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
  /**
   * O certificado digital ICP-Brasil da empresa (1.0.7, server/certificadoDigital.ts): com um instalado, todo certificado
   * emitido sai assinado. Ausente = sem o serviço (os certificados saem sem assinatura digital, como antes). O app sempre o
   * cria (criarApp), com conferir, instalar, remover e o histórico além do contrato (ServicoCertificadoDigitalCompleto).
   */
  certificadoDigital?: ServicoCertificadoDigital
}

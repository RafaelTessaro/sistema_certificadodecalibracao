import type { ResultadoCalculo } from '#shared/metrologia/tipos.ts'
import type { Balanca, CalibracaoInput, Cliente, Configuracoes, Padrao, StatusCalibracao } from '#shared/tipos.ts'
import type { MembroEquipe } from '../../lib/api'

/** Tudo o que as etapas da calibração precisam para mostrar e alterar os dados. */
export interface ContextoEtapa {
  f: CalibracaoInput
  /** Altera o rascunho (a gravação automática cuida de salvar). */
  alterar: (mudar: (f: CalibracaoInput) => CalibracaoInput) => void
  balanca: Balanca
  cliente: Cliente
  /** Todos os padrões ativos (para escolher). */
  padroes: Padrao[]
  /** Os padrões escolhidos nesta calibração. */
  selecionados: Padrao[]
  calc: { resultado: ResultadoCalculo; comoEncontrado: ResultadoCalculo | null } | null
  config: Configuracoes
  equipe: MembroEquipe[]
  status: StatusCalibracao
  /** Reabre o cadastro da balança (para corrigir Max, d, classe… sem sair da calibração). */
  editarBalanca: () => void
}

export type IdEtapa = 'identificacao' | 'instrumento' | 'padroes' | 'repetibilidade' | 'excentricidade' | 'indicacao' | 'conclusao' | 'revisao'

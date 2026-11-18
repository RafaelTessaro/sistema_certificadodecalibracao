// O armazenamento das folhas no celular, atrás de uma interface própria: no app, o SQLite (plataforma/sqlite.ts, uma
// tabela de folhas em JSON e uma de metadados); nos testes e no navegador de desenvolvimento, a memória. Se o plugin de
// SQLite for trocado, as telas e a sincronia não mudam. Grava a cada alteração. Puro.

import type { FolhaLocal } from './folha.ts'

export interface Repositorio {
  /** Todas as folhas (inclusive as entregues e retiradas, até expirarem). */
  listar(): Promise<FolhaLocal[]>
  obter(envioId: string): Promise<FolhaLocal | null>
  /** Grava a folha inteira (cria ou substitui). */
  gravar(folha: FolhaLocal): Promise<void>
  apagar(envioId: string): Promise<void>
  /** Metadados pequenos (última entrega, versão disponível…), em texto. */
  lerMeta(chave: string): Promise<string | null>
  gravarMeta(chave: string, valor: string | null): Promise<void>
}

/** Chaves dos metadados que a sincronia e as telas usam. */
export const META = {
  /** A última sincronia (`ResultadoSincronia` em JSON). */
  ultimaSincronia: 'ultima-sincronia',
  /** Hora da última entrega que deu certo (ISO). */
  ultimaEntrega: 'ultima-entrega',
} as const

/** Repositório em memória (testes; navegador de desenvolvimento). Copia na entrada e na saída, como um banco. */
export class RepositorioMemoria implements Repositorio {
  private readonly folhas = new Map<string, string>()
  private readonly meta = new Map<string, string>()
  /** Quantas gravações (os testes conferem que cada mudança grava). */
  gravacoes = 0

  async listar(): Promise<FolhaLocal[]> {
    return [...this.folhas.values()].map((t) => JSON.parse(t) as FolhaLocal)
  }

  async obter(envioId: string): Promise<FolhaLocal | null> {
    const t = this.folhas.get(envioId)
    return t ? (JSON.parse(t) as FolhaLocal) : null
  }

  async gravar(folha: FolhaLocal): Promise<void> {
    this.gravacoes++
    this.folhas.set(folha.envioId, JSON.stringify(folha))
  }

  async apagar(envioId: string): Promise<void> {
    this.folhas.delete(envioId)
  }

  async lerMeta(chave: string): Promise<string | null> {
    return this.meta.get(chave) ?? null
  }

  async gravarMeta(chave: string, valor: string | null): Promise<void> {
    if (valor === null) this.meta.delete(chave)
    else this.meta.set(chave, valor)
  }
}

// Acesso aos dados do domínio (clientes, balanças, padrões, calibrações, configurações).
// Cada registro guarda o objeto completo em `dados` (JSON) e as colunas ao lado servem para busca,
// ordenação e ligação entre as tabelas. A `versao` impede gravar por cima da alteração de outra
// pessoa (409). Toda gravação aumenta a revisão geral e avisa as telas abertas (tempo real).

import {
  completarConfig,
  CONFIG_PADRAO,
  dataIsoValida,
  descricaoBalanca,
  diasEntre,
  hojeLocalIso,
  normalizarBalanca,
  normalizarCalibracao,
  normalizarCliente,
  normalizarConfig,
  normalizarPadrao,
  textoBusca,
} from '#shared/dominio.ts'
import { somenteDigitos, normalizarCnpj } from '#shared/documentos.ts'
import { novoId } from '#shared/id.ts'
import type {
  Balanca,
  BalancaResumo,
  Calibracao,
  CalibracaoInput,
  CalibracaoResumo,
  Cliente,
  ClienteResumo,
  Configuracoes,
  EmissaoCertificado,
  Envio,
  MensagemTempoReal,
  Padrao,
  ResumoPainel,
  StatusCalibracao,
  Vencimento,
} from '#shared/tipos.ts'
import { type Banco, gravarMeta, lerMeta, transacao } from './db.ts'
import { ErroApi } from './erros.ts'

type Linha = { dados: string }

function validar<T>(r: { valor: T; erros: string[] }): T {
  if (r.erros.length) throw new ErroApi(400, r.erros[0], { erros: r.erros })
  return r.valor
}

const conflito = (oQue: string) =>
  new ErroApi(409, `Outra pessoa alterou ${oQue} enquanto você editava. Recarregue a página para ver a versão atual.`, {
    codigo: 'CONFLITO',
  })

/** Versão enviada pela tela (obrigatória nas alterações). */
function versaoDe(entrada: unknown): number | undefined {
  const v = (entrada as { versao?: unknown } | null)?.versao
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : undefined
}

/** Documento só com números e letras (para comparar CPF/CNPJ com e sem máscara). */
const chaveDocumento = (doc: string) => normalizarCnpj(doc) || somenteDigitos(doc)

export interface FiltroCalibracoes {
  status?: StatusCalibracao | 'ABERTAS' | ''
  clienteId?: string
  balancaId?: string
  busca?: string
  de?: string
  ate?: string
  limite?: number
  pagina?: number
}

export class Repositorio {
  private db: Banco
  private publicar: (msg: MensagemTempoReal) => void
  /** Relógio (os testes trocam). */
  agora: () => Date = () => new Date()

  constructor(db: Banco, publicar: (msg: MensagemTempoReal) => void = () => {}) {
    this.db = db
    this.publicar = publicar
  }

  revisao(): number {
    return Number(lerMeta(this.db, 'revisao') ?? 0)
  }

  /** Aumenta a revisão (dentro da transação) e avisa as telas depois de gravar. */
  private mudou(tipo: MensagemTempoReal['tipo'], id?: string) {
    const revisao = this.revisao() + 1
    gravarMeta(this.db, 'revisao', revisao)
    queueMicrotask(() => this.publicar({ revisao, tipo, id }))
  }

  /** Avisa as telas de uma mudança gravada fora do banco (ex.: a configuração do e-mail, num arquivo). */
  avisar(tipo: MensagemTempoReal['tipo']) {
    this.mudou(tipo)
  }

  private hoje() {
    return hojeLocalIso(this.agora())
  }

  // ---- Configurações ------------------------------------------------------------

  obterConfig(): Configuracoes {
    const l = this.db.prepare("SELECT valor FROM config WHERE chave = 'geral'").get() as { valor: string } | undefined
    if (!l) return structuredClone(CONFIG_PADRAO)
    try {
      return completarConfig(JSON.parse(l.valor))
    } catch {
      return structuredClone(CONFIG_PADRAO)
    }
  }

  salvarConfig(entrada: unknown): Configuracoes {
    const config = validar(normalizarConfig(entrada, this.obterConfig()))
    transacao(this.db, () => {
      this.db
        .prepare("INSERT INTO config (chave, valor) VALUES ('geral', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .run(JSON.stringify(config))
      this.mudou('config')
    })
    return config
  }

  // ---- Clientes -----------------------------------------------------------------

  obterCliente(id: string): Cliente | undefined {
    const l = this.db.prepare('SELECT dados FROM clientes WHERE id = ?').get(id) as Linha | undefined
    return l ? (JSON.parse(l.dados) as Cliente) : undefined
  }

  listarClientes(filtro: { busca?: string; inativos?: boolean } = {}): ClienteResumo[] {
    const termos = textoBusca(filtro.busca ?? '')
      .split(' ')
      .filter(Boolean)
    const doc = somenteDigitos(filtro.busca ?? '')
    const condicoes: string[] = []
    const params: string[] = []
    if (!filtro.inativos) condicoes.push('c.ativo = 1')
    for (const t of termos) {
      condicoes.push("(c.busca LIKE ? ESCAPE '\\' OR c.documento LIKE ?)")
      params.push(`%${t.replace(/[\\%_]/g, '\\$&')}%`, `%${doc.length >= 3 ? doc : '\u0000'}%`)
    }
    const linhas = this.db
      .prepare(
        `SELECT c.dados,
           (SELECT COUNT(*) FROM balancas b WHERE b.cliente_id = c.id AND b.ativo = 1) AS balancas,
           (SELECT COUNT(*) FROM calibracoes k WHERE k.cliente_id = c.id AND k.status = 'EMITIDO') AS certificados,
           (SELECT MAX(k.data_calibracao) FROM calibracoes k WHERE k.cliente_id = c.id AND k.status = 'EMITIDO') AS ultima
         FROM clientes c ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
         ORDER BY c.nome COLLATE NOCASE`,
      )
      .all(...params) as Array<Linha & { balancas: number; certificados: number; ultima: string | null }>
    return linhas.map((l) => ({
      ...(JSON.parse(l.dados) as Cliente),
      balancas: l.balancas,
      certificados: l.certificados,
      ultimaCalibracao: l.ultima ?? '',
    }))
  }

  /** Outro cliente com o mesmo CPF/CNPJ (para avisar antes de cadastrar em dobro). */
  clientePorDocumento(documento: string, exceto = ''): Cliente | undefined {
    const chave = chaveDocumento(documento)
    if (!chave) return undefined
    const l = this.db.prepare('SELECT dados FROM clientes WHERE documento = ? AND id <> ?').get(chave, exceto) as
      Linha | undefined
    return l ? (JSON.parse(l.dados) as Cliente) : undefined
  }

  criarCliente(entrada: unknown): Cliente {
    const valor = validar(normalizarCliente(entrada))
    return transacao(this.db, () => {
      const repetido = valor.documento ? this.clientePorDocumento(valor.documento) : undefined
      if (repetido)
        throw new ErroApi(409, `Já existe um cliente com este ${valor.tipo === 'PJ' ? 'CNPJ' : 'CPF'}: ${repetido.nome}.`, {
          codigo: 'DOCUMENTO_REPETIDO',
          id: repetido.id,
          nome: repetido.nome,
        })
      const em = this.agora().toISOString()
      const cliente: Cliente = { ...valor, id: novoId(), versao: 1, criadoEm: em, atualizadoEm: em }
      this.gravarCliente(cliente, true)
      this.mudou('cliente', cliente.id)
      return cliente
    })
  }

  atualizarCliente(id: string, entrada: unknown): Cliente {
    const valor = validar(normalizarCliente(entrada))
    return transacao(this.db, () => {
      const atual = this.obterCliente(id)
      if (!atual) throw new ErroApi(404, 'Cliente não encontrado.')
      const versao = versaoDe(entrada)
      if (versao !== undefined && versao !== atual.versao) throw conflito('este cliente')
      const repetido = valor.documento ? this.clientePorDocumento(valor.documento, id) : undefined
      if (repetido)
        throw new ErroApi(409, `Já existe outro cliente com este ${valor.tipo === 'PJ' ? 'CNPJ' : 'CPF'}: ${repetido.nome}.`, {
          codigo: 'DOCUMENTO_REPETIDO',
          id: repetido.id,
          nome: repetido.nome,
        })
      const cliente: Cliente = { ...atual, ...valor, versao: atual.versao + 1, atualizadoEm: this.agora().toISOString() }
      this.gravarCliente(cliente, false)
      this.mudou('cliente', id)
      return cliente
    })
  }

  excluirCliente(id: string) {
    transacao(this.db, () => {
      if (!this.obterCliente(id)) throw new ErroApi(404, 'Cliente não encontrado.')
      const usos = this.db
        .prepare(
          'SELECT (SELECT COUNT(*) FROM balancas WHERE cliente_id = ?) AS b, (SELECT COUNT(*) FROM calibracoes WHERE cliente_id = ?) AS c',
        )
        .get(id, id) as { b: number; c: number }
      if (usos.c > 0)
        throw new ErroApi(
          409,
          'Este cliente tem calibrações registradas e não pode ser excluído. Desative o cliente para tirá-lo da lista.',
        )
      if (usos.b > 0) throw new ErroApi(409, 'Exclua ou transfira as balanças deste cliente antes de excluí-lo.')
      this.db.prepare('DELETE FROM clientes WHERE id = ?').run(id)
      this.mudou('cliente', id)
    })
  }

  private gravarCliente(c: Cliente, novo: boolean) {
    const busca = textoBusca(c.nome, c.razaoSocial, c.documento, c.cidade, c.contato, c.email)
    const params = [
      c.tipo,
      chaveDocumento(c.documento),
      c.nome,
      busca,
      c.ativo ? 1 : 0,
      JSON.stringify(c),
      c.versao,
      c.atualizadoEm,
    ]
    if (novo)
      this.db
        .prepare(
          `INSERT INTO clientes (tipo, documento, nome, busca, ativo, dados, versao, atualizado_em, id, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...params, c.id, c.criadoEm)
    else
      this.db
        .prepare(
          `UPDATE clientes SET tipo = ?, documento = ?, nome = ?, busca = ?, ativo = ?, dados = ?, versao = ?, atualizado_em = ?
           WHERE id = ?`,
        )
        .run(...params, c.id)
  }

  // ---- Balanças -----------------------------------------------------------------

  obterBalanca(id: string): Balanca | undefined {
    const l = this.db.prepare('SELECT dados FROM balancas WHERE id = ?').get(id) as Linha | undefined
    return l ? (JSON.parse(l.dados) as Balanca) : undefined
  }

  listarBalancas(filtro: { clienteId?: string; busca?: string; inativas?: boolean } = {}): BalancaResumo[] {
    const condicoes: string[] = []
    const params: string[] = []
    if (filtro.clienteId) {
      condicoes.push('b.cliente_id = ?')
      params.push(filtro.clienteId)
    }
    if (!filtro.inativas) condicoes.push('b.ativo = 1')
    for (const t of textoBusca(filtro.busca ?? '')
      .split(' ')
      .filter(Boolean)) {
      condicoes.push("(b.busca LIKE ? ESCAPE '\\' OR c.busca LIKE ? ESCAPE '\\')")
      const p = `%${t.replace(/[\\%_]/g, '\\$&')}%`
      params.push(p, p)
    }
    const linhas = this.db
      .prepare(
        `SELECT b.dados, c.nome AS cliente_nome,
           (SELECT COUNT(*) FROM calibracoes k WHERE k.balanca_id = b.id AND k.status = 'EMITIDO') AS certificados,
           u.id AS ultimo_id, u.numero AS ultimo_numero, u.data_calibracao AS ultima, u.proxima AS proxima
         FROM balancas b
         JOIN clientes c ON c.id = b.cliente_id
         LEFT JOIN calibracoes u ON u.id = (
           SELECT k.id FROM calibracoes k WHERE k.balanca_id = b.id AND k.status = 'EMITIDO'
           ORDER BY k.data_calibracao DESC, k.data_emissao DESC LIMIT 1)
         ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
         ORDER BY c.nome COLLATE NOCASE, b.criado_em`,
      )
      .all(...params) as Array<
      Linha & {
        cliente_nome: string
        certificados: number
        ultimo_id: string | null
        ultimo_numero: string | null
        ultima: string | null
        proxima: string | null
      }
    >
    return linhas.map((l) => ({
      ...(JSON.parse(l.dados) as Balanca),
      clienteNome: l.cliente_nome,
      certificados: l.certificados,
      ultimaCalibracao: l.ultima ?? '',
      ultimoCertificado: l.ultimo_numero ?? '',
      ultimoCertificadoId: l.ultimo_id ?? '',
      proximaCalibracao: l.proxima ?? '',
    }))
  }

  criarBalanca(entrada: unknown): Balanca {
    const valor = validar(normalizarBalanca(entrada))
    return transacao(this.db, () => {
      if (!this.obterCliente(valor.clienteId)) throw new ErroApi(400, 'Cliente não encontrado. Escolha o cliente de novo.')
      const em = this.agora().toISOString()
      const balanca: Balanca = { ...valor, id: novoId(), versao: 1, criadoEm: em, atualizadoEm: em }
      this.gravarBalanca(balanca, true)
      this.mudou('balanca', balanca.id)
      return balanca
    })
  }

  atualizarBalanca(id: string, entrada: unknown): Balanca {
    const valor = validar(normalizarBalanca(entrada))
    return transacao(this.db, () => {
      const atual = this.obterBalanca(id)
      if (!atual) throw new ErroApi(404, 'Balança não encontrada.')
      const versao = versaoDe(entrada)
      if (versao !== undefined && versao !== atual.versao) throw conflito('esta balança')
      if (!this.obterCliente(valor.clienteId)) throw new ErroApi(400, 'Cliente não encontrado. Escolha o cliente de novo.')
      const balanca: Balanca = { ...atual, ...valor, versao: atual.versao + 1, atualizadoEm: this.agora().toISOString() }
      this.gravarBalanca(balanca, false)
      // Rascunhos abertos desta balança acompanham a troca de cliente
      if (valor.clienteId !== atual.clienteId)
        this.db
          .prepare("UPDATE calibracoes SET cliente_id = ? WHERE balanca_id = ? AND status IN ('RASCUNHO','REVISAO')")
          .run(valor.clienteId, id)
      this.mudou('balanca', id)
      return balanca
    })
  }

  excluirBalanca(id: string) {
    transacao(this.db, () => {
      if (!this.obterBalanca(id)) throw new ErroApi(404, 'Balança não encontrada.')
      const n = (this.db.prepare('SELECT COUNT(*) AS n FROM calibracoes WHERE balanca_id = ?').get(id) as { n: number }).n
      if (n > 0)
        throw new ErroApi(
          409,
          'Esta balança tem calibrações registradas e não pode ser excluída. Desative a balança para tirá-la da lista.',
        )
      this.db.prepare('DELETE FROM balancas WHERE id = ?').run(id)
      this.mudou('balanca', id)
    })
  }

  private gravarBalanca(b: Balanca, nova: boolean) {
    const busca = textoBusca(b.fabricante, b.modelo, b.numeroSerie, b.identificacao, b.localInstalacao, b.indicadorSerie)
    const params = [b.clienteId, b.numeroSerie, busca, b.ativo ? 1 : 0, JSON.stringify(b), b.versao, b.atualizadoEm]
    if (nova)
      this.db
        .prepare(
          `INSERT INTO balancas (cliente_id, numero_serie, busca, ativo, dados, versao, atualizado_em, id, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...params, b.id, b.criadoEm)
    else
      this.db
        .prepare(
          'UPDATE balancas SET cliente_id = ?, numero_serie = ?, busca = ?, ativo = ?, dados = ?, versao = ?, atualizado_em = ? WHERE id = ?',
        )
        .run(...params, b.id)
  }

  // ---- Padrões ------------------------------------------------------------------

  obterPadrao(id: string): Padrao | undefined {
    const l = this.db.prepare('SELECT dados FROM padroes WHERE id = ?').get(id) as Linha | undefined
    return l ? (JSON.parse(l.dados) as Padrao) : undefined
  }

  listarPadroes(filtro: { inativos?: boolean } = {}): Padrao[] {
    const linhas = this.db
      .prepare(
        `SELECT dados FROM padroes ${filtro.inativos ? '' : 'WHERE ativo = 1'} ORDER BY tipo, identificacao COLLATE NOCASE`,
      )
      .all() as Linha[]
    return linhas.map((l) => JSON.parse(l.dados) as Padrao)
  }

  criarPadrao(entrada: unknown): Padrao {
    const valor = validar(normalizarPadrao(entrada))
    return transacao(this.db, () => {
      this.verificarIdentificacao(valor.identificacao)
      const em = this.agora().toISOString()
      const padrao: Padrao = { ...valor, id: novoId(), versao: 1, criadoEm: em, atualizadoEm: em }
      this.gravarPadrao(padrao, true)
      this.mudou('padrao', padrao.id)
      return padrao
    })
  }

  atualizarPadrao(id: string, entrada: unknown): Padrao {
    const valor = validar(normalizarPadrao(entrada))
    return transacao(this.db, () => {
      const atual = this.obterPadrao(id)
      if (!atual) throw new ErroApi(404, 'Padrão não encontrado.')
      const versao = versaoDe(entrada)
      if (versao !== undefined && versao !== atual.versao) throw conflito('este padrão')
      this.verificarIdentificacao(valor.identificacao, id)
      const padrao: Padrao = { ...atual, ...valor, versao: atual.versao + 1, atualizadoEm: this.agora().toISOString() }
      this.gravarPadrao(padrao, false)
      this.mudou('padrao', id)
      return padrao
    })
  }

  excluirPadrao(id: string) {
    transacao(this.db, () => {
      if (!this.obterPadrao(id)) throw new ErroApi(404, 'Padrão não encontrado.')
      const usado = this.db.prepare('SELECT 1 FROM calibracoes WHERE dados LIKE ? LIMIT 1').get(`%"${id}"%`)
      if (usado)
        throw new ErroApi(
          409,
          'Este padrão foi usado em calibrações e não pode ser excluído. Desative o padrão para tirá-lo de uso.',
        )
      this.db.prepare('DELETE FROM padroes WHERE id = ?').run(id)
      this.mudou('padrao', id)
    })
  }

  private verificarIdentificacao(identificacao: string, exceto = '') {
    const outro = this.db
      .prepare('SELECT 1 FROM padroes WHERE identificacao = ? COLLATE NOCASE AND id <> ?')
      .get(identificacao, exceto)
    if (outro) throw new ErroApi(409, `Já existe um padrão com a identificação ${identificacao}.`)
  }

  private gravarPadrao(p: Padrao, novo: boolean) {
    const busca = textoBusca(p.identificacao, p.descricao, p.fabricante, p.numeroSerie, p.certificado, p.laboratorio)
    const params = [p.identificacao, p.tipo, p.validade, busca, p.ativo ? 1 : 0, JSON.stringify(p), p.versao, p.atualizadoEm]
    if (novo)
      this.db
        .prepare(
          `INSERT INTO padroes (identificacao, tipo, validade, busca, ativo, dados, versao, atualizado_em, id, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...params, p.id, p.criadoEm)
    else
      this.db
        .prepare(
          `UPDATE padroes SET identificacao = ?, tipo = ?, validade = ?, busca = ?, ativo = ?, dados = ?, versao = ?, atualizado_em = ?
           WHERE id = ?`,
        )
        .run(...params, p.id)
  }

  // ---- Calibrações -----------------------------------------------------------------

  obterCalibracao(id: string): Calibracao | undefined {
    const l = this.db.prepare('SELECT dados FROM calibracoes WHERE id = ?').get(id) as Linha | undefined
    return l ? (JSON.parse(l.dados) as Calibracao) : undefined
  }

  /** Certificado emitido pelo código de autenticidade (QR code). */
  calibracaoPorCodigo(codigo: string): Calibracao | undefined {
    const l = this.db.prepare('SELECT dados FROM calibracoes WHERE codigo = ?').get(codigo.toUpperCase()) as Linha | undefined
    return l ? (JSON.parse(l.dados) as Calibracao) : undefined
  }

  listarCalibracoes(filtro: FiltroCalibracoes = {}): { itens: CalibracaoResumo[]; total: number } {
    const condicoes: string[] = []
    const params: Array<string | number> = []
    if (filtro.status === 'ABERTAS') condicoes.push("k.status IN ('RASCUNHO','REVISAO')")
    else if (filtro.status) {
      condicoes.push('k.status = ?')
      params.push(filtro.status)
    }
    if (filtro.clienteId) {
      condicoes.push('k.cliente_id = ?')
      params.push(filtro.clienteId)
    }
    if (filtro.balancaId) {
      condicoes.push('k.balanca_id = ?')
      params.push(filtro.balancaId)
    }
    if (dataIsoValida(filtro.de)) {
      condicoes.push("COALESCE(NULLIF(k.data_emissao, ''), k.data_calibracao) >= ?")
      params.push(filtro.de)
    }
    if (dataIsoValida(filtro.ate)) {
      condicoes.push("COALESCE(NULLIF(k.data_emissao, ''), k.data_calibracao) <= ?")
      params.push(filtro.ate)
    }
    for (const t of textoBusca(filtro.busca ?? '')
      .split(' ')
      .filter(Boolean)) {
      condicoes.push("k.busca LIKE ? ESCAPE '\\'")
      params.push(`%${t.replace(/[\\%_]/g, '\\$&')}%`)
    }
    const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM calibracoes k ${onde}`).get(...params) as { n: number }).n
    const limite = Math.min(Math.max(filtro.limite ?? 50, 1), 500)
    const pagina = Math.max(filtro.pagina ?? 1, 1)
    const linhas = this.db
      .prepare(
        `SELECT k.dados, c.nome AS cliente_nome, b.dados AS balanca_dados,
           (SELECT COUNT(*) FROM envios e WHERE e.calibracao_id = k.id) AS envios
         FROM calibracoes k
         JOIN clientes c ON c.id = k.cliente_id
         JOIN balancas b ON b.id = k.balanca_id
         ${onde}
         ORDER BY CASE WHEN k.status IN ('RASCUNHO','REVISAO') THEN 0 ELSE 1 END,
                  COALESCE(NULLIF(k.data_emissao, ''), k.atualizado_em) DESC, k.sequencia DESC, k.revisao DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limite, (pagina - 1) * limite) as Array<
      Linha & { cliente_nome: string; balanca_dados: string; envios: number }
    >
    const nomes = this.nomesUsuarios()
    return {
      total,
      itens: linhas.map((l) =>
        this.resumo(JSON.parse(l.dados) as Calibracao, l.cliente_nome, JSON.parse(l.balanca_dados), l.envios, nomes),
      ),
    }
  }

  private nomesUsuarios(): Map<string, string> {
    const linhas = this.db.prepare('SELECT id, nome FROM usuarios').all() as Array<{ id: string; nome: string }>
    return new Map(linhas.map((u) => [u.id, u.nome]))
  }

  private resumo(k: Calibracao, clienteNome: string, b: Balanca, envios: number, nomes: Map<string, string>): CalibracaoResumo {
    // Emitido: os dados congelados no certificado (o cadastro pode ter mudado depois)
    const balanca = k.emissao?.balanca ?? b
    return {
      id: k.id,
      versao: k.versao,
      status: k.status,
      numero: k.numero,
      revisao: k.revisao,
      clienteId: k.clienteId,
      clienteNome: k.emissao?.cliente.nome ?? clienteNome,
      balancaId: k.balancaId,
      balancaDescricao: descricaoBalanca(balanca),
      balancaSerie: balanca.numeroSerie,
      ordemServico: k.ordemServico,
      dataCalibracao: k.dataCalibracao,
      dataEmissao: k.dataEmissao,
      proximaCalibracao: k.proximaCalibracao,
      tecnicoNome: k.emissao?.tecnico.nome ?? nomes.get(k.tecnicoId) ?? '',
      substituiId: k.substituiId,
      atualizadoEm: k.atualizadoEm,
      envios,
    }
  }

  resumoCalibracao(id: string): CalibracaoResumo | undefined {
    const k = this.obterCalibracao(id)
    if (!k) return undefined
    const c = this.obterCliente(k.clienteId)
    const b = this.obterBalanca(k.balancaId)
    if (!c || !b) return undefined
    const envios = (this.db.prepare('SELECT COUNT(*) AS n FROM envios WHERE calibracao_id = ?').get(id) as { n: number }).n
    return this.resumo(k, c.nome, b, envios, this.nomesUsuarios())
  }

  criarCalibracao(entrada: unknown, autor: { id: string; nome: string }): Calibracao {
    const valor = validar(normalizarCalibracao(entrada))
    return transacao(this.db, () => {
      this.verificarLigacoes(valor)
      const em = this.agora().toISOString()
      const k: Calibracao = {
        ...valor,
        id: novoId(),
        versao: 1,
        status: 'RASCUNHO',
        numero: '',
        ano: null,
        sequencia: null,
        revisao: 0,
        tecnicoId: valor.tecnicoId || autor.id,
        cancelamento: null,
        emissao: null,
        criadoPor: autor.nome,
        criadoEm: em,
        atualizadoEm: em,
      }
      // Revisão de um certificado emitido: herda o número e ganha o sufixo -R1, -R2…
      if (valor.substituiId) {
        const original = this.obterCalibracao(valor.substituiId)
        if (!original || original.status !== 'EMITIDO')
          throw new ErroApi(409, 'Só um certificado emitido (e ainda não substituído) pode ser revisado.')
        const aberta = this.db
          .prepare("SELECT 1 FROM calibracoes WHERE substitui_id = ? AND status IN ('RASCUNHO','REVISAO')")
          .get(original.id)
        if (aberta) throw new ErroApi(409, 'Já existe uma revisão em andamento para este certificado.')
        k.revisao = original.revisao + 1
      }
      this.gravarCalibracao(k, true)
      this.mudou('calibracao', k.id)
      return k
    })
  }

  atualizarCalibracao(id: string, entrada: unknown): Calibracao {
    const valor = validar(normalizarCalibracao(entrada))
    return transacao(this.db, () => {
      const atual = this.obterCalibracao(id)
      if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
      if (atual.status !== 'RASCUNHO' && atual.status !== 'REVISAO')
        throw new ErroApi(409, 'Este certificado já foi emitido e não pode mais ser alterado. Para corrigir, faça uma revisão.')
      const versao = versaoDe(entrada)
      if (versao !== undefined && versao !== atual.versao) throw conflito('esta calibração')
      this.verificarLigacoes(valor)
      const k: Calibracao = {
        ...atual,
        ...valor,
        // A revisão continua ligada ao certificado que substitui
        substituiId: atual.substituiId,
        tecnicoId: valor.tecnicoId || atual.tecnicoId,
        versao: atual.versao + 1,
        atualizadoEm: this.agora().toISOString(),
      }
      this.gravarCalibracao(k, false)
      this.mudou('calibracao', id)
      return k
    })
  }

  /** Muda a situação de um rascunho (RASCUNHO ↔ REVISAO). */
  mudarSituacao(id: string, status: 'RASCUNHO' | 'REVISAO', versao?: number): Calibracao {
    return transacao(this.db, () => {
      const atual = this.obterCalibracao(id)
      if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
      if (atual.status !== 'RASCUNHO' && atual.status !== 'REVISAO') throw new ErroApi(409, 'Este certificado já foi emitido.')
      if (versao !== undefined && versao !== atual.versao) throw conflito('esta calibração')
      const k: Calibracao = { ...atual, status, versao: atual.versao + 1, atualizadoEm: this.agora().toISOString() }
      this.gravarCalibracao(k, false)
      this.mudou('calibracao', id)
      return k
    })
  }

  excluirRascunho(id: string) {
    transacao(this.db, () => {
      const atual = this.obterCalibracao(id)
      if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
      if (atual.status !== 'RASCUNHO' && atual.status !== 'REVISAO')
        throw new ErroApi(409, 'Certificado emitido não pode ser excluído. Use "Cancelar certificado".')
      this.db.prepare('DELETE FROM calibracoes WHERE id = ?').run(id)
      this.mudou('calibracao', id)
    })
  }

  /**
   * Emite: reserva o número (sequência do ano, nunca reutilizada), grava os dados congelados e,
   * numa revisão, marca o certificado original como substituído. O PDF é gerado depois, a partir
   * desses dados (ver server/certificados.ts).
   */
  emitir(
    id: string,
    montar: (k: Calibracao, numeracao: { ano: number; sequencia: number; numero: string; codigo: string }) => EmissaoCertificado,
    opcoes: { versao?: number; numero: (seq: number, ano: number, revisao: number) => string; codigo: () => string },
  ): Calibracao {
    return transacao(this.db, () => {
      const atual = this.obterCalibracao(id)
      if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
      if (atual.status !== 'RASCUNHO' && atual.status !== 'REVISAO') throw new ErroApi(409, 'Este certificado já foi emitido.')
      if (opcoes.versao !== undefined && opcoes.versao !== atual.versao) throw conflito('esta calibração')
      let ano: number
      let sequencia: number
      const original = atual.substituiId ? this.obterCalibracao(atual.substituiId) : undefined
      if (atual.substituiId) {
        if (!original || original.status !== 'EMITIDO' || original.ano === null || original.sequencia === null)
          throw new ErroApi(409, 'O certificado que esta revisão substitui não está mais emitido.')
        ano = original.ano
        sequencia = original.sequencia
      } else {
        ano = Number(this.hoje().slice(0, 4))
        const chave = `sequencia_${ano}`
        sequencia = Number(lerMeta(this.db, chave) ?? 0) + 1
        gravarMeta(this.db, chave, sequencia)
      }
      const numero = opcoes.numero(sequencia, ano, atual.revisao)
      let codigo = opcoes.codigo()
      while (this.db.prepare('SELECT 1 FROM calibracoes WHERE codigo = ?').get(codigo)) codigo = opcoes.codigo()
      const em = this.agora().toISOString()
      const base: Calibracao = { ...atual, status: 'EMITIDO', ano, sequencia, numero, dataEmissao: this.hoje() }
      const emissao = montar(base, { ano, sequencia, numero, codigo })
      const k: Calibracao = { ...base, emissao, versao: atual.versao + 1, atualizadoEm: em }
      this.gravarCalibracao(k, false)
      if (original) {
        const substituido: Calibracao = { ...original, status: 'SUBSTITUIDO', versao: original.versao + 1, atualizadoEm: em }
        this.gravarCalibracao(substituido, false)
      }
      this.mudou('calibracao', id)
      return k
    })
  }

  /** Grava o hash e o arquivo do PDF gerado (não muda a versão: é complemento da emissão). */
  registrarPdf(id: string, arquivo: string, hashPdf: string) {
    transacao(this.db, () => {
      const k = this.obterCalibracao(id)
      if (!k?.emissao) return
      const atualizado: Calibracao = { ...k, emissao: { ...k.emissao, arquivo, hashPdf } }
      this.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(atualizado), id)
    })
  }

  cancelar(id: string, motivo: string, autor: { nome: string }, versao?: number): Calibracao {
    const texto = String(motivo ?? '').trim()
    if (texto.length < 5) throw new ErroApi(400, 'Explique o motivo do cancelamento (fica registrado).')
    return transacao(this.db, () => {
      const atual = this.obterCalibracao(id)
      if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
      if (atual.status !== 'EMITIDO') throw new ErroApi(409, 'Só um certificado emitido pode ser cancelado.')
      if (versao !== undefined && versao !== atual.versao) throw conflito('este certificado')
      const em = this.agora().toISOString()
      const k: Calibracao = {
        ...atual,
        status: 'CANCELADO',
        cancelamento: { motivo: texto.slice(0, 500), por: autor.nome, em },
        versao: atual.versao + 1,
        atualizadoEm: em,
      }
      this.gravarCalibracao(k, false)
      this.mudou('calibracao', id)
      return k
    })
  }

  private verificarLigacoes(k: CalibracaoInput) {
    const balanca = this.obterBalanca(k.balancaId)
    if (!balanca) throw new ErroApi(400, 'Balança não encontrada. Escolha a balança de novo.')
    if (balanca.clienteId !== k.clienteId) throw new ErroApi(400, 'A balança escolhida é de outro cliente.')
    if (!this.obterCliente(k.clienteId)) throw new ErroApi(400, 'Cliente não encontrado.')
  }

  private gravarCalibracao(k: Calibracao, nova: boolean) {
    const cliente = k.emissao?.cliente ?? this.obterCliente(k.clienteId)
    const balanca = k.emissao?.balanca ?? this.obterBalanca(k.balancaId)
    const busca = textoBusca(
      k.numero,
      k.ordemServico,
      cliente?.nome,
      cliente?.razaoSocial,
      cliente?.documento,
      balanca?.fabricante,
      balanca?.modelo,
      balanca?.numeroSerie,
      balanca?.identificacao,
    )
    const colunas = {
      status: k.status,
      ano: k.ano,
      sequencia: k.sequencia,
      revisao: k.revisao,
      numero: k.numero,
      cliente_id: k.clienteId,
      balanca_id: k.balancaId,
      ordem_servico: k.ordemServico,
      data_calibracao: k.dataCalibracao,
      data_emissao: k.dataEmissao,
      proxima: k.proximaCalibracao,
      substitui_id: k.substituiId,
      codigo: k.emissao?.codigo ?? '',
      busca,
      dados: JSON.stringify(k),
      versao: k.versao,
      atualizado_em: k.atualizadoEm,
    }
    const nomes = Object.keys(colunas)
    const valores = Object.values(colunas) as Array<string | number | null>
    if (nova)
      this.db
        .prepare(`INSERT INTO calibracoes (${nomes.join(', ')}, id, criado_em) VALUES (${nomes.map(() => '?').join(', ')}, ?, ?)`)
        .run(...valores, k.id, k.criadoEm)
    else this.db.prepare(`UPDATE calibracoes SET ${nomes.map((n) => `${n} = ?`).join(', ')} WHERE id = ?`).run(...valores, k.id)
  }

  // ---- Envios por e-mail ------------------------------------------------------------

  registrarEnvio(e: Omit<Envio, 'id' | 'em'> & { usuarioId: string }) {
    transacao(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO envios (id, calibracao_id, cliente_id, tipo, para, assunto, usuario_id, usuario_nome, em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          novoId(),
          e.calibracaoId,
          e.clienteId,
          e.tipo,
          e.para,
          e.assunto,
          e.usuarioId,
          e.usuarioNome,
          this.agora().toISOString(),
        )
      this.mudou('calibracao', e.calibracaoId || undefined)
    })
  }

  /** Revisões feitas a partir de um certificado: a emitida que o substituiu e a que está em andamento. */
  revisoesDe(id: string): Array<{ id: string; numero: string; status: StatusCalibracao }> {
    return this.db
      .prepare('SELECT id, numero, status FROM calibracoes WHERE substitui_id = ? ORDER BY criado_em')
      .all(id) as Array<{ id: string; numero: string; status: StatusCalibracao }>
  }

  listarEnvios(filtro: { calibracaoId?: string; clienteId?: string }): Envio[] {
    const [cond, valor] = filtro.calibracaoId
      ? ['calibracao_id = ?', filtro.calibracaoId]
      : ['cliente_id = ?', filtro.clienteId ?? '']
    const linhas = this.db.prepare(`SELECT * FROM envios WHERE ${cond} ORDER BY em DESC LIMIT 100`).all(valor) as Array<
      Record<string, string>
    >
    return linhas.map((l) => ({
      id: l.id,
      calibracaoId: l.calibracao_id,
      clienteId: l.cliente_id,
      tipo: l.tipo as Envio['tipo'],
      para: l.para,
      assunto: l.assunto,
      usuarioNome: l.usuario_nome,
      em: l.em,
    }))
  }

  // ---- Vencimentos e painel -----------------------------------------------------------

  /**
   * Balanças ativas cuja última calibração emitida tem a próxima calibração combinada com o
   * cliente: vencidas e as que vencem nos próximos `dias` (ou todas, com `dias` = Infinity).
   */
  vencimentos(dias: number): Vencimento[] {
    const hoje = this.hoje()
    const linhas = this.db
      .prepare(
        `SELECT b.id AS balanca_id, b.dados AS balanca, c.id AS cliente_id, c.dados AS cliente,
                k.id AS calibracao_id, k.numero, k.data_calibracao, k.proxima,
                (SELECT MAX(e.em) FROM envios e WHERE e.tipo = 'LEMBRETE' AND e.cliente_id = c.id AND e.em >= k.data_emissao) AS lembrete
         FROM balancas b
         JOIN clientes c ON c.id = b.cliente_id
         JOIN calibracoes k ON k.id = (
           SELECT x.id FROM calibracoes x WHERE x.balanca_id = b.id AND x.status = 'EMITIDO'
           ORDER BY x.data_calibracao DESC, x.data_emissao DESC LIMIT 1)
         WHERE b.ativo = 1 AND c.ativo = 1 AND k.proxima <> ''
         ORDER BY k.proxima`,
      )
      .all() as Array<Record<string, string | null>>
    return linhas
      .map((l) => {
        const b = JSON.parse(l.balanca!) as Balanca
        const c = JSON.parse(l.cliente!) as Cliente
        return {
          balancaId: l.balanca_id!,
          balancaDescricao: descricaoBalanca(b),
          numeroSerie: b.numeroSerie,
          identificacao: b.identificacao,
          clienteId: l.cliente_id!,
          clienteNome: c.nome,
          clienteEmail: c.emailCertificados || c.email,
          ultimaCalibracao: l.data_calibracao ?? '',
          ultimoCertificado: l.numero ?? '',
          ultimoCertificadoId: l.calibracao_id!,
          proximaCalibracao: l.proxima!,
          dias: diasEntre(hoje, l.proxima!),
          lembreteEm: l.lembrete ?? '',
        }
      })
      .filter((v) => v.dias <= dias)
  }

  painel(): ResumoPainel {
    const hoje = this.hoje()
    const mes = hoje.slice(0, 7)
    const d = this.agora()
    const anterior = hojeLocalIso(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7)
    const contar = (sql: string, ...p: string[]) => (this.db.prepare(sql).get(...p) as { n: number }).n
    const config = this.obterConfig()
    const venc = this.vencimentos(config.diasAvisoVencimento)
    const inicio12 = hojeLocalIso(new Date(d.getFullYear(), d.getMonth() - 11, 1)).slice(0, 7)
    const porMesLinhas = this.db
      .prepare(
        `SELECT substr(data_emissao, 1, 7) AS mes, COUNT(*) AS n FROM calibracoes
         WHERE status IN ('EMITIDO','SUBSTITUIDO') AND revisao = 0 AND substr(data_emissao, 1, 7) >= ? GROUP BY mes`,
      )
      .all(inicio12) as Array<{ mes: string; n: number }>
    const porMes: ResumoPainel['porMes'] = []
    for (let i = 11; i >= 0; i--) {
      const m = hojeLocalIso(new Date(d.getFullYear(), d.getMonth() - i, 1)).slice(0, 7)
      porMes.push({ mes: m, quantidade: porMesLinhas.find((x) => x.mes === m)?.n ?? 0 })
    }
    const padroesVencendo = this.listarPadroes()
      .filter((p) => !p.validade || diasEntre(hoje, p.validade) <= Math.max(config.diasAvisoVencimento, 30))
      .sort((a, b) => (a.validade || '0').localeCompare(b.validade || '0'))
      .map((p) => ({ id: p.id, identificacao: p.identificacao, descricao: p.descricao, validade: p.validade }))
    const emitidos = (prefixo: string) =>
      contar(
        "SELECT COUNT(*) AS n FROM calibracoes WHERE status IN ('EMITIDO','SUBSTITUIDO') AND revisao = 0 AND data_emissao LIKE ?",
        `${prefixo}%`,
      )
    return {
      emitidosMes: emitidos(mes),
      emitidosMesAnterior: emitidos(anterior),
      emitidosAno: emitidos(hoje.slice(0, 4)),
      rascunhos: contar("SELECT COUNT(*) AS n FROM calibracoes WHERE status IN ('RASCUNHO','REVISAO')"),
      vencendo: venc.filter((v) => v.dias >= 0).length,
      vencidas: venc.filter((v) => v.dias < 0).length,
      padroesVencendo,
      porMes,
      ultimos: this.listarCalibracoes({ status: 'EMITIDO', limite: 6 }).itens,
      emAndamento: this.listarCalibracoes({ status: 'ABERTAS', limite: 6 }).itens,
      clientes: contar('SELECT COUNT(*) AS n FROM clientes WHERE ativo = 1'),
      balancas: contar('SELECT COUNT(*) AS n FROM balancas WHERE ativo = 1'),
    }
  }
}

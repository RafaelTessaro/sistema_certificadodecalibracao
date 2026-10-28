// Acesso aos dados do domínio (clientes, balanças, padrões, calibrações, configurações).
// Cada registro guarda o objeto completo em `dados` (JSON) e as colunas ao lado servem para busca,
// ordenação e ligação entre as tabelas. A `versao` impede gravar por cima da alteração de outra
// pessoa (409). Toda gravação aumenta a revisão geral e avisa as telas abertas (tempo real).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  arquivoDoCertificadoAnterior,
  calibracaoEmOutraUnidade,
  certificadosAnterioresApos,
  completarConfig,
  CONFIG_PADRAO,
  dataIsoValida,
  descricaoBalanca,
  diasEntre,
  enderecoCliente,
  formatarNumeroCertificado,
  hojeLocalIso,
  lerNumeroCertificado,
  normalizarBalanca,
  normalizarCalibracao,
  normalizarCliente,
  normalizarConfig,
  normalizarPadrao,
  parteSeparada,
  textoBusca,
  textoBuscaBalanca,
} from '#shared/dominio.ts'
import { normalizarPop, textoPop, tipoDoMime, TIPOS_DA_FINALIDADE, type FinalidadeArquivo } from '#shared/arquivos.ts'
import { somenteDigitos, normalizarCnpj } from '#shared/documentos.ts'
import { novoId } from '#shared/id.ts'
import type {
  ArquivoAnexo,
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
  FolhaCampoImpressa,
  MensagemTempoReal,
  NumeroReservado,
  Padrao,
  ResumoPainel,
  StatusCalibracao,
  Vencimento,
  VersaoPop,
} from '#shared/tipos.ts'
import { type Banco, gravarMeta, lerMeta, transacao } from './db.ts'
import { ErroApi } from './erros.ts'

/** A folha foi impressa para esta calibração (a dela, ou uma folha nova dela), e não avulsa e ligada depois. */
export const impressaPara = (chave: string, calibracaoId: string) =>
  chave === `calibracao:${calibracaoId}` || chave.startsWith(`calibracao:${calibracaoId}:`)

/** O que mudou nos nºs de certificado reservados, para a rota pôr no registro de atividades. */
export interface EventoNumero {
  acao: 'NUMERO_RESERVADO' | 'NUMERO_NAO_UTILIZADO'
  numero: string
  /** A calibração (alvo do registro, com link); '' = folha avulsa ou calibração excluída. */
  calibracaoId: string
  detalhe: string
}

/**
 * O nº de certificado impresso na folha ligada a uma calibração: `usado` = é o do certificado dela; senão, o
 * `motivo` (a tela avisa para corrigir a etiqueta).
 */
export interface NumeroDaFolha {
  numero: string
  usado: boolean
  motivo?: string
}

/** Troca de folhas de uma calibração: as substituídas, as avulsas que ficaram livres e os nºs que voltaram a elas. */
interface TrocaFolhas {
  substituidas: string[]
  liberadas: string[]
  eventos: EventoNumero[]
}

const semTroca = (): TrocaFolhas => ({ substituidas: [], liberadas: [], eventos: [] })

type LinhaNumero = {
  id: number
  numero: string
  ano: number
  sequencia: number
  calibracao_id: string
  folha: string
  reservado_em: string
  reservado_por: string
  situacao: NumeroReservado['situacao']
  motivo: string
  situacao_em: string
  situacao_por: string
}

const numeroDaLinha = (l: LinhaNumero): NumeroReservado => ({
  id: Number(l.id),
  numero: l.numero,
  ano: Number(l.ano),
  sequencia: Number(l.sequencia),
  calibracaoId: l.calibracao_id,
  folha: l.folha,
  reservadoEm: l.reservado_em,
  reservadoPor: l.reservado_por,
  situacao: l.situacao,
  motivo: l.motivo,
  situacaoEm: l.situacao_em,
  situacaoPor: l.situacao_por,
})

/**
 * Chave da folha que voltou ao registro pela pasta das folhas de campo (o banco veio de uma cópia anterior
 * à impressão dela): 'recuperada:FC-2026-00042'.
 */
export const CHAVE_RECUPERADA = 'recuperada:'

/**
 * A data da impressão gravada no PDF da folha (/CreationDate: a da reserva do nº, ver server/pdf/folhaCampo.ts),
 * em ISO; null se não houver. A data do arquivo pode mudar quando a pasta volta da cópia de segurança externa;
 * a do PDF, não.
 */
export function dataDaImpressaoNoPdf(pdf: Buffer): string | null {
  const texto = pdf.toString('latin1')
  // Direto no dicionário (/CreationDate (D:…)) ou num objeto à parte (/CreationDate 30 0 R), como o pdfkit grava
  const ref = /\/CreationDate\s*(?:\(([^)]*)\)|(\d+)\s+(\d+)\s+R)/.exec(texto)
  const valor = ref && (ref[1] ?? new RegExp(`(?:^|\\s)${ref[2]}\\s+${ref[3]}\\s+obj\\s*\\(([^)]*)\\)`).exec(texto)?.[1])
  const m = valor ? /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:Z|([+-])(\d{2})'?(\d{2})'?)?/.exec(valor) : null
  if (!m) return null
  const [ano, mes, dia, hora, minuto, segundo] = m.slice(1, 7).map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59 || segundo > 59) return null
  // "+03'00'": a hora local está 3 h à frente do UTC
  const fuso = m[7] ? (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) : 0
  return new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo) - fuso * 60_000).toISOString()
}

/** Texto de uma string literal do PDF ("(…)" com os escapes; UTF-16BE quando começa com a marca FE FF). */
function textoDaStringPdf(bruto: string): string {
  const bytes: number[] = []
  for (let i = 0; i < bruto.length; i++) {
    const c = bruto[i]
    if (c !== '\\') {
      bytes.push(c.charCodeAt(0) & 0xff)
      continue
    }
    const p = bruto[++i] ?? ''
    const octal = /^[0-7]{1,3}/.exec(bruto.slice(i, i + 3))
    if (octal) {
      bytes.push(parseInt(octal[0], 8) & 0xff)
      i += octal[0].length - 1
    } else if (p === '\r' || p === '\n') {
      // Continuação de linha
      if (p === '\r' && bruto[i + 1] === '\n') i++
    } else bytes.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 } as Record<string, number>)[p] ?? p.charCodeAt(0))
  }
  const b = Buffer.from(bytes)
  if (b[0] === 0xfe && b[1] === 0xff) {
    const le = Buffer.from(b.subarray(2))
    le.swap16()
    return le.toString('utf16le')
  }
  return b.toString('latin1')
}

/**
 * O nº do certificado impresso na folha de campo, lido do PDF guardado (nas palavras-chave: "certificado
 * CC-2026-00042", ver server/pdf/folhaCampo.ts); '' se não houver (folha de antes desta versão, de uma revisão).
 */
export function numeroCertificadoNoPdf(pdf: Buffer): string {
  const texto = pdf.toString('latin1')
  // Direto no dicionário (/Keywords (…)) ou num objeto à parte (/Keywords 31 0 R), como o pdfkit grava
  const literal = String.raw`\(((?:\\[\s\S]|[^\\)])*)\)`
  const ref = new RegExp(String.raw`\/Keywords\s*(?:${literal}|(\d+)\s+(\d+)\s+R)`).exec(texto)
  const bruto = ref && (ref[1] ?? new RegExp(String.raw`(?:^|\s)${ref[2]}\s+${ref[3]}\s+obj\s*${literal}`).exec(texto)?.[1])
  if (bruto === null || bruto === undefined) return ''
  const m = /(?:^|;\s*)certificado\s+([^;]+?)\s*(?:;|$)/.exec(textoDaStringPdf(bruto))
  return m ? m[1] : ''
}

type Linha = { dados: string }

/** Nomes dos anexos gravados com o envio (JSON); [] nos envios antigos. */
function anexosDoEnvio(v: string | undefined): string[] {
  if (!v) return []
  try {
    const lista = JSON.parse(v)
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

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

  /** Pasta dos PDFs das folhas de campo (<pasta de dados>/folhas-campo); sem ela, o PDF fica no banco. */
  private pastaFolhas: string

  constructor(db: Banco, publicar: (msg: MensagemTempoReal) => void = () => {}, opcoes: { pastaFolhas?: string } = {}) {
    this.db = db
    this.publicar = publicar
    this.pastaFolhas = opcoes.pastaFolhas ?? ''
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

  /**
   * Configurações. O código e a revisão do procedimento (`textos.procedimento`) vêm sempre da revisão
   * vigente do POP ('' sem POP registrado), não do que foi gravado nas configurações.
   */
  obterConfig(): Configuracoes {
    const l = this.db.prepare("SELECT valor FROM config WHERE chave = 'geral'").get() as { valor: string } | undefined
    let config: Configuracoes
    try {
      config = l ? completarConfig(JSON.parse(l.valor)) : structuredClone(CONFIG_PADRAO)
    } catch {
      config = structuredClone(CONFIG_PADRAO)
    }
    return this.comPop(config)
  }

  private comPop(c: Configuracoes): Configuracoes {
    const pop = this.popVigente()
    return { ...c, textos: { ...c.textos, procedimento: pop ? textoPop(pop) : '' } }
  }

  salvarConfig(entrada: unknown): Configuracoes {
    const config = validar(normalizarConfig(entrada, this.obterConfig()))
    transacao(this.db, () => {
      this.db
        .prepare("INSERT INTO config (chave, valor) VALUES ('geral', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .run(JSON.stringify(config))
      this.mudou('config')
    })
    return this.comPop(config)
  }

  // ---- Arquivos guardados (certificados dos padrões e POP) -------------------------------

  /**
   * Guarda o conteúdo (já conferido: tipo e tamanho) e devolve a referência com o nome deste envio. O mesmo
   * conteúdo já guardado é reaproveitado (a linha é a mesma, pelo SHA-256).
   */
  guardarArquivo(conteudo: Buffer, e: { nome: string; tipo: string; por: string }): ArquivoAnexo {
    const sha256 = createHash('sha256').update(conteudo).digest('hex')
    const em = this.agora().toISOString()
    transacao(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO arquivos (sha256, nome, tipo, tamanho, conteudo, criado_em, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(sha256) DO NOTHING`,
        )
        .run(sha256, e.nome, e.tipo, conteudo.length, conteudo, em, e.por)
    })
    const info = this.infoArquivo(sha256)!
    return { sha256, nome: e.nome, tamanho: info.tamanho, tipo: info.tipo, enviadoEm: em }
  }

  /** Dados de um arquivo guardado, sem o conteúdo. */
  infoArquivo(sha256: string): { sha256: string; nome: string; tipo: string; tamanho: number; criadoEm: string } | undefined {
    const l = this.db.prepare('SELECT sha256, nome, tipo, tamanho, criado_em FROM arquivos WHERE sha256 = ?').get(sha256) as
      { sha256: string; nome: string; tipo: string; tamanho: number; criado_em: string } | undefined
    return l ? { sha256: l.sha256, nome: l.nome, tipo: l.tipo, tamanho: Number(l.tamanho), criadoEm: l.criado_em } : undefined
  }

  /** Conteúdo de um arquivo guardado. */
  lerArquivo(sha256: string): { nome: string; tipo: string; conteudo: Buffer } | undefined {
    const l = this.db.prepare('SELECT nome, tipo, conteudo FROM arquivos WHERE sha256 = ?').get(sha256) as
      { nome: string; tipo: string; conteudo: Uint8Array } | undefined
    return l ? { nome: l.nome, tipo: l.tipo, conteudo: Buffer.from(l.conteudo) } : undefined
  }

  /**
   * Confere uma referência vinda de uma tela: o arquivo precisa estar guardado e ser de um tipo aceito para
   * a finalidade; o tamanho e o tipo são os do arquivo guardado. `atual`: a referência de antes (o mesmo
   * arquivo mantém a data em que foi anexado).
   */
  private conferirArquivo(
    ref: ArquivoAnexo,
    finalidade: FinalidadeArquivo,
    atual: ArquivoAnexo | null | undefined,
    oQue: string,
  ): ArquivoAnexo {
    const info = this.infoArquivo(ref.sha256)
    if (!info) throw new ErroApi(400, `O arquivo ${oQue} não foi encontrado no servidor. Anexe o arquivo de novo.`)
    const tipo = tipoDoMime(info.tipo)
    if (!tipo || !TIPOS_DA_FINALIDADE[finalidade].includes(tipo))
      throw new ErroApi(400, `Este tipo de arquivo não serve para ${oQue}.`)
    const mesmo = atual?.sha256 === ref.sha256 && !!atual.enviadoEm
    return {
      sha256: info.sha256,
      nome: ref.nome || info.nome,
      tamanho: info.tamanho,
      tipo: info.tipo,
      enviadoEm: mesmo ? atual!.enviadoEm : this.agora().toISOString(),
    }
  }

  // ---- POP (Procedimento Operacional Padrão) ---------------------------------------------

  /** Revisões do POP, da mais nova (a vigente) para a mais antiga. */
  versoesPop(): VersaoPop[] {
    const linhas = this.db
      .prepare(
        `SELECT p.id, p.codigo, p.revisao, p.data, p.arquivo, p.observacao, p.criado_em, p.criado_por,
                a.nome AS arquivo_nome, a.tipo AS arquivo_tipo, a.tamanho AS arquivo_tamanho, a.criado_em AS arquivo_em
           FROM pop_versoes p LEFT JOIN arquivos a ON a.sha256 = p.arquivo
          ORDER BY p.id DESC`,
      )
      .all() as Array<Record<string, string | number | null>>
    return linhas.map((l, i) => ({
      id: Number(l.id),
      codigo: String(l.codigo),
      revisao: String(l.revisao),
      data: String(l.data ?? ''),
      arquivo:
        l.arquivo && l.arquivo_nome !== null
          ? {
              sha256: String(l.arquivo),
              nome: String(l.arquivo_nome),
              tamanho: Number(l.arquivo_tamanho),
              tipo: String(l.arquivo_tipo),
              enviadoEm: String(l.arquivo_em),
            }
          : null,
      observacao: String(l.observacao ?? ''),
      criadoEm: String(l.criado_em),
      criadoPor: String(l.criado_por ?? ''),
      vigente: i === 0,
    }))
  }

  /** A revisão do POP que vale hoje (a última registrada), ou null se nenhuma foi registrada. */
  popVigente(): VersaoPop | null {
    return this.versoesPop()[0] ?? null
  }

  /** Registra uma revisão nova do POP: passa a valer para os próximos certificados (os emitidos não mudam). */
  registrarPop(entrada: unknown, por: string): VersaoPop {
    const valor = validar(normalizarPop(entrada))
    return transacao(this.db, () => {
      // Maiúsculas e minúsculas não contam, com acento ("Ç" = "ç", que o NOCASE do SQLite não iguala)
      const chave = (c: string) => c.normalize('NFC').toLocaleUpperCase('pt-BR')
      const repetida = this.versoesPop().some((v) => chave(v.codigo) === chave(valor.codigo) && v.revisao === valor.revisao)
      if (repetida)
        throw new ErroApi(409, `A revisão ${valor.revisao} do ${valor.codigo} já está registrada. Confira o número da revisão.`)
      const arquivo = valor.arquivo
        ? this.conferirArquivo({ sha256: valor.arquivo, nome: '', tamanho: 0, tipo: '', enviadoEm: '' }, 'pop', null, 'do POP')
        : null
      this.db
        .prepare(
          `INSERT INTO pop_versoes (codigo, revisao, data, arquivo, observacao, criado_em, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(valor.codigo, valor.revisao, valor.data, arquivo?.sha256 ?? null, valor.observacao, this.agora().toISOString(), por)
      this.mudou('config')
      return this.popVigente()!
    })
  }

  /** Anexa (ou troca) o arquivo de uma revisão do POP já registrada (ex.: registrada antes do arquivo ficar pronto). */
  anexarArquivoPop(id: number, sha256: unknown): VersaoPop {
    const sha = typeof sha256 === 'string' ? sha256.toLowerCase() : ''
    if (!/^[0-9a-f]{64}$/.test(sha)) throw new ErroApi(400, 'Envie o arquivo do POP.')
    return transacao(this.db, () => {
      if (!this.db.prepare('SELECT 1 FROM pop_versoes WHERE id = ?').get(id))
        throw new ErroApi(404, 'Revisão do POP não encontrada.')
      this.conferirArquivo({ sha256: sha, nome: '', tamanho: 0, tipo: '', enviadoEm: '' }, 'pop', null, 'do POP')
      this.db.prepare('UPDATE pop_versoes SET arquivo = ? WHERE id = ?').run(sha, id)
      this.mudou('config')
      return this.versoesPop().find((v) => v.id === id)!
    })
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
      if (valor.clienteId !== atual.clienteId || valor.unidade !== atual.unidade) this.acompanharAbertas(atual, balanca)
      this.mudou('balanca', id)
      return balanca
    })
  }

  /**
   * As calibrações abertas da balança acompanham, dentro da transação, a troca do cliente (a balança é de um
   * cliente só: o rascunho passa a ser do novo, com o endereço dele quando era o do antigo) e a da unidade da
   * indicação (as cargas e leituras vão para a nova unidade: 6000 g → 6 kg). Tudo numa gravação só de cada
   * rascunho, para o JSON e as colunas não ficarem diferentes. A versão sobe: uma tela com o rascunho antigo
   * aberto recebe o aviso de que ele mudou, em vez de gravar por cima o cliente ou os números de antes. Os
   * certificados emitidos têm a cópia congelada da balança e não mudam.
   */
  private acompanharAbertas(antes: Balanca, depois: Balanca) {
    const ids = this.db
      .prepare("SELECT id FROM calibracoes WHERE balanca_id = ? AND status IN ('RASCUNHO','REVISAO')")
      .all(depois.id) as Array<{ id: string }>
    const trocouCliente = antes.clienteId !== depois.clienteId
    const clienteAntigo = trocouCliente ? this.obterCliente(antes.clienteId) : undefined
    const clienteNovo = trocouCliente ? this.obterCliente(depois.clienteId) : undefined
    for (const { id } of ids) {
      const atual = this.obterCalibracao(id)
      if (!atual) continue
      const k = calibracaoEmOutraUnidade(atual, antes.unidade, depois.unidade)
      const enderecoAntigo = clienteAntigo && k.localEndereco === enderecoCliente(clienteAntigo)
      this.gravarCalibracao(
        {
          ...k,
          clienteId: depois.clienteId,
          localEndereco: enderecoAntigo && clienteNovo ? enderecoCliente(clienteNovo) : k.localEndereco,
          versao: atual.versao + 1,
          atualizadoEm: depois.atualizadoEm,
        },
        false,
      )
      this.mudou('calibracao', id)
    }
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
    const busca = textoBuscaBalanca(b)
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
      const padrao: Padrao = {
        ...valor,
        certificadoArquivo: this.arquivoDoPadrao(valor.certificadoArquivo, null),
        id: novoId(),
        versao: 1,
        criadoEm: em,
        atualizadoEm: em,
      }
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
      const certificadoArquivo = this.arquivoDoPadrao(valor.certificadoArquivo, atual.certificadoArquivo)
      // Padrão calibrado de novo (outro nº) com o arquivo do certificado anterior: o arquivo antigo iria aos
      // clientes com o nº novo. Só passa se quem edita confirmar que corrigiu o nº do mesmo certificado.
      if (
        arquivoDoCertificadoAnterior(atual, { certificado: valor.certificado, sha256: certificadoArquivo?.sha256 }) &&
        (entrada as { arquivoConfirmado?: unknown } | null)?.arquivoConfirmado !== true
      )
        throw new ErroApi(
          400,
          'O nº do certificado mudou, mas o arquivo anexado é o do certificado anterior. Anexe o arquivo do certificado novo ou tire o arquivo antigo.',
          { codigo: 'ARQUIVO_DO_CERTIFICADO_ANTERIOR' },
        )
      const anteriores = certificadosAnterioresApos(atual, valor.certificado)
      const padrao: Padrao = {
        ...atual,
        ...valor,
        certificadoArquivo,
        ...(anteriores.length ? { certificadosAnteriores: anteriores } : {}),
        versao: atual.versao + 1,
        atualizadoEm: this.agora().toISOString(),
      }
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

  /** Arquivo do certificado do padrão: `undefined` (tela antiga, sem o campo) mantém o de antes. */
  private arquivoDoPadrao(novo: ArquivoAnexo | null | undefined, atual: ArquivoAnexo | null | undefined): ArquivoAnexo | null {
    if (novo === undefined) return atual ?? null
    return novo ? this.conferirArquivo(novo, 'padrao', atual, 'do certificado do padrão') : null
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
      // Também pelo nº reservado da calibração em andamento (o da folha de campo e da etiqueta)
      condicoes.push(
        `(k.busca LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM numeros_reservados r WHERE r.calibracao_id = k.id
           AND r.situacao = 'reservado' AND lower(r.numero) LIKE ? ESCAPE '\\'))`,
      )
      const termo = `%${t.replace(/[\\%_]/g, '\\$&')}%`
      params.push(termo, termo)
    }
    const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM calibracoes k ${onde}`).get(...params) as { n: number }).n
    const limite = Math.min(Math.max(filtro.limite ?? 50, 1), 500)
    const pagina = Math.max(filtro.pagina ?? 1, 1)
    const linhas = this.db
      .prepare(
        `SELECT k.dados, c.nome AS cliente_nome, b.dados AS balanca_dados,
           (SELECT COUNT(*) FROM envios e WHERE e.calibracao_id = k.id) AS envios,
           (SELECT r.numero FROM numeros_reservados r WHERE r.calibracao_id = k.id AND r.situacao = 'reservado') AS numero_reservado
         FROM calibracoes k
         JOIN clientes c ON c.id = k.cliente_id
         JOIN balancas b ON b.id = k.balanca_id
         ${onde}
         ORDER BY CASE WHEN k.status IN ('RASCUNHO','REVISAO') THEN 0 ELSE 1 END,
                  COALESCE(NULLIF(k.data_emissao, ''), k.atualizado_em) DESC, k.sequencia DESC, k.revisao DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limite, (pagina - 1) * limite) as Array<
      Linha & { cliente_nome: string; balanca_dados: string; envios: number; numero_reservado: string | null }
    >
    const nomes = this.nomesUsuarios()
    return {
      total,
      itens: linhas.map((l) =>
        this.resumo(
          JSON.parse(l.dados) as Calibracao,
          l.cliente_nome,
          JSON.parse(l.balanca_dados),
          l.envios,
          nomes,
          l.numero_reservado ?? '',
        ),
      ),
    }
  }

  private nomesUsuarios(): Map<string, string> {
    const linhas = this.db.prepare('SELECT id, nome FROM usuarios').all() as Array<{ id: string; nome: string }>
    return new Map(linhas.map((u) => [u.id, u.nome]))
  }

  private resumo(
    k: Calibracao,
    clienteNome: string,
    b: Balanca,
    envios: number,
    nomes: Map<string, string>,
    numeroReservado: string,
  ): CalibracaoResumo {
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
      ...(numeroReservado ? { numeroReservado } : {}),
    }
  }

  resumoCalibracao(id: string): CalibracaoResumo | undefined {
    const k = this.obterCalibracao(id)
    if (!k) return undefined
    const c = this.obterCliente(k.clienteId)
    const b = this.obterBalanca(k.balancaId)
    if (!c || !b) return undefined
    const envios = (this.db.prepare('SELECT COUNT(*) AS n FROM envios WHERE calibracao_id = ?').get(id) as { n: number }).n
    return this.resumo(k, c.nome, b, envios, this.nomesUsuarios(), this.numeroReservadoDa(id)?.numero ?? '')
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

  /**
   * Exclui a calibração em andamento. O nº de certificado reservado para ela volta para o papel em que foi
   * impresso (a folha de campo que foi a campo, a mais nova com ele, que fica livre): continua reservado e passa
   * para a calibração refeita a que a folha for ligada, como o da folha avulsa. A lista dos nºs mostra essa folha
   * (não a substituída). `eventos` diz qual, para o registro de atividades.
   */
  excluirRascunho(id: string): { eventos: EventoNumero[] } {
    return transacao(this.db, () => {
      const atual = this.obterCalibracao(id)
      if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
      if (atual.status !== 'RASCUNHO' && atual.status !== 'REVISAO')
        throw new ErroApi(409, 'Certificado emitido não pode ser excluído. Use "Cancelar certificado".')
      const eventos: EventoNumero[] = []
      const reservado = this.numeroReservadoDa(id)
      if (reservado) {
        // A folha mais nova da calibração com o nº (a que foi a campo); sem ela, a da reserva
        const papel =
          (
            this.db
              .prepare(
                `SELECT numero FROM folhas_campo WHERE calibracao_id = ? AND numero_certificado = ?
                  ORDER BY substituida_por = '' DESC, ano DESC, sequencia DESC LIMIT 1`,
              )
              .get(id, reservado.numero) as { numero: string } | undefined
          )?.numero ?? reservado.folha
        this.db.prepare("UPDATE numeros_reservados SET calibracao_id = '', folha = ? WHERE id = ?").run(papel, reservado.id)
        // Sem link no registro: a calibração não existe mais
        eventos.push({
          acao: 'NUMERO_RESERVADO',
          numero: reservado.numero,
          calibracaoId: '',
          detalhe: `${reservado.numero} · voltou para a folha ${papel} (calibração excluída antes da emissão: ${this.descreverCalibracao(atual)})`,
        })
      }
      this.db.prepare('DELETE FROM calibracoes WHERE id = ?').run(id)
      // As folhas de campo dele saem junto: a que veio de um certificado cancelado volta para ele; as outras
      // ficam livres para ser ligadas à calibração refeita (o registro da impressão continua)
      const folhas = this.db.prepare('SELECT numero FROM folhas_campo WHERE calibracao_id = ?').all(id) as Array<{
        numero: string
      }>
      for (const f of folhas) this.soltarFolha(f.numero, id)
      this.db.prepare('DELETE FROM folhas_campo_passagens WHERE para_calibracao_id = ?').run(id)
      this.mudou('calibracao', id)
      return { eventos }
    })
  }

  /**
   * Emite: dá o número, grava os dados congelados e, numa revisão, marca o certificado original como
   * substituído. O número é o reservado na impressão da folha de campo (o da etiqueta; mesmo de outro ano),
   * que passa a emitido; sem reserva, o próximo da sequência do ano (nunca reutilizada). A revisão herda o
   * do original, com -R1, -R2… O PDF é gerado depois, a partir desses dados (ver server/certificados.ts).
   */
  emitir(
    id: string,
    montar: (k: Calibracao, numeracao: { ano: number; sequencia: number; numero: string; codigo: string }) => EmissaoCertificado,
    opcoes: {
      versao?: number
      numero: (seq: number, ano: number, revisao: number) => string
      codigo: () => string
      /** Quem emite (fica no registro do nº reservado). */
      por?: string
    },
  ): Calibracao {
    return transacao(this.db, () => {
      const atual = this.obterCalibracao(id)
      if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
      if (atual.status !== 'RASCUNHO' && atual.status !== 'REVISAO') throw new ErroApi(409, 'Este certificado já foi emitido.')
      if (opcoes.versao !== undefined && opcoes.versao !== atual.versao) throw conflito('esta calibração')
      const em = this.agora().toISOString()
      let ano: number
      let sequencia: number
      let numero = ''
      let reservado = atual.substituiId ? null : this.numeroReservadoDa(id)
      const original = atual.substituiId ? this.obterCalibracao(atual.substituiId) : undefined
      if (reservado) {
        // O nº reservado já num certificado (só com o banco mexido à mão): não sai repetido; fica não utilizado
        const ocupado = this.db
          .prepare('SELECT 1 FROM calibracoes WHERE ano = ? AND sequencia = ? AND revisao = 0 AND id <> ?')
          .get(reservado.ano, reservado.sequencia, id)
        if (ocupado) {
          this.naoUtilizado(
            reservado.id,
            'O nº já estava em outro certificado; a calibração recebeu outro nº na emissão.',
            opcoes.por ?? '',
          )
          reservado = null
        }
      }
      if (atual.substituiId) {
        if (!original || original.status !== 'EMITIDO' || original.ano === null || original.sequencia === null)
          throw new ErroApi(409, 'O certificado que esta revisão substitui não está mais emitido.')
        ano = original.ano
        sequencia = original.sequencia
      } else if (reservado) {
        ano = reservado.ano
        sequencia = reservado.sequencia
        // Como foi impresso na folha (e copiado na etiqueta), mesmo que o formato tenha mudado depois
        numero = reservado.numero
        this.db
          .prepare("UPDATE numeros_reservados SET situacao = 'emitido', situacao_em = ?, situacao_por = ? WHERE id = ?")
          .run(em, (opcoes.por ?? '').slice(0, 120), reservado.id)
      } else {
        ano = Number(this.hoje().slice(0, 4))
        sequencia = this.proximaSequenciaCertificado(ano)
      }
      numero ||= opcoes.numero(sequencia, ano, atual.revisao)
      let codigo = opcoes.codigo()
      while (this.db.prepare('SELECT 1 FROM calibracoes WHERE codigo = ?').get(codigo)) codigo = opcoes.codigo()
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
      balanca && parteSeparada(balanca)?.serie,
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

  // ---- Folhas de campo ---------------------------------------------------------------
  // Cada nº FC é um documento só: o PDF da primeira impressão fica guardado (num arquivo da pasta
  // folhas-campo, com o sha256 no banco) e toda reimpressão é ele. A "folha nova" (nº novo, com os dados
  // atuais) não apaga a de antes: ela continua ligada à calibração, marcada como substituída (não usada), e
  // a calibração fica com a mais nova (`substituida_por` vazio). Só a folha impressa para a calibração fica
  // nela como substituída: a avulsa ligada e depois trocada fica livre de novo (foi engano), e a que veio de
  // um certificado cancelado volta para ele (`folhas_campo_passagens`).

  /**
   * Nº da folha de campo que vai ser impressa. A calibração com folha (impressa por ela, avulsa e ligada
   * depois ou, numa revisão, a do certificado revisado; ver `folhaCampoDaCalibracao`) reimprime essa folha,
   * a que está no papel. Sem folha, a mesma `chave` reimprime com o mesmo nº (a de uma calibração é
   * 'calibracao:<id>'); chave nova reserva o próximo do ano, FC-AAAA-NNNNN (nunca reutilizado: nem depois de
   * voltar uma cópia antiga do banco, ver `proximaSequencia`).
   * `nova`: folha nova para a calibração em andamento: a de antes fica registrada como substituída por ela;
   * `substituiu` diz quais (para o registro de atividades) e `liberadas`, as avulsas que ficaram livres.
   * Numa revisão que usa a folha do certificado revisado não há folha nova (409); a calibração concluída, ou
   * a revisão de um certificado feito sem folha, não ganha nº novo (409). `pdf`: o arquivo da primeira
   * impressão, se já guardado (`guardarPdfFolhaCampo`): a reimpressão é esse arquivo.
   * `numeroCertificado`: o nº do certificado que sai na folha (ver `numeroParaFolha`), reservado na primeira
   * impressão; '' = nenhum. `eventos`: os nºs reservados agora, para o registro de atividades.
   */
  reservarFolhaCampo(e: {
    chave: string
    calibracaoId?: string
    balancaId?: string
    clienteId?: string
    por: string
    nova?: boolean
  }): FolhaCampoImpressa & {
    nova: boolean
    pdf: Buffer | null
    substituiu: string[]
    liberadas: string[]
    numeroCertificado: string
    eventos: EventoNumero[]
  } {
    return transacao(this.db, () => {
      const agora = this.agora().toISOString()
      const porChave = this.db.prepare('SELECT numero FROM folhas_campo WHERE chave = ?').get(e.chave) as
        { numero: string } | undefined
      const atual = e.calibracaoId ? this.folhaCampoDaCalibracao(e.calibracaoId) : null
      if (e.nova && !porChave && atual?.herdada)
        throw new ErroApi(
          409,
          `Esta revisão usa a folha ${atual.numero}, do certificado revisado (a mesma visita): não há folha nova para ela.`,
        )
      // Sem folha: só a calibração em andamento que não é revisão ganha nº novo (o certificado concluído, ou o
      // revisado, foi feito sem folha; um nº novo agora não seria o registro dos dados brutos dele)
      if (e.calibracaoId && !atual && !porChave) {
        const c = this.db.prepare('SELECT status, substitui_id FROM calibracoes WHERE id = ?').get(e.calibracaoId) as
          { status: string; substitui_id: string } | undefined
        if (c && (c.substitui_id || (c.status !== 'RASCUNHO' && c.status !== 'REVISAO')))
          throw new ErroApi(
            409,
            'Esta calibração não tem folha de campo: um nº novo agora não seria o registro dos dados brutos dela.',
          )
      }
      const existente = (e.nova ? null : atual) ?? porChave
      if (existente) {
        this.db
          .prepare('UPDATE folhas_campo SET impressoes = impressoes + 1, ultima_em = ? WHERE numero = ?')
          .run(agora, existente.numero)
        // A folha desta calibração que ficou sem dono (a versão anterior soltava a substituída): volta a ser dela
        if (e.calibracaoId && !atual)
          this.db
            .prepare(
              `UPDATE folhas_campo SET calibracao_id = ?, substituida_por = '', substituida_em = ''
                WHERE numero = ? AND calibracao_id IN ('', ?)`,
            )
            .run(e.calibracaoId, existente.numero, e.calibracaoId)
        if (e.calibracaoId) this.mudou('calibracao', e.calibracaoId)
        const pdf = this.pdfFolhaCampo(existente.numero)
        // Reimpressão: o nº que saiu no papel. Sem o PDF guardado (a primeira geração não terminou), ele é
        // gerado agora, com o nº do certificado
        const cert = pdf
          ? { numero: this.numeroImpressoNaFolha(existente.numero), eventos: [] }
          : this.numeroParaFolha(existente.numero, e)
        if (!e.calibracaoId && cert.eventos.length) this.mudou('calibracao')
        return {
          ...this.folhaCampo(existente.numero)!,
          nova: false,
          pdf,
          substituiu: [],
          liberadas: [],
          numeroCertificado: cert.numero,
          eventos: cert.eventos,
        }
      }
      const ano = Number(this.hoje().slice(0, 4))
      const sequencia = this.proximaSequencia(ano)
      const numero = `FC-${ano}-${String(sequencia).padStart(5, '0')}`
      this.db
        .prepare(
          `INSERT INTO folhas_campo (numero, ano, sequencia, chave, calibracao_id, balanca_id, cliente_id, impressa_por, impressa_em, ultima_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          numero,
          ano,
          sequencia,
          e.chave,
          e.calibracaoId ?? '',
          e.balancaId ?? '',
          e.clienteId ?? '',
          e.por.slice(0, 120),
          agora,
          agora,
        )
      // Folha nova: a que a calibração tinha fica registrada como substituída por esta (não usada)
      const troca = e.nova && e.calibracaoId ? this.substituirFolhas(e.calibracaoId, numero, agora) : semTroca()
      // Depois da troca: o nº que a calibração tinha recebido de uma avulsa trocada agora voltou para ela
      const cert = this.numeroParaFolha(numero, e)
      // A tela da calibração passa a mostrar o nº da folha (a lista dos nºs reservados, o da avulsa)
      if (e.calibracaoId) this.mudou('calibracao', e.calibracaoId)
      else if (cert.eventos.length) this.mudou('calibracao')
      return {
        ...this.folhaCampo(numero)!,
        nova: true,
        pdf: null,
        substituiu: troca.substituidas,
        liberadas: troca.liberadas,
        numeroCertificado: cert.numero,
        eventos: [...troca.eventos, ...cert.eventos],
      }
    })
  }

  // ---- Nºs de certificado reservados -----------------------------------------------------------
  // O nº do certificado é reservado na primeira impressão da folha de campo e sai nela: o técnico o copia na
  // etiqueta da balança, no cliente, e o certificado é emitido com ele. É a mesma sequência da emissão (ver
  // `proximaSequenciaCertificado`), dentro da transação, e um nº nunca vai para outro papel: o que não for
  // emitido fica registrado como não utilizado, com o motivo (o buraco na numeração fica explicado). O nº segue
  // o papel: a folha avulsa (em branco, do cliente ou da balança) reserva um nº dela, que passa para a
  // calibração a que a folha for ligada; o da calibração excluída volta para a folha dela, e o da folha que sai
  // de uma calibração (engano no nº), também.

  private numeroPorId(id: number): NumeroReservado | undefined {
    const l = this.db.prepare('SELECT * FROM numeros_reservados WHERE id = ?').get(id) as LinhaNumero | undefined
    return l ? numeroDaLinha(l) : undefined
  }

  /** O nº reservado (ainda não emitido) da calibração, ou null. */
  numeroReservadoDa(calibracaoId: string): NumeroReservado | null {
    if (!calibracaoId) return null
    const l = this.db
      .prepare("SELECT * FROM numeros_reservados WHERE calibracao_id = ? AND situacao = 'reservado'")
      .get(calibracaoId) as LinhaNumero | undefined
    return l ? numeroDaLinha(l) : null
  }

  /**
   * Os nºs ainda sem certificado (reservados para uma calibração em andamento ou numa folha avulsa ainda não
   * ligada) e os não utilizados, do mais novo para o mais antigo (até `limite`).
   */
  listarNumerosReservados(limite = 500): NumeroReservado[] {
    const linhas = this.db
      .prepare(
        `SELECT * FROM numeros_reservados WHERE situacao IN ('reservado', 'nao_utilizado')
          ORDER BY ano DESC, sequencia DESC LIMIT ?`,
      )
      .all(Math.min(Math.max(Math.trunc(limite) || 1, 1), 2000)) as LinhaNumero[]
    return linhas.map(numeroDaLinha)
  }

  /**
   * Próximo nº da sequência dos certificados do ano, gravado como o último dado: depois do maior entre o
   * contador da emissão, os certificados do banco e os nºs reservados (nenhum se repete).
   */
  private proximaSequenciaCertificado(ano: number): number {
    const chave = `sequencia_${ano}`
    const maior = (tabela: string) =>
      Number((this.db.prepare(`SELECT MAX(sequencia) AS n FROM ${tabela} WHERE ano = ?`).get(ano) as { n: number | null }).n ?? 0)
    const sequencia = Math.max(Number(lerMeta(this.db, chave) ?? 0), maior('calibracoes'), maior('numeros_reservados')) + 1
    gravarMeta(this.db, chave, sequencia)
    return sequencia
  }

  /** Reserva o próximo nº do ano (formatado como sai no certificado, sem revisão). Dentro da transação. */
  private reservarNumero(e: { calibracaoId: string; folha: string; por: string }): NumeroReservado {
    const ano = Number(this.hoje().slice(0, 4))
    const sequencia = this.proximaSequenciaCertificado(ano)
    const numero = formatarNumeroCertificado(this.obterConfig().numeracao, sequencia, ano, 0)
    const r = this.db
      .prepare(
        `INSERT INTO numeros_reservados (numero, ano, sequencia, calibracao_id, folha, reservado_em, reservado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(numero, ano, sequencia, e.calibracaoId, e.folha, this.agora().toISOString(), e.por.slice(0, 120))
    return this.numeroPorId(Number(r.lastInsertRowid))!
  }

  /**
   * O nº reservado passa a não utilizado (só se ainda estava reservado), com o motivo, quando e quem. `dono`: a
   * calibração que o pôs de lado (ver `numeroAoLigar`); sem ele, fica com a que tinha.
   */
  private naoUtilizado(id: number, motivo: string, por: string, dono?: string) {
    this.db
      .prepare(
        `UPDATE numeros_reservados SET situacao = 'nao_utilizado', motivo = ?, situacao_em = ?, situacao_por = ?,
           calibracao_id = coalesce(?, calibracao_id)
          WHERE id = ? AND situacao = 'reservado'`,
      )
      .run(motivo.slice(0, 500), this.agora().toISOString(), por.slice(0, 120), dono ?? null, id)
  }

  /**
   * A folha atual do nº (`numeros_reservados.folha`): a última impressa com ele para a calibração (a folha nova
   * leva o mesmo nº), a ligada a ela ou, livre, o papel que ficou com ele. É a que a tela e o registro mostram.
   */
  private numeroNaFolha(id: number, folha: string) {
    this.db.prepare('UPDATE numeros_reservados SET folha = ? WHERE id = ? AND folha <> ?').run(folha, id, folha)
  }

  /** O nº do certificado impresso na folha ('' = nenhum). */
  private numeroImpressoNaFolha(numeroFolha: string): string {
    const l = this.db.prepare('SELECT numero_certificado FROM folhas_campo WHERE numero = ?').get(numeroFolha) as
      { numero_certificado: string } | undefined
    return l?.numero_certificado ?? ''
  }

  /**
   * O nº do certificado que sai na folha `numeroFolha`, que vai ser gerada agora: o já gravado nela (a
   * reimpressão e o pedido repetido saem iguais); senão, o da calibração em andamento (reservado agora, se
   * ela ainda não tem: a folha nova continua com o mesmo) ou, na folha avulsa, um nº só dela. A revisão sai
   * com o nº do certificado revisado e a calibração concluída já tem o dela: nenhum ('').
   */
  private numeroParaFolha(
    numeroFolha: string,
    e: { calibracaoId?: string; por: string },
  ): { numero: string; eventos: EventoNumero[] } {
    const impresso = this.numeroImpressoNaFolha(numeroFolha)
    if (impresso) return { numero: impresso, eventos: [] }
    const eventos: EventoNumero[] = []
    let n: NumeroReservado | null
    if (e.calibracaoId) {
      const c = this.db.prepare('SELECT status, substitui_id FROM calibracoes WHERE id = ?').get(e.calibracaoId) as
        { status: string; substitui_id: string } | undefined
      if (!c || c.substitui_id || (c.status !== 'RASCUNHO' && c.status !== 'REVISAO')) return { numero: '', eventos }
      n = this.numeroReservadoDa(e.calibracaoId)
      if (!n) {
        n = this.reservarNumero({ calibracaoId: e.calibracaoId, folha: numeroFolha, por: e.por })
        eventos.push({
          acao: 'NUMERO_RESERVADO',
          numero: n.numero,
          calibracaoId: e.calibracaoId,
          detalhe: `${n.numero} · folha ${numeroFolha}`,
        })
      } else this.numeroNaFolha(n.id, numeroFolha) // Folha nova: o mesmo nº, agora no papel que vai a campo
    } else {
      n = this.reservarNumero({ calibracaoId: '', folha: numeroFolha, por: e.por })
      eventos.push({
        acao: 'NUMERO_RESERVADO',
        numero: n.numero,
        calibracaoId: '',
        detalhe: `${n.numero} · folha avulsa ${numeroFolha}`,
      })
    }
    this.db.prepare('UPDATE folhas_campo SET numero_certificado = ? WHERE numero = ?').run(n.numero, numeroFolha)
    return { numero: n.numero, eventos }
  }

  /**
   * O registro do nº de certificado `numero`, impresso na folha `numeroFolha` (a linha da reserva dela, se o
   * formato da numeração repetiu o texto noutro ano), ou null.
   */
  private linhaDoNumero(numero: string, numeroFolha: string): NumeroReservado | null {
    const l = this.db
      .prepare(
        `SELECT * FROM numeros_reservados WHERE numero = ?
          ORDER BY folha = ? DESC, situacao = 'reservado' DESC, situacao = 'nao_utilizado' DESC, id DESC LIMIT 1`,
      )
      .get(numero, numeroFolha) as LinhaNumero | undefined
    return l ? numeroDaLinha(l) : null
  }

  /** "folha avulsa FC-2026-00042" ou "folha FC-2026-00042", para os registros e os motivos. */
  private rotuloFolha(numeroFolha: string): string {
    const l = this.db.prepare('SELECT chave FROM folhas_campo WHERE numero = ?').get(numeroFolha) as { chave: string } | undefined
    return `folha ${l?.chave.startsWith('avulsa:') ? 'avulsa ' : ''}${numeroFolha}`
  }

  /** Por que o nº impresso numa folha não pode ir para a calibração a que ela foi ligada. */
  private numeroIndisponivel(numero: string, n: NumeroReservado | null): string {
    if (!n) return `O nº ${numero} não está no registro dos nºs reservados.`
    if (n.situacao === 'emitido') {
      const k = this.db
        .prepare('SELECT numero, status FROM calibracoes WHERE ano = ? AND sequencia = ? AND revisao = 0')
        .get(n.ano, n.sequencia) as { numero: string; status: string } | undefined
      return k?.status === 'CANCELADO'
        ? `O nº ${numero} é o do certificado cancelado ${k.numero}: um nº emitido não é usado de novo.`
        : `O nº ${numero} já foi emitido${k?.numero ? ` (certificado ${k.numero})` : ''}.`
    }
    if (n.situacao === 'nao_utilizado')
      return `O nº ${numero} foi registrado como não utilizado${n.motivo ? `: ${n.motivo.replace(/\.$/, '')}` : ''}.`
    const dono = this.obterCalibracao(n.calibracaoId)
    return `O nº ${numero} é de outra calibração em andamento${dono ? ` (${this.descreverCalibracao(dono)})` : ''}.`
  }

  /**
   * A folha `numeroFolha` acabou de ser ligada à calibração (depois da troca: o nº de uma folha que saiu dela
   * já voltou para o papel, ver `substituirFolhas`). O nº do certificado segue o papel que foi a campo (o que o
   * técnico copiou na etiqueta): o impresso nesta folha, ainda sem dono (folha avulsa, de um rascunho excluído
   * ou que saiu de outra calibração), passa a ser o da calibração. O que ela tinha fica não utilizado, com o
   * motivo (o papel dele não foi a campo), mas continua dela: volta a valer se aquela folha for ligada de novo
   * (engano no nº), como o da folha de uma calibração que foi excluída. A revisão sai com o nº do certificado
   * revisado: o da folha fica não utilizado (e volta para o papel se a folha sair da revisão). O nº que não pode
   * mais ser usado (emitido, não utilizado, de outra calibração) não muda nada. `numeroDaFolha`: o nº do papel e
   * se ele vai ser o do certificado (`usado`); senão, o `motivo`, para a tela avisar (corrigir a etiqueta).
   */
  private numeroAoLigar(
    numeroFolha: string,
    calibracaoId: string,
    por: string,
  ): { eventos: EventoNumero[]; numeroDaFolha: NumeroDaFolha | null } {
    const papel = this.numeroImpressoNaFolha(numeroFolha)
    const k = this.obterCalibracao(calibracaoId)
    const eventos: EventoNumero[] = []
    if (!papel || !k) return { eventos, numeroDaFolha: null }
    const doPapel = this.linhaDoNumero(papel, numeroFolha)
    if (doPapel?.situacao === 'reservado' && doPapel.calibracaoId === calibracaoId) {
      // Já era dela (a folha substituída que voltou: engano na troca): o nº passa para esta folha
      this.numeroNaFolha(doPapel.id, numeroFolha)
      return { eventos, numeroDaFolha: { numero: papel, usado: true } }
    }
    const proprio = this.numeroReservadoDa(calibracaoId)
    const naoUsa = (motivo: string) => ({ eventos, numeroDaFolha: { numero: papel, usado: false, motivo } })
    if (k.substituiId) {
      const revisado = this.obterCalibracao(k.substituiId)?.numero || 'revisado'
      if (doPapel?.situacao === 'reservado' && !doPapel.calibracaoId) {
        const motivo = `A folha ${numeroFolha} foi ligada à revisão do certificado ${revisado}, que sai com o nº do certificado revisado.`
        // Fica com a revisão: se a folha sair dela (engano no nº), o nº volta para o papel
        this.naoUtilizado(doPapel.id, motivo, por, calibracaoId)
        this.numeroNaFolha(doPapel.id, numeroFolha)
        eventos.push({ acao: 'NUMERO_NAO_UTILIZADO', numero: papel, calibracaoId, detalhe: `${papel} · ${motivo}` })
      }
      return naoUsa(`Uma revisão sai com o nº do certificado revisado (${revisado}).`)
    }
    const dono = doPapel?.calibracaoId ?? ''
    const livre = doPapel?.situacao === 'reservado' && !dono
    // Posto de lado por esta calibração (a folha dela voltou) ou por uma que foi excluída (o papel ficou livre)
    const deLado =
      doPapel?.situacao === 'nao_utilizado' &&
      !!dono &&
      (dono === calibracaoId || !this.db.prepare('SELECT 1 FROM calibracoes WHERE id = ?').get(dono))
    if (!doPapel || !(livre || deLado))
      return naoUsa(
        `${this.numeroIndisponivel(papel, doPapel)} ${proprio ? `Esta calibração vai ser emitida com o nº ${proprio.numero}.` : 'Esta calibração recebe outro nº na emissão.'}`,
      )
    if (proprio) {
      const motivo = `A calibração (${this.descreverCalibracao(k)}) passou a usar o nº ${papel}, da folha ${numeroFolha}, ligada no lugar da folha com este nº, que não foi a campo.`
      this.naoUtilizado(proprio.id, motivo, por)
      eventos.push({
        acao: 'NUMERO_NAO_UTILIZADO',
        numero: proprio.numero,
        calibracaoId,
        detalhe: `${proprio.numero} · ${motivo}`,
      })
    }
    this.db
      .prepare(
        `UPDATE numeros_reservados SET calibracao_id = ?, folha = ?, situacao = 'reservado', motivo = '', situacao_em = '',
           situacao_por = '' WHERE id = ?`,
      )
      .run(calibracaoId, numeroFolha, doPapel.id)
    eventos.push({
      acao: 'NUMERO_RESERVADO',
      numero: papel,
      calibracaoId,
      detalhe:
        dono === calibracaoId
          ? `${papel} · da folha ${numeroFolha}, ligada de novo a esta calibração`
          : `${papel} · da ${this.rotuloFolha(numeroFolha)}, ligada a esta calibração`,
    })
    return { eventos, numeroDaFolha: { numero: papel, usado: true } }
  }

  /**
   * Registra como não utilizado o nº de uma folha ainda não ligada (avulsa, ou de uma calibração excluída) que
   * não vai ser ligada a nenhuma calibração (perdida, inutilizada…). O de uma calibração em andamento é dela.
   */
  descartarNumeroReservado(id: number, motivo: unknown, por: string): NumeroReservado {
    const texto = String(motivo ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (texto.length < 5) throw new ErroApi(400, 'Explique o motivo (fica registrado).')
    return transacao(this.db, () => {
      const n = this.numeroPorId(id)
      if (!n) throw new ErroApi(404, 'Nº reservado não encontrado.')
      if (n.situacao === 'emitido') throw new ErroApi(409, `O nº ${n.numero} já foi emitido.`)
      if (n.situacao === 'nao_utilizado') throw new ErroApi(409, `O nº ${n.numero} já está registrado como não utilizado.`)
      if (n.calibracaoId)
        throw new ErroApi(
          409,
          `O nº ${n.numero} é de uma calibração em andamento: se ela for excluída, ele volta para a folha de campo.`,
        )
      this.naoUtilizado(id, texto, por)
      this.mudou('calibracao')
      return this.numeroPorId(id)!
    })
  }

  /**
   * Próximo nº do ano: depois do maior já registrado no banco e do maior que tem PDF na pasta das folhas.
   * Uma cópia antiga do banco posta no lugar sem levar as folhas (ver `transplantarFolhasCampo`) não
   * volta a numeração: os nºs impressos depois dela, que já estão no papel, nunca são emitidos de novo.
   */
  private proximaSequencia(ano: number): number {
    const { ultima } = this.db.prepare('SELECT MAX(sequencia) AS ultima FROM folhas_campo WHERE ano = ?').get(ano) as {
      ultima: number | null
    }
    let maior = ultima ?? 0
    const pasta = this.pastaFolhas ? join(this.pastaFolhas, String(ano)) : ''
    if (pasta && existsSync(pasta))
      for (const arquivo of readdirSync(pasta)) {
        const m = /^FC-(\d{4})-(\d{5})\b/.exec(arquivo)
        if (m && Number(m[1]) === ano) maior = Math.max(maior, Number(m[2]))
      }
    return maior + 1
  }

  /**
   * As folhas vigentes da calibração (menos `numero`) saem dela, trocadas por `numero`: a impressa para ela
   * fica registrada como substituída (não usada); a avulsa ligada a ela (engano no nº, outro papel) fica
   * livre de novo, para a calibração dona do papel, e a que veio de um certificado cancelado volta para ele.
   * O nº de certificado que a calibração recebeu da avulsa que ficou livre volta para ela (é o do papel):
   * `eventos` diz quais.
   */
  private substituirFolhas(calibracaoId: string, numero: string, em: string): TrocaFolhas {
    const linhas = this.db
      .prepare(
        `SELECT numero, chave FROM folhas_campo WHERE calibracao_id = ? AND substituida_por = '' AND numero <> ?
          ORDER BY ano, sequencia`,
      )
      .all(calibracaoId, numero) as Array<{ numero: string; chave: string }>
    const liberadas: string[] = []
    for (const l of linhas) {
      if (impressaPara(l.chave, calibracaoId))
        this.db
          .prepare('UPDATE folhas_campo SET substituida_por = ?, substituida_em = ? WHERE numero = ?')
          .run(numero, em, l.numero)
      else if (!this.soltarFolha(l.numero, calibracaoId)) liberadas.push(l.numero)
    }
    // O nº impresso na folha que ficou livre e que estava com a calibração (o dela, ou o posto de lado numa
    // revisão) volta para o papel, reservado: passa para a calibração a que a folha for ligada
    const eventos: EventoNumero[] = []
    for (const folha of liberadas) {
      const papel = this.numeroImpressoNaFolha(folha)
      const n =
        papel &&
        (this.db
          .prepare(
            `SELECT id, numero FROM numeros_reservados WHERE numero = ? AND calibracao_id = ?
              AND situacao IN ('reservado', 'nao_utilizado') ORDER BY situacao = 'reservado' DESC, id DESC LIMIT 1`,
          )
          .get(papel, calibracaoId) as { id: number; numero: string } | undefined)
      if (!n) continue
      this.db
        .prepare(
          `UPDATE numeros_reservados SET calibracao_id = '', folha = ?, situacao = 'reservado', motivo = '', situacao_em = '',
             situacao_por = '' WHERE id = ?`,
        )
        .run(folha, n.id)
      eventos.push({
        acao: 'NUMERO_RESERVADO',
        numero: n.numero,
        calibracaoId,
        detalhe: `${n.numero} · voltou para a ${this.rotuloFolha(folha)}, que saiu desta calibração`,
      })
    }
    return { substituidas: linhas.map((l) => l.numero), liberadas, eventos }
  }

  /**
   * Tira a folha da calibração: volta para o certificado cancelado de onde ela passou para esta (como estava
   * nele) ou fica livre. Devolve o id da calibração para onde ela voltou ('' = ficou livre).
   */
  private soltarFolha(numero: string, calibracaoId: string): string {
    const p = this.db
      .prepare(
        `SELECT id, de_calibracao_id, substituida_por, substituida_em FROM folhas_campo_passagens
          WHERE numero = ? AND para_calibracao_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(numero, calibracaoId) as
      { id: number; de_calibracao_id: string; substituida_por: string; substituida_em: string } | undefined
    if (p && this.db.prepare('SELECT 1 FROM calibracoes WHERE id = ?').get(p.de_calibracao_id)) {
      this.db
        .prepare('UPDATE folhas_campo SET calibracao_id = ?, substituida_por = ?, substituida_em = ? WHERE numero = ?')
        .run(p.de_calibracao_id, p.substituida_por, p.substituida_em, numero)
      this.db.prepare('DELETE FROM folhas_campo_passagens WHERE id = ?').run(p.id)
      this.mudou('calibracao', p.de_calibracao_id)
      return p.de_calibracao_id
    }
    this.db
      .prepare("UPDATE folhas_campo SET calibracao_id = '', substituida_por = '', substituida_em = '' WHERE numero = ?")
      .run(numero)
    return ''
  }

  /**
   * Os PDFs que a migração 4 guardou no banco vão para a pasta das folhas (o banco e as cópias dele param de
   * carregar ≈ 100 KB por folha). Roda quando o servidor sobe; devolve quantos foram movidos.
   */
  moverPdfsDasFolhas(): number {
    if (!this.pastaFolhas) return 0
    const linhas = this.db
      .prepare("SELECT numero, ano, pdf FROM folhas_campo WHERE pdf IS NOT NULL AND pdf_arquivo = ''")
      .all() as Array<{ numero: string; ano: number; pdf: Uint8Array }>
    for (const l of linhas)
      transacao(this.db, () => {
        const pdf = Buffer.from(l.pdf)
        const { arquivo, sha256 } = this.gravarArquivoDaFolha(l.numero, l.ano, pdf)
        this.db
          .prepare('UPDATE folhas_campo SET pdf_arquivo = ?, pdf_sha256 = ?, pdf = NULL WHERE numero = ?')
          .run(arquivo, sha256, l.numero)
      })
    return linhas.length
  }

  /**
   * A pasta das folhas é a fonte de verdade também do registro: as folhas que têm PDF nela
   * (folhas-campo/<ano>/FC-AAAA-NNNNN.pdf) e não estão no banco, porque ele voltou de uma cópia anterior à
   * impressão delas sem `transplantarFolhasCampo`, voltam ao registro como folhas livres
   * (`CHAVE_RECUPERADA`), com a data da impressão gravada no PDF (`dataDaImpressaoNoPdf`; sem ela, a do
   * arquivo) e o sha256 do arquivo. O nº de certificado impresso nela (`numeroCertificadoNoPdf`) volta
   * reservado no papel (`reservarDoPapel`): nunca é dado a outra folha ou calibração, e passa para a calibração
   * a que a folha for ligada. O papel preenchido continua podendo ser ligado à calibração, confirmando,
   * porque não se sabe para qual balança ele foi impresso. A folha que está no banco sem PDF (a cópia foi
   * feita entre a reserva do nº e a gravação do arquivo) fica com o arquivo da pasta: a reimpressão é o papel.
   * Roda quando o servidor sobe e, para um nº (`numero`), quando ele é ligado. Quando o servidor sobe, também
   * deixa cada calibração com uma folha vigente só (`conciliarFolhasVigentes`). Devolve os nºs que voltaram;
   * o registro de atividades guarda quais.
   */
  recuperarFolhasDaPasta(numero?: string): string[] {
    const voltaram = this.voltarFolhasDaPasta(numero)
    if (!numero) this.conciliarFolhasVigentes()
    return voltaram
  }

  private voltarFolhasDaPasta(numero?: string): string[] {
    if (!this.pastaFolhas || !existsSync(this.pastaFolhas)) return []
    const achadas = new Map<string, { arquivo: string; ano: number; sequencia: number }>()
    for (const ano of readdirSync(this.pastaFolhas, { withFileTypes: true })) {
      if (!ano.isDirectory() || !/^\d{4}$/.test(ano.name)) continue
      for (const arquivo of readdirSync(join(this.pastaFolhas, ano.name)).sort()) {
        const m = /^(FC-(\d{4})-(\d{5}))(?:-[0-9a-f]{12})?\.pdf$/.exec(arquivo)
        if (!m || m[2] !== ano.name || (numero && m[1] !== numero)) continue
        // Com mais de um arquivo do mesmo nº, o sem sufixo (o da primeira impressão)
        if (achadas.has(m[1]) && arquivo !== `${m[1]}.pdf`) continue
        achadas.set(m[1], { arquivo: `${ano.name}/${arquivo}`, ano: Number(m[2]), sequencia: Number(m[3]) })
      }
    }
    if (!achadas.size) return []
    return transacao(this.db, () => {
      const existe = this.db.prepare(
        'SELECT numero, pdf_arquivo, pdf IS NULL AS sem_blob FROM folhas_campo WHERE numero = ? OR (ano = ? AND sequencia = ?)',
      )
      const inserir = this.db.prepare(
        `INSERT INTO folhas_campo (numero, ano, sequencia, chave, impressa_em, ultima_em, pdf_arquivo, pdf_sha256, numero_certificado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const adotar = this.db.prepare(
        "UPDATE folhas_campo SET pdf_arquivo = ?, pdf_sha256 = ? WHERE numero = ? AND pdf_arquivo = '' AND pdf IS NULL",
      )
      const voltaram: string[] = []
      const comArquivo: string[] = []
      const numeros: string[] = []
      for (const [n, f] of [...achadas].sort(([a], [b]) => a.localeCompare(b))) {
        const linha = existe.get(n, f.ano, f.sequencia) as { numero: string; pdf_arquivo: string; sem_blob: number } | undefined
        const caminho = join(this.pastaFolhas, f.arquivo)
        if (linha) {
          // No banco sem o PDF: o arquivo da primeira impressão (o nome sem sufixo) é o dela
          if (linha.numero === n && !linha.pdf_arquivo && linha.sem_blob && f.arquivo === `${f.ano}/${n}.pdf`) {
            adotar.run(f.arquivo, createHash('sha256').update(readFileSync(caminho)).digest('hex'), n)
            comArquivo.push(n)
          }
          continue
        }
        const pdf = readFileSync(caminho)
        const sha256 = createHash('sha256').update(pdf).digest('hex')
        const em = this.dataValida(dataDaImpressaoNoPdf(pdf)) ?? statSync(caminho).mtime.toISOString()
        // O nº do certificado impresso nela também volta: reservado no papel (livre), nunca dado a outro
        const certificado = numeroCertificadoNoPdf(pdf)
        inserir.run(n, f.ano, f.sequencia, `${CHAVE_RECUPERADA}${n}`, em, em, f.arquivo, sha256, certificado)
        if (certificado && this.reservarDoPapel(certificado, n, f.ano, em)) numeros.push(certificado)
        voltaram.push(n)
      }
      const registrar = (detalhe: string) =>
        this.db
          .prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'COPIA_RESTAURADA', ?)")
          .run(this.agora().toISOString(), detalhe.slice(0, 300))
      const faixa = (l: string[]) => (l.length === 1 ? l[0] : `${l[0]} a ${l.at(-1)}`)
      if (voltaram.length) {
        const um = voltaram.length === 1
        registrar(
          `${um ? 'a folha de campo' : `${voltaram.length} folhas de campo`} da pasta folhas-campo que não ${um ? 'estava' : 'estavam'} no banco (${faixa(voltaram)}) ${um ? 'voltou' : 'voltaram'} ao registro, livre${um ? '' : 's'}: o banco é de uma cópia anterior à impressão ${um ? 'dela' : 'delas'}`,
        )
      }
      if (numeros.length) {
        const um = numeros.length === 1
        registrar(
          `${um ? 'o nº de certificado impresso' : `${numeros.length} nºs de certificado impressos`} nas folhas que voltaram da pasta (${faixa(numeros)}) ${um ? 'continua reservado' : 'continuam reservados'}, no papel: os nºs não se repetem`,
        )
      }
      if (comArquivo.length) {
        const um = comArquivo.length === 1
        registrar(
          `${um ? 'a folha de campo' : `${comArquivo.length} folhas de campo`} ${faixa(comArquivo)}, sem PDF no banco, ${um ? 'ficou' : 'ficaram'} com o da pasta folhas-campo: a reimpressão é o papel`,
        )
      }
      return voltaram
    })
  }

  /**
   * O nº de certificado `numero`, impresso na folha `folha` (que voltou da pasta), volta ao registro dos nºs
   * reservados, sem dono, como o de uma folha avulsa: a sequência da emissão continua depois dele. Já
   * registrado, nada muda (só a folha, se for de outra mais nova: a folha nova com o mesmo nº, a que foi a campo,
   * vem depois na pasta); já num certificado (o banco voltou e o nº foi dado de novo), fica não utilizado.
   * Fora do formato da numeração, só fica na folha (`numero_certificado`). Devolve se registrou.
   */
  private reservarDoPapel(numero: string, folha: string, anoFolha: number, em: string): boolean {
    const registrado = this.db
      .prepare('SELECT id, calibracao_id, situacao, folha FROM numeros_reservados WHERE numero = ? ORDER BY id DESC LIMIT 1')
      .get(numero) as { id: number; calibracao_id: string; situacao: string; folha: string } | undefined
    if (registrado) {
      // Livre no papel: fica na folha mais nova (FC-AAAA-NNNNN em ordem)
      if (registrado.situacao === 'reservado' && !registrado.calibracao_id && folha > registrado.folha)
        this.numeroNaFolha(registrado.id, folha)
      return false
    }
    const lido = lerNumeroCertificado(this.obterConfig().numeracao, numero, anoFolha)
    if (
      !lido ||
      this.db.prepare('SELECT 1 FROM numeros_reservados WHERE ano = ? AND sequencia = ?').get(lido.ano, lido.sequencia)
    )
      return false
    const emitido = this.db
      .prepare('SELECT numero FROM calibracoes WHERE ano = ? AND sequencia = ? AND revisao = 0')
      .get(lido.ano, lido.sequencia) as { numero: string } | undefined
    this.db
      .prepare(
        `INSERT INTO numeros_reservados (numero, ano, sequencia, calibracao_id, folha, reservado_em, reservado_por, situacao, motivo, situacao_em)
         VALUES (?, ?, ?, '', ?, ?, '', ?, ?, ?)`,
      )
      .run(
        numero,
        lido.ano,
        lido.sequencia,
        folha,
        em,
        emitido ? 'nao_utilizado' : 'reservado',
        emitido
          ? `Impresso na folha ${folha}, que voltou da pasta das folhas de campo, mas o nº já estava no certificado ${emitido.numero}.`
          : '',
        emitido ? this.agora().toISOString() : '',
      )
    return true
  }

  /** A data ISO, se for de uma impressão possível (de 2020 até agora); senão null. */
  private dataValida(iso: string | null): string | null {
    const t = iso ? Date.parse(iso) : NaN
    return t >= Date.UTC(2020, 0, 1) && t <= this.agora().getTime() + 24 * 60 * 60 * 1000 ? iso : null
  }

  /**
   * Cada calibração com uma folha vigente só. Duas vigentes só aparecem num banco restaurado de uma cópia
   * com a ferramenta de antes desta versão (a folha impressa depois da cópia entrava sem trocar a da
   * cópia). Fica a mais nova, a que a tela já mostrava e reimprimia, e as outras saem como numa folha nova
   * (`substituirFolhas`): a impressa para a calibração fica substituída (não usada); a avulsa, livre. O
   * papel que foi a campo pode ser ligado de novo (`vincularFolhaCampo`). O registro de atividades guarda o
   * que mudou. Devolve os ids das calibrações conciliadas.
   */
  conciliarFolhasVigentes(): string[] {
    return transacao(this.db, () => {
      const ids = (
        this.db
          .prepare(
            `SELECT calibracao_id FROM folhas_campo WHERE calibracao_id <> '' AND substituida_por = ''
              GROUP BY calibracao_id HAVING COUNT(*) > 1 ORDER BY MIN(ano), MIN(sequencia)`,
          )
          .all() as Array<{ calibracao_id: string }>
      ).map((l) => l.calibracao_id)
      const trocas: string[] = []
      for (const id of ids) {
        const nova = this.db
          .prepare(
            `SELECT numero, impressa_em FROM folhas_campo WHERE calibracao_id = ? AND substituida_por = ''
              ORDER BY ano DESC, sequencia DESC LIMIT 1`,
          )
          .get(id) as { numero: string; impressa_em: string }
        const troca = this.substituirFolhas(id, nova.numero, nova.impressa_em)
        const saiu = troca.substituidas.map((n) => (troca.liberadas.includes(n) ? `${n}, que ficou livre` : n))
        trocas.push(`${nova.numero} no lugar da ${saiu.join(', ')}`)
        this.mudou('calibracao', id)
      }
      if (trocas.length) {
        const uma = trocas.length === 1
        this.db
          .prepare("INSERT INTO auditoria (em, ip, acao, detalhe) VALUES (?, 'local', 'COPIA_RESTAURADA', ?)")
          .run(
            this.agora().toISOString(),
            `${uma ? 'uma calibração tinha' : `${trocas.length} calibrações tinham`} mais de uma folha de campo vigente (banco restaurado de uma cópia) e ${uma ? 'ficou' : 'ficaram'} só com a mais nova: ${trocas.join('; ')}`.slice(
              0,
              300,
            ),
          )
      }
      return ids
    })
  }

  /** Grava o PDF na pasta das folhas ('<ano>/FC-….pdf'), sem nunca sobrescrever outro arquivo com o mesmo nome. */
  private gravarArquivoDaFolha(numero: string, ano: number, pdf: Buffer): { arquivo: string; sha256: string } {
    const sha256 = createHash('sha256').update(pdf).digest('hex')
    let arquivo = `${ano}/${numero}.pdf`
    const existente = join(this.pastaFolhas!, arquivo)
    if (existsSync(existente) && createHash('sha256').update(readFileSync(existente)).digest('hex') !== sha256)
      arquivo = `${ano}/${numero}-${sha256.slice(0, 12)}.pdf`
    const destino = join(this.pastaFolhas!, arquivo)
    if (!existsSync(destino)) {
      mkdirSync(dirname(destino), { recursive: true })
      const parcial = `${destino}.parcial`
      writeFileSync(parcial, pdf)
      renameSync(parcial, destino)
    }
    return { arquivo, sha256 }
  }

  /**
   * O PDF da primeira impressão da folha, ou null se ainda não foi guardado. O arquivo que sumiu da pasta (ou
   * foi alterado) é um erro: um PDF refeito agora não seria o mesmo papel.
   */
  private pdfFolhaCampo(numero: string): Buffer | null {
    const l = this.db.prepare('SELECT pdf, pdf_arquivo, pdf_sha256 FROM folhas_campo WHERE numero = ?').get(numero) as
      { pdf: Uint8Array | null; pdf_arquivo: string; pdf_sha256: string } | undefined
    if (!l) return null
    if (l.pdf_arquivo) {
      const caminho = this.pastaFolhas ? join(this.pastaFolhas, l.pdf_arquivo) : ''
      if (!caminho || !existsSync(caminho))
        throw new ErroApi(
          409,
          `O PDF da folha ${numero} não está na pasta de dados (folhas-campo/${l.pdf_arquivo}). Volte essa pasta da cópia de segurança externa: um PDF refeito agora não seria o mesmo papel.`,
        )
      const pdf = readFileSync(caminho)
      if (l.pdf_sha256 && createHash('sha256').update(pdf).digest('hex') !== l.pdf_sha256)
        throw new ErroApi(
          409,
          `O PDF da folha ${numero} (folhas-campo/${l.pdf_arquivo}) foi alterado depois da impressão. Volte o original da cópia de segurança externa.`,
        )
      return pdf
    }
    return l.pdf ? Buffer.from(l.pdf) : null
  }

  /**
   * Guarda o PDF da primeira impressão da folha (só se ainda não houver um) e devolve o guardado: dois
   * pedidos ao mesmo tempo recebem o mesmo arquivo, e toda reimpressão é igual à primeira, byte a byte. O
   * arquivo vai para a pasta das folhas (sem ela, para o banco, como antes).
   */
  guardarPdfFolhaCampo(numero: string, pdf: Buffer): Buffer {
    return transacao(this.db, () => {
      const guardado = this.pdfFolhaCampo(numero)
      if (guardado) return guardado
      const l = this.db.prepare('SELECT ano FROM folhas_campo WHERE numero = ?').get(numero) as { ano: number } | undefined
      if (!l) return pdf
      if (!this.pastaFolhas) {
        this.db.prepare('UPDATE folhas_campo SET pdf = ? WHERE numero = ? AND pdf IS NULL').run(pdf, numero)
        return pdf
      }
      const { arquivo, sha256 } = this.gravarArquivoDaFolha(numero, l.ano, pdf)
      this.db
        .prepare("UPDATE folhas_campo SET pdf_arquivo = ?, pdf_sha256 = ? WHERE numero = ? AND pdf_arquivo = ''")
        .run(arquivo, sha256, numero)
      return pdf
    })
  }

  private folhaCampo(numero: string): FolhaCampoImpressa | undefined {
    const l = this.db
      .prepare('SELECT numero, impressa_em, impressa_por, impressoes, ultima_em FROM folhas_campo WHERE numero = ?')
      .get(numero) as Record<string, string | number> | undefined
    return l
      ? {
          numero: String(l.numero),
          impressaEm: String(l.impressa_em),
          impressaPor: String(l.impressa_por),
          impressoes: Number(l.impressoes),
          ultimaEm: String(l.ultima_em),
        }
      : undefined
  }

  /**
   * A folha de campo vigente de uma calibração (a mais nova), ou null se nunca foi impressa. Uma revisão
   * sem folha própria usa a do certificado que ela substitui (a mesma visita; numa revisão de revisão, a do
   * original): `herdada`. `substituidas`: as impressas antes e trocadas por outra (não usadas). A folha de
   * um certificado cancelado que passou para a calibração refeita a partir do mesmo papel continua
   * aparecendo nele, com `passouPara` (quem a usa agora).
   */
  folhaCampoDaCalibracao(calibracaoId: string): FolhaCampoImpressa | null {
    const substituidas: string[] = []
    for (const id of this.cadeiaDaRevisao(calibracaoId)) {
      const linhas = this.db
        .prepare('SELECT numero, substituida_por FROM folhas_campo WHERE calibracao_id = ? ORDER BY ano, sequencia')
        .all(id) as Array<{ numero: string; substituida_por: string }>
      substituidas.push(...linhas.filter((l) => l.substituida_por).map((l) => l.numero))
      const vigente = linhas.filter((l) => !l.substituida_por).at(-1)
      const folha = vigente && this.folhaCampo(vigente.numero)
      if (folha) return { ...folha, herdada: id !== calibracaoId, substituidas }
      const passou = this.db
        .prepare(
          `SELECT p.numero, f.calibracao_id AS dono FROM folhas_campo_passagens p JOIN folhas_campo f ON f.numero = p.numero
            WHERE p.de_calibracao_id = ? AND p.substituida_por = '' ORDER BY p.id DESC LIMIT 1`,
        )
        .get(id) as { numero: string; dono: string } | undefined
      const dela = passou && this.folhaCampo(passou.numero)
      if (dela) {
        const dono = passou.dono ? this.obterCalibracao(passou.dono) : undefined
        return {
          ...dela,
          herdada: id !== calibracaoId,
          substituidas,
          passouPara: dono ? this.descreverCalibracao(dono) : 'outra calibração',
        }
      }
    }
    return null
  }

  /** A calibração e, se for revisão, as que ela substitui, da mais nova para o original. */
  private cadeiaDaRevisao(calibracaoId: string): string[] {
    const cadeia: string[] = []
    for (let id = calibracaoId; id && !cadeia.includes(id);) {
      cadeia.push(id)
      const l = this.db.prepare('SELECT substitui_id FROM calibracoes WHERE id = ?').get(id) as
        { substitui_id: string } | undefined
      id = l?.substitui_id ?? ''
    }
    return cadeia
  }

  /**
   * A calibração que responde pela folha de `dono`: ele mesmo ou, se ele foi substituído por revisões que
   * usam a folha dele (sem folha própria vigente), a última dessas revisões. É ela que diz se o papel ainda
   * vale (emitida) ou não (cancelada: a calibração refeita pode ficar com ele).
   */
  private fimDaCadeiaDaFolha(dono: Calibracao): Calibracao {
    let atual = dono
    const vistos = new Set([dono.id])
    while (atual.status === 'SUBSTITUIDO') {
      const rev = this.db
        .prepare(
          `SELECT id FROM calibracoes WHERE substitui_id = ? AND status IN ('EMITIDO', 'SUBSTITUIDO', 'CANCELADO')
            ORDER BY revisao DESC LIMIT 1`,
        )
        .get(atual.id) as { id: string } | undefined
      if (!rev || vistos.has(rev.id)) break
      const propria = this.db.prepare("SELECT 1 FROM folhas_campo WHERE calibracao_id = ? AND substituida_por = ''").get(rev.id)
      const revisao = propria ? undefined : this.obterCalibracao(rev.id)
      if (!revisao) break
      vistos.add(revisao.id)
      atual = revisao
    }
    return atual
  }

  /** "CC-2026-00012" ou, sem nº, "rascunho da OS 77, Mercado Bom Preço, balança nº de série TL-2231". */
  private descreverCalibracao(k: Calibracao): string {
    if (k.numero) return k.numero
    const os = k.ordemServico.trim()
    const c = this.obterCliente(k.clienteId)
    const b = this.obterBalanca(k.balancaId)
    const situacao = k.status === 'REVISAO' ? 'calibração em revisão' : 'rascunho'
    return [
      `${situacao}${os ? ` da ${/^OS\b/i.test(os) ? os : `OS ${os}`}` : ''}`,
      c ? c.nome || c.razaoSocial : '',
      b ? (b.numeroSerie ? `balança nº de série ${b.numeroSerie}` : b.identificacao ? `balança ${b.identificacao}` : '') : '',
    ]
      .filter(Boolean)
      .join(', ')
  }

  /**
   * Liga a uma calibração em andamento a folha de campo preenchida no cliente, pelo nº dela: a avulsa (em
   * branco, só do cliente ou da balança), a de um rascunho excluído, a de um certificado cancelado (a
   * calibração refeita a partir do mesmo papel; só com `podeCancelado`, a permissão de cancelar
   * certificados, e a passagem fica registrada: o cancelado continua mostrando a folha, e ela volta para ele
   * se a refeita for excluída), a avulsa ligada por engano a outra calibração em andamento e já trocada lá
   * ou, numa revisão, a do certificado revisado (fica com ele). A folha que a calibração tinha sai dela (ver
   * `substituirFolhas`); `substituiu` diz quais e `liberadas`, as avulsas que ficaram livres. Ligar de novo
   * uma folha substituída da própria calibração (a de antes foi a campo, afinal) a traz de volta. A folha de
   * outra calibração que ainda vale é recusada, e a mensagem diz qual: o histórico dela não muda. Impressa
   * para outra balança (ou, sem balança, para outro cliente): só com `confirmar`. `notas`: o que o registro
   * de atividades deve guardar (de onde a folha veio). O nº de certificado impresso na folha ligada passa a
   * ser o da calibração (o nº segue o papel; na revisão, não: ver `numeroAoLigar`): `numeroDaFolha` diz qual e
   * como ficou (`usado`, ou o motivo), e `eventos`, o que vai para o registro de atividades.
   */
  vincularFolhaCampo(
    numero: string,
    k: Pick<Calibracao, 'id' | 'status' | 'balancaId' | 'clienteId'>,
    o: { confirmar?: boolean; podeCancelado?: boolean; por?: string } = {},
  ): FolhaCampoImpressa & {
    substituiu: string[]
    liberadas: string[]
    notas: string[]
    eventos: EventoNumero[]
    numeroDaFolha: NumeroDaFolha | null
  } {
    // Sem registro, mas com o PDF na pasta: o banco voltou de uma cópia anterior à impressão dela, que volta
    // ao registro (fica lá mesmo que a ligação abaixo seja recusada ou peça confirmação)
    if (!this.db.prepare('SELECT 1 FROM folhas_campo WHERE numero = ?').get(numero)) this.recuperarFolhasDaPasta(numero)
    return transacao(this.db, () => {
      if (k.status !== 'RASCUNHO' && k.status !== 'REVISAO')
        throw new ErroApi(409, 'A folha de campo só pode ser ligada a uma calibração em andamento (rascunho ou em revisão).')
      const linha = this.db
        .prepare(
          `SELECT calibracao_id, balanca_id, cliente_id, chave, substituida_por, substituida_em FROM folhas_campo
            WHERE numero = ?`,
        )
        .get(numero) as
        | {
            calibracao_id: string
            balanca_id: string
            cliente_id: string
            chave: string
            substituida_por: string
            substituida_em: string
          }
        | undefined
      if (!linha) throw new ErroApi(404, `A folha ${numero} não foi impressa por este sistema. Confira o nº no alto da folha.`)
      const agora = this.agora().toISOString()
      const dono = linha.calibracao_id
      const vigente = !linha.substituida_por
      const notas: string[] = []
      const resultado = (troca: TrocaFolhas) => {
        // Houve troca: o nº do certificado segue o papel ligado (na revisão, o do revisado, sem mudança)
        const cert =
          troca.substituidas.length && dono === k.id
            ? this.numeroAoLigar(numero, k.id, o.por ?? '')
            : { eventos: [], numeroDaFolha: null }
        if (troca.substituidas.length) this.mudou('calibracao', k.id)
        return {
          ...this.folhaCampoDaCalibracao(k.id)!,
          substituiu: troca.substituidas,
          liberadas: troca.liberadas,
          notas,
          eventos: [...troca.eventos, ...cert.eventos],
          numeroDaFolha: cert.numeroDaFolha,
        }
      }
      // Já é a folha da calibração. Se ela tem outra vigente (uma cópia antiga do banco voltou com a folha
      // impressa depois dela), a ligada agora passa a ser a dela, e a outra sai, como numa troca
      if (dono === k.id && vigente)
        return resultado(
          this.folhaCampoDaCalibracao(k.id)?.numero === numero ? semTroca() : this.substituirFolhas(k.id, numero, agora),
        )
      const outra = dono && dono !== k.id ? this.obterCalibracao(dono) : undefined
      let passagem = false
      if (outra) {
        const qual = outra.numero ? ` (${outra.numero})` : ''
        if (this.cadeiaDaRevisao(k.id).includes(dono)) {
          // Revisão: a folha do certificado revisado é a da mesma visita. Fica com ele e a revisão passa a
          // usá-la (a folha própria da revisão, se havia, sai dela)
          if (vigente) return resultado(this.substituirFolhas(k.id, numero, agora))
          throw new ErroApi(
            409,
            `A folha ${numero} foi trocada por outra no certificado revisado${qual}: lá ela ficou registrada como não usada.`,
          )
        }
        // Quem responde pela folha: o dono ou, se ele foi revisado, a última revisão que usa a folha dele
        const fim = this.fimDaCadeiaDaFolha(outra)
        if (fim.status === 'CANCELADO') {
          // Certificado cancelado não pode ser revisado: a calibração refeita a partir do mesmo papel fica com ele
          if (!o.podeCancelado)
            throw new ErroApi(
              403,
              `A folha ${numero} é o registro dos dados brutos ${fim.numero ? `do certificado cancelado ${fim.numero}` : 'de um certificado cancelado'}: só o administrador a passa para outra calibração.`,
              { codigo: 'SEM_PERMISSAO', permissao: 'cancelarCertificado' },
            )
          notas.push(`era do ${fim.numero || 'certificado'}, cancelado`)
          passagem = true
        } else if (
          !vigente &&
          (outra.status === 'RASCUNHO' || outra.status === 'REVISAO') &&
          !impressaPara(linha.chave, outra.id)
        )
          // Avulsa ligada por engano a outra calibração em andamento e já trocada lá: não é o registro dela
          notas.push(`estava como não usada em ${this.descreverCalibracao(outra)}`)
        // A de outra calibração que vale (mesmo substituída nela): o histórico dela não muda
        else throw new ErroApi(409, `A folha ${numero} já é de outra calibração (${this.descreverCalibracao(fim)}).`)
      }
      // Impressa para outra balança: o cadastro pode ter mudado depois da impressão, mas pode ser engano no
      // nº. Só com confirmação. A mesma balança, que passou para outro cliente, vale (fica no registro)
      const outraBalanca = !!linha.balanca_id && linha.balanca_id !== k.balancaId
      const outroCliente = !!linha.cliente_id && linha.cliente_id !== k.clienteId
      if (outraBalanca || (outroCliente && !linha.balanca_id)) {
        const para = outraBalanca ? this.paraQualBalanca(linha.balanca_id) : this.paraQualCliente(linha.cliente_id)
        if (!o.confirmar)
          throw new ErroApi(
            409,
            `A folha ${numero} foi impressa ${para}. Confira o nº no alto da folha; se é ela mesmo, ligue assim mesmo.`,
            { codigo: 'CONFIRMAR_FOLHA' },
          )
        notas.push(`impressa ${para}`)
      } else if (outroCliente) {
        const c = this.obterCliente(linha.cliente_id)
        notas.push(
          `impressa quando a balança era ${c ? `do cliente ${c.nome || c.razaoSocial}` : 'de um cliente que foi excluído'}`,
        )
      }
      // Voltou da pasta (o banco é de antes da impressão dela): não se sabe para qual balança foi impressa
      if (linha.chave.startsWith(CHAVE_RECUPERADA)) {
        if (!o.confirmar)
          throw new ErroApi(
            409,
            `A folha ${numero} voltou da pasta das folhas de campo (o banco foi restaurado de uma cópia anterior à impressão dela) e não se sabe para qual balança foi impressa. Confira o nº e a balança no alto da folha; se é ela mesmo, ligue assim mesmo.`,
            { codigo: 'CONFIRMAR_FOLHA' },
          )
        notas.push('recuperada da pasta das folhas de campo')
      }
      const troca = this.substituirFolhas(k.id, numero, agora)
      if (passagem)
        this.db
          .prepare(
            `INSERT INTO folhas_campo_passagens (numero, de_calibracao_id, para_calibracao_id, substituida_por, substituida_em, em, por)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(numero, dono, k.id, linha.substituida_por, linha.substituida_em, agora, (o.por ?? '').slice(0, 120))
      this.db
        .prepare("UPDATE folhas_campo SET calibracao_id = ?, substituida_por = '', substituida_em = '' WHERE numero = ?")
        .run(k.id, numero)
      // Depois da troca (o nº de uma avulsa que saiu já voltou para ela): o nº impresso nesta avulsa
      const cert = this.numeroAoLigar(numero, k.id, o.por ?? '')
      if (outra) this.mudou('calibracao', outra.id)
      this.mudou('calibracao', k.id)
      return {
        ...this.folhaCampoDaCalibracao(k.id)!,
        substituiu: troca.substituidas,
        liberadas: troca.liberadas,
        notas,
        eventos: [...troca.eventos, ...cert.eventos],
        numeroDaFolha: cert.numeroDaFolha,
      }
    })
  }

  /** "para a balança Toledo 9094, nº de série TL-2231" (ou "… que foi excluída"), para as mensagens da folha. */
  private paraQualBalanca(id: string): string {
    const b = this.obterBalanca(id)
    if (!b) return 'para uma balança que foi excluída'
    const nome = [b.fabricante, b.modelo].filter(Boolean).join(' ')
    const serie = b.numeroSerie ? `nº de série ${b.numeroSerie}` : b.identificacao
    return `para a balança ${[nome, serie].filter(Boolean).join(', ') || 'sem identificação'}`
  }

  /** "para o cliente Mercado Bom Preço" (ou "… que foi excluído"). */
  private paraQualCliente(id: string): string {
    const c = this.obterCliente(id)
    return c ? `para o cliente ${c.nome || c.razaoSocial}` : 'para um cliente que foi excluído'
  }

  // ---- Envios por e-mail ------------------------------------------------------------

  registrarEnvio(e: Omit<Envio, 'id' | 'em'> & { usuarioId: string }) {
    transacao(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO envios (id, calibracao_id, cliente_id, tipo, para, assunto, usuario_id, usuario_nome, em, anexos)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          e.anexos?.length ? JSON.stringify(e.anexos) : '',
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
      anexos: anexosDoEnvio(l.anexos),
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

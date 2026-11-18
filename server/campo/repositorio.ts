// O lado do servidor do app do celular do técnico (shared/campo/protocolo.ts): os celulares cadastrados, os envios das
// folhas de campo para o celular, os registros que voltam do campo e o que o escritório leva deles para a calibração.
// Fica fora do server/repositorio.ts (que já passa de 3 mil linhas) e usa o Repositorio para a calibração e a folha.
//
// Regras (05-ajustes-finais §6 e §7):
// - O envio tem quatro situações (ENVIADA, NO_CELULAR, DEVOLVIDA, RECOLHIDA) e no máximo um envio vivo por folha (índice
//   no banco). A folha que já tem registro não descartado não é enviada de novo (para medir de novo: folha nova).
// - Recolher: na hora, se o celular ainda não baixou; depois, vira pedido (o celular apaga a folha não começada, ou
//   responde que já começou e a entrega quando puder); à força, pelo administrador, de qualquer situação viva.
// - Receber um registro SEMPRE grava, como chegou, e nunca dá erro por causa da situação do envio: envio desconhecido →
//   ORFAO; aparelho revogado → APARELHO_REVOGADO; envio já recolhido → APOS_RECOLHER (o envio continua RECOLHIDA);
//   problemas de formato ou de assinatura → FORMATO; hora do celular a mais de 5 min → RELOGIO; piloto → PILOTO. O mesmo
//   registro reenviado (o mesmo sha256) devolve o mesmo recibo. Uma revisão mais nova do mesmo envio (depois de reabrir)
//   deixa a anterior SUPERADO. O sha256 é interno: nunca vai para a tela.

import { createHash, randomUUID } from 'node:crypto'
import { calcularConteudoSha256, calcularSha256Registro, jsonCanonico } from '#shared/campo/canonico.ts'
import { resumoDoEnvio } from '#shared/campo/pacote.ts'
import {
  CONTRATO_CAMPO_MINIMO,
  diferencaRelogioMs,
  MENSAGENS_ERRO_CAMPO,
  montarRecibo,
  ROTAS_CAMPO,
  relogioDiferente,
  textoDeUmaLinha,
  versaoAppValida,
  versaoMaisNova,
  type EstadoInformado,
  type InfoApk,
  type PedidoOla,
  type PedidoRecolhimento,
  type RespostaDoRecolhimento,
  type RespostaOla,
  type RespostaRecebida,
  type ResumoEnvio,
} from '#shared/campo/protocolo.ts'
import { conferirAssinaturas, validarPng, validarRegistro } from '#shared/campo/registro.ts'
import {
  DESFECHOS,
  ESTADOS_FOLHA_CELULAR,
  MARCAS_REGISTRO,
  REGISTRO_ORIGINAL_PADRAO,
  TIPOS_FOLHA_CAMPO,
  type Desfecho,
  type EstadoFolhaCelular,
  type MarcaRegistro,
  type PacoteCampo,
  type ProblemaRegistro,
  type ReciboCampo,
  type RegistroCampo,
  type RegistroOriginal,
  type SituacaoEnvio,
  type SituacaoRegistro,
  type TipoFolhaCampo,
} from '#shared/campo/tipos.ts'
import { diaEmBrasilia, normalizarCalibracao } from '#shared/dominio.ts'
import type {
  Calibracao,
  CalibracaoInput,
  CampoDaFolha,
  CelularDaFolha,
  CelularListado,
  ConfiguracaoCampo,
  EnvioCampoListado,
  FolhaCampoNoPainel,
  ImportacaoCampo,
  MotivoRevogacao,
  RegistroCampoDetalhe,
  RegistroCampoListado,
  ResumoCampoPainel,
} from '#shared/tipos.ts'
import { MOTIVOS_REVOGACAO } from '#shared/tipos.ts'
import { type Banco, transacao } from '../db.ts'
import { ErroApi } from '../erros.ts'
import type { Repositorio } from '../repositorio.ts'
import { pngDecodificavel } from './png.ts'

/** sha256 (hex minúsculo) do UTF-8 de um texto: o mesmo do celular (`sha256Hex`, `sha256WebCrypto`). */
export const sha256 = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex')

/** Os passos de medição da calibração, travados enquanto a folha está no celular (registro original = CELULAR). */
export const CAMPOS_DE_MEDICAO = ['padroesIds', 'ambiente', 'indicacao', 'repetibilidade', 'excentricidade'] as const

const ATIVAS = "('ENVIADA', 'NO_CELULAR', 'DEVOLVIDA')"

// ---- Linhas do banco -----------------------------------------------------------------------------------------------

export interface LinhaDispositivo {
  id: string
  usuario_id: string
  nome: string
  modelo: string
  token_sha256: string
  pareado_em: string
  pareamentos: number
  versao_app: string
  criado_em: string
  criado_por: string
  ultimo_contato: string
  ultimo_ip: string
  revogado_em: string
  revogado_por: string
  revogado_motivo: MotivoRevogacao | ''
  revogado_texto: string
}

export interface LinhaEnvio {
  id: string
  numero: string
  usuario_id: string
  dispositivo_id: string
  situacao: SituacaoEnvio
  pacote: string
  pacote_sha256: string
  contrato: number
  piloto: number
  calibracao_id: string
  tipo: string
  cliente: string
  balanca: string
  data_prevista: string
  recado: string
  enviado_em: string
  enviado_por: string
  baixado_em: string
  recebido_em: string
  estado_celular: string
  estado_celular_em: string
  recolher_pedido_em: string
  recolher_pedido_por: string
  recolher_motivo: string
  recolher_resposta: string
  recolher_resposta_em: string
  recolhido_em: string
  recolhido_por: string
  forcado: number
  devolvido_em: string
  devolvida_apos_recolher: number
}

export interface LinhaRegistro {
  id: string
  envio_id: string
  numero: string
  usuario_id: string
  dispositivo_id: string
  formato: number
  contrato: number
  piloto: number
  conteudo: string
  sha256: string
  conteudo_sha256: string
  revisao_local: number
  anterior_sha256: string
  desfecho: Desfecho | ''
  recebido_em: string
  ip: string
  relogio_diferenca_s: number | null
  situacao: SituacaoRegistro
  marcas: string
  problemas: string
  ligado_a: string
  situacao_motivo: string
  situacao_por: string
  situacao_em: string
}

interface LinhaImportacao {
  id: string
  registro_id: string
  calibracao_id: string
  tipo: 'PUXAR' | 'COMPARACAO'
  versao_antes: number
  versao_depois: number
  feito_em: string
  feito_por: string
  resumo: string
  observacao: string
}

/** O celular autenticado de uma requisição (server/campo/autenticacao.ts). */
export interface DispositivoDaRequisicao {
  linha: LinhaDispositivo
  /** Revogado (só entrega, menos o motivo ROUBADO, que nem chega aqui). */
  revogado: boolean
}

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const lerJson = <T>(texto: string, padrao: T): T => {
  try {
    return JSON.parse(texto) as T
  } catch {
    return padrao
  }
}
const marcasDe = (texto: string): MarcaRegistro[] =>
  lerJson<unknown[]>(texto, []).filter((m): m is MarcaRegistro => MARCAS_REGISTRO.includes(m as MarcaRegistro))
const naOrdem = (marcas: Iterable<MarcaRegistro>): MarcaRegistro[] => {
  const s = new Set(marcas)
  return MARCAS_REGISTRO.filter((m) => s.has(m))
}
const estadoCelular = (v: string): EstadoFolhaCelular | '' =>
  ESTADOS_FOLHA_CELULAR.includes(v as EstadoFolhaCelular) ? (v as EstadoFolhaCelular) : ''

export function envioParaLista(l: LinhaEnvio, nomes: ReadonlyMap<string, string>): EnvioCampoListado {
  return {
    id: l.id,
    numero: l.numero,
    tecnicoId: l.usuario_id,
    tecnico: nomes.get(l.usuario_id) ?? '',
    dispositivoId: l.dispositivo_id,
    situacao: l.situacao,
    tipo: (TIPOS_FOLHA_CAMPO.includes(l.tipo as TipoFolhaCampo) ? l.tipo : 'calibracao') as TipoFolhaCampo,
    cliente: l.cliente,
    balanca: l.balanca,
    piloto: !!l.piloto,
    calibracaoId: l.calibracao_id,
    dataPrevista: l.data_prevista,
    recado: l.recado,
    enviadoEm: l.enviado_em,
    enviadoPor: l.enviado_por,
    baixadoEm: l.baixado_em,
    recebidoEm: l.recebido_em,
    estadoCelular: estadoCelular(l.estado_celular),
    estadoCelularEm: l.estado_celular_em,
    recolherPedidoEm: l.recolher_pedido_em,
    recolherPedidoPor: l.recolher_pedido_por,
    recolherMotivo: l.recolher_motivo,
    recolherResposta: l.recolher_resposta === 'JA_COMECEI' ? 'JA_COMECEI' : '',
    recolherRespostaEm: l.recolher_resposta_em,
    recolhidoEm: l.recolhido_em,
    recolhidoPor: l.recolhido_por,
    forcado: !!l.forcado,
    devolvidoEm: l.devolvido_em,
    devolvidaAposRecolher: !!l.devolvida_apos_recolher,
  }
}

/** Quando a situação do envio mudou pela última vez. */
const mudouEm = (l: LinhaEnvio) =>
  l.situacao === 'RECOLHIDA'
    ? l.recolhido_em
    : l.situacao === 'DEVOLVIDA'
      ? l.devolvido_em
      : l.situacao === 'NO_CELULAR'
        ? l.recebido_em
        : l.enviado_em

const nomesDosUsuarios = (db: Banco): Map<string, string> =>
  new Map((db.prepare('SELECT id, nome FROM usuarios').all() as Array<{ id: string; nome: string }>).map((u) => [u.id, u.nome]))

/**
 * O celular de cada folha da lista (aba "Folhas de campo"): o envio mais recente e o registro mais novo que voltou (não
 * descartado; também o órfão ligado à folha). Só as folhas com envio ou registro entram no mapa.
 */
export function celularDasFolhas(db: Banco, numeros: string[], nomes = nomesDosUsuarios(db)): Map<string, CelularDaFolha> {
  const r = new Map<string, CelularDaFolha>()
  if (!numeros.length || !temTabelasDoCampo(db)) return r
  const marcadores = numeros.map(() => '?').join(', ')
  const envios = db
    .prepare(`SELECT * FROM folhas_campo_envios WHERE numero IN (${marcadores}) ORDER BY enviado_em DESC, rowid DESC`)
    .all(...numeros) as unknown as LinhaEnvio[]
  const registros = db
    .prepare(
      `SELECT r.id, CASE WHEN r.ligado_a <> '' THEN r.ligado_a ELSE r.numero END AS folha, r.situacao, r.marcas, r.recebido_em, r.desfecho,
              EXISTS (SELECT 1 FROM campo_importacoes i WHERE i.registro_id = r.id) AS importado
         FROM registros_campo r
        WHERE r.situacao <> 'DESCARTADO' AND (r.numero IN (${marcadores}) OR r.ligado_a IN (${marcadores}))
        ORDER BY r.recebido_em DESC, r.rowid DESC`,
    )
    .all(...numeros, ...numeros) as Array<{
    id: string
    folha: string
    situacao: SituacaoRegistro
    marcas: string
    recebido_em: string
    desfecho: Desfecho | ''
    importado: number
  }>
  for (const e of envios) {
    if (r.has(e.numero)) continue
    r.set(e.numero, {
      envioId: e.id,
      situacao: e.situacao,
      tecnico: nomes.get(e.usuario_id) ?? '',
      tecnicoId: e.usuario_id,
      em: mudouEm(e),
      estadoCelular: estadoCelular(e.estado_celular),
      estadoCelularEm: e.estado_celular_em,
      dataPrevista: e.data_prevista,
      ...(e.recolher_pedido_em && (e.situacao === 'ENVIADA' || e.situacao === 'NO_CELULAR') ? { recolherPedido: true } : {}),
      ...(e.recolher_resposta === 'JA_COMECEI' ? { jaComecei: true } : {}),
      piloto: !!e.piloto,
      marcas: [],
    })
  }
  const vistos = new Set<string>()
  for (const g of registros) {
    const c = r.get(g.folha)
    if (!c) continue
    if (g.situacao === 'VALIDO' && !g.importado) c.voltou = true
    if (vistos.has(g.folha)) continue
    vistos.add(g.folha)
    c.marcas = marcasDe(g.marcas)
    c.registroId = g.id
    if (g.desfecho && g.desfecho !== 'COMPLETA') c.desfecho = g.desfecho
  }
  return r
}

/** O banco já tem as tabelas do app do celular (migração 25)? */
export const temTabelasDoCampo = (db: Banco) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'folhas_campo_envios'").get()

/** Os cartões do Painel: "Voltaram do campo" e "Ainda no celular" (data prevista já passada). */
export function resumoCampoPainel(db: Banco, hoje: string, nomes = nomesDosUsuarios(db)): ResumoCampoPainel {
  if (!temTabelasDoCampo(db)) return { voltaram: [], aindaNoCelular: [] }
  const voltaram = (
    db
      .prepare(
        `SELECT r.id AS registro_id, r.numero, r.ligado_a, r.recebido_em, r.marcas, r.usuario_id, r.envio_id,
                e.cliente, e.balanca, e.data_prevista, e.situacao, e.estado_celular, e.estado_celular_em, e.calibracao_id
           FROM registros_campo r
           LEFT JOIN folhas_campo_envios e ON e.id = r.envio_id
          WHERE r.situacao = 'VALIDO' AND NOT EXISTS (SELECT 1 FROM campo_importacoes i WHERE i.registro_id = r.id)
          ORDER BY r.recebido_em DESC, r.rowid DESC LIMIT 50`,
      )
      .all() as Array<{
      registro_id: string
      numero: string
      ligado_a: string
      recebido_em: string
      marcas: string
      usuario_id: string
      envio_id: string
      cliente: string | null
      balanca: string | null
      data_prevista: string | null
      situacao: SituacaoEnvio | null
      estado_celular: string | null
      estado_celular_em: string | null
      calibracao_id: string | null
    }>
  ).map((l): FolhaCampoNoPainel => ({
    numero: l.ligado_a || l.numero,
    envioId: l.envio_id,
    cliente: l.cliente ?? '',
    balanca: l.balanca ?? '',
    tecnico: nomes.get(l.usuario_id) ?? '',
    dataPrevista: l.data_prevista ?? '',
    situacao: l.situacao ?? 'DEVOLVIDA',
    estadoCelular: estadoCelular(l.estado_celular ?? ''),
    estadoCelularEm: l.estado_celular_em ?? '',
    ...(l.calibracao_id ? { calibracaoId: l.calibracao_id } : {}),
    registroId: l.registro_id,
    recebidoEm: l.recebido_em,
    marcas: marcasDe(l.marcas),
  }))
  const noCelular = db
    .prepare("SELECT * FROM folhas_campo_envios WHERE situacao = 'NO_CELULAR' ORDER BY data_prevista, enviado_em")
    .all() as unknown as LinhaEnvio[]
  const aindaNoCelular = noCelular
    .filter((e) => (e.data_prevista || diaEmBrasilia(e.enviado_em) || e.enviado_em.slice(0, 10)) < hoje)
    .map((e): FolhaCampoNoPainel => ({
      numero: e.numero,
      envioId: e.id,
      cliente: e.cliente,
      balanca: e.balanca,
      tecnico: nomes.get(e.usuario_id) ?? '',
      dataPrevista: e.data_prevista,
      situacao: e.situacao,
      estadoCelular: estadoCelular(e.estado_celular),
      estadoCelularEm: e.estado_celular_em,
      ...(e.calibracao_id ? { calibracaoId: e.calibracao_id } : {}),
    }))
  return { voltaram, aindaNoCelular }
}

export interface OpcoesRepositorioCampo {
  /** Identidade do servidor (id da instalação e nome do computador) para o olá. */
  servidor: { id: string; nome: string }
}

/** "a folha FC-… foi pedida de volta ao celular" (`recolherDaCalibracao`, para o registro de atividades). */
export function textoDasRecolhidas(recolhidas: ReadonlyArray<{ envio: Pick<LinhaEnvio, 'numero'>; imediato: boolean }>): string {
  return recolhidas
    .map((r) =>
      r.imediato
        ? `a folha ${r.envio.numero} foi recolhida (o celular ainda não tinha baixado)`
        : `a folha ${r.envio.numero} foi pedida de volta ao celular`,
    )
    .join('; ')
}

export class RepositorioCampo {
  private db: Banco
  private repo: Repositorio
  private servidor: { id: string; nome: string }

  constructor(db: Banco, repo: Repositorio, opcoes: OpcoesRepositorioCampo) {
    this.db = db
    this.repo = repo
    this.servidor = opcoes.servidor
  }

  /** Relógio (o do Repositorio: os testes trocam lá). */
  private agora(): Date {
    return this.repo.agora()
  }

  private nomes() {
    return nomesDosUsuarios(this.db)
  }

  private usuario(id: string): { id: string; nome: string; login: string; ativo: boolean; tecnico: boolean } | undefined {
    const l = this.db.prepare('SELECT id, nome, login, ativo, tecnico FROM usuarios WHERE id = ?').get(id) as
      { id: string; nome: string; login: string; ativo: number; tecnico: number } | undefined
    return l && { id: l.id, nome: l.nome, login: l.login, ativo: !!l.ativo, tecnico: l.tecnico !== 0 }
  }

  // ---- Configuração --------------------------------------------------------------------------------------------

  /** A configuração do app do celular (na tabela de configurações, chave 'campo'); padrão: o papel é o original. */
  configuracao(): ConfiguracaoCampo {
    const l = this.db.prepare("SELECT valor FROM config WHERE chave = 'campo'").get() as { valor: string } | undefined
    const c = l ? lerJson<Record<string, unknown>>(l.valor, {}) : {}
    const registroOriginal: RegistroOriginal = c.registroOriginal === 'CELULAR' ? 'CELULAR' : REGISTRO_ORIGINAL_PADRAO
    return { registroOriginal }
  }

  salvarConfiguracao(entrada: unknown): { config: ConfiguracaoCampo; mudou: boolean } {
    const r = ehObj(entrada) ? entrada : {}
    if (r.registroOriginal !== 'PAPEL' && r.registroOriginal !== 'CELULAR')
      throw new ErroApi(400, 'Escolha o registro original: o papel ou o celular.')
    return transacao(this.db, () => {
      const antes = this.configuracao()
      const config: ConfiguracaoCampo = { registroOriginal: r.registroOriginal as RegistroOriginal }
      this.db
        .prepare("INSERT INTO config (chave, valor) VALUES ('campo', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
        .run(JSON.stringify(config))
      const mudou = antes.registroOriginal !== config.registroOriginal
      if (mudou) this.repo.avisar('config')
      return { config, mudou }
    })
  }

  /** Piloto (o papel é o registro original). */
  piloto(): boolean {
    return this.configuracao().registroOriginal === 'PAPEL'
  }

  // ---- Celulares -----------------------------------------------------------------------------------------------

  dispositivoPorToken(tokenSha256: string): LinhaDispositivo | undefined {
    if (!tokenSha256) return undefined
    return this.db.prepare('SELECT * FROM dispositivos WHERE token_sha256 = ?').get(tokenSha256) as LinhaDispositivo | undefined
  }

  obterDispositivo(id: string): LinhaDispositivo | undefined {
    return this.db.prepare('SELECT * FROM dispositivos WHERE id = ?').get(id) as LinhaDispositivo | undefined
  }

  private paraCelular(l: LinhaDispositivo, nomes: ReadonlyMap<string, string>, ativos: ReadonlySet<string>): CelularListado {
    const folhas = (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM folhas_campo_envios WHERE dispositivo_id = ? AND situacao = 'NO_CELULAR'")
        .get(l.id) as { n: number }
    ).n
    return {
      id: l.id,
      nome: l.nome,
      modelo: l.modelo,
      versaoApp: l.versao_app,
      tecnicoId: l.usuario_id,
      tecnicoNome: nomes.get(l.usuario_id) ?? '',
      tecnicoAtivo: ativos.has(l.usuario_id),
      pareadoEm: l.pareado_em,
      pareamentos: Number(l.pareamentos) || 1,
      criadoEm: l.criado_em,
      criadoPor: l.criado_por,
      ultimoContato: l.ultimo_contato,
      ultimoIp: l.ultimo_ip,
      folhasNoCelular: Number(folhas) || 0,
      revogado: !!l.revogado_em,
      revogadoEm: l.revogado_em,
      revogadoPor: l.revogado_por,
      revogadoMotivo: l.revogado_motivo,
      revogadoTexto: l.revogado_texto,
    }
  }

  private ativos(): Set<string> {
    return new Set((this.db.prepare('SELECT id FROM usuarios WHERE ativo = 1').all() as Array<{ id: string }>).map((u) => u.id))
  }

  /** Os celulares: os que valem antes dos revogados, pelo nome do técnico. */
  listarCelulares(): CelularListado[] {
    const nomes = this.nomes()
    const ativos = this.ativos()
    const linhas = this.db.prepare('SELECT * FROM dispositivos').all() as unknown as LinhaDispositivo[]
    return linhas
      .map((l) => this.paraCelular(l, nomes, ativos))
      .sort(
        (a, b) =>
          Number(a.revogado) - Number(b.revogado) ||
          a.tecnicoNome.localeCompare(b.tecnicoNome, 'pt-BR') ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      )
  }

  celular(id: string): CelularListado {
    const l = this.obterDispositivo(id)
    if (!l) throw new ErroApi(404, 'Celular não encontrado.')
    return this.paraCelular(l, this.nomes(), this.ativos())
  }

  /** O técnico tem algum celular que vale? */
  temCelular(usuarioId: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM dispositivos WHERE usuario_id = ? AND revogado_em = ''").get(usuarioId)
  }

  /**
   * Grava o celular do pareamento aceito: novo, ou o mesmo aparelho de novo (o mesmo id: as folhas dele ficam). O token
   * antigo deixa de valer (só o sha256 do novo fica) e a revogação, se havia, sai.
   */
  registrarPareamento(e: {
    aparelhoId: string
    usuarioId: string
    modelo: string
    versaoApp: string
    tokenSha256: string
    por: string
  }): { celular: CelularListado; novo: boolean; trocouTecnico: boolean } {
    return transacao(this.db, () => {
      const agora = this.agora().toISOString()
      const atual = this.obterDispositivo(e.aparelhoId)
      const tecnico = this.usuario(e.usuarioId)
      const primeiroNome = (tecnico?.nome ?? '').trim().split(/\s+/)[0] ?? ''
      const nomePadrao = primeiroNome ? `Celular de ${primeiroNome}` : 'Celular do técnico'
      if (atual) {
        const trocouTecnico = atual.usuario_id !== e.usuarioId
        this.db
          .prepare(
            `UPDATE dispositivos SET usuario_id = ?, nome = ?, modelo = ?, token_sha256 = ?, pareado_em = ?,
                    pareamentos = pareamentos + 1, versao_app = ?, revogado_em = '', revogado_por = '', revogado_motivo = '',
                    revogado_texto = '' WHERE id = ?`,
          )
          .run(
            e.usuarioId,
            trocouTecnico ? nomePadrao : atual.nome,
            e.modelo || atual.modelo,
            e.tokenSha256,
            agora,
            e.versaoApp,
            e.aparelhoId,
          )
        return { celular: this.celular(e.aparelhoId), novo: false, trocouTecnico }
      }
      this.db
        .prepare(
          `INSERT INTO dispositivos (id, usuario_id, nome, modelo, token_sha256, pareado_em, versao_app, criado_em, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(e.aparelhoId, e.usuarioId, nomePadrao, e.modelo, e.tokenSha256, agora, e.versaoApp, agora, e.por.slice(0, 120))
      return { celular: this.celular(e.aparelhoId), novo: true, trocouTecnico: false }
    })
  }

  renomear(id: string, nome: unknown): { celular: CelularListado; antes: string } {
    const novo = textoDeUmaLinha(nome, 60)
    if (!novo) throw new ErroApi(400, 'Informe o nome do celular (por exemplo, "Celular de Ana").')
    return transacao(this.db, () => {
      const l = this.obterDispositivo(id)
      if (!l) throw new ErroApi(404, 'Celular não encontrado.')
      this.db.prepare('UPDATE dispositivos SET nome = ? WHERE id = ?').run(novo, id)
      return { celular: this.celular(id), antes: l.nome }
    })
  }

  /** Revoga (o token deixa de valer para receber folhas; a entrega continua, salvo o motivo ROUBADO). A linha fica. */
  revogar(id: string, motivo: unknown, texto: unknown, por: string): CelularListado {
    if (!MOTIVOS_REVOGACAO.includes(motivo as MotivoRevogacao))
      throw new ErroApi(400, 'Escolha o motivo: perdido, roubado, troca de aparelho, desligamento ou engano.')
    return transacao(this.db, () => {
      const l = this.obterDispositivo(id)
      if (!l) throw new ErroApi(404, 'Celular não encontrado.')
      this.db
        .prepare(
          `UPDATE dispositivos SET revogado_em = CASE WHEN revogado_em = '' THEN ? ELSE revogado_em END, revogado_por = ?,
                  revogado_motivo = ?, revogado_texto = ? WHERE id = ?`,
        )
        .run(this.agora().toISOString(), por.slice(0, 120), motivo as string, textoDeUmaLinha(texto, 300), id)
      return this.celular(id)
    })
  }

  // ---- Envios (escritório) -------------------------------------------------------------------------------------

  envio(id: string): LinhaEnvio | undefined {
    return this.db.prepare('SELECT * FROM folhas_campo_envios WHERE id = ?').get(id) as LinhaEnvio | undefined
  }

  /** O envio vivo da folha (ENVIADA, NO_CELULAR ou DEVOLVIDA), se houver. */
  envioAtivo(numero: string): LinhaEnvio | undefined {
    return this.db.prepare(`SELECT * FROM folhas_campo_envios WHERE numero = ? AND situacao IN ${ATIVAS}`).get(numero) as
      LinhaEnvio | undefined
  }

  envioParaLista(l: LinhaEnvio): EnvioCampoListado {
    return envioParaLista(l, this.nomes())
  }

  /** A folha pode ir para o celular? Sem envio vivo e sem registro que não foi descartado (409, com a frase). */
  conferirEnviavel(numero: string): void {
    const ativo = this.envioAtivo(numero)
    if (ativo) {
      const nome = this.nomes().get(ativo.usuario_id) ?? 'o técnico'
      throw new ErroApi(
        409,
        ativo.situacao === 'DEVOLVIDA'
          ? `A folha ${numero} já voltou do campo. Para medir de novo, use uma folha nova.`
          : `A folha ${numero} já foi enviada para ${nome}. Recolha antes de enviar de novo.`,
        { codigo: 'ENVIO_ATIVO', numero, envioId: ativo.id },
      )
    }
    const registro = this.db
      .prepare("SELECT 1 FROM registros_campo WHERE (numero = ? OR ligado_a = ?) AND situacao <> 'DESCARTADO'")
      .get(numero, numero)
    if (registro)
      throw new ErroApi(409, `A folha ${numero} já voltou do campo com dados. Para medir de novo, use uma folha nova.`, {
        codigo: 'FOLHA_COM_REGISTRO',
        numero,
      })
  }

  /**
   * Cria o envio: confere que a folha pode ir (`conferirEnviavel`), monta o pacote com o id do envio (`montar`, que
   * recebe o id) e o congela (JSON canônico + sha256). Com a calibração, a versão dela sobe (o editor aberto antes do
   * envio recebe 409 CONFLITO na próxima gravação). Tudo numa transação.
   */
  criarEnvio(e: {
    numero: string
    usuarioId: string
    calibracaoId: string
    recado: string
    por: string
    montar: (envioId: string) => PacoteCampo
  }): { envio: LinhaEnvio; versao?: number } {
    return transacao(this.db, () => {
      this.conferirEnviavel(e.numero)
      const id = randomUUID()
      const pacote = e.montar(id)
      const texto = jsonCanonico(pacote)
      const resumo = resumoDoEnvio(pacote, 'ENVIADA')
      this.db
        .prepare(
          `INSERT INTO folhas_campo_envios (id, numero, usuario_id, situacao, pacote, pacote_sha256, contrato, piloto,
             calibracao_id, tipo, cliente, balanca, data_prevista, recado, enviado_em, enviado_por)
           VALUES (?, ?, ?, 'ENVIADA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          e.numero,
          e.usuarioId,
          texto,
          sha256(texto),
          pacote.versoes.contrato,
          pacote.folha.piloto ? 1 : 0,
          e.calibracaoId,
          resumo.tipo,
          resumo.cliente.slice(0, 200),
          resumo.balanca.slice(0, 200),
          resumo.dataPrevista,
          e.recado.slice(0, 500),
          pacote.folha.enviadaEm,
          e.por.slice(0, 120),
        )
      const versao = e.calibracaoId ? this.repo.incrementarVersao(e.calibracaoId) : undefined
      this.repo.avisar('calibracao')
      return { envio: this.envio(id)!, ...(versao !== undefined ? { versao } : {}) }
    })
  }

  /**
   * Recolher (escritório): na hora, se o celular ainda não baixou o pacote (ou com `forcar`, do administrador);
   * depois de baixado, vira pedido, que o celular responde no próximo olá. A folha que já voltou não é recolhida.
   */
  recolher(numero: string, e: { motivo: unknown; forcar: boolean; por: string }): { envio: LinhaEnvio; imediato: boolean } {
    const motivo = textoDeUmaLinha(e.motivo, 300)
    if (!motivo) throw new ErroApi(400, 'Informe o motivo de recolher a folha.')
    return transacao(this.db, () => {
      const ativo = this.envioAtivo(numero)
      if (!ativo) throw new ErroApi(404, `A folha ${numero} não está enviada para nenhum celular.`)
      if (ativo.situacao === 'DEVOLVIDA')
        throw new ErroApi(409, `A folha ${numero} já voltou do campo: não há o que recolher.`, { codigo: 'JA_DEVOLVIDA' })
      const agora = this.agora().toISOString()
      const imediato = e.forcar || (ativo.situacao === 'ENVIADA' && !ativo.baixado_em)
      if (imediato) {
        this.db
          .prepare(
            `UPDATE folhas_campo_envios SET situacao = 'RECOLHIDA', recolhido_em = ?, recolhido_por = ?, forcado = ?,
                    recolher_motivo = CASE WHEN recolher_motivo = '' THEN ? ELSE recolher_motivo END WHERE id = ?`,
          )
          .run(agora, e.por.slice(0, 120), e.forcar ? 1 : 0, motivo, ativo.id)
      } else if (!ativo.recolher_pedido_em) {
        this.db
          .prepare(
            `UPDATE folhas_campo_envios SET recolher_pedido_em = ?, recolher_pedido_por = ?, recolher_motivo = ? WHERE id = ?`,
          )
          .run(agora, e.por.slice(0, 120), motivo, ativo.id)
      }
      this.repo.avisar('calibracao')
      return { envio: this.envio(ativo.id)!, imediato }
    })
  }

  /**
   * O papel passou a ser a origem: emitir o certificado ou ligar outra folha de papel à calibração com a folha ainda
   * enviada ao celular (ENVIADA ou NO_CELULAR, sem pedido) cria o pedido de recolher, com o motivo (ou recolhe na hora,
   * se o celular ainda não baixou). A tela pergunta antes; aqui fica garantido. `numero`: a folha da calibração (também
   * o envio de uma avulsa ligada a ela); `exceto`: a folha que continua valendo (a que acabou de ser ligada). Se o
   * técnico já começou, a folha volta mesmo assim (marcada "depois de recolhida"). Sem envio vivo, nada.
   */
  recolherDaCalibracao(
    calibracaoId: string,
    e: { numero?: string; exceto?: string; motivo: string; por: string },
  ): Array<{ envio: LinhaEnvio; imediato: boolean }> {
    const numero = e.numero ?? ''
    const envios = this.db
      .prepare(
        `SELECT numero FROM folhas_campo_envios WHERE situacao IN ('ENVIADA', 'NO_CELULAR') AND recolher_pedido_em = ''
            AND (calibracao_id = ? OR (? <> '' AND numero = ?)) AND numero <> ? ORDER BY enviado_em, rowid`,
      )
      .all(calibracaoId, numero, numero, e.exceto ?? '') as Array<{ numero: string }>
    return envios.map((x) => this.recolher(x.numero, { motivo: e.motivo, forcar: false, por: e.por }))
  }

  /**
   * A trava (registro original = CELULAR): enquanto a folha da calibração está enviada ao celular (ENVIADA ou
   * NO_CELULAR, sem pedido de recolher), os passos de medição não mudam no computador (409 NO_CELULAR). No piloto
   * (PAPEL), nada trava.
   */
  conferirTrava(atual: Calibracao, entrada: unknown): void {
    if (this.piloto()) return
    // O editor aberto antes do envio (versão antiga) recebe antes o 409 CONFLITO da gravação, e recarrega
    const versao = ehObj(entrada) ? entrada.versao : undefined
    if (typeof versao === 'number' && versao !== atual.versao) return
    const numero = this.repo.folhaCampoDaCalibracao(atual.id)?.numero ?? ''
    const envio = this.db
      .prepare(
        `SELECT * FROM folhas_campo_envios WHERE situacao IN ('ENVIADA', 'NO_CELULAR') AND recolher_pedido_em = ''
            AND (calibracao_id = ? OR numero = ?) ORDER BY enviado_em DESC LIMIT 1`,
      )
      .get(atual.id, numero) as LinhaEnvio | undefined
    if (!envio) return
    const novo = normalizarCalibracao(entrada).valor as CalibracaoInput
    const antes = normalizarCalibracao(atual).valor as CalibracaoInput
    const mudou = CAMPOS_DE_MEDICAO.some((c) => JSON.stringify(novo[c] ?? null) !== JSON.stringify(antes[c] ?? null))
    if (!mudou) return
    const nome = this.nomes().get(envio.usuario_id)
    throw new ErroApi(
      409,
      `A folha ${envio.numero} está no ${nome ? `celular de ${nome}` : 'celular do técnico'}: as leituras ficam só para leitura aqui até ela voltar. Para digitar do papel, recolha a folha.`,
      { codigo: 'NO_CELULAR', numero: envio.numero, envioId: envio.id },
    )
  }

  // ---- O celular (rotas /api/campo) ---------------------------------------------------------------------------

  /** "Visto às 07:55 · 192.168.0.23": o último contato do celular (sem registro de atividades). */
  private contato(d: LinhaDispositivo, ip: string, versaoApp?: string) {
    this.db
      .prepare('UPDATE dispositivos SET ultimo_contato = ?, ultimo_ip = ?, versao_app = ? WHERE id = ?')
      .run(this.agora().toISOString(), ip.slice(0, 64), versaoApp && versaoAppValida(versaoApp) ? versaoApp : d.versao_app, d.id)
  }

  /** O envio é deste celular? (do técnico dele, ou já confirmado por ele) */
  private doCelular(e: LinhaEnvio | undefined, d: LinhaDispositivo): e is LinhaEnvio {
    return !!e && (e.usuario_id === d.usuario_id || e.dispositivo_id === d.id)
  }

  private resumoDaLinha(e: LinhaEnvio): ResumoEnvio {
    return {
      envioId: e.id,
      numero: e.numero,
      tipo: (TIPOS_FOLHA_CAMPO.includes(e.tipo as TipoFolhaCampo) ? e.tipo : 'calibracao') as TipoFolhaCampo,
      cliente: e.cliente,
      balanca: e.balanca,
      dataPrevista: e.data_prevista,
      situacao: e.situacao,
      piloto: !!e.piloto,
      enviadaEm: e.enviado_em,
    }
  }

  /** POST /api/campo/ola (ver o comentário de `RespostaOla`). */
  ola(d: LinhaDispositivo, pedido: PedidoOla, ip: string, apk: InfoApk): RespostaOla {
    return transacao(this.db, () => {
      this.contato(d, ip, pedido.versaoApp)
      const tecnico = this.usuario(d.usuario_id)
      const agora = this.agora().toISOString()
      let mudou = false
      const recolher = new Set<string>()
      const desconhecidos: string[] = []
      const gravarEstado = this.db.prepare(
        'UPDATE folhas_campo_envios SET estado_celular = ?, estado_celular_em = ? WHERE id = ?',
      )
      for (const est of pedido.estados as EstadoInformado[]) {
        const e = this.envio(est.envioId)
        if (!this.doCelular(e, d)) {
          desconhecidos.push(est.envioId)
          continue
        }
        if (e.situacao === 'RECOLHIDA') {
          recolher.add(e.id)
          continue
        }
        // O estado de uma folha já devolvida não muda mais (o celular ainda a informa até o recibo chegar)
        if (e.situacao !== 'DEVOLVIDA' && e.estado_celular !== est.estado) {
          gravarEstado.run(est.estado, agora, e.id)
          mudou = true
        }
      }
      const pedidos = this.db
        .prepare(
          `SELECT id FROM folhas_campo_envios WHERE usuario_id = ? AND situacao IN ('ENVIADA', 'NO_CELULAR')
              AND recolher_pedido_em <> '' AND (dispositivo_id = '' OR dispositivo_id = ?)`,
        )
        .all(d.usuario_id, d.id) as Array<{ id: string }>
      for (const p of pedidos) recolher.add(p.id)
      const motivoSemFolhas = !tecnico?.tecnico
        ? ('SEM_MARCA_TECNICO' as const)
        : pedido.contrato < CONTRATO_CAMPO_MINIMO
          ? ('CONTRATO_ANTIGO' as const)
          : undefined
      const envios = motivoSemFolhas
        ? []
        : (
            this.db
              .prepare(
                `SELECT * FROM folhas_campo_envios WHERE usuario_id = ? AND situacao IN ('ENVIADA', 'NO_CELULAR')
                    AND recolher_pedido_em = '' AND (dispositivo_id = '' OR dispositivo_id = ?) ORDER BY enviado_em, rowid`,
              )
              .all(d.usuario_id, d.id) as unknown as LinhaEnvio[]
          )
            .filter((e) => !recolher.has(e.id))
            .map((e) => this.resumoDaLinha(e))
      if (mudou) this.repo.avisar('calibracao')
      return {
        agora,
        tecnico: { id: d.usuario_id, nome: tecnico?.nome ?? '' },
        servidor: this.servidor,
        envios,
        recolher: [...recolher],
        desconhecidos,
        recebeFolhas: !motivoSemFolhas,
        ...(motivoSemFolhas ? { motivoSemFolhas } : {}),
        ...(apk.disponivel && versaoMaisNova(apk.versao, pedido.versaoApp)
          ? { appDisponivel: { versao: apk.versao, url: ROTAS_CAMPO.apk.caminho } }
          : {}),
      }
    })
  }

  /** GET /api/campo/envios/:envioId/pacote: o pacote congelado (o texto guardado). O 1º GET grava `baixado_em`. */
  pacote(d: LinhaDispositivo, envioId: string, ip: string): { texto: string; envio: LinhaEnvio } {
    return transacao(this.db, () => {
      this.contato(d, ip)
      const e = this.envio(envioId)
      if (!this.doCelular(e, d)) throw new ErroApi(404, MENSAGENS_ERRO_CAMPO.ENVIO_DESCONHECIDO, { codigo: 'ENVIO_DESCONHECIDO' })
      if (e.situacao === 'RECOLHIDA') throw new ErroApi(409, MENSAGENS_ERRO_CAMPO.ENVIO_RECOLHIDO, { codigo: 'ENVIO_RECOLHIDO' })
      if (e.dispositivo_id && e.dispositivo_id !== d.id)
        throw new ErroApi(409, MENSAGENS_ERRO_CAMPO.OUTRO_CELULAR, { codigo: 'OUTRO_CELULAR' })
      if (!e.baixado_em) {
        this.db.prepare('UPDATE folhas_campo_envios SET baixado_em = ? WHERE id = ?').run(this.agora().toISOString(), e.id)
        this.repo.avisar('calibracao')
      }
      return { texto: e.pacote, envio: e }
    })
  }

  /**
   * POST .../recebida: ENVIADA → NO_CELULAR (repetir é inofensivo). Com pedido de recolher em aberto (ou já recolhida):
   * RECOLHIDA (a folha em RECEBENDO nunca foi começada). `mudou`: a situação mudou agora (para o registro de atividades).
   */
  recebida(d: LinhaDispositivo, envioId: string, ip: string): RespostaRecebida & { envio: LinhaEnvio; mudou: boolean } {
    return transacao(this.db, () => {
      this.contato(d, ip)
      const e = this.envio(envioId)
      if (!this.doCelular(e, d)) throw new ErroApi(404, MENSAGENS_ERRO_CAMPO.ENVIO_DESCONHECIDO, { codigo: 'ENVIO_DESCONHECIDO' })
      if (e.situacao === 'RECOLHIDA') return { situacao: 'RECOLHIDA', envio: e, mudou: false }
      if (e.dispositivo_id && e.dispositivo_id !== d.id)
        throw new ErroApi(409, MENSAGENS_ERRO_CAMPO.OUTRO_CELULAR, { codigo: 'OUTRO_CELULAR' })
      const agora = this.agora().toISOString()
      if ((e.situacao === 'ENVIADA' || e.situacao === 'NO_CELULAR') && e.recolher_pedido_em) {
        this.db
          .prepare(
            `UPDATE folhas_campo_envios SET situacao = 'RECOLHIDA', recolhido_em = ?, recolhido_por = ?,
                    recolher_resposta = '', estado_celular = 'RETIRADA', estado_celular_em = ? WHERE id = ?`,
          )
          .run(agora, `celular: ${d.nome}`.slice(0, 120), agora, e.id)
        this.repo.avisar('calibracao')
        return { situacao: 'RECOLHIDA', envio: this.envio(e.id)!, mudou: true }
      }
      if (e.situacao === 'ENVIADA') {
        this.db
          .prepare(
            `UPDATE folhas_campo_envios SET situacao = 'NO_CELULAR', dispositivo_id = ?, recebido_em = ?,
                    baixado_em = CASE WHEN baixado_em = '' THEN ? ELSE baixado_em END, estado_celular = 'NOVA',
                    estado_celular_em = ? WHERE id = ?`,
          )
          .run(d.id, agora, agora, agora, e.id)
        this.repo.avisar('calibracao')
        return { situacao: 'NO_CELULAR', envio: this.envio(e.id)!, mudou: true }
      }
      return { situacao: e.situacao, envio: e, mudou: false }
    })
  }

  /**
   * POST .../recolhimento: a resposta do celular a um pedido de recolher. APAGUEI → RECOLHIDA; JA_COMECEI → fica como
   * está (o escritório é avisado) e a folha volta preenchida.
   */
  recolhimento(
    d: LinhaDispositivo,
    envioId: string,
    pedido: PedidoRecolhimento,
    ip: string,
  ): RespostaDoRecolhimento & { envio: LinhaEnvio; mudou: boolean } {
    return transacao(this.db, () => {
      this.contato(d, ip)
      const e = this.envio(envioId)
      if (!this.doCelular(e, d)) throw new ErroApi(404, MENSAGENS_ERRO_CAMPO.ENVIO_DESCONHECIDO, { codigo: 'ENVIO_DESCONHECIDO' })
      if (e.situacao !== 'ENVIADA' && e.situacao !== 'NO_CELULAR') return { situacao: e.situacao, envio: e, mudou: false }
      if (!e.recolher_pedido_em) return { situacao: e.situacao, envio: e, mudou: false }
      const agora = this.agora().toISOString()
      if (pedido.resposta === 'APAGUEI') {
        this.db
          .prepare(
            `UPDATE folhas_campo_envios SET situacao = 'RECOLHIDA', recolhido_em = ?, recolhido_por = ?,
                    estado_celular = 'RETIRADA', estado_celular_em = ? WHERE id = ?`,
          )
          .run(agora, `celular: ${d.nome}`.slice(0, 120), agora, e.id)
        this.repo.avisar('calibracao')
        return { situacao: 'RECOLHIDA', envio: this.envio(e.id)!, mudou: true }
      }
      if (e.recolher_resposta === 'JA_COMECEI') return { situacao: e.situacao, envio: e, mudou: false }
      this.db
        .prepare("UPDATE folhas_campo_envios SET recolher_resposta = 'JA_COMECEI', recolher_resposta_em = ? WHERE id = ?")
        .run(agora, e.id)
      this.repo.avisar('calibracao')
      return { situacao: e.situacao, envio: this.envio(e.id)!, mudou: true }
    })
  }

  /** O pacote guardado de um envio, lido (null sem envio ou com o texto ilegível). */
  private pacoteDoEnvio(e: LinhaEnvio | undefined): PacoteCampo | null {
    if (!e) return null
    const p = lerJson<unknown>(e.pacote, null)
    return ehObj(p) ? (p as unknown as PacoteCampo) : null
  }

  /**
   * PUT /api/campo/registros/:envioId: grava SEMPRE (ver o alto do arquivo) e devolve o recibo. `corpo`: o objeto JSON
   * recebido (a rota recusa o que não é objeto: 400 REGISTRO_ILEGIVEL). `agoraCelular`: o cabeçalho x-bc-agora. `novo`:
   * false = o mesmo registro já estava gravado (o mesmo recibo).
   */
  async receberRegistro(e: {
    dispositivo: DispositivoDaRequisicao
    envioId: string
    corpo: Record<string, unknown>
    ip: string
    agoraCelular: string
  }): Promise<{ recibo: ReciboCampo; novo: boolean; registro: LinhaRegistro; envio: LinhaEnvio | null }> {
    const registro = e.corpo as unknown as RegistroCampo
    let sha: string
    let conteudoSha: string
    let conteudo: string
    try {
      sha = calcularSha256Registro(registro, sha256)
      conteudoSha = calcularConteudoSha256(registro, sha256)
      conteudo = JSON.stringify(e.corpo)
    } catch {
      throw new ErroApi(400, MENSAGENS_ERRO_CAMPO.REGISTRO_ILEGIVEL, { codigo: 'REGISTRO_ILEGIVEL' })
    }
    // Já gravado: o mesmo recibo, sem conferir de novo
    const repetido = this.registroPorSha(sha)
    if (repetido)
      return { recibo: this.recibo(repetido), novo: false, registro: repetido, envio: this.envio(repetido.envio_id) ?? null }

    // A conferência (fora da transação: a das assinaturas é assíncrona)
    const envioAntes = this.envio(e.envioId)
    const pacote = this.pacoteDoEnvio(envioAntes)
    const problemas: ProblemaRegistro[] = [...validarRegistro(e.corpo, { pacote, momento: 'ENTREGA' })]
    try {
      problemas.push(...(await conferirAssinaturas(registro, sha256)))
    } catch {
      problemas.push({ campo: 'assinaturas', mensagem: 'Não foi possível conferir as assinaturas.' })
    }
    // O cabeçalho certo não basta: a imagem que não decodifica fica marcada (a folha impressa diz "ilegível"; nada é
    // recusado)
    const assinaturas = ehObj(e.corpo.assinaturas) ? e.corpo.assinaturas : {}
    for (const quem of ['tecnico', 'cliente'] as const) {
      const a = assinaturas[quem]
      const png = ehObj(a) ? a.png : undefined
      if (typeof png === 'string' && validarPng(png) === null && !pngDecodificavel(png))
        problemas.push({ campo: `assinaturas.${quem}.png`, mensagem: 'A imagem da assinatura está corrompida.' })
    }
    if (e.corpo.envioId !== e.envioId && !problemas.some((p) => p.campo === 'envioId'))
      problemas.push({ campo: 'envioId', mensagem: 'O registro diz ser de outro envio.' })
    const d = e.dispositivo.linha
    if (envioAntes && envioAntes.usuario_id !== d.usuario_id && envioAntes.dispositivo_id !== d.id)
      problemas.push({ campo: 'aparelho', mensagem: 'A folha foi entregue pelo celular de outro técnico.' })
    // O técnico que o registro diz é o que o celular declara: o escritório vê quando não é o do celular nem o da folha
    // (a importação também não o põe na calibração)
    const tecnicoId = ehObj(registro.tecnico) && typeof registro.tecnico.id === 'string' ? registro.tecnico.id : ''
    if (tecnicoId && tecnicoId !== d.usuario_id && tecnicoId !== envioAntes?.usuario_id)
      problemas.push({ campo: 'tecnico', mensagem: 'O técnico do registro não é o do celular nem o da folha.' })

    return transacao(this.db, () => {
      const outra = this.registroPorSha(sha)
      if (outra) return { recibo: this.recibo(outra), novo: false, registro: outra, envio: this.envio(outra.envio_id) ?? null }
      const agora = this.agora()
      const recebidoEm = agora.toISOString()
      const envio = this.envio(e.envioId) ?? null
      const diferenca = diferencaRelogioMs(e.agoraCelular, recebidoEm)
      const marcas = new Set<MarcaRegistro>()
      if (!envio) marcas.add('ORFAO')
      if (e.dispositivo.revogado) marcas.add('APARELHO_REVOGADO')
      if (envio?.situacao === 'RECOLHIDA') marcas.add('APOS_RECOLHER')
      if (problemas.length) marcas.add('FORMATO')
      if (relogioDiferente(e.agoraCelular, recebidoEm)) marcas.add('RELOGIO')
      if (registro.piloto === true || !!envio?.piloto || this.piloto()) marcas.add('PILOTO')

      const reaberturas = Array.isArray(registro.reaberturas) ? registro.reaberturas : []
      const anteriores = new Set(
        reaberturas.map((x) => (ehObj(x) && typeof x.sha256Anterior === 'string' ? x.sha256Anterior.toLowerCase() : '')),
      )
      anteriores.delete('')
      const revisao = reaberturas.length
      const ultimoAnterior = [...anteriores].at(-1) ?? ''
      const numero = envio?.numero ?? (typeof registro.numero === 'string' ? registro.numero.slice(0, 20) : '')
      const desfecho = DESFECHOS.includes(registro.desfecho as Desfecho) ? (registro.desfecho as Desfecho) : ''
      const inteiro = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : 0)

      // Revisões do mesmo envio: a mais nova vale; as anteriores (pela cadeia das reaberturas, ou pela revisão) ficam
      // SUPERADO. Uma revisão que chega atrasada, depois da mais nova, já entra SUPERADO. Na mesma revisão, o mesmo
      // conteúdo assinado com outro sha256 só difere nas correções depois da assinatura ("Corrigir…", só por acréscimo):
      // vale a que tem mais correções (no empate, a que chegou por último)
      const doMesmoEnvio = this.db
        .prepare("SELECT * FROM registros_campo WHERE envio_id = ? AND situacao = 'VALIDO'")
        .all(e.envioId) as unknown as LinhaRegistro[]
      const nCorrecoes = (r: { correcoesPosAssinatura?: unknown } | null | undefined) =>
        Array.isArray(r?.correcoesPosAssinatura) ? r.correcoesPosAssinatura.length : 0
      const correcoes = nCorrecoes(registro)
      const mesmaVersao = (r: LinhaRegistro) => r.revisao_local === revisao && r.conteudo_sha256 === conteudoSha
      const correcoesDe = (r: LinhaRegistro) => nCorrecoes(lerJson<RegistroCampo | null>(r.conteudo, null))
      const superadas = doMesmoEnvio.filter(
        (r) => anteriores.has(r.sha256) || r.revisao_local < revisao || (mesmaVersao(r) && correcoesDe(r) <= correcoes),
      )
      const corrigidaDepois = doMesmoEnvio.some((r) => mesmaVersao(r) && correcoesDe(r) > correcoes)
      const maisNova =
        corrigidaDepois ||
        doMesmoEnvio.some(
          (r) =>
            r.revisao_local > revisao ||
            lerJson<RegistroCampo | null>(r.conteudo, null)?.reaberturas?.some?.((x) => x?.sha256Anterior === sha),
        )
      const situacao: SituacaoRegistro = maisNova ? 'SUPERADO' : 'VALIDO'
      const id = randomUUID()
      this.db
        .prepare(
          `INSERT INTO registros_campo (id, envio_id, numero, usuario_id, dispositivo_id, formato, contrato, piloto, conteudo,
             sha256, conteudo_sha256, revisao_local, anterior_sha256, desfecho, recebido_em, ip, relogio_diferenca_s, situacao,
             marcas, problemas, situacao_motivo, situacao_por, situacao_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          e.envioId,
          numero,
          d.usuario_id,
          d.id,
          inteiro(registro.formato),
          inteiro(registro.contrato),
          marcas.has('PILOTO') ? 1 : 0,
          conteudo,
          sha,
          conteudoSha,
          revisao,
          ultimoAnterior,
          desfecho,
          recebidoEm,
          e.ip.slice(0, 64),
          diferenca === null ? null : Math.round(diferenca / 1000),
          situacao,
          JSON.stringify(naOrdem(marcas)),
          JSON.stringify(problemas.slice(0, 200)),
          corrigidaDepois
            ? 'Chegou depois de uma versão mais nova da mesma folha (corrigida no celular).'
            : maisNova
              ? 'Chegou depois de uma revisão mais nova da mesma folha.'
              : '',
          maisNova ? 'sistema' : '',
          maisNova ? recebidoEm : '',
        )
      const superar = this.db.prepare(
        `UPDATE registros_campo SET situacao = 'SUPERADO', situacao_motivo = ?, situacao_por = 'sistema', situacao_em = ?
          WHERE id = ? AND situacao = 'VALIDO'`,
      )
      if (situacao === 'VALIDO')
        for (const r of superadas)
          superar.run(
            mesmaVersao(r)
              ? 'Chegou uma versão mais nova da mesma folha (corrigida no celular).'
              : 'Chegou uma revisão mais nova da mesma folha (reaberta no celular).',
            recebidoEm,
            r.id,
          )
      // O envio vivo passa a DEVOLVIDA (um envio encerrado nunca volta a ser vivo)
      if (envio && (envio.situacao === 'ENVIADA' || envio.situacao === 'NO_CELULAR'))
        this.db
          .prepare(
            `UPDATE folhas_campo_envios SET situacao = 'DEVOLVIDA', devolvido_em = ?, devolvida_apos_recolher = ?,
                    dispositivo_id = CASE WHEN dispositivo_id = '' THEN ? ELSE dispositivo_id END,
                    estado_celular = 'ENTREGUE', estado_celular_em = ? WHERE id = ?`,
          )
          .run(recebidoEm, envio.recolher_pedido_em ? 1 : 0, d.id, recebidoEm, envio.id)
      this.repo.avisar('calibracao')
      const gravado = this.registroPorSha(sha)!
      return { recibo: this.recibo(gravado), novo: true, registro: gravado, envio: envio ? this.envio(envio.id)! : null }
    })
  }

  private registroPorSha(sha: string): LinhaRegistro | undefined {
    return this.db.prepare('SELECT * FROM registros_campo WHERE sha256 = ?').get(sha) as LinhaRegistro | undefined
  }

  /** O recibo de um registro gravado: o nº e o envio como o celular os mandou (o recibo confere com os dele). */
  private recibo(r: LinhaRegistro): ReciboCampo {
    const c = lerJson<Record<string, unknown>>(r.conteudo, {})
    return montarRecibo({
      numero: typeof c.numero === 'string' ? c.numero : r.numero,
      envioId: typeof c.envioId === 'string' ? c.envioId : r.envio_id,
      sha256: r.sha256,
      recebidoEm: r.recebido_em,
      situacao: r.situacao,
      marcas: marcasDe(r.marcas),
    })
  }

  // ---- Registros (escritório) --------------------------------------------------------------------------------

  private paraRegistro(l: LinhaRegistro, nomes: ReadonlyMap<string, string>): RegistroCampoListado {
    const celular = (
      this.db.prepare('SELECT nome FROM dispositivos WHERE id = ?').get(l.dispositivo_id) as { nome: string } | undefined
    )?.nome
    const importado = !!this.db.prepare('SELECT 1 FROM campo_importacoes WHERE registro_id = ?').get(l.id)
    return {
      id: l.id,
      envioId: l.envio_id,
      numero: l.numero,
      ligadoA: l.ligado_a,
      tecnicoId: l.usuario_id,
      tecnico: nomes.get(l.usuario_id) ?? '',
      dispositivoId: l.dispositivo_id,
      celular: celular ?? '',
      piloto: !!l.piloto,
      desfecho: l.desfecho,
      revisaoLocal: Number(l.revisao_local) || 0,
      recebidoEm: l.recebido_em,
      relogioDiferencaS: l.relogio_diferenca_s === null ? null : Number(l.relogio_diferenca_s),
      situacao: l.situacao,
      marcas: marcasDe(l.marcas),
      problemas: lerJson<ProblemaRegistro[]>(l.problemas, []),
      situacaoMotivo: l.situacao_motivo,
      situacaoPor: l.situacao_por,
      situacaoEm: l.situacao_em,
      importado,
    }
  }

  private linhaRegistro(id: string): LinhaRegistro {
    const l = this.db.prepare('SELECT * FROM registros_campo WHERE id = ?').get(id) as LinhaRegistro | undefined
    if (!l) throw new ErroApi(404, 'Registro de campo não encontrado.')
    return l
  }

  /**
   * Os registros, do mais novo para o mais antigo. `numero`: da folha (também os órfãos ligados a ela); `situacao`;
   * `orfaos`: só os de envio desconhecido; `limite` até 500.
   */
  listarRegistros(f: { numero?: string; situacao?: string; orfaos?: boolean; limite?: number } = {}): RegistroCampoListado[] {
    const condicoes: string[] = []
    const params: string[] = []
    if (f.numero) {
      condicoes.push('(numero = ? OR ligado_a = ?)')
      params.push(f.numero, f.numero)
    }
    if (f.situacao && ['VALIDO', 'SUPERADO', 'DESCARTADO'].includes(f.situacao)) {
      condicoes.push('situacao = ?')
      params.push(f.situacao)
    }
    if (f.orfaos) condicoes.push(`marcas LIKE '%"ORFAO"%'`)
    const limite = Math.min(Math.max(Math.trunc(f.limite ?? 200) || 200, 1), 500)
    const linhas = this.db
      .prepare(
        `SELECT * FROM registros_campo ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
          ORDER BY recebido_em DESC, rowid DESC LIMIT ?`,
      )
      .all(...params, limite) as unknown as LinhaRegistro[]
    const nomes = this.nomes()
    return linhas.map((l) => this.paraRegistro(l, nomes))
  }

  /**
   * O registro (o conteúdo como chegou), o pacote do envio e os metadados, para a tela e para "Puxar"/"Comparar". Toda
   * leitura confere o sha256: um registro alterado fora do sistema é recusado (409 REGISTRO_ALTERADO).
   */
  registroComPacote(id: string): {
    linha: LinhaRegistro
    registro: RegistroCampo
    pacote: PacoteCampo | null
    envio: LinhaEnvio | null
  } {
    const linha = this.linhaRegistro(id)
    const registro = lerJson<RegistroCampo | null>(linha.conteudo, null)
    let confere = false
    try {
      confere = !!registro && calcularSha256Registro(registro, sha256) === linha.sha256
    } catch {
      confere = false
    }
    if (!confere)
      throw new ErroApi(409, 'O registro de campo foi alterado fora do sistema. Use a cópia de segurança.', {
        codigo: 'REGISTRO_ALTERADO',
      })
    const envio = this.envio(linha.envio_id) ?? null
    return { linha, registro: registro!, pacote: this.pacoteDoEnvio(envio ?? undefined), envio }
  }

  obterRegistro(id: string): RegistroCampoDetalhe {
    const { linha, registro, pacote, envio } = this.registroComPacote(id)
    const nomes = this.nomes()
    return {
      registro: this.paraRegistro(linha, nomes),
      conteudo: registro,
      pacote,
      envio: envio ? envioParaLista(envio, nomes) : null,
      importacoes: this.importacoes({ registroId: id }),
    }
  }

  /** Descartar (com motivo; o registro nunca é apagado). */
  descartarRegistro(id: string, motivo: unknown, por: string): RegistroCampoListado {
    const texto = textoDeUmaLinha(motivo, 300)
    if (!texto) throw new ErroApi(400, 'Informe o motivo de descartar o registro.')
    return transacao(this.db, () => {
      const l = this.linhaRegistro(id)
      if (l.situacao === 'DESCARTADO') throw new ErroApi(409, 'Este registro já foi descartado.')
      this.db
        .prepare(
          "UPDATE registros_campo SET situacao = 'DESCARTADO', situacao_motivo = ?, situacao_por = ?, situacao_em = ? WHERE id = ?",
        )
        .run(texto, por.slice(0, 120), this.agora().toISOString(), id)
      this.repo.avisar('calibracao')
      return this.paraRegistro(this.linhaRegistro(id), this.nomes())
    })
  }

  /** Ligar um órfão (envio desconhecido) a uma folha impressa. */
  ligarRegistro(id: string, numero: string, motivo: unknown, por: string): RegistroCampoListado {
    return transacao(this.db, () => {
      const l = this.linhaRegistro(id)
      if (!marcasDe(l.marcas).includes('ORFAO'))
        throw new ErroApi(409, 'Só um registro órfão (sem envio) pode ser ligado a uma folha.')
      if (l.situacao === 'DESCARTADO') throw new ErroApi(409, 'Este registro foi descartado.')
      if (!this.db.prepare('SELECT 1 FROM folhas_campo WHERE numero = ?').get(numero))
        throw new ErroApi(404, `A folha ${numero} não existe.`)
      this.db
        .prepare('UPDATE registros_campo SET ligado_a = ?, situacao_motivo = ?, situacao_por = ?, situacao_em = ? WHERE id = ?')
        .run(
          numero,
          textoDeUmaLinha(motivo, 300) || `ligado à folha ${numero}`,
          por.slice(0, 120),
          this.agora().toISOString(),
          id,
        )
      this.repo.avisar('calibracao')
      return this.paraRegistro(this.linhaRegistro(id), this.nomes())
    })
  }

  /** Os envios e os registros de uma folha (metadados). */
  campoDaFolha(numero: string): CampoDaFolha {
    const nomes = this.nomes()
    const envios = (
      this.db
        .prepare('SELECT * FROM folhas_campo_envios WHERE numero = ? ORDER BY enviado_em DESC, rowid DESC')
        .all(numero) as unknown as LinhaEnvio[]
    ).map((l) => envioParaLista(l, nomes))
    const congelada = this.db.prepare("SELECT 1 FROM folhas_campo WHERE numero = ? AND dados_sha256 <> ''").get(numero)
    return { numero, envios, registros: this.listarRegistros({ numero }), dadosCongelados: !!congelada }
  }

  // ---- Importações (Puxar / Comparar: a gravação fica com quem implementa a importação) -------------------------

  /** Grava uma importação (dentro da transação de quem chama, se houver). */
  registrarImportacao(e: {
    registroId: string
    calibracaoId: string
    tipo: 'PUXAR' | 'COMPARACAO'
    versaoAntes: number
    versaoDepois: number
    por: string
    resumo: unknown
    observacao?: string
  }): ImportacaoCampo {
    return transacao(this.db, () => {
      this.linhaRegistro(e.registroId)
      const id = randomUUID()
      this.db
        .prepare(
          `INSERT INTO campo_importacoes (id, registro_id, calibracao_id, tipo, versao_antes, versao_depois, feito_em, feito_por,
             resumo, observacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          e.registroId,
          e.calibracaoId,
          e.tipo,
          e.versaoAntes,
          e.versaoDepois,
          this.agora().toISOString(),
          e.por.slice(0, 120),
          JSON.stringify(e.resumo ?? {}),
          (e.observacao ?? '').slice(0, 2000),
        )
      this.repo.avisar('calibracao')
      return this.importacoes({ registroId: e.registroId }).find((i) => i.id === id)!
    })
  }

  importacoes(f: { registroId?: string; calibracaoId?: string }): ImportacaoCampo[] {
    const [col, valor] = f.registroId ? ['registro_id', f.registroId] : ['calibracao_id', f.calibracaoId ?? '']
    return (
      this.db
        .prepare(`SELECT * FROM campo_importacoes WHERE ${col} = ? ORDER BY feito_em, rowid`)
        .all(valor) as unknown as LinhaImportacao[]
    ).map((l) => ({
      id: l.id,
      registroId: l.registro_id,
      calibracaoId: l.calibracao_id,
      tipo: l.tipo,
      versaoAntes: Number(l.versao_antes),
      versaoDepois: Number(l.versao_depois),
      feitoEm: l.feito_em,
      feitoPor: l.feito_por,
      resumo: lerJson<unknown>(l.resumo, {}),
      observacao: l.observacao,
    }))
  }

  // ---- Listas e Painel -----------------------------------------------------------------------------------------

  painel(hoje: string): ResumoCampoPainel {
    return resumoCampoPainel(this.db, hoje, this.nomes())
  }

  /**
   * "Apagar os testes" recusa rodar enquanto houver folha baixada por um celular (ENVIADA já baixada, ou NO_CELULAR):
   * os nºs dessas folhas.
   */
  folhasBaixadas(): string[] {
    return (
      this.db
        .prepare(
          "SELECT numero FROM folhas_campo_envios WHERE situacao = 'NO_CELULAR' OR (situacao = 'ENVIADA' AND baixado_em <> '') ORDER BY numero",
        )
        .all() as Array<{ numero: string }>
    ).map((l) => l.numero)
  }
}

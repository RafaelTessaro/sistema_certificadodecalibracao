// Usuários, sessões e registro de atividades (auditoria). Fica fora do Repositorio: não mexe na
// revisão, não vai para /api/dados nem para o tempo real e não entra no backup JSON.
//
// Sem nada do Fastify: a ferramenta local (server/ferramentas/redefinir-senha.mjs) usa esta mesma
// classe direto no banco, com o servidor ligado ou não.

import {
  BLOQUEIO_TROCA_SENHA,
  GRUPOS_AUDITORIA,
  LOGIN_MAX,
  normalizarAlteracaoUsuario,
  normalizarLogin,
  normalizarNovoUsuario,
  USUARIOS_MAX,
  validarLogin,
  validarSenhaNova,
} from '#shared/usuarios.ts'
import { novoId } from '#shared/id.ts'
import { NOME_NIVEL } from '#shared/permissoes.ts'
import type {
  AcaoAuditoria,
  GrupoAuditoria,
  NivelUsuario,
  RegistroAuditoria,
  ResultadoSenha,
  Usuario,
  UsuarioSessao,
} from '#shared/tipos.ts'
import { type Banco, transacao } from './db.ts'
import { ErroApi } from './erros.ts'
import { type ChavesTentativa, LimiteTentativas, REGRAS_TENTATIVAS } from './limiteTentativas.ts'
import { impressaPara } from './repositorio.ts'
import {
  conferirSenha,
  gerarHashSenha,
  gerarSenhaTemporaria,
  gerarToken,
  hashToken,
  PARAMETROS_SENHA,
  type ParametrosSenha,
  precisaRefazerHash,
} from './senha.ts'

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

/** Prazos da sessão: sem uso (inatividade) e no total (contado do login). */
export const PRAZOS_SESSAO = {
  normal: { inatividadeMs: 4 * HORA, maximoMs: 12 * HORA },
  manterConectado: { inatividadeMs: 7 * DIA, maximoMs: 30 * DIA },
  manterConectadoAdmin: { inatividadeMs: 7 * DIA, maximoMs: 7 * DIA },
  /** A última atividade é gravada no máximo a cada 5 minutos. */
  gravarUsoACadaMs: 5 * MINUTO,
}

/** Registros do registro de atividades mais antigos que isso são apagados (limpeza diária). */
export const RETENCAO_AUDITORIA_DIAS = 365

/** Tetos dos textos gravados na auditoria (em unidades UTF-16: o do login cabe qualquer login válido). */
const TETOS_AUDITORIA = { login: 2 * LOGIN_MAX, ip: 64, alvo: 100, detalhe: 300 }

/** Endereço do próprio computador (127.0.0.0/8 ou ::1). */
export function ehLoopback(ip: string): boolean {
  const v = String(ip ?? '').replace(/^::ffff:/i, '')
  return v === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)
}

interface LinhaUsuario {
  id: string
  login: string
  nome: string
  nivel: NivelUsuario
  senha_hash: string
  ativo: number
  trocar_senha: number
  versao: number
  criado_em: string
  atualizado_em: string
  senha_alterada_em: string
  ultimo_acesso_em: string
  ultimo_acesso_ip: string
  signatario: number
  cargo: string
  registro: string
  assinatura: string
}

interface LinhaAuditoria {
  id: number
  em: string
  usuario_id: string
  login: string
  ip: string
  acao: AcaoAuditoria
  alvo: string
  detalhe: string
}

type Bruto = Record<string, unknown>
const obj = (v: unknown): Bruto => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Bruto) : {})
const corta = (v: unknown, max: number) => String(v ?? '').slice(0, max)

const paraSessao = (l: LinhaUsuario): UsuarioSessao => ({
  id: l.id,
  login: l.login,
  nome: l.nome,
  nivel: l.nivel,
  trocarSenha: !!l.trocar_senha,
  signatario: !!l.signatario,
})

const paraUsuario = (l: LinhaUsuario, sessoesAtivas: number): Usuario => ({
  id: l.id,
  versao: l.versao,
  login: l.login,
  nome: l.nome,
  nivel: l.nivel,
  ativo: !!l.ativo,
  trocarSenha: !!l.trocar_senha,
  criadoEm: l.criado_em,
  atualizadoEm: l.atualizado_em,
  senhaAlteradaEm: l.senha_alterada_em,
  ultimoAcessoEm: l.ultimo_acesso_em,
  ultimoAcessoIp: l.ultimo_acesso_ip,
  signatario: !!l.signatario,
  cargo: l.cargo,
  registro: l.registro,
  assinatura: l.assinatura,
  sessoesAtivas,
})

/** Administradores primeiro; depois por nome (ordem do português). */
const ordemUsuarios = (a: Pick<Usuario, 'nivel' | 'nome'>, b: Pick<Usuario, 'nivel' | 'nome'>) =>
  (a.nivel === 'ADMIN' ? 0 : 1) - (b.nivel === 'ADMIN' ? 0 : 1) || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })

const MENSAGENS = {
  credenciais: 'Usuário ou senha incorretos.',
  desativado: 'Usuário desativado. Fale com o administrador.',
  ultimoAdmin: 'Não dá para tirar o último administrador. Cadastre ou promova outro antes.',
  propriaConta: 'Você não pode desativar, excluir ou mudar o nível da própria conta. Peça a outro administrador.',
  conflito: 'Outra pessoa alterou este usuário. Feche e abra de novo.',
  loginExistente: 'Já existe um usuário com este login.',
  limite: `O limite é de ${USUARIOS_MAX} usuários.`,
  semSessao: 'Sua sessão terminou. Entre de novo para continuar.',
}

const naoEncontrado = () => new ErroApi(404, 'Usuário não encontrado.')

/**
 * 429 com a espera em minutos (o `Retry-After` sai do `esperarSegundos`). `porComputador`: o bloqueio é
 * do computador (muitas falhas, com qualquer usuário), que não acaba com a senha redefinida; vai
 * `motivo: 'computador'` para a tela dizer isso.
 */
export function erroMuitasTentativas(segundos: number, porComputador = false) {
  const minutos = Math.max(1, Math.ceil(segundos / 60))
  const prazo = `${minutos} minuto${minutos > 1 ? 's' : ''}`
  return porComputador
    ? new ErroApi(429, `Muitas tentativas erradas neste computador. Tente de novo em ${prazo} ou entre por outro computador.`, {
        codigo: 'MUITAS_TENTATIVAS',
        esperarSegundos: segundos,
        motivo: 'computador',
      })
    : new ErroApi(429, `Muitas tentativas. Tente de novo em ${prazo}.`, {
        codigo: 'MUITAS_TENTATIVAS',
        esperarSegundos: segundos,
      })
}

/** Resultado de validação com erros: 400 com a primeira mensagem e a lista. */
function validar<T>(r: { valor: T; erros: string[] }): T {
  if (r.erros.length) throw new ErroApi(400, r.erros[0], { erros: r.erros })
  return r.valor
}

function erroSenha(mensagem: string | null) {
  if (mensagem) throw new ErroApi(400, mensagem, { erros: [mensagem] })
}

/** Login duplicado detectado pelo índice único (corrida entre dois cadastros, ou a ferramenta local). */
const ehLoginDuplicado = (e: unknown) => /UNIQUE constraint failed: usuarios\.login/.test(String((e as Error)?.message ?? ''))

const DESCRICAO_BLOQUEIO = {
  par: `${(REGRAS_TENTATIVAS.par as { livres: number }).livres} falhas seguidas do mesmo usuário neste computador`,
  ip: `${(REGRAS_TENTATIVAS.ip as { falhas: number }).falhas} falhas deste computador em 15 minutos`,
  login: `${(REGRAS_TENTATIVAS.login as { falhas: number }).falhas} falhas deste usuário em 1 hora`,
  senha: BLOQUEIO_TROCA_SENHA,
}

interface DadosRegistro {
  usuario?: Pick<UsuarioSessao, 'id' | 'login'> | null
  ip?: string
  alvo?: string
  detalhe?: string
}

/** Grava uma linha do registro de atividades (nunca valores do corpo, senha nem token). */
function gravarAuditoria(db: Banco, em: number, acao: AcaoAuditoria, d: DadosRegistro) {
  db.prepare('INSERT INTO auditoria (em, usuario_id, login, ip, acao, alvo, detalhe) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    new Date(em).toISOString(),
    corta(d.usuario?.id, TETOS_AUDITORIA.alvo),
    corta(d.usuario?.login, TETOS_AUDITORIA.login),
    corta(d.ip, TETOS_AUDITORIA.ip),
    acao,
    corta(d.alvo, TETOS_AUDITORIA.alvo),
    corta(d.detalhe, TETOS_AUDITORIA.detalhe),
  )
}

export interface OpcoesServicoUsuarios {
  /** Relógio (epoch ms); os testes trocam. */
  agora?: () => number
  /** Parâmetros do scrypt para senhas novas (os testes usam os leves). */
  parametrosSenha?: ParametrosSenha
  /** Avisos para o registro do servidor (ex.: início de um bloqueio por tentativas). */
  avisar?: (mensagem: string) => void
}

export interface SessaoValidada {
  sessaoId: string
  usuario: UsuarioSessao
  /** Aberta com "Manter conectado neste computador". */
  persistente: boolean
}

export interface ResultadoEntrada {
  /** Vai só no cookie; nunca para log nem auditoria. */
  token: string
  sessaoId: string
  /** "Manter conectado": validade do cookie; `null` = cookie de sessão do navegador. */
  maxAgeSegundos: number | null
  usuario: UsuarioSessao
  /** Sessões apagadas (a anterior deste navegador): fechar o tempo real delas. */
  sessoesEncerradas: string[]
}

export interface EntradaFerramentaLocal {
  login: string
  nome?: string
  /** Vazia: gera uma temporária (troca obrigatória no primeiro acesso). */
  senha?: string
  tornarAdmin?: boolean
  /** Só vale com senha digitada: pedir a troca no próximo acesso. */
  trocarSenha?: boolean
}

export class ServicoUsuarios {
  /** Relógio (epoch ms). Público: os testes trocam. */
  agora: () => number
  /** Tentativas de entrada (em memória; a varredura chama `limite.limpar()`). */
  readonly limite: LimiteTentativas
  private db: Banco
  private params: ParametrosSenha
  private avisar: (mensagem: string) => void
  /** Hash de uma senha aleatória: login inexistente leva o mesmo tempo que senha errada. */
  private hashFalso: Promise<string> | null = null

  constructor(db: Banco, opcoes: OpcoesServicoUsuarios = {}) {
    this.db = db
    this.agora = opcoes.agora ?? Date.now
    this.params = opcoes.parametrosSenha ?? PARAMETROS_SENHA
    this.avisar = opcoes.avisar ?? (() => {})
    this.limite = new LimiteTentativas(() => this.agora())
  }

  // ---- Consultas ---------------------------------------------------------------

  quantos(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n
  }

  administradoresAtivos(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE nivel = 'ADMIN' AND ativo = 1").get() as { n: number }).n
  }

  listar(): Usuario[] {
    const [cond, params] = this.sessaoVigente()
    const linhas = this.db
      .prepare(
        `SELECT u.*, CASE WHEN u.ativo = 1 THEN (SELECT COUNT(*) FROM sessoes s WHERE s.usuario_id = u.id AND ${cond}) ELSE 0 END AS sessoes_ativas
         FROM usuarios u`,
      )
      .all(...params) as unknown as Array<LinhaUsuario & { sessoes_ativas: number }>
    return linhas.map((l) => paraUsuario(l, l.sessoes_ativas)).sort(ordemUsuarios)
  }

  obter(id: string): Usuario | undefined {
    const l = this.linhaPorId(id)
    return l && paraUsuario(l, this.contarSessoes(l))
  }

  // ---- Sessões -----------------------------------------------------------------

  /**
   * Sessão do cookie, se vigente (conta ativa, dentro do prazo total e do prazo sem uso).
   * `contarAtividade`: grava o uso (no máximo a cada 5 min), o último acesso e o IP.
   */
  validarSessao(token: string | undefined, contarAtividade: boolean, ip: string): SessaoValidada | null {
    if (!token || token.length > 200) return null
    const sessaoId = hashToken(token)
    const agora = this.agora()
    const [cond, params] = this.sessaoVigente(agora)
    const l = this.db
      .prepare(
        `SELECT u.*, s.usada_em AS sessao_usada_em, s.persistente AS sessao_persistente
         FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.id = ? AND u.ativo = 1 AND ${cond}`,
      )
      .get(sessaoId, ...params) as (LinhaUsuario & { sessao_usada_em: number; sessao_persistente: number }) | undefined
    if (!l) return null
    if (contarAtividade && agora - l.sessao_usada_em >= PRAZOS_SESSAO.gravarUsoACadaMs) {
      transacao(this.db, () => {
        this.db.prepare('UPDATE sessoes SET usada_em = ? WHERE id = ?').run(agora, sessaoId)
        this.db
          .prepare('UPDATE usuarios SET ultimo_acesso_em = ?, ultimo_acesso_ip = ? WHERE id = ?')
          .run(new Date(agora).toISOString(), corta(ip, TETOS_AUDITORIA.ip), l.id)
      })
    }
    return { sessaoId, usuario: paraSessao(l), persistente: !!l.sessao_persistente }
  }

  /** Mesmo critério de `validarSessao`, pelo id (hash) da sessão. */
  sessaoValida(sessaoId: string): boolean {
    const [cond, params] = this.sessaoVigente()
    return !!this.db
      .prepare(`SELECT 1 FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ? AND u.ativo = 1 AND ${cond}`)
      .get(sessaoId, ...params)
  }

  /**
   * Login. Ordem: limite de tentativas (429, sem rodar o scrypt) → senha (401, igual para usuário
   * inexistente) → conta desativada (403, só depois de a senha conferir) → sessão nova.
   * `sessaoAnterior`: id (hash) da sessão do cookie deste navegador, que é substituída.
   */
  async entrar(e: unknown, ip: string, sessaoAnterior?: string | null): Promise<ResultadoEntrada> {
    const r = obj(e)
    const login = normalizarLogin(r.login)
    const senha = typeof r.senha === 'string' ? r.senha : ''
    if (!login || !senha) throw new ErroApi(400, 'Informe o usuário e a senha.')
    const manterConectado = r.manterConectado === true
    // Mesma normalização do cadastro: "Rafael  TESSARO" entra como "rafael tessaro". Login maior que o
    // máximo nunca existe: nem consulta o banco e, na chave do limite, vai só o começo
    const cabe = [...login].length <= LOGIN_MAX
    const chaves: ChavesTentativa = { login: cabe ? login : login.slice(0, 2 * LOGIN_MAX), ip, loopback: ehLoopback(ip) }

    const linha = cabe ? this.linhaPorLogin(login) : undefined
    const bloqueio = this.limite.bloqueio(chaves, linha ? Date.parse(linha.senha_alterada_em) : undefined)
    if (bloqueio) throw erroMuitasTentativas(bloqueio.segundos, bloqueio.tipo === 'ip')

    const confere = await conferirSenha(senha, linha ? linha.senha_hash : await this.obterHashFalso())
    // A conta pode ter mudado enquanto o scrypt rodava (senha redefinida, conta excluída)
    const atual = linha && this.linhaPorId(linha.id)
    if (!linha || !confere || !atual || atual.senha_hash !== linha.senha_hash) {
      const quem = linha ? { id: linha.id, login: linha.login } : null
      const { bloqueouAgora, motivos } = this.limite.falhou(chaves)
      this.registrar('LOGIN_FALHOU', { usuario: quem, ip })
      if (bloqueouAgora) {
        this.registrar('BLOQUEIO', { usuario: quem, ip, detalhe: motivos.map((m) => DESCRICAO_BLOQUEIO[m]).join('; ') })
        // O texto digitado nunca vai para o registro: pode ser uma senha digitada no campo errado
        this.avisar(`Entrada bloqueada por muitas tentativas: ${quem ? quem.login : '(login inexistente)'} a partir de ${ip}.`)
      }
      throw new ErroApi(401, MENSAGENS.credenciais, { codigo: 'CREDENCIAIS_INVALIDAS' })
    }
    if (!atual.ativo) {
      this.registrar('LOGIN_FALHOU', { usuario: atual, ip, detalhe: 'usuário desativado' })
      throw new ErroApi(403, MENSAGENS.desativado, { codigo: 'DESATIVADO' })
    }
    this.limite.acertou(chaves)

    const novoHash = precisaRefazerHash(atual.senha_hash, this.params) ? await gerarHashSenha(senha, this.params) : null
    const prazos = !manterConectado
      ? PRAZOS_SESSAO.normal
      : atual.nivel === 'ADMIN'
        ? PRAZOS_SESSAO.manterConectadoAdmin
        : PRAZOS_SESSAO.manterConectado
    const token = gerarToken()
    const sessaoId = hashToken(token)
    const agora = this.agora()
    const sessoesEncerradas = transacao(this.db, () => {
      const encerradas: string[] = []
      if (sessaoAnterior && sessaoAnterior !== sessaoId) {
        this.db.prepare('DELETE FROM sessoes WHERE id = ?').run(sessaoAnterior)
        encerradas.push(sessaoAnterior)
      }
      this.db
        .prepare(
          'INSERT INTO sessoes (id, usuario_id, criada_em, usada_em, expira_em, persistente, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(sessaoId, atual.id, agora, agora, agora + prazos.maximoMs, manterConectado ? 1 : 0, corta(ip, TETOS_AUDITORIA.ip))
      this.db
        .prepare('UPDATE usuarios SET ultimo_acesso_em = ?, ultimo_acesso_ip = ? WHERE id = ?')
        .run(new Date(agora).toISOString(), corta(ip, TETOS_AUDITORIA.ip), atual.id)
      // Parâmetros do hash mudaram (ex.: endurecidos numa versão nova): regrava com os atuais
      if (novoHash)
        this.db
          .prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ? AND senha_hash = ?')
          .run(novoHash, atual.id, atual.senha_hash)
      this.registrar('LOGIN', { usuario: atual, ip, detalhe: manterConectado ? 'manter conectado' : '' })
      return encerradas
    })
    return {
      token,
      sessaoId,
      maxAgeSegundos: manterConectado ? prazos.maximoMs / 1000 : null,
      usuario: paraSessao(atual),
      sessoesEncerradas,
    }
  }

  /** Sair: apaga a sessão (idempotente). */
  sair(sessaoId: string, ip: string): void {
    const dono = this.db
      .prepare('SELECT u.id, u.login FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ?')
      .get(sessaoId) as Pick<UsuarioSessao, 'id' | 'login'> | undefined
    transacao(this.db, () => {
      this.db.prepare('DELETE FROM sessoes WHERE id = ?').run(sessaoId)
      if (dono) this.registrar('LOGOUT', { usuario: dono, ip })
    })
  }

  /** Apaga as sessões vencidas (prazo, inatividade ou conta desativada) e devolve os ids. */
  limparVencidas(): string[] {
    const [cond, params] = this.sessaoVigente()
    return transacao(this.db, () => {
      const ids = (
        this.db
          .prepare(`SELECT s.id FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE NOT (u.ativo = 1 AND ${cond})`)
          .all(...params) as Array<{ id: string }>
      ).map((l) => l.id)
      const apagar = this.db.prepare('DELETE FROM sessoes WHERE id = ?')
      for (const id of ids) apagar.run(id)
      return ids
    })
  }

  // ---- Administração (rotas /api/usuarios) --------------------------------------

  /** Cadastra um usuário. Sempre com troca de senha no primeiro acesso. */
  async criar(e: unknown, autor: UsuarioSessao, ip: string): Promise<ResultadoSenha> {
    const dados = validar(normalizarNovoUsuario(e))
    this.verificarCadastro(dados.login)
    const senhaTemporaria = dados.senha ? undefined : gerarSenhaTemporaria()
    const hash = await gerarHashSenha(dados.senha || senhaTemporaria!, this.params)
    const id = novoId()
    try {
      transacao(this.db, () => {
        // De novo dentro da transação: outro cadastro pode ter terminado enquanto o hash era calculado
        this.verificarCadastro(dados.login)
        const em = new Date(this.agora()).toISOString()
        this.db
          .prepare(
            `INSERT INTO usuarios (id, login, nome, nivel, senha_hash, ativo, trocar_senha, versao, criado_em, atualizado_em,
                                   senha_alterada_em, signatario, cargo, registro)
             VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, dados.login, dados.nome, dados.nivel, hash, em, em, em, dados.signatario ? 1 : 0, dados.cargo, dados.registro)
        this.registrar('USUARIO_CRIADO', {
          usuario: autor,
          ip,
          alvo: id,
          detalhe: `${dados.login} (${NOME_NIVEL[dados.nivel]}); senha ${senhaTemporaria ? 'gerada pelo sistema' : 'digitada pelo administrador'}`,
        })
      })
    } catch (erro) {
      if (ehLoginDuplicado(erro)) throw new ErroApi(409, MENSAGENS.loginExistente, { codigo: 'LOGIN_EXISTENTE' })
      throw erro
    }
    return { usuario: this.obter(id)!, ...(senhaTemporaria ? { senhaTemporaria } : {}) }
  }

  /**
   * Nome, login, nível e situação. Mudar o nível ou desativar encerra as sessões da pessoa; trocar o login,
   * não (a sessão é ligada à conta, e a pessoa só passa a entrar com o login novo).
   */
  alterar(id: string, e: unknown, autor: UsuarioSessao, ip: string): { usuario: Usuario; sessoesEncerradas: string[] } {
    const dados = validar(normalizarAlteracaoUsuario(e))
    const sessoesEncerradas = transacao(this.db, () => {
      const atual = this.linhaPorId(id)
      if (!atual) throw naoEncontrado()
      if (dados.versao !== undefined && dados.versao !== atual.versao)
        throw new ErroApi(409, MENSAGENS.conflito, { codigo: 'CONFLITO' })
      const nome = dados.nome ?? atual.nome
      const login = dados.login ?? atual.login
      const nivel = dados.nivel ?? atual.nivel
      const ativo = dados.ativo ?? !!atual.ativo
      const mudouNivel = nivel !== atual.nivel
      const mudouAtivo = ativo !== !!atual.ativo
      const mudouNome = nome !== atual.nome
      const mudouLogin = login !== atual.login
      const signatario = dados.signatario ?? !!atual.signatario
      const cargo = dados.cargo ?? atual.cargo
      const registro = dados.registro ?? atual.registro
      const assinatura = dados.assinatura ?? atual.assinatura
      const mudouSignatario = signatario !== !!atual.signatario
      const mudouDadosAssinatura = cargo !== atual.cargo || registro !== atual.registro || assinatura !== atual.assinatura
      if (!mudouNivel && !mudouAtivo && !mudouNome && !mudouLogin && !mudouSignatario && !mudouDadosAssinatura) return []
      if (id === autor.id && (mudouNivel || mudouAtivo))
        throw new ErroApi(409, MENSAGENS.propriaConta, { codigo: 'PROPRIA_CONTA' })
      this.verificarUltimoAdmin(atual, nivel === 'ADMIN' && ativo)
      if (mudouLogin && this.linhaPorLogin(login)) throw new ErroApi(409, MENSAGENS.loginExistente, { codigo: 'LOGIN_EXISTENTE' })
      this.db
        .prepare(
          `UPDATE usuarios SET nome = ?, login = ?, nivel = ?, ativo = ?, signatario = ?, cargo = ?, registro = ?, assinatura = ?,
                  versao = versao + 1, atualizado_em = ? WHERE id = ?`,
        )
        .run(
          nome,
          login,
          nivel,
          ativo ? 1 : 0,
          signatario ? 1 : 0,
          cargo,
          registro,
          assinatura,
          new Date(this.agora()).toISOString(),
          id,
        )
      const encerradas = mudouNivel || (mudouAtivo && !ativo) ? this.apagarSessoes(id) : []
      const detalhe = [
        mudouNome ? `nome: ${atual.nome} → ${nome}` : '',
        mudouLogin ? `login: ${atual.login} → ${login}` : '',
        mudouNivel ? `nível: ${NOME_NIVEL[atual.nivel]} → ${NOME_NIVEL[nivel]}` : '',
        mudouAtivo ? (ativo ? 'reativado' : 'desativado') : '',
        mudouSignatario ? (signatario ? 'passou a ser signatário' : 'deixou de ser signatário') : '',
        mudouDadosAssinatura ? 'cargo, registro ou assinatura' : '',
      ]
        .filter(Boolean)
        .join('; ')
      this.registrar('USUARIO_ALTERADO', { usuario: autor, ip, alvo: id, detalhe: `${atual.login}: ${detalhe}` })
      return encerradas
    })
    return { usuario: this.obter(id)!, sessoesEncerradas }
  }

  /**
   * Senha nova dada pelo administrador (digitada ou gerada): sempre temporária (troca no próximo
   * acesso). Encerra as sessões da pessoa; a situação (ativo ou não) não muda.
   */
  async redefinirSenha(
    id: string,
    e: unknown,
    autor: UsuarioSessao,
    ip: string,
  ): Promise<ResultadoSenha & { sessoesEncerradas: string[] }> {
    const atual = this.linhaPorId(id)
    if (!atual) throw naoEncontrado()
    const r = obj(e)
    if ('senha' in r && r.senha !== undefined && typeof r.senha !== 'string') throw new ErroApi(400, 'Senha inválida.')
    const digitada = typeof r.senha === 'string' ? r.senha : ''
    if (digitada) erroSenha(validarSenhaNova(digitada, atual, { deOutraPessoa: true }))
    const senhaTemporaria = digitada ? undefined : gerarSenhaTemporaria()
    const hash = await gerarHashSenha(digitada || senhaTemporaria!, this.params)
    const sessoesEncerradas = transacao(this.db, () => {
      if (!this.linhaPorId(id)) throw naoEncontrado()
      const em = new Date(this.agora()).toISOString()
      this.db
        .prepare(
          'UPDATE usuarios SET senha_hash = ?, trocar_senha = 1, senha_alterada_em = ?, atualizado_em = ?, versao = versao + 1 WHERE id = ?',
        )
        .run(hash, em, em, id)
      const encerradas = this.apagarSessoes(id)
      this.registrar('SENHA_REDEFINIDA', {
        usuario: autor,
        ip,
        alvo: id,
        detalhe: `${atual.login}: senha ${senhaTemporaria ? 'gerada pelo sistema' : 'digitada pelo administrador'}`,
      })
      return encerradas
    })
    return { usuario: this.obter(id)!, ...(senhaTemporaria ? { senhaTemporaria } : {}), sessoesEncerradas }
  }

  /** "Encerrar sessões": todas as da pessoa, menos `exceto` (a atual, na própria conta). */
  encerrarSessoesDe(usuarioId: string, autor: UsuarioSessao | null, ip: string, exceto?: string | null): string[] {
    return transacao(this.db, () => {
      const atual = this.linhaPorId(usuarioId)
      if (!atual) throw naoEncontrado()
      const ids = this.apagarSessoes(usuarioId, exceto)
      if (autor)
        this.registrar('SESSOES_ENCERRADAS', {
          usuario: autor,
          ip,
          alvo: usuarioId,
          detalhe: `${atual.login}: ${ids.length} ${ids.length === 1 ? 'sessão' : 'sessões'}${exceto ? ' (menos a atual)' : ''}`,
        })
      return ids
    })
  }

  /** Exclui a conta (as sessões caem junto, pelo ON DELETE CASCADE). */
  excluir(id: string, autor: UsuarioSessao, ip: string): { sessoesEncerradas: string[] } {
    return transacao(this.db, () => {
      const atual = this.linhaPorId(id)
      if (!atual) throw naoEncontrado()
      if (id === autor.id) throw new ErroApi(409, MENSAGENS.propriaConta, { codigo: 'PROPRIA_CONTA' })
      this.verificarUltimoAdmin(atual, false)
      const sessoesEncerradas = this.idsSessoes(id)
      this.db.prepare('DELETE FROM usuarios WHERE id = ?').run(id)
      this.registrar('USUARIO_EXCLUIDO', { usuario: autor, ip, alvo: id, detalhe: `${atual.login} (${atual.nome})` })
      return { sessoesEncerradas }
    })
  }

  /**
   * Troca da própria senha. Mantém a sessão atual (o mesmo cookie) e encerra as outras.
   * A senha atual errada conta no limite de tentativas (mesma regra do login).
   */
  async trocarPropriaSenha(
    sessaoId: string,
    e: unknown,
    ip: string,
  ): Promise<{ usuario: UsuarioSessao; sessoesEncerradas: string[] }> {
    const [cond, params] = this.sessaoVigente()
    const linha = this.db
      .prepare(`SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ? AND u.ativo = 1 AND ${cond}`)
      .get(sessaoId, ...params) as LinhaUsuario | undefined
    if (!linha) throw new ErroApi(401, MENSAGENS.semSessao, { codigo: 'SEM_SESSAO' })
    const r = obj(e)
    const senhaAtual = typeof r.senhaAtual === 'string' ? r.senhaAtual : ''
    const senhaNova = typeof r.senhaNova === 'string' ? r.senhaNova : ''
    if (!senhaAtual) throw new ErroApi(400, 'Informe a senha atual.')
    if (!senhaNova) throw new ErroApi(400, 'Informe a senha nova.')

    const chaves: ChavesTentativa = { trocaSenhaDe: linha.id }
    const espera = this.limite.espera(chaves, Date.parse(linha.senha_alterada_em))
    if (espera !== null) throw erroMuitasTentativas(espera)
    if (!(await conferirSenha(senhaAtual, linha.senha_hash))) {
      const { bloqueouAgora } = this.limite.falhou(chaves)
      if (bloqueouAgora) {
        this.registrar('BLOQUEIO', { usuario: linha, ip, detalhe: DESCRICAO_BLOQUEIO.senha })
        this.avisar(`Troca de senha bloqueada por muitas tentativas: ${linha.login} a partir de ${ip}.`)
      }
      throw new ErroApi(400, 'A senha atual não confere.', { codigo: 'SENHA_ATUAL' })
    }
    this.limite.acertou(chaves)
    if (senhaNova.normalize('NFC') === senhaAtual.normalize('NFC'))
      throw new ErroApi(400, 'A senha nova precisa ser diferente da atual.', { codigo: 'SENHA_IGUAL' })
    erroSenha(validarSenhaNova(senhaNova, linha))

    const hash = await gerarHashSenha(senhaNova, this.params)
    const sessoesEncerradas = transacao(this.db, () => {
      const atual = this.linhaPorId(linha.id)
      // Senha redefinida por outra pessoa enquanto o hash era calculado: a sessão já caiu
      if (!atual || atual.senha_hash !== linha.senha_hash) throw new ErroApi(401, MENSAGENS.semSessao, { codigo: 'SEM_SESSAO' })
      const agora = this.agora()
      const em = new Date(agora).toISOString()
      this.db
        .prepare(
          'UPDATE usuarios SET senha_hash = ?, trocar_senha = 0, senha_alterada_em = ?, atualizado_em = ?, versao = versao + 1 WHERE id = ?',
        )
        .run(hash, em, em, linha.id)
      this.db.prepare('UPDATE sessoes SET usada_em = ? WHERE id = ?').run(agora, sessaoId)
      const encerradas = this.apagarSessoes(linha.id, sessaoId)
      this.registrar('SENHA_TROCADA', {
        usuario: linha,
        ip,
        alvo: linha.id,
        detalhe: linha.trocar_senha ? 'senha temporária substituída' : '',
      })
      return encerradas
    })
    return { usuario: { ...paraSessao(linha), trocarSenha: false }, sessoesEncerradas }
  }

  // ---- Registro de atividades -------------------------------------------------------

  registrar(acao: AcaoAuditoria, d: DadosRegistro): void {
    gravarAuditoria(this.db, this.agora(), acao, d)
  }

  /** Do mais novo para o mais antigo; `antes` = id do último registro já mostrado ("Carregar mais"). */
  listarAuditoria(f: { antes?: number; limite?: number; grupo?: GrupoAuditoria; usuarioId?: string }): RegistroAuditoria[] {
    const onde: string[] = []
    const params: Array<string | number> = []
    if (f.antes !== undefined && Number.isSafeInteger(f.antes)) {
      onde.push('id < ?')
      params.push(f.antes)
    }
    if (f.grupo) {
      const acoes = GRUPOS_AUDITORIA[f.grupo]
      onde.push(`acao IN (${acoes.map(() => '?').join(', ')})`)
      params.push(...acoes)
    }
    if (f.usuarioId) {
      onde.push('usuario_id = ?')
      params.push(f.usuarioId)
    }
    const limite = Math.min(Math.max(Math.trunc(f.limite ?? 50) || 50, 1), 200)
    const linhas = this.db
      .prepare(`SELECT * FROM auditoria ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`)
      .all(...params, limite) as unknown as LinhaAuditoria[]
    return linhas.map((l) => ({
      id: l.id,
      em: l.em,
      usuarioId: l.usuario_id,
      login: l.login,
      ip: l.ip,
      acao: l.acao,
      alvo: l.alvo,
      detalhe: l.detalhe,
    }))
  }

  /** Apaga os registros com mais de 365 dias; devolve quantos. */
  limparAuditoriaAntiga(): number {
    const limite = new Date(this.agora() - RETENCAO_AUDITORIA_DIAS * DIA).toISOString()
    return Number(this.db.prepare('DELETE FROM auditoria WHERE em < ?').run(limite).changes)
  }

  // ---- Ferramenta local (sem servidor; usada pelo redefinir-senha.mjs) ---------------

  /** Resumo para os scripts: quantos usuários, quantos administradores ativos e a lista (sem hash). */
  situacao(): {
    usuarios: number
    administradoresAtivos: number
    lista: Array<Pick<Usuario, 'login' | 'nome' | 'nivel' | 'ativo'>>
  } {
    const lista = (this.db.prepare('SELECT login, nome, nivel, ativo FROM usuarios').all() as unknown as LinhaUsuario[])
      .map((l) => ({ login: l.login, nome: l.nome, nivel: l.nivel, ativo: !!l.ativo }))
      .sort(ordemUsuarios)
    return { usuarios: lista.length, administradoresAtivos: this.administradoresAtivos(), lista }
  }

  /**
   * Cria a conta (sempre administrador) ou redefine a senha de uma existente, no computador do
   * servidor. A conta fica ativa; `tornarAdmin` promove. Senha gerada: troca obrigatória no
   * próximo acesso; senha digitada: só se `trocarSenha`. Encerra as sessões da conta.
   */
  async definirSenhaLocal(e: EntradaFerramentaLocal): Promise<{ usuario: Usuario; criado: boolean; senhaTemporaria?: string }> {
    const r = obj(e)
    const login = normalizarLogin(r.login)
    const erroLogin = validarLogin(login)
    if (erroLogin) throw new ErroApi(400, erroLogin)
    const existente = this.linhaPorLogin(login)
    const nomeInformado = typeof r.nome === 'string' && r.nome.trim() !== ''
    let nome = existente?.nome ?? 'Administrador'
    // Mesma regra do cadastro pela tela (sem caracteres de controle; até 60 caracteres)
    if (nomeInformado) nome = validar(normalizarAlteracaoUsuario({ nome: r.nome })).nome!
    if (r.senha !== undefined && r.senha !== null && typeof r.senha !== 'string') throw new ErroApi(400, 'Senha inválida.')
    const digitada = typeof r.senha === 'string' ? r.senha : ''
    // No console, a conta pode ser a de quem digita ou a de outra pessoa: o texto neutro serve aos dois
    if (digitada) erroSenha(validarSenhaNova(digitada, { login, nome }, { deOutraPessoa: true }))
    const senhaTemporaria = digitada ? undefined : gerarSenhaTemporaria()
    const trocarSenha = digitada ? r.trocarSenha === true : true
    const hash = await gerarHashSenha(digitada || senhaTemporaria!, this.params)

    const { id, criado } = transacao(this.db, () => {
      const atual = this.linhaPorLogin(login)
      const em = new Date(this.agora()).toISOString()
      const partes: string[] = []
      let id: string
      if (atual) {
        id = atual.id
        const nivel: NivelUsuario = r.tornarAdmin === true ? 'ADMIN' : atual.nivel
        this.db
          .prepare(
            `UPDATE usuarios SET nome = ?, nivel = ?, ativo = 1, senha_hash = ?, trocar_senha = ?, senha_alterada_em = ?,
             atualizado_em = ?, versao = versao + 1 WHERE id = ?`,
          )
          .run(nome, nivel, hash, trocarSenha ? 1 : 0, em, em, id)
        this.apagarSessoes(id)
        partes.push('senha redefinida')
        if (nivel !== atual.nivel) partes.push(`nível: ${NOME_NIVEL[atual.nivel]} → ${NOME_NIVEL[nivel]}`)
        if (!atual.ativo) partes.push('reativado')
        if (nome !== atual.nome) partes.push(`nome: ${atual.nome} → ${nome}`)
      } else {
        id = novoId()
        this.db
          .prepare(
            `INSERT INTO usuarios (id, login, nome, nivel, senha_hash, ativo, trocar_senha, versao, criado_em, atualizado_em, senha_alterada_em)
             VALUES (?, ?, ?, 'ADMIN', ?, 1, ?, 1, ?, ?, ?)`,
          )
          .run(id, login, nome, hash, trocarSenha ? 1 : 0, em, em, em)
        partes.push('criado como Administrador')
      }
      if (senhaTemporaria) partes.push('senha temporária')
      this.registrar('FERRAMENTA_LOCAL', { usuario: { id, login }, ip: 'local', alvo: id, detalhe: partes.join('; ') })
      return { id, criado: !atual }
    })
    return { usuario: this.obter(id)!, criado, ...(senhaTemporaria ? { senhaTemporaria } : {}) }
  }

  /**
   * Primeiro acesso: com o banco sem nenhum usuário, cria o administrador (signatário) pela tela.
   * A rota só aceita pedidos do próprio servidor (localhost). Já entra com a conta criada.
   */
  async criarPrimeiroAdministrador(e: unknown, ip: string): Promise<ResultadoEntrada> {
    if (this.quantos() > 0) throw new ErroApi(409, 'O administrador já foi criado. Entre com o usuário e a senha.')
    const r = obj(e)
    const dados = validar(normalizarNovoUsuario({ ...r, nivel: 'ADMIN', signatario: true }))
    if (!dados.senha) throw new ErroApi(400, 'Crie uma senha para o administrador.')
    erroSenha(validarSenhaNova(dados.senha, { login: dados.login, nome: dados.nome }))
    const hash = await gerarHashSenha(dados.senha, this.params)
    transacao(this.db, () => {
      // De novo dentro da transação: dois navegadores no servidor ao mesmo tempo
      if (this.quantos() > 0) throw new ErroApi(409, 'O administrador já foi criado. Entre com o usuário e a senha.')
      const em = new Date(this.agora()).toISOString()
      const id = novoId()
      this.db
        .prepare(
          `INSERT INTO usuarios (id, login, nome, nivel, senha_hash, ativo, trocar_senha, versao, criado_em, atualizado_em,
                                 senha_alterada_em, signatario, cargo, registro)
           VALUES (?, ?, ?, 'ADMIN', ?, 1, 0, 1, ?, ?, ?, 1, ?, ?)`,
        )
        .run(id, dados.login, dados.nome, hash, em, em, em, dados.cargo, dados.registro)
      this.registrar('USUARIO_CRIADO', {
        usuario: { id, login: dados.login },
        ip,
        alvo: id,
        detalhe: `${dados.login} (Administrador, signatário); primeiro acesso pelo servidor`,
      })
    })
    return this.entrar({ login: dados.login, senha: dados.senha }, ip, null)
  }

  /** Apaga todas as sessões (restauração de cópia, emergência); devolve quantas. */
  encerrarTodasAsSessoes(): number {
    return transacao(this.db, () => {
      const n = Number(this.db.prepare('DELETE FROM sessoes').run().changes)
      this.registrar('FERRAMENTA_LOCAL', { ip: 'local', detalhe: `todas as sessões encerradas (${n})` })
      return n
    })
  }

  // ---- Internos -------------------------------------------------------------------

  private linhaPorId(id: string): LinhaUsuario | undefined {
    return this.db.prepare('SELECT * FROM usuarios WHERE id = ?').get(String(id)) as LinhaUsuario | undefined
  }

  private linhaPorLogin(login: string): LinhaUsuario | undefined {
    return this.db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login) as LinhaUsuario | undefined
  }

  /**
   * Condição de sessão vigente sobre o alias `s` (o `u.ativo = 1` vai à parte):
   * dentro do prazo total e usada dentro do prazo de inatividade (4 h, ou 7 dias com "manter conectado").
   */
  private sessaoVigente(agora = this.agora()): [string, number[]] {
    return [
      's.expira_em > ? AND s.usada_em > (CASE WHEN s.persistente = 1 THEN ? ELSE ? END)',
      [agora, agora - PRAZOS_SESSAO.manterConectado.inatividadeMs, agora - PRAZOS_SESSAO.normal.inatividadeMs],
    ]
  }

  private contarSessoes(l: LinhaUsuario): number {
    if (!l.ativo) return 0
    const [cond, params] = this.sessaoVigente()
    return (
      this.db.prepare(`SELECT COUNT(*) AS n FROM sessoes s WHERE s.usuario_id = ? AND ${cond}`).get(l.id, ...params) as {
        n: number
      }
    ).n
  }

  private idsSessoes(usuarioId: string, exceto?: string | null): string[] {
    return (
      this.db.prepare('SELECT id FROM sessoes WHERE usuario_id = ? AND id <> ?').all(usuarioId, exceto ?? '') as Array<{
        id: string
      }>
    ).map((l) => l.id)
  }

  private apagarSessoes(usuarioId: string, exceto?: string | null): string[] {
    const ids = this.idsSessoes(usuarioId, exceto)
    this.db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND id <> ?').run(usuarioId, exceto ?? '')
    return ids
  }

  /** Login livre e abaixo do limite de usuários. */
  private verificarCadastro(login: string) {
    if (this.linhaPorLogin(login)) throw new ErroApi(409, MENSAGENS.loginExistente, { codigo: 'LOGIN_EXISTENTE' })
    if (this.quantos() >= USUARIOS_MAX) throw new ErroApi(409, MENSAGENS.limite, { codigo: 'LIMITE_USUARIOS' })
  }

  /** Nunca deixar zero administradores ativos. `continuaAdminAtivo`: como a conta fica depois. */
  private verificarUltimoAdmin(atual: LinhaUsuario, continuaAdminAtivo: boolean) {
    const eraAdminAtivo = atual.nivel === 'ADMIN' && !!atual.ativo
    if (eraAdminAtivo && !continuaAdminAtivo && this.administradoresAtivos() <= 1)
      throw new ErroApi(409, MENSAGENS.ultimoAdmin, { codigo: 'ULTIMO_ADMIN' })
  }

  private obterHashFalso(): Promise<string> {
    this.hashFalso ??= gerarHashSenha(gerarToken(), this.params)
    return this.hashFalso
  }
}

/**
 * Restauração de uma cópia .db: copia os usuários e o registro de atividades de `origem` (o banco
 * atual) para `destino` (a cópia que vai voltar), substituindo os dela, e apaga todas as sessões de
 * `destino`. Assim voltar uma cópia antiga não traz de volta senhas antigas nem contas excluídas.
 * Os dois bancos precisam estar abertos com `abrirBanco` (migração 5 aplicada).
 */
export function transplantarUsuarios(origem: Banco, destino: Banco): { usuarios: number; auditoria: number } {
  // Todas as colunas que os dois bancos têm: também quem é signatário, o cargo, o registro e a assinatura (sem
  // elas, ninguém mais emitiria depois de voltar a cópia)
  const colunas = (db: Banco) =>
    (db.prepare('PRAGMA table_info(usuarios)').all() as Array<{ name: string }>).map((c) => c.name)
  const comuns = colunas(origem).filter((c) => colunas(destino).includes(c))
  const usuarios = origem.prepare(`SELECT ${comuns.join(', ')} FROM usuarios`).all() as unknown as Array<
    Record<keyof LinhaUsuario, string | number | null>
  >
  const auditoria = origem.prepare('SELECT * FROM auditoria ORDER BY id').all() as unknown as LinhaAuditoria[]
  transacao(destino, () => {
    destino.exec('DELETE FROM sessoes; DELETE FROM usuarios; DELETE FROM auditoria;')
    const inserirUsuario = destino.prepare(
      `INSERT INTO usuarios (${comuns.join(', ')}) VALUES (${comuns.map(() => '?').join(', ')})`,
    )
    for (const u of usuarios) inserirUsuario.run(...comuns.map((c) => u[c as keyof LinhaUsuario] ?? null))
    const inserirRegistro = destino.prepare(
      'INSERT INTO auditoria (id, em, usuario_id, login, ip, acao, alvo, detalhe) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const a of auditoria) inserirRegistro.run(a.id, a.em, a.usuario_id, a.login, a.ip, a.acao, a.alvo, a.detalhe)
    gravarAuditoria(destino, Date.now(), 'COPIA_RESTAURADA', { ip: 'local', detalhe: 'as contas e senhas atuais foram mantidas' })
  })
  return { usuarios: usuarios.length, auditoria: auditoria.length }
}

/**
 * Restauração de uma cópia .db: as folhas de campo de `origem` (o banco atual) que faltam em `destino` (a
 * cópia que vai voltar) passam para ela. São registros de impressão, como o registro de atividades: os nºs
 * impressos depois da cópia já estão no papel, com os técnicos, e nunca podem ser emitidos de novo para
 * outro conteúdo. A folha de uma calibração que não existe na cópia fica livre (sem calibração), e o PDF
 * vai junto (o caminho na pasta folhas-campo, que a restauração não apaga, ou o próprio arquivo, se estava
 * no banco). A calibração que recebe folhas impressas depois da cópia fica com elas como o banco atual
 * estava: as que eram livres na cópia e são dela no banco atual voltam para ela (`ligarComoNoAtual`), e a
 * que ficaria com duas folhas vigentes (a da cópia e a impressa depois dela, que no banco atual a
 * substituiu) volta a ter uma só (`conciliarVigentes`). Nenhuma calibração da cópia termina com duas
 * vigentes (`umaVigentePorCalibracao`). Devolve quantas passaram; o registro de atividades da cópia guarda
 * quais. Os nºs de certificado reservados depois da cópia (impressos nas folhas) passam junto
 * (`transplantarNumeros`).
 */
export function transplantarFolhasCampo(origem: Banco, destino: Banco): number {
  const colunas = (db: Banco) =>
    (db.prepare('PRAGMA table_info(folhas_campo)').all() as Array<{ name: string }>).map((c) => c.name)
  const comuns = colunas(origem).filter((c) => colunas(destino).includes(c))
  if (!comuns.includes('numero')) return 0
  const linhas = origem.prepare(`SELECT ${comuns.join(', ')} FROM folhas_campo ORDER BY ano, sequencia`).all() as Array<
    Record<string, string | number | Uint8Array | null>
  >
  let passaram: string[] = []
  transacao(destino, () => {
    transplantarNumeros(origem, destino)
    const existe = destino.prepare('SELECT 1 FROM folhas_campo WHERE numero = ? OR chave = ? OR (ano = ? AND sequencia = ?)')
    const calibracao = destino.prepare('SELECT 1 FROM calibracoes WHERE id = ?')
    const inserir = destino.prepare(
      `INSERT INTO folhas_campo (${comuns.join(', ')}) VALUES (${comuns.map(() => '?').join(', ')})`,
    )
    passaram = []
    for (const l of linhas) {
      if (existe.get(l.numero, l.chave, l.ano, l.sequencia)) continue
      const linha = { ...l }
      if (linha.calibracao_id && !calibracao.get(linha.calibracao_id)) {
        linha.calibracao_id = ''
        if ('substituida_por' in linha) linha.substituida_por = ''
        if ('substituida_em' in linha) linha.substituida_em = ''
      }
      inserir.run(...comuns.map((c) => linha[c] ?? null))
      passaram.push(String(l.numero))
    }
    const historico = comuns.includes('substituida_por')
    const ligadas = historico ? ligarComoNoAtual(origem, destino, passaram) : []
    const trocadas = historico ? conciliarVigentes(origem, destino, passaram) : []
    // A garantia vem por último e diz como cada folha terminou
    const garantidas = historico ? umaVigentePorCalibracao(origem, destino) : []
    const conciliadas = trocadas.filter((n) => !garantidas.includes(n))
    const lista = (l: string[], uma: string, varias: string) =>
      l.length === 1 ? `${l[0]}, ${uma}` : `${l.join(', ')}, ${varias}`
    const partes = [
      passaram.length === 1
        ? `a folha de campo impressa depois da cópia (${passaram[0]}) continua registrada: os nºs não se repetem`
        : passaram.length
          ? `${passaram.length} folhas de campo impressas depois da cópia (${passaram[0]} a ${passaram.at(-1)}) continuam registradas: os nºs não se repetem`
          : '',
      conciliadas.length
        ? lista(
            conciliadas,
            'da cópia, ficou como no banco atual (trocada pela impressa depois)',
            'da cópia, ficaram como no banco atual (trocadas pelas impressas depois)',
          )
        : '',
      ligadas.length
        ? lista(
            ligadas,
            'livre na cópia, voltou para a calibração, como no banco atual',
            'livres na cópia, voltaram para a calibração, como no banco atual',
          )
        : '',
      garantidas.length
        ? lista(
            garantidas,
            'da cópia, deixou de ser vigente (uma folha vigente por calibração)',
            'da cópia, deixaram de ser vigentes (uma folha vigente por calibração)',
          )
        : '',
    ].filter(Boolean)
    if (partes.length) gravarAuditoria(destino, Date.now(), 'COPIA_RESTAURADA', { ip: 'local', detalhe: partes.join('; ') })
  })
  return passaram.length
}

const temTabela = (db: Banco, nome: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome)

/**
 * Os nºs de certificado reservados no banco atual (`origem`) depois da cópia (`destino`) passam para ela, como
 * estavam: eles já estão nas folhas de campo e nas etiquetas das balanças, e nunca podem ir para outro
 * certificado. O nº reservado para uma calibração que não existe na cópia fica com a folha em que saiu, como o
 * da folha avulsa: passa para a calibração refeita a que ela for ligada. A calibração que na cópia tem outro nº
 * reservado fica com o do banco atual (o do papel ligado a ela depois da cópia, que a passagem das folhas
 * também liga), e o da cópia fica como está no banco atual. O nº emitido depois da cópia para uma calibração
 * que na cópia ainda está em andamento volta como reservado para ela: a reemissão sai com o mesmo nº da
 * etiqueta, da folha e do PDF já entregue. O contador da emissão (`sequencia_<ano>`) também não volta: os
 * certificados emitidos depois da cópia têm o PDF na pasta e podem estar com o cliente. Grava no registro de
 * atividades quantos passaram; devolve quais.
 */
function transplantarNumeros(origem: Banco, destino: Banco): string[] {
  if (!temTabela(origem, 'numeros_reservados') || !temTabela(destino, 'numeros_reservados')) return []
  type Linha = Record<string, string | number>
  const colunas = [
    'numero',
    'ano',
    'sequencia',
    'calibracao_id',
    'folha',
    'reservado_em',
    'reservado_por',
    'situacao',
    'motivo',
    'situacao_em',
    'situacao_por',
  ]
  const linhas = origem.prepare(`SELECT ${colunas.join(', ')} FROM numeros_reservados ORDER BY ano, sequencia`).all() as Linha[]
  const noAtual = origem.prepare(
    'SELECT calibracao_id, situacao, motivo, situacao_em, situacao_por FROM numeros_reservados WHERE ano = ? AND sequencia = ?',
  )
  const existe = destino.prepare('SELECT 1 FROM numeros_reservados WHERE ano = ? AND sequencia = ?')
  const calibracao = destino.prepare('SELECT 1 FROM calibracoes WHERE id = ?')
  // Em andamento e ainda sem nº (a revisão sai com o do revisado: não tem nº reservado)
  const emAndamento = destino.prepare(
    "SELECT 1 FROM calibracoes WHERE id = ? AND status IN ('RASCUNHO', 'REVISAO') AND substitui_id = '' AND numero = ''",
  )
  const reservadoNaCopia = destino.prepare(
    "SELECT id, ano, sequencia FROM numeros_reservados WHERE calibracao_id = ? AND situacao = 'reservado'",
  )
  const comoNoAtual = destino.prepare(
    'UPDATE numeros_reservados SET calibracao_id = ?, situacao = ?, motivo = ?, situacao_em = ?, situacao_por = ? WHERE id = ?',
  )
  const inserir = destino.prepare(
    `INSERT INTO numeros_reservados (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`,
  )
  const passaram: string[] = []
  const reservadosDeNovo: string[] = []
  for (const l of linhas) {
    if (existe.get(l.ano, l.sequencia)) continue
    const linha = { ...l }
    const dono = String(linha.calibracao_id)
    // Emitido depois da cópia, mas a calibração voltou em andamento: reservado para ela de novo
    if (linha.situacao === 'emitido' && dono && emAndamento.get(dono)) {
      linha.situacao = 'reservado'
      linha.situacao_em = ''
      linha.situacao_por = ''
      reservadosDeNovo.push(String(l.numero))
    }
    if (linha.situacao === 'reservado' && dono) {
      if (!calibracao.get(dono)) linha.calibracao_id = ''
      else {
        // O nº que ela tinha na cópia fica como no banco atual (posto de lado, emitido…); sem ele lá, com a folha
        const outro = reservadoNaCopia.get(dono) as { id: number; ano: number; sequencia: number } | undefined
        if (outro) {
          const a = noAtual.get(outro.ano, outro.sequencia) as Linha | undefined
          if (a && a.situacao !== 'reservado')
            comoNoAtual.run(a.calibracao_id, a.situacao, a.motivo, a.situacao_em, a.situacao_por, outro.id)
          else comoNoAtual.run('', 'reservado', '', '', '', outro.id)
        }
      }
    }
    inserir.run(...colunas.map((c) => linha[c]))
    passaram.push(String(l.numero))
  }
  const contadores = origem.prepare("SELECT chave, valor FROM meta WHERE chave LIKE 'sequencia\\_%' ESCAPE '\\'").all() as Array<{
    chave: string
    valor: string
  }>
  const lerContador = destino.prepare('SELECT valor FROM meta WHERE chave = ?')
  const gravarContador = destino.prepare(
    'INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
  )
  for (const c of contadores) {
    const atual = lerContador.get(c.chave) as { valor: string } | undefined
    if (Number(c.valor) > Number(atual?.valor ?? 0)) gravarContador.run(c.chave, c.valor)
  }
  if (passaram.length)
    gravarAuditoria(destino, Date.now(), 'COPIA_RESTAURADA', {
      ip: 'local',
      detalhe: [
        passaram.length === 1
          ? `o nº de certificado reservado depois da cópia (${passaram[0]}) continua registrado: os nºs não se repetem`
          : `${passaram.length} nºs de certificado reservados depois da cópia (${passaram[0]} a ${passaram.at(-1)}) continuam registrados: os nºs não se repetem`,
        reservadosDeNovo.length
          ? `${reservadosDeNovo.join(', ')}, emitido${reservadosDeNovo.length > 1 ? 's' : ''} depois da cópia, volta${reservadosDeNovo.length > 1 ? 'm' : ''} como reservado${reservadosDeNovo.length > 1 ? 's' : ''} para a calibração em andamento na cópia (a reemissão usa o mesmo nº)`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
    })
  return passaram
}

/**
 * Depois da passagem das folhas impressas depois da cópia: a calibração da cópia com outra folha vigente
 * além da que passou (no banco atual, a da cópia já tinha sido trocada por ela) volta a ter uma só, a que
 * passou. A da cópia fica como estava no banco atual (substituída, livre ou noutra calibração que existe na
 * cópia); sem ela no banco atual, como `Repositorio.substituirFolhas` a deixaria (a impressa para a
 * calibração fica substituída; a avulsa, livre). Devolve os nºs das folhas da cópia que mudaram.
 */
function conciliarVigentes(origem: Banco, destino: Banco, passaram: string[]): string[] {
  const vigente = destino.prepare(
    "SELECT calibracao_id, impressa_em FROM folhas_campo WHERE numero = ? AND calibracao_id <> '' AND substituida_por = ''",
  )
  const outras = destino.prepare(
    "SELECT numero, chave FROM folhas_campo WHERE calibracao_id = ? AND substituida_por = '' AND numero <> ? ORDER BY ano, sequencia",
  )
  const noAtual = origem.prepare('SELECT calibracao_id, substituida_por, substituida_em FROM folhas_campo WHERE numero = ?')
  const existe = destino.prepare('SELECT 1 FROM calibracoes WHERE id = ?')
  const gravar = destino.prepare(
    'UPDATE folhas_campo SET calibracao_id = ?, substituida_por = ?, substituida_em = ? WHERE numero = ?',
  )
  const mudaram: string[] = []
  for (const n of passaram) {
    const t = vigente.get(n) as { calibracao_id: string; impressa_em: string } | undefined
    if (!t) continue
    for (const o of outras.all(t.calibracao_id, n) as Array<{ numero: string; chave: string }>) {
      if (passaram.includes(o.numero)) continue
      const a = noAtual.get(o.numero) as { calibracao_id: string; substituida_por: string; substituida_em: string } | undefined
      if (a && (a.calibracao_id !== t.calibracao_id || a.substituida_por)) {
        const dela = a.calibracao_id && existe.get(a.calibracao_id) ? a.calibracao_id : ''
        gravar.run(dela, dela ? a.substituida_por : '', dela ? a.substituida_em : '', o.numero)
      } else if (impressaPara(o.chave, t.calibracao_id)) gravar.run(t.calibracao_id, n, t.impressa_em, o.numero)
      else gravar.run('', '', '', o.numero)
      mudaram.push(o.numero)
    }
  }
  return mudaram
}

/**
 * Antes de `conciliarVigentes`: a calibração da cópia que recebeu folhas impressas depois dela fica também com
 * as folhas que estavam livres na cópia e que, no banco atual, são dela (ligadas depois da cópia; por
 * exemplo, a avulsa que foi a campo no lugar da folha impressa depois da cópia), como estão no banco atual.
 * Sem isso, a folha que passou ficaria substituída por um nº que não é da calibração, e ela, sem folha.
 * Devolve os nºs que foram ligados.
 */
function ligarComoNoAtual(origem: Banco, destino: Banco, passaram: string[]): string[] {
  const calibracoes = new Set<string>()
  const dela = destino.prepare("SELECT calibracao_id FROM folhas_campo WHERE numero = ? AND calibracao_id <> ''")
  for (const n of passaram) {
    const l = dela.get(n) as { calibracao_id: string } | undefined
    if (l) calibracoes.add(l.calibracao_id)
  }
  const noAtual = origem.prepare(
    'SELECT numero, substituida_por, substituida_em FROM folhas_campo WHERE calibracao_id = ? ORDER BY ano, sequencia',
  )
  const livre = destino.prepare("SELECT 1 FROM folhas_campo WHERE numero = ? AND calibracao_id = ''")
  const ligar = destino.prepare(
    'UPDATE folhas_campo SET calibracao_id = ?, substituida_por = ?, substituida_em = ? WHERE numero = ?',
  )
  const ligadas: string[] = []
  for (const k of calibracoes)
    for (const f of noAtual.all(k) as Array<{ numero: string; substituida_por: string; substituida_em: string }>) {
      if (passaram.includes(f.numero) || !livre.get(f.numero)) continue
      ligar.run(k, f.substituida_por, f.substituida_em, f.numero)
      ligadas.push(f.numero)
    }
  return ligadas
}

/**
 * Por último, a garantia: nenhuma calibração da cópia termina com duas folhas vigentes. Fica a que é a
 * vigente dela no banco atual ou, sem essa, a mais nova; as outras ficam como estão no banco atual, se lá
 * são dela e substituídas, ou como `Repositorio.substituirFolhas` as deixaria (a impressa para a calibração
 * substituída pela que ficou; a avulsa, livre). Devolve os nºs que mudaram.
 */
function umaVigentePorCalibracao(origem: Banco, destino: Banco): string[] {
  const duplas = destino
    .prepare(
      `SELECT calibracao_id FROM folhas_campo WHERE calibracao_id <> '' AND substituida_por = ''
        GROUP BY calibracao_id HAVING COUNT(*) > 1`,
    )
    .all() as Array<{ calibracao_id: string }>
  const vigentes = destino.prepare(
    "SELECT numero, chave, impressa_em FROM folhas_campo WHERE calibracao_id = ? AND substituida_por = '' ORDER BY ano, sequencia",
  )
  const noAtual = origem.prepare('SELECT calibracao_id, substituida_por, substituida_em FROM folhas_campo WHERE numero = ?')
  const gravar = destino.prepare(
    'UPDATE folhas_campo SET calibracao_id = ?, substituida_por = ?, substituida_em = ? WHERE numero = ?',
  )
  const mudaram: string[] = []
  for (const { calibracao_id: k } of duplas) {
    const lista = vigentes.all(k) as Array<{ numero: string; chave: string; impressa_em: string }>
    const atual = (n: string) =>
      noAtual.get(n) as { calibracao_id: string; substituida_por: string; substituida_em: string } | undefined
    const fica =
      lista.find((f) => {
        const a = atual(f.numero)
        return a?.calibracao_id === k && !a.substituida_por
      }) ?? lista.at(-1)!
    for (const f of lista) {
      if (f.numero === fica.numero) continue
      const a = atual(f.numero)
      if (a?.calibracao_id === k && a.substituida_por) gravar.run(k, a.substituida_por, a.substituida_em, f.numero)
      else if (impressaPara(f.chave, k)) gravar.run(k, fica.numero, fica.impressa_em, f.numero)
      else gravar.run('', '', '', f.numero)
      mudaram.push(f.numero)
    }
  }
  return mudaram
}

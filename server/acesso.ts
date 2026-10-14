// Controle de acesso da API: quem pode chamar cada rota (tabela única), o cookie da sessão e os
// ganchos do Fastify que aplicam as regras. Falha fechada: rota /api sem classificação na tabela
// faz o servidor recusar a subida; sem sessão, a API de dados responde 401.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { pode, SEM_PERMISSAO, type Permissao } from '#shared/permissoes.ts'
import type { AcaoAuditoria, UsuarioSessao } from '#shared/tipos.ts'
import { ErroApi } from './erros.ts'
import { hashToken } from './senha.ts'
import type { TempoReal } from './tempoReal.ts'
import type { ServicoUsuarios } from './usuarios.ts'

/** `publico`: sem sessão; `logado`: os dois níveis; uma Permissao: só quem a tem (shared/permissoes.ts). */
export type RegraAcesso = 'publico' | 'logado' | Permissao

declare module 'fastify' {
  interface FastifyRequest {
    /** Quem fez a requisição (o nível vem sempre do banco, nunca do cookie). */
    usuario: UsuarioSessao | null
    /** Id (hash do token) da sessão do cookie, quando vigente. */
    sessaoId: string | null
    /** A sessão do cookie foi aberta com "Manter conectado neste computador". */
    sessaoPersistente: boolean
  }
  interface FastifyContextConfig {
    acesso?: RegraAcesso
    /** 'MÉTODO /padrão' da rota na tabela (HEAD vale como GET). */
    chaveAcesso?: string
  }
}

/**
 * Toda rota /api registrada precisa estar aqui, e toda entrada precisa de uma rota registrada
 * (o servidor não sobe se faltar uma ou outra). HEAD vale como GET. Só `app.all('/api/*')` vira 'ALL'.
 */
export const TABELA_ACESSO: Record<string, RegraAcesso> = {
  // app.ts
  'GET /api/saude': 'publico',
  'GET /api/stream': 'logado', // sem sessão: SSE com `semSessao` (responderStreamSemSessao)
  'GET /api/backups': 'dadosEBackup',
  'POST /api/backups': 'dadosEBackup',
  'GET /api/backups/:arquivo': 'dadosEBackup',
  'ALL /api/*': 'publico', // só responde 404

  // rotas/usuarios.ts
  'GET /api/sessao': 'publico',
  'POST /api/sessao': 'publico',
  'DELETE /api/sessao': 'publico',
  'POST /api/primeiro-acesso': 'publico', // só com o banco sem usuários e só pelo próprio servidor
  'PUT /api/minha-senha': 'logado', // aceita com a troca de senha pendente
  'GET /api/usuarios': 'usuarios',
  'POST /api/usuarios': 'usuarios',
  'PUT /api/usuarios/:id': 'usuarios',
  'DELETE /api/usuarios/:id': 'usuarios',
  'POST /api/usuarios/:id/senha': 'usuarios',
  'DELETE /api/usuarios/:id/sessoes': 'usuarios',
  'GET /api/auditoria': 'usuarios',

  // rotas/cadastros.ts
  'GET /api/clientes': 'logado',
  'GET /api/clientes/:id': 'logado',
  'POST /api/clientes': 'logado',
  'PUT /api/clientes/:id': 'logado',
  'DELETE /api/clientes/:id': 'excluirCliente',
  'GET /api/balancas': 'logado',
  'GET /api/balancas/:id': 'logado',
  'POST /api/balancas': 'logado',
  'PUT /api/balancas/:id': 'logado',
  'DELETE /api/balancas/:id': 'excluirBalanca',
  'GET /api/padroes': 'logado',
  'POST /api/padroes': 'logado',
  'PUT /api/padroes/:id': 'logado',
  'DELETE /api/padroes/:id': 'excluirPadrao',

  // rotas/geral.ts
  'GET /api/config': 'logado',
  'PUT /api/config': 'configuracoes',
  'GET /api/painel': 'logado',
  'GET /api/vencimentos': 'logado',
  'GET /api/equipe': 'logado',

  // rotas/calibracoes.ts
  'GET /api/calibracoes': 'logado',
  'GET /api/calibracoes/:id': 'logado',
  'POST /api/calibracoes': 'logado',
  'PUT /api/calibracoes/:id': 'logado',
  'DELETE /api/calibracoes/:id': 'logado', // só rascunho (o repositório recusa o emitido)
  'POST /api/calibracoes/:id/situacao': 'logado',
  'POST /api/calibracoes/:id/emitir': 'logado', // + signatário (conferido na rota)
  'POST /api/calibracoes/:id/cancelar': 'cancelarCertificado',
  'POST /api/calibracoes/:id/revisar': 'logado',
  'POST /api/calibracoes/:id/recalibrar': 'logado',
  'GET /api/calibracoes/:id/pdf': 'logado',
  'POST /api/calibracoes/:id/previa': 'logado',
  'POST /api/calibracoes/:id/email': 'logado',
  'POST /api/lembretes': 'logado',
  'GET /api/verificar/:codigo': 'publico', // autenticidade (QR code): só o essencial do certificado

  // email.ts
  'GET /api/email/config': 'logado', // resposta reduzida para quem não tem `configuracoes`
  'PUT /api/email/config': 'configuracoes',
  'DELETE /api/email/config': 'configuracoes',
  'POST /api/email/teste': 'configuracoes',

  // rotas/consultas.ts
  'GET /api/consultas/cnpj/:cnpj': 'logado',
  'GET /api/consultas/cep/:cep': 'logado',
}

/** Usuário fictício dos testes antigos (`acessoLivreParaTestes`): administrador. */
export const USUARIO_TESTE: UsuarioSessao = {
  id: 'teste',
  login: 'teste',
  nome: 'Teste',
  nivel: 'ADMIN',
  trocarSenha: false,
  signatario: true,
}

// ---- Cookie (lido e escrito à mão) --------------------------------------------------

/** Um nome por porta: duas instalações no mesmo computador não derrubam a sessão uma da outra. */
export function nomeCookieSessao(porta?: number): string {
  return porta ? `bcc_sessao_${porta}` : 'bcc_sessao'
}

/** Valor do cookie `nome` no cabeçalho Cookie (o primeiro, se vier repetido). */
export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  if (!cabecalho) return undefined
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=')
    if (i < 0 || parte.slice(0, i).trim() !== nome) continue
    const valor = parte
      .slice(i + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1')
    return valor || undefined
  }
  return undefined
}

/**
 * Cookie da sessão: HttpOnly e SameSite=Strict. Sem `Secure` (o acesso é por HTTP pelo IP da rede
 * local, e o navegador não gravaria) e sem `Domain`. Sem Max-Age, vale até fechar o navegador.
 */
export function cookieSessao(nome: string, token: string, maxAgeSegundos: number | null): string {
  return `${nome}=${token}; Path=/; HttpOnly; SameSite=Strict${maxAgeSegundos ? `; Max-Age=${maxAgeSegundos}` : ''}`
}

export function cookieApagar(nome: string): string {
  return `${nome}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
}

/** Id (hash) da sessão do cookie, vigente ou não (para apagar a anterior ao entrar ou sair). */
export function sessaoIdDoCookie(req: FastifyRequest, nomeCookie: string): string | null {
  const token = lerCookie(req.headers.cookie, nomeCookie)
  return token && token.length <= 200 ? hashToken(token) : null
}

/** IP de quem chamou (sem o prefixo ::ffff:). Com trustProxy desligado, não dá para falsificar. */
export function ipDe(req: FastifyRequest): string {
  return String(req.socket?.remoteAddress ?? '').replace(/^::ffff:/i, '')
}

// ---- Ganchos ---------------------------------------------------------------------

export interface DependenciasAcesso {
  usuarios: ServicoUsuarios
  tempoReal: TempoReal
}

export interface OpcoesAcesso {
  /** Sem sessão, toda requisição vale como o administrador fictício (só nos testes). */
  acessoLivreParaTestes?: boolean
  nomeCookie: string
}

/** Rotas cujas gravações não vão para a auditoria como ALTERACAO (têm registro próprio ou não gravam dados). */
const foraDaAuditoria = (url: string) =>
  url === '/api/sessao' || url === '/api/minha-senha' || url === '/api/*' || url.startsWith('/api/usuarios')

/** Ações próprias do registro de atividades, por rota. */
const ACAO_DA_ROTA: Record<string, AcaoAuditoria> = {
  'GET /api/backups/:arquivo': 'BACKUP_BAIXADO',
  'POST /api/calibracoes/:id/emitir': 'CERTIFICADO_EMITIDO',
  'POST /api/calibracoes/:id/cancelar': 'CERTIFICADO_CANCELADO',
  'POST /api/calibracoes/:id/email': 'CERTIFICADO_ENVIADO',
}

/** Rotas que só calculam ou geram prévia (POST sem gravar dados): fora da auditoria. */
const SO_LEITURA = new Set(['POST /api/calibracoes/:id/previa', 'POST /api/primeiro-acesso'])

type Bruto = Record<string, unknown>
const obj = (v: unknown): Bruto => (v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v) ? (v as Bruto) : {})
const idDaRota = (req: FastifyRequest) => {
  const id = (req.params as { id?: unknown } | undefined)?.id
  return typeof id === 'string' ? id : ''
}

/**
 * Instala o controle de acesso. Chamar logo depois do gancho de Host e CSRF e antes de registrar
 * qualquer rota (o onRoute classifica as rotas na hora do registro).
 */
export function instalarAcesso(app: FastifyInstance, { usuarios, tempoReal }: DependenciasAcesso, opcoes: OpcoesAcesso) {
  const { nomeCookie } = opcoes
  const livre = !!opcoes.acessoLivreParaTestes
  const registradas = new Set<string>()
  /** Último ACESSO_NEGADO gravado por usuário e rota (no máximo 1 por minuto). */
  const negados = new Map<string, number>()

  app.decorateRequest('usuario', null)
  app.decorateRequest('sessaoId', null)
  app.decorateRequest('sessaoPersistente', false)

  app.addHook('onRoute', (rota) => {
    const url = rota.url ?? ''
    if (!url.startsWith('/api')) return
    let metodo: string
    if (Array.isArray(rota.method)) {
      const todos = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].every((m) => (rota.method as string[]).includes(m))
      if (url !== '/api/*' || !todos) throw new Error(`Rota com lista de métodos não permitida: ${rota.method.join(',')} ${url}`)
      metodo = 'ALL'
    } else {
      metodo = rota.method === 'HEAD' ? 'GET' : String(rota.method)
    }
    const chave = `${metodo} ${url}`
    const acesso = TABELA_ACESSO[chave]
    if (!acesso) throw new Error(`Rota sem classificação de acesso: ${chave}`)
    rota.config = { ...rota.config, acesso, chaveAcesso: chave }
    registradas.add(chave)
  })

  app.addHook('onReady', async () => {
    const sobrando = Object.keys(TABELA_ACESSO).filter((c) => !registradas.has(c))
    if (sobrando.length) throw new Error(`Entradas da tabela de acesso sem rota registrada: ${sobrando.join(', ')}`)
  })

  /** Tempo real sem sessão: uma mensagem de boas-vindas com `semSessao` e a resposta termina. */
  function responderStreamSemSessao(reply: FastifyReply) {
    return reply
      .code(200)
      .header('Content-Type', 'text/event-stream; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(`retry: 3000\nevent: ola\ndata: ${JSON.stringify({ revisao: -1, build: tempoReal.build, semSessao: true })}\n\n`)
  }

  // Ordem dos erros: Host 403, CSRF 403 (gancho anterior), sessão 401, troca de senha pendente 403,
  // permissão 403 e, já com o corpo lido, as regras finas 403 (preHandler). Tudo antes de ler o
  // corpo: um envio de arquivo ou uma restauração sem permissão é recusado sem ser lido.
  app.addHook('onRequest', async (req, reply) => {
    if (req.is404) return
    // Sempre pela rota encontrada, nunca por req.url (o roteador decodifica /%61pi/... para /api/...)
    const { acesso, chaveAcesso } = req.routeOptions.config ?? {}
    if (chaveAcesso === undefined) return // fora de /api: interface compilada
    if (acesso === undefined) throw new ErroApi(403, 'Requisição bloqueada.')

    const uso =
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      (chaveAcesso === 'GET /api/sessao' && (req.query as { uso?: unknown } | undefined)?.uso === '1')
    const sessao = usuarios.validarSessao(lerCookie(req.headers.cookie, nomeCookie), uso, ipDe(req))
    if (sessao) {
      req.usuario = sessao.usuario
      req.sessaoId = sessao.sessaoId
      req.sessaoPersistente = sessao.persistente
    } else if (livre) {
      req.usuario = USUARIO_TESTE
    }
    if (acesso === 'publico') return

    const usuario = req.usuario
    if (!usuario) {
      if (chaveAcesso === 'GET /api/stream') return responderStreamSemSessao(reply)
      if (req.method === 'GET' && /text\/html/i.test(String(req.headers.accept ?? '')))
        return reply
          .code(401)
          .header('Cache-Control', 'no-store')
          .type('text/html; charset=utf-8')
          .send(
            '<!doctype html><meta charset="utf-8"><title>BC Calibração</title>' +
              '<p style="font-family:sans-serif;margin:2rem">Sua sessão terminou. Volte ao BC Calibração e entre de novo.</p>',
          )
      throw new ErroApi(401, 'Sua sessão terminou. Entre de novo para continuar.', { codigo: 'SEM_SESSAO' })
    }
    if (usuario.trocarSenha && chaveAcesso !== 'PUT /api/minha-senha') {
      if (chaveAcesso === 'GET /api/stream') return responderStreamSemSessao(reply)
      throw new ErroApi(403, 'Crie sua senha antes de continuar.', { codigo: 'TROCAR_SENHA' })
    }
    if (acesso !== 'logado' && !pode(usuario.nivel, acesso)) {
      const chaveNegado = `${usuario.id}|${chaveAcesso}`
      const agora = usuarios.agora()
      if (agora - (negados.get(chaveNegado) ?? -Infinity) >= 60_000) {
        if (negados.size > 1000) for (const [k, em] of negados) if (agora - em >= 60_000) negados.delete(k)
        negados.set(chaveNegado, agora)
        usuarios.registrar('ACESSO_NEGADO', { usuario, ip: ipDe(req), alvo: idDaRota(req), detalhe: chaveAcesso })
      }
      throw new ErroApi(403, SEM_PERMISSAO[acesso], { codigo: 'SEM_PERMISSAO', permissao: acesso })
    }
  })

  // ---- Registro de atividades das gravações -------------------------------------
  app.addHook('onResponse', async (req, reply) => {
    if (reply.statusCode >= 400 || !req.usuario) return
    const chave = req.routeOptions.config?.chaveAcesso
    if (!chave) return
    const url = chave.slice(chave.indexOf(' ') + 1)
    let acao = ACAO_DA_ROTA[chave]
    if (acao === 'BACKUP_BAIXADO' && req.method === 'HEAD') return
    let detalhe = chave
    if (!acao) {
      if (req.method === 'GET' || req.method === 'HEAD' || foraDaAuditoria(url) || SO_LEITURA.has(chave)) return
      acao = 'ALTERACAO'
      // Na alteração parcial, os nomes dos campos enviados (nunca os valores)
      if (req.method === 'PATCH') {
        const campos = Object.keys(obj(req.body))
          .filter((c) => c !== 'versao')
          .slice(0, 12)
          .map((c) => c.slice(0, 30))
        if (campos.length) detalhe += ` | ${campos.join(',')}`
      }
    }
    try {
      usuarios.registrar(acao, { usuario: req.usuario, ip: ipDe(req), alvo: idDaRota(req), detalhe })
    } catch (e) {
      req.log.error(e, 'falha ao gravar o registro de atividades')
    }
  })
}

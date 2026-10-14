import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyError } from 'fastify'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { instalarAcesso, ipDe, nomeCookieSessao } from './acesso.ts'
import { BackupsAutomaticos } from './backup.ts'
import type { Contexto } from './contexto.ts'
import { abrirBanco } from './db.ts'
import { criarModuloEmail, type CriarTransporte } from './email.ts'
import { ErroApi } from './erros.ts'
import { Repositorio } from './repositorio.ts'
import { rotasCadastros } from './rotas/cadastros.ts'
import { rotasCalibracoes } from './rotas/calibracoes.ts'
import { rotasConsultas } from './rotas/consultas.ts'
import { rotasGeral } from './rotas/geral.ts'
import { rotasUsuarios } from './rotas/usuarios.ts'
import type { ParametrosSenha } from './senha.ts'
import { TempoReal } from './tempoReal.ts'
import { ehLoopback, ServicoUsuarios } from './usuarios.ts'

/** Versão do sistema, lida do package.json. */
export const VERSAO_APP: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

/** Cabeçalho exigido em toda gravação: bloqueia que sites externos alterem dados pela rede local (CSRF). */
export const CABECALHO_APP = 'x-bc-calibracao'

/**
 * Nomes pelos quais o servidor pode ser acessado. Endereços IP, "localhost" e o nome do computador
 * sempre valem; outros nomes (ex.: um apelido no roteador) vão em HOSTS_PERMITIDOS, separados por vírgula.
 * Bloqueia o "DNS rebinding": um site de fora que aponta o próprio nome para o IP do servidor
 * para ler os dados pelo navegador de quem está na rede.
 */
export function hostPermitido(host: string | undefined, extras: ReadonlySet<string>, maquina = hostname()): boolean {
  if (!host) return false
  let nome: string
  try {
    nome = new URL(`http://${host}`).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return false
  }
  if (nome.startsWith('[') && nome.endsWith(']')) nome = nome.slice(1, -1)
  if (isIP(nome)) return true
  if (nome === 'localhost' || nome.endsWith('.localhost')) return true
  const computador = maquina.toLowerCase()
  if (computador && (nome === computador || nome.startsWith(computador + '.'))) return true
  return extras.has(nome)
}

/** Lê HOSTS_PERMITIDOS ("calibracao, servidor.local") como conjunto de nomes em minúsculas. */
export function lerHostsPermitidos(texto = process.env.HOSTS_PERMITIDOS ?? '') {
  return new Set(
    texto
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean),
  )
}

/**
 * Endereço da rede local: o próprio computador (127.x, ::1), faixas privadas (10.x, 172.16–31.x,
 * 192.168.x), link-local (169.254.x, fe80::), IPv6 privado (fc00::/7) e CGNAT de VPN corporativa
 * (100.64–127.x). Qualquer outro endereço (internet) é recusado mesmo que o firewall deixe passar.
 */
export function ipDaRedeLocal(ip: string): boolean {
  const v = String(ip ?? '')
    .replace(/^::ffff:/i, '')
    .toLowerCase()
  if (ehLoopback(v)) return true
  const p = v.split('.').map(Number)
  if (p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = p
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  return /^(fe8|fe9|fea|feb|fc|fd)/.test(v)
}

export interface OpcoesApp {
  /** Pasta de dados (banco, backups, certificados, e-mail). */
  pastaDados: string
  /** Caminho do banco; padrão `<pastaDados>/bc-calibracao.db`. Use ':memory:' em testes. */
  arquivoBanco?: string
  /** Pasta com a interface compilada (`dist`). `null` desativa. */
  pastaEstatica?: string | null
  logger?: boolean
  /** Transporte de e-mail (os testes trocam o SMTP por um que só guarda as mensagens). */
  transporteEmail?: CriarTransporte
  /** Ativa os backups diários (desligado em testes). */
  tarefasEmSegundoPlano?: boolean
  /** Nomes extras aceitos no cabeçalho Host; padrão: HOSTS_PERMITIDOS do ambiente. */
  hostsPermitidos?: string
  /** Aceita só endereços da rede local; padrão: ligado (SO_REDE_LOCAL=0 no .env desliga). */
  soRedeLocal?: boolean
  /** Toda requisição sem sessão vale como o administrador fictício; só com process.env.VITEST. */
  acessoLivreParaTestes?: boolean
  /** Porta do servidor: dá nome ao cookie da sessão (bcc_sessao_<porta>). */
  porta?: number
  /** Parâmetros do scrypt; abaixo de ln=15 só com process.env.VITEST. */
  parametrosSenha?: ParametrosSenha
}

/** Varredura das sessões vencidas e do limite de tentativas. */
const VARREDURA_MS = 60_000

export function varrerSessoes(usuarios: ServicoUsuarios, tempoReal: TempoReal): string[] {
  const vencidas = usuarios.limparVencidas()
  const invalidas = tempoReal.sessoesConectadas().filter((id) => !usuarios.sessaoValida(id))
  const fechar = [...new Set([...vencidas, ...invalidas])]
  tempoReal.encerrarSessoes(fechar)
  usuarios.limite.limpar()
  return fechar
}

export async function criarApp(opcoes: OpcoesApp) {
  // Travas: o acesso livre e o hash leve nunca valem fora dos testes
  if ((opcoes.acessoLivreParaTestes || (opcoes.parametrosSenha && opcoes.parametrosSenha.ln < 15)) && !process.env.VITEST)
    throw new Error('acessoLivreParaTestes e parametrosSenha leves só valem nos testes')
  const pastaDados = resolve(opcoes.pastaDados)
  const app = Fastify({
    logger: opcoes.logger ? { level: 'warn' } : false,
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: false,
  })

  const db = abrirBanco(opcoes.arquivoBanco ?? join(pastaDados, 'bc-calibracao.db'))
  const tempoReal = new TempoReal()
  const repo = new Repositorio(db, (msg) => tempoReal.publicar(msg))
  const backups = new BackupsAutomaticos(db, join(pastaDados, 'backups'))
  const usuarios = new ServicoUsuarios(db, {
    parametrosSenha: opcoes.parametrosSenha,
    avisar: (mensagem) => app.log.warn(mensagem),
  })
  const ctx: Contexto = { db, repo, usuarios, tempoReal, backups, pastaDados, log: app.log }
  const nomeCookie = nomeCookieSessao(opcoes.porta)
  const email = criarModuloEmail(ctx, opcoes.transporteEmail)

  // ---- Segurança básica para uso em rede local ----
  const hostsExtras = lerHostsPermitidos(opcoes.hostsPermitidos)
  const soRedeLocal = opcoes.soRedeLocal ?? process.env.SO_REDE_LOCAL !== '0'
  app.addHook('onRequest', async (req, reply) => {
    // Só a rede da empresa: um acesso vindo da internet é recusado antes de qualquer coisa
    if (soRedeLocal && !ipDaRedeLocal(ipDe(req))) {
      req.log.warn({ ip: ipDe(req) }, 'acesso de fora da rede local recusado')
      return reply.code(403).type('text/plain; charset=utf-8').send('Acesso permitido somente pela rede da empresa.')
    }
    // Vale também para leituras: um site de fora com o nome apontado para este servidor não lê nada
    if (!hostPermitido(req.headers.host, hostsExtras)) {
      const aviso =
        `Acesso pelo nome "${String(req.headers.host ?? '').slice(0, 100)}" bloqueado. ` +
        'Use o endereço IP do servidor, ou inclua esse nome em HOSTS_PERMITIDOS no arquivo .env e reinicie o servidor.'
      if (req.url.startsWith('/api/')) throw new ErroApi(403, aviso)
      return reply.code(403).type('text/plain; charset=utf-8').send(aviso)
    }
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'SAMEORIGIN')
    reply.header('Referrer-Policy', 'same-origin')
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store')
    // A verificação vale para QUALQUER requisição que não seja leitura, independentemente do
    // caminho (o roteador decodifica /%61pi/... para /api/..., então não dá para filtrar pelo prefixo).
    if (req.method === 'GET' || req.method === 'HEAD') return
    const origem = req.headers.origin
    if (origem) {
      let hostOrigem = ''
      try {
        hostOrigem = new URL(origem).host
      } catch {
        /* origem inválida */
      }
      if (hostOrigem !== req.headers.host) throw new ErroApi(403, 'Requisição de outro site bloqueada.')
    }
    if (req.headers[CABECALHO_APP] !== '1') throw new ErroApi(403, 'Requisição bloqueada.')
  })

  // Quem é, e se pode: sessão, troca de senha pendente e permissões (depois do Host e do CSRF)
  instalarAcesso(app, { usuarios, tempoReal }, { acessoLivreParaTestes: opcoes.acessoLivreParaTestes, nomeCookie })

  app.setErrorHandler((erro: FastifyError | ErroApi, req, reply) => {
    if (erro instanceof ErroApi) {
      const extra = erro.dados && typeof erro.dados === 'object' ? (erro.dados as Record<string, unknown>) : {}
      if (typeof extra.esperarSegundos === 'number') reply.header('Retry-After', String(extra.esperarSegundos))
      return reply.code(erro.status).send({ erro: erro.message, ...extra })
    }
    const status = (erro as FastifyError).statusCode ?? 500
    if (status >= 500) {
      req.log.error(erro)
      return reply.code(500).send({ erro: 'Erro interno do servidor. Tente novamente.' })
    }
    if (status === 413) return reply.code(413).send({ erro: 'Arquivo muito grande.' })
    return reply.code(status).send({ erro: 'Requisição inválida.' })
  })

  // Completa só para o próprio computador (os scripts usam 127.0.0.1); pela rede, só o essencial
  app.get('/api/saude', async (req) =>
    ehLoopback(ipDe(req))
      ? {
          ok: true,
          app: 'bc-calibracao',
          versao: VERSAO_APP,
          revisao: repo.revisao(),
          build: tempoReal.build,
          conectados: tempoReal.conectados,
          horario: new Date().toISOString(),
        }
      : { ok: true, app: 'bc-calibracao', versao: VERSAO_APP },
  )

  // Tempo real: avisa as telas abertas quando algo muda (SSE)
  app.get('/api/stream', (req, reply) => {
    reply.hijack()
    tempoReal.assinar(
      reply.raw,
      repo.revisao(),
      req.sessaoId && req.usuario ? { sessaoId: req.sessaoId, usuarioId: req.usuario.id } : null,
    )
    req.raw.on('close', () => reply.raw.end())
  })

  // Cópias de segurança (administrador)
  app.get('/api/backups', async () => ({ backups: backups.listar(), pasta: join(pastaDados, 'backups') }))
  app.post('/api/backups', async () => {
    const arquivo = await backups.copiar('manual')
    return { arquivo: arquivo.split(/[\\/]/).pop() }
  })
  app.get('/api/backups/:arquivo', async (req, reply) => {
    const nome = (req.params as { arquivo: string }).arquivo
    const info = backups.listar().find((b) => b.arquivo === nome)
    if (!info) throw new ErroApi(404, 'Cópia não encontrada.')
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${info.arquivo}"`)
      .send(readFileSync(join(pastaDados, 'backups', info.arquivo)))
  })

  await rotasUsuarios(app, { usuarios, tempoReal, nomeCookie })
  await rotasCadastros(app, ctx)
  await rotasGeral(app, ctx)
  await rotasCalibracoes(app, ctx, email)
  await rotasConsultas(app, ctx)
  await email.rotas(app)

  app.all('/api/*', async () => {
    throw new ErroApi(404, 'Rota não encontrada.')
  })

  // ---- Interface (arquivos compilados pelo Vite) ----
  const pastaEstatica = opcoes.pastaEstatica === undefined ? resolve('dist') : opcoes.pastaEstatica
  if (pastaEstatica && existsSync(join(pastaEstatica, 'index.html'))) {
    // O index.html referencia os arquivos com hash: o hash dele identifica a versão da interface
    tempoReal.build = createHash('sha1')
      .update(readFileSync(join(pastaEstatica, 'index.html')))
      .digest('hex')
      .slice(0, 12)
    await app.register(fastifyStatic, {
      root: pastaEstatica,
      setHeaders(reply, caminho) {
        // Arquivos com hash no nome nunca mudam; o index.html sempre é revalidado
        if (/[\\/]assets[\\/]/.test(caminho)) reply.header('Cache-Control', 'public, max-age=31536000, immutable')
        else reply.header('Cache-Control', 'no-cache')
      },
    })
  } else if (pastaEstatica !== null) {
    app.get('/', async (_req, reply) =>
      reply
        .type('text/html; charset=utf-8')
        .send(
          '<h1>BC Calibração</h1><p>A interface ainda não foi compilada. Rode <code>npm run build</code> e reinicie o servidor.</p>',
        ),
    )
  }

  let varredura: ReturnType<typeof setInterval> | null = null
  if (opcoes.tarefasEmSegundoPlano) {
    backups.iniciar()
    let ultimaLimpezaAuditoria = 0
    varredura = setInterval(() => {
      try {
        varrerSessoes(usuarios, tempoReal)
        if (Date.now() - ultimaLimpezaAuditoria >= 24 * 60 * 60 * 1000) {
          ultimaLimpezaAuditoria = Date.now()
          usuarios.limparAuditoriaAntiga()
        }
      } catch (e) {
        app.log.error(e, 'falha na varredura das sessões')
      }
    }, VARREDURA_MS)
    varredura.unref()
  }

  // As conexões de tempo real (SSE) ficam abertas para sempre: precisam ser encerradas ANTES
  // do servidor HTTP fechar, senão app.close() espera por elas indefinidamente.
  app.addHook('preClose', async () => {
    tempoReal.fechar()
  })
  app.addHook('onClose', async () => {
    if (varredura) clearInterval(varredura)
    backups.parar()
    try {
      // Consolida o WAL no arquivo principal para que o banco fique completo sozinho
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      /* banco já fechado ou em memória */
    }
    db.close()
  })

  return { app, ctx, usuarios }
}

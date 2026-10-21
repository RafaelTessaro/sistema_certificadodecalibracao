import { novoId } from '#shared/id.ts'
import type {
  AlteracaoUsuario,
  Balanca,
  BalancaInput,
  BalancaResumo,
  Calibracao,
  CalibracaoInput,
  CalibracaoResumo,
  Cliente,
  ClienteInput,
  ClienteResumo,
  Configuracoes,
  EntradaLogin,
  Envio,
  EstadoSessao,
  FolhaCampoImpressa,
  GrupoAuditoria,
  MensagemTempoReal,
  NovoUsuario,
  Padrao,
  PadraoInput,
  RegistroAuditoria,
  RespostaLogin,
  ResultadoSenha,
  ResumoPainel,
  StatusCalibracao,
  TrocaSenha,
  Usuario,
  UsuarioSessao,
  Vencimento,
} from '#shared/tipos.ts'

/** Configuração do envio de e-mail como a tela recebe (sem a senha). */
export interface ConfigEmail {
  servidor: string
  porta: number
  seguranca: 'SSL' | 'STARTTLS' | 'NENHUMA'
  usuario: string
  remetenteNome: string
  remetenteEmail: string
  senhaDefinida: boolean
  configurado: boolean
}

/** Para gravar: a senha em branco mantém a que já está no servidor. */
export type ConfigEmailEntrada = Omit<ConfigEmail, 'senhaDefinida' | 'configurado'> & { senha: string }

/** Pessoa da equipe (técnico ou signatário) para os campos da calibração. */
export interface MembroEquipe {
  id: string
  nome: string
  cargo: string
  signatario: boolean
  temAssinatura: boolean
}

export interface DetalheCliente {
  cliente: Cliente
  balancas: BalancaResumo[]
  calibracoes: CalibracaoResumo[]
  envios: Envio[]
}

export interface DetalheBalanca {
  balanca: Balanca
  cliente: Cliente | undefined
  calibracoes: CalibracaoResumo[]
}

export interface DetalheCalibracao {
  calibracao: Calibracao
  cliente: Cliente | undefined
  balanca: Balanca | undefined
  padroes: Padrao[]
  envios: Envio[]
  /** O que falta para emitir (vazio = pode emitir). */
  pendencias: string[]
  /** Revisões feitas a partir deste certificado (a que o substituiu e a que está em andamento). */
  revisoes: Array<{ id: string; numero: string; status: StatusCalibracao }>
  /** Folha de campo já impressa desta calibração (null = ainda não). */
  folhaCampo: FolhaCampoImpressa | null
}

export interface FiltroCalibracoesTela {
  status?: string
  clienteId?: string
  balancaId?: string
  busca?: string
  de?: string
  ate?: string
  pagina?: number
  limite?: number
}

export interface InfoBackup {
  arquivo: string
  tamanho: number
  criadoEm: string
}

/** Resposta pública da verificação de autenticidade (QR code). */
export interface VerificacaoCertificado {
  numero: string
  status: string
  dataCalibracao: string
  dataEmissao: string
  cliente: string
  balanca: string
  numeroSerie: string
  hashPdf: string
}

/** Erro devolvido pelo servidor (ou falta de conexão, com `status` 0). */
export class ErroApi extends Error {
  readonly status: number
  readonly dados: Record<string, unknown>

  constructor(status: number, mensagem: string, dados: Record<string, unknown> = {}) {
    super(mensagem)
    this.status = status
    this.dados = dados
  }

  get semConexao() {
    return this.status === 0
  }
}

const enc = encodeURIComponent

const SEM_CONEXAO = 'Sem conexão com o servidor. Verifique a rede e se o servidor está ligado.'
const SESSAO_TERMINOU = 'Sua sessão terminou. Entre de novo e repita a ação.'

/** O que a tela da sessão precisa saber de uma resposta: a sessão terminou ou falta criar a senha. */
export type ErroSessao = 'SEM_SESSAO' | 'TROCAR_SENHA'

let aoErroSessao: ((codigo: ErroSessao) => void) | null = null

/**
 * Quem é avisado quando uma requisição volta sem sessão (401) ou pedindo a troca da senha
 * temporária (403 TROCAR_SENHA). O store da sessão se registra aqui (assim não há import circular).
 */
export function definirAoErroSessao(fn: ((codigo: ErroSessao) => void) | null) {
  aoErroSessao = fn
}

/**
 * Erro de uma resposta do servidor. Antes, avisa a sessão quando é o caso: 401 fora de `/api/sessao`
 * (lá o 401 é "usuário ou senha incorretos") e 403 com o código TROCAR_SENHA.
 */
function erroDaResposta(status: number, caminho: string, json: Record<string, unknown>): ErroApi {
  if (status === 401 && !caminho.startsWith('/api/sessao')) {
    aoErroSessao?.('SEM_SESSAO')
    return new ErroApi(401, SESSAO_TERMINOU, json)
  }
  if (status === 403 && json.codigo === 'TROCAR_SENHA') aoErroSessao?.('TROCAR_SENHA')
  return new ErroApi(status, typeof json.erro === 'string' ? json.erro : `Erro ${status} no servidor.`, json)
}

async function requisitar<T>(metodo: string, caminho: string, corpo?: unknown, timeoutMs = 20_000): Promise<T> {
  const ctrl = new AbortController()
  // O tempo limite cobre a requisição inteira, inclusive a leitura da resposta
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    let resp: Response
    try {
      resp = await fetch(caminho, {
        method: metodo,
        // O servidor só aceita gravações com este cabeçalho (proteção contra sites externos)
        headers: { 'x-bc-calibracao': '1', ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
      })
    } catch {
      throw new ErroApi(0, SEM_CONEXAO)
    }
    if (resp.status === 204) return undefined as T
    let json: Record<string, unknown> = {}
    try {
      json = await resp.json()
    } catch {
      if (ctrl.signal.aborted) throw new ErroApi(0, SEM_CONEXAO)
      if (resp.ok) throw new ErroApi(resp.status, 'Resposta inválida do servidor.')
    }
    if (!resp.ok) throw erroDaResposta(resp.status, caminho, json)
    return json as T
  } finally {
    clearTimeout(timer)
  }
}

const consulta = (f: object) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v))
  const t = p.toString()
  return t ? `?${t}` : ''
}

export const api = {
  // ---- Clientes ----
  clientes: (f: { busca?: string; inativos?: boolean } = {}) =>
    requisitar<{ clientes: ClienteResumo[] }>('GET', `/api/clientes${consulta({ ...f, inativos: f.inativos ? 1 : '' })}`),
  cliente: (id: string) => requisitar<DetalheCliente>('GET', `/api/clientes/${enc(id)}`),
  criarCliente: (dados: ClienteInput) => requisitar<{ cliente: Cliente }>('POST', '/api/clientes', dados),
  atualizarCliente: (id: string, dados: ClienteInput, versao?: number) =>
    requisitar<{ cliente: Cliente }>('PUT', `/api/clientes/${enc(id)}`, { ...dados, versao }),
  excluirCliente: (id: string) => requisitar<void>('DELETE', `/api/clientes/${enc(id)}`),

  // ---- Balanças ----
  balancas: (f: { clienteId?: string; busca?: string; inativas?: boolean } = {}) =>
    requisitar<{ balancas: BalancaResumo[] }>('GET', `/api/balancas${consulta({ ...f, inativas: f.inativas ? 1 : '' })}`),
  balanca: (id: string) => requisitar<DetalheBalanca>('GET', `/api/balancas/${enc(id)}`),
  criarBalanca: (dados: BalancaInput) => requisitar<{ balanca: Balanca }>('POST', '/api/balancas', dados),
  atualizarBalanca: (id: string, dados: BalancaInput, versao?: number) =>
    requisitar<{ balanca: Balanca }>('PUT', `/api/balancas/${enc(id)}`, { ...dados, versao }),
  excluirBalanca: (id: string) => requisitar<void>('DELETE', `/api/balancas/${enc(id)}`),

  // ---- Padrões ----
  padroes: (inativos = false) => requisitar<{ padroes: Padrao[] }>('GET', `/api/padroes${inativos ? '?inativos=1' : ''}`),
  criarPadrao: (dados: PadraoInput) => requisitar<{ padrao: Padrao }>('POST', '/api/padroes', dados),
  atualizarPadrao: (id: string, dados: PadraoInput, versao?: number) =>
    requisitar<{ padrao: Padrao }>('PUT', `/api/padroes/${enc(id)}`, { ...dados, versao }),
  excluirPadrao: (id: string) => requisitar<void>('DELETE', `/api/padroes/${enc(id)}`),

  // ---- Calibrações e certificados ----
  calibracoes: (f: FiltroCalibracoesTela = {}) =>
    requisitar<{ itens: CalibracaoResumo[]; total: number }>('GET', `/api/calibracoes${consulta(f)}`),
  calibracao: (id: string) => requisitar<DetalheCalibracao>('GET', `/api/calibracoes/${enc(id)}`),
  criarCalibracao: (dados: Partial<CalibracaoInput>) => requisitar<{ calibracao: Calibracao }>('POST', '/api/calibracoes', dados),
  salvarCalibracao: (id: string, dados: CalibracaoInput, versao?: number) =>
    requisitar<{ calibracao: Calibracao; pendencias: string[] }>('PUT', `/api/calibracoes/${enc(id)}`, { ...dados, versao }),
  excluirCalibracao: (id: string) => requisitar<void>('DELETE', `/api/calibracoes/${enc(id)}`),
  mudarSituacao: (id: string, status: 'RASCUNHO' | 'REVISAO', versao?: number) =>
    requisitar<{ calibracao: Calibracao }>('POST', `/api/calibracoes/${enc(id)}/situacao`, { status, versao }),
  emitir: (id: string, dados: { signatarioId?: string; versao?: number }) =>
    requisitar<{ calibracao: Calibracao }>('POST', `/api/calibracoes/${enc(id)}/emitir`, dados, 60_000),
  cancelar: (id: string, motivo: string, versao?: number) =>
    requisitar<{ calibracao: Calibracao }>('POST', `/api/calibracoes/${enc(id)}/cancelar`, { motivo, versao }),
  revisar: (id: string, motivo: string) =>
    requisitar<{ calibracao: Calibracao }>('POST', `/api/calibracoes/${enc(id)}/revisar`, { motivo }),
  /** Nova calibração da mesma balança, com os mesmos pontos e padrões (sem as leituras). */
  recalibrar: (id: string) => requisitar<{ calibracao: Calibracao }>('POST', `/api/calibracoes/${enc(id)}/recalibrar`, {}),
  /** PDF do certificado emitido (ou a prévia de um rascunho, com marca d'água). */
  urlPdf: (id: string, baixar = false) => `/api/calibracoes/${enc(id)}/pdf${baixar ? '?baixar=1' : ''}`,
  /**
   * Folha de campo de uma calibração (o checklist impresso para preencher no cliente), com o plano do
   * rascunho; de uma emitida que teve folha, a reimpressão. A reimpressão mantém o nº FC e é igual à primeira
   * impressão. `nova`: folha nova, com nº novo e o plano atual (o plano mudou antes da visita); a chave nova a
   * cada chamada faz o navegador receber o mesmo nº se pedir o PDF de novo.
   */
  urlFolhaCampo: (id: string, o: { nova?: boolean } = {}) =>
    `/api/calibracoes/${enc(id)}/folha-campo${o.nova ? consulta({ nova: novoId() }) : ''}`,
  /** Liga à calibração a folha avulsa (em branco, do cliente ou da balança) preenchida no cliente, pelo nº dela. */
  vincularFolhaCampo: (id: string, numero: string) =>
    requisitar<{ folhaCampo: FolhaCampoImpressa }>('PUT', `/api/calibracoes/${enc(id)}/folha-campo`, { numero }),
  /**
   * Folha de campo sem calibração: da balança (com o plano da última calibração dela), só do cliente ou,
   * sem nada, em branco. A chave nova a cada chamada reserva um nº; se o navegador pedir o PDF de novo, o nº é o mesmo.
   */
  urlFolhaCampoAvulsa: (f: { balancaId?: string; clienteId?: string } = {}) =>
    `/api/folha-campo${consulta({ balancaId: f.balancaId, clienteId: f.clienteId, chave: novoId() })}`,
  /** Prévia do certificado com os dados ainda não salvos. */
  previa: async (id: string, dados: CalibracaoInput): Promise<Blob> => {
    const resp = await fetch(`/api/calibracoes/${enc(id)}/previa`, {
      method: 'POST',
      headers: { 'x-bc-calibracao': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
    if (!resp.ok) {
      let json: Record<string, unknown> = {}
      try {
        json = await resp.json()
      } catch {
        /* sem JSON */
      }
      throw erroDaResposta(resp.status, '/api/calibracoes/previa', json)
    }
    return resp.blob()
  },
  enviarCertificado: (id: string, dados: { para: string; assunto: string; texto: string }) =>
    requisitar<{ ok: true; para: string[] }>('POST', `/api/calibracoes/${enc(id)}/email`, dados, 120_000),
  enviarLembrete: (dados: { clienteId: string; balancas: string[]; para: string; assunto: string; texto: string }) =>
    requisitar<{ ok: true; para: string[] }>('POST', '/api/lembretes', dados, 120_000),
  verificar: (codigo: string) => requisitar<VerificacaoCertificado>('GET', `/api/verificar/${enc(codigo)}`),

  // ---- Geral ----
  config: () => requisitar<{ config: Configuracoes }>('GET', '/api/config'),
  salvarConfig: (config: Configuracoes) => requisitar<{ config: Configuracoes }>('PUT', '/api/config', config),
  painel: () => requisitar<{ painel: ResumoPainel }>('GET', '/api/painel'),
  vencimentos: (dias?: number | 'todos') =>
    requisitar<{ vencimentos: Vencimento[] }>('GET', `/api/vencimentos${dias !== undefined ? `?dias=${dias}` : ''}`),
  equipe: () => requisitar<{ equipe: MembroEquipe[] }>('GET', '/api/equipe'),

  configEmail: () => requisitar<ConfigEmail>('GET', '/api/email/config'),
  salvarConfigEmail: (c: ConfigEmailEntrada) => requisitar<ConfigEmail>('PUT', '/api/email/config', c),
  esquecerConfigEmail: () => requisitar<void>('DELETE', '/api/email/config'),
  testarEmail: (para: string) => requisitar<{ ok: true }>('POST', '/api/email/teste', { para }, 60_000),

  backups: () => requisitar<{ backups: InfoBackup[]; pasta: string }>('GET', '/api/backups'),
  copiaAgora: () => requisitar<{ arquivo: string }>('POST', '/api/backups', undefined, 120_000),
  urlBackup: (arquivo: string) => `/api/backups/${enc(arquivo)}`,

  // ---- Sessão e usuários ----
  /** Quem está usando este navegador. `uso` conta como atividade (renova o prazo da sessão). */
  sessao: (uso = false) => requisitar<EstadoSessao>('GET', uso ? '/api/sessao?uso=1' : '/api/sessao'),
  entrar: (e: EntradaLogin) => requisitar<RespostaLogin>('POST', '/api/sessao', e),
  primeiroAcesso: (e: { nome: string; login: string; senha: string; cargo: string; registro: string }) =>
    requisitar<RespostaLogin>('POST', '/api/primeiro-acesso', e),
  sair: () => requisitar<void>('DELETE', '/api/sessao'),
  trocarMinhaSenha: (e: TrocaSenha) => requisitar<{ usuario: UsuarioSessao }>('PUT', '/api/minha-senha', e),
  usuarios: () => requisitar<{ usuarios: Usuario[] }>('GET', '/api/usuarios'),
  /** `senha` vazia: o servidor gera uma temporária (volta em `senhaTemporaria`, uma única vez). */
  criarUsuario: (e: NovoUsuario) => requisitar<ResultadoSenha>('POST', '/api/usuarios', e),
  alterarUsuario: (id: string, e: AlteracaoUsuario) => requisitar<{ usuario: Usuario }>('PUT', `/api/usuarios/${enc(id)}`, e),
  /** Sem `senha`, o servidor gera uma temporária; com ela, a senha digitada também é temporária. */
  redefinirSenha: (id: string, senha?: string) =>
    requisitar<ResultadoSenha>('POST', `/api/usuarios/${enc(id)}/senha`, senha ? { senha } : {}),
  encerrarSessoes: (id: string) => requisitar<{ usuario: Usuario }>('DELETE', `/api/usuarios/${enc(id)}/sessoes`),
  excluirUsuario: (id: string) => requisitar<void>('DELETE', `/api/usuarios/${enc(id)}`),
  /** Registro de atividades, do mais novo para o mais antigo; `antes` é o id do último registro já mostrado. */
  auditoria: (f: FiltroAuditoria) =>
    requisitar<{ registros: RegistroAuditoria[] }>('GET', `/api/auditoria?${consultaAuditoria(f)}`),

  /** Requisição genérica (consultas de CNPJ/CEP). */
  get: <T>(caminho: string, timeoutMs?: number) => requisitar<T>('GET', caminho, undefined, timeoutMs),
  enviar: <T>(metodo: 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown, timeoutMs?: number) =>
    requisitar<T>(metodo, caminho, corpo, timeoutMs),
}

export interface FiltroAuditoria {
  antes?: number
  limite?: number
  grupo?: GrupoAuditoria
  usuarioId?: string
}

/** Parâmetros da consulta do registro de atividades: só os informados. */
export function consultaAuditoria(f: FiltroAuditoria): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') p.set(k, String(v))
  return p.toString()
}

/** Mensagem de boas-vindas da conexão em tempo real. */
export interface Ola {
  revisao: number
  /** Versão da interface servida agora (muda quando o servidor é atualizado). */
  build: string
  /** A conexão foi recusada: sem sessão válida (ou com a troca de senha pendente). O servidor já encerrou. */
  semSessao?: boolean
}

/** Conexão de tempo real aberta por `conectarTempoReal`. */
export interface ConexaoTempoReal {
  /** Encerra de vez (sai da tela). */
  fechar(): void
  /** Volta a conectar depois de uma recusa por falta de sessão (ex.: a pessoa entrou de novo). */
  reabrir(): void
}

/**
 * Recebe as alterações feitas por qualquer computador da rede (Server-Sent Events).
 * O navegador reconecta sozinho se a conexão cair.
 *
 * Cada conexão aberta ocupa uma das ~6 conexões que o navegador permite por servidor; por isso
 * abas que ficam escondidas por mais de 30 s fecham a sua e reabrem ao voltar (a mensagem de
 * boas-vindas traz a revisão, e a tela se atualiza se algo mudou enquanto estava escondida).
 *
 * Sem sessão, o servidor responde com um `ola` marcado `semSessao` e encerra: a conexão fica parada
 * (nem a volta da aba reabre) até `reabrir()`, e `aoSemSessao` decide o que fazer.
 */
export function conectarTempoReal(handlers: {
  aoConectar: (ola: Ola) => void
  aoReceber: (msg: MensagemTempoReal) => void
  aoDesconectar: () => void
  aoSemSessao: (ola: Ola) => void
}): ConexaoTempoReal {
  let fonte: EventSource | null = null
  let timerOculta: ReturnType<typeof setTimeout> | undefined
  /** Recusada por falta de sessão: só volta com `reabrir()`. */
  let parado = false
  let fechada = false

  const abrir = () => {
    clearTimeout(timerOculta)
    if (fonte || parado) return
    const f = new EventSource('/api/stream')
    fonte = f
    f.addEventListener('ola', (e) => {
      let ola: Ola
      try {
        const d = JSON.parse((e as MessageEvent).data)
        ola = { revisao: Number(d.revisao), build: String(d.build ?? ''), ...(d.semSessao === true ? { semSessao: true } : {}) }
      } catch {
        ola = { revisao: -1, build: '' }
      }
      if (ola.semSessao) {
        // Sem isso o navegador tentaria de novo a cada 3 s, sempre recusado
        f.close()
        if (fonte === f) fonte = null
        parado = true
        handlers.aoSemSessao(ola)
        return
      }
      handlers.aoConectar(ola)
    })
    f.onmessage = (e) => {
      try {
        handlers.aoReceber(JSON.parse(e.data))
      } catch {
        /* mensagem inválida: ignora */
      }
    }
    f.onerror = () => handlers.aoDesconectar()
  }

  const encerrar = () => {
    fonte?.close()
    fonte = null
  }

  const aoMudarVisibilidade = () => {
    if (document.hidden) {
      clearTimeout(timerOculta)
      timerOculta = setTimeout(encerrar, 30_000)
    } else abrir()
  }

  document.addEventListener('visibilitychange', aoMudarVisibilidade)
  abrir()
  // Aba aberta em segundo plano (Ctrl+clique): também libera a conexão se continuar escondida
  if (document.hidden) timerOculta = setTimeout(encerrar, 30_000)
  return {
    fechar() {
      fechada = true
      clearTimeout(timerOculta)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
      encerrar()
    },
    reabrir() {
      if (fechada) return
      parado = false
      // Escondida, a aba abre quando voltar a aparecer
      if (!document.hidden) abrir()
    },
  }
}

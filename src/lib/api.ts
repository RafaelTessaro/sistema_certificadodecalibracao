import { novoId } from '#shared/id.ts'
import type { FinalidadeArquivo } from '#shared/arquivos.ts'
import type { CertificadoDigitalPublico, RegistroCertificadoDigital } from '#shared/tipos.ts'
import type { PacoteCifrado } from './cifraPacote'
import type {
  AlteracaoUsuario,
  AnexoEmailDisponivel,
  ArquivoAnexo,
  Balanca,
  BalancaInput,
  BalancaResumo,
  Calibracao,
  CalibracaoInput,
  CalibracaoResumo,
  CertificadoDoPadrao,
  Cliente,
  ClienteInput,
  ClienteResumo,
  Configuracoes,
  EntradaLogin,
  Envio,
  EstadoSessao,
  FolhaCampoImpressa,
  FolhaCampoListada,
  FolhaNaoLigada,
  GrupoAuditoria,
  MensagemTempoReal,
  NovoUsuario,
  NumeroReservado,
  Padrao,
  PadraoInput,
  RegistroAuditoria,
  RespostaLogin,
  ResultadoEmail,
  ResultadoSenha,
  ResumoPainel,
  StatusCalibracao,
  TrocaSenha,
  Usuario,
  UsuarioSessao,
  Vencimento,
  VersaoCertificado,
  VersaoPop,
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

/** O certificado digital como o administrador vê: tudo e o histórico. */
export interface CertificadoDigitalAdmin {
  certificado: CertificadoDigitalPublico
  historico: RegistroCertificadoDigital[]
}

/**
 * GET /api/certificado-digital: quem cuida das configurações recebe tudo, o histórico e se está no próprio servidor;
 * os outros, só a situação, o titular e a validade.
 */
export interface RespostaCertificadoDigital {
  certificado: CertificadoDigitalPublico | Pick<CertificadoDigitalPublico, 'situacao' | 'titular' | 'validoAte'>
  historico?: RegistroCertificadoDigital[]
  /** A tela está aberta no próprio computador do servidor (localhost). */
  noServidor?: boolean
}

/** Pessoa da equipe (usuário ativo) para os campos da calibração: o técnico que executou e quem autoriza. */
export interface MembroEquipe {
  id: string
  nome: string
  cargo: string
  /** Marca de técnico: aparece em "Técnico que executou". */
  tecnico: boolean
  /** Marca de signatário: recebe o pedido de autorização (com a revisão por outra pessoa ligada). */
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
  /** O cliente como saiu no certificado (emitido: a cópia congelada na emissão; em andamento: o cadastro). */
  cliente: Cliente | undefined
  /**
   * Os e-mails do cadastro atual do cliente, para o "Para" do envio do certificado (não os da cópia congelada na
   * emissão). Ausente numa resposta de antes desta versão: vale `cliente`.
   */
  emailsCliente?: Pick<Cliente, 'email' | 'emailCertificados'> | null
  balanca: Balanca | undefined
  padroes: Padrao[]
  envios: Envio[]
  /** O que falta para emitir (vazio = pode emitir). */
  pendencias: string[]
  /**
   * Para conferir, sem impedir a emissão (ex.: a folha de campo saiu com outra revisão do POP que a da data da
   * calibração). Ausente numa resposta de antes desta versão.
   */
  avisos?: string[]
  /** Correções feitas a partir deste certificado (a que o substituiu e a que está em andamento). */
  revisoes: Array<{ id: string; numero: string; status: StatusCalibracao }>
  /**
   * Certificado corrigido com o mesmo nº: as versões, da primeira à atual (o histórico interno, com o motivo de cada
   * correção). Vazio ou ausente (resposta de antes desta versão) = nunca foi corrigido assim.
   */
  versoes?: VersaoCertificado[]
  /** Folha de campo já impressa desta calibração (null = ainda não). */
  folhaCampo: FolhaCampoImpressa | null
  /**
   * Em andamento: o nº do certificado reservado na impressão da folha de campo (sai na folha e na etiqueta;
   * o certificado é emitido com ele). null = ainda sem nº (é dado na emissão).
   */
  numeroReservado?: NumeroReservado | null
  /** Correção em andamento: o nº com que ela sai (o mesmo do certificado corrigido); null = não é correção. */
  numeroRevisao?: string | null
  /**
   * Em andamento: as folhas impressas para o cliente e ainda não ligadas a nenhuma calibração (a da mesma OS primeiro).
   * Ausente numa resposta de antes desta versão.
   */
  folhasNaoLigadas?: FolhaNaoLigada[]
  /** Certificado (arquivo) de cada padrão usado: o congelado na emissão, ou o do cadastro. */
  certificadosPadroes: CertificadoDoPadrao[]
  /**
   * POP: a revisão da emissão (emitido) ou a que o certificado vai citar, a usada na calibração (em andamento: a da
   * folha de campo, ou a que valia na data dela); null = nenhum.
   */
  pop: VersaoPop | null
}

/** GET /api/calibracoes/:id/anexos */
export interface AnexosEmail {
  anexos: AnexoEmailDisponivel[]
  /** Padrões usados sem o arquivo do certificado anexado. */
  semArquivo: CertificadoDoPadrao[]
  limites: { anexos: number; bytes: number }
}

/** PUT /api/calibracoes/:id/folha-campo */
export interface FolhaLigada {
  folhaCampo: FolhaCampoImpressa
  /** O nº de certificado da calibração depois da ligação. */
  numeroReservado: NumeroReservado | null
  /**
   * O nº de certificado impresso na folha ligada: é o da calibração (`usado`; o nº segue o papel) ou não pode
   * ser usado (`motivo`: revisão, nº já emitido ou não utilizado; a etiqueta precisa ser corrigida). null = a
   * folha não tinha nº (ou nada mudou).
   */
  numeroDaFolha: { numero: string; usado: boolean; motivo?: string } | null
  /**
   * A OS impressa na folha avulsa (a do cliente com a balança em branco): passou para a calibração, que não tinha OS
   * (`aplicada`; a `versao` dela subiu), ou a calibração ficou com a dela (`daCalibracao`). null = a folha não tinha OS,
   * ou é a mesma.
   */
  ordemServico?: { daFolha: string; aplicada: boolean; daCalibracao?: string } | null
  /**
   * A folha foi impressa antes da 1.0.5: a falta da pressão ficou como aviso e "Sugerir pontos" traz as cargas em que o
   * EMA muda, como ela (as marcas novas; a versão não sobe). null = nenhuma.
   */
  marcas?: { pressaoComoAviso?: boolean; cargasDoEmaNaFolha?: boolean; zeroComoAviso?: boolean } | null
  /**
   * Com a pressão como aviso (`marcas`) e ainda não registrada: o barômetro que o rascunho trazia saiu dos padrões
   * (`identificacoes`), e a calibração ficou com `padroesIds` (a `versao` dela subiu). null = nada saiu.
   */
  barometrosRetirados?: { identificacoes: string[]; padroesIds: string[] } | null
  /**
   * A folha ligada é da 1.0.5 e ficou no lugar de uma de antes: a dispensa que vinha dela saiu (false = saiu; a versão não
   * sobe). null = nada saiu.
   */
  marcasRetiradas?: { pressaoComoAviso?: boolean; cargasDoEmaNaFolha?: boolean; zeroComoAviso?: boolean } | null
  /** Sem a dispensa e sem a pressão registrada: o barômetro voltou aos padrões (a `versao` subiu). null = nada voltou. */
  barometrosDevolvidos?: { identificacoes: string[]; padroesIds: string[] } | null
  /**
   * A data prevista impressa na folha avulsa: passou para a calibração, que ainda tinha a data do dia em que foi criada
   * (`aplicada`, com a próxima que acompanha; a `versao` subiu), ou a calibração ficou com a dela (`daCalibracao`: a tela
   * avisa para conferir). null = a folha não tinha data prevista, ou é a mesma.
   */
  dataPrevista?: { daFolha: string; aplicada: boolean; daCalibracao?: string; proximaCalibracao?: string } | null
  /** As folhas do cliente que continuam sem ligação (`DetalheCalibracao.folhasNaoLigadas`). */
  folhasNaoLigadas?: FolhaNaoLigada[]
  /** A versão da calibração depois da ligação (a tela grava com ela). */
  versao?: number
}

/** GET /api/pop */
export interface DadosPop {
  atual: VersaoPop | null
  /** Da mais nova (a vigente) para a mais antiga. */
  versoes: VersaoPop[]
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
  /**
   * Versão anterior de um certificado corrigido com o mesmo nº: quando a versão que vale foi emitida (dd/mm/aaaa).
   * Ausente nos outros casos.
   */
  versaoAtualEmitidaEm?: string
  /**
   * Substituído por uma versão corrigida (ou uma revisão) que depois foi cancelada: nenhuma versão deste certificado
   * vale. Ausente nos outros casos.
   */
  substitutoCancelado?: boolean
  dataCalibracao: string
  dataEmissao: string
  cliente: string
  balanca: string
  numeroSerie: string
  hashPdf: string
  /**
   * Emitido e já assinado digitalmente com o certificado ICP-Brasil da empresa (1.0.7): o titular, o CNPJ (só 0-9 e A-Z) e
   * a validade do certificado que assinou (sem carimbo do tempo, depois dela o validador do ITI dá "Indeterminado").
   * Ausente nos outros (também no que aguarda a assinatura ou foi cancelado antes dela).
   */
  assinaturaDigital?: { titular: string; cnpj: string; validoAte?: string }
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

/** Quanto tempo o mesmo pedido de folha avulsa repetido conta como o mesmo clique (o clique duplo do Windows). */
export const JANELA_FOLHA_AVULSA_MS = 4000
let ultimaAvulsa: { assinatura: string; chave: string; em: number } | null = null

/**
 * A chave da folha avulsa (`/api/folha-campo?chave=…`): cada chave nova reserva um nº de folha e um de certificado. O
 * mesmo pedido (os mesmos dados) repetido em menos de `JANELA_FOLHA_AVULSA_MS` usa a mesma chave, e o servidor devolve a
 * mesma folha: o clique duplo não queima um nº de certificado (que só o administrador marca como não utilizado).
 */
export function chaveFolhaAvulsa(assinatura: string, agora = Date.now()): string {
  if (ultimaAvulsa?.assinatura === assinatura && agora - ultimaAvulsa.em < JANELA_FOLHA_AVULSA_MS) return ultimaAvulsa.chave
  ultimaAvulsa = { assinatura, chave: novoId(), em: agora }
  return ultimaAvulsa.chave
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
  /** `confirmarSerie`: cadastrar mesmo com o nº de série de outra balança do cliente (o servidor recusa sem ele). */
  criarBalanca: (dados: BalancaInput, confirmarSerie = false) =>
    requisitar<{ balanca: Balanca }>('POST', '/api/balancas', confirmarSerie ? { ...dados, confirmarSerie } : dados),
  atualizarBalanca: (id: string, dados: BalancaInput, versao?: number, confirmarSerie = false) =>
    requisitar<{ balanca: Balanca }>('PUT', `/api/balancas/${enc(id)}`, {
      ...dados,
      versao,
      ...(confirmarSerie ? { confirmarSerie } : {}),
    }),
  excluirBalanca: (id: string) => requisitar<void>('DELETE', `/api/balancas/${enc(id)}`),

  // ---- Padrões ----
  padroes: (inativos = false) => requisitar<{ padroes: Padrao[] }>('GET', `/api/padroes${inativos ? '?inativos=1' : ''}`),
  criarPadrao: (dados: PadraoInput) => requisitar<{ padrao: Padrao }>('POST', '/api/padroes', dados),
  /** `arquivoConfirmado`: o nº do certificado mudou e o arquivo não, mas é do mesmo certificado (só corrigiu o nº). */
  atualizarPadrao: (id: string, dados: PadraoInput, versao?: number, o: { arquivoConfirmado?: boolean } = {}) =>
    requisitar<{ padrao: Padrao }>('PUT', `/api/padroes/${enc(id)}`, {
      ...dados,
      versao,
      ...(o.arquivoConfirmado ? { arquivoConfirmado: true } : {}),
    }),
  excluirPadrao: (id: string) => requisitar<void>('DELETE', `/api/padroes/${enc(id)}`),

  // ---- Calibrações e certificados ----
  calibracoes: (f: FiltroCalibracoesTela = {}) =>
    requisitar<{ itens: CalibracaoResumo[]; total: number }>('GET', `/api/calibracoes${consulta(f)}`),
  calibracao: (id: string) => requisitar<DetalheCalibracao>('GET', `/api/calibracoes/${enc(id)}`),
  criarCalibracao: (dados: Partial<CalibracaoInput>) => requisitar<{ calibracao: Calibracao }>('POST', '/api/calibracoes', dados),
  salvarCalibracao: (id: string, dados: CalibracaoInput, versao?: number) =>
    requisitar<{ calibracao: Calibracao; pendencias: string[]; avisos?: string[]; folhasNaoLigadas?: FolhaNaoLigada[] }>(
      'PUT',
      `/api/calibracoes/${enc(id)}`,
      { ...dados, versao },
    ),
  excluirCalibracao: (id: string) => requisitar<void>('DELETE', `/api/calibracoes/${enc(id)}`),
  /** Volta para rascunho (retira o pedido de autorização). */
  voltarParaRascunho: (id: string, versao?: number) =>
    requisitar<{ calibracao: Calibracao }>('POST', `/api/calibracoes/${enc(id)}/situacao`, { status: 'RASCUNHO', versao }),
  /** Envia para a autorização do signatário escolhido (com a revisão por outra pessoa ligada). */
  pedirAutorizacao: (id: string, signatarioId: string, versao?: number) =>
    requisitar<{ calibracao: Calibracao }>('POST', `/api/calibracoes/${enc(id)}/autorizacao`, { signatarioId, versao }),
  /** O signatário devolve sem autorizar, com a nota do que precisa ser visto. */
  devolver: (id: string, nota: string, versao?: number) =>
    requisitar<{ calibracao: Calibracao }>('POST', `/api/calibracoes/${enc(id)}/devolver`, { nota, versao }),
  /** `aviso`: emitido, mas o PDF não pôde ser gravado na hora (é gerado ao abrir). */
  emitir: (id: string, dados: { versao?: number }) =>
    requisitar<{ calibracao: Calibracao; aviso?: string }>('POST', `/api/calibracoes/${enc(id)}/emitir`, dados, 60_000),
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
  /**
   * Liga à calibração a folha avulsa (em branco, do cliente ou da balança) preenchida no cliente, pelo nº dela.
   * Impressa para outra balança: 409 com `codigo: 'CONFIRMAR_FOLHA'`; `confirmar` liga assim mesmo.
   */
  vincularFolhaCampo: (id: string, numero: string, confirmar = false) =>
    requisitar<FolhaLigada>('PUT', `/api/calibracoes/${enc(id)}/folha-campo`, {
      numero,
      ...(confirmar ? { confirmar: true } : {}),
    }),
  /**
   * Folha de campo sem calibração: da balança (com o plano da última calibração dela), só do cliente ou,
   * sem nada, em branco. A chave nova a cada chamada reserva um nº (o mesmo pedido logo em seguida, o clique duplo, usa a
   * mesma: `chaveFolhaAvulsa`); se o navegador pedir o PDF de novo, o nº é o mesmo. `ordemServico` e `data`
   * (AAAA-MM-DD): a OS e a data prevista da visita, impressas na folha (a OS passa para a calibração sem OS a que a folha
   * for ligada).
   */
  urlFolhaCampoAvulsa: (f: { balancaId?: string; clienteId?: string; ordemServico?: string; data?: string } = {}) => {
    const dados = consulta({ balancaId: f.balancaId, clienteId: f.clienteId, os: f.ordemServico?.trim(), data: f.data })
    const chave = chaveFolhaAvulsa(dados)
    return `/api/folha-campo${dados ? `${dados}&` : '?'}chave=${enc(chave)}`
  },
  /** Reimpressão de uma folha já impressa, pelo nº: o PDF da primeira impressão (o mesmo nº de folha e de certificado). */
  urlReimprimirFolha: (numero: string) => `/api/folha-campo/${enc(numero)}`,
  /**
   * Todas as folhas impressas, da mais nova para a mais antiga (aba "Folhas de campo"): `situacao` NAO_LIGADAS, LIGADAS
   * ou NAO_USADAS ('' = todas), a busca (nº da folha ou do certificado, cliente, OS) e o dia da impressão.
   */
  folhasCampo: (f: { situacao?: string; busca?: string; de?: string; ate?: string; pagina?: number; limite?: number } = {}) =>
    requisitar<{ itens: FolhaCampoListada[]; total: number }>('GET', `/api/folhas-campo${consulta(f)}`),
  /** Nºs de certificado ainda sem certificado (reservados) e os não utilizados, do mais novo para o mais antigo. */
  numerosReservados: () => requisitar<{ numeros: NumeroReservado[] }>('GET', '/api/numeros-reservados'),
  /** O nº de uma folha avulsa que não vai ser usada passa a não utilizado (só o administrador). */
  descartarNumero: (id: number, motivo: string) =>
    requisitar<{ numero: NumeroReservado }>('POST', `/api/numeros-reservados/${id}/nao-utilizado`, { motivo }),
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
  /** O que pode ir no e-mail do certificado (o PDF e os certificados dos padrões). */
  anexosEmail: (id: string) => requisitar<AnexosEmail>('GET', `/api/calibracoes/${enc(id)}/anexos`, undefined, 60_000),
  /** `anexos`: os ids marcados (o PDF do certificado vai sempre). */
  enviarCertificado: (id: string, dados: { para: string; assunto: string; texto: string; anexos?: string[] }) =>
    requisitar<ResultadoEmail & { anexos: string[] }>('POST', `/api/calibracoes/${enc(id)}/email`, dados, 180_000),
  enviarLembrete: (dados: { clienteId: string; balancas: string[]; para: string; assunto: string; texto: string }) =>
    requisitar<ResultadoEmail>('POST', '/api/lembretes', dados, 120_000),
  verificar: (codigo: string) => requisitar<VerificacaoCertificado>('GET', `/api/verificar/${enc(codigo)}`),

  // ---- Arquivos guardados e POP ----
  /** Envia o arquivo puro (até 10 MB); o servidor confere o tipo pelo conteúdo e devolve a referência. */
  enviarArquivo: async (arquivo: Blob, nome: string, finalidade: FinalidadeArquivo): Promise<ArquivoAnexo> => {
    const caminho = `/api/arquivos${consulta({ finalidade, nome })}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 180_000)
    try {
      let resp: Response
      try {
        resp = await fetch(caminho, {
          method: 'POST',
          headers: { 'x-bc-calibracao': '1', 'Content-Type': 'application/octet-stream' },
          body: arquivo,
          signal: ctrl.signal,
          cache: 'no-store',
        })
      } catch {
        throw new ErroApi(0, SEM_CONEXAO)
      }
      let json: Record<string, unknown> = {}
      try {
        json = await resp.json()
      } catch {
        /* sem JSON */
      }
      if (!resp.ok) throw erroDaResposta(resp.status, caminho, json)
      return json.arquivo as ArquivoAnexo
    } finally {
      clearTimeout(timer)
    }
  },
  /**
   * Abre (PDF, imagem) ou baixa (Word, ou `baixar`) um arquivo guardado; `nome` troca o nome do arquivo baixado
   * (o servidor mantém a extensão do tipo do arquivo).
   */
  urlArquivo: (sha256: string, o: { baixar?: boolean; nome?: string } = {}) =>
    `/api/arquivos/${enc(sha256)}${consulta({ baixar: o.baixar ? 1 : '', nome: o.nome })}`,
  /** Link de um arquivo anexado, com o nome da referência (o mesmo conteúdo pode ter outro nome em outro cadastro). */
  urlAnexo: (ref: Pick<ArquivoAnexo, 'sha256' | 'nome'>, o: { baixar?: boolean } = {}) =>
    api.urlArquivo(ref.sha256, { ...o, nome: ref.nome }),
  pop: () => requisitar<DadosPop>('GET', '/api/pop'),
  registrarPop: (e: { codigo: string; revisao: string; data: string; arquivo: string; observacao: string }) =>
    requisitar<{ versao: VersaoPop }>('POST', '/api/pop', e),
  anexarArquivoPop: (id: number, arquivo: string) =>
    requisitar<{ versao: VersaoPop }>('PUT', `/api/pop/${id}/arquivo`, { arquivo }),

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
  testarEmail: (para: string) => requisitar<ResultadoEmail>('POST', '/api/email/teste', { para }, 60_000),

  // O certificado digital da empresa: o .pfx e as senhas só vão no pacote cifrado (cifraPacote.ts)
  certificadoDigital: () => requisitar<RespostaCertificadoDigital>('GET', '/api/certificado-digital'),
  chaveCertificadoDigital: () =>
    requisitar<{ id: string; publicKeyPem: string; expiraEm: string }>(
      'GET',
      '/api/certificado-digital/chave',
      undefined,
      30_000,
    ),
  conferirCertificadoDigital: (pacote: PacoteCifrado) =>
    requisitar<{ certificado: CertificadoDigitalPublico }>('POST', '/api/certificado-digital/conferir', pacote, 90_000),
  /** `trocado`: o instalado era outro certificado (o mesmo enviado de novo não é troca). */
  instalarCertificadoDigital: (pacote: PacoteCifrado) =>
    requisitar<CertificadoDigitalAdmin & { trocado: boolean }>('POST', '/api/certificado-digital', pacote, 120_000),
  removerCertificadoDigital: (pacote: PacoteCifrado) =>
    requisitar<CertificadoDigitalAdmin>('DELETE', '/api/certificado-digital', pacote, 60_000),

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

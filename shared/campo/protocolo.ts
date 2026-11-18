// Protocolo do app do celular (app BC Calibração, celular) com o servidor: o contrato que os dois lados importam. Puro.
//
// TRANSPORTE. HTTP simples na rede interna (porta 4850), corpo JSON, como o resto do sistema. Toda chamada do celular
// (menos as públicas) leva `Authorization: Bearer <token>`, `x-bc-calibracao: 1` (a mesma proteção contra CSRF das telas)
// e `x-bc-agora` (a hora do celular, ISO com o fuso): `cabecalhosDoCelular`. Sem cifra nem assinatura própria: o sistema
// inteiro já roda em HTTP na rede da empresa, com cookie de sessão; o celular segue o mesmo nível. Erros no formato da
// API de hoje: `{erro, codigo}` (`ErroCampo`, `CODIGOS_ERRO_CAMPO`). Prazos de conexão e de leitura em toda chamada
// (`PRAZOS_CAMPO`). Ninguém procura ninguém na rede: quem chama é sempre o celular.
//
// 1. PAREAMENTO (uma vez por celular). O administrador abre "Cadastrar celular" (Usuários → Celulares dos técnicos) e
//    escolhe o técnico; o servidor cria um código de 6 dígitos, de uso único, válido por 10 min (só na memória), e mostra
//    o QR `BCCAL1|http://192.168.0.10:4850|123456` (`formatarQrPareamento`), com o endereço e o código também em texto,
//    para digitar se a câmera falhar. O app lê o QR (`lerQrPareamento`) e chama POST /api/campo/parear
//    {codigo, aparelhoId, modelo, versaoApp} (pública, com limite de tentativas: código errado 5 vezes invalida o código;
//    por IP, o limite das entradas). Resposta: um token aleatório de 32 bytes (base64url), o técnico e o servidor. O
//    servidor guarda só o sha256 do token (`sha256Hex(token)`); o app guarda o token e o endereço. "Parear de novo" =
//    código novo para o mesmo `aparelhoId`: token novo (o antigo deixa de valer), folhas do celular intactas. Uma cópia
//    restaurada num servidor novo leva os sha256 dos tokens: os celulares continuam funcionando.
// 2. ENDEREÇO. O app usa sempre o endereço que veio no QR (o dono fixa o IP do servidor no roteador). Se não responder:
//    mensagem clara, e o técnico lê o QR de novo ou digita o endereço no Menu → "Endereço do servidor"
//    (`normalizarEnderecoServidor`); o app confere com GET /api/saude (pública) que ali está um BC Calibração com o mesmo
//    `id` do pareamento. Sem varredura da rede, sem mDNS, sem descoberta automática.
// 3. OLÁ (ao abrir o app, ao voltar para ele, em "Atualizar agora" e logo depois de finalizar uma folha). POST
//    /api/campo/ola {versaoApp, contrato, agora, estados: [{envioId, estado}]} → {agora (hora do servidor), tecnico,
//    servidor, envios, recolher, desconhecidos, recebeFolhas, appDisponivel?}. O servidor grava "visto às 07:55" e o IP do
//    celular, e o estado de cada folha informado (o computador mostra "Em preenchimento", "Finalizada"). `envios`: os
//    envios ENVIADA e NO_CELULAR deste técnico sem pedido de recolher (vazio com `recebeFolhas: false`: app antigo demais
//    para o contrato, ou técnico sem a marca de técnico). O celular baixa os que não tem.
// 4. BAIXAR E CONFIRMAR. GET /api/campo/envios/:envioId/pacote → PacoteCampo (o primeiro GET grava `baixado_em`; daí em
//    diante, recolher vira pedido). O app guarda o pacote (estado RECEBENDO), calcula o `pacoteSha256` e confirma com
//    POST .../recebida (ENVIADA → NO_CELULAR; repetir é inofensivo). Só com a resposta `NO_CELULAR` a folha fica NOVA e
//    pode ser começada; com `RECOLHIDA`, o app apaga o pacote (folha RETIRADA). Se o Wi-Fi cair entre o download e a
//    confirmação, a folha não pode ser começada, e o escritório nunca fica achando que ela não chegou enquanto o técnico
//    preenche.
// 5. PREENCHER (sem rede). O app grava a cada alteração. "Finalizar e colher assinaturas": `validarRegistro` (momento
//    FINALIZAR), `conteudoSha256` (canonico.ts), assinatura do técnico (PIN + desenho) e a do cliente (ou a
//    alternativa); a folha tranca (FINALIZADA). O app chama o olá logo depois (no laboratório, a entrega é na hora).
// 6. ENTREGAR (de volta à rede da empresa). PUT /api/campo/registros/:envioId com o RegistroCampo inteiro (até 3 MB). O
//    servidor SEMPRE grava, como chegou, e nunca responde 500 por causa do conteúdo: envio desconhecido → ORFAO; aparelho
//    revogado → APARELHO_REVOGADO; envio já recolhido → APOS_RECOLHER (o envio continua RECOLHIDA); `validarRegistro`
//    achou problemas → FORMATO (com a lista); hora do celular (`x-bc-agora`) a mais de 5 min da do servidor → RELOGIO;
//    piloto → PILOTO. Envio ativo → DEVOLVIDA. Resposta: o recibo {numero, envioId, sha256, recebidoEm, situacao,
//    marcas}. O mesmo registro reenviado (mesmo sha256) devolve o mesmo recibo: reenviar depois de a rede cair é seguro.
//    O app só apaga as leituras e as assinaturas quando o recibo confere (`reciboConfere`: mesmo nº, mesmo envio e o
//    mesmo sha256 que ele calculou); a folha fica ENTREGUE (só o resumo: FC, cliente e hora, por 7 dias). Uma folha
//    começada nunca sai do celular sem esse recibo. Celular revogado com o motivo "roubado": a entrega é recusada (401
//    DESCADASTRADO) e o app guarda a folha.
// 7. RECOLHER (05-ajustes-finais §6). No escritório: envio ENVIADA ainda não baixado → RECOLHIDA na hora; já baixado,
//    ou NO_CELULAR → vira pedido, que aparece em `recolher` no próximo olá; o administrador pode recolher à força
//    (RECOLHIDA na hora, de qualquer estado ativo), e o envioId também aparece em `recolher`. No celular, para cada
//    envioId de `recolher`: folha que ele não tem ou não começada (RECEBENDO, NOVA) → apaga e responde POST
//    .../recolhimento {resposta: 'APAGUEI'} (→ RECOLHIDA); folha começada (EM_PREENCHIMENTO, FINALIZADA, REABERTA) → NÃO
//    apaga, responde {resposta: 'JA_COMECEI'} (o escritório é avisado) e entrega quando puder. `recebida` de um envio com
//    pedido de recolher responde RECOLHIDA (a folha em RECEBENDO nunca foi começada). `desconhecidos` (envios que o
//    servidor não conhece, por exemplo depois de "Apagar os testes"): não começada → o app apaga sem avisar ninguém;
//    começada → entrega (o servidor grava como ORFAO, e a Lizi decide).
// 8. REVOGAR. O token deixa de valer para receber folhas: o olá, o pacote, a confirmação e o recolhimento respondem 401
//    DESCADASTRADO, e o app mostra "Este celular foi descadastrado no sistema." sem apagar nada. A entrega das folhas
//    começadas continua aceita (marcada APARELHO_REVOGADO), salvo o motivo "roubado". Token desconhecido (ou nenhum):
//    401 NAO_PAREADO ("Peça ao escritório para cadastrar de novo").
// 9. ATUALIZAÇÃO DO APP. `appDisponivel` no olá (o APK que veio no instalador do sistema, mais novo que o do celular):
//    o app mostra "Há uma versão nova" e abre a URL no navegador do Android, que instala por cima sem perder dados (o
//    botão fica bloqueado com folha começada não entregue). GET /api/campo/apk (o arquivo) e GET /api/campo/apk/info
//    (`InfoApk`) são públicos, para a primeira instalação pelo navegador do celular.

import type { Resultado } from '../dominio.ts'
import type {
  EstadoFolhaCelular,
  Instante,
  MarcaRegistro,
  PessoaCampo,
  ReciboCampo,
  RegistroCampo,
  SituacaoEnvio,
  SituacaoRegistro,
  TipoFolhaCampo,
} from './tipos.ts'
import { ESTADOS_FOLHA_CELULAR } from './tipos.ts'

// ---- Versões -------------------------------------------------------------------------------------------------------

/**
 * Versão do protocolo (independente da versão do app). Sobe só quando o pacote ou as rotas mudam de um jeito que o app
 * antigo não entende; o servidor aceita o contrato atual e o anterior para mandar folhas novas. A ENTREGA de um registro
 * é aceita sempre, de qualquer contrato (o servidor grava e marca FORMATO se não entender).
 */
export const CONTRATO_CAMPO = 1
/** Contrato mais antigo que ainda recebe folhas novas. */
export const CONTRATO_CAMPO_MINIMO = 1
/** Formato do registro (`RegistroCampo.formato`). */
export const FORMATO_REGISTRO = 1
/** Formato do pacote (`PacoteCampo.formato`). */
export const FORMATO_PACOTE = 1

// ---- Endereço, rotas e cabeçalhos ----------------------------------------------------------------------------------

export const PORTA_SERVIDOR = 4850

/**
 * Regra de acesso de cada rota (o servidor as classifica em server/acesso.ts): `publico`; `celular` = token de um
 * celular cadastrado e não revogado, de um técnico ativo (receber folhas e mudar estados); `celular-entrega` = token de
 * um celular cadastrado, mesmo revogado (salvo "roubado") ou de técnico desativado (só entregar). Cookie de sessão não
 * vale nas rotas do celular, e o token do celular não vale fora delas.
 */
export type RegraCampo = 'publico' | 'celular' | 'celular-entrega'

/** As rotas do celular, com o método e o caminho no formato do Fastify (`:envioId`). */
export const ROTAS_CAMPO = {
  parear: { metodo: 'POST', caminho: '/api/campo/parear', regra: 'publico' },
  ola: { metodo: 'POST', caminho: '/api/campo/ola', regra: 'celular' },
  pacote: { metodo: 'GET', caminho: '/api/campo/envios/:envioId/pacote', regra: 'celular' },
  recebida: { metodo: 'POST', caminho: '/api/campo/envios/:envioId/recebida', regra: 'celular' },
  recolhimento: { metodo: 'POST', caminho: '/api/campo/envios/:envioId/recolhimento', regra: 'celular' },
  registro: { metodo: 'PUT', caminho: '/api/campo/registros/:envioId', regra: 'celular-entrega' },
  apk: { metodo: 'GET', caminho: '/api/campo/apk', regra: 'publico' },
  apkInfo: { metodo: 'GET', caminho: '/api/campo/apk/info', regra: 'publico' },
} as const satisfies Record<string, { metodo: 'GET' | 'POST' | 'PUT'; caminho: string; regra: RegraCampo }>
export type RotaCampo = keyof typeof ROTAS_CAMPO

/** A identidade do servidor (já existe, pública): o app confere `app` e `id` quando o técnico digita o endereço. */
export const ROTA_SAUDE = '/api/saude'
export interface RespostaSaude {
  ok: boolean
  app: string
  versao: string
  nome: string
  /** Id da instalação (o mesmo de `RespostaParear.servidor.id`). */
  id: string
  instancia: string
}
/** Valor de `RespostaSaude.app` num servidor do BC Calibração. */
export const APP_DO_SERVIDOR = 'bc-calibracao'

/** O caminho de uma rota, com o `envioId` no lugar de `:envioId` (o app usa; o servidor registra `ROTAS_CAMPO[x].caminho`). */
export function caminhoCampo(rota: RotaCampo, envioId?: string): string {
  const { caminho } = ROTAS_CAMPO[rota]
  if (!caminho.includes(':envioId')) return caminho
  if (!envioId || !envioIdValido(envioId)) throw new Error(`Rota ${rota}: envioId inválido.`)
  return caminho.replace(':envioId', encodeURIComponent(envioId))
}

/** URL completa: endereço do servidor (normalizado, sem barra no fim) + caminho. */
export function urlCampo(endereco: string, caminho: string): string {
  return `${endereco.replace(/\/+$/, '')}${caminho.startsWith('/') ? caminho : `/${caminho}`}`
}

/** Cabeçalhos (em minúsculas, como o Node os entrega). */
export const CABECALHOS_CAMPO = {
  autorizacao: 'authorization',
  csrf: 'x-bc-calibracao',
  /** A hora do celular (ISO com o fuso) em toda chamada: o servidor compara na entrega (marca RELOGIO). */
  agora: 'x-bc-agora',
} as const
export const VALOR_CSRF = '1'

/** Os cabeçalhos de toda chamada autenticada do celular (o transporte acrescenta o Content-Type quando há corpo). */
export function cabecalhosDoCelular(token: string, agora: Instante): Record<string, string> {
  return {
    [CABECALHOS_CAMPO.autorizacao]: `Bearer ${token}`,
    [CABECALHOS_CAMPO.csrf]: VALOR_CSRF,
    [CABECALHOS_CAMPO.agora]: agora,
  }
}

/**
 * Os cabeçalhos das chamadas sem token: o POST /api/campo/parear (público, mas o servidor pede o cabeçalho contra CSRF em
 * todo pedido que não é GET) e o GET /api/saude.
 */
export function cabecalhosSemToken(agora: Instante): Record<string, string> {
  return { [CABECALHOS_CAMPO.csrf]: VALOR_CSRF, [CABECALHOS_CAMPO.agora]: agora }
}

/** O token do cabeçalho Authorization ("Bearer <token>"); '' se faltar ou não tiver o formato. */
export function tokenDoCabecalho(valor: unknown): string {
  if (typeof valor !== 'string') return ''
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(valor)
  return m && tokenValido(m[1]) ? m[1] : ''
}

// ---- Identificadores e credenciais ---------------------------------------------------------------------------------

/** Bytes aleatórios do token do celular (base64url sem "=": 43 caracteres). */
export const BYTES_TOKEN = 32
export const REGEX_TOKEN = /^[A-Za-z0-9_-]{43}$/
export const tokenValido = (t: unknown): t is string => typeof t === 'string' && REGEX_TOKEN.test(t)

/** Código de pareamento: 6 dígitos, uso único, 10 min, 5 erros invalidam. */
export const DIGITOS_CODIGO = 6
export const VALIDADE_CODIGO_MS = 10 * 60_000
export const TENTATIVAS_CODIGO = 5

/** "123 456", "123-456" → "123456"; '' se não forem 6 dígitos. */
export function normalizarCodigo(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/[\s.-]/g, '') : ''
  return /^\d{6}$/.test(s) ? s : ''
}

/** Id do aparelho: UUID gerado no celular na primeira abertura (`novoId`, shared/id.ts). */
export const REGEX_APARELHO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const aparelhoIdValido = (v: unknown): v is string => typeof v === 'string' && REGEX_APARELHO_ID.test(v)

/** Id do envio (criado pelo servidor; UUID): letras, números e hífens. */
export const envioIdValido = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v)

/** Versão do app: a do sistema ("1.1.0"), com "+n" numa correção só do app ("1.1.0+1"). */
export const REGEX_VERSAO_APP = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:\+\d{1,4})?$/
export const versaoAppValida = (v: unknown): v is string => typeof v === 'string' && REGEX_VERSAO_APP.test(v)

/**
 * `versionCode` do Android pela versão: a·1 000 000 + b·10 000 + c·100 + build ("1.1.0" → 1 010 000; "1.1.0+1" →
 * 1 010 001). null se a versão não tiver o formato.
 */
export function versionCode(versao: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\+(\d{1,2}))?$/.exec(versao.trim())
  if (!m || Number(m[2]) > 99 || Number(m[3]) > 99) return null
  return Number(m[1]) * 1_000_000 + Number(m[2]) * 10_000 + Number(m[3]) * 100 + Number(m[4] ?? 0)
}

/** A versão `a` é mais nova que `b`? (pelo `versionCode`; versão fora do formato não é mais nova). */
export function versaoMaisNova(a: string, b: string): boolean {
  const va = versionCode(a)
  const vb = versionCode(b)
  return va !== null && (vb === null || va > vb)
}

/** Texto curto de uma linha (modelo do aparelho, nomes): sem caracteres de controle, espaços simples, até `max`. */
export function textoDeUmaLinha(v: unknown, max: number): string {
  return (typeof v === 'string' ? v : '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// ---- Limites e prazos ----------------------------------------------------------------------------------------------

/** `bodyLimit` do PUT do registro no servidor (3 MB). */
export const LIMITE_CORPO_REGISTRO = 3 * 1024 * 1024
/**
 * Maior registro que `validarRegistro` aceita (JSON canônico, em bytes UTF-8): 2,5 MB, com folga para o corpo que o
 * HTTP nativo do Android escreve (ele escapa a "/" do base64 como "\/"). Assim o 413 do servidor nunca aparece para um
 * registro que o app já validou.
 */
export const LIMITE_REGISTRO_BYTES = 2_621_440
/** Cada assinatura (PNG) até 300 KB (bytes da imagem, sem o base64). O app reduz a imagem antes, se passar. */
export const LIMITE_PNG_BYTES = 300 * 1024
/** Diferença entre a hora do celular e a do servidor acima da qual o registro ganha a marca RELOGIO. */
export const LIMITE_RELOGIO_MS = 5 * 60_000
/** Corpo das outras rotas do celular (parear, olá, confirmar, recolhimento). */
export const LIMITE_CORPO_PEDIDO = 256 * 1024

/** Prazos de conexão e de leitura (ms) de cada chamada: o transporte do app não aceita chamada sem prazo. */
export interface PrazoCampo {
  conectarMs: number
  lerMs: number
}
export const PRAZOS_CAMPO: Record<
  'saude' | 'parear' | 'ola' | 'pacote' | 'recebida' | 'recolhimento' | 'registro' | 'apkInfo',
  PrazoCampo
> = {
  saude: { conectarMs: 3_000, lerMs: 5_000 },
  parear: { conectarMs: 3_000, lerMs: 10_000 },
  ola: { conectarMs: 3_000, lerMs: 10_000 },
  pacote: { conectarMs: 3_000, lerMs: 20_000 },
  recebida: { conectarMs: 3_000, lerMs: 10_000 },
  recolhimento: { conectarMs: 3_000, lerMs: 10_000 },
  registro: { conectarMs: 3_000, lerMs: 60_000 },
  apkInfo: { conectarMs: 3_000, lerMs: 5_000 },
}

// ---- Pedidos e respostas -------------------------------------------------------------------------------------------

/** POST /api/campo/parear (pública). */
export interface PedidoParear {
  /** Os 6 dígitos do QR (ou digitados). */
  codigo: string
  aparelhoId: string
  /** "Samsung SM-A546E" (até 80 letras). */
  modelo: string
  versaoApp: string
}
export interface ServidorCampo {
  /** Id da instalação (o mesmo de GET /api/saude). */
  id: string
  /** Nome do computador do servidor. */
  nome: string
}
export interface RespostaParear {
  /** 32 bytes aleatórios em base64url (43 caracteres). O servidor guarda só o sha256. */
  token: string
  aparelhoId: string
  tecnico: PessoaCampo
  servidor: ServidorCampo
}

/** O estado de uma folha que o celular tem, no olá. */
export interface EstadoInformado {
  envioId: string
  estado: EstadoFolhaCelular
}
/** POST /api/campo/ola. */
export interface PedidoOla {
  versaoApp: string
  /** `CONTRATO_CAMPO` do app. */
  contrato: number
  /** Hora do celular (a mesma do cabeçalho `x-bc-agora`). */
  agora: Instante
  /** Todas as folhas que o celular tem (menos as ENTREGUE e RETIRADA, que já saíram). */
  estados: EstadoInformado[]
}
/** Um envio na lista do olá (o que "Minhas folhas" mostra antes de baixar). */
export interface ResumoEnvio {
  envioId: string
  /** FC-AAAA-NNNNN. */
  numero: string
  tipo: TipoFolhaCampo
  /** Nome do cliente ('' na folha em branco). */
  cliente: string
  /** Identificação curta da balança ("Plataforma · Toledo 2096 · TAG BP-01"; '' sem balança cadastrada). */
  balanca: string
  /** AAAA-MM-DD ou ''. */
  dataPrevista: string
  situacao: SituacaoEnvio
  piloto: boolean
  /** ISO. */
  enviadaEm: string
}
/** Por que o celular não recebe folhas novas (o resto continua: entregar, recolher). */
export type MotivoSemFolhas = 'CONTRATO_ANTIGO' | 'SEM_MARCA_TECNICO'
export interface RespostaOla {
  /** Hora do servidor (ISO). O app avisa quando a do celular difere mais de 5 min (`diferencaRelogioMs`). */
  agora: string
  tecnico: PessoaCampo
  servidor: ServidorCampo
  /**
   * Envios ENVIADA e NO_CELULAR deste técnico, sem pedido de recolher: o celular baixa os que não tem (inclusive um
   * NO_CELULAR que ele perdeu, por exemplo depois de reinstalar o app: baixar e confirmar de novo é inofensivo).
   */
  envios: ResumoEnvio[]
  /**
   * EnvioIds a devolver (a regra no alto do arquivo, item 7): os envios deste técnico com pedido de recolher em aberto
   * (ENVIADA já baixado ou NO_CELULAR) e os informados em `estados` cujo envio já está RECOLHIDA (recolhido à força, ou
   * o celular não chegou a responder). Um envioId nunca aparece em `envios` e em `recolher` ao mesmo tempo.
   */
  recolher: string[]
  /** EnvioIds informados em `estados` que o servidor não conhece (nem em `envios`, nem em `recolher`). */
  desconhecidos: string[]
  /** false: o celular não recebe folhas novas agora (`envios` vazio), pelo `motivoSemFolhas`. */
  recebeFolhas: boolean
  motivoSemFolhas?: MotivoSemFolhas
  /** Há uma versão do app mais nova que a do celular no servidor. `url`: caminho no servidor (`ROTAS_CAMPO.apk`). */
  appDisponivel?: { versao: string; url: string }
}

/** GET /api/campo/envios/:envioId/pacote → `PacoteCampo` (tipos.ts). */

/** POST /api/campo/envios/:envioId/recebida: corpo vazio ou com o sha256 do pacote recebido (informativo). */
export interface PedidoRecebida {
  pacoteSha256?: string
}
/** NO_CELULAR (pode começar) ou RECOLHIDA (apagar o pacote). */
export interface RespostaRecebida {
  situacao: SituacaoEnvio
}

/** POST /api/campo/envios/:envioId/recolhimento. */
export type RespostaRecolhimento = 'APAGUEI' | 'JA_COMECEI'
export const RESPOSTAS_RECOLHIMENTO: readonly RespostaRecolhimento[] = ['APAGUEI', 'JA_COMECEI']
export interface PedidoRecolhimento {
  resposta: RespostaRecolhimento
}
export interface RespostaDoRecolhimento {
  situacao: SituacaoEnvio
}

/**
 * PUT /api/campo/registros/:envioId: corpo `RegistroCampo` → `ReciboCampo` (tipos.ts), 200. O `envioId` do caminho é o
 * que o servidor procura; o do corpo diferente vira um problema de formato (marca FORMATO), nunca uma recusa. Corpo que
 * não é um objeto JSON: 400 REGISTRO_ILEGIVEL (nada é gravado; o app guarda a folha). O sha256 do recibo é o do JSON
 * canônico do corpo recebido (`calcularSha256Registro`): o mesmo que o celular calculou, porque o registro não tem número
 * com casas decimais.
 */
export type PedidoRegistro = RegistroCampo
export type RespostaRegistro = ReciboCampo

/**
 * O recibo vale para apagar a folha do celular? Mesmo nº, mesmo envio e o mesmo sha256 que o celular calculou para o
 * registro que mandou (`calcularSha256Registro`). Qualquer outra coisa: o app tenta de novo mais tarde e não apaga nada.
 */
export function reciboConfere(recibo: unknown, registro: Pick<RegistroCampo, 'numero' | 'envioId'>, sha256: string): boolean {
  const r = recibo as Partial<ReciboCampo> | null
  return (
    !!r &&
    typeof r === 'object' &&
    r.numero === registro.numero &&
    r.envioId === registro.envioId &&
    typeof r.sha256 === 'string' &&
    r.sha256.toLowerCase() === sha256.toLowerCase() &&
    typeof r.recebidoEm === 'string' &&
    !!r.recebidoEm
  )
}

/** GET /api/campo/apk/info (pública). `disponivel: false` quando o instalador não trouxe o APK. */
export interface InfoApk {
  disponivel: boolean
  versao: string
  versionCode: number
  tamanho: number
  /** sha256 do arquivo (para conferir a cópia). */
  sha256: string
  /** "BC-Calibracao-1.1.0.apk". */
  nomeArquivo: string
}
/** Nome do arquivo do APK servido em GET /api/campo/apk. */
export const nomeArquivoApk = (versao: string) => `BC-Calibracao-${versao}.apk`

// ---- Erros ---------------------------------------------------------------------------------------------------------

/**
 * Códigos que o app trata, com o status HTTP. O corpo segue o formato da API de hoje: `{erro, codigo}` (mais
 * `esperarSegundos` no 429, com o Retry-After). O 413 do Fastify sai sem código: o app trata pelo status
 * (`classificarErroCampo`). Rede fora do ar ou prazo vencido não chegam aqui: são "servidor não encontrado".
 */
export const CODIGOS_ERRO_CAMPO = {
  /** O corpo do pedido não tem o formato (app antigo ou com defeito). */
  PEDIDO_INVALIDO: 400,
  /** PUT do registro com um corpo que não é um objeto JSON: o registro não foi gravado. */
  REGISTRO_ILEGIVEL: 400,
  /** Pareamento: código errado (`tentativasRestantes`). */
  CODIGO_INVALIDO: 400,
  /** Pareamento: código vencido, já usado ou invalidado por erros. */
  CODIGO_EXPIRADO: 400,
  /** Sem token, ou token que o servidor não conhece. */
  NAO_PAREADO: 401,
  /** Celular revogado (para receber folhas; na entrega, só com o motivo "roubado"). */
  DESCADASTRADO: 401,
  /** Envio que o servidor não conhece (ou de outro técnico). */
  ENVIO_DESCONHECIDO: 404,
  /** Pacote pedido de um envio recolhido. */
  ENVIO_RECOLHIDO: 409,
  /** Envio já confirmado por outro celular do mesmo técnico. */
  OUTRO_CELULAR: 409,
  /** Corpo acima de `LIMITE_CORPO_REGISTRO` (o Fastify responde 413 sem código). */
  REGISTRO_GRANDE: 413,
  /** Pareamento: tentativas demais (espera `esperarSegundos`). */
  MUITAS_TENTATIVAS: 429,
} as const
export type CodigoErroCampo = keyof typeof CODIGOS_ERRO_CAMPO

/** Corpo de erro (o mesmo formato das outras rotas da API). */
export interface ErroCampo {
  erro: string
  codigo?: CodigoErroCampo
  esperarSegundos?: number
  tentativasRestantes?: number
}

/** Frases que o app mostra para cada código (curtas, diretas). */
export const MENSAGENS_ERRO_CAMPO: Record<CodigoErroCampo | 'SERVIDOR', string> = {
  PEDIDO_INVALIDO: 'O servidor não entendeu o pedido. Atualize o app.',
  REGISTRO_ILEGIVEL: 'O servidor não conseguiu ler a folha. Ela continua guardada no celular. Avise o escritório.',
  CODIGO_INVALIDO: 'Código errado. Confira o código na tela do computador.',
  CODIGO_EXPIRADO: 'Este código venceu ou já foi usado. Peça um novo no computador.',
  NAO_PAREADO: 'Este celular não está cadastrado neste servidor. Peça ao escritório para cadastrar de novo.',
  DESCADASTRADO:
    'Este celular foi descadastrado no sistema. As folhas preenchidas continuam guardadas aqui e são entregues quando você estiver na empresa.',
  ENVIO_DESCONHECIDO: 'O servidor não conhece esta folha.',
  ENVIO_RECOLHIDO: 'Esta folha foi retirada pelo escritório.',
  OUTRO_CELULAR: 'Esta folha já está em outro celular.',
  REGISTRO_GRANDE: 'A folha ficou grande demais para enviar. Avise o escritório.',
  MUITAS_TENTATIVAS: 'Muitas tentativas. Espere um pouco e tente de novo.',
  SERVIDOR: 'O servidor não respondeu direito. Tente de novo daqui a pouco.',
}

/** Frase do app quando o servidor não responde no endereço gravado. */
export const MENSAGEM_SEM_SERVIDOR = (endereco: string) =>
  `Servidor não encontrado em ${endereco}. Confira se o celular está no Wi-Fi da empresa, leia o QR de novo ou digite o endereço no Menu.`

/** O código de uma resposta de erro: o do corpo, quando é conhecido; senão, pelo status (413 → REGISTRO_GRANDE). */
export function classificarErroCampo(status: number, corpo: unknown): CodigoErroCampo | 'SERVIDOR' {
  const codigo = corpo && typeof corpo === 'object' ? (corpo as { codigo?: unknown }).codigo : undefined
  if (typeof codigo === 'string' && codigo in CODIGOS_ERRO_CAMPO) return codigo as CodigoErroCampo
  if (status === 413) return 'REGISTRO_GRANDE'
  if (status === 401) return 'NAO_PAREADO'
  if (status === 404) return 'ENVIO_DESCONHECIDO'
  if (status === 429) return 'MUITAS_TENTATIVAS'
  if (status === 400) return 'PEDIDO_INVALIDO'
  return 'SERVIDOR'
}

// ---- Relógio -------------------------------------------------------------------------------------------------------

/** Diferença (ms, positiva = celular adiantado) entre a hora do celular e a do servidor; null se alguma for inválida. */
export function diferencaRelogioMs(celular: string, servidor: string): number | null {
  const a = Date.parse(celular)
  const b = Date.parse(servidor)
  return Number.isFinite(a) && Number.isFinite(b) ? a - b : null
}

/** A hora do celular passa do limite (marca RELOGIO; aviso no app)? Hora ilegível do celular conta como diferente. */
export function relogioDiferente(celular: string, servidor: string): boolean {
  const d = diferencaRelogioMs(celular, servidor)
  return d === null || Math.abs(d) > LIMITE_RELOGIO_MS
}

/** "Relógio do celular diferente (12 min)" — o selo da marca RELOGIO, com a diferença em minutos. */
export function textoRelogioDiferente(diferencaMs: number | null): string {
  if (diferencaMs === null) return 'Relógio do celular diferente'
  return `Relógio do celular diferente (${Math.round(Math.abs(diferencaMs) / 60_000)} min)`
}

// ---- QR do pareamento e endereço do servidor -----------------------------------------------------------------------

/** Começo do texto do QR (o "1" é a versão do formato). */
export const PREFIXO_QR = 'BCCAL1'

/**
 * Texto do QR do pareamento: "BCCAL1|http://192.168.0.10:4850|123456". Sem código ('' ), só o endereço
 * ("BCCAL1|http://192.168.0.10:4850"), para o celular já pareado que só precisa do endereço novo. Erro se o endereço ou
 * o código não tiverem o formato.
 */
export function formatarQrPareamento(d: { servidor: string; codigo: string }): string {
  const e = normalizarEnderecoServidor(d.servidor)
  if (!e.ok) throw new Error(e.erro)
  if (!d.codigo) return `${PREFIXO_QR}|${e.endereco}`
  const codigo = normalizarCodigo(d.codigo)
  if (!codigo) throw new Error('Código de pareamento inválido.')
  return `${PREFIXO_QR}|${e.endereco}|${codigo}`
}

/** Lê o texto de um QR do sistema: o endereço normalizado e o código ('' no QR só do endereço); null se não for. */
export function lerQrPareamento(texto: unknown): { servidor: string; codigo: string } | null {
  if (typeof texto !== 'string') return null
  const partes = texto.trim().split('|')
  if (partes[0] !== PREFIXO_QR || partes.length < 2 || partes.length > 3) return null
  const e = normalizarEnderecoServidor(partes[1])
  if (!e.ok) return null
  if (partes.length === 2) return { servidor: e.endereco, codigo: '' }
  const codigo = normalizarCodigo(partes[2])
  return codigo ? { servidor: e.endereco, codigo } : null
}

export type EnderecoNormalizado =
  | {
      ok: true
      /** "http://192.168.0.10:4850" (sem barra no fim). */
      endereco: string
      /** IPv4 de rede interna (10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, 127/8) ou nome; false = IP público. */
      redeLocal: boolean
    }
  | { ok: false; erro: string }

/**
 * O endereço do servidor como o técnico digita (Menu → "Endereço do servidor") ou como veio no QR: "192.168.0.10",
 * "192.168.0.10:4850", "http://192.168.0.10:4850/", "servidor-bc" → "http://192.168.0.10:4850" (sem porta: 4850).
 * Caminho depois do endereço (o que o navegador mostra, "/login") é ignorado. Só http: o sistema não usa https.
 */
export function normalizarEnderecoServidor(texto: unknown): EnderecoNormalizado {
  let s = typeof texto === 'string' ? texto.trim() : ''
  if (!s) return { ok: false, erro: 'Digite o endereço do servidor (por exemplo, 192.168.0.10).' }
  const esquema = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s)
  if (esquema) {
    if (esquema[1].toLowerCase() === 'https')
      return { ok: false, erro: 'Use http:// (o sistema não usa https na rede da empresa).' }
    if (esquema[1].toLowerCase() !== 'http') return { ok: false, erro: 'Endereço inválido. Use, por exemplo, 192.168.0.10.' }
    s = s.slice(esquema[0].length)
  }
  // Tira o caminho, a consulta e o fragmento
  s = s.split(/[/?#]/)[0]
  if (s.includes('@')) return { ok: false, erro: 'Endereço inválido. Use, por exemplo, 192.168.0.10.' }
  const m = /^([^:]+)(?::(\d{1,5}))?$/.exec(s)
  if (!m) return { ok: false, erro: 'Endereço inválido. Use, por exemplo, 192.168.0.10:4850.' }
  const host = m[1].toLowerCase()
  const porta = m[2] ? Number(m[2]) : PORTA_SERVIDOR
  if (!(porta >= 1 && porta <= 65535)) return { ok: false, erro: 'A porta precisa estar entre 1 e 65535 (a do sistema é 4850).' }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const o = ipv4.slice(1).map(Number)
    if (o.some((x) => x > 255) || ipv4.slice(1).some((x) => x.length > 1 && x.startsWith('0')))
      return { ok: false, erro: 'IP inválido. Confira os quatro números (cada um de 0 a 255).' }
    return { ok: true, endereco: `http://${o.join('.')}:${porta}`, redeLocal: ipDeRedeLocal(o) }
  }
  if (/^\d+(\.\d+)*$/.test(host)) return { ok: false, erro: 'IP inválido. Confira os quatro números (cada um de 0 a 255).' }
  const nome = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/
  if (!nome.test(host)) return { ok: false, erro: 'Endereço inválido. Use, por exemplo, 192.168.0.10.' }
  return { ok: true, endereco: `http://${host}:${porta}`, redeLocal: true }
}

/** IPv4 de rede interna (a mesma regra do servidor, `ipDaRedeLocal` em server/app.ts). */
function ipDeRedeLocal([a, b]: number[]): boolean {
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

// ---- Leitura dos pedidos no servidor (os dois lados usam as mesmas regras) ------------------------------------------

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** POST /api/campo/parear: confere o corpo. Com erros, o servidor responde 400 PEDIDO_INVALIDO (ou CODIGO_INVALIDO). */
export function lerPedidoParear(corpo: unknown): Resultado<PedidoParear> {
  const r = obj(corpo)
  const erros: string[] = []
  const codigo = normalizarCodigo(r.codigo)
  if (!codigo) erros.push('Informe o código de 6 dígitos que aparece no computador.')
  const aparelhoId = typeof r.aparelhoId === 'string' ? r.aparelhoId.trim().toLowerCase() : ''
  if (!aparelhoIdValido(aparelhoId)) erros.push('Identificação do aparelho inválida.')
  const versaoApp = typeof r.versaoApp === 'string' ? r.versaoApp.trim() : ''
  if (!versaoAppValida(versaoApp)) erros.push('Versão do app inválida.')
  const modelo = textoDeUmaLinha(r.modelo, 80)
  return { valor: { codigo, aparelhoId, modelo, versaoApp }, erros }
}

/** POST /api/campo/ola: confere o corpo (estados repetidos ou desconhecidos são ignorados; até 500 folhas). */
export function lerPedidoOla(corpo: unknown): Resultado<PedidoOla> {
  const r = obj(corpo)
  const erros: string[] = []
  const versaoApp = typeof r.versaoApp === 'string' ? r.versaoApp.trim() : ''
  if (!versaoAppValida(versaoApp)) erros.push('Versão do app inválida.')
  const contrato = typeof r.contrato === 'number' && Number.isSafeInteger(r.contrato) && r.contrato >= 1 ? r.contrato : 0
  if (!contrato) erros.push('Contrato do app inválido.')
  const agora = typeof r.agora === 'string' ? r.agora.trim().slice(0, 40) : ''
  const vistos = new Set<string>()
  const estados: EstadoInformado[] = []
  for (const x of Array.isArray(r.estados) ? r.estados.slice(0, 500) : []) {
    const e = obj(x)
    if (!envioIdValido(e.envioId) || vistos.has(e.envioId)) continue
    if (!ESTADOS_FOLHA_CELULAR.includes(e.estado as EstadoFolhaCelular)) continue
    vistos.add(e.envioId)
    estados.push({ envioId: e.envioId, estado: e.estado as EstadoFolhaCelular })
  }
  return { valor: { versaoApp, contrato, agora, estados }, erros }
}

/** POST .../recolhimento: confere o corpo. */
export function lerPedidoRecolhimento(corpo: unknown): Resultado<PedidoRecolhimento> {
  const resposta = obj(corpo).resposta
  return RESPOSTAS_RECOLHIMENTO.includes(resposta as RespostaRecolhimento)
    ? { valor: { resposta: resposta as RespostaRecolhimento }, erros: [] }
    : { valor: { resposta: 'APAGUEI' }, erros: ['Resposta do recolhimento inválida.'] }
}

/** Situação e marcas do recibo, para o servidor montar a resposta com os tipos certos. */
export function montarRecibo(d: {
  numero: string
  envioId: string
  sha256: string
  recebidoEm: string
  situacao: SituacaoRegistro
  marcas: MarcaRegistro[]
}): ReciboCampo {
  return {
    numero: d.numero,
    envioId: d.envioId,
    sha256: d.sha256.toLowerCase(),
    recebidoEm: d.recebidoEm,
    situacao: d.situacao,
    marcas: [...new Set(d.marcas)],
  }
}

// Regras dos usuários: login, política de senha, normalização das entradas e rótulos do registro de atividades.
// Usado pelo servidor (fonte da verdade), pela ferramenta local e pelas telas (validação imediata).

import type { Resultado } from './dominio.ts'
import { SENHAS_COMUNS } from './senhasComuns.ts'
import type { AcaoAuditoria, AlteracaoUsuario, GrupoAuditoria, NivelUsuario, NovoUsuario } from './tipos.ts'

export const SENHA_MIN = 8
export const SENHA_MAX = 128
export const USUARIOS_MAX = 50
export const NOME_USUARIO_MAX = 60

const NIVEIS: readonly NivelUsuario[] = ['ADMIN', 'COMUM']

type Bruto = Record<string, unknown>
const obj = (v: unknown): Bruto => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Bruto) : {})
const texto = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const umDe = <T extends string>(v: unknown, opcoes: readonly T[], padrao: T): T => (opcoes.includes(v as T) ? (v as T) : padrao)
/** Quantidade de caracteres como a pessoa conta (um emoji ou "é" composto valem 1). */
const tamanho = (s: string) => [...s].length
/** Minúsculo e sem acentos ("João" → "joao"). */
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// ---- Login -----------------------------------------------------------------------

export const LOGIN_MIN = 2
export const LOGIN_MAX = 40

/**
 * Login como é guardado e comparado: sem caracteres invisíveis, sem espaços nas pontas, com os espaços de
 * dentro reduzidos a um só e tudo minúsculo (NFC). "Rafael Tessaro" e "  rafael   TESSARO " são o mesmo login.
 */
export function normalizarLogin(v: unknown): string {
  return texto(v)
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .normalize('NFC')
}

/** Caracteres aceitos no login (o espaço já vem simples, entre as palavras). */
const CARACTERE_LOGIN = /^[\p{L}\p{M}\p{Nd}._@ -]$/u
/** O primeiro: letra ou número. */
const INICIO_LOGIN = /^[\p{L}\p{Nd}]/u

/**
 * `null` quando o login é aceito; senão, o motivo. A pessoa escolhe o próprio login: letras (com ou sem
 * acento), números, espaço, ponto, hífen, sublinhado e @, de 2 a 40 caracteres, começando por letra ou
 * número. Confere o login como ele fica gravado (depois do `normalizarLogin`).
 */
export function validarLogin(login: string): string | null {
  const l = normalizarLogin(login)
  if (!l) return 'Informe o usuário (o nome para entrar no sistema).'
  const n = tamanho(l)
  if (n < LOGIN_MIN) return `O usuário precisa ter pelo menos ${LOGIN_MIN} caracteres.`
  if (n > LOGIN_MAX) return `O usuário pode ter até ${LOGIN_MAX} caracteres.`
  if (!INICIO_LOGIN.test(l)) return 'O usuário precisa começar com uma letra ou um número.'
  const ruim = [...l].find((c) => !CARACTERE_LOGIN.test(c))
  if (ruim !== undefined)
    return `O usuário não pode ter “${ruim}”. Use letras (com ou sem acento), números, espaço, ponto, hífen, sublinhado ou @.`
  return null
}

// ---- Senha -----------------------------------------------------------------------

/** Teclas em sequência (a de números também vale terminando em 0, como no teclado). */
const SEQUENCIAS = ['01234567890', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl']
const SEQUENCIAS_TODAS = [...SEQUENCIAS, ...SEQUENCIAS.map((s) => [...s].reverse().join(''))]

/**
 * Política de senha (sem regras de composição: o que conta é o tamanho e não ser fácil de adivinhar).
 * Devolve o primeiro problema encontrado, explicando o motivo, ou `null` quando a senha é aceita.
 * `deOutraPessoa`: quem digita não é o dono (o administrador, ou o console do servidor); as mensagens
 * falam "da pessoa" em vez de "o seu".
 */
export function validarSenhaNova(
  senha: string,
  dono: { login: string; nome: string },
  opcoes: { deOutraPessoa?: boolean } = {},
): string | null {
  const outra = !!opcoes.deOutraPessoa
  const s = String(senha ?? '').normalize('NFC')
  const n = tamanho(s)
  if (n < SENHA_MIN || n > SENHA_MAX) return `A senha precisa ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`
  const minuscula = s.toLowerCase()
  if (SENHAS_COMUNS.has(minuscula)) return 'Essa senha é muito comum. Use uma frase de 3 ou 4 palavras.'
  const login = normalizarLogin(dono.login)
  if (tamanho(login) >= 3 && minuscula.includes(login))
    return outra ? 'A senha não pode conter o usuário (login) da pessoa.' : 'A senha não pode conter o seu nome de usuário.'
  const simples = semAcento(s)
  if (simples.includes('calibra')) return 'A senha não pode conter o nome do sistema.'
  const palavrasDoNome = semAcento(String(dono.nome ?? ''))
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => tamanho(p) >= 4)
  if (palavrasDoNome.some((p) => simples.includes(p)))
    return outra ? 'A senha não pode conter o nome da pessoa.' : 'A senha não pode conter o seu nome.'
  if (new Set(s).size === 1) return 'A senha não pode ser um caractere repetido.'
  if (SEQUENCIAS_TODAS.some((seq) => seq.includes(minuscula))) return 'A senha não pode ser uma sequência (como 1234567890).'
  return null
}

// ---- Entradas das rotas ----------------------------------------------------------

/** Nome de exibição: sem caracteres de controle e com os espaços repetidos reduzidos a um. */
function lerNome(v: unknown, erros: string[]): string {
  const nome = texto(v)
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!nome) erros.push('Informe o nome da pessoa.')
  else if (tamanho(nome) > NOME_USUARIO_MAX) erros.push(`O nome pode ter até ${NOME_USUARIO_MAX} caracteres.`)
  return nome
}

/** Cargo, registro profissional: textos curtos de uma linha. */
const linha = (v: unknown, max: number) =>
  texto(v)
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

/** Assinatura digitalizada: só imagem PNG ou JPEG em data URL, até ~220 KB. */
export const ASSINATURA_MAX = 300_000
function lerAssinatura(v: unknown, erros: string[]): string {
  const s = texto(v)
  if (!s) return ''
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s)) {
    erros.push('A assinatura precisa ser uma imagem PNG ou JPEG.')
    return ''
  }
  if (s.length > ASSINATURA_MAX) {
    erros.push('A imagem da assinatura é muito grande. Use uma imagem menor (até 200 KB).')
    return ''
  }
  return s
}

/** POST /api/usuarios (só o administrador: a senha é de outra pessoa). Senha vazia: o servidor gera uma temporária. */
export function normalizarNovoUsuario(e: unknown): Resultado<NovoUsuario> {
  const r = obj(e)
  const erros: string[] = []
  const nome = lerNome(r.nome, erros)
  const login = normalizarLogin(r.login)
  const erroLogin = validarLogin(login)
  if (erroLogin) erros.push(erroLogin)
  const nivel = umDe(r.nivel, NIVEIS, 'COMUM')
  const senha = typeof r.senha === 'string' ? r.senha : ''
  if (senha) {
    const erroSenha = validarSenhaNova(senha, { login, nome }, { deOutraPessoa: true })
    if (erroSenha) erros.push(erroSenha)
  }
  return {
    valor: {
      nome,
      login,
      nivel,
      senha,
      signatario: r.signatario === true,
      cargo: linha(r.cargo, 80),
      registro: linha(r.registro, 60),
    },
    erros,
  }
}

/** PUT /api/usuarios/:id: só os campos presentes no corpo. */
export function normalizarAlteracaoUsuario(e: unknown): Resultado<AlteracaoUsuario> {
  const r = obj(e)
  const erros: string[] = []
  const valor: AlteracaoUsuario = {}
  if ('nome' in r) valor.nome = lerNome(r.nome, erros)
  if ('login' in r) {
    // Mesma regra do cadastro: a pessoa pode trocar o login que o administrador escolheu
    const login = normalizarLogin(r.login)
    const erroLogin = validarLogin(login)
    if (erroLogin) erros.push(erroLogin)
    else valor.login = login
  }
  if ('nivel' in r) {
    if (NIVEIS.includes(r.nivel as NivelUsuario)) valor.nivel = r.nivel as NivelUsuario
    else erros.push('Nível inválido. Escolha Administrador ou Técnico.')
  }
  if ('ativo' in r) {
    if (typeof r.ativo === 'boolean') valor.ativo = r.ativo
    else erros.push('Situação inválida: informe se o usuário fica ativo ou desativado.')
  }
  if ('signatario' in r) {
    if (typeof r.signatario === 'boolean') valor.signatario = r.signatario
    else erros.push('Informe se o usuário é signatário.')
  }
  if ('cargo' in r) valor.cargo = linha(r.cargo, 80)
  if ('registro' in r) valor.registro = linha(r.registro, 60)
  if ('assinatura' in r) valor.assinatura = lerAssinatura(r.assinatura, erros)
  if ('versao' in r) {
    if (Number.isSafeInteger(r.versao) && (r.versao as number) >= 1) valor.versao = r.versao as number
    else erros.push('Versão do usuário inválida. Feche e abra de novo.')
  }
  return { valor, erros }
}

// ---- Registro de atividades --------------------------------------------------------

/** Detalhe do BLOQUEIO da troca da própria senha (o único bloqueio que não é de uma entrada). */
export const BLOQUEIO_TROCA_SENHA = 'senha atual errada várias vezes na troca de senha'

export const GRUPOS_AUDITORIA: Record<GrupoAuditoria, readonly AcaoAuditoria[]> = {
  acessos: ['LOGIN', 'LOGIN_FALHOU', 'BLOQUEIO', 'LOGOUT', 'ACESSO_NEGADO'],
  usuarios: [
    'SENHA_TROCADA',
    'SENHA_REDEFINIDA',
    'USUARIO_CRIADO',
    'USUARIO_ALTERADO',
    'USUARIO_EXCLUIDO',
    'SESSOES_ENCERRADAS',
    'FERRAMENTA_LOCAL',
  ],
  certificados: [
    'CERTIFICADO_EMITIDO',
    'CERTIFICADO_CANCELADO',
    'CERTIFICADO_ENVIADO',
    'NUMERO_RESERVADO',
    'NUMERO_NAO_UTILIZADO',
  ],
  dados: ['COPIA_RESTAURADA', 'BACKUP_BAIXADO', 'SISTEMA_ATUALIZADO'],
  alteracoes: ['ALTERACAO'],
}

/** Nome dos grupos no filtro da "Atividade recente". */
export const ROTULO_GRUPO_AUDITORIA: Record<GrupoAuditoria, string> = {
  acessos: 'Acessos',
  usuarios: 'Usuários',
  certificados: 'Certificados',
  dados: 'Cópias e dados',
  alteracoes: 'Alterações',
}

export const ROTULO_ACAO_AUDITORIA: Record<AcaoAuditoria, string> = {
  LOGIN: 'Entrou no sistema',
  LOGIN_FALHOU: 'Tentativa de entrada recusada',
  BLOQUEIO: 'Entrada bloqueada por muitas tentativas',
  LOGOUT: 'Saiu do sistema',
  ACESSO_NEGADO: 'Ação recusada por falta de permissão',
  SENHA_TROCADA: 'Trocou a própria senha',
  SENHA_REDEFINIDA: 'Redefiniu a senha de um usuário',
  USUARIO_CRIADO: 'Cadastrou um usuário',
  USUARIO_ALTERADO: 'Alterou um usuário',
  USUARIO_EXCLUIDO: 'Excluiu um usuário',
  SESSOES_ENCERRADAS: 'Encerrou as sessões de um usuário',
  FERRAMENTA_LOCAL: 'Ajuste de usuário no computador do servidor',
  COPIA_RESTAURADA: 'Restaurou uma cópia do banco de dados',
  BACKUP_BAIXADO: 'Baixou uma cópia de segurança',
  SISTEMA_ATUALIZADO: 'A atualização do sistema ajustou cadastros',
  CERTIFICADO_EMITIDO: 'Emitiu um certificado',
  CERTIFICADO_CANCELADO: 'Cancelou um certificado',
  CERTIFICADO_ENVIADO: 'Enviou um certificado por e-mail',
  NUMERO_RESERVADO: 'Reservou um nº de certificado',
  NUMERO_NAO_UTILIZADO: 'Nº de certificado não utilizado',
  ALTERACAO: 'Alterou os dados',
}

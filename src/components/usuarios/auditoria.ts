// Textos do registro de atividades ("Atividade recente" da página Usuários). Cada gravação chega
// como a chave da rota ('PUT /api/clientes/:id'); aqui ela vira uma frase.

import { BLOQUEIO_TROCA_SENHA, GRUPOS_AUDITORIA, ROTULO_ACAO_AUDITORIA } from '#shared/usuarios.ts'
import type { AcaoAuditoria, GrupoAuditoria, RegistroAuditoria } from '#shared/tipos.ts'

type Verbo = readonly [passado: string, infinitivo: string]

const CADASTRAR: Verbo = ['Cadastrou', 'cadastrar']
const ALTERAR: Verbo = ['Alterou', 'alterar']
const EXCLUIR: Verbo = ['Excluiu', 'excluir']
const APAGAR: Verbo = ['Apagou', 'apagar']
const ENVIAR: Verbo = ['Enviou', 'enviar']
const INICIAR: Verbo = ['Iniciou', 'iniciar']
const VER: Verbo = ['Viu', 'ver']

/** Onde a frase leva: a ficha do registro afetado. */
export type TipoLink = 'cliente' | 'balanca' | 'calibracao'

/** Rota → [verbo, complemento, link]. Rotas fora daqui aparecem como a chave. */
const ROTAS: Record<string, readonly [Verbo, string, TipoLink?]> = {
  'POST /api/clientes': [CADASTRAR, 'um cliente'],
  'PUT /api/clientes/:id': [ALTERAR, 'o cadastro do cliente', 'cliente'],
  'DELETE /api/clientes/:id': [EXCLUIR, 'um cliente'],
  'POST /api/balancas': [CADASTRAR, 'uma balança'],
  'PUT /api/balancas/:id': [ALTERAR, 'o cadastro da balança', 'balanca'],
  'DELETE /api/balancas/:id': [EXCLUIR, 'uma balança'],
  'POST /api/padroes': [CADASTRAR, 'um padrão'],
  'PUT /api/padroes/:id': [ALTERAR, 'um padrão'],
  'DELETE /api/padroes/:id': [EXCLUIR, 'um padrão'],
  'POST /api/calibracoes': [INICIAR, 'uma calibração'],
  'PUT /api/calibracoes/:id': [['Salvou', 'salvar'], 'uma calibração em andamento', 'calibracao'],
  'DELETE /api/calibracoes/:id': [EXCLUIR, 'uma calibração em andamento'],
  'POST /api/calibracoes/:id/situacao': [['Mudou', 'mudar'], 'a situação de uma calibração (rascunho ou revisão)', 'calibracao'],
  'POST /api/calibracoes/:id/emitir': [['Emitiu', 'emitir'], 'um certificado', 'calibracao'],
  'POST /api/calibracoes/:id/cancelar': [['Cancelou', 'cancelar'], 'um certificado', 'calibracao'],
  'POST /api/calibracoes/:id/revisar': [['Abriu', 'abrir'], 'uma revisão de certificado', 'calibracao'],
  'POST /api/calibracoes/:id/recalibrar': [INICIAR, 'uma nova calibração a partir de outra', 'calibracao'],
  'POST /api/calibracoes/:id/email': [ENVIAR, 'um certificado por e-mail', 'calibracao'],
  'POST /api/lembretes': [ENVIAR, 'um lembrete de calibração a um cliente'],
  'PUT /api/config': [ALTERAR, 'as configurações'],
  'PUT /api/email/config': [ALTERAR, 'a configuração do e-mail'],
  'DELETE /api/email/config': [APAGAR, 'a configuração do e-mail'],
  'POST /api/email/teste': [ENVIAR, 'um e-mail de teste'],
  'GET /api/backups': [VER, 'as cópias de segurança'],
  'POST /api/backups': [['Fez', 'fazer'], 'uma cópia de segurança agora'],
  'GET /api/backups/:arquivo': [['Baixou', 'baixar'], 'uma cópia de segurança'],
  'GET /api/usuarios': [VER, 'os usuários'],
  'POST /api/usuarios': [CADASTRAR, 'um usuário'],
  'PUT /api/usuarios/:id': [ALTERAR, 'um usuário'],
  'DELETE /api/usuarios/:id': [EXCLUIR, 'um usuário'],
  'POST /api/usuarios/:id/senha': [['Redefiniu', 'redefinir'], 'a senha de um usuário'],
  'DELETE /api/usuarios/:id/sessoes': [['Encerrou', 'encerrar'], 'as sessões de um usuário'],
  'GET /api/auditoria': [VER, 'o registro de atividades'],
}

/** Ações próprias dos certificados: o alvo é a calibração (a frase leva a ela). */
const ACOES_DO_CERTIFICADO = new Set<AcaoAuditoria>(['CERTIFICADO_EMITIDO', 'CERTIFICADO_CANCELADO', 'CERTIFICADO_ENVIADO'])

const GRUPO_DA_ACAO = new Map<AcaoAuditoria, GrupoAuditoria>(
  (Object.entries(GRUPOS_AUDITORIA) as Array<[GrupoAuditoria, readonly AcaoAuditoria[]]>).flatMap(([grupo, acoes]) =>
    acoes.map((a) => [a, grupo] as const),
  ),
)

/** Grupo de cada ação (cor e ícone na lista). */
export const grupoDaAcao = (acao: AcaoAuditoria): GrupoAuditoria => GRUPO_DA_ACAO.get(acao) ?? 'alteracoes'

export interface DescricaoRegistro {
  titulo: string
  /** Segunda linha (ex.: "nível: Técnico → Administrador"), ou ''. */
  detalhe: string
  /** Ficha do registro afetado. */
  link?: { tipo: TipoLink; id: string }
}

/** Frase de uma gravação ('PUT /api/clientes/:id' → "Alterou o cadastro do cliente"). */
function frasePassada(detalhe: string): { frase: string; tipo?: TipoLink } {
  const [chave] = detalhe.split(' | ')
  const rota = ROTAS[chave]
  if (!rota) return { frase: chave || ROTULO_ACAO_AUDITORIA.ALTERACAO }
  const [[passado], complemento, tipo] = rota
  return { frase: `${passado} ${complemento}`, tipo }
}

/**
 * Título, detalhe e link de um registro. `nomes` (id → nome) mostra quem foi o usuário afetado
 * nas ações sobre usuários.
 */
export function descreverRegistro(r: RegistroAuditoria, nomes?: ReadonlyMap<string, string>): DescricaoRegistro {
  if (r.acao === 'ALTERACAO') {
    const { frase, tipo } = frasePassada(r.detalhe)
    return { titulo: frase, detalhe: '', ...(tipo && r.alvo ? { link: { tipo, id: r.alvo } } : {}) }
  }
  const titulo = ROTULO_ACAO_AUDITORIA[r.acao] ?? r.acao
  if (r.acao === 'ACESSO_NEGADO') {
    const rota = ROTAS[r.detalhe.split(' | ')[0]]
    return { titulo, detalhe: rota ? `Tentou ${rota[0][1]} ${rota[1]}.` : r.detalhe }
  }
  if (ACOES_DO_CERTIFICADO.has(r.acao)) {
    return { titulo, detalhe: '', ...(r.alvo ? { link: { tipo: 'calibracao' as const, id: r.alvo } } : {}) }
  }
  // Na própria conta (trocar a própria senha) quem fez já aparece na linha de baixo. Na ferramenta do
  // servidor, a linha de baixo diz "No computador do servidor": a conta ajustada vem aqui
  const afetado =
    r.alvo && (r.alvo !== r.usuarioId || r.acao === 'FERRAMENTA_LOCAL') && grupoDaAcao(r.acao) === 'usuarios'
      ? nomes?.get(r.alvo)
      : undefined
  // A cópia baixada vem como a chave da rota: o detalhe não acrescenta nada
  const detalhe = r.acao === 'BACKUP_BAIXADO' ? '' : r.detalhe
  const partes = [afetado, detalhe].filter(Boolean)
  return { titulo, detalhe: partes.join(' · ') }
}

export interface AutorRegistro {
  texto: string
  /** Vai em fonte de código depois do texto; entre parênteses quando o texto termina com o nome. */
  login?: string
  entreParenteses?: boolean
}

/**
 * Linha de baixo de um registro: quem fez. Numa entrada recusada, o usuário é só o que alguém digitou
 * naquele computador (pode não ter sido a própria pessoa); na ferramenta do servidor, quem fez foi quem
 * estava nele (a conta ajustada vai no detalhe).
 */
export function autorDoRegistro(r: RegistroAuditoria, nomes: ReadonlyMap<string, string>): AutorRegistro {
  if (r.acao === 'FERRAMENTA_LOCAL' || r.acao === 'COPIA_RESTAURADA' || r.acao === 'SISTEMA_ATUALIZADO')
    return { texto: 'No computador do servidor' }
  const nome = nomes.get(r.usuarioId)
  if (r.acao === 'LOGIN_FALHOU' || (r.acao === 'BLOQUEIO' && r.detalhe !== BLOQUEIO_TROCA_SENHA)) {
    if (!r.login) return { texto: 'Usuário inexistente' }
    return nome
      ? { texto: `Tentativa com o usuário ${nome}`, login: r.login, entreParenteses: true }
      : { texto: 'Tentativa com o usuário', login: r.login }
  }
  if (nome) return { texto: nome, login: r.login, entreParenteses: true }
  if (r.login) return { texto: '', login: r.login }
  return { texto: '—' }
}

/** A linha de baixo como texto corrido (o que a tela mostra, sem o IP). */
export function textoDoAutor(a: AutorRegistro): string {
  if (!a.login) return a.texto
  return [a.texto, a.entreParenteses ? `(${a.login})` : a.login].filter(Boolean).join(' ')
}

/** Método da gravação ('DELETE', 'POST'…), para o ícone. */
export const metodoDoRegistro = (r: RegistroAuditoria) => (r.acao === 'ALTERACAO' ? r.detalhe.split(' ')[0] : '')

/** Endereço da ficha no sistema. */
export function enderecoDoLink(link: { tipo: TipoLink; id: string }): string {
  const id = encodeURIComponent(link.id)
  if (link.tipo === 'cliente') return `/clientes/${id}`
  if (link.tipo === 'balanca') return `/balancas/${id}`
  return `/calibracoes/${id}`
}

// Quem pode o quê: fonte única para o servidor (server/acesso.ts) e para as telas (usePode).
// Mudar uma decisão do dono = mudar uma linha aqui.
//
// Emitir (autorizar) certificados não depende do nível, e sim do usuário ser "signatário"
// (marcado pelo administrador em Usuários): ver `podeEmitir`.
import type { Calibracao, NivelUsuario, UsuarioSessao } from './tipos.ts'

export type Permissao =
  'excluirCliente' | 'excluirBalanca' | 'excluirPadrao' | 'cancelarCertificado' | 'configuracoes' | 'dadosEBackup' | 'usuarios'

const SO_ADMIN: readonly NivelUsuario[] = ['ADMIN']

export const PERMISSOES: Record<Permissao, readonly NivelUsuario[]> = {
  excluirCliente: SO_ADMIN,
  excluirBalanca: SO_ADMIN,
  excluirPadrao: SO_ADMIN,
  cancelarCertificado: SO_ADMIN,
  configuracoes: SO_ADMIN,
  dadosEBackup: SO_ADMIN,
  usuarios: SO_ADMIN,
}

/** Lista de todas as permissões, na ordem da tabela acima. */
export const LISTA_PERMISSOES = Object.keys(PERMISSOES) as Permissao[]

export const SEM_PERMISSAO: Record<Permissao, string> = {
  excluirCliente: 'Só o administrador exclui clientes. Para tirar da lista, desative o cliente.',
  excluirBalanca: 'Só o administrador exclui balanças. Para tirar da lista, desative a balança.',
  excluirPadrao: 'Só o administrador exclui padrões. Para tirar de uso, desative o padrão.',
  cancelarCertificado: 'Só o administrador cancela certificados emitidos.',
  configuracoes: 'Só o administrador altera as configurações.',
  dadosEBackup: 'Só o administrador cuida das cópias de segurança e dos dados.',
  usuarios: 'Só o administrador cuida dos usuários.',
}

export const ROTULO_PERMISSAO: Record<Permissao, string> = {
  excluirCliente: 'Excluir clientes',
  excluirBalanca: 'Excluir balanças',
  excluirPadrao: 'Excluir padrões',
  cancelarCertificado: 'Cancelar certificados emitidos',
  configuracoes: 'Configurações da empresa, do certificado e do e-mail',
  dadosEBackup: 'Cópias de segurança',
  usuarios: 'Usuários, signatários e registro de atividades',
}

export const NOME_NIVEL: Record<NivelUsuario, string> = { ADMIN: 'Administrador', COMUM: 'Técnico' }
export const RESUMO_NIVEL: Record<NivelUsuario, string> = {
  ADMIN: 'Acesso a tudo: configurações, usuários, cancelamento de certificados e cópias de segurança.',
  COMUM: 'Dia a dia: clientes, balanças, padrões e calibrações. Emite certificados se for signatário.',
}

export const SEM_PERMISSAO_EMITIR =
  'Só um signatário autoriza a emissão do certificado. Peça ao administrador para marcar você como signatário em Usuários.'

/** `true` quando o nível tem a permissão. Sem nível (ninguém entrou) ou sem permissão informada: `false`. */
export function pode(nivel: NivelUsuario | null | undefined, p: Permissao | undefined): boolean {
  return !!nivel && !!p && Object.hasOwn(PERMISSOES, p) && PERMISSOES[p].includes(nivel)
}

/** Pode autorizar (emitir) certificados. */
export function podeEmitir(usuario: Pick<UsuarioSessao, 'signatario'> | null | undefined): boolean {
  return !!usuario?.signatario
}

/**
 * Com a revisão por outra pessoa ligada (Configurações → Certificado, `exigirRevisor`): por que este usuário não pode
 * emitir o certificado da calibração, ou null. Não emite o técnico que executou, nem quem indicou outra pessoa como
 * técnico (sem isso, bastava trocar o técnico para emitir a própria calibração com o nome de um colega). O revisor que
 * só corrige a digitação emite. O servidor (`emitirCertificado`) e a tela usam esta.
 */
export function impedimentoDoRevisor(
  exigirRevisor: boolean,
  k: Pick<Calibracao, 'tecnicoId' | 'tecnicoDefinidoPorId'>,
  usuarioId: string | null | undefined,
): string | null {
  if (!exigirRevisor || !usuarioId) return null
  if (k.tecnicoId === usuarioId)
    return 'A empresa exige que outra pessoa revise e autorize: o técnico que executou não pode emitir o próprio certificado.'
  if (k.tecnicoDefinidoPorId === usuarioId)
    return 'A empresa exige que outra pessoa revise e autorize: quem indicou o técnico desta calibração não pode emitir o certificado.'
  return null
}

// Quem pode o quê: fonte única para o servidor (server/acesso.ts) e para as telas (usePode).
// Mudar uma decisão do dono = mudar uma linha aqui.
//
// Dois níveis: o operador faz o dia a dia (também emitir, imprimir e enviar certificados) e o administrador, além disso,
// o que está na tabela abaixo. À parte do nível, o administrador marca em Usuários quem é técnico (executa as
// calibrações: `tecnicosParaEscolher`) e quem é signatário (autoriza os certificados quando a revisão por outra pessoa
// está ligada: `impedimentoParaEmitir`).
import type { Calibracao, NivelUsuario, Usuario, UsuarioSessao } from './tipos.ts'

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
  usuarios: 'Usuários (técnicos e signatários) e registro de atividades',
}

export const NOME_NIVEL: Record<NivelUsuario, string> = { ADMIN: 'Administrador', COMUM: 'Operador' }
export const RESUMO_NIVEL: Record<NivelUsuario, string> = {
  ADMIN: 'Tudo o que o operador faz e mais: configurações, usuários, cópias de segurança, cancelar certificados e excluir cadastros.',
  COMUM: 'O dia a dia: clientes, balanças, padrões, calibrações e a emissão, a impressão e o envio dos certificados.',
}

/** Com a revisão por outra pessoa ligada, quem não é signatário não autoriza: envia para um signatário. */
export const SEM_PERMISSAO_EMITIR =
  'A empresa exige a revisão por outra pessoa: só um signatário autoriza a emissão. Escolha o signatário e envie para a autorização dele.'

/** `true` quando o nível tem a permissão. Sem nível (ninguém entrou) ou sem permissão informada: `false`. */
export function pode(nivel: NivelUsuario | null | undefined, p: Permissao | undefined): boolean {
  return !!nivel && !!p && Object.hasOwn(PERMISSOES, p) && PERMISSOES[p].includes(nivel)
}

/** Pode autorizar certificados (com a revisão por outra pessoa ligada): a marca de signatário, em qualquer nível. */
export function podeAutorizar(usuario: Pick<UsuarioSessao, 'signatario'> | null | undefined): boolean {
  return !!usuario?.signatario
}

/** O técnico que executou não autoriza a própria calibração. */
export const TECNICO_NAO_AUTORIZA = 'O técnico que executou não autoriza o próprio certificado. Escolha outro signatário.'

/**
 * Por que este usuário não pode emitir o certificado da calibração agora, ou null. O servidor (`emitirCertificado`) e a
 * tela usam esta.
 * - Revisão por outra pessoa desligada (`exigirRevisor`): qualquer pessoa que entrou no sistema emite (o certificado sai
 *   só com a assinatura do técnico).
 * - Ligada: emitir é autorizar, com a assinatura de quem autoriza. Só um signatário que não seja o técnico que executou;
 *   com o pedido de autorização (`Calibracao.autorizacao`), só o signatário escolhido (ninguém põe a assinatura de outra
 *   pessoa sem ela agir). A enviada para revisão antes da 1.0.5 (sem o pedido), qualquer signatário que não seja o
 *   técnico; o rascunho, o signatário que escolhe a si mesmo (autoriza direto).
 */
export function impedimentoParaEmitir(
  exigirRevisor: boolean,
  k: Pick<Calibracao, 'tecnicoId' | 'status' | 'autorizacao'>,
  usuario: Pick<UsuarioSessao, 'id' | 'signatario'> | null | undefined,
): string | null {
  if (!exigirRevisor) return null
  if (!usuario?.signatario) return SEM_PERMISSAO_EMITIR
  if (k.tecnicoId && k.tecnicoId === usuario.id) return TECNICO_NAO_AUTORIZA
  const pedido = k.status === 'REVISAO' ? k.autorizacao : null
  if (pedido && pedido.signatarioId !== usuario.id)
    return `Esta calibração foi enviada para a autorização de ${pedido.signatarioNome}: só essa pessoa pode autorizar.`
  return null
}

/**
 * Pode devolver a calibração enviada para autorização, sem autorizar (com a nota do que ver): quem poderia autorizá-la
 * com a revisão por outra pessoa ligada (`impedimentoParaEmitir`).
 */
export function podeDevolver(
  k: Pick<Calibracao, 'tecnicoId' | 'status' | 'autorizacao'>,
  usuario: Pick<UsuarioSessao, 'id' | 'signatario'> | null | undefined,
): boolean {
  return k.status === 'REVISAO' && !impedimentoParaEmitir(true, k, usuario)
}

type Membro = Pick<Usuario, 'id' | 'nome'> & Partial<Pick<Usuario, 'tecnico' | 'signatario' | 'ativo'>>

/**
 * Para "Técnico que executou" (a lista é a dos usuários ativos): quem tem a marca de técnico e, se a calibração já tem
 * outra pessoa (sem a marca hoje, ou de antes dela), ela também, no lugar dela (continua valendo).
 */
export function tecnicosParaEscolher<T extends Membro>(equipe: readonly T[], tecnicoId: string): T[] {
  return equipe.filter((u) => u.tecnico || (!!tecnicoId && u.id === tecnicoId))
}

/** Quem pode ser escolhido para autorizar: os signatários ativos, menos o técnico que executou. */
export function signatariosParaAutorizar<T extends Membro>(equipe: readonly T[], tecnicoId: string): T[] {
  return equipe.filter((u) => u.signatario && u.ativo !== false && u.id !== tecnicoId)
}

/** Por que esta pessoa não pode ser indicada como técnico que executou, ou null (o servidor confere a troca com esta). */
export function impedimentoDoTecnico(u: Pick<Usuario, 'nome' | 'ativo' | 'tecnico'> | undefined): string | null {
  if (!u) return 'O técnico escolhido não foi encontrado. Escolha de novo.'
  if (!u.ativo) return `${u.nome} está com o usuário desativado. Escolha outro técnico.`
  if (!u.tecnico) return `${u.nome} não está marcado como técnico em Usuários. Escolha outro técnico.`
  return null
}

/** Por que esta pessoa não pode receber o pedido de autorização, ou null (o servidor confere o pedido com esta). */
export function impedimentoDoSignatario(
  u: Pick<Usuario, 'id' | 'nome' | 'ativo' | 'signatario'> | undefined,
  tecnicoId: string,
): string | null {
  if (!u) return 'O signatário escolhido não foi encontrado. Escolha de novo.'
  if (!u.ativo) return `${u.nome} está com o usuário desativado. Escolha outro signatário.`
  if (!u.signatario) return `${u.nome} não é signatário. Escolha outro (os signatários são marcados em Usuários).`
  if (u.id === tecnicoId) return `${u.nome} é o técnico desta calibração e não autoriza o próprio certificado. Escolha outro.`
  return null
}

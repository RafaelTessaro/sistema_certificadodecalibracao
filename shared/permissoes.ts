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
  cancelarCertificado:
    'Só o administrador cancela certificados emitidos e registra o nº de uma folha que não vai ser usada (Números não utilizados).',
  configuracoes: 'Só o administrador altera as configurações.',
  dadosEBackup: 'Só o administrador cuida das cópias de segurança e dos dados.',
  usuarios: 'Só o administrador cuida dos usuários.',
}

/**
 * O aviso de quem chega a uma página só do administrador (por um link antigo ou digitado) e volta ao Painel (título e
 * descrição; `RotaPermitida` nas telas).
 */
export const avisoSemPermissao = (permissao: Permissao): [string, string] => [
  'Esta página é só do administrador',
  `${SEM_PERMISSAO[permissao]} Peça a ele, se precisar.`,
]

export const ROTULO_PERMISSAO: Record<Permissao, string> = {
  excluirCliente: 'Excluir clientes',
  excluirBalanca: 'Excluir balanças',
  excluirPadrao: 'Excluir padrões',
  cancelarCertificado: 'Cancelar certificados emitidos e marcar a folha que não vai ser usada (Números não utilizados)',
  configuracoes: 'Configurações da empresa, do certificado e do e-mail',
  dadosEBackup: 'Cópias de segurança',
  usuarios: 'Usuários (técnicos e signatários) e registro de atividades',
}

export const NOME_NIVEL: Record<NivelUsuario, string> = { ADMIN: 'Administrador', COMUM: 'Operador' }
export const RESUMO_NIVEL: Record<NivelUsuario, string> = {
  ADMIN:
    'Tudo o que o operador faz e mais: configurações, usuários, cópias de segurança, cancelar certificados, marcar a folha que não vai ser usada e excluir cadastros.',
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
 * Quem escolheu ou trocou "Técnico que executou" não autoriza a calibração (como na 1.0.4): sem isso, bastava escolher um
 * colega como técnico para autorizar a própria calibração com o nome dele. Ninguém assina por outra pessoa.
 */
export const QUEM_ESCOLHEU_NAO_AUTORIZA =
  'Você escolheu o técnico que executou esta calibração, e quem escolhe o técnico não autoriza. Envie para outro signatário.'

/**
 * Quem passa a ter escolhido o técnico quando `autorId` grava a calibração com `tecnicoId` (`tecnicoDefinidoPorId`): quem
 * o troca; o próprio técnico que grava a calibração dele (confere que foi ele: quem digitou pode autorizar); senão, quem
 * já tinha escolhido (quem só corrige a digitação não passa a ser). O servidor (`atualizarCalibracao`) e a tela usam esta.
 */
export function quemDefineOTecnico(
  atual: Pick<Calibracao, 'tecnicoId' | 'tecnicoDefinidoPorId'>,
  tecnicoId: string,
  autorId: string,
): string | undefined {
  return tecnicoId !== atual.tecnicoId || tecnicoId === autorId ? autorId : atual.tecnicoDefinidoPorId
}

/** Escolheu o técnico (que não é ele mesmo) da calibração: não autoriza. Sem técnico escolhido ainda, não conta. */
const escolheuOTecnico = (k: Pick<Calibracao, 'tecnicoId' | 'tecnicoDefinidoPorId'>, id: string | undefined) =>
  !!k.tecnicoId && !!id && k.tecnicoDefinidoPorId === id && k.tecnicoId !== id

/**
 * Por que este usuário não pode emitir o certificado da calibração agora, ou null. O servidor (`emitirCertificado`) e a
 * tela usam esta.
 * - Revisão por outra pessoa desligada (`exigirRevisor`): qualquer pessoa que entrou no sistema emite (o certificado sai
 *   só com a assinatura do técnico).
 * - Ligada: emitir é autorizar, com a assinatura de quem autoriza. Só um signatário que não seja o técnico que executou
 *   nem quem escolheu ou trocou o técnico (`tecnicoDefinidoPorId`, como na 1.0.4); com o pedido de autorização
 *   (`Calibracao.autorizacao`), só o signatário escolhido (ninguém põe a assinatura de outra pessoa sem ela agir). A
 *   enviada para revisão antes da 1.0.5 (sem o pedido), qualquer outro signatário; o rascunho, o signatário que escolhe a
 *   si mesmo (autoriza direto).
 */
export function impedimentoParaEmitir(
  exigirRevisor: boolean,
  k: Pick<Calibracao, 'tecnicoId' | 'tecnicoDefinidoPorId' | 'status' | 'autorizacao'>,
  usuario: Pick<UsuarioSessao, 'id' | 'signatario'> | null | undefined,
): string | null {
  if (!exigirRevisor) return null
  if (!usuario?.signatario) return SEM_PERMISSAO_EMITIR
  if (k.tecnicoId && k.tecnicoId === usuario.id) return TECNICO_NAO_AUTORIZA
  if (escolheuOTecnico(k, usuario.id)) return QUEM_ESCOLHEU_NAO_AUTORIZA
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
  k: Pick<Calibracao, 'tecnicoId' | 'tecnicoDefinidoPorId' | 'status' | 'autorizacao'>,
  usuario: Pick<UsuarioSessao, 'id' | 'signatario'> | null | undefined,
): boolean {
  return k.status === 'REVISAO' && !impedimentoParaEmitir(true, k, usuario)
}

type Membro = Pick<Usuario, 'id' | 'nome'> & Partial<Pick<Usuario, 'tecnico' | 'signatario' | 'ativo'>>

/**
 * Para "Técnico que executou" (a lista é a dos usuários ativos): quem tem a marca de técnico e, se a calibração já tem
 * outra pessoa (sem a marca hoje, ou de antes dela), ela também, no lugar dela (continua valendo). Aguardando a
 * autorização (`k`), sem quem recebeu o pedido (`impedimentoDaTrocaDoTecnico`).
 */
export function tecnicosParaEscolher<T extends Membro>(
  equipe: readonly T[],
  tecnicoId: string,
  k?: Pick<Calibracao, 'status' | 'autorizacao'>,
): T[] {
  return equipe.filter(
    (u) => (!!tecnicoId && u.id === tecnicoId) || (!!u.tecnico && !(k && impedimentoDaTrocaDoTecnico(k, u.id))),
  )
}

/**
 * Por que o técnico não pode passar a ser esta pessoa agora (trocado por `autorId`), ou null. Aguardando a autorização:
 * quem recebeu o pedido não passa a ser o técnico (o técnico nunca autoriza o próprio certificado) nem troca o técnico
 * (quem escolhe o técnico não autoriza; a tela trava a lista para ele). O servidor confere a troca com esta.
 */
export function impedimentoDaTrocaDoTecnico(
  k: Pick<Calibracao, 'status' | 'autorizacao'>,
  tecnicoId: string,
  autorId?: string,
): string | null {
  const pedido = k.status === 'REVISAO' ? k.autorizacao : null
  if (!pedido) return null
  if (autorId && autorId === pedido.signatarioId)
    return 'Você recebeu o pedido de autorização: quem troca o técnico não autoriza. Para trocar, volte para rascunho e envie para outro signatário.'
  if (!tecnicoId || tecnicoId !== pedido.signatarioId) return null
  return `${pedido.signatarioNome} recebeu o pedido de autorização e não pode ser o técnico desta calibração. Para trocar, volte para rascunho e escolha outro signatário.`
}

/**
 * Quem pode ser escolhido para autorizar: os signatários ativos, menos o técnico que executou e quem escolheu o técnico
 * (`definidoPorId`: `tecnicoDefinidoPorId`, ou quem passa a ser com a troca na tela, `quemDefineOTecnico`).
 */
export function signatariosParaAutorizar<T extends Membro>(equipe: readonly T[], tecnicoId: string, definidoPorId = ''): T[] {
  return equipe.filter(
    (u) =>
      u.signatario &&
      u.ativo !== false &&
      u.id !== tecnicoId &&
      !escolheuOTecnico({ tecnicoId, tecnicoDefinidoPorId: definidoPorId }, u.id),
  )
}

/** Por que esta pessoa não pode ser indicada como técnico que executou, ou null (o servidor confere a troca com esta). */
export function impedimentoDoTecnico(u: Pick<Usuario, 'nome' | 'ativo' | 'tecnico'> | undefined): string | null {
  if (!u) return 'O técnico escolhido não foi encontrado. Escolha de novo.'
  if (!u.ativo) return `${u.nome} está com o usuário desativado. Escolha outro técnico.`
  if (!u.tecnico) return `${u.nome} não tem a marca de técnico (em Usuários). Escolha outro técnico.`
  return null
}

/** Por que esta pessoa não pode receber o pedido de autorização, ou null (o servidor confere o pedido com esta). */
export function impedimentoDoSignatario(
  u: Pick<Usuario, 'id' | 'nome' | 'ativo' | 'signatario'> | undefined,
  tecnicoId: string,
  /** Quem escolheu o técnico (`tecnicoDefinidoPorId`): não recebe o pedido. */
  definidoPorId = '',
): string | null {
  if (!u) return 'O signatário escolhido não foi encontrado. Escolha de novo.'
  if (!u.ativo) return `${u.nome} está com o usuário desativado. Escolha outro signatário.`
  if (!u.signatario) return `${u.nome} não tem a marca de signatário (em Usuários). Escolha outro signatário.`
  if (u.id === tecnicoId)
    return `${u.nome} executou esta calibração e não autoriza o próprio certificado. Escolha outro signatário.`
  if (escolheuOTecnico({ tecnicoId, tecnicoDefinidoPorId: definidoPorId }, u.id))
    return `${u.nome} escolheu o técnico desta calibração e não pode autorizá-la. Escolha outro signatário.`
  return null
}

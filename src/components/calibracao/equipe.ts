// Quem executa e quem autoriza, na calibração: a dica do campo "Técnico que executou" e o que a etapa "Revisão e
// emissão" oferece a quem está usando (emitir, autorizar, enviar para autorização, devolver ou só aguardar), pelas
// regras de shared/permissoes.ts (as mesmas que o servidor confere).

import { impedimentoParaEmitir, pedidoSemQuemAutorize, podeDevolver, signatariosParaAutorizar } from '#shared/permissoes.ts'
import type { Calibracao, UsuarioSessao } from '#shared/tipos.ts'
import type { MembroEquipe } from '../../lib/api'

/**
 * A dica abaixo de "Técnico que executou": o cargo, ou por que o escolhido merece atenção. `travado`: por que quem está
 * usando não pode trocar o técnico agora (recebeu o pedido de autorização: `impedimentoDaTrocaDoTecnico`).
 * `escolhidoPorVoce`: com a revisão por outra pessoa ligada, o signatário que está usando escolheu (ou vai escolher, ao
 * gravar) o técnico de outra pessoa, e outro signatário autoriza (`quemDefineOTecnico`).
 */
export function dicaDoTecnico(
  equipe: readonly MembroEquipe[],
  tecnicoId: string,
  o: { escolhidoPorVoce?: boolean; travado?: string | null } = {},
): string | undefined {
  if (o.travado) return o.travado
  const tecnico = equipe.find((u) => u.id === tecnicoId)
  if (tecnicoId && !tecnico)
    return 'Quem executou não está na equipe ativa (conta desativada ou excluída). Se foi excluída, escolha de novo.'
  if (tecnico && !tecnico.tecnico) return 'Sem a marca de técnico em Usuários: continua valendo nesta calibração.'
  if (!tecnicoId && !equipe.some((u) => u.tecnico))
    return 'Ninguém tem a marca de técnico. Peça ao administrador para marcar em Usuários.'
  if (tecnicoId && o.escolhidoPorVoce)
    return 'Escolhido por você: outro signatário autoriza esta calibração (quem escolhe o técnico não autoriza; se o próprio técnico gravar ou enviar a calibração, a escolha passa a ser dele).'
  return tecnico?.cargo || undefined
}

/**
 * O que a etapa de emissão oferece:
 * - `emitir`: emite direto (a revisão por outra pessoa desligada: qualquer pessoa);
 * - `escolher`: escolhe quem autoriza (ligada, no rascunho, ou na enviada antes da 1.0.5 quando quem está usando não
 *   pode autorizar); escolher a si mesmo autoriza direto;
 * - `autorizar`: autoriza ou devolve (o pedido é para quem está usando, ou a enviada antes da 1.0.5 e quem está usando é
 *   um signatário que não executou);
 * - `aguardando`: enviada para outra pessoa (ou o pedido é para quem está usando, que passou a ser o técnico): só volta
 *   para rascunho.
 */
export type ModoEmissao = 'emitir' | 'escolher' | 'autorizar' | 'aguardando'

export interface EstadoEmissao {
  modo: ModoEmissao
  /** Ligada: quem pode receber o pedido (os signatários, menos o técnico e quem o escolheu). */
  signatarios: MembroEquipe[]
  /** O signatário que já vem escolhido: quem está usando, se puder autorizar; senão, o único possível. */
  sugerido: string
  /** Por que quem está usando não autoriza (ligada), ou null. */
  impedimento: string | null
  /**
   * Quem recebeu o pedido não pode autorizar (executou, ou escolheu o técnico: o pedido enviado na 1.0.5), ou null: ele
   * devolve, ou quem enviou volta para rascunho (`pedidoSemQuemAutorize`).
   */
  semQuemAutorize: 'TECNICO' | 'ESCOLHEU' | null
  podeDevolver: boolean
}

export function estadoDaEmissao(
  exigirRevisor: boolean,
  /**
   * A calibração gravada (a situação e o pedido) com o técnico escolhido na tela (ainda que não gravado) e quem o
   * escolheu (o que a gravação deixa: `quemDefineOTecnico`).
   */
  k: Pick<Calibracao, 'tecnicoId' | 'tecnicoDefinidoPorId' | 'status' | 'autorizacao'>,
  usuario: Pick<UsuarioSessao, 'id' | 'signatario'> | null | undefined,
  equipe: readonly MembroEquipe[],
): EstadoEmissao {
  const signatarios = signatariosParaAutorizar(equipe, k.tecnicoId, k.tecnicoDefinidoPorId)
  const impedimento = impedimentoParaEmitir(exigirRevisor, k, usuario)
  const devolver = exigirRevisor && podeDevolver(k, usuario)
  const semQuemAutorize = exigirRevisor ? pedidoSemQuemAutorize(k) : null
  const base = { signatarios, impedimento, semQuemAutorize, podeDevolver: devolver }
  if (!exigirRevisor) return { ...base, modo: 'emitir', sugerido: '' }
  const pedido = k.status === 'REVISAO' ? k.autorizacao : null
  const eu = usuario?.id ?? ''
  const sugerido = signatarios.some((u) => u.id === eu) ? eu : signatarios.length === 1 ? signatarios[0].id : ''
  if (pedido) return { ...base, modo: impedimento ? 'aguardando' : 'autorizar', sugerido }
  if (k.status === 'REVISAO' && !impedimento) return { ...base, modo: 'autorizar', sugerido }
  return { ...base, modo: 'escolher', sugerido }
}

/**
 * Com a revisão ligada, os signatários que não estão em "Quem autoriza" para quem está usando (`eu`), e por quê: o técnico
 * que executou e quem escolheu o técnico (`definidoPorId`). Quem usa a tela costuma mandar tudo para a mesma pessoa e
 * precisa saber por que ela sumiu da lista. O próprio `eu` fica de fora (o impedimento dele já diz). null: ninguém.
 */
export function foraDaListaDeQuemAutoriza(
  equipe: readonly MembroEquipe[],
  tecnicoId: string,
  definidoPorId: string | undefined,
  eu: string,
): string | null {
  const signatario = (id: string | undefined) => (id && id !== eu ? equipe.find((u) => u.id === id && u.signatario) : undefined)
  const executou = signatario(tecnicoId)
  const escolheu = definidoPorId !== tecnicoId ? signatario(definidoPorId) : undefined
  return (
    [
      executou ? `${executou.nome} não está na lista: executou esta calibração.` : '',
      escolheu
        ? `${escolheu.nome} não está na lista: escolheu o técnico desta calibração, e quem escolhe o técnico não autoriza.`
        : '',
    ]
      .filter(Boolean)
      .join(' ') || null
  )
}

/**
 * Ninguém pode receber o pedido (o técnico e quem o escolheu são os únicos signatários): o aviso e as saídas. Quem
 * escolheu (`definidoPorId`, outro que não o técnico) volta a poder autorizar quando o técnico abre e envia a calibração
 * (a escolha passa a ser dele: `quemDefineOTecnico`); senão, o administrador marca outro signatário.
 */
export function avisoSemQuemAutorize(
  equipe: readonly MembroEquipe[],
  tecnicoId: string,
  definidoPorId: string | undefined,
  eu: string,
): string {
  const tecnico = equipe.find((u) => u.id === tecnicoId)
  const escolheu =
    definidoPorId && definidoPorId !== tecnicoId ? equipe.find((u) => u.id === definidoPorId && u.signatario) : undefined
  if (!escolheu)
    return 'Ninguém pode autorizar esta calibração: quem executou não autoriza a própria, e não há outro signatário. Peça ao administrador para marcar um signatário em Usuários.'
  const quem = escolheu.id === eu ? 'você' : escolheu.nome
  return `Ninguém pode autorizar esta calibração: quem executou e quem escolheu o técnico não autorizam, e não há outro signatário. ${
    tecnico
      ? `Peça ao técnico que executou (${tecnico.nome}) para abrir a calibração e enviar para autorização: a escolha passa a ser do técnico, e ${quem} pode autorizar. Ou peça ao administrador para marcar outro signatário em Usuários.`
      : 'Peça ao administrador para marcar outro signatário em Usuários.'
  }`
}

/**
 * Por que "Enviar para autorização" está desativado (o texto ao lado do botão), ou null. Sem signatário possível
 * (`semSignatarios`), o aviso de que ninguém pode autorizar já explica.
 */
export function motivoDoEnvioDesativado(o: {
  pronto: boolean
  signatarioId: string
  semSignatarios: boolean
  salvando: boolean
}): string | null {
  if (o.semSignatarios) return null
  if (!o.pronto && !o.signatarioId) return 'Escolha quem autoriza e resolva os itens de “Falta completar” para enviar.'
  if (!o.pronto) return 'Resolva os itens de “Falta completar” para enviar.'
  if (!o.signatarioId) return 'Escolha quem autoriza para enviar.'
  if (o.salvando) return 'Salvando o rascunho…'
  return null
}

/**
 * O título e a frase do alto de "Revisão e emissão", pelo que quem está usando pode fazer: emitir (`emitir`), autorizar
 * e emitir (`autorizar`, ou `escolher` com ele mesmo escolhido: `autorizaVoce`), enviar para a autorização de outro
 * signatário (`escolher`) ou só aguardar a autorização pedida (`aguardando`; `aguardandoDe`: o nome do escolhido). O
 * pedido parado com quem não pode autorizar (`semQuemAutorize`; `pedidoParaVoce`: é quem está usando) diz o que fazer
 * (`parado`). Com só pendências que o administrador resolve, para quem não abre Configurações (`soDoAdministrador`; `itens`:
 * quantas), o alto não manda resolver nem clicar: diz que é com ele.
 */
export function cabecalhoDaRevisao(o: {
  modo: ModoEmissao
  pronto: boolean
  autorizaVoce: boolean
  aguardandoDe: string | null
  /** Alguma pendência leva à etapa dela ou a Configurações (a frase convida a clicar). */
  irParaItens: boolean
  semQuemAutorize?: 'TECNICO' | 'ESCOLHEU' | null
  pedidoParaVoce?: boolean
  soDoAdministrador?: boolean
  itens?: number
}): { titulo: string; descricao: string; aguardando: boolean; parado?: boolean } {
  const acao =
    o.modo === 'aguardando'
      ? 'aguardando'
      : o.modo === 'autorizar' || (o.modo === 'escolher' && o.autorizaVoce)
        ? 'autorizar'
        : o.modo === 'escolher'
          ? 'enviar'
          : 'emitir'
  const clique = o.irParaItens ? ' Clique num item para ir até ele.' : ''
  if (!o.pronto && o.soDoAdministrador)
    return {
      titulo: 'Depende do administrador',
      descricao: `Quem resolve ${(o.itens ?? 1) > 1 ? 'os itens' : 'o item'} abaixo é o administrador. Até lá, ${
        acao === 'aguardando'
          ? 'o certificado não pode ser emitido'
          : acao === 'enviar'
            ? 'não dá para enviar para autorização'
            : acao === 'autorizar'
              ? 'não dá para autorizar e emitir o certificado'
              : 'não dá para emitir o certificado'
      }.`,
      aguardando: false,
    }
  if (!o.pronto)
    return {
      titulo: 'Falta completar',
      descricao:
        acao === 'aguardando'
          ? `Estes itens impedem a emissão. Para corrigir, volte para rascunho.${clique}`
          : `Resolva os itens abaixo para poder ${
              acao === 'enviar'
                ? 'enviar para autorização'
                : acao === 'autorizar'
                  ? 'autorizar e emitir o certificado'
                  : 'emitir o certificado'
            }.${clique}`,
      aguardando: false,
    }
  if (acao === 'aguardando' && o.semQuemAutorize) {
    const quem = o.pedidoParaVoce ? 'Você' : (o.aguardandoDe ?? 'Quem recebeu o pedido')
    const porque =
      o.semQuemAutorize === 'TECNICO'
        ? `${quem} executou esta calibração e não autoriza o próprio certificado.`
        : `${quem} escolheu o técnico, e quem escolhe o técnico não autoriza${o.pedidoParaVoce ? '' : ' (o pedido é de antes da atualização)'}.`
    return {
      titulo: `${o.pedidoParaVoce ? 'Você não pode' : `${quem} não pode`} autorizar esta calibração`,
      descricao: `${porque} ${
        o.pedidoParaVoce
          ? 'Clique em Devolver: ela volta para rascunho, com a sua nota, e quem enviou a manda para outro signatário.'
          : 'Volte para rascunho e envie para outro signatário.'
      }`,
      aguardando: false,
      parado: true,
    }
  }
  if (acao === 'aguardando')
    return {
      titulo: o.aguardandoDe ? `Aguardando autorização de ${o.aguardandoDe}` : 'Aguardando autorização',
      descricao: `O certificado é emitido quando ${o.aguardandoDe ?? 'o signatário'} autorizar. Até lá, dá para ver a prévia.`,
      aguardando: true,
    }
  if (acao === 'enviar')
    return {
      titulo: 'Tudo pronto para enviar para autorização',
      descricao: 'Confira a prévia do certificado e escolha quem autoriza a emissão.',
      aguardando: false,
    }
  if (acao === 'autorizar')
    return {
      titulo: 'Tudo pronto para autorizar e emitir',
      descricao: 'Confira os dados e a prévia do certificado antes de autorizar.',
      aguardando: false,
    }
  return { titulo: 'Tudo pronto para emitir', descricao: 'Confira a prévia do certificado antes de emitir.', aguardando: false }
}

/**
 * O aviso do Painel das calibrações que aguardam quem está usando (o filtro AUTORIZAR): também conta o pedido enviado na
 * 1.0.5 a quem escolheu o técnico, que ele não autoriza mas devolve (`podeDevolver`); a calibração diz por quê.
 */
export function avisoParaAutorizar(total: number, numero: (n: number) => string = String): { destaque: string; texto: string } {
  return {
    destaque:
      total === 1 ? '1 calibração aguarda a sua autorização.' : `${numero(total)} calibrações aguardam a sua autorização.`,
    texto: 'Confira e autorize a emissão, ou devolva com uma nota se não puder autorizar.',
  }
}

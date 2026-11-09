// Quem executa e quem autoriza, na calibração: a dica do campo "Técnico que executou" e o que a etapa "Revisão e
// emissão" oferece a quem está usando (emitir, autorizar, enviar para autorização, devolver ou só aguardar), pelas
// regras de shared/permissoes.ts (as mesmas que o servidor confere).

import { impedimentoParaEmitir, podeDevolver, signatariosParaAutorizar } from '#shared/permissoes.ts'
import type { Calibracao, UsuarioSessao } from '#shared/tipos.ts'
import type { MembroEquipe } from '../../lib/api'

/** A dica abaixo de "Técnico que executou": o cargo, ou por que o escolhido merece atenção. */
export function dicaDoTecnico(equipe: readonly MembroEquipe[], tecnicoId: string): string | undefined {
  const tecnico = equipe.find((u) => u.id === tecnicoId)
  if (tecnicoId && !tecnico)
    return 'Quem executou não está na equipe ativa (conta desativada ou excluída). Se foi excluída, escolha de novo.'
  if (tecnico && !tecnico.tecnico) return 'Sem a marca de técnico em Usuários: continua valendo nesta calibração.'
  if (!tecnicoId && !equipe.some((u) => u.tecnico))
    return 'Ninguém tem a marca de técnico. Peça ao administrador para marcar em Usuários.'
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
  /** Ligada: quem pode receber o pedido (os signatários, menos o técnico). */
  signatarios: MembroEquipe[]
  /** O signatário que já vem escolhido: quem está usando, se puder autorizar; senão, o único possível. */
  sugerido: string
  /** Por que quem está usando não autoriza (ligada), ou null. */
  impedimento: string | null
  podeDevolver: boolean
}

export function estadoDaEmissao(
  exigirRevisor: boolean,
  /** A calibração gravada (a situação e o pedido) com o técnico escolhido na tela (ainda que não gravado). */
  k: Pick<Calibracao, 'tecnicoId' | 'status' | 'autorizacao'>,
  usuario: Pick<UsuarioSessao, 'id' | 'signatario'> | null | undefined,
  equipe: readonly MembroEquipe[],
): EstadoEmissao {
  const signatarios = signatariosParaAutorizar(equipe, k.tecnicoId)
  const impedimento = impedimentoParaEmitir(exigirRevisor, k, usuario)
  const devolver = exigirRevisor && podeDevolver(k, usuario)
  const base = { signatarios, impedimento, podeDevolver: devolver }
  if (!exigirRevisor) return { ...base, modo: 'emitir', sugerido: '' }
  const pedido = k.status === 'REVISAO' ? k.autorizacao : null
  const eu = usuario?.id ?? ''
  const sugerido = signatarios.some((u) => u.id === eu) ? eu : signatarios.length === 1 ? signatarios[0].id : ''
  if (pedido) return { ...base, modo: impedimento ? 'aguardando' : 'autorizar', sugerido }
  if (k.status === 'REVISAO' && !impedimento) return { ...base, modo: 'autorizar', sugerido }
  return { ...base, modo: 'escolher', sugerido }
}

/**
 * O título e a frase do alto de "Revisão e emissão", pelo que quem está usando pode fazer: emitir (`emitir`), autorizar
 * e emitir (`autorizar`, ou `escolher` com ele mesmo escolhido: `autorizaVoce`), enviar para a autorização de outro
 * signatário (`escolher`) ou só aguardar a autorização pedida (`aguardando`; `aguardandoDe`: o nome do escolhido).
 */
export function cabecalhoDaRevisao(o: {
  modo: ModoEmissao
  pronto: boolean
  autorizaVoce: boolean
  aguardandoDe: string | null
  /** As pendências levam à etapa delas (a frase convida a clicar). */
  irParaItens: boolean
}): { titulo: string; descricao: string; aguardando: boolean } {
  const acao =
    o.modo === 'aguardando'
      ? 'aguardando'
      : o.modo === 'autorizar' || (o.modo === 'escolher' && o.autorizaVoce)
        ? 'autorizar'
        : o.modo === 'escolher'
          ? 'enviar'
          : 'emitir'
  const clique = o.irParaItens ? ' Clique num item para ir até ele.' : ''
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

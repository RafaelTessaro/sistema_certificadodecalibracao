// Quem é o celular de uma requisição às rotas do app do celular (as regras `celular` e `celular-entrega` de
// shared/campo/protocolo.ts): o token do cabeçalho Authorization ("Bearer <token>") → o sha256 dele → o celular
// cadastrado. Chamado pelo controle de acesso (server/acesso.ts) antes de ler o corpo. O cookie da sessão nunca vale
// nestas rotas, e o token do celular nunca vale nas outras (lá só o cookie é lido).
//
//   sem token, ou token desconhecido      → 401 NAO_PAREADO
//   `celular` (receber folhas, mudar estados): celular revogado, ou técnico desativado/excluído → 401 DESCADASTRADO
//   `celular-entrega` (entregar): aceito mesmo revogado e de técnico desativado, menos o motivo ROUBADO → 401 DESCADASTRADO

import type { FastifyRequest } from 'fastify'
import { MENSAGENS_ERRO_CAMPO, tokenDoCabecalho } from '#shared/campo/protocolo.ts'
import type { UsuarioSessao } from '#shared/tipos.ts'
import { ErroApi } from '../erros.ts'
import type { ServicoUsuarios } from '../usuarios.ts'
import { sha256Token } from './pareamento.ts'
import type { DispositivoDaRequisicao, RepositorioCampo } from './repositorio.ts'

export type RegraCelular = 'celular' | 'celular-entrega'

declare module 'fastify' {
  interface FastifyRequest {
    /** O celular autenticado (só nas rotas do app do celular). */
    dispositivo: DispositivoDaRequisicao | null
  }
}

const naoPareado = () => new ErroApi(401, MENSAGENS_ERRO_CAMPO.NAO_PAREADO, { codigo: 'NAO_PAREADO' })
const descadastrado = () => new ErroApi(401, MENSAGENS_ERRO_CAMPO.DESCADASTRADO, { codigo: 'DESCADASTRADO' })

/**
 * Autentica o celular e preenche `req.dispositivo` e, com o técnico ativo, `req.usuario` (o técnico: o registro de
 * atividades mostra quem). Lança ErroApi 401 com o código do protocolo.
 */
export function autenticarCelular(
  campo: RepositorioCampo,
  usuarios: ServicoUsuarios,
  req: FastifyRequest,
  regra: RegraCelular,
): void {
  const token = tokenDoCabecalho(req.headers.authorization)
  if (!token) throw naoPareado()
  const linha = campo.dispositivoPorToken(sha256Token(token))
  if (!linha) throw naoPareado()
  const revogado = !!linha.revogado_em
  if (revogado && (regra === 'celular' || linha.revogado_motivo === 'ROUBADO')) throw descadastrado()
  const tecnico = usuarios.obter(linha.usuario_id)
  if (regra === 'celular' && (!tecnico || !tecnico.ativo)) throw descadastrado()
  req.dispositivo = { linha, revogado }
  if (tecnico?.ativo) {
    const sessao: UsuarioSessao = {
      id: tecnico.id,
      login: tecnico.login,
      nome: tecnico.nome,
      nivel: tecnico.nivel,
      trocarSenha: false,
      tecnico: tecnico.tecnico,
      signatario: tecnico.signatario,
    }
    req.usuario = sessao
  }
}

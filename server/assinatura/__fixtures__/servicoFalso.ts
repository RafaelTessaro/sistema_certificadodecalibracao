// Um ServicoCertificadoDigital de teste, montado com a PKI de teste (sem cofre, sem DPAPI): o certificado "instalado"
// fica só em memória e a conferência é a de verdade (conferirA1, com a raiz de teste no lugar das ICP-Brasil). Serve
// aos testes da emissão; o serviço de verdade é server/certificadoDigital.ts.

import { normalizarCnpj } from '#shared/documentos.ts'
import type { CertificadoDigitalPublico, SituacaoCertificadoDigital } from '#shared/tipos.ts'
import { ErroApi } from '../../erros.ts'
import {
  type A1ParaAssinar,
  ErroCertificadoDigital,
  type PublicoParaRemontar,
  type ServicoCertificadoDigital,
} from '../contrato.ts'
import { mesmaRaizCnpj } from '../icp.ts'
import { abrirPfx, conferirA1, DIAS_AVISO_VENCIMENTO, diasParaVencer } from '../pfx.ts'
import { arquivoPki, raizesTeste, SENHA } from './pki.ts'

/** O certificado de teste `nome` (pki/<nome>.pfx), aberto, com a cadeia até a raiz de teste. */
export const a1Teste = (nome: string): A1ParaAssinar => abrirPfx(arquivoPki(`${nome}.pfx`), SENHA, { raizes: raizesTeste() })

export interface ServicoFalso extends ServicoCertificadoDigital {
  /** Instala (ou troca) o certificado; o anterior continua conhecido por publicoPorSha256, como na tabela. */
  instalar(a1: A1ParaAssinar): void
  /** Remove o certificado instalado (os já usados continuam conhecidos). */
  remover(): void
  /**
   * "Não abre no servidor" (o cofre de outro servidor) a partir da chamada nº `aPartirDe` de paraAssinar (1 = a
   * próxima); null volta ao normal.
   */
  naoAbre(mensagem: string | null, aPartirDe?: number): void
  /** Quantas vezes paraAssinar foi chamada. */
  readonly chamadas: number
}

export function servicoCertificadoFalso(inicial?: A1ParaAssinar): ServicoFalso {
  let atual: A1ParaAssinar | null = null
  let bloqueio: { mensagem: string; aPartirDe: number } | null = null
  let chamadas = 0
  const publicos = new Map<string, PublicoParaRemontar>()
  const instalar = (a1: A1ParaAssinar) => {
    atual = a1
    publicos.set(a1.dados.sha256, { certificadoDer: a1.certificadoDer, cadeiaDer: a1.cadeiaDer })
  }
  if (inicial) instalar(inicial)

  function situacao(a1: A1ParaAssinar, cnpjEmpresa: string, agora: Date): SituacaoCertificadoDigital {
    if (bloqueio && chamadas + 1 >= bloqueio.aPartirDe) return 'NAO_ABRE'
    if (agora < new Date(a1.dados.validoDe)) return 'AINDA_NAO_VALE'
    if (agora > new Date(a1.dados.validoAte)) return 'VENCIDO'
    const cnpj = normalizarCnpj(cnpjEmpresa)
    if (!cnpj) return 'EMPRESA_SEM_CNPJ'
    if (cnpj !== a1.dados.cnpj && !mesmaRaizCnpj(cnpj, a1.dados.cnpj)) return 'CNPJ_DIFERENTE'
    return diasParaVencer(a1.dados.validoAte, agora) <= DIAS_AVISO_VENCIMENTO ? 'VENCENDO' : 'OK'
  }

  return {
    pronto: async () => {},
    instalado: () => atual !== null,
    estado(cnpjEmpresa: string, agora = new Date()): CertificadoDigitalPublico {
      if (!atual) return { situacao: 'SEM_CERTIFICADO', avisos: [] }
      const d = atual.dados
      return {
        situacao: situacao(atual, cnpjEmpresa, agora),
        titular: d.titular,
        cnpj: d.cnpj,
        tipo: d.tipo,
        emissor: d.emissor,
        serie: d.serie,
        sha256: d.sha256,
        validoDe: d.validoDe,
        validoAte: d.validoAte,
        diasParaVencer: diasParaVencer(d.validoAte, agora),
        avisos: [],
      }
    },
    paraAssinar(cnpjEmpresa: string, agora = new Date()) {
      chamadas++
      if (!atual) return null
      if (bloqueio && chamadas >= bloqueio.aPartirDe) throw new ErroApi(409, bloqueio.mensagem, { codigo: 'CERTIFICADO_DIGITAL' })
      try {
        conferirA1(atual, { cnpjEmpresa, agora, raizes: raizesTeste() })
      } catch (e) {
        if (e instanceof ErroCertificadoDigital) throw new ErroApi(409, e.message, { codigo: 'CERTIFICADO_DIGITAL' })
        throw e
      }
      return atual
    },
    publicoPorSha256: (sha256: string) => publicos.get(sha256) ?? null,
    instalar,
    remover() {
      atual = null
    },
    naoAbre(mensagem: string | null, aPartirDe = 1) {
      bloqueio = mensagem === null ? null : { mensagem, aPartirDe: chamadas + aPartirDe }
    },
    get chamadas() {
      return chamadas
    },
  }
}

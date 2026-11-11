// Contrato da assinatura digital dos certificados (1.0.7): os tipos que o núcleo (server/assinatura/, server/pdf/
// assinaturaPdf.ts), o serviço (server/certificadoDigital.ts) e a emissão (server/certificados.ts) compartilham.
//
// Regra de ouro: o segredo do certificado (chave privada, .pfx, senha) nunca vai para o banco, as cópias, os
// registros, os e-mails, as mensagens de erro ou as respostas da API. Só os dados públicos daqui saem do núcleo.

import type { KeyObject } from 'node:crypto'
import type { CertificadoDigitalPublico, PartesAssinaturaPdf } from '#shared/tipos.ts'

/** Problema com o certificado digital: mensagem em português, pode ser mostrada ao administrador e nunca traz segredo. */
export class ErroCertificadoDigital extends Error {}

/**
 * Não foi possível assinar ou remontar o PDF: estrutura que o sistema não assina (anotações, formulário), assinatura
 * que não cabe na reserva, ou a assinatura guardada que não confere com o PDF refeito. Mensagem em português, sem segredo.
 */
export class ErroAssinaturaPdf extends Error {}

/** Os dados públicos do certificado da empresa (o que a tela mostra e o banco guarda). */
export interface DadosCertificadoDigital {
  /** SHA-256 (hex, minúsculas) do certificado (DER). */
  sha256: string
  /** A razão social (CN sem o ":CNPJ"). */
  titular: string
  /** O CNPJ do titular, só 0-9 e A-Z (14 posições). */
  cnpj: string
  tipo: 'A1' | 'SE-S'
  /** CN da AC que emitiu o certificado. */
  emissor: string
  /** Número de série (hex, maiúsculas, como o node:crypto devolve). */
  serie: string
  /** Validade (ISO 8601, UTC). */
  validoDe: string
  validoAte: string
}

/** O certificado aberto, pronto para assinar: só em memória. */
export interface A1ParaAssinar {
  dados: DadosCertificadoDigital
  chave: KeyObject
  certificadoDer: Buffer
  /** As ACs intermediárias e a raiz (o certificado do titular fica de fora), da mais próxima à raiz. */
  cadeiaDer: Buffer[]
}

/**
 * A parte pública do certificado, para remontar um PDF assinado sem a chave. A cadeia precisa ser a mesma (e na
 * mesma ordem) que estava em A1ParaAssinar.cadeiaDer quando o PDF foi assinado: ela vai inteira dentro do CMS.
 */
export interface PublicoParaRemontar {
  certificadoDer: Buffer
  cadeiaDer: Buffer[]
}

export interface OpcoesAssinatura {
  /** Hora da assinatura (/M); é truncada ao segundo. */
  m: Date
  /** /Name, /Location e /Reason do dicionário da assinatura. */
  nome: string
  local: string
  motivo: string
  /** Carimbo do tempo (RFC 3161): recebe o valor da assinatura e devolve o TimeStampToken (DER). Sem uso na 1.0.7. */
  carimbo?: (valorAssinatura: Buffer) => Promise<Buffer>
}

/** O resultado de assinarPdf: o PDF assinado e as partes variáveis a guardar com a emissão (para remontá-lo). */
export interface ResultadoAssinatura {
  pdf: Buffer
  partes: PartesAssinaturaPdf
}

/** O serviço do certificado digital (server/certificadoDigital.ts), injetado como ctx.certificadoDigital. */
export interface ServicoCertificadoDigital {
  /** A abertura do cofre na partida (em segundo plano); sempre resolve. */
  pronto(): Promise<void>
  /** Há um cofre gravado (abrindo ou não). */
  instalado(): boolean
  estado(cnpjEmpresa: string, agora?: Date): CertificadoDigitalPublico
  /**
   * O certificado pronto para assinar; null = nenhum instalado. Lança ErroApi(409, mensagem, { codigo:
   * 'CERTIFICADO_DIGITAL' }) quando há um instalado mas ele não pode assinar agora (vencido, ainda não vale, não abre
   * no servidor, CNPJ diferente do da empresa).
   */
  paraAssinar(cnpjEmpresa: string, agora?: Date): A1ParaAssinar | null
  /** A parte pública de qualquer certificado já instalado (também os removidos e os trocados). */
  publicoPorSha256(sha256: string): PublicoParaRemontar | null
}

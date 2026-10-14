// Entrada do gerador do certificado em PDF (server/pdf/certificado.ts).
// O PDF é montado só com estes dados (congelados na emissão): gerar de novo dá o mesmo documento.

import type { ResultadoCalculo } from '#shared/metrologia/tipos.ts'
import type { Calibracao, EmissaoCertificado } from '#shared/tipos.ts'

export interface DadosCertificadoPdf {
  /** A calibração com os ensaios (leituras), opções de cálculo, observações etc. */
  calibracao: Calibracao
  /**
   * Dados congelados: empresa, cliente, balança, padrões, técnico, signatário, textos, número e código.
   * Na prévia de um rascunho, montados com os cadastros atuais e número provisório.
   */
  emissao: EmissaoCertificado
  /** Resultado do cálculo dos ensaios finais ("como deixado"). */
  resultado: ResultadoCalculo
  /** Resultado do ensaio "como encontrado" (antes do ajuste), quando houve ajuste e foi medido. */
  comoEncontrado: ResultadoCalculo | null
  /**
   * Marca d'água diagonal em todas as páginas: "PRÉVIA — SEM VALOR" (rascunho), "CANCELADO",
   * "SUBSTITUÍDO". Vazio = documento válido.
   */
  marcaDagua: string
}

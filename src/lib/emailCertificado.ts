// O texto do e-mail do certificado: os valores das marcas do modelo (Configurações → Vencimentos e lembretes) e o
// parágrafo da assinatura digital posto à mão na mensagem (1.0.7).

import { balancaNoEmail, formatarDataBr, textoAssinaturaDigitalEmail } from '#shared/dominio.ts'
import type { Balanca, Calibracao, Cliente, Configuracoes } from '#shared/tipos.ts'
import { assinadoDigitalmente } from '../components/certificadoDigital/textos'

/**
 * Os valores das marcas do modelo do e-mail do certificado. {assinaturaDigital}: no certificado assinado digitalmente
 * (1.0.7), como conferir a assinatura; vazio nos outros e no que ainda aguarda a assinatura ("está assinado" não seria
 * verdade; a linha da marca some, sem deixar buraco: `preencherModelo`).
 */
export function valoresDoEmail(
  config: Pick<Configuracoes, 'empresa'>,
  calibracao: Pick<Calibracao, 'numero' | 'dataCalibracao' | 'ordemServico' | 'emissao'>,
  cliente: Pick<Cliente, 'nome'> | undefined,
  balanca: Balanca | undefined,
): Record<string, string> {
  const emissao = calibracao.emissao
  const assinatura = emissao && assinadoDigitalmente(emissao) ? emissao.assinaturaDigital : undefined
  return {
    numero: calibracao.numero,
    empresa: config.empresa.nomeFantasia || config.empresa.razaoSocial,
    cliente: cliente?.nome ?? '',
    // Sem o "Balança" da frente: o texto já diz "referente à balança …"
    balanca: balanca ? balancaNoEmail(balanca) : '',
    data: formatarDataBr(calibracao.dataCalibracao),
    os: calibracao.ordemServico,
    assinaturaDigital: assinatura ? textoAssinaturaDigitalEmail(assinatura) : '',
  }
}

/** O parágrafo antes do último da mensagem (a despedida e o nome da empresa); sem parágrafos, no fim. */
export function comParagrafoAntesDoFim(texto: string, paragrafo: string): string {
  const t = texto.trimEnd()
  if (!t) return paragrafo
  const i = t.lastIndexOf('\n\n')
  return i < 0 ? `${t}\n\n${paragrafo}` : `${t.slice(0, i)}\n\n${paragrafo}${t.slice(i)}`
}

// Só para conferir de ponta a ponta o servidor de verdade num navegador (fora do vitest): a PKI de teste
// (__fixtures__/pki) como lista de confiança do certificado digital e, se pedido, o relógio do certificado digital
// adiantado ou atrasado (para ver as situações "vence em N dias" e "vencido" sem esperar).
//
//   NODE_ENV=test BC_PKI_TESTE=1 [BC_RELOGIO_TESTE=2046-12-10T12:00:00Z] PORTA=4871 PASTA_DADOS=/tmp/x node server/iniciar.mjs
//
// Duas travas, para nunca valer num servidor de verdade por engano:
// 1. só com NODE_ENV=test (o serviço do instalador define NODE_ENV=production; ver bc-calibracao.nsi);
// 2. a PKI de teste fica em __fixtures__, pasta que o empacotador não leva para o instalador (scripts/empacotar-windows.sh).
// Sem as duas, as variáveis são ignoradas com um aviso, e valem as raízes ICP-Brasil fixadas e o relógio do computador.

import type { X509Certificate } from 'node:crypto'

export interface OpcoesCertificadoDigitalTeste {
  raizes?: X509Certificate[]
  agora?: () => Date
}

/** As opções de teste do certificado digital pedidas no ambiente (`BC_PKI_TESTE`, `BC_RELOGIO_TESTE`), ou undefined. */
export async function opcoesCertificadoDigitalDeTeste(
  env: NodeJS.ProcessEnv,
  avisar: (mensagem: string) => void = console.warn,
): Promise<OpcoesCertificadoDigitalTeste | undefined> {
  const pki = env.BC_PKI_TESTE === '1'
  const relogio = env.BC_RELOGIO_TESTE?.trim()
  if (!pki && !relogio) return undefined
  if (env.NODE_ENV !== 'test') {
    avisar('Aviso: BC_PKI_TESTE e BC_RELOGIO_TESTE foram ignoradas: só valem nos testes (NODE_ENV=test).')
    return undefined
  }
  let pkiTeste: { raizesTeste: () => X509Certificate[] }
  try {
    // Ausente no instalador (o empacotador não leva __fixtures__)
    pkiTeste = await import('./__fixtures__/pki.ts')
  } catch {
    avisar('Aviso: BC_PKI_TESTE e BC_RELOGIO_TESTE foram ignoradas: a PKI de teste não faz parte desta instalação.')
    return undefined
  }
  const opcoes: OpcoesCertificadoDigitalTeste = {}
  if (pki) opcoes.raizes = pkiTeste.raizesTeste()
  if (relogio) {
    const alvo = Date.parse(relogio)
    if (Number.isNaN(alvo)) avisar(`Aviso: BC_RELOGIO_TESTE=${relogio} não é uma data (use 2046-12-10T12:00:00Z); ignorada.`)
    else {
      // O relógio anda a partir da data pedida
      const diferenca = alvo - Date.now()
      opcoes.agora = () => new Date(Date.now() + diferenca)
    }
  }
  avisar(
    `Aviso: certificado digital em modo de teste${pki ? ' (confia só na raiz da PKI de teste)' : ''}` +
      `${opcoes.agora ? ` (relógio em ${opcoes.agora().toISOString()})` : ''}. Nunca use isso num servidor de verdade.`,
  )
  return opcoes
}

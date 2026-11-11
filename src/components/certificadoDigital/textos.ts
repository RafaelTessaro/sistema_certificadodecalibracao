// Os textos do certificado digital da empresa nas telas (Configurações → Certificado digital e a faixa do Painel).

import { mascaraCnpj, normalizarCnpj } from '#shared/documentos.ts'
import { textoAssinaturaDigitalVerificacao } from '#shared/dominio.ts'
import type {
  CertificadoDigitalPublico,
  EmissaoCertificado,
  SituacaoCertificadoDigital,
  StatusCalibracao,
  Tone,
} from '#shared/tipos.ts'
import { dataHora, numero } from '../../lib/format'

/** O selo de cada situação. */
export function seloDaSituacao(c: Pick<CertificadoDigitalPublico, 'situacao' | 'diasParaVencer'>): { texto: string; tom: Tone } {
  const dias = c.diasParaVencer ?? 0
  const SELO: Record<SituacaoCertificadoDigital, { texto: string; tom: Tone }> = {
    SEM_CERTIFICADO: { texto: 'Nenhum instalado', tom: 'neutral' },
    OK: { texto: 'Em dia', tom: 'success' },
    VENCENDO: { texto: dias <= 0 ? 'Vence hoje' : dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`, tom: 'warning' },
    VENCIDO: { texto: 'Vencido', tom: 'danger' },
    AINDA_NAO_VALE: { texto: 'Ainda não vale', tom: 'warning' },
    NAO_ABRE: { texto: 'Não abre no servidor', tom: 'danger' },
    CNPJ_DIFERENTE: { texto: 'CNPJ diferente do da empresa', tom: 'danger' },
    EMPRESA_SEM_CNPJ: { texto: 'CNPJ da empresa em branco', tom: 'danger' },
  }
  return SELO[c.situacao]
}

/**
 * Configurações → Empresa, com o certificado digital instalado: o CNPJ digitado que faria o sistema parar de emitir (em
 * branco, ou de outra empresa: a raiz de 8 posições diferente; o de outro estabelecimento da mesma empresa só avisa no
 * cartão do certificado). null = nada a avisar.
 */
export function efeitoDoCnpjDaEmpresa(
  cnpjDigitado: string,
  certificado: Pick<CertificadoDigitalPublico, 'situacao' | 'cnpj'> | null | undefined,
): string | null {
  if (!certificado?.cnpj || certificado.situacao === 'SEM_CERTIFICADO') return null
  const doCertificado = mascaraCnpj(certificado.cnpj)
  const digitado = normalizarCnpj(cnpjDigitado ?? '')
  if (!digitado)
    return `Com o CNPJ em branco, o sistema para de emitir certificados: o CNPJ da empresa é conferido com o do certificado digital instalado (${doCertificado}).`
  if (digitado.slice(0, 8) === normalizarCnpj(certificado.cnpj).slice(0, 8)) return null
  return `Este CNPJ não é o do certificado digital instalado (${doCertificado}): ao salvar, o sistema para de emitir certificados até o certificado digital deste CNPJ ser instalado.`
}

/** A impressão digital abreviada (SHA-256): os 8 primeiros e os 8 últimos, em grupos de 4. */
export const impressaoCurta = (sha256 = '') =>
  sha256.length < 16
    ? sha256
    : `${sha256.slice(0, 8)}…${sha256.slice(-8)}`.toUpperCase().replace(/([0-9A-F]{4})(?=[0-9A-F])/g, '$1 ')

/**
 * Quanto falta para vencer, ao lado da validade. Com 1 dia ou menos, a hora do vencimento (`validoAte`): o certificado
 * vence numa hora do dia, e a emissão para nela, não no fim do dia.
 */
export function diasRestantes(dias?: number, validoAte?: string): string {
  if (dias === undefined) return ''
  if (dias < 0) return 'vencido'
  if (dias > 1) return `${numero(dias)} dias`
  const hora = validoAte ? dataHora(validoAte).split(' às ')[1] : undefined
  return `${dias === 0 ? 'vence hoje' : 'vence amanhã'}${hora ? ` às ${hora}` : ''}`
}

/** "vence hoje", "vence amanhã" ou "vence em N dias" (os dias do calendário de Brasília, que o servidor manda). */
const quandoVence = (dias: number) => (dias <= 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`)

/**
 * O texto da faixa do Painel, ou null quando não há o que avisar (sem certificado, ou em dia). `secao` e `onde`: a seção de
 * Configurações em que o administrador resolve. Para o operador (`administrador: false`), que não abre Configurações, o
 * texto diz que é com o administrador.
 */
export function textoFaixaCertificado(
  c: Pick<CertificadoDigitalPublico, 'situacao' | 'diasParaVencer' | 'validoAte'>,
  o: { administrador?: boolean } = {},
): { destaque: string; texto: string; grave: boolean; secao: 'certificado-digital' | 'empresa'; onde: string } | null {
  const adm = o.administrador !== false
  const dias = c.diasParaVencer ?? 0
  const bloqueio = adm
    ? 'Até resolver, o sistema não emite certificados.'
    : 'Até o administrador resolver, o sistema não emite certificados.'
  const noCertificado = { secao: 'certificado-digital' as const, onde: 'Configurações → Certificado digital' }
  switch (c.situacao) {
    case 'VENCENDO':
      return {
        // A data e a hora: o certificado vence numa hora do dia, e a emissão para nela
        destaque: `O certificado digital da empresa ${quandoVence(dias)}${c.validoAte ? ` (${dataHora(c.validoAte)})` : ''}.`,
        texto: adm
          ? 'A partir desse horário, o sistema para de emitir certificados até o novo ser instalado.'
          : 'A partir desse horário, o sistema para de emitir certificados até o administrador instalar o novo.',
        grave: false,
        ...noCertificado,
      }
    case 'VENCIDO':
      return { destaque: 'O certificado digital da empresa venceu.', texto: bloqueio, grave: true, ...noCertificado }
    case 'AINDA_NAO_VALE':
      return {
        destaque: 'O certificado digital da empresa ainda não vale.',
        texto: adm ? `Confira a data do servidor. ${bloqueio}` : bloqueio,
        grave: true,
        ...noCertificado,
      }
    case 'NAO_ABRE':
      return {
        destaque: 'O certificado digital da empresa não abre no servidor.',
        texto: bloqueio,
        grave: true,
        ...noCertificado,
      }
    case 'CNPJ_DIFERENTE':
      return {
        destaque: 'O CNPJ do certificado digital é diferente do CNPJ da empresa.',
        texto: bloqueio,
        grave: true,
        ...noCertificado,
      }
    case 'EMPRESA_SEM_CNPJ':
      return {
        destaque: 'O CNPJ da empresa não está preenchido.',
        texto: `Ele é conferido com o do certificado digital: até ${adm ? '' : 'o administrador '}preencher, o sistema não emite certificados.`,
        grave: true,
        secao: 'empresa',
        onde: 'Configurações → Empresa',
      }
    default:
      return null
  }
}

/**
 * A faixa do Painel dos emitidos com a assinatura digital que ainda não foram assinados (o PDF não é entregue até assinar).
 * `ver`: o fim da frase, que leva à lista deles.
 */
export function textoAguardandoAssinatura(n: number): { destaque: string; texto: string; ver: string } {
  return n === 1
    ? {
        destaque: '1 certificado aguardando assinatura digital.',
        texto: 'Até ser assinado, não pode ser baixado nem enviado.',
        ver: 'Veja qual é.',
      }
    : {
        destaque: `${numero(n)} certificados aguardando assinatura digital.`,
        texto: 'Até serem assinados, não podem ser baixados nem enviados.',
        ver: 'Veja quais são.',
      }
}

/**
 * Remover o certificado digital com emitidos aguardando a assinatura: só um certificado do MESMO CNPJ (os 14 dígitos) e do
 * mesmo titular os assina depois (o de outro estabelecimento da mesma empresa assina as emissões novas, não esses).
 */
export function avisoAoRemover(aguardando: number): string {
  return aguardando === 1
    ? '1 certificado emitido ainda aguarda a assinatura digital. Sem o certificado digital, ele não poderá ser baixado nem enviado até um certificado do mesmo CNPJ e do mesmo titular ser instalado de novo.'
    : `${numero(aguardando)} certificados emitidos ainda aguardam a assinatura digital. Sem o certificado digital, eles não poderão ser baixados nem enviados até um certificado do mesmo CNPJ e do mesmo titular ser instalado de novo.`
}

/**
 * O modal de instalar: qual certificado enviar (um e-CNPJ comprado só para o sistema, não o do contador: quem administra o
 * Windows do servidor consegue usar o certificado instalado) e o que é guardado.
 */
export const TEXTOS_INSTALAR = {
  descricao: 'O arquivo .pfx (ou .p12) do e-CNPJ comprado só para o sistema, com a chave privada, e a senha dele.',
  qual: 'Use um e-CNPJ comprado só para o BC Calibração, não o que o contador usa para notas fiscais, e-CAC e bancos: quem é administrador do Windows do servidor consegue usar o certificado instalado.',
  guardado:
    'A senha do certificado não é guardada: o sistema guarda só a chave, cifrada pelo Windows do servidor. Guarde o arquivo .pfx e a senha com a empresa: ao trocar de servidor ou reinstalar o Windows, é preciso enviá-lo de novo.',
} as const

/**
 * Configurações → Certificado → Revisão antes da emissão: o que acontece com a revisão ligada e desligada. Com o certificado
 * digital da empresa instalado (1.0.7), o certificado sai com os nomes, sem as imagens das assinaturas, e assinado
 * digitalmente pela empresa (como em `textoAssinaturasDaEmissao`).
 */
export function revisaoAntesDaEmissao(assinadoDigitalmente: boolean): { ligado: string; desligado: string } {
  const emitido = assinadoDigitalmente
    ? 'com os nomes de quem executou e de quem autorizou, sem as imagens das assinaturas, e assinado digitalmente pela empresa'
    : 'com duas assinaturas, a de quem executou e a de quem autorizou'
  const sai = assinadoDigitalmente
    ? 'sai com o nome de quem executou, sem a imagem da assinatura, e assinado digitalmente pela empresa'
    : 'sai só com a assinatura de quem executou'
  // Com o certificado digital, quem assina é a empresa, por todos: o que ninguém faz por outra pessoa é autorizar
  const ninguem = assinadoDigitalmente ? 'ninguém autoriza por outra pessoa' : 'ninguém assina por outra pessoa'
  return {
    ligado:
      'quem digita escolhe um signatário (nunca o técnico que executou nem quem escolheu o técnico) e envia para a ' +
      `autorização dele; o signatário confere, autoriza e o certificado é emitido ${emitido}. O signatário que não ` +
      `executou nem escolheu o técnico também pode autorizar direto: ${ninguem}.`,
    desligado: `qualquer pessoa que entrou no sistema emite, e o certificado ${sai} (quem emitiu fica registrado).`,
  }
}

/**
 * O PDF da emissão já foi assinado digitalmente (o hash registrado é o do assinado, ou as partes da assinatura estão
 * gravadas): só os emitidos com `assinaturaDigital`.
 */
export const assinadoDigitalmente = (e: Pick<EmissaoCertificado, 'hashPdf' | 'assinaturaDigital' | 'assinatura'>) =>
  !!e.assinaturaDigital && (!!e.hashPdf || !!e.assinatura)

/**
 * A assinatura digital na ficha do certificado: assinado (com o titular e o CNPJ); aguardando a assinatura (o emitido: o PDF
 * não é entregue até assinar); ou cancelado/substituído antes dela (ninguém assina depois: a cópia não tem assinatura). null
 * = emitido sem o certificado digital da empresa.
 */
export function assinaturaDaEmissao(
  e: Pick<EmissaoCertificado, 'hashPdf' | 'assinaturaDigital' | 'assinatura'>,
  status: StatusCalibracao,
): { tom: 'assinado' | 'aguardando' | 'sem'; texto: string } | null {
  if (!e.assinaturaDigital) return null
  if (assinadoDigitalmente(e)) return { tom: 'assinado', texto: `${textoAssinaturaDigitalVerificacao(e.assinaturaDigital)}.` }
  if (status === 'CANCELADO' || status === 'SUBSTITUIDO')
    return {
      tom: 'sem',
      texto: `${status === 'CANCELADO' ? 'Cancelado' : 'Substituído'} antes de ser assinado digitalmente: a cópia não tem assinatura digital.`,
    }
  return {
    tom: 'aguardando',
    texto:
      'Aguardando a assinatura digital: até ser assinado, o PDF não pode ser baixado nem enviado. Ele é assinado sozinho (ao abrir o PDF ou na tentativa automática) depois que o administrador resolver o problema do certificado digital da empresa.',
  }
}

/**
 * O que sai no certificado de quem executou e de quem autorizou: as imagens das assinaturas ou, com o certificado digital
 * da empresa instalado (1.0.7), só os nomes, e o PDF assinado digitalmente pela empresa.
 */
export function textoAssinaturasDaEmissao(exigir: boolean, assinadoDigitalmente: boolean): string {
  if (assinadoDigitalmente)
    return exigir
      ? 'O certificado sai com os nomes de quem executou e de quem autorizou, sem as imagens das assinaturas, e assinado digitalmente pela empresa.'
      : 'O certificado sai com o nome de quem executou, sem a imagem da assinatura, e assinado digitalmente pela empresa.'
  return exigir
    ? 'O certificado sai com duas assinaturas: a de quem executou e a de quem autorizou.'
    : 'O certificado sai só com a assinatura de quem executou.'
}

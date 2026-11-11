// Emissão e PDF dos certificados: monta os dados congelados, calcula, gera o PDF e o guarda em
// <dados>/certificados/<ano>/. O PDF emitido é o documento entregue ao cliente (o SHA-256 dele sai na
// verificação pública): é sempre servido do arquivo, conferido pelo hash, e o hash da emissão nunca muda.
// Se o arquivo sumir, o PDF refeito dos dados congelados só volta para a pasta se sair idêntico (a mesma
// versão do gerador); com outro layout seria outro documento, e é erro (`pdfEmitido`). Nenhum PDF da pasta é
// sobrescrito (`gravarSemSobrescrever`). A cópia de um cancelado ou substituído é esse mesmo documento com a
// marca d'água por cima (`carimbarMarcaDagua`), nunca um PDF refeito com o cálculo de hoje.

import { createHash, randomInt, X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { nomeArquivoSimples, PENDENCIA_POP, popNaData, textoPop, tipoDoMime } from '#shared/arquivos.ts'
import { avisoCargasDaConformidade, calcularCalibracao, regrasDoPopComoAviso } from '#shared/calibracao.ts'
import { mascaraCnpj, normalizarCnpj } from '#shared/documentos.ts'
import {
  arquivoDoCertificado,
  avisosEmissao,
  dataIsoValida,
  formatarDataBr,
  formatarNumeroCertificado,
  hojeLocalIso,
  nomeArquivoCertificado,
  nomeArquivoGuardado,
  padroesDaCalibracao,
  PENDENCIA_REVISADO_CANCELADO,
  PENDENCIA_REVISADO_NAO_EMITIDO,
  PENDENCIA_TECNICO_EXCLUIDO,
  pendenciasEmissao,
} from '#shared/dominio.ts'
import { impedimentoParaEmitir } from '#shared/permissoes.ts'
import type {
  AnexoEmailDisponivel,
  ArquivoAnexo,
  AssinaturaDigitalEmissao,
  Calibracao,
  CalibracaoInput,
  CertificadoDoPadrao,
  Configuracoes,
  EmissaoCertificado,
  Padrao,
  PartesAssinaturaPdf,
  PopEmitido,
  Signatario,
  SituacaoCertificadoDigital,
  Usuario,
  VersaoPop,
} from '#shared/tipos.ts'
import { type A1ParaAssinar, ErroAssinaturaPdf, ErroCertificadoDigital } from './assinatura/contrato.ts'
import { dataHoraBr, DIAS_AVISO_VENCIMENTO, diasParaVencer, quandoVence } from './assinatura/pfx.ts'
import type { Contexto } from './contexto.ts'
import { PROCEDIMENTO_EXEMPLO_ANTIGO } from './db.ts'
import { ErroApi } from './erros.ts'
import { assinarPdf, partesDoPdfAssinado, remontarPdf } from './pdf/assinaturaPdf.ts'
import { comImagensNaOrdemInversa } from './pdf/base.ts'
import { carimbarMarcaDagua, ErroCarimbo } from './pdf/carimbo.ts'
import { gerarCertificadoPdf } from './pdf/certificado.ts'
import { naUnidadeAtual } from './rascunhos.ts'

/** Código de autenticidade: 8 caracteres sem os que se confundem (0/O, 1/I/L), em dois grupos: "7F3K-92QD". */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export function gerarCodigo(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALFABETO[randomInt(ALFABETO.length)]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

const signatarioDe = (u: Usuario | undefined): Signatario => ({
  id: u?.id ?? '',
  nome: u?.nome ?? '',
  cargo: u?.cargo ?? '',
  registro: u?.registro ?? '',
  assinatura: u?.assinatura ?? '',
})

/**
 * Padrões usados, como valem para a calibração (`padroesDaCalibracao`): o cadastro na data da calibração (a versão
 * de antes de uma recalibração posterior) e, na revisão, os congelados na emissão original.
 */
export function padroesDa(
  ctx: Contexto,
  k: Pick<CalibracaoInput, 'padroesIds' | 'dataCalibracao'> & { padroesCongelados?: Padrao[] },
): Padrao[] {
  return padroesDaCalibracao(k, (id) => ctx.repo.obterPadrao(id))
}

/** Sem POP registrado não há o que pôr no certificado (o código e a revisão saem em toda página). */
export { PENDENCIA_POP }
/** O que sai no lugar do código do POP na prévia, enquanto nenhum POP foi registrado. */
export const PREVIA_SEM_POP = '(não cadastrado)'

/** A revisão do POP de uma calibração: `versao` (a registrada, com o arquivo; null = não está mais no banco ou é o
 * texto de um certificado legado), `pop` (o que fica congelado na emissão) e o texto que sai no certificado. */
export interface PopDaCalibracao {
  versao: VersaoPop | null
  pop: PopEmitido | null
  procedimento: string
}

const popEmitido = (v: VersaoPop): PopEmitido => ({
  id: v.id,
  codigo: v.codigo,
  revisao: v.revisao,
  data: v.data,
  arquivo: v.arquivo,
})
const daVersao = (v: VersaoPop): PopDaCalibracao => ({ versao: v, pop: popEmitido(v), procedimento: textoPop(v) })

/**
 * A revisão do POP registrada que a emissão congelou (`emissao.pop`): a do mesmo id com o mesmo código e nº (como
 * `popDaCalibracao` confere) ou, sem ela, a mesma (código e nº) registrada com outro id (a cópia do banco que voltou e
 * a registrou de novo). Nunca outra revisão que tenha o mesmo id; null = nenhuma.
 */
export function versaoDoPopEmitido(versoes: VersaoPop[], pop: Pick<PopEmitido, 'id' | 'codigo' | 'revisao'>): VersaoPop | null {
  const mesma = (v: VersaoPop) => v.codigo === pop.codigo && v.revisao === pop.revisao
  return versoes.find((v) => v.id === pop.id && mesma(v)) ?? versoes.find(mesma) ?? null
}

/**
 * A revisão do POP usada na calibração, a que o certificado cita (ISO/IEC 17025, 7.8.2.1: o método usado), e não a
 * vigente na emissão; null = nenhuma (sem POP registrado: pendência). Nesta ordem:
 * - a impressa na folha de campo da própria calibração (`Repositorio.popDaFolhaDaCalibracao`; numa revisão, a
 *   folha avulsa de uma visita nova, ligada a ela), salvo `semFolha` (a folha nova, que fica no lugar dela);
 * - revisão de certificado (a mesma visita): a do certificado revisado, com o mesmo texto (o arquivo é o que a
 *   revisão do POP tem agora: o anexado depois). O certificado emitido antes das revisões do POP: o procedimento que
 *   saiu nele (o exemplo de fábrica não conta);
 * - a impressa na folha herdada do certificado revisado;
 * - a que valia na data da calibração (`popNaData`: antes de todas, a mais antiga; sem a data, a vigente). `dataMinima`
 *   (yyyy-MM-dd): a primeira impressão da folha de campo (e a folha nova) usa a que vale no dia da impressão, se a data
 *   da calibração for antes dele (o rascunho nasce com a data do dia em que foi criado, e a folha vai a campo agora).
 */
export function popDaCalibracao(
  ctx: Contexto,
  k: Pick<Calibracao, 'id' | 'substituiId' | 'dataCalibracao'>,
  opcoes: { semFolha?: boolean; dataMinima?: string } = {},
): PopDaCalibracao | null {
  const versoes = ctx.repo.versoesPop()
  const daFolha = opcoes.semFolha ? null : ctx.repo.popDaFolhaDaCalibracao(k.id)
  if (daFolha && !daFolha.herdada) return daVersao(daFolha.pop)
  const original = k.substituiId ? ctx.repo.obterCalibracao(k.substituiId)?.emissao : undefined
  if (original?.pop) {
    const congelado = original.pop
    const v = versoes.find((x) => x.id === congelado.id && x.codigo === congelado.codigo && x.revisao === congelado.revisao)
    return {
      versao: v ?? null,
      pop: v ? popEmitido(v) : congelado,
      procedimento: original.textos.procedimento || textoPop(congelado),
    }
  }
  const legado = original?.textos.procedimento?.trim() ?? ''
  if (legado && legado !== PROCEDIMENTO_EXEMPLO_ANTIGO) {
    const v = versoes.find((x) => textoPop(x) === legado)
    return { versao: v ?? null, pop: v ? popEmitido(v) : null, procedimento: original!.textos.procedimento }
  }
  const minima = opcoes.dataMinima ?? ''
  const v = daFolha?.pop ?? popNaData(versoes, minima > k.dataCalibracao ? minima : k.dataCalibracao)
  return v ? daVersao(v) : null
}

/**
 * O que a tela mostra para conferir, sem impedir a emissão, da calibração em andamento: a folha de campo saiu com uma
 * revisão do POP que não é a que valia na data da calibração (`avisoDoPop`); a calibração sai sem a pressão atmosférica
 * onde a falta dela é só aviso (`avisosEmissao`); a declaração de conformidade pedida sem as cargas em que o EMA muda
 * (`avisoCargasDaConformidade`); e o certificado digital da empresa que vence em 30 dias (`avisoDoCertificadoDigital`;
 * o que não pode assinar agora é pendência).
 */
export function avisosDa(ctx: Contexto, k: Calibracao): string[] {
  if (k.status !== 'RASCUNHO' && k.status !== 'REVISAO') return []
  const balanca = ctx.repo.obterBalanca(k.balancaId)
  const cargas = balanca ? avisoCargasDaConformidade(k, balanca) : null
  return [
    ...avisoDoPop(ctx, k),
    ...(balanca ? avisosEmissao(k, { padroes: padroesDa(ctx, k), classe: balanca.classe }) : []),
    ...(cargas ? [cargas] : []),
    ...avisoDoCertificadoDigital(ctx),
  ]
}

/** Onde o administrador resolve o certificado digital da empresa. */
const ONDE_CERTIFICADO_DIGITAL = 'Configurações → Certificado digital'
const BLOQUEADA = `a emissão fica bloqueada até o administrador resolver em ${ONDE_CERTIFICADO_DIGITAL}.`

/**
 * O que impede o certificado digital instalado de assinar (a emissão é recusada até resolver), como pendência: quem vê
 * pode ser o operador, que não abre Configurações; o texto diz que é com o administrador. Não impede o envio para
 * autorização: a tela os reconhece pelo texto (shared/dominio.ts, `pendenciaDoCertificadoDigital`) e os mostra como aviso
 * a quem só envia.
 */
export const CERTIFICADO_DIGITAL_BLOQUEADO: Partial<Record<SituacaoCertificadoDigital, string>> = {
  VENCIDO: `O certificado digital da empresa venceu: ${BLOQUEADA}`,
  AINDA_NAO_VALE: `O certificado digital da empresa ainda não vale (confira a data e a hora do servidor): ${BLOQUEADA}`,
  NAO_ABRE: `O certificado digital da empresa não abre no servidor: ${BLOQUEADA}`,
  CNPJ_DIFERENTE:
    'O certificado digital da empresa é de um CNPJ diferente do que está em Configurações → Empresa: a emissão fica ' +
    `bloqueada até o administrador corrigir o CNPJ da empresa ou instalar o certificado digital certo em ${ONDE_CERTIFICADO_DIGITAL}.`,
  EMPRESA_SEM_CNPJ:
    'O CNPJ da empresa não está preenchido em Configurações → Empresa, e ele é conferido com o do certificado digital: a ' +
    'emissão fica bloqueada até o administrador preencher.',
}

/**
 * O certificado digital da empresa (1.0.7) que não pode assinar agora (vencido, ainda não vale, não abre no
 * servidor, outro CNPJ): a emissão é recusada até resolver, então é pendência (`pendenciasDa`). Nenhum instalado: nada
 * (os certificados saem sem assinatura digital). Sem `agora`, vale o relógio do serviço (o mesmo de `paraAssinar`).
 */
export function bloqueioDoCertificadoDigital(ctx: Contexto, agora?: Date): string[] {
  const servico = ctx.certificadoDigital
  if (!servico?.instalado()) return []
  const bloqueio = CERTIFICADO_DIGITAL_BLOQUEADO[servico.estado(ctx.repo.obterConfig().empresa.cnpj, agora).situacao]
  return bloqueio ? [bloqueio] : []
}

/**
 * O certificado digital da empresa (1.0.7) que vence em 30 dias ou menos, para quem vai emitir (o operador também, que não
 * abre Configurações): a emissão para na hora em que vencer, até o administrador instalar o novo (o que já impede a emissão
 * é `bloqueioDoCertificadoDigital`). Sem `agora`, vale o relógio do serviço (o mesmo de `paraAssinar`).
 */
export function avisoDoCertificadoDigital(ctx: Contexto, agora?: Date): string[] {
  const servico = ctx.certificadoDigital
  if (!servico?.instalado()) return []
  const e = servico.estado(ctx.repo.obterConfig().empresa.cnpj, agora)
  if ((e.situacao !== 'OK' && e.situacao !== 'VENCENDO') || !e.validoAte) return []
  const dias = e.diasParaVencer ?? diasParaVencer(e.validoAte, agora ?? new Date())
  if (dias < 0 || dias > DIAS_AVISO_VENCIMENTO) return []
  return [
    `O certificado digital da empresa ${quandoVence(dias)} (${dataHoraBr(new Date(e.validoAte))}). A partir desse horário, a emissão fica bloqueada até o administrador instalar o novo.`,
  ]
}

/**
 * A folha de campo da calibração em andamento saiu com uma revisão do POP que não é a que valia na data da calibração
 * (a data ficou a do dia em que o rascunho foi criado, ou a folha foi impressa antes de uma revisão nova). O
 * certificado cita a da folha (o papel que foi a campo); se a data estiver errada, basta corrigi-la. A folha herdada do
 * certificado revisado não conta (é a mesma visita).
 */
function avisoDoPop(ctx: Contexto, k: Pick<Calibracao, 'id' | 'dataCalibracao'>): string[] {
  if (!dataIsoValida(k.dataCalibracao)) return []
  const daFolha = ctx.repo.popDaFolhaDaCalibracao(k.id)
  if (!daFolha || daFolha.herdada) return []
  const versoes = ctx.repo.versoesPop()
  const naData = popNaData(versoes, k.dataCalibracao)
  const impressa = daFolha.pop
  if (!naData || naData.id === impressa.id) return []
  const folha = ctx.repo.folhaCampoDaCalibracao(k.id)?.numero ?? ''
  const mesmoCodigo = naData.codigo.trim().toLocaleUpperCase('pt-BR') === impressa.codigo.trim().toLocaleUpperCase('pt-BR')
  const valia = mesmoCodigo ? `a rev. ${naData.revisao}` : `o ${textoPop(naData)}`
  // `versoes`: da mais nova para a mais antiga
  const posicao = (id: number) => versoes.findIndex((x) => x.id === id)
  const quando = posicao(naData.id) < posicao(impressa.id) ? 'já' : 'ainda'
  return [
    `A folha de campo ${folha} saiu com o ${textoPop(impressa)}, mas em ${formatarDataBr(k.dataCalibracao)} ${quando} valia ${valia}. Confira a data da calibração.`,
  ]
}

/**
 * O que falta para emitir: cadastro (com a identificação da balança e o receptor, que o POP confere), padrões, POP,
 * cálculo e o certificado digital da empresa que não pode assinar agora (`bloqueioDoCertificadoDigital`). Na revisão de um certificado de antes das regras do POP, o cálculo recebe o certificado revisado (na unidade
 * de hoje da balança): a leitura fora do esperado que a revisão mudou é pendência (`EntradaCalculo.leiturasDoOriginal`).
 */
export function pendenciasDa(ctx: Contexto, k: Calibracao, o: { certificadoDigital?: boolean } = {}): string[] {
  const balanca = ctx.repo.obterBalanca(k.balancaId)
  if (!balanca) return ['Balança não encontrada.']
  const padroes = padroesDa(ctx, k)
  const p = pendenciasEmissao(k, {
    padroes,
    hoje: hojeLocalIso(),
    temPesos: padroes.some((x) => x.tipo === 'PESOS'),
    classe: balanca.classe,
    balanca,
  })
  // Técnico com a conta excluída (desativada continua valendo): o certificado sairia sem quem executou
  if (k.tecnicoId && !ctx.usuarios.obter(k.tecnicoId)) p.push(PENDENCIA_TECNICO_EXCLUIDO)
  // Revisão de um certificado que não está mais emitido (cancelado antes da trava de `Repositorio.cancelar`): a
  // emissão é recusada; a pendência vem primeiro (é a que a tela e a recusa mostram) e diz a saída
  if (k.substituiId) {
    const status = ctx.repo.obterCalibracao(k.substituiId)?.status
    if (status !== 'EMITIDO') p.unshift(status === 'CANCELADO' ? PENDENCIA_REVISADO_CANCELADO : PENDENCIA_REVISADO_NAO_EMITIDO)
  }
  if (!popDaCalibracao(ctx, k)) p.push(PENDENCIA_POP)
  // O certificado digital da empresa que não pode assinar agora: nenhum certificado sai sem a assinatura (`certificadoDigital:
  // false`: a emissão, que o confere à parte, em `certificadoParaAssinar`)
  if (o.certificadoDigital !== false) p.push(...bloqueioDoCertificadoDigital(ctx))
  try {
    const revisado = k.substituiId && regrasDoPopComoAviso(k) ? ctx.repo.obterCalibracao(k.substituiId) : undefined
    const original = revisado ? naUnidadeAtual(ctx, revisado) : null
    const { resultado, comoEncontrado } = calcularCalibracao(k, balanca, padroes, original)
    p.push(...resultado.pendencias)
    if (comoEncontrado) p.push(...comoEncontrado.pendencias.map((x) => `Como encontrado: ${x}`))
  } catch (e) {
    p.push(`Não foi possível calcular os resultados: ${e instanceof Error ? e.message : String(e)}`)
  }
  return [...new Set(p)]
}

/**
 * Dados do certificado a partir dos cadastros atuais (emissão e prévia do rascunho); os padrões como valiam para a
 * calibração (`padroesDa`) e o POP usado nela (`popDaCalibracao`). `assinaturaDigital`: o certificado digital da empresa
 * que vai assinar o PDF (o titular e o CNPJ saem impressos no quadro da assinatura; ver `salvarPdf`).
 */
export function montarEmissao(
  ctx: Contexto,
  k: Calibracao,
  config: Configuracoes,
  extra: {
    numero: string
    codigo: string
    emitidoPor: string
    signatarioId: string
    assinaturaDigital?: AssinaturaDigitalEmissao
  },
): EmissaoCertificado {
  const cliente = ctx.repo.obterCliente(k.clienteId)
  const balanca = ctx.repo.obterBalanca(k.balancaId)
  if (!cliente || !balanca) throw new ErroApi(409, 'O cliente ou a balança desta calibração não existe mais.')
  const original = k.substituiId ? ctx.repo.obterCalibracao(k.substituiId) : undefined
  const pop = popDaCalibracao(ctx, k)
  return {
    emitidoEm: new Date().toISOString(),
    emitidoPor: extra.emitidoPor,
    codigo: extra.codigo,
    hashPdf: '',
    arquivo: '',
    empresa: config.empresa,
    cliente,
    balanca,
    // O arquivo do certificado de cada padrão fica congelado junto (null = não havia arquivo anexado); os
    // arquivos dos certificados anteriores do padrão, não
    padroes: padroesDa(ctx, k).map(({ certificadosAnteriores: _anteriores, versoesAnteriores: _versoes, ...p }) => ({
      ...p,
      certificadoArquivo: p.certificadoArquivo ?? null,
    })),
    tecnico: signatarioDe(ctx.usuarios.obter(k.tecnicoId)),
    signatario: signatarioDe(ctx.usuarios.obter(extra.signatarioId)),
    // Com a revisão por outra pessoa desligada, só quem executou assina (mesmo que outra pessoa emita); ligada, quem
    // executou e quem autorizou. Fica congelado: mudar a configuração depois não muda os já emitidos
    assinaturas: config.exigirRevisor ? 'TECNICO_E_SIGNATARIO' : 'TECNICO',
    // O código e a revisão do POP usado na calibração (sai em toda página); a prévia sem POP avisa no lugar
    // (sem POP não há emissão: é pendência)
    textos: { ...config.textos, procedimento: pop ? pop.procedimento : PREVIA_SEM_POP },
    pop: pop?.pop ?? null,
    substituiNumero: original?.numero ?? '',
    substituiEmissao: original?.dataEmissao ?? '',
    // A correção sai com o mesmo nº do corrigido, como um certificado comum (o motivo fica só no sistema)
    ...(k.substituiId ? { mesmoNumero: true } : {}),
    // Calculado com as regras do POP: a revisão dele também as segue (`Repositorio.criarCalibracao`); o "crescente e
    // decrescente" sai "sem zerar" só no emitido a partir desta versão (`carregamentoSemZerar`)
    ...(regrasDoPopComoAviso(k) ? {} : { regrasDoPop: true, carregamentoSemZerar: true }),
    // A partir da 1.0.5: sem a finalidade de uso e as dimensões do prato, e com a inscrição estadual do cliente (quando
    // ele tem). Congelado: os emitidos antes continuam saindo como saíam
    semFinalidadeEDimensoes: true,
    inscricaoEstadualDoCliente: true,
    // A partir da 1.0.6: o nº do certificado de cada padrão numa linha só (congelado, como as de cima)
    certificadoDoPadraoInteiro: true,
    // As cargas em que o EMA muda entre os pontos sem a declaração de conformidade foram acordadas com o cliente (a
    // sugestão da 1.0.5 não as traz): a próxima calibração da balança as mantém. Não na calibração com a folha de antes
    // (que as trazia) nem na correção de um certificado de antes (os pontos são os dele)
    ...(k.cargasDoEmaNaFolha !== true && (!original || original.emissao?.cargasDoEmaAcordadas === true)
      ? { cargasDoEmaAcordadas: true }
      : {}),
    // A partir da 1.0.7, com o certificado digital da empresa instalado: o PDF sai assinado, sem as imagens das
    // assinaturas e com o quadro da assinatura digital (congelado, como as de cima; sem ele, como antes)
    ...(extra.assinaturaDigital ? { assinaturaDigital: { ...extra.assinaturaDigital } } : {}),
  }
}

/**
 * O certificado de calibração (arquivo) de cada padrão usado. Em andamento: os do cadastro. Emitido: o arquivo
 * que o cadastro do padrão tem agora para o mesmo certificado (o nº congelado na emissão; o atual ou um dos
 * anteriores, ver `arquivoDoCertificado`) — o anexado depois da emissão ou a correção de um arquivo anexado
 * errado; sem ele, o congelado na emissão. Nunca o de uma calibração mais nova do padrão (outro nº).
 */
export function certificadosDosPadroes(ctx: Contexto, k: Calibracao): CertificadoDoPadrao[] {
  const guardado = (a: ArquivoAnexo | null | undefined) => (a && ctx.repo.infoArquivo(a.sha256) ? a : null)
  return (k.emissao?.padroes ?? padroesDa(ctx, k)).map((p) => {
    const base = { padraoId: p.id, identificacao: p.identificacao, descricao: p.descricao, certificado: p.certificado }
    const proprio = guardado(p.certificadoArquivo)
    if (!k.emissao) return { ...base, arquivo: proprio, origem: proprio ? ('CADASTRO' as const) : ('' as const) }
    const atual = ctx.repo.obterPadrao(p.id)
    const doCadastro = atual ? guardado(arquivoDoCertificado(atual, p.certificado)) : null
    if (doCadastro && doCadastro.sha256 !== proprio?.sha256) return { ...base, arquivo: doCadastro, origem: 'CADASTRO' as const }
    return { ...base, arquivo: proprio, origem: proprio ? ('EMISSAO' as const) : ('' as const) }
  })
}

/** Um anexo possível do e-mail, com o conteúdo lido só na hora de enviar. */
export interface AnexoMontado extends AnexoEmailDisponivel {
  ler: () => Buffer
}

/**
 * Anexos do e-mail do certificado: o PDF do certificado (sempre) e os certificados dos padrões usados (um
 * arquivo só, quando dois padrões têm o mesmo certificado). `semArquivo`: os padrões sem o arquivo.
 */
export async function anexosDoCertificado(
  ctx: Contexto,
  k: Calibracao,
): Promise<{ anexos: AnexoMontado[]; semArquivo: CertificadoDoPadrao[] }> {
  const pdf = await pdfDaCalibracao(ctx, k)
  const certificado: AnexoMontado = {
    id: 'certificado',
    nome: nomeArquivoCertificado(k.numero),
    tipo: 'application/pdf',
    tamanho: pdf.length,
    obrigatorio: true,
    padroes: [],
    ler: () => pdf,
  }
  const certificados = certificadosDosPadroes(ctx, k)
  const porArquivo = new Map<string, { arquivo: ArquivoAnexo; padroes: CertificadoDoPadrao[] }>()
  for (const c of certificados) {
    if (!c.arquivo) continue
    const grupo = porArquivo.get(c.arquivo.sha256)
    if (grupo) grupo.padroes.push(c)
    else porArquivo.set(c.arquivo.sha256, { arquivo: c.arquivo, padroes: [c] })
  }
  const usados = new Set([certificado.nome.toLowerCase()])
  const anexos = [certificado]
  for (const [sha256, { arquivo, padroes }] of porArquivo) {
    const ext = tipoDoMime(arquivo.tipo) ?? 'pdf'
    const numero = padroes[0].certificado.trim()
    const base =
      nomeArquivoSimples(`Certificado-padrao-${padroes.map((p) => p.identificacao).join('-')}${numero ? `_${numero}` : ''}`) ||
      'Certificado-padrao'
    let nome = `${base}.${ext}`
    for (let n = 2; usados.has(nome.toLowerCase()); n++) nome = `${base}-${n}.${ext}`
    usados.add(nome.toLowerCase())
    anexos.push({
      id: `arquivo:${sha256}`,
      nome,
      tipo: arquivo.tipo,
      tamanho: ctx.repo.infoArquivo(sha256)?.tamanho ?? arquivo.tamanho,
      obrigatorio: false,
      padroes: padroes.map((p) => p.identificacao),
      ler: () => {
        const a = ctx.repo.lerArquivo(sha256)
        if (!a) throw new ErroApi(409, `O arquivo do certificado do padrão ${padroes[0].identificacao} não foi encontrado.`)
        return a.conteudo
      },
    })
  }
  return { anexos, semArquivo: certificados.filter((c) => !c.arquivo) }
}

/**
 * Gera o PDF de uma calibração com os dados indicados. `previa`: o rascunho, ainda não autorizado (sem as
 * imagens das assinaturas e sem "emitido em"). `naoAssinado`: a cópia de um cancelado ou substituído antes de ser
 * assinado digitalmente (ver `DadosCertificadoPdf.naoAssinado`).
 */
export async function gerarPdf(
  k: Calibracao,
  emissao: EmissaoCertificado,
  marcaDagua: string,
  previa = false,
  naoAssinado?: 'cancelado' | 'substituído',
): Promise<Buffer> {
  const { resultado, comoEncontrado } = calcularCalibracao(k, emissao.balanca, emissao.padroes)
  return gerarCertificadoPdf({
    calibracao: k,
    emissao,
    resultado,
    comoEncontrado,
    marcaDagua,
    previa,
    ...(naoAssinado ? { naoAssinado } : {}),
  })
}

/**
 * Onde fica o PDF do certificado, dentro de <dados>/certificados: "<ano>/Certificado-<nº>.pdf"; a correção com o mesmo
 * nº, com a versão ("<ano>/Certificado-<nº>-versao-2.pdf"; ver `nomeArquivoGuardado`), ao lado do PDF da anterior.
 */
const arquivoDoPdf = (k: Calibracao) => `${k.ano ?? 'sem-ano'}/${nomeArquivoGuardado(k)}`

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** Grava o arquivo inteiro ou nada (um arquivo pela metade não fica no lugar do certificado). */
function gravarArquivo(caminho: string, conteudo: Buffer) {
  mkdirSync(dirname(caminho), { recursive: true })
  const parcial = `${caminho}.parcial`
  writeFileSync(parcial, conteudo)
  renameSync(parcial, caminho)
}

/** O aviso da emissão gravada cujo PDF não pôde ser gravado na hora (disco cheio, antivírus travando o arquivo…). */
export const AVISO_PDF_NAO_GRAVADO =
  'O certificado foi emitido, mas o PDF não pôde ser gravado agora. Ele é gerado de novo ao abrir.'

const semPonto = (s: string) => s.trim().replace(/[.\s]+$/, '')

/**
 * O que acontece com o certificado que aguarda a assinatura, e quem resolve e onde (o texto vai também para o operador):
 * para o que impede o certificado digital instalado de assinar agora (vencido, não abre…). `resolver`: o que o
 * administrador faz (o CNPJ da empresa se corrige em Configurações → Empresa); padrão: resolver em Configurações →
 * Certificado digital.
 */
const assinadoDepois = (resolver = `resolver em ${ONDE_CERTIFICADO_DIGITAL}`) =>
  `Ele é assinado sozinho (ao abrir o PDF ou na tentativa automática) depois que o administrador ${resolver}.`

/**
 * O fim do texto quando só o certificado digital do CNPJ e do titular congelados na emissão o assina (`pdfAssinado`), e o
 * instalado não é ele (ou não há nenhum): Configurações mostra o instalado "Em dia", então o texto diz qual assina e a
 * saída, se ele não voltar (a correção sai com o certificado digital instalado; com nenhum, sem assinatura).
 */
const soOCertificadoDaEmissao = (digital: AssinaturaDigitalEmissao, haInstalado: boolean) =>
  `Só um certificado digital de ${digital.titular} (CNPJ ${mascaraCnpj(digital.cnpj)}) pode assiná-lo: ele é assinado ` +
  `sozinho (ao abrir o PDF ou na tentativa automática) quando o administrador instalar um em ${ONDE_CERTIFICADO_DIGITAL}. ` +
  `Se não houver, use “Corrigir certificado” na ficha dele${haInstalado ? ': a correção sai assinada com o certificado digital instalado' : ''}.`

/** O fim do texto quando o motivo não se resolve em Configurações (falha inesperada, PDF grande demais, parte pública ausente). */
const TENTA_DE_NOVO =
  'O sistema tenta de novo sozinho (ao abrir o PDF e na tentativa automática). Se continuar pendente, use “Corrigir ' +
  'certificado” na ficha dele.'

/**
 * O certificado digital `instalado` não é o do CNPJ e do titular congelados na emissão (`digital`): ele nunca a assina,
 * qualquer que seja a situação dele. O motivo, ou null quando é.
 */
function outroCertificado(instalado: { cnpj?: string; titular?: string }, digital: AssinaturaDigitalEmissao): string | null {
  if (instalado.cnpj && normalizarCnpj(instalado.cnpj) !== normalizarCnpj(digital.cnpj))
    return (
      `o certificado digital instalado é do CNPJ ${mascaraCnpj(instalado.cnpj)}, e este certificado de calibração foi ` +
      `emitido para ser assinado com o do CNPJ ${mascaraCnpj(digital.cnpj)}`
    )
  if (instalado.titular && instalado.titular.trim() !== digital.titular.trim())
    return (
      `o certificado digital instalado é de ${instalado.titular}, e este certificado de calibração foi emitido para ser ` +
      `assinado pelo de ${digital.titular}`
    )
  return null
}

/**
 * O motivo como segue "Motivo:": sem o ponto final e com a 1ª letra minúscula (salvo numa sigla, como "PDF"). O motivo é um
 * fato só ("o certificado digital da empresa venceu em …"), sem o que fazer: isso o texto diz uma vez, no fim.
 */
function comoMotivo(motivo: string): string {
  const s = motivo.trim().replace(/[.\s]+$/, '')
  const palavra = s.split(/\s/, 1)[0]
  return palavra.length > 1 && palavra === palavra.toLocaleUpperCase('pt-BR')
    ? s
    : s.charAt(0).toLocaleLowerCase('pt-BR') + s.slice(1)
}

/**
 * O aviso da emissão gravada cujo PDF não pôde ser assinado na hora (o certificado digital deixou de abrir, venceu entre
 * a emissão e a assinatura…). `{motivo}`: o porquê (`avisoPdfNaoAssinado`).
 */
export const AVISO_PDF_NAO_ASSINADO =
  'O certificado foi emitido, mas ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. ' +
  'Motivo: {motivo}. {depois}'
export const avisoPdfNaoAssinado = (motivo: string, depois = assinadoDepois()) =>
  AVISO_PDF_NAO_ASSINADO.replace('{motivo}', comoMotivo(motivo)).replace('{depois}', depois)

/**
 * O PDF de uma emissão com `assinaturaDigital` que não pôde ser assinado agora: a emissão continua gravada e o PDF não
 * é entregue (nem baixado, nem enviado) até ser assinado. `motivo`: o porquê (um fato, sem o que fazer), em português,
 * sem segredo do certificado.
 */
export class ErroAssinaturaPendente extends ErroApi {
  readonly motivo: string
  /** O fim do texto: quando ele é assinado e o que fazer (padrão: resolver em Configurações → Certificado digital). */
  readonly depois: string
  constructor(numero: string, motivo: string, depois = assinadoDepois()) {
    super(
      409,
      `O certificado ${numero} ainda não foi assinado digitalmente; até lá, não pode ser baixado nem enviado. ` +
        `Motivo: ${comoMotivo(motivo)}. ${depois}`,
      { codigo: 'CERTIFICADO_DIGITAL' },
    )
    this.motivo = motivo
    this.depois = depois
  }
}

/** O fato de uma recusa do certificado digital (o `motivo` que o serviço manda junto; sem ele, a mensagem). */
const motivoDe = (e: ErroApi) => {
  const m = (e.dados as { motivo?: unknown } | undefined)?.motivo
  return typeof m === 'string' && m ? m : e.message
}

/** O que o administrador faz para resolver a recusa (o `resolver` que o serviço manda junto), ou undefined. */
const resolverDe = (e: ErroApi) => {
  const r = (e.dados as { resolver?: unknown } | undefined)?.resolver
  return typeof r === 'string' && r ? r : undefined
}

/**
 * O certificado digital da empresa pronto para assinar (`ServicoCertificadoDigital.paraAssinar`, depois de o cofre
 * abrir na partida); null = nenhum instalado (ou o sistema sem o serviço). O que não pode assinar agora (vencido, ainda
 * não vale, não abre no servidor, outro CNPJ) é ErroApi 409 com o código CERTIFICADO_DIGITAL e a mensagem que
 * aponta Configurações → Certificado digital.
 */
async function certificadoParaAssinar(ctx: Contexto, config: Configuracoes): Promise<A1ParaAssinar | null> {
  const servico = ctx.certificadoDigital
  if (!servico) return null
  await servico.pronto()
  try {
    return servico.paraAssinar(config.empresa.cnpj)
  } catch (e) {
    if (e instanceof ErroCertificadoDigital) throw new ErroApi(409, e.message, { codigo: 'CERTIFICADO_DIGITAL' })
    throw e
  }
}

/**
 * Emite: confere, dá o número (o reservado na impressão da folha de campo, se houver; ver `Repositorio.emitir`),
 * congela os dados, gera e guarda o PDF. A emissão fica gravada antes do PDF (o nº já foi dado): se a gravação do PDF
 * falhar, ela não é desfeita nem repetida, e volta com `aviso`; o PDF é gerado e gravado ao abrir (`pdfEmitido`, sem
 * o hash registrado). Com o certificado digital da empresa instalado (1.0.7), todo certificado sai assinado: o que não
 * pode assinar agora recusa a emissão antes de dar o número (409, CERTIFICADO_DIGITAL); a assinatura que falhar depois
 * da emissão volta com o aviso AVISO_PDF_NAO_ASSINADO, e o certificado fica aguardando a assinatura (`salvarPdf`).
 * Quem emite fica registrado (`emissao.signatario`, `emitidoPor`); com a revisão por outra pessoa ligada, emitir é
 * autorizar, e só quem pode (`impedimentoParaEmitir`: um signatário que não seja o técnico e, com o
 * pedido de autorização, o escolhido) assina como "Autorizado por".
 */
export async function emitirCertificado(
  ctx: Contexto,
  id: string,
  autor: { id: string; nome: string; signatario: boolean },
  entrada: { versao?: number },
): Promise<{ calibracao: Calibracao; aviso?: string }> {
  const config = ctx.repo.obterConfig()
  const atual = ctx.repo.obterCalibracao(id)
  if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
  if (atual.status !== 'RASCUNHO' && atual.status !== 'REVISAO') throw new ErroApi(409, 'Este certificado já foi emitido.')
  // Quem emite é quem fica registrado (e, com a revisão ligada, quem assina como "Autorizado por")
  const signatarioId = autor.id
  const impedimento = impedimentoParaEmitir(config.exigirRevisor, atual, autor)
  if (impedimento)
    throw new ErroApi(autor.signatario ? 409 : 403, impedimento, autor.signatario ? {} : { codigo: 'SEM_PERMISSAO' })
  // O certificado digital fica de fora aqui: ele é conferido logo abaixo, com o código CERTIFICADO_DIGITAL
  const pendencias = pendenciasDa(ctx, atual, { certificadoDigital: false })
  if (pendencias.length) throw new ErroApi(409, pendencias[0], { pendencias })
  // Com o certificado digital instalado, nenhum certificado sai sem a assinatura: o que não pode assinar agora recusa
  // aqui, antes de gastar o nº (a sequência, a situação e a pasta ficam como estavam)
  const a1 = await certificadoParaAssinar(ctx, config)
  const assinaturaDigital: AssinaturaDigitalEmissao | undefined = a1
    ? { titular: a1.dados.titular, cnpj: a1.dados.cnpj, certificado: a1.dados.sha256 }
    : undefined

  const emitida = ctx.repo.emitir(
    id,
    (k, n) => {
      // De novo dentro da transação (o gravado ainda é o de antes da emissão): o pedido pode ter ido para outro signatário
      const gravada = ctx.repo.obterCalibracao(id)
      const agora = gravada && impedimentoParaEmitir(config.exigirRevisor, gravada, autor)
      if (agora) throw new ErroApi(409, agora)
      return montarEmissao(ctx, k, config, {
        numero: n.numero,
        codigo: n.codigo,
        emitidoPor: autor.nome,
        signatarioId,
        assinaturaDigital,
      })
    },
    {
      versao: entrada.versao,
      numero: (seq, ano, revisao) => formatarNumeroCertificado(config.numeracao, seq, ano, revisao),
      codigo: gerarCodigo,
      por: autor.nome,
    },
  )
  try {
    await salvarPdf(ctx, emitida)
  } catch (e) {
    if (e instanceof ErroAssinaturaPendente) {
      ctx.log.warn(`[certificados] o certificado ${emitida.numero} foi emitido, mas ainda não foi assinado: ${e.motivo}`)
      return { calibracao: ctx.repo.obterCalibracao(id)!, aviso: avisoPdfNaoAssinado(e.motivo, e.depois) }
    }
    ctx.log.warn(
      `[certificados] o certificado ${emitida.numero} foi emitido, mas o PDF não foi gravado: ${(e as Error)?.message ?? e}`,
    )
    return { calibracao: ctx.repo.obterCalibracao(id)!, aviso: AVISO_PDF_NAO_GRAVADO }
  }
  return { calibracao: ctx.repo.obterCalibracao(id)! }
}

/**
 * Gera o PDF do certificado emitido e grava o arquivo e o hash: só na emissão (ou se o servidor caiu entre a
 * emissão e esta gravação, sem o hash registrado). Depois disso, o hash da emissão não muda (`pdfEmitido`).
 * Nunca grava por cima de outro PDF (`gravarSemSobrescrever`). Na emissão com `assinaturaDigital` (1.0.7), o PDF
 * gravado é o assinado (`pdfAssinado`): o hash é o dele, e as partes da assinatura ficam na emissão antes do arquivo.
 */
async function salvarPdf(ctx: Contexto, k: Calibracao): Promise<Buffer> {
  if (!k.emissao) throw new ErroApi(409, 'Certificado sem dados de emissão.')
  const base = await gerarPdf(k, k.emissao, '')
  const pdf = k.emissao.assinaturaDigital ? await pdfAssinado(ctx, k, k.emissao.assinaturaDigital, base) : base
  const hash = sha256(pdf)
  const arquivo = gravarSemSobrescrever(ctx, k, arquivoDoPdf(k), pdf, hash)
  ctx.repo.registrarPdf(k.id, arquivo, hash)
  return pdf
}

/** "Cidade/UF" da empresa (o /Location da assinatura), como sai no fim do certificado. */
const localDaEmpresa = (e: EmissaoCertificado['empresa']) => [e.cidade, e.uf].filter((x) => String(x ?? '').trim()).join('/')

/**
 * O PDF assinado da emissão (`base`: o do pdfmake, dos dados congelados). Com as partes da assinatura já gravadas (o
 * servidor caiu ou a gravação falhou entre assinar e gravar o arquivo), ele é remontado delas, sem a chave e sem
 * assinar de novo: sai o mesmo arquivo, sem duplicata. Sem elas, assina agora com o certificado instalado, que tem de
 * ser válido agora, do CNPJ e do titular congelados na emissão (o que sai impresso no quadro), e grava as partes
 * (`Repositorio.registrarAssinatura`, uma vez só) antes de o arquivo ser gravado. A hora da assinatura (/M) é a real.
 * O que impedir a assinatura é ErroAssinaturaPendente: o PDF sem a assinatura nunca é gravado nem entregue.
 */
async function pdfAssinado(ctx: Contexto, k: Calibracao, digital: AssinaturaDigitalEmissao, base: Buffer): Promise<Buffer> {
  const pendente = (motivo: string, depois?: string) => new ErroAssinaturaPendente(k.numero, motivo, depois)
  // A situação do instalado, quando ele é o desta emissão e não pode assinar agora: o CNPJ da empresa diferente se corrige
  // em Configurações → Empresa (instalar o certificado digital "certo", como diz o 409 da emissão, não assinaria esta)
  let situacao: SituacaoCertificadoDigital | undefined
  try {
    // As gravadas no banco (outra gravação pode ter assinado depois de `k` ser lido)
    let partes = ctx.repo.obterCalibracao(k.id)?.emissao?.assinatura ?? k.emissao?.assinatura
    if (!partes) {
      // O banco voltou de uma cópia de antes da assinatura: o PDF assinado (e talvez já entregue) está na pasta
      const naPasta = assinadoNaPasta(ctx, k, base)
      if (naPasta) return naPasta
      const config = ctx.repo.obterConfig()
      // O instalado que não é do CNPJ e do titular congelados nunca assina esta emissão, vencido ou não, abra ou não
      if (ctx.certificadoDigital?.instalado()) {
        await ctx.certificadoDigital.pronto()
        const instalado = ctx.certificadoDigital.estado(config.empresa.cnpj)
        const outro = outroCertificado(instalado, digital)
        if (outro) throw pendente(outro, soOCertificadoDaEmissao(digital, true))
        situacao = instalado.situacao
      }
      const a1 = await certificadoParaAssinar(ctx, config)
      if (!a1) throw pendente('nenhum certificado digital da empresa está instalado', soOCertificadoDaEmissao(digital, false))
      const outro = outroCertificado(a1.dados, digital)
      if (outro) throw pendente(outro, soOCertificadoDaEmissao(digital, true))
      const assinado = await assinarPdf(base, a1, {
        m: new Date(),
        nome: digital.titular,
        local: localDaEmpresa(k.emissao!.empresa),
        motivo: `Emissão do certificado de calibração nº ${k.numero}`,
      })
      // Uma vez só: se outra gravação assinou antes, valem as partes dela (e o arquivo é o remontado delas)
      partes = ctx.repo.registrarAssinatura(k.id, assinado.partes)
      if (JSON.stringify(partes) === JSON.stringify(assinado.partes)) return assinado.pdf
    }
    const publico = ctx.certificadoDigital?.publicoPorSha256(partes.certificado)
    if (!publico) throw pendente('a parte pública do certificado digital que assinou este PDF não está no banco', TENTA_DE_NOVO)
    return remontarPdf(base, partes, publico)
  } catch (e) {
    if (e instanceof ErroAssinaturaPendente) throw e
    if (e instanceof ErroApi)
      throw pendente(
        motivoDe(e),
        assinadoDepois(situacao === 'CNPJ_DIFERENTE' ? 'corrigir o CNPJ da empresa em Configurações → Empresa' : resolverDe(e)),
      )
    if (e instanceof ErroCertificadoDigital || e instanceof ErroAssinaturaPdf) throw pendente(e.message, TENTA_DE_NOVO)
    ctx.log.error(`[certificados] falha ao assinar o PDF do certificado ${k.numero}: ${(e as Error)?.message ?? e}`)
    throw pendente('houve uma falha inesperada ao assinar (veja o registro do servidor)', TENTA_DE_NOVO)
  }
}

/**
 * O PDF assinado desta emissão que já está na pasta (com o nome dela), quando a emissão não tem as partes da assinatura: o
 * banco voltou de uma cópia feita antes de a assinatura ser registrada, sem o transplante (passo 3 do LEIA-ME). Assinar de
 * novo daria outro documento (outro /M), e o entregue ao cliente deixaria de conferir na verificação pública. Só é adotado
 * se começar pela base refeita e remontar idêntico das partes lidas dele, com a parte pública de um certificado que já foi
 * instalado (a tabela dos certificados digitais); as partes ficam gravadas (`registrarAssinatura`). Senão, null.
 */
function assinadoNaPasta(ctx: Contexto, k: Calibracao, base: Buffer): Buffer | null {
  const arquivo = arquivoDoPdf(k)
  const caminho = join(ctx.pastaDados, 'certificados', arquivo)
  if (!existsSync(caminho)) return null
  const pdf = readFileSync(caminho)
  let partes: PartesAssinaturaPdf
  try {
    partes = partesDoPdfAssinado(pdf, base)
    const publico = ctx.certificadoDigital?.publicoPorSha256(partes.certificado)
    if (!publico || !remontarPdf(base, partes, publico).equals(pdf)) return null
  } catch (e) {
    if (e instanceof ErroAssinaturaPdf) return null
    throw e
  }
  // Uma vez só: se outra gravação registrou partes antes, valem as dela (e o arquivo é o remontado delas)
  const gravadas = ctx.repo.registrarAssinatura(k.id, partes)
  if (JSON.stringify(gravadas) !== JSON.stringify(partes)) return null
  const detalhe = `O PDF assinado do certificado ${k.numero} que estava na pasta (certificados/${arquivo}) foi adotado: a emissão não tinha as partes da assinatura (o banco voltou de uma cópia de antes da assinatura).`
  ctx.usuarios.registrar('COPIA_RESTAURADA', { ip: 'local', detalhe })
  ctx.log.warn(`[certificados] ${detalhe}`)
  return pdf
}

/**
 * Grava o PDF em <dados>/certificados/`arquivo` sem nunca sobrescrever outro documento: o arquivo com o mesmo nome
 * e outro conteúdo é de um certificado já entregue que o banco não conhece (o banco voltou de uma cópia anterior à
 * emissão dele). Ele fica como está, e o novo ganha o começo do sha256 no nome ("Certificado-<nº>-<sha12>.pdf"),
 * com o aviso no registro de atividades. O mesmo conteúdo (gravar de novo) fica onde está. Devolve onde ficou.
 */
function gravarSemSobrescrever(ctx: Contexto, k: Calibracao, arquivo: string, pdf: Buffer, hash: string): string {
  const pasta = join(ctx.pastaDados, 'certificados')
  const mesmo = (a: string) => sha256(readFileSync(join(pasta, a))) === hash
  if (!existsSync(join(pasta, arquivo))) {
    gravarArquivo(join(pasta, arquivo), pdf)
    return arquivo
  }
  if (mesmo(arquivo)) return arquivo
  const outro = arquivo.replace(/\.pdf$/i, '') + `-${hash.slice(0, 12)}.pdf`
  if (existsSync(join(pasta, outro))) {
    if (mesmo(outro)) return outro
    throw new ErroApi(409, `Já há outros arquivos com o nome do PDF do certificado ${k.numero} na pasta certificados.`)
  }
  gravarArquivo(join(pasta, outro), pdf)
  const detalhe = `O PDF do certificado ${k.numero} foi gravado em certificados/${outro}: já havia outro arquivo com o mesmo nome (certificados/${arquivo}), que ficou como estava.`
  ctx.usuarios.registrar('COPIA_RESTAURADA', { ip: 'local', detalhe })
  ctx.log.warn(`[certificados] ${detalhe}`)
  return outro
}

/**
 * O PDF emitido refeito dos dados congelados, se sair idêntico ao da emissão (pelo hash), ou null. O emitido antes da
 * 1.0.4 (sem `assinaturas`) com duas assinaturas pode ter as imagens delas gravadas na ordem inversa (a 1.0.3 seguia a
 * ordem em que cada PNG terminava de descomprimir; ver `imagensNaOrdem` em pdf/base.ts): ele é refeito nas duas ordens.
 * O assinado digitalmente (1.0.7) é remontado das partes guardadas (`remontadoEmitido`).
 */
async function refazerEmitido(ctx: Contexto, k: Calibracao, emissao: EmissaoCertificado): Promise<Buffer | null> {
  const refeito = await gerarPdf(k, emissao, '')
  if (emissao.assinaturaDigital) return remontadoEmitido(ctx, k, emissao, refeito)
  if (sha256(refeito) === emissao.hashPdf) return refeito
  if (emissao.assinaturas) return null
  const inverso = await comImagensNaOrdemInversa(() => gerarPdf(k, emissao, ''))
  return sha256(inverso) === emissao.hashPdf ? inverso : null
}

/**
 * O PDF assinado que sumiu, remontado sem a chave (vale com o certificado digital trocado, vencido ou removido: nenhuma
 * assinatura nova é feita): a base refeita tem de ser a que foi assinada (`assinatura.hashBase`; senão o gerador mudou),
 * com a parte pública do certificado que assinou (a tabela dos certificados digitais) e a assinatura guardada, que
 * confere pela chave pública; e só vale se der o hash da emissão. Senão, null.
 */
function remontadoEmitido(ctx: Contexto, k: Calibracao, emissao: EmissaoCertificado, base: Buffer): Buffer | null {
  const partes = emissao.assinatura
  const nao = (porque: string) => {
    ctx.log.warn(`[certificados] o PDF assinado do certificado ${k.numero} não pôde ser refeito: ${porque}`)
    return null
  }
  if (!partes) return nao('as partes da assinatura não estão na emissão')
  if (sha256(base) !== partes.hashBase) return nao('o PDF refeito não é o que foi assinado (o gerador mudou)')
  const publico = ctx.certificadoDigital?.publicoPorSha256(partes.certificado)
  if (!publico) return nao('a parte pública do certificado digital que assinou não está no banco')
  let pdf: Buffer
  try {
    pdf = remontarPdf(base, partes, publico)
  } catch (e) {
    if (!(e instanceof ErroAssinaturaPdf)) throw e
    return nao(e.message)
  }
  return sha256(pdf) === emissao.hashPdf ? pdf : nao('o PDF remontado não tem o hash da emissão')
}

/**
 * A assinatura digital para a verificação pública: só a do PDF já assinado (com as partes e o hash registrados; o que
 * aguarda a assinatura, ou foi cancelado antes dela, não tem), com a validade do certificado que assinou (sem carimbo do
 * tempo, depois dela o validador do ITI dá "Indeterminado"). null = não assinado.
 */
export function assinaturaParaVerificacao(
  ctx: Contexto,
  emissao: EmissaoCertificado,
): { titular: string; cnpj: string; validoAte?: string } | null {
  const digital = emissao.assinaturaDigital
  if (!digital || !emissao.assinatura || !emissao.hashPdf) return null
  const publico = ctx.certificadoDigital?.publicoPorSha256(emissao.assinatura.certificado)
  let validoAte: string | undefined
  try {
    validoAte = publico ? new Date(new X509Certificate(publico.certificadoDer).validTo).toISOString() : undefined
  } catch {
    validoAte = undefined
  }
  return { titular: digital.titular, cnpj: digital.cnpj, ...(validoAte ? { validoAte } : {}) }
}

/** O nº de série do certificado digital que assinou o PDF da emissão, ou null (não assinado, ou o certificado sumiu). */
export function serieDaAssinatura(ctx: Contexto, emissao: EmissaoCertificado | null | undefined): string | null {
  const sha = emissao?.assinatura?.certificado
  const publico = sha ? ctx.certificadoDigital?.publicoPorSha256(sha) : null
  if (!publico) return null
  try {
    return new X509Certificate(publico.certificadoDer).serialNumber
  } catch {
    return null
  }
}

/**
 * O PDF do certificado emitido, o documento entregue ao cliente: o arquivo guardado, conferido pelo SHA-256 da
 * emissão (o da verificação pública). O arquivo alterado é erro. O que sumiu é refeito dos dados congelados e
 * só volta para a pasta se sair idêntico (a mesma versão do gerador); senão — outra versão, outro layout — é
 * erro, e nada é gravado: um PDF refeito agora não seria o documento emitido. O hash da emissão nunca muda. Sem o
 * hash registrado, o PDF é gerado e gravado agora (`salvarPdf`; na emissão com assinatura digital, assinado: se não
 * puder ser assinado agora, ErroAssinaturaPendente, e nada é entregue).
 */
async function pdfEmitido(ctx: Contexto, k: Calibracao, emissao: EmissaoCertificado): Promise<Buffer> {
  if (!emissao.hashPdf) return salvarPdf(ctx, k)
  const arquivo = emissao.arquivo || arquivoDoPdf(k)
  const caminho = join(ctx.pastaDados, 'certificados', arquivo)
  if (existsSync(caminho)) {
    const pdf = readFileSync(caminho)
    if (sha256(pdf) !== emissao.hashPdf)
      throw new ErroApi(
        409,
        `O PDF do certificado ${k.numero} (certificados/${arquivo}) foi alterado depois da emissão. Volte o original da cópia de segurança externa.`,
      )
    return pdf
  }
  const refeito = await refazerEmitido(ctx, k, emissao)
  if (!refeito)
    throw new ErroApi(
      409,
      `O PDF do certificado ${k.numero} não está na pasta de dados (certificados/${arquivo}). Volte essa pasta da cópia de segurança externa: um PDF refeito agora não seria o mesmo documento.`,
    )
  gravarArquivo(caminho, refeito)
  return refeito
}

/**
 * PDF para baixar ou enviar:
 * - emitido: o arquivo guardado, conferido pelo hash da emissão (`pdfEmitido`);
 * - cancelado ou substituído: esse mesmo documento, o entregue ao cliente, com a marca d'água por cima
 *   (`carimbarMarcaDagua`: os bytes dele ficam intactos no começo da cópia). Refeito agora, sairia com o cálculo e o
 *   layout de hoje, e o que motivou a revisão sumiria do registro (ISO/IEC 17025, 7.5 e 7.8.8). O arquivo e o hash
 *   da emissão ficam como estão; o arquivo sumido ou alterado é erro, como no emitido. Sem o PDF registrado (o
 *   servidor caiu entre a emissão e a gravação, e ninguém chegou a baixá-lo), não há documento entregue: sai o
 *   refeito, com a marca;
 * - rascunho: prévia com marca d'água e número provisório, sem as imagens das assinaturas (ninguém autorizou).
 */
export async function pdfDaCalibracao(ctx: Contexto, k: Calibracao): Promise<Buffer> {
  const config = ctx.repo.obterConfig()
  if (k.emissao) {
    if (k.status === 'EMITIDO') return pdfEmitido(ctx, k, k.emissao)
    const marca = k.status === 'CANCELADO' ? 'CANCELADO' : 'SUBSTITUÍDO'
    if (!k.emissao.hashPdf) return copiaSemPdfRegistrado(ctx, k, k.emissao, marca)
    const entregue = await pdfEmitido(ctx, k, k.emissao)
    try {
      return carimbarMarcaDagua(entregue, marca)
    } catch (e) {
      if (!(e instanceof ErroCarimbo)) throw e
      throw new ErroApi(
        409,
        `Não foi possível pôr a marca d'água "${marca}" no PDF do certificado ${k.numero} (certificados/${k.emissao.arquivo || arquivoDoPdf(k)}): ${e.message}. O arquivo continua como foi emitido.`,
      )
    }
  }
  return previa(ctx, k, config)
}

/**
 * A cópia de um cancelado ou substituído sem o PDF registrado (ninguém chegou a baixá-lo): o refeito dos dados congelados,
 * com a marca. Emitido para ser assinado digitalmente: com as partes já gravadas, o assinado remontado delas (sem a chave),
 * com a marca por cima; sem elas, o PDF assinado nunca existiu, e a cópia diz que não tem assinatura digital
 * (`naoAssinado`), em vez de "Documento assinado digitalmente por …".
 */
async function copiaSemPdfRegistrado(
  ctx: Contexto,
  k: Calibracao,
  emissao: EmissaoCertificado,
  marca: 'CANCELADO' | 'SUBSTITUÍDO',
): Promise<Buffer> {
  if (!emissao.assinaturaDigital) return gerarPdf(k, emissao, marca)
  const partes = emissao.assinatura
  if (!partes) return gerarPdf(k, emissao, marca, false, marca === 'CANCELADO' ? 'cancelado' : 'substituído')
  const publico = ctx.certificadoDigital?.publicoPorSha256(partes.certificado)
  try {
    if (!publico) throw new ErroAssinaturaPdf('a parte pública do certificado digital que assinou não está no banco')
    return carimbarMarcaDagua(remontarPdf(await gerarPdf(k, emissao, ''), partes, publico), marca)
  } catch (e) {
    if (!(e instanceof ErroAssinaturaPdf) && !(e instanceof ErroCarimbo)) throw e
    throw new ErroApi(
      409,
      `O PDF assinado do certificado ${k.numero} não pôde ser refeito (${semPonto(e.message)}). Volte a pasta certificados da cópia de segurança externa.`,
    )
  }
}

/**
 * O que a prévia mostra do certificado digital instalado (o titular e o CNPJ: "Na emissão, este certificado será
 * assinado digitalmente por …"); undefined = nenhum instalado (a prévia sai como a dos certificados sem assinatura).
 */
async function assinaturaDaPrevia(ctx: Contexto, config: Configuracoes): Promise<AssinaturaDigitalEmissao | undefined> {
  const servico = ctx.certificadoDigital
  if (!servico) return undefined
  await servico.pronto()
  if (!servico.instalado()) return undefined
  const e = servico.estado(config.empresa.cnpj)
  return e.titular && e.cnpj && e.sha256 ? { titular: e.titular, cnpj: e.cnpj, certificado: e.sha256 } : undefined
}

/**
 * Prévia do rascunho (com os dados atuais, mesmo os ainda não salvos). Nunca é assinada; com o certificado digital
 * instalado, sai com o layout do assinado e o aviso de que a emissão sairá assinada.
 */
export async function previa(ctx: Contexto, k: Calibracao, config = ctx.repo.obterConfig()): Promise<Buffer> {
  const provisorio: Calibracao = {
    ...k,
    numero: k.numero || 'PRÉVIA',
    dataEmissao: k.dataEmissao || hojeLocalIso(),
  }
  const emissao = montarEmissao(ctx, provisorio, config, {
    numero: provisorio.numero,
    codigo: 'XXXX-XXXX',
    emitidoPor: '',
    // Com o pedido de autorização, o signatário escolhido (a prévia não leva as imagens das assinaturas)
    signatarioId: (k.status === 'REVISAO' && k.autorizacao?.signatarioId) || k.signatarioId,
    assinaturaDigital: await assinaturaDaPrevia(ctx, config),
  })
  return gerarPdf(provisorio, emissao, 'PRÉVIA — SEM VALOR', true)
}

/** De quanto em quanto tempo o servidor tenta de novo gravar (e assinar) os PDFs dos emitidos que ficaram sem ele. */
export const INTERVALO_PDFS_PENDENTES_MS = 15 * 60_000

/** As tentativas em andamento (uma por servidor; a próxima não começa antes de a anterior terminar). */
const tentando = new WeakSet<Contexto>()

/**
 * A tentativa automática: grava os PDFs dos certificados emitidos sem o PDF registrado (a gravação falhou na emissão
 * ou, com a assinatura digital, o certificado não pôde ser assinado), um de cada vez, como ao abrir (`salvarPdf`).
 * Devolve os nºs gravados e os que continuam pendentes.
 */
export async function tentarPdfsPendentes(ctx: Contexto): Promise<{ gravados: string[]; falhas: string[] }> {
  const gravados: string[] = []
  const falhas: string[] = []
  if (tentando.has(ctx)) return { gravados, falhas }
  tentando.add(ctx)
  try {
    for (const id of ctx.repo.emitidosSemPdf()) {
      const k = ctx.repo.obterCalibracao(id)
      if (!k?.emissao || k.status !== 'EMITIDO' || k.emissao.hashPdf) continue
      try {
        await salvarPdf(ctx, k)
        gravados.push(k.numero)
      } catch (e) {
        falhas.push(k.numero)
        ctx.log.warn(`[certificados] o PDF do certificado ${k.numero} continua pendente: ${(e as Error)?.message ?? e}`)
      }
    }
  } finally {
    tentando.delete(ctx)
  }
  if (gravados.length) ctx.log.info(`[certificados] PDF(s) gravado(s) na tentativa automática: ${gravados.join(', ')}`)
  return { gravados, falhas }
}

/** Liga a tentativa automática a cada 15 minutos (`tentarPdfsPendentes`); devolve como desligar. */
export function iniciarTentativaPdfsPendentes(ctx: Contexto, intervalo = INTERVALO_PDFS_PENDENTES_MS): () => void {
  const timer = setInterval(() => {
    tentarPdfsPendentes(ctx).catch((e) => ctx.log.error(e, '[certificados] falha na tentativa automática dos PDFs'))
  }, intervalo)
  timer.unref()
  return () => clearInterval(timer)
}

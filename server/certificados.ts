// Emissão e PDF dos certificados: monta os dados congelados, calcula, gera o PDF e o guarda em
// <dados>/certificados/<ano>/. O PDF emitido é o documento entregue ao cliente (o SHA-256 dele sai na
// verificação pública): é sempre servido do arquivo, conferido pelo hash, e o hash da emissão nunca muda.
// Se o arquivo sumir, o PDF refeito dos dados congelados só volta para a pasta se sair idêntico (a mesma
// versão do gerador); com outro layout seria outro documento, e é erro (`pdfEmitido`). Nenhum PDF da pasta é
// sobrescrito (`gravarSemSobrescrever`). A cópia de um cancelado ou substituído é esse mesmo documento com a
// marca d'água por cima (`carimbarMarcaDagua`), nunca um PDF refeito com o cálculo de hoje.

import { createHash, randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { nomeArquivoSimples, PENDENCIA_POP, popNaData, textoPop, tipoDoMime } from '#shared/arquivos.ts'
import { calcularCalibracao, regrasDoPopComoAviso } from '#shared/calibracao.ts'
import {
  arquivoDoCertificado,
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
import { impedimentoDoRevisor } from '#shared/permissoes.ts'
import type {
  AnexoEmailDisponivel,
  ArquivoAnexo,
  Calibracao,
  CalibracaoInput,
  CertificadoDoPadrao,
  Configuracoes,
  EmissaoCertificado,
  Padrao,
  PopEmitido,
  Signatario,
  Usuario,
  VersaoPop,
} from '#shared/tipos.ts'
import type { Contexto } from './contexto.ts'
import { PROCEDIMENTO_EXEMPLO_ANTIGO } from './db.ts'
import { ErroApi } from './erros.ts'
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
 * O que a tela mostra para conferir, sem impedir a emissão: a folha de campo da calibração em andamento saiu com uma
 * revisão do POP que não é a que valia na data da calibração (a data ficou a do dia em que o rascunho foi criado, ou a
 * folha foi impressa antes de uma revisão nova). O certificado cita a da folha (o papel que foi a campo); se a data
 * estiver errada, basta corrigi-la. A folha herdada do certificado revisado não conta (é a mesma visita).
 */
export function avisosDa(ctx: Contexto, k: Pick<Calibracao, 'id' | 'status' | 'dataCalibracao'>): string[] {
  if ((k.status !== 'RASCUNHO' && k.status !== 'REVISAO') || !dataIsoValida(k.dataCalibracao)) return []
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
 * O que falta para emitir: cadastro (com a identificação da balança e o receptor, que o POP confere), padrões, POP e
 * cálculo. Na revisão de um certificado de antes das regras do POP, o cálculo recebe o certificado revisado (na unidade
 * de hoje da balança): a leitura fora do esperado que a revisão mudou é pendência (`EntradaCalculo.leiturasDoOriginal`).
 */
export function pendenciasDa(ctx: Contexto, k: Calibracao): string[] {
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
 * calibração (`padroesDa`) e o POP usado nela (`popDaCalibracao`).
 */
export function montarEmissao(
  ctx: Contexto,
  k: Calibracao,
  config: Configuracoes,
  extra: { numero: string; codigo: string; emitidoPor: string; signatarioId: string },
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
 * imagens das assinaturas e sem "emitido em").
 */
export async function gerarPdf(k: Calibracao, emissao: EmissaoCertificado, marcaDagua: string, previa = false): Promise<Buffer> {
  const { resultado, comoEncontrado } = calcularCalibracao(k, emissao.balanca, emissao.padroes)
  return gerarCertificadoPdf({ calibracao: k, emissao, resultado, comoEncontrado, marcaDagua, previa })
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

/**
 * Emite: confere, dá o número (o reservado na impressão da folha de campo, se houver; ver `Repositorio.emitir`),
 * congela os dados, gera e guarda o PDF. A emissão fica gravada antes do PDF (o nº já foi dado): se a gravação do PDF
 * falhar, ela não é desfeita nem repetida, e volta com `aviso`; o PDF é gerado e gravado ao abrir (`pdfEmitido`, sem
 * o hash registrado).
 */
export async function emitirCertificado(
  ctx: Contexto,
  id: string,
  autor: { id: string; nome: string; signatario: boolean },
  entrada: { signatarioId?: string; versao?: number },
): Promise<{ calibracao: Calibracao; aviso?: string }> {
  const config = ctx.repo.obterConfig()
  const atual = ctx.repo.obterCalibracao(id)
  if (!atual) throw new ErroApi(404, 'Calibração não encontrada.')
  if (atual.status !== 'RASCUNHO' && atual.status !== 'REVISAO') throw new ErroApi(409, 'Este certificado já foi emitido.')
  // Quem emite é quem autoriza: precisa ser signatário
  const signatarioId = autor.id
  if (!autor.signatario)
    throw new ErroApi(403, 'Só um signatário autoriza a emissão do certificado. Envie para revisão de um signatário.', {
      codigo: 'SEM_PERMISSAO',
    })
  // Nem o técnico, nem quem indicou o técnico (trocar o técnico para um colega não contorna a regra)
  const impedimento = impedimentoDoRevisor(config.exigirRevisor, atual, signatarioId)
  if (impedimento) throw new ErroApi(409, impedimento)
  const pendencias = pendenciasDa(ctx, atual)
  if (pendencias.length) throw new ErroApi(409, pendencias[0], { pendencias })

  const emitida = ctx.repo.emitir(
    id,
    (k, n) => montarEmissao(ctx, k, config, { numero: n.numero, codigo: n.codigo, emitidoPor: autor.nome, signatarioId }),
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
 * Nunca grava por cima de outro PDF (`gravarSemSobrescrever`).
 */
async function salvarPdf(ctx: Contexto, k: Calibracao): Promise<Buffer> {
  if (!k.emissao) throw new ErroApi(409, 'Certificado sem dados de emissão.')
  const pdf = await gerarPdf(k, k.emissao, '')
  const hash = sha256(pdf)
  const arquivo = gravarSemSobrescrever(ctx, k, arquivoDoPdf(k), pdf, hash)
  ctx.repo.registrarPdf(k.id, arquivo, hash)
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
 */
async function refazerEmitido(k: Calibracao, emissao: EmissaoCertificado): Promise<Buffer | null> {
  const refeito = await gerarPdf(k, emissao, '')
  if (sha256(refeito) === emissao.hashPdf) return refeito
  if (emissao.assinaturas) return null
  const inverso = await comImagensNaOrdemInversa(() => gerarPdf(k, emissao, ''))
  return sha256(inverso) === emissao.hashPdf ? inverso : null
}

/**
 * O PDF do certificado emitido, o documento entregue ao cliente: o arquivo guardado, conferido pelo SHA-256 da
 * emissão (o da verificação pública). O arquivo alterado é erro. O que sumiu é refeito dos dados congelados e
 * só volta para a pasta se sair idêntico (a mesma versão do gerador); senão — outra versão, outro layout — é
 * erro, e nada é gravado: um PDF refeito agora não seria o documento emitido. O hash da emissão nunca muda.
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
  const refeito = await refazerEmitido(k, emissao)
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
    if (!k.emissao.hashPdf) return gerarPdf(k, k.emissao, marca)
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

/** Prévia do rascunho (com os dados atuais, mesmo os ainda não salvos). */
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
    signatarioId: k.signatarioId,
  })
  return gerarPdf(provisorio, emissao, 'PRÉVIA — SEM VALOR', true)
}

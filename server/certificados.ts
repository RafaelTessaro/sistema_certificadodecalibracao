// Emissão e PDF dos certificados: monta os dados congelados, calcula, gera o PDF e o guarda em
// <dados>/certificados/<ano>/. O PDF emitido é sempre servido do arquivo; se ele sumir, é gerado
// de novo a partir dos dados congelados (fica igual).

import { createHash, randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { formatarDataBr, formatarNumeroCertificado, hojeLocalIso, nomeArquivoCertificado, pendenciasEmissao } from '#shared/dominio.ts'
import type { Calibracao, CalibracaoInput, Configuracoes, EmissaoCertificado, Padrao, Signatario, Usuario } from '#shared/tipos.ts'
import type { Contexto } from './contexto.ts'
import { ErroApi } from './erros.ts'
import { gerarCertificadoPdf } from './pdf/certificado.ts'

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

/** Padrões usados (versão atual do cadastro). */
export function padroesDa(ctx: Contexto, k: Pick<CalibracaoInput, 'padroesIds'>): Padrao[] {
  return k.padroesIds.map((id) => ctx.repo.obterPadrao(id)).filter((p): p is Padrao => !!p)
}

/** O que falta para emitir: cadastro, padrões e cálculo. */
export function pendenciasDa(ctx: Contexto, k: Calibracao): string[] {
  const balanca = ctx.repo.obterBalanca(k.balancaId)
  if (!balanca) return ['Balança não encontrada.']
  const padroes = padroesDa(ctx, k)
  const p = pendenciasEmissao(k, { padroes, hoje: hojeLocalIso(), temPesos: padroes.some((x) => x.tipo === 'PESOS') })
  try {
    const { resultado, comoEncontrado } = calcularCalibracao(k, balanca, padroes)
    p.push(...resultado.pendencias)
    if (comoEncontrado) p.push(...comoEncontrado.pendencias.map((x) => `Como encontrado: ${x}`))
  } catch (e) {
    p.push(`Não foi possível calcular os resultados: ${e instanceof Error ? e.message : String(e)}`)
  }
  return [...new Set(p)]
}

/** Dados do certificado a partir dos cadastros atuais (emissão e prévia do rascunho). */
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
  return {
    emitidoEm: new Date().toISOString(),
    emitidoPor: extra.emitidoPor,
    codigo: extra.codigo,
    hashPdf: '',
    arquivo: '',
    empresa: config.empresa,
    cliente,
    balanca,
    padroes: padroesDa(ctx, k),
    tecnico: signatarioDe(ctx.usuarios.obter(k.tecnicoId)),
    signatario: signatarioDe(ctx.usuarios.obter(extra.signatarioId)),
    textos: config.textos,
    substituiNumero: original?.numero ?? '',
    substituiEmissao: original?.dataEmissao ?? '',
  }
}

/** Conteúdo do QR code: o endereço de verificação ou, sem ele, os dados para conferir por telefone. */
function conteudoQr(config: Configuracoes, emissao: EmissaoCertificado, k: Calibracao): { qr: string; url: string } {
  const base = config.urlVerificacao.replace(/\/+$/, '')
  if (base) {
    const url = `${base}/#/verificar/${emissao.codigo}`
    return { qr: url, url }
  }
  const qr = [
    `CERTIFICADO DE CALIBRACAO ${k.numero}`,
    `Emissor: ${emissao.empresa.razaoSocial} - CNPJ ${emissao.empresa.cnpj}`,
    `Calibracao: ${formatarDataBr(k.dataCalibracao)} - Emissao: ${formatarDataBr(k.dataEmissao)}`,
    `Instrumento: serie ${emissao.balanca.numeroSerie || '-'}`,
    `Codigo de autenticidade: ${emissao.codigo}`,
  ].join('\n')
  return { qr, url: '' }
}

/** Gera o PDF de uma calibração com os dados indicados. */
export async function gerarPdf(k: Calibracao, emissao: EmissaoCertificado, config: Configuracoes, marcaDagua: string): Promise<Buffer> {
  const { resultado, comoEncontrado } = calcularCalibracao(k, emissao.balanca, emissao.padroes)
  const { qr, url } = conteudoQr(config, emissao, k)
  return gerarCertificadoPdf({ calibracao: k, emissao, resultado, comoEncontrado, marcaDagua, qrCode: qr, urlVerificacao: url })
}

const pastaCertificados = (ctx: Contexto, ano: number | null) => join(ctx.pastaDados, 'certificados', String(ano ?? 'sem-ano'))

/** Emite: confere, reserva o número, congela os dados, gera e guarda o PDF. */
export async function emitirCertificado(
  ctx: Contexto,
  id: string,
  autor: { id: string; nome: string; signatario: boolean },
  entrada: { signatarioId?: string; versao?: number },
): Promise<Calibracao> {
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
  if (config.exigirRevisor && atual.tecnicoId === signatarioId)
    throw new ErroApi(409, 'A empresa exige que outra pessoa revise e autorize: o técnico que executou não pode emitir o próprio certificado.')
  const pendencias = pendenciasDa(ctx, atual)
  if (pendencias.length) throw new ErroApi(409, pendencias[0], { pendencias })

  const emitida = ctx.repo.emitir(
    id,
    (k, n) => montarEmissao(ctx, k, config, { numero: n.numero, codigo: n.codigo, emitidoPor: autor.nome, signatarioId }),
    {
      versao: entrada.versao,
      numero: (seq, ano, revisao) => formatarNumeroCertificado(config.numeracao, seq, ano, revisao),
      codigo: gerarCodigo,
    },
  )
  await salvarPdf(ctx, emitida, config)
  return ctx.repo.obterCalibracao(id)!
}

/** Gera o PDF do certificado emitido e grava o arquivo e o hash. */
async function salvarPdf(ctx: Contexto, k: Calibracao, config: Configuracoes): Promise<Buffer> {
  if (!k.emissao) throw new ErroApi(409, 'Certificado sem dados de emissão.')
  const pdf = await gerarPdf(k, k.emissao, config, '')
  const pasta = pastaCertificados(ctx, k.ano)
  mkdirSync(pasta, { recursive: true })
  const arquivo = nomeArquivoCertificado(k.numero)
  writeFileSync(join(pasta, arquivo), pdf)
  ctx.repo.registrarPdf(k.id, `${k.ano}/${arquivo}`, createHash('sha256').update(pdf).digest('hex'))
  return pdf
}

/**
 * PDF para baixar ou enviar:
 * - emitido: o arquivo guardado (refeito a partir dos dados congelados se tiver sumido);
 * - cancelado ou substituído: refeito com a marca d'água;
 * - rascunho: prévia com marca d'água e número provisório.
 */
export async function pdfDaCalibracao(ctx: Contexto, k: Calibracao): Promise<Buffer> {
  const config = ctx.repo.obterConfig()
  if (k.emissao) {
    if (k.status === 'EMITIDO') {
      const caminho = k.emissao.arquivo ? join(ctx.pastaDados, 'certificados', k.emissao.arquivo) : ''
      if (caminho && existsSync(caminho)) return readFileSync(caminho)
      return salvarPdf(ctx, k, config)
    }
    return gerarPdf(k, k.emissao, config, k.status === 'CANCELADO' ? 'CANCELADO' : 'SUBSTITUÍDO')
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
  return gerarPdf(provisorio, emissao, config, 'PRÉVIA — SEM VALOR')
}

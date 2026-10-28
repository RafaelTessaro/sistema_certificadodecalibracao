// Emissão e PDF dos certificados: monta os dados congelados, calcula, gera o PDF e o guarda em
// <dados>/certificados/<ano>/. O PDF emitido é sempre servido do arquivo; se ele sumir, é gerado
// de novo a partir dos dados congelados (fica igual).

import { createHash, randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nomeArquivoSimples, PENDENCIA_POP, textoPop, tipoDoMime } from '#shared/arquivos.ts'
import { calcularCalibracao } from '#shared/calibracao.ts'
import {
  arquivoDoCertificado,
  formatarNumeroCertificado,
  hojeLocalIso,
  nomeArquivoCertificado,
  pendenciasEmissao,
} from '#shared/dominio.ts'
import type {
  AnexoEmailDisponivel,
  ArquivoAnexo,
  Calibracao,
  CalibracaoInput,
  CertificadoDoPadrao,
  Configuracoes,
  EmissaoCertificado,
  Padrao,
  Signatario,
  Usuario,
} from '#shared/tipos.ts'
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

/** Sem POP registrado não há o que pôr no certificado (o código e a revisão saem em toda página). */
export { PENDENCIA_POP }
/** O que sai no lugar do código do POP na prévia, enquanto nenhum POP foi registrado. */
export const PREVIA_SEM_POP = '(não cadastrado)'

/** O que falta para emitir: cadastro, padrões, POP e cálculo. */
export function pendenciasDa(ctx: Contexto, k: Calibracao): string[] {
  const balanca = ctx.repo.obterBalanca(k.balancaId)
  if (!balanca) return ['Balança não encontrada.']
  const padroes = padroesDa(ctx, k)
  const p = pendenciasEmissao(k, { padroes, hoje: hojeLocalIso(), temPesos: padroes.some((x) => x.tipo === 'PESOS') })
  if (!ctx.repo.popVigente()) p.push(PENDENCIA_POP)
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
  const pop = ctx.repo.popVigente()
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
    padroes: padroesDa(ctx, k).map(({ certificadosAnteriores: _anteriores, ...p }) => ({
      ...p,
      certificadoArquivo: p.certificadoArquivo ?? null,
    })),
    tecnico: signatarioDe(ctx.usuarios.obter(k.tecnicoId)),
    signatario: signatarioDe(ctx.usuarios.obter(extra.signatarioId)),
    // O código e a revisão do POP que vale agora (sai em toda página); a prévia sem POP avisa no lugar
    // (sem POP não há emissão: é pendência)
    textos: { ...config.textos, procedimento: pop ? textoPop(pop) : PREVIA_SEM_POP },
    pop: pop ? { id: pop.id, codigo: pop.codigo, revisao: pop.revisao, data: pop.data, arquivo: pop.arquivo } : null,
    substituiNumero: original?.numero ?? '',
    substituiEmissao: original?.dataEmissao ?? '',
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

/** Gera o PDF de uma calibração com os dados indicados. */
export async function gerarPdf(k: Calibracao, emissao: EmissaoCertificado, marcaDagua: string): Promise<Buffer> {
  const { resultado, comoEncontrado } = calcularCalibracao(k, emissao.balanca, emissao.padroes)
  return gerarCertificadoPdf({ calibracao: k, emissao, resultado, comoEncontrado, marcaDagua })
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
    throw new ErroApi(
      409,
      'A empresa exige que outra pessoa revise e autorize: o técnico que executou não pode emitir o próprio certificado.',
    )
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
  await salvarPdf(ctx, emitida)
  return ctx.repo.obterCalibracao(id)!
}

/** Gera o PDF do certificado emitido e grava o arquivo e o hash. */
async function salvarPdf(ctx: Contexto, k: Calibracao): Promise<Buffer> {
  if (!k.emissao) throw new ErroApi(409, 'Certificado sem dados de emissão.')
  const pdf = await gerarPdf(k, k.emissao, '')
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
      return salvarPdf(ctx, k)
    }
    return gerarPdf(k, k.emissao, k.status === 'CANCELADO' ? 'CANCELADO' : 'SUBSTITUÍDO')
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
  return gerarPdf(provisorio, emissao, 'PRÉVIA — SEM VALOR')
}

// Arquivos guardados no sistema (o certificado de calibração de cada padrão e o POP): o tipo é conferido
// pelo conteúdo (os primeiros bytes), nunca pelo nome; o mesmo arquivo vale para o servidor e para as telas.

import type { ArquivoAnexo } from './tipos.ts'

// Sem importar de dominio.ts (que importa daqui): os três utilitários que este módulo usa
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
function dataIsoValida(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && a >= 2000 && a <= 2100
}

/** Tamanho máximo de cada arquivo: 10 MB (um certificado escaneado em PDF fica bem abaixo disso). */
export const LIMITE_ARQUIVO_BYTES = 10 * 1024 * 1024

export type TipoArquivo = 'pdf' | 'jpg' | 'png' | 'docx'

export const MIME_ARQUIVO: Record<TipoArquivo, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export const ROTULO_TIPO_ARQUIVO: Record<TipoArquivo, string> = { pdf: 'PDF', jpg: 'JPG', png: 'PNG', docx: 'Word' }

/** Para que o arquivo é enviado: o certificado de um padrão (PDF ou imagem) ou o POP (PDF ou Word). */
export type FinalidadeArquivo = 'padrao' | 'pop'

export const TIPOS_DA_FINALIDADE: Record<FinalidadeArquivo, readonly TipoArquivo[]> = {
  padrao: ['pdf', 'jpg', 'png'],
  pop: ['pdf', 'docx'],
}

/** "PDF, JPG ou PNG" */
export function tiposAceitos(f: FinalidadeArquivo): string {
  const r = TIPOS_DA_FINALIDADE[f].map((t) => ROTULO_TIPO_ARQUIVO[t])
  return r.length > 1 ? `${r.slice(0, -1).join(', ')} ou ${r[r.length - 1]}` : r[0]
}

/** Extensões para o seletor de arquivos do navegador (`accept`). */
export function acceptDa(f: FinalidadeArquivo): string {
  const ext: Record<TipoArquivo, string> = { pdf: '.pdf', jpg: '.jpg,.jpeg', png: '.png', docx: '.docx' }
  return TIPOS_DA_FINALIDADE[f].flatMap((t) => [ext[t], MIME_ARQUIVO[t]]).join(',')
}

const comeca = (b: Uint8Array, assinatura: readonly number[], de = 0) =>
  b.length >= de + assinatura.length && assinatura.every((x, i) => b[de + i] === x)

/** Posição de `trecho` (ASCII) nos bytes, procurando até `ate`; -1 se não achar. */
function posicao(b: Uint8Array, trecho: string, ate = b.length): number {
  const alvo = [...trecho].map((c) => c.charCodeAt(0))
  const fim = Math.min(ate, b.length) - alvo.length
  for (let i = 0; i <= fim; i++) {
    if (b[i] !== alvo[0]) continue
    let k = 1
    while (k < alvo.length && b[i + k] === alvo[k]) k++
    if (k === alvo.length) return i
  }
  return -1
}

/**
 * Tipo do arquivo pelos primeiros bytes: PDF ("%PDF-" no começo; alguns programas põem lixo antes, até
 * 1 KB), JPG (FF D8 FF), PNG (a assinatura de 8 bytes) e Word .docx (um ZIP com a pasta `word/`). `null`
 * para qualquer outra coisa. Com `soCabecalho`, só os primeiros bytes foram lidos: um ZIP vale como .docx
 * (o servidor confere o arquivo inteiro).
 */
export function detectarTipoArquivo(b: Uint8Array, soCabecalho = false): TipoArquivo | null {
  if (posicao(b, '%PDF-', 1024) >= 0) return 'pdf'
  if (comeca(b, [0xff, 0xd8, 0xff])) return 'jpg'
  if (comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (comeca(b, [0x50, 0x4b, 0x03, 0x04]) && (soCabecalho || posicao(b, 'word/') >= 0)) return 'docx'
  return null
}

const MB = 1024 * 1024
const mb = (bytes: number) => (bytes / MB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

/**
 * O que há de errado com o arquivo para a finalidade (vazio, grande demais ou de outro tipo), ou `null`
 * quando serve. `tipo` é o detectado pelo conteúdo.
 */
export function problemaDoArquivo(tamanho: number, tipo: TipoArquivo | null, f: FinalidadeArquivo): string | null {
  if (!(tamanho > 0)) return 'O arquivo está vazio.'
  if (tamanho > LIMITE_ARQUIVO_BYTES)
    return `O arquivo tem ${mb(tamanho)} MB; o limite é ${mb(LIMITE_ARQUIVO_BYTES)} MB. Gere o PDF com resolução menor (150 a 200 dpi) e tente de novo.`
  if (!tipo || !TIPOS_DA_FINALIDADE[f].includes(tipo))
    return `Envie um arquivo ${tiposAceitos(f)}${f === 'padrao' ? ' (o certificado escaneado ou o PDF do laboratório)' : ''}.`
  return null
}

/** Nome de arquivo sem caminho e sem os caracteres que o Windows não aceita (até 150 letras). */
export function nomeArquivoSeguro(nome: unknown, padrao = 'arquivo'): string {
  const s = texto(nome, 400)
    .split(/[\\/]/)
    .pop()!
    .replace(/[\p{Cc}"*:<>?|]+/gu, '-')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s || /^\.+$/.test(s)) return padrao
  if (s.length <= 150) return s
  const ext = /\.[A-Za-z0-9]{1,5}$/.exec(s)?.[0] ?? ''
  return s.slice(0, 150 - ext.length) + ext
}

/** Nome só com letras sem acento, números, ".", "_" e "-" (para os anexos do e-mail). */
export function nomeArquivoSimples(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|-+$/g, '')
}

export const EXTENSAO_DO_MIME: Record<string, string> = Object.fromEntries(
  (Object.entries(MIME_ARQUIVO) as Array<[TipoArquivo, string]>).map(([t, m]) => [m, t]),
)

/** Tipo (pdf, jpg…) de um MIME guardado; `null` se não for um dos aceitos. */
export const tipoDoMime = (mime: string): TipoArquivo | null => (EXTENSAO_DO_MIME[mime] as TipoArquivo | undefined) ?? null

export const SHA256_VALIDO = /^[0-9a-f]{64}$/

/** Referência a um arquivo guardado, como veio de uma tela ou do banco; `null` quando não é uma referência válida. */
export function normalizarArquivoAnexo(v: unknown): ArquivoAnexo | null {
  if (v === null || v === undefined) return null
  const r = obj(v)
  const sha256 = typeof r.sha256 === 'string' ? r.sha256.toLowerCase() : ''
  if (!SHA256_VALIDO.test(sha256)) return null
  const tipo = typeof r.tipo === 'string' && tipoDoMime(r.tipo) ? r.tipo : ''
  const tamanho = typeof r.tamanho === 'number' && Number.isSafeInteger(r.tamanho) && r.tamanho > 0 ? r.tamanho : 0
  const enviadoEm = typeof r.enviadoEm === 'string' && !Number.isNaN(Date.parse(r.enviadoEm)) ? r.enviadoEm : ''
  return { sha256, nome: nomeArquivoSeguro(r.nome, 'certificado'), tamanho, tipo, enviadoEm }
}

/** Pendência de emissão sem POP registrado (o código e a revisão saem em toda página do certificado). */
export const PENDENCIA_POP = 'Cadastre o POP em Configurações → Certificado (código e revisão).'

/** Revisão do POP com dois algarismos: "0" → "00", "3" → "03"; '' quando não é um número de 0 a 999. */
export function revisaoPop(v: unknown): string {
  const s = texto(v, 10).replace(/^rev\.?\s*/i, '')
  return /^\d{1,3}$/.test(s) ? s.padStart(2, '0') : ''
}

/** "BALANÇAS-POP-123 rev. 00" (o que sai no certificado); só o código quando não há revisão. */
export function textoPop(p: { codigo: string; revisao: string }): string {
  const c = p.codigo.trim()
  const r = p.revisao.trim()
  return r ? `${c} rev. ${r}` : c
}

/** "PT-CAL-01 rev. 0" → código e revisão (o texto sem "rev." fica inteiro no código). */
export function separarProcedimento(p: string): { codigo: string; revisao: string } {
  const m = p.trim().match(/^(.*?)\s+rev\.?\s*(\S+)$/i)
  return m ? { codigo: m[1].trim(), revisao: m[2] } : { codigo: p.trim(), revisao: '' }
}

/** Entrada do registro de uma revisão do POP. */
export interface EntradaPop {
  codigo: string
  revisao: string
  data: string
  /** sha256 do arquivo já enviado (POST /api/arquivos), ou ''. */
  arquivo: string
  observacao: string
}

export function normalizarPop(entrada: unknown): { valor: EntradaPop; erros: string[] } {
  const r = obj(entrada)
  const erros: string[] = []
  const codigo = texto(r.codigo, 60).replace(/\s+/g, ' ')
  if (!codigo) erros.push('Informe o código do POP (ex.: BALANÇAS-POP-123).')
  else if (/\brev\b\.?/i.test(codigo)) erros.push('Escreva só o código; a revisão vai no campo ao lado.')
  const revisao = revisaoPop(r.revisao)
  if (!revisao) erros.push('Informe a revisão do POP com números (ex.: 00, 01).')
  const data = dataIsoValida(r.data) ? (r.data as string) : ''
  if (!data) erros.push('Informe a data da revisão do POP.')
  const arquivo = typeof r.arquivo === 'string' ? r.arquivo.toLowerCase() : ''
  if (arquivo && !SHA256_VALIDO.test(arquivo)) erros.push('Arquivo do POP inválido. Envie o arquivo de novo.')
  return { valor: { codigo, revisao, data, arquivo, observacao: texto(r.observacao, 300) }, erros }
}

// ---- Anexos do e-mail do certificado ------------------------------------------------------

/**
 * Soma máxima dos anexos de um e-mail: 18 MB. Em base64 (como o anexo viaja) fica perto de 24 MB, abaixo
 * dos 25 MB do Gmail e do Outlook.
 */
export const LIMITE_EMAIL_BYTES = 18 * 1024 * 1024
/** Quantidade máxima de anexos num e-mail. */
export const LIMITE_EMAIL_ANEXOS = 20

/** O que impede enviar estes anexos num e-mail só, ou `null` quando cabem. */
export function problemaDosAnexos(quantidade: number, bytes: number): string | null {
  if (quantidade > LIMITE_EMAIL_ANEXOS)
    return `São ${quantidade} anexos; o limite é ${LIMITE_EMAIL_ANEXOS} por e-mail. Desmarque alguns e envie-os num segundo e-mail.`
  if (bytes > LIMITE_EMAIL_BYTES)
    return `Os anexos somam ${mb(bytes)} MB; o limite é ${mb(LIMITE_EMAIL_BYTES)} MB por e-mail (acima disso o Gmail e outros servidores recusam a mensagem). Desmarque alguns certificados dos padrões e envie-os num segundo e-mail.`
  return null
}

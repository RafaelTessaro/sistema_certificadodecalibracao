// Arquivos guardados no sistema (o certificado de calibração de cada padrão e o POP): o tipo é conferido
// pelo conteúdo (os primeiros bytes), nunca pelo nome; o mesmo arquivo vale para o servidor e para as telas.

import type { ArquivoAnexo, VersaoPop } from './tipos.ts'

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
 * Começo de executável (MZ do Windows, ELF) ou de script e página (`<`, `@`, `#`, `'` depois de espaços,
 * ou texto em UTF-16): esses aceitam "%PDF-" num comentário e nunca são o lixo que um programa põe antes
 * do PDF.
 */
function pareceExecutavelOuScript(b: Uint8Array): boolean {
  if (comeca(b, [0xff, 0xfe]) || comeca(b, [0xfe, 0xff])) return true
  let i = comeca(b, [0xef, 0xbb, 0xbf]) ? 3 : 0
  if (comeca(b, [0x4d, 0x5a], i) || comeca(b, [0x7f, 0x45, 0x4c, 0x46], i)) return true
  while (i < b.length && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++
  return i < b.length && [0x3c, 0x40, 0x23, 0x27].includes(b[i])
}

/**
 * Tipo do arquivo pelos primeiros bytes: PDF ("%PDF-" no começo; alguns programas põem lixo antes, até
 * 1 KB, mas nunca o começo de um executável ou script), JPG (FF D8 FF), PNG (a assinatura de 8 bytes) e
 * Word .docx (um ZIP com a pasta `word/`). `null` para qualquer outra coisa. Com `soCabecalho`, só os
 * primeiros bytes foram lidos: um ZIP vale como .docx (o servidor confere o arquivo inteiro).
 */
export function detectarTipoArquivo(b: Uint8Array, soCabecalho = false): TipoArquivo | null {
  if (posicao(b, '%PDF-', 1024) >= 0) return pareceExecutavelOuScript(b) ? null : 'pdf'
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

/**
 * Nome de arquivo sem caminho, sem os caracteres que o Windows não aceita e sem os invisíveis (os que
 * invertem o texto na tela disfarçariam "fdp.exe" de "exe.pdf"); até 150 letras.
 */
export function nomeArquivoSeguro(nome: unknown, padrao = 'arquivo'): string {
  const s = texto(nome, 400)
    .split(/[\\/]/)
    .pop()!
    .replace(/\p{Cf}+/gu, '')
    .replace(/[\p{Cc}"*:<>?|]+/gu, '-')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s || /^\.+$/.test(s)) return padrao
  if (s.length <= 150) return s
  const ext = /\.[A-Za-z0-9]{1,5}$/.exec(s)?.[0] ?? ''
  return s.slice(0, 150 - ext.length) + ext
}

/** Extensões aceitas no nome de cada tipo (a primeira é a que se acrescenta). */
const EXTENSOES_DO_TIPO: Record<TipoArquivo, readonly string[]> = {
  pdf: ['pdf'],
  jpg: ['jpg', 'jpeg'],
  png: ['png'],
  docx: ['docx'],
}

/**
 * O nome com a extensão do tipo conferido pelo conteúdo: "x.pdf.exe" → "x.pdf", "scan.pdf" (PNG) →
 * "scan.png", "Certificado 12" → "Certificado 12.pdf". A extensão de outro tipo (uma palavra depois do
 * último ponto) sai; um número no fim ("nº 12.345") fica. Assim o arquivo baixado sempre abre com o
 * programa do tipo dele, nunca como um executável ou uma página. Sem nome, `padrao` com a extensão.
 */
export function nomeComExtensaoDoTipo(nome: string, tipo: TipoArquivo, padrao = 'arquivo'): string {
  const aceitas = EXTENSOES_DO_TIPO[tipo]
  // O Windows ignora pontos e espaços no fim do nome ("x.exe. ." é "x.exe")
  const semFim = (n: string) => n.replace(/[.\s]+$/, '')
  const extensao = (n: string) => /\.([A-Za-z][A-Za-z0-9]{0,5})$/.exec(n)?.[1]
  const aceita = (n: string) => {
    const e = extensao(n)
    return !!e && n.length > e.length + 1 && aceitas.includes(e.toLowerCase())
  }
  let base = semFim(nomeArquivoSeguro(nome, ''))
  if (aceita(base)) return base
  const ext = extensao(base)
  if (ext) base = semFim(base.slice(0, -ext.length - 1))
  // "x.pdf.exe": tirada a extensão de fora, sobra a do tipo
  if (aceita(base)) return base
  const final = `.${aceitas[0]}`
  return `${(base || padrao).slice(0, 150 - final.length).trimEnd()}${final}`
}

/** Extensões de cada tipo que o arquivo escolhido na tela pode ter (o Windows salva fotos da internet como .jfif). */
const EXTENSOES_NA_ESCOLHA: Record<TipoArquivo, readonly string[]> = {
  pdf: ['pdf'],
  jpg: ['jpg', 'jpeg', 'jfif', 'jpe'],
  png: ['png'],
  docx: ['docx'],
}

/**
 * O nome do arquivo escolhido na tela (ou arrastado, que não passa pelo filtro do seletor) tem a extensão de um tipo
 * aceito para a finalidade, ou nenhuma ("Certificado nº 12.345": um número depois do ponto não é extensão)? Uma página
 * com nome de documento ("Certificado.pdf.html", e o Windows esconde o ".html") é recusada já na escolha.
 */
export function extensaoAceita(nome: string, f: FinalidadeArquivo): boolean {
  // O Windows ignora pontos e espaços no fim do nome ("x.html. ." é "x.html")
  const ext = /\.([A-Za-z][A-Za-z0-9]{0,5})$/.exec(nome.replace(/[.\s]+$/, ''))?.[1]?.toLowerCase()
  return !ext || TIPOS_DA_FINALIDADE[f].some((t) => EXTENSOES_NA_ESCOLHA[t].includes(ext))
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

/** Nome de um arquivo guardado (MIME `mime`) com a extensão do tipo dele; o nome como está se o tipo não é conhecido. */
export function nomeDoArquivoGuardado(nome: string, mime: string): string {
  const tipo = tipoDoMime(mime)
  return tipo ? nomeComExtensaoDoTipo(nome, tipo) : nome
}

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

/**
 * A revisão do POP que valia numa data (yyyy-MM-dd): a última registrada com data até ela (a de maior id, como a
 * vigente); antes de todas, a mais antiga (a trazida das configurações tem a data da atualização do sistema); sem
 * data válida, a vigente. `versoes`: da mais nova para a mais antiga (`Repositorio.versoesPop`). null = nenhuma.
 */
export function popNaData(versoes: VersaoPop[], data: string): VersaoPop | null {
  if (!versoes.length) return null
  if (!dataIsoValida(data)) return versoes[0]
  return versoes.find((v) => dataIsoValida(v.data) && v.data <= data) ?? versoes[versoes.length - 1]
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

/**
 * Confere o registro de uma revisão do POP. `hoje` (yyyy-MM-dd): a data da revisão não pode ser depois dele (o
 * certificado cita a revisão pela data da calibração: uma com data no futuro não foi a usada em nenhuma).
 */
export function normalizarPop(entrada: unknown, hoje?: string): { valor: EntradaPop; erros: string[] } {
  const r = obj(entrada)
  const erros: string[] = []
  const codigo = texto(r.codigo, 60).replace(/\s+/g, ' ')
  if (!codigo) erros.push('Informe o código do POP (ex.: BALANÇAS-POP-123).')
  else if (/\brev\b\.?/i.test(codigo)) erros.push('Escreva só o código; a revisão vai no campo ao lado.')
  const revisao = revisaoPop(r.revisao)
  if (!revisao) erros.push('Informe a revisão do POP com números (ex.: 00, 01).')
  const data = dataIsoValida(r.data) ? (r.data as string) : ''
  if (!data) erros.push('Informe a data da revisão do POP.')
  else if (hoje && data > hoje) erros.push('A data da revisão do POP não pode ser no futuro.')
  const arquivo = typeof r.arquivo === 'string' ? r.arquivo.toLowerCase() : ''
  if (arquivo && !SHA256_VALIDO.test(arquivo)) erros.push('Arquivo do POP inválido. Envie o arquivo de novo.')
  return { valor: { codigo, revisao, data, arquivo, observacao: texto(r.observacao, 300) }, erros }
}

/** Quem registrou a revisão do POP trazida das configurações do certificado (migração 7, `server/db.ts`). */
export const POP_DA_ATUALIZACAO = 'Atualização do sistema'

/** Maiúsculas e minúsculas não contam, com acento ("Ç" = "ç"). */
const chaveCodigo = (c: string) => c.normalize('NFC').toLocaleUpperCase('pt-BR')
const dataBr = (iso: string) => iso.split('-').reverse().join('/')

/**
 * A revisão nova do POP vem depois das registradas (o certificado cita a que valia na data da calibração, `popNaData`:
 * uma com a data antes da vigente encobriria a vigente desde aquela data). A data: igual ou depois da vigente (a de maior
 * id), sem contar a trazida das configurações, que tem a data da atualização do sistema e não a do documento. No mesmo
 * código, o número maior que o de todas as registradas. `versoes`: da mais nova para a mais antiga
 * (`Repositorio.versoesPop`). `dataMinima`: para o campo da tela ('' = sem limite). A tela e o servidor usam esta.
 */
export function ordemDoPop(
  valor: Pick<EntradaPop, 'codigo' | 'revisao' | 'data'>,
  versoes: ReadonlyArray<Pick<VersaoPop, 'codigo' | 'revisao' | 'data' | 'criadoPor'>>,
): { erros: string[]; dataMinima: string } {
  const erros: string[] = []
  const doCodigo = versoes.filter((v) => chaveCodigo(v.codigo) === chaveCodigo(valor.codigo) && /^\d+$/.test(v.revisao))
  const maior = doCodigo.reduce<(typeof doCodigo)[number] | null>(
    (m, v) => (!m || Number(v.revisao) > Number(m.revisao) ? v : m),
    null,
  )
  if (maior && /^\d+$/.test(valor.revisao) && Number(valor.revisao) <= Number(maior.revisao))
    erros.push(`A revisão precisa ser maior que a rev. ${maior.revisao} do ${maior.codigo}.`)
  const referencia = versoes.find((v) => v.criadoPor !== POP_DA_ATUALIZACAO && dataIsoValida(v.data))
  const dataMinima = referencia?.data ?? ''
  if (referencia && dataIsoValida(valor.data) && valor.data < referencia.data)
    erros.push(`A data da revisão precisa ser igual ou posterior à da rev. ${referencia.revisao} (${dataBr(referencia.data)}).`)
  return { erros, dataMinima }
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

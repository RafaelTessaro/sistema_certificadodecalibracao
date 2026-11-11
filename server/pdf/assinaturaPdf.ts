// A assinatura digital do certificado emitido (PAdES baseline B-B, PLANO §2.1), numa atualização incremental (ISO
// 32000-1, 7.5.6) escrita pelo próprio sistema sobre o PDF do pdfmake: os bytes do gerador ficam intactos no começo e
// no fim entram o dicionário da assinatura, o campo invisível na 1ª página, o formulário e o catálogo reescrito.
//
// - /Sig: /Adobe.PPKLite + /ETSI.CAdES.detached, /ByteRange com tudo menos o /Contents (reserva fixa de 32 768 bytes),
//   /M (a hora da assinatura, UTC, ao segundo), /Name, /Location, /Reason (em UTF-16BE quando têm acento), DocMDP P=2
//   em /Reference (sem /Perms, como no guia do validar.iti.gov.br) e /Prop_Build com um nome sem espaço.
// - Campo: widget invisível (/Rect [0 0 0 0], /F 132) em /Annots da 1ª página; /AcroForm com /SigFlags 3, a extensão
//   ESIC (EN 319 142-1, 5.6) e o /Version /1.7 (o cabeçalho do pdfmake é %PDF-1.3) no catálogo; /Root e /Info copiados no
//   trailer, com /Prev e startxref exato; o 1º elemento do /ID copiado e o 2º novo (ISO 32000-1, 14.4), tirado das partes
//   (`idDaAtualizacao`), para remontar idêntico.
//
// Integridade: `assinarPdf` devolve, além do PDF, as partes variáveis (o valor RSA, o token do carimbo, o /M e os
// textos). Com elas e a parte pública do certificado, `remontarPdf` refaz o PDF assinado idêntico, sem a chave
// privada, a partir do mesmo PDF-base. A própria assinatura é conferida antes de ser devolvida, inclusive essa remontagem.

import { createHash } from 'node:crypto'
import type { PartesAssinaturaPdf } from '#shared/tipos.ts'
import { conferirCms, montarCms, remontarCms } from '../assinatura/cms.ts'
import {
  type A1ParaAssinar,
  ErroAssinaturaPdf,
  type OpcoesAssinatura,
  type PublicoParaRemontar,
  type ResultadoAssinatura,
} from '../assinatura/contrato.ts'
import {
  entradas,
  ErroSintaxePdf,
  escrever,
  escreverAtualizacao,
  lerPdf,
  type ObjetoEscrito,
  paginasDoPdf,
  valor,
} from './sintaxePdf.ts'

/** Bytes reservados para o CMS no /Contents (a cadeia ICP-Brasil real fica em ~8 KB; com carimbo, ~12 KB). */
export const RESERVA_CMS = 32_768
/** Dígitos de cada número do /ByteRange (até 9,3 GB). */
const LARGURA_FAIXA = 10
const FAIXA_VAZIA = `/ByteRange [0 ${'0'.repeat(LARGURA_FAIXA)} ${'0'.repeat(LARGURA_FAIXA)} ${'0'.repeat(LARGURA_FAIXA)}]`

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** Texto de string do PDF: literal quando é ASCII simples; senão, hexadecimal UTF-16BE com a marca FEFF. */
function textoPdfUnicode(t: string): string {
  if (/^[\x20-\x7e]*$/.test(t)) return `(${t.replace(/[\\()]/g, (c) => `\\${c}`)})`
  return `<FEFF${Buffer.from(t, 'utf16le').swap16().toString('hex').toUpperCase()}>`
}

/** Data do PDF em UTC: (D:AAAAMMDDHHmmSSZ). */
const dataPdf = (d: Date) => `(D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)`

interface Campo {
  m: Date
  nome: string
  local: string
  motivo: string
  reservado: number
  docmdp: 2
  /** O SHA-256 do certificado que assina (entra no 2º elemento do /ID). */
  certificado: string
}

/**
 * O 2º elemento do /ID da atualização da assinatura (ISO 32000-1, 14.4: muda a cada atualização): 16 bytes do SHA-256
 * do PDF-base e das partes que vão no dicionário da assinatura, sem o valor (que cobre o trailer). Determinístico: a
 * remontagem pelas partes dá o mesmo.
 */
const idDaAtualizacao = (base: Buffer, c: Campo) =>
  sha256(
    Buffer.from(
      JSON.stringify([sha256(base), c.m.toISOString(), c.certificado, c.nome, c.local, c.motivo, c.docmdp, c.reservado]),
      'utf8',
    ),
  ).slice(0, 32)

interface PdfComCampo {
  /** O PDF com o campo, o /ByteRange já preenchido e o /Contents zerado. */
  pdf: Buffer
  /** Onde fica o "<" e logo depois do ">" do /Contents. */
  inicio: number
  fim: number
  reservado: number
  /** Os bytes que a assinatura cobre (tudo menos o /Contents). */
  conteudo: Buffer
}

const erroEstrutura = (motivo: string) =>
  new ErroAssinaturaPdf(
    `O PDF não tem a estrutura que o sistema assina: ${motivo}. Só o PDF recém-gerado do certificado pode ser assinado.`,
  )

/** Acrescenta ao PDF do gerador o dicionário da assinatura (com a reserva), o campo e o formulário. */
function adicionarCampo(base: Buffer, c: Campo): PdfComCampo {
  try {
    const leitor = lerPdf(base)
    const { s, xref, tamanho, raiz, objeto } = leitor
    if (valor(xref.trailer, '/Prev') !== undefined) throw erroEstrutura('ele foi atualizado depois de gerado')
    const catalogo = entradas(s, objeto(raiz.num))
    if (valor(catalogo, '/AcroForm') !== undefined) throw erroEstrutura('ele já tem formulário (/AcroForm)')
    if (
      valor(catalogo, '/Perms') !== undefined ||
      valor(catalogo, '/Extensions') !== undefined ||
      valor(catalogo, '/Version') !== undefined
    )
      throw erroEstrutura('o catálogo já tem /Perms, /Extensions ou /Version')
    // A DocMDP em /Reference (PDF 1.5) e a extensão ESIC (sobre o 1.7) pedem o PDF 1.7: o pdfmake escreve %PDF-1.3, e a
    // atualização incremental não reescreve o cabeçalho, então a versão sobe pelo /Version do catálogo (ISO 32000-1,
    // 7.7.2), como no pyHanko. Sai só do cabeçalho da base: a remontagem pelas partes dá o mesmo
    const cabecalho = /^%PDF-(\d+)\.(\d+)/.exec(base.toString('latin1', 0, 16))
    if (!cabecalho) throw erroEstrutura('falta o cabeçalho %PDF')
    const subirVersao = Number(cabecalho[1]) * 10 + Number(cabecalho[2]) < 17
    const pagina = paginasDoPdf(leitor)[0]
    if (valor(pagina.d, '/Annots') !== undefined) throw erroEstrutura('a 1ª página já tem anotações (/Annots)')

    const [nSig, nCampo, nForm] = [tamanho, tamanho + 1, tamanho + 2]
    const sig = [
      '<<',
      '/Type /Sig',
      '/Filter /Adobe.PPKLite',
      '/SubFilter /ETSI.CAdES.detached',
      FAIXA_VAZIA,
      `/Contents <${'0'.repeat(c.reservado * 2)}>`,
      `/M ${dataPdf(c.m)}`,
      ...(c.nome ? [`/Name ${textoPdfUnicode(c.nome)}`] : []),
      ...(c.local ? [`/Location ${textoPdfUnicode(c.local)}`] : []),
      ...(c.motivo ? [`/Reason ${textoPdfUnicode(c.motivo)}`] : []),
      `/Reference [<< /Type /SigRef /TransformMethod /DocMDP /TransformParams << /Type /TransformParams /P ${c.docmdp} /V /1.2 >> >>]`,
      '/Prop_Build << /App << /Name /BC_Calibracao >> >>',
      '>>',
    ].join('\n')
    // Invisível: o texto da assinatura está impresso na página, dentro do conteúdo assinado. F 132 = Print + Locked
    const campo = [
      '<<',
      '/Type /Annot',
      '/Subtype /Widget',
      '/FT /Sig',
      '/T (Assinatura1)',
      `/V ${nSig} 0 R`,
      '/F 132',
      '/Rect [0 0 0 0]',
      `/P ${pagina.num} ${pagina.geracao} R`,
      '>>',
    ].join('\n')
    const formulario = `<<\n/Fields [${nCampo} 0 R]\n/SigFlags 3\n>>`
    const escritos: ObjetoEscrito[] = [
      { num: nSig, geracao: 0, corpo: sig },
      { num: nCampo, geracao: 0, corpo: campo },
      { num: nForm, geracao: 0, corpo: formulario },
      {
        num: raiz.num,
        geracao: xref.objetos.get(raiz.num)!.geracao,
        corpo: escrever([
          ...catalogo,
          ...(subirVersao ? ([['/Version', '/1.7']] as [string, string][]) : []),
          ['/AcroForm', `${nForm} 0 R`],
          ['/Extensions', '<< /ESIC << /BaseVersion /1.7 /ExtensionLevel 2 >> >>'],
        ]),
      },
      { num: pagina.num, geracao: pagina.geracao, corpo: escrever([...pagina.d, ['/Annots', `[${nCampo} 0 R]`]]) },
    ].sort((a, b) => a.num - b.num)

    const { texto, posicoes } = escreverAtualizacao(base, xref, escritos, tamanho + 3, { id2: idDaAtualizacao(base, c) })
    const pdf = Buffer.concat([base, Buffer.from(texto, 'latin1')])
    const corpoSig = posicoes.get(nSig)!.posicao + `${nSig} 0 obj\n`.length
    const posFaixa = corpoSig + sig.indexOf(FAIXA_VAZIA)
    const inicio = corpoSig + sig.indexOf('/Contents <') + '/Contents '.length
    const fim = inicio + c.reservado * 2 + 2
    if (
      pdf.toString('latin1', posFaixa, posFaixa + FAIXA_VAZIA.length) !== FAIXA_VAZIA ||
      pdf[inicio] !== 0x3c ||
      pdf[fim - 1] !== 0x3e
    )
      throw new ErroAssinaturaPdf('Não foi possível montar o campo da assinatura no PDF.')
    const faixa = `/ByteRange [0 ${[inicio, fim, pdf.length - fim].map((n) => String(n).padStart(LARGURA_FAIXA, ' ')).join(' ')}]`
    if (faixa.length !== FAIXA_VAZIA.length) throw new ErroAssinaturaPdf('O PDF é grande demais para ser assinado.')
    pdf.write(faixa, posFaixa, 'latin1')
    return { pdf, inicio, fim, reservado: c.reservado, conteudo: Buffer.concat([pdf.subarray(0, inicio), pdf.subarray(fim)]) }
  } catch (e) {
    if (e instanceof ErroSintaxePdf) throw erroEstrutura(e.message)
    throw e
  }
}

/** Grava o CMS (em hexadecimal, completado com zeros) no /Contents reservado. */
function preencher(p: PdfComCampo, cms: Buffer): Buffer {
  if (cms.length > p.reservado)
    throw new ErroAssinaturaPdf(
      `A assinatura (${cms.length} bytes) não cabe no espaço reservado no PDF (${p.reservado} bytes). A cadeia do certificado é longa demais.`,
    )
  const pdf = Buffer.from(p.pdf)
  pdf.write(
    cms
      .toString('hex')
      .toUpperCase()
      .padEnd(p.reservado * 2, '0'),
    p.inicio + 1,
    'latin1',
  )
  return pdf
}

/**
 * Assina o PDF recém-gerado (`base`) com o certificado da empresa. Confere o resultado (a assinatura sobre o que o
 * /ByteRange cobre e a remontagem pelas partes, sem a chave) antes de devolvê-lo com as partes a guardar.
 */
export async function assinarPdf(base: Buffer, a1: A1ParaAssinar, o: OpcoesAssinatura): Promise<ResultadoAssinatura> {
  const m = new Date(Math.floor(o.m.getTime() / 1000) * 1000)
  if (!Number.isFinite(m.getTime())) throw new ErroAssinaturaPdf('A hora da assinatura é inválida.')
  const campo = adicionarCampo(base, {
    m,
    nome: o.nome,
    local: o.local,
    motivo: o.motivo,
    reservado: RESERVA_CMS,
    docmdp: 2,
    certificado: a1.dados.sha256,
  })
  const { cms, valor: valorRsa, carimbo } = await montarCms(a1, campo.conteudo, { carimbo: o.carimbo })
  const pdf = preencher(campo, cms)
  const partes: PartesAssinaturaPdf = {
    formato: 1,
    m: m.toISOString(),
    reservado: RESERVA_CMS,
    nome: o.nome,
    local: o.local,
    motivo: o.motivo,
    docmdp: 2,
    valor: valorRsa.toString('base64'),
    ...(carimbo ? { carimbo: carimbo.toString('base64') } : {}),
    certificado: a1.dados.sha256,
    hashBase: sha256(base),
  }
  conferirPdfAssinado(pdf, a1.certificadoDer)
  if (!remontarPdf(base, partes, a1).equals(pdf))
    throw new ErroAssinaturaPdf('A assinatura não pôde ser conferida: a remontagem pelas partes não deu o mesmo arquivo.')
  return { pdf, partes }
}

/**
 * Refaz o PDF assinado a partir do mesmo PDF-base, das partes guardadas e da parte pública do certificado, sem a chave
 * privada. Recusa (ErroAssinaturaPdf) se o certificado não for o que assinou, se a base não for a mesma ou se a
 * assinatura guardada não conferir com o PDF refeito.
 */
export function remontarPdf(base: Buffer, partes: PartesAssinaturaPdf, publico: PublicoParaRemontar): Buffer {
  const m = new Date(partes?.m)
  if (
    partes?.formato !== 1 ||
    partes.docmdp !== 2 ||
    !Number.isInteger(partes.reservado) ||
    partes.reservado < 1024 ||
    partes.reservado > 1 << 20 ||
    !Number.isFinite(m.getTime())
  )
    throw new ErroAssinaturaPdf('As partes guardadas da assinatura estão num formato que o sistema não conhece.')
  if (sha256(publico.certificadoDer) !== partes.certificado)
    throw new ErroAssinaturaPdf('O certificado digital informado não é o que assinou este PDF.')
  if (sha256(base) !== partes.hashBase)
    throw new ErroAssinaturaPdf('O PDF refeito não é igual ao que foi assinado (o gerador mudou).')
  const campo = adicionarCampo(base, {
    m,
    nome: partes.nome,
    local: partes.local,
    motivo: partes.motivo,
    reservado: partes.reservado,
    docmdp: partes.docmdp,
    certificado: partes.certificado,
  })
  const cms = remontarCms(publico, campo.conteudo, {
    valorPronto: Buffer.from(partes.valor, 'base64'),
    ...(partes.carimbo ? { carimbo: Buffer.from(partes.carimbo, 'base64') } : {}),
  })
  return preencher(campo, cms)
}

/** O texto de uma string do PDF como `textoPdfUnicode` a escreve: literal "(…)" ou hexadecimal UTF-16BE "<FEFF…>". */
function lerTextoPdf(v: string): string {
  if (/^<FEFF([0-9A-F]{4})*>$/.test(v)) return Buffer.from(v.slice(5, -1), 'hex').swap16().toString('utf16le')
  if (v.startsWith('(') && v.endsWith(')')) return v.slice(1, -1).replace(/\\([\\()])/g, '$1')
  throw new ErroAssinaturaPdf('O texto da assinatura não está no formato do sistema.')
}

/**
 * As partes da assinatura de um PDF assinado pelo sistema sobre `base` (o PDF do pdfmake), lidas do próprio arquivo: para
 * adotar o PDF assinado que está na pasta quando o banco voltou de uma cópia de antes da assinatura (sem as partes). Só lê:
 * quem usa confere com `remontarPdf`, que tem de dar o mesmo arquivo byte a byte. Lança ErroAssinaturaPdf.
 */
export function partesDoPdfAssinado(pdf: Buffer, base: Buffer): PartesAssinaturaPdf {
  if (pdf.length <= base.length || !pdf.subarray(0, base.length).equals(base))
    throw new ErroAssinaturaPdf('O PDF não começa pelo PDF-base.')
  const lido = conferirPdfAssinado(pdf)
  const [, b, c] = lido.faixa
  const s = pdf.toString('latin1', base.length)
  const linha = (chave: string) => new RegExp(`^${chave} (.+)$`, 'm').exec(s)?.[1]
  const m = /^\(D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z\)$/.exec(linha('/M') ?? '')
  const docmdp = /\/TransformMethod \/DocMDP \/TransformParams << \/Type \/TransformParams \/P (\d) /.exec(s)?.[1]
  if (!m || docmdp !== '2' || !lido.titular) throw new ErroAssinaturaPdf('A assinatura do PDF não está no formato do sistema.')
  const texto = (chave: string) => {
    const v = linha(chave)
    return v === undefined ? '' : lerTextoPdf(v)
  }
  return {
    formato: 1,
    m: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`,
    reservado: (c - b - 2) / 2,
    nome: texto('/Name'),
    local: texto('/Location'),
    motivo: texto('/Reason'),
    docmdp: 2,
    valor: lido.valor.toString('base64'),
    ...(lido.carimbo ? { carimbo: lido.carimbo.toString('base64') } : {}),
    certificado: sha256(lido.titular),
    hashBase: sha256(base),
  }
}

/** O tamanho do elemento DER que começa em `b` (para tirar os zeros da reserva depois do CMS). */
function tamanhoDer(b: Buffer): number {
  if (b.length < 2 || b[0] !== 0x30) return -1
  if (b[1] < 0x80) return 2 + b[1]
  const n = b[1] & 0x7f
  if (n === 0 || n > 4 || b.length < 2 + n) return -1
  let tam = 0
  for (let i = 0; i < n; i++) tam = tam * 256 + b[2 + i]
  return 2 + n + tam
}

/**
 * Confere a (última) assinatura do PDF: o /ByteRange cobre o arquivo inteiro menos o /Contents, e o CMS confere
 * sobre esses bytes com o certificado do titular (`certificadoDer`, quando informado). Lança ErroAssinaturaPdf.
 */
export function conferirPdfAssinado(pdf: Buffer, certificadoDer?: Buffer) {
  const s = pdf.toString('latin1')
  const achado = [...s.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].at(-1)
  if (!achado) throw new ErroAssinaturaPdf('O PDF não tem assinatura digital.')
  const [a, b, c, d] = achado.slice(1).map(Number)
  if (a !== 0 || b <= 0 || c <= b + 1 || c + d !== pdf.length || s[b] !== '<' || s[c - 1] !== '>')
    throw new ErroAssinaturaPdf('A assinatura não cobre o arquivo inteiro.')
  const hex = s.slice(b + 1, c - 1)
  if (hex.length % 2 || !/^[0-9A-Fa-f]*$/.test(hex)) throw new ErroAssinaturaPdf('O conteúdo da assinatura é inválido.')
  const bruto = Buffer.from(hex, 'hex')
  const tamanho = tamanhoDer(bruto)
  if (tamanho < 0 || tamanho > bruto.length) throw new ErroAssinaturaPdf('O conteúdo da assinatura é inválido.')
  const cms = bruto.subarray(0, tamanho)
  const lido = conferirCms(cms, Buffer.concat([pdf.subarray(0, b), pdf.subarray(c)]), certificadoDer)
  return { ...lido, cms, faixa: [a, b, c, d] as const }
}

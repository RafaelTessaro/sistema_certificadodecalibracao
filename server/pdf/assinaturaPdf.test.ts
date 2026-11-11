// A assinatura do PDF emitido (PAdES B-B numa atualização incremental): o PDF do pdfmake fica intacto no começo, o
// /ByteRange cobre tudo menos o /Contents, o startxref é exato, a DocMDP P=2 vai em /Reference, os textos acentuados
// vão em UTF-16BE, assinar de novo dá os mesmos bytes e o PDF remonta idêntico das partes guardadas, sem a chave.
// Com o poppler instalado, o pdfsig confere a assinatura; com PYHANKO_PYTHON (um python com o pyHanko), o pyHanko também.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { arquivoPki, derPki, raizesTeste, SENHA, sha256 } from '../assinatura/__fixtures__/pki.ts'
import { lerCms } from '../assinatura/cms.ts'
import { type A1ParaAssinar, ErroAssinaturaPdf, type OpcoesAssinatura } from '../assinatura/contrato.ts'
import { abrirPfx } from '../assinatura/pfx.ts'
import { assinarPdf, conferirPdfAssinado, partesDoPdfAssinado, RESERVA_CMS, remontarPdf } from './assinaturaPdf.ts'
import { carimbarMarcaDagua } from './carimbo.ts'
import { gerarCertificadoPdf } from './certificado.ts'
import { exemploBalanca32kg, exemploPlataforma } from './exemplosCertificado.ts'

const existe = (programa: string, arg = '-v') => !spawnSync(programa, [arg], { stdio: 'ignore' }).error
const temPdfsig = existe('pdfsig')
const temPdftotext = existe('pdftotext')
const pythonPyhanko = process.env.PYHANKO_PYTHON

let base: Buffer
let outraBase: Buffer
let a1: A1ParaAssinar
const OPCOES: OpcoesAssinatura = {
  m: new Date('2026-11-11T14:30:15.789Z'),
  nome: 'BALANÇAS TESTE LTDA',
  local: 'Rio Claro/SP',
  motivo: 'Emissão do certificado de calibração nº 0123/2026',
}

beforeAll(async () => {
  base = await gerarCertificadoPdf(exemploPlataforma())
  outraBase = await gerarCertificadoPdf(exemploBalanca32kg())
  a1 = abrirPfx(arquivoPki('ecnpj-aes.pfx'), SENHA, { raizes: raizesTeste() })
}, 60_000)

const publico = () => ({ certificadoDer: a1.certificadoDer, cadeiaDer: a1.cadeiaDer })
const ultimo = (s: string, re: RegExp) => [...s.matchAll(re)].at(-1)!
const startxref = (s: string) => Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)![1])
/** O texto de uma string do PDF: literal "(…)" ou hexadecimal UTF-16BE "<FEFF…>". */
const textoDe = (v: string) =>
  v.startsWith('<FEFF') ? Buffer.from(v.slice(5, -1), 'hex').swap16().toString('utf16le') : v.slice(1, -1)

/** O dicionário (sem fluxo) do objeto `n` na atualização (a ocorrência mais nova). */
function objeto(s: string, n: number) {
  const i = s.lastIndexOf(`\n${n} 0 obj\n`)
  expect(i).toBeGreaterThan(0)
  return s.slice(i + `\n${n} 0 obj\n`.length, s.indexOf('\nendobj', i))
}

describe('assinarPdf', () => {
  it('acrescenta a assinatura sem tocar no PDF do pdfmake: ByteRange, startxref, xref e trailer exatos', async () => {
    const { pdf } = await assinarPdf(base, a1, OPCOES)
    expect(pdf.subarray(0, base.length).equals(base)).toBe(true)
    const s = pdf.toString('latin1')

    // /ByteRange [0 a b c]: tudo menos o "<…>" do /Contents, que tem a reserva fixa em hexadecimal
    const [, a, b, c] = ultimo(s, /\/ByteRange \[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)
      .slice(1)
      .map(Number)
    expect(s[a]).toBe('<')
    expect(s[b - 1]).toBe('>')
    expect(b + c).toBe(pdf.length)
    expect(b - a - 2).toBe(RESERVA_CMS * 2)
    expect(s.slice(a, b - 1).startsWith('<30')).toBe(true) // o CMS (SEQUENCE) e depois os zeros da reserva
    expect(s.indexOf('/Contents <', s.lastIndexOf('/ByteRange')) + '/Contents '.length).toBe(a)

    // O startxref aponta para a tabela nova, e cada entrada dela para o objeto certo
    const inicio = startxref(s)
    expect(inicio).toBeGreaterThan(base.length)
    expect(s.startsWith('xref\n0 1\n0000000000 65535 f \n', inicio)).toBe(true)
    const linhas = s.slice(inicio, s.indexOf('trailer', inicio)).split('\n').slice(3)
    let objetos = 0
    for (let i = 0; i < linhas.length && linhas[i].trim();) {
      const [primeiro, quantos] = linhas[i++].split(' ').map(Number)
      for (let n = 0; n < quantos; n++, i++) {
        const e = /^(\d{10}) (\d{5}) n $/.exec(linhas[i])!
        expect(s.startsWith(`${primeiro + n} ${Number(e[2])} obj`, Number(e[1]))).toBe(true)
        objetos++
      }
    }
    expect(objetos).toBe(5) // a assinatura, o campo, o formulário, o catálogo e a 1ª página

    // O trailer: o /Root e o /Info copiados, o /Size novo e o /Prev na tabela do pdfmake
    const trailer = (t: string) => t.slice(t.lastIndexOf('trailer'), t.lastIndexOf('startxref'))
    const doBase = trailer(base.toString('latin1'))
    const novo = trailer(s)
    for (const chave of ['/Root', '/Info'])
      expect(new RegExp(`${chave} [^\\n]+`).exec(novo)![0]).toBe(new RegExp(`${chave} [^\\n]+`).exec(doBase)![0])
    // O /ID (ISO 32000-1, 14.4): o 1º, permanente, copiado; o 2º muda a cada atualização (sai das partes, determinístico)
    const id = (t: string) => /\/ID\s*\[\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\]/.exec(t)!.slice(1)
    const [permanente, anterior] = id(doBase)
    const [primeiro, segundo] = id(novo)
    expect(primeiro).toBe(permanente)
    expect(segundo).not.toBe(anterior)
    expect(segundo).toMatch(/^[0-9a-f]{32}$/)
    const outraHora = await assinarPdf(base, a1, { ...OPCOES, m: new Date('2026-11-11T14:30:16Z') })
    expect(id(trailer(outraHora.pdf.toString('latin1')))[1]).not.toBe(segundo)
    expect(Number(/\/Size (\d+)/.exec(novo)![1])).toBe(Number(/\/Size (\d+)/.exec(doBase)![1]) + 3)
    expect(Number(/\/Prev (\d+)/.exec(novo)![1])).toBe(startxref(base.toString('latin1')))
  })

  it('o dicionário da assinatura: PAdES, DocMDP P=2 em /Reference (sem /Perms), /M, textos em UTF-16BE e o campo invisível', async () => {
    const { pdf } = await assinarPdf(base, a1, OPCOES)
    const s = pdf.toString('latin1')
    const tamanho = Number(/\/Size (\d+)/.exec(base.toString('latin1').slice(base.toString('latin1').lastIndexOf('trailer')))![1])
    const [nSig, nCampo, nForm] = [tamanho, tamanho + 1, tamanho + 2]
    const sig = objeto(s, nSig)
    expect(sig).toMatch(/\/Type \/Sig\n/)
    expect(sig).toMatch(/\/Filter \/Adobe\.PPKLite\n/)
    expect(sig).toMatch(/\/SubFilter \/ETSI\.CAdES\.detached\n/)
    expect(sig).toContain(
      '/Reference [<< /Type /SigRef /TransformMethod /DocMDP /TransformParams << /Type /TransformParams /P 2 /V /1.2 >> >>]',
    )
    expect(sig).toContain('/Prop_Build << /App << /Name /BC_Calibracao >> >>')
    // A hora real da assinatura, em UTC e truncada ao segundo
    expect(sig).toContain('/M (D:20261111143015Z)')
    // Com acento, UTF-16BE; sem acento, texto literal
    const campo = (k: string) => new RegExp(`${k} (\\([^)]*\\)|<FEFF[0-9A-F]+>)`).exec(sig)![1]
    expect(campo('/Name')).toMatch(/^<FEFF/)
    expect(textoDe(campo('/Name'))).toBe('BALANÇAS TESTE LTDA')
    expect(campo('/Location')).toBe('(Rio Claro/SP)')
    expect(textoDe(campo('/Reason'))).toBe('Emissão do certificado de calibração nº 0123/2026')

    // O campo invisível na 1ª página, o formulário com SigFlags 3 e o catálogo com a extensão ESIC, sem /Perms
    const widget = objeto(s, nCampo)
    expect(widget).toMatch(/\/FT \/Sig\n/)
    expect(widget).toContain(`/V ${nSig} 0 R`)
    expect(widget).toContain('/Rect [0 0 0 0]')
    expect(widget).toContain('/F 132')
    expect(objeto(s, nForm)).toContain(`/Fields [${nCampo} 0 R]`)
    expect(objeto(s, nForm)).toContain('/SigFlags 3')
    const raiz = Number(/\/Root (\d+) 0 R/.exec(s.slice(s.lastIndexOf('trailer')))![1])
    const catalogo = objeto(s, raiz)
    expect(catalogo).toContain(`/AcroForm ${nForm} 0 R`)
    expect(catalogo).toContain('/Extensions << /ESIC << /BaseVersion /1.7 /ExtensionLevel 2 >> >>')
    // O cabeçalho do pdfmake é %PDF-1.3: o catálogo sobe a versão para 1.7, a da ESIC e da DocMDP (ISO 32000-1, 7.7.2)
    expect(base.toString('latin1', 0, 8)).toBe('%PDF-1.3')
    expect(catalogo).toContain('/Version /1.7')
    expect(catalogo).not.toContain('/Perms')
    expect(catalogo).toContain('/Lang (pt-BR)') // o resto do catálogo do pdfmake fica
    const primeira = Number(/\/Kids \[(\d+) 0 R/.exec(objeto(s, Number(/\/Pages (\d+) 0 R/.exec(catalogo)![1])))![1])
    expect(objeto(s, primeira)).toContain(`/Annots [${nCampo} 0 R]`)
  })

  it('devolve as partes variáveis, e a assinatura confere com o certificado', async () => {
    const { pdf, partes } = await assinarPdf(base, a1, OPCOES)
    expect(partes).toEqual({
      formato: 1,
      m: '2026-11-11T14:30:15.000Z',
      reservado: RESERVA_CMS,
      nome: OPCOES.nome,
      local: OPCOES.local,
      motivo: OPCOES.motivo,
      docmdp: 2,
      valor: expect.any(String),
      certificado: a1.dados.sha256,
      hashBase: sha256(base),
    })
    expect(Buffer.from(partes.valor, 'base64')).toHaveLength(256)
    const conferido = conferirPdfAssinado(pdf, a1.certificadoDer)
    expect(conferido.valor.toString('base64')).toBe(partes.valor)
    // SET OF em DER: os certificados ordenados pela codificação (X.690 11.6), não titular → AC → raiz
    expect(conferido.certificados.map(sha256)).toEqual([a1.certificadoDer, ...a1.cadeiaDer].sort(Buffer.compare).map(sha256))
  })

  it('B-B: a mesma chave e a mesma hora dão os mesmos bytes', async () => {
    const um = await assinarPdf(base, a1, OPCOES)
    const outro = await assinarPdf(base, a1, { ...OPCOES, m: new Date('2026-11-11T14:30:15.001Z') })
    expect(sha256(outro.pdf)).toBe(sha256(um.pdf))
    expect(outro.partes).toEqual(um.partes)
  })

  it('remonta idêntico das partes, sem a chave; com outra base ou outro certificado, recusa', async () => {
    const { pdf, partes } = await assinarPdf(base, a1, OPCOES)
    const refeito = remontarPdf(Buffer.from(base), JSON.parse(JSON.stringify(partes)), publico())
    expect(sha256(refeito)).toBe(sha256(pdf))

    expect(() => remontarPdf(outraBase, partes, publico())).toThrow(ErroAssinaturaPdf)
    expect(() => remontarPdf(outraBase, partes, publico())).toThrow(/gerador/)
    // Mesmo com o hashBase trocado, a assinatura guardada não confere com outro PDF
    expect(() => remontarPdf(outraBase, { ...partes, hashBase: sha256(outraBase) }, publico())).toThrow(
      /assinatura guardada não confere/,
    )
    expect(() => remontarPdf(base, partes, { certificadoDer: derPki('outro'), cadeiaDer: a1.cadeiaDer })).toThrow(
      /não é o que assinou/,
    )
    expect(() => remontarPdf(base, { ...partes, m: '2026-11-11T14:30:16.000Z' }, publico())).toThrow(/não confere/)
  })

  it('o carimbo do tempo (quando houver) vai nas partes e entra de novo na remontagem', async () => {
    const token = Buffer.from('3003020107', 'hex') // um SEQUENCE qualquer, só para a estrutura
    const { pdf, partes } = await assinarPdf(base, a1, { ...OPCOES, carimbo: async () => token })
    expect(partes.carimbo).toBe(token.toString('base64'))
    expect(lerCms(conferirPdfAssinado(pdf, a1.certificadoDer).cms).carimbo).toEqual(token)
    expect(sha256(remontarPdf(base, partes, publico()))).toBe(sha256(pdf))
  })

  it('recusa com erro claro o CMS que não cabe na reserva', async () => {
    const cadeiaGrande = { ...a1, cadeiaDer: Array.from({ length: 40 }, () => derPki('raiz')) }
    await expect(assinarPdf(base, cadeiaGrande, OPCOES)).rejects.toThrow(/não cabe no espaço reservado/)
  })

  it('recusa o PDF que já tem anotações, formulário ou atualização', async () => {
    const pdf = (catalogo: string, pagina: string) =>
      montarPdf({
        1: `<< /Type /Catalog /Pages 2 0 R ${catalogo}>>`,
        2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] ${pagina}>>`,
      })
    const simples = await assinarPdf(pdf('', ''), a1, OPCOES)
    expect(conferirPdfAssinado(simples.pdf, a1.certificadoDer)).toBeTruthy()
    await expect(assinarPdf(pdf('', '/Annots [] '), a1, OPCOES)).rejects.toThrow(/já tem anotações \(\/Annots\)/)
    await expect(assinarPdf(pdf('/AcroForm << /Fields [] >> ', ''), a1, OPCOES)).rejects.toThrow(/já tem formulário/)
    await expect(assinarPdf(simples.pdf, a1, OPCOES)).rejects.toThrow(ErroAssinaturaPdf)
    await expect(assinarPdf(carimbarMarcaDagua(base, 'CANCELADO'), a1, OPCOES)).rejects.toThrow(/atualizado depois de gerado/)
    await expect(assinarPdf(Buffer.from('não é um PDF'), a1, OPCOES)).rejects.toThrow(ErroAssinaturaPdf)
  })

  it('a marca d’água (CANCELADO/SUBSTITUÍDO) sobre o assinado mantém os bytes assinados', async () => {
    const { pdf } = await assinarPdf(base, a1, OPCOES)
    const carimbado = carimbarMarcaDagua(pdf, 'SUBSTITUÍDO')
    expect(carimbado.subarray(0, pdf.length).equals(pdf)).toBe(true)
    // A assinatura continua conferindo sobre o que ela cobre
    expect(conferirPdfAssinado(carimbado.subarray(0, pdf.length), a1.certificadoDer)).toBeTruthy()
  })

  it.runIf(temPdftotext)('o poppler lê o PDF assinado sem avisos', async () => {
    const { pdf } = await assinarPdf(base, a1, OPCOES)
    const r = spawnSync('pdftotext', ['-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
    expect(r.stderr.toString('utf8')).toBe('')
    expect(r.stdout.toString('utf8')).toContain('CERTIFICADO')
  })

  it.runIf(temPdfsig)('pdfsig: "Signature is Valid" e "Total document signed"; na cópia carimbada, não cobre tudo', async () => {
    const { pdf } = await assinarPdf(base, a1, OPCOES)
    const saida = pdfsig(pdf)
    expect(saida).toContain('Signature Validation: Signature is Valid.')
    expect(saida).toContain('Total document signed')
    expect(saida).toContain('Signature Type: ETSI.CAdES.detached')
    const carimbado = pdfsig(carimbarMarcaDagua(pdf, 'CANCELADO'))
    expect(carimbado).toContain('Signature Validation: Signature is Valid.')
    expect(carimbado).not.toContain('Total document signed')
  })

  it.runIf(!!pythonPyhanko)('pyHanko: íntegra, confiável (raiz de teste), sem modificações e DocMDP respeitada', async () => {
    const { pdf } = await assinarPdf(base, a1, OPCOES)
    const r = comArquivos({ 'assinado.pdf': pdf, 'raiz.crt': arquivoPki('raiz.crt') }, (p) =>
      spawnSync(pythonPyhanko!, ['-I', '-c', PYHANKO, p['assinado.pdf'], p['raiz.crt']], { encoding: 'utf8' }),
    )
    expect(r.stderr).toBe('')
    expect(JSON.parse(r.stdout)).toEqual({ intact: true, valid: true, trusted: true, coverage: 'ENTIRE_FILE', docmdp: true })
  })
})

// A amostra CONGELADA (__fixtures__/assinado-formato-1.pdf, de gerarAssinado.ts): um PDF assinado pelo código da época,
// com a chave de teste e um /M fixo. O teste "remonta idêntico das partes" acima assina e remonta com o mesmo código, então
// uma mudança na codificação (escreverAtualizacao, que o carimbo também usa; idDaAtualizacao; o campo; a ordem do CMS; o
// pkijs/asn1js) passaria nos dois lados. Aqui não: o código de hoje tem de refazer, byte a byte, o arquivo de antes. Se
// falhar, não troque a amostra: desfaça a mudança ou crie um `formato` novo (ver gerarAssinado.ts).
describe('amostra congelada do formato 1: o código de hoje refaz byte a byte o PDF assinado antes', () => {
  const amostra = JSON.parse(readFileSync(new URL('./__fixtures__/assinado-formato-1.json', import.meta.url), 'utf8'))
  const assinado = readFileSync(new URL('./__fixtures__/assinado-formato-1.pdf', import.meta.url))
  const baseAmostra = () => Buffer.from(assinado.subarray(0, amostra.tamanhoBase))
  const publicoAmostra = () => ({
    certificadoDer: Buffer.from(amostra.publico.certificadoDer, 'base64'),
    cadeiaDer: (amostra.publico.cadeiaDer as string[]).map((c) => Buffer.from(c, 'base64')),
  })

  it('o arquivo é o da amostra, começa pela base e a assinatura confere', () => {
    expect(sha256(assinado)).toBe('e53cd8d80f33f3a58850943b59fb05492561ce54692a898c6f49c3e461455507')
    expect(amostra.sha256).toBe(sha256(assinado))
    expect(amostra.partes.formato).toBe(1)
    expect(sha256(baseAmostra())).toBe(amostra.partes.hashBase)
    expect(conferirPdfAssinado(assinado, publicoAmostra().certificadoDer)).toBeTruthy()
  })

  it('remontarPdf(base, partes guardadas, parte pública) dá o mesmo arquivo, sem a chave', () => {
    const refeito = remontarPdf(baseAmostra(), structuredClone(amostra.partes), publicoAmostra())
    expect(sha256(refeito)).toBe(amostra.sha256)
    expect(refeito.equals(assinado)).toBe(true)
  })

  it('a adoção do PDF da pasta (partesDoPdfAssinado) lê as mesmas partes e remonta o mesmo arquivo', () => {
    const lidas = partesDoPdfAssinado(assinado, baseAmostra())
    expect(lidas).toEqual(amostra.partes)
    expect(remontarPdf(baseAmostra(), lidas, publicoAmostra()).equals(assinado)).toBe(true)
  })

  it('assinar de novo a mesma base com a mesma chave e o mesmo /M dá o mesmo arquivo e as mesmas partes', async () => {
    expect(a1.dados.sha256).toBe(amostra.partes.certificado) // a chave de teste é a da amostra
    const { pdf, partes } = await assinarPdf(baseAmostra(), a1, { ...amostra.opcoes, m: new Date(amostra.opcoes.m) })
    expect(sha256(pdf)).toBe(amostra.sha256)
    expect(partes).toEqual(amostra.partes)
  })
})

/** Grava os arquivos numa pasta temporária, chama `f` com os caminhos e apaga a pasta. */
function comArquivos<T>(arquivos: Record<string, Buffer>, f: (caminhos: Record<string, string>) => T): T {
  const pasta = mkdtempSync(join(tmpdir(), 'assinatura-'))
  try {
    const caminhos = Object.fromEntries(Object.keys(arquivos).map((n) => [n, join(pasta, n)]))
    for (const [n, dados] of Object.entries(arquivos)) writeFileSync(caminhos[n], dados)
    return f(caminhos)
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
}

function pdfsig(pdf: Buffer) {
  const r = comArquivos({ 'assinado.pdf': pdf }, (p) => spawnSync('pdfsig', [p['assinado.pdf']], { encoding: 'utf8' }))
  return r.stdout + r.stderr
}

const PYHANKO = `
import sys, json
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext
from asn1crypto import pem, x509
with open(sys.argv[2], 'rb') as f:
    dados = f.read()
raiz = x509.Certificate.load(pem.unarmor(dados)[2] if pem.detect(dados) else dados)
vc = ValidationContext(trust_roots=[raiz], allow_fetching=False, revocation_mode='soft-fail')
with open(sys.argv[1], 'rb') as f:
    sig = PdfFileReader(f).embedded_signatures[0]
    st = validate_pdf_signature(sig, vc)
    print(json.dumps({'intact': st.intact, 'valid': st.valid, 'trusted': st.trusted,
                      'coverage': st.coverage.name, 'docmdp': st.docmdp_ok}))
`

/** Um PDF mínimo com a tabela xref clássica, montado à mão (para os casos que o pdfmake não gera). */
function montarPdf(objetos: Record<number, string>) {
  let s = '%PDF-1.7\n'
  const posicoes: number[] = []
  const numeros = Object.keys(objetos).map(Number)
  for (const n of numeros) {
    posicoes[n] = s.length
    s += `${n} 0 obj\n${objetos[n]}\nendobj\n`
  }
  const xref = s.length
  const tamanho = Math.max(...numeros) + 1
  s += `xref\n0 ${tamanho}\n0000000000 65535 f \n`
  for (let n = 1; n < tamanho; n++) s += `${String(posicoes[n] ?? 0).padStart(10, '0')} 00000 ${posicoes[n] ? 'n' : 'f'} \n`
  s += `trailer\n<< /Size ${tamanho} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(s, 'latin1')
}

// A marca d'água posta sobre o PDF guardado (cópia de um certificado cancelado ou substituído): o original fica
// intacto no começo, a atualização incremental é um PDF válido (conferido aqui pela estrutura e, com o poppler-utils,
// pela leitura e pela imagem da página) e a marca aparece em todas as páginas.

import { spawnSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import { carimbarMarcaDagua, ErroCarimbo, textoPdf } from './carimbo.ts'
import { gerarCertificadoPdf } from './certificado.ts'
import { exemploPlataforma } from './exemplosCertificado.ts'

const existe = (programa: string) => !spawnSync(programa, ['-v'], { stdio: 'ignore' }).error
const temPdftotext = existe('pdftotext')
const temPdftoppm = existe('pdftoppm')

/** O texto e os avisos do poppler (um PDF malformado sai com "Syntax Error"/"Internal Error" no stderr). */
function lerComPoppler(pdf: Buffer) {
  const r = spawnSync('pdftotext', ['-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
  return { status: r.status, texto: r.stdout.toString('utf8'), avisos: r.stderr.toString('utf8') }
}

/** A página `n` em pixels (RGB, 20 dpi), pelo pdftoppm. */
function pixels(pdf: Buffer, n: number) {
  const r = spawnSync('pdftoppm', ['-r', '20', '-f', String(n), '-l', String(n), '-'], { input: pdf, maxBuffer: 1 << 26 })
  expect(r.stderr.toString('utf8')).toBe('')
  const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(r.stdout.toString('latin1', 0, 32))!
  return { largura: Number(m[1]), altura: Number(m[2]), rgb: r.stdout.subarray(m[0].length) }
}

/**
 * A estrutura da atualização: o original intacto no começo, o startxref aponta para a tabela nova, cada entrada
 * dela aponta para o objeto certo ("n g obj") e o trailer liga à tabela anterior (/Prev).
 */
function confereAtualizacao(copia: Buffer, original: Buffer) {
  expect(copia.subarray(0, original.length).equals(original)).toBe(true)
  const s = copia.toString('latin1')
  const startxref = (b: string) => Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(b)![1])
  const inicio = startxref(s)
  expect(inicio).toBeGreaterThan(original.length)
  expect(s.startsWith('xref', inicio)).toBe(true)
  const secao = s.slice(inicio, s.indexOf('trailer', inicio))
  const linhas = secao.split('\n').slice(1)
  let objetos = 0
  for (let i = 0; i < linhas.length && linhas[i].trim();) {
    const [primeiro, quantos] = linhas[i++].split(' ').map(Number)
    for (let n = 0; n < quantos; n++, i++) {
      const e = /^(\d{10}) (\d{5}) ([nf]) $/.exec(linhas[i])!
      expect(e, linhas[i]).not.toBeNull()
      if (e[3] === 'f') continue
      objetos++
      expect(s.startsWith(`${primeiro + n} ${Number(e[2])} obj`, Number(e[1]))).toBe(true)
    }
  }
  expect(objetos).toBeGreaterThan(0)
  const trailer = s.slice(s.indexOf('trailer', inicio), s.lastIndexOf('startxref'))
  expect(Number(/\/Prev (\d+)/.exec(trailer)![1])).toBe(startxref(original.toString('latin1')))
  return s.slice(original.length)
}

/** Um PDF mínimo com a tabela xref clássica, montado à mão (para os casos que o pdfkit não gera). */
function montarPdf(objetos: Record<number, string>, trailer = '') {
  let s = '%PDF-1.4\n'
  const posicoes: number[] = []
  const numeros = Object.keys(objetos).map(Number)
  for (const n of numeros) {
    posicoes[n] = s.length
    s += `${n} 0 obj\n${objetos[n]}\nendobj\n`
  }
  const tamanho = Math.max(...numeros) + 1
  const inicio = s.length
  s += `xref\n0 ${tamanho}\n0000000000 65535 f \n`
  for (let n = 1; n < tamanho; n++)
    s += posicoes[n] === undefined ? '0000000000 00000 f \n' : `${String(posicoes[n]).padStart(10, '0')} 00000 n \n`
  s += `trailer\n<< /Size ${tamanho} /Root 1 0 R ${trailer}>>\nstartxref\n${inicio}\n%%EOF\n`
  return Buffer.from(s, 'latin1')
}

const fluxo = (conteudo: string) => `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`

describe('marca d’água sobre o PDF guardado', () => {
  let original: Buffer
  beforeAll(async () => {
    original = await gerarCertificadoPdf({ ...exemploPlataforma(), marcaDagua: '' })
  }, 60_000)

  it('o certificado do gerador: o original intacto no começo e a marca em cada página', () => {
    const copia = carimbarMarcaDagua(original, 'CANCELADO')
    const acrescentado = confereAtualizacao(copia, original)
    const paginas = Number(/\/Count (\d+)/.exec(original.toString('latin1'))![1])
    expect(paginas).toBeGreaterThan(1)
    expect(acrescentado.split('(CANCELADO) Tj').length - 1).toBe(paginas)
    // A cor e a transparência da marca do gerador (`estiloMarcaDagua`)
    expect(acrescentado).toContain('0.7059 0.1373 0.0941 rg')
    expect(acrescentado).toContain('/ca 0.13')
    // O original fica entre "q" e "Q": a marca é desenhada no sistema de coordenadas da página
    expect(acrescentado).toMatch(/\/Contents \[\d+ 0 R \d+ 0 R \d+ 0 R\]/)
    // Sem mexer no original, não há o que recalcular: a mesma entrada dá a mesma cópia
    expect(carimbarMarcaDagua(original, 'CANCELADO').equals(copia)).toBe(true)
  })

  it('o acento sai na codificação da fonte (WinAnsi), e a marca é a do texto pedido', () => {
    expect(textoPdf('SUBSTITUÍDO')).toBe('SUBSTITU\\315DO')
    expect(textoPdf('A (B) \\ — C')).toBe('A \\(B\\) \\\\ ? C')
    const copia = carimbarMarcaDagua(original, ' SUBSTITUÍDO ')
    const acrescentado = confereAtualizacao(copia, original)
    expect(acrescentado).toContain('(SUBSTITU\\315DO) Tj')
    // A cinza da marca de substituído
    expect(acrescentado).toContain('0.4784 0.5059 0.4863 rg')
    expect(acrescentado).toContain('/ca 0.1')
  })

  it.skipIf(!temPdftotext)('o poppler lê a cópia sem avisos, com as mesmas páginas e o mesmo texto do original', () => {
    const copia = carimbarMarcaDagua(original, 'CANCELADO')
    const antes = lerComPoppler(original)
    const depois = lerComPoppler(copia)
    expect(depois.status).toBe(0)
    expect(depois.avisos).toBe('')
    expect(depois.texto.split('\f').length).toBe(antes.texto.split('\f').length)
    // O texto inclinado da marca sai em letras soltas: sem ele, as linhas do original estão todas lá
    const linhas = antes.texto.split('\n').filter((l) => l.trim().length > 20)
    expect(linhas.length).toBeGreaterThan(20)
    for (const l of linhas) expect(depois.texto).toContain(l)
  })

  it.skipIf(!temPdftoppm)('a marca aparece na imagem de cada página, por cima do conteúdo, na cor dela', () => {
    const copia = carimbarMarcaDagua(original, 'CANCELADO')
    const paginas = Number(/\/Count (\d+)/.exec(original.toString('latin1'))![1])
    for (let n = 1; n <= paginas; n++) {
      const a = pixels(original, n)
      const b = pixels(copia, n)
      expect([b.largura, b.altura]).toEqual([a.largura, a.altura])
      let diferentes = 0
      let avermelhados = 0
      for (let i = 0; i < a.rgb.length; i += 3) {
        if (a.rgb[i] === b.rgb[i] && a.rgb[i + 1] === b.rgb[i + 1] && a.rgb[i + 2] === b.rgb[i + 2]) continue
        diferentes++
        // Sobre o branco, a marca deixa o pixel mais vermelho que verde e azul
        if (b.rgb[i] > b.rgb[i + 1] && b.rgb[i] > b.rgb[i + 2]) avermelhados++
      }
      const total = a.rgb.length / 3
      expect(diferentes / total).toBeGreaterThan(0.05)
      expect(avermelhados / diferentes).toBeGreaterThan(0.5)
    }
  })

  it('um PDF que já tem uma marca recebe outra (segue o /Prev; nomes de recursos novos)', () => {
    const uma = carimbarMarcaDagua(original, 'SUBSTITUÍDO')
    const duas = carimbarMarcaDagua(uma, 'CANCELADO')
    const acrescentado = confereAtualizacao(duas, uma)
    expect(duas.subarray(0, original.length).equals(original)).toBe(true)
    expect(acrescentado).toContain('/BCMarca2 ')
    expect(acrescentado).toContain('/BCMarcaGs2 ')
    expect(acrescentado).toContain('(CANCELADO) Tj')
    if (temPdftotext) expect(lerComPoppler(duas).avisos).toBe('')
  })

  it('páginas com a caixa e os recursos herdados, o conteúdo em lista e a fonte por referência', () => {
    const pdf = montarPdf({
      1: '<< /Type /Catalog /Pages 2 0 R >>',
      2: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 300 400] /Resources << /Font 7 0 R >> >>',
      3: '<< /Type /Page /Parent 2 0 R /Contents [5 0 R 6 0 R] >>',
      4: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R /Resources 8 0 R >>',
      5: fluxo('BT /F1 12 Tf 20 20 Td (Ola) Tj ET'),
      6: fluxo('0 0 m 10 10 l S'),
      7: '<< /F1 9 0 R >>',
      8: '<< /Font << /F1 9 0 R >> /ExtGState << /BCMarcaGs 10 0 R >> >>',
      9: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      10: '<< /Type /ExtGState /ca 1 >>',
    })
    const acrescentado = confereAtualizacao(carimbarMarcaDagua(pdf, 'CANCELADO'), pdf)
    const pagina = (n: number) => new RegExp(`(?:^|\\n)${n} 0 obj\\n(<<[\\s\\S]*?>>)\\nendobj`).exec(acrescentado)![1]
    // A página 3 herdou a caixa e os recursos: a marca fica no centro de 300 × 400, com a fonte de antes junto
    expect(pagina(3)).toMatch(/\/Contents \[\d+ 0 R 5 0 R 6 0 R \d+ 0 R\]/)
    const recursos3 = Number(/\/Resources (\d+) 0 R/.exec(pagina(3))![1])
    expect(pagina(recursos3)).toMatch(/\/F1 9 0 R\n\/BCMarca \d+ 0 R/)
    // A página 4 tem a própria caixa e um nome de transparência já usado: a marca ganha outro
    expect(pagina(4)).toMatch(/\/Contents \[\d+ 0 R 5 0 R \d+ 0 R\]/)
    const recursos4 = Number(/\/Resources (\d+) 0 R/.exec(pagina(4))![1])
    expect(pagina(recursos4)).toMatch(/\/BCMarcaGs 10 0 R\n\/BCMarcaGs2 \d+ 0 R/)
    if (temPdftotext) expect(lerComPoppler(carimbarMarcaDagua(pdf, 'CANCELADO')).avisos).toBe('')
  })

  it('o que não é um PDF do gerador é recusado (ErroCarimbo), nunca devolvido sem a marca', () => {
    const recusa = (pdf: Buffer, motivo: RegExp) => expect(() => carimbarMarcaDagua(pdf, 'CANCELADO')).toThrow(motivo)
    const simples = {
      1: '<< /Type /Catalog /Pages 2 0 R >>',
      2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>',
      4: fluxo(''),
    }
    expect(() => carimbarMarcaDagua(montarPdf(simples), 'CANCELADO')).not.toThrow()
    recusa(Buffer.from('não é um PDF'), /não é um PDF/)
    recusa(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1'), /xref não encontrada/)
    recusa(montarPdf(simples, '/Encrypt 5 0 R '), /criptografado/)
    recusa(montarPdf({ ...simples, 3: '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>' }), /sem MediaBox/)
    recusa(montarPdf({ ...simples, 2: '<< /Type /Pages /Kids [] /Count 0 >>' }), /sem páginas/)
    recusa(montarPdf({ ...simples, 2: '<< /Type /Pages /Kids [2 0 R] /Count 1 >>' }), /árvore de páginas/)
    // A tabela xref em fluxo (PDF 1.5+): o startxref aponta para um objeto, não para "xref"
    const emFluxo = Buffer.from(
      montarPdf(simples)
        .toString('latin1')
        .replace(/startxref\n\d+/, 'startxref\n9'),
      'latin1',
    )
    recusa(emFluxo, /xref não encontrada/)
    expect(() => carimbarMarcaDagua(montarPdf(simples), '  ')).toThrow(ErroCarimbo)
  })
})

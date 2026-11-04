// O arquivo escolhido na tela, antes de ser enviado: a conferência pelo nome e pelo conteúdo e o endereço local de
// "Abrir", sempre com o tipo conferido (nunca o que o navegador deu pela extensão). Uma página com nome de documento
// ("Certificado.pdf.html", que começa com "%PDF-") aberta pelo endereço local rodaria como o próprio sistema.

import { describe, expect, it } from 'vitest'
import { conferirArquivoLocal, tipoConferido, urlParaAbrir } from './arquivoLocal'

const SCRIPT = '<html><script>fetch("/api/usuarios",{method:"POST"})</script></html>'
const arquivo = (partes: Array<string | number[]>, nome: string, type = '') =>
  new File(
    partes.map((p) => (typeof p === 'string' ? p : new Uint8Array(p))),
    nome,
    { type },
  )
const PDF = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const ZIP = [0x50, 0x4b, 0x03, 0x04]

describe('conferência do arquivo escolhido', () => {
  it('a página com nome e começo de documento é recusada (escolhida ou arrastada)', async () => {
    const casos = [
      { f: arquivo(['%PDF-1.7\n', SCRIPT], 'Certificado RBC 0456.pdf.html', 'text/html'), finalidade: 'padrao' as const },
      { f: arquivo([JPG, SCRIPT], 'Certificado RBC 0456.jpg.html', 'text/html'), finalidade: 'padrao' as const },
      { f: arquivo([ZIP, SCRIPT], 'POP-CAL-01 rev 03.docx.html', 'text/html'), finalidade: 'pop' as const },
      // Arrastado de outro programa, sem o tipo
      { f: arquivo(['%PDF-1.7\n', SCRIPT], 'Certificado.pdf.htm'), finalidade: 'padrao' as const },
      { f: arquivo(['%PDF-1.7\n', SCRIPT], 'desenho.svg', 'image/svg+xml'), finalidade: 'padrao' as const },
    ]
    for (const { f, finalidade } of casos) {
      const r = await conferirArquivoLocal(f, finalidade)
      expect(r.problema, f.name).toBe(
        finalidade === 'pop'
          ? 'Envie um arquivo PDF ou Word.'
          : 'Envie um arquivo PDF, JPG ou PNG (o certificado escaneado ou o PDF do laboratório).',
      )
      expect(r.tipo, f.name).toBeNull()
      expect(tipoConferido(f), f.name).toBeNull()
      expect(urlParaAbrir(f), f.name).toBe('')
    }
  })

  it('o documento de verdade passa, com o tipo do conteúdo (não o do nome nem o do navegador)', async () => {
    const pdf = arquivo([PDF], 'Certificado RBC 0456.pdf', 'application/pdf')
    expect(await conferirArquivoLocal(pdf, 'padrao')).toEqual({ problema: null, tipo: 'pdf' })
    expect(tipoConferido(pdf)).toBe('pdf')
    // Sem extensão (o número depois do ponto não é uma) e sem o tipo: decide o conteúdo
    const semNome = arquivo([PNG, 'IHDR'], 'Certificado nº 12.345')
    expect(await conferirArquivoLocal(semNome, 'padrao')).toEqual({ problema: null, tipo: 'png' })
    // "scan.pdf" que é uma foto: vale a foto
    const foto = arquivo([JPG, 'JFIF'], 'scan.pdf', 'application/pdf')
    expect(await conferirArquivoLocal(foto, 'padrao')).toEqual({ problema: null, tipo: 'jpg' })
    expect(tipoConferido(foto)).toBe('jpg')
    const pop = arquivo([ZIP, '[Content_Types].xml word/document.xml'], 'POP-CAL-01 rev 03.docx')
    expect(await conferirArquivoLocal(pop, 'pop')).toEqual({ problema: null, tipo: 'docx' })
  })

  it('vazio e o conteúdo de outro tipo continuam recusados', async () => {
    expect((await conferirArquivoLocal(arquivo([], 'vazio.pdf'), 'padrao')).problema).toBe('O arquivo está vazio.')
    const texto = arquivo(['só texto'], 'certificado.pdf', 'application/pdf')
    expect((await conferirArquivoLocal(texto, 'padrao')).problema).toMatch(/^Envie um arquivo PDF, JPG ou PNG/)
    expect(tipoConferido(texto)).toBeNull()
  })
})

describe('"Abrir" o arquivo escolhido', () => {
  it('o endereço local sai com o tipo conferido, mesmo que o navegador tenha dado outro', async () => {
    // O nome e o tipo do navegador dizem página; o conteúdo é PDF: abre como PDF (no leitor, sem rodar nada)
    const f = arquivo([PDF], 'Certificado RBC 0456.pdf', 'text/html')
    expect((await conferirArquivoLocal(f, 'padrao')).tipo).toBe('pdf')
    const url = urlParaAbrir(f)
    expect(url).toMatch(/^blob:/)
    try {
      const r = await fetch(url)
      expect(r.headers.get('content-type')).toBe('application/pdf')
      expect(await r.text()).toBe(PDF)
    } finally {
      URL.revokeObjectURL(url)
    }
  })

  it('o arquivo que não passou pela conferência não abre', () => {
    expect(urlParaAbrir(arquivo([PDF], 'Certificado.pdf', 'application/pdf'))).toBe('')
  })
})

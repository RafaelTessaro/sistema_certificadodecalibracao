import { describe, expect, it } from 'vitest'
import {
  detectarTipoArquivo,
  LIMITE_ARQUIVO_BYTES,
  LIMITE_EMAIL_ANEXOS,
  LIMITE_EMAIL_BYTES,
  nomeArquivoSeguro,
  nomeArquivoSimples,
  normalizarArquivoAnexo,
  normalizarPop,
  popNaData,
  problemaDoArquivo,
  problemaDosAnexos,
  revisaoPop,
  separarProcedimento,
  textoPop,
  tiposAceitos,
} from './arquivos.ts'
import type { VersaoPop } from './tipos.ts'

const bytes = (...partes: Array<string | number[]>) =>
  new Uint8Array(partes.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : p)))

const PDF = bytes('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF')
const JPG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF')
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'IHDR')
const DOCX = bytes('PK', [3, 4], '[Content_Types].xml', 'word/document.xml')
const ZIP = bytes('PK', [3, 4], 'qualquer/coisa.txt')

describe('tipo do arquivo pelo conteúdo', () => {
  it('reconhece PDF, JPG, PNG e Word (.docx)', () => {
    expect(detectarTipoArquivo(PDF)).toBe('pdf')
    expect(detectarTipoArquivo(JPG)).toBe('jpg')
    expect(detectarTipoArquivo(PNG)).toBe('png')
    expect(detectarTipoArquivo(DOCX)).toBe('docx')
  })

  it('PDF com lixo antes do cabeçalho (até 1 KB) ainda é PDF; depois disso, não', () => {
    expect(detectarTipoArquivo(bytes(' '.repeat(500), '%PDF-1.4'))).toBe('pdf')
    expect(detectarTipoArquivo(bytes(' '.repeat(2000), '%PDF-1.4'))).toBeNull()
  })

  it('o nome não conta: texto, executável e ZIP qualquer não passam', () => {
    expect(detectarTipoArquivo(bytes('certificado.pdf'))).toBeNull()
    expect(detectarTipoArquivo(bytes('MZ', [0x90, 0]))).toBeNull()
    expect(detectarTipoArquivo(ZIP)).toBeNull()
    expect(detectarTipoArquivo(new Uint8Array())).toBeNull()
    // Só com o começo do arquivo (a tela confere antes de enviar), um ZIP vale como .docx; o servidor confere tudo
    expect(detectarTipoArquivo(ZIP, true)).toBe('docx')
  })
})

describe('arquivo aceito para a finalidade', () => {
  it('certificado de padrão: PDF, JPG ou PNG; POP: PDF ou Word', () => {
    expect(problemaDoArquivo(100, 'pdf', 'padrao')).toBeNull()
    expect(problemaDoArquivo(100, 'png', 'padrao')).toBeNull()
    expect(problemaDoArquivo(100, 'docx', 'padrao')).toMatch(/PDF, JPG ou PNG/)
    expect(problemaDoArquivo(100, 'docx', 'pop')).toBeNull()
    expect(problemaDoArquivo(100, 'jpg', 'pop')).toBe('Envie um arquivo PDF ou Word.')
    expect(problemaDoArquivo(100, null, 'pop')).toBe('Envie um arquivo PDF ou Word.')
    expect(tiposAceitos('padrao')).toBe('PDF, JPG ou PNG')
  })

  it('vazio e acima de 10 MB são recusados, com o tamanho na mensagem', () => {
    expect(problemaDoArquivo(0, 'pdf', 'padrao')).toBe('O arquivo está vazio.')
    expect(problemaDoArquivo(LIMITE_ARQUIVO_BYTES, 'pdf', 'padrao')).toBeNull()
    expect(problemaDoArquivo(LIMITE_ARQUIVO_BYTES + 1, 'pdf', 'padrao')).toMatch(/^O arquivo tem 10 MB; o limite é 10 MB/)
    expect(problemaDoArquivo(12.4 * 1024 * 1024, 'pdf', 'padrao')).toMatch(/^O arquivo tem 12,4 MB/)
  })
})

describe('nomes de arquivo', () => {
  it('tira o caminho e os caracteres que o Windows não aceita', () => {
    expect(nomeArquivoSeguro('C:\\Users\\ana\\Certificado RBC: 0456/2026.pdf')).toBe('2026.pdf')
    expect(nomeArquivoSeguro('Certificado "RBC" <0456>.pdf')).toBe('Certificado -RBC- -0456-.pdf')
    expect(nomeArquivoSeguro('Calibração dos pesos.pdf')).toBe('Calibração dos pesos.pdf')
    expect(nomeArquivoSeguro('', 'certificado.pdf')).toBe('certificado.pdf')
    expect(nomeArquivoSeguro('..', 'x')).toBe('x')
    const longo = nomeArquivoSeguro(`${'a'.repeat(300)}.pdf`)
    expect(longo).toHaveLength(150)
    expect(longo.endsWith('.pdf')).toBe(true)
  })

  it('nome simples para o anexo do e-mail', () => {
    expect(nomeArquivoSimples('Certificado-padrão-JP-01_LAB 0456/2026')).toBe('Certificado-padrao-JP-01_LAB-0456-2026')
  })
})

describe('referência a um arquivo guardado', () => {
  const sha = 'a'.repeat(64)
  it('aceita só sha256 válido; tipo fora da lista e tamanho inválido viram vazio', () => {
    expect(normalizarArquivoAnexo(null)).toBeNull()
    expect(normalizarArquivoAnexo({ sha256: 'xyz' })).toBeNull()
    expect(
      normalizarArquivoAnexo({
        sha256: sha.toUpperCase(),
        nome: 'a/b.pdf',
        tamanho: 10,
        tipo: 'application/pdf',
        enviadoEm: '2026-10-01T10:00:00.000Z',
      }),
    ).toEqual({ sha256: sha, nome: 'b.pdf', tamanho: 10, tipo: 'application/pdf', enviadoEm: '2026-10-01T10:00:00.000Z' })
    expect(normalizarArquivoAnexo({ sha256: sha, tipo: 'text/html', tamanho: -1, enviadoEm: 'ontem' })).toEqual({
      sha256: sha,
      nome: 'certificado',
      tamanho: 0,
      tipo: '',
      enviadoEm: '',
    })
  })
})

describe('POP: código e revisão', () => {
  it('revisão com dois algarismos', () => {
    expect(revisaoPop('0')).toBe('00')
    expect(revisaoPop(3)).toBe('')
    expect(revisaoPop('3')).toBe('03')
    expect(revisaoPop('rev. 12')).toBe('12')
    expect(revisaoPop('A')).toBe('')
    expect(revisaoPop('')).toBe('')
  })

  it('o texto do certificado e a separação do texto antigo das configurações', () => {
    expect(textoPop({ codigo: 'BALANÇAS-POP-123', revisao: '00' })).toBe('BALANÇAS-POP-123 rev. 00')
    expect(textoPop({ codigo: 'POP 7', revisao: '' })).toBe('POP 7')
    expect(separarProcedimento('PT-CAL-02 rev. 3')).toEqual({ codigo: 'PT-CAL-02', revisao: '3' })
    expect(separarProcedimento('IT-05 Rev 01')).toEqual({ codigo: 'IT-05', revisao: '01' })
    expect(separarProcedimento('Procedimento interno')).toEqual({ codigo: 'Procedimento interno', revisao: '' })
  })

  it('registro de uma revisão: código, revisão e data obrigatórios; o arquivo é opcional', () => {
    expect(normalizarPop({ codigo: ' BALANÇAS-POP-123 ', revisao: '1', data: '2026-10-28' })).toEqual({
      valor: { codigo: 'BALANÇAS-POP-123', revisao: '01', data: '2026-10-28', arquivo: '', observacao: '' },
      erros: [],
    })
    expect(normalizarPop({}).erros).toEqual([
      'Informe o código do POP (ex.: BALANÇAS-POP-123).',
      'Informe a revisão do POP com números (ex.: 00, 01).',
      'Informe a data da revisão do POP.',
    ])
    expect(normalizarPop({ codigo: 'POP-1 rev. 2', revisao: '2', data: '2026-10-28' }).erros).toEqual([
      'Escreva só o código; a revisão vai no campo ao lado.',
    ])
    expect(normalizarPop({ codigo: 'POP-1', revisao: '2', data: '2026-02-30' }).erros).toEqual([
      'Informe a data da revisão do POP.',
    ])
    expect(normalizarPop({ codigo: 'POP-1', revisao: '2', data: '2026-10-28', arquivo: 'abc' }).erros).toEqual([
      'Arquivo do POP inválido. Envie o arquivo de novo.',
    ])
  })

  it('a revisão que valia numa data: a última registrada até ela; antes de todas, a mais antiga; sem data, a vigente', () => {
    const v = (id: number, revisao: string, data: string) =>
      ({
        id,
        codigo: 'POP-1',
        revisao,
        data,
        arquivo: null,
        observacao: '',
        criadoEm: '',
        criadoPor: '',
        vigente: false,
      }) as VersaoPop
    // Da mais nova para a mais antiga (como `versoesPop`); a 02 foi registrada depois da 03, com data anterior
    const versoes = [v(4, '02', '2026-09-01'), v(3, '03', '2026-10-28'), v(2, '01', '2026-06-01'), v(1, '00', '2026-05-15')]
    expect(popNaData(versoes, '2026-10-30')?.revisao).toBe('02')
    expect(popNaData(versoes, '2026-10-28')?.revisao).toBe('02')
    expect(popNaData(versoes, '2026-08-31')?.revisao).toBe('01')
    expect(popNaData(versoes, '2026-06-01')?.revisao).toBe('01')
    expect(popNaData(versoes, '2026-05-15')?.revisao).toBe('00')
    expect(popNaData(versoes, '2026-03-02')?.revisao).toBe('00')
    expect(popNaData(versoes, '')?.revisao).toBe('02')
    expect(popNaData([], '2026-10-30')).toBeNull()
  })

  it('a data da revisão não pode ser no futuro (com o dia de hoje informado); hoje e antes, sim', () => {
    const pop = (data: string) => ({ codigo: 'POP-1', revisao: '3', data })
    expect(normalizarPop(pop('2026-11-05'), '2026-11-04').erros).toEqual(['A data da revisão do POP não pode ser no futuro.'])
    expect(normalizarPop(pop('2099-12-31'), '2026-11-04').erros).toEqual(['A data da revisão do POP não pode ser no futuro.'])
    expect(normalizarPop(pop('2026-11-04'), '2026-11-04').erros).toEqual([])
    expect(normalizarPop(pop('2026-10-28'), '2026-11-04').erros).toEqual([])
    // Sem o dia de hoje, não confere (quem confere é o servidor)
    expect(normalizarPop(pop('2099-12-31')).erros).toEqual([])
  })
})

describe('limites do e-mail', () => {
  it('até 20 anexos e 18 MB no total', () => {
    expect(problemaDosAnexos(LIMITE_EMAIL_ANEXOS, LIMITE_EMAIL_BYTES)).toBeNull()
    expect(problemaDosAnexos(LIMITE_EMAIL_ANEXOS + 1, 1000)).toMatch(/^São 21 anexos; o limite é 20 por e-mail/)
    expect(problemaDosAnexos(3, 21.5 * 1024 * 1024)).toMatch(/^Os anexos somam 21,5 MB; o limite é 18 MB por e-mail/)
  })
})

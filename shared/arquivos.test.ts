import { describe, expect, it } from 'vitest'
import {
  detectarTipoArquivo,
  extensaoAceita,
  LIMITE_ARQUIVO_BYTES,
  LIMITE_EMAIL_ANEXOS,
  LIMITE_EMAIL_BYTES,
  nomeArquivoSeguro,
  nomeArquivoSimples,
  nomeComExtensaoDoTipo,
  normalizarArquivoAnexo,
  normalizarPop,
  ordemDoPop,
  POP_DA_ATUALIZACAO,
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

  it('executável ou script com "%PDF-" no começo (num comentário) não passa por PDF', () => {
    const mz = new Uint8Array(512)
    mz.set([...Buffer.from('MZ')], 0)
    mz.set([...Buffer.from('%PDF-1.7')], 0x40)
    mz.set([...Buffer.from('PE\0\0', 'latin1')], 0x80)
    expect(detectarTipoArquivo(mz)).toBeNull()
    expect(detectarTipoArquivo(bytes([0x7f], 'ELF', [2, 1, 1], '%PDF-1.4'))).toBeNull()
    expect(detectarTipoArquivo(bytes('<!-- %PDF-1.4 --><html><script>alert(1)</script>'))).toBeNull()
    expect(detectarTipoArquivo(bytes('  <hta:application> %PDF-1.4'))).toBeNull()
    expect(detectarTipoArquivo(bytes('@REM %PDF-1.4\r\nstart calc'))).toBeNull()
    expect(detectarTipoArquivo(bytes('#!/bin/sh\n# %PDF-1.4'))).toBeNull()
    expect(detectarTipoArquivo(bytes('#%PDF-1.4\nStart-Process calc'))).toBeNull()
    expect(detectarTipoArquivo(bytes("'%PDF-1.4\nCreateObject"))).toBeNull()
    expect(detectarTipoArquivo(bytes([0xef, 0xbb, 0xbf], '<html> %PDF-1.4'))).toBeNull()
    // O lixo que alguns programas põem antes continua aceito: espaços, BOM, o cabeçalho de impressora (PJL)
    expect(detectarTipoArquivo(bytes([0xef, 0xbb, 0xbf], '%PDF-1.4'))).toBe('pdf')
    expect(detectarTipoArquivo(bytes([0x1b], '%-12345X@PJL JOB\r\n%PDF-1.4'))).toBe('pdf')
    expect(detectarTipoArquivo(bytes('\r\n%PDF-1.4'))).toBe('pdf')
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

describe('extensão do arquivo escolhido na tela', () => {
  it('a dos tipos aceitos para a finalidade, em maiúsculas ou minúsculas; sem extensão, decide o conteúdo', () => {
    expect(extensaoAceita('Certificado RBC 0456.pdf', 'padrao')).toBe(true)
    expect(extensaoAceita('foto.JPEG', 'padrao')).toBe(true)
    // O Windows salva fotos da internet como .jfif (é um JPG)
    expect(extensaoAceita('foto.jfif', 'padrao')).toBe(true)
    expect(extensaoAceita('scan.png. ', 'padrao')).toBe(true)
    expect(extensaoAceita('POP-CAL-01 rev 03.docx', 'pop')).toBe(true)
    expect(extensaoAceita('POP-CAL-01 rev 03.PDF', 'pop')).toBe(true)
    // Um número depois do ponto não é extensão
    expect(extensaoAceita('Certificado nº 12.345', 'padrao')).toBe(true)
    expect(extensaoAceita('Certificado 12', 'padrao')).toBe(true)
  })

  it('a página ou o programa com nome de documento é recusado (o Windows esconde o ".html" do fim)', () => {
    expect(extensaoAceita('Certificado RBC 0456.pdf.html', 'padrao')).toBe(false)
    expect(extensaoAceita('Certificado RBC 0456.jpg.HTM', 'padrao')).toBe(false)
    expect(extensaoAceita('desenho.svg', 'padrao')).toBe(false)
    expect(extensaoAceita('POP-CAL-01 rev 03.docx.html', 'pop')).toBe(false)
    expect(extensaoAceita('x.pdf.exe. .', 'padrao')).toBe(false)
    // A de um tipo de outra finalidade
    expect(extensaoAceita('POP.docx', 'padrao')).toBe(false)
    expect(extensaoAceita('foto.jpg', 'pop')).toBe(false)
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

  it('a extensão é sempre a do tipo conferido pelo conteúdo (nunca .exe, .html, .hta…)', () => {
    expect(nomeComExtensaoDoTipo('Certificado RBC 1234.pdf.exe', 'pdf')).toBe('Certificado RBC 1234.pdf')
    expect(nomeComExtensaoDoTipo('a.pdf.hta', 'pdf')).toBe('a.pdf')
    expect(nomeComExtensaoDoTipo('Certificado.pdf.html', 'pdf')).toBe('Certificado.pdf')
    expect(nomeComExtensaoDoTipo('x.html.exe', 'pdf')).toBe('x.html.pdf')
    expect(nomeComExtensaoDoTipo('fatura.exe', 'pdf')).toBe('fatura.pdf')
    expect(nomeComExtensaoDoTipo('x.pdf.exe. . .', 'pdf')).toBe('x.pdf') // o Windows tira os pontos e espaços do fim
    expect(nomeComExtensaoDoTipo('Certificado RBC 1234', 'pdf')).toBe('Certificado RBC 1234.pdf')
    expect(nomeComExtensaoDoTipo('Certificado nº 12.345', 'pdf')).toBe('Certificado nº 12.345.pdf')
    expect(nomeComExtensaoDoTipo('Relatório.PDF', 'pdf')).toBe('Relatório.PDF')
    expect(nomeComExtensaoDoTipo('foto.jpeg', 'jpg')).toBe('foto.jpeg')
    expect(nomeComExtensaoDoTipo('foto.JPG', 'jpg')).toBe('foto.JPG')
    expect(nomeComExtensaoDoTipo('scan.png.scr', 'png')).toBe('scan.png')
    expect(nomeComExtensaoDoTipo('scan.pdf', 'png')).toBe('scan.png')
    expect(nomeComExtensaoDoTipo('POP.pdf', 'docx')).toBe('POP.docx')
    expect(nomeComExtensaoDoTipo('POP rev 03.docx', 'docx')).toBe('POP rev 03.docx')
    // Sem nome: o padrão de quem chama, com a extensão
    expect(nomeComExtensaoDoTipo('.exe', 'pdf', 'Certificado')).toBe('Certificado.pdf')
    expect(nomeComExtensaoDoTipo('.pdf', 'pdf', 'Certificado')).toBe('Certificado.pdf')
    expect(nomeComExtensaoDoTipo('', 'docx', 'POP')).toBe('POP.docx')
    expect(nomeComExtensaoDoTipo('', 'pdf')).toBe('arquivo.pdf')
    // Até 150 letras, com a extensão
    const longo = nomeComExtensaoDoTipo(`${'a'.repeat(148)}.exe`, 'pdf')
    expect(longo).toHaveLength(150)
    expect(longo.endsWith('a.pdf')).toBe(true)
    // Caracteres que invertem o texto na tela (".exe" disfarçado de "exe.pdf") saem do nome
    expect(nomeArquivoSeguro('Certificado\u202Efdp.exe')).toBe('Certificadofdp.exe')
    expect(nomeComExtensaoDoTipo(nomeArquivoSeguro('Certificado\u202Efdp.exe'), 'pdf')).toBe('Certificadofdp.pdf')
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

describe('ordem das revisões do POP (o certificado cita a que valia na data da calibração)', () => {
  const v = (id: number, codigo: string, revisao: string, data: string, criadoPor = 'Admin') =>
    ({ id, codigo, revisao, data, arquivo: null, observacao: '', criadoEm: '', criadoPor, vigente: false }) as VersaoPop
  const versoes = [v(2, 'POP-CAL-01', '01', '2026-06-01'), v(1, 'POP-CAL-01', '00', '2026-01-05')]

  it('a data não pode ser antes da vigente (o ano errado encobriria a vigente desde então)', () => {
    expect(ordemDoPop({ codigo: 'POP-CAL-01', revisao: '02', data: '2025-11-04' }, versoes)).toEqual({
      erros: ['A data da revisão precisa ser igual ou posterior à da rev. 01 (01/06/2026).'],
      dataMinima: '2026-06-01',
    })
    expect(ordemDoPop({ codigo: 'POP-CAL-01', revisao: '02', data: '2026-06-01' }, versoes).erros).toEqual([])
    // Também de outro código (a vigente é uma só)
    expect(ordemDoPop({ codigo: 'POP-NOVO', revisao: '00', data: '2026-05-31' }, versoes).erros).toHaveLength(1)
  })

  it('no mesmo código, o número precisa ser maior que o de todas as registradas (maiúsculas não contam)', () => {
    expect(ordemDoPop({ codigo: 'pop-cal-01', revisao: '01', data: '2026-10-28' }, versoes).erros).toEqual([
      'A revisão precisa ser maior que a rev. 01 do POP-CAL-01.',
    ])
    expect(ordemDoPop({ codigo: 'POP-CAL-01', revisao: '00', data: '2026-10-28' }, versoes).erros).toHaveLength(1)
    expect(ordemDoPop({ codigo: 'POP-CAL-01', revisao: '05', data: '2026-10-28' }, versoes).erros).toEqual([])
    // Outro código começa do 00
    expect(ordemDoPop({ codigo: 'POP-NOVO', revisao: '00', data: '2026-10-28' }, versoes).erros).toEqual([])
  })

  it('a trazida das configurações (data da atualização, não a do documento) não limita a data; sem nenhuma, nada', () => {
    const migrada = [v(1, 'BALANÇAS-POP-123', '02', '2026-11-01', POP_DA_ATUALIZACAO)]
    expect(ordemDoPop({ codigo: 'POP-CAL-01', revisao: '00', data: '2026-10-28' }, migrada)).toEqual({
      erros: [],
      dataMinima: '',
    })
    expect(ordemDoPop({ codigo: 'POP-CAL-01', revisao: '00', data: '2026-10-28' }, [])).toEqual({ erros: [], dataMinima: '' })
    // Depois de uma registrada por alguém, ela é a referência
    expect(
      ordemDoPop({ codigo: 'POP-CAL-01', revisao: '01', data: '2026-10-27' }, [
        v(2, 'POP-CAL-01', '00', '2026-10-28'),
        ...migrada,
      ]).erros,
    ).toEqual(['A data da revisão precisa ser igual ou posterior à da rev. 00 (28/10/2026).'])
  })
})

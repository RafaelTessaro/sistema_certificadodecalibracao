// Testes do certificado em PDF: gera os três exemplos realistas (server/pdf/exemplosCertificado.ts),
// grava as amostras em server/pdf/exemplos/ e confere o conteúdo pelo texto extraído com o pdftotext
// (testes opcionais: só rodam se o poppler-utils estiver instalado). Com o pdftoppm, também renderiza
// as páginas em PNG (80 dpi) para a revisão visual.

import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { definicaoCertificado, gerarCertificadoPdf } from './certificado.ts'
import { exemploBancada, exemploPlataforma, exemploRodoviaria } from './exemplosCertificado.ts'
import type { DadosCertificadoPdf } from './tipos.ts'

const PASTA_EXEMPLOS = fileURLToPath(new URL('./exemplos/', import.meta.url))

const existe = (programa: string) => !spawnSync(programa, ['-v'], { stdio: 'ignore' }).error
const temPdftotext = existe('pdftotext')
const temPdftoppm = existe('pdftoppm')

/** Texto do PDF (layout preservado), com espaços não separáveis normalizados. */
function textoDoPdf(pdf: Buffer): string {
  const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`pdftotext falhou: ${r.stderr?.toString()}`)
  return r.stdout.toString('utf8').replace(/[\u00A0\u2009\u202F]/g, ' ')
}

/** Texto corrido (sem quebras nem espaços repetidos), para procurar frases que quebram de linha. */
const corrido = (t: string) => t.replace(/\s+/g, ' ')

const paginas = (t: string) => {
  const m = [...t.matchAll(/Página (\d+) de (\d+)/g)]
  return { total: m.length ? Number(m[0][2]) : 0, numeros: [...new Set(m.map((x) => Number(x[1])))] }
}

const EXEMPLOS: Array<{ arquivo: string; dados: () => DadosCertificadoPdf }> = [
  { arquivo: 'certificado-plataforma-300kg', dados: exemploPlataforma },
  { arquivo: 'certificado-bancada-30kg', dados: exemploBancada },
  { arquivo: 'certificado-rodoviaria-80t', dados: exemploRodoviaria },
]

const gerados = new Map<string, Buffer>()
async function pdfDe(arquivo: string): Promise<Buffer> {
  let pdf = gerados.get(arquivo)
  if (!pdf) {
    pdf = await gerarCertificadoPdf(EXEMPLOS.find((e) => e.arquivo === arquivo)!.dados())
    gerados.set(arquivo, pdf)
  }
  return pdf
}

/** Frases e termos comuns a todos os certificados. */
function conferirComum(texto: string, d: DadosCertificadoPdf) {
  const numero = d.calibracao.numero
  const t = corrido(texto)
  expect(t).toContain('CERTIFICADO DE CALIBRAÇÃO')
  expect(t).toContain(numero)
  expect(t).toContain('Página 1 de')
  expect(t).toContain('FABIO DE GODOY LIMA LTDA')
  expect(t).toContain('CNPJ 12.403.843/0001-18')
  expect(t).toContain('Este certificado somente pode ser reproduzido na íntegra')
  // Rastreabilidade, incerteza, abrangência, não acreditação e controle legal
  expect(t).toContain('metrologicamente rastreáveis ao Sistema Internacional de Unidades (SI)')
  expect(t).toContain('probabilidade de abrangência de aproximadamente 95 %')
  expect(t).toContain('referem-se exclusivamente ao instrumento calibrado')
  expect(t).toContain('não é acreditada pela Coordenação-Geral de Acreditação do Inmetro')
  expect(t).toContain('não isenta o instrumento do controle metrológico')
  expect(t).toContain('PADRÕES UTILIZADOS')
  expect(t).toContain('Calibrado por')
  expect(t).toMatch(/Próxima\b/)
  expect(t).toContain(`Código de autenticidade ${d.emissao.codigo}`)
  expect(t).toContain(`Confira a autenticidade com a Balanças.com informando o código`)
  expect(t).toContain(`— Fim do Certificado de Calibração nº ${numero} —`)
  // Nada de "validade", "aferição" nem RBC num certificado não acreditado
  expect(t).not.toMatch(/validade|v[aá]lid[oa] at[eé]/i)
  expect(t).not.toMatch(/aferi[çc][aã]o|aferid[oa]/i)
  expect(t).not.toMatch(/\bRBC\b|Rede Brasileira de Calibra/i)
  expect(t).not.toMatch(/acreditad[oa] pela Cgcre(?! para)/i)
  // Todas as páginas numeradas, de 1 a N, no cabeçalho e no rodapé
  const { total, numeros } = paginas(texto)
  expect(total).toBeGreaterThanOrEqual(2)
  expect(numeros).toEqual(Array.from({ length: total }, (_, i) => i + 1))
  // O fim do certificado está na última página
  const ultima =
    texto
      .split('\f')
      .filter((p) => p.trim())
      .at(-1) ?? ''
  expect(ultima).toContain('Fim do Certificado de Calibração')
}

describe('gerarCertificadoPdf', () => {
  it.each(EXEMPLOS)('gera um PDF válido e grava a amostra: $arquivo', async ({ arquivo }) => {
    const pdf = await pdfDe(arquivo)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(20_000)
    expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF')
    mkdirSync(PASTA_EXEMPLOS, { recursive: true })
    writeFileSync(join(PASTA_EXEMPLOS, `${arquivo}.pdf`), pdf)
  })

  it('é determinístico: gerar de novo dá o mesmo arquivo, byte a byte', async () => {
    const a = await gerarCertificadoPdf(exemploBancada())
    const b = await gerarCertificadoPdf(exemploBancada())
    expect(a.equals(b)).toBe(true)
  })

  it('usa a data da emissão como data do documento e põe os metadados', () => {
    const d = exemploPlataforma()
    const doc = definicaoCertificado(d) as { info: Record<string, unknown>; language: string }
    expect(doc.info.creationDate).toEqual(new Date(d.emissao.emitidoEm))
    expect(doc.info.title).toBe('Certificado de calibração nº CC-2026-00123')
    expect(doc.info.author).toBe('FABIO DE GODOY LIMA LTDA')
    expect(doc.language).toBe('pt-BR')
  })

  it("só põe a marca d'água quando ela é informada", () => {
    expect(definicaoCertificado(exemploPlataforma())).not.toHaveProperty('watermark')
    const comMarca = definicaoCertificado(exemploRodoviaria()) as { watermark?: { text: string } }
    expect(comMarca.watermark?.text).toBe('PRÉVIA — SEM VALOR')
  })

  it('sai com a linha de assinatura quando a imagem não é PNG/JPEG válido', async () => {
    const d = exemploPlataforma()
    d.emissao.tecnico = { ...d.emissao.tecnico, assinatura: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }
    // Cabeçalho de PNG com o resto corrompido: o pdfkit falha e o certificado é refeito sem as imagens
    const quebrada = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])
    d.emissao.signatario = { ...d.emissao.signatario, assinatura: `data:image/png;base64,${quebrada.toString('base64')}` }
    const pdf = await gerarCertificadoPdf(d)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })

  it('gera sem QR code, sem endereço de verificação e com ensaios faltando (prévia de rascunho)', async () => {
    const d = exemploBancada()
    d.calibracao = {
      ...d.calibracao,
      numero: '',
      excentricidade: { ...d.calibracao.excentricidade, aplicavel: false, motivo: 'balança suspensa' },
    }
    d.resultado = { ...d.resultado, excentricidade: { ...d.resultado.excentricidade, aplicavel: false }, repetibilidade: [] }
    d.qrCode = ''
    d.urlVerificacao = ''
    d.marcaDagua = 'PRÉVIA — SEM VALOR'
    const pdf = await gerarCertificadoPdf(d)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    if (temPdftotext) {
      const t = corrido(textoDoPdf(pdf))
      expect(t).toContain('Nº PRÉVIA')
      expect(t).toContain('Ensaio não aplicável: balança suspensa.')
      expect(t).toContain('Ensaio não realizado.')
    }
  })
})

describe.runIf(temPdftotext)('conteúdo do certificado (pdftotext)', () => {
  it('plataforma 300 kg: ajuste, como encontrado, reparo, conformidade e próxima calibração a pedido', async () => {
    const d = exemploPlataforma()
    const texto = textoDoPdf(await pdfDe('certificado-plataforma-300kg'))
    conferirComum(texto, d)
    const t = corrido(texto)
    expect(t).toContain('FRIGORÍFICO VALE DO CORUMBATAÍ LTDA')
    expect(t).toContain('11.444.777/0001-61')
    expect(t).toContain('Toledo do Brasil')
    expect(t).toContain('2180-0041273')
    expect(t).toContain('Portaria Inmetro/Dimel nº 0236/2009')
    expect(t).toContain('OS-2026-0456')
    // P-9a (ajuste), com antes e depois
    expect(t).toContain('antes da calibração foi realizado ajuste externo')
    expect(t).toContain('O ajuste não faz parte da calibração')
    expect(t).toContain('como encontrado (antes do ajuste)')
    expect(t).toContain('como deixado (após o ajuste)')
    // P-9b (reparo)
    expect(t).toContain('registrado(a) na Ordem de Serviço nº OS-2026-0456')
    expect(t).toContain('marca de reparo nº MR-SP 004512')
    expect(t).toContain('Os serviços de reparo e manutenção não fazem parte da calibração')
    // Resultados
    expect(t).toContain('Repetibilidade')
    expect(t).toContain('Excentricidade')
    expect(t).toMatch(/\|ΔI\|máx = 0,05 kg/)
    expect(t).toContain('Retorno ao zero')
    expect(t).toContain('Não conforme') // como encontrado, antes do ajuste
    // Declaração de conformidade
    expect(t).toContain('DECLARAÇÃO DE CONFORMIDADE')
    expect(t).toContain('Portaria Inmetro 157/2022 — em serviço')
    expect(t).toContain('Banda de guarda')
    expect(t).toContain('Esta declaração não constitui verificação metrológica legal')
    // P-10b: próxima calibração só porque o cliente pediu
    expect(t).toContain('Data da próxima calibração informada a pedido do cliente: 13/10/2027')
    expect(t).not.toContain('não contém recomendação de intervalo de calibração')
    // Assinaturas e autenticidade
    expect(t).toContain('EXECUTADO POR')
    expect(t).toContain('AUTORIZADO POR')
    expect(t).toContain('Carlos Eduardo Lima')
    expect(t).toContain('CREA-SP 5062345678')
    expect(t).toContain('https://balancass.com/verificar/7KQ2-9XHM')
    expect(t).toContain('emitido em 14/10/2026, às 10:42 (horário de Brasília)')
  })

  it('bancada 30 kg: sem ajuste, histerese pela média, sem conformidade, com opiniões', async () => {
    const d = exemploBancada()
    const texto = textoDoPdf(await pdfDe('certificado-bancada-30kg'))
    conferirComum(texto, d)
    const t = corrido(texto)
    expect(t).toContain('Maria Aparecida de Souza')
    expect(t).toContain('CPF')
    expect(t).toContain('No laboratório da empresa')
    expect(t).toMatch(/RECEBIMENTO DO ITEM .*13\/10\/2026/)
    expect(t).toContain('não foi realizado ajuste no instrumento')
    expect(t).not.toContain('como encontrado')
    expect(t).toContain('Erro (média)')
    expect(t).toContain('a histerese está incluída na incerteza')
    expect(t).not.toContain('DECLARAÇÃO DE CONFORMIDADE')
    expect(t).not.toContain('EMA')
    // P-10a (sem próxima calibração no certificado)
    expect(t).toContain('Este certificado não contém recomendação de intervalo de calibração')
    expect(t).not.toContain('próxima calibração informada')
    // Opiniões e interpretações, separadas dos resultados
    expect(t).toContain('OPINIÕES E INTERPRETAÇÕES')
    expect(t).toContain('não fazem parte dos resultados de medição')
    // Mesma pessoa executou e autorizou
    expect(t).toContain('EXECUTADO E AUTORIZADO POR')
    // Numeração das seções sem buracos: 7 Observações, 8 Opiniões, 9 Declarações
    expect(t).toMatch(/7 OBSERVAÇÕES/)
    expect(t).toMatch(/8 OPINIÕES E INTERPRETAÇÕES/)
    expect(t).toMatch(/9 DECLARAÇÕES/)
  })

  it('rodoviária 80 t: revisão, prévia, cargas de substituição e faixa parcial', async () => {
    const d = exemploRodoviaria()
    const texto = textoDoPdf(await pdfDe('certificado-rodoviaria-80t'))
    conferirComum(texto, d)
    const t = corrido(texto)
    // P-14a (revisão)
    expect(t).toContain(
      'Este certificado substitui integralmente o Certificado nº CC-2026-00098, emitido em 30/09/2026, que fica cancelado. Motivo: correção do número de série do indicador',
    )
    // A marca d'água diagonal sai letra a letra no pdftotext; a presença dela é conferida na definição
    expect(t).toContain('Balança rodoviária')
    expect(t).toContain('80 000 kg')
    expect(t).toContain('Cargas de substituição')
    expect(t).toContain('Calibração em faixa parcial: a maior carga ensaiada foi 40 020 kg')
    expect(t).toContain('Tolerância do cliente: EMA de ±60 kg')
    expect(t).toContain('Aceitação simples')
    expect(t).toContain('TH-01, BR-01')
  })
})

describe.runIf(temPdftoppm)('amostras em PNG (revisão visual)', () => {
  it.each(EXEMPLOS)('renderiza as páginas de $arquivo', async ({ arquivo }) => {
    const pdf = await pdfDe(arquivo)
    const caminho = join(PASTA_EXEMPLOS, `${arquivo}.pdf`)
    mkdirSync(PASTA_EXEMPLOS, { recursive: true })
    writeFileSync(caminho, pdf)
    for (const f of readdirSync(PASTA_EXEMPLOS))
      if (f.startsWith(`${arquivo}-`) && f.endsWith('.png')) rmSync(join(PASTA_EXEMPLOS, f))
    const r = spawnSync('pdftoppm', ['-r', '80', '-png', caminho, join(PASTA_EXEMPLOS, arquivo)])
    expect(r.status).toBe(0)
    expect(readdirSync(PASTA_EXEMPLOS).some((f) => f.startsWith(`${arquivo}-`) && f.endsWith('.png'))).toBe(true)
  })
})

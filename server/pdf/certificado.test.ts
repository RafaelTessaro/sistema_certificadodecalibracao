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
import { MARGEM_X, passoMarca, unidades } from './timbrado.ts'
import type { DadosCertificadoPdf } from './tipos.ts'

const PASTA_EXEMPLOS = fileURLToPath(new URL('./exemplos/', import.meta.url))

const existe = (programa: string) => !spawnSync(programa, ['-v'], { stdio: 'ignore' }).error
const temPdftotext = existe('pdftotext')
const temPdftoppm = existe('pdftoppm')

/**
 * Texto do PDF (layout preservado), com espaços não separáveis normalizados. Sem o texto diagonal (-nodiag):
 * as letras da marca d'água (PRÉVIA/CANCELADO) cairiam no meio das frases, conforme a altura das linhas.
 */
function textoDoPdf(pdf: Buffer): string {
  const r = spawnSync('pdftotext', ['-layout', '-nodiag', '-enc', 'UTF-8', '-', '-'], {
    input: pdf,
    maxBuffer: 50 * 1024 * 1024,
  })
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
  // Todas as páginas numeradas, de 1 a N
  const { total, numeros } = paginas(texto)
  expect(total).toBeGreaterThanOrEqual(2)
  expect(numeros).toEqual(Array.from({ length: total }, (_, i) => i + 1))
  // Papel timbrado em toda página (ISO/IEC 17025, 7.8.2.1): marca, título e nº no cabeçalho (na página 1, o
  // timbrado completo com o título); razão social, CNPJ, a cláusula de reprodução e "Página i de N" no
  // rodapé. A marca só sai no cabeçalho: se ele deixar de ser desenhado em alguma página, este teste pega.
  const folhas = texto.split('\f').filter((p) => p.trim())
  expect(folhas).toHaveLength(total)
  folhas.forEach((folha, i) => {
    const f = corrido(folha)
    expect(f).toContain(d.emissao.empresa.nomeFantasia.toUpperCase())
    expect(f).toContain('CERTIFICADO DE CALIBRAÇÃO')
    expect(f).toContain(`Nº ${numero}`)
    expect(f).toContain(`Página ${i + 1} de ${total}`)
    expect(f).toContain('FABIO DE GODOY LIMA LTDA · CNPJ 12.403.843/0001-18')
    expect(f).toContain('Este certificado somente pode ser reproduzido na íntegra.')
  })
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
    // A marca d'água diagonal fica fora do texto extraído (-nodiag); a presença dela é conferida na definição
    expect(t).toContain('Balança rodoviária')
    expect(t).toContain('80 000 kg')
    expect(t).toContain('Cargas de substituição')
    expect(t).toContain('Calibração em faixa parcial: a maior carga ensaiada foi 40 020 kg')
    expect(t).toContain('Tolerância do cliente: EMA de ±60 kg')
    expect(t).toContain('Aceitação simples')
    expect(t).toContain('TH-01, BR-01')
  })
})

/** Empresa com todos os campos no limite (120 caracteres), para o papel timbrado. */
function comEmpresaExtrema(d: DadosCertificadoPdf): DadosCertificadoPdf {
  d.emissao = {
    ...d.emissao,
    empresa: {
      ...d.emissao.empresa,
      nomeFantasia:
        'Comércio Manutenção e Montagem de Balanças Mecânicas Eletrônicas Rodoviárias Ferroviárias e Industriais de Médio Porte',
      razaoSocial:
        'Mecânica Metalúrgica Comércio Manutenção Montagem Importação e Exportação de Máquinas e Equipamentos de Pesagem Ltda ME',
      endereco:
        'Rodovia Washington Luís (SP-310), km 173,5, Pista Sul, Galpão 12, Módulo 4, Condomínio Empresarial Rio Claro Business Park',
      bairro: 'Jardim das Palmeiras do Distrito Industrial Norte',
      telefone: '(17) 99999-0000 / (17) 3333-4444',
      email: 'laboratorio.de.metrologia.e.calibracao@balancasrodoviariaseindustriais.com.br',
      site: 'www.balancasindustriaisdointeriorpaulista.com.br',
    },
  }
  d.calibracao = { ...d.calibracao, numero: 'CC-2026-000123-R12', emissao: d.emissao }
  d.marcaDagua = 'CANCELADO'
  return d
}

/** Palavras do PDF com a caixa de cada uma (pdftotext -bbox), por página. */
function palavrasDoPdf(pdf: Buffer): Array<Array<{ x0: number; y0: number; x1: number; y1: number; texto: string }>> {
  const r = spawnSync('pdftotext', ['-bbox', '-nodiag', '-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`pdftotext falhou: ${r.stderr?.toString()}`)
  return r.stdout
    .toString('utf8')
    .split('<page ')
    .slice(1)
    .map((pagina) =>
      [...pagina.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)].map((m) => ({
        x0: Number(m[1]),
        y0: Number(m[2]),
        x1: Number(m[3]),
        y1: Number(m[4]),
        texto: m[5],
      })),
    )
}

describe('papel timbrado', () => {
  it('a margem de baixo cresce com o rodapé (endereço longo), sem cortar nada', () => {
    const normal = definicaoCertificado(exemploPlataforma()) as { pageMargins: number[] }
    const extremo = definicaoCertificado(comEmpresaExtrema(exemploPlataforma())) as { pageMargins: number[] }
    expect(extremo.pageMargins[3]).toBeGreaterThan(normal.pageMargins[3])
    expect(normal.pageMargins[1]).toBe(extremo.pageMargins[1])
  })

  it.runIf(temPdftotext)(
    'com dados no limite: título, nº inteiro, página e CNPJ em toda página, e nada fora da folha',
    async () => {
      const d = comEmpresaExtrema(exemploPlataforma())
      const pdf = await gerarCertificadoPdf(d)
      const folhas = textoDoPdf(pdf)
        .split('\f')
        .filter((p) => p.trim())
      folhas.forEach((folha, i) => {
        const f = corrido(folha)
        expect(f).toContain('CERTIFICADO DE CALIBRAÇÃO')
        expect(f).toContain('Nº CC-2026-000123-R12') // o nº nunca quebra de linha
        expect(f).toContain(`Página ${i + 1} de ${folhas.length}`)
        expect(f).toContain('CNPJ 12.403.843/0001-18')
        expect(f).toContain('Este certificado somente pode ser reproduzido na íntegra.')
        // A marca (cabeçalho) não é descartada pelo pdfmake: a primeira palavra dela está em toda página
        expect(f).toContain('COMÉRCIO MANUTENÇÃO')
      })
      // No rodapé, o endereço quebra entre as partes: o separador "·" nunca fica pendurado no fim (nem no
      // começo) de uma linha
      const topoRodape = 842 - (definicaoCertificado(d) as { pageMargins: number[] }).pageMargins[3]
      for (const pagina of palavrasDoPdf(pdf)) {
        const rodape = pagina.filter((p) => p.y0 > topoRodape)
        for (const sep of rodape.filter((p) => p.texto === '·')) {
          const linha = rodape.filter((p) => p !== sep && Math.abs(p.y1 - sep.y1) < 1)
          expect(linha.some((p) => p.x0 > sep.x1 && p.x0 - sep.x1 < 6)).toBe(true)
          expect(linha.some((p) => p.x1 < sep.x0 && sep.x0 - p.x1 < 6)).toBe(true)
        }
      }
      // Todo texto fica dentro das margens laterais, longe da furação de arquivo, e na área que a impressora
      // imprime (A4 = 595 × 842 pt; caixas do pdftotext, que incluem o espaço dos acentos acima das versais)
      for (const pagina of palavrasDoPdf(pdf))
        for (const p of pagina) {
          expect(p.x0, p.texto).toBeGreaterThanOrEqual(MARGEM_X - 1)
          expect(p.x1, p.texto).toBeLessThanOrEqual(595.28 - MARGEM_X + 1)
          expect(p.y0, p.texto).toBeGreaterThanOrEqual(18)
          expect(p.y1, p.texto).toBeLessThanOrEqual(842 - 22)
        }
    },
  )
})

describe('papel timbrado: quebras e entrelinhas', () => {
  it('prende as palavras curtas à seguinte e o traço solto às duas vizinhas', () => {
    expect(unidades('COMÉRCIO E MANUTENÇÃO DE BALANÇAS SÃO JOÃO DA BOA VISTA EIRELI - ME')).toEqual([
      'COMÉRCIO',
      'E MANUTENÇÃO',
      'DE BALANÇAS',
      'SÃO',
      'JOÃO',
      'DA BOA',
      'VISTA',
      'EIRELI - ME',
    ])
    expect(unidades('BALANÇAS LTDA – EPP')).toEqual(['BALANÇAS', 'LTDA – EPP'])
  })

  it('abre a entrelinha da marca só quando um acento fica sob uma letra ou uma cedilha', () => {
    // Versais sem acento: entrelinha justa
    expect(passoMarca(['BALANÇAS', 'COMERCIAL'])).toBeLessThanOrEqual(1.15)
    // Acento sob uma versal (0,99 em de acento + o branco mínimo)
    expect(passoMarca(['COMÉRCIO', 'ÉTNICA'])).toBeGreaterThanOrEqual(0.99 + 0.15)
    // Acento sob a cedilha do Ç (que desce 0,27 em)
    expect(passoMarca(['AÇO', 'AÉREO'])).toBeGreaterThanOrEqual(0.99 + 0.27 + 0.15)
    // Uma linha só: nada a abrir
    expect(passoMarca(['BALANÇAS.COM'])).toBe(1.08)
  })

  it.runIf(temPdftotext)(
    'cancelado: a situação sai em preto no timbrado de toda página e a razão social não quebra no traço',
    async () => {
      const d = exemploPlataforma()
      d.emissao = {
        ...d.emissao,
        empresa: {
          ...d.emissao.empresa,
          nomeFantasia: 'Comércio de Balanças e Serviços Águia Ímpar Ótima Étnica Úmida',
          razaoSocial: 'Comércio e Manutenção de Balanças e Equipamentos de Pesagem Industrial São João da Boa Vista Eireli - ME',
        },
      }
      d.calibracao = { ...d.calibracao, emissao: d.emissao }
      d.marcaDagua = 'CANCELADO'
      const pdf = await gerarCertificadoPdf(d)
      expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
      const folhas = textoDoPdf(pdf)
        .split('\f')
        .filter((p) => p.trim())
      for (const folha of folhas) {
        expect(folha).toContain('CANCELADO')
        // Nenhuma linha (de nenhuma coluna) termina num traço solto nem numa palavra curta ("DA", "DE", "E")
        for (const trecho of folha.split(/\n|\s{2,}/)) expect(trecho.trimEnd(), trecho).not.toMatch(/\s(-|–|DA|DE|DO|E)$/)
        expect(corrido(folha)).toContain('EIRELI - ME')
      }
    },
  )
})

describe.runIf(temPdftotext)('papel timbrado: alinhamentos', () => {
  it.each(EXEMPLOS)('nº do certificado e "Página X de Y" terminam na margem direita: $arquivo', async ({ arquivo, dados }) => {
    const numero = dados().calibracao.numero
    const direita = 595.28 - MARGEM_X
    for (const [i, pagina] of palavrasDoPdf(await pdfDe(arquivo)).entries()) {
      // nº no cabeçalho (o primeiro da página: o do título, na capa)
      const n = pagina.find((p) => p.texto === numero)
      expect(n, `nº na página ${i + 1}`).toBeDefined()
      expect(Math.abs(n!.x1 - direita), `nº na página ${i + 1}`).toBeLessThan(1)
      // "Página X de Y": a última palavra (Y) na margem direita, abaixo de todo o resto da página
      const k = pagina.findIndex((p, j) => p.texto === 'Página' && pagina[j + 2]?.texto === 'de')
      expect(k, `paginação na página ${i + 1}`).toBeGreaterThanOrEqual(0)
      const total = pagina[k + 3]
      expect(Math.abs(total.x1 - direita), `paginação na página ${i + 1}`).toBeLessThan(1)
      expect(Math.max(...pagina.map((p) => p.y1))).toBeCloseTo(total.y1, 0)
    }
  })

  it("marca d'água com corpo fixo, menor que a área do corpo da página", () => {
    const doc = definicaoCertificado(exemploRodoviaria()) as { watermark?: { fontSize?: number; angle?: number } }
    expect(doc.watermark?.fontSize).toBeGreaterThan(40)
    expect(doc.watermark?.fontSize).toBeLessThanOrEqual(84)
    expect(doc.watermark?.angle).toBe(-50)
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

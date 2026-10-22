// Testes do certificado em PDF: gera os três exemplos realistas (server/pdf/exemplosCertificado.ts),
// grava as amostras em server/pdf/exemplos/ e confere o conteúdo pelo texto extraído com o pdftotext
// (testes opcionais: só rodam se o poppler-utils estiver instalado). Com o pdftoppm, também renderiza
// as páginas em PNG (80 dpi) para a revisão visual.

import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { definicaoCertificado, gerarCertificadoPdf, textoVerificacaoAposReparo, ufDoLocalDaCalibracao } from './certificado.ts'
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

/** Cabeçalho de cada página: marca, título, número do certificado e "Página i de N". */
function conferirCabecalhos(texto: string, numero: string, marca: string) {
  const folhas = texto.split('\f').filter((p) => p.trim())
  folhas.forEach((folha, i) => {
    const t = corrido(folha)
    expect(t).toContain(marca)
    expect(t).toContain('CERTIFICADO DE CALIBRAÇÃO Nº')
    expect(t).toContain(numero)
    expect(t).toContain(`Página ${i + 1} de ${folhas.length}`)
  })
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
  // Sem bloco de autenticidade (código, QR code, endereço de verificação)
  expect(t).not.toMatch(/autenticidade/i)
  expect(t).not.toContain(d.emissao.codigo)
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
  // Cabeçalho em toda página (ISO/IEC 17025, 7.8.2.1): marca, título, número e "Página i de N".
  // A palavra-marca só sai no cabeçalho: se ele fosse descartado por falta de espaço, o teste pegaria.
  conferirCabecalhos(texto, numero, d.emissao.empresa.nomeFantasia.toUpperCase())
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

  it('instrumento: identificação pelo indicador e a plataforma numa linha à parte', () => {
    /** Textos do quadro do instrumento (rótulo seguido do valor). */
    const textos = (d: DadosCertificadoPdf) => JSON.stringify(definicaoCertificado(d))
    const d = exemploPlataforma()
    const t = textos(d)
    expect(t).toContain('"text":"9091-118832"')
    expect(t).toContain('"text":"PLATAFORMA"')
    expect(t).toContain('Toledo do Brasil 2180 · nº de série 2180-0041273')
    expect(t).not.toContain('"text":"INDICADOR"')

    // Sem plataforma cadastrada, não há a linha
    const semPlataforma = exemploPlataforma()
    semPlataforma.emissao.balanca = { ...d.emissao.balanca, plataformaFabricante: '', plataformaModelo: '', plataformaSerie: '' }
    expect(textos(semPlataforma)).not.toContain('"text":"PLATAFORMA"')

    // Certificado emitido com o cadastro antigo (cópia congelada): sai como foi emitido, com a linha do indicador
    const antigo = exemploPlataforma()
    const { plataformaFabricante: _f, plataformaModelo: _m, plataformaSerie: _s, ...resto } = d.emissao.balanca
    antigo.emissao.balanca = {
      ...resto,
      modelo: '2180',
      numeroSerie: '2180-0041273',
      indicadorFabricante: 'Toledo do Brasil',
      indicadorModelo: '9091',
      indicadorSerie: '9091-118832',
    } as unknown as typeof d.emissao.balanca
    const ta = textos(antigo)
    expect(ta).toContain('"text":"2180-0041273"')
    expect(ta).toContain('"text":"INDICADOR"')
    expect(ta).toContain('Toledo do Brasil 9091 · nº de série 9091-118832')
    expect(ta).not.toContain('"text":"PLATAFORMA"')
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

  it('gera com ensaios faltando (prévia de rascunho)', async () => {
    const d = exemploBancada()
    d.calibracao = {
      ...d.calibracao,
      numero: '',
      excentricidade: { ...d.calibracao.excentricidade, aplicavel: false, motivo: 'balança suspensa' },
    }
    d.resultado = { ...d.resultado, excentricidade: { ...d.resultado.excentricidade, aplicavel: false }, repetibilidade: [] }
    d.marcaDagua = 'PRÉVIA — SEM VALOR'
    const pdf = await gerarCertificadoPdf(d)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    if (temPdftotext) {
      const texto = textoDoPdf(pdf)
      const t = corrido(texto)
      // Sem número, o cabeçalho de toda página mostra "PRÉVIA" no lugar dele
      conferirCabecalhos(texto, 'PRÉVIA', 'BALANÇAS.COM')
      expect(t).toContain('Ensaio não aplicável: balança suspensa.')
      expect(t).toContain('Ensaio não realizado.')
    }
  })
})

describe('verificação após reparo: órgão pela UF do local da calibração (Portaria Inmetro 457/2021, 10.1)', () => {
  const empresa = { uf: 'SP' }
  it('acha a UF no endereço da calibração ("Cidade/UF", "Cidade - UF", antes do CEP), nunca num código de rodovia', () => {
    const uf = (localEndereco: string, local: 'CLIENTE' | 'LABORATORIO' = 'CLIENTE') =>
      ufDoLocalDaCalibracao({ local, localEndereco }, empresa)
    expect(uf('Avenida Brasil, 2450 – Jardim Paulista – Rio Claro/SP (expedição)')).toBe('SP')
    expect(uf('Rua das Flores, 10 – Centro – Uberaba/MG – CEP 38010-000')).toBe('MG')
    expect(uf('Rua das Flores, 10, Uberaba - mg')).toBe('')
    expect(uf('Rua das Flores, 10, Uberaba - MG')).toBe('MG')
    expect(uf('Rua das Flores, 10, Uberaba/mg')).toBe('MG')
    expect(uf('Rodovia SP-191, km 37 – Zona Rural – Ipeúna, SP CEP 13537-000')).toBe('SP')
    expect(uf('Rodovia MG-050, km 12, Itaúna, MG')).toBe('MG')
    // Só o código da rodovia: não dá para saber o estado
    expect(uf('Rodovia SP-191, km 37 (portaria 1)')).toBe('')
    // Duas UFs: vale a última (a da cidade, depois da rua)
    expect(uf('Av. São Paulo/SP 100 – Campo Grande/MS')).toBe('MS')
    expect(uf('')).toBe('')
    // No laboratório, sem a UF no endereço: a da empresa; nas instalações do cliente, sem UF: não se sabe
    expect(uf('Rua Sete, 123', 'LABORATORIO')).toBe('SP')
    expect(uf('Rua Sete, 123', 'CLIENTE')).toBe('')
  })

  it('texto fiel à Portaria: "fica sujeito", sem "antes de ser utilizado"', () => {
    expect(textoVerificacaoAposReparo('SP')).toBe(
      'O instrumento fica sujeito à verificação após reparo pelo órgão metrológico competente (IPEM-SP), conforme a legislação metrológica.',
    )
    for (const uf of ['MG', 'PR', '']) {
      expect(textoVerificacaoAposReparo(uf)).toContain('pelo órgão metrológico competente (Inmetro/RBMLQ-I)')
      expect(textoVerificacaoAposReparo(uf)).not.toContain('IPEM-SP')
    }
  })

  it('no certificado, o órgão é o do local da calibração, não o da UF do cadastro do cliente', () => {
    const texto = (d: DadosCertificadoPdf) => JSON.stringify(definicaoCertificado(d).content)
    // Cliente com sede em MG, balança calibrada em Rio Claro/SP
    const sedeMg = exemploPlataforma()
    sedeMg.emissao.cliente = { ...sedeMg.emissao.cliente, uf: 'MG', cidade: 'Uberaba' }
    expect(texto(sedeMg)).toContain('órgão metrológico competente (IPEM-SP)')
    // Cliente com sede em SP, balança calibrada numa filial em MG
    const filialMg = exemploPlataforma()
    filialMg.calibracao = { ...filialMg.calibracao, localEndereco: 'Rua das Flores, 10 – Centro – Uberaba/MG' }
    expect(texto(filialMg)).toContain('órgão metrológico competente (Inmetro/RBMLQ-I)')
    expect(texto(filialMg)).not.toContain('competente (IPEM-SP)')
    expect(texto(filialMg)).not.toContain('antes de ser utilizado')
  })
})

describe('verificação preliminar: respostas novas do rascunho', () => {
  it('zero automático "não verificado" sai escrito; sem resposta (só numa prévia), um travessão', () => {
    const d = exemploPlataforma()
    d.calibracao = {
      ...d.calibracao,
      preliminar: { ...d.calibracao.preliminar, zeroAutomatico: 'NAO_VERIFICADO', limpa: '' },
    }
    const json = JSON.stringify(definicaoCertificado(d).content)
    expect(json).toContain('zero automático: não verificado')
    expect(json).toContain('limpo: —')
    expect(json).not.toContain('undefined')
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
    expect(t).toContain('9091-118832')
    expect(t).toContain('PLATAFORMA')
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
    // Verificação após reparo como na Portaria Inmetro 457/2021 (10.1), pelo órgão do local da calibração
    expect(t).toContain(
      'O instrumento fica sujeito à verificação após reparo pelo órgão metrológico competente (IPEM-SP), conforme a legislação metrológica.',
    )
    expect(t).not.toContain('antes de ser utilizado')
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
    // Assinaturas
    expect(t).toContain('EXECUTADO POR')
    expect(t).toContain('AUTORIZADO POR')
    expect(t).toContain('Carlos Eduardo Lima')
    expect(t).toContain('CREA-SP 5062345678')
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

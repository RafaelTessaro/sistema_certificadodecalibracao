// Testes do certificado em PDF: gera os quatro exemplos realistas (server/pdf/exemplosCertificado.ts),
// grava as amostras em server/pdf/exemplos/ e confere o conteúdo pelo texto extraído com o pdftotext
// (testes opcionais: só rodam se o poppler-utils estiver instalado). Com o pdftoppm, também renderiza
// as páginas em PNG (80 dpi) para a revisão visual.

import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { REPRODUCAO_ANTIGA, TEXTOS_ANTIGOS, TEXTOS_PADRAO } from '#shared/dominio.ts'
import { pdfmake } from './base.ts'
import {
  definicaoCertificado,
  gerarCertificadoPdf,
  linhasDoTexto,
  montarCertificado,
  OCUPACAO_MINIMA_ULTIMA,
  RESSALVA_OPINIOES,
} from './certificado.ts'
import { exemploBancada, exemploPiorCaso, exemploPlataforma, exemploRodoviaria, POP_EXEMPLO } from './exemplosCertificado.ts'
import type { DadosCertificadoPdf } from './tipos.ts'

type NoPdf = { unbreakable?: boolean } & Record<string, unknown>

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

/** Páginas de cada exemplo: o normal em 2; com ajuste e "como encontrado" (o pior caso), no máximo 3. */
const EXEMPLOS: Array<{ arquivo: string; dados: () => DadosCertificadoPdf; paginas: number }> = [
  { arquivo: 'certificado-plataforma-300kg', dados: exemploPlataforma, paginas: 3 },
  { arquivo: 'certificado-bancada-30kg', dados: exemploBancada, paginas: 2 },
  { arquivo: 'certificado-rodoviaria-80t', dados: exemploRodoviaria, paginas: 2 },
  { arquivo: 'certificado-pior-caso', dados: exemploPiorCaso, paginas: 3 },
]

/** Resultados calculados de novo depois de mudar a calibração de um exemplo. */
function recalculado(d: DadosCertificadoPdf): DadosCertificadoPdf {
  const { resultado, comoEncontrado } = calcularCalibracao(d.calibracao, d.emissao.balanca, d.emissao.padroes)
  return { ...d, resultado, comoEncontrado }
}

/**
 * Variantes comuns que ficavam no limite da página (e davam uma página só com as assinaturas) e o pior caso
 * possível; `paginas` = o esperado, quando é o caso de fixar.
 */
const VARIANTES: Array<{ nome: string; dados: () => DadosCertificadoPdf; paginas?: number }> = [
  {
    nome: 'bancada com declaração de conformidade (balança comercial)',
    paginas: 2,
    dados: () => {
      const d = exemploBancada()
      d.calibracao.conformidade = { solicitada: true, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'SIMPLES' }
      return recalculado(d)
    },
  },
  {
    nome: 'plataforma com reparo e ajuste, sem "como encontrado"',
    paginas: 2,
    dados: () => {
      const d = exemploPlataforma()
      d.calibracao.comoEncontrado = null
      return recalculado(d)
    },
  },
  {
    nome: 'bancada com conformidade, reparo e ajuste',
    paginas: 2,
    dados: () => {
      const d = exemploBancada()
      d.calibracao.conformidade = { solicitada: true, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'SIMPLES' }
      d.calibracao.reparo = {
        houve: true,
        descricao: 'troca do teclado',
        marcaReparo: 'MR-SP 1',
        selosRetirados: 'A',
        selosColocados: 'B',
      }
      d.calibracao.ajuste = { realizado: 'EXTERNO', descricao: 'span com 20 kg' }
      d.calibracao.comoEncontrado = null
      return recalculado(d)
    },
  },
  {
    nome: 'rodoviária com uma opinião de 1 linha',
    paginas: 2,
    dados: () => {
      const d = exemploRodoviaria()
      d.calibracao.opinioes = 'Recomenda-se limpar as laterais da plataforma.'
      return d
    },
  },
  // O caso comum: sem revisão, sem ajuste e sem "como encontrado"; uma opinião curta não abre a 3ª página
  {
    nome: 'rodoviária sem revisão + opinião de 1 linha',
    paginas: 2,
    dados: () => {
      const d = rodoviariaSemRevisao()
      d.calibracao.opinioes = 'Recomenda-se limpar as laterais da plataforma.'
      return d
    },
  },
  {
    nome: 'rodoviária sem revisão + opinião e observação de 1 linha',
    paginas: 2,
    dados: () => {
      const d = rodoviariaSemRevisao()
      d.calibracao.opinioes = 'Recomenda-se limpar as laterais da plataforma.'
      d.calibracao.observacoes += '\nPlataforma lavada pelo cliente antes da calibração.'
      return d
    },
  },
  {
    nome: 'bancada + opinião',
    paginas: 2,
    dados: () => {
      const d = exemploBancada()
      d.calibracao.opinioes = 'A balança está em boas condições de uso; mantenha o prato limpo e o nível centralizado.'
      d.calibracao.observacoes = 'Balança usada na pesagem de amostras do controle de qualidade.'
      return d
    },
  },
  {
    // Configuração com os textos de fábrica antigos (longos), de antes da migração para os curtos
    nome: 'rodoviária sem revisão + opinião de 1 linha, com os textos antigos',
    paginas: 2,
    dados: () => {
      const d = rodoviariaSemRevisao()
      d.calibracao.opinioes = 'Recomenda-se limpar as laterais da plataforma.'
      d.emissao.textos = { ...d.emissao.textos, ...TEXTOS_ANTIGOS }
      return d
    },
  },
  {
    nome: 'rodoviária sem revisão + opinião de 2 linhas e observação',
    paginas: 2,
    dados: () => {
      const d = rodoviariaSemRevisao()
      d.calibracao.opinioes =
        'Recomenda-se limpar as laterais da plataforma e retirar o acúmulo de terra sob as cabeceiras, que pode encostar na estrutura e causar erros de indicação nas cargas maiores.'
      d.calibracao.observacoes += '\nPlataforma lavada pelo cliente antes da calibração.'
      return d
    },
  },
  {
    nome: 'plataforma sem reparo, com "como encontrado"',
    paginas: 2,
    dados: () => {
      const d = exemploPlataforma()
      d.calibracao.reparo = { houve: false, descricao: '', marcaReparo: '', selosRetirados: '', selosColocados: '' }
      return d
    },
  },
  {
    nome: 'pior caso com 6 padrões, 3 cargas de repetibilidade e 10 posições',
    dados: () => {
      const d = exemploPiorCaso()
      const k = d.calibracao
      k.repetibilidade = [
        { id: 'r1', carga: 10000, leituras: [10000, 10010, 10000] },
        { id: 'r2', carga: 40000, leituras: [40020, 40020, 40040] },
        { id: 'r3', carga: 70000, leituras: [70050, 70100, 70050] },
      ]
      k.excentricidade.posicoes = Array.from({ length: 10 }, (_, i) => ({
        rotulo: `Apoio ${i + 1}`,
        leitura: 10000 + (i % 3) * 10,
        referencia: null,
      }))
      const extra = d.emissao.padroes
        .slice(0, 2)
        .map((p, i) => ({ ...p, id: `${p.id}-x${i}`, identificacao: `${p.identificacao}B` }))
      d.emissao.padroes = [...d.emissao.padroes, ...extra]
      return recalculado(d)
    },
  },
]

/** A rodoviária de exemplo como um certificado comum: original (sem revisão) e sem marca d'água. */
function rodoviariaSemRevisao(): DadosCertificadoPdf {
  const d = exemploRodoviaria()
  d.calibracao = { ...d.calibracao, numero: 'CC-2026-00098', revisao: 0, substituiId: '', motivoRevisao: '' }
  d.emissao = { ...d.emissao, substituiNumero: '', substituiEmissao: '' }
  d.marcaDagua = ''
  return d
}

/** Folhas do texto extraído (as vazias fora). */
const folhas = (texto: string) => texto.split('\f').filter((p) => p.trim())

const gerados = new Map<string, Buffer>()
async function pdfDe(arquivo: string): Promise<Buffer> {
  let pdf = gerados.get(arquivo)
  if (!pdf) {
    pdf = await gerarCertificadoPdf(EXEMPLOS.find((e) => e.arquivo === arquivo)!.dados())
    gerados.set(arquivo, pdf)
  }
  return pdf
}

/** Cabeçalho de cada página: marca, título, número do certificado, o procedimento (POP) e "Página i de N". */
function conferirCabecalhos(texto: string, numero: string, marca: string, pop = POP_EXEMPLO) {
  const folhas = texto.split('\f').filter((p) => p.trim())
  folhas.forEach((folha, i) => {
    const t = corrido(folha)
    expect(t).toContain(marca)
    expect(t).toContain('CERTIFICADO DE CALIBRAÇÃO Nº')
    expect(t).toContain(numero)
    expect(t).toContain(`Página ${i + 1} de ${folhas.length}`)
    if (pop) expect(t).toContain(`POP: ${pop} · Página ${i + 1} de ${folhas.length}`)
    else expect(t).not.toContain('POP:')
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
  expect(total).toBeLessThanOrEqual(3)
  expect(numeros).toEqual(Array.from({ length: total }, (_, i) => i + 1))
  // O método é o procedimento (POP) da emissão, com a descrição curta
  expect(t).toContain('MÉTODO — PROCEDIMENTO (POP)')
  expect(t).toContain(`${d.emissao.textos.procedimento} — Calibração por comparação direta`)
  // Enxuto: sem o gráfico de erros, sem o desenho das posições e sem a verificação preliminar inteira
  expect(t).not.toContain('Erro de indicação em função da carga')
  expect(t).not.toContain('Posições vistas de cima')
  expect(t).not.toMatch(/identificável: sim/)
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

describe('gerarCertificadoPdf', { timeout: 60_000 }, () => {
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

  it('prévia do rascunho: sem as imagens das assinaturas (só as linhas) e sem "emitido em"', () => {
    const imagens = (d: DadosCertificadoPdf) => JSON.stringify(definicaoCertificado(d)).match(/"image":/g)?.length ?? 0
    const emitido = exemploPlataforma()
    expect(imagens(emitido)).toBe(2)
    const previa: DadosCertificadoPdf = { ...emitido, marcaDagua: 'PRÉVIA — SEM VALOR', previa: true }
    expect(imagens(previa)).toBe(0)
    const json = JSON.stringify(definicaoCertificado(previa))
    expect(json).not.toContain('emitido em')
    expect(json).toContain('Prévia gerada em 14/10/2026, às 10:42 (horário de Brasília), sem valor.')
    // Os nomes e as linhas continuam (quem vai executar e autorizar)
    expect(json).toContain('Carlos Eduardo Lima')
    expect(json).toContain('Fábio de Godoy Lima')
    // A amostra da prévia (rodoviária) também
    expect(imagens(exemploRodoviaria())).toBe(0)
  })

  it('pressão atmosférica só com o barômetro entre os padrões', () => {
    const celula = (d: DadosCertificadoPdf) => {
      const json = JSON.stringify(definicaoCertificado(d))
      return json.slice(json.indexOf('PRESSÃO ATMOSFÉRICA'), json.indexOf('MONITORAMENTO AMBIENTAL'))
    }
    const semBarometro = exemploBancada()
    expect(semBarometro.emissao.padroes.some((p) => p.tipo === 'BAROMETRO')).toBe(false)
    expect(semBarometro.calibracao.ambiente.pressao).toBeNull()
    // Digitada sem barômetro (a emissão não deixa; um certificado antigo): não sai
    semBarometro.calibracao.ambiente.pressao = 925
    expect(celula(semBarometro)).not.toContain('925 hPa')
    expect(celula(exemploRodoviaria())).toContain('941 hPa')
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

describe.runIf(temPdftotext)('conteúdo do certificado (pdftotext)', { timeout: 60_000 }, () => {
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
    // P-9a (ajuste), com antes e depois, numa frase só
    expect(t).toContain('antes da calibração foi realizado ajuste externo')
    expect(t).toContain('Resultados antes do ajuste em 4.4 (“como encontrado”) e depois dele em 4.3 (“como deixado”).')
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
    // Assinaturas
    expect(t).toContain('EXECUTADO POR')
    expect(t).toContain('AUTORIZADO POR')
    expect(t).toContain('Carlos Eduardo Lima')
    expect(t).toContain('CREA-SP 5062345678')
    expect(t).toContain('emitido em 14/10/2026, às 10:42 (horário de Brasília)')
    // A data da emissão e a linha de fim numa linha só
    expect(texto.split('\n').find((l) => l.includes('emitido em 14/10/2026'))).toMatch(
      /emitido em 14\/10\/2026, às 10:42 \(horário de Brasília\)\. +— Fim do Certificado de Calibração nº CC-2026-00123 —/,
    )
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
    // Numeração das seções sem buracos (sem conformidade): 5 Observações, 6 Opiniões, 7 Declarações
    expect(t).toMatch(/1 DADOS DA CALIBRAÇÃO/)
    expect(t).toMatch(/4 RESULTADOS/)
    expect(t).toMatch(/5 OBSERVAÇÕES/)
    expect(t).toMatch(/6 OPINIÕES E INTERPRETAÇÕES/)
    expect(t).toMatch(/7 DECLARAÇÕES/)
    // Sem item "não" na verificação preliminar, nada dela no certificado
    expect(t).not.toContain('Verificação preliminar')
  })

  it('observações digitadas uma por linha: um marcador para cada (sem as linhas vazias), como os outros itens', async () => {
    expect(linhasDoTexto('  Uma.\r\n\n Duas. \nTrês.\n')).toEqual(['Uma.', 'Duas.', 'Três.'])
    expect(linhasDoTexto(' \n ')).toEqual([])
    const d = rodoviariaSemRevisao()
    const linhas = [
      'Plataforma lavada pelo cliente antes da calibração.',
      'Balança ao ar livre, com vento fraco durante os ensaios.',
      'Indicador substituído pelo cliente em 2025.',
    ]
    d.calibracao.observacoes = `${d.calibracao.observacoes.trim()}\n\n${linhas.join('\n')}\n`
    const dados = recalculado(d)
    // Os itens das listas (ul) do certificado: cada linha num item, nenhum item com quebra de linha
    const itens: string[] = []
    const visitar = (no: unknown): void => {
      if (Array.isArray(no)) return no.forEach(visitar)
      if (!no || typeof no !== 'object') return
      const o = no as Record<string, unknown>
      if (Array.isArray(o.ul))
        for (const i of o.ul) itens.push(typeof (i as { text?: unknown }).text === 'string' ? (i as { text: string }).text : '')
      Object.values(o).forEach(visitar)
    }
    visitar((definicaoCertificado(dados) as { content: unknown }).content)
    const digitadas = linhasDoTexto(d.calibracao.observacoes)
    expect(digitadas).toHaveLength(4)
    for (const l of digitadas) expect(itens).toContain(l)
    expect(itens.filter((t) => t.includes('\n'))).toEqual([])
    // No PDF, cada uma começa a sua linha; e continua em 2 páginas
    const texto = textoDoPdf(await gerarCertificadoPdf(dados))
    for (const l of linhas) expect(texto).toMatch(new RegExp(`^\\s*${l.slice(0, 30)}`, 'm'))
    expect(paginas(texto).total).toBe(2)
  })

  it('rodoviária 80 t: revisão, prévia, cargas de substituição e faixa parcial', async () => {
    const d = exemploRodoviaria()
    const texto = textoDoPdf(await pdfDe('certificado-rodoviaria-80t'))
    conferirComum(texto, d)
    const t = corrido(texto)
    // P-14a (revisão)
    expect(t).toContain(
      'Revisão: este certificado substitui integralmente o Certificado nº CC-2026-00098, emitido em 30/09/2026, que fica cancelado. Motivo: correção do número de série do indicador',
    )
    // A marca d'água diagonal sai letra a letra no pdftotext; a presença dela é conferida na definição
    expect(t).toContain('Balança rodoviária')
    expect(t).toContain('80 000 kg')
    expect(t).toContain('Cargas de substituição')
    expect(t).toContain('Calibração em faixa parcial: a maior carga ensaiada foi 40 020 kg')
    expect(t).toContain('Tolerância do cliente: EMA de ±60 kg')
    expect(t).toContain('Aceitação simples')
    expect(t).toContain('TH-01, BR-01')
    // Prévia: sem "emitido em" (não foi emitido), com quando foi gerada e que não tem valor
    expect(t).toContain('Prévia gerada em 14/10/2026, às 16:10 (horário de Brasília), sem valor.')
    expect(t).not.toMatch(/emitido em 14\/10\/2026/)
    // A pressão sai: o barômetro que a mediu está entre os padrões
    expect(t).toMatch(/PRESSÃO ATMOSFÉRICA .*941 hPa/)
  })
})

describe.runIf(temPdftotext)('certificado enxuto (2 páginas; 3 no pior caso)', { timeout: 60_000 }, () => {
  it.each(EXEMPLOS)('$arquivo: $paginas páginas', async ({ arquivo, paginas: esperado }) => {
    const texto = textoDoPdf(await pdfDe(arquivo))
    expect(paginas(texto).total).toBe(esperado)
  })

  it('pior caso: multi-intervalo, substituição, ajuste com "como encontrado", reparo, revisão e conformidade em 3 páginas', async () => {
    const d = exemploPiorCaso()
    const texto = textoDoPdf(await pdfDe('certificado-pior-caso'))
    conferirComum(texto, d)
    const t = corrido(texto)
    // Características metrológicas do multi-intervalo numa linha só da grade (sem tabela de faixas)
    expect(t).toMatch(/CAPACIDADE \(MAX\) · MULTI-INTERVALO .*30 000 \/ 60 000 \/ 80 000 kg/)
    expect(t).toContain('10 / 20 / 50 kg')
    expect(t).toContain('como encontrado (antes do ajuste)')
    expect(t).toContain('como deixado (após o ajuste)')
    expect(t.match(/Cargas de substituição \(EURAMET cg-18, 4\.3\.3\): 7 etapas/g)).toHaveLength(2)
    expect(t).toContain('Revisão: este certificado substitui integralmente o Certificado nº CC-2026-00131')
    expect(t).toContain('Reparo: o instrumento passou por reparo/manutenção')
    // Verificação preliminar: uma linha só, com o item "não"
    expect(t).toContain('Verificação preliminar: item(ns) não atendido(s): pré-carga aplicada.')
    expect(t).toContain('DECLARAÇÃO DE CONFORMIDADE')
    expect(t).toContain('Aceitação simples')
    expect(t).toContain('OPINIÕES E INTERPRETAÇÕES')
    // Uma legenda só para todas as tabelas dos resultados
    expect(t.match(/Erro = indicação − carga/g)).toHaveLength(1)
    expect(t.match(/U: incerteza expandida; k: fator de abrangência/g)).toHaveLength(1)
    // As 4 linhas dos padrões, com o certificado, o laboratório, a acreditação e a próxima calibração
    for (const x of [
      'PP500-01 a 20',
      'PP20-01 a 15',
      'TH-01',
      'BR-01',
      'CAL-20877/2025',
      'Acreditação Cgcre CAL 0529',
      '04/11/2027',
    ])
      expect(t).toContain(x)
  })

  it('excentricidade em tabela compacta: as posições nas colunas; mais de 8 posições, em outra tabela embaixo', async () => {
    const d = exemploPlataforma()
    const t = corrido(textoDoPdf(await pdfDe('certificado-plataforma-300kg')))
    expect(t).toMatch(
      /Posição 1 Centro 2 Frente esquerda 3 Trás esquerda 4 Trás direita 5 Frente direita Indicação \(kg\) 100,00 100,05 100,00 99,95 100,05 Desvio ΔI \(kg\) referência \+0,05 0,00 −0,05 \+0,05/,
    )
    // Plataforma com 10 apoios: duas tabelas (8 + 2 posições), cada uma com o seu cabeçalho
    const apoios = exemploPlataforma()
    apoios.calibracao = {
      ...d.calibracao,
      excentricidade: {
        ...d.calibracao.excentricidade,
        posicoes: Array.from({ length: 10 }, (_, i) => ({
          rotulo: `Apoio ${i + 1}`,
          leitura: 100 + (i % 2) * 0.05,
          referencia: null,
        })),
      },
    }
    const doc = definicaoCertificado(apoios) as { content: unknown }
    const json = JSON.stringify(doc.content)
    expect(json.match(/"text":"Posição"/g)).toHaveLength(2)
    expect(json).toContain('"text":"Apoio 9"')
    const ta = corrido(textoDoPdf(await gerarCertificadoPdf(apoios)))
    expect(ta).toMatch(/9 Apoio 9 10 Apoio 10/)
  })

  it('sem gráfico nem desenho: o único SVG do conteúdo é nenhum (o logo fica no cabeçalho)', () => {
    for (const e of EXEMPLOS) {
      const doc = definicaoCertificado(e.dados()) as { content: unknown }
      expect(JSON.stringify(doc.content)).not.toContain('<svg')
    }
  })

  it('letra legível: dados com 8 pt ou mais, notas e declarações com 7 pt ou mais', () => {
    const doc = definicaoCertificado(exemploPiorCaso()) as {
      content: unknown
      styles: Record<string, { fontSize: number }>
      defaultStyle: { fontSize: number }
    }
    for (const estilo of ['td', 'valor']) expect(doc.styles[estilo].fontSize, estilo).toBeGreaterThanOrEqual(8)
    for (const estilo of ['nota', 'declaracao', 'paragrafo', 'th'])
      expect(doc.styles[estilo].fontSize, estilo).toBeGreaterThanOrEqual(7)
    expect(doc.defaultStyle.fontSize).toBeGreaterThanOrEqual(8)
    // Nenhum tamanho avulso abaixo de 7 pt no conteúdo
    const tamanhos: number[] = []
    const visitar = (no: unknown) => {
      if (Array.isArray(no)) no.forEach(visitar)
      else if (no && typeof no === 'object') {
        const x = no as { fontSize?: unknown; id?: unknown }
        // As marcas da montagem (um espaço de 0,1 pt depois de cada seção) não são texto
        const marca = typeof x.id === 'string' && x.id.startsWith('fim:')
        if (typeof x.fontSize === 'number' && !marca) tamanhos.push(x.fontSize)
        Object.values(no).forEach(visitar)
      }
    }
    visitar(doc.content)
    expect(Math.min(...tamanhos)).toBeGreaterThanOrEqual(7)
  })

  it('letra legível: só as marcas invisíveis da montagem (um espaço, sem tinta) ficam abaixo de 7 pt', () => {
    const miudos: unknown[] = []
    const visitar = (no: unknown) => {
      if (Array.isArray(no)) no.forEach(visitar)
      else if (no && typeof no === 'object') {
        const x = no as { fontSize?: number; text?: unknown; id?: string }
        if (typeof x.fontSize === 'number' && x.fontSize < 7) miudos.push(x)
        Object.values(no).forEach(visitar)
      }
    }
    visitar((definicaoCertificado(exemploPiorCaso()) as { content: unknown }).content)
    expect(miudos.length).toBeGreaterThan(0)
    for (const x of miudos) expect(x).toMatchObject({ text: ' ', id: expect.stringMatching(/^fim:/) })
  })

  it('o título dos padrões nunca fica sozinho no pé da página: vai com o cabeçalho e a 1ª linha da tabela', async () => {
    for (let espaco = 170; espaco <= 270; espaco += 10) {
      const doc = definicaoCertificado(exemploBancada()) as { content: Array<{ headlineLevel?: number }> }
      const i = doc.content.findIndex((n) => typeof n.headlineLevel === 'number' && n.headlineLevel > 100)
      expect(i).toBeGreaterThan(0)
      doc.content.splice(i, 0, { text: '', margin: [0, espaco, 0, 0] } as never)
      const pdf = await pdfmake()
        .createPdf(doc as never)
        .getBuffer()
      const folhas = textoDoPdf(pdf).split('\f')
      const titulo = folhas.findIndex((f) => f.includes('PADRÕES UTILIZADOS'))
      const linha = folhas.findIndex((f) => f.includes('JP-05'))
      expect(titulo, `espaço de ${espaco} pt`).toBe(linha)
    }
  })

  it('emitido sem procedimento (cópia congelada antiga ou texto vazio): sai sem "POP:" no cabeçalho', async () => {
    const d = exemploBancada()
    d.emissao = { ...d.emissao, textos: { ...d.emissao.textos, procedimento: '' } }
    const texto = textoDoPdf(await gerarCertificadoPdf(d))
    conferirCabecalhos(texto, d.calibracao.numero, 'BALANÇAS.COM', '')
    expect(corrido(texto)).toContain('MÉTODO — PROCEDIMENTO (POP) Calibração por comparação direta')
  })

  it.each(VARIANTES.filter((v) => v.paginas))('$nome: $paginas páginas', async ({ dados, paginas: esperado }) => {
    expect(paginas(textoDoPdf(await gerarCertificadoPdf(dados()))).total).toBe(esperado)
  })

  it('o procedimento (POP) da emissão sai no alto de toda página e no método, com o código que estiver configurado', async () => {
    const d = exemploPiorCaso()
    d.emissao = { ...d.emissao, textos: { ...d.emissao.textos, procedimento: 'BALANÇAS-POP-123 rev. 2' } }
    const texto = textoDoPdf(await gerarCertificadoPdf(d))
    conferirCabecalhos(texto, d.calibracao.numero, 'BALANÇAS.COM', 'BALANÇAS-POP-123 rev. 2')
    expect(corrido(texto)).toContain('MÉTODO — PROCEDIMENTO (POP) BALANÇAS-POP-123 rev. 2 —')
    expect((definicaoCertificado(d) as { info: { keywords: string } }).info.keywords).toContain('BALANÇAS-POP-123 rev. 2')
  })
})

describe('o fim do certificado nunca fica sozinho', { timeout: 120_000 }, () => {
  const casos = [...EXEMPLOS.map((e) => ({ nome: e.arquivo, dados: e.dados })), ...VARIANTES]

  it.each(casos)('$nome: as declarações vão inteiras, num bloco só com as assinaturas', ({ dados }) => {
    const d = dados()
    const textos = d.emissao.textos
    const doc = definicaoCertificado(d) as { content: NoPdf[] }
    const ultimo = doc.content.at(-1)!
    expect(ultimo.unbreakable).toBe(true)
    const json = JSON.stringify(ultimo)
    expect(json).toContain('DECLARAÇÕES')
    for (const t of [textos.incerteza, textos.abrangencia, textos.controleLegal]) expect(json).toContain(t.slice(0, 60))
    expect(json).toContain('EXECUTADO')
    expect(json).toContain('— Fim do Certificado de Calibração nº')
    // Nenhuma declaração fora do bloco
    expect(JSON.stringify(doc.content.slice(0, -1))).not.toContain(textos.incerteza.slice(0, 60))
  })

  it.runIf(temPdftotext).each(casos)(
    '$nome: a última página tem as declarações inteiras e as assinaturas (até 3 páginas)',
    async (c) => {
      // Sem a marca d'água (não muda a paginação): o pdftotext a mistura, letra a letra, ao texto
      const texto = textoDoPdf(await gerarCertificadoPdf({ ...c.dados(), marcaDagua: '' }))
      const paginasDoPdf = folhas(texto)
      // Só o pior caso extremo (fora das amostras) passa de 3 páginas
      expect(paginasDoPdf.length).toBeLessThanOrEqual(/6 padrões/.test(c.nome) ? 4 : 3)
      const ultima = corrido(paginasDoPdf.at(-1)!)
      const antes = ultima.slice(0, ultima.search(/EXECUTADO (E AUTORIZADO )?POR/))
      expect(antes).toMatch(
        /\d+ DECLARAÇÕES 1\. A incerteza expandida .* 4\. Esta calibração não isenta o instrumento do controle metrológico/,
      )
      expect(ultima).toContain('Fim do Certificado de Calibração')
    },
  )

  it('sem declaração nenhuma (textos apagados nas configurações), o fim vai inteiro', () => {
    const d = exemploBancada()
    d.emissao.textos = { ...d.emissao.textos, incerteza: '', abrangencia: '', naoAcreditado: '', controleLegal: '' }
    const doc = definicaoCertificado(d) as { content: NoPdf[] }
    expect(JSON.stringify(doc.content)).not.toContain('DECLARAÇÕES')
    expect(doc.content.at(-1)).toMatchObject({ unbreakable: true })
    expect(JSON.stringify(doc.content.at(-1))).toContain('— Fim do Certificado')
  })
})

describe('páginas equilibradas e fim compacto', { timeout: 120_000 }, () => {
  /** O certificado com a paginação natural (sem o equilíbrio), em texto. */
  async function natural(d: DadosCertificadoPdf): Promise<string[]> {
    const pdf = await pdfmake()
      .createPdf(definicaoCertificado({ ...d, marcaDagua: '' }) as never)
      .getBuffer()
    return folhas(textoDoPdf(pdf))
  }

  it.runIf(temPdftotext)(
    'plataforma (ajuste com "como encontrado", reparo e conformidade): a 3ª página leva seções inteiras, não só o fim',
    async () => {
      const d = exemploPlataforma()
      // Sem o equilíbrio, a 3ª página ficaria só com as declarações e as assinaturas
      const antes = await natural(d)
      expect(antes).toHaveLength(3)
      const p3 = corrido(antes[2])
      expect(p3.slice(p3.indexOf('Página 3 de 3') + 'Página 3 de 3'.length).trim()).toMatch(/^7 DECLARAÇÕES/)
      const m = await montarCertificado(d)
      expect(m.paginas).toBe(3)
      expect(m.quebras).toEqual(['conformidade'])
      // As duas últimas páginas com pelo menos ≈ metade cada (antes: ≈ 3/4 e ≈ 1/4)
      expect(m.ocupacao[2]).toBeGreaterThanOrEqual(0.45)
      expect(m.ocupacao[1]).toBeGreaterThanOrEqual(0.45)
      const ultima = corrido(folhas(textoDoPdf(m.pdf))[2])
      expect(ultima).toMatch(/5 DECLARAÇÃO DE CONFORMIDADE .* 6 OBSERVAÇÕES .* 7 DECLARAÇÕES .* Fim do Certificado/)
      // O PDF gerado é o da montagem, byte a byte (sem as imagens das assinaturas: o pdfkit decodifica os PNG
      // com transparência em paralelo e a ordem dos objetos no arquivo varia; o conteúdo é o mesmo)
      const semImagens: DadosCertificadoPdf = {
        ...d,
        emissao: {
          ...d.emissao,
          tecnico: { ...d.emissao.tecnico, assinatura: '' },
          signatario: { ...d.emissao.signatario, assinatura: '' },
        },
      }
      const montado = await montarCertificado(semImagens)
      expect(montado.quebras).toEqual(['conformidade'])
      expect((await gerarCertificadoPdf(semImagens)).equals(montado.pdf)).toBe(true)
    },
  )

  it.runIf(temPdftotext).each([...EXEMPLOS.map((e) => ({ nome: e.arquivo, dados: e.dados })), ...VARIANTES])(
    '$nome: com 3 páginas ou mais, a última leva mais que as declarações e as assinaturas',
    async ({ dados }) => {
      const m = await montarCertificado({ ...dados(), marcaDagua: '' })
      expect(m.ocupacao).toHaveLength(m.paginas)
      if (m.paginas < 3) {
        // 2 páginas: a paginação natural, sem quebra forçada
        expect(m.quebras).toEqual([])
        return
      }
      const ultima = corrido(folhas(textoDoPdf(m.pdf)).at(-1)!)
      const antesDasDeclaracoes = ultima.slice(0, ultima.search(/\d+ DECLARAÇÕES/))
      expect(antesDasDeclaracoes).toMatch(
        /\d(\.\d)? (DECLARAÇÃO DE CONFORMIDADE|OBSERVAÇÕES|OPINIÕES E INTERPRETAÇÕES|RESULTADOS|Erro de indicação|Excentricidade)/,
      )
      expect(m.ocupacao.at(-1)!).toBeGreaterThanOrEqual(OCUPACAO_MINIMA_ULTIMA - 0.1)
    },
  )

  it('a montagem só mexe na paginação de 3 páginas ou mais com a última quase vazia', async () => {
    // Pior caso: a 3ª página já tinha observações e opiniões; o equilíbrio leva a conformidade também
    const pior = await montarCertificado(exemploPiorCaso())
    expect(pior.paginas).toBe(3)
    expect(pior.ocupacao[2]).toBeGreaterThanOrEqual(OCUPACAO_MINIMA_ULTIMA)
    // 2 páginas: como sai
    for (const d of [exemploBancada(), exemploRodoviaria()]) {
      const m = await montarCertificado(d)
      expect(m.paginas).toBe(2)
      expect(m.quebras).toEqual([])
    }
    // Uma quebra pedida na definição começa a seção numa página nova (o grupo final nunca recebe quebra)
    const doc = definicaoCertificado(exemploBancada(), { quebras: ['observacoes', 'declaracoes'] }) as {
      content: Array<{ pageBreak?: string; id?: string }>
    }
    expect(doc.content.filter((x) => x.pageBreak === 'before')).toHaveLength(1)
    const i = doc.content.findIndex((x) => x.pageBreak === 'before')
    expect(doc.content[i - 1].id).toBe('fim:indicacao')
    // A marca do fim do certificado só na medição
    expect(JSON.stringify(doc.content)).not.toContain('fim:declaracoes')
    expect(JSON.stringify((definicaoCertificado(exemploBancada(), { medir: true }) as { content: unknown }).content)).toContain(
      'fim:declaracoes',
    )
  })

  it.runIf(temPdftotext)(
    'normal (sem ajuste) com opinião e observação de 1 linha: 2 páginas, com folga no pé da 2ª',
    async () => {
      for (const nome of ['rodoviária sem revisão + opinião de 1 linha', 'bancada + opinião']) {
        const m = await montarCertificado(VARIANTES.find((v) => v.nome === nome)!.dados())
        expect(m.paginas, nome).toBe(2)
        expect(m.ocupacao[1], nome).toBeLessThanOrEqual(0.9)
      }
    },
  )

  it.runIf(temPdftotext)('opiniões: a ressalva vai na linha do título, e a caixa só com a opinião', async () => {
    const texto = textoDoPdf(await pdfDe('certificado-bancada-30kg'))
    const linha = texto.split('\n').find((l) => l.includes('OPINIÕES E INTERPRETAÇÕES'))!
    expect(linha).toMatch(
      /6 +OPINIÕES E INTERPRETAÇÕES +Baseadas nos resultados; não fazem parte dos resultados de medição\. Emitidas por pessoal autorizado\.$/,
    )
    expect(corrido(texto).split(RESSALVA_OPINIOES)).toHaveLength(2)
    expect(RESSALVA_OPINIOES).toContain('não fazem parte dos resultados de medição')
  })

  it.runIf(temPdftotext)(
    'assinaturas baixas: imagem até 22 pt; com uma só, a data e o fim ao lado dela (sem linha a mais)',
    async () => {
      const imagens: Array<{ fit: number[] }> = []
      const visitar = (no: unknown) => {
        if (Array.isArray(no)) no.forEach(visitar)
        else if (no && typeof no === 'object') {
          const x = no as { image?: unknown; fit?: number[] }
          if (x.image && x.fit) imagens.push(x as { fit: number[] })
          Object.values(no).forEach(visitar)
        }
      }
      visitar((definicaoCertificado(exemploPlataforma()) as { content: unknown }).content)
      expect(imagens).toHaveLength(2)
      for (const i of imagens) expect(i.fit[1]).toBeLessThanOrEqual(22)
      // Uma assinatura (executado e autorizado pela mesma pessoa): a data e o fim na coluna ao lado
      const linhas = textoDoPdf(await pdfDe('certificado-bancada-30kg')).split('\n')
      expect(linhas.find((l) => l.includes('Fábio de Godoy Lima'))).toMatch(
        /Fábio de Godoy Lima +Rio Claro\/SP, emitido em 14\/10\/2026, às 15:05 \(horário de Brasília\)\.$/,
      )
      expect(linhas.find((l) => l.includes('Responsável técnico'))).toMatch(
        /CREA-SP 5062345678 +— Fim do Certificado de Calibração nº CC-2026-00124 —$/,
      )
    },
  )

  it.runIf(temPdftotext)('só o obrigatório: sem separadores numa observação; o intervalo numa linha', async () => {
    for (const e of EXEMPLOS) expect(corrido(textoDoPdf(await pdfDe(e.arquivo)))).not.toMatch(/Separador (decimal|de milhar)/)
    const linhas = textoDoPdf(await pdfDe('certificado-bancada-30kg')).split('\n')
    expect(linhas.find((l) => l.includes('não contém recomendação de intervalo'))?.trim()).toBe(TEXTOS_PADRAO.intervalo)
  })
})

describe('cláusula de reprodução no rodapé', { timeout: 60_000 }, () => {
  /** Margem de baixo da página (pt): cresce com as linhas do rodapé. */
  const margemBase = (d: DadosCertificadoPdf) => (definicaoCertificado(d) as { pageMargins: number[] }).pageMargins[3]

  it('o texto padrão é curto: as duas frases cabem ao lado do endereço e dos contatos; nada nas declarações', async () => {
    const d = exemploBancada()
    expect(d.emissao.textos.reproducao).toBe(TEXTOS_PADRAO.reproducao)
    // Três linhas no rodapé, como antes (a cláusula não ocupa linha própria)
    expect(margemBase(d)).toBe(71)
    if (!temPdftotext) return
    const texto = textoDoPdf(await pdfDe('certificado-bancada-30kg'))
    for (const [i, folha] of folhas(texto).entries()) {
      const linhas = folha.split('\n')
      // O rodapé é o fim da página (o endereço da empresa pode aparecer antes, no local da calibração)
      const linha = (re: RegExp) => linhas.findLast((l) => re.test(l)) ?? ''
      expect(linha(/Rua 13, nº 650/), `página ${i + 1}`).toMatch(
        /CEP 13500-120 +Este certificado somente pode ser reproduzido na íntegra\.$/,
      )
      expect(linha(/recepcao@balancass\.com/), `página ${i + 1}`).toMatch(
        /balancass\.com +A reprodução parcial requer autorização prévia, por escrito\.$/,
      )
    }
    const t = corrido(texto)
    expect(t).not.toMatch(/\b5\. /)
    expect(t).toMatch(/7 DECLARAÇÕES 1\. A incerteza expandida .* 4\. Esta calibração não isenta/)
    expect(t.match(/Este certificado somente pode ser reproduzido na íntegra/g)).toHaveLength(folhas(texto).length)
  })

  it('texto longo (o de antes, com a razão social, numa cópia congelada): desce para linhas próprias, e a margem cresce', async () => {
    const d = exemploBancada()
    d.emissao.textos = { ...d.emissao.textos, reproducao: REPRODUCAO_ANTIGA }
    expect(margemBase(d)).toBe(71 + 2 * 9)
    if (!temPdftotext) return
    const texto = textoDoPdf(await gerarCertificadoPdf(d))
    const paginasDoPdf = folhas(texto)
    expect(paginasDoPdf.length).toBeLessThanOrEqual(3)
    for (const folha of paginasDoPdf) {
      const t = corrido(folha)
      expect(t).toContain(
        'balancass.com Este certificado somente pode ser reproduzido na íntegra. A reprodução parcial depende de autorização prévia, por escrito, da FABIO DE GODOY LIMA LTDA.',
      )
      expect(folha.split('\n').find((l) => l.includes('Rua 13'))).not.toContain('Este certificado')
    }
    // Nas declarações, nunca
    expect(corrido(texto)).not.toMatch(/\d\. Este certificado somente/)
  })

  it('sem texto (apagado nas configurações): o rodapé só com a empresa', () => {
    const d = exemploBancada()
    d.emissao.textos = { ...d.emissao.textos, reproducao: '  ' }
    expect(margemBase(d)).toBe(71)
    expect(JSON.stringify(definicaoCertificado(d))).not.toContain('reproduzido')
  })

  it('empresa sem endereço nem contatos: a cláusula de 2 frases não cabe ao lado da razão social e desce', () => {
    const d = exemploBancada()
    d.emissao.empresa = {
      ...d.emissao.empresa,
      endereco: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
      telefone: '',
      email: '',
      site: '',
    }
    expect(margemBase(d)).toBe(71)
    const pe = JSON.stringify((definicaoCertificado(d) as { footer: () => unknown }).footer())
    expect(pe).not.toContain('"columns"')
    expect(pe).toContain('A reprodução parcial requer autorização prévia, por escrito.')
  })
})

describe.runIf(temPdftoppm)('amostras em PNG (revisão visual)', { timeout: 60_000 }, () => {
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

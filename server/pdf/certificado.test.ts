// Testes do certificado em PDF: gera os exemplos realistas (server/pdf/exemplosCertificado.ts),
// grava as amostras em server/pdf/exemplos/ e confere o conteúdo pelo texto extraído com o pdftotext
// (testes opcionais: só rodam se o poppler-utils estiver instalado). Com o pdftoppm, também renderiza
// as páginas em PNG (80 dpi) para a revisão visual. As amostras publicadas seguem as regras da 1.0.3; as dos
// registros de antes do POP (ajuste externo, "como encontrado", reparo, rodoviária) vão para exemplos/legado/.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import {
  calibracaoVazia,
  massaLegivel,
  METODOS_CARREGAMENTO,
  metodoExcentricidadePadrao,
  metodoIndicacaoPadrao,
  multilinha,
  pendenciasEmissao,
  registroAnterior,
  REPRODUCAO_ANTIGA,
  TEXTOS_ANTIGOS,
  TEXTOS_PADRAO,
  TIPOS_FORA_DO_POP,
} from '#shared/dominio.ts'
import { densidadeAr, posicoesExcentricidade } from '#shared/metrologia/index.ts'
import { A4, comImagensNaOrdemInversa, pdfmake } from './base.ts'
import {
  assinantes,
  comSondas,
  descartados,
  DIAGRAMACOES,
  definicaoCertificado,
  gerarCertificadoPdf,
  linhasDoTexto,
  MAX_PAGINAS,
  montarCertificado,
  notaEmpuxoConveccao,
  notaPesosNominais,
  OCUPACAO_MINIMA_ULTIMA,
  RESSALVA_OPINIOES,
  RITMOS,
  textoEmaDoPonto,
} from './certificado.ts'
import {
  exemploBalanca32kg,
  exemploBancada,
  exemploClasseI220g,
  exemploClasseILegado,
  exemploPiorCasoAtual,
  exemploPiorCasoLegado,
  exemploPlataforma300kg,
  exemploPlataformaLegado,
  exemploRodoviariaLegado,
  POP_EXEMPLO,
} from './exemplosCertificado.ts'
import { diagramaExcentricidade, diagramaPosicoes } from './graficos.ts'
import { COR } from './marca.ts'
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

/**
 * Um exemplo, em no máximo 3 páginas, com o desenho das posições e o gráfico: `grafico`, a altura dele na montagem
 * (o pior caso também aperta os respiros, `compacto`). `arquivo`: o caminho da amostra em exemplos/, sem a extensão.
 */
interface Exemplo {
  arquivo: string
  dados: () => DadosCertificadoPdf
  paginas: number
  grafico: number
  compacto?: boolean
}

/** As amostras publicadas (exemplos/): o que o sistema faz hoje (1.0.3), sem pendência nenhuma para emitir. */
const EXEMPLOS: Exemplo[] = [
  // Sem ajuste, com a conformidade (banda de guarda) e a próxima calibração a pedido
  { arquivo: 'certificado-plataforma-300kg', dados: exemploPlataforma300kg, paginas: 3, grafico: 150 },
  { arquivo: 'certificado-bancada-30kg', dados: exemploBancada, paginas: 3, grafico: 150 },
  // O ajuste interno (CAL) antes dos ensaios, sem "como encontrado"
  { arquivo: 'certificado-classe-i-220g', dados: exemploClasseI220g, paginas: 3, grafico: 150 },
  // O caso mais comum: balcão 32 kg × 5 g, com os pontos que o sistema sugere
  { arquivo: 'certificado-balanca-32kg', dados: exemploBalanca32kg, paginas: 3, grafico: 150 },
  // Tudo o que uma calibração de hoje pode ter: o gráfico menor (a correção com o mesmo nº não tem mais o quadro da
  // revisão, e o layout normal cabe)
  { arquivo: 'certificado-pior-caso', dados: exemploPiorCasoAtual, paginas: 3, grafico: 132 },
]

/** Pasta das amostras dos registros de antes do POP (dentro de exemplos/), à parte das de hoje. */
const LEGADO = 'legado'

/**
 * Os registros de antes do POP (1.0.1 e 1.0.2), que continuam abrindo e saindo como saíam: amostras em
 * exemplos/legado/, para não serem tomadas pelo que o sistema faz hoje.
 */
const LEGADOS: Exemplo[] = [
  // Ajuste externo com "como encontrado", reparo e conformidade: o gráfico encolhe um pouco para caber em 3
  {
    arquivo: `${LEGADO}/certificado-plataforma-300kg-ajuste-externo`,
    dados: exemploPlataformaLegado,
    paginas: 3,
    grafico: 116,
  },
  { arquivo: `${LEGADO}/certificado-rodoviaria-80t`, dados: exemploRodoviariaLegado, paginas: 3, grafico: 150 },
  // Tudo junto (substituição, ajuste com "como encontrado", reparo, revisão): o gráfico menor e o layout compacto
  {
    arquivo: `${LEGADO}/certificado-pior-caso-rodoviaria`,
    dados: exemploPiorCasoLegado,
    paginas: 3,
    grafico: 100,
    compacto: true,
  },
  {
    arquivo: `${LEGADO}/certificado-classe-i-220g-como-encontrado`,
    dados: exemploClasseILegado,
    paginas: 3,
    grafico: 150,
  },
]

/** Todos os exemplos (os de hoje e os de antes): o que vale para qualquer certificado. */
const TODOS: Exemplo[] = [...EXEMPLOS, ...LEGADOS]

/** Resultados calculados de novo depois de mudar a calibração de um exemplo. */
function recalculado(d: DadosCertificadoPdf): DadosCertificadoPdf {
  const { resultado, comoEncontrado } = calcularCalibracao(d.calibracao, d.emissao.balanca, d.emissao.padroes)
  return { ...d, resultado, comoEncontrado }
}

/**
 * Variantes comuns que ficavam no limite da página (e davam uma página só com as assinaturas) e o pior caso
 * possível; `paginas` = o esperado, quando é o caso de fixar (as comuns, com o desenho e o gráfico, em 3).
 */
const VARIANTES: Array<{ nome: string; dados: () => DadosCertificadoPdf; paginas?: number }> = [
  {
    nome: 'bancada com declaração de conformidade (balança comercial)',
    paginas: 3,
    dados: () => {
      const d = exemploBancada()
      d.calibracao.conformidade = { solicitada: true, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'SIMPLES' }
      return recalculado(d)
    },
  },
  {
    nome: 'plataforma (legado) com reparo e ajuste externo, sem "como encontrado"',
    paginas: 3,
    dados: () => {
      const d = exemploPlataformaLegado()
      d.calibracao.comoEncontrado = null
      return recalculado(d)
    },
  },
  {
    nome: 'bancada (legado) com conformidade, reparo e ajuste externo',
    paginas: 3,
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
    paginas: 3,
    dados: () => {
      const d = exemploRodoviariaLegado()
      d.calibracao.opinioes = 'Recomenda-se limpar as laterais da plataforma.'
      return d
    },
  },
  // O caso comum: sem revisão, sem ajuste e sem "como encontrado"; uma opinião curta não abre a 3ª página
  {
    nome: 'rodoviária sem revisão + opinião de 1 linha',
    paginas: 3,
    dados: () => {
      const d = rodoviariaSemRevisao()
      d.calibracao.opinioes = 'Recomenda-se limpar as laterais da plataforma.'
      return d
    },
  },
  {
    nome: 'rodoviária sem revisão + opinião e observação de 1 linha',
    paginas: 3,
    dados: () => {
      const d = rodoviariaSemRevisao()
      d.calibracao.opinioes = 'Recomenda-se limpar as laterais da plataforma.'
      d.calibracao.observacoes += '\nPlataforma lavada pelo cliente antes da calibração.'
      return d
    },
  },
  {
    nome: 'bancada + opinião',
    paginas: 3,
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
    paginas: 3,
    dados: () => {
      const d = rodoviariaSemRevisao()
      d.calibracao.opinioes = 'Recomenda-se limpar as laterais da plataforma.'
      d.emissao.textos = { ...d.emissao.textos, ...TEXTOS_ANTIGOS }
      return d
    },
  },
  {
    nome: 'rodoviária sem revisão + opinião de 2 linhas e observação',
    paginas: 3,
    dados: () => {
      const d = rodoviariaSemRevisao()
      d.calibracao.opinioes =
        'Recomenda-se limpar as laterais da plataforma e retirar o acúmulo de terra sob as cabeceiras, que pode encostar na estrutura e causar erros de indicação nas cargas maiores.'
      d.calibracao.observacoes += '\nPlataforma lavada pelo cliente antes da calibração.'
      return d
    },
  },
  {
    nome: 'plataforma (legado) sem reparo, com "como encontrado"',
    paginas: 3,
    dados: () => {
      const d = exemploPlataformaLegado()
      d.calibracao.reparo = { houve: false, descricao: '', marcaReparo: '', selosRetirados: '', selosColocados: '' }
      return d
    },
  },
  // A plataforma de hoje sem a conformidade nem a próxima calibração (o mais comum) e com uma opinião curta
  {
    nome: 'plataforma sem conformidade, com opinião de 1 linha',
    paginas: 3,
    dados: () => {
      const d = exemploPlataforma300kg()
      d.calibracao.conformidade = { ...d.calibracao.conformidade, solicitada: false }
      d.calibracao.proximaNoCertificado = false
      d.calibracao.opinioes = 'A balança está em boas condições de uso; mantenha a plataforma limpa e nivelada.'
      return recalculado(d)
    },
  },
  {
    nome: 'pior caso de hoje com 6 padrões',
    dados: () => {
      const d = exemploPiorCasoAtual()
      const extra = d.emissao.padroes
        .slice(0, 2)
        .map((p, i) => ({ ...p, id: `${p.id}-x${i}`, identificacao: `${p.identificacao}B` }))
      d.emissao.padroes = [...d.emissao.padroes, ...extra]
      return recalculado(d)
    },
  },
  {
    nome: 'pior caso (legado) com 6 padrões, 3 cargas de repetibilidade e 10 posições',
    dados: () => {
      const d = exemploPiorCasoLegado()
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

/** A rodoviária de exemplo (legado) como um certificado comum: original (sem revisão) e sem marca d'água. */
function rodoviariaSemRevisao(): DadosCertificadoPdf {
  const d = exemploRodoviariaLegado()
  d.calibracao = { ...d.calibracao, numero: 'CC-2026-00098', revisao: 0, substituiId: '', motivoRevisao: '' }
  d.emissao = { ...d.emissao, substituiNumero: '', substituiEmissao: '' }
  d.marcaDagua = ''
  return d
}

/** Os nós com `svg` do conteúdo (o desenho das posições e o gráfico), com a largura. */
function nosSvg(no: unknown): Array<{ svg: string; width: number }> {
  if (Array.isArray(no)) return no.flatMap(nosSvg)
  if (!no || typeof no !== 'object') return []
  const o = no as Record<string, unknown>
  if (typeof o.svg === 'string') return [o as { svg: string; width: number }]
  return Object.values(o).flatMap(nosSvg)
}

/** Folhas do texto extraído (as vazias fora). */
const folhas = (texto: string) => texto.split('\f').filter((p) => p.trim())

const gerados = new Map<string, Buffer>()
async function pdfDe(arquivo: string): Promise<Buffer> {
  let pdf = gerados.get(arquivo)
  if (!pdf) {
    pdf = await gerarCertificadoPdf(TODOS.find((e) => e.arquivo === arquivo)!.dados())
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
  // Como a 1ª versão: o desenho das posições e o gráfico do erro de indicação; a verificação preliminar só
  // com algum item "não", numa linha
  expect(t).toContain('Posições vistas de cima')
  expect(t).toContain('Erro de indicação em função da carga')
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
  it.each(TODOS)('gera um PDF válido e grava a amostra: $arquivo', async ({ arquivo }) => {
    const pdf = await pdfDe(arquivo)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(20_000)
    expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF')
    const caminho = join(PASTA_EXEMPLOS, `${arquivo}.pdf`)
    mkdirSync(dirname(caminho), { recursive: true })
    writeFileSync(caminho, pdf)
  })

  it('"crescente e decrescente": pelas regras do POP, sem zerar entre os pontos (as peças se trocam); o registro de antes, como saía', async () => {
    const d = exemploPlataforma300kg()
    expect([d.calibracao.indicacao.metodo, d.emissao.regrasDoPop, d.emissao.carregamentoSemZerar]).toEqual([
      'CRESCENTE_DECRESCENTE',
      true,
      true,
    ])
    const t = corrido(textoDoPdf(await gerarCertificadoPdf(d)))
    expect(t).toContain('Carregamento: cargas crescentes até a maior carga e depois decrescentes, sem zerar entre os pontos.')
    expect(t).not.toContain('sem descarregar')
    // Emitido pela 1.0.3 (com as regras do POP, sem a marca do texto novo): o PDF refeito dos dados congelados sai como
    // o emitido (`pdfEmitido` só devolve o refeito idêntico), com o texto da época
    const { carregamentoSemZerar: _marca, ...emissao103 } = d.emissao
    const de103 = corrido(textoDoPdf(await gerarCertificadoPdf({ ...d, emissao: emissao103 })))
    expect(de103).toContain(
      'Carregamento: cargas crescentes até a maior carga e depois decrescentes, sem descarregar entre os pontos.',
    )
    expect(de103).not.toContain('sem zerar')
    // O registro de antes das regras do POP (sem a marca na emissão): o texto de antes (ver certificadoLegado.test.ts)
    const antes = exemploPlataformaLegado()
    expect([antes.calibracao.indicacao.metodo, antes.emissao.regrasDoPop]).toEqual(['CRESCENTE_DECRESCENTE', undefined])
    expect(corrido(textoDoPdf(await gerarCertificadoPdf(antes)))).toContain(
      'Carregamento: cargas crescentes até a maior carga e depois decrescentes, sem descarregar entre os pontos.',
    )
  })

  it('é determinístico: gerar de novo dá o mesmo arquivo, byte a byte', async () => {
    const a = await gerarCertificadoPdf(exemploBancada())
    const b = await gerarCertificadoPdf(exemploBancada())
    expect(a.equals(b)).toBe(true)
  })

  it('duas assinaturas (PNG com transparência): os bytes não dependem de qual imagem termina de descomprimir antes', async () => {
    // O png-js descomprime cada PNG com zlib.inflate (assíncrono) e o pdfkit só cria a máscara da transparência no
    // retorno: aqui os retornos chegam na ordem dos pedidos e na ordem inversa, como acontece com o servidor ocupado
    const gerar = async (d: () => DadosCertificadoPdf, ordem: 'pedido' | 'inversa') => {
      const inflar = zlib.inflate
      const pedidos: Array<{ responder: (e: Error | null, r: Buffer) => void; resposta?: [Error | null, Buffer] }> = []
      let timer: ReturnType<typeof setTimeout> | undefined
      const entregar = () => {
        if (pedidos.some((p) => !p.resposta)) return
        const lista = pedidos.splice(0)
        for (const p of ordem === 'pedido' ? lista : lista.reverse()) p.responder(...p.resposta!)
      }
      ;(zlib as { inflate: unknown }).inflate = (dados: Buffer, responder: (e: Error | null, r: Buffer) => void) => {
        const p: (typeof pedidos)[number] = { responder }
        pedidos.push(p)
        inflar(dados, (e, r) => {
          p.resposta = [e, r]
          clearTimeout(timer)
          timer = setTimeout(entregar, 5)
        })
      }
      try {
        return await gerarCertificadoPdf(d())
      } finally {
        zlib.inflate = inflar
      }
    }
    const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex')
    for (const d of [exemploPlataforma300kg, exemploPiorCasoLegado]) {
      const dados = d()
      expect([dados.emissao.tecnico.assinatura, dados.emissao.signatario.assinatura].every((a) => a.length > 100)).toBe(true)
      const naOrdem = await gerar(d, 'pedido')
      const invertido = await gerar(d, 'inversa')
      expect(hash(invertido), d.name).toBe(hash(naOrdem))
      // E várias ao mesmo tempo (o servidor gerando outros PDFs): sempre o mesmo arquivo
      const juntos = await Promise.all(Array.from({ length: 4 }, () => gerarCertificadoPdf(d())))
      expect(new Set(juntos.map(hash)), d.name).toEqual(new Set([hash(naOrdem)]))
    }
    // O certificado de antes da 1.0.4 (duas assinaturas) sai igual ao gravado: a amostra é a do HEAD da 1.0.3
    expect(hash(await gerar(exemploPiorCasoLegado, 'inversa'))).toBe(
      'de616d92d9dcf87cb759628295211d6ea7b627d0c65dcb3c8ffa6da5b0477f6d',
    )
  })

  it('a ordem inversa das imagens refaz o PDF da 1.0.3 em que a assinatura do signatário terminou antes', async () => {
    // A 1.0.3 seguia a ordem de chegada: com o PNG do técnico maior (ou os dois de tamanho parecido), a imagem do
    // signatário podia entrar antes. Esse é o arquivo que o HEAD da 1.0.3 grava com a do signatário chegando antes
    const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex')
    const LEGADO_NA_ORDEM = 'de616d92d9dcf87cb759628295211d6ea7b627d0c65dcb3c8ffa6da5b0477f6d'
    const LEGADO_INVERTIDO = 'd7819e3845e70c109d1a8c49d3e437fa79a4c13a86680274911be3d9e75d10ae'
    expect(hash(await comImagensNaOrdemInversa(() => gerarCertificadoPdf(exemploPiorCasoLegado())))).toBe(LEGADO_INVERTIDO)
    // As máscaras (SMask) trocam de nº: a da imagem do signatário (a 2ª pedida) é criada antes
    const mascaras = (pdf: Buffer) =>
      [...pdf.toString('latin1').matchAll(/(\d+) 0 obj\s*<<([^]*?)>>\s*stream/g)]
        .flatMap((m) => {
          const s = /\/SMask (\d+) 0 R/.exec(m[2])
          return s ? [{ imagem: Number(m[1]), mascara: Number(s[1]) }] : []
        })
        .sort((a, b) => a.imagem - b.imagem)
    const [tecnico, signatario] = mascaras(await gerarCertificadoPdf(exemploPiorCasoLegado()))
    expect(tecnico.mascara).toBeLessThan(signatario.mascara)
    expect(mascaras(await comImagensNaOrdemInversa(() => gerarCertificadoPdf(exemploPiorCasoLegado())))).toEqual([
      { imagem: tecnico.imagem, mascara: signatario.mascara },
      { imagem: signatario.imagem, mascara: tecnico.mascara },
    ])
    // Várias gerações ao mesmo tempo, nas duas ordens, não se misturam (cada uma com a própria fila)
    const juntos = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        i % 2
          ? gerarCertificadoPdf(exemploPiorCasoLegado())
          : comImagensNaOrdemInversa(() => gerarCertificadoPdf(exemploPiorCasoLegado())),
      ),
    )
    expect(juntos.map(hash)).toEqual(Array.from({ length: 6 }, (_, i) => (i % 2 ? LEGADO_NA_ORDEM : LEGADO_INVERTIDO)))
  })

  it('usa a data da emissão como data do documento e põe os metadados', () => {
    const d = exemploPlataforma300kg()
    const doc = definicaoCertificado(d) as { info: Record<string, unknown>; language: string }
    expect(doc.info.creationDate).toEqual(new Date(d.emissao.emitidoEm))
    expect(doc.info.title).toBe('Certificado de calibração nº CC-2026-00123')
    expect(doc.info.author).toBe('FABIO DE GODOY LIMA LTDA')
    expect(doc.language).toBe('pt-BR')
  })

  it('instrumento: identificação pelo indicador e a plataforma numa linha à parte', () => {
    /** Textos do quadro do instrumento (rótulo seguido do valor). */
    const textos = (d: DadosCertificadoPdf) => JSON.stringify(definicaoCertificado(d))
    const d = exemploPlataforma300kg()
    const t = textos(d)
    expect(t).toContain('"text":"9091-118832"')
    expect(t).toContain('"text":"PLATAFORMA"')
    expect(t).toContain('Toledo do Brasil 2180 · nº de série 2180-0041273')
    expect(t).not.toContain('"text":"INDICADOR"')

    // Sem plataforma cadastrada, não há a linha
    const semPlataforma = exemploPlataforma300kg()
    semPlataforma.emissao.balanca = { ...d.emissao.balanca, plataformaFabricante: '', plataformaModelo: '', plataformaSerie: '' }
    expect(textos(semPlataforma)).not.toContain('"text":"PLATAFORMA"')

    // Certificado emitido com o cadastro antigo (cópia congelada): sai como foi emitido, com a linha do indicador
    const antigo = exemploPlataforma300kg()
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
    expect(definicaoCertificado(exemploPlataforma300kg())).not.toHaveProperty('watermark')
    const comMarca = definicaoCertificado(exemploRodoviariaLegado()) as { watermark?: { text: string } }
    expect(comMarca.watermark?.text).toBe('PRÉVIA — SEM VALOR')
  })

  it('prévia do rascunho: sem as imagens das assinaturas (só as linhas) e sem "emitido em"', () => {
    const imagens = (d: DadosCertificadoPdf) => JSON.stringify(definicaoCertificado(d)).match(/"image":/g)?.length ?? 0
    const emitido = exemploPlataforma300kg()
    expect(imagens(emitido)).toBe(2)
    const previa: DadosCertificadoPdf = { ...emitido, marcaDagua: 'PRÉVIA — SEM VALOR', previa: true }
    expect(imagens(previa)).toBe(0)
    const json = JSON.stringify(definicaoCertificado(previa))
    expect(json).not.toContain('emitido em')
    expect(json).toContain('Prévia gerada em 14/10/2026, às 10:42 (horário de Brasília), sem valor.')
    // Os nomes e as linhas continuam (quem vai executar e autorizar)
    expect(json).toContain('Carlos Eduardo Lima')
    expect(json).toContain('Fábio de Godoy Lima')
    // A amostra da prévia (rodoviária, legado) também
    expect(imagens(exemploRodoviariaLegado())).toBe(0)
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
    expect(celula(exemploRodoviariaLegado())).toContain('941 hPa')
    expect(celula(exemploPiorCasoAtual())).toContain('944 hPa')
  })

  it('sai com a linha de assinatura quando a imagem não é PNG/JPEG válido', async () => {
    const d = exemploPlataforma300kg()
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

describe('as amostras publicadas seguem as regras da 1.0.3 (o POP); as de antes ficam à parte', () => {
  /** As pendências que bloqueiam a emissão: as do cálculo e as da emissão, como o servidor junta (`pendenciasDa`). */
  function pendencias(d: DadosCertificadoPdf): string[] {
    const k = d.calibracao
    const { balanca: b, padroes } = d.emissao
    return [
      ...d.resultado.pendencias,
      ...(d.comoEncontrado?.pendencias ?? []),
      ...pendenciasEmissao(k, {
        padroes,
        hoje: k.dataEmissao,
        temPesos: padroes.some((p) => p.tipo === 'PESOS'),
        ...(b.classe ? { classe: b.classe } : {}),
        balanca: b,
      }),
    ]
  }

  it.each(EXEMPLOS)(
    '$arquivo: sem ajuste externo, "como encontrado", reparo nem verificação preliminar; os métodos da classe; nada pendente',
    ({ dados }) => {
      const d = dados()
      const k = d.calibracao
      const b = d.emissao.balanca
      expect(registroAnterior(k)).toBeNull()
      expect(k.ajuste.realizado).not.toBe('EXTERNO')
      expect(k.comoEncontrado).toBeNull()
      expect(d.comoEncontrado).toBeNull()
      expect(k.reparo.houve).toBe(false)
      // A verificação preliminar não é registrada (POP 7): a da calibração nova
      expect(k.preliminar).toEqual(calibracaoVazia().preliminar)
      // Os métodos fixos pela classe (POP 7.7 e 7.10)
      expect(k.excentricidade.metodo).toBe(metodoExcentricidadePadrao(b.classe))
      expect(k.indicacao.metodo).toBe(metodoIndicacaoPadrao(b.classe))
      // Nada de rodoviária, ferroviária nem cargas de substituição (POP 2.1)
      expect(TIPOS_FORA_DO_POP).not.toContain(b.tipo)
      expect(b.receptor).not.toBe('RODOVIARIA')
      expect(k.indicacao.substituicao.ativa).toBe(false)
      // Emitida com as regras do POP: os mínimos cumpridos e os erros dentro do EMA em serviço (a balança que não pesa
      // corretamente não recebe certificado), sem nenhuma pendência para emitir
      expect(d.emissao.regrasDoPop).toBe(true)
      expect(pendencias(d)).toEqual([])
    },
  )

  it('nas amostras, o ajuste interno (CAL) antes dos ensaios só na classe I (a rotina dela); nas outras, sem ajuste', () => {
    for (const { arquivo, dados } of EXEMPLOS) {
      const { calibracao: k, emissao } = dados()
      expect(k.ajuste.realizado, arquivo).toBe(emissao.balanca.classe === 'I' ? 'INTERNO' : 'NAO')
    }
  })

  it.each(LEGADOS)(
    '$arquivo: registro de antes do POP (ou balança fora dele), só nos testes e na pasta legado/',
    ({ arquivo, dados }) => {
      const d = dados()
      expect(arquivo.startsWith(`${LEGADO}/`)).toBe(true)
      expect(registroAnterior(d.calibracao) !== null || TIPOS_FORA_DO_POP.includes(d.emissao.balanca.tipo)).toBe(true)
      expect(d.emissao.regrasDoPop).toBeUndefined()
    },
  )

  it('cada amostra num arquivo próprio: as de hoje na pasta das amostras, as de antes em legado/', () => {
    const nomes = TODOS.map((e) => e.arquivo)
    expect(new Set(nomes).size).toBe(nomes.length)
    for (const e of EXEMPLOS) expect(e.arquivo, e.arquivo).not.toContain('/')
  })

  it('a descrição do "Crescente contínuo" não fala de rodoviária (a empresa não calibra rodoviárias)', () => {
    expect(METODOS_CARREGAMENTO.CONTINUO).toEqual({ label: 'Crescente contínuo', descricao: 'Sobe sem descarregar.' })
    for (const m of Object.values(METODOS_CARREGAMENTO)) expect(m.descricao).not.toMatch(/rodovi|ferrovi/i)
  })

  it.runIf(temPdftotext)(
    'o texto das amostras de hoje não fala de rodoviária, substituição, ajuste externo nem reparo',
    async () => {
      for (const e of EXEMPLOS) {
        const t = corrido(textoDoPdf(await pdfDe(e.arquivo)))
        expect(t, e.arquivo).not.toMatch(
          /rodoviári|ferroviári|cargas? de substituição|ajuste externo|como encontrado|Reparo:|reparo\/manutenção|Verificação preliminar|Não conforme/i,
        )
      }
    },
  )
})

describe('empuxo e convecção no método (classe I)', () => {
  /**
   * A classe I de exemplo com outras opções ou outro ambiente, recalculada. Por padrão, a do registro de antes (com o
   * "como encontrado" medido antes do ajuste interno), que ainda abre e sai como saía.
   */
  function classeI(mudar: (d: DadosCertificadoPdf) => void, base = exemploClasseILegado): DadosCertificadoPdf {
    const d = base()
    mudar(d)
    return recalculado(d)
  }
  const nota = (d: DadosCertificadoPdf) => notaEmpuxoConveccao({ d, k: d.calibracao, e: d.emissao })

  it('as amostras das outras classes (sem as opções da classe I): nada, e o método de sempre', () => {
    const outras = TODOS.map((e) => e.dados).filter((f) => f().emissao.balanca.classe !== 'I')
    expect(outras).toHaveLength(TODOS.length - 2)
    for (const f of outras) {
      const d = f()
      expect(nota(d), d.calibracao.numero).toBeNull()
      // Os campos novos ausentes ou desligados dão o mesmo documento (as amostras ficam iguais, byte a byte)
      const desligado = f()
      desligado.calibracao.opcoes = { ...desligado.calibracao.opcoes, conveccao: 'NAO_CONSIDERAR' }
      desligado.calibracao.ambiente = { ...desligado.calibracao.ambiente, deltaTPesos: null, aclimatacao: null }
      expect(JSON.stringify(definicaoCertificado(desligado))).toBe(JSON.stringify(definicaoCertificado(d)))
      expect(JSON.stringify(definicaoCertificado(d))).not.toMatch(/Empuxo do ar|Convecção dos pesos/)
    }
  })

  it('a amostra da classe I segue o plano do sistema (160 g = 100 g + 50 g + 10 g): sem "Classe dos pesos insuficiente"', () => {
    const d = exemploClasseI220g()
    expect(d.calibracao.indicacao.pontos.map((p) => p.carga)).toEqual([0, 0.01, 50, 60, 110, 160, 200, 220])
    // Ajuste interno (CAL) antes dos ensaios, sem "como encontrado": só os resultados de depois do ajuste
    expect(d.calibracao.ajuste.realizado).toBe('INTERNO')
    expect(d.calibracao.comoEncontrado).toBeNull()
    const r = calcularCalibracao(d.calibracao, d.emissao.balanca, d.emissao.padroes)
    expect(r.comoEncontrado).toBeNull()
    expect(r.resultado.avisos.map((a) => a.mensagem).join('\n')).not.toMatch(/Classe dos pesos insuficiente/)
    // O registro de antes: o "como encontrado" com os mesmos pesos
    const legado = exemploClasseILegado()
    expect(legado.calibracao.indicacao.pontos.map((p) => p.carga)).toEqual([0, 0.01, 50, 60, 110, 160, 200, 220])
    expect(legado.calibracao.comoEncontrado!.pontos.map((p) => p.carga)).toEqual([0, 50, 110, 160, 220])
    const rl = calcularCalibracao(legado.calibracao, legado.emissao.balanca, legado.emissao.padroes)
    expect(rl.comoEncontrado).not.toBeNull()
    const avisos = [...rl.resultado.avisos, ...rl.comoEncontrado!.avisos].map((a) => a.mensagem)
    expect(avisos.join('\n')).not.toMatch(/Classe dos pesos insuficiente/)
  })

  it('classe I de hoje (ajuste interno (CAL) antes dos ensaios): o ar e os pesos e a diferença pesos − ar, sem a variação do local', () => {
    const t = nota(exemploClasseI220g())!
    expect(t).toMatch(
      /^Empuxo do ar corrigido com a densidade do ar de 1,1\d\d kg\/m³, calculada pela temperatura, umidade e pressão medidas, e a densidade dos pesos de 7950 kg\/m³ \(EURAMET cg-18, 7\.1\.2-4 e A1\.1-1\)\. Convecção dos pesos incluída na incerteza, com a diferença de temperatura pesos − ar medida de 0,3 °C \(cg-18, 7\.1\.2\.4 e Tabela F2\.1\)\.$/,
    )
    // Ajustada logo antes dos ensaios e sem "como encontrado": a variação do local de uso não entra
    expect(t).not.toContain('variação de temperatura')
    expect(t).not.toContain('como encontrado')
  })

  it('classe I (legado): o ar e os pesos, a variação do local no "como encontrado" e a diferença pesos − ar', () => {
    const t = nota(exemploClasseILegado())!
    expect(t).toMatch(
      /^Empuxo do ar corrigido com a densidade do ar de 1,1\d\d kg\/m³, calculada pela temperatura, umidade e pressão medidas, e a densidade dos pesos de 7950 kg\/m³ \(EURAMET cg-18, 7\.1\.2-4 e A1\.1-1\)\. /,
    )
    expect(t).toContain(' No “como encontrado”, a incerteza da densidade do ar considera uma variação de temperatura de 10 K')
    expect(t).toMatch(
      / Convecção dos pesos incluída na incerteza, com a diferença de temperatura pesos − ar medida de 0,3 °C \(cg-18, 7\.1\.2\.4 e Tabela F2\.1\)\.$/,
    )
    // No PDF, na célula do método, embaixo do POP, em letra menor (7 pt, a menor do certificado)
    const achados: unknown[] = []
    const visitar = (no: unknown): void => {
      if (Array.isArray(no)) return no.forEach(visitar)
      if (!no || typeof no !== 'object') return
      if ((no as { text?: unknown }).text === `\n${t}`) achados.push(no)
      Object.values(no).forEach(visitar)
    }
    visitar((definicaoCertificado(exemploClasseILegado()) as { content: unknown }).content)
    expect(achados).toEqual([{ text: `\n${t}`, fontSize: 7, color: COR.textoSecundario }])
  })

  it('sem ajuste: a variação do local vale para os resultados (com a do ensaio, se informada); com ajuste e sem "como encontrado", não sai', () => {
    const semAjuste = classeI((d) => {
      d.calibracao.ajuste = { realizado: 'NAO', descricao: '' }
      d.calibracao.comoEncontrado = null
      d.calibracao.opcoes = { ...d.calibracao.opcoes, deltaTLocal: 5 }
    })
    expect(nota(semAjuste)).toContain(
      ' A incerteza da densidade do ar considera uma variação de temperatura de 5 K no local de uso (cg-18, A3-2).',
    )
    const soDepois = classeI((d) => {
      d.calibracao.comoEncontrado = null
    })
    expect(nota(soDepois)).not.toContain('variação de temperatura')
    expect(nota(soDepois)).toContain('Empuxo do ar corrigido')
  })

  it('"ajustada logo antes" no ensaio final: o "como encontrado" vai pela densidade do ar medida, e a nota diz', () => {
    const aj = classeI((d) => {
      d.calibracao.opcoes = { ...d.calibracao.opcoes, empuxo: 'AJUSTADO' }
    })
    expect(aj.comoEncontrado!.pontos.some((p) => (p.crescente?.correcaoEmpuxo ?? 0) !== 0)).toBe(true)
    expect(aj.resultado.pontos.every((p) => (p.crescente?.correcaoEmpuxo ?? 0) === 0)).toBe(true)
    const t = nota(aj)!
    expect(t).toMatch(
      /^No “como encontrado”, empuxo do ar corrigido com a densidade do ar de 1,1\d\d kg\/m³, calculada pela temperatura, umidade e pressão medidas, e a densidade dos pesos de 7950 kg\/m³; a incerteza dela considera uma variação de temperatura de 10 K no local de uso \(EURAMET cg-18, 7\.1\.2-4, A1\.1-1 e A3-2\)\. /,
    )
    expect(t.match(/Empuxo do ar corrigido|empuxo do ar corrigido/g)).toHaveLength(1)
    // Sem o "como encontrado" impresso, nada sobre o empuxo
    const semAntes = classeI((d) => {
      d.calibracao.opcoes = { ...d.calibracao.opcoes, empuxo: 'AJUSTADO' }
      d.calibracao.comoEncontrado = null
    })
    expect(nota(semAntes)).not.toMatch(/empuxo/i)
  })

  /** O "Carga: …" da legenda embaixo dos resultados. */
  function legendaCarga(d: DadosCertificadoPdf): string {
    const achados: string[] = []
    const visitar = (no: unknown): void => {
      if (Array.isArray(no)) return no.forEach(visitar)
      if (!no || typeof no !== 'object') return
      const { text, style } = no as { text?: unknown; style?: unknown }
      if (style === 'nota' && typeof text === 'string' && text.startsWith('Carga: ')) achados.push(text)
      Object.values(no).forEach(visitar)
    }
    visitar((definicaoCertificado(d) as { content: unknown }).content)
    expect(achados).toHaveLength(1)
    return achados[0].slice(0, achados[0].indexOf('.') + 1)
  }

  it('legenda: com a densidade do ar medida, a carga já vem corrigida do empuxo do ar (e diz)', () => {
    expect(legendaCarga(exemploClasseI220g())).toBe('Carga: valor convencional dos pesos padrão, corrigido do empuxo do ar.')
    expect(legendaCarga(exemploClasseILegado())).toBe('Carga: valor convencional dos pesos padrão, corrigido do empuxo do ar.')
    // "Ajustada logo antes": só o "como encontrado" vai pela densidade do ar medida
    const aj = classeI((d) => {
      d.calibracao.opcoes = { ...d.calibracao.opcoes, empuxo: 'AJUSTADO' }
    })
    expect(legendaCarga(aj)).toBe('Carga: valor convencional dos pesos padrão; no “como encontrado”, corrigido do empuxo do ar.')
    const ajSemAntes = classeI((d) => {
      d.calibracao.opcoes = { ...d.calibracao.opcoes, empuxo: 'AJUSTADO' }
      d.calibracao.comoEncontrado = null
    })
    expect(legendaCarga(ajSemAntes)).toBe('Carga: valor convencional dos pesos padrão.')
    // Sem o ar registrado (rascunho com pendência), o cálculo não corrige: a legenda de sempre
    const semAr = classeI((d) => {
      d.calibracao.ambiente = { ...d.calibracao.ambiente, pressao: null }
    })
    expect(legendaCarga(semAr)).toBe('Carga: valor convencional dos pesos padrão.')
  })

  it('legenda: as outras classes como sempre (com a substituição, quando houver)', () => {
    expect(legendaCarga(exemploPlataforma300kg())).toBe('Carga: valor convencional dos pesos padrão.')
    expect(legendaCarga(exemploBancada())).toBe('Carga: valor convencional dos pesos padrão.')
    expect(legendaCarga(exemploPiorCasoAtual())).toBe('Carga: valor convencional dos pesos padrão.')
    expect(legendaCarga(exemploRodoviariaLegado())).toBe(
      'Carga: valor convencional dos pesos padrão, somado às cargas de substituição.',
    )
  })

  it('jogos com densidades diferentes nas cargas: "a densidade de cada jogo de pesos"; o jogo que não entrou, não conta', () => {
    const d = exemploClasseI220g()
    const jogo = d.emissao.padroes[0]
    const outro = { ...jogo, id: 'pad-je2-b', identificacao: 'JE2-02', densidade: 8000 }
    d.emissao.padroes = [...d.emissao.padroes, outro]
    // Só escolhido nos padrões, sem peça nas cargas: a densidade dos pesos usados
    expect(nota(d)).toContain(
      'calculada pela temperatura, umidade e pressão medidas, e a densidade dos pesos de 7950 kg/m³ (EURAMET',
    )
    const ponto = d.calibracao.indicacao.pontos.find((p) => p.pecas.length)!
    ponto.pecas = ponto.pecas.map((x) => ({ ...x, padraoId: outro.id }))
    expect(nota(d)).toContain(
      'kg/m³, calculada pela temperatura, umidade e pressão medidas, e a densidade de cada jogo de pesos (EURAMET',
    )
  })

  it('jogo sem a densidade (ou u(ρ)) ou com ela implausível: a nota não cita a densidade dos pesos (a emissão fica bloqueada)', () => {
    for (const mudar of [{ densidade: 0 }, { incertezaDensidade: 0 }, { densidade: 7.95 }]) {
      const d = exemploClasseI220g()
      d.emissao.padroes = d.emissao.padroes.map((p) => (p.tipo === 'PESOS' ? { ...p, ...mudar } : p))
      const t = nota(d)!
      expect(t, JSON.stringify(mudar)).toMatch(
        /^Empuxo do ar corrigido com a densidade do ar de 1,1\d\d kg\/m³, calculada pela temperatura, umidade e pressão medidas \(EURAMET cg-18, 7\.1\.2-4 e A1\.1-1\)\. /,
      )
      expect(t).not.toMatch(/densidade dos pesos|cada jogo/)
    }
    // No "como encontrado" da "ajustada logo antes", também
    const aj = classeI((d) => {
      d.calibracao.opcoes = { ...d.calibracao.opcoes, empuxo: 'AJUSTADO' }
      d.emissao.padroes = d.emissao.padroes.map((p) => (p.tipo === 'PESOS' ? { ...p, densidade: 0, incertezaDensidade: 0 } : p))
    })
    expect(nota(aj)).toMatch(
      /^No “como encontrado”, empuxo do ar corrigido com a densidade do ar de 1,1\d\d kg\/m³, calculada pela temperatura, umidade e pressão medidas; a incerteza dela/,
    )
    expect(aj.comoEncontrado!.pendencias).toEqual([
      'Empuxo pela densidade do ar medida: o jogo JE2-01 está sem a densidade ou a incerteza da densidade (cadastro do padrão).',
    ])
  })

  it('convecção: 0,0 °C medido (a coluna de 1 K, decisão conservadora) e pela aclimatação', () => {
    const zero = classeI((d) => {
      d.calibracao.ambiente = { ...d.calibracao.ambiente, deltaTPesos: 0 }
    })
    expect(nota(zero)).toContain('com a diferença de temperatura pesos − ar medida de 0,0 °C (cg-18, 7.1.2.4 e Tabela F2.1).')
    // O sinal não importa (pesos mais frios que o ar)
    const negativo = classeI((d) => {
      d.calibracao.ambiente = { ...d.calibracao.ambiente, deltaTPesos: -0.8 }
    })
    expect(nota(negativo)).toContain('medida de 0,8 °C')
    const aclimatacao = classeI((d) => {
      d.calibracao.ambiente = { ...d.calibracao.ambiente, deltaTPesos: null, aclimatacao: { deltaT0: -5, minutos: 90 } }
    })
    expect(nota(aclimatacao)).toContain(
      'Convecção dos pesos incluída na incerteza, com a diferença de temperatura estimada pela aclimatação de 90 min a partir de 5,0 °C (cg-18, Tabelas F1.3 e F2.1).',
    )
    // Sem nenhum dos dois (rascunho com pendência), a frase da convecção não sai
    const semDado = classeI((d) => {
      d.calibracao.ambiente = { ...d.calibracao.ambiente, deltaTPesos: null, aclimatacao: null }
    })
    expect(nota(semDado)).not.toContain('Convecção')
  })

  it('só o que a calibração usou: empuxo de outra opção, convecção desligada, ar sem medição', () => {
    const ajustado = classeI((d) => {
      d.calibracao.opcoes = { ...d.calibracao.opcoes, empuxo: 'AJUSTADO' }
    })
    expect(nota(ajustado)).not.toContain('Empuxo')
    expect(nota(ajustado)).toContain('Convecção dos pesos')
    const semConveccao = classeI((d) => {
      d.calibracao.opcoes = { ...d.calibracao.opcoes, conveccao: 'NAO_CONSIDERAR' }
    })
    expect(nota(semConveccao)).not.toContain('Convecção')
    // Sem a pressão, não há densidade do ar calculada (o rascunho fica com a pendência): nada do empuxo
    const semPressao = classeI((d) => {
      d.calibracao.ambiente = { ...d.calibracao.ambiente, pressao: null }
    })
    expect(semPressao.resultado.ar ?? null).toBeNull()
    expect(nota(semPressao)).not.toContain('Empuxo')
    // Tudo desligado: null, e o método como nas outras classes
    const nada = classeI((d) => {
      d.calibracao.opcoes = { ...d.calibracao.opcoes, empuxo: 'NAO_AJUSTADO', conveccao: 'NAO_CONSIDERAR' }
    })
    expect(nota(nada)).toBeNull()
  })
})

describe.runIf(temPdftotext)('conteúdo do certificado (pdftotext)', { timeout: 60_000 }, () => {
  it('plataforma 300 kg: sem ajuste, sem reparo, conformidade (banda de guarda) e próxima calibração a pedido', async () => {
    const d = exemploPlataforma300kg()
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
    // A calibração não inclui ajuste nem reparo (POP 7.8): os resultados são os da balança como foi encontrada
    expect(t).toContain(
      'Ajuste: não foi realizado ajuste no instrumento; os resultados referem-se ao instrumento na condição em que foi encontrado.',
    )
    expect(t).not.toMatch(/como encontrado|como deixado|antes do ajuste|após o ajuste/)
    expect(t).not.toContain('Reparo:')
    expect(t).not.toContain('marca de reparo')
    // Resultados: uma tabela só do erro de indicação (5.3), sem a 5.4
    expect(t).toContain('Repetibilidade')
    expect(t).toContain('Excentricidade')
    expect(t).toMatch(/\|ΔI\|máx = 0,05 kg/)
    expect(t).toContain('ΔI: indicação na posição − indicação na posição 1.')
    expect(t).toContain('Retorno ao zero')
    expect(t).toMatch(/5\.3 Erro de indicação/)
    expect(t).not.toMatch(/5\.4 /)
    expect(t).not.toContain('Não conforme')
    // Declaração de conformidade
    expect(t).toContain('DECLARAÇÃO DE CONFORMIDADE')
    expect(t).toContain('Portaria Inmetro 157/2022 — em serviço')
    expect(t).toContain('Banda de guarda')
    expect(t).toContain('Esta declaração não constitui verificação metrológica legal')
    expect(t).toMatch(/CONFORME Resultado: conforme em todos os pontos calibrados\./)
    // O gráfico do erro de indicação (sem "como deixado"), com os limites ±EMA da conformidade
    expect(t).toContain('Erro de indicação em função da carga. Barras: incerteza expandida U; tracejado: limites ±EMA.')
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

  it('plataforma 300 kg (legado): ajuste externo, como encontrado, reparo, conformidade e próxima calibração a pedido', async () => {
    const d = exemploPlataformaLegado()
    const texto = textoDoPdf(await pdfDe(`${LEGADO}/certificado-plataforma-300kg-ajuste-externo`))
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
    expect(t).toContain('Resultados antes do ajuste em 5.4 (“como encontrado”) e depois dele em 5.3 (“como deixado”).')
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
    // Método 1: o desvio é a indicação menos a da posição 1
    expect(t).toContain('ΔI: indicação na posição − indicação na posição 1.')
    expect(t).toContain('Retorno ao zero')
    expect(t).toContain('Não conforme') // como encontrado, antes do ajuste
    // Declaração de conformidade
    expect(t).toContain('DECLARAÇÃO DE CONFORMIDADE')
    expect(t).toContain('Portaria Inmetro 157/2022 — em serviço')
    expect(t).toContain('Banda de guarda')
    expect(t).toContain('Esta declaração não constitui verificação metrológica legal')
    // O resultado numa caixa, com o selo
    expect(t).toMatch(/CONFORME Resultado: conforme em todos os pontos calibrados\./)
    // O gráfico do "como deixado", com os limites ±EMA da conformidade
    expect(t).toContain(
      'Erro de indicação em função da carga — como deixado. Barras: incerteza expandida U; tracejado: limites ±EMA.',
    )
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
    // Revisão por outra pessoa desligada: só quem executou assina (aqui, ele mesmo emitiu)
    expect(t).toContain('EXECUTADO POR')
    expect(t).not.toContain('AUTORIZADO POR')
    // As seções da 1ª versão, numeradas sem buracos (sem conformidade): 6 Observações, 7 Opiniões, 8 Declarações
    expect(t).toMatch(/1 DADOS DA CALIBRAÇÃO/)
    expect(t).toMatch(/2 CLIENTE/)
    expect(t).toMatch(/3 INSTRUMENTO CALIBRADO/)
    expect(t).toContain('CARACTERÍSTICAS METROLÓGICAS, CONFORME A MARCAÇÃO DO INSTRUMENTO')
    expect(t).toMatch(/4 PADRÕES UTILIZADOS/)
    expect(t).toMatch(/5 RESULTADOS/)
    expect(t).toMatch(/6 OBSERVAÇÕES/)
    expect(t).toMatch(/7 OPINIÕES E INTERPRETAÇÕES/)
    expect(t).toMatch(/8 DECLARAÇÕES/)
    // Histerese pela média: o gráfico com a média das indicações, sem os limites (sem conformidade)
    expect(t).toContain('Erro de indicação em função da carga (média das indicações ↑ e ↓). Barras: incerteza expandida U.')
    // Sem item "não" na verificação preliminar, nada dela no certificado
    expect(t).not.toContain('Verificação preliminar')
  })

  it('a rastreabilidade ("padrões abaixo") sai logo abaixo do título dos padrões, antes da tabela', async () => {
    for (const e of TODOS) {
      const t = corrido(textoDoPdf(await pdfDe(e.arquivo)))
      const titulo = t.indexOf('4 PADRÕES UTILIZADOS')
      const frase = t.indexOf('por meio dos padrões abaixo')
      const tabela = t.indexOf('Identificação Descrição', titulo)
      expect(titulo, e.arquivo).toBeGreaterThan(0)
      expect(frase, e.arquivo).toBeGreaterThan(titulo)
      expect(tabela, e.arquivo).toBeGreaterThan(frase)
      expect(t.indexOf('5 RESULTADOS'), e.arquivo).toBeGreaterThan(tabela)
    }
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
    expect(paginas(texto).total).toBeLessThanOrEqual(3)
  })

  it('analítica classe I 220 g: ajuste interno (CAL) antes dos ensaios, sem "como encontrado"; empuxo e convecção no método', async () => {
    const d = exemploClasseI220g()
    const texto = textoDoPdf(await pdfDe('certificado-classe-i-220g'))
    conferirComum(texto, d)
    const t = corrido(texto)
    expect(t).toContain('LABORATÓRIO FARMACÊUTICO HORTO FLORESTAL LTDA')
    expect(t).toContain('Balança analítica')
    expect(t).toContain('I (especial)')
    expect(t).toMatch(/220 g +0,01 g +0,1 mg +1 mg/)
    // Pressão com o barômetro; o jogo E2 e o termômetro de 2 entradas entre os padrões
    expect(t).toMatch(/PRESSÃO ATMOSFÉRICA .*942 hPa/)
    for (const x of ['JE2-01', 'E2', 'M-0412/2026', 'TD-01', 'Termômetro digital de duas entradas']) expect(t).toContain(x)
    // O ajuste interno (CAL) de rotina, feito pelo cliente antes dos ensaios: os resultados são os de depois dele, sem
    // "como encontrado" (nem a tabela 5.4)
    expect(t).toContain(
      'Ajuste: antes da calibração foi realizado ajuste interno (automático) (função CAL feita pelo cliente). Os resultados referem-se ao instrumento após o ajuste (“como deixado”). O ajuste não faz parte da calibração.',
    )
    expect(t).not.toMatch(/como encontrado|antes do ajuste|Resultados antes/)
    expect(t).not.toMatch(/5\.4 /)
    expect(t).not.toContain('Reparo:')
    // O método: o empuxo pela densidade do ar medida e a convecção, sem a variação do local de uso (ajustada logo antes)
    const rho = d.resultado.ar!.densidade
    expect(rho).toBeCloseTo(densidadeAr((22.4 + 22.9) / 2, (54 + 55) / 2, 942), 9)
    const metodo = t.slice(t.indexOf('MÉTODO — PROCEDIMENTO (POP)'), t.indexOf('2 CLIENTE'))
    expect(metodo).toContain(
      `Empuxo do ar corrigido com a densidade do ar de ${rho.toFixed(3).replace('.', ',')} kg/m³, calculada pela temperatura, umidade e pressão medidas, e a densidade dos pesos de 7950 kg/m³ (EURAMET cg-18, 7.1.2-4 e A1.1-1).`,
    )
    expect(metodo).toContain(
      'Convecção dos pesos incluída na incerteza, com a diferença de temperatura pesos − ar medida de 0,3 °C (cg-18, 7.1.2.4 e Tabela F2.1).',
    )
    expect(metodo).not.toContain('variação de temperatura')
    expect(t.match(/Empuxo do ar corrigido/g)).toHaveLength(1)
    expect(t).toMatch(/TEMPERATURA \(INÍCIO → FIM\) .*22,4 °C → 22,9 °C/)
    // 10 leituras na repetibilidade; excentricidade pelo método 3 (zero antes de cada posição)
    expect(t).toMatch(/200,0000 .* 10 200,000300 0,000067/)
    expect(t).toContain('Zero lido')
    expect(t).toMatch(/2 Frente \(0°\) 0,0000 100,0003 \+0,0002/)
    expect(t).toContain('ΔI: (indicação − zero lido) na posição − o mesmo na posição 1.')
    expect(d.resultado.excentricidade.desvios[2]).toBe(0)
    // O gráfico do erro de indicação, sem "como deixado"
    expect(t).toContain('Erro de indicação em função da carga. Barras: incerteza expandida U.')
    expect(paginas(texto).total).toBe(3)
  })

  it('analítica classe I 220 g (legado): "como encontrado" antes do ajuste interno, empuxo e convecção no método', async () => {
    const d = exemploClasseILegado()
    const texto = textoDoPdf(await pdfDe(`${LEGADO}/certificado-classe-i-220g-como-encontrado`))
    conferirComum(texto, d)
    const t = corrido(texto)
    expect(t).toContain('LABORATÓRIO FARMACÊUTICO HORTO FLORESTAL LTDA')
    expect(t).toContain('Balança analítica')
    expect(t).toContain('I (especial)')
    expect(t).toMatch(/220 g +0,01 g +0,1 mg +1 mg/)
    // Pressão com o barômetro; o jogo E2 e o termômetro de 2 entradas entre os padrões
    expect(t).toMatch(/PRESSÃO ATMOSFÉRICA .*942 hPa/)
    for (const x of ['JE2-01', 'E2', 'M-0412/2026', 'TD-01', 'Termômetro digital de duas entradas']) expect(t).toContain(x)
    // Ajuste interno logo depois do "como encontrado"
    expect(t).toContain('antes da calibração foi realizado ajuste interno (automático). Resultados antes do ajuste em 5.4')
    expect(t).toContain('como encontrado (antes do ajuste)')
    // A densidade do ar é a do cálculo (A1.1-1, com as médias do início e do fim e a pressão)
    const rho = d.resultado.ar!.densidade
    expect(rho).toBeCloseTo(densidadeAr((22.4 + 22.9) / 2, (54 + 55) / 2, 942), 9)
    const metodo = t.slice(t.indexOf('MÉTODO — PROCEDIMENTO (POP)'), t.indexOf('2 CLIENTE'))
    expect(metodo).toContain(
      `Empuxo do ar corrigido com a densidade do ar de ${rho.toFixed(3).replace('.', ',')} kg/m³, calculada pela temperatura, umidade e pressão medidas, e a densidade dos pesos de 7950 kg/m³ (EURAMET cg-18, 7.1.2-4 e A1.1-1).`,
    )
    expect(metodo).toContain(
      'No “como encontrado”, a incerteza da densidade do ar considera uma variação de temperatura de 10 K no local de uso (cg-18, A3-2).',
    )
    expect(metodo).toContain(
      'Convecção dos pesos incluída na incerteza, com a diferença de temperatura pesos − ar medida de 0,3 °C (cg-18, 7.1.2.4 e Tabela F2.1).',
    )
    // Uma vez só (nada nas observações) e as condições ambientais como sempre
    expect(t.match(/Empuxo do ar corrigido/g)).toHaveLength(1)
    expect(t).toMatch(/TEMPERATURA \(INÍCIO → FIM\) .*22,4 °C → 22,9 °C/)
    // 10 leituras na repetibilidade; excentricidade pelo método 3 (zero antes de cada posição)
    expect(t).toMatch(/200,0000 .* 10 200,000300 0,000067/)
    expect(t).toContain('Zero lido')
    expect(t).toMatch(/2 Frente \(0°\) 0,0000 100,0003 \+0,0002/)
    // A legenda do ΔI é a do método 3: o desvio desconta o zero lido antes de cada posição (posição 3: zero 0,0001,
    // indicação 100,0002 → 100,0001 − 100,0001 = 0,0000, como impresso)
    expect(t).toContain('ΔI: (indicação − zero lido) na posição − o mesmo na posição 1.')
    expect(t).not.toContain('ΔI: indicação na posição − indicação na posição 1.')
    expect(d.resultado.excentricidade.desvios[2]).toBe(0)
    expect(paginas(texto).total).toBe(3)
  })

  it('rodoviária 80 t (legado): revisão, prévia, cargas de substituição e faixa parcial', async () => {
    const d = exemploRodoviariaLegado()
    const texto = textoDoPdf(await pdfDe(`${LEGADO}/certificado-rodoviaria-80t`))
    conferirComum(texto, d)
    const t = corrido(texto)
    // P-14a (revisão)
    // (as letras da marca d'água podem cair no meio da frase, no texto extraído)
    expect(t).toContain(
      'Revisão: este certificado substitui integralmente o Certificado nº CC-2026-00098, emitido em 30/09/2026, que fica cancelado.',
    )
    expect(t).toContain('Motivo: correção do número de série do indicador')
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

describe.runIf(temPdftotext)('visual da 1ª versão em no máximo 3 páginas', { timeout: 60_000 }, () => {
  it.each(TODOS)(
    '$arquivo: $paginas páginas, com o desenho das posições e o gráfico ($grafico pt)',
    async ({ arquivo, dados, paginas: esperado, grafico, compacto }) => {
      const texto = textoDoPdf(await pdfDe(arquivo))
      expect(paginas(texto).total).toBe(esperado)
      expect(esperado).toBeLessThanOrEqual(MAX_PAGINAS)
      const m = await montarCertificado(dados())
      expect(m.paginas).toBe(esperado)
      expect(m.diagramacao).toEqual({ ritmo: compacto ? 'compacto' : 'normal', grafico })
      const t = corrido(texto)
      expect(t).toContain('Posições vistas de cima')
      expect(t).toContain('Erro de indicação em função da carga')
    },
  )

  it('pior caso de hoje: multi-intervalo, correção, conformidade, próxima calibração, 4 padrões e textos longos em 3 páginas', async () => {
    const d = exemploPiorCasoAtual()
    const texto = textoDoPdf(await pdfDe('certificado-pior-caso'))
    conferirComum(texto, d)
    expect(paginas(texto).total).toBe(3)
    const t = corrido(texto)
    // Características metrológicas do multi-intervalo numa linha só da grade (sem tabela de faixas)
    expect(t).toMatch(/CAPACIDADE \(MAX\) · MULTI-INTERVALO .*60 \/ 150 \/ 300 kg/)
    expect(t).toContain('20 / 50 / 100 g')
    expect(t).toContain('Balança de piso')
    expect(t).toContain('Alfa Instrumentos PL-1515 Inox · nº de série PL1515-2024-0093')
    // Os textos longos inteiros: a razão social, o local, as observações e a opinião
    // (a razão social quebra a linha ao lado do CNPJ, que o pdftotext põe no meio dela)
    expect(t).toMatch(/COOPERATIVA AGROINDUSTRIAL DOS PRODUTORES RURAIS DO VALE DO CORUMBATAÍ E (33\.592\.510\/0001-54 )?REGIÃO/)
    // (o pdftotext separa "Rio Claro/" e "SP" quando a linha quebra na barra)
    expect(t.replace(/\/ (?=\S)/g, '/')).toContain(corrido(d.calibracao.localEndereco))
    // A correção (1.0.4) sai com o mesmo nº, como um certificado comum: sem "-R", sem o quadro da revisão e sem o
    // motivo (que fica só no sistema)
    expect(d.emissao.mesmoNumero).toBe(true)
    expect(d.calibracao.numero).toBe('CC-2026-00151')
    expect(t).not.toMatch(/-R\d|Revisão:|substitui integralmente|Motivo:/)
    expect(t).not.toContain(d.calibracao.motivoRevisao.slice(0, 40))
    // As duas assinaturas (revisão por outra pessoa ligada na emissão)
    expect(t).toMatch(/EXECUTADO POR .*AUTORIZADO POR/)
    for (const l of linhasDoTexto(d.calibracao.observacoes)) expect(t).toContain(l)
    expect(t).toContain(d.calibracao.opinioes)
    expect(t).toContain('OPINIÕES E INTERPRETAÇÕES')
    // Sem ajuste, "como encontrado", reparo, verificação preliminar nem cargas de substituição
    expect(t).toContain('Ajuste: não foi realizado ajuste no instrumento')
    expect(t).not.toMatch(/como encontrado|como deixado|Reparo:|Verificação preliminar|substituição/)
    // As 3 repetibilidades (uma por intervalo) e os 10 pontos, subindo e descendo, com o EMA de cada intervalo
    expect(t).toMatch(/48,00 48,00 48,02 48,00 48,00 48,02 5 /)
    expect(t).toMatch(/120,00 120,00 120,00 120,05 120,00 120,00 5 /)
    expect(t).toMatch(/250,0 250,0 250,1 250,0 250,0 250,0 5 /)
    expect(d.resultado.pontos).toHaveLength(10)
    expect(t).toMatch(/0,400 0,40 0,000 0,40 0,000 /)
    expect(t).toMatch(/300,00 300,1 \+0,10 300,1 \+0,10 /)
    // Cada ponto com o EMA em serviço do intervalo dele (e = 20, 50 e 100 g)
    expect(d.resultado.pontos.map((p) => [p.carga, p.texto.ema])).toEqual([
      [0, '0,04'],
      [0.4, '0,04'],
      [10, '0,04'],
      [40, '0,08'],
      [75, '0,2'],
      [100, '0,2'],
      [150, '0,2'],
      [200, '0,4'],
      [225, '0,4'],
      [300, '0,4'],
    ])
    // Conformidade (aceitação simples) e a próxima calibração a pedido
    expect(t).toContain('DECLARAÇÃO DE CONFORMIDADE')
    expect(t).toContain('Aceitação simples')
    expect(t).toMatch(/CONFORME Resultado: conforme em todos os pontos calibrados\./)
    expect(t).toContain('Data da próxima calibração informada a pedido do cliente: 29/10/2027')
    // Uma legenda só para todas as tabelas dos resultados
    expect(t.match(/Erro = indicação − carga/g)).toHaveLength(1)
    // As 4 linhas dos padrões, com o certificado, o laboratório, a acreditação e a próxima calibração
    for (const x of ['PP20-01 a 15', 'JP-01', 'TH-01', 'BR-01', 'CAL-12345/2026', 'Acreditação Cgcre CAL 0383', '02/12/2026'])
      expect(t).toContain(x)
    expect(t).toMatch(/PRESSÃO ATMOSFÉRICA .*944 hPa/)
  })

  it('pior caso (legado): multi-intervalo, substituição, ajuste com "como encontrado", reparo, revisão e conformidade em 3 páginas', async () => {
    const d = exemploPiorCasoLegado()
    const texto = textoDoPdf(await pdfDe(`${LEGADO}/certificado-pior-caso-rodoviaria`))
    conferirComum(texto, d)
    const t = corrido(texto)
    // Características metrológicas do multi-intervalo numa linha só da grade (sem tabela de faixas)
    expect(t).toMatch(/CAPACIDADE \(MAX\) · MULTI-INTERVALO .*30 000 \/ 60 000 \/ 80 000 kg/)
    expect(t).toContain('10 / 20 / 50 kg')
    expect(t).toContain('como encontrado (antes do ajuste)')
    expect(t).toContain('como deixado (após o ajuste)')
    // As mesmas cargas de substituição nos dois ensaios: a frase inteira uma vez só
    expect(t.match(/Cargas de substituição \(EURAMET cg-18, 4\.3\.3\): 7 etapas/g)).toHaveLength(1)
    expect(t).toContain(
      'Cargas de substituição como em 5.3. Retorno ao zero: após a retirada da carga, o instrumento indicou 20 kg.',
    )
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

  it('a diagramação é a 1ª que cabe em 3 páginas: o gráfico encolhe, depois os respiros apertam e, por último, ele sai', async () => {
    /** O pior caso de antes com mais observações (uma por linha). */
    const comObservacoes = (n: number) => {
      const d = exemploPiorCasoLegado()
      d.calibracao.observacoes += Array.from({ length: n }, (_, i) => `\nObservação adicional nº ${i + 1}.`).join('')
      return d
    }
    // Plataforma (legado): o gráfico menor; os piores casos: os respiros do layout compacto; com 6 observações a mais,
    // nada cabe em 3 páginas e o gráfico fica (tirá-lo não pouparia a página)
    for (const d of [exemploPlataformaLegado(), exemploPiorCasoLegado(), exemploPiorCasoAtual(), comObservacoes(6)]) {
      const semMarca = { ...d, marcaDagua: '' }
      const todas: number[] = []
      for (const diagramacao of DIAGRAMACOES) {
        const pdf = await pdfmake()
          .createPdf(definicaoCertificado(semMarca, { diagramacao }) as never)
          .getBuffer()
        todas.push(folhas(textoDoPdf(pdf)).length)
      }
      const m = await montarCertificado(semMarca)
      const primeira = todas.findIndex((p) => p <= MAX_PAGINAS)
      const esperada = primeira >= 0 ? primeira : todas.indexOf(Math.min(...todas))
      expect(m.diagramacao, d.calibracao.numero).toEqual(DIAGRAMACOES[esperada])
      expect(m.paginas).toBe(todas[esperada])
      // Sem o gráfico só quando nenhuma diagramação com ele cabe em 3 páginas
      if (m.diagramacao.grafico === 0)
        expect(todas.filter((_, i) => DIAGRAMACOES[i].grafico > 0).every((p) => p > MAX_PAGINAS)).toBe(true)
    }
    // A ordem: o gráfico encolhe no layout normal, depois o compacto, e o último sem o gráfico
    expect(DIAGRAMACOES[0]).toEqual({ ritmo: 'normal', grafico: 150 })
    expect(DIAGRAMACOES.at(-1)).toEqual({ ritmo: 'compacto', grafico: 0 })
    expect(DIAGRAMACOES.filter((x) => x.grafico === 0)).toHaveLength(1)
    const normais = DIAGRAMACOES.filter((x) => x.ritmo === 'normal').map((x) => x.grafico)
    expect(normais).toEqual([...normais].sort((a, b) => b - a))
    expect(DIAGRAMACOES.findIndex((x) => x.ritmo === 'compacto')).toBe(normais.length)
  })

  it('excentricidade: uma posição por linha e, ao lado, o desenho delas vistas de cima (a de maior desvio destacada)', async () => {
    const t = corrido(textoDoPdf(await pdfDe('certificado-plataforma-300kg')))
    expect(t).toContain('Carga de ensaio: 100,00 kg · método: zera e desloca a carga pelas posições.')
    // Uma posição por linha (o pdftotext mistura os números do desenho ao lado no meio delas)
    for (const linha of [
      '1 Centro 100,00 referência',
      '2 Frente esquerda 100,05 +0,05',
      '3 Trás esquerda 100,00 0,00',
      '4 Trás direita 99,95 −0,05',
      '5 Frente direita 100,05 +0,05',
    ])
      expect(t).toContain(linha)
    expect(t).toContain('Maior desvio: |ΔI|máx = 0,05 kg, na posição 2')
    expect(t).toMatch(/FRENTE .*Posições vistas de cima/)
    // O desenho: a posição 2 (a de maior desvio) cheia de verde
    const json = JSON.stringify((definicaoCertificado(exemploPlataforma300kg()) as { content: unknown }).content)
    expect(json.match(/<circle [^>]*r=\\"7\\"/g)).toHaveLength(5)
    expect(json).toMatch(/<circle [^>]*fill=\\"#067A3B\\"/)
  })

  it('rótulos digitados à mão ("Apoio 1"… numa rodoviária): o desenho genérico, com as posições na ordem da tabela', async () => {
    const d = exemploPlataforma300kg()
    d.emissao.balanca = { ...d.emissao.balanca, receptor: 'RODOVIARIA' }
    d.calibracao = {
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
    const dados = recalculado(d)
    const json = JSON.stringify((definicaoCertificado(dados) as { content: unknown }).content)
    // Um desenho, com as 10 posições numeradas, e uma tabela só (uma linha por posição)
    expect(json.match(/Posições vistas de cima/g)).toHaveLength(1)
    expect(json.match(/<circle [^>]*r=\\"7\\"/g)).toHaveLength(10)
    expect(json.match(/"text":\["Posição"/g)).toHaveLength(1)
    const t = corrido(textoDoPdf(await gerarCertificadoPdf(dados)))
    expect(t).toMatch(/9 Apoio 9 100,00 0,00 10 Apoio 10 100,05 \+0,05/)
    expect(t).toContain('Posições vistas de cima')
  })

  it('rótulos que contradizem a ordem padrão: o desenho genérico, nunca uma posição no lugar errado', () => {
    /** Centro de cada posição numerada (1, 2, …) no desenho. */
    const centros = (svg: string) =>
      [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="7"/g)].map((m) => [Number(m[1]), Number(m[2])])
    // Os rótulos do sistema: o desenho do receptor, com a frente embaixo
    const padrao = diagramaPosicoes('RETANGULAR', posicoesExcentricidade('RETANGULAR'), -1, 0)!
    expect(padrao.svg).toContain('FRENTE')
    expect(centros(padrao.svg)[0]).toEqual([64, 42])
    // "Frente" na 1ª linha e "Centro" na última: na ordem padrão, a 1ª iria para o centro; o genérico põe a
    // do centro no meio e não diz qual lado é a frente
    const trocados = diagramaPosicoes('RETANGULAR', ['Frente', 'Trás', 'Esquerda', 'Direita', 'Centro'], -1, 0)!
    expect(trocados.svg).not.toContain('FRENTE')
    const [x, y] = centros(trocados.svg)[4]
    expect([x, y]).toEqual([trocados.largura / 2, 42])
    // Prato redondo com os rótulos de canto da plataforma: idem
    const cantos = ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita']
    expect(diagramaPosicoes('CIRCULAR', cantos, -1, 0)!.svg).not.toContain('FRENTE')
    // Rótulos sem lugar nenhum ("A"…"E"): a ordem padrão da cg-18, como sempre
    expect(diagramaPosicoes('RETANGULAR', ['A', 'B', 'C', 'D', 'E'], -1, 0)!.svg).toContain('FRENTE')
    // A folha de campo (sem `estrito`) continua com a ordem padrão
    expect(diagramaExcentricidade('CIRCULAR', cantos, -1, 0)!.svg).toContain('FRENTE')
  })

  it('métodos 3 e 4 numa rodoviária (a coluna da referência): o desenho encolhe e cada posição fica numa linha', async () => {
    const d = rodoviariaSemRevisao()
    d.calibracao.excentricidade = {
      ...d.calibracao.excentricidade,
      metodo: 4,
      posicoes: d.calibracao.excentricidade.posicoes.map((p) => ({ ...p, referencia: 10_000 })),
    }
    const dados = recalculado(d)
    // O desenho da rodoviária (214 pt) um pouco menor, até 160 pt
    const desenho = nosSvg(definicaoCertificado(dados).content).find((n) => n.svg.includes('apoios'))!
    expect(desenho.width).toBeLessThan(214)
    expect(desenho.width).toBeGreaterThanOrEqual(160)
    // Sem a coluna da referência, do tamanho dele
    expect(nosSvg(definicaoCertificado(rodoviariaSemRevisao()).content).find((n) => n.svg.includes('apoios'))!.width).toBe(214)
    const linhas = textoDoPdf(await gerarCertificadoPdf(dados)).split('\n')
    for (const rotulo of ['Início (ida)', 'Início (volta)', 'Meio (volta)', 'Fim (volta)'])
      expect(
        linhas.some((l) => l.includes(rotulo)),
        rotulo,
      ).toBe(true)
  })

  it('o desenho das posições sempre (e o gráfico, com a altura da diagramação; 0 = sem ele)', () => {
    const svgs = (d: DadosCertificadoPdf, grafico?: number) => {
      const doc = definicaoCertificado(d, grafico === undefined ? {} : { diagramacao: { ritmo: 'normal', grafico } }) as {
        content: unknown
      }
      return JSON.stringify(doc.content).match(/<svg/g)?.length ?? 0
    }
    for (const e of TODOS) {
      // O desenho e o gráfico; sem o gráfico, o desenho fica
      expect(svgs(e.dados()), e.arquivo).toBe(2)
      expect(svgs(e.dados(), 0), e.arquivo).toBe(1)
    }
    // Só o zero lido (prévia de um rascunho): nada para pôr no gráfico; o desenho das posições fica
    const soZero = exemploBancada()
    soZero.calibracao.indicacao.pontos = soZero.calibracao.indicacao.pontos.slice(0, 1)
    expect(soZero.calibracao.indicacao.pontos[0].carga).toBe(0)
    expect(svgs(recalculado(soZero))).toBe(1)
    // A altura pedida é a do gráfico
    const doc = JSON.stringify(definicaoCertificado(exemploBancada(), { diagramacao: { ritmo: 'normal', grafico: 116 } }))
    expect(doc).toMatch(/viewBox=\\"0 0 505(\.\d+)? 116\\"/)
  })

  it.each([
    { nome: 'pior caso de hoje', dados: exemploPiorCasoAtual },
    { nome: 'pior caso (legado)', dados: exemploPiorCasoLegado },
  ])('letra legível ($nome): dados com 8 pt ou mais, notas e declarações com 7 pt ou mais', ({ dados }) => {
    const doc = definicaoCertificado(dados()) as {
      content: unknown
      styles: Record<string, { fontSize: number }>
      defaultStyle: { fontSize: number }
    }
    // Também no layout compacto (o do pior caso)
    for (const estilos of [doc.styles, RITMOS.normal.estilos, RITMOS.compacto.estilos] as Array<
      Record<string, { fontSize: number }>
    >) {
      for (const estilo of ['td', 'valor']) expect(estilos[estilo].fontSize, estilo).toBeGreaterThanOrEqual(8)
      for (const estilo of ['nota', 'declaracao', 'paragrafo', 'th'])
        expect(estilos[estilo].fontSize, estilo).toBeGreaterThanOrEqual(7)
    }
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

  it.each([
    { nome: 'pior caso de hoje', dados: exemploPiorCasoAtual },
    { nome: 'pior caso (legado)', dados: exemploPiorCasoLegado },
  ])('letra legível ($nome): só as marcas invisíveis da montagem (um espaço, sem tinta) ficam abaixo de 7 pt', ({ dados }) => {
    const miudos: unknown[] = []
    const visitar = (no: unknown) => {
      if (Array.isArray(no)) no.forEach(visitar)
      else if (no && typeof no === 'object') {
        const x = no as { fontSize?: number; text?: unknown; id?: string }
        if (typeof x.fontSize === 'number' && x.fontSize < 7) miudos.push(x)
        Object.values(no).forEach(visitar)
      }
    }
    visitar((definicaoCertificado(dados()) as { content: unknown }).content)
    expect(miudos.length).toBeGreaterThan(0)
    for (const x of miudos) expect(x).toMatchObject({ text: ' ', id: expect.stringMatching(/^fim:/) })
  })

  it('o título dos padrões e a rastreabilidade nunca ficam sozinhos no pé da página: vão com o cabeçalho e a 1ª linha da tabela', async () => {
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
      const rastreabilidade = folhas.findIndex((f) => corrido(f).includes('por meio dos padrões abaixo'))
      const linha = folhas.findIndex((f) => f.includes('JP-05'))
      expect(titulo, `espaço de ${espaco} pt`).toBe(linha)
      expect(rastreabilidade, `espaço de ${espaco} pt`).toBe(linha)
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
    const d = exemploPiorCasoAtual()
    d.emissao = { ...d.emissao, textos: { ...d.emissao.textos, procedimento: 'BALANÇAS-POP-123 rev. 2' } }
    const texto = textoDoPdf(await gerarCertificadoPdf(d))
    conferirCabecalhos(texto, d.calibracao.numero, 'BALANÇAS.COM', 'BALANÇAS-POP-123 rev. 2')
    expect(corrido(texto)).toContain('MÉTODO — PROCEDIMENTO (POP) BALANÇAS-POP-123 rev. 2 —')
    expect((definicaoCertificado(d) as { info: { keywords: string } }).info.keywords).toContain('BALANÇAS-POP-123 rev. 2')
  })
})

describe('nota dos padrões: os pesos usados pelo valor nominal', () => {
  it('jogo pelo nominal: a nota de sempre; tudo pelo certificado, nenhuma', () => {
    const d = exemploBancada()
    expect(notaPesosNominais(d.emissao.padroes, d.calibracao)).toBeNull()
    const jogo = d.emissao.padroes.find((p) => p.tipo === 'PESOS')!
    const nominal = d.emissao.padroes.map((p) => (p.id === jogo.id ? { ...p, uso: 'NOMINAL' as const } : p))
    expect(notaPesosNominais(nominal, d.calibracao)).toBe(
      `Pesos padrão ${jogo.identificacao} usados pelo valor nominal: o erro máximo admissível da classe (OIML R 111) entra como contribuição para a incerteza.`,
    )
  })

  it('jogo pelo certificado com a peça usada sem a U no cadastro: a peça entra na nota (o cálculo a usou pelo nominal)', () => {
    const d = exemploBancada()
    const lido = d.calibracao.indicacao.pontos.find((p) => p.crescente !== null && p.pecas.length)!
    const { padraoId, pesoId } = lido.pecas[0]
    const jogo = d.emissao.padroes.find((p) => p.id === padraoId)!
    const peso = jogo.pesos.find((w) => w.id === pesoId)!
    const semU = d.emissao.padroes.map((p) =>
      p.id === padraoId ? { ...p, pesos: p.pesos.map((w) => (w.id === pesoId ? { ...w, incerteza: 0 } : w)) } : p,
    )
    expect(notaPesosNominais(semU, d.calibracao)).toBe(
      `Pesos padrão ${jogo.identificacao} (peça de ${massaLegivel(peso.nominal)}) usados pelo valor nominal: o erro máximo admissível da classe (OIML R 111) entra como contribuição para a incerteza.`,
    )
    // No documento, na seção dos padrões
    const dados = recalculado({ ...d, emissao: { ...d.emissao, padroes: semU } })
    expect(JSON.stringify(definicaoCertificado(dados))).toContain(`${jogo.identificacao} (peça de ${massaLegivel(peso.nominal)})`)
  })
})

describe('histerese pela média com o carregamento num sentido só', () => {
  /** A definição do certificado em texto (o SVG do gráfico vai dentro). */
  const definicao = (d: DadosCertificadoPdf) => JSON.stringify((definicaoCertificado(d) as { content: unknown }).content)
  const emMedia = (d: DadosCertificadoPdf, metodo?: 'CONTINUO' | 'DECRESCENTE'): DadosCertificadoPdf => {
    d.calibracao.opcoes = { ...d.calibracao.opcoes, histerese: 'MEDIA' }
    if (metodo) {
      d.calibracao.indicacao.metodo = metodo
      for (const p of d.calibracao.indicacao.pontos) {
        if (metodo === 'CONTINUO') p.decrescente = null
        else p.crescente = null
      }
    }
    return recalculado(d)
  }

  it.each([
    { nome: 'bancada contínua', dados: () => emMedia(exemploBancada(), 'CONTINUO'), serie: 'Carga crescente' },
    { nome: 'bancada decrescente', dados: () => emMedia(exemploBancada(), 'DECRESCENTE'), serie: 'Carga decrescente' },
    { nome: 'rodoviária (contínua)', dados: () => emMedia(exemploRodoviariaLegado()), serie: 'Carga crescente' },
    { nome: 'classe I (descontínua)', dados: () => emMedia(exemploClasseI220g()), serie: 'Carga crescente' },
  ])('$nome: o gráfico com a série do sentido, sem "média", como a tabela e a legenda', ({ dados, serie }) => {
    const json = definicao(dados())
    // A tabela e a legenda: erro de um sentido
    expect(json).toContain('Erro = indicação − carga.')
    expect(json).not.toContain('Erro (média)')
    // O gráfico e a nota dele, iguais
    expect(json).toContain(`>${serie}<`)
    expect(json).not.toContain('Média (↑↓)')
    expect(json).not.toContain('média das indicações')
    expect(json).toMatch(/Erro de indicação em função da carga(?: — como deixado)?\. Barras: incerteza expandida U/)
  })

  it('com os dois sentidos, a média nos três lugares (tabela, legenda e gráfico)', () => {
    const json = definicao(exemploBancada())
    expect(json).toContain('Erro (média)')
    expect(json).toContain('Erro = média das indicações ↑ e ↓ − carga')
    expect(json).toContain('>Média (↑↓)<')
    expect(json).toContain('Erro de indicação em função da carga (média das indicações ↑ e ↓).')
  })

  it('num sentido só, os pontos do gráfico são os da tabela (o erro da média é o do sentido)', () => {
    const d = emMedia(exemploBancada(), 'CONTINUO')
    for (const p of d.resultado.pontos.filter((x) => x.texto.crescente !== ''))
      expect(p.texto.erroCrescente).toBe(p.texto.erroMedio)
  })
})

describe('o fim do certificado nunca fica sozinho', { timeout: 120_000 }, () => {
  const casos = [...TODOS.map((e) => ({ nome: e.arquivo, dados: e.dados })), ...VARIANTES]

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
    'bancada (opiniões): a 3ª página leva seções inteiras, não só o fim; o gráfico fica com a tabela dele',
    async () => {
      const d = exemploBancada()
      // Sem o equilíbrio, a 3ª página ficaria só com as declarações e as assinaturas
      const antes = await natural(d)
      expect(antes).toHaveLength(3)
      const p3 = corrido(antes[2])
      expect(p3.slice(p3.indexOf('Página 3 de 3') + 'Página 3 de 3'.length).trim()).toMatch(/^8 DECLARAÇÕES/)
      const m = await montarCertificado(d)
      expect(m.paginas).toBe(3)
      // A quebra antes das observações (não antes do gráfico, que fica embaixo da tabela 5.3)
      expect(m.quebras).toEqual(['observacoes'])
      expect(m.ocupacao[2]).toBeGreaterThanOrEqual(0.4)
      expect(m.ocupacao[1]).toBeGreaterThanOrEqual(0.6)
      const [, p2, ultima] = folhas(textoDoPdf(m.pdf)).map(corrido)
      expect(p2).toContain('Erro de indicação em função da carga')
      expect(ultima).toMatch(/6 OBSERVAÇÕES .* 7 OPINIÕES E INTERPRETAÇÕES .* 8 DECLARAÇÕES .* Fim do Certificado/)
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
      expect(montado.quebras).toEqual(['observacoes'])
      expect((await gerarCertificadoPdf(semImagens)).equals(montado.pdf)).toBe(true)
    },
  )

  it.runIf(temPdftotext).each([...TODOS.map((e) => ({ nome: e.arquivo, dados: e.dados })), ...VARIANTES])(
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
      // (com uma assinatura só, o padrão da 1.0.4, o fim fica um pouco mais baixo: o balcão 32 kg sai com 39 %)
      expect(m.ocupacao.at(-1)!).toBeGreaterThanOrEqual(OCUPACAO_MINIMA_ULTIMA - 0.12)
    },
  )

  it('a montagem só mexe na paginação de 3 páginas ou mais com a última quase vazia', async () => {
    // Piores casos: a 3ª página já sai com a conformidade, as observações e as opiniões; nada a equilibrar
    for (const d of [exemploPiorCasoAtual(), exemploPiorCasoLegado()]) {
      const pior = await montarCertificado(d)
      expect(pior.paginas).toBe(3)
      expect(pior.quebras).toEqual([])
      expect(pior.ocupacao[2]).toBeGreaterThanOrEqual(OCUPACAO_MINIMA_ULTIMA)
    }
    // A última página já com mais da metade: como sai
    for (const d of [exemploPlataforma300kg(), exemploRodoviariaLegado(), exemploClasseILegado()]) {
      const m = await montarCertificado(d)
      expect(m.paginas).toBe(3)
      expect(m.ocupacao[2]).toBeGreaterThanOrEqual(OCUPACAO_MINIMA_ULTIMA)
      expect(m.quebras).toEqual([])
    }
    // Uma quebra pedida na definição começa a seção numa página nova (o grupo final nunca recebe quebra)
    const doc = definicaoCertificado(exemploBancada(), { quebras: ['observacoes', 'declaracoes'] }) as {
      content: Array<{ pageBreak?: string; id?: string }>
    }
    expect(doc.content.filter((x) => x.pageBreak === 'before')).toHaveLength(1)
    const i = doc.content.findIndex((x) => x.pageBreak === 'before')
    expect(doc.content[i - 1].id).toBe('fim:grafico')
    // A marca do fim do certificado só na medição
    expect(JSON.stringify(doc.content)).not.toContain('fim:declaracoes')
    expect(JSON.stringify((definicaoCertificado(exemploBancada(), { medir: true }) as { content: unknown }).content)).toContain(
      'fim:declaracoes',
    )
  })

  it.runIf(temPdftotext)(
    'normal (sem ajuste) com opinião e observação de 1 linha: 3 páginas com o gráfico grande e folga no pé da última',
    async () => {
      for (const nome of ['rodoviária sem revisão + opinião de 1 linha', 'bancada + opinião']) {
        const m = await montarCertificado(VARIANTES.find((v) => v.nome === nome)!.dados())
        expect(m.paginas, nome).toBe(3)
        expect(m.diagramacao, nome).toEqual(DIAGRAMACOES[0])
        expect(m.ocupacao[2], nome).toBeLessThanOrEqual(0.9)
      }
    },
  )

  it.runIf(temPdftotext)('opiniões: a ressalva vai na linha do título, e a caixa só com a opinião', async () => {
    const texto = textoDoPdf(await pdfDe('certificado-bancada-30kg'))
    const linha = texto.split('\n').find((l) => l.includes('OPINIÕES E INTERPRETAÇÕES'))!
    expect(linha).toMatch(
      /7 +OPINIÕES E INTERPRETAÇÕES +Baseadas nos resultados; não fazem parte dos resultados de medição\. Emitidas por pessoal autorizado\.$/,
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
      visitar((definicaoCertificado(exemploPlataforma300kg()) as { content: unknown }).content)
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
    for (const e of TODOS) expect(corrido(textoDoPdf(await pdfDe(e.arquivo)))).not.toMatch(/Separador (decimal|de milhar)/)
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
    expect(t).toMatch(/8 DECLARAÇÕES 1\. A incerteza expandida .* 4\. Esta calibração não isenta/)
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

/** `f` é uma página em PNG da amostra `nome` ("certificado-bancada-30kg-1.png"…)? */
const paginaPng = (f: string, nome: string) => f.startsWith(`${nome}-`) && /^\d+\.png$/.test(f.slice(nome.length + 1))

/** As páginas em PNG de uma amostra, na pasta dela. */
function pngsDe(arquivo: string): string[] {
  const pasta = dirname(join(PASTA_EXEMPLOS, arquivo))
  return existsSync(pasta) ? readdirSync(pasta).filter((f) => paginaPng(f, basename(arquivo))) : []
}

describe.runIf(temPdftoppm)('amostras em PNG (revisão visual)', { timeout: 60_000 }, () => {
  it.each(TODOS)('renderiza as páginas de $arquivo', async ({ arquivo }) => {
    const pdf = await pdfDe(arquivo)
    const caminho = join(PASTA_EXEMPLOS, `${arquivo}.pdf`)
    const pasta = dirname(caminho)
    mkdirSync(pasta, { recursive: true })
    writeFileSync(caminho, pdf)
    for (const f of pngsDe(arquivo)) rmSync(join(pasta, f))
    const r = spawnSync('pdftoppm', ['-r', '80', '-png', caminho, join(PASTA_EXEMPLOS, arquivo)])
    expect(r.status).toBe(0)
    expect(pngsDe(arquivo)).toHaveLength(paginasDoPdf(pdf))
  })
})

describe('EMA na tabela do erro de indicação', () => {
  const ponto = (ema: string, emaDecrescente?: string) =>
    ({ texto: { ema, ...(emaDecrescente ? { emaDecrescente } : {}) } }) as Parameters<typeof textoEmaDoPonto>[0]
  it('o da carga; nas múltiplas faixas, o da descida (na faixa maior) ao lado, quando é outro', () => {
    expect(textoEmaDoPonto(ponto('0,0015'))).toBe('±0,0015')
    expect(textoEmaDoPonto(ponto('0,0015', '0,005'))).toBe('±0,0015 ↑ / ±0,005 ↓')
    expect(textoEmaDoPonto(ponto(''))).toBe('—')
  })
})

// ---- Nada some do certificado; nº inteiro no cabeçalho; grade dentro da margem -------------------------------

/** Nº de páginas do PDF (pdfinfo). */
function paginasDoPdf(pdf: Buffer): number {
  const r = spawnSync('pdfinfo', ['-'], { input: pdf })
  return Number(/Pages:\s+(\d+)/.exec(r.stdout.toString())?.[1] ?? 0)
}

interface PalavraPdf {
  x0: number
  y0: number
  x1: number
  y1: number
  texto: string
}

/** Palavras de cada página, com a caixa (pt, do canto de cima), pelo `pdftotext -bbox`. */
function palavrasDoPdf(pdf: Buffer): PalavraPdf[][] {
  const r = spawnSync('pdftotext', ['-bbox', '-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
  return r.stdout
    .toString('utf8')
    .split('<page ')
    .slice(1)
    .map((p) =>
      [...p.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({
        x0: Number(m[1]),
        y0: Number(m[2]),
        x1: Number(m[3]),
        y1: Number(m[4]),
        texto: m[5].replace(/&amp;/g, '&'),
      })),
    )
}

/** Palavras do cabeçalho de cada página (acima da margem de cima do conteúdo, 80 pt). */
const cabecalhosDoPdf = (pdf: Buffer) => palavrasDoPdf(pdf).map((p) => p.filter((w) => w.y1 < 80).map((w) => w.texto))

describe.runIf(temPdftotext)('nada some do certificado: bloco mais alto que a página', { timeout: 180_000 }, () => {
  const comOpiniao = (linhas: string[]) => {
    const d = exemploBalanca32kg()
    d.calibracao.opinioes = multilinha(linhas.join('\n'))
    return { ...recalculado(d), marcaDagua: '' }
  }

  /** O texto do PDF e as conferências de sempre: páginas contadas = as do PDF, o fim e as assinaturas na última. */
  function conferirInteiro(m: Awaited<ReturnType<typeof montarCertificado>>) {
    const texto = textoDoPdf(m.pdf)
    expect(m.paginas).toBe(paginasDoPdf(m.pdf))
    expect(m.paginas).toBe(folhas(texto).length)
    const ultima = corrido(folhas(texto).at(-1)!)
    expect(ultima).toMatch(/EXECUTADO (E AUTORIZADO )?POR/)
    expect(ultima).toContain('Fim do Certificado de Calibração')
    return corrido(texto)
  }

  it('opinião de 60 linhas curtas (2 690 caracteres): todas as linhas saem', async () => {
    const linhas = Array.from({ length: 60 }, (_, i) => `Ponto ${i + 1}: erro dentro do EMA, sem tendência.`)
    const d = comOpiniao(linhas)
    expect(d.calibracao.opinioes.length).toBeLessThanOrEqual(5000)
    const t = conferirInteiro(await montarCertificado(d))
    expect(t).toContain('OPINIÕES E INTERPRETAÇÕES')
    for (const l of linhas) expect(t).toContain(l)
  })

  it('opinião de 80 linhas mínimas (menos de 1 500 caracteres): o título e todas as linhas saem', async () => {
    const linhas = Array.from({ length: 80 }, (_, i) => `P${i + 1}: ok.`)
    const d = comOpiniao(linhas)
    expect(d.calibracao.opinioes.length).toBeLessThan(1500)
    const t = conferirInteiro(await montarCertificado(d))
    expect(t).toContain('OPINIÕES E INTERPRETAÇÕES')
    expect([...t.matchAll(/\bP(\d+): ok\./g)].map((x) => Number(x[1]))).toEqual(linhas.map((_, i) => i + 1))
  })

  it('opinião longa não vai inteira (divide-se onde a página acaba); a curta continua inteira, na caixa', () => {
    const longa = definicaoCertificado(comOpiniao(Array.from({ length: 30 }, (_, i) => `P${i + 1}: ok.`))) as {
      content: NoPdf[]
    }
    const json = (x: unknown) => JSON.stringify(x)
    const opiniao = longa.content.find((x) => json(x).includes('OPINIÕES E INTERPRETAÇÕES'))!
    expect(json(opiniao)).not.toContain('"unbreakable":true')
    const curta = definicaoCertificado(comOpiniao(['Erros dentro do EMA em todos os pontos.'])) as { content: NoPdf[] }
    expect(curta.content.find((x) => json(x).includes('OPINIÕES E INTERPRETAÇÕES'))).toMatchObject({ unbreakable: true })
  })

  /** Quatro declarações distintas de ≈ 2 200 caracteres (o limite das Configurações é 3 000 cada). */
  function comDeclaracoesLongas(): DadosCertificadoPdf {
    const d = exemploBalanca32kg()
    const frase = (i: number) =>
      `Frase ${String(i).padStart(3, '0')} de uma declaração mais longa redigida pela empresa para os seus certificados.`
    const declaracao = (n: number) =>
      multilinha(
        `Declaração D${n} começa aqui. ${Array.from({ length: 24 }, (_, i) => frase(i)).join(' ')} D${n} termina aqui.`,
        3000,
      )
    d.emissao.textos = {
      ...d.emissao.textos,
      incerteza: declaracao(1),
      abrangencia: declaracao(2),
      naoAcreditado: declaracao(3),
      controleLegal: declaracao(4),
    }
    return { ...d, marcaDagua: '' }
  }

  it('4 declarações de 2 200 caracteres: todas saem, com as assinaturas e o fim na última página', async () => {
    const d = comDeclaracoesLongas()
    expect(d.emissao.textos.incerteza.length).toBeGreaterThan(2100)
    const m = await montarCertificado(d)
    const t = conferirInteiro(m)
    expect(t).toMatch(/\d+ DECLARAÇÕES 1\. Declaração D1 começa aqui\./)
    for (const n of [1, 2, 3, 4]) {
      expect(t).toContain(`Declaração D${n} começa aqui.`)
      expect(t).toContain(`D${n} termina aqui.`)
    }
    // As declarações foram divididas (o bloco único não cabia numa página)
    expect(m.divisiveis).toEqual(['declaracoes'])
  })

  it('declarações divididas: o título com a 1ª e a última com o fim, inteiros; as do meio se dividem', () => {
    const d = comDeclaracoesLongas()
    const doc = definicaoCertificado(d, { divisiveis: ['declaracoes'] }) as { content: NoPdf[] }
    const i = doc.content.findIndex((x) => JSON.stringify(x).includes('DECLARAÇÕES'))
    const [primeira, d2, d3, ultima] = doc.content.slice(i)
    expect(primeira.unbreakable).toBe(true)
    expect(JSON.stringify(primeira)).toContain('Declaração D1 começa aqui.')
    for (const [no, n] of [
      [d2, 2],
      [d3, 3],
    ] as const) {
      expect(no.unbreakable).toBeUndefined()
      expect(JSON.stringify(no)).toContain(`Declaração D${n} começa aqui.`)
    }
    expect(ultima.unbreakable).toBe(true)
    expect(JSON.stringify(ultima)).toContain('Declaração D4 começa aqui.')
    expect(JSON.stringify(ultima)).toContain('— Fim do Certificado de Calibração nº')
    expect(doc.content.length).toBe(i + 4)
  })

  it.each([...TODOS.map((e) => ({ nome: e.arquivo, dados: e.dados })), ...VARIANTES.slice(0, 3)])(
    '$nome: o que cabe não muda (nada dividido) e as páginas contadas são as do PDF',
    async ({ dados }) => {
      const m = await montarCertificado({ ...dados(), marcaDagua: '' })
      expect(m.divisiveis).toEqual([])
      expect(m.paginas).toBe(paginasDoPdf(m.pdf))
    },
  )

  it('observações e outras seções divididas: sem bloco inteiro (o título só não fica sozinho no pé da página)', () => {
    const d = exemploBancada()
    const json = (x: unknown) => JSON.stringify(x)
    const doc = definicaoCertificado(d, { divisiveis: ['observacoes', 'dados'] }) as { content: NoPdf[] }
    const i = doc.content.findIndex((x) => json(x).includes('OBSERVAÇÕES'))
    expect(doc.content[i]).toMatchObject({ style: 'secao', headlineLevel: expect.any(Number) })
    const lista = doc.content.slice(i).find((x) => 'ul' in x) as { ul: unknown[] }
    expect(lista.ul.length).toBeGreaterThan(1)
    expect(
      json(
        doc.content.slice(
          i,
          doc.content.findIndex((x) => x.id === 'fim:observacoes'),
        ),
      ),
    ).not.toContain('"unbreakable"')
    // Os dados da calibração (sem divisão própria): sem nenhum bloco inteiro
    const dados = doc.content.slice(
      0,
      doc.content.findIndex((x) => x.id === 'fim:dados'),
    )
    expect(json(dados)).toContain('DADOS DA CALIBRAÇÃO')
    expect(json(dados)).not.toContain('"unbreakable"')
    // O que não foi dividido continua como sempre
    expect(doc.content.at(-1)!.unbreakable).toBe(true)
  })

  it('o descarte é visto pelas sondas de altura zero: nem o bloco que encosta no pé da página nem o que passa para a seguinte contam', async () => {
    // Página de 400 pt com a margem de cima do certificado (80 pt): 270 pt úteis; cada linha tem 12,1 pt
    const linha = (i: number) => ({ text: `linha ${i}`, fontSize: 10, lineHeight: 1 })
    async function medir(antes: number, linhas: number, margemBaixo = 0) {
      const bloco = {
        stack: Array.from({ length: linhas }, (_, i) => linha(i)),
        unbreakable: true,
        margin: [0, 0, 0, margemBaixo],
      }
      const sondas = new Map<string, { pagina: number; topo: number }>()
      const doc = {
        pageSize: { width: 300, height: 400 },
        pageMargins: [20, 80, 20, 50],
        defaultStyle: { font: 'Inter' },
        content: [
          { text: 'antes', fontSize: 10, lineHeight: 1, margin: [0, antes, 0, 0] },
          ...comSondas([bloco], 'teste'),
          linha(99),
        ],
        pageBreakBefore: (no: { id?: string; startPosition?: { pageNumber: number; top: number } }) => {
          if (no.id && no.startPosition) sondas.set(no.id, { pagina: no.startPosition.pageNumber, topo: no.startPosition.top })
          return false
        },
      }
      await pdfmake().createPdf(doc).getBuffer()
      return { faltando: descartados(sondas), depois: sondas.get('sonda:depois:teste:0')! }
    }
    // Cabe; passa para a seguinte (e termina abaixo do alto dela)
    expect(await medir(0, 10)).toMatchObject({ faltando: [], depois: { pagina: 1 } })
    expect(await medir(150, 10)).toMatchObject({ faltando: [], depois: { pagina: 2 } })
    // Encosta no pé da página (sobram 0,05 pt), também com a margem de baixo que não cabe: a sonda fica embaixo dele
    for (const margem of [0, 5]) {
      const r = await medir(136.85, 10, margem)
      expect(r.faltando).toEqual([])
      expect(r.depois.pagina).toBe(1)
      expect(r.depois.topo).toBeGreaterThan(349.9)
    }
    // Mais alto que a página (30 linhas = 363 pt): descartado, vindo do alto ou do meio da página
    expect((await medir(0, 30)).faltando).toEqual(['teste'])
    expect((await medir(100, 30, 5)).faltando).toEqual(['teste'])
  })

  it('o que não cabe numa página nem dividido: erro, sem PDF (nada sai faltando)', async () => {
    const d = exemploBancada()
    // Fora dos limites do sistema (uma declaração tem até 3 000 caracteres): mais alta que uma página sozinha
    d.emissao.textos = { ...d.emissao.textos, incerteza: 'Texto longo demais para uma página. '.repeat(1200) }
    await expect(montarCertificado(d)).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/não coube nas páginas.*declarações e assinaturas.*Nada foi guardado/),
    })
  })
})

describe.runIf(temPdftotext)('nº do certificado inteiro no cabeçalho de toda página', { timeout: 120_000 }, () => {
  it.each([
    { numero: 'CC-2026-00042-R1', pop: 'POP-01 rev. 0' },
    { numero: 'CC-2026-00042-R1', pop: '' },
    { numero: 'LAB-CAL-2026-00408', pop: 'POP-CAL-01 rev. 00' },
    { numero: 'LAB-CAL-2026-00447', pop: 'POP-CAL-01 rev. 00' },
  ])('$numero com o POP "$pop": o nº numa palavra só, no alto de cada página', async ({ numero, pop }) => {
    const d = exemploPlataforma300kg()
    d.calibracao.numero = numero
    d.emissao.textos = { ...d.emissao.textos, procedimento: pop }
    const m = await montarCertificado({ ...d, marcaDagua: '' })
    const cabecalhos = cabecalhosDoPdf(m.pdf)
    expect(cabecalhos).toHaveLength(m.paginas)
    for (const [i, c] of cabecalhos.entries()) expect(c, `página ${i + 1}`).toContain(numero)
  })

  it('nº muito longo (formato de até 40 caracteres): a letra diminui, o nº fica inteiro e dentro da margem', async () => {
    const numero = 'LABORATORIO-CALIBRACAO-BALANCAS-2026-00042'
    const d = exemploPlataforma300kg()
    d.calibracao.numero = numero
    const m = await montarCertificado({ ...d, marcaDagua: '' })
    for (const [i, p] of palavrasDoPdf(m.pdf).entries()) {
      const w = p.find((x) => x.texto === numero && x.y1 < 80)
      expect(w, `página ${i + 1}`).toBeDefined()
      expect(w!.x1, `página ${i + 1}`).toBeLessThanOrEqual(A4.largura - 45 + 0.5)
      // A marca continua inteira, à esquerda
      expect(
        p
          .filter((x) => x.y1 < 80)
          .map((x) => x.texto)
          .join(' '),
      ).toContain(d.emissao.empresa.nomeFantasia.toUpperCase())
    }
  })
})

describe.runIf(temPdftotext)('grade "RÓTULO / valor": palavra longa quebra dentro da célula', { timeout: 60_000 }, () => {
  it.each([
    {
      nome: 'e-mail do contato com 64 caracteres',
      mudar: (d: DadosCertificadoPdf) => {
        d.emissao.cliente.email = 'garantia.qualidade.metrologia@frigorificovaledocorumbatai.com.br'
      },
    },
    {
      nome: 'nº de série com 31 caracteres sem espaço',
      mudar: (d: DadosCertificadoPdf) => {
        d.emissao.balanca.numeroSerie = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01234'
      },
    },
  ])('$nome: nada passa da margem direita e o CNPJ sai inteiro', async ({ mudar }) => {
    const d = exemploPlataforma300kg()
    mudar(d)
    const pdf = await gerarCertificadoPdf({ ...d, marcaDagua: '' })
    const [p1] = palavrasDoPdf(pdf)
    const fora = p1.filter((w) => w.x1 > A4.largura - 45 + 0.5).map((w) => `${w.texto} (${w.x1})`)
    expect(fora).toEqual([])
    expect(p1.map((w) => w.texto)).toContain('11.444.777/0001-61')
  })

  it('no layout normal, as colunas são as de antes (colunas iguais; a última da metrologia com o resto)', () => {
    const doc = definicaoCertificado(exemploPlataforma300kg()) as { content: unknown }
    const larguras: number[][] = []
    const visitar = (no: unknown) => {
      if (Array.isArray(no)) no.forEach(visitar)
      else if (no && typeof no === 'object') {
        const x = no as { table?: { widths?: unknown[]; body?: unknown[][] } }
        if (x.table?.widths && JSON.stringify(x.table.body).includes('"style":"rotulo"'))
          larguras.push(x.table.widths as number[])
        Object.values(no).forEach(visitar)
      }
    }
    visitar(doc.content)
    expect(larguras.length).toBeGreaterThan(3)
    for (const l of larguras) {
      expect(l.every((x) => typeof x === 'number')).toBe(true)
      // Cada coluna com a folga de 8 pt à direita: somadas, a largura útil (595,28 − 2 × 45)
      expect(l.reduce((a, b) => a + b + 8, 0)).toBeCloseTo(A4.largura - 90, 6)
    }
  })
})

// ---- A pasta das amostras: só as de hoje; as de antes em legado/ (depois de gravar os PDF e os PNG) ----------------

describe('pasta das amostras', () => {
  /** Os arquivos (não as pastas) de uma pasta de exemplos/. */
  const arquivos = (pasta: string) =>
    existsSync(pasta) ? readdirSync(pasta).filter((f) => statSync(join(pasta, f)).isFile()) : []
  /** Os arquivos que não são o PDF de uma das amostras nem uma página dela em PNG. */
  const estranhos = (pasta: string, amostras: Exemplo[]) => {
    const nomes = amostras.map((e) => basename(e.arquivo))
    return arquivos(pasta).filter((f) => !nomes.some((n) => f === `${n}.pdf` || paginaPng(f, n)))
  }

  it('exemplos/ só tem as amostras de hoje, e legado/ só as dos registros de antes', () => {
    expect(estranhos(PASTA_EXEMPLOS, EXEMPLOS)).toEqual([])
    expect(estranhos(join(PASTA_EXEMPLOS, LEGADO), LEGADOS)).toEqual([])
    // Só a pasta legado/ dentro de exemplos/
    const pastas = existsSync(PASTA_EXEMPLOS)
      ? readdirSync(PASTA_EXEMPLOS).filter((f) => statSync(join(PASTA_EXEMPLOS, f)).isDirectory())
      : []
    expect(pastas).toEqual([LEGADO])
  })
})

describe('quem assina e a correção com o mesmo nº (1.0.4)', () => {
  /** A definição do documento, em texto (os rótulos das assinaturas saem em maiúsculas). */
  const texto = (d: DadosCertificadoPdf) => JSON.stringify(definicaoCertificado(d))
  /** O mesmo certificado emitido antes da 1.0.4 (sem os campos novos congelados na emissão). */
  const de103 = (d: DadosCertificadoPdf): DadosCertificadoPdf => {
    const { assinaturas: _a, mesmoNumero: _m, ...emissao } = d.emissao
    return { ...d, emissao }
  }
  const sha = (d: DadosCertificadoPdf) => createHash('sha256').update(texto(d)).digest('hex')
  /** As imagens das assinaturas desenhadas (data URL), na ordem. */
  const imagens = (d: DadosCertificadoPdf) => [...texto(d).matchAll(/"image":"(data:image[^"]+)"/g)].map((m) => m[1])

  it('revisão por outra pessoa desligada: só "Executado por", com o técnico (nome, cargo, registro e assinatura), mesmo emitido por outra pessoa', () => {
    const d = exemploBalanca32kg()
    expect(d.emissao.assinaturas).toBe('TECNICO')
    expect(d.emissao.tecnico.id).not.toBe(d.emissao.signatario.id)
    expect(assinantes(d.emissao)).toEqual([{ papel: 'Executado por', s: d.emissao.tecnico }])
    const t = texto(d)
    expect(t).toContain('"EXECUTADO POR"')
    expect(t).not.toMatch(/AUTORIZADO POR/)
    for (const x of [d.emissao.tecnico.nome, d.emissao.tecnico.cargo, d.emissao.tecnico.registro]) expect(t).toContain(x)
    // Quem emitiu não sai no certificado (fica registrado no sistema)
    expect(t).not.toContain(d.emissao.signatario.nome)
    expect(t).not.toContain(d.emissao.signatario.registro)
    expect(imagens(d)).toEqual([d.emissao.tecnico.assinatura])
  })

  it('o técnico emitiu a própria calibração (desligada): "Executado por", não "Executado e autorizado por"', () => {
    const d = exemploBancada()
    expect([d.emissao.assinaturas, d.emissao.tecnico.id === d.emissao.signatario.id]).toEqual(['TECNICO', true])
    expect(assinantes(d.emissao).map((x) => x.papel)).toEqual(['Executado por'])
    expect(texto(d)).toContain('"EXECUTADO POR"')
    expect(texto(d)).not.toMatch(/AUTORIZADO POR/)
  })

  it('revisão por outra pessoa ligada: as duas assinaturas, de quem executou e de quem autorizou', () => {
    const d = exemploPlataforma300kg()
    expect(d.emissao.assinaturas).toBe('TECNICO_E_SIGNATARIO')
    expect(assinantes(d.emissao)).toEqual([
      { papel: 'Executado por', s: d.emissao.tecnico },
      { papel: 'Autorizado por', s: d.emissao.signatario },
    ])
    const t = texto(d)
    expect(t).toMatch(/"EXECUTADO POR".*"AUTORIZADO POR"/)
    expect(t).toContain(d.emissao.tecnico.nome)
    expect(t).toContain(d.emissao.signatario.nome)
    expect(imagens(d)).toEqual([d.emissao.tecnico.assinatura, d.emissao.signatario.assinatura])
  })

  it('emitido antes da 1.0.4 (sem o campo): as assinaturas como saíam', () => {
    // Pessoas diferentes: as duas; a mesma pessoa: uma só, "Executado e autorizado por"
    expect(assinantes(de103(exemploBalanca32kg()).emissao).map((x) => x.papel)).toEqual(['Executado por', 'Autorizado por'])
    expect(assinantes(de103(exemploBancada()).emissao).map((x) => x.papel)).toEqual(['Executado e autorizado por'])
    expect(texto(de103(exemploBancada()))).toContain('"EXECUTADO E AUTORIZADO POR"')
    expect(texto(de103(exemploBalanca32kg()))).toMatch(/"EXECUTADO POR".*"AUTORIZADO POR"/)
  })

  it('emitido antes da 1.0.4: o PDF refeito dos dados congelados é o mesmo documento, byte a byte', () => {
    // A definição do documento como a 1.0.3 a montava (sha256 gravados com ela): as assinaturas (uma só ou as duas),
    // o quadro da revisão "-R1" com o motivo e os registros de antes do POP. Se o layout mudar de propósito para
    // todos, os PDFs emitidos continuam servidos do arquivo guardado (server/certificados.ts, `pdfEmitido`)
    const piorCasoRevisao103 = () => {
      const d = de103(exemploPiorCasoAtual())
      d.calibracao = { ...d.calibracao, numero: 'CC-2026-00151-R1' }
      return d
    }
    const casos: Array<[string, () => DadosCertificadoPdf, string]> = [
      ['plataforma (legado)', exemploPlataformaLegado, '4831104ed504d268e5ec41dd212668f5991fa8076dc7e6685f0dff732e3b66d5'],
      ['rodoviária (legado)', exemploRodoviariaLegado, 'b7511a3f8bc4e62eb4cd1cc1ef9e90f4a9e3c2d1ac947cc2d7ae3ad0a76226d7'],
      ['pior caso (legado)', exemploPiorCasoLegado, '5e05a72b1891f60b630dceb2ec65d68b1210dcbb683d8b2e2c961c48f36d174d'],
      ['classe I (legado)', exemploClasseILegado, '7fff8618caf7be282fc6563e3216de096d80a33afbd183e745244b7c0b68481b'],
      [
        'executado e autorizado pela mesma pessoa',
        () => de103(exemploBancada()),
        'ac1fbd815d476adf8a0a62b96002bb054b5e81cb1464506acc59dcad05aed689',
      ],
      [
        'executado e autorizado por pessoas diferentes',
        () => de103(exemploPlataforma300kg()),
        '1a0fdbd09a324d6765873652d3b74708f39ba04c4fbde2cb9461a6c3130e0519',
      ],
      [
        'revisão "-R1" emitida pela 1.0.3',
        piorCasoRevisao103,
        '1fa4400c4de19d43151c31d78aa258a0f9ab4714a5d15d31c5efcd5d95f49660',
      ],
    ]
    for (const [nome, dados, esperado] of casos) expect(sha(dados()), nome).toBe(esperado)
  })

  it('a correção com o mesmo nº sai como um certificado comum: sem "-R", sem o quadro da revisão e sem o motivo', () => {
    const d = exemploPiorCasoAtual()
    expect([d.emissao.mesmoNumero, d.calibracao.substituiId !== '', d.emissao.substituiNumero]).toEqual([
      true,
      true,
      'CC-2026-00151',
    ])
    const t = texto(d)
    expect(t).toContain('— Fim do Certificado de Calibração nº CC-2026-00151 —')
    expect(t).not.toMatch(/-R\d|Revisão: |substitui integralmente|que fica cancelado|Motivo: /)
    expect(t).not.toContain(d.calibracao.motivoRevisao.slice(0, 40))
    // Sem a marca, a mesma definição de um certificado que nunca foi corrigido (só a data da emissão é a nova)
    const comum: DadosCertificadoPdf = {
      ...d,
      calibracao: { ...d.calibracao, substituiId: '', motivoRevisao: '' },
      emissao: { ...d.emissao, substituiNumero: '', substituiEmissao: '', mesmoNumero: undefined },
    }
    expect(t).toBe(texto(comum))
    // A revisão "-R1" de antes (sem a marca) continua com o quadro e o motivo
    const antiga = texto({ ...d, emissao: { ...d.emissao, mesmoNumero: undefined } })
    expect(antiga).toContain('substitui integralmente o Certificado nº ')
    expect(antiga).toContain(`Motivo: ${d.calibracao.motivoRevisao}`)
  })
})

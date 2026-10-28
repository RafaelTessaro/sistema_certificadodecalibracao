// Testes da folha de campo em PDF: gera as amostras (server/pdf/exemplosFolhaCampo.ts), confere que a
// geração é determinística e, com o pdftotext (poppler-utils), o conteúdo de cada página: cabeçalho de
// identificação (com o nº do certificado reservado, quando há), rótulos iguais aos da tela do assistente,
// plano de cargas, o POP no rodapé, o tamanho da folha (enxuta: dado impresso diferente vai no verso) e o que
// NÃO pode aparecer (aprovado/reprovado, validade — fora a nota da etiqueta —, caixas de "confere").

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AVISO_ETIQUETA, FORMULARIO_FOLHA_CAMPO } from '#shared/folhaCampo.ts'
import { verificacoesAntesDeCalibrar } from '#shared/dominio.ts'
import type { Padrao } from '#shared/tipos.ts'
import { A4, BASE_RODAPE, MODULO, TOPO_CABECALHO } from './base.ts'
import {
  folhaEmBranco,
  folhaEmBrancoOitoPadroes,
  folhaMultiIntervalo,
  folhaPlataforma,
  folhaRodoviaria,
  folhaRodoviariaSemHistorico,
  padroesDaEmpresa,
} from './exemplosFolhaCampo.ts'
import {
  AUTORIZACAO_AJUSTE,
  AVISO_VERSO,
  type DadosFolhaCampo,
  definicaoFolhaCampo,
  descricaoPadraoNaFolha,
  DICA_ETIQUETA,
  ETAPAS_SISTEMA,
  gerarFolhaCampoPdf,
  montar,
  nomeArquivoFolhaCampo,
  textosDaFaixa,
  VERIFICACOES_FOLHA,
  verificacoesFolha,
} from './folhaCampo.ts'
import { POP_EXEMPLO } from './exemplosCertificado.ts'

const temPdftotext = !spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error

function textoDoPdf(pdf: Buffer): string {
  const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdf, maxBuffer: 50 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`pdftotext falhou: ${r.stderr?.toString()}`)
  return r.stdout.toString('utf8').replace(/[    ]/g, ' ')
}

const corrido = (t: string) => t.replace(/\s+/g, ' ')
const paginasDe = (t: string) => t.split('\f').filter((p) => p.trim())

interface Palavra {
  x0: number
  y0: number
  x1: number
  y1: number
  texto: string
}

/** Palavras de cada página, com a caixa (pt, a partir do canto de cima), pelo `pdftotext -bbox`. */
function palavrasDoPdf(pdf: Buffer): Palavra[][] {
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

/** Página do PDF em tons de cinza (pdftoppm, PGM), a 150 dpi: `escuro(x, y)` em pt. */
function imagemDaPagina(pdf: Buffer, pagina: number) {
  const r = spawnSync('pdftoppm', ['-r', '150', '-gray', '-f', String(pagina), '-l', String(pagina), '-'], {
    input: pdf,
    maxBuffer: 100 * 1024 * 1024,
  })
  const cabecalho = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(r.stdout.subarray(0, 40).toString('latin1'))!
  const [largura, inicio] = [Number(cabecalho[1]), cabecalho[0].length]
  const px = 150 / 72
  return {
    px,
    escuro: (xPx: number, yPx: number) => r.stdout[inicio + yPx * largura + xPx] < 170,
  }
}

/**
 * Espaço livre (mm) embaixo do rótulo de uma caixa de escrever, na faixa das colunas do rótulo: do pé da
 * última linha escura do rótulo até a primeira linha escura de baixo (o fio da caixa). Como a revisão mediu.
 */
function livreEmbaixo(pdf: Buffer, paginas: Palavra[][], rotulo: string[]): { pagina: number; mm: number } {
  for (const [i, palavras] of paginas.entries()) {
    const j = palavras.findIndex((_, k) => rotulo.every((r, n) => palavras[k + n]?.texto === r))
    if (j < 0) continue
    const w = palavras[j]
    const img = imagemDaPagina(pdf, i + 1)
    const [x0, x1] = [Math.ceil(w.x0 * img.px), Math.floor(Math.min(w.x1, w.x0 + 20) * img.px)]
    const linhaEscura = (y: number) => {
      for (let x = x0; x <= x1; x++) if (img.escuro(x, y)) return true
      return false
    }
    let y = Math.floor(w.y0 * img.px)
    while (!linhaEscura(y)) y++ // topo do rótulo
    // Fim do rótulo (com uma 2ª linha dele, se quebrar: brancos de até 1,2 mm entre as linhas)
    for (;;) {
      while (linhaEscura(y)) y++
      let k = 0
      while (k < 8 && !linhaEscura(y + k)) k++
      if (k >= 8) break
      y += k
    }
    let livre = 0
    while (!linhaEscura(y + livre)) livre++
    return { pagina: i + 1, mm: (livre * 25.4) / 150 }
  }
  throw new Error(`rótulo não achado: ${rotulo.join(' ')}`)
}

/**
 * As amostras e o máximo de páginas de cada uma (folha enxuta: 3 páginas). A folha em branco fica em 4: sem
 * balança, todos os campos que o sistema imprimiria saem vazios para escrever (cliente, identificação com as
 * faixas, 10 pontos, as etapas de substituição e a tabela do EMA por classe), também com os 8 padrões ativos
 * de uma empresa maior.
 */
const EXEMPLOS: Array<{ nome: string; dados: () => DadosFolhaCampo; maxPaginas: number }> = [
  { nome: 'plataforma 300 kg (rascunho do último certificado)', dados: folhaPlataforma, maxPaginas: 3 },
  { nome: 'balcão multi-intervalo 6/15/33 kg (sem histórico)', dados: folhaMultiIntervalo, maxPaginas: 3 },
  { nome: 'rodoviária 80 t com substituição', dados: folhaRodoviaria, maxPaginas: 3 },
  { nome: 'em branco', dados: folhaEmBranco, maxPaginas: 4 },
  { nome: 'rodoviária 60 t sem calibração anterior', dados: folhaRodoviariaSemHistorico, maxPaginas: 3 },
  { nome: 'em branco com 8 padrões', dados: folhaEmBrancoOitoPadroes, maxPaginas: 4 },
]

const gerados = new Map<string, Promise<Buffer>>()
const pdfDe = (e: (typeof EXEMPLOS)[number]) => {
  if (!gerados.has(e.nome)) gerados.set(e.nome, gerarFolhaCampoPdf(e.dados()))
  return gerados.get(e.nome)!
}

describe('gerarFolhaCampoPdf', { timeout: 30_000 }, () => {
  it.each(EXEMPLOS)('gera um PDF válido: $nome', async (e) => {
    const pdf = await pdfDe(e)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(pdf.subarray(-6).toString('latin1')).toContain('%%EOF')
    expect(pdf.length).toBeGreaterThan(20_000)
  })

  it('é determinística: gerar de novo dá o mesmo arquivo, byte a byte', async () => {
    const a = await gerarFolhaCampoPdf(folhaRodoviaria())
    const b = await gerarFolhaCampoPdf(folhaRodoviaria())
    expect(a.equals(b)).toBe(true)
  })

  it('usa a data da impressão como data do documento e não se apresenta como certificado', () => {
    const d = folhaPlataforma()
    const doc = definicaoFolhaCampo(d) as { info: Record<string, unknown>; language: string }
    expect(doc.info.creationDate).toEqual(new Date(d.impressoEm))
    expect(doc.info.title).toBe('Folha de campo FC-2026-00042')
    expect(String(doc.info.subject)).toContain('9091-118832')
    expect(doc.language).toBe('pt-BR')
    expect(JSON.stringify(doc)).not.toMatch(/CERTIFICADO DE CALIBRAÇÃO Nº/)
  })

  it('nome do arquivo', () => {
    expect(nomeArquivoFolhaCampo('FC-2026-00042')).toBe('Folha-de-campo-FC-2026-00042.pdf')
    expect(nomeArquivoFolhaCampo('OS 2026/0456')).toBe('Folha-de-campo-OS-2026-0456.pdf')
    expect(nomeArquivoFolhaCampo('')).toBe('Folha-de-campo-em-branco.pdf')
  })

  it('lista de pesos só quebra entre as peças, nunca entre o número e a unidade', () => {
    const json = JSON.stringify(definicaoFolhaCampo(folhaPlataforma()))
    expect(json).toContain('7\u00a0×\u00a020\u00a0kg + 10\u00a0kg'.replace(/\\u00a0/g, '\u00a0'))
    expect(json).not.toMatch(/"7 × 20 kg \+ 10 kg"/)
  })

  it('sem número, a folha sai com a linha para escrever o nº e sem QR', () => {
    const d = { ...folhaEmBranco(), numero: '' }
    const doc = definicaoFolhaCampo(d) as { header: (p: number, t: number) => unknown }
    const svgs = (doc: { header: (p: number, t: number) => unknown }) => JSON.stringify(doc.header(1, 4)).split('<svg').length - 1
    expect(JSON.stringify(doc.header(1, 4))).toContain('Nº ____')
    // Só o logo; com número, o logo e o QR
    expect(svgs(doc)).toBe(1)
    expect(svgs(definicaoFolhaCampo(folhaEmBranco()) as typeof doc)).toBe(2)
  })

  it('caixas de marcar sempre brancas: o previsto vai no rótulo (negrito e PREVISTO), nunca na caixa', () => {
    for (const dados of [folhaPlataforma, folhaRodoviaria, folhaEmBranco]) {
      const quadrados: Array<{ color?: string }> = []
      const visitar = (no: unknown) => {
        if (Array.isArray(no)) no.forEach(visitar)
        else if (no && typeof no === 'object') {
          const r = no as { type?: string; w?: number; h?: number; color?: string }
          if (r.type === 'rect' && r.w === r.h && (r.w ?? 0) <= 11) quadrados.push(r)
          Object.values(no).forEach(visitar)
        }
      }
      visitar((definicaoFolhaCampo(dados()) as { content: unknown }).content)
      expect(quadrados.length).toBeGreaterThan(20)
      expect(quadrados.filter((q) => q.color !== '#FFFFFF')).toEqual([])
    }
    // A plataforma prevê o local, o método, a divisão, a conformidade e a data no certificado
    expect(
      JSON.stringify(definicaoFolhaCampo(folhaPlataforma()).content).split('"  PREVISTO"').length - 1,
    ).toBeGreaterThanOrEqual(5)
  })

  it.each(EXEMPLOS)('nenhuma parte de passo abre uma página sem o título do passo: $nome', async (e) => {
    const m = await montar(e.dados())
    // Parte que passou inteira para a página seguinte (a marca depois dela ficou numa página depois)
    const abrem = [...m.marcas.entries()]
      .filter(([id, x]) => id.startsWith('parte-') && (m.marcas.get(`fim:${id}`)?.pagina ?? 0) > x.pagina)
      .map(([id]) => id)
    for (const id of abrem) expect(m.extras.continuacoes).toContain(id)
  })

  it.each(EXEMPLOS)('folha enxuta: $nome em no máximo $maxPaginas páginas', async (e) => {
    const m = await montar(e.dados())
    expect(m.paginas).toBeLessThanOrEqual(e.maxPaginas)
    expect(m.faltando).toEqual([])
  })

  it('sem "confere" nem caixas de correção: dado impresso diferente vai no verso (uma linha no alto da página 1)', () => {
    for (const e of EXEMPLOS) {
      const json = JSON.stringify((definicaoFolhaCampo(e.dados()) as { content: unknown }).content)
      expect(json, e.nome).not.toMatch(/"confere"|escreva o certo/)
      expect(json, e.nome).toContain(AVISO_VERSO)
    }
  })

  it('rodapé: o código e a revisão do formulário e o POP configurado (sem POP, nada no lugar)', () => {
    const rodape = (d: DadosFolhaCampo) => JSON.stringify((definicaoFolhaCampo(d) as { footer: () => unknown }).footer())
    const comPop = rodape({ ...folhaPlataforma(), procedimento: 'BALANÇAS-POP-123 rev. 00' })
    expect(comPop).toContain(`${FORMULARIO_FOLHA_CAMPO.codigo} rev. ${FORMULARIO_FOLHA_CAMPO.revisao}`)
    expect(comPop).toContain('"POP BALANÇAS-POP-123 rev. 00"')
    expect(comPop).not.toContain('PT-CAL-01')
    for (const sem of ['', undefined]) {
      const t = rodape({ ...folhaPlataforma(), procedimento: sem })
      expect(t).not.toMatch(/POP|PT-CAL/)
      expect(t).toContain('registro de dados brutos')
    }
    // Nos metadados também, com o guia técnico
    const doc = definicaoFolhaCampo({ ...folhaPlataforma(), procedimento: 'BALANÇAS-POP-123 rev. 00' }) as {
      info: { keywords: string }
    }
    expect(doc.info.keywords).toContain('POP BALANÇAS-POP-123 rev. 00')
    expect(doc.info.keywords).toContain(FORMULARIO_FOLHA_CAMPO.referencia)
  })

  it('usa os mesmos rótulos do assistente (validação da transcrição, ISO/IEC 17025 7.11)', () => {
    // Cada passo diz a etapa do sistema onde é digitado: as etapas têm de existir com esse nome na tela
    const tela = readFileSync(new URL('../../src/pages/CalibracaoForm.tsx', import.meta.url), 'utf8')
    for (const etapa of Object.values(ETAPAS_SISTEMA)) expect(tela).toContain(`titulo: '${etapa.replace(/^\d · /, '')}'`)
    // A verificação preliminar tem os mesmos itens e textos da tela (a mesma lista, da classe da balança)
    const instrumento = readFileSync(new URL('../../src/components/calibracao/EtapaInstrumento.tsx', import.meta.url), 'utf8')
    expect(instrumento).toContain('verificacoesAntesDeCalibrar(balanca.classe)')
    expect(VERIFICACOES_FOLHA).toEqual(verificacoesAntesDeCalibrar(null).map((v) => v.texto))
    expect(verificacoesFolha('III')).toEqual(verificacoesAntesDeCalibrar('III').map((v) => v.texto))
  })

  it('aquecimento pela classe (Tabela 2 do POP: 20 min; 1 h na classe II), ou o do fabricante, se maior', () => {
    expect(verificacoesFolha('III')[3]).toBe('Ligada e aquecida por 20 min ou mais (ou o tempo do fabricante, se maior)')
    expect(verificacoesFolha('')[3]).toBe('Ligada e aquecida por 20 min ou mais (ou o tempo do fabricante, se maior)')
    expect(verificacoesFolha('II')[3]).toBe('Ligada e aquecida por 1 h ou mais (ou o tempo do fabricante, se maior)')
    // Em branco (classe ainda desconhecida): os dois tempos
    expect(VERIFICACOES_FOLHA[3]).toBe('Ligada e aquecida: 20 min, classe II 1 h (ou o tempo do fabricante, se maior)')
    expect(VERIFICACOES_FOLHA.join(' ')).not.toContain('pelo tempo do fabricante')
    const json = (d: DadosFolhaCampo) => JSON.stringify((definicaoFolhaCampo(d) as { content: unknown }).content)
    const d = folhaPlataforma()
    expect(json(d)).toContain(verificacoesFolha('III')[3])
    expect(json({ ...d, balanca: { ...d.balanca!, classe: 'II' } })).toContain(verificacoesFolha('II')[3])
    expect(json(folhaEmBranco())).toContain(VERIFICACOES_FOLHA[3])
  })

  it('classe II: ΔT de 3 °C nas observações, pressão obrigatória e o barômetro na lista dos padrões', () => {
    const json = (d: DadosFolhaCampo) => JSON.stringify((definicaoFolhaCampo(d) as { content: unknown }).content)
    const d = folhaRodoviaria()
    const classeII = json({ ...d, balanca: { ...d.balanca!, classe: 'II' } })
    expect(classeII).toContain('ΔT acima de 3 °C')
    expect(classeII).toMatch(/PRESSÃO\s●\s\(hPa\)/)
    expect(classeII).not.toContain('PRESSÃO, OPCIONAL')
    // Na classe III: 5 °C e pressão opcional
    const classeIII = json(d)
    expect(classeIII).toContain('ΔT acima de 5 °C')
    expect(classeIII).toContain('PRESSÃO, OPCIONAL (hPa)')
    // O barômetro vai a campo na classe II (na lista "antes de sair"); na III, na linha dos que o plano não usa
    const naoUsa = (t: string) => t.slice(t.indexOf('o plano não usa'), t.indexOf('o plano não usa') + 120)
    expect(naoUsa(classeIII)).toContain('BR-01')
    expect(classeII).not.toContain('o plano não usa')
    // Em branco: os dois limites
    expect(json(folhaEmBranco())).toContain('ΔT acima de 5 °C (classe II: 3 °C)')
  })

  it('ajuste: proposto fora da faixa; feito só com a autorização do cliente (na OS ou no verso)', () => {
    const json = (d: DadosFolhaCampo) => JSON.stringify((definicaoFolhaCampo(d) as { content: unknown }).content)
    for (const e of EXEMPLOS) {
      const t = json(e.dados())
      expect(t, e.nome).toContain(AUTORIZACAO_AJUSTE)
      expect(t, e.nome).not.toMatch(/fora dela, ajuste|: ajuste e /)
    }
    expect(AUTORIZACAO_AJUSTE).toBe('só com a autorização do cliente: na OS ou no verso (nome, função e hora)')
    expect(json(folhaPlataforma())).toContain('fora dela, proponha o ajuste')
  })

  it('excentricidade: a frente é o lado do indicador (com indicador remoto, o de acesso)', () => {
    const json = (d: DadosFolhaCampo) => JSON.stringify((definicaoFolhaCampo(d) as { content: unknown }).content)
    for (const e of EXEMPLOS) expect(json(e.dados()), e.nome).toContain('Frente: indicador (se remoto, o de acesso).')
    expect(json(folhaPlataforma())).not.toContain('FRENTE · INDICADOR')
  })
})

describe.runIf(temPdftotext)('conteúdo da folha (pdftotext)', { timeout: 30_000 }, () => {
  /** Em toda página: título, nº da folha, "Página i de N", código do formulário e a identificação da tarefa. */
  function conferirPaginas(texto: string, numero: string, identificacao: string[]) {
    const paginas = paginasDe(texto)
    expect(paginas.length).toBeGreaterThanOrEqual(3)
    expect(paginas.length).toBeLessThanOrEqual(4)
    paginas.forEach((p, i) => {
      const t = corrido(p)
      expect(t).toContain('FOLHA DE CAMPO — CALIBRAÇÃO DE BALANÇA')
      expect(t).toContain(numero)
      expect(t).toContain(`Página ${i + 1} de ${paginas.length}`)
      // O formulário e o POP configurado (as amostras levam o dos certificados de exemplo)
      // "POP-CAL-01 rev. 00", sem "POP" repetido na frente
      expect(t).toContain(`${FORMULARIO_FOLHA_CAMPO.codigo} rev. ${FORMULARIO_FOLHA_CAMPO.revisao} · ${POP_EXEMPLO}`)
      expect(t).not.toContain('POP POP')
      expect(t).toContain('não é certificado de calibração')
      // Folha solta ou digitalizada sozinha: quem imprimiu e quando, rubrica e data em toda página
      expect(t).toMatch(/Impressa em \d\d\/\d\d\/\d{4}, às \d\d:\d\d por /)
      expect(t).toMatch(/RUBRICA .*DATA/)
      for (const x of identificacao) expect(t).toContain(x)
    })
    return paginas
  }

  /** Comum a todas as folhas: roteiro completo, regra de correção, assinaturas e nada de "certificado". */
  function conferirComum(texto: string) {
    const t = corrido(texto)
    expect(t).toContain('COMO ANOTAR E CORRIGIR')
    expect(t).toMatch(/um risco só sobre o valor errado/)
    expect(t).toContain('corretivo')
    for (const passo of [
      'ANTES DE SAIR: PADRÕES',
      'CHEGADA AO CLIENTE',
      'IDENTIFICAÇÃO DA BALANÇA',
      'VERIFICAÇÃO ANTES DE CALIBRAR E AMBIENTE NO INÍCIO',
      'ERRO DE INDICAÇÃO',
      'AJUSTE E REPARO',
      'REPETIBILIDADE',
      'EXCENTRICIDADE',
      'ENCERRAMENTO: AMBIENTE NO FIM E CONCLUSÃO',
      'ASSINATURAS',
    ])
      expect(t).toContain(passo)
    for (const etapa of Object.values(ETAPAS_SISTEMA)) expect(t).toContain(etapa)
    // O aquecimento muda com a classe (ver o teste do aquecimento)
    for (const item of VERIFICACOES_FOLHA.filter((x) => !x.startsWith('Ligada e aquecida'))) expect(t).toContain(item)
    expect(t).toMatch(/Ligada e aquecida(:| por) /)
    expect(t).toContain('Zero automático / rastreamento de zero')
    expect(t).toContain('COMO ENCONTRADO')
    expect(t).toContain('DEPOIS DO AJUSTE')
    expect(t).toContain('Indicação ↑')
    expect(t).toContain('Zero após retirar')
    // Retorno ao zero na própria tabela de pontos (nunca solto no alto de outra página)
    expect(t).toContain('RETORNO AO ZERO')
    for (const p of paginasDe(texto).filter((x) => x.includes('RETORNO AO ZERO'))) expect(p).toContain('ERRO DE INDICAÇÃO')
    expect(t).toMatch(/INÍCIO · HORA.*FIM · HORA/)
    expect(t).toContain('MARCA DE REPARO Nº')
    expect(t).toContain('SELOS RETIRADOS')
    expect(t).toContain('SELOS COLOCADOS')
    expect(t).toContain('HORA DO AJUSTE')
    expect(t).toContain('HORA DO INÍCIO')
    expect(t).toContain('SELOS / LACRES ENCONTRADOS')
    expect(t).toContain('FOTOS TIRADAS')
    expect(t).toContain('LIGADA DESDE')
    expect(t).toMatch(/PESOS NO LOCAL HÁ/)
    expect(t).toContain('INSTRUMENTO USADO')
    // Conclusão com os mesmos campos da tela
    expect(t).toContain('O CLIENTE PEDIU CONFORMIDADE?')
    expect(t).toMatch(/LIMITE \(ERRO MÁXIMO/)
    expect(t).toContain('REGRA DE DECISÃO')
    expect(t).toContain('O CLIENTE PEDIU A DATA NO CERTIFICADO?')
    expect(t).toContain('OBSERVAÇÕES (SAEM NO CERTIFICADO)')
    expect(t).toContain('TÉCNICO QUE EXECUTOU — NOME E ASSINATURA')
    expect(t).toContain('PELO CLIENTE — NOME, FUNÇÃO E ASSINATURA')
    expect(t).toContain('quem acompanhou; ciente das condições, não dos resultados')
    // O escritório numa linha só: quem digitou, quem conferiu com a folha, o nº do certificado e o arquivo
    expect(t).toMatch(
      /ESCRITÓRIO DIGITADO NO SISTEMA POR EM CONFERIDO COM A FOLHA POR EM CERTIFICADO Nº digitalizada na pasta da OS( CC-\d{4}-\d{5})? /,
    )
    expect(t).toContain('Grampeie as folhas')
    // Dado impresso diferente: no verso (sem caixas de "confere" nem de correção)
    expect(corrido(paginasDe(texto)[0])).toContain(AVISO_VERSO)
    expect(t).not.toMatch(/\bconfere\b/)
    expect(t).toContain('OPINIÕES E INTERPRETAÇÕES (OPCIONAL)')
    // Nada de aprovação ou "validade" numa folha de campo (fora a nota da etiqueta: a validade fica em branco);
    // o nº do certificado só como reservado, nunca como o título de um certificado
    expect(t).not.toContain('CERTIFICADO DE CALIBRAÇÃO Nº')
    expect(t).not.toMatch(/\baprovad[oa]\b|\breprovad[oa]\b/i)
    expect(t.replace(AVISO_ETIQUETA, '')).not.toMatch(/validade/i)
  }

  it('plataforma 300 kg: cadastro para conferir, pontos e pesos do último certificado, EMA', async () => {
    const e = EXEMPLOS[0]
    const texto = textoDoPdf(await pdfDe(e))
    const paginas = conferirPaginas(texto, 'FC-2026-00042', ['OS-2026-0512', 'Frigorífico Vale do Corumbataí', '9091-118832'])
    // Três páginas, sem parte de passo solta no alto de uma página
    expect(paginas).toHaveLength(3)
    for (const p of paginas.slice(1))
      expect(corrido(p)).toMatch(/BALANÇA nº de série 9091-118832 · TAG BAL-EXP-07 \d{1,2} [A-ZÇÃÁÉÍÓÚÊ]/)
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('FRIGORÍFICO VALE DO CORUMBATAÍ LTDA')
    expect(t).toContain('Avenida Brasil, 2450')
    expect(t).toContain('Carlos Eduardo Lima')
    // O cliente impresso, compacto (sem "confere" nem caixa para o certo: diferente, no verso); o técnico
    // previsto é só uma dica, numa caixa branca, e o nome ao lado da assinatura fica para quem executou escrever
    expect(corrido(paginas[0])).toMatch(/RAZÃO SOCIAL CONTATO NO CLIENTE CNPJ FRIGORÍFICO VALE DO CORUMBATAÍ LTDA/)
    expect(corrido(paginas[0])).toMatch(/TÉCNICO QUE EXECUTOU ● .{0,80}previsto: Carlos Eduardo Lima/)
    const ultima = corrido(paginas.at(-1)!)
    const assinaturas = ultima.slice(ultima.indexOf('ASSINATURAS'))
    expect(assinaturas).toContain('TÉCNICO QUE EXECUTOU — NOME E ASSINATURA')
    expect(assinaturas.slice(0, assinaturas.indexOf('ESCRITÓRIO'))).not.toContain('Carlos')
    expect(t).toContain('Algum dado impresso está diferente? Anote o certo no verso da folha, com o nº do passo.')
    expect(t).toContain('Diferente? Anote o certo no verso (passo 3) e avise o cliente.')
    expect(t).toContain('Marque com X')
    expect(t).toMatch(/no cliente\s+PREVISTO/)
    // Troca de pesos: no verso, com o nº da linha e as peças usadas (a nota embaixo da tabela de pontos diz)
    expect(t).not.toContain('PESOS DIFERENTES DO PREVISTO')
    expect(t).toContain('Pesos diferentes dos impressos: anote no verso o nº da linha e as peças usadas.')
    expect(t).toContain('Portaria Inmetro/Dimel nº')
    expect(t).toContain('0236/2009')
    expect(t).toContain('Processo / produção')
    expect(t).toContain('Toledo do Brasil 2180 · nº')
    // Recados de acesso na chegada (página 1), não no fim
    expect(corrido(paginas[0])).toContain('Procurar a Juliana na portaria 2')
    expect(corrido(paginas[0])).toContain('prevista: 21/10/2026')
    // Padrões: o que separar antes de sair
    expect(t).toContain('PP20-01 a 15')
    expect(t).toContain('15 × 20 kg')
    // Pontos (do último certificado), nas casas de d, com os pesos e a faixa aceitável (conformidade pedida)
    expect(t).toMatch(/300,00 +15 × 20 kg/)
    expect(t).toMatch(/150,00 +7 × 20 kg \+ 10 kg/)
    expect(t).toContain('299,80 a 300,20')
    expect(t).toContain('Faixa para decidir o ajuste: carga ± EMA (Portaria Inmetro 157/2022 — em serviço)')
    expect(t).toContain('Portaria Inmetro 157/2022 — em serviço')
    expect(t).toMatch(/Crescente e decrescente\s+PREVISTO/)
    expect(t).toContain('Indicação ↓')
    // Repetibilidade com 150 kg (5 leituras previstas, mínimo 3) e excentricidade com 100 kg em 5 posições,
    // as cargas nas casas de d
    expect(t).toContain('Coloque 150 kg no centro da plataforma')
    expect(t).toMatch(/CARGA APLICADA \(kg\).*150,00/)
    expect(t).toMatch(/CARGA USADA \(kg\).*100,00/)
    expect(t).toContain('previsto: TH-01')
    expect(t).toContain('Faça as 5 leituras previstas (mínimo 3')
    expect(t).toContain('Zere vazia e coloque 100 kg em cada posição')
    for (const p of ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita']) expect(t).toContain(p)
    // A frente: o lado do indicador; com indicador remoto, o de acesso
    expect(t).toContain('Frente: indicador (se remoto, o de acesso).')
    expect(t).not.toContain('FRENTE · INDICADOR')
    // Min (1 kg) entre as cargas
    expect(t).toMatch(/1,00 +1 kg/)
    expect(t).toContain('a normal (d = 50 g)')
    expect(t).toContain('21/10/2027')
    // A identificação da balança impressa numa grade só, em três linhas
    expect(t).toMatch(
      /TIPO DE BALANÇA FABRICANTE \(INDICADOR\) MODELO \(INDICADOR\) Nº DE SÉRIE \(INDICADOR\) IDENTIFICAÇÃO \/ TAG \(\*\) ANO DE FABRICAÇÃO Plataforma Toledo do Brasil 9091 9091-118832 BAL-EXP-07 2019/,
    )
  })

  it('balcão multi-intervalo: pontos sugeridos pelo sistema, d de cada intervalo e EMA por intervalo', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[1]))
    const paginas = conferirPaginas(texto, 'FC-2026-00043', ['OS-2026-0519', 'Supermercado Bom Preço', 'UR33-204718'])
    // O balcão cabe em três páginas, com as observações numa caixa só
    expect(paginas).toHaveLength(3)
    expect(texto).not.toContain('OBSERVAÇÕES (CONTINUAÇÃO)')
    // O erro de indicação inteiro na página 2, com o retorno ao zero e os pesos diferentes na tabela
    expect(texto).not.toContain('ERRO DE INDICAÇÃO (CONTINUAÇÃO)')
    for (const x of ['ERRO DE INDICAÇÃO', '33,00', 'RETORNO AO ZERO', 'Pesos diferentes dos impressos'])
      expect(corrido(paginas[1])).toContain(x)
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('pontos, cargas e posições sugeridos pelo sistema')
    expect(t).toContain('6/15/33 kg × 2/5/10 g')
    // d de cada carga, embaixo dela (o pdftotext às vezes cola os espaços da letra miúda)
    for (const d of ['2', '5', '10']) expect(t).toMatch(new RegExp(`d ?= ?${d} ?g`))
    expect(t).toContain('a normal (d = 2/5/10 g)')
    expect(t).toContain('8,250')
    expect(t).toContain('33,00')
    expect(t).toContain('32,96 a 33,04')
    expect(t).toContain('Uso comercial (venda por peso): a calibração não substitui a verificação do Inmetro/IPEM.')
    expect(t).toContain('MARCA INMETRO/IPEM:')
    // Min (40 g) entre as cargas
    expect(t).toMatch(/0,040 .{0,20}2 × 20 g/)
    // Repetibilidade: um ensaio por intervalo (POP 7.9), numa tabela só, com a carga nas casas de d do intervalo
    // de cada uma (16,5 kg: d = 10 g), as leituras com a carga e o zero, 6 colunas (5 previstas)
    expect(t).toContain('Um ensaio por intervalo: zere, coloque a carga no centro do prato')
    expect(t).toMatch(/Ensaio Carga \(kg\) Pesos previstos Hora Leitura \(kg\) 1ª 2ª 3ª 4ª 5ª 6ª/)
    for (const [n, carga] of [
      [1, '4,800'],
      [2, '12,000'],
      [3, '16,50'],
    ])
      expect(t).toMatch(new RegExp(`${n} +${carga} .{0,60}Com a carga`))
    expect(t.match(/Zero após retirar/g)?.length).toBeGreaterThanOrEqual(3)
    expect(t).toContain('5 leituras por ensaio (mínimo 5); colunas a mais: opcionais')
    expect(t).toContain('as que não couberem, no verso')
    // Excentricidade: no mínimo Max/3 (11 kg), num valor redondo acima
    expect(t).toContain('Zere vazia e coloque 15 kg em cada posição')
    // Faixa para decidir o ajuste, e o passo 6 aponta para ela
    expect(t).toContain('Fora da faixa para decidir o ajuste (passo 5)')
  })

  it('rodoviária 80 t: substituição, posições de ida e volta e tolerância do cliente', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[2]))
    const paginas = conferirPaginas(texto, 'FC-2026-00044', ['OS-2026-0530', 'Usina São Bento', 'WT3K-77120'])
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('Cargas de substituição — 10 000 kg de pesos padrão em cada etapa (20 × 500 kg)')
    // Cabeçalho em duas linhas, que o pdftotext intercala com as colunas vizinhas
    expect(t).toMatch(/Indicação com a .{0,40}substituição/)
    expect(t).toMatch(/Pesos padrão .{0,150}por cima/)
    expect(t).toMatch(/Crescente contínuo\s+PREVISTO/)
    // A coluna ↓ vai também (estreita): o método pode mudar no local
    expect(t).toContain('Indicação ↓')
    expect(t).toContain('só se descer')
    // Etapas de substituição antes e depois do ajuste, cada uma na sua aba do sistema
    const sub = t.slice(t.indexOf('Cargas de substituição'))
    expect(sub).toMatch(/COMO ENCONTRADO.*DEPOIS DO AJUSTE/)
    expect(sub).toContain('Ajustou? Refaça as etapas em “depois do ajuste”.')
    // Pontos e etapas de substituição, preenchidos intercalados, na mesma página
    const comEtapas = paginas.find((p) => p.includes('Cargas de substituição —'))!
    expect(corrido(comEtapas)).toMatch(/40 000 +3 +20 × 500 kg/)
    expect(corrido(comEtapas)).toContain('ERRO DE INDICAÇÃO')
    // Observações numa caixa só, sem continuação
    expect(t).not.toContain('OBSERVAÇÕES (CONTINUAÇÃO)')
    expect(paginas).toHaveLength(3)
    for (const p of ['Início (ida)', 'Meio (ida)', 'Fim (ida)', 'Início (volta)', 'Meio (volta)', 'Fim (volta)'])
      expect(t).toContain(p)
    expect(t).toContain('Tolerância do cliente')
    expect(t).toContain('39 940 a 40 060')
    expect(t).toContain('Faça as 3 leituras previstas (mínimo 3: carga de 100 kg ou mais)')
    // Os pontos param em 40 t de 80 t: o técnico confirma com o cliente antes de sair
    expect(t).toContain('Resolva antes de sair')
    expect(t).toContain('Os pontos vão só até 40 000 kg (50 % de Max)')
  })

  it('pesos que não fecham a carga da repetibilidade e da excentricidade: "faltam" na folha e aviso antes de sair', async () => {
    const d = folhaPlataforma()
    d.calibracao = {
      ...d.calibracao!,
      repetibilidade: [{ id: 'r1', carga: 400, leituras: [] }],
      excentricidade: { ...d.calibracao!.excentricidade, carga: 400 },
    }
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
    expect(t).toContain('Resolva antes de sair')
    expect(t).toContain('Repetibilidade: os pesos previstos não fecham 400 kg')
    expect(t).toContain('Excentricidade: os pesos previstos não fecham 400 kg')
    // Na célula dos pesos previstos de cada ensaio (a dos pontos já mostrava)
    expect(t.match(/PESOS PREVISTOS[^]*?faltam [\d,]+ kg/g)?.length).toBe(2)
  })

  it('rodoviária sem substituição no plano (sem histórico ou sem ela no último certificado): etapas e níveis sugeridos', async () => {
    const semHistorico = folhaRodoviaria()
    semHistorico.calibracao = null
    const semSubstituicao = folhaRodoviaria()
    const k = semSubstituicao.calibracao!
    semSubstituicao.calibracao = {
      ...k,
      indicacao: {
        ...k.indicacao,
        substituicao: { ativa: false, pecas: [], etapas: [] },
        pontos: k.indicacao.pontos.map((p) => ({ ...p, nivelSubstituicao: 0, pecasManuais: false })),
      },
    }
    // 80 t sem histórico: pontos até 80 000 kg = 7 etapas de 10 000 kg + os pesos; 40 t do rascunho: 3 etapas
    for (const [d, etapas, ultimo] of [
      [semHistorico, 7, /80 000 +7 +20 × 500 kg/],
      [semSubstituicao, 3, /40 000 +3 +20 × 500 kg/],
    ] as const) {
      const texto = textoDoPdf(await gerarFolhaCampoPdf(d))
      const t = corrido(texto)
      // A coluna das substituições com o nível sugerido de cada ponto e os pesos que completam por cima
      expect(t).toMatch(/Substi- .{0,150}tuições .{0,150}sugeridas/)
      expect(t).toMatch(/Pesos padrão .{0,150}por cima/)
      expect(t).toMatch(ultimo)
      expect(t).not.toMatch(/por baixo, .{0,120}em substituição/)
      expect(t).toContain(
        'Cargas de substituição sugeridas — 10 000 kg de pesos padrão em cada etapa (20 × 500 kg); mude no local, se precisar',
      )
      // Uma linha por etapa, com a carga de pesos de cada uma, e uma a mais
      const tabela = t.slice(t.indexOf('Cargas de substituição sugeridas'))
      const linhas = [...tabela.matchAll(/(\d)ª 10 000/g)].map((x) => Number(x[1]))
      expect(linhas).toEqual(Array.from({ length: etapas }, (_, i) => i + 1))
      expect(tabela).toMatch(new RegExp(`${etapas}ª 10 000 \\+ `))
      // Pontos e etapas na mesma página
      const pagina = paginasDe(texto).find((p) => p.includes('Cargas de substituição sugeridas'))!
      expect(pagina).toContain('ERRO DE INDICAÇÃO')
      expect(t).toMatch(/Os pesos previstos não chegam às cargas acima de 10 000 kg: a folha sugere até \d etapas/)
    }
  })

  it('rodoviária 60 t sem calibração anterior (amostra): 15 t = 1 etapa + 10 × 500 kg, como o cálculo soma', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[4]))
    const paginas = conferirPaginas(texto, 'FC-2026-00046', ['OS-2026-0534', 'Usina São Bento', '9098-552301'])
    conferirComum(texto)
    const t = corrido(texto)
    // nível × 10 000 kg + os pesos por cima = a carga (nada de "20 × 500 kg + 5000 kg por baixo")
    expect(t).toMatch(/15 000 +1 +10 × 500 kg/)
    expect(t).toMatch(/45 000 +4 +10 × 500 kg/)
    expect(t).toMatch(/60 000 +5 +20 × 500 kg/)
    expect(t).not.toContain('+ 20 000 kg')
    expect(t).not.toContain('+ 5000 kg')
    // 5 etapas sugeridas (60 000 kg) e mais uma linha
    const pagina = paginas.find((p) => p.includes('Cargas de substituição sugeridas'))!
    expect(pagina).toContain('ERRO DE INDICAÇÃO')
    expect(corrido(pagina)).toMatch(/1ª 10 000 2ª 10 000 3ª 10 000 4ª 10 000 5ª 10 000 \+/)
    expect(corrido(pagina)).not.toContain('6ª')
    // Sem conformidade pedida: a faixa do EMA em serviço só para decidir o ajuste, e o limite para marcar
    expect(t).toContain('Faixa para decidir o ajuste: carga ± EMA (Portaria Inmetro 157/2022 — em serviço, classe III)')
    expect(t).toContain('59 920 a 60 080')
    for (const c of ['Portaria 157 — em serviço', 'Portaria 157 — verificação', 'Tolerância do cliente']) expect(t).toContain(c)
  })

  it('etapas para escrever: 4 na folha em branco (mais, no verso); 2 numa rodoviária cujos pesos fecham todas as cargas', async () => {
    const branco = corrido(textoDoPdf(await pdfDe(EXEMPLOS[3])))
    const tabela = branco.slice(branco.indexOf('Cargas de substituição — só em rodoviária'))
    expect(tabela).toMatch(/1ª 2ª 3ª 4ª/)
    expect(tabela).not.toContain('5ª')
    const d = folhaRodoviariaSemHistorico()
    d.balanca = { ...d.balanca!, faixas: [{ max: 10_000, e: 5, d: 5 }] }
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
    const etapas = t.slice(t.indexOf('Cargas de substituição — quando os pesos levados não chegam'))
    expect(etapas).toMatch(/1ª 2ª/)
    expect(etapas).not.toContain('3ª')
    expect(t).not.toContain('sugeridas')
  })

  it('em branco: a tabela de pontos vai inteira, na página do título do passo, com a tabela do EMA por classe', async () => {
    const m = await montar(folhaEmBranco())
    // As 10 linhas cabem numa página: a tabela não se divide (o técnico não vira a folha na subida nem na descida)
    expect(m.extras.cortes).toEqual([])
    expect(m.extras.avisoPontos).toBeFalsy()
    const linhas = Array.from({ length: 10 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    expect(new Set(linhas).size).toBe(1)
    expect(linhas[0]).toBe(m.marcas.get('fim:passo-5')?.pagina)
    const paginas = paginasDe(textoDoPdf(m.pdf))
    const titulo = corrido(paginas[linhas[0]! - 1])
    expect(titulo).toMatch(/COMO AS CARGAS FORAM APLICADAS .*COMO ENCONTRADO .*DEPOIS DO AJUSTE/)
    // Em branco (pode ser rodoviária): com substituição, só crescente
    expect(titulo).toContain('Zere, aplique e anote a indicação estável. Com cargas de substituição: só crescente.')
    expect(titulo).toContain('RETORNO AO ZERO')
    expect(titulo).toContain('Para decidir o ajuste: EMA em serviço')
    expect(titulo).not.toMatch(/na próxima página/)
  })

  it('padrão vencido também sem plano (folha em branco ou só do cliente): VENCIDO e aviso antes de sair', async () => {
    const d = folhaEmBranco()
    d.padroes = d.padroes.map((x) => (x.identificacao === 'TH-01' ? { ...x, validade: '2026-05-10' } : x))
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
    expect(t).toMatch(/10\/05\/2026 .{0,60}VENCIDO/)
    expect(t).toContain('Resolva antes de sair: TH-01: calibração vencida em 10/05/2026.')
  })

  it('sem declaração de conformidade pedida: faixa para decidir o ajuste e o limite em caixas de marcar', async () => {
    const d = folhaPlataforma()
    d.calibracao = { ...d.calibracao!, conformidade: { ...d.calibracao!.conformidade, solicitada: false } }
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
    expect(t).toContain('Faixa para decidir o ajuste: carga ± EMA (Portaria Inmetro 157/2022 — em serviço, classe III)')
    expect(t).toContain('299,80 a 300,20')
    expect(t).toContain('Não é declaração de conformidade (o cliente não pediu)')
    expect(t).toContain('Fora da faixa para decidir o ajuste (passo 5)')
    for (const c of [
      'Portaria 157 — em serviço',
      'Portaria 157 — verificação',
      'OIML R76 — verif. inicial',
      'Tolerância do cliente',
    ])
      expect(t).toContain(c)
  })

  it('em branco: identificação e pontos para escrever, opções de unidade, classe e receptor', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[3]))
    conferirPaginas(texto, 'FC-2026-00045', ['OS', 'CLIENTE', 'BALANÇA'])
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('Folha em branco, para balança ainda não cadastrada')
    expect(t).toContain('FINALIDADE (*)')
    expect(t).toContain('banda de guarda')
    // Limite com os critérios da tela para marcar (nada de texto livre)
    for (const c of ['Portaria 157 — em serviço', 'Portaria 157 — verificação', 'OIML R76 — em serviço', 'Tolerância do cliente'])
      expect(t).toContain(c)
    // Apoios e dimensões em caixas de escrever
    expect(t).toContain('Nº DE APOIOS (CÉLULAS DE CARGA)')
    expect(t).toContain('DIMENSÕES DO PRATO / PLATAFORMA')
    expect(t).not.toMatch(/Nº de apoios \(células de carga\): _/)
    // Critério para decidir o ajuste sem balança: o EMA em serviço por classe, embaixo dos pontos
    expect(t).toContain('Para decidir o ajuste: EMA em serviço · Portaria Inmetro 157/2022')
    expect(t).toMatch(/Classe III .*±2e até 500e/)
    expect(t).toContain('Erro fora do EMA da classe')
    expect(t).toContain('cadastre a balança antes')
    expect(t).toContain('UNIDADE DA INDICAÇÃO')
    expect(t).toContain('não marcada')
    expect(t).toContain('multi-intervalo')
    expect(t).toContain('prato redondo')
    expect(t).toContain('0, Min (se marcada), 25, 50, 75 e 100 % de Max')
    expect(t).toContain('no mínimo Max/3 até 500 kg, Max/5 até 3 t e Max/10 acima')
    expect(t).toContain('Mínimo de 5 leituras')
    // Os padrões ativos aparecem para marcar; nenhum dado de cliente ou balança
    expect(t).toContain('PP500-01 a 20')
    expect(t).not.toContain('FRIGORÍFICO')
    expect(t).not.toContain('Faixa para decidir o ajuste:')
    // O endereço do cadastro do cliente, que o certificado também traz
    expect(t).toMatch(/ENDEREÇO DO CLIENTE \(SAI NO/)
    expect(t).toContain('o mesmo do')
    // Rodoviária ainda não cadastrada: substituições nos pontos e as etapas, antes e depois do ajuste
    expect(t).toMatch(/Substi- .{0,150}tuições/)
    expect(t).toContain('Cargas de substituição — só em rodoviária')
    expect(t).toMatch(/4ª/)
    // 10 linhas de pontos e 6 de excentricidade (mais, no verso), com a posição escrita no local
    expect(t).toMatch(/\b10\b/)
    expect(t).toContain('Escreva a posição de cada linha')
    expect(t).toContain('as que passarem de 6, no verso')
    expect(t).not.toContain('Frente esquerda')
    expect(t).toMatch(/retangular .*redondo/)
    // Sem plano não há pesos impressos para trocar
    expect(t).not.toContain('Pesos diferentes dos impressos')
  })
})

/** A mesma folha com `n` pontos de 0 a Max (o resto do rascunho igual) e anotações internas na chegada. */
function comPontos(dados: () => DadosFolhaCampo, n: number): DadosFolhaCampo {
  const d = dados()
  const max = Math.max(...d.balanca!.faixas.map((f) => f.max))
  const k = structuredClone(d.calibracao!)
  k.indicacao.pontos = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    carga: Math.round(((max * i) / (n - 1)) * 100) / 100,
    pecas: [],
    pecasManuais: false,
    crescente: null,
    decrescente: null,
    nivelSubstituicao: 0,
  }))
  k.anotacoesInternas = 'Procurar a Juliana na portaria 2; acesso à doca só com botina e capacete; levar crachá.'
  return { ...d, calibracao: k }
}

const VARIANTES = [6, 7, 8, 9, 10, 11, 12, 13, 14].flatMap((n) => [
  { nome: 'plataforma 300 kg', n, dados: folhaPlataforma, maxPaginas: 5 },
  // Com 9 pontos ou mais (e as anotações na chegada), a tabela inteira não cabe no fim da página 2 e vai
  // para a 3: a folha fica com 5 páginas, mas o técnico não vira a folha no meio do ensaio
  { nome: 'balcão multi-intervalo', n, dados: folhaMultiIntervalo, maxPaginas: n >= 9 ? 5 : 4 },
])

describe.runIf(temPdftotext)('montagem com 6 a 14 pontos', { timeout: 120_000 }, () => {
  it.each(VARIANTES)('$nome com $n pontos: título de cada passo uma vez por página, sem quadro solto', async (v) => {
    const m = await montar(comPontos(v.dados, v.n))
    const paginas = paginasDe(textoDoPdf(m.pdf))
    expect(paginas.length).toBeLessThanOrEqual(v.maxPaginas)
    for (const [i, p] of paginas.entries()) {
      // "9 ENCERRAMENTO…" e "9 ENCERRAMENTO… (CONTINUAÇÃO)" na mesma página: título sobrando no meio dela
      const titulos = [...p.matchAll(/^\s*(\d{1,2}) +[A-ZÇÃÉÍÓÚÂÊÔ][^\n]*?NO SISTEMA/gm)].map((x) => x[1])
      expect(
        titulos.filter((n, j) => titulos.indexOf(n) !== j),
        `página ${i + 1}`,
      ).toEqual([])
    }
    // Os títulos de continuação são exatamente as partes que abrem uma página
    const abrem = [...m.marcas.entries()]
      .filter(([id, x]) => id.startsWith('parte-') && (m.marcas.get(`fim:${id}`)?.pagina ?? 0) > x.pagina)
      .map(([id]) => id)
    expect([...m.extras.continuacoes].sort()).toEqual(abrem.sort())
    // O quadro do escritório nunca vai sozinho para a última página: as assinaturas vão junto
    expect(corrido(paginas.at(-1)!)).toMatch(/10 ASSINATURAS (ETIQUETA · CERTIFICADO Nº CC-\d{4}-\d{5} )?NO SISTEMA/)
    // A tabela de pontos cabe numa página: vai inteira, nunca dividida
    expect(m.extras.cortes).toEqual([])
    const linhas = Array.from({ length: v.n }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    expect(new Set(linhas).size, JSON.stringify(linhas)).toBe(1)
  })
})

describe.runIf(temPdftotext)(
  'correções da revisão: o que a folha leva, a identificação e o espaço da escrita',
  { timeout: 120_000 },
  () => {
    it('balcão sem calibração anterior, com todos os padrões da empresa: inteiros só os que vão a campo, os outros numa linha, 3 páginas', async () => {
      const d = folhaMultiIntervalo()
      // Como o sistema faz sem histórico: o rascunho prevê todos os padrões ativos (os 6 de exemplo)
      expect(d.padroes).toHaveLength(6)
      expect(d.calibracao!.padroesIds).toHaveLength(6)
      const m = await montar(d)
      expect(m.paginas).toBe(3)
      const paginas = paginasDe(textoDoPdf(m.pdf))
      const p1 = corrido(paginas[0])
      expect(p1).toContain('Também previstos no sistema, mas o plano não usa: BR-01 · JP-05 · PP500-01 a 20.')
      expect(p1).toContain('Levou algum? Anote na linha em branco.')
      // Nas linhas da tabela, só os que vão a campo: o jogo de pesos, os 20 kg e o termo-higrômetro
      for (const x of ['JP-01', 'PP20-01 a 15', 'TH-01', 'levar']) expect(p1).toContain(x)
      for (const x of ['Pesos padrão de 500 kg', 'Barômetro', 'Pesos padrão de 5 kg e 10 kg']) expect(p1).not.toContain(x)
      // O instrumento do ambiente previsto é o termo-higrômetro (o barômetro é opcional)
      expect(corrido(paginas.join(' '))).toMatch(/previsto: TH-01(?!, BR-01)/)
      // A última página não fica só com as assinaturas
      expect(corrido(paginas[2])).toMatch(/ENCERRAMENTO: AMBIENTE NO FIM E CONCLUSÃO|OBSERVAÇÕES/)
    })

    it('padrão vencido que o plano não usa: "(vencido)" na linha dos outros, sem "resolva antes de sair"', async () => {
      const d = folhaMultiIntervalo()
      d.padroes = d.padroes.map((p) => (p.identificacao === 'PP500-01 a 20' ? { ...p, validade: '2026-01-10' } : p))
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
      expect(t).toContain('PP500-01 a 20 (vencido)')
      expect(t).not.toContain('PP500-01 a 20: calibração vencida')
    })

    it('validade dos padrões na data da impressão, quando a do rascunho já passou', async () => {
      const d = folhaPlataforma()
      // Rascunho de 21/10/2026, impresso em 05/11/2026; o TH-01 venceu em 30/10/2026, no meio
      d.impressoEm = '2026-11-05T12:00:00.000Z'
      d.padroes = d.padroes.map((p) => (p.identificacao === 'TH-01' ? { ...p, validade: '2026-10-30' } : p))
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
      expect(t).toMatch(/30\/10\/2026 .{0,80}TH-01 .{0,80}VENCIDO/)
      expect(t).toContain('Resolva antes de sair: TH-01: calibração vencida em 30/10/2026.')
      // Rascunho marcado para depois da impressão: vale a data dele
      const futura = folhaPlataforma()
      futura.padroes = futura.padroes.map((p) => (p.identificacao === 'TH-01' ? { ...p, validade: '2026-10-21' } : p))
      futura.calibracao = { ...futura.calibracao!, dataCalibracao: '2026-10-25' }
      expect(corrido(textoDoPdf(await gerarFolhaCampoPdf(futura)))).toContain('TH-01: calibração vencida em 21/10/2026.')
    })

    it('identificação no alto da página: nomes longos não passam da margem; o nº de série e a TAG saem inteiros', async () => {
      const d = folhaPlataforma()
      d.cliente = { ...d.cliente!, nome: 'Cooperativa dos Produtores de Cana-de-Açúcar do Vale do Corumbataí' }
      d.balanca = { ...d.balanca!, numeroSerie: 'SN-2019-0004471-BR-XT', identificacao: 'Balança de expedição nº 3 — doca sul' }
      const pdf = await gerarFolhaCampoPdf(d)
      const paginas = paginasDe(textoDoPdf(pdf))
      for (const p of paginas) {
        const t = corrido(p)
        expect(t).toContain('nº de série SN-2019-0004471-BR-XT · TAG Balança de expedição nº 3 — doca sul')
        expect(t).toMatch(/CLIENTE Cooperativa dos[^·]*…/)
      }
      // Nenhuma palavra passa da margem direita (12 mm), em nenhuma página
      for (const palavras of palavrasDoPdf(pdf))
        expect(Math.max(...palavras.map((w) => w.x1))).toBeLessThanOrEqual(A4.largura - 33)
    })

    it('faixa de identificação: a balança vai inteira e o cliente encurta; só uma TAG enorme encurta, nunca o nº de série', () => {
      const largura = A4.largura - 2 * 34
      const soma = (l: { os: number; cliente: number; balanca: number }) => l.os + l.cliente + l.balanca
      const curto = textosDaFaixa({
        os: 'OS-2026-0512',
        cliente: 'Frigorífico Vale do Corumbataí',
        serie: '9091-118832',
        tag: 'BAL-EXP-07',
      })
      expect(curto).toMatchObject({
        cliente: 'Frigorífico Vale do Corumbataí',
        balanca: 'nº de série 9091-118832 · TAG BAL-EXP-07',
        tamanho: 7.4,
      })
      const longo = textosDaFaixa({
        os: 'OS-2026-0512',
        cliente: 'Cooperativa Agroindustrial dos Produtores de Cana do Vale do Rio Corumbataí',
        serie: '9091-118832-AB-2026',
        tag: 'Expedição de açúcar ensacado — balança 2',
      })
      expect(longo.balanca).toBe('nº de série 9091-118832-AB-2026 · TAG Expedição de açúcar ensacado — balança 2')
      expect(longo.cliente).toMatch(/^Cooperativa Agroindustrial.*…$/)
      expect(soma(longo.larguras)).toBeLessThan(largura - 60)
      // A da revisão: TAG de 45 letras e nº de série de 21, com um cliente de 66 (a letra fica um pouco menor)
      const revisao = textosDaFaixa({
        os: 'OS-2026-0512',
        cliente: 'Cooperativa dos Produtores de Cana-de-Açúcar do Vale do Corumbataí',
        serie: 'SN-2019-0004471-BR-XT',
        tag: 'Balança de expedição nº 3 — doca de carga sul',
      })
      expect(revisao.balanca).toBe('nº de série SN-2019-0004471-BR-XT · TAG Balança de expedição nº 3 — doca de carga sul')
      expect(revisao.tamanho).toBeLessThan(7.4)
      expect(soma(revisao.larguras)).toBeLessThan(largura - 60)
      const enorme = textosDaFaixa({
        os: 'OS-2026-0512',
        cliente: 'Mercado',
        serie: 'SN-2019-0004471-BR-XT',
        tag: 'Balança de expedição número três da doca de carga sul, ao lado do galpão de açúcar ensacado',
      })
      expect(enorme.balanca).toMatch(/^nº de série SN-2019-0004471-BR-XT · TAG Balança de expedição .+…$/)
      expect(enorme.cliente).toBe('Mercado')
      expect(soma(enorme.larguras)).toBeLessThan(largura - 60)
    })

    it('caixas de escrever com pelo menos 7 mm livres embaixo do rótulo (folha em branco e técnico previsto)', async () => {
      const branco = await gerarFolhaCampoPdf(folhaEmBranco())
      const pb = palavrasDoPdf(branco)
      for (const rotulo of [
        ['RAZÃO', 'SOCIAL', '/', 'NOME'],
        ['CNPJ', '/', 'CPF'],
        ['CONTATO', 'E', 'TELEFONE'],
        ['TIPO', 'DE', 'BALANÇA'],
        ['PLATAFORMA', '(FABRICANTE,'],
        ['Nº', 'DE', 'APOIOS'],
        ['CARGA', 'MÍNIMA'],
        ['PESOS', 'NO', 'LOCAL'],
        ['TEMPERATURA'],
        ['COMO', 'FOI', 'O', 'AJUSTE'],
        ['MARCA', 'DE', 'REPARO'],
        ['CARGA', 'APLICADA'],
        ['CARGA', 'USADA'],
      ]) {
        const { mm } = livreEmbaixo(branco, pb, rotulo)
        expect(mm, rotulo.join(' ')).toBeGreaterThanOrEqual(7)
      }
      // O técnico previsto vai ao lado do rótulo: a caixa fica livre para o nome de quem executou
      const plataforma = await gerarFolhaCampoPdf(folhaPlataforma())
      expect(corrido(textoDoPdf(plataforma))).toMatch(/TÉCNICO QUE EXECUTOU ● previsto: Carlos Eduardo Lima/)
      expect(livreEmbaixo(plataforma, palavrasDoPdf(plataforma), ['TÉCNICO', 'QUE', 'EXECUTOU']).mm).toBeGreaterThanOrEqual(7)
    })

    it('carga da excentricidade e da repetibilidade sem a regra dentro da caixa: a regra vai na instrução', async () => {
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(folhaEmBranco())))
      expect(t).toContain(
        'Zere vazia e coloque a carga (no mínimo Max/3 até 500 kg, Max/5 até 3 t e Max/10 acima) em cada posição',
      )
      expect(t).toMatch(/CARGA USADA PESOS OU CARGA USADA HORA/)
      expect(t).not.toContain('cerca de Max/2')
    })

    it('tolerância do cliente pedida mas ainda não informada: faixa do EMA em serviço, sem "balança sem classe" nem "0 kg"', async () => {
      const d = folhaPlataforma()
      d.calibracao = {
        ...d.calibracao!,
        conformidade: { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0, regra: 'SIMPLES' },
      }
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
      expect(t).toContain('299,80 a 300,20')
      expect(t).toContain(
        'Faixa para decidir o ajuste: carga ± EMA (Portaria Inmetro 157/2022 — em serviço, classe III); fora dela, proponha o ajuste. A tolerância do cliente ainda não foi informada: pergunte e anote no passo 9.',
      )
      expect(t).toContain('Fora da faixa para decidir o ajuste (passo 5)')
      expect(t).not.toContain('balança sem classe')
      expect(t).toContain('ainda não informada: pergunte')
      expect(t).not.toMatch(/TOLERÂNCIA DO CLIENTE \(±\)[^A-Z]{0,30}0 kg/)
      // Sem classe: a decisão fica pela tolerância, quando ela for informada
      const semClasse = { ...d, balanca: { ...d.balanca!, classe: '' as const } }
      const t2 = corrido(textoDoPdf(await gerarFolhaCampoPdf(semClasse)))
      expect(t2).toContain('Fora da tolerância do cliente (anote-a no passo 9) ou a pedido dele')
      expect(t2).not.toContain('balança sem classe')
    })

    it('escritório: a folha digitalizada vai para a pasta da OS (o sistema não guarda anexos da calibração)', async () => {
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(folhaPlataforma())))
      expect(t).toMatch(/ESCRITÓRIO .*digitalizada na pasta da OS/)
      expect(t).not.toMatch(/anexad/)
    })
  },
)

/** Os 10 títulos de passo no texto da folha (nenhum passo pode sumir). */
const TITULOS_PASSOS = [
  'ANTES DE SAIR: PADRÕES',
  'CHEGADA AO CLIENTE',
  'IDENTIFICAÇÃO DA BALANÇA',
  'VERIFICAÇÃO ANTES DE CALIBRAR',
  'ERRO DE INDICAÇÃO',
  'AJUSTE E REPARO',
  'REPETIBILIDADE',
  'EXCENTRICIDADE',
  'ENCERRAMENTO: AMBIENTE NO FIM',
  'ASSINATURAS',
]

describe.runIf(temPdftotext)('nada some do PDF (bloco maior que a página)', { timeout: 180_000 }, () => {
  it('rodoviária 80 t com 10 × 500 kg: 15 etapas sugeridas; os pontos e as etapas saem (as etapas, em outra parte do passo)', async () => {
    const d = folhaRodoviariaSemHistorico()
    d.balanca = { ...d.balanca!, faixas: [{ max: 80_000, e: 20, d: 20 }] }
    d.padroes = d.padroes.map((p) => (p.tipo === 'PESOS' ? { ...p, pesos: p.pesos.slice(0, 10) } : p))
    const m = await montar(d)
    expect(m.faltando).toEqual([])
    const t = corrido(textoDoPdf(m.pdf))
    for (const x of TITULOS_PASSOS) expect(t).toContain(x)
    expect(t).toContain('Cargas de substituição sugeridas — 5000 kg de pesos padrão em cada etapa')
    expect(t).toMatch(/15ª 5000/)
    expect(t).toContain('RETORNO AO ZERO')
  })

  it('rascunho de rodoviária com 12 pontos e 6 etapas: o erro de indicação sai inteiro', async () => {
    const d = folhaRodoviaria()
    const k = structuredClone(d.calibracao!)
    k.indicacao.pontos = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      carga: i * 5_000,
      pecas: [],
      pecasManuais: false,
      crescente: null,
      decrescente: null,
      nivelSubstituicao: Math.max(0, Math.ceil(i / 2) - 1),
    }))
    k.indicacao.substituicao.etapas = Array.from({ length: 6 }, () => ({ leituraPadroes: null, leituraSubstituicao: null }))
    d.calibracao = k
    const m = await montar(d)
    expect(m.faltando).toEqual([])
    const t = corrido(textoDoPdf(m.pdf))
    for (const x of TITULOS_PASSOS) expect(t).toContain(x)
    expect(t).toMatch(/55 000 +5 /)
    expect(t).toMatch(/6ª 10 000/)
  })

  /** Os 6 padrões ativos do uso real (pasta de dados nova): 2 jogos de pesos com a classe na descrição, 2 termo-higrômetros e 2 barômetros. */
  function padroesDoUso(): Padrao[] {
    const base = padroesDaEmpresa()
    const [pesos, th, br] = (['pad-jp01', 'pad-th01', 'pad-br01'] as const).map((id) => base.find((p) => p.id === id)!)
    return [
      { ...br, id: 'u-br01', identificacao: 'BR-01', descricao: 'Barômetro digital', certificado: 'B-889/2026' },
      { ...br, id: 'u-br02', identificacao: 'BR-02', descricao: 'Barômetro 2', certificado: 'B-2/2026' },
      {
        ...pesos,
        id: 'u-jp01',
        identificacao: 'JP-01',
        descricao: 'Jogo de pesos 20 kg (15 peças) classe M1',
        certificado: 'M-09999/2027',
      },
      {
        ...pesos,
        id: 'u-jp02',
        identificacao: 'JP-02',
        descricao: 'Jogo de pesos 1 kg a 10 kg classe M1',
        certificado: 'M-07777/2026',
      },
      { ...th, id: 'u-th01', identificacao: 'TH-01', descricao: 'Termo-higrômetro digital', certificado: 'T-1123/2026' },
      { ...th, id: 'u-th02', identificacao: 'TH-02', descricao: 'Termo-higrômetro 2', certificado: 'T-2/2026' },
    ]
  }

  it('em branco com os 6 padrões do uso real: 4 páginas, um padrão por linha, sem repetir a classe', async () => {
    const d = { ...folhaEmBranco(), padroes: padroesDoUso() }
    const m = await montar(d)
    expect(m.paginas).toBe(4)
    expect(m.faltando).toEqual([])
    const texto = textoDoPdf(m.pdf)
    const linhas = paginasDe(texto)[0].split('\n')
    // Cada padrão numa linha só do texto, com o certificado e a próxima calibração na mesma linha; a descrição
    // inteira (a classe já escrita nela não se repete)
    for (const [id, resto] of [
      ['JP-01', /JP-01 +Jogo de pesos 20 kg \(15 peças\) classe M1 +M-09999\/2027 +\d{2}\/\d{2}\/\d{4}$/],
      ['JP-02', /JP-02 +Jogo de pesos 1 kg a 10 kg classe M1 +M-07777\/2026 +\d{2}\/\d{2}\/\d{4}$/],
      ['BR-02', /BR-02 +Barômetro 2 +— +B-2\/2026 +\d{2}\/\d{2}\/\d{4}$/],
    ] as const) {
      const linha = linhas.find((l) => l.includes(id))
      expect(linha, id).toMatch(resto)
    }
    expect(corrido(texto)).not.toMatch(/classe M1 · M1/)
    // As observações e as assinaturas ficam na página 4 (nada de uma 5ª só com elas)
    const ultima = corrido(paginasDe(texto).at(-1)!)
    expect(ultima).toMatch(/OBSERVAÇÕES \(SAEM NO CERTIFICADO\) .* 10 ASSINATURAS/)
  })

  it('amostra em branco com 8 padrões: 4 páginas, um padrão por linha, descrição inteira, sem repetir a classe', async () => {
    const d = folhaEmBrancoOitoPadroes()
    expect(d.padroes.filter((p) => p.ativo)).toHaveLength(8)
    const m = await montar(d)
    expect(m.paginas).toBeLessThanOrEqual(4)
    expect(m.faltando).toEqual([])
    const texto = textoDoPdf(m.pdf)
    const linhas = paginasDe(texto)[0].split('\n')
    // Todos os padrões na página 1, cada um numa linha do texto (identificação, descrição, certificado e data)
    for (const p of d.padroes) {
      const linha = linhas.filter((l) => new RegExp(`^\\s*${p.identificacao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `).test(l))
      expect(linha, p.identificacao).toHaveLength(1)
      expect(linha[0], p.identificacao).toMatch(new RegExp(`${p.certificado.replace(/[/]/g, '\\/')} +\\d{2}\\/\\d{2}\\/\\d{4}$`))
    }
    // As descrições longas cabem inteiras (sem "…"); a classe escrita na descrição não se repete
    const t = corrido(texto)
    expect(t).toMatch(/TH-02 Termo-higrômetro digital com sonda externa —/)
    expect(t).toMatch(/JP-02 Jogo de pesos 20 kg \(15 peças\) classe M1 CAL-12988\/2026/)
    expect(t).not.toMatch(/classe M1 · M1/)
    expect(paginasDe(texto)[0]).not.toContain('…')
  })

  it('em branco: a descrição é a coluna larga e "peças usadas", a estreita (escrita à mão, curta)', () => {
    const [tabela] = nosQue((definicaoFolhaCampo(folhaEmBrancoOitoPadroes()) as { content: unknown }).content, (x) =>
      JSON.stringify((x.table as { body?: unknown[][] } | undefined)?.body?.[0] ?? '').includes('"Peças usadas"'),
    )
    const larguras = (tabela.table as { widths: Array<number | string> }).widths
    expect(larguras[3]).toBe('*')
    const fixas = larguras.filter((l): l is number => typeof l === 'number')
    // Peças com ≈ 21 mm; a descrição, com o resto da página (186 mm, menos os respiros e os fios), ≈ 57 mm
    expect(larguras[4]).toBeLessThanOrEqual(62)
    const descricao = A4.largura - 2 * 34 - fixas.reduce((a, b) => a + b, 0) - (7 * 7 + 2 * 0.8 + 6 * 0.5)
    expect((descricao * 25.4) / 72).toBeGreaterThan(55)
  })

  it.each([6, 8, 10])('em branco com %i padrões: no máximo 4 páginas, e a tabela dos pontos não se divide', async (n) => {
    const base = folhaEmBrancoOitoPadroes().padroes
    const d = {
      ...folhaEmBranco(),
      padroes: Array.from({ length: n }, (_, i): Padrao => ({
        ...base[i % base.length],
        id: `pad-${i}`,
        identificacao: `${base[i % base.length].identificacao}${i >= base.length ? '-B' : ''}`,
      })),
    }
    const m = await montar(d)
    expect(m.paginas).toBeLessThanOrEqual(4)
    expect(m.faltando).toEqual([])
    expect(m.extras.cortes).toEqual([])
    const linhas = Array.from({ length: 10 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    expect(new Set(linhas).size).toBe(1)
    expect(linhas[0]).toBe(m.marcas.get('fim:passo-5')?.pagina)
    // O EMA por classe, logo depois dos pontos (na mesma página ou, sem caber, no alto da seguinte, com o título)
    const ema = m.marcas.get('fim:parte-5-8')!.pagina
    expect([linhas[0], linhas[0]! + 1]).toContain(ema)
    if (ema > linhas[0]!)
      expect(corrido(paginasDe(textoDoPdf(m.pdf))[ema - 1])).toMatch(
        /5 ERRO DE INDICAÇÃO \(CONTINUAÇÃO\) .*Para decidir o ajuste: EMA em serviço/,
      )
  })

  it('descrição do padrão: a classe não se repete; sem plano, numa linha só (o que sobra, com "…")', () => {
    const p = (descricao: string, classe: string, tipo: Padrao['tipo'] = 'PESOS') =>
      ({ ...padroesDaEmpresa()[1], descricao, classe, tipo }) as Padrao
    const texto = (no: { text?: unknown }) => (no.text as Array<{ text: string }>).map((t) => t.text).join('')
    // Com o plano (largura livre): inteira, com a classe só se ela ainda não estiver escrita
    expect(texto(descricaoPadraoNaFolha(p('Jogo de pesos 20 kg (15 peças) classe M1', 'M1')))).toBe(
      'Jogo de pesos 20 kg (15 peças) classe M1',
    )
    expect(texto(descricaoPadraoNaFolha(p('Pesos padrão de 20 kg', 'M1')))).toBe('Pesos padrão de 20 kg · M1')
    expect(texto(descricaoPadraoNaFolha(p('Pesos M1 de 20 kg', 'M1')))).toBe('Pesos M1 de 20 kg')
    // "AM1" não é a classe M1
    expect(texto(descricaoPadraoNaFolha(p('Kit AM1', 'M1')))).toBe('Kit AM1 · M1')
    // Sem descrição, o tipo (nunca o código interno)
    expect(texto(descricaoPadraoNaFolha(p('', '', 'BAROMETRO')))).toBe('Barômetro')
    // Numa largura curta: a classe escrita na descrição vai para o fim, e o resto encurta com "…"
    expect(texto(descricaoPadraoNaFolha(p('Jogo de pesos 20 kg (15 peças) classe M1', 'M1'), 140))).toBe(
      'Jogo de pesos 20 kg (15 peças) · M1',
    )
    const longa = texto(
      descricaoPadraoNaFolha(p('Termo-higrômetro digital com sonda externa e registrador', '', 'TERMOHIGROMETRO'), 140),
    )
    expect(longa).toMatch(/^Termo-higrômetro digital .*…$/)
    expect(longa.length).toBeLessThan(45)
  })

  it('folha em branco de uma empresa com 36 padrões: a tabela dos padrões se divide, com o cabeçalho de novo', async () => {
    const d = folhaEmBranco()
    const base = padroesDaEmpresa()
    d.padroes = Array.from({ length: 36 }, (_, i): Padrao => ({
      ...base[i % base.length],
      id: `pad-${i}`,
      identificacao: `PD-${String(i + 1).padStart(2, '0')}`,
    }))
    const m = await montar(d)
    expect(m.faltando).toEqual([])
    const texto = textoDoPdf(m.pdf)
    const t = corrido(texto)
    for (const x of TITULOS_PASSOS) expect(t).toContain(x)
    for (let i = 1; i <= 36; i++) expect(t).toContain(`PD-${String(i).padStart(2, '0')}`)
    // O cabeçalho da tabela na página seguinte também
    expect(paginasDe(texto).filter((p) => corrido(p).includes('Levado Usado Identificação')).length).toBe(2)
  })

  it('bloco que não cabe em página nenhuma (150 leituras de repetibilidade): monta de novo sem os blocos inteiros', async () => {
    const d = folhaPlataforma()
    d.calibracao = { ...d.calibracao!, repetibilidade: [{ id: 'r1', carga: 150, leituras: Array(150).fill(null) }] }
    const m = await montar(d)
    expect(m.extras.semBlocos).toBe(true)
    expect(m.faltando).toEqual([])
    const t = corrido(textoDoPdf(m.pdf))
    for (const x of TITULOS_PASSOS) expect(t).toContain(x)
    expect(t).toContain('Faça as 150 leituras previstas')
  })
})

/** Nós da definição (pdfmake) que satisfazem `teste`, em qualquer profundidade. */
function nosQue(no: unknown, teste: (x: Record<string, unknown>) => boolean): Array<Record<string, unknown>> {
  const achados: Array<Record<string, unknown>> = []
  const visitar = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(visitar)
    else if (x && typeof x === 'object') {
      if (teste(x as Record<string, unknown>)) achados.push(x as Record<string, unknown>)
      Object.values(x).forEach(visitar)
    }
  }
  visitar(no)
  return achados
}

/** A tabela (o `table.body`) cuja primeira linha tem uma célula com o texto `titulo`. */
function tabelaComTitulo(d: DadosFolhaCampo, titulo: string): unknown[][] {
  const [no] = nosQue((definicaoFolhaCampo(d) as { content: unknown }).content, (x) => {
    const t = x.table as { body?: unknown[][] } | undefined
    return !!t?.body?.[0] && JSON.stringify(t.body[0]).includes(`"${titulo}"`)
  })
  return (no.table as { body: unknown[][] }).body
}

describe.runIf(temPdftotext)(
  'correções da 3ª revisão: método por ensaio, tabela inteira e peças usadas',
  { timeout: 180_000 },
  () => {
    it('o método e a hora do início, uma linha para "como encontrado" e outra para "depois do ajuste"', async () => {
      const d = folhaPlataforma()
      // O técnico conferiu só subindo; depois do ajuste, sobe e desce
      const k = structuredClone(d.calibracao!)
      k.ajuste = { ...k.ajuste, realizado: 'INTERNO' }
      k.comoEncontrado = { ...structuredClone(k.indicacao), metodo: 'CONTINUO' }
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf({ ...d, calibracao: k })))
      expect(t).toMatch(
        /COMO AS CARGAS FORAM APLICADAS HORA DO INÍCIO COMO ENCONTRADO Crescente e decrescente Crescente com descarga Crescente contínuo PREVISTO Decrescente ____:____ DEPOIS DO AJUSTE Crescente e decrescente PREVISTO Crescente com descarga Crescente contínuo Decrescente ____:____/,
      )
      // Cada grupo de colunas segue o seu método: no "como encontrado" (só subindo), a ↓ sai "só se descer"
      const cabecalho = t.slice(t.indexOf('COMO ENCONTRADO DEPOIS DO AJUSTE · SÓ SE AJUSTOU'))
      expect(cabecalho).toMatch(/^COMO ENCONTRADO DEPOIS DO AJUSTE · SÓ SE AJUSTOU .{0,120}só se descer/)
      expect(cabecalho.slice(0, 200).match(/só se descer/g)).toHaveLength(1)
      // O retorno ao zero tem uma célula por coluna (no sistema, um campo em cada aba)
      expect(t).toMatch(/RETORNO AO ZERO indicação depois de retirar toda a carga/)
    })

    it('rodoviária sem histórico: com substituição, "crescente contínuo" previsto nos dois ensaios (sem descer)', async () => {
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(folhaRodoviariaSemHistorico())))
      expect(t).toContain('aplique as cargas na ordem da tabela (vá somando os pesos, sem descarregar)')
      expect(t).not.toContain('suba até a maior')
      expect(t.match(/Crescente contínuo PREVISTO/g)).toHaveLength(2)
      expect(t).not.toMatch(/Crescente e decrescente PREVISTO/)
      // A instrução diz: com substituição, só crescente; a nota das etapas diz por quê
      expect(t).toContain(
        'Zere vazia e aplique as cargas na ordem da tabela (vá somando os pesos, sem descarregar); anote a indicação estável. Com cargas de substituição: só crescente.',
      )
      expect(t).toContain('Só crescente: para descer, seria preciso tirar o material.')
    })

    it('sem substituição na folha (balança que não é rodoviária): a instrução não fala dela', async () => {
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(folhaPlataforma())))
      expect(t).toContain('(suba até a maior ↑ e desça sem descarregar ↓); anote a indicação estável. COMO AS CARGAS')
      expect(t).not.toContain('Com cargas de substituição')
    })

    it.each([
      { nome: 'rodoviária 80 t', dados: folhaRodoviaria },
      { nome: 'rodoviária sem histórico', dados: folhaRodoviariaSemHistorico },
    ])('$nome: pontos e etapas de substituição, juntos, na página do título do passo 5 (4 páginas)', async ({ dados }) => {
      const m = await montar(dados())
      expect(m.paginas).toBeLessThanOrEqual(4)
      expect(m.extras.avisoPontos).toBeFalsy()
      const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
      const i = paginas.findIndex((p) => p.includes('5 ERRO DE INDICAÇÃO NO SISTEMA'))
      expect(paginas[i]).toMatch(/COMO AS CARGAS FORAM APLICADAS .* Cargas de substituição: em cada etapa/)
      expect(paginas[i]).toContain('RETORNO AO ZERO')
      expect(paginas[i]).toMatch(/Cargas de substituição( sugeridas)? — 10 000 kg de pesos padrão em cada etapa/)
      expect(paginas[i]).not.toMatch(/na próxima página/)
    })

    it('rodoviária com anotações longas na chegada: as tabelas passam juntas para a página seguinte, com o aviso', async () => {
      const d = folhaRodoviariaSemHistorico()
      d.calibracao = {
        ...d.calibracao!,
        anotacoesInternas:
          'Procurar a Juliana na portaria 2; acesso à doca só com botina, capacete e protetor auricular. Integração de segurança obrigatória (30 min) antes de entrar. Não estacionar na doca 1. Levar nota fiscal dos pesos para a portaria. ' +
          'Ligar para o Eng. Ricardo 30 min antes de chegar; a balança fica desligada aos domingos e o caminhão de lastro precisa ser agendado com dois dias de antecedência na logística.',
      }
      const m = await montar(d)
      expect(m.extras.avisoPontos).toBe(true)
      const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
      const i = paginas.findIndex((p) => p.includes('5 ERRO DE INDICAÇÃO NO SISTEMA'))
      expect(paginas[i]).toMatch(/COMO AS CARGAS FORAM APLICADAS .* Cargas de substituição: em cada etapa/)
      expect(paginas[i]).toContain('Tabelas na próxima página: os pontos e as etapas de substituição, juntos.')
      const seguinte = paginas[i + 1]
      expect(seguinte).toMatch(/5 ERRO DE INDICAÇÃO \(CONTINUAÇÃO\) NO SISTEMA 6 · Erro de indicação Nº Carga Substi-/)
      expect(seguinte).toContain('RETORNO AO ZERO')
      expect(seguinte).toMatch(/Cargas de substituição sugeridas — 10 000 kg de pesos padrão em cada etapa/)
      // O "como fazer" das etapas não se repete na página das tabelas
      expect(seguinte).not.toContain('em cada etapa, anote a indicação')
    })

    it('tabela que cabe na página: o passo inteiro, sem aviso de continuação', async () => {
      const m = await montar(folhaPlataforma())
      expect(m.extras.avisoPontos).toBeFalsy()
      const t = corrido(textoDoPdf(m.pdf))
      expect(t).not.toMatch(/na próxima página/)
      const pontos = Array.from({ length: 7 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
      // A marca do fim do título do passo (a do começo fica na página de antes, se ele passou para a seguinte)
      expect(pontos.every((p) => p === m.marcas.get('fim:passo-5')?.pagina)).toBe(true)
    })

    it('tabela longa (que não cabe numa página): continua se dividindo, com o título e o cabeçalho de novo', async () => {
      // Com a folha enxuta, até ≈ 30 linhas cabem numa página: 36 pontos não cabem
      const m = await montar(comPontos(folhaPlataforma, 36))
      expect(m.faltando).toEqual([])
      expect(m.extras.cortes.length).toBeGreaterThan(0)
      const t = corrido(textoDoPdf(m.pdf))
      expect(t).toContain('5 ERRO DE INDICAÇÃO (CONTINUAÇÃO)')
      expect(t).toContain('RETORNO AO ZERO')
    })

    it.each([
      { nome: 'em branco', dados: folhaEmBranco },
      { nome: 'só do cliente', dados: (): DadosFolhaCampo => ({ ...folhaPlataforma(), balanca: null, calibracao: null }) },
    ])('$nome: "peças usadas" em caixa branca para escrever (jogos de pesos); "—" nos instrumentos', ({ dados }) => {
      const d = dados()
      const corpo = tabelaComTitulo(d, 'Peças usadas').slice(1)
      const pecas = corpo.map((l) => l[4] as { fillColor?: string; stack?: Array<{ text?: unknown }> })
      const tipos = [...d.padroes.filter((p) => p.ativo && p.tipo !== 'OUTRO').map((p) => p.tipo), 'linha em branco']
      expect(pecas).toHaveLength(tipos.length)
      expect(tipos).toContain('TERMOHIGROMETRO')
      pecas.forEach((c, i) => {
        if (tipos[i] === 'PESOS' || tipos[i] === 'linha em branco') {
          expect(c.fillColor, tipos[i]).toBe('#FFFFFF')
          expect(JSON.stringify(c.stack ?? ''), tipos[i]).not.toContain('—')
        } else {
          expect(c.fillColor, tipos[i]).not.toBe('#FFFFFF')
          expect(JSON.stringify(c.stack)).toContain('—')
        }
      })
      // Com plano, a coluna é a das peças previstas (do sistema, em cinza)
      const comPlano = tabelaComTitulo(folhaPlataforma(), 'Separar (peças previstas)').slice(1, 2)
      expect((comPlano[0][4] as { fillColor?: string }).fillColor).not.toBe('#FFFFFF')
    })
  },
)

/** Altura útil da página (pt), entre a faixa de identificação e o rodapé (as margens da folha). */
const TOPO_UTIL = TOPO_CABECALHO + MODULO + 27
const PE_UTIL = A4.altura - Math.ceil(A4.altura - BASE_RODAPE + 30)

/** Branco no pé de cada página (mm): do fim do conteúdo até o rodapé, medido na imagem (pdftoppm). */
function brancoNoPe(pdf: Buffer, paginas: number): number[] {
  return Array.from({ length: paginas }, (_, i) => {
    const img = imagemDaPagina(pdf, i + 1)
    const [x0, x1] = [Math.ceil(34 * img.px), Math.floor((A4.largura - 34) * img.px)]
    let y = Math.floor(PE_UTIL * img.px) - 1
    const escura = (yy: number) => {
      for (let x = x0; x <= x1; x++) if (img.escuro(x, yy)) return true
      return false
    }
    while (y > TOPO_UTIL * img.px && !escura(y)) y--
    return ((PE_UTIL - y / img.px) * 25.4) / 72
  })
}
const MEIA_PAGINA_MM = ((PE_UTIL - TOPO_UTIL) * 25.4) / 72 / 2

/** Plataforma com razão social, endereço, modelo, local e portaria longos e 3 linhas de anotações. */
function plataformaComTextosLongos(): DadosFolhaCampo {
  const d = folhaPlataforma()
  d.cliente = {
    ...d.cliente!,
    razaoSocial: 'COOPERATIVA AGROINDUSTRIAL DOS PRODUTORES RURAIS DO VALE DO RIO CORUMBATAÍ E REGIÃO LTDA',
    contato: 'Maria Aparecida dos Santos Oliveira (Coordenadora de Qualidade e Metrologia)',
    telefone: '(19) 99876-5432',
  }
  d.balanca = {
    ...d.balanca!,
    modelo: 'IND780 Harsh Q.iMPACT Stainless Panel Mount',
    identificacao: 'BAL-EXP-07 / PATRIMÔNIO 004512 / LINHA 3',
    localInstalacao: 'Expedição — doca 2, ao lado da câmara fria 4 (antiga pesagem de carcaças)',
    portariaAprovacao: 'Portaria Inmetro/Dimel nº 0236/2009 e Portaria Inmetro/Dimel nº 0412/2015 (indicador)',
  }
  d.calibracao = {
    ...d.calibracao!,
    localEndereco:
      'Rodovia Washington Luís (SP-310), km 182,5, Distrito Industrial Norte, galpão 14, portaria 3 – Rio Claro/SP – CEP 13505-600',
    anotacoesInternas:
      'Procurar a Juliana na portaria 2; acesso à doca só com botina, capacete e protetor auricular. Integração de segurança obrigatória (30 min) antes de entrar. Não estacionar na doca 1. Levar nota fiscal dos pesos para a portaria.',
  }
  return d
}

describe.runIf(temPdftotext)('correções da 4ª revisão: páginas sem grandes vazios', { timeout: 180_000 }, () => {
  it.each(EXEMPLOS)('$nome: nenhuma página com mais da metade em branco', async (e) => {
    const m = await montar(e.dados())
    const brancos = brancoNoPe(m.pdf, m.paginas)
    for (const [i, mm] of brancos.entries()) expect(mm, `página ${i + 1}`).toBeLessThan(MEIA_PAGINA_MM)
  })

  it('rodoviária 80 t: 3 páginas; pontos e etapas (juntos) na p.2, com o título do passo 5', async () => {
    const m = await montar(folhaRodoviaria())
    expect(m.paginas).toBe(3)
    const tabelas = m.marcas.get(`fim:${'parte-5-1'}`)!
    expect(tabelas.pagina).toBe(2)
    expect(m.marcas.get('fim:passo-5')?.pagina).toBe(2)
  })

  it('textos longos: a tabela dos pontos vai inteira; a última página não fica só com as assinaturas', async () => {
    const m = await montar(plataformaComTextosLongos())
    expect(m.extras.cortes).toEqual([])
    const linhas = Array.from({ length: 7 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    expect(new Set(linhas).size).toBe(1)
    const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
    expect(paginas).toHaveLength(m.paginas)
    expect(paginas.at(-1)).toMatch(/OBSERVAÇÕES \(SAEM NO CERTIFICADO\) .* OPINIÕES .* 10 ASSINATURAS/)
    for (const [i, mm] of brancoNoPe(m.pdf, m.paginas).entries()) expect(mm, `página ${i + 1}`).toBeLessThan(MEIA_PAGINA_MM)
  })

  it.each(EXEMPLOS)(
    '$nome: observações, assinaturas e escritório num bloco só (as assinaturas nunca ficam sozinhas)',
    async (e) => {
      const doc = definicaoFolhaCampo(e.dados()) as { content: Array<{ id?: string; unbreakable?: boolean }> }
      const bloco = doc.content.find((x) => x.id === 'parte-observacoes')!
      expect(bloco.unbreakable).toBe(true)
      const json = JSON.stringify(bloco)
      for (const x of ['OBSERVAÇÕES (SAEM NO CERTIFICADO)', 'OPINIÕES E INTERPRETAÇÕES', 'ASSINATURAS', 'ESCRITÓRIO'])
        expect(json).toContain(x)
      // O passo 10 não é mais um bloco à parte, depois do 9
      expect(doc.content.some((x) => x.id === 'passo-10')).toBe(false)
      const m = await montar(e.dados())
      const ultima = corrido(paginasDe(textoDoPdf(m.pdf)).at(-1)!)
      expect(ultima).toMatch(/OBSERVAÇÕES \(SAEM NO CERTIFICADO\) .* OPINIÕES .* 10 ASSINATURAS .* ESCRITÓRIO/)
    },
  )

  it('as observações ganham no máximo 4 linhas no espaço que sobra: a caixa não estica até o pé da página', async () => {
    for (const e of EXEMPLOS) expect((await montar(e.dados())).extras.linhas, e.nome).toBeLessThanOrEqual(4)
    // Na plataforma sobra espaço na última página: 4 linhas a mais, e não mais que isso
    expect((await montar(folhaPlataforma())).extras.linhas).toBe(4)
  })

  it('fim da folha enxuto: o escritório numa linha, as duas assinaturas numa linha, sem conformidade pedida o pedido, o limite e a regra numa linha', async () => {
    const doc = definicaoFolhaCampo(folhaRodoviariaSemHistorico()) as { content: unknown[] }
    // Tabelas pelo rótulo: a do escritório e a das assinaturas têm uma linha só
    const tabelas: Array<{ body: unknown[][] }> = []
    const visitar = (no: unknown) => {
      if (Array.isArray(no)) no.forEach(visitar)
      else if (no && typeof no === 'object') {
        const x = no as { table?: { body: unknown[][] } }
        if (x.table) tabelas.push(x.table)
        Object.values(no).forEach(visitar)
      }
    }
    visitar(doc.content)
    const tabela = (texto: string) =>
      tabelas
        .filter((t) => JSON.stringify(t.body[0]).includes(texto))
        .sort((a, b) => JSON.stringify(a).length - JSON.stringify(b).length)[0]
    expect(tabela('ESCRITÓRIO').body).toHaveLength(1)
    expect(tabela('TÉCNICO QUE EXECUTOU — NOME E ASSINATURA').body).toHaveLength(1)
    expect(tabela('O CLIENTE PEDIU CONFORMIDADE?').body).toHaveLength(1)
    const texto = textoDoPdf(await gerarFolhaCampoPdf(folhaRodoviariaSemHistorico()))
    const linhas = texto.split('\n')
    expect(linhas.find((l) => l.includes('O CLIENTE PEDIU CONFORMIDADE?'))).toMatch(
      /LIMITE \(ERRO MÁXIMO ADMISSÍVEL\) +REGRA DE DECISÃO/,
    )
    expect(linhas.find((l) => l.includes('Portaria 157 — em serviço'))).toMatch(
      /OIML R76 — em serviço +Tolerância do cliente +banda de guarda/,
    )
    expect(corrido(texto)).toMatch(/± _+ kg/)
  })
})

describe('nº do certificado reservado na impressão', { timeout: 60_000 }, () => {
  type Doc = { header: (p: number, t: number) => unknown; content: unknown; info: { keywords: string } }
  const doc = (d: DadosFolhaCampo) => definicaoFolhaCampo(d) as unknown as Doc

  it('no alto de toda página, ao lado do nº da folha; a dica da etiqueta só na página 1', () => {
    const d = folhaPlataforma()
    expect(d.numeroCertificado).toBe('CC-2026-00125')
    const cab = (p: number) => JSON.stringify(doc(d).header(p, 3))
    for (const p of [1, 2, 3]) {
      expect(cab(p)).toContain('"CERTIFICADO Nº"')
      expect(cab(p)).toContain('"CC-2026-00125"')
      expect(cab(p)).toContain('"FC-2026-00042"')
      // O nº do certificado vem antes do nº da folha (à esquerda dele), no mesmo tamanho
      expect(cab(p).indexOf('CC-2026-00125')).toBeLessThan(cab(p).indexOf('FC-2026-00042'))
    }
    expect(cab(1)).toContain(DICA_ETIQUETA)
    expect(cab(2)).not.toContain(DICA_ETIQUETA)
    expect(DICA_ETIQUETA).toBe('Vai na etiqueta (passo 10)')
    expect(doc(d).info.keywords).toContain('certificado CC-2026-00125')
  })

  it('sem nº (folha de antes desta versão, ou de uma revisão), nada: nem no cabeçalho, nem a nota da etiqueta; o escritório escreve o nº', () => {
    for (const d of [
      { ...folhaEmBranco(), numeroCertificado: undefined },
      { ...folhaPlataforma(), numeroCertificado: undefined },
      { ...folhaPlataforma(), numeroCertificado: '   ' },
    ]) {
      const x = doc(d)
      expect(JSON.stringify(x.header(1, 3))).not.toContain('CERTIFICADO Nº')
      expect(JSON.stringify(x.header(1, 3))).not.toContain(DICA_ETIQUETA)
      const json = JSON.stringify(x.content)
      expect(json).not.toContain(AVISO_ETIQUETA)
      expect(json).not.toContain('ETIQUETA · CERTIFICADO Nº')
      expect(json).not.toContain('CC-2026-00125')
      expect(x.info.keywords).not.toContain('certificado ')
    }
  })

  it.runIf(temPdftotext)(
    'texto: o nº em toda página, ao lado do da folha; no passo 10, o nº e a nota da etiqueta numa linha; o escritório já com o nº',
    async () => {
      const m = await montar(folhaPlataforma())
      expect(m.paginas).toBe(3)
      const texto = textoDoPdf(m.pdf)
      const paginas = paginasDe(texto)
      for (const [i, p] of paginas.entries()) {
        // Na mesma linha do nº da folha, à esquerda dele
        const linha = p.split('\n').find((l) => l.includes('FC-2026-00042'))!
        expect(linha, `página ${i + 1}`).toMatch(/CC-2026-00125 +FC-2026-00042/)
        expect(corrido(p), `página ${i + 1}`).toMatch(/CERTIFICADO Nº +FOLHA DE CAMPO — CALIBRAÇÃO DE BALANÇA/)
        expect(corrido(p).includes(DICA_ETIQUETA), `página ${i + 1}`).toBe(i === 0)
      }
      // A nota inteira numa linha só, logo embaixo do título do passo 10 (com o nº), na página das assinaturas
      const ultima = paginas.at(-1)!
      const linhas = ultima.split('\n')
      const titulo = linhas.findIndex((l) => /10 +ASSINATURAS ETIQUETA · CERTIFICADO Nº CC-2026-00125 +NO SISTEMA/.test(l))
      expect(titulo).toBeGreaterThan(0)
      const nota = linhas.findIndex((l) => l.includes('Copie este nº na etiqueta de calibração'))
      expect(nota).toBeGreaterThan(titulo)
      expect(nota - titulo).toBeLessThanOrEqual(2)
      expect(linhas[nota].trim()).toBe(AVISO_ETIQUETA)
      expect(corrido(ultima).indexOf(AVISO_ETIQUETA)).toBeLessThan(corrido(ultima).indexOf('TÉCNICO QUE EXECUTOU'))
      // O escritório confere o certificado pelo nº já impresso
      expect(corrido(ultima)).toMatch(/ESCRITÓRIO .*CERTIFICADO Nº digitalizada na pasta da OS CC-2026-00125/)
    },
  )

  it('em branco (folha avulsa): também com o nº reservado, no cabeçalho de toda página e no passo 10', () => {
    for (const [d, numero] of [
      [folhaEmBranco(), 'CC-2026-00129'],
      [folhaEmBrancoOitoPadroes(), 'CC-2026-00130'],
    ] as const) {
      expect(d.numeroCertificado).toBe(numero)
      const x = doc(d)
      for (const p of [1, 2, 3, 4]) expect(JSON.stringify(x.header(p, 4))).toContain(`"${numero}"`)
      expect(JSON.stringify(x.header(1, 4))).toContain(DICA_ETIQUETA)
      expect(JSON.stringify(x.header(2, 4))).not.toContain(DICA_ETIQUETA)
      expect(JSON.stringify(x.content)).toContain(AVISO_ETIQUETA)
      expect(x.info.keywords).toContain(`certificado ${numero}`)
    }
  })

  it.runIf(temPdftotext).each([
    { nome: 'em branco', dados: folhaEmBranco, numero: 'CC-2026-00129' },
    { nome: 'em branco com 8 padrões', dados: folhaEmBrancoOitoPadroes, numero: 'CC-2026-00130' },
  ])(
    '$nome com nº: no máximo 4 páginas, o nº em toda página, a dica só na 1ª e a nota da etiqueta no passo 10',
    async ({ dados, numero }) => {
      const com = await montar(dados())
      expect(com.paginas).toBeLessThanOrEqual(4)
      expect(com.faltando).toEqual([])
      const paginas = paginasDe(textoDoPdf(com.pdf))
      expect(paginas).toHaveLength(com.paginas)
      for (const [i, p] of paginas.entries()) {
        expect(p, `página ${i + 1}`).toContain(numero)
        expect(corrido(p).includes(DICA_ETIQUETA), `página ${i + 1}`).toBe(i === 0)
      }
      const ultima = corrido(paginas.at(-1)!)
      expect(ultima).toContain(`ASSINATURAS ETIQUETA · CERTIFICADO Nº ${numero}`)
      expect(ultima).toContain(AVISO_ETIQUETA)
      expect(ultima.indexOf(AVISO_ETIQUETA)).toBeLessThan(ultima.indexOf('TÉCNICO QUE EXECUTOU'))
    },
  )

  it.runIf(temPdftotext).each([
    { nome: 'plataforma', dados: folhaPlataforma, numero: 'CC-2026-00125' },
    { nome: 'balcão multi-intervalo', dados: folhaMultiIntervalo, numero: 'CC-2026-00126' },
    { nome: 'rodoviária 80 t', dados: folhaRodoviaria, numero: 'CC-2026-00127' },
    { nome: 'rodoviária 60 t sem histórico', dados: folhaRodoviariaSemHistorico, numero: 'CC-2026-00128' },
  ])('$nome: o nº reservado não aumenta a folha (3 páginas) e sai em todas elas', async ({ dados, numero }) => {
    const d = dados()
    expect(d.numeroCertificado).toBe(numero)
    const com = await montar(d)
    const sem = await montar({ ...d, numeroCertificado: undefined })
    expect(com.paginas).toBe(sem.paginas)
    expect(com.paginas).toBeLessThanOrEqual(3)
    expect(com.faltando).toEqual([])
    const paginas = paginasDe(textoDoPdf(com.pdf))
    for (const p of paginas) expect(p).toContain(numero)
    expect(corrido(paginas.at(-1)!)).toContain(AVISO_ETIQUETA)
  })
})

describe.runIf(temPdftotext)('nº do certificado longo (outro formato de numeração)', { timeout: 60_000 }, () => {
  it('cabe no alto da página, no passo 10 e no escritório, sem passar da margem nem aumentar a folha', async () => {
    const numero = 'BC-CAL-2026-000125'
    const d = { ...folhaPlataforma(), numeroCertificado: numero }
    const m = await montar(d)
    expect(m.paginas).toBe(3)
    expect(m.faltando).toEqual([])
    const palavras = palavrasDoPdf(m.pdf)
    for (const [i, p] of palavras.entries()) {
      const w = p.find((x) => x.texto === numero)
      expect(w, `página ${i + 1}`).toBeDefined()
      expect(w!.x1, `página ${i + 1}`).toBeLessThanOrEqual(A4.largura - 34)
    }
    const ultima = corrido(paginasDe(textoDoPdf(m.pdf)).at(-1)!)
    expect(ultima).toContain(`ETIQUETA · CERTIFICADO Nº ${numero}`)
    // No escritório, inteiro numa linha (a coluna se alarga para ele)
    expect(ultima.slice(ultima.indexOf('ESCRITÓRIO'))).toContain(numero)
    const linhas = paginasDe(textoDoPdf(m.pdf)).at(-1)!.split('\n')
    // No alto da página, no título do passo 10 e no escritório: três linhas, o nº inteiro em cada uma
    expect(linhas.filter((l) => l.includes(numero))).toHaveLength(3)
  })
})

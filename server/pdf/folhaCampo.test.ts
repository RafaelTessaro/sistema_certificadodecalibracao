// Testes da folha de campo em PDF: gera as amostras (server/pdf/exemplosFolhaCampo.ts), confere que a
// geração é determinística e, com o pdftotext (poppler-utils), o conteúdo de cada página: cabeçalho de
// identificação (com o nº do certificado reservado, quando há), rótulos iguais aos da tela do assistente,
// plano de cargas, o POP no rodapé, o tamanho da folha (rev. 03, só a medição: 8 passos, dado impresso diferente,
// observações e anomalias no bloco Anotações, no pé da frente) e o que NÃO pode aparecer (aprovado/reprovado, validade — fora a nota da etiqueta —,
// caixas de "confere", e o que saiu na rev. 03: QR, rubrica, verificação antes de calibrar, ajuste e reparo,
// "como encontrado" e "depois do ajuste", faixa do EMA, encerramento).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AJUSTES } from '#shared/dominio.ts'
import { AVISO_ETIQUETA, FORMULARIO_FOLHA_CAMPO } from '#shared/folhaCampo.ts'
import type { Padrao } from '#shared/tipos.ts'
import { A4, BASE_RODAPE, MODULO, pdfmake, TOPO_CABECALHO } from './base.ts'
import {
  folhaClasseI,
  folhaEmBranco,
  folhaEmBrancoOitoPadroes,
  folhaMultiIntervalo,
  folhaPlataforma,
  folhaRodoviaria,
  folhaRodoviariaMultiIntervalo,
  folhaRodoviariaSemHistorico,
  padroesDaEmpresa,
} from './exemplosFolhaCampo.ts'
import {
  AJUSTE_INTERNO_CLASSE_I,
  AVISO_ANOTACOES,
  AVISO_CLASSE_I_EM_BRANCO,
  DICA_ANOTACOES,
  type DadosFolhaCampo,
  definicaoFolhaCampo,
  descricaoPadraoNaFolha,
  DICA_ETIQUETA,
  ETAPAS_SISTEMA,
  gerarFolhaCampoPdf,
  LEMBRETE_AMBIENTE_FIM,
  METODO_EXCENTRICIDADE_FOLHA,
  montar,
  nomeArquivoFolhaCampo,
  ONDE_ANOTAR,
  TITULO_ANOTACOES,
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
    /** Tom de cinza do pixel (0 = preto, 255 = branco). */
    tom: (xPx: number, yPx: number) => r.stdout[inicio + yPx * largura + xPx],
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
 * Altura (mm) da linha de um campo, de fio a fio: da primeira linha escura acima do rótulo à primeira abaixo, na
 * faixa entre o fio da esquerda da célula e o rótulo (os campos em linha têm o rótulo e a escrita lado a lado).
 */
function alturaDaLinha(pdf: Buffer, paginas: Palavra[][], rotulo: string[]): { pagina: number; mm: number } {
  for (const [i, palavras] of paginas.entries()) {
    const j = palavras.findIndex((_, k) => rotulo.every((r, n) => palavras[k + n]?.texto === r))
    if (j < 0) continue
    const w = palavras[j]
    const img = imagemDaPagina(pdf, i + 1)
    const x = Math.round((w.x0 - 2) * img.px)
    const meio = Math.round(((w.y0 + w.y1) / 2) * img.px)
    let cima = meio
    while (!img.escuro(x, cima)) cima--
    let baixo = meio
    while (!img.escuro(x, baixo)) baixo++
    return { pagina: i + 1, mm: ((baixo - cima) * 25.4) / 150 }
  }
  throw new Error(`rótulo não achado: ${rotulo.join(' ')}`)
}

/**
 * As amostras e o máximo de páginas de cada uma (rev. 03, só a medição: frente e verso de uma folha). Todas cabem em 2,
 * também as rodoviárias (a multi-intervalo, com 11 pontos e 7 etapas de substituição) e a em branco com os 8 padrões
 * ativos de uma empresa maior.
 */
const EXEMPLOS: Array<{ nome: string; dados: () => DadosFolhaCampo; maxPaginas: number }> = [
  { nome: 'plataforma 300 kg (rascunho do último certificado)', dados: folhaPlataforma, maxPaginas: 2 },
  { nome: 'balcão multi-intervalo 6/15/33 kg (sem histórico)', dados: folhaMultiIntervalo, maxPaginas: 2 },
  { nome: 'rodoviária 80 t com substituição', dados: folhaRodoviaria, maxPaginas: 2 },
  { nome: 'em branco', dados: folhaEmBranco, maxPaginas: 2 },
  { nome: 'rodoviária 60 t sem calibração anterior', dados: folhaRodoviariaSemHistorico, maxPaginas: 2 },
  { nome: 'em branco com 8 padrões', dados: folhaEmBrancoOitoPadroes, maxPaginas: 2 },
  { nome: 'rodoviária multi-intervalo 80 t, 11 pontos e 7 etapas', dados: () => folhaRodoviariaMultiIntervalo(), maxPaginas: 2 },
  { nome: 'analítica classe I 220 g × 0,1 mg (sem histórico)', dados: folhaClasseI, maxPaginas: 2 },
]

const gerados = new Map<string, Promise<Buffer>>()
const pdfDe = (e: (typeof EXEMPLOS)[number]) => {
  if (!gerados.has(e.nome)) gerados.set(e.nome, gerarFolhaCampoPdf(e.dados()))
  return gerados.get(e.nome)!
}

/** O conteúdo da definição (pdfmake) em JSON. */
const jsonDe = (d: DadosFolhaCampo) => JSON.stringify((definicaoFolhaCampo(d) as { content: unknown }).content)

/** Os 8 títulos de passo, na ordem (nenhum passo pode sumir). */
const TITULOS_PASSOS = [
  '1 ANTES DE SAIR: PADRÕES',
  '2 CHEGADA AO CLIENTE',
  '3 IDENTIFICAÇÃO DA BALANÇA',
  '4 AMBIENTE',
  '5 ERRO DE INDICAÇÃO',
  '6 REPETIBILIDADE',
  '7 EXCENTRICIDADE',
  '8 ASSINATURAS',
]

/**
 * O que saiu na rev. 03 (a folha só registra a medição; os acordos ficam no sistema e as observações nas Anotações): a
 * verificação antes de calibrar, o ajuste e o reparo (na classe I, só a caixa do ajuste interno de rotina, antes dos
 * ensaios: `semAjusteDaClasseI`), os dois grupos de leituras, a faixa do EMA, o "como foi feito"
 * da excentricidade, o encerramento (conformidade, próxima calibração, observações, escritório), a finalidade e a
 * rubrica do rodapé.
 */
const REMOVIDOS = [
  'VERIFICAÇÃO ANTES DE CALIBRAR',
  'Ligada e aquecida',
  'Pré-carga aplicada',
  'Zero automático',
  'Capela',
  'Selos / lacres',
  'Marca Inmetro/IPEM',
  'Pesos no local',
  'Divisão usada',
  'Fotos',
  'AJUSTE E REPARO',
  'Ajuste interno',
  'Reparo ou manutenção',
  'autorização do cliente',
  'Como encontrado',
  'Depois do ajuste',
  'Faixa para decidir',
  'Para decidir o ajuste',
  'ΣΔI',
  'Como foi feito',
  'Zero/centro antes',
  'ENCERRAMENTO',
  'O cliente pediu conformidade?',
  'Limite (erro máximo admissível)',
  'Regra de decisão',
  'Próxima calibração',
  'Data no certificado',
  'Observações (saem no certificado)',
  'ESCRITÓRIO',
  'Finalidade',
  'RUBRICA',
]

/** O texto sem a caixa do ajuste interno de rotina da classe I (o único "ajuste interno" que a folha pode ter). */
const semAjusteDaClasseI = (t: string) => t.replace(AJUSTE_INTERNO_CLASSE_I, '')

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
    expect(json).toContain('7 × 20 kg + 10 kg'.replace(/\\u00a0/g, ' '))
    expect(json).not.toMatch(/"7 × 20 kg \+ 10 kg"/)
  })

  it('sem QR: no cabeçalho só o logo (com ou sem nº); sem nº, a linha para escrever', () => {
    type Doc = { header: (p: number, t: number) => unknown }
    const svgs = (doc: Doc) => JSON.stringify(doc.header(1, 2)).split('<svg').length - 1
    const semNumero = definicaoFolhaCampo({ ...folhaEmBranco(), numero: '' }) as Doc
    expect(JSON.stringify(semNumero.header(1, 2))).toContain('Nº ____')
    expect(svgs(semNumero)).toBe(1)
    for (const dados of [folhaEmBranco, folhaPlataforma, folhaClasseI]) {
      const doc = definicaoFolhaCampo(dados()) as Doc
      expect(svgs(doc), dados.name).toBe(1)
      expect(JSON.stringify(doc.header(1, 2)), dados.name).not.toMatch(/qrEnc|"qr"/)
    }
  })

  it('faixa do alto de toda página: só a OS (sem o cliente e a balança); sem OS, a linha para escrever', () => {
    type Doc = { header: (p: number, t: number) => unknown }
    const cab = (d: DadosFolhaCampo, p: number) => JSON.stringify((definicaoFolhaCampo(d) as Doc).header(p, 2))
    for (const p of [1, 2]) {
      const t = cab(folhaPlataforma(), p)
      expect(t).toContain('"text":"OS"')
      expect(t).toContain('"OS-2026-0512"')
      expect(t).not.toMatch(/"(CLIENTE|BALANÇA)"/)
      expect(t).not.toContain('Frigorífico Vale do Corumbataí')
      expect(t).not.toContain('nº de série')
    }
    const branco = cab(folhaEmBranco(), 1)
    expect(branco).toContain('"text":"OS"')
    expect(branco).toContain('"border":[false,false,false,true]')
    expect(branco).not.toMatch(/"(CLIENTE|BALANÇA)"/)
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
      // O local e o método (e, na em branco, a classe, as faixas e o receptor)
      expect(quadrados.length).toBeGreaterThanOrEqual(6)
      expect(quadrados.filter((q) => q.color !== '#FFFFFF')).toEqual([])
    }
    // A plataforma prevê o local e o método
    expect(jsonDe(folhaPlataforma()).split('"  PREVISTO"').length - 1).toBe(2)
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

  it('sem "confere" nem caixas de correção ou de observações: o diferente e as observações vão em Anotações, no pé da frente (uma linha no alto da página 1)', () => {
    // A folha é impressa frente e verso, e os ensaios ocupam o verso: as Anotações ficam na frente, embaixo do passo 4
    expect(ONDE_ANOTAR).toBe('em Anotações (frente)')
    expect(TITULO_ANOTACOES).toBe('Anotações')
    expect(DICA_ANOTACOES).toBe('dado impresso diferente, observações e anomalias, com o nº do passo, rubrica e data')
    expect(AVISO_ANOTACOES).toBe(
      'Dado impresso diferente ou observação? Anote em Anotações (frente), com o nº do passo, rubrica e data; sem espaço, numa folha anexa.',
    )
    for (const e of EXEMPLOS) {
      const json = jsonDe(e.dados())
      expect(json, e.nome).not.toMatch(/"confere"|escreva o certo/)
      expect(json, e.nome).toContain(AVISO_ANOTACOES)
      // Nenhuma instrução manda anotar "no verso" (o verso são os ensaios) nem num "espaço livre" (agora é o bloco)
      expect(json, e.nome).not.toMatch(/no verso|espaço livre/)
    }
  })

  it.each(EXEMPLOS)('rev. 03: nada do que saiu (verificação, ajuste, EMA, encerramento, finalidade): $nome', (e) => {
    const json = semAjusteDaClasseI(jsonDe(e.dados()))
    for (const x of REMOVIDOS) expect(json, x).not.toContain(x)
    // O ajuste também não aparece na instrução nem nas notas (nenhum "depois do ajuste", "ajustou?")
    expect(json).not.toMatch(/[Aa]justou|depois do ajuste|como encontrado/)
  })

  it('rodapé: o código e a revisão do formulário e o POP configurado (sem POP, nada no lugar); sem rubrica nem data', () => {
    const rodape = (d: DadosFolhaCampo) => JSON.stringify((definicaoFolhaCampo(d) as { footer: () => unknown }).footer())
    const comPop = rodape({ ...folhaPlataforma(), procedimento: 'BALANÇAS-POP-123 rev. 00' })
    expect(FORMULARIO_FOLHA_CAMPO.revisao).toBe('03')
    expect(comPop).toContain(`${FORMULARIO_FOLHA_CAMPO.codigo} rev. ${FORMULARIO_FOLHA_CAMPO.revisao}`)
    expect(comPop).toContain('"POP BALANÇAS-POP-123 rev. 00"')
    expect(comPop).not.toContain('PT-CAL-01')
    expect(comPop).not.toMatch(/RUBRICA|DATA|___/)
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
    // O método do erro de indicação e o zero antes de cada posição da excentricidade (classe I), como na tela
    const indicacao = readFileSync(new URL('../../src/components/calibracao/EtapaIndicacao.tsx', import.meta.url), 'utf8')
    expect(indicacao).toContain('label="Como as cargas foram aplicadas"')
    expect(jsonDe(folhaPlataforma())).toContain('"Como as cargas foram aplicadas"')
    const excentricidade = readFileSync(
      new URL('../../src/components/calibracao/EtapaExcentricidade.tsx', import.meta.url),
      'utf8',
    )
    expect(excentricidade).toContain("'Zero antes'")
    expect(jsonDe(folhaClasseI())).toContain('"Zero antes"')
  })

  it('classe II: pressão obrigatória e o barômetro na lista dos padrões; sem o ΔT pesos − ar (só na classe I)', () => {
    const d = folhaRodoviaria()
    const classeII = jsonDe({ ...d, balanca: { ...d.balanca!, classe: 'II' } })
    expect(classeII).toContain('{"text":"Pressão ●"},{"text":" (hPa)"')
    expect(classeII).not.toContain('Pressão, opcional')
    expect(classeII).not.toContain('ΔT pesos')
    // Na classe III: pressão opcional
    const classeIII = jsonDe(d)
    expect(classeIII).toContain('{"text":"Pressão, opcional"},{"text":" (hPa)"')
    // O barômetro vai a campo na classe II (na lista "antes de sair"); na III, na linha dos que o plano não usa
    const naoUsa = (t: string) => t.slice(t.indexOf('o plano não usa'), t.indexOf('o plano não usa') + 120)
    expect(naoUsa(classeIII)).toContain('BR-01')
    expect(classeII).not.toContain('o plano não usa')
  })

  it('classe I: ΔT pesos − ar só no início, antes do 1º ensaio, com o limite dos pesos; umidade e pressão obrigatórias (sem linha a mais)', () => {
    const t = jsonDe(folhaClasseI()).replace(/\u00a0/g, ' ')
    // Na tabela do ambiente (a folha não cresce): o ΔT pesos − ar, obrigatório, só no início, com o limite dos pesos E2.
    // A célula fica na linha do início (15 min após chegar), mas o ΔT é medido antes do 1º ensaio (POP 7.4.5): a dica
    // diz quando, na própria célula
    expect(t).toContain('{"text":"ΔT pesos − ar ●"},{"text":" (°C)"')
    expect(t.match(/"ΔT pesos − ar ●"/g)).toHaveLength(1)
    expect(t).toContain('{"text":"antes do 1º ensaio · até 1 °C","fontSize":6.2}')
    // Umidade obrigatória (densidade do ar) e pressão obrigatória: uma coluna cada, para o início e o fim
    expect(t.match(/"Umidade ●"/g)).toHaveLength(1)
    expect(t.match(/"Pressão ●"/g)).toHaveLength(1)
    // O passo 4 sem instrução: nada da capela nem de como medir o ΔT
    expect(t).not.toMatch(/Capela|termômetro de 2 entradas|nunca infravermelho/)
    // Todos os jogos F1: até 3 °C
    const f1 = folhaClasseI()
    f1.padroes = f1.padroes.map((p) => (p.tipo === 'PESOS' ? { ...p, classe: 'F1' } : p))
    expect(jsonDe(f1).replace(/\u00a0/g, ' ')).toContain('"antes do 1º ensaio · até 3 °C"')
    // Nas outras classes e na folha em branco, nada disso
    for (const d of [
      folhaPlataforma(),
      folhaRodoviaria(),
      folhaEmBranco(),
      { ...folhaClasseI(), balanca: { ...folhaClasseI().balanca!, classe: 'II' as const } },
    ]) {
      const o = jsonDe(d)
      expect(o).not.toMatch(/ΔT pesos|Capela|Umidade ●/)
    }
  })

  it('em branco (classes II a IIII): sem o ΔT pesos − ar nem dicas da classe I; ao lado da classe, a linha que manda usar a folha da balança classe I cadastrada', () => {
    expect(AVISO_CLASSE_I_EM_BRANCO).toBe('Classe I: cadastre a balança e imprima a folha dela')
    for (const d of [folhaEmBranco(), folhaEmBrancoOitoPadroes()]) {
      const t = jsonDe(d)
      expect(t).not.toContain('ΔT pesos − ar')
      expect(t).not.toContain('Zero antes')
      // Nem o ajuste interno de rotina antes dos ensaios (só na folha de uma balança classe I cadastrada)
      expect(t).not.toMatch(/Ajuste interno|\(CAL\)/)
      // A classe I sai das opções; a linha ao lado (em duas linhas miúdas) diz o que fazer
      expect(t).toContain('{"text":"Classe I: ","bold":true')
      expect(t).toContain('cadastre a balança\\ne imprima a folha dela"')
      expect(t).not.toContain('não use a folha em branco')
      expect(t).not.toMatch(/classe[\s\u00a0]I(?![I\w])|uma peça só/)
      expect(t).not.toContain('{"text":"I","fontSize"')
      // A pressão: obrigatória na classe II (na classe I também, mas ela não usa esta folha)
      expect(t).toContain(`{"text":"obrigatória na classe${' '}II","fontSize":6.2}`)
      // Excentricidade pelo método 1, sem a linha do zero antes de cada posição
      expect(t).toContain(`"${METODO_EXCENTRICIDADE_FOLHA.demais}"`)
      // Repetibilidade: quantas vezes no canto das caixas (5; 3 com 100 kg ou mais); as outras, opcionais (com 10, k = 2)
      for (const x of ['4ª · < 100 kg', '5ª · < 100 kg', '6ª · opcional', '7ª · opcional', '10ª · opcional', '12ª · opcional'])
        expect(t).toContain(x)
    }
  })

  it('classe I com mais dados (anotações, conformidade): 2 páginas; as 12 leituras da repetibilidade num bloco só, com a carga', async () => {
    const d = folhaClasseI()
    d.calibracao!.anotacoesInternas =
      'Procurar a Camila na recepção; avental e touca obrigatórios na sala de balanças. Integração de BPF (20 min) antes de entrar.'
    d.calibracao!.conformidade = { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0.002, regra: 'BANDA_GUARDA' }
    const m = await montar(d)
    expect(m.paginas).toBe(2)
    expect(m.faltando).toEqual([])
    // O passo 6 (a carga ao lado das duas faixas de leituras, 1ª a 12ª) fica inteiro na página 2
    expect(m.marcas.get('passo-6')?.pagina).toBe(2)
    expect(m.marcas.get('fim:passo-6')?.pagina).toBe(2)
    expect(m.marcas.has('parte-6-1')).toBe(false)
    // A conformidade pedida fica só no sistema
    expect(jsonDe(d)).not.toMatch(/conformidade|Tolerância do cliente|banda de guarda/i)
    const amostra = await montar(folhaClasseI())
    expect(amostra.paginas).toBe(2)
    expect(amostra.marcas.get('fim:passo-6')?.pagina).toBe(2)
    expect(amostra.marcas.has('parte-6-1')).toBe(false)
    expect((await montar(folhaPlataforma())).marcas.has('parte-6-1')).toBe(false)
  })

  it('erro de indicação: um grupo de leituras (↑ e ↓), sem a faixa; a coluna que o método não usa, mais estreita', () => {
    const colunas = (d: DadosFolhaCampo) => {
      const [tabela] = nosQue((definicaoFolhaCampo(d) as { content: unknown }).content, (x) =>
        JSON.stringify((x.table as { body?: unknown[][] } | undefined)?.body?.[0] ?? '').includes('Indicação ↑'),
      )
      const t = tabela.table as { widths: Array<number | string>; body: unknown[][]; headerRows: number }
      return { larguras: t.widths, cabecalho: JSON.stringify(t.body[0]), linhasCabecalho: t.headerRows }
    }
    // Plataforma (crescente e decrescente): Nº, carga, pesos e as duas leituras, largas e iguais; o cabeçalho numa linha
    const p = colunas(folhaPlataforma())
    expect(p.larguras).toHaveLength(5)
    expect(p.linhasCabecalho).toBe(1)
    expect(p.larguras[3]).toBe(p.larguras[4])
    expect(p.larguras[3]).toBeGreaterThanOrEqual(96)
    expect(p.cabecalho).toContain('Indicação ↓')
    // Classe I (crescente com descarga): a ↓ mais estreita (o método pode mudar no local)
    const c = colunas(folhaClasseI())
    expect(c.larguras[4]).toBeLessThan(c.larguras[3] as number)
    // Rodoviária: as substituições numa coluna a mais
    expect(colunas(folhaRodoviaria()).larguras).toHaveLength(6)
    // O retorno ao zero numa linha só, com uma caixa para escrever
    const json = jsonDe(folhaPlataforma())
    expect(json.match(/RETORNO AO ZERO/g)).toHaveLength(1)
  })

  it('instrução curta na barra do título, depois do nome; a longa na linha de baixo; o ambiente sem instrução', () => {
    const doc = definicaoFolhaCampo(folhaPlataforma()) as { content: unknown }
    // A barra do título é uma tabela de uma linha: o nº, o nome (com a instrução, quando cabe) e a etapa do sistema
    const barra = (nome: string) =>
      JSON.stringify(
        nosQue(doc.content, (x) => {
          const t = x.table as { body?: unknown[][] } | undefined
          return t?.body?.length === 1 && JSON.stringify(t.body[0][1] ?? '').includes(`"${nome}"`)
        })[0],
      )
    expect(barra('EXCENTRICIDADE')).toContain(`"${METODO_EXCENTRICIDADE_FOLHA.demais}"`)
    expect(barra('EXCENTRICIDADE')).toContain(', na ordem do desenho (frente: indicador).')
    expect(barra('AMBIENTE')).not.toContain('\u2002 ')
    // Longa (a do passo 5): embaixo do título
    expect(barra('ERRO DE INDICAÇÃO')).not.toContain('Zere vazia e aplique')
    expect(JSON.stringify(doc.content)).toContain('Zere vazia e aplique as cargas na ordem da tabela (')
  })

  it('excentricidade: o método numa frase fixa (classe I: zero antes de cada posição) e a linha do zero só na classe I', () => {
    expect(METODO_EXCENTRICIDADE_FOLHA).toEqual({
      classeI: 'Zere antes de cada posição',
      demais: 'Zere vazia e desloque a carga pelas posições',
    })
    for (const e of EXEMPLOS) {
      const t = jsonDe(e.dados())
      const classeI = e.dados === folhaClasseI
      expect(t, e.nome).toContain(`"${classeI ? METODO_EXCENTRICIDADE_FOLHA.classeI : METODO_EXCENTRICIDADE_FOLHA.demais}"`)
      expect(t, e.nome).not.toContain(classeI ? METODO_EXCENTRICIDADE_FOLHA.demais : METODO_EXCENTRICIDADE_FOLHA.classeI)
      expect(t.includes('"Zero antes"'), e.nome).toBe(classeI)
      // Sem opções de método para marcar
      expect(t, e.nome).not.toMatch(/Zera e desloca|Tara com a carga|Volta ao centro/)
    }
  })

  it('excentricidade: a frente é o lado do indicador (com indicador remoto, o de acesso)', () => {
    // Prato e plataforma com a carga impressa: a instrução curta, na barra do título ("frente: indicador")
    for (const e of EXEMPLOS)
      expect(jsonDe(e.dados()), e.nome).toMatch(/Frente: indicador \(se remoto, o de acesso\)\.|\(frente: indicador\)\./)
    for (const d of [folhaRodoviaria, folhaEmBranco, folhaClasseI])
      expect(jsonDe(d())).toContain('Frente: indicador (se remoto, o de acesso).')
    expect(jsonDe(folhaPlataforma())).toContain(', na ordem do desenho (frente: indicador).')
    expect(jsonDe(folhaPlataforma())).not.toContain('FRENTE · INDICADOR')
  })

  it('identificação da balança sem a finalidade (fica no cadastro do sistema)', () => {
    for (const dados of [folhaPlataforma, folhaMultiIntervalo, folhaClasseI, folhaEmBranco]) {
      const t = jsonDe(dados())
      expect(t, dados.name).not.toMatch(/Finalidade|comercial|laboratório \/ CQ|"saúde"|Processo \/ produção/)
    }
    // Na em branco, Min fica com as faixas (Max, e, d), da altura das três
    expect(jsonDe(folhaEmBranco())).toContain('"Carga mínima (Min)"')
  })
})

describe.runIf(temPdftotext)('conteúdo da folha (pdftotext)', { timeout: 30_000 }, () => {
  /** Em toda página: título, nº da folha, "Página i de N", código do formulário e a OS (sem rubrica no rodapé). */
  function conferirPaginas(texto: string, numero: string, os: string) {
    const paginas = paginasDe(texto)
    expect(paginas.length).toBe(2)
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
      // Folha solta ou digitalizada sozinha: quem imprimiu e quando; a data e a assinatura só no passo 8
      expect(t).toMatch(/Impressa em \d\d\/\d\d\/\d{4}, às \d\d:\d\d por /)
      expect(t).not.toMatch(/RUBRICA|DATA ___/)
      // A faixa do alto: só a OS
      expect(t).toMatch(new RegExp(`Página ${i + 1} de ${paginas.length} OS ${os}`))
      expect(t).not.toMatch(/\bCLIENTE [A-Z][a-z]|BALANÇA nº de série/)
    })
    return paginas
  }

  /** Comum a todas as folhas: roteiro completo, na ordem, regra de correção, assinaturas e nada de "certificado". */
  function conferirComum(texto: string) {
    const t = corrido(texto)
    expect(t).toContain('COMO ANOTAR E CORRIGIR')
    expect(t).toMatch(/um risco só sobre o valor errado/)
    expect(t).toContain('corretivo')
    // Os 8 passos, na ordem
    const posicoes = TITULOS_PASSOS.map((x) => t.indexOf(x))
    expect(
      posicoes.every((x) => x >= 0),
      JSON.stringify(posicoes),
    ).toBe(true)
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes)
    for (const etapa of Object.values(ETAPAS_SISTEMA)) expect(t).toContain(etapa)
    for (const x of REMOVIDOS) expect(semAjusteDaClasseI(t), x).not.toContain(x)
    expect(t).toContain('Como as cargas foram aplicadas')
    expect(t).toContain('Início do ensaio')
    expect(t).toContain('Indicação ↑')
    expect(t).toContain('Indicação ↓')
    expect(t).toContain('Zero após retirar')
    // Retorno ao zero na própria tabela de pontos (nunca solto no alto de outra página)
    expect(t).toContain('RETORNO AO ZERO')
    for (const p of paginasDe(texto).filter((x) => x.includes('RETORNO AO ZERO'))) expect(p).toContain('ERRO DE INDICAÇÃO')
    // O ambiente no início e no fim numa tabela só (o fim, depois da excentricidade)
    expect(t).toMatch(
      /4 AMBIENTE NO SISTEMA 3 · Padrões e ambiente Ambiente Hora Temperatura ● .*Início 15 min após chegar .*Fim após o passo 7/,
    )
    expect(t).toContain('Instrumento usado')
    expect(t).toContain('Técnico que executou — nome e assinatura')
    expect(t).toContain('Pelo cliente — nome, função e assinatura')
    // (em duas linhas, que o pdftotext intercala com as colunas vizinhas)
    expect(t).toContain('quem acompanhou;')
    expect(t).toContain('ciente das condições, não dos resultados')
    // Dado impresso diferente e observações: em Anotações, no pé da frente (sem caixas de "confere", de correção nem de
    // observações)
    expect(corrido(paginasDe(texto)[0])).toContain(AVISO_ANOTACOES)
    expect(corrido(paginasDe(texto)[0])).toContain(`${TITULO_ANOTACOES.toUpperCase()} — ${DICA_ANOTACOES}`)
    expect(corrido(paginasDe(texto)[1])).not.toContain(TITULO_ANOTACOES.toUpperCase())
    expect(t).not.toMatch(/\bconfere\b/)
    // Nada de aprovação ou "validade" numa folha de campo (fora a nota da etiqueta: a validade fica em branco);
    // o nº do certificado só como reservado, nunca como o título de um certificado
    expect(t).not.toContain('CERTIFICADO DE CALIBRAÇÃO Nº')
    expect(t).not.toMatch(/\baprovad[oa]\b|\breprovad[oa]\b/i)
    expect(t.replace(AVISO_ETIQUETA, '')).not.toMatch(/validade/i)
  }

  it('plataforma 300 kg: cadastro para conferir, pontos e pesos do último certificado; os ensaios no verso', async () => {
    const e = EXEMPLOS[0]
    const texto = textoDoPdf(await pdfDe(e))
    const paginas = conferirPaginas(texto, 'FC-2026-00042', 'OS-2026-0512')
    // Duas páginas (frente e verso): na frente, os passos 1 a 4; no verso, os ensaios e as assinaturas
    expect(paginas).toHaveLength(2)
    expect(corrido(paginas[0])).toContain('4 AMBIENTE')
    expect(corrido(paginas[0])).not.toContain('ERRO DE INDICAÇÃO')
    expect(corrido(paginas[1])).toMatch(/OS OS-2026-0512 5 ERRO DE INDICAÇÃO NO SISTEMA/)
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('FRIGORÍFICO VALE DO CORUMBATAÍ LTDA')
    expect(t).toContain('Avenida Brasil, 2450')
    expect(t).toContain('Carlos Eduardo Lima')
    // O cliente impresso, compacto (sem "confere" nem caixa para o certo: diferente, em Anotações); o técnico
    // previsto é só uma dica, numa caixa branca, e o nome ao lado da assinatura fica para quem executou escrever
    expect(corrido(paginas[0])).toMatch(/Razão social Contato no cliente CNPJ FRIGORÍFICO VALE DO CORUMBATAÍ LTDA/)
    expect(corrido(paginas[0])).toMatch(/Técnico que executou ● .{0,80}previsto: Carlos Eduardo Lima/)
    const ultima = corrido(paginas.at(-1)!)
    const assinaturas = ultima.slice(ultima.indexOf('ASSINATURAS'), ultima.indexOf(FORMULARIO_FOLHA_CAMPO.codigo))
    expect(assinaturas).toContain('Técnico que executou — nome e assinatura')
    expect(assinaturas).not.toContain('Carlos')
    // Como o POP (10) pede: a correção e o dado a mais, com rubrica e data (ISO/IEC 17025, 7.5.2), em Anotações, no pé
    // da frente (o verso são os ensaios)
    expect(t).toContain(
      'Dado impresso diferente ou observação? Anote em Anotações (frente), com o nº do passo, rubrica e data; sem espaço, numa folha anexa.',
    )
    expect(t).toContain('Errou: um risco só sobre o valor errado (continua legível), o certo ao lado, rubrica e data.')
    expect(t).toContain('Diferente? Anote o certo em Anotações (passo 2 ou 3) e avise o cliente.')
    expect(t).toContain('Marque com X')
    expect(t).toMatch(/no cliente\s+PREVISTO/)
    // Troca de pesos: em Anotações (frente), com o nº da linha e as peças usadas (a nota em cima da tabela de pontos
    // diz)
    expect(t).not.toContain('PESOS DIFERENTES DO PREVISTO')
    expect(t).toContain('Pesos diferentes dos impressos: em Anotações (frente), com o nº da linha.')
    // Antes de assinar (no verso), o lembrete curto do ambiente do fim, que fica na frente (passo 4)
    expect(corrido(paginas[1])).toContain(LEMBRETE_AMBIENTE_FIM)
    expect(LEMBRETE_AMBIENTE_FIM).toBe('Antes de assinar: preencha a linha Fim do passo 4.')
    expect(t).toContain('Portaria Inmetro/Dimel nº')
    expect(t).toContain('0236/2009')
    expect(t).toContain('Toledo do Brasil 2180 · nº')
    // Recados de acesso na chegada (página 1), não no fim
    expect(corrido(paginas[0])).toContain('Procurar a Juliana na portaria 2')
    // A data da calibração uma vez só, no passo 8 (com a prevista como dica); na chegada, só a hora de início
    expect(t.match(/Data da calibração/g)).toHaveLength(1)
    expect(corrido(paginas[0])).not.toContain('Data da calibração')
    expect(corrido(paginas[0])).toContain('Hora de início')
    expect(assinaturas).toMatch(/Data da calibração . .{0,80}prevista: 21\/10\/2026/)
    // Padrões: o que separar antes de sair
    expect(t).toContain('PP20-01 a 15')
    expect(t).toContain('15 × 20 kg')
    // Pontos (do último certificado), nas casas de d, com os pesos; sem a faixa do EMA (a conformidade pedida fica no
    // sistema)
    expect(t).toMatch(/300,00 +15 × 20 kg/)
    expect(t).toMatch(/150,00 +7 × 20 kg \+ 10 kg/)
    expect(t).not.toContain('299,80 a 300,20')
    expect(t).not.toContain('Portaria Inmetro 157/2022')
    expect(t).toMatch(/Nº Carga \(kg\) Pesos padrão Indicação ↑ \(kg\) Indicação ↓ \(kg\) 1 0,00 sem carga \(zero\)/)
    expect(t).toMatch(/Crescente e decrescente\s+PREVISTO/)
    // Repetibilidade com 150 kg (5 leituras previstas, mínimo 3) e excentricidade com 100 kg em 5 posições,
    // as cargas nas casas de d, na célula da carga, ao lado das leituras
    const rep = t.slice(t.indexOf('6 REPETIBILIDADE'), t.indexOf('7 EXCENTRICIDADE'))
    expect(rep).toMatch(/150,00 Carga \(kg\)|Carga \(kg\) 150,00/)
    expect(rep).toContain('no centro, 5 vezes (mín. 3)')
    expect(rep).toContain('6ª · opcional')
    const ecc = t.slice(t.indexOf('7 EXCENTRICIDADE'), t.indexOf('8 ASSINATURAS'))
    expect(ecc).toMatch(/100,00 Carga \(kg\)|Carga \(kg\) 100,00/)
    expect(ecc).not.toContain('Zero antes')
    expect(t).toContain('previsto: TH-01')
    // A carga está na tabela das posições: a instrução curta (o método numa frase fixa), na barra do título
    expect(t).toContain('7 EXCENTRICIDADE Zere vazia e desloque a carga pelas posições, na ordem do desenho (frente: indicador).')
    // As posições na ordem do desenho (o nome longo quebra em duas linhas na coluna dela)
    for (const p of ['1 Centro', '2 Frente', '3 Trás', '4 Trás', '5 Frente']) expect(t).toContain(p)
    const json = jsonDe(folhaPlataforma())
    for (const p of ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita'])
      expect(json).toContain(`"text":"${p}"`)
    expect(t).not.toContain('FRENTE · INDICADOR')
    // Min (1 kg) entre as cargas
    expect(t).toMatch(/1,00 +1 kg/)
    // A identificação da balança impressa numa grade só, em três linhas (sem a finalidade)
    expect(t).toMatch(
      /Tipo de balança Fabricante \(indicador\) Modelo \(indicador\) Nº de série \(indicador\) Identificação \/ TAG \(\*\) Ano de fabricação Plataforma Toledo do Brasil 9091 9091-118832 BAL-EXP-07 2019/,
    )
    expect(t).toMatch(
      /Capacidade × divisão Carga mínima \(Min\) Classe de exatidão Divisão de verificação \(e\) 300 kg × 50 g 1 kg III \(média\) 50 g/,
    )
  })

  it('analítica classe I 220 g: 2 páginas, ΔT pesos − ar, 10 leituras e o zero antes de cada posição', async () => {
    const e = EXEMPLOS.find((x) => x.dados === folhaClasseI)!
    const texto = textoDoPdf(await pdfDe(e))
    const paginas = conferirPaginas(texto, 'FC-2026-00048', 'OS-2026-0547')
    expect(paginas).toHaveLength(2)
    conferirComum(texto)
    const t = corrido(texto)
    // O nº reservado é o do certificado de exemplo da classe I
    expect(t).toContain('CC-2026-00132')
    // Padrões a campo: o jogo E2, o termo-higrômetro, o barômetro (pressão obrigatória) e o termômetro de 2 entradas
    for (const id of ['JE2-01', 'TH-01', 'BR-01', 'TD-01']) expect(corrido(paginas[0])).toContain(id)
    expect(t).not.toContain('o plano não usa')
    // O ambiente (início e fim) numa tabela só, na página 1, com o ΔT pesos − ar e o limite dele na linha do início
    const p1 = corrido(paginas[0])
    const ambiente = p1.slice(p1.indexOf('4 AMBIENTE'))
    expect(ambiente).toMatch(/Temperatura ● \(°C\) Umidade ● \(%\) Pressão ● \(hPa\) ΔT pesos − ar ● \(°C\) Instrumento usado/)
    expect(ambiente).toMatch(/Início 15 min após chegar .*antes do 1º ensaio · .*até 1 °C/)
    // Repetibilidade: 10 vezes, 12 colunas em duas faixas (as duas últimas opcionais)
    expect(t).toContain('uma peça só, no centro, 10')
    expect(t).toContain('10ª 11ª · opcional 12ª · opcional')
    // O rascunho como o POST o monta (sem copiar os padrões do certificado): o TD-01 ("Outro") entra no passo 1
    expect(folhaClasseI().calibracao!.padroesIds).toContain('pad-td01')
    // POP 7.7: cada carga com o menor número de peças, aplicada a partir do zero ("crescente com descarga")
    expect(t).toMatch(/Como as cargas foram aplicadas Início do ensaio Crescente e decrescente Crescente com descarga PREVISTO/)
    expect(t).toContain('retire tudo e confira o zero entre uma carga e outra')
    // Repetibilidade com uma peça só, entre metade de Max e Max: 200 g
    expect(t).toMatch(/Carga \(g\) 200,0000 .{0,60}200 g/)
    // Excentricidade: uma peça só de no mínimo 1/3 de Max (100 g), a meio raio, com o zero antes de cada posição
    expect(t).toContain(
      '7 EXCENTRICIDADE NO SISTEMA 5 · Excentricidade Zere antes de cada posição e coloque 100 g (uma peça só) a meio raio, na ordem do desenho. Frente: indicador (se remoto, o de acesso).',
    )
    expect(t).toMatch(/Carga \(g\) 100,0000 .{0,120}100 g/)
    expect(t).toMatch(/Zero antes \(g\) .{0,20}Indicação \(g\)/)
  })

  it('balcão multi-intervalo: pontos sugeridos pelo sistema e a divisão de cada intervalo', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[1]))
    const paginas = conferirPaginas(texto, 'FC-2026-00043', 'OS-2026-0519')
    // O balcão (10 pontos e um ensaio de repetibilidade por intervalo) também fica em duas páginas (frente e verso), com
    // os ensaios no verso: o título, o método, a nota e a tabela juntos, sem título de continuação
    expect(paginas).toHaveLength(2)
    expect(corrido(paginas[0])).not.toContain('ERRO DE INDICAÇÃO')
    for (const x of ['5 ERRO DE INDICAÇÃO NO SISTEMA', 'Pesos diferentes dos impressos', '33,00', 'RETORNO AO ZERO'])
      expect(corrido(paginas[1])).toContain(x)
    expect(texto).not.toContain('(CONTINUAÇÃO)')
    expect(texto).not.toMatch(/na próxima página/)
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('pontos, cargas e posições sugeridos pelo sistema')
    expect(t).toContain('6/15/33 kg × 2/5/10 g')
    // A divisão de cada intervalo, na nota da tabela (a carga sai nas casas da divisão dela)
    expect(t).toContain('Divisão: d = 2 g até 6 kg · d = 5 g até 15 kg · d = 10 g até 33 kg. Pesos diferentes dos impressos')
    expect(t).toContain('8,250')
    expect(t).toContain('33,00')
    expect(t).not.toContain('32,96 a 33,04')
    expect(t).not.toContain('Uso comercial')
    // Min (40 g) entre as cargas
    expect(t).toMatch(/0,040 .{0,20}2 × 20 g/)
    // Repetibilidade: um ensaio por intervalo (POP 7.9), numa tabela só, sem cabeçalho (como o ensaio único): o nº, a
    // carga nas casas de d do intervalo de cada uma (16,5 kg: d = 10 g), os pesos e quantas vezes na célula cinza; a
    // hora ao lado; as leituras com a carga e o zero, 6 colunas (5 previstas: a 6ª, opcional)
    const rep = t.slice(t.indexOf('6 REPETIBILIDADE'), t.indexOf('7 EXCENTRICIDADE'))
    for (const [n, carga] of [
      [1, '4,800'],
      [2, '12,000'],
      [3, '16,50'],
    ])
      // (o pdftotext às vezes põe a carga, em letra maior, antes do rótulo)
      expect(rep).toMatch(new RegExp(`${n} · Carga \\(kg\\) ${carga}|${carga} ${n} · Carga \\(kg\\)`))
    expect(rep.match(/Com a carga \(kg\)/g)).toHaveLength(3)
    expect(rep.match(/Zero após retirar \(kg\)/g)).toHaveLength(3)
    expect(rep.match(/no centro, 5 vezes \(mín. 5\)/g)).toHaveLength(3)
    expect(rep.match(/6ª · opcional/g)).toHaveLength(3)
    expect(rep).toContain('2 × 2 kg + 500 g + 200 g + 100 g')
    // Excentricidade: no mínimo 1/3 de Max (11 kg), num valor redondo acima (na tabela das posições)
    expect(t).toMatch(/Carga \(kg\) ?15,000/)
  })

  it('rodoviária 80 t: substituição e posições de ida e volta, em 2 páginas', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[2]))
    const paginas = conferirPaginas(texto, 'FC-2026-00044', 'OS-2026-0530')
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('Cargas de substituição — 10 000 kg de pesos padrão em cada etapa (20 × 500 kg)')
    expect(t).toMatch(
      /Etapa Pesos padrão .{0,20}Indicação com os pesos \(kg\) Indicação com a substituição \(kg\) Material da substituição \/ obs\./,
    )
    expect(t).toMatch(/Pesos padrão .{0,150}por cima/)
    expect(t).toMatch(/Crescente contínuo\s+PREVISTO/)
    // A coluna ↓ vai também (estreita): o método pode mudar no local
    expect(t).toContain('Indicação ↓')
    // As etapas uma vez só, sem "depois do ajuste"
    expect(t.match(/[Ee]m cada etapa, anote a indicação/g)).toHaveLength(1)
    expect(t).toContain('Só crescente: para descer, seria preciso tirar o material.')
    // Pontos e etapas de substituição, preenchidos intercalados, na mesma página
    const comEtapas = paginas.find((p) => p.includes('Cargas de substituição —'))!
    expect(corrido(comEtapas)).toMatch(/40 000 +3 +20 × 500 kg/)
    expect(corrido(comEtapas)).toContain('ERRO DE INDICAÇÃO')
    expect(paginas).toHaveLength(2)
    for (const p of ['Início (ida)', 'Meio (ida)', 'Fim (ida)', 'Início (volta)', 'Meio (volta)', 'Fim (volta)'])
      expect(t).toContain(p)
    expect(t).not.toContain('39 940 a 40 060')
    expect(t).toContain('no centro, 3 vezes (mín. 3)')
    expect(t).toContain(
      '7 EXCENTRICIDADE NO SISTEMA 5 · Excentricidade Zere vazia e desloque a carga pelas posições, na ordem do desenho (nº do desenho = linha).',
    )
    // Os pontos param em 40 t de 80 t: o técnico confirma com o cliente antes de sair
    expect(t).toContain('Resolva antes de sair')
    expect(t).toContain('Os pontos vão só até 40 000 kg (50 % de Max)')
    // Pesos padrão de menos por etapa: a regra é da empresa (o POP não cobre as rodoviárias; a Tabela 7 dele é a
    // da etiqueta), e a folha é o registro original: nada de remeter ao POP
    expect(t).toContain(
      'Cargas de substituição com 10 000 kg de pesos padrão em cada etapa: para Max de 80 000 kg, o mínimo é 15 000 kg (regra da empresa). Leve mais pesos.',
    )
    expect(t).not.toMatch(/Tabela 7|POP 7\.12/)
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
    // Na célula da carga de cada ensaio, embaixo dos pesos (a dos pontos já mostrava)
    expect(t.slice(t.indexOf('6 REPETIBILIDADE'), t.indexOf('7 EXCENTRICIDADE'))).toMatch(/faltam [\d,]+ kg/)
    expect(t.slice(t.indexOf('7 EXCENTRICIDADE'), t.indexOf('8 ASSINATURAS'))).toMatch(/faltam [\d,]+ kg/)
  })

  it('excentricidade com outro método no sistema (classes II a IIII): a folha prevê o 1 e avisa antes de sair', async () => {
    const d = folhaPlataforma()
    d.calibracao = { ...d.calibracao!, excentricidade: { ...d.calibracao!.excentricidade, metodo: 2 } }
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
    expect(t).toContain(
      'Excentricidade: a folha prevê o método 1 (zera vazia e desloca a carga pelas posições) e o sistema está com o método 2; acerte no sistema.',
    )
    expect(t).toContain(METODO_EXCENTRICIDADE_FOLHA.demais)
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
      // Uma linha por etapa, com a carga de pesos de cada uma, sem linha a mais (uma etapa a mais vai no verso)
      const tabela = t.slice(t.indexOf('Cargas de substituição sugeridas'), t.indexOf('6 REPETIBILIDADE'))
      const linhas = [...tabela.matchAll(/(\d)ª 10 000/g)].map((x) => Number(x[1]))
      expect(linhas).toEqual(Array.from({ length: etapas }, (_, i) => i + 1))
      expect(tabela).not.toMatch(/ \+ /)
      // Pontos e etapas na mesma página
      const pagina = paginasDe(texto).find((p) => p.includes('Cargas de substituição sugeridas'))!
      expect(pagina).toContain('ERRO DE INDICAÇÃO')
      expect(t).toMatch(/Os pesos previstos não chegam às cargas acima de 10 000 kg: a folha sugere até \d etapas/)
    }
  })

  it('rodoviária 60 t sem calibração anterior (amostra): 15 t = 1 etapa + 10 × 500 kg, como o cálculo soma', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[4]))
    const paginas = conferirPaginas(texto, 'FC-2026-00046', 'OS-2026-0534')
    conferirComum(texto)
    const t = corrido(texto)
    // nível × 10 000 kg + os pesos por cima = a carga (nada de "20 × 500 kg + 5000 kg por baixo")
    expect(t).toMatch(/15 000 +1 +10 × 500 kg/)
    expect(t).toMatch(/45 000 +4 +10 × 500 kg/)
    expect(t).toMatch(/60 000 +5 +20 × 500 kg/)
    expect(t).not.toContain('+ 20 000 kg')
    expect(t).not.toContain('+ 5000 kg')
    // 5 etapas sugeridas (60 000 kg), sem linha a mais (uma etapa a mais vai no verso)
    const pagina = paginas.find((p) => p.includes('Cargas de substituição sugeridas'))!
    expect(pagina).toContain('ERRO DE INDICAÇÃO')
    const etapas = corrido(pagina).slice(
      corrido(pagina).indexOf('Cargas de substituição sugeridas'),
      corrido(pagina).indexOf('6 REPETIBILIDADE'),
    )
    expect(etapas).toMatch(/1ª 10 000 2ª 10 000 3ª 10 000 4ª 10 000 5ª 10 000/)
    expect(etapas).not.toMatch(/6ª|\+/)
    // Sem a faixa do EMA nem o limite para marcar (a conformidade fica no sistema)
    expect(t).not.toContain('59 920 a 60 080')
    expect(t).not.toMatch(/Portaria 157 — |Tolerância do cliente/)
  })

  it('etapas para escrever: nenhuma na folha em branco (o POP não cobre rodoviárias); 2 numa rodoviária cujos pesos fecham todas as cargas', async () => {
    const branco = corrido(textoDoPdf(await pdfDe(EXEMPLOS[3])))
    expect(branco).not.toContain('Cargas de substituição')
    expect(branco).not.toContain('Etapa Pesos padrão')
    const d = folhaRodoviariaSemHistorico()
    d.balanca = { ...d.balanca!, faixas: [{ max: 10_000, e: 5, d: 5 }] }
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
    const etapas = t.slice(
      t.indexOf('Cargas de substituição — quando os pesos levados não chegam'),
      t.indexOf('6 REPETIBILIDADE'),
    )
    expect(etapas).toMatch(/1ª 2ª/)
    expect(etapas).not.toContain('3ª')
    expect(t).not.toContain('sugeridas')
  })

  it('em branco: os ensaios no verso, com a tabela de pontos inteira logo embaixo do título', async () => {
    const m = await montar(folhaEmBranco())
    expect(m.paginas).toBe(2)
    expect(m.extras.ensaiosNoVerso).toBe(true)
    // As 9 linhas cabem numa página: a tabela não se divide (o técnico não vira a folha na subida nem na descida). O
    // título, a instrução e o método abrem a página 2, com a tabela logo embaixo (sem título de continuação)
    expect(m.extras.cortes).toEqual([])
    expect(m.extras.continuacoes).toEqual([])
    // O zero e mais 8 cargas, e o retorno ao zero
    const linhas = Array.from({ length: 10 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    expect(new Set(linhas)).toEqual(new Set([2]))
    expect(m.marcas.has('linha-pontos:10')).toBe(false)
    expect(m.marcas.get('fim:passo-5')?.pagina).toBe(2)
    const paginas = paginasDe(textoDoPdf(m.pdf))
    const verso = corrido(paginas[1])
    expect(verso).toMatch(/5 ERRO DE INDICAÇÃO .*Como as cargas foram aplicadas Início do ensaio Crescente e decrescente/)
    // Em branco, sem as cargas de substituição (o POP não cobre rodoviárias)
    expect(verso).toContain('Zere, aplique e anote a indicação.')
    expect(verso).not.toContain('Com cargas de substituição')
    expect(verso).toContain('RETORNO AO ZERO')
    expect(verso).not.toMatch(/\(CONTINUAÇÃO\)|na próxima página/)
  })

  it('padrão vencido também sem plano (folha em branco ou só do cliente): VENCIDO e aviso antes de sair', async () => {
    const d = folhaEmBranco()
    d.padroes = d.padroes.map((x) => (x.identificacao === 'TH-01' ? { ...x, validade: '2026-05-10' } : x))
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
    expect(t).toMatch(/10\/05\/2026 .{0,60}VENCIDO/)
    expect(t).toContain('Resolva antes de sair: TH-01: calibração vencida em 10/05/2026.')
  })

  it('conformidade pedida ou não, e a tolerância do cliente ainda não informada: nada dela na folha (fica no sistema)', async () => {
    const d = folhaPlataforma()
    for (const conformidade of [
      { ...d.calibracao!.conformidade, solicitada: false },
      { solicitada: true, criterio: 'CLIENTE' as const, toleranciaCliente: 0, regra: 'SIMPLES' as const },
      { solicitada: true, criterio: 'CLIENTE' as const, toleranciaCliente: 0.5, regra: 'BANDA_GUARDA' as const },
    ]) {
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf({ ...d, calibracao: { ...d.calibracao!, conformidade } })))
      expect(t).not.toMatch(/conformidade|tolerância|banda de guarda|aceitação simples|\bEMA\b/i)
      expect(t).not.toContain('299,80 a 300,20')
    }
  })

  it('em branco: identificação e pontos para escrever, opções de classe, faixas e receptor', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[3]))
    // Duas páginas (frente e verso), também em branco
    expect(conferirPaginas(texto, 'FC-2026-00045', '')).toHaveLength(2)
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('1 ANTES DE SAIR: PADRÕES Em branco: marque os padrões levados e, no cliente, os usados.')
    // Apoios e dimensões em caixas de escrever (o curto em campos em linha, o longo com o rótulo em cima)
    expect(t).toMatch(/Identificação \/ TAG \(\*\) Local de instalação \(\*\) Ano de fabricação Nº de apoios/)
    expect(t).toContain('Dimensões do prato (sai no certificado)')
    expect(t).not.toMatch(/Nº de apoios: _/)
    expect(t).toContain('cadastre a balança antes')
    // A unidade vai escrita com cada valor das faixas (como na plaqueta), sem caixas de marcar à parte; Min ao lado
    expect(t).not.toContain('Unidade mg g kg t')
    expect(t).toMatch(
      /Faixa 1 Capacidade \(Max\) com a Divisão de verificação \(e\) com a Divisão \(d\) com a unidade Carga mínima \(Min\) com a unidade unidade unidade Faixa 2 Faixa 3/,
    )
    // Classes II a IIII: a classe I usa a folha da balança cadastrada (a linha ao lado das opções diz isso)
    expect(t).toMatch(
      /Classe I: cadastre a balança Classe II III IIII não marcada Faixas única multi-intervalo múltiplas e imprima a folha dela/,
    )
    expect(t).toContain('prato redondo')
    expect(t).toContain(
      '0, Min (se marcada), 25, 50, 75 e 100 % de Max e em 500e e 2000e (classe III). Zere, aplique e anote a indicação.',
    )
    // Sem o EMA: a coluna e a caixa que o explicavam saíram da folha
    expect(t).not.toMatch(/\bEMA\b/)
    expect(t).toContain('no mínimo 1/3 de Max até 500 kg, 1/5 de Max até 3 t e 1/10 de Max acima')
    expect(t).toContain('6 REPETIBILIDADE Cerca de metade de Max no centro: anote, retire e anote o zero; repita.')
    // Os padrões ativos aparecem para marcar; nenhum dado de cliente ou balança
    expect(t).toContain('PP500-01 a 20')
    expect(t).not.toContain('FRIGORÍFICO')
    // O endereço do cadastro do cliente, que o certificado também traz
    expect(t).toMatch(/Endereço do cliente \(sai no certificado\)/)
    expect(t).toContain('o mesmo do')
    // O POP não cobre rodoviárias nem ferroviárias: a folha em branco não tem substituição nem receptor rodoviário
    expect(t).not.toMatch(/Substi- .{0,150}tuições/)
    expect(t).not.toContain('Cargas de substituição')
    expect(t).not.toMatch(/rodoviária|Rodoviária|só crescente/)
    expect(t).toMatch(/Receptor de carga retangular \/ quadrado prato redondo mais de 4 apoios gancho tanque \/ silo/)
    // Nenhuma dica da classe I (ela não usa a folha em branco)
    expect(t).not.toMatch(/classe I\b(?!I)|uma peça só/)
    expect(t).toContain('Pesos (não precisa ser padrão)')
    // 12 leituras na repetibilidade (5 bastam, até 10 com k = 2, em duas faixas; quantas vezes no canto das caixas), 9
    // pontos e 6 posições de excentricidade em duas faixas de 3 (mais, no espaço livre), com a posição escrita no local
    expect(t).toMatch(/1ª 2ª 3ª 4ª · < 100 kg 5ª · < 100 kg 6ª · opcional/)
    expect(t).toMatch(/7ª · opcional 8ª · opcional 9ª · opcional 10ª · opcional 11ª · opcional 12ª · opcional/)
    expect(t).toMatch(/\b9\b RETORNO AO ZERO/)
    expect(t).toContain(
      '7 EXCENTRICIDADE NO SISTEMA 5 · Excentricidade Zere vazia e desloque a carga pelas posições (carga: no mínimo 1/3 de Max até 500 kg, 1/5 de Max até 3 t e 1/10 de Max acima), na ordem do desenho; escreva a posição de cada coluna (mais de 4 apoios ou tanque: uma por apoio). Frente: indicador (se remoto, o de acesso).',
    )
    expect(t).toMatch(/Posição escreva 1 2 3 .*Indicação \(unid\.\) .*Posição escreva 4 5 6 .*Indicação \(unid\.\)/)
    expect(t).not.toContain('Zero antes')
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

// Frente e verso também com 14 pontos (com as anotações na chegada): a tabela vai inteira, e o técnico não vira a folha
// no meio do ensaio
const VARIANTES = [6, 7, 8, 9, 10, 11, 12, 13, 14].flatMap((n) => [
  { nome: 'plataforma 300 kg', n, dados: folhaPlataforma, maxPaginas: 2 },
  { nome: 'balcão multi-intervalo', n, dados: folhaMultiIntervalo, maxPaginas: 2 },
])

describe.runIf(temPdftotext)('montagem com 6 a 14 pontos', { timeout: 120_000 }, () => {
  it.each(VARIANTES)('$nome com $n pontos: título de cada passo uma vez por página, sem quadro solto', async (v) => {
    const m = await montar(comPontos(v.dados, v.n))
    const paginas = paginasDe(textoDoPdf(m.pdf))
    expect(paginas.length).toBeLessThanOrEqual(v.maxPaginas)
    for (const [i, p] of paginas.entries()) {
      // "7 EXCENTRICIDADE…" e "7 EXCENTRICIDADE… (CONTINUAÇÃO)" na mesma página: título sobrando no meio dela
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
    // As assinaturas nunca vão sozinhas para a última página: a excentricidade vai junto
    expect(corrido(paginas.at(-1)!)).toMatch(
      /7 EXCENTRICIDADE .*8 ASSINATURAS (E ETIQUETA CERTIFICADO Nº CC-\d{4}-\d{5} )?NO SISTEMA/,
    )
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
    it('balcão sem calibração anterior, com todos os padrões da empresa: inteiros só os que vão a campo, os outros numa linha, 2 páginas', async () => {
      const d = folhaMultiIntervalo()
      // Como o sistema faz sem histórico: o rascunho prevê todos os padrões ativos (os 6 de exemplo)
      expect(d.padroes).toHaveLength(6)
      expect(d.calibracao!.padroesIds).toHaveLength(6)
      const m = await montar(d)
      expect(m.paginas).toBe(2)
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
      expect(corrido(paginas[1])).toMatch(/7 EXCENTRICIDADE .*8 ASSINATURAS/)
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

    it('identificação no alto da página só com a OS: nomes longos não passam da margem nem se repetem em toda página', async () => {
      const d = folhaPlataforma()
      d.cliente = { ...d.cliente!, nome: 'Cooperativa dos Produtores de Cana-de-Açúcar do Vale do Corumbataí' }
      d.balanca = { ...d.balanca!, numeroSerie: 'SN-2019-0004471-BR-XT', identificacao: 'Balança de expedição nº 3 — doca sul' }
      const pdf = await gerarFolhaCampoPdf(d)
      const paginas = paginasDe(textoDoPdf(pdf))
      for (const p of paginas) {
        const t = corrido(p)
        expect(t).toMatch(/Página \d de \d OS OS-2026-0512 /)
        expect(t).not.toContain('· TAG')
        expect(t).not.toContain('Cooperativa dos Produtores')
      }
      // O nº de série e a TAG só na identificação da balança (passo 3, na frente); no verso, nada deles
      expect(paginas[0]).toContain('SN-2019-')
      expect(paginas[0]).toContain('doca sul')
      for (const p of paginas.slice(1)) expect(p).not.toMatch(/SN-2019|doca sul/)
      // Nenhuma palavra passa da margem direita (12 mm), em nenhuma página
      for (const palavras of palavrasDoPdf(pdf))
        expect(Math.max(...palavras.map((w) => w.x1))).toBeLessThanOrEqual(A4.largura - 33)
    })

    it('escrita à mão com folga (≈ 6,5 mm): livres embaixo do rótulo (caixas de rótulo em cima) ou de fio a fio (campos em linha)', async () => {
      const branco = await gerarFolhaCampoPdf(folhaEmBranco())
      const pb = palavrasDoPdf(branco)
      // Caixas com o rótulo em cima (o que é longo: endereço, plataforma, portaria, dimensões; a hora do ensaio)
      for (const rotulo of [
        ['Endereço', 'da', 'calibração'],
        ['Contato', 'e', 'telefone'],
        ['Plataforma', '(fabricante,'],
        ['Portaria', 'de', 'aprovação'],
        ['Dimensões', 'do', 'prato'],
        ['Início', 'do', 'ensaio'],
      ]) {
        const { mm } = livreEmbaixo(branco, pb, rotulo)
        expect(mm, rotulo.join(' ')).toBeGreaterThanOrEqual(6.4)
      }
      // Campos em linha (o curto: hora, data, um número, um nome; o nome do cliente, que cabe numa linha larga): a
      // linha inteira com ≈ 6,5 mm
      for (const rotulo of [
        ['Razão', 'social', '/', 'Nome'],
        ['CNPJ', '/', 'CPF'],
        ['Nº', 'da', 'OS'],
        ['Hora', 'de', 'início'],
        ['Tipo', 'de', 'balança'],
        ['Nº', 'de', 'apoios'],
        ['Carga', 'aplicada'],
        ['Carga', 'usada'],
      ]) {
        const { mm } = alturaDaLinha(branco, pb, rotulo)
        expect(mm, rotulo.join(' ')).toBeGreaterThanOrEqual(6.3)
      }
      // O técnico previsto vai embaixo do rótulo, em letra miúda: a linha fica livre para o nome de quem executou
      const plataforma = await gerarFolhaCampoPdf(folhaPlataforma())
      expect(corrido(textoDoPdf(plataforma))).toMatch(/Técnico que executou ● .{0,80}previsto: Carlos Eduardo Lima/)
      expect(alturaDaLinha(plataforma, palavrasDoPdf(plataforma), ['Técnico', 'que', 'executou']).mm).toBeGreaterThanOrEqual(6.3)
      // As linhas de leitura (pontos, repetibilidade, excentricidade, ambiente) também
      for (const rotulo of [
        ['Zero', 'após', 'retirar'],
        ['Indicação', '(kg)'],
        ['Início', '15', 'min'],
      ])
        expect(alturaDaLinha(plataforma, palavrasDoPdf(plataforma), rotulo).mm, rotulo.join(' ')).toBeGreaterThanOrEqual(6.3)
      // As assinaturas, com mais espaço (≈ 10 mm embaixo do rótulo)
      expect(livreEmbaixo(plataforma, palavrasDoPdf(plataforma), ['Técnico', 'que', 'executou', '—']).mm).toBeGreaterThanOrEqual(
        9.5,
      )
    })

    it('carga da excentricidade e da repetibilidade sem a regra dentro da caixa: a regra vai na instrução', async () => {
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(folhaEmBranco())))
      expect(t).toContain(
        'Zere vazia e desloque a carga pelas posições (carga: no mínimo 1/3 de Max até 500 kg, 1/5 de Max até 3 t e 1/10 de Max acima), na ordem do desenho',
      )
      expect(t).toMatch(/Carga usada Pesos ou carga usada Hora/)
      expect(t).not.toContain('cerca de Max/2')
    })
  },
)

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

  it('em branco com os 6 padrões do uso real: 2 páginas, um padrão por linha, sem repetir a classe', async () => {
    const d = { ...folhaEmBranco(), padroes: padroesDoUso() }
    const m = await montar(d)
    expect(m.paginas).toBe(2)
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
    // A excentricidade e as assinaturas ficam juntas na última página
    const ultima = corrido(paginasDe(texto).at(-1)!)
    expect(ultima).toMatch(/7 EXCENTRICIDADE .* 8 ASSINATURAS/)
  })

  it('amostra em branco com 8 padrões: 2 páginas, um padrão por linha, descrição inteira, sem repetir a classe', async () => {
    const d = folhaEmBrancoOitoPadroes()
    expect(d.padroes.filter((p) => p.ativo)).toHaveLength(8)
    const m = await montar(d)
    expect(m.paginas).toBe(2)
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

  it.each([6, 8, 10, 12])(
    'em branco com %i padrões: 2 páginas, os ensaios no verso, e a tabela dos pontos não se divide',
    async (n) => {
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
      expect(m.paginas).toBe(2)
      expect(m.faltando).toEqual([])
      expect(m.extras.cortes).toEqual([])
      expect(m.extras.ensaiosNoVerso).toBe(true)
      const linhas = Array.from({ length: 10 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
      expect(new Set(linhas)).toEqual(new Set([2]))
      expect(m.marcas.get('fim:passo-5')?.pagina).toBe(2)
    },
  )

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

  it('folha em branco de uma empresa com 60 padrões: a tabela dos padrões se divide, com o cabeçalho de novo', async () => {
    const d = folhaEmBranco()
    const base = padroesDaEmpresa()
    d.padroes = Array.from({ length: 60 }, (_, i): Padrao => ({
      ...base[i % base.length],
      id: `pad-${i}`,
      identificacao: `PD-${String(i + 1).padStart(2, '0')}`,
    }))
    const m = await montar(d)
    expect(m.faltando).toEqual([])
    const texto = textoDoPdf(m.pdf)
    const t = corrido(texto)
    for (const x of TITULOS_PASSOS) expect(t).toContain(x)
    for (let i = 1; i <= 60; i++) expect(t).toContain(`PD-${String(i).padStart(2, '0')}`)
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
    expect(t).toContain('150 vezes')
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

describe.runIf(temPdftotext)('correções da 3ª revisão: método, tabela inteira e peças usadas', { timeout: 180_000 }, () => {
  it('o método e a hora do início numa linha só: o previsto é o do ensaio do sistema; a coluna que ele não usa, mais estreita', async () => {
    const d = folhaPlataforma()
    const k = structuredClone(d.calibracao!)
    k.indicacao = { ...k.indicacao, metodo: 'CONTINUO' }
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf({ ...d, calibracao: k })))
    expect(t).toMatch(
      /Como as cargas foram aplicadas Início do ensaio Crescente e decrescente Crescente com descarga Crescente contínuo PREVISTO Decrescente ____:____/,
    )
    expect(t.match(/Início do ensaio/g)).toHaveLength(1)
    expect(t).toContain('(vá somando os pesos, sem descarregar)')
    // Só subindo: a ↓ sai mais estreita
    const [tabela] = nosQue((definicaoFolhaCampo({ ...d, calibracao: k }) as { content: unknown }).content, (x) =>
      JSON.stringify((x.table as { body?: unknown[][] } | undefined)?.body?.[0] ?? '').includes('Indicação ↓'),
    )
    const larguras = (tabela.table as { widths: number[] }).widths
    expect(larguras[4]).toBeLessThan(larguras[3])
    // O retorno ao zero numa linha, com uma caixa para escrever
    expect(t).toMatch(/RETORNO AO ZERO sem carga/)
  })

  it('rodoviária sem histórico: com substituição, "crescente contínuo" previsto (sem descer)', async () => {
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(folhaRodoviariaSemHistorico())))
    expect(t).toContain('aplique as cargas na ordem da tabela (vá somando os pesos, sem descarregar)')
    expect(t).not.toContain('suba até a maior')
    expect(t.match(/Crescente contínuo PREVISTO/g)).toHaveLength(1)
    expect(t).not.toMatch(/Crescente e decrescente PREVISTO/)
    // A instrução diz: com substituição, só crescente; a nota das etapas diz por quê
    expect(t).toContain(
      'Zere vazia e aplique as cargas na ordem da tabela (vá somando os pesos, sem descarregar); anote a indicação estável. Com cargas de substituição: só crescente.',
    )
    expect(t).toContain('Só crescente: para descer, seria preciso tirar o material.')
  })

  it('sem substituição na folha (balança que não é rodoviária): a instrução não fala dela', async () => {
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(folhaPlataforma())))
    expect(t).toContain(
      '(suba até a maior ↑ e desça sem descarregar ↓); anote a indicação estável. Como as cargas foram aplicadas',
    )
    expect(t).not.toContain('Com cargas de substituição')
  })

  it.each([{ nome: 'rodoviária 80 t', dados: folhaRodoviaria }])(
    '$nome: os ensaios no verso, com o título, o método, os pontos e as etapas de substituição juntos (2 páginas)',
    async ({ dados }) => {
      const m = await montar(dados())
      expect(m.paginas).toBe(2)
      expect(m.extras.etapasAParte).toBeFalsy()
      expect(m.extras.avisoPontos).toBeFalsy()
      // As etapas sem a linha a mais e o passo 7 num bloco só: tudo do passo 5 em diante cabe no verso
      expect(m.extras.ensaiosNoVerso).toBe(true)
      expect(m.extras.continuacoes).toEqual([])
      const [frente, verso] = paginasDe(textoDoPdf(m.pdf)).map(corrido)
      expect(frente).not.toContain('ERRO DE INDICAÇÃO')
      // O que se lê antes das tabelas fica com o título: o método e como fazer as etapas
      expect(verso).toMatch(/Página 2 de 2 OS \S+ 5 ERRO DE INDICAÇÃO NO SISTEMA/)
      expect(verso).toMatch(/Como as cargas foram aplicadas .* Cargas de substituição: em cada etapa/)
      expect(verso).toContain('RETORNO AO ZERO')
      expect(verso).toMatch(/Cargas de substituição( sugeridas)? — 10 000 kg de pesos padrão em cada etapa/)
      expect(verso).not.toMatch(/\(CONTINUAÇÃO\)|na próxima página/)
    },
  )

  it('rodoviária multi-intervalo (11 pontos e 7 etapas): o título e o método no pé da frente, com o aviso; as tabelas juntas no verso', async () => {
    const m = await montar(folhaRodoviariaMultiIntervalo())
    expect(m.paginas).toBe(2)
    expect(m.extras.etapasAParte).toBeFalsy()
    expect(m.extras.avisoPontos).toBe(true)
    // Os ensaios não cabem inteiros no verso: o título do passo 5 fica na frente
    expect(m.extras.ensaiosNoVerso).toBeFalsy()
    const [frente, verso] = paginasDe(textoDoPdf(m.pdf)).map(corrido)
    expect(frente).toMatch(
      /5 ERRO DE INDICAÇÃO NO SISTEMA .*Como as cargas foram aplicadas .* Cargas de substituição: em cada etapa/,
    )
    expect(frente).toContain('Tabelas na próxima página: os pontos e as etapas de substituição, juntos.')
    expect(verso).toMatch(/^.*5 ERRO DE INDICAÇÃO \(CONTINUAÇÃO\) NO SISTEMA 6 · Erro de indicação Nº Carga/)
    expect(verso).toContain('RETORNO AO ZERO')
    expect(verso).toMatch(/Cargas de substituição — 10 000 kg de pesos padrão em cada etapa/)
    // A repetibilidade, a excentricidade inteira e as assinaturas também no verso
    expect(verso).toMatch(/6 REPETIBILIDADE .*7 EXCENTRICIDADE .*Carga usada \(kg\) .*8 ASSINATURAS/)
  })

  it('rodoviária 60 t sem histórico (verso cheio, com o lembrete do ambiente do fim): o título e o método no pé da frente, com o aviso; as tabelas juntas no verso', async () => {
    const m = await montar(folhaRodoviariaSemHistorico())
    expect(m.paginas).toBe(2)
    expect(m.faltando).toEqual([])
    expect(m.extras.etapasAParte).toBeFalsy()
    expect(m.extras.avisoPontos).toBe(true)
    expect(m.extras.ensaiosNoVerso).toBeFalsy()
    const [frente, verso] = paginasDe(textoDoPdf(m.pdf)).map(corrido)
    expect(frente).toMatch(
      /4 AMBIENTE .*5 ERRO DE INDICAÇÃO NO SISTEMA .*Como as cargas foram aplicadas .* Cargas de substituição: em cada etapa/,
    )
    expect(frente).toContain('Tabelas na próxima página: os pontos e as etapas de substituição, juntos.')
    expect(verso).toMatch(/^.*5 ERRO DE INDICAÇÃO \(CONTINUAÇÃO\) NO SISTEMA 6 · Erro de indicação Nº Carga/)
    expect(verso).toMatch(/Cargas de substituição sugeridas — 10 000 kg de pesos padrão em cada etapa/)
    expect(verso).toMatch(
      /6 REPETIBILIDADE .*7 EXCENTRICIDADE .*8 ASSINATURAS .*Antes de assinar: preencha a linha Fim do passo 4\./,
    )
    // O pé da frente, depois do aviso das tabelas, é o bloco Anotações
    expect(frente).toMatch(/Tabelas na próxima página: os pontos e as etapas de substituição, juntos\. ANOTAÇÕES — /)
  })

  it('rodoviária com anotações longas na chegada: tudo continua em 2 páginas, sem repetir o "como fazer" das etapas', async () => {
    const d = folhaRodoviariaSemHistorico()
    d.calibracao = {
      ...d.calibracao!,
      anotacoesInternas:
        'Procurar a Juliana na portaria 2; acesso à doca só com botina, capacete e protetor auricular. Integração de segurança obrigatória (30 min) antes de entrar. Não estacionar na doca 1. Levar nota fiscal dos pesos para a portaria. ' +
        'Ligar para o Eng. Ricardo 30 min antes de chegar; a balança fica desligada aos domingos e o caminhão de lastro precisa ser agendado com dois dias de antecedência na logística.',
    }
    const m = await montar(d)
    expect(m.paginas).toBe(2)
    expect(m.faltando).toEqual([])
    expect(m.extras.etapasAParte).toBeFalsy()
    const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
    const i = paginas.findIndex((p) => p.includes('5 ERRO DE INDICAÇÃO NO SISTEMA'))
    expect(paginas[i]).toMatch(/Como as cargas foram aplicadas .* Cargas de substituição: em cada etapa/)
    const tabelas = paginas.findIndex((p) => p.includes('RETORNO AO ZERO'))
    expect(paginas[tabelas]).toMatch(/Cargas de substituição sugeridas — 10 000 kg de pesos padrão em cada etapa/)
    // O "como fazer" das etapas uma vez só
    expect(paginas.join(' ').match(/[Ee]m cada etapa, anote a indicação/g)).toHaveLength(1)
  })

  it('anotações enormes na chegada (rodoviária multi-intervalo): as tabelas juntas, nada some, 2 páginas', async () => {
    const d = folhaRodoviariaMultiIntervalo()
    d.calibracao = {
      ...d.calibracao!,
      anotacoesInternas: 'Ligar para o Eng. Ricardo 30 min antes de chegar; a balança fica desligada aos domingos. '.repeat(12),
    }
    const m = await montar(d)
    expect(m.paginas).toBe(2)
    expect(m.faltando).toEqual([])
    expect(m.extras.etapasAParte).toBeFalsy()
    const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
    const i = paginas.findIndex((p) => p.includes('5 ERRO DE INDICAÇÃO NO SISTEMA'))
    expect(paginas[i]).toMatch(/Como as cargas foram aplicadas .* Cargas de substituição: em cada etapa/)
    const tabelas = paginas.findIndex((p) => p.includes('RETORNO AO ZERO'))
    expect(paginas[tabelas]).toMatch(/Cargas de substituição — 10 000 kg de pesos padrão em cada etapa/)
    expect(paginas.join(' ').match(/[Ee]m cada etapa, anote a indicação/g)).toHaveLength(1)
  })

  it('tabela que cabe no verso com o título: os ensaios no verso, sem aviso de continuação (em branco com 8 padrões)', async () => {
    const m = await montar(folhaEmBrancoOitoPadroes())
    expect(m.extras.avisoPontos).toBeFalsy()
    expect(m.extras.ensaiosNoVerso).toBe(true)
    const t = corrido(textoDoPdf(m.pdf))
    expect(t).not.toMatch(/na próxima página/)
    const pontos = Array.from({ length: 9 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    // A marca do fim do título do passo (a do começo fica na página de antes, se ele passou para a seguinte)
    expect(pontos.every((p) => p === m.marcas.get('fim:passo-5')?.pagina)).toBe(true)
  })

  it('frente e verso: na frente, os passos 1 a 4; no verso, os ensaios (5 a 7) e as assinaturas', async () => {
    for (const dados of [folhaPlataforma, folhaMultiIntervalo, folhaClasseI, folhaEmBranco, folhaEmBrancoOitoPadroes]) {
      const m = await montar(dados())
      expect(m.paginas, dados.name).toBe(2)
      expect(m.extras.ensaiosNoVerso, dados.name).toBe(true)
      expect(m.extras.avisoPontos, dados.name).toBeFalsy()
      expect(m.extras.continuacoes, dados.name).toEqual([])
      const [frente, verso] = paginasDe(textoDoPdf(m.pdf)).map(corrido)
      for (const x of TITULOS_PASSOS.slice(0, 4)) expect(frente, `${dados.name}: ${x}`).toContain(x)
      for (const x of TITULOS_PASSOS.slice(4)) expect(verso, `${dados.name}: ${x}`).toContain(x)
      expect(verso).toMatch(/Página 2 de 2 OS (\S+ )?5 ERRO DE INDICAÇÃO NO SISTEMA/)
    }
  })

  it('lembrete do ambiente do fim (a linha Fim fica na frente): no passo 8, numa linha, logo acima das assinaturas, com e sem nº reservado', async () => {
    for (const e of EXEMPLOS)
      for (const d of [e.dados(), { ...e.dados(), numeroCertificado: undefined }]) {
        const m = await montar(d)
        const paginas = paginasDe(textoDoPdf(m.pdf))
        const ultima = paginas.at(-1)!
        const linha = ultima.split('\n').find((l) => l.includes('Antes de assinar'))
        expect(linha?.trim(), e.nome).toBe(LEMBRETE_AMBIENTE_FIM)
        const corr = corrido(ultima)
        expect(corr.indexOf('ASSINATURAS'), e.nome).toBeLessThan(corr.indexOf(LEMBRETE_AMBIENTE_FIM))
        expect(corr.indexOf(LEMBRETE_AMBIENTE_FIM), e.nome).toBeLessThan(corr.indexOf('Técnico que executou — nome e assinatura'))
        // A linha Fim do passo 4 está na frente
        expect(corrido(paginas[0]), e.nome).toMatch(/4 AMBIENTE .*Fim após o passo 7/)
      }
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
})

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
  // A última página leva o fim da folha (as assinaturas) e pode ter espaço: só ela pode ter mais da metade em branco
  it.each(EXEMPLOS)('$nome: nenhuma página com mais da metade em branco (fora a última)', async (e) => {
    const m = await montar(e.dados())
    const brancos = brancoNoPe(m.pdf, m.paginas)
    for (const [i, mm] of brancos.slice(0, -1).entries()) expect(mm, `página ${i + 1}`).toBeLessThan(MEIA_PAGINA_MM)
  })

  it('rodoviária 80 t: 2 páginas, frente e verso: o título, o método, os pontos e as etapas (juntos) na p.2', async () => {
    const m = await montar(folhaRodoviaria())
    expect(m.paginas).toBe(2)
    expect(m.marcas.get(`fim:${'parte-5-1'}`)?.pagina).toBe(2)
    expect(m.marcas.get('fim:passo-5')?.pagina).toBe(2)
    expect(m.extras.ensaiosNoVerso).toBe(true)
    expect(m.extras.avisoPontos).toBeFalsy()
  })

  it('textos longos: a tabela dos pontos vai inteira; a última página não fica só com as assinaturas', async () => {
    const m = await montar(plataformaComTextosLongos())
    expect(m.paginas).toBe(2)
    expect(m.extras.cortes).toEqual([])
    const linhas = Array.from({ length: 7 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    expect(new Set(linhas).size).toBe(1)
    const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
    expect(paginas).toHaveLength(m.paginas)
    expect(paginas.at(-1)).toMatch(/7 EXCENTRICIDADE .* 8 ASSINATURAS/)
    for (const [i, mm] of brancoNoPe(m.pdf, m.paginas).slice(0, -1).entries())
      expect(mm, `página ${i + 1}`).toBeLessThan(MEIA_PAGINA_MM)
  })

  it.each([
    ...EXEMPLOS,
    {
      nome: 'rodoviária multi-intervalo com um ensaio de repetibilidade por intervalo (3 páginas)',
      dados: () =>
        folhaRodoviariaMultiIntervalo([
          { id: 'r1', carga: 10_000, leituras: [null, null, null] },
          { id: 'r2', carga: 40_000, leituras: [null, null, null] },
          { id: 'r3', carga: 70_000, leituras: [null, null, null] },
        ]),
      maxPaginas: 3,
    },
  ])(
    '$nome: o passo 7 inteiro (título, instrução, carga, desenho e leituras) e as assinaturas num bloco só, na mesma página',
    async (e) => {
      const doc = definicaoFolhaCampo(e.dados()) as { content: Array<{ id?: string; unbreakable?: boolean }> }
      // O passo 8 não é um bloco à parte, no fim do conteúdo: vai dentro do bloco inteiro do passo 7, que leva o título,
      // a carga e as leituras (sem outra parte do passo 7 que pudesse ir para a página seguinte)
      expect(doc.content.some((x) => x.id === 'passo-8')).toBe(false)
      const blocos = doc.content.filter((x) => x.unbreakable && JSON.stringify(x).includes('"id":"passo-8"'))
      expect(blocos).toHaveLength(1)
      expect(blocos[0].id).toBe('passo-7')
      expect(JSON.stringify(blocos[0])).toMatch(/"EXCENTRICIDADE"/)
      expect(JSON.stringify(blocos[0])).toMatch(/"Indicação"/)
      expect(JSON.stringify(blocos[0])).toMatch(/"Carga( usada)?( \(\w+\))?"/)
      expect(doc.content.some((x) => /^parte-7-/.test(x.id ?? ''))).toBe(false)
      const m = await montar(e.dados())
      expect(m.paginas).toBeLessThanOrEqual(e.maxPaginas)
      // O título do passo 7, a carga e as leituras da excentricidade (e as assinaturas) na mesma página: a última
      const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
      const comTitulo = paginas.findIndex((p) => p.includes('7 EXCENTRICIDADE'))
      expect(comTitulo).toBe(paginas.length - 1)
      const passo7 = paginas[comTitulo].slice(paginas[comTitulo].indexOf('7 EXCENTRICIDADE'))
      expect(passo7).toMatch(/Indicação \((kg|g|unid\.)\)/)
      expect(passo7).toMatch(/Carga/)
      expect(passo7).toMatch(/8 ASSINATURAS/)
      expect(passo7).toContain('Hora de término')
      expect(paginas.join(' ')).not.toContain('7 EXCENTRICIDADE (CONTINUAÇÃO)')
    },
  )

  it('fim da folha enxuto: as assinaturas, a data e a hora do término numa linha', () => {
    const doc = definicaoFolhaCampo(folhaRodoviariaSemHistorico()) as { content: unknown[] }
    const [tabela] = nosQue(doc.content, (x) => {
      const t = x.table as { body?: unknown[][] } | undefined
      return !!t?.body?.[0] && JSON.stringify(t.body[0]).includes('Técnico que executou — nome e assinatura')
    })
    const body = (tabela.table as { body: unknown[][] }).body
    expect(body).toHaveLength(1)
    for (const x of ['Pelo cliente — nome, função e assinatura', 'Data da calibração', '"Hora de término"'])
      expect(JSON.stringify(body)).toContain(x)
  })
})

describe.runIf(temPdftotext)(
  'passo 5 da rodoviária longa: os pontos na página do título, as etapas à parte',
  { timeout: 240_000 },
  () => {
    /** Página de cada linha da tabela dos pontos. */
    const paginasDosPontos = (m: Awaited<ReturnType<typeof montar>>) => {
      const out: number[] = []
      for (let i = 0; m.marcas.has(`linha-pontos:${i}`); i++) out.push(m.marcas.get(`linha-pontos:${i}`)!.pagina)
      return out
    }
    // Em 2 páginas; com um ensaio de repetibilidade por intervalo (dois a mais, ≈ 28 mm), o passo 7 (inteiro, com as
    // assinaturas) vai para a página 3
    it.each([
      { nome: 'multi-intervalo 30/60/80 t, 4 padrões (amostra)', dados: () => folhaRodoviariaMultiIntervalo(), maxPaginas: 2 },
      {
        nome: 'multi-intervalo, um ensaio de repetibilidade por intervalo',
        dados: () =>
          folhaRodoviariaMultiIntervalo([
            { id: 'r1', carga: 10_000, leituras: [null, null, null] },
            { id: 'r2', carga: 40_000, leituras: [null, null, null] },
            { id: 'r3', carga: 70_000, leituras: [null, null, null] },
          ]),
        maxPaginas: 3,
      },
      {
        nome: 'faixa única 80 000 × 20 kg, 2 padrões',
        dados: () => {
          const d = folhaRodoviariaMultiIntervalo()
          d.balanca = { ...d.balanca!, tipoFaixas: 'UNICA', faixas: [{ max: 80_000, e: 20, d: 20 }] }
          d.padroes = d.padroes.filter((p) => !['BR-01', 'PP20-01 a 15'].includes(p.identificacao))
          return d
        },
        maxPaginas: 2,
      },
    ])('$nome: 11 pontos e 7 etapas em até $maxPaginas páginas, sem página quase vazia', async ({ dados, maxPaginas }) => {
      const d = dados()
      expect(d.calibracao!.indicacao.pontos).toHaveLength(11)
      expect(d.calibracao!.indicacao.substituicao.etapas).toHaveLength(7)
      const m = await montar(d)
      expect(m.faltando).toEqual([])
      expect(m.paginas).toBeLessThanOrEqual(maxPaginas)
      // A tabela dos pontos inteira numa página; se ela não ficou na do título do passo 5, a do título avisa (o título e
      // o método no pé dela) ou o título foi junto, e a tabela abre a página com o título de continuação
      const titulo = m.marcas.get('fim:passo-5')!.pagina
      const [pontos, ...outras] = [...new Set(paginasDosPontos(m))]
      expect(outras).toEqual([])
      const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
      expect(paginas[pontos - 1]).toContain('RETORNO AO ZERO')
      if (pontos !== titulo) {
        expect(m.extras.avisoPontos).toBe(true)
        expect(paginas[titulo - 1]).toMatch(/na próxima página/)
        expect(paginas[pontos - 1]).toContain('5 ERRO DE INDICAÇÃO (CONTINUAÇÃO)')
      }
      // As etapas na página dos pontos ou depois, com o título de continuação se abrirem a página
      const etapas = paginas.findIndex((p) => p.includes('Cargas de substituição — 10 000 kg de pesos padrão em cada etapa'))
      expect(etapas).toBeGreaterThanOrEqual(pontos - 1)
      if (etapas > pontos - 1)
        expect(paginas[etapas]).toMatch(
          /5 ERRO DE INDICAÇÃO \(CONTINUAÇÃO\) NO SISTEMA 6 · Erro de indicação Cargas de substituição —/,
        )
      // O "como fazer" das etapas não se repete na tabela delas
      expect(paginas.join(' ').match(/[Ee]m cada etapa, anote a indicação/g)).toHaveLength(1)
      // Nenhuma página (fora a última) com mais da metade em branco
      for (const [i, mm] of brancoNoPe(m.pdf, m.paginas).slice(0, -1).entries())
        expect(mm, `página ${i + 1}`).toBeLessThan(MEIA_PAGINA_MM)
    })

    it('pontos e etapas que cabem juntos numa página continuam juntos (rodoviária 80 t, 60 t)', async () => {
      for (const dados of [folhaRodoviaria, folhaRodoviariaSemHistorico]) {
        const m = await montar(dados())
        expect(m.extras.etapasAParte, dados.name).toBeFalsy()
        expect(m.paginas, dados.name).toBe(2)
      }
    })
  },
)

describe.runIf(temPdftotext)('pontos com substituição: sem a faixa do EMA e sem a nota da soma ΔI', { timeout: 120_000 }, () => {
  it.each(
    [folhaRodoviaria, folhaRodoviariaSemHistorico, folhaPlataforma, folhaMultiIntervalo, folhaEmBranco].map((dados) => ({
      nome: dados.name,
      dados,
    })),
  )('$nome', async ({ dados }) => {
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(dados())))
    expect(t).not.toContain('ΣΔI')
    expect(t).not.toMatch(/\d a −?\d[\d ]*,?\d* \+/)
    expect(t).not.toContain('(erro = indicação − carga')
  })
})

describe('nº do certificado reservado na impressão', { timeout: 60_000 }, () => {
  type Doc = { header: (p: number, t: number) => unknown; content: unknown; info: { keywords: string } }
  const doc = (d: DadosFolhaCampo) => definicaoFolhaCampo(d) as unknown as Doc

  it('no alto de toda página, ao lado do nº da folha, com a dica da etiqueta', () => {
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
    for (const p of [1, 2, 3]) expect(cab(p)).toContain(DICA_ETIQUETA)
    expect(DICA_ETIQUETA).toBe('Vai na etiqueta (passo 8)')
    expect(doc(d).info.keywords).toContain('certificado CC-2026-00125')
  })

  it('sem nº (folha de antes desta versão, ou de uma revisão), nada: nem no cabeçalho, nem a nota da etiqueta; o passo 8 é só das assinaturas', () => {
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
      expect(json).not.toContain('CERTIFICADO Nº')
      expect(json).not.toContain('Assinaturas e etiqueta')
      expect(json).toContain('"ASSINATURAS"')
      expect(json).not.toContain('CC-2026-00125')
      expect(x.info.keywords).not.toContain('certificado ')
    }
  })

  it.runIf(temPdftotext)(
    'texto: o nº em toda página, ao lado do da folha; no passo 8, o nº e a nota da etiqueta numa linha',
    async () => {
      const m = await montar(folhaPlataforma())
      expect(m.paginas).toBe(2)
      const texto = textoDoPdf(m.pdf)
      const paginas = paginasDe(texto)
      for (const [i, p] of paginas.entries()) {
        // Na mesma linha do nº da folha, à esquerda dele
        const linha = p.split('\n').find((l) => l.includes('FC-2026-00042'))!
        expect(linha, `página ${i + 1}`).toMatch(/CC-2026-00125 +FC-2026-00042/)
        expect(corrido(p), `página ${i + 1}`).toMatch(/CERTIFICADO Nº +FOLHA DE CAMPO — CALIBRAÇÃO DE BALANÇA/)
        expect(corrido(p), `página ${i + 1}`).toContain(DICA_ETIQUETA)
      }
      // A nota inteira numa linha só, logo embaixo do título do passo 8 (com o nº), na página das assinaturas
      const ultima = paginas.at(-1)!
      const linhas = ultima.split('\n')
      const titulo = linhas.findIndex((l) => /8 +ASSINATURAS E ETIQUETA +CERTIFICADO Nº CC-2026-00125 +NO SISTEMA/.test(l))
      expect(titulo).toBeGreaterThan(0)
      const nota = linhas.findIndex((l) => l.includes('Copie este nº na etiqueta de calibração'))
      expect(nota).toBeGreaterThan(titulo)
      expect(nota - titulo).toBeLessThanOrEqual(2)
      expect(linhas[nota].trim()).toBe(AVISO_ETIQUETA)
      expect(corrido(ultima).indexOf(AVISO_ETIQUETA)).toBeLessThan(corrido(ultima).indexOf('Técnico que executou'))
    },
  )

  it('em branco (folha avulsa): também com o nº reservado, no cabeçalho de toda página e no passo 8', () => {
    for (const [d, numero] of [
      [folhaEmBranco(), 'CC-2026-00129'],
      [folhaEmBrancoOitoPadroes(), 'CC-2026-00130'],
    ] as const) {
      expect(d.numeroCertificado).toBe(numero)
      const x = doc(d)
      for (const p of [1, 2, 3, 4]) expect(JSON.stringify(x.header(p, 4))).toContain(`"${numero}"`)
      for (const p of [1, 2]) expect(JSON.stringify(x.header(p, 4))).toContain(DICA_ETIQUETA)
      expect(JSON.stringify(x.content)).toContain(AVISO_ETIQUETA)
      expect(x.info.keywords).toContain(`certificado ${numero}`)
    }
  })

  it.runIf(temPdftotext).each([
    { nome: 'em branco', dados: folhaEmBranco, numero: 'CC-2026-00129' },
    { nome: 'em branco com 8 padrões', dados: folhaEmBrancoOitoPadroes, numero: 'CC-2026-00130' },
  ])(
    '$nome com nº: 2 páginas, o nº e a dica da etiqueta em toda página e a nota da etiqueta no passo 8',
    async ({ dados, numero }) => {
      const com = await montar(dados())
      expect(com.paginas).toBe(2)
      expect(com.faltando).toEqual([])
      const paginas = paginasDe(textoDoPdf(com.pdf))
      expect(paginas).toHaveLength(com.paginas)
      for (const [i, p] of paginas.entries()) {
        expect(p, `página ${i + 1}`).toContain(numero)
        expect(corrido(p), `página ${i + 1}`).toContain(DICA_ETIQUETA)
      }
      const ultima = corrido(paginas.at(-1)!)
      expect(ultima).toContain(`ASSINATURAS E ETIQUETA CERTIFICADO Nº ${numero}`)
      expect(ultima).toContain(AVISO_ETIQUETA)
      expect(ultima.indexOf(AVISO_ETIQUETA)).toBeLessThan(ultima.indexOf('Técnico que executou'))
    },
  )

  it.runIf(temPdftotext).each([
    { nome: 'plataforma', dados: folhaPlataforma, numero: 'CC-2026-00125' },
    { nome: 'balcão multi-intervalo', dados: folhaMultiIntervalo, numero: 'CC-2026-00126' },
    { nome: 'rodoviária 80 t', dados: folhaRodoviaria, numero: 'CC-2026-00127' },
    { nome: 'rodoviária 60 t sem histórico', dados: folhaRodoviariaSemHistorico, numero: 'CC-2026-00128' },
  ])('$nome: o nº reservado não aumenta a folha e sai em todas as páginas', async ({ dados, numero }) => {
    const d = dados()
    expect(d.numeroCertificado).toBe(numero)
    const com = await montar(d)
    const sem = await montar({ ...d, numeroCertificado: undefined })
    expect(com.paginas).toBe(sem.paginas)
    expect(com.paginas).toBeLessThanOrEqual(2)
    expect(com.faltando).toEqual([])
    const paginas = paginasDe(textoDoPdf(com.pdf))
    for (const p of paginas) expect(p).toContain(numero)
    expect(corrido(paginas.at(-1)!)).toContain(AVISO_ETIQUETA)
  })
})

describe.runIf(temPdftotext)('nº do certificado longo (outro formato de numeração)', { timeout: 60_000 }, () => {
  it('cabe no alto da página e no passo 8, sem passar da margem nem aumentar a folha', async () => {
    const numero = 'BC-CAL-2026-000125'
    const d = { ...folhaPlataforma(), numeroCertificado: numero }
    const m = await montar(d)
    expect(m.paginas).toBe(2)
    expect(m.faltando).toEqual([])
    const palavras = palavrasDoPdf(m.pdf)
    for (const [i, p] of palavras.entries()) {
      const w = p.find((x) => x.texto === numero)
      expect(w, `página ${i + 1}`).toBeDefined()
      expect(w!.x1, `página ${i + 1}`).toBeLessThanOrEqual(A4.largura - 34)
    }
    const ultima = corrido(paginasDe(textoDoPdf(m.pdf)).at(-1)!)
    expect(ultima).toContain(`ASSINATURAS E ETIQUETA CERTIFICADO Nº ${numero}`)
    const linhas = paginasDe(textoDoPdf(m.pdf)).at(-1)!.split('\n')
    // No alto da página e no título do passo 8: duas linhas, o nº inteiro em cada uma
    expect(linhas.filter((l) => l.includes(numero))).toHaveLength(2)
  })

  /** Palavras do alto de cada página: o cabeçalho e a faixa da OS (acima do conteúdo). */
  const altoDasPaginas = (pdf: Buffer) => palavrasDoPdf(pdf).map((p) => p.filter((w) => w.y1 < TOPO_CABECALHO + MODULO + 27))

  it.each(['LAB-CAL-2026-00407', 'LAB-CAL-2026-00401', 'CAL-BC-2026/00410', 'CAL-BC-2026/00403'])(
    '%s: o nº inteiro (numa palavra) no alto de toda página, e a faixa da OS em todas',
    async (numero) => {
      const d = { ...folhaPlataforma(), numeroCertificado: numero }
      const m = await montar(d)
      expect(m.faltando).toEqual([])
      const alto = altoDasPaginas(m.pdf)
      expect(alto).toHaveLength(m.paginas)
      for (const [i, p] of alto.entries()) {
        const textos = p.map((w) => w.texto)
        expect(textos, `página ${i + 1}`).toContain(numero)
        expect(textos, `página ${i + 1}`).toContain(d.numero)
        expect(
          textos.filter((x) => x === 'OS-2026-0512'),
          `página ${i + 1}`,
        ).toHaveLength(1)
      }
    },
  )

  it('nº de 40 caracteres: a letra diminui, os dois nºs ficam inteiros e dentro da margem, e a OS em todas', async () => {
    const numero = 'LABORATORIO-CALIBRACAO-BALANCAS-2026-00042'
    const d = { ...folhaPlataforma(), numeroCertificado: numero }
    const m = await montar(d)
    expect(m.faltando).toEqual([])
    for (const [i, p] of altoDasPaginas(m.pdf).entries()) {
      for (const n of [numero, d.numero]) {
        const w = p.find((x) => x.texto === n)
        expect(w, `${n}, página ${i + 1}`).toBeDefined()
        expect(w!.x1, `${n}, página ${i + 1}`).toBeLessThanOrEqual(A4.largura - 34 + 0.5)
      }
      // O título da folha numa linha só e a OS
      expect(corrido(p.map((w) => w.texto).join(' ')), `página ${i + 1}`).toContain('FOLHA DE CAMPO — CALIBRAÇÃO DE BALANÇA')
      expect(
        p.filter((x) => x.texto === 'OS-2026-0512'),
        `página ${i + 1}`,
      ).toHaveLength(1)
    }
  })
})

describe.runIf(temPdftotext)(
  'rev. 03, revisão da prévia: legenda, escrita folgada e desenhos legíveis',
  { timeout: 180_000 },
  () => {
    it('legenda dos fundos numa linha própria: a amostra cinza começa dentro da caixa, alinhada com o texto de cima', async () => {
      // Na definição: a quebra antes da amostra, e a amostra não perde os espaços do começo da linha
      const json = jsonDe(folhaPlataforma())
      expect(json).toMatch(
        /"\\n",\{"text":"\u2002\u2002\u2002","background":"#E3E3E3","fontSize":6.4,"preserveLeadingSpaces":true\}/,
      )
      // Na imagem: na linha de "Impresso pelo sistema", entre o fio esquerdo da caixa e o recuo do texto, só branco; o
      // cinza da amostra começa no recuo (onde começa "COMO ANOTAR"), antes da palavra
      const m = await montar(folhaPlataforma())
      const palavras = palavrasDoPdf(m.pdf)[0]
      const como = palavras.find((w) => w.texto === 'COMO')!
      const impresso = palavras.find((w) => w.texto === 'Impresso')!
      expect(impresso.x0).toBeGreaterThan(como.x0 + 8)
      const img = imagemDaPagina(m.pdf, 1)
      const y = Math.round(((impresso.y0 + impresso.y1) / 2) * img.px)
      const cinza = (t: number) => t > 190 && t < 245
      let x = Math.ceil((34 + 1) * img.px)
      while (img.escuro(x, y)) x++ // o fio esquerdo da caixa
      let primeiroCinza = -1
      for (; x < Math.floor(impresso.x0 * img.px); x++)
        if (cinza(img.tom(x, y))) {
          primeiroCinza = x
          break
        }
      expect(primeiroCinza).toBeGreaterThan(0)
      expect(primeiroCinza / img.px).toBeGreaterThanOrEqual(como.x0 - 1)
      expect(primeiroCinza / img.px).toBeLessThanOrEqual(como.x0 + 1.5)
    })

    it('linhas de leitura mais altas quando a página tem espaço (≈ 8,8 mm), sem página nova; as páginas cheias como estão', async () => {
      const plataforma = await montar(folhaPlataforma())
      expect(plataforma.paginas).toBe(2)
      expect(plataforma.extras.folgaLeitura).toEqual({ frente: 6, verso: 6 })
      const pp = palavrasDoPdf(plataforma.pdf)
      // O ambiente (início e fim), os pontos, a repetibilidade e a excentricidade
      for (const rotulo of [
        ['Início', '15', 'min'],
        ['RETORNO', 'AO', 'ZERO'],
        ['Zero', 'após', 'retirar'],
        ['Indicação', '(kg)'],
      ])
        expect(alturaDaLinha(plataforma.pdf, pp, rotulo).mm, rotulo.join(' ')).toBeGreaterThanOrEqual(8.4)
      // O espaço livre vira escrita mais folgada até ≈ 88 % da altura útil: fica um respiro no pé do verso; o que ainda
      // sobra na frente são as Anotações, até o pé da página
      for (const dados of [folhaPlataforma, folhaClasseI, folhaEmBranco]) {
        const m = await montar(dados())
        expect(m.paginas, dados.name).toBe(2)
        expect(m.extras.folgaLeitura?.verso, dados.name).toBeGreaterThan(0)
        const [frente, verso] = brancoNoPe(m.pdf, m.paginas)
        expect(verso, `${dados.name}, verso`).toBeGreaterThan(24)
        expect(frente, `${dados.name}, frente`).toBeLessThan(5)
      }
      // As que já estão cheias no verso (as rodoviárias) não ganham altura lá, e nada passa para outra página
      for (const dados of [folhaRodoviaria, folhaRodoviariaSemHistorico, () => folhaRodoviariaMultiIntervalo()]) {
        const m = await montar(dados())
        expect(m.paginas).toBe(2)
        expect(m.extras.folgaLeitura?.verso ?? 0).toBe(0)
      }
      // Na folha em branco, as linhas dos padrões com ≈ 6,5 mm (as peças usadas de cada jogo são escritas nelas)
      const branco = await montar(folhaEmBranco())
      expect(alturaDaLinha(branco.pdf, palavrasDoPdf(branco.pdf), ['PP20-01', 'a', '15']).mm).toBeGreaterThanOrEqual(6.3)
    })

    it('desenhos da excentricidade legíveis: nº das posições ≥ 6 pt e "FRENTE" ≥ 5 pt (na em branco, ≥ 5,5 pt)', () => {
      /** Tamanho (pt, na página) dos nº das posições e de "FRENTE" em cada desenho com a frente marcada. */
      const tamanhos = (d: DadosFolhaCampo) =>
        nosQue(
          (definicaoFolhaCampo(d) as { content: unknown }).content,
          (x) => typeof x.svg === 'string' && x.svg.includes('>FRENTE<'),
        ).map((x) => {
          const svg = x.svg as string
          const escala = (x.width as number) / Number(/viewBox="0 0 ([\d.]+)/.exec(svg)![1])
          const menor = (re: RegExp) => Math.min(...[...svg.matchAll(re)].map((c) => Number(c[1]) * escala))
          return {
            numeros: menor(/font-size="([\d.]+)"[^>]*>\d+<\/text>/g),
            frente: menor(/font-size="([\d.]+)"[^>]*>FRENTE<\/text>/g),
          }
        })
      for (const dados of [folhaPlataforma, folhaMultiIntervalo, folhaClasseI]) {
        const [t, ...outros] = tamanhos(dados())
        expect(outros, dados.name).toEqual([])
        expect(t.numeros, dados.name).toBeGreaterThanOrEqual(6)
        expect(t.frente, dados.name).toBeGreaterThanOrEqual(5)
      }
      // Na em branco, os dois de referência (retangular e redondo), lado a lado
      const branco = tamanhos(folhaEmBranco())
      expect(branco).toHaveLength(2)
      for (const t of branco) {
        expect(t.numeros).toBeGreaterThanOrEqual(6)
        expect(t.frente).toBeGreaterThanOrEqual(5.5)
      }
    })
  },
)

/** Em branco com `n` padrões ativos (a tabela dos padrões cresce e empurra o passo 4 para o pé da frente). */
function emBrancoComPadroes(n: number): DadosFolhaCampo {
  const base = folhaEmBrancoOitoPadroes().padroes
  return {
    ...folhaEmBranco(),
    padroes: Array.from({ length: n }, (_, i): Padrao => ({
      ...base[i % base.length],
      id: `pad-${i}`,
      identificacao: `${base[i % base.length].identificacao}${i >= base.length ? '-B' : ''}`,
    })),
  }
}

/** A caixa das linhas das Anotações na definição: a altura e as linhas pontilhadas (y de cada uma). */
function caixaDasAnotacoes(d: DadosFolhaCampo, extras: Parameters<typeof definicaoFolhaCampo>[1]) {
  const [bloco] = nosQue((definicaoFolhaCampo(d, extras) as { content: unknown }).content, (x) => x.id === 'anotacoes')
  if (!bloco) return null
  const [canvas] = nosQue(bloco, (x) => Array.isArray(x.canvas))
  const formas = canvas.canvas as Array<{ type: string; h?: number; y1?: number; dash?: unknown; lineColor?: string }>
  return {
    bloco,
    caixa: formas.find((f) => f.type === 'rect')!,
    linhas: formas.filter((f) => f.type === 'line'),
  }
}

describe.runIf(temPdftotext)(
  'rev. 03, últimos acertos: Anotações na frente, ajuste interno da classe I e lembrete do passo 8',
  { timeout: 240_000 },
  () => {
    it.each(EXEMPLOS)(
      '$nome: o pé da frente é o bloco Anotações (a barra e a caixa com linhas pontilhadas até o rodapé)',
      async (e) => {
        const m = await montar(e.dados())
        expect(m.paginas).toBe(2)
        expect(m.faltando).toEqual([])
        // Depois do passo 4 (os ensaios no verso) ou, na rodoviária com o título do passo 5 no pé da frente, depois dele
        const naIndicacao = /^rodoviária (60 t|multi-intervalo)/.test(e.nome)
        expect(m.extras.anotacoes?.depois).toBe(naIndicacao ? 'indicacao' : 'ambiente')
        expect(m.marcas.get('anotacoes')?.pagina).toBe(1)
        expect(m.marcas.get('fim:anotacoes')?.pagina).toBe(1)
        // A caixa acaba logo acima do rodapé (≈ 1,4 mm de respiro), na mesma altura em toda folha
        expect(m.marcas.get('fim:anotacoes')!.topo).toBeGreaterThan(783)
        expect(m.marcas.get('fim:anotacoes')!.topo).toBeLessThan(786)
        // Linhas de pelo menos ≈ 7 mm (20 pt), repartidas por igual, pontilhadas e cinza (para não brigar com a escrita)
        const c = caixaDasAnotacoes(e.dados(), { extras: m.extras })!
        expect(c.caixa.h).toBe(m.extras.anotacoes!.altura)
        const n = c.linhas.length + 1
        expect(n).toBeGreaterThanOrEqual(2)
        const passo = c.caixa.h! / n
        expect(passo).toBeGreaterThanOrEqual(20)
        expect(passo).toBeLessThan(30)
        c.linhas.forEach((l, i) => {
          expect(l.y1).toBeCloseTo((i + 1) * passo, 6)
          expect(l.dash).toBeTruthy()
          expect(l.lineColor).toBe('#8C8C8C')
        })
        // No PDF: na frente, a barra do bloco, depois do passo 4 (e do título do passo 5, na rodoviária); nada no verso
        const [frente, verso] = paginasDe(textoDoPdf(m.pdf)).map(corrido)
        const barra = `${TITULO_ANOTACOES.toUpperCase()} — ${DICA_ANOTACOES}`
        expect(frente).toContain(barra)
        expect(frente.indexOf('4 AMBIENTE')).toBeLessThan(frente.indexOf(barra))
        if (naIndicacao) expect(frente.indexOf('5 ERRO DE INDICAÇÃO')).toBeLessThan(frente.indexOf(barra))
        expect(verso).not.toContain(TITULO_ANOTACOES.toUpperCase())
        // Todo "onde anotar" da folha aponta para ele; nenhum para o verso ou para um "espaço livre"
        const t = corrido(textoDoPdf(m.pdf))
        expect(t).not.toMatch(/no verso|espaço livre/)
        if (e.dados !== folhaEmBranco && e.dados !== folhaEmBrancoOitoPadroes) {
          expect(t).toContain('Anote o certo em Anotações (passo 2 ou 3) e avise o cliente.')
          expect(t).toContain('Pesos diferentes dos impressos: em Anotações (frente), com o nº da linha.')
        }
      },
    )

    it('as Anotações só ocupam o pé da frente: o verso sai igual, sem página a mais', async () => {
      for (const dados of [folhaPlataforma, folhaClasseI, folhaEmBranco, folhaRodoviariaSemHistorico]) {
        const m = await montar(dados())
        const semAnotacoes = definicaoFolhaCampo(dados(), { extras: { ...m.extras, anotacoes: undefined } })
        const pdf: Buffer = await pdfmake().createPdf(semAnotacoes).getBuffer()
        const [frenteSem, versoSem] = paginasDe(textoDoPdf(pdf))
        const [frente, verso] = paginasDe(textoDoPdf(m.pdf))
        expect(paginasDe(textoDoPdf(pdf)), dados.name).toHaveLength(2)
        expect(verso, dados.name).toBe(versoSem)
        expect(corrido(frenteSem), dados.name).not.toContain('ANOTAÇÕES —')
        expect(corrido(frente), dados.name).toContain('ANOTAÇÕES —')
      }
    })

    it('sem espaço no pé da frente: sem o bloco (a regra do alto manda para uma folha anexa), e a folha não muda', async () => {
      // Em branco com 12 padrões: o passo 4 acaba no pé da frente
      const m = await montar(emBrancoComPadroes(12))
      expect(m.paginas).toBe(2)
      expect(m.faltando).toEqual([])
      expect(m.extras.anotacoes).toBeUndefined()
      expect(m.marcas.has('anotacoes')).toBe(false)
      const frente = corrido(paginasDe(textoDoPdf(m.pdf))[0])
      expect(frente).not.toContain('ANOTAÇÕES —')
      expect(frente).toContain('sem espaço, numa folha anexa')
      // Com 10, ainda cabem 2 linhas
      const dez = await montar(emBrancoComPadroes(10))
      expect(dez.paginas).toBe(2)
      expect(caixaDasAnotacoes(emBrancoComPadroes(10), { extras: dez.extras })?.linhas).toHaveLength(1)
      // A definição sem a medida da montagem não leva o bloco
      expect(caixaDasAnotacoes(folhaPlataforma(), {})).toBeNull()
    })

    it('rodoviária multi-intervalo em 3 páginas: as Anotações no pé da frente, depois do título do passo 5', async () => {
      const m = await montar(
        folhaRodoviariaMultiIntervalo([
          { id: 'r1', carga: 10_000, leituras: [null, null, null] },
          { id: 'r2', carga: 40_000, leituras: [null, null, null] },
          { id: 'r3', carga: 70_000, leituras: [null, null, null] },
        ]),
      )
      expect(m.paginas).toBe(3)
      expect(m.faltando).toEqual([])
      expect(m.extras.anotacoes?.depois).toBe('indicacao')
      expect(m.marcas.get('fim:anotacoes')?.pagina).toBe(1)
      expect(m.extras.continuacoes).toContain('parte-5-1')
    })

    it('classe I: a caixa do ajuste interno de rotina (CAL) antes dos ensaios, com a hora, no alto do passo 5', async () => {
      expect(AJUSTE_INTERNO_CLASSE_I).toBe('Ajuste interno (CAL) feito antes dos ensaios')
      const json = jsonDe(folhaClasseI()).replace(/ /g, ' ')
      expect(json.split(AJUSTE_INTERNO_CLASSE_I)).toHaveLength(2)
      // A rotina da analítica, não reparo, e onde ela é digitada: a etapa da tela que tem o "ajuste interno"
      expect(json).toContain(`rotina das analíticas, não é reparo · no sistema: ${ETAPAS_SISTEMA.balanca}`)
      expect(AJUSTES.INTERNO).toMatch(/^Ajuste interno/)
      const tela = readFileSync(new URL('../../src/pages/CalibracaoForm.tsx', import.meta.url), 'utf8')
      expect(tela).toContain(`titulo: '${ETAPAS_SISTEMA.balanca.replace(/^\d · /, '')}'`)
      // Uma caixa de marcar (branca) e a hora ao lado
      const [linha] = nosQue((definicaoFolhaCampo(folhaClasseI()) as { content: unknown }).content, (x) =>
        JSON.stringify((x.table as { body?: unknown[][] } | undefined)?.body ?? '').includes(AJUSTE_INTERNO_CLASSE_I),
      )
      const texto = JSON.stringify(linha)
      expect(texto).toContain('"Hora"')
      expect(texto).toContain('____:____')
      const caixas = nosQue(linha, (x) => x.type === 'rect' && x.w === x.h)
      expect(caixas.length).toBeGreaterThanOrEqual(1)
      for (const q of caixas) expect(q.color).toBe('#FFFFFF')
      // No PDF: no verso, embaixo do título do passo 5 e antes do método (o ajuste é feito antes dos ensaios)
      const m = await montar(folhaClasseI())
      expect(m.paginas).toBe(2)
      const verso = corrido(paginasDe(textoDoPdf(m.pdf))[1])
      const i = verso.indexOf(AJUSTE_INTERNO_CLASSE_I)
      expect(verso.indexOf('5 ERRO DE INDICAÇÃO')).toBeLessThan(i)
      expect(i).toBeLessThan(verso.indexOf('Como as cargas foram aplicadas'))
      expect(verso).toMatch(
        /Ajuste interno \(CAL\) feito antes dos ensaios rotina das analíticas, não é reparo · no sistema: 2 · Balança e ajuste Hora/,
      )
      expect(verso).not.toMatch(/Reparo ou manutenção|depois do ajuste|como encontrado/i)
      // Só na folha de uma balança classe I: nem nas outras classes, nem na em branco, nem na classe I mudada para II
      for (const d of [
        folhaPlataforma(),
        folhaMultiIntervalo(),
        folhaRodoviaria(),
        folhaEmBranco(),
        folhaEmBrancoOitoPadroes(),
        { ...folhaClasseI(), balanca: { ...folhaClasseI().balanca!, classe: 'II' as const } },
      ])
        expect(jsonDe(d)).not.toMatch(/Ajuste interno|\(CAL\)/)
    })

    it('passo 8: na barra da nota, o lembrete curto de preencher a linha Fim do passo 4, com e sem nº reservado', () => {
      expect(LEMBRETE_AMBIENTE_FIM).toBe('Antes de assinar: preencha a linha Fim do passo 4.')
      for (const e of EXEMPLOS)
        for (const d of [e.dados(), { ...e.dados(), numeroCertificado: undefined }]) {
          // A barra: a nota com o fio grosso à esquerda (2,2 pt)
          const barras = nosQue((definicaoFolhaCampo(d) as { content: unknown }).content, (x) => {
            const layout = x.layout as { vLineWidth?: (i: number, no: unknown) => number } | undefined
            const tabela = x.table as { widths?: unknown[]; body?: unknown[] } | undefined
            return (
              typeof layout?.vLineWidth === 'function' &&
              tabela?.widths?.length === 1 &&
              layout.vLineWidth(0, { table: { widths: tabela.widths, body: tabela.body ?? [] } }) === 2.2
            )
          })
          const comLembrete = barras.filter((b) => JSON.stringify(b).includes(LEMBRETE_AMBIENTE_FIM))
          expect(comLembrete, e.nome).toHaveLength(1)
          // Em negrito, numa linha própria (depois da nota da etiqueta, quando há o nº)
          expect(JSON.stringify(comLembrete[0])).toContain(`{"text":"${LEMBRETE_AMBIENTE_FIM}","bold":true}`)
          expect(JSON.stringify(comLembrete[0]).includes(AVISO_ETIQUETA), e.nome).toBe(!!d.numeroCertificado)
        }
    })

    it('chegada e identificação: a instrução de conferir aponta para as Anotações e cabe numa linha', async () => {
      const m = await montar(folhaPlataforma())
      const linhas = paginasDe(textoDoPdf(m.pdf))[0].split('\n')
      const linha = linhas.find((l) => l.includes('Confira o cliente'))!
      expect(linha.trim()).toBe(
        'Confira o cliente, o endereço e a plaqueta do indicador (o mostrador). Diferente? Anote o certo em Anotações (passo 2 ou 3) e avise o cliente.',
      )
    })

    it('em branco: ao lado da classe, a linha da classe I em duas linhas miúdas, sem a classe I nas opções', async () => {
      const m = await montar(folhaEmBranco())
      const frente = paginasDe(textoDoPdf(m.pdf))[0]
      expect(corrido(frente)).toMatch(/Classe I: cadastre a balança .*e imprima a folha dela/)
      expect(corrido(frente)).not.toContain('não use a folha em branco')
      const palavras = palavrasDoPdf(m.pdf)[0]
      const [cadastre, imprima] = ['cadastre', 'imprima'].map((w) => palavras.find((p) => p.texto === w)!)
      // Duas linhas: "imprima" embaixo de "cadastre", na mesma coluna
      expect(imprima.y0).toBeGreaterThan(cadastre.y1 - 1)
      expect(imprima.x0).toBeLessThan(cadastre.x0)
    })
  },
)

// Testes da folha de campo em PDF: gera as cinco amostras (server/pdf/exemplosFolhaCampo.ts), confere que
// a geração é determinística e, com o pdftotext (poppler-utils), o conteúdo de cada página: cabeçalho de
// identificação, rótulos iguais aos da tela do assistente, plano de cargas e o que NÃO pode aparecer
// (número de certificado, aprovado/reprovado, validade).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FORMULARIO_FOLHA_CAMPO } from '#shared/folhaCampo.ts'
import type { Padrao } from '#shared/tipos.ts'
import { A4, BASE_RODAPE, MODULO, TOPO_CABECALHO } from './base.ts'
import {
  folhaEmBranco,
  folhaMultiIntervalo,
  folhaPlataforma,
  folhaRodoviaria,
  folhaRodoviariaSemHistorico,
  padroesDaEmpresa,
} from './exemplosFolhaCampo.ts'
import {
  type DadosFolhaCampo,
  definicaoFolhaCampo,
  ETAPAS_SISTEMA,
  gerarFolhaCampoPdf,
  limiteDeltaT,
  montar,
  nomeArquivoFolhaCampo,
  notaLegal,
  PROCEDIMENTO,
  ROTEIRO_DIGITACAO,
  textosDaFaixa,
  VERIFICACOES_FOLHA,
} from './folhaCampo.ts'

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

const EXEMPLOS: Array<{ nome: string; dados: () => DadosFolhaCampo }> = [
  { nome: 'plataforma 300 kg (rascunho do último certificado)', dados: folhaPlataforma },
  { nome: 'balcão multi-intervalo 6/15/33 kg (sem histórico)', dados: folhaMultiIntervalo },
  { nome: 'rodoviária 80 t com substituição', dados: folhaRodoviaria },
  { nome: 'em branco', dados: folhaEmBranco },
  { nome: 'rodoviária 60 t sem calibração anterior', dados: folhaRodoviariaSemHistorico },
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

  it('o roteiro de digitação cobre as etapas 1 a 7 do assistente, na ordem da tela', () => {
    expect(ROTEIRO_DIGITACAO.map((r) => r.etapa)).toEqual(Object.values(ETAPAS_SISTEMA).slice(0, 7))
  })

  it('usa os mesmos rótulos do assistente (validação da transcrição, ISO/IEC 17025 7.11)', () => {
    // Cada passo diz a etapa do sistema onde é digitado: as etapas têm de existir com esse nome na tela
    const tela = readFileSync(new URL('../../src/pages/CalibracaoForm.tsx', import.meta.url), 'utf8')
    for (const etapa of Object.values(ETAPAS_SISTEMA)) expect(tela).toContain(`titulo: '${etapa.replace(/^\d · /, '')}'`)
    // A verificação preliminar tem os mesmos itens e textos da tela
    const instrumento = readFileSync(new URL('../../src/components/calibracao/EtapaInstrumento.tsx', import.meta.url), 'utf8')
    for (const item of VERIFICACOES_FOLHA) expect(instrumento).toContain(`'${item}'`)
  })
})

describe.runIf(temPdftotext)('conteúdo da folha (pdftotext)', { timeout: 30_000 }, () => {
  /** Em toda página: título, nº da folha, "Página i de N", código do formulário e a identificação da tarefa. */
  function conferirPaginas(texto: string, numero: string, identificacao: string[]) {
    const paginas = paginasDe(texto)
    expect(paginas.length).toBeGreaterThanOrEqual(4)
    expect(paginas.length).toBeLessThanOrEqual(5)
    paginas.forEach((p, i) => {
      const t = corrido(p)
      expect(t).toContain('FOLHA DE CAMPO — CALIBRAÇÃO DE BALANÇA')
      expect(t).toContain(numero)
      expect(t).toContain(`Página ${i + 1} de ${paginas.length}`)
      // O formulário e o procedimento que ele segue (sem a revisão do PT: a folha não muda a cada revisão dele)
      expect(t).toContain(`${FORMULARIO_FOLHA_CAMPO.codigo} rev. ${FORMULARIO_FOLHA_CAMPO.revisao} · PT-CAL-01 · registro`)
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
    for (const item of VERIFICACOES_FOLHA) expect(t).toContain(item)
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
    expect(t).toContain('PESOS NO LOCAL HÁ (MIN)')
    expect(t).toContain('INSTRUMENTO USADO')
    // Conclusão com os mesmos campos da tela
    expect(t).toContain('O CLIENTE PEDIU DECLARAÇÃO DE')
    expect(t).toMatch(/LIMITE \(ERRO MÁXIMO/)
    expect(t).toContain('REGRA DE DECISÃO')
    expect(t).toContain('O CLIENTE PEDIU A DATA NO CERTIFICADO?')
    expect(t).toContain('OBSERVAÇÕES (SAEM NO CERTIFICADO)')
    expect(t).toContain('TÉCNICO QUE EXECUTOU')
    expect(t).toContain('CERTIFICADO Nº (PREENCHIDO NO ESCRITÓRIO)')
    expect(t).toContain('PARA DIGITAR, NA ORDEM DO SISTEMA')
    expect(t).toContain('Grampeie as folhas')
    // Nada de número de certificado, aprovação ou "validade" numa folha de campo
    expect(t).not.toContain('CERTIFICADO DE CALIBRAÇÃO Nº')
    expect(t).not.toMatch(/\baprovad[oa]\b|\breprovad[oa]\b/i)
    expect(t).not.toMatch(/validade/i)
  }

  it('plataforma 300 kg: cadastro para conferir, pontos e pesos do último certificado, EMA', async () => {
    const e = EXEMPLOS[0]
    const texto = textoDoPdf(await pdfDe(e))
    const paginas = conferirPaginas(texto, 'FC-2026-00042', ['OS-2026-0512', 'Frigorífico Vale do Corumbataí', '9091-118832'])
    // Duas folhas, frente e verso, sem parte de passo solta no alto de uma página
    expect(paginas).toHaveLength(4)
    for (const p of paginas.slice(1))
      expect(corrido(p)).toMatch(/BALANÇA nº de série 9091-118832 · TAG BAL-EXP-07 \d{1,2} [A-ZÇÃÁÉÍÓÚÊ]/)
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('FRIGORÍFICO VALE DO CORUMBATAÍ LTDA')
    expect(t).toContain('Avenida Brasil, 2450')
    expect(t).toContain('Carlos Eduardo Lima')
    // O cliente sai no certificado: "□ confere" e a caixa para o certo; o técnico previsto é só uma dica, numa
    // caixa branca, e o nome ao lado da assinatura fica para quem executou escrever
    expect(corrido(paginas[0])).toMatch(/RAZÃO SOCIAL confere CONTATO NO CLIENTE CNPJ confere/)
    expect(corrido(paginas[0])).toMatch(/TÉCNICO QUE EXECUTOU ● .{0,80}previsto: Carlos Eduardo Lima/)
    const assinaturas = corrido(paginas[3]).slice(corrido(paginas[3]).indexOf('ASSINATURAS'))
    expect(assinaturas).toContain('TÉCNICO QUE EXECUTOU (NOME)')
    expect(assinaturas.slice(0, assinaturas.indexOf('ESCRITÓRIO'))).not.toContain('Carlos')
    // "□ confere" ao lado do rótulo do previsto; o certo vai na caixa branca embaixo, livre para escrever
    expect(t).toContain('certo, marque “confere”; diferente, escreva o certo na caixa branca embaixo')
    expect(t).not.toContain('ou escreva o certo:')
    expect(t.match(/\bconfere\b/g)?.length).toBeGreaterThanOrEqual(20)
    expect(t).toContain('Marque com X')
    expect(t).toMatch(/nas instalações do cliente\s+PREVISTO/)
    // Troca de pesos: na última linha da tabela de pontos, com o nº da linha e as peças usadas
    expect(t).toContain('PESOS DIFERENTES DO PREVISTO')
    expect(t).toContain('nº da linha e as peças usadas de fato')
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
    expect(t).toContain('FRENTE · INDICADOR')
    expect(t).toContain('a normal (d = 50 g)')
    expect(t).toContain('21/10/2027')
    expect(t).toContain('1 · Cliente e OS ← passos 2, 9 (Anotações internas) e 10')
  })

  it('balcão multi-intervalo: pontos sugeridos pelo sistema, d de cada intervalo e EMA por intervalo', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[1]))
    const paginas = conferirPaginas(texto, 'FC-2026-00043', ['OS-2026-0519', 'Supermercado Bom Preço', 'UR33-204718'])
    // A balança mais simples cabe em duas folhas, frente e verso, com as observações numa caixa só
    expect(paginas).toHaveLength(4)
    expect(texto).not.toContain('OBSERVAÇÕES (CONTINUAÇÃO)')
    // O erro de indicação inteiro na página 2, com o retorno ao zero e os pesos diferentes na tabela
    expect(texto).not.toContain('ERRO DE INDICAÇÃO (CONTINUAÇÃO)')
    for (const x of ['ERRO DE INDICAÇÃO', '33,00', 'RETORNO AO ZERO', 'PESOS DIFERENTES DO PREVISTO'])
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
    expect(t).toContain('Balança de uso comercial (venda por peso)')
    expect(t).toContain('Marca de verificação Inmetro/IPEM: ano'.toUpperCase())
    // Repetibilidade em 9 linhas (5 previstas), com a carga nas casas de d do intervalo (16,5 kg: d = 10 g)
    expect(t).toContain('16,50')
    expect(t).toContain('Linhas 6 a 9: opcionais')
    expect(t).toContain('As que não couberem: em Anotações internas (passo 9).')
    expect(t).not.toContain('nas observações)')
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
    expect(sub).toContain('Refaça as etapas nas colunas “depois do ajuste”')
    expect(t).toContain('cada uma com o seu método, o seu retorno ao zero e as suas etapas de substituição')
    // Pontos e etapas de substituição, preenchidos intercalados, na mesma página
    const comEtapas = paginas.find((p) => p.includes('Cargas de substituição —'))!
    expect(corrido(comEtapas)).toMatch(/40 000 +3 +20 × 500 kg/)
    expect(corrido(comEtapas)).toContain('ERRO DE INDICAÇÃO')
    // Observações numa caixa só, sem continuação
    expect(t).not.toContain('OBSERVAÇÕES (CONTINUAÇÃO)')
    expect(paginas).toHaveLength(5)
    for (const p of ['Início (ida)', 'Meio (ida)', 'Fim (ida)', 'Início (volta)', 'Meio (volta)', 'Fim (volta)'])
      expect(t).toContain(p)
    expect(t).toContain('Tolerância do cliente')
    expect(t).toContain('39 940 a 40 060')
    expect(t).toContain('Faça as 3 leituras previstas (mínimo 3, por ser carga de 100 kg ou mais)')
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
      expect(t).toContain('cada uma com o seu método, o seu retorno ao zero e as suas etapas de substituição')
      // Pontos e etapas na mesma página
      const pagina = paginasDe(texto).find((p) => p.includes('Cargas de substituição'))!
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

  it('etapas para escrever: 8 na folha em branco; 2 numa rodoviária cujos pesos fecham todas as cargas', async () => {
    const branco = corrido(textoDoPdf(await pdfDe(EXEMPLOS[3])))
    const tabela = branco.slice(branco.indexOf('Cargas de substituição — só em rodoviária'))
    expect(tabela).toMatch(/1ª 2ª 3ª 4ª 5ª 6ª 7ª 8ª/)
    const d = folhaRodoviariaSemHistorico()
    d.balanca = { ...d.balanca!, faixas: [{ max: 10_000, e: 5, d: 5 }] }
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))
    const etapas = t.slice(t.indexOf('Cargas de substituição — quando os pesos levados não chegam'))
    expect(etapas).toMatch(/1ª 2ª/)
    expect(etapas).not.toContain('3ª')
    expect(t).not.toContain('sugeridas')
  })

  it('em branco: a tabela de pontos vai inteira para a página seguinte; o título, a instrução e o método ficam, com o aviso', async () => {
    const m = await montar(folhaEmBranco())
    // As 12 linhas cabem numa página: a tabela não se divide (o técnico não vira a folha na subida nem na descida)
    expect(m.extras.cortes).toEqual([])
    expect(m.extras.avisoPontos).toBe(true)
    const linhas = Array.from({ length: 12 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    expect(new Set(linhas).size).toBe(1)
    const paginas = paginasDe(textoDoPdf(m.pdf))
    const i = paginas.findIndex((p) => corrido(p).includes('5 ERRO DE INDICAÇÃO NO SISTEMA'))
    const titulo = corrido(paginas[i])
    expect(titulo).toMatch(/COMO AS CARGAS FORAM APLICADAS .*COMO ENCONTRADO .*DEPOIS DO AJUSTE/)
    expect(titulo).toMatch(/Tabela dos pontos na próxima página\. FOR-CAL-01/)
    // Em branco (pode ser rodoviária): com substituição, só crescente
    expect(titulo).toContain('Zere, aplique e anote a indicação estável. Com cargas de substituição: só crescente.')
    expect(titulo).not.toContain('RETORNO AO ZERO')
    const tabela = corrido(paginas[i + 1])
    expect(tabela).toMatch(/^ ?FOLHA DE CAMPO .* 5 ERRO DE INDICAÇÃO \(CONTINUAÇÃO\) NO SISTEMA 6 · Erro de indicação Nº Carga/)
    expect(linhas[0]).toBe(i + 2)
    expect(tabela).toContain('RETORNO AO ZERO')
    expect(tabela).toContain('Para decidir o ajuste: EMA em serviço')
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
    expect(t).toContain('0, 25, 50, 75 e 100 % de Max')
    expect(t).toMatch(/Max\/3 até 500 kg · Max\/5 até 3 t ·/)
    expect(t).toContain('Mínimo de 5 leituras')
    // Os padrões ativos aparecem para marcar; nenhum dado de cliente ou balança
    expect(t).toContain('PP500-01 a 20')
    expect(t).not.toContain('FRIGORÍFICO')
    expect(t).not.toContain('Faixa para decidir o ajuste:')
    // O endereço do cadastro do cliente, que o certificado também traz
    expect(t).toContain('ENDEREÇO DO CLIENTE (SAI NO CERTIFICADO)')
    expect(t).toContain('o mesmo do local da calibração')
    // Rodoviária ainda não cadastrada: substituições nos pontos e as etapas, antes e depois do ajuste
    expect(t).toMatch(/Substi- .{0,150}tuições/)
    expect(t).toContain('Cargas de substituição — só em rodoviária')
    expect(t).toMatch(/4ª/)
    // 12 linhas de pontos (multi-intervalo) e 8 de excentricidade, com a posição escrita no local
    expect(t).toMatch(/\b12\b/)
    expect(t).toContain('Escreva a posição de cada linha')
    expect(t).not.toContain('Frente esquerda')
    expect(t).toMatch(/retangular .*redondo/)
    // Sem plano não há pesos previstos para trocar
    expect(t).not.toContain('PESOS DIFERENTES DO PREVISTO')
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
    expect(corrido(paginas.at(-1)!)).toMatch(/10 ASSINATURAS NO SISTEMA/)
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
    it('balcão sem calibração anterior, com todos os padrões da empresa: inteiros só os que vão a campo, os outros numa linha, 4 páginas', async () => {
      const d = folhaMultiIntervalo()
      // Como o sistema faz sem histórico: o rascunho prevê todos os padrões ativos (os 6 de exemplo)
      expect(d.padroes).toHaveLength(6)
      expect(d.calibracao!.padroesIds).toHaveLength(6)
      const m = await montar(d)
      expect(m.paginas).toBe(4)
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
      expect(corrido(paginas[3])).toMatch(/ENCERRAMENTO: AMBIENTE NO FIM E CONCLUSÃO|OBSERVAÇÕES/)
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
      expect(t).toContain('Zere vazia e coloque a carga (Max/3 até 500 kg · Max/5 até 3 t · Max/10 acima) em cada posição')
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
        'Faixa para decidir o ajuste: carga ± EMA (Portaria Inmetro 157/2022 — em serviço, classe III); fora dela, proponha o ajuste ao cliente. A tolerância do cliente ainda não foi informada: pergunte e anote no passo 9.',
      )
      expect(t).toContain('Fora da faixa para decidir o ajuste (passo 5)')
      expect(t).not.toContain('balança sem classe')
      expect(t).toContain('ainda não informada: pergunte')
      expect(t).not.toMatch(/TOLERÂNCIA DO CLIENTE \(±\)[^A-Z]{0,30}0 kg/)
      // Sem classe: a decisão fica pela tolerância, quando ela for informada
      const semClasse = { ...d, balanca: { ...d.balanca!, classe: '' as const } }
      const t2 = corrido(textoDoPdf(await gerarFolhaCampoPdf(semClasse)))
      expect(t2).toContain('Fora da tolerância do cliente (anote-a no passo 9): proponha o ajuste ao cliente.')
      expect(t2).not.toContain('balança sem classe')
    })

    it('escritório: a folha digitalizada vai para a pasta da OS (o sistema não guarda anexos da calibração)', async () => {
      const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(folhaPlataforma())))
      expect(t).toContain('Folha digitalizada e guardada na pasta da OS:')
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
      // Cada aba com o seu método e o seu retorno ao zero, no roteiro do escritório
      expect(t).toContain('cada uma com o seu método e o seu retorno ao zero.')
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
    ])(
      '$nome: o que se preenche antes das tabelas fica na página do passo 4; pontos e etapas, juntos, na seguinte',
      async ({ dados }) => {
        const m = await montar(dados())
        expect(m.paginas).toBeLessThanOrEqual(5)
        expect(m.extras.avisoPontos).toBe(true)
        const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
        const i = paginas.findIndex((p) => p.includes('5 ERRO DE INDICAÇÃO NO SISTEMA'))
        expect(paginas[i]).toContain('4 VERIFICAÇÃO ANTES DE CALIBRAR')
        expect(paginas[i]).toMatch(/COMO AS CARGAS FORAM APLICADAS .* Cargas de substituição: em cada etapa/)
        expect(paginas[i]).toContain('Tabelas na próxima página: os pontos e as etapas de substituição, juntos.')
        const seguinte = paginas[i + 1]
        expect(seguinte).toMatch(/5 ERRO DE INDICAÇÃO \(CONTINUAÇÃO\) NO SISTEMA 6 · Erro de indicação Nº Carga Substi-/)
        expect(seguinte).toContain('RETORNO AO ZERO')
        expect(seguinte).toMatch(/Cargas de substituição( sugeridas)? — 10 000 kg de pesos padrão em cada etapa/)
        // O "como fazer" das etapas não se repete na página das tabelas
        expect(seguinte).not.toContain('em cada etapa, com os pesos padrão')
        // Liberado o espaço do título e do método, o passo 6 sobe para a página das tabelas
        expect(seguinte).toContain('6 AJUSTE E REPARO')
      },
    )

    it('tabela que cabe na página: o passo inteiro, sem aviso de continuação', async () => {
      const m = await montar(folhaPlataforma())
      expect(m.extras.avisoPontos).toBeFalsy()
      const t = corrido(textoDoPdf(m.pdf))
      expect(t).not.toMatch(/na próxima página/)
      const pontos = Array.from({ length: 7 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
      expect(pontos.every((p) => p === m.marcas.get('passo-5')?.pagina)).toBe(true)
    })

    it('tabela longa (que não cabe numa página): continua se dividindo, com o título e o cabeçalho de novo', async () => {
      const m = await montar(comPontos(folhaPlataforma, 26))
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
const TOPO_UTIL = TOPO_CABECALHO + MODULO + 30
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

  it('rodoviária 80 t: 5 páginas; o vazio da p.2 é o lugar que pontos + etapas (juntos) não cabem', async () => {
    const m = await montar(folhaRodoviaria())
    expect(m.paginas).toBe(5)
    const [, p2] = brancoNoPe(m.pdf, m.paginas)
    // A p.2 fica com o passo 4 e o que se preenche antes das tabelas; as tabelas, juntas, não caberiam no resto
    const tabelas = m.marcas.get(`fim:${'parte-5-1'}`)!
    expect(tabelas.pagina).toBe(3)
    expect((tabelas.topo - TOPO_UTIL) * (25.4 / 72)).toBeGreaterThan(p2)
  })

  it('textos longos: a tabela dos pontos vai inteira; a última página não fica só com as assinaturas', async () => {
    const m = await montar(plataformaComTextosLongos())
    expect(m.extras.cortes).toEqual([])
    const linhas = Array.from({ length: 7 }, (_, i) => m.marcas.get(`linha-pontos:${i}`)?.pagina)
    expect(new Set(linhas).size).toBe(1)
    // As observações vão para a última página, com o título do passo 9 e "(continuação)", e crescem lá
    expect(m.extras.observacoesAdiante).toBe(true)
    const paginas = paginasDe(textoDoPdf(m.pdf)).map(corrido)
    expect(paginas).toHaveLength(m.paginas)
    expect(paginas.at(-1)).toMatch(
      /9 ENCERRAMENTO: AMBIENTE NO FIM E CONCLUSÃO \(CONTINUAÇÃO\) .* OBSERVAÇÕES \(SAEM NO CERTIFICADO\) .* OPINIÕES .* 10 ASSINATURAS/,
    )
    expect(paginas.at(-2)).toContain('9 ENCERRAMENTO: AMBIENTE NO FIM E CONCLUSÃO NO SISTEMA')
    expect(paginas.at(-2)).not.toContain('OBSERVAÇÕES (SAEM NO CERTIFICADO)')
    expect(m.extras.linhas).toBeGreaterThan(8)
    for (const [i, mm] of brancoNoPe(m.pdf, m.paginas).entries()) expect(mm, `página ${i + 1}`).toBeLessThan(MEIA_PAGINA_MM)
  })

  it('com as observações já na página das assinaturas, nada muda', async () => {
    const m = await montar(folhaPlataforma())
    expect(m.extras.observacoesAdiante).toBeFalsy()
    expect(corrido(paginasDe(textoDoPdf(m.pdf)).at(-1)!)).toMatch(/OBSERVAÇÕES \(SAEM NO CERTIFICADO\) .* 10 ASSINATURAS/)
  })
})

/** Texto corrido do PDF de uma folha. */
const textoDe = async (d: DadosFolhaCampo) => corrido(textoDoPdf(await gerarFolhaCampoPdf(d)))

/** Plataforma 300 kg com outra classe e sem declaração de conformidade pedida. */
function plataformaClasse(classe: '' | 'II' | 'IIII'): DadosFolhaCampo {
  const d = folhaPlataforma()
  d.balanca = { ...d.balanca!, classe }
  d.calibracao = { ...d.calibracao!, conformidade: { ...d.calibracao!.conformidade, solicitada: false } }
  return d
}

/** A regra do passo 6, a mesma em todas as variantes. */
const REGRA_AJUSTE =
  'Ajuste só com autorização do cliente e pelos meios permitidos (sem romper selo, salvo oficina permissionária): ajuste e refaça o passo 5 nas colunas “depois do ajuste”.'

describe.runIf(temPdftotext)('alinhamento ao procedimento PT-CAL-01', { timeout: 180_000 }, () => {
  it('passo 2: os acordos do certificado combinados antes das leituras; passo 9: só se confere que não mudaram', async () => {
    const acordos =
      'Antes do passo 5: confirme com o cliente a declaração de conformidade, o limite, a regra de decisão e se a data da próxima calibração sai no certificado; marque no passo 9.'
    for (const e of EXEMPLOS) {
      const t = corrido(textoDoPdf(await pdfDe(e)))
      expect(t, e.nome).toContain(acordos)
      expect(t, e.nome).toContain(
        'Meça o ambiente de novo, no mesmo lugar e com o mesmo instrumento. Confira que os acordos marcados na chegada não mudaram.',
      )
      expect(t, e.nome).not.toContain('confirme com o cliente o que sai no certificado')
      // O passo 2 vem antes do passo 5 (e o aviso fica na chegada)
      expect(t.indexOf(acordos), e.nome).toBeLessThan(t.indexOf('5 ERRO DE INDICAÇÃO'))
    }
    const t = corrido(textoDoPdf(await pdfDe(EXEMPLOS[0])))
    expect(t).toContain(
      'Confira o cliente e o endereço da balança (filial, obra…). Anote a data e a hora de início. Antes do passo 5:',
    )
    const branco = corrido(textoDoPdf(await pdfDe(EXEMPLOS[3])))
    expect(branco).toContain(
      'Preencha o cliente como deve sair no certificado. Anote a data e a hora de início. Antes do passo 5:',
    )
  })

  it('nunca manda ajustar: fora da faixa, propõe ao cliente; o ajuste só com a autorização dele (todas as variantes)', async () => {
    const tolerancia = folhaPlataforma()
    tolerancia.calibracao = {
      ...tolerancia.calibracao!,
      conformidade: { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0, regra: 'SIMPLES' },
    }
    const variantes: Array<{ nome: string; dados: DadosFolhaCampo; quando: string }> = [
      {
        nome: 'com faixa',
        dados: folhaPlataforma(),
        quando: 'Fora da faixa para decidir o ajuste (passo 5): proponha o ajuste ao cliente.',
      },
      {
        nome: 'tolerância pendente',
        dados: tolerancia,
        quando: 'Fora da faixa para decidir o ajuste (passo 5): proponha o ajuste ao cliente.',
      },
      {
        nome: 'tolerância pendente, sem classe',
        dados: { ...tolerancia, balanca: { ...tolerancia.balanca!, classe: '' } },
        quando: 'Fora da tolerância do cliente (anote-a no passo 9): proponha o ajuste ao cliente.',
      },
      {
        nome: 'sem classe',
        dados: plataformaClasse(''),
        quando: 'Balança sem classe: não há EMA para comparar; o ajuste é só a pedido do cliente.',
      },
      {
        nome: 'em branco',
        dados: folhaEmBranco(),
        quando: 'Erro fora do EMA da classe (tabela embaixo dos pontos, no passo 5): proponha o ajuste ao cliente.',
      },
    ]
    for (const v of variantes) {
      const t = await textoDe(v.dados)
      expect(t, v.nome).toContain(`${v.quando} ${REGRA_AJUSTE}`)
      expect(t, v.nome).not.toMatch(/fora dela, ajuste|a pedido do cliente: ajuste|a pedido dele: ajuste/)
      // A faixa dos pontos (quando há) também só manda propor
      if (v.nome !== 'em branco' && v.nome !== 'sem classe' && v.nome !== 'tolerância pendente, sem classe')
        expect(t, v.nome).toMatch(/Faixa para decidir o ajuste: carga ± EMA \([^)]*\); fora dela, proponha o ajuste ao cliente\./)
    }
    // Conformidade pedida: a nota da faixa cabe numa linha e lembra da incerteza
    expect(await textoDe(folhaPlataforma())).toContain(
      'Faixa para decidir o ajuste: carga ± EMA (Portaria Inmetro 157/2022 — em serviço); fora dela, proponha o ajuste ao cliente. A conformidade inclui a incerteza.',
    )
  })

  it('repetibilidade: com 10 leituras, k fica mais perto de 2; as leituras a mais vão em Anotações internas', async () => {
    for (const e of EXEMPLOS) {
      const t = corrido(textoDoPdf(await pdfDe(e)))
      expect(t, e.nome).toMatch(/com 10 leituras, k fica mais perto de 2[).]/)
      expect(t, e.nome).not.toMatch(/k = 2/)
      expect(t, e.nome).toContain('As que não couberem: em Anotações internas (passo 9).')
      expect(t, e.nome).not.toMatch(/n[ao]s? observações\)/)
    }
  })

  it('excentricidade prevista como não aplicável: se for feita, posições e leituras em Anotações internas', async () => {
    const d = folhaPlataforma()
    d.calibracao = {
      ...d.calibracao!,
      excentricidade: { ...d.calibracao!.excentricidade, aplicavel: false, motivo: 'Balança suspensa (gancho).' },
    }
    const t = await textoDe(d)
    expect(t).toContain('Ensaio previsto como não aplicável. Confirme no local.')
    expect(t).toMatch(/ENSAIO REALIZADO .*não PREVISTO .*sim: anote posições e leituras em Anotações internas/)
    expect(t).not.toContain('descreva nas observações')
  })

  it.each([
    { nome: 'rodoviária 80 t', dados: folhaRodoviaria },
    { nome: 'rodoviária 60 t sem histórico', dados: folhaRodoviariaSemHistorico },
    {
      nome: 'ferroviária',
      dados: (): DadosFolhaCampo => {
        const d = folhaRodoviaria()
        return { ...d, balanca: { ...d.balanca!, tipo: 'FERROVIARIA' } }
      },
    },
  ])('$nome: repetibilidade e excentricidade com um veículo, sem pesos previstos', async ({ dados }) => {
    const t = await textoDe(dados())
    expect(t).toContain(
      'Zere. Use um veículo de massa constante; pare na marca do centro, motor desligado, freio puxado, motorista sempre na mesma condição. Anote a indicação estável, saia e anote o zero. Repita',
    )
    expect(t).toMatch(/CARGA APLICADA \(kg\) = indicação na 1ª leitura VEÍCULO \/ CARGA tipo e placa HORA/)
    expect(t).toContain(
      'Zere vazia. Use um veículo de massa constante; pare nas marcas de início, meio e fim, na ida e na volta, na ordem do desenho (nº do desenho = nº da linha); em cada parada, motor desligado, freio puxado, motorista sempre na mesma condição.',
    )
    expect(t).toMatch(/CARGA USADA \(kg\) = indicação na posição 1 VEÍCULO \/ CARGA tipo e placa HORA/)
    // Nada de pesos previstos, de "faltam" nem da frente do indicador nos ensaios com o veículo
    const ensaios = t.slice(t.indexOf('7 REPETIBILIDADE'), t.indexOf('9 ENCERRAMENTO'))
    expect(ensaios).not.toContain('PESOS PREVISTOS')
    expect(ensaios).not.toContain('faltam')
    expect(ensaios).not.toContain('Frente = lado do indicador')
    expect(ensaios).not.toMatch(/Coloque [\d ]+ kg no centro/)
  })

  it('balança que não é rodoviária: carga e pesos previstos como antes; em branco, a rodoviária lembrada nas instruções', async () => {
    const t = await textoDe(folhaPlataforma())
    expect(t).toContain('Coloque 150 kg no centro da plataforma')
    expect(t).toContain('PESOS PREVISTOS (NÃO PRECISA SER PADRÃO')
    expect(t).toContain('Frente = lado do indicador.')
    expect(t).not.toContain('veículo')
    const branco = corrido(textoDoPdf(await pdfDe(EXEMPLOS[3])))
    expect(branco).toContain(
      'Rodoviária: use um veículo de massa constante (motor desligado, freio puxado, motorista sempre na mesma condição); carga aplicada = indicação na 1ª leitura.',
    )
    expect(branco).toContain(
      'Rodoviária: com um veículo, pare no início, no meio e no fim, na ida e na volta; carga usada = indicação na posição 1.',
    )
  })

  it('passo 4: selos, marca e fotos antes dos itens 1 a 6; um rótulo só da marca; a nota legal para qualquer finalidade', async () => {
    for (const e of EXEMPLOS) {
      const t = corrido(textoDoPdf(await pdfDe(e)))
      const passo4 = t.slice(t.indexOf('4 VERIFICAÇÃO ANTES DE CALIBRAR'), t.indexOf('5 ERRO DE INDICAÇÃO'))
      expect(passo4.indexOf('SELOS / LACRES ENCONTRADOS'), e.nome).toBeGreaterThan(0)
      expect(passo4.indexOf('SELOS / LACRES ENCONTRADOS'), e.nome).toBeLessThan(passo4.indexOf('Balança identificada (série'))
      expect(passo4, e.nome).toContain('MARCA DE VERIFICAÇÃO INMETRO/IPEM: ANO')
      expect(passo4, e.nome).not.toContain('(SE HOUVER)')
      expect(passo4, e.nome).toMatch(/FOTOS TIRADAS ANTES DE MEXER .*plaqueta .*mostrador .*selos/)
      expect(passo4, e.nome).toContain(
        'alibração não substitui a verificação do Inmetro/IPEM. Selos violados ou marca vencida: anote nas observações.',
      )
    }
    // A nota com a finalidade, quando ela é comercial ou na saúde; nas outras e em branco, a frase direta
    const t = (await pdfDe(EXEMPLOS[0]).then(textoDoPdf)).replace(/\s+/g, ' ')
    expect(t).toContain('A calibração não substitui a verificação do Inmetro/IPEM.')
    expect(notaLegal(null)).toBe(
      'A calibração não substitui a verificação do Inmetro/IPEM. Selos violados ou marca vencida: anote nas observações.',
    )
    const b = folhaPlataforma().balanca!
    expect(notaLegal({ ...b, finalidade: 'PROCESSO' })).toMatch(/^A calibração não substitui/)
    expect(notaLegal({ ...b, finalidade: 'LABORATORIO' })).toMatch(/^A calibração não substitui/)
    expect(notaLegal({ ...b, finalidade: '' })).toMatch(/^A calibração não substitui/)
    expect(notaLegal({ ...b, finalidade: 'COMERCIAL' })).toMatch(
      /^Balança de uso comercial \(venda por peso\): a calibração não substitui a verificação do Inmetro\/IPEM\./,
    )
    expect(notaLegal({ ...b, finalidade: 'SAUDE' })).toMatch(/^Balança de uso na saúde: a calibração não substitui/)
  })

  it('observações: o limite de ΔT pela classe da balança', async () => {
    expect(limiteDeltaT({ classe: 'II' })).toBe('ΔT acima de 3 °C')
    expect(limiteDeltaT({ classe: 'I' })).toBe('ΔT acima de 3 °C')
    expect(limiteDeltaT({ classe: 'III' })).toBe('ΔT acima de 5 °C')
    expect(limiteDeltaT({ classe: 'IIII' })).toBe('ΔT acima de 5 °C')
    expect(limiteDeltaT({ classe: '' })).toBe('ΔT acima do limite (5 °C; classe II: 3 °C)')
    expect(limiteDeltaT(null)).toBe('ΔT acima do limite (5 °C; classe II: 3 °C)')
    const dica = (t: string) =>
      t.slice(t.indexOf('OBSERVAÇÕES (SAEM NO CERTIFICADO)'), t.indexOf('OBSERVAÇÕES (SAEM NO CERTIFICADO)') + 220)
    expect(dica(corrido(textoDoPdf(await pdfDe(EXEMPLOS[0]))))).toContain('itens “Não” da verificação, ΔT acima de 5 °C, faixa')
    expect(dica(await textoDe(plataformaClasse('II')))).toContain('ΔT acima de 3 °C, faixa ou carga fora do previsto')
    expect(dica(await textoDe(plataformaClasse('IIII')))).toContain('ΔT acima de 5 °C,')
    expect(dica(await textoDe(plataformaClasse('')))).toContain('ΔT acima do limite (5 °C; classe II: 3 °C)')
    expect(dica(corrido(textoDoPdf(await pdfDe(EXEMPLOS[3]))))).toContain('ΔT acima do limite (5 °C; classe II: 3 °C)')
  })

  it('escritório: a etapa 1 recebe os passos 2, 9 (Anotações internas) e 10; o rodapé cita o PT-CAL-01', async () => {
    expect(ROTEIRO_DIGITACAO[0]).toEqual({ etapa: '1 · Cliente e OS', passos: '2, 9 (Anotações internas) e 10' })
    expect(PROCEDIMENTO).toBe('PT-CAL-01')
    const t = corrido(textoDoPdf(await pdfDe(EXEMPLOS[2])))
    expect(t).toContain('1 · Cliente e OS ← passos 2, 9 (Anotações internas) e 10')
    expect(t).toContain(
      'FOR-CAL-01 rev. 00 · PT-CAL-01 · registro de dados brutos (ISO/IEC 17025, 7.5) · não é certificado de calibração',
    )
  })

  it('páginas: plataforma e balcão em 4; as rodoviárias e a em branco em 5', async () => {
    const paginas = await Promise.all(EXEMPLOS.map(async (e) => paginasDe(textoDoPdf(await pdfDe(e))).length))
    expect(paginas).toEqual([4, 4, 5, 5, 5])
  })
})

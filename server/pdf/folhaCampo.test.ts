// Testes da folha de campo em PDF: gera as quatro amostras (server/pdf/exemplosFolhaCampo.ts), confere que
// a geração é determinística e, com o pdftotext (poppler-utils), o conteúdo de cada página: cabeçalho de
// identificação, rótulos iguais aos da tela do assistente, plano de cargas e o que NÃO pode aparecer
// (número de certificado, aprovado/reprovado, validade).

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FORMULARIO_FOLHA_CAMPO } from '#shared/folhaCampo.ts'
import { folhaEmBranco, folhaMultiIntervalo, folhaPlataforma, folhaRodoviaria } from './exemplosFolhaCampo.ts'
import {
  type DadosFolhaCampo,
  definicaoFolhaCampo,
  ETAPAS_SISTEMA,
  gerarFolhaCampoPdf,
  montar,
  nomeArquivoFolhaCampo,
  ROTEIRO_DIGITACAO,
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

const EXEMPLOS: Array<{ nome: string; dados: () => DadosFolhaCampo }> = [
  { nome: 'plataforma 300 kg (rascunho do último certificado)', dados: folhaPlataforma },
  { nome: 'balcão multi-intervalo 6/15/33 kg (sem histórico)', dados: folhaMultiIntervalo },
  { nome: 'rodoviária 80 t com substituição', dados: folhaRodoviaria },
  { nome: 'em branco', dados: folhaEmBranco },
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
      expect(t).toContain(`${FORMULARIO_FOLHA_CAMPO.codigo} rev. ${FORMULARIO_FOLHA_CAMPO.revisao}`)
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
    expect(t).toContain('INDICAÇÃO NO RETORNO AO ZERO')
    expect(t).toMatch(/Início .*Fim/)
    expect(t).toContain('MARCA DE REPARO Nº')
    expect(t).toContain('SELOS RETIRADOS')
    expect(t).toContain('SELOS COLOCADOS')
    expect(t).toContain('HORA DO AJUSTE')
    expect(t).toContain('HORA DO INÍCIO')
    expect(t).toContain('SELOS / LACRES ENCONTRADOS')
    expect(t).toContain('FOTOS TIRADAS')
    expect(t).toContain('LIGADA DESDE')
    expect(t).toContain('PESOS NO LOCAL HÁ (MIN)')
    expect(t).toContain('Instrumento usado')
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
    expect(t).toMatch(/confere ou escreva o certo/)
    expect(t).toContain('Marque com X')
    expect(t).toMatch(/nas instalações do cliente\s+PREVISTO/)
    // Troca de pesos: caixa em largura toda, com o nº da linha e os pesos usados
    expect(t).toContain('PESOS DIFERENTES DO PREVISTO')
    expect(t).toContain('nº da linha e os pesos usados de fato')
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
    expect(t).toContain('Faixa aceitável')
    expect(t).toContain('Portaria Inmetro 157/2022 — em serviço')
    expect(t).toContain('Método previsto: crescente e decrescente')
    expect(t).toContain('Indicação ↓')
    // Repetibilidade com 150 kg (5 leituras previstas, mínimo 3) e excentricidade com 100 kg em 5 posições,
    // as cargas nas casas de d
    expect(t).toContain('Coloque 150 kg no centro da plataforma')
    expect(t).toMatch(/CARGA APLICADA \(KG\).*150,00/)
    expect(t).toMatch(/CARGA USADA \(KG\).*100,00/)
    expect(t).toContain('previsto: TH-01')
    expect(t).toContain('Faça as 5 leituras previstas (mínimo 3')
    expect(t).toContain('Zere vazia e coloque 100 kg em cada posição')
    for (const p of ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita']) expect(t).toContain(p)
    expect(t).toContain('FRENTE · INDICADOR')
    expect(t).toContain('a normal (d = 50 g)')
    expect(t).toContain('21/10/2027')
    expect(t).toContain('1 · Cliente e OS ← passos 2 e 10')
  })

  it('balcão multi-intervalo: pontos sugeridos pelo sistema, d de cada intervalo e EMA por intervalo', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[1]))
    const paginas = conferirPaginas(texto, 'FC-2026-00043', ['OS-2026-0519', 'Supermercado Bom Preço', 'UR33-204718'])
    // A balança mais simples cabe em duas folhas, frente e verso, com as observações numa caixa só
    expect(paginas).toHaveLength(4)
    expect(texto).not.toContain('OBSERVAÇÕES (CONTINUAÇÃO)')
    // A parte do passo 5 que passou para a página seguinte repete o título
    expect(corrido(paginas[2])).toMatch(
      /TAG Açougue 2 5 ERRO DE INDICAÇÃO \(CONTINUAÇÃO\) NO SISTEMA 6 · Erro de indicação INDICAÇÃO NO RETORNO AO ZERO/,
    )
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
    expect(t).toContain('as que não couberem, nas observações')
    // Faixa aceitável para decidir o ajuste, e o passo 6 aponta para ela
    expect(t).toContain('Erro fora da faixa aceitável (última coluna do passo 5)')
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
    expect(t).toContain('Método previsto: crescente contínuo')
    // A coluna ↓ vai também (estreita): o método pode mudar no local
    expect(t).toContain('Indicação ↓')
    expect(t).toContain('só se descer')
    // Etapas de substituição antes e depois do ajuste, cada uma na sua aba do sistema
    const sub = t.slice(t.indexOf('Cargas de substituição'))
    expect(sub).toMatch(/COMO ENCONTRADO.*DEPOIS DO AJUSTE/)
    expect(sub).toContain('Refaça as etapas e anote nas colunas “depois do ajuste”')
    expect(t).toContain('cada uma com as suas etapas de substituição')
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

  it('rodoviária sem substituição no plano (sem histórico ou sem ela no último certificado): colunas e etapas para escrever', async () => {
    const semHistorico = folhaRodoviaria()
    semHistorico.calibracao = null
    const semSubstituicao = folhaRodoviaria()
    const k = semSubstituicao.calibracao!
    semSubstituicao.calibracao = {
      ...k,
      indicacao: {
        ...k.indicacao,
        substituicao: { ativa: false, pecas: [], etapas: [] },
        pontos: k.indicacao.pontos.map((p) => ({ ...p, nivelSubstituicao: 0 })),
      },
    }
    for (const d of [semHistorico, semSubstituicao]) {
      const texto = textoDoPdf(await gerarFolhaCampoPdf(d))
      const t = corrido(texto)
      // A coluna das substituições nos pontos e a tabela das etapas (com a carga de cada uma para escrever)
      expect(t).toMatch(/Substi- .{0,150}tuições/)
      expect(t).toMatch(/Pesos padrão .{0,150}por cima/)
      expect(t).toContain('Cargas de substituição — quando os pesos levados não chegam às cargas dos pontos')
      expect(t).toMatch(/1ª .*2ª .*3ª .*4ª/)
      expect(t).toContain('cada uma com as suas etapas de substituição')
      // Pontos e etapas na mesma página
      const pagina = paginasDe(texto).find((p) => p.includes('Cargas de substituição —'))!
      expect(pagina).toContain('ERRO DE INDICAÇÃO')
    }
    // Sem histórico: pontos sugeridos até Max (80 t), e o aviso de usar substituição
    const t = corrido(textoDoPdf(await gerarFolhaCampoPdf(semHistorico)))
    expect(t).toContain('80 000')
    expect(t).toContain('use cargas de substituição')
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
    expect(t).toContain('Faixa aceitável')
    expect(t).toContain('299,80 a 300,20')
    expect(t).toContain('o cliente não pediu declaração de conformidade')
    expect(t).toContain('Erro fora da faixa aceitável (última coluna do passo 5)')
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
    expect(t).toContain('EMA em serviço · Portaria Inmetro 157/2022')
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
    expect(t).not.toContain('Faixa aceitável')
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

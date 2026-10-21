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

describe('gerarFolhaCampoPdf', () => {
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

describe.runIf(temPdftotext)('conteúdo da folha (pdftotext)', () => {
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
    // Duas folhas, frente e verso
    expect(paginas).toHaveLength(4)
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('FRIGORÍFICO VALE DO CORUMBATAÍ LTDA')
    expect(t).toContain('Avenida Brasil, 2450')
    expect(t).toContain('Carlos Eduardo Lima')
    expect(t).toMatch(/confere ou, se diferente/)
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
    expect(paginas).toHaveLength(4)
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
    // Repetibilidade em 12 linhas (5 previstas), com a carga nas casas de d do intervalo (16,5 kg: d = 10 g)
    expect(t).toContain('16,50')
    expect(t).toContain('Linhas 6 a 12: opcionais')
  })

  it('rodoviária 80 t: substituição, posições de ida e volta e tolerância do cliente', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[2]))
    conferirPaginas(texto, 'FC-2026-00044', ['OS-2026-0530', 'Usina São Bento', 'WT3K-77120'])
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('Cargas de substituição — 10 000 kg de pesos padrão em cada etapa (20 × 500 kg)')
    expect(t).toContain('Indicação com a substituição')
    expect(t).toContain('Pesos padrão por cima')
    expect(t).toContain('Método previsto: crescente contínuo')
    expect(t).not.toContain('Indicação ↓')
    for (const p of ['Início (ida)', 'Meio (ida)', 'Fim (ida)', 'Início (volta)', 'Meio (volta)', 'Fim (volta)'])
      expect(t).toContain(p)
    expect(t).toContain('Tolerância do cliente')
    expect(t).toContain('39 940 a 40 060')
    expect(t).toContain('Faça as 3 leituras previstas (mínimo 3, por ser carga de 100 kg ou mais)')
    // Os pontos param em 40 t de 80 t: o técnico confirma com o cliente antes de sair
    expect(t).toContain('Resolva antes de sair')
    expect(t).toContain('Os pontos vão só até 40 000 kg (50 % de Max)')
  })

  it('em branco: identificação e pontos para escrever, opções de unidade, classe e receptor', async () => {
    const texto = textoDoPdf(await pdfDe(EXEMPLOS[3]))
    conferirPaginas(texto, 'FC-2026-00045', ['OS', 'CLIENTE', 'BALANÇA'])
    conferirComum(texto)
    const t = corrido(texto)
    expect(t).toContain('Folha em branco, para balança ainda não cadastrada')
    expect(t).toContain('FINALIDADE (*)')
    expect(t).toContain('banda de guarda')
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
  })
})

// Campo numérico das leituras: o valor gravado é sempre o número do texto que está no campo (ou nada), e a navegação
// de planilha (Enter) passa de um ensaio de repetibilidade para o seguinte. Sem DOM: a lógica pura do campo e a
// etapa desenhada no servidor.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO, numero } from '#shared/dominio.ts'
import type { Balanca, CalibracaoInput, Cliente } from '#shared/tipos.ts'
import { alvoNaGrade, valorDoTexto, type PosicaoGrade } from './digitacao'
import type { ContextoEtapa } from './contexto'
import { EtapaRepetibilidade } from './EtapaRepetibilidade'
import { gradeRepetibilidade } from './util'

describe('numero(): texto digitado → número', () => {
  it('vírgula decimal, ponto decimal e o milhar brasileiro', () => {
    expect(numero('12,5')).toBe(12.5)
    expect(numero('12.5')).toBe(12.5)
    expect(numero('1.234,5')).toBe(1234.5)
    expect(numero('1.234.567,25')).toBe(1234567.25)
    expect(numero('12 345,6')).toBe(12345.6)
    expect(numero('-0,005')).toBe(-0.005)
    expect(numero(',5')).toBe(0.5)
    // No meio da digitação
    expect(numero('10,')).toBe(10)
    expect(numero('1.234,')).toBe(1234)
    // Ponto sozinho é decimal (regra documentada)
    expect(numero('1.000')).toBe(1)
  })

  it('mistura ambígua, separador repetido e letras: NaN (nunca um número parecido)', () => {
    expect(numero('1,234.5')).toBeNaN() // formato americano
    expect(numero('10,0.5')).toBeNaN()
    expect(numero('15,,005')).toBeNaN()
    expect(numero('11,99525,00')).toBeNaN()
    expect(numero('1.000.000')).toBeNaN()
    expect(numero('1.2345,6')).toBeNaN() // milhar fora de grupos de 3
    expect(numero('5-')).toBeNaN()
    expect(numero('-')).toBeNaN()
    expect(numero(',')).toBeNaN()
    expect(numero('10,O5')).toBeNaN()
    expect(numero('30,0l5')).toBeNaN()
    expect(numero('1e5')).toBeNaN()
    expect(numero('0x10')).toBeNaN()
    expect(numero('Infinity')).toBeNaN()
  })
})

describe('valorDoTexto(): o que o campo grava', () => {
  it('o número do texto inteiro; vazio → null', () => {
    expect(valorDoTexto('12,005')).toBe(12.005)
    expect(valorDoTexto('')).toBeNull()
    expect(valorDoTexto('   ')).toBeNull()
  })

  it('texto inválido grava null, não o último número válido da digitação', () => {
    // Digitado tecla a tecla, cada passo grava o número do texto que está no campo
    const gravados = (texto: string) => [...texto].map((_, i) => valorDoTexto(texto.slice(0, i + 1)))
    expect(gravados('15,,005').at(-1)).toBeNull()
    expect(gravados('11,99525,00').at(-1)).toBeNull()
    expect(gravados('1.000.000').at(-1)).toBeNull()
    expect(gravados('5-').at(-1)).toBeNull()
    // Letra no lugar do algarismo: o campo fica com o texto (em vermelho) e nada é gravado
    expect(gravados('10,O5').at(-1)).toBeNull()
    expect(gravados('30,0l5').at(-1)).toBeNull()
  })
})

// ---- Navegação de planilha ----------------------------------------------------------------------------------------

describe('alvoNaGrade(): Enter, ↑ e ↓ entre os campos de um grupo', () => {
  const coluna = (col: number, n: number): PosicaoGrade[] => Array.from({ length: n }, (_, lin) => ({ lin, col }))
  const campos = [...coluna(0, 5), ...coluna(1, 3)]
  const em = (lin: number, col: number) => campos.findIndex((c) => c.lin === lin && c.col === col)

  it('desce na coluna e, no fim dela, vai ao topo da coluna seguinte', () => {
    expect(alvoNaGrade(campos, { lin: 0, col: 0 }, 1)).toBe(em(1, 0))
    expect(alvoNaGrade(campos, { lin: 4, col: 0 }, 1)).toBe(em(0, 1))
    // Fim da última coluna: fica onde está
    expect(alvoNaGrade(campos, { lin: 2, col: 1 }, 1)).toBe(-1)
  })

  it('sobe na coluna; Shift+Enter no topo volta ao fim da coluna anterior (o caminho inverso do Enter)', () => {
    expect(alvoNaGrade(campos, { lin: 2, col: 1 }, -1)).toBe(em(1, 1))
    expect(alvoNaGrade(campos, { lin: 0, col: 1 }, -1, true)).toBe(em(4, 0))
    // ↑ no topo não troca de coluna
    expect(alvoNaGrade(campos, { lin: 0, col: 1 }, -1)).toBe(-1)
    expect(alvoNaGrade(campos, { lin: 0, col: 0 }, -1, true)).toBe(-1)
  })
})

describe('repetibilidade: as 10 leituras de 2 ensaios digitadas em sequência, com Enter', () => {
  it('o Enter na 5ª leitura do ensaio 1 vai para a 1ª do ensaio 2; nada se emenda', () => {
    const ensaios = [Array<number | null>(5).fill(null), Array<number | null>(5).fill(null)]
    // Os campos da etapa, na grade que ela usa
    const campos = ensaios.flatMap((l, e) => l.map((_, i) => ({ e, i, ...gradeRepetibilidade(e, i) })))
    expect(new Set(campos.map((c) => c.grupo)).size).toBe(1)
    let foco = 0
    const textos = campos.map(() => '')
    for (const tecla of '12,000⏎12,005⏎12,000⏎12,000⏎11,995⏎25,00⏎25,01⏎25,00⏎25,00⏎25,01⏎') {
      const c = campos[foco]
      if (tecla === '⏎') {
        const alvo = alvoNaGrade(campos, c, 1)
        if (alvo >= 0) foco = alvo
        continue
      }
      textos[foco] += tecla
      ensaios[c.e][c.i] = valorDoTexto(textos[foco])
    }
    expect(ensaios).toEqual([
      [12, 12.005, 12, 12, 11.995],
      [25, 25.01, 25, 25, 25.01],
    ])
  })

  it('a leitura com texto inválido fica vazia e o cálculo aponta a falta (não sai um número que ninguém digitou)', () => {
    const balanca = { ...BALANCA_VAZIA, id: 'b1', faixas: [{ max: 30, e: 0.01, d: 0.01 }] } as Balanca
    const leituras = ['12,000', '12,005', '12,000', '12,000', '11,99525,00'].map(valorDoTexto)
    expect(leituras).toEqual([12, 12.005, 12, 12, null])
    const f: CalibracaoInput = { ...calibracaoVazia(), repetibilidade: [{ id: 'r1', carga: 12, leituras }] }
    const { resultado } = calcularCalibracao(f, balanca, [])
    expect(resultado.repetibilidade[0].n).toBe(4)
    expect(resultado.pendencias.some((p) => p.startsWith('Repetibilidade a 12,00 kg: 4 leituras'))).toBe(true)
  })

  it('a etapa põe todos os ensaios na mesma grade, um ensaio por coluna', () => {
    const balanca = {
      ...BALANCA_VAZIA,
      id: 'b1',
      tipoFaixas: 'MULTI_INTERVALO',
      faixas: [
        { max: 15, e: 0.005, d: 0.005 },
        { max: 30, e: 0.01, d: 0.01 },
      ],
    } as Balanca
    const f: CalibracaoInput = {
      ...calibracaoVazia(),
      repetibilidade: [
        { id: 'r1', carga: 12, leituras: [null, null, null, null, null] },
        { id: 'r2', carga: 25, leituras: [null, null, null, null, null] },
      ],
    }
    const ctx: ContextoEtapa = {
      f,
      alterar: () => {},
      balanca,
      cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
      padroes: [],
      selecionados: [],
      calc: null,
      config: CONFIG_PADRAO,
      equipe: [],
      status: 'RASCUNHO',
      editarBalanca: () => {},
      folhaCampo: null,
      vincularFolha: async () => true,
      novaFolha: () => {},
    }
    const html = renderToStaticMarkup(createElement(EtapaRepetibilidade, ctx))
    const grades = [...html.matchAll(/data-grade="([^"]+)" data-lin="(\d+)" data-col="(\d+)"/g)].map((m) => [m[1], +m[2], +m[3]])
    expect(grades).toHaveLength(10)
    expect(new Set(grades.map((g) => g[0]))).toEqual(new Set(['rep']))
    expect(grades.filter((g) => g[2] === 0)).toHaveLength(5)
    expect(grades.filter((g) => g[2] === 1)).toHaveLength(5)
  })
})

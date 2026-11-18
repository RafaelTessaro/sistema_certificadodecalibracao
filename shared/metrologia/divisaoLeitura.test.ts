// As regras de uma leitura que o cálculo usa e que os avisos na hora do app do celular reaproveitam
// (shared/campo/avisos.ts): o d com que a leitura é lida, o múltiplo da divisão, as casas e as leituras mínimas da
// repetibilidade. O comportamento do cálculo não muda (os testes do cálculo continuam iguais).

import { describe, expect, it } from 'vitest'
import { casasAbaixoDaDivisao, divisaoDaLeitura, leituraForaDaDivisao, minimoLeiturasRepetibilidade } from './calculo.ts'

describe('leitura e divisão', () => {
  it('múltiplo de d: tolera só o ruído do binário', () => {
    expect(leituraForaDaDivisao(100.05, 0.05)).toBe(false)
    expect(leituraForaDaDivisao(100.03, 0.05)).toBe(true)
    expect(leituraForaDaDivisao(4.998, 0.002)).toBe(false)
    expect(leituraForaDaDivisao(80_020, 20)).toBe(false)
    expect(leituraForaDaDivisao(80_010, 20)).toBe(true)
    expect(leituraForaDaDivisao(-0.05, 0.05)).toBe(false)
    expect(leituraForaDaDivisao(220.0002, 0.0001)).toBe(false)
  })

  it('sem d (zero ou negativo) ou leitura inválida: nunca fora', () => {
    expect(leituraForaDaDivisao(100.03, 0)).toBe(false)
    expect(leituraForaDaDivisao(100.03, -1)).toBe(false)
    expect(leituraForaDaDivisao(Number.NaN, 0.05)).toBe(false)
  })

  it('menos casas que a divisão: pelas casas escritas ("150,0" com d = 0,05)', () => {
    expect(casasAbaixoDaDivisao(1, 0.05)).toBe(true)
    expect(casasAbaixoDaDivisao(0, 0.05)).toBe(true)
    expect(casasAbaixoDaDivisao(2, 0.05)).toBe(false)
    expect(casasAbaixoDaDivisao(3, 0.05)).toBe(false)
    expect(casasAbaixoDaDivisao(0, 20)).toBe(false)
    expect(casasAbaixoDaDivisao(3, 0.0001)).toBe(true)
    expect(casasAbaixoDaDivisao(0, 0)).toBe(false)
  })

  it('o d da leitura: divisão de teste, intervalo da indicação (multi-intervalo) ou faixa da carga', () => {
    const multiIntervalo = {
      tipoFaixas: 'MULTI_INTERVALO' as const,
      faixas: [
        { max: 15, e: 0.005, d: 0.005 },
        { max: 30, e: 0.01, d: 0.01 },
      ],
    }
    const multiplas = { ...multiIntervalo, tipoFaixas: 'MULTIPLAS_FAIXAS' as const }
    expect(divisaoDaLeitura(10, multiIntervalo, 0, 10)).toBe(0.005)
    expect(divisaoDaLeitura(20, multiIntervalo, 0, 10)).toBe(0.01)
    // Múltiplas faixas: a faixa da carga (na descida sem descarregar, a da maior carga aplicada)
    expect(divisaoDaLeitura(10, multiplas, 0, 10)).toBe(0.005)
    expect(divisaoDaLeitura(10, multiplas, 0, 30)).toBe(0.01)
    expect(divisaoDaLeitura(10, multiplas, 0.001, 30)).toBe(0.001)
  })

  it('leituras mínimas da repetibilidade (POP, Tabela 4): 10 na classe I; 5, ou 3 com carga ≥ 100 kg', () => {
    expect(minimoLeiturasRepetibilidade(200, { classe: 'I', unidade: 'g' })).toBe(10)
    expect(minimoLeiturasRepetibilidade(150_000, { classe: 'I', unidade: 'g' })).toBe(10)
    expect(minimoLeiturasRepetibilidade(50, { classe: 'III', unidade: 'kg' })).toBe(5)
    expect(minimoLeiturasRepetibilidade(100, { classe: 'III', unidade: 'kg' })).toBe(3)
    expect(minimoLeiturasRepetibilidade(100_000, { classe: 'II', unidade: 'g' })).toBe(3)
    expect(minimoLeiturasRepetibilidade(10, { classe: '', unidade: 't' })).toBe(3)
    expect(minimoLeiturasRepetibilidade(99.9, { classe: 'IIII', unidade: 'kg' })).toBe(5)
  })
})

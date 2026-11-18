import { describe, expect, it } from 'vitest'
import { podeRepetir, repetir, tecladoVazio, teclar, textoParaConfirmar } from './teclado.ts'
import type { EstadoTeclado } from './teclado.ts'

const digitar = (teclas: string[], inicio: EstadoTeclado = tecladoVazio()) => teclas.reduce(teclar, inicio)

describe('teclado do app', () => {
  it('guarda o texto exatamente como digitado (nada é completado com zeros)', () => {
    expect(digitar(['1', '0', '0', ',', '0']).texto).toBe('100,0')
    expect(textoParaConfirmar(digitar(['1', '0', '0', ',', '0']))).toBe('100,0')
    expect(digitar(['1', '5', '0']).texto).toBe('150')
  })

  it('vírgula decimal: uma só; sozinha vira "0,"; o ponto do teclado físico vira vírgula', () => {
    expect(digitar([',', '5']).texto).toBe('0,5')
    expect(digitar(['1', ',', '2', ',', '3']).texto).toBe('1,23')
    expect(digitar(['1', '.', '5']).texto).toBe('1,5')
  })

  it('± põe e tira o sinal na frente, a qualquer momento', () => {
    expect(digitar(['±', '0', ',', '0', '2']).texto).toBe('-0,02')
    expect(digitar(['0', ',', '0', '2', '±']).texto).toBe('-0,02')
    expect(digitar(['5', '±', '±']).texto).toBe('5')
    expect(digitar(['-', '3']).texto).toBe('-3')
  })

  it('⌫ apaga um caractere; "limpar" apaga tudo', () => {
    expect(digitar(['1', '2', ',', '5', '⌫']).texto).toBe('12,')
    expect(digitar(['1', 'Backspace']).texto).toBe('')
    expect(digitar(['⌫']).texto).toBe('')
    expect(digitar(['1', '2', 'limpar']).texto).toBe('')
  })

  it('o zero sozinho vira o algarismo ("05" nunca aparece); limites do formato', () => {
    expect(digitar(['0', '5']).texto).toBe('5')
    expect(digitar(['±', '0', '7']).texto).toBe('-7')
    expect(digitar(Array(15).fill('9')).texto).toBe('9'.repeat(12))
    expect(digitar(['1', ',', ...Array(12).fill('1')]).texto).toBe(`1,${'1'.repeat(9)}`)
    expect(digitar(['x', 'a']).texto).toBe('')
  })

  it('ao confirmar: a vírgula pendurada sai; o sinal sozinho é vazio', () => {
    expect(textoParaConfirmar({ texto: '12,', via: 'teclado' })).toBe('12')
    expect(textoParaConfirmar({ texto: '-', via: 'teclado' })).toBe('')
    expect(textoParaConfirmar({ texto: '', via: 'teclado' })).toBe('')
    expect(textoParaConfirmar({ texto: '1,2,3', via: 'teclado' })).toBeNull()
  })

  it('Repetir: só na repetibilidade e na excentricidade; marca a leitura; digitar depois volta a ser teclado', () => {
    expect(podeRepetir('REPETIBILIDADE')).toBe(true)
    expect(podeRepetir('EXCENTRICIDADE')).toBe(true)
    expect(podeRepetir('INDICACAO_CRESCENTE')).toBe(false)
    expect(podeRepetir('INDICACAO_DECRESCENTE')).toBe(false)
    expect(podeRepetir('TEMPERATURA')).toBe(false)
    const r = repetir('150,00')
    expect(r).toEqual({ texto: '150,00', via: 'repetir' })
    expect(teclar(r, '⌫')).toEqual({ texto: '150,0', via: 'teclado' })
  })
})

describe('o valor do "Repetir"', () => {
  it('a leitura anterior da mesma série; nada no erro de indicação', async () => {
    const { APARELHO_EXEMPLO, pacotePlataforma, TECNICO_EXEMPLO } = await import('../../../shared/campo/exemplos.ts')
    const { registroInicial } = await import('../../../shared/campo/registro.ts')
    const { valorParaRepetir } = await import('./teclado.ts')
    const r = registroInicial(pacotePlataforma(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: '2026-11-18T08:00:00-03:00' })
    const id = r.passos.repetibilidade[0].id
    expect(valorParaRepetir(r, `repetibilidade.${id}.leituras.0`)).toBe('')
    r.passos.repetibilidade[0].leituras.push({ valor: '150,05', em: '2026-11-18T08:00:00-03:00', via: 'teclado' })
    expect(valorParaRepetir(r, `repetibilidade.${id}.leituras.1`)).toBe('150,05')
    r.passos.excentricidade.posicoes[0].leitura = { valor: '100,00', em: '2026-11-18T08:00:00-03:00', via: 'teclado' }
    expect(valorParaRepetir(r, 'excentricidade.posicoes.1.leitura')).toBe('100,00')
    expect(valorParaRepetir(r, 'excentricidade.posicoes.0.leitura')).toBe('')
    expect(valorParaRepetir(r, 'indicacao.pontos.p1.crescente')).toBeNull()
    expect(valorParaRepetir(r, 'ambiente.linhas.0.temperatura')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  algarismosSignificativos,
  arredondarMeioPar,
  arredondarResultado,
  arredondarSignificativos,
  casasDecimais,
  formatarNumero,
  limparRuido,
  ordemDeGrandeza,
} from './arredondamento.ts'

const NBSP = ' '

describe('arredondarResultado', () => {
  it('U com 2 algarismos e o erro na casa de U (NIT-DICLA-021 §6.3)', () => {
    expect(arredondarResultado(4.985, 7.7277)).toMatchObject({ erro: '5,0', U: '7,7', casas: 1 })
    expect(arredondarResultado(9.85, 11.2023)).toMatchObject({ erro: '10', U: '11', casas: 0 })
    expect(arredondarResultado(2.465, 7.8276)).toMatchObject({ erro: '2,5', U: '7,8' })
  })

  it('não mostra "-0,0"', () => {
    expect(arredondarResultado(-0.035, 7.4)).toMatchObject({ erro: '0,0', U: '7,4', valorErro: 0 })
    expect(arredondarResultado(-0.35, 7.4).erro).toBe('-0,4')
  })

  it('aplica o meio-par no 5 exato (NBR 5891), sem o erro do binário', () => {
    expect(arredondarResultado(4.85, 0.12).erro).toBe('4,85')
    expect(arredondarResultado(4.85, 1.2).erro).toBe('4,8')
    expect(arredondarResultado(4.55, 1.2).erro).toBe('4,6')
    expect(arredondarResultado(9.85, 1.2).erro).toBe('9,8')
    expect(arredondarResultado(1, 0.0845).U).toBe('0,084')
    expect(arredondarResultado(1, 0.0855).U).toBe('0,086')
  })

  it('quando U sobe de ordem fica com 2 algarismos', () => {
    expect(arredondarResultado(4.94, 9.96)).toMatchObject({ erro: '5', U: '10', casas: 0 })
    expect(arredondarResultado(123, 99.7)).toMatchObject({ erro: '120', U: '100', casas: -1 })
  })

  it('U grande arredonda em dezenas/centenas, com separador de milhar', () => {
    expect(arredondarResultado(1234.5, 1234)).toMatchObject({ erro: '1200', U: '1200', casas: -2 })
    expect(arredondarResultado(25049, 47.8)).toMatchObject({ erro: `25${NBSP}049`, U: '48' })
    expect(arredondarResultado(0.000126, 0.000_93)).toMatchObject({ erro: '0,00013', U: '0,00093' })
  })

  it('devolve os valores arredondados como número', () => {
    const r = arredondarResultado(9.97, 9.1274)
    expect(r.valorErro).toBe(10)
    expect(r.valorU).toBe(9.1)
    expect(r.erro).toBe('10,0')
  })
})

describe('formatarNumero', () => {
  it('vírgula decimal e espaço não separável a partir de 5 dígitos', () => {
    expect(formatarNumero(5000, 0)).toBe('5000')
    expect(formatarNumero(10005, 0)).toBe(`10${NBSP}005`)
    expect(formatarNumero(1234567.891, 2)).toBe(`1${NBSP}234${NBSP}567,89`)
    expect(formatarNumero(0.005, 3)).toBe('0,005')
    expect(formatarNumero(2.0241, 2)).toBe('2,02')
    expect(formatarNumero(-12345.5, 1)).toBe(`-12${NBSP}345,5`)
  })

  it('meio-par e sem "-0"', () => {
    expect(formatarNumero(4.85, 1)).toBe('4,8')
    expect(formatarNumero(4.55, 1)).toBe('4,6')
    expect(formatarNumero(2.5, 0)).toBe('2')
    expect(formatarNumero(3.5, 0)).toBe('4')
    expect(formatarNumero(-0.004, 2)).toBe('0,00')
    expect(formatarNumero(7, 2)).toBe('7,00')
  })

  it('infinito e NaN', () => {
    expect(formatarNumero(Infinity, 0)).toBe('∞')
    expect(formatarNumero(NaN, 2)).toBe('')
  })
})

describe('auxiliares decimais', () => {
  it('casasDecimais', () => {
    expect(casasDecimais(0.005)).toBe(3)
    expect(casasDecimais(5)).toBe(0)
    expect(casasDecimais(0.1 + 0.2)).toBe(1)
    expect(casasDecimais(2.5)).toBe(1)
    expect(casasDecimais(1e-7)).toBe(7)
    expect(casasDecimais(20000)).toBe(0)
  })

  it('arredondarMeioPar e arredondarSignificativos', () => {
    expect(arredondarMeioPar(9.85, 1)).toBe(9.8)
    expect(arredondarMeioPar(1250, -2)).toBe(1200)
    expect(arredondarMeioPar(1350, -2)).toBe(1400)
    expect(arredondarSignificativos(22500, 2)).toBe(22000)
    expect(arredondarSignificativos(0.012345, 3)).toBe(0.0123)
  })

  it('ordem de grandeza e algarismos significativos', () => {
    expect(ordemDeGrandeza(1000)).toBe(3)
    expect(ordemDeGrandeza(999.9)).toBe(2)
    expect(ordemDeGrandeza(0.001)).toBe(-3)
    expect(algarismosSignificativos(22500)).toBe(3)
    expect(algarismosSignificativos(0.005)).toBe(1)
  })

  it('limparRuido tira o ruído do binário das diferenças', () => {
    expect(30010 - 30000.15).not.toBe(9.85)
    expect(limparRuido(30010 - 30000.15, 30010)).toBe(9.85)
    expect(limparRuido(0.1 + 0.2)).toBe(0.3)
    expect(limparRuido(2.5)).toBe(2.5)
  })
})

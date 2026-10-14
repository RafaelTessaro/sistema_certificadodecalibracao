import { describe, expect, it } from 'vitest'
import { classeMinimaPesos, converterMassa, montarCarga, pecaCalculo } from './pesos.ts'
import type { PecaDisponivel } from './pesos.ts'

describe('converterMassa', () => {
  it('converte entre mg, g, kg e t sem ruído visível', () => {
    expect(converterMassa(5000, 'g', 'kg')).toBe(5)
    expect(converterMassa(0.035, 'g', 'kg')).toBe(0.000035)
    expect(converterMassa(60, 't', 'kg')).toBe(60000)
    expect(converterMassa(250, 'mg', 'g')).toBe(0.25)
    expect(converterMassa(1, 'mg', 't')).toBe(1e-9)
    expect(converterMassa(7, 'kg', 'kg')).toBe(7)
  })
})

describe('montarCarga', () => {
  const pecasKg = (...nominais: number[]): PecaDisponivel[] => nominais.map((n, i) => ({ chave: `p${i}`, nominal: n, quantidade: 1 }))

  it('35 kg com 20, 10, 5, 2, 2 e 1 kg → 20 + 10 + 5', () => {
    const r = montarCarga(35, pecasKg(20, 10, 5, 2, 2, 1))
    expect(r.completa).toBe(true)
    expect(r.faltou).toBe(0)
    expect(r.pecas.map((p) => p.nominal)).toEqual([20, 10, 5])
    expect(r.soma).toBe(35)
  })

  it('usa a quantidade disponível de cada peça', () => {
    const r = montarCarga(9, [
      { chave: '5', nominal: 5, quantidade: 1 },
      { chave: '2', nominal: 2, quantidade: 2 },
      { chave: '1', nominal: 1, quantidade: 1 },
    ])
    expect(r.pecas).toEqual([
      { chave: '5', nominal: 5, quantidade: 1 },
      { chave: '2', nominal: 2, quantidade: 2 },
    ])
  })

  it('carga impossível: devolve o que deu e quanto faltou', () => {
    const r = montarCarga(50, pecasKg(20, 10, 5, 2, 2, 1))
    expect(r.completa).toBe(false)
    expect(r.soma).toBe(40)
    expect(r.faltou).toBe(10)
    const pequena = montarCarga(0.5, pecasKg(1, 2))
    expect(pequena).toMatchObject({ pecas: [], soma: 0, faltou: 0.5, completa: false })
  })

  it('quando a gulosa não fecha, procura outra combinação', () => {
    const r = montarCarga(6, pecasKg(5, 3, 3))
    expect(r.completa).toBe(true)
    expect(r.pecas.map((p) => p.nominal)).toEqual([3, 3])
  })

  it('lida com o ruído do ponto flutuante (tolerância relativa de 1e-9)', () => {
    const r = montarCarga(0.3, pecasKg(0.2, 0.1))
    expect(r.completa).toBe(true)
    expect(r.soma).toBe(0.3)
    expect(montarCarga(0.035, pecasKg(0.02, 0.01, 0.005)).completa).toBe(true)
  })
})

describe('pecaCalculo', () => {
  const peso = { nominal: 10_000, correcao: 120, incerteza: 160, k: 2 }

  it('pelo certificado: correção e U em mg viram a unidade da balança', () => {
    const p = pecaCalculo(peso, { uso: 'CERTIFICADO', classe: 'M1' }, 'kg', 2)
    expect(p).toEqual({ nominal: 10, correcao: 0.00012, incerteza: 0.00016, k: 2, ema: 0.0005, usarCertificado: true, quantidade: 2 })
  })

  it('pelo nominal: sem correção nem U; incerteza pelo EMA da classe', () => {
    const p = pecaCalculo(peso, { uso: 'NOMINAL', classe: 'F2' }, 'g')
    expect(p).toEqual({ nominal: 10_000, correcao: 0, incerteza: 0, k: 2, ema: 0.16, usarCertificado: false, quantidade: 1 })
    expect(pecaCalculo({ ...peso, k: 0 }, { uso: 'NOMINAL', classe: '' }, 'g')).toMatchObject({ k: 2, ema: 0 })
  })
})

describe('classeMinimaPesos', () => {
  it('classe III: M1 para n = 6000 e M2 para n = 3000 (doc §6.2)', () => {
    expect(classeMinimaPesos({ unidade: 'g', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30000, e: 5, d: 5 }] })).toBe('M1')
    expect(classeMinimaPesos({ unidade: 'kg', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30, e: 0.01, d: 0.01 }] })).toBe('M2')
    expect(classeMinimaPesos({ unidade: 'kg', classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30, e: 0.005, d: 0.005 }] })).toBe('M1')
  })

  it('classe II e balança sem classe', () => {
    expect(classeMinimaPesos({ unidade: 'g', classe: 'II', tipoFaixas: 'UNICA', faixas: [{ max: 3000, e: 0.1, d: 0.01 }] })).toBe('F2')
    expect(classeMinimaPesos({ unidade: 'g', classe: '', tipoFaixas: 'UNICA', faixas: [{ max: 3000, e: 0.1, d: 0.01 }] })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { emaInstrumento, emaPeso, faixaDoValor } from './ema.ts'
import type { InstrumentoEma } from './ema.ts'

const classeIII5g: InstrumentoEma = { classe: 'III', tipoFaixas: 'UNICA', faixas: [{ max: 30000, e: 5, d: 5 }] }

describe('emaInstrumento', () => {
  it('classe III, e = 5 g, OIML inicial: fronteiras inclusivas no limite superior', () => {
    expect(emaInstrumento(0, classeIII5g, 'OIML_INICIAL')).toBe(2.5)
    expect(emaInstrumento(2500, classeIII5g, 'OIML_INICIAL')).toBe(2.5)
    expect(emaInstrumento(2505, classeIII5g, 'OIML_INICIAL')).toBe(5)
    expect(emaInstrumento(10000, classeIII5g, 'OIML_INICIAL')).toBe(5)
    expect(emaInstrumento(10005, classeIII5g, 'OIML_INICIAL')).toBe(7.5)
    expect(emaInstrumento(30000, classeIII5g, 'OIML_INICIAL')).toBe(7.5)
  })

  it('OIML em serviço é o dobro', () => {
    expect(emaInstrumento(2500, classeIII5g, 'OIML_SERVICO')).toBe(5)
    expect(emaInstrumento(10000, classeIII5g, 'OIML_SERVICO')).toBe(10)
    expect(emaInstrumento(30000, classeIII5g, 'OIML_SERVICO')).toBe(15)
  })

  it('Portaria 157/2022: verificação {1; 2; 2}·e e em serviço o dobro', () => {
    expect(emaInstrumento(2500, classeIII5g, 'PORTARIA_VERIFICACAO')).toBe(5)
    expect(emaInstrumento(2505, classeIII5g, 'PORTARIA_VERIFICACAO')).toBe(10)
    expect(emaInstrumento(10005, classeIII5g, 'PORTARIA_VERIFICACAO')).toBe(10)
    expect(emaInstrumento(30000, classeIII5g, 'PORTARIA_VERIFICACAO')).toBe(10)
    expect(emaInstrumento(2500, classeIII5g, 'PORTARIA_SERVICO')).toBe(10)
    expect(emaInstrumento(10000, classeIII5g, 'PORTARIA_SERVICO')).toBe(20)
    expect(emaInstrumento(30000, classeIII5g, 'PORTARIA_SERVICO')).toBe(20)
  })

  it('multi-intervalo do exemplo R76 (2/5/15 kg; e = 1/2/10 g): o e é o da faixa parcial', () => {
    const r76: InstrumentoEma = {
      classe: 'III',
      tipoFaixas: 'MULTI_INTERVALO',
      faixas: [
        { max: 2000, e: 1, d: 1 },
        { max: 5000, e: 2, d: 2 },
        { max: 15000, e: 10, d: 10 },
      ],
    }
    const ema = (m: number) => emaInstrumento(m, r76, 'OIML_INICIAL')
    // 0,5 g até 500 g; 1 g até 2 kg; 2 g até 4 kg; 3 g até 5 kg; 10 g até 15 kg
    expect([ema(100), ema(500), ema(501), ema(2000), ema(2002), ema(4000), ema(4002), ema(5000), ema(5010), ema(15000)]).toEqual([
      0.5, 0.5, 1, 1, 2, 2, 3, 3, 10, 10,
    ])
    expect(faixaDoValor(5000, r76).e).toBe(2)
    expect(faixaDoValor(20000, r76).e).toBe(10)
  })

  it('classes I, II e IIII e unidades com ruído de ponto flutuante', () => {
    const classeII: InstrumentoEma = { classe: 'II', tipoFaixas: 'UNICA', faixas: [{ max: 6, e: 0.0001, d: 0.0001 }] } // kg
    expect(emaInstrumento(0.5, classeII, 'OIML_INICIAL')).toBe(0.00005)
    expect(emaInstrumento(0.5001, classeII, 'OIML_INICIAL')).toBe(0.0001)
    expect(emaInstrumento(2.0001, classeII, 'OIML_INICIAL')).toBe(0.00015)
    const classeI: InstrumentoEma = { classe: 'I', tipoFaixas: 'UNICA', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] } // g
    expect(emaInstrumento(50, classeI, 'OIML_INICIAL')).toBe(0.0005)
    expect(emaInstrumento(200.001, classeI, 'OIML_INICIAL')).toBe(0.0015)
    const classeIIII: InstrumentoEma = { classe: 'IIII', tipoFaixas: 'UNICA', faixas: [{ max: 5000, e: 5, d: 5 }] }
    expect(emaInstrumento(250, classeIIII, 'OIML_INICIAL')).toBe(2.5)
    expect(emaInstrumento(1005, classeIIII, 'OIML_INICIAL')).toBe(7.5)
  })

  it('classe não marcada dá null, exceto pela tolerância do cliente', () => {
    const semClasse: InstrumentoEma = { ...classeIII5g, classe: '' }
    expect(emaInstrumento(1000, semClasse, 'OIML_INICIAL')).toBeNull()
    expect(emaInstrumento(1000, semClasse, 'CLIENTE', 12)).toBe(12)
    expect(emaInstrumento(1000, classeIII5g, 'CLIENTE', 0)).toBeNull()
  })
})

describe('emaPeso (OIML R111 Tabela 1, mg)', () => {
  it('valores da tabela', () => {
    expect(emaPeso(10_000, 'M1')).toBe(500)
    expect(emaPeso(1_000, 'F1')).toBe(5)
    expect(emaPeso(20_000, 'M2')).toBe(3000)
    expect(emaPeso(0.5, 'F2')).toBe(0.25)
    expect(emaPeso(5_000_000, 'M3')).toBe(2_500_000)
    expect(emaPeso(0.001, 'E1')).toBe(0.003)
    expect(emaPeso(50_000, 'M1-2')).toBe(5000)
  })

  it('nominal fora da tabela usa o imediatamente inferior da década (série 1-2-5)', () => {
    expect(emaPeso(25_000, 'M1')).toBe(1000)
    expect(emaPeso(3, 'F1')).toBe(0.12)
    expect(emaPeso(7_000_000, 'M1')).toBe(250_000)
    expect(emaPeso(0.3, 'F1')).toBe(0.06)
  })

  it('sem correspondência ou nominal inexistente na classe dá null', () => {
    expect(emaPeso(20_000, 'M1-2')).toBeNull()
    expect(emaPeso(0.05, 'M2')).toBeNull()
    expect(emaPeso(10_000_000, 'M1')).toBeNull()
    expect(emaPeso(0.0005, 'E2')).toBeNull()
    expect(emaPeso(1000, '')).toBeNull()
    expect(emaPeso(0, 'M1')).toBeNull()
  })
})

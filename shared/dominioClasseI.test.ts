// Classe I no domínio: campos novos (opcionais) e a normalização deles, as opções do cálculo da classe, os
// requisitos por classe (ΔT, aquecimento) e o limite de ΔT pesos − ar do POP 7.4.

import { describe, expect, it } from 'vitest'
import {
  AMBIENTE_VAZIO,
  calibracaoVazia,
  deltaTMaximo,
  deltaTPesosMaximo,
  faltamOpcoesDaClasse,
  normalizarCalibracao,
  normalizarOpcoes,
  normalizarPadrao,
  OPCOES_CALCULO_PADRAO,
  opcoesDaClasse,
  PADRAO_VAZIO,
  pressaoObrigatoria,
  verificacoesAntesDeCalibrar,
} from './dominio.ts'
import { repetibilidadesSugeridas } from './metrologia/sugestoes.ts'

describe('normalização dos campos novos', () => {
  it('opções: aceita o empuxo MEDIDO e a convecção; o padrão continua sem convecção e com o 5d', () => {
    expect(OPCOES_CALCULO_PADRAO.empuxo).toBe('NAO_AJUSTADO')
    expect(OPCOES_CALCULO_PADRAO.deriva).toBe('EMA')
    expect(OPCOES_CALCULO_PADRAO.conveccao).toBe('NAO_CONSIDERAR')
    expect(normalizarOpcoes({ empuxo: 'MEDIDO', conveccao: 'CALCULAR' })).toMatchObject({
      empuxo: 'MEDIDO',
      conveccao: 'CALCULAR',
    })
    // Registro antigo (sem o campo) e valor desconhecido: o padrão
    expect(normalizarOpcoes({ empuxo: 'AJUSTADO' }).conveccao).toBe('NAO_CONSIDERAR')
    expect(normalizarOpcoes({ conveccao: 'TALVEZ', empuxo: 'XYZ' })).toMatchObject({
      conveccao: 'NAO_CONSIDERAR',
      empuxo: 'NAO_AJUSTADO',
    })
    expect(normalizarOpcoes({}, { ...OPCOES_CALCULO_PADRAO, conveccao: 'CALCULAR', empuxo: 'MEDIDO' })).toMatchObject({
      conveccao: 'CALCULAR',
      empuxo: 'MEDIDO',
    })
  })

  it('ambiente: ΔT pesos − ar medido (−30 a 30 °C) e a aclimatação (ΔT0 de −40 a 40 °C, 0 a 2 880 min)', () => {
    const amb = (ambiente: object) =>
      normalizarCalibracao({ ...calibracaoVazia(), clienteId: 'c', balancaId: 'b', ambiente }).valor.ambiente
    expect(AMBIENTE_VAZIO).toMatchObject({ deltaTPesos: null, aclimatacao: null })
    expect(amb({ deltaTPesos: '0,4' }).deltaTPesos).toBe(0.4)
    expect(amb({ deltaTPesos: -1.2 }).deltaTPesos).toBe(-1.2)
    expect(amb({ deltaTPesos: 31 }).deltaTPesos).toBeNull()
    expect(amb({ deltaTPesos: 0 }).deltaTPesos).toBe(0)
    expect(amb({ aclimatacao: { deltaT0: -6, minutos: 90 } }).aclimatacao).toEqual({ deltaT0: -6, minutos: 90 })
    expect(amb({ aclimatacao: { deltaT0: '5', minutos: '0' } }).aclimatacao).toEqual({ deltaT0: 5, minutos: 0 })
    expect(amb({ aclimatacao: { deltaT0: 5 } }).aclimatacao).toBeNull()
    expect(amb({ aclimatacao: { deltaT0: 50, minutos: 10 } }).aclimatacao).toBeNull()
    expect(amb({ aclimatacao: { deltaT0: 5, minutos: 3000 } }).aclimatacao).toBeNull()
    // Registro antigo
    expect(amb({ temperaturaInicial: 20 })).toMatchObject({ temperaturaInicial: 20, deltaTPesos: null, aclimatacao: null })
  })

  it('padrão: a incerteza da densidade só nos pesos (e nunca negativa)', () => {
    const base = {
      ...PADRAO_VAZIO,
      identificacao: 'JP-E2',
      pesos: [{ id: 'a', marca: '', nominal: 200, correcao: 0, incerteza: 0.1, k: 2 }],
    }
    expect(normalizarPadrao({ ...base, densidade: 7950, incertezaDensidade: '70' }).valor).toMatchObject({
      densidade: 7950,
      incertezaDensidade: 70,
    })
    expect(normalizarPadrao({ ...base, incertezaDensidade: -5 }).valor.incertezaDensidade).toBe(0)
    expect(normalizarPadrao({ ...base }).valor.incertezaDensidade).toBe(0)
    expect(normalizarPadrao({ ...base, tipo: 'BAROMETRO', incertezaDensidade: 70 }).valor.incertezaDensidade).toBe(0)
  })

  it('padrão: densidade dos pesos fora da faixa física (7,95 digitado em g/cm³) não grava', () => {
    const base = {
      ...PADRAO_VAZIO,
      identificacao: 'JP-E2',
      pesos: [{ id: 'a', marca: '', nominal: 200, correcao: 0, incerteza: 0.1, k: 2 }],
    }
    expect(normalizarPadrao({ ...base, densidade: 7.95 }).erros).toEqual([
      'Densidade de 7,95 kg/m³ fora da faixa dos pesos (2 000 a 22 000 kg/m³): confira a unidade (7,95 g/cm³ = 7 950 kg/m³).',
    ])
    expect(normalizarPadrao({ ...base, densidade: 7950 }).erros).toEqual([])
    // Sem densidade (0 = não informada) continua valendo
    expect(normalizarPadrao({ ...base, densidade: 0 }).erros).toEqual([])
  })

  it('padrão gravado antes da conferência (7,85 em g/cm³): a densidade que já estava não impede gravar o resto', () => {
    const antigo = {
      ...PADRAO_VAZIO,
      identificacao: 'JP-M1',
      densidade: 7.85,
      pesos: [{ id: 'a', marca: '', nominal: 20000, correcao: 0, incerteza: 0, k: 2 }],
    }
    expect(normalizarPadrao({ ...antigo, ativo: false }, { densidadeGravada: 7.85 }).erros).toEqual([])
    expect(normalizarPadrao({ ...antigo, ativo: false }, { densidadeGravada: 7.85 }).valor.densidade).toBe(7.85)
    // Mudou para outro valor fora da faixa, ou é um cadastro novo: confere
    expect(normalizarPadrao({ ...antigo, densidade: 7.95 }, { densidadeGravada: 7.85 }).erros).toHaveLength(1)
    expect(normalizarPadrao(antigo).erros).toEqual([
      'Densidade de 7,85 kg/m³ fora da faixa dos pesos (2 000 a 22 000 kg/m³): confira a unidade (7,95 g/cm³ = 7 950 kg/m³).',
    ])
    // Corrigida, ou apagada: grava
    expect(normalizarPadrao({ ...antigo, densidade: 7850 }, { densidadeGravada: 7.85 }).erros).toEqual([])
    expect(normalizarPadrao({ ...antigo, densidade: 0 }, { densidadeGravada: 7.85 }).erros).toEqual([])
  })
})

describe('opções do cálculo da classe I', () => {
  it('na classe I: empuxo pela densidade do ar medida (mantém "ajustada logo antes") e convecção calculada', () => {
    expect(opcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I')).toMatchObject({ empuxo: 'MEDIDO', conveccao: 'CALCULAR' })
    expect(opcoesDaClasse({ ...OPCOES_CALCULO_PADRAO, empuxo: 'AJUSTADO' }, 'I').empuxo).toBe('AJUSTADO')
    expect(opcoesDaClasse({ ...OPCOES_CALCULO_PADRAO, empuxo: 'DELTA_T' }, 'I').empuxo).toBe('MEDIDO')
    expect(opcoesDaClasse({ ...OPCOES_CALCULO_PADRAO, empuxo: 'NENHUM' }, 'I').empuxo).toBe('MEDIDO')
    // O resto fica como estava
    expect(opcoesDaClasse({ ...OPCOES_CALCULO_PADRAO, deriva: 'KD', kD: 1.25 }, 'I')).toMatchObject({ deriva: 'KD', kD: 1.25 })
  })

  it('nas outras classes, as opções como vieram (o mesmo objeto)', () => {
    for (const classe of ['II', 'III', 'IIII', '', null, undefined] as const)
      expect(opcoesDaClasse(OPCOES_CALCULO_PADRAO, classe)).toBe(OPCOES_CALCULO_PADRAO)
  })

  it('"Aplicar": só quando o empuxo ou a convecção diferem dos da classe I', () => {
    expect(faltamOpcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I')).toBe(true)
    expect(faltamOpcoesDaClasse(opcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I'), 'I')).toBe(false)
    expect(faltamOpcoesDaClasse({ ...OPCOES_CALCULO_PADRAO, empuxo: 'AJUSTADO', conveccao: 'CALCULAR' }, 'I')).toBe(false)
    expect(faltamOpcoesDaClasse({ ...OPCOES_CALCULO_PADRAO, empuxo: 'MEDIDO' }, 'I')).toBe(true)
    expect(faltamOpcoesDaClasse(OPCOES_CALCULO_PADRAO, 'III')).toBe(false)
  })
})

describe('requisitos por classe (POP Tabela 2 e 7.4)', () => {
  it('variação de temperatura: 1 °C na classe I, 3 °C na II, 5 °C nas demais; pressão nas classes I e II', () => {
    expect([deltaTMaximo('I'), deltaTMaximo('II'), deltaTMaximo('III'), deltaTMaximo('IIII'), deltaTMaximo('')]).toEqual([
      1, 3, 5, 5, 5,
    ])
    expect(deltaTMaximo(null)).toBe(5)
    expect([pressaoObrigatoria('I'), pressaoObrigatoria('II'), pressaoObrigatoria('III')]).toEqual([true, true, false])
  })

  it('aquecimento: 2 h na classe I (D1), 1 h na II, 20 min nas demais; a folha em branco cita os três', () => {
    const aquecida = (c: Parameters<typeof verificacoesAntesDeCalibrar>[0]) =>
      verificacoesAntesDeCalibrar(c).find((v) => v.chave === 'aquecida')!.texto
    expect(aquecida('I')).toBe('Ligada e aquecida por 2 h ou mais (ou o tempo do fabricante, se maior)')
    expect(aquecida('II')).toBe('Ligada e aquecida por 1 h ou mais (ou o tempo do fabricante, se maior)')
    expect(aquecida('III')).toBe('Ligada e aquecida por 20 min ou mais (ou o tempo do fabricante, se maior)')
    expect(aquecida(null)).toBe('Ligada e aquecida: 20 min, classe II 1 h, classe I 2 h (ou o tempo do fabricante, se maior)')
  })

  it('pré-carga: 3 vezes na classe I (POP 7.6), uma nas demais; a folha em branco cita as duas', () => {
    const preCarga = (c: Parameters<typeof verificacoesAntesDeCalibrar>[0]) =>
      verificacoesAntesDeCalibrar(c).find((v) => v.chave === 'preCarga')!.texto
    expect(preCarga('I')).toBe('Pré-carga aplicada 3 vezes (carga perto de Max)')
    expect(preCarga('II')).toBe('Pré-carga aplicada (carga perto de Max pelo menos uma vez)')
    expect(preCarga('')).toBe('Pré-carga aplicada (carga perto de Max pelo menos uma vez)')
    expect(preCarga(null)).toBe('Pré-carga aplicada (carga perto de Max pelo menos uma vez; classe I: 3 vezes)')
  })

  it('ΔT pesos − ar para começar (D2): 1 °C com E1/E2 ou sem classe; 3 °C só com F1', () => {
    expect(deltaTPesosMaximo(['E2'])).toBe(1)
    expect(deltaTPesosMaximo(['E1', 'F1'])).toBe(1)
    expect(deltaTPesosMaximo(['F1', ''])).toBe(1)
    expect(deltaTPesosMaximo(['F1'])).toBe(3)
    expect(deltaTPesosMaximo(['F1', 'F1'])).toBe(3)
    expect(deltaTPesosMaximo([])).toBe(1)
  })

  it('repetibilidade sugerida: na classe I, 10 leituras com uma peça só entre metade de Max e Max; nas demais, como antes', () => {
    const faixas = [{ max: 220, e: 0.001, d: 0.0001 }]
    expect(repetibilidadesSugeridas({ tipoFaixas: 'UNICA', faixas, classe: 'I' }, 'g')).toEqual([{ carga: 200, leituras: 10 }])
    expect(repetibilidadesSugeridas({ tipoFaixas: 'UNICA', faixas, classe: 'II' }, 'g')).toEqual([{ carga: 110, leituras: 5 }])
    expect(repetibilidadesSugeridas({ tipoFaixas: 'UNICA', faixas }, 'g')).toEqual([{ carga: 110, leituras: 5 }])
  })
})

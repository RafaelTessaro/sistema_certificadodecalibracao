// Sistema alinhado ao POP de calibração e à folha de campo (FOR-CAL-01 rev. 03): a calibração não inclui ajuste nem
// reparo (POP 7.8), a verificação preliminar não é registrada (POP 7), o método da excentricidade é fixo pela classe
// (POP 7.10) e as rodoviárias e ferroviárias ficam fora do cadastro novo (POP 2.1). Os registros de antes continuam
// abrindo, calculando e saindo no certificado como eram.

import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from './calibracao.ts'
import {
  AJUSTES,
  AJUSTES_DA_CALIBRACAO,
  BALANCA_VAZIA,
  calibracaoVazia,
  comMetodoIndicacaoDaClasse,
  LISTA_RECEPTORES,
  LISTA_TIPOS_BALANCA,
  metodoExcentricidadeForaDoPop,
  metodoIndicacaoForaDoPop,
  normalizarBalanca,
  normalizarCalibracao,
  receptoresParaEscolher,
  registroAnterior,
  semRegistroAnterior,
  temCargaSemDescida,
  temLeiturasComoEncontrado,
  temLeiturasDeCarga,
  temLeiturasExcentricidade,
  TIPOS_FORA_DO_POP,
  tiposBalancaParaEscolher,
} from './dominio.ts'
import type { Balanca, CalibracaoInput, EnsaioIndicacao } from './tipos.ts'

const ponto = (id: string, carga: number, crescente: number | null = null) => ({
  id,
  carga,
  pecas: [],
  pecasManuais: false,
  crescente,
  decrescente: null,
  nivelSubstituicao: 0,
})

const ensaio = (pontos: EnsaioIndicacao['pontos'], retornoZero: number | null = null): EnsaioIndicacao => ({
  metodo: 'CRESCENTE_DECRESCENTE',
  pontos,
  retornoZero,
  substituicao: { ativa: false, pecas: [], etapas: [] },
})

/** Calibração gravada por uma versão anterior: ajuste externo com "como encontrado", reparo e pré-carga "não". */
function legado(): CalibracaoInput {
  const k = calibracaoVazia()
  return {
    ...k,
    clienteId: 'c1',
    balancaId: 'b1',
    preliminar: { ...k.preliminar, preCarga: 'NAO' },
    ajuste: { realizado: 'EXTERNO', descricao: 'span com 20 kg' },
    comoEncontrado: ensaio([ponto('a', 0, 0), ponto('b', 10, 10.02), ponto('c', 30, 30.04)], 0),
    indicacao: ensaio([ponto('a', 0, 0), ponto('b', 10, 10), ponto('c', 30, 30)], 0),
    reparo: { houve: true, descricao: 'troca da célula', marcaReparo: 'MR-1', selosRetirados: 'A', selosColocados: 'B' },
  }
}

describe('ajuste: a calibração não inclui ajuste (POP 7.8)', () => {
  it('a etapa oferece só "Não houve ajuste" e o ajuste interno (CAL) antes dos ensaios', () => {
    expect(AJUSTES_DA_CALIBRACAO).toEqual([
      { valor: 'NAO', label: 'Não houve ajuste' },
      { valor: 'INTERNO', label: 'Ajuste interno (CAL) antes dos ensaios' },
    ])
    expect(AJUSTES_DA_CALIBRACAO.map((a) => a.valor)).not.toContain('EXTERNO')
    // O rótulo do externo continua para mostrar os registros de antes
    expect(AJUSTES.EXTERNO).toBe('Ajuste externo, com peso')
  })

  it('a calibração nova nasce sem ajuste, sem "como encontrado", sem reparo e com a verificação preliminar padrão', () => {
    const k = calibracaoVazia()
    expect(k.ajuste).toEqual({ realizado: 'NAO', descricao: '' })
    expect(k.comoEncontrado).toBeNull()
    expect(k.reparo.houve).toBe(false)
    expect(Object.values(k.preliminar)).toEqual(['SIM', 'SIM', 'SIM', 'SIM', 'SIM', 'LIGADO'])
    expect(registroAnterior(k)).toBeNull()
  })

  it('ajuste interno sem leituras "como encontrado" não é registro de antes', () => {
    const k = calibracaoVazia()
    expect(registroAnterior({ ...k, ajuste: { realizado: 'INTERNO', descricao: '' } })).toBeNull()
    // O "como encontrado" vazio que a tela de antes criava ao escolher o ajuste
    const vazio = ensaio([ponto('a', 0), ponto('b', 10)])
    expect(temLeiturasComoEncontrado(vazio)).toBe(false)
    expect(registroAnterior({ ...k, ajuste: { realizado: 'INTERNO', descricao: '' }, comoEncontrado: vazio })).toBeNull()
    expect(temLeiturasComoEncontrado(ensaio([ponto('a', 0)], 0))).toBe(true)
    expect(temLeiturasComoEncontrado(null)).toBe(false)
  })
})

describe('registro de antes do POP (legado)', () => {
  it('reconhece o ajuste externo, o "como encontrado", o reparo e a verificação preliminar "não"', () => {
    expect(registroAnterior(legado())).toEqual({
      ajusteExterno: true,
      comoEncontrado: true,
      reparo: true,
      preliminar: ['pré-carga aplicada'],
    })
    // "N/A" não sai no certificado: não conta
    const k = calibracaoVazia()
    expect(registroAnterior({ ...k, preliminar: { ...k.preliminar, nivelada: 'NA' } })).toBeNull()
    // Classe I de antes: ajuste interno com "como encontrado" medido
    expect(
      registroAnterior({ ...k, ajuste: { realizado: 'INTERNO', descricao: '' }, comoEncontrado: legado().comoEncontrado }),
    ).toMatchObject({ ajusteExterno: false, comoEncontrado: true })
  })

  it('o registro de antes continua abrindo e gravando igual (o servidor não apaga nada)', () => {
    const antes = legado()
    const { valor, erros } = normalizarCalibracao(antes)
    expect(erros).toEqual([])
    expect(valor.ajuste).toEqual(antes.ajuste)
    expect(valor.comoEncontrado).toEqual(antes.comoEncontrado)
    expect(valor.reparo).toEqual(antes.reparo)
    expect(valor.preliminar).toEqual(antes.preliminar)
    // E calcula como antes: o "como encontrado" entra
    const balanca = { ...BALANCA_VAZIA, faixas: [{ max: 30, e: 0.01, d: 0.01 }] } as Balanca
    const calc = calcularCalibracao(valor, balanca, [])
    expect(calc.comoEncontrado?.pontos.map((p) => p.crescente?.erro)).toEqual([0, 0.02, 0.04])
  })

  it('"Tirar do registro" deixa a calibração como uma nova (o ajuste interno continua)', () => {
    const limpo = semRegistroAnterior(legado())
    expect(registroAnterior(limpo)).toBeNull()
    expect(limpo.ajuste).toEqual({ realizado: 'NAO', descricao: '' })
    expect(limpo.comoEncontrado).toBeNull()
    expect(limpo.reparo.houve).toBe(false)
    expect(limpo.preliminar.preCarga).toBe('SIM')
    // As leituras do ensaio final ficam
    expect(limpo.indicacao).toEqual(legado().indicacao)
    const interno = semRegistroAnterior({ ...legado(), ajuste: { realizado: 'INTERNO', descricao: 'CAL' } })
    expect(interno.ajuste).toEqual({ realizado: 'INTERNO', descricao: 'CAL' })
    expect(interno.comoEncontrado).toBeNull()
  })
})

describe('excentricidade: método fixo pela classe (POP 7.10)', () => {
  it('1 nas classes II, III, IIII e sem classe; 3 na classe I', () => {
    expect(calibracaoVazia(undefined, 'III').excentricidade.metodo).toBe(1)
    expect(calibracaoVazia(undefined, 'I').excentricidade.metodo).toBe(3)
    for (const classe of ['II', 'III', 'IIII', ''] as const) {
      expect(metodoExcentricidadeForaDoPop(1, classe)).toBe(false)
      for (const m of [2, 3, 4] as const) expect(metodoExcentricidadeForaDoPop(m, classe)).toBe(true)
    }
    expect(metodoExcentricidadeForaDoPop(3, 'I')).toBe(false)
    expect(metodoExcentricidadeForaDoPop(1, 'I')).toBe(true)
  })

  it('leituras do ensaio: da posição ou do zero antes', () => {
    const p = (leitura: number | null, referencia: number | null) => ({ rotulo: 'x', leitura, referencia })
    expect(temLeiturasExcentricidade({ posicoes: [] })).toBe(false)
    expect(temLeiturasExcentricidade({ posicoes: [p(null, null), p(null, null)] })).toBe(false)
    expect(temLeiturasExcentricidade({ posicoes: [p(null, 0)] })).toBe(true)
    expect(temLeiturasExcentricidade({ posicoes: [p(10, null)] })).toBe(true)
  })
})

describe('erro de indicação: método fixo pela classe (POP 7.7)', () => {
  it('"crescente e decrescente" nas classes II, III, IIII e sem classe; "crescente com descarga" na classe I', () => {
    expect(calibracaoVazia(undefined, 'III').indicacao.metodo).toBe('CRESCENTE_DECRESCENTE')
    expect(calibracaoVazia(undefined, 'I').indicacao.metodo).toBe('DESCONTINUO')
    for (const classe of ['II', 'III', 'IIII', ''] as const) {
      expect(metodoIndicacaoForaDoPop('CRESCENTE_DECRESCENTE', classe)).toBe(false)
      for (const m of ['DESCONTINUO', 'CONTINUO', 'DECRESCENTE'] as const) expect(metodoIndicacaoForaDoPop(m, classe)).toBe(true)
    }
    expect(metodoIndicacaoForaDoPop('DESCONTINUO', 'I')).toBe(false)
    expect(metodoIndicacaoForaDoPop('CRESCENTE_DECRESCENTE', 'I')).toBe(true)
  })

  it('leituras de carga: a subida ou a descida de um ponto com carga, ou uma etapa de substituição; o zero não conta', () => {
    const vazio = ensaio([ponto('z', 0, 0), ponto('a', 10), ponto('b', 30)], 0)
    expect(temLeiturasDeCarga(vazio)).toBe(false)
    expect(temLeiturasDeCarga(ensaio([ponto('z', 0, 0), ponto('a', 10, 10)]))).toBe(true)
    expect(temLeiturasDeCarga(ensaio([ponto('z', 0, 0), { ...ponto('a', 10), decrescente: 10 }]))).toBe(true)
    const etapa = {
      ...vazio,
      substituicao: { ativa: true, pecas: [], etapas: [{ leituraPadroes: null, leituraSubstituicao: 5 }] },
    }
    expect(temLeiturasDeCarga(etapa)).toBe(true)
  })

  it('sem leituras de carga, o ensaio segue a classe (também a classe trocada); com leituras, fica como foi medido', () => {
    const continuo = { ...ensaio([ponto('z', 0, 0), ponto('a', 10)]), metodo: 'CONTINUO' as const }
    expect(comMetodoIndicacaoDaClasse(continuo, 'III').metodo).toBe('CRESCENTE_DECRESCENTE')
    expect(comMetodoIndicacaoDaClasse(continuo, 'I').metodo).toBe('DESCONTINUO')
    const doPop = ensaio([ponto('z', 0, 0), ponto('a', 10)])
    expect(comMetodoIndicacaoDaClasse(doPop, 'III')).toBe(doPop)
    const medido = { ...ensaio([ponto('z', 0, 0), ponto('a', 10, 10)]), metodo: 'CONTINUO' as const }
    expect(comMetodoIndicacaoDaClasse(medido, 'III')).toBe(medido)
  })

  it('o método medido de um ensaio trocado depois das leituras é gravado; inválido ou igual ao método, não', () => {
    const k = (indicacao: object) =>
      normalizarCalibracao({ ...calibracaoVazia(), clienteId: 'c1', balancaId: 'b1', indicacao }).valor.indicacao
    const base = ensaio([ponto('z', 0, 0), ponto('a', 10, 10)])
    expect(k({ ...base, metodoMedido: 'CONTINUO' }).metodoMedido).toBe('CONTINUO')
    expect(k({ ...base, metodoMedido: 'CRESCENTE_DECRESCENTE' })).not.toHaveProperty('metodoMedido')
    expect(k({ ...base, metodoMedido: 'QUALQUER' })).not.toHaveProperty('metodoMedido')
    expect(k(base)).not.toHaveProperty('metodoMedido')
  })

  it('"crescente e decrescente" com carga sem a descida: a maior carga lida, o zero e a substituição não contam', () => {
    const desce = (p: ReturnType<typeof ponto>, v: number | null = p.carga) => ({ ...p, decrescente: v })
    const completo = ensaio([desce(ponto('z', 0, 0)), desce(ponto('a', 10, 10)), ponto('b', 30, 30)])
    expect(temCargaSemDescida(completo)).toBe(false)
    const falta = ensaio([ponto('z', 0, 0), ponto('a', 10, 10), ponto('b', 30, 30)])
    expect(temCargaSemDescida(falta)).toBe(true)
    // Sem leitura ainda, outro método ou com substituição: nada falta
    expect(temCargaSemDescida(ensaio([ponto('z', 0, 0), ponto('a', 10), ponto('b', 30)]))).toBe(false)
    expect(temCargaSemDescida({ ...falta, metodo: 'CONTINUO' })).toBe(false)
    expect(temCargaSemDescida({ ...falta, substituicao: { ativa: true, pecas: [], etapas: [] } })).toBe(false)
    expect(temCargaSemDescida(null)).toBe(false)
  })
})

describe('rodoviárias e ferroviárias fora do cadastro novo (POP 2.1)', () => {
  it('o cadastro novo não oferece rodoviária nem ferroviária (nem o receptor de carga rolante)', () => {
    expect(TIPOS_FORA_DO_POP).toEqual(['RODOVIARIA', 'FERROVIARIA'])
    const novos = tiposBalancaParaEscolher()
    expect(novos).not.toContain('RODOVIARIA')
    expect(novos).not.toContain('FERROVIARIA')
    expect(novos).toEqual(LISTA_TIPOS_BALANCA.filter((t) => t !== 'RODOVIARIA' && t !== 'FERROVIARIA'))
    expect(receptoresParaEscolher()).toEqual(LISTA_RECEPTORES.filter((r) => r !== 'RODOVIARIA'))
  })

  it('a balança já cadastrada continua com o tipo e o receptor dela', () => {
    expect(tiposBalancaParaEscolher('RODOVIARIA')).toContain('RODOVIARIA')
    expect(tiposBalancaParaEscolher('RODOVIARIA')).not.toContain('FERROVIARIA')
    expect(tiposBalancaParaEscolher('FERROVIARIA')).toContain('FERROVIARIA')
    expect(receptoresParaEscolher('RODOVIARIA')).toContain('RODOVIARIA')
    // E o servidor continua gravando o cadastro (a edição de uma rodoviária existente)
    const { valor, erros } = normalizarBalanca({
      ...BALANCA_VAZIA,
      clienteId: 'c1',
      tipo: 'RODOVIARIA',
      receptor: 'RODOVIARIA',
      apoios: 8,
      faixas: [{ max: 80000, e: 20, d: 20 }],
    })
    expect(erros).toEqual([])
    expect([valor.tipo, valor.receptor]).toEqual(['RODOVIARIA', 'RODOVIARIA'])
  })
})

import { describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, capacidadeTexto, normalizarBalanca } from '#shared/dominio.ts'
import type { Balanca } from '#shared/tipos.ts'
import {
  comUnidade,
  comUnidadeColuna,
  comUnidadesSugeridas,
  espelho,
  formularioInicial,
  paraEntrada,
  textoDe,
  type FormBalanca,
} from './balancaFormulario'

/** Formulário novo com as faixas digitadas (texto, como na tela). */
function digitado(faixas: Array<[string, string, string]>, extra: Partial<FormBalanca> = {}): FormBalanca {
  const f = formularioInicial(undefined, 'c1')
  return {
    ...f,
    tipoFaixas: faixas.length > 1 ? 'MULTI_INTERVALO' : 'UNICA',
    faixas: faixas.map(([max, e, d], i) => ({ chave: i + 1, max, e, d })),
    ...extra,
  }
}

const balanca = (b: Partial<Balanca>): Balanca => ({
  ...BALANCA_VAZIA,
  id: 'b1',
  versao: 1,
  clienteId: 'c1',
  criadoEm: '',
  atualizadoEm: '',
  ...b,
})

describe('formulário da balança: unidades de cada coluna', () => {
  it('cadastro novo em kg: Max em kg, e e d em g', () => {
    const f = formularioInicial(undefined, 'c1')
    expect(f.unidade).toBe('kg')
    expect(f.un).toEqual({ max: 'kg', e: 'g', d: 'g', min: 'g' })
  })

  it('6/15/33 kg com e = d = 2/5/10 g é gravado na unidade da indicação (kg)', () => {
    const f = digitado(
      [
        ['6', '2', '2'],
        ['15', '5', '5'],
        ['33', '10', '10'],
      ],
      { min: '40' },
    )
    const entrada = paraEntrada(f)
    expect(entrada.unidade).toBe('kg')
    expect(entrada.faixas).toEqual([
      { max: 6, e: 0.002, d: 0.002 },
      { max: 15, e: 0.005, d: 0.005 },
      { max: 33, e: 0.01, d: 0.01 },
    ])
    expect(entrada.min).toBe(0.04)
    const { valor, erros } = normalizarBalanca(entrada)
    expect(erros).toEqual([])
    expect(capacidadeTexto(valor)).toBe('6/15/33 kg × 2/5/10 g')
  })

  it('e ou d em branco copia o outro, já convertido', () => {
    const f = digitado([['30', '', '5']])
    expect(paraEntrada(f).faixas).toEqual([{ max: 30, e: 0.005, d: 0.005 }])
    expect(espelho(f, f.faixas[0], 'e')).toBe('5')
    // Com e em kg, a dica do campo e mostra o d convertido
    const emKg = comUnidadeColuna(f, 'e', 'kg')
    expect(espelho(emKg, emKg.faixas[0], 'e')).toBe('0,005')
    expect(espelho(f, { chave: 9, max: '', e: '', d: '' }, 'd')).toBe('= e')
  })

  it('abre o cadastro gravado com cada coluna na unidade legível', () => {
    const f = formularioInicial(
      balanca({
        unidade: 'kg',
        tipoFaixas: 'MULTI_INTERVALO',
        faixas: [
          { max: 6, e: 0.002, d: 0.002 },
          { max: 15, e: 0.005, d: 0.005 },
          { max: 33, e: 0.01, d: 0.01 },
        ],
        min: 0.04,
      }),
    )
    expect(f.un).toEqual({ max: 'kg', e: 'g', d: 'g', min: 'g' })
    expect(f.faixas.map((x) => [x.max, x.e, x.d])).toEqual([
      ['6', '2', '2'],
      ['15', '5', '5'],
      ['33', '10', '10'],
    ])
    expect(f.min).toBe('40')
    // Abrir e salvar sem mexer não muda nada
    expect(paraEntrada(f).faixas).toEqual([
      { max: 6, e: 0.002, d: 0.002 },
      { max: 15, e: 0.005, d: 0.005 },
      { max: 33, e: 0.01, d: 0.01 },
    ])
    expect(paraEntrada(f).min).toBe(0.04)
  })

  it('rodoviária em kg: e e d continuam em kg', () => {
    const f = formularioInicial(balanca({ unidade: 'kg', faixas: [{ max: 80000, e: 20, d: 20 }], min: 400 }))
    expect(f.un).toEqual({ max: 'kg', e: 'kg', d: 'kg', min: 'kg' })
    expect(f.faixas[0]).toMatchObject({ max: '80000', e: '20', d: '20' })
  })

  it('trocar a unidade de uma coluna converte o que já foi digitado', () => {
    let f = digitado([['6000', '2', '2']], { unidade: 'g', un: { max: 'g', e: 'g', d: 'g', min: 'g' } })
    f = comUnidadeColuna(f, 'max', 'kg')
    expect(f.un.max).toBe('kg')
    expect(f.faixas[0].max).toBe('6')
    expect(paraEntrada(f).faixas[0]).toEqual({ max: 6000, e: 2, d: 2 })
    // Texto inválido fica como está
    const g = comUnidadeColuna(digitado([['abc', '', '']]), 'max', 'g')
    expect(g.faixas[0].max).toBe('abc')
  })

  it('trocar a unidade da indicação não muda a capacidade física', () => {
    // A balança 6/15/33 kg cadastrada em g (6000/15000/33000 g), corrigida para kg
    const emG = formularioInicial(
      balanca({
        unidade: 'g',
        tipoFaixas: 'MULTI_INTERVALO',
        faixas: [
          { max: 6000, e: 2, d: 2 },
          { max: 15000, e: 5, d: 5 },
          { max: 33000, e: 10, d: 10 },
        ],
        min: 40,
      }),
    )
    expect(emG.faixas[0].max).toBe('6000')
    const emKg = comUnidade(emG, 'kg')
    // O Max acompanha a indicação (6000 g → 6 kg); e, d e Min continuam em g
    expect(emKg.un).toEqual({ max: 'kg', e: 'g', d: 'g', min: 'g' })
    expect(emKg.faixas.map((x) => x.max)).toEqual(['6', '15', '33'])
    expect(emKg.faixas.map((x) => x.e)).toEqual(['2', '5', '10'])
    const entrada = paraEntrada(emKg)
    expect(entrada.faixas).toEqual([
      { max: 6, e: 0.002, d: 0.002 },
      { max: 15, e: 0.005, d: 0.005 },
      { max: 33, e: 0.01, d: 0.01 },
    ])
    expect(entrada.min).toBe(0.04)
    expect(capacidadeTexto(entrada)).toBe('6/15/33 kg × 2/5/10 g')
  })

  it('com o Max em outra unidade, trocar a indicação só converte o que é gravado', () => {
    let f = digitado([['80', '20', '20']], { un: { max: 't', e: 'kg', d: 'kg', min: 'kg' } })
    expect(paraEntrada(f).faixas[0]).toEqual({ max: 80000, e: 20, d: 20 })
    f = comUnidade(f, 't')
    expect(f.un.max).toBe('t')
    expect(f.faixas[0]).toMatchObject({ max: '80', e: '20', d: '20' })
    expect(paraEntrada(f).faixas[0]).toEqual({ max: 80, e: 0.02, d: 0.02 })
  })

  it('cadastro ainda vazio: colunas vazias seguem a unidade usual da nova indicação', () => {
    const f = comUnidade(formularioInicial(undefined, 'c1'), 'g')
    expect(f.un).toEqual({ max: 'g', e: 'g', d: 'g', min: 'g' })
    const t = comUnidade(formularioInicial(undefined, 'c1'), 't')
    expect(t.un).toEqual({ max: 't', e: 'kg', d: 'kg', min: 'kg' })
  })

  it('rodoviária 80 t × 20 kg digitada como na plaqueta: e, d e Min em kg', () => {
    // Como na tela: escolhe o tipo e digita Max, e, d e Min (cada mudança passa pelas sugestões)
    let f = comUnidadesSugeridas({ ...formularioInicial(undefined, 'c1'), tipo: 'RODOVIARIA' })
    expect(f.un).toEqual({ max: 'kg', e: 'kg', d: 'kg', min: 'kg' })
    f = comUnidadesSugeridas({ ...f, faixas: [{ chave: 1, max: '80000', e: '20', d: '20' }] })
    f = { ...f, min: '400' }
    const entrada = paraEntrada(f)
    expect(entrada.faixas).toEqual([{ max: 80000, e: 20, d: 20 }])
    expect(entrada.min).toBe(400)
    const { valor, erros } = normalizarBalanca(entrada)
    expect(erros).toEqual([])
    expect(capacidadeTexto(valor).replace(/\s/g, ' ')).toBe('80 000 kg × 20 kg')
  })

  it('qualquer tipo com Max de 1 t ou mais: e e d vazios passam para kg; o Min segue a ordem de 20 e', () => {
    let f = formularioInicial(undefined, 'c1')
    expect(f.tipo).toBe('PLATAFORMA')
    f = comUnidadesSugeridas({ ...f, faixas: [{ chave: 1, max: '80000', e: '', d: '' }] })
    expect(f.un).toEqual({ max: 'kg', e: 'kg', d: 'kg', min: 'kg' })
    // Balança pequena: e em g e o Min (20 × 5 g = 100 g) também
    const g = comUnidadesSugeridas({ ...formularioInicial(undefined, 'c1'), faixas: [{ chave: 1, max: '30', e: '5', d: '' }] })
    expect(g.un).toEqual({ max: 'kg', e: 'g', d: 'g', min: 'g' })
    // 300 kg × 50 g: o Min usual (1 kg) já vem em kg
    const p = comUnidadesSugeridas({ ...formularioInicial(undefined, 'c1'), faixas: [{ chave: 1, max: '300', e: '50', d: '' }] })
    expect(p.un).toEqual({ max: 'kg', e: 'g', d: 'g', min: 'kg' })
  })

  it('balcão com o Max digitado em g por hábito (6000/15000/33000 com a coluna em kg): e e d não passam para kg', () => {
    let f = comUnidadesSugeridas({ ...formularioInicial(undefined, 'c1'), tipo: 'BALCAO' })
    f = comUnidadesSugeridas({
      ...f,
      tipoFaixas: 'MULTI_INTERVALO',
      faixas: [
        { chave: 1, max: '6000', e: '', d: '' },
        { chave: 2, max: '15000', e: '', d: '' },
        { chave: 3, max: '33000', e: '', d: '' },
      ],
    })
    expect(f.un).toMatchObject({ max: 'kg', e: 'g', d: 'g' })
    // Com e = 2/5/10 g, n fica absurdo: não grava (e o aviso do Max aparece na tela)
    f = { ...f, faixas: f.faixas.map((x, i) => ({ ...x, e: ['2', '5', '10'][i] })) }
    const { erros } = normalizarBalanca({ ...paraEntrada(f), classe: 'III' })
    expect(erros.some((e) => e.includes('(e)') && e.includes('Confira a unidade'))).toBe(true)
    // Digitado como na plaqueta (6/15/33 kg × 2/5/10 g): grava, e sai igual
    const certo = comUnidadesSugeridas({
      ...f,
      faixas: [
        { chave: 1, max: '6', e: '2', d: '' },
        { chave: 2, max: '15', e: '5', d: '' },
        { chave: 3, max: '33', e: '10', d: '' },
      ],
    })
    const r = normalizarBalanca({ ...paraEntrada(certo), classe: 'III' })
    expect(r.erros).toEqual([])
    expect(capacidadeTexto(r.valor)).toBe('6/15/33 kg × 2/5/10 g')
  })

  it('a unidade escolhida pela pessoa não muda sozinha', () => {
    let f = comUnidadeColuna(formularioInicial(undefined, 'c1'), 'e', 'g')
    f = comUnidadesSugeridas({ ...f, faixas: [{ chave: 1, max: '80000', e: '', d: '' }] })
    expect(f.un.e).toBe('g')
    expect(f.un.d).toBe('kg')
  })

  it('e digitado na unidade errada não grava: n absurdo e Min menor que e', () => {
    // Rodoviária com e e d ainda em g: 20 g dá n = 4 000 000
    const f = digitado([['80000', '20', '20']], { min: '400', un: { max: 'kg', e: 'g', d: 'g', min: 'g' } })
    const { erros } = normalizarBalanca(paraEntrada(f))
    expect(erros.some((e) => e.includes('(e)') && e.includes('Confira a unidade'))).toBe(true)
    // e certo e o Min em g (400 g < 20 kg)
    const g = digitado([['80000', '20', '20']], { min: '400', un: { max: 'kg', e: 'kg', d: 'kg', min: 'g' } })
    expect(normalizarBalanca(paraEntrada(g)).erros).toEqual([
      'A carga mínima (Min) é menor que a divisão e. Confira a unidade do Min (g ou kg).',
    ])
  })

  it('textoDe: vírgula, sem milhar e sem ruído', () => {
    expect(textoDe(0.1 + 0.2)).toBe('0,3')
    expect(textoDe(15000)).toBe('15000')
    expect(textoDe(0)).toBe('')
  })
})

describe('formulário da balança: indicador e plataforma', () => {
  it('cadastro novo começa com a plataforma vazia', () => {
    const f = formularioInicial(undefined, 'c1')
    expect(f).toMatchObject({ plataformaFabricante: '', plataformaModelo: '', plataformaSerie: '' })
  })

  it('uma cópia no formato antigo abre já com o indicador na identificação', () => {
    const antiga = {
      ...balanca({ fabricante: 'Toledo', modelo: '2180', numeroSerie: 'P-1', faixas: [{ max: 300, e: 0.05, d: 0.05 }] }),
      indicadorFabricante: 'Toledo',
      indicadorModelo: '9091',
      indicadorSerie: 'I-1',
    }
    const f = formularioInicial(antiga)
    expect(f).toMatchObject({ modelo: '9091', numeroSerie: 'I-1', plataformaModelo: '2180', plataformaSerie: 'P-1' })
    expect(paraEntrada(f)).not.toHaveProperty('indicadorSerie')
  })
})

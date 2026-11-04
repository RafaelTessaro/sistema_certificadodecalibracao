// Cadastro do jogo de pesos: os avisos das peças (não impedem gravar). No jogo pelo valor do certificado, a peça sem
// U entra pelo valor nominal e a correção do certificado dela é ignorada (`pecaParaCalculo`): o formulário avisa.

import { describe, expect, it } from 'vitest'
import { avisosDasPecas, conferirPeca, type PesoTexto } from './pecasPadrao'

const peca = (marca: string, nominal: string, correcao: string, incerteza: string): PesoTexto => ({
  id: marca || nominal,
  marca,
  nominal,
  unidade: 'g',
  correcao,
  incerteza,
  k: '2',
})

describe('avisos das peças do jogo', () => {
  it('pelo valor do certificado, a peça sem U: o campo em atenção e o aviso', () => {
    const pesos = [peca('', '100', '-0,12', ''), peca('', '50', '0,02', '0,03')]
    const conferencias = pesos.map((p) => conferirPeca(p, 'E2', 'CERTIFICADO'))
    expect(conferencias.map((c) => c.semU)).toEqual([true, false])
    expect(avisosDasPecas(pesos, conferencias, 'E2')).toEqual([
      '100 g: sem a U, entra pelo valor nominal e a correção do certificado é ignorada.',
    ])
  })

  it('várias sem U: uma linha só; pelo nominal, nenhum aviso', () => {
    const pesos = ['20', '10', '5', '2'].map((g) => peca('', g, '', ''))
    const certificado = pesos.map((p) => conferirPeca(p, 'F1', 'CERTIFICADO'))
    expect(avisosDasPecas(pesos.slice(0, 2), certificado.slice(0, 2), 'F1')).toEqual([
      '20 g e 10 g: sem a U, entram pelo valor nominal e a correção do certificado é ignorada.',
    ])
    expect(avisosDasPecas(pesos, certificado, 'F1')).toEqual([
      '4 peças: sem a U, entram pelo valor nominal e a correção do certificado é ignorada.',
    ])
    const nominal = pesos.map((p) => conferirPeca(p, 'F1', 'NOMINAL'))
    expect(nominal.some((c) => c.semU)).toBe(false)
    expect(avisosDasPecas(pesos, nominal, 'F1')).toEqual([])
  })

  it('a peça ainda sem nominal não acusa; os avisos da classe continuam', () => {
    const pesos = [peca('', '', '', ''), peca('P1', '100', '0,5', '0,2')]
    const conferencias = pesos.map((p) => conferirPeca(p, 'E2', 'CERTIFICADO'))
    expect(conferencias[0].semU).toBe(false)
    expect(avisosDasPecas(pesos, conferencias, 'E2')).toEqual([
      'P1: a incerteza (U = 0,2 mg) passa de 1/3 do EMA da classe (0,053 mg).',
      'P1: a correção (0,5 mg) passa do limite da classe E2 (EMA − U = -0,04 mg). A peça pode estar fora da classe.',
    ])
  })
})

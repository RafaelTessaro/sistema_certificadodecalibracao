import { describe, expect, it } from 'vitest'
import { cargaDasPecas } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, EnsaioIndicacao, Padrao } from '#shared/tipos.ts'
import { montagemDoPonto, pecasPara, recomporEnsaio } from './cargas'

const pesos: Padrao = {
  ...PADRAO_VAZIO,
  id: 'jp',
  versao: 1,
  identificacao: 'PP500',
  descricao: 'Pesos de 500 kg',
  criadoEm: '',
  atualizadoEm: '',
  pesos: Array.from({ length: 20 }, (_, i) => ({
    id: `w${i}`,
    marca: String(i + 1),
    nominal: 500_000,
    correcao: 0,
    incerteza: 8000,
    k: 2,
  })),
}
const balanca: Balanca = {
  ...BALANCA_VAZIA,
  id: 'b',
  versao: 1,
  tipo: 'RODOVIARIA',
  faixas: [{ max: 80_000, e: 20, d: 20 }],
  criadoEm: '',
  atualizadoEm: '',
}
const etapa = pesos.pesos.map((p) => ({ padraoId: 'jp', pesoId: p.id, quantidade: 1 }))
const ponto = (id: string, carga: number, nivel: number) => ({
  id,
  carga,
  pecas: [],
  pecasManuais: false,
  crescente: null,
  decrescente: null,
  nivelSubstituicao: nivel,
})

describe('montagem automática dos pontos com substituição (editor)', () => {
  const ensaio: EnsaioIndicacao = {
    metodo: 'CONTINUO',
    retornoZero: null,
    substituicao: { ativa: true, pecas: etapa, etapas: [{ leituraPadroes: null, leituraSubstituicao: null }] },
    pontos: [ponto('a', 5000, 0), ponto('b', 15_000, 1), ponto('c', 15_000, 2)],
  }

  it('as peças por cima completam só o resto: a carga do cálculo (nível × etapa + pesos) é a do ponto', () => {
    const r = recomporEnsaio(ensaio, balanca, [pesos])
    expect(r.pontos.map((p) => cargaDasPecas(p.pecas, [pesos], 'kg'))).toEqual([5000, 5000, 0])
    expect(montagemDoPonto(r.pontos[1], r, balanca, [pesos]).diferenca).toBe(0)
    // 2 etapas de 10 t num ponto de 15 t: passa 5 t (a tela avisa)
    expect(montagemDoPonto(r.pontos[2], r, balanca, [pesos]).diferenca).toBe(5000)
  })

  it('sem substituição (desligada), os pesos fazem a carga inteira', () => {
    const r = recomporEnsaio({ ...ensaio, substituicao: { ...ensaio.substituicao, ativa: false } }, balanca, [pesos])
    expect(r.pontos.map((p) => cargaDasPecas(p.pecas, [pesos], 'kg'))).toEqual([5000, 10_000, 10_000])
  })
})

describe('jogo desmarcado (ou peça tirada do cadastro): os pontos à mão com peças dele voltam a ser automáticos', () => {
  const jogo = (id: string, nominais: number[], classe: Padrao['classe'] = 'M1'): Padrao => ({
    ...PADRAO_VAZIO,
    id,
    versao: 1,
    identificacao: id.toUpperCase(),
    classe,
    criadoEm: '',
    atualizadoEm: '',
    pesos: nominais.map((g, i) => ({ id: `${id}${i}`, marca: '', nominal: g, correcao: 0, incerteza: g * 0.016, k: 2 })),
  })
  const A = jogo('a', [10_000, 10_000, 10_000])
  const B = jogo('b', [20_000, 10_000])
  const prix: Balanca = { ...balanca, tipo: 'BALCAO', classe: 'III', faixas: [{ max: 30, e: 0.01, d: 0.01 }] }
  const ensaio: EnsaioIndicacao = {
    metodo: 'CRESCENTE_DECRESCENTE',
    retornoZero: null,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos: [
      { ...ponto('p10', 10, 0), pecas: [{ padraoId: 'a', pesoId: 'a0', quantidade: 1 }], pecasManuais: true },
      {
        ...ponto('p30', 30, 0),
        pecas: [
          { padraoId: 'b', pesoId: 'b0', quantidade: 1 },
          { padraoId: 'b', pesoId: 'b1', quantidade: 1 },
        ],
        pecasManuais: true,
      },
    ],
  }

  it('só o ponto com peças do jogo que saiu é refeito; o outro fica como foi escolhido', () => {
    const r = recomporEnsaio(ensaio, prix, [B])
    expect(r.pontos[0]).toMatchObject({ pecasManuais: false, pecas: [{ padraoId: 'b', pesoId: 'b1', quantidade: 1 }] })
    expect(r.pontos[1]).toBe(ensaio.pontos[1])
    // Com os dois jogos, nada muda
    expect(recomporEnsaio(ensaio, prix, [A, B])).toBe(ensaio)
  })

  it('peça tirada do cadastro do jogo: o ponto é refeito com as que sobraram', () => {
    const semUma = { ...B, pesos: B.pesos.filter((w) => w.id !== 'b1') }
    const r = recomporEnsaio(ensaio, prix, [A, semUma])
    expect(r.pontos[1].pecasManuais).toBe(false)
    expect(cargaDasPecas(r.pontos[1].pecas, [A, semUma], 'kg')).toBe(30)
  })

  it('a montagem automática segue a classe dos pesos (classe II: sem a peça M1 de 2 kg)', () => {
    const marte: Balanca = { ...prix, unidade: 'g', classe: 'II', faixas: [{ max: 3200, e: 0.1, d: 0.01 }] }
    const finos = [1000, 500, 200, 200, 100]
    const padroes = [jogo('m1', [2000, 1000]), jogo('f1', finos, 'F1'), jogo('e2', finos, 'E2')]
    expect(new Set(pecasPara(2000, marte, padroes).pecas.map((x) => x.padraoId))).toEqual(new Set(['e2', 'f1']))
  })
})

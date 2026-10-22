import { describe, expect, it } from 'vitest'
import { cargaDasPecas, descreverPecas } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, calibracaoVazia, PADRAO_VAZIO } from '#shared/dominio.ts'
import { planoDaFolha } from '#shared/folhaCampo.ts'
import type { Balanca, CalibracaoInput, EnsaioIndicacao, Padrao } from '#shared/tipos.ts'
import { montagemDoEnsaio, recomporCargas, recomporEnsaio } from './cargas'

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
    const m = montagemDoEnsaio(r, balanca, [pesos])
    expect(m[1].diferenca).toBe(0)
    // 2 etapas de 10 t num ponto de 15 t: passa 5 t (a tela avisa)
    expect(m[2].diferenca).toBe(5000)
  })

  it('sem substituição (desligada), os pesos fazem a carga inteira', () => {
    const r = recomporEnsaio({ ...ensaio, substituicao: { ...ensaio.substituicao, ativa: false } }, balanca, [pesos])
    expect(r.pontos.map((p) => cargaDasPecas(p.pecas, [pesos], 'kg'))).toEqual([5000, 10_000, 10_000])
  })
})

describe('cargas acumuladas no editor (métodos sem descarga), iguais às da folha de campo', () => {
  const jogo: Padrao = {
    ...PADRAO_VAZIO,
    id: 'pp',
    versao: 1,
    identificacao: 'PP',
    descricao: '',
    criadoEm: '',
    atualizadoEm: '',
    pesos: [20, 20, 20, 20, 20, 10].map((kg, i) => ({ id: `w${i}`, marca: '', nominal: kg * 1000, correcao: 0, incerteza: 0, k: 2 })),
  }
  const plataforma: Balanca = { ...balanca, tipo: 'PLATAFORMA', receptor: 'RETANGULAR', faixas: [{ max: 100, e: 0.02, d: 0.02 }] }
  const calibracao = (metodo: EnsaioIndicacao['metodo']): CalibracaoInput => ({
    ...calibracaoVazia(),
    padroesIds: ['pp'],
    indicacao: {
      metodo,
      retornoZero: null,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: [ponto('a', 0, 0), ponto('b', 50, 0), ponto('c', 100, 0)],
    },
  })

  it('"Crescente e decrescente": 100 kg não sai de 50 kg (2 × 20 kg + 10 kg) mais peças; o editor e a folha marcam igual', () => {
    const k = recomporCargas(calibracao('CRESCENTE_DECRESCENTE'), plataforma, [jogo])
    expect(k.indicacao.pontos.map((p) => descreverPecas(p.pecas, [jogo]))).toEqual(['', '2 × 20 kg + 10 kg', '5 × 20 kg'])
    expect(montagemDoEnsaio(k.indicacao, plataforma, [jogo]).map((p) => p.foraDaSequencia)).toEqual([false, false, true])
    const plano = planoDaFolha(k, plataforma, [jogo], '2026-10-22')
    expect(plano.pontos.map((p) => p.pesos)).toEqual(['', '2 × 20 kg + 10 kg', '5 × 20 kg'])
    expect(plano.pontos.map((p) => !!p.foraDaSequencia)).toEqual([false, false, true])
    expect(plano.avisos.some((a) => a.includes('não montam assim a carga de 100 kg'))).toBe(true)
  })

  it('"Crescente com descarga": cada ponto à parte, sem marca', () => {
    const k = recomporCargas(calibracao('DESCONTINUO'), plataforma, [jogo])
    expect(montagemDoEnsaio(k.indicacao, plataforma, [jogo]).some((p) => p.foraDaSequencia)).toBe(false)
  })

  it('o "como encontrado" sem descarga faz o ensaio final (com descarga) acumular também: a folha tem uma lista de peças só', () => {
    const base = calibracao('DESCONTINUO')
    const k: CalibracaoInput = {
      ...base,
      ajuste: { realizado: 'INTERNO', descricao: '' },
      comoEncontrado: { ...base.indicacao, metodo: 'CONTINUO' },
    }
    const r = recomporCargas(k, plataforma, [jogo])
    expect(r.indicacao.pontos.map((p) => p.pecas)).toEqual(r.comoEncontrado!.pontos.map((p) => p.pecas))
  })
})

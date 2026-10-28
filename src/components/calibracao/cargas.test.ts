import { describe, expect, it } from 'vitest'
import { cargaDasPecas } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, EnsaioIndicacao, Padrao } from '#shared/tipos.ts'
import { montagemDoPonto, recomporEnsaio } from './cargas'

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

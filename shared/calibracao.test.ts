import { describe, expect, it } from 'vitest'
import { cargaDasPecas, entradaDoCalculo, montarCarga, montarPonto } from './calibracao.ts'
import { BALANCA_VAZIA, calibracaoVazia, PADRAO_VAZIO } from './dominio.ts'
import type { Balanca, EnsaioIndicacao, Padrao } from './tipos.ts'

const pesos: Padrao = {
  ...PADRAO_VAZIO,
  id: 'jp',
  versao: 1,
  identificacao: 'JP-01',
  descricao: 'Pesos de 500 kg',
  criadoEm: '',
  atualizadoEm: '',
  pesos: Array.from({ length: 10 }, (_, i) => ({
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
const todas = pesos.pesos.map((p) => ({ padraoId: 'jp', pesoId: p.id, quantidade: 1 }))

describe('cargas', () => {
  it('soma os pesos na unidade da balança e monta uma carga com as peças disponíveis', () => {
    expect(cargaDasPecas(todas, [pesos], 'kg')).toBe(5000)
    expect(cargaDasPecas(todas, [pesos], 't')).toBe(5)
    const m = montarCarga(2200, 'kg', [pesos])
    expect(m.pecas).toHaveLength(4)
    expect(m.total).toBe(2000)
    expect(m.falta).toBe(200)
  })

  it('pesos de um ponto com substituição: só o que as etapas por baixo não cobrem; e quanto passa ou falta', () => {
    // Etapa de 5 t (os 10 × 500 kg): 7,5 t com 1 etapa = 5 t por baixo + 5 × 500 kg por cima
    const um = montarPonto(7500, 1, 5000, 'kg', [pesos])
    expect(cargaDasPecas(um.pecas, [pesos], 'kg')).toBe(2500)
    expect(um.diferenca).toBe(0)
    // Sem substituição, os pesos fazem a carga inteira (e faltam 2,5 t)
    const sem = montarPonto(7500, 0, 5000, 'kg', [pesos])
    expect(cargaDasPecas(sem.pecas, [pesos], 'kg')).toBe(5000)
    expect(sem.diferenca).toBe(-2500)
    // 2 etapas (10 t) já passam da carga de 7,5 t: nenhum peso por cima, e passam 2,5 t
    expect(montarPonto(7500, 2, 5000, 'kg', [pesos])).toEqual({ pecas: [], diferenca: 2500 })
    expect(montarPonto(0, 1, 5000, 'kg', [pesos])).toEqual({ pecas: [], diferenca: 0 })
  })

  it('ponto com cargas de substituição: a carga é nível × etapa + os pesos por cima', () => {
    const indicacao: EnsaioIndicacao = {
      metodo: 'CONTINUO',
      retornoZero: null,
      substituicao: {
        ativa: true,
        pecas: todas,
        etapas: [{ leituraPadroes: 5000, leituraSubstituicao: 5020 }],
      },
      pontos: [
        { id: 'a', carga: 5000, pecas: todas, pecasManuais: false, crescente: 5000, decrescente: null, nivelSubstituicao: 0 },
        { id: 'b', carga: 10_000, pecas: todas, pecasManuais: false, crescente: 10_020, decrescente: null, nivelSubstituicao: 1 },
        { id: 'c', carga: 5000, pecas: [], pecasManuais: false, crescente: 5020, decrescente: null, nivelSubstituicao: 1 },
      ],
    }
    const entrada = entradaDoCalculo({ ...calibracaoVazia(), indicacao }, balanca, [pesos])
    expect(entrada.indicacao.pontos.map((p) => p.carga)).toEqual([5000, 10_000, 5000])
    // Substituição desligada: só os pesos
    const sem = entradaDoCalculo(
      { ...calibracaoVazia(), indicacao: { ...indicacao, substituicao: { ...indicacao.substituicao, ativa: false } } },
      balanca,
      [pesos],
    )
    expect(sem.indicacao.pontos.map((p) => [p.carga, p.nivelSubstituicao])).toEqual([
      [5000, 0],
      [5000, 0],
      [5000, 0],
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { exemploRodoviaria } from '../server/pdf/exemplosCertificado.ts'
import {
  acumulaCargas,
  avisoForaDaSequencia,
  calcularCalibracao,
  cargaDasPecas,
  cargasAcumuladas,
  descreverPecas,
  entradaDoCalculo,
  montarCarga,
  montarPonto,
  montarPontos,
  type PontoAMontar,
} from './calibracao.ts'
import { BALANCA_VAZIA, calibracaoVazia, PADRAO_VAZIO } from './dominio.ts'
import type { Balanca, CalibracaoInput, EnsaioIndicacao, Padrao } from './tipos.ts'

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

describe('calcularCalibracao', () => {
  it('"como encontrado": a incerteza usa o retorno ao zero desse ensaio (com substituição), não o do ensaio final', () => {
    const d = exemploRodoviaria()
    const { balanca: b, padroes } = d.emissao
    // Ajuste interno; o "como encontrado" com as mesmas leituras do ensaio final
    const base: CalibracaoInput = {
      ...d.calibracao,
      ajuste: { ...d.calibracao.ajuste, realizado: 'INTERNO' },
      indicacao: { ...d.calibracao.indicacao, retornoZero: 20 },
      comoEncontrado: { ...structuredClone(d.calibracao.indicacao), retornoZero: null },
    }
    const maior = (k: CalibracaoInput) => {
      const r = calcularCalibracao(k, b, padroes)
      const ponto = (x: typeof r.resultado) => x.pontos.reduce((a, p) => (p.carga > a.carga ? p : a)).crescente!
      return { antes: ponto(r.comoEncontrado!), depois: ponto(r.resultado), r }
    }
    const sem = maior(base)
    const com = maior({ ...base, comoEncontrado: { ...base.comoEncontrado!, retornoZero: 20 } })
    // O retorno do ensaio final (20 kg) não entra no "como encontrado"
    expect(sem.antes.uTempo).toBe(0)
    expect(sem.depois.uTempo).toBeGreaterThan(0)
    // Anotado no "como encontrado", a incerteza dele sobe; a do ensaio final não muda
    expect(com.antes.uTempo).toBeCloseTo(sem.depois.uTempo, 12)
    expect(com.antes.U).toBeGreaterThan(sem.antes.U)
    expect(com.depois.U).toBe(sem.depois.U)
    expect(com.r.comoEncontrado!.erroRetornoZero).toBe(20)
  })
})

// ---- Cargas acumuladas (métodos sem descarga) ------------------------------------------------------------

/** Jogo de pesos com os nominais dados (kg), cada peça com o seu id ("p0", "p1"…). */
function jogo(id: string, nominaisKg: number[]): Padrao {
  return {
    ...PADRAO_VAZIO,
    id,
    versao: 1,
    identificacao: id.toUpperCase(),
    descricao: '',
    criadoEm: '',
    atualizadoEm: '',
    pesos: nominaisKg.map((n, i) => ({ id: `p${i}`, marca: '', nominal: n * 1000, correcao: 0, incerteza: 0, k: 2 })),
  }
}
const pontosDe = (cargas: number[]): PontoAMontar[] => cargas.map((carga) => ({ carga, nivel: 0 }))
const chaves = (p: { pecas: Array<{ padraoId: string; pesoId: string }> }) => p.pecas.map((x) => `${x.padraoId}:${x.pesoId}`)

describe('montarCarga', () => {
  it('quando a gulosa não fecha, procura uma combinação exata (6 kg com 5, 3 e 3 kg)', () => {
    const j = jogo('j', [5, 3, 3])
    const m = montarCarga(6, 'kg', [j])
    expect(descreverPecas(m.pecas, [j])).toBe('2 × 3 kg')
    expect(m.falta).toBe(0)
    // Sem combinação exata, fica a gulosa e o que falta
    expect(montarCarga(7, 'kg', [j])).toMatchObject({ falta: 2, total: 5 })
  })
})

describe('montarPontos: sem descarga, cada ponto leva as peças do de baixo mais as que faltam', () => {
  it('nos métodos sem descarga a cadeia é acumulada; no "Crescente com descarga", cada ponto à parte', () => {
    expect(cargasAcumuladas('CRESCENTE_DECRESCENTE')).toBe(true)
    expect(cargasAcumuladas('CONTINUO')).toBe(true)
    expect(cargasAcumuladas('DECRESCENTE')).toBe(true)
    expect(cargasAcumuladas('DESCONTINUO')).toBe(false)
  })

  it('cada conjunto contém o anterior (a montagem à parte daria 40 kg = 4 × 10 kg, sem o 5 kg do ponto de 25 kg)', () => {
    const j = jogo('j', [10, 10, 10, 10, 5, 2, 2, 1])
    const cargas = [0, 10, 20, 25, 40, 50]
    const acumulado = montarPontos(pontosDe(cargas), true, 0, 'kg', [j])
    expect(acumulado.map((p) => descreverPecas(p.pecas, [j]))).toEqual([
      '',
      '10 kg',
      '2 × 10 kg',
      '2 × 10 kg + 5 kg',
      '3 × 10 kg + 5 kg + 2 × 2 kg + 1 kg',
      '4 × 10 kg + 5 kg + 2 × 2 kg + 1 kg',
    ])
    for (let i = 2; i < cargas.length; i++)
      expect(chaves(acumulado[i]), `${cargas[i]} kg`).toEqual(expect.arrayContaining(chaves(acumulado[i - 1])))
    expect(acumulado.every((p) => p.diferenca === 0 && !p.foraDaSequencia)).toBe(true)
    // À parte, cada carga é montada sozinha
    const aParte = montarPontos(pontosDe(cargas), false, 0, 'kg', [j])
    expect(descreverPecas(aParte[4].pecas, [j])).toBe('4 × 10 kg')
  })

  it('a ordem da lista não importa: a cadeia segue as cargas em ordem crescente (o "Decrescente" lista de Max para baixo)', () => {
    const j = jogo('j', [10, 10, 10, 10, 5, 2, 2, 1])
    const desc = montarPontos(pontosDe([50, 40, 25, 20, 10, 0]), true, 0, 'kg', [j])
    const asc = montarPontos(pontosDe([0, 10, 20, 25, 40, 50]), true, 0, 'kg', [j])
    expect(desc.map((p) => descreverPecas(p.pecas, [j]))).toEqual(asc.map((p) => descreverPecas(p.pecas, [j])).reverse())
  })

  it('sem combinação acumulada, o ponto é marcado (troca de peças) e a cadeia continua dele', () => {
    // 50 kg = 2 × 20 kg + 10 kg; 100 kg exige os 5 × 20 kg: o 10 kg sairia no meio da subida
    const j = jogo('j', [20, 20, 20, 20, 20, 10])
    const r = montarPontos(pontosDe([0, 50, 100]), true, 0, 'kg', [j])
    expect(r.map((p) => descreverPecas(p.pecas, [j]))).toEqual(['', '2 × 20 kg + 10 kg', '5 × 20 kg'])
    expect(r.map((p) => p.foraDaSequencia)).toEqual([false, false, true])
    expect(r[2].diferenca).toBe(0)
    // 6 × 20 kg + 10 + 5 + 5: o ponto de 75 kg não sai do de 50 kg; o de 100 kg continua do de 75 kg
    const k = jogo('k', [20, 20, 20, 20, 20, 20, 10, 5, 5])
    const x = montarPontos(pontosDe([25, 50, 75, 100]), true, 0, 'kg', [k])
    expect(x.map((p) => p.foraDaSequencia)).toEqual([false, false, true, false])
    expect(chaves(x[3])).toEqual(expect.arrayContaining(chaves(x[2])))
    expect(x.map((p) => cargaDasPecas(p.pecas, [k], 'kg'))).toEqual([25, 50, 75, 100])
  })

  it('pesos que não chegam à carga: falta (avisada à parte), sem marcar troca de peças', () => {
    const j = jogo('j', [10, 10])
    const r = montarPontos(pontosDe([10, 20, 30]), true, 0, 'kg', [j])
    expect(r.map((p) => [cargaDasPecas(p.pecas, [j], 'kg'), p.diferenca, p.foraDaSequencia])).toEqual([
      [10, 0, false],
      [20, 0, false],
      [20, -10, false],
    ])
  })

  it('com substituição, uma cadeia por nível: a troca pelo material recomeça a pilha de cima', () => {
    const j = jogo('j', Array.from({ length: 10 }, () => 1000))
    const pontos: PontoAMontar[] = [
      { carga: 0, nivel: 0 },
      { carga: 5000, nivel: 0 },
      { carga: 10_000, nivel: 0 },
      { carga: 15_000, nivel: 1 },
      { carga: 20_000, nivel: 1 },
      { carga: 25_000, nivel: 2 },
    ]
    const r = montarPontos(pontos, true, 10_000, 'kg', [j])
    expect(r.map((p) => cargaDasPecas(p.pecas, [j], 'kg'))).toEqual([0, 5000, 10_000, 5000, 10_000, 5000])
    expect(r.every((p) => p.diferenca === 0 && !p.foraDaSequencia)).toBe(true)
    expect(chaves(r[4])).toEqual(expect.arrayContaining(chaves(r[3])))
  })

  it('peças escolhidas à mão ficam; a cadeia continua delas, e o ponto à mão que não contém o de baixo é marcado', () => {
    const j = jogo('j', [10, 10, 10, 5, 5])
    const peca = (i: number) => ({ padraoId: 'j', pesoId: `p${i}`, quantidade: 1 })
    const montar = (manuais: ReturnType<typeof peca>[]) =>
      montarPontos(
        [
          { carga: 10, nivel: 0 },
          { carga: 20, nivel: 0, pecasManuais: manuais },
          { carga: 30, nivel: 0 },
        ],
        true,
        0,
        'kg',
        [j],
      )
    // À mão, 20 kg = p2 (10 kg) + p3 + p4 (5 kg): o ponto de 10 kg passa a ser os dois de 5 kg (cabem nele)
    const cabe = montar([peca(2), peca(3), peca(4)])
    expect(chaves(cabe[0])).toEqual(['j:p3', 'j:p4'])
    expect(chaves(cabe[1])).toEqual(['j:p2', 'j:p3', 'j:p4'])
    expect(cabe.map((p) => p.foraDaSequencia)).toEqual([false, false, false])
    expect(chaves(cabe[2])).toEqual(expect.arrayContaining(chaves(cabe[1])))
    // À mão, 20 kg = p1 (10 kg) + p2 (10 kg): não contém nenhum ponto de 10 kg possível (p0 ou 5 + 5): marcado
    const r = montar([peca(1), peca(2)])
    expect(chaves(r[0])).toEqual(['j:p0'])
    expect(chaves(r[1])).toEqual(['j:p1', 'j:p2'])
    expect(r.map((p) => p.foraDaSequencia)).toEqual([false, true, false])
    // O de 30 kg continua do ponto à mão
    expect(chaves(r[2])).toEqual(expect.arrayContaining(['j:p1', 'j:p2']))
    expect(r[2].diferenca).toBe(0)
  })

  it('a calibração acumula quando o ensaio final ou o "como encontrado" (com ajuste) é sem descarga', () => {
    const base = calibracaoVazia()
    const com = (final: EnsaioIndicacao['metodo'], antes: EnsaioIndicacao['metodo'] | null, ajuste: 'NAO' | 'INTERNO') => ({
      ...base,
      indicacao: { ...base.indicacao, metodo: final },
      comoEncontrado: antes ? { ...base.indicacao, metodo: antes } : null,
      ajuste: { realizado: ajuste, descricao: '' },
    })
    expect(acumulaCargas(com('DESCONTINUO', null, 'NAO'))).toBe(false)
    expect(acumulaCargas(com('CONTINUO', null, 'NAO'))).toBe(true)
    expect(acumulaCargas(com('DESCONTINUO', 'CRESCENTE_DECRESCENTE', 'INTERNO'))).toBe(true)
    expect(acumulaCargas(com('DESCONTINUO', 'CRESCENTE_DECRESCENTE', 'NAO'))).toBe(false)
  })

  it('texto do aviso: pesos previstos (folha) ou escolhidos (editor); com substituição, o método não muda', () => {
    expect(avisoForaDaSequencia(['100 kg'], 'CRESCENTE_DECRESCENTE', 'previstos', false)).toBe(
      'Sem descarregar (“Crescente e decrescente”), cada carga leva as peças da anterior mais as que faltam, e os pesos previstos não montam assim a carga de 100 kg: leve outras peças ou use o método “Crescente com descarga”.',
    )
    expect(avisoForaDaSequencia(['15 t', '25 t'], 'CONTINUO', 'escolhidos', true)).toBe(
      'Sem descarregar (“Crescente contínuo”), cada carga leva as peças da anterior mais as que faltam, e os pesos escolhidos não montam assim as cargas de 15 t, 25 t: escolha as peças à mão, leve outras peças ou mude as cargas.',
    )
  })
})

describe('entradaDoCalculo', () => {
  it('excentricidade com carga rolante só na rodoviária e na ferroviária', () => {
    const k = calibracaoVazia()
    expect(entradaDoCalculo(k, balanca, [pesos]).excentricidade.cargaRolante).toBe(true)
    expect(entradaDoCalculo(k, { ...balanca, tipo: 'FERROVIARIA', receptor: 'RODOVIARIA' }, [pesos]).excentricidade.cargaRolante).toBe(
      true,
    )
    expect(
      entradaDoCalculo(k, { ...balanca, tipo: 'PLATAFORMA', receptor: 'RETANGULAR' }, [pesos]).excentricidade.cargaRolante,
    ).toBe(false)
    // Só a faixa (cópia antiga sem receptor nem tipo): sem carga rolante
    const { unidade, classe, tipoFaixas, faixas } = balanca
    expect(entradaDoCalculo(k, { unidade, classe, tipoFaixas, faixas }, [pesos]).excentricidade.cargaRolante).toBe(false)
  })

  it('peças de um jogo que saiu da calibração: o ponto fica com a carga digitada e a pendência', () => {
    const indicacao: EnsaioIndicacao = {
      metodo: 'CONTINUO',
      retornoZero: 0,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: [
        {
          id: 'a',
          carga: 1000,
          pecas: [
            { padraoId: 'outro', pesoId: 'x', quantidade: 1 },
            { padraoId: 'outro', pesoId: 'y', quantidade: 1 },
          ],
          pecasManuais: true,
          crescente: 1000,
          decrescente: null,
          nivelSubstituicao: 0,
        },
        { id: 'b', carga: 500, pecas: [todas[0]], pecasManuais: false, crescente: 500, decrescente: null, nivelSubstituicao: 0 },
      ],
    }
    const e = entradaDoCalculo({ ...calibracaoVazia(), indicacao }, balanca, [pesos])
    expect(e.indicacao.pontos.map((p) => [p.carga, p.pecas.length, p.pecasAusentes])).toEqual([
      [1000, 0, 2],
      [500, 1, undefined],
    ])
  })
})

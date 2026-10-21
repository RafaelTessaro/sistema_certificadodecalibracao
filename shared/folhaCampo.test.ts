import { describe, expect, it } from 'vitest'
import { folhaEmBranco, folhaMultiIntervalo, folhaPlataforma, folhaRodoviaria } from '../server/pdf/exemplosFolhaCampo.ts'
import { padroesPrevistos, planoDaFolha, validadeDosPadroes } from './folhaCampo.ts'

const plano = (d: ReturnType<typeof folhaPlataforma>) =>
  planoDaFolha(d.calibracao, d.balanca!, d.padroes, d.calibracao!.dataCalibracao)

describe('planoDaFolha', () => {
  it('usa os pontos, as cargas e as posições do rascunho, com os pesos remontados', () => {
    const p = plano(folhaPlataforma())
    expect(p.origem).toBe('RASCUNHO')
    expect(p.metodo).toBe('CRESCENTE_DECRESCENTE')
    expect(p.pontos.map((x) => x.carga)).toEqual([0, 10, 50, 100, 150, 200, 300])
    expect(p.pontos.find((x) => x.carga === 150)?.pesos).toBe('7 × 20 kg + 10 kg')
    expect(p.pontos.every((x) => x.falta === 0)).toBe(true)
    // Conformidade pedida: EMA da Portaria 157 em serviço (classe III, e = 50 g): 2e até 500e, 4e acima
    expect(p.pontos.find((x) => x.carga === 10)?.ema).toBe(0.1)
    expect(p.pontos.find((x) => x.carga === 300)?.ema).toBe(0.2)
    expect(p.repetibilidade).toEqual([expect.objectContaining({ carga: 150, leituras: 5, minimo: 3 })])
    expect(p.excentricidade).toMatchObject({ aplicavel: true, carga: 100, metodo: 1, pesos: '5 × 20 kg' })
    expect(p.excentricidade.posicoes).toHaveLength(5)
    // Peças a separar: a união das cargas (15 de 20 kg do PP20; 10 kg do JP-01)
    expect(p.padroes.map((x) => [x.padrao.identificacao, x.separar])).toEqual([
      ['PP20-01 a 15', '15 × 20 kg'],
      ['JP-01', '10 kg'],
      ['TH-01', ''],
    ])
    expect(p.avisos).toEqual([])
  })

  it('sem ensaios no rascunho, planeja com as sugestões do assistente (multi-intervalo)', () => {
    const p = plano(folhaMultiIntervalo())
    expect(p.origem).toBe('SUGESTAO')
    expect(p.pontos[0].carga).toBe(0)
    expect(p.pontos.at(-1)?.carga).toBe(33)
    // d e EMA pelo intervalo parcial de cada carga
    expect(p.pontos.find((x) => x.carga === 4)).toMatchObject({ d: 0.002, ema: 0.008 })
    expect(p.pontos.find((x) => x.carga === 33)).toMatchObject({ d: 0.01, ema: 0.04 })
    // Repetibilidade: ~Max/2, 5 leituras; excentricidade: Max/3
    expect(p.repetibilidade[0]).toMatchObject({ carga: 16.5, leituras: 5, minimo: 5 })
    expect(p.excentricidade.carga).toBe(10)
  })

  it('rodoviária: substituição em etapas sem acusar falta de pesos nos pontos acima de 10 t', () => {
    const p = plano(folhaRodoviaria())
    expect(p.substituicao).toMatchObject({ ativa: true, carga: 10_000, etapas: 3, pesos: '20 × 500 kg' })
    expect(p.pontos.map((x) => x.nivelSubstituicao)).toEqual([0, 0, 0, 1, 2, 3])
    expect(p.pontos.every((x) => x.falta === 0)).toBe(true)
    expect(p.repetibilidade[0]).toMatchObject({ carga: 10_000, leituras: 3, minimo: 3 })
    expect(p.excentricidade.posicoes).toHaveLength(6)
    // Tolerância do cliente: a mesma EMA em toda a faixa
    expect(new Set(p.pontos.map((x) => x.ema))).toEqual(new Set([60]))
    // Os pontos param na metade de Max: o certificado só cobre até 40 t, e a folha avisa antes de sair
    expect(p.avisos).toHaveLength(1)
    expect(p.avisos[0]).toMatch(/^Os pontos vão só até 40\s000 kg \(50 % de Max\)/)
  })

  it('avisa antes de sair: pesos que não fecham a carga e padrão vencido', () => {
    const d = folhaPlataforma()
    d.balanca = { ...d.balanca!, faixas: [{ max: 500, e: 0.1, d: 0.1 }] }
    d.calibracao = { ...d.calibracao!, indicacao: { ...d.calibracao!.indicacao, pontos: [] } }
    d.padroes = d.padroes.map((x) => (x.identificacao === 'TH-01' ? { ...x, validade: '2026-01-01' } : x))
    const p = plano(d)
    expect(p.pontos.at(-1)?.carga).toBe(500)
    expect(p.pontos.at(-1)?.falta).toBeGreaterThan(0)
    expect(p.avisos.join(' ')).toMatch(/não fecham/)
    expect(p.avisos.join(' ')).toMatch(/TH-01: calibração vencida em 01\/01\/2026/)
    expect(p.padroes.find((x) => x.padrao.identificacao === 'TH-01')?.situacao).toBe('VENCIDO')
  })

  it('avisa quando os pesos não fecham a carga da repetibilidade ou da excentricidade', () => {
    const d = folhaPlataforma()
    // 400 kg: mais que os 15 × 20 kg e o jogo de 1 g a 10 kg juntos
    d.calibracao = {
      ...d.calibracao!,
      repetibilidade: [{ id: 'r1', carga: 400, leituras: [] }],
      excentricidade: { ...d.calibracao!.excentricidade, carga: 400 },
    }
    const p = plano(d)
    expect(p.repetibilidade[0].falta).toBeGreaterThan(0)
    expect(p.excentricidade.falta).toBeGreaterThan(0)
    const avisos = p.avisos.join(' ')
    expect(avisos).toMatch(/Repetibilidade: os pesos previstos não fecham 400 kg \(faltam [\d,]+ kg\)/)
    expect(avisos).toMatch(/Excentricidade: os pesos previstos não fecham 400 kg \(faltam [\d,]+ kg\)/)
    // Com as cargas que fecham, nenhum aviso
    expect(plano(folhaPlataforma()).avisos).toEqual([])
  })

  it('balança de gancho: excentricidade não aplicável, com o motivo', () => {
    const d = folhaPlataforma()
    d.balanca = { ...d.balanca!, receptor: 'GANCHO' }
    d.calibracao = { ...d.calibracao!, excentricidade: { aplicavel: true, motivo: '', carga: 0, metodo: 1, posicoes: [] } }
    const p = plano(d)
    expect(p.excentricidade).toMatchObject({ aplicavel: false, carga: 0, posicoes: [] })
    expect(p.excentricidade.motivo).toMatch(/gancho/)
  })

  it('sem conformidade pedida, a faixa aceitável (só para decidir o ajuste) é a do EMA em serviço; sem classe, não há', () => {
    const sem = folhaPlataforma()
    sem.calibracao = { ...sem.calibracao!, conformidade: { ...sem.calibracao!.conformidade, solicitada: false } }
    const p = plano(sem)
    expect(p.conformidade).toBeNull()
    expect(p.faixaAceitavel).toEqual({ criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, daConformidade: false })
    expect(p.pontos.find((x) => x.carga === 300)?.ema).toBe(0.2)
    // Pedida: o critério da conformidade
    expect(plano(folhaRodoviaria()).faixaAceitavel).toMatchObject({
      criterio: 'CLIENTE',
      toleranciaCliente: 60,
      daConformidade: true,
    })
    const semClasse = folhaPlataforma()
    semClasse.balanca = { ...semClasse.balanca!, classe: '' }
    semClasse.calibracao = sem.calibracao
    expect(plano(semClasse).faixaAceitavel).toBeNull()
    expect(plano(semClasse).pontos.every((x) => x.ema === null)).toBe(true)
  })

  it('substituição com peças automáticas: os pesos por cima só completam o que as etapas não cobrem', () => {
    const d = folhaRodoviaria()
    const k = d.calibracao!
    const ponto = (id: string, carga: number, nivel: number) => ({
      id,
      carga,
      pecas: [],
      pecasManuais: false,
      crescente: null,
      decrescente: null,
      nivelSubstituicao: nivel,
    })
    // Etapa de 10 t (20 × 500 kg): 15 t com 1 substituição = 10 t por baixo + 10 × 500 kg por cima
    d.calibracao = { ...k, indicacao: { ...k.indicacao, pontos: [ponto('a', 15_000, 1), ponto('b', 15_000, 2)] } }
    const p = plano(d)
    expect(p.pontos[0]).toMatchObject({ pesos: '10 × 500 kg', falta: 0, excesso: 0, nivelSubstituicao: 1 })
    // 2 etapas já somam 20 t: passa 5 t da carga, e a folha avisa (o cálculo usaria a soma)
    expect(p.pontos[1]).toMatchObject({ pesos: '', falta: 0, excesso: 5_000, nivelSubstituicao: 2 })
    expect(p.avisos.join(' ')).toMatch(/Ponto de 15\s000 kg: 2 substituições de 10\s000 kg somam 20\s000 kg/)
  })
})

describe('validadeDosPadroes', () => {
  it('situação na data e aviso dos vencidos (também sem plano: folha em branco ou só do cliente)', () => {
    const d = folhaEmBranco()
    const padroes = d.padroes.map((x) => (x.identificacao === 'TH-01' ? { ...x, validade: '2026-05-10' } : x))
    const v = validadeDosPadroes(padroes, '2026-10-21')
    expect(v.itens.find((x) => x.padrao.identificacao === 'TH-01')?.situacao).toBe('VENCIDO')
    expect(v.itens.find((x) => x.padrao.identificacao === 'JP-01')?.situacao).toBe('VALIDO')
    expect(v.avisos).toEqual(['TH-01: calibração vencida em 10/05/2026.'])
  })
})

describe('padroesPrevistos', () => {
  it('os do rascunho, na ordem; sem escolha, os ativos menos "outro"', () => {
    const d = folhaEmBranco()
    expect(padroesPrevistos(null, d.padroes).map((p) => p.identificacao)).toEqual([
      'PP20-01 a 15',
      'JP-01',
      'TH-01',
      'PP500-01 a 20',
      'BR-01',
    ])
    const ids = [d.padroes[1].id, d.padroes[0].id]
    expect(padroesPrevistos({ padroesIds: ids }, d.padroes).map((p) => p.identificacao)).toEqual(['JP-01', 'PP20-01 a 15'])
  })
})

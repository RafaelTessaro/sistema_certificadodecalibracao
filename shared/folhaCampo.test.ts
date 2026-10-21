import { describe, expect, it } from 'vitest'
import { folhaEmBranco, folhaMultiIntervalo, folhaPlataforma, folhaRodoviaria } from '../server/pdf/exemplosFolhaCampo.ts'
import { padroesPrevistos, planoDaFolha } from './folhaCampo.ts'

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

  it('balança de gancho: excentricidade não aplicável, com o motivo', () => {
    const d = folhaPlataforma()
    d.balanca = { ...d.balanca!, receptor: 'GANCHO' }
    d.calibracao = { ...d.calibracao!, excentricidade: { aplicavel: true, motivo: '', carga: 0, metodo: 1, posicoes: [] } }
    const p = plano(d)
    expect(p.excentricidade).toMatchObject({ aplicavel: false, carga: 0, posicoes: [] })
    expect(p.excentricidade.motivo).toMatch(/gancho/)
  })

  it('sem classe e sem conformidade pedida, não há EMA', () => {
    const d = folhaPlataforma()
    d.balanca = { ...d.balanca!, classe: '' }
    expect(plano(d).pontos.every((x) => x.ema === null)).toBe(true)
    const sem = folhaPlataforma()
    sem.calibracao = { ...sem.calibracao!, conformidade: { ...sem.calibracao!.conformidade, solicitada: false } }
    expect(plano(sem).conformidade).toBeNull()
    expect(plano(sem).pontos.every((x) => x.ema === null)).toBe(true)
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

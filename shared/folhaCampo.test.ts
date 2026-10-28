import { describe, expect, it } from 'vitest'
import type { Padrao } from './tipos.ts'
import { exemploClasseI } from '../server/pdf/exemplosCertificado.ts'
import { calcularCalibracao, montarCarga, pontosSugeridos } from './calibracao.ts'
import {
  folhaClasseI,
  folhaEmBranco,
  folhaMultiIntervalo,
  folhaPlataforma,
  folhaRodoviaria,
  folhaRodoviariaSemHistorico,
} from '../server/pdf/exemplosFolhaCampo.ts'
import {
  AVISO_ETIQUETA,
  FORMULARIO_FOLHA_CAMPO,
  LEITURAS_CLASSE_I,
  padroesPrevistos,
  planoDaFolha,
  referenciaDoFormulario,
  temLeituras,
  validadeDosPadroes,
} from './folhaCampo.ts'

const plano = (d: ReturnType<typeof folhaPlataforma>) =>
  planoDaFolha(d.calibracao, d.balanca!, d.padroes, d.calibracao!.dataCalibracao)

describe('planoDaFolha', () => {
  it('usa os pontos, as cargas e as posições do rascunho, com os pesos remontados', () => {
    const p = plano(folhaPlataforma())
    expect(p.origem).toBe('RASCUNHO')
    expect(p.metodo).toBe('CRESCENTE_DECRESCENTE')
    // Com Min (1 kg), marcada na plaqueta
    expect(p.pontos.map((x) => x.carga)).toEqual([0, 1, 10, 50, 100, 150, 200, 300])
    expect(p.pontos.find((x) => x.carga === 150)?.pesos).toBe('7 × 20 kg + 10 kg')
    expect(p.pontos.every((x) => x.falta === 0)).toBe(true)
    // Conformidade pedida: EMA da Portaria 157 em serviço (classe III, e = 50 g): 2e até 500e, 4e acima
    expect(p.pontos.find((x) => x.carga === 10)?.ema).toBe(0.1)
    expect(p.pontos.find((x) => x.carga === 300)?.ema).toBe(0.2)
    expect(p.repetibilidade).toEqual([expect.objectContaining({ carga: 150, leituras: 5, minimo: 3 })])
    expect(p.excentricidade).toMatchObject({ aplicavel: true, carga: 100, metodo: 1, pesos: '5 × 20 kg' })
    expect(p.excentricidade.posicoes).toHaveLength(5)
    // Peças a separar: a união das cargas (15 de 20 kg do PP20; 10 kg e 1 kg, de Min, do JP-01)
    expect(p.padroes.map((x) => [x.padrao.identificacao, x.separar])).toEqual([
      ['PP20-01 a 15', '15 × 20 kg'],
      ['JP-01', '10 kg + 1 kg'],
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
    // Min (40 g) entre as cargas
    expect(p.pontos.map((x) => x.carga).slice(0, 3)).toEqual([0, 0.04, 1])
    // Repetibilidade: um ensaio por intervalo (logo abaixo do Max dos de baixo; cerca de metade de Max no de cima), 5 leituras
    expect(p.repetibilidade.map((r) => [r.carga, r.leituras, r.minimo])).toEqual([
      [4.8, 5, 5],
      [12, 5, 5],
      [16.5, 5, 5],
    ])
    // Excentricidade: no mínimo 1/3 de Max (11 kg), num valor redondo acima
    expect(p.excentricidade.carga).toBe(15)
    expect(p.avisos).toEqual([])
  })

  it('Min fora das cargas do rascunho: avisa para incluí-la', () => {
    const d = folhaPlataforma()
    d.calibracao = {
      ...d.calibracao!,
      indicacao: { ...d.calibracao!.indicacao, pontos: d.calibracao!.indicacao.pontos.filter((x) => x.carga !== 1) },
    }
    expect(plano(d).avisos).toEqual(['Min (1 kg) não está entre as cargas do erro de indicação: inclua-a no sistema.'])
    // Sem Min marcada, nada
    expect(plano({ ...d, balanca: { ...d.balanca!, min: 0 } }).avisos).toEqual([])
  })

  it('classe II: o barômetro vai inteiro na lista (a pressão é obrigatória); nas outras, na linha dos demais', () => {
    const d = folhaRodoviaria()
    const naFolha = (x: typeof d) =>
      plano(x)
        .padroes.filter((p) => p.naFolha)
        .map((p) => p.padrao.identificacao)
    expect(naFolha(d)).not.toContain('BR-01')
    expect(naFolha({ ...d, balanca: { ...d.balanca!, classe: 'II' } })).toContain('BR-01')
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
    // Os pontos param na metade de Max: o certificado só cobre até 40 t, e a folha avisa antes de sair; Min (400 kg)
    // fora das cargas do último certificado; 10 t de pesos padrão por etapa, abaixo dos 15 t da regra da empresa
    // (Max 80 t)
    expect(p.avisos).toHaveLength(3)
    expect(p.avisos[0]).toMatch(/^Os pontos vão só até 40\s000 kg \(50 % de Max\)/)
    expect(p.avisos[1]).toBe('Min (400 kg) não está entre as cargas do erro de indicação: inclua-a no sistema.')
    expect(p.avisos[2]).toMatch(
      /^Cargas de substituição com 10\s000 kg de pesos padrão em cada etapa: para Max de 80\s000 kg, o mínimo é 15\s000 kg \(regra da empresa\)\. Leve mais pesos\.$/,
    )
    // O POP-CAL-01 não cobre as rodoviárias: nada de remeter a ele na substituição (a Tabela 7 é a da etiqueta)
    expect(p.avisos.join(' ')).not.toMatch(/Tabela 7|POP 7\.12|do POP\)\. Leve/)
  })

  it('rodoviária sem substituição no plano: sugere as etapas (os pesos previstos) e o nível de cada ponto, como o cálculo soma', () => {
    const p = plano(folhaRodoviariaSemHistorico())
    expect(p.origem).toBe('SUGESTAO')
    // Etapa = os 20 × 500 kg previstos; o nível é o que os pesos não alcançam, em etapas
    expect(p.substituicao).toMatchObject({ ativa: false, sugerida: true, carga: 10_000, etapas: 5, pesos: '20 × 500 kg' })
    expect(p.pontos.map((x) => [x.carga, x.nivelSubstituicao, x.pesos])).toEqual([
      [0, 0, ''],
      // Min (400 kg): os 500 kg não a fecham (a folha avisa: leve outros pesos)
      [400, 0, ''],
      [10_000, 0, '20 × 500 kg'],
      // 15 000 kg = 1 etapa de 10 000 kg + 10 × 500 kg por cima (nada de "20 × 500 kg + 5000 kg por baixo")
      [15_000, 1, '10 × 500 kg'],
      [30_000, 2, '20 × 500 kg'],
      [40_000, 3, '20 × 500 kg'],
      [45_000, 4, '10 × 500 kg'],
      [60_000, 5, '20 × 500 kg'],
    ])
    // nível × etapa + pesos = a carga de cada ponto (o que o cálculo usaria): nada falta nem passa (menos Min)
    expect(p.pontos.filter((x) => x.carga !== 400).every((x) => x.falta === 0 && x.excesso === 0)).toBe(true)
    // Abaixo da menor peça (os blocos de 500 kg): pesos menores
    expect(p.avisos).toContain('Os pesos previstos não fecham a carga de 400 kg: leve pesos menores.')
    // 10 t de pesos por etapa: o mínimo da regra da empresa para Max de 60 t (sem aviso)
    expect(p.avisos.join(' ')).not.toContain('Cargas de substituição com')
    expect(p.avisos[0]).toMatch(
      /^Os pesos previstos não chegam às cargas acima de 10\s000 kg: a folha sugere até 5 etapas de substituição de 10\s000 kg; combine o material/,
    )
    // Sem conformidade pedida: a faixa para decidir o ajuste é a do EMA em serviço da classe III
    expect(p.faixaAceitavel).toEqual({
      criterio: 'PORTARIA_SERVICO',
      toleranciaCliente: 0,
      daConformidade: false,
      toleranciaPendente: false,
    })
    expect(p.pontos.at(-1)?.ema).toBe(80)
  })

  it('com substituição, as cargas só sobem: "crescente e decrescente" vira "crescente contínuo"', () => {
    // Rascunho novo (sem pontos): o padrão do sistema, sem aviso
    const semHistorico = plano(folhaRodoviariaSemHistorico())
    expect(semHistorico.metodo).toBe('CONTINUO')
    expect(semHistorico.metodoComoEncontrado).toBe('CONTINUO')
    expect(semHistorico.avisos.join(' ')).not.toContain('as cargas só sobem')
    // O último certificado com "crescente e decrescente" e substituição: a folha prevê o contínuo e avisa
    const d = folhaRodoviaria()
    const k = structuredClone(d.calibracao!)
    k.indicacao.metodo = 'CRESCENTE_DECRESCENTE'
    const p = planoDaFolha(k, d.balanca!, d.padroes, k.dataCalibracao)
    expect(p.metodo).toBe('CONTINUO')
    expect(p.avisos).toContain(
      'Com cargas de substituição, as cargas só sobem: a folha prevê “Crescente contínuo” (no sistema está “Crescente e decrescente”); acerte no sistema.',
    )
    // Descarregar entre os pontos (ou só descer) também pediria tirar o material: contínuo, com aviso
    for (const m of ['DESCONTINUO', 'DECRESCENTE'] as const) {
      k.indicacao.metodo = m
      const x = planoDaFolha(k, d.balanca!, d.padroes, k.dataCalibracao)
      expect(x.metodo).toBe('CONTINUO')
      expect(x.avisos.join(' ')).toContain('a folha prevê “Crescente contínuo”')
    }
    // Sem substituição (os pesos fecham as cargas) o método do rascunho fica
    expect(plano(folhaPlataforma()).metodo).toBe('CRESCENTE_DECRESCENTE')
    const plataforma = folhaPlataforma()
    plataforma.calibracao!.indicacao.metodo = 'DESCONTINUO'
    expect(plano(plataforma).metodo).toBe('DESCONTINUO')
  })

  it('com substituição e o ensaio já com leituras, fica o método do ensaio (é o que foi feito), sem aviso', () => {
    const d = folhaRodoviaria()
    const k = structuredClone(d.calibracao!)
    k.indicacao.metodo = 'CRESCENTE_DECRESCENTE'
    // Sem leituras (o rascunho do último certificado, com as leituras limpas): só crescente
    expect(temLeituras(k.indicacao)).toBe(false)
    expect(planoDaFolha(k, d.balanca!, d.padroes, k.dataCalibracao).metodo).toBe('CONTINUO')
    // Com uma leitura de ponto ou de etapa, o método do rascunho
    const comPonto = structuredClone(k)
    comPonto.indicacao.pontos[1].crescente = 5000
    const comEtapa = structuredClone(k)
    comEtapa.indicacao.substituicao.etapas[0].leituraPadroes = 10_000
    for (const x of [comPonto, comEtapa]) {
      expect(temLeituras(x.indicacao)).toBe(true)
      const p = planoDaFolha(x, d.balanca!, d.padroes, x.dataCalibracao)
      expect(p.metodo).toBe('CRESCENTE_DECRESCENTE')
      expect(p.avisos.join(' ')).not.toContain('as cargas só sobem')
    }
    // Cada ensaio pelas suas leituras: o "como encontrado" medido fica; o "depois do ajuste", ainda vazio, vira contínuo
    const ajuste = structuredClone(k)
    ajuste.ajuste = { ...ajuste.ajuste, realizado: 'INTERNO' }
    ajuste.comoEncontrado = structuredClone(comPonto.indicacao)
    const p = planoDaFolha(ajuste, d.balanca!, d.padroes, ajuste.dataCalibracao)
    expect([p.metodoComoEncontrado, p.metodo]).toEqual(['CRESCENTE_DECRESCENTE', 'CONTINUO'])
    // O "como encontrado" ainda vazio, com outro método no sistema: a folha prevê o contínuo e avisa
    const antesVazio = structuredClone(k)
    antesVazio.indicacao.metodo = 'CONTINUO'
    antesVazio.ajuste = { ...antesVazio.ajuste, realizado: 'INTERNO' }
    antesVazio.comoEncontrado = { ...structuredClone(k.indicacao), metodo: 'DESCONTINUO' }
    const q = planoDaFolha(antesVazio, d.balanca!, d.padroes, antesVazio.dataCalibracao)
    expect([q.metodoComoEncontrado, q.metodo]).toEqual(['CONTINUO', 'CONTINUO'])
    expect(q.avisos).toContain(
      'Com cargas de substituição, as cargas só sobem: a folha prevê “Crescente contínuo” (no sistema, o “como encontrado” está “Crescente com descarga”); acerte no sistema.',
    )
  })

  it('o método do "como encontrado" é o do ensaio dele, quando o rascunho já tem o ajuste previsto', () => {
    const d = folhaPlataforma()
    const k = structuredClone(d.calibracao!)
    expect(planoDaFolha(k, d.balanca!, d.padroes, k.dataCalibracao).metodoComoEncontrado).toBe('CRESCENTE_DECRESCENTE')
    k.ajuste = { ...k.ajuste, realizado: 'INTERNO' }
    k.comoEncontrado = { ...structuredClone(k.indicacao), metodo: 'CONTINUO' }
    const p = planoDaFolha(k, d.balanca!, d.padroes, k.dataCalibracao)
    expect([p.metodoComoEncontrado, p.metodo]).toEqual(['CONTINUO', 'CRESCENTE_DECRESCENTE'])
  })

  it('substituição sugerida: só em rodoviária, só quando os pesos não fecham, e a etapa é redonda (as peças pequenas completam)', () => {
    const d = folhaRodoviariaSemHistorico()
    // Os pesos fecham todas as cargas: sem sugestão
    const pequena = { ...d.balanca!, faixas: [{ max: 10_000, e: 5, d: 5 }] }
    expect(planoDaFolha(d.calibracao, pequena, d.padroes, '2026-10-28').substituicao).toMatchObject({
      sugerida: false,
      etapas: 0,
    })
    // Não é rodoviária: os pontos acusam a falta (sem etapas sugeridas)
    const piso = { ...d.balanca!, tipo: 'PISO' as const, receptor: 'APOIOS' as const }
    const p = planoDaFolha(d.calibracao, piso, d.padroes, '2026-10-28')
    expect(p.substituicao).toMatchObject({ sugerida: false, etapas: 0 })
    expect(p.pontos.find((x) => x.carga === 15_000)).toMatchObject({ nivelSubstituicao: 0, falta: 5000 })
    // Com uma peça pequena a mais, a etapa continua em 10 000 kg (múltiplo da maior peça)
    const comPequena = d.padroes.map((x) =>
      x.tipo === 'PESOS' ? { ...x, pesos: [...x.pesos, { ...x.pesos[0], id: 'p20', nominal: 20_000 }] } : x,
    )
    const q = planoDaFolha(d.calibracao, d.balanca!, comPequena, '2026-10-28')
    expect(q.substituicao).toMatchObject({ sugerida: true, carga: 10_000, pesos: '20 × 500 kg' })
    expect(q.pontos.find((x) => x.carga === 15_000)).toMatchObject({ nivelSubstituicao: 1, falta: 0 })
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

  it('cargas copiadas do último certificado: excentricidade abaixo da Tabela 5 do POP e um ensaio de repetibilidade só no multi-intervalo', () => {
    // 300 kg: no mínimo 1/3 de Max = 100 kg (o certificado antigo arredondava para o mais próximo: 90 kg)
    const d = folhaPlataforma()
    d.calibracao = { ...d.calibracao!, excentricidade: { ...d.calibracao!.excentricidade, carga: 90 } }
    expect(plano(d).avisos).toEqual([
      'Excentricidade: 90 kg está abaixo do mínimo da Tabela 5 do POP (1/3 de Max); use ≥ 100 kg no sistema.',
    ])
    d.calibracao.excentricidade.carga = 100
    expect(plano(d).avisos).toEqual([])
    // Balcão 6/15/33 kg: o ensaio único (no de cima) não cobre os intervalos de baixo
    const m = folhaMultiIntervalo()
    m.calibracao = { ...m.calibracao!, repetibilidade: [{ id: 'r1', carga: 16.5, leituras: [] }] }
    expect(plano(m).avisos).toEqual([
      'Repetibilidade: falta ensaio nos intervalos até 6 kg e até 15 kg (o POP pede um em cada intervalo de d diferente); acrescente no sistema.',
    ])
    m.calibracao.repetibilidade.push({ id: 'r2', carga: 4.8, leituras: [] })
    expect(plano(m).avisos).toEqual([
      'Repetibilidade: falta ensaio no intervalo até 15 kg (o POP pede um em cada intervalo de d diferente); acrescente no sistema.',
    ])
    m.calibracao.repetibilidade.push({ id: 'r3', carga: 12, leituras: [] })
    expect(plano(m).avisos).toEqual([])
    // Múltiplas faixas: "faixa"
    m.balanca = { ...m.balanca!, tipoFaixas: 'MULTIPLAS_FAIXAS' }
    m.calibracao.repetibilidade = [{ id: 'r1', carga: 16.5, leituras: [] }]
    expect(plano(m).avisos.join(' ')).toMatch(
      /^Repetibilidade: falta ensaio nas faixas até 6 kg e até 15 kg \(o POP pede um em cada faixa/,
    )
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
    expect(p.faixaAceitavel).toEqual({
      criterio: 'PORTARIA_SERVICO',
      toleranciaCliente: 0,
      daConformidade: false,
      toleranciaPendente: false,
    })
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

describe('planoDaFolha: padrões que vão a campo e tolerância do cliente ainda não informada', () => {
  it('com todos os padrões ativos previstos (sem calibração anterior), inteiros só os que o plano usa e um termo-higrômetro', () => {
    const p = plano(folhaMultiIntervalo())
    expect(p.padroes.map((x) => [x.padrao.identificacao, x.naFolha])).toEqual([
      ['BR-01', false],
      ['JP-01', true],
      ['JP-05', false],
      ['PP20-01 a 15', true],
      ['PP500-01 a 20', false],
      ['TH-01', true],
    ])
    // Vencido só avisa quando vai a campo
    const d = folhaMultiIntervalo()
    d.padroes = d.padroes.map((x) =>
      x.identificacao === 'PP500-01 a 20' || x.identificacao === 'TH-01' ? { ...x, validade: '2026-01-10' } : x,
    )
    const q = plano(d)
    expect(q.padroes.find((x) => x.padrao.identificacao === 'PP500-01 a 20')).toMatchObject({
      situacao: 'VENCIDO',
      naFolha: false,
    })
    expect(q.avisos.filter((a) => /vencida/.test(a))).toEqual(['TH-01: calibração vencida em 10/01/2026.'])
  })

  it('dois termo-higrômetros: vai o que está em dia; outro instrumento escolhido no rascunho vai sempre', () => {
    const d = folhaPlataforma()
    const th = d.padroes.find((x) => x.tipo === 'TERMOHIGROMETRO')!
    const vencido = { ...th, id: 'th-velho', identificacao: 'TH-00', validade: '2025-01-01' }
    const outro = { ...th, id: 'trena', tipo: 'OUTRO' as const, identificacao: 'TR-01', descricao: 'Trena' }
    d.padroes = [vencido, ...d.padroes, outro]
    d.calibracao = { ...d.calibracao!, padroesIds: d.padroes.map((x) => x.id) }
    const p = plano(d)
    expect(p.padroes.filter((x) => x.naFolha).map((x) => x.padrao.identificacao)).toEqual([
      'PP20-01 a 15',
      'JP-01',
      'TH-01',
      'TR-01',
    ])
    expect(p.avisos.join(' ')).not.toMatch(/TH-00/)
    // O barômetro (pressão opcional, fora do cálculo) fica na linha dos outros, mesmo vindo do último certificado
    expect(plano(folhaRodoviaria()).padroes.map((x) => [x.padrao.identificacao, x.naFolha])).toEqual([
      ['PP500-01 a 20', true],
      ['TH-01', true],
      ['BR-01', false],
    ])
  })

  it('tolerância do cliente pedida mas ainda 0: a faixa para decidir o ajuste é a do EMA em serviço (com classe)', () => {
    const d = folhaPlataforma()
    d.calibracao = {
      ...d.calibracao!,
      conformidade: { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0, regra: 'SIMPLES' },
    }
    const p = plano(d)
    expect(p.conformidade).toMatchObject({ criterio: 'CLIENTE', toleranciaCliente: 0 })
    expect(p.faixaAceitavel).toEqual({
      criterio: 'PORTARIA_SERVICO',
      toleranciaCliente: 0,
      daConformidade: false,
      toleranciaPendente: true,
    })
    expect(p.pontos.find((x) => x.carga === 300)?.ema).toBe(0.2)
    // Sem classe, não há faixa (a tolerância é escrita no local)
    expect(plano({ ...d, balanca: { ...d.balanca!, classe: '' } }).faixaAceitavel).toBeNull()
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

  it('classe I sem escolha: só os jogos E1, E2 e F1, e com os "outro" (o termômetro de 2 entradas), como no POST', () => {
    const d = folhaClasseI()
    const m1 = { ...folhaEmBranco().padroes[1], id: 'pad-m1' }
    const todos = [...d.padroes, m1]
    expect(padroesPrevistos(null, todos, 'I').map((p) => p.identificacao)).toEqual(['JE2-01', 'TH-01', 'BR-01', 'TD-01'])
    // Nas outras classes, como sempre: os ativos menos "outro"
    expect(padroesPrevistos(null, todos, 'III').map((p) => p.identificacao)).toEqual(['JE2-01', 'TH-01', 'BR-01', 'JP-01'])
    // A folha da balança classe I sem rascunho também leva o TD-01 no passo 1
    const semRascunho = planoDaFolha(null, d.balanca!, todos, '2026-10-26')
    expect(semRascunho.padroes.filter((x) => x.naFolha).map((x) => x.padrao.identificacao)).toContain('TD-01')
    expect(semRascunho.padroes.map((x) => x.padrao.identificacao)).not.toContain('JP-01')
  })
})

describe('planoDaFolha: balança classe I', () => {
  it('sem histórico: 10 leituras na repetibilidade (POP, Tabela 4), o barômetro e o termômetro de 2 entradas a campo', () => {
    const p = plano(folhaClasseI())
    expect(p.origem).toBe('SUGESTAO')
    expect(LEITURAS_CLASSE_I).toBe(10)
    expect(p.repetibilidade).toEqual([expect.objectContaining({ leituras: 10, minimo: 10 })])
    // Pontos das sugestões, com Min (10 mg) e as cargas em que o EMA muda (50 000 e e 200 000 e); os ~25 e 75 % em
    // múltiplos de 10 g, montados sem peça menor que 10 g e dentro de 1/3 do EMA (POP 6.1; só a Min pede peça
    // pequena): 160 g, e não 170 g = 100 g + 50 g + 20 g
    expect(p.pontos.map((x) => x.carga)).toEqual([0, 0.01, 50, 60, 110, 160, 200, 220])
    expect(p.pontos.every((x) => x.falta === 0)).toBe(true)
    expect(p.pontos.map((x) => x.pesos)).toEqual([
      '',
      '10 mg',
      '50 g',
      '50 g + 10 g',
      '100 g + 10 g',
      '100 g + 50 g + 10 g',
      '200 g',
      '200 g + 20 g',
    ])
    // Pressão obrigatória: o barômetro vai inteiro na lista; o termômetro de 2 entradas ("outro") também
    const naFolha = p.padroes.filter((x) => x.naFolha).map((x) => x.padrao.identificacao)
    expect(naFolha).toEqual(['JE2-01', 'TH-01', 'BR-01', 'TD-01'])
    // Pesos E2: até 1 °C de diferença pesos − ar para começar (POP 7.4)
    expect(p.limiteDeltaTPesos).toBe(1)
    expect(p.avisos).toEqual([])
    // POP 7.7, 7.10 e 7.11: cargas com descarga; repetibilidade e excentricidade com uma peça só, a da
    // excentricidade de no mínimo 1/3 de Max, pelo método 3
    expect([p.metodoComoEncontrado, p.metodo]).toEqual(['DESCONTINUO', 'DESCONTINUO'])
    expect(p.repetibilidade[0]).toMatchObject({ carga: 200, pesos: '200 g', falta: 0 })
    expect(p.excentricidade).toMatchObject({ aplicavel: true, metodo: 3, carga: 100, pesos: '100 g', falta: 0 })
  })

  it('o plano da balança de 220 g com o jogo E2 da amostra: o cálculo não dá "Classe dos pesos insuficiente" (POP 6.1)', () => {
    const d = folhaClasseI()
    const p = plano(d)
    // O técnico mede as cargas da folha, com as peças impressas (aqui, leituras sem erro), no "como encontrado" e
    // no ensaio final
    const pontos = p.pontos.map((x, i) => ({
      id: `p${i}`,
      carga: x.carga,
      pecas: x.pecas,
      pecasManuais: false,
      crescente: x.carga,
      decrescente: null,
      nivelSubstituicao: 0,
    }))
    const ensaio = { metodo: p.metodo, pontos, retornoZero: 0, substituicao: { ativa: false, pecas: [], etapas: [] } }
    const exemplo = exemploClasseI()
    const k = { ...exemplo.calibracao, padroesIds: d.calibracao!.padroesIds, indicacao: ensaio, comoEncontrado: ensaio }
    const r = calcularCalibracao(k, d.balanca!, d.padroes)
    const avisos = [...r.resultado.avisos, ...(r.comoEncontrado?.avisos ?? [])].map((a) => a.mensagem)
    expect(r.comoEncontrado).not.toBeNull()
    expect(avisos.join('\n')).not.toMatch(/Classe dos pesos insuficiente/)
    expect(p.avisos).toEqual([])
    // O ponto de sempre (170 g = 100 g + 50 g + 20 g) daria o aviso: Σ EMA E2 de 0,34 mg > 1/3 de 1 mg
    const com170 = pontos.map((x) =>
      x.carga === 160 ? { ...x, carga: 170, crescente: 170, pecas: montarCarga(170, 'g', d.padroes).pecas } : x,
    )
    const r170 = calcularCalibracao(
      { ...k, indicacao: { ...ensaio, pontos: com170 }, comoEncontrado: null },
      d.balanca!,
      d.padroes,
    )
    expect(r170.resultado.avisos.map((a) => a.mensagem).join('\n')).toMatch(/Classe dos pesos insuficiente em 170,0000 g/)
    // A tela ("Sugerir pontos") sugere as mesmas cargas
    expect(
      pontosSugeridos(
        d.balanca!,
        d.padroes.filter((x) => x.tipo === 'PESOS'),
      ),
    ).toEqual(p.pontos.map((x) => x.carga))
  })

  it('classe I: cargas pelo jogo previsto (E1: 170 g atende) e aviso nas que passam de 1/3 do EMA (rascunho, Max)', () => {
    const d = folhaClasseI()
    const comClasse = (classe: Padrao['classe']) => ({
      ...d,
      padroes: d.padroes.map((x) => (x.tipo === 'PESOS' ? { ...x, classe } : x)),
    })
    // Com E1, o mais próximo de 165 g (170 g = 100 g + 50 g + 20 g: 0,105 mg) já atende
    const e1 = plano(comClasse('E1'))
    expect(e1.pontos.map((x) => x.carga)).toEqual([0, 0.01, 50, 60, 110, 170, 200, 220])
    expect(e1.avisos).toEqual([])
    // Rascunho com 170 g (de um certificado antigo, ou digitado) e o jogo E2: a folha avisa antes de sair
    const rascunho = folhaClasseI()
    rascunho.calibracao!.indicacao.pontos = [0, 50, 110, 170, 220].map((carga, i) => ({
      id: `r${i}`,
      carga,
      pecas: [],
      pecasManuais: false,
      crescente: null,
      decrescente: null,
      nivelSubstituicao: 0,
    }))
    const aviso =
      'Os pesos previstos não atendem a 6.1 do POP na carga de 170 g: a soma dos EMA das peças passa de 1/3 do EMA da balança. Leve pesos de classe melhor (E1) ou mude a carga no sistema.'
    expect(plano(rascunho).avisos).toContain(aviso)
    // Max de 320 g (e = 1 mg): 320 g = 200 g + 100 g + 20 g dá 0,54 mg > 0,5 mg; as outras cargas atendem
    const b320 = { ...d, balanca: { ...d.balanca!, faixas: [{ max: 320, e: 0.001, d: 0.0001 }] } }
    const p320 = plano(b320)
    expect(p320.pontos.map((x) => x.carga)).toEqual([0, 0.01, 50, 80, 160, 200, 240, 320])
    expect(p320.avisos).toEqual([aviso.replace('170 g', '320 g')])
    // Jogo sem classe: não dá para conferir (o cálculo também não confere); nas outras classes, sem esse aviso
    expect(plano({ ...rascunho, padroes: comClasse('').padroes }).avisos.join('\n')).not.toMatch(/6\.1 do POP/)
    expect(plano({ ...rascunho, balanca: { ...d.balanca!, classe: 'II' } }).avisos.join('\n')).not.toMatch(/6\.1 do POP/)
  })

  it('sem rascunho (folha da balança antes do POST): os mesmos métodos e cargas da classe I', () => {
    const d = folhaClasseI()
    const p = planoDaFolha(null, d.balanca!, d.padroes, '2026-10-26')
    expect([p.metodoComoEncontrado, p.metodo]).toEqual(['DESCONTINUO', 'DESCONTINUO'])
    expect(p.excentricidade).toMatchObject({ metodo: 3, carga: 100, pesos: '100 g' })
    expect(p.repetibilidade[0]).toMatchObject({ carga: 200, pesos: '200 g', leituras: 10 })
    // Nas outras classes, como sempre
    const ii = planoDaFolha(null, { ...d.balanca!, classe: 'II' }, d.padroes, '2026-10-26')
    expect([ii.metodo, ii.excentricidade.metodo, ii.excentricidade.carga, ii.repetibilidade[0].carga]).toEqual([
      'CRESCENTE_DECRESCENTE',
      1,
      75,
      110,
    ])
  })

  it('rascunho copiado de um certificado antigo com outro método de excentricidade: aviso para acertar no sistema', () => {
    const d = folhaClasseI()
    d.calibracao!.excentricidade = { ...d.calibracao!.excentricidade, metodo: 1 }
    const p = plano(d)
    expect(p.excentricidade.metodo).toBe(1)
    expect(p.avisos).toContain(
      'Excentricidade: na classe I, o POP pede o método 3 (zera antes de cada posição); acerte no sistema.',
    )
    // Nas outras classes, o método 1 é o padrão: sem aviso
    expect(plano({ ...d, balanca: { ...d.balanca!, classe: 'II' } }).avisos.join('\n')).not.toMatch(/método 3/)
  })

  it('rascunho com menos de 10 leituras: a folha prevê 10 (o mínimo da classe I)', () => {
    const d = folhaClasseI()
    d.calibracao!.repetibilidade = [{ id: 'r1', carga: 100, leituras: [null, null, null, null, null] }]
    expect(plano(d).repetibilidade).toEqual([expect.objectContaining({ carga: 100, leituras: 10, minimo: 10 })])
    // Com mais de 10 no rascunho, as do rascunho
    d.calibracao!.repetibilidade[0].leituras = Array(12).fill(null)
    expect(plano(d).repetibilidade[0]).toMatchObject({ leituras: 12, minimo: 10 })
  })

  it('limite da diferença pesos − ar: 3 °C só com todos os jogos F1; nas outras classes, nenhum', () => {
    const d = folhaClasseI()
    const comClasse = (classe: Padrao['classe']) =>
      plano({ ...d, padroes: d.padroes.map((x) => (x.tipo === 'PESOS' ? { ...x, classe } : x)) }).limiteDeltaTPesos
    expect(comClasse('F1')).toBe(3)
    expect(comClasse('E1')).toBe(1)
    expect(comClasse('')).toBe(1)
    // Um jogo E2 e um F1: o mais exigente
    const f1: Padrao = { ...d.padroes[0], id: 'pad-f1', identificacao: 'JF1-01', classe: 'F1' }
    const ambos = {
      ...d,
      padroes: [...d.padroes, f1],
      calibracao: { ...d.calibracao!, padroesIds: [...d.calibracao!.padroesIds, f1.id] },
    }
    expect(plano(ambos).limiteDeltaTPesos).toBe(1)
    // Classe III (e II): sem limite de pesos × ar; repetibilidade como antes
    expect(plano(folhaPlataforma()).limiteDeltaTPesos).toBeNull()
    expect(plano({ ...d, balanca: { ...d.balanca!, classe: 'II' } }).limiteDeltaTPesos).toBeNull()
    expect(plano({ ...d, balanca: { ...d.balanca!, classe: 'II' } }).repetibilidade[0]).toMatchObject({ leituras: 5, minimo: 5 })
  })
})

describe('referência do formulário', () => {
  it('o POP configurado (sem ele, nada): nunca mais o PT-CAL-01 fixo', () => {
    expect(referenciaDoFormulario('BALANÇAS-POP-123 rev. 00')).toBe('POP BALANÇAS-POP-123 rev. 00')
    expect(referenciaDoFormulario('  BALANÇAS-POP-123 rev. 01 ')).toBe('POP BALANÇAS-POP-123 rev. 01')
    // O código que já começa com POP não repete a palavra
    expect(referenciaDoFormulario('POP-CAL-01 rev. 00')).toBe('POP-CAL-01 rev. 00')
    expect(referenciaDoFormulario('pop 12 rev. 3')).toBe('pop 12 rev. 3')
    expect(referenciaDoFormulario('POPULAR-01 rev. 0')).toBe('POP POPULAR-01 rev. 0')
    for (const vazio of ['', '   ', null, undefined]) expect(referenciaDoFormulario(vazio)).toBe('')
    expect(JSON.stringify(FORMULARIO_FOLHA_CAMPO)).not.toContain('PT-CAL-01')
    // Layout novo (folha enxuta): revisão nova do formulário controlado
    expect(FORMULARIO_FOLHA_CAMPO.revisao).toBe('01')
  })
})

describe('AVISO_ETIQUETA', () => {
  it('diz para copiar o nº no campo da etiqueta e deixar a validade para o cliente, numa frase curta', () => {
    expect(AVISO_ETIQUETA).toContain('etiqueta de calibração (campo CERTIFICADO Nº)')
    expect(AVISO_ETIQUETA).toContain('A VALIDADE DA CALIBRAÇÃO fica em branco: é preenchida pela qualidade do cliente.')
    // Uma linha na folha (≈ 150 caracteres a 7 pt)
    expect(AVISO_ETIQUETA.length).toBeLessThanOrEqual(150)
  })
})

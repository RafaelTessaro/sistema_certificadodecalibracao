import { describe, expect, it } from 'vitest'
import {
  avisosBalanca,
  BALANCA_VAZIA,
  capacidadeTexto,
  converterMassa,
  descricaoBalanca,
  errosUnidadeBalanca,
  massaNaUnidadeLegivel,
  normalizarBalanca,
  parteSeparada,
  semIndicadorLegado,
  textoBuscaBalanca,
  unidadeDivisaoPadrao,
  unidadeDivisaoSugerida,
  unidadeLegivel,
} from './dominio.ts'
import type { Balanca } from './tipos.ts'

describe('converterMassa', () => {
  it('converte entre mg, g, kg e t sem ruído binário', () => {
    expect(converterMassa(2, 'g', 'kg')).toBe(0.002)
    expect(converterMassa(5, 'g', 'kg')).toBe(0.005)
    expect(converterMassa(10, 'g', 'kg')).toBe(0.01)
    expect(converterMassa(0.002, 'kg', 'g')).toBe(2)
    expect(converterMassa(0.1, 'kg', 'g')).toBe(100)
    expect(converterMassa(6000, 'g', 'kg')).toBe(6)
    expect(converterMassa(33, 'kg', 'g')).toBe(33000)
    expect(converterMassa(0.3, 'g', 'mg')).toBe(300)
    expect(converterMassa(80, 't', 'kg')).toBe(80000)
    expect(converterMassa(1, 'mg', 't')).toBe(1e-9)
    expect(converterMassa(0.07, 'kg', 'kg')).toBe(0.07)
  })

  it('ida e volta devolve o mesmo número', () => {
    for (const v of [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 1.5, 6, 15, 33, 0.07, 123.456]) {
      expect(converterMassa(converterMassa(v, 'kg', 'g'), 'g', 'kg')).toBe(v)
      expect(converterMassa(converterMassa(v, 'g', 'mg'), 'mg', 'g')).toBe(v)
    }
  })
})

describe('unidade legível das divisões', () => {
  it('padrão sem valores: uma unidade abaixo para kg e t', () => {
    expect(unidadeDivisaoPadrao('kg')).toBe('g')
    expect(unidadeDivisaoPadrao('t')).toBe('kg')
    expect(unidadeDivisaoPadrao('g')).toBe('g')
    expect(unidadeDivisaoPadrao('mg')).toBe('mg')
    expect(unidadeLegivel([], 'kg')).toBe('g')
    expect(unidadeLegivel([0], 'kg')).toBe('g')
  })

  it('sugestão para e e d pelo tipo e pela capacidade', () => {
    expect(unidadeDivisaoSugerida('kg', 'BALCAO', 30)).toBe('g')
    expect(unidadeDivisaoSugerida('kg', 'PLATAFORMA', 300)).toBe('g')
    // Piso, rodoviária, ferroviária e transpaleteira: e = 0,5 a 50 kg
    expect(unidadeDivisaoSugerida('kg', 'RODOVIARIA')).toBe('kg')
    expect(unidadeDivisaoSugerida('kg', 'PISO')).toBe('kg')
    // Qualquer tipo com 1 t ou mais
    expect(unidadeDivisaoSugerida('kg', 'PLATAFORMA', 80000)).toBe('kg')
    expect(unidadeDivisaoSugerida('kg', 'OUTRA', 1000)).toBe('kg')
    expect(unidadeDivisaoSugerida('t', 'RODOVIARIA', 80)).toBe('kg')
    expect(unidadeDivisaoSugerida('g', 'ANALITICA', 220)).toBe('g')
    // Tipos que não chegam a 1 t: Max de 1 000 kg ou mais é engano (33 000 digitado no lugar de 33), e/d ficam em g
    expect(unidadeDivisaoSugerida('kg', 'BALCAO', 33000)).toBe('g')
    expect(unidadeDivisaoSugerida('kg', 'PRECISAO', 6000)).toBe('g')
  })

  it('com valores, a maior unidade em que o menor deles fica ≥ 1', () => {
    expect(unidadeLegivel([0.002, 0.005, 0.01], 'kg')).toBe('g')
    expect(unidadeLegivel([20], 'kg')).toBe('kg')
    expect(unidadeLegivel([0.0005], 'kg')).toBe('mg')
    expect(massaNaUnidadeLegivel(0.1, 'kg')).toBe('100 g')
    expect(massaNaUnidadeLegivel(400, 'kg')).toBe('400 kg')
  })
})

describe('balança 6/15/33 kg × 2/5/10 g (multi-intervalo)', () => {
  const b = {
    ...BALANCA_VAZIA,
    clienteId: 'c1',
    unidade: 'kg' as const,
    tipoFaixas: 'MULTI_INTERVALO' as const,
    faixas: [
      { max: 6, e: 0.002, d: 0.002 },
      { max: 15, e: 0.005, d: 0.005 },
      { max: 33, e: 0.01, d: 0.01 },
    ],
  }

  it('sai como na plaqueta: Max em kg e d em g', () => {
    expect(capacidadeTexto(b)).toBe('6/15/33 kg × 2/5/10 g')
    expect(descricaoBalanca({ ...b, tipo: 'BALCAO', fabricante: 'Toledo', modelo: 'Prix 4' })).toBe(
      'Balança de balcão / bancada Toledo Prix 4 — 6/15/33 kg × 2/5/10 g',
    )
  })

  it('n = Max/e dentro da classe III: sem avisos', () => {
    expect(avisosBalanca({ ...b, classe: 'III' })).toEqual([])
    expect(avisosBalanca({ ...b, classe: 'III', tipo: 'BALCAO' })).toEqual([])
  })

  it('o hábito de digitar em g com o Max em kg (6000/15 000/33 000 kg) numa balança de balcão: aviso', () => {
    // Max digitado como 6000/15000/33000 com a coluna em kg; e e d também em kg (n continua válido)
    const engano = {
      ...b,
      classe: 'III' as const,
      faixas: b.faixas.map((f) => ({ max: f.max * 1000, e: f.e * 1000, d: f.d * 1000 })),
    }
    const avisos = avisosBalanca({ ...engano, tipo: 'BALCAO' }).map((a) => a.replace(/\s/g, ' '))
    expect(avisos).toEqual([
      'Max de 33 000 kg numa balança de balcão / bancada? Se a plaqueta diz 33 kg, digite 33 com o Max em kg.',
    ])
    // Numa rodoviária (ou sem o tipo), 33 t é normal
    expect(avisosBalanca({ ...engano, tipo: 'RODOVIARIA' })).toEqual([])
    expect(avisosBalanca(engano)).toEqual([])
    // A mesma balança gravada em g não engana: 33 000 g = 33 kg
    const emG = { ...b, unidade: 'g' as const, classe: 'III' as const, tipo: 'BALCAO' as const }
    expect(avisosBalanca({ ...emG, faixas: b.faixas.map((f) => ({ max: f.max * 1000, e: f.e * 1000, d: f.d * 1000 })) })).toEqual(
      [],
    )
  })

  it('a mesma balança gravada em g dá o mesmo texto de divisão', () => {
    const g = (v: number) => converterMassa(v, 'kg', 'g')
    const emG = { ...b, unidade: 'g' as const, faixas: b.faixas.map((f) => ({ max: g(f.max), e: g(f.e), d: g(f.d) })) }
    // numeroBr separa o milhar com espaço fino
    expect(capacidadeTexto(emG).replace(/\s/g, ' ')).toBe('6000/15 000/33 000 g × 2/5/10 g')
  })
})

describe('engano de unidade (impede gravar)', () => {
  const rodoviaria = { classe: 'III' as const, faixas: [{ max: 80000, e: 20, d: 20 }], min: 400 }

  it('rodoviária com os valores da plaqueta: sem erros', () => {
    expect(errosUnidadeBalanca(rodoviaria)).toEqual([])
    expect(normalizarBalanca({ ...BALANCA_VAZIA, clienteId: 'c1', ...rodoviaria }).erros).toEqual([])
  })

  it('e e d digitados em g (0,02 kg): n = 4 000 000 é erro, não só aviso', () => {
    const b = { ...rodoviaria, faixas: [{ max: 80000, e: 0.02, d: 0.02 }], min: 0.4 }
    const erros = errosUnidadeBalanca(b)
    expect(erros).toHaveLength(1)
    expect(erros[0]).toMatch(/\(e\).*n = Max\/e = 4\s000\s000.*Confira a unidade/)
    expect(normalizarBalanca({ ...BALANCA_VAZIA, clienteId: 'c1', ...b }).erros).toEqual(erros)
    // O aviso de n fora da classe não se repete
    expect(avisosBalanca({ ...BALANCA_VAZIA, ...b }).some((a) => a.includes('n = Max/e'))).toBe(false)
  })

  it('n fora da classe, mas não absurdo: continua só aviso', () => {
    const b = { ...rodoviaria, faixas: [{ max: 80000, e: 5, d: 5 }] }
    expect(errosUnidadeBalanca(b)).toEqual([])
    expect(avisosBalanca({ ...BALANCA_VAZIA, ...b }).map((a) => a.replace(/\s/g, ' '))).toContain(
      'n = Max/e = 16 000 está fora do intervalo da classe III.',
    )
    // Sem classe ou classe I: sem limite de n
    expect(errosUnidadeBalanca({ faixas: [{ max: 220, e: 0.0001, d: 0.0001 }], classe: 'I', min: 0.01 })).toEqual([])
    expect(errosUnidadeBalanca({ ...b, faixas: [{ max: 80000, e: 0.02, d: 0.02 }], classe: '', min: 0 })).toEqual([])
  })

  it('Min menor que e, ou não menor que Max: erro no Min', () => {
    expect(errosUnidadeBalanca({ ...rodoviaria, min: 0.4 })).toEqual([
      'A carga mínima (Min) é menor que a divisão e. Confira a unidade do Min (g ou kg).',
    ])
    expect(errosUnidadeBalanca({ classe: 'III', faixas: [{ max: 15, e: 0.005, d: 0.005 }], min: 100 })).toEqual([
      'A carga mínima (Min) precisa ser menor que a capacidade (Max). Confira a unidade do Min (g ou kg).',
    ])
    // Min = 0: não informado
    expect(errosUnidadeBalanca({ ...rodoviaria, min: 0 })).toEqual([])
  })
})

describe('indicador × plataforma', () => {
  const antigo = {
    ...BALANCA_VAZIA,
    clienteId: 'c1',
    fabricante: 'Toledo do Brasil',
    modelo: '2180',
    numeroSerie: '2180-0041273',
    indicadorFabricante: 'Toledo do Brasil',
    indicadorModelo: '9091',
    indicadorSerie: '9091-118832',
    faixas: [{ max: 300, e: 0.05, d: 0.05 }],
  }

  it('cadastro antigo: o indicador vira a identificação e a de antes vai para a plataforma', () => {
    const r = semIndicadorLegado(antigo) as Record<string, unknown>
    expect(r).toMatchObject({
      fabricante: 'Toledo do Brasil',
      modelo: '9091',
      numeroSerie: '9091-118832',
      plataformaFabricante: 'Toledo do Brasil',
      plataformaModelo: '2180',
      plataformaSerie: '2180-0041273',
    })
    expect(r).not.toHaveProperty('indicadorFabricante')
    expect(r).not.toHaveProperty('indicadorModelo')
    expect(r).not.toHaveProperty('indicadorSerie')
  })

  it('só o nº de série do indicador: a identificação de antes vai inteira para a plataforma', () => {
    const r = semIndicadorLegado({ ...antigo, indicadorFabricante: '', indicadorModelo: '' })
    expect(r).toMatchObject({
      // O fabricante, sem o do indicador, continua o mesmo; o modelo 2180 era o da plataforma
      fabricante: 'Toledo do Brasil',
      modelo: '',
      numeroSerie: '9091-118832',
      plataformaFabricante: 'Toledo do Brasil',
      plataformaModelo: '2180',
      plataformaSerie: '2180-0041273',
    })
  })

  it('indicador igual à identificação principal (digitado nos dois lugares): não inventa plataforma', () => {
    const repetido = {
      fabricante: 'Toledo',
      modelo: '9091',
      numeroSerie: 'IND-1',
      indicadorFabricante: 'toledo ',
      indicadorModelo: '9091',
      indicadorSerie: ' IND-1',
    }
    const r = semIndicadorLegado(repetido)
    expect(r).toEqual({
      fabricante: 'Toledo',
      modelo: '9091',
      numeroSerie: 'IND-1',
      plataformaFabricante: '',
      plataformaModelo: '',
      plataformaSerie: '',
    })
    expect(parteSeparada(r)).toBeNull()
    // Só uma parte do indicador preenchida, igual à principal: também não
    expect(parteSeparada(semIndicadorLegado({ ...repetido, indicadorFabricante: '', indicadorModelo: '' }))).toBeNull()
  })

  it('mesmo nº de série nos dois lugares e modelo diferente: a plataforma fica sem o nº de série repetido', () => {
    const r = semIndicadorLegado({ ...antigo, numeroSerie: '9091-118832' })
    expect(r).toMatchObject({
      modelo: '9091',
      numeroSerie: '9091-118832',
      plataformaFabricante: 'Toledo do Brasil',
      plataformaModelo: '2180',
      plataformaSerie: '',
    })
  })

  it('indicador sem nº de série: o nº de série principal fica onde está', () => {
    const r = semIndicadorLegado({
      fabricante: 'Fabricante Plataforma',
      numeroSerie: 'P-4',
      indicadorFabricante: 'Alfa',
      indicadorModelo: '3101C',
      indicadorSerie: '',
    })
    expect(r).toEqual({
      fabricante: 'Alfa',
      modelo: '3101C',
      numeroSerie: 'P-4',
      plataformaFabricante: '',
      plataformaModelo: '',
      plataformaSerie: '',
    })
  })

  it('sem indicador: só tira as chaves antigas e cria as da plataforma', () => {
    const r = semIndicadorLegado({ fabricante: 'Filizola', numeroSerie: 'FZ-1', indicadorFabricante: '', indicadorSerie: '  ' })
    expect(r).toEqual({
      fabricante: 'Filizola',
      numeroSerie: 'FZ-1',
      plataformaFabricante: '',
      plataformaModelo: '',
      plataformaSerie: '',
    })
  })

  it('formato novo (plataforma preenchida) não é mexido', () => {
    const novo = {
      fabricante: 'Toledo',
      modelo: '9091',
      numeroSerie: 'IND-1',
      plataformaFabricante: 'Toledo',
      plataformaModelo: '2180',
      plataformaSerie: 'PLAT-1',
    }
    expect(semIndicadorLegado(novo)).toEqual(novo)
    // Tela antiga aberta com o cadastro já migrado: manda a plataforma e o indicador vazio
    expect(semIndicadorLegado({ ...novo, indicadorFabricante: '', indicadorModelo: '', indicadorSerie: '' })).toEqual(novo)
  })

  it('normalizarBalanca aceita as chaves antigas (telas antigas, cópias) e grava no formato novo', () => {
    const { valor, erros } = normalizarBalanca(antigo)
    expect(erros).toEqual([])
    expect(valor.numeroSerie).toBe('9091-118832')
    expect(valor.modelo).toBe('9091')
    expect(valor.plataformaSerie).toBe('2180-0041273')
    expect(valor.plataformaModelo).toBe('2180')
    expect(valor).not.toHaveProperty('indicadorSerie')
  })

  it('normalizarBalanca no formato novo', () => {
    const { valor } = normalizarBalanca({
      ...BALANCA_VAZIA,
      clienteId: 'c1',
      numeroSerie: ' IND-9 ',
      plataformaSerie: ' P-1 ',
      faixas: [{ max: 30, e: 0.005, d: 0.005 }],
    })
    expect(valor.numeroSerie).toBe('IND-9')
    expect(valor.plataformaSerie).toBe('P-1')
    expect(valor.plataformaFabricante).toBe('')
  })

  it('parteSeparada: a plataforma no cadastro atual, o indicador nas cópias antigas', () => {
    expect(parteSeparada({ plataformaFabricante: '', plataformaModelo: '', plataformaSerie: '' })).toBeNull()
    expect(parteSeparada({ plataformaFabricante: 'Toledo', plataformaModelo: '2180', plataformaSerie: 'P-1' })).toEqual({
      rotulo: 'Plataforma',
      nome: 'Toledo 2180',
      serie: 'P-1',
    })
    // Cópia congelada de um certificado emitido com o cadastro antigo
    expect(parteSeparada(antigo as unknown as Balanca)).toEqual({
      rotulo: 'Indicador',
      nome: 'Toledo do Brasil 9091',
      serie: '9091-118832',
    })
  })

  it('a busca da balança inclui a plataforma', () => {
    const b = semIndicadorLegado(antigo) as unknown as Balanca
    const busca = textoBuscaBalanca(b)
    expect(busca).toContain('9091-118832')
    expect(busca).toContain('2180-0041273')
  })
})

describe('balança classe I: avisos do cadastro (R 76-1 3.4.2 e 3.4.4)', () => {
  const analitica = (e: number, d: number, max = 220) => ({
    ...BALANCA_VAZIA,
    unidade: 'g' as const,
    classe: 'I' as const,
    faixas: [{ max, e, d }],
  })

  it('e = 1 mg com d = 0,1 mg ou 0,01 mg é o normal da classe I (e = 100·d não é aviso)', () => {
    expect(avisosBalanca(analitica(0.001, 0.0001))).toEqual([])
    expect(avisosBalanca(analitica(0.001, 0.00001, 120)).filter((a) => a.includes('d ≤ e'))).toEqual([])
    // Em mg também
    expect(avisosBalanca({ ...analitica(1, 0.01, 120_000), unidade: 'mg' })).toEqual([])
  })

  it('d < 0,1 mg: n = Max/e pode ser menor que 50 000 (sem aviso pelo limite de baixo)', () => {
    // 120 g × 0,01 mg: n = 120 000 / e = 1 mg → 120 000 (dentro); 40 g × 0,01 mg: n = 40 000 (abaixo, mas permitido)
    expect(avisosBalanca(analitica(0.001, 0.00001, 40))).toEqual([])
    // Com d = 0,1 mg o limite de 50 000 continua valendo
    expect(avisosBalanca(analitica(0.001, 0.0001, 40)).map((a) => a.replace(/\s/g, ' '))).toEqual([
      'n = Max/e = 40 000 está fora do intervalo da classe I.',
    ])
  })

  it('as outras classes continuam como antes: e > 10·d é aviso', () => {
    // e = 1 mg com d = 0,01 mg (e = 100·d) na classe II: aviso como antes
    expect(avisosBalanca({ ...analitica(0.001, 0.00001, 120), classe: 'II' })).toContain('O normal é d ≤ e ≤ 10·d.')
    // Classe I com e diferente de 1 mg e d < e/10: aviso como antes
    expect(avisosBalanca(analitica(0.01, 0.0001, 2200))).toContain('O normal é d ≤ e ≤ 10·d.')
  })
})

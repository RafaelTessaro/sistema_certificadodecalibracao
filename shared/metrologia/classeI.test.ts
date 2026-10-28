// Balança classe I: empuxo com a densidade do ar medida (cg-18 7.1.2-4/5a), convecção dos pesos (7.1.2.4,
// Tabela F2.1), pendências e avisos próprios, e a regra da classe dos pesos com a incerteza (R 76-1 3.7.1).
// O "caso C" foi montado à mão (Rio Claro, 612 m: 941,5 hPa) e refeito à parte.

import { describe, expect, it } from 'vitest'
import type { OpcoesCalculo } from '../tipos.ts'
import { calcular } from './calculo.ts'
import type { ArCalculo, EntradaCalculo, Orcamento, PecaCalculo, TermicaCalculo } from './tipos.ts'

const OPCOES: OpcoesCalculo = {
  empuxo: 'MEDIDO',
  deltaTLocal: 0,
  deriva: 'KD',
  kD: 1.25,
  excentricidade: false,
  metodoK: 'T_EXATO',
  zeroAprovado: false,
  histerese: 'SEPARADO',
  divisaoTeste: 0,
  conveccao: 'CALCULAR',
}

const peca = (nominal: number, ema: number, extra: Partial<PecaCalculo> = {}): PecaCalculo => ({
  nominal,
  correcao: 0,
  incerteza: 0,
  k: 2,
  ema,
  usarCertificado: true,
  quantidade: 1,
  classe: 'E2',
  densidade: 7950,
  uDensidade: 70,
  ...extra,
})
const P200 = peca(200, 0.0003, { correcao: 0.0001, incerteza: 0.0001 })

const RIO_CLARO: ArCalculo = { temperatura: 23, umidade: 60, pressao: 941.5, ajustadaAntes: false }

function entrada(
  pontos: Array<[carga: number, pecas: PecaCalculo[], leitura: number]>,
  opcoes: Partial<OpcoesCalculo> = {},
  extra: { ar?: ArCalculo | null; termica?: TermicaCalculo | null; classe?: 'I' | 'II' | 'III'; e?: number } = {},
): EntradaCalculo {
  const { classe = 'I', e = 0.001, ...resto } = extra
  return {
    instrumento: { unidade: 'g', classe, tipoFaixas: 'UNICA', faixas: [{ max: 220, e, d: 0.0001 }] },
    opcoes: { ...OPCOES, ...opcoes },
    repetibilidade: [{ id: 'r', carga: 100, leituras: Array.from({ length: 10 }, (_, i) => (i % 2 ? 100.0001 : 100)) }],
    excentricidade: { aplicavel: false, carga: 0, metodo: 1, posicoes: [] },
    indicacao: {
      metodo: 'DESCONTINUO',
      retornoZero: null,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: pontos.map(([carga, pecas, crescente]) => ({
        id: String(carga),
        carga,
        pecas,
        crescente,
        decrescente: null,
        nivelSubstituicao: 0,
      })),
    },
    conformidade: { solicitada: false, criterio: 'OIML_INICIAL', toleranciaCliente: 0, regra: 'SIMPLES' },
    ar: RIO_CLARO,
    termica: { deltaT: 0.4, aclimatacao: null },
    ...resto,
  }
}

const casoC = (opcoes: Partial<OpcoesCalculo> = {}, extra: Parameters<typeof entrada>[2] = {}) =>
  calcular(entrada([[200, [P200], 200.0003]], opcoes, extra))
const orc = (r: ReturnType<typeof calcular>, i = 0): Orcamento => {
  const o = r.pontos[i].crescente
  expect(o).not.toBeNull()
  return o!
}
function perto(real: number, esperado: number, rel: number, rotulo: string) {
  expect(Math.abs(real - esperado) / Math.abs(esperado), `${rotulo}: obtido ${real}, esperado ${esperado}`).toBeLessThanOrEqual(
    rel,
  )
}
const mensagens = (r: ReturnType<typeof calcular>) => r.avisos.map((a) => `${a.nivel}: ${a.mensagem}`)

describe('caso C: 200 g E2 numa balança 220 g × 0,1 mg em Rio Claro', () => {
  it('densidade do ar medida (A3-2 com 10 K) e convecção a 0,4 °C', () => {
    const r = casoC()
    expect(r.ar?.densidade).toBeCloseTo(1.100448, 6)
    perto(r.ar!.incerteza, 0.017048, 1e-4, 'u(ρa)')
    const o = orc(r)
    perto(o.correcaoEmpuxo, 0.000015653, 1e-4, 'δm_B')
    expect(o.referencia).toBeCloseTo(200.000115653, 9)
    perto(o.uMassa, 0.00005, 1e-9, 'u(δm_c)')
    perto(o.uDeriva, 0.000072169, 1e-4, 'u(δm_D)')
    perto(o.uEmpuxo, 0.000022214, 1e-4, 'u(δm_B)')
    perto(o.uConveccao, 0.00008 / Math.sqrt(3), 1e-9, 'u(δm_conv)') // 0,08 mg (200 g, coluna 1 K)
    perto(o.uReferencia, 0.00010166, 1e-4, 'u(m_ref)')
    perto(o.uIndicacao, 0.000066667, 1e-4, 'u(I)')
    perto(o.uCombinada, 0.00012157, 1e-4, 'u(E)')
    perto(o.nuEff, 254.8, 1e-3, 'ν_eff')
    perto(o.k, 2.0099, 1e-4, 'k')
    perto(o.U, 0.00024435, 1e-4, 'U')
    expect(r.pontos[0].texto.erroCrescente).toBe('0,00018')
    expect(r.pontos[0].texto.U).toBe('0,00024')
    expect(r.pendencias).toEqual([])
    expect(mensagens(r).join('\n')).not.toMatch(/densidade do ar|Convecção|faixa parcial.*ar/)
  })

  it('logo após o ajuste (situação B): u(ρa) pelas medições (A3-1)', () => {
    const r = casoC({}, { ar: { ...RIO_CLARO, ajustadaAntes: true } })
    perto(r.ar!.incerteza, 0.003163, 1e-3, 'u(ρa)')
    perto(orc(r).uEmpuxo, 0.000022057, 1e-4, 'u(δm_B)')
    perto(orc(r).U, 0.00024429, 1e-4, 'U')
  })

  it('D3: ΔT pesos − ar de 0,0 °C ainda soma a convecção da coluna de 1 K (conservador)', () => {
    const zero = casoC({}, { termica: { deltaT: 0, aclimatacao: null } })
    perto(orc(zero).uConveccao, 0.00008 / Math.sqrt(3), 1e-9, 'u(δm_conv) a 0,0 °C')
    perto(orc(zero).U, 0.00024435, 1e-4, 'U')
    expect(zero.pontos[0].texto.U).toBe('0,00024')
    // Sem a convecção, U cairia para 0,000 226 43 ("0,00023")
    const sem = casoC({ conveccao: 'NAO_CONSIDERAR' })
    expect(orc(sem).uConveccao).toBe(0)
    perto(orc(sem).U, 0.00022643, 1e-4, 'U sem convecção')
  })

  it('o mesmo ponto com o empuxo estimado (5d e 5c), como o motor sempre fez', () => {
    const nao = casoC({ empuxo: 'NAO_AJUSTADO', conveccao: 'NAO_CONSIDERAR' })
    perto(orc(nao).uEmpuxo, 0.0017754, 1e-4, 'u(δm_B) 5d')
    perto(orc(nao).U, 0.0035575, 1e-4, 'U 5d')
    expect(nao.pontos[0].texto.U).toBe('0,0036')
    expect(orc(nao).correcaoEmpuxo).toBe(0)
    expect(orc(nao).referencia).toBe(200.0001)
    const aj = casoC({ empuxo: 'AJUSTADO', conveccao: 'NAO_CONSIDERAR' })
    perto(orc(aj).uEmpuxo, 0.000043301, 1e-4, 'u(δm_B) 5c')
    perto(orc(aj).U, 0.00023818, 1e-4, 'U 5c')
  })

  it('aclimatação: o ΔT estimado pela Tabela F1.3 vai para a Tabela F2.1', () => {
    // 200 g, de 5 °C, 60 min: 5 → 3 K em 31,7 min; 3 → 2 K precisa de mais 27,3 (59,0 no total) → 2 K → 0,14 mg
    const r = casoC({}, { termica: { deltaT: null, aclimatacao: { deltaT0: 5, minutos: 60 } } })
    perto(orc(r).uConveccao, 0.00014 / Math.sqrt(3), 1e-9, 'u(δm_conv)')
    // O ΔT medido vale mais que a aclimatação
    const medido = casoC({}, { termica: { deltaT: 0.4, aclimatacao: { deltaT0: 5, minutos: 60 } } })
    perto(orc(medido).uConveccao, 0.00008 / Math.sqrt(3), 1e-9, 'u(δm_conv) medido')
  })
})

describe('pendências da classe I (bloqueiam a emissão)', () => {
  it('densidade do ar medida sem a umidade: pendência e, na tela, a estimativa 5d', () => {
    const r = casoC({}, { ar: { ...RIO_CLARO, umidade: null } })
    expect(r.pendencias).toContain(
      'Empuxo pela densidade do ar medida: registre a temperatura, a umidade relativa e a pressão atmosférica (etapa Padrões e ambiente).',
    )
    expect(r.ar).toBeNull()
    expect(orc(r).correcaoEmpuxo).toBe(0)
    perto(orc(r).uEmpuxo, 0.0017754, 1e-4, 'u(δm_B) 5d de reserva')
    expect(casoC({}, { ar: null }).pendencias[0]).toMatch(/^Empuxo pela densidade do ar medida/)
  })

  it('convecção sem o ΔT pesos − ar nem a aclimatação; peça F2 não pede ΔT', () => {
    const r = casoC({}, { termica: null })
    expect(r.pendencias).toEqual([
      'Convecção: registre a diferença de temperatura entre os pesos e o ar antes do 1º ensaio, ou a aclimatação dos pesos (etapa Padrões e ambiente).',
    ])
    expect(orc(r).uConveccao).toBe(0)
    const f2 = calcular(entrada([[200, [peca(200, 0.003, { classe: 'F2', incerteza: 0.001 })], 200.0003]], {}, { termica: null }))
    expect(f2.pendencias).toEqual([])
    expect(orc(f2).uConveccao).toBe(0)
    // Peça de classe desconhecida entra (conservador)
    expect(
      calcular(entrada([[200, [peca(200, 0.0003, { classe: '' })], 200.0003]], {}, { termica: null })).pendencias,
    ).toHaveLength(1)
  })

  it('ΔT acima de 20 °C: fora da Tabela F2.1', () => {
    expect(casoC({}, { termica: { deltaT: 25, aclimatacao: null } }).pendencias).toEqual([
      'Convecção: diferença de temperatura acima de 20 °C ou peça acima de 50 kg, fora da Tabela F2.1 do cg-18; aguarde a aclimatação e meça de novo.',
    ])
  })

  describe('densidade dos pesos no empuxo pela densidade do ar medida (o motor confere, em todo ensaio)', () => {
    const SEM =
      'Empuxo pela densidade do ar medida: o jogo JP-E2 está sem a densidade ou a incerteza da densidade (cadastro do padrão).'
    const com = (extra: Partial<PecaCalculo>, leitura: number | null = 200.0003, opcoes: Partial<OpcoesCalculo> = {}) =>
      calcular(entrada([[200, [{ ...P200, jogo: 'JP-E2', ...extra }], leitura as number]], opcoes))
    /** O mesmo ponto com ρc = 8 000 kg/m³ e u(ρ) = 300 kg/m³ (o que o motor usa sem uma densidade confiável). */
    const referencia = () => orc(com({ densidade: 8000, uDensidade: 300 }))

    it('sem densidade (ρ = 0) ou sem u(ρ): pendência, e o cálculo da tela com ρc e u(ρ) = 300 kg/m³', () => {
      const r = com({ densidade: 0, uDensidade: 0 })
      expect(r.pendencias).toEqual([SEM])
      expect(orc(r).correcaoEmpuxo).toBe(0)
      expect(orc(r).uEmpuxo).toBeCloseTo(referencia().uEmpuxo, 15)
      // Com ρ e sem u(ρ), ou registro antigo sem os campos: a mesma pendência
      expect(com({ uDensidade: 0 }).pendencias).toEqual([SEM])
      expect(com({ densidade: undefined, uDensidade: undefined }).pendencias).toEqual([SEM])
    })

    it('ρ = 7,95 (g/cm³ digitado como kg/m³): pendência, e na tela nada da correção de +2,5 g', () => {
      const r = com({ densidade: 7.95, uDensidade: 0.035 })
      expect(r.pendencias).toEqual([
        'Empuxo pela densidade do ar medida: o jogo JP-E2 está com densidade de 7,95 kg/m³, fora da faixa dos pesos; confira a unidade no cadastro do padrão (7,95 g/cm³ = 7 950 kg/m³).',
      ])
      expect(orc(r).correcaoEmpuxo).toBe(0)
      expect(orc(r).uEmpuxo).toBeCloseTo(referencia().uEmpuxo, 15)
      expect(orc(r).referencia).toBeCloseTo(200.0001, 9)
      // Os extremos da faixa física passam (alumínio 2 700, platina 21 400); 80 000 não
      expect(com({ densidade: 2700 }).pendencias).toEqual([])
      expect(com({ densidade: 21400 }).pendencias).toEqual([])
      expect(com({ densidade: 80000 }).pendencias).toHaveLength(1)
    })

    it('vários jogos numa frase; peça sem jogo pelo valor nominal; ponto sem leitura não conta', () => {
      const r = calcular(
        entrada([
          [100, [peca(100, 0.00016, { jogo: 'JP-B', densidade: 0 })], 100.0002],
          [200, [{ ...P200, jogo: 'JP-A', densidade: 0 }], 200.0003],
          [220, [peca(220, 0.0003, { densidade: 0 })], 220.0003],
        ]),
      )
      expect(r.pendencias).toEqual([
        'Empuxo pela densidade do ar medida: os jogos JP-B, JP-A e peça de 220 g estão sem a densidade ou a incerteza da densidade (cadastro do padrão).',
      ])
      expect(com({ densidade: 0 }, null).pendencias).not.toContain(SEM)
    })

    it('sem o ar registrado, as duas pendências juntas; fora do empuxo medido, a densidade não importa', () => {
      const semAr = calcular(entrada([[200, [{ ...P200, jogo: 'JP-E2', densidade: 0 }], 200.0003]], {}, { ar: null }))
      expect(semAr.pendencias).toEqual([
        'Empuxo pela densidade do ar medida: registre a temperatura, a umidade relativa e a pressão atmosférica (etapa Padrões e ambiente).',
        SEM,
      ])
      for (const empuxo of ['AJUSTADO', 'NAO_AJUSTADO', 'DELTA_T', 'NENHUM'] as const)
        expect(com({ densidade: 7.95 }, 200.0003, { empuxo }).pendencias).toEqual([])
    })

    it('cargas de substituição: os pesos das etapas também, quando um ponto com substituição foi lido', () => {
      const base = entrada([[200, [], 200.0003]])
      const comEtapa = (lido: boolean): EntradaCalculo => ({
        ...base,
        indicacao: {
          ...base.indicacao,
          substituicao: {
            ativa: true,
            pecas: [peca(100, 0.00016, { jogo: 'JP-S', densidade: 7.95 })],
            etapas: [{ leituraPadroes: 100.0001, leituraSubstituicao: 100.0002 }],
          },
          pontos: [
            {
              ...base.indicacao.pontos[0],
              carga: 200,
              pecas: [peca(100, 0.00016, { jogo: 'JP-E2' })],
              nivelSubstituicao: 1,
              crescente: lido ? 200.0003 : null,
            },
          ],
        },
      })
      expect(calcular(comEtapa(true)).pendencias).toEqual([
        'Empuxo pela densidade do ar medida: o jogo JP-S está com densidade de 7,95 kg/m³, fora da faixa dos pesos; confira a unidade no cadastro do padrão (7,95 g/cm³ = 7 950 kg/m³).',
      ])
      expect(calcular(comEtapa(false)).pendencias).not.toContainEqual(expect.stringMatching(/JP-S/))
    })
  })
})

describe('avisos da classe I', () => {
  it('empuxo estimado na classe I (5d ou 5e), e não nas outras classes', () => {
    const texto =
      'atencao: Balança classe I com o empuxo estimado sem a densidade do ar (cg-18 7.1.2-5d/5e): essa parcela domina a incerteza. Use “Densidade do ar medida” (Opções do cálculo, na Conclusão).'
    expect(mensagens(casoC({ empuxo: 'NAO_AJUSTADO' }))).toContain(texto)
    expect(mensagens(casoC({ empuxo: 'DELTA_T', deltaTLocal: 5 }))).toContain(texto)
    expect(mensagens(casoC({ empuxo: 'MEDIDO' }))).not.toContain(texto)
    expect(mensagens(casoC({ empuxo: 'NAO_AJUSTADO' }, { classe: 'II' }))).not.toContain(texto)
  })

  it('5c num ensaio sem ajuste logo antes', () => {
    const texto = /^atencao: Empuxo “Balança ajustada logo antes” \(cg-18 7\.1\.2-5c\) num ensaio sem ajuste logo antes/
    expect(mensagens(casoC({ empuxo: 'AJUSTADO' })).some((m) => texto.test(m))).toBe(true)
    expect(
      mensagens(casoC({ empuxo: 'AJUSTADO' }, { ar: { ...RIO_CLARO, ajustadaAntes: true } })).some((m) => texto.test(m)),
    ).toBe(false)
    expect(mensagens(casoC({ empuxo: 'AJUSTADO' }, { ar: null })).some((m) => texto.test(m))).toBe(false)
  })

  it('densidade do ar fora da faixa da fórmula (MEDIDO) e a mais de 10 % de 1,2 kg/m³ (estimado)', () => {
    expect(mensagens(casoC({}, { ar: { ...RIO_CLARO, temperatura: 28 } }))).toContain(
      'info: Densidade do ar calculada fora da faixa de validade da fórmula do cg-18 (A1.1-1: 15 °C a 27 °C, 20 % a 80 % UR, 600 hPa a 1 100 hPa).',
    )
    // Rio Claro (1,100 kg/m³) fica a 8,3 %: sem aviso
    expect(mensagens(casoC({ empuxo: 'NAO_AJUSTADO' })).join('\n')).not.toMatch(/a mais de 10 %/)
    const alto = mensagens(casoC({ empuxo: 'NAO_AJUSTADO' }, { classe: 'III', ar: { ...RIO_CLARO, pressao: 880 } }))
    expect(alto).toContain(
      'atencao: Densidade do ar de 1,028 kg/m³, a mais de 10 % de 1,2 kg/m³: as estimativas do empuxo sem a densidade do ar supõem até 10 % (cg-18 7.1.2.2, nota 5) e podem subestimar a incerteza; use “Densidade do ar medida”.',
    )
    // No MEDIDO, a densidade medida já está no cálculo
    expect(mensagens(casoC({}, { ar: { ...RIO_CLARO, pressao: 880 } })).join('\n')).not.toMatch(/a mais de 10 %/)
    // Nenhum aviso novo pode conter "faixa parcial" (o certificado procura esse texto)
    const todos = [
      casoC(
        { empuxo: 'AJUSTADO' },
        { ar: { ...RIO_CLARO, pressao: 880, temperatura: 30 }, termica: { deltaT: 15, aclimatacao: null } },
      ),
      casoC(
        { empuxo: 'MEDIDO' },
        { ar: { ...RIO_CLARO, pressao: 880, temperatura: 30 }, termica: { deltaT: 15, aclimatacao: null } },
      ),
      casoC({ empuxo: 'NAO_AJUSTADO' }, { ar: { ...RIO_CLARO, umidade: null } }),
    ]
    expect(todos.flatMap((r) => r.avisos.map((a) => a.mensagem)).filter((m) => /faixa parcial/i.test(m))).toEqual([])
  })

  it('convecção maior que 1/3 do EMA da peça: F1 de 100 g a 3,5 °C sim; E2 de 0,5 g a 0,1 °C não (piso abaixo de 10 g)', () => {
    const f1 = calcular(
      entrada(
        [[100, [peca(100, 0.0005, { classe: 'F1', incerteza: 0.00016 })], 100.0002]],
        {},
        { termica: { deltaT: 3.5, aclimatacao: null } },
      ),
    )
    expect(mensagens(f1)).toContain(
      'atencao: Convecção maior que 1/3 do EMA da peça em 100,0000 g: a diferença de temperatura pesos − ar é grande para a classe dos pesos (cg-18, Tabela F2.2); se possível, aguarde a aclimatação.',
    )
    // A 3 °C (limite do POP para F1), 0,11 mg ≤ 0,167 mg: sem aviso
    const f1a3 = calcular(
      entrada(
        [[100, [peca(100, 0.0005, { classe: 'F1', incerteza: 0.00016 })], 100.0002]],
        {},
        { termica: { deltaT: 3, aclimatacao: null } },
      ),
    )
    expect(mensagens(f1a3).join('\n')).not.toMatch(/Convecção maior/)
    const pequena = calcular(
      entrada([[0.5, [peca(0.5, 0.000025, { incerteza: 0.000008 })], 0.5]], {}, { termica: { deltaT: 0.1, aclimatacao: null } }),
    )
    perto(orc(pequena).uConveccao, 0.00001 / Math.sqrt(3), 1e-9, 'u(δm_conv) 0,5 g')
    expect(mensagens(pequena).join('\n')).not.toMatch(/Convecção maior/)
  })

  it('peça E1: até 1 °C (a menor coluna, D3) não avisa, porque esperar não muda nada; acima de 1 °C, avisa', () => {
    // E1 de 100 g: EMA 0,05 mg (1/3 = 0,0167 mg); a coluna de 1 K da Tabela F2.1 já dá 0,05 mg
    const e1 = (deltaT: number) =>
      calcular(
        entrada(
          [[100, [peca(100, 0.00005, { classe: 'E1', incerteza: 0.000016 })], 100.0001]],
          {},
          { termica: { deltaT, aclimatacao: null } },
        ),
      )
    for (const deltaT of [0, 1]) {
      const r = e1(deltaT)
      perto(orc(r).uConveccao, 0.00005 / Math.sqrt(3), 1e-9, `u(δm_conv) a ${deltaT} °C`)
      expect(mensagens(r).join('\n')).not.toMatch(/Convecção maior/)
    }
    const r = e1(1.5)
    perto(orc(r).uConveccao, 0.00008 / Math.sqrt(3), 1e-9, 'u(δm_conv) a 1,5 °C (coluna de 2 K)')
    expect(mensagens(r)).toContain(
      'atencao: Convecção maior que 1/3 do EMA da peça em 100,0000 g: a diferença de temperatura pesos − ar é grande para a classe dos pesos (cg-18, Tabela F2.2); se possível, aguarde a aclimatação.',
    )
    // Pela aclimatação, o ΔT estimado nunca desce de 1 K: com a aclimatação completa, sem aviso
    const aclimatada = calcular(
      entrada(
        [[100, [peca(100, 0.00005, { classe: 'E1', incerteza: 0.000016 })], 100.0001]],
        {},
        { termica: { deltaT: null, aclimatacao: { deltaT0: 5, minutos: 240 } } },
      ),
    )
    expect(mensagens(aclimatada).join('\n')).not.toMatch(/Convecção maior/)
  })

  it('repetibilidade com menos de 10 leituras: atenção na classe I; nas outras classes, o informativo de sempre', () => {
    const cinco = (classe: 'I' | 'II') => {
      const e = entrada([[200, [P200], 200.0003]], {}, { classe })
      e.repetibilidade[0].leituras = e.repetibilidade[0].leituras.slice(0, 5)
      return mensagens(calcular(e))
    }
    expect(cinco('I')).toContain('atencao: Balança classe I: faça 10 leituras na repetibilidade (POP, Tabela 4).')
    expect(cinco('I').join('\n')).not.toMatch(/info: Repetibilidade com menos de 10 leituras/)
    expect(cinco('II')).toContain(
      'info: Repetibilidade com menos de 10 leituras: o k calculado pelos graus de liberdade efetivos sai maior que 2.',
    )
    expect(cinco('II').join('\n')).not.toMatch(/Balança classe I:/)
    expect(mensagens(casoC()).join('\n')).not.toMatch(/10 leituras/)
  })
})

describe('classe dos pesos: Σ EMA ou, com E1/E2 pelo certificado, a incerteza (R 76-1 3.7.1)', () => {
  // e = 1 mg: EMA OIML inicial de 0,5 mg até 50 g (1/3 = 0,167 mg) e de 1 mg até 200 g (1/3 = 0,333 mg)
  const P20 = peca(20, 0.00008, { incerteza: 0.000025 })
  const P5 = peca(5, 0.00005, { incerteza: 0.000016 })
  const carga45 = (opcoes: Partial<OpcoesCalculo>, extra: Partial<PecaCalculo> = {}) =>
    mensagens(
      calcular(
        entrada(
          [[45, [P20, { ...P20 }, P5].map((p) => ({ ...p, ...extra })), 45.0001]],
          { empuxo: 'AJUSTADO', conveccao: 'NAO_CONSIDERAR', ...opcoes },
          { ar: null },
        ),
      ),
    ).join('\n')

  it('45 g = 20 + 20 + 5 g E2 com kD = 1,25: Σ EMA = 0,21 mg falha, mas 2·u = 0,116 mg basta', () => {
    expect(carga45({ deriva: 'KD' })).not.toMatch(/Classe dos pesos insuficiente/)
  })

  it('a mesma carga com a deriva = EMA: 2·u = 0,251 mg também falha → aviso', () => {
    expect(carga45({ deriva: 'EMA' })).toMatch(
      /atencao: Classe dos pesos insuficiente em 45,0000 g: Σ EMA dos pesos maior que 1\/3 do EMA OIML inicial da balança e, com os pesos E1\/E2 pelo certificado, a incerteza 2·u \(com a deriva\) também \(R76 3\.7\.1\)\./,
    )
  })

  it('pelo nominal, só o Σ EMA vale (0,21 mg > 0,167 mg) e a mensagem é a de sempre', () => {
    expect(carga45({ deriva: 'KD' }, { usarCertificado: false })).toMatch(
      /Classe dos pesos insuficiente em 45,0000 g: Σ EMA dos pesos maior que 1\/3 do EMA OIML inicial da balança \(R76 3\.7\.1\)\./,
    )
    // F1 pelo certificado também só pelo Σ EMA
    expect(carga45({ deriva: 'KD' }, { classe: 'F1' })).toMatch(/Classe dos pesos insuficiente/)
  })

  it('200 g E2 pelo certificado com a deriva = EMA: Σ EMA = 0,30 mg ≤ 0,333 mg basta (2·u = 0,361 mg não importa)', () => {
    const r = calcular(
      entrada([[200, [P200], 200.0003]], { empuxo: 'AJUSTADO', deriva: 'EMA', conveccao: 'NAO_CONSIDERAR' }, { ar: null }),
    )
    expect(mensagens(r).join('\n')).not.toMatch(/Classe dos pesos insuficiente/)
  })
})

describe('os campos novos só agem com o empuxo MEDIDO ou a convecção CALCULAR', () => {
  it('com ar e ΔT registrados e as opções de sempre, os números são os mesmos de sem eles', () => {
    for (const empuxo of ['AJUSTADO', 'NAO_AJUSTADO', 'DELTA_T', 'NENHUM'] as const)
      for (const classe of ['I', 'II', 'III'] as const) {
        const opcoes = { empuxo, deltaTLocal: 5, conveccao: 'NAO_CONSIDERAR' as const }
        const com = calcular(entrada([[200, [P200], 200.0003]], opcoes, { classe }))
        const sem = calcular(
          entrada([[200, [P200], 200.0003]], { ...opcoes, conveccao: undefined }, { classe, ar: undefined, termica: undefined }),
        )
        expect(com.pontos).toEqual(sem.pontos)
        expect(com.pendencias).toEqual(sem.pendencias)
        expect(orc(com).uConveccao).toBe(0)
        expect(orc(com).correcaoEmpuxo).toBe(0)
        expect(sem.ar).toBeNull()
      }
  })
})

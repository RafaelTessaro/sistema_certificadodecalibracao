import { describe, expect, it } from 'vitest'
import { exemploRodoviaria } from '../server/pdf/exemplosCertificado.ts'
import {
  arDoAmbiente,
  avisoCargasDaConformidade,
  avisoDaFolhaCargasDaConformidade,
  calcularCalibracao,
  comCargasDoEma,
  cargaDasPecas,
  entradaDoCalculo,
  leiturasOriginais,
  montarCarga,
  montarPonto,
  opcoesComoEncontrado,
  pecaParaCalculo,
  pesosAtendemNaCarga,
  pontosEmOrdemDeCarga,
  planoDoHistoricoSemConformidade,
  pontosSugeridos,
  regrasDoPopComoAviso,
  termicaDoAmbiente,
} from './calibracao.ts'
import {
  AMBIENTE_VAZIO,
  BALANCA_VAZIA,
  calibracaoVazia,
  METODOS_CARREGAMENTO,
  metodosCarregamentoParaEscolher,
  OPCOES_CALCULO_PADRAO,
  opcoesDaClasse,
  PADRAO_VAZIO,
  padroesSemHistorico,
} from './dominio.ts'
import { calcular, NOMES_METODO_CARREGAMENTO } from './metrologia/index.ts'
import type { Balanca, CalibracaoInput, EnsaioIndicacao, Padrao, PontoIndicacao } from './tipos.ts'

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
    // (os pontos vão em ordem de carga: `pontosEmOrdemDeCarga`)
    expect(Object.fromEntries(entrada.indicacao.pontos.map((p) => [p.id, p.carga]))).toEqual({ a: 5000, b: 10_000, c: 5000 })
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
  it('a coluna escondida pela troca de método não entra no cálculo (descida digitada e depois "crescente contínuo")', () => {
    const jogo: Padrao = {
      ...PADRAO_VAZIO,
      id: 'jp2',
      versao: 1,
      identificacao: 'JP-02',
      descricao: 'Pesos de 1 kg a 20 kg',
      classe: 'M1',
      criadoEm: '',
      atualizadoEm: '',
      pesos: [1000, 2000, 5000, 10_000, 20_000].map((g) => ({
        id: `p${g}`,
        marca: `${g}`,
        nominal: g,
        correcao: 0,
        incerteza: 10,
        k: 2,
      })),
    }
    const prix: Balanca = {
      ...BALANCA_VAZIA,
      id: 'prix',
      versao: 1,
      tipo: 'BALCAO',
      classe: 'III',
      faixas: [{ max: 30, e: 0.01, d: 0.01 }],
      criadoEm: '',
      atualizadoEm: '',
    }
    const lidas: [number, number][] = [
      [1, 1],
      [2, 2],
      [5, 4.998],
      [10, 9.995],
      [20, 19.99],
      [30, 29.99],
    ]
    const indicacao = (metodo: EnsaioIndicacao['metodo']): EnsaioIndicacao => ({
      metodo,
      retornoZero: null,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      // A descida do ponto de 1 kg ficou com 0 (digitada antes de trocar o método)
      pontos: lidas.map(([q, l], i) => ({
        id: `q${i}`,
        carga: q,
        pecas: montarCarga(q, 'kg', [jogo]).pecas,
        pecasManuais: false,
        crescente: l,
        decrescente: q === 1 ? 0 : l,
        nivelSubstituicao: 0,
      })),
    })
    const calcular = (metodo: EnsaioIndicacao['metodo']) =>
      calcularCalibracao({ ...calibracaoVazia(), indicacao: indicacao(metodo) }, prix, [jogo]).resultado
    // Calibração nova: a leitura fora do esperado é pendência (POP 7.8)
    const foraDaCarga = (r: ReturnType<typeof calcular>) => r.pendencias.some((p) => /fora do esperado/.test(p))

    const continuo = calcular('CONTINUO')
    expect(foraDaCarga(continuo)).toBe(false)
    expect(continuo.pontos.every((p) => p.decrescente === null)).toBe(true)
    expect(Math.max(...continuo.pontos.map((p) => Math.abs(p.crescente!.erro)))).toBeCloseTo(0.01, 9)
    expect(
      entradaDoCalculo({ ...calibracaoVazia(), indicacao: indicacao('DESCONTINUO') }, prix, [jogo]).indicacao.pontos[0]
        .decrescente,
    ).toBeNull()
    // Só a descida: a subida fica de fora
    expect(
      entradaDoCalculo({ ...calibracaoVazia(), indicacao: indicacao('DECRESCENTE') }, prix, [jogo]).indicacao.pontos[0].crescente,
    ).toBeNull()
    // Com as duas colunas, o 0 da descida volta a valer (e é pendência)
    expect(foraDaCarga(calcular('CRESCENTE_DECRESCENTE'))).toBe(true)
    expect(calcular('CRESCENTE_DECRESCENTE').pendencias).toContain(
      'Erro de indicação, ponto de 1,00 kg: leitura 0,00 fora do esperado; confira a digitação.',
    )
  })

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

// ---- Classe I: densidade dos pesos, ar e ΔT do ambiente, situação A/B ----------------------------------

const jogoE2: Padrao = {
  ...PADRAO_VAZIO,
  id: 'e2',
  versao: 1,
  identificacao: 'JP-E2',
  classe: 'E2',
  densidade: 7950,
  incertezaDensidade: 70,
  criadoEm: '',
  atualizadoEm: '',
  pesos: [
    { id: 'p200', marca: '200', nominal: 200, correcao: 0.1, incerteza: 0.1, k: 2 },
    { id: 'p100', marca: '100', nominal: 100, correcao: -0.1, incerteza: 0.05, k: 2 },
    { id: 'p50', marca: '50', nominal: 50, correcao: 0.02, incerteza: 0.03, k: 2 },
    { id: 'p20', marca: '20', nominal: 20, correcao: 0.01, incerteza: 0.025, k: 2 },
  ],
}
const analitica: Balanca = {
  ...BALANCA_VAZIA,
  id: 'a',
  versao: 1,
  tipo: 'ANALITICA',
  unidade: 'g',
  classe: 'I',
  faixas: [{ max: 220, e: 0.001, d: 0.0001 }],
  criadoEm: '',
  atualizadoEm: '',
}
function calibracaoClasseI(extra: Partial<CalibracaoInput> = {}): CalibracaoInput {
  const indicacao: EnsaioIndicacao = {
    metodo: 'DESCONTINUO',
    retornoZero: 0,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos: [
      { id: 'z', carga: 0, pecas: [], pecasManuais: false, crescente: 0, decrescente: null, nivelSubstituicao: 0 },
      {
        id: 'c',
        carga: 200,
        pecas: [{ padraoId: 'e2', pesoId: 'p200', quantidade: 1 }],
        pecasManuais: false,
        crescente: 200.0003,
        decrescente: null,
        nivelSubstituicao: 0,
      },
      // Os 5 pontos do POP (7.7), contando o zero
      ...(
        [
          ['p20', 20, 20.0001],
          ['p50', 50, 50.0001],
          ['p100', 100, 100.0001],
        ] as const
      ).map(([peso, carga, leitura]) => ({
        id: peso,
        carga,
        pecas: [{ padraoId: 'e2', pesoId: peso, quantidade: 1 }],
        pecasManuais: false,
        crescente: leitura,
        decrescente: null,
        nivelSubstituicao: 0,
      })),
    ],
  }
  return {
    ...calibracaoVazia(opcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I')),
    repetibilidade: [{ id: 'r', carga: 100, leituras: Array.from({ length: 10 }, (_, i) => (i % 2 ? 100.0001 : 100)) }],
    excentricidade: { aplicavel: false, motivo: '', carga: 0, metodo: 1, posicoes: [] },
    indicacao,
    ambiente: {
      ...AMBIENTE_VAZIO,
      temperaturaInicial: 22,
      temperaturaFinal: 24,
      umidadeInicial: 55,
      umidadeFinal: 65,
      pressao: 941.5,
      deltaTPesos: 0.4,
    },
    ...extra,
  }
}

describe('classe I: ligação com o motor', () => {
  it('a peça leva a classe, a densidade e a incerteza da densidade do jogo (0 quando o registro não tem)', () => {
    const p = pecaParaCalculo(jogoE2, jogoE2.pesos[0], 'g')
    expect(p).toMatchObject({ classe: 'E2', densidade: 7950, uDensidade: 70, nominal: 200, correcao: 0.0001, incerteza: 0.0001 })
    const { incertezaDensidade: _u, ...antigo } = jogoE2
    expect(pecaParaCalculo(antigo as Padrao, jogoE2.pesos[0], 'g')).toMatchObject({ densidade: 7950, uDensidade: 0 })
    expect(pecaParaCalculo({ ...jogoE2, densidade: 0, classe: '' }, jogoE2.pesos[0], 'g')).toMatchObject({
      classe: '',
      densidade: 0,
    })
  })

  it('ar do ambiente: médias do início e do fim, a única lida, e a pressão', () => {
    const amb = calibracaoClasseI().ambiente
    expect(arDoAmbiente(amb, false)).toEqual({ temperatura: 23, umidade: 60, pressao: 941.5, ajustadaAntes: false })
    expect(arDoAmbiente({ ...amb, temperaturaInicial: 21, temperaturaFinal: 23 }, true)?.temperatura).toBe(22)
    expect(arDoAmbiente({ ...amb, temperaturaFinal: null, umidadeInicial: null }, true)).toEqual({
      temperatura: 22,
      umidade: 65,
      pressao: 941.5,
      ajustadaAntes: true,
    })
    expect(arDoAmbiente({ ...amb, pressao: null }, false)?.pressao).toBeNull()
    expect(arDoAmbiente(undefined, false)).toBeNull()
  })

  it('ΔT pesos − ar: o medido, a aclimatação, ou nada', () => {
    expect(termicaDoAmbiente({ ...AMBIENTE_VAZIO, deltaTPesos: 0.4 })).toEqual({ deltaT: 0.4, aclimatacao: null })
    expect(termicaDoAmbiente({ ...AMBIENTE_VAZIO, aclimatacao: { deltaT0: 5, minutos: 60 } })).toEqual({
      deltaT: null,
      aclimatacao: { deltaT0: 5, minutos: 60 },
    })
    expect(termicaDoAmbiente(AMBIENTE_VAZIO)).toBeNull()
    // Registro antigo, sem os campos
    const { deltaTPesos: _d, aclimatacao: _a, ...antigo } = AMBIENTE_VAZIO
    expect(termicaDoAmbiente(antigo)).toBeNull()
    expect(termicaDoAmbiente(undefined)).toBeNull()
  })

  it('situação B (logo após o ajuste) só no ensaio final com ajuste; o "como encontrado" é sempre a situação A', () => {
    const interno = calibracaoClasseI({ ajuste: { realizado: 'INTERNO', descricao: '' } })
    expect(entradaDoCalculo(interno, analitica, [jogoE2]).ar?.ajustadaAntes).toBe(true)
    expect(entradaDoCalculo(interno, analitica, [jogoE2], interno.indicacao, 'COMO_ENCONTRADO').ar?.ajustadaAntes).toBe(false)
    const sem = calibracaoClasseI()
    expect(entradaDoCalculo(sem, analitica, [jogoE2]).ar?.ajustadaAntes).toBe(false)
    expect(entradaDoCalculo(sem, analitica, [jogoE2], sem.indicacao, 'COMO_ENCONTRADO').ar?.ajustadaAntes).toBe(false)
    // No cálculo: u(ρa) pela A3-1 (2,87e-3) no final e pela A3-2 com 10 K (1,55e-2) no "como encontrado"
    const r = calcularCalibracao({ ...interno, comoEncontrado: structuredClone(interno.indicacao) }, analitica, [jogoE2])
    expect(r.resultado.ar!.incerteza / r.resultado.ar!.densidade).toBeCloseTo(2.874e-3, 6)
    expect(r.comoEncontrado!.ar!.incerteza / r.comoEncontrado!.ar!.densidade).toBeCloseTo(1.5492e-2, 6)
  })

  it('calibração classe I completa: densidade do ar medida e convecção, sem pendências do cálculo', () => {
    const r = calcularCalibracao(calibracaoClasseI(), analitica, [jogoE2])
    expect(r.resultado.pendencias).toEqual([])
    const o = r.resultado.pontos.find((p) => p.id === 'c')!.crescente!
    expect(o.correcaoEmpuxo).toBeCloseTo(0.000015653, 9)
    expect(o.uConveccao).toBeCloseTo(0.00008 / Math.sqrt(3), 12)
    // Deriva = EMA (o padrão da empresa, D4): u(δm_D) = 0,3 mg/√3 domina; U = 0,000 398 g
    expect(r.resultado.pontos.find((p) => p.id === 'c')!.texto.U).toBe('0,00040')
    // Sem o ΔT registrado, a convecção é pendência
    const semDt = calcularCalibracao(
      calibracaoClasseI({ ambiente: { ...calibracaoClasseI().ambiente, deltaTPesos: null } }),
      analitica,
      [jogoE2],
    )
    expect(semDt.resultado.pendencias[0]).toMatch(/^Convecção: registre a diferença de temperatura/)
  })

  it('"como encontrado" com "ajustada logo antes": na classe I vai pela densidade do ar medida; nas outras, como sempre', () => {
    const aj = { ...OPCOES_CALCULO_PADRAO, empuxo: 'AJUSTADO' as const }
    expect(opcoesComoEncontrado(aj, 'I').empuxo).toBe('MEDIDO')
    expect(opcoesComoEncontrado({ ...aj, deltaTLocal: 5 }, 'I')).toMatchObject({ empuxo: 'MEDIDO', deltaTLocal: 5 })
    for (const classe of ['II', 'III', 'IIII', ''] as const) expect(opcoesComoEncontrado(aj, classe)).toBe(aj)
    expect(opcoesComoEncontrado({ ...aj, empuxo: 'MEDIDO' }, 'I').empuxo).toBe('MEDIDO')
  })

  it('classe I, "ajustada logo antes" e ajuste interno: o "como encontrado" usa o ar medido (A3-2), sem o aviso 5d/5e', () => {
    const k = calibracaoClasseI({
      opcoes: { ...opcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I'), empuxo: 'AJUSTADO' },
      ajuste: { realizado: 'INTERNO', descricao: '' },
    })
    k.comoEncontrado = structuredClone(k.indicacao)
    const r = calcularCalibracao(k, analitica, [jogoE2])
    const ce = r.comoEncontrado!
    // A densidade do ar entra, com u(ρa) da situação A (A3-2, 10 K)
    expect(ce.ar!.incerteza / ce.ar!.densidade).toBeCloseTo(1.5492e-2, 6)
    expect(ce.pontos.find((p) => p.id === 'c')!.crescente!.correcaoEmpuxo).toBeCloseTo(0.000015653, 9)
    expect(ce.pendencias).toEqual([])
    const avisos = ce.avisos.map((a) => a.mensagem).join('\n')
    expect(avisos).not.toMatch(/empuxo estimado sem a densidade do ar|7\.1\.2-5c/)
    // O U do "como encontrado" fica perto do final (com a 5d era cerca de 7 vezes maior)
    const uFinal = r.resultado.pontos.find((p) => p.id === 'c')!.crescente!.U
    const uAntes = ce.pontos.find((p) => p.id === 'c')!.crescente!.U
    expect(uAntes / uFinal).toBeLessThan(1.05)
    expect(ce.pontos.find((p) => p.id === 'c')!.texto.U).toBe('0,00040')
    // Sem a umidade, o "como encontrado" cai na 5d com a pendência do ar
    const semUr = calcularCalibracao({ ...k, ambiente: { ...k.ambiente, umidadeInicial: null, umidadeFinal: null } }, analitica, [
      jogoE2,
    ])
    expect(semUr.comoEncontrado!.pendencias[0]).toMatch(/^Empuxo pela densidade do ar medida: registre/)
  })

  it('certificado emitido antes do cálculo da classe I (e a revisão dele): o "como encontrado" calcula como na época', () => {
    // Gravado no formato antigo: sem `conveccao` nas opções nem o ΔT pesos − ar
    const { conveccao: _c, ...opcoesAntigas } = { ...OPCOES_CALCULO_PADRAO, empuxo: 'AJUSTADO' as const }
    const antigo = calibracaoClasseI({
      opcoes: opcoesAntigas as CalibracaoInput['opcoes'],
      ajuste: { realizado: 'INTERNO', descricao: '' },
      ambiente: { ...calibracaoClasseI().ambiente, deltaTPesos: null },
    })
    antigo.comoEncontrado = structuredClone(antigo.indicacao)
    const emitido = { ...antigo, emissao: { codigo: 'ABCD-1234' } }
    // Referência: as opções da época (5c) aplicadas também ao "como encontrado" (e os pontos na ordem da época)
    const ref = calcular({
      ...entradaDoCalculo(emitido, analitica, [jogoE2], antigo.comoEncontrado, 'COMO_ENCONTRADO'),
      opcoes: antigo.opcoes,
    })
    expect(ref.pontos[1].crescente!.correcaoEmpuxo).toBe(0)
    const legado = calcularCalibracao(emitido, analitica, [jogoE2])
    expect(legado.comoEncontrado!.pontos).toEqual(ref.pontos)
    // A revisão (rascunho normalizado, com `conveccao` gravada) marcada pelo servidor também
    const revisao = { ...antigo, opcoes: { ...OPCOES_CALCULO_PADRAO, empuxo: 'AJUSTADO' as const }, calculoLegado: true }
    expect(calcularCalibracao(revisao, analitica, [jogoE2]).comoEncontrado!.pontos).toEqual(ref.pontos)
    // Rascunho gravado antes desta versão, ainda não emitido: já com as regras novas
    expect(calcularCalibracao(antigo, analitica, [jogoE2]).comoEncontrado!.pontos[1].crescente!.correcaoEmpuxo).toBeGreaterThan(0)
  })

  it('registro antigo (sem os campos novos) e outras classes: os mesmos números de sem o ar e o ΔT', () => {
    const d = exemploRodoviaria()
    const { balanca: b, padroes } = d.emissao
    const k = { ...d.calibracao, ajuste: { realizado: 'INTERNO' as const, descricao: '' } }
    k.comoEncontrado = structuredClone(k.indicacao)
    const antes = calcularCalibracao({ ...k, ambiente: undefined } as unknown as CalibracaoInput, b, padroes)
    const comAmbiente = calcularCalibracao(
      { ...k, ambiente: { ...k.ambiente, deltaTPesos: 2, aclimatacao: { deltaT0: 5, minutos: 10 }, pressao: 941.5 } },
      b,
      padroes,
    )
    expect(comAmbiente.resultado.pontos).toEqual(antes.resultado.pontos)
    expect(comAmbiente.comoEncontrado!.pontos).toEqual(antes.comoEncontrado!.pontos)
    expect(comAmbiente.resultado.pendencias).toEqual(antes.resultado.pendencias)
  })
})

// ---- Peças dos pontos: jogo fora dos padrões, peça tirada do cadastro, pesos que não fecham a carga --------

/** Jogo de pesos (nominais em g), pelo certificado com U de 16 mg/kg. */
const jogoDe = (id: string, identificacao: string, nominais: number[], extra: Partial<Padrao> = {}): Padrao => ({
  ...PADRAO_VAZIO,
  id,
  versao: 1,
  identificacao,
  descricao: '',
  criadoEm: '',
  atualizadoEm: '',
  pesos: nominais.map((g, i) => ({
    id: `${id}-${i}`,
    marca: String(i + 1),
    nominal: g,
    correcao: 0,
    incerteza: g * 0.016,
    k: 2,
  })),
  ...extra,
})
const balanca30: Balanca = {
  ...BALANCA_VAZIA,
  id: 'b30',
  versao: 1,
  tipo: 'BALCAO',
  classe: 'III',
  faixas: [{ max: 30, e: 0.01, d: 0.01 }],
  criadoEm: '',
  atualizadoEm: '',
}
const ref = (padraoId: string, i: number) => ({ padraoId, pesoId: `${padraoId}-${i}`, quantidade: 1 })
const pontoDe = (
  id: string,
  carga: number,
  pecas: PontoIndicacao['pecas'],
  leitura: number | null,
  extra: Partial<PontoIndicacao> = {},
): PontoIndicacao => ({
  id,
  carga,
  pecas,
  pecasManuais: true,
  crescente: leitura,
  decrescente: leitura,
  nivelSubstituicao: 0,
  ...extra,
})
/** As pendências sem as dos mínimos do POP (pontos, subida e repetibilidade), testados à parte. */
const semMinimosDoPop = (pendencias: string[]) => pendencias.filter((p) => !/^(Erro de indicação: |Repetibilidade)/.test(p))

function calibracaoDe(pontos: PontoIndicacao[], indicacao: Partial<EnsaioIndicacao> = {}): CalibracaoInput {
  return {
    ...calibracaoVazia(),
    repetibilidade: [{ id: 'r', carga: 15, leituras: [15, 15, 15.01, 15, 15] }],
    excentricidade: { aplicavel: false, motivo: 'Não se aplica', carga: 0, metodo: 1, posicoes: [] },
    indicacao: {
      metodo: 'CRESCENTE_DECRESCENTE',
      retornoZero: 0,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos,
      ...indicacao,
    },
  }
}

describe('peças de um jogo fora dos padrões escolhidos (ou tiradas do cadastro do jogo)', () => {
  const A = jogoDe('a', 'JP-A', [10_000, 10_000, 10_000])
  const B = jogoDe('b', 'JP-B', [5000])
  const pontos = [
    pontoDe('z', 0, [], 0),
    pontoDe('p10', 10, [ref('a', 0)], 10),
    pontoDe('p20', 20, [ref('a', 0), ref('a', 1)], 20.01),
    pontoDe('p25', 25, [ref('a', 0), ref('a', 1), ref('b', 0)], 25.01),
    pontoDe('p30', 30, [ref('a', 0), ref('a', 1), ref('a', 2)], 30.01),
  ]
  const foraDosPadroes = (carga: string) =>
    `Erro de indicação, ponto de ${carga} kg: pesos de um jogo que não está entre os padrões escolhidos; escolha os pesos do ponto de novo.`

  it('com os dois jogos escolhidos, nada muda', () => {
    const { resultado } = calcularCalibracao(calibracaoDe(pontos), balanca30, [A, B])
    expect(resultado.pendencias).toEqual([])
    expect(resultado.pontos.map((p) => p.texto.carga)).toEqual(['0,00', '10,00', '20,00', '25,00', '30,00'])
  })

  it('jogo desmarcado: a carga fica a digitada, o ponto não é calculado e cada um vira pendência', () => {
    const k = calibracaoDe(pontos)
    expect(entradaDoCalculo(k, balanca30, [B]).indicacao.pontos.map((p) => p.carga)).toEqual([0, 10, 20, 25, 30])
    const { resultado } = calcularCalibracao(k, balanca30, [B])
    expect(resultado.pendencias).toEqual(['10,00', '20,00', '25,00', '30,00'].map(foraDosPadroes))
    // Sem erro de 10 kg (a leitura toda) no certificado nem na tela: o ponto fica sem cálculo
    expect(resultado.pontos.slice(1).every((p) => p.crescente === null && p.decrescente === null)).toBe(true)
    expect(resultado.pontos.map((p) => p.texto.carga)).toEqual(['0,00', '10,00', '20,00', '25,00', '30,00'])
    // Nem "carga sem padrões" (o motivo já é a pendência) nem "faixa parcial" (a carga é a digitada)
    const avisos = resultado.avisos.map((a) => a.mensagem).join('\n')
    expect(avisos).not.toMatch(/Carga sem padrões|faixa parcial|fora da carga/)
  })

  it('peça tirada do cadastro do jogo: pendência com o nome do jogo', () => {
    const semUma = { ...A, pesos: A.pesos.filter((w) => w.id !== 'a-2') }
    const { resultado } = calcularCalibracao(calibracaoDe(pontos), balanca30, [semUma, B])
    expect(resultado.pendencias).toEqual([
      'Erro de indicação, ponto de 30,00 kg: peça tirada do cadastro do jogo JP-A; escolha os pesos do ponto de novo.',
    ])
    expect(resultado.pontos[4].crescente).toBeNull()
    expect(resultado.pontos[3].crescente?.erro).toBeCloseTo(0.01, 9)
  })

  it('ponto sem leitura não acusa; o "como encontrado" acusa igual', () => {
    const semLeitura = pontos.map((p) => (p.id === 'p10' ? p : { ...p, crescente: null, decrescente: null }))
    const k = calibracaoDe(semLeitura)
    expect(semMinimosDoPop(calcularCalibracao(k, balanca30, [B]).resultado.pendencias)).toEqual([foraDosPadroes('10,00')])
    const ajustada = { ...calibracaoDe(pontos), ajuste: { realizado: 'INTERNO' as const, descricao: '' } }
    ajustada.comoEncontrado = structuredClone(ajustada.indicacao)
    expect(calcularCalibracao(ajustada, balanca30, [B]).comoEncontrado?.pendencias).toContain(foraDosPadroes('30,00'))
  })

  it('substituição com os pesos da etapa fora dos padrões: os pontos com etapas viram pendência', () => {
    const k = calibracaoDe([pontoDe('z', 0, [], 0), pontoDe('s', 15, [ref('b', 0)], 15.01, { nivelSubstituicao: 1 })], {
      metodo: 'CONTINUO',
      substituicao: { ativa: true, pecas: [ref('a', 0)], etapas: [{ leituraPadroes: 10, leituraSubstituicao: 10.02 }] },
    })
    expect(semMinimosDoPop(calcularCalibracao(k, balanca30, [A, B]).resultado.pendencias)).toEqual([])
    expect(semMinimosDoPop(calcularCalibracao(k, balanca30, [B]).resultado.pendencias)).toEqual([
      'Erro de indicação, ponto de 15,00 kg: etapas de substituição com pesos de um jogo que não está entre os padrões escolhidos; escolha os pesos da etapa de novo.',
    ])
  })
})

describe('pesos que não fecham a carga do ponto', () => {
  const J = jogoDe('j', 'JP-J', [20_000, 5000, 2000, 1000])
  const automatico = (carga: number, leitura: number | null = carga) =>
    pontoDe(`p${carga}`, carga, carga ? montarCarga(carga, 'kg', [J]).pecas : [], leitura, { pecasManuais: false })

  it('peças automáticas: o que falta vira pendência (o ponto continua calculado pelo valor dos pesos)', () => {
    const k = calibracaoDe([0, 5, 8, 20, 30].map((c) => automatico(c)))
    const { resultado } = calcularCalibracao(k, balanca30, [J])
    expect(resultado.pendencias).toEqual([
      'Erro de indicação, ponto de 30,00 kg: os pesos somam 28,00 kg; faltam 2,00 kg. Escolha nos padrões o jogo que completa a carga ou acerte os pesos do ponto.',
    ])
    expect(resultado.pontos[4].referencia).toBe(28)
    // Sem leitura no ponto, nada a acusar
    const semLeitura = calibracaoDe([0, 5, 8, 20].map((c) => automatico(c)).concat(automatico(30, null)))
    expect(semMinimosDoPop(calcularCalibracao(semLeitura, balanca30, [J]).resultado.pendencias)).toEqual([])
  })

  it('peças à mão que passam da carga, e a coluna escondida pelo método não acusa', () => {
    const k = calibracaoDe([automatico(0), pontoDe('p5', 5, [ref('j', 0)], 5), automatico(20)])
    expect(semMinimosDoPop(calcularCalibracao(k, balanca30, [J]).resultado.pendencias)).toEqual([
      'Erro de indicação, ponto de 5,00 kg: os pesos somam 20,00 kg; passam 15,00 kg. Acerte os pesos do ponto.',
    ])
    // Só a subida digitada, mas o método é "só descendo": a leitura não conta, nem a pendência
    const soSubida = calibracaoDe([automatico(0), pontoDe('p5', 5, [ref('j', 0)], 5, { decrescente: null })], {
      metodo: 'DECRESCENTE',
    })
    expect(calcularCalibracao(soSubida, balanca30, [J]).resultado.pendencias.join('\n')).not.toMatch(/somam/)
  })

  it('com substituição: as etapas e os pesos por cima somam mais ou menos que a carga', () => {
    const substituicao = { ativa: true, pecas: [ref('j', 0)], etapas: [{ leituraPadroes: 20, leituraSubstituicao: 20.02 }] }
    const k = calibracaoDe(
      [
        automatico(0),
        pontoDe('a', 30, [ref('j', 1), ref('j', 2), ref('j', 3)], 30.02, { nivelSubstituicao: 1 }),
        pontoDe('b', 25, [ref('j', 1)], 25.02, { nivelSubstituicao: 1 }),
      ],
      { metodo: 'CONTINUO', substituicao },
    )
    expect(semMinimosDoPop(calcularCalibracao(k, balanca30, [J]).resultado.pendencias)).toEqual([
      'Erro de indicação, ponto de 30,00 kg: as etapas de substituição e os pesos somam 28,00 kg; faltam 2,00 kg. Escolha nos padrões o jogo que completa a carga ou acerte os pesos do ponto.',
    ])
    const passa = calibracaoDe([automatico(0), pontoDe('c', 15, [], 15.02, { nivelSubstituicao: 1 })], {
      metodo: 'CONTINUO',
      substituicao,
    })
    expect(semMinimosDoPop(calcularCalibracao(passa, balanca30, [J]).resultado.pendencias)).toEqual([
      'Erro de indicação, ponto de 15,00 kg: as etapas de substituição somam 20,00 kg; passam 5,00 kg. Acerte os pesos ou o nível de substituição do ponto.',
    ])
  })
})

// ---- Montagem das cargas pela classe dos pesos (POP 6.1; R76 3.7.1) ------------------------------------

describe('montagem das cargas pela classe dos pesos', () => {
  const finos = [1000, 500, 200, 200, 100, 50, 20, 20, 10, 5, 2, 2, 1, 0.5, 0.2, 0.2, 0.1, 0.05, 0.02, 0.02, 0.01]
  const m1 = jogoDe('m1', 'JP-M1', [20_000, 20_000, 10_000, 5000, 2000, 2000, 1000, 500, 200, 200, 100, 50, 20, 20, 10], {
    classe: 'M1',
  })
  const f1 = jogoDe('f1', 'JP-F1', finos, { classe: 'F1' })
  const e2 = jogoDe('e2', 'JP-E2', finos, { classe: 'E2' })
  // Marte AD3300: classe II, 3200 g, e = 0,1 g
  const marte: Balanca = {
    ...BALANCA_VAZIA,
    id: 'marte',
    versao: 1,
    tipo: 'BALCAO',
    unidade: 'g',
    classe: 'II',
    faixas: [{ max: 3200, e: 0.1, d: 0.01 }],
    criadoEm: '',
    atualizadoEm: '',
  }
  const jogos = (m: { pecas: PontoIndicacao['pecas'] }) => [...new Set(m.pecas.map((x) => x.padraoId))].sort()

  it('classe II com E2, F1 e M1: 2000 g sai de 1 kg E2 + 1 kg F1, não da peça M1 de 2 kg (qualquer ordem dos jogos)', () => {
    for (const padroes of [
      [m1, f1, e2],
      [e2, f1, m1],
    ]) {
      const m = montarCarga(2000, 'g', padroes, marte)
      expect(m.falta).toBe(0)
      expect(jogos(m)).toEqual(['e2', 'f1'])
      expect(pesosAtendemNaCarga(2000, m.pecas, marte, padroes)).toBe(true)
      for (const carga of [2400, 3200]) {
        const x = montarCarga(carga, 'g', padroes, marte)
        expect(x.falta, `${carga} g`).toBe(0)
        expect(jogos(x), `${carga} g`).not.toContain('m1')
        expect(pesosAtendemNaCarga(carga, x.pecas, marte, padroes), `${carga} g`).toBe(true)
      }
    }
    // Em empate de nominal, a peça do jogo de classe melhor
    expect(montarCarga(1000, 'g', [m1, f1, e2], marte).pecas).toEqual([ref('e2', 0)])
  })

  it('sem outra saída, a peça de classe pior entra (a carga fecha)', () => {
    const m = montarCarga(3200, 'g', [m1, e2], marte)
    expect(m.falta).toBe(0)
    expect(jogos(m)).toContain('m1')
  })

  it('classe III de 50 kg: continua com o M1', () => {
    const plataforma: Balanca = { ...balanca30, faixas: [{ max: 50, e: 0.01, d: 0.01 }] }
    const m = montarCarga(50, 'kg', [e2, f1, m1], plataforma)
    expect(m.falta).toBe(0)
    expect(jogos(m)).toEqual(['m1'])
  })

  it('pontos sugeridos e cálculo: sem o aviso "Classe dos pesos insuficiente"', () => {
    const padroes = [m1, f1, e2]
    const cargas = pontosSugeridos(marte, padroes)
    expect(cargas.at(-1)).toBe(3200)
    const k = calibracaoDe(
      cargas.map((c) => pontoDe(`p${c}`, c, c ? montarCarga(c, 'g', padroes, marte).pecas : [], c, { pecasManuais: false })),
    )
    k.repetibilidade = [{ id: 'r', carga: 1600, leituras: [1600, 1600.01, 1600, 1600, 1600.01] }]
    const { resultado } = calcularCalibracao(k, marte, padroes)
    expect(resultado.pendencias).toEqual([])
    expect(resultado.avisos.map((a) => a.mensagem).join('\n')).not.toMatch(/Classe dos pesos insuficiente/)
  })

  it('rascunho sem histórico: fora da classe I, sem o jogo de classe pior que a mínima quando os outros fecham Max', () => {
    const th: Padrao = { ...jogoDe('th', 'TH-01', []), tipo: 'TERMOHIGROMETRO', classe: '' }
    const td: Padrao = { ...jogoDe('td', 'TD-01', []), tipo: 'OUTRO', classe: '' }
    const todos = [m1, f1, e2, th, td]
    const ids = (b: Parameters<typeof padroesSemHistorico>[1]) => padroesSemHistorico(todos, b).map((p) => p.identificacao)
    // Classe II 3200 g / 0,1 g: a mínima é F2; E2 e F1 fecham os 3200 g
    expect(ids(marte)).toEqual(['JP-F1', 'JP-E2', 'TH-01'])
    // Só a classe (sem a balança): como antes
    expect(ids('II')).toEqual(['JP-M1', 'JP-F1', 'JP-E2', 'TH-01'])
    // Classe III de 30 kg / 10 g (mínima M2): o M1 serve
    expect(ids(balanca30)).toEqual(['JP-M1', 'JP-F1', 'JP-E2', 'TH-01'])
    // Classe II de 6 kg: sem o M1, E2 e F1 não fecham Max; o M1 fica
    expect(ids({ ...marte, faixas: [{ max: 6000, e: 0.1, d: 0.01 }] })).toEqual(['JP-M1', 'JP-F1', 'JP-E2', 'TH-01'])
  })

  it('rascunho sem histórico: o barômetro em toda classe (a pressão é obrigatória em toda calibração, POP 7.5)', () => {
    const th: Padrao = { ...jogoDe('th', 'TH-01', []), tipo: 'TERMOHIGROMETRO', classe: '' }
    const bar: Padrao = { ...jogoDe('bar', 'BAR-01', []), tipo: 'BAROMETRO', classe: '' }
    const td: Padrao = { ...jogoDe('td', 'TD-01', []), tipo: 'OUTRO', classe: '' }
    const todos = [m1, f1, e2, th, bar, td]
    const temBarometro = (b: Parameters<typeof padroesSemHistorico>[1]) =>
      padroesSemHistorico(todos, b).some((p) => p.tipo === 'BAROMETRO')
    expect(temBarometro(balanca30)).toBe(true)
    expect(temBarometro({ ...balanca30, classe: 'IIII', faixas: [{ max: 30, e: 0.02, d: 0.02 }] })).toBe(true)
    for (const classe of ['I', 'II', 'III', 'IIII', ''] as const) expect(temBarometro(classe), classe).toBe(true)
    expect(temBarometro(marte)).toBe(true)
    // A balança ainda não conhecida (folha em branco): também
    expect(temBarometro(null)).toBe(true)
    expect(temBarometro(undefined)).toBe(true)
    // O desativado, não
    expect(padroesSemHistorico([m1, { ...bar, ativo: false }], balanca30).some((p) => p.tipo === 'BAROMETRO')).toBe(false)
  })
})

describe('jogo sem a classe R111 (EMA desconhecido)', () => {
  const k = () =>
    calibracaoDe([0, 5, 10, 20, 30].map((c) => pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [semClasse]).pecas : [], c)))
  const semClasse = jogoDe('x', 'JP-X', [20_000, 10_000, 5000], { classe: '' })
  const pendencia =
    'Pesos sem EMA conhecido (OIML R 111): o jogo JP-X está sem a classe. O EMA entra na incerteza dos pesos (deriva, empuxo ou valor nominal); confira a classe no cadastro do padrão.'

  it('pelo certificado, pelo nominal ou pelo certificado sem U: pendência; com a classe, nada', () => {
    expect(calcularCalibracao(k(), balanca30, [semClasse]).resultado.pendencias).toEqual([pendencia])
    expect(calcularCalibracao(k(), balanca30, [{ ...semClasse, uso: 'NOMINAL' }]).resultado.pendencias).toEqual([pendencia])
    const semU = { ...semClasse, pesos: semClasse.pesos.map((w) => ({ ...w, incerteza: 0 })) }
    expect(calcularCalibracao(k(), balanca30, [semU]).resultado.pendencias).toEqual([pendencia])
    expect(calcularCalibracao(k(), balanca30, [{ ...semClasse, classe: 'M1' }]).resultado.pendencias).toEqual([])
  })

  it('revisão de um certificado de antes das regras (1.0.1/1.0.2): sem a pendência, os avisos da época e os mesmos números', () => {
    // A revisão de um certificado emitido sem `regrasDoPop` (e a de um registro de antes da classe I): a mesma visita
    for (const extra of [{ substituiId: 'cal-original' }, { substituiId: 'cal-original', calculoLegado: true }]) {
      for (const jogo of [semClasse, { ...semClasse, uso: 'NOMINAL' as const }]) {
        const revisao = { ...k(), ...extra }
        const r = calcularCalibracao(revisao, balanca30, [jogo]).resultado
        expect(r.pendencias, `${JSON.stringify(extra)} ${jogo.uso}`).toEqual([])
        expect(r.avisos.map((a) => a.mensagem).join('\n')).toMatch(/Classe dos pesos não conferida em .*: pesos sem a classe/)
        // Os números da revisão são os de antes (o cadastro do jogo não precisa mudar)
        expect(r.pontos.map((p) => p.texto.U)).toEqual(
          calcularCalibracao(k(), balanca30, [jogo]).resultado.pontos.map((p) => p.texto.U),
        )
      }
      // Pelo nominal sem a classe: o aviso de antes (não a pendência)
      const nominal = calcularCalibracao({ ...k(), ...extra }, balanca30, [{ ...semClasse, uso: 'NOMINAL' }]).resultado
      expect(nominal.avisos.map((a) => a.mensagem).join('\n')).toMatch(
        /^Pesos sem incerteza conhecida \(classe ou U do certificado\) em /m,
      )
    }
    // A revisão de um certificado emitido com as regras do POP: a pendência, como na calibração nova
    const comRegras = { ...k(), substituiId: 'cal-original', regrasDoPop: true }
    expect(calcularCalibracao(comRegras, balanca30, [semClasse]).resultado.pendencias).toEqual([pendencia])
  })
})

// ---- Mínimos do POP: pendência na calibração nova; aviso na revisão, no registro de antes e no "como encontrado" ----

describe('mínimos do POP na calibração nova (e o registro de antes)', () => {
  const J = jogoDe('j', 'JP-J', [20_000, 10_000, 5000, 2000, 1000])
  const quatro = () =>
    calibracaoDe(
      [0, 5, 20, 30].map((c) => pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [J]).pecas : [], c, { pecasManuais: false })),
    )
  const POUCOS = 'Erro de indicação: 4 pontos lidos; o POP pede no mínimo 5, contando o zero (7.7).'

  it('calibração nova: menos de 5 pontos é pendência; revisão, registro de antes e "como encontrado": aviso', () => {
    expect(calcularCalibracao(quatro(), balanca30, [J]).resultado.pendencias).toEqual([POUCOS])
    expect(entradaDoCalculo(quatro(), balanca30, [J]).regrasDoPop).toBe(true)
    // Revisão de um certificado emitido (a mesma visita, que pode ser de antes destas regras)
    const revisao = { ...quatro(), substituiId: 'k-original' }
    expect(calcularCalibracao(revisao, balanca30, [J]).resultado.pendencias).toEqual([])
    expect(
      calcularCalibracao(revisao, balanca30, [J])
        .resultado.avisos.map((a) => a.mensagem)
        .join('\n'),
    ).toMatch(/Erro de indicação com 4 ponto\(s\); o mínimo é 5/)
    // Registro de antes do cálculo da classe I
    expect(calcularCalibracao({ ...quatro(), calculoLegado: true }, balanca30, [J]).resultado.pendencias).toEqual([])
    // "Como encontrado" (registro anterior): nunca pendência pelos mínimos
    const ajustada = {
      ...calibracaoDe(
        quatro().indicacao.pontos.concat(pontoDe('p10', 10, montarCarga(10, 'kg', [J]).pecas, 10, { pecasManuais: false })),
      ),
      ajuste: { realizado: 'INTERNO' as const, descricao: '' },
    }
    ajustada.comoEncontrado = quatro().indicacao
    const r = calcularCalibracao(ajustada, balanca30, [J])
    expect(r.resultado.pendencias).toEqual([])
    expect(r.comoEncontrado?.pendencias).toEqual([])
    expect(regrasDoPopComoAviso(quatro())).toBe(false)
    expect(regrasDoPopComoAviso(quatro(), 'COMO_ENCONTRADO')).toBe(true)
  })

  it('o método "Decrescente" só aparece na escolha quando o ensaio já o tem (registro de antes)', () => {
    expect(metodosCarregamentoParaEscolher('CRESCENTE_DECRESCENTE')).toEqual(['CRESCENTE_DECRESCENTE', 'DESCONTINUO', 'CONTINUO'])
    expect(metodosCarregamentoParaEscolher()).not.toContain('DECRESCENTE')
    expect(metodosCarregamentoParaEscolher('DECRESCENTE')).toContain('DECRESCENTE')
  })

  it('"crescente e decrescente" sem a descida de um ponto: pendência na calibração nova; aviso na já medida e na revisão de antes', () => {
    const cinco = (metodo: EnsaioIndicacao['metodo'] = 'CRESCENTE_DECRESCENTE') =>
      calibracaoDe(
        [0, 5, 10, 20, 30].map((c) =>
          pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [J]).pecas : [], c, {
            pecasManuais: false,
            // A descida que falta (10 kg) e a de Max, a virada, que tem uma leitura só
            ...(c === 10 || c === 30 ? { decrescente: null } : {}),
          }),
        ),
        { metodo },
      )
    const FALTA = 'Erro de indicação: falta a leitura de descida em 10,00 kg (POP 7.7).'
    const AVISO = 'Erro de indicação “crescente e decrescente” sem a leitura de descida em 10,00 kg.'
    const de = (k: CalibracaoInput) => calcularCalibracao(k, balanca30, [J]).resultado
    expect(de(cinco()).pendencias).toEqual([FALTA])
    // Medida antes das regras (a mesma visita) e revisão de um certificado de antes delas: só o aviso
    for (const k of [
      { ...cinco(), minimosComoAviso: true },
      { ...cinco(), substituiId: 'k-original' },
    ]) {
      expect(de(k).pendencias).toEqual([])
      expect(de(k).avisos.map((a) => a.mensagem)).toContain(AVISO)
    }
    // A revisão de um certificado emitido com as regras: a pendência, como na calibração nova
    expect(de({ ...cinco(), substituiId: 'k-original', regrasDoPop: true }).pendencias).toEqual([FALTA])
    // Medido como "crescente contínuo" antes do método fixo pela classe (o caso real): sem descida, sem pendência
    expect(de(cinco('CONTINUO')).pendencias).toEqual([])
    expect(
      de(cinco('CONTINUO'))
        .avisos.map((a) => a.mensagem)
        .join('\n'),
    ).not.toMatch(/descida/)
  })

  it('a descida que falta: aviso na calibração medida antes de ela ser obrigatória (`descidaComoAviso`), sem soltar os outros mínimos', () => {
    // Medida na 1.0.3 em "crescente e decrescente" sem a descida (opcional na época): 10 kg sem ↓; a de Max é a virada
    const cinco = (pontos = [0, 5, 10, 20, 30]) =>
      calibracaoDe(
        pontos.map((c) =>
          pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [J]).pecas : [], c, {
            pecasManuais: false,
            ...(c === 10 || c === 30 ? { decrescente: null } : {}),
          }),
        ),
      )
    const AVISO = 'Erro de indicação “crescente e decrescente” sem a leitura de descida em 10,00 kg.'
    const de = (k: CalibracaoInput) => calcularCalibracao(k, balanca30, [J]).resultado
    const marcada = { ...cinco(), descidaComoAviso: true }
    expect(entradaDoCalculo(marcada, balanca30, [J]).descidaComoAviso).toBe(true)
    expect(de(marcada).pendencias).toEqual([])
    expect(de(marcada).avisos.map((a) => a.mensagem)).toContain(AVISO)
    // Os outros mínimos continuam pendências (a marca é só da descida)
    expect(de({ ...cinco([0, 10, 20, 30]), descidaComoAviso: true }).pendencias).toEqual([POUCOS])
    // Também na revisão de um certificado emitido com as regras (a mesma visita)
    expect(de({ ...marcada, substituiId: 'k-original', regrasDoPop: true }).pendencias).toEqual([])
  })

  it('ensaio passado para "crescente e decrescente" depois das leituras (`metodoMedido`): a descida que falta é pendência, mesmo medido antes das regras', () => {
    // O caso real: medido como "crescente contínuo" (só a subida) e trocado para o do POP pela tela
    const continuo = () =>
      calibracaoDe(
        [0, 5, 10, 20, 30].map((c) =>
          pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [J]).pecas : [], c, { pecasManuais: false, decrescente: null }),
        ),
        { metodo: 'CONTINUO' },
      )
    const trocado = (k: CalibracaoInput): CalibracaoInput => ({
      ...k,
      indicacao: { ...k.indicacao, metodo: 'CRESCENTE_DECRESCENTE', metodoMedido: 'CONTINUO' },
    })
    const FALTA =
      'Erro de indicação: falta a leitura de descida em 5,00 kg, 10,00 kg e 20,00 kg (POP 7.7). Sem ela, volte para “Crescente contínuo”, o método medido.'
    // Começada antes desta versão (a troca pode ter vindo antes das leituras, com a folha de antes impressa): sem "medido"
    const FALTA_DE_ANTES =
      'Erro de indicação: falta a leitura de descida em 5,00 kg, 10,00 kg e 20,00 kg (POP 7.7). Sem ela, volte para “Crescente contínuo”, o método com que a calibração foi começada.'
    const de = (k: CalibracaoInput) => calcularCalibracao(k, balanca30, [J]).resultado
    // Antes da troca: o método medido, sem pendência
    expect(de(continuo()).pendencias).toEqual([])
    expect(entradaDoCalculo(trocado(continuo()), balanca30, [J]).indicacao.metodoMedido).toBe('CONTINUO')
    // Calibração nova, medida antes das regras, marcada pela 1.0.4 e revisão de um certificado de antes delas: o
    // certificado não pode declarar uma descida que não foi feita
    expect(de(trocado(continuo())).pendencias).toEqual([FALTA])
    for (const k of [
      { ...continuo(), minimosComoAviso: true },
      { ...continuo(), descidaComoAviso: true },
      { ...continuo(), substituiId: 'k-original' },
    ])
      expect(de(trocado(k)).pendencias).toEqual([FALTA_DE_ANTES])
    // Com a descida medida, emite com o método novo
    const medido = trocado(continuo())
    medido.indicacao.pontos = medido.indicacao.pontos.map((p) => ({ ...p, decrescente: p.carga }))
    expect(de({ ...medido, minimosComoAviso: true }).pendencias).toEqual([])
    // "Decrescente" (só a descida) passado para "crescente e decrescente": a subida que falta também
    const soDescida = calibracaoDe(
      [0, 5, 10, 20, 30].map((c) =>
        pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [J]).pecas : [], c, { pecasManuais: false, crescente: c ? null : 0 }),
      ),
      { metodo: 'CRESCENTE_DECRESCENTE', metodoMedido: 'DECRESCENTE' },
    )
    expect(de({ ...soDescida, minimosComoAviso: true }).pendencias).toEqual([
      'Erro de indicação: falta a leitura de subida em 5,00 kg, 10,00 kg, 20,00 kg e 30,00 kg (POP 7.7). Sem ela, volte para “Decrescente”, o método com que a calibração foi começada.',
    ])
    expect(de(soDescida).pendencias).toEqual([
      'Erro de indicação: falta a leitura de subida em 5,00 kg, 10,00 kg, 20,00 kg e 30,00 kg (POP 7.7). Sem ela, volte para “Decrescente”, o método medido.',
    ])
    // O motor escreve os nomes dos métodos como a tela
    for (const [m, { label }] of Object.entries(METODOS_CARREGAMENTO))
      expect(NOMES_METODO_CARREGAMENTO[m as EnsaioIndicacao['metodo']]).toBe(label)
  })

  it('trocado depois das leituras e a classe trocada depois: o método que não é o do POP nem o medido é pendência', () => {
    // O caminho da conferência: medido na classe III em "crescente e decrescente" só com as subidas, classe → I, "Usar o
    // método do POP" ("crescente com descarga", guardando o medido) e classe → III de novo, fora do formulário
    const subidas = () =>
      calibracaoDe(
        [0, 5, 10, 20, 30].map((c) =>
          pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [J]).pecas : [], c, { pecasManuais: false, decrescente: null }),
        ),
        { metodo: 'DESCONTINUO', metodoMedido: 'CRESCENTE_DECRESCENTE' },
      )
    const de = (k: CalibracaoInput, classe: Balanca['classe'] = 'III') =>
      calcularCalibracao(k, { ...balanca30, classe }, [J]).resultado.pendencias
    expect(de(subidas())).toEqual([
      'Erro de indicação: medido como “Crescente e decrescente” e trocado depois para “Crescente com descarga”, que não é o método do POP nesta classe; volte para o medido (POP 7.7).',
    ])
    // Também medida antes das regras ou antes da descida obrigatória (a marca não esconde um método que não foi usado);
    // começada antes desta versão, a troca pode ter vindo antes das leituras: sem "medido"
    const DE_ANTES =
      'Erro de indicação: começada antes desta versão com “Crescente e decrescente” e trocada depois para “Crescente com descarga”, que não é o método do POP nesta classe; volte para o de antes (POP 7.7).'
    expect(de({ ...subidas(), minimosComoAviso: true })).toEqual([DE_ANTES])
    expect(de({ ...subidas(), descidaComoAviso: true })).toEqual([DE_ANTES])
    // Na classe I, o método de agora é o do POP: só o que ele pede (e o resto das regras da classe I)
    expect(de(subidas(), 'I').join(' ')).not.toMatch(/Erro de indicação/)
    // O medido que também não é o do POP: as duas saídas
    const continuo = { ...subidas(), indicacao: { ...subidas().indicacao, metodoMedido: 'CONTINUO' as const } }
    expect(de(continuo)).toEqual([
      'Erro de indicação: medido como “Crescente contínuo” e trocado depois para “Crescente com descarga”, que não é o método do POP nesta classe (“Crescente e decrescente”); use o do POP ou volte para o medido (POP 7.7).',
    ])
    expect(de({ ...continuo, descidaComoAviso: true })).toEqual([
      'Erro de indicação: começada antes desta versão com “Crescente contínuo” e trocada depois para “Crescente com descarga”, que não é o método do POP nesta classe (“Crescente e decrescente”); use o do POP ou volte para o de antes (POP 7.7).',
    ])
    // Sem a troca (o método é o medido, mesmo fora do POP): sem essa pendência
    const semTroca = { ...subidas(), indicacao: { ...subidas().indicacao, metodoMedido: undefined } }
    expect(de(semTroca).join(' ')).not.toMatch(/trocado depois/)
  })
})

describe('revisão: as regras do POP valem quando o certificado revisado foi emitido com elas', () => {
  it('sem a marca (certificado da 1.0.2 ou anterior): avisos; com a marca: pendências; legado e "como encontrado": avisos', () => {
    const k = { opcoes: { ...calibracaoVazia().opcoes, conveccao: 'NAO_CONSIDERAR' as const } }
    expect(regrasDoPopComoAviso(k)).toBe(false)
    expect(regrasDoPopComoAviso({ ...k, substituiId: 'orig' })).toBe(true)
    expect(regrasDoPopComoAviso({ ...k, substituiId: 'orig', regrasDoPop: true })).toBe(false)
    expect(regrasDoPopComoAviso({ ...k, substituiId: 'orig', regrasDoPop: true }, 'COMO_ENCONTRADO')).toBe(true)
    expect(regrasDoPopComoAviso({ ...k, substituiId: 'orig', calculoLegado: true })).toBe(true)
  })
})

describe('revisão de um certificado de antes das regras: a leitura absurda que a revisão trouxe é pendência', () => {
  const J = jogoDe('j', 'JP-J', [20_000, 10_000, 5000, 2000, 1000])
  const cinco = (leitura20: number) =>
    calibracaoDe(
      [0, 5, 10, 20, 30].map((c) =>
        pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [J]).pecas : [], c === 20 ? leitura20 : c, { pecasManuais: false }),
      ),
    )
  const original = cinco(20)
  const revisao = { ...cinco(20000), substituiId: 'orig' }
  const PENDENCIA = 'Erro de indicação, ponto de 20,00 kg: leitura 20 000,00 fora do esperado; confira a digitação.'
  const sem = (t: string) => t.replace(/[   ]/g, ' ')

  it('com as leituras do certificado revisado: a mudada é pendência; a que já estava nele, aviso', () => {
    expect(leiturasOriginais(original).indicacao.p20).toEqual({ crescente: 20, decrescente: 20 })
    expect(calcularCalibracao(revisao, balanca30, [J], original).resultado.pendencias.map(sem)).toEqual([PENDENCIA])
    // Sem o original (a tela, que não o tem): só o aviso, e o servidor confere
    expect(calcularCalibracao(revisao, balanca30, [J]).resultado.pendencias).toEqual([])
    // A mesma leitura já estava no certificado revisado: aviso
    expect(calcularCalibracao(revisao, balanca30, [J], cinco(20000)).resultado.pendencias).toEqual([])
    // Na calibração nova, pendência sempre
    expect(calcularCalibracao(cinco(20000), balanca30, [J]).resultado.pendencias.map(sem)).toEqual([PENDENCIA])
  })
})

// ---- Ponto sem nenhum peso padrão: a carga só digitada não vai para o certificado sem rastreabilidade ----

describe('ponto lido sem nenhum peso padrão', () => {
  /** O jogo da calibração pronta: 10, 10, 10 e 5 kg (a menor peça é de 5 kg). */
  const J = jogoDe('j', 'JP-J', [10_000, 10_000, 10_000, 5000])
  const SEM_PESO = (carga: string) =>
    `Erro de indicação, ponto de ${carga}: nenhum peso padrão no ponto; escolha os pesos do ponto ou, nos padrões, um jogo que faça essa carga.`
  const automatico = (carga: number, leitura: number | null = carga) =>
    pontoDe(`p${carga}`, carga, montarPonto(carga, 0, 0, 'kg', [J], balanca30).pecas, leitura, { pecasManuais: false })
  const pendenciasDe = (k: CalibracaoInput) =>
    calcularCalibracao(k, balanca30, [J]).resultado.pendencias.map((t) => t.replace(/[   ]/g, ' '))

  it('carga menor que a menor peça do jogo (2 kg com peças de 5 e 10 kg): a montagem fica vazia e o ponto é pendência', () => {
    expect(montarPonto(2, 0, 0, 'kg', [J], balanca30)).toEqual({ pecas: [], diferenca: -2 })
    const k = calibracaoDe([0, 2, 10, 20, 30].map((c) => automatico(c, c === 2 ? 2.01 : c)))
    expect(pendenciasDe(k)).toEqual([SEM_PESO('2,00 kg')])
    // O ponto continua na tela (a referência é a carga digitada), mas a emissão fica parada
    expect(calcularCalibracao(k, balanca30, [J]).resultado.pontos[1].referencia).toBe(2)
  })

  it('peças tiradas à mão do ponto ("Usar estas peças" com a lista vazia): pendência', () => {
    const pontos = [0, 5, 10, 20, 30].map((c) => automatico(c))
    pontos[2] = { ...pontos[2], pecas: [], pecasManuais: true }
    expect(pendenciasDe(calibracaoDe(pontos))).toEqual([SEM_PESO('10,00 kg')])
  })

  it('revisão de certificado de antes das regras e registro antigo: só o aviso "Carga sem padrões"', () => {
    const pontos = [0, 5, 10, 20, 30].map((c) => automatico(c))
    pontos[2] = { ...pontos[2], pecas: [], pecasManuais: true }
    for (const k of [
      { ...calibracaoDe(pontos), substituiId: 'orig' },
      { ...calibracaoDe(pontos), calculoLegado: true },
    ]) {
      const { resultado } = calcularCalibracao(k, balanca30, [J])
      expect(resultado.pendencias).toEqual([])
      expect(resultado.avisos.map((a) => a.mensagem).join('\n')).toMatch(/Carga sem padrões em 10,00 kg/)
    }
  })
})

// ---- Peça de jogo "valor do certificado" sem a U no cadastro ------------------------------------------

describe('peça sem a U num jogo pelo valor do certificado', () => {
  /** Jogo E2 com a peça de 100 g de correção −0,12 mg e U em branco (0). */
  const E2 = jogoDe('e', 'JP-E2', [100, 50, 20], { classe: 'E2' })
  E2.pesos[0] = { ...E2.pesos[0], correcao: -0.12, incerteza: 0 }

  it('entra pelo nominal (como sempre), mas leva a correção ignorada para o aviso', () => {
    const p = pecaParaCalculo(E2, E2.pesos[0], 'g')
    expect(p).toMatchObject({ usarCertificado: false, correcao: 0, incerteza: 0, correcaoSemU: -0.00012 })
    // Com a U, pelo certificado (sem a marca); pelo nominal de propósito, também sem a marca
    expect(pecaParaCalculo(E2, E2.pesos[1], 'g')).toMatchObject({ usarCertificado: true })
    expect(pecaParaCalculo(E2, E2.pesos[1], 'g').correcaoSemU).toBeUndefined()
    expect(pecaParaCalculo({ ...E2, uso: 'NOMINAL' }, E2.pesos[0], 'g').correcaoSemU).toBeUndefined()
  })

  it('classe III com a peça usada: aviso de atenção, e o cálculo pelo nominal continua', () => {
    const b = { ...balanca30, unidade: 'g' as const, faixas: [{ max: 300, e: 0.1, d: 0.1 }] }
    const pontos = [0, 20, 50, 100, 170].map((c) =>
      pontoDe(`p${c}`, c, c ? montarCarga(c, 'g', [E2]).pecas : [], c, { pecasManuais: false }),
    )
    const k = { ...calibracaoDe(pontos), repetibilidade: [{ id: 'r', carga: 150, leituras: [150, 150, 150.1, 150, 150] }] }
    const { resultado } = calcularCalibracao(k, b, [E2])
    expect(resultado.avisos.map((a) => `${a.nivel}: ${a.mensagem}`)).toContain(
      'atencao: Correção do certificado ignorada em peça de 100 g do jogo JP-E2: peça sem a U no cadastro entra pelo valor nominal. Complete a U no cadastro do padrão.',
    )
    // O valor de referência é o nominal (sem a correção de −0,12 mg)
    expect(resultado.pontos[3].referencia).toBe(100)
    // Sem a peça de 100 g nos pontos, nada
    const semEla = { ...k, indicacao: { ...k.indicacao, pontos: pontos.slice(0, 3) } }
    expect(
      calcularCalibracao(semEla, b, [E2])
        .resultado.avisos.map((a) => a.mensagem)
        .join('\n'),
    ).not.toMatch(/Correção do certificado ignorada/)
  })
})

describe('revisão: o zero antes da excentricidade (método 3) também vem do certificado revisado', () => {
  it('leiturasOriginais leva as referências das posições', () => {
    const k = calibracaoDe([])
    k.excentricidade = {
      aplicavel: true,
      motivo: '',
      carga: 10,
      metodo: 3,
      posicoes: [
        { rotulo: 'Centro', leitura: 10, referencia: 0 },
        { rotulo: 'A', leitura: 10.01, referencia: null },
      ],
    }
    expect(leiturasOriginais(k).referenciasExcentricidade).toEqual([0, null])
  })
})

// ---- A ordem dos pontos: o certificado diz "cargas crescentes" ---------------------------------------------------

describe('pontos em ordem de carga (o ponto acrescentado no fim com carga menor)', () => {
  const J = jogoDe('j', 'JP-J', [20_000, 10_000, 5000, 2000, 1000])
  const ponto = (c: number, leitura: number | null = c) =>
    pontoDe(`p${c}`, c, c ? montarCarga(c, 'kg', [J]).pecas : [], leitura, { pecasManuais: false })
  const cargas = (pontos: ReadonlyArray<{ carga: number }>) => pontos.map((p) => p.carga)

  it('ordena as cargas e deixa os pontos sem carga onde estão (o zero e a carga esquecida)', () => {
    expect(cargas(pontosEmOrdemDeCarga([0, 10, 20, 30, 5].map((carga) => ({ carga }))))).toEqual([0, 5, 10, 20, 30])
    // A carga esquecida (0) continua no lugar dela: a pendência cita o nº do ponto na tabela
    expect(cargas(pontosEmOrdemDeCarga([0, 10, 0, 5].map((carga) => ({ carga }))))).toEqual([0, 5, 0, 10])
    // Já em ordem: o mesmo array (a tela não grava nada)
    const ordem = [0, 5, 10].map((carga) => ({ carga }))
    expect(pontosEmOrdemDeCarga(ordem)).toBe(ordem)
    // Mesma carga: a ordem de antes (estável)
    expect(
      pontosEmOrdemDeCarga([
        { carga: 10, id: 'a' },
        { carga: 5, id: 'b' },
        { carga: 10, id: 'c' },
      ]).map((p) => p.id),
    ).toEqual(['b', 'a', 'c'])
  })

  it('calibração nova: a entrada do cálculo, o resultado (resumo e certificado) saem em ordem crescente', () => {
    for (const metodo of ['CONTINUO', 'CRESCENTE_DECRESCENTE', 'DESCONTINUO'] as const) {
      const k = calibracaoDe(
        [0, 10, 20, 30, 5].map((c) => ponto(c)),
        { metodo },
      )
      expect(cargas(entradaDoCalculo(k, balanca30, [J]).indicacao.pontos), metodo).toEqual([0, 5, 10, 20, 30])
      const { resultado } = calcularCalibracao(k, balanca30, [J])
      expect(cargas(resultado.pontos), metodo).toEqual([0, 5, 10, 20, 30])
      // O ponto continua o mesmo (o id, as leituras)
      expect(resultado.pontos[1]).toMatchObject({ id: 'p5', carga: 5 })
      expect(resultado.pendencias, metodo).toEqual([])
    }
    // O "como encontrado" da mesma calibração também
    const k = calibracaoDe([0, 10, 20, 30, 5].map((c) => ponto(c)))
    const comAntes = {
      ...k,
      ajuste: { realizado: 'INTERNO' as const, descricao: '' },
      comoEncontrado: structuredClone(k.indicacao),
    }
    expect(cargas(calcularCalibracao(comAntes, balanca30, [J]).comoEncontrado!.pontos)).toEqual([0, 5, 10, 20, 30])
  })

  it('o registro de antes das regras (revisão de um certificado 1.0.2): a ordem como na época', () => {
    const k = { ...calibracaoDe([0, 10, 20, 30, 5].map((c) => ponto(c))), substituiId: 'cal-original' }
    expect(cargas(entradaDoCalculo(k, balanca30, [J]).indicacao.pontos)).toEqual([0, 10, 20, 30, 5])
    const legado = { ...calibracaoDe([0, 10, 20, 30, 5].map((c) => ponto(c))), calculoLegado: true }
    expect(cargas(calcularCalibracao(legado, balanca30, [J]).resultado.pontos)).toEqual([0, 10, 20, 30, 5])
  })
})

describe('cargas em que o EMA muda: o plano copiado e a folha impressa antes da 1.0.5 (POP 7.7)', () => {
  const prix: Balanca = {
    ...BALANCA_VAZIA,
    id: 'prix',
    versao: 1,
    tipo: 'BALCAO',
    classe: 'III',
    tipoFaixas: 'MULTI_INTERVALO',
    faixas: [
      { max: 6, e: 0.002, d: 0.002 },
      { max: 15, e: 0.005, d: 0.005 },
      { max: 32, e: 0.01, d: 0.01 },
    ],
    min: 0.04,
    criadoEm: '',
    atualizadoEm: '',
  }
  const b30: Balanca = { ...prix, id: 'b30', tipoFaixas: 'UNICA', faixas: [{ max: 30, e: 0.01, d: 0.01 }], min: 0 }
  const pontos = (cargas: number[], nivel = 0) =>
    cargas.map((carga, i) => ({
      id: `p${i}`,
      carga,
      pecas: [],
      pecasManuais: false,
      crescente: null,
      decrescente: null,
      nivelSubstituicao: carga > 20 ? nivel : 0,
    }))
  const plano = (cargas: number[], nivel = 0) => ({
    indicacao: { ...calibracaoVazia().indicacao, pontos: pontos(cargas, nivel) },
  })
  const cargas = (k: { indicacao: { pontos: Array<{ carga: number }> } }) => k.indicacao.pontos.map((p) => p.carga)

  it('o plano das sugestões até a 1.0.4, copiado sem a declaração de conformidade, fica com o mínimo do cg-18', () => {
    const k = plano([0, 0.04, 1, 4, 8, 10, 16, 20, 24, 32])
    expect(cargas(planoDoHistoricoSemConformidade(k, prix, [], false))).toEqual([0, 0.04, 8, 16, 24, 32])
    // Os pontos que ficam são os mesmos (o id, as peças)
    expect(planoDoHistoricoSemConformidade(k, prix, [], false).indicacao.pontos[2]).toBe(k.indicacao.pontos[4])
    // Com a declaração pedida, sem classe ou sem cargas em que o EMA muda: o plano como veio
    expect(planoDoHistoricoSemConformidade(k, prix, [], true)).toBe(k)
    expect(planoDoHistoricoSemConformidade(k, { ...prix, classe: '' }, [], false)).toBe(k)
    const semElas = plano([0, 0.04, 8, 16, 24, 32])
    expect(planoDoHistoricoSemConformidade(semElas, prix, [], false)).toBe(semElas)
    expect(planoDoHistoricoSemConformidade(k, undefined, [], false)).toBe(k)
  })

  it('a carga acordada fica; com menos de 5 cargas, entram as sugeridas que faltam', () => {
    // 30 kg × 10 g: 5 kg = 500e e 20 kg = 2000e saem; 10 kg (acordada) fica; 0, 10 e 30 são só 3: entram 7,5, 15 e 22,5
    const k = plano([0, 5, 10, 20, 30])
    const r = planoDoHistoricoSemConformidade(k, b30, [], false)
    expect(cargas(r)).toEqual([0, 7.5, 10, 15, 22.5, 30])
    expect(r.indicacao.pontos.find((p) => p.carga === 7.5)).toMatchObject({
      pecas: [],
      pecasManuais: false,
      crescente: null,
      decrescente: null,
      nivelSubstituicao: 0,
    })
    expect(new Set(r.indicacao.pontos.map((p) => p.id)).size).toBe(6)
    // Com 5 ou mais depois de tirar, nada entra: 0; 5; 7,5; 15; 20; 22,5; 30 → 0; 7,5; 15; 22,5; 30
    expect(cargas(planoDoHistoricoSemConformidade(plano([0, 5, 7.5, 15, 20, 22.5, 30]), b30, [], false))).toEqual([
      0, 7.5, 15, 22.5, 30,
    ])
  })

  it('a carga em que o EMA muda que também é do mínimo do cg-18 fica; a das etapas de substituição também', () => {
    // 80 kg × 10 g: 2000e = 20 kg = 25 % de Max
    const b80 = { ...b30, faixas: [{ max: 80, e: 0.01, d: 0.01 }] }
    expect(cargas(planoDoHistoricoSemConformidade(plano([0, 5, 20, 40, 60, 80]), b80, [], false))).toEqual([0, 20, 40, 60, 80])
    // Rodoviária: o ponto montado sobre as etapas de substituição é da sequência delas e fica
    const k = plano([0, 5, 7.5, 15, 20, 22.5, 30], 1)
    expect(cargas(planoDoHistoricoSemConformidade(k, b30, [], false))).toEqual([0, 7.5, 15, 22.5, 30])
    const comEtapa = plano([0, 5, 7.5, 15, 22.5, 25, 30], 1)
    comEtapa.indicacao.pontos[5] = { ...comEtapa.indicacao.pontos[5], carga: 20, nivelSubstituicao: 1 }
    expect(cargas(planoDoHistoricoSemConformidade(comEtapa, b30, [], false))).toEqual(
      [0, 7.5, 15, 22.5, 20, 30].sort((a, b) => a - b),
    )
  })

  it('a folha impressa antes da 1.0.5 (com as cargas em que o EMA muda): a sugestão as mantém, e o aviso diz as que faltam', () => {
    const k = { ...calibracaoVazia(), indicacao: { ...calibracaoVazia().indicacao, pontos: [] } }
    expect(comCargasDoEma(k)).toBe(false)
    expect(comCargasDoEma({ ...k, cargasDoEmaNaFolha: true })).toBe(true)
    expect(comCargasDoEma({ ...k, conformidade: { ...k.conformidade, solicitada: true } })).toBe(true)
    // Sem os pontos: nada a avisar (a sugestão já as traz)
    expect(avisoCargasDaConformidade({ ...k, cargasDoEmaNaFolha: true }, prix)).toBeNull()
    const semElas = { ...k, cargasDoEmaNaFolha: true, indicacao: { ...k.indicacao, pontos: pontos([0, 0.04, 8, 16, 24, 32]) } }
    expect(avisoCargasDaConformidade(semElas, prix)).toBe(
      'A folha de campo desta calibração foi impressa antes da versão 1.0.5, com as cargas em que o EMA muda, e faltam 1 kg, 4 kg, 10 kg e 20 kg no erro de indicação: se foram medidas, inclua-as.',
    )
    // Sem a marca e sem o pedido: o mínimo do cg-18 basta
    expect(avisoCargasDaConformidade({ ...semElas, cargasDoEmaNaFolha: undefined }, prix)).toBeNull()
  })
  it('declaração pedida depois da folha: as linhas das cargas em que o EMA muda sem leitura não contam (não foram medidas)', () => {
    // 32 kg × 5 g, classe III: 500e = 2,5 kg e 2000e = 10 kg. "Sugerir pontos" depois do pedido traz as duas, em branco
    const b32: Balanca = { ...b30, id: 'b32', faixas: [{ max: 32, e: 0.005, d: 0.005 }], min: 0.1 }
    const lido = (carga: number) => ({ crescente: carga, decrescente: carga })
    const linhas = pontos([0, 0.1, 2.5, 8, 10, 16, 24, 32]).map((p) =>
      p.carga === 2.5 || p.carga === 10 ? p : { ...p, ...lido(p.carga) },
    )
    const k = {
      ...calibracaoVazia(),
      conformidade: { ...calibracaoVazia().conformidade, solicitada: true },
      indicacao: { ...calibracaoVazia().indicacao, pontos: linhas },
    }
    expect(avisoCargasDaConformidade(k, b32)).toBe(
      'Declaração de conformidade pedida: o POP (7.7) pede também as cargas em que o EMA muda, e faltam 2,5 kg e 10 kg no erro de indicação.',
    )
    // Lida uma delas (só a subida já vale): falta a outra
    const umaLida = {
      ...k,
      indicacao: { ...k.indicacao, pontos: linhas.map((p) => (p.carga === 10 ? { ...p, crescente: 10 } : p)) },
    }
    expect(avisoCargasDaConformidade(umaLida, b32)).toBe(
      'Declaração de conformidade pedida: o POP (7.7) pede também as cargas em que o EMA muda, e falta 2,5 kg no erro de indicação.',
    )
    // Ainda sem nenhuma carga lida (só o zero que a sugestão preenche): os pontos são o plano, e ele as tem
    const plano = {
      ...k,
      indicacao: {
        ...k.indicacao,
        pontos: pontos([0, 0.1, 2.5, 8, 10, 16, 24, 32]).map((p) => (p.carga === 0 ? { ...p, ...lido(0) } : p)),
      },
    }
    expect(avisoCargasDaConformidade(plano, b32)).toBeNull()
    // A folha (antes de sair) olha o plano: as linhas em branco vão ser medidas
    expect(avisoDaFolhaCargasDaConformidade(k, b32)).toBeNull()
  })
})

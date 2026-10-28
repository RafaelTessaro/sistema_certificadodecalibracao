import { describe, expect, it } from 'vitest'
import { exemploRodoviaria } from '../server/pdf/exemplosCertificado.ts'
import {
  arDoAmbiente,
  calcularCalibracao,
  cargaDasPecas,
  entradaDoCalculo,
  montarCarga,
  montarPonto,
  opcoesComoEncontrado,
  pecaParaCalculo,
  termicaDoAmbiente,
} from './calibracao.ts'
import { AMBIENTE_VAZIO, BALANCA_VAZIA, calibracaoVazia, OPCOES_CALCULO_PADRAO, opcoesDaClasse, PADRAO_VAZIO } from './dominio.ts'
import { calcular } from './metrologia/index.ts'
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
    retornoZero: null,
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
    const o = r.resultado.pontos[1].crescente!
    expect(o.correcaoEmpuxo).toBeCloseTo(0.000015653, 9)
    expect(o.uConveccao).toBeCloseTo(0.00008 / Math.sqrt(3), 12)
    // Deriva = EMA (o padrão da empresa, D4): u(δm_D) = 0,3 mg/√3 domina; U = 0,000 398 g
    expect(r.resultado.pontos[1].texto.U).toBe('0,00040')
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
    expect(ce.pontos[1].crescente!.correcaoEmpuxo).toBeCloseTo(0.000015653, 9)
    expect(ce.pendencias).toEqual([])
    const avisos = ce.avisos.map((a) => a.mensagem).join('\n')
    expect(avisos).not.toMatch(/empuxo estimado sem a densidade do ar|7\.1\.2-5c/)
    // O U do "como encontrado" fica perto do final (com a 5d era cerca de 7 vezes maior)
    const uFinal = r.resultado.pontos[1].crescente!.U
    const uAntes = ce.pontos[1].crescente!.U
    expect(uAntes / uFinal).toBeLessThan(1.05)
    expect(ce.pontos[1].texto.U).toBe('0,00040')
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
    // Referência: as opções da época (5c) aplicadas também ao "como encontrado"
    const ref = calcular({
      ...entradaDoCalculo(antigo, analitica, [jogoE2], antigo.comoEncontrado, 'COMO_ENCONTRADO'),
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

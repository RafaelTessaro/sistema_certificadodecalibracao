// O que bloqueia a emissão do certificado (`pendenciasEmissao`): a rastreabilidade dos padrões (acreditação
// Cgcre do laboratório) e a pressão atmosférica com o barômetro que a mediu (obrigatória em toda classe, POP 7.5; só
// aviso na calibração medida quando ela era opcional, `avisosEmissao`).
// E, como o servidor junta (`pendenciasDa`), as do cálculo: a densidade dos jogos no empuxo pela densidade do ar
// medida, também no "como encontrado" da classe I ajustada logo antes.

import { describe, expect, it } from 'vitest'
import { arDoAmbiente, calcularCalibracao, termicaDoAmbiente } from './calibracao.ts'
import {
  AMBIENTE_VAZIO,
  AVISO_SEM_PRESSAO,
  AVISO_SEM_TERMOMETRO_DUAS_ENTRADAS,
  avisosEmissao,
  BALANCA_VAZIA,
  balancaIdentificada,
  calibracaoVazia,
  normalizarCalibracao,
  OPCOES_CALCULO_PADRAO,
  opcoesDaClasse,
  PADRAO_VAZIO,
  padraoNaData,
  padroesDaCalibracao,
  pendenciasAmbiente,
  PENDENCIA_TERMOMETRO_DUAS_ENTRADAS,
  pendenciasEmissao,
  proximaAlemDoPop,
  semTermometroDuasEntradas,
  versoesAnterioresApos,
} from './dominio.ts'
import type { Balanca, CalibracaoInput, ClasseExatidao, EnsaioIndicacao, Padrao } from './tipos.ts'

const padrao = (x: Partial<Padrao>): Padrao =>
  ({
    ...PADRAO_VAZIO,
    id: x.identificacao ?? 'p',
    identificacao: 'JP-01',
    tipo: 'PESOS',
    ativo: true,
    certificado: 'LAB-1/2026',
    laboratorio: 'Laboratório Exemplo',
    acreditacao: 'CAL 0123',
    validade: '2099-01-01',
    ...x,
  }) as Padrao
const pesos = padrao({})
const th = padrao({ identificacao: 'TH-01', tipo: 'TERMOHIGROMETRO' })
const br = padrao({ identificacao: 'BR-01', tipo: 'BAROMETRO' })

function pendencias(padroes: Padrao[], pressao: number | null, classe?: ClasseExatidao) {
  const k: CalibracaoInput = {
    ...calibracaoVazia(),
    dataCalibracao: '2026-10-20',
    tecnicoId: 't1',
    localEndereco: 'Rua A, 1 – Rio Claro/SP',
    padroesIds: padroes.map((p) => p.id),
    ambiente: { temperaturaInicial: 22, temperaturaFinal: 23, umidadeInicial: 50, umidadeFinal: 51, pressao },
  }
  return pendenciasEmissao(k, { padroes, hoje: '2026-10-28', temPesos: true, ...(classe !== undefined ? { classe } : {}) })
}

const SEM_PRESSAO = 'Registre a pressão atmosférica, medida com o barômetro (escolha-o nos padrões; POP 7.5).'

describe('pendências da emissão', () => {
  it('sem pendência com padrões acreditados e a pressão medida com o barômetro (classe III)', () => {
    expect(pendencias([pesos, th, br], 925, 'III')).toEqual([])
  })

  it('padrão sem a acreditação Cgcre do laboratório: a declaração de rastreabilidade seria falsa', () => {
    expect(pendencias([pesos, { ...th, acreditacao: '  ' }, br], 925)).toEqual([
      'O padrão TH-01 está sem a acreditação Cgcre do laboratório que o calibrou.',
    ])
  })

  it('pressão sem barômetro nos padrões, e barômetro sem a pressão registrada', () => {
    expect(pendencias([pesos, th], 925)).toEqual([
      'Pressão informada sem barômetro nos padrões: escolha o barômetro usado (POP 6.2).',
    ])
    expect(pendencias([pesos, th, br], null)).toEqual(['Registre a pressão atmosférica medida com o BR-01 (POP 7.5).'])
    expect(pendencias([pesos, th, br, { ...br, id: 'BR-02', identificacao: 'BR-02' }], null)).toEqual([
      'Registre a pressão atmosférica medida com o BR-01 ou BR-02 (POP 7.5).',
    ])
    expect(pendencias([pesos, th, br], 925)).toEqual([])
  })

  it('a pressão é obrigatória em toda classe e sem classe, medida com o barômetro (POP 7.5)', () => {
    for (const classe of ['II', 'III', 'IIII', ''] as const) {
      expect(pendencias([pesos, th], null, classe), classe).toEqual([SEM_PRESSAO])
      expect(pendencias([pesos, th, br], 1013, classe), classe).toEqual([])
    }
    // Sem a classe informada (quem chama não sabe a balança): também
    expect(pendencias([pesos, th], null)).toEqual([SEM_PRESSAO])
  })

  it('medida quando a pressão era opcional: nas classes III e IIII e sem classe, só o aviso; nas I e II, pendência', () => {
    const k = (extra: Partial<CalibracaoInput>, pressao: number | null = null): CalibracaoInput => ({
      ...calibracaoVazia(),
      dataCalibracao: '2026-10-20',
      tecnicoId: 't1',
      localEndereco: 'Rua A, 1 – Rio Claro/SP',
      padroesIds: ['JP-01'],
      ambiente: { temperaturaInicial: 22, temperaturaFinal: 23, umidadeInicial: 50, umidadeFinal: 51, pressao },
      ...extra,
    })
    const contexto = (classe: ClasseExatidao, padroes = [pesos, th]) => ({ padroes, hoje: '2026-10-28', temPesos: true, classe })
    // Medida (ou com a folha impressa) antes da 1.0.5, a revisão de um certificado emitido sem ela, ou já com os mínimos
    // do POP como avisos (medida antes das regras)
    for (const marca of [{ pressaoComoAviso: true }, { minimosComoAviso: true }, { substituiId: 'k-original' }])
      for (const classe of ['III', 'IIII', ''] as const) {
        expect(pendenciasEmissao(k(marca), contexto(classe)), classe).toEqual([])
        expect(avisosEmissao(k(marca), contexto(classe)), classe).toEqual([AVISO_SEM_PRESSAO])
      }
    // Como até a 1.0.4: o barômetro sem a pressão, ou a pressão sem ele, continuam pendências (sem o aviso)
    const antes = k({ pressaoComoAviso: true })
    expect(pendenciasEmissao(antes, contexto('III', [pesos, th, br]))).toEqual([
      'Barômetro escolhido sem a pressão registrada (tire BR-01 dos padrões ou registre a pressão).',
    ])
    expect(avisosEmissao(antes, contexto('III', [pesos, th, br]))).toEqual([])
    expect(pendenciasEmissao(k({ pressaoComoAviso: true }, 925), contexto('III'))).toEqual([
      'Pressão informada sem barômetro nos padrões: escolha o barômetro usado ou apague a pressão.',
    ])
    expect(pendenciasEmissao(k({ pressaoComoAviso: true }, 925), contexto('III', [pesos, th, br]))).toEqual([])
    // Na classe II (e na I) ela já era obrigatória: pendência, sem o aviso
    expect(pendenciasEmissao(antes, contexto('II'))).toEqual([SEM_PRESSAO])
    expect(avisosEmissao(antes, contexto('II'))).toEqual([])
    // A calibração nova: pendência, sem o aviso
    expect(avisosEmissao(k({}), contexto('III'))).toEqual([])
  })
})

describe('pendências da classe I', () => {
  const e2 = padrao({ identificacao: 'JP-E2', classe: 'E2', densidade: 7950, incertezaDensidade: 70 })
  const classeI = (padroes: Padrao[], opcoes: Partial<CalibracaoInput['opcoes']> = {}) => {
    const k: CalibracaoInput = {
      ...calibracaoVazia(),
      dataCalibracao: '2026-10-20',
      tecnicoId: 't1',
      localEndereco: 'Rua A, 1 – Rio Claro/SP',
      padroesIds: padroes.map((p) => p.id),
      ambiente: { temperaturaInicial: 22, temperaturaFinal: 22.4, umidadeInicial: 50, umidadeFinal: 51, pressao: 941.5 },
    }
    k.opcoes = { ...k.opcoes, empuxo: 'MEDIDO', conveccao: 'CALCULAR', ...opcoes }
    return pendenciasEmissao(k, { padroes, hoje: '2026-10-28', temPesos: true, classe: 'I' })
  }

  it('com pesos E2 pelo certificado, densidade e u(ρ), barômetro e as opções da classe: nada', () => {
    expect(classeI([e2, th, br])).toEqual([])
  })

  it('a pressão obrigatória, como em toda classe, mesmo na calibração medida quando nas outras ela era opcional', () => {
    const k = { ...calibracaoVazia(), dataCalibracao: '2026-10-20', tecnicoId: 't', localEndereco: 'x', padroesIds: ['a'] }
    k.ambiente = { ...k.ambiente, temperaturaInicial: 22, temperaturaFinal: 22 }
    for (const x of [k, { ...k, pressaoComoAviso: true }])
      expect(pendenciasEmissao(x, { padroes: [e2], hoje: '2026-10-28', temPesos: true, classe: 'I' })).toContain(SEM_PRESSAO)
  })

  it('jogo de classe pior que F1, ou sem classe, e jogo pelo nominal', () => {
    expect(classeI([padrao({ ...e2, identificacao: 'JP-M1', classe: 'M1' }), th, br])).toEqual([
      'Balança classe I: o jogo JP-M1 é da classe M1; use pesos E1, E2 ou F1 (OIML R 111-1, 1.3.1).',
    ])
    expect(classeI([padrao({ ...e2, identificacao: 'JP-X', classe: '' }), th, br])).toEqual([
      'Balança classe I: o jogo JP-X está sem a classe; use pesos E1, E2 ou F1 (OIML R 111-1, 1.3.1).',
    ])
    expect(classeI([padrao({ ...e2, classe: 'F1', uso: 'NOMINAL' }), th, br])).toEqual([
      'Balança classe I: use o jogo JP-E2 pelo valor do certificado (cadastro do padrão; POP 6.1; OIML R 111-1, 5.3.2).',
    ])
  })

  it('peça usada sem a U do certificado (o jogo pelo certificado): pendência por jogo, com as peças (POP 6.1)', () => {
    const jogo = {
      ...e2,
      id: 'e2',
      pesos: [
        { id: 'g100', marca: '', nominal: 100, correcao: -0.12, incerteza: 0, k: 2 },
        { id: 'g50', marca: '', nominal: 50, correcao: 0.02, incerteza: 0, k: 2 },
        { id: 'g20', marca: '', nominal: 20, correcao: 0.01, incerteza: 0.03, k: 2 },
        { id: 'g10', marca: '', nominal: 10, correcao: 0, incerteza: 0, k: 2 },
      ],
    }
    const comPontos = (pecas: string[][], extra: Partial<CalibracaoInput> = {}) => {
      const k: CalibracaoInput = {
        ...calibracaoVazia(),
        dataCalibracao: '2026-10-20',
        tecnicoId: 't1',
        localEndereco: 'Rua A, 1 – Rio Claro/SP',
        padroesIds: [jogo.id, th.id, br.id],
        ambiente: { temperaturaInicial: 22, temperaturaFinal: 22.4, umidadeInicial: 50, umidadeFinal: 51, pressao: 941.5 },
        ...extra,
      }
      k.opcoes = { ...k.opcoes, empuxo: 'MEDIDO', conveccao: 'CALCULAR' }
      k.indicacao = {
        ...k.indicacao,
        pontos: pecas.map((ids, i) => ({
          id: `p${i}`,
          carga: 0,
          pecas: ids.map((pesoId) => ({ padraoId: jogo.id, pesoId, quantidade: 1 })),
          pecasManuais: true,
          crescente: i === 3 ? null : 0,
          decrescente: null,
          nivelSubstituicao: 0,
        })),
      }
      return pendenciasEmissao(k, { padroes: [jogo, th, br], hoje: '2026-10-28', temPesos: true, classe: 'I' })
    }
    expect(comPontos([[], ['g20'], ['g100', 'g50'], ['g10']])).toEqual([
      'Balança classe I: o jogo JP-E2 está sem a incerteza (U) do certificado das peças de 100 g e 50 g; complete o cadastro do padrão (POP 6.1).',
    ])
    expect(comPontos([[], ['g100'], ['g20']])).toEqual([
      'Balança classe I: o jogo JP-E2 está sem a incerteza (U) do certificado da peça de 100 g; complete o cadastro do padrão (POP 6.1).',
    ])
    // Só peças com U, ou a peça sem U num ponto sem leitura: nada
    expect(comPontos([[], ['g20'], [], ['g10']])).toEqual([])
    // Registro de antes do cálculo da classe I: as exigências da época
    expect(comPontos([[], ['g100']], { calculoLegado: true })).toEqual([])
    // Revisão de um certificado emitido na 1.0.2 (sem `regrasDoPop`): exigência nova da 1.0.3, fica como na época (o
    // cálculo dá o aviso "Correção do certificado ignorada"); a do certificado emitido com as regras do POP, a segue
    expect(comPontos([[], ['g100']], { substituiId: 'cal-original' })).toEqual([])
    expect(comPontos([[], ['g100']], { substituiId: 'cal-original', regrasDoPop: true })).toEqual([
      'Balança classe I: o jogo JP-E2 está sem a incerteza (U) do certificado da peça de 100 g; complete o cadastro do padrão (POP 6.1).',
    ])
  })

  it('empuxo "não considerar" e convecção desligada bloqueiam', () => {
    expect(classeI([e2, th, br], { empuxo: 'NENHUM' })).toEqual([
      'Balança classe I: o empuxo do ar precisa entrar no cálculo (Opções do cálculo, na Conclusão).',
    ])
    expect(classeI([e2, th, br], { conveccao: 'NAO_CONSIDERAR' })).toEqual([
      'Balança classe I: a convecção precisa entrar no cálculo (Opções do cálculo, na Conclusão).',
    ])
    expect(classeI([e2, th, br], { conveccao: undefined })).toHaveLength(1)
    // "Ajustada logo antes" é escolha de quem ajusta antes: não é pendência
    expect(classeI([e2, th, br], { empuxo: 'AJUSTADO' })).toEqual([])
  })

  it('a densidade e u(ρ) dos jogos não são conferidas aqui: quem confere é o cálculo, em todo ensaio que as usa', () => {
    // Sem repetir a pendência do cálculo (ver "densidade dos jogos no empuxo pela densidade do ar medida")
    expect(classeI([{ ...e2, densidade: 0, incertezaDensidade: 0 }, th, br])).toEqual([])
    expect(classeI([{ ...e2, densidade: 7.95 }, th, br])).toEqual([])
  })

  it('ΔT pesos − ar medido: o termômetro de duas entradas (padrão "Outro") entre os padrões', () => {
    const td = padrao({ identificacao: 'TD-01', tipo: 'OUTRO' })
    const comDeltaT = (padroes: Padrao[], ambiente: Partial<CalibracaoInput['ambiente']>) => {
      const k: CalibracaoInput = {
        ...calibracaoVazia(),
        dataCalibracao: '2026-10-20',
        tecnicoId: 't1',
        localEndereco: 'Rua A, 1 – Rio Claro/SP',
        padroesIds: padroes.map((p) => p.id),
        ambiente: {
          temperaturaInicial: 22,
          temperaturaFinal: 22.4,
          umidadeInicial: 50,
          umidadeFinal: 51,
          pressao: 941.5,
          ...ambiente,
        },
      }
      k.opcoes = { ...k.opcoes, empuxo: 'MEDIDO', conveccao: 'CALCULAR' }
      return pendenciasEmissao(k, { padroes, hoje: '2026-10-28', temPesos: true, classe: 'I' })
    }
    // A pendência diz onde cadastrar o termômetro (padrão "Outro") e a alternativa da aclimatação: sem nenhum "Outro"
    // cadastrado, a etapa não tem cartão para escolher
    const texto =
      'Balança classe I com o ΔT pesos − ar medido: escolha nos padrões o termômetro de duas entradas (cadastre-o em Padrões → Novo padrão → Outro, se ainda não estiver cadastrado) ou registre o ΔT pela aclimatação.'
    expect(PENDENCIA_TERMOMETRO_DUAS_ENTRADAS).toBe(texto)
    expect(comDeltaT([e2, th, br], { deltaTPesos: 0.3 })).toEqual([texto])
    // 0,0 °C também foi medido (com o termômetro)
    expect(comDeltaT([e2, th, br], { deltaTPesos: 0 })).toEqual([texto])
    expect(comDeltaT([e2, th, br, td], { deltaTPesos: 0.3 })).toEqual([])
    // Pela aclimatação (sem o termômetro), ou sem o ΔT: nada
    expect(comDeltaT([e2, th, br], { aclimatacao: { deltaT0: 5, minutos: 120 } })).toEqual([])
    expect(comDeltaT([e2, th, br], {})).toEqual([])
  })

  it('etapa Padrões (classe I, ΔT medido): o aviso de cadastrar o termômetro de duas entradas, só sem nenhum "Outro" ativo', () => {
    const td = padrao({ identificacao: 'TD-01', tipo: 'OUTRO' })
    expect(AVISO_SEM_TERMOMETRO_DUAS_ENTRADAS).toMatch(/Padrões → Novo padrão → Outro/)
    expect(AVISO_SEM_TERMOMETRO_DUAS_ENTRADAS).toMatch(/aclimatação/)
    expect(semTermometroDuasEntradas('I', [e2, th, br])).toBe(true)
    expect(semTermometroDuasEntradas('I', [e2, th, br, { ...td, ativo: false }])).toBe(true)
    expect(semTermometroDuasEntradas('I', [e2, th, br, td])).toBe(false)
    // Nas outras classes, o ΔT não é pedido
    expect(semTermometroDuasEntradas('II', [e2, th, br])).toBe(false)
  })

  it('revisão de certificado emitido antes do cálculo da classe I: as exigências da época', () => {
    const k: CalibracaoInput = {
      ...calibracaoVazia(),
      dataCalibracao: '2026-10-20',
      tecnicoId: 't1',
      localEndereco: 'Rua A, 1',
      padroesIds: ['p'],
      ambiente: { temperaturaInicial: 22, temperaturaFinal: 22.4, umidadeInicial: 50, umidadeFinal: 51, pressao: 941.5 },
      calculoLegado: true,
    }
    k.opcoes = { ...k.opcoes, empuxo: 'AJUSTADO', conveccao: 'NAO_CONSIDERAR' }
    const m1 = padrao({ classe: 'M1', uso: 'NOMINAL' })
    expect(pendenciasEmissao(k, { padroes: [m1, th, br], hoje: '2026-10-28', temPesos: true, classe: 'I' })).toEqual([])
    // A mesma calibração fora da revisão legada: as pendências da classe I
    expect(
      pendenciasEmissao(
        { ...k, calculoLegado: undefined },
        { padroes: [m1, th, br], hoje: '2026-10-28', temPesos: true, classe: 'I' },
      ),
    ).toHaveLength(3)
  })

  it('nas outras classes, nada disso', () => {
    const k: CalibracaoInput = {
      ...calibracaoVazia(),
      dataCalibracao: '2026-10-20',
      tecnicoId: 't1',
      localEndereco: 'Rua A, 1',
      padroesIds: ['p'],
      ambiente: { temperaturaInicial: 22, temperaturaFinal: 23, umidadeInicial: 50, umidadeFinal: 51, pressao: 941.5 },
    }
    const m1 = padrao({ classe: 'M1', uso: 'NOMINAL' })
    expect(pendenciasEmissao(k, { padroes: [m1, br], hoje: '2026-10-28', temPesos: true, classe: 'III' })).toEqual([])
    expect(pendenciasEmissao(k, { padroes: [m1, br], hoje: '2026-10-28', temPesos: true, classe: 'II' })).toEqual([])
  })
})

describe('densidade dos jogos no empuxo pela densidade do ar medida (pendência do cálculo, como o servidor junta)', () => {
  const td = padrao({ identificacao: 'TD-01', tipo: 'OUTRO' })
  const jogo = (x: Partial<Padrao> = {}) =>
    padrao({
      identificacao: 'JP-E2',
      classe: 'E2',
      uso: 'CERTIFICADO',
      densidade: 7950,
      incertezaDensidade: 70,
      pesos: [
        { id: 'p200', marca: '', nominal: 200, correcao: 0.1, incerteza: 0.1, k: 2 },
        { id: 'p100', marca: '', nominal: 100, correcao: -0.1, incerteza: 0.05, k: 2 },
        { id: 'p50', marca: '', nominal: 50, correcao: 0.02, incerteza: 0.03, k: 2 },
        { id: 'p20', marca: '', nominal: 20, correcao: 0.01, incerteza: 0.025, k: 2 },
      ],
      ...x,
    })
  const balanca: Balanca = {
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
  const ensaio = (): EnsaioIndicacao => ({
    metodo: 'DESCONTINUO',
    retornoZero: 0,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos: [
      { id: 'z', carga: 0, pecas: [], pecasManuais: false, crescente: 0, decrescente: null, nivelSubstituicao: 0 },
      {
        id: 'c',
        carga: 200,
        pecas: [{ padraoId: 'JP-E2', pesoId: 'p200', quantidade: 1 }],
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
        pecas: [{ padraoId: 'JP-E2', pesoId: peso, quantidade: 1 }],
        pecasManuais: false,
        crescente: leitura,
        decrescente: null,
        nivelSubstituicao: 0,
      })),
    ],
  })
  /** `pendenciasEmissao` + as do cálculo (o "como encontrado" com o prefixo), como `pendenciasDa` no servidor. */
  function todas(pesos: Padrao, opcoes: Partial<CalibracaoInput['opcoes']> = {}, extra: Partial<CalibracaoInput> = {}) {
    const padroes = [pesos, th, br, td]
    const k: CalibracaoInput = {
      ...calibracaoVazia({ ...opcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I'), ...opcoes }),
      dataCalibracao: '2026-10-20',
      tecnicoId: 't1',
      localEndereco: 'Rua A, 1 – Rio Claro/SP',
      padroesIds: padroes.map((p) => p.id),
      repetibilidade: [{ id: 'r', carga: 100, leituras: Array.from({ length: 10 }, (_, i) => (i % 2 ? 100.0001 : 100)) }],
      excentricidade: { aplicavel: false, motivo: 'Prato pequeno', carga: 0, metodo: 3, posicoes: [] },
      indicacao: ensaio(),
      ambiente: {
        temperaturaInicial: 22,
        temperaturaFinal: 24,
        umidadeInicial: 55,
        umidadeFinal: 65,
        pressao: 941.5,
        deltaTPesos: 0.4,
      },
      ...extra,
    }
    const { resultado, comoEncontrado } = calcularCalibracao(k, balanca, padroes)
    return [
      ...new Set([
        ...pendenciasEmissao(k, { padroes, hoje: '2026-10-28', temPesos: true, classe: 'I' }),
        ...resultado.pendencias,
        ...(comoEncontrado?.pendencias.map((x) => `Como encontrado: ${x}`) ?? []),
      ]),
    ]
  }
  const SEM =
    'Empuxo pela densidade do ar medida: o jogo JP-E2 está sem a densidade ou a incerteza da densidade (cadastro do padrão).'
  const IMPLAUSIVEL =
    'Empuxo pela densidade do ar medida: o jogo JP-E2 está com densidade de 7,95 kg/m³, fora da faixa dos pesos; confira a unidade no cadastro do padrão (7,95 g/cm³ = 7 950 kg/m³).'
  /** Classe I com "ajustada logo antes", ajuste interno e o "como encontrado" lido. */
  const ajustadaAntes = { empuxo: 'AJUSTADO' as const }
  const comAjuste = (): Partial<CalibracaoInput> => ({
    ajuste: { realizado: 'INTERNO', descricao: '' },
    comoEncontrado: ensaio(),
  })

  it('ensaio final com a densidade do ar medida: sem ρ (ou u(ρ)), ou com ρ implausível, bloqueia', () => {
    expect(todas(jogo())).toEqual([])
    expect(todas(jogo({ densidade: 0, incertezaDensidade: 0 }))).toEqual([SEM])
    expect(todas(jogo({ incertezaDensidade: 0 }))).toEqual([SEM])
    expect(todas(jogo({ densidade: 7.95, incertezaDensidade: 0.035 }))).toEqual([IMPLAUSIVEL])
  })

  it('"ajustada logo antes" com ajuste: o "como encontrado" vai pela densidade do ar medida e a confere (ρ = 0 e ρ = 7,95)', () => {
    expect(todas(jogo(), ajustadaAntes, comAjuste())).toEqual([])
    expect(todas(jogo({ densidade: 0, incertezaDensidade: 0 }), ajustadaAntes, comAjuste())).toEqual([`Como encontrado: ${SEM}`])
    expect(todas(jogo({ densidade: 7.95, incertezaDensidade: 0.035 }), ajustadaAntes, comAjuste())).toEqual([
      `Como encontrado: ${IMPLAUSIVEL}`,
    ])
    // Sem ajuste (sem "como encontrado"), a densidade dos pesos não entra no cálculo
    expect(todas(jogo({ densidade: 7.95 }), ajustadaAntes)).toEqual([])
  })

  it('revisão de certificado emitido antes do cálculo da classe I: o "como encontrado" como na época, sem a densidade', () => {
    const legado = { ...comAjuste(), calculoLegado: true }
    expect(
      todas(jogo({ densidade: 0, incertezaDensidade: 0 }), { ...ajustadaAntes, conveccao: 'NAO_CONSIDERAR' }, legado),
    ).toEqual([])
  })
})

// ---- Padrões como valiam no dia da calibração -----------------------------------------------------------------

describe('padrão calibrado depois da data da calibração', () => {
  const base = (x: Partial<Padrao> = {}) => {
    const k: CalibracaoInput = {
      ...calibracaoVazia(),
      dataCalibracao: '2026-03-02',
      tecnicoId: 't1',
      localEndereco: 'Rua A, 1 – Rio Claro/SP',
      padroesIds: ['JP-01', 'BR-01'],
      ambiente: { ...AMBIENTE_VAZIO, temperaturaInicial: 22, temperaturaFinal: 23, pressao: 925 },
    }
    return pendenciasEmissao(k, { padroes: [padrao(x), br], hoje: '2026-10-28', temPesos: true })
  }

  it('depois: pendência (o certificado citaria o certificado novo); no mesmo dia ou sem a data, nada', () => {
    expect(base({ dataCalibracao: '2026-06-15', validade: '2027-06-15' })).toEqual([
      'O padrão JP-01 foi calibrado em 15/06/2026, depois desta calibração: o certificado dele não valia no dia.',
    ])
    expect(base({ dataCalibracao: '2026-03-02' })).toEqual([])
    expect(base({ dataCalibracao: '' })).toEqual([])
  })

  const jogo = padrao({
    certificado: 'LAB-B/2026',
    dataCalibracao: '2026-06-15',
    validade: '2027-06-15',
    pesos: [{ id: 'w', marca: '', nominal: 10000, correcao: 300, incerteza: 160, k: 2 }],
  })
  const antigo = {
    ...jogo,
    certificado: 'LAB-A/2025',
    dataCalibracao: '2025-06-10',
    validade: '2026-06-10',
    pesos: [{ id: 'w', marca: '', nominal: 10000, correcao: 40, incerteza: 160, k: 2 }],
  }

  it('a recalibração guarda os dados do certificado de antes; a calibração feita antes dela usa esses dados', () => {
    const versoes = versoesAnterioresApos(antigo, 'LAB-B/2026')
    expect(versoes).toHaveLength(1)
    expect(versoes[0]).toMatchObject({ certificado: 'LAB-A/2025', dataCalibracao: '2025-06-10', validade: '2026-06-10' })
    // O mesmo nº (só espaços e maiúsculas) não é recalibração
    expect(versoesAnterioresApos(antigo, ' lab-a/2025')).toEqual([])
    const comHistorico = { ...jogo, versoesAnteriores: versoes }
    expect(padraoNaData(comHistorico, '2026-03-02')).toMatchObject({ certificado: 'LAB-A/2025', identificacao: 'JP-01' })
    expect(padraoNaData(comHistorico, '2026-03-02').pesos[0].correcao).toBe(40)
    // No dia da recalibração e depois: o atual; antes de todas as versões: o atual (e a pendência)
    expect(padraoNaData(comHistorico, '2026-06-15').certificado).toBe('LAB-B/2026')
    expect(padraoNaData(comHistorico, '2025-01-01').certificado).toBe('LAB-B/2026')
    // Duas recalibrações: a versão mais nova até a data
    const tres = {
      ...jogo,
      certificado: 'LAB-C/2027',
      dataCalibracao: '2027-06-20',
      versoesAnteriores: versoesAnterioresApos(comHistorico, 'LAB-C/2027'),
    }
    expect(tres.versoesAnteriores.map((v) => v.certificado)).toEqual(['LAB-B/2026', 'LAB-A/2025'])
    expect(padraoNaData(tres, '2026-03-02').certificado).toBe('LAB-A/2025')
    expect(padraoNaData(tres, '2026-12-01').certificado).toBe('LAB-B/2026')
  })

  it('certificado trocado por um mais antigo ou do mesmo dia (correção de um digitado errado): o errado não volta', () => {
    // O LAB-B/2026 (15/06/2026) foi trocado pelo LAB-A/2025 (10/06/2025), que é o que valia; depois, recalibrado
    const corrigido = { ...antigo, versoesAnteriores: versoesAnterioresApos(jogo, 'LAB-A/2025') }
    const recalibrado = {
      ...jogo,
      certificado: 'LAB-C/2027',
      dataCalibracao: '2027-06-20',
      validade: '2028-06-20',
      versoesAnteriores: versoesAnterioresApos(corrigido, 'LAB-C/2027'),
    }
    expect(recalibrado.versoesAnteriores.map((v) => v.certificado)).toEqual(['LAB-A/2025', 'LAB-B/2026'])
    // Em 01/12/2026 valia o LAB-A/2025, já vencido: não o LAB-B/2026, que nunca valeu
    expect(padraoNaData(recalibrado, '2026-12-01')).toMatchObject({ certificado: 'LAB-A/2025', validade: '2026-06-10' })
    expect(padraoNaData(recalibrado, '2026-12-01').pesos[0].correcao).toBe(40)
    // O nº corrigido no mesmo dia (LAB-8/2026 → LAB-B/2026): vale o corrigido
    const digitado = { ...jogo, certificado: 'LAB-8/2026', pesos: [{ ...jogo.pesos[0], correcao: 999 }] }
    const numeroCorrigido = { ...jogo, versoesAnteriores: versoesAnterioresApos(digitado, 'LAB-B/2026') }
    const depois = {
      ...jogo,
      certificado: 'LAB-C/2027',
      dataCalibracao: '2027-06-20',
      versoesAnteriores: versoesAnterioresApos(numeroCorrigido, 'LAB-C/2027'),
    }
    expect(depois.versoesAnteriores.map((v) => v.certificado)).toEqual(['LAB-B/2026', 'LAB-8/2026'])
    expect(padraoNaData(depois, '2026-12-01')).toMatchObject({ certificado: 'LAB-B/2026', pesos: [{ correcao: 300 }] })
  })

  it('revisão: os padrões congelados na emissão (mesmo desativados); o de hoje só se é o mesmo certificado', () => {
    const congelado = { ...antigo, id: 'JP-01' }
    const k = { padroesIds: ['JP-01'], dataCalibracao: '2026-03-02', padroesCongelados: [congelado] }
    expect(padroesDaCalibracao(k, () => jogo)[0]).toMatchObject({ certificado: 'LAB-A/2025', ativo: true })
    expect(padroesDaCalibracao(k, () => undefined)[0]).toMatchObject({ certificado: 'LAB-A/2025', ativo: true })
    const corrigido = { ...antigo, ativo: false, pesos: [{ ...antigo.pesos[0], correcao: 45 }] }
    expect(padroesDaCalibracao(k, () => corrigido)[0]).toMatchObject({ ativo: true, pesos: [{ correcao: 45 }] })
    // Sem congelado (rascunho comum): o cadastro na data; padrão que não existe sai
    expect(
      padroesDaCalibracao({ padroesIds: ['JP-01', 'x'], dataCalibracao: '2026-03-02' }, (id) => (id === 'x' ? undefined : jogo)),
    ).toEqual([jogo])
  })
})

// ---- Ambiente fora da faixa e datas ---------------------------------------------------------------------------

describe('ambiente fora da faixa', () => {
  it('cada valor fora da faixa vira uma pendência que diz qual; dentro (e nas bordas), nada', () => {
    expect(
      pendenciasAmbiente({
        temperaturaInicial: -41,
        temperaturaFinal: 80,
        umidadeInicial: 0,
        umidadeFinal: 100.5,
        pressao: 92.7,
        deltaTPesos: -30,
        aclimatacao: { deltaT0: 41, minutos: -1 },
      }),
    ).toEqual([
      'Temperatura no início fora da faixa (−40 °C a 80 °C): confira o valor digitado.',
      'Umidade no fim fora da faixa (0 % a 100 %): confira o valor digitado.',
      'Pressão de 92,7 hPa fora da faixa (300 hPa a 1200 hPa): a pressão é em hPa (92,7 kPa = 927 hPa).',
      'Aclimatação dos pesos: diferença na chegada fora da faixa (−40 °C a 40 °C): confira o valor digitado.',
      'Aclimatação dos pesos: tempo no local fora da faixa (0 min a 2880 min): confira o valor digitado.',
    ])
    expect(pendenciasAmbiente({ pressao: 1500 })).toEqual([
      'Pressão fora da faixa (300 hPa a 1200 hPa): confira o valor digitado.',
    ])
    expect(pendenciasAmbiente({ ...AMBIENTE_VAZIO, temperaturaInicial: 22, pressao: 300 })).toEqual([])
  })

  it('o cálculo trata o valor fora da faixa como não registrado (sem densidade do ar absurda)', () => {
    const amb = {
      ...AMBIENTE_VAZIO,
      temperaturaInicial: 22,
      temperaturaFinal: 225,
      umidadeInicial: 55,
      umidadeFinal: 550,
      pressao: 92.7,
    }
    expect(arDoAmbiente(amb, false)).toEqual({ temperatura: 22, umidade: 55, pressao: null, ajustadaAntes: false })
    expect(termicaDoAmbiente({ ...AMBIENTE_VAZIO, deltaTPesos: 31 })).toBeNull()
    expect(termicaDoAmbiente({ ...AMBIENTE_VAZIO, aclimatacao: { deltaT0: 5, minutos: 3000 } })).toBeNull()
  })
})

describe('datas incoerentes', () => {
  const k = (x: Partial<CalibracaoInput>): CalibracaoInput => ({
    ...calibracaoVazia(),
    dataCalibracao: '2026-10-20',
    tecnicoId: 't1',
    localEndereco: 'Rua A, 1 – Rio Claro/SP',
    padroesIds: ['JP-01', 'BR-01'],
    ambiente: { ...AMBIENTE_VAZIO, temperaturaInicial: 22, temperaturaFinal: 23, pressao: 925 },
    ...x,
  })
  const pend = (x: Partial<CalibracaoInput>) =>
    pendenciasEmissao(k(x), { padroes: [pesos, br], hoje: '2026-10-28', temPesos: true })

  it('próxima calibração antes ou no dia da calibração: pendência (esteja ou não no certificado)', () => {
    const PROXIMA = 'A próxima calibração precisa ser depois da data da calibração.'
    expect(pend({ proximaCalibracao: '2025-10-20', proximaNoCertificado: true })).toEqual([PROXIMA])
    expect(pend({ proximaCalibracao: '2026-10-20' })).toEqual([PROXIMA])
    expect(pend({ proximaCalibracao: '2026-10-21' })).toEqual([])
    expect(pend({ proximaCalibracao: '' })).toEqual([])
  })

  it('recebimento do item depois da calibração (no laboratório): pendência; no dia ou antes, nada', () => {
    const RECEBIMENTO = 'O recebimento do item não pode ser depois da data da calibração.'
    expect(pend({ local: 'LABORATORIO', dataRecebimento: '2026-12-01' })).toEqual([RECEBIMENTO])
    expect(pend({ local: 'LABORATORIO', dataRecebimento: '2026-10-20' })).toEqual([])
    expect(pend({ local: 'LABORATORIO', dataRecebimento: '2026-10-01' })).toEqual([])
  })

  it('ao gravar: data inválida é erro (não some), a marca "no certificado" fica e o recebimento só no laboratório', () => {
    const norm = (x: Record<string, unknown>) =>
      normalizarCalibracao({ ...calibracaoVazia(), clienteId: 'c', balancaId: 'b', ...x })
    expect(norm({ proximaCalibracao: '2206-11-03' }).erros).toEqual(['Data da próxima calibração inválida.'])
    expect(norm({ proximaCalibracao: '', proximaNoCertificado: true }).valor.proximaNoCertificado).toBe(true)
    expect(norm({ local: 'LABORATORIO', dataRecebimento: '2026-02-31' }).erros).toEqual(['Data de recebimento do item inválida.'])
    expect(norm({ local: 'LABORATORIO', dataRecebimento: '2026-10-01' }).valor.dataRecebimento).toBe('2026-10-01')
    expect(norm({ local: 'CLIENTE', dataRecebimento: '2026-10-01' }).valor.dataRecebimento).toBe('')
    // Os valores do ambiente como digitados
    expect(norm({ ambiente: { pressao: '92,7', temperaturaFinal: 81 } }).valor.ambiente).toMatchObject({
      pressao: 92.7,
      temperaturaFinal: 81,
    })
  })
})

describe('pendências da emissão: excentricidade dispensada, balança sem identificação e padrão fora do intervalo', () => {
  const base = (x: Partial<CalibracaoInput> = {}): CalibracaoInput => ({
    ...calibracaoVazia(),
    dataCalibracao: '2026-11-04',
    tecnicoId: 't1',
    localEndereco: 'Rua A, 1 – Rio Claro/SP',
    padroesIds: ['JP-01', 'BR-01'],
    ambiente: { temperaturaInicial: 22, temperaturaFinal: 23, umidadeInicial: 50, umidadeFinal: 51, pressao: 925 },
    ...x,
  })
  const ident = { numeroSerie: 'TL-2231', identificacao: '', plataformaSerie: '' }
  // Com o barômetro (a pressão medida com ele)
  const de = (
    k: CalibracaoInput,
    balanca: { receptor: Balanca['receptor']; numeroSerie: string; identificacao: string; plataformaSerie?: string },
    padroes: Padrao[] = [pesos],
  ) => pendenciasEmissao(k, { padroes: [...padroes, br], hoje: '2026-11-04', temPesos: true, classe: 'III', balanca })
  const naoFeito = (motivo: string) => ({ aplicavel: false, motivo, carga: 0, metodo: 1 as const, posicoes: [] })
  const SO_GANCHO =
    'Excentricidade: o POP (7.10, Tabela 6) só dispensa o ensaio na balança suspensa (gancho); registre as leituras das posições.'
  const MOTIVO = 'Excentricidade: informe por que o ensaio não foi feito (sai no certificado).'

  it('excentricidade "não realizada" numa plataforma: pendência (o POP só dispensa no gancho)', () => {
    expect(de(base({ excentricidade: naoFeito('Prato pequeno') }), { receptor: 'RETANGULAR', ...ident })).toEqual([SO_GANCHO])
    expect(de(base({ excentricidade: naoFeito('') }), { receptor: 'APOIOS', ...ident })).toEqual([SO_GANCHO, MOTIVO])
    // Gancho com o motivo: nada; sem o motivo: a pendência do motivo
    expect(de(base({ excentricidade: naoFeito('A carga se centraliza sozinha.') }), { receptor: 'GANCHO', ...ident })).toEqual([])
    expect(de(base({ excentricidade: naoFeito('  ') }), { receptor: 'GANCHO', ...ident })).toEqual([MOTIVO])
    // Ensaio feito: nada
    expect(de(base(), { receptor: 'RETANGULAR', ...ident })).toEqual([])
  })

  it('registro de antes (revisão de certificado de antes das regras, ou legado): como na época', () => {
    const revisao = base({ excentricidade: naoFeito(''), substituiId: 'k-original' })
    expect(de(revisao, { receptor: 'RETANGULAR', ...ident })).toEqual([])
    expect(de({ ...revisao, substituiId: '', calculoLegado: true }, { receptor: 'RETANGULAR', ...ident })).toEqual([])
    // Revisão de um certificado emitido já com as regras: as regras valem
    expect(de({ ...revisao, regrasDoPop: true }, { receptor: 'RETANGULAR', ...ident })).toEqual([SO_GANCHO, MOTIVO])
  })

  it('rascunho já medido antes das regras (`minimosComoAviso`): o ensaio dispensado fica como na época', () => {
    const medido = base({ excentricidade: naoFeito('Prato pequeno'), minimosComoAviso: true })
    expect(de(medido, { receptor: 'RETANGULAR', ...ident })).toEqual([])
    // O motivo continua obrigatório (sai no certificado)
    expect(de({ ...medido, excentricidade: naoFeito('') }, { receptor: 'RETANGULAR', ...ident })).toEqual([MOTIVO])
    // A revisão do certificado dele (com as regras e a marca) também
    const revisao = { ...medido, substituiId: 'k-original', regrasDoPop: true }
    expect(de(revisao, { receptor: 'RETANGULAR', ...ident })).toEqual([])
    // O padrão fora do intervalo da Tabela 3 não é um mínimo do ensaio: continua pendência
    const velho = padrao({ dataCalibracao: '2022-03-10', validade: '2032-03-10' })
    expect(de(base({ minimosComoAviso: true }), { receptor: 'RETANGULAR', ...ident }, [velho])).toEqual([
      'O padrão JP-01 foi calibrado em 10/03/2022, há mais de 24 meses desta calibração (POP, Tabela 3).',
    ])
  })

  it('balança sem nº de série, sem TAG e sem a série da plataforma: não identificável (POP 7.3)', () => {
    const SEM_ID = 'Balança sem nº de série nem identificação (TAG): identifique a balança no cadastro antes de emitir (POP 7.3).'
    const vazia = { receptor: 'RETANGULAR' as const, numeroSerie: ' ', identificacao: '', plataformaSerie: '' }
    expect(de(base(), vazia)).toEqual([SEM_ID])
    expect(de(base(), { ...vazia, numeroSerie: 'TL-2231' })).toEqual([])
    expect(de(base(), { ...vazia, identificacao: 'BAL-07' })).toEqual([])
    expect(de(base(), { ...vazia, plataformaSerie: 'PL-1' })).toEqual([])
    // Também na revisão: a emissão usa o cadastro de hoje, e a TAG é preenchida nele
    expect(de(base({ substituiId: 'k-original' }), vazia)).toEqual([SEM_ID])
  })

  it('padrão calibrado há mais de 24 meses (POP, Tabela 3), mesmo com a próxima calibração digitada distante', () => {
    const velho = padrao({ dataCalibracao: '2022-03-10', validade: '2032-03-10' })
    expect(de(base(), { receptor: 'RETANGULAR', ...ident }, [velho])).toEqual([
      'O padrão JP-01 foi calibrado em 10/03/2022, há mais de 24 meses desta calibração (POP, Tabela 3).',
    ])
    // Exatamente 24 meses depois: ainda vale; um dia depois, não
    const limite = padrao({ dataCalibracao: '2024-11-04', validade: '2026-11-04' })
    expect(de(base(), { receptor: 'RETANGULAR', ...ident }, [limite])).toEqual([])
    expect(
      de(base({ dataCalibracao: '2026-11-03' }), { receptor: 'RETANGULAR', ...ident }, [
        { ...limite, dataCalibracao: '2024-11-02' },
      ]),
    ).toEqual(['O padrão JP-01 foi calibrado em 02/11/2024, há mais de 24 meses desta calibração (POP, Tabela 3).'])
    // Revisão de certificado de antes das regras: como na época
    expect(de(base({ substituiId: 'k-original' }), { receptor: 'RETANGULAR', ...ident }, [velho])).toEqual([])
  })
})

describe('ajudas dos cadastros: balança identificável e próxima calibração do padrão além do POP', () => {
  it('identificável pela série, pela TAG ou pela série da plataforma; o cadastro antigo sem os campos não quebra', () => {
    expect(balancaIdentificada({ numeroSerie: '', identificacao: ' ', plataformaSerie: '' })).toBe(false)
    expect(balancaIdentificada({})).toBe(false)
    expect(balancaIdentificada({ numeroSerie: 'TL-1', identificacao: '' })).toBe(true)
    expect(balancaIdentificada({ numeroSerie: '', identificacao: 'BAL-07' })).toBe(true)
    expect(balancaIdentificada({ numeroSerie: '', identificacao: '', plataformaSerie: 'PL-1' })).toBe(true)
  })

  it('a próxima calibração passa de 24 meses da calibração (POP, Tabela 3): o aviso do cadastro', () => {
    expect(proximaAlemDoPop({ dataCalibracao: '2022-03-10', validade: '2032-03-10' })).toBe(true)
    expect(proximaAlemDoPop({ dataCalibracao: '2024-03-10', validade: '2026-03-10' })).toBe(false)
    expect(proximaAlemDoPop({ dataCalibracao: '2024-03-10', validade: '2026-03-11' })).toBe(true)
    expect(proximaAlemDoPop({ dataCalibracao: '', validade: '2099-01-01' })).toBe(false)
  })
})

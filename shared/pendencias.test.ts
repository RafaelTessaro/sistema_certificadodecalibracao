// O que bloqueia a emissão do certificado (`pendenciasEmissao`): a rastreabilidade dos padrões (acreditação
// Cgcre do laboratório) e a pressão atmosférica com o barômetro que a mediu (na classe II, obrigatória).
// E, como o servidor junta (`pendenciasDa`), as do cálculo: a densidade dos jogos no empuxo pela densidade do ar
// medida, também no "como encontrado" da classe I ajustada logo antes.

import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from './calibracao.ts'
import {
  BALANCA_VAZIA,
  calibracaoVazia,
  OPCOES_CALCULO_PADRAO,
  opcoesDaClasse,
  PADRAO_VAZIO,
  pendenciasEmissao,
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

describe('pendências da emissão', () => {
  it('sem pendência com padrões acreditados e sem pressão (classe III)', () => {
    expect(pendencias([pesos, th], null, 'III')).toEqual([])
  })

  it('padrão sem a acreditação Cgcre do laboratório: a declaração de rastreabilidade seria falsa', () => {
    expect(pendencias([pesos, { ...th, acreditacao: '  ' }], null)).toEqual([
      'O padrão TH-01 está sem a acreditação Cgcre do laboratório que o calibrou.',
    ])
  })

  it('pressão sem barômetro nos padrões, e barômetro sem a pressão registrada', () => {
    expect(pendencias([pesos, th], 925)).toEqual([
      'Pressão informada sem barômetro nos padrões: escolha o barômetro usado ou apague a pressão.',
    ])
    expect(pendencias([pesos, th, br], null)).toEqual([
      'Barômetro escolhido sem a pressão registrada (tire BR-01 dos padrões ou registre a pressão).',
    ])
    expect(pendencias([pesos, th, br], 925)).toEqual([])
  })

  it('classe II: a pressão é obrigatória, medida com o barômetro', () => {
    expect(pendencias([pesos, th], null, 'II')).toEqual([
      'Balança classe II: registre a pressão atmosférica, medida com o barômetro (escolha-o nos padrões).',
    ])
    expect(pendencias([pesos, th, br], 1013, 'II')).toEqual([])
    // Sem a classe informada (quem chama não sabe a balança) ou noutra classe: opcional
    expect(pendencias([pesos, th], null, '')).toEqual([])
    expect(pendencias([pesos, th], null)).toEqual([])
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

  it('a pressão obrigatória fala da classe da balança', () => {
    const k = { ...calibracaoVazia(), dataCalibracao: '2026-10-20', tecnicoId: 't', localEndereco: 'x', padroesIds: ['a'] }
    k.ambiente = { ...k.ambiente, temperaturaInicial: 22, temperaturaFinal: 22 }
    expect(pendenciasEmissao(k, { padroes: [e2], hoje: '2026-10-28', temPesos: true, classe: 'I' })).toContain(
      'Balança classe I: registre a pressão atmosférica, medida com o barômetro (escolha-o nos padrões).',
    )
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
    const texto = 'Balança classe I com o ΔT pesos − ar medido: escolha nos padrões o termômetro de duas entradas.'
    expect(comDeltaT([e2, th, br], { deltaTPesos: 0.3 })).toEqual([texto])
    // 0,0 °C também foi medido (com o termômetro)
    expect(comDeltaT([e2, th, br], { deltaTPesos: 0 })).toEqual([texto])
    expect(comDeltaT([e2, th, br, td], { deltaTPesos: 0.3 })).toEqual([])
    // Pela aclimatação (sem o termômetro), ou sem o ΔT: nada
    expect(comDeltaT([e2, th, br], { aclimatacao: { deltaT0: 5, minutos: 120 } })).toEqual([])
    expect(comDeltaT([e2, th, br], {})).toEqual([])
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
      pesos: [{ id: 'p200', marca: '', nominal: 200, correcao: 0.1, incerteza: 0.1, k: 2 }],
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
    retornoZero: null,
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

// O que bloqueia a emissão do certificado (`pendenciasEmissao`): a rastreabilidade dos padrões (acreditação
// Cgcre do laboratório) e a pressão atmosférica com o barômetro que a mediu (na classe II, obrigatória).
// E, como o servidor junta (`pendenciasDa`), as do cálculo: a densidade dos jogos no empuxo pela densidade do ar
// medida, também no "como encontrado" da classe I ajustada logo antes.

import { describe, expect, it } from 'vitest'
import { arDoAmbiente, calcularCalibracao, termicaDoAmbiente } from './calibracao.ts'
import {
  AMBIENTE_VAZIO,
  BALANCA_VAZIA,
  calibracaoVazia,
  normalizarCalibracao,
  OPCOES_CALCULO_PADRAO,
  opcoesDaClasse,
  PADRAO_VAZIO,
  padraoNaData,
  padroesDaCalibracao,
  pendenciasAmbiente,
  pendenciasEmissao,
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
      padroesIds: ['JP-01'],
      ambiente: { ...AMBIENTE_VAZIO, temperaturaInicial: 22, temperaturaFinal: 23 },
    }
    return pendenciasEmissao(k, { padroes: [pesos, padrao(x)].slice(1), hoje: '2026-10-28', temPesos: true })
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
    padroesIds: ['JP-01'],
    ambiente: { ...AMBIENTE_VAZIO, temperaturaInicial: 22, temperaturaFinal: 23 },
    ...x,
  })
  const pend = (x: Partial<CalibracaoInput>) => pendenciasEmissao(k(x), { padroes: [pesos], hoje: '2026-10-28', temPesos: true })

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

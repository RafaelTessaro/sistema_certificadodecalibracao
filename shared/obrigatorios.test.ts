// Os campos obrigatórios em destaque (a marca "●" das telas). Na calibração, obrigatório para emitir: as marcas vêm de
// `camposObrigatoriosEmissao`, a mesma regra que dá as pendências (`pendenciasEmissao` e o cálculo), então nunca
// discordam do que impede a emissão. Nos cadastros, obrigatório para salvar: as listas de shared/obrigatorios.ts
// conferidas com as regras de gravar (`normalizar*`).

import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from './calibracao.ts'
import {
  AMBIENTE_VAZIO,
  AVISO_SEM_PRESSAO,
  avisosEmissao,
  BALANCA_VAZIA,
  CLIENTE_VAZIO,
  camposObrigatoriosEmissao,
  calibracaoVazia,
  CONFIG_PADRAO,
  normalizarBalanca,
  normalizarCliente,
  normalizarConfig,
  normalizarPadrao,
  OPCOES_CALCULO_PADRAO,
  opcoesDaClasse,
  PADRAO_VAZIO,
  pendenciasEmissao,
  type CampoEmissao,
} from './dominio.ts'
import {
  PENDENCIA_AR_MEDIDO,
  PENDENCIA_CONVECCAO,
  PENDENCIA_LEITURAS_EXCENTRICIDADE,
  PENDENCIA_RETORNO_ZERO,
  PENDENCIA_SEM_LEITURAS_INDICACAO,
} from './metrologia/calculo.ts'
import {
  OBRIGATORIOS_BALANCA,
  OBRIGATORIOS_EMPRESA,
  OBRIGATORIOS_USUARIO,
  obrigatoriosCliente,
  obrigatoriosPadrao,
  PADRAO_PARA_EMITIR,
} from './obrigatorios.ts'
import type { Balanca, CalibracaoInput, ClasseExatidao, Padrao } from './tipos.ts'
import { normalizarNovoUsuario } from './usuarios.ts'

// ---- Uma calibração classe I completa (sem nenhuma pendência), com os padrões dela ---------------------------------

const padrao = (x: Partial<Padrao>): Padrao =>
  ({
    ...PADRAO_VAZIO,
    versao: 1,
    ativo: true,
    certificado: 'LAB-1/2026',
    laboratorio: 'Laboratório Exemplo',
    acreditacao: 'CAL 0123',
    dataCalibracao: '2026-01-10',
    validade: '2027-01-10',
    criadoEm: '',
    atualizadoEm: '',
    ...x,
  }) as Padrao
const JOGO = padrao({
  id: 'e2',
  identificacao: 'JP-E2',
  tipo: 'PESOS',
  classe: 'E2',
  densidade: 7950,
  incertezaDensidade: 70,
  pesos: [
    { id: 'p200', marca: '200', nominal: 200, correcao: 0.1, incerteza: 0.1, k: 2 },
    { id: 'p100', marca: '100', nominal: 100, correcao: -0.1, incerteza: 0.05, k: 2 },
    { id: 'p50', marca: '50', nominal: 50, correcao: 0.02, incerteza: 0.03, k: 2 },
    { id: 'p20', marca: '20', nominal: 20, correcao: 0.01, incerteza: 0.025, k: 2 },
  ],
})
const TH = padrao({ id: 'th', identificacao: 'TH-01', tipo: 'TERMOHIGROMETRO' })
const BR = padrao({ id: 'br', identificacao: 'BR-01', tipo: 'BAROMETRO' })
const TERMOMETRO = padrao({ id: 'te', identificacao: 'TE-2E', tipo: 'OUTRO' })
const PADROES = [JOGO, TH, BR, TERMOMETRO]

const ANALITICA: Balanca = {
  ...BALANCA_VAZIA,
  id: 'a',
  versao: 1,
  clienteId: 'c1',
  tipo: 'ANALITICA',
  unidade: 'g',
  classe: 'I',
  numeroSerie: 'SN-1',
  faixas: [{ max: 220, e: 0.001, d: 0.0001 }],
  criadoEm: '',
  atualizadoEm: '',
}

const ponto = (id: string, carga: number, leitura: number) => ({
  id,
  carga,
  pecas: carga ? [{ padraoId: 'e2', pesoId: id, quantidade: 1 }] : [],
  pecasManuais: false,
  crescente: leitura,
  decrescente: null,
  nivelSubstituicao: 0,
})

function completa(): CalibracaoInput {
  return {
    ...calibracaoVazia(opcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I'), 'I'),
    dataCalibracao: '2026-10-20',
    tecnicoId: 't1',
    local: 'CLIENTE',
    localEndereco: 'Rua A, 1 – Rio Claro/SP',
    padroesIds: PADROES.map((p) => p.id),
    ambiente: {
      ...AMBIENTE_VAZIO,
      temperaturaInicial: 22,
      temperaturaFinal: 22.5,
      umidadeInicial: 55,
      umidadeFinal: 60,
      pressao: 941.5,
      deltaTPesos: 0.4,
    },
    repetibilidade: [{ id: 'r', carga: 100, leituras: Array.from({ length: 10 }, (_, i) => (i % 2 ? 100.0001 : 100)) }],
    excentricidade: { aplicavel: false, motivo: 'Teste sem a excentricidade.', carga: 0, metodo: 3, posicoes: [] },
    indicacao: {
      metodo: 'DESCONTINUO',
      retornoZero: 0,
      substituicao: { ativa: false, pecas: [], etapas: [] },
      pontos: [
        ponto('z', 0, 0),
        ponto('p20', 20, 20.0001),
        ponto('p50', 50, 50.0001),
        ponto('p100', 100, 100.0001),
        ponto('p200', 200, 200.0003),
      ],
    },
  }
}

/** As pendências da emissão e as do cálculo (o servidor junta as duas). */
function tudo(k: CalibracaoInput, padroes = PADROES, classe: ClasseExatidao = 'I') {
  const contexto = { padroes, hoje: '2026-11-09', temPesos: padroes.some((p) => p.tipo === 'PESOS'), classe }
  const emissao = pendenciasEmissao(k, contexto)
  const balanca = { ...ANALITICA, classe }
  const calculo = calcularCalibracao(k, balanca, padroes).resultado.pendencias
  const campos = camposObrigatoriosEmissao(k, contexto)
  return { emissao, todas: [...emissao, ...calculo], campos, avisos: avisosEmissao(k, contexto) }
}

const campo = (campos: ReturnType<typeof tudo>['campos'], c: CampoEmissao) => campos.find((x) => x.campo === c)

/** Cada variação deixa um campo (ou uma escolha) em branco. */
const VARIACOES: Array<[string, (k: CalibracaoInput) => CalibracaoInput, Padrao[]?]> = [
  ['data da calibração', (k) => ({ ...k, dataCalibracao: '' })],
  ['técnico', (k) => ({ ...k, tecnicoId: '' })],
  ['endereço (no cliente)', (k) => ({ ...k, localEndereco: '  ' })],
  ['OS com reparo', (k) => ({ ...k, reparo: { ...k.reparo, houve: true, descricao: 'Troca da célula' } })],
  ['ajuste externo', (k) => ({ ...k, ajuste: { realizado: 'EXTERNO', descricao: '' } })],
  ['nenhum padrão', (k) => ({ ...k, padroesIds: [] }), []],
  ['sem jogo de pesos', (k) => ({ ...k, padroesIds: ['th', 'br', 'te'] }), [TH, BR, TERMOMETRO]],
  ['temperatura no início', (k) => ({ ...k, ambiente: { ...k.ambiente, temperaturaInicial: null } })],
  ['temperatura no fim', (k) => ({ ...k, ambiente: { ...k.ambiente, temperaturaFinal: null } })],
  ['umidade', (k) => ({ ...k, ambiente: { ...k.ambiente, umidadeInicial: null, umidadeFinal: null } })],
  ['pressão', (k) => ({ ...k, ambiente: { ...k.ambiente, pressao: null } })],
  ['barômetro', (k) => ({ ...k, padroesIds: ['e2', 'th', 'te'] }), [JOGO, TH, TERMOMETRO]],
  ['pressão e barômetro', (k) => ({ ...k, ambiente: { ...k.ambiente, pressao: null } }), [JOGO, TH, TERMOMETRO]],
  ['ΔT pesos − ar', (k) => ({ ...k, ambiente: { ...k.ambiente, deltaTPesos: null } })],
  ['repetibilidade', (k) => ({ ...k, repetibilidade: [] })],
  ['motivo da excentricidade', (k) => ({ ...k, excentricidade: { ...k.excentricidade, motivo: '' } })],
  ['leituras da excentricidade', (k) => ({ ...k, excentricidade: { ...k.excentricidade, aplicavel: true, posicoes: [] } })],
  [
    'leituras do erro de indicação',
    (k) => ({ ...k, indicacao: { ...k.indicacao, pontos: k.indicacao.pontos.map((p) => ({ ...p, crescente: null })) } }),
  ],
  ['retorno ao zero', (k) => ({ ...k, indicacao: { ...k.indicacao, retornoZero: null } })],
  [
    'tolerância do cliente',
    (k) => ({ ...k, conformidade: { ...k.conformidade, solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0 } }),
  ],
  ['próxima calibração no certificado', (k) => ({ ...k, proximaNoCertificado: true, proximaCalibracao: '' })],
]

describe('camposObrigatoriosEmissao: as marcas "●" são as pendências da emissão', () => {
  it('a calibração completa: nenhum campo em falta e nenhuma pendência', () => {
    const { todas, campos } = tudo(completa())
    expect(todas).toEqual([])
    expect(campos.filter((c) => c.falta)).toEqual([])
  })

  it.each(VARIACOES)('em branco: %s → o campo falta e dá a pendência dele; nenhum outro', (_nome, mudar, padroes) => {
    const { todas, campos } = tudo(mudar(completa()), padroes)
    const faltando = campos.filter((c) => c.falta && c.regra === 'obrigatorio')
    expect(faltando.length).toBeGreaterThan(0)
    // Toda falta marcada é pendência (da emissão ou do cálculo)…
    for (const c of faltando) for (const p of c.pendencias) expect(todas, c.campo).toContain(p)
    // …e o campo preenchido não dá a pendência de campo em branco
    const dosCampos = new Set(faltando.flatMap((c) => c.pendencias))
    for (const c of campos.filter((x) => !x.falta)) expect(c.pendencias).toEqual([])
    const textosDeCampo = new Set(VARIACOES.flatMap(([, m, p]) => tudo(m(completa()), p).campos.flatMap((c) => c.pendencias)))
    for (const p of todas) if (textosDeCampo.has(p)) expect(dosCampos.has(p), p).toBe(true)
  })

  it('cada variação aponta o campo certo, com a etapa e o controle da tela', () => {
    const falta = (mudar: (k: CalibracaoInput) => CalibracaoInput, padroes?: Padrao[]) =>
      tudo(mudar(completa()), padroes)
        .campos.filter((c) => c.falta)
        .map((c) => `${c.etapa}:${c.campo}${c.alvo ? `#${c.alvo}` : ''}`)
    expect(falta((k) => ({ ...k, tecnicoId: '' }))).toEqual(['identificacao:tecnicoId#k-tec'])
    expect(falta((k) => ({ ...k, ambiente: { ...k.ambiente, pressao: null } }))).toEqual(['padroes:pressao#amb-p'])
    expect(falta((k) => ({ ...k, ambiente: { ...k.ambiente, umidadeInicial: null, umidadeFinal: null } }))).toEqual([
      'padroes:umidade#amb-ui',
    ])
    expect(falta((k) => ({ ...k, indicacao: { ...k.indicacao, retornoZero: null } }))).toEqual([
      'indicacao:retornoZero#k-retorno-zero',
    ])
    expect(falta((k) => ({ ...k, proximaNoCertificado: true, proximaCalibracao: '' }))).toEqual([
      'conclusao:proximaCalibracao#k-prox',
    ])
  })

  it('os textos do cálculo são os mesmos do motor', () => {
    const textos = (mudar: (k: CalibracaoInput) => CalibracaoInput) => tudo(mudar(completa())).campos.flatMap((c) => c.pendencias)
    expect(textos((k) => ({ ...k, ambiente: { ...k.ambiente, umidadeInicial: null, umidadeFinal: null } }))).toEqual([
      PENDENCIA_AR_MEDIDO,
    ])
    expect(textos((k) => ({ ...k, ambiente: { ...k.ambiente, deltaTPesos: null } }))).toEqual([PENDENCIA_CONVECCAO])
    expect(textos((k) => ({ ...k, indicacao: { ...k.indicacao, retornoZero: null } }))).toEqual([PENDENCIA_RETORNO_ZERO])
    expect(textos((k) => ({ ...k, excentricidade: { ...k.excentricidade, aplicavel: true, posicoes: [] } }))).toEqual([
      PENDENCIA_LEITURAS_EXCENTRICIDADE,
    ])
    expect(
      textos((k) => ({
        ...k,
        indicacao: { ...k.indicacao, pontos: k.indicacao.pontos.map((p) => ({ ...p, crescente: null })) },
      })),
    ).toEqual([PENDENCIA_SEM_LEITURAS_INDICACAO])
  })

  it('pela classe: a umidade e o ΔT pesos − ar só com o empuxo medido e a convecção (classe I); a pressão em toda classe', () => {
    const nomes = (k: CalibracaoInput, classe: ClasseExatidao) =>
      camposObrigatoriosEmissao(k, { padroes: PADROES, classe })
        .filter((c) => c.regra === 'obrigatorio')
        .map((c) => c.campo)
    const classeI = nomes(calibracaoVazia(opcoesDaClasse(OPCOES_CALCULO_PADRAO, 'I'), 'I'), 'I')
    expect(classeI).toEqual(expect.arrayContaining(['umidade', 'deltaTPesos', 'pressao', 'barometro']))
    for (const classe of ['II', 'III', 'IIII', ''] as const) {
      const outras = nomes(calibracaoVazia(undefined, classe), classe)
      expect(outras, classe).toEqual(expect.arrayContaining(['dataCalibracao', 'tecnicoId', 'pesos', 'pressao', 'barometro']))
      expect(outras, classe).not.toContain('umidade')
      expect(outras, classe).not.toContain('deltaTPesos')
    }
  })

  it('o endereço só nas instalações do cliente; a OS só com reparo; o motivo só com a excentricidade dispensada', () => {
    const k = completa()
    const nomes = (x: CalibracaoInput) => camposObrigatoriosEmissao(x, { padroes: PADROES, classe: 'I' }).map((c) => c.campo)
    expect(nomes(k)).toContain('localEndereco')
    expect(nomes({ ...k, local: 'LABORATORIO' })).not.toContain('localEndereco')
    expect(nomes(k)).not.toContain('ordemServico')
    expect(nomes(k)).toContain('excentricidadeMotivo')
    expect(nomes({ ...k, excentricidade: { ...k.excentricidade, aplicavel: true } })).toEqual(
      expect.arrayContaining(['excentricidadeLeituras']),
    )
    expect(nomes({ ...k, excentricidade: { ...k.excentricidade, aplicavel: true } })).not.toContain('excentricidadeMotivo')
  })

  it('a calibração medida quando a pressão era opcional: só aviso, sem a marca de obrigatório (e sem pendência)', () => {
    const k: CalibracaoInput = {
      ...completa(),
      ...calibracaoVazia(undefined, 'III'),
      dataCalibracao: '2026-10-20',
      tecnicoId: 't1',
      localEndereco: 'Rua A, 1',
      padroesIds: ['e2', 'th'],
      pressaoComoAviso: true,
    }
    const { emissao, campos, avisos } = tudo(k, [JOGO, TH], 'III')
    expect(campo(campos, 'pressao')).toMatchObject({ regra: 'aviso', falta: true, pendencias: [AVISO_SEM_PRESSAO] })
    expect(campo(campos, 'barometro')).toMatchObject({ regra: 'aviso', falta: true })
    expect(avisos).toEqual([AVISO_SEM_PRESSAO])
    expect(emissao.filter((p) => /pressão|barômetro/i.test(p))).toEqual([])
    // Com a pressão digitada, o barômetro volta a ser obrigatório (a pressão sai com ele)
    const comPressao = tudo({ ...k, ambiente: { ...k.ambiente, pressao: 930 } }, [JOGO, TH], 'III')
    expect(campo(comPressao.campos, 'barometro')).toMatchObject({ regra: 'obrigatorio', falta: true })
    expect(comPressao.emissao).toEqual(expect.arrayContaining(campo(comPressao.campos, 'barometro')!.pendencias))
    // A nova da mesma classe: obrigatória
    const nova = camposObrigatoriosEmissao({ ...k, pressaoComoAviso: false }, { padroes: [JOGO, TH], classe: 'III' })
    expect(campo(nova, 'pressao')).toMatchObject({ regra: 'obrigatorio', falta: true })
  })

  it('a calibração já medida antes das regras do POP: o retorno ao zero não é obrigatório (era opcional)', () => {
    const k = { ...completa(), minimosComoAviso: true, indicacao: { ...completa().indicacao, retornoZero: null } }
    const { campos, todas } = tudo(k)
    expect(campo(campos, 'retornoZero')).toBeUndefined()
    expect(todas).not.toContain(PENDENCIA_RETORNO_ZERO)
  })
})

// ---- Cadastros: obrigatório para salvar -------------------------------------------------------------------------------

describe('cadastros: a marca "●" é o que impede gravar', () => {
  it('cliente PF: o nome; PJ: a razão social, ou o nome fantasia no lugar dela', () => {
    const pf = { ...CLIENTE_VAZIO, tipo: 'PF' as const }
    expect(obrigatoriosCliente(pf)).toEqual(['nome'])
    expect(normalizarCliente(pf).erros).toContain('Informe o nome do cliente.')
    expect(normalizarCliente({ ...pf, nome: 'Ana' }).erros).toEqual([])

    const pj = { ...CLIENTE_VAZIO, tipo: 'PJ' as const }
    expect(obrigatoriosCliente(pj)).toEqual(['razaoSocial'])
    expect(normalizarCliente(pj).erros).toContain('Informe o nome ou a razão social.')
    expect(normalizarCliente({ ...pj, razaoSocial: 'Mercado Ideal Ltda' }).erros).toEqual([])
    // Com o nome fantasia, a razão social não é mais obrigatória (e grava)
    expect(obrigatoriosCliente({ ...pj, nome: 'Mercado Ideal' })).toEqual([])
    expect(normalizarCliente({ ...pj, nome: 'Mercado Ideal' }).erros).toEqual([])
    // O CNPJ, o endereço e o contato: opcionais (não impedem gravar)
    expect(normalizarCliente({ ...pj, razaoSocial: 'X', documento: '', cep: '', logradouro: '', email: '' }).erros).toEqual([])
  })

  it('balança: o cliente, Max e d; o resto (série, TAG, classe, Min…) não impede gravar', () => {
    expect([...OBRIGATORIOS_BALANCA]).toEqual(['clienteId', 'max', 'd'])
    const ok = { ...BALANCA_VAZIA, clienteId: 'c1', faixas: [{ max: 15, e: 0, d: 0.005 }] }
    expect(normalizarBalanca(ok).erros).toEqual([])
    expect(normalizarBalanca({ ...ok, clienteId: '' }).erros).toEqual(['Escolha o cliente dono da balança.'])
    expect(normalizarBalanca({ ...ok, faixas: [{ max: 0, e: 0, d: 0.005 }] }).erros).toEqual([
      'Informe a capacidade máxima (Max).',
    ])
    expect(normalizarBalanca({ ...ok, faixas: [{ max: 15, e: 0, d: 0 }] }).erros).toEqual(['Informe a divisão (d).'])
    expect(normalizarBalanca({ ...ok, numeroSerie: '', identificacao: '', fabricante: '', classe: '' }).erros).toEqual([])
  })

  it('padrão: o código e, no jogo de pesos, as peças; o certificado (○) não impede gravar, impede emitir', () => {
    expect(obrigatoriosPadrao({ tipo: 'PESOS' })).toEqual(['identificacao', 'pesos'])
    expect(obrigatoriosPadrao({ tipo: 'BAROMETRO' })).toEqual(['identificacao'])
    const barometro = { ...PADRAO_VAZIO, tipo: 'BAROMETRO' as const, identificacao: 'BR-01' }
    expect(normalizarPadrao(barometro).erros).toEqual([])
    expect(normalizarPadrao({ ...barometro, identificacao: '' }).erros).toEqual([
      'Informe o código de identificação do padrão (ex.: JP-01).',
    ])
    expect(normalizarPadrao({ ...barometro, tipo: 'PESOS', pesos: [] }).erros).toEqual([
      'Cadastre as peças do jogo de pesos (valor nominal de cada uma).',
    ])
    // Sem o nº do certificado, a acreditação e a próxima calibração: grava, mas a emissão com ele fica pendente
    const sem = { ...barometro, certificado: '', acreditacao: '', validade: '' }
    expect(normalizarPadrao(sem).erros).toEqual([])
    expect([...PADRAO_PARA_EMITIR]).toEqual(['certificado', 'acreditacao', 'validade'])
    const k = { ...completa(), padroesIds: ['e2', 'th', 'br', 'te'] }
    for (const c of PADRAO_PARA_EMITIR) {
      const p = pendenciasEmissao(k, {
        padroes: [JOGO, TH, { ...BR, [c]: '' }, TERMOMETRO],
        hoje: '2026-11-09',
        temPesos: true,
        classe: 'I',
      })
      expect(p.filter((x) => x.startsWith('O padrão BR-01')).length, c).toBe(1)
    }
  })

  it('usuário: o nome e o usuário (login); a senha em branco é gerada', () => {
    expect([...OBRIGATORIOS_USUARIO]).toEqual(['nome', 'login'])
    const ok = { nome: 'Maria Souza', login: 'maria.souza', nivel: 'COMUM', senha: '' }
    expect(normalizarNovoUsuario(ok).erros).toEqual([])
    expect(normalizarNovoUsuario({ ...ok, nome: '' }).erros).toEqual(['Informe o nome da pessoa.'])
    expect(normalizarNovoUsuario({ ...ok, login: '' }).erros.length).toBe(1)
  })

  it('empresa (Configurações): a razão social', () => {
    expect([...OBRIGATORIOS_EMPRESA]).toEqual(['razaoSocial'])
    const empresa = { ...CONFIG_PADRAO.empresa, razaoSocial: 'Balanças.com Ltda' }
    expect(normalizarConfig({ ...CONFIG_PADRAO, empresa }).erros).toEqual([])
    expect(normalizarConfig({ ...CONFIG_PADRAO, empresa: { ...empresa, razaoSocial: '' } }).erros).toEqual([
      'Informe a razão social da empresa (sai no certificado).',
    ])
    expect(
      normalizarConfig({ ...CONFIG_PADRAO, empresa: { ...empresa, cnpj: '', endereco: '', telefone: '', site: '' } }).erros,
    ).toEqual([])
  })
})

// Editor da calibração: os padrões escolhidos que foram desativados depois continuam aparecendo (com o selo, para
// poderem ser tirados), as pendências da tela batem com as do servidor e a montagem das cargas não apaga as peças
// de um jogo que continua escolhido. E o rascunho recarregado quando a balança muda de unidade ou de cliente.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PENDENCIA_POP } from '#shared/arquivos.ts'
import {
  BALANCA_VAZIA,
  calibracaoVazia,
  CLIENTE_VAZIO,
  CONFIG_PADRAO,
  PADRAO_VAZIO,
  PENDENCIA_REVISADO_CANCELADO,
  PENDENCIA_REVISADO_NAO_EMITIDO,
  PENDENCIA_TECNICO_EXCLUIDO,
  pendenciasEmissao,
} from '#shared/dominio.ts'
import type { ResultadoCalculo } from '#shared/metrologia/tipos.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente, Padrao, PontoIndicacao } from '#shared/tipos.ts'
import type { DetalheCalibracao } from '../../lib/api'
import { recomporCargas } from './cargas'
import type { ContextoEtapa } from './contexto'
import {
  balancaMudaRascunho,
  estadoDoServidor,
  etapaAoAbrir,
  etapaCompleta,
  padroesDoEditor,
  pendenciasDaTela,
  podeRecomporCargas,
} from './editor'
import { EtapaPadroes } from './EtapaPadroes'

const padrao = (x: Partial<Padrao>): Padrao =>
  ({
    ...PADRAO_VAZIO,
    id: x.identificacao ?? 'p',
    versao: 1,
    identificacao: 'JP-M1',
    tipo: 'PESOS',
    ativo: true,
    certificado: 'LAB-1/2026',
    laboratorio: 'Laboratório Exemplo',
    acreditacao: 'CAL 0123',
    dataCalibracao: '2026-01-10',
    validade: '2099-01-01',
    criadoEm: '',
    atualizadoEm: '',
    ...x,
  }) as Padrao

const jogo = padrao({
  identificacao: 'JP-M1',
  classe: 'M1',
  pesos: [10_000, 10_000, 10_000, 5000, 2000, 2000, 1000, 500].map((g, i) => ({
    id: `w${i}`,
    marca: '',
    nominal: g,
    correcao: 0,
    incerteza: 160,
    k: 2,
  })),
})
const e2 = padrao({ identificacao: 'E2-01', classe: 'E2', uso: 'CERTIFICADO' })
const th = padrao({ identificacao: 'TH-01', tipo: 'TERMOHIGROMETRO' })
const br = padrao({ identificacao: 'BR-01', tipo: 'BAROMETRO' })
const td = padrao({ identificacao: 'TD-01', tipo: 'OUTRO' })
const desativado = (p: Padrao) => ({ ...p, ativo: false })

const rascunho = (padroes: Padrao[], mudar: (k: CalibracaoInput) => CalibracaoInput = (k) => k): CalibracaoInput =>
  mudar({
    ...calibracaoVazia(),
    dataCalibracao: '2026-10-20',
    tecnicoId: 't1',
    localEndereco: 'Rua A, 1 – Rio Claro/SP',
    padroesIds: padroes.map((p) => p.id),
    ambiente: { temperaturaInicial: 22, temperaturaFinal: 22.4, umidadeInicial: 50, umidadeFinal: 51, pressao: null },
  })

const balanca = { ...BALANCA_VAZIA, id: 'b1', classe: 'III', faixas: [{ max: 30, e: 0.01, d: 0.01 }] } as Balanca
/** A pressão medida com o barômetro BR-01 (obrigatória em toda classe, POP 7.5). */
const comPressao = (k: CalibracaoInput): CalibracaoInput => ({ ...k, ambiente: { ...k.ambiente, pressao: 925 } })

describe('padrões do editor: o escolhido e desativado depois continua na calibração', () => {
  it('os desativados escolhidos entram (selecionados e cartões); os desativados não escolhidos, não', () => {
    const outro = desativado(padrao({ identificacao: 'JP-VELHO' }))
    const cadastro = [jogo, desativado(th), outro]
    const { selecionados, paraEscolher } = padroesDoEditor(cadastro, rascunho([jogo, th]))
    expect(selecionados.map((p) => [p.identificacao, p.ativo])).toEqual([
      ['JP-M1', true],
      ['TH-01', false],
    ])
    expect(paraEscolher.map((p) => p.identificacao)).toEqual(['JP-M1', 'TH-01'])
    // Tirado da calibração, some da lista (não é oferecido de novo)
    const tirado = padroesDoEditor(cadastro, rascunho([jogo]))
    expect(tirado.paraEscolher.map((p) => p.identificacao)).toEqual(['JP-M1'])
  })

  it('pendências da tela como as do servidor: "desativado", e nada de "Tudo pronto"', () => {
    const f = rascunho([jogo, th, br], comPressao)
    const { selecionados } = padroesDoEditor([jogo, desativado(th), br], f)
    const p = pendenciasEmissao(f, { padroes: selecionados, hoje: '2026-10-28', temPesos: true, classe: 'III' })
    expect(p).toEqual([
      'O padrão TH-01 está desativado: tire-o desta calibração (etapa Padrões e ambiente) ou reative-o em Padrões.',
    ])
  })

  it('classe I com o TD-01 desativado: "desativado", não a pendência errada "escolha o termômetro de duas entradas"', () => {
    const f = rascunho([e2, th, br, td], (k) => ({
      ...k,
      ambiente: { ...k.ambiente, pressao: 941.5, deltaTPesos: 0.3 },
      opcoes: { ...k.opcoes, empuxo: 'MEDIDO', conveccao: 'CALCULAR' },
    }))
    const { selecionados } = padroesDoEditor([e2, th, br, desativado(td)], f)
    const p = pendenciasEmissao(f, { padroes: selecionados, hoje: '2026-10-28', temPesos: true, classe: 'I' })
    expect(p.some((x) => x.startsWith('O padrão TD-01 está desativado'))).toBe(true)
    expect(p.some((x) => x.includes('termômetro de duas entradas'))).toBe(false)
  })

  it('revisão: o padrão congelado na emissão vale, mesmo desativado depois (sem selo nem pendência)', () => {
    const f = rascunho([jogo, th, br], (k) => ({ ...comPressao(k), padroesCongelados: [jogo, th, br] }) as CalibracaoInput)
    const { selecionados, paraEscolher } = padroesDoEditor([desativado(jogo), th, br], f)
    expect(selecionados.every((p) => p.ativo)).toBe(true)
    expect(paraEscolher.map((p) => p.identificacao)).toEqual(['JP-M1', 'TH-01', 'BR-01'])
    expect(pendenciasEmissao(f, { padroes: selecionados, hoje: '2026-10-28', temPesos: true, classe: 'III' })).toEqual([])
  })

  it('a etapa Padrões mostra o escolhido desativado, marcado e com o selo, para poder tirá-lo', () => {
    const f = rascunho([jogo, th])
    const { selecionados, paraEscolher } = padroesDoEditor([jogo, desativado(th)], f)
    const ctx: ContextoEtapa = {
      f,
      alterar: () => {},
      balanca,
      cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
      padroes: paraEscolher,
      selecionados,
      calc: null,
      config: CONFIG_PADRAO,
      equipe: [],
      status: 'RASCUNHO',
      editarBalanca: () => {},
      folhaCampo: null,
      vincularFolha: async () => true,
      novaFolha: () => {},
    }
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EtapaPadroes, ctx)))
    const cartao = html.match(
      /<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*TH-01(?:(?!<\/button>).)*<\/button>/s,
    )?.[0]
    expect(cartao).toBeTruthy()
    const texto = cartao!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(texto).toContain('Desativado')
    expect(texto).toContain('impede a emissão')
    // Escolhido, o termo-higrômetro não pede para ser cadastrado
    expect(html).not.toContain('Cadastre em Padrões o termo-higrômetro')
  })
})

describe('etapa Padrões e ambiente na lista de etapas', () => {
  it('com um padrão escolhido desativado, não ganha o ✓ (a emissão é recusada)', () => {
    const f = rascunho([jogo, th, br], comPressao)
    const ok = padroesDoEditor([jogo, th, br], f).selecionados
    expect(etapaCompleta('padroes', { f, calc: null, selecionados: ok })).toBe(true)
    const comDesativado = padroesDoEditor([jogo, desativado(th), br], f).selecionados
    expect(etapaCompleta('padroes', { f, calc: null, selecionados: comDesativado })).toBe(false)
  })

  it('sem a pressão, ou sem o barômetro, não ganha o ✓ (obrigatória em toda classe, POP 7.5); a visita de antes, sim', () => {
    const ok = (f: CalibracaoInput, padroes: Padrao[]) =>
      etapaCompleta('padroes', { f, calc: null, selecionados: padroesDoEditor(padroes, f).selecionados, balanca })
    expect(ok(rascunho([jogo, th, br], comPressao), [jogo, th, br])).toBe(true)
    // Sem a pressão; a pressão sem o barômetro; o barômetro sem a pressão
    expect(ok(rascunho([jogo, th]), [jogo, th])).toBe(false)
    expect(ok(rascunho([jogo, th], comPressao), [jogo, th])).toBe(false)
    expect(ok(rascunho([jogo, th, br]), [jogo, th, br])).toBe(false)
    // Medida quando ela era opcional (classe III): sem os dois, ganha; com só um deles, não (como até a 1.0.4)
    const antes = (k: CalibracaoInput) => ({ ...k, pressaoComoAviso: true })
    expect(ok(rascunho([jogo, th], antes), [jogo, th])).toBe(true)
    expect(ok(rascunho([jogo, th, br], antes), [jogo, th, br])).toBe(false)
    // Na classe II ela já era obrigatória
    expect(
      etapaCompleta('padroes', {
        f: rascunho([jogo, th], antes),
        calc: null,
        selecionados: [jogo, th],
        balanca: { ...balanca, classe: 'II' },
      }),
    ).toBe(false)
  })
})

describe('a etapa em que o editor abre', () => {
  const ponto = (carga: number, crescente: number | null): PontoIndicacao => ({
    id: `p${carga}`,
    carga,
    pecas: [],
    pecasManuais: false,
    crescente,
    decrescente: null,
    nivelSubstituicao: 0,
  })
  const plano = (leituraRep: number | null, crescente: number | null): CalibracaoInput => {
    const k = calibracaoVazia()
    return {
      ...k,
      repetibilidade: [{ id: 'r', carga: 4.8, leituras: [leituraRep, null, null, null, null] }],
      indicacao: { ...k.indicacao, pontos: [ponto(0, null), ponto(8, crescente), ponto(16, null)] },
    }
  }

  it('a recalibração (o plano copiado da última, sem leituras) abre na etapa 1, como a primeira calibração', () => {
    expect(etapaAoAbrir(plano(null, null))).toBeNull()
    expect(etapaAoAbrir(calibracaoVazia())).toBeNull()
  })

  it('retoma na primeira etapa ainda sem leituras: depois da repetibilidade, a excentricidade; com o erro de indicação, a revisão', () => {
    expect(etapaAoAbrir(plano(4.8, null))).toBe('excentricidade')
    expect(etapaAoAbrir(plano(null, 8.005))).toBe('revisao')
    expect(etapaAoAbrir(plano(4.8, 8.005))).toBe('revisao')
  })
})

describe('etapa Balança e ajuste na lista de etapas', () => {
  it('sem nº de série nem TAG, a etapa fica sem o ✓ (a emissão pede a identificação, POP 7.3)', () => {
    const f = calibracaoVazia()
    const de = (b: Partial<Balanca>) =>
      etapaCompleta('instrumento', { f, calc: null, selecionados: [], balanca: { ...BALANCA_VAZIA, ...b } as Balanca })
    expect(de({ numeroSerie: '', identificacao: '' })).toBe(false)
    expect(de({ numeroSerie: 'SN-1', identificacao: '' })).toBe(true)
    expect(de({ numeroSerie: '', identificacao: 'BAL-04' })).toBe(true)
    // Sem a balança no contexto (ainda carregando), só o ajuste conta
    expect(etapaCompleta('instrumento', { f, calc: null, selecionados: [] })).toBe(true)
  })
})

describe('etapas Excentricidade e Erro de indicação na lista de etapas (POP 7.7 e 7.10)', () => {
  const naoFeita = (motivo: string): CalibracaoInput => ({
    ...calibracaoVazia(),
    excentricidade: { aplicavel: false, motivo, carga: 0, metodo: 1, posicoes: [] },
  })
  const balancaDe = (receptor: Balanca['receptor']) => ({ ...BALANCA_VAZIA, receptor }) as Balanca

  it('excentricidade "não realizada": só na balança suspensa (gancho) e com o motivo', () => {
    const de = (f: CalibracaoInput, receptor: Balanca['receptor']) =>
      etapaCompleta('excentricidade', { f, calc: null, selecionados: [], balanca: balancaDe(receptor) })
    expect(de(naoFeita('A carga se centraliza sozinha.'), 'GANCHO')).toBe(true)
    expect(de(naoFeita(''), 'GANCHO')).toBe(false)
    expect(de(naoFeita('Prato pequeno'), 'RETANGULAR')).toBe(false)
    // Registro de antes das regras (revisão de certificado da 1.0.2): como na época
    expect(de({ ...naoFeita('Prato pequeno'), substituiId: 'orig' }, 'RETANGULAR')).toBe(true)
    // Rascunho já medido antes das regras (marcado na atualização): também
    expect(de({ ...naoFeita('Prato pequeno'), minimosComoAviso: true }, 'RETANGULAR')).toBe(true)
  })

  it('erro de indicação: com todos os pontos lidos, falta o retorno ao zero na calibração nova', () => {
    const lida = (retornoZero: number | null): CalibracaoInput => {
      const f = calibracaoVazia()
      return {
        ...f,
        indicacao: {
          ...f.indicacao,
          retornoZero,
          pontos: [0, 10].map((carga) => ({
            id: `p${carga}`,
            carga,
            pecas: [],
            pecasManuais: false,
            crescente: carga,
            decrescente: null,
            nivelSubstituicao: 0,
          })),
        },
      }
    }
    const de = (f: CalibracaoInput) => etapaCompleta('indicacao', { f, calc: null, selecionados: [] })
    expect(de(lida(0))).toBe(true)
    expect(de(lida(null))).toBe(false)
    expect(de({ ...lida(null), substituiId: 'orig' })).toBe(true)
    expect(de({ ...lida(null), minimosComoAviso: true })).toBe(true)
  })

  it('erro de indicação: com a leitura que falta (a descida no "crescente e decrescente", ou a subida), a etapa não fica feita', () => {
    const f = calibracaoVazia(undefined, 'III')
    const k: CalibracaoInput = {
      ...f,
      indicacao: {
        ...f.indicacao,
        retornoZero: 0,
        pontos: [0, 10, 20, 30].map((carga) => ({
          id: `p${carga}`,
          carga,
          pecas: [],
          pecasManuais: false,
          crescente: carga,
          decrescente: carga === 10 ? null : carga,
          nivelSubstituicao: 0,
        })),
      },
    }
    const calc = (pendencias: string[]) => ({ resultado: { pendencias } as unknown as ResultadoCalculo, comoEncontrado: null })
    const de = (pendencias: string[]) => etapaCompleta('indicacao', { f: k, calc: calc(pendencias), selecionados: [] })
    expect(de(['Erro de indicação: falta a leitura de descida em 10,00 kg (POP 7.7).'])).toBe(false)
    expect(de(['Erro de indicação: falta a leitura de subida em 10,00 kg (POP 7.7).'])).toBe(false)
    // As outras pendências do cálculo não são da etapa
    expect(de(['Repetibilidade: registre as leituras do ensaio (no mínimo 5; 3 com carga ≥ 100 kg; POP, Tabela 4).'])).toBe(true)
  })
})

describe('montagem das cargas ao abrir o editor', () => {
  const ponto = (carga: number): PontoIndicacao => ({
    id: `p${carga}`,
    carga,
    pecas: [],
    pecasManuais: false,
    crescente: null,
    decrescente: null,
    nivelSubstituicao: 0,
  })
  const montado = recomporCargas(
    rascunho([jogo, th], (k) => ({ ...k, indicacao: { ...k.indicacao, pontos: [0, 5, 12.5, 20, 30].map(ponto) } })),
    balanca,
    [jogo],
  )
  const pecasPorPonto = (k: CalibracaoInput) => k.indicacao.pontos.map((p) => p.pecas.reduce((s, x) => s + x.quantidade, 0))

  it('jogo desativado e ainda escolhido: não recompõe (a montagem não usa jogo desativado e apagaria as peças)', () => {
    expect(
      pecasPorPonto(montado)
        .slice(1)
        .every((n) => n > 0),
    ).toBe(true)
    const { selecionados } = padroesDoEditor([desativado(jogo), th], montado)
    expect(podeRecomporCargas(montado.padroesIds, selecionados)).toBe(false)
    // O que acontecia ao abrir o editor: as peças de todos os pontos apagadas e gravadas sozinhas
    const pesos = selecionados.filter((p) => p.tipo === 'PESOS')
    expect(pecasPorPonto(recomporCargas(montado, balanca, pesos)).every((n) => n === 0)).toBe(true)
  })

  it('revisão com o jogo congelado na emissão (desativado depois): recompõe com ele e as peças ficam', () => {
    const revisao = { ...montado, padroesCongelados: [jogo, th] } as CalibracaoInput
    const { selecionados } = padroesDoEditor([desativado(jogo), th], revisao)
    expect(podeRecomporCargas(revisao.padroesIds, selecionados)).toBe(true)
    expect(
      recomporCargas(
        revisao,
        balanca,
        selecionados.filter((p) => p.tipo === 'PESOS'),
      ),
    ).toBe(revisao)
  })

  it('escolhido que não se acha (excluído do cadastro): não recompõe', () => {
    const { selecionados } = padroesDoEditor([th], montado)
    expect(podeRecomporCargas(montado.padroesIds, selecionados)).toBe(false)
    expect(pecasPorPonto(recomporCargas(montado, balanca, [])).every((n) => n === 0)).toBe(true)
  })

  it('todos achados e ativos: recompõe', () => {
    const { selecionados } = padroesDoEditor([jogo, th], montado)
    expect(podeRecomporCargas(montado.padroesIds, selecionados)).toBe(true)
  })
})

describe('pendências da tela', () => {
  const base = { locais: ['Local A.'], calc: null, semPop: false }

  it('com tudo gravado, junta as do servidor (a tela nunca diz "Tudo pronto" quando o servidor recusa)', () => {
    const servidor = ['O padrão TD-01 está desativado.', 'Local A.']
    expect(pendenciasDaTela({ ...base, servidor, emDia: true })).toEqual(['Local A.', 'O padrão TD-01 está desativado.'])
  })

  it('com alteração por gravar, só as locais (as do servidor são da versão anterior)', () => {
    expect(pendenciasDaTela({ ...base, servidor: ['Antiga.'], emDia: false })).toEqual(['Local A.'])
    // O técnico excluído só o servidor sabe: vale sempre
    expect(pendenciasDaTela({ ...base, servidor: [PENDENCIA_TECNICO_EXCLUIDO], emDia: false })).toEqual([
      'Local A.',
      PENDENCIA_TECNICO_EXCLUIDO,
    ])
    // A revisão de um certificado cancelado também (nunca "Tudo pronto" para uma revisão que o servidor recusa)
    for (const p of [PENDENCIA_REVISADO_CANCELADO, PENDENCIA_REVISADO_NAO_EMITIDO])
      expect(pendenciasDaTela({ ...base, servidor: [p, 'Antiga.'], emDia: false })).toEqual(['Local A.', p])
    // O certificado digital da empresa que não pode assinar não depende do que está na tela: vale sempre (a tela não
    // libera "Emitir" que o servidor recusa)
    const vencido =
      'O certificado digital da empresa venceu: a emissão fica bloqueada até o administrador resolver em Configurações → Certificado digital.'
    expect(pendenciasDaTela({ ...base, servidor: [vencido, 'Antiga.'], emDia: false })).toEqual(['Local A.', vencido])
  })

  it('o POP quem diz é a consulta ao vivo (registrado em outra aba, a do servidor ficou velha)', () => {
    expect(pendenciasDaTela({ ...base, servidor: [PENDENCIA_POP], emDia: true })).toEqual(['Local A.'])
    expect(pendenciasDaTela({ ...base, semPop: true, servidor: [], emDia: true })).toEqual(['Local A.', PENDENCIA_POP])
  })

  it('as do cálculo e as do "como encontrado"', () => {
    const calc = {
      resultado: { pendencias: ['Cálculo.'] },
      comoEncontrado: { pendencias: ['Leitura.'] },
    } as unknown as Parameters<typeof pendenciasDaTela>[0]['calc']
    expect(pendenciasDaTela({ ...base, calc, servidor: [], emDia: true })).toEqual([
      'Local A.',
      'Cálculo.',
      'Como encontrado: Leitura.',
    ])
  })
})

describe('balança corrigida dentro do editor', () => {
  const b = { ...balanca, unidade: 'kg', clienteId: 'c1' } as Balanca

  it('trocar a unidade ou o cliente muda o rascunho no servidor: o editor recarrega', () => {
    expect(balancaMudaRascunho(b, { ...b, unidade: 'g' })).toBe(true)
    expect(balancaMudaRascunho(b, { ...b, clienteId: 'c2' })).toBe(true)
    expect(balancaMudaRascunho(b, { ...b, modelo: 'Outro', classe: 'II' } as Balanca)).toBe(false)
  })

  it('o estado recarregado: os números convertidos, a versão nova e o cliente novo', () => {
    const k = {
      ...rascunho([jogo]),
      clienteId: 'c2',
      repetibilidade: [{ id: 'r', carga: 12000, leituras: [12000, 12010, null] }],
      id: 'k1',
      versao: 7,
      status: 'RASCUNHO',
      numero: '',
      ano: null,
      sequencia: null,
      revisao: 0,
      emissao: null,
      cancelamento: null,
      criadoPor: 'Ana',
      criadoEm: '',
      atualizadoEm: '',
    } as unknown as Calibracao
    const d = {
      calibracao: k,
      cliente: { ...CLIENTE_VAZIO, id: 'c2' },
      balanca: { ...b, unidade: 'g', clienteId: 'c2' },
      padroes: [],
      pendencias: ['Uma.'],
      folhaCampo: null,
      numeroReservado: null,
    } as unknown as DetalheCalibracao
    const e = estadoDoServidor(d)
    expect(e.versao).toBe(7)
    expect(e.f.clienteId).toBe('c2')
    expect(e.f.repetibilidade[0].carga).toBe(12000)
    expect(e.pendencias).toEqual(['Uma.'])
    // Os avisos do servidor (não impedem a emitir); a resposta de antes desta versão vem sem eles
    expect(e.avisos).toEqual([])
    expect(estadoDoServidor({ ...d, avisos: ['Confira a data da calibração.'] }).avisos).toEqual([
      'Confira a data da calibração.',
    ])
    expect(e.numeroReservado).toBeNull()
    // Só os dados de entrada: a versão vai à parte (no PUT)
    expect('versao' in e.f || 'id' in e.f || 'status' in e.f).toBe(false)
  })
})

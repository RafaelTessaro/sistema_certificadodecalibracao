// O assistente da calibração alinhado ao POP e à folha de campo (FOR-CAL-01 rev. 03): sem ajuste externo, "como
// encontrado", reparo nem verificação preliminar na calibração nova; o método da excentricidade fixo pela classe; a
// divisão do modo de serviço só nas opções do cálculo. Os registros de antes aparecem para conferência, sem edição.
// Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, CalibracaoInput, Cliente, EnsaioIndicacao, Padrao } from '#shared/tipos.ts'
import type { ContextoEtapa } from './contexto'
import { EtapaConclusao } from './EtapaConclusao'
import { EtapaExcentricidade } from './EtapaExcentricidade'
import { ComoEncontradoAnterior, EtapaIndicacao } from './EtapaIndicacao'
import { EtapaInstrumento } from './EtapaInstrumento'
import { EtapaPadroes } from './EtapaPadroes'
import { EtapaRepetibilidade } from './EtapaRepetibilidade'
import { comMetodoDaClasse, pedeAjusteInterno } from './util'

// As janelas (as peças de cada carga) abrem num portal no document.body, que não existe no servidor
vi.mock('../ui/Modal', () => ({ Modal: () => null }))

const balanca = {
  ...BALANCA_VAZIA,
  id: 'b1',
  tipo: 'BALCAO',
  classe: 'III',
  fabricante: 'Toledo',
  modelo: 'Prix IV DUE',
  faixas: [{ max: 30, e: 0.01, d: 0.01 }],
} as Balanca

function contexto(f: CalibracaoInput, b: Balanca = balanca, padroes: Padrao[] = [], selecionados: Padrao[] = []): ContextoEtapa {
  let calc: ContextoEtapa['calc'] = null
  try {
    calc = calcularCalibracao(f, b, selecionados)
  } catch {
    calc = null
  }
  return {
    f,
    alterar: () => {},
    balanca: b,
    cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
    padroes,
    selecionados,
    calc,
    config: CONFIG_PADRAO,
    equipe: [],
    status: 'RASCUNHO',
    editarBalanca: () => {},
    folhaCampo: null,
    vincularFolha: async () => true,
    novaFolha: () => {},
  }
}

const html = (componente: FunctionComponent<ContextoEtapa>, ctx: ContextoEtapa) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(componente, ctx)))

const ponto = (id: string, carga: number, crescente: number | null = null) => ({
  id,
  carga,
  pecas: [],
  pecasManuais: false,
  crescente,
  decrescente: null,
  nivelSubstituicao: 0,
})
const ensaio = (pontos: EnsaioIndicacao['pontos']): EnsaioIndicacao => ({
  metodo: 'CRESCENTE_DECRESCENTE',
  pontos,
  retornoZero: 0,
  substituicao: { ativa: false, pecas: [], etapas: [] },
})

/** Calibração gravada por uma versão anterior: ajuste externo com "como encontrado", reparo e pré-carga "não". */
function legado(): CalibracaoInput {
  const k = calibracaoVazia(undefined, 'III')
  return {
    ...k,
    preliminar: { ...k.preliminar, preCarga: 'NAO' },
    ajuste: { realizado: 'EXTERNO', descricao: 'span com 20 kg' },
    comoEncontrado: ensaio([ponto('a', 0, 0), ponto('b', 10, 10.02), ponto('c', 30, 30.04)]),
    indicacao: ensaio([ponto('a', 0, 0), ponto('b', 10, 10), ponto('c', 30, 30)]),
    reparo: { houve: true, descricao: 'troca da célula', marcaReparo: 'MR-1', selosRetirados: 'A', selosColocados: 'B' },
  }
}

describe('Balança e ajuste: calibração nova', () => {
  it('só "Não houve ajuste" e o ajuste interno (CAL); sem ajuste externo, reparo nem verificação preliminar', () => {
    const t = html(EtapaInstrumento, contexto(calibracaoVazia(undefined, 'III')))
    expect(t).toContain('Não houve ajuste')
    expect(t).toContain('Ajuste interno (CAL) antes dos ensaios')
    expect(t).not.toContain('Ajuste externo')
    expect(t).not.toMatch(/Reparo|Selos|Marca de reparo/)
    expect(t).not.toContain('Verificação antes de calibrar')
    expect(t).not.toContain('Zero automático')
    expect(t).not.toContain('Registro de versão anterior')
    expect(t).not.toContain('Antes do ajuste')
  })

  it('classe I (e d menor que Max/100 000): lembra o ajuste interno antes dos ensaios (POP 7.11)', () => {
    const classeI = { ...balanca, classe: 'I', unidade: 'g', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] } as Balanca
    expect(html(EtapaInstrumento, contexto(calibracaoVazia(undefined, 'I'), classeI))).toContain(
      'Classe I: o cliente faz o ajuste interno (CAL) antes dos ensaios',
    )
    expect(html(EtapaInstrumento, contexto(calibracaoVazia(undefined, 'III')))).not.toContain('o cliente faz o ajuste interno')
    expect(pedeAjusteInterno(classeI)).toBe(true)
    expect(pedeAjusteInterno(balanca)).toBe(false)
    expect(pedeAjusteInterno({ classe: 'II', faixas: [{ max: 220, e: 0.01, d: 0.001 }] })).toBe(true)
  })

  it('com o ajuste interno: a observação opcional, sem a aba "como encontrado"', () => {
    const f = { ...calibracaoVazia(undefined, 'III'), ajuste: { realizado: 'INTERNO' as const, descricao: '' } }
    expect(html(EtapaInstrumento, contexto(f))).toContain('Observação (opcional)')
    // O "como encontrado" vazio que a tela de antes criava não abre a aba
    const comVazio = { ...f, comoEncontrado: { ...ensaio([ponto('a', 0), ponto('b', 10)]), retornoZero: null } }
    expect(html(EtapaIndicacao, contexto(comVazio))).not.toContain('Antes do ajuste')
  })
})

describe('registro de antes (legado): aparece só para conferência', () => {
  it('Balança e ajuste: o ajuste externo, o "como encontrado", o reparo e a pré-carga "não"', () => {
    const t = html(EtapaInstrumento, contexto(legado()))
    expect(t).toContain('Registro de versão anterior')
    expect(t).toContain('Ajuste externo, com peso')
    expect(t).toContain('value="span com 20 kg"')
    expect(t).toContain('Leituras antes do ajuste em 3 pontos')
    expect(t).toContain('troca da célula · marca de reparo nº MR-1 · selos retirados: A · selos colocados: B')
    expect(t).toContain('Não atendido: pré-carga aplicada.')
    expect(t).toContain('Tirar do registro')
    // Sem a escolha do ajuste (só o que foi registrado) e sem os campos do reparo
    expect(t).not.toContain('Ajuste interno (CAL) antes dos ensaios')
    expect(t).not.toContain('id="k-marca"')
  })

  it('só a verificação preliminar "não": a escolha do ajuste continua', () => {
    const k = calibracaoVazia(undefined, 'III')
    const t = html(EtapaInstrumento, contexto({ ...k, preliminar: { ...k.preliminar, limpa: 'NAO' } }))
    expect(t).toContain('Não atendido: limpa.')
    expect(t).toContain('Ajuste interno (CAL) antes dos ensaios')
  })

  it('Erro de indicação: as abas antes/depois, e o "como encontrado" sem campos de edição', () => {
    const ctx = contexto(legado())
    const t = html(EtapaIndicacao, ctx)
    expect(t).toContain('Antes do ajuste (como encontrado)')
    expect(t).toContain('Depois do ajuste')
    const antes = renderToStaticMarkup(createElement(ComoEncontradoAnterior, { ctx }))
    expect(antes).toContain('Registro de versão anterior')
    expect(antes).toContain('10,02')
    expect(antes).toContain('30,04')
    expect(antes).not.toContain('<input')
    expect(antes).not.toContain('<button')
  })
})

describe('Excentricidade: método fixo pela classe (POP 7.10)', () => {
  it('classe III: "zera e desloca" como texto, sem a lista nem o "alterar" (usuário comum)', () => {
    const t = html(EtapaExcentricidade, contexto(calibracaoVazia(undefined, 'III')))
    expect(t).toContain('Zera e desloca a carga pelas posições')
    expect(t).toContain('Fixo pela classe (POP 7.10)')
    expect(t).not.toContain('id="ecc-metodo"')
    expect(t).not.toContain('>alterar<')
  })

  it('classe I: "zera antes de cada posição"', () => {
    const classeI = { ...balanca, classe: 'I', unidade: 'g', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] } as Balanca
    const t = html(EtapaExcentricidade, contexto(calibracaoVazia(undefined, 'I'), classeI))
    expect(t).toContain('Zera antes de cada posição')
    expect(t).toContain('na classe I, o zero é conferido antes de cada posição')
  })

  it('classe I: o "zero antes" fora do esperado (a carga digitada no lugar dele) fica em vermelho, como a pendência', () => {
    const classeI = { ...balanca, classe: 'I', unidade: 'g', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] } as Balanca
    const k = calibracaoVazia(undefined, 'I')
    const f: CalibracaoInput = {
      ...k,
      excentricidade: {
        ...k.excentricidade,
        carga: 100,
        metodo: 3,
        posicoes: [
          { rotulo: 'Centro', leitura: 100, referencia: 0 },
          { rotulo: 'Frente', leitura: 100.0001, referencia: 100.0001 },
        ],
      },
    }
    const t = html(EtapaExcentricidade, contexto(f, classeI))
    /** As classes do campo pelo rótulo (a cor do tom). */
    const campo = (rotulo: string) => t.match(new RegExp(`<input[^>]*aria-label="${rotulo}"[^>]*>`))?.[0] ?? ''
    expect(campo('Referência da posição 2')).toContain('border-danger')
    expect(campo('Referência da posição 1')).not.toContain('border-danger')
    expect(campo('Indicação na posição 2')).not.toContain('border-danger')
  })

  it('repetibilidade sem a carga: as leituras não ficam vermelhas (a pendência é a da carga); com ela, a vírgula errada fica', () => {
    const k = calibracaoVazia(undefined, 'III')
    const campo = (t: string, rotulo: string) => t.match(new RegExp(`<input[^>]*aria-label="${rotulo}"[^>]*>`))?.[0] ?? ''
    const semCarga = html(
      EtapaRepetibilidade,
      contexto({ ...k, repetibilidade: [{ id: 'r', carga: 0, leituras: [15, 15, 15, 15, 15] }] }),
    )
    expect(campo(semCarga, 'Leitura 1')).not.toContain('border-danger')
    const comCarga = html(
      EtapaRepetibilidade,
      contexto({ ...k, repetibilidade: [{ id: 'r', carga: 15, leituras: [1500, 15, 15, 15, 15] }] }),
    )
    expect(campo(comCarga, 'Leitura 1')).toContain('border-danger')
    expect(campo(comCarga, 'Leitura 2')).not.toContain('border-danger')
  })

  it('registro de antes com outro método: mostra o dele, avisa e deixa alterar', () => {
    const k = calibracaoVazia(undefined, 'III')
    const f: CalibracaoInput = {
      ...k,
      excentricidade: {
        ...k.excentricidade,
        carga: 10,
        metodo: 2,
        posicoes: [{ rotulo: 'Centro', leitura: 10, referencia: null }],
      },
    }
    const t = html(EtapaExcentricidade, contexto(f))
    expect(t).toContain('Tara com a carga no centro e desloca')
    expect(t).toContain('Diferente do POP (7.10): nesta classe, o método é “zera e desloca a carga pelas posições”.')
    expect(t).toContain('>alterar<')
  })
})

describe('classe trocada no meio da calibração ("Corrigir cadastro")', () => {
  it('o ensaio de excentricidade ainda sem leituras passa para o método da classe nova; com leituras, fica', () => {
    const k = calibracaoVazia(undefined, 'III')
    expect(comMetodoDaClasse(k, 'I').excentricidade.metodo).toBe(3)
    expect(comMetodoDaClasse(comMetodoDaClasse(k, 'I'), 'II').excentricidade.metodo).toBe(1)
    // Mesmo método: o mesmo objeto (nada a gravar)
    expect(comMetodoDaClasse(k, 'III')).toBe(k)
    const lido = {
      ...k,
      excentricidade: { ...k.excentricidade, posicoes: [{ rotulo: 'Centro', leitura: 10, referencia: null }] },
    }
    expect(comMetodoDaClasse(lido, 'I')).toBe(lido)
  })
})

describe('divisão do modo de serviço (d_T): só nas opções do cálculo', () => {
  it('não aparece nas outras etapas; nas opções fechadas, só o aviso quando está em uso', () => {
    const k = calibracaoVazia(undefined, 'III')
    for (const etapa of [EtapaInstrumento, EtapaPadroes, EtapaRepetibilidade, EtapaExcentricidade, EtapaIndicacao])
      expect(html(etapa, contexto(k))).not.toMatch(/modo (de )?servi[çc]o|op-dteste/)
    expect(html(EtapaConclusao, contexto(k))).not.toMatch(/modo (de )?servi[çc]o|op-dteste/)
    const comDt = { ...k, opcoes: { ...k.opcoes, divisaoTeste: 0.001 } }
    const t = html(EtapaConclusao, contexto(comDt))
    expect(t).toContain('Leituras no modo de serviço, com divisão de 0,001 kg (POP 7.6)')
    expect(t).not.toContain('op-dteste')
  })
})

describe('Padrões e ambiente: o termo-higrômetro (POP 6.2)', () => {
  const th = { ...PADRAO_VAZIO, id: 'th', tipo: 'TERMOHIGROMETRO', identificacao: 'TH-01', pesos: [] } as unknown as Padrao
  const comTemperatura = (padroesIds: string[] = []) => ({
    ...calibracaoVazia(undefined, 'III'),
    padroesIds,
    ambiente: { ...calibracaoVazia().ambiente, temperaturaInicial: 23, temperaturaFinal: 24 },
  })
  it('temperatura registrada sem o termo-higrômetro escolhido: avisa', () => {
    expect(html(EtapaPadroes, contexto(comTemperatura(), balanca, []))).toContain(
      'Cadastre em Padrões o termo-higrômetro usado e escolha-o aqui (POP 6.2).',
    )
    expect(html(EtapaPadroes, contexto(comTemperatura(), balanca, [th]))).toContain(
      'Escolha acima o termo-higrômetro usado (POP 6.2)',
    )
    expect(html(EtapaPadroes, contexto(comTemperatura(['th']), balanca, [th], [th]))).not.toContain('POP 6.2')
    // Sem temperatura ainda: nada
    expect(html(EtapaPadroes, contexto(calibracaoVazia(undefined, 'III'), balanca, [th]))).not.toContain('POP 6.2')
  })
})

describe('dados que o POP exige na calibração nova: a carga da repetibilidade e o retorno ao zero', () => {
  const lido = (x: string) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('repetibilidade com leituras e sem a carga: o campo pede a carga', () => {
    const f = { ...calibracaoVazia(undefined, 'III'), repetibilidade: [{ id: 'r', carga: 0, leituras: [15, 15, 15, 15, 15] }] }
    expect(lido(html(EtapaRepetibilidade, contexto(f)))).toContain('Informe a carga do ensaio.')
    const comCarga = { ...f, repetibilidade: [{ ...f.repetibilidade[0], carga: 15 }] }
    expect(lido(html(EtapaRepetibilidade, contexto(comCarga)))).not.toContain('Informe a carga do ensaio.')
  })

  it('retorno ao zero: obrigatório na calibração nova (POP 7.7); opcional na revisão de um certificado de antes', () => {
    const f = calibracaoVazia(undefined, 'III')
    expect(lido(html(EtapaIndicacao, contexto(f)))).toContain('Indicação depois de retirar toda a carga (POP 7.7).')
    expect(lido(html(EtapaIndicacao, contexto({ ...f, substituiId: 'orig' })))).toContain(
      'Indicação depois de retirar toda a carga (opcional)',
    )
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { CONFIG_PADRAO } from '#shared/dominio.ts'
import type { CalibracaoInput, EnsaioIndicacao, PontoIndicacao } from '#shared/tipos.ts'
import { exemploRodoviaria } from '../../../server/pdf/exemplosCertificado.ts'
import type { ContextoEtapa } from './contexto'
import { PainelDaAba } from './EtapaIndicacao'
import {
  type AbaIndicacao,
  ensaioEmOrdemDeCarga,
  leiturasDigitadas,
  mudarEnsaioDaAba,
  podeRefazerPontos,
  textoRefazerPontos,
} from './indicacao'

// Sem DOM: a janela (portal no document.body) não é desenhada; fechada, ela não mostra nada
vi.mock('../ui/Modal', () => ({ Modal: () => null }))

/** Rodoviária com substituição, ajuste interno e o "como encontrado" igual ao ensaio final (mesmas leituras). */
function comAjuste(): { k: CalibracaoInput; d: ReturnType<typeof exemploRodoviaria> } {
  const d = exemploRodoviaria()
  const k: CalibracaoInput = {
    ...d.calibracao,
    ajuste: { ...d.calibracao.ajuste, realizado: 'INTERNO' },
    comoEncontrado: { ...structuredClone(d.calibracao.indicacao), retornoZero: null },
  }
  return { k, d }
}

describe('mudarEnsaioDaAba', () => {
  it('o retorno ao zero de cada aba vai para o ensaio dela (como na folha de campo, uma célula por coluna)', () => {
    const { k } = comAjuste()
    const antes = mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, retornoZero: 20 }))
    expect(antes.comoEncontrado?.retornoZero).toBe(20)
    expect(antes.indicacao.retornoZero).toBe(k.indicacao.retornoZero)
    const depois = mudarEnsaioDaAba(k, 'depois', (e) => ({ ...e, retornoZero: -20 }))
    expect(depois.indicacao.retornoZero).toBe(-20)
    expect(depois.comoEncontrado?.retornoZero).toBeNull()
  })

  it('cada aba tem o seu método de carregamento', () => {
    const { k } = comAjuste()
    const r = mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, metodo: 'CONTINUO' }))
    expect(r.comoEncontrado?.metodo).toBe('CONTINUO')
    expect(r.indicacao.metodo).toBe(k.indicacao.metodo)
  })

  it('sem o "como encontrado" (não houve ajuste), muda o ensaio final', () => {
    const { k } = comAjuste()
    const r = mudarEnsaioDaAba({ ...k, comoEncontrado: null }, 'antes', (e) => ({ ...e, retornoZero: 40 }))
    expect(r.indicacao.retornoZero).toBe(40)
    expect(r.comoEncontrado).toBeNull()
  })

  it('com substituição, o retorno ao zero "como encontrado" entra na incerteza desse ensaio', () => {
    const { k, d } = comAjuste()
    const { balanca, padroes } = d.emissao
    const maior = (x: CalibracaoInput) => {
      const r = calcularCalibracao(x, balanca, padroes).comoEncontrado!
      const p = r.pontos.reduce((a, b) => (b.carga > a.carga ? b : a))
      return p.crescente!
    }
    const sem = maior(k)
    const com = maior(mudarEnsaioDaAba(k, 'antes', (e) => ({ ...e, retornoZero: 20 })))
    expect(sem.uTempo).toBe(0)
    expect(com.uTempo).toBeGreaterThan(0)
    expect(com.U).toBeGreaterThan(sem.U)
  })
})

describe('etapa "Erro de indicação": retorno ao zero nas duas abas', () => {
  /** Desenha a aba (sem DOM): o campo do retorno ao zero mostra o valor do ensaio dela. */
  function desenhar(k: CalibracaoInput, aba: AbaIndicacao, d: ReturnType<typeof exemploRodoviaria>): string {
    const { balanca, padroes, cliente } = d.emissao
    const ctx: ContextoEtapa = {
      f: k,
      alterar: () => {},
      balanca,
      cliente,
      padroes,
      selecionados: padroes,
      calc: calcularCalibracao(k, balanca, padroes),
      config: CONFIG_PADRAO,
      equipe: [],
      status: 'RASCUNHO',
      editarBalanca: () => {},
      folhaCampo: null,
      vincularFolha: async () => false,
      novaFolha: () => {},
    }
    return renderToStaticMarkup(createElement(PainelDaAba, { ctx, aba }))
  }
  /** O <input> do retorno ao zero (pelo rótulo acessível) e o valor nele. */
  const campo = (html: string, rotulo: string) => {
    const tag = [...html.matchAll(/<input[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`aria-label="${rotulo}"`))
    return tag ? (/value="([^"]*)"/.exec(tag)?.[1] ?? '') : null
  }

  it('cada aba tem o campo, com o valor do ensaio dela ("como encontrado" e depois do ajuste)', () => {
    const { k, d } = comAjuste()
    k.indicacao.retornoZero = -20
    k.comoEncontrado!.retornoZero = 40
    const antes = desenhar(k, 'antes', d)
    expect(antes).toContain('Retorno ao zero antes do ajuste')
    expect(campo(antes, 'Indicação no retorno ao zero antes do ajuste')).toBe('40')
    expect(campo(antes, 'Indicação no retorno ao zero')).toBeNull()
    const depois = desenhar(k, 'depois', d)
    expect(campo(depois, 'Indicação no retorno ao zero')).toBe('-20')
    expect(campo(depois, 'Indicação no retorno ao zero antes do ajuste')).toBeNull()
    // Sem o "como encontrado", a aba mostra o ensaio final
    expect(campo(desenhar({ ...k, comoEncontrado: null }, 'antes', d), 'Indicação no retorno ao zero')).toBe('-20')
  })
})

// ---- "Refazer pontos" e a ordem dos pontos ---------------------------------------------------------------------

/** O ensaio do Prix (0/10/20/30 kg) com as leituras digitadas e o ponto de 5 kg acrescentado no fim. */
function ensaioDigitado(metodo: EnsaioIndicacao['metodo'] = 'CRESCENTE_DECRESCENTE'): EnsaioIndicacao {
  const ponto = (id: string, carga: number, crescente: number | null, decrescente: number | null = null): PontoIndicacao => ({
    id,
    carga,
    pecas: [],
    pecasManuais: false,
    crescente,
    decrescente,
    nivelSubstituicao: 0,
  })
  return {
    metodo,
    retornoZero: 0,
    substituicao: { ativa: false, pecas: [], etapas: [] },
    pontos: [
      ponto('z', 0, 0, 0),
      ponto('a', 10, 9.995, 9.995),
      ponto('b', 20, 19.99),
      ponto('c', 30, 29.99, 29.99),
      ponto('d', 5, 4.998),
    ],
  }
}

describe('"Refazer pontos" com leituras digitadas', () => {
  it('conta as leituras dos pontos com carga, nas colunas do método (o zero não conta)', () => {
    expect(leiturasDigitadas(ensaioDigitado())).toBe(6)
    // Crescente contínuo: a coluna ↓ escondida não conta (nem sai no certificado)
    expect(leiturasDigitadas(ensaioDigitado('CONTINUO'))).toBe(4)
    const sugeridos = {
      ...ensaioDigitado(),
      pontos: ensaioDigitado().pontos.map((p) => ({ ...p, crescente: p.carga ? null : 0 })),
    }
    expect(
      leiturasDigitadas({ ...sugeridos, pontos: sugeridos.pontos.map((p) => ({ ...p, decrescente: p.carga ? null : 0 })) }),
    ).toBe(0)
  })

  it('com leituras, só refaz depois da confirmação; sem leituras, direto (sem perguntar)', async () => {
    const pergunta = vi.fn(async () => false)
    expect(await podeRefazerPontos(ensaioDigitado(), pergunta)).toBe(false)
    expect(pergunta).toHaveBeenCalledWith(6)
    expect(await podeRefazerPontos(ensaioDigitado(), async () => true)).toBe(true)
    const semLeituras = {
      ...ensaioDigitado(),
      pontos: ensaioDigitado().pontos.map((p) => ({ ...p, crescente: null, decrescente: null })),
    }
    const nunca = vi.fn(async () => false)
    expect(await podeRefazerPontos(semLeituras, nunca)).toBe(true)
    expect(nunca).not.toHaveBeenCalled()
  })

  it('o texto da confirmação diz quantas leituras se perdem', () => {
    expect(textoRefazerPontos(7)).toBe('Refazer os pontos apaga as 7 leituras já digitadas. Continuar?')
    expect(textoRefazerPontos(1)).toBe('Refazer os pontos apaga a leitura já digitada. Continuar?')
  })
})

describe('ponto acrescentado no fim com carga menor', () => {
  it('ao sair do campo da carga, os pontos vão para a ordem crescente, com os mesmos ids e leituras', () => {
    const e = ensaioDigitado('CONTINUO')
    const ordenado = ensaioEmOrdemDeCarga(e)
    expect(ordenado.pontos.map((p) => p.id)).toEqual(['z', 'd', 'a', 'b', 'c'])
    expect(ordenado.pontos[1]).toEqual(e.pontos[4])
    // Já em ordem: o mesmo ensaio (nada a gravar)
    expect(ensaioEmOrdemDeCarga(ordenado)).toBe(ordenado)
    // O "Decrescente" (só num registro de antes) fica como está
    const decrescente = ensaioDigitado('DECRESCENTE')
    expect(ensaioEmOrdemDeCarga(decrescente)).toBe(decrescente)
  })
})

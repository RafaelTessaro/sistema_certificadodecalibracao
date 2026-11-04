// Etapa "Padrões e ambiente", classe I: o ΔT pesos − ar "Pela aclimatação" (termômetro de duas entradas em falha).
// A folha não tem a hora do 1º ensaio: os minutos vão da chegada (passo 2) ao Início do ambiente (passo 4), medido
// logo antes dos ensaios (POP 7.4, item 6); a dica embaixo do campo diz isso, sem pedir a hora de início do ensaio.
// Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO } from '#shared/dominio.ts'
import type { Balanca, CalibracaoInput, Cliente } from '#shared/tipos.ts'
import type { ContextoEtapa } from './contexto'
import { EtapaPadroes } from './EtapaPadroes'

const balancaI = {
  ...BALANCA_VAZIA,
  id: 'b1',
  tipo: 'ANALITICA',
  classe: 'I',
  faixas: [{ max: 0.22, e: 0.000001, d: 0.0000001 }],
} as Balanca

function html(f: CalibracaoInput): string {
  const ctx: ContextoEtapa = {
    f,
    alterar: () => {},
    balanca: balancaI,
    cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
    padroes: [],
    selecionados: [],
    calc: null,
    config: CONFIG_PADRAO,
    equipe: [],
    status: 'RASCUNHO',
    editarBalanca: () => {},
    folhaCampo: null,
    vincularFolha: async () => true,
    novaFolha: () => {},
  }
  const t = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EtapaPadroes, ctx)))
  return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

const DICA = 'Da hora de chegada (passo 2) até o Início do ambiente (passo 4) da folha.'

describe('Padrões e ambiente, classe I: ΔT pesos − ar pela aclimatação (POP 7.4, item 6)', () => {
  const k = calibracaoVazia(undefined, 'I')

  it('os minutos no local têm a dica: da chegada (passo 2) ao Início do ambiente (passo 4), sem hora do ensaio', () => {
    const t = html({ ...k, ambiente: { ...k.ambiente, aclimatacao: { deltaT0: 5, minutos: 120 } } })
    expect(t).toContain(`Pesos no local até o 1º ensaio min ${DICA}`)
    expect(t).not.toMatch(/hora d[eo] (início d[oe] )?(1º|primeiro) ensaio|início do ensaio/i)
  })

  it('com o ΔT medido (termômetro de duas entradas), o campo e a dica não aparecem', () => {
    const t = html({ ...k, ambiente: { ...k.ambiente, deltaTPesos: 0.4 } })
    expect(t).toContain('ΔT pesos − ar (antes do 1º ensaio)')
    expect(t).not.toContain(DICA)
  })
})

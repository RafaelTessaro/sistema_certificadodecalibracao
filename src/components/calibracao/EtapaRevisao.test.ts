// Etapa "Revisão e emissão" com a revisão por outra pessoa ligada: o signatário que executou, ou que indicou o técnico
// (também a troca ainda não gravada), vê "Enviar para revisão" no lugar de "Emitir", como o servidor decide.
// Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { calibracaoVazia, CONFIG_PADRAO } from '#shared/dominio.ts'
import type { Balanca, CalibracaoInput } from '#shared/tipos.ts'
import type { ContextoEtapa } from './contexto'

// Quem está usando: a signatária Ana
vi.mock('../../store/sessao', () => {
  const estado = { usuario: { id: 'ana', nome: 'Ana Signatária', signatario: true } }
  return { useSessao: (seletor: (s: typeof estado) => unknown) => seletor(estado) }
})

const { EtapaRevisao } = await import('./EtapaRevisao')

const equipe = [
  { id: 'ana', nome: 'Ana Signatária', cargo: '', signatario: true },
  { id: 'bia', nome: 'Bia Técnica', cargo: '', signatario: false },
]

function etapa(tecnicoId: string, tecnicoGravado: { tecnicoId: string; tecnicoDefinidoPorId?: string }, exigirRevisor = true) {
  const f: CalibracaoInput = { ...calibracaoVazia(), tecnicoId }
  const ctx = {
    f,
    calc: null,
    config: { ...CONFIG_PADRAO, exigirRevisor },
    equipe,
    status: 'RASCUNHO',
    balanca: { unidade: 'kg' } as Balanca,
  } as unknown as ContextoEtapa
  const t = renderToStaticMarkup(
    createElement(EtapaRevisao, {
      ctx,
      tecnicoGravado,
      pendencias: [],
      salvando: false,
      aoVisualizar: () => {},
      aoEnviarRevisao: () => {},
      aoVoltarRascunho: () => {},
      aoEmitir: () => {},
    }),
  )
  return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('emitir com a revisão por outra pessoa ligada', () => {
  it('quem indicou outra pessoa como técnico envia para revisão, não emite', () => {
    const t = etapa('bia', { tecnicoId: 'bia', tecnicoDefinidoPorId: 'ana' })
    expect(t).toContain('Enviar para revisão')
    expect(t).not.toContain('Emitir certificado')
    expect(t).toContain('Você indicou o técnico desta calibração')
  })

  it('a troca do técnico ainda não gravada já conta como indicada por quem está usando', () => {
    const t = etapa('bia', { tecnicoId: 'ana', tecnicoDefinidoPorId: 'ana' })
    expect(t).toContain('Enviar para revisão')
    expect(t).not.toContain('Emitir certificado')
  })

  it('o técnico que executou continua sem emitir', () => {
    const t = etapa('ana', { tecnicoId: 'ana', tecnicoDefinidoPorId: 'ana' })
    expect(t).toContain('Enviar para revisão')
    expect(t).toContain('envie para revisão para outro signatário emitir')
  })

  it('o técnico indicado por outra pessoa: o signatário revisor emite', () => {
    const t = etapa('bia', { tecnicoId: 'bia', tecnicoDefinidoPorId: 'bia' })
    expect(t).toContain('Emitir certificado')
    expect(t).not.toContain('Enviar para revisão')
    // Calibração de antes (sem quem indicou)
    expect(etapa('bia', { tecnicoId: 'bia' })).toContain('Emitir certificado')
  })

  it('desligada, quem indicou o técnico emite', () => {
    expect(etapa('bia', { tecnicoId: 'bia', tecnicoDefinidoPorId: 'ana' }, false)).toContain('Emitir certificado')
  })
})

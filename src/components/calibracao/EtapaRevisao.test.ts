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

function etapa(
  tecnicoId: string,
  tecnicoGravado: { tecnicoId: string; tecnicoDefinidoPorId?: string },
  exigirRevisor = true,
  correcao: { substituiId: string; numeroRevisao: string | null } | null = null,
) {
  const f: CalibracaoInput = { ...calibracaoVazia(), tecnicoId, substituiId: correcao?.substituiId ?? '' }
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
      numeroRevisao: correcao?.numeroRevisao ?? null,
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

describe('quem assina, na prévia da emissão', () => {
  it('desligada: só quem executou assina; quem emite aparece como "Emitido por"', () => {
    const t = etapa('bia', { tecnicoId: 'bia', tecnicoDefinidoPorId: 'bia' }, false)
    expect(t).toContain('Executado por Bia Técnica')
    expect(t).toContain('Emitido por Ana Signatária')
    expect(t).not.toContain('Autorizado por')
    expect(t).toContain('O certificado sai só com a assinatura de quem executou.')
  })

  it('ligada: as duas assinaturas, de quem executou e de quem autorizou', () => {
    const t = etapa('bia', { tecnicoId: 'bia', tecnicoDefinidoPorId: 'bia' }, true)
    expect(t).toContain('Executado por Bia Técnica')
    expect(t).toContain('Autorizado por Ana Signatária')
    expect(t).toContain('O certificado sai com duas assinaturas: a de quem executou e a de quem autorizou.')
  })

  it('correção: o mesmo nº do certificado corrigido, sem "-R"', () => {
    const t = etapa('bia', { tecnicoId: 'bia', tecnicoDefinidoPorId: 'bia' }, false, {
      substituiId: 'k1',
      numeroRevisao: 'CC-2026-00002',
    })
    expect(t).toContain('CC-2026-00002 (o mesmo do certificado corrigido)')
    expect(t).not.toMatch(/-R\d/)
    expect(t).toContain(
      'A correção sai com o mesmo número e a data de emissão nova; a versão anterior e o motivo ficam só no sistema.',
    )
    // Sem correção: o exemplo do nº que a emissão dá, sem sufixo
    expect(etapa('bia', { tecnicoId: 'bia' }, false)).toMatch(/Gerado na emissão \(ex\.: CC-\d{4}-00001\)/)
  })
})

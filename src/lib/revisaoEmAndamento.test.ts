// A página do certificado com uma revisão em andamento: "Continuar a revisão" só no emitido; o cancelamento espera a
// revisão sair ou ser excluída; no cancelado de antes dessa trava, a faixa leva à revisão para excluí-la.

import { describe, expect, it } from 'vitest'
import { revisaoEmAndamento } from './revisaoEmAndamento'

const aberta = { id: 'r1', numero: '', status: 'RASCUNHO' as const }
const emitida = { id: 'r0', numero: 'CC-2026-00003-R1', status: 'EMITIDO' as const }

describe('revisão em andamento na página do certificado', () => {
  it('emitido sem revisão: corrige e cancela', () => {
    expect(revisaoEmAndamento('EMITIDO', [])).toEqual({
      aberta: null,
      faixa: null,
      podeCorrigir: true,
      cancelamentoBloqueado: false,
    })
  })

  it('emitido com a revisão aberta: continuar; não corrige de novo; o cancelamento espera a revisão', () => {
    for (const r of [aberta, { ...aberta, status: 'REVISAO' as const }])
      expect(revisaoEmAndamento('EMITIDO', [r])).toEqual({
        aberta: r,
        faixa: 'continuar',
        podeCorrigir: false,
        cancelamentoBloqueado: true,
      })
  })

  it('cancelado com a revisão ainda aberta (dado antigo): nada de "Continuar a revisão", só excluí-la', () => {
    expect(revisaoEmAndamento('CANCELADO', [aberta])).toEqual({
      aberta,
      faixa: 'excluir',
      podeCorrigir: false,
      cancelamentoBloqueado: false,
    })
  })

  it('substituído (a revisão já saiu): nenhuma faixa', () => {
    expect(revisaoEmAndamento('SUBSTITUIDO', [emitida])).toMatchObject({ aberta: null, faixa: null, podeCorrigir: false })
  })
})

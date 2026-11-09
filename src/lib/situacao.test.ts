import { describe, expect, it } from 'vitest'
import { rotuloDaSituacao } from '#shared/dominio.ts'
import { detalheDaSituacao } from './situacao'

describe('a situação nas listas de calibrações', () => {
  const aguardando = { status: 'REVISAO' as const, aguardando: { id: 'fabio', nome: 'Fábio' } }

  it('enviada para autorização: "Aguarda você" em destaque para o escolhido; para os outros, de quem', () => {
    expect(detalheDaSituacao(aguardando, 'fabio')).toEqual({ texto: 'Aguarda você', destaque: true })
    expect(detalheDaSituacao(aguardando, 'lizi')).toEqual({ texto: 'de Fábio', destaque: false })
  })

  it('devolvida: por quem; nos outros casos, nada', () => {
    expect(detalheDaSituacao({ status: 'RASCUNHO', devolvidaPor: 'Rafael' }, 'lizi')).toEqual({
      texto: 'por Rafael',
      destaque: false,
    })
    expect(detalheDaSituacao({ status: 'RASCUNHO' }, 'lizi')).toBeNull()
    // A enviada para revisão antes da 1.0.5 (sem signatário escolhido) e a emitida não têm a linha
    expect(detalheDaSituacao({ status: 'REVISAO' }, 'lizi')).toBeNull()
    expect(detalheDaSituacao({ status: 'EMITIDO', devolvidaPor: 'Rafael' }, 'lizi')).toBeNull()
  })

  it('o nome da situação: com a revisão por outra pessoa desligada, a enviada é "Enviada para revisão"', () => {
    expect(rotuloDaSituacao('REVISAO')).toBe('Aguardando autorização')
    expect(rotuloDaSituacao('REVISAO', true)).toBe('Enviada para revisão')
    expect(rotuloDaSituacao('RASCUNHO', true)).toBe('Rascunho')
    expect(rotuloDaSituacao('EMITIDO', true)).toBe('Emitido')
  })
})

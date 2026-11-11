import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { duracaoDoToast, useToasts } from './ui'

describe('quanto tempo o toast fica na tela', () => {
  it('o curto some como antes; o longo fica o tempo de ler (cerca de 4 palavras por segundo), até 15 s', () => {
    expect(duracaoDoToast({ titulo: 'Rascunho excluído', tipo: 'sucesso' })).toBe(3500)
    expect(duracaoDoToast({ titulo: 'Não foi possível gravar', descricao: 'Sem conexão.', tipo: 'erro' })).toBe(6000)
    // Um toast de 46 palavras (o da folha ligada com a data trocada, na 1.0.5) não some em 3,5 s
    const longo = Array.from({ length: 46 }, (_, i) => `palavra${i}`).join(' ')
    expect(
      duracaoDoToast({ titulo: 'Folha de campo FC-2026-00010 ligada', descricao: longo, tipo: 'sucesso' }),
    ).toBeGreaterThanOrEqual(12_000)
    expect(duracaoDoToast({ titulo: 'x', descricao: `${longo} ${longo} ${longo}`, tipo: 'aviso' })).toBe(15_000)
  })
})

describe('o toast não some com o mouse em cima', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToasts.setState({ toasts: [] })
  })
  afterEach(() => vi.useRealTimers())

  it('pausa enquanto o mouse está em cima e, ao sair, ainda fica um pouco', () => {
    useToasts.getState().mostrar({ titulo: 'Folha ligada', tipo: 'sucesso' })
    const id = useToasts.getState().toasts[0].id
    vi.advanceTimersByTime(2000)
    useToasts.getState().pausar(id)
    vi.advanceTimersByTime(30_000)
    expect(useToasts.getState().toasts).toHaveLength(1)
    useToasts.getState().retomar(id)
    vi.advanceTimersByTime(1500)
    expect(useToasts.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(2500)
    expect(useToasts.getState().toasts).toHaveLength(0)
  })

  it('leva os nºs que não quebram no meio', () => {
    useToasts
      .getState()
      .mostrar({ titulo: 'Folha ligada', descricao: 'nº CC-2026-00010', tipo: 'sucesso', inteiros: ['CC-2026-00010'] })
    expect(useToasts.getState().toasts[0].inteiros).toEqual(['CC-2026-00010'])
  })
})

describe('o nº da folha (FC-AAAA-NNNNN, formato fixo) não quebra no toast, mesmo sem ser dado', () => {
  it('acha os nºs de folha no texto', async () => {
    const { numerosDeFolhaNoTexto } = await import('../lib/semPartir')
    expect(numerosDeFolhaNoTexto('A folha FC-2026-00006, já impressa, e a FC-2026-00007.')).toEqual([
      'FC-2026-00006',
      'FC-2026-00007',
    ])
    expect(numerosDeFolhaNoTexto('sem folha')).toEqual([])
  })
})

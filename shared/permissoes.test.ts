import { describe, expect, it } from 'vitest'
import {
  LISTA_PERMISSOES,
  NOME_NIVEL,
  PERMISSOES,
  pode,
  podeEmitir,
  RESUMO_NIVEL,
  ROTULO_PERMISSAO,
  SEM_PERMISSAO,
} from './permissoes.ts'

describe('permissões', () => {
  it('o administrador tem todas as permissões; o técnico, nenhuma das restritas', () => {
    expect(LISTA_PERMISSOES.length).toBe(7)
    for (const p of LISTA_PERMISSOES) expect(pode('ADMIN', p), p).toBe(true)
    expect(LISTA_PERMISSOES.filter((p) => pode('COMUM', p))).toEqual([])
  })

  it('mensagem de recusa e rótulo para cada permissão', () => {
    expect(Object.keys(SEM_PERMISSAO).sort()).toEqual([...LISTA_PERMISSOES].sort())
    expect(Object.keys(ROTULO_PERMISSAO).sort()).toEqual([...LISTA_PERMISSOES].sort())
    for (const p of LISTA_PERMISSOES) {
      expect(SEM_PERMISSAO[p]).toMatch(/^Só o administrador /)
      expect(ROTULO_PERMISSAO[p].length).toBeGreaterThan(5)
    }
  })

  it('sem nível ou sem permissão, nada é permitido', () => {
    expect(pode('ADMIN', undefined)).toBe(false)
    expect(pode(null, 'configuracoes')).toBe(false)
    expect(pode('ADMIN', 'toString' as never)).toBe(false)
    expect(pode('OUTRO' as never, 'configuracoes')).toBe(false)
  })

  it('emitir depende de ser signatário, não do nível', () => {
    expect(podeEmitir({ signatario: true })).toBe(true)
    expect(podeEmitir({ signatario: false })).toBe(false)
    expect(podeEmitir(null)).toBe(false)
  })

  it('nome e resumo dos dois níveis', () => {
    expect(NOME_NIVEL).toEqual({ ADMIN: 'Administrador', COMUM: 'Técnico' })
    expect(Object.keys(RESUMO_NIVEL).sort()).toEqual(['ADMIN', 'COMUM'])
    expect(Object.values(PERMISSOES).every((niveis) => niveis.includes('ADMIN'))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  impedimentoDoSignatario,
  impedimentoDoTecnico,
  impedimentoParaEmitir,
  LISTA_PERMISSOES,
  NOME_NIVEL,
  PERMISSOES,
  pode,
  podeAutorizar,
  podeDevolver,
  RESUMO_NIVEL,
  ROTULO_PERMISSAO,
  SEM_PERMISSAO,
  SEM_PERMISSAO_EMITIR,
  signatariosParaAutorizar,
  TECNICO_NAO_AUTORIZA,
  tecnicosParaEscolher,
} from './permissoes.ts'
import type { PedidoAutorizacao } from './tipos.ts'

describe('permissões', () => {
  it('o administrador tem todas as permissões; o operador, nenhuma das restritas', () => {
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

  it('autorizar depende de ser signatário, não do nível', () => {
    expect(podeAutorizar({ signatario: true })).toBe(true)
    expect(podeAutorizar({ signatario: false })).toBe(false)
    expect(podeAutorizar(null)).toBe(false)
  })

  it('nome e resumo dos dois níveis: Operador (nunca "comum") e Administrador', () => {
    expect(NOME_NIVEL).toEqual({ ADMIN: 'Administrador', COMUM: 'Operador' })
    expect(Object.keys(RESUMO_NIVEL).sort()).toEqual(['ADMIN', 'COMUM'])
    expect(RESUMO_NIVEL.COMUM).toMatch(/emissão, a impressão e o envio dos certificados/)
    for (const texto of [...Object.values(NOME_NIVEL), ...Object.values(RESUMO_NIVEL)]) expect(texto).not.toMatch(/comum/i)
    expect(Object.values(PERMISSOES).every((niveis) => niveis.includes('ADMIN'))).toBe(true)
  })
})

describe('emitir e autorizar (Configurações → "Exigir revisão por outra pessoa")', () => {
  const ana = { id: 'ana', signatario: true }
  const bia = { id: 'bia', signatario: false }
  const caio = { id: 'caio', signatario: true }
  const pedido = (signatarioId: string): PedidoAutorizacao => ({
    signatarioId,
    signatarioNome: signatarioId === 'ana' ? 'Ana' : 'Caio',
    porId: 'bia',
    por: 'Bia',
    em: '2026-11-09T12:00:00.000Z',
  })
  const k = (tecnicoId: string, status: 'RASCUNHO' | 'REVISAO' = 'RASCUNHO', autorizacao: PedidoAutorizacao | null = null) => ({
    tecnicoId,
    status,
    autorizacao,
  })

  it('desligada: qualquer pessoa que entrou emite, também o técnico e quem não é signatário', () => {
    for (const u of [ana, bia, caio]) {
      expect(impedimentoParaEmitir(false, k('bia'), u)).toBeNull()
      expect(impedimentoParaEmitir(false, k('ana', 'REVISAO', pedido('caio')), u)).toBeNull()
    }
  })

  it('ligada: quem não é signatário não autoriza (envia para um signatário)', () => {
    expect(impedimentoParaEmitir(true, k('caio'), bia)).toBe(SEM_PERMISSAO_EMITIR)
    expect(impedimentoParaEmitir(true, k('caio'), null)).toBe(SEM_PERMISSAO_EMITIR)
  })

  it('ligada: o técnico que executou não autoriza o próprio certificado, nem com o pedido para ele', () => {
    expect(impedimentoParaEmitir(true, k('ana'), ana)).toBe(TECNICO_NAO_AUTORIZA)
    expect(impedimentoParaEmitir(true, k('ana', 'REVISAO', pedido('ana')), ana)).toBe(TECNICO_NAO_AUTORIZA)
  })

  it('ligada: o signatário que não é o técnico faz tudo sozinho (escolhe a si mesmo e autoriza direto)', () => {
    expect(impedimentoParaEmitir(true, k('bia'), ana)).toBeNull()
    expect(impedimentoParaEmitir(true, k(''), ana)).toBeNull()
  })

  it('ligada, com o pedido: só o signatário escolhido autoriza; ninguém assina por outra pessoa', () => {
    const enviada = k('bia', 'REVISAO', pedido('ana'))
    expect(impedimentoParaEmitir(true, enviada, ana)).toBeNull()
    expect(impedimentoParaEmitir(true, enviada, caio)).toBe(
      'Esta calibração foi enviada para a autorização de Ana: só essa pessoa pode autorizar.',
    )
    expect(podeDevolver(enviada, ana)).toBe(true)
    expect(podeDevolver(enviada, caio)).toBe(false)
    expect(podeDevolver(enviada, bia)).toBe(false)
  })

  it('a enviada para revisão antes da 1.0.5 (sem o pedido): qualquer signatário que não seja o técnico', () => {
    const antiga = k('bia', 'REVISAO')
    expect(impedimentoParaEmitir(true, antiga, ana)).toBeNull()
    expect(impedimentoParaEmitir(true, antiga, caio)).toBeNull()
    expect(impedimentoParaEmitir(true, k('caio', 'REVISAO'), caio)).toBe(TECNICO_NAO_AUTORIZA)
    expect(podeDevolver(antiga, caio)).toBe(true)
    expect(podeDevolver(k('caio', 'REVISAO'), caio)).toBe(false)
    // Rascunho não se devolve
    expect(podeDevolver(k('bia'), ana)).toBe(false)
  })
})

describe('as listas de técnicos e signatários', () => {
  const equipe = [
    { id: 'fabio', nome: 'Fábio', tecnico: true, signatario: true },
    { id: 'lizi', nome: 'Lizi', tecnico: false, signatario: true },
    { id: 'mauricio', nome: 'Maurício', tecnico: true, signatario: false },
  ]

  it('"Técnico que executou": só quem tem a marca; o de uma calibração continua, mesmo sem a marca', () => {
    expect(tecnicosParaEscolher(equipe, '').map((u) => u.id)).toEqual(['fabio', 'mauricio'])
    expect(tecnicosParaEscolher(equipe, 'lizi').map((u) => u.id)).toEqual(['fabio', 'lizi', 'mauricio'])
  })

  it('quem autoriza: os signatários, nunca o técnico da calibração', () => {
    expect(signatariosParaAutorizar(equipe, 'mauricio').map((u) => u.id)).toEqual(['fabio', 'lizi'])
    expect(signatariosParaAutorizar(equipe, 'fabio').map((u) => u.id)).toEqual(['lizi'])
    expect(signatariosParaAutorizar([{ ...equipe[0], ativo: false }], '')).toEqual([])
  })

  it('o servidor confere o técnico indicado e o signatário escolhido', () => {
    expect(impedimentoDoTecnico({ nome: 'Maurício', ativo: true, tecnico: true })).toBeNull()
    expect(impedimentoDoTecnico({ nome: 'Lizi', ativo: true, tecnico: false })).toBe(
      'Lizi não tem a marca de técnico (em Usuários). Escolha outro técnico.',
    )
    expect(impedimentoDoTecnico({ nome: 'Lizi', ativo: false, tecnico: true })).toMatch(/desativado/)
    expect(impedimentoDoTecnico(undefined)).toMatch(/não foi encontrado/)
    const fabio = { id: 'fabio', nome: 'Fábio', ativo: true, signatario: true }
    expect(impedimentoDoSignatario(fabio, 'mauricio')).toBeNull()
    expect(impedimentoDoSignatario(fabio, 'fabio')).toMatch(/executou esta calibração/)
    expect(impedimentoDoSignatario({ ...fabio, signatario: false }, 'mauricio')).toMatch(/não tem a marca de signatário/)
    expect(impedimentoDoSignatario({ ...fabio, ativo: false }, 'mauricio')).toMatch(/desativado/)
    expect(impedimentoDoSignatario(undefined, 'mauricio')).toMatch(/não foi encontrado/)
  })
})

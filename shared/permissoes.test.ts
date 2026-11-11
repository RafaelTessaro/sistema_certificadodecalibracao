import { describe, expect, it } from 'vitest'
import {
  impedimentoDaTrocaDoTecnico,
  impedimentoDoSignatario,
  impedimentoDoTecnico,
  impedimentoParaEmitir,
  LISTA_PERMISSOES,
  NOME_NIVEL,
  PERMISSOES,
  pode,
  podeAutorizar,
  podeDevolver,
  QUEM_ESCOLHEU_NAO_AUTORIZA,
  quemDefineOTecnico,
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

  it('o nº de folha que não vai ser usada (Números não utilizados) também é do administrador, e as listas dizem isso', () => {
    // A rota "Não vai ser usada" pede a mesma permissão de cancelar (server/acesso.ts)
    expect(ROTULO_PERMISSAO.cancelarCertificado).toMatch(/Cancelar certificados emitidos/)
    expect(ROTULO_PERMISSAO.cancelarCertificado).toMatch(/não vai ser usad/i)
    expect(RESUMO_NIVEL.ADMIN).toMatch(/não vai ser usad/i)
    expect(SEM_PERMISSAO.cancelarCertificado).toMatch(/não vai ser usad/i)
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

  it('ligada: o signatário que não executou nem escolheu o técnico faz tudo sozinho (escolhe a si mesmo e autoriza)', () => {
    expect(impedimentoParaEmitir(true, k('bia'), ana)).toBeNull()
    expect(impedimentoParaEmitir(true, { ...k('bia'), tecnicoDefinidoPorId: 'bia' }, ana)).toBeNull()
    expect(impedimentoParaEmitir(true, k(''), ana)).toBeNull()
  })

  it('ligada: quem escolheu ou trocou o técnico não autoriza (ninguém assina por outra pessoa)', () => {
    // Ana digitou a folha de Bia e escolheu Bia como técnica: envia para Caio
    const escolhidaPorAna = { ...k('bia'), tecnicoDefinidoPorId: 'ana' }
    expect(impedimentoParaEmitir(true, escolhidaPorAna, ana)).toBe(QUEM_ESCOLHEU_NAO_AUTORIZA)
    expect(impedimentoParaEmitir(true, escolhidaPorAna, caio)).toBeNull()
    // Com o pedido para ela (enviado antes da troca, ou de antes da 1.0.6), também não
    const comPedido = { ...k('bia', 'REVISAO', pedido('ana')), tecnicoDefinidoPorId: 'ana' }
    expect(impedimentoParaEmitir(true, comPedido, ana)).toBe(QUEM_ESCOLHEU_NAO_AUTORIZA)
    expect(podeDevolver(comPedido, ana)).toBe(false)
    // A enviada para revisão antes da 1.0.5 (sem o pedido): qualquer outro signatário
    const antiga = { ...k('bia', 'REVISAO'), tecnicoDefinidoPorId: 'ana' }
    expect(impedimentoParaEmitir(true, antiga, ana)).toBe(QUEM_ESCOLHEU_NAO_AUTORIZA)
    expect(impedimentoParaEmitir(true, antiga, caio)).toBeNull()
    // Sem técnico escolhido ainda (quem criou fica registrado), não conta; desligada, ninguém é impedido
    expect(impedimentoParaEmitir(true, { ...k(''), tecnicoDefinidoPorId: 'ana' }, ana)).toBeNull()
    expect(impedimentoParaEmitir(false, escolhidaPorAna, ana)).toBeNull()
    expect(QUEM_ESCOLHEU_NAO_AUTORIZA).toMatch(/escolheu o técnico/)
    expect(QUEM_ESCOLHEU_NAO_AUTORIZA).toMatch(/outro signatário/)
  })

  it('quem passa a ter escolhido o técnico: quem o troca, ou o próprio técnico que grava; senão, quem já tinha escolhido', () => {
    const gravada = { tecnicoId: 'bia', tecnicoDefinidoPorId: 'ana' }
    // Caio só corrige a digitação: continua de Ana
    expect(quemDefineOTecnico(gravada, 'bia', 'caio')).toBe('ana')
    // Caio troca o técnico: passa a ser dele
    expect(quemDefineOTecnico(gravada, 'dani', 'caio')).toBe('caio')
    // A própria técnica grava: confere que foi ela
    expect(quemDefineOTecnico(gravada, 'bia', 'bia')).toBe('bia')
    // De antes do registro (sem quem escolheu)
    expect(quemDefineOTecnico({ tecnicoId: 'bia' }, 'bia', 'caio')).toBeUndefined()
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

  it('aguardando a autorização: quem recebeu o pedido não passa a ser o técnico (nem aparece na lista)', () => {
    const pedido: PedidoAutorizacao = {
      signatarioId: 'fabio',
      signatarioNome: 'Fábio',
      porId: 'lizi',
      por: 'Lizi',
      em: '2026-11-09T12:00:00.000Z',
    }
    const aguardando = { status: 'REVISAO' as const, autorizacao: pedido }
    expect(impedimentoDaTrocaDoTecnico(aguardando, 'fabio')).toBe(
      'Fábio recebeu o pedido de autorização e não pode ser o técnico desta calibração. Para trocar, volte para rascunho e escolha outro signatário.',
    )
    expect(impedimentoDaTrocaDoTecnico(aguardando, 'mauricio')).toBeNull()
    expect(impedimentoDaTrocaDoTecnico(aguardando, '')).toBeNull()
    // Sem pedido (rascunho, ou a enviada para revisão antes da 1.0.5), a troca é livre
    expect(impedimentoDaTrocaDoTecnico({ status: 'RASCUNHO', autorizacao: null }, 'fabio')).toBeNull()
    expect(impedimentoDaTrocaDoTecnico({ status: 'REVISAO', autorizacao: null }, 'fabio')).toBeNull()
    expect(tecnicosParaEscolher(equipe, 'mauricio', aguardando).map((u) => u.id)).toEqual(['mauricio'])
    expect(tecnicosParaEscolher(equipe, 'mauricio', { status: 'RASCUNHO', autorizacao: pedido }).map((u) => u.id)).toEqual([
      'fabio',
      'mauricio',
    ])
  })

  it('quem autoriza: os signatários, nunca o técnico da calibração nem quem o escolheu', () => {
    expect(signatariosParaAutorizar(equipe, 'mauricio').map((u) => u.id)).toEqual(['fabio', 'lizi'])
    expect(signatariosParaAutorizar(equipe, 'fabio').map((u) => u.id)).toEqual(['lizi'])
    expect(signatariosParaAutorizar([{ ...equipe[0], ativo: false }], '')).toEqual([])
    // Lizi escolheu Maurício: Fábio autoriza; Fábio digitou e escolheu Maurício: Lizi autoriza
    expect(signatariosParaAutorizar(equipe, 'mauricio', 'lizi').map((u) => u.id)).toEqual(['fabio'])
    expect(signatariosParaAutorizar(equipe, 'mauricio', 'fabio').map((u) => u.id)).toEqual(['lizi'])
    // O próprio técnico escolheu, ou ninguém ainda (sem técnico): ninguém mais sai da lista
    expect(signatariosParaAutorizar(equipe, 'mauricio', 'mauricio').map((u) => u.id)).toEqual(['fabio', 'lizi'])
    expect(signatariosParaAutorizar(equipe, '', 'fabio').map((u) => u.id)).toEqual(['fabio', 'lizi'])
  })

  it('aguardando a autorização: quem recebeu o pedido não troca o técnico (passaria a não poder autorizar)', () => {
    const pedido: PedidoAutorizacao = {
      signatarioId: 'fabio',
      signatarioNome: 'Fábio',
      porId: 'lizi',
      por: 'Lizi',
      em: '2026-11-09T12:00:00.000Z',
    }
    const aguardando = { status: 'REVISAO' as const, autorizacao: pedido }
    expect(impedimentoDaTrocaDoTecnico(aguardando, 'mauricio', 'fabio')).toBe(
      'Você recebeu o pedido de autorização: quem troca o técnico não autoriza. Para trocar, volte para rascunho e envie para outro signatário.',
    )
    // Qualquer troca, mesmo sem dizer para quem (a tela trava a lista)
    expect(impedimentoDaTrocaDoTecnico(aguardando, '', 'fabio')).not.toBeNull()
    // Os outros trocam (menos para quem recebeu o pedido)
    expect(impedimentoDaTrocaDoTecnico(aguardando, 'mauricio', 'lizi')).toBeNull()
    expect(impedimentoDaTrocaDoTecnico({ status: 'RASCUNHO', autorizacao: pedido }, 'mauricio', 'fabio')).toBeNull()
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
    // Quem escolheu o técnico não recebe o pedido
    expect(impedimentoDoSignatario(fabio, 'mauricio', 'fabio')).toBe(
      'Fábio escolheu o técnico desta calibração e não pode autorizá-la. Escolha outro signatário.',
    )
    expect(impedimentoDoSignatario(fabio, 'mauricio', 'lizi')).toBeNull()
    expect(impedimentoDoSignatario(fabio, 'mauricio', 'mauricio')).toBeNull()
  })
})

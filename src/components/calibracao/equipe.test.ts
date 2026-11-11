import { describe, expect, it } from 'vitest'
import { QUEM_ESCOLHEU_NAO_AUTORIZA } from '#shared/permissoes.ts'
import type { MembroEquipe } from '../../lib/api'
import { cabecalhoDaRevisao, dicaDoTecnico, estadoDaEmissao, motivoDoEnvioDesativado } from './equipe'

const membro = (id: string, tecnico: boolean, signatario: boolean, cargo = ''): MembroEquipe => ({
  id,
  nome: id,
  cargo,
  tecnico,
  signatario,
  temAssinatura: false,
})
// Como na empresa: Fábio e Rafael (administradores, signatários), Lizi (digita e emite; signatária, não técnica) e
// Maurício (técnico de calibração)
const FABIO = membro('fabio', true, true, 'Responsável técnico')
const RAFAEL = membro('rafael', true, true)
const LIZI = membro('lizi', false, true)
const MAURICIO = membro('mauricio', true, false, 'Técnico de calibração')
const EQUIPE = [FABIO, RAFAEL, LIZI, MAURICIO]

describe('a dica de "Técnico que executou"', () => {
  it('o cargo do técnico escolhido', () => {
    expect(dicaDoTecnico(EQUIPE, 'mauricio')).toBe('Técnico de calibração')
    expect(dicaDoTecnico(EQUIPE, 'rafael')).toBeUndefined()
  })

  it('o escolhido sem a marca de técnico continua valendo (calibração de antes)', () => {
    expect(dicaDoTecnico(EQUIPE, 'lizi')).toBe('Sem a marca de técnico em Usuários: continua valendo nesta calibração.')
  })

  it('quem escolheu o técnico (signatário, com a revisão ligada) fica sabendo que outro signatário autoriza', () => {
    expect(dicaDoTecnico(EQUIPE, 'mauricio', { escolhidoPorVoce: true })).toBe(
      'Escolhido por você: outro signatário autoriza esta calibração (quem escolhe o técnico não autoriza).',
    )
    // O que precisa de atenção no escolhido vem antes
    expect(dicaDoTecnico(EQUIPE, 'lizi', { escolhidoPorVoce: true })).toMatch(/Sem a marca de técnico/)
    // Aguardando a autorização de quem está usando: a lista fica travada, e a dica diz por quê
    expect(dicaDoTecnico(EQUIPE, 'mauricio', { travado: 'Você recebeu o pedido de autorização.' })).toBe(
      'Você recebeu o pedido de autorização.',
    )
  })

  it('quem não está mais na equipe ativa, e ninguém com a marca', () => {
    expect(dicaDoTecnico(EQUIPE, 'excluido')).toMatch(/não está na equipe ativa/)
    expect(dicaDoTecnico([LIZI], '')).toBe('Ninguém tem a marca de técnico. Peça ao administrador para marcar em Usuários.')
    expect(dicaDoTecnico(EQUIPE, '')).toBeUndefined()
  })
})

describe('o que a emissão oferece', () => {
  const rascunho = { tecnicoId: 'mauricio', status: 'RASCUNHO' as const, autorizacao: null }
  const eu = (m: MembroEquipe) => ({ id: m.id, signatario: m.signatario })

  it('desligada: emitir, para qualquer pessoa', () => {
    for (const m of EQUIPE) expect(estadoDaEmissao(false, rascunho, eu(m), EQUIPE).modo).toBe('emitir')
  })

  it('ligada: Lizi (signatária, não técnica) se escolhe e autoriza; Maurício escolhe quem autoriza', () => {
    const lizi = estadoDaEmissao(true, rascunho, eu(LIZI), EQUIPE)
    expect(lizi).toMatchObject({ modo: 'escolher', sugerido: 'lizi', impedimento: null })
    expect(lizi.signatarios.map((u) => u.id)).toEqual(['fabio', 'rafael', 'lizi'])
    const mauricio = estadoDaEmissao(true, rascunho, eu(MAURICIO), EQUIPE)
    expect(mauricio).toMatchObject({ modo: 'escolher', sugerido: '' })
    // Com um signatário só além do técnico, ele já vem escolhido
    expect(estadoDaEmissao(true, { ...rascunho, tecnicoId: 'fabio' }, eu(MAURICIO), [FABIO, RAFAEL, MAURICIO]).sugerido).toBe(
      'rafael',
    )
  })

  it('ligada: quem escolheu o técnico não autoriza nem recebe o pedido (ninguém assina por outra pessoa)', () => {
    // Lizi escolheu Maurício: Fábio ou Rafael autoriza
    const daLizi = { ...rascunho, tecnicoDefinidoPorId: 'lizi' }
    const lizi = estadoDaEmissao(true, daLizi, eu(LIZI), EQUIPE)
    expect(lizi).toMatchObject({ modo: 'escolher', sugerido: '', impedimento: QUEM_ESCOLHEU_NAO_AUTORIZA })
    expect(lizi.signatarios.map((u) => u.id)).toEqual(['fabio', 'rafael'])
    expect(estadoDaEmissao(true, daLizi, eu(FABIO), EQUIPE)).toMatchObject({
      modo: 'escolher',
      sugerido: 'fabio',
      impedimento: null,
    })
    // Fábio digitou a folha de Maurício e escolheu Maurício: envia para outro signatário (o único, já escolhido)
    const doFabio = { ...rascunho, tecnicoDefinidoPorId: 'fabio' }
    expect(estadoDaEmissao(true, doFabio, eu(FABIO), [FABIO, RAFAEL, MAURICIO])).toMatchObject({
      modo: 'escolher',
      sugerido: 'rafael',
      impedimento: QUEM_ESCOLHEU_NAO_AUTORIZA,
    })
    // O próprio técnico escolheu: o signatário que só digita autoriza
    expect(estadoDaEmissao(true, { ...rascunho, tecnicoDefinidoPorId: 'mauricio' }, eu(LIZI), EQUIPE)).toMatchObject({
      sugerido: 'lizi',
      impedimento: null,
    })
  })

  it('ligada, enviada a Fábio: Fábio autoriza ou devolve; os outros aguardam', () => {
    const enviada = {
      tecnicoId: 'mauricio',
      status: 'REVISAO' as const,
      autorizacao: { signatarioId: 'fabio', signatarioNome: 'Fábio', porId: 'lizi', por: 'Lizi', em: '' },
    }
    expect(estadoDaEmissao(true, enviada, eu(FABIO), EQUIPE)).toMatchObject({ modo: 'autorizar', podeDevolver: true })
    for (const m of [RAFAEL, LIZI, MAURICIO])
      expect(estadoDaEmissao(true, enviada, eu(m), EQUIPE)).toMatchObject({ modo: 'aguardando', podeDevolver: false })
  })
})

describe('por que "Enviar para autorização" está desativado', () => {
  const base = { pronto: true, signatarioId: 'fabio', semSignatarios: false, salvando: false }
  it('diz o que falta, ao lado do botão', () => {
    expect(motivoDoEnvioDesativado(base)).toBeNull()
    expect(motivoDoEnvioDesativado({ ...base, signatarioId: '' })).toBe('Escolha quem autoriza para enviar.')
    expect(motivoDoEnvioDesativado({ ...base, pronto: false })).toBe('Resolva os itens de “Falta completar” para enviar.')
    expect(motivoDoEnvioDesativado({ ...base, pronto: false, signatarioId: '' })).toBe(
      'Escolha quem autoriza e resolva os itens de “Falta completar” para enviar.',
    )
    expect(motivoDoEnvioDesativado({ ...base, salvando: true })).toBe('Salvando o rascunho…')
    // Sem signatário possível, o aviso de baixo já explica
    expect(motivoDoEnvioDesativado({ ...base, signatarioId: '', semSignatarios: true })).toBeNull()
  })
})

describe('o alto de "Revisão e emissão"', () => {
  const base = { pronto: true, autorizaVoce: false, aguardandoDe: null, irParaItens: false }
  it('cada modo diz o que quem está usando faz', () => {
    expect(cabecalhoDaRevisao({ ...base, modo: 'emitir' }).titulo).toBe('Tudo pronto para emitir')
    expect(cabecalhoDaRevisao({ ...base, modo: 'escolher' }).titulo).toBe('Tudo pronto para enviar para autorização')
    expect(cabecalhoDaRevisao({ ...base, modo: 'escolher', autorizaVoce: true }).titulo).toBe(
      'Tudo pronto para autorizar e emitir',
    )
    expect(cabecalhoDaRevisao({ ...base, modo: 'autorizar' }).titulo).toBe('Tudo pronto para autorizar e emitir')
    expect(cabecalhoDaRevisao({ ...base, modo: 'aguardando', aguardandoDe: 'Rafael' })).toEqual({
      titulo: 'Aguardando autorização de Rafael',
      descricao: 'O certificado é emitido quando Rafael autorizar. Até lá, dá para ver a prévia.',
      aguardando: true,
    })
    // Sem o nome (não deveria acontecer): genérico
    expect(cabecalhoDaRevisao({ ...base, modo: 'aguardando' }).titulo).toBe('Aguardando autorização')
  })

  it('com pendências: o que falta para a ação de quem está usando, e o convite a clicar', () => {
    expect(cabecalhoDaRevisao({ ...base, pronto: false, modo: 'escolher', irParaItens: true }).descricao).toBe(
      'Resolva os itens abaixo para poder enviar para autorização. Clique num item para ir até ele.',
    )
  })
})

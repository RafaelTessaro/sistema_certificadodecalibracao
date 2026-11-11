import { describe, expect, it } from 'vitest'
import { QUEM_ESCOLHEU_NAO_AUTORIZA } from '#shared/permissoes.ts'
import type { MembroEquipe } from '../../lib/api'
import { avisoParaAutorizar, cabecalhoDaRevisao, dicaDoTecnico, estadoDaEmissao, motivoDoEnvioDesativado } from './equipe'

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
      'Escolhido por você: outro signatário autoriza esta calibração (quem escolhe o técnico não autoriza; se o próprio técnico gravar ou enviar a calibração, a escolha passa a ser dele).',
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
      expect(estadoDaEmissao(true, enviada, eu(m), EQUIPE)).toMatchObject({
        modo: 'aguardando',
        podeDevolver: false,
        semQuemAutorize: null,
      })
  })

  it('enviada na 1.0.5 a Rafael, que escolheu o técnico: ele não autoriza, mas devolve; os outros ficam sabendo', () => {
    const parada = {
      tecnicoId: 'mauricio',
      tecnicoDefinidoPorId: 'rafael',
      status: 'REVISAO' as const,
      autorizacao: { signatarioId: 'rafael', signatarioNome: 'Rafael', porId: 'lizi', por: 'Lizi', em: '' },
    }
    expect(estadoDaEmissao(true, parada, eu(RAFAEL), EQUIPE)).toMatchObject({
      modo: 'aguardando',
      podeDevolver: true,
      impedimento: QUEM_ESCOLHEU_NAO_AUTORIZA,
      semQuemAutorize: 'ESCOLHEU',
    })
    for (const m of [FABIO, LIZI, MAURICIO])
      expect(estadoDaEmissao(true, parada, eu(m), EQUIPE)).toMatchObject({
        modo: 'aguardando',
        podeDevolver: false,
        semQuemAutorize: 'ESCOLHEU',
      })
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

  it('o pedido parado com quem não pode autorizar (enviado na 1.0.5 a quem escolheu o técnico): o que fazer', () => {
    const parado = { ...base, modo: 'aguardando' as const, aguardandoDe: 'Rafael', semQuemAutorize: 'ESCOLHEU' as const }
    expect(cabecalhoDaRevisao({ ...parado, pedidoParaVoce: true })).toEqual({
      titulo: 'Você não pode autorizar esta calibração',
      descricao:
        'Você escolheu o técnico, e quem escolhe o técnico não autoriza. Clique em Devolver: ela volta para rascunho, com a sua nota, e quem enviou a manda para outro signatário.',
      aguardando: false,
      parado: true,
    })
    expect(cabecalhoDaRevisao({ ...parado, pedidoParaVoce: false })).toEqual({
      titulo: 'Rafael não pode autorizar esta calibração',
      descricao:
        'Rafael escolheu o técnico, e quem escolhe o técnico não autoriza (o pedido é de antes da atualização). Volte para rascunho e envie para outro signatário.',
      aguardando: false,
      parado: true,
    })
    expect(cabecalhoDaRevisao({ ...parado, semQuemAutorize: 'TECNICO', pedidoParaVoce: false }).descricao).toBe(
      'Rafael executou esta calibração e não autoriza o próprio certificado. Volte para rascunho e envie para outro signatário.',
    )
    // Com pendências, o que falta vem antes (voltar para rascunho resolve as duas coisas)
    expect(cabecalhoDaRevisao({ ...parado, pronto: false, pedidoParaVoce: false }).titulo).toBe('Falta completar')
  })

  it('com pendências: o que falta para a ação de quem está usando, e o convite a clicar', () => {
    expect(cabecalhoDaRevisao({ ...base, pronto: false, modo: 'escolher', irParaItens: true }).descricao).toBe(
      'Resolva os itens abaixo para poder enviar para autorização. Clique num item para ir até ele.',
    )
  })
})

describe('o aviso do Painel das calibrações para autorizar', () => {
  it('diz o que fazer também com o pedido que quem recebeu não pode autorizar (enviado na 1.0.5 a quem escolheu o técnico)', () => {
    expect(avisoParaAutorizar(1)).toEqual({
      destaque: '1 calibração aguarda a sua autorização.',
      texto: 'Confira e autorize a emissão, ou devolva com uma nota se não puder autorizar.',
    })
    expect(avisoParaAutorizar(3).destaque).toBe('3 calibrações aguardam a sua autorização.')
  })
})

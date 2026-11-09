import { describe, expect, it } from 'vitest'
import type { MembroEquipe } from '../../lib/api'
import { dicaDoTecnico, estadoDaEmissao } from './equipe'

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

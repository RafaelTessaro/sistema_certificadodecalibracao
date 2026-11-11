// Etapa "Revisão e emissão": com a revisão por outra pessoa desligada, qualquer pessoa emite; ligada, quem não pode
// autorizar escolhe o signatário e envia, o signatário escolhido autoriza ou devolve, e os outros aguardam, como o
// servidor decide (shared/permissoes.ts). Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { calibracaoVazia, CONFIG_PADRAO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, FolhaNaoLigada, PedidoAutorizacao } from '#shared/tipos.ts'
import type { MembroEquipe } from '../../lib/api'
import type { ContextoEtapa } from './contexto'

// Quem está usando (cada teste escolhe)
const sessao = vi.hoisted(() => ({ usuario: { id: 'ana', nome: 'Ana Signatária', signatario: true } }))
vi.mock('../../store/sessao', () => ({
  useSessao: (seletor: (s: typeof sessao) => unknown) => seletor(sessao),
}))

const { EtapaRevisao } = await import('./EtapaRevisao')

const membro = (id: string, nome: string, tecnico: boolean, signatario: boolean): MembroEquipe => ({
  id,
  nome,
  cargo: '',
  tecnico,
  signatario,
  temAssinatura: false,
})
const ANA = membro('ana', 'Ana Signatária', true, true)
const BIA = membro('bia', 'Bia Técnica', true, false)
const CAIO = membro('caio', 'Caio Signatário', false, true)
const EQUIPE = [ANA, BIA, CAIO]

const usando = (u: MembroEquipe) => {
  sessao.usuario = { id: u.id, nome: u.nome, signatario: u.signatario }
}

const pedidoPara = (u: MembroEquipe): PedidoAutorizacao => ({
  signatarioId: u.id,
  signatarioNome: u.nome,
  porId: 'bia',
  por: 'Bia Técnica',
  em: '2026-11-09T13:30:00.000Z',
})

function etapa(
  o: {
    tecnicoId?: string
    /** Quem escolheu o técnico (o que a tela gravaria: `quemDefineOTecnico`). */
    definidoPor?: string
    exigirRevisor?: boolean
    gravada?: Partial<Pick<Calibracao, 'status' | 'autorizacao' | 'devolucao'>>
    equipe?: MembroEquipe[]
    correcao?: { substituiId: string; numeroRevisao: string | null }
    pendencias?: string[]
    folhasNaoLigadas?: FolhaNaoLigada[]
  } = {},
) {
  const f: CalibracaoInput = { ...calibracaoVazia(), tecnicoId: o.tecnicoId ?? 'bia', substituiId: o.correcao?.substituiId ?? '' }
  const ctx = {
    f,
    calc: null,
    config: { ...CONFIG_PADRAO, exigirRevisor: o.exigirRevisor ?? true },
    equipe: o.equipe ?? EQUIPE,
    status: o.gravada?.status ?? 'RASCUNHO',
    balanca: { unidade: 'kg' } as Balanca,
    tecnicoDefinidoPorId: o.definidoPor,
    folhasNaoLigadas: o.folhasNaoLigadas ?? [],
    vincularFolha: async () => true,
  } as unknown as ContextoEtapa
  const t = renderToStaticMarkup(
    createElement(EtapaRevisao, {
      ctx,
      gravada: { status: 'RASCUNHO', autorizacao: null, devolucao: null, ...o.gravada },
      numeroRevisao: o.correcao?.numeroRevisao ?? null,
      pendencias: o.pendencias ?? [],
      salvando: false,
      aoVisualizar: () => {},
      aoPedirAutorizacao: () => {},
      aoVoltarRascunho: () => {},
      aoDevolver: () => {},
      aoEmitir: () => {},
    }),
  )
  return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('revisão por outra pessoa desligada: qualquer pessoa emite', () => {
  it('quem não é signatário emite direto; só quem executou assina, e quem emite fica registrado', () => {
    usando(BIA)
    const t = etapa({ exigirRevisor: false, tecnicoId: 'ana' })
    expect(t).toContain('Emitir certificado')
    expect(t).not.toContain('Enviar para autorização')
    expect(t).not.toContain('Autorizar e emitir')
    expect(t).toContain('Executado por Ana Signatária')
    // Antes de emitir, no presente: quem vai emitir (não "Emitido por", que pareceria já emitido)
    expect(t).toContain('Quem emite Bia Técnica')
    expect(t).not.toContain('Emitido por')
    expect(t).not.toContain('Autorizado por')
    expect(t).toContain('O certificado sai só com a assinatura de quem executou.')
  })

  it('o técnico emite a própria calibração', () => {
    usando(BIA)
    expect(etapa({ exigirRevisor: false, tecnicoId: 'bia' })).toContain('Emitir certificado')
  })
})

describe('revisão por outra pessoa ligada: escolher quem autoriza', () => {
  it('quem não é signatário escolhe entre os signatários (nunca o técnico) e envia', () => {
    usando(BIA)
    const t = etapa({ tecnicoId: 'bia' })
    expect(t).toContain('Quem autoriza')
    expect(t).toContain('Enviar para autorização')
    expect(t).not.toContain('Autorizar e emitir')
    expect(t).not.toContain('Emitir certificado')
    // As opções: os dois signatários; a técnica não
    expect(t).toContain('Ana Signatária')
    expect(t).toContain('Caio Signatário')
    expect(t).toContain('O certificado sai com duas assinaturas: a de quem executou e a de quem autorizou.')
  })

  it('o signatário que não executou nem escolheu o técnico já vem escolhido e autoriza direto', () => {
    usando(ANA)
    const t = etapa({ tecnicoId: 'bia', definidoPor: 'bia' })
    expect(t).toContain('Ana Signatária (você)')
    expect(t).toContain('Autorizar e emitir')
    expect(t).not.toContain('Enviar para autorização')
    expect(t).toContain('Você autoriza como signatário')
  })

  it('o signatário que executou não se escolhe: envia para outro', () => {
    usando(ANA)
    const t = etapa({ tecnicoId: 'ana' })
    expect(t).not.toContain('Ana Signatária (você)')
    expect(t).toContain('Enviar para autorização')
    expect(t).not.toContain('Autorizar e emitir')
    // O único possível já vem escolhido
    expect(t).toContain('Caio Signatário recebe o pedido, revisa e autoriza a emissão.')
  })

  it('o signatário que escolheu o técnico de outra pessoa não se escolhe: envia para outro, e a tela diz por quê', () => {
    usando(ANA)
    const t = etapa({ tecnicoId: 'bia', definidoPor: 'ana' })
    expect(t).not.toContain('Ana Signatária (você)')
    expect(t).not.toContain('Autorizar e emitir')
    expect(t).toContain('Enviar para autorização')
    expect(t).toContain('Caio Signatário recebe o pedido, revisa e autoriza a emissão.')
    expect(t).toContain('Você escolheu o técnico que executou esta calibração, e quem escolhe o técnico não autoriza.')
    // Quem escolheu o técnico também não aparece para outra pessoa escolher
    usando(BIA)
    expect(etapa({ tecnicoId: 'bia', definidoPor: 'ana' })).not.toContain('Ana Signatária')
  })

  it('"Quem autoriza" tem a marca de obrigatório, e o botão desativado diz por quê', () => {
    usando(BIA)
    const t = etapa({ tecnicoId: 'bia' })
    expect(t).toContain('Quem autoriza (obrigatório)')
    // Dois signatários possíveis: nenhum vem escolhido, e o botão diz o que falta
    expect(t).toContain('Escolha quem autoriza para enviar.')
    expect(etapa({ tecnicoId: 'bia', pendencias: ['Registre a pressão.'] })).toContain(
      'Escolha quem autoriza e resolva os itens de “Falta completar” para enviar.',
    )
    // Com o único possível já escolhido, nada a dizer
    const pronto = etapa({ tecnicoId: 'bia', equipe: [ANA, BIA] })
    expect(pronto).not.toContain('para enviar.')
    // Aguardando a autorização, ninguém escolhe: sem a marca
    expect(etapa({ gravada: { status: 'REVISAO', autorizacao: pedidoPara(ANA) } })).not.toContain('(obrigatório)')
  })

  it('sem outro signatário além do técnico, avisa que ninguém pode autorizar', () => {
    usando(ANA)
    const t = etapa({ tecnicoId: 'ana', equipe: [ANA, BIA] })
    expect(t).toContain('Ninguém pode autorizar esta calibração')
    expect(t).toContain('Nenhum signatário')
    // Nem quem escolheu o técnico: o aviso diz isso
    usando(CAIO)
    const escolhida = etapa({ tecnicoId: 'ana', definidoPor: 'caio' })
    expect(escolhida).toContain(
      'Ninguém pode autorizar esta calibração: quem executou e quem escolheu o técnico não autorizam, e não há outro signatário.',
    )
  })

  it('a devolvida mostra quem devolveu e a nota', () => {
    usando(BIA)
    const t = etapa({
      gravada: {
        devolucao: {
          nota: 'Confira a temperatura do 2º ensaio.',
          porId: 'ana',
          por: 'Ana Signatária',
          em: '2026-11-09T14:00:00.000Z',
        },
      },
    })
    expect(t).toMatch(/Devolvida por Ana Signatária em .+: Confira a temperatura do 2º ensaio\./)
  })
})

describe('revisão por outra pessoa ligada: a enviada para autorização', () => {
  it('o signatário escolhido autoriza ou devolve', () => {
    usando(ANA)
    const t = etapa({ gravada: { status: 'REVISAO', autorizacao: pedidoPara(ANA) } })
    expect(t).toContain('Autorizar e emitir')
    expect(t).toContain('Devolver')
    expect(t).toContain('Bia Técnica pediu a sua autorização')
    // Ainda não autorizou: "Quem autoriza", não "Autorizado por"
    expect(t).toContain('Quem autoriza Ana Signatária')
    expect(t).not.toContain('Autorizado por Ana')
    expect(t).not.toContain('Voltar para rascunho')
  })

  it('os outros aguardam o escolhido (ninguém autoriza no lugar dele) e podem voltar para rascunho', () => {
    for (const u of [CAIO, BIA]) {
      usando(u)
      const t = etapa({ gravada: { status: 'REVISAO', autorizacao: pedidoPara(ANA) } })
      expect(t).toContain('Aguardando a autorização de Ana Signatária (pedida por Bia Técnica em')
      expect(t).toContain('Voltar para rascunho')
      expect(t).not.toContain('Autorizar e emitir')
      expect(t).not.toContain('Devolver')
      expect(t).toContain('Quem autoriza Ana Signatária')
      expect(t).not.toContain('Autorizado por Ana')
    }
  })

  it('o escolhido que passou a ser o técnico (troca na tela) não autoriza', () => {
    usando(ANA)
    const t = etapa({ tecnicoId: 'ana', gravada: { status: 'REVISAO', autorizacao: pedidoPara(ANA) } })
    expect(t).not.toContain('Autorizar e emitir')
    expect(t).toContain('O técnico que executou não autoriza o próprio certificado.')
  })

  it('a enviada para revisão antes da 1.0.5 (sem o pedido): qualquer signatário que não executou autoriza', () => {
    usando(CAIO)
    const t = etapa({ gravada: { status: 'REVISAO' } })
    expect(t).toContain('Autorizar e emitir')
    expect(t).toContain('Devolver')
    expect(t).toContain('Enviada para revisão antes da atualização do sistema')
    // Quem não pode autorizar escolhe um signatário (ou volta para rascunho)
    usando(BIA)
    const outra = etapa({ gravada: { status: 'REVISAO' } })
    expect(outra).toContain('Enviar para autorização')
    expect(outra).toContain('Voltar para rascunho')
    expect(outra).not.toContain('Autorizar e emitir')
  })
})

describe('a folha do cliente ainda não ligada', () => {
  it('avisa com os dois nºs e oferece ligar, sem impedir a emissão', () => {
    usando(ANA)
    const folha: FolhaNaoLigada = {
      numero: 'FC-2026-00012',
      numeroCertificado: 'CC-2026-00034',
      ordemServico: 'OS 777',
      mesmaOs: true,
      impressaEm: '2026-11-09T13:00:00.000Z',
      dataPrevista: '',
    }
    const t = etapa({ exigirRevisor: false, folhasNaoLigadas: [folha] })
    expect(t).toContain(
      'O cliente tem a folha FC-2026-00012 (da mesma OS 777, certificado CC-2026-00034 reservado) ainda não ligada. Se foi ela a usada no cliente, ligue-a: o nº da etiqueta é CC-2026-00034.',
    )
    expect(t).toContain('Ligar esta folha')
    expect(t).toContain('Tudo pronto para emitir')
    expect(etapa({ exigirRevisor: false })).not.toContain('Ligar esta folha')
  })
})

describe('o número na prévia da emissão', () => {
  it('correção: o mesmo nº do certificado corrigido, sem "-R"', () => {
    usando(ANA)
    const t = etapa({ exigirRevisor: false, correcao: { substituiId: 'k1', numeroRevisao: 'CC-2026-00002' } })
    expect(t).toContain('CC-2026-00002 (o mesmo do certificado corrigido)')
    expect(t).not.toMatch(/-R\d/)
    expect(t).toContain(
      'A correção sai com o mesmo número e a data de emissão nova; a versão anterior e o motivo ficam só no sistema.',
    )
    // Sem correção: o nº sai na emissão, o próximo da sequência do ano (sem um exemplo com a sequência 1, que pareceria
    // o nº que ele vai receber mesmo com o CC-…-00001 já emitido)
    const semNumero = etapa({ exigirRevisor: false })
    expect(semNumero).toMatch(/Número Gerado na emissão: o próximo da sequência de \d{4}/)
    expect(semNumero).not.toMatch(/CC-\d{4}-00001/)
  })
})

describe('o título da revisão diz o que quem está usando pode fazer', () => {
  it('desligada: pronto para emitir', () => {
    usando(BIA)
    const t = etapa({ exigirRevisor: false })
    expect(t).toContain('Tudo pronto para emitir')
    expect(t).toContain('Confira a prévia do certificado antes de emitir.')
    expect(etapa({ exigirRevisor: false, pendencias: ['Registre a pressão.'] })).toContain(
      'Resolva os itens abaixo para poder emitir o certificado.',
    )
  })

  it('ligada, quem não autoriza: pronto para enviar para autorização (não para emitir)', () => {
    usando(BIA)
    const t = etapa({ tecnicoId: 'bia' })
    expect(t).toContain('Tudo pronto para enviar para autorização')
    expect(t).toContain('Confira a prévia do certificado e escolha quem autoriza a emissão.')
    expect(t).not.toContain('Tudo pronto para emitir')
    expect(t).not.toContain('antes de emitir.')
    const falta = etapa({ tecnicoId: 'bia', pendencias: ['Registre a pressão.'] })
    expect(falta).toContain('Falta completar')
    expect(falta).toContain('Resolva os itens abaixo para poder enviar para autorização.')
  })

  it('ligada, o signatário que autoriza (escolhendo a si mesmo ou com o pedido): pronto para autorizar e emitir', () => {
    usando(ANA)
    expect(etapa({ tecnicoId: 'bia' })).toContain('Tudo pronto para autorizar e emitir')
    const pedido = etapa({ gravada: { status: 'REVISAO', autorizacao: pedidoPara(ANA) } })
    expect(pedido).toContain('Tudo pronto para autorizar e emitir')
    expect(pedido).toContain('Confira os dados e a prévia do certificado antes de autorizar.')
    expect(etapa({ tecnicoId: 'bia', pendencias: ['Registre a pressão.'] })).toContain(
      'Resolva os itens abaixo para poder autorizar e emitir o certificado.',
    )
  })

  it('ligada, enviada a outra pessoa: aguardando a autorização dela (ninguém ali emite)', () => {
    for (const u of [BIA, CAIO]) {
      usando(u)
      const t = etapa({ gravada: { status: 'REVISAO', autorizacao: pedidoPara(ANA) } })
      expect(t).toContain('Aguardando autorização de Ana Signatária')
      expect(t).toContain('O certificado é emitido quando Ana Signatária autorizar. Até lá, dá para ver a prévia.')
      expect(t).not.toContain('Tudo pronto')
      expect(t).not.toContain('antes de emitir.')
    }
    usando(BIA)
    const falta = etapa({ gravada: { status: 'REVISAO', autorizacao: pedidoPara(ANA) }, pendencias: ['Registre a pressão.'] })
    expect(falta).toContain('Falta completar')
    expect(falta).toContain('Estes itens impedem a emissão. Para corrigir, volte para rascunho.')
  })
})

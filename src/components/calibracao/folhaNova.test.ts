// "Folha nova (novo nº)": só para a folha impressa para a calibração (o plano mudou antes da visita). A avulsa ligada
// pelo nº do papel (em branco, do cliente ou da balança) já foi preenchida no cliente e é o registro dos dados brutos:
// a etapa 1 e o botão "Imprimir folha de campo" só a reimprimem. E a janela diz que o nº do certificado continua o
// mesmo (o nº que muda é o da folha). Desenhado no servidor (sem DOM).

import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO } from '#shared/dominio.ts'
import type { Balanca, Cliente, FolhaCampoImpressa } from '#shared/tipos.ts'
import calibracaoForm from '../../pages/CalibracaoForm.tsx?raw'
import { temFolhaNova } from '../../lib/folhaCampo'
import type { ContextoEtapa } from './contexto'
import { EtapaIdentificacao } from './EtapaIdentificacao'

vi.mock('../ui/Modal', () => ({
  Modal: ({ aberto, children, rodape }: { aberto: boolean; children: ReactNode; rodape?: ReactNode }) =>
    aberto ? createElement('div', { 'data-janela': '' }, children, rodape) : null,
}))
const { FolhaCampoModal } = await import('../FolhaCampoModal')

const folha = (x: Partial<FolhaCampoImpressa> = {}): FolhaCampoImpressa => ({
  numero: 'FC-2026-00004',
  impressaEm: '2026-11-05T13:00:00.000Z',
  impressaPor: 'Lizi',
  impressoes: 1,
  ultimaEm: '2026-11-05T13:00:00.000Z',
  ...x,
})

const etapa1 = (folhaCampo: FolhaCampoImpressa | null) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(EtapaIdentificacao, {
        f: calibracaoVazia(undefined, 'III'),
        alterar: () => {},
        balanca: { ...BALANCA_VAZIA, id: 'b1', classe: 'III', faixas: [{ max: 30, e: 0.01, d: 0.01 }] } as Balanca,
        cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
        padroes: [],
        selecionados: [],
        calc: null,
        config: CONFIG_PADRAO,
        equipe: [],
        status: 'RASCUNHO',
        editarBalanca: () => {},
        folhaCampo,
        vincularFolha: async () => true,
        novaFolha: () => {},
      } satisfies ContextoEtapa),
    ),
  )

describe('folha nova: só para a folha impressa para a calibração', () => {
  it('a folha da calibração: "Folha nova (novo nº)"; a avulsa ligada e a da correção, não', () => {
    expect(temFolhaNova(folha())).toBe(true)
    expect(temFolhaNova(folha({ avulsa: true }))).toBe(false)
    expect(temFolhaNova(folha({ herdada: true }))).toBe(false)
    expect(temFolhaNova(null)).toBe(false)
    expect(etapa1(folha())).toContain('Folha nova (novo nº)')
    const avulsa = etapa1(folha({ avulsa: true }))
    expect(avulsa).not.toContain('Folha nova (novo nº)')
    expect(avulsa).toContain('Ligar à calibração')
    expect(avulsa).toContain('Folha preenchida no cliente')
  })

  it('o botão "Imprimir folha de campo" só abre a escolha (reimprimir ou folha nova) quando há folha nova', () => {
    expect(calibracaoForm).toContain(
      "onClick={() => (temFolhaNova(folha) ? setEscolhaFolha('reimprimir') : void imprimirFolha())}",
    )
    expect(calibracaoForm).toContain('folha={escolhaFolha && temFolhaNova(folha) ? folha : null}')
  })

  it('a janela diz que a folha nova muda o nº da folha e mantém o do certificado', () => {
    const h = renderToStaticMarkup(createElement(FolhaCampoModal, { folha: folha(), aoEscolher: () => {}, aoFechar: () => {} }))
    const t = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(t).toContain('Folha nova (novo nº)')
    expect(t).toContain('nº de folha novo, o mesmo nº de certificado')
  })
})

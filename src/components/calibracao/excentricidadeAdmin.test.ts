// Excentricidade: o método é fixo pela classe (POP 7.10), mas o administrador pode alterá-lo ("alterar"), mesmo na
// calibração nova. Num arquivo à parte: a sessão do administrador vem do módulo da sessão substituído.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO } from '#shared/dominio.ts'
import type { Balanca, CalibracaoInput, Cliente } from '#shared/tipos.ts'
import type { ContextoEtapa } from './contexto'
import { EtapaExcentricidade } from './EtapaExcentricidade'

vi.mock('../../store/sessao', () => ({
  useSessao: (seletor: (s: { usuario: { nivel: string } }) => unknown) => seletor({ usuario: { nivel: 'ADMIN' } }),
}))

const balanca = { ...BALANCA_VAZIA, id: 'b1', classe: 'III', faixas: [{ max: 30, e: 0.01, d: 0.01 }] } as Balanca

const contexto = (f: CalibracaoInput, b: Balanca = balanca): ContextoEtapa => ({
  f,
  alterar: () => {},
  balanca: b,
  cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
  padroes: [],
  selecionados: [],
  calc: null,
  config: CONFIG_PADRAO,
  equipe: [],
  status: 'RASCUNHO',
  editarBalanca: () => {},
  folhaCampo: null,
  vincularFolha: async () => true,
  novaFolha: () => {},
})
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('Excentricidade "não realizada": só na balança suspensa (gancho), com o motivo (POP 7.10)', () => {
  const naoFeita = (motivo: string): CalibracaoInput => ({
    ...calibracaoVazia(undefined, 'III'),
    excentricidade: { aplicavel: false, motivo, carga: 0, metodo: 1, posicoes: [] },
  })

  it('plataforma com o ensaio feito: sem o "Ensaio realizado" (não dá para dispensar)', () => {
    const t = renderToStaticMarkup(createElement(EtapaExcentricidade, contexto(calibracaoVazia(undefined, 'III'))))
    expect(t).not.toContain('Ensaio realizado')
  })

  it('plataforma já desmarcada (registro de antes): o "Ensaio realizado" para voltar a marcar, o aviso e o motivo obrigatório', () => {
    const t = renderToStaticMarkup(createElement(EtapaExcentricidade, contexto(naoFeita(''))))
    expect(t).toContain('Ensaio realizado')
    expect(texto(t)).toContain('O POP (7.10) só dispensa a excentricidade na balança suspensa (gancho).')
    // A marca "●" de obrigatório para emitir; o destaque só depois de a pessoa passar pelo campo (ou chegar à revisão)
    expect(texto(t)).toContain('Por que o ensaio não foi feito (obrigatório) Sai no certificado.')
    expect(texto(t)).not.toContain('Obrigatório para emitir')
    expect(t).toMatch(/id="ecc-motivo"[^>]*maxLength="200"/i)
    const visto = renderToStaticMarkup(createElement(EtapaExcentricidade, { ...contexto(naoFeita('')), destacar: () => true }))
    expect(texto(visto)).toContain('Por que o ensaio não foi feito (obrigatório) Obrigatório para emitir')
  })

  it('gancho com o motivo: sem aviso nem erro', () => {
    const gancho = { ...balanca, receptor: 'GANCHO' } as Balanca
    const t = renderToStaticMarkup(createElement(EtapaExcentricidade, contexto(naoFeita('A carga se centraliza.'), gancho)))
    expect(t).toContain('Ensaio realizado')
    expect(texto(t)).not.toContain('só dispensa')
    expect(texto(t)).not.toContain('Informe o motivo.')
  })
})

describe('Excentricidade (administrador)', () => {
  it('o método da classe como texto, com o "alterar"', () => {
    const ctx: ContextoEtapa = {
      f: calibracaoVazia(undefined, 'III'),
      alterar: () => {},
      balanca,
      cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
      padroes: [],
      selecionados: [],
      calc: null,
      config: CONFIG_PADRAO,
      equipe: [],
      status: 'RASCUNHO',
      editarBalanca: () => {},
      folhaCampo: null,
      vincularFolha: async () => true,
      novaFolha: () => {},
    }
    const t = renderToStaticMarkup(createElement(EtapaExcentricidade, ctx))
    expect(t).toContain('Zera e desloca a carga pelas posições')
    expect(t).toContain('>alterar<')
    expect(t).not.toContain('id="ecc-metodo"')
  })
})

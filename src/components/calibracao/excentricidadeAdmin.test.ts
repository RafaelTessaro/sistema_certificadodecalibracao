// Excentricidade: o método é fixo pela classe (POP 7.10), mas o administrador pode alterá-lo ("alterar"), mesmo na
// calibração nova. Num arquivo à parte: a sessão do administrador vem do módulo da sessão substituído.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO } from '#shared/dominio.ts'
import type { Balanca, Cliente } from '#shared/tipos.ts'
import type { ContextoEtapa } from './contexto'
import { EtapaExcentricidade } from './EtapaExcentricidade'

vi.mock('../../store/sessao', () => ({
  useSessao: (seletor: (s: { usuario: { nivel: string } }) => unknown) => seletor({ usuario: { nivel: 'ADMIN' } }),
}))

const balanca = { ...BALANCA_VAZIA, id: 'b1', classe: 'III', faixas: [{ max: 30, e: 0.01, d: 0.01 }] } as Balanca

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

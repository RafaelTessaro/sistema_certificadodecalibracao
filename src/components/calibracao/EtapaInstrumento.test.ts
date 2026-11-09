// "Para que é usada" e "Dimensões" saíram do cadastro da balança (1.0.5): a etapa "Balança e ajuste" não mostra mais a
// finalidade nem o aviso do uso comercial / na saúde (a declaração fixa do certificado sobre a verificação do Inmetro
// já trata disso), o formulário não pede e a página da balança não mostra. O que foi guardado continua no cadastro.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, calibracaoVazia } from '#shared/dominio.ts'
import type { Balanca } from '#shared/tipos.ts'
import pagina from '../../pages/BalancaDetalhe.tsx?raw'
import formulario from '../BalancaFormModal.tsx?raw'
import type { ContextoEtapa } from './contexto'
import { EtapaInstrumento } from './EtapaInstrumento'

const balanca = (b: Partial<Balanca>): Balanca => ({
  ...BALANCA_VAZIA,
  id: 'b1',
  versao: 1,
  clienteId: 'c1',
  fabricante: 'Toledo',
  modelo: 'Prix 3',
  numeroSerie: 'SN-1',
  faixas: [{ max: 15, e: 0.005, d: 0.005 }],
  localInstalacao: 'Açougue — balcão 2',
  criadoEm: '',
  atualizadoEm: '',
  ...b,
})

function etapa(b: Balanca): string {
  const ctx = { f: calibracaoVazia(), alterar: () => {}, balanca: b, editarBalanca: () => {} } as unknown as ContextoEtapa
  return renderToStaticMarkup(createElement(EtapaInstrumento, ctx))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
}

describe('sem "Para que é usada" e sem "Dimensões" (1.0.5)', () => {
  it('a etapa da balança não mostra a finalidade nem o aviso do uso comercial ou na saúde', () => {
    for (const finalidade of ['COMERCIAL', 'SAUDE', 'PROCESSO'] as const) {
      const t = etapa(balanca({ finalidade, dimensoes: '40 × 50 cm' }))
      expect(t, finalidade).toContain('Balança calibrada')
      expect(t, finalidade).toContain('Açougue — balcão 2')
      expect(t, finalidade).not.toMatch(/Finalidade|Comercial|Saúde|Processo|uso comercial|na saúde|Inmetro\/IPEM/)
      expect(t, finalidade).not.toContain('40 × 50 cm')
    }
  })

  it('o formulário da balança não pede, e a página da balança não mostra (o cadastro guardado continua)', () => {
    expect(formulario).not.toMatch(/Para que é usada|set\('finalidade'|FINALIDADES/)
    expect(formulario).not.toMatch(/label="Dimensões"|set\('dimensoes'|Do prato ou da plataforma/)
    expect(pagina).not.toMatch(/Para que é usada|balanca\.finalidade|FINALIDADES/)
    expect(pagina).not.toMatch(/rotulo="Dimensões"|balanca\.dimensoes/)
  })
})

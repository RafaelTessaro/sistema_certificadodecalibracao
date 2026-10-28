// Etapa "Revisão e emissão": o cartão Emissão mostra o nº reservado na folha de campo (o da etiqueta), com a
// folha; sem nº reservado, o exemplo do formato. E as dicas das etapas que dependem da balança (ΔT da classe,
// repetibilidade por intervalo). Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO } from '#shared/dominio.ts'
import type { Balanca, Cliente } from '#shared/tipos.ts'
import type { ContextoEtapa } from './contexto'
import { EtapaRevisao } from './EtapaRevisao'
import { dicaRepetibilidade, proximosEnsaiosRepetibilidade, textoDeltaT } from './util'

const balanca = { ...BALANCA_VAZIA, id: 'b1', faixas: [{ max: 30, e: 0.01, d: 0.01 }] } as Balanca
const ctx: ContextoEtapa = {
  f: calibracaoVazia(),
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
const texto = (numeroReservado?: { numero: string; folha: string } | null) =>
  renderToStaticMarkup(
    createElement(EtapaRevisao, {
      ctx,
      numeroReservado,
      pendencias: [],
      salvando: false,
      aoVisualizar: () => {},
      aoEnviarRevisao: () => {},
      aoVoltarRascunho: () => {},
      aoEmitir: () => {},
    }),
  ).replace(/<[^>]+>/g, '')

describe('etapa Revisão e emissão', () => {
  it('com nº reservado: o nº e a folha em que foi reservado (nada de "gerado na emissão")', () => {
    const t = texto({ numero: 'CC-2026-00018', folha: 'FC-2026-00016' })
    expect(t).toContain('NúmeroCC-2026-00018 (reservado na folha FC-2026-00016)')
    expect(t).not.toContain('Gerado na emissão')
  })

  it('sem nº reservado: gerado na emissão, com o exemplo do formato', () => {
    const ano = new Date().getFullYear()
    for (const n of [undefined, null]) expect(texto(n)).toContain(`Gerado na emissão (ex.: CC-${ano}-00001)`)
  })
})

describe('dicas das etapas pela balança', () => {
  it('ΔT acima do limite da classe: 3 °C na II, 5 °C nas demais', () => {
    expect(textoDeltaT(3.5, 'II')).toBe(
      'A temperatura variou 3,5 °C durante a calibração. O limite para balanças classe II é 3 °C; registre nas observações.',
    )
    expect(textoDeltaT(5.24, 'III')).toContain('variou 5,2 °C')
    expect(textoDeltaT(5.24, 'III')).toContain('classe III é 5 °C')
    expect(textoDeltaT(6, '')).toContain('O limite para balanças sem classe é 5 °C')
  })

  it('repetibilidade: faixa única (rodoviária pode menos) e um ensaio por intervalo no multi-intervalo', () => {
    expect(dicaRepetibilidade(balanca)).toBe('Use de 50 % a 100 % da capacidade (não precisa ser peso padrão).')
    expect(dicaRepetibilidade({ ...balanca, receptor: 'RODOVIARIA' })).toContain('(na rodoviária, pode ser menos)')
    const multi = { ...balanca, tipoFaixas: 'MULTI_INTERVALO' as const, faixas: [...balanca.faixas, { max: 60, e: 0.02, d: 0.02 }] }
    expect(dicaRepetibilidade(multi)).toMatch(/^Faça um ensaio por intervalo: nos de baixo, com carga logo abaixo do Max dele/)
    expect(dicaRepetibilidade({ ...multi, tipoFaixas: 'MULTIPLAS_FAIXAS' })).toMatch(/^Faça um ensaio por faixa/)
  })

  it('repetibilidade: sem ensaio, todos os sugeridos; depois, o que falta (ou o de cima de novo)', () => {
    const sugeridos = [{ carga: 4.8 }, { carga: 12 }, { carga: 16.5 }]
    expect(proximosEnsaiosRepetibilidade(sugeridos, [])).toEqual(sugeridos)
    expect(proximosEnsaiosRepetibilidade(sugeridos, [{ carga: 4.8 }])).toEqual([{ carga: 12 }])
    expect(proximosEnsaiosRepetibilidade(sugeridos, sugeridos)).toEqual([{ carga: 16.5 }])
    expect(proximosEnsaiosRepetibilidade([], [])).toEqual([])
  })
})

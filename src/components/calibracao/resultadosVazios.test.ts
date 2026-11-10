// Sem leituras, nada foi medido: a repetibilidade (rodapé de cada ensaio) e o painel "Resultados ao vivo" mostram "—",
// e não 0,0000 (que pareceria um resultado perfeito para quem não é técnico). Desenhado no servidor (sem DOM).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO } from '#shared/dominio.ts'
import type { Balanca, CalibracaoInput, Cliente } from '#shared/tipos.ts'
import type { ContextoEtapa } from './contexto'
import { EtapaRepetibilidade } from './EtapaRepetibilidade'

// O gráfico precisa do navegador
vi.mock('./GraficoErro', () => ({ GraficoErro: () => null }))
const { PainelResultados } = await import('./PainelResultados')

const balanca = { ...BALANCA_VAZIA, id: 'b1', classe: 'III', faixas: [{ max: 32, e: 0.01, d: 0.01 }] } as Balanca
const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

function com(leiturasRep: Array<number | null>, leiturasEcc: Array<number | null>): ContextoEtapa {
  const base = calibracaoVazia(undefined, 'III')
  const f: CalibracaoInput = {
    ...base,
    repetibilidade: [{ id: 'r1', carga: 16, leituras: leiturasRep }],
    excentricidade: {
      ...base.excentricidade,
      aplicavel: true,
      carga: 10,
      posicoes: leiturasEcc.map((leitura, i) => ({ rotulo: `Posição ${i + 1}`, leitura, referencia: null })),
    },
  }
  return {
    f,
    alterar: () => {},
    balanca,
    cliente: { ...CLIENTE_VAZIO, id: 'c1' } as Cliente,
    padroes: [],
    selecionados: [],
    calc: calcularCalibracao(f, balanca, []),
    config: CONFIG_PADRAO,
    equipe: [],
    status: 'RASCUNHO',
    editarBalanca: () => {},
    folhaCampo: null,
    vincularFolha: async () => true,
    novaFolha: () => {},
  }
}

describe('sem leituras, "—" e não 0,0000', () => {
  it('repetibilidade: o ensaio criado com a carga sugerida, ainda sem leituras', () => {
    const t = texto(renderToStaticMarkup(createElement(EtapaRepetibilidade, com([null, null, null, null, null], []))))
    expect(t).toContain('Leituras 0 Média — Desvio-padrão (s) — Maior − menor —')
    expect(t).not.toContain('0,0000')
    // Com as leituras, os resultados
    const lido = texto(renderToStaticMarkup(createElement(EtapaRepetibilidade, com([16, 16.01, 16, 16, 16.01], []))))
    expect(lido).toContain('Leituras 5 Média 16,004 kg Desvio-padrão (s) 0,005 kg Maior − menor 0,01 kg')
  })

  it('painel "Resultados ao vivo": a repetibilidade e a excentricidade só com o que foi medido', () => {
    const vazio = com([null, null, null, null, null], [null, null, null, null, null])
    const t = texto(renderToStaticMarkup(createElement(PainelResultados, { calc: vazio.calc, balanca, f: vazio.f })))
    expect(t).toContain('Repetibilidade (s) —')
    expect(t).toContain('Excentricidade —')
    expect(t).not.toContain('0,000')
    const medido = com([16, 16.01, 16, 16, 16.01], [10, 10.01, 10, 10, 10])
    const m = texto(renderToStaticMarkup(createElement(PainelResultados, { calc: medido.calc, balanca, f: medido.f })))
    expect(m).toContain('Repetibilidade (s) 0,005 kg')
    expect(m).toContain('Excentricidade 0,01 kg')
  })
})

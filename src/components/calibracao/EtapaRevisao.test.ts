// Etapa "Revisão e emissão": o cartão Emissão mostra o nº reservado na folha de campo (o da etiqueta), com a
// folha; sem nº reservado, o exemplo do formato. E as dicas das etapas que dependem da balança (ΔT da classe,
// repetibilidade por intervalo). Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { BALANCA_VAZIA, calibracaoVazia, CLIENTE_VAZIO, CONFIG_PADRAO, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, CalibracaoInput, Cliente, Padrao, PontoIndicacao } from '#shared/tipos.ts'
import type { ContextoEtapa } from './contexto'
import { EtapaRevisao } from './EtapaRevisao'
import {
  calibradoDepois,
  cartoesDosPadroes,
  diaSeguinte,
  dicaRepetibilidade,
  proximaAcompanhando,
  proximosEnsaiosRepetibilidade,
  repetibilidadeCompleta,
  textoDeltaT,
  tomLeitura,
} from './util'

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
const html = (numeroReservado?: { numero: string; folha: string } | null) =>
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
  )
const texto = (numeroReservado?: { numero: string; folha: string } | null) => html(numeroReservado).replace(/<[^>]+>/g, '')

describe('etapa Revisão e emissão', () => {
  it('com nº reservado: o nº e a folha em que foi reservado (nada de "gerado na emissão")', () => {
    const t = texto({ numero: 'CC-2026-00018', folha: 'FC-2026-00016' })
    expect(t).toContain('NúmeroCC-2026-00018 (reservado na folha FC-2026-00016)')
    expect(t).not.toContain('Gerado na emissão')
    // O nº da folha não quebra no hífen ("FC-" numa linha e "2026-00016" na outra)
    expect(html({ numero: 'CC-2026-00018', folha: 'FC-2026-00016' })).toContain(
      '<span class="tnum whitespace-nowrap">FC-2026-00016</span>',
    )
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
    const multi = {
      ...balanca,
      tipoFaixas: 'MULTI_INTERVALO' as const,
      faixas: [...balanca.faixas, { max: 60, e: 0.02, d: 0.02 }],
    }
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

  it('repetibilidade feita: algum ensaio com 2 leituras e nenhum com carga e sem leitura (o copiado ou o sugerido)', () => {
    expect(repetibilidadeCompleta([{ carga: 10, n: 5 }])).toBe(true)
    expect(
      repetibilidadeCompleta([
        { carga: 10, n: 5 },
        { carga: 25, n: 0 },
      ]),
    ).toBe(false)
    expect(
      repetibilidadeCompleta([
        { carga: 10, n: 5 },
        { carga: 0, n: 0 },
      ]),
    ).toBe(true)
    expect(repetibilidadeCompleta([{ carga: 10, n: 1 }])).toBe(false)
    expect(repetibilidadeCompleta([])).toBe(false)
  })
})

// ---- Mínimos do POP e leituras fora do esperado: a revisão não libera a emissão --------------------------------

describe('revisão com os mínimos do POP e as leituras fora do esperado', () => {
  const jogo: Padrao = {
    ...PADRAO_VAZIO,
    id: 'jp',
    versao: 1,
    identificacao: 'JP-01',
    criadoEm: '',
    atualizadoEm: '',
    pesos: [10_000, 10_000, 10_000, 5000].map((g, i) => ({
      id: `w${i}`,
      marca: '',
      nominal: g,
      correcao: 0,
      incerteza: 160,
      k: 2,
    })),
  }
  const peca = (i: number) => ({ padraoId: 'jp', pesoId: `w${i}`, quantidade: 1 })
  const ponto = (carga: number, pecas: number[], leitura: number | null): PontoIndicacao => ({
    id: `p${carga}`,
    carga,
    pecas: pecas.map(peca),
    pecasManuais: true,
    crescente: leitura,
    decrescente: null,
    nivelSubstituicao: 0,
  })
  const calibracao = (mudar: (k: CalibracaoInput) => CalibracaoInput = (k) => k): CalibracaoInput =>
    mudar({
      ...calibracaoVazia(),
      repetibilidade: [{ id: 'r', carga: 15, leituras: [15, 15, 15.01, 15, 15] }],
      excentricidade: { aplicavel: false, motivo: 'Prato pequeno', carga: 0, metodo: 1, posicoes: [] },
      indicacao: {
        metodo: 'CONTINUO',
        retornoZero: 0,
        substituicao: { ativa: false, pecas: [], etapas: [] },
        pontos: [ponto(0, [], 0), ponto(5, [3], 5), ponto(10, [0], 10), ponto(20, [0, 1], 20.01), ponto(30, [0, 1, 2], 30.01)],
      },
    })
  /** A tela junta as pendências do cálculo às da emissão (como o editor faz) e desenha a etapa. */
  const etapa = (f: CalibracaoInput) => {
    const calc = calcularCalibracao(f, balanca, [jogo])
    const html = renderToStaticMarkup(
      createElement(EtapaRevisao, {
        ctx: { ...ctx, f, calc, selecionados: [jogo] },
        pendencias: calc.resultado.pendencias,
        salvando: false,
        aoVisualizar: () => {},
        aoEnviarRevisao: () => {},
        aoVoltarRascunho: () => {},
        aoEmitir: () => {},
      }),
    )
    return {
      texto: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
      acaoDesligada: /<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>).)*Enviar para revisão/s.test(html),
    }
  }

  // Sem sessão (o desenho no servidor), a ação é "Enviar para revisão"; a de "Emitir" segue a mesma regra (`pronto`)
  it('completa: tudo pronto e a ação ligada', () => {
    const r = etapa(calibracao())
    expect(r.texto).toContain('Tudo pronto para emitir')
    expect(r.acaoDesligada).toBe(false)
  })

  it('2 leituras de repetibilidade, 3 pontos ou uma vírgula esquecida: "Falta completar" e a ação desligada', () => {
    const casos: Array<[(k: CalibracaoInput) => CalibracaoInput, string]> = [
      [
        (k) => ({ ...k, repetibilidade: [{ id: 'r', carga: 15, leituras: [15, 15.01] }] }),
        'Repetibilidade a 15,00 kg: 2 leituras',
      ],
      [
        (k) => ({ ...k, indicacao: { ...k.indicacao, pontos: k.indicacao.pontos.slice(0, 3) } }),
        'Erro de indicação: 3 pontos lidos',
      ],
      [
        (k) => ({
          ...k,
          indicacao: { ...k.indicacao, pontos: k.indicacao.pontos.map((p) => (p.carga === 30 ? { ...p, crescente: 3001 } : p)) },
        }),
        'fora do esperado; confira a digitação',
      ],
    ]
    for (const [mudar, pendencia] of casos) {
      const r = etapa(calibracao(mudar))
      expect(r.texto).toContain('Falta completar')
      expect(r.texto).toContain(pendencia)
      expect(r.acaoDesligada).toBe(true)
    }
  })
})

describe('ajudas da tela: leitura fora do esperado, padrões do dia e datas', () => {
  it('campo da leitura em vermelho pela mesma regra da pendência (10 % da carga ou 2 e)', () => {
    const p = { carga: 30, crescente: 3001, decrescente: 30.01 }
    expect(tomLeitura(p, undefined, 'crescente', balanca)).toBe('erro')
    expect(tomLeitura(p, undefined, 'decrescente', balanca)).toBe('normal')
    // Carga pequena: 1 d fora passa de 10 %, mas não de 2 e
    expect(tomLeitura({ carga: 0.03, crescente: 0.04, decrescente: null }, undefined, 'crescente', balanca)).toBe('normal')
  })

  it('cartões dos padrões: o escolhido como vale para a calibração, e o congelado que saiu da lista no fim', () => {
    const a = { ...PADRAO_VAZIO, id: 'a', certificado: 'NOVO' } as Padrao
    const b = { ...PADRAO_VAZIO, id: 'b', certificado: 'B' } as Padrao
    const aDoDia = { ...a, certificado: 'ANTIGO' }
    const desativado = { ...PADRAO_VAZIO, id: 'c', certificado: 'C' } as Padrao
    expect(cartoesDosPadroes([a, b], [aDoDia, desativado]).map((p) => [p.id, p.certificado])).toEqual([
      ['a', 'ANTIGO'],
      ['b', 'B'],
      ['c', 'C'],
    ])
    expect(calibradoDepois({ dataCalibracao: '2026-06-15' }, '2026-03-02')).toBe(true)
    expect(calibradoDepois({ dataCalibracao: '2026-03-02' }, '2026-03-02')).toBe(false)
    expect(calibradoDepois({ dataCalibracao: '' }, '2026-03-02')).toBe(false)
  })

  it('a próxima calculada pela data acompanha a data nova; a digitada à mão, não', () => {
    expect(proximaAcompanhando('2027-03-02', '2026-03-02', '2026-03-10', 12)).toBe('2027-03-10')
    expect(proximaAcompanhando('2026-09-02', '2026-03-02', '2026-03-10', 12)).toBe('2026-09-10')
    expect(proximaAcompanhando('2027-01-15', '2026-03-02', '2026-03-10', 12)).toBe('2027-01-15')
    expect(proximaAcompanhando('', '2026-03-02', '2026-03-10', 12)).toBe('')
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01')
    expect(diaSeguinte('')).toBe('')
  })
})

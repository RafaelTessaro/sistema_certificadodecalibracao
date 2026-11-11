import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { pedacosSemPartir } from '../../lib/semPartir'
import { SemPartir } from './SemPartir'

describe('os nºs que a pessoa confere com a etiqueta nunca quebram no meio', () => {
  it('separa o texto nos nºs dados, em qualquer formato de numeração', () => {
    expect(
      pedacosSemPartir('A folha FC-2026-00033 (certificado 0042/2026) e de novo FC-2026-00033.', [
        'FC-2026-00033',
        '0042/2026',
        '',
      ]),
    ).toEqual([
      { texto: 'A folha ', inteiro: false },
      { texto: 'FC-2026-00033', inteiro: true },
      { texto: ' (certificado ', inteiro: false },
      { texto: '0042/2026', inteiro: true },
      { texto: ') e de novo ', inteiro: false },
      { texto: 'FC-2026-00033', inteiro: true },
      { texto: '.', inteiro: false },
    ])
    // O nº mais longo primeiro (um nº dentro de outro não parte o maior)
    expect(pedacosSemPartir('CC-2026-00012-R1', ['CC-2026-00012', 'CC-2026-00012-R1'])).toEqual([
      { texto: 'CC-2026-00012-R1', inteiro: true },
    ])
    expect(pedacosSemPartir('sem nº', [])).toEqual([{ texto: 'sem nº', inteiro: false }])
  })

  it('cada nº sai num trecho que não quebra', () => {
    const html = renderToStaticMarkup(
      createElement(SemPartir, { texto: 'o nº da etiqueta é CC-2026-00036.', inteiros: ['CC-2026-00036'] }),
    )
    expect(html).toBe('o nº da etiqueta é <span class="whitespace-nowrap">CC-2026-00036</span>.')
  })
})

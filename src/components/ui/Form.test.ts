// Letras cortadas embaixo (o "g" de "Açougue" no campo "Local de instalação"): com altura fixa (`h-*`) maior que a
// linha, o Chrome desenha o texto digitado com a linha "normal" (só a altura da fonte) e corta a perna do "g" em
// telas a 125–175 %. Os campos de texto usam altura mínima e máxima. (O exemplo, placeholder, ganha folga embaixo
// em src/index.css; o Vitest não lê CSS: conferido nas capturas de tela.) Sem DOM: o HTML desenhado no servidor e o
// código-fonte dos campos.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Input, Select } from './Form'
import { SearchInput } from './Misc'

// Código-fonte de todas as telas e componentes
const fontes = import.meta.glob<string>(['../../**/*.tsx'], { query: '?raw', import: 'default', eager: true })

const classesDe = (html: string, tag: string) => {
  const m = new RegExp(`<${tag}[^>]*class="([^"]*)"`).exec(html)
  return (m?.[1] ?? '').split(/\s+/)
}
const temAlturaFixa = (classes: string[]) => classes.some((c) => /^h-(\d|\[)/.test(c))

/** Todos os `<input ...>` do código da interface, com o arquivo e a linha. */
function inputsDoCodigo() {
  const achados: { onde: string; tag: string }[] = []
  for (const [arquivo, codigo] of Object.entries(fontes)) {
    for (const m of codigo.matchAll(/<input\b[\s\S]*?\/>/g)) {
      const linha = codigo.slice(0, m.index).split('\n').length
      achados.push({ onde: `${arquivo.replace('../../', 'src/')}:${linha}`, tag: m[0] })
    }
  }
  return achados
}

describe('campos de texto não cortam as letras que descem (g, j, p, q, y, ç)', () => {
  it('Input, com e sem ícone: 40 px de altura por mínimo e máximo, sem altura fixa', () => {
    for (const html of [
      renderToStaticMarkup(createElement(Input, { defaultValue: 'Açougue' })),
      renderToStaticMarkup(createElement(Input, { defaultValue: 'Açougue', icone: createElement('svg') })),
    ]) {
      const classes = classesDe(html, 'input')
      expect(classes).toContain('min-h-10')
      expect(classes).toContain('max-h-10')
      expect(temAlturaFixa(classes)).toBe(false)
    }
  })

  it('busca das listas: a mesma altura, sem altura fixa', () => {
    const classes = classesDe(renderToStaticMarkup(createElement(SearchInput, { valor: 'Gôndola', aoMudar: () => {} })), 'input')
    expect(classes).toContain('min-h-10')
    expect(classes).toContain('max-h-10')
    expect(temAlturaFixa(classes)).toBe(false)
  })

  it('Select segue com altura fixa: o Chrome mantém a linha dele (não corta)', () => {
    const html = renderToStaticMarkup(
      createElement(Select, { defaultValue: 'kg' }, createElement('option', { value: 'kg' }, 'kg')),
    )
    expect(classesDe(html, 'select')).toContain('h-10')
  })

  it('nenhum <input> de texto do sistema usa altura fixa (h-*); só campos de número, data, marcar e arquivo', () => {
    const naoTexto =
      /type="(checkbox|radio|file|hidden|range|color|number|date|time)"|inputMode="(decimal|numeric)"|\bhidden\b|sr-only/
    const inputs = inputsDoCodigo()
    expect(inputs.length).toBeGreaterThan(5)
    const comAlturaFixa = inputs
      .filter((i) => !naoTexto.test(i.tag))
      .filter((i) => [...i.tag.matchAll(/(["'`])([^"'`]*)\1/g)].some((s) => temAlturaFixa(s[2].split(/\s+/))))
      .map((i) => i.onde)
    expect(comAlturaFixa).toEqual([])
  })
})

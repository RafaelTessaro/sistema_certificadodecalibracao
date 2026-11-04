// Campo do arquivo (certificado do padrão, POP): o arquivo escolhido e ainda não enviado abre pelo endereço local
// sempre com o tipo conferido pelo conteúdo. Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { conferirArquivoLocal } from '../lib/arquivoLocal'
import { CampoArquivo } from './CampoArquivo'

const PDF = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'
const campo = (valor: File) =>
  renderToStaticMarkup(createElement(CampoArquivo, { finalidade: 'padrao', valor, aoMudar: () => {} }))
const hrefAbrir = (t: string) => /<a href="([^"]+)"[^>]*>.*?Abrir<\/a>/.exec(t)?.[1] ?? ''

describe('arquivo escolhido, antes de salvar', () => {
  it('"Abrir" usa o tipo conferido pelo conteúdo, não o que o navegador deu pelo nome', async () => {
    // O navegador deu text/html; o conteúdo é PDF: abre no leitor de PDF, sem rodar nada
    const f = new File([PDF], 'Certificado RBC 0456.pdf', { type: 'text/html' })
    expect((await conferirArquivoLocal(f, 'padrao')).problema).toBeNull()
    const t = campo(f)
    const url = hrefAbrir(t)
    expect(url).toMatch(/^blob:/)
    const r = await fetch(url)
    expect(r.headers.get('content-type')).toBe('application/pdf')
    URL.revokeObjectURL(url)
    expect(t).toContain('será enviado ao salvar')
  })

  it('o rótulo e o ícone são os do conteúdo ("scan.pdf" que é uma foto sai como JPG)', async () => {
    const f = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'JFIF'], 'scan.pdf', { type: 'application/pdf' })
    expect((await conferirArquivoLocal(f, 'padrao')).tipo).toBe('jpg')
    const t = campo(f)
    expect(t).toMatch(/>JPG · 10 B</)
    const r = await fetch(hrefAbrir(t))
    expect(r.headers.get('content-type')).toBe('image/jpeg')
  })

  it('o arquivo que não passou pela conferência não tem "Abrir"', () => {
    const t = campo(new File([`%PDF-1.7\n<script>alert(1)</script>`], 'Certificado.pdf.html', { type: 'text/html' }))
    expect(t).toContain('Certificado.pdf.html')
    expect(hrefAbrir(t)).toBe('')
    expect(t).not.toContain('blob:')
  })
})

// Configurações gravadas por versões anteriores: completadas com os valores padrão que faltam.
import { describe, expect, it } from 'vitest'
import { completarConfig, REPRODUCAO_ANTIGA, TEXTOS_ANTIGOS, TEXTOS_PADRAO } from './dominio.ts'
import type { TextosCertificado } from './tipos.ts'

describe('cláusula de reprodução (agora no rodapé)', () => {
  it('o texto de fábrica antigo (com a razão social, para as declarações) vira o novo, curto, do rodapé', () => {
    const salva = { empresa: { razaoSocial: 'X LTDA' }, textos: { reproducao: REPRODUCAO_ANTIGA, intervalo: 'Meu texto.' } }
    const c = completarConfig(JSON.parse(JSON.stringify(salva)))
    expect(c.textos.reproducao).toBe(TEXTOS_PADRAO.reproducao)
    expect(c.textos.reproducao).toBe(
      'Este certificado somente pode ser reproduzido na íntegra. A reprodução parcial requer autorização prévia, por escrito.',
    )
    // O resto do que foi gravado fica
    expect(c.textos.intervalo).toBe('Meu texto.')
    expect(c.empresa.razaoSocial).toBe('X LTDA')
    // Com espaços sobrando, também é o antigo
    expect(completarConfig({ textos: { reproducao: ` ${REPRODUCAO_ANTIGA}\n` } }).textos.reproducao).toBe(
      TEXTOS_PADRAO.reproducao,
    )
  })

  it('o texto mudado pela empresa (ou apagado) fica como está; sem o campo, o padrão', () => {
    const proprio = 'Reprodução só na íntegra.'
    expect(completarConfig({ textos: { reproducao: proprio } }).textos.reproducao).toBe(proprio)
    expect(completarConfig({ textos: { reproducao: '' } }).textos.reproducao).toBe('')
    expect(completarConfig({ textos: {} }).textos.reproducao).toBe(TEXTOS_PADRAO.reproducao)
    expect(completarConfig(null).textos.reproducao).toBe(TEXTOS_PADRAO.reproducao)
  })

  it('não altera o objeto gravado', () => {
    const salva = { textos: { reproducao: REPRODUCAO_ANTIGA } }
    completarConfig(salva)
    expect(salva.textos.reproducao).toBe(REPRODUCAO_ANTIGA)
  })
})

describe('textos de fábrica do certificado até a 1.0.1 (mais longos)', () => {
  const chaves = Object.keys(TEXTOS_ANTIGOS) as Array<keyof TextosCertificado>

  it('cada texto antigo, sem mudança, vira o novo, mais curto (certificado em 2 páginas)', () => {
    expect(chaves).toEqual(
      expect.arrayContaining([
        'incerteza',
        'abrangencia',
        'controleLegal',
        'intervalo',
        'rastreabilidade',
        'procedimentoDescricao',
      ]),
    )
    const salva = { textos: Object.fromEntries(chaves.map((k) => [k, TEXTOS_ANTIGOS[k]])) }
    const c = completarConfig(JSON.parse(JSON.stringify(salva)))
    for (const k of chaves) {
      expect(c.textos[k], k).toBe(TEXTOS_PADRAO[k])
      expect(TEXTOS_PADRAO[k].length, k).toBeLessThan(TEXTOS_ANTIGOS[k]!.length)
    }
    // Com espaços e quebras de linha sobrando, também é o antigo
    const comEspacos = TEXTOS_ANTIGOS.intervalo!.replace('. A definição', '.\n  A definição')
    expect(completarConfig({ textos: { intervalo: ` ${comEspacos} ` } }).textos.intervalo).toBe(TEXTOS_PADRAO.intervalo)
  })

  it('os novos dizem o que a norma pede, sem a frase da correção do erro nem a recomendação longa', () => {
    expect(TEXTOS_PADRAO.incerteza).toContain('fator de abrangência k')
    expect(TEXTOS_PADRAO.incerteza).toContain('aproximadamente 95 %')
    expect(TEXTOS_PADRAO.incerteza).not.toContain('corrigido')
    expect(TEXTOS_PADRAO.abrangencia).toContain('referem-se exclusivamente ao instrumento calibrado')
    expect(TEXTOS_PADRAO.controleLegal).toContain('Portaria Inmetro nº 157/2022')
    expect(TEXTOS_PADRAO.intervalo).toContain('não contém recomendação de intervalo de calibração')
    expect(TEXTOS_PADRAO.intervalo.length).toBeLessThan(120)
    expect(TEXTOS_PADRAO.rastreabilidade).toContain('acreditado(s) pela Cgcre/Inmetro para as respectivas calibrações')
  })

  it('o texto mudado pela empresa (ou apagado) fica como está', () => {
    const proprio = 'A incerteza expandida (U) corresponde a 95 %.'
    const c = completarConfig({ textos: { incerteza: proprio, abrangencia: '', intervalo: `${TEXTOS_ANTIGOS.intervalo} Fim.` } })
    expect(c.textos.incerteza).toBe(proprio)
    expect(c.textos.abrangencia).toBe('')
    expect(c.textos.intervalo).toBe(`${TEXTOS_ANTIGOS.intervalo} Fim.`)
    // Sem o campo, o padrão novo
    expect(completarConfig({ textos: {} }).textos.controleLegal).toBe(TEXTOS_PADRAO.controleLegal)
  })
})

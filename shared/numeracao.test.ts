// Nº do certificado: formatado pela configuração da numeração e lido de volta (o nº impresso numa folha de
// campo que volta da pasta precisa voltar ao registro com o ano e a sequência).

import { describe, expect, it } from 'vitest'
import { formatarNumeroCertificado, lerNumeroCertificado } from './dominio.ts'

describe('numeração dos certificados', () => {
  it('lê o ano e a sequência do nº formatado, em qualquer formato', () => {
    const padrao = { formato: 'CC-{ano}-{seq}', digitos: 5 }
    expect(formatarNumeroCertificado(padrao, 42, 2026)).toBe('CC-2026-00042')
    expect(lerNumeroCertificado(padrao, 'CC-2026-00042', 1999)).toEqual({ ano: 2026, sequencia: 42 })
    expect(lerNumeroCertificado({ formato: '{seq}/{aa}', digitos: 4 }, '0007/27', 2026)).toEqual({ ano: 2027, sequencia: 7 })
    // Sem o ano no formato: o da folha
    expect(lerNumeroCertificado({ formato: 'BC.{seq}', digitos: 3 }, 'BC.120', 2026)).toEqual({ ano: 2026, sequencia: 120 })
    // Formato sem {seq} sai como "{seq}/{ano}", e é lido igual
    const semSeq = { formato: 'X', digitos: 3 }
    expect(lerNumeroCertificado(semSeq, formatarNumeroCertificado(semSeq, 5, 2026), 2000)).toEqual({ ano: 2026, sequencia: 5 })
  })

  it('o nº fora do formato (formato mudado depois, revisão, texto qualquer): null', () => {
    const padrao = { formato: 'CC-{ano}-{seq}', digitos: 5 }
    expect(lerNumeroCertificado(padrao, '0042/2026', 2026)).toBeNull()
    expect(lerNumeroCertificado(padrao, 'CC-2026-00042-R1', 2026)).toBeNull()
    expect(lerNumeroCertificado(padrao, 'CC-2026-00000', 2026)).toBeNull()
    expect(lerNumeroCertificado(padrao, '', 2026)).toBeNull()
    // Os caracteres especiais do formato valem como texto
    expect(lerNumeroCertificado({ formato: '{seq}.{ano}', digitos: 2 }, '12x2026', 2026)).toBeNull()
    expect(lerNumeroCertificado({ formato: '{seq}.{ano}', digitos: 2 }, '12.2026', 2026)).toEqual({ ano: 2026, sequencia: 12 })
  })
})

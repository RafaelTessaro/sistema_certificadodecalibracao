import { describe, expect, it } from 'vitest'
import { dataDaFolha, TEXTO_FOLHA_NOVA, textoReimprimir } from './folhaCampo'

describe('textos da folha de campo', () => {
  it('reimprimir diz o nº e o dia da primeira impressão (o mesmo nº é o mesmo papel)', () => {
    expect(textoReimprimir({ numero: 'FC-2026-00042', impressaEm: '2026-10-21T15:00:00.000Z' })).toBe(
      'Reimprimir a folha FC-2026-00042 (igual à impressa em 21/10/2026)',
    )
    expect(TEXTO_FOLHA_NOVA).toBe('Imprimir folha nova com os dados atuais')
  })

  it('data inválida não quebra o texto', () => {
    expect(dataDaFolha('')).toBe('—')
    expect(dataDaFolha('ontem')).toBe('—')
  })
})

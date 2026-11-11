import { describe, expect, it } from 'vitest'
import { x509Pki } from './__fixtures__/pki.ts'
import { opcoesCertificadoDigitalDeTeste } from './ambienteTeste.ts'

/** Chama com o ambiente dado e junta os avisos. */
async function opcoes(env: NodeJS.ProcessEnv) {
  const avisos: string[] = []
  const r = await opcoesCertificadoDigitalDeTeste(env, (m) => avisos.push(m))
  return { r, avisos }
}

describe('opções de teste do certificado digital pelo ambiente (só para a conferência de ponta a ponta)', () => {
  it('sem as variáveis: nada (valem as raízes ICP-Brasil e o relógio do computador), sem aviso', async () => {
    expect(await opcoes({ NODE_ENV: 'test' })).toEqual({ r: undefined, avisos: [] })
    expect(await opcoes({ NODE_ENV: 'production', BC_PKI_TESTE: '0' })).toEqual({ r: undefined, avisos: [] })
  })

  it('fora de NODE_ENV=test (o serviço do instalador define production) as variáveis são ignoradas, com aviso', async () => {
    for (const NODE_ENV of ['production', 'development', undefined]) {
      const { r, avisos } = await opcoes({ NODE_ENV, BC_PKI_TESTE: '1', BC_RELOGIO_TESTE: '2047-01-02T00:00:00Z' })
      expect(r).toBeUndefined()
      expect(avisos).toEqual(['Aviso: BC_PKI_TESTE e BC_RELOGIO_TESTE foram ignoradas: só valem nos testes (NODE_ENV=test).'])
    }
  })

  it('com NODE_ENV=test: só a raiz da PKI de teste como lista de confiança', async () => {
    const { r, avisos } = await opcoes({ NODE_ENV: 'test', BC_PKI_TESTE: '1' })
    expect(r?.raizes?.map((c) => c.fingerprint256)).toEqual([x509Pki('raiz').fingerprint256])
    expect(r?.agora).toBeUndefined()
    expect(avisos[0]).toMatch(/modo de teste .*Nunca use isso num servidor de verdade\.$/)
  })

  it('BC_RELOGIO_TESTE: o relógio do certificado digital parte da data pedida e anda; data inválida é ignorada', async () => {
    const { r } = await opcoes({ NODE_ENV: 'test', BC_RELOGIO_TESTE: '2047-01-02T12:00:00Z' })
    expect(r?.raizes).toBeUndefined()
    const t = r!.agora!().getTime()
    expect(Math.abs(t - Date.parse('2047-01-02T12:00:00Z'))).toBeLessThan(5_000)
    const invalida = await opcoes({ NODE_ENV: 'test', BC_RELOGIO_TESTE: 'amanhã' })
    expect(invalida.r?.agora).toBeUndefined()
    expect(invalida.avisos[0]).toMatch(/BC_RELOGIO_TESTE=amanhã não é uma data/)
  })
})

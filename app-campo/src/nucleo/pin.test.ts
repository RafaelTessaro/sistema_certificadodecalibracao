import { describe, expect, it } from 'vitest'
import {
  conferirPin,
  criarHashPin,
  esperaRestante,
  lerHashPin,
  lerTentativas,
  pareamentoApagaPin,
  pinValido,
  registrarAcertoPin,
  registrarErroPin,
  semTentativas,
  textoDaEspera,
} from './pin.ts'

describe('PIN do técnico', () => {
  it('guarda só o PBKDF2 (com sal novo a cada vez) e confere', async () => {
    const h = await criarHashPin('482915', { iteracoes: 1000 })
    expect(h).toMatchObject({ versao: 1, iteracoes: 1000 })
    expect(JSON.stringify(h)).not.toContain('482915')
    expect(await conferirPin('482915', h)).toBe(true)
    expect(await conferirPin('482916', h)).toBe(false)
    expect(await conferirPin('48291', h)).toBe(false)
    const outro = await criarHashPin('482915', { iteracoes: 1000 })
    expect(outro.sal).not.toBe(h.sal)
    expect(outro.hash).not.toBe(h.hash)
    expect(lerHashPin(JSON.stringify(h))).toEqual(h)
    expect(lerHashPin('{')).toBeNull()
    expect(lerHashPin(null)).toBeNull()
  })

  it('parear de novo: o mesmo técnico mantém o PIN; outro técnico ou "Esqueci o PIN" pedem um PIN novo', () => {
    expect(pareamentoApagaPin({ tecnicoAnterior: 'tec-a', tecnicoNovo: 'tec-a' })).toBe(false)
    expect(pareamentoApagaPin({ esqueciPin: true, tecnicoAnterior: 'tec-a', tecnicoNovo: 'tec-a' })).toBe(true)
    // O celular da empresa passou para outro técnico: o PIN do anterior não assina pelo novo
    expect(pareamentoApagaPin({ tecnicoAnterior: 'tec-a', tecnicoNovo: 'tec-b' })).toBe(true)
    expect(pareamentoApagaPin({ tecnicoAnterior: null, tecnicoNovo: 'tec-b' })).toBe(true)
  })

  it('o PIN tem 6 dígitos', async () => {
    expect(pinValido('123456')).toBe(true)
    expect(pinValido('12345')).toBe(false)
    expect(pinValido('12345a')).toBe(false)
    await expect(criarHashPin('1234')).rejects.toThrow(/6 dígitos/)
  })

  it('5 erros seguidos: espera 30 s; cada erro depois dobra a espera; acertar zera', () => {
    let t = semTentativas()
    const agora = 1_000_000
    for (let i = 0; i < 4; i++) t = registrarErroPin(t, agora)
    expect(esperaRestante(t, agora)).toBe(0)
    t = registrarErroPin(t, agora)
    expect(esperaRestante(t, agora)).toBe(30_000)
    expect(textoDaEspera(esperaRestante(t, agora))).toBe('Muitos erros. Espere 30 s para tentar de novo.')
    t = registrarErroPin(t, agora + 30_000)
    expect(esperaRestante(t, agora + 30_000)).toBe(60_000)
    t = registrarErroPin(t, agora + 90_000)
    expect(esperaRestante(t, agora + 90_000)).toBe(120_000)
    expect(textoDaEspera(120_000)).toBe('Muitos erros. Espere 2 min para tentar de novo.')
    // Até 30 min
    for (let i = 0; i < 20; i++) t = registrarErroPin(t, agora)
    expect(t.ultimaEsperaMs).toBe(30 * 60_000)
    t = registrarAcertoPin()
    expect(t).toEqual(semTentativas())
    expect(lerTentativas(JSON.stringify({ erros: 2, bloqueadoAte: 5, ultimaEsperaMs: 0 }))).toEqual({
      erros: 2,
      bloqueadoAte: 5,
      ultimaEsperaMs: 0,
    })
    expect(lerTentativas('lixo')).toEqual(semTentativas())
  })
})

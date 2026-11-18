import { describe, expect, it } from 'vitest'
import {
  bytesUtf8,
  calcularConteudoSha256,
  calcularSha256Pacote,
  calcularSha256Registro,
  conteudoAssinado,
  jsonCanonico,
  REGEX_SHA256,
  sha256DoValor,
  sha256Hex,
  sha256WebCrypto,
} from './canonico.ts'
import { pacotePlataforma, registroPlataforma } from './exemplos.ts'

describe('jsonCanonico', () => {
  it('ordena as chaves em todos os níveis, sem espaços', () => {
    expect(jsonCanonico({ b: 1, a: { d: [3, { z: true, y: null }], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}',
    )
  })

  it('é estável: a ordem em que as chaves foram criadas não muda o texto', () => {
    const a = { numero: 'FC-2026-00042', passos: { final: { termino: '', dataCalibracao: '' } }, envioId: 'e1' }
    const b = { envioId: 'e1', passos: { final: { dataCalibracao: '', termino: '' } }, numero: 'FC-2026-00042' }
    expect(jsonCanonico(a)).toBe(jsonCanonico(b))
    // E sobrevive a uma ida e volta pelo JSON (o que o HTTP nativo do Android faz com o corpo)
    expect(jsonCanonico(JSON.parse(JSON.stringify(b)))).toBe(jsonCanonico(a))
  })

  it('segue o JSON.stringify nos escapes, no undefined e no -0', () => {
    const valor = { texto: 'Açougue "2"\n\\ 🙂 ', vazio: undefined, lista: [undefined, 1], zero: -0, inteiro: 1e21 }
    expect(JSON.parse(jsonCanonico(valor))).toEqual(JSON.parse(JSON.stringify(valor)))
    expect(jsonCanonico(valor)).toBe('{"inteiro":1e+21,"lista":[null,1],"texto":"Açougue \\"2\\"\\n\\\\ 🙂 ","zero":0}')
    expect(jsonCanonico('a b')).toBe(JSON.stringify('a b'))
  })

  it('recusa número não finito e bigint', () => {
    expect(() => jsonCanonico({ x: Number.NaN })).toThrow()
    expect(() => jsonCanonico([Infinity])).toThrow()
    expect(() => jsonCanonico({ x: 10n })).toThrow()
  })

  it('conta os bytes em UTF-8', () => {
    expect(bytesUtf8('abc')).toBe(3)
    expect(bytesUtf8('ç')).toBe(2)
    expect(bytesUtf8('🙂')).toBe(4)
  })
})

describe('sha256Hex (TypeScript puro)', () => {
  it('confere com os vetores do FIPS 180-4', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  })

  it('dá o mesmo que o WebCrypto, inclusive com acentos, emojis e nos limites dos blocos', async () => {
    const textos = [
      'Folha de campo FC-2026-00042 · Açougue 2 · 🙂',
      'x'.repeat(55),
      'x'.repeat(56),
      'x'.repeat(63),
      'x'.repeat(64),
      'ç'.repeat(1000),
    ]
    for (const t of textos) expect(sha256Hex(t)).toBe(await sha256WebCrypto(t))
    const registro = jsonCanonico(registroPlataforma())
    expect(sha256Hex(registro)).toBe(await sha256WebCrypto(registro))
  })
})

describe('sha256 do pacote e do registro', () => {
  it('com a função síncrona devolve um texto; com a assíncrona, uma promessa com o mesmo valor', async () => {
    const r = registroPlataforma()
    const sincrono = calcularSha256Registro(r, sha256Hex)
    expect(sincrono).toMatch(REGEX_SHA256)
    await expect(calcularSha256Registro(r, sha256WebCrypto)).resolves.toBe(sincrono)
    // A função injetada pode devolver maiúsculas (algumas bibliotecas): sai sempre em minúsculas
    expect(sha256DoValor({ a: 1 }, (t) => sha256Hex(t).toUpperCase())).toBe(sha256Hex('{"a":1}'))
    expect(calcularSha256Pacote(pacotePlataforma(), sha256Hex)).toMatch(REGEX_SHA256)
  })

  it('o conteúdo assinado é o registro sem as assinaturas e sem as correções depois delas', () => {
    const r = registroPlataforma()
    const conteudo = conteudoAssinado(r)
    expect(conteudo).not.toHaveProperty('assinaturas')
    expect(conteudo).not.toHaveProperty('correcoesPosAssinatura')
    expect(Object.keys(conteudo).length).toBe(Object.keys(r).length - 2)
    // As assinaturas do exemplo amarram o conteúdo
    expect(r.assinaturas.tecnico?.conteudoSha256).toBe(calcularConteudoSha256(r, sha256Hex))
  })

  it('a correção depois da assinatura muda o sha256 do registro, não o conteúdo assinado', () => {
    const r = registroPlataforma()
    const antes = { registro: calcularSha256Registro(r, sha256Hex), conteudo: calcularConteudoSha256(r, sha256Hex) }
    r.correcoesPosAssinatura.push({ ...r.correcoesPosAssinatura[0], para: '100,05' })
    expect(calcularSha256Registro(r, sha256Hex)).not.toBe(antes.registro)
    expect(calcularConteudoSha256(r, sha256Hex)).toBe(antes.conteudo)
    // Mudar uma leitura muda os dois
    r.passos.indicacao.pontos[1].crescente!.valor = '1,05'
    expect(calcularConteudoSha256(r, sha256Hex)).not.toBe(antes.conteudo)
  })
})

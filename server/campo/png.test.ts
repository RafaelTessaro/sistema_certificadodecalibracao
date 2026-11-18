// A assinatura do celular conferida antes de ir para o pdfkit (server/campo/png.ts): passam as do canvas (RGBA) e as dos
// exemplos (com paleta); os PNGs com o cabeçalho certo e os dados estragados, que derrubariam o servidor no png-js, não.

import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { validarPng } from '#shared/campo/registro.ts'
import { ASSINATURA_EXEMPLO_1, ASSINATURA_EXEMPLO_2 } from '../pdf/assinaturasExemplo.ts'
import {
  blocoPng,
  ihdrPng,
  linhasPng,
  pngDeBlocos,
  pngRgbaComTextoGrande,
  pngRgbaFiltroInvalido,
  pngRgbaIdatQueNaoEZlib,
  pngRgbaValido,
} from './__fixtures__/pngTeste.ts'
import { pngDecodificavel } from './png.ts'

const idat = (largura: number, altura: number, canais: number) =>
  blocoPng('IDAT', deflateSync(linhasPng(largura, altura, canais)))

describe('pngDecodificavel', () => {
  it('as assinaturas dos exemplos (paleta) e a do canvas (RGBA, RGB, cinza) passam', () => {
    expect(pngDecodificavel(ASSINATURA_EXEMPLO_1)).toBe(true)
    expect(pngDecodificavel(ASSINATURA_EXEMPLO_2)).toBe(true)
    expect(pngDecodificavel(pngRgbaValido())).toBe(true)
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, cor: 2 }), idat(80, 30, 3)]))).toBe(true)
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, cor: 0 }), idat(80, 30, 1)]))).toBe(true)
    // O IDAT em vários blocos
    const dados = deflateSync(linhasPng(80, 30, 4))
    const partes = [blocoPng('IDAT', dados.subarray(0, 10)), blocoPng('IDAT', dados.subarray(10))]
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30 }), ...partes]))).toBe(true)
  })

  it('cabeçalho certo e dados estragados: não passa (o validarPng, que só olha o cabeçalho, deixaria)', () => {
    for (const png of [pngRgbaIdatQueNaoEZlib(), pngRgbaFiltroInvalido()]) {
      expect(validarPng(png)).toBeNull()
      expect(pngDecodificavel(png)).toBe(false)
    }
    const ihdr = ihdrPng({ largura: 80, altura: 30 })
    // Linhas a menos ou a mais que o IHDR diz
    expect(pngDecodificavel(pngDeBlocos([ihdr, idat(80, 29, 4)]))).toBe(false)
    expect(pngDecodificavel(pngDeBlocos([ihdr, idat(80, 31, 4)]))).toBe(false)
    // Sem IDAT, sem IEND, cortado no meio de um bloco
    expect(pngDecodificavel(pngDeBlocos([ihdr]))).toBe(false)
    expect(pngDecodificavel(pngDeBlocos([ihdr, idat(80, 30, 4)], { semFim: true }))).toBe(false)
    const inteiro = Buffer.from(pngDeBlocos([ihdr, idat(80, 30, 4)]).split(',')[1], 'base64')
    const cortado = inteiro.subarray(0, inteiro.length - 20)
    const b64 = cortado.subarray(0, cortado.length - (cortado.length % 3)).toString('base64')
    expect(pngDecodificavel(`data:image/png;base64,${b64}`)).toBe(false)
    // Um bloco de tamanho "negativo" (o png-js entraria em laço) e um que passa do fim
    expect(pngDecodificavel(pngDeBlocos([ihdr, blocoPng('tEXt', Buffer.alloc(4), 0xfffffff4), idat(80, 30, 4)]))).toBe(false)
    expect(pngDecodificavel(pngDeBlocos([ihdr, blocoPng('tEXt', Buffer.alloc(4), 4000), idat(80, 30, 4)]))).toBe(false)
  })

  it('tEXt grande não passa (o png-js estoura a pilha ao ler o texto); o pequeno, sim', () => {
    const grande = pngRgbaComTextoGrande()
    expect(validarPng(grande)).toBeNull()
    expect(pngDecodificavel(grande)).toBe(false)
    // Sem o NUL, a chave fica com o bloco quase inteiro: o limite é o mesmo
    const semNul = blocoPng('tEXt', Buffer.alloc(200_000, 0x61))
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30 }), semNul, idat(80, 30, 4)]))).toBe(false)
    const pequeno = blocoPng('tEXt', Buffer.from('k\0abc', 'latin1'))
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30 }), pequeno, idat(80, 30, 4)]))).toBe(true)
  })

  it('só o PNG simples: 8 bits, sem entrelaçamento, a paleta e o tRNS só no tipo 3', () => {
    const corpo = idat(80, 30, 4)
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, entrelacamento: 1 }), corpo]))).toBe(false)
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, bits: 16 }), corpo]))).toBe(false)
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, cor: 5 }), corpo]))).toBe(false)
    // tRNS com o canal alfa: o png-js não pula o bloco e se perde
    const trns = blocoPng('tRNS', Buffer.alloc(6))
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30 }), trns, corpo]))).toBe(false)
    // tRNS no RGB e no cinza: o pdfkit monta a máscara errada (12 números no RGB; no cinza, o byte alto, que esconde o
    // preto e apaga o traço da assinatura)
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, cor: 2 }), trns, idat(80, 30, 3)]))).toBe(false)
    const trnsCinza = blocoPng('tRNS', Buffer.from([0x00, 0xff]))
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, cor: 0 }), trnsCinza, idat(80, 30, 1)]))).toBe(false)
    // Paleta: obrigatória no tipo 3, recusada nos outros
    const plte = blocoPng('PLTE', Buffer.alloc(6, 0xff))
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, cor: 3 }), idat(80, 30, 1)]))).toBe(false)
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30, cor: 3 }), plte, idat(80, 30, 1)]))).toBe(true)
    // tRNS na paleta: até um por cor
    const ihdr3 = ihdrPng({ largura: 80, altura: 30, cor: 3 })
    const trnsCurto = blocoPng('tRNS', Buffer.from([0x00]))
    expect(pngDecodificavel(pngDeBlocos([ihdr3, plte, trnsCurto, idat(80, 30, 1)]))).toBe(true)
    const trnsLongo = blocoPng('tRNS', Buffer.from([0x00, 0xff, 0x80]))
    expect(pngDecodificavel(pngDeBlocos([ihdr3, plte, trnsLongo, idat(80, 30, 1)]))).toBe(false)
    expect(pngDecodificavel(pngDeBlocos([ihdrPng({ largura: 80, altura: 30 }), plte, corpo]))).toBe(false)
    // O que nem é PNG
    expect(pngDecodificavel('data:image/png;base64,AAAA')).toBe(false)
    expect(pngDecodificavel(null)).toBe(false)
  })
})

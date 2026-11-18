import { describe, expect, it } from 'vitest'
import {
  APARELHO_EXEMPLO,
  pacoteClasseI,
  pacoteDoCliente,
  pacotePlataforma,
  pacoteRodoviaria,
  TECNICO_EXEMPLO,
} from '../../../shared/campo/exemplos.ts'
import { registroInicial } from '../../../shared/campo/registro.ts'
import type { PacoteCampo } from '../../../shared/campo/tipos.ts'
import { rotuloDoCampo } from './rotulos.ts'
import {
  cargaDoPonto,
  colunasDaIndicacao,
  contagem,
  leiturasPrevistas,
  ordemExcentricidade,
  ordemIndicacao,
  ordemRepetibilidade,
  pontoComDescida,
  primeiroVazio,
  proximoCampo,
  textoCargaPrevista,
} from './ordem.ts'

const AGORA = '2026-11-18T08:00:00-03:00'
const registro = (p: PacoteCampo) => registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: AGORA })

describe('ordem física da "Próxima"', () => {
  it('erro de indicação: sobe até Max e desce a partir do ponto mais alto (sem o zero e sem a virada em Max)', () => {
    const p = pacotePlataforma()
    const r = registro(p)
    const ordem = ordemIndicacao(r, p)
    const pontos = r.passos.indicacao.pontos
    const max = p.plano!.max
    const cargas = p.plano!.pontos.map((x) => x.carga)
    expect(colunasDaIndicacao(p)).toEqual({ sobe: true, desce: true })
    // Subida: todos, da menor carga para a maior
    const subida = ordem.filter((c) => c.endsWith('.crescente'))
    expect(subida).toEqual(pontos.map((x) => `indicacao.pontos.${x.id}.crescente`))
    expect([...cargas].sort((a, b) => a - b)).toEqual(cargas)
    // Descida: do maior para o menor, sem o zero e sem Max
    const descida = ordem.filter((c) => c.endsWith('.decrescente'))
    const esperada = pontos
      .filter((_, i) => cargas[i] > 0 && cargas[i] < max)
      .reverse()
      .map((x) => `indicacao.pontos.${x.id}.decrescente`)
    expect(descida).toEqual(esperada)
    expect(ordem.indexOf(descida[0])).toBe(subida.length)
    expect(ordem.at(-1)).toBe('indicacao.retornoZero')
    expect(pontoComDescida(pontos[0], r, p)).toBe(false)
    expect(pontoComDescida(pontos.at(-1)!, r, p)).toBe(cargas.at(-1)! < max)
  })

  it('rodoviária: as etapas de substituição entram intercaladas, na ordem em que são feitas', () => {
    const p = pacoteRodoviaria()
    const r = registro(p)
    const ordem = ordemIndicacao(r, p)
    const etapas = r.passos.indicacao.substituicao!.etapas
    expect(etapas.length).toBeGreaterThan(0)
    for (const [k] of etapas.entries()) {
      const iPadroes = ordem.indexOf(`indicacao.substituicao.etapas.${k}.padroes`)
      expect(ordem[iPadroes + 1]).toBe(`indicacao.substituicao.etapas.${k}.substituicao`)
      // Antes da etapa k: os pontos de nível ≤ k; depois: os de nível > k
      for (const pt of r.passos.indicacao.pontos) {
        const i = ordem.indexOf(`indicacao.pontos.${pt.id}.crescente`)
        if (pt.nivelSubstituicao <= k) expect(i).toBeLessThan(iPadroes)
        else expect(i).toBeGreaterThan(iPadroes)
      }
    }
    expect(ordem.at(-1)).toBe('indicacao.retornoZero')
  })

  it('classe I: crescente com descarga (sem descida); excentricidade com o zero antes de cada posição', () => {
    const p = pacoteClasseI()
    const r = registro(p)
    expect(colunasDaIndicacao(p)).toEqual({ sobe: true, desce: false })
    expect(ordemIndicacao(r, p).some((c) => c.endsWith('.decrescente'))).toBe(false)
    const exc = ordemExcentricidade(r, p)
    expect(exc.slice(0, 2)).toEqual(['excentricidade.posicoes.0.zeroAntes', 'excentricidade.posicoes.0.leitura'])
    expect(exc).toHaveLength(r.passos.excentricidade.posicoes.length * 2)
    // 10 leituras na repetibilidade (POP, Tabela 4)
    const rep = r.passos.repetibilidade[0]
    expect(leiturasPrevistas(r, p, rep.id)).toBe(10)
  })

  it('repetibilidade: as leituras previstas de cada ensaio, uma série depois da outra; mais leituras entram na ordem', () => {
    const p = pacotePlataforma()
    const r = registro(p)
    const ordem = ordemRepetibilidade(r, p)
    const total = r.passos.repetibilidade.reduce((s, x) => s + leiturasPrevistas(r, p, x.id), 0)
    expect(ordem).toHaveLength(total)
    const id = r.passos.repetibilidade[0].id
    expect(ordem[0]).toBe(`repetibilidade.${id}.leituras.0`)
    const n = leiturasPrevistas(r, p, id)
    r.passos.repetibilidade[0].leituras = Array.from({ length: n + 1 }, () => ({
      valor: '150,00',
      em: AGORA,
      via: 'teclado' as const,
    }))
    expect(ordemRepetibilidade(r, p).filter((c) => c.startsWith(`repetibilidade.${id}.`))).toHaveLength(n + 1)
  })

  it('excentricidade não aplicável (ou ainda a confirmar): nenhuma leitura na ordem', () => {
    const p = pacotePlataforma()
    const r = registro(p)
    r.passos.excentricidade.aplicavel = false
    expect(ordemExcentricidade(r, p)).toEqual([])
    r.passos.excentricidade.aplicavel = null
    expect(ordemExcentricidade(r, p)).toEqual([])
  })

  it('folha só do cliente: sem plano, os pontos acrescentados no local entram pela carga', () => {
    const p = pacoteDoCliente()
    const r = registro(p)
    expect(ordemIndicacao(r, p)).toEqual(['indicacao.retornoZero'])
    const ponto = (id: string, carga: string) => ({
      id,
      acrescentado: true,
      cargaPrevista: '',
      cargaAplicada: { valor: carga, em: AGORA, via: 'teclado' as const },
      pecas: [],
      pecasTrocadas: false,
      nivelSubstituicao: 0,
      crescente: null,
      decrescente: null,
    })
    r.passos.indicacao.pontos.push(ponto('cel-b', '20'), ponto('cel-a', '10'), ponto('cel-0', '0'))
    expect(ordemIndicacao(r, p).filter((c) => c.endsWith('crescente') && !c.endsWith('decrescente'))).toEqual([
      'indicacao.pontos.cel-0.crescente',
      'indicacao.pontos.cel-a.crescente',
      'indicacao.pontos.cel-b.crescente',
    ])
  })

  it('unidade vista diferente da do cadastro (t ou g): as cargas na unidade vista; a descida entre zero e Max continua', () => {
    const p = pacotePlataforma()
    const r = registro(p)
    const unidade = r.passos.balanca.conferencias.find((x) => x.campo === 'balanca.unidade')!
    const pontos = r.passos.indicacao.pontos
    const max = p.plano!.max
    const cargas = p.plano!.pontos.map((x) => x.carga)
    const comDescida = cargas.map((x) => x > 0 && x < max)
    expect(p.balanca!.unidade).toBe('kg')
    expect(pontos.map((x) => pontoComDescida(x, r, p))).toEqual(comDescida)
    const descidas = ordemIndicacao(r, p).filter((c) => c.endsWith('.decrescente'))
    const i100 = cargas.indexOf(100)
    const id100 = pontos[i100].id
    expect(rotuloDoCampo(r, p, `indicacao.pontos.${id100}.crescente`)).toBe(`Ponto ${i100 + 1} ↑ · 100,00 kg`)

    // "Algo diferente…": t
    Object.assign(unidade, { confere: false, observado: 't' })
    expect(pontos.map((x) => pontoComDescida(x, r, p))).toEqual(comDescida)
    expect(ordemIndicacao(r, p).filter((c) => c.endsWith('.decrescente'))).toEqual(descidas)
    expect(cargaDoPonto(pontos[i100], r, p)).toBe(0.1)
    expect(textoCargaPrevista(pontos[i100].cargaPrevista, r, p)).toBe('0,10000')
    expect(rotuloDoCampo(r, p, `indicacao.pontos.${id100}.crescente`)).toBe(`Ponto ${i100 + 1} ↑ · 0,10000 t`)
    // Uma carga digitada (já em t) entra na ordem no lugar dela, entre as previstas convertidas
    pontos.push({
      id: 'cel-x',
      acrescentado: true,
      cargaPrevista: '',
      cargaAplicada: { valor: '0,125', em: AGORA, via: 'teclado' },
      pecas: [],
      pecasTrocadas: false,
      nivelSubstituicao: 0,
      crescente: null,
      decrescente: null,
    })
    const subida = ordemIndicacao(r, p).filter((c) => c.endsWith('.crescente'))
    expect(subida.indexOf('indicacao.pontos.cel-x.crescente')).toBe(subida.indexOf(`indicacao.pontos.${id100}.crescente`) + 1)
    expect(pontoComDescida(pontos.at(-1)!, r, p)).toBe(true)
    pontos.pop()

    // "Algo diferente…": g (sem descida a mais em Max)
    Object.assign(unidade, { confere: false, observado: 'g' })
    expect(pontos.map((x) => pontoComDescida(x, r, p))).toEqual(comDescida)
    expect(textoCargaPrevista(pontos[i100].cargaPrevista, r, p)).toMatch(/^100\s000$/)
    expect(rotuloDoCampo(r, p, `indicacao.pontos.${id100}.decrescente`)).toMatch(
      new RegExp(`^Ponto ${i100 + 1} ↓ · 100\\s000 g$`),
    )
  })

  it('próxima, primeira em branco e a contagem', () => {
    const p = pacotePlataforma()
    const r = registro(p)
    const ordem = ordemIndicacao(r, p)
    expect(proximoCampo(ordem, ordem[0])).toBe(ordem[1])
    expect(proximoCampo(ordem, ordem.at(-1)!)).toBeNull()
    expect(primeiroVazio(r, ordem)).toBe(ordem[0])
    r.passos.indicacao.pontos[0].crescente = { valor: '0,00', em: AGORA, via: 'teclado' }
    expect(primeiroVazio(r, ordem)).toBe(ordem[1])
    expect(contagem(r, ordem)).toEqual({ feitas: 1, total: ordem.length })
  })
})

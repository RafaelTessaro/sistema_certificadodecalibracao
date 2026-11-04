// Servidor alinhado ao POP: a calibração nova (do zero, da última emitida ou "calibrar de novo") nasce com o método
// da excentricidade da classe (POP 7.10) e sem o modo de serviço (POP 7.6: combinado a cada visita), sem ajuste,
// reparo nem "como encontrado" (POP 7.8). O registro de antes (ajuste externo, "como encontrado", reparo,
// verificação preliminar "não") continua gravando, calculando e saindo no certificado como antes.

import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calibracaoVazia } from '#shared/dominio.ts'
import type { Calibracao, CalibracaoInput } from '#shared/tipos.ts'
import { cenarioCalibracao, criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'
import { planoConformeAoPop } from './rascunhos.ts'

let t: AppComLogin
let c: Awaited<ReturnType<typeof cenarioCalibracao>>

beforeEach(async () => {
  t = await criarAppComLogin()
  c = await cenarioCalibracao(t)
})
afterEach(async () => {
  await t.fechar()
})

const temPdftotext = !spawnSync('pdftotext', ['-v'], { stdio: 'ignore' }).error
const textoDoPdf = (pdf: Buffer) =>
  spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdf })
    .stdout.toString('utf8')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')

async function salvar(k: Calibracao, mudar: (k: CalibracaoInput) => CalibracaoInput): Promise<Calibracao> {
  const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
    cookie: t.cookieAdmin,
    payload: { ...mudar(k), versao: k.versao },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json().calibracao
}

async function pdfDe(k: Calibracao): Promise<string> {
  const r = await t.chamar('GET', `/api/calibracoes/${k.id}/pdf`, { cookie: t.cookieAdmin })
  expect(r.statusCode).toBe(200)
  return textoDoPdf(r.rawPayload)
}

describe('calibração nova conforme o POP', () => {
  it('da última emitida: excentricidade pelo método da classe e sem o modo de serviço (nova e "calibrar de novo")', async () => {
    // Certificado de antes: excentricidade pelo método 2 e leituras no modo de serviço
    const pronta = await salvar(await c.calibracaoPronta(), (k) => ({
      ...k,
      excentricidade: { ...k.excentricidade, metodo: 2 },
      opcoes: { ...k.opcoes, divisaoTeste: 0.001 },
    }))
    const r = await c.emitir(pronta)
    expect(r.statusCode, r.body).toBe(200)
    const emitida: Calibracao = r.json().calibracao
    expect([emitida.excentricidade.metodo, emitida.opcoes.divisaoTeste]).toEqual([2, 0.001])

    const { calibracao: nova } = (await c.criar('/api/calibracoes', { balancaId: c.balanca.id })) as { calibracao: Calibracao }
    expect(nova.excentricidade.metodo).toBe(1)
    expect(nova.opcoes.divisaoTeste).toBe(0)
    // O resto do plano continua o da última (posições, carga, pontos)
    expect(nova.excentricidade.posicoes.map((p) => p.rotulo)).toEqual(emitida.excentricidade.posicoes.map((p) => p.rotulo))
    expect(nova.excentricidade.carga).toBe(emitida.excentricidade.carga)
    expect(nova.indicacao.pontos.map((p) => p.carga)).toEqual(emitida.indicacao.pontos.map((p) => p.carga))
    expect(nova).toMatchObject({ ajuste: { realizado: 'NAO' }, comoEncontrado: null, reparo: { houve: false } })

    const { calibracao: denovo } = (await c.criar(`/api/calibracoes/${emitida.id}/recalibrar`, {})) as {
      calibracao: Calibracao
    }
    expect(denovo.excentricidade.metodo).toBe(1)
    expect(denovo.opcoes.divisaoTeste).toBe(0)
    expect(denovo).toMatchObject({ ajuste: { realizado: 'NAO' }, comoEncontrado: null, reparo: { houve: false } })

    // A revisão do certificado é a mesma visita: mantém o que foi feito
    const { calibracao: rev } = (await c.criar(`/api/calibracoes/${emitida.id}/revisar`, { motivo: 'Corrigir o endereço' })) as {
      calibracao: Calibracao
    }
    expect([rev.excentricidade.metodo, rev.opcoes.divisaoTeste]).toEqual([2, 0.001])
  })

  it('na classe I, o método 3 (zera antes de cada posição)', () => {
    const k = calibracaoVazia(undefined, 'III')
    const antes = { ...k, excentricidade: { ...k.excentricidade, metodo: 1 as const }, opcoes: { ...k.opcoes, divisaoTeste: 2 } }
    expect(planoConformeAoPop(antes, 'I').excentricidade.metodo).toBe(3)
    expect(planoConformeAoPop(antes, 'II').excentricidade.metodo).toBe(1)
    expect(planoConformeAoPop(antes, '').excentricidade.metodo).toBe(1)
    expect(planoConformeAoPop(antes, 'I').opcoes.divisaoTeste).toBe(0)
  })

  it.skipIf(!temPdftotext)('o certificado: "não foi realizado ajuste" e sem a linha da verificação preliminar', async () => {
    const k = await c.emitido()
    const t2 = await pdfDe(k)
    expect(t2).toContain('Ajuste: não foi realizado ajuste no instrumento')
    expect(t2).not.toContain('Verificação preliminar')
    expect(t2).not.toContain('Reparo:')
    expect(t2).not.toContain('como encontrado')
  })

  it.skipIf(!temPdftotext)('ajuste interno (CAL) antes dos ensaios: o certificado diz a verdade', async () => {
    const pronta = await salvar(await c.calibracaoPronta(), (k) => ({
      ...k,
      ajuste: { realizado: 'INTERNO', descricao: 'função CAL feita pelo cliente' },
    }))
    const r = await c.emitir(pronta)
    expect(r.statusCode, r.body).toBe(200)
    const texto = await pdfDe(r.json().calibracao)
    expect(texto).toContain(
      'antes da calibração foi realizado ajuste interno (automático) (função CAL feita pelo cliente). Os resultados referem-se ao instrumento após o ajuste (“como deixado”). O ajuste não faz parte da calibração.',
    )
    expect(texto).not.toContain('como encontrado')
  })
})

describe('registro de antes do POP (legado)', () => {
  /** Rascunho de uma versão anterior: ajuste externo com "como encontrado", reparo e pré-carga "não". */
  async function legado(): Promise<Calibracao> {
    return salvar(await c.calibracaoPronta(), (k) => ({
      ...k,
      ordemServico: 'OS-77',
      preliminar: { ...k.preliminar, preCarga: 'NAO' },
      ajuste: { realizado: 'EXTERNO', descricao: 'span com 20 kg' },
      comoEncontrado: {
        ...k.indicacao,
        retornoZero: 0.01,
        pontos: k.indicacao.pontos.map((p) => ({ ...p, crescente: (p.crescente ?? 0) + 0.02, decrescente: null })),
      },
      reparo: { houve: true, descricao: 'troca da célula', marcaReparo: 'MR-1', selosRetirados: 'A', selosColocados: 'B' },
    }))
  }

  it('grava e abre igual (nada é apagado), sem pendência nova', async () => {
    const k = await legado()
    const lido = (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
    expect(lido.calibracao.ajuste).toEqual({ realizado: 'EXTERNO', descricao: 'span com 20 kg' })
    expect(lido.calibracao.comoEncontrado.pontos.map((p: { crescente: number }) => p.crescente)).toEqual([0.02, 5.02, 10.02, 20.02, 30.03])
    expect(lido.calibracao.reparo).toMatchObject({ houve: true, marcaReparo: 'MR-1' })
    expect(lido.calibracao.preliminar.preCarga).toBe('NAO')
    expect(lido.pendencias).toEqual([])
  })

  it.skipIf(!temPdftotext)(
    'emite com o certificado de antes: ajuste externo, "como encontrado", reparo e preliminar',
    async () => {
      const r = await c.emitir(await legado())
      expect(r.statusCode, r.body).toBe(200)
      const texto = await pdfDe(r.json().calibracao)
      expect(texto).toContain('Verificação preliminar: item(ns) não atendido(s): pré-carga aplicada.')
      expect(texto).toContain('antes da calibração foi realizado ajuste externo, com peso padrão (span com 20 kg)')
      expect(texto).toContain('Resultados antes do ajuste em 5.4 (“como encontrado”) e depois dele em 5.3 (“como deixado”)')
      expect(texto).toContain('Erro de indicação — como encontrado (antes do ajuste)')
      expect(texto).toContain(
        'Reparo: o instrumento passou por reparo/manutenção (troca da célula) registrado(a) na Ordem de Serviço nº OS-77',
      )
    },
  )
})

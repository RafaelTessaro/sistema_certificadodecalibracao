// Validação da emissão pela API: os mínimos do POP e as leituras fora do esperado (pendências na calibração nova,
// avisos na revisão de certificado de antes), os padrões como valiam no dia da calibração (e os da emissão original
// na revisão), os valores do ambiente fora da faixa, as datas incoerentes, o técnico excluído e a balança cadastrada
// em dobro.

import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { AVISO_SEM_PRESSAO, BALANCA_VAZIA } from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Padrao } from '#shared/tipos.ts'
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

/** Espaços finos e inseparáveis dos números → espaço comum (para comparar textos). */
const sem = (x: string) => x.replace(/[   ]/g, ' ')

async function salvar(k: Calibracao, mudar: (k: CalibracaoInput) => CalibracaoInput) {
  const r = await t.chamar('PUT', `/api/calibracoes/${k.id}`, {
    cookie: t.cookieAdmin,
    payload: { ...mudar(k), versao: k.versao },
  })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as { calibracao: Calibracao; pendencias: string[] }
}
const detalhe = async (k: Calibracao) => (await t.chamar('GET', `/api/calibracoes/${k.id}`, { cookie: t.cookieAdmin })).json()
const pendenciasDe = async (k: Calibracao) => ((await detalhe(k)).pendencias as string[]).map(sem)
const paraRevisao = async (k: Calibracao) => {
  const atual = (await detalhe(k)).calibracao as Calibracao
  return t.chamar('POST', `/api/calibracoes/${k.id}/situacao`, {
    cookie: t.cookieAdmin,
    payload: { status: 'REVISAO', versao: atual.versao },
  })
}
const emitir = async (k: Calibracao) => c.emitir((await detalhe(k)).calibracao as Calibracao)
async function revisar(k: Calibracao, motivo = 'Corrigir o endereço do cliente') {
  return (await c.criar(`/api/calibracoes/${k.id}/revisar`, { motivo })).calibracao as Calibracao
}

// ---- Mínimos do POP (7.7 e 7.9, Tabela 4) ---------------------------------------------------------------

describe('mínimos do POP bloqueiam a emissão', () => {
  it('só o zero lido e 2 leituras de repetibilidade: pendências; a revisão e a emissão recusadas', async () => {
    const pronta = await c.calibracaoPronta()
    const { calibracao, pendencias } = await salvar(pronta, (k) => ({
      ...k,
      repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15.01] }],
      indicacao: {
        ...k.indicacao,
        pontos: k.indicacao.pontos.map((p) => (p.carga === 0 ? p : { ...p, crescente: null, decrescente: null })),
      },
    }))
    expect(pendencias.map(sem)).toEqual([
      'Erro de indicação: registre as leituras das cargas acima de zero (POP 7.7).',
      'Repetibilidade a 15,00 kg: 2 leituras; o mínimo é 5 (POP, Tabela 4; 3 só com carga ≥ 100 kg).',
    ])
    expect((await paraRevisao(calibracao)).statusCode).toBe(409)
    expect((await emitir(calibracao)).statusCode).toBe(409)
  })

  it('4 pontos lidos ou o método "Decrescente": pendência; com os 5 pontos e a subida, emite', async () => {
    const pronta = await c.calibracaoPronta()
    const quatro = await salvar(pronta, (k) => ({
      ...k,
      indicacao: { ...k.indicacao, pontos: k.indicacao.pontos.filter((p) => p.carga !== 20) },
    }))
    expect(quatro.pendencias.map(sem)).toEqual([
      'Erro de indicação: 4 pontos lidos; o POP pede no mínimo 5, contando o zero (7.7).',
    ])
    expect((await emitir(quatro.calibracao)).statusCode).toBe(409)
    const decrescente = await salvar(quatro.calibracao, (k) => ({
      ...k,
      indicacao: { ...pronta.indicacao, metodo: 'DECRESCENTE' },
    }))
    expect(decrescente.pendencias.map(sem)).toEqual([
      'Erro de indicação: a subida é obrigatória; troque o método “Decrescente” (POP 7.7).',
    ])
    expect((await emitir(decrescente.calibracao)).statusCode).toBe(409)
    const certo = await salvar(decrescente.calibracao, (k) => ({ ...k, indicacao: pronta.indicacao }))
    expect(certo.pendencias).toEqual([])
    expect((await emitir(certo.calibracao)).statusCode).toBe(200)
  })

  it('"crescente e decrescente" sem a descida de um ponto: pendência e emissão recusada; Max (a virada) só com a subida, não', async () => {
    const pronta = await c.calibracaoPronta()
    const semDescida = (cargas: number[]) => (k: CalibracaoInput) => ({
      ...k,
      indicacao: {
        ...k.indicacao,
        pontos: k.indicacao.pontos.map((p) => (cargas.includes(p.carga) ? { ...p, decrescente: null } : p)),
      },
    })
    const falta = await salvar(pronta, semDescida([10, 30]))
    expect(falta.pendencias.map(sem)).toEqual(['Erro de indicação: falta a leitura de descida em 10,00 kg (POP 7.7).'])
    expect((await paraRevisao(falta.calibracao)).statusCode).toBe(409)
    expect((await emitir(falta.calibracao)).statusCode).toBe(409)
    // A calibração já medida quando o sistema passou a seguir as regras (marcada pela migração): só o aviso, emite
    const atual = (await detalhe(falta.calibracao)).calibracao as Calibracao
    t.ctx.db
      .prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
      .run(JSON.stringify({ ...atual, minimosComoAviso: true }), atual.id)
    expect(await pendenciasDe(atual)).toEqual([])
    const r = await emitir(atual)
    expect(r.statusCode, r.body).toBe(200)
    // A revisão dele é a mesma visita: continua só com o aviso
    const rev = await revisar(r.json().calibracao as Calibracao)
    expect(await pendenciasDe(rev)).toEqual([])
    const { resultado } = calcularCalibracao(rev, c.balanca, [c.pesos])
    expect(resultado.avisos.map((a) => sem(a.mensagem))).toContain(
      'Erro de indicação “crescente e decrescente” sem a leitura de descida em 10,00 kg.',
    )
    expect((await emitir(rev)).statusCode).toBe(200)
  })

  it.skipIf(!temPdftotext)(
    'medida como "crescente contínuo" antes do método fixo pela classe: fica, sem pendência, e o certificado sai com ele',
    async () => {
      const pronta = await c.calibracaoPronta()
      const { calibracao, pendencias } = await salvar(pronta, (k) => ({
        ...k,
        indicacao: { ...k.indicacao, metodo: 'CONTINUO', pontos: k.indicacao.pontos.map((p) => ({ ...p, decrescente: null })) },
      }))
      expect(calibracao.indicacao.metodo).toBe('CONTINUO')
      expect(pendencias).toEqual([])
      const r = await emitir(calibracao)
      expect(r.statusCode, r.body).toBe(200)
      const emitida = r.json().calibracao as Calibracao
      expect(emitida.indicacao.metodo).toBe('CONTINUO')
      const pdf = await t.chamar('GET', `/api/calibracoes/${emitida.id}/pdf`, { cookie: t.cookieAdmin })
      expect(pdf.statusCode).toBe(200)
      const texto = sem(
        spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdf.rawPayload })
          .stdout.toString('utf8')
          .replace(/\s+/g, ' '),
      )
      expect(texto).toContain('Carregamento: cargas crescentes, sem descarregar entre os pontos.')
      expect(texto).not.toContain('decrescentes')
    },
  )

  it('revisão de um certificado emitido na 1.0.3 sem a descida (com as regras do POP): a descida que falta é só aviso', async () => {
    const r = await c.emitir(await c.calibracaoPronta())
    expect(r.statusCode, r.body).toBe(200)
    const emitida = r.json().calibracao as Calibracao
    // Gravado como a 1.0.3 emitia (a descida era opcional): 10 e 20 kg sem a descida
    const daEpoca: Calibracao = {
      ...emitida,
      indicacao: {
        ...emitida.indicacao,
        pontos: emitida.indicacao.pontos.map((p) => (p.carga === 10 || p.carga === 20 ? { ...p, decrescente: null } : p)),
      },
    }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(daEpoca), emitida.id)
    const rev = await revisar(emitida)
    expect(rev.regrasDoPop).toBe(true)
    expect(rev.descidaComoAviso).toBe(true)
    expect(await pendenciasDe(rev)).toEqual([])
    const { resultado } = calcularCalibracao(rev, c.balanca, [c.pesos])
    expect(resultado.avisos.map((a) => sem(a.mensagem))).toContain(
      'Erro de indicação “crescente e decrescente” sem a leitura de descida em 10,00 kg e 20,00 kg.',
    )
    // Os outros mínimos continuam pendências na revisão (só a descida é aviso)
    const sem5 = await salvar(rev, (k) => ({
      ...k,
      indicacao: { ...k.indicacao, pontos: k.indicacao.pontos.filter((p) => p.carga !== 5) },
    }))
    expect(sem5.pendencias.map(sem)).toEqual([
      'Erro de indicação: 4 pontos lidos; o POP pede no mínimo 5, contando o zero (7.7).',
    ])
    const volta = await salvar(sem5.calibracao, (k) => ({ ...k, indicacao: rev.indicacao }))
    expect(volta.calibracao.descidaComoAviso).toBe(true)
    const r1 = await emitir(volta.calibracao)
    expect(r1.statusCode, r1.body).toBe(200)
    // A revisão da revisão continua com a marca (a mesma visita); a de um certificado com todas as descidas segue a regra
    const r2 = r1.json().calibracao as Calibracao
    expect((await revisar(r2)).descidaComoAviso).toBe(true)
    const outra = await c.emitir(await c.calibracaoPronta())
    expect((await revisar(outra.json().calibracao as Calibracao)).descidaComoAviso).toBeUndefined()
  })

  it('revisão de um certificado emitido sem a pressão (opcional na classe III até a 1.0.4): a falta dela é só aviso', async () => {
    const r = await c.emitir(await c.calibracaoPronta())
    expect(r.statusCode, r.body).toBe(200)
    const emitida = r.json().calibracao as Calibracao
    // Gravado como a 1.0.4 emitia na classe III: sem a pressão e sem o barômetro
    const daEpoca: Calibracao = {
      ...emitida,
      padroesIds: [c.pesos.id],
      ambiente: { ...emitida.ambiente, pressao: null },
      emissao: { ...emitida.emissao!, padroes: emitida.emissao!.padroes.filter((p) => p.tipo !== 'BAROMETRO') },
    }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(daEpoca), emitida.id)
    const rev = await revisar(emitida)
    expect(rev.regrasDoPop).toBe(true)
    expect(rev.pressaoComoAviso).toBe(true)
    expect(await pendenciasDe(rev)).toEqual([])
    expect((await detalhe(rev)).avisos).toContain(AVISO_SEM_PRESSAO)
    const r1 = await emitir(rev)
    expect(r1.statusCode, r1.body).toBe(200)
    // A revisão da revisão continua com a marca (a mesma visita); a de um certificado com a pressão segue a regra
    expect((await revisar(r1.json().calibracao as Calibracao)).pressaoComoAviso).toBe(true)
    const outra = await c.emitir(await c.calibracaoPronta())
    const comPressao = await revisar(outra.json().calibracao as Calibracao)
    expect(comPressao.pressaoComoAviso).toBeUndefined()
    // Apagada a pressão na revisão dela: pendência
    const semPressao = await salvar(comPressao, (k) => ({ ...k, ambiente: { ...k.ambiente, pressao: null } }))
    expect(semPressao.pendencias.map(sem)).toEqual(['Registre a pressão atmosférica medida com o BR-90 (POP 7.5).'])
  })

  it('passada para "crescente e decrescente" depois das leituras ("Usar o método do POP"): a descida que falta impede a emissão, mesmo medida antes das regras', async () => {
    const pronta = await c.calibracaoPronta()
    // Medida como "crescente contínuo" e marcada pela migração (a visita já aconteceu)
    const continuo = await salvar(pronta, (k) => ({
      ...k,
      indicacao: { ...k.indicacao, metodo: 'CONTINUO', pontos: k.indicacao.pontos.map((p) => ({ ...p, decrescente: null })) },
    }))
    expect(continuo.pendencias).toEqual([])
    const atual = (await detalhe(continuo.calibracao)).calibracao as Calibracao
    t.ctx.db
      .prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
      .run(JSON.stringify({ ...atual, minimosComoAviso: true, descidaComoAviso: true }), atual.id)
    // A tela troca e guarda o método medido
    const trocada = await salvar(atual, (k) => ({
      ...k,
      indicacao: { ...k.indicacao, metodo: 'CRESCENTE_DECRESCENTE', metodoMedido: 'CONTINUO' },
    }))
    expect(trocada.calibracao.indicacao.metodoMedido).toBe('CONTINUO')
    expect(trocada.calibracao.minimosComoAviso).toBe(true)
    expect(trocada.pendencias.map(sem)).toEqual([
      'Erro de indicação: falta a leitura de descida em 5,00 kg, 10,00 kg e 20,00 kg (POP 7.7). Sem ela, volte para “Crescente contínuo”, o método com que a calibração foi começada.',
    ])
    expect((await emitir(trocada.calibracao)).statusCode).toBe(409)
    // Voltando para o medido: emite com ele
    const { metodoMedido: _medido, ...indicacao } = trocada.calibracao.indicacao
    const volta = await salvar(trocada.calibracao, (k) => ({ ...k, indicacao: { ...indicacao, metodo: 'CONTINUO' } }))
    expect(volta.calibracao.indicacao).not.toHaveProperty('metodoMedido')
    expect(volta.pendencias).toEqual([])
    const r = await emitir(volta.calibracao)
    expect(r.statusCode, r.body).toBe(200)
    expect((r.json().calibracao as Calibracao).indicacao.metodo).toBe('CONTINUO')
  })

  it('revisão de certificado emitido antes destas regras (4 pontos, 3 leituras, "Decrescente"): emite como na época', async () => {
    const r = await c.emitir(await c.calibracaoPronta())
    expect(r.statusCode, r.body).toBe(200)
    const emitida = r.json().calibracao as Calibracao
    // Gravado como na versão 1.0.2: sem o zero, 3 leituras de repetibilidade e só a descida
    const { regrasDoPop: _marca, ...emissao } = emitida.emissao!
    const antigo: Calibracao = {
      ...emitida,
      emissao,
      repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15, 15.01] }],
      indicacao: {
        ...emitida.indicacao,
        metodo: 'DECRESCENTE',
        pontos: emitida.indicacao.pontos.filter((p) => p.carga > 0 && p.carga !== 20),
      },
    }
    t.ctx.db.prepare('UPDATE calibracoes SET dados = ? WHERE id = ?').run(JSON.stringify(antigo), emitida.id)
    const rev = await revisar(emitida)
    expect(await pendenciasDe(rev)).toEqual([])
    // Os avisos de antes continuam na tela (não bloqueiam)
    const { resultado } = calcularCalibracao(rev, c.balanca, [c.pesos])
    expect(resultado.avisos.map((a) => a.mensagem).join('\n')).toMatch(/Erro de indicação com 3 ponto\(s\)/)
    const r1 = await emitir(rev)
    expect(r1.statusCode, r1.body).toBe(200)
    expect(r1.json().calibracao.indicacao.metodo).toBe('DECRESCENTE')
    // A calibração nova da balança (do plano da última emitida) e "calibrar de novo" saem com o método da classe
    const nova = (await c.criar('/api/calibracoes', { balancaId: c.balanca.id })).calibracao as Calibracao
    expect(nova.indicacao.metodo).toBe('CRESCENTE_DECRESCENTE')
    await t.chamar('DELETE', `/api/calibracoes/${nova.id}`, { cookie: t.cookieAdmin })
    const denovo = (await c.criar(`/api/calibracoes/${r1.json().calibracao.id}/recalibrar`, {})).calibracao as Calibracao
    expect(denovo.indicacao.metodo).toBe('CRESCENTE_DECRESCENTE')
    expect(
      planoConformeAoPop({ ...denovo, indicacao: { ...denovo.indicacao, metodo: 'DECRESCENTE' } }, 'I').indicacao.metodo,
    ).toBe('DESCONTINUO')
  })
})

// ---- Leitura fora do esperado (vírgula esquecida, outra unidade) ---------------------------------------------

describe('leitura fora do esperado bloqueia a emissão', () => {
  const casos: Array<[string, (k: CalibracaoInput) => CalibracaoInput, string]> = [
    [
      'erro de indicação',
      (k) => ({
        ...k,
        indicacao: {
          ...k.indicacao,
          pontos: k.indicacao.pontos.map((p) => (p.carga === 30 ? { ...p, crescente: 30001 } : p)),
        },
      }),
      'Erro de indicação, ponto de 30,00 kg: leitura 30 001,00 fora do esperado; confira a digitação.',
    ],
    [
      'repetibilidade',
      (k) => ({ ...k, repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15, 1501, 15, 15, 15] }] }),
      'Repetibilidade a 15,00 kg: leitura 1501,00 fora do esperado; confira a digitação.',
    ],
    [
      'excentricidade',
      (k) => ({
        ...k,
        excentricidade: {
          ...k.excentricidade,
          posicoes: k.excentricidade.posicoes.map((p, i) => (i === 3 ? { ...p, leitura: 100 } : p)),
        },
      }),
      'Excentricidade (Trás direita): leitura 100,00 fora do esperado com 10,00 kg; confira a digitação.',
    ],
  ]
  for (const [ensaio, mudar, pendencia] of casos)
    it(`${ensaio}: pendência; a revisão e a emissão recusadas; corrigida, emite`, async () => {
      const pronta = await c.calibracaoPronta()
      const { calibracao, pendencias } = await salvar(pronta, mudar)
      expect(pendencias.map(sem)).toEqual([pendencia])
      expect((await paraRevisao(calibracao)).statusCode).toBe(409)
      const negado = await emitir(calibracao)
      expect(negado.statusCode).toBe(409)
      expect(sem(negado.json().erro)).toBe(pendencia)
      const certo = await salvar(calibracao, (k) => ({
        ...k,
        indicacao: pronta.indicacao,
        repetibilidade: pronta.repetibilidade,
        excentricidade: pronta.excentricidade,
      }))
      expect(certo.pendencias).toEqual([])
      expect((await emitir(certo.calibracao)).statusCode).toBe(200)
    })
})

// ---- Padrões: como valiam no dia da calibração; na revisão, os da emissão original ---------------------------

describe('padrões como valiam no dia da calibração', () => {
  const NOVO = { certificado: 'LAB-0789/2026', dataCalibracao: '2026-06-15', validade: '2027-06-15' }
  const padraoAtual = () => t.ctx.repo.obterPadrao(c.pesos.id)!
  /** Recalibração do jogo registrada pela tela (o cadastro guarda a versão de antes). */
  async function recalibrarPelaTela(extra: Partial<Padrao> = {}) {
    const atual = padraoAtual()
    const r = await t.chamar('PUT', `/api/padroes/${atual.id}`, {
      cookie: t.cookieAdmin,
      payload: {
        ...atual,
        ...NOVO,
        pesos: atual.pesos.map((w) => ({ ...w, correcao: w.correcao + 300 })),
        ...extra,
        versao: atual.versao,
      },
    })
    expect(r.statusCode, r.body).toBe(200)
    return r.json().padrao as Padrao
  }
  /** Recalibração gravada antes desta versão (sem a versão de antes no cadastro). */
  function recalibrarSemHistorico(extra: Partial<Padrao> = {}) {
    const atual = padraoAtual()
    const novo = { ...atual, ...NOVO, pesos: atual.pesos.map((w) => ({ ...w, correcao: w.correcao + 300 })), ...extra }
    delete (novo as Partial<Padrao>).versoesAnteriores
    t.ctx.db.prepare('UPDATE padroes SET dados = ? WHERE id = ?').run(JSON.stringify(novo), atual.id)
  }
  async function prontaEm(data: string) {
    return (await salvar(await c.calibracaoPronta(), (k) => ({ ...k, dataCalibracao: data }))).calibracao
  }
  const correcoes = (p: Pick<Padrao, 'pesos'>) => p.pesos.map((w) => w.correcao)

  it('jogo recalibrado depois da medição: o rascunho continua com o certificado e as correções do dia', async () => {
    const k = await prontaEm('2026-03-02')
    const antes = calcularCalibracao(k, c.balanca, [padraoAtual()]).resultado.pontos.map((p) => p.texto)
    await recalibrarPelaTela()
    expect(padraoAtual().certificado).toBe('LAB-0789/2026')
    const aberta = await detalhe(k)
    expect(aberta.pendencias).toEqual([])
    expect(aberta.padroes[0]).toMatchObject({ certificado: 'LAB-0456/2026', dataCalibracao: '2026-01-10' })
    const r = await emitir(k)
    expect(r.statusCode, r.body).toBe(200)
    const emitida = r.json().calibracao as Calibracao
    expect(emitida.emissao!.padroes[0]).toMatchObject({ certificado: 'LAB-0456/2026', dataCalibracao: '2026-01-10' })
    expect(correcoes(emitida.emissao!.padroes[0])).toEqual([40, -30, 10, 20])
    expect(
      calcularCalibracao(emitida, emitida.emissao!.balanca, emitida.emissao!.padroes).resultado.pontos.map((p) => p.texto),
    ).toEqual(antes)
    // Uma calibração de hoje já usa o certificado novo
    const hoje = await c.calibracaoPronta()
    expect((await detalhe(hoje)).padroes[0].certificado).toBe('LAB-0789/2026')
  })

  it('sem a versão do dia no cadastro (recalibração gravada antes): pendência, e a emissão recusada', async () => {
    const k = await prontaEm('2026-03-02')
    recalibrarSemHistorico()
    const pendencia = 'O padrão JP-01 foi calibrado em 15/06/2026, depois desta calibração: o certificado dele não valia no dia.'
    expect(await pendenciasDe(k)).toEqual([pendencia])
    const r = await emitir(k)
    expect(r.statusCode).toBe(409)
    expect(r.json().erro).toBe(pendencia)
    // Calibrado no mesmo dia da calibração: vale
    const mesmoDia = await salvar((await detalhe(k)).calibracao, (x) => ({ ...x, dataCalibracao: '2026-06-15' }))
    expect(mesmoDia.pendencias).toEqual([])
  })

  it('jogo vencido no dia da medição continua vencido depois de recalibrado', async () => {
    const atual = padraoAtual()
    const vencido = await t.chamar('PUT', `/api/padroes/${atual.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, validade: '2026-02-20', versao: atual.versao },
    })
    expect(vencido.statusCode, vencido.body).toBe(200)
    const k = await prontaEm('2026-03-02')
    const pendencia = 'O padrão JP-01 estava vencido na data da calibração (20/02/2026).'
    expect(await pendenciasDe(k)).toEqual([pendencia])
    await recalibrarPelaTela()
    expect(await pendenciasDe(k)).toEqual([pendencia])
    expect((await emitir(k)).statusCode).toBe(409)
  })

  it('certificado do jogo corrigido para o anterior (vencido no dia) e depois recalibrado: continua vencido', async () => {
    // O cadastro tinha o LAB-0456/2026 (10/01/2026) por engano; o que valia era o LAB-0456/2025, vencido em 15/10/2026
    const atual = padraoAtual()
    const corrigido = await t.chamar('PUT', `/api/padroes/${atual.id}`, {
      cookie: t.cookieAdmin,
      payload: {
        ...atual,
        certificado: 'LAB-0456/2025',
        dataCalibracao: '2025-10-10',
        validade: '2026-10-15',
        versao: atual.versao,
      },
    })
    expect(corrigido.statusCode, corrigido.body).toBe(200)
    const k = await prontaEm('2026-10-20')
    const pendencia = 'O padrão JP-01 estava vencido na data da calibração (15/10/2026).'
    expect(await pendenciasDe(k)).toEqual([pendencia])
    await recalibrarPelaTela({ certificado: 'LAB-0999/2026', dataCalibracao: '2026-10-25', validade: '2027-10-25' })
    expect(await pendenciasDe(k)).toEqual([pendencia])
    expect((await detalhe(k)).padroes[0]).toMatchObject({ certificado: 'LAB-0456/2025', validade: '2026-10-15' })
    expect((await emitir(k)).statusCode).toBe(409)
  })

  it('revisão depois da recalibração (sem a versão de antes no cadastro): os padrões da emissão original', async () => {
    const original = (await c.emitir(await prontaEm('2026-03-02'))).json().calibracao as Calibracao
    recalibrarSemHistorico()
    const rev = await revisar(original, 'Correção do nº de série')
    const aberta = await detalhe(rev)
    expect(aberta.pendencias).toEqual([])
    expect(aberta.padroes[0]).toMatchObject({ certificado: 'LAB-0456/2026', dataCalibracao: '2026-01-10' })
    const r1 = await emitir(rev)
    expect(r1.statusCode, r1.body).toBe(200)
    const emitida = r1.json().calibracao as Calibracao
    expect(emitida.emissao!.padroes[0]).toMatchObject({ certificado: 'LAB-0456/2026', dataCalibracao: '2026-01-10' })
    expect(correcoes(emitida.emissao!.padroes[0])).toEqual([40, -30, 10, 20])
    const texto = (k: Calibracao) =>
      calcularCalibracao(k, k.emissao!.balanca, k.emissao!.padroes).resultado.pontos.map((p) => p.texto)
    expect(texto(emitida)).toEqual(texto(original))
    // A revisão da revisão continua com eles
    const r2 = await revisar(emitida, 'Outra correção')
    expect((await detalhe(r2)).padroes[0]).toMatchObject({ certificado: 'LAB-0456/2026' })
    expect(await pendenciasDe(r2)).toEqual([])
  })

  it('revisão com o jogo desativado depois da emissão: emite (é a mesma visita)', async () => {
    const original = (await c.emitir(await c.calibracaoPronta())).json().calibracao as Calibracao
    const atual = padraoAtual()
    const r = await t.chamar('PUT', `/api/padroes/${atual.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, ativo: false, versao: atual.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const rev = await revisar(original)
    expect(await pendenciasDe(rev)).toEqual([])
    const r1 = await emitir(rev)
    expect(r1.statusCode, r1.body).toBe(200)
  })

  it('revisão: a correção de um dado do mesmo certificado do padrão vale; um padrão trocado é conferido como hoje', async () => {
    const original = (await c.emitir(await c.calibracaoPronta())).json().calibracao as Calibracao
    // Correção digitada errado no cadastro, mesmo certificado (nº e data)
    const atual = padraoAtual()
    const corrigido = await t.chamar('PUT', `/api/padroes/${atual.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...atual, pesos: atual.pesos.map((w) => (w.id === 'p10a' ? { ...w, correcao: 45 } : w)), versao: atual.versao },
    })
    expect(corrigido.statusCode, corrigido.body).toBe(200)
    const rev = await revisar(original, 'Correção da correção do peso A')
    expect((await detalhe(rev)).padroes[0].pesos.find((w: { id: string }) => w.id === 'p10a').correcao).toBe(45)
    // Um termo-higrômetro vencido incluído na revisão: conferido como qualquer padrão
    const th = (
      await c.criar('/api/padroes', {
        ...c.padraoPesos('TH-09'),
        tipo: 'TERMOHIGROMETRO',
        pesos: [],
        dataCalibracao: '2025-01-02',
        validade: '2026-01-01',
      })
    ).padrao as Padrao
    const comTh = await salvar(rev, (k) => ({ ...k, padroesIds: [...k.padroesIds, th.id] }))
    expect(comTh.pendencias.map(sem)).toContain(`O padrão TH-09 estava vencido na data da calibração (01/01/2026).`)
  })
})

// ---- Ambiente fora da faixa: gravado como digitado, com a pendência ------------------------------------------

describe('valores do ambiente fora da faixa', () => {
  it('não somem: ficam gravados como digitados, com a pendência que diz o quê; a emissão recusada', async () => {
    const pronta = await c.calibracaoPronta()
    const { calibracao, pendencias } = await salvar(pronta, (k) => ({
      ...k,
      ambiente: {
        temperaturaInicial: 22.1,
        temperaturaFinal: 81,
        umidadeInicial: 550,
        umidadeFinal: 57,
        pressao: 92.7,
        deltaTPesos: 31,
        aclimatacao: { deltaT0: 5, minutos: 3000 },
      },
    }))
    expect(calibracao.ambiente).toMatchObject({
      temperaturaFinal: 81,
      umidadeInicial: 550,
      pressao: 92.7,
      deltaTPesos: 31,
      aclimatacao: { deltaT0: 5, minutos: 3000 },
    })
    expect(pendencias.map(sem)).toEqual(
      expect.arrayContaining([
        'Temperatura no fim fora da faixa (−40 °C a 80 °C): confira o valor digitado.',
        'Umidade no início fora da faixa (0 % a 100 %): confira o valor digitado.',
        'Pressão de 92,7 hPa fora da faixa (300 hPa a 1200 hPa): a pressão é em hPa (92,7 kPa = 927 hPa).',
        'Diferença de temperatura pesos − ar fora da faixa (−30 °C a 30 °C): confira o valor digitado.',
        'Aclimatação dos pesos: tempo no local fora da faixa (0 min a 2880 min): confira o valor digitado.',
      ]),
    )
    expect(pendencias.some((p) => p.startsWith('Registre a temperatura'))).toBe(false)
    // Continua lá ao abrir de novo
    expect((await detalhe(calibracao)).calibracao.ambiente.temperaturaFinal).toBe(81)
    expect((await emitir(calibracao)).statusCode).toBe(409)
  })
})

// ---- Datas: próxima calibração e recebimento --------------------------------------------------------------

describe('datas incoerentes', () => {
  it('próxima calibração inválida (ano 2206): recusada ao gravar; sem a data, a marca "no certificado" fica e bloqueia', async () => {
    const pronta = await c.calibracaoPronta()
    const r = await t.chamar('PUT', `/api/calibracoes/${pronta.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...pronta, proximaCalibracao: '2206-11-03', proximaNoCertificado: true, versao: pronta.versao },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().erro).toBe('Data da próxima calibração inválida.')
    const { calibracao, pendencias } = await salvar(pronta, (k) => ({ ...k, proximaCalibracao: '', proximaNoCertificado: true }))
    expect(calibracao.proximaNoCertificado).toBe(true)
    expect(pendencias).toEqual(['Informe a data da próxima calibração pedida pelo cliente.'])
    expect((await emitir(calibracao)).statusCode).toBe(409)
  })

  it('próxima calibração antes (ou no dia) da calibração: pendência; depois, emite', async () => {
    const pronta = await c.calibracaoPronta()
    const antes = await salvar(pronta, (k) => ({
      ...k,
      dataCalibracao: '2026-10-20',
      proximaCalibracao: '2025-10-20',
      proximaNoCertificado: true,
    }))
    expect(antes.pendencias).toEqual(['A próxima calibração precisa ser depois da data da calibração.'])
    expect((await emitir(antes.calibracao)).statusCode).toBe(409)
    const noDia = await salvar(antes.calibracao, (k) => ({ ...k, proximaCalibracao: '2026-10-20' }))
    expect(noDia.pendencias).toEqual(['A próxima calibração precisa ser depois da data da calibração.'])
    const certo = await salvar(noDia.calibracao, (k) => ({ ...k, proximaCalibracao: '2027-10-20' }))
    expect(certo.pendencias).toEqual([])
    expect((await emitir(certo.calibracao)).statusCode).toBe(200)
  })

  it('recebimento do item depois da calibração (no laboratório): pendência; nas instalações do cliente, não é gravado', async () => {
    const pronta = await c.calibracaoPronta()
    const lab = await salvar(pronta, (k) => ({
      ...k,
      local: 'LABORATORIO',
      dataCalibracao: '2026-10-20',
      dataRecebimento: '2026-10-21',
    }))
    expect(lab.pendencias).toEqual(['O recebimento do item não pode ser depois da data da calibração.'])
    expect((await emitir(lab.calibracao)).statusCode).toBe(409)
    const certo = await salvar(lab.calibracao, (k) => ({ ...k, dataRecebimento: '2026-10-20' }))
    expect(certo.pendencias).toEqual([])
    // De volta para o cliente: a data de recebimento (do laboratório) sai do registro
    const cliente = await salvar(certo.calibracao, (k) => ({ ...k, local: 'CLIENTE' }))
    expect(cliente.calibracao.dataRecebimento).toBe('')
    const invalida = await t.chamar('PUT', `/api/calibracoes/${pronta.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...lab.calibracao, dataRecebimento: '2026-02-31', versao: cliente.calibracao.versao },
    })
    expect(invalida.statusCode).toBe(400)
    expect(invalida.json().erro).toBe('Data de recebimento do item inválida.')
  })
})

// ---- Técnico excluído --------------------------------------------------------------------------------------

describe('técnico da calibração excluído', () => {
  const PENDENCIA = 'O técnico desta calibração foi excluído: escolha quem executou.'

  it('pendência, e a emissão recusada; escolhido outro, emite com o nome dele', async () => {
    const k = await c.calibracaoPronta([], t.cookieComum)
    expect(k.tecnicoId).toBe(t.comumId)
    const r = await t.chamar('DELETE', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin })
    expect(r.statusCode, r.body).toBe(204)
    expect(await pendenciasDe(k)).toEqual([PENDENCIA])
    expect((await emitir(k)).statusCode).toBe(409)
    const outro = await salvar((await detalhe(k)).calibracao, (x) => ({ ...x, tecnicoId: t.adminId }))
    expect(outro.pendencias).toEqual([])
    const emitida = await emitir(outro.calibracao)
    expect(emitida.statusCode, emitida.body).toBe(200)
    expect(emitida.json().calibracao.emissao.tecnico.nome).toBe('Admin Teste')
  })

  it('técnico desativado continua valendo; um id que não existe não é aceito', async () => {
    const k = await c.calibracaoPronta([], t.cookieComum)
    const r = await t.chamar('PUT', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin, payload: { ativo: false } })
    expect(r.statusCode, r.body).toBe(200)
    expect(await pendenciasDe(k)).toEqual([])
    const emitida = await emitir(k)
    expect(emitida.statusCode, emitida.body).toBe(200)
    expect(emitida.json().calibracao.emissao.tecnico.nome).toBe('Comum Teste')
    // Indicar quem não existe (ou não tem a marca de técnico) é recusado na hora
    const outra = await c.calibracaoPronta()
    const recusada = await t.chamar('PUT', `/api/calibracoes/${outra.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...outra, tecnicoId: 'nao-existe', versao: outra.versao },
    })
    expect(recusada.statusCode).toBe(400)
    expect(recusada.json().erro).toBe('O técnico escolhido não foi encontrado. Escolha de novo.')
  })
})

// ---- Balança cadastrada em dobro (mesmo nº de série) ------------------------------------------------------

describe('balança com o nº de série de outra do mesmo cliente', () => {
  const nova = (extra: Partial<Balanca> & Record<string, unknown> = {}) =>
    t.chamar('POST', '/api/balancas', {
      cookie: t.cookieAdmin,
      payload: {
        ...BALANCA_VAZIA,
        clienteId: c.cliente.id,
        fabricante: 'Toledo',
        modelo: '9094',
        numeroSerie: 'TL-2231',
        faixas: [{ max: 30, e: 0.01, d: 0.01 }],
        ...extra,
      },
    })

  it('recusada (409 com a existente), também com maiúsculas e espaços diferentes; com a confirmação, cadastra', async () => {
    for (const extra of [{}, { numeroSerie: ' tl-2231 ', fabricante: 'toledo' }, { numeroSerie: 'TL 2231' }]) {
      const r = await nova(extra)
      expect(r.statusCode, JSON.stringify(extra)).toBe(409)
      expect(r.json()).toMatchObject({
        codigo: 'SERIE_REPETIDA',
        id: c.balanca.id,
        ativo: true,
      })
      expect(r.json().erro).toMatch(/^Já existe uma balança com este nº de série neste cliente: /)
    }
    const confirmada = await nova({ confirmarSerie: true })
    expect(confirmada.statusCode, confirmada.body).toBe(201)
    expect(confirmada.json().balanca).not.toHaveProperty('confirmarSerie')
  })

  it('sem nº de série, de outro fabricante ou de outro cliente: cadastra', async () => {
    expect((await nova({ numeroSerie: '' })).statusCode).toBe(201)
    expect((await nova({ numeroSerie: '' })).statusCode).toBe(201)
    expect((await nova({ fabricante: 'Filizola' })).statusCode).toBe(201)
    const outro = (
      await c.criar('/api/clientes', {
        ...c.cliente,
        id: undefined,
        nome: 'Outro Mercado',
        razaoSocial: 'OUTRO MERCADO LTDA',
        documento: '',
      })
    ).cliente
    expect((await nova({ clienteId: outro.id })).statusCode).toBe(201)
  })

  it('a existente desativada também conta (a mensagem diz para reativá-la)', async () => {
    const r = await t.chamar('PUT', `/api/balancas/${c.balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...c.balanca, ativo: false, versao: c.balanca.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const repetida = await nova()
    expect(repetida.statusCode).toBe(409)
    expect(repetida.json()).toMatchObject({ codigo: 'SERIE_REPETIDA', ativo: false })
    expect(repetida.json().erro).toMatch(/desativada/)
  })

  it('editar para o nº de outra é recusado; editar outros dados de um par já repetido, não', async () => {
    const outra = (await nova({ numeroSerie: 'TL-9999' })).json().balanca as Balanca
    const troca = await t.chamar('PUT', `/api/balancas/${outra.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...outra, numeroSerie: 'tl-2231', versao: outra.versao },
    })
    expect(troca.statusCode).toBe(409)
    expect(troca.json().codigo).toBe('SERIE_REPETIDA')
    // Par repetido de antes (backup antigo): o resto do cadastro continua editável
    const dobro = (await nova({ confirmarSerie: true })).json().balanca as Balanca
    const editada = await t.chamar('PUT', `/api/balancas/${dobro.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...dobro, modelo: '9094 Plus', versao: dobro.versao },
    })
    expect(editada.statusCode, editada.body).toBe(200)
  })
})

// ---- Balança que não pesa corretamente (POP 7.8), retorno ao zero e cargas acima de Max ---------------------

describe('balança que não pesa corretamente não recebe certificado', () => {
  const NAO_PESA =
    'Erro de indicação, ponto de 30,00 kg: erro de +0,100 kg, maior que o EMA em serviço (±0,04 kg); a balança não pesa corretamente e não é calibrada (POP 7.8).'
  const em30 = (leitura: number) => (k: CalibracaoInput) => ({
    ...k,
    indicacao: {
      ...k.indicacao,
      pontos: k.indicacao.pontos.map((p) => (p.carga === 30 ? { ...p, crescente: leitura, decrescente: leitura } : p)),
    },
  })

  it('erro de 10 e em Max, com e sem a conformidade pedida: pendência e emissão recusada (409)', async () => {
    const { calibracao, pendencias } = await salvar(await c.calibracaoPronta(), em30(30.1))
    expect(pendencias.map(sem)).toEqual([NAO_PESA])
    const negado = await emitir(calibracao)
    expect(negado.statusCode).toBe(409)
    expect(sem(negado.json().erro)).toBe(NAO_PESA)
    const conforme = await salvar(calibracao, (k) => ({
      ...k,
      conformidade: { solicitada: true, criterio: 'PORTARIA_SERVICO', toleranciaCliente: 0, regra: 'SIMPLES' },
    }))
    expect(conforme.pendencias.map(sem)).toEqual([NAO_PESA])
    expect((await emitir(conforme.calibracao)).statusCode).toBe(409)
    // No limite (4 e, o EMA em serviço da Portaria 157 acima de 500 e), emite
    const limite = await salvar(conforme.calibracao, em30(30.04))
    expect(limite.pendencias).toEqual([])
    expect((await emitir(limite.calibracao)).statusCode).toBe(200)
  })

  it('retorno ao zero não registrado, ou de 50 d: pendência', async () => {
    const pronta = await c.calibracaoPronta()
    const sem0 = await salvar(pronta, (k) => ({ ...k, indicacao: { ...k.indicacao, retornoZero: null } }))
    expect(sem0.pendencias.map(sem)).toEqual([
      'Erro de indicação: registre o retorno ao zero, a indicação sem carga depois de retirar toda a carga (POP 7.7).',
    ])
    expect((await emitir(sem0.calibracao)).statusCode).toBe(409)
    const longe = await salvar(sem0.calibracao, (k) => ({ ...k, indicacao: { ...k.indicacao, retornoZero: 0.5 } }))
    expect(longe.pendencias.map(sem)).toEqual([
      'Erro de indicação: a balança não voltou ao zero (retorno de 0,50 kg; limite de ±0,02 kg); a balança não pesa corretamente e não é calibrada (POP 7.8).',
    ])
  })

  it('ponto de 35 kg numa balança de 30 kg: pendência e emissão recusada', async () => {
    const peca = (pesoId: string) => ({ padraoId: c.pesos.id, pesoId, quantidade: 1 })
    const { calibracao, pendencias } = await salvar(await c.calibracaoPronta(), (k) => ({
      ...k,
      indicacao: {
        ...k.indicacao,
        pontos: [
          ...k.indicacao.pontos,
          {
            id: 'e',
            carga: 35,
            pecas: [peca('p10a'), peca('p10b'), peca('p10c'), peca('p5')],
            pecasManuais: true,
            crescente: 35.01,
            decrescente: 35.01,
            nivelSubstituicao: 0,
          },
        ],
      },
    }))
    expect(pendencias.map(sem)).toEqual([
      'Erro de indicação, ponto de 35,00 kg: carga acima de Max (30,00 kg); confira a carga ou o Max da balança.',
    ])
    expect((await emitir(calibracao)).statusCode).toBe(409)
  })
})

// ---- Excentricidade dispensada e balança sem identificação --------------------------------------------------

describe('excentricidade "não realizada" só no gancho, com o motivo', () => {
  const naoFeita = (motivo: string) => (k: CalibracaoInput) => ({
    ...k,
    excentricidade: { ...k.excentricidade, aplicavel: false, motivo, posicoes: [] },
  })

  it('plataforma retangular sem o ensaio (e sem motivo): pendências e emissão recusada', async () => {
    const { calibracao, pendencias } = await salvar(await c.calibracaoPronta(), naoFeita(''))
    expect(pendencias.map(sem)).toEqual([
      'Excentricidade: o POP (7.10, Tabela 6) só dispensa o ensaio na balança suspensa (gancho); registre as leituras das posições.',
      'Excentricidade: informe por que o ensaio não foi feito (sai no certificado).',
    ])
    expect((await emitir(calibracao)).statusCode).toBe(409)
  })

  it('balança suspensa (gancho) com o motivo: emite', async () => {
    const r = await t.chamar('PUT', `/api/balancas/${c.balanca.id}`, {
      cookie: t.cookieAdmin,
      payload: { ...c.balanca, receptor: 'GANCHO', versao: c.balanca.versao },
    })
    expect(r.statusCode, r.body).toBe(200)
    const semMotivo = await salvar(await c.calibracaoPronta(), naoFeita(''))
    expect(semMotivo.pendencias.map(sem)).toEqual([
      'Excentricidade: informe por que o ensaio não foi feito (sai no certificado).',
    ])
    const comMotivo = await salvar(semMotivo.calibracao, naoFeita('Balança suspensa: a carga se centraliza sozinha.'))
    expect(comMotivo.pendencias).toEqual([])
    expect((await emitir(comMotivo.calibracao)).statusCode).toBe(200)
  })
})

describe('balança sem nº de série nem TAG não é identificável (POP 7.3)', () => {
  it('emissão recusada; com a TAG no cadastro, emite', async () => {
    const pronta = await c.calibracaoPronta()
    const mudar = (extra: Partial<Balanca>) =>
      t.chamar('PUT', `/api/balancas/${c.balanca.id}`, {
        cookie: t.cookieAdmin,
        payload: { ...t.ctx.repo.obterBalanca(c.balanca.id)!, ...extra, versao: t.ctx.repo.obterBalanca(c.balanca.id)!.versao },
      })
    expect((await mudar({ numeroSerie: '  ', identificacao: '' })).statusCode).toBe(200)
    const pendencia =
      'Balança sem nº de série nem identificação (TAG): identifique a balança no cadastro antes de emitir (POP 7.3).'
    expect(await pendenciasDe(pronta)).toEqual([pendencia])
    const negado = await emitir(pronta)
    expect(negado.statusCode).toBe(409)
    expect(negado.json().erro).toBe(pendencia)
    expect((await mudar({ identificacao: 'BAL-07' })).statusCode).toBe(200)
    expect(await pendenciasDe(pronta)).toEqual([])
    expect((await emitir(pronta)).statusCode).toBe(200)
  })
})

// ---- Padrão fora do intervalo de calibração do POP (Tabela 3: 24 meses) ---------------------------------------

describe('padrão calibrado há mais de 24 meses', () => {
  it('a próxima calibração digitada distante não vale: pendência e emissão recusada', async () => {
    const velho = (
      await c.criar('/api/padroes', { ...c.padraoPesos('JP-02'), dataCalibracao: '2022-03-10', validade: '2032-03-10' })
    ).padrao as Padrao
    const k = (
      await salvar(await c.calibracaoPronta(), (x) => ({
        ...x,
        dataCalibracao: '2026-11-04',
        // Com o barômetro do cenário (a pressão é obrigatória em toda calibração)
        padroesIds: [velho.id, ...x.padroesIds.filter((id) => id !== c.pesos.id)],
        indicacao: {
          ...x.indicacao,
          pontos: x.indicacao.pontos.map((p) => ({ ...p, pecas: p.pecas.map((q) => ({ ...q, padraoId: velho.id })) })),
        },
      }))
    ).calibracao
    const pendencia = 'O padrão JP-02 foi calibrado em 10/03/2022, há mais de 24 meses desta calibração (POP, Tabela 3).'
    expect(await pendenciasDe(k)).toEqual([pendencia])
    const negado = await emitir(k)
    expect(negado.statusCode).toBe(409)
    expect(negado.json().erro).toBe(pendencia)
  })
})

// ---- Revisão: as regras do POP quando o certificado revisado foi emitido com elas -----------------------------

describe('revisão de certificado emitido com as regras do POP', () => {
  const em20 = (leitura: number) => (k: CalibracaoInput) => ({
    ...k,
    indicacao: {
      ...k.indicacao,
      pontos: k.indicacao.pontos.map((p) => (p.carga === 20 ? { ...p, crescente: leitura } : p)),
    },
  })
  const LEITURA = 'Erro de indicação, ponto de 20,00 kg: leitura 20 000,00 fora do esperado; confira a digitação.'

  it('a emissão marca as regras; a revisão as segue: leitura absurda e mínimos são pendências (409)', async () => {
    const emitida = await c.emitido()
    expect(emitida.emissao!.regrasDoPop).toBe(true)
    // Emitido por esta versão: o "crescente e decrescente" sai "sem zerar entre os pontos" (o da 1.0.3, sem a marca,
    // continua com o texto da época quando o PDF é refeito)
    expect(emitida.emissao!.carregamentoSemZerar).toBe(true)
    const rev = await revisar(emitida)
    expect(rev.regrasDoPop).toBe(true)
    const absurda = await salvar(rev, em20(20000))
    expect(absurda.pendencias.map(sem)).toEqual([LEITURA])
    expect((await emitir(absurda.calibracao)).statusCode).toBe(409)
    const poucos = await salvar(absurda.calibracao, (k) => ({
      ...k,
      repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15.01] }],
      indicacao: { ...k.indicacao, pontos: k.indicacao.pontos.filter((p) => p.carga === 0 || p.carga === 30) },
    }))
    expect(poucos.pendencias.map(sem)).toEqual([
      'Erro de indicação: 2 pontos lidos; o POP pede no mínimo 5, contando o zero (7.7).',
      'Repetibilidade a 15,00 kg: 2 leituras; o mínimo é 5 (POP, Tabela 4; 3 só com carga ≥ 100 kg).',
    ])
    // A revisão da revisão continua com as regras
    const certa = await salvar(poucos.calibracao, (k) => ({
      ...k,
      indicacao: emitida.indicacao,
      repetibilidade: emitida.repetibilidade,
    }))
    const r1 = await emitir(certa.calibracao)
    expect(r1.statusCode, r1.body).toBe(200)
    expect(r1.json().calibracao.emissao.regrasDoPop).toBe(true)
    const r2 = await revisar(r1.json().calibracao)
    expect(r2.regrasDoPop).toBe(true)
  })

  it('certificado da 1.0.2 (sem a marca): os mínimos ficam avisos, mas a leitura absurda que a revisão trouxe é pendência', async () => {
    const emitida = await c.emitido()
    const { regrasDoPop: _marca, ...semMarca } = emitida.emissao!
    t.ctx.db
      .prepare('UPDATE calibracoes SET dados = ? WHERE id = ?')
      .run(JSON.stringify({ ...emitida, emissao: semMarca }), emitida.id)
    const rev = await revisar(emitida)
    expect(rev.regrasDoPop).toBeUndefined()
    const absurda = await salvar(rev, em20(20000))
    expect(absurda.pendencias.map(sem)).toEqual([LEITURA])
    expect((await emitir(absurda.calibracao)).statusCode).toBe(409)
    // Os mínimos: como na época (avisos)
    const poucos = await salvar(absurda.calibracao, (k) => ({
      ...k,
      repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15.01] }],
      indicacao: { ...emitida.indicacao, pontos: emitida.indicacao.pontos.filter((p) => p.carga === 0 || p.carga === 30) },
    }))
    expect(poucos.pendencias).toEqual([])
  })
})

// ---- Motivo da correção: até 500 caracteres, inteiro no sistema (não sai no certificado) -------------------------

describe('motivo da correção', () => {
  it('500 caracteres ficam inteiros no sistema e não saem no certificado; 501, recusado (400)', async () => {
    const emitida = await c.emitido()
    const longo =
      `Correção do nº de série da balança, que foi transcrito com erro. ${'Os resultados das medições não mudam. '.repeat(20)}`
        .slice(0, 500)
        .trimEnd()
        .padEnd(500, 'x')
    expect(longo).toHaveLength(500)
    const recusado = await t.chamar('POST', `/api/calibracoes/${emitida.id}/revisar`, {
      cookie: t.cookieAdmin,
      payload: { motivo: `${longo}y` },
    })
    expect(recusado.statusCode).toBe(400)
    expect(recusado.json().erro).toBe('O motivo da correção pode ter até 500 caracteres.')
    const rev = await revisar(emitida, longo)
    expect(rev.motivoRevisao).toBe(longo)
    const r1 = await emitir(rev)
    expect(r1.statusCode, r1.body).toBe(200)
    // Inteiro no histórico das versões
    const detalhe = (await t.chamar('GET', `/api/calibracoes/${rev.id}`, { cookie: t.cookieAdmin })).json()
    expect(detalhe.versoes.at(-1).motivo).toBe(longo)
    if (!temPdftotext) return
    const pdf = await t.chamar('GET', `/api/calibracoes/${rev.id}/pdf`, { cookie: t.cookieAdmin })
    const bruto = spawnSync('pdftotext', ['-enc', 'UTF-8', '-', '-'], { input: pdf.rawPayload }).stdout.toString('utf8')
    expect(sem(bruto).replace(/\s+/g, ' ')).not.toContain('Correção do nº de série da balança')
    expect(bruto).not.toContain('Motivo:')
    // No máximo 3 páginas (o pdftotext separa as páginas com \f)
    expect(bruto.split('\f').filter((x) => x.trim()).length).toBeLessThanOrEqual(3)
  })
})

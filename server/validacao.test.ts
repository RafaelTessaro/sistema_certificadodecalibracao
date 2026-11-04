// Validação da emissão pela API: os mínimos do POP e as leituras fora do esperado (pendências na calibração nova,
// avisos na revisão de certificado de antes), os padrões como valiam no dia da calibração (e os da emissão original
// na revisão), os valores do ambiente fora da faixa, as datas incoerentes, o técnico excluído e a balança cadastrada
// em dobro.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularCalibracao } from '#shared/calibracao.ts'
import { BALANCA_VAZIA } from '#shared/dominio.ts'
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
      excentricidade: { ...k.excentricidade, aplicavel: false, motivo: 'Prato pequeno', posicoes: [] },
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

  it('revisão de certificado emitido antes destas regras (4 pontos, 3 leituras, "Decrescente"): emite como na época', async () => {
    const r = await c.emitir(await c.calibracaoPronta())
    expect(r.statusCode, r.body).toBe(200)
    const emitida = r.json().calibracao as Calibracao
    // Gravado como na versão 1.0.2: sem o zero, 3 leituras de repetibilidade e só a descida
    const antigo: Calibracao = {
      ...emitida,
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
    // A calibração nova da balança (do plano da última emitida) e "calibrar de novo" saem com a subida
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

  it('técnico desativado continua valendo; id que não existe é pendência', async () => {
    const k = await c.calibracaoPronta([], t.cookieComum)
    const r = await t.chamar('PUT', `/api/usuarios/${t.comumId}`, { cookie: t.cookieAdmin, payload: { ativo: false } })
    expect(r.statusCode, r.body).toBe(200)
    expect(await pendenciasDe(k)).toEqual([])
    const emitida = await emitir(k)
    expect(emitida.statusCode, emitida.body).toBe(200)
    expect(emitida.json().calibracao.emissao.tecnico.nome).toBe('Comum Teste')
    const outra = await c.calibracaoPronta()
    expect((await salvar(outra, (x) => ({ ...x, tecnicoId: 'nao-existe' }))).pendencias).toEqual([PENDENCIA])
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

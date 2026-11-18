// Avisos na hora: as duas classes ("Confira a digitação" e "Isto impede o certificado"), pelo valor visto em campo, e a
// regra que amarra o celular ao escritório: toda pendência de emissão que depende só de dados do campo cai em IMPEDE (e
// uma pendência nova que a tabela não conhece faz este teste falhar).

import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '../calibracao.ts'
import { pendenciasEmissao, PENDENCIA_TECNICO_EXCLUIDO } from '../dominio.ts'
import { CRITERIO_NAO_PESA_CORRETAMENTE, emaInstrumento, formatarNumero } from '../metrologia/index.ts'
import type { Padrao } from '../tipos.ts'
import {
  avisoConferido,
  avisosDaLeitura,
  avisosDoPasso,
  avisosDoRegistro,
  avisosPendentes,
  classeDaPendencia,
  conferirAviso,
  contextoDaLeitura,
  faixaDosAvisos,
  pendenciasDoRegistro,
  TEXTO_NAO_PESA,
} from './avisos.ts'
import type { AvisoCampo } from './avisos.ts'
import {
  APARELHO_EXEMPLO,
  exemplosCampo,
  pacoteClasseI,
  pacoteDoCliente,
  pacoteEmBranco,
  pacotePlataforma,
  pacoteRodoviaria,
  registroClasseI,
  registroDoCliente,
  registroPlataforma,
  registroRodoviaria,
  TECNICO_EXEMPLO,
} from './exemplos.ts'
import { balancaDoCampo, padroesDoPacote, registroParaRascunho } from './importar.ts'
import { registroInicial } from './registro.ts'
import type { LeituraCampo, PacoteCampo, RegistroCampo } from './tipos.ts'

const HOJE = '2026-11-18'
const L = (valor: string, em = '2026-10-21T09:00:00-03:00'): LeituraCampo => ({ valor, em, via: 'teclado' })
/** Os avisos de uma leitura num caminho do registro. */
function naLeitura(r: RegistroCampo, p: PacoteCampo, campo: string, valor: string | LeituraCampo): AvisoCampo[] {
  const ctx = contextoDaLeitura(r, p, campo)
  if (!ctx) throw new Error(`sem contexto: ${campo}`)
  return avisosDaLeitura(ctx, typeof valor === 'string' ? L(valor) : valor)
}
const codigos = (avisos: AvisoCampo[]) => avisos.map((a) => `${a.codigo}:${a.classe}`)
const conf = (r: RegistroCampo, campo: string, observado?: string) =>
  Object.assign(
    r.passos.balanca.conferencias.find((c) => c.campo === campo)!,
    { confere: false, observado },
  )

describe('avisos de uma leitura', () => {
  it('múltiplo da divisão, menos casas e mais casas: "Confira a digitação"', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const fora = naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,03')
    expect(fora).toEqual([
      {
        codigo: 'FORA_DA_DIVISAO',
        classe: 'DIGITACAO',
        passo: 5,
        campo: 'indicacao.pontos.p3.crescente',
        texto:
          '100,03 não é múltiplo de d = 0,05 kg. Confira o mostrador. Se a balança indica mais fino que d, marque “Algo diferente” no d (passo 3).',
        falta: false,
      },
    ])
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,0')[0]).toMatchObject({
      codigo: 'MENOS_CASAS',
      texto: 'A divisão tem 2 casas (d = 0,05 kg) e a leitura só 1. Escreva todos os dígitos do mostrador.',
    })
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100')[0].texto).toContain('e a leitura nenhuma.')
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,050')).toMatchObject([
      { codigo: 'MAIS_CASAS', texto: 'A divisão tem 2 casas (d = 0,05 kg). Confira se não sobrou um dígito.' },
    ])
    // O zero escrito "0" não esconde dígito
    expect(naLeitura(r, p, 'indicacao.pontos.p0.crescente', '0')).toEqual([])
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,05')).toEqual([])
    // Retorno ao zero, repetibilidade, excentricidade e substituição também conferem a divisão
    expect(codigos(naLeitura(r, p, 'indicacao.retornoZero', '0,02'))).toEqual(['FORA_DA_DIVISAO:DIGITACAO'])
    expect(codigos(naLeitura(r, p, 'repetibilidade.rep1.leituras.2', '150,07'))).toEqual(['FORA_DA_DIVISAO:DIGITACAO'])
    expect(codigos(naLeitura(r, p, 'excentricidade.posicoes.1.leitura', '100,01'))).toEqual(['FORA_DA_DIVISAO:DIGITACAO'])
    const rod = registroRodoviaria()
    expect(codigos(naLeitura(rod, pacoteRodoviaria(), 'indicacao.substituicao.etapas.0.substituicao', '10030'))).toEqual([
      'FORA_DA_DIVISAO:DIGITACAO',
    ])
  })

  it('leitura vazia ou fora do formato do teclado: nada (o teclado não deixa)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const ctx = contextoDaLeitura(r, p, 'indicacao.pontos.p3.crescente')!
    expect(avisosDaLeitura(ctx, null)).toEqual([])
    expect(avisosDaLeitura(ctx, '')).toEqual([])
    expect(avisosDaLeitura(ctx, '100.05')).toEqual([])
    expect(contextoDaLeitura(r, p, 'chegada.inicio')).toBeNull()
  })

  it('longe da carga: impede o certificado (é pendência pelas regras do POP); fora delas, só digitação', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '1000,05')).toEqual([
      expect.objectContaining({
        codigo: 'LONGE_DA_CARGA',
        classe: 'IMPEDE',
        texto: '1000,05 está muito longe da carga de 100,00 kg. Confira a digitação ou os pesos.',
      }),
    ])
    expect(naLeitura(r, p, 'repetibilidade.rep1.leituras.0', '15,00')[0]).toMatchObject({
      codigo: 'LONGE_DA_CARGA',
      classe: 'IMPEDE',
    })
    expect(naLeitura(r, p, 'excentricidade.posicoes.0.leitura', '10,00')[0]).toMatchObject({ codigo: 'LONGE_DA_CARGA' })
    // Classe I (método 3): o zero antes de cada posição também
    const ci = registroClasseI()
    expect(naLeitura(ci, pacoteClasseI(), 'excentricidade.posicoes.0.zeroAntes', '0,0100')[0]).toMatchObject({
      codigo: 'LONGE_DA_CARGA',
      classe: 'IMPEDE',
      texto: '0,0100 g sem carga na balança. Confira a digitação.',
    })
    // Plataforma (método 1): o zero antes não é conferido
    expect(naLeitura(r, p, 'excentricidade.posicoes.0.zeroAntes', '5,00')).toEqual([])
    // Revisão de um certificado de antes das regras do POP: só digitação, e a balança que não pesa não é conferida
    p.entrada.calculoLegado = true
    expect(codigos(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '1000,05'))).toEqual(['LONGE_DA_CARGA:DIGITACAO'])
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,20')).toEqual([])
  })

  it('a balança que não pesa corretamente (POP 7.8): o texto neutro, nunca "reprovada"', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    // O limite é o EMA em serviço da classe (o mesmo do cálculo), pela carga nominal
    const limite = emaInstrumento(100, p.balanca!, CRITERIO_NAO_PESA_CORRETAMENTE)!
    const zero = emaInstrumento(0, p.balanca!, CRITERIO_NAO_PESA_CORRETAMENTE)!
    const texto = (v: number) => formatarNumero(v, 2)
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', texto(100 + limite))).toEqual([])
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', texto(100 + limite + 0.05))).toEqual([
      expect.objectContaining({ codigo: 'NAO_PESA_CORRETAMENTE', classe: 'IMPEDE', texto: TEXTO_NAO_PESA }),
    ])
    expect(TEXTO_NAO_PESA).toBe(
      'As leituras indicam que a balança precisa de manutenção antes da calibração (POP 7.8). Fale com o escritório.',
    )
    expect(naLeitura(r, p, 'indicacao.pontos.p3.decrescente', texto(100 - limite - 0.05))[0].codigo).toBe('NAO_PESA_CORRETAMENTE')
    expect(naLeitura(r, p, 'indicacao.retornoZero', texto(zero))).toEqual([])
    expect(naLeitura(r, p, 'indicacao.retornoZero', texto(zero + 0.05))[0].codigo).toBe('NAO_PESA_CORRETAMENTE')
    // A repetibilidade não é conferida contra o EMA
    expect(naLeitura(r, p, 'repetibilidade.rep1.leituras.0', '151,00')).toEqual([])
    // Sem classe: a tolerância do cliente (conformidade pelo critério do cliente); sem as duas, não confere
    p.balanca!.classe = ''
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '101,00')).toEqual([])
    p.entrada.conformidade = { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0.5, regra: 'SIMPLES' }
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,50')).toEqual([])
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,55')[0].codigo).toBe('NAO_PESA_CORRETAMENTE')
  })

  it('múltiplas faixas: a descida sem descarregar é lida na faixa da maior carga', () => {
    const p = pacotePlataforma()
    p.balanca!.tipoFaixas = 'MULTIPLAS_FAIXAS'
    p.balanca!.faixas = [
      { max: 150, e: 0.02, d: 0.02 },
      { max: 300, e: 0.05, d: 0.05 },
    ]
    const r = registroPlataforma()
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,02')).toEqual([])
    expect(codigos(naLeitura(r, p, 'indicacao.pontos.p3.decrescente', '100,02'))).toEqual(['FORA_DA_DIVISAO:DIGITACAO'])
  })

  it('divisão de teste (resolução aumentada): o d dela', () => {
    const p = pacotePlataforma()
    p.entrada.opcoes.divisaoTeste = 0.01
    const r = registroPlataforma()
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,03')).toEqual([])
    expect(codigos(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,035'))).toEqual(['FORA_DA_DIVISAO:DIGITACAO'])
  })

  it('carga escrita no local acima de Max: impede', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    expect(naLeitura(r, p, 'indicacao.pontos.p6.cargaAplicada', '350')).toEqual([
      expect.objectContaining({
        codigo: 'CARGA_ACIMA_DE_MAX',
        classe: 'IMPEDE',
        texto: 'Carga acima da capacidade (Max 300 kg). Confira a carga.',
      }),
    ])
    expect(naLeitura(r, p, 'repetibilidade.rep1.cargaAplicada', '300')).toEqual([])
    expect(codigos(naLeitura(r, p, 'excentricidade.cargaAplicada', '301'))).toEqual(['CARGA_ACIMA_DE_MAX:IMPEDE'])
  })

  it('duas leituras seguidas a menos de 5 s (repetibilidade e excentricidade)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const anterior = r.passos.repetibilidade[0].leituras[1].em
    const mais = (s: number) => new Date(Date.parse(anterior) + s * 1000).toISOString()
    expect(naLeitura(r, p, 'repetibilidade.rep1.leituras.2', { valor: '150,00', em: mais(3), via: 'repetir' })).toEqual([
      expect.objectContaining({
        codigo: 'LEITURA_RAPIDA',
        classe: 'DIGITACAO',
        texto: 'Duas leituras com menos de 5 s entre elas. Tirou e pôs a carga de novo?',
      }),
    ])
    expect(naLeitura(r, p, 'repetibilidade.rep1.leituras.2', { valor: '150,00', em: mais(6), via: 'repetir' })).toEqual([])
    // A primeira leitura não tem anterior; no erro de indicação a regra não vale
    expect(naLeitura(r, p, 'repetibilidade.rep1.leituras.0', { valor: '150,00', em: mais(1), via: 'teclado' })).toEqual([])
    const exc = r.passos.excentricidade.posicoes[0].leitura!.em
    expect(
      codigos(
        naLeitura(r, p, 'excentricidade.posicoes.1.leitura', {
          valor: '100,05',
          em: new Date(Date.parse(exc) + 2000).toISOString(),
          via: 'repetir',
        }),
      ),
    ).toEqual(['LEITURA_RAPIDA:DIGITACAO'])
  })

  it('ambiente: improvável (digitação) e fora da faixa aceita ou em kPa (impede, quando vai para o certificado)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    expect(naLeitura(r, p, 'ambiente.linhas.0.temperatura', '41,0')).toEqual([
      expect.objectContaining({
        codigo: 'TEMPERATURA_IMPROVAVEL',
        classe: 'DIGITACAO',
        passo: 4,
        texto:
          '41,0 °C está fora da faixa de uso das balanças (−10 °C a 40 °C). Confira a digitação; se for isso mesmo, anote em Anotações.',
      }),
    ])
    expect(naLeitura(r, p, 'ambiente.linhas.0.temperatura', '85')).toEqual([
      expect.objectContaining({
        codigo: 'AMBIENTE_FORA_DA_FAIXA',
        classe: 'IMPEDE',
        texto: '85 °C está fora da faixa aceita (−40 °C a 80 °C). Confira o valor.',
      }),
    ])
    expect(codigos(naLeitura(r, p, 'ambiente.linhas.1.temperatura', '85'))).toEqual(['AMBIENTE_FORA_DA_FAIXA:IMPEDE'])
    expect(naLeitura(r, p, 'ambiente.linhas.0.umidade', '5')[0]).toMatchObject({
      codigo: 'UMIDADE_IMPROVAVEL',
      texto: 'Umidade de 5 %: confira a digitação.',
    })
    expect(codigos(naLeitura(r, p, 'ambiente.linhas.0.umidade', '120'))).toEqual(['AMBIENTE_FORA_DA_FAIXA:IMPEDE'])
    expect(naLeitura(r, p, 'ambiente.linhas.0.pressao', '94,8')).toEqual([
      expect.objectContaining({
        codigo: 'PRESSAO_EM_KPA',
        classe: 'IMPEDE',
        texto: '94,8 parece estar em kPa. A folha pede hPa (ex.: 948).',
      }),
    ])
    // A pressão do fim não vai para o certificado (vai a do início): só digitação
    expect(codigos(naLeitura(r, p, 'ambiente.linhas.1.pressao', '94,8'))).toEqual(['PRESSAO_EM_KPA:DIGITACAO'])
    expect(naLeitura(r, p, 'ambiente.linhas.0.pressao', '1150')[0]).toMatchObject({
      codigo: 'PRESSAO_IMPROVAVEL',
      texto: 'Pressão de 1150 hPa: improvável para o local. Confira o barômetro e a digitação.',
    })
    expect(codigos(naLeitura(r, p, 'ambiente.linhas.0.pressao', '1300'))).toEqual(['AMBIENTE_FORA_DA_FAIXA:IMPEDE'])
    expect(naLeitura(r, p, 'ambiente.linhas.0.pressao', '948,7')).toEqual([])
    // Classe I: a linha do início que foi medida de novo (a primeira não vai para o certificado)
    const ci = registroClasseI()
    expect(codigos(naLeitura(ci, pacoteClasseI(), 'ambiente.linhas.0.temperatura', '85'))).toEqual([
      'AMBIENTE_FORA_DA_FAIXA:DIGITACAO',
    ])
    expect(codigos(naLeitura(ci, pacoteClasseI(), 'ambiente.linhas.1.temperatura', '85'))).toEqual([
      'AMBIENTE_FORA_DA_FAIXA:IMPEDE',
    ])
    expect(codigos(naLeitura(ci, pacoteClasseI(), 'ambiente.deltaT0.origem', '45'))).toEqual(['TEMPERATURA_IMPROVAVEL:DIGITACAO'])
  })

  it('classe I: ΔT pesos − ar acima do limite (1 °C com E2; 3 °C só com F1)', () => {
    const p = pacoteClasseI()
    const r = registroClasseI()
    expect(naLeitura(r, p, 'ambiente.deltaT.2.valor', '1,4')).toEqual([
      expect.objectContaining({
        codigo: 'DELTA_T_ACIMA',
        classe: 'IMPEDE',
        texto: 'ΔT de 1,4 °C, acima de 1 °C. Aguarde a aclimatação dos pesos e meça de novo (POP 7.4).',
      }),
    ])
    expect(naLeitura(r, p, 'ambiente.deltaT.2.valor', '-1,0')).toEqual([])
    expect(codigos(naLeitura(r, p, 'ambiente.deltaT.2.valor', '35'))).toEqual(['AMBIENTE_FORA_DA_FAIXA:IMPEDE'])
    p.padroes.cadastro.find((x) => x.id === 'pad-je2')!.classe = 'F1'
    expect(naLeitura(r, p, 'ambiente.deltaT.2.valor', '1,4')).toEqual([])
    expect(codigos(naLeitura(r, p, 'ambiente.deltaT.2.valor', '3,2'))).toEqual(['DELTA_T_ACIMA:IMPEDE'])
    // Fora da classe I não há limite
    expect(contextoDaLeitura(registroPlataforma(), pacotePlataforma(), 'ambiente.deltaT.0.valor')!.limiteDeltaT).toBeNull()
  })

  it('"Algo diferente…" com o valor visto em campo: os avisos usam o valor visto (e explicam)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    conf(r, 'balanca.d', '0,01')
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,03')).toEqual([])
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,005')).toEqual([
      expect.objectContaining({
        codigo: 'FORA_DA_DIVISAO',
        texto: '100,005 não é múltiplo de d = 0,01 kg. Confira o mostrador.',
      }),
    ])
    expect(faixaDosAvisos(r, p)).toEqual(['Avisos pelo valor visto em campo: d = 0,01 kg.'])
    // A classe vista: o EMA muda (o da classe II é menor que o da III)
    const limiteIII = emaInstrumento(100, p.balanca!, CRITERIO_NAO_PESA_CORRETAMENTE)!
    const limiteII = emaInstrumento(100, { ...p.balanca!, classe: 'II' }, CRITERIO_NAO_PESA_CORRETAMENTE)!
    expect(limiteII).toBeLessThan(limiteIII)
    const entre = formatarNumero(100 + limiteII + 0.01, 2)
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', entre)).toEqual([])
    conf(r, 'balanca.classe', 'II')
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', entre)[0].codigo).toBe('NAO_PESA_CORRETAMENTE')
    expect(faixaDosAvisos(r, p)).toEqual(['Avisos pelo valor visto em campo: d = 0,01 kg, classe II.'])
    // Sem o valor (ou ilegível): os avisos que dependem dele ficam desligados
    const s = registroPlataforma()
    conf(s, 'balanca.d', '')
    conf(s, 'balanca.classe', 'não sei')
    expect(naLeitura(s, p, 'indicacao.pontos.p3.crescente', '100,03')).toEqual([])
    expect(naLeitura(s, p, 'indicacao.pontos.p3.crescente', '100,20')).toEqual([])
    expect(faixaDosAvisos(s, p)).toEqual([
      'Sem o valor visto em campo de d e classe: os avisos que dependem disso estão desligados.',
    ])
    expect(faixaDosAvisos(registroPlataforma(), p)).toEqual([])
  })

  it('a unidade vista em campo: as leituras na unidade do mostrador, as cargas convertidas', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    conf(r, 'balanca.unidade', 'g')
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100050')).toEqual([])
    expect(naLeitura(r, p, 'indicacao.pontos.p3.crescente', '100,05').find((a) => a.codigo !== 'FORA_DA_DIVISAO')).toMatchObject({
      codigo: 'LONGE_DA_CARGA',
      texto: '100,05 está muito longe da carga de 100 000 g. Confira a digitação ou os pesos.'.replace('100 000', '100 000'),
    })
  })

  it('balança informada no local (folha só do cliente): pelo que o técnico escreveu; sem unidade, sem avisos de massa', () => {
    const p = pacoteDoCliente()
    const r = registroDoCliente()
    expect(codigos(naLeitura(r, p, 'repetibilidade.cel-r1.leituras.1', '50,03'))).toEqual(['FORA_DA_DIVISAO:DIGITACAO'])
    expect(naLeitura(r, p, 'indicacao.pontos.cel-p3.crescente', '100,05')).toEqual([])
    r.passos.balanca.informada!.unidade = ''
    expect(naLeitura(r, p, 'repetibilidade.cel-r1.leituras.1', '50,03')).toEqual([])
    expect(faixaDosAvisos(r, p)).toEqual(['Falta unidade da balança: os avisos que dependem disso estão desligados.'])
  })
})

describe('avisos da folha e do passo', () => {
  it('as folhas dos exemplos, completas e certas: nenhum aviso', () => {
    for (const { nome, pacote, registro } of exemplosCampo())
      expect([nome, avisosDoRegistro(registro, pacote, { hoje: HOJE })]).toEqual([nome, []])
  })

  it('padrão vencido no dia da calibração e calibrado há mais de 24 meses: impede (resolve-se no local, com outro)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    p.padroes.cadastro.find((x) => x.id === 'pad-br01')!.validade = '2026-10-01'
    Object.assign(
      p.padroes.cadastro.find((x) => x.id === 'pad-jp01')!,
      { dataCalibracao: '2024-09-01', validade: '2027-01-01' },
    )
    const avisos = avisosDoRegistro(r, p, { hoje: HOJE })
    // Na ordem dos padrões (a do pacote)
    expect(avisos).toEqual([
      {
        codigo: 'PADRAO_FORA_DO_INTERVALO',
        classe: 'IMPEDE',
        passo: 1,
        campo: 'padroes.pad-jp01',
        texto: 'O padrão JP-01 foi calibrado em 01/09/2024, há mais de 24 meses (POP, Tabela 3). Use outro padrão.',
        falta: false,
      },
      {
        codigo: 'PADRAO_VENCIDO',
        classe: 'IMPEDE',
        passo: 1,
        campo: 'padroes.pad-br01',
        texto: 'O padrão BR-01 estava vencido no dia da calibração (venceu em 01/10/2026). Use outro padrão.',
        falta: false,
      },
    ])
    expect(avisosDoPasso(r, p, 1, { hoje: HOJE })).toHaveLength(2)
    expect(avisosDoPasso(r, p, 5, { hoje: HOJE })).toEqual([])
  })

  it('classe I: só o ΔT que vale (o último antes do 1º ensaio) é conferido contra o limite', () => {
    const p = pacoteClasseI()
    const r = registroClasseI()
    expect(r.passos.ambiente.deltaT.map((x) => x.valor.valor)).toEqual(['1,6', '0,6'])
    expect(avisosDoRegistro(r, p, { hoje: HOJE })).toEqual([])
    r.passos.ambiente.deltaT[1].valor.valor = '1,2'
    expect(avisosDoRegistro(r, p, { hoje: HOJE })).toEqual([
      expect.objectContaining({ codigo: 'DELTA_T_ACIMA', classe: 'IMPEDE', campo: 'ambiente.deltaT.1.valor' }),
    ])
  })

  it('repetibilidade com menos leituras que o mínimo: 5 (3 com ≥ 100 kg), 10 na classe I', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    // 150 kg: o mínimo é 3 (carga ≥ 100 kg)
    r.passos.repetibilidade[0].leituras.splice(3)
    expect(avisosDoRegistro(r, p, { hoje: HOJE })).toEqual([])
    r.passos.repetibilidade[0].leituras.splice(2)
    expect(avisosDoRegistro(r, p, { hoje: HOJE })).toEqual([
      {
        codigo: 'POUCAS_LEITURAS_REPETIBILIDADE',
        classe: 'IMPEDE',
        passo: 6,
        campo: 'repetibilidade.rep1',
        texto: 'Repetibilidade a 150,00 kg: 2 leituras; o mínimo é 3 (POP, Tabela 4). Faça mais leituras.',
        falta: false,
      },
    ])
    const rod = registroRodoviaria()
    expect(avisosDoRegistro(rod, pacoteRodoviaria(), { hoje: HOJE })).toEqual([])
    rod.passos.repetibilidade[0].leituras.splice(2)
    expect(avisosDoRegistro(rod, pacoteRodoviaria(), { hoje: HOJE })[0].texto).toBe(
      'Repetibilidade a 10 000 kg: 2 leituras; o mínimo é 3 (POP, Tabela 4). Faça mais leituras.',
    )
    const ci = registroClasseI()
    ci.passos.repetibilidade[0].leituras.splice(6)
    expect(avisosDoRegistro(ci, pacoteClasseI(), { hoje: HOJE })[0].texto).toContain('6 leituras; o mínimo é 10')
    // Abaixo de 100 kg, o mínimo é 5 (a folha só do cliente, 50 kg)
    const cli = registroDoCliente()
    cli.passos.repetibilidade[0].leituras.splice(4)
    expect(avisosDoRegistro(cli, pacoteDoCliente(), { hoje: HOJE })[0].texto).toBe(
      'Repetibilidade a 50,00 kg: 4 leituras; o mínimo é 5 (POP, Tabela 4). Faça mais leituras.',
    )
    // Calibração medida antes das regras do POP: os mínimos são só aviso no sistema (aqui, nada)
    const legado = pacotePlataforma()
    legado.entrada.minimosComoAviso = true
    expect(avisosDoRegistro(r, legado, { hoje: HOJE }).some((a) => a.codigo === 'POUCAS_LEITURAS_REPETIBILIDADE')).toBe(false)
  })

  it('a balança que não pesa corretamente no registro: um aviso por leitura, com o texto neutro', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.indicacao.pontos.find((x) => x.id === 'p5')!.crescente!.valor = '200,30'
    const avisos = avisosDoRegistro(r, p, { hoje: HOJE })
    expect(avisos).toEqual([
      expect.objectContaining({
        codigo: 'NAO_PESA_CORRETAMENTE',
        classe: 'IMPEDE',
        campo: 'indicacao.pontos.p5.crescente',
        texto: TEXTO_NAO_PESA,
      }),
    ])
  })

  it('o que falta vem como IMPEDE com a marca de falta (a Revisão junta com o "Falta para assinar")', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.ambiente.linhas[1].temperatura = null
    expect(avisosDoRegistro(r, p, { hoje: HOJE })).toEqual([
      {
        codigo: 'FALTA_TEMPERATURA',
        classe: 'IMPEDE',
        passo: 4,
        campo: '',
        texto: 'Registre a temperatura no início e no fim (passo 4).',
        falta: true,
      },
    ])
  })

  it('o que é do escritório nunca aparece no celular (cadastro do padrão, conformidade, próxima calibração)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    Object.assign(
      p.padroes.cadastro.find((x) => x.id === 'pad-th01')!,
      { acreditacao: '', certificado: '' },
    )
    p.entrada.conformidade = { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0, regra: 'SIMPLES' }
    p.entrada.proximaNoCertificado = true
    p.entrada.proximaCalibracao = ''
    expect(pendenciasDoRegistro(r, p, { hoje: HOJE }).length).toBeGreaterThanOrEqual(4)
    expect(avisosDoRegistro(r, p, { hoje: HOJE })).toEqual([])
  })

  it('conferir um aviso: fica registrado; se o valor muda, o aviso volta', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.indicacao.pontos.find((x) => x.id === 'p3')!.crescente!.valor = '100,03'
    const [aviso] = avisosDoRegistro(r, p, { hoje: HOJE })
    expect(aviso.codigo).toBe('FORA_DA_DIVISAO')
    const conferido = conferirAviso(aviso, '2026-10-21T09:10:00-03:00', '  ')
    expect(conferido).toEqual({
      codigo: 'FORA_DA_DIVISAO',
      classe: 'DIGITACAO',
      campo: 'indicacao.pontos.p3.crescente',
      texto: aviso.texto,
      em: '2026-10-21T09:10:00-03:00',
      motivo: '',
    })
    r.avisosConferidos.push(conferido)
    expect(avisoConferido(aviso, r)).toEqual(conferido)
    expect(avisosPendentes(avisosDoRegistro(r, p, { hoje: HOJE }), r)).toEqual([])
    r.passos.indicacao.pontos.find((x) => x.id === 'p3')!.crescente!.valor = '100,02'
    expect(avisosPendentes(avisosDoRegistro(r, p, { hoje: HOJE }), r)).toHaveLength(1)
  })

  it('a correção depois da assinatura entra nos avisos (o valor corrigido é o que vale)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.correcoesPosAssinatura[0].para = '100,02'
    expect(avisosDoRegistro(r, p, { hoje: HOJE })).toEqual([
      expect.objectContaining({ codigo: 'FORA_DA_DIVISAO', campo: 'excentricidade.posicoes.3.leitura' }),
    ])
  })
})

// ---- Toda pendência de emissão que depende só do campo cai em IMPEDE ------------------------------------------------

type Cenario = { nome: string; pacote: PacoteCampo; registro: RegistroCampo }

function cenario(
  nome: string,
  base: () => { p: PacoteCampo; r: RegistroCampo },
  mudar: (r: RegistroCampo, p: PacoteCampo) => void,
): Cenario {
  const { p, r } = base()
  mudar(r, p)
  return { nome, pacote: p, registro: r }
}
const plataforma = () => ({ p: pacotePlataforma(), r: registroPlataforma() })
const rodoviaria = () => ({ p: pacoteRodoviaria(), r: registroRodoviaria() })
const classeI = () => ({ p: pacoteClasseI(), r: registroClasseI() })
const doCliente = () => ({ p: pacoteDoCliente(), r: registroDoCliente() })
const ponto = (r: RegistroCampo, id: string) => r.passos.indicacao.pontos.find((x) => x.id === id)!

/** Cenários que provocam as pendências que dependem do campo (e algumas do escritório). */
function cenarios(): Cenario[] {
  const vazios = [pacotePlataforma(), pacoteRodoviaria(), pacoteClasseI(), pacoteDoCliente(), pacoteEmBranco()].map((p) => ({
    nome: `vazia ${p.folha.numero}`,
    pacote: p,
    registro: registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: '2026-10-21T08:00:00-03:00' }),
  }))
  return [
    ...vazios,
    cenario('sem a temperatura do fim e com a pressão em kPa', plataforma, (r) => {
      r.passos.ambiente.linhas[1].temperatura = null
      r.passos.ambiente.linhas[0].pressao = L('94,8')
    }),
    cenario('temperatura e umidade fora da faixa', plataforma, (r) => {
      r.passos.ambiente.linhas[0].temperatura = L('85')
      r.passos.ambiente.linhas[1].umidade = L('120')
    }),
    cenario('sem pressão e sem barômetro marcado', plataforma, (r) => {
      r.passos.ambiente.linhas.forEach((l) => Object.assign(l, { pressao: null, instrumentos: ['pad-th01'] }))
    }),
    cenario('pressão sem o barômetro marcado', plataforma, (r) => {
      r.passos.ambiente.linhas.forEach((l) => (l.instrumentos = ['pad-th01']))
    }),
    cenario('leituras longe da carga e a balança que não pesa', plataforma, (r) => {
      ponto(r, 'p3').crescente!.valor = '1000,05'
      ponto(r, 'p5').crescente!.valor = '200,30'
      r.passos.indicacao.retornoZero!.valor = '0,20'
      r.passos.repetibilidade[0].leituras[0].valor = '15,00'
      r.passos.excentricidade.posicoes[0].leitura!.valor = '10,00'
    }),
    cenario('sem descida, sem subida, sem o zero e sem o retorno ao zero', plataforma, (r) => {
      ponto(r, 'p4').decrescente = null
      ponto(r, 'p5').crescente = null
      ponto(r, 'p0').crescente = null
      r.passos.indicacao.retornoZero = null
    }),
    cenario('só 3 pontos lidos', plataforma, (r) => {
      r.passos.indicacao.pontos.slice(3).forEach((x) => Object.assign(x, { crescente: null, decrescente: null }))
    }),
    cenario('só o zero lido', plataforma, (r) => {
      r.passos.indicacao.pontos.slice(1).forEach((x) => Object.assign(x, { crescente: null, decrescente: null }))
    }),
    cenario('repetibilidade com poucas leituras', plataforma, (r) => {
      r.passos.repetibilidade[0].leituras.splice(2)
    }),
    cenario('repetibilidade sem leituras', plataforma, (r) => {
      r.passos.repetibilidade[0].leituras = []
    }),
    cenario('excentricidade com posições sem leitura e carga acima de Max', plataforma, (r) => {
      r.passos.excentricidade.posicoes[3].leitura = null
      r.passos.excentricidade.posicoes[4].leitura = null
      r.passos.excentricidade.cargaAplicada = L('350')
      ponto(r, 'p6').cargaAplicada = L('320')
    }),
    cenario('excentricidade dispensada numa plataforma, sem motivo', plataforma, (r) => {
      Object.assign(r.passos.excentricidade, { aplicavel: false, motivo: '' })
    }),
    cenario('excentricidade sem leituras', plataforma, (r) => {
      r.passos.excentricidade.posicoes.forEach((x) => (x.leitura = null))
    }),
    cenario('nenhum padrão marcado e o ambiente sem instrumento', plataforma, (r) => {
      r.passos.padroes.forEach((x) => (x.usado = false))
      r.passos.ambiente.linhas.forEach((l) => (l.instrumentos = []))
    }),
    cenario('um jogo das cargas não marcado como usado', plataforma, (r) => {
      r.passos.padroes.find((x) => x.id === 'pad-pp20')!.usado = false
    }),
    cenario('pesos trocados que não fecham a carga e ponto sem pesos', plataforma, (r) => {
      Object.assign(ponto(r, 'p3'), { pecas: ponto(r, 'p1').pecas, pecasTrocadas: true })
      Object.assign(ponto(r, 'p4'), { pecas: [], pecasTrocadas: true })
    }),
    cenario('ponto acrescentado lido sem carga depois do zero', plataforma, (r) => {
      r.passos.indicacao.pontos.push({
        id: 'cel-extra',
        acrescentado: true,
        cargaPrevista: '',
        cargaAplicada: L('0'),
        pecas: [],
        pecasTrocadas: false,
        nivelSubstituicao: 0,
        crescente: L('0,00'),
        decrescente: null,
      })
    }),
    cenario('padrão vencido e calibrado há mais de 24 meses', plataforma, (_r, p) => {
      p.padroes.cadastro.find((x) => x.id === 'pad-br01')!.validade = '2026-10-01'
      p.padroes.cadastro.find((x) => x.id === 'pad-jp01')!.dataCalibracao = '2024-09-01'
    }),
    cenario('data futura e sem o endereço da calibração', plataforma, (r, p) => {
      r.passos.final.dataCalibracao = '2026-12-31'
      p.folha.localEndereco = ''
      p.entrada.localEndereco = ''
    }),
    cenario('padrões com o cadastro incompleto (escritório)', plataforma, (_r, p) => {
      Object.assign(
        p.padroes.cadastro.find((x) => x.id === 'pad-th01')!,
        { acreditacao: '', certificado: '', validade: '' },
      )
      Object.assign(
        p.padroes.cadastro.find((x) => x.id === 'pad-pp20')!,
        { ativo: false, dataCalibracao: '2026-11-01' },
      )
      p.padroes.cadastro.find((x) => x.id === 'pad-jp01')!.classe = ''
      p.entrada.conformidade = { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0, regra: 'SIMPLES' }
      p.entrada.proximaNoCertificado = true
      p.entrada.proximaCalibracao = ''
    }),
    cenario('rodoviária: etapa de substituição sem leitura', rodoviaria, (r) => {
      r.passos.indicacao.substituicao!.etapas[1].substituicao = null
    }),
    cenario('rodoviária: etapas a menos', rodoviaria, (r) => {
      r.passos.indicacao.substituicao!.etapas.pop()
    }),
    cenario('classe I: sem umidade, sem ΔT, termômetro não marcado', classeI, (r) => {
      r.passos.ambiente.linhas.forEach((l) => (l.umidade = null))
      r.passos.ambiente.deltaT = []
    }),
    cenario('classe I: ΔT medido sem o termômetro de duas entradas marcado', classeI, (r) => {
      r.passos.padroes.find((x) => x.id === 'pad-td01')!.usado = false
      r.passos.ambiente.deltaT.forEach((x) => (x.instrumento = ''))
    }),
    cenario('classe I: ΔT acima de 20 °C e 6 leituras na repetibilidade', classeI, (r) => {
      r.passos.ambiente.deltaT[1].valor.valor = '25'
      r.passos.repetibilidade[0].leituras.splice(6)
    }),
    cenario('classe I: jogo M1 e pelo nominal (escritório)', classeI, (_r, p) => {
      Object.assign(
        p.padroes.cadastro.find((x) => x.id === 'pad-je2')!,
        { classe: 'M1', uso: 'NOMINAL', densidade: 0 },
      )
      p.entrada.opcoes = { ...p.entrada.opcoes, empuxo: 'NENHUM', conveccao: 'NAO_CONSIDERAR' }
    }),
    cenario('balança informada sem faixa e sem identificação', doCliente, (r) => {
      Object.assign(r.passos.balanca.informada!, {
        faixas: [{ max: '', e: '', d: '' }],
        numeroSerie: '',
        identificacao: '',
        plataforma: '',
      })
    }),
    cenario('balança informada sem identificação', doCliente, (r) => {
      Object.assign(r.passos.balanca.informada!, { numeroSerie: '', identificacao: '', plataforma: '' })
    }),
    cenario('repetibilidade escrita sem a carga', doCliente, (r) => {
      r.passos.repetibilidade[0].cargaAplicada = null
    }),
    cenario('excentricidade escrita sem a carga', doCliente, (r) => {
      r.passos.excentricidade.cargaAplicada = null
    }),
    cenario('múltiplas faixas com um ensaio de repetibilidade só', plataforma, (_r, p) => {
      p.balanca!.tipoFaixas = 'MULTIPLAS_FAIXAS'
      p.balanca!.faixas = [
        { max: 150, e: 0.05, d: 0.05 },
        { max: 300, e: 0.1, d: 0.1 },
      ]
    }),
  ]
}

/** As pendências que o escritório veria com o rascunho do registro (as mesmas regras de `pendenciasDa` no servidor). */
function pendenciasDoEscritorio(registro: RegistroCampo, pacote: PacoteCampo): string[] {
  const k = registroParaRascunho(registro, pacote)
  const balanca = balancaDoCampo(registro, pacote)
  const padroes: Padrao[] = padroesDoPacote(pacote, k.padroesIds)
  const p = pendenciasEmissao(k, {
    padroes,
    hoje: HOJE,
    temPesos: padroes.some((x) => x.tipo === 'PESOS'),
    classe: balanca?.classe ?? pacote.balanca?.classe,
    ...(balanca ? { balanca } : {}),
  })
  if (balanca) p.push(...calcularCalibracao(k, balanca, padroes).resultado.pendencias)
  return [...new Set(p)]
}

describe('toda pendência de emissão que depende só do campo cai em "Isto impede o certificado"', () => {
  const todos = cenarios()

  it('os cenários provocam muitas pendências diferentes (das duas origens)', () => {
    const codigosVistos = new Set<string>()
    for (const c of todos)
      for (const t of pendenciasDoEscritorio(c.registro, c.pacote))
        codigosVistos.add(classeDaPendencia(t, { balancaInformada: !!c.registro.passos.balanca.informada })?.codigo ?? t)
    expect(codigosVistos.size).toBeGreaterThanOrEqual(40)
  })

  it('cada pendência tem classe (uma nova sem classe faz este teste falhar)', () => {
    const semClasse: string[] = []
    for (const c of todos)
      for (const t of pendenciasDoEscritorio(c.registro, c.pacote)) if (!classeDaPendencia(t)) semClasse.push(`${c.nome}: ${t}`)
    expect(semClasse).toEqual([])
  })

  it('cada pendência do campo vira um aviso IMPEDE (com o mesmo código); as do escritório, nenhum', () => {
    for (const c of todos) {
      const informada = !!c.registro.passos.balanca.informada
      const avisos = avisosDoRegistro(c.registro, c.pacote, { hoje: HOJE })
      const impede = new Set(avisos.filter((a) => a.classe === 'IMPEDE').map((a) => a.codigo))
      for (const t of pendenciasDoEscritorio(c.registro, c.pacote)) {
        const classe = classeDaPendencia(t, { balancaInformada: informada })!
        if (classe.classe === 'IMPEDE') expect([c.nome, t, impede.has(classe.codigo)]).toEqual([c.nome, t, true])
      }
      // Nenhum aviso IMPEDE de pendência do escritório
      const doEscritorio = pendenciasDoEscritorio(c.registro, c.pacote)
        .map((t) => classeDaPendencia(t, { balancaInformada: informada })!)
        .filter((x) => x.classe === 'ESCRITORIO')
        .map((x) => x.codigo)
      expect(avisos.filter((a) => doEscritorio.includes(a.codigo) && !impede.has(a.codigo))).toEqual([])
    }
  })

  it('duas pendências do sistema com o mesmo código e textos diferentes viram dois avisos', () => {
    const c = cenario('duas etapas sem leitura', rodoviaria, (r) => {
      r.passos.indicacao.substituicao!.etapas[0].substituicao = null
    })
    const avisos = avisosDoRegistro(c.registro, c.pacote, { hoje: HOJE }).filter((a) => a.codigo === 'SUBSTITUICAO_INCOMPLETA')
    expect(avisos.length).toBeGreaterThan(1)
    expect(new Set(avisos.map((a) => a.texto)).size).toBe(avisos.length)
  })

  it('a pendência do campo que nenhuma regra própria cobre sai com o texto do sistema', () => {
    const c = todos.find((x) => x.nome === 'rodoviária: etapas a menos')!
    const avisos = avisosDoRegistro(c.registro, c.pacote, { hoje: HOJE })
    expect(avisos).toContainEqual(
      expect.objectContaining({
        codigo: 'SUBSTITUICAO_INCOMPLETA',
        classe: 'IMPEDE',
        passo: 5,
        texto: expect.stringMatching(/^Erro de indicação, ponto de .+: faltam etapas de substituição/),
      }),
    )
  })
})

describe('classe de cada pendência pelo texto', () => {
  it('textos do sistema de cada tipo: campo (IMPEDE) ou escritório', () => {
    const casos: Array<[string, string, string]> = [
      ['Informe a data da calibração.', 'FALTA_DATA', 'IMPEDE'],
      ['A data da calibração não pode ser futura.', 'DATA_FUTURA', 'IMPEDE'],
      ['O padrão BR-01 estava vencido na data da calibração (01/10/2026).', 'PADRAO_VENCIDO', 'IMPEDE'],
      [
        'O padrão BR-01 está desativado: tire-o desta calibração (etapa Padrões e ambiente) ou reative-o em Padrões.',
        'PADRAO_DESATIVADO',
        'ESCRITORIO',
      ],
      [
        'O padrão BR-01 foi calibrado em 01/11/2026, depois desta calibração: o certificado dele não valia no dia.',
        'PADRAO_CALIBRADO_DEPOIS',
        'ESCRITORIO',
      ],
      [
        'Pressão de 94,8 hPa fora da faixa (300 hPa a 1200 hPa): a pressão é em hPa (94,8 kPa = 948 hPa).',
        'PRESSAO_EM_KPA',
        'IMPEDE',
      ],
      [
        'Aclimatação dos pesos: tempo no local fora da faixa (0 min a 2880 min): confira o valor digitado.',
        'AMBIENTE_FORA_DA_FAIXA',
        'IMPEDE',
      ],
      [
        'Erro de indicação: medido como “Crescente com descarga” e trocado depois para “Crescente e decrescente”, que não é o método do POP nesta classe; volte para o medido (POP 7.7).',
        'METODO_FORA_DO_POP',
        'ESCRITORIO',
      ],
      ['Erro de indicação: a subida é obrigatória; troque o método “Decrescente” (POP 7.7).', 'METODO_DECRESCENTE', 'ESCRITORIO'],
      [
        'Erro de indicação, ponto de 100,00 kg: peça tirada do cadastro do jogo JP-01; escolha os pesos do ponto de novo.',
        'PESOS_FORA_DO_CADASTRO',
        'ESCRITORIO',
      ],
      [
        'Erro de indicação, ponto de 100,00 kg: pesos de um jogo que não está entre os padrões escolhidos; escolha os pesos do ponto de novo.',
        'PESOS_FORA_DOS_PADROES',
        'IMPEDE',
      ],
      [
        'Erro de indicação, ponto de 20 000 kg: informe os pesos padrão usados nas etapas de substituição.',
        'PESOS_DA_SUBSTITUICAO',
        'ESCRITORIO',
      ],
      [
        'Empuxo pela densidade do ar medida: o jogo JE2-01 está sem a densidade ou a incerteza da densidade (cadastro do padrão).',
        'DENSIDADE_DOS_PESOS',
        'ESCRITORIO',
      ],
      ['Descreva o ajuste externo (peso usado).', 'AJUSTE_EXTERNO', 'ESCRITORIO'],
      ['Houve reparo: informe o número da ordem de serviço.', 'OS_DO_REPARO', 'ESCRITORIO'],
      ['O recebimento do item não pode ser depois da data da calibração.', 'DATA_RECEBIMENTO', 'ESCRITORIO'],
      [PENDENCIA_TECNICO_EXCLUIDO, 'SO_DO_SERVIDOR', 'ESCRITORIO'],
    ]
    for (const [texto, codigo, classe] of casos)
      expect([texto, classeDaPendencia(texto)]).toEqual([texto, expect.objectContaining({ codigo, classe })])
  })

  it('na balança informada no local, a identificação e as faixas são do campo', () => {
    const t = 'Balança sem nº de série nem identificação (TAG): identifique a balança no cadastro antes de emitir (POP 7.3).'
    expect(classeDaPendencia(t)?.classe).toBe('ESCRITORIO')
    expect(classeDaPendencia(t, { balancaInformada: true })?.classe).toBe('IMPEDE')
    const f = 'Instrumento: informe pelo menos uma faixa com Max, e e d maiores que zero.'
    expect(classeDaPendencia(f, { balancaInformada: true })).toMatchObject({
      codigo: 'BALANCA_SEM_FAIXA',
      classe: 'IMPEDE',
      passo: 3,
    })
  })

  it('texto desconhecido: null (o celular mostra como IMPEDE, com o texto do sistema)', () => {
    expect(classeDaPendencia('Uma pendência que ninguém conhece.')).toBeNull()
  })
})

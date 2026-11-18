// Levar o registro de campo para a calibração: o registro como rascunho (texto → número sem perder casas, os horários
// da aclimatação, o ambiente e o ΔT que valem, a data real, as correções depois da assinatura), a tabela de diferenças
// (os casos de 03-codigo.md §9.7 que continuam valendo depois de 05-ajustes-finais), "Importar do celular do técnico" e a regra
// da justificativa na emissão.

import { describe, expect, it } from 'vitest'
import { calcularCalibracao } from '../calibracao.ts'
import { calibracaoVazia } from '../dominio.ts'
import type { Calibracao, CalibracaoInput } from '../tipos.ts'
import { classeDaPendencia } from './avisos.ts'
import {
  pacoteClasseI,
  pacoteDoCliente,
  pacotePlataforma,
  pacoteRodoviaria,
  registroClasseI,
  registroDoCliente,
  registroPlataforma,
  registroRodoviaria,
} from './exemplos.ts'
import {
  aplicarDoCampo,
  balancaDoCampo,
  classeDoTexto,
  dataDoRegistro,
  deltaT0DoCampo,
  deltaTValido,
  diferencasDoCampo,
  divergenciasParaEmissao,
  indiceDeltaTValido,
  indiceInicioValido,
  inicioDosEnsaios,
  instrumentoDoCampo,
  MINUTOS_ACLIMATACAO_MAX,
  minutosDeAclimatacao,
  padroesDoPacote,
  padroesUsadosNoCampo,
  PENDENCIA_JUSTIFICATIVA_CAMPO,
  pendenciaJustificativaCampo,
  rascunhoTemLeituras,
  registroCorrigido,
  registroParaRascunho,
  unidadeDoRegistro,
} from './importar.ts'
import type { DiferencaCampo } from './importar.ts'
import type { LeituraCampo, RegistroCampo } from './tipos.ts'

const leitura = (valor: string, em = '2026-10-21T09:00:00-03:00'): LeituraCampo => ({ valor, em, via: 'teclado' })
const item = (itens: DiferencaCampo[], chave: string) => itens.find((x) => x.chave === chave)
/** Todas as leituras de passo 5 com a mesma hora (para controlar o "1º ensaio"). */
function horaDosEnsaios(r: RegistroCampo, em: string) {
  const ind = r.passos.indicacao
  for (const p of ind.pontos) for (const l of [p.crescente, p.decrescente]) if (l) l.em = em
  if (ind.retornoZero) ind.retornoZero.em = em
  for (const e of ind.substituicao?.etapas ?? []) for (const l of [e.padroes, e.substituicao]) if (l) l.em = em
}

describe('registro como rascunho', () => {
  it('plataforma: identificação, padrões usados (com o barômetro do ambiente), ambiente e leituras como número', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const k = registroParaRascunho(r, p)
    expect(k.dataCalibracao).toBe('2026-10-21')
    expect(k.tecnicoId).toBe('usr-carlos')
    expect(k.local).toBe('CLIENTE')
    expect(k.ordemServico).toBe('OS-2026-0512')
    expect(k.localEndereco).toBe(p.folha.localEndereco)
    // O BR-01 não estava no rascunho, mas mediu a pressão: entra
    expect(p.entrada.padroesIds).not.toContain('pad-br01')
    expect(k.padroesIds).toEqual(['pad-pp20', 'pad-jp01', 'pad-th01', 'pad-br01'])
    expect(k.ambiente).toMatchObject({
      temperaturaInicial: 24.6,
      umidadeInicial: 58,
      temperaturaFinal: 25.1,
      umidadeFinal: 56,
      pressao: 948.7,
      deltaTPesos: null,
      aclimatacao: null,
    })
    const p3 = k.indicacao.pontos.find((x) => x.id === 'p3')!
    expect(p3).toMatchObject({ carga: 100, crescente: 100.05, decrescente: 100.1 })
    expect(k.indicacao.pontos.map((x) => x.id)).toEqual(p.entrada.indicacao.pontos.map((x) => x.id))
    expect(k.indicacao.retornoZero).toBe(0)
    expect(k.repetibilidade[0]).toMatchObject({ id: 'rep1', carga: 150, leituras: [150, 150, 150.05, 150, 150] })
    // O que só o escritório preenche continua o do pacote
    expect(k.conformidade).toEqual(p.entrada.conformidade)
    expect(k.opcoes).toEqual(p.entrada.opcoes)
    expect(k.observacoes).toBe(p.entrada.observacoes)
  })

  it('a correção depois da assinatura vale para a calibração (o valor assinado fica no registro guardado)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const assinado = r.passos.excentricidade.posicoes[3].leitura!.valor
    expect(assinado).toBe('100,05')
    expect(registroParaRascunho(r, p).excentricidade.posicoes[3].leitura).toBe(100)
    expect(r.passos.excentricidade.posicoes[3].leitura!.valor).toBe('100,05')
    const corrigido = registroCorrigido(r)
    // Corrigir a digitação não muda quando foi lido: fica a hora da observação (a correção guarda a dela)
    expect(corrigido.passos.excentricidade.posicoes[3].leitura).toEqual({
      valor: '100,00',
      em: r.passos.excentricidade.posicoes[3].leitura!.em,
      via: 'teclado',
    })
    expect(r.correcoesPosAssinatura[0].em).not.toBe(r.passos.excentricidade.posicoes[3].leitura!.em)
    // Pelo id do item, numa lista de leituras, e num texto; caminho que não existe é ignorado
    r.correcoesPosAssinatura.push(
      {
        campo: 'indicacao.pontos.p4.decrescente',
        de: '150,10',
        para: '150,05',
        em: r.relogio.finalizadoEm,
        motivo: 'x',
        mostradoAoCliente: false,
      },
      {
        campo: 'repetibilidade.rep1.leituras.2',
        de: '150,05',
        para: '150,00',
        em: r.relogio.finalizadoEm,
        motivo: 'x',
        mostradoAoCliente: false,
      },
      {
        campo: 'final.dataCalibracao',
        de: '2026-10-21',
        para: '2026-10-22',
        em: r.relogio.finalizadoEm,
        motivo: 'x',
        mostradoAoCliente: false,
      },
      {
        campo: 'indicacao.pontos.nao-existe.crescente',
        de: '',
        para: '1',
        em: r.relogio.finalizadoEm,
        motivo: 'x',
        mostradoAoCliente: false,
      },
    )
    const k = registroParaRascunho(r, p)
    expect(k.indicacao.pontos.find((x) => x.id === 'p4')!.decrescente).toBe(150.05)
    expect(k.repetibilidade[0].leituras[2]).toBe(150)
    expect(k.dataCalibracao).toBe('2026-10-22')
    expect(registroCorrigido(registroRodoviaria())).toEqual(registroRodoviaria())
  })

  it('a correção depois da assinatura não muda a hora da leitura: o ΔT que vale continua o mesmo (classe I)', () => {
    const r = registroClasseI()
    expect(indiceDeltaTValido(r)).toBe(1)
    // O 2º ΔT (o medido de novo, antes do 1º ensaio) corrigido depois da assinatura, horas depois dos ensaios
    r.correcoesPosAssinatura.push({
      campo: 'ambiente.deltaT.1.valor',
      de: '0,6',
      para: '0,7',
      em: '2026-10-26T18:00:00-03:00',
      motivo: 'Digitei errado.',
      mostradoAoCliente: false,
    })
    const corrigido = registroCorrigido(r)
    expect(corrigido.passos.ambiente.deltaT[1].valor).toEqual({ ...r.passos.ambiente.deltaT[1].valor, valor: '0,7' })
    expect(indiceDeltaTValido(corrigido)).toBe(1)
    expect(registroParaRascunho(r, pacoteClasseI()).ambiente.deltaTPesos).toBe(0.7)
  })

  it('texto → número sem perder casas (classe I: 0,1 mg; rodoviária: 20 kg)', () => {
    const k = registroParaRascunho(registroClasseI(), pacoteClasseI())
    expect(k.indicacao.pontos.map((x) => x.crescente)).toEqual([0, 0.01, 60.0001, 110.0001, 160.0002, 220.0002])
    expect(k.repetibilidade[0].leituras).toContain(200.0001)
    const rod = registroParaRascunho(registroRodoviaria(), pacoteRodoviaria())
    expect(rod.indicacao.pontos.map((x) => x.crescente)).toEqual([0, 5000, 10020, 20020, 30020, 40040])
    expect(rod.indicacao.substituicao.etapas).toEqual([
      { leituraPadroes: 10000, leituraSubstituicao: 10020 },
      { leituraPadroes: 20000, leituraSubstituicao: 20020 },
      { leituraPadroes: 30000, leituraSubstituicao: 30020 },
    ])
    expect(rod.indicacao.substituicao.ativa).toBe(true)
    // Negativo e leitura fora do formato do teclado (null, nunca um número inventado)
    const r = registroPlataforma()
    r.passos.indicacao.retornoZero = leitura('-0,05')
    r.passos.indicacao.pontos[1].crescente = leitura('1.00')
    const x = registroParaRascunho(r, pacotePlataforma())
    expect(x.indicacao.retornoZero).toBe(-0.05)
    expect(x.indicacao.pontos[1].crescente).toBeNull()
  })

  it('classe I: a linha do início que vale é a repetida depois da aclimatação; o ΔT que vale é o último antes do 1º ensaio', () => {
    const p = pacoteClasseI()
    const r = registroClasseI()
    expect(indiceInicioValido(r)).toBe(1)
    const k = registroParaRascunho(r, p)
    expect(k.ambiente).toMatchObject({ temperaturaInicial: 21.5, umidadeInicial: 47, pressao: 949, temperaturaFinal: 21.7 })
    expect(k.ambiente.deltaTPesos).toBe(0.6)
    expect(k.ajuste.realizado).toBe('INTERNO')
    expect(k.padroesIds).toContain('pad-td01')
    // Uma medição do ΔT depois de começar os ensaios não vale (POP 7.4: antes do 1º ensaio)
    const inicio = inicioDosEnsaios(r)!
    r.passos.ambiente.deltaT.push({
      valor: leitura('2,0', new Date(inicio + 3_600_000).toISOString().replace('Z', '+00:00')),
      instrumento: 'pad-td01',
    })
    expect(deltaTValido(r)?.valor.valor).toBe('0,6')
    // Uma linha do início medida depois do 1º ensaio também não vale
    r.passos.ambiente.linhas.splice(2, 0, {
      momento: 'INICIO_REPETIDA',
      em: new Date(inicio + 60_000).toISOString(),
      temperatura: leitura('25,0'),
      umidade: null,
      pressao: null,
      instrumentos: [],
    })
    expect(indiceInicioValido(r)).toBe(1)
    // CAL não feito: "não houve ajuste"
    r.passos.indicacao.calInterno = { feito: false, em: '' }
    expect(registroParaRascunho(r, p).ajuste.realizado).toBe('NAO')
  })

  it('aclimatação pelos horários brutos: desde quando os pesos estão no local até o 1º ensaio', () => {
    const r = registroClasseI()
    r.passos.ambiente.deltaT = []
    r.passos.ambiente.deltaT0 = { origem: leitura('18,0'), sala: leitura('21,5'), em: '2026-10-26T08:30:00-03:00' }
    expect(deltaT0DoCampo(r)).toBe(-3.5)
    // Os pesos ficaram na sala desde a véspera (17:40) e o 1º ensaio foi às 09:30: dois dias, pelos instantes
    horaDosEnsaios(r, '2026-10-26T09:30:00-03:00')
    expect(r.passos.ambiente.pesosNoLocalDesde).toBe('2026-10-25T17:40:00-03:00')
    expect(minutosDeAclimatacao(r)).toBe(15 * 60 + 50)
    const k = registroParaRascunho(r, pacoteClasseI())
    expect(k.ambiente.aclimatacao).toEqual({ deltaT0: -3.5, minutos: 950 })
    expect(k.ambiente.deltaTPesos).toBeNull()
  })

  it('aclimatação passando da meia-noite, sem "pesos no local desde" (da hora de início), e o limite de 48 h', () => {
    const r = registroClasseI()
    r.passos.ambiente.pesosNoLocalDesde = ''
    r.passos.chegada.inicio = '2026-10-26T23:40:00-03:00'
    horaDosEnsaios(r, '2026-10-27T00:25:30-03:00')
    expect(minutosDeAclimatacao(r)).toBe(45)
    // Outro fuso no meio (o relógio do celular mudou de fuso): os instantes absolutos continuam certos
    horaDosEnsaios(r, '2026-10-27T01:25:30-02:00')
    expect(minutosDeAclimatacao(r)).toBe(45)
    // Mais de 48 h conta como 48 h (o máximo que o sistema aceita)
    r.passos.ambiente.pesosNoLocalDesde = '2026-10-20T08:00:00-03:00'
    expect(minutosDeAclimatacao(r)).toBe(MINUTOS_ACLIMATACAO_MAX)
    // Fora de ordem (o 1º ensaio antes da chegada): não dá para calcular
    r.passos.ambiente.pesosNoLocalDesde = '2026-10-28T08:00:00-03:00'
    expect(minutosDeAclimatacao(r)).toBeNull()
    // Sem leituras do passo 5: até a linha do início que vale
    const s = registroClasseI()
    s.passos.ambiente.pesosNoLocalDesde = ''
    s.passos.indicacao.pontos.forEach((x) => Object.assign(x, { crescente: null, decrescente: null }))
    s.passos.indicacao.retornoZero = null
    expect(minutosDeAclimatacao(s)).toBe(
      Math.floor((Date.parse(s.passos.ambiente.linhas[1].em) - Date.parse(s.passos.chegada.inicio)) / 60_000),
    )
  })

  it('a data real (passo 8); sem ela, o dia em que a folha começou, pelo relógio do celular (21:30 em Brasília é o mesmo dia)', () => {
    const r = registroPlataforma()
    expect(dataDoRegistro(r)).toBe('2026-10-21')
    r.passos.final.dataCalibracao = ''
    r.passos.chegada.inicio = '2026-11-18T21:30:00-03:00'
    expect(dataDoRegistro(r)).toBe('2026-11-18')
    expect(registroParaRascunho(r, pacotePlataforma()).dataCalibracao).toBe('2026-11-18')
  })

  it('a pressão do certificado é a do início; a do fim só quando a do início ficou em branco', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    expect(registroParaRascunho(r, p).ambiente.pressao).toBe(948.7)
    r.passos.ambiente.linhas[0].pressao = null
    expect(registroParaRascunho(r, p).ambiente.pressao).toBe(948.3)
  })

  it('folha só do cliente: a balança informada, os pontos acrescentados com as peças montadas, no laboratório', () => {
    const p = pacoteDoCliente()
    const r = registroDoCliente()
    const k = registroParaRascunho(r, p)
    expect(k.local).toBe('LABORATORIO')
    expect(k.indicacao.pontos.map((x) => [x.id, x.carga, x.crescente, x.decrescente])).toEqual([
      ['cel-p0', 0, 0, null],
      ['cel-p1', 1, 1, 1.05],
      ['cel-p2', 50, 50, 50.05],
      ['cel-p3', 100, 100.05, 100.05],
      ['cel-p4', 150, 150.05, null],
    ])
    // Sem as peças no celular: montadas com os pesos usados (como o editor faz ao abrir)
    expect(k.indicacao.pontos.slice(1).every((x) => x.pecas.length > 0 && !x.pecasManuais)).toBe(true)
    expect(k.indicacao.pontos[0].pecas).toEqual([])
    expect(k.repetibilidade).toEqual([{ id: 'cel-r1', carga: 50, leituras: [50, 50, 50.05, 50, 50] }])
    expect(k.excentricidade.carga).toBe(50)
    expect(unidadeDoRegistro(r, p)).toBe('kg')
    const b = balancaDoCampo(r, p)!
    expect(b).toMatchObject({ unidade: 'kg', classe: 'III', faixas: [{ max: 150, e: 0.05, d: 0.05 }], numeroSerie: 'FZ-55120' })
  })

  it('órfão (sem o pacote): sobre um rascunho vazio, com as cargas lidas do texto da folha (milhar com espaço)', () => {
    const r = registroRodoviaria()
    const k = registroParaRascunho(r, null)
    expect(k.indicacao.pontos.map((x) => x.carga)).toEqual([0, 5000, 10000, 20000, 30000, 40000])
    expect(k.repetibilidade[0].carga).toBe(10000)
    expect(k.tecnicoId).toBe('usr-carlos')
    expect(unidadeDoRegistro(r, null)).toBe('kg')
  })

  it('as tentativas descartadas nunca entram', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const antes = registroParaRascunho(r, p)
    const t = structuredClone(r.passos)
    t.indicacao.pontos.forEach((x) => (x.crescente = leitura('999,95')))
    r.tentativas.push({ n: 1, motivo: 'Célula trocada', encerradaEm: r.relogio.iniciadoEm, ...t })
    expect(registroParaRascunho(r, p)).toEqual(antes)
  })
})

describe('a balança vista em campo', () => {
  it('"Algo diferente…" com o valor visto: d, e, Max, classe e Min trocam; a unidade muda as cargas', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const conf = (campo: string, observado?: string) =>
      Object.assign(
        r.passos.balanca.conferencias.find((c) => c.campo === campo)!,
        { confere: false, observado },
      )
    conf('balanca.d', '10 g')
    conf('balanca.classe', 'Classe II')
    let v = instrumentoDoCampo(r, p)
    expect(v.instrumento).toMatchObject({ unidade: 'kg', classe: 'II', faixas: [{ max: 300, e: 0.05, d: 0.01 }] })
    expect(v.observados.map((x) => x.texto)).toEqual(['d = 0,01 kg', 'classe II'])
    expect(v.desligados).toEqual([])
    // Sem valor (ou ilegível): o dado fica desligado
    conf('balanca.e', '')
    conf('balanca.max', 'trezentos')
    v = instrumentoDoCampo(r, p)
    expect(v.desligados).toEqual(['balanca.max', 'balanca.e'])
    // A unidade vista: as leituras foram escritas nela, e as cargas do pacote são convertidas
    conf('balanca.unidade', 'g')
    expect(unidadeDoRegistro(r, p)).toBe('g')
    const k = registroParaRascunho(r, p)
    expect(k.indicacao.pontos.find((x) => x.id === 'p3')!.carga).toBe(100_000)
    conf('balanca.unidade', 'quilos?')
    expect(instrumentoDoCampo(r, p)).toMatchObject({ instrumento: null, desligados: ['balanca.unidade'] })
  })

  it('classe escrita de vários jeitos; faixas múltiplas com "/"', () => {
    expect(classeDoTexto('III (média)')).toBe('III')
    expect(classeDoTexto('IIII')).toBe('IIII')
    expect(classeDoTexto('classe I')).toBe('I')
    expect(classeDoTexto('sem classe')).toBe('')
    expect(classeDoTexto('Não marcada')).toBe('')
    expect(classeDoTexto('não sei')).toBeNull()
    expect(classeDoTexto('média')).toBeNull()
    const p = pacotePlataforma()
    p.balanca!.tipoFaixas = 'MULTIPLAS_FAIXAS'
    p.balanca!.faixas = [
      { max: 150, e: 0.02, d: 0.02 },
      { max: 300, e: 0.05, d: 0.05 },
    ]
    const r = registroPlataforma()
    Object.assign(
      r.passos.balanca.conferencias.find((c) => c.campo === 'balanca.d')!,
      { confere: false, observado: '0,01/0,02 kg' },
    )
    expect(instrumentoDoCampo(r, p).instrumento!.faixas.map((f) => f.d)).toEqual([0.01, 0.02])
    Object.assign(
      r.passos.balanca.conferencias.find((c) => c.campo === 'balanca.d')!,
      { observado: '0,01/0,02/0,05' },
    )
    expect(instrumentoDoCampo(r, p).desligados).toEqual(['balanca.d'])
  })

  it('balança informada sem unidade ou sem faixa legível', () => {
    const p = pacoteDoCliente()
    const r = registroDoCliente()
    r.passos.balanca.informada!.unidade = ''
    expect(instrumentoDoCampo(r, p)).toMatchObject({ instrumento: null, desligados: ['balanca.unidade'], informada: true })
    expect(balancaDoCampo(r, p)).toBeNull()
    r.passos.balanca.informada!.unidade = 'kg'
    r.passos.balanca.informada!.faixas = [{ max: '150', e: '', d: 'x' }]
    const v = instrumentoDoCampo(r, p)
    expect(v.instrumento!.faixas).toEqual([])
    expect(v.desligados).toEqual(expect.arrayContaining(['balanca.d', 'balanca.e', 'balanca.max']))
    // e em branco = d (como no cadastro)
    r.passos.balanca.informada!.faixas = [{ max: '150', e: '', d: '0,05' }]
    expect(instrumentoDoCampo(r, p).instrumento!.faixas).toEqual([{ max: 150, e: 0.05, d: 0.05 }])
  })
})

describe('comparar e puxar (03-codigo.md §9.7)', () => {
  it('só o plano, sem leituras: tudo vem do celular, e "Puxar" preenche tudo', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const c = diferencasDoCampo(p.entrada, r, p)
    expect(c.rascunhoSemLeituras).toBe(true)
    const medidos = c.itens.filter((x) => x.grupo === 'ambiente' || x.grupo === 'indicacao' || x.grupo === 'repetibilidade')
    expect(medidos.length).toBeGreaterThan(20)
    expect(medidos.every((x) => x.situacao === 'VAZIO_NO_RASCUNHO' && x.sugestao === 'CELULAR')).toBe(true)
    expect(item(c.itens, 'indicacao.pontos.p3.crescente')).toMatchObject({
      celular: '100,05',
      rascunho: '',
      bruto: true,
      passo: 5,
    })
    const { rascunho, resumo } = aplicarDoCampo(p.entrada, r, p)
    const esperado = registroParaRascunho(r, p)
    for (const campo of ['indicacao', 'repetibilidade', 'excentricidade', 'ambiente', 'padroesIds', 'tecnicoId'] as const)
      expect(rascunho[campo]).toEqual(esperado[campo])
    expect(rascunhoTemLeituras(rascunho)).toBe(true)
    expect(resumo.preenchidos).toBeGreaterThan(20)
    expect(resumo.diferentes).toBe(1) // os padrões (o BR-01 do ambiente)
    expect(resumo.texto).toMatch(
      /^Trouxe do celular a folha FC-2026-00042: \d+ dados preenchidos, 1 diferença \(ficou o do celular em 1\)\.$/,
    )
    // Puxar de novo não muda nada: tudo igual
    const de_novo = diferencasDoCampo(rascunho, r, p)
    expect(de_novo.itens.filter((x) => x.situacao !== 'IGUAL')).toEqual([])
    expect(de_novo.iguais).toBe(de_novo.itens.length)
  })

  it('o escritório já digitou do papel: vazio recebe, igual fica, diferente mostra os dois com o do celular marcado', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const digitado = registroParaRascunho(r, p)
    const pt = (id: string) => digitado.indicacao.pontos.find((x) => x.id === id)!
    pt('p3').crescente = 100.1 // diferente
    pt('p4').decrescente = null // vazio no rascunho
    pt('p6').decrescente = 300.05 // só o rascunho tem (o celular não leu a descida em Max)
    digitado.ambiente.pressao = 948.3 // a do fim, digitada do papel
    const c = diferencasDoCampo(digitado, r, p)
    expect(c.rascunhoSemLeituras).toBe(false)
    expect(item(c.itens, 'indicacao.pontos.p3.crescente')).toMatchObject({
      situacao: 'DIFERENTE',
      celular: '100,05',
      rascunho: '100,10',
      sugestao: 'CELULAR',
    })
    expect(item(c.itens, 'indicacao.pontos.p4.decrescente')).toMatchObject({ situacao: 'VAZIO_NO_RASCUNHO', sugestao: 'CELULAR' })
    expect(item(c.itens, 'indicacao.pontos.p6.decrescente')).toMatchObject({ situacao: 'VAZIO_NO_CELULAR', sugestao: 'RASCUNHO' })
    expect(item(c.itens, 'ambiente.pressao')).toMatchObject({ situacao: 'DIFERENTE', celular: '948,7', rascunho: '948,3' })
    expect(item(c.itens, 'indicacao.pontos.p1.crescente')!.situacao).toBe('IGUAL')
    // Sem escolha: a sugestão; com escolha, o que o escritório escolheu (e fica registrado)
    const padrao = aplicarDoCampo(digitado, r, p).rascunho
    expect(padrao.indicacao.pontos.find((x) => x.id === 'p3')!.crescente).toBe(100.05)
    expect(padrao.indicacao.pontos.find((x) => x.id === 'p4')!.decrescente).toBe(150.1)
    expect(padrao.indicacao.pontos.find((x) => x.id === 'p6')!.decrescente).toBe(300.05)
    expect(padrao.ambiente.pressao).toBe(948.7)
    const { rascunho, resumo } = aplicarDoCampo(digitado, r, p, { 'indicacao.pontos.p3.crescente': 'RASCUNHO' })
    expect(rascunho.indicacao.pontos.find((x) => x.id === 'p3')!.crescente).toBe(100.1)
    expect(resumo).toMatchObject({ diferentes: 2, ficouCelular: 1, ficouRascunho: 1, preenchidos: 1 })
    expect(resumo.escolhas).toContainEqual({ chave: 'indicacao.pontos.p3.crescente', situacao: 'DIFERENTE', escolha: 'RASCUNHO' })
    // O rascunho de entrada nunca é mudado
    expect(pt('p3').crescente).toBe(100.1)
  })

  it('o rascunho mudou de plano depois do envio: casa pelo id e, sem id, pela carga; o que sobra é "do celular, sem par"', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const k: CalibracaoInput = structuredClone(p.entrada)
    // Ids novos (o plano refeito), uma carga 0,02 kg diferente (dentro de d/2), o ponto de 300 kg tirado e um de 250 kg novo
    k.indicacao.pontos = k.indicacao.pontos
      .filter((x) => x.carga !== 300)
      .map((x, i) => ({ ...x, id: `novo-${i}`, carga: x.carga === 100 ? 100.02 : x.carga }))
    k.indicacao.pontos.push({
      id: 'novo-250',
      carga: 250,
      pecas: [],
      pecasManuais: false,
      crescente: 250.05,
      decrescente: null,
      nivelSubstituicao: 0,
    })
    const c = diferencasDoCampo(k, r, p)
    const p3 = item(c.itens, 'indicacao.pontos.p3.crescente')!
    expect(p3.situacao).toBe('VAZIO_NO_RASCUNHO')
    expect(item(c.itens, 'indicacao.pontos.p3.carga')).toMatchObject({
      situacao: 'DIFERENTE',
      celular: '100,00',
      rascunho: '100,02',
    })
    expect(item(c.itens, 'indicacao.pontos.p6')).toMatchObject({ situacao: 'SO_NO_CELULAR', sugestao: 'CELULAR', bruto: true })
    expect(item(c.itens, 'indicacao.pontos.p6')!.rotulo).toBe('Ponto de 300,00 kg (do celular, sem par)')
    expect(item(c.itens, 'indicacao.pontos.novo-250')).toMatchObject({ situacao: 'SO_NO_RASCUNHO', sugestao: 'RASCUNHO' })
    const { rascunho } = aplicarDoCampo(k, r, p)
    // O ponto do celular entra na ordem das cargas; o só do rascunho fica; o de 100,02 recebe a carga e as leituras
    expect(rascunho.indicacao.pontos.map((x) => x.carga)).toEqual([0, 1, 10, 25, 100, 150, 200, 250, 300])
    expect(rascunho.indicacao.pontos.find((x) => x.id === 'novo-4')).toMatchObject({ carga: 100, crescente: 100.05 })
    expect(rascunho.indicacao.pontos.find((x) => x.id === 'p6')).toMatchObject({ crescente: 300.1 })
    // Escolher tirar o ponto só do rascunho
    const sem = aplicarDoCampo(k, r, p, { 'indicacao.pontos.novo-250': 'CELULAR' }).rascunho
    expect(sem.indicacao.pontos.some((x) => x.id === 'novo-250')).toBe(false)
  })

  it('o id do celular que já existe no rascunho (outro ponto) não colide ao acrescentar', () => {
    const p = pacoteDoCliente()
    const r = registroDoCliente()
    const k = calibracaoVazia()
    k.indicacao.pontos = [
      { id: 'cel-p4', carga: 999, pecas: [], pecasManuais: false, crescente: null, decrescente: null, nivelSubstituicao: 0 },
    ]
    const { rascunho } = aplicarDoCampo(k, r, p)
    const ids = rascunho.indicacao.pontos.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a unidade da balança mudou no escritório: o registro é convertido (calibracaoEmOutraUnidade)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const emG = aplicarDoCampo(p.entrada, r, p).rascunho
    // A balança passou a indicar em g: o rascunho foi convertido pelo servidor
    const convertido: CalibracaoInput = {
      ...emG,
      indicacao: {
        ...emG.indicacao,
        pontos: emG.indicacao.pontos.map((x) => ({
          ...x,
          carga: x.carga * 1000,
          crescente: x.crescente === null ? null : Math.round(x.crescente * 1000),
          decrescente: x.decrescente === null ? null : Math.round(x.decrescente * 1000),
        })),
      },
    }
    const c = diferencasDoCampo(convertido, r, p, { unidadeAtual: 'g' })
    expect(c.avisos).toContain('As leituras do celular estão em kg e foram convertidas para g, a unidade da balança agora.')
    expect(item(c.itens, 'indicacao.pontos.p3.crescente')).toMatchObject({ situacao: 'IGUAL', celular: '100\u00a0050' })
    expect(item(c.itens, 'repetibilidade.rep1.leituras.2')).toMatchObject({
      situacao: 'DIFERENTE',
      celular: '150\u00a0050',
      rascunho: '150,05',
    })
  })

  it('em revisão (ou qualquer situação do rascunho): as mesmas regras, e os dados da calibração continuam', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const k = { ...structuredClone(p.entrada), id: 'cal-1', versao: 7, status: 'REVISAO' } as unknown as Calibracao
    const { rascunho } = aplicarDoCampo(k, r, p)
    expect(rascunho).toMatchObject({ id: 'cal-1', versao: 7, status: 'REVISAO' })
    expect(rascunho.indicacao.pontos.find((x) => x.id === 'p3')!.crescente).toBe(100.05)
  })

  it('já emitida: não puxa; as diferenças entre o certificado e o celular (o caminho é "Corrigir certificado")', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const emitida = aplicarDoCampo(p.entrada, r, p).rascunho
    emitida.indicacao.pontos.find((x) => x.id === 'p5')!.crescente = 200.05
    expect(divergenciasParaEmissao(emitida, r, p)).toEqual([
      { chave: 'indicacao.pontos.p5.crescente', rotulo: 'Ponto de 200,00 kg ↑', celular: '200,10', certificado: '200,05' },
    ])
  })

  it('folha da balança sem rascunho ("Criar calibração com os dados do campo") e calibração refeita: tudo do celular', () => {
    const p = pacoteRodoviaria()
    const r = registroRodoviaria()
    const vazio = { ...calibracaoVazia(), balancaId: p.balanca!.id, clienteId: p.cliente!.id }
    const c = diferencasDoCampo(vazio, r, p)
    expect(c.itens.filter((x) => x.chave.startsWith('indicacao.pontos.') && x.situacao === 'SO_NO_CELULAR')).toHaveLength(6)
    const { rascunho } = aplicarDoCampo(vazio, r, p)
    const esperado = registroParaRascunho(r, p)
    expect(rascunho.indicacao.pontos).toEqual(esperado.indicacao.pontos)
    expect(rascunho.indicacao.substituicao).toEqual(esperado.indicacao.substituicao)
    expect(rascunho.repetibilidade).toEqual(esperado.repetibilidade)
    expect(rascunho.excentricidade.posicoes).toEqual(esperado.excentricidade.posicoes)
    expect(rascunho.excentricidade.carga).toBe(10000)
    expect(rascunho.ambiente).toEqual(esperado.ambiente)
    expect(rascunho.dataCalibracao).toBe('2026-10-27')
  })

  it('folha só do cliente (balança cadastrada depois com os dados do campo): pontos e ensaio acrescentados', () => {
    const p = pacoteDoCliente()
    const r = registroDoCliente()
    const novo = { ...calibracaoVazia(), clienteId: p.cliente!.id, balancaId: 'bal-nova' }
    const { rascunho } = aplicarDoCampo(novo, r, p)
    expect(rascunho.balancaId).toBe('bal-nova')
    expect(rascunho.local).toBe('LABORATORIO')
    expect(rascunho.indicacao.pontos.map((x) => x.id)).toEqual(['cel-p0', 'cel-p1', 'cel-p2', 'cel-p3', 'cel-p4'])
    expect(rascunho.repetibilidade).toEqual([{ id: 'cel-r1', carga: 50, leituras: [50, 50, 50.05, 50, 50] }])
    expect(rascunho.excentricidade.posicoes.map((x) => x.leitura)).toEqual([50, 50.05, 50, 50, 50.05])
  })

  it('a data real substitui a prevista e a próxima calibração acompanha', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.final.dataCalibracao = '2026-10-23'
    expect(p.entrada.proximaCalibracao).toBe('2027-10-21')
    const c = diferencasDoCampo(p.entrada, r, p)
    expect(item(c.itens, 'dataCalibracao')).toMatchObject({
      situacao: 'DIFERENTE',
      celular: '23/10/2026',
      rascunho: '21/10/2026',
      bruto: true,
    })
    const { rascunho } = aplicarDoCampo(p.entrada, r, p)
    expect(rascunho.dataCalibracao).toBe('2026-10-23')
    expect(rascunho.proximaCalibracao).toBe('2027-10-23')
  })

  it('o técnico que executou é o dono do celular; o endereço e a OS impressos não desfazem o que o escritório mudou', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const k = { ...structuredClone(p.entrada), tecnicoId: 'usr-outro', localEndereco: 'Outro endereço', ordemServico: '' }
    const c = diferencasDoCampo(k, r, p, { nomes: { 'usr-outro': 'Fulano' } })
    expect(item(c.itens, 'tecnicoId')).toMatchObject({
      situacao: 'DIFERENTE',
      celular: 'Carlos Eduardo Lima',
      rascunho: 'Fulano',
      bruto: false,
    })
    expect(item(c.itens, 'localEndereco')).toMatchObject({ situacao: 'VAZIO_NO_CELULAR', sugestao: 'RASCUNHO' })
    expect(item(c.itens, 'ordemServico')).toMatchObject({ situacao: 'VAZIO_NO_RASCUNHO', celular: 'OS-2026-0512' })
    const { rascunho } = aplicarDoCampo(k, r, p)
    expect(rascunho).toMatchObject({ tecnicoId: 'usr-carlos', localEndereco: 'Outro endereço', ordemServico: 'OS-2026-0512' })
    // O endereço escrito no local é do campo: vem marcado
    r.passos.chegada.localEndereco = 'Rua Nova, 10'
    expect(item(diferencasDoCampo(k, r, p).itens, 'localEndereco')).toMatchObject({ situacao: 'DIFERENTE', sugestao: 'CELULAR' })
  })

  it('anotações nunca vão sozinhas para as observações; os dados impressos diferentes aparecem ao lado', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    Object.assign(
      r.passos.balanca.conferencias.find((c) => c.campo === 'balanca.d')!,
      { confere: false, observado: '0,01 kg' },
    )
    const k = { ...structuredClone(p.entrada), observacoes: 'Texto do escritório.' }
    const c = diferencasDoCampo(k, r, p)
    expect(c.anotacoes.map((a) => a.id)).toEqual(['an-1', 'an-2'])
    expect(c.cadastroDiferente).toEqual([
      expect.objectContaining({ campo: 'balanca.d', mostrado: '50 g', observado: '0,01 kg', metrologico: true, anotacao: '' }),
      expect.objectContaining({
        campo: 'balanca.localInstalacao',
        metrologico: false,
        anotacao: 'A balança está na doca 3, não na doca 2.',
      }),
    ])
    expect(c.avisos).toContain(
      'Cadastro da balança diferente: o técnico viu outro valor num dado metrológico. Corrija o cadastro antes de emitir.',
    )
    expect(c.avisos).toContain('Piloto: a folha de papel é o registro original. A comparação não escreve nada no rascunho.')
    const { rascunho } = aplicarDoCampo(k, r, p)
    expect(rascunho.observacoes).toBe('Texto do escritório.')
    expect(rascunho.anotacoesInternas).toBe(k.anotacoesInternas)
    expect(rascunho.conformidade).toEqual(k.conformidade)
  })

  it('tentativa descartada e folha encerrada sem completar: avisos, e o que falta continua pendente', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.tentativas.push({ n: 1, motivo: 'Célula trocada', encerradaEm: r.relogio.iniciadoEm, ...structuredClone(r.passos) })
    r.desfecho = 'INCOMPLETA'
    r.motivoDesfecho = 'Não medido: barômetro com defeito.'
    r.passos.ambiente.linhas.forEach((l) => (l.pressao = null))
    const k = { ...structuredClone(p.entrada), ambiente: { ...p.entrada.ambiente, pressao: 950 } }
    const c = diferencasDoCampo(k, r, p)
    expect(c.avisos).toContain(
      'Folha encerrada sem completar: Não medido: barômetro com defeito. Importe o que existe; o resto fica pendente.',
    )
    expect(c.avisos).toContain(
      'Uma tentativa anterior dos ensaios ficou só para consulta (a balança precisou de manutenção): não é importada.',
    )
    // A pressão que só o rascunho tem fica
    expect(item(c.itens, 'ambiente.pressao')).toMatchObject({ situacao: 'VAZIO_NO_CELULAR', sugestao: 'RASCUNHO' })
    expect(aplicarDoCampo(k, r, p).rascunho.ambiente.pressao).toBe(950)
    r.desfecho = 'NAO_CALIBRADA'
    expect(diferencasDoCampo(k, r, p).avisos[0]).toMatch(/^Balança não calibrada: .+ "não utilizado"\.$/)
  })

  it('padrões usados: os marcados, os instrumentos do ambiente e o do ΔT, na ordem do pacote', () => {
    const r = registroClasseI()
    r.passos.padroes.forEach((x) => (x.usado = false))
    expect(padroesUsadosNoCampo(r, pacoteClasseI())).toEqual(['pad-th01', 'pad-br01', 'pad-td01'])
  })

  it('rodoviária: o nível de substituição da folha (a sugerida) entra no rascunho que não tinha a substituição', () => {
    const p = pacoteRodoviaria()
    const r = registroRodoviaria()
    // O escritório contou com a sugestão da folha: o rascunho sem a substituição, nível 0 e sem pesos acima de 10 t
    const k: CalibracaoInput = structuredClone(p.entrada)
    k.indicacao.substituicao = { ativa: false, pecas: [], etapas: [] }
    for (const x of k.indicacao.pontos) {
      x.nivelSubstituicao = 0
      if (x.carga > 10000) x.pecas = []
    }
    const c = diferencasDoCampo(k, r, p)
    expect(item(c.itens, 'indicacao.pontos.p3.nivel')!.rotulo).toMatch(/^Ponto de 20\s000 kg: substituições por baixo$/)
    expect(item(c.itens, 'indicacao.pontos.p3.nivel')).toMatchObject({
      celular: '1',
      rascunho: '',
      situacao: 'VAZIO_NO_RASCUNHO',
      sugestao: 'CELULAR',
      bruto: true,
    })
    expect(item(c.itens, 'indicacao.pontos.p5.nivel')).toMatchObject({ celular: '3', situacao: 'VAZIO_NO_RASCUNHO' })
    // Os pontos só com pesos não ganham item
    expect(item(c.itens, 'indicacao.pontos.p2.nivel')).toBeUndefined()
    const { rascunho } = aplicarDoCampo(k, r, p)
    const esperado = registroParaRascunho(r, p)
    expect(rascunho.indicacao.pontos.map((x) => x.nivelSubstituicao)).toEqual([0, 0, 0, 1, 2, 3])
    expect(rascunho.indicacao.pontos.map((x) => x.pecas)).toEqual(esperado.indicacao.pontos.map((x) => x.pecas))
    expect(rascunho.indicacao.substituicao.ativa).toBe(true)
    // A comparação seguinte fica sem diferença, e o cálculo tem os pesos de todos os pontos
    expect(diferencasDoCampo(rascunho, r, p).itens.filter((x) => x.situacao !== 'IGUAL')).toEqual([])
    const pendencias = calcularCalibracao(rascunho, p.balanca!, padroesDoPacote(p, rascunho.padroesIds)).resultado.pendencias
    expect(pendencias.filter((x) => /peso padrão/.test(x))).toEqual([])
    // Mudado no escritório depois de puxar: divergência
    rascunho.indicacao.pontos.find((x) => x.id === 'p4')!.nivelSubstituicao = 1
    expect(divergenciasParaEmissao(rascunho, r, p)).toEqual([
      expect.objectContaining({ chave: 'indicacao.pontos.p4.nivel', celular: '2', certificado: '1' }),
    ])
  })

  it('nível 0 no celular (a etapa sem os pesos no plano) não apaga o nível do escritório; as peças do escritório ficam', () => {
    const p = pacoteRodoviaria()
    const r = registroRodoviaria()
    const k = registroParaRascunho(r, p)
    // O plano sem os pesos da etapa: o celular desce com nível 0, e o rascunho tem 2
    r.passos.indicacao.pontos.find((x) => x.id === 'p4')!.nivelSubstituicao = 0
    expect(item(diferencasDoCampo(k, r, p).itens, 'indicacao.pontos.p4.nivel')).toBeUndefined()
    expect(aplicarDoCampo(k, r, p).rascunho.indicacao.pontos.find((x) => x.id === 'p4')!.nivelSubstituicao).toBe(2)
    // Peças montadas à mão no escritório: o nível vem do celular, as peças ficam
    const r2 = registroRodoviaria()
    const k2 = registroParaRascunho(r2, p)
    const p5 = k2.indicacao.pontos.find((x) => x.id === 'p5')!
    Object.assign(p5, { nivelSubstituicao: 2, pecasManuais: true, pecas: p5.pecas.slice(0, 1) })
    const puxado = aplicarDoCampo(k2, r2, p).rascunho.indicacao.pontos.find((x) => x.id === 'p5')!
    expect(puxado).toMatchObject({ nivelSubstituicao: 3, pecasManuais: true, pecas: p5.pecas })
  })
})

describe('justificativa na emissão (uma só, 05-ajustes-finais §10)', () => {
  it('depois de puxar sem mudar nada: nenhuma divergência', () => {
    const p = pacoteClasseI()
    const r = registroClasseI()
    const k = aplicarDoCampo(p.entrada, r, p).rascunho
    expect(divergenciasParaEmissao(k, r, p)).toEqual([])
    expect(pendenciaJustificativaCampo([], '')).toBeNull()
  })

  it('dado bruto mudado depois de puxar: divergência; identificação mudada, não', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const k = aplicarDoCampo(p.entrada, r, p).rascunho
    k.localEndereco = 'Endereço corrigido pelo escritório'
    k.observacoes = 'Observação nova.'
    expect(divergenciasParaEmissao(k, r, p)).toEqual([])
    k.repetibilidade[0].leituras[2] = 150
    k.padroesIds = k.padroesIds.filter((x) => x !== 'pad-br01')
    k.ambiente.temperaturaFinal = null
    const d = divergenciasParaEmissao(k, r, p)
    expect(d.map((x) => x.chave)).toEqual(['padroesIds', 'ambiente.temperaturaFinal', 'repetibilidade.rep1.leituras.2'])
    expect(d[2]).toEqual({
      chave: 'repetibilidade.rep1.leituras.2',
      rotulo: 'Repetibilidade a 150,00 kg: leitura 3',
      celular: '150,05',
      certificado: '150,00',
    })
    const pendencia = pendenciaJustificativaCampo(d, '  ')!
    expect(pendencia).toBe(
      'Dados do celular mudados depois de importados (3 diferenças com o registro do celular): escreva a justificativa antes de emitir.',
    )
    expect(pendencia.startsWith(PENDENCIA_JUSTIFICATIVA_CAMPO)).toBe(true)
    expect(pendenciaJustificativaCampo(d, 'Leitura refeita no laboratório.')).toBeNull()
    // É do escritório: nunca vira aviso no celular
    expect(classeDaPendencia(pendencia)?.classe).toBe('ESCRITORIO')
  })

  it('ponto acrescentado no escritório com leituras, ou ponto do celular tirado: divergência', () => {
    const p = pacoteRodoviaria()
    const r = registroRodoviaria()
    const k = aplicarDoCampo(p.entrada, r, p).rascunho
    k.indicacao.pontos = k.indicacao.pontos.filter((x) => x.id !== 'p5')
    k.indicacao.pontos.push({
      id: 'esc',
      carga: 60000,
      pecas: [],
      pecasManuais: false,
      crescente: 60020,
      decrescente: null,
      nivelSubstituicao: 0,
    })
    expect(divergenciasParaEmissao(k, r, p).map((x) => x.chave)).toEqual(['indicacao.pontos.p5', 'indicacao.pontos.esc'])
  })

  it('leitura que o celular nunca pede (↓ no zero e em Max, coluna fora do método, zero antes fora do método 3) não conta', () => {
    // "Sugerir pontos" grava 0 nas duas colunas do zero; o celular não pede a descida no zero nem em Max
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const k: CalibracaoInput = structuredClone(p.entrada)
    Object.assign(
      k.indicacao.pontos.find((x) => x.carga === 0)!,
      { crescente: 0, decrescente: 0 },
    )
    const puxado = aplicarDoCampo(k, r, p).rascunho
    expect(item(diferencasDoCampo(puxado, r, p).itens, 'indicacao.pontos.p0.decrescente')).toMatchObject({
      situacao: 'VAZIO_NO_CELULAR',
      sugestao: 'RASCUNHO',
      bruto: false,
    })
    expect(divergenciasParaEmissao(puxado, r, p)).toEqual([])
    // A descida em Max digitada do papel depois de puxar também não; a de 100 kg, que o celular pede, sim
    puxado.indicacao.pontos.find((x) => x.id === 'p6')!.decrescente = 300.05
    expect(divergenciasParaEmissao(puxado, r, p)).toEqual([])
    r.passos.indicacao.pontos.find((x) => x.id === 'p3')!.decrescente = null
    expect(divergenciasParaEmissao(puxado, r, p)).toEqual([
      { chave: 'indicacao.pontos.p3.decrescente', rotulo: 'Ponto de 100,00 kg ↓', celular: '', certificado: '100,1' },
    ])
    // O zero antes da excentricidade fora do método 3 (a plataforma é o método 1)
    const semZero = aplicarDoCampo(p.entrada, registroPlataforma(), p).rascunho
    semZero.excentricidade.posicoes[0].referencia = 0
    expect(divergenciasParaEmissao(semZero, registroPlataforma(), p)).toEqual([])
  })

  it('classe I (crescente com descarga): a descida em ponto nenhum; o zero antes de cada posição conta', () => {
    const p = pacoteClasseI()
    const r = registroClasseI()
    const k = aplicarDoCampo(p.entrada, r, p).rascunho
    for (const x of k.indicacao.pontos) x.decrescente = x.crescente
    expect(divergenciasParaEmissao(k, r, p)).toEqual([])
    // O zero antes (método 3) é leitura que o celular pede
    r.passos.excentricidade.posicoes[1].zeroAntes = null
    expect(divergenciasParaEmissao(k, r, p).map((x) => x.chave)).toEqual(['excentricidade.posicoes.1.referencia'])
  })

  it('método "Decrescente" (registro de antes): a subida não é lida no local', () => {
    const p = pacotePlataforma()
    p.plano!.metodo = 'DECRESCENTE'
    const r = registroPlataforma()
    const k = aplicarDoCampo(p.entrada, r, p).rascunho
    for (const x of r.passos.indicacao.pontos) x.crescente = null
    const d = divergenciasParaEmissao(k, r, p)
    expect(d.some((x) => x.chave.endsWith('.crescente'))).toBe(false)
    // A descida é lida em todos os pontos, também no zero e em Max
    r.passos.indicacao.pontos.find((x) => x.id === 'p6')!.decrescente = null
    k.indicacao.pontos.find((x) => x.id === 'p6')!.decrescente = 300.05
    expect(divergenciasParaEmissao(k, r, p).map((x) => x.chave)).toContain('indicacao.pontos.p6.decrescente')
  })

  it('a pressão do certificado é a do início: a do fim no certificado é divergência', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const k = aplicarDoCampo(p.entrada, r, p).rascunho
    k.ambiente.pressao = 948.3
    expect(divergenciasParaEmissao(k, r, p)).toEqual([
      { chave: 'ambiente.pressao', rotulo: 'Pressão', celular: '948,7', certificado: '948,3' },
    ])
  })
})

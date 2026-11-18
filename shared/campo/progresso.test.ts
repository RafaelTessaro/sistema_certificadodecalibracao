// O progresso da folha no celular: as etapas completas (8 passos e o ambiente do fim), a porcentagem, o "Falta para
// assinar" (os campos obrigatórios para emitir que a folha cobre, pelas regras do sistema) e a Revisão.

import { describe, expect, it } from 'vitest'
import { camposObrigatoriosEmissao } from '../dominio.ts'
import type { CampoEmissao } from '../dominio.ts'
import { avisosDoRegistro, conferirAviso } from './avisos.ts'
import {
  APARELHO_EXEMPLO,
  exemplosCampo,
  pacoteClasseI,
  pacoteDoCliente,
  pacoteEmBranco,
  pacotePlataforma,
  registroClasseI,
  registroDoCliente,
  registroPlataforma,
  TECNICO_EXEMPLO,
} from './exemplos.ts'
import { balancaDoCampo, padroesDoPacote, registroParaRascunho } from './importar.ts'
import {
  ETAPAS_DA_FOLHA,
  faltaParaAssinar,
  podeFinalizar,
  progressoDaFolha,
  revisaoDaFolha,
  situacaoDasEtapas,
} from './progresso.ts'
import { registroInicial } from './registro.ts'
import type { LeituraCampo, PacoteCampo, PontoCampo } from './tipos.ts'

const HOJE = '2026-11-18'
const L = (valor: string, em = '2026-10-21T09:00:00-03:00'): LeituraCampo => ({ valor, em, via: 'teclado' })
const vazia = (p: PacoteCampo) => registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: '2026-10-21T08:00:00-03:00' })
const codigos = (itens: Array<{ codigo: string }>) => itens.map((x) => x.codigo)

describe('falta para assinar', () => {
  it('as folhas dos exemplos estão completas: nada falta e pode finalizar', () => {
    for (const { nome, pacote, registro } of exemplosCampo()) {
      expect([nome, faltaParaAssinar(registro, pacote)]).toEqual([nome, []])
      expect(podeFinalizar(registro, pacote)).toEqual({ pode: true, motivo: '' })
    }
  })

  it('folha começada e vazia: os ● da folha, com o caminho para o "Ir ▸"', () => {
    const p = pacotePlataforma()
    const falta = faltaParaAssinar(vazia(p), p)
    expect(falta.map((x) => [x.codigo, x.etapa, x.campo])).toEqual([
      ['FALTA_PESOS', 'padroes', 'padroes'],
      ['FALTA_TEMPERATURA', 'ambiente', 'ambiente.linhas.0.temperatura'],
      ['FALTA_TEMPERATURA', 'ambienteFim', 'ambiente.linhas.1.temperatura'],
      ['FALTA_PRESSAO', 'ambiente', 'ambiente.linhas.0.pressao'],
      ['FALTA_BAROMETRO', 'ambiente', 'ambiente.linhas.0.instrumentos'],
      ['FALTA_REPETIBILIDADE', 'repetibilidade', 'repetibilidade'],
      ['FALTA_LEITURAS_EXCENTRICIDADE', 'excentricidade', 'excentricidade.posicoes'],
      ['FALTA_LEITURAS_INDICACAO', 'indicacao', 'indicacao.pontos'],
      ['FALTA_RETORNO_ZERO', 'indicacao', 'indicacao.retornoZero'],
      ['FALTA_DATA', 'final', 'final.dataCalibracao'],
    ])
    expect(falta.find((x) => x.etapa === 'ambienteFim')!.passo).toBe(4)
    expect(falta.find((x) => x.codigo === 'FALTA_DATA')!.texto).toBe('Data da calibração')
    expect(podeFinalizar(vazia(p), p)).toEqual({ pode: false, motivo: 'Preencha os itens com ● para assinar.' })
  })

  it('é o camposObrigatoriosEmissao do sistema, sem o que a folha não cobre (conformidade, próxima calibração)', () => {
    const p = pacotePlataforma()
    p.entrada.conformidade = { solicitada: true, criterio: 'CLIENTE', toleranciaCliente: 0, regra: 'SIMPLES' }
    p.entrada.proximaNoCertificado = true
    p.entrada.proximaCalibracao = ''
    p.entrada.reparo = { ...p.entrada.reparo, houve: true }
    p.entrada.ordemServico = ''
    p.folha.os = ''
    const r = vazia(p)
    const k = registroParaRascunho(r, p)
    const padroes = padroesDoPacote(p, k.padroesIds)
    const doSistema = camposObrigatoriosEmissao(k, {
      padroes,
      classe: balancaDoCampo(r, p)!.classe,
      temPesos: padroes.some((x) => x.tipo === 'PESOS'),
    })
      .filter((x) => x.falta && x.regra === 'obrigatorio')
      .map((x) => x.campo)
    const naoCobertos: CampoEmissao[] = ['toleranciaCliente', 'proximaCalibracao', 'ordemServico']
    expect(doSistema).toEqual(expect.arrayContaining(naoCobertos))
    const PARA_CODIGO: Partial<Record<CampoEmissao, string>> = {
      pesos: 'FALTA_PESOS',
      temperaturaInicial: 'FALTA_TEMPERATURA',
      temperaturaFinal: 'FALTA_TEMPERATURA',
      pressao: 'FALTA_PRESSAO',
      barometro: 'FALTA_BAROMETRO',
      repetibilidade: 'FALTA_REPETIBILIDADE',
      excentricidadeLeituras: 'FALTA_LEITURAS_EXCENTRICIDADE',
      indicacaoLeituras: 'FALTA_LEITURAS_INDICACAO',
      retornoZero: 'FALTA_RETORNO_ZERO',
    }
    const falta = codigos(faltaParaAssinar(r, p))
    for (const campo of doSistema.filter((c) => !naoCobertos.includes(c)))
      expect([campo, falta]).toEqual([campo, expect.arrayContaining([PARA_CODIGO[campo]])])
    expect(falta).not.toContain('TOLERANCIA_CLIENTE')
    expect(falta).not.toContain('PROXIMA_CALIBRACAO')
  })

  it('a linha do fim do ambiente e a data: os últimos ● (a data é a do passo 8, não o dia do começo)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.ambiente.linhas[1].temperatura = null
    r.passos.final.dataCalibracao = ''
    expect(faltaParaAssinar(r, p).map((x) => [x.codigo, x.etapa])).toEqual([
      ['FALTA_TEMPERATURA', 'ambienteFim'],
      ['FALTA_DATA', 'final'],
    ])
  })

  it('classe I: a umidade e o ΔT pesos − ar (ou a aclimatação) são ●', () => {
    const p = pacoteClasseI()
    const r = registroClasseI()
    r.passos.ambiente.linhas.forEach((l) => (l.umidade = null))
    r.passos.ambiente.deltaT = []
    expect(codigos(faltaParaAssinar(r, p))).toEqual(['FALTA_AR_MEDIDO', 'FALTA_DELTA_T'])
    // A aclimatação dos pesos dispensa o ΔT medido
    r.passos.ambiente.deltaT0 = { origem: L('19,0'), sala: L('21,5'), em: '2026-10-26T08:30:00-03:00' }
    expect(codigos(faltaParaAssinar(r, p))).toEqual(['FALTA_AR_MEDIDO'])
  })

  it('a pressão onde a falta dela é só aviso (calibração de antes da 1.0.5): não é ●', () => {
    const p = pacotePlataforma()
    p.entrada.pressaoComoAviso = true
    const r = registroPlataforma()
    r.passos.ambiente.linhas.forEach((l) => Object.assign(l, { pressao: null, instrumentos: ['pad-th01'] }))
    // Com o barômetro marcado como usado, a pressão continua pedida (o barômetro sem a pressão é pendência)
    expect(codigos(faltaParaAssinar(r, p))).toEqual(['FALTA_PRESSAO'])
    r.passos.padroes.find((x) => x.id === 'pad-br01')!.usado = false
    expect(faltaParaAssinar(r, p)).toEqual([])
  })

  it('as leituras mínimas, todas as posições e a carga escrita no local', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.repetibilidade[0].leituras.splice(2)
    r.passos.excentricidade.posicoes[4].leitura = null
    expect(faltaParaAssinar(r, p).map((x) => [x.codigo, x.texto, x.campo])).toEqual([
      ['POUCAS_LEITURAS_REPETIBILIDADE', 'Repetibilidade a 150,00 kg: 2 de 3 leituras', 'repetibilidade.rep1'],
      ['FALTA_POSICOES', 'Excentricidade: 1 posição sem leitura', 'excentricidade.posicoes'],
    ])
    // Medida antes das regras do POP: os mínimos são só aviso
    p.entrada.minimosComoAviso = true
    expect(faltaParaAssinar(r, p)).toEqual([])
    // A carga da repetibilidade escrita no local (sem carga prevista)
    const cli = registroDoCliente()
    cli.passos.repetibilidade[0].cargaAplicada = null
    expect(codigos(faltaParaAssinar(cli, pacoteDoCliente()))).toContain('FALTA_CARGA_REPETIBILIDADE')
    // A carga da excentricidade escrita no local
    const exc = registroDoCliente()
    exc.passos.excentricidade.cargaAplicada = null
    expect(codigos(faltaParaAssinar(exc, pacoteDoCliente()))).toEqual(['FALTA_CARGA_EXCENTRICIDADE'])
  })

  it('o ponto acrescentado no local com leitura e sem carga: a carga é ● (em branco de todo, não falta nada)', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    const novo: PontoCampo = {
      id: 'cel-extra',
      acrescentado: true,
      cargaPrevista: '',
      cargaAplicada: null,
      pecas: [],
      pecasTrocadas: false,
      nivelSubstituicao: 0,
      crescente: null,
      decrescente: null,
    }
    r.passos.indicacao.pontos.push(novo)
    // "+ Acrescentar ponto" tocado e deixado em branco: sai da folha ao finalizar, não é ●
    expect(codigos(faltaParaAssinar(r, p))).not.toContain('FALTA_CARGA_INDICACAO')
    novo.crescente = L('120,05')
    expect(faltaParaAssinar(r, p).filter((x) => x.codigo === 'FALTA_CARGA_INDICACAO')).toEqual([
      {
        codigo: 'FALTA_CARGA_INDICACAO',
        etapa: 'indicacao',
        passo: 5,
        texto: 'Carga do ponto acrescentado',
        campo: 'indicacao.pontos.cel-extra.cargaAplicada',
      },
    ])
    expect(podeFinalizar(r, p).pode).toBe(false)
    novo.cargaAplicada = L('120')
    expect(codigos(faltaParaAssinar(r, p))).not.toContain('FALTA_CARGA_INDICACAO')
  })

  it('excentricidade prevista como não aplicável: confirmar no local; não feita, o motivo', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    Object.assign(r.passos.excentricidade, { aplicavel: null, motivo: 'Balança suspensa.' })
    expect(codigos(faltaParaAssinar(r, p))).toEqual(['EXCENTRICIDADE_A_CONFIRMAR'])
    Object.assign(r.passos.excentricidade, { aplicavel: false, motivo: '' })
    expect(codigos(faltaParaAssinar(r, p))).toEqual(['FALTA_MOTIVO_EXCENTRICIDADE'])
  })

  it('excentricidade prevista como não aplicável e feita no local: as posições para digitar, e nada mais falta', () => {
    const p = pacotePlataforma()
    const naoAplicavel = { aplicavel: false, motivo: 'Copiado do certificado anterior.', carga: 0 }
    Object.assign(p.plano!.excentricidade, { ...naoAplicavel, posicoes: [] })
    Object.assign(p.entrada.excentricidade, { ...naoAplicavel, posicoes: [] })
    const r = registroPlataforma()
    r.correcoesPosAssinatura = []
    r.passos.excentricidade = vazia(p).passos.excentricidade
    // "Fazer o ensaio"
    r.passos.excentricidade.aplicavel = true
    expect(r.passos.excentricidade.posicoes).toHaveLength(5)
    expect(codigos(faltaParaAssinar(r, p))).toEqual(['FALTA_LEITURAS_EXCENTRICIDADE'])
    // A carga escrita no local (não há prevista) e as posições
    r.passos.excentricidade.cargaAplicada = L('100,00')
    r.passos.excentricidade.posicoes.forEach((x, i) => (x.leitura = L(i % 2 ? '100,05' : '100,00')))
    expect(faltaParaAssinar(r, p)).toEqual([])
    expect(registroParaRascunho(r, p).excentricidade).toMatchObject({ aplicavel: true, motivo: '', carga: 100 })
  })

  it('folha só do cliente e em branco: a balança e o cliente informados', () => {
    const p = pacoteDoCliente()
    const r = registroDoCliente()
    Object.assign(r.passos.balanca.informada!, { unidade: '', numeroSerie: '', identificacao: '', plataforma: '' })
    expect(codigos(faltaParaAssinar(r, p))).toEqual(
      expect.arrayContaining(['FALTA_UNIDADE_BALANCA', 'BALANCA_SEM_IDENTIFICACAO']),
    )
    r.passos.balanca.informada!.unidade = 'kg'
    r.passos.balanca.informada!.faixas = [{ max: '', e: '', d: '' }]
    expect(codigos(faltaParaAssinar(r, p))).toContain('BALANCA_SEM_FAIXA')
    const b = pacoteEmBranco()
    const vaziaBranco = vazia(b)
    expect(codigos(faltaParaAssinar(vaziaBranco, b))).toEqual(
      expect.arrayContaining(['FALTA_CLIENTE', 'FALTA_UNIDADE_BALANCA', 'BALANCA_SEM_IDENTIFICACAO', 'FALTA_ENDERECO']),
    )
  })

  it('encerrar sem completar: o motivo libera a assinatura mesmo com ● em branco', () => {
    const p = pacotePlataforma()
    const r = vazia(p)
    r.desfecho = 'INCOMPLETA'
    expect(podeFinalizar(r, p)).toEqual({ pode: false, motivo: 'Escreva o motivo de encerrar sem completar.' })
    r.motivoDesfecho = 'Cliente interrompeu o serviço.'
    expect(podeFinalizar(r, p)).toEqual({ pode: true, motivo: '' })
    r.desfecho = 'NAO_CALIBRADA'
    expect(podeFinalizar(r, p).pode).toBe(true)
  })
})

describe('etapas e progresso', () => {
  it('as 9 etapas na ordem física da folha (o ambiente do fim depois do passo 7)', () => {
    expect(ETAPAS_DA_FOLHA).toEqual([
      'padroes',
      'chegada',
      'balanca',
      'ambiente',
      'indicacao',
      'repetibilidade',
      'excentricidade',
      'ambienteFim',
      'final',
    ])
    const p = pacotePlataforma()
    const etapas = situacaoDasEtapas(registroPlataforma(), p, { hoje: HOJE })
    expect(etapas.map((e) => [e.etapa, e.passo, e.titulo, e.completa])).toEqual([
      ['padroes', 1, 'Antes de sair: padrões', true],
      ['chegada', 2, 'Chegada ao cliente', true],
      ['balanca', 3, 'Identificação da balança', true],
      ['ambiente', 4, 'Ambiente (início)', true],
      ['indicacao', 5, 'Erro de indicação', true],
      ['repetibilidade', 6, 'Repetibilidade', true],
      ['excentricidade', 7, 'Excentricidade', true],
      ['ambienteFim', 4, 'Ambiente (fim)', true],
      ['final', 8, 'Assinaturas e etiqueta', true],
    ])
    expect(progressoDaFolha(registroPlataforma(), p, { hoje: HOJE })).toEqual({
      completas: 9,
      total: 9,
      percentual: 100,
      proxima: null,
    })
  })

  it('folha vazia: nada completo, a próxima é o passo 1; os dados impressos a conferir contam', () => {
    const p = pacotePlataforma()
    const r = vazia(p)
    const etapas = situacaoDasEtapas(r, p, { hoje: HOJE })
    expect(etapas.find((e) => e.etapa === 'chegada')!.aConferir).toBe(p.conferir.chegada.length + 1)
    expect(etapas.find((e) => e.etapa === 'balanca')!.aConferir).toBe(p.conferir.balanca.length)
    expect(progressoDaFolha(r, p, { hoje: HOJE })).toEqual({ completas: 0, total: 9, percentual: 0, proxima: 'padroes' })
  })

  it('preenchendo na ordem: a barra anda e o "Continuar do passo…" acompanha', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.ambiente.linhas[1].temperatura = null
    r.passos.final.dataCalibracao = ''
    expect(progressoDaFolha(r, p, { hoje: HOJE })).toEqual({ completas: 7, total: 9, percentual: 78, proxima: 'ambienteFim' })
    r.passos.ambiente.linhas[1].temperatura = L('25,1')
    expect(progressoDaFolha(r, p, { hoje: HOJE })).toMatchObject({ completas: 8, proxima: 'final' })
    r.passos.balanca.conferencias[0].confere = null
    expect(progressoDaFolha(r, p, { hoje: HOJE })).toMatchObject({ completas: 7, proxima: 'balanca' })
  })

  it('▲ na etapa com aviso ainda não conferido; conferido, some', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.ambiente.linhas[1].temperatura!.valor = '41,0'
    r.passos.indicacao.pontos.find((x) => x.id === 'p3')!.crescente!.valor = '100,03'
    const etapas = situacaoDasEtapas(r, p, { hoje: HOJE })
    expect(etapas.filter((e) => e.comAviso).map((e) => e.etapa)).toEqual(['indicacao', 'ambienteFim'])
    for (const a of avisosDoRegistro(r, p, { hoje: HOJE })) r.avisosConferidos.push(conferirAviso(a, '2026-10-21T10:00:00-03:00'))
    expect(situacaoDasEtapas(r, p, { hoje: HOJE }).some((e) => e.comAviso)).toBe(false)
  })
})

describe('revisão (antes de assinar)', () => {
  it('falta para assinar, isto impede o certificado e confira a digitação, sem repetir o que falta', () => {
    const p = pacotePlataforma()
    const r = registroPlataforma()
    r.passos.ambiente.linhas[1].temperatura = null
    r.passos.indicacao.pontos.find((x) => x.id === 'p3')!.crescente!.valor = '100,03'
    r.passos.indicacao.pontos.find((x) => x.id === 'p4')!.decrescente = null
    const rev = revisaoDaFolha(r, p, { hoje: HOJE })
    expect(codigos(rev.falta)).toEqual(['FALTA_TEMPERATURA'])
    // A falta da temperatura já está em "Falta para assinar"; a descida que falta é pendência do cálculo
    expect(codigos(rev.impede)).toEqual(['FALTA_DESCIDA'])
    expect(rev.impede[0].texto).toBe('Erro de indicação: falta a leitura de descida em 150,00 kg (POP 7.7).')
    expect(codigos(rev.digitacao)).toEqual(['FORA_DA_DIVISAO'])
    expect(rev.tudoCerto).toEqual(['padroes', 'chegada', 'balanca', 'ambiente', 'repetibilidade', 'excentricidade', 'final'])
  })

  it('as folhas dos exemplos: tudo certo', () => {
    for (const { pacote, registro } of exemplosCampo()) {
      const rev = revisaoDaFolha(registro, pacote, { hoje: HOJE })
      expect(rev).toEqual({ falta: [], impede: [], digitacao: [], tudoCerto: [...ETAPAS_DA_FOLHA] })
    }
  })
})

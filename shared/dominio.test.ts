// Regras do domínio ligadas ao procedimento PT-CAL-01: textos do certificado, verificação antes de calibrar
// sem resposta, pendências da emissão (ambiente, termo-higrômetro, textos obrigatórios) e o limite de ΔT.

import { describe, expect, it } from 'vitest'
import {
  avisoDeltaT,
  calibracaoVazia,
  completarConfig,
  CONFIG_PADRAO,
  limiteDeltaT,
  normalizarCalibracao,
  normalizarConfig,
  PADRAO_VAZIO,
  pendenciasEmissao,
  ROTULO_VERIFICACAO,
  ROTULO_ZERO_AUTOMATICO,
  TEXTOS_PADRAO,
  textosObrigatoriosVazios,
} from './dominio.ts'
import type { CalibracaoInput, Padrao, TipoPadrao } from './tipos.ts'

const padrao = (id: string, tipo: TipoPadrao): Padrao => ({
  ...PADRAO_VAZIO,
  id,
  tipo,
  versao: 1,
  identificacao: id.toUpperCase(),
  certificado: 'LAB-1/2026',
  validade: '2099-01-01',
  criadoEm: '',
  atualizadoEm: '',
})
const PESOS = padrao('jp-01', 'PESOS')
const TERMO = padrao('th-01', 'TERMOHIGROMETRO')

/** Calibração pronta para emitir (do ponto de vista do cadastro e do ambiente). */
function pronta(): CalibracaoInput {
  return {
    ...calibracaoVazia(),
    clienteId: 'c',
    balancaId: 'b',
    dataCalibracao: '2026-10-20',
    tecnicoId: 'u',
    localEndereco: 'Rua 1, 10 – Rio Claro/SP',
    padroesIds: [PESOS.id, TERMO.id],
    ambiente: { temperaturaInicial: 22, temperaturaFinal: 23, umidadeInicial: 55, umidadeFinal: 56, pressao: null },
    preliminar: { identificavel: 'SIM', limpa: 'SIM', nivelada: 'NA', aquecida: 'SIM', preCarga: 'SIM', zeroAutomatico: 'LIGADO' },
  }
}
const contexto = { padroes: [PESOS, TERMO], hoje: '2026-10-22', temPesos: true }

describe('textos do certificado (PT-CAL-01 rev. 00)', () => {
  it('o certificado cita o PT-CAL-01 rev. 00 e descreve o método e a incerteza', () => {
    expect(TEXTOS_PADRAO.procedimento).toBe('PT-CAL-01 rev. 00')
    const d = TEXTOS_PADRAO.procedimentoDescricao
    expect(d).toMatch(/^Calibração por comparação com pesos padrão \(nas balanças rodoviárias e ferroviárias, também com cargas de substituição\)/)
    expect(d).toContain('procedimento PT-CAL-01')
    expect(d).toContain('EURAMET Calibration Guide No. 18, versão 4.0 (2015)')
    expect(d).toContain('repetibilidade, excentricidade e erro de indicação')
    expect(d).toContain('JCGM 100:2008')
  })

  it('ao gravar, recusa os textos obrigatórios em branco e volta ao de fábrica', () => {
    const r = normalizarConfig({ textos: { naoAcreditado: '  ', controleLegal: '', observacoesPadrao: '' } })
    expect(r.erros).toEqual([
      'Preencha o texto “Empresa não acreditada”: ele é obrigatório no certificado.',
      'Preencha o texto “Verificação do Inmetro / IPEM”: ele é obrigatório no certificado.',
    ])
    expect(r.valor.textos.naoAcreditado).toBe(TEXTOS_PADRAO.naoAcreditado)
    expect(r.valor.textos.controleLegal).toBe(TEXTOS_PADRAO.controleLegal)
    // Os opcionais podem ficar em branco
    expect(r.valor.textos.observacoesPadrao).toBe('')
    expect(normalizarConfig({ textos: { rastreabilidade: '', incerteza: '' } }).erros).toHaveLength(2)
    // Um texto mudado (não vazio) fica como está
    const mudado = normalizarConfig({ textos: { naoAcreditado: 'A {empresa} não é acreditada.' } })
    expect(mudado.erros).toEqual([])
    expect(mudado.valor.textos.naoAcreditado).toBe('A {empresa} não é acreditada.')
  })

  it('uma configuração antiga gravada com um obrigatório em branco é lida com o texto de fábrica', () => {
    const lida = completarConfig({ ...CONFIG_PADRAO, textos: { ...TEXTOS_PADRAO, rastreabilidade: '', incerteza: ' ' } })
    expect(lida.textos.rastreabilidade).toBe(TEXTOS_PADRAO.rastreabilidade)
    expect(lida.textos.incerteza).toBe(TEXTOS_PADRAO.incerteza)
    expect(textosObrigatoriosVazios(lida.textos)).toEqual([])
    expect(textosObrigatoriosVazios({ ...TEXTOS_PADRAO, controleLegal: '' })).toEqual(['Verificação do Inmetro / IPEM'])
  })
})

describe('verificação antes de calibrar', () => {
  it('a calibração nova começa sem nenhuma resposta (nada de "Sim" e "Ligado" prontos)', () => {
    expect(calibracaoVazia().preliminar).toEqual({
      identificavel: '',
      limpa: '',
      nivelada: '',
      aquecida: '',
      preCarga: '',
      zeroAutomatico: '',
    })
    expect(calibracaoVazia().conformidade.solicitada).toBe(false)
    expect(calibracaoVazia().proximaNoCertificado).toBe(false)
  })

  it('o que não veio fica sem resposta; o zero automático aceita "não verificado"', () => {
    const base = { clienteId: 'c', balancaId: 'b' }
    expect(normalizarCalibracao(base).valor.preliminar).toEqual(calibracaoVazia().preliminar)
    const r = normalizarCalibracao({
      ...base,
      preliminar: { identificavel: 'SIM', limpa: 'NAO', nivelada: 'NA', aquecida: 'TALVEZ', zeroAutomatico: 'NAO_VERIFICADO' },
    }).valor.preliminar
    expect(r).toEqual({ identificavel: 'SIM', limpa: 'NAO', nivelada: 'NA', aquecida: '', preCarga: '', zeroAutomatico: 'NAO_VERIFICADO' })
  })

  it('rótulos para o certificado, inclusive "sem resposta" e "não verificado"', () => {
    expect(ROTULO_VERIFICACAO).toEqual({ SIM: 'sim', NAO: 'não', NA: 'n/a', '': 'sem resposta' })
    expect(ROTULO_ZERO_AUTOMATICO.NAO_VERIFICADO).toBe('não verificado')
    expect(ROTULO_ZERO_AUTOMATICO['']).toBe('sem resposta')
  })
})

describe('pendenciasEmissao (regras do PT-CAL-01)', () => {
  it('a calibração completa não tem pendência', () => {
    expect(pendenciasEmissao(pronta(), { ...contexto, textos: TEXTOS_PADRAO })).toEqual([])
  })

  it('a verificação antes de calibrar precisa de todas as respostas', () => {
    const k = pronta()
    k.preliminar = { ...k.preliminar, limpa: '', zeroAutomatico: '' }
    expect(pendenciasEmissao(k, contexto)).toEqual([
      'Responda a verificação antes de calibrar (etapa “Balança e ajuste”): limpeza e zero automático.',
    ])
    k.preliminar.zeroAutomatico = 'NAO_VERIFICADO'
    expect(pendenciasEmissao(k, contexto)).toEqual([
      'Responda a verificação antes de calibrar (etapa “Balança e ajuste”): limpeza.',
    ])
    expect(pendenciasEmissao({ ...k, preliminar: calibracaoVazia().preliminar }, contexto)[0]).toBe(
      'Responda a verificação antes de calibrar (etapa “Balança e ajuste”): identificação, limpeza, nivelamento, aquecimento, pré-carga e zero automático.',
    )
  })

  it('umidade relativa no início e no fim, e o termo-higrômetro marcado', () => {
    const k = pronta()
    k.ambiente = { ...k.ambiente, umidadeFinal: null }
    expect(pendenciasEmissao(k, contexto)).toEqual(['Registre a umidade relativa no início e no fim da calibração.'])
    expect(pendenciasEmissao(pronta(), { ...contexto, padroes: [PESOS] })).toEqual([
      'Escolha o termo-higrômetro usado (etapa “Padrões e ambiente”).',
    ])
  })

  it('texto obrigatório do certificado em branco (quando a tela ou o servidor passam os textos)', () => {
    expect(pendenciasEmissao(pronta(), { ...contexto, textos: { ...TEXTOS_PADRAO, naoAcreditado: '' } })).toEqual([
      'O texto “Empresa não acreditada” do certificado está em branco: preencha em Configurações → Certificado.',
    ])
  })
})

describe('variação da temperatura (ΔT) pela classe', () => {
  it('classe II: 3 °C; III, IIII e sem classe: 5 °C', () => {
    expect(limiteDeltaT('II')).toBe(3)
    expect(limiteDeltaT('III')).toBe(5)
    expect(limiteDeltaT('IIII')).toBe(5)
    expect(limiteDeltaT('')).toBe(5)
  })

  it('avisa acima do limite (não bloqueia); sem as duas leituras, nada', () => {
    const amb = (ti: number | null, tf: number | null) => ({ ...pronta().ambiente, temperaturaInicial: ti, temperaturaFinal: tf })
    expect(avisoDeltaT(amb(20, 23), 'II')).toBeNull()
    expect(avisoDeltaT(amb(20, 23.5), 'II')).toBe(
      'A temperatura variou 3,5 °C durante a calibração; o limite na classe II é 3 °C. Registre nas observações.',
    )
    expect(avisoDeltaT(amb(20, 23.5), 'III')).toBeNull()
    expect(avisoDeltaT(amb(25, 19), 'IIII')).toBe(
      'A temperatura variou 6 °C durante a calibração; o limite na classe IIII é 5 °C. Registre nas observações.',
    )
    expect(avisoDeltaT(amb(20, 26), '')).toMatch(/o limite sem classe é 5 °C/)
    expect(avisoDeltaT(amb(null, 26), 'II')).toBeNull()
  })
})

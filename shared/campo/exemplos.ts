// Exemplos realistas do app do celular, para os testes (do shared, do servidor, do app) e as amostras do PDF da folha
// impressa assinada. Só para testes e amostras: importa as folhas de exemplo do servidor (server/pdf/exemplosFolhaCampo.ts,
// os mesmos cadastros dos certificados de exemplo), então não entra no app nem nas telas.
//
//   pacotes: plataforma classe III (FC-2026-00042), rodoviária 80 t com cargas de substituição (FC-2026-00044), analítica
//            classe I (FC-2026-00048), folha só do cliente (FC-2026-00051) e folha em branco (FC-2026-00045);
//   registros completos, finalizados e assinados:
//     - plataforma: piloto, com uma correção antes de assinar, um dado impresso diferente, uma observação, a assinatura
//       do cliente e uma correção depois da assinatura;
//     - rodoviária: as etapas de substituição intercaladas com os pontos, um aviso conferido e "Cliente não assinou";
//     - classe I: CAL interno, o ΔT medido duas vezes (a linha do início repetida depois da aclimatação), pesos no local
//       desde a véspera, 10 leituras na repetibilidade, o zero antes de cada posição e a assinatura do cliente;
//     - só do cliente: a balança informada no local (classe III), pontos e ensaio acrescentados, no laboratório da
//       empresa (assinatura do cliente dispensada).
// Tudo determinístico (horários fixos em Brasília, −03:00): os sha256 não mudam entre as execuções.

import {
  folhaClasseI,
  folhaDoClienteComOs,
  folhaEmBranco,
  folhaPlataforma,
  folhaRodoviaria,
  padroesDaEmpresa,
} from '../../server/pdf/exemplosFolhaCampo.ts'
import { ASSINATURA_EXEMPLO_1, ASSINATURA_EXEMPLO_2 } from '../../server/pdf/assinaturasExemplo.ts'
import { casasDecimais, faixaDoValor } from '../metrologia/index.ts'
import { calcularConteudoSha256, calcularSha256Pacote, jsonCanonico, sha256Hex } from './canonico.ts'
import { type DadosImpressosFolhaCampo, montarPacote } from './pacote.ts'
import { instanteLocal, registroInicial } from './registro.ts'
import type {
  AparelhoCampo,
  AssinaturaDoClienteCampo,
  Instante,
  LeituraCampo,
  PacoteCampo,
  PessoaCampo,
  RegistroCampo,
  ViaLeitura,
} from './tipos.ts'

/** Técnico dos exemplos (fictício, o mesmo das folhas de exemplo). */
export const TECNICO_EXEMPLO: PessoaCampo = { id: 'usr-carlos', nome: 'Carlos Eduardo Lima' }
export const APARELHO_EXEMPLO: AparelhoCampo = {
  id: '6f1c2a9e-3b4d-4c8e-9a1f-2b3c4d5e6f70',
  modelo: 'Samsung SM-A546E',
  versaoApp: '1.1.0',
}
const ENVIADA_POR = 'Ana Paula Souza'
const FUSO_BRASILIA = -180

/** Ids dos envios dos exemplos. */
export const ENVIOS_EXEMPLO = {
  plataforma: '5b0e6a52-1c3f-4e7a-9d2b-8f1a0c3e5d71',
  rodoviaria: '7c2f8b14-5d6e-4f80-a1b2-c3d4e5f60718',
  classeI: '9e4a1d36-7f80-4b12-8c3d-4e5f60718293',
  cliente: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  branco: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
} as const

function pacoteDe(
  d: DadosImpressosFolhaCampo,
  envioId: string,
  enviadaEm: string,
  extras: { piloto?: boolean; recado?: string; origem?: 'calibracao' | 'balanca' } = {},
): PacoteCampo {
  return montarPacote(d, {
    envioId,
    origem: extras.origem,
    recado: extras.recado,
    piloto: extras.piloto ?? false,
    enviadaEm,
    enviadaPor: ENVIADA_POR,
    versaoSistema: '1.1.0',
    dadosSha256: sha256Hex(jsonCanonico(d)),
    ativos: padroesDaEmpresa(),
  })
}

export const pacotePlataforma = () =>
  pacoteDe(folhaPlataforma(), ENVIOS_EXEMPLO.plataforma, '2026-10-20T20:10:00.000Z', {
    piloto: true,
    recado: 'Levar a escada da doca 2.',
  })
export const pacoteRodoviaria = () =>
  pacoteDe(folhaRodoviaria(), ENVIOS_EXEMPLO.rodoviaria, '2026-10-26T19:30:00.000Z', {
    recado: 'Caminhão de areia combinado com o Ricardo.',
  })
export const pacoteClasseI = () => pacoteDe(folhaClasseI(), ENVIOS_EXEMPLO.classeI, '2026-10-23T18:00:00.000Z')
export const pacoteDoCliente = () => pacoteDe(folhaDoClienteComOs(), ENVIOS_EXEMPLO.cliente, '2026-11-10T13:00:00.000Z')
export const pacoteEmBranco = () => pacoteDe(folhaEmBranco(), ENVIOS_EXEMPLO.branco, '2026-10-21T12:30:00.000Z')

// ---- Ferramentas de preenchimento ------------------------------------------------------------------------------------

/** Relógio dos exemplos: começa num horário de Brasília e anda `s` segundos a cada leitura. */
function relogio(inicio: string) {
  let ms = Date.parse(`${inicio}-03:00`)
  return (s = 0): Instante => {
    ms += s * 1000
    return instanteLocal(new Date(ms), FUSO_BRASILIA)
  }
}

/** A leitura de um valor, na divisão `d` (múltiplo de d, com as casas de d), como o técnico digitaria. */
function leituraNa(valor: number, d: number, em: Instante, via: ViaLeitura = 'teclado'): LeituraCampo {
  const casas = casasDecimais(d)
  const v = d > 0 ? Math.round(valor / d) * d : valor
  return { valor: (Object.is(v, -0) ? 0 : v).toFixed(casas).replace('.', ','), em, via }
}

const texto = (valor: string, em: Instante): LeituraCampo => ({ valor, em, via: 'teclado' })

/** Erro de indicação: subida na ordem, a descida a partir do ponto mais alto (sem o zero e a virada), as etapas antes. */
function preencherIndicacao(r: RegistroCampo, p: PacoteCampo, t: ReturnType<typeof relogio>, erros: number[]) {
  const plano = p.plano!
  const ind = r.passos.indicacao
  const desce = plano.metodo === 'CRESCENTE_DECRESCENTE'
  const etapaCarga = plano.substituicao.carga
  const dZero = plano.pontos[0]?.d ?? 0
  let feitas = 0
  ind.pontos.forEach((pt, i) => {
    const pp = plano.pontos[i]
    // As etapas de substituição antes do ponto que precisa delas (a ordem em que são feitas)
    while (ind.substituicao && feitas < pt.nivelSubstituicao && feitas < ind.substituicao.etapas.length) {
      const et = ind.substituicao.etapas[feitas]
      const nominal = (feitas + 1) * etapaCarga
      et.padroes = leituraNa(nominal, pp.d, t(240))
      et.substituicao = leituraNa(nominal + pp.d, pp.d, t(600))
      et.material = feitas === 0 ? 'Caminhão basculante com areia' : 'Mais areia no mesmo caminhão'
      feitas++
    }
    pt.crescente = leituraNa(pp.carga + (erros[i] ?? 0) * pp.d, pp.d, t(55))
  })
  if (desce)
    for (let i = ind.pontos.length - 2; i >= 1; i--) {
      const pp = plano.pontos[i]
      if (!(pp.carga > 0)) continue
      ind.pontos[i].decrescente = leituraNa(pp.carga + ((erros[i] ?? 0) + 1) * pp.d, pp.d, t(45))
    }
  ind.retornoZero = leituraNa(0, dZero, t(40))
}

const PADRAO_REPETIBILIDADE = [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0]

function preencherRepetibilidade(r: RegistroCampo, p: PacoteCampo, t: ReturnType<typeof relogio>) {
  const b = p.balanca!
  r.passos.repetibilidade.forEach((ensaio, k) => {
    const pr = p.plano!.repetibilidade[k]
    const d = faixaDoValor(pr.carga, b).d
    let anterior = ''
    ensaio.leituras = Array.from({ length: pr.leituras }, (_, j) => {
      const l = leituraNa(pr.carga + PADRAO_REPETIBILIDADE[j % PADRAO_REPETIBILIDADE.length] * d, d, t(35))
      const repetida = l.valor === anterior
      anterior = l.valor
      return repetida ? { ...l, via: 'repetir' as const } : l
    })
  })
}

function preencherExcentricidade(r: RegistroCampo, p: PacoteCampo, t: ReturnType<typeof relogio>, comZero: boolean) {
  const e = p.plano!.excentricidade
  const d = faixaDoValor(e.carga, p.balanca!).d
  r.passos.excentricidade.aplicavel = true
  r.passos.excentricidade.posicoes.forEach((pos, j) => {
    if (comZero) pos.zeroAntes = leituraNa(0, d, t(30))
    pos.leitura = leituraNa(e.carga + [0, 1, 0, 1, 1, 0][j % 6] * d, d, t(40))
  })
}

const idPorTipo = (p: PacoteCampo, tipo: string) => p.padroes.cadastro.find((x) => x.tipo === tipo)?.id ?? ''

/** Finaliza: hora de término, conteudoSha256 e as assinaturas (o cliente, se assinou). */
function finalizar(
  r: RegistroCampo,
  t: ReturnType<typeof relogio>,
  cliente: { assinou: { nome: string; funcao: string } } | { alternativa: AssinaturaDoClienteCampo },
): RegistroCampo {
  r.relogio.finalizadoEm = t(120)
  const conteudo = calcularConteudoSha256(r, sha256Hex)
  r.assinaturas.tecnico = { nome: r.tecnico.nome, png: ASSINATURA_EXEMPLO_1, em: t(60), conteudoSha256: conteudo }
  r.assinaturas.cliente =
    'assinou' in cliente
      ? { ...cliente.assinou, png: ASSINATURA_EXEMPLO_2, em: t(90), conteudoSha256: conteudo }
      : cliente.alternativa
  return r
}

// ---- Registros completos -------------------------------------------------------------------------------------------

/** Plataforma 300 kg classe III (piloto): completa, com correções antes e depois da assinatura. */
export function registroPlataforma(): RegistroCampo {
  const p = pacotePlataforma()
  const t = relogio('2026-10-21T08:05:00')
  const r = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, {
    pacoteSha256: calcularSha256Pacote(p, sha256Hex),
    agora: t(),
  })
  const ps = r.passos
  ps.padroes.forEach((x) => Object.assign(x, { levado: true, usado: true }))
  ps.chegada.conferencias.forEach((x) => (x.confere = true))
  ps.chegada.local = 'CLIENTE'
  ps.chegada.inicio = t(1500)
  ps.balanca.conferencias.forEach((x) => (x.confere = x.campo !== 'balanca.localInstalacao'))
  r.anotacoes.push({
    id: 'an-1',
    passo: 3,
    tipo: 'DADO_DIFERENTE',
    campo: 'balanca.localInstalacao',
    texto: 'A balança está na doca 3, não na doca 2.',
    em: t(60),
  })
  const th = idPorTipo(p, 'TERMOHIGROMETRO')
  const br = idPorTipo(p, 'BAROMETRO')
  const inicio = ps.ambiente.linhas[0]
  Object.assign(inicio, {
    em: t(600),
    temperatura: texto('24,6', t(5)),
    umidade: texto('58', t(5)),
    pressao: texto('948,7', t(10)),
    instrumentos: [th, br],
  })
  r.anotacoes.push({
    id: 'an-2',
    passo: 4,
    tipo: 'OBSERVACAO',
    campo: '',
    texto: 'Piso da doca molhado; plataforma limpa e seca antes dos ensaios.',
    em: t(30),
  })
  preencherIndicacao(r, p, t, [0, 0, 0, 1, 1, 1, 2, 2])
  // Correção antes de assinar: 150,50 digitado e corrigido para 150,05 (o risco único do papel)
  const p4 = ps.indicacao.pontos.find((x) => x.id === 'p4')!
  r.trilha.push({ campo: 'indicacao.pontos.p4.crescente', de: '150,50', para: p4.crescente!.valor, em: t(20), motivo: '' })
  preencherRepetibilidade(r, p, t)
  preencherExcentricidade(r, p, t, false)
  const fim = ps.ambiente.linhas[1]
  Object.assign(fim, {
    em: t(300),
    temperatura: texto('25,1', t(5)),
    umidade: texto('56', t(5)),
    pressao: texto('948,3', t(10)),
    instrumentos: [th, br],
  })
  ps.final.dataCalibracao = '2026-10-21'
  ps.final.termino = t(120)
  finalizar(r, t, { assinou: { nome: 'Juliana Prado', funcao: 'Supervisora de qualidade' } })
  // Correção depois da assinatura (por acréscimo; o valor assinado continua no passo)
  r.correcoesPosAssinatura.push({
    campo: 'excentricidade.posicoes.3.leitura',
    de: ps.excentricidade.posicoes[3].leitura!.valor,
    para: '100,00',
    em: t(300),
    motivo: 'Anotei a posição errada; conferido de novo na balança.',
    mostradoAoCliente: false,
  })
  return r
}

/** Rodoviária 80 t com 3 etapas de substituição: completa; ninguém da usina acompanhou. */
export function registroRodoviaria(): RegistroCampo {
  const p = pacoteRodoviaria()
  const t = relogio('2026-10-27T07:30:00')
  const r = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, {
    pacoteSha256: calcularSha256Pacote(p, sha256Hex),
    agora: t(),
  })
  const ps = r.passos
  ps.padroes.forEach((x) => Object.assign(x, { levado: true, usado: true }))
  ps.chegada.conferencias.forEach((x) => (x.confere = true))
  ps.chegada.local = 'CLIENTE'
  ps.chegada.inicio = t(2400)
  ps.balanca.conferencias.forEach((x) => (x.confere = true))
  const th = idPorTipo(p, 'TERMOHIGROMETRO')
  const br = idPorTipo(p, 'BAROMETRO')
  Object.assign(ps.ambiente.linhas[0], {
    em: t(900),
    temperatura: texto('31,8', t(5)),
    umidade: texto('44', t(5)),
    pressao: texto('951,2', t(10)),
    instrumentos: [th, br],
  })
  r.avisosConferidos.push({
    codigo: 'TEMPERATURA_IMPROVAVEL',
    classe: 'DIGITACAO',
    campo: 'ambiente.linhas.0.temperatura',
    texto: 'Temperatura 31,8 °C: confira a digitação.',
    em: t(5),
    motivo: '',
  })
  preencherIndicacao(r, p, t, [0, 0, 1, 1, 1, 2])
  preencherRepetibilidade(r, p, t)
  preencherExcentricidade(r, p, t, false)
  Object.assign(ps.ambiente.linhas[1], {
    em: t(600),
    temperatura: texto('33,0', t(5)),
    umidade: texto('41', t(5)),
    pressao: texto('950,6', t(10)),
    instrumentos: [th, br],
  })
  ps.final.dataCalibracao = '2026-10-27'
  ps.final.termino = t(300)
  return finalizar(r, t, {
    alternativa: { naoAssinou: true, motivo: 'Ninguém da usina acompanhou: o responsável estava em reunião.', em: t(30) },
  })
}

/** Analítica 220 g classe I: completa, com a aclimatação dos pesos e o zero antes de cada posição. */
export function registroClasseI(): RegistroCampo {
  const p = pacoteClasseI()
  const t = relogio('2026-10-26T08:10:00')
  const r = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, {
    pacoteSha256: calcularSha256Pacote(p, sha256Hex),
    agora: t(),
  })
  const ps = r.passos
  ps.padroes.forEach((x) => Object.assign(x, { levado: true, usado: true }))
  ps.chegada.conferencias.forEach((x) => (x.confere = true))
  ps.chegada.local = 'CLIENTE'
  ps.chegada.inicio = t(600)
  ps.balanca.conferencias.forEach((x) => (x.confere = true))
  const th = idPorTipo(p, 'TERMOHIGROMETRO')
  const br = idPorTipo(p, 'BAROMETRO')
  const td = idPorTipo(p, 'OUTRO')
  // Os pesos ficaram na sala desde a véspera; o 1º ΔT passou de 1 °C: aguardou e mediu de novo (a linha do início repetida)
  ps.ambiente.pesosNoLocalDesde = '2026-10-25T17:40:00-03:00'
  Object.assign(ps.ambiente.linhas[0], {
    em: t(900),
    temperatura: texto('21,4', t(5)),
    umidade: texto('47', t(5)),
    pressao: texto('949,2', t(10)),
    instrumentos: [th, br],
  })
  ps.ambiente.deltaT.push({ valor: texto('1,6', t(30)), instrumento: td })
  const repetida = {
    momento: 'INICIO_REPETIDA' as const,
    em: t(2400),
    temperatura: texto('21,5', t(5)),
    umidade: texto('47', t(5)),
    pressao: texto('949,0', t(10)),
    instrumentos: [th, br],
  }
  ps.ambiente.linhas.splice(1, 0, repetida)
  ps.ambiente.deltaT.push({ valor: texto('0,6', t(30)), instrumento: td })
  ps.indicacao.calInterno = { feito: true, em: t(120) }
  r.anotacoes.push({
    id: 'an-1',
    passo: 4,
    tipo: 'OBSERVACAO',
    campo: '',
    texto: 'Ar-condicionado da sala ligado em 21 °C durante os ensaios.',
    em: t(10),
  })
  preencherIndicacao(r, p, t, [0, 0, 1, 1, 2, 2])
  preencherRepetibilidade(r, p, t)
  preencherExcentricidade(r, p, t, true)
  Object.assign(ps.ambiente.linhas[2], {
    em: t(300),
    temperatura: texto('21,7', t(5)),
    umidade: texto('46', t(5)),
    pressao: texto('948,8', t(10)),
    instrumentos: [th, br],
  })
  ps.final.dataCalibracao = '2026-10-26'
  ps.final.termino = t(120)
  return finalizar(r, t, { assinou: { nome: 'Camila Torres', funcao: 'Analista da garantia da qualidade' } })
}

/** Folha só do cliente: a balança informada no local (classe III), calibrada no laboratório da empresa. */
export function registroDoCliente(): RegistroCampo {
  const p = pacoteDoCliente()
  const t = relogio('2026-11-12T13:20:00')
  const r = registroInicial(p, TECNICO_EXEMPLO, APARELHO_EXEMPLO, {
    pacoteSha256: calcularSha256Pacote(p, sha256Hex),
    agora: t(),
  })
  const ps = r.passos
  ps.padroes.forEach((x) =>
    Object.assign(x, {
      levado: x.identificacao !== 'PP500-01 a 20',
      usado: ['JP-01', 'PP20-01 a 15', 'TH-01', 'BR-01'].includes(x.identificacao),
    }),
  )
  ps.chegada.conferencias.forEach((x) => (x.confere = true))
  ps.chegada.local = 'LABORATORIO'
  ps.chegada.inicio = t(300)
  ps.balanca.informada = {
    tipo: 'Plataforma',
    fabricante: 'Filizola',
    modelo: 'ID-M 150',
    numeroSerie: 'FZ-55120',
    identificacao: 'BAL-EXP-09',
    localInstalacao: 'Expedição — doca 3',
    anoFabricacao: '2015',
    apoios: '4',
    plataforma: 'Filizola PL 1,0 × 1,0 m',
    portariaAprovacao: '',
    classe: 'III',
    tipoFaixas: 'UNICA',
    receptor: 'RETANGULAR',
    unidade: 'kg',
    faixas: [{ max: '150', e: '0,05', d: '0,05' }],
    min: '1',
  }
  const th = idPorTipo(p, 'TERMOHIGROMETRO')
  const br = idPorTipo(p, 'BAROMETRO')
  Object.assign(ps.ambiente.linhas[0], {
    em: t(900),
    temperatura: texto('23,2', t(5)),
    umidade: texto('55', t(5)),
    pressao: texto('949,9', t(10)),
    instrumentos: [th, br],
  })
  const d = 0.05
  ps.indicacao.pontos = [0, 1, 50, 100, 150].map((carga, i) => ({
    id: `cel-p${i}`,
    acrescentado: true,
    cargaPrevista: '',
    cargaAplicada: texto(String(carga), t(20)),
    pecas: [],
    pecasTrocadas: false,
    nivelSubstituicao: 0,
    crescente: leituraNa(carga + (i > 2 ? d : 0), d, t(50)),
    decrescente: i > 0 && i < 4 ? leituraNa(carga + d, d, t(45)) : null,
  }))
  ps.indicacao.retornoZero = leituraNa(0, d, t(40))
  ps.repetibilidade = [{ id: 'cel-r1', cargaPrevista: '', cargaAplicada: texto('50', t(30)), leituras: [] }]
  ps.repetibilidade[0].leituras = [0, 0, 1, 0, 0].map((x, j) =>
    leituraNa(50 + x * d, d, t(35), j === 1 || j === 4 ? 'repetir' : 'teclado'),
  )
  ps.excentricidade.cargaAplicada = texto('50', t(30))
  ps.excentricidade.posicoes.forEach((pos, j) => (pos.leitura = leituraNa(50 + [0, 1, 0, 0, 1][j] * d, d, t(40))))
  Object.assign(ps.ambiente.linhas[1], {
    em: t(300),
    temperatura: texto('23,6', t(5)),
    umidade: texto('54', t(5)),
    pressao: texto('949,6', t(10)),
    instrumentos: [th, br],
  })
  ps.final.dataCalibracao = '2026-11-12'
  ps.final.termino = t(120)
  return finalizar(r, t, { alternativa: { dispensada: 'LABORATORIO' } })
}

/** Todos os exemplos, com o pacote de cada registro. */
export function exemplosCampo(): Array<{ nome: string; pacote: PacoteCampo; registro: RegistroCampo }> {
  return [
    { nome: 'plataforma', pacote: pacotePlataforma(), registro: registroPlataforma() },
    { nome: 'rodoviaria', pacote: pacoteRodoviaria(), registro: registroRodoviaria() },
    { nome: 'classeI', pacote: pacoteClasseI(), registro: registroClasseI() },
    { nome: 'cliente', pacote: pacoteDoCliente(), registro: registroDoCliente() },
  ]
}

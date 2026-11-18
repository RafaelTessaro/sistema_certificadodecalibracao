import { describe, expect, it } from 'vitest'
import {
  folhaClasseI,
  folhaDoClienteComOs,
  folhaEmBranco,
  folhaEmBrancoSemPadroes,
  folhaMultiIntervalo,
  folhaPlataforma,
  folhaRodoviaria,
  folhaRodoviariaMultiIntervalo,
  folhaRodoviariaSemHistorico,
  padroesDaEmpresa,
} from '../../server/pdf/exemplosFolhaCampo.ts'
import type { DadosFolhaCampo } from '../../server/pdf/folhaCampo.ts'
import { AVISO_ETIQUETA, FORMULARIO_FOLHA_CAMPO, planoDaFolha } from '../folhaCampo.ts'
import { calcularSha256Pacote, jsonCanonico, sha256Hex } from './canonico.ts'
import {
  comSubstituicao,
  dataDaFolha,
  type DadosImpressosFolhaCampo,
  type ExtrasPacote,
  identificacaoDaBalanca,
  montarPacote,
  resumoDoEnvio,
  tipoDaFolha,
} from './pacote.ts'
import { CONTRATO_CAMPO, FORMATO_PACOTE, FORMATO_REGISTRO } from './protocolo.ts'
import { CAMPOS_METROLOGICOS } from './tipos.ts'

const EXTRAS: ExtrasPacote = {
  envioId: '5b0e6a52-1c3f-4e7a-9d2b-8f1a0c3e5d71',
  piloto: true,
  enviadaEm: '2026-10-20T20:10:00.000Z',
  enviadaPor: 'Ana Paula Souza',
  versaoSistema: '1.1.0',
  ativos: padroesDaEmpresa(),
}

// O servidor passa o `DadosFolhaCampo` (com o nº do certificado) como está: a forma tem de ser a mesma
const _mesmaForma: DadosImpressosFolhaCampo = folhaPlataforma() satisfies DadosFolhaCampo
void _mesmaForma

const COM_BALANCA = {
  folhaPlataforma,
  folhaMultiIntervalo,
  folhaRodoviaria,
  folhaRodoviariaSemHistorico,
  folhaRodoviariaMultiIntervalo,
  folhaClasseI,
}

describe('montarPacote: folhas com balança cadastrada', () => {
  it.each(Object.entries(COM_BALANCA))('%s: o plano é o mesmo da folha impressa (mesma data)', (_nome, folha) => {
    const d = folha()
    const p = montarPacote(d, EXTRAS)
    const plano = planoDaFolha(d.calibracao, d.balanca!, d.padroes, dataDaFolha(d))
    // O plano do pacote é o do papel, só com os padrões sem histórico nem arquivos
    expect(p.plano).toEqual(
      JSON.parse(
        JSON.stringify(plano, (k, v) =>
          ['certificadoArquivo', 'certificadosAnteriores', 'versoesAnteriores'].includes(k) ? undefined : v,
        ),
      ),
    )
    expect(p.folha.avisosAntesDeSair).toEqual(plano.avisos)
    expect(p.folha.dataDosPadroes).toBe(dataDaFolha(d))
    expect(p.folha.tipo).toBe('calibracao')
  })

  it.each(Object.entries(COM_BALANCA))(
    '%s: a entrada fica alinhada com o plano, com ids únicos e sem leituras',
    (_nome, folha) => {
      const p = montarPacote(folha(), EXTRAS)
      const plano = p.plano!
      const pontos = p.entrada.indicacao.pontos
      expect(pontos.map((x) => x.carga)).toEqual(plano.pontos.map((x) => x.carga))
      expect(pontos.map((x) => x.nivelSubstituicao)).toEqual(plano.pontos.map((x) => x.nivelSubstituicao))
      expect(pontos.map((x) => x.pecas)).toEqual(plano.pontos.map((x) => x.pecas))
      expect(new Set(pontos.map((x) => x.id)).size).toBe(pontos.length)
      expect(pontos.every((x) => x.id && x.crescente === null && x.decrescente === null)).toBe(true)
      expect(p.entrada.indicacao.metodo).toBe(plano.metodo)
      expect(p.entrada.indicacao.retornoZero).toBeNull()
      expect(p.entrada.repetibilidade.map((r) => [r.carga, r.leituras.length])).toEqual(
        plano.repetibilidade.map((r) => [r.carga, r.leituras]),
      )
      expect(p.entrada.repetibilidade.every((r) => r.leituras.every((l) => l === null))).toBe(true)
      expect(p.entrada.excentricidade.posicoes.map((x) => x.rotulo)).toEqual(plano.excentricidade.posicoes)
      expect(p.entrada.excentricidade.carga).toBe(plano.excentricidade.carga)
      expect(p.entrada.comoEncontrado).toBeNull()
      const s = plano.substituicao
      expect(p.entrada.indicacao.substituicao.etapas).toHaveLength(s.ativa || s.sugerida ? s.etapas : 0)
    },
  )

  it('mantém os ids do rascunho e põe ids próprios nos pontos que o plano acrescentou', () => {
    // Plataforma: os pontos do rascunho (p0, pmin, p1, p25…)
    expect(montarPacote(folhaPlataforma(), EXTRAS).entrada.indicacao.pontos.map((x) => x.id)).toEqual([
      'p0',
      'pmin',
      'p1',
      'p25',
      'p3',
      'p4',
      'p5',
      'p6',
    ])
    expect(montarPacote(folhaPlataforma(), EXTRAS).entrada.repetibilidade.map((x) => x.id)).toEqual(['rep1'])
    // Classe I sem ensaios no rascunho: as sugestões, com ids campo-…
    const classeI = montarPacote(folhaClasseI(), EXTRAS)
    expect(classeI.entrada.indicacao.pontos.map((x) => x.id)).toEqual([
      'campo-p0',
      'campo-p1',
      'campo-p2',
      'campo-p3',
      'campo-p4',
      'campo-p5',
    ])
    expect(classeI.entrada.repetibilidade.map((x) => x.id)).toEqual(['campo-r1'])
    // Rascunho sem a linha do zero: o plano a acrescenta no começo (POP 7.7), com id próprio
    const d = folhaPlataforma()
    d.calibracao!.indicacao.pontos = d.calibracao!.indicacao.pontos.filter((x) => x.carga > 0)
    const semZero = montarPacote(d, EXTRAS)
    expect(semZero.entrada.indicacao.pontos.map((x) => [x.id, x.carga])).toEqual([
      ['campo-p0', 0],
      ['pmin', 1],
      ['p1', 10],
      ['p25', 25],
      ['p3', 100],
      ['p4', 150],
      ['p5', 200],
      ['p6', 300],
    ])
  })

  it('a rodoviária sem substituição no rascunho leva as etapas que a folha sugere', () => {
    const p = montarPacote(folhaRodoviariaSemHistorico(), EXTRAS)
    expect(p.plano!.substituicao.sugerida).toBe(true)
    expect(p.entrada.indicacao.substituicao).toMatchObject({ ativa: true })
    expect(p.entrada.indicacao.substituicao.etapas).toHaveLength(p.plano!.substituicao.etapas)
    expect(comSubstituicao(p)).toBe(true)
    expect(comSubstituicao(montarPacote(folhaPlataforma(), EXTRAS))).toBe(false)
  })

  it('a folha, o cliente e a balança como o papel os imprime, sem os dados internos', () => {
    const p = montarPacote(folhaPlataforma(), { ...EXTRAS, recado: '  Levar a escada da doca 2. ', dataPrevista: '2026-10-22' })
    expect(p.formato).toBe(FORMATO_PACOTE)
    expect(p.folha).toMatchObject({
      numero: 'FC-2026-00042',
      numeroCertificado: 'CC-2026-00125',
      avisoEtiqueta: AVISO_ETIQUETA,
      formulario: { codigo: FORMULARIO_FOLHA_CAMPO.codigo, revisao: FORMULARIO_FOLHA_CAMPO.revisao },
      pop: expect.stringMatching(/^POP/),
      os: 'OS-2026-0512',
      dataPrevista: '2026-10-22',
      recado: 'Levar a escada da doca 2.',
      piloto: true,
      tecnicoPrevisto: 'Carlos Eduardo Lima',
      local: 'CLIENTE',
      anotacoesInternas: 'Procurar a Juliana na portaria 2; acesso à doca só com botina.',
      impressaEm: '2026-10-20T17:35:00.000Z',
      enviadaPor: 'Ana Paula Souza',
    })
    expect(p.folha.localEndereco).toContain('Avenida Brasil, 2450')
    expect(p.cliente).not.toHaveProperty('email')
    expect(p.cliente).not.toHaveProperty('observacoes')
    expect(p.cliente?.endereco).toContain('Rio Claro')
    expect(p.balanca?.observacoes).toBe('')
    expect(p.versoes).toEqual({ contrato: CONTRATO_CAMPO, formatoRegistro: FORMATO_REGISTRO, sistema: '1.1.0', dadosSha256: '' })
    // Nenhum padrão desce com o histórico ou os arquivos (nem no plano, nem nos congelados)
    const texto = jsonCanonico(p)
    for (const k of ['certificadoArquivo', 'certificadosAnteriores', 'versoesAnteriores']) expect(texto).not.toContain(`"${k}"`)
  })

  it('a data prevista da folha: a escolhida no envio ou a marcada para depois do dia da impressão', () => {
    expect(montarPacote(folhaPlataforma(), EXTRAS).folha.dataPrevista).toBe('2026-10-21')
    const d = folhaPlataforma()
    d.calibracao!.dataCalibracao = '2026-10-20'
    expect(montarPacote(d, EXTRAS).folha.dataPrevista).toBe('')
    // Impressa às 22:30 de Brasília (já é o dia seguinte em UTC): conta o dia de Brasília
    expect(dataDaFolha({ calibracao: null, dataPrevista: '', impressoEm: '2026-10-21T01:30:00.000Z' })).toBe('2026-10-20')
  })

  it('os dados impressos para conferir nos passos 2 e 3, com os textos da folha', () => {
    const p = montarPacote(folhaPlataforma(), EXTRAS)
    expect(p.conferir.chegada.map((x) => x.campo)).toEqual([
      'cliente.nome',
      'cliente.contato',
      'cliente.documento',
      'chegada.localEndereco',
      'chegada.os',
    ])
    expect(p.conferir.chegada.find((x) => x.campo === 'cliente.documento')?.mostrado).toBe(
      '11.444.777/0001-61 · IE 587.114.226.118',
    )
    const b = Object.fromEntries(p.conferir.balanca.map((x) => [x.campo, x.mostrado]))
    expect(b).toMatchObject({
      'balanca.max': '300 kg',
      'balanca.d': '50 g',
      'balanca.classe': 'III (média)',
      'balanca.min': '1 kg',
    })
    expect(p.conferir.balanca.filter((x) => x.metrologico).map((x) => x.campo)).toEqual([...CAMPOS_METROLOGICOS])
    // Multi-intervalo: as faixas numa linha, como no papel
    const multi = Object.fromEntries(
      montarPacote(folhaMultiIntervalo(), EXTRAS).conferir.balanca.map((x) => [x.campo, x.mostrado]),
    )
    expect(multi).toMatchObject({ 'balanca.max': '6/15/33 kg', 'balanca.d': '2/5/10 g' })
    // Vazio vira "—" (o papel imprime o traço)
    expect(montarPacote(folhaClasseI(), EXTRAS).conferir.balanca.find((x) => x.campo === 'balanca.plataforma')?.mostrado).toBe(
      '—',
    )
  })

  it('os padrões: os da folha na ordem dela, e os demais ativos para "usei outro"', () => {
    const p = montarPacote(folhaPlataforma(), EXTRAS)
    expect(p.padroes.previstos.map((x) => [x.identificacao, x.separar, x.naFolha, x.situacao])).toEqual([
      ['PP20-01 a 15', '15 × 20 kg', true, 'VALIDO'],
      ['JP-01', '10 kg + 5 kg + 1 kg', true, 'VALIDO'],
      ['TH-01', '', true, 'VALIDO'],
      ['BR-01', '', true, 'VALIDO'],
    ])
    expect(p.padroes.cadastro.map((x) => x.identificacao)).toEqual([
      'PP20-01 a 15',
      'JP-01',
      'TH-01',
      'BR-01',
      'JP-05',
      'PP500-01 a 20',
    ])
    expect(p.padroes.cadastro.every((x) => x.ativo)).toBe(true)
  })

  it('é determinístico: os mesmos dados dão o mesmo pacote e o mesmo sha256, e não mexe nos dados impressos', () => {
    const d = folhaRodoviaria()
    const antes = jsonCanonico(d)
    const a = montarPacote(d, EXTRAS)
    const b = montarPacote(folhaRodoviaria(), EXTRAS)
    expect(calcularSha256Pacote(a, sha256Hex)).toBe(calcularSha256Pacote(b, sha256Hex))
    expect(jsonCanonico(d)).toBe(antes)
    a.entrada.indicacao.pontos[0].carga = 99
    expect(d.calibracao!.indicacao.pontos[0].carga).toBe(0)
  })

  it('a folha avulsa da balança tem o tipo "balanca"', () => {
    expect(montarPacote(folhaPlataforma(), { ...EXTRAS, origem: 'balanca' }).folha.tipo).toBe('balanca')
    expect(tipoDaFolha({ balanca: null, cliente: null }, 'balanca')).toBe('branco')
  })
})

describe('montarPacote: folhas sem balança cadastrada (como no papel, sem plano)', () => {
  it('só do cliente: o cliente impresso, a balança informada no local', () => {
    const p = montarPacote(folhaDoClienteComOs(), EXTRAS)
    expect(p.folha.tipo).toBe('cliente')
    expect(p.balanca).toBeNull()
    expect(p.plano).toBeNull()
    expect(p.conferir.balanca).toEqual([])
    expect(p.conferir.chegada.map((x) => x.campo)).toEqual([
      'cliente.nome',
      'cliente.contato',
      'cliente.documento',
      'chegada.localEndereco',
      'chegada.os',
    ])
    expect(p.folha).toMatchObject({ os: 'OS-2026-0618', dataPrevista: '2026-11-12', local: '' })
    // Os padrões ativos, com a validade na data da visita
    expect(p.padroes.previstos.every((x) => x.naFolha && x.separar === '')).toBe(true)
    expect(p.entrada).toMatchObject({
      clienteId: p.cliente!.id,
      ordemServico: 'OS-2026-0618',
      dataCalibracao: '2026-11-12',
      local: 'CLIENTE',
    })
    expect(p.entrada.padroesIds).toEqual(p.padroes.previstos.map((x) => x.id))
    expect(p.entrada.indicacao.pontos).toEqual([])
  })

  it('em branco: nada impresso do cliente nem da balança', () => {
    const p = montarPacote(folhaEmBranco(), EXTRAS)
    expect(p.folha.tipo).toBe('branco')
    expect(p.cliente).toBeNull()
    expect(p.balanca).toBeNull()
    expect(p.conferir).toEqual({ chegada: [], balanca: [] })
    expect(p.folha).toMatchObject({ os: '', localEndereco: '', dataPrevista: '', numeroCertificado: 'CC-2026-00129' })
    expect(montarPacote(folhaEmBrancoSemPadroes(), EXTRAS).padroes).toEqual({
      previstos: [],
      cadastro: padroesDaEmpresa().map((x) => expect.objectContaining({ id: x.id })),
    })
  })
})

describe('resumoDoEnvio e identificação da balança', () => {
  it('a linha do olá sai do pacote guardado', () => {
    const p = montarPacote(folhaPlataforma(), EXTRAS)
    expect(resumoDoEnvio(p, 'NO_CELULAR')).toEqual({
      envioId: EXTRAS.envioId,
      numero: 'FC-2026-00042',
      tipo: 'calibracao',
      cliente: 'FRIGORÍFICO VALE DO CORUMBATAÍ LTDA',
      balanca: 'Plataforma · Toledo do Brasil 9091 · nº 9091-118832 · TAG BAL-EXP-07',
      dataPrevista: '2026-10-21',
      situacao: 'NO_CELULAR',
      piloto: true,
      enviadaEm: EXTRAS.enviadaEm,
    })
    expect(resumoDoEnvio(montarPacote(folhaEmBranco(), EXTRAS), 'ENVIADA')).toMatchObject({
      cliente: '',
      balanca: '',
      tipo: 'branco',
    })
    expect(identificacaoDaBalanca({ tipo: 'OUTRA', fabricante: ' ', modelo: '', numeroSerie: '', identificacao: '' })).toBe(
      'Outra',
    )
  })
})

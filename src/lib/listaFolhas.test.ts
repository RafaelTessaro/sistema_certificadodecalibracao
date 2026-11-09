import { describe, expect, it } from 'vitest'
import type { FolhaCampoListada } from '#shared/tipos.ts'
import {
  abaDaPagina,
  CHAVE_ABA,
  guardarAba,
  lerAbaGuardada,
  paraQuemEaFolha,
  paramsDaAba,
  preNumeroDaFolha,
  quandoFoiImpressa,
  situacaoDaFolha,
  textoOs,
} from './listaFolhas'

const folha = (x: Partial<FolhaCampoListada> = {}): FolhaCampoListada => ({
  numero: 'FC-2026-00042',
  origem: 'avulsa',
  clienteNome: 'Mercado Bom Preço',
  balancaDescricao: '',
  balancaSerie: '',
  ordemServico: '',
  numeroCertificado: 'CC-2026-00107',
  situacaoNumero: 'reservado',
  impressaEm: '2026-11-09T13:05:00.000Z',
  impressaPor: 'Lizi',
  impressoes: 1,
  situacao: 'nao_ligada',
  ...x,
})

/** Um armazenamento de mentira: guarda num Map; `quebrado` lança como o navegador em modo privado. */
const armazenamento = (quebrado = false) => {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => {
      if (quebrado) throw new Error('bloqueado')
      return m.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (quebrado) throw new Error('bloqueado')
      m.set(k, v)
    },
  }
}

describe('abas da página Certificados', () => {
  it('a do endereço vale; o "Para você autorizar" é dos certificados; sem nada, a última escolhida', () => {
    const p = (q: string) => new URLSearchParams(q)
    expect(abaDaPagina(p('aba=folhas'), null)).toBe('folhas')
    expect(abaDaPagina(p('aba=certificados'), 'folhas')).toBe('certificados')
    expect(abaDaPagina(p('situacao=autorizar'), 'folhas')).toBe('certificados')
    expect(abaDaPagina(p(''), 'folhas')).toBe('folhas')
    // Nada guardado, ou algo estranho: a dos certificados
    expect(abaDaPagina(p(''), null)).toBe('certificados')
    expect(abaDaPagina(p('aba=outra'), 'qualquer')).toBe('certificados')
  })

  it('a escolhida fica guardada neste navegador; se o navegador não deixa, nada quebra', () => {
    const a = armazenamento()
    guardarAba('folhas', a)
    expect(a.m.get(CHAVE_ABA)).toBe('folhas')
    expect(lerAbaGuardada(a)).toBe('folhas')
    const quebrado = armazenamento(true)
    expect(() => guardarAba('folhas', quebrado)).not.toThrow()
    expect(lerAbaGuardada(quebrado)).toBeNull()
    expect(lerAbaGuardada(null)).toBeNull()
  })

  it('o endereço: ?aba=folhas (sem o filtro da outra aba); a dos certificados, sem nada', () => {
    expect(paramsDaAba(new URLSearchParams('situacao=autorizar&x=1'), 'folhas').toString()).toBe('x=1&aba=folhas')
    expect(paramsDaAba(new URLSearchParams('aba=folhas&x=1'), 'certificados').toString()).toBe('x=1')
  })
})

describe('lista das folhas de campo', () => {
  it('para quem: o cliente e a OS; em branco; em branco e ligada, o cliente da calibração; cliente excluído; da pasta', () => {
    expect(paraQuemEaFolha(folha({ ordemServico: '2026/0777' }))).toEqual({
      cliente: 'Mercado Bom Preço',
      vazio: false,
      detalhe: 'OS 2026/0777',
    })
    expect(paraQuemEaFolha(folha({ clienteNome: '' }))).toEqual({ cliente: 'Em branco', vazio: true, detalhe: '' })
    expect(
      paraQuemEaFolha(
        folha({
          clienteNome: '',
          ordemServico: 'OS 55',
          calibracao: { id: 'k', status: 'RASCUNHO', numero: '', clienteNome: 'Padaria Sol' },
        }),
      ),
    ).toEqual({ cliente: 'Padaria Sol', vazio: false, detalhe: 'Impressa em branco · OS 55' })
    expect(paraQuemEaFolha(folha({ clienteNome: '', clienteExcluido: true }))).toMatchObject({
      cliente: 'Cliente excluído',
      vazio: true,
    })
    expect(paraQuemEaFolha(folha({ clienteNome: '', origem: 'recuperada' }))).toEqual({
      cliente: 'Não se sabe',
      vazio: true,
      detalhe: 'Voltou da pasta de dados',
    })
    expect(textoOs(' os 12 ')).toBe('os 12')
    expect(textoOs('')).toBe('')
  })

  it('o nº de certificado impresso, com a situação dele; folha sem nº, nada', () => {
    expect(preNumeroDaFolha(folha())).toEqual({ numero: 'CC-2026-00107', situacao: 'reservado' })
    expect(preNumeroDaFolha(folha({ situacaoNumero: 'emitido' })).situacao).toBe('emitido')
    expect(preNumeroDaFolha(folha({ situacaoNumero: 'nao_utilizado' })).situacao).toBe('não utilizado')
    expect(preNumeroDaFolha(folha({ numeroCertificado: '', situacaoNumero: undefined }))).toEqual({ numero: '', situacao: '' })
  })

  it('situação: ligada (o certificado ou o rascunho), não ligada, substituída e não vai ser usada (com o motivo)', () => {
    const emitida = situacaoDaFolha(
      folha({ situacao: 'ligada', calibracao: { id: 'k', status: 'EMITIDO', numero: 'CC-2026-00107', clienteNome: 'X' } }),
    )
    expect(emitida).toMatchObject({ rotulo: 'Ligada', tom: 'success', calibracao: 'CC-2026-00107' })
    expect(
      situacaoDaFolha(
        folha({ situacao: 'ligada', calibracao: { id: 'k', status: 'CANCELADO', numero: 'CC-2026-00107', clienteNome: 'X' } }),
      ).calibracao,
    ).toBe('CC-2026-00107 (cancelado)')
    expect(
      situacaoDaFolha(folha({ situacao: 'ligada', calibracao: { id: 'k', status: 'RASCUNHO', numero: '', clienteNome: 'X' } }))
        .calibracao,
    ).toBe('Rascunho')
    // Com a revisão por outra pessoa desligada, ninguém autoriza
    const enviada = { id: 'k', status: 'REVISAO' as const, numero: 'CC-2026-00107', clienteNome: 'X' }
    expect(situacaoDaFolha(folha({ situacao: 'ligada', calibracao: enviada })).calibracao).toBe(
      'CC-2026-00107 (aguardando autorização)',
    )
    expect(situacaoDaFolha(folha({ situacao: 'ligada', calibracao: { ...enviada, semAutorizacao: true } })).calibracao).toBe(
      'CC-2026-00107 (enviada para revisão)',
    )
    expect(situacaoDaFolha(folha())).toMatchObject({ rotulo: 'Não ligada', tom: 'warning' })
    // A primeira impressão não terminou (o serviço caiu): não saiu no papel; a da calibração, imprime-se por ela
    expect(situacaoDaFolha(folha({ impressaoInterrompida: true }))).toMatchObject({
      rotulo: 'Não ligada',
      detalhe: 'A impressão não terminou',
      titulo:
        'A primeira impressão não terminou (o sistema foi interrompido), então a folha não saiu no papel. Marque-a como “Não vai ser usada” (em Números não utilizados) e imprima uma folha nova.',
    })
    expect(
      situacaoDaFolha(
        folha({
          situacao: 'ligada',
          impressaoInterrompida: true,
          calibracao: { id: 'k', status: 'RASCUNHO', numero: '', clienteNome: 'X' },
        }),
      ),
    ).toMatchObject({
      rotulo: 'Ligada',
      calibracao: 'Rascunho',
      detalhe: 'A impressão não terminou',
      titulo: 'A primeira impressão não terminou (o sistema foi interrompido): imprima a folha pela calibração, com o mesmo nº.',
    })
    expect(situacaoDaFolha(folha({ origem: 'recuperada' })).detalhe).toBe('Voltou da pasta de dados')
    expect(situacaoDaFolha(folha({ situacao: 'substituida', substituidaPor: 'FC-2026-00043' }))).toMatchObject({
      rotulo: 'Substituída',
      detalhe: 'Trocada pela FC-2026-00043',
    })
    const perdida = situacaoDaFolha(
      folha({
        situacao: 'descartada',
        motivo: 'A folha molhou na chuva.',
        descartadaEm: '2026-11-10T13:00:00.000Z',
        descartadaPor: 'Fábio',
      }),
    )
    expect(perdida).toMatchObject({ rotulo: 'Não vai ser usada', tom: 'danger', detalhe: 'A folha molhou na chuva.' })
    expect(perdida.titulo).toBe('A folha molhou na chuva. Registrado em 10/11/2026 · Fábio.')
    expect(situacaoDaFolha(folha({ situacao: 'descartada' })).detalhe).toBe('Sem motivo registrado.')
  })

  it('quando e por quem foi impressa', () => {
    expect(quandoFoiImpressa(folha())).toBe('09/11/2026 · Lizi')
    expect(quandoFoiImpressa(folha({ impressaPor: '' }))).toBe('09/11/2026')
  })
})

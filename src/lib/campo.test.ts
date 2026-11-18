import { describe, expect, it } from 'vitest'
import { PENDENCIA_JUSTIFICATIVA_CAMPO } from '#shared/campo/importar.ts'
import { lerQrPareamento } from '#shared/campo/protocolo.ts'
import type { RegistroCampo } from '#shared/campo/tipos.ts'
import type { CelularDaFolha } from '#shared/tipos.ts'
import {
  acoesDeRecolher,
  avisoDoEnvio,
  celularDe,
  contagemDoRegistro,
  contagemRegressiva,
  desde,
  informadoEm,
  mudouMedicao,
  novosRegistros,
  PENDENCIA_JUSTIFICATIVA,
  podeEnviarDeNovo,
  quando,
  rotuloDoCampo,
  rotuloDoDesfecho,
  seloDoCelular,
  selosDasMarcas,
  textoContagem,
  textoIguais,
  textoPareamento,
  textoVisto,
  textoVoltou,
} from './campo'
import { enderecoDoApk, qrComEndereco } from './pareamento'

// 18/11/2026 às 10:00 em Brasília (13:00 UTC)
const AGORA = new Date('2026-11-18T13:00:00.000Z')

const celular = (c: Partial<CelularDaFolha> = {}): CelularDaFolha => ({
  envioId: 'e1',
  situacao: 'ENVIADA',
  tecnico: 'Carlos Eduardo Lima',
  tecnicoId: 'u1',
  em: '2026-11-18T11:12:00.000Z',
  estadoCelular: '',
  estadoCelularEm: '',
  dataPrevista: '2026-11-18',
  piloto: true,
  marcas: [],
  ...c,
})

describe('horários (Brasília)', () => {
  it('hoje, ontem e outro dia; inválido vira vazio', () => {
    expect(quando('2026-11-18T10:55:00.000Z', AGORA)).toBe('hoje às 07:55')
    expect(quando('2026-11-17T21:02:00.000Z', AGORA)).toBe('ontem às 18:02')
    expect(quando('2026-11-12T10:55:00.000Z', AGORA)).toBe('em 12/11 às 07:55')
    // 22h30 do dia 17 em Brasília já é dia 18 em UTC: continua "ontem"
    expect(quando('2026-11-18T01:30:00.000Z', AGORA)).toBe('ontem às 22:30')
    expect(quando('', AGORA)).toBe('')
    expect(desde('2026-11-18T11:12:00.000Z', AGORA)).toBe('desde 08:12')
    expect(desde('2026-11-16T11:12:00.000Z', AGORA)).toBe('desde 16/11 às 08:12')
    expect(informadoEm('2026-11-17T15:00:00.000Z', AGORA)).toBe('informado ontem')
  })

  it('"visto hoje às 07:55 · 192.168.0.23" na lista dos celulares', () => {
    expect(textoVisto('2026-11-18T10:55:00.000Z', '192.168.0.23', AGORA)).toBe('visto hoje às 07:55 · 192.168.0.23')
    expect(textoVisto('', '', AGORA)).toBe('ainda não apareceu na rede')
  })
})

describe('selos da folha no celular', () => {
  it('enviada, no celular (com o que o celular informou), recolher pedido, voltou e recolhida', () => {
    expect(seloDoCelular(celular(), AGORA)).toMatchObject({ rotulo: 'Enviada · aguardando o celular', tom: 'info' })
    expect(
      seloDoCelular(
        celular({ situacao: 'NO_CELULAR', estadoCelular: 'EM_PREENCHIMENTO', estadoCelularEm: '2026-11-18T12:00:00.000Z' }),
        AGORA,
      ),
    ).toMatchObject({
      rotulo: 'No celular de Carlos',
      detalhe: 'desde 08:12 · Em preenchimento · informado hoje',
      dica: 'A folha está no celular de Carlos Eduardo Lima (Em preenchimento · informado hoje).',
    })
    // Sem o nome do técnico, nada de "celular de técnico"
    expect(seloDoCelular(celular({ situacao: 'NO_CELULAR', tecnico: '' }), AGORA)).toMatchObject({
      rotulo: 'No celular do técnico',
      dica: 'A folha está no celular do técnico.',
    })
    expect(seloDoCelular(celular({ situacao: 'NO_CELULAR', tecnico: '', recolherPedido: true }), AGORA).detalhe).toBe(
      'Aguardando o celular do técnico confirmar',
    )
    expect(seloDoCelular(celular({ situacao: 'NO_CELULAR', recolherPedido: true }), AGORA).rotulo).toBe('Recolher pedido')
    expect(seloDoCelular(celular({ situacao: 'NO_CELULAR', recolherPedido: true, jaComecei: true }), AGORA).rotulo).toBe(
      'Já começada · vai voltar',
    )
    expect(seloDoCelular(celular({ situacao: 'DEVOLVIDA', voltou: true }), AGORA)).toMatchObject({
      rotulo: 'Voltou do campo',
      tom: 'success',
    })
    expect(seloDoCelular(celular({ situacao: 'DEVOLVIDA' }), AGORA).rotulo).toBe('Registro de campo')
    expect(seloDoCelular(celular({ situacao: 'RECOLHIDA' }), AGORA).rotulo).toBe('Recolhida')
  })

  it('"celular de Ana" (sem artigo antes do nome) e "celular do técnico" sem nome', () => {
    expect(celularDe('Ana')).toBe('celular de Ana')
    expect(celularDe('')).toBe('celular do técnico')
  })

  it('as marcas e o desfecho viram selos curtos', () => {
    expect(selosDasMarcas(['PILOTO', 'RELOGIO'], 'INCOMPLETA').map((s) => s.rotulo)).toEqual([
      'Piloto',
      'Relógio diferente',
      'Incompleta',
    ])
    expect(
      selosDasMarcas(['ORFAO', 'APARELHO_REVOGADO', 'APOS_RECOLHER', 'FORMATO'], 'NAO_CALIBRADA').map((s) => s.rotulo),
    ).toEqual(['Órfã', 'Aparelho revogado', 'Depois de recolhida', 'Formato com problema', 'Não calibrada'])
  })

  it('"Recolher do celular" sem pedido em aberto; "Recolher à força" só para o administrador, também com o pedido', () => {
    expect(acoesDeRecolher(celular(), false)).toEqual({ recolher: true, forcar: false })
    expect(acoesDeRecolher(celular({ situacao: 'NO_CELULAR' }), true)).toEqual({ recolher: true, forcar: true })
    // O celular perdido ou descadastrado nunca responde ao pedido: só o administrador libera a folha
    expect(acoesDeRecolher(celular({ situacao: 'NO_CELULAR', recolherPedido: true }), false)).toEqual({
      recolher: false,
      forcar: false,
    })
    expect(acoesDeRecolher(celular({ situacao: 'NO_CELULAR', recolherPedido: true }), true)).toEqual({
      recolher: false,
      forcar: true,
    })
    for (const situacao of ['DEVOLVIDA', 'RECOLHIDA'] as const)
      expect(acoesDeRecolher(celular({ situacao }), true)).toEqual({ recolher: false, forcar: false })
  })

  it('"Enviar de novo" só para a folha recolhida que não voltou com dados (a mesma folha, o mesmo nº)', () => {
    expect(podeEnviarDeNovo(celular({ situacao: 'RECOLHIDA' }))).toBe(true)
    // Recolhida, mas voltou preenchida mesmo assim: para medir de novo, uma folha nova
    expect(podeEnviarDeNovo(celular({ situacao: 'RECOLHIDA', registroId: 'r1' }))).toBe(false)
    for (const situacao of ['ENVIADA', 'NO_CELULAR', 'DEVOLVIDA'] as const)
      expect(podeEnviarDeNovo(celular({ situacao }))).toBe(false)
  })

  it('o desfecho fora da lista (registro com a marca FORMATO, app de outra versão) aparece como veio, sem quebrar', () => {
    expect(rotuloDoDesfecho('NAO_CALIBRADA')).toBe('Não calibrada')
    expect(rotuloDoDesfecho('PARCIAL')).toBe('PARCIAL')
    expect(rotuloDoDesfecho(undefined)).toBe('')
    expect(rotuloDoDesfecho(3)).toBe('3')
    expect(rotuloDoDesfecho('constructor')).toBe('constructor')
  })

  it('o aviso do envio muda com o registro original', () => {
    expect(avisoDoEnvio('PAPEL')).toBe('Piloto: a folha de papel continua sendo o registro original.')
    expect(avisoDoEnvio('CELULAR')).toBe('Enquanto estiver no celular, as leituras ficam só para leitura aqui.')
  })
})

describe('pareamento', () => {
  it('contagem regressiva, frases da situação e o QR com outro endereço', () => {
    const agora = Date.parse('2026-11-18T13:00:00.000Z')
    expect(contagemRegressiva('2026-11-18T13:09:58.000Z', agora)).toBe('9:58')
    expect(contagemRegressiva('2026-11-18T12:59:00.000Z', agora)).toBe('0:00')
    expect(textoPareamento({ situacao: 'AGUARDANDO' })).toBe('Aguardando o celular…')
    expect(
      textoPareamento({
        situacao: 'PAREADO',
        celular: { modelo: 'Samsung A54', tecnicoNome: 'Carlos' } as never,
      }),
    ).toBe('Pareado: Samsung A54 · Carlos')
    expect(lerQrPareamento(qrComEndereco('http://192.168.0.11:4850', '123456'))).toEqual({
      servidor: 'http://192.168.0.11:4850',
      codigo: '123456',
    })
    expect(enderecoDoApk('http://192.168.0.11:4850/')).toBe('http://192.168.0.11:4850/api/campo/apk')
  })
})

describe('resumo do registro', () => {
  it('conta leituras, horários e anotações (sem as tentativas descartadas; tolera campos faltando)', () => {
    const l = (valor: string) => ({ valor, em: '2026-11-18T08:00:00-03:00', via: 'teclado' as const })
    const r = {
      passos: {
        chegada: { inicio: '2026-11-18T08:00:00-03:00' },
        final: { termino: '2026-11-18T10:00:00-03:00' },
        ambiente: {
          linhas: [
            { em: '2026-11-18T08:05:00-03:00', temperatura: l('22,1'), umidade: l('55'), pressao: l('927') },
            { em: '', temperatura: null, umidade: null, pressao: null },
          ],
          deltaT: [],
        },
        indicacao: { pontos: [{ crescente: l('0,00'), decrescente: l('0,00') }], retornoZero: l('0,00') },
        repetibilidade: [{ leituras: [l('15,00'), l('15,00'), { valor: '', em: '', via: 'teclado' }] }],
        excentricidade: { posicoes: [{ zeroAntes: null, leitura: l('10,00') }] },
      },
      tentativas: [{ indicacao: { pontos: [{ crescente: l('9,99') }] } }],
      anotacoes: [{ id: 'a' }, { id: 'b' }],
    } as unknown as RegistroCampo
    const c = contagemDoRegistro(r)
    expect(c).toEqual({ leituras: 9, horarios: 3, anotacoes: 2 })
    expect(textoContagem(c)).toBe('9 leituras, 3 horários, 2 anotações')
    expect(textoContagem({ leituras: 1, horarios: 1, anotacoes: 1 })).toBe('1 leitura, 1 horário, 1 anotação')
    expect(contagemDoRegistro({} as RegistroCampo)).toEqual({ leituras: 0, horarios: 0, anotacoes: 0 })
    expect(textoIguais(38)).toBe('38 iguais')
  })
})

describe('nomes dos campos do registro', () => {
  it('explica o caminho de um campo pelo que o registro tem', () => {
    const l = (valor: string) => ({ valor, em: '', via: 'teclado' as const })
    const r = {
      passos: {
        chegada: { conferencias: [{ campo: 'cliente.nome', rotulo: 'Cliente', mostrado: 'X', confere: true }] },
        balanca: { conferencias: [{ campo: 'balanca.d', rotulo: 'Divisão (d)', mostrado: '10 g', confere: false }] },
        ambiente: { linhas: [{ momento: 'INICIO' }, { momento: 'FIM' }] },
        indicacao: { pontos: [{ id: 'p3', cargaPrevista: '100,00', cargaAplicada: null }] },
        repetibilidade: [{ id: 'r1', cargaPrevista: '50,00', cargaAplicada: l('50,02') }],
        excentricidade: { posicoes: [{ rotulo: 'Centro' }] },
      },
    } as unknown as RegistroCampo
    expect(rotuloDoCampo(r, 'balanca.d')).toBe('Divisão (d)')
    expect(rotuloDoCampo(r, 'ambiente.linhas.1.pressao')).toBe('Ambiente · fim · pressão')
    expect(rotuloDoCampo(r, 'indicacao.pontos.p3.crescente')).toBe('Erro de indicação · 100,00 · subida')
    expect(rotuloDoCampo(r, 'indicacao.retornoZero')).toBe('Erro de indicação · retorno ao zero')
    expect(rotuloDoCampo(r, 'indicacao.substituicao.etapas.1.padroes')).toBe('Substituição · etapa 2 · com os pesos')
    expect(rotuloDoCampo(r, 'repetibilidade.r1.leituras.4')).toBe('Repetibilidade · 50,02 · leitura 5')
    expect(rotuloDoCampo(r, 'excentricidade.posicoes.0.leitura')).toBe('Excentricidade · posição Centro')
    expect(rotuloDoCampo(r, 'final.dataCalibracao')).toBe('Data da calibração')
    expect(rotuloDoCampo(null, 'outro.caminho')).toBe('outro.caminho')
  })
})

describe('trava do celular na tela', () => {
  it('só a mudança num passo de medição conta', () => {
    const base = {
      padroesIds: ['a'],
      ambiente: { pressao: 927 },
      indicacao: { pontos: [] },
      repetibilidade: [],
      excentricidade: { posicoes: [] },
      observacoes: '',
    }
    expect(mudouMedicao(base, { ...base, observacoes: 'livre' })).toBe(false)
    expect(mudouMedicao(base, { ...base, ambiente: { pressao: 927 } })).toBe(false)
    expect(mudouMedicao(base, { ...base, ambiente: { pressao: 928 } })).toBe(true)
    expect(mudouMedicao(base, { ...base, padroesIds: ['a', 'b'] })).toBe(true)
  })
})

describe('aviso "voltou do campo"', () => {
  it('na primeira consulta ninguém avisa; depois, só os registros novos que valem', () => {
    const r = (id: string, situacao = 'VALIDO') => ({ id, situacao })
    const a = novosRegistros(null, [r('1'), r('2')])
    expect(a.novos).toEqual([])
    const b = novosRegistros(a.todos, [r('3'), r('4', 'DESCARTADO'), r('1'), r('2')])
    expect(b.novos.map((x) => x.id)).toEqual(['3'])
    expect([...b.todos].sort()).toEqual(['1', '2', '3', '4'])
    expect(textoVoltou({ numero: 'FC-2026-00042', ligadoA: '', tecnico: 'Carlos Eduardo Lima', marcas: [] }).titulo).toBe(
      'FC-2026-00042 voltou do campo (Carlos)',
    )
  })
})

describe('pendência da justificativa', () => {
  it('o texto repetido na tela é o mesmo de shared/campo/importar.ts', () => {
    expect(PENDENCIA_JUSTIFICATIVA).toBe(PENDENCIA_JUSTIFICATIVA_CAMPO)
  })
})

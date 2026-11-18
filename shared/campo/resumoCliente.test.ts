import { describe, expect, it } from 'vitest'
import { jsonCanonico } from './canonico.ts'
import {
  APARELHO_EXEMPLO,
  pacoteEmBranco,
  registroClasseI,
  registroDoCliente,
  registroPlataforma,
  registroRodoviaria,
  TECNICO_EXEMPLO,
} from './exemplos.ts'
import { registroInicial } from './registro.ts'
import { FRASE_ASSINATURA_CLIENTE, ITENS_RESUMO_CLIENTE, resumoDoCliente, ROTULOS_RESUMO_CLIENTE } from './resumoCliente.ts'
import type { LeituraCampo, RegistroCampo } from './tipos.ts'

/** Todas as leituras de medição do registro (indicação, substituição, repetibilidade, excentricidade e cargas digitadas). */
function leiturasDeMedicao(r: RegistroCampo): LeituraCampo[] {
  const { indicacao, repetibilidade, excentricidade } = r.passos
  return [
    ...indicacao.pontos.flatMap((p) => [p.crescente, p.decrescente, p.cargaAplicada]),
    indicacao.retornoZero,
    ...(indicacao.substituicao?.etapas.flatMap((e) => [e.padroes, e.substituicao]) ?? []),
    ...repetibilidade.flatMap((x) => [...x.leituras, x.cargaAplicada]),
    ...excentricidade.posicoes.flatMap((x) => [x.zeroAntes, x.leitura]),
    excentricidade.cargaAplicada,
  ].filter((x): x is LeituraCampo => !!x)
}

describe('resumoDoCliente', () => {
  it('é a lista fechada: só os itens previstos, nesta ordem, cada um com o seu rótulo', () => {
    const resumo = resumoDoCliente(registroPlataforma())
    expect(Object.keys(resumo)).toEqual([...ITENS_RESUMO_CLIENTE])
    expect(Object.keys(ROTULOS_RESUMO_CLIENTE)).toEqual([...ITENS_RESUMO_CLIENTE])
    expect(FRASE_ASSINATURA_CLIENTE).toBe('Acompanhei o serviço; ciente das condições, não dos resultados.')
  })

  it('nunca mostra leituras nem resultados', () => {
    for (const r of [registroPlataforma(), registroRodoviaria(), registroClasseI(), registroDoCliente()]) {
      const texto = jsonCanonico(resumoDoCliente(r))
      // Nenhuma leitura de medição com casas (as que não se confundem com a hora e a data) aparece no resumo
      for (const l of leiturasDeMedicao(r))
        if (l.valor.includes(',') && l.valor.length > 3) expect(texto, l.valor).not.toContain(`"${l.valor}`)
      for (const proibido of [
        'pontos',
        'repetibilidade',
        'excentricidade',
        'crescente',
        'avisos',
        'trilha',
        'conteudoSha256',
        'png',
      ])
        expect(texto).not.toContain(proibido)
    }
  })

  it('plataforma: cliente, balança, local, período, ambiente, técnico e as observações (não as internas)', () => {
    const resumo = resumoDoCliente(registroPlataforma())
    expect(resumo.cliente).toBe('FRIGORÍFICO VALE DO CORUMBATAÍ LTDA')
    // O local de instalação foi marcado "Algo diferente…": o impresso (errado) não aparece
    expect(resumo.balanca).toBe('Plataforma · Toledo do Brasil 9091 · nº 9091-118832 · TAG BAL-EXP-07')
    expect(resumo.local).toBe('No cliente: Avenida Brasil, 2450 – Jardim Paulista – Rio Claro/SP (expedição)')
    expect(resumo.periodo).toMatchObject({
      inicio: '2026-10-21T08:30:00-03:00',
      texto: expect.stringMatching(/^21\/10\/2026, das 08:30 às \d\d:\d\d$/),
    })
    expect(resumo.ambiente.inicio).toMatchObject({ temperatura: '24,6 °C', umidade: '58 %', pressao: '948,7 hPa' })
    expect(resumo.ambiente.fim).toMatchObject({ temperatura: '25,1 °C', umidade: '56 %', pressao: '948,3 hPa' })
    expect(resumo.tecnico).toBe(TECNICO_EXEMPLO.nome)
    expect(resumo.observacoes.map((x) => x.texto)).toEqual(['Piso da doca molhado; plataforma limpa e seca antes dos ensaios.'])
    // O dado impresso diferente (anotação) e o recado do escritório ficam de fora
    const texto = jsonCanonico(resumo)
    expect(texto).not.toContain('doca 3')
    expect(texto).not.toContain('escada')
    expect(texto).not.toContain('Juliana na portaria')
  })

  it('classe I: o ambiente do início é o da última linha do início (depois da aclimatação)', () => {
    const resumo = resumoDoCliente(registroClasseI())
    expect(resumo.ambiente.inicio?.temperatura).toBe('21,5 °C')
    expect(resumo.ambiente.fim?.temperatura).toBe('21,7 °C')
  })

  it('anomalias ficam de fora; só do cliente: a balança informada e o laboratório', () => {
    const r = registroDoCliente()
    r.anotacoes.push(
      { id: 'a1', passo: 5, tipo: 'ANOMALIA', campo: '', texto: 'Célula de carga 2 com folga.', em: '2026-11-12T13:50:00-03:00' },
      {
        id: 'a2',
        passo: 2,
        tipo: 'OBSERVACAO',
        campo: '',
        texto: 'Balança trazida pelo cliente.',
        em: '2026-11-12T13:26:00-03:00',
      },
    )
    const resumo = resumoDoCliente(r)
    expect(resumo.observacoes.map((x) => x.texto)).toEqual(['Balança trazida pelo cliente.'])
    expect(resumo.local).toBe('No laboratório da empresa')
    expect(resumo.balanca).toContain('Filizola ID-M 150 · nº FZ-55120 · TAG BAL-EXP-09')
    expect(resumo.balanca).toContain('classe III (média)')
  })

  it('folha em branco: o cliente informado; sem dados, os itens ficam vazios', () => {
    const r = registroInicial(pacoteEmBranco(), TECNICO_EXEMPLO, APARELHO_EXEMPLO, { agora: '2026-10-21T09:00:00-03:00' })
    r.passos.chegada.clienteInformado!.razaoSocial = 'Padaria Pão Quente Ltda'
    r.passos.chegada.local = 'CLIENTE'
    r.passos.chegada.localEndereco = 'Rua 3, 450 – Centro – Rio Claro/SP'
    const resumo = resumoDoCliente(r)
    expect(resumo).toMatchObject({
      cliente: 'Padaria Pão Quente Ltda',
      balanca: '',
      local: 'No cliente: Rua 3, 450 – Centro – Rio Claro/SP',
      ambiente: { inicio: null, fim: null },
      observacoes: [],
    })
    expect(resumo.periodo.texto).toBe('21/10/2026, a partir das 09:00')
  })
})

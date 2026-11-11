import { describe, expect, it } from 'vitest'
import { descricaoBalanca } from '#shared/dominio.ts'
import { dataDaFolha, textoReimprimir } from './folhaCampo'
import {
  balancaNaLista,
  dataCurta,
  dataExtensa,
  dataHora,
  diaBrasilia,
  hojeBrasilia,
  mascaraDocumento,
  mascaraTelefone,
  normalizar,
  relativoDias,
  tituloDoDia,
} from './format'
import { quandoDaLinha, quandoDoNumero } from './numeros'
import { diaDoLembrete } from './vencimentos'

describe('formatação', () => {
  it('a balança nas listas: sem "Balança" na frente, com o tipo em maiúscula', () => {
    const b = { tipo: 'PLATAFORMA' as const, fabricante: 'Toledo', modelo: '9094', unidade: 'kg' as const }
    const descricao = descricaoBalanca({ ...b, faixas: [{ max: 30, d: 0.01, e: 0.01 }] })
    expect(descricao).toBe('Balança plataforma Toledo 9094 — 30 kg × 10 g')
    expect(balancaNaLista(descricao)).toBe('Plataforma Toledo 9094 — 30 kg × 10 g')
    expect(balancaNaLista('Balança de balcão / bancada Filizola')).toBe('De balcão / bancada Filizola')
    expect(balancaNaLista('')).toBe('')
  })

  it('aplica máscaras de CPF, CNPJ e telefone', () => {
    expect(mascaraDocumento('12345678909', 'PF')).toBe('123.456.789-09')
    expect(mascaraDocumento('12403843000118', 'PJ')).toBe('12.403.843/0001-18')
    expect(mascaraTelefone('1930239050')).toBe('(19) 3023-9050')
    expect(mascaraTelefone('19987654321')).toBe('(19) 98765-4321')
  })

  it('busca sem acentos e sem diferenciar maiúsculas', () => {
    expect(normalizar('  Paróquia SÃO José ')).toBe('paroquia sao jose')
  })

  it('formata datas e prazos', () => {
    expect(dataCurta('2026-08-01')).toBe('01/08/2026')
    expect(dataCurta('')).toBe('—')
    expect(relativoDias(3)).toMatch(/3 dias/)
    expect(relativoDias(-1)).toBe('ontem')
    expect(relativoDias(-4)).toBe('há 4 dias')
  })
})

// A empresa fica em Rio Claro/SP: o instante gravado (ISO, em UTC) aparece com a data e a hora de Brasília, qualquer que
// seja o fuso do computador. Das 21h às 23h59 de Brasília já é o dia seguinte em UTC
describe('datas e horas no horário de Brasília', () => {
  const as21h = '2026-11-11T00:00:00.000Z'
  const as22h30 = '2026-11-11T01:30:00.000Z'
  const as23h59 = '2026-11-11T02:59:00.000Z'
  const meiaNoite = '2026-11-11T03:00:00.000Z'

  it('o dia de um instante é o de Brasília (não o do UTC); a data sem hora fica como está', () => {
    for (const iso of [as21h, as22h30, as23h59]) {
      expect(diaBrasilia(iso), iso).toBe('2026-11-10')
      expect(dataCurta(iso), iso).toBe('10/11/2026')
    }
    expect(diaBrasilia(meiaNoite)).toBe('2026-11-11')
    expect(dataCurta(meiaNoite)).toBe('11/11/2026')
    // Virada do ano
    expect(dataCurta('2027-01-01T02:00:00.000Z')).toBe('31/12/2026')
    // A data sem hora (data da calibração, emissão, validade) não muda de dia
    expect(dataCurta('2026-11-10')).toBe('10/11/2026')
    expect(dataCurta('2026-01-01')).toBe('01/01/2026')
    expect(diaBrasilia(new Date(as22h30))).toBe('2026-11-10')
    expect(diaBrasilia('')).toBe('')
    expect(diaBrasilia('ontem')).toBe('')
    expect(dataCurta('ontem')).toBe('—')
    expect(dataExtensa(as22h30)).toBe('Terça-feira, 10 de novembro')
  })

  it('data e hora de Brasília', () => {
    expect(dataHora(as21h)).toBe('10/11/2026 às 21:00')
    expect(dataHora(as22h30)).toBe('10/11/2026 às 22:30')
    expect(dataHora(as23h59)).toBe('10/11/2026 às 23:59')
    expect(dataHora(meiaNoite)).toBe('11/11/2026 às 00:00')
    expect(dataHora('2026-10-20T16:05:00.000Z')).toBe('20/10/2026 às 13:05')
    expect(dataHora('')).toBe('—')
    expect(dataHora('x')).toBe('—')
  })

  it('hoje e o título do dia no registro de atividades', () => {
    expect(hojeBrasilia(new Date(as22h30))).toBe('2026-11-10')
    expect(hojeBrasilia(new Date(meiaNoite))).toBe('2026-11-11')
    expect(tituloDoDia(as22h30, new Date(as23h59))).toBe('Hoje')
    expect(tituloDoDia(as22h30, new Date(meiaNoite))).toBe('Ontem')
    expect(tituloDoDia(as21h, new Date('2026-11-12T01:00:00.000Z'))).toBe('Ontem')
    expect(tituloDoDia(as22h30, new Date('2026-11-13T12:00:00.000Z'))).toBe('Terça-feira, 10 de novembro de 2026')
    // 1º de janeiro: ontem é 31 de dezembro
    expect(tituloDoDia('2027-01-01T02:00:00.000Z', new Date('2027-01-01T15:00:00.000Z'))).toBe('Ontem')
  })

  it('"Atualizado em", "anexado em", a folha impressa, o lembrete e o nº reservado: o dia de Brasília', () => {
    const k = { status: 'RASCUNHO' as const, atualizadoEm: as22h30, dataEmissao: '', editadoEm: '' }
    expect(quandoDaLinha(k)).toBe('Atualizado em 10/11/2026')
    expect(dataDaFolha(as23h59)).toBe('10/11/2026')
    expect(textoReimprimir({ numero: 'FC-2026-00042', impressaEm: as21h })).toBe(
      'Reimprimir a folha FC-2026-00042 (igual à impressa em 10/11/2026)',
    )
    expect(diaDoLembrete(as22h30)).toBe('10/11/2026')
    expect(
      quandoDoNumero({ situacao: 'reservado', reservadoEm: as22h30, reservadoPor: 'Ana' } as Parameters<
        typeof quandoDoNumero
      >[0]),
    ).toBe('10/11/2026 às 22:30 · Ana')
  })
})

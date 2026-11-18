import { describe, expect, it } from 'vitest'
import { calcularSha256Pacote, sha256Hex } from '../../../shared/campo/canonico.ts'
import { pacotePlataforma } from '../../../shared/campo/exemplos.ts'
import { resumoDoEnvio } from '../../../shared/campo/pacote.ts'
import { folhaRecebida, recebimentoConfirmado } from './folha.ts'
import type { FolhaLocal } from './folha.ts'
import { agruparFolhas, diaCurto, expiradas, naoEntregues, paraEntregar, secaoDaFolha } from './lista.ts'

const AGORA = '2026-11-18T08:00:00-03:00'
const HOJE = '2026-11-18'

function folha(
  id: string,
  data: string,
  cliente: string,
  estado: FolhaLocal['estado'] = 'NOVA',
  extra: Partial<FolhaLocal> = {},
): FolhaLocal {
  const p = pacotePlataforma()
  const f = recebimentoConfirmado(folhaRecebida(resumoDoEnvio(p, 'ENVIADA'), p, calcularSha256Pacote(p, sha256Hex), AGORA), AGORA)
  return {
    ...f,
    envioId: id,
    numero: `FC-2026-${id.padStart(5, '0')}`,
    estado,
    pacote: { ...p, folha: { ...p.folha, dataPrevista: data } },
    resumo: { ...f.resumo, cliente, dataPrevista: data },
    ...extra,
  }
}

describe('Minhas folhas', () => {
  it('seções pela data prevista, na ordem: atrasadas, hoje, amanhã, depois, sem data, finalizadas, entregues', () => {
    expect(secaoDaFolha(folha('1', '2026-11-17', 'A'), HOJE)).toBe('ATRASADAS')
    expect(secaoDaFolha(folha('2', HOJE, 'A'), HOJE)).toBe('HOJE')
    expect(secaoDaFolha(folha('3', '2026-11-19', 'A'), HOJE)).toBe('AMANHA')
    expect(secaoDaFolha(folha('4', '2026-11-25', 'A'), HOJE)).toBe('DEPOIS')
    expect(secaoDaFolha(folha('5', '', 'A'), HOJE)).toBe('SEM_DATA')
    expect(secaoDaFolha(folha('6', '2026-11-17', 'A', 'FINALIZADA'), HOJE)).toBe('FINALIZADAS')
    expect(secaoDaFolha(folha('7', HOJE, 'A', 'ENTREGUE'), HOJE)).toBe('ENTREGUES')
    expect(secaoDaFolha(folha('8', HOJE, 'A', 'RETIRADA'), HOJE)).toBeNull()
    const secoes = agruparFolhas(
      [
        folha('4', '2026-11-25', 'B'),
        folha('2', HOJE, 'Usina'),
        folha('9', HOJE, 'Padaria'),
        folha('10', HOJE, 'Usina'),
        folha('1', '2026-11-10', 'C'),
      ],
      HOJE,
    )
    expect(secoes.map((s) => s.secao)).toEqual(['ATRASADAS', 'HOJE', 'DEPOIS'])
    expect(secoes[1].titulo).toBe('Hoje · qua 18/11')
    expect(secoes[1].grupos.map((g) => [g.cliente, g.folhas.length])).toEqual([
      ['Usina', 2],
      ['Padaria', 1],
    ])
    expect(diaCurto('2026-11-19')).toBe('qui 19/11')
  })

  it('contador das folhas para entregar e as não entregues', () => {
    const lista = [
      folha('1', HOJE, 'A', 'FINALIZADA'),
      folha('2', HOJE, 'A', 'EM_PREENCHIMENTO'),
      folha('3', HOJE, 'A', 'NOVA'),
      folha('4', HOJE, 'A', 'ENTREGUE'),
    ]
    expect(paraEntregar(lista).map((f) => f.envioId)).toEqual(['1'])
    expect(naoEntregues(lista).map((f) => f.envioId)).toEqual(['1', '2'])
  })

  it('o resumo das entregues e o aviso das retiradas ficam 7 dias', () => {
    const lista = [
      folha('1', HOJE, 'A', 'ENTREGUE', { entregueEm: '2026-11-10T08:00:00-03:00' }),
      folha('2', HOJE, 'A', 'ENTREGUE', { entregueEm: '2026-11-12T08:00:00-03:00' }),
      folha('3', HOJE, 'A', 'RETIRADA', { retiradaEm: '2026-11-01T08:00:00-03:00' }),
      folha('4', HOJE, 'A', 'FINALIZADA'),
    ]
    expect(expiradas(lista, AGORA)).toEqual(['1', '3'])
  })
})

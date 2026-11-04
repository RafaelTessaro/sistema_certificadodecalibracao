// Vencimentos: o "Último lembrete ao cliente" do grupo e "Clientes avisados no mês" são por cliente; a coluna
// Lembrete e a planilha, por balança (só a balança que foi no lembrete aparece avisada).

import { describe, expect, it } from 'vitest'
import { hojeLocalIso } from '#shared/dominio.ts'
import type { Vencimento } from '#shared/tipos.ts'
import { agruparPorCliente, clientesAvisadosNoMes, COLUNAS_CSV_VENCIMENTOS, linhaCsvVencimento } from './vencimentos'

const ENVIO = '2026-11-04T13:00:00.000Z'
const DIA_ENVIO = hojeLocalIso(new Date(ENVIO)).split('-').reverse().join('/')

const venc = (extra: Partial<Vencimento>): Vencimento => ({
  balancaId: 'b1',
  balancaDescricao: 'Balança Toledo 9094 30 kg',
  numeroSerie: 'TL-2231',
  identificacao: '',
  clienteId: 'c1',
  clienteNome: 'Supermercado Ideal',
  clienteEmail: 'qualidade@ideal.com.br',
  ultimaCalibracao: '2025-11-20',
  ultimoCertificado: 'CC-2025-00010',
  ultimoCertificadoId: 'k1',
  proximaCalibracao: '2026-11-20',
  dias: 16,
  lembreteEm: '',
  ultimoLembreteCliente: '',
  ...extra,
})

// O lembrete foi só com a TL-2231; a FZ-88 e a FZ-50, do mesmo cliente, não foram
const tl = venc({ lembreteEm: ENVIO, ultimoLembreteCliente: ENVIO })
const fz88 = venc({
  balancaId: 'b2',
  numeroSerie: 'FZ-88',
  dias: 40,
  proximaCalibracao: '2026-12-14',
  ultimoLembreteCliente: ENVIO,
})
const fz50 = venc({
  balancaId: 'b3',
  numeroSerie: 'FZ-50',
  dias: 117,
  proximaCalibracao: '2027-03-01',
  ultimoLembreteCliente: ENVIO,
})
const outro = venc({ balancaId: 'b4', clienteId: 'c2', clienteNome: 'Açougue Avenida', dias: -3 })

describe('vencimentos', () => {
  it('o grupo mostra o último lembrete ao cliente, mesmo que a balança da lista não tenha ido nele', () => {
    // Aba "60 dias" sem a TL-2231 (busca pela FZ): o cliente foi avisado, a FZ-88 não
    const [g] = agruparPorCliente([fz88], 30)
    expect(g).toMatchObject({ clienteId: 'c1', ultimoLembrete: ENVIO, vencendo: 0 })
    expect(g.itens[0].lembreteEm).toBe('')
  })

  it('agrupa por cliente, o mais atrasado primeiro, com as contagens', () => {
    const grupos = agruparPorCliente([fz50, tl, outro, fz88], 30)
    expect(grupos.map((g) => g.clienteNome)).toEqual(['Açougue Avenida', 'Supermercado Ideal'])
    expect(grupos[0]).toMatchObject({ vencidas: 1, vencendo: 0, ultimoLembrete: '' })
    expect(grupos[1]).toMatchObject({ vencidas: 0, vencendo: 1, ultimoLembrete: ENVIO })
    expect(grupos[1].itens.map((v) => v.numeroSerie)).toEqual(['TL-2231', 'FZ-88', 'FZ-50'])
  })

  it('clientes avisados no mês: por cliente, com qualquer balança', () => {
    const mes = hojeLocalIso(new Date(ENVIO)).slice(0, 7)
    expect(clientesAvisadosNoMes([fz88, fz50, outro], mes)).toBe(1)
    expect(clientesAvisadosNoMes([fz88, fz50, outro], '2026-10')).toBe(0)
  })

  it('servidor de antes (sem o lembrete ao cliente): vale o da balança', () => {
    const { ultimoLembreteCliente: _u, ...antigo } = tl
    expect(agruparPorCliente([antigo], 30)[0].ultimoLembrete).toBe(ENVIO)
  })

  it('planilha: "Último lembrete" só na balança que foi no lembrete, no dia daqui', () => {
    const coluna = COLUNAS_CSV_VENCIMENTOS.indexOf('Último lembrete')
    expect(linhaCsvVencimento(tl)[coluna]).toBe(DIA_ENVIO)
    expect(linhaCsvVencimento(fz88)[coluna]).toBe('')
    expect(linhaCsvVencimento(fz50)[coluna]).toBe('')
    expect(linhaCsvVencimento(tl)).toHaveLength(COLUNAS_CSV_VENCIMENTOS.length)
  })
})

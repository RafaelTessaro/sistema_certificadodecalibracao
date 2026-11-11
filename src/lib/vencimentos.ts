// Vencimentos: o agrupamento por cliente, os indicadores e a planilha. O lembrete de cada balança é o que a incluiu
// depois do último certificado dela (`lembreteEm`); o do cliente, o último enviado a ele (`ultimoLembreteCliente`).

import type { Vencimento } from '#shared/tipos.ts'
import { dataCurta, diaBrasilia } from './format'

export interface GrupoCliente {
  clienteId: string
  clienteNome: string
  clienteEmail: string
  itens: Vencimento[]
  vencidas: number
  /** Vencem nos próximos dias de aviso (sem as vencidas). */
  vencendo: number
  /** Lembrete mais recente enviado para este cliente (ISO) ou '', com as balanças da lista ou não. */
  ultimoLembrete: string
}

/** Mês (yyyy-MM) de um instante, no horário de Brasília. */
export const mesBrasilia = (iso: string) => diaBrasilia(iso).slice(0, 7)

/** "04/11/2026": o dia de um instante no horário de Brasília ('' sem instante). */
export const diaDoLembrete = (iso: string) => (iso ? dataCurta(iso) : '')

/** O último lembrete enviado ao cliente da balança (com ela ou não). */
const lembreteAoCliente = (v: Vencimento) => v.ultimoLembreteCliente ?? v.lembreteEm

/** As balanças da lista por cliente, a mais atrasada primeiro; o cliente com a balança mais atrasada primeiro. */
export function agruparPorCliente(lista: Vencimento[], diasAviso: number): GrupoCliente[] {
  const mapa = new Map<string, GrupoCliente>()
  for (const v of lista) {
    let g = mapa.get(v.clienteId)
    if (!g) {
      g = {
        clienteId: v.clienteId,
        clienteNome: v.clienteNome,
        clienteEmail: v.clienteEmail,
        itens: [],
        vencidas: 0,
        vencendo: 0,
        ultimoLembrete: '',
      }
      mapa.set(v.clienteId, g)
    }
    g.itens.push(v)
    if (v.dias < 0) g.vencidas++
    else if (v.dias <= diasAviso) g.vencendo++
    const lembrete = lembreteAoCliente(v)
    if (lembrete > g.ultimoLembrete) g.ultimoLembrete = lembrete
  }
  for (const g of mapa.values()) g.itens.sort((a, b) => a.dias - b.dias)
  return [...mapa.values()].sort(
    (a, b) => a.itens[0].dias - b.itens[0].dias || a.clienteNome.localeCompare(b.clienteNome, 'pt-BR'),
  )
}

/** Quantos clientes receberam lembrete no mês (yyyy-MM), com qualquer balança. */
export function clientesAvisadosNoMes(todos: Vencimento[], mes: string): number {
  return new Set(
    todos
      .filter((v) => {
        const lembrete = lembreteAoCliente(v)
        return !!lembrete && mesBrasilia(lembrete) === mes
      })
      .map((v) => v.clienteId),
  ).size
}

export const COLUNAS_CSV_VENCIMENTOS = [
  'Cliente',
  'E-mail',
  'Balança',
  'Nº de série',
  'TAG',
  'Última calibração',
  'Certificado',
  'Próxima calibração',
  'Dias',
  'Último lembrete',
]

/** A linha da planilha: o último lembrete é o que incluiu a balança (vazio se ela não foi em nenhum). */
export function linhaCsvVencimento(v: Vencimento): Array<string | number> {
  return [
    v.clienteNome,
    v.clienteEmail,
    v.balancaDescricao,
    v.numeroSerie,
    v.identificacao,
    dataCurta(v.ultimaCalibracao),
    v.ultimoCertificado,
    dataCurta(v.proximaCalibracao),
    v.dias,
    diaDoLembrete(v.lembreteEm),
  ]
}

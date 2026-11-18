// "Minhas folhas": as seções (Atrasadas → Hoje → Amanhã → Depois → Sem data → Finalizadas · aguardando entrega →
// Entregues, últimos 7 dias), agrupadas por cliente; o contador das folhas para entregar; e a limpeza das entregues e
// retiradas depois de 7 dias. Puro.

import { somarDias } from './datas.ts'
import { DIAS_NO_CELULAR_DEPOIS } from './folha.ts'
import type { FolhaLocal } from './folha.ts'
import type { Instante } from '../../../shared/campo/tipos.ts'

export type SecaoLista = 'ATRASADAS' | 'HOJE' | 'AMANHA' | 'DEPOIS' | 'SEM_DATA' | 'FINALIZADAS' | 'ENTREGUES'
export const ORDEM_SECOES: readonly SecaoLista[] = [
  'ATRASADAS',
  'HOJE',
  'AMANHA',
  'DEPOIS',
  'SEM_DATA',
  'FINALIZADAS',
  'ENTREGUES',
]

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "qua 18/11" de uma data AAAA-MM-DD. */
export function diaCurto(data: string): string {
  const [a, m, d] = data.split('-').map(Number)
  if (!a || !m || !d) return ''
  const dia = DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** A data prevista da folha (a do pacote, ou a do olá antes de baixar). */
export const dataPrevista = (f: FolhaLocal) => f.pacote?.folha.dataPrevista || f.resumo.dataPrevista || ''

/** A seção de uma folha; null para a retirada (some da lista, com o aviso). */
export function secaoDaFolha(f: FolhaLocal, hoje: string): SecaoLista | null {
  if (f.estado === 'RETIRADA') return null
  if (f.estado === 'ENTREGUE') return 'ENTREGUES'
  if (f.estado === 'FINALIZADA') return 'FINALIZADAS'
  const data = dataPrevista(f)
  if (!data) return 'SEM_DATA'
  if (data < hoje) return 'ATRASADAS'
  if (data === hoje) return 'HOJE'
  if (data === somarDias(hoje, 1)) return 'AMANHA'
  return 'DEPOIS'
}

export function tituloDaSecao(s: SecaoLista, hoje: string): string {
  switch (s) {
    case 'ATRASADAS':
      return 'Atrasadas'
    case 'HOJE':
      return `Hoje · ${diaCurto(hoje)}`
    case 'AMANHA':
      return `Amanhã · ${diaCurto(somarDias(hoje, 1))}`
    case 'DEPOIS':
      return 'Depois'
    case 'SEM_DATA':
      return 'Sem data'
    case 'FINALIZADAS':
      return 'Finalizadas · aguardando entrega'
    case 'ENTREGUES':
      return `Entregues (últimos ${DIAS_NO_CELULAR_DEPOIS} dias)`
  }
}

export interface GrupoCliente {
  cliente: string
  folhas: FolhaLocal[]
}
export interface SecaoDaLista {
  secao: SecaoLista
  titulo: string
  grupos: GrupoCliente[]
  total: number
}

/** As seções da lista, na ordem, só as que têm folha; dentro delas, por cliente (e por data e nº). */
export function agruparFolhas(folhas: readonly FolhaLocal[], hoje: string): SecaoDaLista[] {
  const porSecao = new Map<SecaoLista, FolhaLocal[]>()
  for (const f of folhas) {
    const s = secaoDaFolha(f, hoje)
    if (s) porSecao.set(s, [...(porSecao.get(s) ?? []), f])
  }
  return ORDEM_SECOES.filter((s) => porSecao.has(s)).map((secao) => {
    const lista = [...porSecao.get(secao)!].sort(
      (a, b) =>
        (secao === 'ENTREGUES' ? b.entregueEm.localeCompare(a.entregueEm) : 0) ||
        dataPrevista(a).localeCompare(dataPrevista(b)) ||
        a.numero.localeCompare(b.numero),
    )
    const grupos: GrupoCliente[] = []
    for (const f of lista) {
      const cliente = f.resumo.cliente || 'Cliente a informar'
      const g = grupos.find((x) => x.cliente === cliente)
      if (g) g.folhas.push(f)
      else grupos.push({ cliente, folhas: [f] })
    }
    return { secao, titulo: tituloDaSecao(secao, hoje), grupos, total: lista.length }
  })
}

/** As folhas finalizadas que ainda não chegaram à empresa (o contador sempre visível). */
export const paraEntregar = (folhas: readonly FolhaLocal[]) => folhas.filter((f) => f.estado === 'FINALIZADA')

/** Folhas começadas e não entregues (bloqueiam atualizar o app e descadastrar). */
export const naoEntregues = (folhas: readonly FolhaLocal[]) =>
  folhas.filter((f) => f.estado === 'EM_PREENCHIMENTO' || f.estado === 'FINALIZADA' || f.estado === 'REABERTA')

/** As retiradas pelo escritório cujo aviso o técnico ainda não viu. */
export const retiradasSemAviso = (folhas: readonly FolhaLocal[]) =>
  folhas.filter((f) => f.estado === 'RETIRADA' && !f.avisoRetiradaVisto)

/** Envios a apagar do celular: entregues e retiradas há mais de 7 dias. */
export function expiradas(folhas: readonly FolhaLocal[], agora: Instante): string[] {
  const limite = Date.parse(agora) - DIAS_NO_CELULAR_DEPOIS * 86_400_000
  return folhas
    .filter((f) => {
      const desde = f.estado === 'ENTREGUE' ? f.entregueEm : f.estado === 'RETIRADA' ? f.retiradaEm : ''
      return !!desde && Date.parse(desde) < limite
    })
    .map((f) => f.envioId)
}

/** "1 folha" / "2 folhas". */
export const folhas = (n: number) => `${n} ${n === 1 ? 'folha' : 'folhas'}`

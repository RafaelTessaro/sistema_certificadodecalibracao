// Transporte HTTP do app: a interface que o cliente usa para falar com o servidor da empresa. No celular, a implementação
// é o CapacitorHttp.request (plataforma/http.ts); nos testes, uma falsa em memória ou uma em node:http
// (nucleo/testes/transporteNode.ts). Toda chamada leva os DOIS prazos (conexão e leitura): sem eles, uma rede que aceita
// a conexão e não responde travaria a entrega para sempre. Puro.

import type { PrazoCampo } from '../../../shared/campo/protocolo.ts'

export type MetodoHttp = 'GET' | 'POST' | 'PUT'

export interface PedidoHttp {
  metodo: MetodoHttp
  /** URL completa (`urlCampo(endereco, caminho)`). */
  url: string
  /** Cabeçalhos em minúsculas (o transporte acrescenta `content-type: application/json` quando há corpo). */
  cabecalhos: Record<string, string>
  /** Um valor JSON (objeto, lista…); undefined = sem corpo. */
  corpo?: unknown
  /** Obrigatório: prazos de conexão e de leitura (ms). */
  prazo: PrazoCampo
}

export interface RespostaHttp {
  status: number
  /** O corpo já lido como JSON quando é JSON; texto quando não é; null quando vazio. */
  corpo: unknown
}

/** A rede falhou: sem conexão (servidor fora do ar, Wi-Fi de fora) ou prazo vencido. Nada chegou do servidor. */
export class ErroDeRede extends Error {
  readonly tipo: 'SEM_CONEXAO' | 'PRAZO'
  constructor(tipo: 'SEM_CONEXAO' | 'PRAZO', mensagem?: string) {
    super(mensagem ?? (tipo === 'PRAZO' ? 'O servidor demorou demais para responder.' : 'Sem conexão com o servidor.'))
    this.name = 'ErroDeRede'
    this.tipo = tipo
  }
}

export interface Transporte {
  /** Faz o pedido. Lança `ErroDeRede` quando nada chegou do servidor; qualquer status HTTP volta como resposta. */
  enviar(pedido: PedidoHttp): Promise<RespostaHttp>
}

/** Prazo máximo aceito (ms): acima disso, é engano. */
const PRAZO_MAXIMO_MS = 5 * 60_000

/**
 * Confere os prazos do pedido (os dois, inteiros, positivos e com limite). Toda implementação chama antes de enviar:
 * pedido sem prazo é defeito do app, nunca vai para a rede.
 */
export function exigirPrazo(pedido: PedidoHttp): PrazoCampo {
  const p = pedido?.prazo as Partial<PrazoCampo> | undefined
  const ok = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= PRAZO_MAXIMO_MS
  if (!p || !ok(p.conectarMs) || !ok(p.lerMs))
    throw new Error(`Pedido ${pedido?.metodo ?? '?'} ${pedido?.url ?? '?'} sem os prazos de conexão e de leitura.`)
  return { conectarMs: p.conectarMs as number, lerMs: p.lerMs as number }
}

/** Lê o texto de uma resposta como JSON quando dá; senão, o próprio texto (ou null se vazio). */
export function lerCorpo(texto: string): unknown {
  if (!texto) return null
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

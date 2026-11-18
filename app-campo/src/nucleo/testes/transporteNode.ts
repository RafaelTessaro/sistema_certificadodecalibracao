// Transporte em node:http, para os testes que falam com um servidor de verdade (o e2e da sincronia sobe o Fastify em
// 127.0.0.1:0 e roda o núcleo do app contra ele). Mesmas regras do CapacitorHttp do app: prazos de conexão e de leitura
// obrigatórios, corpo JSON, resposta lida como JSON quando dá. Só para testes (não entra no app: usa node:).

import { request } from 'node:http'
import { ErroDeRede, exigirPrazo, lerCorpo } from '../transporte.ts'
import type { PedidoHttp, RespostaHttp, Transporte } from '../transporte.ts'

export const transporteNode: Transporte = {
  enviar(pedido: PedidoHttp): Promise<RespostaHttp> {
    const prazo = exigirPrazo(pedido)
    return new Promise((resolve, reject) => {
      const corpo = pedido.corpo === undefined ? undefined : Buffer.from(JSON.stringify(pedido.corpo), 'utf8')
      const cabecalhos: Record<string, string | number> = { ...pedido.cabecalhos, accept: 'application/json' }
      if (corpo) {
        cabecalhos['content-type'] = 'application/json'
        cabecalhos['content-length'] = corpo.length
      }
      let conectou = false
      const req = request(pedido.url, { method: pedido.metodo, headers: cabecalhos })
      const prazoConexao = setTimeout(() => {
        if (!conectou) req.destroy(new ErroDeRede('PRAZO'))
      }, prazo.conectarMs)
      req.on('socket', (s) => {
        const conectado = () => {
          conectou = true
          clearTimeout(prazoConexao)
        }
        // O agente do Node reaproveita a conexão (keep-alive): o 'connect' não vem de novo, e o prazo de conexão não vale
        if (!s.connecting) conectado()
        else s.once('connect', conectado)
      })
      // Prazo de leitura: sem dados por `lerMs`, desiste
      req.setTimeout(prazo.lerMs, () => req.destroy(new ErroDeRede('PRAZO')))
      req.on('error', (e) => {
        clearTimeout(prazoConexao)
        reject(e instanceof ErroDeRede ? e : new ErroDeRede('SEM_CONEXAO', e.message))
      })
      req.on('response', (res) => {
        const partes: Buffer[] = []
        res.on('data', (b: Buffer) => partes.push(b))
        res.on('end', () => {
          clearTimeout(prazoConexao)
          resolve({ status: res.statusCode ?? 0, corpo: lerCorpo(Buffer.concat(partes).toString('utf8')) })
        })
        res.on('error', (e) => reject(new ErroDeRede('SEM_CONEXAO', e.message)))
      })
      if (corpo) req.write(corpo)
      req.end()
    })
  },
}

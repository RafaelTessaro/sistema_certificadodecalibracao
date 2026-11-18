// Transporte do app: TODO HTTP sai por aqui, pelo CapacitorHttp.request (código nativo), sempre com os dois prazos
// (conexão e leitura). O pedido para http://192.168.x.x sai do Android, sem mixed content e sem CORS. A interceptação
// automática do Capacitor ignora prazos e o AbortSignal: por isso nenhum outro jeito de chamar a rede é usado no app
// (o teste de arquitetura confere).

import { CapacitorHttp } from '@capacitor/core'
import { ErroDeRede, exigirPrazo, lerCorpo } from '../nucleo/transporte.ts'
import type { PedidoHttp, RespostaHttp, Transporte } from '../nucleo/transporte.ts'

export const transporteCapacitor: Transporte = {
  async enviar(pedido: PedidoHttp): Promise<RespostaHttp> {
    const prazo = exigirPrazo(pedido)
    const headers: Record<string, string> = { ...pedido.cabecalhos, accept: 'application/json' }
    if (pedido.corpo !== undefined) headers['content-type'] = 'application/json'
    let resposta
    try {
      resposta = await CapacitorHttp.request({
        url: pedido.url,
        method: pedido.metodo,
        headers,
        ...(pedido.corpo !== undefined ? { data: pedido.corpo } : {}),
        connectTimeout: prazo.conectarMs,
        readTimeout: prazo.lerMs,
        responseType: 'text',
        disableRedirects: true,
      })
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : String(e)
      throw new ErroDeRede(/timeout|timed out|tempo/i.test(mensagem) ? 'PRAZO' : 'SEM_CONEXAO', mensagem)
    }
    const dados: unknown = resposta.data
    return { status: resposta.status, corpo: typeof dados === 'string' ? lerCorpo(dados) : (dados ?? null) }
  },
}

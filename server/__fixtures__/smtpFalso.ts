// Servidor SMTP mínimo para os testes do envio de e-mail (em 127.0.0.1, sem TLS): aceita qualquer login, recusa com
// 550 o RCPT TO dos endereços de `recusar` e, com `limite` (bytes), recusa a mensagem maior que ele com 552 5.3.4 no
// fim do DATA (como Postfix e Exchange fazem). `anunciarLimite`: anuncia o limite no EHLO (SIZE), e então recusa
// também no MAIL FROM o SIZE= declarado acima dele.

import { createServer, type AddressInfo, type Socket } from 'node:net'

export interface MensagemRecebida {
  de: string
  para: string[]
  bytes: number
}

export async function smtpFalso(o: { recusar?: string[]; limite?: number; anunciarLimite?: boolean } = {}) {
  const recebidas: MensagemRecebida[] = []
  /** Bytes recebidos no DATA (também os das mensagens recusadas). */
  let bytesDados = 0
  const conexoes = new Set<Socket>()
  const servidor = createServer((s) => {
    conexoes.add(s)
    s.on('close', () => conexoes.delete(s))
    s.on('error', () => {})
    let buffer = ''
    let emDados = false
    let corpo = 0
    let de = ''
    let para: string[] = []
    const responder = (linha: string) => s.write(`${linha}\r\n`)
    responder('220 smtp.falso ESMTP')
    s.on('data', (pedaco) => {
      buffer += pedaco.toString('latin1')
      for (;;) {
        if (emDados) {
          const fim = buffer.indexOf('\r\n.\r\n')
          if (fim < 0) {
            // Guarda só o fim (o ponto final pode vir dividido entre dois pedaços)
            const sobra = Math.max(0, buffer.length - 4)
            corpo += sobra
            bytesDados += sobra
            buffer = buffer.slice(sobra)
            return
          }
          corpo += fim
          bytesDados += fim
          buffer = buffer.slice(fim + 5)
          emDados = false
          if (o.limite && corpo > o.limite) responder('552 5.3.4 Message size exceeds fixed maximum message size')
          else {
            recebidas.push({ de, para, bytes: corpo })
            responder('250 2.0.0 Ok: queued')
          }
          continue
        }
        const i = buffer.indexOf('\r\n')
        if (i < 0) return
        const linha = buffer.slice(0, i)
        buffer = buffer.slice(i + 2)
        const comando = linha.toUpperCase()
        if (comando.startsWith('EHLO')) {
          const tamanho = o.limite && o.anunciarLimite ? [`250-SIZE ${o.limite}`] : []
          s.write(['250-smtp.falso', '250-AUTH PLAIN LOGIN', ...tamanho, '250 8BITMIME', ''].join('\r\n'))
        } else if (comando.startsWith('HELO')) responder('250 smtp.falso')
        else if (comando.startsWith('AUTH')) responder('235 2.7.0 Authentication successful')
        else if (comando.startsWith('MAIL FROM')) {
          const declarado = Number(/SIZE=(\d+)/i.exec(linha)?.[1] ?? 0)
          if (o.limite && o.anunciarLimite && declarado > o.limite) responder('552 5.3.4 Message size exceeds fixed limit')
          else {
            de = /<([^>]*)>/.exec(linha)?.[1] ?? ''
            para = []
            corpo = 0
            responder('250 2.1.0 Ok')
          }
        } else if (comando.startsWith('RCPT TO')) {
          const endereco = /<([^>]*)>/.exec(linha)?.[1] ?? ''
          if (o.recusar?.includes(endereco)) responder(`550 5.1.1 <${endereco}>: Recipient address rejected: User unknown`)
          else {
            para.push(endereco)
            responder('250 2.1.5 Ok')
          }
        } else if (comando === 'DATA') {
          emDados = true
          responder('354 End data with <CR><LF>.<CR><LF>')
        } else if (comando === 'QUIT') {
          responder('221 2.0.0 Bye')
          s.end()
        } else responder('250 2.0.0 Ok')
      }
    })
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  return {
    porta: (servidor.address() as AddressInfo).port,
    recebidas,
    bytesDados: () => bytesDados,
    fechar: () =>
      new Promise<void>((r) => {
        for (const s of conexoes) s.destroy()
        servidor.close(() => r())
      }),
  }
}

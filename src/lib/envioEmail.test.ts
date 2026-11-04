// O aviso depois de um envio de e-mail: o servidor que recusa só parte dos destinatários entrega aos outros sem dar
// erro, e a tela avisa (atenção, não sucesso) quem não recebeu, com o código da resposta e o que fazer.

import { describe, expect, it } from 'vitest'
import { useToasts } from '../store/ui'
import { avisoDoEnvio, mostrarEnvio, textoRecusados } from './envioEmail'

describe('textoRecusados', () => {
  it('um endereço, com o código; vários; sem código', () => {
    expect(textoRecusados([{ endereco: 'qualidade@mercado.com.br', codigo: 550 }])).toBe(
      'O servidor de e-mail recusou qualidade@mercado.com.br (550). Confira o endereço.',
    )
    expect(
      textoRecusados([
        { endereco: 'a@mercado.com.br', codigo: 550 },
        { endereco: 'b@mercado.com.br', codigo: null },
      ]),
    ).toBe('O servidor de e-mail recusou a@mercado.com.br (550) e b@mercado.com.br. Confira os endereços.')
    expect(textoRecusados([])).toBe('')
  })
})

describe('avisoDoEnvio', () => {
  it('todos receberam: sucesso, como antes', () => {
    expect(
      avisoDoEnvio(
        { para: ['qualidade@mercado.com.br'], recusados: [] },
        { titulo: 'Certificado enviado', detalhe: 'com 2 anexos' },
      ),
    ).toEqual({ tipo: 'sucesso', titulo: 'Certificado enviado', descricao: 'Para qualidade@mercado.com.br, com 2 anexos' })
    // Resposta de um servidor de antes desta versão (sem `recusados`)
    expect(avisoDoEnvio({ para: ['a@b.com', 'c@d.com'] }, { titulo: 'Lembrete enviado' })).toEqual({
      tipo: 'sucesso',
      titulo: 'Lembrete enviado',
      descricao: 'Para a@b.com, c@d.com',
    })
  })

  it('o servidor recusou parte: aviso de atenção, com quem recebeu e quem não', () => {
    expect(
      avisoDoEnvio(
        { para: ['compras@mercado.com.br'], recusados: [{ endereco: 'qualidade@mercado.com.br', codigo: 550 }] },
        { titulo: 'Certificado enviado', detalhe: 'com 1 anexo' },
      ),
    ).toEqual({
      tipo: 'aviso',
      titulo: 'Certificado enviado só para parte dos endereços',
      descricao:
        'Para compras@mercado.com.br, com 1 anexo. O servidor de e-mail recusou qualidade@mercado.com.br (550). Confira o endereço.',
    })
  })
})

describe('mostrarEnvio', () => {
  it('o toast de atenção no lugar do de sucesso quando o servidor recusou alguém', () => {
    mostrarEnvio({ para: ['a@b.com'], recusados: [] }, { titulo: 'Lembrete enviado' })
    mostrarEnvio({ para: ['a@b.com'], recusados: [{ endereco: 'c@d.com', codigo: 550 }] }, { titulo: 'Lembrete enviado' })
    expect(useToasts.getState().toasts.map((t) => [t.tipo, t.titulo])).toEqual([
      ['sucesso', 'Lembrete enviado'],
      ['aviso', 'Lembrete enviado só para parte dos endereços'],
    ])
  })
})

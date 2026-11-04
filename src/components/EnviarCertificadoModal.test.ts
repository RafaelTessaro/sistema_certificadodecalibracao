// Envio do certificado por e-mail: o "Para" e o aviso de cliente sem e-mail vêm do cadastro atual do cliente
// (`emailsCliente`), não da cópia congelada na emissão (o cliente pode ter trocado o e-mail de recebimento
// depois). Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CLIENTE_VAZIO } from '#shared/dominio.ts'
import type { Calibracao, Cliente } from '#shared/tipos.ts'

// Sem DOM: a janela (portal no document.body) sai como o conteúdo dela, no lugar
vi.mock('./ui/Modal', () => ({
  Modal: ({ aberto, children, rodape }: { aberto: boolean; children: ReactNode; rodape?: ReactNode }) =>
    aberto ? createElement('div', { 'data-janela': '' }, children, rodape) : null,
}))
// As configurações e os anexos ainda carregando
vi.mock('../lib/consulta', () => ({
  useConsulta: () => ({ dados: undefined, carregando: true, erro: '', atualizando: false, recarregar: () => {} }),
}))

const { EnviarCertificadoModal } = await import('./EnviarCertificadoModal')

const calibracao = { id: 'k1', numero: 'CC-2026-00001', dataCalibracao: '2026-10-20', ordemServico: '' } as Calibracao
/** O cliente como ficou congelado na emissão: sem e-mail. */
const congelado = { ...CLIENTE_VAZIO, id: 'c1', nome: 'Mercado Bom Preço' } as Cliente

const janela = (emailsCliente?: Pick<Cliente, 'email' | 'emailCertificados'> | null) =>
  renderToStaticMarkup(
    createElement(EnviarCertificadoModal, {
      aberto: true,
      aoFechar: () => {},
      calibracao,
      cliente: congelado,
      emailsCliente,
      balanca: undefined,
    }),
  )

describe('enviar certificado: destinatário', () => {
  it('cliente sem e-mail na emissão e com e-mail cadastrado depois: não avisa que falta e-mail', () => {
    expect(janela({ email: '', emailCertificados: 'qualidade@mercado.com.br' })).not.toContain(
      'O cliente não tem e-mail cadastrado.',
    )
    expect(janela({ email: 'contato@mercado.com.br', emailCertificados: '' })).toContain('Separe vários e-mails com vírgula.')
  })

  it('sem e-mail no cadastro atual: avisa; sem os e-mails atuais (resposta antiga), vale a cópia da emissão', () => {
    expect(janela({ email: '', emailCertificados: '' })).toContain('O cliente não tem e-mail cadastrado.')
    expect(janela(undefined)).toContain('O cliente não tem e-mail cadastrado.')
  })
})

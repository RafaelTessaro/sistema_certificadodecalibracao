// Envio do certificado por e-mail: o "Para" e o aviso de cliente sem e-mail vêm do cadastro atual do cliente
// (`emailsCliente`), não da cópia congelada na emissão (o cliente pode ter trocado o e-mail de recebimento
// depois). Desenhado no servidor (sem DOM), como as outras telas testadas.

import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CLIENTE_VAZIO, CONFIG_PADRAO, EMAIL_MENSAGEM_ANTIGA, preencherModelo } from '#shared/dominio.ts'
import { avisoSemPermissao } from '#shared/permissoes.ts'
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

const { AvisoEmailNaoConfigurado, DicaAssinaturaDigital, EnviarCertificadoModal } = await import('./EnviarCertificadoModal')
const { comParagrafoAntesDoFim, valoresDoEmail } = await import('../lib/emailCertificado')

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

// O operador não abre Configurações: sem o e-mail configurado, o aviso do envio (e quem chega a uma página do
// administrador) diz para chamar o administrador, em vez de um link que o devolvia ao Painel sem explicação
describe('e-mail ainda não configurado', () => {
  const aviso = (podeConfigurar: boolean) =>
    renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AvisoEmailNaoConfigurado, { podeConfigurar })))

  it('o administrador vai direto para Configurações → E-mail', () => {
    const html = aviso(true)
    expect(html).toContain('href="/configuracoes?secao=email"')
    expect(html).toContain('Configurar agora')
  })

  it('o operador é avisado para pedir ao administrador (sem link para uma página que ele não abre)', () => {
    const html = aviso(false)
    expect(html).not.toContain('/configuracoes')
    expect(html).not.toContain('Configurar agora')
    expect(html).toContain('Peça ao administrador para configurar o e-mail da empresa em Configurações → E-mail.')
  })

  it('quem chega a uma página só do administrador volta ao Painel com o porquê', () => {
    expect(avisoSemPermissao('configuracoes')).toEqual([
      'Esta página é só do administrador',
      'Só o administrador altera as configurações. Peça a ele, se precisar.',
    ])
  })
})

// 1.0.7: a marca {assinaturaDigital} do modelo explica ao cliente como conferir a assinatura do PDF assinado; vazia (e sem
// deixar linha em branco) no certificado sem assinatura digital
describe('e-mail do certificado assinado digitalmente', () => {
  const assinada = {
    ...calibracao,
    emissao: {
      hashPdf: 'f98a',
      assinaturaDigital: { titular: 'FABIO DE GODOY LIMA LTDA', cnpj: '12403843000118', certificado: 'x' },
    },
  } as Calibracao
  const sem = { ...calibracao, emissao: null } as Calibracao

  it('a marca vira o parágrafo de como conferir no assinado e some no outro', () => {
    const v = valoresDoEmail(CONFIG_PADRAO, assinada, congelado, undefined)
    expect(v.assinaturaDigital).toMatch(
      /^O certificado está assinado digitalmente por FABIO DE GODOY LIMA LTDA com certificado ICP-Brasil\./,
    )
    expect(preencherModelo(CONFIG_PADRAO.emailMensagem, v)).toContain('validar.iti.gov.br')
    const semAssinatura = valoresDoEmail(CONFIG_PADRAO, sem, congelado, undefined)
    expect(semAssinatura.assinaturaDigital).toBe('')
    expect(preencherModelo(CONFIG_PADRAO.emailMensagem, semAssinatura)).not.toMatch(/\n\n\n|assinatura/)
  })

  it('o modelo mudado pela empresa (sem a marca): a dica no assinado, com o botão de incluir; o administrador vai ao modelo', () => {
    const dica = (podeConfigurar: boolean, k = assinada, mensagem = EMAIL_MENSAGEM_ANTIGA, texto = 'Olá') =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(DicaAssinaturaDigital, {
            calibracao: k,
            modelo: mensagem,
            texto,
            podeConfigurar,
            aoIncluir: () => {},
          }),
        ),
      )
    expect(dica(true)).toContain('Incluir na mensagem')
    expect(dica(true)).toContain('{assinaturaDigital}')
    expect(dica(true)).toContain('href="/configuracoes?secao=vencimentos"')
    expect(dica(false)).not.toContain('/configuracoes')
    expect(dica(false)).toContain('Peça ao administrador')
    // Com a marca no modelo, sem assinatura digital, ou com o parágrafo já na mensagem: nada
    expect(dica(true, assinada, CONFIG_PADRAO.emailMensagem)).toBe('')
    expect(dica(true, sem)).toBe('')
    const v = valoresDoEmail(CONFIG_PADRAO, assinada, congelado, undefined)
    expect(dica(true, assinada, EMAIL_MENSAGEM_ANTIGA, `Olá\n\n${v.assinaturaDigital}`)).toBe('')
    // Ainda aguardando a assinatura (sem o PDF assinado): não diz que "está assinado"
    const aguardando = { ...assinada, emissao: { ...assinada.emissao!, hashPdf: '' } } as Calibracao
    expect(dica(true, aguardando)).toBe('')
    // Nem na mensagem preenchida pelo modelo (a marca fica vazia, sem deixar linha em branco)
    const valores = valoresDoEmail(CONFIG_PADRAO, aguardando, congelado, undefined)
    expect(valores.assinaturaDigital).toBe('')
    expect(preencherModelo(CONFIG_PADRAO.emailMensagem, valores)).not.toMatch(/assinado digitalmente|\n\n\n/)
  })

  it('incluir na mensagem: o parágrafo antes do último (a despedida); sem parágrafos, no fim', () => {
    expect(comParagrafoAntesDoFim('Olá,\n\nSegue.\n\nAtenciosamente,\nEmpresa', 'P.')).toBe(
      'Olá,\n\nSegue.\n\nP.\n\nAtenciosamente,\nEmpresa',
    )
    expect(comParagrafoAntesDoFim('Segue o certificado.', 'P.')).toBe('Segue o certificado.\n\nP.')
    expect(comParagrafoAntesDoFim('', 'P.')).toBe('P.')
  })
})

// O registro de campo na ficha do certificado emitido (1.1.0): a folha que volta do celular depois da emissão ("depois de
// recolhida") aparece com "Ver registro" e "Comparar com o campo" (antes, o cartão "Voltaram do campo" levava a uma ficha
// sem nada para fazer). Desenhado no servidor (sem DOM).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Balanca, Calibracao, CampoDaCalibracao, ImportacaoCampo, RegistroCampoListado } from '#shared/tipos.ts'
import { CartaoRegistroCampo } from './RegistroCampoCard'

const texto = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const registro = (x: Partial<RegistroCampoListado> = {}): RegistroCampoListado => ({
  id: 'r1',
  envioId: 'e1',
  numero: 'FC-2026-00042',
  ligadoA: '',
  tecnicoId: 'u1',
  tecnico: 'Carlos Eduardo Lima',
  dispositivoId: 'd1',
  celular: 'Celular do Carlos',
  piloto: false,
  desfecho: '',
  revisaoLocal: 1,
  recebidoEm: '2026-11-12T13:00:00.000Z',
  relogioDiferencaS: 0,
  situacao: 'VALIDO',
  marcas: ['APOS_RECOLHER'],
  problemas: [],
  situacaoMotivo: '',
  situacaoPor: '',
  situacaoEm: '',
  importado: false,
  ...x,
})

const campo = (x: Partial<CampoDaCalibracao> = {}): CampoDaCalibracao => ({
  registroOriginal: 'CELULAR',
  numero: 'FC-2026-00042',
  envio: null,
  travada: false,
  registros: [registro()],
  registroId: 'r1',
  importacoes: [],
  puxado: false,
  divergencias: [],
  justificativa: null,
  versaoNova: false,
  avisosConferidos: [],
  desfecho: '',
  motivoDesfecho: '',
  ...x,
})

const calibracao = (x: Partial<Calibracao> = {}) => ({ id: 'k1', status: 'EMITIDO', versao: 7, ...x }) as Calibracao
const BALANCA = { id: 'b1', unidade: 'kg' } as Balanca

const cartao = (c: CampoDaCalibracao, k = calibracao(), balanca: Balanca | undefined = BALANCA) =>
  renderToStaticMarkup(createElement(CartaoRegistroCampo, { campo: c, calibracao: k, balanca, aoComparar: () => {} }))

describe('registro de campo no certificado emitido', () => {
  it('a folha que voltou "depois de recolhida": ver o registro e comparar com o certificado', () => {
    const t = texto(cartao(campo()))
    expect(t).toContain('Registro de campo FC-2026-00042')
    expect(t).toContain('A folha voltou do celular. Compare com o certificado')
    expect(t).toContain('Carlos Eduardo Lima, chegou em 12/11 às 10:00')
    expect(t).toContain('Depois de recolhida')
    expect(t).toContain('Ver registro')
    // Nunca "Puxar" (mesmo com o registro original no celular): o certificado emitido não muda
    expect(t).toContain('Comparar com o campo')
    expect(t).not.toContain('Puxar')
  })

  it('já comparado: quando e por quem, com a observação, e "Comparar de novo"', () => {
    const comparacao: ImportacaoCampo = {
      id: 'i1',
      registroId: 'r1',
      calibracaoId: 'k1',
      tipo: 'COMPARACAO',
      versaoAntes: 7,
      versaoDepois: 7,
      feitoEm: '2026-11-13T12:30:00.000Z',
      feitoPor: 'Ana Ribeiro',
      resumo: null,
      observacao: 'Leituras iguais às do papel.',
    }
    const t = texto(cartao(campo({ importacoes: [comparacao] })))
    expect(t).toContain('Comparado com o certificado em 13/11/2026')
    expect(t).toContain('por Ana Ribeiro')
    expect(t).toContain('Leituras iguais às do papel.')
    expect(t).toContain('Comparar de novo')
  })

  it('sem registro, ou o mesmo já congelado na emissão (puxado antes de emitir): nada', () => {
    expect(cartao(campo({ registros: [], registroId: '' }))).toBe('')
    const puxado = calibracao({
      emissao: { campo: { registroId: 'r1', numero: 'FC-2026-00042' } } as Calibracao['emissao'],
    })
    expect(cartao(campo(), puxado)).toBe('')
  })

  it('o cancelado (e o substituído) só mostra o registro, sem comparar', () => {
    for (const status of ['CANCELADO', 'SUBSTITUIDO'] as const) {
      const t = texto(cartao(campo(), calibracao({ status })))
      expect(t).toContain('Ver registro')
      expect(t).not.toContain('Comparar')
    }
  })
})

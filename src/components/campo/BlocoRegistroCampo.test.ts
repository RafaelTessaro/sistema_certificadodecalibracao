// O bloco "Registro de campo" de "Revisão e emissão": de quem é o celular de onde a folha voltou. O registro órfão, ou o
// do técnico cuja conta foi excluída, vem sem o nome: nada de "celular de técnico". Desenhado no servidor (sem DOM).

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CampoDaCalibracao, RegistroCampoListado } from '#shared/tipos.ts'
import { BlocoRegistroCampo } from './BlocoRegistroCampo'

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
  piloto: true,
  desfecho: '',
  revisaoLocal: 1,
  recebidoEm: '2026-11-12T13:00:00.000Z',
  relogioDiferencaS: 0,
  situacao: 'VALIDO',
  marcas: ['PILOTO'],
  problemas: [],
  situacaoMotivo: '',
  situacaoPor: '',
  situacaoEm: '',
  importado: false,
  ...x,
})

const campo = (r: RegistroCampoListado): CampoDaCalibracao => ({
  registroOriginal: 'PAPEL',
  numero: 'FC-2026-00042',
  envio: null,
  travada: false,
  registros: [r],
  registroId: r.id,
  importacoes: [],
  puxado: false,
  divergencias: [],
  justificativa: null,
  versaoNova: false,
  avisosConferidos: [],
  desfecho: '',
  motivoDesfecho: '',
})

const bloco = (r: RegistroCampoListado) =>
  texto(
    renderToStaticMarkup(
      createElement(BlocoRegistroCampo, {
        campo: campo(r),
        aberta: true,
        aoVerRegistro: () => {},
        aoJustificar: async () => true,
      }),
    ),
  )

describe('bloco "Registro de campo" na revisão e emissão', () => {
  it('de que celular a folha voltou; sem o nome do técnico, "celular do técnico"', () => {
    expect(bloco(registro())).toContain('Voltou do celular de Carlos Eduardo Lima')
    const semNome = bloco(registro({ tecnico: '' }))
    expect(semNome).toContain('Voltou do celular do técnico')
    expect(semNome).not.toContain('celular de técnico')
  })
})

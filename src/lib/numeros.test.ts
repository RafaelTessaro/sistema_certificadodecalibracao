// Textos do nº de certificado reservado na impressão da folha de campo (listas e lista dos não utilizados).

import { describe, expect, it } from 'vitest'
import type { NumeroReservado } from '#shared/tipos.ts'
import {
  avisoNumeroDaFolha,
  numeroDaLinha,
  quandoDoNumero,
  ROTULO_SITUACAO_NUMERO,
  separarNumeros,
  textoNumeroReservado,
} from './numeros'

const numero = (x: Partial<NumeroReservado>): NumeroReservado => ({
  id: 1,
  numero: 'CC-2026-00042',
  ano: 2026,
  sequencia: 42,
  calibracaoId: 'k1',
  folha: 'FC-2026-00010',
  reservadoEm: '2026-10-20T13:05:00',
  reservadoPor: 'Ana',
  situacao: 'reservado',
  motivo: '',
  situacaoEm: '',
  situacaoPor: '',
  ...x,
})

describe('nº de certificado reservado', () => {
  it('na lista: o emitido; em andamento, o reservado; sem nº, nada', () => {
    expect(numeroDaLinha({ numero: 'CC-2026-00001', numeroReservado: '' })).toEqual({ numero: 'CC-2026-00001', reservado: false })
    expect(numeroDaLinha({ numero: '', numeroReservado: 'CC-2026-00042' })).toEqual({ numero: 'CC-2026-00042', reservado: true })
    expect(numeroDaLinha({ numero: '' })).toEqual({ numero: '', reservado: false })
    expect(textoNumeroReservado('CC-2026-00042')).toBe('Certificado nº CC-2026-00042 (reservado)')
    expect(ROTULO_SITUACAO_NUMERO.nao_utilizado).toBe('Não utilizado')
  })

  it('separa os não utilizados e os reservados em folhas avulsas (os de calibrações aparecem na lista delas)', () => {
    const lista = [
      numero({ id: 1, situacao: 'nao_utilizado' }),
      numero({ id: 2 }),
      numero({ id: 3, calibracaoId: '' }),
      numero({ id: 4, situacao: 'emitido' }),
    ]
    const { naoUtilizados, avulsos } = separarNumeros(lista)
    expect(naoUtilizados.map((n) => n.id)).toEqual([1])
    expect(avulsos.map((n) => n.id)).toEqual([3])
  })

  it('quando: o não utilizado, de quando ficou assim e quem; o reservado, de quando foi impresso', () => {
    expect(quandoDoNumero(numero({}))).toBe('20/10/2026 às 13:05 · Ana')
    expect(quandoDoNumero(numero({ situacao: 'nao_utilizado', situacaoEm: '2026-10-21T08:30:00', situacaoPor: 'Bruno' }))).toBe(
      '21/10/2026 às 08:30 · Bruno',
    )
  })

  it('aviso da folha ligada cujo nº não vai ser usado: o motivo do servidor e o pedido para corrigir a etiqueta', () => {
    expect(
      avisoNumeroDaFolha(
        {
          numero: 'CC-2026-00015',
          motivo:
            'O nº CC-2026-00015 é o do certificado cancelado CC-2026-00015: um nº emitido não é usado de novo. Esta calibração recebe outro nº na emissão.',
        },
        'FC-2026-00012',
      ),
    ).toEqual({
      titulo: 'O nº CC-2026-00015, impresso na folha FC-2026-00012, não vai ser usado',
      descricao:
        'O nº CC-2026-00015 é o do certificado cancelado CC-2026-00015: um nº emitido não é usado de novo. Esta calibração recebe outro nº na emissão. Se ele foi copiado na etiqueta da balança, corrija a etiqueta.',
    })
    // Sem motivo (servidor de antes desta versão): só o pedido da etiqueta
    expect(avisoNumeroDaFolha({ numero: 'CC-2026-00002' }, 'FC-2026-00003').descricao).toBe(
      'Se ele foi copiado na etiqueta da balança, corrija a etiqueta.',
    )
  })
})

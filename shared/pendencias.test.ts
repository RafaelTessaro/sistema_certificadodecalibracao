// O que bloqueia a emissão do certificado (`pendenciasEmissao`): a rastreabilidade dos padrões (acreditação
// Cgcre do laboratório) e a pressão atmosférica com o barômetro que a mediu (na classe II, obrigatória).

import { describe, expect, it } from 'vitest'
import { calibracaoVazia, PADRAO_VAZIO, pendenciasEmissao } from './dominio.ts'
import type { CalibracaoInput, ClasseExatidao, Padrao } from './tipos.ts'

const padrao = (x: Partial<Padrao>): Padrao =>
  ({
    ...PADRAO_VAZIO,
    id: x.identificacao ?? 'p',
    identificacao: 'JP-01',
    tipo: 'PESOS',
    ativo: true,
    certificado: 'LAB-1/2026',
    laboratorio: 'Laboratório Exemplo',
    acreditacao: 'CAL 0123',
    validade: '2099-01-01',
    ...x,
  }) as Padrao
const pesos = padrao({})
const th = padrao({ identificacao: 'TH-01', tipo: 'TERMOHIGROMETRO' })
const br = padrao({ identificacao: 'BR-01', tipo: 'BAROMETRO' })

function pendencias(padroes: Padrao[], pressao: number | null, classe?: ClasseExatidao) {
  const k: CalibracaoInput = {
    ...calibracaoVazia(),
    dataCalibracao: '2026-10-20',
    tecnicoId: 't1',
    localEndereco: 'Rua A, 1 – Rio Claro/SP',
    padroesIds: padroes.map((p) => p.id),
    ambiente: { temperaturaInicial: 22, temperaturaFinal: 23, umidadeInicial: 50, umidadeFinal: 51, pressao },
  }
  return pendenciasEmissao(k, { padroes, hoje: '2026-10-28', temPesos: true, ...(classe !== undefined ? { classe } : {}) })
}

describe('pendências da emissão', () => {
  it('sem pendência com padrões acreditados e sem pressão (classe III)', () => {
    expect(pendencias([pesos, th], null, 'III')).toEqual([])
  })

  it('padrão sem a acreditação Cgcre do laboratório: a declaração de rastreabilidade seria falsa', () => {
    expect(pendencias([pesos, { ...th, acreditacao: '  ' }], null)).toEqual([
      'O padrão TH-01 está sem a acreditação Cgcre do laboratório que o calibrou.',
    ])
  })

  it('pressão sem barômetro nos padrões, e barômetro sem a pressão registrada', () => {
    expect(pendencias([pesos, th], 925)).toEqual([
      'Pressão informada sem barômetro nos padrões: escolha o barômetro usado ou apague a pressão.',
    ])
    expect(pendencias([pesos, th, br], null)).toEqual([
      'Barômetro escolhido sem a pressão registrada (tire BR-01 dos padrões ou registre a pressão).',
    ])
    expect(pendencias([pesos, th, br], 925)).toEqual([])
  })

  it('classe II: a pressão é obrigatória, medida com o barômetro', () => {
    expect(pendencias([pesos, th], null, 'II')).toEqual([
      'Balança classe II: registre a pressão atmosférica, medida com o barômetro (escolha-o nos padrões).',
    ])
    expect(pendencias([pesos, th, br], 1013, 'II')).toEqual([])
    // Sem a classe informada (quem chama não sabe a balança) ou noutra classe: opcional
    expect(pendencias([pesos, th], null, '')).toEqual([])
    expect(pendencias([pesos, th], null)).toEqual([])
  })
})

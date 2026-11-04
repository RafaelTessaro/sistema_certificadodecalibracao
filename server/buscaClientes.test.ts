// Busca de clientes pela API (é a busca global, Ctrl+K): por nome filtra de verdade, por CPF/CNPJ parcial também.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLIENTE_VAZIO } from '#shared/dominio.ts'
import { criarAppComLogin, type AppComLogin } from './auxiliaresTeste.ts'

let t: AppComLogin

beforeEach(async () => {
  t = await criarAppComLogin()
  // Sete clientes que vêm antes, na ordem alfabética, do que se procura (a paleta mostra só os 6 primeiros)
  for (const nome of [
    'Açougue Avenida',
    'Bar do Beto',
    'Casa do Pão',
    'Doceria Dália',
    'Empório Estrela',
    'Farmácia Flor',
    'Granja Gomes',
  ])
    await criar({ ...CLIENTE_VAZIO, tipo: 'PF', nome })
  await criar({ ...CLIENTE_VAZIO, tipo: 'PJ', nome: 'Mercado Bom Preço', documento: '11.222.333/0001-81' })
  await criar({ ...CLIENTE_VAZIO, tipo: 'PJ', nome: 'Supermercado Ideal', documento: '11.444.777/0001-61' })
})
afterEach(async () => {
  await t.fechar()
})

async function criar(payload: unknown) {
  const r = await t.chamar('POST', '/api/clientes', { cookie: t.cookieAdmin, payload })
  expect(r.statusCode, r.body).toBe(201)
}

async function buscar(busca: string): Promise<string[]> {
  const r = await t.chamar('GET', `/api/clientes?busca=${encodeURIComponent(busca)}`, { cookie: t.cookieAdmin })
  expect(r.statusCode, r.body).toBe(200)
  return (r.json().clientes as Array<{ nome: string }>).map((c) => c.nome)
}

describe('busca de clientes', () => {
  it('por nome devolve só os clientes com o nome (não o cadastro inteiro)', async () => {
    expect(await buscar('Ideal')).toEqual(['Supermercado Ideal'])
    expect(await buscar('Supermercado')).toEqual(['Supermercado Ideal'])
    expect(await buscar('mercado')).toEqual(['Mercado Bom Preço', 'Supermercado Ideal'])
    expect(await buscar('bom preco')).toEqual(['Mercado Bom Preço'])
  })

  it('nome que não existe e poucos algarismos não devolvem ninguém', async () => {
    expect(await buscar('xyzinexistente')).toEqual([])
    expect(await buscar('12')).toEqual([])
  })

  it('CPF/CNPJ parcial continua achando', async () => {
    expect(await buscar('222.333')).toEqual(['Mercado Bom Preço'])
    expect(await buscar('11444777')).toEqual(['Supermercado Ideal'])
  })

  it('sem busca, a lista é o cadastro inteiro em ordem alfabética', async () => {
    const todos = await buscar('')
    expect(todos).toHaveLength(9)
    expect(todos[0]).toBe('Açougue Avenida')
  })
})

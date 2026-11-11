// Voltar uma cópia do banco (`transplantarRegistros`): a calibração em andamento que na cópia tinha a dispensa da folha
// de antes da 1.0.5 (`pressaoComoAviso`, `cargasDoEmaNaFolha`) e que, depois da cópia, passou a ter uma folha da 1.0.5
// (a folha nova ou a ligada no lugar da de antes) fica sem a dispensa que o banco atual tinha tirado: medida com a
// folha nova (pressão ●), nunca volta a ter a falta da pressão só como aviso.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BALANCA_VAZIA, CLIENTE_VAZIO, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { Balanca, Calibracao, Cliente } from '#shared/tipos.ts'
import { type AppComLogin, criarAppComLogin } from './auxiliaresTeste.ts'
import { abrirBanco, type Banco } from './db.ts'
import { transplantarRegistros } from './usuarios.ts'

let t: AppComLogin
let cliente: Cliente
let balanca: Balanca

async function criar(url: string, payload: unknown) {
  const r = await t.chamar('POST', url, { cookie: t.cookieAdmin, payload })
  if (r.statusCode !== 201 && r.statusCode !== 200) throw new Error(`${url}: ${r.statusCode} ${r.body}`)
  return r.json()
}

beforeEach(async () => {
  t = await criarAppComLogin()
  cliente = (
    await criar('/api/clientes', {
      ...CLIENTE_VAZIO,
      tipo: 'PJ',
      nome: 'Mercado Bom Preço',
      razaoSocial: 'MERCADO BOM PRECO LTDA',
      documento: '11.444.777/0001-61',
      logradouro: 'Avenida 1',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Rio Claro',
      uf: 'SP',
      cep: '13500-000',
    })
  ).cliente
  balanca = (
    await criar('/api/balancas', {
      ...BALANCA_VAZIA,
      clienteId: cliente.id,
      fabricante: 'Toledo',
      modelo: '9094',
      numeroSerie: 'TL-2231',
      faixas: [{ max: 30, e: 0.01, d: 0.01 }],
    })
  ).balanca
  await criar('/api/padroes', {
    ...PADRAO_VAZIO,
    identificacao: 'JP-01',
    descricao: 'Jogo de pesos M1 1 kg a 10 kg',
    classe: 'M1',
    certificado: 'LAB-0456/2026',
    laboratorio: 'Laboratório de Massa Exemplo',
    dataCalibracao: '2026-01-10',
    validade: '2099-01-10',
    pesos: [{ id: 'p10a', marca: 'A', nominal: 10000, correcao: 40, incerteza: 160, k: 2 }],
  })
  await criar('/api/padroes', {
    ...PADRAO_VAZIO,
    tipo: 'BAROMETRO',
    identificacao: 'BR-90',
    descricao: 'Barômetro digital',
    certificado: 'LAB-0789/2026',
    laboratorio: 'Laboratório de Pressão Exemplo',
    dataCalibracao: '2026-01-10',
    validade: '2099-01-10',
  })
})
afterEach(async () => {
  await t.fechar()
})

const rascunho = async (os: string): Promise<Calibracao> =>
  (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id, ordemServico: os })).calibracao
const imprimir = (id: string, nova = '') =>
  t.chamar('GET', `/api/calibracoes/${id}/folha-campo${nova ? `?nova=${nova}` : ''}`, { cookie: t.cookieAdmin })
const ligar = (id: string, numero: string) =>
  t.chamar('PUT', `/api/calibracoes/${id}/folha-campo`, { cookie: t.cookieAdmin, payload: { numero } })
const avulsa = async () =>
  (await t.chamar('GET', `/api/folha-campo?balancaId=${balanca.id}`, { cookie: t.cookieAdmin })).headers[
    'x-folha-campo'
  ] as string

/** O rascunho com a folha impressa pela 1.0.4 e a dispensa que a migração 19/20 deu a ele. */
async function comFolhaDeAntes(os: string) {
  const k = await rascunho(os)
  const folha = (await imprimir(k.id)).headers['x-folha-campo'] as string
  t.ctx.db.prepare('UPDATE folhas_campo SET antes_105 = 1 WHERE numero = ?').run(folha)
  t.ctx.db
    .prepare(
      "UPDATE calibracoes SET dados = json_set(dados, '$.pressaoComoAviso', json('true'), '$.cargasDoEmaNaFolha', json('true')) WHERE id = ?",
    )
    .run(k.id)
  return { k, folha }
}

const marcas = (db: Banco, id: string) => {
  const k = JSON.parse(
    (db.prepare('SELECT dados FROM calibracoes WHERE id = ?').get(id) as { dados: string }).dados,
  ) as Calibracao
  return { pressaoComoAviso: k.pressaoComoAviso, cargasDoEmaNaFolha: k.cargasDoEmaNaFolha, versao: k.versao }
}
const vigente = (db: Banco, id: string) =>
  (
    db.prepare("SELECT numero FROM folhas_campo WHERE calibracao_id = ? AND substituida_por = ''").all(id) as Array<{
      numero: string
    }>
  ).map((f) => f.numero)

describe('voltar uma cópia: a dispensa da folha de antes segue a folha vigente', { timeout: 60_000 }, () => {
  it('a folha da 1.0.5 impressa ou ligada depois da cópia: as marcas que o banco atual tirou saem também da cópia', async () => {
    // Na cópia, as três com a folha de antes e a dispensa
    const nova = await comFolhaDeAntes('OS 1')
    const ligada = await comFolhaDeAntes('OS 2')
    const ficou = await comFolhaDeAntes('OS 3')
    const copia = await t.ctx.backups.copiar('manual')
    // Depois da cópia: a folha nova da calibração (pede a pressão ●; as cargas do EMA saem nela e ficam)…
    const fNova = (await imprimir(nova.k.id, 'a1b2c3d4-0000-4000-8000-0000000001a1')).headers['x-folha-campo'] as string
    expect(marcas(t.ctx.db, nova.k.id)).toMatchObject({ pressaoComoAviso: undefined, cargasDoEmaNaFolha: true })
    // …e a avulsa da 1.0.5 ligada no lugar da de antes (as duas marcas saem)
    const fLigada = await avulsa()
    const r = await ligar(ligada.k.id, fLigada)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().marcasRetiradas).toEqual({ pressaoComoAviso: false, cargasDoEmaNaFolha: false })
    const versaoNaCopia = marcas(t.ctx.db, ficou.k.id).versao

    const destino = abrirBanco(copia)
    try {
      expect(marcas(destino, nova.k.id)).toMatchObject({ pressaoComoAviso: true, cargasDoEmaNaFolha: true })
      expect(transplantarRegistros(t.ctx.db, destino).folhasCampo).toBe(2)
      expect(vigente(destino, nova.k.id)).toEqual([fNova])
      expect(vigente(destino, ligada.k.id)).toEqual([fLigada])
      // Como no banco atual: a pressão volta a ser obrigatória; as cargas do EMA ficam só com a folha nova dela
      expect(marcas(destino, nova.k.id)).toMatchObject({ pressaoComoAviso: undefined, cargasDoEmaNaFolha: true })
      expect(marcas(destino, ligada.k.id)).toMatchObject({ pressaoComoAviso: undefined, cargasDoEmaNaFolha: undefined })
      // A que continua com a folha de antes fica com a dispensa (e a versão não muda)
      expect(vigente(destino, ficou.k.id)).toEqual([ficou.folha])
      expect(marcas(destino, ficou.k.id)).toEqual({ pressaoComoAviso: true, cargasDoEmaNaFolha: true, versao: versaoNaCopia })
      // O registro de atividades da cópia diz quais
      const registros = (
        destino.prepare("SELECT detalhe FROM auditoria WHERE acao = 'COPIA_RESTAURADA' ORDER BY id").all() as Array<{
          detalhe: string
        }>
      ).map((x) => x.detalhe)
      expect(registros.at(-1)).toBe(
        `as folhas ${fNova}, ${fLigada}, da 1.0.5, são as vigentes: a dispensa da folha de antes saiu das calibrações delas, como no banco atual (a pressão volta a ser obrigatória; as cargas em que o EMA muda, só com a declaração de conformidade)`,
      )
    } finally {
      destino.close()
    }
  })

  it('com leituras medidas na cópia (a visita pode ter sido feita com a folha de antes), a dispensa fica', async () => {
    const { k } = await comFolhaDeAntes('OS 1')
    const copia = await t.ctx.backups.copiar('manual')
    await imprimir(k.id, 'a1b2c3d4-0000-4000-8000-0000000001b1')
    expect(marcas(t.ctx.db, k.id).pressaoComoAviso).toBeUndefined()
    const destino = abrirBanco(copia)
    try {
      // Na cópia, a repetibilidade já tinha leituras (digitadas da folha de antes)
      destino
        .prepare(
          `UPDATE calibracoes SET dados = json_set(dados, '$.repetibilidade', json('[{"id":"r","carga":15,"leituras":[15,15,15,15,15]}]')) WHERE id = ?`,
        )
        .run(k.id)
      transplantarRegistros(t.ctx.db, destino)
      expect(marcas(destino, k.id)).toMatchObject({ pressaoComoAviso: true, cargasDoEmaNaFolha: true })
    } finally {
      destino.close()
    }
  })
})

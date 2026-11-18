import { beforeEach, describe, expect, it } from 'vitest'
import { calcularSha256Registro, sha256Hex } from '../../../shared/campo/canonico.ts'
import {
  APARELHO_EXEMPLO,
  pacotePlataforma,
  pacoteRodoviaria,
  registroPlataforma,
  TECNICO_EXEMPLO,
} from '../../../shared/campo/exemplos.ts'
import { ClienteCampo } from './cliente.ts'
import { comecar, ErroFolha } from './folha.ts'
import type { FolhaLocal } from './folha.ts'
import { relogioFixo } from './relogio.ts'
import { META, RepositorioMemoria } from './repositorio.ts'
import { frasesDoResultado, sincronizar } from './sincronia.ts'
import { ServidorFalso, TOKEN_TESTE } from './testes/servidorFalso.ts'

const PLATAFORMA = pacotePlataforma()
const RODOVIARIA = pacoteRodoviaria()

let servidor: ServidorFalso
let repo: RepositorioMemoria
let relogio: ReturnType<typeof relogioFixo>
const sync = () =>
  sincronizar({
    repositorio: repo,
    api: new ClienteCampo({ endereco: 'http://192.168.0.10:4850', token: TOKEN_TESTE }, servidor, relogio),
    relogio,
    sha256: sha256Hex,
    versaoApp: '1.1.0',
  })

beforeEach(() => {
  servidor = new ServidorFalso()
  repo = new RepositorioMemoria()
  relogio = relogioFixo('2026-11-18T10:58:00.000Z')
})

/** Coloca no celular uma folha finalizada e assinada (o registro completo dos exemplos). */
async function folhaFinalizadaNoCelular(): Promise<FolhaLocal> {
  servidor.enviarFolha(PLATAFORMA)
  await sync()
  const f = (await repo.obter(PLATAFORMA.envioId))!
  const r = registroPlataforma()
  const finalizada: FolhaLocal = { ...f, estado: 'FINALIZADA', registro: r }
  await repo.gravar(finalizada)
  return finalizada
}

describe('sincronia', () => {
  it('baixa as folhas novas, confirma o recebimento e só então elas podem ser começadas', async () => {
    servidor.enviarFolha(PLATAFORMA)
    servidor.enviarFolha(RODOVIARIA)
    const r = await sync()
    expect(r.conectou).toBe(true)
    expect(r.falha).toBeNull()
    expect(r.novas.sort()).toEqual([PLATAFORMA.folha.numero, RODOVIARIA.folha.numero].sort())
    const folhas = await repo.listar()
    expect(folhas.map((f) => f.estado)).toEqual(['NOVA', 'NOVA'])
    expect(servidor.envios.get(PLATAFORMA.envioId)?.situacao).toBe('NO_CELULAR')
    // Cabeçalhos de toda chamada do celular
    const cab = servidor.cabecalhos[0]
    expect(cab.authorization).toBe(`Bearer ${TOKEN_TESTE}`)
    expect(cab['x-bc-calibracao']).toBe('1')
    expect(cab['x-bc-agora']).toBe('2026-11-18T07:58:00-03:00')
    expect(r.relogioDiferencaMs).toBe(-120_000)
    // Segunda rodada: nada a baixar
    servidor.pedidos = []
    await sync()
    expect(servidor.pedidos).toEqual(['POST /api/campo/ola'])
    expect(JSON.parse((await repo.lerMeta(META.ultimaSincronia))!).conectou).toBe(true)
  })

  it('o Wi-Fi cai entre o download e a confirmação: a folha não pode ser começada; na volta, confirma sem baixar de novo', async () => {
    servidor.enviarFolha(PLATAFORMA)
    servidor.cairNaChamada = 3 // olá, pacote, recebida
    const r = await sync()
    expect(r.falha?.tipo).toBe('REDE')
    const f = (await repo.obter(PLATAFORMA.envioId))!
    expect(f.estado).toBe('RECEBENDO')
    expect(() => comecar(f, TECNICO_EXEMPLO, APARELHO_EXEMPLO, relogio.agora())).toThrow(ErroFolha)
    servidor.pedidos = []
    const r2 = await sync()
    expect(servidor.pedidos).toEqual(['POST /api/campo/ola', `POST /api/campo/envios/${PLATAFORMA.envioId}/recebida`])
    expect(r2.novas).toEqual([PLATAFORMA.folha.numero])
    expect((await repo.obter(PLATAFORMA.envioId))!.estado).toBe('NOVA')
  })

  it('recolher: a não começada sai do celular e o servidor é avisado; a começada fica ("Já comecei")', async () => {
    servidor.enviarFolha(PLATAFORMA)
    servidor.enviarFolha(RODOVIARIA)
    await sync()
    const rod = (await repo.obter(RODOVIARIA.envioId))!
    await repo.gravar(comecar(rod, TECNICO_EXEMPLO, APARELHO_EXEMPLO, relogio.agora()))
    servidor.recolher(PLATAFORMA.envioId)
    servidor.recolher(RODOVIARIA.envioId)
    const r = await sync()
    expect(r.retiradas).toEqual([PLATAFORMA.folha.numero])
    expect(await repo.obter(PLATAFORMA.envioId)).toMatchObject({ estado: 'RETIRADA', pacote: null, avisoRetiradaVisto: false })
    expect(servidor.envios.get(PLATAFORMA.envioId)).toMatchObject({ situacao: 'RECOLHIDA', respostaRecolher: 'APAGUEI' })
    const r2 = (await repo.obter(RODOVIARIA.envioId))!
    expect(r2).toMatchObject({ estado: 'EM_PREENCHIMENTO', respondeuJaComecei: true })
    expect(r2.registro).not.toBeNull()
    expect(servidor.envios.get(RODOVIARIA.envioId)?.respostaRecolher).toBe('JA_COMECEI')
    expect(frasesDoResultado(r)).toContain(`A ${PLATAFORMA.folha.numero} foi retirada pelo escritório.`)
  })

  it('recolhida antes de o celular baixar: nem chega ao celular', async () => {
    servidor.enviarFolha(PLATAFORMA)
    servidor.recolher(PLATAFORMA.envioId)
    await sync()
    expect(await repo.listar()).toEqual([])
  })

  it('desconhecida do servidor: a não começada sai sem aviso; a começada e finalizada é entregue (órfã)', async () => {
    servidor.enviarFolha(RODOVIARIA)
    const finalizada = await folhaFinalizadaNoCelular()
    expect((await repo.obter(RODOVIARIA.envioId))?.estado).toBe('NOVA')
    servidor.esquecer(RODOVIARIA.envioId)
    servidor.esquecer(finalizada.envioId)
    const r = await sync()
    expect(await repo.obter(RODOVIARIA.envioId)).toMatchObject({
      estado: 'RETIRADA',
      motivoRetirada: 'DESCONHECIDO',
      avisoRetiradaVisto: true,
    })
    expect(r.entregues.map((e) => e.numero)).toEqual([finalizada.numero])
    expect([...servidor.registros.values()][0].recibo.marcas).toEqual(['ORFAO'])
  })

  it('entrega: a folha só sai do celular com o recibo que confere; fica o resumo', async () => {
    const f = await folhaFinalizadaNoCelular()
    const sha = calcularSha256Registro(f.registro!, sha256Hex)
    const r = await sync()
    expect(r.entregues).toEqual([{ numero: f.numero, recebidoEm: servidor.agoraServidor }])
    const depois = (await repo.obter(f.envioId))!
    expect(depois).toMatchObject({ estado: 'ENTREGUE', registro: null, pacote: null, entregueEm: relogio.agora() })
    expect(depois.recibo?.sha256).toBe(sha)
    expect(depois.resumo.cliente).toBe(f.resumo.cliente)
    expect(servidor.envios.get(f.envioId)?.situacao).toBe('DEVOLVIDA')
    expect(await repo.lerMeta(META.ultimaEntrega)).toBe(relogio.agora())
  })

  it('a rede cai DEPOIS de o servidor gravar: nada é apagado; reenviar recebe o mesmo recibo', async () => {
    const f = await folhaFinalizadaNoCelular()
    servidor.cairDepoisDeGravar = 1
    const r1 = await sync()
    expect(r1.entregues).toEqual([])
    expect(r1.naoEntregues[0].numero).toBe(f.numero)
    expect(servidor.registros.size).toBe(1)
    const guardada = (await repo.obter(f.envioId))!
    expect(guardada.estado).toBe('FINALIZADA')
    expect(guardada.registro).toEqual(f.registro)
    expect(guardada.entrega).toMatchObject({ tentativas: 1 })
    expect(guardada.entrega.erro).toMatch(/caiu/)
    const r2 = await sync()
    expect(servidor.registros.size).toBe(1)
    expect(r2.entregues.map((e) => e.numero)).toEqual([f.numero])
    expect((await repo.obter(f.envioId))!.estado).toBe('ENTREGUE')
  })

  it('recibo que não confere: a folha continua no celular', async () => {
    const f = await folhaFinalizadaNoCelular()
    servidor.reciboErrado = true
    const r = await sync()
    expect(r.naoEntregues[0].motivo).toMatch(/não confere/)
    expect((await repo.obter(f.envioId))!.estado).toBe('FINALIZADA')
  })

  it('fora da rede da empresa: nada muda no celular', async () => {
    const f = await folhaFinalizadaNoCelular()
    servidor.foraDoAr = true
    const r = await sync()
    expect(r.conectou).toBe(false)
    expect(r.falha?.mensagem).toMatch(/Servidor não encontrado em http:\/\/192\.168\.0\.10:4850/)
    expect(await repo.obter(f.envioId)).toEqual(f)
  })

  it('descadastrado: não recebe folhas, mas entrega as finalizadas (o servidor marca)', async () => {
    const f = await folhaFinalizadaNoCelular()
    servidor.enviarFolha(RODOVIARIA)
    servidor.descadastrado = true
    const r = await sync()
    expect(r.descadastrado).toBe(true)
    expect(r.entregues.map((e) => e.numero)).toEqual([f.numero])
    expect([...servidor.registros.values()][0].recibo.marcas).toEqual(['APARELHO_REVOGADO'])
    expect(await repo.obter(RODOVIARIA.envioId)).toBeNull()
  })

  it('descadastrado como roubado: a entrega é recusada e a folha fica guardada', async () => {
    const f = await folhaFinalizadaNoCelular()
    servidor.descadastrado = true
    servidor.roubado = true
    const r = await sync()
    expect(r.descadastrado).toBe(true)
    expect(r.naoEntregues[0].motivo).toMatch(/descadastrado/)
    expect((await repo.obter(f.envioId))!.estado).toBe('FINALIZADA')
  })

  it('token desconhecido: "parear de novo", nada é apagado', async () => {
    const f = await folhaFinalizadaNoCelular()
    servidor.tokenDesconhecido = true
    const r = await sync()
    expect(r.naoPareado).toBe(true)
    expect(r.falha).toMatchObject({ tipo: 'HTTP', codigo: 'NAO_PAREADO' })
    expect(await repo.obter(f.envioId)).toEqual(f)
  })

  it('o resumo da entregue sai do celular depois de 7 dias', async () => {
    const f = await folhaFinalizadaNoCelular()
    await sync()
    relogio.avancar(6 * 86_400_000)
    await sync()
    expect((await repo.obter(f.envioId))?.estado).toBe('ENTREGUE')
    relogio.avancar(2 * 86_400_000)
    await sync()
    expect(await repo.obter(f.envioId)).toBeNull()
  })

  it('a versão nova do app chega no olá', async () => {
    servidor.appDisponivel = { versao: '1.2.0', url: '/api/campo/apk' }
    const r = await sync()
    expect(r.appDisponivel).toEqual({ versao: '1.2.0', url: '/api/campo/apk' })
  })
})

// Gravação automática do rascunho: uma de cada vez. Um PUT lento (Wi-Fi fraco no galpão) não pode ser seguido de
// outro com a mesma versão (o servidor recusaria com 409, um falso "outra pessoa alterou esta calibração").

import { describe, expect, it } from 'vitest'
import { criarFilaGravacao } from './filaGravacao'

/** Um servidor de mentira: cada PUT confere a versão (como `atualizarCalibracao`) e responde depois de `atraso` ms. */
function cenario(atraso = 20) {
  const servidor = { versao: 5, dados: '', puts: [] as Array<{ versao: number; dados: string; status: number }> }
  const tela = { dados: '', versao: 5, sujo: false, emVoo: 0, maxEmVoo: 0 }
  const fila = criarFilaGravacao(
    async () => {
      const dados = tela.dados
      const versao = tela.versao
      tela.sujo = false
      tela.emVoo++
      tela.maxEmVoo = Math.max(tela.maxEmVoo, tela.emVoo)
      await new Promise((r) => setTimeout(r, atraso))
      tela.emVoo--
      if (versao !== servidor.versao) {
        servidor.puts.push({ versao, dados, status: 409 })
        tela.sujo = true
        return false
      }
      servidor.versao++
      servidor.dados = dados
      servidor.puts.push({ versao, dados, status: 200 })
      tela.versao = servidor.versao
      return true
    },
    () => tela.sujo,
  )
  const digitar = (texto: string) => {
    tela.dados += texto
    tela.sujo = true
  }
  return { servidor, tela, fila, digitar }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('fila de gravação', () => {
  it('sem nada pendente, não grava', async () => {
    const { servidor, fila } = cenario()
    expect(await fila.salvar()).toBe(true)
    expect(servidor.puts).toEqual([])
  })

  it('digitou de novo durante um PUT lento: o segundo espera o primeiro e vai com a versão nova (nada de 409)', async () => {
    const { servidor, tela, fila, digitar } = cenario(30)
    digitar('Leitura 4;')
    const primeira = fila.salvar()
    await esperar(5)
    digitar('Leitura 5;')
    const segunda = fila.salvar() // o timer de 1 s com o primeiro PUT ainda no ar
    expect(fila.ocupada()).toBe(true)
    expect(await primeira).toBe(true)
    expect(await segunda).toBe(true)
    expect(servidor.puts.map((p) => [p.versao, p.status])).toEqual([
      [5, 200],
      [6, 200],
    ])
    expect(servidor.dados).toBe('Leitura 4;Leitura 5;')
    expect(tela.maxEmVoo).toBe(1)
    expect(fila.ocupada()).toBe(false)
  })

  it('várias chamadas durante o PUT: uma gravação só depois dele, com tudo o que foi digitado', async () => {
    const { servidor, fila, digitar } = cenario(20)
    digitar('a')
    const p1 = fila.salvar()
    digitar('b')
    const p2 = fila.salvar()
    digitar('c')
    const p3 = fila.salvar()
    expect(await Promise.all([p1, p2, p3])).toEqual([true, true, true])
    expect(servidor.puts.map((p) => p.dados)).toEqual(['a', 'abc'])
  })

  it('emitir (ou mudar a situação, imprimir a folha) espera a gravação em andamento antes de usar a versão', async () => {
    const { tela, fila, digitar } = cenario(30)
    digitar('Leitura 5;')
    void fila.salvar()
    await esperar(5)
    // Nada novo digitado: só espera o PUT em andamento, sem gravar de novo
    expect(await fila.salvar()).toBe(true)
    expect(tela.versao).toBe(6)
    expect(tela.emVoo).toBe(0)
  })

  it('a gravação em andamento falhou: quem esperava recebe false e o que ficou pendente não é mandado', async () => {
    const { servidor, tela, fila, digitar } = cenario(20)
    servidor.versao = 9 // outra pessoa gravou mesmo
    digitar('x')
    const p1 = fila.salvar()
    digitar('y')
    const p2 = fila.salvar()
    expect(await p1).toBe(false)
    expect(await p2).toBe(false)
    expect(servidor.puts.map((p) => p.status)).toEqual([409])
    expect(tela.sujo).toBe(true)
  })

  it('gravar que lança erro conta como falha e libera a fila', async () => {
    let n = 0
    const fila = criarFilaGravacao(
      async () => {
        n++
        if (n === 1) throw new Error('rede')
        return true
      },
      () => true,
    )
    expect(await fila.salvar()).toBe(false)
    expect(fila.ocupada()).toBe(false)
    expect(await fila.salvar()).toBe(true)
  })
})

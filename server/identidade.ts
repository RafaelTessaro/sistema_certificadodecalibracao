// Identidade do servidor para o programa das estações (instalador/estacao), informada em GET /api/saude.
//
// - id: aleatório, criado na primeira vez e guardado em <pastaDados>/id-da-instalacao.txt. Acompanha os
//   dados: continua o mesmo numa atualização, numa troca de IP ou de nome do computador e quando a pasta de
//   dados é levada para outro computador. Cada estação guarda o id do servidor que usa e só abre, sem
//   perguntar, um servidor com esse id.
// - instancia: aleatória a cada início do processo, nunca guardada. Duas respostas com a mesma instância vêm
//   do mesmo processo (um servidor com duas placas de rede é um só); com instâncias diferentes são dois
//   servidores, mesmo que tenham o mesmo nome e o mesmo id (uma cópia do disco ou da máquina virtual).
// Não são segredos nem servem de senha: só distinguem um servidor do outro na rede da empresa.

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FORMATO = /^[0-9a-f]{32}$/

export const ARQUIVO_ID = 'id-da-instalacao.txt'

/** Lê o id desta instalação, criando-o na primeira vez. `avisar` recebe o erro se não der para gravar. */
export function idDaInstalacao(pastaDados: string, avisar: (mensagem: string) => void = () => {}): string {
  const arquivo = join(pastaDados, ARQUIVO_ID)
  try {
    const id = readFileSync(arquivo, 'utf8').trim().toLowerCase()
    if (FORMATO.test(id)) return id
  } catch {
    /* ainda não existe */
  }
  const novo = randomBytes(16).toString('hex')
  try {
    mkdirSync(pastaDados, { recursive: true })
    writeFileSync(arquivo, novo + '\n')
  } catch (e) {
    avisar(`não foi possível gravar ${arquivo}: ${(e as Error).message}. As estações vão estranhar o servidor a cada reinício.`)
  }
  return novo
}

/** Instância deste processo (nova a cada início). */
export const novaInstancia = () => randomBytes(16).toString('hex')

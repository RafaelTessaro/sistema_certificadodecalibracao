// O APK do app do celular (app BC Calibração, celular), que vem no instalador do sistema: fica na pasta `campo/` da
// instalação, ao lado de server/ e dist/ (payload/campo/BC-Calibracao-<versão>.apk; ver scripts/empacotar-windows.sh), e
// o servidor o entrega pela rede interna (GET /api/campo/apk, pública: a primeira instalação é pelo navegador do celular)
// com as informações dele (GET /api/campo/apk/info). Sem o arquivo (o release saiu sem o APK), `disponivel: false` e o
// download responde 404 com uma frase clara.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type InfoApk, nomeArquivoApk, versaoMaisNova, versionCode } from '#shared/campo/protocolo.ts'

/** A pasta do APK na instalação: <raiz>/campo (a raiz é a pasta com server/, shared/ e dist/). */
export const PASTA_APK_PADRAO = fileURLToPath(new URL('../../campo/', import.meta.url))

/** "BC-Calibracao-1.1.0.apk", "BC-Calibracao-1.1.0+1.apk". */
const NOME_APK = /^BC-Calibracao-(\d{1,3}\.\d{1,3}\.\d{1,3}(?:\+\d{1,2})?)\.apk$/

export const SEM_APK: InfoApk = { disponivel: false, versao: '', versionCode: 0, tamanho: 0, sha256: '', nomeArquivo: '' }

export const MENSAGEM_SEM_APK =
  'O instalador desta versão não trouxe o app do celular. Instale o app pelo cabo (veja o LEIA-ME) ou atualize o sistema.'

export class ApkDoCampo {
  private pasta: string
  /** sha256 do arquivo, pelo caminho, tamanho e data (o arquivo não muda com o servidor ligado; troca na atualização). */
  private cache: { chave: string; info: InfoApk } | null = null

  constructor(pasta: string = PASTA_APK_PADRAO) {
    this.pasta = pasta
  }

  /** O APK mais novo da pasta (pela versão no nome), ou null. */
  private arquivo(): { caminho: string; versao: string; tamanho: number; mtime: number } | null {
    if (!existsSync(this.pasta)) return null
    let melhor: { caminho: string; versao: string; tamanho: number; mtime: number } | null = null
    for (const nome of readdirSync(this.pasta)) {
      const m = NOME_APK.exec(nome)
      if (!m || versionCode(m[1]) === null) continue
      const caminho = join(this.pasta, nome)
      let st
      try {
        st = statSync(caminho)
      } catch {
        continue
      }
      if (!st.isFile() || st.size === 0) continue
      if (!melhor || versaoMaisNova(m[1], melhor.versao)) melhor = { caminho, versao: m[1], tamanho: st.size, mtime: st.mtimeMs }
    }
    return melhor
  }

  info(): InfoApk {
    const a = this.arquivo()
    if (!a) return SEM_APK
    const chave = `${a.caminho}|${a.tamanho}|${a.mtime}`
    if (this.cache?.chave === chave) return this.cache.info
    const sha256 = createHash('sha256').update(readFileSync(a.caminho)).digest('hex')
    const info: InfoApk = {
      disponivel: true,
      versao: a.versao,
      versionCode: versionCode(a.versao) ?? 0,
      tamanho: a.tamanho,
      sha256,
      nomeArquivo: nomeArquivoApk(a.versao),
    }
    this.cache = { chave, info }
    return info
  }

  /** O arquivo e as informações; null sem APK. */
  ler(): { conteudo: Buffer; info: InfoApk } | null {
    const a = this.arquivo()
    if (!a) return null
    return { conteudo: readFileSync(a.caminho), info: this.info() }
  }
}

/** Limite simples por IP (janela fixa), para as rotas públicas do APK. */
export class LimitePorIp {
  private contagens = new Map<string, { inicio: number; n: number }>()
  private maximo: number
  private janelaMs: number
  private agora: () => number

  constructor(maximo: number, janelaMs: number, agora: () => number = Date.now) {
    this.maximo = maximo
    this.janelaMs = janelaMs
    this.agora = agora
  }

  /** Conta o pedido; devolve os segundos de espera quando passou do limite, ou null. */
  contar(ip: string): number | null {
    const agora = this.agora()
    if (this.contagens.size > 5000)
      for (const [k, v] of this.contagens) if (agora - v.inicio >= this.janelaMs) this.contagens.delete(k)
    let c = this.contagens.get(ip)
    if (!c || agora - c.inicio >= this.janelaMs) {
      c = { inicio: agora, n: 0 }
      this.contagens.set(ip, c)
    }
    c.n++
    return c.n > this.maximo ? Math.max(1, Math.ceil((c.inicio + this.janelaMs - agora) / 1000)) : null
  }
}

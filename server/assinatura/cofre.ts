// O cofre do certificado digital da empresa (PLANO §2.3): <pasta de dados>/certificado-digital.json, fora do banco (como o
// email.json), então nada do segredo vai nas cópias diárias do banco. A chave privada (PKCS#8) vai cifrada; o certificado e a
// cadeia (públicos) vão abertos, para a tela e para recriar a linha do banco. A senha do .pfx e o .pfx original não são
// guardados.
//
// No Windows a chave é cifrada pelo próprio Windows (DPAPI, escopo da máquina) pelo Windows PowerShell 5.1 que vem com ele,
// com o script ferramentas\protecao-windows.ps1 da pasta do programa (Program Files, onde só administradores gravam). Os
// dados entram e saem em base64 pela entrada e saída padrão: nunca pela linha de comando nem em arquivo temporário.
//
// O escopo da máquina (que segue valendo se o serviço trocar entre LocalService e LocalSystem) deixa QUALQUER conta do
// computador abrir o que ele cifrou, e o resto da entropia (o sha256) está aberto no próprio arquivo. Por isso a entropia
// leva também um segredo aleatório de 32 bytes guardado FORA da pasta de dados, em certificado-digital.segredo na pasta de
// cima (`protetorComSegredo`): a cópia da pasta "dados" (pen drive, rede, pasta sincronizada) não abre em outro computador
// nem, no próprio servidor, por uma conta que não é administradora. A pasta de cima (C:\ProgramData\BC Calibracao) só é
// lida por SYSTEM, Administradores e a conta LocalService (S-1-5-19, o ACL do instalador), que NÃO é só deste serviço: todo
// serviço que roda como LocalService no servidor também lê o segredo e, com o DPAPI da máquina, abre a chave. Fora do
// Windows (testes e desenvolvimento), AES-256-GCM com uma chave de teste, também fora da pasta de dados.
//
// Regra: um protetor que falha nunca deixa nada aberto no disco. O arquivo é gravado num temporário e renomeado só depois
// de a proteção ser conferida (reaberta e comparada).

import { execFile } from 'node:child_process'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  type KeyObject,
  randomBytes,
  X509Certificate,
} from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { A1ParaAssinar } from './contrato.ts'
import { dadosDoCertificado } from './pfx.ts'

export type NomeProtecao = 'dpapi-maquina' | 'aes-teste'

/** Quem cifra a chave guardada. A `entropia` entra na proteção: o arquivo só abre com a mesma. */
export interface Protetor {
  nome: NomeProtecao
  proteger(dados: Buffer, entropia: Buffer): Promise<Buffer>
  abrir(dados: Buffer, entropia: Buffer): Promise<Buffer>
}

/**
 * Falha do cofre: a mensagem pode ir para a tela do administrador (nunca traz a chave nem a entrada); `detalhe` (a primeira
 * linha do erro do PowerShell, sem os dados) vai só para o registro do servidor. `naoAbre`: o arquivo existe, mas não abre
 * com este computador (outro computador, Windows reinstalado, arquivo alterado).
 */
export class ErroCofre extends Error {
  detalhe: string
  naoAbre: boolean
  constructor(mensagem: string, o: { detalhe?: string; naoAbre?: boolean } = {}) {
    super(mensagem)
    this.name = 'ErroCofre'
    this.detalhe = o.detalhe ?? ''
    this.naoAbre = !!o.naoAbre
  }
}

/**
 * A mensagem de quando o cofre não abre no servidor (a tela mostra no cartão da situação NAO_ABRE). Não afirma uma causa
 * só: a mesma recusa vem do cofre de outro servidor, do Windows reinstalado, do segredo de fora da pasta de dados ausente
 * ou danificado e de um antivírus ou EDR barrando o PowerShell (o `detalhe` de cada caso vai para o registro do servidor).
 */
export const MSG_NAO_ABRE =
  'O certificado guardado não abre neste servidor (instalado em outro servidor, Windows reinstalado ou proteção do ' +
  'Windows bloqueada). Envie o arquivo .pfx de novo; se o erro continuar, veja o registro do servidor.'

export const ENTROPIA_PREFIXO = 'BC Calibracao A1 v1|'

/**
 * A entropia do DPAPI (e o AAD do AES de teste): presa ao certificado guardado. Ela é pública (o sha256 está no arquivo); no
 * servidor, `protetorComSegredo` junta a ela o segredo de fora da pasta de dados.
 */
export const entropiaDoCofre = (sha256: string) => Buffer.from(`${ENTROPIA_PREFIXO}${sha256}`, 'utf8')

export const TEMPO_LIMITE_DPAPI_MS = 20_000

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

// ---- DPAPI pelo Windows PowerShell 5.1 ---------------------------------------------------------------------------

/** A pasta do programa (a de server/ e ferramentas/ instalados). */
const PASTA_PROGRAMA = fileURLToPath(new URL('../../', import.meta.url))

/**
 * O protecao-windows.ps1: o da pasta do programa (instalado em Program Files\BC Calibracao\ferramentas); numa cópia do
 * código-fonte (desenvolvimento e o teste no Windows do CI), o de instalador/ferramentas.
 */
export function caminhoScriptProtecao(pastaPrograma = PASTA_PROGRAMA): string {
  const instalado = join(pastaPrograma, 'ferramentas', 'protecao-windows.ps1')
  if (existsSync(instalado)) return instalado
  const fonte = join(pastaPrograma, 'instalador', 'ferramentas', 'protecao-windows.ps1')
  return existsSync(fonte) ? fonte : instalado
}

/** O powershell.exe do Windows (caminho absoluto: não depende do PATH). */
export const powershellDoWindows = () =>
  join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

export function comandoDpapi(
  acao: 'proteger' | 'abrir',
  script: string,
  powershell = powershellDoWindows(),
): { arquivo: string; argumentos: string[] } {
  return {
    arquivo: powershell,
    argumentos: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, acao],
  }
}

/** A primeira linha útil do erro do PowerShell (sem o XML que ele às vezes escreve), curta, para o registro do servidor. */
function primeiraLinha(texto: string): string {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#<') && !l.startsWith('<'))
  return (linhas[0] ?? '').slice(0, 200)
}

export interface OpcoesDpapi {
  /** O executável do PowerShell (os testes fora do Windows trocam por um falso). */
  powershell?: string
  tempoLimiteMs?: number
}

/**
 * DPAPI com escopo da máquina pelo protecao-windows.ps1. Entrada: duas linhas em base64 (os dados e a entropia); saída: o
 * resultado em base64. A mensagem de erro nunca traz a entrada.
 */
export function protetorDpapi(script = caminhoScriptProtecao(), o: OpcoesDpapi = {}): Protetor {
  const tempoLimite = o.tempoLimiteMs ?? TEMPO_LIMITE_DPAPI_MS
  const rodar = (acao: 'proteger' | 'abrir', dados: Buffer, entropia: Buffer) =>
    new Promise<Buffer>((resolve, reject) => {
      const falha = (mensagem: string, detalhe = '', naoAbre = false) => reject(new ErroCofre(mensagem, { detalhe, naoAbre }))
      const generica =
        acao === 'proteger'
          ? 'Não foi possível proteger o certificado com o Windows (DPAPI).'
          : 'Não foi possível abrir o certificado guardado no servidor.'
      if (!existsSync(script))
        return falha('O arquivo ferramentas\\protecao-windows.ps1 não foi encontrado na pasta do programa. Reinstale o sistema.')
      const { arquivo, argumentos } = comandoDpapi(acao, script, o.powershell)
      let filho: ReturnType<typeof execFile>
      try {
        filho = execFile(
          arquivo,
          argumentos,
          { windowsHide: true, timeout: tempoLimite, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024, encoding: 'utf8' },
          (erro, saida, erros) => {
            if (erro) {
              const e = erro as NodeJS.ErrnoException & { killed?: boolean }
              const detalhe = primeiraLinha(String(erros ?? '')) || String(e.code ?? '')
              if (e.code === 'ENOENT') return falha('O Windows PowerShell não foi encontrado no servidor.', detalhe)
              if (e.killed)
                return falha(
                  `O Windows não respondeu a tempo (${Math.round(tempoLimite / 1000)} s) ao ${acao} o certificado.`,
                  detalhe,
                )
              if (/language mode|ConstrainedLanguage|modo de linguagem/i.test(String(erros)))
                return falha(
                  'O Windows bloqueou a proteção do certificado (PowerShell em modo restrito, por AppLocker ou WDAC). Peça a quem cuida da TI para liberar o ferramentas\\protecao-windows.ps1.',
                  detalhe,
                )
              if (
                acao === 'abrir' &&
                /Cryptographic|Key not valid|data is invalid|chave n.o . v.lida|dados s.o inv.lidos/i.test(String(erros))
              )
                return falha(MSG_NAO_ABRE, detalhe, true)
              return falha(generica, detalhe, acao === 'abrir')
            }
            const texto = String(saida ?? '').trim()
            if (!texto || !/^[A-Za-z0-9+/=]+$/.test(texto)) return falha(generica, 'resposta do PowerShell fora do formato')
            resolve(Buffer.from(texto, 'base64'))
          },
        )
      } catch (e) {
        return falha(generica, String((e as Error)?.message ?? '').slice(0, 200))
      }
      // O processo que já terminou (ou nem começou) não recebe a entrada: o erro vem pelo retorno acima
      filho.stdin?.on('error', () => {})
      filho.stdin?.end(`${dados.toString('base64')}\n${entropia.toString('base64')}\n`)
    })
  return {
    nome: 'dpapi-maquina',
    proteger: (d, e) => rodar('proteger', d, e),
    abrir: (d, e) => rodar('abrir', d, e),
  }
}

// ---- AES-256-GCM (testes e fora do Windows) ----------------------------------------------------------------------

/** AES-256-GCM com a chave dada (32 bytes). Formato: iv(12) | tag(16) | cifrado. A entropia vai como AAD. */
export function protetorAesTeste(chave: Buffer): Protetor {
  if (chave.length !== 32) throw new ErroCofre('A chave do protetor de teste precisa ter 32 bytes.')
  return {
    nome: 'aes-teste',
    async proteger(dados, entropia) {
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', chave, iv)
      c.setAAD(entropia)
      const cifrado = Buffer.concat([c.update(dados), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), cifrado])
    },
    async abrir(dados, entropia) {
      try {
        const d = createDecipheriv('aes-256-gcm', chave, dados.subarray(0, 12))
        d.setAAD(entropia)
        d.setAuthTag(dados.subarray(12, 28))
        return Buffer.concat([d.update(dados.subarray(28)), d.final()])
      } catch {
        throw new ErroCofre(MSG_NAO_ABRE, { naoAbre: true })
      }
    },
  }
}

// ---- O segredo de fora da pasta de dados ----------------------------------------------------------------------

export const ARQUIVO_SEGREDO = 'certificado-digital.segredo'
const TAMANHO_SEGREDO = 32

/**
 * O segredo do cofre: na pasta de cima da de dados (no servidor, C:\ProgramData\BC Calibracao, com a permissão só para
 * SYSTEM, Administradores e a conta LocalService, que é a de todo serviço que roda como ela, não só a deste), fora da cópia
 * da pasta "dados" que o LEIA-ME manda fazer.
 */
export const arquivoDoSegredo = (pastaDados: string) => join(dirname(pastaDados), ARQUIVO_SEGREDO)

/**
 * O `protetor` com o segredo de `arquivo` (32 bytes aleatórios) junto da entropia: sem esse arquivo, o que ele cifrou não
 * abre, nem no mesmo computador. Só `proteger` (instalar o certificado) cria o arquivo, na primeira vez; `abrir` sem ele
 * é "não abre" (MSG_NAO_ABRE). O segredo nunca vai para o arquivo do cofre, para o registro nem para as mensagens.
 */
export function protetorComSegredo(protetor: Protetor, arquivo: string): Protetor {
  let segredo: Buffer | undefined
  const ler = (criar: boolean): Buffer => {
    if (segredo) return segredo
    if (criar && !existsSync(arquivo)) {
      try {
        mkdirSync(dirname(arquivo), { recursive: true })
        writeFileSync(arquivo, randomBytes(TAMANHO_SEGREDO), { mode: 0o600, flag: 'wx' })
      } catch (e) {
        // Criado ao mesmo tempo por outro processo: vale o dele
        if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST')
          throw new ErroCofre(`Não foi possível criar o arquivo ${ARQUIVO_SEGREDO} em ${dirname(arquivo)}. Nada foi gravado.`, {
            detalhe: String((e as NodeJS.ErrnoException)?.code ?? ''),
          })
      }
    }
    let lido: Buffer
    try {
      lido = readFileSync(arquivo)
    } catch (e) {
      throw new ErroCofre(MSG_NAO_ABRE, {
        detalhe: `${ARQUIVO_SEGREDO} ausente ou ilegível (${String((e as NodeJS.ErrnoException)?.code ?? '')})`,
        naoAbre: true,
      })
    }
    if (lido.length !== TAMANHO_SEGREDO) {
      lido.fill(0)
      if (criar)
        throw new ErroCofre(
          `O arquivo ${ARQUIVO_SEGREDO}, em ${dirname(arquivo)}, está danificado. Nada foi gravado. Peça a quem cuida da TI para conferir a pasta.`,
        )
      throw new ErroCofre(MSG_NAO_ABRE, { detalhe: `${ARQUIVO_SEGREDO} danificado`, naoAbre: true })
    }
    segredo = lido
    return lido
  }
  const comSegredo = (entropia: Buffer, criar: boolean) => Buffer.concat([entropia, Buffer.from('|', 'utf8'), ler(criar)])
  return {
    nome: protetor.nome,
    proteger: async (d, e) => protetor.proteger(d, comSegredo(e, true)),
    abrir: async (d, e) => protetor.abrir(d, comSegredo(e, false)),
  }
}

/**
 * O protetor do servidor: no Windows, o DPAPI com o segredo de fora da pasta de dados (`protetorComSegredo`,
 * `arquivoDoSegredo`); fora dele (desenvolvimento), o AES de teste com a chave num arquivo FORA da pasta de dados
 * (`<pasta de dados>/../certificado-digital.chave`, ou CHAVE_CERTIFICADO_DIGITAL), criado na primeira vez. `plataforma` e
 * `dpapi`: os testes simulam o Windows.
 */
export function protetorDoServidor(
  pastaDados: string,
  o: { plataforma?: NodeJS.Platform; dpapi?: () => Protetor } = {},
): Protetor {
  if ((o.plataforma ?? process.platform) === 'win32')
    return protetorComSegredo((o.dpapi ?? protetorDpapi)(), arquivoDoSegredo(pastaDados))
  const arquivo = process.env.CHAVE_CERTIFICADO_DIGITAL || join(dirname(pastaDados), 'certificado-digital.chave')
  // A chave só é criada (e lida) no primeiro uso: sem certificado instalado, nenhum arquivo aparece
  let aes: Protetor | undefined
  const protetor = () => {
    if (aes) return aes
    if (!existsSync(arquivo)) {
      mkdirSync(dirname(arquivo), { recursive: true })
      try {
        writeFileSync(arquivo, randomBytes(32), { mode: 0o600, flag: 'wx' })
      } catch {
        /* criado ao mesmo tempo por outro processo */
      }
    }
    aes = protetorAesTeste(readFileSync(arquivo))
    return aes
  }
  return {
    nome: 'aes-teste',
    proteger: (d, e) => protetor().proteger(d, e),
    abrir: (d, e) => protetor().abrir(d, e),
  }
}

// ---- O arquivo do cofre ----------------------------------------------------------------------------------------

export const ARQUIVO_COFRE = 'certificado-digital.json'
export const arquivoDoCofre = (pastaDados: string) => join(pastaDados, ARQUIVO_COFRE)

/** O que fica no arquivo: tudo aberto (público), menos `dados`, cifrado. */
export interface ArquivoCofre {
  versao: 1
  protecao: NomeProtecao
  /** SHA-256 do certificado (DER). Entra na entropia: alterado, o arquivo não abre. */
  sha256: string
  /** DER em base64 do certificado e das ACs (da mais próxima à raiz: a mesma cadeia do CMS). */
  certificado: string
  cadeia: string[]
  instaladoEm: string
  instaladoPor: string
  /** O JSON { chavePkcs8, cadeia } cifrado pelo protetor, em base64. */
  dados: string
}

/** O que vai cifrado: a chave e o hash da cadeia (a cadeia aberta do arquivo não pode ser trocada sem o cofre notar). */
interface ConteudoCifrado {
  chavePkcs8: string
  cadeia: string
}

const hashDaCadeia = (cadeia: Buffer[]) => sha256(Buffer.concat(cadeia.map((c) => Buffer.from(sha256(c), 'hex'))))

/**
 * Cifra a chave e grava o cofre: o cifrado não pode conter a chave; o arquivo é gravado num temporário, reaberto do disco
 * (a chave tem de voltar igual) e só então renomeado por cima do anterior. Qualquer falha deixa o cofre anterior como
 * estava e nenhum arquivo aberto.
 */
export async function gravarCofre(
  pastaDados: string,
  protetor: Protetor,
  a1: A1ParaAssinar,
  autoria: { instaladoEm: string; instaladoPor: string },
): Promise<ArquivoCofre> {
  const pkcs8 = a1.chave.export({ format: 'der', type: 'pkcs8' }) as Buffer
  const pkcs8Base64 = pkcs8.toString('base64')
  const conteudo: ConteudoCifrado = { chavePkcs8: pkcs8Base64, cadeia: hashDaCadeia(a1.cadeiaDer) }
  const aberto = Buffer.from(JSON.stringify(conteudo), 'utf8')
  let protegido: Buffer
  try {
    protegido = await protetor.proteger(aberto, entropiaDoCofre(a1.dados.sha256))
    if (
      !protegido.length ||
      protegido.includes(pkcs8) ||
      protegido.includes(aberto) ||
      protegido.toString('latin1').includes(pkcs8Base64.slice(0, 64)) ||
      protegido.toString('base64').includes(pkcs8Base64.slice(0, 64))
    )
      throw new ErroCofre('A proteção do certificado não cifrou a chave. Nada foi gravado.')
  } finally {
    aberto.fill(0)
    pkcs8.fill(0)
  }
  const arquivo: ArquivoCofre = {
    versao: 1,
    protecao: protetor.nome,
    sha256: a1.dados.sha256,
    certificado: a1.certificadoDer.toString('base64'),
    cadeia: a1.cadeiaDer.map((c) => c.toString('base64')),
    instaladoEm: autoria.instaladoEm,
    instaladoPor: autoria.instaladoPor,
    dados: protegido.toString('base64'),
  }
  mkdirSync(pastaDados, { recursive: true })
  const destino = arquivoDoCofre(pastaDados)
  const temporario = `${destino}.tmp`
  try {
    try {
      writeFileSync(temporario, JSON.stringify(arquivo), { mode: 0o600 })
    } catch (e) {
      throw new ErroCofre('Não foi possível gravar o certificado na pasta de dados.', {
        detalhe: String((e as Error)?.message ?? ''),
      })
    }
    const conferido = await abrirArquivoCofre(temporario, protetor)
    if (conferido.situacao !== 'aberto' || !conferido.a1.chave.equals(a1.chave))
      throw new ErroCofre('A proteção do certificado não conferiu ao reabrir. Nada foi trocado.', {
        detalhe: conferido.situacao === 'nao-abre' ? `${conferido.motivo} ${conferido.detalhe}`.trim() : '',
      })
    renameSync(temporario, destino)
  } finally {
    rmSync(temporario, { force: true })
  }
  try {
    chmodSync(destino, 0o600)
  } catch {
    /* no Windows a permissão vem da pasta */
  }
  return arquivo
}

export type ResultadoCofre =
  | { situacao: 'ausente' }
  | { situacao: 'aberto'; a1: A1ParaAssinar; arquivo: ArquivoCofre }
  /** Existe, mas não abre aqui. `arquivo`: o cabeçalho, quando legível e coerente (o certificado tem o sha256 dito). */
  | { situacao: 'nao-abre'; motivo: string; detalhe: string; arquivo: ArquivoCofre | null }

/** O cabeçalho do arquivo, se legível e coerente (o certificado é o do sha256 e a cadeia é DER válido); senão null. */
export function lerArquivoCofre(pastaDados: string, caminho = arquivoDoCofre(pastaDados)): ArquivoCofre | null {
  let c: ArquivoCofre
  try {
    c = JSON.parse(readFileSync(caminho, 'utf8'))
  } catch {
    return null
  }
  if (!c || typeof c !== 'object' || c.versao !== 1 || typeof c.sha256 !== 'string' || typeof c.certificado !== 'string')
    return null
  if (!Array.isArray(c.cadeia) || c.cadeia.some((d) => typeof d !== 'string') || typeof c.dados !== 'string') return null
  try {
    const der = Buffer.from(c.certificado, 'base64')
    if (sha256(der) !== c.sha256) return null
    new X509Certificate(der)
    for (const d of c.cadeia) new X509Certificate(Buffer.from(d, 'base64'))
  } catch {
    return null
  }
  return { ...c, instaladoEm: String(c.instaladoEm ?? ''), instaladoPor: String(c.instaladoPor ?? '') }
}

/** Abre o cofre: a chave em memória (KeyObject), o certificado e a cadeia; ou por que não abre. */
export function abrirCofre(pastaDados: string, protetor: Protetor): Promise<ResultadoCofre> {
  return abrirArquivoCofre(arquivoDoCofre(pastaDados), protetor)
}

async function abrirArquivoCofre(caminho: string, protetor: Protetor): Promise<ResultadoCofre> {
  if (!existsSync(caminho)) return { situacao: 'ausente' }
  const arquivo = lerArquivoCofre('', caminho)
  const naoAbre = (motivo = MSG_NAO_ABRE, detalhe = ''): ResultadoCofre => ({ situacao: 'nao-abre', motivo, detalhe, arquivo })
  if (!arquivo) return naoAbre('O arquivo do certificado digital está ilegível ou foi alterado. Envie o arquivo .pfx de novo.')
  if (arquivo.protecao !== protetor.nome) return naoAbre(MSG_NAO_ABRE, `protegido com "${arquivo.protecao}"`)
  let aberto: Buffer | undefined
  try {
    aberto = await protetor.abrir(Buffer.from(arquivo.dados, 'base64'), entropiaDoCofre(arquivo.sha256))
  } catch (e) {
    if (e instanceof ErroCofre) return naoAbre(e.naoAbre ? MSG_NAO_ABRE : e.message, e.detalhe)
    return naoAbre()
  }
  let chave: KeyObject
  const certificadoDer = Buffer.from(arquivo.certificado, 'base64')
  const cadeiaDer = arquivo.cadeia.map((d) => Buffer.from(d, 'base64'))
  try {
    const conteudo = JSON.parse(aberto.toString('utf8')) as ConteudoCifrado
    if (conteudo.cadeia !== hashDaCadeia(cadeiaDer))
      return naoAbre('A cadeia do certificado guardado foi alterada. Envie o arquivo .pfx de novo.')
    const pkcs8 = Buffer.from(String(conteudo.chavePkcs8), 'base64')
    chave = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
    pkcs8.fill(0)
    if (!new X509Certificate(certificadoDer).checkPrivateKey(chave)) return naoAbre()
  } catch {
    return naoAbre()
  } finally {
    aberto.fill(0)
  }
  try {
    return {
      situacao: 'aberto',
      arquivo,
      a1: { dados: dadosDoCertificado(certificadoDer, chave), chave, certificadoDer, cadeiaDer },
    }
  } catch (e) {
    return naoAbre(String((e as Error)?.message ?? MSG_NAO_ABRE))
  }
}

export function apagarCofre(pastaDados: string) {
  rmSync(arquivoDoCofre(pastaDados), { force: true })
  rmSync(`${arquivoDoCofre(pastaDados)}.tmp`, { force: true })
}

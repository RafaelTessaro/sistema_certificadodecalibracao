// O cofre do certificado digital (PLANO §2.3): o arquivo nunca tem a chave nem a senha em claro, reabre com o mesmo protetor,
// não abre com outro (outro computador) nem com o cabeçalho adulterado, e um protetor que falha nunca deixa nada gravado.
// O DPAPI de verdade roda só no Windows (cofreDpapi.test.ts, no CI); aqui, o mesmo código com um PowerShell falso.

import { createHash, randomBytes, sign, verify, X509Certificate } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { arquivoPki, derPki, raizesTeste, SENHA } from './__fixtures__/pki.ts'
import {
  abrirCofre,
  apagarCofre,
  arquivoDoCofre,
  arquivoDoSegredo,
  caminhoScriptProtecao,
  comandoDpapi,
  entropiaDoCofre,
  ErroCofre,
  gravarCofre,
  MSG_NAO_ABRE,
  type Protetor,
  protetorAesTeste,
  protetorComSegredo,
  protetorDoServidor,
  protetorDpapi,
} from './cofre.ts'
import { abrirPfx } from './pfx.ts'

const a1 = () => abrirPfx(arquivoPki('ecnpj-aes.pfx'), SENHA, { raizes: raizesTeste() })
const AUTORIA = { instaladoEm: '2026-11-11T12:00:00.000Z', instaladoPor: 'Admin Teste (admin)' }

let pasta: string
beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'bcf-cofre-'))
})
afterEach(() => rmSync(pasta, { recursive: true, force: true }))

/** O arquivo do cofre não pode ter nada da chave privada nem a senha do .pfx. */
function semSegredo(texto: string, chave: ReturnType<typeof a1>['chave']) {
  const pkcs8 = chave.export({ format: 'der', type: 'pkcs8' }) as Buffer
  const pem = chave.export({ format: 'pem', type: 'pkcs8' }) as string
  const bytes = Buffer.from(texto, 'utf8')
  expect(bytes.includes(pkcs8)).toBe(false)
  expect(texto).not.toContain(pkcs8.toString('base64').slice(0, 40))
  expect(texto).not.toContain(pkcs8.toString('hex').slice(0, 40))
  expect(texto).not.toContain(pem.split('\n')[1])
  expect(texto).not.toContain(SENHA)
  expect(texto).not.toContain('PRIVATE KEY')
  expect(texto).not.toContain('chavePkcs8')
}

describe('cofre com o protetor de teste (AES-256-GCM)', () => {
  const chave = randomBytes(32)
  const protetor = protetorAesTeste(chave)

  it('grava sem a chave nem a senha em claro e reabre com o mesmo protetor', async () => {
    const original = a1()
    const arquivo = await gravarCofre(pasta, protetor, original, AUTORIA)
    const texto = readFileSync(arquivoDoCofre(pasta), 'utf8')
    semSegredo(texto, original.chave)
    // Só o público aberto: o certificado, a cadeia e quem instalou
    expect(Object.keys(JSON.parse(texto)).sort()).toEqual(
      ['cadeia', 'certificado', 'dados', 'instaladoEm', 'instaladoPor', 'protecao', 'sha256', 'versao'].sort(),
    )
    expect(arquivo).toMatchObject({ versao: 1, protecao: 'aes-teste', sha256: original.dados.sha256, ...AUTORIA })
    expect(Buffer.from(arquivo.certificado, 'base64').equals(derPki('ecnpj'))).toBe(true)
    expect(existsSync(`${arquivoDoCofre(pasta)}.tmp`)).toBe(false)

    const r = await abrirCofre(pasta, protetor)
    expect(r.situacao).toBe('aberto')
    if (r.situacao !== 'aberto') return
    expect(r.a1.dados).toEqual(original.dados)
    expect(r.a1.certificadoDer.equals(original.certificadoDer)).toBe(true)
    expect(r.a1.cadeiaDer.map((c) => c.toString('hex'))).toEqual(original.cadeiaDer.map((c) => c.toString('hex')))
    // A chave reaberta assina, e o certificado confere
    const assinatura = sign('sha256', Buffer.from('teste'), r.a1.chave)
    expect(verify('sha256', Buffer.from('teste'), new X509Certificate(r.a1.certificadoDer).publicKey, assinatura)).toBe(true)
  })

  it('com outra chave (outro computador): NAO_ABRE, com o cabeçalho para a tela', async () => {
    await gravarCofre(pasta, protetor, a1(), AUTORIA)
    const r = await abrirCofre(pasta, protetorAesTeste(randomBytes(32)))
    expect(r).toMatchObject({ situacao: 'nao-abre', motivo: MSG_NAO_ABRE })
    if (r.situacao === 'nao-abre') expect(r.arquivo?.sha256).toBe(a1().dados.sha256)
  })

  it('com o sha256 do cabeçalho adulterado: NAO_ABRE', async () => {
    await gravarCofre(pasta, protetor, a1(), AUTORIA)
    const c = JSON.parse(readFileSync(arquivoDoCofre(pasta), 'utf8'))
    writeFileSync(arquivoDoCofre(pasta), JSON.stringify({ ...c, sha256: 'ab'.repeat(32) }))
    expect((await abrirCofre(pasta, protetor)).situacao).toBe('nao-abre')
    // Trocado junto com o certificado (o de outra empresa, coerente com o sha256): a entropia não confere
    const outro = derPki('outro')
    writeFileSync(
      arquivoDoCofre(pasta),
      JSON.stringify({ ...c, certificado: outro.toString('base64'), sha256: createHash('sha256').update(outro).digest('hex') }),
    )
    expect(await abrirCofre(pasta, protetor)).toMatchObject({ situacao: 'nao-abre', motivo: MSG_NAO_ABRE })
  })

  it('com a cadeia trocada: NAO_ABRE (a cadeia vai na assinatura, não pode mudar)', async () => {
    await gravarCofre(pasta, protetor, a1(), AUTORIA)
    const c = JSON.parse(readFileSync(arquivoDoCofre(pasta), 'utf8'))
    writeFileSync(arquivoDoCofre(pasta), JSON.stringify({ ...c, cadeia: c.cadeia.slice(0, 1) }))
    const r = await abrirCofre(pasta, protetor)
    expect(r.situacao).toBe('nao-abre')
    if (r.situacao === 'nao-abre') expect(r.motivo).toMatch(/cadeia/)
  })

  it('arquivo ilegível, de outro protetor ou ausente', async () => {
    expect(await abrirCofre(pasta, protetor)).toEqual({ situacao: 'ausente' })
    writeFileSync(arquivoDoCofre(pasta), '{ não é json')
    expect(await abrirCofre(pasta, protetor)).toMatchObject({ situacao: 'nao-abre', arquivo: null })
    await gravarCofre(pasta, protetor, a1(), AUTORIA)
    const dpapi: Protetor = { ...protetor, nome: 'dpapi-maquina' }
    expect(await abrirCofre(pasta, dpapi)).toMatchObject({ situacao: 'nao-abre', motivo: MSG_NAO_ABRE })
    apagarCofre(pasta)
    expect(existsSync(arquivoDoCofre(pasta))).toBe(false)
  })

  it('um protetor que falha nunca deixa nada gravado (e o cofre anterior fica como estava)', async () => {
    const quebrado: Protetor = {
      nome: 'aes-teste',
      proteger: async () => {
        throw new ErroCofre('O Windows recusou.')
      },
      abrir: protetor.abrir,
    }
    await expect(gravarCofre(pasta, quebrado, a1(), AUTORIA)).rejects.toThrow('O Windows recusou.')
    expect(existsSync(arquivoDoCofre(pasta))).toBe(false)
    expect(existsSync(`${arquivoDoCofre(pasta)}.tmp`)).toBe(false)

    // Um "protetor" que devolve a entrada (não cifra): recusado antes de gravar
    const identidade: Protetor = { nome: 'aes-teste', proteger: async (d) => Buffer.from(d), abrir: async (d) => Buffer.from(d) }
    await expect(gravarCofre(pasta, identidade, a1(), AUTORIA)).rejects.toThrow(/não cifrou/)
    expect(existsSync(arquivoDoCofre(pasta))).toBe(false)

    // Cifra, mas não reabre igual: recusado; o cofre gravado antes continua
    await gravarCofre(pasta, protetor, a1(), AUTORIA)
    const antes = readFileSync(arquivoDoCofre(pasta), 'utf8')
    const naoVolta: Protetor = { ...protetor, abrir: async () => randomBytes(10) }
    await expect(gravarCofre(pasta, naoVolta, a1(), { ...AUTORIA, instaladoPor: 'outro' })).rejects.toThrow(/não conferiu/)
    expect(readFileSync(arquivoDoCofre(pasta), 'utf8')).toBe(antes)
  })
})

/** PowerShell falso: lê o modo no arquivo do "script" e responde como o protecao-windows.ps1 responderia. */
function falso(modo: string) {
  const prog = join(pasta, 'falso-ps.mjs')
  writeFileSync(
    prog,
    `import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
const args = process.argv.slice(2)
const modo = readFileSync(args[args.indexOf('-File') + 1], 'utf8')
const acao = args.at(-1)
let entrada = ''
process.stdin.on('data', (d) => (entrada += d))
process.stdin.on('end', () => {
  if (modo === 'demora') return setTimeout(() => {}, 60_000)
  if (modo === 'restrito') {
    process.stderr.write('Cannot invoke method. Method invocation is supported only on core types in this language mode.\\n')
    process.exit(1)
  }
  const [dados, entropia] = entrada.split('\\n').map((l) => Buffer.from(l.trim(), 'base64'))
  const marca = createHash('sha256').update(entropia).digest()
  const xor = (b) => Buffer.from(b.map((x, i) => x ^ marca[i % 32]))
  if (acao === 'proteger') return process.stdout.write(Buffer.concat([marca, xor(dados)]).toString('base64'))
  if (!dados.subarray(0, 32).equals(marca)) {
    process.stderr.write('Exception calling "Unprotect": "Key not valid for use in specified state."\\n')
    process.exit(1)
  }
  process.stdout.write(xor(dados.subarray(32)).toString('base64'))
})
`,
  )
  const sh = join(pasta, 'powershell.sh')
  writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${prog}" "$@"\n`)
  chmodSync(sh, 0o755)
  const script = join(pasta, `protecao-${modo}.ps1`)
  writeFileSync(script, modo)
  return { sh, script }
}

describe('protetorDpapi (o processo do PowerShell, com um falso fora do Windows)', () => {
  it.runIf(process.platform !== 'win32')('protege, reabre e recusa a entropia errada, sem a entrada nas mensagens', async () => {
    const { sh, script } = falso('ok')
    const p = protetorDpapi(script, { powershell: sh })
    const segredo = Buffer.from('chave-secreta-de-teste')
    const cifrado = await p.proteger(segredo, entropiaDoCofre('aa'))
    expect(cifrado.includes(segredo)).toBe(false)
    expect((await p.abrir(cifrado, entropiaDoCofre('aa'))).equals(segredo)).toBe(true)
    const erro = await p.abrir(cifrado, entropiaDoCofre('bb')).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroCofre)
    expect(erro).toMatchObject({ message: MSG_NAO_ABRE, naoAbre: true })
    expect(`${erro.message} ${erro.detalhe}`).not.toContain('chave-secreta')
    // O cofre inteiro pelo mesmo processo
    await gravarCofre(pasta, p, a1(), AUTORIA)
    semSegredo(readFileSync(arquivoDoCofre(pasta), 'utf8'), a1().chave)
    expect((await abrirCofre(pasta, p)).situacao).toBe('aberto')
  })

  it.runIf(process.platform !== 'win32')('tempo limite, modo restrito do PowerShell, script ou PowerShell ausentes', async () => {
    const demora = falso('demora')
    await expect(
      protetorDpapi(demora.script, { powershell: demora.sh, tempoLimiteMs: 300 }).proteger(Buffer.from('x'), Buffer.from('y')),
    ).rejects.toThrow(/não respondeu a tempo/)
    const restrito = falso('restrito')
    await expect(
      protetorDpapi(restrito.script, { powershell: restrito.sh }).proteger(Buffer.from('x'), Buffer.from('y')),
    ).rejects.toThrow(/modo restrito/)
    await expect(protetorDpapi(join(pasta, 'nao-existe.ps1')).proteger(Buffer.from('x'), Buffer.from('y'))).rejects.toThrow(
      /protecao-windows\.ps1 não foi encontrado/,
    )
    await expect(
      protetorDpapi(restrito.script, { powershell: join(pasta, 'sem-powershell.exe') }).proteger(
        Buffer.from('x'),
        Buffer.from('y'),
      ),
    ).rejects.toThrow(/PowerShell não foi encontrado/)
    // Nada foi gravado em nenhum caso
    expect(existsSync(arquivoDoCofre(pasta))).toBe(false)
  })

  it('o comando: o powershell.exe do Windows, sem perfil, sem interação e com o script da pasta do programa', () => {
    const { arquivo, argumentos } = comandoDpapi('abrir', 'C:\\Program Files\\BC Calibracao\\ferramentas\\protecao-windows.ps1')
    expect(arquivo).toMatch(/System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/)
    expect(argumentos).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'C:\\Program Files\\BC Calibracao\\ferramentas\\protecao-windows.ps1',
      'abrir',
    ])
    // Na cópia do código-fonte, o do instalador (o mesmo que o instalador põe em ferramentas)
    expect(caminhoScriptProtecao()).toMatch(/instalador[\\/]ferramentas[\\/]protecao-windows\.ps1$/)
    expect(readFileSync(caminhoScriptProtecao(), 'utf8')).toContain('DataProtectionScope]::LocalMachine')
  })
})

describe('o segredo fora da pasta de dados: a cópia da pasta "dados" não abre, nem no próprio servidor', () => {
  // O DPAPI no escopo da máquina abre para qualquer conta do computador, e o resto da entropia (o sha256) é público: sem o
  // segredo de fora da pasta "dados", a cópia dela (pen drive, rede, pasta sincronizada) abriria em qualquer login do servidor
  it.runIf(process.platform !== 'win32')(
    'o protetor do servidor no Windows exige o segredo de C:\\ProgramData\\BC Calibracao',
    async () => {
      const { sh, script } = falso('ok')
      const dpapi = () => protetorDpapi(script, { powershell: sh })
      const dados = join(pasta, 'BC Calibracao', 'dados')
      const servidor = () => protetorDoServidor(dados, { plataforma: 'win32', dpapi })
      // Nenhum segredo antes de instalar
      expect(arquivoDoSegredo(dados)).toBe(join(pasta, 'BC Calibracao', 'certificado-digital.segredo'))
      expect(existsSync(arquivoDoSegredo(dados))).toBe(false)
      const original = a1()
      await gravarCofre(dados, servidor(), original, AUTORIA)
      const segredo = readFileSync(arquivoDoSegredo(dados))
      expect(segredo).toHaveLength(32)
      expect(dirname(arquivoDoSegredo(dados))).not.toBe(dados)
      const texto = readFileSync(arquivoDoCofre(dados), 'utf8')
      for (const forma of ['hex', 'base64'] as const) expect(texto).not.toContain(segredo.toString(forma).slice(0, 16))
      semSegredo(texto, original.chave)
      // O serviço reiniciado abre (o mesmo segredo, lido de novo)
      expect((await abrirCofre(dados, servidor())).situacao).toBe('aberto')
      // O mesmo DPAPI (o mesmo computador, qualquer conta) só com a entropia pública: não abre
      expect(await abrirCofre(dados, dpapi())).toMatchObject({ situacao: 'nao-abre', motivo: MSG_NAO_ABRE })
      // A cópia da pasta "dados" guardada em outro lugar do mesmo servidor: não abre, e abrir não cria um segredo
      const copia = join(pasta, 'pendrive', 'dados')
      mkdirSync(copia, { recursive: true })
      copyFileSync(arquivoDoCofre(dados), arquivoDoCofre(copia))
      const r = await abrirCofre(copia, protetorDoServidor(copia, { plataforma: 'win32', dpapi }))
      expect(r).toMatchObject({ situacao: 'nao-abre', motivo: MSG_NAO_ABRE })
      if (r.situacao === 'nao-abre') expect(r.detalhe).not.toContain(segredo.toString('hex').slice(0, 16))
      expect(existsSync(arquivoDoSegredo(copia))).toBe(false)
      // Com outro segredo (outra instalação): não abre
      writeFileSync(arquivoDoSegredo(copia), randomBytes(32))
      expect((await abrirCofre(copia, protetorDoServidor(copia, { plataforma: 'win32', dpapi }))).situacao).toBe('nao-abre')
      // Trocar o certificado reaproveita o segredo
      await gravarCofre(dados, servidor(), original, { ...AUTORIA, instaladoPor: 'outro' })
      expect(readFileSync(arquivoDoSegredo(dados)).equals(segredo)).toBe(true)
    },
  )

  it('protetorComSegredo: o segredo entra na entropia; sem o arquivo, não abre (e só proteger cria)', async () => {
    const interno = protetorAesTeste(randomBytes(32))
    const arquivo = join(pasta, 'fora', 'certificado-digital.segredo')
    const p = protetorComSegredo(interno, arquivo)
    expect(p.nome).toBe(interno.nome)
    await expect(p.abrir(Buffer.alloc(40), entropiaDoCofre('aa'))).rejects.toMatchObject({ message: MSG_NAO_ABRE, naoAbre: true })
    expect(existsSync(arquivo)).toBe(false)
    const cifrado = await p.proteger(Buffer.from('dados'), entropiaDoCofre('aa'))
    expect(readFileSync(arquivo)).toHaveLength(32)
    expect((await p.abrir(cifrado, entropiaDoCofre('aa'))).toString()).toBe('dados')
    // O protetor de dentro, só com a entropia pública, não abre
    await expect(interno.abrir(cifrado, entropiaDoCofre('aa'))).rejects.toMatchObject({ naoAbre: true })
    // Outro processo, com o mesmo arquivo, abre; sem o arquivo, não
    expect((await protetorComSegredo(interno, arquivo).abrir(cifrado, entropiaDoCofre('aa'))).toString()).toBe('dados')
    rmSync(arquivo)
    await expect(protetorComSegredo(interno, arquivo).abrir(cifrado, entropiaDoCofre('aa'))).rejects.toMatchObject({
      message: MSG_NAO_ABRE,
      naoAbre: true,
    })
    // O arquivo danificado (tamanho errado) não é usado
    writeFileSync(arquivo, Buffer.from('curto'))
    await expect(protetorComSegredo(interno, arquivo).abrir(cifrado, entropiaDoCofre('aa'))).rejects.toMatchObject({
      naoAbre: true,
    })
    await expect(protetorComSegredo(interno, arquivo).proteger(Buffer.from('x'), entropiaDoCofre('aa'))).rejects.toThrow(
      ErroCofre,
    )
  })
})

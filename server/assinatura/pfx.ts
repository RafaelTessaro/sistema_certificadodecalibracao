// Abrir o certificado digital da empresa (.pfx/.p12 + senha) e conferir se ele pode assinar os certificados de
// calibração (PLANO §2.4): e-CNPJ A1 ou SE-S da ICP-Brasil, chave RSA, cadeia até uma raiz ICP-Brasil fixada, dentro
// da validade e do CNPJ da empresa.
//
// O node-forge só abre o PKCS#12 (é o único em JS puro que abre o PBES2/AES, o 3DES e o RC2-40 que o Windows
// exporta; o OpenSSL do Node não abre o RC2-40). Os objetos dele não são usados: a chave (PKCS#8) e os certificados
// saem do ASN.1 cru de cada "bag" para o node:crypto (createPrivateKey, X509Certificate), que assina e confere.
// Contorno da senha com acento: o PBES2 deriva a chave da senha em UTF-8, e o forge 1.x a passa como "binary string".
//
// As mensagens de erro (ErroCertificadoDigital) podem ir para a tela do administrador: nunca levam a senha, a chave
// nem o conteúdo do otherName 2.16.76.1.3.4 (CPF e nascimento do responsável).

import { createHash, createPrivateKey, type KeyObject, X509Certificate } from 'node:crypto'
import forge from 'node-forge'
import { mascaraCnpj, normalizarCnpj } from '#shared/documentos.ts'
import { type A1ParaAssinar, type DadosCertificadoDigital, ErroCertificadoDigital } from './contrato.ts'
import {
  type BuscarEndereco,
  buscarComTempoLimite,
  certificadosDe,
  cnpjDoCertificado,
  emissorDoCertificado,
  lerCertificado,
  mesmaRaizCnpj,
  montarCadeia,
  OID_ICP,
  tipoPelaPolitica,
  titularDoCertificado,
} from './icp.ts'
import { raizesIcpBrasil } from './raizes.ts'

/** Dias antes do vencimento em que o sistema começa a avisar. */
export const DIAS_AVISO_VENCIMENTO = 30

const SENHA_ERRADA = 'A senha não confere com o arquivo do certificado.'
const ARQUIVO_INVALIDO = 'O arquivo não é um certificado digital .pfx ou .p12 válido.'
const PROTECAO_NAO_SUPORTADA =
  'O arquivo usa uma proteção que o sistema não abre. Exporte o certificado de novo (.pfx, com a chave privada) e tente outra vez.'
/**
 * O teto de iterações de cada derivação de chave do arquivo (o MAC e o PBE do PKCS#12, o PBKDF2 do PBES2) e o total por
 * abertura. O node-forge as faz em JavaScript, no único thread do servidor: um arquivo de poucos KB com uma contagem alta o
 * travaria por horas. O Windows exporta com 2.000 e o OpenSSL 3 com 2.048.
 */
export const MAX_ITERACOES_PFX = 100_000
// O PBE legado deriva duas vezes por contêiner (chave e IV): MAC + 2 × 2 cabem com folga
const ORCAMENTO_ITERACOES_PFX = 6 * MAX_ITERACOES_PFX
const ITERACOES_DEMAIS =
  'O arquivo usa uma proteção com iterações demais (mais de 100.000), que o sistema não abre. Exporte o certificado de ' +
  'novo pelo Windows (.pfx, com a chave privada) e tente outra vez.'
class ErroIteracoes extends Error {}
const SEM_CADEIA =
  'O certificado não chega a uma raiz da ICP-Brasil com os certificados do arquivo. Exporte de novo marcando ' +
  '"Incluir todos os certificados no caminho de certificação, se possível".'

const erro = (mensagem: string) => new ErroCertificadoDigital(mensagem)

/** A data como o Brasil lê (dd/mm/aaaa), no horário de Brasília. */
export const dataBr = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)

/** A hora (HH:mm) no horário de Brasília. */
export const horaBr = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)

/**
 * Quando o certificado vence, com a hora: "31/12/2046 às 20:59". O certificado vence numa hora do dia (a da emissão dele),
 * não no fim do dia: a emissão para nessa hora.
 */
export const dataHoraBr = (d: Date) => `${dataBr(d)} às ${horaBr(d)}`

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

// ---- Abrir o PKCS#12 ------------------------------------------------------------------------------------------

interface ForgeInterno {
  pkcs5: { pbkdf2: (...a: unknown[]) => unknown }
  pkcs12: { generateKey: (...a: unknown[]) => unknown }
  pbe: { generatePkcs12Key: (...a: unknown[]) => unknown }
  pki: { certificateFromAsn1: unknown; privateKeyFromAsn1: unknown }
}

const derDe = (a: forge.asn1.Asn1) => Buffer.from(forge.asn1.toDer(a).getBytes(), 'binary')

/**
 * Decifra o PKCS#12 e devolve o ASN.1 cru (DER) das chaves e dos certificados. Com `utf8`, a senha vai em UTF-8 para
 * o PBKDF2 (o certo pelo PKCS#5; o MAC e o PBE legado do PKCS#12 usam BMPString e o forge já faz certo).
 */
function decifrar(pfx: Buffer, senha: string, utf8: boolean): { chaves: Buffer[]; certificados: Buffer[] } {
  const f = forge as unknown as ForgeInterno
  const { pbkdf2 } = f.pkcs5
  const { generateKey } = f.pkcs12
  const { generatePkcs12Key } = f.pbe
  const { certificateFromAsn1, privateKeyFromAsn1 } = f.pki
  // Cada derivação confere as iterações (que vêm do arquivo) antes de começar: senha errada também derivaria.
  // O forge lê o INTEGER com getInt(32), que sai negativo com o bit alto ligado, e o PBKDF2 dele com c < 2 faz uma
  // rodada só: sem recusar c < 1, um bag assim decifraria e baixaria o total gasto (e o orçamento deixaria de valer)
  let gastas = 0
  const conferirIteracoes = (n: unknown) => {
    const c = Number(n)
    if (!Number.isInteger(c) || c < 1 || c > MAX_ITERACOES_PFX) throw new ErroIteracoes('iterações fora do limite')
    gastas += c
    if (gastas > ORCAMENTO_ITERACOES_PFX) throw new ErroIteracoes('iterações demais')
  }
  // pbkdf2(senha, sal, iterações, tamanho, md); generateKey e generatePkcs12Key(senha, sal, id, iterações, n, md)
  f.pkcs5.pbkdf2 = (p: unknown, sal: unknown, c: unknown, ...resto: unknown[]) => {
    conferirIteracoes(c)
    return pbkdf2(utf8 ? forge.util.encodeUtf8(String(p)) : p, sal, c, ...resto)
  }
  f.pkcs12.generateKey = (p: unknown, sal: unknown, id: unknown, c: unknown, ...resto: unknown[]) => {
    conferirIteracoes(c)
    return generateKey(p, sal, id, c, ...resto)
  }
  f.pbe.generatePkcs12Key = (p: unknown, sal: unknown, id: unknown, c: unknown, ...resto: unknown[]) => {
    conferirIteracoes(c)
    return generatePkcs12Key(p, sal, id, c, ...resto)
  }
  // O forge guarda o ASN.1 cru do bag quando não consegue montar o objeto dele: é o que se quer (vale para EC também)
  const cru = () => {
    throw new Error('cru')
  }
  f.pki.certificateFromAsn1 = cru
  f.pki.privateKeyFromAsn1 = cru
  try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), false, senha)
    const { pkcs8ShroudedKeyBag, keyBag, certBag } = forge.pki.oids as Record<string, string>
    const bags = (tipo: string) => p12.getBags({ bagType: tipo })[tipo] ?? []
    return {
      chaves: [...bags(pkcs8ShroudedKeyBag), ...bags(keyBag)].flatMap((b) => (b.asn1 ? [derDe(b.asn1)] : [])),
      certificados: bags(certBag).flatMap((b) => (b.asn1 ? [derDe(b.asn1)] : [])),
    }
  } finally {
    f.pkcs5.pbkdf2 = pbkdf2
    f.pkcs12.generateKey = generateKey
    f.pbe.generatePkcs12Key = generatePkcs12Key
    f.pki.certificateFromAsn1 = certificateFromAsn1
    f.pki.privateKeyFromAsn1 = privateKeyFromAsn1
  }
}

const ehSenhaErrada = (e: unknown) =>
  /MAC could not be verified|Invalid password|wrong password|Failed to decrypt|Unable to decrypt/i.test(
    String((e as Error)?.message),
  )

function traduzir(e: unknown): ErroCertificadoDigital {
  if (e instanceof ErroIteracoes) return erro(ITERACOES_DEMAIS)
  if (ehSenhaErrada(e)) return erro(SENHA_ERRADA)
  if (/unsupported|not supported|Unknown|Cannot read encrypted/i.test(String((e as Error)?.message)))
    return erro(PROTECAO_NAO_SUPORTADA)
  return erro(ARQUIVO_INVALIDO)
}

function abrirP12(pfx: Buffer, senha: string) {
  if (!Buffer.isBuffer(pfx) || pfx.length < 16 || pfx[0] !== 0x30) throw erro(ARQUIVO_INVALIDO)
  try {
    return decifrar(pfx, senha, true)
  } catch (e) {
    // Senha com acento num arquivo que a derivou dos bytes "crus" (como o forge sem o contorno): tenta assim também
    if (ehSenhaErrada(e) && /[^\x20-\x7e]/.test(senha)) {
      try {
        return decifrar(pfx, senha, false)
      } catch {
        // fica com o erro da primeira tentativa
      }
    }
    throw traduzir(e)
  }
}

// ---- O certificado da empresa ---------------------------------------------------------------------------------

/**
 * Os dados públicos do certificado do titular, com as conferências que não dependem do relógio, da cadeia nem da
 * empresa: chave RSA de 2048 bits ou mais, não ser de AC, ser de pessoa jurídica com CNPJ (um só), política A1 ou
 * SE-S e permitir assinatura digital.
 */
export function dadosDoCertificado(der: Buffer, chave?: KeyObject): DadosCertificadoDigital {
  const x509 = new X509Certificate(der)
  const publica = chave ?? x509.publicKey
  const tipoChave = publica.asymmetricKeyType
  if (tipoChave === 'ec' || tipoChave === 'ed25519' || tipoChave === 'ed448')
    throw erro('O certificado usa chave de curva elíptica, que o sistema ainda não suporta. Use um certificado com chave RSA.')
  if (tipoChave !== 'rsa') throw erro('O certificado não usa chave RSA, a única que o sistema suporta.')
  const bits = publica.asymmetricKeyDetails?.modulusLength ?? 0
  if (bits < 2048) throw erro(`A chave RSA do certificado tem só ${bits} bits; o mínimo é 2048.`)

  const c = lerCertificado(der)
  if (c.ca || x509.ca) throw erro('Este é o certificado de uma autoridade certificadora (AC), e não o da empresa.')
  const { cnpj, conflito } = cnpjDoCertificado(c)
  if (!cnpj && c.otherNames.includes(OID_ICP.dadosPessoaFisica))
    throw erro('Este é um certificado de pessoa física (e-CPF). Envie o e-CNPJ da empresa.')
  if (!cnpj) throw erro('O certificado não traz o CNPJ da empresa. Envie o e-CNPJ da empresa.')
  if (conflito)
    throw erro(`O certificado traz dois CNPJs diferentes (${mascaraCnpj(cnpj)} e ${mascaraCnpj(conflito)}) e não pode ser usado.`)
  const tipo = tipoPelaPolitica(c.politicas)
  if (tipo !== 'A1' && tipo !== 'SE-S')
    throw erro(
      `O certificado não é do tipo A1 nem SE-S (${tipo || c.politicas.join(', ') || 'sem política'}). Envie o e-CNPJ A1 ou SE-S da empresa, em arquivo .pfx.`,
    )
  if (c.temKeyUsage && !c.usos.includes('digitalSignature'))
    throw erro('O certificado não permite assinatura digital (o uso da chave não inclui "assinatura digital").')

  return {
    sha256: sha256(der),
    titular: titularDoCertificado(c),
    cnpj,
    tipo,
    emissor: emissorDoCertificado(c),
    serie: x509.serialNumber.toUpperCase(),
    validoDe: new Date(x509.validFrom).toISOString(),
    validoAte: new Date(x509.validTo).toISOString(),
  }
}

/**
 * Abre o .pfx com a senha: a chave (KeyObject), o certificado da empresa no DER original e a cadeia até uma das
 * `raizes` (padrão: as ICP-Brasil fixadas) com os certificados do arquivo. Se faltar uma AC no arquivo, a cadeia fica
 * incompleta (sem a raiz): `completarCadeia` tenta o endereço caIssuers e `conferirA1` recusa se não chegar à raiz.
 * A senha não é guardada em lugar nenhum.
 */
export function abrirPfx(pfx: Buffer, senha: string, o: { raizes?: X509Certificate[] } = {}): A1ParaAssinar {
  const { chaves, certificados } = abrirP12(pfx, senha)
  if (!chaves.length)
    throw erro('O arquivo não traz a chave privada. Exporte o certificado de novo marcando "Sim, exportar a chave privada".')
  if (chaves.length > 1) throw erro('O arquivo traz mais de uma chave privada. Exporte só o certificado da empresa.')
  let chave: KeyObject
  try {
    chave = createPrivateKey({ key: chaves[0], format: 'der', type: 'pkcs8' })
  } catch {
    throw erro('A chave privada do arquivo não pôde ser lida.')
  }
  const x509s = certificados.flatMap((der) => {
    try {
      return [new X509Certificate(der)]
    } catch {
      return []
    }
  })
  const titular = x509s.find((c) => {
    try {
      return c.checkPrivateKey(chave)
    } catch {
      return false
    }
  })
  if (!titular) throw erro('Nenhum certificado do arquivo corresponde à chave privada.')
  const dados = dadosDoCertificado(Buffer.from(titular.raw), chave)
  const { intermediarias, raiz } = montarCadeia(
    titular,
    x509s.filter((c) => c !== titular),
    o.raizes ?? raizesIcpBrasil(),
  )
  return {
    dados,
    chave,
    certificadoDer: Buffer.from(titular.raw),
    cadeiaDer: [...intermediarias, ...(raiz ? [raiz] : [])].map((c) => Buffer.from(c.raw)),
  }
}

/** Quantos endereços caIssuers (http/https) a conferência de um .pfx busca, no total, e o tempo para todos. */
export const LIMITES_BUSCA_CADEIA = { enderecos: 2, tempoMs: 20_000 }

/**
 * Completa a cadeia pelo endereço caIssuers (AIA) quando o arquivo não trouxe todas as ACs: no máximo 2 endereços
 * http/https no total, cada um uma vez só, com tempo limite (o de cada busca e um para todas). Sem rede ou sem o endereço,
 * devolve o mesmo certificado (conferirA1 recusa depois).
 */
export async function completarCadeia(
  a1: A1ParaAssinar,
  o: { raizes?: X509Certificate[]; buscar?: BuscarEndereco } = {},
): Promise<A1ParaAssinar> {
  const raizes = o.raizes ?? raizesIcpBrasil()
  const buscar = o.buscar ?? buscarComTempoLimite()
  const titular = new X509Certificate(a1.certificadoDer)
  const extras = a1.cadeiaDer.map((d) => new X509Certificate(d))
  const buscados = new Set<string>()
  const ate = Date.now() + LIMITES_BUSCA_CADEIA.tempoMs
  const esgotou = () => buscados.size >= LIMITES_BUSCA_CADEIA.enderecos || Date.now() >= ate
  for (let rodada = 0; ; rodada++) {
    const { intermediarias, raiz } = montarCadeia(titular, extras, raizes)
    if (raiz) {
      const cadeiaDer = [...intermediarias, raiz].map((c) => Buffer.from(c.raw))
      return rodada === 0 ? a1 : { ...a1, cadeiaDer }
    }
    if (esgotou()) break
    const ultimo = intermediarias.at(-1) ?? titular
    const enderecos = lerCertificado(Buffer.from(ultimo.raw)).caIssuers.filter((u) => /^https?:\/\//i.test(u) && !buscados.has(u))
    if (!enderecos.length) break
    for (const url of enderecos) {
      if (esgotou()) break
      buscados.add(url)
      try {
        extras.push(...certificadosDe(await buscar(url)).slice(0, 10))
      } catch {
        // sem rede ou fora do ar: segue com o que tem
      }
    }
  }
  return a1
}

/** A data no calendário de Brasília (aaaa-mm-dd). */
const diaBrasilia = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/**
 * Dias do calendário de Brasília até o vencimento (0 = vence hoje; 1 = amanhã; negativo = vencido), os mesmos da data que
 * sai ao lado (`dataBr`): às 23h30, o que vence às 11h do dia seguinte vence amanhã. O que já venceu hoje é -1.
 */
export function diasParaVencer(validoAte: string | Date, agora: Date): number {
  const ate = new Date(validoAte)
  const dias = Math.round((Date.parse(diaBrasilia(ate)) - Date.parse(diaBrasilia(agora))) / 86_400_000)
  return agora > ate ? Math.min(dias, -1) : dias
}

/** "vence hoje", "vence amanhã" ou "vence em N dias" (`diasParaVencer`). */
export const quandoVence = (dias: number) => (dias <= 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`)

/**
 * O aviso de vencimento próximo (30 dias ou menos), ou null. Só o fato, com a data e a hora do vencimento (a emissão para
 * nessa hora, não no fim do dia): serve à tela de instalar, ao cartão e ao registro (quem mostra diz o que fazer, se for
 * o caso).
 */
export function avisoVencimento(validoAte: string | Date, agora: Date): string | null {
  const ate = new Date(validoAte)
  const dias = diasParaVencer(ate, agora)
  if (agora > ate || dias > DIAS_AVISO_VENCIMENTO) return null
  return `O certificado digital ${quandoVence(dias)}, em ${dataHoraBr(ate)}.`
}

/**
 * Todas as conferências da §2.4 do plano sobre o certificado aberto: as do titular (dadosDoCertificado), a chave
 * corresponder ao certificado, a validade pelo relógio `agora`, a cadeia até uma das `raizes` (padrão: as ICP-Brasil
 * fixadas) com as ACs dentro da validade e o CNPJ da empresa (igual passa; mesma raiz de 8 posições passa com aviso
 * de filial; outra raiz recusa; vazio pede para preencher). Devolve os avisos (filial, vencimento em 30 dias).
 */
export function conferirA1(
  a1: A1ParaAssinar,
  o: { cnpjEmpresa: string; agora: Date; raizes?: X509Certificate[] },
): { avisos: string[] } {
  const avisos: string[] = []
  const titular = new X509Certificate(a1.certificadoDer)
  const dados = dadosDoCertificado(a1.certificadoDer, a1.chave)
  if (dados.sha256 !== a1.dados.sha256 || dados.cnpj !== a1.dados.cnpj)
    throw erro('Os dados do certificado não conferem com o arquivo. Envie o certificado de novo.')
  let corresponde = false
  try {
    corresponde = titular.checkPrivateKey(a1.chave)
  } catch {
    corresponde = false
  }
  if (!corresponde) throw erro('A chave privada não corresponde ao certificado. Envie o certificado de novo.')

  const de = new Date(titular.validFrom)
  const ate = new Date(titular.validTo)
  if (o.agora < de) throw erro(`O certificado só vale a partir de ${dataBr(de)}. Confira a data e a hora do servidor.`)
  // Mostrado na tela de instalar (a emissão recusa antes, em `classificar`, com o texto dela)
  if (o.agora > ate) throw erro(`O certificado venceu em ${dataBr(ate)}. Escolha o arquivo do certificado novo (renovado).`)

  const { intermediarias, raiz } = montarCadeia(
    titular,
    a1.cadeiaDer.map((d) => new X509Certificate(d)),
    o.raizes ?? raizesIcpBrasil(),
  )
  if (!raiz) throw erro(SEM_CADEIA)
  for (const ac of [...intermediarias, raiz])
    if (o.agora < new Date(ac.validFrom) || o.agora > new Date(ac.validTo))
      throw erro(
        `A AC "${emissorDoCertificado(lerCertificado(Buffer.from(ac.raw))) || ac.subject}", da cadeia do certificado, está fora da validade.`,
      )

  const cnpjEmpresa = normalizarCnpj(o.cnpjEmpresa ?? '')
  if (!cnpjEmpresa) throw erro('Preencha o CNPJ da empresa em Configurações → Empresa antes de instalar o certificado digital.')
  if (dados.cnpj !== cnpjEmpresa) {
    if (!mesmaRaizCnpj(dados.cnpj, cnpjEmpresa))
      throw erro(
        `O certificado é do CNPJ ${mascaraCnpj(dados.cnpj)}, e o da empresa em Configurações é ${mascaraCnpj(cnpjEmpresa)}. Envie o e-CNPJ desta empresa.`,
      )
    avisos.push(
      `O certificado é do CNPJ ${mascaraCnpj(dados.cnpj)}, outro estabelecimento da mesma empresa (o de Configurações é ${mascaraCnpj(cnpjEmpresa)}).`,
    )
  }
  const vencimento = avisoVencimento(ate, o.agora)
  if (vencimento) avisos.push(vencimento)
  return { avisos }
}

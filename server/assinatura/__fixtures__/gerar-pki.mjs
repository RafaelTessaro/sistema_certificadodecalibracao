// Gera a PKI de TESTE da assinatura digital (server/assinatura/__fixtures__/pki/): uma raiz, uma AC intermediária e
// certificados de titular parecidos com os da ICP-Brasil (otherName 2.16.76.1.3.3 com o CNPJ, política A1
// 2.16.76.1.2.1.x ou SE-S 2.16.76.1.2.201.x), mais as variantes que os testes de recusa usam, e os .pfx em vários
// formatos (AES moderno, 3DES, RC2-40, senha com acento, sem cadeia, sem chave, duas chaves, chave trocada).
//
// Nada daqui vale fora dos testes: a raiz de teste só é aceita quando o teste a passa como lista de confiança; em
// produção valem só as raízes ICP-Brasil fixadas em server/assinatura/raizes.ts. As chaves privadas daqui são públicas.
//
// Uso (da raiz do projeto, com o OpenSSL 3 no PATH): node server/assinatura/__fixtures__/gerar-pki.mjs
// Os arquivos gerados são comitados; rode de novo só para mudar a PKI de teste (os testes leem as datas daqui).

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import forge from 'node-forge'

const PASTA = join(dirname(fileURLToPath(import.meta.url)), 'pki')
const TRABALHO = join(PASTA, '.trabalho')
const SENHA = 'Senha@123'
const SENHA_ACENTO = 'Balança@2026'

rmSync(PASTA, { recursive: true, force: true })
mkdirSync(join(TRABALHO, 'novos'), { recursive: true })
writeFileSync(join(TRABALHO, 'index.txt'), '')

const ossl = (...args) => execFileSync('openssl', args, { cwd: PASTA, stdio: ['ignore', 'pipe', 'pipe'] })
const arquivo = (nome) => join(PASTA, nome)

let serie = 0x1a2b3c00
const ca = (nome, { emissor, de, ate, perfil, subj, ec = false, autoassinado = false }) => {
  ossl(
    'genpkey',
    '-algorithm',
    ec ? 'EC' : 'RSA',
    '-pkeyopt',
    ec ? 'ec_paramgen_curve:P-256' : 'rsa_keygen_bits:2048',
    '-out',
    arquivo(`${nome}.key`),
  )
  ossl('req', '-new', '-utf8', '-key', arquivo(`${nome}.key`), '-subj', subj, '-out', join(TRABALHO, `${nome}.csr`))
  writeFileSync(join(TRABALHO, 'serial'), (serie++).toString(16).toUpperCase() + '\n')
  ossl(
    'ca',
    '-batch',
    '-utf8',
    '-notext',
    '-preserveDN',
    '-config',
    join(TRABALHO, 'ca.cnf'),
    '-extfile',
    join(TRABALHO, 'ext.cnf'),
    '-extensions',
    perfil,
    '-startdate',
    de,
    '-enddate',
    ate,
    ...(autoassinado
      ? ['-selfsign', '-keyfile', arquivo(`${nome}.key`)]
      : ['-cert', arquivo(`${emissor}.crt`), '-keyfile', arquivo(`${emissor}.key`)]),
    '-in',
    join(TRABALHO, `${nome}.csr`),
    '-out',
    arquivo(`${nome}.crt`),
  )
}

writeFileSync(
  join(TRABALHO, 'ca.cnf'),
  `[ca]
default_ca = teste
[teste]
dir = ${TRABALHO}
database = $dir/index.txt
new_certs_dir = $dir/novos
serial = $dir/serial
default_md = sha256
policy = livre
unique_subject = no
copy_extensions = none
email_in_dn = no
[livre]
countryName = optional
organizationName = optional
organizationalUnitName = optional
serialNumber = optional
commonName = optional
`,
)

// O CPF e o nascimento do responsável (2.16.76.1.3.4): o sistema nunca pode devolver isto
const RESPONSAVEL = '01011980123456789090000000000000000000000000000SSPSP'
const politicaA1 = '2.16.76.1.2.1.51'
const politicaSeS = '2.16.76.1.2.201.1'
const san = (nome, linhas) => `[san_${nome}]\n${linhas.join('\n')}\n`
const titular = (
  nome,
  { politica = politicaA1, uso = 'digitalSignature,nonRepudiation,keyEncipherment', ca: ehCa = false, otherNames },
) =>
  `[${nome}]
basicConstraints = critical,CA:${ehCa ? 'TRUE' : 'FALSE'}
keyUsage = critical,${uso}
extendedKeyUsage = clientAuth,emailProtection
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
certificatePolicies = ${politica}
authorityInfoAccess = caIssuers;URI:http://repositorio.teste.invalid/ac-teste.p7b
crlDistributionPoints = URI:http://repositorio.teste.invalid/ac-teste.crl
subjectAltName = @san_${nome}
${san(nome, [...otherNames, 'email.1 = contato@balancas-teste.invalid'])}`

const onPj = (cnpj, tipo = 'OCTETSTRING') => [
  `otherName.1 = 2.16.76.1.3.4;PRINTABLESTRING:${RESPONSAVEL}`,
  'otherName.2 = 2.16.76.1.3.2;PRINTABLESTRING:FULANO DE TAL',
  `otherName.3 = 2.16.76.1.3.3;${tipo}:${cnpj}`,
  'otherName.4 = 2.16.76.1.3.7;PRINTABLESTRING:000000000000',
]

writeFileSync(
  join(TRABALHO, 'ext.cnf'),
  `[raiz]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash

[ac]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
certificatePolicies = ${politicaA1},${politicaSeS}

[tsa]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,nonRepudiation
extendedKeyUsage = critical,timeStamping
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always

${titular('ecnpj', { otherNames: onPj('12345678000195') })}
${titular('filial', { otherNames: onPj('12345678000276') })}
${titular('outro', { otherNames: onPj('98765432000198') })}
${titular('conflito', { otherNames: onPj('12345678000195') })}
${titular('alfanumerico', { otherNames: onPj('12ABC34501DE35', 'PRINTABLESTRING') })}
${titular('a3', { politica: '2.16.76.1.2.3.51', otherNames: onPj('12345678000195') })}
${titular('semassinatura', { uso: 'keyEncipherment', otherNames: onPj('12345678000195') })}
${titular('deac', { uso: 'digitalSignature,keyCertSign', ca: true, otherNames: onPj('12345678000195') })}
${titular('ses', { politica: politicaSeS, otherNames: ['otherName.1 = 2.16.76.1.3.2;PRINTABLESTRING:FULANO DE TAL'] })}
${titular('ecpf', {
  otherNames: [
    `otherName.1 = 2.16.76.1.3.1;PRINTABLESTRING:${RESPONSAVEL}`,
    'otherName.2 = 2.16.76.1.3.6;PRINTABLESTRING:000000000000',
    'otherName.3 = 2.16.76.1.3.5;PRINTABLESTRING:0000000000000000000',
  ],
})}
`,
)

const DN = '/C=BR/O=ICP-Teste/OU=AC Intermediaria de Teste v1'
const RAZAO = 'BALANÇAS TESTE LTDA'
ca('raiz', {
  autoassinado: true,
  de: '20250101000000Z',
  ate: '20461231235959Z',
  perfil: 'raiz',
  subj: '/C=BR/O=ICP-Teste/CN=AC Raiz de Teste v1',
})
ca('ac', {
  emissor: 'raiz',
  de: '20250101000000Z',
  ate: '20461231235959Z',
  perfil: 'ac',
  subj: '/C=BR/O=ICP-Teste/OU=AC Raiz de Teste v1/CN=AC Intermediaria de Teste v1',
})
const PADRAO = { emissor: 'ac', de: '20260101000000Z', ate: '20461231235959Z' }
const pj = (cn, extra = '') => `${DN}/OU=Certificado PJ A1${extra}/CN=${cn}`
ca('ecnpj', { ...PADRAO, perfil: 'ecnpj', subj: pj(`${RAZAO}:12345678000195`) })
ca('vencido', { ...PADRAO, de: '20250601000000Z', ate: '20260601000000Z', perfil: 'ecnpj', subj: pj(`${RAZAO}:12345678000195`) })
ca('futuro', { ...PADRAO, de: '20450101000000Z', perfil: 'ecnpj', subj: pj(`${RAZAO}:12345678000195`) })
ca('filial', { ...PADRAO, perfil: 'filial', subj: pj(`${RAZAO}:12345678000276`) })
ca('outro', { ...PADRAO, perfil: 'outro', subj: pj('OUTRA EMPRESA LTDA:98765432000198') })
ca('conflito', { ...PADRAO, perfil: 'conflito', subj: pj(`${RAZAO}:98765432000198`) })
ca('alfanumerico', { ...PADRAO, perfil: 'alfanumerico', subj: pj(`${RAZAO}:12ABC34501DE35`) })
ca('a3', { ...PADRAO, perfil: 'a3', subj: pj(`${RAZAO}:12345678000195`) })
ca('semassinatura', { ...PADRAO, perfil: 'semassinatura', subj: pj(`${RAZAO}:12345678000195`) })
ca('deac', { ...PADRAO, perfil: 'deac', subj: pj(`${RAZAO}:12345678000195`) })
ca('ec', { ...PADRAO, ec: true, perfil: 'ecnpj', subj: pj(`${RAZAO}:12345678000195`) })
ca('ses', { ...PADRAO, perfil: 'ses', subj: `${DN}/OU=Selo Eletronico SE-S/serialNumber=12345678000195/CN=${RAZAO}` })
ca('ecpf', { ...PADRAO, perfil: 'ecpf', subj: `${DN}/OU=Certificado PF A1/CN=FULANO DE TAL:12345678909` })
ca('tsa', { ...PADRAO, perfil: 'tsa', subj: '/C=BR/O=ICP-Teste/CN=ACT de Teste v1' })

// .pfx/.p12
const cadeia = ['ac.crt', 'raiz.crt'].map((n) => readFileSync(arquivo(n), 'utf8')).join('')
writeFileSync(join(TRABALHO, 'cadeia.pem'), cadeia)
const pfx = (saida, nome, { senha = SENHA, formato = 'aes', comCadeia = true } = {}) => {
  const alg =
    formato === 'aes'
      ? []
      : formato === '3des'
        ? ['-legacy', '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1']
        : ['-legacy', '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-RC2-40', '-macalg', 'sha1']
  ossl(
    'pkcs12',
    '-export',
    ...alg,
    '-inkey',
    arquivo(`${nome}.key`),
    '-in',
    arquivo(`${nome}.crt`),
    ...(comCadeia ? ['-certfile', join(TRABALHO, 'cadeia.pem')] : []),
    '-name',
    nome,
    '-passout',
    `pass:${senha}`,
    '-out',
    arquivo(saida),
  )
}
pfx('ecnpj-aes.pfx', 'ecnpj')
pfx('ecnpj-3des.pfx', 'ecnpj', { formato: '3des' })
pfx('ecnpj-rc2.pfx', 'ecnpj', { formato: 'rc2' })
pfx('ecnpj-acento.pfx', 'ecnpj', { senha: SENHA_ACENTO })
pfx('ecnpj-acento-3des.pfx', 'ecnpj', { senha: SENHA_ACENTO, formato: '3des' })
pfx('ecnpj-sem-cadeia.pfx', 'ecnpj', { comCadeia: false })
for (const n of [
  'vencido',
  'futuro',
  'filial',
  'outro',
  'conflito',
  'alfanumerico',
  'a3',
  'semassinatura',
  'deac',
  'ec',
  'ses',
  'ecpf',
])
  pfx(`${n}.pfx`, n)
ossl(
  'pkcs12',
  '-export',
  '-nokeys',
  '-in',
  arquivo('ecnpj.crt'),
  '-certfile',
  join(TRABALHO, 'cadeia.pem'),
  '-passout',
  `pass:${SENHA}`,
  '-out',
  arquivo('sem-chave.pfx'),
)

// Os que o OpenSSL não monta: a chave de outro certificado, e duas chaves no mesmo arquivo (node-forge, 3DES)
const chaveForge = (n) => forge.pki.privateKeyFromPem(readFileSync(arquivo(`${n}.key`), 'utf8'))
const certForge = (n) => forge.pki.certificateFromPem(readFileSync(arquivo(`${n}.crt`), 'utf8'))
const der = (a) => Buffer.from(forge.asn1.toDer(a).getBytes(), 'binary')
const p12 = (chave, certs, mac = true) => forge.pkcs12.toPkcs12Asn1(chave, certs, SENHA, { algorithm: '3des', useMac: mac })
writeFileSync(arquivo('chave-trocada.pfx'), der(p12(chaveForge('outro'), ['ecnpj', 'ac', 'raiz'].map(certForge))))
{
  // PFX ::= SEQUENCE { version, authSafe ContentInfo { data, [0] OCTET STRING (AuthenticatedSafe) }, macData? }
  const a = p12(chaveForge('ecnpj'), ['ecnpj', 'ac', 'raiz'].map(certForge), false)
  const b = p12(chaveForge('outro'), [certForge('outro')], false)
  const seguro = (pfxAsn1) => forge.asn1.fromDer(pfxAsn1.value[1].value[1].value[0].value)
  const juntos = seguro(a)
  juntos.value.push(...seguro(b).value)
  a.value[1].value[1].value[0].value = forge.asn1.toDer(juntos).getBytes()
  writeFileSync(arquivo('duas-chaves.pfx'), der(a))
}
// A AC e a raiz num .p7b (como o endereço caIssuers das ACs costuma servir), para o teste da busca por AIA
ossl('crl2pkcs7', '-nocrl', '-certfile', join(TRABALHO, 'cadeia.pem'), '-outform', 'DER', '-out', arquivo('ac-teste.p7b'))

rmSync(TRABALHO, { recursive: true, force: true })
for (const n of ['raiz', 'ac', 'ecnpj']) {
  const x = ossl('x509', '-in', arquivo(`${n}.crt`), '-noout', '-subject', '-enddate', '-nameopt', 'utf8')
    .toString()
    .trim()
  console.log(`${n}: ${x.replace(/\n/g, ' | ')}`)
}
console.log('PKI de teste gerada em', PASTA)

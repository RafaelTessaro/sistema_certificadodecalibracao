// Ponto de entrada do servidor: `npm start`.
//
// Variáveis de ambiente (opcionais, podem ficar no arquivo .env):
//   PORTA        porta HTTP (padrão 4850)
//   HOST         interface de rede (padrão 0.0.0.0 = acessível pela rede local)
//   PASTA_DADOS  onde ficam o banco e os backups (padrão ./dados)
//   HOSTS_PERMITIDOS  nomes extras para acessar o servidor, separados por vírgula
//                (IPs, localhost, o nome do computador, <nome>.local e <nome>.<domínio do Windows> sempre
//                funcionam; um nome completo de outro domínio, ex.: servidor.empresa.com.br, vai aqui)
//   BC_PKI_TESTE, BC_RELOGIO_TESTE  só nos testes de ponta a ponta, com NODE_ENV=test (ver server/assinatura/ambienteTeste.ts)
//
// O que o ambiente já define vale mais que o .env. No servidor instalado pelo setup do Windows, o serviço define
// PORTA, HOST e PASTA_DADOS: os do .env são ignorados, com um aviso no registro de erros.

import { existsSync, readFileSync, writeSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { criarApp, VERSAO_APP } from './app.ts'
import { opcoesCertificadoDigitalDeTeste } from './assinatura/ambienteTeste.ts'
import { avisoVariavelIgnorada, mensagemPortaEmUso, variaveisIgnoradasDoEnv } from './configuracaoEnv.ts'
import { dominioDoComputador } from './dominioWindows.ts'

const portaDoAmbiente = process.env.PORTA !== undefined
if (existsSync('.env')) {
  try {
    for (const v of variaveisIgnoradasDoEnv(readFileSync('.env', 'utf8'), process.env)) console.warn(avisoVariavelIgnorada(v))
  } catch {
    /* .env ilegível: o loadEnvFile abaixo diz o motivo */
  }
  process.loadEnvFile('.env')
}

const porta = Number(process.env.PORTA ?? 4850)
const host = process.env.HOST ?? '0.0.0.0'
const pastaDados = process.env.PASTA_DADOS ?? 'dados'
// `<nome>.<domínio do Windows>` vale no endereço (no serviço, lido do registro: lá não há USERDNSDOMAIN)
const dominioWindows = dominioDoComputador()

const { app, usuarios } = await criarApp({
  pastaDados,
  logger: true,
  tarefasEmSegundoPlano: true,
  porta,
  dominioWindows,
  // Só nos testes de ponta a ponta (NODE_ENV=test e a pasta __fixtures__ presente): a PKI de teste e o relógio
  certificadoDigital: await opcoesCertificadoDigitalDeTeste(process.env),
})

try {
  await app.listen({ port: porta, host })
} catch (e) {
  const err = e as NodeJS.ErrnoException
  if (err.code === 'EADDRINUSE') console.error(`\n${mensagemPortaEmUso(porta, portaDoAmbiente)}\n`)
  else console.error(e)
  process.exit(1)
}

const enderecos = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `http://${i!.address}:${porta}`)
const nomeCompleto = dominioWindows ? `\n  Pelo nome completo: http://${hostname().toLowerCase()}.${dominioWindows}:${porta}` : ''

console.log(`
  BC Calibração ${VERSAO_APP} — servidor iniciado

  Neste computador:   http://localhost:${porta}
${enderecos.map((e) => `  Na rede da empresa: ${e}`).join('\n')}${nomeCompleto}

  Dados em: ${pastaDados}   (Ctrl+C para encerrar)
`)

if (usuarios.administradoresAtivos() === 0)
  console.log(
    `  Primeiro acesso: neste computador, abra http://localhost:${porta} no navegador e crie a conta do administrador.\n` +
      '  (Esqueceu a senha do administrador? Menu Iniciar → "Redefinir senha do BC Calibração"; no Linux: npm run usuarios.)\n',
  )

let encerrando = false
for (const sinal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
  process.on(sinal, async () => {
    if (encerrando) return
    encerrando = true
    console.log('\nEncerrando…')
    // Garantia: se algo travar o fechamento, o processo sai mesmo assim em 5 s
    setTimeout(() => process.exit(1), 5000).unref()
    await app.close()
    process.exit(0)
  })
}

// Um erro inesperado não pode deixar o processo em estado inconsistente: registra e encerra
// (no Windows/Linux o serviço reinicia o servidor automaticamente).
// Escrita síncrona: com a saída indo para um pipe (ex.: systemd), console.error é assíncrono e a
// mensagem se perderia com o process.exit logo em seguida.
const registrar = (rotulo: string, e: unknown) =>
  writeSync(2, `[${new Date().toISOString()}] ${rotulo}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`)
process.on('uncaughtException', (e) => {
  registrar('erro fatal', e)
  process.exit(1)
})
process.on('unhandledRejection', (e) => registrar('promessa rejeitada sem tratamento', e))

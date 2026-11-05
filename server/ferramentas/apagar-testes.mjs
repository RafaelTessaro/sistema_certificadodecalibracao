// Apaga os testes: roda UMA vez, no computador do servidor, antes de começar a usar o sistema de verdade.
// Num Prompt de Comando aberto como administrador, com o serviço parado:
//
//   net stop BCCalibracao
//   cd "C:\Program Files\BC Calibracao"
//   node\node.exe server\ferramentas\apagar-testes.mjs "C:\ProgramData\BC Calibracao\dados"
//   net start BCCalibracao
//
// (no Linux: node server/ferramentas/apagar-testes.mjs <pasta de dados>)
//
// Mostra o que vai ser apagado e pede para digitar APAGAR. Saem todas as calibrações e todos os certificados
// (rascunhos, emitidos, cancelados e as versões anteriores dos corrigidos), os nºs reservados e não utilizados, as
// folhas de campo e os registros de e-mails; a numeração recomeça (CC-<ano>-00001, FC-<ano>-00001). Ficam os
// usuários, a empresa e as configurações, o POP, os padrões, os clientes, as balanças e o registro de atividades.
// Antes, grava a cópia do banco em dados\backups\antes-de-apagar-testes-<data>.db e MOVE os PDFs das pastas
// certificados e folhas-campo para dados\testes-apagados-<data>, e as cópias antigas do banco da pasta backups (com os
// testes) para dados\testes-apagados-<data>\backups (nada é apagado do disco). A regra do que sai e do que fica está
// em server/limpezaTestes.ts. Documentado em instalador/LEIA-ME.md ("Apagar os testes", em "Depois de atualizar para a 1.0.4").
//
// Recusa se o serviço (ou outro programa) estiver usando o banco. Rodar de novo não apaga nada (diz que não há
// testes). Saída: 0 = apagado, ou nada para apagar; 1 = erro (banco em uso, não encontrado…); 2 = uso incorreto;
// 3 = não confirmado (nada foi apagado).

import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

// O SQLite embutido e a leitura do TypeScript ainda são marcados como "experimentais" e imprimiriam um
// aviso: esconde só esse aviso, antes de carregar o código do servidor
process.removeAllListeners('warning')
process.on('warning', (aviso) => {
  if (aviso.name !== 'ExperimentalWarning') console.warn(aviso)
})

const USO = [
  'Uso: node server/ferramentas/apagar-testes.mjs <pasta de dados>',
  '  no servidor Windows, no Prompt de Comando como administrador, com o serviço parado (net stop BCCalibracao):',
  '    cd "C:\\Program Files\\BC Calibracao"',
  '    node\\node.exe server\\ferramentas\\apagar-testes.mjs "C:\\ProgramData\\BC Calibracao\\dados"',
].join('\n')

const mensagem = (e) => (e instanceof Error ? e.message : String(e))

/** Pergunta e devolve a linha digitada ('' se a entrada acabar sem nenhuma). */
function perguntar(texto) {
  process.stdout.write(texto)
  return new Promise((responder) => {
    const rl = createInterface({ input: process.stdin, terminal: false })
    let resposta = null
    rl.once('line', (linha) => {
      resposta = linha
      rl.close()
    })
    rl.once('close', () => {
      process.stdin.destroy()
      responder(resposta ?? '')
    })
  })
}

/** Sem permissão na pasta de dados (o Prompt de Comando não foi aberto como administrador)? */
const semPermissao = (e) => /unable to open|readonly|EPERM|EACCES|permission/i.test(mensagem(e))

async function principal(argumentos) {
  if (argumentos.length !== 1 || !argumentos[0]) {
    console.error(USO)
    return 2
  }
  // No Prompt de Comando, "C:\...\dados\" (a barra antes da aspa) chega com a aspa no fim
  let pasta = resolve(argumentos[0].replace(/"+$/, ''))
  // Aceita também o caminho do próprio banco
  if (/\.db$/i.test(pasta) && existsSync(pasta) && statSync(pasta).isFile()) pasta = dirname(pasta)

  const m = await import('../limpezaTestes.ts')
  const banco = join(pasta, m.ARQUIVO_BANCO)
  if (!existsSync(banco)) {
    console.error(
      `Banco não encontrado: ${banco}\n` +
        'Confira a pasta de dados (no servidor: "C:\\ProgramData\\BC Calibracao\\dados") e se o Prompt de Comando foi aberto como administrador.',
    )
    return 1
  }

  let db
  try {
    db = m.abrirSozinho(banco)
  } catch (e) {
    if (e instanceof m.ErroLimpeza) console.error(e.message)
    else
      console.error(
        `Não foi possível abrir o banco ${banco}: ${mensagem(e)}` +
          (semPermissao(e) ? '\nAbra o Prompt de Comando como administrador e rode de novo.' : ''),
      )
    return 1
  }
  try {
    const levantamento = m.levantar(db, pasta)
    console.log(`Apagar os testes do BC Calibração\nPasta de dados: ${pasta}\n`)
    if (m.nadaParaApagar(levantamento)) {
      console.log(
        `Não há testes para apagar: nenhum certificado, calibração, folha de campo ou nº reservado.\n` +
          `O próximo certificado é ${levantamento.proximoCertificado} e a próxima folha de campo, ${levantamento.proximaFolha}.`,
      )
      return 0
    }
    console.log(m.textoLevantamento(levantamento).join('\n'))
    console.log('')
    const resposta = await perguntar('Para apagar, digite APAGAR e tecle Enter (só Enter desiste): ')
    if (!m.confirmou(resposta)) {
      console.log('\nNada foi apagado.')
      return 3
    }
    const r = m.apagarTestes(db, pasta)
    console.log('')
    console.log(r.apagou ? m.textoResultado(r).join('\n') : 'Não há testes para apagar.')
    return 0
  } catch (e) {
    if (e instanceof m.ErroLimpeza) console.error(`\n${e.message}`)
    else
      console.error(
        `\nErro: ${mensagem(e)}\nNada foi apagado.` +
          (semPermissao(e) ? '\nAbra o Prompt de Comando como administrador e rode de novo.' : ''),
      )
    return 1
  } finally {
    db.close()
  }
}

process.exitCode = await principal(process.argv.slice(2))

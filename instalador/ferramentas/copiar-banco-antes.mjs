// Cópia de segurança do banco antes de atualizar o BC Calibração. O instalador (bc-calibracao.nsi)
// roda este script com o node.exe da versão que ESTÁ instalada, com o serviço já parado:
//
//   node copiar-banco-antes.mjs <bc-calibracao.db> <dados\backups\antes-da-versao-X.db>
//
// Abrir o banco com o SQLite aplica o -wal que tenha ficado para trás (serviço encerrado à força) e o
// VACUUM INTO grava um único arquivo .db completo; a cópia é conferida (integrity_check) antes de
// receber o nome final. Usa só o node:sqlite (sem o código do servidor): não roda migração nenhuma.
//
// Saída: 0 = cópia gravada e conferida; 1 = erro (o instalador copia então os arquivos .db, -wal e
// -shm como estão); 2 = uso incorreto. As mensagens vão sem acentos porque a janela de detalhes do
// instalador lê a saída na página de código do Windows, e não em UTF-8.

import { existsSync, renameSync, rmSync, statSync } from 'node:fs'

// O node:sqlite ainda pode imprimir o aviso de "experimental" (Node 22): esconde só esse aviso
process.removeAllListeners('warning')
process.on('warning', (aviso) => {
  if (aviso.name !== 'ExperimentalWarning') console.warn(aviso)
})

const [origem, destino] = process.argv.slice(2)
if (!origem || !destino) {
  console.error('Uso: node copiar-banco-antes.mjs <banco.db> <destino.db>')
  process.exit(2)
}
if (!existsSync(origem)) {
  console.error(`Banco nao encontrado: ${origem}`)
  process.exit(1)
}
if (existsSync(destino)) {
  console.error(`O destino ja existe: ${destino}`)
  process.exit(1)
}

const { DatabaseSync } = await import('node:sqlite')

/** Resultado do PRAGMA integrity_check ('ok' quando o banco está íntegro). */
function conferir(db) {
  const linhas = db.prepare('PRAGMA integrity_check').all()
  return linhas.map((l) => Object.values(l)[0]).join('; ')
}

const parcial = `${destino}.parcial`
let db
try {
  db = new DatabaseSync(origem)
  db.exec('PRAGMA busy_timeout = 10000')
  const situacao = conferir(db)
  if (situacao !== 'ok') console.error(`Atencao: o banco atual tem problemas de integridade: ${situacao}`)
  rmSync(parcial, { force: true })
  db.exec(`VACUUM INTO '${parcial.replace(/'/g, "''")}'`)
  db.close()
  db = undefined

  const copia = new DatabaseSync(parcial)
  let resultado
  try {
    resultado = conferir(copia)
  } finally {
    copia.close()
  }
  if (resultado !== 'ok') throw new Error(`a copia gravada nao passou na conferencia: ${resultado}`)
  renameSync(parcial, destino)
  const megabytes = (statSync(destino).size / 1024 / 1024).toFixed(1)
  console.log(`Copia do banco gravada e conferida: ${destino} (${megabytes} MB)`)
} catch (e) {
  try {
    db?.close()
  } catch {
    // já fechado
  }
  rmSync(parcial, { force: true })
  console.error(`Nao foi possivel copiar o banco: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}

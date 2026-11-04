// O domínio do Windows (o sufixo DNS primário do computador): `<nome do computador>.<domínio>` vale no endereço sem
// precisar de HOSTS_PERMITIDOS (`hostPermitido` em app.ts). O servidor instalado roda como serviço (conta
// LocalService), sem o USERDNSDOMAIN, que só existe na sessão de um usuário do domínio: por isso o registro.

import { execFileSync } from 'node:child_process'
import { win32 } from 'node:path'

/** Chave do registro com o sufixo DNS primário (Propriedades do sistema → Nome do computador → Alterar → Mais). */
export const CHAVE_TCPIP = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters'

/** Só um nome DNS (letras, números, hífens e pontos), em minúsculas, sem os pontos das pontas; senão, nenhum. */
function nomeDns(texto: string): string {
  const d = texto
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(d) ? d : ''
}

/**
 * O sufixo DNS primário na saída do `reg query` da `CHAVE_TCPIP`: o `Domain` (o em uso) e, vazio, o `NV Domain` (o
 * configurado, que vale depois de reiniciar). Sem os dois (computador fora de domínio), ou com algo que não é um nome
 * DNS, nenhum ('').
 */
export function dominioDoRegistro(saida: string): string {
  const valores = new Map<string, string>()
  for (const linha of saida.split(/\r?\n/)) {
    const m = /^\s+(.+?) {4}REG_(?:EXPAND_)?SZ(?: {4}(.*))?$/.exec(linha)
    if (m) valores.set(m[1].trim().toLowerCase(), (m[2] ?? '').trim())
  }
  return nomeDns(valores.get('domain') ?? '') || nomeDns(valores.get('nv domain') ?? '')
}

/** O `reg query` da chave (o reg.exe da pasta do Windows); '' quando ele falha. */
function consultarRegistro(): string {
  return execFileSync(win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe'), ['query', CHAVE_TCPIP], {
    encoding: 'latin1',
    timeout: 5000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

/**
 * O domínio do Windows deste computador, em minúsculas ('' = nenhum). No Windows, o sufixo DNS primário do registro (o
 * serviço não tem o USERDNSDOMAIN); sem ele (ou fora do Windows), o USERDNSDOMAIN da sessão, quando existe. Lido uma vez,
 * ao iniciar: trocar o domínio do servidor pede reiniciar o serviço.
 */
export function dominioDoComputador(
  o: {
    plataforma?: NodeJS.Platform
    env?: NodeJS.ProcessEnv
    consultarRegistro?: () => string
  } = {},
): string {
  const env = o.env ?? process.env
  if ((o.plataforma ?? process.platform) === 'win32') {
    let saida = ''
    try {
      saida = (o.consultarRegistro ?? consultarRegistro)()
    } catch {
      /* sem acesso ao registro: segue com o USERDNSDOMAIN, se houver */
    }
    const doRegistro = dominioDoRegistro(saida)
    if (doRegistro) return doRegistro
  }
  return nomeDns(env.USERDNSDOMAIN ?? '')
}

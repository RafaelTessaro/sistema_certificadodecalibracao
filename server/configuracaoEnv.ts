// O arquivo .env e o ambiente do processo. O `process.loadEnvFile` não troca o que o ambiente já define, e o servidor
// instalado pelo setup do Windows roda como serviço (WinSW) com a porta, o HOST e a pasta de dados no ambiente: esses
// três do .env são ignorados. O servidor avisa no registro de erros (BCCalibracao.err.log), em vez de ignorar calado.

import { parseEnv } from 'node:util'

/** As variáveis que o serviço do Windows define (bc-calibracao.nsi, `EscreverXmlServico`). */
const DO_SERVICO = ['PORTA', 'HOST', 'PASTA_DADOS'] as const

export interface VariavelIgnorada {
  nome: (typeof DO_SERVICO)[number]
  /** Como está no .env. */
  doArquivo: string
  /** O que vale (o do ambiente). */
  valendo: string
}

/** O caminho para comparar: com / no lugar de \, sem a barra do fim e sem diferença de maiúsculas (Windows). */
const caminho = (x: string) => x.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** Os dois valores dizem a mesma coisa? A porta como número; a pasta como caminho. */
function iguais(nome: VariavelIgnorada['nome'], a: string, b: string): boolean {
  if (nome === 'PORTA') return Number(a.trim()) === Number(b.trim())
  if (nome === 'PASTA_DADOS') return caminho(a) === caminho(b)
  return a.trim() === b.trim()
}

/**
 * As variáveis do .env (`textoEnv`) que não valem porque o ambiente (`env`, antes de ler o .env) já as define com
 * outro valor. Só PORTA, HOST e PASTA_DADOS: as outras (HOSTS_PERMITIDOS, SO_REDE_LOCAL) o serviço não define.
 */
export function variaveisIgnoradasDoEnv(textoEnv: string, env: NodeJS.ProcessEnv): VariavelIgnorada[] {
  const doArquivo = parseEnv(textoEnv)
  const ignoradas: VariavelIgnorada[] = []
  for (const nome of DO_SERVICO) {
    const arquivo = doArquivo[nome]
    const valendo = env[nome]
    if (arquivo !== undefined && valendo !== undefined && !iguais(nome, arquivo, valendo))
      ignoradas.push({ nome, doArquivo: arquivo, valendo })
  }
  return ignoradas
}

/** O aviso de uma variável ignorada: o que vale e como mudar de verdade no servidor instalado. */
export function avisoVariavelIgnorada(v: VariavelIgnorada): string {
  const lida = `${v.nome}=${v.doArquivo} do arquivo .env`
  switch (v.nome) {
    case 'PORTA':
      return `Aviso: ${lida} foi ignorada; vale a do serviço (${v.valendo}). Para trocar a porta, rode o setup de novo com /PORTA=${v.doArquivo.trim()}.`
    case 'HOST':
      return `Aviso: ${lida} foi ignorado; vale o do serviço (${v.valendo}), definido pelo instalador. Quem acessa pela rede é a regra "BC Calibracao (rede local)" do Firewall que define.`
    case 'PASTA_DADOS':
      return `Aviso: ${lida} foi ignorada; os dados continuam em ${v.valendo}, a pasta do instalador. A cópia de segurança precisa dessa pasta.`
  }
}

/**
 * A mensagem da porta ocupada. `doAmbiente`: a porta veio do ambiente (no servidor instalado, do serviço), e trocar a
 * do .env não adianta: o setup troca. Senão, a do .env (ou a padrão).
 */
export function mensagemPortaEmUso(porta: number, doAmbiente: boolean): string {
  const outra = porta + 1
  return doAmbiente
    ? `A porta ${porta} já está em uso. Feche o outro programa ou troque a porta: no servidor instalado, rode o setup de novo com /PORTA=${outra}.`
    : `A porta ${porta} já está em uso. Feche o outro programa ou defina PORTA=${outra} no arquivo .env.`
}

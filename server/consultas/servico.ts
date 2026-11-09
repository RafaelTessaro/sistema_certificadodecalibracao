// Serviço de consultas usado pelas rotas: valida, consulta com fallback, guarda em cache e traduz erros.

import { cnpjAlfanumerico, cnpjValido, mascaraCep, mascaraCnpj, normalizarCnpj, somenteDigitos } from '#shared/documentos.ts'
import { ErroApi } from '../erros.ts'
import { PROVEDORES_CEP, type DadosCep } from './cep.ts'
import { inscricaoEstadualCnpjWs, PROVEDORES_CNPJ, urlCnpjWs, type DadosCnpj } from './cnpj.ts'
import { CacheTemporario, consultarEmOrdem, type Fetch, type Provedor, type ResultadoConsulta } from './motor.ts'

export type { DadosCep } from './cep.ts'
export type { DadosCnpj } from './cnpj.ts'

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO

export interface OpcoesConsultas {
  /** Implementação de `fetch` (injetável nos testes). */
  fetch?: Fetch
  /** Tempo máximo por provedor; padrão 8 s. */
  timeoutMs?: number
  /** Validade do cache de resultados encontrados; padrão 24 h. */
  validadeMs?: number
  /** Validade do cache de "não encontrado" (um CNPJ recém-aberto pode aparecer depois); padrão 1 h. */
  validadeNaoEncontradoMs?: number
  agora?: () => number
  provedoresCnpj?: Provedor<DadosCnpj>[]
  provedoresCep?: Provedor<DadosCep>[]
  /**
   * A inscrição estadual vem do CNPJ.ws, consultado junto com o serviço principal (os outros não a trazem); padrão: sim.
   */
  inscricaoEstadual?: boolean
  /** Tempo máximo da consulta da inscrição estadual (não atrasa a consulta além disso); padrão 4 s. */
  timeoutInscricaoMs?: number
}

export const MENSAGENS = {
  cnpjInvalido: 'CNPJ inválido. Confira o número digitado.',
  cnpjNaoEncontrado: 'CNPJ não encontrado na Receita Federal.',
  cnpjAlfanumerico:
    'Os serviços de consulta ainda não reconhecem este CNPJ no formato novo, com letras. Preencha os dados da empresa à mão.',
  cepInvalido: 'CEP inválido. Informe os 8 números.',
  cepNaoEncontrado: 'CEP não encontrado.',
  semInternet: 'Sem conexão com a internet no servidor. Preencha os dados manualmente.',
  indisponivel: 'Os serviços de consulta não responderam agora. Tente de novo em instantes ou preencha os dados manualmente.',
}

type Guardado<T> = { tipo: 'ok'; dados: T } | { tipo: 'naoEncontrado' }

/**
 * Consulta com cache e sem repetir pedidos simultâneos para a mesma chave. `fetchDaVez`: o `fetch` desta consulta (a
 * do CNPJ usa a resposta do CNPJ.ws já pedida para a inscrição estadual, sem pedir de novo).
 */
function criarConsulta<T>(
  provedores: Provedor<T>[],
  opcoes: Required<Pick<OpcoesConsultas, 'fetch' | 'timeoutMs' | 'validadeMs' | 'validadeNaoEncontradoMs' | 'agora'>>,
) {
  const cache = new CacheTemporario<Guardado<T>>(1000, opcoes.agora)
  const emAndamento = new Map<string, Promise<ResultadoConsulta<T>>>()

  async function consultar(chave: string, fetchDaVez?: Fetch): Promise<ResultadoConsulta<T>> {
    const guardado = cache.obter(chave)
    if (guardado) return guardado
    let pedido = emAndamento.get(chave)
    if (!pedido) {
      pedido = consultarEmOrdem(chave, provedores, { ...opcoes, fetch: fetchDaVez ?? opcoes.fetch }).finally(() =>
        emAndamento.delete(chave),
      )
      emAndamento.set(chave, pedido)
    }
    const r = await pedido
    if (r.tipo === 'ok') cache.guardar(chave, r, opcoes.validadeMs)
    else if (r.tipo === 'naoEncontrado') cache.guardar(chave, r, opcoes.validadeNaoEncontradoMs)
    return r
  }

  return { consultar, cache }
}

/** O que o CNPJ.ws respondeu (o status e o JSON; null se não era JSON), ou a falha de rede. */
type RespostaCnpjWs = { status: number; corpo: unknown } | { erro: 'rede' | 'tempo' }

/** Pedidos por minuto que o CNPJ.ws aceita de um mesmo endereço (API pública). */
export const LIMITE_CNPJ_WS_POR_MINUTO = 3

/**
 * Inscrição estadual pelo CNPJ.ws, junto com a consulta principal (os outros serviços não a trazem). Nunca atrasa a
 * consulta além do próprio tempo limite (curto) nem a faz falhar: sem resposta, a IE fica em branco. Respeita o limite
 * do serviço (3 pedidos por minuto; depois de um 429, espera 1 minuto) e guarda a IE de cada CNPJ (24 h; uma falha,
 * 1 minuto sem tentar de novo).
 */
function criarConsultaInscricao(o: { fetch: Fetch; timeoutMs: number; agora: () => number; validadeMs: number }) {
  /** IE de cada CNPJ ('' = sem inscrição ativa na UF dele). */
  const cache = new CacheTemporario<string>(1000, o.agora)
  const falhou = new CacheTemporario<true>(1000, o.agora)
  const emAndamento = new Map<string, Promise<RespostaCnpjWs>>()
  /** Quando foram os pedidos do último minuto. */
  let pedidos: number[] = []
  let pausaAte = 0

  async function pedir(chave: string): Promise<RespostaCnpjWs> {
    let resp: Response
    try {
      resp = await o.fetch(urlCnpjWs(chave), {
        headers: { Accept: 'application/json', 'User-Agent': 'BC-Calibracao/1.0 (+servidor local)' },
        signal: AbortSignal.timeout(o.timeoutMs),
        redirect: 'follow',
      })
    } catch (e) {
      return { erro: e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'tempo' : 'rede' }
    }
    if (resp.status === 429) pausaAte = o.agora() + MINUTO
    try {
      return { status: resp.status, corpo: await resp.json() }
    } catch (e) {
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) return { erro: 'tempo' }
      return { status: resp.status, corpo: null }
    }
  }

  /**
   * Começa a consulta da IE do CNPJ (`chave`, sem pontuação). `inscricao`: a IE ('' = nenhuma ativa) ou null (não se
   * sabe: falhou, ou o limite do minuto acabou). `fetch`: para a consulta principal, que, se chegar ao CNPJ.ws, usa esta
   * mesma resposta (sem um segundo pedido).
   */
  function iniciar(chave: string): { inscricao: Promise<string | null>; fetch?: Fetch } {
    const guardada = cache.obter(chave)
    if (guardada !== undefined) return { inscricao: Promise.resolve(guardada) }
    let resposta = emAndamento.get(chave)
    if (!resposta) {
      const agora = o.agora()
      pedidos = pedidos.filter((em) => em > agora - MINUTO)
      if (falhou.obter(chave) || agora < pausaAte || pedidos.length >= LIMITE_CNPJ_WS_POR_MINUTO)
        return { inscricao: Promise.resolve(null) }
      pedidos.push(agora)
      resposta = pedir(chave).finally(() => emAndamento.delete(chave))
      emAndamento.set(chave, resposta)
    }
    const pedido = resposta
    const inscricao = pedido.then((r) => {
      if ('erro' in r || (r.status !== 200 && r.status !== 404)) {
        falhou.guardar(chave, true, MINUTO)
        return null
      }
      const ie = r.status === 200 ? inscricaoEstadualCnpjWs(r.corpo) : ''
      cache.guardar(chave, ie, o.validadeMs)
      return ie
    })
    const url = urlCnpjWs(chave)
    const fetchDaVez: Fetch = async (entrada, init) => {
      if (String(entrada) !== url) return o.fetch(entrada, init)
      const r = await pedido
      if ('erro' in r)
        throw r.erro === 'tempo' ? new DOMException('Tempo esgotado', 'TimeoutError') : new TypeError('fetch failed')
      return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { 'Content-Type': 'application/json' } })
    }
    return { inscricao, fetch: fetchDaVez }
  }

  return { iniciar, cache }
}

function erroIndisponivel(r: Extract<ResultadoConsulta<unknown>, { tipo: 'indisponivel' }>) {
  return r.semInternet
    ? new ErroApi(503, MENSAGENS.semInternet, { motivo: 'sem_internet' })
    : new ErroApi(503, MENSAGENS.indisponivel, { motivo: 'servicos_indisponiveis' })
}

export function criarServicoConsultas(opcoes: OpcoesConsultas = {}) {
  const base = {
    fetch: opcoes.fetch ?? ((...args: Parameters<Fetch>) => fetch(...args)),
    timeoutMs: opcoes.timeoutMs ?? 8000,
    validadeMs: opcoes.validadeMs ?? 24 * HORA,
    validadeNaoEncontradoMs: opcoes.validadeNaoEncontradoMs ?? HORA,
    agora: opcoes.agora ?? Date.now,
  }
  const cnpj = criarConsulta(opcoes.provedoresCnpj ?? PROVEDORES_CNPJ, base)
  const cep = criarConsulta(opcoes.provedoresCep ?? PROVEDORES_CEP, base)
  const inscricao =
    opcoes.inscricaoEstadual === false
      ? null
      : criarConsultaInscricao({
          fetch: base.fetch,
          timeoutMs: opcoes.timeoutInscricaoMs ?? 4000,
          agora: base.agora,
          validadeMs: base.validadeMs,
        })

  return {
    /** Dados da empresa na Receita Federal. Lança ErroApi 400, 404 ou 503. */
    async cnpj(valor: string): Promise<DadosCnpj> {
      // Enviado como está (só sem pontuação): o CNPJ alfanumérico mantém as letras maiúsculas
      const chave = normalizarCnpj(valor)
      if (!cnpjValido(chave)) throw new ErroApi(400, MENSAGENS.cnpjInvalido)
      // A inscrição estadual, ao mesmo tempo (o CNPJ com letras os serviços ainda não reconhecem)
      const ie = inscricao && !cnpjAlfanumerico(chave) ? inscricao.iniciar(chave) : null
      const r = await cnpj.consultar(chave, ie?.fetch)
      if (r.tipo === 'ok') {
        const dados = { ...r.dados, cnpj: mascaraCnpj(chave) }
        // Respondida pelo próprio CNPJ.ws, a IE já veio nela
        return dados.inscricaoEstadual || !ie ? dados : { ...dados, inscricaoEstadual: (await ie.inscricao) ?? '' }
      }
      // Os provedores podem ainda não aceitar o CNPJ com letras (respondem 400, 404 ou erro):
      // repetir não adianta, então avisa para preencher à mão (só a falta de internet é tratada como tal)
      if (cnpjAlfanumerico(chave) && !(r.tipo === 'indisponivel' && r.semInternet)) {
        throw new ErroApi(404, MENSAGENS.cnpjAlfanumerico, { motivo: 'cnpj_alfanumerico' })
      }
      if (r.tipo === 'naoEncontrado') throw new ErroApi(404, MENSAGENS.cnpjNaoEncontrado)
      throw erroIndisponivel(r)
    },

    /** Endereço do CEP. Lança ErroApi 400, 404 ou 503. */
    async cep(valor: string): Promise<DadosCep> {
      const digitos = somenteDigitos(valor)
      if (digitos.length !== 8 || valor.replace(/[\d.\-\s]/g, '') !== '') throw new ErroApi(400, MENSAGENS.cepInvalido)
      const r = await cep.consultar(digitos)
      if (r.tipo === 'ok') return { ...r.dados, cep: mascaraCep(digitos) }
      if (r.tipo === 'naoEncontrado') throw new ErroApi(404, MENSAGENS.cepNaoEncontrado)
      throw erroIndisponivel(r)
    },

    limparCache() {
      cnpj.cache.limpar()
      cep.cache.limpar()
      inscricao?.cache.limpar()
    },
  }
}

export type ServicoConsultas = ReturnType<typeof criarServicoConsultas>

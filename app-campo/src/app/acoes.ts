// As ações do app: abrir, parear, PIN, sincronizar, mudar uma folha (grava a cada alteração), navegar e os ajustes do
// Menu. Toda gravação passa por uma fila (uma de cada vez): a sincronia e as telas nunca gravam a mesma folha ao mesmo
// tempo, e a sincronia nunca sobrescreve uma folha que o técnico mudou enquanto ela conversava com o servidor.

import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { sha256Hex, sha256WebCrypto } from '../../../shared/campo/canonico.ts'
import {
  lerQrPareamento,
  MENSAGEM_SEM_SERVIDOR,
  MENSAGENS_ERRO_CAMPO,
  normalizarCodigo,
  normalizarEnderecoServidor,
  urlCampo,
} from '../../../shared/campo/protocolo.ts'
import type { ServidorCampo } from '../../../shared/campo/protocolo.ts'
import type { PessoaCampo } from '../../../shared/campo/tipos.ts'
import { ClienteCampo } from '../nucleo/cliente.ts'
import { cancelarAssinaturas, ErroFolha } from '../nucleo/folha.ts'
import type { FolhaLocal } from '../nucleo/folha.ts'
import { naoEntregues, paraEntregar } from '../nucleo/lista.ts'
import {
  conferirPin,
  criarHashPin,
  esperaRestante,
  lerHashPin,
  lerTentativas,
  pareamentoApagaPin,
  registrarAcertoPin,
  registrarErroPin,
  textoDaEspera,
} from '../nucleo/pin.ts'
import { relogioDoAparelho } from '../nucleo/relogio.ts'
import { META } from '../nucleo/repositorio.ts'
import type { Repositorio } from '../nucleo/repositorio.ts'
import { sincronizar as rodadaDeSincronia } from '../nucleo/sincronia.ts'
import type { ResultadoSincronia } from '../nucleo/sincronia.ts'
import { idDoAparelho, modeloDoAparelho } from '../plataforma/aparelho.ts'
import { abrirNoNavegador, ouvirEventos } from '../plataforma/eventos.ts'
import { transporteCapacitor } from '../plataforma/http.ts'
import { atualizarLembrete, HORA_LEMBRETE_PADRAO, pedirPermissaoNotificacoes } from '../plataforma/notificacoes.ts'
import { ficarEmPe } from '../plataforma/orientacao.ts'
import { gravarJson, gravarPreferencia, lerJson, lerPreferencia, PREF } from '../plataforma/preferencias.ts'
import { cancelarLeituraQr, ErroQr, lerQr } from '../plataforma/qr.ts'
import { abrirRepositorio } from '../plataforma/sqlite.ts'
import { camadaDeCima } from './camadas.ts'
import { lerEstado, mudarEstado, telaAtual } from './loja.ts'
import type { Pareamento, Tela, Tema } from './loja.ts'

let repo: Repositorio | null = null

/** sha256 pelo WebCrypto (o app roda em https://localhost, contexto seguro); sem ele, a implementação em TypeScript. */
export const sha = async (texto: string): Promise<string> => {
  try {
    return await sha256WebCrypto(texto)
  } catch {
    return sha256Hex(texto)
  }
}

// ---- Fila de gravação --------------------------------------------------------------------------------------------------

let fila: Promise<unknown> = Promise.resolve()
function naFila<T>(trabalho: () => Promise<T>): Promise<T> {
  const p = fila.then(trabalho, trabalho)
  fila = p.catch(() => undefined)
  return p
}

/**
 * O repositório que a sincronia usa: cada leitura anota a versão da folha (`atualizadaEm`); a gravação só acontece se a
 * folha guardada ainda é a que ela leu (senão o técnico mudou a folha no meio da conversa: a próxima rodada resolve).
 */
function repositorioDaSincronia(base: Repositorio): Repositorio {
  const vistas = new Map<string, string>()
  const anotar = (f: FolhaLocal | null) => {
    if (f) vistas.set(f.envioId, f.atualizadaEm)
    return f
  }
  return {
    listar: async () => {
      const lista = await naFila(() => base.listar())
      lista.forEach(anotar)
      return lista
    },
    obter: async (id) => anotar(await naFila(() => base.obter(id))),
    gravar: (f) =>
      naFila(async () => {
        const atual = await base.obter(f.envioId)
        if (atual && vistas.has(f.envioId) && atual.atualizadaEm !== vistas.get(f.envioId)) return
        await base.gravar(f)
        vistas.set(f.envioId, f.atualizadaEm)
      }),
    apagar: (id) => naFila(() => base.apagar(id)),
    lerMeta: (k) => base.lerMeta(k),
    gravarMeta: (k, v) => naFila(() => base.gravarMeta(k, v)),
  }
}

// ---- Avisos rápidos e navegação ---------------------------------------------------------------------------------------

let idAviso = 0
export function avisar(texto: string, tom: 'ok' | 'aviso' | 'erro' = 'ok'): void {
  const id = ++idAviso
  mudarEstado({ aviso: { texto, tom, id } })
  setTimeout(
    () => {
      if (lerEstado().aviso?.id === id) mudarEstado({ aviso: null })
    },
    tom === 'erro' ? 6000 : 3500,
  )
}

export function ir(tela: Tela): void {
  mudarEstado((e) => ({ pilha: [...e.pilha, tela] }))
}

/** Troca a tela de cima (sem empilhar). */
export function trocar(tela: Tela): void {
  mudarEstado((e) => ({ pilha: [...e.pilha.slice(0, -1), tela] }))
}

/** Volta para a lista e abre a tela (a lista fica embaixo). */
export function irDaLista(tela?: Tela): void {
  mudarEstado({ pilha: tela ? [{ nome: 'lista' }, tela] : [{ nome: 'lista' }] })
}

/**
 * O botão/gesto de voltar do Android: fecha o que está aberto por cima da tela (app/camadas.ts: a folha que sobe de
 * baixo, o PIN, o teclado do app); sem nada aberto, é o voltar da tela.
 */
export function voltarDoAndroid(): boolean {
  const fechar = lerEstado().lendoQr ? undefined : camadaDeCima()
  if (fechar) {
    fechar()
    return true
  }
  return voltar()
}

/**
 * Voltar da tela (◂, ou o gesto do Android sem nada aberto por cima). Nunca descarta nada: tudo já está gravado. false =
 * já está na lista.
 */
export function voltar(): boolean {
  const e = lerEstado()
  if (e.lendoQr) {
    cancelarLeituraQr()
    return true
  }
  const t = telaAtual(e)
  // No modo entrega, voltar não faz nada (a saída pede o PIN do técnico)
  if (t.nome === 'entregaCliente') return true
  // Voltar da assinatura do técnico (antes de assinar) devolve a folha para edição
  if (t.nome === 'assinaturaTecnico') void mudarFolha(t.envioId, (f) => cancelarAssinaturas(f, relogioDoAparelho.agora()))
  if (e.pilha.length <= 1) return false
  mudarEstado({ pilha: e.pilha.slice(0, -1) })
  return true
}

// ---- Abrir o app -------------------------------------------------------------------------------------------------------

function aplicarTema(tema: Tema): void {
  const escuro = tema === 'ESCURO' || (tema === 'SISTEMA' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light'
  void SystemBars.setStyle({ style: escuro ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined)
}

export async function iniciar(): Promise<void> {
  try {
    repo = await abrirRepositorio()
  } catch (e) {
    mudarEstado({
      carregado: true,
      erroAoAbrir: `Não consegui abrir o banco das folhas (${e instanceof Error ? e.message : String(e)}). Feche o app e abra de novo.`,
    })
    return
  }
  const [token, endereco, servidor, tecnico, aparelhoId, pareadoEm, pinHash, tentativas, tema, hora, descadastrado, naoPareado] =
    await Promise.all([
      lerPreferencia(PREF.token),
      lerPreferencia(PREF.endereco),
      lerJson<ServidorCampo>(PREF.servidor),
      lerJson<PessoaCampo>(PREF.tecnico),
      lerPreferencia(PREF.aparelhoId),
      lerPreferencia(PREF.pareadoEm),
      lerPreferencia(PREF.pinHash),
      lerPreferencia(PREF.pinTentativas),
      lerPreferencia(PREF.tema),
      lerPreferencia(PREF.horaLembrete),
      lerPreferencia(PREF.descadastrado),
      lerPreferencia(PREF.naoPareado),
    ])
  const pareamento: Pareamento | null =
    token && endereco && servidor && tecnico
      ? { token, endereco, servidor, tecnico, aparelhoId: aparelhoId ?? '', pareadoEm: pareadoEm ?? '' }
      : null
  const folhas = await repo.listar()
  let ultima: ResultadoSincronia | null = null
  try {
    ultima = JSON.parse((await repo.lerMeta(META.ultimaSincronia)) ?? 'null') as ResultadoSincronia | null
  } catch {
    ultima = null
  }
  const temaEscolhido: Tema = tema === 'CLARO' || tema === 'ESCURO' ? tema : 'SISTEMA'
  aplicarTema(temaEscolhido)
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => aplicarTema(lerEstado().tema))
  // O modo entrega fica gravado: o app reabre nele
  const emEntrega = folhas.find((f) => f.modoEntrega)
  mudarEstado({
    carregado: true,
    pareamento,
    temPin: !!lerHashPin(pinHash),
    tentativasPin: lerTentativas(tentativas),
    tema: temaEscolhido,
    horaLembrete: hora || HORA_LEMBRETE_PADRAO,
    folhas,
    ultima,
    ultimaEntrega: (await repo.lerMeta(META.ultimaEntrega)) ?? '',
    descadastrado: descadastrado === '1',
    naoPareado: naoPareado === '1',
    pilha: emEntrega ? [{ nome: 'lista' }, { nome: 'entregaCliente', envioId: emEntrega.envioId }] : [{ nome: 'lista' }],
    modeloAparelho: await modeloDoAparelho(),
  })
  await ficarEmPe()
  await ouvirEventos({
    aoVoltar: () => {
      if (lerEstado().pareamento && !lerEstado().lendoQr) void sincronizar()
    },
    aoSair: () => {
      // Foi para segundo plano com o celular na mão do cliente: volta pedindo o PIN
      if (telaAtual(lerEstado()).nome === 'entregaCliente') mudarEstado({ pinAoVoltar: true })
    },
    aoVoltarTela: voltarDoAndroid,
  })
  if (pareamento) void sincronizar()
}

// ---- Folhas ----------------------------------------------------------------------------------------------------------

function exigirRepo(): Repositorio {
  if (!repo) throw new Error('O banco das folhas não está aberto.')
  return repo
}

/**
 * Muda uma folha e grava (a cada alteração). A função recebe a folha guardada mais nova. Uma operação que não vale
 * (ErroFolha) vira um aviso com a frase; a folha não muda. Devolve a folha gravada, ou null.
 */
export function mudarFolha(
  envioId: string,
  mudar: (f: FolhaLocal) => FolhaLocal | Promise<FolhaLocal>,
): Promise<FolhaLocal | null> {
  return naFila(async () => {
    const r = exigirRepo()
    const atual = await r.obter(envioId)
    if (!atual) return null
    let nova: FolhaLocal
    try {
      nova = await mudar(atual)
    } catch (e) {
      if (e instanceof ErroFolha) {
        avisar(e.message, 'erro')
        return null
      }
      throw e
    }
    if (nova === atual) return atual
    try {
      await r.gravar(nova)
    } catch (e) {
      avisar(`Não consegui gravar no celular (${e instanceof Error ? e.message : String(e)}). Tente de novo.`, 'erro')
      return null
    }
    mudarEstado((s) => ({ folhas: s.folhas.map((f) => (f.envioId === envioId ? nova : f)), salvoEm: Date.now() }))
    if (nova.estado !== atual.estado) void lembrete()
    return nova
  })
}

/** O técnico viu o aviso "A FC-… foi retirada pelo escritório". */
export async function avisosRetiradaVistos(): Promise<void> {
  for (const f of lerEstado().folhas.filter((x) => x.estado === 'RETIRADA' && !x.avisoRetiradaVisto))
    await mudarFolha(f.envioId, (x) => ({ ...x, avisoRetiradaVisto: true }))
}

async function lembrete(): Promise<void> {
  const e = lerEstado()
  await atualizarLembrete(paraEntregar(e.folhas).length, e.horaLembrete)
}

// ---- Sincronia ---------------------------------------------------------------------------------------------------------

function cliente(endereco?: string, token?: string): ClienteCampo {
  return new ClienteCampo(
    () => {
      const p = lerEstado().pareamento
      return { endereco: endereco ?? p?.endereco ?? '', token: token ?? p?.token ?? '' }
    },
    transporteCapacitor,
    relogioDoAparelho,
  )
}

let rodando: Promise<ResultadoSincronia | null> | null = null

/** Uma rodada de sincronia (ao abrir, ao voltar para o app, "Atualizar agora", depois de finalizar). */
export function sincronizar(): Promise<ResultadoSincronia | null> {
  if (rodando) return rodando
  const e = lerEstado()
  if (!e.pareamento || !repo) return Promise.resolve(null)
  const base = repo
  mudarEstado({ sincronizando: true })
  rodando = (async () => {
    try {
      const r = await rodadaDeSincronia({
        repositorio: repositorioDaSincronia(base),
        api: cliente(),
        relogio: relogioDoAparelho,
        sha256: sha,
        versaoApp: e.versaoApp,
      })
      const folhas = await naFila(() => base.listar())
      const p = lerEstado().pareamento
      const pareamento = p && r.tecnico && r.servidor ? { ...p, tecnico: r.tecnico, servidor: r.servidor } : p
      if (pareamento && pareamento !== p) {
        await gravarJson(PREF.tecnico, pareamento.tecnico)
        await gravarJson(PREF.servidor, pareamento.servidor)
      }
      const conectouBem = r.conectou && !r.falha
      const descadastrado = r.descadastrado || (lerEstado().descadastrado && !conectouBem)
      const naoPareado = r.naoPareado || (lerEstado().naoPareado && !conectouBem)
      await gravarPreferencia(PREF.descadastrado, descadastrado ? '1' : null)
      await gravarPreferencia(PREF.naoPareado, naoPareado ? '1' : null)
      mudarEstado({
        folhas,
        ultima: r,
        pareamento,
        descadastrado,
        naoPareado,
        ultimaEntrega: (await base.lerMeta(META.ultimaEntrega)) ?? lerEstado().ultimaEntrega,
      })
      await lembrete()
      return r
    } catch (erro) {
      avisar(
        `A entrega parou por um problema no app (${erro instanceof Error ? erro.message : String(erro)}). As folhas continuam no celular.`,
        'erro',
      )
      return null
    } finally {
      rodando = null
      mudarEstado({ sincronizando: false })
    }
  })()
  return rodando
}

// ---- Pareamento ------------------------------------------------------------------------------------------------------

/** Lê o QR do computador. Devolve o endereço e o código (código '' no QR só do endereço), null se cancelou. */
export async function lerQrDoComputador(): Promise<{ servidor: string; codigo: string } | null> {
  mudarEstado({ lendoQr: true })
  try {
    const texto = await lerQr()
    if (texto === null) return null
    const qr = lerQrPareamento(texto)
    if (!qr) throw new ErroQr('Este QR não é do BC Calibração. Leia o QR que aparece na tela "Cadastrar celular" do computador.')
    return qr
  } finally {
    mudarEstado({ lendoQr: false })
  }
}

/** Pareia este celular (QR ou digitado). Devolve a frase do problema, ou null se deu certo. */
export async function parear(dados: { endereco: string; codigo: string; novoPin?: boolean }): Promise<string | null> {
  const e = normalizarEnderecoServidor(dados.endereco)
  if (!e.ok) return e.erro
  const codigo = normalizarCodigo(dados.codigo)
  if (!codigo) return 'O código tem 6 dígitos. Confira na tela do computador.'
  const api = cliente(e.endereco, '')
  const saude = await api.saude()
  if (!saude.ok) {
    if (saude.falha.tipo !== 'REDE') return 'Esse endereço não é de um servidor BC Calibração.'
    // Antes do primeiro cadastro ainda não existe o Menu: o endereço se digita nesta mesma tela
    if (!lerEstado().pareamento && saude.falha.mensagem === MENSAGEM_SEM_SERVIDOR(e.endereco))
      return `Servidor não encontrado em ${e.endereco}. Confira se o celular está no Wi-Fi da empresa e leia o QR de novo, ou digite o endereço e o código.`
    return saude.falha.mensagem
  }
  const r = await api.parear({
    codigo,
    aparelhoId: await idDoAparelho(),
    modelo: lerEstado().modeloAparelho,
    versaoApp: lerEstado().versaoApp,
  })
  if (!r.ok) {
    const corpo = r.falha.tipo === 'HTTP' ? (r.falha.corpo as { tentativasRestantes?: number } | null) : null
    const restantes = corpo?.tentativasRestantes
    return typeof restantes === 'number' && restantes > 0
      ? `${r.falha.mensagem} (${restantes === 1 ? 'resta 1 tentativa' : `restam ${restantes} tentativas`})`
      : r.falha.mensagem
  }
  // O PIN é pessoal: "Esqueci o PIN" ou o celular passando para outro técnico pedem um PIN novo (as folhas ficam)
  const apagarPin = pareamentoApagaPin({
    esqueciPin: dados.novoPin,
    tecnicoAnterior: lerEstado().pareamento?.tecnico.id,
    tecnicoNovo: r.valor.tecnico.id,
  })
  const pareamento: Pareamento = {
    endereco: e.endereco,
    token: r.valor.token,
    tecnico: r.valor.tecnico,
    servidor: r.valor.servidor,
    aparelhoId: r.valor.aparelhoId,
    pareadoEm: relogioDoAparelho.agora(),
  }
  await gravarPreferencia(PREF.token, pareamento.token)
  await gravarPreferencia(PREF.endereco, pareamento.endereco)
  await gravarJson(PREF.tecnico, pareamento.tecnico)
  await gravarJson(PREF.servidor, pareamento.servidor)
  await gravarPreferencia(PREF.pareadoEm, pareamento.pareadoEm)
  await gravarPreferencia(PREF.descadastrado, null)
  await gravarPreferencia(PREF.naoPareado, null)
  if (apagarPin) {
    await gravarPreferencia(PREF.pinHash, null)
    await gravarPreferencia(PREF.pinTentativas, null)
  }
  mudarEstado((s) => ({
    pareamento,
    descadastrado: false,
    naoPareado: false,
    temPin: apagarPin ? false : s.temPin,
    tentativasPin: apagarPin ? registrarAcertoPin() : s.tentativasPin,
    pilha: [{ nome: 'lista' }],
  }))
  void sincronizar()
  return null
}

/** Menu → "Endereço do servidor": confere que ali está o MESMO servidor do pareamento e grava. */
export async function mudarEndereco(texto: string): Promise<string | null> {
  const p = lerEstado().pareamento
  if (!p) return 'Este celular ainda não está cadastrado.'
  const e = normalizarEnderecoServidor(texto)
  if (!e.ok) return e.erro
  const saude = await cliente(e.endereco, '').saude()
  if (!saude.ok) return saude.falha.tipo === 'REDE' ? saude.falha.mensagem : 'Esse endereço não é de um servidor BC Calibração.'
  if (saude.valor.id !== p.servidor.id)
    return `Esse endereço é de outro servidor BC Calibração (${saude.valor.nome}). Para trocar de servidor, peça ao escritório para cadastrar o celular de novo.`
  await gravarPreferencia(PREF.endereco, e.endereco)
  mudarEstado({ pareamento: { ...p, endereco: e.endereco } })
  void sincronizar()
  return null
}

// ---- PIN ----------------------------------------------------------------------------------------------------------------

export async function criarPin(pin: string): Promise<void> {
  const hash = await criarHashPin(pin)
  await gravarPreferencia(PREF.pinHash, JSON.stringify(hash))
  await gravarPreferencia(PREF.pinTentativas, null)
  mudarEstado({ temPin: true, tentativasPin: registrarAcertoPin() })
  // O lembrete do fim do expediente precisa da permissão de notificações (Android 13+): pedida uma vez, aqui
  void pedirPermissaoNotificacoes()
}

/** Confere o PIN do técnico. Erros seguidos fazem esperar (5 erros: 30 s, e dobra). */
export async function conferirPinDoTecnico(pin: string): Promise<{ ok: boolean; mensagem: string }> {
  const agora = relogioDoAparelho.ms()
  const t = lerEstado().tentativasPin
  const espera = esperaRestante(t, agora)
  if (espera > 0) return { ok: false, mensagem: textoDaEspera(espera) }
  const hash = lerHashPin(await lerPreferencia(PREF.pinHash))
  if (!hash) return { ok: false, mensagem: 'O PIN não está criado. Peça ao escritório para cadastrar o celular de novo.' }
  if (await conferirPin(pin, hash)) {
    await gravarPreferencia(PREF.pinTentativas, null)
    mudarEstado({ tentativasPin: registrarAcertoPin() })
    return { ok: true, mensagem: '' }
  }
  const nova = registrarErroPin(t, agora)
  await gravarPreferencia(PREF.pinTentativas, JSON.stringify(nova))
  mudarEstado({ tentativasPin: nova })
  const esperar = esperaRestante(nova, agora)
  return { ok: false, mensagem: esperar ? textoDaEspera(esperar) : 'PIN errado.' }
}

// ---- Ajustes do Menu ----------------------------------------------------------------------------------------------------

export async function mudarTema(tema: Tema): Promise<void> {
  await gravarPreferencia(PREF.tema, tema)
  mudarEstado({ tema })
  aplicarTema(tema)
}

export async function mudarHoraLembrete(hora: string): Promise<void> {
  await gravarPreferencia(PREF.horaLembrete, hora)
  mudarEstado({ horaLembrete: hora })
  await lembrete()
}

/** "Há uma versão nova": abre o APK no navegador (bloqueado com folha começada e não entregue). */
export function atualizarApp(caminho: string): string | null {
  const e = lerEstado()
  const n = naoEntregues(e.folhas).length
  if (n)
    return `Há ${n === 1 ? '1 folha que ainda não chegou' : `${n} folhas que ainda não chegaram`} à empresa. Entregue antes de atualizar o app.`
  if (!e.pareamento) return MENSAGENS_ERRO_CAMPO.NAO_PAREADO
  abrirNoNavegador(urlCampo(e.pareamento.endereco, caminho))
  return null
}

/** Descadastrar este celular (só sem folha começada e não entregue): esquece o pareamento, o PIN e as folhas. */
export async function descadastrar(): Promise<string | null> {
  const e = lerEstado()
  const n = naoEntregues(e.folhas).length
  if (n)
    return `Há ${n === 1 ? '1 folha começada' : `${n} folhas começadas`} e não entregue${n === 1 ? '' : 's'}. Entregue antes de descadastrar.`
  const r = exigirRepo()
  await naFila(async () => {
    for (const f of await r.listar()) await r.apagar(f.envioId)
    await r.gravarMeta(META.ultimaSincronia, null)
    await r.gravarMeta(META.ultimaEntrega, null)
  })
  for (const k of [
    PREF.token,
    PREF.endereco,
    PREF.tecnico,
    PREF.servidor,
    PREF.pareadoEm,
    PREF.pinHash,
    PREF.pinTentativas,
    PREF.descadastrado,
    PREF.naoPareado,
  ])
    await gravarPreferencia(k, null)
  await atualizarLembrete(0, e.horaLembrete)
  mudarEstado({
    pareamento: null,
    temPin: false,
    folhas: [],
    ultima: null,
    ultimaEntrega: '',
    descadastrado: false,
    naoPareado: false,
    pilha: [{ nome: 'lista' }],
  })
  return null
}

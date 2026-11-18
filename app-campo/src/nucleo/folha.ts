// A folha no celular: o estado local (RECEBENDO → NOVA → EM_PREENCHIMENTO → FINALIZADA → ENTREGUE, com REABERTA e
// RETIRADA), a trilha de correções antes de assinar, o Finalizar (conteudoSha256 interno), as assinaturas, o modo
// entrega (gravado: o app reabre nele), encerrar sem completar, recomeçar os ensaios (a tentativa anterior fica só para
// consulta), a correção depois da assinatura (por acréscimo, com motivo) e o Reabrir (apaga as assinaturas).
//
// Funções puras: recebem a folha e devolvem a folha nova (nunca mudam a recebida). Uma operação que não vale no estado da
// folha lança `ErroFolha`, com a frase para o técnico. Quem grava é o chamador (o repositório grava a cada alteração).
// O PIN é conferido pelas telas antes de chamar as operações que pedem PIN (correção, reabrir, sair do modo entrega).

import { leiturasDoRegistro } from '../../../shared/campo/avisos.ts'
import { calcularConteudoSha256, calcularSha256Registro } from '../../../shared/campo/canonico.ts'
import type { FuncaoSha256 } from '../../../shared/campo/canonico.ts'
import { registroCorrigido } from '../../../shared/campo/importar.ts'
import { podeFinalizar } from '../../../shared/campo/progresso.ts'
import type { EtapaFolha } from '../../../shared/campo/progresso.ts'
import type { ResumoEnvio } from '../../../shared/campo/protocolo.ts'
import {
  instanteValido,
  leituraTextoValida,
  novaLeitura,
  registroInicial,
  validarPng,
  validarRegistro,
} from '../../../shared/campo/registro.ts'
import type {
  AparelhoCampo,
  ConferenciaCampo,
  Desfecho,
  EstadoFolhaCelular,
  Instante,
  LeituraCampo,
  PacoteCampo,
  PessoaCampo,
  PontoCampo,
  ProblemaRegistro,
  ReciboCampo,
  RegistroCampo,
  ViaLeitura,
} from '../../../shared/campo/tipos.ts'
import { ESTADOS_COMECADOS } from '../../../shared/campo/tipos.ts'

/** O modo entrega: o celular está com quem acompanhou pelo cliente. Gravado; toda saída pede o PIN do técnico. */
export interface ModoEntrega {
  desde: Instante
  /** DADOS (resumo, nome e função), ASSINATURA (a tela deitada) ou PRONTO ("Pronto. Devolva o celular ao técnico."). */
  tela: 'DADOS' | 'ASSINATURA' | 'PRONTO'
  nome: string
  funcao: string
}

/** Tentativas de entrega que não deram certo (a folha continua no celular). */
export interface EntregaLocal {
  tentativas: number
  ultimaEm: Instante
  /** A frase do último problema ('' sem problema). */
  erro: string
}

/** Uma folha no celular, como o repositório guarda. */
export interface FolhaLocal {
  envioId: string
  /** FC-AAAA-NNNNN. */
  numero: string
  estado: EstadoFolhaCelular
  /** O que o olá mostrou (cliente, balança, data prevista…): fica também depois da entrega, por 7 dias. */
  resumo: ResumoEnvio
  /** O pacote baixado; null depois da entrega ou da retirada. */
  pacote: PacoteCampo | null
  /** sha256 do pacote (interno). */
  pacoteSha256: string
  /** O registro (desde "Começar a folha"); null antes de começar e depois da entrega. */
  registro: RegistroCampo | null
  recebidaEm: Instante
  /** Resposta NO_CELULAR do servidor ('' = ainda não confirmada: a folha não pode ser começada). */
  confirmadaEm: Instante
  atualizadaEm: Instante
  /** Onde o técnico parou ("Continuar do passo n"). */
  etapaAtual: EtapaFolha | null
  /** Calculado em "Finalizar e colher assinaturas" (interno; nunca aparece). '' fora da assinatura. */
  conteudoSha256: string
  modoEntrega: ModoEntrega | null
  /** Já respondeu "Já comecei" a um pedido de recolher. */
  respondeuJaComecei: boolean
  entrega: EntregaLocal
  /** O recibo do servidor (depois da entrega). */
  recibo: ReciboCampo | null
  entregueEm: Instante
  retiradaEm: Instante
  motivoRetirada: '' | 'RECOLHIDA' | 'DESCONHECIDO'
  /** O técnico já viu o aviso "A FC-… foi retirada pelo escritório". */
  avisoRetiradaVisto: boolean
}

/** Uma operação que não vale no estado da folha (a frase vai para o técnico). */
export class ErroFolha extends Error {
  readonly problemas: ProblemaRegistro[]
  constructor(mensagem: string, problemas: ProblemaRegistro[] = []) {
    super(mensagem)
    this.name = 'ErroFolha'
    this.problemas = problemas
  }
}

/** Dias que o resumo de uma folha entregue (ou retirada) fica no celular. */
export const DIAS_NO_CELULAR_DEPOIS = 7

const copia = <T>(v: T): T => structuredClone(v)

function exigir(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new ErroFolha(mensagem)
}

// ---- Recebimento --------------------------------------------------------------------------------------------------------

/** A folha recém-baixada (RECEBENDO): ainda não pode ser começada, falta a confirmação do servidor. */
export function folhaRecebida(resumo: ResumoEnvio, pacote: PacoteCampo, pacoteSha256: string, agora: Instante): FolhaLocal {
  return {
    envioId: pacote.envioId,
    numero: pacote.folha.numero,
    estado: 'RECEBENDO',
    resumo: { ...resumo, numero: pacote.folha.numero },
    pacote,
    pacoteSha256,
    registro: null,
    recebidaEm: agora,
    confirmadaEm: '',
    atualizadaEm: agora,
    etapaAtual: null,
    conteudoSha256: '',
    modoEntrega: null,
    respondeuJaComecei: false,
    entrega: { tentativas: 0, ultimaEm: '', erro: '' },
    recibo: null,
    entregueEm: '',
    retiradaEm: '',
    motivoRetirada: '',
    avisoRetiradaVisto: false,
  }
}

/** O servidor confirmou o recebimento (NO_CELULAR): a folha fica NOVA ("Pronta para o campo"). */
export function recebimentoConfirmado(f: FolhaLocal, agora: Instante): FolhaLocal {
  if (f.estado !== 'RECEBENDO') return f
  return { ...f, estado: 'NOVA', confirmadaEm: agora, atualizadaEm: agora }
}

/** Folha começada: só sai do celular com o recibo do servidor. */
export const folhaComecada = (f: Pick<FolhaLocal, 'estado'>) => ESTADOS_COMECADOS.includes(f.estado)

/**
 * Retirada pelo escritório (recolher) ou desconhecida do servidor, ANTES de começar: os dados saem do celular e fica o
 * aviso "A FC-… foi retirada pelo escritório". Folha começada nunca é retirada (lança).
 */
export function folhaRetirada(f: FolhaLocal, motivo: 'RECOLHIDA' | 'DESCONHECIDO', agora: Instante): FolhaLocal {
  exigir(!folhaComecada(f), `A ${f.numero} já foi começada: ela só sai do celular depois da entrega.`)
  if (f.estado === 'RETIRADA' || f.estado === 'ENTREGUE') return f
  return {
    ...f,
    estado: 'RETIRADA',
    pacote: null,
    registro: null,
    retiradaEm: agora,
    motivoRetirada: motivo,
    // A desconhecida sai sem aviso (por exemplo, depois de "Apagar os testes" no escritório)
    avisoRetiradaVisto: motivo === 'DESCONHECIDO',
    atualizadaEm: agora,
  }
}

// ---- Preenchimento ------------------------------------------------------------------------------------------------------

/** "Começar a folha": só depois da confirmação do servidor (NOVA). Nada é preenchido sem um toque do técnico. */
export function comecar(f: FolhaLocal, tecnico: PessoaCampo, aparelho: AparelhoCampo, agora: Instante): FolhaLocal {
  exigir(
    f.estado === 'NOVA',
    f.estado === 'RECEBENDO' ? 'Conecte-se à rede da empresa para confirmar o recebimento.' : 'Esta folha já foi começada.',
  )
  exigir(f.pacote, 'O pacote desta folha não está no celular.')
  const registro = registroInicial(f.pacote, tecnico, aparelho, { pacoteSha256: f.pacoteSha256, agora })
  return { ...f, estado: 'EM_PREENCHIMENTO', registro, etapaAtual: 'padroes', atualizadaEm: agora }
}

/** Está colhendo as assinaturas (depois de "Finalizar e colher assinaturas"): a folha fica congelada. */
export const emAssinatura = (f: FolhaLocal) => (f.estado === 'EM_PREENCHIMENTO' || f.estado === 'REABERTA') && !!f.conteudoSha256

/** Dá para mudar os passos? (em preenchimento ou reaberta, fora da assinatura) */
export const podeEditar = (f: FolhaLocal) =>
  (f.estado === 'EM_PREENCHIMENTO' || f.estado === 'REABERTA') && !f.conteudoSha256 && !!f.registro

function textoDaConferencia(c: ConferenciaCampo): string {
  if (c.confere === true) return 'Confere'
  if (c.confere === false) return c.observado?.trim() ? `Algo diferente: ${c.observado.trim()}` : 'Algo diferente'
  return ''
}

/**
 * Os valores que, uma vez confirmados, só mudam com o registro da correção (o "risco único" do papel): as leituras (o
 * texto como digitado), as conferências dos dados impressos, onde foi feita, as datas e horas, o CAL e a confirmação da
 * excentricidade. Os textos livres (anotações, motivos, material) ficam de fora: mudam a cada tecla.
 */
export function valoresRastreados(r: RegistroCampo): Map<string, string> {
  const m = new Map<string, string>()
  for (const { campo, leitura } of leiturasDoRegistro(r)) m.set(campo, leitura.valor)
  const ps = r.passos
  for (const c of [...ps.chegada.conferencias, ...ps.balanca.conferencias]) m.set(c.campo, textoDaConferencia(c))
  m.set('chegada.local', ps.chegada.local)
  m.set('chegada.inicio', ps.chegada.inicio)
  m.set('final.termino', ps.final.termino)
  m.set('final.dataCalibracao', ps.final.dataCalibracao)
  ps.ambiente.linhas.forEach((l, i) => m.set(`ambiente.linhas.${i}.em`, l.em))
  m.set('ambiente.pesosNoLocalDesde', ps.ambiente.pesosNoLocalDesde)
  if (ps.indicacao.calInterno)
    m.set('indicacao.calInterno', ps.indicacao.calInterno.feito ? `feito ${ps.indicacao.calInterno.em}`.trim() : '')
  m.set(
    'excentricidade.aplicavel',
    ps.excentricidade.aplicavel === null ? '' : ps.excentricidade.aplicavel ? 'feito' : 'não feito',
  )
  return m
}

/**
 * Muda o registro (a função recebe uma cópia e pode mexer nela à vontade) e anota na trilha cada valor já confirmado que
 * mudou (de → para, com a hora). Medir de novo (uma medição nova numa lista) não é correção: é outra observação.
 */
export function editar(f: FolhaLocal, mudar: (r: RegistroCampo) => void, agora: Instante): FolhaLocal {
  exigir(f.registro, 'Esta folha ainda não foi começada.')
  exigir(
    podeEditar(f),
    f.estado === 'FINALIZADA'
      ? 'A folha está trancada. Use "Corrigir…" ou "Reabrir…".'
      : emAssinatura(f)
        ? 'A folha está sendo assinada. Volte da assinatura para mudar algo.'
        : 'Esta folha não pode ser mudada agora.',
  )
  const antes = valoresRastreados(f.registro)
  const novo = copia(f.registro)
  mudar(novo)
  const depois = valoresRastreados(novo)
  for (const [campo, de] of antes) {
    const para = depois.get(campo) ?? ''
    if (de && para !== de) novo.trilha.push({ campo, de, para, em: agora, motivo: '' })
  }
  return { ...f, registro: novo, atualizadaEm: agora }
}

// ---- Caminhos (o mesmo `campo` dos avisos, das correções e da trilha) --------------------------------------------------

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** O item de uma lista pelo id (quando os itens têm id) ou pela posição. */
function itemDaLista(lista: unknown[], chave: string): { item: unknown; indice: number } {
  const porId = lista.findIndex((x) => ehObj(x) && x.id === chave)
  if (porId >= 0) return { item: lista[porId], indice: porId }
  const i = /^\d+$/.test(chave) ? Number(chave) : -1
  return { item: i >= 0 && i < lista.length ? lista[i] : undefined, indice: i }
}

/** O valor num caminho a partir de `passos` ("indicacao.pontos.p3.crescente"); undefined se não existe. */
export function lerNoCaminho(r: RegistroCampo, campo: string): unknown {
  let no: unknown = r.passos
  for (const p of campo.split('.')) {
    if (Array.isArray(no)) no = itemDaLista(no, p).item
    else if (ehObj(no)) no = no[p]
    else return undefined
  }
  return no
}

/** A leitura num caminho (null = vazia; undefined = o caminho não é de leitura ou não existe). */
export function lerLeitura(r: RegistroCampo, campo: string): LeituraCampo | null | undefined {
  const v = lerNoCaminho(r, campo)
  if (v === null) return null
  return ehObj(v) && typeof v.valor === 'string' ? (v as unknown as LeituraCampo) : undefined
}

/**
 * Grava (ou apaga, com null) uma leitura no caminho, numa cópia de trabalho (`editar`). Também a próxima posição de uma
 * lista ("repetibilidade.rep1.leituras.5" com 5 leituras acrescenta; "ambiente.deltaT.2.valor" mede de novo). Numa
 * lista de leituras, só a última pode ser apagada (as outras mudariam de posição). Caminho que não é de leitura: lança.
 */
export function gravarLeitura(r: RegistroCampo, campo: string, leitura: LeituraCampo | null): void {
  if (leitura && !leituraTextoValida(leitura.valor)) throw new ErroFolha('Leitura fora do formato do teclado.')
  const partes = campo.split('.')
  const ultima = partes.at(-1)!
  // ΔT: "ambiente.deltaT.<i>.valor" — cada medição é uma observação própria
  const dt = /^ambiente\.deltaT\.(\d+)(?:\.valor)?$/.exec(campo)
  if (dt) {
    const lista = r.passos.ambiente.deltaT
    const i = Number(dt[1])
    if (i === lista.length) {
      if (leitura) lista.push({ valor: leitura, instrumento: lista.at(-1)?.instrumento ?? '' })
      return
    }
    exigir(i < lista.length, 'Medição do ΔT fora da lista.')
    if (leitura) lista[i] = { ...lista[i], valor: leitura }
    else {
      exigir(i === lista.length - 1, 'Só a última medição do ΔT pode ser apagada.')
      lista.pop()
    }
    return
  }
  if (campo === 'ambiente.deltaT0.origem' || campo === 'ambiente.deltaT0.sala') {
    const a = r.passos.ambiente
    a.deltaT0 ??= { origem: null, sala: null, em: '' }
    a.deltaT0[ultima as 'origem' | 'sala'] = leitura
    return
  }
  let no: unknown = r.passos
  for (const p of partes.slice(0, -1)) {
    if (Array.isArray(no)) no = itemDaLista(no, p).item
    else if (ehObj(no)) no = no[p]
    else no = undefined
    exigir(no !== undefined && no !== null, `Campo inexistente: ${campo}.`)
  }
  if (Array.isArray(no)) {
    // Uma lista de leituras (repetibilidade.<id>.leituras.<j>)
    exigir(partes.at(-2) === 'leituras', `Campo inexistente: ${campo}.`)
    const j = Number(ultima)
    exigir(Number.isInteger(j) && j >= 0 && j <= no.length, 'Leitura fora da lista.')
    if (leitura) {
      if (j === no.length) no.push(leitura)
      else no[j] = leitura
    } else if (j < no.length) {
      exigir(j === no.length - 1, 'Só a última leitura da lista pode ser apagada.')
      no.pop()
    }
    return
  }
  exigir(ehObj(no) && ultima in no, `Campo inexistente: ${campo}.`)
  const atual = no[ultima]
  exigir(atual === null || (ehObj(atual) && typeof atual.valor === 'string'), `${campo} não é uma leitura.`)
  no[ultima] = leitura
}

/**
 * Confirma o que foi digitado numa leitura (o "Próxima" ou o toque noutra célula), numa cópia de trabalho (`editar`).
 * Mudar uma leitura que já existe é corrigir a digitação: fica a hora da observação, não a da correção (a hora decide o
 * ΔT e a linha do início que valem; uma medição nova é "Medir de novo"). Apagada e digitada de novo, vale a hora nova.
 * Texto vazio apaga.
 */
export function confirmarLeitura(r: RegistroCampo, campo: string, texto: string, via: ViaLeitura, agora: Instante): void {
  const antes = lerLeitura(r, campo)
  gravarLeitura(r, campo, texto ? novaLeitura(texto, via, antes?.em || agora) : null)
}

// ---- Finalizar e assinar --------------------------------------------------------------------------------------------

/** O ponto acrescentado no local sem carga e sem leitura ("+ Acrescentar ponto" tocado e deixado em branco). */
export const pontoAcrescentadoVazio = (p: PontoCampo): boolean =>
  p.acrescentado && p.cargaAplicada === null && p.crescente === null && p.decrescente === null

/**
 * "Finalizar e colher assinaturas": confere o "Falta para assinar" (ou o motivo de encerrar sem completar) e o formato
 * (`validarRegistro`, momento FINALIZAR), congela a hora de finalizar e calcula o conteúdo que as assinaturas amarram.
 */
export async function iniciarAssinaturas(f: FolhaLocal, sha: FuncaoSha256, agora: Instante): Promise<FolhaLocal> {
  exigir(f.registro && podeEditar(f), 'Esta folha não pode ser finalizada agora.')
  const pf = podeFinalizar(f.registro, f.pacote)
  exigir(pf.pode, pf.motivo)
  const congelado = copia(f.registro)
  congelado.relogio.finalizadoEm = agora
  if (congelado.desfecho === 'COMPLETA') congelado.motivoDesfecho = ''
  // "+ Acrescentar ponto" tocado e deixado em branco (sem carga e sem leitura) não é dado: sai da folha. Com leitura e
  // sem a carga, a frase do que fazer (o Nº da tabela), em vez do "problema de formato": a carga não se inventa
  const ind = congelado.passos.indicacao
  const semCarga = ind.pontos.findIndex((p) => p.acrescentado && p.cargaAplicada === null && !pontoAcrescentadoVazio(p))
  exigir(
    semCarga < 0,
    `Falta a carga do ponto ${semCarga + 1}, acrescentado no passo 5 (Erro de indicação). Digite a carga aplicada ou apague as leituras desse ponto.`,
  )
  ind.pontos = ind.pontos.filter((p) => !pontoAcrescentadoVazio(p))
  const problemas = validarRegistro(congelado, { pacote: f.pacote, momento: 'FINALIZAR' })
  if (problemas.length)
    throw new ErroFolha(
      `A folha tem ${problemas.length === 1 ? 'um problema' : `${problemas.length} problemas`} de formato. Avise o escritório: ${problemas[0].mensagem}`,
      problemas,
    )
  const conteudoSha256 = await calcularConteudoSha256(congelado, sha)
  return { ...f, registro: congelado, conteudoSha256, atualizadaEm: agora }
}

/** Voltou da assinatura sem assinar: a folha volta a ser editável (a hora de finalizar é apagada). */
export function cancelarAssinaturas(f: FolhaLocal, agora: Instante): FolhaLocal {
  if (!emAssinatura(f) || !f.registro || f.registro.assinaturas.tecnico) return f
  const registro = copia(f.registro)
  registro.relogio.finalizadoEm = ''
  return { ...f, registro, conteudoSha256: '', atualizadaEm: agora }
}

/**
 * Assinatura do técnico (o PIN já foi conferido pela tela). No laboratório, a do cliente fica dispensada e a folha
 * tranca; no cliente, o celular entra no modo entrega ("Entregue o celular a quem acompanhou").
 */
export async function assinarTecnico(f: FolhaLocal, png: string, sha: FuncaoSha256, agora: Instante): Promise<FolhaLocal> {
  exigir(emAssinatura(f) && f.registro, 'Toque em "Finalizar e colher assinaturas" antes de assinar.')
  exigir(!f.registro.assinaturas.tecnico, 'A folha já tem a assinatura do técnico.')
  const problemaPng = validarPng(png)
  exigir(!problemaPng, problemaPng ?? '')
  const conteudo = await calcularConteudoSha256(f.registro, sha)
  exigir(conteudo === f.conteudoSha256, 'A folha mudou depois de "Finalizar". Finalize de novo.')
  const registro = copia(f.registro)
  registro.assinaturas.tecnico = { nome: registro.tecnico.nome, png, em: agora, conteudoSha256: conteudo }
  if (registro.passos.chegada.local === 'LABORATORIO') {
    registro.assinaturas.cliente = { dispensada: 'LABORATORIO' }
    return { ...f, registro, estado: 'FINALIZADA', modoEntrega: null, atualizadaEm: agora }
  }
  return { ...f, registro, modoEntrega: { desde: agora, tela: 'DADOS', nome: '', funcao: '' }, atualizadaEm: agora }
}

/** O técnico assinou e falta o cliente (ou a alternativa). */
export const faltaOCliente = (f: FolhaLocal) =>
  !!f.registro?.assinaturas.tecnico && f.registro.assinaturas.cliente === null && f.estado !== 'FINALIZADA'

/** Atualiza o modo entrega (nome e função digitados, a tela atual): gravado a cada mudança. */
export function atualizarModoEntrega(f: FolhaLocal, parcial: Partial<Omit<ModoEntrega, 'desde'>>, agora: Instante): FolhaLocal {
  exigir(f.modoEntrega, 'O celular não está no modo entrega.')
  return { ...f, modoEntrega: { ...f.modoEntrega, ...parcial }, atualizadaEm: agora }
}

/** "Entregue o celular a quem acompanhou" de novo (depois de "Devolver ao técnico"). */
export function entregarAoCliente(f: FolhaLocal, agora: Instante): FolhaLocal {
  exigir(faltaOCliente(f), 'A folha não está esperando a assinatura do cliente.')
  return { ...f, modoEntrega: { desde: agora, tela: 'DADOS', nome: '', funcao: '' }, atualizadaEm: agora }
}

/** Assinatura de quem acompanhou: nome, função e o desenho. A folha tranca; a tela diz "Devolva o celular ao técnico". */
export function assinarCliente(f: FolhaLocal, dados: { nome: string; funcao: string; png: string }, agora: Instante): FolhaLocal {
  exigir(faltaOCliente(f) && f.registro, 'A folha não está esperando a assinatura do cliente.')
  const nome = dados.nome.trim().replace(/\s+/g, ' ')
  const funcao = dados.funcao.trim().replace(/\s+/g, ' ')
  exigir(nome, 'Escreva o seu nome.')
  exigir(funcao, 'Escreva a sua função.')
  const problemaPng = validarPng(dados.png)
  exigir(!problemaPng, problemaPng ?? '')
  const registro = copia(f.registro)
  registro.assinaturas.cliente = {
    nome,
    funcao,
    png: dados.png,
    em: agora,
    conteudoSha256: registro.assinaturas.tecnico!.conteudoSha256,
  }
  const modoEntrega: ModoEntrega = { ...(f.modoEntrega ?? { desde: agora, nome, funcao }), tela: 'PRONTO', nome, funcao }
  return { ...f, registro, estado: 'FINALIZADA', modoEntrega, atualizadaEm: agora }
}

/** "Cliente não assinou" (com o PIN do técnico): ninguém acompanhou, ou a pessoa recusou. A folha tranca. */
export function clienteNaoAssinou(f: FolhaLocal, motivo: string, agora: Instante): FolhaLocal {
  exigir(faltaOCliente(f) && f.registro, 'A folha não está esperando a assinatura do cliente.')
  exigir(motivo.trim(), 'Escreva por que o cliente não assinou.')
  const registro = copia(f.registro)
  registro.assinaturas.cliente = { naoAssinou: true, motivo: motivo.trim(), em: agora }
  return { ...f, registro, estado: 'FINALIZADA', modoEntrega: null, atualizadaEm: agora }
}

/** Piloto: "O cliente assinou só o papel" (com o PIN do técnico). A folha tranca. */
export function clienteAssinouSoOPapel(f: FolhaLocal, agora: Instante): FolhaLocal {
  exigir(faltaOCliente(f) && f.registro, 'A folha não está esperando a assinatura do cliente.')
  exigir(f.registro.piloto, '"O cliente assinou só o papel" vale só no piloto.')
  const registro = copia(f.registro)
  registro.assinaturas.cliente = { soNoPapel: true }
  return { ...f, registro, estado: 'FINALIZADA', modoEntrega: null, atualizadaEm: agora }
}

/** "Devolver ao técnico" / "Sou o técnico, continuar" (o PIN já foi conferido): sai do modo entrega. */
export function sairDoModoEntrega(f: FolhaLocal, agora: Instante): FolhaLocal {
  if (!f.modoEntrega) return f
  return { ...f, modoEntrega: null, atualizadaEm: agora }
}

/** Desfaz a assinatura do técnico (antes da do cliente) para voltar a mudar a folha. */
export function desfazerAssinaturaTecnico(f: FolhaLocal, agora: Instante): FolhaLocal {
  exigir(faltaOCliente(f) && f.registro, 'Não há assinatura do técnico para desfazer.')
  const registro = copia(f.registro)
  registro.assinaturas = { tecnico: null, cliente: null }
  registro.relogio.finalizadoEm = ''
  return { ...f, registro, conteudoSha256: '', modoEntrega: null, atualizadaEm: agora }
}

// ---- Encerrar sem completar e recomeçar os ensaios -------------------------------------------------------------------

/** "Encerrar sem completar": incompleta ou não calibrada, com um motivo só. Depois, as assinaturas como sempre. */
export function encerrarSemCompletar(
  f: FolhaLocal,
  desfecho: Exclude<Desfecho, 'COMPLETA'>,
  motivo: string,
  agora: Instante,
): FolhaLocal {
  exigir(motivo.trim(), 'Escreva o motivo de encerrar sem completar.')
  return editar(
    f,
    (r) => {
      r.desfecho = desfecho
      r.motivoDesfecho = motivo.trim()
    },
    agora,
  )
}

/** Desiste de encerrar sem completar: a folha volta a precisar de todos os itens com ●. */
export function voltarACompletar(f: FolhaLocal, agora: Instante): FolhaLocal {
  return editar(
    f,
    (r) => {
      r.desfecho = 'COMPLETA'
      r.motivoDesfecho = ''
    },
    agora,
  )
}

/**
 * "A balança precisou de manutenção: recomeçar os ensaios": a tentativa atual (ambiente e passos 5 a 7) fica guardada
 * só para consulta (nunca vai para o rascunho), e esses passos recomeçam vazios. Não é correção: as leituras de antes
 * foram observações de outro estado da balança. "Pesos no local desde" continua (os pesos não saíram).
 */
export function recomecarEnsaios(f: FolhaLocal, motivo: string, agora: Instante): FolhaLocal {
  exigir(f.registro && podeEditar(f), 'Esta folha não pode ser mudada agora.')
  exigir(f.pacote, 'O pacote desta folha não está no celular.')
  exigir(motivo.trim(), 'Escreva o motivo (por exemplo, "manutenção da célula de carga").')
  const r = copia(f.registro)
  const vazio = registroInicial(f.pacote, r.tecnico, r.aparelho, { pacoteSha256: r.pacoteSha256, agora })
  const { ambiente, indicacao, repetibilidade, excentricidade } = r.passos
  r.tentativas.push({
    n: r.tentativas.length + 1,
    motivo: motivo.trim(),
    encerradaEm: agora,
    ambiente,
    indicacao,
    repetibilidade,
    excentricidade,
  })
  r.passos.ambiente = { ...vazio.passos.ambiente, pesosNoLocalDesde: ambiente.pesosNoLocalDesde }
  r.passos.indicacao = vazio.passos.indicacao
  r.passos.repetibilidade = vazio.passos.repetibilidade
  r.passos.excentricidade = vazio.passos.excentricidade
  return { ...f, registro: r, etapaAtual: 'ambiente', atualizadaEm: agora }
}

// ---- Depois de assinar: corrigir e reabrir -------------------------------------------------------------------------

/** O item estava no resumo mostrado a quem acompanhou (ambiente, local, horários, cliente e balança informados)? */
export function campoMostradoAoCliente(campo: string): boolean {
  return (
    /^ambiente\.linhas\.\d+\./.test(campo) ||
    ['chegada.localEndereco', 'chegada.local', 'chegada.inicio', 'final.termino'].includes(campo) ||
    campo.startsWith('chegada.clienteInformado.') ||
    campo.startsWith('balanca.informada.')
  )
}

/** O valor atual de um campo que pode ser corrigido (leitura ou texto), já com as correções anteriores; null se não pode. */
export function valorParaCorrigir(
  r: RegistroCampo,
  campo: string,
): { tipo: 'leitura' | 'texto' | 'instante'; valor: string } | null {
  const corrigido = registroCorrigido(r)
  const v = lerNoCaminho(corrigido, campo)
  const l = lerLeitura(corrigido, campo)
  if (l !== undefined) return { tipo: 'leitura', valor: l?.valor ?? '' }
  if (typeof v !== 'string') return null
  return { tipo: instanteValido(v) || /(inicio|termino|\.em)$/.test(campo) ? 'instante' : 'texto', valor: v }
}

/**
 * Correção depois da assinatura (o PIN já foi conferido): só por acréscimo, com motivo; o valor assinado continua no
 * registro e o novo vale para a calibração. Avisa (marca) quando o item estava no resumo mostrado ao cliente.
 */
export function corrigirDepoisDaAssinatura(
  f: FolhaLocal,
  correcao: { campo: string; para: string; motivo: string },
  agora: Instante,
): FolhaLocal {
  exigir(f.estado === 'FINALIZADA' && f.registro, 'Só uma folha finalizada e ainda não entregue pode ser corrigida assim.')
  const atual = valorParaCorrigir(f.registro, correcao.campo)
  exigir(atual, 'Este item não pode ser corrigido por aqui. Use "Reabrir…".')
  const para = correcao.para.trim()
  if (atual.tipo === 'leitura') exigir(!para || leituraTextoValida(para), 'Digite a leitura com algarismos e vírgula.')
  if (atual.tipo === 'instante') exigir(!para || instanteValido(para), 'Data e hora inválidas.')
  exigir(para !== atual.valor, 'O valor novo é igual ao atual.')
  exigir(correcao.motivo.trim(), 'Escreva o motivo da correção.')
  const registro = copia(f.registro)
  registro.correcoesPosAssinatura.push({
    campo: correcao.campo,
    de: atual.valor,
    para,
    em: agora,
    motivo: correcao.motivo.trim(),
    mostradoAoCliente: campoMostradoAoCliente(correcao.campo),
  })
  return { ...f, registro, atualizadaEm: agora }
}

/**
 * "Reabrir…" (o PIN já foi conferido), para refazer passos: as duas assinaturas são apagadas; a versão anterior fica
 * representada pelo sha256 (interno) e o motivo, em `reaberturas`. As correções depois da assinatura passam para os
 * passos e para a trilha (o valor antigo continua visível).
 */
export async function reabrir(f: FolhaLocal, motivo: string, sha: FuncaoSha256, agora: Instante): Promise<FolhaLocal> {
  exigir(f.estado === 'FINALIZADA' && f.registro, 'Só uma folha finalizada e ainda não entregue pode ser reaberta.')
  exigir(motivo.trim(), 'Escreva por que reabrir.')
  const sha256Anterior = await calcularSha256Registro(f.registro, sha)
  const r = copia(registroCorrigido(f.registro))
  for (const c of f.registro.correcoesPosAssinatura)
    r.trilha.push({ campo: c.campo, de: c.de, para: c.para, em: c.em, motivo: c.motivo })
  r.correcoesPosAssinatura = []
  r.reaberturas.push({ em: agora, motivo: motivo.trim(), sha256Anterior })
  r.assinaturas = { tecnico: null, cliente: null }
  r.relogio.finalizadoEm = ''
  return { ...f, registro: r, estado: 'REABERTA', conteudoSha256: '', modoEntrega: null, atualizadaEm: agora }
}

// ---- Entrega ------------------------------------------------------------------------------------------------------------

/** Recibo conferido: as leituras e as assinaturas saem do celular; fica o resumo (FC, cliente, hora) por 7 dias. */
export function marcarEntregue(f: FolhaLocal, recibo: ReciboCampo, agora: Instante): FolhaLocal {
  exigir(f.estado === 'FINALIZADA', 'Só uma folha finalizada é entregue.')
  return {
    ...f,
    estado: 'ENTREGUE',
    pacote: null,
    registro: null,
    conteudoSha256: '',
    modoEntrega: null,
    recibo,
    entregueEm: agora,
    entrega: { ...f.entrega, erro: '' },
    atualizadaEm: agora,
  }
}

/** A entrega não deu certo: a folha continua no celular, com o motivo para a faixa de entrega. */
export function registrarFalhaEntrega(f: FolhaLocal, erro: string, agora: Instante): FolhaLocal {
  return { ...f, entrega: { tentativas: f.entrega.tentativas + 1, ultimaEm: agora, erro }, atualizadaEm: agora }
}

/** Onde o técnico parou (para "Continuar do passo n"). */
export function definirEtapaAtual(f: FolhaLocal, etapa: EtapaFolha): FolhaLocal {
  return f.etapaAtual === etapa ? f : { ...f, etapaAtual: etapa }
}

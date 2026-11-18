// O "celular" dos testes ponta a ponta (server/campo/sincronia.e2e.test.ts): o núcleo de verdade do app BC Calibração
// (app-campo/src/nucleo, importado pelo caminho relativo, como o app faz) rodando no Node, com o repositório em memória
// no lugar do SQLite, o transporte em node:http (com os prazos de conexão e de leitura) no lugar do CapacitorHttp e uma
// rede que o teste derruba quando quer. As ações imitam as telas do app (app-campo/src/app/acoes.ts e as telas dos
// passos): parear pelo texto do QR, mudar o endereço no Menu, sincronizar, começar a folha, digitar as leituras no
// editor, conferir os avisos, finalizar, assinar (PIN + desenho), o modo entrega do cliente, encerrar sem completar,
// recomeçar os ensaios, corrigir depois de assinar e reabrir.
//
// A hora: o relógio do celular (cabeçalho x-bc-agora, a hora da entrega) é a hora de agora mais um desvio que o teste
// muda (o celular adiantado); as leituras e as assinaturas usam a "hora do campo", um cursor que começa às 08:00 de
// Brasília (de hoje ou de ontem, `inicioDoCampo`) e anda alguns segundos a cada toque (como o técnico no cliente), sem
// nunca passar da hora de agora. Assim o registro fica coerente (começo → leituras → término → assinaturas) e a entrega
// acontece "agora" no servidor.

import { connect, createServer, type Socket } from 'node:net'
import { avisosDoRegistro, avisosPendentes, conferirAviso, type AvisoCampo } from '../../../shared/campo/avisos.ts'
import { sha256WebCrypto } from '../../../shared/campo/canonico.ts'
import { lerQrPareamento, normalizarCodigo, normalizarEnderecoServidor } from '../../../shared/campo/protocolo.ts'
import type { ServidorCampo } from '../../../shared/campo/protocolo.ts'
import { instanteLocal } from '../../../shared/campo/registro.ts'
import type { AparelhoCampo, Desfecho, Instante, PacoteCampo, PessoaCampo, RegistroCampo } from '../../../shared/campo/tipos.ts'
import { casasDecimais, faixaDoValor } from '../../../shared/metrologia/index.ts'
import { ClienteCampo } from '../../../app-campo/src/nucleo/cliente.ts'
import {
  assinarCliente,
  assinarTecnico,
  atualizarModoEntrega,
  clienteNaoAssinou,
  comecar,
  corrigirDepoisDaAssinatura,
  editar,
  encerrarSemCompletar,
  ErroFolha,
  gravarLeitura,
  iniciarAssinaturas,
  reabrir,
  recomecarEnsaios,
  sairDoModoEntrega,
} from '../../../app-campo/src/nucleo/folha.ts'
import type { FolhaLocal } from '../../../app-campo/src/nucleo/folha.ts'
import { conferirPin, criarHashPin, type HashPin } from '../../../app-campo/src/nucleo/pin.ts'
import type { Relogio } from '../../../app-campo/src/nucleo/relogio.ts'
import { RepositorioMemoria } from '../../../app-campo/src/nucleo/repositorio.ts'
import { sincronizar, type ResultadoSincronia } from '../../../app-campo/src/nucleo/sincronia.ts'
import { transporteNode } from '../../../app-campo/src/nucleo/testes/transporteNode.ts'
import { ErroDeRede } from '../../../app-campo/src/nucleo/transporte.ts'
import type { PedidoHttp, RespostaHttp, Transporte } from '../../../app-campo/src/nucleo/transporte.ts'
import { ASSINATURA_EXEMPLO_1, ASSINATURA_EXEMPLO_2 } from '../../pdf/assinaturasExemplo.ts'

/** Fuso de Brasília (o celular do técnico). */
const FUSO = -180

// ---- Relógio do celular ------------------------------------------------------------------------------------------------

/**
 * Onde começa a hora do campo: às 08:00 de Brasília de hoje, se já passou das 15:00; senão, às 08:00 de ontem. Assim o
 * dia de trabalho inteiro cabe num dia só do calendário (a data da calibração é a do começo) e nunca no futuro.
 */
export function inicioDoCampo(agoraMs: number): number {
  const local = new Date(agoraMs + FUSO * 60_000)
  const oitoHoras = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 8, 0, 0) - FUSO * 60_000
  return local.getUTCHours() >= 15 ? oitoHoras : oitoHoras - 86_400_000
}

/** O relógio do aparelho: a hora de agora mais `desvioMs` (positivo = celular adiantado), no fuso de Brasília. */
export interface RelogioDoCelular extends Relogio {
  desvioMs: number
}

export function relogioDoCelular(): RelogioDoCelular {
  const r: RelogioDoCelular = {
    desvioMs: 0,
    agora: () => instanteLocal(new Date(Date.now() + r.desvioMs), FUSO),
    ms: () => Date.now() + r.desvioMs,
    hoje: () => r.agora().slice(0, 10),
  }
  return r
}

// ---- Rede ------------------------------------------------------------------------------------------------------------

/** Uma chamada que passou pela rede do celular (para os testes conferirem a conversa). */
export interface ChamadaNaRede {
  metodo: string
  caminho: string
  /** O status HTTP, ou 'REDE' quando nada voltou ao celular. */
  status: number | 'REDE'
}

type Condicao = (p: PedidoHttp) => boolean

/** A condição "esta rota": método e um trecho do caminho ("PUT", "/api/campo/registros/"). */
export const rota =
  (metodo: string, trecho: string): Condicao =>
  (p) =>
    p.metodo === metodo && new URL(p.url).pathname.includes(trecho)

/**
 * A rede do celular: o transporte em node:http de verdade, com as quedas que o teste programa. `foraDoAr`: o Wi-Fi de
 * fora (nada chega ao servidor). `cairDepois`: o pedido chega, o servidor responde, e a resposta se perde no caminho
 * (o pior caso da entrega: o servidor gravou e o celular não sabe). `cairAntes`: o pedido nem sai do celular.
 */
export class RedeDoCelular implements Transporte {
  foraDoAr = false
  readonly historico: ChamadaNaRede[] = []
  private quedas: Array<{ condicao: Condicao; momento: 'ANTES' | 'DEPOIS'; vezes: number }> = []
  private readonly base: Transporte

  constructor(base: Transporte = transporteNode) {
    this.base = base
  }

  /** A próxima resposta da rota se perde (o servidor já processou o pedido). */
  cairDepois(condicao: Condicao, vezes = 1) {
    this.quedas.push({ condicao, momento: 'DEPOIS', vezes })
  }

  /** O próximo pedido da rota não chega ao servidor. */
  cairAntes(condicao: Condicao, vezes = 1) {
    this.quedas.push({ condicao, momento: 'ANTES', vezes })
  }

  /** As chamadas a partir de uma posição do histórico, como "MÉTODO caminho → status". */
  conversa(desde = 0): string[] {
    return this.historico.slice(desde).map((c) => `${c.metodo} ${c.caminho} → ${c.status}`)
  }

  private queda(p: PedidoHttp, momento: 'ANTES' | 'DEPOIS'): boolean {
    const i = this.quedas.findIndex((q) => q.momento === momento && q.vezes > 0 && q.condicao(p))
    if (i < 0) return false
    this.quedas[i].vezes--
    if (!this.quedas[i].vezes) this.quedas.splice(i, 1)
    return true
  }

  async enviar(pedido: PedidoHttp): Promise<RespostaHttp> {
    const caminho = new URL(pedido.url).pathname
    const anotar = (status: number | 'REDE') => this.historico.push({ metodo: pedido.metodo, caminho, status })
    if (this.foraDoAr || this.queda(pedido, 'ANTES')) {
      anotar('REDE')
      throw new ErroDeRede('SEM_CONEXAO', 'Wi-Fi fora da rede da empresa.')
    }
    let resposta: RespostaHttp
    try {
      resposta = await this.base.enviar(pedido)
    } catch (e) {
      anotar('REDE')
      throw e
    }
    if (this.queda(pedido, 'DEPOIS')) {
      anotar('REDE')
      throw new ErroDeRede('SEM_CONEXAO', 'A conexão caiu antes de a resposta chegar.')
    }
    anotar(resposta.status)
    return resposta
  }
}

// ---- Porta intermediária (o "endereço antigo" do servidor) ------------------------------------------------------------

/**
 * Uma porta TCP que repassa tudo para o servidor de verdade: o endereço que o celular gravou no pareamento. Fechar a
 * porta simula o servidor que mudou de endereço (o celular passa a não achar ninguém ali).
 */
export async function abrirPortaIntermediaria(
  destino: number,
): Promise<{ porta: number; endereco: string; fechar(): Promise<void> }> {
  const conexoes = new Set<Socket>()
  const servidor = createServer((entrada) => {
    const saida = connect(destino, '127.0.0.1')
    conexoes.add(entrada)
    conexoes.add(saida)
    const fim = () => {
      conexoes.delete(entrada)
      conexoes.delete(saida)
      entrada.destroy()
      saida.destroy()
    }
    entrada.on('error', fim).on('close', fim)
    saida.on('error', fim).on('close', fim)
    entrada.pipe(saida).pipe(entrada)
  })
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok))
  const porta = (servidor.address() as { port: number }).port
  return {
    porta,
    endereco: `http://127.0.0.1:${porta}`,
    fechar: () =>
      new Promise<void>((ok) => {
        for (const s of conexoes) s.destroy()
        servidor.close(() => ok())
      }),
  }
}

// ---- O celular -------------------------------------------------------------------------------------------------------

/** O que o app grava nas preferências depois de parear (app-campo/src/app/loja.ts, `Pareamento`). */
export interface PareamentoDoCelular {
  endereco: string
  token: string
  tecnico: PessoaCampo
  servidor: ServidorCampo
  aparelhoId: string
}

export interface OpcoesCelular {
  aparelhoId: string
  modelo?: string
  versaoApp?: string
  /** PIN do técnico (6 dígitos). */
  pin?: string
}

/** O texto de uma leitura na divisão `d`, como o teclado do app escreve ("30,02"). */
export function leituraNaDivisao(valor: number, d: number): string {
  const v = d > 0 ? Math.round(valor / d) * d : valor
  return (Object.is(v, -0) ? 0 : v).toFixed(casasDecimais(d)).replace('.', ',')
}

/** Quem acompanhou pelo cliente (fictício). */
export const ACOMPANHANTE = { nome: 'Juliana Prado', funcao: 'Supervisora de qualidade' }

/** Como preencher os ensaios: os erros de cada ponto (em divisões) e os toques que o técnico erra. */
export interface OpcoesPreencher {
  /** Erro de cada ponto, em múltiplos de d (crescente); o decrescente fica uma divisão acima. */
  erros?: number[]
  /** Digita a leitura do 3º ponto com uma casa a menos ("10,0" com d = 0,01): o aviso "Confira a digitação". */
  digitacao?: boolean
  /** Onde foi feita (padrão: no cliente). */
  local?: 'CLIENTE' | 'LABORATORIO'
  /** Só até o erro de indicação (para encerrar sem completar ou recomeçar os ensaios). */
  ateIndicacao?: boolean
}

export class CelularSimulado {
  readonly repo = new RepositorioMemoria()
  readonly rede: RedeDoCelular
  readonly relogio = relogioDoCelular()
  readonly aparelho: AparelhoCampo
  readonly api: ClienteCampo
  pareamento: PareamentoDoCelular | null = null
  /** A faixa "Este celular foi descadastrado" (Minhas folhas). */
  descadastrado = false
  ultima: ResultadoSincronia | null = null
  private readonly pin: string
  private hashPin: HashPin | null = null
  /** A hora do campo (ms). */
  private campoMs: number

  constructor(o: OpcoesCelular) {
    this.aparelho = { id: o.aparelhoId, modelo: o.modelo ?? 'Samsung SM-A546E', versaoApp: o.versaoApp ?? '1.1.0' }
    this.pin = o.pin ?? '482916'
    this.campoMs = inicioDoCampo(Date.now())
    this.rede = new RedeDoCelular()
    // A configuração é lida a cada chamada: mudar o endereço no Menu vale na hora (como o app)
    this.api = new ClienteCampo(
      () => ({ endereco: this.pareamento?.endereco ?? '', token: this.pareamento?.token ?? '' }),
      this.rede,
      this.relogio,
    )
  }

  /** sha256 como o app (WebCrypto). */
  readonly sha = (texto: string) => sha256WebCrypto(texto)

  // ---- Hora do campo -------------------------------------------------------------------------------------------

  /** A hora do campo, andando `segundos` (o técnico entre um toque e outro). Nunca passa da hora de agora. */
  noCampo(segundos = 0): Instante {
    this.campoMs = Math.min(this.campoMs + segundos * 1000, Date.now() - 1000)
    return instanteLocal(new Date(this.campoMs), FUSO)
  }

  // ---- Pareamento e endereço (Cadastro e Menu) -------------------------------------------------------------------

  /**
   * Pareia pelo texto do QR (ou digitado: endereço e código), como `parear` em acoes.ts: confere que no endereço há um
   * servidor BC Calibração (GET /api/saude) e manda o código. Devolve a frase do problema, ou null.
   */
  async parear(qrOuDigitado: string | { endereco: string; codigo: string }): Promise<string | null> {
    const dados = typeof qrOuDigitado === 'string' ? lerQrPareamento(qrOuDigitado) : null
    if (typeof qrOuDigitado === 'string' && !dados) return 'Este QR não é do BC Calibração.'
    const endereco = normalizarEnderecoServidor(dados?.servidor ?? (qrOuDigitado as { endereco: string }).endereco)
    if (!endereco.ok) return endereco.erro
    const codigo = normalizarCodigo(dados?.codigo ?? (qrOuDigitado as { codigo: string }).codigo)
    if (!codigo) return 'O código tem 6 dígitos. Confira na tela do computador.'
    const api = new ClienteCampo({ endereco: endereco.endereco, token: '' }, this.rede, this.relogio)
    const saude = await api.saude()
    if (!saude.ok) return saude.falha.tipo === 'REDE' ? saude.falha.mensagem : 'Esse endereço não é de um servidor BC Calibração.'
    const r = await api.parear({
      codigo,
      aparelhoId: this.aparelho.id,
      modelo: this.aparelho.modelo,
      versaoApp: this.aparelho.versaoApp,
    })
    if (!r.ok) return r.falha.mensagem
    this.pareamento = {
      endereco: endereco.endereco,
      token: r.valor.token,
      tecnico: r.valor.tecnico,
      servidor: r.valor.servidor,
      aparelhoId: r.valor.aparelhoId,
    }
    this.descadastrado = false
    // "Criar PIN" depois do primeiro cadastro (o PBKDF2 do app, com menos iterações para o teste ser rápido)
    if (!this.hashPin) this.hashPin = await criarHashPin(this.pin, { iteracoes: 1000 })
    return null
  }

  /**
   * "Ler o QR do computador" (a tela Cadastro, `cadastrar` em telas/Pareamento.tsx): o QR com o código pareia; o QR só
   * com o endereço (o servidor mudou de IP) troca o endereço do celular já cadastrado.
   */
  async lerQr(texto: string): Promise<string | null> {
    const qr = lerQrPareamento(texto)
    if (!qr) return 'Este QR não é do BC Calibração.'
    if (qr.codigo) return this.parear(texto)
    if (!this.pareamento) return 'Este QR só tem o endereço do servidor. Leia o QR da tela "Cadastrar celular" do computador.'
    return this.mudarEndereco(qr.servidor)
  }

  /** Menu → "Endereço do servidor" (`mudarEndereco` em acoes.ts): o MESMO servidor do pareamento, conferido pelo id. */
  async mudarEndereco(texto: string): Promise<string | null> {
    const p = this.pareamento
    if (!p) return 'Este celular ainda não está cadastrado.'
    const e = normalizarEnderecoServidor(texto)
    if (!e.ok) return e.erro
    const saude = await new ClienteCampo({ endereco: e.endereco, token: '' }, this.rede, this.relogio).saude()
    if (!saude.ok) return saude.falha.tipo === 'REDE' ? saude.falha.mensagem : 'Esse endereço não é de um servidor BC Calibração.'
    if (saude.valor.id !== p.servidor.id)
      return `Esse endereço é de outro servidor BC Calibração (${saude.valor.nome}). Para trocar de servidor, peça ao escritório para cadastrar o celular de novo.`
    this.pareamento = { ...p, endereco: e.endereco }
    return null
  }

  // ---- Sincronia --------------------------------------------------------------------------------------------------

  /** Uma rodada ("Atualizar agora"), com o núcleo de verdade. */
  async sincronizar(): Promise<ResultadoSincronia> {
    if (!this.pareamento) throw new Error('O celular do teste ainda não foi pareado.')
    const r = await sincronizar({
      repositorio: this.repo,
      api: this.api,
      relogio: this.relogio,
      sha256: this.sha,
      versaoApp: this.aparelho.versaoApp,
    })
    const conectouBem = r.conectou && !r.falha
    this.descadastrado = r.descadastrado || (this.descadastrado && !conectouBem)
    if (r.tecnico && r.servidor && this.pareamento)
      this.pareamento = { ...this.pareamento, tecnico: r.tecnico, servidor: r.servidor }
    this.ultima = r
    return r
  }

  // ---- Folhas -----------------------------------------------------------------------------------------------------

  async folhas(): Promise<FolhaLocal[]> {
    return this.repo.listar()
  }

  /** A folha pelo nº FC (ou null). */
  async folha(numero: string): Promise<FolhaLocal | null> {
    return (await this.repo.listar()).find((f) => f.numero === numero) ?? null
  }

  async exigirFolha(numero: string): Promise<FolhaLocal> {
    const f = await this.folha(numero)
    if (!f) throw new Error(`A folha ${numero} não está no celular.`)
    return f
  }

  /** Muda uma folha e grava (como `mudarFolha`); a operação que não vale lança ErroFolha. */
  async mudar(numero: string, mudar: (f: FolhaLocal) => FolhaLocal | Promise<FolhaLocal>): Promise<FolhaLocal> {
    const atual = await this.exigirFolha(numero)
    const nova = await mudar(atual)
    if (nova !== atual) await this.repo.gravar(nova)
    return nova
  }

  /** O PIN do técnico (a tela "Assinar como …", "Corrigir…", "Reabrir…", sair do modo entrega). */
  private async exigirPin(pin: string) {
    if (!this.hashPin || !(await conferirPin(pin, this.hashPin))) throw new ErroFolha('PIN errado.')
  }

  /** "Começar a folha". */
  comecar(numero: string): Promise<FolhaLocal> {
    const p = this.pareamento
    if (!p) throw new Error('Sem pareamento.')
    return this.mudar(numero, (f) => comecar(f, p.tecnico, this.aparelho, this.noCampo(60)))
  }

  /** Digita uma leitura no editor (o texto como o teclado do app escreve). */
  digitar(numero: string, campo: string, valor: string | null, segundos = 30): Promise<FolhaLocal> {
    const em = this.noCampo(segundos)
    return this.mudar(numero, (f) =>
      editar(f, (r) => gravarLeitura(r, campo, valor === null ? null : { valor, em, via: 'teclado' }), em),
    )
  }

  /** Mexe nos campos de um passo (as telas dos passos: marcar, escolher, escrever). */
  mexer(numero: string, mudar: (r: RegistroCampo, em: Instante) => void, segundos = 20): Promise<FolhaLocal> {
    const em = this.noCampo(segundos)
    return this.mudar(numero, (f) => editar(f, (r) => mudar(r, em), em))
  }

  /**
   * Preenche a folha como o técnico no cliente, passo a passo, com leituras realistas pelo plano do pacote: padrões
   * levados e usados, os dados impressos conferidos, onde e quando começou, o ambiente no início, o erro de indicação
   * (subida, descida a partir do ponto mais alto e o retorno ao zero), a repetibilidade, a excentricidade, o ambiente
   * no fim, a data e o término. Os mesmos padrões de leitura dos registros de shared/campo/exemplos.ts (erros em
   * divisões, a repetibilidade 0-0-1-0-0-1…), sobre o plano que o servidor de verdade mandou.
   */
  async preencher(numero: string, o: OpcoesPreencher = {}): Promise<FolhaLocal> {
    let f = await this.exigirFolha(numero)
    if (f.estado === 'NOVA') f = await this.comecar(numero)
    const pacote = f.pacote
    if (!pacote?.plano || !pacote.balanca) throw new Error(`A folha ${numero} não tem plano (folha avulsa sem balança).`)
    const plano = pacote.plano
    const instrumentos = pacote.padroes.cadastro
      .filter((x) => x.tipo === 'TERMOHIGROMETRO' || x.tipo === 'BAROMETRO')
      .map((x) => x.id)
    // 1-3. Padrões, chegada, balança (já feitos quando a folha recomeça os ensaios)
    if (!f.registro!.passos.chegada.inicio) {
      await this.mexer(numero, (r) => r.passos.padroes.forEach((x) => Object.assign(x, { levado: true, usado: true })), 30)
      await this.mexer(numero, (r, em) => {
        r.passos.chegada.conferencias.forEach((x) => (x.confere = true))
        r.passos.chegada.local = o.local ?? 'CLIENTE'
        r.passos.chegada.inicio = em
      })
      await this.mexer(numero, (r) => r.passos.balanca.conferencias.forEach((x) => (x.confere = true)))
    }
    // 4. Ambiente no início
    await this.mexer(
      numero,
      (r, em) => {
        r.passos.ambiente.linhas[0].em = em
        r.passos.ambiente.linhas[0].instrumentos = instrumentos
      },
      600,
    )
    await this.digitar(numero, 'ambiente.linhas.0.temperatura', '22,4', 5)
    await this.digitar(numero, 'ambiente.linhas.0.umidade', '56', 5)
    await this.digitar(numero, 'ambiente.linhas.0.pressao', '927,3', 10)
    // 5. Erro de indicação
    const texto = leituraNaDivisao
    const erros = o.erros ?? [0, 0, 1, 1, 2, 2, 2, 2]
    f = await this.exigirFolha(numero)
    const pontos = f.registro!.passos.indicacao.pontos
    for (const [i, pt] of pontos.entries()) {
      const pp = plano.pontos[i]
      let valor = texto(pp.carga + (erros[i] ?? 0) * pp.d, pp.d)
      if (o.digitacao && i === 2) valor = valor.slice(0, -1)
      await this.digitar(numero, `indicacao.pontos.${pt.id}.crescente`, valor, 55)
    }
    if (plano.metodo === 'CRESCENTE_DECRESCENTE')
      for (let i = pontos.length - 2; i >= 1; i--) {
        const pp = plano.pontos[i]
        if (!(pp.carga > 0)) continue
        await this.digitar(
          numero,
          `indicacao.pontos.${pontos[i].id}.decrescente`,
          texto(pp.carga + ((erros[i] ?? 0) + 1) * pp.d, pp.d),
          45,
        )
      }
    await this.digitar(numero, 'indicacao.retornoZero', texto(0, plano.pontos[0]?.d ?? 0), 40)
    if (o.ateIndicacao) return this.exigirFolha(numero)
    return this.ensaiosFinais(numero, pacote)
  }

  /** Repetibilidade, excentricidade, o ambiente no fim, a data e o término (o fim de `preencher`). */
  async ensaiosFinais(numero: string, pacote: PacoteCampo): Promise<FolhaLocal> {
    const plano = pacote.plano!
    const balanca = pacote.balanca!
    const texto = leituraNaDivisao
    const f = await this.exigirFolha(numero)
    const padraoRep = [0, 0, 1, 0, 0, 1, 0, 0, 0, 1]
    for (const [k, ensaio] of f.registro!.passos.repetibilidade.entries()) {
      const pr = plano.repetibilidade[k]
      const d = faixaDoValor(pr.carga, balanca).d
      for (let j = 0; j < pr.leituras; j++)
        await this.digitar(numero, `repetibilidade.${ensaio.id}.leituras.${j}`, texto(pr.carga + padraoRep[j % 10] * d, d), 35)
    }
    const e = plano.excentricidade
    const dE = faixaDoValor(e.carga, balanca).d
    await this.mexer(numero, (r) => (r.passos.excentricidade.aplicavel = true), 30)
    for (const [j] of f.registro!.passos.excentricidade.posicoes.entries())
      await this.digitar(numero, `excentricidade.posicoes.${j}.leitura`, texto(e.carga + [0, 1, 0, 1, 1][j % 5] * dE, dE), 40)
    // 4. Ambiente no fim; 8. data e término
    const iFim = f.registro!.passos.ambiente.linhas.findIndex((l) => l.momento === 'FIM')
    await this.mexer(numero, (r, em) => (r.passos.ambiente.linhas[iFim].em = em), 300)
    await this.digitar(numero, `ambiente.linhas.${iFim}.temperatura`, '22,9', 5)
    await this.digitar(numero, `ambiente.linhas.${iFim}.umidade`, '55', 5)
    return this.mexer(
      numero,
      (r, em) => {
        r.passos.final.dataCalibracao = r.passos.chegada.inicio.slice(0, 10) || em.slice(0, 10)
        r.passos.final.termino = em
      },
      120,
    )
  }

  /** Os avisos da folha inteira (a Revisão), já com os conferidos fora. */
  async avisosPendentes(numero: string): Promise<AvisoCampo[]> {
    const f = await this.exigirFolha(numero)
    return avisosPendentes(avisosDoRegistro(f.registro!, f.pacote, { hoje: this.relogio.hoje() }), f.registro!)
  }

  /** "Conferi, está certo" em cada aviso "Confira a digitação" pendente (a Revisão). */
  async conferirAvisosDeDigitacao(numero: string): Promise<AvisoCampo[]> {
    const pendentes = (await this.avisosPendentes(numero)).filter((a) => a.classe === 'DIGITACAO')
    for (const a of pendentes) await this.mexer(numero, (r, em) => void r.avisosConferidos.push(conferirAviso(a, em)), 10)
    return pendentes
  }

  /** "Encerrar sem completar" (incompleta ou não calibrada, com um motivo). */
  encerrar(numero: string, desfecho: Exclude<Desfecho, 'COMPLETA'>, motivo: string): Promise<FolhaLocal> {
    return this.mudar(numero, (f) => encerrarSemCompletar(f, desfecho, motivo, this.noCampo(30)))
  }

  /** "A balança precisou de manutenção: recomeçar os ensaios". */
  recomecar(numero: string, motivo: string): Promise<FolhaLocal> {
    return this.mudar(numero, (f) => recomecarEnsaios(f, motivo, this.noCampo(1800)))
  }

  /** "Finalizar e colher assinaturas". */
  finalizar(numero: string): Promise<FolhaLocal> {
    return this.mudar(numero, (f) => iniciarAssinaturas(f, this.sha, this.noCampo(60)))
  }

  /** "Assinar como <técnico>": o PIN e o desenho com o dedo. No cliente, o celular entra no modo entrega. */
  async assinarComoTecnico(numero: string, pin = this.pin): Promise<FolhaLocal> {
    await this.exigirPin(pin)
    return this.mudar(numero, (f) => assinarTecnico(f, ASSINATURA_EXEMPLO_1, this.sha, this.noCampo(40)))
  }

  /** O modo entrega: quem acompanhou escreve o nome e a função, lê o resumo e assina com o dedo. */
  async assinaturaDoCliente(numero: string, quem = ACOMPANHANTE): Promise<FolhaLocal> {
    await this.mudar(numero, (f) => atualizarModoEntrega(f, { nome: quem.nome, funcao: quem.funcao }, this.noCampo(40)))
    await this.mudar(numero, (f) => atualizarModoEntrega(f, { tela: 'ASSINATURA' }, this.noCampo(20)))
    const f = await this.mudar(numero, (x) => assinarCliente(x, { ...quem, png: ASSINATURA_EXEMPLO_2 }, this.noCampo(30)))
    // "Pronto. Devolva o celular ao técnico." → o técnico confirma com o PIN
    await this.exigirPin(this.pin)
    return this.mudar(f.numero, (x) => sairDoModoEntrega(x, this.noCampo(15)))
  }

  /** "Cliente não assinou" (com o PIN do técnico). */
  async clienteNaoAssinou(numero: string, motivo: string): Promise<FolhaLocal> {
    await this.exigirPin(this.pin)
    return this.mudar(numero, (f) => clienteNaoAssinou(sairDoModoEntrega(f, this.noCampo(10)), motivo, this.noCampo(10)))
  }

  /** "Corrigir…" depois de assinar (PIN e motivo; só por acréscimo). */
  async corrigir(numero: string, campo: string, para: string, motivo: string): Promise<FolhaLocal> {
    await this.exigirPin(this.pin)
    return this.mudar(numero, (f) => corrigirDepoisDaAssinatura(f, { campo, para, motivo }, this.noCampo(60)))
  }

  /** "Reabrir…" (PIN e motivo): as duas assinaturas saem. */
  async reabrir(numero: string, motivo: string): Promise<FolhaLocal> {
    await this.exigirPin(this.pin)
    return this.mudar(numero, (f) => reabrir(f, motivo, this.sha, this.noCampo(60)))
  }

  /** Finaliza e colhe as duas assinaturas (ou só a do técnico, no laboratório). */
  async finalizarEAssinar(numero: string): Promise<FolhaLocal> {
    await this.finalizar(numero)
    const f = await this.assinarComoTecnico(numero)
    return f.estado === 'FINALIZADA' ? f : this.assinaturaDoCliente(numero)
  }
}

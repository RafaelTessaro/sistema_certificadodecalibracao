// Pareamento do celular do técnico (shared/campo/protocolo.ts, item 1): o administrador pede um código de 6 dígitos para
// um técnico ("Cadastrar celular") ou para um celular já cadastrado ("Parear de novo", o mesmo aparelho); o servidor
// guarda o código só na memória, por 10 minutos e para um uso só, e a tela mostra o QR com o endereço do servidor e o
// código. O app manda o código com o id do aparelho; o servidor devolve um token aleatório de 32 bytes e guarda só o
// sha256 dele (`RepositorioCampo.registrarPareamento`). Código errado conta: 5 erros com códigos em aberto invalidam
// esses códigos, e o IP que erra demais espera (o mesmo limite das entradas, `LimiteTentativas`). Reiniciar o serviço
// esquece os códigos em aberto (o administrador pede outro).

import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import {
  BYTES_TOKEN,
  formatarQrPareamento,
  MENSAGENS_ERRO_CAMPO,
  normalizarEnderecoServidor,
  PORTA_SERVIDOR,
  TENTATIVAS_CODIGO,
  VALIDADE_CODIGO_MS,
  type PedidoParear,
} from '#shared/campo/protocolo.ts'
import type { PareamentoIniciado, SituacaoPareamento } from '#shared/tipos.ts'
import { ErroApi } from '../erros.ts'
import { LimiteTentativas } from '../limiteTentativas.ts'

/** sha256 (hex) do token do celular: o que o banco guarda. */
export const sha256Token = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')

/** Um token novo: 32 bytes aleatórios em base64url (43 caracteres). */
export const novoToken = () => randomBytes(BYTES_TOKEN).toString('base64url')

interface Pendente {
  id: string
  codigo: string
  usuarioId: string
  tecnicoNome: string
  /** Parear de novo: o aparelho (o celular precisa mandar este id). */
  aparelhoId: string
  porId: string
  porLogin: string
  porNome: string
  criadoEm: number
  expiraEm: number
  /** Erros de código enquanto este estava em aberto. */
  erros: number
  situacao: SituacaoPareamento['situacao']
  /** Pareado: o id do aparelho. */
  pareadoAparelho: string
}

/** Por quanto tempo a tela ainda consegue saber o que aconteceu com um código encerrado. */
const LEMBRAR_MS = 60 * 60_000

/** Adaptadores virtuais (Hyper-V, WSL, VirtualBox, VMware, Docker, VPNs): o IP deles não serve para o celular. */
const VIRTUAL =
  /(vethernet|virtualbox|vbox|vmware|vmnet|hyper-?v|wsl|docker|virbr|veth|^br-|tailscale|zerotier|hamachi|loopback|bluetooth|npcap|tap|tun|utun|wireguard|openvpn)/i

/** Os IPv4 físicos da rede local deste computador, o da rede de casa/empresa (192.168) primeiro. */
export function ipsDaRede(placas: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  const ips: string[] = []
  for (const [nome, lista] of Object.entries(placas)) {
    if (VIRTUAL.test(nome)) continue
    for (const i of lista ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue
      if (i.mac === '00:00:00:00:00:00') continue
      const [a, b] = i.address.split('.').map(Number)
      const privado = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      if (!privado) continue
      if (!ips.includes(i.address)) ips.push(i.address)
    }
  }
  const peso = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2)
  return ips.sort((x, y) => peso(x) - peso(y))
}

export interface OpcoesPareamentos {
  agora?: () => number
  /** Porta do servidor (o endereço do QR). */
  porta?: number
  /** Placas de rede (os testes trocam). */
  placas?: () => NodeJS.Dict<NetworkInterfaceInfo[]>
}

/** O que o pareamento aceito devolve para a rota gravar o celular. */
export interface PareamentoAceito {
  pendente: Pick<Pendente, 'id' | 'usuarioId' | 'aparelhoId' | 'porId' | 'porLogin' | 'porNome'>
  /** O token (vai uma vez para o celular; o banco guarda só o sha256). */
  token: string
  tokenSha256: string
  /** Era "Parear de novo". */
  deNovo: boolean
}

export class Pareamentos {
  private pendentes = new Map<string, Pendente>()
  /** Limite por IP (e um teto geral) das tentativas de código: o mesmo modelo das entradas. */
  readonly limite: LimiteTentativas
  /** Relógio (epoch ms). Público: os testes trocam. */
  agora: () => number
  private porta: number
  private placas: () => NodeJS.Dict<NetworkInterfaceInfo[]>

  constructor(o: OpcoesPareamentos = {}) {
    this.agora = o.agora ?? (() => Date.now())
    this.porta = o.porta ?? PORTA_SERVIDOR
    this.placas = o.placas ?? networkInterfaces
    this.limite = new LimiteTentativas(() => this.agora())
  }

  /** Os endereços deste servidor na rede ("http://192.168.0.10:4850"), para o administrador escolher o do QR. */
  enderecos(): string[] {
    return ipsDaRede(this.placas()).map((ip) => `http://${ip}:${this.porta}`)
  }

  /**
   * O endereço do QR: o pedido pela tela (normalizado), senão o primeiro da rede, senão o do cabeçalho Host (o
   * computador sem placa de rede reconhecida). '' se nada servir.
   */
  enderecoDoQr(pedido: unknown, host: string | undefined): string {
    if (typeof pedido === 'string' && pedido.trim()) {
      const e = normalizarEnderecoServidor(pedido)
      if (!e.ok) throw new ErroApi(400, e.erro)
      return e.endereco
    }
    const [primeiro] = this.enderecos()
    if (primeiro) return primeiro
    const e = normalizarEnderecoServidor(host ?? '')
    return e.ok ? e.endereco : ''
  }

  /** Um código novo (6 dígitos, uso único, 10 min) para o técnico; `aparelhoId`: parear de novo esse celular. */
  iniciar(e: {
    usuarioId: string
    tecnicoNome: string
    aparelhoId?: string
    por: { id: string; login: string; nome: string }
    endereco: string
  }): PareamentoIniciado {
    this.limpar()
    const agora = this.agora()
    // Um pedido novo para o mesmo técnico (ou o mesmo celular) cancela o anterior: só um QR vale por vez
    for (const p of this.pendentes.values())
      if (p.situacao === 'AGUARDANDO' && p.usuarioId === e.usuarioId && p.aparelhoId === (e.aparelhoId ?? ''))
        p.situacao = 'CANCELADO'
    let codigo = ''
    do codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
    while ([...this.pendentes.values()].some((p) => p.codigo === codigo && p.situacao === 'AGUARDANDO'))
    const p: Pendente = {
      id: randomUUID(),
      codigo,
      usuarioId: e.usuarioId,
      tecnicoNome: e.tecnicoNome,
      aparelhoId: e.aparelhoId ?? '',
      porId: e.por.id,
      porLogin: e.por.login,
      porNome: e.por.nome,
      criadoEm: agora,
      expiraEm: agora + VALIDADE_CODIGO_MS,
      erros: 0,
      situacao: 'AGUARDANDO',
      pareadoAparelho: '',
    }
    this.pendentes.set(p.id, p)
    return {
      id: p.id,
      codigo,
      expiraEm: new Date(p.expiraEm).toISOString(),
      endereco: e.endereco,
      enderecos: this.enderecos(),
      qr: e.endereco ? formatarQrPareamento({ servidor: e.endereco, codigo }) : '',
      tecnico: { id: e.usuarioId, nome: e.tecnicoNome },
      ...(e.aparelhoId ? { aparelhoId: e.aparelhoId } : {}),
    }
  }

  /** A situação de um pareamento (a tela consulta a cada poucos segundos). null = não existe (ou já foi esquecido). */
  situacao(id: string): (Omit<SituacaoPareamento, 'celular'> & { aparelhoId: string }) | null {
    this.limpar()
    const p = this.pendentes.get(id)
    if (!p) return null
    return { id: p.id, situacao: p.situacao, expiraEm: new Date(p.expiraEm).toISOString(), aparelhoId: p.pareadoAparelho }
  }

  /** "Fechar" na tela: o código deixa de valer. */
  cancelar(id: string): boolean {
    const p = this.pendentes.get(id)
    if (!p || p.situacao !== 'AGUARDANDO') return false
    p.situacao = 'CANCELADO'
    return true
  }

  /**
   * O celular mandou o código (POST /api/campo/parear, já conferido por `lerPedidoParear`). Aceito: o código deixa de
   * valer e volta o token novo. Erros (ErroApi): 429 MUITAS_TENTATIVAS (o IP errou demais), 400 CODIGO_EXPIRADO (venceu,
   * já foi usado ou foi invalidado), 400 CODIGO_INVALIDO (com `tentativasRestantes`), 400 PEDIDO_INVALIDO (código de
   * "parear de novo" de outro celular).
   */
  aceitar(pedido: PedidoParear, ip: string, loopback: boolean): PareamentoAceito {
    this.limpar()
    const chaves = { login: 'celular', ip, loopback }
    const espera = this.limite.espera(chaves)
    if (espera !== null)
      throw new ErroApi(429, MENSAGENS_ERRO_CAMPO.MUITAS_TENTATIVAS, { codigo: 'MUITAS_TENTATIVAS', esperarSegundos: espera })
    const agora = this.agora()
    const comCodigo = [...this.pendentes.values()].filter((p) => p.codigo === pedido.codigo)
    const vigente = comCodigo.find((p) => p.situacao === 'AGUARDANDO' && p.expiraEm > agora)
    if (!vigente) {
      if (comCodigo.length) {
        // Vencido, já usado, cancelado ou invalidado: não conta como erro (é o código certo de antes)
        throw new ErroApi(400, MENSAGENS_ERRO_CAMPO.CODIGO_EXPIRADO, { codigo: 'CODIGO_EXPIRADO' })
      }
      return this.errou(chaves)
    }
    if (vigente.aparelhoId && vigente.aparelhoId !== pedido.aparelhoId) {
      this.limite.falhou(chaves)
      throw new ErroApi(400, 'Este código é para parear de novo outro celular. Peça um código de "Cadastrar celular".', {
        codigo: 'PEDIDO_INVALIDO',
      })
    }
    this.limite.acertou(chaves)
    vigente.situacao = 'PAREADO'
    vigente.pareadoAparelho = pedido.aparelhoId
    const token = novoToken()
    return {
      pendente: vigente,
      token,
      tokenSha256: sha256Token(token),
      deNovo: !!vigente.aparelhoId,
    }
  }

  /** Volta um código aceito para "aguardando" (a gravação do celular falhou depois de aceitar). */
  desfazer(id: string) {
    const p = this.pendentes.get(id)
    if (p && p.situacao === 'PAREADO') {
      p.situacao = 'AGUARDANDO'
      p.pareadoAparelho = ''
    }
  }

  /** O código deixa de valer (o técnico foi desativado depois de pedir o código). */
  invalidar(id: string) {
    const p = this.pendentes.get(id)
    if (p) {
      p.situacao = 'INVALIDADO'
      p.pareadoAparelho = ''
    }
  }

  /** Código que não existe: conta no limite do IP e em todos os códigos em aberto (5 erros invalidam). */
  private errou(chaves: { login: string; ip: string; loopback: boolean }): never {
    this.limite.falhou(chaves)
    const agora = this.agora()
    let restantes = TENTATIVAS_CODIGO
    for (const p of this.pendentes.values()) {
      if (p.situacao !== 'AGUARDANDO' || p.expiraEm <= agora) continue
      p.erros++
      if (p.erros >= TENTATIVAS_CODIGO) p.situacao = 'INVALIDADO'
      restantes = Math.min(restantes, Math.max(TENTATIVAS_CODIGO - p.erros, 0))
    }
    throw new ErroApi(400, MENSAGENS_ERRO_CAMPO.CODIGO_INVALIDO, { codigo: 'CODIGO_INVALIDO', tentativasRestantes: restantes })
  }

  /** Marca os vencidos e esquece os encerrados há mais de uma hora. */
  private limpar() {
    const agora = this.agora()
    for (const [id, p] of this.pendentes) {
      if (p.situacao === 'AGUARDANDO' && p.expiraEm <= agora) p.situacao = 'EXPIRADO'
      if (p.situacao !== 'AGUARDANDO' && agora - p.expiraEm > LEMBRAR_MS) this.pendentes.delete(id)
    }
  }
}

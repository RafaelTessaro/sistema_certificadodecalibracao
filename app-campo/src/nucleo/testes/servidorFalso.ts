// Servidor falso, em memória, para os testes do núcleo: implementa as rotas do celular (shared/campo/protocolo.ts) atrás
// de um `Transporte`, com as regras do contrato (olá, pacote, recebida, recolhimento, entrega idempotente pelo sha256) e
// botões para simular problemas: fora do ar, rede que cai DEPOIS de o servidor gravar, celular descadastrado ou roubado,
// recibo errado. Só para testes (não entra no app).

import { calcularSha256Registro, sha256Hex } from '../../../../shared/campo/canonico.ts'
import { resumoDoEnvio } from '../../../../shared/campo/pacote.ts'
import { montarRecibo, ROTA_SAUDE, ROTAS_CAMPO } from '../../../../shared/campo/protocolo.ts'
import type { RespostaOla } from '../../../../shared/campo/protocolo.ts'
import type { PacoteCampo, ReciboCampo, RegistroCampo, SituacaoEnvio } from '../../../../shared/campo/tipos.ts'
import { ErroDeRede, exigirPrazo } from '../transporte.ts'
import type { PedidoHttp, RespostaHttp, Transporte } from '../transporte.ts'

export const TOKEN_TESTE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'

interface EnvioFalso {
  pacote: PacoteCampo
  situacao: SituacaoEnvio
  baixado: boolean
  pedidoRecolher: boolean
  respostaRecolher: string
}

export class ServidorFalso implements Transporte {
  envios = new Map<string, EnvioFalso>()
  /** Registros guardados, pelo sha256. */
  registros = new Map<string, { registro: RegistroCampo; recibo: ReciboCampo }>()
  /** Pedidos recebidos ("POST /api/campo/ola"…), na ordem. */
  pedidos: string[] = []
  cabecalhos: Array<Record<string, string>> = []

  foraDoAr = false
  /** Descadastrado: o olá e os outros respondem 401 DESCADASTRADO; a entrega continua aceita (salvo `roubado`). */
  descadastrado = false
  roubado = false
  tokenDesconhecido = false
  /** As próximas N entregas gravam e depois a "rede cai" (o celular não recebe o recibo). */
  cairDepoisDeGravar = 0
  /** A próxima resposta da entrega traz um sha256 errado. */
  reciboErrado = false
  /** A rede cai na N-ésima chamada (1 = a primeira); 0 = nunca. */
  cairNaChamada = 0
  agoraServidor = '2026-11-18T11:00:00.000Z'
  appDisponivel: RespostaOla['appDisponivel']

  private chamadas = 0

  enviarFolha(pacote: PacoteCampo): void {
    this.envios.set(pacote.envioId, { pacote, situacao: 'ENVIADA', baixado: false, pedidoRecolher: false, respostaRecolher: '' })
  }

  /** "Recolher" no escritório: na hora se não baixou; senão, pedido. */
  recolher(envioId: string): void {
    const e = this.envios.get(envioId)
    if (!e) return
    if (e.situacao === 'ENVIADA' && !e.baixado) e.situacao = 'RECOLHIDA'
    else e.pedidoRecolher = true
  }

  /** "Apagar os testes": o servidor esquece o envio. */
  esquecer(envioId: string): void {
    this.envios.delete(envioId)
  }

  async enviar(p: PedidoHttp): Promise<RespostaHttp> {
    exigirPrazo(p)
    this.chamadas++
    const caminho = p.url.replace(/^https?:\/\/[^/]+/, '')
    this.pedidos.push(`${p.metodo} ${caminho}`)
    this.cabecalhos.push(p.cabecalhos)
    if (this.foraDoAr) throw new ErroDeRede('SEM_CONEXAO')
    if (this.cairNaChamada && this.chamadas === this.cairNaChamada) throw new ErroDeRede('PRAZO')
    // O transporte de verdade serializa em JSON: aqui também (o servidor nunca vê objetos do celular)
    const corpo = p.corpo === undefined ? undefined : JSON.parse(JSON.stringify(p.corpo))
    return this.rotear(p.metodo, caminho, p.cabecalhos, corpo)
  }

  private erro(status: number, codigo: string): RespostaHttp {
    return { status, corpo: { erro: codigo, codigo } }
  }

  private rotear(metodo: string, caminho: string, cab: Record<string, string>, corpo: unknown): RespostaHttp {
    if (metodo === 'GET' && caminho === ROTA_SAUDE)
      return {
        status: 200,
        corpo: { ok: true, app: 'bc-calibracao', versao: '1.1.0', nome: 'SERVIDOR', id: 'srv-1', instancia: 'x' },
      }
    if (cab['x-bc-calibracao'] !== '1') return this.erro(403, 'CSRF')
    if (metodo === 'POST' && caminho === ROTAS_CAMPO.parear.caminho) {
      const c = corpo as { codigo: string; aparelhoId: string }
      if (c.codigo !== '123456') return { status: 400, corpo: { erro: 'x', codigo: 'CODIGO_INVALIDO', tentativasRestantes: 4 } }
      return {
        status: 200,
        corpo: {
          token: TOKEN_TESTE,
          aparelhoId: c.aparelhoId,
          tecnico: { id: 'usr-carlos', nome: 'Carlos Eduardo Lima' },
          servidor: { id: 'srv-1', nome: 'SERVIDOR' },
        },
      }
    }
    const token = /^Bearer (.+)$/.exec(cab.authorization ?? '')?.[1]
    if (this.tokenDesconhecido || token !== TOKEN_TESTE) return this.erro(401, 'NAO_PAREADO')
    const entrega = metodo === 'PUT' && caminho.startsWith('/api/campo/registros/')
    if (this.descadastrado && (!entrega || this.roubado)) return this.erro(401, 'DESCADASTRADO')

    if (metodo === 'POST' && caminho === ROTAS_CAMPO.ola.caminho) {
      const c = corpo as { estados: Array<{ envioId: string }> }
      const recolher: string[] = []
      const envios = []
      for (const [id, e] of this.envios) {
        if (e.pedidoRecolher && (e.situacao === 'ENVIADA' || e.situacao === 'NO_CELULAR')) recolher.push(id)
        else if (e.situacao === 'ENVIADA' || e.situacao === 'NO_CELULAR') envios.push(resumoDoEnvio(e.pacote, e.situacao))
      }
      for (const { envioId } of c.estados)
        if (this.envios.get(envioId)?.situacao === 'RECOLHIDA' && !recolher.includes(envioId)) recolher.push(envioId)
      const desconhecidos = c.estados.map((x) => x.envioId).filter((id) => !this.envios.has(id))
      const resposta: RespostaOla = {
        agora: this.agoraServidor,
        tecnico: { id: 'usr-carlos', nome: 'Carlos Eduardo Lima' },
        servidor: { id: 'srv-1', nome: 'SERVIDOR' },
        envios,
        recolher,
        desconhecidos,
        recebeFolhas: true,
        ...(this.appDisponivel ? { appDisponivel: this.appDisponivel } : {}),
      }
      return { status: 200, corpo: resposta }
    }
    let m = /^\/api\/campo\/envios\/([^/]+)\/(pacote|recebida|recolhimento)$/.exec(caminho)
    if (m) {
      const e = this.envios.get(decodeURIComponent(m[1]))
      if (!e) return this.erro(404, 'ENVIO_DESCONHECIDO')
      if (m[2] === 'pacote') {
        if (e.situacao === 'RECOLHIDA') return this.erro(409, 'ENVIO_RECOLHIDO')
        e.baixado = true
        return { status: 200, corpo: e.pacote }
      }
      if (m[2] === 'recebida') {
        if (e.pedidoRecolher || e.situacao === 'RECOLHIDA') {
          e.situacao = 'RECOLHIDA'
          return { status: 200, corpo: { situacao: 'RECOLHIDA' } }
        }
        if (e.situacao === 'ENVIADA') e.situacao = 'NO_CELULAR'
        return { status: 200, corpo: { situacao: e.situacao } }
      }
      const resposta = (corpo as { resposta: string }).resposta
      e.respostaRecolher = resposta
      if (resposta === 'APAGUEI') e.situacao = 'RECOLHIDA'
      e.pedidoRecolher = false
      return { status: 200, corpo: { situacao: e.situacao } }
    }
    m = /^\/api\/campo\/registros\/([^/]+)$/.exec(caminho)
    if (m && metodo === 'PUT') {
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return this.erro(400, 'REGISTRO_ILEGIVEL')
      const registro = corpo as RegistroCampo
      const sha = calcularSha256Registro(registro, sha256Hex)
      let guardado = this.registros.get(sha)
      if (!guardado) {
        const e = this.envios.get(decodeURIComponent(m[1]))
        const marcas = [
          !e ? 'ORFAO' : null,
          e?.situacao === 'RECOLHIDA' ? 'APOS_RECOLHER' : null,
          this.descadastrado ? 'APARELHO_REVOGADO' : null,
        ].filter((x): x is 'ORFAO' | 'APOS_RECOLHER' | 'APARELHO_REVOGADO' => !!x)
        if (e && e.situacao !== 'RECOLHIDA') e.situacao = 'DEVOLVIDA'
        guardado = {
          registro,
          recibo: montarRecibo({
            numero: registro.numero,
            envioId: registro.envioId,
            sha256: sha,
            recebidoEm: this.agoraServidor,
            situacao: 'VALIDO',
            marcas,
          }),
        }
        this.registros.set(sha, guardado)
      }
      if (this.cairDepoisDeGravar > 0) {
        this.cairDepoisDeGravar--
        throw new ErroDeRede('PRAZO')
      }
      if (this.reciboErrado) {
        this.reciboErrado = false
        return { status: 200, corpo: { ...guardado.recibo, sha256: '0'.repeat(64) } }
      }
      return { status: 200, corpo: guardado.recibo }
    }
    return this.erro(404, 'NAO_ENCONTRADO')
  }
}

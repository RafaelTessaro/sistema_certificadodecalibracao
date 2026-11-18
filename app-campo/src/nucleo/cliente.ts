// Cliente da API do celular (shared/campo/protocolo.ts): monta cada pedido com o endereço gravado, o token (Bearer), o
// cabeçalho contra CSRF (x-bc-calibracao: 1), a hora do celular (x-bc-agora) e os prazos; e traduz cada resposta num
// resultado: ok com o valor, ou a falha (rede fora do ar = "servidor não encontrado"; status HTTP = o código de erro do
// contrato, com a frase em português). Nunca lança exceção para o chamador. Puro.

import {
  APP_DO_SERVIDOR,
  cabecalhosDoCelular,
  cabecalhosSemToken,
  caminhoCampo,
  classificarErroCampo,
  FORMATO_PACOTE,
  MENSAGEM_SEM_SERVIDOR,
  MENSAGENS_ERRO_CAMPO,
  PRAZOS_CAMPO,
  ROTA_SAUDE,
  ROTAS_CAMPO,
  urlCampo,
} from '../../../shared/campo/protocolo.ts'
import type {
  CodigoErroCampo,
  PedidoOla,
  PedidoParear,
  PrazoCampo,
  RespostaOla,
  RespostaParear,
  RespostaRecebida,
  RespostaRecolhimento,
  RespostaSaude,
  RotaCampo,
} from '../../../shared/campo/protocolo.ts'
import type { PacoteCampo, ReciboCampo, RegistroCampo } from '../../../shared/campo/tipos.ts'
import type { Relogio } from './relogio.ts'
import { ErroDeRede } from './transporte.ts'
import type { MetodoHttp, Transporte } from './transporte.ts'

/** Por que uma chamada não deu certo. */
export type FalhaCampo =
  /** Nada chegou do servidor (fora da rede da empresa, servidor desligado, prazo vencido). */
  | { tipo: 'REDE'; mensagem: string }
  /** O servidor respondeu com erro (ou com uma resposta que não tem o formato do contrato). */
  | { tipo: 'HTTP'; status: number; codigo: CodigoErroCampo | 'SERVIDOR'; mensagem: string; corpo: unknown }

export type ResultadoCampo<T> = { ok: true; valor: T } | { ok: false; falha: FalhaCampo }

/** O que o cliente precisa saber para falar com o servidor. */
export interface ConfigCliente {
  /** "http://192.168.0.10:4850" (normalizado). */
  endereco: string
  /** Token do pareamento ('' antes de parear). */
  token: string
}

/** A API do celular, como a sincronia e as telas usam (a classe abaixo é a de verdade; os testes podem trocar). */
export interface ApiCampo {
  saude(): Promise<ResultadoCampo<RespostaSaude>>
  parear(pedido: PedidoParear): Promise<ResultadoCampo<RespostaParear>>
  ola(pedido: PedidoOla): Promise<ResultadoCampo<RespostaOla>>
  pacote(envioId: string): Promise<ResultadoCampo<PacoteCampo>>
  recebida(envioId: string, pacoteSha256?: string): Promise<ResultadoCampo<RespostaRecebida>>
  recolhimento(envioId: string, resposta: RespostaRecolhimento): Promise<ResultadoCampo<{ situacao: string }>>
  entregar(registro: RegistroCampo): Promise<ResultadoCampo<ReciboCampo>>
}

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const listaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** A frase de uma falha, para mostrar ao técnico. */
export function mensagemDaFalha(falha: FalhaCampo): string {
  return falha.mensagem
}

export class ClienteCampo implements ApiCampo {
  private readonly config: () => ConfigCliente
  private readonly transporte: Transporte
  private readonly relogio: Relogio

  /** `config` é lida a cada chamada: trocar o endereço no Menu vale na hora. */
  constructor(config: ConfigCliente | (() => ConfigCliente), transporte: Transporte, relogio: Relogio) {
    this.config = typeof config === 'function' ? config : () => config
    this.transporte = transporte
    this.relogio = relogio
  }

  private async chamar<T>(
    metodo: MetodoHttp,
    caminho: string,
    prazo: PrazoCampo,
    opcoes: { comToken: boolean; corpo?: unknown; conferir: (corpo: unknown) => corpo is T },
  ): Promise<ResultadoCampo<T>> {
    const { endereco, token } = this.config()
    if (!endereco)
      return { ok: false, falha: { tipo: 'REDE', mensagem: 'O endereço do servidor não está gravado. Leia o QR do computador.' } }
    const agora = this.relogio.agora()
    const cabecalhos = opcoes.comToken ? cabecalhosDoCelular(token, agora) : cabecalhosSemToken(agora)
    let resposta
    try {
      resposta = await this.transporte.enviar({
        metodo,
        url: urlCampo(endereco, caminho),
        cabecalhos,
        ...(opcoes.corpo !== undefined ? { corpo: opcoes.corpo } : {}),
        prazo,
      })
    } catch (e) {
      // Qualquer falha antes da resposta (inclusive um erro inesperado do plugin) é "servidor não encontrado"
      const prazoVencido = e instanceof ErroDeRede && e.tipo === 'PRAZO'
      return {
        ok: false,
        falha: {
          tipo: 'REDE',
          mensagem: prazoVencido
            ? `O servidor em ${endereco} demorou demais para responder. Tente de novo daqui a pouco.`
            : MENSAGEM_SEM_SERVIDOR(endereco),
        },
      }
    }
    const { status, corpo } = resposta
    if (status >= 200 && status < 300) {
      if (opcoes.conferir(corpo)) return { ok: true, valor: corpo }
      return {
        ok: false,
        falha: { tipo: 'HTTP', status, codigo: 'SERVIDOR', mensagem: MENSAGENS_ERRO_CAMPO.SERVIDOR, corpo },
      }
    }
    const codigo = classificarErroCampo(status, corpo)
    const doServidor = ehObj(corpo) && typeof corpo.erro === 'string' ? corpo.erro : ''
    // A frase do contrato (curta, a mesma em todo lugar); a do servidor só quando o código é genérico
    const mensagem = codigo === 'SERVIDOR' && doServidor ? doServidor : MENSAGENS_ERRO_CAMPO[codigo]
    return { ok: false, falha: { tipo: 'HTTP', status, codigo, mensagem, corpo } }
  }

  private rota(r: RotaCampo, envioId?: string) {
    return { metodo: ROTAS_CAMPO[r].metodo, caminho: caminhoCampo(r, envioId) }
  }

  saude(): Promise<ResultadoCampo<RespostaSaude>> {
    return this.chamar('GET', ROTA_SAUDE, PRAZOS_CAMPO.saude, {
      comToken: false,
      conferir: (c): c is RespostaSaude => ehObj(c) && c.app === APP_DO_SERVIDOR && typeof c.id === 'string',
    })
  }

  parear(pedido: PedidoParear): Promise<ResultadoCampo<RespostaParear>> {
    const { metodo, caminho } = this.rota('parear')
    return this.chamar(metodo, caminho, PRAZOS_CAMPO.parear, {
      comToken: false,
      corpo: pedido,
      conferir: (c): c is RespostaParear =>
        ehObj(c) &&
        typeof c.token === 'string' &&
        ehObj(c.tecnico) &&
        typeof c.tecnico.id === 'string' &&
        typeof c.tecnico.nome === 'string' &&
        ehObj(c.servidor) &&
        typeof c.servidor.id === 'string',
    })
  }

  ola(pedido: PedidoOla): Promise<ResultadoCampo<RespostaOla>> {
    const { metodo, caminho } = this.rota('ola')
    return this.chamar(metodo, caminho, PRAZOS_CAMPO.ola, {
      comToken: true,
      corpo: pedido,
      conferir: (c): c is RespostaOla =>
        ehObj(c) &&
        typeof c.agora === 'string' &&
        Array.isArray(c.envios) &&
        c.envios.every((e) => ehObj(e) && typeof e.envioId === 'string' && typeof e.numero === 'string') &&
        listaDeTextos(c.recolher) &&
        listaDeTextos(c.desconhecidos) &&
        typeof c.recebeFolhas === 'boolean',
    })
  }

  pacote(envioId: string): Promise<ResultadoCampo<PacoteCampo>> {
    const { metodo, caminho } = this.rota('pacote', envioId)
    return this.chamar(metodo, caminho, PRAZOS_CAMPO.pacote, {
      comToken: true,
      conferir: (c): c is PacoteCampo =>
        ehObj(c) &&
        c.formato === FORMATO_PACOTE &&
        c.envioId === envioId &&
        ehObj(c.folha) &&
        typeof c.folha.numero === 'string' &&
        ehObj(c.entrada) &&
        ehObj(c.padroes) &&
        ehObj(c.conferir),
    })
  }

  recebida(envioId: string, pacoteSha256?: string): Promise<ResultadoCampo<RespostaRecebida>> {
    const { metodo, caminho } = this.rota('recebida', envioId)
    return this.chamar(metodo, caminho, PRAZOS_CAMPO.recebida, {
      comToken: true,
      corpo: pacoteSha256 ? { pacoteSha256 } : {},
      conferir: (c): c is RespostaRecebida => ehObj(c) && typeof c.situacao === 'string',
    })
  }

  recolhimento(envioId: string, resposta: RespostaRecolhimento): Promise<ResultadoCampo<{ situacao: string }>> {
    const { metodo, caminho } = this.rota('recolhimento', envioId)
    return this.chamar(metodo, caminho, PRAZOS_CAMPO.recolhimento, {
      comToken: true,
      corpo: { resposta },
      conferir: (c): c is { situacao: string } => ehObj(c) && typeof c.situacao === 'string',
    })
  }

  entregar(registro: RegistroCampo): Promise<ResultadoCampo<ReciboCampo>> {
    const { metodo, caminho } = this.rota('registro', registro.envioId)
    return this.chamar(metodo, caminho, PRAZOS_CAMPO.registro, {
      comToken: true,
      corpo: registro,
      conferir: (c): c is ReciboCampo =>
        ehObj(c) && typeof c.numero === 'string' && typeof c.envioId === 'string' && typeof c.sha256 === 'string',
    })
  }
}

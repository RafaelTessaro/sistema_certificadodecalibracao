// Limite de tentativas de entrada (e da senha atual na troca da própria senha), em memória.
// Reiniciar o serviço zera os contadores, o que é aceitável: o objetivo é tornar inviável testar
// senhas em série pela rede, não guardar histórico (o histórico fica no registro de atividades).
//
//   par:<login>|<ip>   5 falhas seguidas → espera de 30 s, que dobra a cada nova falha (até 15 min); zera no acerto
//   ip:<ip>            20 falhas em 15 min → 15 min sem entrar a partir desse IP; não zera no acerto
//   login:<login>      50 falhas em 1 h, de qualquer IP → 15 min sem entrar; não vale para o próprio servidor
//   senha:<usuarioId>  senha atual errada na troca da própria senha: mesma regra do par
//
// A tentativa conta desde a chegada (`reservar`, antes do scrypt), não só quando a senha dá errado: sem isso,
// uma rajada de pedidos simultâneos passava inteira pela conferência antes de a 1ª falha ser contada.

const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const HORA = 60 * MINUTO

type Tipo = 'par' | 'ip' | 'login' | 'senha'

interface RegraSeguidas {
  modo: 'seguidas'
  /** Falhas seguidas antes da primeira espera. */
  livres: number
  esperaInicialMs: number
  esperaMaximaMs: number
  /** Sem falhar por este tempo (e sem bloqueio em curso), o contador recomeça. */
  esquecerMs: number
}
interface RegraJanela {
  modo: 'janela'
  falhas: number
  janelaMs: number
  bloqueioMs: number
}

export const REGRAS_TENTATIVAS: Record<Tipo, RegraSeguidas | RegraJanela> = {
  par: { modo: 'seguidas', livres: 5, esperaInicialMs: 30 * SEGUNDO, esperaMaximaMs: 15 * MINUTO, esquecerMs: HORA },
  senha: { modo: 'seguidas', livres: 5, esperaInicialMs: 30 * SEGUNDO, esperaMaximaMs: 15 * MINUTO, esquecerMs: HORA },
  ip: { modo: 'janela', falhas: 20, janelaMs: 15 * MINUTO, bloqueioMs: 15 * MINUTO },
  login: { modo: 'janela', falhas: 50, janelaMs: HORA, bloqueioMs: 15 * MINUTO },
}

/** Tipos que a redefinição da senha destrava (o bloqueio por IP continua). */
const DESTRAVA_COM_SENHA_NOVA: ReadonlySet<Tipo> = new Set(['par', 'login', 'senha'])

/** Entrada: login já normalizado (exista ou não) e IP. Troca da própria senha: o id do usuário. */
export type ChavesTentativa = { login: string; ip: string; loopback: boolean } | { trocaSenhaDe: string }

interface Registro {
  tipo: Tipo
  /** Falhas seguidas (modo "seguidas"). */
  falhas: number
  /** Horários das falhas dentro da janela (modo "janela"). */
  horarios: number[]
  /** Primeira falha registrada (ou início do bloqueio em curso). */
  inicio: number
  ultima: number
  bloqueadoDesde: number
  bloqueadoAte: number
}

export class LimiteTentativas {
  private registros = new Map<string, Registro>()
  /** Tentativas em andamento (senha ainda sendo conferida), por chave. */
  private emAndamento = new Map<string, number>()
  private agora: () => number

  constructor(agora: () => number = Date.now) {
    this.agora = agora
  }

  /**
   * Segundos que ainda faltam para poder tentar de novo, ou `null` se está liberado.
   * `desbloqueadoEm` (epoch ms): quando a senha da conta foi trocada ou redefinida; bloqueios e
   * falhas anteriores a isso (nas chaves do par, do login e da troca de senha) são esquecidos.
   */
  espera(chaves: ChavesTentativa, desbloqueadoEm?: number): number | null {
    return this.bloqueio(chaves, desbloqueadoEm)?.segundos ?? null
  }

  /**
   * Como `espera`, dizendo também de qual regra é a espera mais longa (`ip`: o computador errou muitas
   * vezes, com qualquer usuário; esse bloqueio não acaba com a senha redefinida).
   */
  bloqueio(chaves: ChavesTentativa, desbloqueadoEm?: number): { segundos: number; tipo: Tipo } | null {
    const agora = this.agora()
    let maior = 0
    let tipoMaior: Tipo = 'par'
    for (const [chave, tipo] of this.chaves(chaves)) {
      let r = this.vigente(chave, agora)
      if (r && desbloqueadoEm !== undefined && DESTRAVA_COM_SENHA_NOVA.has(tipo) && desbloqueadoEm > r.inicio) {
        this.registros.delete(chave)
        r = undefined
      }
      const ms = Math.max(r ? r.bloqueadoAte - agora : 0, this.esperaSeAsEmAndamentoFalharem(chave, tipo, r, agora))
      if (ms > maior) {
        maior = ms
        tipoMaior = tipo
      }
    }
    return maior > 0 ? { segundos: Math.ceil(maior / SEGUNDO), tipo: tipoMaior } : null
  }

  /**
   * Conta a tentativa que vai conferir a senha agora (chamar logo depois de `bloqueio` dar `null`, antes do
   * scrypt). Enquanto ela não termina, ocupa uma vaga: as em andamento somam com as falhas, e o pedido que
   * passaria do limite se todas elas errassem recebe a espera na hora. Devolve a função que libera a vaga
   * (chamar quando a conferência termina, antes de `falhou` ou `acertou`; chamar de novo não faz nada).
   */
  reservar(chaves: ChavesTentativa): () => void {
    const lista = this.chaves(chaves).map(([chave]) => chave)
    for (const chave of lista) this.emAndamento.set(chave, (this.emAndamento.get(chave) ?? 0) + 1)
    let liberada = false
    return () => {
      if (liberada) return
      liberada = true
      for (const chave of lista) {
        const n = (this.emAndamento.get(chave) ?? 0) - 1
        if (n > 0) this.emAndamento.set(chave, n)
        else this.emAndamento.delete(chave)
      }
    }
  }

  /** Registra uma falha. `bloqueouAgora`: um bloqueio começou com esta falha (para registrar uma vez só). */
  falhou(chaves: ChavesTentativa): { bloqueouAgora: boolean; motivos: Tipo[] } {
    const agora = this.agora()
    const motivos: Tipo[] = []
    if (this.registros.size > 10_000) this.limpar()
    for (const [chave, tipo] of this.chaves(chaves)) {
      const regra = REGRAS_TENTATIVAS[tipo]
      let r = this.vigente(chave, agora)
      if (!r) {
        r = { tipo, falhas: 0, horarios: [], inicio: agora, ultima: agora, bloqueadoDesde: 0, bloqueadoAte: 0 }
        this.registros.set(chave, r)
      }
      const jaBloqueado = r.bloqueadoAte > agora
      r.ultima = agora
      if (regra.modo === 'seguidas') {
        r.falhas++
        if (r.falhas >= regra.livres) {
          const espera = Math.min(regra.esperaInicialMs * 2 ** (r.falhas - regra.livres), regra.esperaMaximaMs)
          r.bloqueadoAte = Math.max(r.bloqueadoAte, agora + espera)
          if (!jaBloqueado) {
            r.bloqueadoDesde = agora
            motivos.push(tipo)
          }
        }
      } else {
        r.horarios = r.horarios.filter((t) => agora - t < regra.janelaMs)
        r.horarios.push(agora)
        if (r.horarios.length >= regra.falhas && !jaBloqueado) {
          r.bloqueadoDesde = agora
          r.bloqueadoAte = agora + regra.bloqueioMs
          r.horarios = []
          motivos.push(tipo)
        }
      }
    }
    return { bloqueouAgora: motivos.length > 0, motivos }
  }

  /** Acerto: zera as falhas seguidas (par e troca de senha). Os tetos por IP e por login continuam. */
  acertou(chaves: ChavesTentativa) {
    for (const [chave, tipo] of this.chaves(chaves)) if (REGRAS_TENTATIVAS[tipo].modo === 'seguidas') this.registros.delete(chave)
  }

  /** Esquece o que já venceu (chamado pela varredura a cada minuto). */
  limpar() {
    const agora = this.agora()
    for (const [chave] of this.registros) this.vigente(chave, agora)
  }

  /** Quantos registros estão em memória (para os testes). */
  get tamanho() {
    return this.registros.size
  }

  /** Quantas chaves têm tentativas em andamento (para os testes). */
  get reservas() {
    return this.emAndamento.size
  }

  /**
   * Espera (ms) para quem chega com a chave já cheia de tentativas em andamento: a que valeria se todas elas
   * errassem; 0 se ainda há vaga. Vagas: as falhas que faltam para o bloqueio; depois de um bloqueio que já
   * acabou, uma por vez (como em série, a próxima falha já bloqueia de novo).
   */
  private esperaSeAsEmAndamentoFalharem(chave: string, tipo: Tipo, r: Registro | undefined, agora: number): number {
    const andamento = this.emAndamento.get(chave) ?? 0
    if (!andamento) return 0
    const regra = REGRAS_TENTATIVAS[tipo]
    if (regra.modo === 'seguidas') {
      const falhas = r?.falhas ?? 0
      if (andamento < Math.max(regra.livres - falhas, 1)) return 0
      return Math.min(regra.esperaInicialMs * 2 ** Math.max(falhas + andamento - regra.livres, 0), regra.esperaMaximaMs)
    }
    const falhas = r ? r.horarios.filter((t) => agora - t < regra.janelaMs).length : 0
    return andamento < Math.max(regra.falhas - falhas, 1) ? 0 : regra.bloqueioMs
  }

  /** O registro, se ainda conta; um vencido é apagado. */
  private vigente(chave: string, agora: number): Registro | undefined {
    const r = this.registros.get(chave)
    if (!r) return undefined
    if (r.bloqueadoAte > agora) return r
    const regra = REGRAS_TENTATIVAS[r.tipo]
    const vencido =
      regra.modo === 'seguidas'
        ? agora - r.ultima >= regra.esquecerMs
        : r.horarios.every((t) => agora - t >= regra.janelaMs) && agora - r.ultima >= regra.janelaMs
    if (vencido) {
      this.registros.delete(chave)
      return undefined
    }
    return r
  }

  private chaves(c: ChavesTentativa): Array<[string, Tipo]> {
    if ('trocaSenhaDe' in c) return [[`senha:${c.trocaSenhaDe}`, 'senha']]
    const lista: Array<[string, Tipo]> = [
      [`par:${c.login}|${c.ip}`, 'par'],
      [`ip:${c.ip}`, 'ip'],
    ]
    // O teto por login não vale para quem entra pelo próprio servidor: um ataque pela rede não
    // impede o dono de entrar no computador do servidor
    if (!c.loopback) lista.push([`login:${c.login}`, 'login'])
    return lista
  }
}

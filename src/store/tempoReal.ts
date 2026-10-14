import { create } from 'zustand'
import type { MensagemTempoReal } from '#shared/tipos.ts'
import { conectarTempoReal, type ConexaoTempoReal } from '../lib/api'
import { useSessao } from './sessao'

export type TipoMudanca = MensagemTempoReal['tipo']

const TIPOS: TipoMudanca[] = ['cliente', 'balanca', 'padrao', 'calibracao', 'config', 'tudo']

interface TempoRealState {
  conectado: boolean
  /** Já conectou alguma vez nesta aba (para não mostrar o aviso de conexão logo na abertura). */
  jaConectou: boolean
  /** Contador por tipo de dado: as telas recarregam o que mostram quando o contador do que usam muda. */
  versoes: Record<TipoMudanca, number>
  iniciar(): () => void
  reconectar(): void
  /** Avisa as telas desta aba que algo mudou (logo depois de gravar, sem esperar o servidor). */
  mudou(...tipos: TipoMudanca[]): void
}

let conexao: ConexaoTempoReal | null = null
let timerReabrir: ReturnType<typeof setTimeout> | undefined
let tentativasReabrir = 0
let buildInicial: string | null = null
let ultimaRevisao = -1

/** Recarrega a página uma vez (servidor atualizado: a interface desta aba ficou antiga). */
function recarregarPagina() {
  try {
    const ultima = Number(sessionStorage.getItem('bc-calibracao:recarregou') ?? 0)
    if (Date.now() - ultima < 30_000) return
    sessionStorage.setItem('bc-calibracao:recarregou', String(Date.now()))
  } catch {
    /* sem sessionStorage: recarrega mesmo assim */
  }
  location.reload()
}

const zeradas = () => Object.fromEntries(TIPOS.map((t) => [t, 0])) as Record<TipoMudanca, number>

export const useTempoReal = create<TempoRealState>()((set, get) => ({
  conectado: false,
  jaConectou: false,
  versoes: zeradas(),

  mudou(...tipos) {
    const v = { ...get().versoes }
    for (const t of tipos) v[t]++
    set({ versoes: v })
  },

  iniciar() {
    buildInicial ??= useSessao.getState().build || null
    const c = conectarTempoReal({
      aoConectar(ola) {
        set({ conectado: true, jaConectou: true })
        tentativasReabrir = 0
        if (buildInicial === null) buildInicial = ola.build
        else if (ola.build && ola.build !== buildInicial) {
          recarregarPagina()
          return
        }
        // Algo mudou enquanto a aba estava desconectada: tudo recarrega
        if (ultimaRevisao !== -1 && ola.revisao !== ultimaRevisao) get().mudou('tudo')
        ultimaRevisao = ola.revisao
      },
      aoReceber(msg) {
        ultimaRevisao = Math.max(ultimaRevisao, msg.revisao)
        get().mudou(msg.tipo)
      },
      aoDesconectar() {
        set({ conectado: false })
      },
      aoSemSessao(ola) {
        set({ conectado: false })
        if (ola.build && buildInicial && ola.build !== buildInicial) {
          recarregarPagina()
          return
        }
        void useSessao
          .getState()
          .conferir()
          .then((valendo) => {
            if (!valendo) return
            clearTimeout(timerReabrir)
            const espera = Math.min(60_000, 3000 * 2 ** tentativasReabrir++)
            timerReabrir = setTimeout(() => conexao?.reabrir(), espera)
          })
      },
    })
    conexao = c
    return () => {
      clearTimeout(timerReabrir)
      c.fechar()
      if (conexao === c) conexao = null
    }
  },

  reconectar() {
    clearTimeout(timerReabrir)
    tentativasReabrir = 0
    conexao?.reabrir()
    get().mudou('tudo')
  },
}))

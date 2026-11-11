import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { armazenamentoSeguro } from '../lib/storage'

export type Tema = 'light' | 'dark' | 'system'

interface UIState {
  tema: Tema
  sidebarRecolhida: boolean
  definirTema: (t: Tema) => void
  alternarSidebar: () => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      tema: 'system',
      sidebarRecolhida: false,
      definirTema: (tema) => set({ tema }),
      alternarSidebar: () => set((s) => ({ sidebarRecolhida: !s.sidebarRecolhida })),
    }),
    {
      name: 'bc-calibracao:ui',
      storage: createJSONStorage(() => armazenamentoSeguro),
    },
  ),
)

export function aplicarTema(tema: Tema) {
  const escuro = tema === 'dark' || (tema === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light'
}

// ---- Notificações (toasts) -------------------------------------------------

export interface Toast {
  id: number
  titulo: string
  descricao?: string
  /** `aviso`: deu certo só em parte, e é preciso conferir algo (ex.: um destinatário recusado). */
  tipo: 'sucesso' | 'erro' | 'info' | 'aviso'
  /** Os nºs (da folha, do certificado) que o título e a descrição citam: não quebram no meio (`SemPartir`). */
  inteiros?: ReadonlyArray<string | null | undefined>
}

const MINIMO_MS: Record<Toast['tipo'], number> = { sucesso: 3500, info: 3500, erro: 6000, aviso: 6000 }

/**
 * Quanto tempo o toast fica na tela: o curto, como sempre (3,5 s; o erro e o aviso, 6 s); o longo, o tempo de ler
 * (cerca de 4 palavras por segundo), até 15 s. Com o mouse em cima, ele não some (`pausar`).
 */
export function duracaoDoToast(t: Pick<Toast, 'titulo' | 'descricao' | 'tipo'>): number {
  const palavras = `${t.titulo} ${t.descricao ?? ''}`.trim().split(/\s+/).length
  return Math.min(15_000, Math.max(MINIMO_MS[t.tipo], 1500 + palavras * 250))
}

interface ToastState {
  toasts: Toast[]
  mostrar: (t: Omit<Toast, 'id'>) => void
  fechar: (id: number) => void
  /** O mouse em cima: o toast para de contar o tempo. */
  pausar: (id: number) => void
  /** O mouse saiu: volta a contar o que faltava (no mínimo 2,5 s). */
  retomar: (id: number) => void
}

let seq = 0
const relogios = new Map<number, { timer?: ReturnType<typeof setTimeout>; restante: number; desde: number }>()
export const useToasts = create<ToastState>()((set, get) => {
  const contar = (id: number, ms: number) => {
    relogios.set(id, { timer: setTimeout(() => get().fechar(id), ms), restante: ms, desde: Date.now() })
  }
  return {
    toasts: [],
    mostrar(t) {
      const id = ++seq
      set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }))
      contar(id, duracaoDoToast(t))
    },
    fechar: (id) => {
      clearTimeout(relogios.get(id)?.timer)
      relogios.delete(id)
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
    },
    pausar: (id) => {
      const r = relogios.get(id)
      if (!r?.timer) return
      clearTimeout(r.timer)
      relogios.set(id, { restante: Math.max(0, r.restante - (Date.now() - r.desde)), desde: Date.now() })
    },
    retomar: (id) => {
      const r = relogios.get(id)
      if (!r || r.timer) return
      contar(id, Math.max(r.restante, 2500))
    },
  }
})

/** `inteiros`: os nºs citados (da folha, do certificado), que não quebram no meio. */
type Opcoes = { inteiros?: ReadonlyArray<string | null | undefined> }
export const toast = {
  sucesso: (titulo: string, descricao?: string, o?: Opcoes) =>
    useToasts.getState().mostrar({ titulo, descricao, tipo: 'sucesso', ...o }),
  erro: (titulo: string, descricao?: string, o?: Opcoes) =>
    useToasts.getState().mostrar({ titulo, descricao, tipo: 'erro', ...o }),
  info: (titulo: string, descricao?: string, o?: Opcoes) =>
    useToasts.getState().mostrar({ titulo, descricao, tipo: 'info', ...o }),
  aviso: (titulo: string, descricao?: string, o?: Opcoes) =>
    useToasts.getState().mostrar({ titulo, descricao, tipo: 'aviso', ...o }),
}

/** Mostra o erro de uma operação no servidor de forma amigável. */
export function avisarErro(titulo: string, e: unknown) {
  toast.erro(titulo, e instanceof Error ? e.message : 'Erro inesperado.')
}

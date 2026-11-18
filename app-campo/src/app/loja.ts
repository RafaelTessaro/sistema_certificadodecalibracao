// O estado do app (uma loja pequena, sem biblioteca): o pareamento, as folhas (o espelho do repositório), a pilha de
// telas, a sincronia e os ajustes. As telas leem com `useApp(seletor)`; as ações (acoes.ts) mudam.

import { useSyncExternalStore } from 'react'
import type { ServidorCampo } from '../../../shared/campo/protocolo.ts'
import type { PessoaCampo } from '../../../shared/campo/tipos.ts'
import type { EtapaFolha } from '../../../shared/campo/progresso.ts'
import type { FolhaLocal } from '../nucleo/folha.ts'
import type { TentativasPin } from '../nucleo/pin.ts'
import { semTentativas } from '../nucleo/pin.ts'
import type { ResultadoSincronia } from '../nucleo/sincronia.ts'

export interface Pareamento {
  /** "http://192.168.0.10:4850". */
  endereco: string
  token: string
  tecnico: PessoaCampo
  servidor: ServidorCampo
  aparelhoId: string
  pareadoEm: string
}

export type Tema = 'SISTEMA' | 'CLARO' | 'ESCURO'

export type Tela =
  | { nome: 'lista' }
  | { nome: 'capa'; envioId: string }
  | { nome: 'passo'; envioId: string; etapa: EtapaFolha; foco?: string }
  | { nome: 'revisao'; envioId: string }
  | { nome: 'assinaturaTecnico'; envioId: string }
  | { nome: 'entregaCliente'; envioId: string }
  | { nome: 'clientePendente'; envioId: string }
  | { nome: 'comprovante'; envioId: string }
  | { nome: 'verFolha'; envioId: string }
  | { nome: 'menu' }
  | { nome: 'pareamento'; motivo: 'PRIMEIRA' | 'DE_NOVO' | 'ESQUECI_PIN' }

export interface AvisoRapido {
  texto: string
  tom: 'ok' | 'aviso' | 'erro'
  id: number
}

export interface EstadoApp {
  carregado: boolean
  /** Problema ao abrir o banco (o app não funciona sem ele). */
  erroAoAbrir: string
  pareamento: Pareamento | null
  temPin: boolean
  tema: Tema
  horaLembrete: string
  folhas: FolhaLocal[]
  pilha: Tela[]
  sincronizando: boolean
  ultima: ResultadoSincronia | null
  ultimaEntrega: string
  descadastrado: boolean
  naoPareado: boolean
  /** Hora (ms) da última gravação: "Salvo ✓" por 2 s. */
  salvoEm: number
  lendoQr: boolean
  aviso: AvisoRapido | null
  tentativasPin: TentativasPin
  /** O app voltou do segundo plano no modo entrega: pede o PIN antes de seguir. */
  pinAoVoltar: boolean
  versaoApp: string
  modeloAparelho: string
}

const versaoDoBuild = (): string => {
  const v = import.meta.env.VITE_VERSAO_APP as string | undefined
  return v && /^\d+\.\d+\.\d+/.test(v) ? v : '1.1.0'
}

let estado: EstadoApp = {
  carregado: false,
  erroAoAbrir: '',
  pareamento: null,
  temPin: false,
  tema: 'SISTEMA',
  horaLembrete: '17:30',
  folhas: [],
  pilha: [{ nome: 'lista' }],
  sincronizando: false,
  ultima: null,
  ultimaEntrega: '',
  descadastrado: false,
  naoPareado: false,
  salvoEm: 0,
  lendoQr: false,
  aviso: null,
  tentativasPin: semTentativas(),
  pinAoVoltar: false,
  versaoApp: versaoDoBuild(),
  modeloAparelho: '',
}

const ouvintes = new Set<() => void>()

export function lerEstado(): EstadoApp {
  return estado
}

export function mudarEstado(parcial: Partial<EstadoApp> | ((e: EstadoApp) => Partial<EstadoApp>)): void {
  const p = typeof parcial === 'function' ? parcial(estado) : parcial
  estado = { ...estado, ...p }
  for (const o of ouvintes) o()
}

function assinar(o: () => void) {
  ouvintes.add(o)
  return () => ouvintes.delete(o)
}

/** O pedaço do estado que a tela usa (re-renderiza só quando ele muda). */
export function useApp<T>(seletor: (e: EstadoApp) => T): T {
  return useSyncExternalStore(
    assinar,
    () => seletor(estado),
    () => seletor(estado),
  )
}

/** A folha pelo envio (do espelho do repositório). */
export const useFolha = (envioId: string) => useApp((e) => e.folhas.find((f) => f.envioId === envioId) ?? null)

export const telaAtual = (e: EstadoApp): Tela => e.pilha[e.pilha.length - 1] ?? { nome: 'lista' }

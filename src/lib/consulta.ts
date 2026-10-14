import { useCallback, useEffect, useRef, useState } from 'react'
import { useTempoReal, type TipoMudanca } from '../store/tempoReal'
import { ErroApi } from './api'

/** Última resposta de cada consulta: ao voltar a uma tela, ela aparece na hora e se atualiza em seguida. */
const cache = new Map<string, unknown>()

export interface ResultadoConsulta<T> {
  dados: T | undefined
  erro: string
  /** Primeira carga (sem nada para mostrar ainda). */
  carregando: boolean
  /** Atualizando em segundo plano (já há dados na tela). */
  atualizando: boolean
  recarregar: () => void
  /** Troca os dados na tela (ex.: logo depois de salvar), sem esperar a recarga. */
  definir: (dados: T) => void
}

/**
 * Busca dados do servidor e mantém a tela atualizada: refaz a busca quando a `chave` muda e quando
 * qualquer computador altera algo dos tipos em `depende` (tempo real). `chave` nula não busca.
 */
export function useConsulta<T>(chave: string | null, buscar: () => Promise<T>, depende: TipoMudanca[]): ResultadoConsulta<T> {
  const [dados, setDados] = useState<T | undefined>(() => (chave ? (cache.get(chave) as T | undefined) : undefined))
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(() => !!chave && !cache.has(chave))
  const [atualizando, setAtualizando] = useState(false)
  const [forcar, setForcar] = useState(0)
  const versao = useTempoReal((s) => depende.reduce((soma, t) => soma + s.versoes[t], s.versoes.tudo))
  const buscarRef = useRef(buscar)
  buscarRef.current = buscar
  const chaveRef = useRef(chave)

  useEffect(() => {
    if (!chave) return
    if (chaveRef.current !== chave) {
      chaveRef.current = chave
      const guardado = cache.get(chave) as T | undefined
      setDados(guardado)
      setCarregando(guardado === undefined)
      setErro('')
    }
    let ativo = true
    setAtualizando(true)
    buscarRef
      .current()
      .then((d) => {
        if (!ativo) return
        cache.set(chave, d)
        setDados(d)
        setErro('')
      })
      .catch((e: unknown) => {
        if (!ativo) return
        // Sem sessão: a tela de login aparece por cima; não mostra erro na página
        if (e instanceof ErroApi && e.status === 401) return
        setErro(e instanceof Error ? e.message : 'Erro inesperado.')
      })
      .finally(() => {
        if (!ativo) return
        setCarregando(false)
        setAtualizando(false)
      })
    return () => {
      ativo = false
    }
  }, [chave, versao, forcar])

  const recarregar = useCallback(() => setForcar((n) => n + 1), [])
  const definir = useCallback(
    (d: T) => {
      if (chave) cache.set(chave, d)
      setDados(d)
    },
    [chave],
  )
  return { dados, erro, carregando, atualizando, recarregar, definir }
}

/** Esquece as respostas guardadas (ao sair do sistema). */
export function limparCacheConsultas() {
  cache.clear()
}

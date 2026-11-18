// Eventos do Android (@capacitor/app): voltar para o app (→ sincronia), ir para segundo plano (o modo entrega volta
// pedindo o PIN), o botão/gesto de voltar e abrir uma URL no navegador do Android (o APK da versão nova).

import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export interface OuvintesApp {
  aoVoltar: () => void
  aoSair: () => void
  /** Devolve true se tratou o voltar (senão o app vai para segundo plano). */
  aoVoltarTela: () => boolean
}

export async function ouvirEventos(o: OuvintesApp): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    document.addEventListener('visibilitychange', () => (document.hidden ? o.aoSair() : o.aoVoltar()))
    return
  }
  await App.addListener('resume', () => o.aoVoltar())
  await App.addListener('pause', () => o.aoSair())
  await App.addListener('backButton', () => {
    if (!o.aoVoltarTela()) void App.minimizeApp()
  })
}

/**
 * Abre a URL no navegador do Android (o Capacitor manda para fora do app toda navegação para outro endereço): o
 * navegador baixa o APK e o Android instala por cima, sem perder os dados.
 */
export function abrirNoNavegador(url: string): void {
  window.location.assign(url)
}

/** A versão instalada (versionName), ou null fora do celular. */
export async function versaoInstalada(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    return (await App.getInfo()).version
  } catch {
    return null
  }
}

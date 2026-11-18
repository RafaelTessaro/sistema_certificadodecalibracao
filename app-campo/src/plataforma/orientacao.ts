// O app fica em pé, menos nas telas de assinatura, que deitam sozinhas (@capacitor/screen-orientation).

import { Capacitor } from '@capacitor/core'
import { ScreenOrientation } from '@capacitor/screen-orientation'

async function travar(orientation: 'portrait' | 'landscape') {
  if (!Capacitor.isNativePlatform()) return
  try {
    await ScreenOrientation.lock({ orientation })
  } catch {
    // Sem o sensor (ou num emulador sem suporte): segue como está
  }
}

export const ficarEmPe = () => travar('portrait')
export const deitar = () => travar('landscape')

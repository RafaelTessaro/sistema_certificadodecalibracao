// Ler o QR do computador (pareamento e endereço do servidor) com o ML Kit embutido no app (funciona sem internet). A
// câmera fica atrás do WebView: enquanto lê, o app fica transparente (classe "lendo-qr") e mostra só a moldura e o
// "Cancelar". Se a câmera falhar ou não tiver permissão, o técnico digita o endereço e o código.

import { Capacitor } from '@capacitor/core'
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import type { PluginListenerHandle } from '@capacitor/core'

export class ErroQr extends Error {}

let cancelar: (() => void) | null = null

/** Lê um QR. Devolve o texto, ou null se o técnico cancelou. Lança ErroQr com a frase quando não dá para ler. */
export async function lerQr(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) throw new ErroQr('A câmera só funciona no celular. Digite o endereço e o código.')
  const { supported } = await BarcodeScanner.isSupported()
  if (!supported) throw new ErroQr('Este celular não tem câmera para ler o QR. Digite o endereço e o código.')
  let permissao = (await BarcodeScanner.checkPermissions()).camera
  if (permissao !== 'granted' && permissao !== 'limited') permissao = (await BarcodeScanner.requestPermissions()).camera
  if (permissao !== 'granted' && permissao !== 'limited')
    throw new ErroQr(
      'Sem permissão para usar a câmera. Digite o endereço e o código, ou permita a câmera nos ajustes do Android.',
    )

  document.body.classList.add('lendo-qr')
  let ouvinte: PluginListenerHandle | null = null
  try {
    return await new Promise<string | null>((resolve, reject) => {
      cancelar = () => resolve(null)
      void BarcodeScanner.addListener('barcodesScanned', (e) => {
        const texto = e.barcodes.find((b) => b.rawValue)?.rawValue
        if (texto) resolve(texto)
      }).then((h) => (ouvinte = h))
      BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] }).catch((e: unknown) =>
        reject(new ErroQr(`A câmera não abriu (${e instanceof Error ? e.message : String(e)}). Digite o endereço e o código.`)),
      )
    })
  } finally {
    cancelar = null
    document.body.classList.remove('lendo-qr')
    await (ouvinte as PluginListenerHandle | null)?.remove()
    await BarcodeScanner.stopScan().catch(() => undefined)
  }
}

/** O "Cancelar" da moldura. */
export function cancelarLeituraQr(): void {
  cancelar?.()
}

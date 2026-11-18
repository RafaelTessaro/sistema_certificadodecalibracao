// O lembrete do fim do expediente (@capacitor/local-notifications, sem rede e sem trabalho em segundo plano): quando há
// folha finalizada e não entregue, uma notificação local na hora escolhida no Menu (17:30 de fábrica): "2 folhas para
// entregar: abra o BC Calibração na empresa". Cancelada quando a entrega acontece. Alarme não exato (o Android não pede a
// permissão de alarmes exatos).

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { proximoHorario } from '../nucleo/datas.ts'

const ID_LEMBRETE = 1730

export const HORA_LEMBRETE_PADRAO = '17:30'

/** Agenda (ou cancela, com 0) o lembrete das folhas para entregar. Nunca lança: o lembrete é só uma ajuda. */
export async function atualizarLembrete(paraEntregar: number, hora: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_LEMBRETE }] })
    if (paraEntregar <= 0) return
    // Sem pedir aqui (a pergunta do Android tiraria o app da frente no meio do modo entrega): a permissão é pedida uma
    // vez, ao criar o PIN
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_LEMBRETE,
          title: 'Folhas para entregar',
          body: `${paraEntregar === 1 ? '1 folha' : `${paraEntregar} folhas`} para entregar: abra o BC Calibração na empresa.`,
          schedule: { at: proximoHorario(hora, new Date()), allowWhileIdle: true },
          isExactNotification: false,
        },
      ],
    })
  } catch {
    // Sem permissão ou sem o serviço: o contador na tela continua lembrando
  }
}

/** Pede a permissão de notificações (Android 13+), uma vez, ao criar o PIN. */
export async function pedirPermissaoNotificacoes(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const p = (await LocalNotifications.checkPermissions()).display
    if (p === 'prompt' || p === 'prompt-with-rationale') await LocalNotifications.requestPermissions()
  } catch {
    // Sem o serviço: o contador na tela continua lembrando
  }
}

// O aparelho: o id (UUID gerado na primeira abertura, o mesmo ao parear de novo) e o modelo ("Samsung SM-A546E").

import { Capacitor } from '@capacitor/core'
import { Device } from '@capacitor/device'
import { novoId } from '../../../shared/id.ts'
import { lerPreferencia, gravarPreferencia, PREF } from './preferencias.ts'

export async function idDoAparelho(): Promise<string> {
  const salvo = await lerPreferencia(PREF.aparelhoId)
  if (salvo) return salvo
  const id = novoId().toLowerCase()
  await gravarPreferencia(PREF.aparelhoId, id)
  return id
}

export async function modeloDoAparelho(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return 'Navegador'
  try {
    const i = await Device.getInfo()
    const fabricante = i.manufacturer ? i.manufacturer.charAt(0).toUpperCase() + i.manufacturer.slice(1) : ''
    const modelo = i.model.toLowerCase().startsWith(fabricante.toLowerCase()) ? i.model : `${fabricante} ${i.model}`.trim()
    return `${modelo}${i.osVersion ? ` · Android ${i.osVersion}` : ''}`.slice(0, 80)
  } catch {
    return 'Android'
  }
}

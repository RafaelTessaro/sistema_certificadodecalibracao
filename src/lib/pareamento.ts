// O QR do pareamento do celular e o endereço do APK ("Cadastrar celular", Usuários → Celulares dos técnicos).

import { formatarQrPareamento } from '#shared/campo/protocolo.ts'

/** O QR do pareamento com o endereço escolhido (quando o servidor tem mais de um IP). */
export const qrComEndereco = (endereco: string, codigo: string) => formatarQrPareamento({ servidor: endereco, codigo })

/** "http://192.168.0.10:4850/api/campo/apk": o endereço do APK para a primeira instalação pelo navegador do celular. */
export const enderecoDoApk = (endereco: string) => `${endereco.replace(/\/+$/, '')}/api/campo/apk`

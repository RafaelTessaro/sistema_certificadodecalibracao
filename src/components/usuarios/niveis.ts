import { ShieldCheck, UserRound } from 'lucide-react'
import type { NivelUsuario } from '#shared/tipos.ts'

/** Ícone de cada nível (a chave de ferramentas fica para a marca de técnico). */
export const ICONE_NIVEL: Record<NivelUsuario, typeof ShieldCheck> = { ADMIN: ShieldCheck, COMUM: UserRound }

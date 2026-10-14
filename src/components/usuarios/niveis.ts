import { ShieldCheck, Wrench } from 'lucide-react'
import type { NivelUsuario } from '#shared/tipos.ts'

/** Ícone de cada nível (o técnico com a chave de ferramentas). */
export const ICONE_NIVEL: Record<NivelUsuario, typeof ShieldCheck> = { ADMIN: ShieldCheck, COMUM: Wrench }

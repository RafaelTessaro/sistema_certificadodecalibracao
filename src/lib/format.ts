import { formatarDataBr, hojeLocalIso } from '#shared/dominio.ts'

const inteiro = new Intl.NumberFormat('pt-BR')

export const numero = (v: number) => inteiro.format(v || 0)

export const hojeISO = () => hojeLocalIso()

/**
 * A empresa fica em Rio Claro/SP: a data e a hora de um instante gravado (ISO, em UTC: "criado em", "atualizado em",
 * "impressa em"…) aparecem no horário de Brasília, qualquer que seja o fuso do computador, como no certificado. Das 21h
 * às 23h59 daqui o UTC já está no dia seguinte: cortar o ISO ("…T01:30Z".slice(0, 10)) daria a data errada.
 */
export const FUSO_BRASILIA = 'America/Sao_Paulo'

const relogioBrasilia = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_BRASILIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** O dia (AAAA-MM-DD e DD/MM/AAAA) e a hora (HH:mm) de um instante em Brasília; null se não é um instante válido. */
function emBrasilia(instante: string | Date): { dia: string; data: string; hora: string } | null {
  const d = typeof instante === 'string' ? (instante ? new Date(instante) : null) : instante
  if (!d || Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(relogioBrasilia.formatToParts(d).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour}:${p.minute}` }
}

/** O dia (AAAA-MM-DD) de um instante em Brasília: "2026-11-11T01:30:00.000Z" (22h30 do dia 10) → "2026-11-10"; '' se inválido. */
export const diaBrasilia = (instante: string | Date) => emBrasilia(instante)?.dia ?? ''

/** Hoje em Brasília (AAAA-MM-DD), para comparar com o dia de um instante (`diaBrasilia`). */
export const hojeBrasilia = (agora = new Date()) => diaBrasilia(agora)

/** A data sem hora (data da calibração, emissão, validade: AAAA-MM-DD) fica como está; o instante vira o dia de Brasília. */
const diaDoValor = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : diaBrasilia(v))

/** "2026-10-14" → "14/10/2026"; instante ISO → o dia em Brasília; vazio ou inválido → "—". */
export function dataCurta(iso: string | null | undefined) {
  if (!iso) return '—'
  return formatarDataBr(diaDoValor(iso)) || '—'
}

/** Primeira letra maiúscula, o resto como está. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * A balança nas listas (`descricaoBalanca` sem "Balança" na frente): o tipo, que vem em minúscula no meio da frase,
 * passa a abrir o texto com maiúscula ("Plataforma Toledo 9094 — 30 kg × 10 g").
 */
export const balancaNaLista = (descricao: string) => cap(descricao.replace(/^Balança /, ''))

const dataLonga = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** "Quarta-feira, 14 de outubro" (de uma data ou do dia de um instante em Brasília). */
export function dataExtensa(iso: string) {
  const d = new Date(`${diaDoValor(iso)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '' : cap(dataLonga.format(d))
}

const diaPorExtenso = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** O dia anterior a uma data AAAA-MM-DD. */
function diaAnterior(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** O título do dia de um instante no registro de atividades: "Hoje", "Ontem" ou "Terça-feira, 10 de novembro de 2026" (Brasília). */
export function tituloDoDia(instante: string, agora = new Date()) {
  const dia = diaBrasilia(instante)
  if (!dia) return ''
  const hoje = hojeBrasilia(agora)
  if (dia === hoje) return 'Hoje'
  if (dia === diaAnterior(hoje)) return 'Ontem'
  return cap(diaPorExtenso.format(new Date(`${dia}T12:00:00Z`)))
}

const mesAno = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })

/** "2026-10" → "out" (eixo de gráficos). */
export function mesCurto(yyyyMM: string) {
  const d = new Date(`${yyyyMM}-01T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? yyyyMM : mesAno.format(d).replace('.', '')
}

/** Data e hora de um instante em Brasília: "14/10/2026 às 10:32". */
export function dataHora(iso: string | null | undefined) {
  const b = iso ? emBrasilia(iso) : null
  return b ? `${b.data} às ${b.hora}` : '—'
}

/** "há 3 dias", "daqui a 12 dias", "hoje". */
export function relativoDias(dias: number) {
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`
}

export { mascaraCep, mascaraDocumento, mascaraTelefone } from '#shared/documentos.ts'

/** Remove acentos e caixa para buscas tolerantes ("joão" encontra "JOAO"). */
export function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

/** Tamanho de arquivo: "1,2 MB". */
export function tamanhoArquivo(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

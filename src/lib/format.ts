import { formatarDataBr, hojeLocalIso } from '#shared/dominio.ts'

const inteiro = new Intl.NumberFormat('pt-BR')

export const numero = (v: number) => inteiro.format(v || 0)

export const hojeISO = () => hojeLocalIso()

/** "2026-10-14" (ou ISO com hora) → "14/10/2026"; vazio → "—". */
export function dataCurta(iso: string | null | undefined) {
  if (!iso) return '—'
  return formatarDataBr(iso.slice(0, 10)) || '—'
}

/** Primeira letra maiúscula, o resto como está. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const dataLonga = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** "Quarta-feira, 14 de outubro". */
export function dataExtensa(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '' : cap(dataLonga.format(d))
}

const mesAno = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })

/** "2026-10" → "out" (eixo de gráficos). */
export function mesCurto(yyyyMM: string) {
  const d = new Date(`${yyyyMM}-01T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? yyyyMM : mesAno.format(d).replace('.', '')
}

/** Data e hora local: "14/10/2026 às 10:32". */
export function dataHora(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`
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
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
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

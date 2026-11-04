// O aviso depois de um envio de e-mail (certificado, lembrete): o servidor que recusa só parte dos destinatários
// entrega aos outros sem dar erro; a resposta traz quem recebeu (`para`) e quem ele recusou (`recusados`).

import type { DestinatarioRecusado } from '#shared/tipos.ts'
import { toast } from '../store/ui'

/** "O servidor de e-mail recusou a@x.com (550). Confira o endereço."; '' sem recusados. */
export function textoRecusados(recusados: DestinatarioRecusado[]): string {
  if (!recusados.length) return ''
  const itens = recusados.map((r) => (r.codigo ? `${r.endereco} (${r.codigo})` : r.endereco))
  const lista = itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens[0]
  return `O servidor de e-mail recusou ${lista}. Confira ${recusados.length > 1 ? 'os endereços' : 'o endereço'}.`
}

/**
 * O toast do envio: sucesso quando todos receberam; atenção (não sucesso) quando o servidor recusou parte dos
 * endereços. `detalhe`: o que vem depois de "Para …" (ex.: "com 2 anexos").
 */
export function avisoDoEnvio(
  r: { para: string[]; recusados?: DestinatarioRecusado[] },
  o: { titulo: string; detalhe?: string },
): { tipo: 'sucesso' | 'aviso'; titulo: string; descricao: string } {
  const para = `Para ${r.para.join(', ')}${o.detalhe ? `, ${o.detalhe}` : ''}`
  const recusados = r.recusados ?? []
  if (!recusados.length) return { tipo: 'sucesso', titulo: o.titulo, descricao: para }
  return {
    tipo: 'aviso',
    titulo: `${o.titulo} só para parte dos endereços`,
    descricao: `${para}. ${textoRecusados(recusados)}`,
  }
}

/** Mostra o toast do envio (`avisoDoEnvio`). */
export function mostrarEnvio(r: { para: string[]; recusados?: DestinatarioRecusado[] }, o: { titulo: string; detalhe?: string }) {
  const a = avisoDoEnvio(r, o)
  toast[a.tipo](a.titulo, a.descricao)
}

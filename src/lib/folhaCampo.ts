// Abre a folha de campo (PDF) numa aba nova, como o certificado. A aba é aberta já no clique: se antes
// for preciso gravar o rascunho (ou criá-lo), o navegador não a bloqueia como janela não pedida. E os
// textos de "reimprimir" (o mesmo nº, igual à primeira impressão) e de "folha nova" (nº novo).

/**
 * `preparar` (opcional) roda com a aba já aberta e devolve a URL do PDF, ou null para desistir (a aba
 * fecha). Sem `preparar`, abre direto `url`.
 */
export async function abrirFolhaCampo(url: string | (() => Promise<string | null>)): Promise<boolean> {
  if (typeof url === 'string') {
    window.open(url, '_blank', 'noopener')
    return true
  }
  const aba = window.open('', '_blank')
  if (aba) aba.opener = null
  try {
    const destino = await url()
    if (!destino) {
      aba?.close()
      return false
    }
    if (aba) aba.location.href = destino
    else window.open(destino, '_blank', 'noopener')
    return true
  } catch (e) {
    aba?.close()
    throw e
  }
}

/** Dia (no horário daqui) em que a folha foi impressa a primeira vez: "21/10/2026". */
export function dataDaFolha(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** "Reimprimir a folha FC-2026-00001 (igual à impressa em 21/10/2026)": o mesmo nº é sempre o mesmo papel. */
export const textoReimprimir = (f: { numero: string; impressaEm: string }) =>
  `Reimprimir a folha ${f.numero} (igual à impressa em ${dataDaFolha(f.impressaEm)})`

export const TEXTO_FOLHA_NOVA = 'Imprimir folha nova com os dados atuais'

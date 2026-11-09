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

/** "OS 2026/0777": a OS com "OS" na frente quando não o tem ('' sem OS). */
export const textoOs = (os: string) => {
  const t = os.trim()
  return t && (/^OS\b/i.test(t) ? t : `OS ${t}`)
}

/**
 * Ao ligar a folha do cliente impressa com OS: a OS passou para a calibração (`aplicada`) ou a folha saiu com outra e
 * ficou a da calibração (`diferente`). O "OS" na frente uma vez só, mesmo quando a pessoa já o escreveu.
 */
export function textosOsDaFolha(os: { daFolha: string; aplicada: boolean; daCalibracao?: string } | null | undefined): {
  aplicada?: string
  diferente?: string
} {
  if (!os) return {}
  if (os.aplicada) return { aplicada: `A ${textoOs(os.daFolha)}, impressa na folha, passou para esta calibração.` }
  return {
    diferente: `A folha saiu com a ${textoOs(os.daFolha)}; esta calibração ficou com a ${textoOs(os.daCalibracao ?? '')}.`,
  }
}

/**
 * Ao ligar uma folha impressa antes da 1.0.5 (a pressão era opcional nela) a uma calibração ainda sem a pressão: o
 * barômetro que o rascunho já trazia saiu dos padrões, e a falta da pressão ficou só como aviso.
 */
export function textoBarometrosRetirados(identificacoes: string[]): { titulo: string; texto: string } {
  const varios = identificacoes.length > 1
  const lista = varios ? `${identificacoes.slice(0, -1).join(', ')} e ${identificacoes.at(-1)}` : (identificacoes[0] ?? '')
  return {
    titulo: varios ? 'Os barômetros saíram dos padrões' : 'O barômetro saiu dos padrões',
    texto: `A folha foi impressa antes da versão 1.0.5, quando a pressão era opcional: ${varios ? 'os' : 'o'} ${lista} ${varios ? 'saíram' : 'saiu'} dos padrões, e a falta da pressão fica só como aviso. Se a pressão foi medida, registre-a e escolha o barômetro de novo em Padrões e ambiente.`,
  }
}

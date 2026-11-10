// Abre a folha de campo (PDF) numa aba nova, como o certificado. A aba é aberta já no clique: se antes
// for preciso gravar o rascunho (ou criá-lo), o navegador não a bloqueia como janela não pedida. E os
// textos de "reimprimir" (o mesmo nº, igual à primeira impressão) e de "folha nova" (nº novo).

/**
 * `preparar` (opcional) roda com a aba já aberta e devolve a URL do PDF, ou null para desistir (a aba
 * fecha). Sem `preparar`, abre direto `url`.
 */
/** A última URL aberta direto (`abrirFolhaCampo` com a URL) e quando: o clique duplo não abre uma segunda aba. */
let ultimaAberta: { url: string; em: number } | null = null
const JANELA_CLIQUE_DUPLO_MS = 2000

export async function abrirFolhaCampo(url: string | (() => Promise<string | null>)): Promise<boolean> {
  if (typeof url === 'string') {
    // A mesma URL logo em seguida (o clique duplo; na folha avulsa, a mesma chave: `chaveFolhaAvulsa`): já está aberta
    const agora = Date.now()
    if (ultimaAberta?.url === url && agora - ultimaAberta.em < JANELA_CLIQUE_DUPLO_MS) return true
    ultimaAberta = { url, em: agora }
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

/**
 * A calibração pode tirar uma folha nova no lugar da sua (o plano mudou antes da visita): só com a folha impressa para
 * ela. Não na correção (a folha é a do certificado corrigido, a mesma visita) nem com a avulsa ligada pelo nº (já foi
 * preenchida no cliente: é o registro dos dados brutos).
 */
export const temFolhaNova = (folha: { herdada?: boolean; avulsa?: boolean } | null | undefined) =>
  !!folha && !folha.herdada && !folha.avulsa

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
/**
 * A folha da 1.0.5 ligada no lugar de uma de antes (que dizia "Pressão, opcional"): a pressão volta a ser obrigatória e,
 * sem ela registrada, o barômetro voltou aos padrões (`identificacoes`; vazio = nenhum voltou).
 */
export function textoPressaoDeVolta(identificacoes: string[]): { titulo: string; texto: string } {
  const varios = identificacoes.length > 1
  const lista = varios ? `${identificacoes.slice(0, -1).join(', ')} e ${identificacoes.at(-1)}` : (identificacoes[0] ?? '')
  return {
    titulo: 'A pressão atmosférica volta a ser obrigatória',
    texto: `A folha ligada é da versão 1.0.5, que pede a pressão (POP 7.5).${
      identificacoes.length
        ? ` ${varios ? 'Os barômetros' : 'O barômetro'} ${lista} ${varios ? 'voltaram' : 'voltou'} aos padrões.`
        : ''
    } Registre a pressão anotada na folha em Padrões e ambiente.`,
  }
}

/** Remove das marcas da calibração as que o servidor tirou (`false`); as outras ficam como estão. */
export function semMarcasRetiradas<T extends { pressaoComoAviso?: boolean; cargasDoEmaNaFolha?: boolean }>(
  k: T,
  retiradas: { pressaoComoAviso?: boolean; cargasDoEmaNaFolha?: boolean } | null | undefined,
): T {
  if (!retiradas) return k
  const novo = { ...k }
  if (retiradas.pressaoComoAviso === false) delete novo.pressaoComoAviso
  if (retiradas.cargasDoEmaNaFolha === false) delete novo.cargasDoEmaNaFolha
  return novo
}

export function textoBarometrosRetirados(identificacoes: string[]): { titulo: string; texto: string } {
  const varios = identificacoes.length > 1
  const lista = varios ? `${identificacoes.slice(0, -1).join(', ')} e ${identificacoes.at(-1)}` : (identificacoes[0] ?? '')
  return {
    titulo: varios ? 'Os barômetros saíram dos padrões' : 'O barômetro saiu dos padrões',
    texto: `A folha foi impressa antes da versão 1.0.5, quando a pressão era opcional: ${varios ? 'os' : 'o'} ${lista} ${varios ? 'saíram' : 'saiu'} dos padrões, e a falta da pressão fica só como aviso. Se a pressão foi medida, registre-a e escolha o barômetro de novo em Padrões e ambiente.`,
  }
}

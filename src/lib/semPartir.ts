// Os nºs que a pessoa confere com o papel (FC-… da folha, o nº do certificado na etiqueta) nunca quebram no meio: em tela
// estreita, "CC-2026-" numa linha e "00036" na outra parece outro nº. Os nºs vêm de quem monta o texto (a numeração do
// certificado segue o formato das Configurações: não dá para reconhecê-los pelo jeito). O componente é `SemPartir`.

export interface PedacoDeTexto {
  texto: string
  /** Um dos nºs: não quebra. */
  inteiro: boolean
}

/** O texto em pedaços, com cada ocorrência dos nºs dados (`inteiros`; os vazios não contam) num pedaço próprio. */
export function pedacosSemPartir(texto: string, inteiros: ReadonlyArray<string | null | undefined>): PedacoDeTexto[] {
  // O mais longo primeiro: um nº dentro de outro ("CC-2026-00012" em "CC-2026-00012-R1") não parte o maior
  const nums = [...new Set(inteiros.filter((n): n is string => !!n?.trim()))].sort((a, b) => b.length - a.length)
  if (!nums.length) return texto ? [{ texto, inteiro: false }] : []
  const escapar = (n: string) => n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const pedacos: PedacoDeTexto[] = []
  let desde = 0
  for (const m of texto.matchAll(new RegExp(nums.map(escapar).join('|'), 'g'))) {
    if (m.index > desde) pedacos.push({ texto: texto.slice(desde, m.index), inteiro: false })
    pedacos.push({ texto: m[0], inteiro: true })
    desde = m.index + m[0].length
  }
  if (desde < texto.length) pedacos.push({ texto: texto.slice(desde), inteiro: false })
  return pedacos
}

/**
 * Os nºs de folha de campo (FC-AAAA-NNNNN: o formato é fixo, ao contrário do nº do certificado) que o texto cita: o toast
 * os deixa inteiros mesmo quando quem o mostra não os deu.
 */
export const numerosDeFolhaNoTexto = (texto: string): string[] => texto.match(/\bFC-\d{4}-\d{5}\b/g) ?? []

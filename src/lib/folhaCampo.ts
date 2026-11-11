// Abre a folha de campo (PDF) numa aba nova, como o certificado. A aba é aberta já no clique: se antes
// for preciso gravar o rascunho (ou criá-lo), o navegador não a bloqueia como janela não pedida. E os
// textos de "reimprimir" (o mesmo nº, igual à primeira impressão) e de "folha nova" (nº novo).

import { formatarDataBr } from '#shared/dominio.ts'
import type { FolhaNaoLigada } from '#shared/tipos.ts'
import { dataCurta } from './format'

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

/**
 * A escolha de uma janela vale uma vez por abertura (`abrir` a cada vez que ela abre): a janela "Folha de campo já
 * impressa" continua respondendo na animação de saída, e o clique duplo em "Folha nova (novo nº)" reservaria duas folhas
 * (a primeira já registrada como não usada). `escolher` roda `fazer` só na primeira vez (true se rodou).
 */
export function escolhaPorAbertura(): { abrir: () => void; escolher: (fazer: () => void) => boolean } {
  let feita = false
  return {
    abrir: () => {
      feita = false
    },
    escolher: (fazer) => {
      if (feita) return false
      feita = true
      fazer()
      return true
    },
  }
}

/** Dia (no horário de Brasília) em que a folha foi impressa a primeira vez: "21/10/2026". */
export const dataDaFolha = (iso: string): string => dataCurta(iso)

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
 * Ao ligar a folha avulsa impressa com a data prevista da visita: a data passou para a calibração, que ainda tinha a do
 * dia em que foi criada (`aplicada`), ou a calibração ficou com a dela, diferente (`diferente`). A data real é a que o
 * técnico escreve no passo 8 da folha.
 */
export function textosDataDaFolha(d: { daFolha: string; aplicada: boolean; daCalibracao?: string } | null | undefined): {
  aplicada?: string
  diferente?: string
} {
  if (!d) return {}
  const passo8 = 'que o técnico escreve no passo 8 da folha'
  if (d.aplicada)
    return {
      aplicada: `A data prevista impressa na folha (${formatarDataBr(d.daFolha)}) passou para esta calibração. Confira com a data real, ${passo8}.`,
    }
  return {
    diferente: `A folha saiu com a data prevista ${formatarDataBr(d.daFolha)}, e esta calibração está com ${formatarDataBr(d.daCalibracao ?? '')}. Confira a data real, ${passo8}.`,
  }
}

/**
 * O aviso da folha impressa para o cliente e ainda não ligada (etapas "Cliente e OS" e "Revisão e emissão"): se foi ela a
 * usada no cliente, o nº de certificado dela já está na etiqueta da balança; se não foi, o aviso sai quando ela é marcada
 * como "Não vai ser usada", o que só o administrador faz (`administrador`: quem está usando).
 */
export function textoFolhaNaoLigada(
  f: Pick<FolhaNaoLigada, 'numero' | 'numeroCertificado' | 'ordemServico' | 'mesmaOs'>,
  administrador = false,
): string {
  const sobre = [
    f.mesmaOs && f.ordemServico ? `da mesma ${textoOs(f.ordemServico)}` : '',
    f.numeroCertificado ? `certificado ${f.numeroCertificado} reservado` : '',
  ]
    .filter(Boolean)
    .join(', ')
  return `O cliente tem a folha ${f.numero}${sobre ? ` (${sobre})` : ''} ainda não ligada. Se foi ela a usada no cliente, ligue-a${
    f.numeroCertificado ? `: o nº da etiqueta é ${f.numeroCertificado}` : ''
  }. ${
    administrador
      ? 'Se não foi usada, marque-a como “Não vai ser usada” em Certificados → Números não utilizados.'
      : 'Se não foi usada, peça ao administrador para marcá-la como “Não vai ser usada” (em Números não utilizados).'
  }`
}

/**
 * Emitir com folhas do cliente ainda não ligadas: o título e a frase da confirmação, com o nº de cada folha e o do
 * certificado reservado nela (o da etiqueta, se foi ela a usada), e o nº com que este certificado sai (`numeroDesta`;
 * null: o próximo da sequência). A folha sem nº reservado (impressa antes de a folha reservar o nº) só pede para ligar.
 * `administrador`: quem está usando marca a folha que não foi usada. null: nenhuma folha.
 */
export function confirmacaoSemLigar(
  folhas: ReadonlyArray<Pick<FolhaNaoLigada, 'numero' | 'numeroCertificado'>>,
  numeroDesta: string | null,
  administrador = false,
): { titulo: string; descricao: string } | null {
  if (!folhas.length) return null
  const uma = folhas.length === 1
  const itens = folhas.map((f) => (f.numeroCertificado ? `${f.numero} (certificado ${f.numeroCertificado})` : f.numero))
  const lista = uma ? itens[0] : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`
  const comNumero = folhas.some((f) => f.numeroCertificado)
  const etiqueta = !comNumero
    ? ''
    : uma
      ? `a etiqueta da balança tem o nº ${folhas[0].numeroCertificado}`
      : 'a etiqueta da balança tem o nº de certificado dela'
  const usada = `Se ${uma ? 'foi ela' : 'uma delas foi'} a usada no cliente, ${
    etiqueta
      ? `${etiqueta}, e este certificado sai com ${numeroDesta ? `o nº ${numeroDesta}` : 'outro nº'}. Para ligar, cancele e use “Ligar esta folha”.`
      : `ligue-a antes de emitir: cancele e use “Ligar esta folha”.`
  }`
  const naoUsada = administrador
    ? `Se não ${uma ? 'foi usada, marque-a' : 'foram usadas, marque-as'} como “Não vai ser usada” em Certificados → Números não utilizados.`
    : `Se não ${uma ? 'foi usada' : 'foram usadas'}, peça ao administrador para ${uma ? 'marcá-la' : 'marcá-las'} como “Não vai ser usada”.`
  return {
    titulo: uma ? `Emitir sem ligar a folha ${folhas[0].numero}?` : 'Emitir sem ligar as folhas do cliente?',
    descricao: `${uma ? 'A folha' : 'As folhas'} ${lista} deste cliente ${
      uma ? 'ainda não está ligada' : 'ainda não estão ligadas'
    }. ${usada} ${naoUsada}`,
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

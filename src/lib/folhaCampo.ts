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
 * A data prevista da visita impressa na folha avulsa que acabou de ser ligada: passou para a calibração, que ainda tinha a
 * do dia em que foi criada (`aplicada`; `antes`: a de antes), ou ficou a da calibração, diferente (`antes`: a dela).
 */
export interface DataDaFolhaLigada {
  folha: string
  daFolha: string
  aplicada: boolean
  antes: string
}

/**
 * O aviso que fica na tela (etapas "Cliente e OS" e "Revisão e emissão") depois de ligar a folha com a data prevista,
 * até a pessoa fechá-lo ou mudar a data (`dataAtual`: a da calibração na tela; null: o aviso não vale mais). A data real
 * é a que o técnico escreve no passo 8 da folha. O botão troca a data num clique: volta para a de antes, ou usa a da folha.
 */
export function avisoDataDaFolha(
  d: DataDaFolhaLigada | null | undefined,
  dataAtual: string,
): { texto: string; botao: { rotulo: string; data: string } | null } | null {
  if (!d) return null
  const passo8 = 'Confira com a data real, que o técnico escreve no passo 8 da folha.'
  if (d.aplicada) {
    if (dataAtual !== d.daFolha) return null
    return {
      texto: `A data da calibração passou ${d.antes ? `de ${formatarDataBr(d.antes)} ` : ''}para ${formatarDataBr(d.daFolha)}, a data prevista impressa na folha ${d.folha}. ${passo8}`,
      botao: d.antes ? { rotulo: `Voltar para ${formatarDataBr(d.antes)}`, data: d.antes } : null,
    }
  }
  if (dataAtual === d.daFolha) return null
  return {
    texto: `A folha ${d.folha} saiu com a data prevista ${formatarDataBr(d.daFolha)}, e esta calibração está com ${formatarDataBr(dataAtual)}. ${passo8}`,
    botao: { rotulo: `Usar ${formatarDataBr(d.daFolha)}`, data: d.daFolha },
  }
}

/** A folha impressa para a própria calibração (não a avulsa ligada) e o nº de certificado reservado nela ('' = nenhum). */
export interface FolhaPropria {
  numero: string
  numeroCertificado: string
}

/**
 * A folha impressa para a própria calibração (não a avulsa ligada pelo nº, nem a do certificado corrigido) e o nº de
 * certificado reservado nela; null: a calibração não tem folha própria.
 */
export function folhaPropriaDa(
  folha: { numero: string; avulsa?: boolean; herdada?: boolean } | null | undefined,
  numeroReservado: { numero: string; folha: string } | null | undefined,
): FolhaPropria | null {
  if (!folha || folha.avulsa || folha.herdada) return null
  return { numero: folha.numero, numeroCertificado: numeroReservado?.folha === folha.numero ? numeroReservado.numero : '' }
}

/**
 * O aviso da folha impressa para o cliente e ainda não ligada (etapas "Cliente e OS" e "Revisão e emissão"): se foi ela a
 * usada no cliente, o nº de certificado dela já está na etiqueta da balança; se não foi, o aviso sai quando ela é marcada
 * como "Não vai ser usada", o que só o administrador faz (`administrador`: quem está usando). A calibração que já tem a
 * folha impressa para ela (`propria`) ouve qual é, e que a do cliente só se liga se foi ela, e não a própria, a usada
 * (sem o "da mesma OS": na visita a vários equipamentos com uma OS só, ela apareceria em todas).
 */
export function textoFolhaNaoLigada(
  f: Pick<FolhaNaoLigada, 'numero' | 'numeroCertificado' | 'ordemServico' | 'mesmaOs'>,
  administrador = false,
  propria: FolhaPropria | null = null,
): string {
  const naoUsada = administrador
    ? 'Se não foi usada, marque-a como “Não vai ser usada” em Certificados → Números não utilizados.'
    : 'Se não foi usada, peça ao administrador para marcá-la como “Não vai ser usada” (em Números não utilizados).'
  if (propria)
    return `Esta calibração já tem a folha ${propria.numero}${
      propria.numeroCertificado ? ` (certificado ${propria.numeroCertificado})` : ''
    }. O cliente tem também a folha ${f.numero}${
      f.numeroCertificado ? ` (certificado ${f.numeroCertificado} reservado)` : ''
    } ainda não ligada: ligue-a só se foi ela, e não a ${propria.numero}, a usada nesta balança${
      f.numeroCertificado ? ` (a etiqueta tem o nº ${f.numeroCertificado})` : ''
    }. ${naoUsada}`
  const sobre = [
    f.mesmaOs && f.ordemServico ? `da mesma ${textoOs(f.ordemServico)}` : '',
    f.numeroCertificado ? `certificado ${f.numeroCertificado} reservado` : '',
  ]
    .filter(Boolean)
    .join(', ')
  return `O cliente tem a folha ${f.numero}${sobre ? ` (${sobre})` : ''} ainda não ligada. Se foi ela a usada no cliente, ligue-a${
    f.numeroCertificado ? `: o nº da etiqueta é ${f.numeroCertificado}` : ''
  }. ${naoUsada}`
}

/**
 * "Ligar esta folha" na calibração que já tem a folha impressa para ela (`propria`): a própria sai (fica como não usada,
 * e o nº reservado nela, como não utilizado) e o certificado passa a sair com o nº da folha do cliente. Pede confirmação,
 * com os nºs e como desfazer (ligar a própria de novo pelo nº).
 */
export function confirmacaoLigarNoLugar(
  f: Pick<FolhaNaoLigada, 'numero' | 'numeroCertificado'>,
  propria: FolhaPropria,
): { titulo: string; descricao: string; confirmar: string } {
  return {
    titulo: `Ligar a folha ${f.numero} no lugar da ${propria.numero}?`,
    descricao: [
      `A folha ${propria.numero}, impressa para esta calibração, fica registrada como não usada${
        propria.numeroCertificado ? `, e o nº ${propria.numeroCertificado} dela, como não utilizado` : ''
      }.`,
      f.numeroCertificado
        ? `O certificado sai com o nº ${f.numeroCertificado}, o da folha ${f.numero}. Ligue só se foi ela a usada nesta balança (a etiqueta tem o nº ${f.numeroCertificado}).`
        : `Ligue só se foi a ${f.numero} a usada nesta balança.`,
      `Se ligar por engano, digite ${propria.numero} em “Folha de campo nº” e ligue-a de novo${
        propria.numeroCertificado ? `: o nº ${propria.numeroCertificado} volta para ela` : ''
      }.`,
    ].join(' '),
    confirmar: `Ligar a ${f.numero}`,
  }
}

/**
 * Depois de ligar a folha do cliente no lugar da folha impressa para a calibração (`propria`): como desfazer, se foi
 * engano (ligar a própria de novo pelo nº; o nº de certificado dela volta para ela).
 */
export function textoDesfazerLigacao(propria: FolhaPropria): { titulo: string; texto: string } {
  return {
    titulo: `A folha ${propria.numero} saiu desta calibração`,
    texto: `Se foi engano, digite ${propria.numero} em “Folha de campo nº” e ligue-a de novo${
      propria.numeroCertificado ? `: o nº ${propria.numeroCertificado} volta para ela` : ''
    }.`,
  }
}

/** O que a pessoa vai fazer com a folha do cliente ainda não ligada: emitir, autorizar e emitir, ou enviar para autorização. */
export type AcaoSemLigar = 'emitir' | 'autorizar' | 'enviar'

/**
 * Emitir (ou enviar para autorização) com folhas do cliente ainda não ligadas: o título (o mesmo que o botão faz), a frase
 * e o botão da confirmação, com o nº de cada folha, o do certificado reservado nela (o da etiqueta, se foi ela a usada) e
 * o nº com que este certificado sai (`numeroDesta`; null: outro, o próximo da sequência). A folha sem nº reservado
 * (impressa antes de a folha reservar o nº) só pede para ligar. `administrador`: quem está usando marca a folha que não
 * foi usada. null: nenhuma folha.
 */
export function confirmacaoSemLigar(
  folhas: ReadonlyArray<Pick<FolhaNaoLigada, 'numero' | 'numeroCertificado'>>,
  numeroDesta: string | null,
  administrador = false,
  acao: AcaoSemLigar = 'emitir',
): { titulo: string; descricao: string; confirmar: string } | null {
  if (!folhas.length) return null
  const uma = folhas.length === 1
  const itens = folhas.map((f) => (f.numeroCertificado ? `${f.numero} (certificado ${f.numeroCertificado})` : f.numero))
  const lista = uma ? folhas[0].numero : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`
  const comNumero = folhas.some((f) => f.numeroCertificado)
  const sai = `${acao === 'enviar' ? 'vai sair' : 'sai'} com ${numeroDesta ? `o nº ${numeroDesta}` : 'outro nº'}`
  const ligar = 'cancele e use “Ligar esta folha”'
  const usada = !comNumero
    ? `Se ${uma ? 'foi ela' : 'uma delas foi'} a usada, ligue-a antes: ${ligar}.`
    : `Se ${uma ? 'foi ela' : 'uma delas foi'} a usada, a etiqueta da balança tem o nº ${
        uma ? folhas[0].numeroCertificado : 'de certificado dela'
      }, mas este certificado ${sai}: ${ligar}.`
  const naoUsada = administrador
    ? `Se não ${uma ? 'foi usada, marque-a' : 'foram usadas, marque-as'} como “Não vai ser usada” em Certificados → Números não utilizados.`
    : `Se não ${uma ? 'foi usada' : 'foram usadas'}, peça ao administrador para ${uma ? 'marcá-la' : 'marcá-las'} como “Não vai ser usada”.`
  const verbo = acao === 'enviar' ? 'Enviar' : acao === 'autorizar' ? 'Autorizar e emitir' : 'Emitir'
  return {
    titulo: uma ? `${verbo} sem ligar a folha ${folhas[0].numero}?` : `${verbo} sem ligar as folhas do cliente?`,
    descricao: `${uma ? 'A folha' : 'As folhas'} ${lista} deste cliente ${
      uma ? 'ainda não está ligada' : 'ainda não estão ligadas'
    }. ${usada} ${naoUsada}`,
    confirmar: `${verbo} sem ligar`,
  }
}

/**
 * A confirmação de "Emitir" e "Autorizar e emitir" (`autorizar`): o nº com que o certificado sai (a correção, o mesmo nº;
 * o reservado na folha; ou o próximo da sequência) e, com a folha do cliente ainda não ligada (`semLigar`), a pergunta
 * dela no título e no botão, sem repetir o nº de saída (ela já o diz).
 */
export function confirmacaoDaEmissao(o: {
  autorizar: boolean
  numeroRevisao: string | null
  numeroReservado: string | null
  semLigar: { titulo: string; descricao: string; confirmar: string } | null
}): { titulo: string; descricao: string; confirmar: string } {
  const assinatura = 'Você autoriza como signatário: o certificado sai com a sua assinatura em “Autorizado por”'
  if (o.semLigar)
    return {
      ...o.semLigar,
      descricao: `${o.semLigar.descricao} ${
        o.autorizar ? `${assinatura} e não pode mais ser alterado.` : 'Emitido, o certificado não pode mais ser alterado.'
      }`,
    }
  const numeracao = o.numeroRevisao
    ? `A correção sai com o mesmo nº ${o.numeroRevisao} e a data de emissão nova, e não pode mais ser alterada. A versão anterior fica guardada só no sistema.`
    : o.numeroReservado
      ? `O certificado sai com o nº ${o.numeroReservado}, o da folha de campo, e não pode mais ser alterado. Se precisar corrigir depois, a correção sai com o mesmo número.`
      : 'O certificado recebe o número definitivo e não pode mais ser alterado. Se precisar corrigir depois, a correção sai com o mesmo número.'
  return {
    titulo: o.autorizar ? 'Autorizar e emitir o certificado?' : 'Emitir o certificado?',
    descricao: o.autorizar ? `${assinatura}. ${numeracao}` : numeracao,
    confirmar: o.autorizar ? 'Autorizar e emitir' : 'Emitir certificado',
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
export function semMarcasRetiradas<
  T extends { pressaoComoAviso?: boolean; cargasDoEmaNaFolha?: boolean; zeroComoAviso?: boolean },
>(k: T, retiradas: { pressaoComoAviso?: boolean; cargasDoEmaNaFolha?: boolean; zeroComoAviso?: boolean } | null | undefined): T {
  if (!retiradas) return k
  const novo = { ...k }
  if (retiradas.pressaoComoAviso === false) delete novo.pressaoComoAviso
  if (retiradas.cargasDoEmaNaFolha === false) delete novo.cargasDoEmaNaFolha
  if (retiradas.zeroComoAviso === false) delete novo.zeroComoAviso
  return novo
}

/**
 * A folha ligada e a leitura do zero: a impressa antes da 1.0.6 que pode ter saído sem a linha do zero deixou a falta dela
 * só como aviso (`marcada`; o sistema nem sempre sabe: a de um rascunho excluído e a que voltou da pasta são marcadas sem
 * saber o plano, e quase todas tinham o zero), ou a folha com a linha do zero, no lugar da que saiu sem ela, a tornou
 * obrigatória de novo (`retirada`).
 */
export const TEXTO_ZERO_DA_FOLHA = {
  marcada: {
    titulo: 'A folha pode ter saído sem a linha do zero',
    texto:
      'Ela foi impressa antes da versão 1.0.6: confira no papel. A falta da leitura do zero fica só como aviso. Se o técnico anotou o zero (na linha dele ou em Anotações), digite-o no erro de indicação.',
  },
  retirada: {
    titulo: 'A leitura do zero volta a ser obrigatória',
    texto: 'A folha ligada tem a linha do zero (POP 7.7). Digite a leitura anotada nela no erro de indicação.',
  },
}

export function textoBarometrosRetirados(identificacoes: string[]): { titulo: string; texto: string } {
  const varios = identificacoes.length > 1
  const lista = varios ? `${identificacoes.slice(0, -1).join(', ')} e ${identificacoes.at(-1)}` : (identificacoes[0] ?? '')
  return {
    titulo: varios ? 'Os barômetros saíram dos padrões' : 'O barômetro saiu dos padrões',
    texto: `A folha foi impressa antes da versão 1.0.5, quando a pressão era opcional: ${varios ? 'os' : 'o'} ${lista} ${varios ? 'saíram' : 'saiu'} dos padrões, e a falta da pressão fica só como aviso. Se a pressão foi medida, registre-a e escolha o barômetro de novo em Padrões e ambiente.`,
  }
}

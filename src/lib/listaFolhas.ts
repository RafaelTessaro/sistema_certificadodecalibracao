// Página Certificados: as abas "Certificados" e "Folhas de campo" (a escolhida fica lembrada neste navegador e também
// vem pelo endereço, ?aba=folhas) e os textos da lista das folhas impressas — para quem cada uma foi impressa, o nº de
// certificado impresso nela e a situação (ligada, não ligada, substituída, não vai ser usada).

import { rotuloDaSituacao } from '#shared/dominio.ts'
import type { FolhaCampoListada, Tone } from '#shared/tipos.ts'
import { dataDaFolha, textoOs } from './folhaCampo'

export type AbaCertificados = 'certificados' | 'folhas'

/** Onde a aba escolhida fica guardada (só neste navegador). */
export const CHAVE_ABA = 'bc-calibracao:certificados:aba'

const ehAba = (v: unknown): v is AbaCertificados => v === 'certificados' || v === 'folhas'

/**
 * A aba que a página abre: a do endereço (?aba=folhas ou ?aba=certificados); o aviso "Para você autorizar"
 * (?situacao=…) é da lista dos certificados; sem nada no endereço, a última escolhida neste navegador.
 */
export function abaDaPagina(params: URLSearchParams, guardada: string | null): AbaCertificados {
  const daUrl = params.get('aba')
  if (ehAba(daUrl)) return daUrl
  if (params.has('situacao')) return 'certificados'
  return ehAba(guardada) ? guardada : 'certificados'
}

/** A última aba escolhida neste navegador (null sem nenhuma, ou se o navegador não deixa guardar). */
export function lerAbaGuardada(armazenamento: Pick<Storage, 'getItem'> | null = globalThis.localStorage ?? null): string | null {
  try {
    return armazenamento?.getItem(CHAVE_ABA) ?? null
  } catch {
    return null
  }
}

/** Guarda a aba escolhida (sem guardar, nada quebra: só não fica lembrada). */
export function guardarAba(
  aba: AbaCertificados,
  armazenamento: Pick<Storage, 'setItem'> | null = globalThis.localStorage ?? null,
) {
  try {
    armazenamento?.setItem(CHAVE_ABA, aba)
  } catch {
    /* modo privado, cota cheia: fica só nesta visita */
  }
}

/** O endereço com a aba: ?aba=folhas; a dos certificados é a de sempre (sem nada). O resto do endereço fica. */
export function paramsDaAba(params: URLSearchParams, aba: AbaCertificados): URLSearchParams {
  const novo = new URLSearchParams(params)
  if (aba === 'folhas') {
    novo.set('aba', 'folhas')
    // "Para você autorizar" é um filtro da outra aba
    novo.delete('situacao')
  } else novo.delete('aba')
  return novo
}

/** Os filtros da aba "Folhas de campo" (o valor vai para o servidor). */
export type FiltroFolhas = '' | 'NAO_LIGADAS' | 'LIGADAS' | 'NAO_USADAS'

export const FILTROS_FOLHAS: Array<{ valor: FiltroFolhas; label: string }> = [
  { valor: '', label: 'Todas' },
  { valor: 'NAO_LIGADAS', label: 'Não ligadas' },
  { valor: 'LIGADAS', label: 'Ligadas' },
  { valor: 'NAO_USADAS', label: 'Não vão ser usadas' },
]

/** "OS 2026/0777": a OS com "OS" na frente quando não o tem ('' sem OS). */
export { textoOs }

/**
 * Para quem a folha foi impressa: o cliente (`vazio` = em branco, ou não se sabe) e a linha de baixo — a OS e, na
 * folha impressa em branco e já ligada, o aviso de que o cliente é o da calibração.
 */
export function paraQuemEaFolha(
  f: Pick<FolhaCampoListada, 'clienteNome' | 'clienteExcluido' | 'origem' | 'ordemServico' | 'calibracao'>,
): { cliente: string; vazio: boolean; detalhe: string } {
  const os = textoOs(f.ordemServico)
  if (f.clienteNome) return { cliente: f.clienteNome, vazio: false, detalhe: os }
  if (f.clienteExcluido) return { cliente: 'Cliente excluído', vazio: true, detalhe: os }
  // Em branco (ou de volta da pasta) e já ligada: é do cliente da calibração
  const lugar = f.origem === 'recuperada' ? 'Voltou da pasta de dados' : 'Impressa em branco'
  if (f.calibracao?.clienteNome)
    return { cliente: f.calibracao.clienteNome, vazio: false, detalhe: [lugar, os].filter(Boolean).join(' · ') }
  if (f.origem === 'recuperada') return { cliente: 'Não se sabe', vazio: true, detalhe: [lugar, os].filter(Boolean).join(' · ') }
  return { cliente: 'Em branco', vazio: true, detalhe: os }
}

/**
 * A balança da folha: a impressa nela ou, na folha impressa sem a balança (em branco ou só do cliente) e já ligada, a
 * da calibração, com a linha de baixo dizendo isso. `descricao` '' = em branco (ou, na de volta da pasta, não se sabe).
 */
export function balancaDaFolha(f: Pick<FolhaCampoListada, 'balancaDescricao' | 'balancaSerie' | 'origem' | 'calibracao'>): {
  descricao: string
  serie: string
  detalhe: string
} {
  if (f.balancaDescricao) return { descricao: f.balancaDescricao, serie: f.balancaSerie, detalhe: '' }
  const k = f.calibracao
  if (k?.balancaDescricao)
    return {
      descricao: k.balancaDescricao,
      serie: k.balancaSerie ?? '',
      detalhe: f.origem === 'recuperada' ? 'A da calibração ligada' : 'Impressa sem a balança',
    }
  return { descricao: '', serie: '', detalhe: '' }
}

/** O nº de certificado impresso na folha, com a situação dele ("reservado", "emitido", "não utilizado"). */
export function preNumeroDaFolha(f: Pick<FolhaCampoListada, 'numeroCertificado' | 'situacaoNumero'>): {
  numero: string
  situacao: string
} {
  if (!f.numeroCertificado) return { numero: '', situacao: '' }
  const situacao =
    f.situacaoNumero === 'emitido' ? 'emitido' : f.situacaoNumero === 'nao_utilizado' ? 'não utilizado' : 'reservado'
  return { numero: f.numeroCertificado, situacao }
}

/**
 * A situação da folha na lista: a pílula (`rotulo`, `tom`) e a linha de baixo — a calibração a que ela está ligada
 * (`calibracao`: o texto do link), a folha nova que ficou no lugar dela, ou o motivo de não ser usada.
 */
export function situacaoDaFolha(
  f: FolhaCampoListada,
  /** `podeDescartar`: tem o botão “Não vai ser usada” (o administrador); sem ele, a dica manda pedir a quem tem. */
  o: { podeDescartar?: boolean } = {},
): {
  rotulo: string
  tom: Tone
  calibracao?: string
  detalhe?: string
  titulo?: string
} {
  const k = f.calibracao
  const daCalibracao = k
    ? k.numero
      ? `${k.numero}${k.status === 'EMITIDO' ? '' : ` (${rotuloDaSituacao(k.status, k.semAutorizacao).toLowerCase()})`}`
      : rotuloDaSituacao(k.status, k.semAutorizacao)
    : undefined
  // A primeira impressão não terminou (o serviço caiu depois da reserva dos nºs): não há PDF para reimprimir
  const interrompida = f.impressaoInterrompida ? { detalhe: 'A impressão não terminou' } : {}
  switch (f.situacao) {
    case 'ligada':
      return {
        rotulo: 'Ligada',
        tom: 'success',
        calibracao: daCalibracao,
        ...(f.impressaoInterrompida
          ? {
              ...interrompida,
              titulo:
                'A primeira impressão não terminou (o sistema foi interrompido): imprima a folha pela calibração, com o mesmo nº.',
            }
          : {}),
      }
    case 'substituida':
      return {
        rotulo: 'Substituída',
        tom: 'neutral',
        detalhe: f.substituidaPor ? `Trocada pela ${f.substituidaPor}` : 'Trocada por uma folha nova',
        titulo: 'Uma folha nova foi impressa no lugar desta antes da visita: esta não foi a campo.',
      }
    case 'descartada': {
      const quando = [f.descartadaEm ? dataDaFolha(f.descartadaEm) : '', f.descartadaPor ?? ''].filter(Boolean).join(' · ')
      return {
        rotulo: 'Não vai ser usada',
        tom: 'danger',
        detalhe: f.motivo || 'Sem motivo registrado.',
        titulo: [f.motivo, quando && `Registrado em ${quando}.`].filter(Boolean).join(' '),
      }
    }
    default:
      if (f.impressaoInterrompida)
        return {
          rotulo: 'Não ligada',
          tom: 'warning',
          ...interrompida,
          titulo: `A primeira impressão não terminou (o sistema foi interrompido), então a folha não saiu no papel. ${o.podeDescartar === false ? 'Peça ao administrador para marcá-la' : 'Marque-a'} como “Não vai ser usada” (em Números não utilizados) e imprima uma folha nova.`,
        }
      return {
        rotulo: 'Não ligada',
        tom: 'warning',
        detalhe: f.origem === 'recuperada' ? 'Voltou da pasta de dados' : undefined,
        titulo: 'Ainda não ligada a uma calibração: ligue-a pelo nº, ao digitar a calibração.',
      }
  }
}

/** "09/11/2026 · Fábio": quando a folha foi impressa a primeira vez e por quem. */
export const quandoFoiImpressa = (f: Pick<FolhaCampoListada, 'impressaEm' | 'impressaPor'>) =>
  [dataDaFolha(f.impressaEm), f.impressaPor].filter(Boolean).join(' · ')

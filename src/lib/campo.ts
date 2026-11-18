// Os textos das telas do computador sobre o app do celular (1.1.0): os selos da folha que foi para o celular ("No celular
// de Carlos desde 08:12", "Voltou do campo"…), as marcas do registro, o "visto hoje às 07:55 · 192.168.0.23" da lista
// dos celulares, a contagem do código do pareamento e o resumo do registro ("47 leituras, 6 horários, 2 anotações").
// Sem DOM, para ser testado. O nº da folha (FC-AAAA-NNNNN) é o que identifica a folha: não há código de conferência.

import type {
  Desfecho,
  EstadoFolhaCelular,
  LeituraCampo,
  MarcaRegistro,
  RegistroCampo,
  RegistroOriginal,
  SituacaoEnvio,
} from '#shared/campo/tipos.ts'
import type { CelularDaFolha, SituacaoPareamento, Tone } from '#shared/tipos.ts'
import { FUSO_BRASILIA, hojeBrasilia } from './format'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

const relogio = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_BRASILIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** O dia (AAAA-MM-DD), a data curta (DD/MM) e a hora (HH:mm) de um instante, em Brasília; null se inválido. */
function partes(instante: string): { dia: string; dm: string; hora: string } | null {
  const d = instante ? new Date(instante) : null
  if (!d || Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(relogio.formatToParts(d).map((x) => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, dm: `${p.day}/${p.month}`, hora: `${p.hour}:${p.minute}` }
}

const ontemDe = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** "hoje às 07:55", "ontem às 18:02" ou "em 12/11 às 07:55" (Brasília); '' se inválido. */
export function quando(instante: string, agora = new Date()): string {
  const p = partes(instante)
  if (!p) return ''
  const hoje = hojeBrasilia(agora)
  if (p.dia === hoje) return `hoje às ${p.hora}`
  if (p.dia === ontemDe(hoje)) return `ontem às ${p.hora}`
  return `em ${p.dm} às ${p.hora}`
}

/** "desde 08:12" (hoje), "desde ontem às 18:02" ou "desde 12/11 às 08:12". */
export function desde(instante: string, agora = new Date()): string {
  const p = partes(instante)
  if (!p) return ''
  const hoje = hojeBrasilia(agora)
  if (p.dia === hoje) return `desde ${p.hora}`
  if (p.dia === ontemDe(hoje)) return `desde ontem às ${p.hora}`
  return `desde ${p.dm} às ${p.hora}`
}

/** O dia, sem a hora: "informado hoje", "informado ontem", "informado em 12/11". */
export function informadoEm(instante: string, agora = new Date()): string {
  const p = partes(instante)
  if (!p) return ''
  const hoje = hojeBrasilia(agora)
  if (p.dia === hoje) return 'informado hoje'
  if (p.dia === ontemDe(hoje)) return 'informado ontem'
  return `informado em ${p.dm}`
}

/** "visto hoje às 07:55 · 192.168.0.23" (a lista dos celulares); "ainda não apareceu na rede" sem contato. */
export function textoVisto(ultimoContato: string, ip: string, agora = new Date()): string {
  const q = quando(ultimoContato, agora)
  if (!q) return 'ainda não apareceu na rede'
  return [`visto ${q}`, ip].filter(Boolean).join(' · ')
}

/** O primeiro nome ("Carlos Eduardo Lima" → "Carlos"), para os selos curtos. */
export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? ''

/**
 * "celular de Ana" / "celular de Carlos": sem artigo antes do nome (o técnico pode ser uma técnica). Sem o nome,
 * "celular do técnico".
 */
export const celularDe = (nome: string) => (nome.trim() ? `celular de ${nome.trim()}` : 'celular do técnico')

/** O que o celular informou sobre a folha, como a tela mostra. */
export const ROTULO_ESTADO_CELULAR: Partial<Record<EstadoFolhaCelular, string>> = {
  RECEBENDO: 'Baixada · aguardando confirmação',
  NOVA: 'Pronta para o campo',
  EM_PREENCHIMENTO: 'Em preenchimento',
  FINALIZADA: 'Finalizada',
  REABERTA: 'Reaberta',
}

export const ROTULO_SITUACAO_ENVIO: Record<SituacaoEnvio, string> = {
  ENVIADA: 'Enviada',
  NO_CELULAR: 'No celular',
  DEVOLVIDA: 'Voltou do campo',
  RECOLHIDA: 'Recolhida',
}

/** As marcas do registro (o servidor põe ao receber), com o tom do selo. */
export const MARCA_REGISTRO: Record<MarcaRegistro, { rotulo: string; tom: Tone; dica: string }> = {
  PILOTO: { rotulo: 'Piloto', tom: 'neutral', dica: 'No piloto, a folha de papel continua sendo o registro original.' },
  ORFAO: {
    rotulo: 'Órfã',
    tom: 'warning',
    dica: 'Chegou de um envio que o sistema não conhece: ligue à folha certa ou descarte.',
  },
  APARELHO_REVOGADO: {
    rotulo: 'Aparelho revogado',
    tom: 'warning',
    dica: 'Entregue por um celular que já tinha sido descadastrado.',
  },
  APOS_RECOLHER: {
    rotulo: 'Depois de recolhida',
    tom: 'warning',
    dica: 'O escritório tinha recolhido a folha, mas o técnico já tinha começado: ela voltou preenchida.',
  },
  RELOGIO: {
    rotulo: 'Relógio diferente',
    tom: 'warning',
    dica: 'A hora do celular estava mais de 5 minutos diferente da do servidor na entrega.',
  },
  FORMATO: {
    rotulo: 'Formato com problema',
    tom: 'danger',
    dica: 'O registro chegou com campos faltando ou fora do formato: confira antes de usar.',
  },
}

export const ROTULO_DESFECHO: Record<Desfecho, string> = {
  COMPLETA: 'Completa',
  INCOMPLETA: 'Incompleta',
  NAO_CALIBRADA: 'Não calibrada',
}

/**
 * O rótulo do desfecho; fora da lista (o registro guardado como chegou, com a marca FORMATO: app de outra versão), o
 * valor como veio, para a tela do registro abrir mesmo assim.
 */
export function rotuloDoDesfecho(desfecho: unknown): string {
  if (typeof desfecho === 'string' && Object.prototype.hasOwnProperty.call(ROTULO_DESFECHO, desfecho))
    return ROTULO_DESFECHO[desfecho as Desfecho]
  return desfecho === undefined || desfecho === null ? '' : String(desfecho)
}

export interface SeloCelular {
  rotulo: string
  tom: Tone
  /** A linha de baixo ("Em preenchimento · informado hoje"). */
  detalhe: string
  /** O texto inteiro, para o `title`. */
  dica: string
}

/** Os selos curtos das marcas e do desfecho (a lista das folhas, o Painel e o registro). */
export function selosDasMarcas(
  marcas: readonly MarcaRegistro[],
  desfecho?: Desfecho | '',
): Array<{ rotulo: string; tom: Tone; dica: string }> {
  const r = marcas.filter((m) => MARCA_REGISTRO[m]).map((m) => MARCA_REGISTRO[m])
  if (desfecho === 'INCOMPLETA')
    r.push({ rotulo: 'Incompleta', tom: 'warning', dica: 'O técnico encerrou a folha sem completar, com o motivo.' })
  if (desfecho === 'NAO_CALIBRADA')
    r.push({ rotulo: 'Não calibrada', tom: 'danger', dica: 'A balança não foi calibrada (o motivo está no registro).' })
  return r
}

/**
 * O selo da folha que foi para o celular: "Enviada · aguardando o celular", "No celular de Carlos desde 08:12" (com o
 * que o celular informou: "Em preenchimento", "Finalizada"), "Recolher pedido", "Voltou do campo", "Recolhida".
 */
export function seloDoCelular(c: CelularDaFolha, agora = new Date()): SeloCelular {
  const nome = primeiroNome(c.tecnico)
  const estado = c.estadoCelular ? ROTULO_ESTADO_CELULAR[c.estadoCelular] : ''
  const informado = c.estadoCelularEm ? informadoEm(c.estadoCelularEm, agora) : ''
  const comEstado = [estado, informado].filter(Boolean).join(' · ')
  if (c.voltou)
    return {
      rotulo: 'Voltou do campo',
      tom: 'success',
      detalhe: `${c.tecnico || 'Técnico'} · ${quando(c.em, agora)}`,
      dica: `A folha voltou do ${celularDe(c.tecnico)}: compare ou puxe os dados na calibração.`,
    }
  if ((c.situacao === 'ENVIADA' || c.situacao === 'NO_CELULAR') && c.recolherPedido)
    return {
      rotulo: c.jaComecei ? 'Já começada · vai voltar' : 'Recolher pedido',
      tom: 'warning',
      detalhe: c.jaComecei
        ? `${nome || 'O técnico'} já tinha começado a folha: ela volta preenchida`
        : `Aguardando o ${celularDe(nome)} confirmar`,
      dica: c.jaComecei
        ? 'O técnico já tinha começado a folha quando o escritório pediu para recolher: ela vai voltar preenchida.'
        : 'O escritório pediu para recolher: o celular apaga a folha na próxima vez que estiver na rede da empresa.',
    }
  switch (c.situacao) {
    case 'ENVIADA':
      return {
        rotulo: 'Enviada · aguardando o celular',
        tom: 'info',
        detalhe: comEstado || `Para ${c.tecnico || 'o técnico'}`,
        dica: `Chega quando ${nome || 'o técnico'} abrir o app BC Calibração na rede da empresa.`,
      }
    case 'NO_CELULAR':
      // A pílula curta (cabe na lista) e, embaixo, desde quando e o que o celular informou
      return {
        rotulo: `No ${celularDe(nome)}`,
        tom: 'brand',
        detalhe: [desde(c.em, agora), comEstado].filter(Boolean).join(' · '),
        dica: `A folha está no ${celularDe(c.tecnico)}${comEstado ? ` (${comEstado})` : ''}.`,
      }
    case 'DEVOLVIDA':
      return {
        rotulo: 'Registro de campo',
        tom: 'neutral',
        detalhe: `${c.tecnico || 'Técnico'} · ${quando(c.em, agora)}`,
        dica: 'A folha voltou do celular e os dados já foram comparados ou puxados.',
      }
    default:
      return {
        rotulo: 'Recolhida',
        tom: 'neutral',
        detalhe: c.registroId ? 'Voltou preenchida mesmo assim' : quando(c.em, agora),
        dica: 'O envio foi encerrado pelo escritório.',
      }
  }
}

/**
 * O que dá para fazer com a folha enviada ou no celular: "Recolher do celular" (quem pode enviar pode recolher; sem pedido
 * em aberto) e, só o administrador, "Recolher à força" (também com o pedido em aberto: o celular perdido, roubado ou
 * descadastrado nunca responde). Vale para a folha da calibração e para a avulsa.
 */
export function acoesDeRecolher(
  c: Pick<CelularDaFolha, 'situacao' | 'recolherPedido'>,
  admin: boolean,
): { recolher: boolean; forcar: boolean } {
  const ativo = c.situacao === 'ENVIADA' || c.situacao === 'NO_CELULAR'
  return { recolher: ativo && !c.recolherPedido, forcar: ativo && admin }
}

/** O aviso de "Enviar para o técnico", pelo registro original. */
export function avisoDoEnvio(registroOriginal: RegistroOriginal): string {
  return registroOriginal === 'PAPEL'
    ? 'Piloto: a folha de papel continua sendo o registro original.'
    : 'Enquanto estiver no celular, as leituras ficam só para leitura aqui.'
}

/** "9:58": o tempo que falta até `expiraEm` (m:ss; 0:00 vencido). */
export function contagemRegressiva(expiraEm: string, agora = Date.now()): string {
  const ms = Math.max(0, Date.parse(expiraEm) - agora)
  if (!Number.isFinite(ms)) return '0:00'
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A frase da situação do pareamento ("Aguardando o celular…" → "Pareado: Samsung A54 · Carlos"). */
export function textoPareamento(s: Pick<SituacaoPareamento, 'situacao' | 'celular'>): string {
  switch (s.situacao) {
    case 'PAREADO':
      return `Pareado: ${[s.celular?.modelo || 'celular', s.celular?.tecnicoNome].filter(Boolean).join(' · ')}`
    case 'EXPIRADO':
      return 'O código venceu. Gere outro para continuar.'
    case 'INVALIDADO':
      return 'O código foi digitado errado 5 vezes e deixou de valer. Gere outro.'
    case 'CANCELADO':
      return 'O código foi cancelado.'
    default:
      return 'Aguardando o celular…'
  }
}

/**
 * O começo da pendência da justificativa das diferenças com o celular (o mesmo texto de `PENDENCIA_JUSTIFICATIVA_CAMPO`,
 * shared/campo/importar.ts; um teste confere): repetido aqui para a tela reconhecer a pendência sem levar a lógica da
 * importação para o bloco principal da interface.
 */
export const PENDENCIA_JUSTIFICATIVA = 'Dados do campo mudados depois de puxados'

// ---- O registro ----------------------------------------------------------------------------------------------

const ehLeitura = (v: unknown): v is LeituraCampo =>
  !!v && typeof v === 'object' && typeof (v as LeituraCampo).valor === 'string' && (v as LeituraCampo).valor.trim() !== ''

const lista = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : [])

/**
 * Quantas leituras, horários e anotações o registro tem (o resumo de "Puxar dados do campo" no rascunho vazio). Tolerante
 * ao registro com a marca FORMATO (campos faltando contam zero). As tentativas descartadas não contam.
 */
export function contagemDoRegistro(r: RegistroCampo): { leituras: number; horarios: number; anotacoes: number } {
  const p = r.passos ?? ({} as RegistroCampo['passos'])
  let leituras = 0
  const conta = (v: unknown) => {
    if (ehLeitura(v)) leituras++
  }
  for (const l of lista(p.ambiente?.linhas)) [l.temperatura, l.umidade, l.pressao].forEach(conta)
  for (const d of lista(p.ambiente?.deltaT)) conta(d.valor)
  for (const pt of lista(p.indicacao?.pontos)) [pt.crescente, pt.decrescente].forEach(conta)
  conta(p.indicacao?.retornoZero)
  for (const e of lista(p.indicacao?.substituicao?.etapas)) [e.padroes, e.substituicao].forEach(conta)
  for (const e of lista(p.repetibilidade)) lista(e.leituras).forEach(conta)
  for (const x of lista(p.excentricidade?.posicoes)) [x.zeroAntes, x.leitura].forEach(conta)
  const horarios = [
    p.chegada?.inicio,
    p.final?.termino,
    ...lista(p.ambiente?.linhas).map((l) => l.em),
    p.indicacao?.calInterno?.em,
    p.ambiente?.pesosNoLocalDesde,
  ].filter((v) => typeof v === 'string' && v.trim() !== '').length
  return { leituras, horarios, anotacoes: lista(r.anotacoes).length }
}

/** "47 leituras, 6 horários, 2 anotações". */
export function textoContagem(c: { leituras: number; horarios: number; anotacoes: number }): string {
  return [
    plural(c.leituras, 'leitura', 'leituras'),
    plural(c.horarios, 'horário', 'horários'),
    plural(c.anotacoes, 'anotação', 'anotações'),
  ].join(', ')
}

/** O título de cada grupo da tabela "Campo | Celular | Rascunho". */
export const TITULO_GRUPO: Record<string, string> = {
  identificacao: 'Identificação',
  padroes: 'Padrões',
  ambiente: 'Ambiente',
  indicacao: 'Erro de indicação',
  repetibilidade: 'Repetibilidade',
  excentricidade: 'Excentricidade',
}

/** "38 iguais" / "1 igual". */
export const textoIguais = (n: number) => `${n} ${n === 1 ? 'igual' : 'iguais'}`

/** Os registros de uma folha que precisam de atenção do escritório (órfão sem folha, formato com problema). */
export const precisaAtencao = (marcas: readonly MarcaRegistro[]) => marcas.includes('ORFAO') || marcas.includes('FORMATO')

const MOMENTO: Record<string, string> = { INICIO: 'início', INICIO_REPETIDA: 'início (repetido)', FIM: 'fim' }
const GRANDEZA: Record<string, string> = { temperatura: 'temperatura', umidade: 'umidade', pressao: 'pressão' }

/**
 * O nome de um campo do registro para a tela (as correções, os avisos e as anotações citam o caminho dele):
 * "indicacao.pontos.p3.crescente" → "Erro de indicação · 100,00 · subida". Sem como explicar, o próprio caminho.
 */
export function rotuloDoCampo(r: Pick<RegistroCampo, 'passos'> | null | undefined, campo: string): string {
  if (!campo) return ''
  const p = r?.passos
  const partes = campo.split('.')
  const conferencia = [...lista(p?.chegada?.conferencias), ...lista(p?.balanca?.conferencias)].find((c) => c.campo === campo)
  if (conferencia) return conferencia.rotulo || campo
  const [passo, a, b, c, d] = partes
  if (passo === 'ambiente' && a === 'linhas') {
    const linha = lista(p?.ambiente?.linhas)[Number(b)]
    return ['Ambiente', linha ? MOMENTO[linha.momento] : `linha ${Number(b) + 1}`, GRANDEZA[c] ?? c].filter(Boolean).join(' · ')
  }
  if (passo === 'ambiente' && a === 'deltaT') return `ΔT pesos − ar · medição ${Number(b) + 1}`
  if (passo === 'indicacao') {
    if (a === 'retornoZero') return 'Erro de indicação · retorno ao zero'
    if (a === 'calInterno') return 'Erro de indicação · ajuste interno (CAL)'
    if (a === 'pontos') {
      const ponto = lista(p?.indicacao?.pontos).find((x) => x.id === b)
      const carga = ponto ? ponto.cargaAplicada?.valor || ponto.cargaPrevista || 'ponto acrescentado' : b
      const qual = { crescente: 'subida', decrescente: 'descida', cargaAplicada: 'carga aplicada', pecas: 'peças' }[c] ?? c
      return ['Erro de indicação', carga, qual].filter(Boolean).join(' · ')
    }
    if (a === 'substituicao' && b === 'etapas') {
      const qual = { padroes: 'com os pesos', substituicao: 'com a substituição', material: 'material' }[d] ?? d
      return ['Substituição', `etapa ${Number(c) + 1}`, qual].filter(Boolean).join(' · ')
    }
  }
  if (passo === 'repetibilidade') {
    const ensaio = lista(p?.repetibilidade).find((x) => x.id === a)
    const carga = ensaio ? ensaio.cargaAplicada?.valor || ensaio.cargaPrevista : a
    if (b === 'leituras') return ['Repetibilidade', carga, `leitura ${Number(c) + 1}`].filter(Boolean).join(' · ')
    return ['Repetibilidade', carga, b === 'cargaAplicada' ? 'carga aplicada' : b].filter(Boolean).join(' · ')
  }
  if (passo === 'excentricidade') {
    if (a === 'posicoes') {
      const pos = lista(p?.excentricidade?.posicoes)[Number(b)]
      return ['Excentricidade', pos ? `posição ${pos.rotulo}` : `posição ${Number(b) + 1}`, c === 'zeroAntes' ? 'zero antes' : '']
        .filter(Boolean)
        .join(' · ')
    }
    return ['Excentricidade', a === 'cargaAplicada' ? 'carga aplicada' : a].filter(Boolean).join(' · ')
  }
  if (campo === 'final.dataCalibracao') return 'Data da calibração'
  if (campo === 'final.termino') return 'Hora do término'
  if (campo === 'chegada.inicio') return 'Hora do início'
  if (campo === 'chegada.os') return 'Nº da OS'
  if (campo === 'chegada.local') return 'Local da calibração'
  return campo
}

/** Os passos de medição que a trava do celular deixa só para leitura (os mesmos do servidor: `CAMPOS_DE_MEDICAO`). */
export const CAMPOS_DE_MEDICAO = ['padroesIds', 'ambiente', 'indicacao', 'repetibilidade', 'excentricidade'] as const

/** As etapas do editor que são só de medição (a trava as mostra só para leitura). */
export const ETAPAS_DE_MEDICAO = ['padroes', 'repetibilidade', 'excentricidade', 'indicacao'] as const

/** A mudança mexe em algum passo de medição? (a trava do celular a ignora na tela, como o servidor recusaria) */
export function mudouMedicao<T extends Record<(typeof CAMPOS_DE_MEDICAO)[number], unknown>>(antes: T, depois: T): boolean {
  return CAMPOS_DE_MEDICAO.some(
    (c) => antes[c] !== depois[c] && JSON.stringify(antes[c] ?? null) !== JSON.stringify(depois[c] ?? null),
  )
}

/**
 * Os registros que chegaram desde a última consulta (o aviso "voltou do campo"): na primeira (`conhecidos` null), nenhum
 * avisa; depois, os VALIDOS ainda não vistos. Devolve também o conjunto atualizado.
 */
export function novosRegistros<T extends { id: string; situacao: string }>(
  conhecidos: ReadonlySet<string> | null,
  registros: readonly T[],
): { novos: T[]; todos: Set<string> } {
  const todos = new Set([...(conhecidos ?? []), ...registros.map((r) => r.id)])
  if (!conhecidos) return { novos: [], todos }
  return { novos: registros.filter((r) => !conhecidos.has(r.id) && r.situacao === 'VALIDO'), todos }
}

/** "FC-2026-00042 voltou do campo (Carlos)". */
export function textoVoltou(r: { numero: string; ligadoA: string; tecnico: string; marcas: readonly MarcaRegistro[] }): {
  titulo: string
  descricao: string
} {
  const nome = primeiroNome(r.tecnico)
  return {
    titulo: `${r.ligadoA || r.numero || 'Uma folha'} voltou do campo${nome ? ` (${nome})` : ''}`,
    descricao: r.marcas.includes('ORFAO')
      ? 'Chegou sem envio conhecido: ligue à folha certa ou descarte (Folhas de campo).'
      : 'Abra a calibração para comparar ou puxar os dados.',
  }
}

// O que quem acompanhou pelo cliente vê antes de assinar no celular: as CONDIÇÕES do serviço, numa lista FECHADA, nunca
// leituras nem resultados (a frase da folha: "Acompanhei o serviço; ciente das condições, não dos resultados."). Fica de
// fora tudo o que é interno (o recado do escritório, as anotações internas do cadastro e do rascunho, as anotações de
// dado impresso diferente e de anomalia) e tudo o que é medição (pontos, repetibilidade, excentricidade, avisos). Puro.
//
// A lista é fechada de propósito: um campo novo no registro não aparece para o cliente sem entrar aqui (o teste confere
// que o resumo não tem nenhuma leitura). `resumoDoCliente` monta o resumo só a partir do registro (o registro se explica
// sozinho: os dados impressos vão nele como foram mostrados).

import { RECEPTORES, ROTULO_CLASSE } from '../dominio.ts'
import { formatarInstante, textoDoPeriodo } from './registro.ts'
import type { ConferenciaCampo, Instante, LeituraCampo, LinhaAmbienteCampo, RegistroCampo } from './tipos.ts'
import { CAMPOS_CONFERIR } from './tipos.ts'

/** Os itens que o cliente vê, nesta ordem. Nada além deles. */
export const ITENS_RESUMO_CLIENTE = ['cliente', 'balanca', 'local', 'periodo', 'ambiente', 'tecnico', 'observacoes'] as const
export type ItemResumoCliente = (typeof ITENS_RESUMO_CLIENTE)[number]

export const ROTULOS_RESUMO_CLIENTE: Record<ItemResumoCliente, string> = {
  cliente: 'Cliente',
  balanca: 'Balança',
  local: 'Local',
  periodo: 'Data e horário',
  ambiente: 'Ambiente',
  tecnico: 'Técnico',
  observacoes: 'Observações',
}

/** A frase que quem acompanhou lê antes de assinar (a do papel). */
export const FRASE_ASSINATURA_CLIENTE = 'Acompanhei o serviço; ciente das condições, não dos resultados.'

/** Temperatura, umidade e pressão de uma linha do ambiente, como foram digitadas, com a unidade. */
export interface CondicaoResumo {
  em: Instante
  /** "18/11/2026 08:58". */
  quando: string
  temperatura: string
  umidade: string
  pressao: string
}

export interface ResumoDoCliente {
  /** Nome ou razão social (o impresso, ou o informado na folha em branco). */
  cliente: string
  /** Identificação da balança: tipo, fabricante, modelo, nº de série, TAG e local de instalação. */
  balanca: string
  /** "No cliente: Rua X, 100 – Centro – Rio Claro/SP" ou "No laboratório da empresa". */
  local: string
  periodo: { inicio: Instante; fim: Instante; texto: string }
  /** No início (a última linha do início, que vale) e no fim; null se a linha não foi preenchida. */
  ambiente: { inicio: CondicaoResumo | null; fim: CondicaoResumo | null }
  tecnico: string
  /** Só as anotações do tipo observação. */
  observacoes: Array<{ texto: string; em: Instante; quando: string }>
}

/** O dado impresso como foi mostrado; '' se faltou ou se o técnico marcou "Algo diferente…" (o certo está na anotação). */
const mostrado = (lista: ConferenciaCampo[], campo: string) => {
  const c = lista.find((x) => x.campo === campo)
  const v = c && c.confere !== false ? c.mostrado.trim() : ''
  return v === '—' ? '' : v
}

const comUnidade = (l: LeituraCampo | null, unidade: string) => (l?.valor ? `${l.valor} ${unidade}` : '')

function condicao(l: LinhaAmbienteCampo | undefined): CondicaoResumo | null {
  if (!l || !(l.temperatura || l.umidade || l.pressao)) return null
  return {
    em: l.em,
    quando: formatarInstante(l.em),
    temperatura: comUnidade(l.temperatura, '°C'),
    umidade: comUnidade(l.umidade, '%'),
    pressao: comUnidade(l.pressao, 'hPa'),
  }
}

/** O resumo das condições que o cliente vê antes de assinar (lista fechada). */
export function resumoDoCliente(registro: RegistroCampo): ResumoDoCliente {
  const { chegada, balanca, ambiente, final } = registro.passos
  const informado = chegada.clienteInformado
  const cliente = informado ? informado.razaoSocial.trim() : mostrado(chegada.conferencias, CAMPOS_CONFERIR.clienteNome)

  const bi = balanca.informada
  const conf = balanca.conferencias
  const partesBalanca = bi
    ? [
        bi.tipo,
        [bi.fabricante, bi.modelo]
          .map((x) => x.trim())
          .filter(Boolean)
          .join(' '),
        bi.numeroSerie.trim() ? `nº ${bi.numeroSerie.trim()}` : '',
        bi.identificacao.trim() ? `TAG ${bi.identificacao.trim()}` : '',
        bi.localInstalacao,
        bi.classe ? `classe ${ROTULO_CLASSE[bi.classe]}` : '',
        bi.receptor ? RECEPTORES[bi.receptor].replace(/ \(.*\)$/, '') : '',
      ]
    : [
        mostrado(conf, CAMPOS_CONFERIR.tipo),
        [mostrado(conf, CAMPOS_CONFERIR.fabricante), mostrado(conf, CAMPOS_CONFERIR.modelo)].filter(Boolean).join(' '),
        mostrado(conf, CAMPOS_CONFERIR.numeroSerie) ? `nº ${mostrado(conf, CAMPOS_CONFERIR.numeroSerie)}` : '',
        mostrado(conf, CAMPOS_CONFERIR.identificacao) ? `TAG ${mostrado(conf, CAMPOS_CONFERIR.identificacao)}` : '',
        mostrado(conf, CAMPOS_CONFERIR.localInstalacao),
      ]

  const endereco = chegada.localEndereco.trim() || mostrado(chegada.conferencias, CAMPOS_CONFERIR.localEndereco)
  const local =
    chegada.local === 'LABORATORIO'
      ? 'No laboratório da empresa'
      : [chegada.local === 'CLIENTE' ? 'No cliente' : '', endereco].filter(Boolean).join(': ')

  const inicio = chegada.inicio || registro.relogio.iniciadoEm
  const fim = final.termino || registro.relogio.finalizadoEm
  const linhasInicio = ambiente.linhas.filter((l) => l.momento !== 'FIM' && (l.temperatura || l.umidade || l.pressao))
  const linhaFim = ambiente.linhas.filter((l) => l.momento === 'FIM').at(-1)

  return {
    cliente,
    balanca: partesBalanca
      .map((x) => x.trim())
      .filter(Boolean)
      .join(' · '),
    local,
    periodo: { inicio, fim, texto: textoDoPeriodo(inicio, fim) },
    ambiente: { inicio: condicao(linhasInicio.at(-1)), fim: condicao(linhaFim) },
    tecnico: registro.tecnico.nome,
    observacoes: registro.anotacoes
      .filter((a) => a.tipo === 'OBSERVACAO' && a.texto.trim())
      .map((a) => ({ texto: a.texto.trim(), em: a.em, quando: formatarInstante(a.em) })),
  }
}

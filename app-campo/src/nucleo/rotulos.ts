// Os nomes, para o técnico, de cada campo do registro (os mesmos caminhos dos avisos, da trilha e das correções):
// "Ponto 3 ↑ · 100,00 kg", "Repetibilidade 150,00 kg · leitura 4", "Ambiente (fim) · Temperatura". Puro.

import { unidadeDoRegistro } from '../../../shared/campo/importar.ts'
import { formatarInstante } from '../../../shared/campo/registro.ts'
import type { LeituraCampo, PacoteCampo, RegistroCampo } from '../../../shared/campo/tipos.ts'
import { dataBr } from './datas.ts'
import { cargaDoPonto } from './ordem.ts'

const ROTULO_AMBIENTE = { temperatura: 'Temperatura', umidade: 'Umidade', pressao: 'Pressão' } as const
export const UNIDADE_AMBIENTE = { temperatura: '°C', umidade: '%', pressao: 'hPa' } as const

/** "Ambiente (início)", "Ambiente (início, repetida)", "Ambiente (fim)". */
export function rotuloDaLinha(r: RegistroCampo, i: number): string {
  const m = r.passos.ambiente.linhas[i]?.momento
  return m === 'FIM' ? 'Ambiente (fim)' : m === 'INICIO_REPETIDA' ? 'Ambiente (início, medido de novo)' : 'Ambiente (início)'
}

/** A carga de um ponto como texto, com a unidade ("100,00 kg"). */
function cargaComUnidade(texto: string, unidade: string): string {
  return texto ? `${texto} ${unidade}` : ''
}

/** O nome de um campo do registro, para listas (Revisão, trilha, correções). */
export function rotuloDoCampo(r: RegistroCampo, pacote: PacoteCampo | null | undefined, campo: string): string {
  const u = unidadeDoRegistro(r, pacote)
  const ps = r.passos
  let m: RegExpExecArray | null
  if ((m = /^ambiente\.linhas\.(\d+)\.(temperatura|umidade|pressao|em|instrumentos)$/.exec(campo))) {
    const k = m[2] as keyof typeof ROTULO_AMBIENTE | 'em' | 'instrumentos'
    const nome = k === 'em' ? 'data e hora' : k === 'instrumentos' ? 'instrumento' : ROTULO_AMBIENTE[k]
    return `${rotuloDaLinha(r, Number(m[1]))} · ${nome}`
  }
  if ((m = /^ambiente\.deltaT\.(\d+)/.exec(campo))) return `ΔT pesos − ar · medição ${Number(m[1]) + 1}`
  if (campo === 'ambiente.deltaT') return 'ΔT pesos − ar'
  if (campo === 'ambiente.deltaT0.origem') return 'Aclimatação · temperatura dos pesos na origem'
  if (campo === 'ambiente.deltaT0.sala') return 'Aclimatação · temperatura da sala'
  if (campo === 'ambiente.pesosNoLocalDesde') return 'Pesos no local desde'
  if ((m = /^indicacao\.pontos\.([^.]+)(?:\.(crescente|decrescente|cargaAplicada))?$/.exec(campo))) {
    const i = ps.indicacao.pontos.findIndex((p) => p.id === m![1])
    const p = ps.indicacao.pontos[i]
    if (!p) return 'Erro de indicação'
    const carga = cargaComUnidade(p.cargaAplicada?.valor ?? p.cargaPrevista, u)
    const n = `Ponto ${i + 1}`
    if (m[2] === 'crescente') return `${n} ↑${carga ? ` · ${carga}` : ''}`
    if (m[2] === 'decrescente') return `${n} ↓${carga ? ` · ${carga}` : ''}`
    if (m[2] === 'cargaAplicada') return `${n} · carga aplicada`
    return `${n}${carga ? ` · ${carga}` : ''}`
  }
  if (campo === 'indicacao.pontos') return 'Erro de indicação'
  if (campo === 'indicacao.retornoZero') return 'Retorno ao zero'
  if (campo === 'indicacao.calInterno') return 'Ajuste interno (CAL) antes dos ensaios'
  if ((m = /^indicacao\.substituicao\.etapas\.(\d+)\.(padroes|substituicao|material)$/.exec(campo))) {
    const nome = m[2] === 'padroes' ? 'com os pesos padrão' : m[2] === 'substituicao' ? 'com a substituição' : 'material'
    return `Substituição · etapa ${Number(m[1]) + 1} · ${nome}`
  }
  if ((m = /^repetibilidade\.([^.]+)(?:\.(leituras)\.(\d+)|\.(cargaAplicada))?$/.exec(campo))) {
    const r2 = ps.repetibilidade.find((x) => x.id === m![1])
    const carga = r2 ? cargaComUnidade(r2.cargaAplicada?.valor ?? r2.cargaPrevista, u) : ''
    const base = `Repetibilidade${carga ? ` ${carga}` : ''}`
    if (m[2]) return `${base} · leitura ${Number(m[3]) + 1}`
    if (m[4]) return `${base} · carga aplicada`
    return base
  }
  if (campo === 'repetibilidade') return 'Repetibilidade'
  if ((m = /^excentricidade\.posicoes\.(\d+)\.(leitura|zeroAntes)$/.exec(campo))) {
    const pos = ps.excentricidade.posicoes[Number(m[1])]
    const rotulo = pos ? pos.rotulo : String(Number(m[1]) + 1)
    return `Excentricidade · posição ${rotulo}${m[2] === 'zeroAntes' ? ' · zero antes' : ''}`
  }
  if (campo === 'excentricidade.cargaAplicada') return 'Excentricidade · carga aplicada'
  if (campo === 'excentricidade.aplicavel') return 'Excentricidade · se aplica'
  if (campo === 'excentricidade.motivo') return 'Excentricidade · por que não foi feita'
  if (campo === 'excentricidade.posicoes') return 'Excentricidade'
  if (campo === 'chegada.local') return 'Onde foi feita'
  if (campo === 'chegada.inicio') return 'Hora de início'
  if (campo === 'chegada.os') return 'Nº da OS'
  if (campo === 'chegada.localEndereco') return 'Endereço da calibração'
  if (campo === 'final.termino') return 'Hora de término'
  if (campo === 'final.dataCalibracao') return 'Data da calibração'
  if (campo.startsWith('padroes')) return 'Padrões'
  const conf = [...ps.chegada.conferencias, ...ps.balanca.conferencias].find((c) => c.campo === campo)
  if (conf) return conf.rotulo
  return campo
}

/** A unidade das leituras de um campo ("kg", "°C"…); '' para os que não são de leitura. */
export function unidadeDoCampo(r: RegistroCampo, pacote: PacoteCampo | null | undefined, campo: string): string {
  const amb = /^ambiente\.linhas\.\d+\.(temperatura|umidade|pressao)$/.exec(campo)
  if (amb) return UNIDADE_AMBIENTE[amb[1] as keyof typeof UNIDADE_AMBIENTE]
  if (/^ambiente\.(deltaT|deltaT0)/.test(campo)) return '°C'
  if (/^(indicacao|repetibilidade|excentricidade)\./.test(campo)) return unidadeDoRegistro(r, pacote)
  return ''
}

/** Um valor da trilha ou de uma correção como texto legível (data e hora em "18/11/2026 08:42"). */
export function valorLegivel(v: string): string {
  if (!v) return '(vazio)'
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatarInstante(v) || v
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBr(v)
  return v
}

/** A leitura com a unidade ("100,05 kg"); '' sem leitura. */
export function leituraComUnidade(l: LeituraCampo | null | undefined, unidade: string): string {
  return l?.valor ? `${l.valor}${unidade ? ` ${unidade}` : ''}` : ''
}

/** A carga de um ponto em número (para ordenar e para os textos), reexportada para as telas. */
export { cargaDoPonto }

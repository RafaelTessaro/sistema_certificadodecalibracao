// A ordem da tecla "Próxima": a ordem física em que as leituras são feitas na balança, não a da tabela do papel.
//
//   Erro de indicação: sobe até Max (↑ de cada ponto, da menor carga para a maior) e depois desce A PARTIR DO PONTO MAIS
//     ALTO (↓ do maior para o menor). Como no papel (server/pdf/folhaCampo.ts), no "crescente e decrescente" a descida não
//     se lê no zero (no fim, é o retorno ao zero) nem em Max (a virada, uma leitura só). Com cargas de substituição
//     (rodoviárias), as etapas entram intercaladas na ordem em que são feitas: os pontos só com pesos, a etapa 1 (com os
//     pesos e com a substituição), os pontos com uma substituição por baixo, a etapa 2… No fim, o retorno ao zero.
//   Repetibilidade: as leituras de cada ensaio, até o mínimo (ou o previsto no plano), um ensaio depois do outro.
//   Excentricidade: as posições na ordem do desenho; na classe I, o zero antes e a indicação de cada posição.
//
// Os caminhos são os mesmos dos avisos e das correções ("indicacao.pontos.p3.crescente"). Puro.

import { instrumentoDoCampo, unidadeDoRegistro } from '../../../shared/campo/importar.ts'
import { numeroDaLeitura, numeroDoTexto } from '../../../shared/campo/registro.ts'
import type { PacoteCampo, PontoCampo, RegistroCampo } from '../../../shared/campo/tipos.ts'
import { minimoLeiturasRepetibilidade } from '../../../shared/metrologia/index.ts'
import type { MetodoCarregamento } from '../../../shared/tipos.ts'
import { lerNoCaminho } from './folha.ts'

const TOL = 1e-9

/** A carga de um ponto (a digitada no local ou a prevista da folha); null se não der para ler. */
export function cargaDoPonto(p: Pick<PontoCampo, 'cargaAplicada' | 'cargaPrevista'>): number | null {
  return numeroDaLeitura(p.cargaAplicada) ?? numeroDoTexto(p.cargaPrevista)
}

/** O método de carregamento da folha (o do plano; sem plano, o do rascunho do pacote). */
export function metodoDaFolha(pacote: PacoteCampo | null | undefined): MetodoCarregamento {
  return pacote?.plano?.metodo ?? pacote?.entrada.indicacao.metodo ?? 'CRESCENTE_DECRESCENTE'
}

/** Max da balança como o técnico a viu (o plano, o valor visto ou a informada); null se desconhecido. */
export function maxDaFolha(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): number | null {
  const i = instrumentoDoCampo(registro, pacote).instrumento
  if (i && i.faixas.length) return i.faixas[i.faixas.length - 1].max
  return pacote?.plano?.max ?? null
}

/** As colunas do passo 5: lê a subida? lê a descida? */
export function colunasDaIndicacao(pacote: PacoteCampo | null | undefined): { sobe: boolean; desce: boolean } {
  const m = metodoDaFolha(pacote)
  return { sobe: m !== 'DECRESCENTE', desce: m === 'CRESCENTE_DECRESCENTE' || m === 'DECRESCENTE' }
}

/** O ponto tem a leitura decrescente? (no "crescente e decrescente": não no zero nem em Max, como no papel) */
export function pontoComDescida(
  p: Pick<PontoCampo, 'cargaAplicada' | 'cargaPrevista'>,
  registro: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
): boolean {
  const { sobe, desce } = colunasDaIndicacao(pacote)
  if (!desce) return false
  if (!sobe) return true
  const carga = cargaDoPonto(p)
  if (carga === null || carga <= 0) return false
  const max = maxDaFolha(registro, pacote)
  return !(max !== null && max > 0 && carga >= max * (1 - TOL))
}

/** Os pontos na ordem de carga (do menor para o maior; os sem carga legível no fim, na ordem da lista). */
function pontosPorCarga(pontos: PontoCampo[]): PontoCampo[] {
  return pontos
    .map((p, i) => ({ p, i, carga: cargaDoPonto(p) }))
    .sort((a, b) => (a.carga ?? Infinity) - (b.carga ?? Infinity) || a.i - b.i)
    .map((x) => x.p)
}

/** A ordem física das leituras do erro de indicação (passo 5). */
export function ordemIndicacao(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): string[] {
  const ind = registro.passos.indicacao
  const { sobe } = colunasDaIndicacao(pacote)
  const ordem: string[] = []
  const pontos = pontosPorCarga(ind.pontos)
  const etapas = ind.substituicao?.etapas ?? []
  const etapa = (k: number) => {
    ordem.push(`indicacao.substituicao.etapas.${k}.padroes`, `indicacao.substituicao.etapas.${k}.substituicao`)
  }
  if (sobe) {
    const niveis = pontos.map((p) => p.nivelSubstituicao)
    const maiorNivel = Math.max(0, ...niveis, etapas.length)
    for (let nivel = 0; nivel <= maiorNivel; nivel++) {
      for (const p of pontos) if (p.nivelSubstituicao === nivel) ordem.push(`indicacao.pontos.${p.id}.crescente`)
      if (nivel < etapas.length) etapa(nivel)
    }
  } else etapas.forEach((_, k) => etapa(k))
  for (const p of [...pontos].reverse())
    if (pontoComDescida(p, registro, pacote)) ordem.push(`indicacao.pontos.${p.id}.decrescente`)
  ordem.push('indicacao.retornoZero')
  return ordem
}

/** Leituras previstas de um ensaio de repetibilidade: as do plano ou o mínimo do POP (10 na classe I; 5, ou 3 com ≥ 100 kg). */
export function leiturasPrevistas(registro: RegistroCampo, pacote: PacoteCampo | null | undefined, ensaioId: string): number {
  const r = registro.passos.repetibilidade.find((x) => x.id === ensaioId)
  if (!r) return 0
  const i = pacote?.entrada.repetibilidade.findIndex((x) => x.id === ensaioId) ?? -1
  const doPlano = i >= 0 ? pacote?.plano?.repetibilidade[i] : undefined
  const instrumento = instrumentoDoCampo(registro, pacote).instrumento
  const carga = numeroDaLeitura(r.cargaAplicada) ?? numeroDoTexto(r.cargaPrevista)
  const minimo =
    carga !== null
      ? minimoLeiturasRepetibilidade(carga, {
          classe: instrumento?.classe ?? pacote?.balanca?.classe ?? '',
          unidade: unidadeDoRegistro(registro, pacote),
        })
      : 5
  return Math.max(doPlano?.leituras ?? 0, minimo)
}

/** A ordem das leituras da repetibilidade (passo 6): até o previsto, ou mais, se o técnico já fez mais. */
export function ordemRepetibilidade(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): string[] {
  const ordem: string[] = []
  for (const r of registro.passos.repetibilidade) {
    const n = Math.max(leiturasPrevistas(registro, pacote, r.id), r.leituras.length)
    for (let j = 0; j < n; j++) ordem.push(`repetibilidade.${r.id}.leituras.${j}`)
  }
  return ordem
}

/** O zero antes de cada posição (classe I, método 3 do sistema). */
export function excentricidadeComZero(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): boolean {
  return (
    pacote?.plano?.excentricidade.metodo === 3 ||
    pacote?.entrada.excentricidade.metodo === 3 ||
    registro.passos.indicacao.calInterno !== null
  )
}

/** A ordem das leituras da excentricidade (passo 7); vazia quando o ensaio não é feito. */
export function ordemExcentricidade(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): string[] {
  const e = registro.passos.excentricidade
  if (e.aplicavel !== true) return []
  const zero = excentricidadeComZero(registro, pacote)
  return e.posicoes.flatMap((_, i) => [
    ...(zero ? [`excentricidade.posicoes.${i}.zeroAntes`] : []),
    `excentricidade.posicoes.${i}.leitura`,
  ])
}

/** O campo depois do atual na ordem (null = acabou a série). */
export function proximoCampo(ordem: readonly string[], atual: string): string | null {
  const i = ordem.indexOf(atual)
  return i >= 0 && i + 1 < ordem.length ? ordem[i + 1] : null
}

/** A primeira leitura da ordem ainda em branco (null = todas feitas). */
export function primeiroVazio(registro: RegistroCampo, ordem: readonly string[]): string | null {
  return ordem.find((c) => !lidoNoCaminho(registro, c)) ?? null
}

/** Já tem leitura nesse caminho? */
export function lidoNoCaminho(registro: RegistroCampo, campo: string): boolean {
  const v = lerNoCaminho(registro, campo)
  return !!v && typeof v === 'object' && typeof (v as { valor?: unknown }).valor === 'string'
}

/** Quantas leituras da ordem já foram feitas ("3 de 9 leituras"). */
export function contagem(registro: RegistroCampo, ordem: readonly string[]): { feitas: number; total: number } {
  return { feitas: ordem.filter((c) => lidoNoCaminho(registro, c)).length, total: ordem.length }
}

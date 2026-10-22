// Montagem automática das cargas com os pesos escolhidos (pontos do erro de indicação e da substituição).

import {
  acumulaCargas,
  cargaDaEtapa,
  cargasAcumuladas,
  montarCarga,
  montarPontos,
  type PontoMontado,
} from '#shared/calibracao.ts'
import type { Balanca, CalibracaoInput, EnsaioIndicacao, Padrao, PecaCarga } from '#shared/tipos.ts'

const iguais = (a: PecaCarga[], b: PecaCarga[]) =>
  a.length === b.length &&
  a.every((x, i) => x.padraoId === b[i].padraoId && x.pesoId === b[i].pesoId && x.quantidade === b[i].quantidade)

/**
 * Peças de todos os pontos de um ensaio, como a folha de campo monta (`montarPontos`): com substituição,
 * nível × carga da etapa por baixo e os pesos só no resto; sem descarga (`acumular`), cada ponto leva as
 * peças do de baixo mais as que faltam. As escolhidas à mão ficam. `diferenca` ≠ 0: as etapas e os pesos não
 * dão a carga do ponto (> 0 passa, < 0 falta); `foraDaSequencia`: sem descarga, seria preciso trocar peças.
 */
export function montagemDoEnsaio(
  e: EnsaioIndicacao,
  balanca: Balanca,
  padroes: Padrao[],
  acumular = cargasAcumuladas(e.metodo),
): PontoMontado[] {
  const etapa = cargaDaEtapa(e, padroes, balanca.unidade)
  return montarPontos(
    e.pontos.map((p) => ({
      carga: p.carga,
      nivel: e.substituicao.ativa ? p.nivelSubstituicao : 0,
      pecasManuais: p.pecasManuais ? p.pecas : null,
    })),
    acumular,
    etapa,
    balanca.unidade,
    padroes,
  )
}

/**
 * Refaz as peças dos pontos automáticos (as escolhidas à mão ficam). `acumular`: as cargas se somam (método
 * sem descarga neste ensaio ou no da outra aba; ver `acumulaCargas`).
 */
export function recomporEnsaio(
  e: EnsaioIndicacao,
  balanca: Balanca,
  padroes: Padrao[],
  acumular = cargasAcumuladas(e.metodo),
): EnsaioIndicacao {
  const montados = montagemDoEnsaio(e, balanca, padroes, acumular)
  let mudou = false
  const pontos = e.pontos.map((p, i) => {
    if (p.pecasManuais) return p
    const { pecas } = montados[i]
    if (iguais(pecas, p.pecas)) return p
    mudou = true
    return { ...p, pecas }
  })
  return mudou ? { ...e, pontos } : e
}

/** Refaz as peças dos pontos automáticos das duas abas (depois de mudar os pesos, as cargas ou o método). */
export function recomporCargas(f: CalibracaoInput, balanca: Balanca, padroes: Padrao[]): CalibracaoInput {
  const acumular = acumulaCargas(f)
  const indicacao = recomporEnsaio(f.indicacao, balanca, padroes, acumular)
  const comoEncontrado = f.comoEncontrado ? recomporEnsaio(f.comoEncontrado, balanca, padroes, acumular) : null
  if (indicacao === f.indicacao && comoEncontrado === f.comoEncontrado) return f
  return { ...f, indicacao, comoEncontrado }
}

/** Peças para uma carga, com o que faltou (quando os pesos escolhidos não somam a carga). */
export const pecasPara = (carga: number, balanca: Balanca, padroes: Padrao[]) => montarCarga(carga, balanca.unidade, padroes)

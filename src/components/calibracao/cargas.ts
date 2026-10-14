// Montagem automática das cargas com os pesos escolhidos (pontos do erro de indicação e da substituição).

import { montarCarga } from '#shared/calibracao.ts'
import type { Balanca, CalibracaoInput, EnsaioIndicacao, Padrao, PecaCarga } from '#shared/tipos.ts'

const iguais = (a: PecaCarga[], b: PecaCarga[]) =>
  a.length === b.length &&
  a.every((x, i) => x.padraoId === b[i].padraoId && x.pesoId === b[i].pesoId && x.quantidade === b[i].quantidade)

function recomporEnsaio(e: EnsaioIndicacao, balanca: Balanca, padroes: Padrao[]): EnsaioIndicacao {
  let mudou = false
  const pontos = e.pontos.map((p) => {
    if (p.pecasManuais) return p
    const pecas = p.carga > 0 ? montarCarga(p.carga, balanca.unidade, padroes).pecas : []
    if (iguais(pecas, p.pecas)) return p
    mudou = true
    return { ...p, pecas }
  })
  return mudou ? { ...e, pontos } : e
}

/** Refaz as peças dos pontos automáticos (depois de mudar os pesos escolhidos ou as cargas). */
export function recomporCargas(f: CalibracaoInput, balanca: Balanca, padroes: Padrao[]): CalibracaoInput {
  const indicacao = recomporEnsaio(f.indicacao, balanca, padroes)
  const comoEncontrado = f.comoEncontrado ? recomporEnsaio(f.comoEncontrado, balanca, padroes) : null
  if (indicacao === f.indicacao && comoEncontrado === f.comoEncontrado) return f
  return { ...f, indicacao, comoEncontrado }
}

/** Peças para uma carga, com o que faltou (quando os pesos escolhidos não somam a carga). */
export const pecasPara = (carga: number, balanca: Balanca, padroes: Padrao[]) => montarCarga(carga, balanca.unidade, padroes)

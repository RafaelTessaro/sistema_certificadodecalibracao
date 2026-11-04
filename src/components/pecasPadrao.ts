// Peças de um jogo de pesos no cadastro do padrão (o formulário trabalha com o texto digitado): leitura dos campos,
// a conferência de cada peça frente à classe (OIML R111) e os avisos das peças.

import { GRAMAS } from '#shared/calibracao.ts'
import { massaLegivel, numero, numeroBr } from '#shared/dominio.ts'
import { emaPeso } from '#shared/metrologia/index.ts'
import type { ClassePeso, UsoPesos } from '#shared/tipos.ts'

export type UnidadePeso = 'mg' | 'g' | 'kg'
export const UNIDADES_PESO: UnidadePeso[] = ['mg', 'g', 'kg']

/** Peça como digitada (texto). O nominal é gravado sempre em gramas; a unidade é só da tela. */
export interface PesoTexto {
  id: string
  marca: string
  nominal: string
  unidade: UnidadePeso
  correcao: string
  incerteza: string
  k: string
}

/** Valor do campo (vazio = 0; texto que não é número = NaN). */
export const lerCampo = (t: string) => (t.trim() ? numero(t) : 0)
/** Campo preenchido com algo que não é número. */
export const campoInvalido = (t: string) => t.trim() !== '' && Number.isNaN(numero(t))

export const paraGramas = (valor: number, u: UnidadePeso) => Number((valor * GRAMAS[u]).toPrecision(12))
/** Nominal da peça em gramas. */
export const gramasDe = (p: PesoTexto) => paraGramas(lerCampo(p.nominal), p.unidade)

/**
 * Situação de uma peça frente à classe (OIML R111): U ≤ EMA/3 e |correção| ≤ EMA − U. No jogo pelo valor do
 * certificado, a peça sem U (`semU`) entra pelo nominal e a correção dela é ignorada (`pecaParaCalculo`).
 */
export function conferirPeca(p: PesoTexto, classe: ClassePeso | '', uso: UsoPesos = 'NOMINAL') {
  const g = gramasDe(p)
  const ema = g > 0 && classe ? emaPeso(g, classe) : null
  const u = lerCampo(p.incerteza)
  const c = lerCampo(p.correcao)
  const uAlta = ema !== null && u > 0 && u > ema / 3 + 1e-9
  // Correção em branco conta como 0; aí só a incerteza decide (aviso acima)
  const correcaoAlta = ema !== null && p.correcao.trim() !== '' && !Number.isNaN(c) && Math.abs(c) > ema - u + 1e-9
  const semU = uso === 'CERTIFICADO' && g > 0 && !campoInvalido(p.incerteza) && !(u > 0)
  return { gramas: g, ema, u, c, uAlta, correcaoAlta, semU }
}

/** Avisos das peças (não impedem gravar): U e correção acima do que a classe admite, e as peças sem U. */
export function avisosDasPecas(
  pesos: PesoTexto[],
  conferencias: Array<ReturnType<typeof conferirPeca>>,
  classe: ClassePeso | '',
): string[] {
  const nomeDe = (i: number) => {
    const c = conferencias[i]
    return pesos[i].marca.trim() || (c.gramas > 0 ? massaLegivel(c.gramas) : `Peça ${i + 1}`)
  }
  const avisos = conferencias.flatMap((c, i) => {
    const nome = nomeDe(i)
    const r: string[] = []
    if (c.uAlta && c.ema !== null)
      r.push(`${nome}: a incerteza (U = ${numeroBr(c.u, 3)} mg) passa de 1/3 do EMA da classe (${numeroBr(c.ema / 3, 3)} mg).`)
    if (c.correcaoAlta && c.ema !== null)
      r.push(
        `${nome}: a correção (${numeroBr(c.c, 3)} mg) passa do limite da classe ${classe} (EMA − U = ${numeroBr(c.ema - c.u, 3)} mg). A peça pode estar fora da classe.`,
      )
    return r
  })
  // Sem U: uma linha só (a lista recém-digitada vem toda sem U)
  const semU = conferencias.flatMap((c, i) => (c.semU ? [nomeDe(i)] : []))
  if (semU.length === 1) avisos.push(`${semU[0]}: sem a U, entra pelo valor nominal e a correção do certificado é ignorada.`)
  else if (semU.length > 1)
    avisos.push(
      `${semU.length <= 3 ? `${semU.slice(0, -1).join(', ')} e ${semU.at(-1)}` : `${semU.length} peças`}: sem a U, entram pelo valor nominal e a correção do certificado é ignorada.`,
    )
  return avisos
}

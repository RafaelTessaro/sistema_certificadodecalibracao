// Pesos padrão: conversão de unidades, montagem de cargas com as peças disponíveis, conversão das
// peças cadastradas (PesoPadrao + Padrao) para o motor e escolha da classe mínima dos pesos.

import type { ClassePeso, Padrao, PesoPadrao, Unidade } from '../tipos.ts'
import { limparRuido } from './arredondamento.ts'
import { emaInstrumento, emaPeso, faixasOrdenadas, LIMIARES_EMA, NOMINAIS_R111 } from './ema.ts'
import type { InstrumentoCalculo, PecaCalculo } from './tipos.ts'

/** Tolerância relativa das comparações de massa (somas de peças em ponto flutuante). */
const TOL = 1e-9

const EXPOENTE: Record<Unidade, number> = { mg: -3, g: 0, kg: 3, t: 6 }

/**
 * Converte massa entre mg, g, kg e t. Desloca a vírgula na representação decimal do número (0,035 g →
 * 0,000035 kg exatos), em vez de dividir no binário (que daria 0,000035000000000000004).
 */
export function converterMassa(valor: number, de: Unidade, para: Unidade): number {
  const diferenca = EXPOENTE[de] - EXPOENTE[para]
  if (diferenca === 0 || !Number.isFinite(valor) || valor === 0) return valor
  const [mantissa, expoente = '0'] = String(valor).split('e')
  return Number(`${mantissa}e${Number(expoente) + diferenca}`)
}

// ---- Montagem de cargas ------------------------------------------------------------------

/** Peça (ou grupo de peças iguais) disponível para montar uma carga. */
export interface PecaDisponivel {
  chave: string
  nominal: number
  /** Quantas peças iguais estão disponíveis. */
  quantidade: number
}

export interface MontagemCarga {
  /** Peças escolhidas (só as usadas), do maior nominal para o menor. */
  pecas: PecaDisponivel[]
  /** Soma dos nominais escolhidos. */
  soma: number
  /** Quanto faltou para chegar ao alvo (0 = carga montada). */
  faltou: number
  completa: boolean
}

/**
 * Decompõe a carga nominal `alvo` com as peças disponíveis: gulosa, do maior nominal para o menor,
 * comparando com tolerância relativa de 1e-9. Se a gulosa não fecha (ex.: 6 com 5, 3, 3), tenta uma
 * busca exaustiva limitada antes de desistir; sem solução exata, devolve a gulosa e o que faltou.
 */
export function montarCarga(alvo: number, disponiveis: readonly PecaDisponivel[]): MontagemCarga {
  const tol = TOL * Math.abs(alvo)
  const pecas = disponiveis
    .filter((p) => p.nominal > 0 && p.quantidade >= 1)
    .map((p) => ({ ...p, quantidade: Math.floor(p.quantidade) }))
    .sort((a, b) => b.nominal - a.nominal)
  const resultado = (quantidades: number[]): MontagemCarga => {
    const usadas = pecas.map((p, i) => ({ ...p, quantidade: quantidades[i] })).filter((p) => p.quantidade > 0)
    const soma = limparRuido(
      usadas.reduce((s, p) => s + p.nominal * p.quantidade, 0),
      alvo,
    )
    const resto = alvo - soma
    const faltou = resto <= tol ? 0 : limparRuido(resto, alvo)
    return { pecas: usadas, soma, faltou, completa: faltou === 0 }
  }
  if (!(alvo > 0)) return resultado(pecas.map(() => 0))

  // Gulosa
  const gulosa = pecas.map(() => 0)
  let resto = alvo
  pecas.forEach((p, i) => {
    const n = Math.min(p.quantidade, Math.floor((resto + tol) / p.nominal))
    if (n > 0) {
      gulosa[i] = n
      resto -= n * p.nominal
    }
  })
  if (resto <= tol) return resultado(gulosa)

  // Busca exaustiva limitada (as maiores peças primeiro)
  let nos = 0
  const atual = pecas.map(() => 0)
  const buscar = (i: number, falta: number): boolean => {
    if (Math.abs(falta) <= tol) return true
    if (i >= pecas.length || falta < -tol || ++nos > 20_000) return false
    const p = pecas[i]
    for (let n = Math.min(p.quantidade, Math.floor((falta + tol) / p.nominal)); n >= 0; n--) {
      atual[i] = n
      if (buscar(i + 1, falta - n * p.nominal)) return true
    }
    atual[i] = 0
    return false
  }
  return buscar(0, alvo) ? resultado(atual) : resultado(gulosa)
}

// ---- Peças cadastradas → motor ---------------------------------------------------------------

/**
 * Converte uma peça do cadastro (nominal em g; correção e incerteza em mg) para o motor, na unidade
 * da balança. Uso pelo CERTIFICADO: correção e U/k do certificado; uso NOMINAL: correção 0 e U = 0
 * (a incerteza vem do EMA da classe, EMA/√3). O EMA vem da Tabela 1 da R111 (0 se a classe não é conhecida).
 */
export function pecaCalculo(
  peso: Pick<PesoPadrao, 'nominal' | 'correcao' | 'incerteza' | 'k'>,
  padrao: Pick<Padrao, 'uso' | 'classe'>,
  unidade: Unidade,
  quantidade = 1,
): PecaCalculo {
  const certificado = padrao.uso === 'CERTIFICADO'
  return {
    nominal: converterMassa(peso.nominal, 'g', unidade),
    correcao: certificado ? converterMassa(peso.correcao, 'mg', unidade) : 0,
    incerteza: certificado ? converterMassa(peso.incerteza, 'mg', unidade) : 0,
    k: peso.k > 0 ? peso.k : 2,
    ema: converterMassa(emaPeso(peso.nominal, padrao.classe) ?? 0, 'mg', unidade),
    usarCertificado: certificado,
    quantidade,
  }
}

// ---- Classe mínima dos pesos ------------------------------------------------------------------

/** Soma dos EMA (mg) de uma carga montada com os nominais 1-2-5 da classe (sem limite de peças); null se não fecha. */
function somaEmaSerie(gramas: number, classe: ClassePeso): number | null {
  let resto = gramas
  let soma = 0
  for (const nominal of NOMINAIS_R111) {
    const ema = emaPeso(nominal, classe)
    if (ema === null) continue
    const n = Math.floor(resto / nominal + TOL)
    if (n > 0) {
      soma += n * ema
      resto -= n * nominal
    }
  }
  return resto <= TOL * gramas ? soma : null
}

/**
 * A carga montada com os nominais 1-2-5 da `classe` (pelo nominal, sem limite de peças) atende à regra
 * Σ EMA_pesos ≤ EMA_OIML_inicial(L)/3 (R76 3.7.1; POP 6.1)? Não quando a balança não tem classe ou a série não
 * fecha a carga. Ex.: classe I 220 g / e = 1 mg com E2: 160 g = 100 + 50 + 10 g (0,32 mg ≤ 0,333 mg) atende;
 * 170 g = 100 + 50 + 20 g (0,34 mg) não.
 */
export function serieDaClasseAtende(
  carga: number,
  instrumento: Pick<InstrumentoCalculo, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'>,
  classe: ClassePeso,
): boolean {
  const ema = emaInstrumento(carga, instrumento, 'OIML_INICIAL')
  const soma = somaEmaSerie(converterMassa(carga, instrumento.unidade, 'g'), classe)
  return ema !== null && soma !== null && converterMassa(soma, 'mg', instrumento.unidade) <= (ema / 3) * (1 + TOL)
}

/**
 * Classe de pesos mais grosseira (M3, M2, M1, F2, F1, E2 ou E1) que atende à regra legal
 * Σ EMA_pesos ≤ EMA_OIML_inicial(L)/3 (R76 3.7.1; Portaria 157 2.7.1), com os pesos pelo nominal.
 * Confere as cargas críticas: as mudanças de EMA (L1·e, L2·e) e o Max de cada faixa.
 * Ex.: classe III 30 kg / 5 g → M1; 30 kg / 10 g → M2. Null se a classe do instrumento não é marcada.
 */
export function classeMinimaPesos(
  instrumento: Pick<InstrumentoCalculo, 'unidade' | 'classe' | 'tipoFaixas' | 'faixas'>,
): ClassePeso | null {
  if (!instrumento.classe || !instrumento.faixas.length) return null
  const [l1, l2] = LIMIARES_EMA[instrumento.classe]
  const cargas: number[] = []
  let inferior = 0
  for (const f of faixasOrdenadas(instrumento.faixas)) {
    for (const c of [l1 * f.e, l2 * f.e, f.max]) if (c > inferior * (1 + TOL) && c <= f.max * (1 + TOL)) cargas.push(c)
    if (instrumento.tipoFaixas !== 'UNICA') inferior = f.max
  }
  const candidatas: ClassePeso[] = ['M3', 'M2', 'M1', 'F2', 'F1', 'E2', 'E1']
  const atende = (classe: ClassePeso) => cargas.every((c) => serieDaClasseAtende(c, instrumento, classe))
  return candidatas.find(atende) ?? null
}

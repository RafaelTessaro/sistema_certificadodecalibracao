// Não regressão do motor: 400 entradas sorteadas (semente fixa) das classes I a IIII e sem classe, com as opções
// de sempre (sem o empuxo MEDIDO, sem a convecção e sem os campos novos de ar e ΔT), e uma "impressão digital"
// de cada resultado (números com 10 algarismos e textos; sem os avisos). As impressões em `regressaoMotor.json`
// saíram do motor ANTES da classe I (commit ee52e4a): o motor de hoje tem de dar exatamente os mesmos números.
// Para gerar de novo (só quando uma mudança de resultado for de propósito): `impressoesDoMotor(calcular)`.

import type { EntradaCalculo, ResultadoCalculo } from '../tipos.ts'

/** Gerador determinístico (mulberry32). */
function sorteador(semente: number) {
  let s = semente
  const rnd = () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const um = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]
  const inteiro = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
  return { rnd, um, inteiro }
}
const r12 = (x: number) => Number(x.toPrecision(12))

const BALANCAS: ReadonlyArray<Pick<EntradaCalculo['instrumento'], 'unidade' | 'classe' | 'faixas'>> = [
  { unidade: 'g', classe: 'II', faixas: [{ max: 3200, e: 0.1, d: 0.01 }] },
  { unidade: 'g', classe: 'II', faixas: [{ max: 620, e: 0.01, d: 0.001 }] },
  { unidade: 'kg', classe: 'III', faixas: [{ max: 30, e: 0.005, d: 0.005 }] },
  { unidade: 'kg', classe: 'III', faixas: [{ max: 300, e: 0.05, d: 0.05 }] },
  {
    unidade: 'kg',
    classe: 'III',
    faixas: [
      { max: 15, e: 0.005, d: 0.005 },
      { max: 30, e: 0.01, d: 0.01 },
    ],
  },
  { unidade: 'kg', classe: 'IIII', faixas: [{ max: 80_000, e: 20, d: 20 }] },
  {
    unidade: 't',
    classe: 'III',
    faixas: [
      { max: 30, e: 0.01, d: 0.01 },
      { max: 60, e: 0.02, d: 0.02 },
      { max: 80, e: 0.05, d: 0.05 },
    ],
  },
  { unidade: 'kg', classe: '', faixas: [{ max: 1500, e: 0.5, d: 0.5 }] },
  { unidade: 'g', classe: 'I', faixas: [{ max: 220, e: 0.001, d: 0.0001 }] },
  { unidade: 'mg', classe: 'II', faixas: [{ max: 60_000, e: 10, d: 1 }] },
]

/** As entradas sorteadas (sempre as mesmas). */
export function entradasDeRegressao(quantas = 400): EntradaCalculo[] {
  const { rnd, um, inteiro } = sorteador(20261028)
  const pecasPara = (carga: number) => {
    const n = inteiro(1, 4)
    const pecas = []
    let resto = carga
    for (let i = 0; i < n && resto > 0; i++) {
      const nominal = i === n - 1 ? resto : r12(resto * um([0.5, 0.25, 0.2]))
      resto = r12(resto - nominal)
      const ema = r12(nominal * um([0, 5e-6, 1.6e-5, 5e-5, 1.6e-4]))
      const usarCertificado = rnd() < 0.6
      const incerteza = usarCertificado ? r12(ema * um([0, 0.2, 0.33, 0.5])) : 0
      pecas.push({
        nominal,
        correcao: usarCertificado ? r12(incerteza * (rnd() - 0.5)) : 0,
        incerteza,
        k: um([2, 2, 2.1]),
        ema,
        usarCertificado,
        quantidade: um([1, 1, 1, 2]),
      })
    }
    return pecas
  }
  return Array.from({ length: quantas }, (): EntradaCalculo => {
    const b = um(BALANCAS)
    const faixas = b.faixas.map((f) => ({ ...f }))
    const tipoFaixas = faixas.length > 1 ? um(['MULTI_INTERVALO', 'MULTIPLAS_FAIXAS'] as const) : 'UNICA'
    const max = faixas[faixas.length - 1].max
    const d = faixas[0].d
    const ler = (carga: number) => r12(Math.round((carga + (rnd() - 0.5) * 6 * d) / d) * d)
    const repetibilidade = Array.from({ length: inteiro(0, 2) }, (_, j) => {
      const carga = r12(max * um([0.5, 0.25, 0.8]))
      return { id: `r${j}`, carga, leituras: Array.from({ length: inteiro(1, 10) }, () => (rnd() < 0.05 ? null : ler(carga))) }
    })
    const lEcc = r12(max / 3)
    const metodoExc = um([1, 2, 3, 4] as const)
    const excentricidade = {
      aplicavel: rnd() < 0.85,
      carga: rnd() < 0.1 ? 0 : lEcc,
      metodo: metodoExc,
      posicoes: ['Centro', 'A', 'B', 'C', 'D'].map((rotulo) => ({
        rotulo,
        leitura: rnd() < 0.05 ? null : ler(lEcc),
        referencia: metodoExc >= 3 ? (rnd() < 0.5 ? null : metodoExc === 3 ? ler(0) : ler(lEcc)) : null,
      })),
    }
    const nPontos = inteiro(2, 6)
    const cargas = [0, ...Array.from({ length: nPontos - 1 }, (_, j) => r12((max * (j + 1)) / (nPontos - 1)))]
    const sub = rnd() < 0.15
    const pontos = cargas.map((carga, j) => {
      const comPecas = carga > 0 && rnd() < 0.92
      return {
        id: `p${j}`,
        carga,
        pecas: comPecas ? pecasPara(sub && j > 1 ? r12(carga / 2) : carga) : [],
        crescente: rnd() < 0.08 ? null : ler(carga),
        decrescente: rnd() < 0.5 ? null : ler(carga),
        nivelSubstituicao: sub && j > 1 ? 1 : 0,
      }
    })
    return {
      instrumento: { unidade: b.unidade, classe: b.classe, tipoFaixas, faixas },
      opcoes: {
        empuxo: um(['AJUSTADO', 'NAO_AJUSTADO', 'DELTA_T', 'NENHUM'] as const),
        deltaTLocal: um([0, 0, 2, 5, 10]),
        deriva: um(['EMA', 'KD'] as const),
        kD: um([1, 1.25, 2]),
        excentricidade: rnd() < 0.8,
        metodoK: um(['T_EXATO', 'TABELA', 'K2'] as const),
        zeroAprovado: rnd() < 0.2,
        histerese: um(['SEPARADO', 'MEDIA'] as const),
        divisaoTeste: rnd() < 0.1 ? r12(d / 10) : 0,
      },
      repetibilidade,
      excentricidade,
      indicacao: {
        metodo: um(['DESCONTINUO', 'CONTINUO', 'CRESCENTE_DECRESCENTE', 'DECRESCENTE'] as const),
        pontos,
        retornoZero: rnd() < 0.5 ? null : ler(0),
        substituicao: {
          ativa: sub,
          pecas: sub ? pecasPara(r12(max / 4)) : [],
          etapas: sub ? [{ leituraPadroes: ler(max / 4), leituraSubstituicao: ler(max / 4) }] : [],
        },
      },
      conformidade: {
        solicitada: rnd() < 0.4,
        criterio: um(['PORTARIA_VERIFICACAO', 'PORTARIA_SERVICO', 'OIML_INICIAL', 'OIML_SERVICO', 'CLIENTE'] as const),
        toleranciaCliente: rnd() < 0.5 ? r12(d * 5) : 0,
        regra: um(['SIMPLES', 'BANDA_GUARDA'] as const),
      },
    }
  })
}

/** Campos que o motor ganhou com a classe I (ficam fora da impressão digital). */
const CAMPOS_NOVOS = new Set(['uConveccao', 'correcaoEmpuxo', 'ar', 'avisos'])

/** O resultado em texto estável: números com 10 algarismos, sem os campos novos e sem os avisos. */
export function textoEstavel(r: ResultadoCalculo): string {
  return JSON.stringify(r, (chave, valor) => {
    if (CAMPOS_NOVOS.has(chave)) return undefined
    if (typeof valor === 'number') return Number.isFinite(valor) ? Number(valor.toPrecision(10)) : String(valor)
    return valor
  })
}

/** cyrb53: impressão digital curta de um texto (sem dependências; não é criptográfica). */
export function impressaoDigital(texto: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** As impressões digitais dos resultados das entradas de regressão com o `calcular` dado. */
export function impressoesDoMotor(calcular: (e: EntradaCalculo) => ResultadoCalculo): string[] {
  return entradasDeRegressao().map((e) => impressaoDigital(textoEstavel(calcular(e))))
}

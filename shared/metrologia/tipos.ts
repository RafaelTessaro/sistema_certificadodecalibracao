// Entradas e saídas do motor de cálculo da calibração (EURAMET cg-18 v4.0, seções 6 e 7).
// O motor é puro (sem banco, sem rede) e roda igual no servidor (emissão e PDF) e no navegador
// (cálculo ao vivo enquanto o técnico digita as leituras).
//
// Convenção de unidades: TODAS as massas, leituras, d, e e incertezas da balança estão na unidade
// da balança (`unidade`). As peças de peso chegam já convertidas para essa unidade (ver `PecaCalculo`).

import type {
  ClasseExatidao,
  CriterioEma,
  Faixa,
  MetodoCarregamento,
  MetodoExcentricidade,
  OpcoesCalculo,
  RegraDecisao,
  TipoFaixas,
  Unidade,
} from '../tipos.ts'

/** Uma peça de peso padrão já na unidade da balança. */
export interface PecaCalculo {
  /** Valor nominal m_N. */
  nominal: number
  /** Correção δm_c do certificado (valor convencional − nominal); 0 quando o uso é pelo nominal. */
  correcao: number
  /** Incerteza expandida U do certificado (0 quando o uso é pelo nominal). */
  incerteza: number
  /** Fator de abrangência k do certificado. */
  k: number
  /** Erro máximo admissível (EMA/mpe) da classe OIML R111 da peça; 0 = classe desconhecida. */
  ema: number
  /** true = usar o valor do certificado (u = U/k); false = nominal (u = EMA/√3). */
  usarCertificado: boolean
  /** Quantas peças iguais a esta compõem a carga. */
  quantidade: number
}

export interface InstrumentoCalculo {
  unidade: Unidade
  classe: ClasseExatidao
  tipoFaixas: TipoFaixas
  /** Pelo menos uma faixa, em ordem crescente de max. */
  faixas: Faixa[]
}

export interface PontoCalculo {
  id: string
  /** Carga nominal (soma dos nominais das peças; ou o valor digitado quando não há peças). */
  carga: number
  pecas: PecaCalculo[]
  crescente: number | null
  decrescente: number | null
  /** Cargas de substituição por baixo dos pesos (0 = só pesos). */
  nivelSubstituicao: number
  /**
   * Peças gravadas no ponto que não estão mais entre os padrões escolhidos (um jogo desmarcado depois):
   * a carga do ponto fica incompleta (pendência).
   */
  pecasAusentes?: number
}

export interface EntradaCalculo {
  instrumento: InstrumentoCalculo
  opcoes: OpcoesCalculo
  repetibilidade: Array<{ id: string; carga: number; leituras: Array<number | null> }>
  excentricidade: {
    aplicavel: boolean
    carga: number
    metodo: MetodoExcentricidade
    posicoes: Array<{ rotulo: string; leitura: number | null; referencia: number | null }>
    /**
     * Carga rolante (rodoviária e ferroviária): as posições vêm em passagens de 3 (início, meio e fim), na ida
     * e na volta, e o desvio de cada posição é contra o meio da mesma passagem (cg-18 H3). Sem ela, contra a
     * posição 1 (o centro).
     */
    cargaRolante?: boolean
  }
  indicacao: {
    metodo: MetodoCarregamento
    pontos: PontoCalculo[]
    retornoZero: number | null
    substituicao: {
      ativa: boolean
      /** Peças da carga de pesos padrão usada em cada etapa de substituição (m_ref). */
      pecas: PecaCalculo[]
      etapas: Array<{ leituraPadroes: number | null; leituraSubstituicao: number | null }>
    }
  }
  conformidade: {
    solicitada: boolean
    criterio: CriterioEma
    toleranciaCliente: number
    regra: RegraDecisao
  }
}

/** Resultado de um ensaio de repetibilidade. */
export interface ResultadoRepetibilidade {
  id: string
  carga: number
  n: number
  media: number
  /** Desvio-padrão experimental s (n − 1). */
  s: number
  /** Graus de liberdade (n − 1). */
  nu: number
  /** Maior − menor leitura. */
  amplitude: number
}

export interface ResultadoExcentricidade {
  aplicavel: boolean
  carga: number
  /** ΔI_ecc,i de cada posição (nas posições de referência: 0). */
  desvios: Array<number | null>
  /**
   * Posições (índices) que servem de referência aos desvios: [0] (o centro); com carga rolante, o meio de
   * cada passagem ([1, 4] na ida e na volta).
   */
  referencias: number[]
  /** |ΔI_ecc|max */
  maiorDesvio: number
  /** Posição (índice) do maior desvio. */
  posicaoMaior: number
  /** u_rel(δI_ecc) = |ΔI|max / (2·L_ecc·√3) */
  incertezaRelativa: number
}

/** Orçamento de incerteza de um ponto (valores na unidade da balança). */
export interface Orcamento {
  /** Indicação usada (I) e massa de referência (m_ref). */
  indicacao: number
  referencia: number
  erro: number
  /** Componentes (incertezas padrão). */
  uDig0: number
  uDigL: number
  uRep: number
  uEcc: number
  uHist: number
  uTempo: number
  uIndicacao: number
  uMassa: number
  uDeriva: number
  uEmpuxo: number
  uSubstituicao: number
  uReferencia: number
  /** Incerteza padrão combinada u(E). */
  uCombinada: number
  /** Graus de liberdade efetivos (Infinity quando não há componente tipo A). */
  nuEff: number
  k: number
  /** Incerteza expandida U = k·u(E). */
  U: number
}

/** Situação da declaração de conformidade num ponto. */
export type SituacaoConformidade = 'CONFORME' | 'NAO_CONFORME'

export interface ResultadoPonto {
  id: string
  carga: number
  /** Massa de referência (valor convencional da carga). */
  referencia: number
  crescente: Orcamento | null
  decrescente: Orcamento | null
  /** Opção histerese = MEDIA: um único orçamento pela média (I↑ + I↓)/2 com a componente de histerese. */
  media: Orcamento | null
  /** EMA do critério de conformidade nesta carga (quando há declaração de conformidade). */
  ema: number | null
  conformidade: SituacaoConformidade | null
  /** Valores prontos para o certificado (vírgula decimal, U com 2 algarismos, E na casa de U). */
  texto: {
    carga: string
    referencia: string
    crescente: string
    decrescente: string
    erroCrescente: string
    erroDecrescente: string
    erroMedio: string
    U: string
    k: string
    nuEff: string
    ema: string
  }
}

export interface ResultadoCalculo {
  repetibilidade: ResultadoRepetibilidade[]
  excentricidade: ResultadoExcentricidade
  pontos: ResultadoPonto[]
  /** Maior U entre os pontos (para a frase "U ≤ … em toda a faixa"). */
  maiorU: number
  /** Retorno ao zero: erro no zero após descarregar, quando lido. */
  erroRetornoZero: number | null
  /** Conformidade geral (pior caso entre os pontos), quando solicitada. */
  conformidade: SituacaoConformidade | null
  /** Avisos para o técnico (não impedem o cálculo). */
  avisos: Aviso[]
  /** Faltam dados para calcular (ex.: nenhuma leitura de repetibilidade). */
  pendencias: string[]
}

export interface Aviso {
  nivel: 'info' | 'atencao' | 'erro'
  mensagem: string
}

export type { CriterioEma, RegraDecisao }

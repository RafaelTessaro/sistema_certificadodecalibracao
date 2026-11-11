// Regras do domínio: valores padrão, rótulos, normalização das entradas (servidor e telas) e
// validações. O servidor é a fonte da verdade; as telas usam as mesmas funções para avisar na hora.

import { normalizarArquivoAnexo } from './arquivos.ts'
import { cnpjValido, cpfValido, mascaraCep, mascaraCnpj, mascaraCpf, normalizarCnpj, somenteDigitos } from './documentos.ts'
import { novoId } from './id.ts'
import { DENSIDADE_PESOS_KG_M3, densidadePesosPlausivel } from './metrologia/ar.ts'
import {
  PENDENCIA_AR_MEDIDO,
  PENDENCIA_CARGA_EXCENTRICIDADE,
  PENDENCIA_CONVECCAO,
  PENDENCIA_LEITURAS_EXCENTRICIDADE,
  PENDENCIA_RETORNO_ZERO,
  PENDENCIA_SEM_LEITURAS_INDICACAO,
  pendenciaSemRepetibilidade,
} from './metrologia/calculo.ts'
import { classeMinimaPesos, montarCarga as montarCargaNominal } from './metrologia/pesos.ts'
import type {
  AjusteRealizado,
  ArquivoAnexo,
  AssinaturaDigitalEmissao,
  Balanca,
  BalancaInput,
  CalibracaoInput,
  ClasseExatidao,
  ClassePeso,
  ClienteInput,
  CondicoesAmbientais,
  Conformidade,
  Configuracoes,
  CriterioEma,
  DadosEmpresa,
  EnsaioExcentricidade,
  EnsaioIndicacao,
  EnsaioRepetibilidade,
  Faixa,
  Finalidade,
  IndicadorLegado,
  LocalCalibracao,
  MetodoCarregamento,
  MetodoExcentricidade,
  OpcoesCalculo,
  Padrao,
  PadraoInput,
  PecaCarga,
  PesoPadrao,
  PontoIndicacao,
  Receptor,
  RegraDecisao,
  StatusCalibracao,
  TextosCertificado,
  TipoBalanca,
  TipoCliente,
  TipoFaixas,
  TipoPadrao,
  Tone,
  Unidade,
  UsoPesos,
  Verificacao,
  VersaoPadrao,
} from './tipos.ts'

export interface Resultado<T> {
  valor: T
  erros: string[]
}

/** Limites de segurança contra dados corrompidos ou absurdos. */
export const LIMITES = {
  texto: 300,
  textoLongo: 5000,
  faixas: 3,
  pesos: 200,
  pontos: 40,
  leituras: 30,
  repetibilidades: 5,
  posicoes: 24,
  etapas: 20,
  padroesPorCalibracao: 20,
  /** Assinatura digitalizada (data URL PNG). */
  assinatura: 300_000,
  /** Motivo da correção (fica só no sistema) e do cancelamento. */
  motivo: 500,
  /** Por que a excentricidade não foi feita (sai no certificado). */
  motivoExcentricidade: 200,
  /** Portaria de aprovação e local de instalação da balança (saem no certificado). */
  portariaAprovacao: 120,
  localInstalacao: 120,
  /** Descrição e laboratório do padrão (saem no certificado). */
  descricaoPadrao: 160,
  laboratorio: 160,
}

/** Intervalo máximo de calibração dos padrões, em meses (POP, Tabela 3: pesos, termo-higrômetro, barômetro, termômetro). */
export const MESES_MAX_CALIBRACAO_PADRAO = 24

/**
 * A próxima calibração digitada no padrão passa do intervalo do POP (Tabela 3: 24 meses depois da calibração)? Quase
 * sempre o ano errado (2032 em vez de 2024). Só um aviso no cadastro (os cadastros antigos continuam editáveis); a
 * emissão confere pela data da calibração do padrão (`pendenciasEmissao`).
 */
export const proximaAlemDoPop = (p: { dataCalibracao: string; validade: string }): boolean =>
  dataIsoValida(p.dataCalibracao) &&
  dataIsoValida(p.validade) &&
  p.validade > somarMeses(p.dataCalibracao, MESES_MAX_CALIBRACAO_PADRAO)

// ---- Utilitários de entrada --------------------------------------------------------

type Bruto = Record<string, unknown>
export const obj = (v: unknown): Bruto => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Bruto) : {})
export const texto = (v: unknown, max = LIMITES.texto) =>
  typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
/** Texto de várias linhas: quebras padronizadas e espaços das pontas removidos. */
export const multilinha = (v: unknown, max = LIMITES.textoLongo) =>
  texto(typeof v === 'string' ? v.replace(/\r\n?/g, '\n') : v, max)
/** Número digitado com vírgula ou ponto; NaN quando não é número. */
export function numero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (typeof v !== 'string') return NaN
  let s = v.trim().replace(/\s/g, '')
  if (!s) return NaN
  // "1.234,5" (milhar com ponto, em grupos de 3) → 1234.5 ; "1234,5" → 1234.5 ; "1234.5" → 1234.5. Qualquer outra
  // mistura ("1,234.5", "10,0.5", "15,,005") é ambígua: NaN, nunca um número parecido
  if (s.includes(',')) {
    if (/^[+-]?\d{1,3}(\.\d{3})+,\d*$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
    else if (/^[+-]?\d*,\d*$/.test(s)) s = s.replace(',', '.')
    else return NaN
  }
  // Só algarismos, um separador decimal e o sinal (nada de "1e5", "0x10" ou "Infinity")
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}
/** Número ou `null` (campo de leitura vazio). */
export const numeroOuNulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = numero(v)
  return Number.isNaN(n) ? null : n
}
const positivo = (v: unknown) => {
  const n = numero(v)
  return Number.isNaN(n) || n < 0 ? 0 : n
}
const inteiro = (v: unknown, max: number, min = 0) => {
  const n = numero(v)
  return Number.isNaN(n) ? min : Math.min(Math.max(Math.trunc(n), min), max)
}
export const umDe = <T extends string | number>(v: unknown, opcoes: readonly T[], padrao: T): T =>
  opcoes.includes(v as T) ? (v as T) : padrao
const booleano = (v: unknown, padrao = false) => (typeof v === 'boolean' ? v : padrao)
const ids = (v: unknown, max: number) =>
  [...new Set((Array.isArray(v) ? v : []).map((x) => texto(x, 100)).filter(Boolean))].slice(0, max)

/** `true` para datas ISO `yyyy-MM-dd` que existem no calendário. */
export function dataIsoValida(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && a >= 2000 && a <= 2100
}
const data = (v: unknown) => (dataIsoValida(v) ? v : '')

const diaDeBrasilia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * O dia (`yyyy-MM-dd`) de um instante no horário de Brasília (a empresa fica em Rio Claro/SP), qualquer que seja o fuso
 * do computador: das 21h à meia-noite daqui, o UTC já está no dia seguinte. '' se não é um instante válido.
 */
export function diaEmBrasilia(instante: string | Date): string {
  const d = typeof instante === 'string' ? (instante ? new Date(instante) : null) : instante
  if (!d || Number.isNaN(d.getTime())) return ''
  const p = Object.fromEntries(diaDeBrasilia.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

/** Data de hoje (fuso local do computador) no formato `yyyy-MM-dd`. */
export function hojeLocalIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Soma meses a uma data ISO (o dia 31 vira o último dia do mês quando ele não existe). */
export function somarMeses(iso: string, meses: number): string {
  if (!dataIsoValida(iso)) return ''
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

/**
 * A próxima calibração quando a data da calibração muda: se ela era a calculada pela data antiga (o padrão da
 * empresa, 6, 12 ou 24 meses depois), passa a contar da nova; a digitada à mão fica como está. A tela (a data mudada) e
 * o servidor (a data prevista da folha ligada) usam esta.
 */
export function proximaAcompanhando(proxima: string, dataAntiga: string, dataNova: string, mesesPadrao: number): string {
  if (!proxima || !dataIsoValida(dataAntiga) || !dataIsoValida(dataNova)) return proxima
  const meses = [...new Set([mesesPadrao, 12, 6, 24])].filter((n) => n > 0)
  const n = meses.find((m) => somarMeses(dataAntiga, m) === proxima)
  return n ? somarMeses(dataNova, n) : proxima
}

/** Dias entre duas datas ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function emailValido(s: string) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s)
}

/** "a@x.com; b@y.com, c@z.com" → ['a@x.com', 'b@y.com', 'c@z.com'] (minúsculas, sem repetição). */
export function listaEmails(s: string): string[] {
  return [
    ...new Set(
      String(s ?? '')
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}

/**
 * O "Para" sugerido no envio do certificado: o e-mail para certificados do cliente, senão o principal, em lista
 * ("a@x.com, b@y.com"); '' sem nenhum. `cliente`: os e-mails do cadastro atual (não a cópia congelada na emissão).
 */
export function paraSugerido(cliente: Pick<ClienteInput, 'email' | 'emailCertificados'> | null | undefined): string {
  const certificados = listaEmails(cliente?.emailCertificados ?? '')
  return (certificados.length ? certificados : listaEmails(cliente?.email ?? '')).join(', ')
}

/** Texto para busca: minúsculo, sem acentos e com os espaços normalizados. */
export function textoBusca(...partes: Array<string | undefined | null>): string {
  return partes.filter(Boolean).join(' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// ---- Rótulos ---------------------------------------------------------------------------

export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
export const TIPOS_CLIENTE: TipoCliente[] = ['PJ', 'PF']

/**
 * Tipos que a empresa não calibra (POP 2.1: rodoviárias e ferroviárias). Saem da lista do cadastro novo; a balança
 * já cadastrada com um deles continua com ele (e com as cargas de substituição, as posições etc.).
 */
export const TIPOS_FORA_DO_POP: readonly TipoBalanca[] = ['RODOVIARIA', 'FERROVIARIA']

export const TIPOS_BALANCA: Record<TipoBalanca, string> = {
  COMPUTADORA: 'Computadora (preço)',
  ETIQUETADORA: 'Com impressora de etiquetas',
  BALCAO: 'De balcão / bancada',
  PLATAFORMA: 'Plataforma',
  PISO: 'De piso',
  RODOVIARIA: 'Rodoviária',
  FERROVIARIA: 'Ferroviária',
  ANALITICA: 'Analítica',
  SEMIANALITICA: 'Semianalítica',
  PRECISAO: 'De precisão',
  CONTADORA: 'Contadora',
  SUSPENSA: 'Suspensa / de gancho',
  TRANSPALETEIRA: 'Transpaleteira / pallet',
  HOSPITALAR: 'Médico-hospitalar',
  CHECKOUT: 'De checkout',
  OUTRA: 'Outra',
}
export const LISTA_TIPOS_BALANCA = Object.keys(TIPOS_BALANCA) as TipoBalanca[]

export const RECEPTORES: Record<Receptor, string> = {
  RETANGULAR: 'Retangular / quadrado (até 4 apoios)',
  CIRCULAR: 'Prato redondo',
  APOIOS: 'Plataforma com mais de 4 apoios',
  RODOVIARIA: 'Rodoviária / ferroviária (carga rolante)',
  GANCHO: 'Gancho / suspensa',
  TANQUE: 'Tanque, silo ou tremonha',
}
export const LISTA_RECEPTORES = Object.keys(RECEPTORES) as Receptor[]

/**
 * Tipos de balança para escolher no cadastro: sem os que o POP não cobre (`TIPOS_FORA_DO_POP`), a não ser o que a
 * balança já tem (`atual`, o tipo gravado; ausente no cadastro novo).
 */
export function tiposBalancaParaEscolher(atual?: TipoBalanca | null): TipoBalanca[] {
  return LISTA_TIPOS_BALANCA.filter((t) => !TIPOS_FORA_DO_POP.includes(t) || t === atual)
}

/**
 * Receptores para escolher no cadastro: o da carga rolante (rodoviária/ferroviária) só na balança que já o tem
 * (`atual`, o receptor gravado).
 */
export function receptoresParaEscolher(atual?: Receptor | null): Receptor[] {
  return LISTA_RECEPTORES.filter((r) => r !== 'RODOVIARIA' || r === atual)
}

/** Receptor mais comum para cada tipo de balança (sugestão ao cadastrar). */
export const RECEPTOR_DO_TIPO: Record<TipoBalanca, Receptor> = {
  COMPUTADORA: 'RETANGULAR',
  ETIQUETADORA: 'RETANGULAR',
  BALCAO: 'RETANGULAR',
  PLATAFORMA: 'RETANGULAR',
  PISO: 'RETANGULAR',
  RODOVIARIA: 'RODOVIARIA',
  FERROVIARIA: 'RODOVIARIA',
  ANALITICA: 'CIRCULAR',
  SEMIANALITICA: 'CIRCULAR',
  PRECISAO: 'RETANGULAR',
  CONTADORA: 'RETANGULAR',
  SUSPENSA: 'GANCHO',
  TRANSPALETEIRA: 'RETANGULAR',
  HOSPITALAR: 'RETANGULAR',
  CHECKOUT: 'RETANGULAR',
  OUTRA: 'RETANGULAR',
}

export const UNIDADES: Unidade[] = ['mg', 'g', 'kg', 't']
export const CLASSES: ClasseExatidao[] = ['I', 'II', 'III', 'IIII', '']
export const ROTULO_CLASSE: Record<ClasseExatidao, string> = {
  I: 'I (especial)',
  II: 'II (fina)',
  III: 'III (média)',
  IIII: 'IIII (ordinária)',
  '': 'Não marcada',
}
export const CLASSES_PESO: ClassePeso[] = ['E1', 'E2', 'F1', 'F2', 'M1', 'M1-2', 'M2', 'M2-3', 'M3']

export const TIPOS_FAIXAS: Record<TipoFaixas, string> = {
  UNICA: 'Faixa única',
  MULTI_INTERVALO: 'Multi-intervalo (d muda com a carga)',
  MULTIPLAS_FAIXAS: 'Múltiplas faixas',
}

/**
 * Para que a balança é usada: o cadastro não pede mais (1.0.5); só os certificados emitidos antes trazem a
 * "Finalidade de uso (*)" (`EmissaoCertificado.semFinalidadeEDimensoes`).
 */
export const FINALIDADES: Record<Exclude<Finalidade, ''>, string> = {
  COMERCIAL: 'Comercial (venda por peso)',
  PROCESSO: 'Processo / produção',
  LABORATORIO: 'Laboratório / controle de qualidade',
  SAUDE: 'Saúde',
}

export const TIPOS_PADRAO: Record<TipoPadrao, string> = {
  PESOS: 'Pesos padrão',
  TERMOHIGROMETRO: 'Termo-higrômetro',
  BAROMETRO: 'Barômetro',
  OUTRO: 'Outro instrumento',
}

export const STATUS_CALIBRACAO: Record<StatusCalibracao, { label: string; tom: Tone }> = {
  RASCUNHO: { label: 'Rascunho', tom: 'neutral' },
  REVISAO: { label: 'Aguardando autorização', tom: 'info' },
  EMITIDO: { label: 'Emitido', tom: 'success' },
  CANCELADO: { label: 'Cancelado', tom: 'danger' },
  SUBSTITUIDO: { label: 'Substituído', tom: 'warning' },
}

/** REVISAO com a revisão por outra pessoa desligada (`CalibracaoResumo.semAutorizacao`): ninguém autoriza. */
export const ROTULO_ENVIADA_PARA_REVISAO = 'Enviada para revisão'

/**
 * O nome da situação nas telas e na exportação: o de `STATUS_CALIBRACAO`, menos a REVISAO com a revisão por outra pessoa
 * desligada (`semAutorizacao`: "Enviada para revisão", não aguarda a autorização de ninguém).
 */
export function rotuloDaSituacao(status: StatusCalibracao, semAutorizacao?: boolean): string {
  return status === 'REVISAO' && semAutorizacao ? ROTULO_ENVIADA_PARA_REVISAO : STATUS_CALIBRACAO[status].label
}

export const LOCAIS: Record<LocalCalibracao, string> = {
  CLIENTE: 'Nas instalações do cliente',
  LABORATORIO: 'No laboratório da empresa',
}

export const AJUSTES: Record<AjusteRealizado, string> = {
  NAO: 'Não houve ajuste',
  INTERNO: 'Ajuste interno (automático)',
  EXTERNO: 'Ajuste externo, com peso',
}

/**
 * O que a etapa "Balança e ajuste" oferece numa calibração (POP 7.8): a calibração não inclui ajuste; só o ajuste
 * interno (função CAL) que o cliente faz antes dos ensaios, a rotina das analíticas e da classe I (POP 7.6 e 7.11).
 * O ajuste externo e as leituras "como encontrado" só existem nos registros de antes (`registroAnterior`).
 */
export const AJUSTES_DA_CALIBRACAO: ReadonlyArray<{ valor: Exclude<AjusteRealizado, 'EXTERNO'>; label: string }> = [
  { valor: 'NAO', label: 'Não houve ajuste' },
  { valor: 'INTERNO', label: 'Ajuste interno (CAL) antes dos ensaios' },
]

export const METODOS_CARREGAMENTO: Record<MetodoCarregamento, { label: string; descricao: string }> = {
  CRESCENTE_DECRESCENTE: {
    label: 'Crescente e decrescente',
    descricao: 'Sobe até Max e desce, sem zerar no meio. Mostra a histerese.',
  },
  DESCONTINUO: { label: 'Crescente com descarga', descricao: 'Descarrega entre um ponto e outro.' },
  CONTINUO: { label: 'Crescente contínuo', descricao: 'Sobe sem descarregar.' },
  DECRESCENTE: { label: 'Decrescente', descricao: 'Parte de Max e vai descarregando (tremonhas, silos).' },
}

/**
 * O rótulo do método do erro de indicação, o mesmo na tela e no passo 5 da folha (uma instrução: o método é fixo pela
 * classe, sem nada a marcar) e citado no POP (7.7).
 */
export const ROTULO_METODO_INDICACAO = 'Como aplicar as cargas'

/**
 * Métodos de carregamento de antes do método fixo pela classe: sem o "Decrescente", que não tem a subida (POP 7.7: a
 * subida é obrigatória), a não ser o que o ensaio já tem (`atual`, o de um registro de antes, só para conferência).
 * A tela da calibração não oferece mais a escolha: o método é o da classe (`metodoIndicacaoPadrao`).
 */
export function metodosCarregamentoParaEscolher(atual?: MetodoCarregamento | null): MetodoCarregamento[] {
  return (Object.keys(METODOS_CARREGAMENTO) as MetodoCarregamento[]).filter((m) => m !== 'DECRESCENTE' || m === atual)
}

export const METODOS_EXCENTRICIDADE: Record<MetodoExcentricidade, string> = {
  1: 'Zera e desloca a carga pelas posições',
  2: 'Tara com a carga no centro e desloca',
  3: 'Zera antes de cada posição',
  4: 'Volta ao centro entre as posições',
}

export const CRITERIOS_EMA: Record<CriterioEma, { label: string; descricao: string }> = {
  PORTARIA_SERVICO: {
    label: 'Portaria Inmetro 157/2022 — em serviço',
    descricao: 'Erros máximos admissíveis em serviço (dobro dos da verificação).',
  },
  PORTARIA_VERIFICACAO: {
    label: 'Portaria Inmetro 157/2022 — verificação',
    descricao: 'Erros máximos admissíveis da verificação inicial e subsequente.',
  },
  OIML_INICIAL: { label: 'OIML R76 — verificação inicial', descricao: '±0,5e, ±1e e ±1,5e conforme a carga.' },
  OIML_SERVICO: { label: 'OIML R76 — em serviço', descricao: 'Dobro dos erros da verificação inicial.' },
  CLIENTE: { label: 'Tolerância do cliente', descricao: 'Valor informado pelo cliente, igual em toda a faixa.' },
}

export const REGRAS_DECISAO: Record<RegraDecisao, { label: string; descricao: string }> = {
  BANDA_GUARDA: {
    label: 'Banda de guarda (|E| + U ≤ EMA)',
    descricao: 'Conforme só quando o erro somado à incerteza fica dentro do limite. Risco de aceitação indevida ≤ 2,5 %.',
  },
  SIMPLES: {
    label: 'Aceitação simples (|E| ≤ EMA)',
    descricao: 'Compara só o erro com o limite (risco compartilhado com o cliente, ILAC-G8).',
  },
}

// ---- Empresa, textos e configurações padrão -------------------------------------------

export const EMPRESA_PADRAO: DadosEmpresa = {
  nomeFantasia: 'Balanças.com',
  razaoSocial: 'FABIO DE GODOY LIMA LTDA',
  cnpj: '12.403.843/0001-18',
  inscricaoEstadual: '',
  endereco: 'Rua 13, nº 650, entre as Avenidas 9 e 11',
  bairro: 'Boa Morte',
  cidade: 'Rio Claro',
  uf: 'SP',
  cep: '13500-120',
  telefone: '(19) 3023-9050',
  email: 'recepcao@balancass.com',
  site: 'balancass.com',
}

/**
 * Textos fixos do certificado (ISO/IEC 17025, NIT-DICLA-021/030, Portaria Inmetro 157/2022).
 * {empresa} vira a razão social. Ver docs/pesquisa/01-normas-certificado.md, seção 6.
 */
export const TEXTOS_PADRAO: TextosCertificado = {
  procedimento: 'PT-CAL-01 rev. 0',
  // Curtos (certificado em 2 páginas): só o que a ISO/IEC 17025 (7.8.2.1 e 7.8.4.1) e a regulamentação pedem
  procedimentoDescricao:
    'Calibração por comparação direta com pesos padrão, conforme o EURAMET Calibration Guide No. 18 (versão 4.0, ' +
    '2015): repetibilidade, excentricidade e erro de indicação; incerteza de medição conforme o JCGM 100:2008.',
  rastreabilidade:
    'Os resultados desta calibração são metrologicamente rastreáveis ao Sistema Internacional de Unidades (SI) por meio ' +
    'dos padrões abaixo, calibrados por laboratório(s) acreditado(s) pela Cgcre/Inmetro para as respectivas calibrações.',
  incerteza:
    'A incerteza expandida de medição relatada (U) é declarada como a incerteza padrão de medição multiplicada pelo ' +
    'fator de abrangência k, o qual, para uma distribuição t com νeff graus de liberdade efetivos, corresponde a uma ' +
    'probabilidade de abrangência de aproximadamente 95 %.',
  abrangencia:
    'Os resultados referem-se exclusivamente ao instrumento calibrado, nas condições existentes no momento da ' +
    'calibração; a incerteza declarada não inclui efeitos de longo prazo (deriva), de transporte ou de reinstalação.',
  // Sai no rodapé de toda página, uma frase por linha, ao lado do endereço e dos contatos da empresa
  reproducao:
    'Este certificado somente pode ser reproduzido na íntegra. A reprodução parcial requer autorização prévia, por escrito.',
  naoAcreditado:
    'A {empresa} não é acreditada pela Coordenação-Geral de Acreditação do Inmetro (Cgcre). Esta calibração não foi ' +
    'realizada sob acreditação e este certificado não está abrangido pelos acordos de reconhecimento mútuo dos quais ' +
    'a Cgcre é signatária.',
  controleLegal:
    'Esta calibração não isenta o instrumento do controle metrológico legal: este certificado não substitui a ' +
    'verificação inicial, periódica ou após reparo realizada pelo Inmetro ou por órgão da RBMLQ-I (IPEM-SP), ' +
    'obrigatória nas finalidades previstas no art. 1º, § 1º, da Portaria Inmetro nº 157/2022, nem atesta a ' +
    'conformidade do instrumento ao Regulamento Técnico Metrológico.',
  // A ISO/IEC 17025 (7.8.4.3) só proíbe recomendar o intervalo sem acordo com o cliente: uma linha basta
  intervalo: 'Este certificado não contém recomendação de intervalo de calibração; a periodicidade é definida pelo usuário.',
  observacoesPadrao: '',
}

export const OPCOES_CALCULO_PADRAO: OpcoesCalculo = {
  empuxo: 'NAO_AJUSTADO',
  deltaTLocal: 0,
  deriva: 'EMA',
  kD: 1,
  excentricidade: true,
  metodoK: 'T_EXATO',
  zeroAprovado: false,
  histerese: 'SEPARADO',
  divisaoTeste: 0,
  conveccao: 'NAO_CONSIDERAR',
}

/**
 * Opções do cálculo para a classe da balança. Na classe I: empuxo pela densidade do ar medida (mantém 'AJUSTADO',
 * escolha deliberada de quem ajusta logo antes) e convecção calculada (R 76-1 A.4.1.1; cg-18 7.1.2.4). Nas demais
 * classes, as opções como vieram.
 */
export function opcoesDaClasse(o: OpcoesCalculo, classe: ClasseExatidao | null | undefined): OpcoesCalculo {
  if (classe !== 'I') return o
  return { ...o, empuxo: o.empuxo === 'AJUSTADO' || o.empuxo === 'MEDIDO' ? o.empuxo : 'MEDIDO', conveccao: 'CALCULAR' }
}

/**
 * A calibração segue o cálculo de antes da classe I? Sim no certificado emitido antes desta versão (gravado sem
 * `opcoes.conveccao`) e na revisão dele (`calculoLegado`, marcado pelo servidor). Ela mantém o cálculo e as
 * exigências da época: o "como encontrado" com as opções do ensaio final e sem as pendências novas da classe I
 * (empuxo, convecção, classe e uso dos jogos, termômetro do ΔT). Assim a revisão que só corrige o endereço sai com os
 * mesmos números e não pede um ΔT pesos − ar que nunca foi medido. Rascunho gravado antes desta versão não é legado:
 * ainda não foi emitido. Nem o certificado emitido com as regras do POP (`EmissaoCertificado.regrasDoPop`) a partir de
 * um rascunho da 1.0.1 que não foi regravado (as opções ainda sem a convecção): ele saiu com o cálculo de hoje.
 */
export function calculoLegado(k: {
  opcoes: Pick<OpcoesCalculo, 'conveccao'>
  calculoLegado?: boolean
  emissao?: unknown
}): boolean {
  if (k.calculoLegado === true) return true
  const emissao = k.emissao as { regrasDoPop?: boolean } | null | undefined
  return !!emissao && k.opcoes.conveccao === undefined && emissao.regrasDoPop !== true
}

/**
 * Os mínimos do POP (pontos, subida, leituras e ensaios da repetibilidade), as leituras fora do esperado e a balança
 * que não pesa corretamente ficam só como avisos (sem `EntradaCalculo.regrasDoPop`)? Sim no registro de antes da
 * classe I (`calculoLegado`), no "como encontrado" (registro anterior, antes do ajuste) e na revisão de um certificado
 * emitido antes dessas regras (a mesma visita: as leituras não podem ser refeitas). A revisão de um certificado emitido
 * com elas (`regrasDoPop`, marcada pelo servidor) as segue, como a calibração nova: são pendências.
 */
export function regrasDoPopComoAviso(
  k: Pick<CalibracaoInput, 'opcoes'> &
    Partial<Pick<CalibracaoInput, 'calculoLegado' | 'substituiId' | 'regrasDoPop'>> & { emissao?: unknown },
  momento: 'FINAL' | 'COMO_ENCONTRADO' = 'FINAL',
): boolean {
  return momento === 'COMO_ENCONTRADO' || calculoLegado(k) || (!!k.substituiId && k.regrasDoPop !== true)
}

/**
 * Os mínimos do POP ficam só como avisos? Sim onde todas as regras ficam (`regrasDoPopComoAviso`) e na calibração que
 * já tinha leituras quando o sistema passou a segui-las (`minimosComoAviso`, marcada pela migração 14, e a revisão do
 * certificado dela): a visita já aconteceu e as leituras não podem ser refeitas. Os mínimos: os 5 pontos, a subida, o
 * retorno ao zero, as leituras e os ensaios da repetibilidade, todas as posições da excentricidade e a dispensa dela
 * fora do gancho. A balança que não pesa corretamente, as leituras fora do esperado e o que se corrige no escritório
 * (cargas, pesos do ponto, padrões) continuam pendências: o certificado ainda não saiu.
 */
export function minimosDoPopComoAviso(
  k: Pick<CalibracaoInput, 'opcoes'> &
    Partial<Pick<CalibracaoInput, 'calculoLegado' | 'substituiId' | 'regrasDoPop' | 'minimosComoAviso'>> & {
      emissao?: unknown
    },
  momento: 'FINAL' | 'COMO_ENCONTRADO' = 'FINAL',
): boolean {
  return regrasDoPopComoAviso(k, momento) || k.minimosComoAviso === true
}

/** As opções da classe I diferem destas (o botão "Aplicar" da Conclusão)? Compara só empuxo e convecção. */
export function faltamOpcoesDaClasse(o: OpcoesCalculo, classe: ClasseExatidao | null | undefined): boolean {
  const certo = opcoesDaClasse(o, classe)
  return certo.empuxo !== o.empuxo || (certo.conveccao ?? 'NAO_CONSIDERAR') !== (o.conveccao ?? 'NAO_CONSIDERAR')
}

export const CONFIG_PADRAO: Configuracoes = {
  empresa: EMPRESA_PADRAO,
  textos: TEXTOS_PADRAO,
  numeracao: { formato: 'CC-{ano}-{seq}', digitos: 5 },
  opcoesPadrao: OPCOES_CALCULO_PADRAO,
  exigirRevisor: false,
  diasAvisoVencimento: 30,
  mesesProximaPadrao: 12,
  urlVerificacao: '',
  emailAssunto: 'Certificado de calibração {numero} — {empresa}',
  emailMensagem:
    'Olá,\n\nSegue em anexo o certificado de calibração nº {numero}, referente à balança {balanca}.\n\n' +
    '{assinaturaDigital}\n\nQualquer dúvida, estamos à disposição.\n\nAtenciosamente,\n{empresa}',
  lembreteAssunto: 'Calibração das balanças — {empresa}',
  lembreteMensagem:
    'Olá,\n\nA calibração das balanças abaixo está prevista para {data}:\n\n{balancas}\n\n' +
    'Podemos agendar a visita? Basta responder este e-mail ou nos chamar no telefone.\n\nAtenciosamente,\n{empresa}',
}

/** Troca {empresa} pela razão social nos textos fixos do certificado. */
export function textoComEmpresa(t: string, empresa: DadosEmpresa) {
  return t.replaceAll('{empresa}', empresa.razaoSocial || empresa.nomeFantasia)
}

/**
 * A mensagem padrão do e-mail do certificado até a 1.0.6, sem a marca {assinaturaDigital}. A configuração gravada com
 * ela, sem mudança, passa a ter a nova (migração 23 em server/db.ts); um texto mudado pela empresa fica como está, e a
 * tela do modelo sugere incluir a marca.
 */
export const EMAIL_MENSAGEM_ANTIGA =
  'Olá,\n\nSegue em anexo o certificado de calibração nº {numero}, referente à balança {balanca}.\n\n' +
  'Qualquer dúvida, estamos à disposição.\n\nAtenciosamente,\n{empresa}'

/**
 * As marcas que, vazias, somem com a linha: só a {assinaturaDigital} (1.0.7, vazia no certificado sem assinatura digital).
 * As outras saem como sempre (o texto de um modelo feito pela empresa continua o da 1.0.6, byte a byte).
 */
const MARCAS_QUE_SOMEM = new Set(['assinaturaDigital'])

/**
 * Troca as marcas {chave} de um modelo de texto (e-mail, lembrete) pelos valores; marcas desconhecidas ficam. A
 * {assinaturaDigital} vazia sozinha na linha some com a linha e com uma das linhas em branco em volta: o texto fica sem
 * buraco; no meio de uma frase, só a marca sai (sem o espaço que sobraria no fim da linha). As outras marcas, vazias ou
 * não, só são trocadas pelo valor (como até a 1.0.6).
 */
export function preencherModelo(t: string, valores: Record<string, string>) {
  const trocar = (s: string) => s.replace(/\{(\w+)\}/g, (marca, chave: string) => (chave in valores ? valores[chave] : marca))
  const vazia = (chave: string) => MARCAS_QUE_SOMEM.has(chave) && chave in valores && !valores[chave].trim()
  const linhas = t.split('\n')
  const saida: string[] = []
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    const marcas = [...linha.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
    if (!marcas.length) {
      saida.push(linha)
      continue
    }
    if (!linha.replace(/\{\w+\}/g, '').trim() && marcas.every(vazia)) {
      const anteriorEmBranco = !saida.length || !saida[saida.length - 1].trim()
      if (anteriorEmBranco && i + 1 < linhas.length && !linhas[i + 1].trim()) i++
      else if (anteriorEmBranco && i + 1 === linhas.length && saida.length) saida.pop()
      continue
    }
    const trocada = trocar(linha)
    saida.push(marcas.some(vazia) ? trocada.replace(/[ \t]+$/, '') : trocada)
  }
  return saida.join('\n')
}

// ---- Assinatura digital (certificado ICP-Brasil da empresa, 1.0.7) ------------------------------------

/** Onde conferir a assinatura digital: o validador oficial do ITI. */
export const VALIDADOR_ASSINATURA = 'validar.iti.gov.br'

/** O CNPJ do titular com a máscara (numérico ou alfanumérico); vazio = sem CNPJ. */
const cnpjDoTitular = (a: Pick<AssinaturaDigitalEmissao, 'cnpj'>) => (normalizarCnpj(a.cnpj ?? '') ? mascaraCnpj(a.cnpj) : '')

/**
 * O quadro da assinatura digital no certificado em PDF (server/pdf/certificado.ts, `blocoFinal`), em partes: o titular
 * em negrito; as partes `inteira` não se partem no fim da linha (o CNPJ, "ICP-Brasil (MP 2.200-2/2001)" e o endereço do
 * validador). `previa`: o aviso da prévia (que nunca é assinada) de que a emissão sairá assinada.
 *
 * CONGELADO: o texto do PDF assinado não pode mudar nem uma letra. O PDF assinado que sumir é remontado a partir dos dados
 * da emissão e só vale se o PDF de base sair idêntico (`PartesAssinaturaPdf.hashBase`). Um texto novo entra com uma marca
 * nova congelada na emissão, como as outras mudanças de layout.
 */
export function textoAssinaturaDigital(
  a: Pick<AssinaturaDigitalEmissao, 'titular' | 'cnpj'>,
  previa = false,
): Array<{ texto: string; negrito?: true; inteira?: true }> {
  const cnpj = cnpjDoTitular(a)
  const titular = [
    { texto: a.titular.trim(), negrito: true as const },
    ...(cnpj ? [{ texto: ', ' }, { texto: `CNPJ ${cnpj}`, inteira: true as const }] : []),
    { texto: ', com certificado digital ' },
  ]
  return previa
    ? [
        { texto: 'Na emissão, este certificado será assinado digitalmente por ' },
        ...titular,
        { texto: 'ICP-Brasil', inteira: true },
        { texto: '.' },
      ]
    : [
        { texto: 'Documento assinado digitalmente por ' },
        ...titular,
        { texto: 'ICP-Brasil (MP 2.200-2/2001)', inteira: true },
        { texto: '. Para conferir a assinatura, envie este PDF em ' },
        { texto: VALIDADOR_ASSINATURA, inteira: true },
        { texto: '.' },
      ]
}

/** O parágrafo da marca {assinaturaDigital} no e-mail do certificado assinado (o titular é a razão social da empresa). */
export function textoAssinaturaDigitalEmail(a: Pick<AssinaturaDigitalEmissao, 'titular'>): string {
  return (
    `O certificado está assinado digitalmente por ${a.titular.trim()} com certificado ICP-Brasil. Para conferir a ` +
    `assinatura, envie o PDF original (sem imprimir nem converter) em https://${VALIDADOR_ASSINATURA}. Se o Adobe Reader ` +
    // Os textos do Adobe Reader em português: a faixa amarela no alto e o painel de assinaturas
    'mostrar "Pelo menos uma assinatura apresenta problemas" ou "A validade da assinatura é DESCONHECIDA", isso não ' +
    'indica alteração: ele não traz por padrão a raiz ICP-Brasil para este tipo de certificado.'
  )
}

/**
 * O quadro da cópia de um certificado emitido para ser assinado digitalmente e cancelado ou substituído antes da assinatura
 * (o PDF assinado nunca existiu): a cópia não diz que foi assinada.
 */
export function textoNaoAssinadoDigitalmente(situacao: 'cancelado' | 'substituído'): string {
  return `Este certificado foi ${situacao} antes de ser assinado digitalmente: esta cópia não tem assinatura digital.`
}

/** A linha da verificação pública (GET /api/verificar/:codigo) de um certificado assinado digitalmente. */
export function textoAssinaturaDigitalVerificacao(a: Pick<AssinaturaDigitalEmissao, 'titular' | 'cnpj'>): string {
  const cnpj = cnpjDoTitular(a)
  return `Assinado digitalmente por ${a.titular.trim()}${cnpj ? ` (CNPJ ${cnpj})` : ''}, certificado ICP-Brasil`
}

/**
 * Número do certificado a partir do formato: {seq} (sequência com zeros), {ano} (4 dígitos), {aa} (2 dígitos).
 * `revisao` > 0 dá o sufixo "-R1", "-R2"… das revisões emitidas antes da 1.0.4 (a correção de hoje mantém o nº).
 */
export function formatarNumeroCertificado(
  numeracao: { formato: string; digitos: number },
  seq: number,
  ano: number,
  revisao = 0,
) {
  const formato = numeracao.formato.includes('{seq}') ? numeracao.formato : '{seq}/{ano}'
  const base = formato
    .replaceAll('{seq}', String(seq).padStart(Math.min(Math.max(numeracao.digitos, 1), 8), '0'))
    .replaceAll('{ano}', String(ano))
    .replaceAll('{aa}', String(ano).slice(-2))
  return revisao > 0 ? `${base}-R${revisao}` : base
}

/**
 * O ano e a sequência de um nº de certificado formatado (sem a revisão), pelo formato da numeração; sem o ano
 * no formato, `anoPadrao`. null se o nº não segue o formato.
 */
export function lerNumeroCertificado(
  numeracao: { formato: string; digitos: number },
  numero: string,
  anoPadrao: number,
): { ano: number; sequencia: number } | null {
  const formato = numeracao.formato.includes('{seq}') ? numeracao.formato : '{seq}/{ano}'
  const grupos = { '{seq}': '(\\d+)', '{ano}': '(\\d{4})', '{aa}': '(\\d{2})' } as const
  const pedacos = formato.split(/(\{seq\}|\{ano\}|\{aa\})/)
  const partes = pedacos.filter((p) => p in grupos).map((p) => p.slice(1, -1) as 'seq' | 'ano' | 'aa')
  const padrao = pedacos
    .map((p) => (p in grupos ? grupos[p as keyof typeof grupos] : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
  const m = new RegExp(`^${padrao}$`).exec(numero.trim())
  if (!m) return null
  const valor = (p: 'seq' | 'ano' | 'aa') => {
    const i = partes.indexOf(p)
    return i < 0 ? null : Number(m[i + 1])
  }
  const aa = valor('aa')
  const ano = valor('ano') ?? (aa !== null ? 2000 + aa : anoPadrao)
  const sequencia = valor('seq')
  return sequencia && sequencia > 0 && ano > 0 ? { ano, sequencia } : null
}

/** Nome de arquivo seguro a partir do número do certificado. */
export const nomeArquivoCertificado = (numero: string) =>
  `Certificado-${numero
    .replace(/[^0-9A-Za-z-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`

/**
 * Nome do PDF guardado na pasta dos certificados para a `versao` (1, 2…) de um nº. A correção com o mesmo nº não
 * fica no lugar do PDF da versão anterior: "Certificado-<nº>-versao-2.pdf". O download e o anexo do e-mail continuam
 * com `nomeArquivoCertificado` (o nº, sem a versão).
 */
export const nomeArquivoDaVersao = (numero: string, versao: number) =>
  versao > 1 ? nomeArquivoCertificado(numero).replace(/\.pdf$/, `-versao-${versao}.pdf`) : nomeArquivoCertificado(numero)

/**
 * O PDF guardado de um certificado emitido (dentro da pasta do ano): o da correção com o mesmo nº
 * (`EmissaoCertificado.mesmoNumero`) leva a versão, pelo contador interno (`revisao` + 1); os outros, o nº.
 */
export const nomeArquivoGuardado = (k: { numero: string; revisao: number; emissao?: { mesmoNumero?: boolean } | null }) =>
  k.emissao?.mesmoNumero ? nomeArquivoDaVersao(k.numero, k.revisao + 1) : nomeArquivoCertificado(k.numero)

// ---- Situações (validade de padrões e vencimento das balanças) ------------------------

export type SituacaoValidade = 'VALIDO' | 'VENCENDO' | 'VENCIDO' | 'SEM_DATA'

export function situacaoValidade(validade: string, hoje: string, diasAviso = 30): SituacaoValidade {
  if (!dataIsoValida(validade)) return 'SEM_DATA'
  const dias = diasEntre(hoje, validade)
  if (dias < 0) return 'VENCIDO'
  if (dias <= diasAviso) return 'VENCENDO'
  return 'VALIDO'
}

export const ROTULO_VALIDADE: Record<SituacaoValidade, { label: string; tom: Tone }> = {
  VALIDO: { label: 'Válido', tom: 'success' },
  VENCENDO: { label: 'Vence em breve', tom: 'warning' },
  VENCIDO: { label: 'Vencido', tom: 'danger' },
  SEM_DATA: { label: 'Sem data', tom: 'neutral' },
}

// ---- Descrições ---------------------------------------------------------------------------

/** "0,005" com vírgula, sem zeros sobrando; números grandes com espaço como separador de milhar. */
export function numeroBr(v: number, maxCasas = 6): string {
  if (!Number.isFinite(v)) return ''
  const s = v.toLocaleString('pt-BR', { maximumFractionDigits: maxCasas, useGrouping: false })
  const [int, dec] = s.split(',')
  const grupos = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return dec ? `${int.length > 4 ? grupos : int},${dec}` : int.length > 4 ? grupos : int
}

/** Capacidade em texto: "30 kg × 5 g", "15/30 kg × 2/5 g" (convertendo d para g quando fica mais legível). */
export function capacidadeTexto(b: Pick<Balanca, 'faixas' | 'unidade'>): string {
  if (!b.faixas.length) return ''
  const maxes = b.faixas.map((f) => numeroBr(f.max)).join('/')
  const ds = b.faixas.map((f) => f.d)
  const { valores, unidade } = divisaoLegivel(ds, b.unidade)
  return `${maxes} ${b.unidade} × ${valores.map((d) => numeroBr(d)).join('/')} ${unidade}`
}

/**
 * Converte uma massa de uma unidade para outra sem ruído binário (0,002 kg → 2 g; 6000 g → 6 kg).
 * Cada passo entre mg, g, kg e t é ×1000; o resultado sai com 12 algarismos significativos.
 */
export function converterMassa(valor: number, de: Unidade, para: Unidade): number {
  if (de === para || !Number.isFinite(valor)) return valor
  const passos = UNIDADES.indexOf(de) - UNIDADES.indexOf(para)
  const fator = 1000 ** Math.abs(passos)
  return Number((passos > 0 ? valor * fator : valor / fator).toPrecision(12))
}

/** Unidade em que e e d costumam vir na plaqueta para cada unidade da indicação (balança em kg → e = 5 g). */
export function unidadeDivisaoPadrao(unidade: Unidade): Unidade {
  return unidade === 't' ? 'kg' : unidade === 'kg' ? 'g' : unidade
}

/** Rodoviária ou ferroviária: o erro de indicação pode precisar de cargas de substituição. */
export const ehRodoviaria = (b: Pick<Balanca, 'receptor' | 'tipo'>) =>
  b.receptor === 'RODOVIARIA' || b.tipo === 'RODOVIARIA' || b.tipo === 'FERROVIARIA'

/** Tipos em que e e d vêm em kg na plaqueta mesmo com a indicação em kg (e = 0,5 a 50 kg). */
export const TIPOS_DIVISAO_EM_KG: readonly TipoBalanca[] = ['PISO', 'RODOVIARIA', 'FERROVIARIA', 'TRANSPALETEIRA']

/**
 * Tipos que não chegam a 1 t (balcão, precisão, analítica…). Neles, Max de 1 000 kg ou mais é quase certamente
 * a capacidade digitada em g com a coluna em kg (33 000 em vez de 33): a sugestão de e e d não passa para kg
 * (assim e = 10 g dá n absurdo e não grava) e `avisosBalanca` avisa.
 */
export const TIPOS_ATE_UMA_TONELADA: readonly TipoBalanca[] = [
  'COMPUTADORA',
  'ETIQUETADORA',
  'BALCAO',
  'ANALITICA',
  'SEMIANALITICA',
  'PRECISAO',
  'CONTADORA',
  'HOSPITALAR',
  'CHECKOUT',
]

/**
 * Unidade em que e e d costumam vir na plaqueta, pelo tipo e pela capacidade: com a indicação em kg, g nas
 * balanças pequenas (30 kg × 5 g) e kg nas de piso, rodoviárias e nas de 1 t ou mais (80 t × 20 kg), menos nos
 * tipos que não chegam a 1 t (`TIPOS_ATE_UMA_TONELADA`). `max`: a maior capacidade, na unidade da indicação.
 */
export function unidadeDivisaoSugerida(unidade: Unidade, tipo?: TipoBalanca, max = 0): Unidade {
  const grande = max >= 1000 && !(tipo && TIPOS_ATE_UMA_TONELADA.includes(tipo))
  if (unidade === 'kg' && ((tipo && TIPOS_DIVISAO_EM_KG.includes(tipo)) || grande)) return 'kg'
  return unidadeDivisaoPadrao(unidade)
}

/** Unidade mais legível para mostrar estes valores (os da divisão, da carga mínima…); sem valores, a padrão da divisão. */
export function unidadeLegivel(valores: number[], unidade: Unidade): Unidade {
  const positivos = valores.filter((v) => v > 0)
  return positivos.length ? divisaoLegivel(positivos, unidade).unidade : unidadeDivisaoPadrao(unidade)
}

/** Massa com a unidade mais legível: 0,04 kg → "40 g"; 400 kg → "400 kg". */
export function massaNaUnidadeLegivel(valor: number, unidade: Unidade): string {
  const { valores, unidade: u } = divisaoLegivel([valor], unidade)
  return `${numeroBr(valores[0])} ${u}`
}

/** A divisão em uma unidade menor quando fica mais legível (0,005 kg → 5 g). */
export function divisaoLegivel(ds: number[], unidade: Unidade): { valores: number[]; unidade: Unidade } {
  const fatores: Record<Unidade, number> = { mg: 1e-3, g: 1, kg: 1e3, t: 1e6 }
  const ordem: Unidade[] = ['t', 'kg', 'g', 'mg']
  const menor = Math.min(...ds)
  for (const u of ordem.slice(ordem.indexOf(unidade))) {
    const f = fatores[unidade] / fatores[u]
    if (menor * f >= 1 - 1e-9 || u === 'mg') return { valores: ds.map((d) => Number((d * f).toPrecision(12))), unidade: u }
  }
  return { valores: ds, unidade }
}

/** "Balança plataforma Toledo 2180 — 300 kg × 50 g" */
export function descricaoBalanca(b: Pick<Balanca, 'tipo' | 'fabricante' | 'modelo' | 'faixas' | 'unidade'>): string {
  const tipo = TIPOS_BALANCA[b.tipo]?.toLowerCase() ?? 'balança'
  const nome = [b.fabricante, b.modelo].filter(Boolean).join(' ')
  const cap = capacidadeTexto(b)
  return `Balança ${tipo}${nome ? ` ${nome}` : ''}${cap ? ` — ${cap}` : ''}`
}

/**
 * A balança no e-mail do certificado (a marca {balanca}): a descrição sem o "Balança" da frente, que o texto padrão já
 * diz ("referente à balança computadora (preço) Toledo Prix 4 Uno — 6/15/32 kg × 2/5/10 g"), e o nº de série.
 */
export function balancaNoEmail(
  b: Pick<Balanca, 'tipo' | 'fabricante' | 'modelo' | 'faixas' | 'unidade' | 'numeroSerie'>,
): string {
  return [descricaoBalanca(b).replace(/^Balança /, ''), b.numeroSerie && `nº de série ${b.numeroSerie}`]
    .filter(Boolean)
    .join(', ')
}

/** Aparelho com plaqueta própria além do principal, para mostrar ao lado da identificação da balança. */
export interface ParteSeparada {
  /** "Plataforma"; nas cópias congeladas dos certificados antigos, "Indicador" (ver `IndicadorLegado`). */
  rotulo: 'Plataforma' | 'Indicador'
  /** Fabricante e modelo. */
  nome: string
  serie: string
}

/**
 * Plataforma com plaqueta própria, quando cadastrada. Aceita também as cópias congeladas dos certificados
 * emitidos antes da troca (cadastro antigo): nelas o que ficava à parte era o indicador, e é assim que
 * continuam aparecendo, iguais ao certificado emitido.
 */
export function parteSeparada(
  b: Partial<Pick<Balanca, 'plataformaFabricante' | 'plataformaModelo' | 'plataformaSerie'>> & IndicadorLegado,
): ParteSeparada | null {
  const montar = (rotulo: ParteSeparada['rotulo'], fabricante?: string, modelo?: string, serie?: string) => {
    const nome = [fabricante, modelo]
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
      .join(' ')
    const s = typeof serie === 'string' ? serie.trim() : ''
    return nome || s ? { rotulo, nome, serie: s } : null
  }
  return (
    montar('Plataforma', b.plataformaFabricante, b.plataformaModelo, b.plataformaSerie) ??
    montar('Indicador', b.indicadorFabricante, b.indicadorModelo, b.indicadorSerie)
  )
}

/** Texto de busca da balança (coluna `busca` do banco): identificação, local e a plataforma. */
export function textoBuscaBalanca(
  b: Pick<
    Balanca,
    | 'fabricante'
    | 'modelo'
    | 'numeroSerie'
    | 'identificacao'
    | 'localInstalacao'
    | 'plataformaFabricante'
    | 'plataformaModelo'
    | 'plataformaSerie'
  >,
): string {
  return textoBusca(
    b.fabricante,
    b.modelo,
    b.numeroSerie,
    b.identificacao,
    b.localInstalacao,
    b.plataformaFabricante,
    b.plataformaModelo,
    b.plataformaSerie,
  )
}

/**
 * O texto da busca de uma calibração (a coluna `busca`): o nº, a OS, o cliente e a balança (a cópia congelada na
 * emissão ou o cadastro atual), sem acentos e em minúsculas.
 */
export function textoBuscaCalibracao(
  k: { numero: string; ordemServico: string },
  cliente: Partial<Pick<ClienteInput, 'nome' | 'razaoSocial' | 'documento'>> | null | undefined,
  balanca:
    | (Partial<
        Pick<
          Balanca,
          | 'fabricante'
          | 'modelo'
          | 'numeroSerie'
          | 'identificacao'
          | 'plataformaFabricante'
          | 'plataformaModelo'
          | 'plataformaSerie'
        >
      > &
        IndicadorLegado)
    | null
    | undefined,
): string {
  return textoBusca(
    k.numero,
    k.ordemServico,
    cliente?.nome,
    cliente?.razaoSocial,
    cliente?.documento,
    balanca?.fabricante,
    balanca?.modelo,
    balanca?.numeroSerie,
    balanca && parteSeparada(balanca)?.serie,
    balanca?.identificacao,
  )
}

/**
 * A inscrição estadual do cliente como sai no certificado ('' = não sai): a do cadastro, na calibração em andamento (a
 * emissão a imprime, se houver); no emitido, a da cópia congelada, só se ele saiu com ela (a partir da 1.0.5,
 * `inscricaoEstadualDoCliente`). As telas mostram esta, para quem confere ver o que o PDF traz.
 */
export function inscricaoEstadualNoCertificado(
  cliente: Pick<ClienteInput, 'inscricaoEstadual'> | null | undefined,
  emissao?: { inscricaoEstadualDoCliente?: boolean } | null,
): string {
  if (!cliente || (emissao && emissao.inscricaoEstadualDoCliente !== true)) return ''
  return (cliente.inscricaoEstadual ?? '').trim()
}

/** Endereço do cliente numa linha. */
export function enderecoCliente(
  c: Pick<ClienteInput, 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'cep'>,
) {
  const rua = [c.logradouro, c.numero].filter(Boolean).join(', ')
  const partes = [rua + (c.complemento ? ` – ${c.complemento}` : ''), c.bairro, [c.cidade, c.uf].filter(Boolean).join('/')]
  const linha = partes.filter(Boolean).join(' – ')
  return c.cep ? `${linha}${linha ? ' – ' : ''}CEP ${c.cep}` : linha
}

export function enderecoEmpresa(e: DadosEmpresa) {
  const partes = [e.endereco, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean)
  return `${partes.join(' – ')}${e.cep ? ` – CEP ${e.cep}` : ''}`
}

// ---- Termos que não podem aparecer no certificado ----------------------------------------

/**
 * Termos que induzem a erro num certificado de calibração não acreditado (docs/pesquisa/01, seção 8).
 * Usado para avisar no texto livre (observações e opiniões), sem bloquear.
 */
const TERMOS_SENSIVEIS: Array<{ padrao: RegExp; motivo: string }> = [
  { padrao: /\bafer(i|e)/i, motivo: '"Aferição" é termo antigo e impreciso: use "calibração".' },
  {
    padrao: /\bvalidade\b|\bv[aá]lid[oa]s? at[eé](?![\p{L}\p{N}])/iu,
    motivo: 'Certificado de calibração não tem validade (ISO/IEC 17025, 7.8.4.3).',
  },
  { padrao: /\brbc\b|rastre[aá]vel [aà] rbc/i, motivo: 'A empresa não é acreditada: não cite a RBC como se fosse dela.' },
  {
    padrao: /\bacreditad[oa]\b|\bcredenciad[oa]\b/i,
    motivo: 'Evite "acreditado" ou "credenciado": a empresa não é acreditada pela Cgcre.',
  },
  {
    padrao: /aprovad[oa] pelo inmetro|liberad[oa] para (o )?com[eé]rcio/i,
    motivo: 'Só o Inmetro/IPEM aprova ou libera o instrumento (verificação legal).',
  },
  {
    padrao: /\breprovad[oa]\b|\baprovad[oa]\b/i,
    motivo: '"Aprovado/reprovado" só com declaração de conformidade e regra de decisão.',
  },
  {
    padrao: /\btoler[aâ]ncia\b/i,
    motivo: 'Prefira "erro máximo admissível (EMA)" ou deixe claro que é a tolerância do cliente.',
  },
  { padrao: /\bautocalibra/i, motivo: 'Use "ajuste interno": calibração é a comparação com padrões.' },
]

export function termosSensiveis(t: string): string[] {
  if (!t) return []
  return TERMOS_SENSIVEIS.filter((x) => x.padrao.test(t)).map((x) => x.motivo)
}

// ---- Cliente --------------------------------------------------------------------------------

export const CLIENTE_VAZIO: ClienteInput = {
  tipo: 'PJ',
  nome: '',
  razaoSocial: '',
  documento: '',
  inscricaoEstadual: '',
  contato: '',
  telefone: '',
  celular: '',
  email: '',
  emailCertificados: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  situacaoCadastral: '',
  observacoes: '',
  ativo: true,
}

export function normalizarCliente(entrada: unknown): Resultado<ClienteInput> {
  const r = obj(entrada)
  const tipo = umDe(r.tipo, TIPOS_CLIENTE, 'PJ')
  const erros: string[] = []

  let documento = ''
  const bruto = texto(r.documento)
  const cnpj = tipo === 'PJ' ? normalizarCnpj(bruto) : ''
  const digitos = somenteDigitos(bruto)
  if (tipo === 'PJ' && cnpj) {
    documento = mascaraCnpj(cnpj)
    if (!cnpjValido(cnpj)) erros.push('CNPJ inválido. Confira o número digitado.')
  } else if (tipo === 'PF' && digitos) {
    documento = mascaraCpf(digitos)
    if (!cpfValido(digitos)) erros.push('CPF inválido. Confira os números digitados.')
  }

  const razaoSocial = tipo === 'PJ' ? texto(r.razaoSocial) : ''
  let nome = texto(r.nome)
  if (!nome && razaoSocial) nome = razaoSocial
  if (!nome) erros.push(tipo === 'PJ' ? 'Informe o nome ou a razão social.' : 'Informe o nome do cliente.')

  const email = texto(r.email).toLowerCase()
  if (email && !emailValido(email)) erros.push('E-mail inválido.')
  const emailsCert = listaEmails(texto(r.emailCertificados, 600))
  if (emailsCert.some((e) => !emailValido(e))) erros.push('Confira os e-mails que recebem os certificados.')

  const uf = texto(r.uf).toUpperCase()
  const cep = mascaraCep(texto(r.cep))
  if (cep && somenteDigitos(cep).length !== 8) erros.push('CEP deve ter 8 dígitos.')

  return {
    valor: {
      tipo,
      nome,
      razaoSocial,
      documento,
      inscricaoEstadual: tipo === 'PJ' ? texto(r.inscricaoEstadual, 30) : '',
      contato: texto(r.contato),
      telefone: texto(r.telefone, 40),
      celular: texto(r.celular, 40),
      email,
      emailCertificados: emailsCert.join(', '),
      cep,
      logradouro: texto(r.logradouro),
      numero: texto(r.numero, 30),
      complemento: texto(r.complemento),
      bairro: texto(r.bairro),
      cidade: texto(r.cidade),
      uf: UFS.includes(uf) ? uf : '',
      situacaoCadastral: tipo === 'PJ' ? texto(r.situacaoCadastral, 60).toUpperCase() : '',
      observacoes: multilinha(r.observacoes),
      ativo: booleano(r.ativo, true),
    },
    erros,
  }
}

// ---- Balança -----------------------------------------------------------------------------------

export const BALANCA_VAZIA: BalancaInput = {
  clienteId: '',
  tipo: 'PLATAFORMA',
  fabricante: '',
  modelo: '',
  numeroSerie: '',
  identificacao: '',
  plataformaFabricante: '',
  plataformaModelo: '',
  plataformaSerie: '',
  unidade: 'kg',
  tipoFaixas: 'UNICA',
  faixas: [{ max: 0, e: 0, d: 0 }],
  min: 0,
  classe: 'III',
  portariaAprovacao: '',
  receptor: 'RETANGULAR',
  apoios: 4,
  dimensoes: '',
  finalidade: '',
  localInstalacao: '',
  anoFabricacao: '',
  observacoes: '',
  ativo: true,
}

/** `true` quando o valor é 1, 2 ou 5 × 10^k (exigência para e e d). */
export function valor125(v: number): boolean {
  if (!(v > 0)) return false
  const exp = Math.floor(Math.log10(v))
  const m = Number((v / 10 ** exp).toPrecision(6))
  return m === 1 || m === 2 || m === 5
}

/**
 * Coerência das características metrológicas (avisos, não bloqueios: o certificado transcreve o que
 * está marcado no instrumento).
 */
/** Número de divisões n = Max/e de cada classe (Portaria Inmetro 157/2022, tabela 3). */
const LIMITES_N: Partial<Record<ClasseExatidao, [number, number]>> = {
  I: [50_000, Infinity],
  II: [100, 100_000],
  III: [100, 10_000],
  IIII: [100, 1_000],
}

/** n acima disto (10 vezes o máximo da classe) não é balança fora da classe: é e ou Max na unidade errada. */
const nAbsurdo = (classe: ClasseExatidao, n: number) => {
  const lim = LIMITES_N[classe]
  return !!lim && n > 10 * lim[1] + 1e-9
}

export function avisosBalanca(
  b: Pick<BalancaInput, 'faixas' | 'classe' | 'min' | 'tipoFaixas' | 'unidade'> & { tipo?: TipoBalanca },
): string[] {
  const avisos: string[] = []
  // Capacidade que o tipo não tem: o hábito de digitar em g (6000/15000/33000) com a coluna do Max em kg
  const maxKg = converterMassa(Math.max(0, ...b.faixas.map((f) => f.max)), b.unidade, 'kg')
  if (b.tipo && TIPOS_ATE_UMA_TONELADA.includes(b.tipo) && maxKg >= 1000) {
    const plaqueta = numeroBr(maxKg / 1000)
    avisos.push(
      `Max de ${numeroBr(maxKg)} kg numa balança ${TIPOS_BALANCA[b.tipo].toLowerCase()}? Se a plaqueta diz ${plaqueta} kg, digite ${plaqueta} com o Max em kg.`,
    )
  }
  const emMg = (v: number) => converterMassa(v, b.unidade, 'mg')
  b.faixas.forEach((f, i) => {
    const nome = b.faixas.length > 1 ? ` (faixa ${i + 1})` : ''
    // Classe I com d < 1 mg: e = 1 mg mesmo com d = 0,1 mg ou 0,01 mg (R 76-1 3.4.2, Tabela 5b)
    const classeIFina = b.classe === 'I' && emMg(f.d) < 1 - 1e-9 && Math.abs(emMg(f.e) - 1) < 1e-9
    if (f.e && f.d && (f.d > f.e + 1e-12 || (!classeIFina && f.e > 10 * f.d + 1e-12)))
      avisos.push(`O normal é d ≤ e ≤ 10·d${nome}.`)
    if (f.e && !valor125(f.e)) avisos.push(`A divisão de verificação e costuma ser 1, 2 ou 5 × 10ⁿ${nome}.`)
    if (f.d && !valor125(f.d)) avisos.push(`A divisão d costuma ser 1, 2 ou 5 × 10ⁿ${nome}.`)
    const n = f.e > 0 ? f.max / f.e : 0
    const lim = LIMITES_N[b.classe]
    // Classe I com d < 0,1 mg: n pode ser menor que 50 000 (R 76-1 3.4.4); não avisa pelo limite de baixo
    const semMinimo = b.classe === 'I' && emMg(f.d) < 0.1 - 1e-12
    // O n absurdo é erro (ver `errosUnidadeBalanca`), não aviso
    if (lim && n && !nAbsurdo(b.classe, n) && ((!semMinimo && n < lim[0] - 1e-9) || n > lim[1] + 1e-9))
      avisos.push(`n = Max/e = ${numeroBr(n, 0)} está fora do intervalo da classe ${b.classe}${nome}.`)
  })
  for (let i = 1; i < b.faixas.length; i++)
    if (b.faixas[i].max <= b.faixas[i - 1].max) avisos.push('As faixas devem estar em ordem crescente de capacidade.')
  return avisos
}

/**
 * Valores que só podem ser engano de unidade (ex.: e = 20 digitado em g numa balança de 80 t): impedem gravar,
 * porque iriam errados para o certificado. n = Max/e mais de 10 vezes acima do máximo da classe, e a carga
 * mínima menor que e ou não menor que Max. As mensagens falam "(e)" e "(Min)" para a tela marcar o campo.
 */
export function errosUnidadeBalanca(b: Pick<BalancaInput, 'faixas' | 'classe' | 'min'>): string[] {
  const erros: string[] = []
  b.faixas.forEach((f, i) => {
    const nome = b.faixas.length > 1 ? ` da faixa ${i + 1}` : ''
    const n = f.e > 0 && f.max > 0 ? f.max / f.e : 0
    if (nAbsurdo(b.classe, n))
      erros.push(
        `A divisão de verificação (e)${nome} dá n = Max/e = ${numeroBr(n, 0)}, mais de 10 vezes o máximo da classe ${b.classe} (${numeroBr(LIMITES_N[b.classe]![1], 0)}). Confira a unidade de e e d (g ou kg).`,
      )
  })
  const e1 = b.faixas[0]?.e ?? 0
  const maxTotal = Math.max(0, ...b.faixas.map((f) => f.max))
  if (b.min > 0 && e1 > 0 && b.min < e1 - 1e-12)
    erros.push('A carga mínima (Min) é menor que a divisão e. Confira a unidade do Min (g ou kg).')
  else if (b.min > 0 && maxTotal > 0 && b.min >= maxTotal)
    erros.push('A carga mínima (Min) precisa ser menor que a capacidade (Max). Confira a unidade do Min (g ou kg).')
  return erros
}

function normalizarFaixas(v: unknown, erros: string[]): Faixa[] {
  const lista = (Array.isArray(v) ? v : []).slice(0, LIMITES.faixas).map((f) => {
    const r = obj(f)
    return { max: positivo(r.max), e: positivo(r.e), d: positivo(r.d) }
  })
  if (!lista.length) lista.push({ max: 0, e: 0, d: 0 })
  lista.forEach((f, i) => {
    const nome = lista.length > 1 ? ` da faixa ${i + 1}` : ''
    if (!(f.max > 0)) erros.push(`Informe a capacidade máxima (Max)${nome}.`)
    if (!(f.d > 0)) erros.push(`Informe a divisão (d)${nome}.`)
    if (!(f.e > 0)) f.e = f.d
    if (f.max > 0 && f.d > 0 && f.d >= f.max) erros.push(`A divisão${nome} precisa ser menor que a capacidade.`)
  })
  return lista
}

/** Dados do indicador no cadastro antigo → lugar que passam a ocupar (principal) → para onde vai o que estava lá. */
const TROCA_INDICADOR = [
  ['indicadorFabricante', 'fabricante', 'plataformaFabricante'],
  ['indicadorModelo', 'modelo', 'plataformaModelo'],
  ['indicadorSerie', 'numeroSerie', 'plataformaSerie'],
] as const

/**
 * Cadastro antigo → atual. Antes, fabricante, modelo e nº de série eram os da plataforma e o indicador
 * separado ia nos campos `indicador*`; agora a balança é identificada pelo indicador (é o nº de série dele
 * que vale) e a plataforma é que fica à parte. A troca é feita em bloco: os dados do indicador passam para
 * a identificação principal (o fabricante, se faltar, continua o de antes) e a identificação de antes vai
 * para a plataforma. O nº de série é a exceção: sem o nº de série do indicador, o principal fica onde está,
 * porque a plataforma quase nunca tem nº de série próprio (o digitado ali era, na prática, o da plaqueta do
 * indicador) e a balança não pode ficar sem nº de série. Não há troca quando o indicador só repete a
 * identificação principal (os dados do indicador digitados nos dois lugares): aí não existe plataforma à
 * parte. Sem dados do indicador, ou com a plataforma já preenchida (formato novo), só tira as chaves antigas.
 * Serve às telas antigas ainda abertas, às cópias e à migração do banco.
 */
export function semIndicadorLegado<T extends object>(entrada: T): T {
  const r = { ...entrada } as Bruto
  const valor = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' ? String(v) : '')
  const igual = (a: unknown, b: unknown) => valor(a).toLowerCase() === valor(b).toLowerCase()
  const legado =
    TROCA_INDICADOR.some(([indicador]) => valor(r[indicador])) &&
    !TROCA_INDICADOR.some(([, , plataforma]) => valor(r[plataforma]))
  const repetido = TROCA_INDICADOR.every(([indicador, principal]) => !valor(r[indicador]) || igual(r[indicador], r[principal]))
  if (legado && !repetido) {
    const antes = { fabricante: r.fabricante ?? '', modelo: r.modelo ?? '', numeroSerie: r.numeroSerie ?? '' }
    for (const [indicador, principal, plataforma] of TROCA_INDICADOR) {
      if (principal === 'numeroSerie' && !valor(r[indicador])) {
        r[plataforma] = ''
        continue
      }
      r[plataforma] = antes[principal]
      r[principal] = valor(r[indicador]) ? r[indicador] : principal === 'fabricante' ? antes.fabricante : ''
    }
    // Dois aparelhos não têm o mesmo nº de série (nem, na prática, o mesmo modelo): é o do indicador repetido
    if (igual(r.plataformaSerie, r.numeroSerie)) r.plataformaSerie = ''
    if (igual(r.plataformaModelo, r.modelo)) r.plataformaModelo = ''
    // Só o fabricante não identifica plataforma nenhuma
    if (!valor(r.plataformaModelo) && !valor(r.plataformaSerie)) r.plataformaFabricante = ''
  }
  for (const [indicador, , plataforma] of TROCA_INDICADOR) {
    r[plataforma] ??= ''
    delete r[indicador]
  }
  return r as T
}

export function normalizarBalanca(entrada: unknown): Resultado<BalancaInput> {
  const r = semIndicadorLegado(obj(entrada))
  const erros: string[] = []
  const clienteId = texto(r.clienteId, 100)
  if (!clienteId) erros.push('Escolha o cliente dono da balança.')
  const tipoFaixas = umDe(r.tipoFaixas, ['UNICA', 'MULTI_INTERVALO', 'MULTIPLAS_FAIXAS'] as const, 'UNICA')
  let faixas = normalizarFaixas(r.faixas, erros)
  if (tipoFaixas === 'UNICA') faixas = faixas.slice(0, 1)
  else if (faixas.length < 2) erros.push('Balança multi-intervalo ou de múltiplas faixas precisa de pelo menos 2 faixas.')
  const receptor = umDe(r.receptor, LISTA_RECEPTORES, 'RETANGULAR')
  const finalidade = umDe(r.finalidade, ['COMERCIAL', 'PROCESSO', 'LABORATORIO', 'SAUDE', ''] as const, '')
  const classe = umDe(r.classe, CLASSES, '')
  const min = positivo(r.min)
  erros.push(...errosUnidadeBalanca({ faixas, classe, min }))
  return {
    valor: {
      clienteId,
      tipo: umDe(r.tipo, LISTA_TIPOS_BALANCA, 'PLATAFORMA'),
      fabricante: texto(r.fabricante, 80),
      modelo: texto(r.modelo, 80),
      numeroSerie: texto(r.numeroSerie, 80),
      identificacao: texto(r.identificacao, 80),
      plataformaFabricante: texto(r.plataformaFabricante, 80),
      plataformaModelo: texto(r.plataformaModelo, 80),
      plataformaSerie: texto(r.plataformaSerie, 80),
      unidade: umDe(r.unidade, UNIDADES, 'kg'),
      tipoFaixas,
      faixas,
      min,
      classe,
      portariaAprovacao: texto(r.portariaAprovacao, LIMITES.portariaAprovacao),
      receptor,
      apoios: inteiro(r.apoios, 64, 0) || (receptor === 'RETANGULAR' ? 4 : 0),
      dimensoes: texto(r.dimensoes, 60),
      finalidade,
      localInstalacao: texto(r.localInstalacao, LIMITES.localInstalacao),
      anoFabricacao: texto(r.anoFabricacao, 10),
      observacoes: multilinha(r.observacoes),
      ativo: booleano(r.ativo, true),
    },
    erros,
  }
}

// ---- Padrão -------------------------------------------------------------------------------------

export const PADRAO_VAZIO: PadraoInput = {
  tipo: 'PESOS',
  identificacao: '',
  descricao: '',
  fabricante: '',
  modelo: '',
  numeroSerie: '',
  classe: 'M1',
  material: 'Aço inoxidável',
  densidade: 0,
  incertezaDensidade: 0,
  uso: 'CERTIFICADO',
  pesos: [],
  certificado: '',
  laboratorio: '',
  acreditacao: '',
  dataCalibracao: '',
  validade: '',
  incertezaTexto: '',
  observacoes: '',
  ativo: true,
  certificadoArquivo: null,
}

// Faixa física da densidade dos pesos (a mesma que o motor confere no empuxo pela densidade do ar medida)
export { DENSIDADE_PESOS_KG_M3, densidadePesosPlausivel }
export const textoDensidadeImplausivel = (rho: number) =>
  `Densidade de ${numeroBr(rho)} kg/m³ fora da faixa dos pesos (2 000 a 22 000 kg/m³): confira a unidade (7,95 g/cm³ = 7 950 kg/m³).`

/**
 * `densidadeGravada`: a densidade que o cadastro já tem. Gravada antes da conferência da unidade (7,85 em vez de
 * 7 850), ela não impede gravar o resto (nem desativar o padrão): só a densidade nova é conferida. O uso dela no
 * empuxo pela densidade do ar medida fica bloqueado pela pendência do cálculo.
 */
export function normalizarPadrao(entrada: unknown, opcoes: { densidadeGravada?: number } = {}): Resultado<PadraoInput> {
  const r = obj(entrada)
  const erros: string[] = []
  const tipo = umDe(r.tipo, Object.keys(TIPOS_PADRAO) as TipoPadrao[], 'PESOS')
  const identificacao = texto(r.identificacao, 40)
  if (!identificacao) erros.push('Informe o código de identificação do padrão (ex.: JP-01).')
  const pesos: PesoPadrao[] =
    tipo !== 'PESOS'
      ? []
      : (Array.isArray(r.pesos) ? r.pesos : []).slice(0, LIMITES.pesos).map((p) => {
          const x = obj(p)
          const nominal = positivo(x.nominal)
          const k = positivo(x.k)
          return {
            id: texto(x.id, 100) || novoId(),
            marca: texto(x.marca, 40),
            nominal,
            correcao: Number.isNaN(numero(x.correcao)) ? 0 : numero(x.correcao),
            incerteza: positivo(x.incerteza),
            k: k > 0 ? k : 2,
          }
        })
  if (tipo === 'PESOS') {
    if (!pesos.length) erros.push('Cadastre as peças do jogo de pesos (valor nominal de cada uma).')
    if (pesos.some((p) => !(p.nominal > 0))) erros.push('Toda peça precisa do valor nominal.')
  }
  const densidade = positivo(r.densidade)
  if (tipo === 'PESOS' && densidade > 0 && !densidadePesosPlausivel(densidade) && densidade !== opcoes.densidadeGravada)
    erros.push(textoDensidadeImplausivel(densidade))
  const uso: UsoPesos = umDe(r.uso, ['CERTIFICADO', 'NOMINAL'] as const, 'CERTIFICADO')
  const validade = data(r.validade)
  if (r.validade && !validade) erros.push('Data da próxima calibração do padrão inválida.')
  const dataCalibracao = data(r.dataCalibracao)
  if (validade && dataCalibracao && validade < dataCalibracao)
    erros.push('A próxima calibração do padrão precisa ser depois da data da calibração.')
  return {
    valor: {
      tipo,
      identificacao,
      descricao: texto(r.descricao, LIMITES.descricaoPadrao),
      fabricante: texto(r.fabricante, 80),
      modelo: texto(r.modelo, 80),
      numeroSerie: texto(r.numeroSerie, 80),
      classe: tipo === 'PESOS' ? umDe(r.classe, ['', ...CLASSES_PESO] as const, '') : '',
      material: texto(r.material, 60),
      densidade,
      incertezaDensidade: tipo === 'PESOS' ? positivo(r.incertezaDensidade) : 0,
      uso,
      pesos: pesos.sort((a, b) => b.nominal - a.nominal),
      certificado: texto(r.certificado, 80),
      laboratorio: texto(r.laboratorio, LIMITES.laboratorio),
      acreditacao: texto(r.acreditacao, 40),
      dataCalibracao,
      validade,
      incertezaTexto: texto(r.incertezaTexto, 200),
      observacoes: multilinha(r.observacoes),
      ativo: booleano(r.ativo, true),
      // O servidor confere se o arquivo existe e completa o tamanho e o tipo (ver Repositorio). Sem o campo
      // (uma tela de antes desta versão), undefined: a alteração mantém o arquivo que já estava
      certificadoArquivo: r.certificadoArquivo === undefined ? undefined : normalizarArquivoAnexo(r.certificadoArquivo),
    },
    erros,
  }
}

/** Nº de certificado para comparar: sem espaços e em maiúsculas ("lab-0456/2026 " é o mesmo que "LAB-0456/2026"). */
export const chaveCertificado = (c: string) => c.replace(/\s+/g, '').toUpperCase()

/**
 * O arquivo do certificado do padrão ficou o do certificado anterior: o nº do certificado mudou (o padrão foi
 * calibrado de novo) e o arquivo é o mesmo. Iria ao cliente com o nº novo. Preencher um nº que estava vazio,
 * apagar o nº ou mudar só espaços e maiúsculas não conta.
 */
export function arquivoDoCertificadoAnterior(
  antes: { certificado: string; certificadoArquivo?: { sha256: string } | null },
  depois: { certificado: string; sha256: string | null | undefined },
): boolean {
  const [a, b] = [chaveCertificado(antes.certificado), chaveCertificado(depois.certificado)]
  return !!a && !!b && a !== b && !!antes.certificadoArquivo && depois.sha256 === antes.certificadoArquivo.sha256
}

/**
 * O arquivo que o cadastro do padrão tem para um nº de certificado: o atual, se for o mesmo nº; senão, o
 * guardado quando o nº mudou (`certificadosAnteriores`). null = o cadastro não tem arquivo desse certificado.
 */
export function arquivoDoCertificado(
  p: Pick<Padrao, 'certificado' | 'certificadoArquivo' | 'certificadosAnteriores'>,
  certificado: string,
): ArquivoAnexo | null {
  const chave = chaveCertificado(certificado)
  if (!chave) return null
  if (chaveCertificado(p.certificado) === chave) return p.certificadoArquivo ?? null
  return (p.certificadosAnteriores ?? []).find((h) => chaveCertificado(h.certificado) === chave)?.arquivo ?? null
}

/** Quantos certificados anteriores (com arquivo) o cadastro de um padrão guarda. */
export const MAX_CERTIFICADOS_ANTERIORES = 30

/**
 * `certificadosAnteriores` depois de uma alteração do padrão: quando o nº muda, o arquivo do nº de antes entra
 * no começo (no lugar de um registro antigo do mesmo nº).
 */
export function certificadosAnterioresApos(
  antes: Pick<Padrao, 'certificado' | 'certificadoArquivo' | 'certificadosAnteriores'>,
  certificadoNovo: string,
): Array<{ certificado: string; arquivo: ArquivoAnexo }> {
  const lista = antes.certificadosAnteriores ?? []
  const chave = chaveCertificado(antes.certificado)
  if (!chave || !antes.certificadoArquivo || chave === chaveCertificado(certificadoNovo)) return lista
  return [
    { certificado: antes.certificado, arquivo: antes.certificadoArquivo },
    ...lista.filter((h) => chaveCertificado(h.certificado) !== chave),
  ].slice(0, MAX_CERTIFICADOS_ANTERIORES)
}

/** Quantas versões anteriores (os dados de cada certificado) o cadastro de um padrão guarda. */
export const MAX_VERSOES_ANTERIORES = 30

/** Os dados do certificado atual do padrão (o que `versoesAnteriores` guarda). */
export function versaoDoPadrao(p: Padrao): VersaoPadrao {
  return {
    certificado: p.certificado,
    laboratorio: p.laboratorio,
    acreditacao: p.acreditacao,
    dataCalibracao: p.dataCalibracao,
    validade: p.validade,
    classe: p.classe,
    material: p.material,
    densidade: p.densidade,
    ...(p.incertezaDensidade !== undefined ? { incertezaDensidade: p.incertezaDensidade } : {}),
    uso: p.uso,
    pesos: p.pesos,
    incertezaTexto: p.incertezaTexto,
    certificadoArquivo: p.certificadoArquivo ?? null,
  }
}

/**
 * `versoesAnteriores` depois de uma alteração do padrão: quando o nº do certificado muda (o padrão foi calibrado de
 * novo), os dados do certificado de antes entram no começo (no lugar de uma versão antiga do mesmo nº, e sem uma do
 * nº novo). Preencher um nº que estava vazio ou mudar só espaços e maiúsculas não conta.
 */
export function versoesAnterioresApos(antes: Padrao, certificadoNovo: string): VersaoPadrao[] {
  const lista = antes.versoesAnteriores ?? []
  const [chave, nova] = [chaveCertificado(antes.certificado), chaveCertificado(certificadoNovo)]
  if (!chave || chave === nova) return lista
  return [
    versaoDoPadrao(antes),
    ...lista.filter((v) => chaveCertificado(v.certificado) !== chave && chaveCertificado(v.certificado) !== nova),
  ].slice(0, MAX_VERSOES_ANTERIORES)
}

/**
 * O padrão como estava na data de uma calibração: o cadastro de hoje, se ele foi calibrado até essa data; senão, a
 * versão anterior mais nova calibrada até ela (`versoesAnteriores`: o certificado, as datas e os valores das peças),
 * com o resto do cadastro de hoje (identificação, descrição, situação). Sem nenhuma, o de hoje (calibrado depois da
 * calibração: a pendência de `pendenciasEmissao` bloqueia a emissão). A versão trocada depois por um certificado
 * mais antigo ou do mesmo dia não conta: foi a correção de um certificado digitado errado, que nunca valeu.
 */
export function padraoNaData(p: Padrao, data: string): Padrao {
  if (!dataIsoValida(data) || !dataIsoValida(p.dataCalibracao) || p.dataCalibracao <= data) return p
  let versao: VersaoPadrao | undefined
  // Da mais nova para a mais antiga: cada versão de verdade foi calibrada antes de todas as que vieram depois dela
  let seguinte = p.dataCalibracao
  for (const v of p.versoesAnteriores ?? []) {
    if (!dataIsoValida(v.dataCalibracao)) continue
    if (v.dataCalibracao >= seguinte) continue
    seguinte = v.dataCalibracao
    if (v.dataCalibracao <= data && (!versao || v.dataCalibracao > versao.dataCalibracao)) versao = v
  }
  return versao
    ? { ...p, ...versao, incertezaDensidade: versao.incertezaDensidade, certificadoArquivo: versao.certificadoArquivo ?? null }
    : p
}

/**
 * Os padrões de uma calibração (`padroesIds`), cada um como vale para ela. Na revisão, o congelado na emissão do
 * certificado que ela substitui (`padroesCongelados`), mesmo desativado depois (é a mesma visita); o cadastro de hoje
 * só quando ele ainda é o mesmo certificado (nº e data: a correção de um dado digitado errado). Nos demais (e no
 * padrão incluído na revisão), o cadastro na data da calibração (`padraoNaData`). `cadastro`: o padrão de hoje pelo
 * id (undefined: não existe, ou não está entre os carregados).
 */
export function padroesDaCalibracao(
  k: Pick<CalibracaoInput, 'padroesIds' | 'dataCalibracao'> & { padroesCongelados?: Padrao[] },
  cadastro: (id: string) => Padrao | undefined,
): Padrao[] {
  const out: Padrao[] = []
  for (const id of k.padroesIds) {
    const atual = cadastro(id)
    const congelado = k.padroesCongelados?.find((p) => p.id === id)
    if (congelado) {
      const mesmoCertificado =
        !!atual &&
        chaveCertificado(atual.certificado) === chaveCertificado(congelado.certificado) &&
        atual.dataCalibracao === congelado.dataCalibracao
      out.push({ ...(mesmoCertificado ? atual : congelado), ativo: true })
    } else if (atual) out.push(padraoNaData(atual, k.dataCalibracao))
  }
  return out
}

/** Resumo das peças de um jogo: "1 × 10 kg, 4 × 5 kg, 2 × 2 kg". */
export function resumoPesos(pesos: PesoPadrao[]): string {
  const grupos = new Map<number, number>()
  for (const p of pesos) grupos.set(p.nominal, (grupos.get(p.nominal) ?? 0) + 1)
  return [...grupos.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([g, n]) => `${n} × ${massaLegivel(g)}`)
    .join(', ')
}

/** 0,5 g → "500 mg"; 1500 g → "1,5 kg"; 2 000 000 g → "2 t". */
export function massaLegivel(gramas: number): string {
  if (gramas >= 1e6) return `${numeroBr(gramas / 1e6)} t`
  if (gramas >= 1000) return `${numeroBr(gramas / 1000)} kg`
  if (gramas >= 1) return `${numeroBr(gramas)} g`
  return `${numeroBr(gramas * 1000)} mg`
}

export const totalPesos = (pesos: PesoPadrao[]) => pesos.reduce((s, p) => s + p.nominal, 0)

// ---- Calibração ----------------------------------------------------------------------------------

export const AMBIENTE_VAZIO: CondicoesAmbientais = {
  temperaturaInicial: null,
  temperaturaFinal: null,
  umidadeInicial: null,
  umidadeFinal: null,
  pressao: null,
  deltaTPesos: null,
  aclimatacao: null,
}

export const EXCENTRICIDADE_VAZIA: EnsaioExcentricidade = {
  aplicavel: true,
  motivo: '',
  carga: 0,
  metodo: 1,
  posicoes: [],
}

/**
 * Método da excentricidade de uma balança sem calibração anterior: o 1 ("zera e desloca"); na classe I, o 3 ("zera
 * antes de cada posição", POP 7.10).
 */
export const metodoExcentricidadePadrao = (classe: ClasseExatidao | null | undefined): MetodoExcentricidade =>
  classe === 'I' ? 3 : 1

/**
 * Como as cargas do erro de indicação são aplicadas numa balança sem calibração anterior: "crescente e
 * decrescente" (POP 7.7); na classe I, "crescente com descarga", porque cada carga é montada com o menor número de
 * peças (de 50 g + 5 g passa a 100 g + 10 g) e só se aplica a partir do zero.
 */
export const metodoIndicacaoPadrao = (classe: ClasseExatidao | null | undefined): MetodoCarregamento =>
  classe === 'I' ? 'DESCONTINUO' : 'CRESCENTE_DECRESCENTE'

/**
 * O método da excentricidade é fixo pela classe (POP 7.10: 1 nas classes II, III, IIII e sem classe; 3 na classe I).
 * Outro método só num registro de antes (ou numa balança que trocou de classe depois de ensaiada): `true`.
 */
export const metodoExcentricidadeForaDoPop = (metodo: MetodoExcentricidade, classe: ClasseExatidao | null | undefined): boolean =>
  metodo !== metodoExcentricidadePadrao(classe)

/** O ensaio de excentricidade já tem alguma leitura (da posição ou do zero/centro antes)? */
export const temLeiturasExcentricidade = (e: Pick<EnsaioExcentricidade, 'posicoes'>): boolean =>
  e.posicoes.some((p) => p.leitura !== null || p.referencia !== null)

/**
 * Como as cargas do erro de indicação são aplicadas é fixo pela classe (POP 7.7: "crescente e decrescente" nas classes
 * II, III, IIII e sem classe; "crescente com descarga" na classe I; `metodoIndicacaoPadrao`). Outro método só no ensaio
 * medido antes dessa regra (o "crescente contínuo" que a tela deixava escolher, o "Decrescente" de um registro de antes)
 * ou numa balança que trocou de classe depois de ensaiada: `true`.
 */
export const metodoIndicacaoForaDoPop = (metodo: MetodoCarregamento, classe: ClasseExatidao | null | undefined): boolean =>
  metodo !== metodoIndicacaoPadrao(classe)

/**
 * O erro de indicação já tem leitura de alguma carga (a subida ou a descida de um ponto com carga, ou uma etapa de
 * substituição)? O zero e o retorno ao zero não contam: são os mesmos em todo método (os pontos sugeridos já vêm com o
 * zero lido). Uma leitura na coluna que o método esconde também conta: ela existe.
 */
export const temLeiturasDeCarga = (e: Pick<EnsaioIndicacao, 'pontos' | 'substituicao'>): boolean =>
  e.pontos.some((p) => p.carga > 0 && (p.crescente !== null || p.decrescente !== null)) ||
  e.substituicao.etapas.some((x) => x.leituraPadroes !== null || x.leituraSubstituicao !== null)

/**
 * O método gravado do erro de indicação é o da visita, mesmo sem leitura de carga digitada: a calibração começada antes
 * de o método ser fixo pela classe (1.0.4) e já medida ou com a folha de campo impressa (`descidaComoAviso`, migração
 * 16: a folha de antes trazia o método do rascunho) ou medida antes das regras do POP (`minimosDoPopComoAviso`). O
 * sistema não o troca sozinho pelo da classe: a etapa mostra o aviso e "Usar o método do POP", e a folha o imprime.
 */
export function metodoIndicacaoDaVisita(
  k: Pick<CalibracaoInput, 'opcoes'> &
    Partial<Pick<CalibracaoInput, 'calculoLegado' | 'substituiId' | 'regrasDoPop' | 'minimosComoAviso' | 'descidaComoAviso'>> & {
      emissao?: unknown
    },
): boolean {
  return k.descidaComoAviso === true || minimosDoPopComoAviso(k)
}

/**
 * O erro de indicação com o método da classe (`metodoIndicacaoPadrao`) enquanto não tem leitura de carga
 * (`temLeiturasDeCarga`): o rascunho com outro método, ainda sem leituras, e a classe da balança trocada antes das
 * leituras. Com leituras, fica o método com que foi medido; `daVisita` (`metodoIndicacaoDaVisita`), também sem elas.
 * Já com o método da classe, o mesmo ensaio (nada a gravar).
 */
export function comMetodoIndicacaoDaClasse<T extends Pick<EnsaioIndicacao, 'metodo' | 'pontos' | 'substituicao'>>(
  e: T,
  classe: ClasseExatidao | null | undefined,
  daVisita = false,
): T {
  const metodo = metodoIndicacaoPadrao(classe)
  return e.metodo === metodo || daVisita || temLeiturasDeCarga(e) ? e : { ...e, metodo }
}

/**
 * O "crescente e decrescente" tem uma carga lida na subida e sem a descida (POP 7.7)? A maior carga lida não conta (é a
 * virada, com uma leitura só), nem o zero (a descida dele é o retorno ao zero) e nem o ensaio com substituição (as cargas
 * só sobem): como a pendência do cálculo. Para o servidor marcar o que foi medido antes de a descida ser obrigatória.
 */
export function temCargaSemDescida(e: Pick<EnsaioIndicacao, 'metodo' | 'pontos' | 'substituicao'> | null | undefined): boolean {
  if (!e || e.metodo !== 'CRESCENTE_DECRESCENTE' || e.substituicao.ativa) return false
  const lida = (v: number | null) => typeof v === 'number' && Number.isFinite(v)
  const subidas = e.pontos.filter((p) => p.carga > 0 && lida(p.crescente))
  const maior = Math.max(0, ...e.pontos.filter((p) => lida(p.crescente) || lida(p.decrescente)).map((p) => p.carga))
  return subidas.some((p) => p.carga < maior && !lida(p.decrescente))
}

/**
 * O erro de indicação tem carga lida e nenhuma leitura do zero (o ponto sem carga, sem a linha ou com ela em branco)?
 * Como a pendência do cálculo (POP 7.7, desde a 1.0.6). Para o servidor marcar o que foi medido antes de a leitura do
 * zero ser obrigatória (`Calibracao.zeroComoAviso`).
 */
export function temCargasSemZero(e: Pick<EnsaioIndicacao, 'pontos'> | null | undefined): boolean {
  if (!e) return false
  const lido = (p: { crescente: number | null; decrescente: number | null }) =>
    [p.crescente, p.decrescente].some((v) => typeof v === 'number' && Number.isFinite(v))
  return e.pontos.some((p) => p.carga > 0 && lido(p)) && !e.pontos.some((p) => !(p.carga > 0) && lido(p))
}

/**
 * O ensaio "como encontrado" tem alguma leitura? A tela de antes criava um vazio ao escolher um ajuste; vazio, ele
 * não entra no cálculo nem no certificado.
 */
export function temLeiturasComoEncontrado(e: EnsaioIndicacao | null | undefined): boolean {
  return (
    !!e &&
    (e.retornoZero !== null ||
      e.pontos.some((p) => p.crescente !== null || p.decrescente !== null) ||
      e.substituicao.etapas.some((x) => x.leituraPadroes !== null || x.leituraSubstituicao !== null))
  )
}

/** Itens da verificação preliminar como a tela os resume (o certificado tem os dele). */
export const ROTULOS_PRELIMINAR: Record<Exclude<keyof CalibracaoInput['preliminar'], 'zeroAutomatico'>, string> = {
  identificavel: 'balança identificada',
  limpa: 'limpa',
  nivelada: 'nivelada',
  aquecida: 'ligada e aquecida',
  preCarga: 'pré-carga aplicada',
}

/**
 * Dados de um registro de antes do POP de calibração (rascunho ou revisão de certificado gravados por uma versão
 * anterior): o ajuste externo, as leituras "como encontrado", o reparo e a verificação preliminar com item "não".
 * A calibração nova não os registra (POP 7 e 7.8: sem ajuste nem reparo durante a calibração; as verificações
 * preliminares não são registradas); no registro antigo eles ficam como estão, só para conferência, e saem no
 * certificado como antes.
 */
export interface RegistroAnterior {
  /** Ajuste externo, com peso. */
  ajusteExterno: boolean
  /** Leituras "como encontrado" (com ajuste). */
  comoEncontrado: boolean
  reparo: boolean
  /** Itens da verificação preliminar "não" (`ROTULOS_PRELIMINAR`); vazio = nenhum. */
  preliminar: string[]
}

/** O que a calibração tem de antes do POP (`RegistroAnterior`); null = nada. */
export function registroAnterior(
  k: Pick<CalibracaoInput, 'ajuste' | 'comoEncontrado' | 'reparo' | 'preliminar'>,
): RegistroAnterior | null {
  const r: RegistroAnterior = {
    ajusteExterno: k.ajuste.realizado === 'EXTERNO',
    comoEncontrado: k.ajuste.realizado !== 'NAO' && temLeiturasComoEncontrado(k.comoEncontrado),
    reparo: k.reparo.houve,
    preliminar: (Object.keys(ROTULOS_PRELIMINAR) as Array<keyof typeof ROTULOS_PRELIMINAR>)
      .filter((c) => k.preliminar[c] === 'NAO')
      .map((c) => ROTULOS_PRELIMINAR[c]),
  }
  return r.ajusteExterno || r.comoEncontrado || r.reparo || r.preliminar.length ? r : null
}

/**
 * A calibração sem os dados de antes do POP (`registroAnterior`), como uma calibração nova: sem o ajuste externo
 * (o interno continua), sem o "como encontrado", sem o reparo e com a verificação preliminar padrão.
 */
export function semRegistroAnterior<T extends Pick<CalibracaoInput, 'ajuste' | 'comoEncontrado' | 'reparo' | 'preliminar'>>(
  k: T,
): T {
  const vazia = calibracaoVazia()
  return {
    ...k,
    ajuste: k.ajuste.realizado === 'EXTERNO' ? { ...vazia.ajuste } : k.ajuste,
    comoEncontrado: null,
    reparo: { ...vazia.reparo },
    preliminar: { ...vazia.preliminar, zeroAutomatico: k.preliminar.zeroAutomatico },
  }
}

export const INDICACAO_VAZIA: EnsaioIndicacao = {
  metodo: 'CRESCENTE_DECRESCENTE',
  pontos: [],
  retornoZero: null,
  substituicao: { ativa: false, pecas: [], etapas: [] },
}

export const CONFORMIDADE_PADRAO: Conformidade = {
  solicitada: false,
  criterio: 'PORTARIA_SERVICO',
  toleranciaCliente: 0,
  regra: 'BANDA_GUARDA',
}

/**
 * Calibração vazia. Com a `classe` da balança, os métodos dos ensaios são os dela (na classe I, excentricidade pelo
 * método 3 e cargas com descarga; ver `metodoExcentricidadePadrao` e `metodoIndicacaoPadrao`).
 */
export function calibracaoVazia(opcoes: OpcoesCalculo = OPCOES_CALCULO_PADRAO, classe?: ClasseExatidao | null): CalibracaoInput {
  return {
    clienteId: '',
    balancaId: '',
    ordemServico: '',
    dataCalibracao: '',
    dataEmissao: '',
    dataRecebimento: '',
    local: 'CLIENTE',
    localEndereco: '',
    tecnicoId: '',
    signatarioId: '',
    padroesIds: [],
    ambiente: { ...AMBIENTE_VAZIO },
    preliminar: {
      identificavel: 'SIM',
      limpa: 'SIM',
      nivelada: 'SIM',
      aquecida: 'SIM',
      preCarga: 'SIM',
      zeroAutomatico: 'LIGADO',
    },
    ajuste: { realizado: 'NAO', descricao: '' },
    comoEncontrado: null,
    repetibilidade: [],
    excentricidade: { ...EXCENTRICIDADE_VAZIA, metodo: metodoExcentricidadePadrao(classe) },
    indicacao: { ...structuredClone(INDICACAO_VAZIA), metodo: metodoIndicacaoPadrao(classe) },
    opcoes: { ...opcoes },
    conformidade: { ...CONFORMIDADE_PADRAO },
    proximaCalibracao: '',
    proximaNoCertificado: false,
    reparo: { houve: false, descricao: '', marcaReparo: '', selosRetirados: '', selosColocados: '' },
    observacoes: '',
    opinioes: '',
    anotacoesInternas: '',
    substituiId: '',
    motivoRevisao: '',
  }
}

const VERIFICACOES: Verificacao[] = ['SIM', 'NAO', 'NA']

function normalizarPecas(v: unknown): PecaCarga[] {
  return (Array.isArray(v) ? v : [])
    .slice(0, LIMITES.pesos)
    .map((p) => {
      const x = obj(p)
      return { padraoId: texto(x.padraoId, 100), pesoId: texto(x.pesoId, 100), quantidade: inteiro(x.quantidade, 1000, 1) }
    })
    .filter((p) => p.padraoId && p.pesoId)
}

function normalizarIndicacao(v: unknown): EnsaioIndicacao {
  const r = obj(v)
  const sub = obj(r.substituicao)
  const pontos: PontoIndicacao[] = (Array.isArray(r.pontos) ? r.pontos : []).slice(0, LIMITES.pontos).map((p) => {
    const x = obj(p)
    return {
      id: texto(x.id, 100) || novoId(),
      carga: positivo(x.carga),
      pecas: normalizarPecas(x.pecas),
      pecasManuais: booleano(x.pecasManuais),
      crescente: numeroOuNulo(x.crescente),
      decrescente: numeroOuNulo(x.decrescente),
      nivelSubstituicao: inteiro(x.nivelSubstituicao, LIMITES.etapas, 0),
    }
  })
  const metodos = Object.keys(METODOS_CARREGAMENTO) as MetodoCarregamento[]
  const metodo = umDe(r.metodo, metodos, 'CRESCENTE_DECRESCENTE')
  // O método medido, quando o ensaio foi trocado de método depois das leituras (o mesmo método: não foi trocado)
  const metodoMedido = metodos.includes(r.metodoMedido as MetodoCarregamento) ? (r.metodoMedido as MetodoCarregamento) : null
  return {
    metodo,
    ...(metodoMedido && metodoMedido !== metodo ? { metodoMedido } : {}),
    pontos,
    retornoZero: numeroOuNulo(r.retornoZero),
    substituicao: {
      ativa: booleano(sub.ativa),
      pecas: normalizarPecas(sub.pecas),
      etapas: (Array.isArray(sub.etapas) ? sub.etapas : []).slice(0, LIMITES.etapas).map((e) => {
        const x = obj(e)
        return { leituraPadroes: numeroOuNulo(x.leituraPadroes), leituraSubstituicao: numeroOuNulo(x.leituraSubstituicao) }
      }),
    },
  }
}

function normalizarRepetibilidade(v: unknown): EnsaioRepetibilidade[] {
  return (Array.isArray(v) ? v : []).slice(0, LIMITES.repetibilidades).map((e) => {
    const x = obj(e)
    return {
      id: texto(x.id, 100) || novoId(),
      carga: positivo(x.carga),
      leituras: (Array.isArray(x.leituras) ? x.leituras : []).slice(0, LIMITES.leituras).map(numeroOuNulo),
    }
  })
}

function normalizarExcentricidade(v: unknown): EnsaioExcentricidade {
  const r = obj(v)
  return {
    aplicavel: booleano(r.aplicavel, true),
    motivo: texto(r.motivo, LIMITES.motivoExcentricidade),
    carga: positivo(r.carga),
    metodo: umDe(numero(r.metodo), [1, 2, 3, 4] as const, 1),
    posicoes: (Array.isArray(r.posicoes) ? r.posicoes : []).slice(0, LIMITES.posicoes).map((p) => {
      const x = obj(p)
      return { rotulo: texto(x.rotulo, 40), leitura: numeroOuNulo(x.leitura), referencia: numeroOuNulo(x.referencia) }
    }),
  }
}

export function normalizarOpcoes(v: unknown, base: OpcoesCalculo = OPCOES_CALCULO_PADRAO): OpcoesCalculo {
  const r = obj(v)
  return {
    empuxo: umDe(r.empuxo, ['AJUSTADO', 'NAO_AJUSTADO', 'DELTA_T', 'MEDIDO', 'NENHUM'] as const, base.empuxo),
    deltaTLocal: Math.min(positivo(r.deltaTLocal ?? base.deltaTLocal), 60),
    deriva: umDe(r.deriva, ['EMA', 'KD'] as const, base.deriva),
    kD: Math.min(Math.max(numero(r.kD ?? base.kD) || 1, 0.1), 3),
    excentricidade: booleano(r.excentricidade, base.excentricidade),
    metodoK: umDe(r.metodoK, ['T_EXATO', 'TABELA', 'K2'] as const, base.metodoK),
    zeroAprovado: booleano(r.zeroAprovado, base.zeroAprovado),
    histerese: umDe(r.histerese, ['SEPARADO', 'MEDIA'] as const, base.histerese),
    divisaoTeste: positivo(r.divisaoTeste ?? base.divisaoTeste),
    conveccao: umDe(r.conveccao, ['NAO_CONSIDERAR', 'CALCULAR'] as const, base.conveccao ?? 'NAO_CONSIDERAR'),
  }
}

/**
 * Faixas aceitas dos valores do ambiente (a tela, a pendência e o cálculo usam as mesmas). Fora delas o valor é
 * gravado como foi digitado (não some ao recarregar), a emissão fica com a pendência que diz qual valor conferir
 * (`pendenciasAmbiente`) e o cálculo o trata como não registrado (`valorAmbiente`).
 */
export const FAIXAS_AMBIENTE = {
  temperatura: { min: -40, max: 80, unidade: '°C' },
  umidade: { min: 0, max: 100, unidade: '%' },
  pressao: { min: 300, max: 1200, unidade: 'hPa' },
  deltaTPesos: { min: -30, max: 30, unidade: '°C' },
  /** Aclimatação: diferença pesos − ar na chegada (pesos mais frios dão ΔT0 negativo; o cálculo usa |ΔT0|). */
  deltaT0: { min: -40, max: 40, unidade: '°C' },
  /** Aclimatação: tempo dos pesos no local, em minutos (até 48 h). */
  minutos: { min: 0, max: 2880, unidade: 'min' },
} as const satisfies Record<string, { min: number; max: number; unidade: string }>
export type FaixaAmbiente = keyof typeof FAIXAS_AMBIENTE

/** O valor está fora da faixa aceita? (null = não registrado, não está fora). */
export const foraDaFaixaAmbiente = (v: number | null | undefined, faixa: FaixaAmbiente): boolean =>
  typeof v === 'number' && (!Number.isFinite(v) || v < FAIXAS_AMBIENTE[faixa].min || v > FAIXAS_AMBIENTE[faixa].max)

/** O valor para o cálculo: fora da faixa (ou não registrado), null. */
export const valorAmbiente = (v: number | null | undefined, faixa: FaixaAmbiente): number | null =>
  typeof v === 'number' && !foraDaFaixaAmbiente(v, faixa) ? v : null

/** "−40 °C a 80 °C" (o sinal de menos tipográfico). */
const textoFaixa = (faixa: FaixaAmbiente) => {
  const { min, max, unidade } = FAIXAS_AMBIENTE[faixa]
  const n = (x: number) => `${x < 0 ? '−' : ''}${Math.abs(x)} ${unidade}`
  return `${n(min)} a ${n(max)}`
}

/** As pendências dos valores do ambiente fora da faixa (gravados como foram digitados). */
export function pendenciasAmbiente(amb: Partial<CondicoesAmbientais>): string[] {
  const p: string[] = []
  const conferir = (rotulo: string, v: number | null | undefined, faixa: FaixaAmbiente) => {
    if (!foraDaFaixaAmbiente(v, faixa)) return
    if (faixa === 'pressao' && typeof v === 'number' && v >= 30 && v <= 120)
      p.push(
        `Pressão de ${numeroBr(v)} hPa fora da faixa (${textoFaixa(faixa)}): a pressão é em hPa (${numeroBr(v)} kPa = ${numeroBr(v * 10)} hPa).`,
      )
    else p.push(`${rotulo} fora da faixa (${textoFaixa(faixa)}): confira o valor digitado.`)
  }
  conferir('Temperatura no início', amb.temperaturaInicial, 'temperatura')
  conferir('Temperatura no fim', amb.temperaturaFinal, 'temperatura')
  conferir('Umidade no início', amb.umidadeInicial, 'umidade')
  conferir('Umidade no fim', amb.umidadeFinal, 'umidade')
  conferir('Pressão', amb.pressao, 'pressao')
  conferir('Diferença de temperatura pesos − ar', amb.deltaTPesos, 'deltaTPesos')
  conferir('Aclimatação dos pesos: diferença na chegada', amb.aclimatacao?.deltaT0, 'deltaT0')
  conferir('Aclimatação dos pesos: tempo no local', amb.aclimatacao?.minutos, 'minutos')
  return p
}

/**
 * Aclimatação dos pesos (sem a medição do ΔT pesos − ar): a diferença na chegada e os minutos no local, como foram
 * digitados (fora de `FAIXAS_AMBIENTE` é pendência); sem um dos dois, null.
 */
function normalizarAclimatacao(v: unknown): { deltaT0: number; minutos: number } | null {
  const r = obj(v)
  const deltaT0 = numeroOuNulo(r.deltaT0)
  const minutos = numeroOuNulo(r.minutos)
  return deltaT0 === null || minutos === null ? null : { deltaT0, minutos }
}

/**
 * A calibração com as cargas e leituras passadas para outra unidade (6000 g → 6 kg): para quando a unidade
 * da indicação da balança muda com calibrações ainda abertas. Essas massas são números puros, lidos na
 * unidade da balança; sem a conversão, uma leitura de 6000 passaria a valer 6000 kg. Os pesos padrão
 * (`pecas`) são referências aos padrões e não mudam.
 */
export function calibracaoEmOutraUnidade<T extends CalibracaoInput>(k: T, de: Unidade, para: Unidade): T {
  if (de === para) return k
  const c = (v: number) => converterMassa(v, de, para)
  const cn = (v: number | null) => (v === null ? null : c(v))
  const indicacao = (e: EnsaioIndicacao): EnsaioIndicacao => ({
    ...e,
    pontos: e.pontos.map((p) => ({ ...p, carga: c(p.carga), crescente: cn(p.crescente), decrescente: cn(p.decrescente) })),
    retornoZero: cn(e.retornoZero),
    substituicao: {
      ...e.substituicao,
      etapas: e.substituicao.etapas.map((x) => ({
        leituraPadroes: cn(x.leituraPadroes),
        leituraSubstituicao: cn(x.leituraSubstituicao),
      })),
    },
  })
  return {
    ...k,
    comoEncontrado: k.comoEncontrado && indicacao(k.comoEncontrado),
    indicacao: indicacao(k.indicacao),
    repetibilidade: k.repetibilidade.map((r) => ({ ...r, carga: c(r.carga), leituras: r.leituras.map(cn) })),
    excentricidade: {
      ...k.excentricidade,
      carga: c(k.excentricidade.carga),
      posicoes: k.excentricidade.posicoes.map((p) => ({ ...p, leitura: cn(p.leitura), referencia: cn(p.referencia) })),
    },
    opcoes: { ...k.opcoes, divisaoTeste: c(k.opcoes.divisaoTeste) },
    conformidade: { ...k.conformidade, toleranciaCliente: c(k.conformidade.toleranciaCliente) },
  }
}

/**
 * Normaliza o rascunho da calibração. É tolerante (rascunho pode estar incompleto): os erros aqui
 * são só os que impedem gravar. O que falta para emitir está em `pendenciasEmissao`.
 */
export function normalizarCalibracao(entrada: unknown): Resultado<CalibracaoInput> {
  const r = obj(entrada)
  const erros: string[] = []
  const clienteId = texto(r.clienteId, 100)
  const balancaId = texto(r.balancaId, 100)
  if (!clienteId) erros.push('Escolha o cliente.')
  if (!balancaId) erros.push('Escolha a balança calibrada.')
  const amb = obj(r.ambiente)
  const pre = obj(r.preliminar)
  const aj = obj(r.ajuste)
  const conf = obj(r.conformidade)
  const rep = obj(r.reparo)
  const dataCalibracao = data(r.dataCalibracao)
  if (r.dataCalibracao && !dataCalibracao) erros.push('Data da calibração inválida.')
  // Datas digitadas erradas (ano 2206, 31/02) não somem em silêncio: o certificado sairia sem a data pedida
  const proxima = data(r.proximaCalibracao)
  if (r.proximaCalibracao && !proxima) erros.push('Data da próxima calibração inválida.')
  const local = umDe(r.local, ['CLIENTE', 'LABORATORIO'] as const, 'CLIENTE')
  // O recebimento do item só existe na calibração no laboratório (nas instalações do cliente, não sai no certificado)
  const recebimento = local === 'LABORATORIO' ? data(r.dataRecebimento) : ''
  if (local === 'LABORATORIO' && r.dataRecebimento && !recebimento) erros.push('Data de recebimento do item inválida.')
  const ajusteRealizado = umDe(r.ajuste === undefined ? 'NAO' : aj.realizado, ['NAO', 'INTERNO', 'EXTERNO'] as const, 'NAO')
  return {
    valor: {
      clienteId,
      balancaId,
      ordemServico: texto(r.ordemServico, 40),
      dataCalibracao,
      dataEmissao: data(r.dataEmissao),
      dataRecebimento: recebimento,
      local,
      localEndereco: texto(r.localEndereco, 300),
      tecnicoId: texto(r.tecnicoId, 100),
      signatarioId: texto(r.signatarioId, 100),
      padroesIds: ids(r.padroesIds, LIMITES.padroesPorCalibracao),
      // Como foram digitados: fora de FAIXAS_AMBIENTE é pendência (`pendenciasAmbiente`), não some
      ambiente: {
        temperaturaInicial: numeroOuNulo(amb.temperaturaInicial),
        temperaturaFinal: numeroOuNulo(amb.temperaturaFinal),
        umidadeInicial: numeroOuNulo(amb.umidadeInicial),
        umidadeFinal: numeroOuNulo(amb.umidadeFinal),
        pressao: numeroOuNulo(amb.pressao),
        deltaTPesos: numeroOuNulo(amb.deltaTPesos),
        aclimatacao: normalizarAclimatacao(amb.aclimatacao),
      },
      preliminar: {
        identificavel: umDe(pre.identificavel, VERIFICACOES, 'SIM'),
        limpa: umDe(pre.limpa, VERIFICACOES, 'SIM'),
        nivelada: umDe(pre.nivelada, VERIFICACOES, 'SIM'),
        aquecida: umDe(pre.aquecida, VERIFICACOES, 'SIM'),
        preCarga: umDe(pre.preCarga, VERIFICACOES, 'SIM'),
        zeroAutomatico: umDe(pre.zeroAutomatico, ['LIGADO', 'DESLIGADO', 'NAO_POSSUI'] as const, 'LIGADO'),
      },
      ajuste: { realizado: ajusteRealizado, descricao: texto(aj.descricao, 300) },
      comoEncontrado: ajusteRealizado !== 'NAO' && r.comoEncontrado ? normalizarIndicacao(r.comoEncontrado) : null,
      repetibilidade: normalizarRepetibilidade(r.repetibilidade),
      excentricidade: normalizarExcentricidade(r.excentricidade),
      indicacao: normalizarIndicacao(r.indicacao),
      opcoes: normalizarOpcoes(r.opcoes),
      conformidade: {
        solicitada: booleano(conf.solicitada),
        criterio: umDe(conf.criterio, Object.keys(CRITERIOS_EMA) as CriterioEma[], 'PORTARIA_SERVICO'),
        toleranciaCliente: positivo(conf.toleranciaCliente),
        regra: umDe(conf.regra, ['SIMPLES', 'BANDA_GUARDA'] as const, 'BANDA_GUARDA'),
      },
      proximaCalibracao: proxima,
      // Sem a data, a marca fica: a pendência pede a data (não sai do certificado em silêncio)
      proximaNoCertificado: booleano(r.proximaNoCertificado),
      reparo: {
        houve: booleano(rep.houve),
        descricao: texto(rep.descricao, 300),
        marcaReparo: texto(rep.marcaReparo, 60),
        selosRetirados: texto(rep.selosRetirados, 120),
        selosColocados: texto(rep.selosColocados, 120),
      },
      observacoes: multilinha(r.observacoes),
      opinioes: multilinha(r.opinioes),
      anotacoesInternas: multilinha(r.anotacoesInternas),
      substituiId: texto(r.substituiId, 100),
      motivoRevisao: texto(r.motivoRevisao, LIMITES.motivo),
    },
    erros,
  }
}

// ---- Requisitos por classe da balança (POP, Tabela 2 e 6.2) -------------------------------------------

/** Classe fina (I ou II): aquecimento mais longo, ΔT menor e pressão atmosférica medida com barômetro. */
const classeFina = (classe: ClasseExatidao | null | undefined) => classe === 'I' || classe === 'II'

/**
 * Variação máxima da temperatura durante os ensaios (°C): 1 na classe I, 3 na classe II e 5 nas demais (e sem
 * classe) (R 76-1 A.4.1.2, com a faixa mínima de temperatura da classe; POP Tabela 2).
 */
export const deltaTMaximo = (classe: ClasseExatidao | null | undefined): number =>
  classe === 'I' ? 1 : classeFina(classe) ? 3 : 5

/**
 * A falta da pressão atmosférica fica só como aviso (não impede a emissão)? A pressão é obrigatória em toda calibração,
 * em toda classe e sem classe, medida com o barômetro listado entre os padrões (POP 6.2 e 7.5; desde a 1.0.5). Até a
 * 1.0.4 ela era obrigatória só nas classes I e II: nas classes III e IIII e sem classe, a calibração medida antes das
 * regras do POP (`minimosDoPopComoAviso`) e a medida ou com a folha de campo impressa antes da 1.0.5, ou a revisão de
 * um certificado emitido sem ela (`Calibracao.pressaoComoAviso`), saem sem ela, com o aviso: a visita já aconteceu (ou
 * vai acontecer com a folha que dizia "opcional"). Nas classes I e II, nunca.
 */
export function pressaoComoAviso(
  k: Pick<CalibracaoInput, 'opcoes'> &
    Partial<Pick<CalibracaoInput, 'calculoLegado' | 'substituiId' | 'regrasDoPop' | 'minimosComoAviso' | 'pressaoComoAviso'>> & {
      emissao?: unknown
    },
  classe: ClasseExatidao | null | undefined,
): boolean {
  return !classeFina(classe) && (k.pressaoComoAviso === true || minimosDoPopComoAviso(k))
}

/**
 * O aviso da calibração que sai sem a pressão atmosférica onde a falta dela é só aviso (`pressaoComoAviso`): já medida
 * antes da 1.0.5, ou com a folha de campo impressa antes dela, que dizia "opcional" (a visita pode ainda não ter
 * acontecido), ou a correção de um certificado emitido sem ela.
 */
export const AVISO_SEM_PRESSAO =
  'Sem a pressão atmosférica: esta calibração é de antes da versão 1.0.5 (a folha de campo dela dizia que a pressão era opcional, ou ela já tinha sido medida) e sai sem a pressão. Se a pressão foi anotada, registre-a. Nas novas, ela é obrigatória (POP 7.5).'

/**
 * Classe I com o ΔT pesos − ar medido: ele sai no certificado com o termômetro de duas entradas, cadastrado como padrão
 * "Outro" (POP 6.2). A pendência diz onde cadastrá-lo (sem nenhum "Outro", a etapa não tem cartão para escolher) e a
 * alternativa da aclimatação.
 */
export const PENDENCIA_TERMOMETRO_DUAS_ENTRADAS =
  'Balança classe I com o ΔT pesos − ar medido: escolha nos padrões o termômetro de duas entradas (cadastre-o em Padrões → Novo padrão → Outro, se ainda não estiver cadastrado) ou registre o ΔT pela aclimatação.'

/** O aviso da etapa Padrões e ambiente (classe I, ΔT medido) sem nenhum padrão "Outro" ativo cadastrado. */
export const AVISO_SEM_TERMOMETRO_DUAS_ENTRADAS =
  'Nenhum termômetro de duas entradas cadastrado: o ΔT medido precisa dele nos padrões. Cadastre-o em Padrões → Novo padrão → Outro, ou registre o ΔT pela aclimatação.'

/** Classe I sem nenhum padrão "Outro" ativo (o termômetro de duas entradas do ΔT pesos − ar, POP 6.2)? */
export const semTermometroDuasEntradas = (
  classe: ClasseExatidao | null | undefined,
  padroes: ReadonlyArray<Pick<Padrao, 'tipo' | 'ativo'>>,
): boolean => classe === 'I' && !padroes.some((p) => p.tipo === 'OUTRO' && p.ativo)

/** Classes de pesos aceitas na balança classe I (OIML R 111-1, 1.3.1). */
export const CLASSES_PESO_CLASSE_I: readonly ClassePeso[] = ['E1', 'E2', 'F1']

/** Balança para a escolha dos padrões de um rascunho sem histórico (a classe e as faixas). */
export type BalancaDosPadroes = Pick<Balanca, 'classe' | 'unidade' | 'tipoFaixas' | 'faixas'>

/**
 * Padrões de um rascunho sem calibração anterior da balança (e da folha de campo sem rascunho): os ativos, menos os
 * do tipo "Outro". Na classe I, só os jogos E1, E2 e F1, e os "Outro" entram: o termômetro de duas entradas do
 * ΔT pesos − ar é cadastrado assim (POP 6.2). O barômetro entra em toda classe: a pressão é obrigatória em toda
 * calibração (POP 7.5). Com a balança (não só a classe), nas outras classes ficam de fora os jogos de classe pior que a
 * mínima para ela (`classeMinimaPesos`, POP 6.1), quando os outros jogos ainda montam Max; se não montam, todos ficam
 * (a montagem e o cálculo avisam).
 */
export function padroesSemHistorico<P extends Pick<Padrao, 'ativo' | 'tipo' | 'classe'>>(
  padroes: P[],
  balanca: ClasseExatidao | BalancaDosPadroes | null | undefined,
): P[] {
  const b = balanca && typeof balanca === 'object' ? balanca : null
  const classe = b ? b.classe : (balanca as ClasseExatidao | null | undefined)
  const escolhidos = padroes.filter(
    (p) =>
      p.ativo &&
      (classe === 'I' ? p.tipo !== 'PESOS' || CLASSES_PESO_CLASSE_I.includes(p.classe as ClassePeso) : p.tipo !== 'OUTRO'),
  )
  const minima = b && classe !== 'I' ? classeMinimaPesos(b) : null
  if (!minima) return escolhidos
  const limite = CLASSES_PESO.indexOf(minima)
  const pior = (p: P) => p.tipo === 'PESOS' && !!p.classe && CLASSES_PESO.indexOf(p.classe as ClassePeso) > limite
  if (!escolhidos.some(pior)) return escolhidos
  const outros = escolhidos.filter((p) => !pior(p))
  // Os outros jogos de pesos montam Max (pelos nominais, como a montagem automática)?
  const max = Math.max(0, ...b!.faixas.map((f) => f.max))
  const pecas = outros.flatMap((p) =>
    p.tipo === 'PESOS'
      ? ((p as Partial<Pick<Padrao, 'pesos'>>).pesos ?? []).map((w, i) => ({
          chave: `${i}`,
          nominal: converterMassa(w.nominal, 'g', b!.unidade),
          quantidade: 1,
        }))
      : [],
  )
  return max > 0 && montarCargaNominal(max, pecas).completa ? outros : escolhidos
}

/**
 * ΔT pesos − ar máximo para começar os ensaios na classe I (°C; POP 7.4): 1 °C com algum jogo E1/E2 (ou sem
 * classe) e 3 °C quando todos os jogos são F1 (decisão da empresa: a 3 °C a convecção de nenhuma peça F1 passa
 * de 1/3 do EMA dela, cg-18 Tabelas F2.1 e F2.2).
 */
export function deltaTPesosMaximo(classesDosJogos: Array<ClassePeso | ''>): number {
  return classesDosJogos.length > 0 && classesDosJogos.every((c) => c === 'F1') ? 3 : 1
}

/**
 * Os itens da "Verificação antes de calibrar", os mesmos na tela e na folha de campo. O aquecimento é o maior
 * entre o da Tabela 2 do POP (20 min; 1 h na classe II; 2 h na classe I) e o do fabricante; a pré-carga, pelo
 * menos uma vez (três na classe I, POP 7.6). `classe` null: balança ainda não conhecida (folha em branco), com os
 * tempos e as vezes de cada classe.
 */
export function verificacoesAntesDeCalibrar(
  classe: ClasseExatidao | null,
): Array<{ chave: Exclude<keyof CalibracaoInput['preliminar'], 'zeroAutomatico'>; texto: string }> {
  const aquecida =
    classe === null
      ? 'Ligada e aquecida: 20 min, classe II 1 h, classe I 2 h (ou o tempo do fabricante, se maior)'
      : `Ligada e aquecida por ${classe === 'I' ? '2 h' : classeFina(classe) ? '1 h' : '20 min'} ou mais (ou o tempo do fabricante, se maior)`
  return [
    { chave: 'identificavel', texto: 'Balança identificada (série, modelo, plaqueta legível)' },
    { chave: 'limpa', texto: 'Limpa, sem danos ou contaminação no prato/plataforma' },
    { chave: 'nivelada', texto: 'Nivelada (bolha centralizada, quando houver)' },
    { chave: 'aquecida', texto: aquecida },
    {
      chave: 'preCarga',
      texto:
        classe === null
          ? 'Pré-carga aplicada (carga perto de Max pelo menos uma vez; classe I: 3 vezes)'
          : classe === 'I'
            ? 'Pré-carga aplicada 3 vezes (carga perto de Max)'
            : 'Pré-carga aplicada (carga perto de Max pelo menos uma vez)',
    },
  ]
}

/**
 * A balança é identificável (POP 7.3; ISO/IEC 17025, 7.8.2.1): tem o nº de série, a identificação no cliente (TAG) ou
 * a série da plataforma separada (sai no certificado). Sem nenhum dos três, o certificado não liga o item calibrado.
 * O cadastro gravado por uma versão antiga pode não ter algum dos campos.
 */
export const balancaIdentificada = (b: Partial<Pick<Balanca, 'numeroSerie' | 'identificacao'>> & { plataformaSerie?: string }) =>
  [b.numeroSerie, b.identificacao, b.plataformaSerie].some((x) => !!x?.trim())

/**
 * A conta do técnico da calibração foi excluída (o servidor confere; a desativada continua existindo e vale): o
 * certificado sairia com "Executado por" em branco.
 */
export const PENDENCIA_TECNICO_EXCLUIDO = 'O técnico desta calibração foi excluído: escolha quem executou.'

/**
 * Correção cujo certificado corrigido não está mais emitido (cancelado antes da trava do cancelamento, que hoje pede
 * emitir ou excluir a correção antes): ela não pode mais ser emitida. O servidor confere (`pendenciasDa`).
 */
export const PENDENCIA_REVISADO_CANCELADO =
  'O certificado desta correção foi cancelado: a correção não pode mais ser emitida. Exclua-a.'
export const PENDENCIA_REVISADO_NAO_EMITIDO =
  'O certificado desta correção não está mais emitido: a correção não pode ser emitida. Exclua-a.'

/** As pendências que só o servidor sabe e que valem mesmo com alteração por gravar na tela (`pendenciasDaTela`). */
export const PENDENCIAS_SO_DO_SERVIDOR: readonly string[] = [
  PENDENCIA_TECNICO_EXCLUIDO,
  PENDENCIA_REVISADO_CANCELADO,
  PENDENCIA_REVISADO_NAO_EMITIDO,
]

/**
 * O que falta para emitir o certificado (bloqueios): o cadastro, os padrões (como valem na data da calibração,
 * `padroesDaCalibracao`), o ambiente e as datas. As pendências do cálculo (os mínimos do POP, as leituras fora do
 * esperado, os pesos) vêm do motor (`calcularCalibracao`) e o servidor junta as duas (`pendenciasDa`); os avisos do
 * cálculo (ex.: faixa parcial) aparecem à parte e não bloqueiam.
 */
/**
 * Peças de jogos "valor do certificado" sem a U no cadastro usadas nos pontos lidos dos ensaios (e nas etapas de
 * substituição deles): elas entram pelo valor nominal, sem a correção do certificado (`pecaParaCalculo`). Por jogo, na
 * ordem dos padrões, com os nominais (g) distintos, do maior para o menor, e quantas peças são.
 */
export function pecasSemUDoCertificado(
  ensaios: ReadonlyArray<EnsaioIndicacao | null | undefined>,
  padroes: readonly Padrao[],
): Array<{ padrao: Padrao; nominais: number[]; pecas: number }> {
  const usadas = new Map<string, Set<string>>()
  const usar = (pecas: EnsaioIndicacao['substituicao']['pecas']) => {
    for (const r of pecas) usadas.set(r.padraoId, (usadas.get(r.padraoId) ?? new Set()).add(r.pesoId))
  }
  for (const e of ensaios) {
    if (!e) continue
    const lidos = e.pontos.filter((p) => p.crescente !== null || p.decrescente !== null)
    for (const p of lidos) usar(p.pecas)
    if (e.substituicao.ativa && lidos.some((p) => p.nivelSubstituicao > 0)) usar(e.substituicao.pecas)
  }
  return padroes.flatMap((padrao) => {
    const ids = usadas.get(padrao.id)
    if (padrao.tipo !== 'PESOS' || padrao.uso !== 'CERTIFICADO' || !ids) return []
    const semU = padrao.pesos.filter((w) => ids.has(w.id) && !(w.incerteza > 0))
    if (!semU.length) return []
    return [{ padrao, nominais: [...new Set(semU.map((w) => w.nominal))].sort((a, b) => b - a), pecas: semU.length }]
  })
}

/** "peça de 100 g" / "peças de 100 g e 50 g" (as peças de `pecasSemUDoCertificado`). */
export function textoPecas(x: { nominais: number[]; pecas: number }): string {
  const nomes = x.nominais.map(massaLegivel)
  const lista = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? '')
  return `${x.pecas > 1 ? 'peças' : 'peça'} de ${lista}`
}

/**
 * A pressão atmosférica, que sai no certificado com o barômetro que a mediu (rastreável; o barômetro listado foi usado).
 * Obrigatória em toda calibração (POP 6.2 e 7.5): sem ela, ou sem o barômetro nos padrões, a emissão fica pendente. Onde
 * a falta dela é só aviso (`pressaoComoAviso`), como até a 1.0.4: a pressão sem o barômetro, ou o barômetro sem a
 * pressão, continuam pendências, e a falta de ambos é o aviso de `avisosEmissao`.
 */
export function pendenciasPressao(
  c: Parameters<typeof pressaoComoAviso>[0] & Pick<CalibracaoInput, 'ambiente'>,
  contexto: { padroes: Pick<Padrao, 'tipo' | 'identificacao'>[]; classe?: ClasseExatidao },
): string[] {
  const pressao = c.ambiente.pressao
  const barometros = contexto.padroes.filter((x) => x.tipo === 'BAROMETRO').map((x) => x.identificacao)
  const lista = barometros.length > 1 ? `${barometros.slice(0, -1).join(', ')} ou ${barometros.at(-1)}` : barometros[0]
  if (pressaoComoAviso(c, contexto.classe)) {
    if (pressao !== null && !barometros.length)
      return ['Pressão informada sem barômetro nos padrões: escolha o barômetro usado ou apague a pressão.']
    if (barometros.length && pressao === null)
      return [
        `${barometros.length > 1 ? 'Barômetros escolhidos' : 'Barômetro escolhido'} sem a pressão registrada (tire ${barometros.join(', ')} dos padrões ou registre a pressão).`,
      ]
    return []
  }
  if (pressao === null)
    return [
      barometros.length
        ? `Registre a pressão atmosférica medida com o ${lista} (POP 7.5).`
        : 'Registre a pressão atmosférica, medida com o barômetro (escolha-o nos padrões; POP 7.5).',
    ]
  return barometros.length ? [] : ['Pressão informada sem barômetro nos padrões: escolha o barômetro usado (POP 6.2).']
}

/**
 * O que a tela mostra para conferir, sem impedir a emissão, das regras de `pendenciasEmissao`: a calibração que sai
 * sem a pressão atmosférica onde a falta dela é só aviso (`pressaoComoAviso`, `AVISO_SEM_PRESSAO`).
 */
export function avisosEmissao(
  c: Parameters<typeof pressaoComoAviso>[0] & Pick<CalibracaoInput, 'ambiente'>,
  contexto: { padroes: Pick<Padrao, 'tipo'>[]; classe?: ClasseExatidao },
): string[] {
  const semPressao = c.ambiente.pressao === null && !contexto.padroes.some((x) => x.tipo === 'BAROMETRO')
  return semPressao && pressaoComoAviso(c, contexto.classe) ? [AVISO_SEM_PRESSAO] : []
}

// ---- Campos obrigatórios para emitir (a marca "●" das etapas, como na folha de campo) --------------------------

/** As etapas do editor da calibração, na ordem. */
export const ETAPAS_CALIBRACAO = [
  'identificacao',
  'instrumento',
  'padroes',
  'repetibilidade',
  'excentricidade',
  'indicacao',
  'conclusao',
  'revisao',
] as const
export type EtapaCalibracao = (typeof ETAPAS_CALIBRACAO)[number]

/** Os campos das etapas que podem ser obrigatórios para emitir. */
export type CampoEmissao =
  | 'dataCalibracao'
  | 'tecnicoId'
  | 'localEndereco'
  | 'ordemServico'
  | 'ajusteDescricao'
  | 'identificacaoBalanca'
  | 'pesos'
  | 'temperaturaInicial'
  | 'temperaturaFinal'
  | 'umidade'
  | 'pressao'
  | 'barometro'
  | 'deltaTPesos'
  | 'repetibilidade'
  | 'excentricidadeMotivo'
  | 'excentricidadeLeituras'
  | 'excentricidadeCarga'
  | 'indicacaoLeituras'
  | 'retornoZero'
  | 'toleranciaCliente'
  | 'proximaCalibracao'

export interface CampoObrigatorio {
  campo: CampoEmissao
  etapa: EtapaCalibracao
  /**
   * `obrigatorio`: a falta impede a emissão (a marca "●"). `aviso`: a falta só dá o aviso (a calibração medida antes da
   * regra, `pressaoComoAviso`): a tela não marca o campo como obrigatório.
   */
  regra: 'obrigatorio' | 'aviso'
  /** O campo está em branco. */
  falta: boolean
  /** O que a falta dá na emissão: as pendências (ou, na regra `aviso`, o aviso), com os textos de `pendenciasEmissao` e do cálculo. */
  pendencias: string[]
  /** O id do controle na tela, para levar até ele. */
  alvo?: string
}

const TEXTO_CAMPO = {
  dataCalibracao: 'Informe a data da calibração.',
  tecnicoId: 'Informe o técnico que executou a calibração.',
  padroes: 'Escolha os padrões utilizados.',
  pesos: 'Escolha pelo menos um jogo de pesos padrão.',
  temperatura: 'Registre a temperatura no início e no fim da calibração.',
  excentricidadeMotivo: 'Excentricidade: informe por que o ensaio não foi feito (sai no certificado).',
  localEndereco: 'Informe o endereço onde a calibração foi feita.',
  ajusteDescricao: 'Descreva o ajuste externo (peso usado).',
  ordemServico: 'Houve reparo: informe o número da ordem de serviço.',
  toleranciaCliente: 'Informe a tolerância do cliente para a declaração de conformidade.',
  proximaCalibracao: 'Informe a data da próxima calibração pedida pelo cliente.',
  identificacaoBalanca:
    'Balança sem nº de série nem identificação (TAG): identifique a balança no cadastro antes de emitir (POP 7.3).',
} as const

/**
 * Os campos obrigatórios para emitir nesta calibração, pelas mesmas regras das pendências: `pendenciasEmissao` usa estas
 * (o que falta é pendência) e o cálculo dá as dele com os mesmos textos (`PENDENCIA_*` em metrologia/calculo.ts). Por
 * isso as marcas "●" das etapas nunca discordam do que impede a emissão. Dependem da calibração e da classe: o endereço
 * só nas instalações do cliente; a umidade com o empuxo pela densidade do ar medida (classe I); o ΔT pesos − ar com a
 * convecção no cálculo (classe I); a pressão e o barômetro em toda calibração (POP 7.5), só aviso onde a falta dela é
 * aviso (`pressaoComoAviso`); o retorno ao zero e o motivo da excentricidade dispensada pelas regras do POP. Só os que
 * valem nesta calibração; `falta`: em branco (o valor fora da faixa é outra pendência, `pendenciasAmbiente`).
 */
export function camposObrigatoriosEmissao(
  c: CalibracaoInput,
  contexto: {
    padroes: Pick<Padrao, 'tipo' | 'identificacao'>[]
    classe?: ClasseExatidao
    /** Há jogo de pesos entre os padrões (sem isto, pelos padrões). */
    temPesos?: boolean
    /** A balança (o cadastro de hoje): sem ela, a identificação não é conferida. */
    balanca?: Parameters<typeof balancaIdentificada>[0]
  },
): CampoObrigatorio[] {
  const lista: CampoObrigatorio[] = []
  const campo = (
    campo: CampoEmissao,
    etapa: EtapaCalibracao,
    falta: boolean,
    pendencias: string[],
    alvo?: string,
    regra: CampoObrigatorio['regra'] = 'obrigatorio',
  ) => lista.push({ campo, etapa, regra, falta, pendencias: falta ? pendencias : [], ...(alvo ? { alvo } : {}) })
  const amb = c.ambiente
  const regrasDoPop = !regrasDoPopComoAviso(c)
  const minimosDoPop = !minimosDoPopComoAviso(c)

  // Cliente e OS
  campo('dataCalibracao', 'identificacao', !dataIsoValida(c.dataCalibracao), [TEXTO_CAMPO.dataCalibracao], 'k-data')
  campo('tecnicoId', 'identificacao', !c.tecnicoId, [TEXTO_CAMPO.tecnicoId], 'k-tec')
  if (c.local === 'CLIENTE')
    campo('localEndereco', 'identificacao', !c.localEndereco.trim(), [TEXTO_CAMPO.localEndereco], 'k-end')
  if (c.reparo.houve) campo('ordemServico', 'identificacao', !c.ordemServico.trim(), [TEXTO_CAMPO.ordemServico], 'k-os')
  // Balança e ajuste (o ajuste externo, só no registro de antes do POP)
  if (c.ajuste.realizado === 'EXTERNO')
    campo('ajusteDescricao', 'instrumento', !c.ajuste.descricao.trim(), [TEXTO_CAMPO.ajusteDescricao], 'k-ajuste-anterior')
  // Item não identificável não é calibrado (POP 7.3; ISO/IEC 17025, 7.8.2.1): basta a série, a TAG ou a série da
  // plataforma (sai na linha da plataforma separada). Só quando falta: a marca nos campos diria que todos são pedidos.
  // Vale também na revisão: a emissão usa o cadastro de hoje, e a TAG vai nele
  if (contexto.balanca && !balancaIdentificada(contexto.balanca))
    campo('identificacaoBalanca', 'instrumento', true, [TEXTO_CAMPO.identificacaoBalanca])

  // Padrões e ambiente
  const temPesos = contexto.temPesos ?? contexto.padroes.some((x) => x.tipo === 'PESOS')
  const semPadroes = !c.padroesIds.length
  campo(
    'pesos',
    'padroes',
    semPadroes || !temPesos,
    [...(semPadroes ? [TEXTO_CAMPO.padroes] : []), ...(temPesos ? [] : [TEXTO_CAMPO.pesos])],
    'k-pesos',
  )
  // Empuxo pela densidade do ar medida (classe I): o cálculo pede a temperatura, a umidade e a pressão (a média do
  // início e do fim; uma leitura só basta) e dá a pendência dele com a que faltar
  const arMedido = c.opcoes.empuxo === 'MEDIDO'
  const doAr = arMedido ? [PENDENCIA_AR_MEDIDO] : []
  const semTemperatura = amb.temperaturaInicial === null && amb.temperaturaFinal === null
  campo(
    'temperaturaInicial',
    'padroes',
    amb.temperaturaInicial === null,
    [TEXTO_CAMPO.temperatura, ...(semTemperatura ? doAr : [])],
    'amb-ti',
  )
  campo(
    'temperaturaFinal',
    'padroes',
    amb.temperaturaFinal === null,
    [TEXTO_CAMPO.temperatura, ...(semTemperatura ? doAr : [])],
    'amb-tf',
  )
  if (arMedido) campo('umidade', 'padroes', amb.umidadeInicial === null && amb.umidadeFinal === null, doAr, 'amb-ui')
  // A pressão e o barômetro (POP 6.2 e 7.5). Onde a falta dela é aviso, a pressão sem o barômetro (ou o barômetro sem
  // a pressão) continua pendência, e o empuxo pela densidade do ar medida também a pede: só a falta dos dois é o aviso
  const aviso = pressaoComoAviso(c, contexto.classe)
  const temBarometro = contexto.padroes.some((x) => x.tipo === 'BAROMETRO')
  const daPressao = pendenciasPressao(c, contexto)
  const avisoPressao = avisosEmissao(c, contexto)
  const semPressao = amb.pressao === null
  const pressaoObrigatoria = !aviso || temBarometro || arMedido
  campo(
    'pressao',
    'padroes',
    semPressao,
    pressaoObrigatoria ? [...daPressao, ...doAr] : avisoPressao,
    'amb-p',
    pressaoObrigatoria ? 'obrigatorio' : 'aviso',
  )
  campo(
    'barometro',
    'padroes',
    !temBarometro,
    !aviso || !semPressao ? daPressao : avisoPressao,
    'k-instrumentos',
    !aviso || !semPressao ? 'obrigatorio' : 'aviso',
  )
  // Convecção no cálculo (classe I): o ΔT pesos − ar medido ou a aclimatação dos pesos
  if ((c.opcoes.conveccao ?? 'NAO_CONSIDERAR') === 'CALCULAR')
    campo('deltaTPesos', 'padroes', (amb.deltaTPesos ?? null) === null && !amb.aclimatacao, [PENDENCIA_CONVECCAO], 'amb-dtp')

  // Os ensaios (as pendências são do cálculo)
  campo(
    'repetibilidade',
    'repetibilidade',
    !c.repetibilidade.some((r) => r.leituras.filter((l) => l !== null).length >= 2),
    [pendenciaSemRepetibilidade(!minimosDoPop, contexto.classe === 'I')],
    'k-repetibilidade',
  )
  // Excentricidade dispensada: o motivo sai no certificado (na calibração de antes das regras, como na época)
  if (!c.excentricidade.aplicavel) {
    if (regrasDoPop)
      campo(
        'excentricidadeMotivo',
        'excentricidade',
        !c.excentricidade.motivo.trim(),
        [TEXTO_CAMPO.excentricidadeMotivo],
        'ecc-motivo',
      )
  } else {
    const comLeitura = c.excentricidade.posicoes.some((x) => x.leitura !== null)
    campo('excentricidadeLeituras', 'excentricidade', !comLeitura, [PENDENCIA_LEITURAS_EXCENTRICIDADE], 'k-excentricidade')
    // A carga usada: sem ela, as leituras não são conferidas (POP 7.10); no registro de antes das regras, é aviso
    if (regrasDoPop)
      campo(
        'excentricidadeCarga',
        'excentricidade',
        comLeitura && !(c.excentricidade.carga > 0),
        [PENDENCIA_CARGA_EXCENTRICIDADE],
        'ecc-carga',
      )
  }
  campo(
    'indicacaoLeituras',
    'indicacao',
    !c.indicacao.pontos.some((x) => x.crescente !== null || x.decrescente !== null),
    [PENDENCIA_SEM_LEITURAS_INDICACAO],
    'k-indicacao',
  )
  // O retorno ao zero (POP 7.7); na calibração já medida antes das regras era opcional
  if (minimosDoPop)
    campo('retornoZero', 'indicacao', c.indicacao.retornoZero === null, [PENDENCIA_RETORNO_ZERO], 'k-retorno-zero')

  // Conclusão
  if (c.conformidade.solicitada && c.conformidade.criterio === 'CLIENTE')
    campo('toleranciaCliente', 'conclusao', !(c.conformidade.toleranciaCliente > 0), [TEXTO_CAMPO.toleranciaCliente], 'conf-tol')
  if (c.proximaNoCertificado)
    campo('proximaCalibracao', 'conclusao', !c.proximaCalibracao, [TEXTO_CAMPO.proximaCalibracao], 'k-prox')
  return lista
}

export function pendenciasEmissao(
  c: CalibracaoInput,
  contexto: {
    padroes: Padrao[]
    hoje: string
    temPesos: boolean
    classe?: ClasseExatidao
    /** A balança (o cadastro de hoje, o que sai no certificado); sem ela, a identificação e o receptor não são conferidos. */
    balanca?: Pick<Balanca, 'receptor'> & Parameters<typeof balancaIdentificada>[0]
  },
): string[] {
  const p: string[] = []
  /** As regras do POP valem (calibração nova, ou revisão de um certificado emitido com elas): ver `regrasDoPopComoAviso`. */
  const regrasDoPop = !regrasDoPopComoAviso(c)
  // Os campos em branco: as mesmas regras das marcas "●" das etapas (`camposObrigatoriosEmissao`)
  const campos = new Map(camposObrigatoriosEmissao(c, contexto).map((x) => [x.campo, x]))
  const falta = (campo: CampoEmissao): string[] => {
    const x = campos.get(campo)
    return x?.regra === 'obrigatorio' ? x.pendencias : []
  }
  p.push(...falta('dataCalibracao'))
  if (dataIsoValida(c.dataCalibracao) && c.dataCalibracao > contexto.hoje) p.push('A data da calibração não pode ser futura.')
  p.push(...falta('tecnicoId'))
  p.push(...falta('pesos'))
  for (const pad of contexto.padroes) {
    // Desativado depois de escolhido (na revisão, o congelado na emissão vale: `padroesDaCalibracao`)
    if (!pad.ativo)
      p.push(
        `O padrão ${pad.identificacao} está desativado: tire-o desta calibração (etapa Padrões e ambiente) ou reative-o em Padrões.`,
      )
    if (!pad.validade) p.push(`O padrão ${pad.identificacao} está sem a data da próxima calibração.`)
    else if (dataIsoValida(c.dataCalibracao) && pad.validade < c.dataCalibracao)
      p.push(`O padrão ${pad.identificacao} estava vencido na data da calibração (${formatarDataBr(pad.validade)}).`)
    // Calibrado depois (o cadastro de hoje, sem a versão do dia em `versoesAnteriores`): o certificado citaria o
    // certificado e as correções novas. No mesmo dia, vale
    if (dataIsoValida(c.dataCalibracao) && dataIsoValida(pad.dataCalibracao) && pad.dataCalibracao > c.dataCalibracao)
      p.push(
        `O padrão ${pad.identificacao} foi calibrado em ${formatarDataBr(pad.dataCalibracao)}, depois desta calibração: o certificado dele não valia no dia.`,
      )
    // Fora do intervalo da Tabela 3 do POP (24 meses), mesmo com a próxima calibração digitada distante (2032 no lugar
    // de 2024). A revisão de um certificado de antes das regras fica como na época
    else if (
      regrasDoPop &&
      dataIsoValida(c.dataCalibracao) &&
      dataIsoValida(pad.dataCalibracao) &&
      c.dataCalibracao > somarMeses(pad.dataCalibracao, MESES_MAX_CALIBRACAO_PADRAO)
    )
      p.push(
        `O padrão ${pad.identificacao} foi calibrado em ${formatarDataBr(pad.dataCalibracao)}, há mais de ${MESES_MAX_CALIBRACAO_PADRAO} meses desta calibração (POP, Tabela 3).`,
      )
    if (!pad.certificado) p.push(`O padrão ${pad.identificacao} está sem o número do certificado de calibração.`)
    // A declaração de rastreabilidade do certificado diz que os padrões foram calibrados por laboratório acreditado
    if (!pad.acreditacao?.trim())
      p.push(`O padrão ${pad.identificacao} está sem a acreditação Cgcre do laboratório que o calibrou.`)
  }
  const amb = c.ambiente
  if (falta('temperaturaInicial').length || falta('temperaturaFinal').length) p.push(TEXTO_CAMPO.temperatura)
  p.push(...pendenciasAmbiente(amb))
  p.push(...pendenciasPressao(c, contexto))
  const jogos = contexto.padroes.filter((x) => x.tipo === 'PESOS')
  // Revisão de certificado emitido antes do cálculo da classe I: as exigências da época (ver `calculoLegado`)
  if (contexto.classe === 'I' && !calculoLegado(c)) {
    for (const pad of jogos) {
      if (!CLASSES_PESO_CLASSE_I.includes(pad.classe as ClassePeso))
        p.push(
          `Balança classe I: o jogo ${pad.identificacao} ${pad.classe ? `é da classe ${pad.classe}` : 'está sem a classe'}; use pesos E1, E2 ou F1 (OIML R 111-1, 1.3.1).`,
        )
      if (pad.uso !== 'CERTIFICADO')
        p.push(
          `Balança classe I: use o jogo ${pad.identificacao} pelo valor do certificado (cadastro do padrão; POP 6.1; OIML R 111-1, 5.3.2).`,
        )
    }
    // A peça sem a U no cadastro entraria pelo nominal, sem a correção do certificado (na classe I, mais de 1 d). Regra
    // da 1.0.3: a revisão de um certificado de antes dela fica como na época (o cálculo dá o aviso "Correção do
    // certificado ignorada")
    if (regrasDoPop)
      for (const x of pecasSemUDoCertificado([c.indicacao, c.comoEncontrado], jogos))
        p.push(
          `Balança classe I: o jogo ${x.padrao.identificacao} está sem a incerteza (U) do certificado ${x.pecas > 1 ? 'das' : 'da'} ${textoPecas(x)}; complete o cadastro do padrão (POP 6.1).`,
        )
    // O ΔT medido sai no certificado: o termômetro de duas entradas (padrão "Outro", POP 6.2) entra na lista
    if (typeof amb.deltaTPesos === 'number' && !contexto.padroes.some((x) => x.tipo === 'OUTRO'))
      p.push(PENDENCIA_TERMOMETRO_DUAS_ENTRADAS)
    if (c.opcoes.empuxo === 'NENHUM')
      p.push('Balança classe I: o empuxo do ar precisa entrar no cálculo (Opções do cálculo, na Conclusão).')
    if ((c.opcoes.conveccao ?? 'NAO_CONSIDERAR') !== 'CALCULAR')
      p.push('Balança classe I: a convecção precisa entrar no cálculo (Opções do cálculo, na Conclusão).')
  }
  // A densidade e u(ρ) dos jogos (empuxo pela densidade do ar medida) quem confere é o cálculo, peça a peça, em
  // todo ensaio que a usa: no final e no "como encontrado" da classe I ajustada logo antes (`opcoesComoEncontrado`)
  // A balança sem identificação (POP 7.3): a mesma regra da marca da etapa 2 (`camposObrigatoriosEmissao`)
  const b = contexto.balanca
  p.push(...falta('identificacaoBalanca'))
  // Excentricidade dispensada: o POP (7.10, Tabela 6) só a dispensa na balança suspensa (gancho), com o motivo, que
  // sai no certificado. Sem o ensaio, a parcela dele some da incerteza. Na calibração já medida antes das regras, a
  // dispensa fica como na época (o ensaio não pode ser feito agora); o motivo, não
  if (regrasDoPop && !c.excentricidade.aplicavel) {
    if (b && b.receptor !== 'GANCHO' && !minimosDoPopComoAviso(c))
      p.push(
        'Excentricidade: o POP (7.10, Tabela 6) só dispensa o ensaio na balança suspensa (gancho); registre as leituras das posições.',
      )
    p.push(...falta('excentricidadeMotivo'))
  }
  p.push(...falta('localEndereco'), ...falta('ajusteDescricao'), ...falta('ordemServico'))
  p.push(...falta('toleranciaCliente'), ...falta('proximaCalibracao'))
  // Datas incoerentes (vão para o certificado; a próxima também para os vencimentos e lembretes)
  if (dataIsoValida(c.dataCalibracao)) {
    if (dataIsoValida(c.proximaCalibracao) && c.proximaCalibracao <= c.dataCalibracao)
      p.push('A próxima calibração precisa ser depois da data da calibração.')
    if (c.local === 'LABORATORIO' && dataIsoValida(c.dataRecebimento) && c.dataRecebimento > c.dataCalibracao)
      p.push('O recebimento do item não pode ser depois da data da calibração.')
  }
  return p
}

/** "2026-10-14" → "14/10/2026" */
export function formatarDataBr(iso: string): string {
  if (!dataIsoValida(iso)) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** "2026-10-14T13:05:00.000Z" → "14/10/2026 10:05" (fuso local). */
export function formatarDataHoraBr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---- Configurações -------------------------------------------------------------------------------

export function normalizarConfig(entrada: unknown, atual: Configuracoes = CONFIG_PADRAO): Resultado<Configuracoes> {
  const r = obj(entrada)
  const erros: string[] = []
  const e = obj(r.empresa)
  const t = obj(r.textos)
  const n = obj(r.numeracao)
  const empresa: DadosEmpresa = {
    nomeFantasia: texto(e.nomeFantasia ?? atual.empresa.nomeFantasia, 120),
    razaoSocial: texto(e.razaoSocial ?? atual.empresa.razaoSocial, 160),
    cnpj: texto(e.cnpj ?? atual.empresa.cnpj, 30),
    inscricaoEstadual: texto(e.inscricaoEstadual ?? atual.empresa.inscricaoEstadual, 30),
    endereco: texto(e.endereco ?? atual.empresa.endereco, 200),
    bairro: texto(e.bairro ?? atual.empresa.bairro, 80),
    cidade: texto(e.cidade ?? atual.empresa.cidade, 80),
    uf: texto(e.uf ?? atual.empresa.uf, 2).toUpperCase(),
    cep: mascaraCep(texto(e.cep ?? atual.empresa.cep, 12)),
    telefone: texto(e.telefone ?? atual.empresa.telefone, 40),
    email: texto(e.email ?? atual.empresa.email, 120).toLowerCase(),
    site: texto(e.site ?? atual.empresa.site, 120),
  }
  if (!empresa.razaoSocial) erros.push('Informe a razão social da empresa (sai no certificado).')
  if (empresa.cnpj && !cnpjValido(empresa.cnpj)) erros.push('CNPJ da empresa inválido.')
  if (empresa.email && !emailValido(empresa.email)) erros.push('E-mail da empresa inválido.')
  const textos = Object.fromEntries(
    (Object.keys(TEXTOS_PADRAO) as Array<keyof TextosCertificado>).map((k) => [k, multilinha(t[k] ?? atual.textos[k], 3000)]),
  ) as unknown as TextosCertificado
  const formato = texto(n.formato ?? atual.numeracao.formato, 40)
  if (!formato.includes('{seq}')) erros.push('O formato do número precisa ter {seq} (a sequência).')
  const urlVerificacao = texto(r.urlVerificacao ?? atual.urlVerificacao, 200)
  if (urlVerificacao && !/^https?:\/\//i.test(urlVerificacao))
    erros.push('O endereço de verificação precisa começar com http:// ou https://.')
  return {
    valor: {
      empresa,
      textos,
      numeracao: { formato, digitos: inteiro(n.digitos ?? atual.numeracao.digitos, 8, 1) },
      opcoesPadrao: normalizarOpcoes(r.opcoesPadrao ?? atual.opcoesPadrao, atual.opcoesPadrao),
      exigirRevisor: booleano(r.exigirRevisor, atual.exigirRevisor),
      diasAvisoVencimento: inteiro(r.diasAvisoVencimento ?? atual.diasAvisoVencimento, 365, 1),
      mesesProximaPadrao: inteiro(r.mesesProximaPadrao ?? atual.mesesProximaPadrao, 60, 0),
      urlVerificacao,
      emailAssunto: texto(r.emailAssunto ?? atual.emailAssunto, 200),
      emailMensagem: multilinha(r.emailMensagem ?? atual.emailMensagem, 5000),
      lembreteAssunto: texto(r.lembreteAssunto ?? atual.lembreteAssunto, 200),
      lembreteMensagem: multilinha(r.lembreteMensagem ?? atual.lembreteMensagem, 5000),
    },
    erros,
  }
}

/**
 * A cláusula de reprodução padrão até a versão 1.0.1, quando ela saía nas declarações. Agora ela sai no
 * rodapé (ao lado da razão social, que por isso não se repete): a configuração com o texto antigo, sem
 * mudança, passa a ter o novo (ver `completarConfig`); um texto mudado pela empresa fica como está.
 */
export const REPRODUCAO_ANTIGA =
  'Este certificado somente pode ser reproduzido na íntegra. A reprodução parcial depende de autorização prévia, ' +
  'por escrito, da {empresa}.'

/**
 * Os textos de fábrica do certificado até a versão 1.0.1, mais longos (o certificado chegava a 3 páginas por
 * causa deles). A configuração com um deles, sem mudança, passa a ter o novo, curto (ver `completarConfig`);
 * um texto mudado pela empresa fica como está.
 */
export const TEXTOS_ANTIGOS: Partial<Record<keyof TextosCertificado, string>> = {
  reproducao: REPRODUCAO_ANTIGA,
  procedimentoDescricao:
    'Calibração por comparação direta com pesos padrão, conforme o EURAMET Calibration Guide No. 18, versão 4.0 (2015): ' +
    'ensaios de repetibilidade, excentricidade e erro de indicação. Incerteza de medição avaliada conforme o ' +
    'Guia para a Expressão da Incerteza de Medição (JCGM 100:2008).',
  rastreabilidade:
    'Os resultados desta calibração são metrologicamente rastreáveis ao Sistema Internacional de Unidades (SI) por meio ' +
    'dos padrões relacionados em "Padrões utilizados", calibrados por laboratório(s) acreditado(s) pela Cgcre/Inmetro ' +
    'para as respectivas calibrações, conforme os certificados indicados.',
  incerteza:
    'A incerteza expandida de medição relatada (U) é declarada como a incerteza padrão de medição multiplicada pelo ' +
    'fator de abrangência k, o qual, para uma distribuição t com νeff graus de liberdade efetivos, corresponde a uma ' +
    'probabilidade de abrangência de aproximadamente 95 %. Os valores de k e νeff de cada ponto constam das tabelas. ' +
    'A incerteza declarada vale quando o erro de indicação é levado em conta (corrigido).',
  abrangencia:
    'Os resultados apresentados neste certificado referem-se exclusivamente ao instrumento calibrado, não sendo ' +
    'extensivos a outros instrumentos, ainda que do mesmo fabricante e modelo. Os resultados referem-se às condições ' +
    'existentes no momento da calibração; a incerteza declarada não inclui efeitos de longo prazo (deriva), de ' +
    'transporte, de reinstalação ou de condições de uso diferentes das registradas.',
  controleLegal:
    'Esta calibração não isenta o instrumento do controle metrológico estabelecido na regulamentação metrológica: ' +
    'este certificado não substitui a verificação inicial, periódica ou após reparo realizada pelo Inmetro ou por ' +
    'órgão da RBMLQ-I (IPEM-SP), obrigatória para instrumentos utilizados nas finalidades previstas no art. 1º, § 1º, ' +
    'da Portaria Inmetro nº 157/2022, e não atesta a conformidade do instrumento ao Regulamento Técnico Metrológico.',
  intervalo:
    'Este certificado não contém recomendação de intervalo de calibração. A definição da periodicidade das calibrações ' +
    'é de responsabilidade do usuário, considerando a frequência e as condições de uso, o histórico e a estabilidade ' +
    'do instrumento e os requisitos aplicáveis.',
}

/** Os textos gravados, com os de fábrica antigos (sem mudança da empresa) trocados pelos novos. */
function textosAtualizados(gravados: Record<string, unknown>): Record<string, unknown> {
  const mesmo = (a: unknown, b: string) => typeof a === 'string' && a.replace(/\s+/g, ' ').trim() === b
  const novos: Record<string, unknown> = { ...gravados }
  for (const [chave, antigo] of Object.entries(TEXTOS_ANTIGOS))
    if (antigo && mesmo(gravados[chave], antigo)) novos[chave] = TEXTOS_PADRAO[chave as keyof TextosCertificado]
  return novos
}

/** Completa uma configuração salva por uma versão anterior com os valores padrão que faltarem. */
export function completarConfig(salva: unknown): Configuracoes {
  const r = obj(salva)
  return normalizarConfig(
    {
      ...CONFIG_PADRAO,
      ...r,
      empresa: { ...EMPRESA_PADRAO, ...obj(r.empresa) },
      textos: { ...TEXTOS_PADRAO, ...textosAtualizados(obj(r.textos)) },
      numeracao: { ...CONFIG_PADRAO.numeracao, ...obj(r.numeracao) },
      opcoesPadrao: { ...OPCOES_CALCULO_PADRAO, ...obj(r.opcoesPadrao) },
    },
    CONFIG_PADRAO,
  ).valor
}

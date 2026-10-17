// Regras do domínio: valores padrão, rótulos, normalização das entradas (servidor e telas) e
// validações. O servidor é a fonte da verdade; as telas usam as mesmas funções para avisar na hora.

import { cnpjValido, cpfValido, mascaraCep, mascaraCnpj, mascaraCpf, normalizarCnpj, somenteDigitos } from './documentos.ts'
import { novoId } from './id.ts'
import type {
  AjusteRealizado,
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
}

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
  // "1.234,5" (milhar com ponto) → 1234.5 ; "1234,5" → 1234.5 ; "1234.5" → 1234.5
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
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

/** Texto para busca: minúsculo, sem acentos e com os espaços normalizados. */
export function textoBusca(...partes: Array<string | undefined | null>): string {
  return partes.filter(Boolean).join(' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// ---- Rótulos ---------------------------------------------------------------------------

export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
export const TIPOS_CLIENTE: TipoCliente[] = ['PJ', 'PF']

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
  REVISAO: { label: 'Aguardando revisão', tom: 'info' },
  EMITIDO: { label: 'Emitido', tom: 'success' },
  CANCELADO: { label: 'Cancelado', tom: 'danger' },
  SUBSTITUIDO: { label: 'Substituído', tom: 'warning' },
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

export const METODOS_CARREGAMENTO: Record<MetodoCarregamento, { label: string; descricao: string }> = {
  CRESCENTE_DECRESCENTE: {
    label: 'Crescente e decrescente',
    descricao: 'Sobe até Max e desce, sem descarregar. Mostra a histerese.',
  },
  DESCONTINUO: { label: 'Crescente com descarga', descricao: 'Descarrega entre um ponto e outro.' },
  CONTINUO: { label: 'Crescente contínuo', descricao: 'Sobe sem descarregar. Comum em rodoviárias.' },
  DECRESCENTE: { label: 'Decrescente', descricao: 'Parte de Max e vai descarregando (tremonhas, silos).' },
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
  reproducao:
    'Este certificado somente pode ser reproduzido na íntegra. A reprodução parcial depende de autorização prévia, ' +
    'por escrito, da {empresa}.',
  naoAcreditado:
    'A {empresa} não é acreditada pela Coordenação-Geral de Acreditação do Inmetro (Cgcre). Esta calibração não foi ' +
    'realizada sob acreditação e este certificado não está abrangido pelos acordos de reconhecimento mútuo dos quais ' +
    'a Cgcre é signatária.',
  controleLegal:
    'Esta calibração não isenta o instrumento do controle metrológico estabelecido na regulamentação metrológica: ' +
    'este certificado não substitui a verificação inicial, periódica ou após reparo realizada pelo Inmetro ou por ' +
    'órgão da RBMLQ-I (IPEM-SP), obrigatória para instrumentos utilizados nas finalidades previstas no art. 1º, § 1º, ' +
    'da Portaria Inmetro nº 157/2022, e não atesta a conformidade do instrumento ao Regulamento Técnico Metrológico.',
  intervalo:
    'Este certificado não contém recomendação de intervalo de calibração. A definição da periodicidade das calibrações ' +
    'é de responsabilidade do usuário, considerando a frequência e as condições de uso, o histórico e a estabilidade ' +
    'do instrumento e os requisitos aplicáveis.',
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
    'Qualquer dúvida, estamos à disposição.\n\nAtenciosamente,\n{empresa}',
  lembreteAssunto: 'Calibração das balanças — {empresa}',
  lembreteMensagem:
    'Olá,\n\nA calibração das balanças abaixo está prevista para {data}:\n\n{balancas}\n\n' +
    'Podemos agendar a visita? Basta responder este e-mail ou nos chamar no telefone.\n\nAtenciosamente,\n{empresa}',
}

/** Troca {empresa} pela razão social nos textos fixos do certificado. */
export function textoComEmpresa(t: string, empresa: DadosEmpresa) {
  return t.replaceAll('{empresa}', empresa.razaoSocial || empresa.nomeFantasia)
}

/** Troca as marcas {chave} de um modelo de texto (e-mail, lembrete) pelos valores; marcas desconhecidas ficam. */
export function preencherModelo(t: string, valores: Record<string, string>) {
  return t.replace(/\{(\w+)\}/g, (marca, chave: string) => (chave in valores ? valores[chave] : marca))
}

/**
 * Número do certificado a partir do formato: {seq} (sequência com zeros), {ano} (4 dígitos), {aa} (2 dígitos).
 * Revisões ganham o sufixo "-R1", "-R2"…
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

/** Nome de arquivo seguro a partir do número do certificado. */
export const nomeArquivoCertificado = (numero: string) =>
  `Certificado-${numero
    .replace(/[^0-9A-Za-z-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`

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
  b.faixas.forEach((f, i) => {
    const nome = b.faixas.length > 1 ? ` (faixa ${i + 1})` : ''
    if (f.e && f.d && (f.d > f.e + 1e-12 || f.e > 10 * f.d + 1e-12)) avisos.push(`O normal é d ≤ e ≤ 10·d${nome}.`)
    if (f.e && !valor125(f.e)) avisos.push(`A divisão de verificação e costuma ser 1, 2 ou 5 × 10ⁿ${nome}.`)
    if (f.d && !valor125(f.d)) avisos.push(`A divisão d costuma ser 1, 2 ou 5 × 10ⁿ${nome}.`)
    const n = f.e > 0 ? f.max / f.e : 0
    const lim = LIMITES_N[b.classe]
    // O n absurdo é erro (ver `errosUnidadeBalanca`), não aviso
    if (lim && n && !nAbsurdo(b.classe, n) && (n < lim[0] - 1e-9 || n > lim[1] + 1e-9))
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
      portariaAprovacao: texto(r.portariaAprovacao, 120),
      receptor,
      apoios: inteiro(r.apoios, 64, 0) || (receptor === 'RETANGULAR' ? 4 : 0),
      dimensoes: texto(r.dimensoes, 60),
      finalidade,
      localInstalacao: texto(r.localInstalacao, 120),
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
}

export function normalizarPadrao(entrada: unknown): Resultado<PadraoInput> {
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
      descricao: texto(r.descricao, 160),
      fabricante: texto(r.fabricante, 80),
      modelo: texto(r.modelo, 80),
      numeroSerie: texto(r.numeroSerie, 80),
      classe: tipo === 'PESOS' ? umDe(r.classe, ['', ...CLASSES_PESO] as const, '') : '',
      material: texto(r.material, 60),
      densidade: positivo(r.densidade),
      uso,
      pesos: pesos.sort((a, b) => b.nominal - a.nominal),
      certificado: texto(r.certificado, 80),
      laboratorio: texto(r.laboratorio, 160),
      acreditacao: texto(r.acreditacao, 40),
      dataCalibracao,
      validade,
      incertezaTexto: texto(r.incertezaTexto, 200),
      observacoes: multilinha(r.observacoes),
      ativo: booleano(r.ativo, true),
    },
    erros,
  }
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
}

export const EXCENTRICIDADE_VAZIA: EnsaioExcentricidade = {
  aplicavel: true,
  motivo: '',
  carga: 0,
  metodo: 1,
  posicoes: [],
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

export function calibracaoVazia(opcoes: OpcoesCalculo = OPCOES_CALCULO_PADRAO): CalibracaoInput {
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
    excentricidade: { ...EXCENTRICIDADE_VAZIA },
    indicacao: structuredClone(INDICACAO_VAZIA),
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
  return {
    metodo: umDe(r.metodo, Object.keys(METODOS_CARREGAMENTO) as MetodoCarregamento[], 'CRESCENTE_DECRESCENTE'),
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
    motivo: texto(r.motivo, 200),
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
    empuxo: umDe(r.empuxo, ['AJUSTADO', 'NAO_AJUSTADO', 'DELTA_T', 'NENHUM'] as const, base.empuxo),
    deltaTLocal: Math.min(positivo(r.deltaTLocal ?? base.deltaTLocal), 60),
    deriva: umDe(r.deriva, ['EMA', 'KD'] as const, base.deriva),
    kD: Math.min(Math.max(numero(r.kD ?? base.kD) || 1, 0.1), 3),
    excentricidade: booleano(r.excentricidade, base.excentricidade),
    metodoK: umDe(r.metodoK, ['T_EXATO', 'TABELA', 'K2'] as const, base.metodoK),
    zeroAprovado: booleano(r.zeroAprovado, base.zeroAprovado),
    histerese: umDe(r.histerese, ['SEPARADO', 'MEDIA'] as const, base.histerese),
    divisaoTeste: positivo(r.divisaoTeste ?? base.divisaoTeste),
  }
}

const numOuNuloAmb = (v: unknown, min: number, max: number) => {
  const n = numeroOuNulo(v)
  return n === null || n < min || n > max ? null : n
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
  const proxima = data(r.proximaCalibracao)
  const ajusteRealizado = umDe(r.ajuste === undefined ? 'NAO' : aj.realizado, ['NAO', 'INTERNO', 'EXTERNO'] as const, 'NAO')
  return {
    valor: {
      clienteId,
      balancaId,
      ordemServico: texto(r.ordemServico, 40),
      dataCalibracao,
      dataEmissao: data(r.dataEmissao),
      dataRecebimento: data(r.dataRecebimento),
      local: umDe(r.local, ['CLIENTE', 'LABORATORIO'] as const, 'CLIENTE'),
      localEndereco: texto(r.localEndereco, 300),
      tecnicoId: texto(r.tecnicoId, 100),
      signatarioId: texto(r.signatarioId, 100),
      padroesIds: ids(r.padroesIds, LIMITES.padroesPorCalibracao),
      ambiente: {
        temperaturaInicial: numOuNuloAmb(amb.temperaturaInicial, -40, 80),
        temperaturaFinal: numOuNuloAmb(amb.temperaturaFinal, -40, 80),
        umidadeInicial: numOuNuloAmb(amb.umidadeInicial, 0, 100),
        umidadeFinal: numOuNuloAmb(amb.umidadeFinal, 0, 100),
        pressao: numOuNuloAmb(amb.pressao, 300, 1200),
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
      proximaNoCertificado: booleano(r.proximaNoCertificado) && !!proxima,
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
      motivoRevisao: texto(r.motivoRevisao, 300),
    },
    erros,
  }
}

/**
 * O que falta para emitir o certificado (bloqueios). Os avisos do cálculo (ex.: poucas leituras)
 * aparecem à parte e não bloqueiam.
 */
export function pendenciasEmissao(
  c: CalibracaoInput,
  contexto: { padroes: Padrao[]; hoje: string; temPesos: boolean },
): string[] {
  const p: string[] = []
  if (!dataIsoValida(c.dataCalibracao)) p.push('Informe a data da calibração.')
  else if (c.dataCalibracao > contexto.hoje) p.push('A data da calibração não pode ser futura.')
  if (!c.tecnicoId) p.push('Informe o técnico que executou a calibração.')
  if (!c.padroesIds.length) p.push('Escolha os padrões utilizados.')
  if (!contexto.temPesos) p.push('Escolha pelo menos um jogo de pesos padrão.')
  for (const pad of contexto.padroes) {
    if (!pad.ativo) p.push(`O padrão ${pad.identificacao} está desativado.`)
    if (!pad.validade) p.push(`O padrão ${pad.identificacao} está sem a data da próxima calibração.`)
    else if (dataIsoValida(c.dataCalibracao) && pad.validade < c.dataCalibracao)
      p.push(`O padrão ${pad.identificacao} estava vencido na data da calibração (${formatarDataBr(pad.validade)}).`)
    if (!pad.certificado) p.push(`O padrão ${pad.identificacao} está sem o número do certificado de calibração.`)
  }
  const amb = c.ambiente
  if (amb.temperaturaInicial === null || amb.temperaturaFinal === null)
    p.push('Registre a temperatura no início e no fim da calibração.')
  if (c.local === 'CLIENTE' && !c.localEndereco.trim()) p.push('Informe o endereço onde a calibração foi feita.')
  if (c.ajuste.realizado === 'EXTERNO' && !c.ajuste.descricao.trim()) p.push('Descreva o ajuste externo (peso usado).')
  if (c.reparo.houve && !c.ordemServico.trim()) p.push('Houve reparo: informe o número da ordem de serviço.')
  if (c.conformidade.solicitada && c.conformidade.criterio === 'CLIENTE' && !(c.conformidade.toleranciaCliente > 0))
    p.push('Informe a tolerância do cliente para a declaração de conformidade.')
  if (c.proximaNoCertificado && !c.proximaCalibracao) p.push('Informe a data da próxima calibração pedida pelo cliente.')
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

/** Completa uma configuração salva por uma versão anterior com os valores padrão que faltarem. */
export function completarConfig(salva: unknown): Configuracoes {
  const r = obj(salva)
  return normalizarConfig(
    {
      ...CONFIG_PADRAO,
      ...r,
      empresa: { ...EMPRESA_PADRAO, ...obj(r.empresa) },
      textos: { ...TEXTOS_PADRAO, ...obj(r.textos) },
      numeracao: { ...CONFIG_PADRAO.numeracao, ...obj(r.numeracao) },
      opcoesPadrao: { ...OPCOES_CALCULO_PADRAO, ...obj(r.opcoesPadrao) },
    },
    CONFIG_PADRAO,
  ).valor
}

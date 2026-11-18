// Levar o registro de campo (o que o técnico anotou no celular) para a calibração. Puro: usado pelo servidor (gravar),
// pelas telas do computador (a prévia "Comparar com o campo" / "Puxar dados do campo") e pelo app do celular (os avisos e
// o "Falta para assinar" rodam as regras do sistema sobre o rascunho que o registro daria).
//
//   registroParaRascunho   o registro como um rascunho (`CalibracaoInput`): texto → número sem perder casas; os minutos da
//                          aclimatação e o ΔT que vale calculados dos horários ISO (passa da meia-noite e dura dois
//                          dias); a data real no lugar da prevista; a pressão do certificado é a do início;
//   diferencasDoCampo      a tabela Campo | Celular | Rascunho: os pontos casam pelo id e, sem id, pela carga (com
//                          tolerância); o que sobra é "do celular, sem par"; as tentativas descartadas e as anotações
//                          nunca entram (as anotações aparecem ao lado, para o escritório copiar);
//   aplicarDoCampo         "Puxar dados do campo" (registro original = CELULAR): escreve no rascunho o que foi escolhido;
//   divergenciasParaEmissao a regra de uma justificativa só (05-ajustes-finais §10): os dados brutos da calibração que
//                          ficaram diferentes do registro depois de puxar.
//
// A unidade: as leituras estão na unidade da balança como o técnico a viu (a do cadastro ou, com "Algo diferente…" na
// unidade, a vista em campo: `unidadeDoRegistro`). Se a unidade da balança mudou no escritório, a comparação converte com
// `calibracaoEmOutraUnidade` (`OpcoesComparar.unidadeAtual`).

import { cargaDaEtapa, descreverPecas, montarPonto } from '../calibracao.ts'
import {
  BALANCA_VAZIA,
  calibracaoEmOutraUnidade,
  calibracaoVazia,
  converterMassa,
  dataIsoValida,
  LOCAIS,
  metodoIndicacaoPadrao,
  proximaAcompanhando,
} from '../dominio.ts'
import { casasDecimais, faixaDoValor, faixasOrdenadas, formatarNumero, limparRuido } from '../metrologia/index.ts'
import type { InstrumentoCalculo } from '../metrologia/index.ts'
import type {
  Balanca,
  CalibracaoInput,
  ClasseExatidao,
  EnsaioRepetibilidade,
  Faixa,
  MetodoCarregamento,
  Padrao,
  PecaCarga,
  PontoIndicacao,
  Unidade,
} from '../tipos.ts'
import { casasDaLeitura, instanteValido, numeroDaLeitura, numeroDoTexto, partesDoInstante, valorObservado } from './registro.ts'
import type {
  AnotacaoCampo,
  CampoConferir,
  ConferenciaCampo,
  Instante,
  LeituraCampo,
  LinhaAmbienteCampo,
  MedicaoDeltaTCampo,
  NumeroPasso,
  PacoteCampo,
  RegistroCampo,
} from './tipos.ts'

// ---- Pequenas ferramentas -------------------------------------------------------------------------------------------

const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** O instante em milissegundos (com o fuso dele); null se vazio ou inválido. */
export const msDoInstante = (v: Instante | null | undefined): number | null => (instanteValido(v) ? Date.parse(v) : null)

const num = (l: LeituraCampo | null | undefined): number | null => numeroDaLeitura(l)

const iguaisNumeros = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/** A conferência de um dado impresso (passos 2 e 3); undefined se a folha não a trouxe. */
export function conferenciaDe(registro: RegistroCampo, campo: CampoConferir): ConferenciaCampo | undefined {
  return [...registro.passos.chegada.conferencias, ...registro.passos.balanca.conferencias].find((c) => c.campo === campo)
}

/** O valor visto em campo de um dado marcado "Algo diferente…" (texto como digitado); null se conferido ou sem valor. */
function observadoDe(registro: RegistroCampo, campo: CampoConferir): string | null {
  const c = conferenciaDe(registro, campo)
  return c && c.confere === false ? (c.observado?.trim() ?? '') : null
}

// ---- A balança como o técnico a viu ---------------------------------------------------------------------------------

const UNIDADE_TEXTO = /^\s*(mg|g|kg|t)\s*$/i

function unidadeDoTexto(texto: unknown): Unidade | null {
  const m = typeof texto === 'string' ? UNIDADE_TEXTO.exec(texto) : null
  return m ? (m[1].toLowerCase() as Unidade) : null
}

/**
 * A unidade em que o técnico escreveu as leituras e as cargas digitadas: a da balança informada (folhas só do cliente e
 * em branco), a vista em campo (passo 3, "Algo diferente…" na unidade, com o valor) ou a do cadastro. Sem nenhuma, kg.
 */
export function unidadeDoRegistro(registro: RegistroCampo, pacote?: PacoteCampo | null): Unidade {
  const informada = registro.passos.balanca.informada
  if (informada) return informada.unidade || 'kg'
  const vista = unidadeDoTexto(observadoDe(registro, 'balanca.unidade'))
  if (vista) return vista
  return pacote?.balanca?.unidade ?? unidadeDoTexto(conferenciaDe(registro, 'balanca.unidade')?.mostrado) ?? 'kg'
}

/** "III", "classe III", "III (média)" → 'III'; "sem classe", "não marcada" → ''; null se não der para ler. */
export function classeDoTexto(texto: unknown): ClasseExatidao | null {
  if (typeof texto !== 'string') return null
  const t = texto.trim()
  if (!t) return null
  if (/sem\s+classe|n[ãa]o\s+marcad|sem\s+marca|nenhuma/i.test(t)) return ''
  // O numeral romano como uma palavra só ("média" não tem classe I dentro)
  const m = /(?:^|[^A-ZÀ-Ý])(IIII|III|II|I)(?![A-ZÀ-Ý])/.exec(t.toUpperCase().replace(/CLASSE/g, ' '))
  return m ? (m[1] as ClasseExatidao) : null
}

/**
 * Uma lista de valores de faixa como o técnico escreveu ("0,01", "50 g", "0,01/0,02 kg"), na unidade `unidade`; null se
 * algum não der para ler. A unidade escrita no fim vale para todos.
 */
function valoresDoTexto(texto: string, unidade: Unidade): number[] | null {
  const m = /^(.*?)\s*(mg|g|kg|t)?\s*$/i.exec(texto.trim())
  if (!m || !m[1].trim()) return null
  const de = (m[2]?.toLowerCase() as Unidade | undefined) ?? unidade
  const valores = m[1].split('/').map((x) => numeroDoTexto(x))
  if (valores.some((v) => v === null || !(v > 0))) return null
  return valores.map((v) => converterMassa(v!, de, unidade))
}

/** A balança que os avisos usam: o cadastro com os valores vistos em campo, ou a balança informada no local. */
export interface InstrumentoDoCampo {
  /** null sem a unidade (balança informada sem a unidade escolhida, ou a vista em campo ilegível). */
  instrumento: (InstrumentoCalculo & { min: number }) | null
  /** Os dados metrológicos vistos em campo que os avisos usam no lugar do cadastro ("d = 0,01 kg"). */
  observados: Array<{ campo: CampoConferir; texto: string }>
  /**
   * Dados metrológicos marcados "Algo diferente…" sem um valor que dê para ler (ou, na balança informada, em branco ou
   * ilegíveis): os avisos que dependem deles ficam desligados.
   */
  desligados: CampoConferir[]
  /** Folhas só do cliente e em branco: a balança é a informada no local. */
  informada: boolean
}

const ROTULO_METROLOGICO: Partial<Record<CampoConferir, string>> = {
  'balanca.unidade': 'unidade',
  'balanca.max': 'Max',
  'balanca.d': 'd',
  'balanca.e': 'e',
  'balanca.min': 'Min',
  'balanca.classe': 'classe',
}

/**
 * A balança como o técnico a viu: o cadastro (na unidade do registro) com os valores vistos em campo nos dados
 * metrológicos marcados "Algo diferente…" (d, e, Max, Min, classe, unidade), ou a balança informada no local.
 */
export function instrumentoDoCampo(registro: RegistroCampo, pacote?: PacoteCampo | null): InstrumentoDoCampo {
  const informada = registro.passos.balanca.informada
  const unidade = unidadeDoRegistro(registro, pacote)
  const observados: InstrumentoDoCampo['observados'] = []
  const desligados: CampoConferir[] = []
  if (informada) {
    if (!informada.unidade) return { instrumento: null, observados, desligados: ['balanca.unidade'], informada: true }
    const faixas: Faixa[] = []
    for (const f of informada.faixas) {
      if (!f.max.trim() && !f.d.trim() && !f.e.trim()) continue
      const max = valorObservado(f.max, unidade)
      const d = valorObservado(f.d, unidade)
      const e = f.e.trim() ? valorObservado(f.e, unidade) : d
      if (!(max !== null && max > 0)) desligados.push('balanca.max')
      if (!(d !== null && d > 0)) desligados.push('balanca.d')
      if (!(e !== null && e > 0)) desligados.push('balanca.e')
      if (max !== null && max > 0 && d !== null && d > 0 && e !== null && e > 0) faixas.push({ max, e, d })
    }
    if (!faixas.length) desligados.push('balanca.max', 'balanca.d', 'balanca.e')
    const min = informada.min.trim() ? valorObservado(informada.min, unidade) : 0
    if (min === null) desligados.push('balanca.min')
    return {
      instrumento: {
        unidade,
        classe: informada.classe,
        tipoFaixas: informada.tipoFaixas || (faixas.length > 1 ? 'MULTIPLAS_FAIXAS' : 'UNICA'),
        faixas: faixasOrdenadas(faixas),
        min: min ?? 0,
      },
      observados,
      desligados: [...new Set(desligados)],
      informada: true,
    }
  }
  const b = pacote?.balanca
  if (!b) return { instrumento: null, observados, desligados, informada: false }
  const unidadeVista = observadoDe(registro, 'balanca.unidade')
  if (unidadeVista !== null) {
    if (!unidadeDoTexto(unidadeVista)) return { instrumento: null, observados, desligados: ['balanca.unidade'], informada: false }
    observados.push({ campo: 'balanca.unidade', texto: `unidade = ${unidade}` })
  }
  const conv = (v: number) => converterMassa(v, b.unidade, unidade)
  const faixas = faixasOrdenadas(b.faixas).map((f) => ({ max: conv(f.max), e: conv(f.e), d: conv(f.d) }))
  for (const chave of ['max', 'd', 'e'] as const) {
    const campo = `balanca.${chave}` as CampoConferir
    const texto = observadoDe(registro, campo)
    if (texto === null) continue
    const valores = texto ? valoresDoTexto(texto, unidade) : null
    if (!valores || (valores.length !== 1 && valores.length !== faixas.length) || !faixas.length) {
      desligados.push(campo)
      continue
    }
    faixas.forEach((f, i) => (f[chave] = valores.length === 1 ? valores[0] : valores[i]))
    observados.push({
      campo,
      texto: `${ROTULO_METROLOGICO[campo]} = ${valores.map((v) => formatarNumero(v, casasDecimais(v))).join('/')} ${unidade}`,
    })
  }
  let classe: ClasseExatidao = b.classe
  const classeVista = observadoDe(registro, 'balanca.classe')
  if (classeVista !== null) {
    const lida = classeDoTexto(classeVista)
    if (lida === null) desligados.push('balanca.classe')
    else {
      classe = lida
      observados.push({ campo: 'balanca.classe', texto: lida ? `classe ${lida}` : 'sem classe' })
    }
  }
  let min = conv(b.min)
  const minVisto = observadoDe(registro, 'balanca.min')
  if (minVisto !== null) {
    const lido = minVisto ? valorObservado(minVisto, unidade) : null
    if (lido === null) desligados.push('balanca.min')
    else {
      min = lido
      observados.push({ campo: 'balanca.min', texto: `Min = ${formatarNumero(lido, casasDecimais(lido))} ${unidade}` })
    }
  }
  return {
    instrumento: { unidade, classe, tipoFaixas: b.tipoFaixas, faixas: faixasOrdenadas(faixas), min },
    observados,
    desligados,
    informada: false,
  }
}

/**
 * A balança como o técnico a viu, no formato do cadastro (para rodar as regras do sistema no celular): o cadastro com os
 * valores vistos em campo, ou a balança informada (sem cadastro); null sem unidade ou sem nenhuma faixa legível.
 */
export function balancaDoCampo(registro: RegistroCampo, pacote?: PacoteCampo | null): Balanca | null {
  const { instrumento } = instrumentoDoCampo(registro, pacote)
  if (!instrumento || !instrumento.faixas.length) return null
  const informada = registro.passos.balanca.informada
  const receptor = informada?.receptor
  const base: Balanca = pacote?.balanca ?? {
    ...BALANCA_VAZIA,
    id: '',
    versao: 0,
    criadoEm: '',
    atualizadoEm: '',
    clienteId: pacote?.cliente?.id ?? '',
    fabricante: informada?.fabricante ?? '',
    modelo: informada?.modelo ?? '',
    numeroSerie: informada?.numeroSerie ?? '',
    identificacao: informada?.identificacao ?? '',
    plataformaSerie: informada?.plataforma ?? '',
    portariaAprovacao: informada?.portariaAprovacao ?? '',
    localInstalacao: informada?.localInstalacao ?? '',
    anoFabricacao: informada?.anoFabricacao ?? '',
    receptor: receptor ? receptor : BALANCA_VAZIA.receptor,
    apoios: Number.parseInt(informada?.apoios ?? '', 10) || BALANCA_VAZIA.apoios,
  }
  return {
    ...base,
    unidade: instrumento.unidade,
    classe: instrumento.classe,
    tipoFaixas: instrumento.tipoFaixas,
    faixas: instrumento.faixas,
    min: instrumento.min,
  }
}

// ---- O que a folha pede no local ------------------------------------------------------------------------------------
// As mesmas regras da tela do celular (app-campo/src/nucleo/ordem.ts) e do papel (server/pdf/folhaCampo.ts): a
// comparação com o rascunho só conta como divergência a leitura que o técnico tinha como fazer.

/** O método de carregamento da folha (o do plano; sem plano, o do rascunho do pacote). */
export function metodoDaFolha(pacote: PacoteCampo | null | undefined): MetodoCarregamento {
  return pacote?.plano?.metodo ?? pacote?.entrada.indicacao.metodo ?? 'CRESCENTE_DECRESCENTE'
}

/** As colunas do passo 5: lê a subida? lê a descida? */
export function colunasDaIndicacao(pacote: PacoteCampo | null | undefined): { sobe: boolean; desce: boolean } {
  const m = metodoDaFolha(pacote)
  return { sobe: m !== 'DECRESCENTE', desce: m === 'CRESCENTE_DECRESCENTE' || m === 'DECRESCENTE' }
}

/** Max da balança como o técnico a viu (o plano, o valor visto ou a informada), na unidade do registro; null se desconhecido. */
export function maxDaFolha(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): number | null {
  const i = instrumentoDoCampo(registro, pacote).instrumento
  if (i && i.faixas.length) return i.faixas[i.faixas.length - 1].max
  return pacote?.plano?.max ?? null
}

/** O zero antes de cada posição da excentricidade (classe I, método 3 do sistema). */
export function excentricidadeComZero(registro: RegistroCampo, pacote: PacoteCampo | null | undefined): boolean {
  return (
    pacote?.plano?.excentricidade.metodo === 3 ||
    pacote?.entrada.excentricidade.metodo === 3 ||
    registro.passos.indicacao.calInterno !== null
  )
}

// ---- Horários: o ambiente que vale, o ΔT que vale e a aclimatação ----------------------------------------------------

/** O instante da 1ª leitura do erro de indicação (o 1º ensaio, na ordem da folha); null sem leituras com hora. */
export function inicioDosEnsaios(registro: RegistroCampo): number | null {
  const ind = registro.passos.indicacao
  const lidas: Array<LeituraCampo | null> = [
    ...ind.pontos.flatMap((p) => [p.crescente, p.decrescente]),
    ind.retornoZero,
    ...(ind.substituicao?.etapas.flatMap((e) => [e.padroes, e.substituicao]) ?? []),
  ]
  const tempos = lidas.map((l) => msDoInstante(l?.em)).filter((t): t is number => t !== null)
  return tempos.length ? Math.min(...tempos) : null
}

const temDado = (l: LinhaAmbienteCampo) => !!(l.temperatura || l.umidade || l.pressao)
const horaDaLinha = (l: LinhaAmbienteCampo) =>
  msDoInstante(l.em) ?? msDoInstante(l.temperatura?.em) ?? msDoInstante(l.umidade?.em) ?? msDoInstante(l.pressao?.em)

/**
 * A linha do início do ambiente que vale (a do certificado): a última do início (ou do início repetido, na classe I,
 * depois de aguardar a aclimatação) medida antes do 1º ensaio; sem hora para comparar, a última com dados. -1 se não há.
 */
export function indiceInicioValido(registro: RegistroCampo): number {
  const linhas = registro.passos.ambiente.linhas
  const inicio = inicioDosEnsaios(registro)
  const candidatas = linhas.map((l, i) => ({ l, i })).filter((x) => x.l.momento !== 'FIM')
  const comDado = candidatas.filter((x) => temDado(x.l))
  const antes = comDado.filter((x) => {
    const t = horaDaLinha(x.l)
    return inicio === null || t === null || t <= inicio
  })
  return (antes.at(-1) ?? comDado.at(-1) ?? candidatas[0])?.i ?? -1
}

/** A linha do fim do ambiente (a última, de preferência com dados); -1 se não há. */
export function indiceFimValido(registro: RegistroCampo): number {
  const fins = registro.passos.ambiente.linhas.map((l, i) => ({ l, i })).filter((x) => x.l.momento === 'FIM')
  return (fins.filter((x) => temDado(x.l)).at(-1) ?? fins.at(-1))?.i ?? -1
}

/**
 * Classe I: a medição do ΔT pesos − ar que vale (POP 7.4): a última antes do 1º ensaio; se todas forem depois (ou sem
 * hora), a última. Cada medição é uma observação própria: as de antes ficam no registro, nunca viram "correção".
 */
export function indiceDeltaTValido(registro: RegistroCampo): number {
  const medicoes = registro.passos.ambiente.deltaT
  if (!medicoes.length) return -1
  const inicio = inicioDosEnsaios(registro)
  let valido = -1
  medicoes.forEach((m, i) => {
    const t = msDoInstante(m.valor.em)
    if (inicio === null || t === null || t <= inicio) valido = i
  })
  return valido >= 0 ? valido : medicoes.length - 1
}

/** O ΔT que vale (classe I); null sem medição. */
export function deltaTValido(registro: RegistroCampo): MedicaoDeltaTCampo | null {
  const i = indiceDeltaTValido(registro)
  return i >= 0 ? registro.passos.ambiente.deltaT[i] : null
}

/** O sistema aceita até 48 h de aclimatação (`FAIXAS_AMBIENTE.minutos`); mais que isso conta como 48 h. */
export const MINUTOS_ACLIMATACAO_MAX = 2880

/**
 * Classe I sem o termômetro de duas entradas: os minutos de aclimatação dos pesos, dos horários brutos — desde quando os
 * pesos estão no local (`pesosNoLocalDesde`, que aceita a véspera) ou, sem ele, da hora de início (passo 2), até o 1º
 * ensaio (ou, sem leituras, a linha do início do ambiente). Pelos instantes absolutos, com o fuso: passa da meia-noite e
 * dura dois dias. Mais de 48 h conta como 48 h (o máximo do sistema). null sem os dois horários (ou fora de ordem).
 */
export function minutosDeAclimatacao(registro: RegistroCampo): number | null {
  const a = registro.passos.ambiente
  const desde = msDoInstante(a.pesosNoLocalDesde) ?? msDoInstante(registro.passos.chegada.inicio)
  const iInicio = indiceInicioValido(registro)
  const ate = inicioDosEnsaios(registro) ?? (iInicio >= 0 ? horaDaLinha(a.linhas[iInicio]) : null)
  if (desde === null || ate === null || ate < desde) return null
  return Math.min(MINUTOS_ACLIMATACAO_MAX, Math.floor((ate - desde) / 60_000))
}

/** ΔT0 pela aclimatação: a temperatura de onde os pesos vieram menos a da sala (pesos mais frios: negativo). */
export function deltaT0DoCampo(registro: RegistroCampo): number | null {
  const d = registro.passos.ambiente.deltaT0
  const origem = num(d?.origem)
  const sala = num(d?.sala)
  return origem === null || sala === null ? null : limparRuido(origem - sala, Math.max(Math.abs(origem), Math.abs(sala)))
}

// ---- Correções depois da assinatura -----------------------------------------------------------------------------------

const CHAVES_DE_LEITURA = new Set([
  'crescente',
  'decrescente',
  'cargaAplicada',
  'retornoZero',
  'padroes',
  'substituicao',
  'temperatura',
  'umidade',
  'pressao',
  'valor',
  'origem',
  'sala',
  'zeroAntes',
  'leitura',
])

const ehLeitura = (v: unknown): v is LeituraCampo =>
  !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as LeituraCampo).valor === 'string' && 'em' in v

/**
 * O registro com as correções depois da assinatura aplicadas, na ordem (cada uma por acréscimo, com PIN e motivo: o valor
 * assinado continua no registro guardado, e o corrigido é o que vale para a calibração). O caminho de cada correção é o
 * de `passos` (tipos.ts): a leitura corrigida ganha o texto novo e fica com a hora da observação (corrigir a digitação
 * não muda quando foi lido: a hora decide o ΔT e a linha do início que valem, e a correção guarda a dela); a leitura que
 * estava em branco ganha a hora da correção. Um texto (motivo, endereço, data) troca o texto. Caminho que não existe:
 * ignorado. Sem correções, o mesmo registro.
 */
export function registroCorrigido(registro: RegistroCampo): RegistroCampo {
  if (!registro.correcoesPosAssinatura?.length) return registro
  const r = copia(registro)
  for (const c of r.correcoesPosAssinatura) {
    const partes = c.campo.split('.')
    let no: unknown = r.passos
    for (const p of partes.slice(0, -1)) {
      if (Array.isArray(no)) no = no.find((x) => (x as { id?: string })?.id === p) ?? no[Number(p)]
      else if (no && typeof no === 'object') no = (no as Record<string, unknown>)[p]
      else no = undefined
    }
    const chave = partes.at(-1)!
    if (!no || typeof no !== 'object') continue
    const lista = Array.isArray(no) ? (no as unknown[]) : null
    const indice = lista ? lista.findIndex((x) => (x as { id?: string })?.id === chave) : -1
    const k = lista ? (indice >= 0 ? indice : Number(chave)) : chave
    if (lista && !(typeof k === 'number' && Number.isInteger(k) && k >= 0 && k < lista.length)) continue
    const alvo = no as Record<string | number, unknown>
    const atual = alvo[k]
    if (ehLeitura(atual) || (atual === null && (lista ? /leituras$/.test(partes.at(-2) ?? '') : CHAVES_DE_LEITURA.has(chave)))) {
      const em = ehLeitura(atual) && atual.em ? atual.em : c.em
      alvo[k] = c.para.trim() ? { valor: c.para.trim(), em, via: 'teclado' } : null
    } else if (typeof atual === 'string') alvo[k] = c.para
  }
  return r
}

// ---- O registro como rascunho ----------------------------------------------------------------------------------------

/** Os padrões usados no local: os marcados "Usado" (passo 1), os instrumentos do ambiente e o do ΔT, na ordem do pacote. */
export function padroesUsadosNoCampo(registro: RegistroCampo, pacote?: PacoteCampo | null): string[] {
  const ids = new Set<string>()
  for (const p of registro.passos.padroes) if (p.usado) ids.add(p.id)
  for (const l of registro.passos.ambiente.linhas) for (const id of l.instrumentos) if (id) ids.add(id)
  for (const m of registro.passos.ambiente.deltaT) if (m.instrumento) ids.add(m.instrumento)
  const ordem = pacote?.padroes.cadastro.map((p) => p.id) ?? []
  return [...ids].sort((a, b) => {
    const ia = ordem.indexOf(a)
    const ib = ordem.indexOf(b)
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)
  })
}

/** Os padrões do cadastro do pacote com os ids pedidos (como o sistema os usa). */
export function padroesDoPacote(pacote: PacoteCampo | null | undefined, ids: readonly string[]): Padrao[] {
  const porId = new Map((pacote?.padroes.cadastro ?? []).map((p) => [p.id, p as Padrao]))
  return ids.map((id) => porId.get(id)).filter((p): p is Padrao => !!p)
}

/** A data da calibração do registro: a do passo 8 ou, sem ela, o dia em que a folha foi começada. */
export function dataDoRegistro(registro: RegistroCampo): string {
  const d = registro.passos.final.dataCalibracao
  if (dataIsoValida(d)) return d
  return partesDoInstante(registro.passos.chegada.inicio)?.data ?? partesDoInstante(registro.relogio.iniciadoEm)?.data ?? ''
}

/**
 * O registro como um rascunho da calibração, na unidade do registro (`unidadeDoRegistro`): sobre o rascunho do pacote (o
 * plano, as opções, a conformidade e o resto que só o escritório preenche), o que o técnico anotou — a data real, o
 * técnico (o dono do celular), onde e o endereço, a OS escrita no local, os padrões usados, o ambiente (a linha do início
 * que vale, a do fim; a pressão do início, ou a do fim se a do início ficou em branco; o ΔT que vale; a aclimatação), o
 * CAL da classe I, os pontos (a carga digitada ou a da folha, as peças, as leituras; as peças dos pontos acrescentados
 * sem peças são montadas com os pesos usados, como o editor faz ao abrir), o retorno ao zero, as etapas de substituição,
 * a repetibilidade e a excentricidade, com as correções depois da assinatura (`registroCorrigido`). As leituras viram
 * número sem perder casas ("100,05" → 100,05). As tentativas descartadas e as anotações não entram. Sem o pacote
 * (órfão), sobre um rascunho vazio, com as cargas lidas do texto.
 */
export function registroParaRascunho(original: RegistroCampo, pacote?: PacoteCampo | null): CalibracaoInput {
  const registro = registroCorrigido(original)
  const ps = registro.passos
  const unidade = unidadeDoRegistro(registro, pacote)
  const unidadePacote = pacote?.balanca?.unidade ?? unidade
  const informada = ps.balanca.informada
  const classe = informada ? informada.classe : (pacote?.balanca?.classe ?? '')
  const vazia = calibracaoVazia(undefined, classe || undefined)
  let base: CalibracaoInput = copia(pacote?.entrada ?? vazia)
  if (unidadePacote !== unidade) base = calibracaoEmOutraUnidade(base, unidadePacote, unidade)
  const conv = (v: number) => converterMassa(v, unidadePacote, unidade)
  const cargaDoTexto = (t: string) => conv(numeroDoTexto(t) ?? 0)

  // Identificação
  const data = dataDoRegistro(registro)
  const padroesIds = padroesUsadosNoCampo(registro, pacote)
  const padroes = padroesDoPacote(pacote, padroesIds)

  // Ambiente
  const linhas = ps.ambiente.linhas
  const ini = linhas[indiceInicioValido(registro)] ?? null
  const fim = linhas[indiceFimValido(registro)] ?? null
  const dt = deltaTValido(registro)
  const deltaT0 = deltaT0DoCampo(registro)
  const minutos = minutosDeAclimatacao(registro)

  // Erro de indicação
  const pontosBase = new Map(base.indicacao.pontos.map((p) => [p.id, p]))
  const sub = ps.indicacao.substituicao
  const substituicao = sub
    ? {
        ativa: base.indicacao.substituicao.ativa || sub.etapas.length > 0,
        pecas: base.indicacao.substituicao.pecas,
        etapas: sub.etapas.map((e) => ({ leituraPadroes: num(e.padroes), leituraSubstituicao: num(e.substituicao) })),
      }
    : base.indicacao.substituicao
  const balanca = pacote?.balanca && unidadePacote === unidade ? pacote.balanca : undefined
  const etapa = cargaDaEtapa({ substituicao }, padroes, unidade)
  const pontos: PontoIndicacao[] = ps.indicacao.pontos.map((pt) => {
    const b = pontosBase.get(pt.id)
    const carga = num(pt.cargaAplicada) ?? b?.carga ?? cargaDoTexto(pt.cargaPrevista)
    let pecas: PecaCarga[] = copia(pt.pecas)
    let pecasManuais = pt.pecasTrocadas || (b?.pecasManuais ?? false)
    // Ponto acrescentado no local sem as peças: montadas com os pesos usados, como o editor faz ao abrir (recomporCargas)
    if (!pecas.length && !pt.pecasTrocadas && carga > 0 && pacote) {
      const nivel = substituicao.ativa ? pt.nivelSubstituicao : 0
      pecas = montarPonto(carga, nivel, etapa, unidade, padroes, balanca).pecas
      pecasManuais = false
    }
    return {
      id: pt.id,
      carga,
      pecas,
      pecasManuais,
      crescente: num(pt.crescente),
      decrescente: num(pt.decrescente),
      nivelSubstituicao: pt.nivelSubstituicao,
    }
  })

  // Repetibilidade e excentricidade
  const repBase = new Map(base.repetibilidade.map((r) => [r.id, r]))
  const repetibilidade: EnsaioRepetibilidade[] = ps.repetibilidade.map((r) => ({
    id: r.id,
    carga: num(r.cargaAplicada) ?? repBase.get(r.id)?.carga ?? cargaDoTexto(r.cargaPrevista),
    leituras: r.leituras.map((l) => num(l)),
  }))
  const e = ps.excentricidade
  const cargaExc =
    num(e.cargaAplicada) ?? (base.excentricidade.carga > 0 ? base.excentricidade.carga : cargaDoTexto(e.cargaPrevista))

  return {
    ...base,
    dataCalibracao: data || base.dataCalibracao,
    tecnicoId: registro.tecnico.id || base.tecnicoId,
    local: ps.chegada.local || base.local,
    localEndereco: ps.chegada.localEndereco.trim() || pacote?.folha.localEndereco || base.localEndereco,
    ordemServico: ps.chegada.os.trim() || pacote?.folha.os || base.ordemServico,
    padroesIds,
    ambiente: {
      ...base.ambiente,
      temperaturaInicial: num(ini?.temperatura),
      umidadeInicial: num(ini?.umidade),
      temperaturaFinal: num(fim?.temperatura),
      umidadeFinal: num(fim?.umidade),
      // A pressão do certificado é a do início (como o escritório faz hoje); a do fim só quando a do início ficou em branco
      pressao: num(ini?.pressao) ?? num(fim?.pressao),
      deltaTPesos: dt ? num(dt.valor) : null,
      aclimatacao: deltaT0 !== null && minutos !== null ? { deltaT0, minutos } : null,
    },
    ajuste: ps.indicacao.calInterno
      ? { realizado: ps.indicacao.calInterno.feito ? 'INTERNO' : 'NAO', descricao: base.ajuste.descricao }
      : base.ajuste,
    indicacao: {
      ...base.indicacao,
      metodo: pacote?.plano ? base.indicacao.metodo : informada ? metodoIndicacaoPadrao(classe) : base.indicacao.metodo,
      pontos,
      retornoZero: num(ps.indicacao.retornoZero),
      substituicao,
    },
    repetibilidade,
    excentricidade: {
      ...base.excentricidade,
      aplicavel: e.aplicavel === true,
      motivo: e.aplicavel === true ? '' : e.motivo,
      carga: cargaExc,
      posicoes: e.posicoes.map((x) => ({ rotulo: x.rotulo, leitura: num(x.leitura), referencia: num(x.zeroAntes) })),
    },
  }
}

// ---- Comparar com o rascunho -----------------------------------------------------------------------------------------

/**
 * Como o dado do celular está em relação ao rascunho: IGUAL; VAZIO_NO_RASCUNHO (recebe o do celular); DIFERENTE (os
 * dois; o do celular vem marcado: é o registro original assinado); VAZIO_NO_CELULAR (só o rascunho tem: fica);
 * SO_NO_CELULAR (ponto ou ensaio do celular sem par no rascunho: "do celular, sem par", para decidir) e SO_NO_RASCUNHO
 * (ponto ou ensaio que só o rascunho tem: fica).
 */
export type SituacaoDiferenca =
  'IGUAL' | 'VAZIO_NO_RASCUNHO' | 'DIFERENTE' | 'VAZIO_NO_CELULAR' | 'SO_NO_CELULAR' | 'SO_NO_RASCUNHO'

export type EscolhaCampo = 'CELULAR' | 'RASCUNHO'
/** A escolha de cada diferença, pela chave; sem escolha, vale a sugestão. */
export type EscolhasCampo = Record<string, EscolhaCampo>

export type GrupoDiferenca = 'identificacao' | 'padroes' | 'ambiente' | 'indicacao' | 'repetibilidade' | 'excentricidade'

export interface DiferencaCampo {
  /** Chave estável do dado ("ambiente.pressao", "indicacao.pontos.p3.crescente", "repetibilidade.rep1.leituras.4"). */
  chave: string
  grupo: GrupoDiferenca
  passo: NumeroPasso
  rotulo: string
  /** O valor do celular, como foi digitado (ou convertido, se a unidade mudou); '' = vazio. */
  celular: string
  /** O valor do rascunho; '' = vazio. */
  rascunho: string
  situacao: SituacaoDiferenca
  /** O que fica sem escolha: o do celular, salvo quando só o rascunho tem o dado. */
  sugestao: EscolhaCampo
  /** Dado bruto (leitura, carga, ambiente, data, padrões): mudado depois de puxar, pede a justificativa na emissão. */
  bruto: boolean
}

/** Um dado impresso que o técnico viu diferente ("Algo diferente…"): no metrológico, com o valor visto. */
export interface CadastroDiferente {
  campo: CampoConferir
  rotulo: string
  mostrado: string
  /** O valor visto em campo (metrológicos); '' = só a anotação. */
  observado: string
  /** O texto da anotação "Dado impresso diferente" do campo, se houver. */
  anotacao: string
  /** d, e, Max, Min, classe ou unidade: "Cadastro da balança diferente"; o escritório corrige o cadastro antes de emitir. */
  metrologico: boolean
}

export interface ComparacaoCampo {
  numero: string
  /** Todos os dados comparados, também os iguais (a tela esconde: "38 iguais"). */
  itens: DiferencaCampo[]
  iguais: number
  /** O rascunho ainda não tem leituras: "Puxar" preenche tudo. */
  rascunhoSemLeituras: boolean
  /** As anotações do técnico: aparecem ao lado, nunca vão sozinhas para as observações do certificado. */
  anotacoes: AnotacaoCampo[]
  /** Dados impressos que o técnico viu diferentes (os do cadastro do cliente e da balança). */
  cadastroDiferente: CadastroDiferente[]
  /** Frases para a tela (desfecho, unidade convertida, tentativas descartadas, piloto). */
  avisos: string[]
}

export interface OpcoesComparar {
  /** A unidade da balança hoje, no escritório (a do rascunho); se for outra, o registro é convertido. */
  unidadeAtual?: Unidade
  /** Nomes dos usuários pelo id (para mostrar o técnico do rascunho). */
  nomes?: Record<string, string>
  /** Meses da próxima calibração padrão (Configurações), para a próxima acompanhar a data real. Padrão: 12. */
  mesesProxima?: number
}

interface ItemInterno extends DiferencaCampo {
  /** Faz no rascunho (uma cópia) o que o celular tem neste dado. */
  aplicar: (k: CalibracaoInput) => void
}

const textoNumero = (v: number | null, casasRef = 0) =>
  v === null ? '' : formatarNumero(v, Math.max(casasDecimais(v), casasRef))

function situacaoDe(celular: unknown, rascunho: unknown, igual: boolean): SituacaoDiferenca {
  const vazio = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)
  if (vazio(celular) && vazio(rascunho)) return 'IGUAL'
  if (vazio(rascunho)) return 'VAZIO_NO_RASCUNHO'
  if (vazio(celular)) return 'VAZIO_NO_CELULAR'
  return igual ? 'IGUAL' : 'DIFERENTE'
}

const sugestaoDe = (s: SituacaoDiferenca): EscolhaCampo =>
  s === 'VAZIO_NO_CELULAR' || s === 'SO_NO_RASCUNHO' ? 'RASCUNHO' : 'CELULAR'

const leiturasDoPonto = (p: Pick<PontoIndicacao, 'crescente' | 'decrescente'>) => p.crescente !== null || p.decrescente !== null

/** O rascunho tem alguma leitura (erro de indicação, substituição, repetibilidade, excentricidade)? */
export function rascunhoTemLeituras(k: Pick<CalibracaoInput, 'indicacao' | 'repetibilidade' | 'excentricidade'>): boolean {
  return (
    k.indicacao.pontos.some(leiturasDoPonto) ||
    k.indicacao.retornoZero !== null ||
    k.indicacao.substituicao.etapas.some((e) => e.leituraPadroes !== null || e.leituraSubstituicao !== null) ||
    k.repetibilidade.some((r) => r.leituras.some((l) => l !== null)) ||
    k.excentricidade.posicoes.some((p) => p.leitura !== null || p.referencia !== null)
  )
}

/** Casa os itens do celular com os do rascunho: pelo id e, sem id, pela carga (com tolerância); cada um uma vez. */
function casar<C extends { id: string; carga: number }, R extends { id: string; carga: number }>(
  doCelular: C[],
  doRascunho: R[],
  tolerancia: (carga: number) => number,
): { pares: Array<[C, R]>; soCelular: C[]; soRascunho: R[] } {
  const livres = new Set(doRascunho)
  const pares: Array<[C, R]> = []
  const semPar: C[] = []
  for (const c of doCelular) {
    const r = doRascunho.find((x) => x.id === c.id && livres.has(x))
    if (r) {
      livres.delete(r)
      pares.push([c, r])
    } else semPar.push(c)
  }
  const soCelular: C[] = []
  for (const c of semPar) {
    const tol = tolerancia(c.carga)
    let melhor: R | undefined
    for (const r of livres) {
      // Um id que o celular também tem fica para o par dele
      if (doCelular.some((x) => x.id === r.id)) continue
      const dif = Math.abs(r.carga - c.carga)
      if (dif <= tol && (!melhor || dif < Math.abs(melhor.carga - c.carga))) melhor = r
    }
    if (melhor) {
      livres.delete(melhor)
      pares.push([c, melhor])
    } else soCelular.push(c)
  }
  return { pares, soCelular, soRascunho: doRascunho.filter((r) => livres.has(r)) }
}

/** Um id que não colide com os do rascunho (o ponto do celular acrescentado). */
function idLivre(id: string, usados: Set<string>): string {
  if (!usados.has(id)) return id
  let n = 2
  while (usados.has(`${id}-${n}`)) n++
  return `${id}-${n}`
}

/** Insere o ponto na ordem das cargas (os sem carga no começo), como a tabela da folha. */
function inserirPorCarga(pontos: PontoIndicacao[], ponto: PontoIndicacao): void {
  const i = pontos.findIndex((p) => p.carga > ponto.carga && p.carga > 0)
  if (i < 0) pontos.push(ponto)
  else pontos.splice(i, 0, ponto)
}

function compararInterno(
  rascunho: CalibracaoInput,
  original: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  opcoes: OpcoesComparar,
): { itens: ItemInterno[]; comparacao: Omit<ComparacaoCampo, 'itens' | 'iguais'> } {
  const registro = registroCorrigido(original)
  const ps = registro.passos
  const unidadeCampo = unidadeDoRegistro(registro, pacote)
  const unidade = opcoes.unidadeAtual ?? unidadeCampo
  const convertido = unidade !== unidadeCampo
  let campo = registroParaRascunho(registro, pacote)
  if (convertido) campo = calibracaoEmOutraUnidade(campo, unidadeCampo, unidade)
  const instr = instrumentoDoCampo(registro, pacote).instrumento
  const faixas =
    instr && instr.faixas.length
      ? { ...instr, faixas: instr.faixas.map((f) => ({ max: conv(f.max), e: conv(f.e), d: conv(f.d) })) }
      : null
  function conv(v: number) {
    return convertido ? converterMassa(v, unidadeCampo, unidade) : v
  }
  const tolerancia = (carga: number) =>
    Math.max(faixas ? faixaDoValor(carga, faixas).d / 2 : 0, 1e-9 * Math.max(1, Math.abs(carga)))
  const itens: ItemInterno[] = []
  const padroes = pacote?.padroes.cadastro ?? []
  const nomePadrao = (id: string) => padroes.find((p) => p.id === id)?.identificacao ?? id
  const u = ` ${unidade}`
  const textoCarga = (c: number) => {
    const d = faixas && c > 0 ? faixaDoValor(c, faixas).d : 0
    return `${formatarNumero(c, Math.max(casasDecimais(d), casasDecimais(c)))}${u}`
  }

  /** A carga como o técnico a viu: a digitada ou, sem ela, a da folha ("100,00"). */
  const cargaEscrita = (x: { cargaAplicada: LeituraCampo | null; cargaPrevista: string }): LeituraCampo | null =>
    x.cargaAplicada ?? (x.cargaPrevista ? { valor: x.cargaPrevista, em: '', via: 'teclado' } : null)
  /**
   * Uma leitura: o texto como foi digitado (sem conversão) e o número do rascunho. `coletado`: a folha pede essa leitura
   * no local; a que o celular nunca pede (a descida no zero e em Max, a coluna fora do método, o zero antes fora do
   * método 3) e só o rascunho tem continua na tabela, mas não é dado bruto do campo (não pede a justificativa).
   */
  const leitura = (
    chave: string,
    grupo: GrupoDiferenca,
    passo: NumeroPasso,
    rotulo: string,
    doCampo: LeituraCampo | null,
    noCampo: number | null,
    noRascunho: number | null,
    aplicar: (k: CalibracaoInput, v: number | null) => void,
    ehMassa = true,
    coletado = true,
  ) => {
    const casas = doCampo ? casasDaLeitura(doCampo) : 0
    const celular =
      noCampo === null ? '' : ehMassa && convertido ? textoNumero(noCampo) : (doCampo?.valor ?? textoNumero(noCampo))
    const situacao = situacaoDe(
      noCampo,
      noRascunho,
      noCampo !== null && noRascunho !== null && iguaisNumeros(noCampo, noRascunho),
    )
    itens.push({
      chave,
      grupo,
      passo,
      rotulo,
      celular,
      rascunho: textoNumero(noRascunho, ehMassa && convertido ? 0 : casas),
      situacao,
      sugestao: sugestaoDe(situacao),
      bruto: coletado || noCampo !== null,
      aplicar: (k) => aplicar(k, noCampo),
    })
  }
  const textoItem = (
    chave: string,
    grupo: GrupoDiferenca,
    passo: NumeroPasso,
    rotulo: string,
    celular: string,
    rascunhoTexto: string,
    igual: boolean,
    aplicar: (k: CalibracaoInput) => void,
    bruto: boolean,
    situacaoForcada?: SituacaoDiferenca,
  ) => {
    const situacao = situacaoForcada ?? situacaoDe(celular, rascunhoTexto, igual)
    itens.push({
      chave,
      grupo,
      passo,
      rotulo,
      celular,
      rascunho: rascunhoTexto,
      situacao,
      sugestao: sugestaoDe(situacao),
      bruto,
      aplicar,
    })
  }

  // ---- Identificação (passos 2 e 8)
  const dataNova = campo.dataCalibracao
  textoItem(
    'dataCalibracao',
    'identificacao',
    8,
    'Data da calibração',
    dataIsoValida(dataNova) ? dataNova.split('-').reverse().join('/') : '',
    dataIsoValida(rascunho.dataCalibracao) ? rascunho.dataCalibracao.split('-').reverse().join('/') : '',
    dataNova === rascunho.dataCalibracao,
    (k) => {
      // A data real no lugar da prevista; a próxima calibração acompanha (como ao ligar a folha)
      const antiga = k.dataCalibracao
      k.dataCalibracao = dataNova
      k.proximaCalibracao = proximaAcompanhando(k.proximaCalibracao, antiga, dataNova, opcoes.mesesProxima ?? 12)
    },
    true,
  )
  const nome = (id: string) => (id === registro.tecnico.id ? registro.tecnico.nome : (opcoes.nomes?.[id] ?? id))
  textoItem(
    'tecnicoId',
    'identificacao',
    2,
    'Técnico que executou',
    campo.tecnicoId ? nome(campo.tecnicoId) : '',
    rascunho.tecnicoId ? nome(rascunho.tecnicoId) : '',
    campo.tecnicoId === rascunho.tecnicoId,
    (k) => (k.tecnicoId = campo.tecnicoId),
    false,
  )
  if (ps.chegada.local)
    textoItem(
      'local',
      'identificacao',
      2,
      'Onde a calibração foi feita',
      LOCAIS[ps.chegada.local],
      LOCAIS[rascunho.local] ?? '',
      ps.chegada.local === rascunho.local,
      (k) => (k.local = ps.chegada.local || k.local),
      false,
    )
  // O endereço e a OS: o escrito no local; o impresso (conferido) só preenche o vazio, nunca desfaz o que o escritório mudou
  const enderecoEscrito = ps.chegada.localEndereco.trim()
  const endereco = campo.localEndereco.trim()
  if (endereco) {
    const s = situacaoDe(endereco, rascunho.localEndereco.trim(), endereco === rascunho.localEndereco.trim())
    textoItem(
      'localEndereco',
      'identificacao',
      2,
      'Endereço da calibração',
      endereco,
      rascunho.localEndereco.trim(),
      false,
      (k) => (k.localEndereco = endereco),
      false,
      s === 'DIFERENTE' && !enderecoEscrito ? 'VAZIO_NO_CELULAR' : s,
    )
  }
  const osEscrita = ps.chegada.os.trim()
  const os = campo.ordemServico.trim()
  if (os) {
    const s = situacaoDe(os, rascunho.ordemServico.trim(), os === rascunho.ordemServico.trim())
    textoItem(
      'ordemServico',
      'identificacao',
      2,
      'Nº da OS',
      os,
      rascunho.ordemServico.trim(),
      false,
      (k) => (k.ordemServico = os),
      false,
      s === 'DIFERENTE' && !osEscrita ? 'VAZIO_NO_CELULAR' : s,
    )
  }

  // ---- Padrões (passo 1) e CAL (classe I)
  const mesmos = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
  textoItem(
    'padroesIds',
    'padroes',
    1,
    'Padrões usados',
    campo.padroesIds.map(nomePadrao).join(', '),
    rascunho.padroesIds.map(nomePadrao).join(', '),
    mesmos(campo.padroesIds, rascunho.padroesIds),
    (k) => (k.padroesIds = [...campo.padroesIds]),
    true,
  )
  if (ps.indicacao.calInterno) {
    const rotuloAjuste = (r: string) => (r === 'INTERNO' ? 'Feito' : r === 'NAO' ? 'Não feito' : 'Ajuste externo')
    textoItem(
      'ajuste.realizado',
      'indicacao',
      5,
      'Ajuste interno (CAL) antes dos ensaios',
      rotuloAjuste(campo.ajuste.realizado),
      rotuloAjuste(rascunho.ajuste.realizado),
      campo.ajuste.realizado === rascunho.ajuste.realizado,
      (k) => (k.ajuste = { ...k.ajuste, realizado: campo.ajuste.realizado }),
      true,
    )
  }

  // ---- Ambiente (passo 4)
  const linhas = ps.ambiente.linhas
  const ini = linhas[indiceInicioValido(registro)] ?? null
  const fim = linhas[indiceFimValido(registro)] ?? null
  const dt = deltaTValido(registro)
  const amb = (
    chave: keyof Pick<
      CalibracaoInput['ambiente'],
      'temperaturaInicial' | 'temperaturaFinal' | 'umidadeInicial' | 'umidadeFinal' | 'pressao' | 'deltaTPesos'
    >,
    rotulo: string,
    l: LeituraCampo | null,
  ) =>
    leitura(
      `ambiente.${chave}`,
      'ambiente',
      4,
      rotulo,
      l,
      campo.ambiente[chave] ?? null,
      rascunho.ambiente[chave] ?? null,
      (k, v) => (k.ambiente = { ...k.ambiente, [chave]: v }),
      false,
    )
  amb('temperaturaInicial', 'Temperatura no início', ini?.temperatura ?? null)
  amb('umidadeInicial', 'Umidade no início', ini?.umidade ?? null)
  amb('pressao', 'Pressão', ini?.pressao ?? fim?.pressao ?? null)
  amb('temperaturaFinal', 'Temperatura no fim', fim?.temperatura ?? null)
  amb('umidadeFinal', 'Umidade no fim', fim?.umidade ?? null)
  if (dt || (rascunho.ambiente.deltaTPesos ?? null) !== null) amb('deltaTPesos', 'ΔT pesos − ar', dt?.valor ?? null)
  const ac = campo.ambiente.aclimatacao ?? null
  const acR = rascunho.ambiente.aclimatacao ?? null
  if (ac || acR) {
    const texto = (a: { deltaT0: number; minutos: number } | null) =>
      a ? `ΔT0 ${formatarNumero(a.deltaT0, Math.max(1, casasDecimais(a.deltaT0)))} °C · ${a.minutos} min` : ''
    textoItem(
      'ambiente.aclimatacao',
      'ambiente',
      4,
      'Aclimatação dos pesos',
      texto(ac),
      texto(acR),
      !!ac && !!acR && iguaisNumeros(ac.deltaT0, acR.deltaT0) && ac.minutos === acR.minutos,
      (k) => (k.ambiente = { ...k.ambiente, aclimatacao: ac ? { ...ac } : null }),
      true,
    )
  }

  // ---- Erro de indicação (passo 5)
  const pontosCampo = campo.indicacao.pontos
  const pontosCelular = new Map(ps.indicacao.pontos.map((p) => [p.id, p]))
  const { pares, soCelular, soRascunho } = casar(pontosCampo, rascunho.indicacao.pontos, tolerancia)
  // O que o celular pede no passo 5 (como o papel): a subida fora do "Decrescente"; a descida no "crescente e decrescente"
  // e no "Decrescente", nunca no zero nem em Max (a virada) no "crescente e decrescente"
  const { sobe, desce } = colunasDaIndicacao(pacote)
  const maxFolha = maxDaFolha(registro, pacote)
  const maxCmp = maxFolha !== null && maxFolha > 0 ? conv(maxFolha) : 0
  const comDescida = (carga: number) => desce && (!sobe || (carga > 0 && !(maxCmp > 0 && carga >= maxCmp * (1 - 1e-9))))
  for (const [c, r] of pares) {
    const pc = pontosCelular.get(c.id)!
    const rot = `Ponto de ${textoCarga(c.carga)}`
    const alvo = (k: CalibracaoInput) => k.indicacao.pontos.find((x) => x.id === r.id)
    const base = `indicacao.pontos.${c.id}`
    if (!iguaisNumeros(c.carga, r.carga) || pc.cargaAplicada)
      leitura(`${base}.carga`, 'indicacao', 5, `${rot}: carga`, cargaEscrita(pc), c.carga, r.carga, (k, v) => {
        const p = alvo(k)
        if (p && v !== null) p.carga = v
      })
    // As substituições por baixo do ponto (rodoviária): as da folha (a sugerida pelo plano vai no pacote), que o rascunho
    // pode não ter; sem elas, o ponto fica sem os pesos no cálculo. Nível 0 no celular (a etapa sem os pesos no plano)
    // nunca apaga o nível do escritório
    if (pc.nivelSubstituicao > 0 && pc.nivelSubstituicao !== r.nivelSubstituicao)
      textoItem(
        `${base}.nivel`,
        'indicacao',
        5,
        `${rot}: substituições por baixo`,
        String(pc.nivelSubstituicao),
        r.nivelSubstituicao ? String(r.nivelSubstituicao) : '',
        false,
        (k) => {
          const p = alvo(k)
          if (!p) return
          p.nivelSubstituicao = c.nivelSubstituicao
          // As peças da folha para esse nível; as trocadas no local vêm pelo item dos pesos, as do escritório ficam
          if (!p.pecasManuais && !pc.pecasTrocadas) p.pecas = copia(c.pecas)
        },
        true,
      )
    leitura(
      `${base}.crescente`,
      'indicacao',
      5,
      `${rot} ↑`,
      pc.crescente,
      c.crescente,
      r.crescente,
      (k, v) => {
        const p = alvo(k)
        if (p) p.crescente = v
      },
      true,
      sobe,
    )
    if (pc.decrescente || r.decrescente !== null)
      leitura(
        `${base}.decrescente`,
        'indicacao',
        5,
        `${rot} ↓`,
        pc.decrescente,
        c.decrescente,
        r.decrescente,
        (k, v) => {
          const p = alvo(k)
          if (p) p.decrescente = v
        },
        true,
        comDescida(c.carga),
      )
    if (pc.pecasTrocadas)
      textoItem(
        `${base}.pecas`,
        'indicacao',
        5,
        `${rot}: pesos`,
        descreverPecas(c.pecas, padroes as Padrao[]),
        descreverPecas(r.pecas, padroes as Padrao[]),
        JSON.stringify(c.pecas) === JSON.stringify(r.pecas),
        (k) => {
          const p = alvo(k)
          if (p) Object.assign(p, { pecas: copia(c.pecas), pecasManuais: true })
        },
        true,
      )
  }
  const idsRascunho = new Set(rascunho.indicacao.pontos.map((p) => p.id))
  for (const c of soCelular) {
    const pc = pontosCelular.get(c.id)!
    const leituras = [pc.crescente?.valor, pc.decrescente?.valor].filter(Boolean).join(' / ')
    textoItem(
      `indicacao.pontos.${c.id}`,
      'indicacao',
      5,
      `Ponto de ${textoCarga(c.carga)} (do celular, sem par)`,
      leituras || 'sem leituras',
      '',
      false,
      (k) => {
        const usados = new Set(k.indicacao.pontos.map((p) => p.id))
        inserirPorCarga(k.indicacao.pontos, { ...copia(c), id: idLivre(c.id, usados) })
      },
      true,
      'SO_NO_CELULAR',
    )
    idsRascunho.add(c.id)
  }
  for (const r of soRascunho) {
    if (!leiturasDoPonto(r)) continue
    textoItem(
      `indicacao.pontos.${r.id}`,
      'indicacao',
      5,
      `Ponto de ${textoCarga(r.carga)} (só no rascunho)`,
      '',
      [textoNumero(r.crescente), textoNumero(r.decrescente)].filter(Boolean).join(' / '),
      false,
      (k) => (k.indicacao.pontos = k.indicacao.pontos.filter((x) => x.id !== r.id)),
      true,
      'SO_NO_RASCUNHO',
    )
  }
  leitura(
    'indicacao.retornoZero',
    'indicacao',
    5,
    'Retorno ao zero',
    ps.indicacao.retornoZero,
    campo.indicacao.retornoZero,
    rascunho.indicacao.retornoZero,
    (k, v) => (k.indicacao.retornoZero = v),
  )
  ;(ps.indicacao.substituicao?.etapas ?? []).forEach((et, i) => {
    const doCampo = campo.indicacao.substituicao.etapas[i]
    const doRascunho = rascunho.indicacao.substituicao.etapas[i] ?? { leituraPadroes: null, leituraSubstituicao: null }
    const garantir = (k: CalibracaoInput) => {
      const s = k.indicacao.substituicao
      if (!s.ativa) Object.assign(s, { ativa: true, pecas: s.pecas.length ? s.pecas : copia(campo.indicacao.substituicao.pecas) })
      while (s.etapas.length <= i) s.etapas.push({ leituraPadroes: null, leituraSubstituicao: null })
      return s.etapas[i]
    }
    const rot = `Substituição, etapa ${i + 1}`
    leitura(
      `indicacao.substituicao.etapas.${i}.leituraPadroes`,
      'indicacao',
      5,
      `${rot}: indicação com os pesos`,
      et.padroes,
      doCampo.leituraPadroes,
      doRascunho.leituraPadroes,
      (k, v) => (garantir(k).leituraPadroes = v),
    )
    leitura(
      `indicacao.substituicao.etapas.${i}.leituraSubstituicao`,
      'indicacao',
      5,
      `${rot}: indicação com a substituição`,
      et.substituicao,
      doCampo.leituraSubstituicao,
      doRascunho.leituraSubstituicao,
      (k, v) => (garantir(k).leituraSubstituicao = v),
    )
  })

  // ---- Repetibilidade (passo 6)
  const repsCelular = new Map(ps.repetibilidade.map((r) => [r.id, r]))
  const reps = casar(campo.repetibilidade, rascunho.repetibilidade, tolerancia)
  for (const [c, r] of reps.pares) {
    const rc = repsCelular.get(c.id)!
    const rot = `Repetibilidade a ${textoCarga(c.carga)}`
    const alvo = (k: CalibracaoInput) => k.repetibilidade.find((x) => x.id === r.id)
    if (!iguaisNumeros(c.carga, r.carga) || rc.cargaAplicada)
      leitura(
        `repetibilidade.${c.id}.carga`,
        'repetibilidade',
        6,
        `${rot}: carga`,
        cargaEscrita(rc),
        c.carga,
        r.carga,
        (k, v) => {
          const x = alvo(k)
          if (x && v !== null) x.carga = v
        },
      )
    const n = Math.max(c.leituras.length, r.leituras.length)
    for (let j = 0; j < n; j++)
      leitura(
        `repetibilidade.${c.id}.leituras.${j}`,
        'repetibilidade',
        6,
        `${rot}: leitura ${j + 1}`,
        rc.leituras[j] ?? null,
        c.leituras[j] ?? null,
        r.leituras[j] ?? null,
        (k, v) => {
          const x = alvo(k)
          if (!x) return
          while (x.leituras.length <= j) x.leituras.push(null)
          x.leituras[j] = v
        },
      )
  }
  const idsRep = new Set(rascunho.repetibilidade.map((r) => r.id))
  for (const c of reps.soCelular)
    textoItem(
      `repetibilidade.${c.id}`,
      'repetibilidade',
      6,
      `Repetibilidade a ${textoCarga(c.carga)} (do celular, sem par)`,
      repsCelular
        .get(c.id)!
        .leituras.map((l) => l.valor)
        .join('; ') || 'sem leituras',
      '',
      false,
      (k) => k.repetibilidade.push({ ...copia(c), id: idLivre(c.id, idsRep) }),
      true,
      'SO_NO_CELULAR',
    )
  for (const r of reps.soRascunho) {
    if (!r.leituras.some((l) => l !== null)) continue
    textoItem(
      `repetibilidade.${r.id}`,
      'repetibilidade',
      6,
      `Repetibilidade a ${textoCarga(r.carga)} (só no rascunho)`,
      '',
      r.leituras.map((l) => textoNumero(l)).join('; '),
      false,
      (k) => (k.repetibilidade = k.repetibilidade.filter((x) => x.id !== r.id)),
      true,
      'SO_NO_RASCUNHO',
    )
  }

  // ---- Excentricidade (passo 7)
  const ec = campo.excentricidade
  const er = rascunho.excentricidade
  const ex = ps.excentricidade
  if (ex.aplicavel !== null || !er.aplicavel)
    textoItem(
      'excentricidade.aplicavel',
      'excentricidade',
      7,
      'Excentricidade: ensaio feito',
      ex.aplicavel === null ? '' : ec.aplicavel ? 'Sim' : 'Não',
      er.aplicavel ? 'Sim' : 'Não',
      ec.aplicavel === er.aplicavel,
      (k) => (k.excentricidade = { ...k.excentricidade, aplicavel: ec.aplicavel }),
      true,
    )
  if (!ec.aplicavel && ec.motivo.trim())
    textoItem(
      'excentricidade.motivo',
      'excentricidade',
      7,
      'Excentricidade: por que o ensaio não foi feito',
      ec.motivo.trim(),
      er.motivo.trim(),
      ec.motivo.trim() === er.motivo.trim(),
      (k) => (k.excentricidade = { ...k.excentricidade, motivo: ec.motivo }),
      false,
    )
  if (ec.aplicavel) {
    const zeroAntes = excentricidadeComZero(registro, pacote)
    if (!iguaisNumeros(ec.carga, er.carga) || ex.cargaAplicada)
      leitura(
        'excentricidade.carga',
        'excentricidade',
        7,
        'Excentricidade: carga',
        cargaEscrita(ex),
        ec.carga || null,
        er.carga || null,
        (k, v) => {
          if (v !== null) k.excentricidade = { ...k.excentricidade, carga: v }
        },
      )
    ex.posicoes.forEach((pos, i) => {
      const j = er.posicoes.findIndex((x) => x.rotulo === pos.rotulo)
      const ir = j >= 0 ? j : i
      const pr = er.posicoes[ir] ?? { rotulo: pos.rotulo, leitura: null, referencia: null }
      const garantir = (k: CalibracaoInput) => {
        const lista = k.excentricidade.posicoes
        while (lista.length <= ir)
          lista.push({ rotulo: ex.posicoes[lista.length]?.rotulo ?? pos.rotulo, leitura: null, referencia: null })
        return lista[ir]
      }
      const rot = `Excentricidade (${pos.rotulo})`
      if (pos.zeroAntes || pr.referencia !== null)
        leitura(
          `excentricidade.posicoes.${i}.referencia`,
          'excentricidade',
          7,
          `${rot}: zero antes`,
          pos.zeroAntes,
          ec.posicoes[i]?.referencia ?? null,
          pr.referencia,
          (k, v) => (garantir(k).referencia = v),
          true,
          zeroAntes,
        )
      leitura(
        `excentricidade.posicoes.${i}.leitura`,
        'excentricidade',
        7,
        rot,
        pos.leitura,
        ec.posicoes[i]?.leitura ?? null,
        pr.leitura,
        (k, v) => (garantir(k).leitura = v),
      )
    })
  }

  // ---- O que aparece ao lado
  const cadastroDiferente: CadastroDiferente[] = [...ps.chegada.conferencias, ...ps.balanca.conferencias]
    .filter((c) => c.confere === false)
    .map((c) => ({
      campo: c.campo,
      rotulo: c.rotulo,
      mostrado: c.mostrado,
      observado: c.observado?.trim() ?? '',
      anotacao: registro.anotacoes
        .filter((a) => a.tipo === 'DADO_DIFERENTE' && a.campo === c.campo)
        .map((a) => a.texto)
        .join(' '),
      metrologico: ['balanca.unidade', 'balanca.max', 'balanca.d', 'balanca.e', 'balanca.min', 'balanca.classe'].includes(
        c.campo,
      ),
    }))
  const avisos: string[] = []
  const motivo = registro.motivoDesfecho.trim().replace(/[.\s]+$/, '') || 'sem motivo'
  if (registro.desfecho === 'INCOMPLETA')
    avisos.push(`Folha encerrada sem completar: ${motivo}. Puxe o que existe; o resto fica pendente.`)
  if (registro.desfecho === 'NAO_CALIBRADA')
    avisos.push(`Balança não calibrada: ${motivo}. O nº do certificado pode ir para "não utilizado".`)
  if (convertido)
    avisos.push(
      `As leituras do celular estão em ${unidadeCampo} e foram convertidas para ${unidade}, a unidade da balança agora.`,
    )
  if (registro.tentativas.length)
    avisos.push(
      `${registro.tentativas.length === 1 ? 'Uma tentativa anterior dos ensaios ficou' : `${registro.tentativas.length} tentativas anteriores dos ensaios ficaram`} só para consulta (a balança precisou de manutenção): não é puxada.`,
    )
  if (cadastroDiferente.some((c) => c.metrologico))
    avisos.push(
      'Cadastro da balança diferente: o técnico viu outro valor num dado metrológico. Corrija o cadastro antes de emitir.',
    )
  if (registro.piloto) avisos.push('Piloto: a folha de papel é o registro original. A comparação não escreve nada no rascunho.')

  return {
    itens,
    comparacao: {
      numero: registro.numero,
      rascunhoSemLeituras: !rascunhoTemLeituras(rascunho),
      anotacoes: registro.anotacoes.map((a) => ({ ...a })),
      cadastroDiferente,
      avisos,
    },
  }
}

const semAplicar = ({ aplicar: _a, ...resto }: ItemInterno): DiferencaCampo => resto

/**
 * "Comparar com o campo" (piloto) e a prévia de "Puxar dados do campo": a tabela Campo | Celular | Rascunho, com todos os
 * dados comparados (os iguais também; a tela os esconde), as anotações ao lado, os dados impressos vistos diferentes e as
 * frases da tela. Não muda nada.
 */
export function diferencasDoCampo(
  rascunho: CalibracaoInput,
  registro: RegistroCampo,
  pacote?: PacoteCampo | null,
  opcoes: OpcoesComparar = {},
): ComparacaoCampo {
  const { itens, comparacao } = compararInterno(rascunho, registro, pacote, opcoes)
  return { ...comparacao, itens: itens.map(semAplicar), iguais: itens.filter((x) => x.situacao === 'IGUAL').length }
}

export interface ResumoImportacao {
  /** Dados vazios no rascunho que receberam o do celular. */
  preenchidos: number
  /** Dados diferentes (cada um com a escolha). */
  diferentes: number
  ficouCelular: number
  ficouRascunho: number
  /** Pontos e ensaios do celular sem par acrescentados. */
  acrescentados: number
  /** Pontos e ensaios só do rascunho tirados (por escolha). */
  retirados: number
  iguais: number
  /** As chaves com a escolha feita (para `campo_importacoes`). */
  escolhas: Array<{ chave: string; situacao: SituacaoDiferenca; escolha: EscolhaCampo }>
  /** "Trouxe do celular a folha FC-2026-00042: 47 dados preenchidos, 2 diferenças (ficou o do celular em 1)." */
  texto: string
}

/**
 * "Puxar dados do campo" (registro original = CELULAR): o rascunho com o que foi escolhido em cada diferença (sem
 * escolha, a sugestão: o do celular, salvo onde só o rascunho tem o dado). Nunca escreve as anotações nas observações,
 * nem as tentativas descartadas, nem o que só o escritório preenche (conformidade, próxima calibração, opções). A data
 * real substitui a prevista e a próxima calibração acompanha. O rascunho continua editável.
 */
export function aplicarDoCampo<T extends CalibracaoInput>(
  rascunho: T,
  registro: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  escolhas: EscolhasCampo = {},
  opcoes: OpcoesComparar = {},
): { rascunho: T; resumo: ResumoImportacao } {
  const { itens } = compararInterno(rascunho, registro, pacote, opcoes)
  const novo = copia(rascunho)
  const resumo: ResumoImportacao = {
    preenchidos: 0,
    diferentes: 0,
    ficouCelular: 0,
    ficouRascunho: 0,
    acrescentados: 0,
    retirados: 0,
    iguais: 0,
    escolhas: [],
    texto: '',
  }
  for (const item of itens) {
    if (item.situacao === 'IGUAL') {
      resumo.iguais++
      continue
    }
    const escolha = escolhas[item.chave] ?? item.sugestao
    resumo.escolhas.push({ chave: item.chave, situacao: item.situacao, escolha })
    if (item.situacao === 'DIFERENTE') {
      resumo.diferentes++
      if (escolha === 'CELULAR') resumo.ficouCelular++
      else resumo.ficouRascunho++
    }
    if (escolha !== 'CELULAR') continue
    if (item.situacao === 'VAZIO_NO_RASCUNHO') resumo.preenchidos++
    if (item.situacao === 'SO_NO_CELULAR') resumo.acrescentados++
    if (item.situacao === 'SO_NO_RASCUNHO') resumo.retirados++
    item.aplicar(novo)
  }
  const partes = [`${resumo.preenchidos} ${resumo.preenchidos === 1 ? 'dado preenchido' : 'dados preenchidos'}`]
  if (resumo.diferentes)
    partes.push(
      `${resumo.diferentes} ${resumo.diferentes === 1 ? 'diferença' : 'diferenças'} (ficou o do celular em ${resumo.ficouCelular})`,
    )
  if (resumo.acrescentados) partes.push(`${resumo.acrescentados} do celular acrescentados`)
  if (resumo.retirados) partes.push(`${resumo.retirados} só do rascunho retirados`)
  resumo.texto = `Trouxe do celular a folha ${registro.numero}: ${partes.join(', ')}.`
  return { rascunho: novo, resumo }
}

// ---- Justificativa na emissão ----------------------------------------------------------------------------------------

/** Um dado bruto da calibração diferente do registro de campo (congelado em `emissao.campo`). */
export interface DivergenciaCampo {
  chave: string
  rotulo: string
  celular: string
  certificado: string
}

/**
 * Os dados brutos (leituras, cargas, ambiente, data, padrões) da calibração que estão diferentes do registro de campo
 * (o `VALIDO` mais novo): o celular tem e a calibração não, a calibração tem e o celular não, ou os dois com valores
 * diferentes; os pontos e ensaios que só um dos dois tem (os do rascunho, só com leituras). Vazio = nada mudou depois de
 * puxar. Com alguma, a emissão fica pendente até existir uma justificativa (um texto só; 05-ajustes-finais §10).
 */
export function divergenciasParaEmissao(
  calibracao: CalibracaoInput,
  registro: RegistroCampo,
  pacote?: PacoteCampo | null,
  opcoes: OpcoesComparar = {},
): DivergenciaCampo[] {
  return diferencasDoCampo(calibracao, registro, pacote, opcoes)
    .itens.filter((x) => x.bruto && x.situacao !== 'IGUAL')
    .map((x) => ({ chave: x.chave, rotulo: x.rotulo, celular: x.celular, certificado: x.rascunho }))
}

/** O começo da pendência da justificativa (o servidor e a tela a reconhecem por ele). */
export const PENDENCIA_JUSTIFICATIVA_CAMPO = 'Dados do campo mudados depois de puxados'

/** A pendência de emissão da regra da justificativa: com divergências e sem a justificativa; null quando não pende. */
export function pendenciaJustificativaCampo(divergencias: readonly DivergenciaCampo[], justificativa: string): string | null {
  if (!divergencias.length || justificativa.trim()) return null
  const n = divergencias.length
  return `${PENDENCIA_JUSTIFICATIVA_CAMPO} (${n} ${n === 1 ? 'diferença' : 'diferenças'} com o registro do celular): escreva a justificativa antes de emitir.`
}

/**
 * O bloco congelado na emissão (`EmissaoCertificado.campo`, dado só: não muda o PDF do certificado): o registro, a lista
 * das diferenças e a justificativa (com quem e quando).
 */
export interface CampoDaEmissao {
  registroId: string
  numero: string
  /** sha256 interno do registro (nunca aparece na interface nem no PDF). */
  sha256: string
  divergencias: DivergenciaCampo[]
  justificativa: string
  justificadoPor: string
  justificadoEm: string
}

// O progresso da folha no celular: os passos completos (os 8 passos e a linha do fim do ambiente, que o app abre sozinho
// depois do passo 7), a porcentagem e o "Falta para assinar" — os campos obrigatórios para emitir (`camposObrigatoriosEmissao`,
// a marca ● do papel e do sistema) que a folha cobre: sem a conformidade, a próxima calibração, a data de recebimento, o
// reparo e o ajuste externo dos registros antigos e a identificação da balança cadastrada (o cadastro é do escritório).
// Mais o que o papel marca com ● e o sistema confere no cálculo: as leituras mínimas da repetibilidade, todas as posições
// da excentricidade e a carga escrita no local; e, nas folhas só do cliente e em branco, a balança e o cliente informados.
// Puro.
//
// "Falta para assinar" bloqueia "Finalizar e colher assinaturas"; "Encerrar sem completar" (desfecho INCOMPLETA ou
// NAO_CALIBRADA, com um motivo) é a saída (`podeFinalizar`). Os avisos na hora não bloqueiam (avisos.ts).

import { camposObrigatoriosEmissao, dataIsoValida, minimosDoPopComoAviso } from '../dominio.ts'
import type { CampoEmissao } from '../dominio.ts'
import { casasDecimais, faixaDoValor, formatarNumero, minimoLeiturasRepetibilidade } from '../metrologia/index.ts'
import { avisosDoRegistro } from './avisos.ts'
import type { AvisoCampo } from './avisos.ts'
import {
  balancaDoCampo,
  indiceFimValido,
  indiceInicioValido,
  instrumentoDoCampo,
  padroesDoPacote,
  registroCorrigido,
  registroParaRascunho,
  unidadeDoRegistro,
} from './importar.ts'
import type { ChavePasso, NumeroPasso, PacoteCampo, RegistroCampo } from './tipos.ts'
import { PASSOS_FOLHA, TITULOS_PASSOS } from './tipos.ts'

/** As etapas da folha no celular, na ordem física: o ambiente do fim é medido depois do passo 7. */
export type EtapaFolha = ChavePasso | 'ambienteFim'
export const ETAPAS_DA_FOLHA: readonly EtapaFolha[] = [
  'padroes',
  'chegada',
  'balanca',
  'ambiente',
  'indicacao',
  'repetibilidade',
  'excentricidade',
  'ambienteFim',
  'final',
]
export const TITULOS_ETAPAS: Record<EtapaFolha, string> = {
  ...TITULOS_PASSOS,
  ambiente: 'Ambiente (início)',
  ambienteFim: 'Ambiente (fim)',
}
export const passoDaEtapa = (e: EtapaFolha): NumeroPasso => (e === 'ambienteFim' ? 4 : PASSOS_FOLHA[e])

/** Um item obrigatório (●) em branco. `campo`: o caminho a partir de `passos` (tipos.ts), para o "Ir ▸". */
export interface ItemFalta {
  /** O mesmo código do aviso IMPEDE da pendência que ele daria (a Revisão mostra um só). */
  codigo: string
  etapa: EtapaFolha
  passo: NumeroPasso
  campo: string
  texto: string
}

type Mapa = Record<CampoEmissao, { codigo: string; etapa: EtapaFolha; texto: string; campo: string } | null>

/**
 * O "Falta para assinar": os itens obrigatórios (●) que a folha cobre e estão em branco, pelas regras de emitir do sistema
 * (`camposObrigatoriosEmissao`, sobre o rascunho que o registro daria), mais as leituras mínimas da repetibilidade, as
 * posições da excentricidade, a carga escrita no local, a confirmação da excentricidade prevista como não aplicável e a
 * balança e o cliente informados. Vazio = pode finalizar.
 */
export function faltaParaAssinar(original: RegistroCampo, pacote: PacoteCampo | null | undefined): ItemFalta[] {
  const registro = registroCorrigido(original)
  const ps = registro.passos
  const k = registroParaRascunho(registro, pacote)
  const balanca = balancaDoCampo(registro, pacote)
  const padroes = padroesDoPacote(pacote, k.padroesIds)
  const iIni = indiceInicioValido(registro)
  const iFim = indiceFimValido(registro)
  const linhaIni = iIni >= 0 ? `ambiente.linhas.${iIni}` : 'ambiente.linhas'
  const linhaFim = iFim >= 0 ? `ambiente.linhas.${iFim}` : 'ambiente.linhas'
  const mapa: Mapa = {
    dataCalibracao: { codigo: 'FALTA_DATA', etapa: 'final', texto: 'Data da calibração', campo: 'final.dataCalibracao' },
    tecnicoId: { codigo: 'FALTA_TECNICO', etapa: 'chegada', texto: 'Técnico que executou', campo: '' },
    localEndereco: {
      codigo: 'FALTA_ENDERECO',
      etapa: 'chegada',
      texto: 'Endereço da calibração',
      campo: 'chegada.localEndereco',
    },
    pesos: { codigo: 'FALTA_PESOS', etapa: 'padroes', texto: 'Pesos padrão usados (marque “Usado”)', campo: 'padroes' },
    temperaturaInicial: {
      codigo: 'FALTA_TEMPERATURA',
      etapa: 'ambiente',
      texto: 'Temperatura no início',
      campo: `${linhaIni}.temperatura`,
    },
    temperaturaFinal: {
      codigo: 'FALTA_TEMPERATURA',
      etapa: 'ambienteFim',
      texto: 'Temperatura no fim',
      campo: `${linhaFim}.temperatura`,
    },
    umidade: { codigo: 'FALTA_AR_MEDIDO', etapa: 'ambiente', texto: 'Umidade no início', campo: `${linhaIni}.umidade` },
    pressao: { codigo: 'FALTA_PRESSAO', etapa: 'ambiente', texto: 'Pressão no início', campo: `${linhaIni}.pressao` },
    barometro: {
      codigo: 'FALTA_BAROMETRO',
      etapa: 'ambiente',
      texto: 'Barômetro usado (instrumento)',
      campo: `${linhaIni}.instrumentos`,
    },
    deltaTPesos: {
      codigo: 'FALTA_DELTA_T',
      etapa: 'ambiente',
      texto: 'ΔT pesos − ar antes do 1º ensaio (ou a aclimatação dos pesos)',
      campo: 'ambiente.deltaT',
    },
    repetibilidade: {
      codigo: 'FALTA_REPETIBILIDADE',
      etapa: 'repetibilidade',
      texto: 'Leituras da repetibilidade',
      campo: 'repetibilidade',
    },
    excentricidadeMotivo: {
      codigo: 'FALTA_MOTIVO_EXCENTRICIDADE',
      etapa: 'excentricidade',
      texto: 'Por que a excentricidade não foi feita',
      campo: 'excentricidade.motivo',
    },
    excentricidadeLeituras: {
      codigo: 'FALTA_LEITURAS_EXCENTRICIDADE',
      etapa: 'excentricidade',
      texto: 'Leituras da excentricidade',
      campo: 'excentricidade.posicoes',
    },
    excentricidadeCarga: {
      codigo: 'FALTA_CARGA_EXCENTRICIDADE',
      etapa: 'excentricidade',
      texto: 'Carga usada na excentricidade',
      campo: 'excentricidade.cargaAplicada',
    },
    indicacaoLeituras: {
      codigo: 'FALTA_LEITURAS_INDICACAO',
      etapa: 'indicacao',
      texto: 'Leituras do erro de indicação',
      campo: 'indicacao.pontos',
    },
    retornoZero: { codigo: 'FALTA_RETORNO_ZERO', etapa: 'indicacao', texto: 'Retorno ao zero', campo: 'indicacao.retornoZero' },
    // Só no sistema: a conformidade, a próxima calibração, o reparo e o ajuste externo (registros antigos) e a
    // identificação da balança cadastrada (o escritório corrige o cadastro; a informada vem abaixo)
    ordemServico: null,
    ajusteDescricao: null,
    identificacaoBalanca: null,
    toleranciaCliente: null,
    proximaCalibracao: null,
  }
  const itens: ItemFalta[] = []
  const item = (x: Omit<ItemFalta, 'passo'>) => itens.push({ ...x, passo: passoDaEtapa(x.etapa) })
  for (const c of camposObrigatoriosEmissao(k, {
    padroes,
    classe: balanca?.classe ?? pacote?.balanca?.classe,
    temPesos: padroes.some((p) => p.tipo === 'PESOS'),
  })) {
    const m = mapa[c.campo]
    if (m && c.falta && c.regra === 'obrigatorio') item(m)
  }
  // A data é a que o técnico marca no passo 8 (o rascunho usa o dia do começo da folha só para levar os dados)
  if (!dataIsoValida(ps.final.dataCalibracao) && !itens.some((x) => x.codigo === 'FALTA_DATA')) item(mapa.dataCalibracao!)

  // Excentricidade prevista como não aplicável: confirmar no local (o texto da folha)
  if (ps.excentricidade.aplicavel === null)
    item({
      codigo: 'EXCENTRICIDADE_A_CONFIRMAR',
      etapa: 'excentricidade',
      texto: 'Confirme se a excentricidade se aplica',
      campo: 'excentricidade.aplicavel',
    })

  // A carga escrita no local (●): o ensaio de repetibilidade sem carga prevista, com leituras
  for (const r of ps.repetibilidade)
    if (r.leituras.length && !r.cargaPrevista && !r.cargaAplicada)
      item({
        codigo: 'FALTA_CARGA_REPETIBILIDADE',
        etapa: 'repetibilidade',
        texto: 'Carga aplicada na repetibilidade',
        campo: `repetibilidade.${r.id}.cargaAplicada`,
      })
  // E o ponto acrescentado no local ("+ Acrescentar ponto") com leitura e sem a carga: a carga não se inventa (o ponto
  // acrescentado e deixado em branco sai da folha ao finalizar)
  for (const p of ps.indicacao.pontos)
    if (p.acrescentado && !p.cargaAplicada && !p.cargaPrevista && (p.crescente || p.decrescente))
      item({
        codigo: 'FALTA_CARGA_INDICACAO',
        etapa: 'indicacao',
        texto: 'Carga do ponto acrescentado',
        campo: `indicacao.pontos.${p.id}.cargaAplicada`,
      })

  // As leituras mínimas e todas as posições (as regras do POP; na calibração medida antes delas, só aviso)
  if (!minimosDoPopComoAviso(k)) {
    const vista = instrumentoDoCampo(registro, pacote)
    const i = vista.instrumento
    const classe = i && !vista.desligados.includes('balanca.classe') ? i.classe : (pacote?.balanca?.classe ?? '')
    const unidade = unidadeDoRegistro(registro, pacote)
    for (const r of k.repetibilidade) {
      const n = r.leituras.filter((l) => l !== null).length
      const minimo = minimoLeiturasRepetibilidade(r.carga, { classe, unidade })
      if (!n || n >= minimo) continue
      const d = i && i.faixas.length && r.carga > 0 ? faixaDoValor(r.carga, i).d : 0
      item({
        codigo: 'POUCAS_LEITURAS_REPETIBILIDADE',
        etapa: 'repetibilidade',
        texto: `Repetibilidade a ${formatarNumero(r.carga, Math.max(casasDecimais(d), casasDecimais(r.carga)))} ${unidade}: ${n} de ${minimo} leituras`,
        campo: `repetibilidade.${r.id}`,
      })
    }
    const e = k.excentricidade
    const comLeitura = e.posicoes.filter((p) => p.leitura !== null).length
    if (e.aplicavel && comLeitura > 0 && comLeitura < e.posicoes.length) {
      const faltam = e.posicoes.length - comLeitura
      item({
        codigo: 'FALTA_POSICOES',
        etapa: 'excentricidade',
        texto: `Excentricidade: ${faltam} ${faltam === 1 ? 'posição' : 'posições'} sem leitura`,
        campo: 'excentricidade.posicoes',
      })
    }
  }

  // Folhas só do cliente e em branco: a balança e o cliente informados no local
  const bi = ps.balanca.informada
  if (bi) {
    const vista = instrumentoDoCampo(registro, pacote)
    if (!bi.unidade)
      item({ codigo: 'FALTA_UNIDADE_BALANCA', etapa: 'balanca', texto: 'Unidade da balança', campo: 'balanca.informada.unidade' })
    else if (!vista.instrumento?.faixas.length)
      item({ codigo: 'BALANCA_SEM_FAIXA', etapa: 'balanca', texto: 'Max e d da balança', campo: 'balanca.informada.faixas' })
    if (![bi.numeroSerie, bi.identificacao, bi.plataforma].some((x) => x.trim()))
      item({
        codigo: 'BALANCA_SEM_IDENTIFICACAO',
        etapa: 'balanca',
        texto: 'Nº de série ou identificação (TAG) da balança',
        campo: 'balanca.informada.numeroSerie',
      })
  }
  const ci = ps.chegada.clienteInformado
  if (ci && !ci.razaoSocial.trim())
    item({
      codigo: 'FALTA_CLIENTE',
      etapa: 'chegada',
      texto: 'Razão social ou nome do cliente',
      campo: 'chegada.clienteInformado.razaoSocial',
    })
  return itens
}

/** Pode tocar em "Finalizar e colher assinaturas"? Senão, o motivo escrito embaixo do botão (nunca um botão mudo). */
export function podeFinalizar(
  registro: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
): { pode: boolean; motivo: string } {
  if (registro.desfecho !== 'COMPLETA')
    return registro.motivoDesfecho.trim()
      ? { pode: true, motivo: '' }
      : { pode: false, motivo: 'Escreva o motivo de encerrar sem completar.' }
  return faltaParaAssinar(registro, pacote).length
    ? { pode: false, motivo: 'Preencha os itens com ● para assinar.' }
    : { pode: true, motivo: '' }
}

/** Uma etapa da folha: completa (nada obrigatório em branco e nada a conferir), o que falta e se tem aviso. */
export interface SituacaoEtapa {
  etapa: EtapaFolha
  passo: NumeroPasso
  titulo: string
  completa: boolean
  faltam: ItemFalta[]
  /** Dados impressos ainda sem "Confere" ou "Algo diferente…" (passos 2 e 3) e o "onde foi feita" sem marcar. */
  aConferir: number
  /** Algum aviso na hora ainda não conferido nesta etapa (▲ na bolinha). */
  comAviso: boolean
}

/** A etapa de um aviso (o do passo 4 na linha do fim vai para "Ambiente (fim)"). */
function etapaDoAviso(a: AvisoCampo, iFim: number): EtapaFolha {
  if (a.passo === 4 && iFim >= 0 && a.campo.startsWith(`ambiente.linhas.${iFim}.`)) return 'ambienteFim'
  return ETAPAS_DA_FOLHA.find((e) => e !== 'ambienteFim' && passoDaEtapa(e) === a.passo)!
}

/** As etapas da folha (a fileira de bolinhas: ✓ feito, ○ a fazer, ▲ com aviso). */
export function situacaoDasEtapas(
  original: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  opcoes: { hoje?: string; avisos?: AvisoCampo[] } = {},
): SituacaoEtapa[] {
  const registro = registroCorrigido(original)
  const ps = registro.passos
  const falta = faltaParaAssinar(registro, pacote)
  const avisos = opcoes.avisos ?? avisosDoRegistro(registro, pacote, { hoje: opcoes.hoje })
  const conferidos = new Set(registro.avisosConferidos.map((c) => `${c.codigo}|${c.campo}|${c.texto}`))
  const iFim = indiceFimValido(registro)
  const semConferir = (lista: Array<{ confere: boolean | null }>) => lista.filter((c) => c.confere === null).length
  return ETAPAS_DA_FOLHA.map((etapa) => {
    const faltam = falta.filter((x) => x.etapa === etapa)
    const aConferir =
      etapa === 'chegada'
        ? semConferir(ps.chegada.conferencias) + (ps.chegada.local ? 0 : 1)
        : etapa === 'balanca'
          ? semConferir(ps.balanca.conferencias)
          : 0
    const comAviso = avisos.some(
      (a) => !a.falta && etapaDoAviso(a, iFim) === etapa && !conferidos.has(`${a.codigo}|${a.campo}|${a.texto}`),
    )
    return {
      etapa,
      passo: passoDaEtapa(etapa),
      titulo: TITULOS_ETAPAS[etapa],
      completa: !faltam.length && !aConferir,
      faltam,
      aConferir,
      comAviso,
    }
  })
}

/** O progresso da folha (a barra da lista e o "Continuar do passo 5"). */
export interface ProgressoFolha {
  completas: number
  /** 9: os 8 passos e a linha do fim do ambiente. */
  total: number
  /** 0 a 100. */
  percentual: number
  /** A primeira etapa incompleta, na ordem física da folha; null = tudo completo. */
  proxima: EtapaFolha | null
}

export function progressoDaFolha(
  registro: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  opcoes: { hoje?: string; avisos?: AvisoCampo[] } = {},
): ProgressoFolha {
  const etapas = situacaoDasEtapas(registro, pacote, opcoes)
  const completas = etapas.filter((e) => e.completa).length
  return {
    completas,
    total: etapas.length,
    percentual: Math.round((completas / etapas.length) * 100),
    proxima: etapas.find((e) => !e.completa)?.etapa ?? null,
  }
}

/** A tela de Revisão (antes de assinar): "Falta para assinar", "Isto impede o certificado", "Confira a digitação". */
export interface RevisaoFolha {
  falta: ItemFalta[]
  /** Os avisos IMPEDE, sem os que já estão em "Falta para assinar" (o mesmo código). */
  impede: AvisoCampo[]
  digitacao: AvisoCampo[]
  /** As etapas completas e sem aviso ("Tudo certo"). */
  tudoCerto: EtapaFolha[]
}

export function revisaoDaFolha(
  original: RegistroCampo,
  pacote: PacoteCampo | null | undefined,
  opcoes: { hoje?: string } = {},
): RevisaoFolha {
  const registro = registroCorrigido(original)
  const avisos = avisosDoRegistro(registro, pacote, opcoes)
  const falta = faltaParaAssinar(registro, pacote)
  const codigosFalta = new Set(falta.map((x) => x.codigo))
  const etapas = situacaoDasEtapas(registro, pacote, { avisos })
  return {
    falta,
    impede: avisos.filter((a) => a.classe === 'IMPEDE' && !codigosFalta.has(a.codigo)),
    digitacao: avisos.filter((a) => a.classe === 'DIGITACAO'),
    tudoCerto: etapas.filter((e) => e.completa && !e.comAviso).map((e) => e.etapa),
  }
}

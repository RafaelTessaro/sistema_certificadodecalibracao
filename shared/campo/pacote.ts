// O pacote do celular: montado a partir dos MESMOS dados que desenham a folha impressa (o `DadosFolhaCampo` de
// server/pdf/folhaCampo.ts, montado em `gerar` de server/rotas/folhaCampo.ts e congelado na primeira impressão ou no
// primeiro envio), com o MESMO plano (`planoDaFolha`, na mesma data). Assim o celular mostra exatamente o cliente, a
// balança, os padrões, os pontos, as cargas e as posições que estão no papel com o mesmo nº de folha. Puro.
//
// Tipos de folha: `calibracao` e `balanca` (balança cadastrada, com o plano), `cliente` (balança informada no local) e
// `branco` (cliente e balança informados no local). Sem balança cadastrada não há plano (como no papel), e a classe I fica
// de fora (a folha em branco é das classes II a IIII).

import {
  calibracaoVazia,
  diaEmBrasilia,
  divisaoLegivel,
  ehRodoviaria,
  enderecoCliente,
  numeroBr,
  RECEPTORES,
  ROTULO_CLASSE,
  TIPOS_BALANCA,
} from '../dominio.ts'
import {
  AVISO_ETIQUETA,
  FORMULARIO_FOLHA_CAMPO,
  padroesPrevistos,
  planoDaFolha,
  referenciaDoFormulario,
  validadeDosPadroes,
} from '../folhaCampo.ts'
import type { PlanoFolha } from '../folhaCampo.ts'
import { faixasOrdenadas } from '../metrologia/index.ts'
import type { Balanca, CalibracaoInput, Cliente, DadosEmpresa, Padrao } from '../tipos.ts'
import type { ResumoEnvio } from './protocolo.ts'
import { CONTRATO_CAMPO, FORMATO_PACOTE, FORMATO_REGISTRO } from './protocolo.ts'
import type {
  ClienteCampo,
  FolhaDoPacote,
  ItemConferir,
  PacoteCampo,
  PadraoCampo,
  PadraoNaFolhaCampo,
  SituacaoEnvio,
  TipoFolhaCampo,
} from './tipos.ts'
import { CAMPOS_CONFERIR, CAMPOS_METROLOGICOS } from './tipos.ts'

/**
 * Os dados impressos da folha: a mesma forma do `DadosFolhaCampo` (server/pdf/folhaCampo.ts, com o
 * `numeroCertificado`), que o servidor passa como está. Repetida aqui porque shared/ não importa o servidor.
 */
export interface DadosImpressosFolhaCampo {
  numero: string
  empresa: DadosEmpresa
  cliente: Cliente | null
  balanca: Balanca | null
  calibracao: CalibracaoInput | null
  padroes: Padrao[]
  tecnico: string
  impressoEm: string
  impressoPor: string
  procedimento?: string
  numeroCertificado?: string
  ordemServico?: string
  dataPrevista?: string
}

/** O que o envio acrescenta aos dados impressos. */
export interface ExtrasPacote {
  envioId: string
  /**
   * Com balança cadastrada: `calibracao` (a folha de um rascunho, `GET /api/calibracoes/:id/folha-campo`) ou `balanca`
   * (a avulsa da balança, com o plano que o rascunho teria). Padrão: `calibracao`.
   */
  origem?: 'calibracao' | 'balanca'
  /** Recado do escritório ("levar o jogo M1"). */
  recado?: string
  /** Data prevista escolhida na tela "Enviar para o técnico" (AAAA-MM-DD); sem ela, a prevista da folha. */
  dataPrevista?: string
  /** `registroOriginal = PAPEL`. */
  piloto: boolean
  /** ISO. */
  enviadaEm: string
  enviadaPor: string
  /** Versão do sistema ("1.1.0"). */
  versaoSistema: string
  /** sha256 dos dados impressos congelados. */
  dadosSha256?: string
  /** Padrões ativos do cadastro, para "usei outro" (os previstos já vêm dos dados impressos). */
  ativos?: Padrao[]
}

/** O tipo da folha pelos dados impressos (balança → a origem; só o cliente → `cliente`; nada → `branco`). */
export function tipoDaFolha(
  d: Pick<DadosImpressosFolhaCampo, 'balanca' | 'cliente'>,
  origem: ExtrasPacote['origem'],
): TipoFolhaCampo {
  if (d.balanca) return origem === 'balanca' ? 'balanca' : 'calibracao'
  return d.cliente ? 'cliente' : 'branco'
}

/**
 * Data em que os padrões precisam estar em dia e do plano: a prevista (a do rascunho ou, sem ele, a da folha) ou, se ela
 * já passou, o dia da impressão em Brasília. A mesma regra da folha impressa (`contexto` em server/pdf/folhaCampo.ts).
 */
export function dataDaFolha(d: Pick<DadosImpressosFolhaCampo, 'calibracao' | 'dataPrevista' | 'impressoEm'>): string {
  const impressao = diaEmBrasilia(d.impressoEm) || d.impressoEm.slice(0, 10)
  const prevista = (d.calibracao ? d.calibracao.dataCalibracao : d.dataPrevista) ?? ''
  return prevista > impressao ? prevista : impressao
}

/** O padrão sem o histórico e os arquivos (não descem para o celular). */
export function padraoParaCampo(p: Padrao): PadraoCampo {
  const { certificadoArquivo: _a, certificadosAnteriores: _c, versoesAnteriores: _v, ...resto } = p
  return resto
}

/** Cópia funda de dados simples (JSON), para o pacote nunca compartilhar objetos com os dados impressos. */
const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** "Plataforma · Toledo 2096 · nº 12345 · TAG BP-01": a balança numa linha (lista do olá, cartões do app). */
export function identificacaoDaBalanca(
  b: Pick<Balanca, 'tipo' | 'fabricante' | 'modelo' | 'numeroSerie' | 'identificacao'>,
): string {
  return [
    TIPOS_BALANCA[b.tipo] ?? '',
    [b.fabricante, b.modelo]
      .map((x) => x.trim())
      .filter(Boolean)
      .join(' '),
    b.numeroSerie.trim() ? `nº ${b.numeroSerie.trim()}` : '',
    b.identificacao.trim() ? `TAG ${b.identificacao.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** O nome do cliente como a folha imprime (PJ: a razão social, ou o nome sem ela). */
export function nomeDoCliente(c: Pick<Cliente, 'tipo' | 'nome' | 'razaoSocial'>): string {
  return (c.tipo === 'PJ' ? c.razaoSocial || c.nome : c.nome).trim()
}

function clienteParaCampo(c: Cliente): ClienteCampo {
  return {
    id: c.id,
    tipo: c.tipo,
    nome: c.nome,
    razaoSocial: c.razaoSocial,
    documento: c.documento,
    inscricaoEstadual: c.inscricaoEstadual,
    contato: c.contato,
    telefone: c.telefone,
    celular: c.celular,
    endereco: enderecoCliente(c),
  }
}

const item = (campo: ItemConferir['campo'], rotulo: string, mostrado: string): ItemConferir => ({
  campo,
  rotulo,
  mostrado: mostrado.trim() || '—',
  metrologico: CAMPOS_METROLOGICOS.includes(campo),
})

/** Passo 2: os dados impressos do cliente, o endereço e a OS (os textos da folha, `gradesCliente` e `linhaChegada`). */
function conferirChegada(c: Cliente | null, localEndereco: string, os: string): ItemConferir[] {
  const itens: ItemConferir[] = []
  if (c) {
    const pj = c.tipo === 'PJ'
    const telefone = c.telefone || c.celular
    const ie = c.inscricaoEstadual.trim()
    itens.push(
      item(CAMPOS_CONFERIR.clienteNome, pj ? 'Razão social' : 'Nome', nomeDoCliente(c)),
      item(CAMPOS_CONFERIR.clienteContato, 'Contato no cliente', [c.contato, telefone].filter((x) => x.trim()).join(' · ')),
      item(
        CAMPOS_CONFERIR.clienteDocumento,
        pj ? 'CNPJ' : 'CPF',
        [c.documento, ie ? `IE ${ie}` : ''].filter((x) => x.trim()).join(' · '),
      ),
    )
  }
  if (localEndereco) itens.push(item(CAMPOS_CONFERIR.localEndereco, 'Endereço da calibração', localEndereco))
  if (os) itens.push(item(CAMPOS_CONFERIR.os, 'Nº da OS', os))
  return itens
}

/** Passo 3: a balança cadastrada, campo a campo, com os textos da folha (`gradeBalanca`). */
function conferirBalanca(b: Balanca): ItemConferir[] {
  const faixas = faixasOrdenadas(b.faixas)
  const u = b.unidade
  const legivel = (vs: number[]) => {
    if (!vs.length) return ''
    const l = divisaoLegivel(vs, u)
    return `${l.valores.map((x) => numeroBr(x)).join('/')} ${l.unidade}`
  }
  const plataforma = [
    [b.plataformaFabricante, b.plataformaModelo]
      .map((x) => x.trim())
      .filter(Boolean)
      .join(' '),
    b.plataformaSerie.trim() ? `nº ${b.plataformaSerie.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const receptor = [
    (RECEPTORES[b.receptor] ?? b.receptor).replace(/ \(.*\)$/, ''),
    (b.receptor === 'APOIOS' || b.receptor === 'RODOVIARIA' || b.receptor === 'TANQUE') && b.apoios > 0
      ? `${b.apoios} apoios`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return [
    item(CAMPOS_CONFERIR.tipo, 'Tipo de balança', TIPOS_BALANCA[b.tipo] ?? ''),
    item(CAMPOS_CONFERIR.fabricante, 'Fabricante (indicador)', b.fabricante),
    item(CAMPOS_CONFERIR.modelo, 'Modelo (indicador)', b.modelo),
    item(CAMPOS_CONFERIR.numeroSerie, 'Nº de série (indicador)', b.numeroSerie),
    item(CAMPOS_CONFERIR.identificacao, 'Identificação / TAG', b.identificacao),
    item(CAMPOS_CONFERIR.anoFabricacao, 'Ano de fabricação', b.anoFabricacao),
    item(CAMPOS_CONFERIR.unidade, 'Unidade da indicação', u),
    item(
      CAMPOS_CONFERIR.max,
      faixas.length > 1 ? 'Capacidade (Max) de cada faixa' : 'Capacidade (Max)',
      faixas.length ? `${faixas.map((f) => numeroBr(f.max)).join('/')} ${u}` : '',
    ),
    item(CAMPOS_CONFERIR.d, 'Divisão (d)', legivel(faixas.map((f) => f.d))),
    item(CAMPOS_CONFERIR.e, 'Divisão de verificação (e)', legivel(faixas.map((f) => f.e))),
    item(CAMPOS_CONFERIR.min, 'Carga mínima (Min)', b.min ? `${numeroBr(b.min)} ${u}` : ''),
    item(CAMPOS_CONFERIR.classe, 'Classe de exatidão', ROTULO_CLASSE[b.classe] ?? ''),
    item(CAMPOS_CONFERIR.plataforma, 'Plataforma (marca, modelo, série)', plataforma),
    item(CAMPOS_CONFERIR.portaria, 'Portaria de aprovação de modelo', b.portariaAprovacao),
    item(CAMPOS_CONFERIR.receptor, 'Receptor de carga', receptor),
    item(CAMPOS_CONFERIR.localInstalacao, 'Local de instalação', b.localInstalacao),
  ]
}

/** Os padrões congelados de uma revisão, sem o histórico e os arquivos. */
const comPadroesCongeladosLeves = (k: CalibracaoInput): CalibracaoInput =>
  k.padroesCongelados ? { ...k, padroesCongelados: k.padroesCongelados.map(padraoParaCampo) } : k

/** Ids únicos e não vazios? */
const idsBons = (ids: string[]) => ids.every((x) => typeof x === 'string' && x.trim()) && new Set(ids).size === ids.length

/**
 * O rascunho como a folha o mostra (`PacoteCampo.entrada`): os pontos, a repetibilidade, a excentricidade e a
 * substituição do plano, alinhados com ele, sem leituras.
 */
function entradaDoPlano(k: CalibracaoInput, plano: PlanoFolha): CalibracaoInput {
  const rascunho = k.indicacao.pontos
  // O plano acrescenta a linha do zero no começo quando o rascunho não tem (POP 7.7); sem pontos no rascunho, os sugeridos
  const comZero = rascunho.length > 0 && plano.pontos.length === rascunho.length + 1 && !rascunho.some((p) => !(p.carga > 0))
  const idsRascunho = rascunho.map((p) => p.id)
  const ids =
    rascunho.length && idsBons(idsRascunho) && (comZero || plano.pontos.length === rascunho.length)
      ? comZero
        ? [idsRascunho.includes('campo-p0') ? 'campo-zero' : 'campo-p0', ...idsRascunho]
        : idsRascunho
      : plano.pontos.map((_, i) => `campo-p${i}`)
  const doRascunho = (i: number) =>
    comZero ? rascunho[i - 1] : plano.pontos.length === rascunho.length ? rascunho[i] : undefined
  const pontos = plano.pontos.map((p, i) => ({
    id: ids[i],
    carga: p.carga,
    pecas: copia(p.pecas),
    pecasManuais: doRascunho(i)?.pecasManuais ?? false,
    crescente: null,
    decrescente: null,
    nivelSubstituicao: p.nivelSubstituicao,
  }))
  const idsRep = k.repetibilidade.map((r) => r.id)
  const repetibilidade = plano.repetibilidade.map((r, i) => ({
    id: k.repetibilidade.length === plano.repetibilidade.length && idsBons(idsRep) ? idsRep[i] : `campo-r${i + 1}`,
    carga: r.carga,
    leituras: Array.from({ length: r.leituras }, () => null),
  }))
  const s = plano.substituicao
  const substituicao =
    s.ativa || s.sugerida
      ? {
          ativa: true,
          pecas: copia(s.pecas),
          etapas: Array.from({ length: s.etapas }, () => ({ leituraPadroes: null, leituraSubstituicao: null })),
        }
      : { ativa: false, pecas: [], etapas: [] }
  const e = plano.excentricidade
  const base = comPadroesCongeladosLeves(copia(k))
  return {
    ...base,
    indicacao: { ...base.indicacao, metodo: plano.metodo, pontos, retornoZero: null, substituicao },
    comoEncontrado: null,
    repetibilidade,
    excentricidade: {
      aplicavel: e.aplicavel,
      motivo: e.motivo,
      carga: e.carga,
      metodo: e.metodo,
      posicoes: e.posicoes.map((rotulo) => ({ rotulo, leitura: null, referencia: null })),
    },
  }
}

/**
 * O rascunho vazio de uma folha sem rascunho (só do cliente, em branco): o cliente, a balança (se houver), a OS, a data e
 * os padrões previstos.
 */
function rascunhoVazio(d: DadosImpressosFolhaCampo, previstos: Padrao[], data: string, localEndereco: string): CalibracaoInput {
  return {
    ...calibracaoVazia(undefined, d.balanca?.classe),
    clienteId: d.cliente?.id ?? d.balanca?.clienteId ?? '',
    balancaId: d.balanca?.id ?? '',
    ordemServico: d.ordemServico?.trim() ?? '',
    dataCalibracao: d.dataPrevista || data,
    local: 'CLIENTE',
    localEndereco,
    padroesIds: previstos.map((p) => p.id),
  }
}

/**
 * Monta o pacote de um envio a partir dos dados impressos da folha (os mesmos que desenham o papel) e do que o envio
 * acrescenta. Determinístico: os mesmos dados dão o mesmo pacote (e o mesmo sha256).
 */
export function montarPacote(d: DadosImpressosFolhaCampo, extras: ExtrasPacote): PacoteCampo {
  const tipo = tipoDaFolha(d, extras.origem)
  const data = dataDaFolha(d)
  const k = d.calibracao
  const c = d.cliente
  const b = d.balanca
  const plano = b ? planoDaFolha(k, b, d.padroes, data) : null
  const localEndereco = k?.localEndereco?.trim() || (c ? enderecoCliente(c) : '')
  const os = ((k ? k.ordemServico : d.ordemServico) ?? '').trim()
  // A data prevista da folha impressa: só a marcada para depois do dia da impressão (o rascunho nasce com a data do dia)
  const impressaoDia = diaEmBrasilia(d.impressoEm) || d.impressoEm.slice(0, 10)
  const prevista = ((k ? k.dataCalibracao : d.dataPrevista) ?? '').trim()
  // Padrões da folha: com o plano, os dele (na ordem dele); sem plano, os previstos com a validade na data
  const semPlano = plano ? null : validadeDosPadroes(padroesPrevistos(k, d.padroes), data)
  const daFolha: Array<{ padrao: Padrao; separar: string; naFolha: boolean; situacao: PadraoNaFolhaCampo['situacao'] }> =
    plano?.padroes ?? semPlano!.itens.map((x) => ({ ...x, separar: '', naFolha: true }))
  const previstos: PadraoNaFolhaCampo[] = daFolha.map((x) => ({
    id: x.padrao.id,
    identificacao: x.padrao.identificacao,
    separar: x.separar,
    naFolha: x.naFolha,
    situacao: x.situacao,
  }))
  const vistos = new Set(daFolha.map((x) => x.padrao.id))
  const outrosAtivos = (extras.ativos ?? [])
    .filter((p) => p.ativo && !vistos.has(p.id) && (vistos.add(p.id), true))
    .sort((x, y) => x.tipo.localeCompare(y.tipo) || x.identificacao.localeCompare(y.identificacao, 'pt-BR'))
  const cadastro = [...daFolha.map((x) => x.padrao), ...outrosAtivos].map((p) => padraoParaCampo(copia(p)))

  const folha: FolhaDoPacote = {
    numero: d.numero,
    numeroCertificado: d.numeroCertificado?.trim() ?? '',
    avisoEtiqueta: d.numeroCertificado?.trim() ? AVISO_ETIQUETA : '',
    formulario: {
      codigo: FORMULARIO_FOLHA_CAMPO.codigo,
      revisao: FORMULARIO_FOLHA_CAMPO.revisao,
      titulo: FORMULARIO_FOLHA_CAMPO.titulo,
    },
    pop: referenciaDoFormulario(d.procedimento),
    os,
    dataPrevista: extras.dataPrevista?.trim() || (prevista > impressaoDia ? prevista : ''),
    dataDosPadroes: data,
    recado: extras.recado?.trim() ?? '',
    piloto: extras.piloto,
    tipo,
    tecnicoPrevisto: d.tecnico.trim(),
    local: k?.local ?? '',
    localEndereco,
    anotacoesInternas: k?.anotacoesInternas?.trim() ?? '',
    avisosAntesDeSair: [...(plano ? plano.avisos : semPlano!.avisos)],
    impressaEm: d.impressoEm,
    impressaPor: d.impressoPor,
    enviadaEm: extras.enviadaEm,
    enviadaPor: extras.enviadaPor,
  }

  const planoCampo: PlanoFolha | null = plano
    ? copia({ ...plano, padroes: plano.padroes.map((x) => ({ ...x, padrao: padraoParaCampo(x.padrao) })) })
    : null
  const base =
    k ??
    rascunhoVazio(
      d,
      daFolha.map((x) => x.padrao),
      data,
      localEndereco,
    )
  const entrada = planoCampo ? entradaDoPlano(base, planoCampo) : comPadroesCongeladosLeves(copia(base))

  return {
    formato: FORMATO_PACOTE,
    envioId: extras.envioId,
    folha,
    cliente: c ? clienteParaCampo(c) : null,
    balanca: b ? { ...copia(b), observacoes: '' } : null,
    padroes: { previstos, cadastro },
    conferir: { chegada: conferirChegada(c, localEndereco, os), balanca: b ? conferirBalanca(b) : [] },
    entrada,
    plano: planoCampo,
    versoes: {
      contrato: CONTRATO_CAMPO,
      formatoRegistro: FORMATO_REGISTRO,
      sistema: extras.versaoSistema,
      dadosSha256: extras.dadosSha256 ?? '',
    },
  }
}

/** A linha do envio na lista do olá, a partir do pacote guardado e da situação. */
export function resumoDoEnvio(pacote: PacoteCampo, situacao: SituacaoEnvio): ResumoEnvio {
  return {
    envioId: pacote.envioId,
    numero: pacote.folha.numero,
    tipo: pacote.folha.tipo,
    cliente: pacote.cliente ? nomeDoCliente(pacote.cliente) : '',
    balanca: pacote.balanca ? identificacaoDaBalanca(pacote.balanca) : '',
    dataPrevista: pacote.folha.dataPrevista,
    situacao,
    piloto: pacote.folha.piloto,
    enviadaEm: pacote.folha.enviadaEm,
  }
}

/** A folha leva as cargas de substituição (as etapas): com a substituição no plano ou numa rodoviária cadastrada. */
export function comSubstituicao(pacote: Pick<PacoteCampo, 'plano' | 'balanca'>): boolean {
  const s = pacote.plano?.substituicao
  return !!s && (s.ativa || s.sugerida || (!!pacote.balanca && ehRodoviaria(pacote.balanca)))
}

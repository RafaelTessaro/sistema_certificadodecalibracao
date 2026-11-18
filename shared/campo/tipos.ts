// Tipos do app do celular (app BC Calibração, celular) e do registro de campo: o contrato de dados entre o servidor, o
// app e as telas do computador. A folha de campo FOR-CAL-01 vai para o celular do técnico como um PACOTE (o que desce:
// os mesmos dados que desenham a folha impressa) e volta como um REGISTRO (o que sobe: o que o técnico anotou no
// cliente, com as assinaturas). Puro: sem Node, sem DOM, sem Capacitor.
//
// Regras que valem para todo o registro (ver também registro.ts e canonico.ts):
// - O nº da folha (FC-AAAA-NNNNN) é o que identifica a folha no celular e no computador. Não há código de conferência:
//   o sha256 do registro existe só por dentro (idempotência e integridade) e nunca aparece na interface nem no PDF.
// - Toda leitura é TEXTO, exatamente como foi digitada (`LeituraCampo.valor`: "150,0" continua "150,0"), com a data e a
//   hora do celular. O número só é calculado ao levar os dados para o rascunho.
// - Data e hora são sempre completas, em ISO 8601 com o fuso do celular (`Instante`: "2026-11-18T08:42:10-03:00"); '' =
//   ainda não. Sem relógio monotônico: o servidor só compara a hora do celular com a dele na entrega (marca RELOGIO).
// - O registro não tem número com casas decimais (só inteiros: contagens, quantidades de peças, níveis): as cargas e as
//   leituras vão como texto. Assim o JSON canônico do registro é o mesmo no celular e no servidor, byte a byte.
// - Campo de um passo (`campo` das conferências, anotações, avisos e correções): o caminho a partir de `passos`, com
//   pontos, usando o id do item quando ele tem id e a posição (a partir de 0) quando não tem. Exemplos:
//   "ambiente.linhas.0.temperatura", "indicacao.pontos.p3.crescente", "indicacao.retornoZero",
//   "indicacao.substituicao.etapas.1.padroes", "repetibilidade.rep1.leituras.4", "repetibilidade.rep1.carga",
//   "excentricidade.posicoes.2.leitura", "final.dataCalibracao". Os dados impressos conferidos usam a chave do item
//   (`CAMPOS_CONFERIR`: "balanca.d", "cliente.nome"…).

import type { SituacaoValidade } from '../dominio.ts'
import type { PlanoFolha } from '../folhaCampo.ts'
import type { Balanca, CalibracaoInput, LocalCalibracao, Padrao, PecaCarga, TipoCliente, Unidade } from '../tipos.ts'

/** Data e hora do celular, ISO 8601 com o fuso: "2026-11-18T08:42:10-03:00". '' = ainda não. */
export type Instante = string

// ---- Estados e listas fechadas -----------------------------------------------------------------------------------

/**
 * De onde a folha veio: `calibracao` (a folha de um rascunho), `balanca` (a avulsa de uma balança cadastrada, com o
 * plano que o rascunho teria), `cliente` (só do cliente: a balança é informada no local, classes II a IIII) e `branco`
 * (cliente e balança informados no local). Nas duas últimas a classe I fica de fora, como no papel.
 */
export type TipoFolhaCampo = 'calibracao' | 'balanca' | 'cliente' | 'branco'
export const TIPOS_FOLHA_CAMPO: readonly TipoFolhaCampo[] = ['calibracao', 'balanca', 'cliente', 'branco']

/**
 * Situação do envio no servidor (`folhas_campo_envios.situacao`), só de entrega:
 * ENVIADA (criado; o celular ainda não confirmou o recebimento), NO_CELULAR (o celular confirmou), DEVOLVIDA (chegou o
 * registro enquanto o envio estava ativo) e RECOLHIDA (encerrado: o celular apagou sem começar, nem tinha baixado, ou o
 * administrador recolheu à força). Um registro que chega para um envio RECOLHIDA não o reabre: é gravado com a marca
 * APOS_RECOLHER.
 */
export type SituacaoEnvio = 'ENVIADA' | 'NO_CELULAR' | 'DEVOLVIDA' | 'RECOLHIDA'
export const SITUACOES_ENVIO: readonly SituacaoEnvio[] = ['ENVIADA', 'NO_CELULAR', 'DEVOLVIDA', 'RECOLHIDA']
/** Envios "vivos": no máximo um por FC (índice no banco). */
export const SITUACOES_ENVIO_ATIVAS: readonly SituacaoEnvio[] = ['ENVIADA', 'NO_CELULAR', 'DEVOLVIDA']

/**
 * Estado da folha no celular: RECEBENDO (pacote baixado, recebimento ainda não confirmado: não dá para começar), NOVA
 * (o servidor confirmou), EM_PREENCHIMENTO (primeira alteração), FINALIZADA (assinada e trancada, aguardando entrega),
 * REABERTA (assinaturas apagadas para refazer passos), ENTREGUE (recibo do servidor: os dados saem do celular, fica o
 * resumo por 7 dias) e RETIRADA (apagada por um recolhimento ou por ser desconhecida, antes de começar).
 */
export type EstadoFolhaCelular = 'RECEBENDO' | 'NOVA' | 'EM_PREENCHIMENTO' | 'FINALIZADA' | 'REABERTA' | 'ENTREGUE' | 'RETIRADA'
export const ESTADOS_FOLHA_CELULAR: readonly EstadoFolhaCelular[] = [
  'RECEBENDO',
  'NOVA',
  'EM_PREENCHIMENTO',
  'FINALIZADA',
  'REABERTA',
  'ENTREGUE',
  'RETIRADA',
]
/** Folha começada: só sai do celular com o recibo do servidor (um pedido de recolher não a apaga). */
export const ESTADOS_COMECADOS: readonly EstadoFolhaCelular[] = ['EM_PREENCHIMENTO', 'FINALIZADA', 'REABERTA']

/**
 * Marcas que o servidor põe no registro ao receber (o registro é gravado sempre): ORFAO (o envio não existe no
 * servidor), APARELHO_REVOGADO (entregue por um celular descadastrado), APOS_RECOLHER (o envio já estava RECOLHIDA),
 * FORMATO (`validarRegistro` achou problemas: a lista fica junto), RELOGIO (a hora do celular diferia mais de 5 min da do
 * servidor na entrega, pelo cabeçalho `x-bc-agora`) e PILOTO (o registro saiu no piloto, `registro.piloto`, ou o registro
 * original era o papel na hora da entrega: `registroOriginal = PAPEL`).
 */
export type MarcaRegistro = 'ORFAO' | 'APARELHO_REVOGADO' | 'APOS_RECOLHER' | 'FORMATO' | 'RELOGIO' | 'PILOTO'
export const MARCAS_REGISTRO: readonly MarcaRegistro[] = [
  'ORFAO',
  'APARELHO_REVOGADO',
  'APOS_RECOLHER',
  'FORMATO',
  'RELOGIO',
  'PILOTO',
]

/**
 * Situação do registro guardado: VALIDO, SUPERADO (chegou uma revisão mais nova do mesmo envio, depois de reabrir: a
 * cadeia `reaberturas[].sha256Anterior` aponta o anterior) e DESCARTADO (pelo escritório, com motivo; o registro nunca é
 * apagado).
 */
export type SituacaoRegistro = 'VALIDO' | 'SUPERADO' | 'DESCARTADO'
export const SITUACOES_REGISTRO: readonly SituacaoRegistro[] = ['VALIDO', 'SUPERADO', 'DESCARTADO']

/** Configuração do piloto (Configurações, só o administrador): qual é o registro original da calibração. */
export type RegistroOriginal = 'PAPEL' | 'CELULAR'
export const REGISTRO_ORIGINAL_PADRAO: RegistroOriginal = 'PAPEL'

/** Como a folha terminou: completa, ou "Encerrar sem completar" (incompleta ou não calibrada, com um motivo só). */
export type Desfecho = 'COMPLETA' | 'INCOMPLETA' | 'NAO_CALIBRADA'
export const DESFECHOS: readonly Desfecho[] = ['COMPLETA', 'INCOMPLETA', 'NAO_CALIBRADA']

/** Avisos na hora: "Confira a digitação" (âmbar) ou "Isto impede o certificado" (vermelho). Nenhum bloqueia assinar. */
export type ClasseAviso = 'DIGITACAO' | 'IMPEDE'
export const CLASSES_AVISO: readonly ClasseAviso[] = ['DIGITACAO', 'IMPEDE']

/** Tipos de anotação (o bloco Anotações do papel). Só as observações aparecem no resumo mostrado ao cliente. */
export type TipoAnotacao = 'DADO_DIFERENTE' | 'OBSERVACAO' | 'ANOMALIA'
export const TIPOS_ANOTACAO: readonly TipoAnotacao[] = ['DADO_DIFERENTE', 'OBSERVACAO', 'ANOMALIA']
export const ROTULO_TIPO_ANOTACAO: Record<TipoAnotacao, string> = {
  DADO_DIFERENTE: 'Dado impresso diferente',
  OBSERVACAO: 'Observação',
  ANOMALIA: 'Anomalia',
}

/** Como a leitura entrou: pelo teclado ou pela tecla "Repetir" (só na repetibilidade e na excentricidade). */
export type ViaLeitura = 'teclado' | 'repetir'
export const VIAS_LEITURA: readonly ViaLeitura[] = ['teclado', 'repetir']

/**
 * Linhas do ambiente (passo 4): INICIO, INICIO_REPETIDA (classe I: medida de novo depois de aguardar a aclimatação; não
 * é correção, é outra observação) e FIM (depois do passo 7).
 */
export type MomentoAmbiente = 'INICIO' | 'INICIO_REPETIDA' | 'FIM'
export const MOMENTOS_AMBIENTE: readonly MomentoAmbiente[] = ['INICIO', 'INICIO_REPETIDA', 'FIM']

/** Os 8 passos da FOR-CAL-01 rev. 05, na ordem e com os números do papel. */
export const PASSOS_FOLHA = {
  padroes: 1,
  chegada: 2,
  balanca: 3,
  ambiente: 4,
  indicacao: 5,
  repetibilidade: 6,
  excentricidade: 7,
  final: 8,
} as const
export type ChavePasso = keyof typeof PASSOS_FOLHA
export type NumeroPasso = (typeof PASSOS_FOLHA)[ChavePasso]
/** Os títulos dos passos, os mesmos do papel (server/pdf/folhaCampo.ts). */
export const TITULOS_PASSOS: Record<ChavePasso, string> = {
  padroes: 'Antes de sair: padrões',
  chegada: 'Chegada ao cliente',
  balanca: 'Identificação da balança',
  ambiente: 'Ambiente',
  indicacao: 'Erro de indicação',
  repetibilidade: 'Repetibilidade',
  excentricidade: 'Excentricidade',
  final: 'Assinaturas e etiqueta',
}

/**
 * Chaves dos dados impressos que o técnico confere ("Confere" ou "Algo diferente…") nos passos 2 e 3. Os metrológicos
 * (`CAMPOS_METROLOGICOS`) pedem o valor visto em campo (`ConferenciaCampo.observado`), que os avisos passam a usar.
 */
export const CAMPOS_CONFERIR = {
  clienteNome: 'cliente.nome',
  clienteContato: 'cliente.contato',
  clienteDocumento: 'cliente.documento',
  localEndereco: 'chegada.localEndereco',
  os: 'chegada.os',
  tipo: 'balanca.tipo',
  fabricante: 'balanca.fabricante',
  modelo: 'balanca.modelo',
  numeroSerie: 'balanca.numeroSerie',
  identificacao: 'balanca.identificacao',
  anoFabricacao: 'balanca.anoFabricacao',
  unidade: 'balanca.unidade',
  max: 'balanca.max',
  d: 'balanca.d',
  e: 'balanca.e',
  min: 'balanca.min',
  classe: 'balanca.classe',
  plataforma: 'balanca.plataforma',
  portaria: 'balanca.portariaAprovacao',
  receptor: 'balanca.receptor',
  localInstalacao: 'balanca.localInstalacao',
} as const
export type CampoConferir = (typeof CAMPOS_CONFERIR)[keyof typeof CAMPOS_CONFERIR]
export const CAMPOS_METROLOGICOS: readonly CampoConferir[] = [
  'balanca.unidade',
  'balanca.max',
  'balanca.d',
  'balanca.e',
  'balanca.min',
  'balanca.classe',
]

// ---- O pacote (o que desce para o celular) -------------------------------------------------------------------------

export interface PessoaCampo {
  id: string
  nome: string
}

/** Formulário controlado (FOR-CAL-01 e a revisão) que o pacote e o registro levam. */
export interface FormularioCampo {
  codigo: string
  revisao: string
}

export interface FolhaDoPacote {
  /** "FC-2026-00042": o que identifica a folha no celular e no computador. */
  numero: string
  /** Nº do certificado reservado, que o técnico copia na etiqueta; '' sem nº (folha de antes da 1.0.7, revisão). */
  numeroCertificado: string
  /** A nota da etiqueta (`AVISO_ETIQUETA`) quando há nº do certificado; senão ''. */
  avisoEtiqueta: string
  formulario: FormularioCampo & { titulo: string }
  /** O POP do rodapé ("POP-CAL-01 rev. 00"; `referenciaDoFormulario`); '' sem POP. */
  pop: string
  /** Nº da OS impressa ('' = o técnico escreve: `ChegadaCampo.os`). */
  os: string
  /** Data prevista da visita (AAAA-MM-DD; a da tela "Enviar para o técnico" ou a da folha); '' = sem data. */
  dataPrevista: string
  /** Data em que os padrões precisam estar em dia (a prevista ou, se ela já passou, a da impressão): a do plano. */
  dataDosPadroes: string
  /** Recado do escritório ("levar o jogo M1"). Interno: nunca vai para o resumo do cliente. */
  recado: string
  /** Piloto: o registro original é o papel (`registroOriginal = PAPEL`). */
  piloto: boolean
  tipo: TipoFolhaCampo
  /** Técnico previsto na folha (só uma dica; quem executa é o dono do celular); '' = nenhum. */
  tecnicoPrevisto: string
  /** Onde a calibração está prevista ('' = não marcado). O técnico marca onde foi feita (`ChegadaCampo.local`). */
  local: LocalCalibracao | ''
  /** Endereço da calibração impresso ('' = o técnico escreve: `ChegadaCampo.localEndereco`). */
  localEndereco: string
  /** Anotações internas do rascunho (recado de acesso: portaria, EPI). Internas: nunca vão para o resumo do cliente. */
  anotacoesInternas: string
  /** "Resolva antes de sair" (os avisos do plano, ou a validade dos padrões na folha sem plano). */
  avisosAntesDeSair: string[]
  /** Quando e por quem a folha foi impressa (ISO; a primeira impressão ou o primeiro envio). */
  impressaEm: string
  impressaPor: string
  /** Quando e por quem foi enviada ao técnico (ISO). */
  enviadaEm: string
  enviadaPor: string
}

/** O cliente como a folha o imprime (sem e-mails, observações internas nem situação na Receita). */
export interface ClienteCampo {
  id: string
  tipo: TipoCliente
  nome: string
  razaoSocial: string
  documento: string
  inscricaoEstadual: string
  contato: string
  telefone: string
  celular: string
  /** Endereço do cadastro (sede), numa linha (`enderecoCliente`). */
  endereco: string
}

/** Padrão como desce para o celular: o cadastro com as peças e a validade, sem o histórico nem os arquivos. */
export type PadraoCampo = Omit<Padrao, 'certificadoArquivo' | 'certificadosAnteriores' | 'versoesAnteriores'>

/** Um padrão da lista do passo 1, na ordem da folha impressa. */
export interface PadraoNaFolhaCampo {
  id: string
  identificacao: string
  /** Peças deste jogo que as cargas usam ("15 × 20 kg"); '' sem plano ou fora de jogo de pesos. */
  separar: string
  /** Vai inteiro na lista (Levado/Usado); os outros, numa linha "Também previstos…". */
  naFolha: boolean
  /** Validade na data da folha (`FolhaDoPacote.dataDosPadroes`). */
  situacao: SituacaoValidade
}

export interface PadroesDoPacote {
  /** Os padrões da folha impressa (com e sem plano), na ordem dela. */
  previstos: PadraoNaFolhaCampo[]
  /** Os previstos e os demais ativos do cadastro (para "usei outro"), sem histórico nem arquivos. */
  cadastro: PadraoCampo[]
}

/** Um dado impresso para conferir no local (passos 2 e 3), já com o texto que a folha mostra. */
export interface ItemConferir {
  campo: CampoConferir
  rotulo: string
  mostrado: string
  /** Pede o valor visto em campo quando "Algo diferente…" (d, e, Max, Min, classe, unidade). */
  metrologico: boolean
}

export interface VersoesDoPacote {
  /** `CONTRATO_CAMPO` do servidor que montou o pacote. */
  contrato: number
  /** `FORMATO_REGISTRO` que o servidor espera de volta. */
  formatoRegistro: number
  /** Versão do sistema que montou o pacote ("1.1.0"). */
  sistema: string
  /** sha256 dos dados impressos congelados da folha ('' se não houver). Interno. */
  dadosSha256: string
}

/**
 * O pacote: montado no servidor (`montarPacote`, pacote.ts) a partir dos MESMOS dados que desenham a folha impressa,
 * congelado no envio (JSON canônico + sha256) e baixado pelo celular. Dezenas de KB.
 */
export interface PacoteCampo {
  /** `FORMATO_PACOTE`. */
  formato: number
  envioId: string
  folha: FolhaDoPacote
  /** null na folha em branco. */
  cliente: ClienteCampo | null
  /**
   * A balança cadastrada (unidade congelada; as observações internas do cadastro não descem: `observacoes` = ''); null
   * nas folhas só do cliente e em branco (balança informada no local).
   */
  balanca: Balanca | null
  padroes: PadroesDoPacote
  /** Os dados impressos para conferir: passo 2 (cliente, endereço, OS) e passo 3 (balança). */
  conferir: { chegada: ItemConferir[]; balanca: ItemConferir[] }
  /**
   * O rascunho como a folha impressa o mostra, sem leituras: os pontos, as cargas e as peças do plano, na ordem do plano
   * (`entrada.indicacao.pontos[i]` ↔ `plano.pontos[i]`, `entrada.repetibilidade[i]` ↔ `plano.repetibilidade[i]`), com os
   * ids do rascunho (os pontos que o plano acrescentou — o zero, as sugestões — com ids `campo-…`), as posições da
   * excentricidade, a substituição (a do rascunho ou a sugerida), os padrões, as marcas de regras (`minimosComoAviso`,
   * `descidaComoAviso`, `pressaoComoAviso`, `zeroComoAviso`, `cargasDoEmaNaFolha`, `regrasDoPop`…) e a conformidade.
   * Nas folhas só do cliente e em branco, um rascunho vazio com o cliente, a OS e a data. Serve de base para o celular
   * rodar as mesmas regras do sistema (avisos, "Falta para assinar").
   */
  entrada: CalibracaoInput
  /** O plano da folha (`planoDaFolha`, o mesmo do papel); null sem balança cadastrada. */
  plano: PlanoFolha | null
  versoes: VersoesDoPacote
}

// ---- O registro (o que sobe do celular) ---------------------------------------------------------------------------

/** Uma leitura, exatamente como foi digitada, com a hora do celular. */
export interface LeituraCampo {
  /**
   * O texto do teclado do app: algarismos, vírgula decimal e o sinal "-" na frente ("100,05", "-0,02", "150,0"). Nunca
   * completado com zeros nem reformatado. Ver `REGEX_LEITURA` e `numeroDaLeitura` (registro.ts).
   */
  valor: string
  em: Instante
  via: ViaLeitura
}

/** Um dado impresso conferido no local. O dado original nunca é editado no celular. */
export interface ConferenciaCampo {
  campo: CampoConferir
  rotulo: string
  /** O texto que foi mostrado ao técnico (o do pacote): o registro se explica sem o pacote. */
  mostrado: string
  /** true = Confere; false = Algo diferente… (o certo vai numa anotação DADO_DIFERENTE); null = não conferido. */
  confere: boolean | null
  /** Só nos metrológicos com "Algo diferente…": o valor visto em campo, como foi digitado ("0,01 kg", "III"). */
  observado?: string
}

/** Passo 1: um padrão da lista (ou "usei outro", dos ativos que vieram no pacote). */
export interface PadraoUsadoCampo {
  id: string
  identificacao: string
  levado: boolean
  usado: boolean
  /** Não estava na lista da folha: escolhido no local entre os ativos do pacote. */
  outro: boolean
}

/** Folha em branco: o cliente como o técnico escreveu nas caixas do papel. */
export interface ClienteInformadoCampo {
  razaoSocial: string
  documento: string
  /** Endereço do cliente (sai no certificado); vazio com `enderecoIgualAoLocal`. */
  endereco: string
  enderecoIgualAoLocal: boolean
  contato: string
  email: string
}

/** Passo 2: chegada ao cliente. */
export interface ChegadaCampo {
  conferencias: ConferenciaCampo[]
  /** Só na folha em branco. */
  clienteInformado?: ClienteInformadoCampo
  /** Nº da OS escrito no local (só quando a folha não trouxe: `FolhaDoPacote.os` = ''). */
  os: string
  /** Onde a calibração foi feita, marcado no local ('' = ainda não marcado). */
  local: LocalCalibracao | ''
  /** Endereço da calibração escrito no local (só quando a folha não trouxe: `FolhaDoPacote.localEndereco` = ''). */
  localEndereco: string
  /** Hora de início (botão "Agora"). */
  inicio: Instante
}

/** Classes que a balança informada aceita (II a IIII ou não marcada): a classe I usa a folha da balança cadastrada. */
export type ClasseInformada = 'II' | 'III' | 'IIII' | ''
export const CLASSES_INFORMADAS: readonly ClasseInformada[] = ['II', 'III', 'IIII', '']
/** Receptores da folha em branco (retangular, redondo, mais de 4 apoios, gancho, tanque). */
export type ReceptorInformado = 'RETANGULAR' | 'CIRCULAR' | 'APOIOS' | 'GANCHO' | 'TANQUE' | ''
export const RECEPTORES_INFORMADOS: readonly ReceptorInformado[] = ['RETANGULAR', 'CIRCULAR', 'APOIOS', 'GANCHO', 'TANQUE', '']
export type TipoFaixasInformado = 'UNICA' | 'MULTI_INTERVALO' | 'MULTIPLAS_FAIXAS' | ''
export const TIPOS_FAIXAS_INFORMADOS: readonly TipoFaixasInformado[] = ['UNICA', 'MULTI_INTERVALO', 'MULTIPLAS_FAIXAS', '']

/** Folhas só do cliente e em branco: a balança como o técnico escreveu (texto bruto, os campos da folha em branco). */
export interface BalancaInformadaCampo {
  tipo: string
  fabricante: string
  modelo: string
  numeroSerie: string
  /** Identificação / TAG do cliente. */
  identificacao: string
  localInstalacao: string
  anoFabricacao: string
  /** Nº de apoios, como escrito. */
  apoios: string
  /** Plataforma: fabricante, modelo e série num texto só. */
  plataforma: string
  portariaAprovacao: string
  classe: ClasseInformada
  tipoFaixas: TipoFaixasInformado
  receptor: ReceptorInformado
  /** Unidade escolhida uma vez para Max, e, d e Min ('' = ainda não escolhida). */
  unidade: Unidade | ''
  /** De 1 a 3 faixas, como escritas (na `unidade`). */
  faixas: Array<{ max: string; e: string; d: string }>
  min: string
}

/** Passo 3: identificação da balança. */
export interface BalancaPassoCampo {
  /** Balança cadastrada: os dados impressos conferidos. */
  conferencias: ConferenciaCampo[]
  /** Só nas folhas só do cliente e em branco. */
  informada?: BalancaInformadaCampo
}

/** Uma linha do ambiente (passo 4). Os instrumentos são ids de padrões (termo-higrômetro, barômetro). */
export interface LinhaAmbienteCampo {
  momento: MomentoAmbiente
  em: Instante
  temperatura: LeituraCampo | null
  umidade: LeituraCampo | null
  /** hPa (a pressão absoluta do local). */
  pressao: LeituraCampo | null
  instrumentos: string[]
}

/** Classe I: uma medição do ΔT pesos − ar (cada medição é uma observação própria; vale a última antes do passo 5). */
export interface MedicaoDeltaTCampo {
  valor: LeituraCampo
  /** Id do padrão usado (o termômetro de duas entradas); '' = não informado. */
  instrumento: string
}

/** Classe I sem termômetro de duas entradas: ΔT0 pela aclimatação, com as duas temperaturas (a diferença é derivada). */
export interface DeltaT0Campo {
  origem: LeituraCampo | null
  sala: LeituraCampo | null
  em: Instante
}

/** Passo 4: ambiente. */
export interface AmbienteCampo {
  linhas: LinhaAmbienteCampo[]
  /** Classe I. */
  deltaT: MedicaoDeltaTCampo[]
  /** Classe I: desde quando os pesos estão no local (aceita a véspera); '' = não informado. */
  pesosNoLocalDesde: Instante
  /** Classe I, pela aclimatação; null = não usado. */
  deltaT0: DeltaT0Campo | null
}

/** Um ponto do erro de indicação (passo 5). */
export interface PontoCampo {
  /** O id do ponto no pacote (`entrada.indicacao.pontos[].id`) ou, no acrescentado no local, um id novo ("cel-…"). */
  id: string
  /** Ponto acrescentado no local (linha de reserva da folha): a carga é a digitada. */
  acrescentado: boolean
  /** A carga como a folha a mostra, nas casas da divisão ("100,00"; `textoDaCarga`); '' no ponto acrescentado. */
  cargaPrevista: string
  /** A carga digitada no local (no ponto acrescentado, ou se a aplicada foi outra); null = a prevista. */
  cargaAplicada: LeituraCampo | null
  /** As peças usadas: as do pacote ou, trocadas no local, as escolhidas (`pecasTrocadas`). */
  pecas: PecaCarga[]
  pecasTrocadas: boolean
  /** Substituições por baixo dos pesos (rodoviárias); 0 = só pesos padrão. */
  nivelSubstituicao: number
  crescente: LeituraCampo | null
  decrescente: LeituraCampo | null
}

/** Uma etapa das cargas de substituição: indicação com os pesos, com a substituição e o material. */
export interface EtapaSubstituicaoCampo {
  padroes: LeituraCampo | null
  substituicao: LeituraCampo | null
  /** Material da substituição / obs. ("caminhão carregado de areia"). */
  material: string
}

/** Passo 5: erro de indicação. */
export interface IndicacaoCampo {
  /** Classe I: ajuste interno (CAL) de rotina antes dos ensaios, com a hora; null fora da classe I. */
  calInterno: { feito: boolean; em: Instante } | null
  pontos: PontoCampo[]
  retornoZero: LeituraCampo | null
  /** Rodoviárias: as etapas na ordem em que foram feitas; null sem substituição. */
  substituicao: { etapas: EtapaSubstituicaoCampo[] } | null
}

/** Passo 6: um ensaio de repetibilidade. */
export interface RepetibilidadeCampo {
  /** O id do ensaio no pacote (`entrada.repetibilidade[].id`) ou um novo ("cel-…"). */
  id: string
  /** A carga prevista como a folha a mostra; '' sem carga prevista. */
  cargaPrevista: string
  /** A carga aplicada, digitada (obrigatória sem carga prevista); null = a prevista. */
  cargaAplicada: LeituraCampo | null
  leituras: LeituraCampo[]
}

/** Passo 7: uma posição da excentricidade (classe I: o zero antes e a indicação). */
export interface PosicaoCampo {
  rotulo: string
  zeroAntes: LeituraCampo | null
  leitura: LeituraCampo | null
}

/** Passo 7: excentricidade. */
export interface ExcentricidadeCampo {
  /** true = feito; false = não feito (com o motivo); null = previsto como não aplicável e ainda não confirmado. */
  aplicavel: boolean | null
  /** Por que o ensaio não foi feito (sai no certificado). */
  motivo: string
  cargaPrevista: string
  cargaAplicada: LeituraCampo | null
  posicoes: PosicaoCampo[]
}

/** Passo 8: encerramento. */
export interface FinalCampo {
  /** Data da calibração (AAAA-MM-DD, `hojeLocalIso`); '' = ainda não. */
  dataCalibracao: string
  /** Hora de término ("Agora"). */
  termino: Instante
}

export interface PassosCampo {
  padroes: PadraoUsadoCampo[]
  chegada: ChegadaCampo
  balanca: BalancaPassoCampo
  ambiente: AmbienteCampo
  indicacao: IndicacaoCampo
  repetibilidade: RepetibilidadeCampo[]
  excentricidade: ExcentricidadeCampo
  final: FinalCampo
}

/**
 * "A balança precisou de manutenção: recomeçar os ensaios": a tentativa anterior (ambiente, passos 5 a 7) fica guardada
 * só para consulta, nunca é levada para o rascunho.
 */
export interface TentativaCampo {
  /** 1, 2… */
  n: number
  motivo: string
  encerradaEm: Instante
  ambiente: AmbienteCampo
  indicacao: IndicacaoCampo
  repetibilidade: RepetibilidadeCampo[]
  excentricidade: ExcentricidadeCampo
}

export interface AnotacaoCampo {
  id: string
  passo: NumeroPasso
  tipo: TipoAnotacao
  /** O campo a que se refere (dado impresso diferente: a chave do item conferido); '' = o passo todo. */
  campo: string
  texto: string
  em: Instante
}

/** Um aviso na hora que o técnico viu: "Conferi, está certo" ou "Registrar motivo". */
export interface AvisoConferidoCampo {
  codigo: string
  classe: ClasseAviso
  campo: string
  texto: string
  em: Instante
  /** O motivo registrado ("Isto impede o certificado"); '' em "Conferi, está certo". */
  motivo: string
}

/** Correção antes de assinar (o "risco único" do papel): a mudança de um valor que já tinha sido confirmado. */
export interface CorrecaoCampo {
  campo: string
  de: string
  para: string
  em: Instante
  motivo: string
}

/** Reabertura (para refazer passos): as assinaturas foram apagadas; a versão anterior fica representada pelo sha256. */
export interface ReaberturaCampo {
  em: Instante
  motivo: string
  /** sha256 do registro finalizado antes de reabrir (`calcularSha256Registro`). Interno. */
  sha256Anterior: string
}

/** Correção depois da assinatura (só por acréscimo, com PIN e motivo; o valor antigo continua visível). */
export interface CorrecaoPosAssinaturaCampo {
  campo: string
  de: string
  para: string
  em: Instante
  motivo: string
  /** O item estava no resumo mostrado ao cliente (a assinatura dele fica "anterior à correção"). */
  mostradoAoCliente: boolean
}

/** Assinatura do técnico: PIN + desenho com o dedo (só o PNG; sem pontos, tempo nem pressão). */
export interface AssinaturaTecnicoCampo {
  nome: string
  /** data:image/png;base64,… (até `LIMITE_PNG_BYTES`). */
  png: string
  em: Instante
  /** sha256 do conteúdo assinado (`calcularConteudoSha256`). Interno. */
  conteudoSha256: string
}

/** Assinatura de quem acompanhou pelo cliente (vê só o resumo das condições, nunca leituras nem resultados). */
export interface AssinaturaClienteCampo {
  nome: string
  funcao: string
  png: string
  em: Instante
  conteudoSha256: string
}
/** Ninguém acompanhou, ou a pessoa recusou. */
export interface ClienteNaoAssinouCampo {
  naoAssinou: true
  motivo: string
  em: Instante
}
/** Calibração no laboratório da empresa: sem assinatura do cliente. */
export interface AssinaturaDispensadaCampo {
  dispensada: 'LABORATORIO'
}
/** Piloto: o cliente assinou só o papel. */
export interface SoNoPapelCampo {
  soNoPapel: true
}
export type AssinaturaDoClienteCampo =
  AssinaturaClienteCampo | ClienteNaoAssinouCampo | AssinaturaDispensadaCampo | SoNoPapelCampo

export interface AssinaturasCampo {
  /** null até o técnico assinar. */
  tecnico: AssinaturaTecnicoCampo | null
  /** null até o cliente assinar (ou a alternativa). */
  cliente: AssinaturaDoClienteCampo | null
}

export interface AparelhoCampo {
  /** UUID gerado no celular na primeira abertura; o mesmo ao parear de novo. */
  id: string
  modelo: string
  versaoApp: string
}

export interface RelogioCampo {
  /** "Começar a folha". */
  iniciadoEm: Instante
  /** "Finalizar e colher assinaturas" (congelado; '' antes). */
  finalizadoEm: Instante
}

/**
 * O registro de campo: o que o técnico anotou no cliente, como sai do celular. O servidor guarda exatamente como chegou
 * (protegido contra alteração) e gera a folha impressa assinada (PDF) a partir dele, na hora em que é pedida.
 * O conteúdo assinado é o registro sem `assinaturas` e sem `correcoesPosAssinatura` (`conteudoAssinado`, canonico.ts).
 */
export interface RegistroCampo {
  /** `FORMATO_REGISTRO`. */
  formato: number
  /** `CONTRATO_CAMPO` do app que preencheu. */
  contrato: number
  envioId: string
  /** FC-AAAA-NNNNN. */
  numero: string
  /** sha256 do pacote recebido (`calcularSha256Pacote`); '' se não calculado. Interno. */
  pacoteSha256: string
  formulario: FormularioCampo
  piloto: boolean
  tipo: TipoFolhaCampo
  aparelho: AparelhoCampo
  tecnico: PessoaCampo
  relogio: RelogioCampo
  passos: PassosCampo
  tentativas: TentativaCampo[]
  desfecho: Desfecho
  /** Um texto só, quando a folha foi encerrada sem completar; '' na completa. */
  motivoDesfecho: string
  anotacoes: AnotacaoCampo[]
  avisosConferidos: AvisoConferidoCampo[]
  trilha: CorrecaoCampo[]
  reaberturas: ReaberturaCampo[]
  assinaturas: AssinaturasCampo
  correcoesPosAssinatura: CorrecaoPosAssinaturaCampo[]
}

/** Um problema que `validarRegistro` achou: o caminho no registro e a frase para o escritório (ou para o técnico). */
export interface ProblemaRegistro {
  campo: string
  mensagem: string
}

/**
 * Recibo da entrega: o mesmo registro reenviado devolve o mesmo recibo. O app só apaga a folha quando `numero`,
 * `envioId` e `sha256` conferem com os dele. O sha256 é interno: nunca aparece na interface.
 */
export interface ReciboCampo {
  numero: string
  envioId: string
  sha256: string
  /** Hora do servidor (ISO). */
  recebidoEm: string
  situacao: SituacaoRegistro
  marcas: MarcaRegistro[]
}

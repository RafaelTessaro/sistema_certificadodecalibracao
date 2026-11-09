import type { CampoEmissao, CampoObrigatorio, EtapaCalibracao } from '#shared/dominio.ts'
import type { ResultadoCalculo } from '#shared/metrologia/tipos.ts'
import type {
  Balanca,
  CalibracaoInput,
  Cliente,
  Configuracoes,
  FolhaCampoImpressa,
  Padrao,
  PedidoAutorizacao,
  StatusCalibracao,
} from '#shared/tipos.ts'
import type { MembroEquipe } from '../../lib/api'

/** Tudo o que as etapas da calibração precisam para mostrar e alterar os dados. */
export interface ContextoEtapa {
  f: CalibracaoInput
  /** Altera o rascunho (a gravação automática cuida de salvar). */
  alterar: (mudar: (f: CalibracaoInput) => CalibracaoInput) => void
  balanca: Balanca
  cliente: Cliente
  /** Os padrões para escolher: os ativos e os desativados que esta calibração ainda tem (com o selo, para tirá-los). */
  padroes: Padrao[]
  /** Os padrões escolhidos nesta calibração. */
  selecionados: Padrao[]
  calc: { resultado: ResultadoCalculo; comoEncontrado: ResultadoCalculo | null } | null
  config: Configuracoes
  equipe: MembroEquipe[]
  status: StatusCalibracao
  /** Aguardando a autorização (REVISAO): o pedido gravado (quem recebeu não pode passar a ser o técnico). */
  autorizacao?: PedidoAutorizacao | null
  /** Reabre o cadastro da balança (para corrigir Max, d, classe… sem sair da calibração). */
  editarBalanca: () => void
  /** Folha de campo da calibração (impressa por ela ou avulsa e ligada), ou null. */
  folhaCampo: FolhaCampoImpressa | null
  /** Liga à calibração a folha avulsa preenchida no cliente, pelo nº; true se ligou. */
  vincularFolha: (numero: string) => Promise<boolean>
  /** Imprime uma folha nova (nº novo, plano atual) no lugar da que a calibração tem (pede confirmação). */
  novaFolha: () => void
  /** Os campos obrigatórios para emitir (`camposObrigatoriosEmissao`); sem eles, a etapa calcula. */
  obrigatorios?: CampoObrigatorio[]
  /** O campo obrigatório em branco já fica em destaque (a pessoa passou por ele ou chegou à revisão com pendências). */
  destacar?: (campo: CampoObrigatorio) => boolean
  /** A pessoa saiu do campo (o foco saiu dele): o destaque passa a valer. */
  tocar?: (campo: CampoEmissao) => void
}

export type IdEtapa = EtapaCalibracao

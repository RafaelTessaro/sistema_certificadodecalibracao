// O que o editor da calibração (pages/CalibracaoForm) decide sem DOM: os padrões, as pendências da tela e o estado
// que vem do servidor. Separado para ser testado.

import { PENDENCIA_POP } from '#shared/arquivos.ts'
import {
  balancaIdentificada,
  minimosDoPopComoAviso,
  padroesDaCalibracao,
  PENDENCIAS_SO_DO_SERVIDOR,
  pendenciasAmbiente,
  pressaoComoAviso,
} from '#shared/dominio.ts'
import type { Balanca, Calibracao, CalibracaoInput, Padrao } from '#shared/tipos.ts'
import type { DetalheCalibracao } from '../../lib/api'
import type { ContextoEtapa, IdEtapa } from './contexto'
import { repetibilidadeCompleta } from './util'

/** Só os dados de entrada (o que a tela edita) de uma calibração gravada. */
export function entradaDe(k: Calibracao): CalibracaoInput {
  const {
    id: _id,
    versao: _v,
    status: _s,
    numero: _n,
    ano: _a,
    sequencia: _q,
    revisao: _r,
    emissao: _e,
    cancelamento: _c,
    criadoPor: _p,
    criadoEm: _ce,
    atualizadoEm: _ae,
    ...entrada
  } = k
  return entrada
}

/** O estado do editor que vem do servidor: ao abrir e ao recarregar o rascunho que o servidor mudou. */
export function estadoDoServidor(d: DetalheCalibracao) {
  return {
    f: entradaDe(d.calibracao),
    versao: d.calibracao.versao,
    folha: d.folhaCampo,
    numeroReservado: d.numeroReservado ?? null,
    pendencias: d.pendencias,
    // Para conferir, sem impedir a emissão (ausentes numa resposta de antes desta versão)
    avisos: d.avisos ?? [],
  }
}

/**
 * A etapa em que o editor abre: a primeira ainda sem leituras digitadas. Com leituras no erro de indicação, a revisão;
 * com alguma leitura da repetibilidade, a excentricidade; senão (null), a etapa 1 (Cliente e OS), onde ficam o técnico,
 * a OS e o nº da folha de campo. O plano copiado da última calibração (os ensaios com a carga e as leituras em branco)
 * não conta: a recalibração abre na etapa 1, como a primeira calibração da balança.
 */
export function etapaAoAbrir(k: Pick<CalibracaoInput, 'indicacao' | 'repetibilidade'>): IdEtapa | null {
  if (k.indicacao.pontos.some((x) => x.crescente !== null)) return 'revisao'
  if (k.repetibilidade.some((r) => r.leituras.some((l) => l !== null))) return 'excentricidade'
  return null
}

/**
 * A balança corrigida dentro do editor ("Corrigir cadastro") com outra unidade ou outro cliente: o servidor converte
 * o rascunho aberto (os números na unidade nova, o cliente novo) e sobe a versão (`acompanharAbertas`). O editor
 * precisa recarregá-lo, senão mostra os números de antes na unidade nova e a próxima gravação dá um falso conflito.
 */
export const balancaMudaRascunho = (
  antes: Pick<Balanca, 'unidade' | 'clienteId'>,
  depois: Pick<Balanca, 'unidade' | 'clienteId'>,
) => antes.unidade !== depois.unidade || antes.clienteId !== depois.clienteId

/**
 * Os padrões do editor, a partir do cadastro inteiro (com os desativados). `selecionados`: os escolhidos como valem
 * para a calibração (`padroesDaCalibracao`, igual ao servidor: o desativado depois de escolhido continua, e dá a
 * pendência). `paraEscolher`: os ativos e, dos desativados, só os escolhidos (com o selo, para poderem ser tirados).
 */
export function padroesDoEditor(
  cadastro: Padrao[],
  f: Pick<CalibracaoInput, 'padroesIds' | 'dataCalibracao'> & { padroesCongelados?: Padrao[] },
): { selecionados: Padrao[]; paraEscolher: Padrao[] } {
  const porId = new Map(cadastro.map((p) => [p.id, p]))
  return {
    selecionados: padroesDaCalibracao(f, (id) => porId.get(id)),
    paraEscolher: cadastro.filter((p) => p.ativo || f.padroesIds.includes(p.id)),
  }
}

/**
 * Refazer a montagem automática das cargas só quando todos os padrões escolhidos foram achados e nenhum jogo de pesos
 * escolhido está desativado: a montagem não usa jogo desativado (nem o que não existe mais), e apagaria as peças dele
 * de todos os pontos ao abrir o editor, gravando sozinha. As peças ficam como estão até ele sair da calibração (a
 * pendência pede isso) ou ser reativado. Na revisão, o jogo congelado na emissão conta como ativo.
 */
export const podeRecomporCargas = (padroesIds: string[], selecionados: Pick<Padrao, 'id' | 'tipo' | 'ativo'>[]) =>
  padroesIds.every((id) => selecionados.some((p) => p.id === id)) && selecionados.every((p) => p.tipo !== 'PESOS' || p.ativo)

/**
 * As pendências que a tela mostra (e que ligam ou desligam a emissão): as da emissão calculadas aqui na hora, as do
 * cálculo e, com tudo gravado (`emDia`), também as do servidor, que confere de novo ao emitir: a tela nunca diz "Tudo
 * pronto" quando o servidor recusa. Com alteração por gravar, as do servidor são da versão anterior e ficam de fora;
 * as que só o servidor sabe (o técnico excluído, o certificado revisado cancelado) valem sempre, e a do POP quem diz
 * é a consulta ao vivo (`semPop`).
 */
export function pendenciasDaTela(a: {
  locais: string[]
  calc: ContextoEtapa['calc']
  semPop: boolean
  servidor: string[]
  emDia: boolean
}): string[] {
  return [
    ...new Set([
      ...a.locais,
      ...(a.semPop ? [PENDENCIA_POP] : []),
      ...a.servidor.filter((p) => PENDENCIAS_SO_DO_SERVIDOR.includes(p)),
      ...(a.calc?.resultado.pendencias ?? []),
      ...(a.calc?.comoEncontrado?.pendencias.map((p) => `Como encontrado: ${p}`) ?? []),
      ...(a.emDia ? a.servidor.filter((p) => p !== PENDENCIA_POP) : []),
    ]),
  ]
}

/**
 * A etapa ganha o ✓ na lista de etapas. Padrões e ambiente: um jogo de pesos e nenhum padrão escolhido desativado
 * (impede a emissão: tire-o ou reative-o), as temperaturas, a pressão com o barômetro e o que o cálculo pede do ar e da
 * convecção. Na calibração
 * nova (as regras do POP): a excentricidade só fica "não realizada" na balança suspensa (gancho), e o erro de indicação
 * pede o retorno ao zero e as leituras que faltam (a subida; no "crescente e decrescente", a descida; POP 7.7 e 7.10).
 */
export function etapaCompleta(
  e: IdEtapa,
  {
    f,
    calc,
    selecionados,
    balanca,
  }: Pick<ContextoEtapa, 'f' | 'calc' | 'selecionados'> & Partial<Pick<ContextoEtapa, 'balanca'>>,
): boolean {
  // Os mínimos do POP valem: a dispensa da excentricidade só no gancho e o retorno ao zero (`minimosDoPopComoAviso`)
  const minimosDoPop = !minimosDoPopComoAviso(f)
  switch (e) {
    case 'identificacao':
      return !!f.dataCalibracao && !!f.tecnicoId && (f.local !== 'CLIENTE' || !!f.localEndereco.trim())
    case 'instrumento':
      // A balança identificável (a série, a TAG ou a série da plataforma; POP 7.3), que a emissão pede
      return (f.ajuste.realizado !== 'EXTERNO' || !!f.ajuste.descricao.trim()) && (!balanca || balancaIdentificada(balanca))
    case 'padroes': {
      const a = f.ambiente
      // Empuxo pela densidade do ar medida (classe I): a umidade e a pressão também; convecção: o ΔT pesos − ar
      const ar = f.opcoes.empuxo !== 'MEDIDO' || ((a.umidadeInicial ?? a.umidadeFinal) !== null && a.pressao !== null)
      const conveccao = f.opcoes.conveccao !== 'CALCULAR' || (a.deltaTPesos ?? null) !== null || !!a.aclimatacao
      // A pressão com o barômetro (obrigatória em toda classe, POP 7.5); sem os dois, só onde a falta dela é aviso
      const comBarometro = selecionados.some((p) => p.tipo === 'BAROMETRO')
      const pressao = a.pressao !== null ? comBarometro : !comBarometro && pressaoComoAviso(f, balanca?.classe)
      return (
        selecionados.some((p) => p.tipo === 'PESOS') &&
        selecionados.every((p) => p.ativo) &&
        a.temperaturaInicial !== null &&
        a.temperaturaFinal !== null &&
        pressao &&
        ar &&
        conveccao &&
        !pendenciasAmbiente(a).length
      )
    }
    case 'repetibilidade':
      return repetibilidadeCompleta(calc?.resultado.repetibilidade ?? [])
    case 'excentricidade':
      return !f.excentricidade.aplicavel
        ? !!f.excentricidade.motivo.trim() && (!minimosDoPop || !balanca || balanca.receptor === 'GANCHO')
        : !!calc && !calc.resultado.pendencias.some((p) => p.startsWith('Excentricidade'))
    case 'indicacao':
      return (
        f.indicacao.pontos.length > 0 &&
        f.indicacao.pontos.every((p) => p.crescente !== null || p.decrescente !== null) &&
        (!minimosDoPop || f.indicacao.retornoZero !== null) &&
        // A subida e, no "crescente e decrescente", a descida dos pontos (POP 7.7): as pendências do cálculo
        !calc?.resultado.pendencias.some((p) => p.startsWith('Erro de indicação: falta a leitura'))
      )
    case 'conclusao':
      return !f.conformidade.solicitada || f.conformidade.criterio !== 'CLIENTE' || f.conformidade.toleranciaCliente > 0
    case 'revisao':
      return false
  }
}

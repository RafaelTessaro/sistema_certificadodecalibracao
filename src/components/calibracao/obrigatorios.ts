// As marcas "●" das etapas da calibração e o caminho de cada pendência até o campo, a partir dos campos obrigatórios
// para emitir (`camposObrigatoriosEmissao`, as mesmas regras de `pendenciasEmissao`). Sem DOM: testado à parte.

import {
  camposObrigatoriosEmissao,
  PENDENCIA_TECNICO_EXCLUIDO,
  type CampoEmissao,
  type CampoObrigatorio,
} from '#shared/dominio.ts'
import type { ContextoEtapa, IdEtapa } from './contexto'

/** O que o campo da etapa mostra: a marca "●", o destaque (em branco, depois de passar por ele) e o fim do foco. */
export interface MarcaCampo {
  obrigatorio: boolean
  pendente: boolean
  aoSair: () => void
}

type ContextoMarcas = Pick<ContextoEtapa, 'f' | 'selecionados' | 'balanca' | 'obrigatorios' | 'destacar' | 'tocar'>

/** Os campos obrigatórios desta calibração: os do editor ou, sem eles (ex.: nos testes), calculados agora. */
export function camposDaEtapa(ctx: Pick<ContextoMarcas, 'f' | 'selecionados' | 'balanca' | 'obrigatorios'>): CampoObrigatorio[] {
  return ctx.obrigatorios ?? camposObrigatoriosEmissao(ctx.f, { padroes: ctx.selecionados ?? [], classe: ctx.balanca.classe })
}

/**
 * As marcas dos campos de uma etapa. Só o obrigatório marca e destaca: o que é só aviso nesta calibração (a pressão da
 * calibração medida quando ela era opcional) fica sem a marca, como opcional (`regraDe` diz qual).
 */
export function marcasDaEtapa(ctx: ContextoMarcas) {
  const campos = camposDaEtapa(ctx)
  const porCampo = new Map(campos.map((c) => [c.campo, c]))
  const marca = (campo: CampoEmissao): MarcaCampo => {
    const x = porCampo.get(campo)
    const obrigatorio = x?.regra === 'obrigatorio'
    return {
      obrigatorio,
      pendente: obrigatorio && x.falta && (ctx.destacar?.(x) ?? false),
      aoSair: () => ctx.tocar?.(campo),
    }
  }
  /** A regra do campo nesta calibração; null: não vale (ex.: o endereço na calibração no laboratório). */
  const regraDe = (campo: CampoEmissao) => porCampo.get(campo)?.regra ?? null
  return { marca, regraDe }
}

/** A etapa tem algum campo com a marca (a legenda "● obrigatório para emitir" aparece no alto dela). */
export const etapaTemMarcas = (campos: CampoObrigatorio[], etapa: IdEtapa) =>
  campos.some((c) => c.etapa === etapa && c.regra === 'obrigatorio')

/** Onde está o campo de uma pendência: a etapa e, quando há, o id do controle (para levar o foco até ele). */
export interface DestinoPendencia {
  etapa: IdEtapa
  alvo?: string
}

/**
 * Pendências que não são de um campo em branco: pelo começo do texto (o cálculo e as conferências falam a etapa ou o
 * ensaio no começo). A primeira que casa vale.
 */
const PELO_TEXTO: Array<[RegExp, IdEtapa, string?]> = [
  [/^Como encontrado: /, 'indicacao'],
  [/^Repetibilidade/, 'repetibilidade', 'k-repetibilidade'],
  [/^Excentricidade/, 'excentricidade', 'k-excentricidade'],
  [/^Erro de indicação/, 'indicacao', 'k-indicacao'],
  [/^Instrumento:/, 'instrumento'],
  [/^Balança sem nº de série/, 'instrumento'],
  [/^Conformidade: informe a tolerância/, 'conclusao', 'conf-tol'],
  [/^Conformidade/, 'conclusao', 'conf-crit'],
  [/^Balança classe I: (o empuxo|a convecção)/, 'conclusao', 'k-opcoes'],
  [/^Temperatura no início/, 'padroes', 'amb-ti'],
  [/^Temperatura no fim/, 'padroes', 'amb-tf'],
  [/^Umidade no início/, 'padroes', 'amb-ui'],
  [/^Umidade no fim/, 'padroes', 'amb-uf'],
  [/^Pressão (de|fora)/, 'padroes', 'amb-p'],
  [/^Diferença de temperatura pesos/, 'padroes', 'amb-dtp'],
  [/^Aclimatação dos pesos: diferença/, 'padroes', 'amb-acl-dt'],
  [/^Aclimatação dos pesos: tempo/, 'padroes', 'amb-acl-min'],
  [/^(Empuxo|Convecção|Balança classe I|O padrão |Pressão|Barômetro|Registre a pressão)/, 'padroes', 'k-pesos'],
  [/^A data da calibração/, 'identificacao', 'k-data'],
  [/^O recebimento do item/, 'identificacao', 'k-receb'],
  [/^A próxima calibração/, 'conclusao', 'k-prox'],
]

/**
 * A etapa (e o campo) de uma pendência da revisão: primeiro, a do campo obrigatório em branco que a dá (o mesmo texto);
 * depois, pelo começo do texto. null: não é de nenhuma etapa (ex.: o POP sem registro, em Configurações).
 */
export function destinoDaPendencia(p: string, campos: CampoObrigatorio[]): DestinoPendencia | null {
  const doCampo = campos.find((c) => c.falta && c.pendencias.includes(p))
  if (doCampo) return { etapa: doCampo.etapa, ...(doCampo.alvo ? { alvo: doCampo.alvo } : {}) }
  if (p === PENDENCIA_TECNICO_EXCLUIDO) return { etapa: 'identificacao', alvo: 'k-tec' }
  const regra = PELO_TEXTO.find(([padrao]) => padrao.test(p))
  return regra ? { etapa: regra[1], ...(regra[2] ? { alvo: regra[2] } : {}) } : null
}

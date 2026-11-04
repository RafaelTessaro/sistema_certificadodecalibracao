import {
  comMetodoIndicacaoDaClasse,
  dataIsoValida,
  deltaTMaximo,
  ehRodoviaria,
  metodoExcentricidadePadrao,
  METODOS_EXCENTRICIDADE,
  metodoIndicacaoDaVisita,
  somarMeses,
  temLeiturasExcentricidade,
} from '#shared/dominio.ts'
import { cargaDaFaixaDecrescente, casasDecimais, leituraImplausivel } from '#shared/metrologia/index.ts'
import type { ResultadoPonto } from '#shared/metrologia/tipos.ts'
import type { Balanca, CalibracaoInput, ClasseExatidao, Padrao, PontoIndicacao } from '#shared/tipos.ts'
import { comMetodoMedidoDaClasse } from './indicacao'

/** Maior capacidade da balança. */
export const maxDe = (b: Pick<Balanca, 'faixas'>) => Math.max(0, ...b.faixas.map((f) => f.max))

/** Casas decimais das leituras (as da menor divisão). */
export const casasDe = (b: Pick<Balanca, 'faixas'>) => Math.max(0, ...b.faixas.map((f) => casasDecimais(f.d)))

/** Menor divisão da balança. */
export const menorD = (b: Pick<Balanca, 'faixas'>) => Math.min(...b.faixas.map((f) => f.d).filter((d) => d > 0), Infinity)

/** Aviso da variação da temperatura acima do limite da classe (1 °C na I; 3 °C na II; 5 °C nas demais e sem classe). */
export function textoDeltaT(deltaT: number, classe: ClasseExatidao): string {
  const variou = String(Math.round(deltaT * 10) / 10).replace('.', ',')
  const quem = classe ? `balanças classe ${classe}` : 'balanças sem classe'
  return `A temperatura variou ${variou} °C durante a calibração. O limite para ${quem} é ${deltaTMaximo(classe)} °C; registre nas observações.`
}

/**
 * Dica da carga da repetibilidade (POP 7.9): faixa única, de 50 % a 100 % da capacidade (na rodoviária pode ser
 * menos); multi-intervalo e múltiplas faixas, um ensaio por intervalo (ou faixa) de d diferente.
 */
export function dicaRepetibilidade(b: Pick<Balanca, 'tipoFaixas' | 'faixas' | 'tipo' | 'receptor'>): string {
  if (b.tipoFaixas !== 'UNICA' && b.faixas.length > 1)
    return `Faça um ensaio por ${b.tipoFaixas === 'MULTI_INTERVALO' ? 'intervalo' : 'faixa'}: nos de baixo, com carga logo abaixo do Max dele; no de cima, de 50 % a 100 % de Max, sem coincidir com o Max de baixo (não precisa ser peso padrão).`
  return `Use de 50 % a 100 % da capacidade${ehRodoviaria(b) ? ' (na rodoviária, pode ser menos)' : ''} (não precisa ser peso padrão).`
}

/**
 * Os ensaios de repetibilidade a acrescentar: sem nenhum, todos os sugeridos; senão, o primeiro sugerido que
 * ainda não está na lista (pela carga) ou, com todos lá, o do intervalo de cima de novo (outra carga, a pedido).
 */
export function proximosEnsaiosRepetibilidade<T extends { carga: number }>(
  sugeridos: T[],
  atuais: Array<{ carga: number }>,
): T[] {
  if (!sugeridos.length) return []
  if (!atuais.length) return sugeridos
  const falta = sugeridos.find((s) => !atuais.some((a) => Math.abs(a.carga - s.carga) <= 1e-9 * Math.max(1, s.carga)))
  return [falta ?? sugeridos.at(-1)!]
}

/**
 * O cliente faz o ajuste interno (CAL) antes dos ensaios, se a balança tiver (POP 7.11): sempre na classe I e quando
 * d é menor que 1/100 000 de Max.
 */
export function pedeAjusteInterno(b: Pick<Balanca, 'classe' | 'faixas'>): boolean {
  return b.classe === 'I' || menorD(b) < maxDe(b) / 100_000
}

/**
 * Dica do método da excentricidade ao alterá-lo: o do POP (7.10) para a classe, pelo nome (o POP não numera os métodos;
 * o número é só do registro).
 */
export const dicaDoMetodoExcentricidade = (classe: ClasseExatidao | null | undefined) =>
  `Pelo POP (7.10), na ${classe === 'I' ? 'classe I' : 'classe da balança'}: “${METODOS_EXCENTRICIDADE[metodoExcentricidadePadrao(classe)].toLowerCase()}”.`

/**
 * A classe da balança mudou no meio da calibração ("Corrigir cadastro"): os ensaios ainda sem leituras passam para o
 * método da classe nova, a excentricidade (POP 7.10: 1; na classe I, 3) e o erro de indicação (POP 7.7: "crescente e
 * decrescente"; na classe I, "crescente com descarga"; `comMetodoIndicacaoDaClasse`). Com leituras, cada um fica como
 * foi feito; o erro de indicação da visita feita antes dessa regra (`metodoIndicacaoDaVisita`), também sem elas. O
 * ensaio trocado de método depois das leituras volta para o medido quando ele é o da classe nova
 * (`comMetodoMedidoDaClasse`). Nada a mudar: o mesmo objeto.
 */
export function comMetodoDaClasse<
  T extends Pick<CalibracaoInput, 'excentricidade' | 'indicacao' | 'opcoes'> &
    Partial<Pick<CalibracaoInput, 'calculoLegado' | 'substituiId' | 'regrasDoPop' | 'minimosComoAviso' | 'descidaComoAviso'>>,
>(f: T, classe: ClasseExatidao): T {
  const metodo = metodoExcentricidadePadrao(classe)
  const excentricidade =
    f.excentricidade.metodo === metodo || temLeiturasExcentricidade(f.excentricidade)
      ? f.excentricidade
      : { ...f.excentricidade, metodo }
  const indicacao = comMetodoMedidoDaClasse(
    comMetodoIndicacaoDaClasse(f.indicacao, classe, metodoIndicacaoDaVisita(f)),
    classe,
  )
  return excentricidade === f.excentricidade && indicacao === f.indicacao ? f : { ...f, excentricidade, indicacao }
}

/**
 * A etapa Repetibilidade está feita: algum ensaio com 2 leituras ou mais, nenhum ensaio com carga e sem leitura (o
 * copiado do último certificado, ou o da carga sugerida, que ficou para trás: registre as leituras ou remova-o) e
 * nenhum com leituras e sem a carga (o campo apagado grava 0; POP 7.9).
 */
export const repetibilidadeCompleta = (ensaios: ReadonlyArray<{ carga: number; n: number }>) =>
  ensaios.some((r) => r.n >= 2) && ensaios.every((r) => (r.n > 0 ? r.carga > 0 : !(r.carga > 0)))

/**
 * Posição da leitura `i` do ensaio `iEns` na navegação de planilha: todos os ensaios num grupo só, um ensaio por
 * coluna. O Enter na última leitura de um ensaio vai para a 1ª do seguinte (quem digita as leituras da folha em
 * sequência não emenda as do ensaio 2 na última do ensaio 1).
 */
export const gradeRepetibilidade = (iEns: number, i: number) => ({ grupo: 'rep', lin: i, col: iEns })

/**
 * Cor do campo da leitura: fora do esperado para a carga (provável erro de digitação: vírgula esquecida, outra unidade,
 * a carga esquecida; a mesma regra da pendência do cálculo, `leituraImplausivel`), erro; com o erro acima do EMA em
 * serviço (a balança não pesa corretamente, POP 7.8, mesmo sem a conformidade pedida) ou fora do EMA da conformidade,
 * atenção. `cargaDescida`: a do cálculo (`cargaDaDescida`), para a leitura decrescente das múltiplas faixas ser
 * conferida pelo e da faixa em que foi lida.
 */
export function tomLeitura(
  p: Pick<PontoIndicacao, 'carga' | 'crescente' | 'decrescente'>,
  r: ResultadoPonto | undefined,
  lado: 'crescente' | 'decrescente',
  balanca: Pick<Balanca, 'tipoFaixas' | 'faixas'>,
  cargaDescida: number | null = null,
): 'normal' | 'erro' | 'atencao' {
  // A carga digitada (a do cálculo é a soma dos pesos; quando não fecham, a diferença já é pendência)
  const faixa = lado === 'decrescente' ? cargaDaFaixaDecrescente(p.carga, cargaDescida) : p.carga
  if (leituraImplausivel(p[lado], p.carga, balanca, faixa)) return 'erro'
  if (r?.foraDoEmaServico?.[lado]) return 'atencao'
  if (r?.[lado] && r.conformidade === 'NAO_CONFORME') return 'atencao'
  return 'normal'
}

/**
 * Os cartões da etapa Padrões: cada padrão do cadastro (os ativos) e, no lugar dos escolhidos, a versão que vale para
 * a calibração (`selecionados`: o certificado do dia; na revisão, o da emissão original). O escolhido que não está
 * mais na lista (desativado depois da emissão, na revisão) entra no fim, para poder ser tirado.
 */
export function cartoesDosPadroes(padroes: Padrao[], selecionados: Padrao[]): Padrao[] {
  return [
    ...padroes.map((p) => selecionados.find((s) => s.id === p.id) ?? p),
    ...selecionados.filter((s) => !padroes.some((p) => p.id === s.id)),
  ]
}

/** O padrão foi calibrado depois da data da calibração (o certificado dele não valia no dia)? */
export const calibradoDepois = (p: Pick<Padrao, 'dataCalibracao'>, dataCalibracao: string) =>
  dataIsoValida(p.dataCalibracao) && dataIsoValida(dataCalibracao) && p.dataCalibracao > dataCalibracao

/**
 * A próxima calibração quando a data da calibração muda: se ela era a calculada pela data antiga (o padrão da
 * empresa, 6, 12 ou 24 meses depois), passa a contar da nova; a digitada à mão fica como está.
 */
export function proximaAcompanhando(proxima: string, dataAntiga: string, dataNova: string, mesesPadrao: number): string {
  if (!proxima || !dataIsoValida(dataAntiga) || !dataIsoValida(dataNova)) return proxima
  const meses = [...new Set([mesesPadrao, 12, 6, 24])].filter((n) => n > 0)
  const n = meses.find((m) => somarMeses(dataAntiga, m) === proxima)
  return n ? somarMeses(dataNova, n) : proxima
}

/** O dia seguinte (para o mínimo da próxima calibração: depois da data da calibração). */
export function diaSeguinte(iso: string): string {
  if (!dataIsoValida(iso)) return ''
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

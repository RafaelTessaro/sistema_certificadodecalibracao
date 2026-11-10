import { comCargasDoEmaIncluidas, leiturasDoMetodo, pontosEmOrdemDeCarga } from '#shared/calibracao.ts'
import {
  comMetodoIndicacaoDaClasse,
  METODOS_CARREGAMENTO,
  metodoIndicacaoForaDoPop,
  metodoIndicacaoPadrao,
  numeroBr,
  temLeiturasDeCarga,
} from '#shared/dominio.ts'
import type { Balanca, CalibracaoInput, ClasseExatidao, EnsaioIndicacao, MetodoCarregamento, Padrao } from '#shared/tipos.ts'

/** Abas do erro de indicação: "antes do ajuste" (como encontrado) e "depois do ajuste" (o ensaio final). */
export type AbaIndicacao = 'antes' | 'depois'

/**
 * Muda o ensaio da aba aberta: "antes do ajuste" é o `comoEncontrado`; "depois" (ou sem ajuste), o erro de
 * indicação final. Cada aba tem os seus pontos, o seu método, o seu retorno ao zero e as suas etapas de
 * substituição, como as duas colunas da folha de campo.
 */
export function mudarEnsaioDaAba(
  s: CalibracaoInput,
  aba: AbaIndicacao,
  mudar: (e: EnsaioIndicacao) => EnsaioIndicacao,
): CalibracaoInput {
  return aba === 'antes' && s.comoEncontrado
    ? { ...s, comoEncontrado: mudar(s.comoEncontrado) }
    : { ...s, indicacao: mudar(s.indicacao) }
}

/**
 * Leituras já digitadas nos pontos com carga, nas colunas do método (a escondida não conta): as que "Refazer pontos"
 * apaga. O zero (lido 0 nos pontos sugeridos) não conta.
 */
export function leiturasDigitadas(e: EnsaioIndicacao): number {
  return e.pontos
    .filter((p) => p.carga > 0)
    .reduce((n, p) => {
      const l = leiturasDoMetodo(p, e.metodo)
      return n + (l.crescente !== null ? 1 : 0) + (l.decrescente !== null ? 1 : 0)
    }, 0)
}

/** A pergunta antes de refazer os pontos com leituras digitadas. */
export const textoRefazerPontos = (n: number) =>
  `Refazer os pontos apaga ${n === 1 ? 'a leitura já digitada' : `as ${n} leituras já digitadas`}. Continuar?`

/**
 * "Refazer pontos" troca os pontos pelos sugeridos e apaga as leituras e as cargas mudadas à mão (o rascunho grava
 * sozinho, sem desfazer). Com leituras digitadas, só depois de `confirmarApagar` (com quantas); sem elas, direto.
 */
export async function podeRefazerPontos(
  e: EnsaioIndicacao,
  confirmarApagar: (leituras: number) => Promise<boolean>,
): Promise<boolean> {
  const n = leiturasDigitadas(e)
  return n === 0 || (await confirmarApagar(n))
}

/**
 * O ensaio com os pontos em ordem de carga (`pontosEmOrdemDeCarga`), ao sair do campo da carga: o ponto acrescentado
 * no fim vai para o lugar dele, como no certificado ("cargas crescentes"). O "Decrescente" (só num registro de antes)
 * fica como está. Já em ordem, o mesmo ensaio (nada a gravar).
 */
export function ensaioEmOrdemDeCarga(e: EnsaioIndicacao): EnsaioIndicacao {
  if (e.metodo === 'DECRESCENTE') return e
  const pontos = pontosEmOrdemDeCarga(e.pontos)
  return pontos === e.pontos ? e : { ...e, pontos }
}

// ---- Método de carregamento: fixo pela classe (POP 7.7) ------------------------------------------------------

/** O nome do método como a tela e a folha escrevem: “Crescente e decrescente”. */
const nomeMetodo = (m: MetodoCarregamento) => `“${METODOS_CARREGAMENTO[m].label}”`

/** A linha embaixo do método: o que o POP pede na classe da balança. */
export const textoMetodoDaClasse = (classe: ClasseExatidao | null | undefined) =>
  `Pelo POP (7.7), nesta classe: ${nomeMetodo(metodoIndicacaoPadrao(classe))}.`

/**
 * Como a etapa mostra o método do ensaio final (sem escolha: é o da classe). `metodo`: o que aparece; `foraDoPop`: o
 * ensaio já tem leituras de carga com outro método (medido antes dessa regra, ou a classe trocada depois das
 * leituras) ou, sem elas, é de uma visita feita antes dessa regra (`daVisita`, `metodoIndicacaoDaVisita`): fica como
 * foi medido, com o aviso e a troca para o do POP; `automatico`: sem leituras de carga e com outro método, a tela mostra
 * o da classe e o grava junto com a primeira mudança no ensaio (`noMetodoDaClasse`; só abrir a etapa não grava nada);
 * `voltarPara`: o ensaio foi trocado de método depois das leituras (`EnsaioIndicacao.metodoMedido`), e a tela oferece
 * voltar para o medido.
 */
export function metodoNaEtapa(
  e: Pick<EnsaioIndicacao, 'metodo' | 'metodoMedido' | 'pontos' | 'substituicao'>,
  classe: ClasseExatidao | null | undefined,
  daVisita = false,
): { metodo: MetodoCarregamento; foraDoPop: boolean; automatico: boolean; voltarPara: MetodoCarregamento | null } {
  const fora = metodoIndicacaoForaDoPop(e.metodo, classe)
  const medido = daVisita || temLeiturasDeCarga(e)
  return {
    metodo: fora && !medido ? metodoIndicacaoPadrao(classe) : e.metodo,
    foraDoPop: fora && medido,
    automatico: fora && !medido,
    voltarPara: medido && e.metodoMedido && e.metodoMedido !== e.metodo ? e.metodoMedido : null,
  }
}

/**
 * A mudança no ensaio final feita pela etapa, no método da classe (`comMetodoIndicacaoDaClasse`): o ensaio sem leituras
 * de carga com outro método (o rascunho de antes, a classe trocada fora do formulário) passa para o da classe junto com
 * a primeira mudança, e a primeira leitura digitada já entra nele. Também depois dela (o "Refazer pontos" que apaga as
 * leituras). Com leituras, ou na visita feita antes dessa regra (`daVisita`), fica o método do ensaio. Assim, só abrir a
 * etapa não grava nada (duas pessoas com o mesmo rascunho aberto não entram em conflito).
 */
export function noMetodoDaClasse(
  mudar: (e: EnsaioIndicacao) => EnsaioIndicacao,
  classe: ClasseExatidao | null | undefined,
  daVisita = false,
): (e: EnsaioIndicacao) => EnsaioIndicacao {
  return (e) => comMetodoIndicacaoDaClasse(mudar(comMetodoIndicacaoDaClasse(e, classe, daVisita)), classe, daVisita)
}

/**
 * O aviso do ensaio com outro método (`metodoNaEtapa(...).foraDoPop`). Medido com ele (antes do método fixo pela
 * classe, ou a classe trocada depois das leituras): não impede a emissão, e o certificado sai com o método usado. Sem
 * leituras, na visita feita antes dessa regra: o mesmo, se as cargas foram aplicadas assim. Trocado depois das leituras
 * (`metodoMedido`) e com a classe trocada depois: o método de agora não é o do POP nem o medido, e impede a emissão.
 * Na visita feita antes dessa regra (`daVisita`), o método guardado é aquele com que a calibração foi começada, sem
 * "medido": a troca pode ter vindo antes das leituras (`textoMetodoTrocado`).
 */
export function textoMetodoForaDoPop(
  e: Pick<EnsaioIndicacao, 'metodo' | 'metodoMedido' | 'pontos' | 'substituicao'>,
  classe: ClasseExatidao | null | undefined,
  daVisita = false,
): string {
  const pop = metodoIndicacaoPadrao(classe)
  const medido = e.metodoMedido && e.metodoMedido !== e.metodo ? e.metodoMedido : null
  if (medido) {
    const [origem, volta] = daVisita
      ? [`Começada antes desta versão com ${nomeMetodo(medido)} e trocada`, 'o de antes']
      : [`Medido como ${nomeMetodo(medido)} e trocado`, 'o medido']
    return `${origem} depois para ${nomeMetodo(e.metodo)}, que não é o método do POP nesta classe${
      medido === pop ? `. Volte para ${volta}` : ` (${nomeMetodo(pop)}). Use o do POP ou volte para ${volta}`
    }: do jeito que está, o certificado não sai.`
  }
  if (!temLeiturasDeCarga(e))
    return `Começada antes desta versão com ${nomeMetodo(e.metodo)}, que não é o método do POP nesta classe (${nomeMetodo(pop)}). Se as cargas foram aplicadas assim, digite as leituras: o certificado sai com o método usado. Se não, use o do POP.`
  return `Medido como ${nomeMetodo(e.metodo)}, que não é o método do POP nesta classe (${nomeMetodo(pop)}). As leituras ficam como estão, e o certificado sai com o método usado.`
}

/**
 * Leituras dos pontos com carga que a troca para `novo` esconde (a coluna que ele não usa): elas ficam guardadas, mas
 * saem do cálculo e do certificado. O zero não conta (como em `leiturasDigitadas`).
 */
export function leiturasEscondidasPelaTroca(e: EnsaioIndicacao, novo: MetodoCarregamento): number {
  return e.pontos
    .filter((p) => p.carga > 0)
    .reduce((n, p) => {
      const agora = leiturasDoMetodo(p, e.metodo)
      const depois = leiturasDoMetodo(p, novo)
      return (
        n +
        (agora.crescente !== null && depois.crescente === null ? 1 : 0) +
        (agora.decrescente !== null && depois.decrescente === null ? 1 : 0)
      )
    }, 0)
}

/**
 * O que o método `novo` pede e o ensaio ainda não tem, nos pontos com carga já lidos: a subida (todo método, menos o
 * "Decrescente") e a descida ("crescente e decrescente", menos na maior carga, que é a virada). Como as pendências do
 * cálculo.
 */
export function leiturasQueFaltam(e: EnsaioIndicacao, novo: MetodoCarregamento): { subida: boolean; descida: boolean } {
  const lidos = e.pontos.filter((p) => p.carga > 0 && (p.crescente !== null || p.decrescente !== null))
  const maior = Math.max(0, ...lidos.map((p) => p.carga))
  return {
    subida: novo !== 'DECRESCENTE' && lidos.some((p) => p.crescente === null),
    descida:
      novo === 'CRESCENTE_DECRESCENTE' && !e.substituicao.ativa && lidos.some((p) => p.carga < maior && p.decrescente === null),
  }
}

/** As leituras de descida que uma troca esconde (ficam guardadas, fora do cálculo e do certificado). */
const textoEscondidas = (n: number) =>
  n === 1
    ? 'A leitura de descida já digitada sai do cálculo e do certificado (fica guardada).'
    : `As ${n} leituras de descida já digitadas saem do cálculo e do certificado (ficam guardadas).`

/**
 * A pergunta antes de passar o ensaio já medido para o método do POP (sempre: o certificado passa a dizer que as cargas
 * foram aplicadas assim). Diz as leituras que a troca esconde, o que o método novo pede e ainda falta (sem isso, o
 * certificado não sai) e que dá para voltar para o método medido.
 */
export function textoTrocarMetodo(e: EnsaioIndicacao, novo: MetodoCarregamento): string {
  const n = leiturasEscondidasPelaTroca(e, novo)
  const medido = temLeiturasDeCarga(e)
  // Sem leituras (a visita feita antes dessa regra), tudo o que o método novo pede ainda falta
  const falta = medido
    ? leiturasQueFaltam(e, novo)
    : { subida: novo !== 'DECRESCENTE', descida: novo === 'CRESCENTE_DECRESCENTE' && !e.substituicao.ativa }
  const pede = [falta.subida && 'subida', falta.descida && 'descida'].filter(Boolean).join(' e de ')
  const menosMax = falta.descida ? ', menos Max' : ''
  return [
    n > 0 ? textoEscondidas(n) : '',
    pede ? `${nomeMetodo(novo)} pede a leitura de ${pede} em cada carga${menosMax}: sem ela, o certificado não sai.` : '',
    medido
      ? 'Troque só se for medir de novo com esse método, que é o que sai no certificado.'
      : 'Troque só se as cargas foram aplicadas assim, ou se for medir de novo com esse método: é o que sai no certificado.',
    `Dá para voltar para ${nomeMetodo(e.metodoMedido ?? e.metodo)}.`,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * O ensaio sem a marca do método medido: não foi trocado depois das leituras, ou "Refazer pontos" apagou as leituras
 * (sem elas, não há método medido a guardar).
 */
export function semMetodoMedido(e: EnsaioIndicacao): EnsaioIndicacao {
  const { metodoMedido: _medido, ...resto } = e
  return resto
}

/**
 * "Usar o método do POP" no ensaio medido com outro: troca para o da classe e guarda o método medido
 * (`EnsaioIndicacao.metodoMedido`), para voltar a ele. Com leituras de carga, ou na visita feita antes dessa regra
 * (`daVisita`, mesmo sem elas: o método gravado é o da visita), só depois de `confirmar` (`textoTrocarMetodo`): a troca
 * muda o que o certificado diz. Devolve o ensaio novo, ou null (nada a trocar, ou a pessoa desistiu).
 */
export async function trocarParaMetodoDoPop(
  e: EnsaioIndicacao,
  classe: ClasseExatidao | null | undefined,
  confirmar: (texto: string) => Promise<boolean>,
  daVisita = false,
): Promise<EnsaioIndicacao | null> {
  const novo = metodoIndicacaoPadrao(classe)
  if (e.metodo === novo) return null
  if (!daVisita && !temLeiturasDeCarga(e)) return { ...semMetodoMedido(e), metodo: novo }
  if (!(await confirmar(textoTrocarMetodo(e, novo)))) return null
  const medido = e.metodoMedido ?? e.metodo
  return medido === novo ? { ...semMetodoMedido(e), metodo: novo } : { ...e, metodo: novo, metodoMedido: medido }
}

/**
 * A classe da balança trocada no formulário ("Corrigir cadastro") com o ensaio já trocado de método depois das leituras
 * (`EnsaioIndicacao.metodoMedido`): se o método medido é o da classe nova, o ensaio volta para ele, sem a marca (as
 * leituras foram feitas assim; o certificado não pode sair com um método que não é o medido nem o do POP). Nada a
 * mudar: o mesmo ensaio.
 */
export function comMetodoMedidoDaClasse<T extends Pick<EnsaioIndicacao, 'metodo' | 'metodoMedido'>>(
  e: T,
  classe: ClasseExatidao | null | undefined,
): T {
  const medido = e.metodoMedido
  if (!medido || medido === e.metodo || medido !== metodoIndicacaoPadrao(classe)) return e
  const { metodoMedido: _medido, ...resto } = e
  return { ...resto, metodo: medido } as T
}

/**
 * A nota do ensaio trocado de método (`metodoNaEtapa(...).voltarPara`), com a volta ao lado. A calibração desta versão
 * só guarda o método trocado com leituras de carga (`trocarParaMetodoDoPop`): foram medidas com ele. Na visita feita
 * antes dessa regra (`daVisita`), também sem leituras (a folha de antes impressa, nada digitado), e as leituras podem ter
 * sido digitadas depois da troca: a nota diz o método com que a calibração foi começada, sem "leituras medidas".
 */
export const textoMetodoTrocado = (medido: MetodoCarregamento, daVisita = false) =>
  `${
    daVisita
      ? `Começada antes desta versão com ${nomeMetodo(medido)} e trocada depois para o método do POP.`
      : `Trocado depois das leituras, medidas como ${nomeMetodo(medido)}.`
  } O que este método pede e falta impede a emissão.`

/** A pergunta antes de voltar para o método medido quando a volta esconde leituras (a descida digitada depois). */
export const textoVoltarMetodo = (n: number, medido: MetodoCarregamento) =>
  `Com ${nomeMetodo(medido)}, ${
    n === 1
      ? 'a leitura de descida já digitada sai do cálculo e do certificado (fica guardada)'
      : `as ${n} leituras de descida já digitadas saem do cálculo e do certificado (ficam guardadas)`
  }. Continuar?`

/**
 * "Voltar para …" no ensaio trocado de método depois das leituras: volta para o método medido e tira a marca. Quando a
 * volta esconde leituras (a descida digitada depois da troca), só depois de `confirmarEsconder` (`textoVoltarMetodo`).
 * Devolve o ensaio novo, ou null (nada a voltar, ou a pessoa desistiu).
 */
export async function voltarParaMetodoMedido(
  e: EnsaioIndicacao,
  confirmarEsconder: (texto: string) => Promise<boolean>,
): Promise<EnsaioIndicacao | null> {
  const medido = e.metodoMedido
  if (!medido || medido === e.metodo) return null
  const n = leiturasEscondidasPelaTroca(e, medido)
  if (n > 0 && !(await confirmarEsconder(textoVoltarMetodo(n, medido)))) return null
  return { ...semMetodoMedido(e), metodo: medido }
}

/**
 * Marca ou desmarca "O cliente pediu" (a declaração de conformidade). Ao marcar com o plano ainda sem nenhuma carga lida,
 * as cargas em que o EMA muda que faltam entram no erro de indicação, sem leituras (POP 7.7; `comCargasDoEmaIncluidas`):
 * na recalibração, o plano copiado da última calibração não as tem, e a folha impressa depois do pedido precisa delas.
 * Com leituras, nada entra sozinho (o aviso diz quais faltam e oferece incluí-las). Desmarcar não tira nada. `incluidas`:
 * as cargas que entraram, para a tela avisar.
 */
export function pedirConformidade(
  f: CalibracaoInput,
  solicitada: boolean,
  balanca: Balanca,
  padroes: Padrao[],
): { f: CalibracaoInput; incluidas: number[] } {
  const marcada = { ...f, conformidade: { ...f.conformidade, solicitada } }
  if (!solicitada || f.conformidade.solicitada) return { f: marcada, incluidas: [] }
  const r = comCargasDoEmaIncluidas(marcada, balanca, padroes, { soPlano: true })
  return { f: r.calibracao, incluidas: r.incluidas }
}

/**
 * O aviso de que as cargas em que o EMA muda entraram no erro de indicação (título e descrição do toast): ao marcar "O
 * cliente pediu" ou pelo botão do aviso.
 */
export function textoCargasIncluidas(
  cargas: number[],
  unidade: string,
  /** A folha de campo já impressa para esta calibração (o papel não tem as cargas): o nº, para dizer qual trocar. */
  folhaImpressa?: string,
): [string, string] {
  const l = cargas.map((c) => `${numeroBr(c)} ${unidade}`)
  const lista = l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l.at(-1)}` : (l[0] ?? '')
  const uma = cargas.length === 1
  return [
    uma ? `Carga ${lista} incluída no erro de indicação` : `Cargas ${lista} incluídas no erro de indicação`,
    `Com a declaração de conformidade, o POP (7.7) pede também ${uma ? 'a carga' : 'as cargas'} em que o EMA muda. ${
      folhaImpressa
        ? `A folha ${folhaImpressa}, já impressa, não ${uma ? 'a' : 'as'} tem: se ela ainda não foi a campo, imprima a “Folha nova (novo nº)” (etapa Cliente e OS).`
        : 'Confira o plano antes de imprimir a folha de campo.'
    }`,
  ]
}

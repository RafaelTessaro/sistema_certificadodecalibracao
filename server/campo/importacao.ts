// O escritório leva o registro de campo (o que o técnico anotou no celular) para a calibração (1.1.0; 05-ajustes-finais
// §9 e §10). A lógica dos dados é a de shared/campo/importar.ts (a mesma que a tela usa na prévia); aqui ficam as regras
// do servidor, que nunca confia na prévia da tela e recalcula tudo com o rascunho gravado:
//
// - Piloto (registro original = PAPEL): "Comparar com o campo" grava a comparação (campo_importacoes, COMPARACAO), com a
//   observação opcional, e NÃO escreve nada no rascunho.
// - Registro original = CELULAR: "Puxar dados do campo" aplica no rascunho o que foi escolhido em cada diferença (sem
//   escolha, o do celular), com a conferência da versão (409 CONFLITO). O técnico que assinou no celular fica sendo o
//   técnico e quem o definiu (`tecnicoConfirmado`): quem puxa os dados não fica impedido de autorizar. Só vale o técnico
//   que é o dono do celular que entregou ou aquele a quem a folha foi enviada (o id do registro é o que o celular diz).
//   "Criar calibração com os dados do campo": a folha sem rascunho (a avulsa da balança, a da calibração excluída, ou a
//   só do cliente / em branco depois de cadastrar a balança) vira um rascunho ligado à folha e com os dados puxados.
// - Depois de puxar, um dado bruto mudado (leitura, carga, ambiente, data, padrões) é pendência de emissão até existir uma
//   justificativa (um texto só). Na emissão, o registro, as diferenças e a justificativa ficam congelados em
//   `emissao.campo` (só dado: o PDF do certificado não muda).
//
// O registro usado é sempre o VALIDO mais novo da folha da calibração (uma revisão mais nova do mesmo envio deixa a
// anterior SUPERADO). O sha256 do registro é interno: vai congelado na emissão, nunca para a tela.

import {
  aplicarDoCampo,
  type CampoDaEmissao,
  diferencasDoCampo,
  type DivergenciaCampo,
  divergenciasParaEmissao,
  type EscolhaCampo,
  type EscolhasCampo,
  type OpcoesComparar,
  pendenciaJustificativaCampo,
  type ResumoImportacao,
} from '#shared/campo/importar.ts'
import type { PacoteCampo, RegistroCampo } from '#shared/campo/tipos.ts'
import { pode } from '#shared/permissoes.ts'
import type {
  Calibracao,
  CalibracaoInput,
  CampoDaCalibracao,
  FolhaCampoDaBalanca,
  ImportacaoCampo,
  JustificativaCampo,
  RegistroCampoListado,
  TecnicoParaEnvio,
  UsuarioSessao,
} from '#shared/tipos.ts'
import type { Contexto, ServicosCampo } from '../contexto.ts'
import { transacao } from '../db.ts'
import { ErroApi } from '../erros.ts'
import { rascunhoInicial } from '../rascunhos.ts'
import { celularDasFolhas, envioParaLista, type LinhaEnvio } from './repositorio.ts'

/** Até quantos caracteres a justificativa e a observação da comparação guardam. */
export const LIMITE_JUSTIFICATIVA = 1000
export const LIMITE_OBSERVACAO = 2000

type Autor = Pick<UsuarioSessao, 'id' | 'nome'>

const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Texto livre de várias linhas: sem caracteres de controle (a quebra de linha fica), espaços juntados, até `max`. */
export function textoLivre(v: unknown, max: number): string {
  return (typeof v === 'string' ? v : '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? '\n' : ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

/** As escolhas da tela ("Fica: o do celular / o do rascunho"), só as que valem. */
export function lerEscolhas(v: unknown): EscolhasCampo {
  const r: EscolhasCampo = {}
  if (!ehObj(v)) return r
  let n = 0
  for (const [chave, escolha] of Object.entries(v)) {
    if (n >= 5000) break
    if (chave.length > 300 || (escolha !== 'CELULAR' && escolha !== 'RASCUNHO')) continue
    r[chave] = escolha as EscolhaCampo
    n++
  }
  return r
}

const servicos = (ctx: Contexto): ServicosCampo => {
  if (!ctx.campo) throw new ErroApi(503, 'O app do celular não está disponível neste servidor.')
  return ctx.campo
}

/** As opções da comparação: a unidade da balança hoje, os nomes e os meses da próxima calibração. */
function opcoesDe(ctx: Contexto, k: Pick<Calibracao, 'balancaId'>): OpcoesComparar {
  const balanca = ctx.repo.obterBalanca(k.balancaId)
  return {
    ...(balanca ? { unidadeAtual: balanca.unidade } : {}),
    nomes: Object.fromEntries(nomes(ctx)),
    mesesProxima: ctx.repo.obterConfig().mesesProximaPadrao,
  }
}

/** A folha do registro: a que ele traz ou, no órfão ligado pelo escritório, a ligada. */
const folhaDoRegistro = (r: Pick<RegistroCampoListado, 'numero' | 'ligadoA'>) => r.ligadoA || r.numero

/** Órfão (envio desconhecido) ainda não ligado a uma folha pelo escritório. */
const orfaoSemFolha = (r: Pick<RegistroCampoListado, 'marcas' | 'ligadoA'>) => r.marcas.includes('ORFAO') && !r.ligadoA

/** Os registros da folha (os órfãos ainda não ligados ficam de fora: precisam ser ligados antes). */
function registrosDaFolha(campo: ServicosCampo, numero: string): RegistroCampoListado[] {
  if (!numero) return []
  return campo.repo.listarRegistros({ numero, limite: 100 })
}

/**
 * O registro que vale para a folha: o VALIDO mais novo (sem o órfão ainda não ligado). O que chegou depois de a folha ser
 * recolhida (APOS_RECOLHER) só vale quando não há outro: a folha recolhida e reenviada a outro técnico vale pelo envio
 * novo, mesmo que o celular antigo entregue depois.
 */
function vigente(registros: RegistroCampoListado[]): RegistroCampoListado | null {
  const validos = registros.filter((r) => r.situacao === 'VALIDO' && !orfaoSemFolha(r))
  return validos.find((r) => !r.marcas.includes('APOS_RECOLHER')) ?? validos[0] ?? null
}

/** O envio mais recente da folha da calibração (também o de uma folha que ela tinha antes, pelo id da calibração). */
function envioDaCalibracao(ctx: Contexto, k: Pick<Calibracao, 'id'>, numero: string): LinhaEnvio | undefined {
  return ctx.db
    .prepare(
      `SELECT * FROM folhas_campo_envios WHERE calibracao_id = ? OR (? <> '' AND numero = ?)
        ORDER BY enviado_em DESC, rowid DESC LIMIT 1`,
    )
    .get(k.id, numero, numero) as LinhaEnvio | undefined
}

const nomes = (ctx: Contexto) =>
  new Map(
    (ctx.db.prepare('SELECT id, nome FROM usuarios').all() as Array<{ id: string; nome: string }>).map((u) => [u.id, u.nome]),
  )

/** Lê o registro e o pacote (confere o sha256: alterado fora do sistema, 409). */
function lerRegistro(campo: ServicosCampo, id: string) {
  return campo.repo.registroComPacote(id)
}

/** As diferenças dos dados brutos com o registro; null se o registro não deu para comparar (formato com problema). */
function divergenciasCom(
  ctx: Contexto,
  k: Calibracao,
  registro: RegistroCampo,
  pacote: PacoteCampo | null,
): { divergencias: DivergenciaCampo[]; problema?: string } {
  try {
    return { divergencias: divergenciasParaEmissao(k, registro, pacote, opcoesDe(ctx, k)) }
  } catch (e) {
    return {
      divergencias: [],
      problema: `O registro de campo não pôde ser comparado (${e instanceof Error ? e.message : String(e)}).`,
    }
  }
}

/** As importações PUXAR desta calibração (a mais nova por último). */
const puxadas = (campo: ServicosCampo, calibracaoId: string): ImportacaoCampo[] =>
  campo.repo.importacoes({ calibracaoId }).filter((i) => i.tipo === 'PUXAR')

// ---- O editor e "Revisão e emissão" ------------------------------------------------------------------------------

/** GET /api/calibracoes/:id/campo (ver `CampoDaCalibracao`). */
export function campoDaCalibracao(ctx: Contexto, k: Calibracao): CampoDaCalibracao {
  const campo = servicos(ctx)
  const config = campo.repo.configuracao()
  const numero = ctx.repo.folhaCampoDaCalibracao(k.id)?.numero ?? ''
  const linhaEnvio = envioDaCalibracao(ctx, k, numero)
  const envio = linhaEnvio ? envioParaLista(linhaEnvio, nomes(ctx)) : null
  const aberta = k.status === 'RASCUNHO' || k.status === 'REVISAO'
  const travada =
    aberta &&
    config.registroOriginal === 'CELULAR' &&
    !!envio &&
    (envio.situacao === 'ENVIADA' || envio.situacao === 'NO_CELULAR') &&
    !envio.recolherPedidoEm
  const registros = registrosDaFolha(campo, numero)
  const atual = vigente(registros)
  const importacoes = campo.repo.importacoes({ calibracaoId: k.id })
  const doPuxar = importacoes.filter((i) => i.tipo === 'PUXAR')
  const puxado = doPuxar.length > 0
  let divergencias: DivergenciaCampo[] = []
  let problema: string | undefined
  let avisosConferidos: CampoDaCalibracao['avisosConferidos'] = []
  let desfecho: CampoDaCalibracao['desfecho'] = ''
  let motivoDesfecho = ''
  if (atual) {
    try {
      const { registro, pacote } = lerRegistro(campo, atual.id)
      avisosConferidos = Array.isArray(registro.avisosConferidos) ? registro.avisosConferidos : []
      desfecho = registro.desfecho ?? ''
      motivoDesfecho = typeof registro.motivoDesfecho === 'string' ? registro.motivoDesfecho : ''
      if (puxado) ({ divergencias, problema } = divergenciasCom(ctx, k, registro, pacote))
    } catch (e) {
      problema = e instanceof Error ? e.message : String(e)
    }
  }
  const ultimoPuxado = doPuxar.at(-1)?.registroId ?? ''
  return {
    registroOriginal: config.registroOriginal,
    numero,
    envio,
    travada,
    registros,
    registroId: atual?.id ?? '',
    importacoes,
    puxado,
    divergencias,
    justificativa: k.campoJustificativa ?? null,
    versaoNova: puxado && !!atual && !!ultimoPuxado && atual.id !== ultimoPuxado,
    avisosConferidos,
    desfecho,
    motivoDesfecho,
    ...(problema ? { problema } : {}),
  }
}

/**
 * A pendência da justificativa (para `pendenciasDa`): a calibração recebeu um "Puxar", um dado bruto ficou diferente do
 * registro VALIDO mais novo e ainda não há justificativa. Vazio nos outros casos (também sem o app do celular).
 */
export function pendenciasDoCampo(ctx: Contexto, k: Calibracao): string[] {
  const campo = ctx.campo
  if (!campo || !puxadas(campo, k.id).length) return []
  const numero = ctx.repo.folhaCampoDaCalibracao(k.id)?.numero ?? ''
  const atual = vigente(registrosDaFolha(campo, numero))
  if (!atual) return []
  let registro: RegistroCampo
  let pacote: PacoteCampo | null
  try {
    ;({ registro, pacote } = lerRegistro(campo, atual.id))
  } catch (e) {
    // O registro alterado fora do sistema não deixa emitir em silêncio
    return [e instanceof Error ? e.message : String(e)]
  }
  const { divergencias } = divergenciasCom(ctx, k, registro, pacote)
  const p = pendenciaJustificativaCampo(divergencias, k.campoJustificativa?.texto ?? '')
  return p ? [p] : []
}

/** Chegou uma revisão mais nova do registro depois de puxar (o aviso de "Revisão e emissão", sem impedir). */
export function avisosDoCampo(ctx: Contexto, k: Calibracao): string[] {
  const campo = ctx.campo
  if (!campo) return []
  const ultimo = puxadas(campo, k.id).at(-1)
  if (!ultimo) return []
  const numero = ctx.repo.folhaCampoDaCalibracao(k.id)?.numero ?? ''
  const atual = vigente(registrosDaFolha(campo, numero))
  if (!atual || atual.id === ultimo.registroId) return []
  return [
    `Chegou uma versão nova da folha ${folhaDoRegistro(atual)} do celular depois de puxar os dados: confira as diferenças em “Registro de campo”.`,
  ]
}

/**
 * O bloco congelado na emissão (`emissao.campo`): só quando a calibração recebeu um "Puxar". As diferenças são as de agora
 * (a emissão já recusou se faltava a justificativa) e a justificativa vai com quem e quando.
 */
export function campoParaEmissao(ctx: Contexto, k: Calibracao): CampoDaEmissao | undefined {
  const campo = ctx.campo
  if (!campo || !puxadas(campo, k.id).length) return undefined
  const numero = ctx.repo.folhaCampoDaCalibracao(k.id)?.numero ?? ''
  const atual = vigente(registrosDaFolha(campo, numero))
  if (!atual) return undefined
  const { linha, registro, pacote } = lerRegistro(campo, atual.id)
  const { divergencias } = divergenciasCom(ctx, k, registro, pacote)
  const j = divergencias.length ? k.campoJustificativa : undefined
  return {
    registroId: atual.id,
    numero: folhaDoRegistro(atual),
    sha256: linha.sha256,
    divergencias,
    justificativa: j?.texto ?? '',
    justificadoPor: j?.por ?? '',
    justificadoEm: j?.em ?? '',
  }
}

// ---- Comparar, puxar, criar a calibração e justificar --------------------------------------------------------

/** O registro pode ser usado com esta calibração? (VALIDO, da folha dela, não órfão solto) */
function conferirRegistroDaCalibracao(ctx: Contexto, k: Calibracao, r: RegistroCampoListado) {
  if (orfaoSemFolha(r))
    throw new ErroApi(409, 'Este registro chegou sem envio (órfão): ligue-o à folha antes de usar os dados.', {
      codigo: 'ORFAO_SEM_FOLHA',
    })
  if (r.situacao !== 'VALIDO')
    throw new ErroApi(
      409,
      r.situacao === 'DESCARTADO'
        ? 'Este registro foi descartado.'
        : 'Este registro foi substituído por uma versão mais nova da mesma folha: use a mais nova.',
      { codigo: 'REGISTRO_NAO_VALE' },
    )
  const numero = ctx.repo.folhaCampoDaCalibracao(k.id)?.numero ?? ''
  if (!numero || folhaDoRegistro(r) !== numero)
    throw new ErroApi(
      409,
      numero
        ? `O registro é da folha ${folhaDoRegistro(r)}, e esta calibração está com a folha ${numero}.`
        : `Esta calibração não tem folha de campo: ligue a folha ${folhaDoRegistro(r)} antes.`,
      { codigo: 'OUTRA_FOLHA' },
    )
}

function registroListado(campo: ServicosCampo, id: string): RegistroCampoListado {
  return campo.repo.obterRegistro(id).registro
}

/**
 * "Comparar com o campo" (o piloto; vale também com o registro original no celular e no certificado emitido): grava a
 * comparação (os dados diferentes e a observação opcional) e não muda nada na calibração.
 */
export function compararComCampo(
  ctx: Contexto,
  calibracaoId: string,
  corpo: unknown,
  autor: Autor,
): { importacao: ImportacaoCampo; iguais: number; diferentes: number } {
  const campo = servicos(ctx)
  const c = ehObj(corpo) ? corpo : {}
  const k = ctx.repo.obterCalibracao(calibracaoId)
  if (!k) throw new ErroApi(404, 'Calibração não encontrada.')
  if (k.status === 'CANCELADO') throw new ErroApi(409, 'Este certificado foi cancelado.')
  const registroId = typeof c.registroId === 'string' ? c.registroId : ''
  const listado = registroListado(campo, registroId)
  conferirRegistroDaCalibracao(ctx, k, listado)
  const { registro, pacote } = lerRegistro(campo, registroId)
  let comparacao
  try {
    comparacao = diferencasDoCampo(k, registro, pacote, opcoesDe(ctx, k))
  } catch (e) {
    throw new ErroApi(
      409,
      `O registro chegou com problema de formato e não pôde ser comparado (${e instanceof Error ? e.message : String(e)}).`,
      { codigo: 'FORMATO' },
    )
  }
  const diferentes = comparacao.itens.filter((x) => x.situacao !== 'IGUAL')
  const texto = `Comparou a folha ${folhaDoRegistro(listado)} do celular com a calibração: ${comparacao.iguais} ${
    comparacao.iguais === 1 ? 'dado igual' : 'dados iguais'
  }, ${diferentes.length} ${diferentes.length === 1 ? 'diferença' : 'diferenças'}.`
  const importacao = campo.repo.registrarImportacao({
    registroId,
    calibracaoId: k.id,
    tipo: 'COMPARACAO',
    versaoAntes: k.versao,
    versaoDepois: k.versao,
    por: autor.nome,
    resumo: {
      texto,
      iguais: comparacao.iguais,
      diferentes: diferentes.length,
      itens: diferentes.slice(0, 500).map((x) => ({
        chave: x.chave,
        rotulo: x.rotulo,
        celular: x.celular,
        rascunho: x.rascunho,
        situacao: x.situacao,
      })),
    },
    observacao: textoLivre(c.observacao, LIMITE_OBSERVACAO),
  })
  return { importacao, iguais: comparacao.iguais, diferentes: diferentes.length }
}

/** No piloto, o papel é o registro original: nada vai do celular para o rascunho. */
function conferirRegistroOriginalCelular(campo: ServicosCampo) {
  if (campo.repo.configuracao().registroOriginal !== 'CELULAR')
    throw new ErroApi(
      409,
      'No piloto, a folha de papel é o registro original: use “Comparar com o campo” (nada é escrito no rascunho).',
      { codigo: 'PILOTO' },
    )
}

/**
 * O técnico que assinou no celular: fica sendo o técnico e quem o definiu. Só vale se ainda existe e se é o dono do
 * celular que entregou (o token) ou o técnico a quem a folha foi enviada: o id que o registro traz é o que o celular
 * declara, e um celular não põe outra pessoa na calibração (quem executou não autoriza). Senão, '' (a calibração fica
 * com o técnico dela).
 */
function tecnicoDoRegistro(
  ctx: Contexto,
  campo: ServicosCampo,
  registro: RegistroCampo,
  listado: Pick<RegistroCampoListado, 'tecnicoId' | 'envioId'>,
): string {
  const id = typeof registro.tecnico?.id === 'string' ? registro.tecnico.id : ''
  if (!id || !ctx.usuarios.obter(id)) return ''
  return id === listado.tecnicoId || id === campo.repo.envio(listado.envioId)?.usuario_id ? id : ''
}

/** Aplica o registro no rascunho gravado e grava a importação (dentro de uma transação). */
function aplicarEGravar(
  ctx: Contexto,
  campo: ServicosCampo,
  k: Calibracao,
  e: {
    registroId: string
    listado: RegistroCampoListado
    registro: RegistroCampo
    pacote: PacoteCampo | null
    escolhas: EscolhasCampo
    autor: Autor
  },
): { calibracao: Calibracao; resumo: ResumoImportacao; importacao: ImportacaoCampo } {
  let aplicado: { rascunho: Calibracao; resumo: ResumoImportacao }
  try {
    aplicado = aplicarDoCampo(k, e.registro, e.pacote, e.escolhas, opcoesDe(ctx, k))
  } catch (erro) {
    throw new ErroApi(
      409,
      `O registro chegou com problema de formato e não pôde ser puxado (${erro instanceof Error ? erro.message : String(erro)}).`,
      { codigo: 'FORMATO' },
    )
  }
  const tecnico = tecnicoDoRegistro(ctx, campo, e.registro, e.listado)
  const entrada: CalibracaoInput & { versao: number } = {
    ...aplicado.rascunho,
    // O técnico que não existe mais no sistema (ou que não é o do celular nem o da folha) não substitui o da calibração
    tecnicoId: tecnico || k.tecnicoId,
    versao: k.versao,
  }
  const calibracao = ctx.repo.atualizarCalibracao(k.id, entrada, e.autor, tecnico ? { tecnicoConfirmado: tecnico } : {})
  const { escolhas, ...contagens } = aplicado.resumo
  const importacao = campo.repo.registrarImportacao({
    registroId: e.registroId,
    calibracaoId: k.id,
    tipo: 'PUXAR',
    versaoAntes: k.versao,
    versaoDepois: calibracao.versao,
    por: e.autor.nome,
    resumo: { ...contagens, escolhas: escolhas.slice(0, 2000) },
  })
  return { calibracao, resumo: aplicado.resumo, importacao }
}

/**
 * "Puxar dados do campo" (só com o registro original = CELULAR): `{registroId, escolhas, versao}`. O rascunho recebe o
 * que foi escolhido (sem escolha, a sugestão: o do celular); o técnico que assinou no celular fica sendo o técnico.
 */
export function puxarDoCampo(
  ctx: Contexto,
  calibracaoId: string,
  corpo: unknown,
  autor: Autor,
): { calibracao: Calibracao; resumo: ResumoImportacao; importacao: ImportacaoCampo } {
  const campo = servicos(ctx)
  conferirRegistroOriginalCelular(campo)
  const c = ehObj(corpo) ? corpo : {}
  const registroId = typeof c.registroId === 'string' ? c.registroId : ''
  return transacao(ctx.db, () => {
    const k = ctx.repo.obterCalibracao(calibracaoId)
    if (!k) throw new ErroApi(404, 'Calibração não encontrada.')
    if (k.status !== 'RASCUNHO' && k.status !== 'REVISAO')
      throw new ErroApi(
        409,
        'Este certificado já foi emitido: os dados do campo não vão mais para ele. Use “Comparar com o campo” para ver as diferenças.',
      )
    if (typeof c.versao === 'number' && c.versao !== k.versao)
      throw new ErroApi(409, 'Esta calibração foi alterada por outra pessoa. Recarregue a página e tente de novo.', {
        codigo: 'CONFLITO',
      })
    const listado = registroListado(campo, registroId)
    conferirRegistroDaCalibracao(ctx, k, listado)
    const { registro, pacote } = lerRegistro(campo, registroId)
    return aplicarEGravar(ctx, campo, k, {
      registroId,
      listado,
      registro,
      pacote,
      escolhas: lerEscolhas(c.escolhas),
      autor,
    })
  })
}

/**
 * "Criar calibração com os dados do campo" (só com o registro original = CELULAR): a folha sem rascunho em andamento vira
 * uma calibração nova, ligada à folha, com os dados do registro. A folha só do cliente e a em branco precisam antes da
 * balança cadastrada (`balancaId`, a de "Cadastrar a balança com os dados do campo"). Devolve também os nºs reservados
 * pela ligação, para o registro de atividades.
 */
export function criarCalibracaoDoCampo(
  ctx: Contexto,
  registroId: string,
  corpo: unknown,
  autor: Autor & { tecnico?: boolean },
): {
  calibracao: Calibracao
  resumo: ResumoImportacao
  importacao: ImportacaoCampo
  eventos: ReturnType<Contexto['repo']['vincularFolhaCampo']>['eventos']
} {
  const campo = servicos(ctx)
  conferirRegistroOriginalCelular(campo)
  const c = ehObj(corpo) ? corpo : {}
  const listado = registroListado(campo, registroId)
  if (orfaoSemFolha(listado))
    throw new ErroApi(409, 'Este registro chegou sem envio (órfão): ligue-o à folha antes de criar a calibração.', {
      codigo: 'ORFAO_SEM_FOLHA',
    })
  if (listado.situacao !== 'VALIDO')
    throw new ErroApi(409, 'Só um registro que vale cria a calibração (este foi descartado ou substituído).', {
      codigo: 'REGISTRO_NAO_VALE',
    })
  const numero = folhaDoRegistro(listado)
  const folha = ctx.repo.linhaDaFolha(numero)
  if (!folha) throw new ErroApi(404, `A folha ${numero} não existe neste sistema.`)
  const daFolha = folha.calibracao_id ? ctx.repo.obterCalibracao(folha.calibracao_id) : undefined
  if (daFolha)
    throw new ErroApi(
      409,
      daFolha.status === 'RASCUNHO' || daFolha.status === 'REVISAO'
        ? `A folha ${numero} já tem uma calibração em andamento: puxe os dados por ela.`
        : `A folha ${numero} já está num certificado (${daFolha.numero || 'emitido'}).`,
      { codigo: 'TEM_CALIBRACAO', calibracaoId: daFolha.id },
    )
  const { registro, pacote } = lerRegistro(campo, registroId)
  const doPacote = pacote?.balanca?.id ?? ''
  const balancaId = doPacote || folha.balanca_id || (typeof c.balancaId === 'string' ? c.balancaId : '')
  if (!balancaId)
    throw new ErroApi(409, 'A balança desta folha foi informada no local: cadastre a balança com os dados do campo antes.', {
      codigo: 'SEM_BALANCA',
    })
  const balanca = ctx.repo.obterBalanca(balancaId)
  if (!balanca) throw new ErroApi(404, 'A balança desta folha não existe mais no cadastro.')
  if (folha.cliente_id && balanca.clienteId !== folha.cliente_id)
    throw new ErroApi(409, 'A balança escolhida é de outro cliente que o da folha.')
  const tecnico = tecnicoDoRegistro(ctx, campo, registro, listado)
  // A base: o rascunho como a folha impressa o mostrava (os mesmos ids dos pontos); sem ele (balança informada no local),
  // o rascunho novo da balança cadastrada agora
  const base: CalibracaoInput =
    pacote?.balanca && pacote.balanca.id === balancaId
      ? { ...structuredClone(pacote.entrada), clienteId: balanca.clienteId, balancaId }
      : rascunhoInicial(
          ctx,
          {
            clienteId: balanca.clienteId,
            balancaId,
            ordemServico: folha.ordem_servico,
            ...(folha.data_prevista ? { dataCalibracao: folha.data_prevista } : {}),
          },
          tecnico,
        )
  return transacao(ctx.db, () => {
    const criada = ctx.repo.criarCalibracao({ ...base, tecnicoId: tecnico || base.tecnicoId }, autor)
    const { eventos } = ctx.repo.vincularFolhaCampo(numero, criada, { confirmar: true, por: autor.nome })
    const ligada = ctx.repo.obterCalibracao(criada.id) ?? criada
    const r = aplicarEGravar(ctx, campo, ligada, { registroId, listado, registro, pacote, escolhas: {}, autor })
    return { ...r, eventos }
  })
}

/** A justificativa das diferenças depois de puxar (um texto só; vazio tira). `{texto, versao}`. */
export function justificarCampo(ctx: Contexto, calibracaoId: string, corpo: unknown, autor: Autor): Calibracao {
  const c = ehObj(corpo) ? corpo : {}
  const texto = textoLivre(c.texto, LIMITE_JUSTIFICATIVA)
  const justificativa: JustificativaCampo | null = texto
    ? { texto, por: autor.nome, porId: autor.id, em: ctx.repo.agora().toISOString() }
    : null
  return ctx.repo.gravarJustificativaCampo(calibracaoId, justificativa, typeof c.versao === 'number' ? c.versao : undefined)
}

// ---- Listas de apoio ------------------------------------------------------------------------------------------

/**
 * Os técnicos que podem receber a folha no celular: ativos, com a marca de técnico, com os celulares que valem. A hora em
 * que o celular foi visto na rede só vai para quem tem a permissão `usuarios` (LGPD do técnico, PLANO §3.4).
 */
export function tecnicosParaEnvio(ctx: Contexto, quem: Pick<UsuarioSessao, 'nivel'>): TecnicoParaEnvio[] {
  const campo = servicos(ctx)
  const verContato = pode(quem.nivel, 'usuarios')
  const celulares = campo.repo.listarCelulares().filter((c) => !c.revogado)
  return ctx.usuarios
    .listar()
    .filter((u) => u.ativo && u.tecnico)
    .map((u) => ({
      id: u.id,
      nome: u.nome,
      celulares: celulares
        .filter((c) => c.tecnicoId === u.id)
        .map((c) => ({
          id: c.id,
          nome: c.nome,
          modelo: c.modelo,
          versaoApp: c.versaoApp,
          ...(verContato && c.ultimoContato ? { ultimoContato: c.ultimoContato } : {}),
        })),
    }))
    .sort((a, b) => Number(b.celulares.length > 0) - Number(a.celulares.length > 0) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** As folhas de uma balança que foram para um celular ou têm registro de campo (as 50 mais novas). */
export function folhasCampoDaBalanca(ctx: Contexto, balancaId: string): FolhaCampoDaBalanca[] {
  const linhas = ctx.db
    .prepare(
      `SELECT f.numero, f.calibracao_id FROM folhas_campo f
        WHERE (f.balanca_id = ? OR f.calibracao_id IN (SELECT id FROM calibracoes WHERE balanca_id = ?))
          AND (f.numero IN (SELECT numero FROM folhas_campo_envios)
               OR f.numero IN (SELECT CASE WHEN ligado_a <> '' THEN ligado_a ELSE numero END FROM registros_campo))
        ORDER BY f.ano DESC, f.sequencia DESC LIMIT 50`,
    )
    .all(balancaId, balancaId) as Array<{ numero: string; calibracao_id: string }>
  const mapa = celularDasFolhas(
    ctx.db,
    linhas.map((l) => l.numero),
    nomes(ctx),
  )
  return linhas
    .filter((l) => mapa.has(l.numero))
    .map((l) => ({ numero: l.numero, calibracaoId: l.calibracao_id, celular: mapa.get(l.numero)! }))
}

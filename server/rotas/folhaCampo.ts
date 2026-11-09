// Folha de campo em PDF (o roteiro impresso levado ao cliente e preenchido à caneta; ver
// server/pdf/folhaCampo.ts):
// - de uma calibração: com o plano do rascunho (pontos, cargas, padrões, OS…). Uma folha vigente por
//   calibração (numa revisão, a do certificado revisado); a de um certificado já emitido só existe se a
//   calibração teve folha (um nº novo depois da emissão não seria o registro dela), e o mesmo vale para a
//   revisão de um certificado feito sem folha (é a mesma visita). `?nova=<chave>`: folha nova, com nº novo e
//   os dados atuais, para a calibração em andamento cujo plano mudou antes da visita; a de antes fica
//   registrada como substituída (não usada), e a troca vai para o registro de atividades;
// - de uma balança (com o plano da última calibração dela, como o rascunho teria), só do cliente ou em
//   branco, para uma balança ainda não cadastrada. Cada pedido reserva um nº; a mesma `chave` (que a tela
//   gera a cada clique) devolve o mesmo nº, se o navegador pedir o PDF de novo. Depois da visita, o nº do
//   papel é ligado à calibração digitada (PUT .../folha-campo).
// A reimpressão de um nº é sempre o PDF da primeira impressão, guardado na pasta de dados (folhas-campo, com
// o sha256 no banco), byte a byte: dois papéis com o mesmo nº controlado nunca têm conteúdo diferente (a
// folha avulsa ligada a uma calibração sai como foi a campo, em branco; a de um certificado emitido, com o
// plano de antes da visita). Qualquer folha impressa também se reimprime pelo nº (GET /api/folha-campo/:numero:
// a lista dos nºs reservados em folhas ainda não ligadas), sem abrir a pasta de dados do Windows.
// A folha só do cliente (a balança ainda não cadastrada) pode sair com a OS e a data prevista da visita; a OS
// fica guardada com a folha e passa para a calibração sem OS a que ela for ligada.
// A primeira impressão também reserva o nº do certificado, que sai na folha para o técnico copiar na etiqueta
// da balança (ver `Repositorio.numeroParaFolha`): o da calibração em andamento (a folha nova e a reimpressão
// continuam com ele; a revisão sai com o do certificado revisado, sem reserva) ou, na folha avulsa — também
// a da balança, impressa sem rascunho, que vai a campo do mesmo jeito —, um nº da folha, que passa para a
// calibração a que ela for ligada.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { textoPop } from '#shared/arquivos.ts'
import { hojeLocalIso } from '#shared/dominio.ts'
import { pode } from '#shared/permissoes.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente } from '#shared/tipos.ts'
import { padroesDa, popDaCalibracao } from '../certificados.ts'
import type { Contexto } from '../contexto.ts'
import { ErroApi } from '../erros.ts'
import { entradaDe, rascunhoInicial } from '../rascunhos.ts'
import { type DadosFolhaCampo, gerarFolhaCampoPdf, nomeArquivoFolhaCampo } from '../pdf/folhaCampo.ts'
import { registrarNumeros } from './numeros.ts'

/** Nome do arquivo pela OS, que é como a empresa acha o serviço ("Folha-de-campo-OS-2026-0456.pdf"); sem OS, pelo nº. */
export function nomeArquivoDaFolha(os: string, numero: string): string {
  const t = os.trim()
  return nomeArquivoFolhaCampo(t ? (/^OS\b/i.test(t) ? t : `OS-${t}`) : numero)
}

/** "FC-2026-00042", "fc 2026 42", "2026-42" → "FC-2026-00042"; '' se não for um nº de folha. */
export function numeroDaFolha(v: unknown): string {
  const m = typeof v === 'string' ? /^\s*(?:FC[\s-]*)?(\d{4})[\s-]+(\d{1,5})\s*$/i.exec(v) : null
  return m ? `FC-${m[1]}-${m[2].padStart(5, '0')}` : ''
}

/**
 * A OS e a data prevista da folha avulsa (`?os=…&data=AAAA-MM-DD`): a OS como o rascunho a grava (até 40 letras) e a
 * data, se for uma data válida ('' = nenhuma; inválida: 400).
 */
export function osEDataDaFolha(q: Record<string, unknown>): { ordemServico: string; data: string } {
  const os = typeof q.os === 'string' ? q.os.replace(/\s+/g, ' ').trim().slice(0, 40) : ''
  const data = typeof q.data === 'string' ? q.data.trim() : ''
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(`${data}T12:00:00Z`) : null
  if (data && !(dia && !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === data))
    throw new ErroApi(400, 'Data prevista inválida.')
  return { ordemServico: os, data }
}

/** Content-Disposition com o nome em ASCII (cabeçalho HTTP) e o original em UTF-8 (RFC 6266). */
function disposicao(nome: string): string {
  const ascii = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '-')
    .replace(/["\\]/g, '-')
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

function enviarPdf(reply: FastifyReply, pdf: Buffer, nome: string, numero: string) {
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', disposicao(nome))
    .header('Cache-Control', 'no-store')
    .header('X-Folha-Campo', numero)
    .send(pdf)
}

/**
 * O que vai para o registro de atividades quando a folha de uma calibração muda: "FC-2 (era do CC-1,
 * cancelado) no lugar da FC-1"; a avulsa que saiu e ficou livre (foi ligada por engano) aparece como tal.
 */
export function detalheDaTroca(numero: string, notas: string[], substituiu: string[], liberadas: string[]): string {
  const trocadas = substituiu.map((n) => (liberadas.includes(n) ? `${n}, que ficou livre` : n))
  return [
    `${numero}${notas.length ? ` (${notas.join('; ')})` : ''}`,
    ...(trocadas.length ? [`no lugar da ${trocadas.join(', ')}`] : []),
  ].join(' ')
}

/** Correção de um certificado feito sem folha de campo impressa pelo sistema (a 1.0.1 não tinha folha). */
export const REVISAO_SEM_FOLHA =
  'O certificado corrigido foi feito sem folha de campo impressa pelo sistema: a correção é da mesma visita, e um nº novo agora não seria o registro dela. Se houve nova visita com uma folha avulsa, ligue o nº dela.'

export async function rotasFolhaCampo(app: FastifyInstance, ctx: Contexto) {
  const { repo } = ctx
  const quem = (req: FastifyRequest) => {
    if (!req.usuario) throw new ErroApi(401, 'Sua sessão terminou. Entre de novo para continuar.', { codigo: 'SEM_SESSAO' })
    return req.usuario
  }

  async function gerar(
    req: FastifyRequest,
    e: {
      chave: string
      calibracao: CalibracaoInput | null
      calibracaoId?: string
      nova?: boolean
      cliente: Cliente | null
      balanca: Balanca | null
      padroes: DadosFolhaCampo['padroes']
      tecnico: string
      /**
       * POP de referência no rodapé: o texto e a revisão registrada (null = nenhuma), que fica guardada com a folha
       * e o certificado da calibração cita (`popDaCalibracao`).
       */
      procedimento: string
      popId: number | null
      /** Folha avulsa: a OS impressa (fica com a folha) e a data prevista da visita, sem rascunho. */
      ordemServico?: string
      dataPrevista?: string
    },
  ) {
    const u = quem(req)
    const folha = repo.reservarFolhaCampo({
      chave: e.chave,
      calibracaoId: e.calibracaoId,
      nova: e.nova,
      balancaId: e.balanca?.id,
      clienteId: e.cliente?.id,
      ordemServico: e.ordemServico,
      por: u.nome,
    })
    if (folha.substituiu.length) req.detalheAuditoria = detalheDaTroca(folha.numero, [], folha.substituiu, folha.liberadas)
    registrarNumeros(ctx, req, folha.eventos)
    // Reimpressão: o arquivo da primeira impressão
    if (folha.pdf) return { pdf: folha.pdf, numero: folha.numero }
    const config = repo.obterConfig()
    const dados: DadosFolhaCampo & { numeroCertificado?: string } = {
      numero: folha.numero,
      empresa: config.empresa,
      cliente: e.cliente,
      balanca: e.balanca,
      calibracao: e.calibracao,
      padroes: e.padroes,
      tecnico: e.tecnico,
      // Código e revisão do POP (sai no rodapé de toda página da folha); '' sem POP registrado
      procedimento: e.procedimento,
      // A data e quem imprimiu são os da reserva do nº (a primeira impressão)
      impressoEm: folha.impressaEm,
      impressoPor: folha.impressaPor || u.nome,
      // O nº do certificado reservado (o técnico o copia na etiqueta da balança); sem ele, nada
      ...(folha.numeroCertificado ? { numeroCertificado: folha.numeroCertificado } : {}),
      // Sem rascunho (a folha do cliente com a balança em branco): a OS e a data prevista impressas
      ...(e.ordemServico ? { ordemServico: e.ordemServico } : {}),
      ...(e.dataPrevista ? { dataPrevista: e.dataPrevista } : {}),
    }
    const pdf = await gerarFolhaCampoPdf(dados)
    return { pdf: repo.guardarPdfFolhaCampo(folha.numero, pdf, e.popId), numero: folha.numero }
  }

  /** Folha de uma calibração (rascunho, em revisão ou já emitida); `?nova=<chave>`: folha nova (nº novo). */
  app.get('/api/calibracoes/:id/folha-campo', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const k: Calibracao | undefined = repo.obterCalibracao(req.params.id)
    if (!k) throw new ErroApi(404, 'Calibração não encontrada.')
    const q = req.query as Record<string, unknown>
    const nova = typeof q.nova === 'string' ? q.nova.trim() : ''
    if (nova && !/^[A-Za-z0-9-]{8,64}$/.test(nova)) throw new ErroApi(400, 'Chave da folha inválida.')
    if (nova && k.status !== 'RASCUNHO' && k.status !== 'REVISAO')
      throw new ErroApi(409, 'Folha nova só para uma calibração em andamento (rascunho ou em revisão).')
    // Certificado emitido, cancelado ou substituído sem folha: um nº reservado agora, depois da emissão,
    // passaria por registro de dados brutos de uma calibração que não o usou (ISO/IEC 17025, 7.5). A revisão
    // é a mesma visita do certificado revisado: sem folha nele, também não há folha para ela
    const semFolha = !repo.folhaCampoDaCalibracao(k.id)
    if (semFolha && k.status !== 'RASCUNHO' && k.status !== 'REVISAO')
      throw new ErroApi(
        409,
        'Esta calibração foi concluída sem folha de campo impressa pelo sistema: não há folha para reimprimir.',
      )
    if (semFolha && k.substituiId) throw new ErroApi(409, REVISAO_SEM_FOLHA)
    // Emitida: os cadastros como estavam na emissão (os mesmos do certificado)
    const cliente = k.emissao?.cliente ?? repo.obterCliente(k.clienteId) ?? null
    const balanca = k.emissao?.balanca ?? repo.obterBalanca(k.balancaId) ?? null
    const padroes = k.emissao?.padroes ?? padroesDa(ctx, k)
    // O técnico previsto, só se tiver a marca de técnico (quem criou sem a marca não é sugerido)
    const previsto = ctx.usuarios.obter(k.tecnicoId)
    const tecnico = k.emissao?.tecnico.nome ?? (previsto?.tecnico ? previsto.nome : '')
    // Emitida: o POP do certificado. Em andamento: o que o certificado vai citar (`popDaCalibracao`; numa revisão, o
    // do certificado revisado). A primeira impressão e a folha nova (que fica no lugar da de antes) vão a campo agora:
    // o que vale na data da calibração ou, se ela já passou (o rascunho nasce com a data do dia em que foi criado),
    // no dia da impressão. A reimpressão é o PDF guardado (com a revisão de quando saiu)
    const pop = k.emissao
      ? { procedimento: k.emissao.textos.procedimento, pop: k.emissao.pop ?? null }
      : popDaCalibracao(ctx, k, { semFolha: !!nova, dataMinima: hojeLocalIso(repo.agora()) })
    const { pdf, numero } = await gerar(req, {
      chave: nova ? `calibracao:${k.id}:${nova}` : `calibracao:${k.id}`,
      calibracao: entradaDe(k),
      calibracaoId: k.id,
      nova: !!nova,
      cliente,
      balanca,
      padroes,
      tecnico,
      procedimento: pop?.procedimento ?? '',
      popId: pop?.pop?.id ?? null,
    })
    return enviarPdf(reply, pdf, nomeArquivoDaFolha(k.ordemServico, numero), numero)
  })

  /**
   * Liga à calibração em andamento a folha preenchida no cliente, pelo nº impresso nela ("FC-2026-00042";
   * aceita minúsculas, espaços e o nº sem os zeros à esquerda): a avulsa, a de um rascunho excluído, a de um
   * certificado cancelado ou, numa revisão, a do certificado revisado. A que a calibração tinha fica
   * registrada como substituída. Impressa para outra balança: 409 com `codigo: 'CONFIRMAR_FOLHA'`, e a tela
   * pergunta; `confirmar: true` liga assim mesmo. De onde a folha veio vai para o registro de atividades.
   */
  app.put('/api/calibracoes/:id/folha-campo', async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const u = quem(req)
    const k = repo.obterCalibracao(req.params.id)
    if (!k) throw new ErroApi(404, 'Calibração não encontrada.')
    const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
    const numero = numeroDaFolha(corpo.numero)
    if (!numero) throw new ErroApi(400, 'Informe o nº da folha de campo como está no alto dela (ex.: FC-2026-00042).')
    const {
      substituiu,
      liberadas,
      notas,
      eventos,
      numeroDaFolha: daFolha,
      ordemServico,
      ...folhaCampo
    } = repo.vincularFolhaCampo(numero, k, {
      confirmar: corpo.confirmar === true,
      // Tirar a folha de um certificado cancelado mexe no registro dele: só quem pode cancelar
      podeCancelado: pode(u.nivel, 'cancelarCertificado'),
      por: u.nome,
    })
    req.detalheAuditoria = detalheDaTroca(numero, notas, substituiu, liberadas)
    registrarNumeros(ctx, req, eventos)
    // `numeroDaFolha`: o nº de certificado impresso na avulsa, que passou para a calibração (`usado`) ou ficou
    // não utilizado (ela já tinha nº, ou é revisão): a tela avisa para corrigir a etiqueta. `ordemServico`: a OS
    // impressa na avulsa, que passou para a calibração sem OS (`aplicada`; a `versao` dela subiu) ou não (a calibração
    // tem outra: a tela avisa)
    return {
      folhaCampo,
      numeroReservado: repo.numeroReservadoDa(k.id),
      numeroDaFolha: daFolha,
      ordemServico,
      versao: repo.obterCalibracao(k.id)?.versao ?? k.versao,
    }
  })

  /**
   * Folha sem calibração: `balancaId` (o cliente é o dono da balança), só `clienteId` (balança em
   * branco) ou nada (em branco). `chave` (opcional, até 64 letras, números e hífens): o mesmo nº a cada pedido.
   * `os` e `data` (AAAA-MM-DD; opcionais): a OS e a data prevista da visita, impressas na folha (a OS fica guardada
   * com ela e passa para a calibração sem OS a que ela for ligada).
   */
  app.get('/api/folha-campo', async (req, reply) => {
    const q = req.query as Record<string, unknown>
    const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const balancaId = texto(q.balancaId)
    const clienteId = texto(q.clienteId)
    const chave = texto(q.chave)
    if (chave && !/^[A-Za-z0-9-]{8,64}$/.test(chave)) throw new ErroApi(400, 'Chave da folha inválida.')
    const balanca = balancaId ? repo.obterBalanca(balancaId) : undefined
    if (balancaId && !balanca) throw new ErroApi(404, 'Balança não encontrada.')
    if (balanca && clienteId && clienteId !== balanca.clienteId) throw new ErroApi(400, 'Esta balança não é deste cliente.')
    const idCliente = balanca?.clienteId || clienteId
    const cliente = idCliente ? repo.obterCliente(idCliente) : undefined
    if (idCliente && !cliente) throw new ErroApi(404, 'Cliente não encontrado.')
    const { ordemServico, data } = osEDataDaFolha(q)
    const u = quem(req)
    // Com a balança, o plano é o que o rascunho teria (pontos e padrões da última calibração dela), com a OS e a data
    const calibracao = balanca
      ? rascunhoInicial(
          ctx,
          { balancaId: balanca.id, ...(ordemServico ? { ordemServico } : {}), ...(data ? { dataCalibracao: data } : {}) },
          u.id,
        )
      : null
    const padroes = calibracao ? padroesDa(ctx, calibracao) : repo.listarPadroes()
    // O POP vigente (a folha vai a campo agora)
    const pop = repo.popVigente()
    const { pdf, numero } = await gerar(req, {
      chave: `avulsa:${chave || randomUUID()}`,
      calibracao,
      cliente: cliente ?? null,
      balanca: balanca ?? null,
      padroes,
      // O técnico da visita ainda não está definido: a folha sai com a linha para escrever
      tecnico: '',
      procedimento: pop ? textoPop(pop) : '',
      popId: pop?.id ?? null,
      ordemServico,
      dataPrevista: data,
    })
    return enviarPdf(reply, pdf, nomeArquivoDaFolha(ordemServico, numero), numero)
  })

  /**
   * Reimpressão de uma folha já impressa, pelo nº ("FC-2026-00042"; aceita como o técnico digita): o PDF da primeira
   * impressão, byte a byte, com os mesmos nºs da folha e do certificado (nunca reserva nº nem refaz o PDF). Para quem
   * não abre a pasta de dados do Windows: a folha ainda não ligada se reimprime pela lista dos nºs reservados. Vai para
   * o registro de atividades.
   */
  app.get('/api/folha-campo/:numero', async (req: FastifyRequest<{ Params: { numero: string } }>, reply) => {
    quem(req)
    const numero = numeroDaFolha(req.params.numero)
    if (!numero) throw new ErroApi(400, 'Informe o nº da folha de campo como está no alto dela (ex.: FC-2026-00042).')
    const { pdf, ordemServico } = repo.reimprimirFolhaCampo(numero)
    // O registro guarda qual folha foi reimpressa (a rota diz que é reimpressão)
    req.detalheAuditoria = numero
    return enviarPdf(reply, pdf, nomeArquivoDaFolha(ordemServico, numero), numero)
  })
}

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
// plano de antes da visita).

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { pode } from '#shared/permissoes.ts'
import type { Balanca, Calibracao, CalibracaoInput, Cliente } from '#shared/tipos.ts'
import { padroesDa } from '../certificados.ts'
import type { Contexto } from '../contexto.ts'
import { ErroApi } from '../erros.ts'
import { entradaDe, rascunhoInicial } from '../rascunhos.ts'
import { type DadosFolhaCampo, gerarFolhaCampoPdf, nomeArquivoFolhaCampo } from '../pdf/folhaCampo.ts'

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

/** Revisão de um certificado feito sem folha de campo impressa pelo sistema (a 1.0.1 não tinha folha). */
export const REVISAO_SEM_FOLHA =
  'O certificado revisado foi feito sem folha de campo impressa pelo sistema: a revisão é a mesma visita, e um nº novo agora não seria o registro dela. Se houve nova visita com uma folha avulsa, ligue o nº dela.'

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
      /** POP de referência no rodapé (o da emissão, numa calibração emitida; senão, o configurado). */
      procedimento: string
    },
  ) {
    const u = quem(req)
    const folha = repo.reservarFolhaCampo({
      chave: e.chave,
      calibracaoId: e.calibracaoId,
      nova: e.nova,
      balancaId: e.balanca?.id,
      clienteId: e.cliente?.id,
      por: u.nome,
    })
    if (folha.substituiu.length) req.detalheAuditoria = detalheDaTroca(folha.numero, [], folha.substituiu, folha.liberadas)
    // Reimpressão: o arquivo da primeira impressão
    if (folha.pdf) return { pdf: folha.pdf, numero: folha.numero }
    const config = repo.obterConfig()
    const pdf = await gerarFolhaCampoPdf({
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
    })
    return { pdf: repo.guardarPdfFolhaCampo(folha.numero, pdf), numero: folha.numero }
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
    const tecnico = k.emissao?.tecnico.nome ?? ctx.usuarios.obter(k.tecnicoId)?.nome ?? ''
    // Emitida: o POP que valia na emissão (o do certificado); senão, o vigente
    const procedimento = k.emissao?.textos.procedimento ?? repo.obterConfig().textos.procedimento
    const { pdf, numero } = await gerar(req, {
      chave: nova ? `calibracao:${k.id}:${nova}` : `calibracao:${k.id}`,
      calibracao: entradaDe(k),
      calibracaoId: k.id,
      nova: !!nova,
      cliente,
      balanca,
      padroes,
      tecnico,
      procedimento,
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
    const { substituiu, liberadas, notas, ...folhaCampo } = repo.vincularFolhaCampo(numero, k, {
      confirmar: corpo.confirmar === true,
      // Tirar a folha de um certificado cancelado mexe no registro dele: só quem pode cancelar
      podeCancelado: pode(u.nivel, 'cancelarCertificado'),
      por: u.nome,
    })
    req.detalheAuditoria = detalheDaTroca(numero, notas, substituiu, liberadas)
    return { folhaCampo }
  })

  /**
   * Folha sem calibração: `balancaId` (o cliente é o dono da balança), só `clienteId` (balança em
   * branco) ou nada (em branco). `chave` (opcional, até 64 letras, números e hífens): o mesmo nº a cada pedido.
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
    const u = quem(req)
    // Com a balança, o plano é o que o rascunho teria (pontos e padrões da última calibração dela)
    const calibracao = balanca ? rascunhoInicial(ctx, { balancaId: balanca.id }, u.id) : null
    const padroes = calibracao ? padroesDa(ctx, calibracao) : repo.listarPadroes()
    const { pdf, numero } = await gerar(req, {
      chave: `avulsa:${chave || randomUUID()}`,
      calibracao,
      cliente: cliente ?? null,
      balanca: balanca ?? null,
      padroes,
      // O técnico da visita ainda não está definido: a folha sai com a linha para escrever
      tecnico: '',
      procedimento: repo.obterConfig().textos.procedimento,
    })
    return enviarPdf(reply, pdf, nomeArquivoFolhaCampo(numero), numero)
  })
}

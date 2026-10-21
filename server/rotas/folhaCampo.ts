// Folha de campo em PDF (o roteiro impresso levado ao cliente e preenchido à caneta; ver
// server/pdf/folhaCampo.ts):
// - de uma calibração: com o plano do rascunho (pontos, cargas, padrões, OS…); a de um certificado já
//   emitido é a reimpressão da folha planejada, com os cadastros congelados na emissão. Uma folha por
//   calibração: a reimpressão mantém o nº;
// - de uma balança (com o plano da última calibração dela, como o rascunho teria), só do cliente ou em
//   branco, para uma balança ainda não cadastrada. Cada pedido reserva um nº; a mesma `chave` (que a tela
//   gera a cada clique) devolve o mesmo nº, se o navegador pedir o PDF de novo.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
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
      cliente: Cliente | null
      balanca: Balanca | null
      padroes: DadosFolhaCampo['padroes']
      tecnico: string
    },
  ) {
    const u = quem(req)
    const folha = repo.reservarFolhaCampo({
      chave: e.chave,
      calibracaoId: e.calibracaoId,
      balancaId: e.balanca?.id,
      clienteId: e.cliente?.id,
      por: u.nome,
    })
    const pdf = await gerarFolhaCampoPdf({
      numero: folha.numero,
      empresa: repo.obterConfig().empresa,
      cliente: e.cliente,
      balanca: e.balanca,
      calibracao: e.calibracao,
      padroes: e.padroes,
      tecnico: e.tecnico,
      impressoEm: repo.agora().toISOString(),
      impressoPor: u.nome,
    })
    return { pdf, numero: folha.numero }
  }

  /** Folha de uma calibração (rascunho, em revisão ou já emitida). */
  app.get('/api/calibracoes/:id/folha-campo', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const k: Calibracao | undefined = repo.obterCalibracao(req.params.id)
    if (!k) throw new ErroApi(404, 'Calibração não encontrada.')
    // Emitida: os cadastros como estavam na emissão (os mesmos do certificado)
    const cliente = k.emissao?.cliente ?? repo.obterCliente(k.clienteId) ?? null
    const balanca = k.emissao?.balanca ?? repo.obterBalanca(k.balancaId) ?? null
    const padroes = k.emissao?.padroes ?? padroesDa(ctx, k)
    const tecnico = k.emissao?.tecnico.nome ?? ctx.usuarios.obter(k.tecnicoId)?.nome ?? ''
    const { pdf, numero } = await gerar(req, {
      chave: `calibracao:${k.id}`,
      calibracao: entradaDe(k),
      calibracaoId: k.id,
      cliente,
      balanca,
      padroes,
      tecnico,
    })
    return enviarPdf(reply, pdf, nomeArquivoDaFolha(k.ordemServico, numero), numero)
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
    })
    return enviarPdf(reply, pdf, nomeArquivoFolhaCampo(numero), numero)
  })
}

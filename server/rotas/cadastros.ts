// Clientes, balanças e padrões. Leituras para todos que entraram; exclusões só para o administrador
// (tabela de acesso em server/acesso.ts).

import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Contexto } from '../contexto.ts'

type ComId = FastifyRequest<{ Params: { id: string } }>
type Consulta = Record<string, string | undefined>

const sim = (v: string | undefined) => v === '1' || v === 'true'

export async function rotasCadastros(app: FastifyInstance, { repo }: Contexto) {
  // ---- Clientes ----
  app.get('/api/clientes', async (req) => {
    const q = req.query as Consulta
    return { clientes: repo.listarClientes({ busca: q.busca, inativos: sim(q.inativos) }) }
  })
  app.get('/api/clientes/:id', async (req: ComId, reply) => {
    const cliente = repo.obterCliente(req.params.id)
    if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado.' })
    return {
      cliente,
      balancas: repo.listarBalancas({ clienteId: cliente.id, inativas: true }),
      calibracoes: repo.listarCalibracoes({ clienteId: cliente.id, limite: 200 }).itens,
      envios: repo.listarEnvios({ clienteId: cliente.id }),
    }
  })
  app.post('/api/clientes', async (req, reply) => reply.code(201).send({ cliente: repo.criarCliente(req.body) }))
  app.put('/api/clientes/:id', async (req: ComId) => ({ cliente: repo.atualizarCliente(req.params.id, req.body) }))
  app.delete('/api/clientes/:id', async (req: ComId, reply) => {
    repo.excluirCliente(req.params.id)
    return reply.code(204).send()
  })

  // ---- Balanças ----
  app.get('/api/balancas', async (req) => {
    const q = req.query as Consulta
    return { balancas: repo.listarBalancas({ clienteId: q.clienteId, busca: q.busca, inativas: sim(q.inativas) }) }
  })
  app.get('/api/balancas/:id', async (req: ComId, reply) => {
    const balanca = repo.obterBalanca(req.params.id)
    if (!balanca) return reply.code(404).send({ erro: 'Balança não encontrada.' })
    return {
      balanca,
      cliente: repo.obterCliente(balanca.clienteId),
      calibracoes: repo.listarCalibracoes({ balancaId: balanca.id, limite: 200 }).itens,
    }
  })
  app.post('/api/balancas', async (req, reply) => reply.code(201).send({ balanca: repo.criarBalanca(req.body) }))
  app.put('/api/balancas/:id', async (req: ComId) => ({ balanca: repo.atualizarBalanca(req.params.id, req.body) }))
  app.delete('/api/balancas/:id', async (req: ComId, reply) => {
    repo.excluirBalanca(req.params.id)
    return reply.code(204).send()
  })

  // ---- Padrões ----
  app.get('/api/padroes', async (req) => {
    const q = req.query as Consulta
    return { padroes: repo.listarPadroes({ inativos: sim(q.inativos) }) }
  })
  // O registro de atividades diz quando o arquivo do certificado do padrão foi anexado, trocado ou removido
  app.post('/api/padroes', async (req, reply) => {
    const padrao = repo.criarPadrao(req.body)
    if (padrao.certificadoArquivo) req.detalheAuditoria = 'com o arquivo do certificado'
    return reply.code(201).send({ padrao })
  })
  app.put('/api/padroes/:id', async (req: ComId) => {
    const antes = repo.obterPadrao(req.params.id)?.certificadoArquivo?.sha256 ?? ''
    const padrao = repo.atualizarPadrao(req.params.id, req.body)
    const depois = padrao.certificadoArquivo?.sha256 ?? ''
    if (antes !== depois)
      req.detalheAuditoria = !depois
        ? 'arquivo do certificado removido'
        : antes
          ? 'arquivo do certificado trocado'
          : 'arquivo do certificado anexado'
    return { padrao }
  })
  app.delete('/api/padroes/:id', async (req: ComId, reply) => {
    repo.excluirPadrao(req.params.id)
    return reply.code(204).send()
  })
}

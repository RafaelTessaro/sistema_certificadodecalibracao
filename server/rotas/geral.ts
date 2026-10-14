// Configurações, painel, vencimentos e a lista de usuários para os campos "técnico" e "signatário".

import type { FastifyInstance } from 'fastify'
import type { Contexto } from '../contexto.ts'

export async function rotasGeral(app: FastifyInstance, { repo, usuarios }: Contexto) {
  app.get('/api/config', async () => ({ config: repo.obterConfig() }))
  app.put('/api/config', async (req) => ({ config: repo.salvarConfig(req.body) }))

  app.get('/api/painel', async () => ({ painel: repo.painel() }))

  app.get('/api/vencimentos', async (req) => {
    const q = req.query as { dias?: string }
    const dias = q.dias === 'todos' ? Infinity : Number(q.dias) || repo.obterConfig().diasAvisoVencimento
    return { vencimentos: repo.vencimentos(dias) }
  })

  // Técnicos e signatários (para os campos da calibração): só o essencial, sem dados de acesso
  app.get('/api/equipe', async () => ({
    equipe: usuarios
      .listar()
      .filter((u) => u.ativo)
      .map((u) => ({
        id: u.id,
        nome: u.nome,
        cargo: u.cargo,
        signatario: u.signatario,
        // A imagem da assinatura fica no servidor (o PDF a usa); a tela só precisa saber se existe
        temAssinatura: !!u.assinatura,
      })),
  }))
}

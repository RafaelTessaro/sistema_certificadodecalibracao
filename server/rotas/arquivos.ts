// Arquivos guardados no sistema (o certificado de calibração de cada padrão e o POP) e as revisões do POP.
// O envio é o arquivo puro (application/octet-stream), com o nome na consulta; o tipo é conferido pelo
// conteúdo e o tamanho no máximo de 10 MB. Quem entrou no sistema baixa; só o administrador registra o POP.

import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  detectarTipoArquivo,
  LIMITE_ARQUIVO_BYTES,
  MIME_ARQUIVO,
  nomeArquivoSeguro,
  problemaDoArquivo,
  ROTULO_TIPO_ARQUIVO,
  SHA256_VALIDO,
  tipoDoMime,
  type FinalidadeArquivo,
} from '#shared/arquivos.ts'
import type { Contexto } from '../contexto.ts'
import { ErroApi } from '../erros.ts'

const FINALIDADES: Record<FinalidadeArquivo, string> = { padrao: 'certificado de padrão', pop: 'POP' }

/**
 * Content-Disposition com o nome original: `filename` só com ASCII (navegadores antigos) e `filename*` em
 * UTF-8 (acentos, "ç"). Um cabeçalho HTTP não aceita os caracteres de fora do latin1 diretamente.
 */
export function disposicao(nome: string, baixar: boolean): string {
  const ascii =
    nome
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\x20-\x7e]|["\\]/g, '_') || 'arquivo'
  return `${baixar ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

export async function rotasArquivos(app: FastifyInstance, ctx: Contexto) {
  const { repo } = ctx
  const quem = (req: FastifyRequest) => {
    if (!req.usuario) throw new ErroApi(401, 'Sua sessão terminou. Entre de novo para continuar.', { codigo: 'SEM_SESSAO' })
    return req.usuario
  }

  // O envio do arquivo puro só existe aqui (contexto próprio): o resto da API continua só com JSON
  await app.register(async (sub) => {
    sub.addContentTypeParser(
      'application/octet-stream',
      // Um pouco acima do limite: até aí a resposta diz o tamanho e o limite; bem acima, só "muito grande"
      { parseAs: 'buffer', bodyLimit: LIMITE_ARQUIVO_BYTES + 1024 * 1024 },
      (_req, corpo, pronto) => pronto(null, corpo),
    )

    /** Guarda um arquivo: `?nome=<nome original>&finalidade=padrao|pop`. Devolve a referência para gravar no cadastro. */
    sub.post('/api/arquivos', async (req, reply) => {
      const u = quem(req)
      const q = req.query as Record<string, unknown>
      const finalidade = q.finalidade === 'pop' || q.finalidade === 'padrao' ? q.finalidade : null
      if (!finalidade) throw new ErroApi(400, 'Envio de arquivo inválido.')
      const conteudo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      const tipo = detectarTipoArquivo(conteudo)
      const problema = problemaDoArquivo(conteudo.length, tipo, finalidade)
      if (problema) throw new ErroApi(conteudo.length > LIMITE_ARQUIVO_BYTES ? 413 : 400, problema)
      const nome = nomeArquivoSeguro(q.nome, finalidade === 'pop' ? `POP.${tipo}` : `Certificado.${tipo}`)
      const arquivo = repo.guardarArquivo(conteudo, { nome, tipo: MIME_ARQUIVO[tipo!], por: u.nome })
      req.detalheAuditoria = `${FINALIDADES[finalidade]} (${ROTULO_TIPO_ARQUIVO[tipo!]})`
      return reply.code(201).send({ arquivo })
    })
  })

  /** Baixa (ou abre, no caso de PDF e imagem) um arquivo guardado. `?baixar=1` sempre baixa. */
  app.get('/api/arquivos/:sha256', async (req, reply) => {
    const sha256 = String((req.params as { sha256?: string }).sha256 ?? '').toLowerCase()
    const a = SHA256_VALIDO.test(sha256) ? repo.lerArquivo(sha256) : undefined
    if (!a) throw new ErroApi(404, 'Arquivo não encontrado.')
    const q = req.query as Record<string, unknown>
    // Word não abre no navegador: sempre baixa
    const baixar = q.baixar === '1' || tipoDoMime(a.tipo) === 'docx'
    const nome = nomeArquivoSeguro(q.nome, '') || a.nome
    return reply.header('Content-Type', a.tipo).header('Content-Disposition', disposicao(nome, baixar)).send(a.conteudo)
  })

  // ---- POP ----
  app.get('/api/pop', async () => {
    const versoes = repo.versoesPop()
    return { atual: versoes[0] ?? null, versoes }
  })

  /** Registra uma revisão nova do POP (vale para os próximos certificados). */
  app.post('/api/pop', async (req, reply) => {
    const u = quem(req)
    const versao = repo.registrarPop(req.body, u.nome)
    req.detalheAuditoria = versao.arquivo ? 'com o arquivo' : 'sem o arquivo (anexar depois)'
    return reply.code(201).send({ versao })
  })

  /** Anexa ou troca o arquivo de uma revisão já registrada. */
  app.put('/api/pop/:id/arquivo', async (req) => {
    quem(req)
    const id = Number((req.params as { id?: string }).id)
    if (!Number.isSafeInteger(id) || id <= 0) throw new ErroApi(404, 'Revisão do POP não encontrada.')
    const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as { arquivo?: unknown }
    return { versao: repo.anexarArquivoPop(id, corpo.arquivo) }
  })
}

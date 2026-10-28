// Auxiliar dos testes do servidor com login de verdade (sem o acesso livre dos testes antigos):
// um administrador criado pela ferramenta local e um comum criado pela tela, já com a senha trocada.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BALANCA_VAZIA, CLIENTE_VAZIO, PADRAO_VAZIO } from '#shared/dominio.ts'
import type { ArquivoAnexo, Balanca, Calibracao, CalibracaoInput, Cliente, Padrao, ResultadoSenha } from '#shared/tipos.ts'
import { nomeCookieSessao } from './acesso.ts'
import { criarApp, type OpcoesApp } from './app.ts'
import { PARAMETROS_LEVES } from './senha.ts'

export const H = { 'x-bc-calibracao': '1' }
export const SENHA_ADMIN = 'cavalo-azul-pulando'
export const SENHA_COMUM = 'girafa-verde-dancando'

type Metodo = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface OpcoesRequisicao {
  /** Token da sessão (valor do cookie). */
  cookie?: string | null
  payload?: unknown
  headers?: Record<string, string>
  remoteAddress?: string
}

export interface OpcoesEntrar {
  manterConectado?: boolean
  remoteAddress?: string
  /** Cookie de uma sessão anterior deste "navegador". */
  cookie?: string | null
}

/** POP registrado nos testes (sem ele o certificado não é emitido). */
export const POP_TESTE = { codigo: 'BALANÇAS-POP-001', revisao: '00', data: '2026-01-05', arquivo: '', observacao: '' }

/**
 * App com o banco em memória, o hash leve e dois usuários: `admin` (ADMIN) e `comum` (COMUM), e o POP
 * registrado (POP_TESTE). `semUsuarios`: não cria ninguém (para o caso do banco novo); `semPop`: sem POP.
 */
export async function criarAppComLogin(opcoes: Partial<OpcoesApp> & { semUsuarios?: boolean; semPop?: boolean } = {}) {
  const { semUsuarios, semPop, ...resto } = opcoes
  const pasta = mkdtempSync(join(tmpdir(), 'bcf-login-'))
  const { app, ctx, usuarios } = await criarApp({
    pastaDados: pasta,
    arquivoBanco: ':memory:',
    pastaEstatica: null,
    parametrosSenha: PARAMETROS_LEVES,
    ...resto,
  })
  const nomeCookie = nomeCookieSessao(resto.porta)
  if (!semPop && !ctx.repo.popVigente()) ctx.repo.registrarPop(POP_TESTE, 'Teste')

  /** Requisição com o cabeçalho do app; `cookie` é o token da sessão. */
  function chamar(metodo: Metodo, url: string, o: OpcoesRequisicao = {}) {
    return app.inject({
      method: metodo,
      url,
      headers: { ...H, ...o.headers },
      ...(o.cookie ? { cookies: { [nomeCookie]: o.cookie } } : {}),
      ...(o.payload !== undefined ? { payload: o.payload as object } : {}),
      ...(o.remoteAddress ? { remoteAddress: o.remoteAddress } : {}),
    })
  }

  /** POST /api/sessao; `cookie` é o token novo (ou `null` se não entrou). */
  async function entrar(login: string, senha: string, o: OpcoesEntrar = {}) {
    const resposta = await chamar('POST', '/api/sessao', {
      payload: { login, senha, manterConectado: !!o.manterConectado },
      remoteAddress: o.remoteAddress,
      cookie: o.cookie,
    })
    const cookie = resposta.cookies.find((c) => c.name === nomeCookie)?.value || null
    return { resposta, cookie, status: resposta.statusCode }
  }

  /** Entra e devolve o token (lança se não entrar). */
  async function cookieDe(login: string, senha: string, o: OpcoesEntrar = {}) {
    const r = await entrar(login, senha, o)
    if (r.status !== 200 || !r.cookie) throw new Error(`não entrou como ${login}: ${r.status} ${r.resposta.body}`)
    return r.cookie
  }

  let cookieAdmin = ''
  let cookieComum = ''
  let adminId = ''
  let comumId = ''
  if (!semUsuarios) {
    const admin = await usuarios.definirSenhaLocal({ login: 'admin', nome: 'Admin Teste', senha: SENHA_ADMIN, tornarAdmin: true })
    adminId = admin.usuario.id
    cookieAdmin = await cookieDe('admin', SENHA_ADMIN)
    const criado = await chamar('POST', '/api/usuarios', {
      cookie: cookieAdmin,
      payload: { nome: 'Comum Teste', login: 'comum', nivel: 'COMUM', senha: '' },
    })
    if (criado.statusCode !== 201) throw new Error(`não criou o comum: ${criado.body}`)
    const { usuario, senhaTemporaria } = criado.json() as ResultadoSenha
    comumId = usuario.id
    cookieComum = await cookieDe('comum', senhaTemporaria!)
    const troca = await chamar('PUT', '/api/minha-senha', {
      cookie: cookieComum,
      payload: { senhaAtual: senhaTemporaria, senhaNova: SENHA_COMUM },
    })
    if (troca.statusCode !== 200) throw new Error(`não trocou a senha do comum: ${troca.body}`)
  }

  async function fechar() {
    await app.close()
    rmSync(pasta, { recursive: true, force: true })
  }

  return { app, ctx, usuarios, pasta, nomeCookie, cookieAdmin, cookieComum, adminId, comumId, chamar, entrar, cookieDe, fechar }
}

export type AppComLogin = Awaited<ReturnType<typeof criarAppComLogin>>

// ---- Cenário de calibração (cliente, balança, jogo de pesos e um rascunho pronto para emitir) ----------

/** Arquivos de exemplo (o tipo é conferido pelo conteúdo). */
export const ARQUIVOS_TESTE = {
  pdf: (texto = 'certificado') => Buffer.from(`%PDF-1.7\n% ${texto}\n1 0 obj\n<<>>\nendobj\n%%EOF\n`, 'latin1'),
  jpg: (texto = 'foto') => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from(`JFIF ${texto}`)]),
  png: () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR')]),
  docx: (texto = 'pop') =>
    Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`[Content_Types].xml word/document.xml ${texto}`)]),
}

export async function cenarioCalibracao(t: AppComLogin) {
  const r = await t.chamar('PUT', `/api/usuarios/${t.adminId}`, { cookie: t.cookieAdmin, payload: { signatario: true } })
  if (r.statusCode !== 200) throw new Error(`signatário: ${r.body}`)

  async function criar(url: string, payload: unknown, cookie = t.cookieAdmin) {
    const resposta = await t.chamar('POST', url, { cookie, payload })
    if (resposta.statusCode !== 201 && resposta.statusCode !== 200)
      throw new Error(`${url}: ${resposta.statusCode} ${resposta.body}`)
    return resposta.json()
  }

  /** Guarda um arquivo pela API (como a tela faz) e devolve a referência. */
  async function enviarArquivo(conteudo: Buffer, nome: string, finalidade: 'padrao' | 'pop' = 'padrao', cookie = t.cookieAdmin) {
    const resposta = await t.chamar('POST', `/api/arquivos?finalidade=${finalidade}&nome=${encodeURIComponent(nome)}`, {
      cookie,
      payload: conteudo,
      headers: { 'content-type': 'application/octet-stream' },
    })
    if (resposta.statusCode !== 201) throw new Error(`arquivo: ${resposta.statusCode} ${resposta.body}`)
    return resposta.json().arquivo as ArquivoAnexo
  }

  const cliente: Cliente = (
    await criar('/api/clientes', {
      ...CLIENTE_VAZIO,
      tipo: 'PJ',
      nome: 'Mercado Bom Preço',
      razaoSocial: 'MERCADO BOM PRECO LTDA',
      documento: '11.444.777/0001-61',
      logradouro: 'Avenida 1',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Rio Claro',
      uf: 'SP',
      cep: '13500-000',
      emailCertificados: 'qualidade@mercado.com.br',
    })
  ).cliente
  const balanca: Balanca = (
    await criar('/api/balancas', {
      ...BALANCA_VAZIA,
      clienteId: cliente.id,
      fabricante: 'Toledo',
      modelo: '9094',
      numeroSerie: 'TL-2231',
      faixas: [{ max: 30, e: 0.01, d: 0.01 }],
    })
  ).balanca
  const padraoPesos = (identificacao: string, extra: Record<string, unknown> = {}) => ({
    ...PADRAO_VAZIO,
    identificacao,
    descricao: 'Jogo de pesos M1 5 kg a 10 kg',
    classe: 'M1',
    certificado: 'LAB-0456/2026',
    laboratorio: 'Laboratório de Massa Exemplo',
    dataCalibracao: '2026-01-10',
    validade: '2099-01-10',
    pesos: [
      { id: 'p10a', marca: 'A', nominal: 10000, correcao: 40, incerteza: 160, k: 2 },
      { id: 'p10b', marca: 'B', nominal: 10000, correcao: -30, incerteza: 160, k: 2 },
      { id: 'p10c', marca: 'C', nominal: 10000, correcao: 10, incerteza: 160, k: 2 },
      { id: 'p5', marca: '', nominal: 5000, correcao: 20, incerteza: 80, k: 2 },
    ],
    ...extra,
  })
  const pesos: Padrao = (await criar('/api/padroes', padraoPesos('JP-01'))).padrao
  const peca = (pesoId: string) => ({ padraoId: pesos.id, pesoId, quantidade: 1 })

  /** Rascunho preenchido (com os padrões indicados além do jogo JP-01), pronto para emitir. */
  async function calibracaoPronta(outrosPadroes: string[] = [], cookie = t.cookieAdmin): Promise<Calibracao> {
    const { calibracao: k } = (await criar('/api/calibracoes', { clienteId: cliente.id, balancaId: balanca.id }, cookie)) as {
      calibracao: Calibracao
    }
    const dados: CalibracaoInput = {
      ...k,
      padroesIds: [pesos.id, ...outrosPadroes],
      ambiente: { temperaturaInicial: 22.1, temperaturaFinal: 22.6, umidadeInicial: 55, umidadeFinal: 57, pressao: null },
      repetibilidade: [{ id: 'r1', carga: 15, leituras: [15, 15, 15.01, 15, 15, 15] }],
      excentricidade: {
        aplicavel: true,
        motivo: '',
        carga: 10,
        metodo: 1,
        posicoes: ['Centro', 'Frente esquerda', 'Trás esquerda', 'Trás direita', 'Frente direita'].map((rotulo) => ({
          rotulo,
          leitura: 10,
          referencia: null,
        })),
      },
      indicacao: {
        metodo: 'CRESCENTE_DECRESCENTE',
        retornoZero: 0,
        substituicao: { ativa: false, pecas: [], etapas: [] },
        pontos: [
          { id: 'a', carga: 5, pecas: [peca('p5')], pecasManuais: true, crescente: 5, decrescente: 5, nivelSubstituicao: 0 },
          { id: 'b', carga: 10, pecas: [peca('p10a')], pecasManuais: true, crescente: 10, decrescente: 10, nivelSubstituicao: 0 },
          {
            id: 'c',
            carga: 30,
            pecas: [peca('p10a'), peca('p10b'), peca('p10c')],
            pecasManuais: true,
            crescente: 30.01,
            decrescente: 30.01,
            nivelSubstituicao: 0,
          },
        ],
      },
    }
    const salvo = await t.chamar('PUT', `/api/calibracoes/${k.id}`, { cookie, payload: { ...dados, versao: k.versao } })
    if (salvo.statusCode !== 200) throw new Error(`rascunho: ${salvo.body}`)
    return salvo.json().calibracao
  }

  const emitir = (k: Calibracao, cookie = t.cookieAdmin) =>
    t.chamar('POST', `/api/calibracoes/${k.id}/emitir`, { cookie, payload: { versao: k.versao } })

  /** Emite e devolve o certificado (lança se não emitir). */
  async function emitido(outrosPadroes: string[] = []): Promise<Calibracao> {
    const r = await emitir(await calibracaoPronta(outrosPadroes))
    if (r.statusCode !== 200) throw new Error(`emissão: ${r.statusCode} ${r.body}`)
    return r.json().calibracao
  }

  return { cliente, balanca, pesos, padraoPesos, criar, enviarArquivo, calibracaoPronta, emitir, emitido }
}

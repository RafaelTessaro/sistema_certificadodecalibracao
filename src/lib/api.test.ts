import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, conectarTempoReal, consultaAuditoria, definirAoErroSessao, ErroApi, JANELA_FOLHA_AVULSA_MS, type Ola } from './api'

/** `fetch` simulado: responde `status` com o corpo em JSON e guarda os pedidos. */
function simularFetch(status: number, corpo: unknown = {}) {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(status === 204 ? null : JSON.stringify(corpo), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function erroDe(p: Promise<unknown>): Promise<ErroApi> {
  try {
    await p
  } catch (e) {
    if (e instanceof ErroApi) return e
    throw e
  }
  throw new Error('a requisição deveria ter falhado')
}

describe('erros de sessão nas requisições', () => {
  const aviso = vi.fn()
  beforeEach(() => definirAoErroSessao(aviso))
  afterEach(() => {
    definirAoErroSessao(null)
    aviso.mockReset()
    vi.unstubAllGlobals()
  })

  it('401 em /api/painel avisa SEM_SESSAO e pede para repetir a ação', async () => {
    simularFetch(401, { erro: 'Sua sessão terminou. Entre de novo para continuar.', codigo: 'SEM_SESSAO' })
    const e = await erroDe(api.painel())
    expect(aviso).toHaveBeenCalledExactlyOnceWith('SEM_SESSAO')
    expect(e.status).toBe(401)
    expect(e.message).toBe('Sua sessão terminou. Entre de novo e repita a ação.')
  })

  it('401 em /api/sessao (usuário ou senha incorretos) não avisa', async () => {
    simularFetch(401, { erro: 'Usuário ou senha incorretos.', codigo: 'CREDENCIAIS_INVALIDAS' })
    const e = await erroDe(api.entrar({ login: 'maria', senha: 'errada' }))
    expect(aviso).not.toHaveBeenCalled()
    expect(e.message).toBe('Usuário ou senha incorretos.')
    expect(e.dados.codigo).toBe('CREDENCIAIS_INVALIDAS')
  })

  it('403 TROCAR_SENHA avisa TROCAR_SENHA', async () => {
    simularFetch(403, { erro: 'Crie sua senha antes de continuar.', codigo: 'TROCAR_SENHA' })
    const e = await erroDe(api.painel())
    expect(aviso).toHaveBeenCalledExactlyOnceWith('TROCAR_SENHA')
    expect(e.message).toBe('Crie sua senha antes de continuar.')
  })

  it('403 SEM_PERMISSAO não avisa e traz a mensagem do servidor', async () => {
    const erro = 'Só o administrador cancela certificados.'
    simularFetch(403, { erro, codigo: 'SEM_PERMISSAO', permissao: 'cancelarCertificado' })
    const e = await erroDe(api.cancelar('abc', 'motivo do teste'))
    expect(aviso).not.toHaveBeenCalled()
    expect(e.status).toBe(403)
    expect(e.message).toBe(erro)
  })

  it('429 ao entrar traz a espera', async () => {
    simularFetch(429, {
      erro: 'Muitas tentativas. Tente de novo em 2 minutos.',
      codigo: 'MUITAS_TENTATIVAS',
      esperarSegundos: 120,
    })
    const e = await erroDe(api.entrar({ login: 'maria', senha: 'x' }))
    expect(e.status).toBe(429)
    expect(e.dados.esperarSegundos).toBe(120)
    expect(aviso).not.toHaveBeenCalled()
  })

  it('sem callback registrado, o 401 só vira erro', async () => {
    definirAoErroSessao(null)
    simularFetch(401, {})
    expect((await erroDe(api.painel())).status).toBe(401)
    expect(aviso).not.toHaveBeenCalled()
  })
})

describe('rotas de sessão e usuários', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sessão: uso=1 só quando pedido; entrar e sair com o cabeçalho do sistema', async () => {
    const fetch = simularFetch(200, { usuario: null, semUsuarios: true, build: 'b1' })
    await api.sessao()
    await api.sessao(true)
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['/api/sessao', '/api/sessao?uso=1'])
    await api.entrar({ login: 'Maria', senha: 's', manterConectado: true })
    const [url, init] = fetch.mock.calls[2]
    expect(url).toBe('/api/sessao')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ 'x-bc-calibracao': '1' })
    expect(JSON.parse(String(init?.body))).toEqual({ login: 'Maria', senha: 's', manterConectado: true })
  })

  it('redefinir senha sem senha manda corpo vazio; ids vão codificados', async () => {
    const fetch = simularFetch(200, { usuario: {} })
    await api.redefinirSenha('a/b')
    await api.redefinirSenha('u1', 'cavalo azul pulando')
    expect(fetch.mock.calls[0][0]).toBe('/api/usuarios/a%2Fb/senha')
    expect(fetch.mock.calls[0][1]?.body).toBe('{}')
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ senha: 'cavalo azul pulando' })
  })

  it('auditoria leva só os filtros informados', async () => {
    expect(consultaAuditoria({ antes: 120, limite: 50, grupo: 'alteracoes' })).toBe('antes=120&limite=50&grupo=alteracoes')
    expect(consultaAuditoria({ limite: 50, grupo: undefined, usuarioId: '' })).toBe('limite=50')
    const fetch = simularFetch(200, { registros: [] })
    await api.auditoria({ usuarioId: 'u 1' })
    expect(fetch.mock.calls[0][0]).toBe('/api/auditoria?usuarioId=u+1')
  })
})

describe('calibrações', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('folha de campo: da calibração e avulsa (balança, cliente ou em branco), com uma chave nova a cada pedido', () => {
    expect(api.urlFolhaCampo('k/1')).toBe('/api/calibracoes/k%2F1/folha-campo')
    vi.useFakeTimers()
    try {
      const branco = api.urlFolhaCampoAvulsa()
      expect(branco).toMatch(/^\/api\/folha-campo\?chave=[0-9a-f-]{36}$/)
      // O clique duplo (o mesmo pedido logo em seguida) é a mesma folha; passados alguns segundos, outra
      expect(api.urlFolhaCampoAvulsa()).toBe(branco)
      vi.advanceTimersByTime(JANELA_FOLHA_AVULSA_MS + 1)
      expect(api.urlFolhaCampoAvulsa()).not.toBe(branco)
    } finally {
      vi.useRealTimers()
    }
    expect(api.urlFolhaCampoAvulsa({ balancaId: 'b 1' })).toMatch(/^\/api\/folha-campo\?balancaId=b\+1&chave=[0-9a-f-]{36}$/)
    expect(api.urlFolhaCampoAvulsa({ clienteId: 'c1' })).toMatch(/^\/api\/folha-campo\?clienteId=c1&chave=/)
    // Do cliente com a OS e a data prevista; sem OS (ou só espaços), sem o parâmetro
    expect(api.urlFolhaCampoAvulsa({ clienteId: 'c1', ordemServico: ' OS 2026/0777 ', data: '2026-11-12' })).toMatch(
      /^\/api\/folha-campo\?clienteId=c1&os=OS\+2026%2F0777&data=2026-11-12&chave=[0-9a-f-]{36}$/,
    )
    expect(api.urlFolhaCampoAvulsa({ clienteId: 'c1', ordemServico: '  ', data: '' })).toMatch(
      /^\/api\/folha-campo\?clienteId=c1&chave=/,
    )
    // Reimpressão pelo nº: o mesmo endereço sempre (nunca reserva nº)
    expect(api.urlReimprimirFolha('FC-2026-00042')).toBe('/api/folha-campo/FC-2026-00042')
  })

  it('arquivo guardado: o link leva o nome da referência (o mesmo conteúdo pode ter outro nome em outro padrão)', () => {
    const sha = 'a'.repeat(64)
    expect(api.urlArquivo(sha)).toBe(`/api/arquivos/${sha}`)
    expect(api.urlArquivo(sha, { baixar: true, nome: 'Cert 1.pdf' })).toBe(`/api/arquivos/${sha}?baixar=1&nome=Cert+1.pdf`)
    const ref = { sha256: sha, nome: 'Certificado JP-01.pdf', tamanho: 10, tipo: 'application/pdf', enviadoEm: '' }
    expect(api.urlAnexo(ref)).toBe(`/api/arquivos/${sha}?nome=Certificado+JP-01.pdf`)
    expect(api.urlAnexo({ ...ref, nome: '' })).toBe(`/api/arquivos/${sha}`)
  })

  it('PDF para ver ou baixar; emitir com a versão (quem autoriza é quem emite)', async () => {
    expect(api.urlPdf('k/1')).toBe('/api/calibracoes/k%2F1/pdf')
    expect(api.urlPdf('k1', true)).toBe('/api/calibracoes/k1/pdf?baixar=1')
    const fetch = simularFetch(200, { calibracao: {} })
    await api.emitir('k1', { versao: 3 })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/calibracoes/k1/emitir')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ versao: 3 })
    // Emitido, mas sem o PDF gravado na hora: o aviso chega para a tela mostrar
    simularFetch(200, { calibracao: { numero: 'CC-2026-00001' }, aviso: 'O PDF é gerado de novo ao abrir.' })
    expect(await api.emitir('k1', { versao: 4 })).toMatchObject({ aviso: 'O PDF é gerado de novo ao abrir.' })
  })

  it('pedido de autorização, devolução e volta para rascunho', async () => {
    const fetch = simularFetch(200, { calibracao: {} })
    await api.pedirAutorizacao('k1', 'fabio', 4)
    await api.devolver('k1', 'Confira a temperatura', 5)
    await api.voltarParaRascunho('k1', 6)
    const chamadas = fetch.mock.calls.map(([url, init]) => [url, init?.method, JSON.parse(String(init?.body))])
    expect(chamadas).toEqual([
      ['/api/calibracoes/k1/autorizacao', 'POST', { signatarioId: 'fabio', versao: 4 }],
      ['/api/calibracoes/k1/devolver', 'POST', { nota: 'Confira a temperatura', versao: 5 }],
      ['/api/calibracoes/k1/situacao', 'POST', { status: 'RASCUNHO', versao: 6 }],
    ])
  })

  it('a lista leva só os filtros informados', async () => {
    const fetch = simularFetch(200, { itens: [], total: 0 })
    await api.calibracoes({ status: 'EMITIDO', busca: 'balança 5', pagina: 2 })
    expect(fetch.mock.calls[0][0]).toBe('/api/calibracoes?status=EMITIDO&busca=balan%C3%A7a+5&pagina=2')
  })
})

// ---- Tempo real -------------------------------------------------------------------------

class FonteFalsa {
  static abertas: FonteFalsa[] = []
  fechada = false
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  private ouvintes = new Map<string, (e: MessageEvent) => void>()
  readonly url: string
  constructor(url: string) {
    this.url = url
    FonteFalsa.abertas.push(this)
  }
  addEventListener(tipo: string, fn: (e: MessageEvent) => void) {
    this.ouvintes.set(tipo, fn)
  }
  close() {
    this.fechada = true
  }
  ola(dados: unknown) {
    this.ouvintes.get('ola')?.({ data: JSON.stringify(dados) } as MessageEvent)
  }
}

describe('conectarTempoReal', () => {
  let visibilidade: (() => void) | undefined
  const documento = {
    hidden: false,
    addEventListener: (_: string, fn: () => void) => (visibilidade = fn),
    removeEventListener: () => (visibilidade = undefined),
  }
  beforeEach(() => {
    FonteFalsa.abertas = []
    documento.hidden = false
    vi.stubGlobal('EventSource', FonteFalsa)
    vi.stubGlobal('document', documento)
  })
  afterEach(() => vi.unstubAllGlobals())

  const conectar = () => {
    const h = { aoConectar: vi.fn(), aoReceber: vi.fn(), aoDesconectar: vi.fn(), aoSemSessao: vi.fn() }
    return { h, conexao: conectarTempoReal(h) }
  }

  it('ola normal conecta', () => {
    const { h } = conectar()
    FonteFalsa.abertas[0].ola({ revisao: 7, build: 'b1' })
    expect(h.aoConectar).toHaveBeenCalledWith({ revisao: 7, build: 'b1' })
    expect(h.aoSemSessao).not.toHaveBeenCalled()
  })

  it('ola sem sessão fecha, fica parado (nem a volta da aba reabre) e só reabre com reabrir()', () => {
    const { h, conexao } = conectar()
    const primeira = FonteFalsa.abertas[0]
    primeira.ola({ revisao: -1, build: 'b2', semSessao: true })
    expect(primeira.fechada).toBe(true)
    expect(h.aoConectar).not.toHaveBeenCalled()
    expect(h.aoSemSessao).toHaveBeenCalledWith({ revisao: -1, build: 'b2', semSessao: true } satisfies Ola)

    visibilidade?.()
    expect(FonteFalsa.abertas).toHaveLength(1)

    conexao.reabrir()
    expect(FonteFalsa.abertas).toHaveLength(2)
    FonteFalsa.abertas[1].ola({ revisao: 3, build: 'b2' })
    expect(h.aoConectar).toHaveBeenCalledWith({ revisao: 3, build: 'b2' })
  })

  it('depois de fechar, reabrir não abre de novo', () => {
    const { conexao } = conectar()
    conexao.fechar()
    expect(FonteFalsa.abertas[0].fechada).toBe(true)
    conexao.reabrir()
    expect(FonteFalsa.abertas).toHaveLength(1)
  })
})

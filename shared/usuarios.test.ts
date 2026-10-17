import { describe, expect, it } from 'vitest'
import { SENHAS_COMUNS } from './senhasComuns.ts'
import type { AcaoAuditoria } from './tipos.ts'
import {
  GRUPOS_AUDITORIA,
  LOGIN_MAX,
  LOGIN_MIN,
  normalizarAlteracaoUsuario,
  normalizarLogin,
  normalizarNovoUsuario,
  ROTULO_ACAO_AUDITORIA,
  ROTULO_GRUPO_AUDITORIA,
  SENHA_MAX,
  SENHA_MIN,
  validarLogin,
  validarSenhaNova,
} from './usuarios.ts'

const MSG_LOGIN = {
  vazio: 'Informe o usuário (o nome para entrar no sistema).',
  curto: 'O usuário precisa ter pelo menos 2 caracteres.',
  longo: 'O usuário pode ter até 40 caracteres.',
  inicio: 'O usuário precisa começar com uma letra ou um número.',
  caractere: (c: string) =>
    `O usuário não pode ter “${c}”. Use letras (com ou sem acento), números, espaço, ponto, hífen, sublinhado ou @.`,
}
const MSG = {
  tamanho: 'A senha precisa ter de 8 a 128 caracteres.',
  comum: 'Essa senha é muito comum. Use uma frase de 3 ou 4 palavras.',
  login: 'A senha não pode conter o seu nome de usuário.',
  sistema: 'A senha não pode conter o nome do sistema.',
  nome: 'A senha não pode conter o seu nome.',
  repetido: 'A senha não pode ser um caractere repetido.',
  sequencia: 'A senha não pode ser uma sequência (como 1234567890).',
}
const maria = { login: 'maria.souza', nome: 'Maria Souza' }
/** Quando quem digita é o administrador (a senha é de outra pessoa). */
const MSG_OUTRA = {
  login: 'A senha não pode conter o usuário (login) da pessoa.',
  nome: 'A senha não pode conter o nome da pessoa.',
}

describe('login', () => {
  it('normaliza: minúsculo, sem espaços nas pontas, só texto', () => {
    expect(normalizarLogin('  Maria.Souza ')).toBe('maria.souza')
    expect(normalizarLogin(123)).toBe('123')
    expect(normalizarLogin(undefined)).toBe('')
    expect(normalizarLogin(null)).toBe('')
    expect(normalizarLogin(['maria'])).toBe('')
    expect(normalizarLogin({ login: 'maria' })).toBe('')
  })

  it('normaliza os espaços de dentro: "Rafael Tessaro" e "rafael  tessaro" são o mesmo login', () => {
    const mesmo = 'rafael tessaro'
    for (const v of ['Rafael Tessaro', 'rafael  tessaro', '  RAFAEL\tTessaro ', 'Rafael\u00a0\u00a0Tessaro', 'rafael \n tessaro'])
      expect(normalizarLogin(v), JSON.stringify(v)).toBe(mesmo)
    // Caracteres invisíveis (espaço de largura zero, hífen suave) não contam
    expect(normalizarLogin('ra\u200bfael\u00ad tessaro')).toBe(mesmo)
  })

  it('normaliza os acentos (NFC): "é" composto ou decomposto é o mesmo login', () => {
    const composto = 'joão.conceição'
    const decomposto = 'joa\u0303o.conceic\u0327a\u0303o'
    expect(decomposto).not.toBe(composto)
    expect(normalizarLogin(decomposto)).toBe(composto)
    expect(normalizarLogin('JOÃO.CONCEIÇÃO')).toBe(composto)
    expect(validarLogin(decomposto)).toBeNull()
  })

  it('aceita o que a pessoa escolher: letras com acento, números, espaço, ponto, hífen, sublinhado e @', () => {
    expect([LOGIN_MIN, LOGIN_MAX]).toEqual([2, 40])
    for (const ok of [
      'ana',
      'li',
      'r2',
      'maria.souza',
      'joao_lima',
      'recepcao-2',
      '1caixa',
      'joão',
      'José Conceição',
      'Rafael Tessaro',
      'ana@balancas.com',
      'técnico 2',
      'Ñandú',
      'Maria',
      'a'.repeat(LOGIN_MAX),
      'é'.repeat(LOGIN_MAX),
    ])
      expect(validarLogin(ok), ok).toBeNull()
  })

  it('recusa com uma mensagem que diz o motivo', () => {
    expect(validarLogin('')).toBe(MSG_LOGIN.vazio)
    expect(validarLogin('   ')).toBe(MSG_LOGIN.vazio)
    expect(validarLogin('a')).toBe(MSG_LOGIN.curto)
    expect(validarLogin(' a ')).toBe(MSG_LOGIN.curto)
    expect(validarLogin('a'.repeat(LOGIN_MAX + 1))).toBe(MSG_LOGIN.longo)
    // O tamanho conta como a pessoa conta: 40 "é" decompostos são 40 caracteres
    expect(validarLogin('e\u0301'.repeat(LOGIN_MAX))).toBeNull()
    for (const ruim of ['.maria', '-ana', '_ana', '@ana']) expect(validarLogin(ruim), ruim).toBe(MSG_LOGIN.inicio)
    expect(validarLogin('ana/1')).toBe(MSG_LOGIN.caractere('/'))
    expect(validarLogin('maria#1')).toBe(MSG_LOGIN.caractere('#'))
    expect(validarLogin("d'ávila")).toBe(MSG_LOGIN.caractere("'"))
    expect(validarLogin('ana 🔑')).toBe(MSG_LOGIN.caractere('🔑'))
    expect(validarLogin('ana\u0000b')).toBe(MSG_LOGIN.caractere('\u0000'))
  })
})

describe('política de senha', () => {
  it('aceita frases e senhas longas sem regra de composição', () => {
    expect(validarSenhaNova('cavalo bateria grampo certo', maria)).toBeNull()
    expect(validarSenhaNova('tomate azul na janela', maria)).toBeNull()
    expect(validarSenhaNova('x'.repeat(7) + 'y', maria)).toBeNull()
    expect(validarSenhaNova('ç'.repeat(SENHA_MAX - 1) + 'a', maria)).toBeNull()
  })

  it('tamanho de 8 a 128, contado em caracteres (NFC)', () => {
    expect(SENHA_MIN).toBe(8)
    expect(SENHA_MAX).toBe(128)
    expect(validarSenhaNova('', maria)).toBe(MSG.tamanho)
    expect(validarSenhaNova('tomate7', maria)).toBe(MSG.tamanho)
    expect(validarSenhaNova('tomate7!', maria)).toBeNull()
    expect(validarSenhaNova('a'.repeat(64) + 'b'.repeat(65), maria)).toBe(MSG.tamanho)
    expect(validarSenhaNova('a'.repeat(64) + 'b'.repeat(64), maria)).toBeNull()
    // "é" decomposto (e + acento) conta como 1 caractere depois da normalização
    const decomposto = 'café pa'
    expect([...decomposto].length).toBe(8)
    expect(validarSenhaNova(decomposto, maria)).toBe(MSG.tamanho)
    expect(validarSenhaNova('café pao', maria)).toBeNull()
    expect(validarSenhaNova('café pa', maria)).toBe(MSG.tamanho)
    // Emoji conta como 1
    expect(validarSenhaNova('🔑🔑🔑🔑🔑🔑🔑', maria)).toBe(MSG.tamanho)
  })

  it('recusa senhas comuns, sem diferenciar maiúsculas', () => {
    for (const s of ['1234567890', 'senha12345', 'qwertyuiop', 'mudar12345', 'brasil2026', 'flamengo123', 'password123'])
      expect(validarSenhaNova(s, maria), s).toBe(MSG.comum)
    expect(validarSenhaNova('Senha12345', maria)).toBe(MSG.comum)
    expect(validarSenhaNova('PASSWORD123', maria)).toBe(MSG.comum)
  })

  it('a lista de senhas comuns tem só minúsculas com o tamanho mínimo', () => {
    expect(SENHAS_COMUNS.size).toBeGreaterThanOrEqual(200)
    for (const s of SENHAS_COMUNS) {
      expect(s, s).toBe(s.toLowerCase())
      expect([...s].length, s).toBeGreaterThanOrEqual(SENHA_MIN)
    }
  })

  it('recusa o nome de usuário dentro da senha (com 3 caracteres ou mais)', () => {
    expect(validarSenhaNova('eu sou maria.souza', maria)).toBe(MSG.login)
    expect(validarSenhaNova('xxJOAOxxyy', { login: 'joao', nome: 'J' })).toBe(MSG.login)
    expect(validarSenhaNova('banana split', { login: 'ana', nome: 'A' })).toBe(MSG.login)
    // Login curto demais não conta
    expect(validarSenhaNova('ab ab ab ab', { login: 'ab', nome: '' })).toBeNull()
    // Login com espaços e maiúsculas: conferido como fica gravado
    expect(validarSenhaNova('oi rafael tessaro!', { login: 'Rafael  Tessaro', nome: 'R T' })).toBe(MSG.login)
  })

  it('recusa o nome do sistema', () => {
    expect(validarSenhaNova('bccalibracao2026', maria)).toBe(MSG.sistema)
    expect(validarSenhaNova('Minha Calibracao Boa', maria)).toBe(MSG.sistema)
    expect(validarSenhaNova('calibrações da festa', maria)).toBe(MSG.sistema)
  })

  it('recusa uma palavra inteira do nome com 4 letras ou mais, sem acento', () => {
    expect(validarSenhaNova('souza e cia ltda', maria)).toBe(MSG.nome)
    expect(validarSenhaNova('SOUZAMARIA!', { login: 'msz', nome: 'Maria Souza' })).toBe(MSG.nome)
    expect(validarSenhaNova('joao gosta de pao', { login: 'jl', nome: 'João Lima' })).toBe(MSG.nome)
    expect(validarSenhaNova('limão com sal', { login: 'jl', nome: 'João Lima' })).toBe(MSG.nome)
    expect(validarSenhaNova('JOÃO na praia', { login: 'jl', nome: 'Joao Lima' })).toBe(MSG.nome)
    // Palavras com menos de 4 letras não contam ("da", "Ana")
    expect(validarSenhaNova('ana da praia azul', { login: 'xyz', nome: 'Ana da Praia' })).toBe(MSG.nome)
    expect(validarSenhaNova('ana da costa azul', { login: 'xyz', nome: 'Ana da Praia' })).toBeNull()
  })

  it('recusa caractere repetido', () => {
    expect(validarSenhaNova('%%%%%%%%%%', maria)).toBe(MSG.repetido)
    expect(validarSenhaNova('ççççççççç', maria)).toBe(MSG.repetido)
  })

  it('recusa sequências crescentes ou decrescentes', () => {
    for (const s of ['23456789', '0987654321', 'ABCDEFGHIJK', 'zyxwvutsrq', 'wertyuio', 'poiuytrewq', 'sdfghjkl', 'lkjhgfdsa'])
      expect(validarSenhaNova(s, maria), s).toBe(MSG.sequencia)
    expect(validarSenhaNova('13572468', maria)).toBeNull()
  })

  it('senha de outra pessoa (o administrador digita): "da pessoa" em vez de "o seu"', () => {
    const outra = { deOutraPessoa: true }
    expect(validarSenhaNova('eu sou maria.souza', maria, outra)).toBe(MSG_OUTRA.login)
    expect(validarSenhaNova('souzamaria99', maria, outra)).toBe(MSG_OUTRA.nome)
    // As outras mensagens não mudam
    expect(validarSenhaNova('12345678', maria, outra)).toBe(MSG.comum)
    expect(validarSenhaNova('bccalibracao2026', maria, outra)).toBe(MSG.sistema)
    expect(validarSenhaNova('tomate azul na janela', maria, outra)).toBeNull()
    expect(normalizarNovoUsuario({ nome: 'Maria Souza', login: 'msz', nivel: 'COMUM', senha: 'souzamaria99' }).erros).toEqual([
      MSG_OUTRA.nome,
    ])
  })

  it('devolve o primeiro problema, na ordem da política', () => {
    // comum antes de conter o login
    expect(validarSenhaNova('password123', { login: 'pass', nome: '' })).toBe(MSG.comum)
    // login antes do nome do sistema
    expect(validarSenhaNova('maria.souza calibra', maria)).toBe(MSG.login)
    // nome do sistema antes do nome da pessoa
    expect(validarSenhaNova('calibracao da maria', maria)).toBe(MSG.sistema)
  })
})

describe('normalização das entradas', () => {
  it('novo usuário', () => {
    const r = normalizarNovoUsuario({ nome: '  Maria \n  Souza ', login: ' Maria.Souza ', nivel: 'ADMIN', senha: '' })
    expect(r.erros).toEqual([])
    expect(r.valor).toEqual({
      nome: 'Maria Souza',
      login: 'maria.souza',
      nivel: 'ADMIN',
      senha: '',
      signatario: false,
      cargo: '',
      registro: '',
    })
  })

  it('novo usuário: login escolhido com acentos e espaços fica gravado normalizado', () => {
    const r = normalizarNovoUsuario({ nome: 'Rafael Tessaro', login: '  Rafael   TESSARO ', nivel: 'ADMIN', senha: '' })
    expect(r.erros).toEqual([])
    expect(r.valor.login).toBe('rafael tessaro')
    expect(normalizarNovoUsuario({ nome: 'João', login: 'João Conceição' }).valor.login).toBe('joão conceição')
  })

  it('novo usuário: nível inválido vira comum e senha vazia é aceita', () => {
    const r = normalizarNovoUsuario({ nome: 'João Lima', login: 'joao', nivel: 'DONO' })
    expect(r.erros).toEqual([])
    expect(r.valor).toEqual({
      nome: 'João Lima',
      login: 'joao',
      nivel: 'COMUM',
      senha: '',
      signatario: false,
      cargo: '',
      registro: '',
    })
  })

  it('novo usuário: valida nome, login e senha digitada', () => {
    expect(normalizarNovoUsuario({}).erros).toEqual(['Informe o nome da pessoa.', MSG_LOGIN.vazio])
    expect(normalizarNovoUsuario(null).erros).toHaveLength(2)
    expect(normalizarNovoUsuario({ nome: 'a'.repeat(61), login: 'ana' }).erros).toEqual(['O nome pode ter até 60 caracteres.'])
    expect(normalizarNovoUsuario({ nome: 'á'.repeat(60), login: 'ana' }).erros).toEqual([])
    expect(normalizarNovoUsuario({ nome: 'João Lima', login: 'joão' }).erros).toEqual([])
    expect(normalizarNovoUsuario({ nome: 'João Lima', login: 'joão!' }).erros).toEqual([MSG_LOGIN.caractere('!')])
    expect(normalizarNovoUsuario({ nome: 'João Lima', login: 'joao', senha: 'curta' }).erros).toEqual([MSG.tamanho])
    // Quem cadastra é o administrador: as mensagens falam da pessoa
    expect(normalizarNovoUsuario({ nome: 'João Lima', login: 'joao', senha: 'o joao chegou' }).erros).toEqual([MSG_OUTRA.login])
    expect(normalizarNovoUsuario({ nome: 'João Lima', login: 'jlm', senha: 'lima da pérsia' }).erros).toEqual([MSG_OUTRA.nome])
    const ok = normalizarNovoUsuario({ nome: 'João Lima', login: 'joao', senha: 'tomate azul na janela' })
    expect(ok.erros).toEqual([])
    expect(ok.valor.senha).toBe('tomate azul na janela')
  })

  it('novo usuário: caracteres de controle no nome', () => {
    expect(normalizarNovoUsuario({ nome: 'Ma​ria\tSouza\u0000', login: 'maria' }).valor.nome).toBe('Maria Souza')
  })

  it('alteração: só os campos presentes', () => {
    expect(normalizarAlteracaoUsuario({})).toEqual({ valor: {}, erros: [] })
    expect(normalizarAlteracaoUsuario({ nivel: 'ADMIN', versao: 3 })).toEqual({ valor: { nivel: 'ADMIN', versao: 3 }, erros: [] })
    expect(normalizarAlteracaoUsuario({ nome: ' Ana  Prado ', ativo: false, login: ' Outro ' })).toEqual({
      valor: { nome: 'Ana Prado', ativo: false, login: 'outro' },
      erros: [],
    })
  })

  it('alteração do login: mesma normalização e validação do cadastro', () => {
    expect(normalizarAlteracaoUsuario({ login: 'Rafael  Tessaro' })).toEqual({ valor: { login: 'rafael tessaro' }, erros: [] })
    expect(normalizarAlteracaoUsuario({ login: '' })).toEqual({ valor: {}, erros: [MSG_LOGIN.vazio] })
    expect(normalizarAlteracaoUsuario({ login: '-ana' })).toEqual({ valor: {}, erros: [MSG_LOGIN.inicio] })
    expect(normalizarAlteracaoUsuario({ login: 'ana#1' }).erros).toEqual([MSG_LOGIN.caractere('#')])
  })

  it('alteração: nível, situação, versão e nome inválidos são erro', () => {
    expect(normalizarAlteracaoUsuario({ nivel: 'DONO' }).erros).toEqual(['Nível inválido. Escolha Administrador ou Técnico.'])
    expect(normalizarAlteracaoUsuario({ nivel: 'DONO' }).valor).toEqual({})
    expect(normalizarAlteracaoUsuario({ ativo: 'sim' }).erros).toHaveLength(1)
    expect(normalizarAlteracaoUsuario({ versao: 1.5 }).erros).toHaveLength(1)
    expect(normalizarAlteracaoUsuario({ versao: '2' }).erros).toHaveLength(1)
    expect(normalizarAlteracaoUsuario({ versao: 0 }).erros).toHaveLength(1)
    expect(normalizarAlteracaoUsuario({ nome: '' }).erros).toEqual(['Informe o nome da pessoa.'])
  })
})

describe('registro de atividades', () => {
  const TODAS: AcaoAuditoria[] = Object.keys(ROTULO_ACAO_AUDITORIA) as AcaoAuditoria[]

  it('cada ação está em exatamente um grupo', () => {
    const nosGrupos = Object.values(GRUPOS_AUDITORIA).flat()
    expect(nosGrupos.length).toBe(TODAS.length)
    expect([...nosGrupos].sort()).toEqual([...TODAS].sort())
    expect(GRUPOS_AUDITORIA.alteracoes).toEqual(['ALTERACAO'])
    expect(GRUPOS_AUDITORIA.acessos).toEqual(['LOGIN', 'LOGIN_FALHOU', 'BLOQUEIO', 'LOGOUT', 'ACESSO_NEGADO'])
  })

  it('rótulos para as ações e para os grupos', () => {
    expect(TODAS).toHaveLength(19)
    for (const a of TODAS) expect(ROTULO_ACAO_AUDITORIA[a].length, a).toBeGreaterThan(3)
    expect(Object.keys(ROTULO_GRUPO_AUDITORIA).sort()).toEqual(Object.keys(GRUPOS_AUDITORIA).sort())
  })
})

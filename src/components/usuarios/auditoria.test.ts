import { describe, expect, it } from 'vitest'
import type { RegistroAuditoria } from '#shared/tipos.ts'
import { autorDoRegistro, descreverRegistro, enderecoDoLink, grupoDaAcao, textoDoAutor } from './auditoria'

const registro = (r: Partial<RegistroAuditoria>): RegistroAuditoria => ({
  id: 1,
  em: '2026-10-11T12:03:00.000Z',
  usuarioId: 'u1',
  login: 'maria',
  ip: '192.168.0.23',
  acao: 'ALTERACAO',
  alvo: '',
  detalhe: '',
  ...r,
})

describe('descreverRegistro', () => {
  it('gravação vira frase, com o link da ficha', () => {
    const d = descreverRegistro(registro({ alvo: 'c81', detalhe: 'PUT /api/clientes/:id' }))
    expect(d.titulo).toBe('Alterou o cadastro do cliente')
    expect(d.link).toEqual({ tipo: 'cliente', id: 'c81' })
    expect(enderecoDoLink(d.link!)).toBe('/clientes/c81')
  })

  it('cliente, balança e calibração têm link; exclusão e cadastro sem alvo, não', () => {
    expect(descreverRegistro(registro({ alvo: 'b1', detalhe: 'PUT /api/balancas/:id' })).link).toEqual({
      tipo: 'balanca',
      id: 'b1',
    })
    expect(enderecoDoLink({ tipo: 'balanca', id: 'b 1' })).toBe('/balancas/b%201')
    expect(enderecoDoLink({ tipo: 'calibracao', id: 'k1' })).toBe('/calibracoes/k1')
    expect(descreverRegistro(registro({ alvo: 'b1', detalhe: 'DELETE /api/balancas/:id' }))).toEqual({
      titulo: 'Excluiu uma balança',
      detalhe: '',
    })
    expect(descreverRegistro(registro({ detalhe: 'POST /api/clientes' })).link).toBeUndefined()
  })

  it('emissão, cancelamento e envio do certificado levam à calibração', () => {
    const d = descreverRegistro(
      registro({ acao: 'CERTIFICADO_EMITIDO', alvo: 'k7', detalhe: 'POST /api/calibracoes/:id/emitir' }),
    )
    expect(d).toEqual({ titulo: 'Emitiu um certificado', detalhe: '', link: { tipo: 'calibracao', id: 'k7' } })
    expect(descreverRegistro(registro({ acao: 'BACKUP_BAIXADO', detalhe: 'GET /api/backups/:arquivo' }))).toEqual({
      titulo: 'Baixou uma cópia de segurança',
      detalhe: '',
    })
  })

  it('emissão com o nº reservado: o detalhe diz de qual folha de campo ele veio', () => {
    expect(
      descreverRegistro(
        registro({
          acao: 'CERTIFICADO_EMITIDO',
          alvo: 'k7',
          detalhe: 'POST /api/calibracoes/:id/emitir | CC-2026-00042, reservado na folha de campo FC-2026-00010',
        }),
      ),
    ).toEqual({
      titulo: 'Emitiu um certificado',
      detalhe: 'CC-2026-00042, reservado na folha de campo FC-2026-00010',
      link: { tipo: 'calibracao', id: 'k7' },
    })
  })

  it('nº de certificado reservado e não utilizado: o nº e de onde (ou o motivo), com o link da calibração se houver', () => {
    expect(
      descreverRegistro(registro({ acao: 'NUMERO_RESERVADO', alvo: 'k3', detalhe: 'CC-2026-00042 · folha FC-2026-00010' })),
    ).toEqual({
      titulo: 'Reservou um nº de certificado',
      detalhe: 'CC-2026-00042 · folha FC-2026-00010',
      link: { tipo: 'calibracao', id: 'k3' },
    })
    // Folha avulsa e calibração excluída: sem link
    expect(
      descreverRegistro(
        registro({ acao: 'NUMERO_NAO_UTILIZADO', detalhe: 'CC-2026-00042 · Calibração excluída antes da emissão (rascunho).' }),
      ),
    ).toEqual({
      titulo: 'Nº de certificado não utilizado',
      detalhe: 'CC-2026-00042 · Calibração excluída antes da emissão (rascunho).',
    })
    // O descarte pela rota: só o que vem depois da chave
    expect(
      descreverRegistro(
        registro({
          acao: 'NUMERO_NAO_UTILIZADO',
          detalhe: 'POST /api/numeros-reservados/:reserva/nao-utilizado | CC-2026-00043 · folha avulsa FC-2026-00011',
        }),
      ),
    ).toEqual({ titulo: 'Nº de certificado não utilizado', detalhe: 'CC-2026-00043 · folha avulsa FC-2026-00011' })
    expect(grupoDaAcao('NUMERO_RESERVADO')).toBe('certificados')
    expect(grupoDaAcao('NUMERO_NAO_UTILIZADO')).toBe('certificados')
  })

  it('folha avulsa impressa: a frase da rota', () => {
    expect(descreverRegistro(registro({ detalhe: 'GET /api/folha-campo' })).titulo).toBe('Imprimiu uma folha de campo avulsa')
  })

  it('folha de campo nova e folha ligada: a frase e os nºs das folhas', () => {
    expect(
      descreverRegistro(
        registro({ alvo: 'k3', detalhe: 'GET /api/calibracoes/:id/folha-campo | FC-2026-00002 no lugar da FC-2026-00001' }),
      ),
    ).toEqual({
      titulo: 'Imprimiu uma folha de campo nova para uma calibração',
      detalhe: 'FC-2026-00002 no lugar da FC-2026-00001',
      link: { tipo: 'calibracao', id: 'k3' },
    })
    expect(descreverRegistro(registro({ alvo: 'k3', detalhe: 'PUT /api/calibracoes/:id/folha-campo | FC-2026-00004' }))).toEqual({
      titulo: 'Ligou uma folha de campo a uma calibração',
      detalhe: 'FC-2026-00004',
      link: { tipo: 'calibracao', id: 'k3' },
    })
  })

  it('rota desconhecida aparece como a chave', () => {
    expect(descreverRegistro(registro({ detalhe: 'POST /api/novidade' })).titulo).toBe('POST /api/novidade')
  })

  it('acesso negado diz o que a pessoa tentou', () => {
    const d = descreverRegistro(registro({ acao: 'ACESSO_NEGADO', detalhe: 'DELETE /api/clientes/:id' }))
    expect(d.titulo).toBe('Ação recusada por falta de permissão')
    expect(d.detalhe).toBe('Tentou excluir um cliente.')
  })

  it('ações sobre usuários mostram quem foi afetado', () => {
    const nomes = new Map([['u2', 'João Lima']])
    const d = descreverRegistro(
      registro({ acao: 'USUARIO_ALTERADO', alvo: 'u2', detalhe: 'joao: nível: Técnico → Administrador' }),
      nomes,
    )
    expect(d).toEqual({ titulo: 'Alterou um usuário', detalhe: 'João Lima · joao: nível: Técnico → Administrador' })
    expect(descreverRegistro(registro({ acao: 'LOGIN' }))).toEqual({ titulo: 'Entrou no sistema', detalhe: '' })
  })

  it('na própria conta não repete o nome de quem fez', () => {
    const nomes = new Map([['u2', 'João Lima']])
    const d = descreverRegistro(
      registro({ acao: 'SENHA_TROCADA', usuarioId: 'u2', alvo: 'u2', detalhe: 'senha temporária substituída' }),
      nomes,
    )
    expect(d).toEqual({ titulo: 'Trocou a própria senha', detalhe: 'senha temporária substituída' })
  })

  it('ferramenta do servidor: a conta ajustada vai no detalhe, mesmo sendo a do registro', () => {
    const nomes = new Map([['u2', 'Maria Souza']])
    const d = descreverRegistro(
      registro({
        acao: 'FERRAMENTA_LOCAL',
        usuarioId: 'u2',
        login: 'maria',
        alvo: 'u2',
        ip: 'local',
        detalhe: 'senha redefinida; nível: Técnico → Administrador',
      }),
      nomes,
    )
    expect(d).toEqual({
      titulo: 'Ajuste de usuário no computador do servidor',
      detalhe: 'Maria Souza · senha redefinida; nível: Técnico → Administrador',
    })
  })

  it('grupo de cada ação vem de GRUPOS_AUDITORIA', () => {
    expect(grupoDaAcao('LOGIN_FALHOU')).toBe('acessos')
    expect(grupoDaAcao('SENHA_REDEFINIDA')).toBe('usuarios')
    expect(grupoDaAcao('BACKUP_BAIXADO')).toBe('dados')
    expect(grupoDaAcao('ALTERACAO')).toBe('alteracoes')
  })
})

describe('autorDoRegistro (linha de baixo: quem fez)', () => {
  const nomes = new Map([['u1', 'Maria Souza']])
  const autor = (r: Partial<RegistroAuditoria>) => textoDoAutor(autorDoRegistro(registro(r), nomes))

  it('quem fez, com o login entre parênteses', () => {
    expect(autor({ acao: 'LOGIN' })).toBe('Maria Souza (maria)')
    expect(autor({ acao: 'LOGIN', usuarioId: 'excluido', login: 'jose' })).toBe('jose')
    expect(autor({ acao: 'LOGIN', usuarioId: '', login: '' })).toBe('—')
  })

  it('entrada recusada ou bloqueada: o usuário foi só o digitado, não quem tentou', () => {
    expect(autor({ acao: 'LOGIN_FALHOU' })).toBe('Tentativa com o usuário Maria Souza (maria)')
    expect(autor({ acao: 'BLOQUEIO', detalhe: '5 falhas seguidas do mesmo usuário neste computador' })).toBe(
      'Tentativa com o usuário Maria Souza (maria)',
    )
    expect(autor({ acao: 'LOGIN_FALHOU', usuarioId: 'excluido', login: 'jose' })).toBe('Tentativa com o usuário jose')
    expect(autor({ acao: 'LOGIN_FALHOU', usuarioId: '', login: '' })).toBe('Usuário inexistente')
    // A troca da própria senha só acontece com a pessoa logada
    expect(autor({ acao: 'BLOQUEIO', detalhe: 'senha atual errada várias vezes na troca de senha' })).toBe('Maria Souza (maria)')
  })

  it('ferramenta do servidor, cópia restaurada e atualização do sistema: no computador do servidor', () => {
    expect(autor({ acao: 'FERRAMENTA_LOCAL', alvo: 'u1', ip: 'local' })).toBe('No computador do servidor')
    expect(autor({ acao: 'COPIA_RESTAURADA', usuarioId: '', login: '', ip: 'local' })).toBe('No computador do servidor')
    expect(autor({ acao: 'SISTEMA_ATUALIZADO', usuarioId: '', login: '', ip: 'local' })).toBe('No computador do servidor')
  })

  it('atualização do sistema: o detalhe diz o que mudou, para conferir', () => {
    const detalhe =
      '1 balança com indicador separado passou a ser identificada pelo indicador; os dados de antes ficaram como plataforma. Confira: IND-1.'
    expect(descreverRegistro(registro({ acao: 'SISTEMA_ATUALIZADO', usuarioId: '', login: '', detalhe }))).toEqual({
      titulo: 'A atualização do sistema ajustou cadastros',
      detalhe,
    })
    expect(grupoDaAcao('SISTEMA_ATUALIZADO')).toBe('dados')
  })
})

describe('arquivos e POP no registro de atividades', () => {
  it('o arquivo do padrão (anexado, trocado, removido), o envio de arquivo e o POP viram frase com o detalhe', () => {
    expect(descreverRegistro(registro({ alvo: 'p1', detalhe: 'PUT /api/padroes/:id | arquivo do certificado anexado' }))).toEqual(
      {
        titulo: 'Alterou um padrão',
        detalhe: 'arquivo do certificado anexado',
      },
    )
    expect(descreverRegistro(registro({ detalhe: 'POST /api/arquivos | certificado de padrão (PDF)' }))).toEqual({
      titulo: 'Enviou um arquivo',
      detalhe: 'certificado de padrão (PDF)',
    })
    expect(descreverRegistro(registro({ detalhe: 'POST /api/pop | sem o arquivo (anexar depois)' }))).toEqual({
      titulo: 'Registrou uma revisão do POP',
      detalhe: 'sem o arquivo (anexar depois)',
    })
    expect(descreverRegistro(registro({ alvo: '3', detalhe: 'PUT /api/pop/:id/arquivo' }))).toEqual({
      titulo: 'Anexou o arquivo de uma revisão do POP',
      detalhe: '',
    })
    // Sem permissão: a frase do que tentou fazer
    expect(descreverRegistro(registro({ acao: 'ACESSO_NEGADO', detalhe: 'POST /api/pop' })).detalhe).toBe(
      'Tentou registrar uma revisão do POP.',
    )
  })
})

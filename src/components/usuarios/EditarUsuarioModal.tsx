import { AtSign, UserPen } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { NOME_NIVEL } from '#shared/permissoes.ts'
import type { AlteracaoUsuario, NivelUsuario, Usuario } from '#shared/tipos.ts'
import { LOGIN_MAX, NOME_USUARIO_MAX, normalizarLogin, validarLogin } from '#shared/usuarios.ts'
import { api, ErroApi } from '../../lib/api'
import { avisarErro } from '../../store/ui'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Form'
import { Modal } from '../ui/Modal'
import { DadosCertificado, type DadosNoCertificado } from './DadosCertificado'
import { EscolhaNivel } from './EscolhaNivel'

/**
 * Editar o nome, o login, o nível e os dados que saem no certificado (cargo, registro, signatário e
 * assinatura). Mudar o nível encerra as sessões da pessoa (ela entra de novo com o nível novo); trocar o
 * login, não.
 */
export function EditarUsuarioModal({
  usuario,
  usuarios = [],
  motivoNivel,
  aoFechar,
  aoSalvar,
  aoDesatualizado,
}: {
  usuario: Usuario | null
  /** Os usuários da lista, para avisar na hora de um login que já existe. */
  usuarios?: Usuario[]
  /** Por que o nível não pode mudar (a própria conta, o último administrador), ou nada. */
  motivoNivel?: string
  aoFechar: () => void
  aoSalvar: (u: Usuario) => void
  /** Outra pessoa alterou (ou excluiu) o usuário: a lista precisa ser recarregada. */
  aoDesatualizado: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  // Continua mostrando o último usuário enquanto a janela se fecha
  const [ultimo, setUltimo] = useState(usuario)
  if (usuario && usuario !== ultimo) setUltimo(usuario)
  const u = usuario ?? ultimo
  return (
    <Modal
      aberto={!!usuario}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      icone={<UserPen className="h-5 w-5" />}
      titulo={u ? `Editar ${u.nome}` : 'Editar usuário'}
      descricao={
        u && (
          <>
            Entra no sistema como <span className="font-mono text-[13px] text-ink-2">{u.login}</span>.
          </>
        )
      }
      rodape={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button variante="primary" type="submit" form="form-editar-usuario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      {usuario && (
        <FormEditar
          key={usuario.id}
          usuario={usuario}
          usuarios={usuarios}
          motivoNivel={motivoNivel}
          aoSalvar={aoSalvar}
          aoDesatualizado={aoDesatualizado}
          setSalvando={setSalvando}
        />
      )}
    </Modal>
  )
}

function FormEditar({
  usuario,
  usuarios,
  motivoNivel,
  aoSalvar,
  aoDesatualizado,
  setSalvando,
}: {
  usuario: Usuario
  usuarios: Usuario[]
  motivoNivel?: string
  aoSalvar: (u: Usuario) => void
  aoDesatualizado: () => void
  setSalvando: (v: boolean) => void
}) {
  const [nome, setNome] = useState(usuario.nome)
  const [login, setLogin] = useState(usuario.login)
  /** Login que o servidor recusou por já existir (outra pessoa pode ter acabado de cadastrá-lo). */
  const [loginRecusado, setLoginRecusado] = useState('')
  const [nivel, setNivel] = useState<NivelUsuario>(usuario.nivel)
  const [certificado, setCertificado] = useState<DadosNoCertificado>({
    signatario: usuario.signatario,
    cargo: usuario.cargo,
    registro: usuario.registro,
    assinatura: usuario.assinatura,
  })
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const erroNome = !nome.trim() ? 'Informe o nome da pessoa.' : null
  // Como fica gravado: "Maria Souza" e "maria  souza" são o mesmo login
  const loginFinal = normalizarLogin(login)
  const mudouLogin = loginFinal !== usuario.login
  const repetido =
    mudouLogin && (usuarios.some((x) => x.id !== usuario.id && x.login === loginFinal) || loginRecusado === loginFinal)
  const erroLogin = mudouLogin ? (validarLogin(loginFinal) ?? (repetido ? 'Já existe um usuário com este login.' : null)) : null
  const mudouNivel = nivel !== usuario.nivel

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (erroNome || erroLogin || enviando) return
    const alteracao: AlteracaoUsuario = { versao: usuario.versao }
    if (nome.trim() !== usuario.nome) alteracao.nome = nome
    if (mudouLogin) alteracao.login = loginFinal
    if (mudouNivel) alteracao.nivel = nivel
    if (certificado.signatario !== usuario.signatario) alteracao.signatario = certificado.signatario
    if (certificado.cargo.trim() !== usuario.cargo) alteracao.cargo = certificado.cargo
    if (certificado.registro.trim() !== usuario.registro) alteracao.registro = certificado.registro
    if (certificado.assinatura !== usuario.assinatura) alteracao.assinatura = certificado.assinatura
    // Só a versão: nada mudou
    if (Object.keys(alteracao).length === 1) return aoSalvar(usuario)
    setEnviando(true)
    setSalvando(true)
    try {
      const r = await api.alterarUsuario(usuario.id, alteracao)
      aoSalvar(r.usuario)
    } catch (err) {
      if (err instanceof ErroApi && err.dados.codigo === 'LOGIN_EXISTENTE') setLoginRecusado(loginFinal)
      else avisarErro('Não foi possível salvar', err)
      if (err instanceof ErroApi && (err.status === 404 || err.dados.codigo === 'CONFLITO')) aoDesatualizado()
      setEnviando(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form id="form-editar-usuario" onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="editar-nome" erro={tentou ? erroNome : null} hint="Como aparece nas telas e no certificado.">
          <Input
            id="editar-nome"
            autoFocus
            autoComplete="off"
            maxLength={NOME_USUARIO_MAX}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </Field>
        <Field
          label="Usuário"
          htmlFor="editar-login"
          erro={erroLogin}
          hint={mudouLogin ? 'Passa a entrar com este; quem já está no sistema continua.' : 'Para entrar no sistema.'}
        >
          <Input
            id="editar-login"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={LOGIN_MAX}
            icone={<AtSign className="h-4 w-4" />}
            className="font-mono text-[13px]"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            aria-invalid={!!erroLogin || undefined}
          />
        </Field>
      </div>
      <EscolhaNivel valor={nivel} aoMudar={setNivel} desabilitado={!!motivoNivel} motivo={motivoNivel} />
      {mudouNivel && (
        <p className="rounded-xl bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
          Ao salvar, {usuario.nome.split(' ')[0]} sai do sistema em todos os computadores e entra de novo já com o nível{' '}
          {NOME_NIVEL[nivel]}.
        </p>
      )}
      <DadosCertificado
        prefixo="editar"
        nome={nome}
        valor={certificado}
        aoMudar={(v) => setCertificado((c) => ({ ...c, ...v }))}
      />
    </form>
  )
}

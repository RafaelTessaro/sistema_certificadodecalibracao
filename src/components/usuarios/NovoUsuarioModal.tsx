import { AtSign, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { NivelUsuario, ResultadoSenha, Usuario } from '#shared/tipos.ts'
import { LOGIN_MAX, NOME_USUARIO_MAX, normalizarLogin, validarLogin, validarSenhaNova } from '#shared/usuarios.ts'
import { api, ErroApi } from '../../lib/api'
import { avisarErro, toast } from '../../store/ui'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Form'
import { Modal } from '../ui/Modal'
import { DadosCertificado, type DadosNoCertificado } from './DadosCertificado'
import { EscolhaNivel } from './EscolhaNivel'
import { SenhaInicial, type ModoSenha } from './SenhaInicial'

/**
 * Cadastro de um usuário: nome, login (escolhido, nada é sugerido pelo nome), nível, os dados que saem
 * no certificado (cargo, registro, signatário e assinatura) e a senha inicial (temporária).
 */
export function NovoUsuarioModal({
  aberto,
  aoFechar,
  usuarios,
  aoCriar,
}: {
  aberto: boolean
  aoFechar: () => void
  /** Os já cadastrados (para avisar do login repetido antes de enviar). */
  usuarios: Usuario[]
  aoCriar: (r: ResultadoSenha) => void
}) {
  const [salvando, setSalvando] = useState(false)
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      icone={<UserPlus className="h-5 w-5" />}
      titulo="Novo usuário"
      descricao="Cada pessoa tem o seu próprio usuário: assim o registro de atividades mostra quem fez cada coisa."
      rodape={
        <>
          <Button onClick={aoFechar}>Cancelar</Button>
          <Button variante="primary" type="submit" form="form-novo-usuario" disabled={salvando}>
            {salvando ? 'Cadastrando…' : 'Cadastrar usuário'}
          </Button>
        </>
      }
    >
      <FormNovoUsuario usuarios={usuarios} aoCriar={aoCriar} setSalvando={setSalvando} />
    </Modal>
  )
}

function FormNovoUsuario({
  usuarios,
  aoCriar,
  setSalvando,
}: {
  usuarios: Usuario[]
  aoCriar: (r: ResultadoSenha) => void
  setSalvando: (v: boolean) => void
}) {
  const [nome, setNome] = useState('')
  const [login, setLogin] = useState('')
  const [nivel, setNivel] = useState<NivelUsuario>('COMUM')
  const [certificado, setCertificado] = useState<DadosNoCertificado>({
    signatario: false,
    cargo: '',
    registro: '',
    assinatura: '',
  })
  const [modo, setModo] = useState<ModoSenha>('gerar')
  const [senha, setSenha] = useState('')
  const [tentou, setTentou] = useState(false)
  const [loginRecusado, setLoginRecusado] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Como fica gravado: "Maria Souza" e "maria  souza" são o mesmo login (e o repetido aparece na hora)
  const loginFinal = normalizarLogin(login)
  const erroNome = !nome.trim() ? 'Informe o nome da pessoa.' : null
  const repetido = usuarios.some((u) => u.login === loginFinal) || loginRecusado === loginFinal
  const erroLogin = validarLogin(loginFinal) ?? (repetido ? 'Já existe um usuário com este login.' : null)
  const erroSenha = modo === 'digitar' ? validarSenhaNova(senha, { login: loginFinal, nome }, { deOutraPessoa: true }) : null
  // Os problemas do login aparecem enquanto digita (ou ao tentar salvar com o campo vazio)
  const mostrarErroLogin = tentou || !!login

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (erroNome || erroLogin || erroSenha || enviando) return
    setEnviando(true)
    setSalvando(true)
    try {
      const { assinatura, ...dados } = certificado
      let r = await api.criarUsuario({ nome, login: loginFinal, nivel, senha: modo === 'digitar' ? senha : '', ...dados })
      // A imagem da assinatura vai numa segunda gravação (o cadastro não a recebe)
      if (assinatura) {
        try {
          const a = await api.alterarUsuario(r.usuario.id, { assinatura, versao: r.usuario.versao })
          r = { ...r, usuario: a.usuario }
        } catch (e) {
          toast.erro(
            'A assinatura não foi salva',
            `${e instanceof Error ? e.message : 'Erro inesperado.'} O usuário foi cadastrado: edite-o para enviar a imagem de novo.`,
          )
        }
      }
      aoCriar(r)
    } catch (err) {
      if (err instanceof ErroApi && err.dados.codigo === 'LOGIN_EXISTENTE') setLoginRecusado(loginFinal)
      else avisarErro('Não foi possível cadastrar', err)
      setEnviando(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form id="form-novo-usuario" onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="novo-nome" erro={tentou ? erroNome : null} hint="Como aparece nas telas e no certificado.">
          <Input
            id="novo-nome"
            autoFocus
            autoComplete="off"
            maxLength={NOME_USUARIO_MAX}
            placeholder="Ex.: Maria Souza"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </Field>
        <Field
          label="Usuário"
          htmlFor="novo-login"
          erro={mostrarErroLogin ? erroLogin : null}
          hint="Para entrar. Combine com a pessoa; dá para trocar depois."
        >
          <Input
            id="novo-login"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={LOGIN_MAX}
            placeholder="Ex.: maria.souza"
            icone={<AtSign className="h-4 w-4" />}
            className="font-mono text-[13px]"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            aria-invalid={(mostrarErroLogin && !!erroLogin) || undefined}
          />
        </Field>
      </div>
      <EscolhaNivel valor={nivel} aoMudar={setNivel} />
      <DadosCertificado prefixo="novo" nome={nome} valor={certificado} aoMudar={(v) => setCertificado((c) => ({ ...c, ...v }))} />
      <SenhaInicial
        modo={modo}
        aoMudarModo={setModo}
        senha={senha}
        aoMudarSenha={setSenha}
        erro={(tentou || senha) && erroSenha ? erroSenha : null}
      />
    </form>
  )
}

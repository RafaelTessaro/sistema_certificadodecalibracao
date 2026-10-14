// Telas antes de usar o sistema: entrar, primeiro acesso (criar o administrador) e a troca obrigatória
// da senha temporária. Ficam fora do menu e das rotas (o App escolhe pela situação da sessão).

import { BadgeCheck, KeyRound, LogIn, LogOut, Monitor, RefreshCw, ShieldCheck, User, UserCog } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { erroAoEntrar, problemasSenhaNova, useEspera } from '../components/sessao/auxiliares'
import { CampoSenha } from '../components/sessao/CampoSenha'
import { SenhaNova } from '../components/sessao/SenhaNova'
import { SeletorTema } from '../components/layout/Sidebar'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Form'
import { ErroApi } from '../lib/api'
import { cn } from '../lib/cn'
import { useSessao } from '../store/sessao'
import { toast } from '../store/ui'
import { normalizarLogin, sugerirLogin, validarLogin } from '#shared/usuarios.ts'

/** Moldura das telas de sessão: logo, cartão central e o seletor de tema no canto. */
function TelaSessao({
  children,
  rodape,
  largura = 'max-w-[400px]',
}: {
  children: ReactNode
  rodape?: ReactNode
  largura?: string
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg px-4 py-10">
      {/* Brilho suave atrás do cartão */}
      <div className="pointer-events-none absolute top-[-18%] left-1/2 -z-10 h-[460px] w-[680px] max-w-[160vw] -translate-x-1/2 rounded-full bg-brand-soft opacity-80 blur-3xl dark:opacity-60" />
      <div className="absolute top-4 right-4">
        <SeletorTema compacto />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={cn('w-full', largura)}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="h-14 w-14 drop-shadow-sm" />
          <p className="mt-3 text-[17px] font-semibold tracking-[-0.015em] text-ink">BC Calibração</p>
          <p className="text-[13px] text-muted">Certificados de calibração · Balanças.com</p>
        </div>
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">{children}</div>
        {rodape && <div className="mt-6 space-y-2 px-2 text-center text-xs leading-relaxed text-muted">{rodape}</div>}
      </motion.div>
    </div>
  )
}

function Titulo({ icone, titulo, texto }: { icone?: ReactNode; titulo: string; texto?: ReactNode }) {
  return (
    <div className="mb-6">
      {icone && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">{icone}</div>
      )}
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">{titulo}</h1>
      {texto && <p className="mt-1.5 text-sm text-muted">{texto}</p>}
    </div>
  )
}

function Alerta({ children }: { children: ReactNode }) {
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-medium text-danger"
    >
      {children}
    </motion.p>
  )
}

// ---- Entrar ------------------------------------------------------------------------

export function Entrar() {
  const entrar = useSessao((s) => s.entrar)
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [manter, setManter] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [faltam, esperar, aviso] = useEspera()

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (enviando || faltam) return
    if (!login.trim() || !senha) return setErro('Digite o usuário e a senha.')
    setEnviando(true)
    setErro('')
    try {
      await entrar({ login, senha, manterConectado: manter })
      // Deu certo: o App troca de tela (ou a página recarrega com a interface nova)
    } catch (err) {
      const r = erroAoEntrar(err)
      setErro(r.mensagem)
      esperar(r.esperarSegundos, r.porComputador)
      setSenha('')
      setEnviando(false)
    }
  }

  return (
    <TelaSessao
      rodape={
        <>
          <p>
            <ShieldCheck className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" />
            Para segurança, o sistema registra data, hora e computador de cada acesso e alteração.
          </p>
          <p>
            Esqueceu a senha? Peça ao administrador. Se você é o administrador, use “Redefinir senha do BC Calibração” no
            computador do servidor: clique em Iniciar e digite BC Calibração.
          </p>
        </>
      }
    >
      <Titulo titulo="Entrar" texto="Use o usuário e a senha que o administrador cadastrou para você." />
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <Field label="Usuário" htmlFor="entrar-usuario">
          <Input
            id="entrar-usuario"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            icone={<User className="h-4 w-4" />}
            value={login}
            onChange={(e) => {
              setLogin(e.target.value)
              setErro('')
            }}
          />
        </Field>
        <Field label="Senha" htmlFor="entrar-senha">
          <CampoSenha
            id="entrar-senha"
            name="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value)
              setErro('')
            }}
          />
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl px-0.5 py-0.5">
          <input
            type="checkbox"
            checked={manter}
            onChange={(e) => setManter(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]"
          />
          <span className="text-sm leading-tight">
            <span className="block font-medium text-ink-2">Manter conectado neste computador</span>
            <span className="mt-0.5 block text-xs text-muted">Não marque em computador usado por outras pessoas.</span>
          </span>
        </label>
        {(erro || faltam > 0) && <Alerta>{aviso || erro}</Alerta>}
        <Button
          variante="primary"
          type="submit"
          className="mt-1 w-full"
          icone={<LogIn className="h-4 w-4" />}
          disabled={enviando || faltam > 0}
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </TelaSessao>
  )
}

// ---- Primeiro acesso: criar o administrador ------------------------------------------------

/**
 * Nenhum usuário cadastrado. No próprio servidor (localhost), o administrador é criado aqui mesmo;
 * nos outros computadores, a tela explica como fazer.
 */
export function PrimeiroAcesso({ local }: { local: boolean }) {
  return local ? <CriarAdministrador /> : <SemAdministrador />
}

function CriarAdministrador() {
  const primeiroAcesso = useSessao((s) => s.primeiroAcesso)
  const [nome, setNome] = useState('')
  const [login, setLogin] = useState('')
  const [loginEditado, setLoginEditado] = useState(false)
  const [cargo, setCargo] = useState('Responsável técnico')
  const [nova, setNova] = useState('')
  const [repetir, setRepetir] = useState('')
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [erroNova, setErroNova] = useState('')
  const loginFinal = loginEditado ? login : sugerirLogin(nome)
  const dono = { login: loginFinal, nome }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    setErro('')
    if (!nome.trim()) return setErro('Informe o seu nome.')
    const erroLogin = validarLogin(normalizarLogin(loginFinal))
    if (erroLogin) return setErro(`Usuário: ${erroLogin}`)
    const p = problemasSenhaNova(nova, repetir, dono)
    if (p.nova || p.repetir || salvando) return
    setSalvando(true)
    try {
      await primeiroAcesso({ nome, login: loginFinal, senha: nova, cargo, registro: '' })
      toast.sucesso('Administrador criado', 'Agora cadastre a sua empresa em Configurações.')
    } catch (err) {
      setSalvando(false)
      if (err instanceof ErroApi && err.status === 400) setErroNova(err.message)
      else setErro(err instanceof Error ? err.message : 'Erro inesperado.')
    }
  }

  return (
    <TelaSessao
      largura="max-w-[460px]"
      rodape={<p>Os outros usuários (técnicos) você cadastra depois, em Usuários. Cada um com a sua senha.</p>}
    >
      <Titulo
        icone={<BadgeCheck className="h-5 w-5" />}
        titulo="Bem-vindo ao BC Calibração"
        texto="Este é o primeiro acesso. Crie a conta do administrador, que também assina os certificados."
      />
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <Field label="Seu nome completo" htmlFor="pa-nome" hint="Sai nos certificados que você autorizar.">
          <Input
            id="pa-nome"
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            icone={<User className="h-4 w-4" />}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usuário (para entrar)" htmlFor="pa-login">
            <Input
              id="pa-login"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={loginFinal}
              onChange={(e) => {
                setLogin(e.target.value)
                setLoginEditado(true)
              }}
            />
          </Field>
          <Field label="Cargo" htmlFor="pa-cargo">
            <Input id="pa-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </Field>
        </div>
        <SenhaNova
          idBase="pa"
          nova={nova}
          repetir={repetir}
          aoMudarNova={(v) => {
            setNova(v)
            setErroNova('')
          }}
          aoMudarRepetir={setRepetir}
          dono={dono}
          tentou={tentou}
          erroNova={erroNova}
        />
        {erro && <Alerta>{erro}</Alerta>}
        <Button variante="primary" type="submit" className="mt-1 w-full" disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar administrador e entrar'}
        </Button>
      </form>
    </TelaSessao>
  )
}

/** Nenhum usuário cadastrado e o navegador não está no servidor: explica onde criar o administrador. */
function SemAdministrador() {
  const verificar = useSessao((s) => s.verificar)
  const [conferindo, setConferindo] = useState(false)
  const [conferiu, setConferiu] = useState(false)
  const porta = typeof location !== 'undefined' ? location.port : ''

  const tentar = async () => {
    setConferindo(true)
    await verificar()
    // Se o administrador já existir, o App troca para a tela de entrada
    setConferindo(false)
    setConferiu(true)
  }

  return (
    <TelaSessao largura="max-w-[460px]">
      <Titulo
        icone={<UserCog className="h-5 w-5" />}
        titulo="Falta criar o administrador"
        texto="O sistema foi instalado, mas o administrador ainda não foi criado."
      />
      <ol className="flex flex-col gap-3">
        {[
          <>
            No <b className="font-semibold text-ink">computador onde o sistema foi instalado (servidor)</b>, abra o atalho{' '}
            <b className="font-semibold text-ink">BC Calibração</b> da Área de Trabalho
            {porta ? (
              <>
                {' '}
                (ou o endereço <b className="font-semibold text-ink">http://localhost:{porta}</b>)
              </>
            ) : null}
            .
          </>,
          'Lá aparece a tela para criar o administrador, com o nome e a senha.',
          'Volte aqui e clique em “Tentar de novo”.',
        ].map((passo, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-ink-2">
            <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-ink-2">
              {i + 1}
            </span>
            <span className="pt-0.5">{passo}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
        <Monitor className="h-4 w-4 shrink-0" />
        Por segurança, o administrador só pode ser criado no próprio servidor.
      </p>
      {conferiu && !conferindo && (
        <p className="mt-4 text-center text-[13px] text-muted" role="status">
          Ainda não há administrador cadastrado.
        </p>
      )}
      <Button
        variante="primary"
        className="mt-5 w-full"
        icone={<RefreshCw className={cn('h-4 w-4', conferindo && 'animate-spin')} />}
        disabled={conferindo}
        onClick={() => void tentar()}
      >
        {conferindo ? 'Verificando…' : 'Tentar de novo'}
      </Button>
    </TelaSessao>
  )
}

// ---- Troca obrigatória da senha temporária -----------------------------------------------------

export function TrocarSenhaObrigatoria() {
  const usuario = useSessao((s) => s.usuario)
  const senhaTemporaria = useSessao((s) => s.senhaTemporaria)
  const trocarSenha = useSessao((s) => s.trocarSenha)
  const sair = useSessao((s) => s.sair)
  // Sem a senha digitada em Entrar (página recarregada), pede a temporária de novo
  const [pedirAtual, setPedirAtual] = useState(!senhaTemporaria)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repetir, setRepetir] = useState('')
  const [tentou, setTentou] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroAtual, setErroAtual] = useState('')
  const [erroNova, setErroNova] = useState('')
  const [erro, setErro] = useState('')
  const [faltam, esperar, aviso] = useEspera()

  if (!usuario) return null
  const dono = { login: usuario.login, nome: usuario.nome }
  const primeiroNome = usuario.nome.trim().split(/\s+/)[0] ?? ''

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    setErro('')
    const senhaAtual = pedirAtual ? atual : senhaTemporaria
    if (!senhaAtual) return setErroAtual('Digite a senha temporária que você recebeu.')
    const p = problemasSenhaNova(nova, repetir, dono)
    if (p.nova || p.repetir || faltam || salvando) return
    setSalvando(true)
    try {
      await trocarSenha({ senhaAtual, senhaNova: nova })
      toast.sucesso('Senha criada', 'Use esta senha das próximas vezes.')
      // O App segue para o sistema
    } catch (err) {
      setSalvando(false)
      const codigo = err instanceof ErroApi ? err.dados.codigo : undefined
      const mensagem = err instanceof Error ? err.message : 'Erro inesperado.'
      if (codigo === 'SENHA_ATUAL') {
        setPedirAtual(true)
        setErroAtual(pedirAtual ? mensagem : 'A senha temporária não conferiu. Digite-a de novo.')
      } else if (codigo === 'SENHA_IGUAL' || (err instanceof ErroApi && err.status === 400)) setErroNova(mensagem)
      else {
        const r = erroAoEntrar(err)
        setErro(r.mensagem)
        esperar(r.esperarSegundos, r.porComputador)
      }
    }
  }

  return (
    <TelaSessao
      largura="max-w-[440px]"
      rodape={
        <p>Esta senha é só sua: não a passe para ninguém. Quem cuida dos usuários é o administrador; ele não vê a sua senha.</p>
      }
    >
      <Titulo
        icone={<KeyRound className="h-5 w-5" />}
        titulo="Crie sua senha"
        texto={
          <>
            Olá{primeiroNome ? `, ${primeiroNome}` : ''}. A senha que você recebeu é temporária: crie agora uma senha só sua para
            continuar.
          </>
        }
      />
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        <input type="text" name="username" autoComplete="username" value={usuario.login} readOnly hidden />
        {pedirAtual && (
          <Field
            label="Senha temporária"
            htmlFor="troca-atual"
            erro={erroAtual || null}
            hint="A que o administrador passou para você."
          >
            <CampoSenha
              id="troca-atual"
              autoComplete="current-password"
              autoFocus
              value={atual}
              onChange={(e) => {
                setAtual(e.target.value)
                setErroAtual('')
              }}
            />
          </Field>
        )}
        <SenhaNova
          idBase="troca"
          nova={nova}
          repetir={repetir}
          aoMudarNova={(v) => {
            setNova(v)
            setErroNova('')
          }}
          aoMudarRepetir={setRepetir}
          dono={dono}
          tentou={tentou}
          erroNova={erroNova}
          focarNova={!pedirAtual}
        />
        {(erro || faltam > 0) && <Alerta>{aviso || erro}</Alerta>}
        <Button variante="primary" type="submit" className="mt-1 w-full" disabled={salvando || faltam > 0}>
          {salvando ? 'Salvando…' : 'Salvar e continuar'}
        </Button>
        <Button variante="ghost" className="w-full" icone={<LogOut className="h-4 w-4" />} onClick={() => void sair()}>
          Sair
        </Button>
      </form>
    </TelaSessao>
  )
}

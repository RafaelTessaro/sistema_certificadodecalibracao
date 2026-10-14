import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { TelaConexao } from './components/layout/TelaConexao'
import { MinhaSenhaModal } from './components/sessao/MinhaSenhaModal'
import { RotaPermitida } from './components/sessao/RotaPermitida'
import { SessaoEncerradaModal } from './components/sessao/SessaoEncerradaModal'
import { ConfirmHost, Toaster } from './components/ui/Feedback'
import { definirAoErroSessao } from './lib/api'
import { BalancaDetalhe } from './pages/BalancaDetalhe'
import { Balancas } from './pages/Balancas'
import { CalibracaoDetalhe } from './pages/CalibracaoDetalhe'
import { CalibracaoForm } from './pages/CalibracaoForm'
import { Certificados } from './pages/Certificados'
import { ClienteDetalhe } from './pages/ClienteDetalhe'
import { Clientes } from './pages/Clientes'
import { Entrar, PrimeiroAcesso, TrocarSenhaObrigatoria } from './pages/Entrar'
import { Padroes } from './pages/Padroes'
import { Painel } from './pages/Painel'
import { Vencimentos } from './pages/Vencimentos'
import { Verificar } from './pages/Verificar'
import { useSessao } from './store/sessao'
import { useTempoReal } from './store/tempoReal'
import { aplicarTema, useUI } from './store/ui'

// Só o administrador abre estas páginas: são baixadas na primeira visita
const Usuarios = lazy(() => import('./pages/Usuarios').then((m) => ({ default: m.Usuarios })))
const Configuracoes = lazy(() => import('./pages/Configuracoes').then((m) => ({ default: m.Configuracoes })))

function Rotas() {
  const location = useLocation()
  return (
    <Layout>
      <Routes location={location}>
        <Route path="/" element={<Painel />} />
        <Route path="/certificados" element={<Certificados />} />
        <Route path="/calibracoes/nova" element={<CalibracaoForm />} />
        <Route path="/calibracoes/:id" element={<CalibracaoDetalhe />} />
        <Route path="/calibracoes/:id/editar" element={<CalibracaoForm />} />
        <Route path="/vencimentos" element={<Vencimentos />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<ClienteDetalhe />} />
        <Route path="/balancas" element={<Balancas />} />
        <Route path="/balancas/:id" element={<BalancaDetalhe />} />
        <Route path="/padroes" element={<Padroes />} />
        <Route
          path="/configuracoes"
          element={
            <RotaPermitida permissao="configuracoes">
              <Suspense fallback={null}>
                <Configuracoes />
              </Suspense>
            </RotaPermitida>
          }
        />
        <Route
          path="/usuarios"
          element={
            <RotaPermitida permissao="usuarios">
              <Suspense fallback={null}>
                <Usuarios />
              </Suspense>
            </RotaPermitida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

/** Já entrou (e a senha não é mais a temporária): as telas do sistema, com o tempo real ligado. */
function Sistema() {
  useEffect(() => useTempoReal.getState().iniciar(), [])
  return (
    <HashRouter>
      <Rotas />
      <MinhaSenhaModal />
    </HashRouter>
  )
}

/** Página pública de conferência do certificado (QR code), aberta sem entrar no sistema. */
function codigoVerificacao(): string | null {
  const m = location.hash.match(/^#\/verificar\/([A-Za-z0-9-]{4,40})/)
  return m ? m[1] : null
}

export default function App() {
  const tema = useUI((s) => s.tema)
  const estado = useSessao((s) => s.estado)
  const usuario = useSessao((s) => s.usuario)
  const semUsuarios = useSessao((s) => s.semUsuarios)
  const primeiroAcessoLocal = useSessao((s) => s.primeiroAcessoLocal)
  const erroSessao = useSessao((s) => s.erro)
  const expirou = useSessao((s) => s.expirou)
  const verificar = codigoVerificacao()

  // Quem está usando este navegador; 401 e "crie sua senha" vindos de qualquer requisição
  useEffect(() => {
    const sessao = useSessao.getState()
    definirAoErroSessao((codigo) =>
      codigo === 'SEM_SESSAO' ? useSessao.getState().sessaoEncerrada() : useSessao.getState().exigirTrocaSenha(),
    )
    void sessao.verificar()
    const pararBatimento = sessao.iniciarBatimento()
    return () => {
      pararBatimento()
      definirAoErroSessao(null)
    }
  }, [])

  // Entrou de novo depois do "Sua sessão terminou": volta o tempo real e busca o que mudou
  const expirouAntes = useRef(expirou)
  useEffect(() => {
    const voltou = expirouAntes.current && !expirou
    expirouAntes.current = expirou
    const { estado: e, usuario: u } = useSessao.getState()
    if (voltou && e === 'logado' && u && !u.trocarSenha) useTempoReal.getState().reconectar()
  }, [expirou])

  useEffect(() => {
    aplicarTema(tema)
    if (tema !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const ouvir = () => aplicarTema('system')
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [tema])

  let tela
  if (verificar) tela = <Verificar codigo={verificar} />
  else if (estado === 'verificando') tela = <TelaConexao modo="carregando" />
  else if (estado === 'erro')
    tela = <TelaConexao modo="erro" erro={erroSessao} aoTentar={() => void useSessao.getState().verificar()} />
  else if (estado === 'anonimo' || !usuario) tela = semUsuarios ? <PrimeiroAcesso local={!!primeiroAcessoLocal} /> : <Entrar />
  else if (usuario.trocarSenha) tela = <TrocarSenhaObrigatoria />
  else tela = <Sistema />

  return (
    <MotionConfig reducedMotion="user">
      {tela}
      {/* Por cima de tudo, sem desmontar a tela de baixo (o que estava sendo digitado continua) */}
      <SessaoEncerradaModal />
      <Toaster />
      <ConfirmHost />
    </MotionConfig>
  )
}

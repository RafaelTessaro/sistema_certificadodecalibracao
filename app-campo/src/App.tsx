// A raiz do app: abertura, cadastro (QR), PIN, e a tela de cima da pilha. Por cima de tudo: os avisos rápidos e, no modo
// entrega, o PIN pedido quando o app volta do segundo plano.

import { mudarEstado, useApp, telaAtual } from './app/loja.ts'
import { cn } from './componentes/base.tsx'
import { Logo } from './componentes/Logo.tsx'
import { FolhaDePin } from './componentes/PedidoDePin.tsx'
import { cancelarLeituraQr } from './plataforma/qr.ts'
import { TelaAssinaturaTecnico, TelaClientePendente, TelaEntregaCliente } from './telas/Assinaturas.tsx'
import { TelaCapa } from './telas/Capa.tsx'
import { TelaComprovante } from './telas/Comprovante.tsx'
import { TelaCriarPin } from './telas/CriarPin.tsx'
import { TelaMenu } from './telas/Menu.tsx'
import { TelaMinhasFolhas } from './telas/MinhasFolhas.tsx'
import { MolduraQr, TelaPareamento } from './telas/Pareamento.tsx'
import { TelaPasso } from './telas/Passo.tsx'
import { TelaRevisao } from './telas/Revisao.tsx'
import { TelaVerFolha } from './telas/VerFolha.tsx'

function Abertura() {
  return (
    <div className="fundo-app grid h-full place-items-center bg-bg">
      <Logo tamanho={64} />
    </div>
  )
}

function TelaDeCima() {
  const t = useApp(telaAtual)
  switch (t.nome) {
    case 'lista':
      return <TelaMinhasFolhas />
    case 'capa':
      return <TelaCapa envioId={t.envioId} />
    case 'passo':
      return <TelaPasso key={`${t.envioId}-${t.etapa}`} envioId={t.envioId} etapa={t.etapa} foco={t.foco} />
    case 'revisao':
      return <TelaRevisao envioId={t.envioId} />
    case 'assinaturaTecnico':
      return <TelaAssinaturaTecnico envioId={t.envioId} />
    case 'entregaCliente':
      return <TelaEntregaCliente envioId={t.envioId} />
    case 'clientePendente':
      return <TelaClientePendente envioId={t.envioId} />
    case 'comprovante':
      return <TelaComprovante envioId={t.envioId} />
    case 'verFolha':
      return <TelaVerFolha envioId={t.envioId} />
    case 'menu':
      return <TelaMenu />
    case 'pareamento':
      return <TelaPareamento motivo={t.motivo} />
  }
}

export function App() {
  const carregado = useApp((e) => e.carregado)
  const erro = useApp((e) => e.erroAoAbrir)
  const pareado = useApp((e) => !!e.pareamento)
  const temPin = useApp((e) => e.temPin)
  const lendoQr = useApp((e) => e.lendoQr)
  const pinAoVoltar = useApp((e) => e.pinAoVoltar)
  const aviso = useApp((e) => e.aviso)

  if (!carregado) return <Abertura />
  if (erro)
    return (
      <div className="p-6 text-[17px]" style={{ paddingTop: 'calc(24px + var(--topo))' }}>
        {erro}
      </div>
    )
  return (
    <>
      {/* Enquanto a câmera lê o QR, as telas ficam montadas, só escondidas: a tela que pediu a leitura continua viva para
          mostrar o erro (QR de outro sistema, código vencido, servidor fora do Wi-Fi, câmera sem permissão) */}
      <div className="contents" style={lendoQr ? { visibility: 'hidden' } : undefined} aria-hidden={lendoQr || undefined}>
        {!pareado ? <TelaPareamento motivo="PRIMEIRA" /> : !temPin ? <TelaCriarPin /> : <TelaDeCima />}
        {pinAoVoltar && (
          <FolhaDePin
            titulo="PIN do técnico"
            explicacao="O app saiu da tela durante a assinatura do cliente. Para continuar, o técnico digita o PIN."
            aoConfirmar={() => mudarEstado({ pinAoVoltar: false })}
          />
        )}
      </div>
      {lendoQr && <MolduraQr aoCancelar={cancelarLeituraQr} />}
      {aviso && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'entra fixed inset-x-4 z-[60] rounded-2xl px-4 py-3 text-[16px] font-medium shadow-float',
            aviso.tom === 'erro'
              ? 'bg-danger text-on-danger'
              : aviso.tom === 'aviso'
                ? 'bg-warning-soft text-warning-ink'
                : 'bg-ink text-bg',
          )}
          style={{ bottom: 'calc(96px + var(--base))' }}
          onClick={() => mudarEstado({ aviso: null })}
        >
          {aviso.texto}
        </div>
      )}
    </>
  )
}

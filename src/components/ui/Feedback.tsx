import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { create } from 'zustand'
import { cn } from '../../lib/cn'
import { numerosDeFolhaNoTexto } from '../../lib/semPartir'
import { useToasts } from '../../store/ui'
import { Button } from './Button'
import { Input } from './Form'
import { Modal } from './Modal'
import { SemPartir } from './SemPartir'

// ---- Toasts ----------------------------------------------------------------

export function Toaster() {
  // Com o mouse em cima, o toast não some (o longo fica o tempo de ler: `duracaoDoToast`)
  const { toasts, fechar, pausar, retomar } = useToasts()
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          // Os nºs dados e os de folha (FC-…, formato fixo) que o texto cita
          const inteiros = [...(t.inteiros ?? []), ...numerosDeFolhaNoTexto(`${t.titulo} ${t.descricao ?? ''}`)]
          const Icone =
            t.tipo === 'sucesso' ? CircleCheck : t.tipo === 'erro' ? CircleAlert : t.tipo === 'aviso' ? TriangleAlert : Info
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              role="status"
              onMouseEnter={() => pausar(t.id)}
              onMouseLeave={() => retomar(t.id)}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 pr-2.5 shadow-float"
            >
              <Icone
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0',
                  t.tipo === 'sucesso' && 'text-success',
                  t.tipo === 'erro' && 'text-danger',
                  t.tipo === 'info' && 'text-info',
                  t.tipo === 'aviso' && 'text-warning',
                )}
              />
              <div className="min-w-0 flex-1">
                {/* Os nºs da folha e do certificado (os que a pessoa confere na etiqueta) não quebram no meio */}
                <p className="text-sm font-medium text-ink">
                  <SemPartir texto={t.titulo} inteiros={inteiros} />
                </p>
                {t.descricao && (
                  <p className="mt-0.5 text-[13px] text-muted">
                    <SemPartir texto={t.descricao} inteiros={inteiros} />
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => fechar(t.id)}
                aria-label="Fechar aviso"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// ---- Confirmação -------------------------------------------------------------

interface PedidoConfirmacao {
  titulo: string
  descricao?: string
  /** Os nºs (da folha, do certificado) que o título e a descrição citam: não quebram no meio (`SemPartir`). */
  inteiros?: ReadonlyArray<string | null | undefined>
  confirmar?: string
  perigo?: boolean
  /** Exige que o usuário digite esta palavra para liberar o botão (ações irreversíveis). */
  digitar?: string
  /** Só um aviso, sem "Cancelar" (o botão só fecha). */
  soAviso?: boolean
  resolver: (ok: boolean) => void
}

const useConfirmacao = create<{ pedido: PedidoConfirmacao | null }>(() => ({ pedido: null }))

export function confirmar(opcoes: Omit<PedidoConfirmacao, 'resolver'>) {
  return new Promise<boolean>((resolver) => useConfirmacao.setState({ pedido: { ...opcoes, resolver } }))
}

/** Aviso que pede atenção (não some sozinho, como o toast): só o botão "Entendi". */
export function avisar(opcoes: { titulo: string; descricao?: string; inteiros?: PedidoConfirmacao['inteiros'] }) {
  return confirmar({ ...opcoes, confirmar: 'Entendi', soAviso: true })
}

export function ConfirmHost() {
  const pedido = useConfirmacao((s) => s.pedido)
  const responder = (ok: boolean) => {
    pedido?.resolver(ok)
    useTextoDigitado.setState({ texto: '' })
    useConfirmacao.setState({ pedido: null })
  }
  return (
    <Modal
      aberto={!!pedido}
      aoFechar={() => responder(false)}
      largura="max-w-md"
      titulo={pedido && (pedido.inteiros ? <SemPartir texto={pedido.titulo} inteiros={pedido.inteiros} /> : pedido.titulo)}
      descricao={
        pedido?.descricao &&
        (pedido.inteiros ? <SemPartir texto={pedido.descricao} inteiros={pedido.inteiros} /> : pedido.descricao)
      }
      icone={
        pedido?.perigo ? (
          <TriangleAlert className="h-5 w-5 text-danger" />
        ) : pedido?.soAviso ? (
          <TriangleAlert className="h-5 w-5 text-warning" />
        ) : undefined
      }
      rodape={pedido && <BotoesConfirmacao key={pedido.titulo} pedido={pedido} responder={responder} />}
    >
      {pedido?.digitar && <CampoDigitar palavra={pedido.digitar} />}
    </Modal>
  )
}

const useTextoDigitado = create<{ texto: string }>(() => ({ texto: '' }))

function CampoDigitar({ palavra }: { palavra: string }) {
  const texto = useTextoDigitado((s) => s.texto)
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
      <span>
        Para confirmar, digite <b className="font-semibold text-ink">{palavra}</b>
      </span>
      <Input autoFocus value={texto} onChange={(e) => useTextoDigitado.setState({ texto: e.target.value })} autoComplete="off" />
    </label>
  )
}

function BotoesConfirmacao({ pedido, responder }: { pedido: PedidoConfirmacao; responder: (ok: boolean) => void }) {
  const texto = useTextoDigitado((s) => s.texto)
  const liberado = !pedido.digitar || texto.trim().toUpperCase() === pedido.digitar.toUpperCase()
  return (
    <>
      {!pedido.soAviso && <Button onClick={() => responder(false)}>Cancelar</Button>}
      <Button
        variante={pedido.perigo ? 'danger' : 'primary'}
        onClick={() => responder(true)}
        disabled={!liberado}
        autoFocus={!pedido.digitar}
      >
        {pedido.confirmar ?? 'Confirmar'}
      </Button>
    </>
  )
}

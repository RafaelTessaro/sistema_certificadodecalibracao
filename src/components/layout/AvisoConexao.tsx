import { WifiOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useSessao } from '../../store/sessao'
import { useTempoReal } from '../../store/tempoReal'

/**
 * Faixa exibida quando a conexão em tempo real com o servidor cai.
 * Aguarda alguns segundos antes de aparecer para não piscar em reconexões rápidas.
 * Com a sessão terminada não aparece: o servidor está lá, o que falta é entrar de novo.
 */
export function AvisoConexao() {
  const conectadoDados = useTempoReal((s) => s.conectado || !s.jaConectou)
  const expirou = useSessao((s) => s.expirou)
  const conectado = conectadoDados || expirou
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    if (conectado) {
      const t = setTimeout(() => setMostrar(false), 0)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setMostrar(true), 4000)
    return () => clearTimeout(t)
  }, [conectado])

  return (
    <AnimatePresence initial={false}>
      {mostrar && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
          role="status"
        >
          <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-[13px] font-medium text-warning">
            <WifiOff className="h-4 w-4 shrink-0" />
            Sem conexão com o servidor — tentando reconectar. Alterações feitas agora podem não ser salvas.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// O aviso "FC-2026-00042 voltou do campo (Maurício)" (1.1.0): quando uma folha volta do celular, em qualquer tela. Usa o
// mesmo tempo real de sempre (a entrega avisa como mudança de calibração): a cada mudança, confere os registros mais novos
// e avisa os que chegaram desde que a tela abriu (os que já estavam lá não avisam).

import { useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import { novosRegistros, textoVoltou } from '../../lib/campo'
import { useTempoReal } from '../../store/tempoReal'
import { toast } from '../../store/ui'

/** Espera um pouco depois da mudança (várias seguidas viram uma consulta só). */
const ESPERA_MS = 1200

export function AvisoVoltouDoCampo() {
  const versao = useTempoReal((s) => s.versoes.calibracao + s.versoes.tudo)
  const conhecidos = useRef<Set<string> | null>(null)
  useEffect(() => {
    let valendo = true
    const t = setTimeout(
      () => {
        api.registrosCampo({ limite: 20 }).then(
          (r) => {
            if (!valendo) return
            const { novos, todos } = novosRegistros(conhecidos.current, r.registros)
            conhecidos.current = todos
            for (const g of novos) {
              const t = textoVoltou(g)
              toast.info(t.titulo, t.descricao, { inteiros: [g.ligadoA || g.numero] })
            }
          },
          () => {},
        )
      },
      conhecidos.current ? ESPERA_MS : 0,
    )
    return () => {
      valendo = false
      clearTimeout(t)
    }
  }, [versao])
  return null
}

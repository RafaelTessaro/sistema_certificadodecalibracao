// "Folha em branco" (Certificados e Nova calibração): imprimir, como sempre, ou enviar para o celular do técnico (1.1.0;
// a balança e o cliente são informados no local, classes II a IIII).

import { ChevronDown, Printer, Send } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../lib/api'
import { abrirFolhaCampo } from '../../lib/folhaCampo'
import { Button } from '../ui/Button'
import { Menu } from '../ui/Misc'
import { type AlvoEnvio, EnviarParaTecnicoModal } from './EnviarParaTecnicoModal'

export function BotaoFolhaEmBranco({ titulo }: { titulo?: string }) {
  const [alvo, setAlvo] = useState<AlvoEnvio | null>(null)
  return (
    <>
      <Menu
        alinhar="right"
        classePainel="w-[min(260px,calc(100vw-24px))]"
        gatilho={(props) => (
          <Button {...props} icone={<Printer className="h-4 w-4" />} title={titulo}>
            Folha em branco
            <ChevronDown className="h-3.5 w-3.5 text-muted" />
          </Button>
        )}
        itens={[
          {
            label: 'Imprimir folha em branco',
            icone: <Printer className="h-4 w-4" />,
            aoClicar: () => void abrirFolhaCampo(api.urlFolhaCampoAvulsa()),
          },
          {
            label: 'Enviar para o técnico',
            icone: <Send className="h-4 w-4" />,
            aoClicar: () => setAlvo({ tipo: 'avulsa' }),
          },
        ]}
      />
      <EnviarParaTecnicoModal
        alvo={alvo}
        aoFechar={() => setAlvo(null)}
        resumo="Folha em branco: o cliente e a balança são informados no local (classes II a IIII)."
      />
    </>
  )
}

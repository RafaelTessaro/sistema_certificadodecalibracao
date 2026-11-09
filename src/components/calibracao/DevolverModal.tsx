import { Loader2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { LIMITES } from '#shared/dominio.ts'
import { Button } from '../ui/Button'
import { Field, Textarea } from '../ui/Form'
import { Modal } from '../ui/Modal'

/** O signatário devolve a calibração sem autorizar, com a nota do que precisa ser visto (vai para quem enviou). */
export function DevolverModal({
  aberto,
  para,
  aoFechar,
  aoDevolver,
}: {
  aberto: boolean
  /** Quem pediu a autorização (recebe a nota), se houver pedido. */
  para?: string
  aoFechar: () => void
  aoDevolver: (nota: string) => Promise<void>
}) {
  const [nota, setNota] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [estavaAberto, setEstavaAberto] = useState(aberto)
  // Abriu de novo: começa sem a nota de antes
  if (aberto !== estavaAberto) {
    setEstavaAberto(aberto)
    if (aberto) setNota('')
  }
  const valida = nota.trim().length >= 3
  return (
    <Modal
      aberto={aberto}
      aoFechar={() => !salvando && aoFechar()}
      icone={<Undo2 className="h-5 w-5" />}
      titulo="Devolver sem autorizar"
      descricao={`A calibração volta para rascunho, com a sua nota${para ? ` para ${para}` : ''}. Depois de corrigida, ela é enviada de novo.`}
      rodape={
        <>
          <Button onClick={aoFechar} disabled={salvando}>
            Voltar
          </Button>
          <Button
            variante="primary"
            disabled={!valida || salvando}
            icone={salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            onClick={async () => {
              setSalvando(true)
              try {
                await aoDevolver(nota.trim())
              } finally {
                setSalvando(false)
              }
            }}
          >
            Devolver
          </Button>
        </>
      }
    >
      <Field label="O que precisa ser visto" hint="Ex.: “Confira a temperatura do 2º ensaio: está igual à do 1º”.">
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={LIMITES.motivo} autoFocus />
      </Field>
    </Modal>
  )
}

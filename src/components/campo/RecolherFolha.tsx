// Recolher a folha do celular fora do editor (1.1.0): a aba "Folhas de campo" e a ficha da balança, inclusive a folha
// avulsa (em branco, só do cliente, da balança sem calibração), que não tem editor. "Recolher do celular" (quem pode
// enviar pode recolher: na hora, se o celular ainda não baixou; senão, o pedido) e, só para o administrador, "Recolher à
// força" (o celular perdido, roubado ou descadastrado nunca responde ao pedido). O editor da calibração usa a mesma
// janela para o "Recolher à força" da faixa.

import { Loader2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { CelularDaFolha } from '#shared/tipos.ts'
import { api } from '../../lib/api'
import { acoesDeRecolher, celularDe, primeiroNome } from '../../lib/campo'
import { cn } from '../../lib/cn'
import { useEhAdmin } from '../../store/sessao'
import { useTempoReal } from '../../store/tempoReal'
import { avisarErro, toast } from '../../store/ui'
import { Button } from '../ui/Button'
import { Field, Textarea } from '../ui/Form'
import { Modal } from '../ui/Modal'
import { SemPartir } from '../ui/SemPartir'

/** A folha a recolher (o nº e o técnico) e se é à força. */
export interface PedidoRecolher {
  numero: string
  tecnico: string
  forcar: boolean
}

/** O motivo quando a pessoa não escreve nenhum ("Recolher do celular"; à força, o motivo é obrigatório). */
const MOTIVO_PADRAO = 'Recolhida pelo escritório'

/** "Recolher do celular" e, só para o administrador, "Recolher à força" (nada fora de ENVIADA e NO_CELULAR). */
export function AcoesRecolher({
  numero,
  c,
  aoPedir,
  className,
}: {
  numero: string
  c: CelularDaFolha
  aoPedir: (p: PedidoRecolher) => void
  className?: string
}) {
  const admin = useEhAdmin()
  const { recolher, forcar } = acoesDeRecolher(c, admin)
  if (!recolher && !forcar) return null
  return (
    <span className={cn('flex flex-wrap gap-x-3 gap-y-1', className)}>
      {recolher && (
        <button
          type="button"
          onClick={() => aoPedir({ numero, tecnico: c.tecnico, forcar: false })}
          className="cursor-pointer text-xs font-medium text-brand-ink hover:underline"
        >
          Recolher do celular
        </button>
      )}
      {forcar && (
        <button
          type="button"
          onClick={() => aoPedir({ numero, tecnico: c.tecnico, forcar: true })}
          title="Para o celular perdido, roubado ou que não vai voltar: a folha sai do celular no sistema na hora"
          className="cursor-pointer text-xs font-medium text-danger hover:underline"
        >
          Recolher à força
        </button>
      )}
    </span>
  )
}

/**
 * A janela de recolher, com o motivo (opcional em "Recolher do celular"; obrigatório à força). Montada só quando há
 * pedido (as listas também são desenhadas fora do navegador, nos testes).
 */
export function RecolherFolhaModal({
  pedido,
  aoFechar,
  aoRecolhido,
}: {
  pedido: PedidoRecolher
  aoFechar: () => void
  /** Depois de recolher (ou de pedir): a tela recarrega o que mostra. */
  aoRecolhido?: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const { numero, forcar } = pedido
  const nome = primeiroNome(pedido.tecnico)
  const valido = forcar ? motivo.trim().length > 0 : true
  const titulo = forcar ? `Recolher a folha ${numero} à força?` : `Recolher a folha ${numero} do celular?`
  const descricao = forcar
    ? 'Use quando o celular foi perdido, roubado ou não vai voltar. A folha sai do celular no sistema na hora e pode ser enviada para outro técnico. Se o celular entregar depois, o registro fica guardado com a marca “depois de recolhida”.'
    : 'Se o celular ainda não baixou, ela sai na hora. Se já baixou, o celular apaga na próxima conexão; se o técnico já começou, ela volta preenchida.'

  const recolher = async () => {
    if (!valido) return
    setSalvando(true)
    try {
      const r = await api.recolherFolha(numero, motivo.trim() || MOTIVO_PADRAO, forcar)
      useTempoReal.getState().mudou('calibracao')
      if (forcar)
        toast.sucesso(
          `Folha ${numero} recolhida à força`,
          'Ela já pode ser enviada para outro técnico. Se o celular entregar depois, o registro fica guardado com a marca “depois de recolhida”.',
          { inteiros: [numero] },
        )
      else
        toast.sucesso(
          r.imediato ? `Folha ${numero} recolhida` : `Pedido de recolher enviado para o ${celularDe(nome)}`,
          r.imediato
            ? 'O celular ainda não tinha baixado a folha. Ela já pode ser enviada de novo.'
            : 'O celular apaga a folha na próxima vez que estiver na rede da empresa. Se o técnico já começou, ela volta preenchida.',
          { inteiros: [numero] },
        )
      aoRecolhido?.()
      aoFechar()
    } catch (e) {
      avisarErro('Não foi possível recolher a folha', e)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      aoFechar={() => !salvando && aoFechar()}
      largura="max-w-md"
      icone={<Undo2 className={cn('h-5 w-5', forcar && 'text-danger')} />}
      titulo={<SemPartir texto={titulo} inteiros={[numero]} />}
      descricao={descricao}
      rodape={
        <>
          <Button onClick={aoFechar} disabled={salvando}>
            Voltar
          </Button>
          <Button
            variante={forcar ? 'danger' : 'primary'}
            disabled={!valido || salvando}
            icone={salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            onClick={() => void recolher()}
          >
            {forcar ? 'Recolher à força' : 'Recolher'}
          </Button>
        </>
      }
    >
      <Field
        label="Motivo"
        htmlFor="recolher-motivo"
        opcional={!forcar}
        obrigatorio={forcar}
        hint="Fica guardado junto com o envio da folha."
      >
        <Textarea
          id="recolher-motivo"
          autoFocus
          value={motivo}
          maxLength={300}
          onChange={(e) => setMotivo(e.target.value)}
          className="min-h-[60px]"
          placeholder={forcar ? 'Ex.: celular perdido' : 'Ex.: enviada para o técnico errado'}
        />
      </Field>
    </Modal>
  )
}

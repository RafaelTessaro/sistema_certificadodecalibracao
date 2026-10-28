// Página Certificados: os buracos da numeração explicados. Os nºs de certificado reservados na impressão da
// folha de campo que nunca vão ser emitidos (a folha não foi a campo, foi ligada a uma revisão…), com quando e
// o motivo, e os reservados em folhas ainda não ligadas a nenhuma calibração (a avulsa, a de uma calibração
// excluída: o nº segue o papel). O administrador registra como não utilizado o nº de uma folha perdida.

import { Ban, FileX2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { NumeroReservado } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { quandoDoNumero, separarNumeros } from '../lib/numeros'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Field, Textarea } from './ui/Form'
import { Modal } from './ui/Modal'

export function NumerosNaoUtilizados() {
  const { dados } = useConsulta('numeros-reservados', () => api.numerosReservados().then((r) => r.numeros), ['calibracao'])
  const podeDescartar = usePode('cancelarCertificado')
  const [descartando, setDescartando] = useState<NumeroReservado | null>(null)
  return (
    <>
      <ListaNumeros numeros={dados ?? []} podeDescartar={podeDescartar} aoDescartar={setDescartando} />
      <DescartarModal numero={descartando} aoFechar={() => setDescartando(null)} />
    </>
  )
}

/** A lista (recolhida), sem nada quando não há nº não utilizado nem reservado em folha não ligada. */
export function ListaNumeros({
  numeros,
  podeDescartar = false,
  aoDescartar,
}: {
  numeros: NumeroReservado[]
  podeDescartar?: boolean
  aoDescartar?: (n: NumeroReservado) => void
}) {
  const { naoUtilizados, avulsos } = separarNumeros(numeros)
  if (!naoUtilizados.length && !avulsos.length) return null
  return (
    <details className="group mt-4 rounded-xl border border-line bg-surface shadow-xs">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-[13px] font-medium text-ink-2 select-none hover:text-ink">
        <FileX2 className="h-4 w-4 text-muted" />
        Números não utilizados ({naoUtilizados.length})
        {avulsos.length > 0 && (
          <Badge tom="neutral" ponto={false}>
            {avulsos.length === 1 ? '1 reservado em folha não ligada' : `${avulsos.length} reservados em folhas não ligadas`}
          </Badge>
        )}
        <span className="ml-auto text-xs font-normal text-muted group-open:hidden">mostrar</span>
      </summary>
      <div className="border-t border-line">
        <p className="px-4 pt-3 text-[13px] text-muted">
          Cada nº de certificado é usado uma vez só. Os reservados na impressão da folha de campo que não vão ser emitidos ficam
          aqui, com o motivo: explicam os saltos na numeração.
        </p>
        {naoUtilizados.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted">Nenhum nº não utilizado.</p>
        ) : (
          <ul className="divide-y divide-line">
            {naoUtilizados.map((n) => (
              <li
                key={n.id}
                className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 text-[13px] sm:grid-cols-[minmax(132px,auto)_minmax(0,1fr)]"
              >
                <span className="tnum font-semibold text-ink">{n.numero}</span>
                <span className="min-w-0">
                  <span className="text-ink-2">{n.motivo || 'Sem motivo registrado.'}</span>
                  <span className="tnum block text-xs text-muted">{quandoDoNumero(n)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {avulsos.length > 0 && (
          <>
            <p className="border-t border-line px-4 pt-3 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
              Reservados em folhas ainda não ligadas
            </p>
            <ul className="divide-y divide-line">
              {avulsos.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]">
                  <span className="tnum min-w-[132px] font-semibold text-ink">{n.numero}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-2">
                      Folha <span className="tnum">{n.folha}</span>: o nº passa para a calibração a que ela for ligada.
                    </span>
                    <span className="tnum block text-xs text-muted">Impressa em {quandoDoNumero(n)}</span>
                  </span>
                  {podeDescartar && aoDescartar && (
                    <Button tamanho="sm" variante="ghost" icone={<Ban className="h-3.5 w-3.5" />} onClick={() => aoDescartar(n)}>
                      Não vai ser usada
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  )
}

/** A folha não ligada perdida ou inutilizada: o nº dela passa a não utilizado, com o motivo. */
function DescartarModal({ numero, aoFechar }: { numero: NumeroReservado | null; aoFechar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [ultimo, setUltimo] = useState(numero)
  // Guarda o último para o texto não sumir durante a animação de saída
  if (numero && numero !== ultimo) {
    setUltimo(numero)
    setMotivo('')
  }
  const n = numero ?? ultimo
  const valido = motivo.trim().length >= 5
  const descartar = async () => {
    if (!n || !valido) return
    setSalvando(true)
    try {
      await api.descartarNumero(n.id, motivo.trim())
      useTempoReal.getState().mudou('calibracao')
      toast.sucesso(`Nº ${n.numero} registrado como não utilizado`)
      aoFechar()
    } catch (e) {
      avisarErro('Não foi possível registrar o nº como não utilizado', e)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Modal
      aberto={!!numero}
      aoFechar={() => !salvando && aoFechar()}
      icone={<Ban className="h-5 w-5" />}
      titulo={n ? `O nº ${n.numero} não vai ser usado?` : ''}
      descricao={
        n
          ? `A folha ${n.folha} não vai ser ligada a nenhuma calibração (perdida, inutilizada…). O nº fica registrado como não utilizado e não vai para nenhum certificado.`
          : ''
      }
      rodape={
        <>
          <Button onClick={aoFechar} disabled={salvando}>
            Voltar
          </Button>
          <Button
            variante="danger"
            disabled={!valido || salvando}
            icone={salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            onClick={() => void descartar()}
          >
            Registrar como não utilizado
          </Button>
        </>
      }
    >
      <Field label="Motivo" hint="Fica registrado, e aparece na lista dos números não utilizados.">
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} autoFocus />
      </Field>
    </Modal>
  )
}

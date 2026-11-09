// Página Certificados: os buracos da numeração explicados. Os nºs de certificado reservados na impressão da
// folha de campo que nunca vão ser emitidos (a folha não foi a campo, foi ligada a uma revisão…), com quando e
// o motivo, e os reservados em folhas ainda não ligadas a nenhuma calibração (a avulsa, a de uma calibração
// excluída: o nº segue o papel). Qualquer pessoa reimprime a folha ainda não ligada (o PDF da primeira impressão, com
// os mesmos nºs); o administrador registra como não utilizado o nº de uma folha perdida. Todas as folhas impressas
// ficam na aba "Folhas de campo" da mesma página (`aoVerFolhas` leva até ela).

import { ArrowUp, Ban, FileX2, Loader2, Printer } from 'lucide-react'
import { useState } from 'react'
import { LIMITES } from '#shared/dominio.ts'
import type { NumeroReservado } from '#shared/tipos.ts'
import { api } from '../lib/api'
import { useConsulta } from '../lib/consulta'
import { abrirFolhaCampo } from '../lib/folhaCampo'
import { deQuemEaFolha, quandoDoNumero, separarNumeros } from '../lib/numeros'
import { usePode } from '../store/sessao'
import { useTempoReal } from '../store/tempoReal'
import { avisarErro, toast } from '../store/ui'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Field, Textarea } from './ui/Form'
import { Modal } from './ui/Modal'

/** `aoVerFolhas`: abre a aba "Folhas de campo" (o link fica junto dos reservados em folhas não ligadas). */
export function NumerosNaoUtilizados({ aoVerFolhas }: { aoVerFolhas?: () => void } = {}) {
  const { dados } = useConsulta('numeros-reservados', () => api.numerosReservados().then((r) => r.numeros), ['calibracao'])
  const podeDescartar = usePode('cancelarCertificado')
  const [descartando, setDescartando] = useState<NumeroReservado | null>(null)
  return (
    <>
      <ListaNumeros
        numeros={dados ?? []}
        podeDescartar={podeDescartar}
        aoDescartar={setDescartando}
        aoReimprimir={(n) => void abrirFolhaCampo(api.urlReimprimirFolha(n.folha))}
        aoVerFolhas={aoVerFolhas}
      />
      <DescartarModal numero={descartando} aoFechar={() => setDescartando(null)} />
    </>
  )
}

/**
 * A lista (recolhida), sem nada quando não há nº não utilizado nem reservado em folha não ligada. `aoReimprimir`: o
 * botão de reimprimir a folha ainda não ligada (igual à primeira impressão), para todos. `aoVerFolhas`: o link para a
 * aba com todas as folhas impressas.
 */
export function ListaNumeros({
  numeros,
  podeDescartar = false,
  aoDescartar,
  aoReimprimir,
  aoVerFolhas,
}: {
  numeros: NumeroReservado[]
  podeDescartar?: boolean
  aoDescartar?: (n: NumeroReservado) => void
  aoReimprimir?: (n: NumeroReservado) => void
  aoVerFolhas?: () => void
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
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-4 pt-3">
              <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                Reservados em folhas ainda não ligadas
              </p>
              {aoVerFolhas && (
                <button
                  type="button"
                  onClick={aoVerFolhas}
                  className="group inline-flex cursor-pointer items-center gap-0.5 text-xs font-medium text-brand-ink hover:underline"
                >
                  Ver todas as folhas de campo
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <ul className="divide-y divide-line">
              {avulsos.map((n) => {
                const deQuem = deQuemEaFolha(n)
                return (
                  // A mesma grade dos não utilizados: no celular, o nº, o texto e os botões um embaixo do outro
                  <li
                    key={n.id}
                    className="grid items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px] sm:grid-cols-[minmax(132px,auto)_minmax(0,1fr)_auto]"
                  >
                    <span className="tnum font-semibold text-ink">{n.numero}</span>
                    <span className="min-w-0">
                      <span className="text-ink-2">
                        Folha <span className="tnum whitespace-nowrap">{n.folha}</span>: o nº passa para a calibração a que ela
                        for ligada.
                      </span>
                      {deQuem && <span className="block truncate text-xs text-ink-2">{deQuem}</span>}
                      <span className="tnum block text-xs text-muted">Reservado em {quandoDoNumero(n)}</span>
                    </span>
                    {(aoReimprimir || (podeDescartar && aoDescartar)) && (
                      <span className="-ml-3 flex flex-wrap items-center gap-1 justify-self-start sm:ml-0 sm:justify-self-end">
                        {aoReimprimir && (
                          <Button
                            tamanho="sm"
                            variante="ghost"
                            icone={<Printer className="h-3.5 w-3.5" />}
                            title={`Reimprimir a folha ${n.folha}, igual à primeira impressão (os mesmos nºs)`}
                            onClick={() => aoReimprimir(n)}
                          >
                            Reimprimir
                          </Button>
                        )}
                        {podeDescartar && aoDescartar && (
                          <Button
                            tamanho="sm"
                            variante="ghost"
                            icone={<Ban className="h-3.5 w-3.5" />}
                            onClick={() => aoDescartar(n)}
                          >
                            Não vai ser usada
                          </Button>
                        )}
                      </span>
                    )}
                  </li>
                )
              })}
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
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={LIMITES.motivo} autoFocus />
      </Field>
    </Modal>
  )
}

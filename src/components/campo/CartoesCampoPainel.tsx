// Os cartões do Painel sobre o celular (1.1.0): "Voltaram do campo (n)" — as folhas que voltaram do celular e ainda não
// foram comparadas nem puxadas — e "Ainda no celular (n)" — as que passaram da data prevista e continuam no celular, com o
// último estado informado e o dia ("Finalizada · informado ontem"). A hora exata do celular fica só na lista dos
// celulares (Usuários), para quem cuida dos usuários.

import { ClipboardCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FolhaCampoNoPainel, ResumoCampoPainel } from '#shared/tipos.ts'
import { informadoEm, primeiroNome, quando, ROTULO_ESTADO_CELULAR, selosDasMarcas } from '../../lib/campo'
import { dataCurta } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { Card, CardHeader } from '../ui/Card'
import { RegistroCampo } from './preguicosos'

export function CartoesCampoPainel({ campo }: { campo: ResumoCampoPainel | undefined }) {
  const navegar = useNavigate()
  const [registro, setRegistro] = useState<string | null>(null)
  if (!campo || (!campo.voltaram.length && !campo.aindaNoCelular.length)) return null
  const abrir = (f: FolhaCampoNoPainel) => {
    if (f.calibracaoId) navegar(`/calibracoes/${f.calibracaoId}/editar`)
    else if (f.registroId) setRegistro(f.registroId)
    else navegar('/certificados?aba=folhas')
  }
  return (
    <>
      {campo.voltaram.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            icone={<ClipboardCheck className="h-4 w-4" />}
            titulo={`Voltaram do campo (${campo.voltaram.length})`}
            descricao="Compare ou puxe os dados na calibração"
          />
          <ul className="divide-y divide-line border-t border-line">
            {campo.voltaram.slice(0, 6).map((f) => (
              <li key={f.registroId ?? f.numero}>
                <button
                  type="button"
                  onClick={() => abrir(f)}
                  className="flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2/70"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      <span className="tnum">{f.numero}</span>
                      <span className="font-normal text-muted"> · {f.cliente || 'cliente informado no local'}</span>
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {primeiroNome(f.tecnico) || 'Técnico'} · {f.recebidoEm ? quando(f.recebidoEm) : ''}
                      {f.balanca ? ` · ${f.balanca}` : ''}
                    </span>
                    {(f.marcas?.length ?? 0) > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {selosDasMarcas(f.marcas ?? []).map((s) => (
                          <Badge key={s.rotulo} tom={s.tom} ponto={false} className="h-5 px-2 text-[11px]">
                            {s.rotulo}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {campo.aindaNoCelular.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            icone={<Smartphone className="h-4 w-4" />}
            titulo={`Ainda no celular (${campo.aindaNoCelular.length})`}
            descricao="A data prevista já passou"
          />
          <ul className="divide-y divide-line border-t border-line">
            {campo.aindaNoCelular.slice(0, 6).map((f) => {
              const estado = f.estadoCelular ? ROTULO_ESTADO_CELULAR[f.estadoCelular] : ''
              return (
                <li key={f.envioId}>
                  <button
                    type="button"
                    onClick={() => abrir(f)}
                    className="flex w-full cursor-pointer items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-2/70"
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning-dot" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        <span className="tnum">{f.numero}</span>
                        <span className="font-normal text-muted"> · {f.cliente || 'cliente informado no local'}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {primeiroNome(f.tecnico) || 'Técnico'}
                        {estado ? ` · ${estado}` : ''}
                        {f.estadoCelularEm ? ` · ${informadoEm(f.estadoCelularEm)}` : ''}
                      </span>
                    </span>
                    {f.dataPrevista && (
                      <span className="tnum shrink-0 text-xs whitespace-nowrap text-warning">
                        prevista {dataCurta(f.dataPrevista)}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      {registro !== null && <RegistroCampo registroId={registro} aoFechar={() => setRegistro(null)} />}
    </>
  )
}

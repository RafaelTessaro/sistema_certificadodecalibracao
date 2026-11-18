// O registro de campo congelado na emissão (`emissao.campo`, 1.1.0): a folha de onde os dados foram puxados do celular,
// os dados brutos que ficaram diferentes e a justificativa (com quem e quando). Só no sistema: o certificado não muda.

import { ClipboardList, Eye } from 'lucide-react'
import { useState } from 'react'
import type { CampoDaEmissao } from '#shared/campo/importar.ts'
import { dataHora } from '../../lib/format'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { RegistroCampo } from './preguicosos'

export function CampoDaEmissaoCard({ campo }: { campo: CampoDaEmissao }) {
  const [aberto, setAberto] = useState(false)
  return (
    <Card>
      <CardHeader
        icone={<ClipboardList className="h-4 w-4" />}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Registro de campo
            <span className="tnum font-medium whitespace-nowrap text-ink-2">{campo.numero}</span>
          </span>
        }
        descricao="Os dados foram importados do celular do técnico. Congelado na emissão (não sai no certificado)."
        acoes={
          <Button tamanho="sm" icone={<Eye className="h-3.5 w-3.5" />} onClick={() => setAberto(true)}>
            Ver registro
          </Button>
        }
      />
      <div className="flex flex-col gap-3 px-5 pb-5 text-[13px]">
        {campo.divergencias.length === 0 ? (
          <p className="text-ink-2">Os dados brutos do certificado são os mesmos do celular.</p>
        ) : (
          <>
            <p className="text-ink-2">
              {campo.divergencias.length}{' '}
              {campo.divergencias.length === 1 ? 'dado bruto ficou diferente' : 'dados brutos ficaram diferentes'} do celular:
            </p>
            <ul className="flex flex-col gap-1">
              {campo.divergencias.map((x) => (
                <li key={x.chave} className="flex flex-wrap gap-x-2 text-ink-2">
                  <span className="text-ink">{x.rotulo}:</span>
                  <span className="tnum">
                    celular {x.celular || '—'} → certificado <b className="font-semibold text-ink">{x.certificado || '—'}</b>
                  </span>
                </li>
              ))}
            </ul>
            <p className="rounded-xl bg-surface-2/60 px-3.5 py-2.5 text-ink">
              <span className="block text-xs text-muted">
                Justificativa{campo.justificadoPor ? ` · ${campo.justificadoPor}, ${dataHora(campo.justificadoEm)}` : ''}
              </span>
              <span className="mt-0.5 block whitespace-pre-line">{campo.justificativa || '—'}</span>
            </p>
          </>
        )}
      </div>
      {aberto && <RegistroCampo registroId={campo.registroId} aoFechar={() => setAberto(false)} />}
    </Card>
  )
}

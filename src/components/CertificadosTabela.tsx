import { ChevronRight, FileBadge2, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { CalibracaoResumo } from '#shared/tipos.ts'
import { dataCurta } from '../lib/format'
import { StatusCalibracaoBadge } from './Selos'
import { Linha, Tabela, Td, Th } from './ui/Table'

/** Endereço da tela de uma calibração: rascunho abre a edição; emitido, o certificado. */
export const rotaCalibracao = (k: Pick<CalibracaoResumo, 'id' | 'status'>) =>
  k.status === 'RASCUNHO' || k.status === 'REVISAO' ? `/calibracoes/${k.id}/editar` : `/calibracoes/${k.id}`

/** Lista de calibrações e certificados (usada na página Certificados, no cliente e na balança). */
export function CertificadosTabela({
  itens,
  ocultarCliente,
  ocultarBalanca,
}: {
  itens: CalibracaoResumo[]
  ocultarCliente?: boolean
  ocultarBalanca?: boolean
}) {
  const navegar = useNavigate()
  return (
    <Tabela>
      <thead>
        <tr>
          <Th>Certificado</Th>
          {!ocultarCliente && <Th>Cliente</Th>}
          {!ocultarBalanca && <Th className="max-md:hidden">Balança</Th>}
          <Th className="max-sm:hidden">Calibração</Th>
          <Th className="max-lg:hidden">OS</Th>
          <Th>Situação</Th>
          <Th className="w-8" />
        </tr>
      </thead>
      <tbody>
        {itens.map((k, i) => (
          <Linha key={k.id} indice={i} aoClicar={() => navegar(rotaCalibracao(k))}>
            <Td>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                  <FileBadge2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="tnum font-medium whitespace-nowrap text-ink">{k.numero || 'Em andamento'}</p>
                  <p className="text-xs whitespace-nowrap text-muted">
                    {k.dataEmissao ? `Emitido em ${dataCurta(k.dataEmissao)}` : `Atualizado em ${dataCurta(k.atualizadoEm)}`}
                    {k.envios > 0 && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5" title={`Enviado por e-mail ${k.envios}×`}>
                        <Mail className="h-3 w-3" />
                        {k.envios}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </Td>
            {!ocultarCliente && (
              <Td>
                <p className="max-w-[220px] truncate text-ink-2">{k.clienteNome}</p>
              </Td>
            )}
            {!ocultarBalanca && (
              <Td className="max-md:hidden">
                <p className="max-w-[260px] truncate text-ink-2">{k.balancaDescricao.replace(/^Balança /, '')}</p>
                {k.balancaSerie && <p className="tnum text-xs text-muted">Série {k.balancaSerie}</p>}
              </Td>
            )}
            <Td className="tnum max-sm:hidden">{dataCurta(k.dataCalibracao)}</Td>
            <Td className="tnum max-lg:hidden">{k.ordemServico || <span className="text-muted">—</span>}</Td>
            <Td>
              <StatusCalibracaoBadge status={k.status} />
            </Td>
            <Td>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Td>
          </Linha>
        ))}
      </tbody>
    </Tabela>
  )
}

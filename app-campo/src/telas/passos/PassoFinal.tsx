// Passo 8 · Encerramento: a data da calibração ● ("Hoje", pelo relógio do celular), a hora de término ("Agora") e o
// lembrete da etiqueta. Depois, a Revisão e as assinaturas.

import { Cartao } from '../../componentes/base.tsx'
import { CampoData, CampoInstante, useGravar } from '../../componentes/CamposDaFolha.tsx'
import type { PropsPasso } from '../Passo.tsx'

export function PassoFinal({ f }: PropsPasso) {
  const gravar = useGravar(f.envioId)
  const fin = f.registro.passos.final
  const folha = f.pacote?.folha
  return (
    <div className="flex flex-col gap-4 p-4">
      <CampoData
        rotulo="Data da calibração"
        obrigatorio
        valor={fin.dataCalibracao}
        aoMudar={(v) => void gravar((r) => void (r.passos.final.dataCalibracao = v))}
      />
      <CampoInstante
        rotulo="Hora de término"
        valor={fin.termino}
        aoMudar={(v) => void gravar((r) => void (r.passos.final.termino = v))}
      />
      {folha?.numeroCertificado && (
        <Cartao>
          <div className="text-[15px] font-semibold">Etiqueta</div>
          <p className="mt-1 text-[16px]">
            Copie <span className="numero-fc font-semibold">{folha.numeroCertificado}</span> no campo CERTIFICADO Nº da etiqueta.
          </p>
          {folha.avisoEtiqueta && <p className="mt-1 text-[14px] text-ink-2">{folha.avisoEtiqueta}</p>}
        </Cartao>
      )}
    </div>
  )
}

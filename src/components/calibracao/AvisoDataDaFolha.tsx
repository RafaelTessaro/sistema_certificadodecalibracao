// A data prevista impressa na folha que acabou de ser ligada: passou para a calibração (a data dela ainda era a do dia em
// que foi criada) ou é outra. O aviso fica nas etapas "Cliente e OS" e "Revisão e emissão" até a pessoa fechá-lo ou mudar
// a data (um toast some antes de ser lido), com o botão que troca a data num clique: volta para a de antes, ou usa a da
// folha. A data real é a que o técnico escreve no passo 8 da folha.

import { CalendarClock, X } from 'lucide-react'
import { avisoDataDaFolha } from '../../lib/folhaCampo'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { SemPartir } from '../ui/SemPartir'
import type { ContextoEtapa } from './contexto'
import { proximaAcompanhando } from './util'

export function AvisoDataDaFolha({ ctx, className }: { ctx: ContextoEtapa; className?: string }) {
  const { f, alterar, config, dataDaFolha, fecharDataDaFolha } = ctx
  const aviso = avisoDataDaFolha(dataDaFolha, f.dataCalibracao)
  if (!aviso || !dataDaFolha) return null
  const usar = (data: string) => {
    // A próxima calculada pela data (o padrão da empresa) acompanha, como ao digitar a data
    alterar((s) => ({
      ...s,
      dataCalibracao: data,
      proximaCalibracao: proximaAcompanhando(s.proximaCalibracao, s.dataCalibracao, data, config.mesesProximaPadrao),
    }))
    fecharDataDaFolha?.()
  }
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-warning sm:flex-row sm:items-start sm:gap-3',
        className,
      )}
    >
      <p className="flex min-w-0 flex-1 items-start gap-2 text-[13px] font-medium">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <SemPartir texto={aviso.texto} inteiros={[dataDaFolha.folha]} />
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-1.5 self-start">
        {aviso.botao && (
          <Button tamanho="sm" onClick={() => usar(aviso.botao!.data)}>
            {aviso.botao.rotulo}
          </Button>
        )}
        <Button
          tamanho="icon-sm"
          variante="ghost"
          onClick={() => fecharDataDaFolha?.()}
          aria-label="Fechar o aviso da data"
          title="Fechar (a data está certa)"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

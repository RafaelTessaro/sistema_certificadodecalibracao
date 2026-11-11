// As folhas de campo impressas para o cliente da calibração e ainda não ligadas a nenhuma calibração: se foi uma delas a
// usada no cliente, o nº de certificado dela já está na etiqueta da balança. O aviso aparece nas etapas "Cliente e OS" e
// "Revisão e emissão", sem impedir nada, e "Ligar esta folha" liga pelo fluxo de sempre (`ContextoEtapa.vincularFolha`).
// Na calibração que já tem a folha impressa para ela, o aviso diz qual, e ligar a do cliente no lugar dela pede
// confirmação (a própria fica como não usada e o nº dela, como não utilizado). Os nºs nunca quebram no meio.

import { Link2, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { FolhaNaoLigada } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { confirmacaoLigarNoLugar, type FolhaPropria, textoFolhaNaoLigada } from '../../lib/folhaCampo'
import { usePode } from '../../store/sessao'
import { Button } from '../ui/Button'
import { confirmar } from '../ui/Feedback'
import { SemPartir } from '../ui/SemPartir'

export function AvisoFolhasNaoLigadas({
  folhas,
  aoLigar,
  propria = null,
  className,
}: {
  folhas: readonly FolhaNaoLigada[] | undefined
  /** Liga a folha pelo nº (true se ligou). */
  aoLigar: (numero: string) => Promise<boolean>
  /** A folha impressa para a própria calibração (`folhaPropriaDa`), ou null. */
  propria?: FolhaPropria | null
  className?: string
}) {
  const [ligando, setLigando] = useState<string | null>(null)
  // Só o administrador marca a folha que não foi usada ("Não vai ser usada"): o aviso diz a quem pedir
  const administrador = usePode('cancelarCertificado')
  if (!folhas?.length) return null
  const ligar = async (f: FolhaNaoLigada) => {
    // No lugar da folha impressa para a calibração: confirma antes, com os nºs e como desfazer
    if (propria) {
      const c = confirmacaoLigarNoLugar(f, propria)
      const inteiros = [f.numero, f.numeroCertificado, propria.numero, propria.numeroCertificado]
      if (!(await confirmar({ ...c, inteiros }))) return
    }
    setLigando(f.numero)
    try {
      await aoLigar(f.numero)
    } finally {
      setLigando(null)
    }
  }
  return (
    <div className={cn('rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-warning', className)}>
      <ul className="flex flex-col gap-2.5">
        {folhas.map((f) => (
          <li key={f.numero} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <p className="flex min-w-0 flex-1 items-start gap-2 text-[13px] font-medium">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <SemPartir
                  texto={textoFolhaNaoLigada(f, administrador, propria)}
                  inteiros={[f.numero, f.numeroCertificado, propria?.numero, propria?.numeroCertificado]}
                />
              </span>
            </p>
            <Button
              tamanho="sm"
              icone={ligando === f.numero ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              disabled={!!ligando}
              onClick={() => void ligar(f)}
              className="shrink-0 self-start"
            >
              Ligar esta folha
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

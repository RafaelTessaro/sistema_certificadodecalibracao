import { Ellipsis } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { type ItemMenu, Menu } from '../ui/Misc'

/** Ação do menu "…": com `motivo`, aparece desabilitada, com o motivo ao passar o mouse e logo abaixo do nome. */
export type AcaoMenu = ItemMenu

/**
 * Menu "…" de ações de uma linha: o `Menu` de ui/Misc (com o teclado e os papéis ARIA), com itens desabilitados que
 * dizem o motivo (ex.: "Você não pode excluir a própria conta").
 */
export function MenuAcoes({ itens, rotulo = 'Ações' }: { itens: Array<AcaoMenu | 'sep'>; rotulo?: string }) {
  return (
    <Menu
      classePainel="w-[min(300px,calc(100vw-24px))]"
      gatilho={(props, aberto) => (
        <Button
          variante="ghost"
          tamanho="icon-sm"
          {...props}
          aria-label={rotulo}
          className={cn(aberto && 'bg-surface-2 text-ink')}
        >
          <Ellipsis className="h-4 w-4" />
        </Button>
      )}
      itens={itens}
    />
  )
}

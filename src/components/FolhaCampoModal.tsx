import { ChevronRight, FilePlus2, Printer, RotateCcw } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import type { FolhaCampoImpressa } from '#shared/tipos.ts'
import { cn } from '../lib/cn'
import { dataDaFolha, escolhaPorAbertura, TEXTO_FOLHA_NOVA } from '../lib/folhaCampo'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

export type EscolhaFolha = 'reimprimir' | 'nova'

/**
 * A calibração já tem folha de campo: reimprimir a mesma (o mesmo nº é sempre o mesmo papel, igual à primeira
 * impressão) ou imprimir uma folha nova, com nº de folha novo, o mesmo nº de certificado e os dados atuais (a de
 * antes fica registrada como não usada). Só para a folha impressa para a calibração (`temFolhaNova`): a avulsa
 * ligada e a da correção só se reimprimem. Aberta com `folha`; `foco` é a opção que já vem selecionada (a do botão
 * que abriu).
 */
export function FolhaCampoModal({
  folha,
  foco = 'reimprimir',
  aoEscolher,
  aoFechar,
}: {
  folha: FolhaCampoImpressa | null
  foco?: EscolhaFolha
  aoEscolher: (e: EscolhaFolha) => void
  aoFechar: () => void
}) {
  const numero = folha?.numero ?? ''
  const data = folha ? dataDaFolha(folha.impressaEm) : ''
  // Uma escolha por abertura: na animação de saída a janela ainda responde, e o clique duplo em "Folha nova" reservaria
  // duas folhas (a primeira já registrada como não usada)
  const janela = useRef(escolhaPorAbertura())
  const aberta = !!folha
  useEffect(() => {
    if (aberta) janela.current.abrir()
  }, [aberta])
  const escolher = (e: EscolhaFolha) => {
    if (aberta) janela.current.escolher(() => aoEscolher(e))
  }
  // O nº nunca quebra no meio ("FC-" numa linha e o resto na outra)
  const numeroFc = <span className="tnum whitespace-nowrap">{numero}</span>
  return (
    <Modal
      aberto={!!folha}
      aoFechar={aoFechar}
      largura="max-w-md"
      icone={<Printer className="h-5 w-5" />}
      titulo="Folha de campo já impressa"
      descricao={
        folha && (
          <>
            A <span className="tnum font-medium whitespace-nowrap text-ink-2">{numero}</span> foi impressa em {data}
            {folha.impressaPor ? ` por ${folha.impressaPor}` : ''}. O mesmo nº é sempre o mesmo papel.
          </>
        )
      }
      rodape={<Button onClick={aoFechar}>Cancelar</Button>}
    >
      <div className="flex flex-col gap-2" role="group" aria-label="O que imprimir">
        <Opcao
          icone={<RotateCcw className="h-4 w-4" />}
          titulo={<>Reimprimir a {numeroFc}</>}
          texto={`Igual à impressa em ${data}. Use se o papel se perdeu ou estragou.`}
          destaque
          autoFocus={foco === 'reimprimir'}
          aoClicar={() => escolher('reimprimir')}
        />
        <Opcao
          icone={<FilePlus2 className="h-4 w-4" />}
          titulo="Folha nova (novo nº)"
          texto={
            <>
              {TEXTO_FOLHA_NOVA}: nº de folha novo, o mesmo nº de certificado. A {numeroFc} fica registrada como não usada: só se
              ela ainda não foi a campo.
            </>
          }
          autoFocus={foco === 'nova'}
          aoClicar={() => escolher('nova')}
        />
      </div>
    </Modal>
  )
}

function Opcao({
  icone,
  titulo,
  texto,
  destaque,
  autoFocus,
  aoClicar,
}: {
  icone: ReactNode
  titulo: ReactNode
  texto: ReactNode
  destaque?: boolean
  autoFocus?: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      autoFocus={autoFocus}
      className={cn(
        'group flex w-full cursor-pointer items-start gap-3 rounded-xl border border-line-strong/80 bg-surface px-3.5 py-3 text-left',
        'transition-[border-color,background-color,box-shadow] duration-150 hover:border-line-strong hover:bg-surface-2/60',
        'focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]/40',
      )}
    >
      <span
        className={cn(
          'mt-px flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-lg',
          destaque ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-2',
        )}
      >
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="tnum block text-sm font-semibold text-ink">{titulo}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{texto}</span>
      </span>
      <ChevronRight className="mt-[6px] h-4 w-4 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-[2px]" />
    </button>
  )
}

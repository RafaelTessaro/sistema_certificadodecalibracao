import { Check, Minus, PenLine, ShieldCheck } from 'lucide-react'
import { LISTA_PERMISSOES, NOME_NIVEL, PERMISSOES, RESUMO_NIVEL, ROTULO_PERMISSAO } from '#shared/permissoes.ts'
import type { NivelUsuario } from '#shared/tipos.ts'
import { cn } from '../../lib/cn'
import { Card, CardHeader } from '../ui/Card'
import { ICONE_NIVEL } from './niveis'

const NIVEIS: NivelUsuario[] = ['ADMIN', 'COMUM']

type Celula = 'sim' | 'nao' | 'signatario'

function Marca({ valor, nivel }: { valor: Celula; nivel: NivelUsuario }) {
  if (valor === 'signatario')
    return (
      <span
        role="img"
        aria-label={`${NOME_NIVEL[nivel]}: só se for signatário`}
        className="inline-flex h-6 items-center gap-1 rounded-full bg-info-soft px-2 text-[11.5px] font-medium whitespace-nowrap text-info"
      >
        <PenLine className="h-3 w-3" />
        <span className="max-sm:hidden">Se signatário</span>
        <span className="sm:hidden">Sign.</span>
      </span>
    )
  const pode = valor === 'sim'
  return (
    <span
      role="img"
      aria-label={`${NOME_NIVEL[nivel]}: ${pode ? 'pode' : 'não pode'}`}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-full',
        pode ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted',
      )}
    >
      {pode ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : <Minus className="h-3.5 w-3.5" />}
    </span>
  )
}

/**
 * "O que cada nível pode": a tabela de shared/permissoes.ts. O servidor barra as ações proibidas;
 * emitir (autorizar) certificados não depende do nível, e sim da marcação de signatário.
 */
export function PermissoesNiveis() {
  const linhas: Array<{ rotulo: string; detalhe?: string; valores: Record<NivelUsuario, Celula>; base?: boolean }> = [
    {
      rotulo: 'Clientes, balanças, padrões e calibrações',
      detalhe: 'Cadastrar, alterar, calibrar, ver e enviar certificados e lembretes',
      valores: { ADMIN: 'sim', COMUM: 'sim' },
      base: true,
    },
    {
      rotulo: 'Emitir certificados',
      detalhe: 'Revisar e autorizar a emissão: só quem está marcado como signatário',
      valores: { ADMIN: 'signatario', COMUM: 'signatario' },
      base: true,
    },
    ...LISTA_PERMISSOES.map((p) => ({
      rotulo: ROTULO_PERMISSAO[p],
      valores: {
        ADMIN: PERMISSOES[p].includes('ADMIN') ? ('sim' as const) : ('nao' as const),
        COMUM: PERMISSOES[p].includes('COMUM') ? ('sim' as const) : ('nao' as const),
      },
    })),
  ]
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icone={<ShieldCheck className="h-4 w-4" />}
        titulo="O que cada nível pode"
        descricao="O servidor recusa as ações proibidas ao técnico, mesmo que ele tente por outro caminho. Emitir certificados depende de a pessoa ser signatária, em qualquer nível."
      />
      <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2">
        {NIVEIS.map((n) => {
          const Icone = ICONE_NIVEL[n]
          return (
            <div key={n} className="rounded-xl border border-line bg-surface-2/50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icone className={cn('h-4 w-4', n === 'ADMIN' ? 'text-brand' : 'text-ink-2')} />
                {NOME_NIVEL[n]}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-ink-2">{RESUMO_NIVEL[n]}</p>
            </div>
          )
        })}
      </div>
      <div className="scroll-fino overflow-x-auto border-t border-line">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="border-b border-line bg-surface-2/70 px-5 py-2.5 text-left text-[12px] font-medium text-muted">
                O que
              </th>
              {NIVEIS.map((n) => (
                <th
                  key={n}
                  className="w-16 border-b border-line bg-surface-2/70 px-2 py-2.5 text-center text-[12px] font-medium whitespace-nowrap text-muted last:pr-5 sm:w-36 sm:px-3"
                >
                  {/* No celular, "Admin." deixa mais espaço para o texto de cada linha */}
                  <span className="sm:hidden" title={NOME_NIVEL[n]}>
                    {n === 'ADMIN' ? 'Admin.' : NOME_NIVEL[n]}
                  </span>
                  <span className="max-sm:hidden">{NOME_NIVEL[n]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="group/linha">
                <td className="border-b border-line px-5 py-2.5 text-[13px] group-last/linha:border-b-0">
                  <span className={l.base ? 'font-medium text-ink' : 'text-ink-2'}>{l.rotulo}</span>
                  {l.detalhe && <span className="mt-0.5 block text-xs text-muted">{l.detalhe}</span>}
                </td>
                {NIVEIS.map((n) => (
                  <td
                    key={n}
                    className="border-b border-line px-2 py-2.5 text-center group-last/linha:border-b-0 last:pr-5 sm:px-3"
                  >
                    <Marca valor={l.valores[n]} nivel={n} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

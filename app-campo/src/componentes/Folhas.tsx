// Peças das telas da folha: a fileira de bolinhas (✓ feito, ◉ atual, ○ a fazer, ▲ com aviso), "Confere / Algo
// diferente…", o resumo do cliente e a folha da Anotação.

import { useEffect, useRef, useState } from 'react'
import type { EtapaFolha, SituacaoEtapa } from '../../../shared/campo/progresso.ts'
import { formatarInstante } from '../../../shared/campo/registro.ts'
import type { ResumoDoCliente } from '../../../shared/campo/resumoCliente.ts'
import type { AnotacaoCampo, ConferenciaCampo, NumeroPasso, TipoAnotacao } from '../../../shared/campo/tipos.ts'
import { ROTULO_TIPO_ANOTACAO, TIPOS_ANOTACAO } from '../../../shared/campo/tipos.ts'
import { novoId } from '../../../shared/id.ts'
import { useFecharNoVoltar } from '../app/camadas.ts'
import { AreaTexto, Botao, cn, Escolha, Linha } from './base.tsx'

export function Bolinhas({ etapas, atual, aoIr }: { etapas: SituacaoEtapa[]; atual: EtapaFolha; aoIr: (e: EtapaFolha) => void }) {
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 py-2" aria-label="Passos da folha">
      {etapas.map((e) => {
        const eh = e.etapa === atual
        const simbolo = e.comAviso ? '▲' : e.completa ? '✓' : eh ? '◉' : '○'
        return (
          <button
            key={e.etapa}
            type="button"
            onClick={() => aoIr(e.etapa)}
            aria-label={`${e.titulo}${e.completa ? ', completo' : ''}${e.comAviso ? ', com aviso' : ''}${eh ? ', atual' : ''}`}
            aria-current={eh ? 'step' : undefined}
            className={cn(
              'flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-xl text-[13px] font-semibold',
              eh ? 'bg-brand-soft text-brand-ink ring-2 ring-brand' : 'text-ink-2 active:bg-surface-2',
              e.comAviso && 'text-warning-ink',
              e.completa && !e.comAviso && !eh && 'text-brand-ink',
            )}
          >
            <span className="text-[16px] leading-none">{simbolo}</span>
            <span className="leading-none">{e.etapa === 'ambienteFim' ? '4·fim' : e.passo}</span>
          </button>
        )
      })}
    </nav>
  )
}

/**
 * Um dado impresso: "Confere" ou "Algo diferente…" (o dado original nunca é editado: o certo vai numa anotação). Nos
 * metrológicos (d, e, Max, Min, classe, unidade), "Algo diferente…" pede o valor visto em campo, que os avisos usam.
 */
export function ConfereOuDiferente({
  item,
  metrologico,
  aoMudar,
  aoAnotar,
}: {
  item: ConferenciaCampo
  metrologico: boolean
  aoMudar: (c: Pick<ConferenciaCampo, 'confere' | 'observado'>) => void
  aoAnotar: () => void
}) {
  const [observado, setObservado] = useState(item.observado ?? '')
  // O valor visto grava ao sair do campo e também quando o campo sai da tela (o voltar do Android tira a tela sem o blur)
  const pendente = useRef<string | null>(null)
  const gravar = useRef(aoMudar)
  useEffect(() => {
    gravar.current = aoMudar
  })
  useEffect(
    () => () => {
      if (pendente.current !== null) gravar.current({ confere: false, observado: pendente.current })
    },
    [],
  )
  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="text-[14px] text-ink-2">{item.rotulo}</div>
      <div className="mb-2 text-[17px] font-medium">{item.mostrado || '—'}</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => aoMudar({ confere: true, observado: undefined })}
          className={cn(
            'min-h-[48px] flex-1 rounded-xl border-2 text-[16px] font-medium',
            item.confere === true ? 'border-brand bg-brand-soft text-brand-ink' : 'border-campo bg-surface',
          )}
        >
          Confere{item.confere === true ? ' ✓' : ''}
        </button>
        <button
          type="button"
          onClick={() => {
            aoMudar({ confere: false, observado: metrologico ? observado : undefined })
            if (!metrologico) aoAnotar()
          }}
          className={cn(
            'min-h-[48px] flex-1 rounded-xl border-2 text-[16px] font-medium',
            item.confere === false ? 'border-warning bg-warning-soft text-warning-ink' : 'border-campo bg-surface',
          )}
        >
          Algo diferente…
        </button>
      </div>
      {item.confere === false && metrologico && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="block">
            <span className="mb-1 block text-[15px] font-medium text-ink-2">
              Valor visto em campo (com a unidade, ex.: 0,01 kg)
            </span>
            <input
              value={observado}
              maxLength={60}
              onChange={(e) => {
                setObservado(e.target.value)
                pendente.current = e.target.value
              }}
              onBlur={() => {
                pendente.current = null
                aoMudar({ confere: false, observado })
              }}
              className="min-h-[52px] w-full rounded-xl border-2 border-campo bg-surface px-3 text-[17px] outline-none focus:border-brand"
            />
          </label>
          <Botao variante="texto" onClick={aoAnotar} className="self-start">
            ✎ Anotar o que está diferente
          </Botao>
        </div>
      )}
    </div>
  )
}

/** As condições do serviço que quem acompanhou vê antes de assinar (lista fechada: nunca leituras nem resultados). */
export function ResumoCliente({ resumo, numero }: { resumo: ResumoDoCliente; numero: string }) {
  const amb = (c: ResumoDoCliente['ambiente']['inicio']) =>
    c ? [c.temperatura, c.umidade, c.pressao].filter(Boolean).join(' · ') : '—'
  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-4">
      <div className="text-[14px] text-ink-2">Balanças.com · Folha de campo</div>
      <div className="numero-fc mb-2 text-[17px] font-semibold">{numero}</div>
      <Linha rotulo="Cliente">{resumo.cliente || '—'}</Linha>
      <Linha rotulo="Balança">{resumo.balanca || '—'}</Linha>
      <Linha rotulo="Local">{resumo.local || '—'}</Linha>
      <Linha rotulo="Data e horário">{resumo.periodo.texto || '—'}</Linha>
      <Linha rotulo="Ambiente no início">{amb(resumo.ambiente.inicio)}</Linha>
      <Linha rotulo="Ambiente no fim">{amb(resumo.ambiente.fim)}</Linha>
      <Linha rotulo="Técnico">{resumo.tecnico}</Linha>
      {resumo.observacoes.length > 0 && (
        <div className="pt-2">
          <div className="text-[15px] text-ink-2">Observações</div>
          {resumo.observacoes.map((o, i) => (
            <p key={i} className="mt-1 text-[16px]">
              {o.texto}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** A Anotação de qualquer passo: tipo, texto (o ditado do teclado do Android serve) e a rubrica automática. */
export function FolhaAnotacao({
  passo,
  campo = '',
  tipoInicial = 'OBSERVACAO',
  textoInicial = '',
  tecnico,
  agora,
  aoSalvar,
  aoCancelar,
}: {
  passo: NumeroPasso
  campo?: string
  tipoInicial?: TipoAnotacao
  textoInicial?: string
  tecnico: string
  agora: () => string
  aoSalvar: (a: AnotacaoCampo) => void
  aoCancelar: () => void
}) {
  const [tipo, setTipo] = useState<TipoAnotacao>(tipoInicial)
  const [texto, setTexto] = useState(textoInicial)
  useFecharNoVoltar(aoCancelar)
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/45" role="dialog" aria-modal="true">
      <div className="entra rounded-t-3xl bg-surface px-4 pt-3" style={{ paddingBottom: 'calc(16px + var(--base))' }}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line-strong" />
        <h2 className="mb-3 text-[20px] font-semibold">Anotação · passo {passo}</h2>
        <div className="flex flex-col gap-3">
          <Escolha
            opcoes={TIPOS_ANOTACAO.map((t) => ({ valor: t, texto: ROTULO_TIPO_ANOTACAO[t] }))}
            valor={tipo}
            aoEscolher={setTipo}
          />
          <AreaTexto rotulo="O que anotar" valor={texto} aoMudar={setTexto} autoFoco linhas={4} />
          <p className="text-[14px] text-ink-2">
            Rubrica: {tecnico} · {formatarInstante(agora())}
          </p>
        </div>
        <div className="mt-4 flex gap-3">
          <Botao className="flex-1" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao
            variante="principal"
            className="flex-1"
            disabled={!texto.trim()}
            onClick={() => aoSalvar({ id: novoId(), passo, tipo, campo, texto: texto.trim(), em: agora() })}
          >
            Salvar
          </Botao>
        </div>
      </div>
    </div>
  )
}
